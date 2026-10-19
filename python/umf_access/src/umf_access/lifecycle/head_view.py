# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed metadata projection. Original plans and seed contents stay private."""
from __future__ import annotations

from typing import Any
from uuid import uuid4

from .probe import _Query, _run
from .catalog import _COLUMNS, CatalogError, _all, _columns, _execute, _one, _q
from .ledger_schema import HISTORY

HEAD = 'umf_lifecycle_head'


def _create_head_view(connection: Any, source: dict[str, Any], name: str = HEAD) -> None:
    cfg = source['configuration']
    relation = _q(cfg['schema'])+'.'+_q(name)
    # No user function, unqualified operator, original plan or seed projection.
    _execute(connection, 'CREATE VIEW '+relation+''' WITH (security_barrier=true,security_invoker=false) AS
SELECT position AS generation,entry_digest AS head_digest,plan_digest,
pg_catalog.jsonb_extract_path_text(payload,'plan','toBundleDigest') AS bundle_digest,
pg_catalog.jsonb_extract_path_text(payload,'plan','next','sourceDigest') AS source_digest,
pg_catalog.jsonb_extract_path_text(payload,'plan','next','configurationDigest') AS configuration_digest,
pg_catalog.jsonb_extract_path(payload,'witness') AS native_witness
FROM '''+_q(cfg['schema'])+'.'+_q(HISTORY)+' ORDER BY position DESC LIMIT 1')
    _execute(connection,'REVOKE ALL ON TABLE '+relation+' FROM PUBLIC')
    _execute(connection,'GRANT SELECT ON TABLE '+relation+' TO '+_q(cfg['personRole'])+', '+_q(cfg['batchRole']))


def _head_oid(connection: Any, schema: str, name: str = HEAD) -> int | None:
    return _run(connection, _head_oid_steps(schema,name))


def _head_oid_steps(schema: str, name: str=HEAD):
    row = (yield _Query('one', 'SELECT c.oid FROM pg_catalog.pg_class c\nJOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname=%s', (schema, name)))
    return None if row is None else row[0]


def _head_shape(connection: Any, schema: str, name: str = HEAD) -> dict[str, Any] | None:
    return _run(connection, _head_shape_steps(schema,name))


def _head_shape_steps(schema: str, name: str=HEAD):
    oid = (yield from _head_oid_steps(schema, name))
    if oid is None:
        return None
    state = (yield _Query('one', 'SELECT c.relkind,c.relpersistence,c.relowner,c.relrowsecurity,\nc.relforcerowsecurity,c.relispartition,c.relhassubclass,c.relhasrules,c.relreplident,\nARRAY(SELECT opt FROM pg_catalog.unnest(c.reloptions) opt ORDER BY opt),\nEXISTS(SELECT FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid),\nEXISTS(SELECT FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid),\nEXISTS(SELECT FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid),\nEXISTS(SELECT FROM pg_catalog.pg_constraint k WHERE k.conrelid=c.oid)\nFROM pg_catalog.pg_class c WHERE c.oid=%s', (oid,)))
    if state is None or state[0] != 'v':
        raise CatalogError('head-view-catalog-mismatch')
    rules = (yield _Query('all', 'SELECT rulename,ev_type,is_instead,ev_enabled\nFROM pg_catalog.pg_rewrite WHERE ev_class=%s ORDER BY rulename', (oid,)))
    dependencies = (yield _Query('all', "SELECT d.refclassid,\nCASE WHEN d.refclassid='pg_catalog.pg_class'::pg_catalog.regclass AND d.refobjid=%s\nTHEN 'self' ELSE d.refobjid::pg_catalog.text END,d.refobjsubid,d.deptype\nFROM pg_catalog.pg_depend d JOIN pg_catalog.pg_rewrite r ON r.oid=d.objid\nWHERE d.classid='pg_catalog.pg_rewrite'::pg_catalog.regclass AND r.ev_class=%s\nORDER BY 1,2,3,4", (oid, oid)))
    acl = (yield _Query('all', "SELECT grantor,grantee,privilege_type,is_grantable\nFROM pg_catalog.pg_class c,LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner)))\nWHERE c.oid=%s ORDER BY 1,2,3,4", (oid,)))
    column_acl = (yield _Query('all', 'SELECT a.attname,x.grantor,x.grantee,x.privilege_type,x.is_grantable\nFROM pg_catalog.pg_attribute a,LATERAL pg_catalog.aclexplode(a.attacl) x\nWHERE a.attrelid=%s ORDER BY 1,2,3,4,5', (oid,)))
    return {'state': state, 'columns': (yield _Query('all', _COLUMNS, (schema, name))), 'rules': rules, 'definition': (yield _Query('one', 'SELECT pg_catalog.pg_get_viewdef(%s::pg_catalog.oid,true)', (oid,)))[0], 'dependencies': dependencies, 'acl': acl, 'columnAcl': column_acl}


def _verify_head_view(connection: Any, source: dict[str, Any]) -> bool:
    """Administrative source proof, not a first-observed definition fingerprint."""
    cfg = source['configuration']
    schema = cfg['schema']
    before = _head_shape(connection,schema)
    if before is None:
        return False
    actual = before
    owner_id = _one(connection,'SELECT oid FROM pg_catalog.pg_roles WHERE rolname=%s',(cfg['ownerRole'],))[0]
    expected_acl = _all(connection,'''SELECT grantor,grantee,privilege_type,is_grantable
FROM pg_catalog.aclexplode(pg_catalog.acldefault('r',%s::pg_catalog.oid))''',(owner_id,))
    for role in (cfg['personRole'],cfg['batchRole']):
        role_id = _one(connection,'SELECT oid FROM pg_catalog.pg_roles WHERE rolname=%s',(role,))[0]
        expected_acl.append((owner_id,role_id,'SELECT',False))
    if actual['acl'] != sorted(expected_acl) or actual['columnAcl']:
        raise CatalogError('head-view-privilege-mismatch')
    temporary = 'umf_verify_'+uuid4().hex
    _create_head_view(connection,source,temporary)
    if actual != _head_shape(connection,schema,temporary):
        raise CatalogError('head-view-catalog-mismatch')
    _execute(connection,'LOCK TABLE '+_q(schema)+'.'+_q(HEAD)+' IN ACCESS SHARE MODE')
    if actual != _head_shape(connection,schema):
        raise CatalogError('head-view-catalog-mismatch')
    _execute(connection,'DROP VIEW '+_q(schema)+'.'+_q(temporary))
    return True

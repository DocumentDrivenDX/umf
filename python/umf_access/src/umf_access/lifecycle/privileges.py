# SPDX-License-Identifier: MIT OR Apache-2.0
"""Source-reparsed native table ACLs and dedicated-schema preconditions.

No grant is repaired in place and no external/PUBLIC privilege is revoked.
Hosts must arrange those preconditions; successful observations do not grant
runtime or migration admission.
"""
from __future__ import annotations

from typing import Any
from uuid import uuid4

from .catalog import CatalogError, _all, _execute, _installation, _one, _q
from .roles import verify_native_role_scope

_TABLE_ACL = """SELECT x.grantor,x.grantee,x.privilege_type,x.is_grantable
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace,
LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) x
WHERE n.nspname=%s AND c.relname=%s ORDER BY 1,2,3,4"""

_COLUMN_ACL = """SELECT a.attname,x.grantor,x.grantee,x.privilege_type,x.is_grantable
FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace,
LATERAL pg_catalog.aclexplode(a.attacl) x
WHERE n.nspname=%s AND c.relname=%s AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,3,4,5"""

_EXTERNAL = """SELECT
pg_catalog.has_database_privilege(%s::pg_catalog.oid,pg_catalog.current_database(),'CREATE') OR
EXISTS(SELECT FROM pg_catalog.pg_namespace n WHERE n.nspname<>%s AND
 n.nspname!~'^pg_' AND n.nspname<>'information_schema' AND
 pg_catalog.has_schema_privilege(%s::pg_catalog.oid,n.oid,'CREATE')) OR
EXISTS(SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname<>%s AND n.nspname!~'^pg_' AND n.nspname<>'information_schema'
 AND CASE WHEN c.relkind IN ('r','p','v','m','f') THEN
 (pg_catalog.has_table_privilege(%s::pg_catalog.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
 OR pg_catalog.has_any_column_privilege(%s::pg_catalog.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')) ELSE FALSE END) OR
EXISTS(SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname<>%s AND n.nspname!~'^pg_' AND n.nspname<>'information_schema'
 AND CASE WHEN c.relkind='S' THEN pg_catalog.has_sequence_privilege(%s::pg_catalog.oid,c.oid,'USAGE,SELECT,UPDATE') ELSE FALSE END) OR
EXISTS(SELECT FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname!~'^pg_' AND n.nspname<>'information_schema'
 AND pg_catalog.has_function_privilege(%s::pg_catalog.oid,p.oid,'EXECUTE')) OR
EXISTS(SELECT FROM pg_catalog.pg_foreign_server s WHERE pg_catalog.has_server_privilege(%s::pg_catalog.oid,s.oid,'USAGE')) OR
EXISTS(SELECT FROM pg_catalog.pg_foreign_data_wrapper f WHERE pg_catalog.has_foreign_data_wrapper_privilege(%s::pg_catalog.oid,f.oid,'USAGE')) OR
EXISTS(SELECT FROM pg_catalog.pg_largeobject_metadata l WHERE pg_catalog.has_largeobject_privilege(%s::pg_catalog.oid,l.oid,'SELECT,UPDATE'))"""


def _table_acl(connection: Any, source: dict[str, Any], table: dict[str, Any]) -> None:
    schema = source['configuration']['schema']
    columns = [c for c in source['expectedCatalog']['columns'] if c['table'] == table['id']]
    if any(c['identity'] for c in columns):
        raise CatalogError('identity-privileges-unqualified')
    original = _q(schema)+'.'+_q(table['name'])
    temporary = 'umf_verify_'+uuid4().hex
    reference = _q(schema)+'.'+_q(temporary)
    _execute(connection, 'CREATE TABLE '+reference+' ('+', '.join(c['definitionSql'] for c in columns)+')')
    table_steps = [s for s in source['steps'] if s['kind']=='table' and s['sql'].startswith('CREATE TABLE '+original+' (')]
    if len(table_steps) != 1:
        raise CatalogError('source-mismatch')
    path = table_steps[0]['sourcePath']
    marker = ' ON TABLE '+original+' '
    for step in source['steps']:
        if step['kind'] != 'grant' or not (step['sourcePath']==path or step['sourcePath'].startswith(path+'/policy/')):
            continue
        if step['sql'].count(marker) != 1:
            raise CatalogError('source-mismatch')
        before, after = step['sql'].split(marker)
        _execute(connection, before+' ON TABLE '+reference+' '+after)
    for statement in (_TABLE_ACL, _COLUMN_ACL):
        if _all(connection,statement,(schema,table['name'])) != _all(connection,statement,(schema,temporary)):
            raise CatalogError('privilege-mismatch')
    _execute(connection,'DROP TABLE '+reference)


def verify_native_privileges(connection: Any, bundle: dict[str, object], *,
                             person_roles: tuple[str, ...],
                             statement_timeout_ms: int = 30_000,
                             lock_timeout_ms: int = 5_000) -> dict[str, object]:
    """Verify source ACLs/selected roles; never admit operations or repair privileges.

    Root plugin roles have no data/routine authority outside the private schema.
    Actual people may access other plugins; their target-schema privileges must
    come through the exact source ACL and the qualified role boundary. Identity
    sequences remain unqualified. This is an administrative observation, not a
    lock against privileged role/ACL changes made outside the host protocol.
    """
    with _installation(connection,bundle,statement_timeout_ms=statement_timeout_ms,
                       lock_timeout_ms=lock_timeout_ms) as source:
        verify_native_role_scope(connection,bundle,person_roles=person_roles,
                                 statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms)
        cfg=source['configuration']
        schema, owner = cfg['schema'],cfg['ownerRole']
        if any(column['identity'] for column in source['expectedCatalog']['columns']):
            raise CatalogError('identity-privileges-unqualified')
        owner_id=_one(connection,'SELECT oid FROM pg_catalog.pg_roles WHERE rolname=%s',(owner,))[0]
        schema_id=_one(connection,'SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=%s',(schema,))[0]
        for name in (owner,cfg['personRole'],cfg['batchRole']):
            oid=_one(connection,'SELECT oid FROM pg_catalog.pg_roles WHERE rolname=%s',(name,))[0]
            if _one(connection,_EXTERNAL,(oid,schema,oid,schema,oid,oid,schema,oid,oid,oid,oid,oid)) != (False,):
                raise CatalogError('external-authority-present')
        # Fresh scratch relations may not inherit grants absent from source.
        defaults=_all(connection,"""SELECT x.grantee,x.is_grantable FROM pg_catalog.pg_default_acl d,
LATERAL pg_catalog.aclexplode(d.defaclacl) x WHERE d.defaclrole=%s AND d.defaclnamespace IN (0,%s)
AND d.defaclobjtype IN ('r','S')""",(owner_id,schema_id))
        if any(grantee!=owner_id or grantable for grantee,grantable in defaults):
            raise CatalogError('default-privilege-mismatch')
        actual=_all(connection,"""SELECT x.grantor,x.grantee,x.privilege_type,x.is_grantable
FROM pg_catalog.pg_namespace n,LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) x
WHERE n.oid=%s ORDER BY 1,2,3,4""",(schema_id,))
        expected=_all(connection,"""SELECT grantor,grantee,privilege_type,is_grantable
FROM pg_catalog.aclexplode(pg_catalog.acldefault('n',%s::pg_catalog.oid))""",(owner_id,))
        for name in (cfg['personRole'],cfg['batchRole']):
            oid=_one(connection,'SELECT oid FROM pg_catalog.pg_roles WHERE rolname=%s',(name,))[0]
            expected.append((owner_id,oid,'USAGE',False))
        if actual != sorted(expected):
            raise CatalogError('privilege-mismatch')
        inventory=_all(connection,"""SELECT c.relname FROM pg_catalog.pg_class c WHERE c.relnamespace=%s
AND c.relkind NOT IN ('i','I') ORDER BY c.relname""",(schema_id,))
        if inventory != sorted((t['name'],) for t in source['expectedCatalog']['tables']):
            raise CatalogError('catalog-mismatch')
        for table in source['expectedCatalog']['tables']:
            _execute(connection,'LOCK TABLE '+_q(schema)+'.'+_q(table['name'])+' IN ACCESS EXCLUSIVE MODE')
        for table in source['expectedCatalog']['tables']:
            _table_acl(connection,source,table)
    return {'bundleDigest':source['bundleDigest'],'nativePrivilegesVerified':True,
            'verifiedPersonRoles':list(person_roles),'lifecycleAdmission':False}

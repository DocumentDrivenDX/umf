# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed private lifecycle metadata; a name alone never establishes authority."""
from __future__ import annotations

from typing import Any
from uuid import uuid4

from .catalog import (
    CatalogError,
    _all,
    _columns,
    _constraint_shapes,
    _execute,
    _index_shapes,
    _one,
    _q,
    _CONSTRAINTS as _NATIVE_CONSTRAINTS,
    _INDEXES as _NATIVE_INDEXES,
)

HISTORY = 'umf_lifecycle_history'
_COLUMNS = [
    '"position" pg_catalog.int8 NOT NULL',
    '"migration_id" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"predecessor_entry_digest" pg_catalog.text COLLATE pg_catalog."C"',
    '"plan_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"entry_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"payload" pg_catalog.jsonb NOT NULL',
]
_CONSTRAINTS = [
    ('umf_lifecycle_history_pkey','PRIMARY KEY ("position")'),
    ('umf_lifecycle_history_id_key','UNIQUE ("migration_id")'),
    ('positive_position','CHECK ("position">0)'),
    ('bounded_id','CHECK (pg_catalog.octet_length("migration_id") BETWEEN 1 AND 256)'),
    ('plan_digest_shape',"CHECK (\"plan_digest\" ~ '^[a-f0-9]{64}$')"),
    ('entry_digest_shape',"CHECK (\"entry_digest\" ~ '^[a-f0-9]{64}$')"),
    ('predecessor_shape',"CHECK (\"predecessor_entry_digest\" IS NULL OR \"predecessor_entry_digest\" ~ '^[a-f0-9]{64}$')"),
    ('object_payload',"CHECK (pg_catalog.jsonb_typeof(\"payload\")='object')"),
]

_STATE = """SELECT c.relkind,c.relpersistence,r.rolname,c.relrowsecurity,c.relforcerowsecurity,
c.relispartition,c.relhassubclass,c.relhasrules,c.relreplident,
EXISTS(SELECT FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
EXISTS(SELECT FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid),
EXISTS(SELECT FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid),r.oid,c.oid,c.relam
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE n.nspname=%s AND c.relname=%s"""


def _history_shape(connection: Any, schema: str) -> dict[str, Any] | None:
    """Read-only snapshot; issuers must first reparse the fixed original schema."""
    state = _one(connection,_STATE,(schema,HISTORY))
    if state is None:
        return None
    oid = state[13]
    return {'state':state,'columns':_columns(connection,schema,HISTORY),
            'constraints':_all(connection,_NATIVE_CONSTRAINTS,(schema,HISTORY)),
            'indexes':_all(connection,_NATIVE_INDEXES,(schema,HISTORY)),
            'acl':_all(connection,"""SELECT grantor,grantee,privilege_type,is_grantable
FROM pg_catalog.pg_class c,LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner)))
WHERE c.oid=%s ORDER BY 1,2,3,4""",(oid,)),
            'columnAcl':_all(connection,"""SELECT a.attname,x.grantor,x.grantee,x.privilege_type,x.is_grantable
FROM pg_catalog.pg_attribute a,LATERAL pg_catalog.aclexplode(a.attacl) x
WHERE a.attrelid=%s ORDER BY 1,2,3,4,5""",(oid,))}


def _create_history(connection: Any, schema: str, name: str = HISTORY) -> dict[str, str]:
    aliases: dict[str, str] = {}
    definitions = list(_COLUMNS)
    for original, body in _CONSTRAINTS:
        constraint = original if name == HISTORY else 'umf_verify_'+uuid4().hex
        aliases[constraint] = original
        definitions.append('CONSTRAINT '+_q(constraint)+' '+body)
    _execute(connection,'CREATE TABLE '+_q(schema)+'.'+_q(name)+' ('+', '.join(definitions)+') USING heap')
    return aliases


def _verify_history_schema(connection: Any, source: dict[str, Any]) -> bool:
    """Caller holds the administrative scope; verify even before reading payload."""
    schema, owner = source['configuration']['schema'], source['configuration']['ownerRole']
    query = _STATE
    state = _one(connection,query,(schema,HISTORY))
    if state is None:
        return False
    if tuple(state[:12]) != ('r','p',owner,False,False,False,False,False,'d',False,False,False):
        raise CatalogError('ledger-catalog-mismatch')
    owner_id, relation_id = state[12:14]
    if state[14] != _one(connection,"SELECT oid FROM pg_catalog.pg_am WHERE amname='heap'")[0]:
        raise CatalogError('ledger-catalog-mismatch')
    _execute(connection,'LOCK TABLE '+_q(schema)+'.'+_q(HISTORY)+' IN ACCESS EXCLUSIVE MODE')
    if _one(connection,query,(schema,HISTORY)) != state:
        raise CatalogError('ledger-catalog-mismatch')
    actual = _all(connection,"""SELECT x.grantor,x.grantee,x.privilege_type,x.is_grantable
FROM pg_catalog.pg_class c,LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) x
WHERE c.oid=%s ORDER BY 1,2,3,4""",(relation_id,))
    expected = _all(connection,"""SELECT grantor,grantee,privilege_type,is_grantable
FROM pg_catalog.aclexplode(pg_catalog.acldefault('r',%s::pg_catalog.oid)) ORDER BY 1,2,3,4""",(owner_id,))
    if actual != expected or _one(connection,"""SELECT count(*) FROM pg_catalog.pg_attribute a,
LATERAL pg_catalog.aclexplode(a.attacl) x WHERE a.attrelid=%s""",(relation_id,)) != (0,):
        raise CatalogError('ledger-privilege-mismatch')
    temporary = 'umf_verify_'+uuid4().hex
    aliases = _create_history(connection,schema,temporary)
    if (_columns(connection,schema,HISTORY) != _columns(connection,schema,temporary)
            or _constraint_shapes(connection,schema,HISTORY,{}) != _constraint_shapes(connection,schema,temporary,aliases)
            or _index_shapes(connection,schema,HISTORY,{}) != _index_shapes(connection,schema,temporary,aliases)):
        raise CatalogError('ledger-catalog-mismatch')
    _execute(connection,'DROP TABLE '+_q(schema)+'.'+_q(temporary))
    return True

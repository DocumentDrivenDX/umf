# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed native effect-receipt storage; no business-row history or authority issuer."""
from __future__ import annotations

import hashlib
import re
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
    _q_bound,
)
from .ledger_schema import _metadata_shape_steps
from .probe import _Query, _run

OUTCOMES = 'umf_lifecycle_outcomes'
_COLUMNS = [
    'principal_oid pg_catalog.oid NOT NULL',
    'key_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    'invocation_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    'scope_digest pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    'payload pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    'signature pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
]
_CONSTRAINTS = [
    ('umf_lifecycle_outcomes_pkey','PRIMARY KEY (principal_oid,key_digest)'),
    ('positive_principal','CHECK (principal_oid <> 0::pg_catalog.oid)'),
    *[(name+'_shape',f"CHECK ({name} ~ '^[a-f0-9]{{64}}$')")
      for name in ('key_digest','invocation_digest','scope_digest','signature')],
    ('bounded_payload','CHECK (pg_catalog.octet_length(payload) BETWEEN 2 AND 131072)'),
]
_PRINCIPAL = '(principal_oid = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = CURRENT_USER))'
_POLICIES = """SELECT polname,polcmd,polpermissive,polroles,
pg_catalog.pg_get_expr(polqual,polrelid,false),pg_catalog.pg_get_expr(polwithcheck,polrelid,false)
FROM pg_catalog.pg_policy WHERE polrelid=%s ORDER BY polname"""
_BOUNDARY = """SELECT EXISTS(SELECT FROM pg_catalog.pg_trigger WHERE tgrelid=%s),
EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE confrelid=%s)"""


def _outcome_shape_steps(schema, name=OUTCOMES):
    shape = yield from _metadata_shape_steps(schema,name)
    if shape is None:return None
    oid = shape['state'][13]
    shape['policies'] = yield _Query('all',_POLICIES,(oid,))
    shape['boundary'] = yield _Query('one',_BOUNDARY,(oid,oid))
    return shape


def _outcome_shape(connection, schema):
    return _run(connection,_outcome_shape_steps(schema))


def _create_outcomes(connection, source, name=OUTCOMES):
    cfg=source['configuration'];schema=cfg['schema']
    aliases={};definitions=list(_COLUMNS)
    for original,body in _CONSTRAINTS:
        constraint=original if name==OUTCOMES else 'umf_verify_'+uuid4().hex
        aliases[constraint]=original
        definitions.append('CONSTRAINT '+_q(constraint)+' '+body)
    relation=_q(schema)+'.'+_q(name)
    _execute(connection,'CREATE TABLE '+relation+' ('+', '.join(definitions)+') USING heap')
    _execute(connection,'ALTER TABLE '+relation+' ENABLE ROW LEVEL SECURITY')
    _execute(connection,'ALTER TABLE '+relation+' FORCE ROW LEVEL SECURITY')
    _execute(connection,'REVOKE ALL PRIVILEGES ON TABLE '+relation+' FROM PUBLIC')
    for audience in ('person','batch'):
        role=_q(cfg[audience+'Role'])
        _execute(connection,'CREATE POLICY '+_q('umf_outcome_'+audience)+' ON '+relation+
                 ' AS PERMISSIVE FOR ALL TO '+role+' USING '+_PRINCIPAL+' WITH CHECK '+_PRINCIPAL)
        _execute(connection,'GRANT SELECT, INSERT ON TABLE '+relation+' TO '+role)
    return aliases


def _verify_outcomes(connection, source):
    """Administrative proof against the original fixed schema on the same server."""
    cfg=source['configuration'];schema=cfg['schema']
    actual=_outcome_shape(connection,schema)
    if actual is None:return False
    state=actual['state']
    if tuple(state[:12])!=('r','p',cfg['ownerRole'],True,True,False,False,False,'d',False,False,True):
        raise CatalogError('outcome-catalog-mismatch')
    owner_id,_oid,am=state[12:]
    if am!=_one(connection,"SELECT oid FROM pg_catalog.pg_am WHERE amname='heap'")[0]:
        raise CatalogError('outcome-catalog-mismatch')
    _execute(connection,'LOCK TABLE '+_q(schema)+'.'+_q(OUTCOMES)+' IN ACCESS EXCLUSIVE MODE')
    if _outcome_shape(connection,schema)!=actual or actual['boundary']!=(False,False) or actual['columnAcl']:
        raise CatalogError('outcome-catalog-mismatch')
    acl=_all(connection,"""SELECT grantor,grantee,privilege_type,is_grantable
FROM pg_catalog.aclexplode(pg_catalog.acldefault('r',%s::pg_catalog.oid))""",(owner_id,))
    for role in (cfg['personRole'],cfg['batchRole']):
        principal=_one(connection,'SELECT oid FROM pg_catalog.pg_roles WHERE rolname=%s',(role,))[0]
        acl.extend((owner_id,principal,privilege,False) for privilege in ('INSERT','SELECT'))
    if actual['acl']!=sorted(acl):raise CatalogError('outcome-privilege-mismatch')
    temporary='umf_verify_'+uuid4().hex
    aliases=_create_outcomes(connection,source,temporary)
    scratch=_run(connection,_outcome_shape_steps(schema,temporary))
    if (_columns(connection,schema,OUTCOMES)!=_columns(connection,schema,temporary)
            or _constraint_shapes(connection,schema,OUTCOMES,{})!=_constraint_shapes(connection,schema,temporary,aliases)
            or _index_shapes(connection,schema,OUTCOMES,{})!=_index_shapes(connection,schema,temporary,aliases)
            or actual['policies']!=scratch['policies']):
        raise CatalogError('outcome-catalog-mismatch')
    _execute(connection,'DROP TABLE '+_q(schema)+'.'+_q(temporary))
    return True


def _outcome_steps(schema, principal_oid, key_digest, action, row=None):
    """Closed storage protocol; scheduling callers must first verify correspondence."""
    if (type(principal_oid) is not int or not 0<principal_oid<2**32
            or type(key_digest) is not str or not re.fullmatch('[a-f0-9]{64}',key_digest)):
        raise CatalogError('outcome-slot-invalid')
    relation=_q_bound(schema)+'.'+_q_bound(OUTCOMES)
    slot=(principal_oid,key_digest)
    if action=='lock':
        key=int.from_bytes(hashlib.sha256(('umf.table-outcome/0.1\0'+schema+'\0'+str(principal_oid)+'\0'+key_digest).encode()).digest()[:8],'big',signed=True)
        yield _Query('one','SELECT pg_catalog.pg_advisory_xact_lock(%s)',(key,))
        return None
    if action=='read':
        return (yield _Query('one','SELECT invocation_digest,scope_digest,payload,signature FROM '+relation+
                            ' WHERE principal_oid=%s AND key_digest=%s',slot))
    if action!='insert' or type(row) is not dict or set(row)!={'invocationDigest','scopeDigest','payload','signature'}:
        raise CatalogError('outcome-record-invalid')
    if (any(type(row[k]) is not str or not re.fullmatch('[a-f0-9]{64}',row[k])
            for k in ('invocationDigest','scopeDigest','signature'))
            or type(row['payload']) is not str or '\0' in row['payload']
            or not 2<=len(row['payload'].encode('utf-8'))<=131072):
        raise CatalogError('outcome-record-invalid')
    yield _Query('execute','INSERT INTO '+relation+
                 ' (principal_oid,key_digest,invocation_digest,scope_digest,payload,signature) VALUES (%s,%s,%s,%s,%s,%s)',
                 (*slot,row['invocationDigest'],row['scopeDigest'],row['payload'],row['signature']))
    return None

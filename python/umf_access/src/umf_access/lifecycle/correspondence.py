# SPDX-License-Identifier: MIT OR Apache-2.0
"""Live ordinary-principal installation checks; not an operation permit.

Expected table meaning is issued only after original-source native proof.
Current catalog/ACL/role observations never bless a new observed shape.
"""
from __future__ import annotations

import hashlib
from typing import Any, Literal

from .catalog import CatalogError
from .head import _head_steps, _normalized, prepare_table_head
from .head_view import HEAD
from .ledger_schema import HISTORY
from .outcome_schema import OUTCOMES, _outcome_steps
from .privileges import _EXTERNAL
from .probe import _Query
from .roles import _role_scope_steps
from .table_boundary import TABLE_BOUNDARY
from .witness import _json_bytes, _witness_steps


class TableCorrespondenceProbe:
    """Prepared checks over a trusted source/reference and selected principal."""
    def __init__(self, head, principal_role: str, audience: str):
        self._head,self._principal,self._audience = head,principal_role,audience

    @property
    def schema(self) -> str:
        return self._head.schema

    def steps(self):
        head = self._head
        return _correspondence_steps(head._source,head._expected,self._principal,self._audience,
                                     head._statement_timeout_ms,head._lock_timeout_ms)

    def outcome_steps(self, action, principal_oid, key_digest, row=None):
        """Fixed receipt IO; callers keep verified principal/admission in one lease."""
        if 'outcomeShape' not in self._head._expected:
            raise CatalogError('outcome-storage-not-installed')
        return _outcome_steps(self.schema,principal_oid,key_digest,action,row)

    @property
    def binding_context(self) -> dict[str, Any]:
        """Copied source pins for an SDK-owned operation compiler invocation."""
        source,expected=self._head._source,self._head._expected
        return {'module':source['configuration']['module'],'schema':self.schema,
                'sourceUtf8':source['source']['utf8'],'sourceDigest':source['sourceDigest'],
                'configurationDigest':source['configurationDigest'],'bundleDigest':source['bundleDigest'],
                'headDigest':expected['headDigest'],'referenceDigest':expected['referenceDigest']}


def prepare_table_correspondence(bundle: dict[str, object], reference: dict[str, object], *,
                                 principal_role: str, audience: Literal['person','batch'],
                                 statement_timeout_ms: int = 30_000, lock_timeout_ms: int = 5_000) -> TableCorrespondenceProbe:
    if (audience not in ('person','batch') or type(principal_role) is not str or not principal_role
            or '\0' in principal_role or len(principal_role.encode('utf-8'))>63):
        raise ValueError('an explicit native principal and person/batch audience are required')
    head = prepare_table_head(bundle,reference,statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms)
    return TableCorrespondenceProbe(head,principal_role,audience)


def _table_boundaries(source, expected):
    schema = source['configuration']['schema']
    tables = expected['nativeWitness']['tables']
    relation_ids = [table['relation'][0] for table in tables]
    owner_id = expected['nativeWitness']['schema'][1]
    heap = (yield _Query('one',"SELECT oid FROM pg_catalog.pg_am WHERE amname='heap'"))[0]
    for table in source['expectedCatalog']['tables']:
        actual = yield _Query('one',TABLE_BOUNDARY,(relation_ids,relation_ids,schema,table['name']))
        if actual != ('r','p',True,True,False,False,False,'d',owner_id,heap,False,8,False,False):
            raise CatalogError('table-boundary-mismatch')


def _schema_privileges(source, expected, roles):
    cfg = source['configuration'];schema = cfg['schema']
    schema_id,owner_id = expected['nativeWitness']['schema']
    actual = yield _Query('all',"""SELECT x.grantor,x.grantee,x.privilege_type,x.is_grantable
FROM pg_catalog.pg_namespace n,LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) x
WHERE n.oid=%s ORDER BY 1,2,3,4""",(schema_id,))
    acl = yield _Query('all',"""SELECT grantor,grantee,privilege_type,is_grantable
FROM pg_catalog.aclexplode(pg_catalog.acldefault('n',%s::pg_catalog.oid))""",(owner_id,))
    for role in (cfg['personRole'],cfg['batchRole']):
        acl.append((owner_id,roles['identities'][role],'USAGE',False))
    if actual != sorted(acl):
        raise CatalogError('privilege-mismatch')
    inventory = yield _Query('all',"""SELECT c.relname FROM pg_catalog.pg_class c
WHERE c.relnamespace=%s AND c.relkind NOT IN ('i','I') ORDER BY c.relname""",(schema_id,))
    names = sorted([(t['name'],) for t in source['expectedCatalog']['tables']]+[(HEAD,),(HISTORY,)])
    if 'outcomeShape' in expected:
        names=sorted([*names,(OUTCOMES,)])
    if inventory != names:
        raise CatalogError('catalog-mismatch')
    for role in (cfg['ownerRole'],cfg['personRole'],cfg['batchRole']):
        oid = roles['identities'][role]
        if (yield _Query('one',_EXTERNAL,(oid,schema,oid,schema,oid,oid,schema,oid,oid,oid,oid,oid))) != (False,):
            raise CatalogError('external-authority-present')


def _correspondence_steps(source, expected, principal, audience, statement_timeout_ms, lock_timeout_ms):
    observed = yield from _head_steps(source,expected,statement_timeout_ms,lock_timeout_ms)
    if observed['observedPrincipal'] != principal:
        raise CatalogError('principal-mismatch')
    roles = yield from _role_scope_steps(source,(principal,) if audience=='person' else (),
                                         (principal,) if audience=='batch' else ())
    yield from _table_boundaries(source,expected)
    if (yield from _witness_steps(source)) != expected['nativeWitness']:
        raise CatalogError('installed-generation-mismatch')
    yield from _schema_privileges(source,expected,roles)
    # Metadata checks cannot demand SELECT on deliberately denied tables. The
    # shared module lock excludes compliant migrations; native statements take
    # their own selected-table locks. External privileged changes require the
    # same operator quiescence as role/ACL changes, not an inferred global lock.
    yield from _table_boundaries(source,expected)
    if (yield from _witness_steps(source)) != expected['nativeWitness']:
        raise CatalogError('installed-generation-mismatch')
    observed.update({'principalOid':roles['identities'][principal],'audience':audience,
        'roleScopeDigest':hashlib.sha256(_json_bytes(_normalized({'roles':roles['facts']}))).hexdigest(),
        'nativeTableCorrespondenceVerified':True,'operationAdmission':False})
    return observed

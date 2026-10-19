# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native witnesses are captured only after source correspondence succeeds."""
from __future__ import annotations

import hashlib
import json
from typing import Any, cast

from .catalog import _CONSTRAINTS, _INDEXES, _POLICY, CatalogError, _all, _columns, _one
from .privileges import _COLUMN_ACL, _TABLE_ACL


def _json_bytes(value: Any) -> bytes:
    # All dictionary keys are fixed ASCII fields in this internal profile.
    # Native values are arrays, strings, booleans, null and safe integers.
    # This bounded subset is exactly RFC8785 without a second generic emitter.
    remaining = 200_000
    def check(item: Any, depth: int = 0) -> None:
        nonlocal remaining
        remaining -= 1
        if depth > 64 or remaining < 0:
            raise CatalogError('ledger-value-capacity')
        if item is None or type(item) is bool:
            return
        if type(item) is int and abs(item) <= 9_007_199_254_740_991:
            return
        if type(item) is str:
            item.encode('utf-8')
            return
        if isinstance(item,(list,tuple)):
            for member in item: check(member,depth+1)
            return
        if type(item) is dict and all(type(k) is str and k.isascii() for k in item):
            for member in item.values(): check(member,depth+1)
            return
        raise CatalogError('ledger-value-unqualified')
    check(value)
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')


def _entry_digest(position: int, predecessor: str | None, plan_digest: str, witness: Any) -> str:
    return hashlib.sha256(_json_bytes({'position':position,'predecessor':predecessor,'planDigest':plan_digest,'witness':witness})).hexdigest()


def _capture_witness(connection: Any, source: dict[str, Any]) -> dict[str, Any]:
    schema = source['configuration']['schema']
    roles = sorted({source['configuration'][k] for k in ('ownerRole','personRole','batchRole')} | set(source['configuration']['groupRoles'].values()))
    tables = []
    for table in source['expectedCatalog']['tables']:
        name = table['name']
        relation = _one(connection,"""SELECT c.oid,c.relowner,c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relhassubclass,c.relhasrules,c.relreplident
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname=%s""",(schema,name))
        policies = [[audience,command,_one(connection,_POLICY,(schema,name,'umf_'+audience+'_'+command))] for audience in ('person','batch') for command in ('select','insert','update','delete')]
        tables.append({'id':table['id'],'relation':relation,'columns':_columns(connection,schema,name),
                       'constraints':_all(connection,_CONSTRAINTS,(schema,name)),
                       'indexes':_all(connection,_INDEXES,(schema,name)),
                       'tableAcl':_all(connection,_TABLE_ACL,(schema,name)),
                       'columnAcl':_all(connection,_COLUMN_ACL,(schema,name)),'policies':policies})
    result={'version':'umf.native-table-witness/0.1',
            'serverVersion':_one(connection,"SELECT current_setting('server_version_num')::pg_catalog.int4")[0],
            'database':_one(connection,'SELECT oid,datname FROM pg_catalog.pg_database WHERE datname=current_database()'),
            'schema':_one(connection,'SELECT oid,nspowner FROM pg_catalog.pg_namespace WHERE nspname=%s',(schema,)),
            'roles':[_one(connection,'SELECT oid,rolname FROM pg_catalog.pg_roles WHERE rolname=%s',(name,)) for name in roles],
            'tables':tables}
    # Normalize driver tuples to the exact JSON shape retained by JSONB.
    return cast(dict[str, Any],json.loads(_json_bytes(result)))

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native witnesses are captured only after source correspondence succeeds."""
from __future__ import annotations

import hashlib
import json
from typing import Any, cast

from .catalog import _COLUMNS as _COLUMN_QUERY
from .catalog import _CONSTRAINTS, _INDEXES, _POLICY, CatalogError
from .privileges import _COLUMN_ACL, _TABLE_ACL
from .probe import _Query, _run


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


def _entry_digest(position: int, predecessor: str | None, plan_digest: str, witness: Any, file_digest: str | None = None) -> str:
    return hashlib.sha256(_json_bytes({'position':position,'predecessor':predecessor,'planDigest':plan_digest,'witness':witness,**({'fileDigest':file_digest} if file_digest is not None else {})})).hexdigest()


def _capture_witness(connection: Any, source: dict[str, Any]) -> dict[str, Any]:
    return _run(connection,_witness_steps(source))


def _witness_steps(source: dict[str, Any]) -> dict[str, Any]:
    schema = source['configuration']['schema']
    # Native expression trees retain typed constants without locale/timezone deparsing.
    # Keep existing non-domain witness0.1 bytes unchanged.
    exact_nodes=any(check['id'].startswith('domain:') for check in source['expectedCatalog']['checks'])
    column_query=_COLUMN_QUERY.replace('pg_catalog.pg_get_expr(d.adbin,d.adrelid)','d.adbin::pg_catalog.text') if exact_nodes else _COLUMN_QUERY
    constraint_query=_CONSTRAINTS.replace('pg_catalog.pg_get_constraintdef(co.oid,true)','CASE WHEN co.conbin IS NULL THEN pg_catalog.pg_get_constraintdef(co.oid,true) ELSE co.conbin::pg_catalog.text END') if exact_nodes else _CONSTRAINTS
    roles = sorted({source['configuration'][k] for k in ('ownerRole', 'personRole', 'batchRole')} | set(source['configuration']['groupRoles'].values()))
    tables = []
    for table in source['expectedCatalog']['tables']:
        name = table['name']
        relation = (yield _Query('one', 'SELECT c.oid,c.relowner,c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relhassubclass,c.relhasrules,c.relreplident,c.relam\nFROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname=%s', (schema, name)))
        policies = []
        for audience in ('person', 'batch'):
            for command in ('select', 'insert', 'update', 'delete'):
                policies.append([audience, command, (yield _Query('one', _POLICY, (schema, name, 'umf_' + audience + '_' + command)))])
        tables.append({'id': table['id'], 'relation': relation, 'columns': (yield _Query('all', column_query, (schema, name))), 'constraints': (yield _Query('all', constraint_query, (schema, name))), 'indexes': (yield _Query('all', _INDEXES, (schema, name))), 'tableAcl': (yield _Query('all', _TABLE_ACL, (schema, name))), 'columnAcl': (yield _Query('all', _COLUMN_ACL, (schema, name))), 'policies': policies})
    role_rows = []
    for role_name in roles:
        role_rows.append((yield _Query('one', 'SELECT oid,rolname FROM pg_catalog.pg_roles WHERE rolname=%s', (role_name,))))
    result = {'version': 'umf.native-table-witness/0.2' if exact_nodes else 'umf.native-table-witness/0.1', 'serverVersion': (yield _Query('one', "SELECT current_setting('server_version_num')::pg_catalog.int4", ()))[0], 'database': (yield _Query('one', 'SELECT oid,datname FROM pg_catalog.pg_database WHERE datname=current_database()', ())), 'schema': (yield _Query('one', 'SELECT oid,nspowner FROM pg_catalog.pg_namespace WHERE nspname=%s', (schema,))), 'roles': role_rows, 'tables': tables}
    return cast(dict[str, Any], json.loads(_json_bytes(result)))

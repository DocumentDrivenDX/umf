# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit administrative backfills; Weft owns all UPDATE SQL and literals."""
from __future__ import annotations

import json

from .catalog import CatalogError, _cursor, _execute, _q
from .seeds import _binding


def _apply_backfill(connection, plan, step):
    from weft import prepare_table_operation_module_json

    bundle = plan['next']
    options = plan.get('options', {})
    selected = [b for b in options.get('backfills', []) if b['operation'] == step['operation']]
    if len(selected) != 1 or selected[0]['scopedRows'] is not True:
        raise CatalogError('backfill-scope-required')
    selection = selected[0]
    table = next(t for t in bundle['expectedCatalog']['tables'] if t['id'] == selection['table'])
    binding = _binding(bundle)
    module = prepare_table_operation_module_json(json.dumps({
        'version': 'weft.table-operation-module/0.1', 'target': 'postgresql18',
        'binding': binding, 'module': bundle['module']}, separators=(',', ':')))
    compiled = module.prepare(selection['operation'])
    program = json.loads(compiled.bind_json(json.dumps({
        'call': {'kind': 'single', 'inputs': {}}, 'idempotencyKey': plan['digest']})))
    if (program.get('status') != 'compiled' or program.get('outputs') != []
            or program.get('version') != 'weft.table-operation/0.1'
            or program.get('binding',{}).get('modelSha256') != bundle['sourceDigest']
            or program.get('module') != bundle['module'] or program.get('operation') != selection['operation']
            or program.get('result',{}).get('kind') != 'mutation'
            or len(program.get('nativeInputs', [])) != 1):
        raise CatalogError('backfill-compilation-refused')
    sources = {slot['id']: slot['source'] for slot in program['parameterSources']}
    arguments = []
    for name in program['dbapiParameterOrder']:
        source = sources[name]
        if source['kind'] != 'literal':
            raise CatalogError('backfill-parameter-refused')
        arguments.append(source['nativeValue'])
    relation = _q(bundle['configuration']['schema']) + '.' + _q(table['name'])
    # The enclosing approved migration savepoint restores RLS on any failure.
    _execute(connection, 'ALTER TABLE ' + relation + ' DISABLE ROW LEVEL SECURITY')
    with _cursor(connection) as cursor:
        cursor.execute(program['dbapiSql'], tuple(arguments))
        if [column[0] for column in cursor.description] != [program['result']['affectedMarker']]:
            raise CatalogError('backfill-result-profile')
        rows = cursor.fetchmany(program['result']['maxRows'] + 1)
        if len(rows) > program['result']['maxRows'] or any(row != (1,) for row in rows):
            raise CatalogError('backfill-effect-bound')
    _execute(connection, 'ALTER TABLE ' + relation + ' ENABLE ROW LEVEL SECURITY')
    _execute(connection, 'ALTER TABLE ' + relation + ' FORCE ROW LEVEL SECURITY')

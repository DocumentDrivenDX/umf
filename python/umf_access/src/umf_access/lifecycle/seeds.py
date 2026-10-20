# SPDX-License-Identifier: MIT OR Apache-2.0
"""Approved migration seeds through Weft; no consumer query or receipt layer."""
from __future__ import annotations

import json

from .catalog import CatalogError, _cursor, _execute, _q, verify_native_catalog


def _binding(bundle):
    if bundle['source']['format'] != 'json':
        raise CatalogError('seed-json-source-required')
    document=json.loads(bundle['source']['utf8'])
    module=next(m for m in document['modules'] if m['id']==bundle['module'])
    fields={f['id']:f for f in module['elements'] if f['kind']=='field'}
    records={r['id']:r for r in module['elements'] if r['kind']=='record'}
    tables=[]
    for table in bundle['expectedCatalog']['tables']:
        record=records[table['record']['element']]
        primary=next((k for k in record['keys'] if k.get('primary')),None) or next(iter(record['keys']),None)
        if primary is None:
            raise CatalogError('seed-original-key-required')
        logical=lambda ref:fields[ref['element']].get('name',ref['element'])
        tables.append({'logical':[module['namespace'],record.get('name',record['id'])],
                       'native':table['name'],'key':[logical(f) for f in primary['fields']],
                       'columns':[{'logical':logical(c['field']),'native':c['name'],
                                   'carrier':fields[c['field']['element']]['scalarType'],
                                   'nullable':fields[c['field']['element']]['nullability']=='absent-allowed'}
                                  for c in table['columns']]})
    return {'version':'umf.raw-read-binding/0.1','schema':bundle['configuration']['schema'],
            'modelJson':bundle['source']['utf8'],'modelSha256':bundle['sourceDigest'],
            'tables':tables,'relationships':[],
            'nativeLifecycle':{'version':'umf.table-lifecycle/0.1','module':bundle['module'],
                               'configurationDigest':bundle['configurationDigest'],
                               'deploymentDigest':bundle['bundleDigest']}}


def _apply_seeds(connection,plan,*,statement_timeout_ms,lock_timeout_ms):
    """Called only inside the approved owner's locked migration savepoint.

    Disabling RLS is scoped to source-selected tables and this transaction.
    PostgreSQL constraints remain active. On failure/cancellation the enclosing
    migration savepoint restores schema, policies, rows and ledger together.
    """
    execution=plan['seedExecution']
    if execution=='none':
        return
    if type(execution) is not dict or execution.get('version')!='umf.table-seed-execution/0.1':
        raise CatalogError('seed-execution-profile')
    from weft import compile_table_seed_json

    bundle=plan['next'];binding=_binding(bundle)
    request={'version':'weft.table-seed/0.1','target':'postgresql18','module':bundle['module'],
             'binding':binding,'seedSets':execution['sets']}
    program=json.loads(compile_table_seed_json(json.dumps(request,ensure_ascii=False,separators=(',',':'))))
    if (program.get('version')!='weft.table-seed/0.1' or program.get('status')!='compiled'
            or program.get('module')!=bundle['module'] or program.get('schema')!=binding['schema']
            or program.get('sourceDigest')!=bundle['sourceDigest']
            or program.get('nativeLifecycle')!=binding['nativeLifecycle']
            or program.get('seedSets')!=execution['sets']
            or program.get('transport')!={'profile':'dbapi-percent/0.1','bindEmptyParameterTuple':True}
            or program.get('obligations')!={'authority':'approved-source-selected-administrative-seed',
                'transaction':'entire-migration','rowOrder':'authored',
                'rls':'installer-owner-scoped-disable-and-restore','automaticRetry':False,
                'nativeExecutionQualified':False}):
        raise CatalogError('seed-compilation-refused')
    selected={s['id']:s for s in bundle['seedSets']}
    expected=sum(len(selected[s]['rows']) for s in execution['sets'])
    names={t['name'] for t in bundle['expectedCatalog']['tables']}
    steps=program['steps'];offset=0
    for step in steps:
        count=step['sourceRows']['count']
        if (type(count) is not int or not 1<=count<=1000 or step['sourceRows']['start']!=offset
                or step['maxEffects']!=count or step['table'] not in names
                or step['parameterOrder'] not in ([],['nativeRows'])
                or step['dbapiParameterOrder']!=step['parameterOrder']):
            raise CatalogError('seed-execution-profile')
        offset+=count
    if offset!=expected or program['sourceRowCount']!=expected:
        raise CatalogError('seed-execution-profile')
    touched=sorted({s['table'] for s in steps})
    relations=[_q(binding['schema'])+'.'+_q(name) for name in touched]
    for relation in relations:
        _execute(connection,'ALTER TABLE '+relation+' DISABLE ROW LEVEL SECURITY')
    for step in steps:
        parameters=() if not step['parameterOrder'] else (json.dumps(step['nativeRows'],ensure_ascii=False,separators=(',',':')),)
        with _cursor(connection) as cursor:
            cursor.execute(step['dbapiSql'],parameters)
            if [c[0] for c in cursor.description]!=['umf_seed_count']:
                raise CatalogError('seed-result-profile')
            rows=cursor.fetchall()
        if (len(rows)!=1 or len(rows[0])!=1 or type(rows[0][0]) is not str
                or not rows[0][0].isascii() or not rows[0][0].isdigit()
                or not 0<=int(rows[0][0])<=step['maxEffects']):
            raise CatalogError('seed-result-profile')
    for relation in relations:
        _execute(connection,'ALTER TABLE '+relation+' ENABLE ROW LEVEL SECURITY')
        _execute(connection,'ALTER TABLE '+relation+' FORCE ROW LEVEL SECURITY')
    verify_native_catalog(connection,bundle,statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms)

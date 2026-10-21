# SPDX-License-Identifier: MIT OR Apache-2.0
"""Recoverable index-only phases on an explicitly supplied administrative session.

Native index shape is the progress witness. The same session-level lifecycle
lock spans autocommit builds and final transactional history publication.
"""
from __future__ import annotations

import hashlib
import json
from uuid import uuid4

from .catalog import (
    CatalogError,
    _execute,
    _index_shapes,
    _installation,
    _one,
    _q,
    verify_native_catalog,
)
from .ledger import _apply_table_migration, _authorize_new_effects, _history_rows, _verified_plan
from .ledger_schema import _verify_history_schema
from .phase_fence import _head_grants, _unfenced_verification, _verify_phase_head
from .privileges import verify_native_privileges
from .witness import _capture_witness


def _prefix_bundle(plan, completed):
    from umf_codegen import compile_table_deployment

    if plan['previous']['source']['format'] != 'json' or plan['next']['source']['format'] != 'json':
        raise CatalogError('index-phase-json-source-required')
    before = json.loads(plan['previous']['source']['utf8'])
    after = json.loads(plan['next']['source']['utf8'])
    old = next(m for m in before['modules'] if m['id'] == plan['next']['module'])['extensions']['umf.tables']
    new = next(m for m in after['modules'] if m['id'] == plan['next']['module'])['extensions']['umf.tables']
    selected = {(item['table'], item['index']) for item in completed}
    for table, previous in zip(new['tables'], old['tables'], strict=True):
        table['indexes'] = [index for index in table['indexes']
                            if any(i['id'] == index['id'] for i in previous['indexes'])
                            or (table['id'], index['id']) in selected]
    result = compile_table_deployment(json.dumps(after,separators=(',', ':')),configuration=plan['next']['configuration'])
    if result['status'] != 'compiled':
        raise CatalogError('index-prefix-source-mismatch')
    return result['bundle']


def _index_state(connection, schema, table, name):
    shapes = _index_shapes(connection,schema,table,{})
    return shapes.get(name)


def _check_invalid_shape(connection, bundle, table, index, actual):
    """Reparse original column/index SQL; only validity/readiness may differ."""
    schema = bundle['configuration']['schema']
    temporary = 'umf_verify_' + uuid4().hex
    relation = _q(schema)+'.'+_q(temporary)
    columns = [c['definitionSql'] for c in bundle['expectedCatalog']['columns'] if c['table'] == table['id']]
    _execute(connection,'CREATE TABLE '+relation+' ('+', '.join(columns)+')')
    name = 'umf_verify_' + uuid4().hex
    expected = next(i for i in bundle['expectedCatalog']['indexes'] if i['table'] == table['id'] and i['id'] == index['id'])
    _execute(connection,'CREATE '+('UNIQUE ' if index['unique'] else '')+'INDEX '+_q(name)+' ON '+relation+' '+expected['definitionSql'])
    reference = _index_shapes(connection,schema,temporary,{})[name]
    if actual is None or actual[6] is not False or any(a != b for i,(a,b) in enumerate(zip(actual,reference,strict=True)) if i not in (6,7,8)):
        raise CatalogError('invalid-index-shape-mismatch')
    _execute(connection,'DROP TABLE '+relation)


def apply_concurrent_indexes(connection, plan, *, approved_digest, expected_head,
                              person_roles, repair_invalid=False, stop_after=None,
                              statement_timeout_ms=30_000, lock_timeout_ms=5_000, file_digest=None):
    """Build/resume source-selected indexes; commit final ledger on this session.

    Requires autocommit, explicit NOLOGIN install owner via trusted SET ROLE,
    pg_catalog search path and PostgreSQL18. No connection is opened or pooled.
    repair_invalid approves dropping only a shape-verified failed selected index.
    A failure never advances history; completed native indexes remain for resume.
    """
    from psycopg import Error as NativeError

    source_plan = _verified_plan(plan)
    if approved_digest != source_plan['digest']:
        raise CatalogError('approval-required')
    selections = source_plan.get('options',{}).get('concurrentIndexes',[])
    steps = source_plan['steps']
    if (not selections or len(selections) != len(steps) or source_plan['previous'] is None
            or source_plan['seedExecution'] != 'none'
            or any(step['transaction'] != 'forbidden' or step['kind'] != 'index' for step in steps)):
        raise CatalogError('index-phase-profile')
    if type(repair_invalid) is not bool or stop_after is not None and (type(stop_after) is not int or stop_after < 1):
        raise ValueError('invalid recovery options')
    if not connection.autocommit or int(connection.info.transaction_status) != 0:
        raise CatalogError('idle-autocommit-required')
    bundle = source_plan['next']
    schema = bundle['configuration']['schema']
    # Check authority before acquiring a session lock or changing session settings.
    with connection.transaction(), _installation(connection,bundle,statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms):
        pass
    lock = int.from_bytes(hashlib.sha256(('umf.table-lifecycle/0.1\0'+schema).encode()).digest()[:8],'big',signed=True)
    if _one(connection,'SELECT pg_catalog.pg_try_advisory_lock(%s)',(lock,)) != (True,):
        raise CatalogError('migration-busy')
    previous_settings = None
    publication_started = False
    try:
        previous_settings = _one(connection,"SELECT current_setting('statement_timeout'),current_setting('lock_timeout')")
        _one(connection,"SELECT set_config('statement_timeout',%s,false),set_config('lock_timeout',%s,false)",(str(statement_timeout_ms),str(lock_timeout_ms)))
        with connection.transaction():
            if not _verify_history_schema(connection,bundle):
                raise CatalogError('ledger-history-missing')
            history = _history_rows(connection,schema)
            if not history:
                raise CatalogError('ledger-history-missing')
            matches = [e for e in history if e['plan']['id'] == source_plan['id']]
            if matches:
                if matches[0]['plan']['digest'] != source_plan['digest']:
                    raise CatalogError('ledger-digest-conflict')
                if history[-1]['plan']['toBundleDigest'] != bundle['bundleDigest']:
                    raise CatalogError('installed-generation-mismatch')
                verify_native_catalog(connection,bundle)
                return _apply_table_migration(connection,source_plan,approved_digest=approved_digest,expected_head=expected_head,
                                              person_roles=person_roles,prebuilt_indexes=True,file_digest=file_digest)
            if (history[-1]['entryDigest'] != expected_head
                    or source_plan['predecessor'] != {'id':history[-1]['plan']['id'],'digest':history[-1]['plan']['digest']}
                    or history[-1]['plan']['toBundleDigest'] != source_plan['fromBundleDigest']):
                raise CatalogError('ledger-head-mismatch')
            _authorize_new_effects(source_plan)
        with connection.transaction():
            observed = _capture_witness(connection,source_plan['previous'])
            selected_names = {t['id']:{i['name'] for i in t['indexes'] if any(s['table']==t['id'] and s['index']==i['id'] for s in selections)} for t in bundle['expectedCatalog']['tables']}
            for table in observed['tables']:
                table['indexes'] = [row for row in table['indexes'] if row[0] not in selected_names[table['id']]]
            if observed != history[-1]['witness']:
                raise CatalogError('installed-generation-mismatch')
        with connection.transaction():
            _verify_phase_head(connection,bundle)
            _head_grants(connection,bundle,False)
        completed = []
        # Follow compiler step order, independently of caller selection order.
        ordered = []
        for step in steps:
            parts = step['sourcePath'].split('/')
            table = bundle['expectedCatalog']['tables'][int(parts[6])]
            index = table['indexes'][int(parts[8])]
            ordered.append((step,table,index,{'table':table['id'],'index':index['id']}))
        # Discover only a contiguous valid prefix. Later/foreign objects cause
        # full source correspondence to refuse rather than being adopted.
        for _,table,index,selection in ordered:
            actual = _index_state(connection,schema,table['name'],index['name'])
            if actual is None or actual[6] is not True:
                break
            completed.append(selection)
        prefix = _prefix_bundle(source_plan,completed)
        for step,table,index,selection in ordered[len(completed):]:
            actual = _index_state(connection,schema,table['name'],index['name'])
            if actual is not None:
                with connection.transaction():
                    _check_invalid_shape(connection,bundle,table,index,actual)
                if not repair_invalid:
                    raise CatalogError('invalid-index-repair-required')
                _execute(connection,'DROP INDEX CONCURRENTLY '+_q(schema)+'.'+_q(index['name']))
            with connection.transaction(), _unfenced_verification(connection,bundle):
                verify_native_catalog(connection,prefix,statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms)
                verify_native_privileges(connection,prefix,person_roles=person_roles)
            _execute(connection,step['sql'])
            completed.append(selection)
            prefix = _prefix_bundle(source_plan,completed)
            with connection.transaction(), _unfenced_verification(connection,bundle):
                verify_native_catalog(connection,prefix,statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms)
            if stop_after is not None and len(completed) >= stop_after:
                return {'status':'in-progress','planDigest':source_plan['digest'],'completedIndexes':completed,'ledgerAdvanced':False}
        publication_started = True
        with connection.transaction():
            _head_grants(connection,bundle,True)
            verify_native_catalog(connection,bundle,statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms)
            verify_native_privileges(connection,bundle,person_roles=person_roles)
            result = _apply_table_migration(connection,source_plan,approved_digest=approved_digest,expected_head=expected_head,
                                            person_roles=person_roles,prebuilt_indexes=True,
                                            statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms,file_digest=file_digest)
        return {**result,'status':'committed','commitResponsibility':'runner'}
    except NativeError:
        raise CatalogError('migration-outcome-unknown-observe-history' if publication_started else 'index-build-failed-inspect-before-resume') from None
    finally:
        try:
            try:
                if previous_settings is not None:
                    _one(connection,"SELECT set_config('statement_timeout',%s,false),set_config('lock_timeout',%s,false)",tuple(previous_settings))
            finally:
                _one(connection,'SELECT pg_catalog.pg_advisory_unlock(%s)',(lock,))
        except NativeError:
            raise CatalogError('migration-session-cleanup-failed-observe-history') from None

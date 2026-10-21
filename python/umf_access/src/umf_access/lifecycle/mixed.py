# SPDX-License-Identifier: MIT OR Apache-2.0
"""Durable, source-bound runner for ordered mixed transactional phases."""
from __future__ import annotations

import hashlib
import json

from .catalog import CatalogError, _all, _execute, _installation, _one, _q, verify_native_catalog
from .concurrent import _index_state
from .ledger import (_finalize_phased_migration, _history_rows, _verified_plan,
                     _verify_installed)
from .ledger_schema import _verify_history_schema
from .outcome_schema import OUTCOMES, _verify_outcomes
from .phase_fence import _head_grants, _unfenced_verification, _verify_phase_head
from .privileges import verify_native_privileges
from .progress import (_assert_progress_binding, _delete_progress, _drop_progress, _phase_digest,
                       PROGRESS, _progress_rows, _verified_phases, _verify_progress_schema,
                       _write_progress)
from .witness import _capture_witness
from .head_view import HEAD
from .ledger_schema import HISTORY


def _phase_steps(plan, phase):
    by_id = {step['id']: step for step in plan['steps']}
    return [by_id[step_id] for step_id in phase['steps']]


def _phase_hash(plan, phase):
    return _phase_digest(phase, _phase_steps(plan, phase))


def _verify_mixed_prefix(connection, plan, receipt):
    """Verify the source-derived completed phase prefix before any resume work.

    The first receipt is admitted only after full predecessor verification. Each
    later receipt commits atomically with its exact source-regenerated phase;
    equality to its captured native witness detects any intervening drift.
    """
    phases = _verified_phases(plan)
    index = receipt['phaseIndex']
    if type(index) is not int or not 0 <= index <= len(phases):
        raise CatalogError('progress-state-mismatch')
    completed = [step_id for phase in phases[:index] for step_id in phase['steps']]
    if receipt['completedSteps'] != completed:
        raise CatalogError('progress-phase-mismatch')
    if receipt['state'] == 'intent':
        if index >= len(phases) or phases[index]['kind'] != 'concurrent-index' or receipt['phaseDigest'] != _phase_hash(plan, phases[index]):
            raise CatalogError('progress-phase-mismatch')
    elif receipt['state'] in ('ready','complete'):
        expected = _phase_hash(plan, phases[index-1]) if index else hashlib.sha256(b'').hexdigest()
        if receipt['phaseDigest'] != expected:
            raise CatalogError('progress-phase-mismatch')
    else:
        raise CatalogError('progress-state-mismatch')
    current_witness = _capture_witness(connection, plan['next'])
    expected_witness = (_without_concurrent_effect(current_witness, plan, phases[index])
                        if receipt['state'] == 'intent' else current_witness)
    if type(receipt['prefixWitness']) is not dict or expected_witness != receipt['prefixWitness']:
        raise CatalogError('progress-prefix-mismatch')
    bundle = plan['next']
    schema = bundle['configuration']['schema']
    # The fixed metadata relation set is explicit. App relations may only be
    # names in the verified next source; no umf_* namespace blanket is used.
    _verify_mixed_metadata_inventory(connection, plan)
    _verify_history_schema(connection, bundle)
    _verify_progress_schema(connection, bundle)
    _verify_outcomes(connection, bundle)
    _verify_phase_head(connection, bundle)


def _verify_mixed_metadata_inventory(connection, plan):
    bundle = plan['next']
    schema = bundle['configuration']['schema']
    rows = _all(connection, "SELECT c.relname,c.relkind FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relkind IN ('r','p','v','m','S','f') ORDER BY c.relname", (schema,))
    fixed = {HISTORY:'r', OUTCOMES:'r', PROGRESS:'r', HEAD:'v'}
    actual_fixed = {name:kind for name,kind in rows if name in fixed}
    if actual_fixed != fixed:
        raise CatalogError('progress-inventory-mismatch')
    app_names = {table['name'] for table in bundle['expectedCatalog']['tables']}
    if any(name not in app_names and name not in fixed for name, _ in rows):
        raise CatalogError('progress-inventory-mismatch')


def _without_concurrent_effect(witness, plan, phase):
    """Remove only the selected source index from a prefix snapshot."""
    result = json.loads(json.dumps(witness))
    bundle = plan['next']
    for step in _phase_steps(plan, phase):
        parts = step['sourcePath'].split('/')
        if len(parts) < 9 or parts[5] != 'tables':
            raise CatalogError('mixed-phase-profile')
        table = bundle['expectedCatalog']['tables'][int(parts[6])]
        index = table['indexes'][int(parts[8])]
        for item in result['tables']:
            if item['id'] == table['id']:
                item['indexes'] = [row for row in item['indexes'] if row[0] != index['name']]
                break
    return result


def _verify_index_shape(connection, bundle, step):
    """Require the exact valid native index selected by the source step."""
    from uuid import uuid4

    parts = step['sourcePath'].split('/')
    table = bundle['expectedCatalog']['tables'][int(parts[6])]
    index = table['indexes'][int(parts[8])]
    actual = _index_state(connection, bundle['configuration']['schema'], table['name'], index['name'])
    if actual is None:
        return False
    if actual[6] is not True:
        raise CatalogError('invalid-index-repair-required')
    schema = bundle['configuration']['schema']
    temporary = 'umf_verify_'+uuid4().hex
    relation = _q(schema)+'.'+_q(temporary)
    columns = [c['definitionSql'] for c in bundle['expectedCatalog']['columns'] if c['table'] == table['id']]
    _execute(connection, 'CREATE TABLE '+relation+' ('+', '.join(columns)+')')
    name = 'umf_verify_'+uuid4().hex
    expected = next(item for item in bundle['expectedCatalog']['indexes'] if item['table'] == table['id'] and item['id'] == index['id'])
    _execute(connection, 'CREATE '+('UNIQUE ' if index['unique'] else '')+'INDEX '+_q(name)+' ON '+relation+' '+expected['definitionSql'])
    from .catalog import _index_shapes
    reference = _index_shapes(connection, schema, temporary, {})[name]
    _execute(connection, 'DROP TABLE '+relation)
    if any(left != right for i, (left, right) in enumerate(zip(actual, reference, strict=True)) if i not in (6,7,8)):
        raise CatalogError('index-shape-mismatch')
    return True


def _lock_phase_tables(connection, plan):
    bundle = plan['next']
    schema = bundle['configuration']['schema']
    for table in bundle['expectedCatalog']['tables']:
        exists = _one(connection, "SELECT EXISTS(SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname=%s AND c.relkind='r')",
                      (schema, table['name']))
        if exists == (True,):
            _execute(connection, 'LOCK TABLE '+_q(schema)+'.'+_q(table['name'])+' IN ACCESS EXCLUSIVE MODE')


def _run_required_phase(connection, plan, phase, person_roles, *, statement_timeout_ms, lock_timeout_ms):
    bundle = plan['next']
    from .backfills import _apply_backfill
    from .seeds import _apply_seeds
    with _installation(connection, bundle, statement_timeout_ms=statement_timeout_ms,
                       lock_timeout_ms=lock_timeout_ms):
        for step in _phase_steps(plan, phase):
            if step['transaction'] != 'required':
                raise CatalogError('mixed-phase-profile')
            if step['kind'] == 'backfill':
                _apply_backfill(connection, plan, step)
            elif step['kind'] == 'seed':
                if step.get('operation') != 'apply-seeds' or step.get('seedSets') != plan['seedExecution'].get('sets'):
                    raise CatalogError('seed-execution-profile')
                _apply_seeds(connection, plan, statement_timeout_ms=statement_timeout_ms,
                             lock_timeout_ms=lock_timeout_ms)
            else:
                _execute(connection, step['sql'])
        witness = _capture_witness(connection, bundle)
        return witness


def apply_mixed_migration(connection, plan, *, approved_digest, expected_head, person_roles,
                          file_digest=None, stop_after_phase=None,
                          repair_invalid=False,
                          after_concurrent_effect_before_receipt=False,
                          after_phase_commit_unknown=False,
                          statement_timeout_ms=30_000, lock_timeout_ms=5_000):
    """Apply or resume a v0.2 mixed plan on a caller-supplied idle autocommit session.

    The runner persists a fixed private progress row. Required phase effects and
    their prefix witness commit atomically. Concurrent index intent commits
    before dispatch and is reconciled against native validity and exact shape.
    An interrupted head remains fenced until final history publication.
    """
    from psycopg import Error as NativeError

    source_plan = _verified_plan(plan)
    phases = _verified_phases(source_plan)
    if (source_plan['previous'] is None
            or source_plan.get('options', {}).get('version') != 'umf.table-migration-options/0.2'
            or approved_digest != source_plan['digest']):
        raise CatalogError('mixed-phase-profile')
    if file_digest is not None and (type(file_digest) is not str or len(file_digest) != 64):
        raise CatalogError('migration-file-digest-conflict')
    if stop_after_phase is not None and (type(stop_after_phase) is not int or stop_after_phase < 1):
        raise ValueError('invalid recovery options')
    if type(repair_invalid) is not bool or type(after_concurrent_effect_before_receipt) is not bool or type(after_phase_commit_unknown) is not bool:
        raise ValueError('invalid recovery options')
    if not connection.autocommit or int(connection.info.transaction_status) != 0:
        raise CatalogError('idle-autocommit-required')
    bundle = source_plan['next']
    schema = bundle['configuration']['schema']
    with connection.transaction(), _installation(connection, bundle,
            statement_timeout_ms=statement_timeout_ms, lock_timeout_ms=lock_timeout_ms):
        pass
    lock = int.from_bytes(hashlib.sha256(('umf.table-lifecycle/0.1\0'+schema).encode()).digest()[:8], 'big', signed=True)
    if _one(connection, 'SELECT pg_catalog.pg_try_advisory_lock(%s)', (lock,)) != (True,):
        raise CatalogError('migration-busy')
    previous_settings = None
    publication_started = False
    try:
        previous_settings = _one(connection, "SELECT current_setting('statement_timeout'),current_setting('lock_timeout')")
        _one(connection, "SELECT set_config('statement_timeout',%s,false),set_config('lock_timeout',%s,false)", (str(statement_timeout_ms),str(lock_timeout_ms)))
        with connection.transaction():
            if not _verify_history_schema(connection, bundle):
                raise CatalogError('ledger-history-missing')
            history = _history_rows(connection, schema)
            if not history:
                raise CatalogError('ledger-history-missing')
            matches = [entry for entry in history if entry['plan']['id'] == source_plan['id']]
            if matches:
                if matches[0]['plan']['digest'] != source_plan['digest']:
                    raise CatalogError('ledger-digest-conflict')
                if history[-1]['plan']['toBundleDigest'] != bundle['bundleDigest']:
                    raise CatalogError('installed-generation-mismatch')
                _verify_installed(connection, history[-1], person_roles, statement_timeout_ms, lock_timeout_ms)
                return {'status':'already-applied','migrationId':source_plan['id'],
                        'entryDigest':matches[0]['entryDigest'],'headDigest':history[-1]['entryDigest'],
                        'generation':len(history),'installedBundleDigest':bundle['bundleDigest'],
                        'commitResponsibility':'runner'}
            if (history[-1]['entryDigest'] != expected_head
                    or source_plan['predecessor'] != {'id':history[-1]['plan']['id'],'digest':history[-1]['plan']['digest']}
                    or history[-1]['plan']['toBundleDigest'] != source_plan['fromBundleDigest']):
                raise CatalogError('ledger-head-mismatch')
            progress_exists = _verify_progress_schema(connection, bundle, create=False)
            rows = _progress_rows(connection, schema) if progress_exists else []
            if rows:
                receipt = rows[0]
                _assert_progress_binding(receipt, migration_id=source_plan['id'], plan_digest=source_plan['digest'],
                                         expected_head=expected_head, file_digest=file_digest)
                _verify_mixed_prefix(connection, source_plan, receipt)
            else:
                _verify_installed(connection, history[-1], person_roles, statement_timeout_ms, lock_timeout_ms)
                if progress_exists:
                    raise CatalogError('progress-state-mismatch')
                _verify_progress_schema(connection, bundle, create=True)
                receipt = {'migrationId':source_plan['id'],'planDigest':source_plan['digest'],
                           'expectedHead':expected_head,'fileDigest':file_digest,'phaseIndex':0,
                           'state':'ready','phaseDigest':hashlib.sha256(b'').hexdigest(),
                           'completedSteps':[],'prefixWitness':_capture_witness(connection,bundle)}
                _head_grants(connection, bundle, False)
                _write_progress(connection, schema, receipt)
        # Keep person/batch generation admission fenced across every return and failure.
        with connection.transaction():
            _verify_phase_head(connection, bundle)
            _head_grants(connection, bundle, False)
        while receipt['phaseIndex'] < len(phases):
            index = receipt['phaseIndex']
            phase = phases[index]
            phase_hash = _phase_hash(source_plan, phase)
            if receipt['state'] == 'intent':
                if receipt['phaseDigest'] != phase_hash:
                    raise CatalogError('progress-phase-mismatch')
                repair_step = None
                with connection.transaction():
                    _lock_phase_tables(connection, source_plan)
                    _verify_mixed_metadata_inventory(connection, source_plan)
                    current = _capture_witness(connection, bundle)
                    if _without_concurrent_effect(current, source_plan, phase) != receipt['prefixWitness']:
                        raise CatalogError('progress-prefix-mismatch')
                    step = _phase_steps(source_plan, phase)[0]
                    parts = step['sourcePath'].split('/')
                    table = bundle['expectedCatalog']['tables'][int(parts[6])]
                    index_spec = table['indexes'][int(parts[8])]
                    actual = _index_state(connection, schema, table['name'], index_spec['name'])
                    if actual is not None and actual[6] is False:
                        from .concurrent import _check_invalid_shape
                        _check_invalid_shape(connection, bundle, table, index_spec, actual)
                        if not repair_invalid:
                            raise CatalogError('invalid-index-repair-required')
                        repair_step = step
                    elif _verify_index_shape(connection, bundle, step):
                        receipt = {**receipt,'phaseIndex':index+1,'state':'complete','phaseDigest':phase_hash,
                                   'completedSteps':receipt['completedSteps']+phase['steps'],
                                   'prefixWitness':_capture_witness(connection,bundle)}
                        _verify_mixed_metadata_inventory(connection, source_plan)
                        _write_progress(connection, schema, receipt)
                    else:
                        previous_digest = _phase_hash(source_plan, phases[index-1]) if index else hashlib.sha256(b'').hexdigest()
                        receipt = {**receipt,'state':'ready','phaseDigest':previous_digest}
                        _write_progress(connection, schema, receipt)
                if receipt['state'] == 'complete':
                    continue
                if repair_step is not None:
                    _execute(connection,'DROP INDEX CONCURRENTLY '+_q(schema)+'.'+_q(index_spec['name']))
                    _execute(connection,repair_step['sql'])
                    if after_concurrent_effect_before_receipt:
                        raise CatalogError('migration-outcome-unknown-observe-progress')
                    with connection.transaction():
                        _lock_phase_tables(connection, source_plan)
                        _verify_mixed_metadata_inventory(connection, source_plan)
                        current = _capture_witness(connection, bundle)
                        if _without_concurrent_effect(current, source_plan, phase) != receipt['prefixWitness']:
                            raise CatalogError('progress-prefix-mismatch')
                        _verify_index_shape(connection, bundle, repair_step)
                        receipt = {**receipt,'phaseIndex':index+1,'state':'complete','phaseDigest':phase_hash,
                                   'completedSteps':receipt['completedSteps']+phase['steps'],
                                   'prefixWitness':_capture_witness(connection,bundle)}
                        _verify_mixed_metadata_inventory(connection, source_plan)
                        _write_progress(connection, schema, receipt)
                    if after_phase_commit_unknown:
                        raise CatalogError('migration-outcome-unknown-observe-progress')
                    if stop_after_phase == receipt['phaseIndex']:
                        return {'status':'in-progress','planDigest':source_plan['digest'],
                                'completedPhases':receipt['phaseIndex'],'completedSteps':receipt['completedSteps'],
                                'ledgerAdvanced':False}
                    continue
            if phase['transaction'] == 'forbidden':
                with connection.transaction():
                    current = _capture_witness(connection, bundle)
                    if current != receipt['prefixWitness']:
                        raise CatalogError('progress-prefix-mismatch')
                    receipt = {**receipt,'state':'intent','phaseDigest':phase_hash}
                    _write_progress(connection, schema, receipt)
                step = _phase_steps(source_plan, phase)[0]
                _execute(connection, step['sql'])
                if after_concurrent_effect_before_receipt:
                    raise CatalogError('migration-outcome-unknown-observe-progress')
                with connection.transaction():
                    _lock_phase_tables(connection, source_plan)
                    _verify_mixed_metadata_inventory(connection, source_plan)
                    current = _capture_witness(connection, bundle)
                    if _without_concurrent_effect(current, source_plan, phase) != receipt['prefixWitness']:
                        raise CatalogError('progress-prefix-mismatch')
                    _verify_index_shape(connection, bundle, step)
                    receipt = {**receipt,'phaseIndex':index+1,'state':'complete','phaseDigest':phase_hash,
                               'completedSteps':receipt['completedSteps']+phase['steps'],
                               'prefixWitness':_capture_witness(connection,bundle)}
                    _verify_mixed_metadata_inventory(connection, source_plan)
                    _write_progress(connection, schema, receipt)
            else:
                with connection.transaction():
                    _lock_phase_tables(connection, source_plan)
                    _verify_mixed_metadata_inventory(connection, source_plan)
                    current = _capture_witness(connection, bundle)
                    if current != receipt['prefixWitness']:
                        raise CatalogError('progress-prefix-mismatch')
                    witness = _run_required_phase(connection, source_plan, phase, person_roles,
                        statement_timeout_ms=statement_timeout_ms, lock_timeout_ms=lock_timeout_ms)
                    _verify_mixed_metadata_inventory(connection, source_plan)
                    receipt = {**receipt,'phaseIndex':index+1,'state':'complete','phaseDigest':phase_hash,
                               'completedSteps':receipt['completedSteps']+phase['steps'],
                               'prefixWitness':witness}
                    _write_progress(connection, schema, receipt)
                if after_phase_commit_unknown:
                    raise CatalogError('migration-outcome-unknown-observe-progress')
            if stop_after_phase == receipt['phaseIndex']:
                return {'status':'in-progress','planDigest':source_plan['digest'],
                        'completedPhases':receipt['phaseIndex'],'completedSteps':receipt['completedSteps'],
                        'ledgerAdvanced':False}
        publication_started = True
        with connection.transaction():
            _verify_phase_head(connection, bundle)
            if _capture_witness(connection, bundle) != receipt['prefixWitness']:
                raise CatalogError('progress-prefix-mismatch')
            _verify_progress_schema(connection, bundle)
            _head_grants(connection, bundle, True)
            _delete_progress(connection, schema, source_plan['id'])
            _drop_progress(connection, schema)
            verify_native_catalog(connection, bundle, statement_timeout_ms=statement_timeout_ms, lock_timeout_ms=lock_timeout_ms)
            verify_native_privileges(connection, bundle, person_roles=person_roles,
                statement_timeout_ms=statement_timeout_ms, lock_timeout_ms=lock_timeout_ms)
            result = _finalize_phased_migration(connection, source_plan, approved_digest=approved_digest,
                expected_head=expected_head, person_roles=person_roles,
                statement_timeout_ms=statement_timeout_ms, lock_timeout_ms=lock_timeout_ms,
                file_digest=file_digest)
        return {**result,'status':'committed','commitResponsibility':'runner'}
    except NativeError:
        raise CatalogError('migration-outcome-unknown-observe-history' if publication_started else 'migration-outcome-unknown-observe-progress') from None
    finally:
        try:
            try:
                if previous_settings is not None:
                    _one(connection, "SELECT set_config('statement_timeout',%s,false),set_config('lock_timeout',%s,false)", tuple(previous_settings))
            finally:
                _one(connection, 'SELECT pg_catalog.pg_advisory_unlock(%s)', (lock,))
        except NativeError:
            raise CatalogError('migration-session-cleanup-failed-observe-history' if publication_started else 'migration-session-cleanup-failed-observe-progress') from None

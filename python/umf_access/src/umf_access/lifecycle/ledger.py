# SPDX-License-Identifier: MIT OR Apache-2.0
"""Approved, source-bound transactional migration application and durable replay.

The caller owns commit and trusted approval/head inputs. These administrative
methods never admit generated data operations or infer that commit succeeded.
"""
from __future__ import annotations

import re
from typing import Any, cast

from .backfills import _apply_backfill
from .catalog import (
    CatalogError,
    _all,
    _execute,
    _installation,
    _one,
    _q,
    _q_bound,
    verify_native_catalog,
)
from .head import _issue_reference
from .head_view import _create_head_view
from .ledger_schema import HISTORY, _create_history, _verify_history_schema
from .outcome_schema import _create_outcomes
from .privileges import verify_native_privileges
from .seeds import _apply_seeds
from .witness import _capture_witness, _entry_digest

_MAX_ENTRIES = 128
_MAX_HISTORY_BYTES = 32*1024*1024


def _verified_plan(plan: dict[str, object]) -> dict[str, Any]:
    from umf_codegen import verify_table_migration

    try:
        return cast(dict[str, Any],verify_table_migration(plan))
    except (ValueError,TypeError):
        raise CatalogError('source-mismatch') from None


def _authorize_new_effects(plan: dict[str, Any]) -> None:
    """Require current public compilation admission before first-time effects.

    `_verified_plan` deliberately accepts exact historical v0.1 plans so
    installed history remains verifiable. That compatibility path is not
    authorization to execute a previously unreviewed v0.1 change today.
    Recompile through the public entry point and require its exact result.
    """
    from umf_codegen import compile_table_migration

    request = {
        'migration_id': plan['id'],
        'previous_bundle': plan['previous'],
        'next_bundle': plan['next'],
        'predecessor': plan['predecessor'],
    }
    if 'options' in plan:
        request['options'] = plan['options']
    try:
        admitted = compile_table_migration(**request)
    except (ValueError, TypeError):
        raise CatalogError('new-effect-admission-required') from None
    if admitted.get('status') != 'compiled' or admitted.get('plan') != plan:
        raise CatalogError('new-effect-admission-required')


def _history_rows(connection: Any, schema: str) -> list[dict[str, Any]]:
    relation = _q(schema)+'.'+_q(HISTORY)
    count, size = _one(connection,'SELECT count(*),COALESCE(sum(pg_catalog.octet_length(payload::pg_catalog.text)),0) FROM '+relation)
    if count > _MAX_ENTRIES or size > _MAX_HISTORY_BYTES:
        raise CatalogError('ledger-capacity')
    try:
        rows = _all(connection,'SELECT position,migration_id,predecessor_entry_digest,plan_digest,entry_digest,payload FROM '+relation+' ORDER BY position',())
    except RecursionError:
        raise CatalogError('ledger-value-capacity') from None
    history = []
    previous: dict[str, Any] | None = None
    for position, row in enumerate(rows,1):
        number, migration_id, predecessor, plan_digest, entry_digest, payload = row
        if type(payload) is not dict or set(payload) not in ({'plan','witness'},{'plan','witness','fileDigest'}) or type(payload['plan']) is not dict or type(payload['witness']) is not dict:
            raise CatalogError('ledger-digest-conflict')
        if 'fileDigest' in payload and (type(payload['fileDigest']) is not str or not re.fullmatch('[a-f0-9]{64}',payload['fileDigest'])):
            raise CatalogError('ledger-digest-conflict')
        try:
            plan = _verified_plan(payload['plan'])
        except CatalogError:
            raise CatalogError('ledger-digest-conflict') from None
        if (number != position or migration_id != plan['id'] or plan_digest != plan['digest']
                or predecessor != (previous['entryDigest'] if previous else None)
                or entry_digest != _entry_digest(position,predecessor,plan_digest,payload['witness'],payload.get('fileDigest'))
                or plan['predecessor'] != ({'id':previous['plan']['id'],'digest':previous['plan']['digest']} if previous else None)
                or plan['fromBundleDigest'] != (previous['plan']['toBundleDigest'] if previous else None)):
            raise CatalogError('ledger-digest-conflict')
        previous = {'position':position,'entryDigest':entry_digest,'plan':plan,'witness':payload['witness'],'fileDigest':payload.get('fileDigest')}
        history.append(previous)
    return history


def _verify_installed(connection: Any, entry: dict[str, Any], person_roles: tuple[str, ...],
                      statement_timeout_ms: int, lock_timeout_ms: int) -> None:
    source = entry['plan']['next']
    approval_profile = entry['plan'].get('approvalProfile')
    selected_profile = None
    if entry['plan'].get('version') == 'umf.table-migration/0.3':
        from .approval import APPROVAL_PROFILE, _verify_approval_relation

        if approval_profile != APPROVAL_PROFILE or not _verify_approval_relation(connection, source):
            raise CatalogError('approval-catalog-mismatch')
        selected_profile = APPROVAL_PROFILE
    verify_native_catalog(connection,source,statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms)
    verify_native_privileges(connection,source,person_roles=person_roles,
                             statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms,
                             _approval_profile=selected_profile)
    if _capture_witness(connection,source) != entry['witness']:
        raise CatalogError('installed-generation-mismatch')


def apply_table_migration(connection: Any, plan: dict[str, object], *, approved_digest: str,
                          expected_head: str | None, person_roles: tuple[str, ...],
                          statement_timeout_ms: int = 30_000,
                          lock_timeout_ms: int = 5_000, file_digest: str | None = None) -> dict[str, object]:
    """Apply/replay an approved initial/append plan in a caller-owned transaction.

    expected_head is the prior receipt's entryDigest (initial None), not a
    value inferred from the database. History and effects roll back together.
    A successful result is pending the caller's commit; no writes are retried.
    """
    return _apply_table_migration(connection,plan,approved_digest=approved_digest,
                                  expected_head=expected_head,person_roles=person_roles,
                                  statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms,file_digest=file_digest)


def _apply_table_migration(connection,plan,*,approved_digest,expected_head,person_roles,
                           statement_timeout_ms=30_000,lock_timeout_ms=5_000,prebuilt_indexes=False,file_digest=None,
                           phases_applied=False):
    from psycopg.types.json import Jsonb

    if file_digest is not None and (type(file_digest) is not str or not re.fullmatch('[a-f0-9]{64}',file_digest)):
        raise CatalogError('migration-file-digest-conflict')
    source_plan = _verified_plan(plan)
    if source_plan.get('phases') and not phases_applied:
        raise CatalogError('mixed-phase-runner-required')
    concurrent = any(step['transaction'] == 'forbidden' for step in source_plan['steps'])
    if concurrent and not prebuilt_indexes and not phases_applied:
        raise CatalogError('nontransactional-runner-required')
    if (phases_applied and not source_plan.get('phases')
            and source_plan.get('steps')):
        raise CatalogError('mixed-phase-profile')
    if prebuilt_indexes and (not concurrent or any(step['kind'] != 'index' for step in source_plan['steps'])):
        raise CatalogError('index-phase-profile')
    if type(approved_digest) is not str or approved_digest != source_plan['digest']:
        raise CatalogError('approval-required')
    if expected_head is not None and (type(expected_head) is not str or not re.fullmatch('[a-f0-9]{64}',expected_head)):
        raise CatalogError('ledger-head-mismatch')
    if source_plan['previous'] is not None and expected_head is None:
        raise CatalogError('ledger-head-required')
    with _installation(connection,source_plan['next'],statement_timeout_ms=statement_timeout_ms,
                       lock_timeout_ms=lock_timeout_ms) as source:
        schema = source['configuration']['schema']
        exists = _verify_history_schema(connection,source)
        history = _history_rows(connection,schema) if exists else []
        if exists and not history:
            raise CatalogError('ledger-history-missing')
        if history and not prebuilt_indexes and not phases_applied:
            _verify_installed(connection,history[-1],person_roles,statement_timeout_ms,lock_timeout_ms)
        matches = [entry for entry in history if entry['plan']['id'] == source_plan['id']]
        if matches:
            entry = matches[0]
            if entry.get('fileDigest') != file_digest:
                raise CatalogError('migration-file-digest-conflict')
            previous_head = history[entry['position']-2]['entryDigest'] if entry['position']>1 else None
            if entry['plan']['digest'] != source_plan['digest'] or previous_head != expected_head:
                raise CatalogError('ledger-digest-conflict')
            return {'status':'already-applied','migrationId':source_plan['id'],'entryDigest':entry['entryDigest'],
                    'headDigest':history[-1]['entryDigest'],'generation':len(history),
                    'installedBundleDigest':history[-1]['plan']['toBundleDigest'],
                    'installationReference':_issue_reference(connection,history[-1]['plan']['next'],history[-1]),
                    'commitResponsibility':'caller','lifecycleAdmission':False}
        if (expected_head != (history[-1]['entryDigest'] if history else None)
                or source_plan['predecessor'] != ({'id':history[-1]['plan']['id'],'digest':history[-1]['plan']['digest']} if history else None)
                or source_plan['fromBundleDigest'] != (history[-1]['plan']['toBundleDigest'] if history else None)):
            raise CatalogError('ledger-head-mismatch')
        _authorize_new_effects(source_plan)
        if len(history) >= _MAX_ENTRIES:
            raise CatalogError('ledger-capacity')
        if not exists:
            occupied = _one(connection,"""SELECT EXISTS(SELECT FROM pg_catalog.pg_class WHERE relnamespace=n.oid)
OR EXISTS(SELECT FROM pg_catalog.pg_proc WHERE pronamespace=n.oid)
OR EXISTS(SELECT FROM pg_catalog.pg_type WHERE typnamespace=n.oid)
FROM pg_catalog.pg_namespace n WHERE n.nspname=%s""",(schema,))
            if occupied != (False,):
                raise CatalogError('initial-schema-not-empty')
        if not phases_applied:
            for step in source_plan['steps']:
                if step['transaction'] == 'forbidden':
                    continue
                if step['kind'] == 'backfill':
                    _apply_backfill(connection,source_plan,step)
                else:
                    _execute(connection,step['sql'])
        if not exists:
            _create_history(connection,schema)
            _create_head_view(connection,source)
            _create_outcomes(connection,source)
        verify_native_catalog(connection,source,statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms)
        approval_profile = source_plan.get('approvalProfile')
        if approval_profile is not None:
            from .approval import APPROVAL_PROFILE

            if (source_plan.get('version') != 'umf.table-migration/0.3'
                    or approval_profile != APPROVAL_PROFILE):
                raise CatalogError('approval-catalog-mismatch')
        verify_native_privileges(connection,source,person_roles=person_roles,
                                 statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms,
                                 _approval_profile=approval_profile)
        # Phased plans include their typed seed execution as an ordered phase
        # with a durable prefix receipt. Reapplying seeds during publication
        # would repeat committed data effects after a recovery boundary.
        if not phases_applied:
            _apply_seeds(connection,source_plan,statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms)
        witness = _capture_witness(connection,source)
        position = len(history)+1
        entry_digest = _entry_digest(position,expected_head,source_plan['digest'],witness,file_digest)
        payload = {'plan':source_plan,'witness':witness,**({'fileDigest':file_digest} if file_digest is not None else {})}
        _execute(connection,'INSERT INTO '+_q_bound(schema)+'.'+_q_bound(HISTORY)+' (position,migration_id,predecessor_entry_digest,plan_digest,entry_digest,payload) VALUES (%s,%s,%s,%s,%s,%s)',
                 (position,source_plan['id'],expected_head,source_plan['digest'],entry_digest,Jsonb(payload)))
        # Also verify the newly persisted JSONB round trip, full chain and caps
        # before exposing a result. No partially durable history is accepted.
        stored = _history_rows(connection,schema)
        if len(stored) != position or stored[-1]['entryDigest'] != entry_digest:
            raise CatalogError('ledger-digest-conflict')
        return {'status':'applied-in-transaction','migrationId':source_plan['id'],'entryDigest':entry_digest,
                'headDigest':entry_digest,'generation':position,'installedBundleDigest':source['bundleDigest'],
                'installationReference':_issue_reference(connection,source,stored[-1]),
                'commitResponsibility':'caller','lifecycleAdmission':False}


def _finalize_phased_migration(connection,plan,*,approved_digest,expected_head,person_roles,
                               statement_timeout_ms=30_000,lock_timeout_ms=5_000,file_digest=None):
    """Publish history after the mixed runner has durably completed every phase."""
    source_plan = _verified_plan(plan)
    if (not source_plan.get('phases') and source_plan.get('steps')):
        raise CatalogError('mixed-phase-profile')
    return _apply_table_migration(connection,source_plan,approved_digest=approved_digest,
        expected_head=expected_head,person_roles=person_roles,
        statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms,
        file_digest=file_digest,phases_applied=True)


def inspect_table_history(connection: Any, bundle: dict[str, object], *, person_roles: tuple[str, ...],
                          statement_timeout_ms: int = 30_000,
                          lock_timeout_ms: int = 5_000) -> dict[str, object]:
    """Observe durable history on a fresh transaction after an uncertain commit.

    Caller supplies its expected current source bundle; no stale cohort is
    silently substituted. The reference includes native metadata, without
    returning original plans or seed payloads.
    """
    with _installation(connection,bundle,statement_timeout_ms=statement_timeout_ms,
                       lock_timeout_ms=lock_timeout_ms) as source:
        if not _verify_history_schema(connection,source):
            raise CatalogError('ledger-history-missing')
        history = _history_rows(connection,source['configuration']['schema'])
        if not history:
            raise CatalogError('ledger-history-missing')
        if history[-1]['plan']['toBundleDigest'] != source['bundleDigest']:
            raise CatalogError('installed-generation-mismatch')
        _verify_installed(connection,history[-1],person_roles,statement_timeout_ms,lock_timeout_ms)
        return {'generation':len(history),'headDigest':history[-1]['entryDigest'],
                'installedBundleDigest':source['bundleDigest'],
                'installationReference':_issue_reference(connection,source,history[-1]),
                'entries':[{'migrationId':e['plan']['id'],'planDigest':e['plan']['digest'],'entryDigest':e['entryDigest']} for e in history],
                'lifecycleAdmission':False}

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed PostgreSQL control store for the G11 generation-ingress provider.

This is a finite native adapter, not a generic metadata API.  It is not yet
selected by the migration host and its source controls do not qualify native
ownership, ACL, transaction-hook, or external-custody enforcement.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import uuid
from dataclasses import dataclass
from typing import Any

from .catalog import (
    CatalogError,
    _all,
    _columns,
    _constraint_shapes,
    _execute,
    _index_shapes,
    _one,
    _q,
)

STORE_PROFILE = 'umf.pg-generation-ingress-store/0.1'
EPOCH_PROFILE = 'umf.native-ingress-epoch/0.1'
TRANSITION_PROFILE = 'umf.native-ingress-transition/0.1'
TARGET_CUSTODY_PROFILE = 'umf.native-target-custody/0.1'
_MAX_SAFE = 9_007_199_254_740_991
_MAX_RECORD_BYTES = 1_048_576
_HEX = re.compile(r'^[a-f0-9]{64}$')
_SYSTEM_IDENTIFIER = re.compile(r'^(0|[1-9][0-9]{0,19})$')
_CAPABILITY_SEAL = object()
_SCHEMA_MARKER_PREFIX = STORE_PROFILE + ':'
_STORE_SETTINGS = (
    ('search_path', 'pg_catalog'), ('TimeZone', 'UTC'), ('row_security', 'on'),
    ('session_replication_role', 'origin'), ('server_encoding', 'UTF8'),
    ('transaction_read_only', 'off'), ('transaction_isolation', 'read committed'),
)
_LOG = logging.getLogger(__name__)

_EPOCH_COLUMNS = [
    '"provider_id" pg_catalog.uuid NOT NULL',
    '"installation_id" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"epoch" pg_catalog.uuid NOT NULL',
    '"state" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"source_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"bundle_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"head_digest" pg_catalog.text COLLATE pg_catalog."C"',
    '"principals_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"custody_sequence" pg_catalog.int8 NOT NULL',
    '"record" pg_catalog.jsonb NOT NULL',
    '"record_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
]
_EPOCH_CONSTRAINTS = [
    ('ingress_epochs_pk', 'PRIMARY KEY ("provider_id", "installation_id", "epoch")'),
    ('ingress_epochs_installation', 'CHECK ("installation_id" <> \'\')'),
    ('ingress_epochs_state', 'CHECK ("state" IN (\'prepared\',\'active\',\'retired\'))'),
    ('ingress_epochs_head', 'CHECK (("state" = \'prepared\' AND "head_digest" IS NULL) OR ("state" IN (\'active\',\'retired\') AND "head_digest" IS NOT NULL AND "head_digest" ~ \'^[a-f0-9]{64}$\'))'),
    ('ingress_epochs_digests', 'CHECK ("source_digest" ~ \'^[a-f0-9]{64}$\' AND "bundle_digest" ~ \'^[a-f0-9]{64}$\' AND "principals_digest" ~ \'^[a-f0-9]{64}$\' AND "record_digest" ~ \'^[a-f0-9]{64}$\')'),
    ('ingress_epochs_sequence', 'CHECK ("custody_sequence" BETWEEN 1 AND 9007199254740991)'),
    ('ingress_epochs_record', 'CHECK (pg_catalog.jsonb_typeof("record") = \'object\')'),
]
_TRANSITION_COLUMNS = [
    '"transition_id" pg_catalog.uuid NOT NULL',
    '"provider_id" pg_catalog.uuid NOT NULL',
    '"installation_id" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"old_epoch" pg_catalog.uuid NOT NULL',
    '"new_epoch" pg_catalog.uuid NOT NULL',
    '"request_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"reservation_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"state" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"phase_index" pg_catalog.int2 NOT NULL',
    '"record" pg_catalog.jsonb NOT NULL',
    '"record_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
]
_TRANSITION_CONSTRAINTS = [
    ('ingress_transitions_pk', 'PRIMARY KEY ("transition_id")'),
    ('ingress_transitions_request', 'UNIQUE ("request_digest")'),
    ('ingress_transitions_reservation', 'UNIQUE ("reservation_digest")'),
    ('ingress_transitions_epochs', 'CHECK ("old_epoch" <> "new_epoch")'),
    ('ingress_transitions_state', 'CHECK ("state" IN (\'prepared\',\'fencing\',\'fenced\',\'cutover\',\'published\'))'),
    ('ingress_transitions_phase', 'CHECK (("state" IN (\'prepared\',\'fencing\',\'fenced\') AND "phase_index" = 0) OR ("state" IN (\'cutover\',\'published\') AND "phase_index" = 1))'),
    ('ingress_transitions_digests', 'CHECK ("request_digest" ~ \'^[a-f0-9]{64}$\' AND "reservation_digest" ~ \'^[a-f0-9]{64}$\' AND "record_digest" ~ \'^[a-f0-9]{64}$\')'),
    ('ingress_transitions_record', 'CHECK (pg_catalog.jsonb_typeof("record") = \'object\')'),
    ('ingress_transitions_old_fk', 'FOREIGN KEY ("provider_id","installation_id","old_epoch") REFERENCES {schema}."epochs" ("provider_id","installation_id","epoch") ON UPDATE RESTRICT ON DELETE RESTRICT'),
    ('ingress_transitions_new_fk', 'FOREIGN KEY ("provider_id","installation_id","new_epoch") REFERENCES {schema}."epochs" ("provider_id","installation_id","epoch") ON UPDATE RESTRICT ON DELETE RESTRICT'),
]


def _canonical_bytes(value: Any) -> bytes:
    # Closed receipts use JSON values, safe integer counters, and ASCII member
    # names. Validate iteratively before encoding so hostile nesting, huge
    # counters, lone surrogates, or Python-only values cannot escape as
    # serializer errors or consume unbounded recursion.
    stack: list[tuple[Any, int]] = [(value, 0)]
    nodes = 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > 100_000 or depth > 64:
            raise CatalogError('ingress-record-capacity')
        if item is None or type(item) is bool:
            continue
        if type(item) is int:
            if abs(item) > _MAX_SAFE:
                raise CatalogError('ingress-record-invalid')
            continue
        if type(item) is str:
            try:
                item.encode('utf-8')
            except UnicodeEncodeError:
                raise CatalogError('ingress-record-invalid') from None
            continue
        if type(item) is list:
            stack.extend((child, depth + 1) for child in item)
            continue
        if type(item) is dict:
            for key, child in item.items():
                if type(key) is not str or not key.isascii():
                    raise CatalogError('ingress-record-invalid')
                stack.append((key, depth + 1))
                stack.append((child, depth + 1))
            continue
        raise CatalogError('ingress-record-invalid')
    try:
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':'), allow_nan=False).encode('utf-8')
    except (TypeError, ValueError, UnicodeError, RecursionError):
        raise CatalogError('ingress-record-invalid') from None
    if len(encoded) > _MAX_RECORD_BYTES:
        raise CatalogError('ingress-record-capacity')
    return encoded


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _object(value: Any, keys: set[str], reason: str = 'ingress-record-invalid') -> dict[str, Any]:
    if type(value) is not dict or set(value) != keys:
        raise CatalogError(reason)
    return value


def _text(value: Any, *, max_bytes: int = 4096, empty: bool = False) -> str:
    if type(value) is not str or (not empty and not value):
        raise CatalogError('ingress-record-invalid')
    try:
        size = len(value.encode('utf-8'))
    except UnicodeEncodeError:
        raise CatalogError('ingress-record-invalid') from None
    if size > max_bytes or '\x00' in value:
        raise CatalogError('ingress-record-invalid')
    return value


def _uuid(value: Any) -> str:
    if type(value) is not str:
        raise CatalogError('ingress-record-invalid')
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError):
        raise CatalogError('ingress-record-invalid') from None
    if str(parsed) != value:
        raise CatalogError('ingress-record-invalid')
    return value


def _hex(value: Any, *, nullable: bool = False) -> str | None:
    if nullable and value is None:
        return None
    if type(value) is not str or _HEX.fullmatch(value) is None:
        raise CatalogError('ingress-record-invalid')
    return value


def _safe_int(value: Any, low: int = 1, high: int = _MAX_SAFE) -> int:
    if type(value) is not int or not low <= value <= high:
        raise CatalogError('ingress-record-invalid')
    return value


def _system_identifier(value: Any) -> str:
    if (type(value) is not str or _SYSTEM_IDENTIFIER.fullmatch(value) is None
            or int(value) > 18_446_744_073_709_551_615):
        raise CatalogError('ingress-record-invalid')
    return value


def _validate_target_custody(value: Any) -> dict[str, Any]:
    _object(value, {'profile', 'custodianId', 'registrationId', 'resourceId',
                    'incarnation', 'registrationDigest'})
    if value['profile'] != TARGET_CUSTODY_PROFILE:
        raise CatalogError('ingress-record-invalid')
    for key in ('custodianId', 'registrationId', 'resourceId', 'incarnation'):
        _uuid(value[key])
    _hex(value['registrationDigest'])
    return value


def _validate_principals(value: Any) -> str:
    if type(value) is not list or not value or len(value) > 256:
        raise CatalogError('ingress-record-invalid')
    seen_logins: set[int] = set()
    seen_subjects: set[int] = set()
    membership_total = 0
    for principal in value:
        _object(principal, {'login', 'subject', 'audience', 'issuerProfile',
                            'issuerReceiptDigest', 'ownershipReceiptDigest', 'memberships'})
        for role_key in ('login', 'subject'):
            role = principal[role_key]
            _object(role, {'oid', 'name'})
            _safe_int(role['oid'], 1, 2**32 - 1)
            _text(role['name'], max_bytes=63)
        login_oid, subject_oid = principal['login']['oid'], principal['subject']['oid']
        if login_oid in seen_logins or subject_oid in seen_subjects:
            raise CatalogError('ingress-record-invalid')
        seen_logins.add(login_oid)
        seen_subjects.add(subject_oid)
        if principal['audience'] not in ('person', 'batch'):
            raise CatalogError('ingress-record-invalid')
        _text(principal['issuerProfile'], max_bytes=256)
        _hex(principal['issuerReceiptDigest'])
        _hex(principal['ownershipReceiptDigest'])
        memberships = principal['memberships']
        if type(memberships) is not list:
            raise CatalogError('ingress-record-invalid')
        membership_total += len(memberships)
        if membership_total > 1024:
            raise CatalogError('ingress-record-invalid')
        seen_memberships: set[int] = set()
        for membership in memberships:
            _object(membership, {'roleOid', 'roleName', 'inherit', 'set', 'admin'})
            _safe_int(membership['roleOid'], 1, 2**32 - 1)
            _text(membership['roleName'], max_bytes=63)
            if any(type(membership[key]) is not bool for key in ('inherit', 'set', 'admin')):
                raise CatalogError('ingress-record-invalid')
            if membership['roleOid'] in seen_memberships:
                raise CatalogError('ingress-record-invalid')
            seen_memberships.add(membership['roleOid'])
    return _digest(value)


def _validate_epoch_record(value: Any) -> dict[str, Any]:
    keys = {'profile', 'providerId', 'enrollmentId', 'installationId',
            'targetCustody', 'epoch', 'state', 'sourceDigest', 'bundleDigest',
            'headDigest', 'principals', 'principalsDigest', 'custodySequence',
            'origin', 'originReceipt'}
    _object(value, keys)
    if value['profile'] != EPOCH_PROFILE or value['state'] not in ('prepared', 'active', 'retired'):
        raise CatalogError('ingress-record-invalid')
    _uuid(value['providerId']); _uuid(value['epoch'])
    _text(value['enrollmentId'], max_bytes=256)
    _text(value['installationId'], max_bytes=256)
    _validate_target_custody(value['targetCustody'])
    _hex(value['sourceDigest']); _hex(value['bundleDigest'])
    _hex(value['headDigest'], nullable=value['state'] == 'prepared')
    if value['state'] == 'prepared' and value['headDigest'] is not None:
        raise CatalogError('ingress-record-invalid')
    _hex(value['principalsDigest'])
    if _validate_principals(value['principals']) != value['principalsDigest']:
        raise CatalogError('ingress-record-invalid')
    _safe_int(value['custodySequence'])
    if value['origin'] == 'enrollment':
        receipt = value['originReceipt']
        _object(receipt, {'profile', 'providerId', 'enrollmentId', 'installationId',
                          'targetCustody', 'epoch', 'sourceDigest', 'bundleDigest',
                          'headDigest', 'principalsDigest', 'ownershipObservationDigest',
                          'externalReservationDigest'})
        if (receipt['profile'] != 'umf.native-ingress-enrollment/0.1'
                or any(receipt[key] != value[key] for key in
                       ('providerId', 'enrollmentId', 'installationId', 'targetCustody',
                        'epoch', 'sourceDigest', 'bundleDigest', 'headDigest', 'principalsDigest'))):
            raise CatalogError('ingress-record-invalid')
        _hex(receipt['ownershipObservationDigest']); _hex(receipt['externalReservationDigest'])
    elif value['origin'] == 'provision':
        receipt = value['originReceipt']
        _object(receipt, {'profile', 'providerId', 'enrollmentId', 'epoch',
                          'requestDigest', 'reservationDigest', 'principalsDigest',
                          'nativeOwnershipDigest', 'targetObservationDigest'})
        if (receipt['profile'] != 'umf.native-ingress-provision-receipt/0.1'
                or any(receipt[key] != value[key] for key in
                       ('providerId', 'enrollmentId', 'epoch', 'principalsDigest'))):
            raise CatalogError('ingress-record-invalid')
        for key in ('requestDigest', 'reservationDigest', 'nativeOwnershipDigest',
                    'targetObservationDigest'):
            _hex(receipt[key])
    else:
        raise CatalogError('ingress-record-invalid')
    _canonical_bytes(value)
    return value


def _validate_request(value: Any) -> dict[str, Any]:
    keys = {'profile', 'providerId', 'enrollmentId', 'installationId',
            'targetIdentityDigest', 'planDigest', 'fileDigest', 'expectedHead',
            'previousSourceDigest', 'nextSourceDigest', 'previousBundleDigest',
            'nextBundleDigest', 'oldEpoch', 'newEpoch', 'oldPrincipalsDigest',
            'newPrincipalsDigest', 'approvalDigest', 'targetCustody',
            'executionPolicyDigest'}
    _object(value, keys)
    if value['profile'] != 'umf.table-generation-ingress/0.1':
        raise CatalogError('ingress-record-invalid')
    for key in ('providerId', 'oldEpoch', 'newEpoch'):
        _uuid(value[key])
    if value['oldEpoch'] == value['newEpoch']:
        raise CatalogError('ingress-record-invalid')
    _uuid(value['enrollmentId'])
    _text(value['installationId'], max_bytes=128)
    for key in ('targetIdentityDigest', 'planDigest', 'fileDigest', 'previousSourceDigest',
                'nextSourceDigest', 'previousBundleDigest', 'nextBundleDigest',
                'oldPrincipalsDigest', 'newPrincipalsDigest', 'approvalDigest',
                'executionPolicyDigest'):
        _hex(value[key])
    _hex(value['expectedHead'], nullable=True)
    _validate_target_custody(value['targetCustody'])
    _canonical_bytes(value)
    return value


def _validate_reservation(value: Any) -> dict[str, Any]:
    _object(value, {'profile', 'id', 'custodianId', 'registrationId', 'incarnation',
                    'sequence', 'requestDigest', 'ingressApprovalDigest', 'parentStateDigest'})
    if value['profile'] != 'umf.native-target-reservation/0.1':
        raise CatalogError('ingress-record-invalid')
    for key in ('id', 'custodianId', 'registrationId', 'incarnation'):
        _text(value[key], max_bytes=256)
    _safe_int(value['sequence'])
    for key in ('requestDigest', 'ingressApprovalDigest', 'parentStateDigest'):
        _hex(value[key])
    _canonical_bytes(value)
    return value


def _validate_execution_policy(value: Any) -> Any:
    _object(value, {'version', 'phaseTimeoutMs', 'aggregateAffectedRows',
                    'statementTimeoutMs', 'lockTimeoutMs', 'derivedModuleProfile'})
    if value['version'] != 'umf.g11.execution-policy/0.1' or value['derivedModuleProfile'] != 'weft.table-operation-module/0.2':
        raise CatalogError('ingress-record-invalid')
    phase = _safe_int(value['phaseTimeoutMs'], 1, 300_000)
    aggregate = _safe_int(value['aggregateAffectedRows'], 0, 1_000_000)
    statement = _safe_int(value['statementTimeoutMs'], 1, phase)
    _safe_int(value['lockTimeoutMs'], 1, statement)
    try:
        from .phase_policy import FieldReplacementExecutionPolicy
        return FieldReplacementExecutionPolicy(
            phase_timeout_ms=phase,
            aggregate_affected_rows=aggregate,
            statement_timeout_ms=statement,
            lock_timeout_ms=value['lockTimeoutMs'])
    except (CatalogError, TypeError):
        raise CatalogError('ingress-record-invalid') from None


def _validate_transition_record(value: Any) -> dict[str, Any]:
    keys = {'profile', 'transitionId', 'request', 'requestDigest',
            'ingressApprovalDigest', 'reservation', 'reservationDigest', 'state',
            'phaseIndex', 'executionPolicy', 'fenceReceipt', 'phaseReceipt',
            'phaseBudgetReceipt', 'publicationReceipt'}
    _object(value, keys)
    if value['profile'] != TRANSITION_PROFILE:
        raise CatalogError('ingress-record-invalid')
    _uuid(value['transitionId'])
    _validate_request(value['request']); _validate_reservation(value['reservation'])
    if (_digest(value['request']) != value['requestDigest']
            or _digest(value['reservation']) != value['reservationDigest']
            or value['reservation']['requestDigest'] != value['requestDigest']
            or value['reservation']['ingressApprovalDigest'] != value['ingressApprovalDigest']
            or any(value['reservation'][key] != value['request']['targetCustody'][target_key]
                   for key, target_key in (('custodianId', 'custodianId'),
                                           ('registrationId', 'registrationId'),
                                           ('incarnation', 'incarnation')))):
        raise CatalogError('ingress-record-invalid')
    _hex(value['requestDigest']); _hex(value['reservationDigest']); _hex(value['ingressApprovalDigest'])
    policy = _validate_execution_policy(value['executionPolicy'])
    if _digest(value['executionPolicy']) != value['request']['executionPolicyDigest']:
        raise CatalogError('ingress-record-invalid')
    state, index = value['state'], value['phaseIndex']
    _safe_int(index, 0, 1)
    if state not in ('prepared', 'fencing', 'fenced', 'cutover', 'published'):
        raise CatalogError('ingress-record-invalid')
    if (state in ('prepared', 'fencing', 'fenced') and index != 0
            or state in ('cutover', 'published') and index != 1):
        raise CatalogError('ingress-record-invalid')
    for receipt in ('fenceReceipt', 'phaseReceipt', 'phaseBudgetReceipt', 'publicationReceipt'):
        if value[receipt] is not None and type(value[receipt]) is not dict:
            raise CatalogError('ingress-record-invalid')
    expected_receipts = {
        'prepared': (False, False, False, False),
        'fencing': (False, False, False, False),
        'fenced': (True, False, False, False),
        'cutover': (True, True, True, False),
        'published': (True, True, True, True),
    }[state]
    if tuple(value[key] is not None for key in
             ('fenceReceipt', 'phaseReceipt', 'phaseBudgetReceipt', 'publicationReceipt')) != expected_receipts:
        raise CatalogError('ingress-record-invalid')
    if value['phaseReceipt'] is not None:
        phase = value['phaseReceipt']
        _object(phase, {'migrationId', 'planDigest', 'expectedHead', 'fileDigest',
                        'phaseIndex', 'state', 'phaseDigest', 'completedSteps',
                        'prefixWitness'})
        if (type(phase['migrationId']) is not str or not phase['migrationId']
                or phase['planDigest'] != value['request']['planDigest']
                or phase['expectedHead'] != value['request']['expectedHead']
                or phase['fileDigest'] != value['request']['fileDigest']
                or phase['phaseIndex'] != 1 or type(phase['phaseIndex']) is not int
                or phase['state'] != 'complete'
                or type(phase['completedSteps']) is not list
                or type(phase['prefixWitness']) is not dict):
            raise CatalogError('ingress-record-invalid')
        _hex(phase['phaseDigest'])
        for step_id in phase['completedSteps']:
            if type(step_id) is not str or re.fullmatch(r'step-[0-9]{5}', step_id) is None:
                raise CatalogError('ingress-record-invalid')
        _canonical_bytes(phase)
    if value['phaseBudgetReceipt'] is not None:
        from .phase_policy import validate_phase_budget_receipt
        try:
            validate_phase_budget_receipt(value['phaseBudgetReceipt'], policy)
        except CatalogError:
            raise CatalogError('ingress-record-invalid') from None
    if value['publicationReceipt'] is not None:
        _validate_publication_reference(value['publicationReceipt'], value['request'])
    if value['fenceReceipt'] is not None:
        fence = value['fenceReceipt']
        _object(fence, {'profile', 'requestDigest', 'reservationDigest',
                        'targetObservationDigest', 'oldRolesDigest',
                        'oldMembershipsDigest', 'affectedAclsDigest',
                        'barrierCandidates', 'retiredSessions', 'catalogSide'})
        if (fence['profile'] != 'umf.native-ingress-fence/0.1'
                or fence['requestDigest'] != value['requestDigest']
                or fence['reservationDigest'] != value['reservationDigest']
                or fence['catalogSide'] not in ('previous', 'next')):
            raise CatalogError('ingress-record-invalid')
        for key in ('targetObservationDigest', 'oldRolesDigest',
                    'oldMembershipsDigest', 'affectedAclsDigest'):
            _hex(fence[key])
        _validate_fence_rows(fence['barrierCandidates'], barrier=True)
        _validate_fence_rows(fence['retiredSessions'], barrier=False)
    _canonical_bytes(value)
    return value


def _validate_publication_reference(value: Any, request: dict[str, Any]) -> None:
    keys = {'version', 'bundleDigest', 'sourceDigest', 'configurationDigest',
            'generation', 'headDigest', 'planDigest', 'headRelationOid',
            'headShape', 'nativeWitness', 'historyShape', 'referenceDigest',
            'outcomeShape', 'approvalProfile', 'approvalPlanDigest', 'approvalShape'}
    _object(value, keys)
    _canonical_bytes(value)
    checked = dict(value)
    reference_digest = checked.pop('referenceDigest')
    if (value['version'] != 'umf.table-installation/0.3'
            or _digest(checked) != reference_digest
            or value['bundleDigest'] != request['nextBundleDigest']
            or value['sourceDigest'] != request['nextSourceDigest']
            or value['planDigest'] != request['planDigest']
            or value['approvalPlanDigest'] != request['planDigest']
            or value['approvalProfile'] != {'version': 'umf.table-migration-approval/0.1',
                                            'relation': 'umf_lifecycle_approvals',
                                            'ownerOnly': True}
            or type(value['generation']) is not int or not 1 <= value['generation'] <= 128
            or type(value['headRelationOid']) is not int or not 1 <= value['headRelationOid'] < 2**32
            or type(value['headShape']) is not dict
            or type(value['nativeWitness']) is not dict
            or type(value['historyShape']) is not dict
            or type(value['outcomeShape']) is not dict
            or type(value['approvalShape']) is not dict):
        raise CatalogError('ingress-record-invalid')
    for key in ('configurationDigest', 'headDigest', 'planDigest',
                'approvalPlanDigest', 'referenceDigest'):
        _hex(value[key])
    from .head import _checked_reference
    try:
        _checked_reference(value, {
            'bundleDigest': request['nextBundleDigest'],
            'sourceDigest': request['nextSourceDigest'],
            'configurationDigest': value['configurationDigest'],
        })
    except CatalogError:
        raise CatalogError('ingress-record-invalid') from None


def _validate_fence_rows(value: Any, *, barrier: bool) -> None:
    if type(value) is not list or len(value) > 4096:
        raise CatalogError('ingress-record-invalid')
    keys = {'pid', 'backendStart', 'databaseOid', 'loginOid', 'state'} if barrier else {
        'pid', 'backendStart', 'databaseOid', 'loginOid', 'outcome'}
    seen: set[tuple[Any, Any]] = set()
    for row in value:
        _object(row, keys)
        _safe_int(row['pid'], 1, 2**31 - 1)
        _text(row['backendStart'], max_bytes=64)
        for key in ('databaseOid', 'loginOid'):
            if row[key] is not None:
                _safe_int(row[key], 1, 2**32 - 1)
        if barrier:
            _text(row['state'], max_bytes=64)
            if row['state'] != 'starting' and (row['databaseOid'] is None or row['loginOid'] is None):
                raise CatalogError('ingress-record-invalid')
        elif row['outcome'] not in ('terminated', 'already-exited'):
            raise CatalogError('ingress-record-invalid')
        token = (row['pid'], row['backendStart'])
        if token in seen:
            raise CatalogError('ingress-record-invalid')
        seen.add(token)


def _record_target(record: dict[str, Any]) -> tuple[str, str]:
    if record['profile'] == EPOCH_PROFILE:
        return record['providerId'], record['installationId']
    request = record['request']
    return request['providerId'], request['installationId']


def _record_columns(record: dict[str, Any]) -> tuple[Any, ...]:
    if record['profile'] == EPOCH_PROFILE:
        return (record['providerId'], record['installationId'], record['epoch'],
                record['state'], record['sourceDigest'], record['bundleDigest'],
                record['headDigest'], record['principalsDigest'],
                record['custodySequence'])
    request = record['request']
    return (record['transitionId'], request['providerId'], request['installationId'],
            request['oldEpoch'], request['newEpoch'],
            record['requestDigest'], record['reservationDigest'], record['state'],
            record['phaseIndex'])


def _validate_store_record(record: Any, expected_profile: str) -> tuple[dict[str, Any], str]:
    if expected_profile == EPOCH_PROFILE:
        checked = _validate_epoch_record(record)
    elif expected_profile == TRANSITION_PROFILE:
        checked = _validate_transition_record(record)
    else:
        raise CatalogError('ingress-record-invalid')
    return checked, _digest(checked)


def _create_table(connection: Any, schema: str, name: str,
                  columns: list[str], constraints: list[tuple[str, str]],
                  aliases: dict[str, str], *, foreign_keys: bool = False) -> None:
    definitions = list(columns)
    for constraint, body in constraints:
        actual = constraint if name in ('epochs', 'transitions') else 'umf_verify_' + uuid.uuid4().hex
        aliases[actual] = constraint
        if foreign_keys and '{schema}' in body:
            body = body.format(schema=_q(schema))
        definitions.append('CONSTRAINT ' + _q(actual) + ' ' + body)
    _execute(connection, 'CREATE TABLE ' + _q(schema) + '.' + _q(name)
             + ' (' + ', '.join(definitions) + ') USING heap')
    if not foreign_keys and columns == _EPOCH_COLUMNS:
        index_name = 'ingress_epochs_one_active'
        if name != 'epochs':
            # Scratch relations use a unique physical name, but normalize
            # their parsed index back to the frozen profile name.
            index_name = 'umf_verify_' + uuid.uuid4().hex
            aliases[index_name] = 'ingress_epochs_one_active'
        _execute(connection, 'CREATE UNIQUE INDEX ' + _q(index_name) + ' ON '
                 + _q(schema) + '.' + _q(name)
                 + ' ("provider_id","installation_id") WHERE "state" = \'active\'')


def _expected_schema_name(provider_id: str) -> str:
    parsed = _uuid(provider_id)
    return 'umf_ingress_' + parsed.replace('-', '')


def _literal(value: str) -> str:
    """Quote a validated internal literal for a PostgreSQL utility command."""
    if type(value) is not str or '\x00' in value:
        raise CatalogError('ingress-record-invalid')
    return "'" + value.replace("'", "''") + "'"


def _verify_relation_side_objects(connection: Any, schema: str, table: str,
                                  expected_column_count: int) -> None:
    attributes = _all(connection, """SELECT a.attnum,a.attisdropped
FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname=%s AND c.relname=%s AND a.attnum>0 ORDER BY a.attnum""",
                      (schema, table))
    if attributes != [(number, False) for number in range(1, expected_column_count + 1)]:
        raise CatalogError('ingress-store-catalog-mismatch')
    if _one(connection, """SELECT count(*) FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname=%s AND c.relname=%s AND NOT t.tgisinternal""",
             (schema, table)) != (0,):
        raise CatalogError('ingress-store-catalog-mismatch')
    if _one(connection, """SELECT count(*) FROM pg_catalog.pg_policy p
JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname=%s AND c.relname=%s""", (schema, table)) != (0,):
        raise CatalogError('ingress-store-catalog-mismatch')


@dataclass(frozen=True, slots=True)
class _OriginalStoreCreationAuthority:
    """Opaque binding to original custody and its native maintenance actor.

    Production issuance is deliberately absent until the native owner adapter
    can authorize principal preparation and exact store creation.  The journal
    registration alone proves target continuity, not PostgreSQL role authority.
    """

    provider_id: str
    installation_id: str
    custodian: object
    verified_target: object
    target_handle: object
    target_custody: object
    schema_oid: int | None
    registration_digest: str
    authority_preparation_receipt_digest: str
    creation_approval_digest: str
    target_custody_digest: str
    maintenance_user: str
    maintenance_user_oid: int
    controller_role: str
    controller_oid: int
    business_owner: str
    business_owner_oid: int
    # Flags in role order maintenance/controller/business owner, each in
    # canLogin, superuser, createDatabase, createRole, replication, bypassRls,
    # inherit order.
    principal_flags: tuple[tuple[bool, ...], tuple[bool, ...], tuple[bool, ...]]
    # Sorted tuples (member oid, role oid, inherit, set, admin).
    # This is the complete native SET-reachable membership closure observed
    # at original enrollment, not a caller-selected role name.
    membership_observations: tuple[tuple[int, int, bool, bool, bool], ...]
    required_settings: tuple[tuple[str, str], ...]
    database_name: str
    database_system_identifier: str
    native_authority_observation_digest: str
    _seal: object

    def __post_init__(self) -> None:
        if self._seal is not _CAPABILITY_SEAL:
            raise TypeError('original store creation authority is provider-issued')
        from .ingress_custody import (
            CustodyJournalError,
            LocalTargetCustodian,
            _VerifiedTargetCustody,
        )

        if (type(self.custodian) is not LocalTargetCustodian
                or type(self.verified_target) is not _VerifiedTargetCustody
                or self.verified_target.custodian is not self.custodian):
            raise CatalogError('ingress-store-custody-required')
        try:
            if self.custodian._resolve_target_custody(self.target_handle) is not self.verified_target:
                raise CatalogError('ingress-store-custody-mismatch')
            reference = self.custodian._public_reference(self.target_handle)
        except (AttributeError, TypeError, CustodyJournalError):
            raise CatalogError('ingress-store-custody-required') from None
        if type(self.target_custody) is not dict or reference != self.target_custody:
            raise CatalogError('ingress-store-custody-mismatch')
        _validate_target_custody(self.target_custody)
        _uuid(self.provider_id)
        _text(self.installation_id, max_bytes=128)
        if self.schema_oid is not None:
            _safe_int(self.schema_oid, 1, 2**32 - 1)
        for digest in (self.registration_digest, self.authority_preparation_receipt_digest,
                       self.creation_approval_digest, self.target_custody_digest,
                       self.native_authority_observation_digest):
            _hex(digest)
        if self.target_custody_digest != _digest(self.target_custody):
            raise CatalogError('ingress-record-invalid')
        _text(self.maintenance_user, max_bytes=63)
        _safe_int(self.maintenance_user_oid, 1, 2**32 - 1)
        _text(self.controller_role, max_bytes=63)
        _safe_int(self.controller_oid, 1, 2**32 - 1)
        _text(self.business_owner, max_bytes=63)
        _safe_int(self.business_owner_oid, 1, 2**32 - 1)
        principals = ((self.maintenance_user_oid, self.maintenance_user),
                      (self.controller_oid, self.controller_role),
                      (self.business_owner_oid, self.business_owner))
        if (len({item[0] for item in principals}) != 3
                or len({item[1] for item in principals}) != 3):
            raise CatalogError('ingress-record-invalid')
        if (type(self.principal_flags) is not tuple or len(self.principal_flags) != 3
                or any(type(flags) is not tuple or len(flags) != 7
                       or any(type(flag) is not bool for flag in flags)
                       for flags in self.principal_flags)):
            raise CatalogError('ingress-record-invalid')
        if self.required_settings != _STORE_SETTINGS:
            raise CatalogError('ingress-record-invalid')
        _text(self.database_name, max_bytes=63)
        _system_identifier(self.database_system_identifier)
        required = ((self.maintenance_user_oid, self.controller_oid, False, True, False),
                    (self.maintenance_user_oid, self.business_owner_oid, False, True, False))
        if (type(self.membership_observations) is not tuple
                or len(self.membership_observations) > 4096):
            raise CatalogError('ingress-record-invalid')
        previous: tuple[int, int, bool, bool, bool] | None = None
        reached = {self.maintenance_user_oid}
        for membership in self.membership_observations:
            if type(membership) is not tuple or len(membership) != 5:
                raise CatalogError('ingress-record-invalid')
            member_oid, role_oid, inherit_option, set_option, admin_option = membership
            _safe_int(member_oid, 1, 2**32 - 1)
            _safe_int(role_oid, 1, 2**32 - 1)
            if any(type(option) is not bool for option in
                   (inherit_option, set_option, admin_option)):
                raise CatalogError('ingress-record-invalid')
            if previous is not None and membership <= previous:
                raise CatalogError('ingress-record-invalid')
            previous = membership
        changed = True
        while changed:
            changed = False
            for member_oid, role_oid, _inherit, set_option, _admin in self.membership_observations:
                if member_oid in reached and set_option and role_oid not in reached:
                    reached.add(role_oid)
                    changed = True
        direct_required = {
            item for item in self.membership_observations
            if item[0] == self.maintenance_user_oid and item[1] in
            (self.controller_oid, self.business_owner_oid)
        }
        if (self.controller_oid not in reached or self.business_owner_oid not in reached
                or direct_required != set(required)):
            raise CatalogError('ingress-controller-set-membership-required')


@dataclass(frozen=True, slots=True)
class _PhaseTransactionBinding:
    """Private lease binding for one host business-owner physical transaction."""

    connection: Any
    provider_id: str
    installation_id: str
    target_identity_digest: str
    session_user: str
    session_user_oid: int
    business_owner: str
    business_owner_oid: int
    database_oid: int
    _seal: object
    _invalidated: bool = False

    def __post_init__(self) -> None:
        if self._seal is not _CAPABILITY_SEAL:
            raise TypeError('phase transaction binding is host-issued')
        _uuid(self.provider_id); _text(self.installation_id, max_bytes=256)
        _hex(self.target_identity_digest)
        _text(self.session_user, max_bytes=63); _text(self.business_owner, max_bytes=63)
        _safe_int(self.session_user_oid, 1, 2**32 - 1)
        _safe_int(self.business_owner_oid, 1, 2**32 - 1)
        _safe_int(self.database_oid, 1, 2**32 - 1)


def _bind_phase_transaction(connection: Any, *, provider_id: str,
                             installation_id: str, target_identity_digest: str,
                             session_user: str, session_user_oid: int, business_owner: str,
                             business_owner_oid: int, database_oid: int) -> _PhaseTransactionBinding:
    """Private host hook; possession alone never substitutes for DB checks."""
    return _PhaseTransactionBinding(connection, provider_id, installation_id,
                                    target_identity_digest, session_user,
                                    session_user_oid, business_owner, business_owner_oid,
                                    database_oid, _CAPABILITY_SEAL)


class PgGenerationIngressStore:
    """Fixed source-side adapter; does not establish issuer/custodian authority."""

    __slots__ = (
        '_connection',
        '_custodian',
        '_custody',
        '_schema_oid',
        '_target_handle',
        'controller_oid',
        'controller_role',
        'database_name',
        'database_oid',
        'database_system_identifier',
        'installation_id',
        'provider_id',
        'schema',
    )

    def __init__(self, controller_connection: Any, *, provider_id: str,
                 installation_id: str, controller_role: str,
                 controller_oid: int, database_oid: int,
                 custodian: Any, target_custody: Any,
                 creation_authority: _OriginalStoreCreationAuthority):
        if (type(creation_authority) is not _OriginalStoreCreationAuthority
                or creation_authority.provider_id != provider_id
                or creation_authority.custodian is not custodian
                or creation_authority.target_handle is not target_custody):
            raise CatalogError('ingress-store-custody-required')
        from .ingress_custody import CustodyJournalError, LocalTargetCustodian

        if type(custodian) is not LocalTargetCustodian:
            raise CatalogError('ingress-store-custody-required')
        try:
            verified = custodian._resolve_target_custody(target_custody)
            public_reference = custodian._public_reference(target_custody)
        except CustodyJournalError:
            raise CatalogError('ingress-store-custody-required') from None
        if (verified is not creation_authority.verified_target
                or public_reference != creation_authority.target_custody):
            raise CatalogError('ingress-store-custody-mismatch')
        self._connection = controller_connection
        self.provider_id = _uuid(provider_id)
        self.installation_id = _text(installation_id, max_bytes=256)
        self.schema = _expected_schema_name(provider_id)
        self.controller_role = _text(controller_role, max_bytes=63)
        self.controller_oid = _safe_int(controller_oid, 1, 2**32 - 1)
        self.database_oid = _safe_int(database_oid, 1, 2**32 - 1)
        self.database_name = creation_authority.database_name
        self.database_system_identifier = creation_authority.database_system_identifier
        self._custody = creation_authority
        self._custodian = custodian
        self._target_handle = target_custody
        self._schema_oid = creation_authority.schema_oid
        if (creation_authority.installation_id != installation_id
                or creation_authority.controller_role != self.controller_role
                or creation_authority.controller_oid != self.controller_oid):
            raise CatalogError('ingress-store-custody-mismatch')

    def create_original_store(self) -> int:
        """Create once under original custody; never adopts by name or shape."""
        if self._custody.schema_oid is not None:
            raise CatalogError('ingress-store-already-created')
        self._require_active_transaction(self._connection)
        self._verify_controller_session()
        if _one(self._connection, 'SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=%s',
                (self.schema,)) is not None:
            raise CatalogError('ingress-store-custody-conflict')
        _execute(self._connection, 'CREATE SCHEMA ' + _q(self.schema)
                 + ' AUTHORIZATION ' + _q(self.controller_role))
        _execute(self._connection, 'COMMENT ON SCHEMA ' + _q(self.schema) + ' IS '
                 + _literal(_SCHEMA_MARKER_PREFIX + self.provider_id))
        aliases: dict[str, str] = {}
        _create_table(self._connection, self.schema, 'epochs', _EPOCH_COLUMNS,
                      _EPOCH_CONSTRAINTS, aliases)
        _create_table(self._connection, self.schema, 'transitions', _TRANSITION_COLUMNS,
                      _TRANSITION_CONSTRAINTS, aliases, foreign_keys=True)
        schema_oid = _one(self._connection,
                          'SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=%s',
                          (self.schema,))
        if schema_oid is None:
            raise CatalogError('ingress-store-create-unobserved')
        self._schema_oid = int(schema_oid[0])
        self._verify_store_shape(self._schema_oid, self._connection)
        return self._schema_oid

    def verify_original_store(self) -> None:
        """Verify only the externally pinned original schema incarnation."""
        expected_oid = self._schema_oid
        if expected_oid is None:
            raise CatalogError('ingress-store-custody-required')
        self._verify_controller_session()
        row = _one(self._connection,
                   'SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=%s',
                   (self.schema,))
        if row is None or row[0] != expected_oid:
            raise CatalogError('ingress-store-custody-mismatch')
        self._require_active_transaction(self._connection)
        self._verify_store_shape(expected_oid, self._connection)

    def _verify_controller_session(self, connection: Any | None = None) -> None:
        connection = self._connection if connection is None else connection
        state = _one(connection, """SELECT c.oid,
current_user,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user),
session_user,
(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=session_user),
pg_catalog.current_setting('role'),
pg_catalog.current_setting('search_path'),pg_catalog.current_setting('TimeZone'),
pg_catalog.current_setting('row_security'),pg_catalog.current_setting('session_replication_role'),
pg_catalog.current_setting('server_encoding'),pg_catalog.current_setting('transaction_read_only'),
pg_catalog.current_setting('transaction_isolation'),
pg_catalog.current_setting('server_version_num')::pg_catalog.int4,
c.datname,(SELECT system_identifier FROM pg_catalog.pg_control_system())
FROM pg_catalog.pg_database c
WHERE c.datname=pg_catalog.current_database()""")
        if (state is None or state[0] != self.database_oid
                or state[1] != self.controller_role or state[2] != self.controller_oid
                or state[3] != self._custody.maintenance_user
                or state[4] != self._custody.maintenance_user_oid
                or state[5] != self.controller_role
                or state[6:13] != tuple(value for _name, value in _STORE_SETTINGS)
                or state[13] != 180006 or state[14] != self.database_name
                or str(state[15]) != self.database_system_identifier
                or self._set_membership_snapshot(connection, state[4])
                != self._custody.membership_observations):
            raise CatalogError('ingress-store-controller-required')
        self._verify_principal_observations(connection)

    def _verify_principal_observations(self, connection: Any) -> None:
        expected = (
            (self._custody.maintenance_user_oid, self._custody.maintenance_user,
             self._custody.principal_flags[0]),
            (self.controller_oid, self.controller_role, self._custody.principal_flags[1]),
            (self._custody.business_owner_oid, self._custody.business_owner,
             self._custody.principal_flags[2]),
        )
        rows = _all(connection, """SELECT oid,rolname,rolcanlogin,rolsuper,rolcreatedb,
rolcreaterole,rolreplication,rolbypassrls,rolinherit
FROM pg_catalog.pg_roles WHERE oid = ANY(%s::pg_catalog.oid[])""",
                    ([item[0] for item in expected],))
        actual = {(row[0], row[1]): tuple(row[2:]) for row in rows}
        if len(rows) != 3 or any(actual.get((oid, name)) != flags
                                 for oid, name, flags in expected):
            raise CatalogError('ingress-store-principal-mismatch')

    @staticmethod
    def _set_membership_snapshot(connection: Any, member_oid: int
                                 ) -> tuple[tuple[int, int, int, bool, bool, bool], ...]:
        """Read the complete SET-reachable native role-membership closure."""
        rows = _all(connection, """WITH RECURSIVE reachable(role_oid, path) AS (
 SELECT %s::pg_catalog.oid, ARRAY[%s::pg_catalog.oid]
 UNION ALL
 SELECT m.roleid, reachable.path || m.roleid
 FROM reachable JOIN pg_catalog.pg_auth_members m ON m.member=reachable.role_oid
 WHERE m.set_option AND NOT m.roleid=ANY(reachable.path)
), edges AS (
 SELECT m.member,m.roleid,m.inherit_option,m.set_option,m.admin_option
 FROM pg_catalog.pg_auth_members m
 WHERE m.member IN (SELECT role_oid FROM reachable)
)
SELECT member,roleid,inherit_option,set_option,admin_option
FROM edges ORDER BY member,roleid""", (member_oid, member_oid))
        if len(rows) > 4096:
            raise CatalogError('ingress-record-capacity')
        result: list[tuple[int, int, int, bool, bool, bool]] = []
        for row in rows:
            if (len(row) != 5 or any(type(value) is not int for value in row[:2])
                    or any(type(value) is not bool for value in row[2:])):
                raise CatalogError('ingress-record-invalid')
            result.append(tuple(row))  # type: ignore[arg-type]
        return tuple(result)

    def _verify_store_shape(self, schema_oid: int, connection: Any) -> None:
        schema_state = _one(connection, """SELECT n.oid,n.nspowner,r.rolname,
pg_catalog.obj_description(n.oid,'pg_namespace'),n.nspacl
FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles r ON r.oid=n.nspowner
WHERE n.nspname=%s""", (self.schema,))
        if (schema_state is None or schema_state[0] != schema_oid
                or schema_state[1] != self.controller_oid
                or schema_state[2] != self.controller_role
                or schema_state[3] != _SCHEMA_MARKER_PREFIX + self.provider_id):
            raise CatalogError('ingress-store-catalog-mismatch')
        expected_relations = {
            'epochs', 'transitions', 'ingress_epochs_pk', 'ingress_epochs_one_active',
            'ingress_transitions_pk', 'ingress_transitions_request',
            'ingress_transitions_reservation',
        }
        rows = _all(connection, """SELECT c.relname,c.relkind,c.relpersistence,
r.oid,r.rolname,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,
c.relhassubclass,c.relhasrules,c.relreplident
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
WHERE c.relnamespace=%s ORDER BY c.relname""", (schema_oid,))
        if {row[0] for row in rows} != expected_relations:
            raise CatalogError('ingress-store-catalog-mismatch')
        for row in rows:
            if (row[2] != 'p' or row[3] != self.controller_oid
                    or row[4] != self.controller_role or row[5:11] != (False, False, False, False, False, 'd')):
                raise CatalogError('ingress-store-catalog-mismatch')
            expected_kind = 'r' if row[0] in ('epochs', 'transitions') else 'i'
            if row[1] != expected_kind:
                raise CatalogError('ingress-store-catalog-mismatch')
        self._verify_acl(schema_oid, connection)
        for name, columns, constraints, foreign_keys in (
                ('epochs', _EPOCH_COLUMNS, _EPOCH_CONSTRAINTS, False),
                ('transitions', _TRANSITION_COLUMNS, _TRANSITION_CONSTRAINTS, True)):
            self._verify_relation(connection, name, columns, constraints, foreign_keys)

    def _verify_acl(self, schema_oid: int, connection: Any) -> None:
        if _one(connection, """SELECT count(*) FROM pg_catalog.pg_roles r
WHERE r.oid NOT IN (%s,%s,%s) AND (
 pg_catalog.pg_has_role(r.oid,%s,'SET') OR
 pg_catalog.pg_has_role(r.oid,%s,'SET'))""",
                 (self._custody.maintenance_user_oid, self.controller_oid,
                  self._custody.business_owner_oid, self.controller_oid,
                  self._custody.business_owner_oid)) != (0,):
            raise CatalogError('ingress-store-role-reachability-mismatch')
        if _one(connection, """SELECT count(*) FROM pg_catalog.pg_namespace n,
LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
WHERE n.oid=%s AND a.grantee<>n.nspowner""", (schema_oid,)) != (0,):
            raise CatalogError('ingress-store-privilege-mismatch')
        if _one(connection, """SELECT count(*) FROM pg_catalog.pg_class c,
LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
WHERE c.relnamespace=%s AND a.grantee<>c.relowner""", (schema_oid,)) != (0,):
            raise CatalogError('ingress-store-privilege-mismatch')
        if _one(connection, """SELECT count(*) FROM pg_catalog.pg_attribute a,
LATERAL pg_catalog.aclexplode(a.attacl) x JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
WHERE c.relnamespace=%s""", (schema_oid,)) != (0,):
            raise CatalogError('ingress-store-privilege-mismatch')
        if _one(connection, """SELECT count(*) FROM pg_catalog.pg_roles r
WHERE NOT r.rolsuper AND r.oid<>%s AND (
 pg_catalog.has_schema_privilege(r.oid,%s,'USAGE') OR
 pg_catalog.has_schema_privilege(r.oid,%s,'CREATE') OR EXISTS (
   SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace=%s AND (
    pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT') OR
    pg_catalog.has_table_privilege(r.oid,c.oid,'INSERT') OR
    pg_catalog.has_table_privilege(r.oid,c.oid,'UPDATE') OR
    pg_catalog.has_table_privilege(r.oid,c.oid,'DELETE') OR
    pg_catalog.has_table_privilege(r.oid,c.oid,'TRUNCATE') OR
    pg_catalog.has_table_privilege(r.oid,c.oid,'REFERENCES') OR
    pg_catalog.has_table_privilege(r.oid,c.oid,'TRIGGER'))))""",
                    (self.controller_oid, self.schema, self.schema, schema_oid)) != (0,):
            raise CatalogError('ingress-store-privilege-mismatch')

    def _verify_relation(self, connection: Any, name: str, columns: list[str],
                         constraints: list[tuple[str, str]], foreign_keys: bool) -> None:
        actual_columns = _columns(connection, self.schema, name)
        _verify_relation_side_objects(connection, self.schema, name, len(columns))
        # Create the reference in a SAVEPOINT-local unique relation name, then
        # compare parsed native descriptors instead of trusting DDL strings.
        temporary = 'umf_verify_' + uuid.uuid4().hex
        aliases: dict[str, str] = {}
        _create_table(connection, self.schema, temporary, columns,
                      constraints, aliases, foreign_keys=foreign_keys)
        try:
            if (actual_columns != _columns(connection, self.schema, temporary)
                    or _constraint_shapes(connection, self.schema, name, {})
                    != _constraint_shapes(connection, self.schema, temporary, aliases)
                    or _index_shapes(connection, self.schema, name, {})
                    != _index_shapes(connection, self.schema, temporary, aliases)):
                raise CatalogError('ingress-store-catalog-mismatch')
        finally:
            _execute(connection, 'DROP TABLE ' + _q(self.schema) + '.' + _q(temporary) + ' CASCADE')

    def insert_epoch(self, record: dict[str, Any]) -> None:
        checked, digest = _validate_store_record(record, EPOCH_PROFILE)
        if checked['providerId'] != self.provider_id or checked['installationId'] != self.installation_id:
            raise CatalogError('ingress-record-target-mismatch')
        if (checked['state'] not in ('prepared', 'active')
                or checked['targetCustody'] != self._custody.target_custody):
            raise CatalogError('ingress-epoch-initial-state-invalid')
        self.verify_original_store()
        count, maximum = _one(self._connection, 'SELECT count(*),COALESCE(max(custody_sequence),0) FROM '
                              + _q(self.schema) + '."epochs" WHERE provider_id=%s AND installation_id=%s',
                              (self.provider_id, self.installation_id))
        if count >= 4096 or checked['custodySequence'] <= maximum:
            raise CatalogError('ingress-history-capacity-or-order')
        from psycopg.types.json import Jsonb
        columns = _record_columns(checked)
        result = _one(self._connection, 'INSERT INTO ' + _q(self.schema) + '."epochs" '
             '(provider_id,installation_id,epoch,state,source_digest,bundle_digest,head_digest,principals_digest,custody_sequence,record,record_digest) '
             'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING epoch',
             (*columns, Jsonb(checked), digest))
        if result != (checked['epoch'],):
            raise CatalogError('ingress-record-write-failed')

    def insert_transition(self, record: dict[str, Any]) -> dict[str, Any]:
        """Insert the original prepared transition once; exact replay is safe."""
        checked, digest = _validate_store_record(record, TRANSITION_PROFILE)
        request = checked['request']
        if (checked['state'] != 'prepared' or checked['phaseIndex'] != 0
                or checked['fenceReceipt'] is not None or checked['phaseReceipt'] is not None
                or checked['phaseBudgetReceipt'] is not None or checked['publicationReceipt'] is not None
                or request['providerId'] != self.provider_id
                or request['installationId'] != self.installation_id
                or request['targetCustody'] != self._custody.target_custody):
            raise CatalogError('ingress-transition-initial-state-invalid')
        self.verify_original_store()
        existing = self._read_transition_on(self._connection, checked['transitionId'])
        if existing is not None:
            if existing == checked:
                return checked
            raise CatalogError('ingress-transition-conflict')
        count = _one(self._connection, 'SELECT count(*) FROM ' + _q(self.schema)
                     + '."transitions" WHERE provider_id=%s AND installation_id=%s',
                     (self.provider_id, self.installation_id))[0]
        if count >= 4096:
            raise CatalogError('ingress-history-capacity')
        old = self.read_epoch(request['oldEpoch'])
        new = self.read_epoch(request['newEpoch'])
        if old is None or new is None:
            raise CatalogError('ingress-transition-epoch-missing')
        if (old['state'] != 'active' or new['state'] != 'prepared'
                or old['targetCustody'] != new['targetCustody']
                or old['targetCustody'] != request['targetCustody']
                or old['principalsDigest'] != request['oldPrincipalsDigest']
                or new['principalsDigest'] != request['newPrincipalsDigest']
                or old['sourceDigest'] != request['previousSourceDigest']
                or old['bundleDigest'] != request['previousBundleDigest']
                or new['sourceDigest'] != request['nextSourceDigest']
                or new['bundleDigest'] != request['nextBundleDigest']
                or old['headDigest'] != request['expectedHead']):
            raise CatalogError('ingress-transition-epoch-mismatch')
        from psycopg.types.json import Jsonb
        columns = _record_columns(checked)
        result = _one(self._connection, 'INSERT INTO ' + _q(self.schema) + '."transitions" '
                      '(transition_id,provider_id,installation_id,old_epoch,new_epoch,request_digest,reservation_digest,state,phase_index,record,record_digest) '
                      'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING transition_id',
                      (*columns, Jsonb(checked), digest))
        if result != (checked['transitionId'],):
            raise CatalogError('ingress-record-write-failed')
        return checked

    def read_epoch(self, epoch: str) -> dict[str, Any] | None:
        _uuid(epoch); self.verify_original_store()
        return self._read_epoch_on(self._connection, epoch)

    def _read_epoch_on(self, connection: Any, epoch: str) -> dict[str, Any] | None:
        row = _one(connection, 'SELECT provider_id,installation_id,epoch,state,source_digest,bundle_digest,head_digest,principals_digest,custody_sequence,record,record_digest '
                   'FROM ' + _q(self.schema) + '."epochs" WHERE provider_id=%s AND installation_id=%s AND epoch=%s',
                   (self.provider_id, self.installation_id, epoch))
        if row is None:
            return None
        return self._checked_row(row, EPOCH_PROFILE)

    def read_transition(self, transition_id: str) -> dict[str, Any] | None:
        _uuid(transition_id); self.verify_original_store()
        row = _one(self._connection, 'SELECT transition_id,provider_id,installation_id,old_epoch,new_epoch,request_digest,reservation_digest,state,phase_index,record,record_digest '
                   'FROM ' + _q(self.schema) + '."transitions" WHERE transition_id=%s', (transition_id,))
        if row is None:
            return None
        return self._checked_row(row, TRANSITION_PROFILE)

    def _checked_row(self, row: tuple[Any, ...], profile: str) -> dict[str, Any]:
        record, stored_digest = row[-2], row[-1]
        checked, digest = _validate_store_record(record, profile)
        if digest != stored_digest or tuple(row[:-2]) != _record_columns(checked):
            raise CatalogError('ingress-record-column-mismatch')
        provider_id, installation_id = _record_target(checked)
        if provider_id != self.provider_id or installation_id != self.installation_id:
            raise CatalogError('ingress-record-target-mismatch')
        return checked

    def advance_transition(self, transition_id: str, expected_state: str,
                           next_record: dict[str, Any]) -> dict[str, Any]:
        """CAS one legal durable transition; caller owns outer controller xact."""
        checked, _ = _validate_store_record(next_record, TRANSITION_PROFILE)
        if expected_state == 'cutover' or checked['state'] in ('cutover', 'published'):
            raise CatalogError('ingress-publication-hook-required')
        self.verify_original_store()
        return self._advance_transition_on(self._connection, transition_id,
                                           expected_state, next_record)

    def _advance_transition_on(self, connection: Any, transition_id: str,
                               expected_state: str,
                               next_record: dict[str, Any], *,
                               phase_binding: _PhaseTransactionBinding | None = None
                               ) -> dict[str, Any]:
        checked, digest = _validate_store_record(next_record, TRANSITION_PROFILE)
        if checked['state'] in ('cutover', 'published'):
            self._require_effect_binding(connection, phase_binding)
        if checked['transitionId'] != _uuid(transition_id):
            raise CatalogError('ingress-transition-conflict')
        if type(expected_state) is not str:
            raise CatalogError('ingress-transition-conflict')
        current = self._read_transition_on(connection, transition_id)
        if current is None:
            raise CatalogError('ingress-transition-missing')
        if current == checked:
            return checked
        if current['state'] != expected_state or not _legal_transition(current, checked):
            raise CatalogError('ingress-transition-conflict')
        from psycopg.types.json import Jsonb
        columns = _record_columns(checked)
        result = _one(connection, 'UPDATE ' + _q(self.schema) + '."transitions" SET '
                      'state=%s,phase_index=%s,record=%s,record_digest=%s '
                      'WHERE transition_id=%s AND state=%s RETURNING transition_id',
                      (checked['state'], checked['phaseIndex'], Jsonb(checked), digest,
                       transition_id, expected_state))
        if result is None or result[0] != transition_id:
            raise CatalogError('ingress-transition-conflict')
        # The DB columns are not mutable except the legal CAS fields. This
        # tuple check also documents the duplicated identity binding.
        if columns[:7] != _record_columns(current)[:7]:
            raise CatalogError('ingress-transition-conflict')
        return checked

    def _read_transition_on(self, connection: Any, transition_id: str) -> dict[str, Any] | None:
        _uuid(transition_id)
        row = _one(connection, 'SELECT transition_id,provider_id,installation_id,old_epoch,new_epoch,request_digest,reservation_digest,state,phase_index,record,record_digest '
                   'FROM ' + _q(self.schema) + '."transitions" WHERE transition_id=%s', (transition_id,))
        if row is None:
            return None
        return self._checked_row(row, TRANSITION_PROFILE)

    def record_phase_in_transaction(self, phase_binding: _PhaseTransactionBinding, *,
                                    transition_id: str, expected_state: str,
                                    next_record: dict[str, Any]) -> dict[str, Any]:
        """Persist phase receipt on the host's current business transaction.

        The sealed binding belongs to a concrete private host lease. This
        method executes only fixed controller DML on that same transaction.
        """
        if type(phase_binding) is not _PhaseTransactionBinding:
            raise CatalogError('ingress-phase-connection-mismatch')
        phase_connection = phase_binding.connection
        try:
            self._check_phase_binding(phase_binding)
            self._require_active_transaction(phase_connection)
            checked, _ = _validate_store_record(next_record, TRANSITION_PROFILE)
            if checked['request']['targetIdentityDigest'] != phase_binding.target_identity_digest:
                raise CatalogError('ingress-phase-target-mismatch')
            before = self._phase_identity(phase_connection, phase_binding)
            self._verify_business_owner_context(phase_connection, phase_binding)
            return self._execute_controller_hook(
                phase_connection, before, phase_binding, transition_id,
                expected_state, checked)
        except BaseException:
            self._abort_and_close(phase_connection, phase_binding)
            raise

    def record_publication_in_transaction(self, phase_binding: _PhaseTransactionBinding, *,
                                          transition_id: str, expected_state: str,
                                          next_record: dict[str, Any]) -> dict[str, Any]:
        """Persist final reference/active-epoch receipt in the same transaction."""
        if type(phase_binding) is not _PhaseTransactionBinding:
            raise CatalogError('ingress-publication-state-invalid')
        connection = phase_binding.connection
        try:
            checked, _ = _validate_store_record(next_record, TRANSITION_PROFILE)
            if (checked['state'] != 'published' or checked['phaseIndex'] != 1
                    or expected_state != 'cutover'
                    or phase_binding._seal is not _CAPABILITY_SEAL):
                raise CatalogError('ingress-publication-state-invalid')
            self._check_phase_binding(phase_binding)
            self._require_active_transaction(connection)
            if checked['request']['targetIdentityDigest'] != phase_binding.target_identity_digest:
                raise CatalogError('ingress-phase-target-mismatch')
            before = self._phase_identity(connection, phase_binding)
            self._verify_business_owner_context(connection, phase_binding)
            return self._execute_controller_hook(
                connection, before, phase_binding, transition_id,
                expected_state, checked, publication=True)
        except BaseException:
            self._abort_and_close(connection, phase_binding)
            raise

    @staticmethod
    def _require_active_transaction(connection: Any) -> None:
        try:
            from psycopg.pq import TransactionStatus
            active = connection.info.transaction_status == TransactionStatus.INTRANS
        except (AttributeError, ImportError):
            active = False
        if not active:
            raise CatalogError('ingress-phase-transaction-required')

    def _phase_identity(self, connection: Any,
                        binding: _PhaseTransactionBinding) -> tuple[Any, ...]:
        row = _one(connection, """SELECT session_user,current_user,
pg_catalog.current_schemas(false),pg_catalog.current_setting('row_security'),
pg_catalog.current_setting('session_replication_role'),
pg_catalog.current_setting('server_encoding'),
pg_catalog.current_setting('transaction_isolation'),
pg_catalog.current_setting('transaction_read_only'),
pg_catalog.current_setting('role'),pg_catalog.current_setting('search_path'),
pg_catalog.current_setting('TimeZone'),
(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user),
(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=session_user),
(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()),
pg_catalog.current_setting('server_version_num')::pg_catalog.int4,
pg_catalog.current_database(),
(SELECT system_identifier FROM pg_catalog.pg_control_system())""")
        normalized = self._normalize_phase_row(row)
        if (normalized[0] != binding.session_user or normalized[1] != binding.business_owner
                or normalized[2] != ['pg_catalog']
                or normalized[3:8] != ('on', 'origin', 'UTF8', 'read committed', 'off')
                or normalized[8:11] != (binding.business_owner, 'pg_catalog', 'UTC')
                or normalized[11] != binding.business_owner_oid
                or normalized[12] != binding.session_user_oid or normalized[13] != binding.database_oid
                or normalized[14] != 180006 or normalized[15] != self.database_name
                or normalized[16] != self.database_system_identifier):
            raise CatalogError('ingress-phase-identity-mismatch')
        return normalized

    @staticmethod
    def _normalize_phase_row(row: Any) -> tuple[Any, ...]:
        if type(row) is not tuple or len(row) != 17:
            raise CatalogError('ingress-phase-identity-mismatch')
        identifier = row[16]
        if type(identifier) not in (int, str):
            raise CatalogError('ingress-phase-identity-mismatch')
        try:
            normalized_identifier = _system_identifier(str(identifier))
        except CatalogError:
            raise CatalogError('ingress-phase-identity-mismatch') from None
        return (*row[:16], normalized_identifier)

    def _check_phase_binding(self, binding: _PhaseTransactionBinding) -> None:
        if (type(binding) is not _PhaseTransactionBinding
                or binding._invalidated
                or binding._seal is not _CAPABILITY_SEAL
                or binding.provider_id != self.provider_id
                or binding.installation_id != self.installation_id
                or binding.session_user != self._custody.maintenance_user
                or binding.session_user_oid != self._custody.maintenance_user_oid
                or binding.business_owner != self._custody.business_owner
                or binding.business_owner_oid != self._custody.business_owner_oid
                or binding.database_oid != self.database_oid):
            raise CatalogError('ingress-phase-connection-mismatch')

    def _require_effect_binding(self, connection: Any,
                                binding: _PhaseTransactionBinding | None) -> None:
        if type(binding) is not _PhaseTransactionBinding or binding.connection is not connection:
            raise CatalogError('ingress-phase-transaction-required')
        self._check_phase_binding(binding)

    @staticmethod
    def _abort_and_close(connection: Any, binding: _PhaseTransactionBinding) -> None:
        """Invalidate the lease, then attempt rollback and unconditional close."""
        object.__setattr__(binding, '_invalidated', True)
        try:
            connection.rollback()
        except BaseException:  # noqa: BLE001 - cleanup must not mask the primary hook error
            _LOG.debug('rollback failed while aborting failed phase hook')
        finally:
            try:
                connection.close()
            except BaseException:  # noqa: BLE001 - cleanup must not mask the primary hook error
                _LOG.debug('close failed while aborting failed phase hook')

    def _verify_business_owner_context(self, connection: Any,
                                       binding: _PhaseTransactionBinding) -> None:
        self._phase_identity(connection, binding)
        if (self._set_membership_snapshot(connection, binding.session_user_oid)
                != self._custody.membership_observations):
            raise CatalogError('ingress-phase-identity-mismatch')
        self._verify_principal_observations(connection)

    def _execute_controller_hook(self, connection: Any, before: tuple[Any, ...],
                                 binding: _PhaseTransactionBinding,
                                 transition_id: str, expected_state: str,
                                 next_record: dict[str, Any], *,
                                 publication: bool = False) -> dict[str, Any]:
        _execute(connection, 'SET LOCAL ROLE ' + _q(self.controller_role))
        state = _one(connection, """SELECT session_user,current_user,
pg_catalog.current_schemas(false),pg_catalog.current_setting('row_security'),
pg_catalog.current_setting('session_replication_role'),
pg_catalog.current_setting('server_encoding'),
pg_catalog.current_setting('transaction_isolation'),
pg_catalog.current_setting('transaction_read_only'),
pg_catalog.current_setting('role'),pg_catalog.current_setting('search_path'),
pg_catalog.current_setting('TimeZone'),
(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user),
(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=session_user),
(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()),
pg_catalog.current_setting('server_version_num')::pg_catalog.int4,
pg_catalog.current_database(),
(SELECT system_identifier FROM pg_catalog.pg_control_system())""")
        controller_identity = (binding.session_user, self.controller_role,
                               before[2], before[3], before[4], before[5],
                               before[6], before[7], self.controller_role,
                               'pg_catalog', 'UTC', self.controller_oid,
                               binding.session_user_oid, binding.database_oid,
                               180006, self.database_name, self.database_system_identifier)
        state = self._normalize_phase_row(state)
        controller_identity = (*controller_identity[:16], self.database_system_identifier)
        if state != controller_identity:
            raise CatalogError('ingress-phase-controller-mismatch')
        self._verify_controller_session(connection)
        if self._schema_oid is None:
            raise CatalogError('ingress-store-custody-required')
        self._verify_store_shape(self._schema_oid, connection)
        if publication:
            result = self._publish_transition_on(connection, transition_id,
                                                 expected_state, next_record,
                                                 phase_binding=binding)
        else:
            result = self._advance_transition_on(connection, transition_id,
                                                 expected_state, next_record,
                                                 phase_binding=binding)
        # Always restore the fixed business-owner role, never RESET ROLE (which
        # would return to the distinct maintenance SESSION_USER).
        _execute(connection, 'SET LOCAL ROLE ' + _q(binding.business_owner))
        after = self._phase_identity(connection, binding)
        self._verify_business_owner_context(connection, binding)
        if after != before:
            raise CatalogError('ingress-phase-restore-mismatch')
        return result

    def _publish_transition_on(self, connection: Any, transition_id: str,
                               expected_state: str,
                               following: dict[str, Any], *,
                               phase_binding: _PhaseTransactionBinding | None = None
                               ) -> dict[str, Any]:
        """Atomically publish the transition and swap its two admitted epochs."""
        self._require_effect_binding(connection, phase_binding)
        current = self._read_transition_on(connection, transition_id)
        if (current is None or current['state'] != expected_state
                or expected_state != 'cutover' or not _legal_transition(current, following)):
            raise CatalogError('ingress-transition-conflict')
        request = current['request']
        reference = following['publicationReceipt']
        if (reference['version'] != 'umf.table-installation/0.3'
                or reference['bundleDigest'] != request['nextBundleDigest']
                or reference['sourceDigest'] != request['nextSourceDigest']
                or reference['planDigest'] != request['planDigest']
                or reference['approvalPlanDigest'] != request['planDigest']):
            raise CatalogError('ingress-publication-binding-mismatch')
        old = self._read_epoch_on(connection, request['oldEpoch'])
        new = self._read_epoch_on(connection, request['newEpoch'])
        if (old is None or new is None or old['state'] != 'active'
                or new['state'] != 'prepared'
                or old['headDigest'] != request['expectedHead']
                or old['sourceDigest'] != request['previousSourceDigest']
                or old['bundleDigest'] != request['previousBundleDigest']
                or new['sourceDigest'] != request['nextSourceDigest']
                or new['bundleDigest'] != request['nextBundleDigest']
                or old['principalsDigest'] != request['oldPrincipalsDigest']
                or new['principalsDigest'] != request['newPrincipalsDigest']
                or old['targetCustody'] != request['targetCustody']
                or new['targetCustody'] != request['targetCustody']):
            raise CatalogError('ingress-transition-epoch-mismatch')
        old_next = dict(old)
        old_next['state'] = 'retired'
        new_next = dict(new)
        new_next['state'] = 'active'
        new_next['headDigest'] = reference['headDigest']
        self._replace_epoch_state_on(connection, old, old_next)
        self._replace_epoch_state_on(connection, new, new_next)
        return self._advance_transition_on(connection, transition_id,
                                           expected_state, following,
                                           phase_binding=phase_binding)

    def _replace_epoch_state_on(self, connection: Any, current: dict[str, Any],
                                following: dict[str, Any]) -> None:
        checked, digest = _validate_store_record(following, EPOCH_PROFILE)
        allowed = {('active', 'retired'), ('prepared', 'active')}
        immutable = ('profile', 'providerId', 'enrollmentId', 'installationId',
                     'targetCustody', 'epoch', 'sourceDigest', 'bundleDigest',
                     'principals', 'principalsDigest', 'custodySequence', 'origin',
                     'originReceipt')
        if ((current['state'], checked['state']) not in allowed
                or any(current[key] != checked[key] for key in immutable)
                or current['state'] == 'active' and current['headDigest'] != checked['headDigest']):
            raise CatalogError('ingress-epoch-conflict')
        from psycopg.types.json import Jsonb
        result = _one(connection, 'UPDATE ' + _q(self.schema) + '."epochs" '
                      'SET state=%s,head_digest=%s,record=%s,record_digest=%s '
                      'WHERE provider_id=%s AND installation_id=%s AND epoch=%s AND state=%s '
                      'AND record_digest=%s RETURNING epoch',
                      (checked['state'], checked['headDigest'], Jsonb(checked), digest,
                       self.provider_id, self.installation_id, checked['epoch'],
                       current['state'], _digest(current)))
        if result != (checked['epoch'],):
            raise CatalogError('ingress-epoch-conflict')


def _legal_transition(current: dict[str, Any], following: dict[str, Any]) -> bool:
    states = {'prepared': ('fencing',), 'fencing': ('fenced',),
              'fenced': ('cutover',), 'cutover': ('published',), 'published': ()}
    if following['state'] not in states[current['state']]:
        return False
    immutable = ('transitionId', 'request', 'requestDigest', 'ingressApprovalDigest',
                 'reservation', 'reservationDigest', 'executionPolicy')
    if any(current[key] != following[key] for key in immutable):
        return False
    if following['state'] in ('prepared', 'fencing', 'fenced') and following['phaseIndex'] != 0:
        return False
    if following['state'] in ('cutover', 'published') and following['phaseIndex'] != 1:
        return False
    if current['state'] == 'prepared' and following['fenceReceipt'] is not None:
        return False
    if current['state'] == 'fencing' and following['fenceReceipt'] is None:
        return False
    if current['state'] in ('fenced', 'cutover', 'published') and (
            current['fenceReceipt'] != following['fenceReceipt']):
        return False
    if current['state'] in ('prepared', 'fencing') and (
            following['phaseReceipt'] is not None
            or following['phaseBudgetReceipt'] is not None
            or following['publicationReceipt'] is not None):
        return False
    if current['state'] in ('cutover', 'published') and (
            current['phaseReceipt'] != following['phaseReceipt']
            or current['phaseBudgetReceipt'] != following['phaseBudgetReceipt']):
        return False
    if current['state'] == 'fenced' and following['publicationReceipt'] is not None:
        return False
    if current['state'] == 'fenced' and (
            following['phaseReceipt'] is None
            or following['phaseBudgetReceipt'] is None
            or following['publicationReceipt'] is not None):
        return False
    if current['state'] == 'cutover' and (
            following['publicationReceipt'] is None):
        return False
    if current['state'] != 'cutover' and following['publicationReceipt'] is not None:
        return False
    return not (current['state'] == 'published' and current != following)

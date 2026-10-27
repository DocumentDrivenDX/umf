"""Source controls for the concrete G11 local owner supervisor."""
from __future__ import annotations

import copy
import hashlib
import json
import os
import sys
import tempfile
import time
import unittest
import uuid
from contextlib import contextmanager
from enum import IntEnum
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from umf_access.lifecycle import ingress_local_postgres as native
from umf_access.lifecycle import owner_bootstrap as bootstrap
from umf_access.lifecycle.ingress_local_postgres import (
    _NATIVE_EFFECT_OUTCOME_SEAL,
    _ORIGINAL_STORE_ATTEMPT_SEAL,
    _ORIGINAL_STORE_BUDGET_SEAL,
    _ORIGINAL_STORE_RESERVATION_SEAL,
    _VERIFIED_STORE_PREPARATION_SEAL,
    LocalPostgresError,
    LocalPostgresSupervisor,
    _AttachedPostmaster,
    _BudgetedOriginalStoreConnection,
    _BudgetedOriginalStoreReadonlyConnection,
    _canonical,
    _digest,
    _membership_grant_statements,
    _NativeAttestation,
    _NativeEffectReservation,
    _ordered_membership_payload,
    _ordered_required_memberships,
    _OriginalStoreCreationAttempt,
    _OriginalStoreCreationBudget,
    _OriginalStoreCreationReservation,
    _owner_registration_approval_payload,
    _postmaster_pidfile_matches,
    _PreparedOriginalPrincipals,
    _PreparedTargetRegistration,
    _private_directory,
    _read_bootstrap_enrollment,
    _read_owned_regular_nofollow,
    _registration_intent_bytes,
    _render_config,
    _render_hba,
    _store_descriptor,
    _SupervisorJournal,
    _validate_bootstrap_context_journal,
    _VerifiedNativeEffectOutcome,
    _VerifiedNativeStorePreparation,
    _verify_bootstrap_enrollment,
    _write_private,
)
from umf_access.lifecycle.owner_authority import OwnerApprovalRequest
from umf_access.lifecycle.row_originals import open_originals_store_recovery


def _patch_supervisor_method(method, **kwargs):
    """Patch a slotted supervisor method with normal descriptor binding."""
    return patch.object(LocalPostgresSupervisor, method, autospec=True, **kwargs)


@contextmanager
def _synthetic_control_lease(supervisor, operation_kind):
    """Bypass only the physical lock for isolated method-logic fixtures."""
    lease = SimpleNamespace(_operation_kind=operation_kind)
    if not hasattr(supervisor, '_authority_context'):
        object.__setattr__(supervisor, '_authority_context', object())
    object.__setattr__(supervisor, '_active_control_lease', lease)
    with patch('umf_access.lifecycle.ingress_local_postgres._resolve_original_control_lease',
               return_value=lease):
        yield lease


class LocalPostgresSupervisorSourceTests(unittest.TestCase):
    def _creation_budget_fixture(self):
        request = SimpleNamespace(effect_key=('native-store-creation', 'store'),
                                  _intent_digest='a' * 64)
        evidence = SimpleNamespace(owner_request=request)
        approval = SimpleNamespace(approval_digest='b' * 64)
        custodian, target, connection = object(), object(), object()
        store = {'profile': 'umf.native-row-originals-store/0.1', 'storeId': 'store'}
        supervisor = object.__new__(LocalPostgresSupervisor)
        supervisor._owner_core = SimpleNamespace(configuration_digest='c' * 64)
        supervisor._original_store_issuer_pid = os.getpid()
        budget = _OriginalStoreCreationBudget(
            _ORIGINAL_STORE_BUDGET_SEAL, supervisor, request=request,
            evidence=evidence, approval=approval, custodian=custodian,
            target=target, connection=connection, store=store,
            started_ns=1_000_000_000,
            caller_timeout_lower_ms=(('lock_timeout', 0), ('statement_timeout', 0)))
        reservation = _OriginalStoreCreationReservation(
            _ORIGINAL_STORE_RESERVATION_SEAL, supervisor, evidence=evidence,
            approval=approval, custodian=custodian, target=target,
            connection=connection, effect_handle=object(),
            native_effect=SimpleNamespace(_request=request),
            record_bytes=b'{}', store=store, budget=budget)
        object.__setattr__(budget, '_reservation', reservation)
        reservation_digest = hashlib.sha256(b'{}').hexdigest()
        object.__setattr__(budget, '_reservation_digest', reservation_digest)
        supervisor._original_store_budgets = {id(request): budget}
        supervisor._original_store_reservations = {id(reservation): (
            reservation, {'reservationDigest': reservation_digest,
                          'supervisorIntentDigest': 'e' * 64}, {})}
        reservation._native_effect._journal_record_digest = 'e' * 64
        return supervisor, reservation, budget

    def test_store_recovery_rejects_active_original_connection_before_journal_reads(self):
        supervisor = object.__new__(LocalPostgresSupervisor)
        target = object()
        connection = SimpleNamespace(info=SimpleNamespace(transaction_status=2))
        supervisor._custody_handle = None
        supervisor._authority_context = object()
        supervisor._journal = object()
        with (_patch_supervisor_method('_require_original_control_lease') as lease,
              self.assertRaisesRegex(
                  LocalPostgresError,
                  'local-postgresql-store-readonly-transaction-active')):
            supervisor.recover_originals_store_creation(
                target, connection, store={
                    'profile': 'umf.native-row-originals-store/0.1',
                    'storeId': 'provider', 'schemaName': 'umf_originals_provider'})
        lease.assert_called_once_with(supervisor, operation_kind='store')

    def test_public_recovery_facade_selects_only_the_exact_six_part_store_key(self):
        from umf_access.lifecycle.row_originals import (
            STORE_PROFILE,
            CatalogError,
            PgRowOriginalsStore,
        )

        provider_id = '33333333-3333-4333-8333-333333333333'
        registration_id = 'registration-a'
        target = object()
        reference = {'registrationId': registration_id, 'custodianId': 'custodian',
                     'resourceId': 'resource', 'incarnation': 'incarnation'}
        store = _store_descriptor(STORE_PROFILE, provider_id)
        wanted_key = (registration_id, provider_id, 'installation',
                      STORE_PROFILE, provider_id, store['schemaName'])
        other_provider_id = '55555555-5555-4555-8555-555555555555'
        other_store = _store_descriptor(STORE_PROFILE, other_provider_id)
        other_key = (registration_id, other_provider_id, 'installation',
                     STORE_PROFILE, other_provider_id, other_store['schemaName'])
        events = []
        head = '0' * 64

        def append(kind, payload):
            nonlocal head
            event = {'sequence': len(events) + 1, 'previousDigest': head,
                     'kind': kind, 'payload': payload}
            event['recordDigest'] = _digest(event)
            head = event['recordDigest']
            events.append(event)

        append('registration-intent', {'registrationId': registration_id})
        append('registration-observation', {
            'registrationId': registration_id,
            'observation': {'custodianSequence': 1},
        })
        append('registration-confirmed', {
            'registrationId': registration_id, 'targetCustody': reference,
        })

        def append_completed_store(store_id, descriptor, key):
            reservation_id = 'reservation-' + store_id
            record = {
                'profile': 'umf.row-originals-store-reservation/0.1',
                'reservationId': reservation_id, 'providerId': store_id,
                'installationId': 'installation', 'targetCustody': reference,
                'store': descriptor, 'creationRequestDigest': 'a' * 64,
                'creationApprovalDigest': 'b' * 64,
            }
            reservation_digest = _digest(record)
            append('originals-store-reserved', {
                'purpose': 'native-acceptance', 'request': {},
                'approvalDigest': record['creationApprovalDigest'],
                'reservation': record, 'reservationDigest': reservation_digest,
                'parent': {'sequence': len(events), 'headDigest': head},
            })
            receipt = {
                'profile': 'umf.originals-creation-receipt/0.1',
                'providerId': store_id, 'installationId': 'installation',
                'storeProfile': descriptor['profile'], 'storeId': store_id,
                'reservationDigest': reservation_digest,
                'creationRequestDigest': record['creationRequestDigest'],
                'creationApprovalDigest': record['creationApprovalDigest'],
                'targetCustodyDigest': _digest(reference),
                'schemaOid': 91 if key == wanted_key else 92, 'state': 'created',
            }
            observation_payload = {
                'purpose': 'native-acceptance', 'reservationId': reservation_id,
                'reservationDigest': reservation_digest,
                'supervisorIntentDigest': 'c' * 64, 'outcome': 'committed',
                'nativeReceipt': receipt, 'nativeReceiptDigest': _digest(receipt),
                'schemaOid': receipt['schemaOid'], 'nativeObservationDigest': 'd' * 64,
                'transactionOutcomeDigest': 'e' * 64,
                'parent': {'sequence': len(events), 'headDigest': head},
            }
            append('originals-store-observation', observation_payload)
            append('originals-store-confirmed', {
                'purpose': 'native-acceptance', 'reservationId': reservation_id,
                'reservationDigest': reservation_digest,
                'supervisorIntentDigest': 'c' * 64,
                'observationEventDigest': events[-1]['recordDigest'],
                'nativeReceiptDigest': _digest(receipt),
                'schemaOid': receipt['schemaOid'],
                'parent': {'sequence': len(events), 'headDigest': head},
            })

        append_completed_store(other_provider_id, other_store, other_key)
        only_other_store_events = list(events)
        append_completed_store(provider_id, store, wanted_key)

        class Connection:
            closed = False

            def __init__(self):
                self.info = SimpleNamespace(transaction_status=0)

        connection = Connection()
        supervisor = object.__new__(LocalPostgresSupervisor)
        supervisor._provider_id = provider_id
        supervisor._bound_installation_id = 'installation'
        supervisor._custodian_id = 'custodian'
        supervisor._custody_handle = None
        supervisor._authority_context = object()
        supervisor._custodian = SimpleNamespace(
            _public_reference=lambda _target: reference,
            _resolve_target_custody=lambda _target: SimpleNamespace(reference=reference),
            _journal=SimpleNamespace(_load=lambda: {'events': events}))
        supervisor._pending_original_store_recovery = (
            target, supervisor._custodian, supervisor._custodian_id,
            supervisor._authority_context, os.getpid(), reference)
        supervisor._journal = SimpleNamespace(read=lambda: {'events': [
            {'kind': 'creation-intent', 'payload': {'controllerName': 'controller'}}]})
        with (patch.dict(sys.modules, {'psycopg': SimpleNamespace(Connection=Connection)}),
              _patch_supervisor_method('_original_control_lease',
                            side_effect=lambda _supervisor, *, operation_kind:
                                _synthetic_control_lease(supervisor, operation_kind))):
            provider = open_originals_store_recovery(
                supervisor, connection, provider_id=provider_id)
        self.assertIs(type(provider), PgRowOriginalsStore)
        self.assertTrue(provider._recovery_only)
        self.assertIs(provider._target, target)
        self.assertIsNone(supervisor._custody_handle)
        self.assertEqual(provider._provider_id, provider_id)
        self.assertIsNone(provider._creation_reservation)
        with self.assertRaisesRegex(CatalogError, 'row-originals-store-recovery-required'):
            provider.verify()
        with self.assertRaisesRegex(CatalogError, 'row-originals-store-recovery-only'):
            provider.create()

        request = SimpleNamespace()
        evidence = SimpleNamespace(owner_request=request)
        approval = object()
        reservation = SimpleNamespace(
            _evidence=evidence, _approval=approval,
            _custodian=supervisor._custodian, _target=target)
        capability = object()
        receipt = {'schemaOid': 91}
        current = {'payload': {'controller': {'name': 'controller', 'oid': 901}}}
        with (_patch_supervisor_method('recover_originals_store_creation',
                           return_value=(reservation, capability, receipt)),
              _patch_supervisor_method('_resolve_original_store_capability',
                           return_value=capability),
              _patch_supervisor_method('_resolve_recovered_original_store_current_authority',
                           return_value=current),
              _patch_supervisor_method('_original_control_lease',
                           side_effect=lambda _supervisor, *, operation_kind:
                               _synthetic_control_lease(supervisor, operation_kind)),
              patch.object(PgRowOriginalsStore, '_verify_controller_session'),
              patch.object(PgRowOriginalsStore, '_verify_store')):
            self.assertEqual(provider.recover_creation(), 91)
            connection.info.transaction_status = 2
            provider.verify()
        self.assertIs(provider._creation_reservation, reservation)
        self.assertIs(provider._creation_capability, capability)
        self.assertEqual(provider._controller_role, 'controller')
        self.assertEqual(provider._controller_oid, 901)
        connection.info.transaction_status = 0
        # Exercise the missing-key refusal on an independent, freshly reattached
        # pending target. The preceding successful recovery mutates the provider
        # and owner state, which is outside this selector assertion.
        unselected = object.__new__(LocalPostgresSupervisor)
        unselected._provider_id = provider_id
        unselected._bound_installation_id = 'installation'
        unselected._custodian_id = 'custodian'
        unselected._custody_handle = None
        unselected._authority_context = object()
        unselected._journal = object()
        unselected_custodian = SimpleNamespace(
            _public_reference=lambda observed: reference if observed is target else None,
            _resolve_target_custody=lambda observed: SimpleNamespace(reference=reference)
                if observed is target else None,
            _journal=SimpleNamespace(
                _profile='umf.local-target-custody-journal/0.2',
                _load=lambda: {'events': only_other_store_events}),
        )
        unselected._custodian = unselected_custodian
        unselected._pending_original_store_recovery = (
            target, unselected_custodian, 'custodian', unselected._authority_context,
            os.getpid(), reference)
        with (patch.dict(sys.modules, {'psycopg': SimpleNamespace(Connection=Connection)}),
              _patch_supervisor_method('_original_control_lease',
                           side_effect=lambda _supervisor, *, operation_kind:
                               _synthetic_control_lease(unselected, operation_kind)),
              self.assertRaisesRegex(
                  LocalPostgresError,
                  'local-postgresql-store-recovery-outcome-unresolved')):
            open_originals_store_recovery(
                unselected, connection, provider_id=provider_id)

    def test_registration_classifies_reserved_no_intent_without_core_rehydration(self):
        from umf_access.lifecycle.ingress_custody import (
            JOURNAL_PROFILE_02,
            _replay,
        )

        provider_id = '10000000-0000-4000-8000-000000000003'
        registration_id = '10000000-0000-4000-8000-000000000009'
        owner_payload = {
            'profile': 'umf.local-owner-target-registration/0.1',
            'registrationId': registration_id,
            'custodianId': '10000000-0000-4000-8000-000000000002',
            'providerId': provider_id, 'installationId': 'installation-a',
            'ownerApproval': {
                'authorityId': 'owner-approval-authority',
                'approvalId': '10000000-0000-4000-8000-000000000004',
                'approvalDigest': 'b' * 64,
                'scope': 'enroll-owned-local-postgresql-target',
            },
            'origin': {
                'profile': 'postgresql18-local-supervised-origin/0.1',
                'supervisorId': '10000000-0000-4000-8000-000000000005',
                'clusterId': '10000000-0000-4000-8000-000000000006',
                'incarnationId': '10000000-0000-4000-8000-000000000007',
                'creationReceiptDigest': 'c' * 64,
                'nativeBinary': {'path': '/opt/pg/bin/postgres',
                                 'sha256': 'd' * 64, 'version': '18.6'},
                'dataDirectory': {'path': '/var/lib/pg/data', 'device': '1',
                                  'inode': '2', 'ownerUid': 501},
                'initialPostmaster': {'pid': 42, 'startToken': 'boot-token',
                                      'launchReceiptDigest': 'e' * 64},
                'database': {'name': 'postgres', 'oid': 5,
                             'systemIdentifier': '123456'},
                'endpoint': {'host': '127.0.0.1', 'port': 55439},
            },
            'endpointControl': {
                'controllerId': '10000000-0000-4000-8000-000000000008',
                'profile': 'umf.local-postgresql-endpoint-controller/0.1',
                'authorityReceiptDigest': 'f' * 64,
            },
        }
        registration_digest = '1' * 64
        reference = {
            'profile': 'umf.native-target-custody/0.1',
            'custodianId': '10000000-0000-4000-8000-000000000002',
            'registrationId': registration_id,
            'resourceId': '10000000-0000-4000-8000-000000000010',
            'incarnation': '10000000-0000-4000-8000-000000000011',
            'registrationDigest': registration_digest,
        }
        store = _store_descriptor('umf.native-row-originals-store/0.1', provider_id)
        evidence = {
            'profile': 'umf.pg18.original-store-authority-evidence/0.1',
            'supervisorId': '10000000-0000-4000-8000-000000000005',
            'custodianId': reference['custodianId'], 'providerId': provider_id,
            'installationId': 'installation-a',
            'ownerAuthorityId': '10000000-0000-4000-8000-000000000008',
            'ownerPolicyRevision': 'policy-a', 'registrationDigest': registration_digest,
            'targetCustodyDigest': _digest(reference),
            'authorityPreparationReceiptDigest': 'c' * 64,
            'maintenance': {'oid': 20, 'name': 'maint', 'flags': {
                'canLogin': True, 'superuser': True, 'createDatabase': False,
                'createRole': False, 'replication': False, 'bypassRls': False,
                'inherit': False}},
            'controller': {'oid': 21, 'name': 'controller', 'flags': {
                'canLogin': False, 'superuser': True, 'createDatabase': False,
                'createRole': False, 'replication': False, 'bypassRls': False,
                'inherit': False}},
            'businessOwner': {'oid': 22, 'name': 'business_owner', 'flags': {
                'canLogin': False, 'superuser': False, 'createDatabase': False,
                'createRole': False, 'replication': False, 'bypassRls': False,
                'inherit': False}},
            'requiredMemberships': [
                {'memberOid': 20, 'roleOid': 21, 'inherit': False, 'set': True,
                 'admin': False},
                {'memberOid': 20, 'roleOid': 22, 'inherit': False, 'set': True,
                 'admin': False}],
            'requiredSettings': {'searchPath': 'pg_catalog', 'timeZone': 'UTC',
                'rowSecurity': 'on', 'sessionReplicationRole': 'origin',
                'transactionReadOnly': 'off', 'transactionIsolation': 'read committed'},
            'nativeAuthorityObservationDigest': 'd' * 64,
        }
        request = {'profile': 'umf.owner-store-create-intent/0.1',
                   'store': store, 'evidence': evidence}
        reservation = {
            'profile': 'umf.row-originals-store-reservation/0.1',
            'reservationId': '10000000-0000-4000-8000-000000000012',
            'providerId': provider_id, 'installationId': 'installation-a',
            'targetCustody': reference, 'store': store,
            'creationRequestDigest': _digest(request),
            'creationApprovalDigest': 'f' * 64,
            'nativeAuthorityEvidenceDigest': 'd' * 64,
            'configurationDigest': '1' * 64, 'custodySequence': 4,
        }
        events = []
        head = '0' * 64

        def append(kind, payload):
            nonlocal head
            event = {'sequence': len(events) + 1, 'previousDigest': head,
                     'kind': kind, 'payload': payload}
            event['recordDigest'] = _digest(event)
            events.append(event)
            head = event['recordDigest']

        append('registration-intent', {
            'registrationId': registration_id,
            'registrationDigest': registration_digest,
            'ownerPayload': owner_payload,
            'ownerApproval': {
                'approvalId': owner_payload['ownerApproval']['approvalId'],
                'approvalDigest': owner_payload['ownerApproval']['approvalDigest'],
            },
        })
        append('registration-observation', {
            'registrationId': registration_id,
            'observation': {
                'profile': 'umf.local-target-registration-observation/0.1',
                'registrationDigest': registration_digest,
                'originReceiptDigest': 'c' * 64,
                'currentLaunchReceiptDigest': '2' * 64,
                'continuityChainDigest': '3' * 64,
                'endpointGateReceiptDigest': 'f' * 64,
                'nativeObservationDigest': '4' * 64,
                'custodianSequence': 1,
            },
        })
        append('registration-confirmed', {
            'registrationId': registration_id, 'targetCustody': reference,
        })
        append('originals-store-reserved', {
            'purpose': 'native-acceptance', 'request': request,
            'approvalDigest': reservation['creationApprovalDigest'],
            'reservation': reservation, 'reservationDigest': _digest(reservation),
            'parent': {'sequence': len(events), 'headDigest': head},
        })
        replayed = _replay(events, profile=JOURNAL_PROFILE_02)
        target = object()
        supervisor = object.__new__(LocalPostgresSupervisor)
        supervisor._provider_id = provider_id
        supervisor._bound_installation_id = 'installation-a'
        supervisor._supervisor_id = evidence['supervisorId']
        supervisor._custodian_id = reference['custodianId']
        supervisor._authority_context = object()
        supervisor._custody_handle = target
        supervisor._journal = SimpleNamespace(read=lambda: {'events': [
            {'kind': 'creation-intent', 'payload': {'controllerName': 'controller'}}]})
        verified_target = SimpleNamespace(reference=reference)
        supervisor._custodian = SimpleNamespace(
            _public_reference=lambda observed: reference if observed is target else None,
            _resolve_target_custody=lambda observed:
                verified_target if observed is target else None,
            _journal=SimpleNamespace(_profile=JOURNAL_PROFILE_02,
                                     _load=lambda: {'events': events}))
        supervisor._owner_core = SimpleNamespace(
            _recover_original_request=lambda *_a, **_k:
                self.fail('registration must not rehydrate the owner Core'))
        supervisor._pending_original_store_recovery = None
        with _patch_supervisor_method('_require_original_control_lease'):
            self.assertTrue(supervisor._validate_original_store_custody_history(target))
        self.assertEqual(len(events), 4)
        self.assertIs(supervisor._custody_handle, target)
        self.assertIs(supervisor._pending_original_store_recovery[0], target)
        self.assertEqual(next(iter(replayed['stores'].values()))['status'], 'reserved')

        class Connection:
            closed = False

            def __init__(self):
                self.info = SimpleNamespace(transaction_status=0)

        connection = Connection()
        supervisor._custody_handle = None  # registration reattach exposes only the reference
        with (patch.dict(sys.modules, {'psycopg': SimpleNamespace(Connection=Connection)}),
              _patch_supervisor_method('_original_control_lease',
                           side_effect=lambda _supervisor, *, operation_kind:
                               _synthetic_control_lease(supervisor, operation_kind))):
            provider = open_originals_store_recovery(
                supervisor, connection, provider_id=provider_id)
        self.assertTrue(provider._recovery_only)
        self.assertIs(provider._target, target)
        self.assertIsNone(provider._creation_reservation)
        self.assertIsNone(supervisor._custody_handle)

        reservation_digest = _digest(reservation)
        receipt = {
            'profile': 'umf.originals-creation-receipt/0.1',
            'providerId': provider_id, 'installationId': 'installation-a',
            'storeProfile': store['profile'], 'storeId': store['storeId'],
            'reservationDigest': reservation_digest,
            'creationRequestDigest': reservation['creationRequestDigest'],
            'creationApprovalDigest': reservation['creationApprovalDigest'],
            'targetCustodyDigest': _digest(reference),
            'schemaOid': 91, 'state': 'created',
        }
        append('originals-store-observation', {
            'purpose': 'native-acceptance',
            'reservationId': reservation['reservationId'],
            'reservationDigest': reservation_digest,
            'supervisorIntentDigest': '2' * 64, 'outcome': 'committed',
            'nativeReceipt': receipt, 'nativeReceiptDigest': _digest(receipt),
            'schemaOid': 91, 'nativeObservationDigest': '3' * 64,
            'transactionOutcomeDigest': '4' * 64,
            'parent': {'sequence': len(events),
                       'headDigest': events[-1]['recordDigest']},
        })
        observed = _replay(events, profile=JOURNAL_PROFILE_02)
        self.assertEqual(next(iter(observed['stores'].values()))['status'],
                         'observed-committed')
        # An external committed observation is not a predecessor for either
        # supervisor journal event. Registration must not accept this prefix
        # just because the store journal contains a receipt-shaped payload.
        self.assertFalse(any(event['kind'] == 'originals-store-creation-intent'
                             for event in supervisor._journal.read()['events']))
        self.assertFalse(any(event['kind'] == 'native-effect-intent'
                             and event['payload'].get('scope') == 'native-store-creation'
                             for event in supervisor._journal.read()['events']))
        supervisor._custody_handle = target
        with (_patch_supervisor_method('_require_original_control_lease'),
              self.assertRaisesRegex(
                  LocalPostgresError,
                  'local-postgresql-store-history-supervisor-mismatch')):
            supervisor._validate_original_store_custody_history(target)
        supervisor._custody_handle = None

    def test_store_lease_accepts_only_the_issuer_bound_pending_target_for_rehydration(self):
        target, context, reference = object(), object(), {'registrationId': 'registration'}
        custodian = SimpleNamespace(
            _public_reference=lambda observed: reference if observed is target else None,
            _resolve_target_custody=lambda observed: SimpleNamespace(reference=reference)
                if observed is target else None,
        )
        supervisor = object.__new__(LocalPostgresSupervisor)
        supervisor._custody_handle = None
        supervisor._custodian = custodian
        supervisor._custodian_id = 'custodian'
        supervisor._authority_context = context
        supervisor._journal = object()
        supervisor._pending_original_store_recovery = (
            target, custodian, 'custodian', context, os.getpid(), reference)
        with _patch_supervisor_method(
                '_require_original_control_lease',
                side_effect=lambda _supervisor, *, operation_kind:
                    self.assertEqual(operation_kind, 'store')):
            supervisor._require_original_store_recovery_target(target)
            with self.assertRaisesRegex(
                    LocalPostgresError, 'local-postgresql-store-recovery-unverified'):
                supervisor._require_original_store_recovery_target(object())
        self.assertIsNone(supervisor._custody_handle)

    def test_public_recovery_facade_rejects_an_unselected_provider_before_reading(self):
        class Connection:
            closed = False

            def __init__(self):
                self.info = SimpleNamespace(transaction_status=0)

        supervisor = object.__new__(LocalPostgresSupervisor)
        supervisor._provider_id = '33333333-3333-4333-8333-333333333333'
        supervisor._journal = object()
        supervisor._custodian = object()
        supervisor._custody_handle = object()
        with (_patch_supervisor_method(
                  '_original_control_lease',
                  side_effect=lambda _supervisor, *, operation_kind:
                      _synthetic_control_lease(supervisor, operation_kind)),
              self.assertRaisesRegex(
                  LocalPostgresError, 'local-postgresql-store-recovery-unavailable')):
            open_originals_store_recovery(
                supervisor, Connection(),
                provider_id='44444444-4444-4444-8444-444444444444')

    def test_public_recovery_facade_rejects_forged_and_subclass_supervisors_before_lease(self):
        from umf_access.lifecycle.row_originals import CatalogError

        class ForgedSupervisor:
            def _original_control_lease(self, *, operation_kind):
                raise AssertionError('forged supervisor must not reach lease')

        class DerivedSupervisor(LocalPostgresSupervisor):
            def _original_control_lease(self, *, operation_kind):
                raise AssertionError('subclass supervisor must not reach lease')

        for supervisor in (ForgedSupervisor(), object.__new__(DerivedSupervisor)):
            with self.subTest(supervisor_type=type(supervisor).__name__):
                with self.assertRaisesRegex(
                        CatalogError, 'row-originals-store-recovery-unavailable'):
                    open_originals_store_recovery(
                        supervisor, object(),
                        provider_id='33333333-3333-4333-8333-333333333333')

    def test_original_store_readonly_transaction_refuses_active_caller_transaction(self):
        supervisor = object.__new__(LocalPostgresSupervisor)
        class Connection:
            info = SimpleNamespace(transaction_status=2)

            def transaction(self):
                raise AssertionError('must not enter caller transaction')

        connection = Connection()
        budget = object()
        with (_patch_supervisor_method('_require_original_store_readonly_budget',
                                       return_value=1_000),
              self.assertRaisesRegex(
                  LocalPostgresError,
                  'local-postgresql-store-readonly-transaction-active'),
              supervisor._original_store_readonly_transaction(connection, budget)):
            self.fail('active caller transaction must not be adopted')

    def test_original_store_readonly_sql_clamps_to_remaining_and_lower_timeouts(self):
        supervisor = object.__new__(LocalPostgresSupervisor)
        class Cursor:
            def fetchall(self):
                return [('statement_timeout', 800), ('lock_timeout', 5_000)]

        class Connection:
            pass

        connection = Connection()
        budget = SimpleNamespace(_connection=connection, _timeout_state={
            'startupStatementTimeoutMs': 800,
            'startupLockTimeoutMs': 5_000,
        })
        calls = []
        with _patch_supervisor_method('_require_original_store_readonly_budget',
                          return_value=1_200), \
             patch('umf_access.lifecycle.ingress_local_postgres._execute_original_store_sql',
                   side_effect=lambda _issuer, _budget, _connection, query, *args, **kwargs:
                       (calls.append(query) or Cursor())):
            bounded = _BudgetedOriginalStoreReadonlyConnection(
                supervisor, budget, connection)
            bounded.execute('SELECT 1')
        self.assertEqual(calls, [
            ("SELECT name, setting::pg_catalog.int8 FROM pg_catalog.pg_settings "
             "WHERE name IN ('statement_timeout','lock_timeout')"),
            "SET LOCAL lock_timeout = '1200ms'",
            "SET LOCAL statement_timeout = '800ms'",
            'SELECT 1',
        ])

    def _passive_transaction_fixture(self, *, readonly, status):
        class DriverConnection:
            def __init__(self, transaction_status):
                self.info = SimpleNamespace(transaction_status=transaction_status)
                self.transaction_calls = []
                self.control_sql = []

            @contextmanager
            def transaction(self, *args, **kwargs):
                self.transaction_calls.append((args, kwargs))
                yield self

            def execute(self, query, *args, **kwargs):
                self.control_sql.append((query, args, kwargs))

        connection = DriverConnection(status)
        if readonly:
            supervisor = object.__new__(LocalPostgresSupervisor)
            budget = SimpleNamespace(_connection=connection)
            bounded = object.__new__(_BudgetedOriginalStoreReadonlyConnection)
            object.__setattr__(bounded, '_issuer', supervisor)
            object.__setattr__(bounded, '_budget', budget)
            object.__setattr__(bounded, '_connection', connection)
            object.__setattr__(bounded, '_lower_ms', {})
            require_method = '_require_original_store_readonly_budget'
            idle_code = 'local-postgresql-store-readonly-transaction-unavailable'
            changed_code = idle_code
            expiry_code = 'local-postgresql-store-readonly-exhausted'
        else:
            supervisor, reservation, budget = self._creation_budget_fixture()
            object.__setattr__(budget, '_connection', connection)
            object.__setattr__(reservation, '_connection', connection)
            bounded = _BudgetedOriginalStoreConnection(supervisor, reservation)
            require_method = '_require_original_store_budget'
            idle_code = 'local-postgresql-store-budget-connection-state-invalid'
            changed_code = idle_code
            expiry_code = 'local-postgresql-store-budget-exhausted'
        return (supervisor, budget, connection, bounded, require_method,
                idle_code, changed_code, expiry_code)

    def test_budgeted_transaction_scope_passively_borrows_only_the_active_transaction(self):
        for readonly in (False, True):
            _supervisor, budget, connection, bounded, require_method, _idle, _changed, _expiry = (
                self._passive_transaction_fixture(readonly=readonly, status=2))
            with self.subTest(readonly=readonly):
                with _patch_supervisor_method(require_method, return_value=1_000) as require:
                    with bounded.transaction() as scoped:
                        self.assertIs(scoped, bounded)
                        self.assertEqual(connection.info.transaction_status, 2)
                        self.assertEqual(require.call_count, 1)
                    self.assertEqual(require.call_count, 2)
                    self.assertIs(require.call_args_list[0].args[1], budget
                                  if readonly else bounded._budget)
                with self.assertRaises(TypeError):
                    bounded.transaction(isolation_level='serializable')
                with self.assertRaises(TypeError):
                    bounded.transaction('serializable')
                self.assertEqual(connection.transaction_calls, [])
                self.assertEqual(connection.control_sql, [])

    def test_budgeted_transaction_scope_refuses_idle_and_aborted_connections(self):
        for readonly in (False, True):
            for status in (0, 3):
                (_supervisor, _budget, connection, bounded, require_method,
                 idle_code, _changed, _expiry) = self._passive_transaction_fixture(
                     readonly=readonly, status=status)
                with (self.subTest(readonly=readonly, status=status),
                      _patch_supervisor_method(require_method,
                                               return_value=1_000) as require,
                      self.assertRaisesRegex(LocalPostgresError, idle_code),
                      bounded.transaction()):
                    self.fail('an inactive transaction must not be borrowed')
                require.assert_called_once()
                self.assertEqual(connection.transaction_calls, [])
                self.assertEqual(connection.control_sql, [])

    def test_budgeted_transaction_scope_fails_closed_on_expiry_or_status_change(self):
        for readonly in (False, True):
            (_supervisor, _budget, connection, bounded, require_method,
             _idle_code, changed_code, expiry_code) = self._passive_transaction_fixture(
                 readonly=readonly, status=2)
            with (self.subTest(readonly=readonly, failure='expiry'),
                  _patch_supervisor_method(
                      require_method, side_effect=[1_000, LocalPostgresError(expiry_code)]),
                  self.assertRaisesRegex(LocalPostgresError, expiry_code),
                  bounded.transaction()):
                pass
            self.assertEqual(connection.transaction_calls, [])
            self.assertEqual(connection.control_sql, [])
            (_supervisor, _budget, connection, bounded, require_method,
             _idle_code, changed_code, _expiry_code) = self._passive_transaction_fixture(
                 readonly=readonly, status=2)
            with (self.subTest(readonly=readonly, failure='status-change'),
                  _patch_supervisor_method(require_method, return_value=1_000),
                  self.assertRaisesRegex(LocalPostgresError, changed_code),
                  bounded.transaction()):
                connection.info.transaction_status = 3
            self.assertEqual(connection.transaction_calls, [])
            self.assertEqual(connection.control_sql, [])

    def test_bounded_psycopg_generator_uses_finite_read_write_readiness_and_releases(self):
        class Ready(IntEnum):
            NONE = 0
            R = 1
            W = 2
            RW = 3

        class Wait(IntEnum):
            R = 1
            W = 2
            RW = 3

        class Lock:
            def __init__(self):
                self.held = False

            def acquire(self, *, blocking):
                if self.held:
                    return False
                self.held = True
                return True

            def release(self):
                self.held = False

        class Pgconn:
            status = 0
            transaction_status = 2
            pipeline_status = 0
            nonblocking = 0
            socket = 73

        class Cursor:
            def __init__(self, connection):
                self.connection = connection
                self.ready = []

            def _execute_gen(self, _query, _params, *, prepare, binary):
                self.options = (prepare, binary)
                self.ready.append((yield Wait.W))
                self.ready.append((yield Wait.RW))
                self.ready.append((yield Wait.R))

        class Connection:
            def __init__(self):
                self.closed = False
                self.autocommit = False
                self.lock = Lock()
                self.pgconn = Pgconn()

            def cursor(self):
                return Cursor(self)

        connection = Connection()
        supervisor, _reservation, budget = self._creation_budget_fixture()
        object.__setattr__(budget, '_deadline_ns', time.monotonic_ns() + 1_000_000_000)
        results = iter((([], [73], []), ([73], [], []), ([73], [], [])))
        with (patch.dict(sys.modules, {
                  'psycopg': SimpleNamespace(
                      Connection=Connection, Cursor=Cursor, __path__=[]),
                  'psycopg._enums': SimpleNamespace(Ready=Ready, Wait=Wait)}),
              _patch_supervisor_method('_require_original_store_budget', return_value=900),
              patch('umf_access.lifecycle.ingress_local_postgres.select.select',
                    side_effect=lambda *_args: next(results))):
            cursor = native._execute_original_store_sql(
                supervisor, budget, connection, 'SELECT 1', prepare=False, binary=False)
        self.assertEqual(cursor.ready, [Ready.W, Ready.R, Ready.R])
        self.assertEqual(cursor.options, (False, False))
        self.assertEqual(connection.pgconn.nonblocking, 0)
        self.assertFalse(connection.lock.held)

    def test_bounded_psycopg_first_read_stall_fences_without_blocking_fallback(self):
        class Wait(IntEnum):
            R = 1

        class Lock:
            def __init__(self):
                self.held = False

            def acquire(self, *, blocking):
                if self.held:
                    return False
                self.held = True
                return True

            def release(self):
                self.held = False

        class Pgconn:
            status = 0
            transaction_status = 2
            pipeline_status = 0
            nonblocking = 0
            socket = 73

        class Cursor:
            def __init__(self, connection):
                self.connection = connection
                self.completed = False

            def _execute_gen(self, _query, _params, *, prepare, binary):
                while True:
                    yield Wait.R

        class Connection:
            def __init__(self):
                self.closed = False
                self.autocommit = False
                self.lock = Lock()
                self.pgconn = Pgconn()

            def cursor(self):
                return Cursor(self)

        connection = Connection()
        supervisor, reservation, budget = self._creation_budget_fixture()
        object.__setattr__(budget, '_connection', connection)
        object.__setattr__(reservation, '_connection', connection)
        object.__setattr__(budget, '_deadline_ns', time.monotonic_ns() + 2_000_000)
        supervisor._original_store_connection_fences = {}
        with (patch.dict(sys.modules, {
                  'psycopg': SimpleNamespace(
                      Connection=Connection, Cursor=Cursor, __path__=[]),
                  'psycopg._enums': SimpleNamespace(
                      Ready=IntEnum('Ready', {'NONE': 0, 'R': 1, 'W': 2, 'RW': 3}),
                      Wait=Wait)}),
              _patch_supervisor_method('_require_original_store_budget', return_value=1_000),
              patch('umf_access.lifecycle.ingress_local_postgres.select.select',
                    return_value=([], [], [])),
              self.assertRaisesRegex(
                  LocalPostgresError, 'local-postgresql-store-budget-exhausted')):
            native._execute_original_store_sql(
                supervisor, budget, connection, 'SELECT 1')
        self.assertTrue(budget._fenced)
        self.assertIs(supervisor._original_store_connection_fences[id(connection)],
                      connection)
        self.assertTrue(connection.lock.held)
        self.assertEqual(connection.pgconn.nonblocking, 1)

    def test_original_store_readonly_connector_starts_with_finite_server_waits(self):
        supervisor = object.__new__(LocalPostgresSupervisor)
        supervisor._maintenance_password = b'private\n'
        supervisor._profile = SimpleNamespace(port=55439)
        budget = SimpleNamespace(_timeout_state={})
        captured = {}

        def connect(**kwargs):
            captured.update(kwargs)
            return object()

        with (patch.dict(sys.modules, {'psycopg': SimpleNamespace(connect=connect)}),
              _patch_supervisor_method('_maintenance_name', return_value='maintenance'),
              _patch_supervisor_method('_require_original_store_readonly_budget',
                                       return_value=30_000)):
            supervisor._connect_maintenance('postgres', readonly_budget=budget)
        self.assertEqual(budget._timeout_state['startupStatementTimeoutMs'], 30_000)
        self.assertEqual(budget._timeout_state['startupLockTimeoutMs'], 5_000)
        self.assertIn('-c statement_timeout=30000ms', captured['options'])
        self.assertIn('-c lock_timeout=5000ms', captured['options'])

        with (patch.dict(sys.modules, {'psycopg': SimpleNamespace(connect=connect)}),
              _patch_supervisor_method('_maintenance_name', return_value='maintenance'),
              _patch_supervisor_method('_require_original_store_readonly_budget',
                                       side_effect=LocalPostgresError(
                                           'local-postgresql-store-readonly-exhausted')),
              self.assertRaisesRegex(
                  LocalPostgresError, 'local-postgresql-store-readonly-exhausted')):
            supervisor._connect_maintenance('postgres', readonly_budget=budget)

    def test_original_store_readonly_settings_rows_are_never_rewritten(self):
        supervisor = object.__new__(LocalPostgresSupervisor)
        budget = object()
        actual_rows = [
            ('statement_timeout', '17', 'session', None, False),
            ('lock_timeout', '5', 'session', None, False),
        ]

        @contextmanager
        def owned_scope(_issuer, _connection, _budget):
            yield SimpleNamespace(
                execute=lambda _query: SimpleNamespace(fetchall=lambda: actual_rows))

        with _patch_supervisor_method('_original_store_readonly_transaction',
                          side_effect=owned_scope):
            rows = supervisor._fetch_original_store_readonly(
                object(), budget,
                'SELECT name,setting,source,sourcefile,pending_restart '
                'FROM pg_catalog.pg_settings ORDER BY name',
                current_role=None, many=True)
        self.assertIs(rows, actual_rows)
        self.assertEqual(rows[0][1], '17')
        self.assertEqual(rows[1][1], '5')

    def test_original_store_recovery_compares_stable_evidence_and_actual_readonly_mode(self):
        supervisor = object.__new__(LocalPostgresSupervisor)
        role_rows = [
            {'oid': 11, 'name': 'maintenance', 'flags': {'canLogin': True}},
            {'oid': 12, 'name': 'controller', 'flags': {'canLogin': False}},
            {'oid': 13, 'name': 'owner', 'flags': {'canLogin': False}},
        ]
        required_memberships = [
            {'memberOid': 11, 'roleOid': 12, 'inherit': False, 'set': True, 'admin': False},
            {'memberOid': 11, 'roleOid': 13, 'inherit': False, 'set': True, 'admin': False},
        ]
        original_settings = {
            'searchPath': 'pg_catalog', 'timeZone': 'UTC', 'rowSecurity': 'on',
            'sessionReplicationRole': 'origin', 'transactionReadOnly': 'off',
            'transactionIsolation': 'read committed',
        }
        actual_settings = {**original_settings, 'transactionReadOnly': 'on'}
        authority = {
            'approvalIntentDigest': 'a' * 64,
            'approvalReceiptDigest': 'b' * 64,
        }
        observation = {
            'profile': 'umf.pg18.native-session-authority-observation/0.1',
            'authorityScopeDigest': authority['approvalIntentDigest'],
            'registrationDigest': 'c' * 64, 'targetCustodyDigest': 'd' * 64,
            'nativeServerVersionNum': 180006,
            'database': {'name': 'postgres', 'oid': 1, 'systemIdentifier': 's'},
            'sessionUser': 'maintenance', 'currentUser': 'controller',
            'roleSetting': 'controller', 'settings': actual_settings,
            'principalObservations': role_rows,
            'membershipObservations': sorted([
                [11, 12, False, False, True], [11, 13, False, False, True]]),
            'privilegeClosureDigest': 'e' * 64,
        }
        original = {
            'profile': 'umf.pg18.original-store-authority-evidence/0.1',
            'supervisorId': 'supervisor', 'custodianId': 'custodian',
            'providerId': 'provider', 'installationId': 'installation',
            'ownerAuthorityId': 'authority', 'ownerPolicyRevision': 'revision',
            'registrationDigest': 'c' * 64, 'targetCustodyDigest': 'd' * 64,
            'authorityPreparationReceiptDigest': authority['approvalReceiptDigest'],
            'maintenance': role_rows[0], 'controller': role_rows[1],
            'businessOwner': role_rows[2], 'requiredMemberships': required_memberships,
            'requiredSettings': original_settings,
            'nativeAuthorityObservationDigest': 'f' * 64,
        }
        request_value = {'profile': 'umf.owner-store-create-intent/0.1',
                         'store': {'profile': 'umf.pg-generation-ingress-store/0.1',
                                   'storeId': 'store'}, 'evidence': original}
        request = SimpleNamespace(_intent_bytes=_canonical(request_value))
        budget = SimpleNamespace(_request=request, _reservation_digest='9' * 64)
        actual = {**original, 'requiredSettings': actual_settings,
                  'nativeAuthorityObservationDigest': _digest(observation)}
        with _patch_supervisor_method('_require_original_store_readonly_budget',
                          return_value=1_000):
            resolved = supervisor._resolve_original_store_recovery_observation(
                original, actual, observation, authority=authority,
                readonly_budget=budget)
        self.assertEqual(json.loads(resolved._actual_payload_bytes)['requiredSettings']
                         ['transactionReadOnly'], 'on')
        self.assertEqual(json.loads(resolved._actual_observation_bytes)['settings']
                         ['transactionReadOnly'], 'on')
        bad_membership = {**observation, 'membershipObservations': [[11, 99, False, False, True]]}
        bad_actual = {**actual, 'nativeAuthorityObservationDigest': _digest(bad_membership)}
        with (_patch_supervisor_method('_require_original_store_readonly_budget',
                                       return_value=1_000),
              self.assertRaisesRegex(
                  LocalPostgresError,
                  'local-postgresql-store-recovery-membership-mismatch')):
            supervisor._resolve_original_store_recovery_observation(
                original, bad_actual, bad_membership, authority=authority,
                readonly_budget=budget)
        drifted = {**actual, 'targetCustodyDigest': '0' * 64}
        with (_patch_supervisor_method('_require_original_store_readonly_budget',
                                       return_value=1_000),
              self.assertRaisesRegex(
                  LocalPostgresError,
                  'local-postgresql-store-recovery-authority-stale')):
            supervisor._resolve_original_store_recovery_observation(
                original, drifted, observation, authority=authority,
                readonly_budget=budget)

    def test_store_recovery_does_not_append_before_authority_and_absence_proof(self):
        supervisor = object.__new__(LocalPostgresSupervisor)
        target = object()
        store = {'profile': 'umf.native-row-originals-store/0.1',
                 'storeId': 'provider', 'schemaName': 'umf_originals_provider'}
        request_value = {
            'profile': 'umf.owner-store-create-intent/0.1', 'store': store,
            'evidence': {'nativeAuthorityObservationDigest': 'a' * 64},
        }
        intent_bytes = _canonical(request_value)
        request_digest = hashlib.sha256(intent_bytes).hexdigest()
        record = {
            'creationRequestDigest': request_digest,
            'creationApprovalDigest': 'b' * 64,
            'nativeAuthorityEvidenceDigest': 'a' * 64,
            'providerId': 'provider', 'installationId': 'installation',
            'targetCustody': {'registrationId': 'registration'}, 'store': store,
        }
        reserved = {
            'kind': 'originals-store-reserved', 'recordDigest': 'c' * 64,
            'payload': {'reservationDigest': 'd' * 64, 'request': request_value},
        }
        state = {'reservation': record, 'reservationDigest': 'd' * 64,
                 'purpose': 'production'}
        request = SimpleNamespace(
            effect_key=('native-store-creation', 'provider', store['profile'], 'provider'),
            _intent_bytes=intent_bytes, _intent_digest=request_digest)
        approval = SimpleNamespace(approval_id='approval', approval_digest='b' * 64)
        core = SimpleNamespace(
            _ledger=SimpleNamespace(find_original_request=lambda **_kwargs:
                                    {'approvalId': 'approval'}),
            _recover_original_request=lambda *_args, **_kwargs: request,
            _recover_verified_approval=lambda _request: approval,
            _resolve_verified_approval=lambda *_args, **_kwargs: None,
            _bind_effect_digest=lambda *_args, **_kwargs: object())
        object.__setattr__(supervisor, '_custody_handle', target)
        unrelated_store = {**store, 'storeId': 'another-provider',
                           'schemaName': 'umf_originals_another'}
        journal = SimpleNamespace(events=[
            {'kind': 'native-effect-intent', 'payload': {
                'scope': 'native-store-creation', 'effectKey': [
                    'native-store-creation', 'another-provider',
                    unrelated_store['profile'], unrelated_store['storeId']],
                'requestDigest': 'f' * 64}},
            {'kind': 'originals-store-creation-intent', 'payload': {
                'reservationDigest': 'f' * 64,
                'reservation': {'targetCustody': {'registrationId': 'registration'},
                               'providerId': 'another-provider',
                               'installationId': 'installation',
                               'store': unrelated_store}}},
        ])
        journal.read = lambda: {'events': list(journal.events)}
        object.__setattr__(supervisor, '_journal', journal)
        object.__setattr__(supervisor, '_owner_core', core)
        object.__setattr__(supervisor, '_authority_context', object())
        object.__setattr__(supervisor, '_supervisor_id', 'supervisor')
        object.__setattr__(supervisor, '_custodian_id', 'custodian')
        object.__setattr__(supervisor, '_custodian', object())
        object.__setattr__(supervisor, '_provider_id', 'provider')
        object.__setattr__(supervisor, '_bound_installation_id', 'installation')
        object.__setattr__(supervisor, '_profile', SimpleNamespace(purpose='production'))
        store_state = {**state, 'reservation': record}
        with _patch_supervisor_method('_append_supervisor_journal',
                          side_effect=AssertionError('append preceded live proof')):
            effect, outcome, recovered = supervisor._recover_original_store_effect(
                target, {'events': [reserved]}, store_state, reserved)
        self.assertIsNone(effect)
        self.assertIsNone(outcome)
        self.assertIs(recovered, request)

        proof_budget = SimpleNamespace(
            _issuer=supervisor, _request=request, _target=target,
            _reservation_digest='d' * 64)
        recovery_observation = native._VerifiedOriginalStoreRecoveryObservation(
            native._VERIFIED_STORE_RECOVERY_OBSERVATION_SEAL, supervisor,
            proof_budget, request, 'd' * 64, request_value['evidence'],
            request_value['evidence'], {'profile': 'observed'})
        absence = native._VerifiedOriginalStoreAbsence(
            native._VERIFIED_STORE_ABSENCE_SEAL, supervisor, proof_budget,
            'd' * 64, store['schemaName'], {
                'profile': 'umf.original-store-absence-proof/0.1',
                'schemaName': store['schemaName'], 'state': 'absent',
            })
        typed = {
            'kind': 'originals-store-creation-intent', 'sequence': 1,
            'recordDigest': 'e' * 64, 'previousDigest': '0' * 64,
            'payload': {},
        }
        effect_handle = SimpleNamespace(_journal_record_digest='e' * 64)

        def append_typed(_issuer, _kind, payload):
            typed['payload'] = payload
            journal.events.append(typed)
            return typed

        with (_patch_supervisor_method('_require_original_store_readonly_budget',
                           return_value=1_000),
              _patch_supervisor_method('_append_supervisor_journal',
                           side_effect=append_typed) as append,
              _patch_supervisor_method('_make_native_effect_reservation'),
              _patch_supervisor_method('_recover_original_native_effect',
                           return_value=(effect_handle, None, request)) as recover):
            recovered_effect, recovered_outcome, recovered_request = \
                supervisor._recover_original_store_effect(
                    target, {'events': [reserved]}, store_state, reserved,
                    readonly_budget=proof_budget,
                    recovery_observation=recovery_observation,
                    absence_authorization=absence)
        append.assert_called_once()
        recover.assert_called_once_with(
            supervisor, 'native-store-creation', target=target,
            expected_request_digest=request_digest,
            expected_effect_key=('native-store-creation', 'provider',
                                 store['profile'], 'provider'))
        self.assertIs(recovered_effect, effect_handle)
        self.assertIsNone(recovered_outcome)
        self.assertIs(recovered_request, request)

    def test_store_readonly_window_can_precede_reconstructed_effect_handle(self):
        supervisor = object.__new__(LocalPostgresSupervisor)
        provider_id = str(uuid.uuid4())
        store = _store_descriptor('umf.native-row-originals-store/0.1', provider_id)
        target = object()
        connection = SimpleNamespace(info=SimpleNamespace(transaction_status=0))
        request_bytes = _canonical({'profile': 'umf.owner-store-create-intent/0.1'})
        request = SimpleNamespace(
            _intent_bytes=request_bytes,
            _intent_digest=hashlib.sha256(request_bytes).hexdigest())
        record_bytes = _canonical({'reservationId': str(uuid.uuid4()), 'store': store})
        object.__setattr__(supervisor, '_provider_id', provider_id)
        object.__setattr__(supervisor, '_custody_handle', target)
        object.__setattr__(supervisor, '_original_store_readonly_connection_fences', {})
        object.__setattr__(supervisor, '_custodian', object())
        object.__setattr__(supervisor, '_original_store_issuer_pid', os.getpid())
        object.__setattr__(supervisor, '_original_store_readonly_budgets', {})
        started = time.monotonic_ns()
        budget = supervisor._mint_original_store_readonly_budget(
            None, request, None, hashlib.sha256(record_bytes).hexdigest(),
            record_bytes, 'recover', target, connection, store, started)
        self.assertIsNone(budget._reservation)
        self.assertIsNone(budget._effect)
        self.assertIs(budget._request, request)
        self.assertGreater(supervisor._require_original_store_readonly_budget(budget), 0)

    def test_original_creation_budget_is_one_two_attempt_same_request_allowance(self):
        supervisor, reservation, budget = self._creation_budget_fixture()
        with patch('umf_access.lifecycle.ingress_local_postgres.time.monotonic_ns',
                   return_value=budget._started_ns + 1):
            self.assertEqual(supervisor._consume_original_store_creation_attempt(reservation),
                             budget)
            self.assertEqual(supervisor._consume_original_store_creation_attempt(reservation),
                             budget)
            self.assertEqual(budget._attempts, 2)
            with self.assertRaisesRegex(LocalPostgresError,
                                        'local-postgresql-store-attempt-capacity'):
                supervisor._consume_original_store_creation_attempt(reservation)
        self.assertEqual(budget._attempts, 2)

    def test_public_original_store_create_budgets_the_first_controller_query(self):
        from umf_access.lifecycle.row_originals import PgRowOriginalsStore

        events = []
        budget = object()
        connection = SimpleNamespace(info=SimpleNamespace(transaction_status=2))
        supervisor = SimpleNamespace(
            _mint_original_store_creation_budget=lambda **_kwargs:
                events.append('mint') or budget,
            _capture_original_store_timeout_lower_bounds=lambda _connection, _budget:
                events.append('timeout-discovery'),
        )
        provider = object.__new__(PgRowOriginalsStore)
        provider._recovery_only = False
        provider._schema_oid = None
        provider._creation_reservation = None
        provider._connection = connection
        provider._supervisor = supervisor
        provider._evidence = object()
        provider._approval = object()
        provider._custodian = object()
        provider._target = object()
        provider._provider_id = '33333333-3333-4333-8333-333333333333'
        provider._schema = 'umf_originals_33333333'
        provider._authority = {'nativeObservation': {}}

        def stalled_first_query(_issuer, observed_budget, _connection, _query, **_kwargs):
            events.append(('controller-query', observed_budget))
            raise LocalPostgresError('local-postgresql-store-budget-exhausted')

        with (patch.object(PgRowOriginalsStore, '_refresh_authority', autospec=True,
                           side_effect=lambda _self, *, budget=None:
                               events.append(('refresh', budget))),
              patch('umf_access.lifecycle.ingress_local_postgres._execute_original_store_sql',
                    side_effect=stalled_first_query),
              patch('umf_access.lifecycle.row_originals.reserve_originals_store_creation',
                    side_effect=AssertionError('reservation must follow controller query')),
              self.assertRaisesRegex(
                  LocalPostgresError, 'local-postgresql-store-budget-exhausted')):
            provider.create()
        self.assertEqual(events[:3], ['mint', 'timeout-discovery', ('refresh', budget)])
        self.assertEqual(events[3], ('controller-query', budget))

    def test_public_original_store_resume_budgets_controller_check_with_original_allowance(self):
        from umf_access.lifecycle.row_originals import PgRowOriginalsStore

        events = []
        budget = object()
        reservation = SimpleNamespace(_budget=budget)
        connection = SimpleNamespace(info=SimpleNamespace(transaction_status=2))
        supervisor = SimpleNamespace(
            _require_original_store_budget=lambda observed: events.append(('require', observed))
                or 1_000,
            resume_originals_store_creation_attempt=Mock(
                side_effect=AssertionError('no retry after stalled preflight')),
        )
        provider = object.__new__(PgRowOriginalsStore)
        provider._recovery_only = False
        provider._connection = connection
        provider._supervisor = supervisor
        provider._creation_reservation = reservation
        provider._creation_attempt = object()
        provider._creation_receipt_fields = {}
        provider._creation_capability = None
        provider._authority = {'nativeObservation': {}}

        def stalled_first_query(_issuer, observed_budget, _connection, _query, **_kwargs):
            events.append(('controller-query', observed_budget))
            raise LocalPostgresError('local-postgresql-store-budget-exhausted')

        with (patch.object(PgRowOriginalsStore, '_refresh_authority', autospec=True,
                           side_effect=lambda _self, *, budget=None:
                               events.append(('refresh', budget))),
              patch('umf_access.lifecycle.ingress_local_postgres._execute_original_store_sql',
                    side_effect=stalled_first_query),
              self.assertRaisesRegex(
                  LocalPostgresError, 'local-postgresql-store-budget-exhausted')):
            provider.resume_creation()
        self.assertIn(('require', reservation), events)
        self.assertIn(('refresh', budget), events)
        self.assertIn(('controller-query', budget), events)
        supervisor.resume_originals_store_creation_attempt.assert_not_called()

    def test_public_authority_refresh_forwards_the_same_creation_allowance(self):
        from umf_access.lifecycle import row_originals
        from umf_access.lifecycle.row_originals import PgRowOriginalsStore

        budget = object()
        supervisor = object()
        evidence, approval, custodian, target = (object(), object(), object(), object())
        provider = object.__new__(PgRowOriginalsStore)
        provider._recovery_only = False
        provider._supervisor = supervisor
        provider._evidence = evidence
        provider._approval = approval
        provider._custodian = custodian
        provider._target = target
        expected = {'payload': {'controller': {'name': 'controller', 'oid': 901}}}
        with patch.object(row_originals, '_authority_context',
                          return_value=expected) as resolve:
            provider._refresh_authority(budget=budget)
        resolve.assert_called_once_with(
            supervisor, evidence, approval, custodian, target,
            budget_reservation=budget)
        self.assertIs(provider._authority, expected)

    def test_original_creation_budget_is_not_reminted_for_same_request(self):
        supervisor = object.__new__(LocalPostgresSupervisor)
        supervisor._owner_core = SimpleNamespace(configuration_digest='c' * 64)
        supervisor._original_store_budgets = {}
        supervisor._original_store_issuer_pid = os.getpid()
        request = SimpleNamespace(effect_key=('native-store-creation', 'store'),
                                  _intent_digest='a' * 64)
        args = {
            'evidence': SimpleNamespace(owner_request=request),
            'approval': SimpleNamespace(approval_digest='b' * 64),
            'custodian': object(), 'target': object(), 'connection': object(),
            'store': {'profile': 'umf.native-row-originals-store/0.1'},
        }
        budget = supervisor._mint_original_store_creation_budget(**args)
        self.assertIs(supervisor._original_store_budgets[id(request)], budget)
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-store-budget-already-minted'):
            supervisor._mint_original_store_creation_budget(**args)

    def test_original_creation_budget_expiry_fork_and_missing_registry_fence(self):
        supervisor, reservation, budget = self._creation_budget_fixture()
        with (patch('umf_access.lifecycle.ingress_local_postgres.time.monotonic_ns',
                    return_value=budget._deadline_ns),
              self.assertRaisesRegex(
                  LocalPostgresError, 'local-postgresql-store-budget-exhausted')):
            supervisor._require_original_store_budget(reservation)
        self.assertTrue(budget._fenced)
        supervisor, reservation, _budget = self._creation_budget_fixture()
        with (patch('umf_access.lifecycle.ingress_local_postgres.os.getpid',
                    return_value=os.getpid() + 1),
              self.assertRaisesRegex(
                  LocalPostgresError, 'local-postgresql-store-budget-unavailable')):
            supervisor._require_original_store_budget(reservation)
        supervisor, reservation, budget = self._creation_budget_fixture()
        supervisor._original_store_budgets.clear()
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-store-budget-unavailable'):
            supervisor._require_original_store_budget(reservation)
        self.assertEqual(budget._attempts, 0)

    def test_original_store_budget_rejects_rebound_reservation_digest(self):
        supervisor, reservation, _budget = self._creation_budget_fixture()
        supervisor._original_store_reservations[id(reservation)][1][
            'reservationDigest'] = 'f' * 64
        with (patch('umf_access.lifecycle.ingress_local_postgres.time.monotonic_ns',
                    return_value=1_000_000_001),
              self.assertRaisesRegex(
                  LocalPostgresError, 'local-postgresql-store-budget-unavailable')):
            supervisor._require_original_store_budget(reservation)

    def test_original_store_sql_clamps_each_timeout_to_remaining_and_existing_lower(self):
        class Cursor:
            def __init__(self, rows=()):
                self._rows = list(rows)

            def fetchall(self):
                return self._rows

        class Connection:
            def __init__(self):
                self.calls = []
                self.info = SimpleNamespace(transaction_status=2)


        supervisor, reservation, budget = self._creation_budget_fixture()
        connection = Connection()
        object.__setattr__(budget, '_connection', connection)
        object.__setattr__(reservation, '_connection', connection)
        bounded = _BudgetedOriginalStoreConnection(supervisor, reservation)
        object.__setattr__(bounded, '_lower_ms', {
            'statement_timeout': 25_000, 'lock_timeout': 4_000})
        with patch.object(LocalPostgresSupervisor, '_require_original_store_budget',
                          return_value=12_500), \
             patch('umf_access.lifecycle.ingress_local_postgres._execute_original_store_sql',
                   side_effect=lambda _issuer, _budget, _connection, query, *args, **kwargs:
                       (connection.calls.append(query) or Cursor())):
            bounded.execute('SELECT 1')
        self.assertEqual(connection.calls, [
            "SET LOCAL lock_timeout = '4000ms'",
            "SET LOCAL statement_timeout = '12500ms'", 'SELECT 1'])

    def test_original_store_sql_restores_caller_local_timeouts_without_owning_transaction(self):
        class Connection:
            autocommit = True

            def __init__(self):
                self.info = SimpleNamespace(transaction_status=2)
                self.calls = []

        supervisor, reservation, budget = self._creation_budget_fixture()
        object.__setattr__(budget, '_caller_timeout_lower_ms', (
            ('lock_timeout', 700), ('statement_timeout', 2_300)))
        connection = Connection()
        object.__setattr__(budget, '_connection', connection)
        object.__setattr__(reservation, '_connection', connection)
        bounded = _BudgetedOriginalStoreConnection(
            supervisor, reservation)
        with patch.object(LocalPostgresSupervisor, '_require_original_store_budget',
                          return_value=1_200), \
             patch('umf_access.lifecycle.ingress_local_postgres._execute_original_store_sql',
                   side_effect=lambda _issuer, _budget, _connection, query, *args, **kwargs:
                       (connection.calls.append(query) or object())):
            bounded.execute('SELECT 1')
            bounded.restore_caller_timeouts()
        self.assertEqual(connection.info.transaction_status, 2)
        self.assertEqual(connection.calls, [
            "SET LOCAL lock_timeout = '700ms'",
            "SET LOCAL statement_timeout = '1200ms'",
            'SELECT 1',
            "SET LOCAL lock_timeout = '700ms'",
            "SET LOCAL statement_timeout = '2300ms'",
        ])

    def test_original_store_timeout_restore_leaves_aborted_caller_transaction_alone(self):
        class Connection:
            def __init__(self):
                self.info = SimpleNamespace(transaction_status=3)

        supervisor, reservation, budget = self._creation_budget_fixture()
        connection = Connection()
        object.__setattr__(budget, '_connection', connection)
        object.__setattr__(reservation, '_connection', connection)
        bounded = _BudgetedOriginalStoreConnection(
            supervisor, reservation)
        with patch('umf_access.lifecycle.ingress_local_postgres._execute_original_store_sql') as execute:
            bounded.restore_caller_timeouts()
        execute.assert_not_called()

    def test_positive_original_abort_is_attempt_only_and_keeps_core_pending(self) -> None:
        connection = SimpleNamespace(info=SimpleNamespace(transaction_status=2))
        custodian_journal = SimpleNamespace(
            _load=Mock(return_value={'events': []}),
            _observe_originals_store=Mock(return_value={'recordDigest': 'f' * 64}))
        custodian = SimpleNamespace(
            _journal=custodian_journal,
            _resolve_target_custody=Mock(return_value=object()),
            _public_reference=Mock(return_value={'registrationId': 'registration'}))
        request_value = {'evidence': {'controller': {'name': 'controller', 'oid': 42}}}
        request = SimpleNamespace(
            _intent_bytes=_canonical(request_value), effect_key=('native-store-creation', 'p'))
        native_effect = SimpleNamespace(_request=request)
        budget = object()
        record = {
            'reservationId': '00000000-0000-4000-8000-000000000001',
            'store': {'schemaName': 'umf_originals_test'},
        }
        reservation = _OriginalStoreCreationReservation(
            _ORIGINAL_STORE_RESERVATION_SEAL, object(), evidence=object(),
            approval=object(), custodian=custodian, target=object(),
            connection=connection, effect_handle=object(), native_effect=native_effect,
            record_bytes=_canonical(record), store={'profile': 'profile'}, budget=budget)
        supervisor = object.__new__(LocalPostgresSupervisor)
        attempt = _OriginalStoreCreationAttempt(
            _ORIGINAL_STORE_ATTEMPT_SEAL, supervisor, reservation, connection,
            xid='123', database_name='db', database_oid=42,
            system_identifier='12345678901234567', backend_pid=99,
            backend_start='2026-01-01 00:00:00+00', budget=budget)
        next_attempt = object()
        supervisor._original_store_attempts = {id(attempt): (attempt, reservation, 'open')}
        supervisor._original_store_reservations = {
            id(reservation): (reservation, {
                'reservationDigest': 'a' * 64,
                'supervisorIntentDigest': 'b' * 64,
            }, {})}
        supervisor._profile = SimpleNamespace(purpose='production', database_name='db')
        supervisor._custodian = custodian
        supervisor._owner_payloads = {'registration': {'origin': {'origin': 'fixed'}}}
        supervisor._launch = {'nativeAttestation': object()}
        core = SimpleNamespace(observe_original_request=Mock(
            return_value=SimpleNamespace(effect_status='effect-pending')),
            _finish_effect_digest=Mock())
        supervisor._owner_core = core
        supervisor._authority_context = object()
        external_state = {'stores': {'original': {
            'id': record['reservationId'], 'status': 'reserved',
            'reservationDigest': 'a' * 64,
        }}}
        with (patch.object(LocalPostgresSupervisor, '_require_original_control_lease'),
              patch.object(LocalPostgresSupervisor,
                           '_resolve_originals_store_creation_reservation'),
              patch.object(LocalPostgresSupervisor,
                           '_original_registration_and_principal_authority',
                           return_value=({'registrationId': 'registration'}, {'authority': 1})),
              patch.object(LocalPostgresSupervisor, '_observe_native', return_value={'native': 1}),
              patch.object(LocalPostgresSupervisor, '_native_store_preparation_payload',
                           return_value=(request_value['evidence'], {})),
              patch.object(LocalPostgresSupervisor, '_native_origin_matches', return_value=True),
              patch.object(LocalPostgresSupervisor,
                           '_consume_original_store_creation_attempt',
                           return_value=budget) as charge,
              patch.object(LocalPostgresSupervisor, '_require_original_store_budget'),
              patch.object(LocalPostgresSupervisor,
                           '_budgeted_original_store_connection',
                           return_value=connection),
              patch.object(LocalPostgresSupervisor,
                           '_bind_original_store_creation_attempt',
                           return_value=next_attempt) as bind,
              patch('umf_access.lifecycle.row_originals_creation.observe_absent_creation_schema',
                    return_value={'state': 'absent'}),
              patch('umf_access.lifecycle.ingress_custody._replay',
                    return_value=external_state),
              patch.object(native, '_one', return_value=(
                  'db', 42, '12345678901234567', 99,
                  '2026-01-01 00:00:00+00', 'aborted')),
              patch.object(LocalPostgresSupervisor, '_record_native_effect_outcome') as terminal):
            result = supervisor.resume_originals_store_creation_attempt(reservation, attempt)
        self.assertIs(result, next_attempt)
        charge.assert_called_once_with(reservation)
        bind.assert_called_once_with(reservation, budget)
        custodian_journal._observe_originals_store.assert_called_once()
        self.assertEqual(custodian_journal._observe_originals_store.call_args.kwargs['outcome'],
                         'known-aborted')
        terminal.assert_not_called()
        core._finish_effect_digest.assert_not_called()
        self.assertEqual(supervisor._original_store_attempts[id(attempt)],
                         (attempt, reservation, 'consumed'))

    def test_store_retry_requires_exact_native_aborted_attempt_identity(self) -> None:
        attempt = _OriginalStoreCreationAttempt(
            _ORIGINAL_STORE_ATTEMPT_SEAL, object(), object(), object(),
            xid='123', database_name='umf', database_oid=42,
            system_identifier='12345678901234567', backend_pid=99,
            backend_start='2026-01-01 00:00:00+00', budget=None)
        validate = LocalPostgresSupervisor._require_original_store_attempt_aborted
        self.assertIsNone(validate(attempt, (
            'umf', 42, '12345678901234567', 99,
            '2026-01-01 00:00:00+00', 'aborted')))
        for row in (
                ('umf', 42, '12345678901234567', 99,
                 '2026-01-01 00:00:00+00', 'committed'),
                ('umf', 42, '12345678901234567', 99,
                 '2026-01-01 00:00:00+00', 'in progress'),
                ('umf', 42, '12345678901234568', 99,
                 '2026-01-01 00:00:00+00', 'aborted'),
                ('other', 42, '12345678901234567', 99,
                 '2026-01-01 00:00:00+00', 'aborted'),
                ('umf', True, '12345678901234567', 99,
                 '2026-01-01 00:00:00+00', 'aborted'),
                ('umf', 42, '12345678901234567', 100,
                 '2026-01-01 00:00:00+00', 'aborted'),
                None):
            with self.subTest(row=row), self.assertRaisesRegex(
                    LocalPostgresError,
                    'local-postgresql-store-attempt-noncommit-unproven'):
                validate(attempt, row)

    def test_store_retry_token_is_not_reconstructed_or_reused(self) -> None:
        reservation = object()
        connection = object()
        attempt = _OriginalStoreCreationAttempt(
            _ORIGINAL_STORE_ATTEMPT_SEAL, object(), reservation, connection,
            xid='123', database_name='umf', database_oid=42,
            system_identifier='12345678901234567', backend_pid=99,
            backend_start='2026-01-01 00:00:00+00', budget=None)
        for registry in (
                {},
                {id(attempt): (attempt, reservation, 'consumed')}):
            supervisor = object.__new__(LocalPostgresSupervisor)
            supervisor._original_store_attempts = registry
            with (patch.object(LocalPostgresSupervisor, '_require_original_control_lease'),
                  self.assertRaisesRegex(
                      LocalPostgresError,
                      'local-postgresql-store-attempt-unverified')):
                supervisor.resume_originals_store_creation_attempt(reservation, attempt)

    def test_registration_observation_consumes_flat_native_database_fields(self) -> None:
        supervisor = object.__new__(LocalPostgresSupervisor)
        request, attestation = object(), object()
        payload = {'origin': {'database': {
            'name': 'appdb', 'oid': 100, 'systemIdentifier': '123456'}}}
        object.__setattr__(supervisor, '_handles', {id(request): (request, payload, attestation)})
        native = {'databaseName': 'appdb', 'databaseOid': 100,
                  'systemIdentifier': '123456'}
        evidence = object()
        with (patch.object(LocalPostgresSupervisor, '_verify_live_process', return_value={}),
              patch.object(LocalPostgresSupervisor, '_observe_native', return_value=native),
              patch.object(LocalPostgresSupervisor, '_native_origin_matches', return_value=True),
              patch.object(LocalPostgresSupervisor, '_registration_observation',
                           return_value={'profile': 'fixture'}),
              patch.object(LocalPostgresSupervisor, '_issue_evidence', return_value=evidence)
              as issue,
              _synthetic_control_lease(supervisor, 'registration-apply')):
            self.assertIs(supervisor.observe_original_registration(
                request, original_payload=payload, custodian_sequence=3), evidence)
        issue.assert_called_once_with(request, payload, {'profile': 'fixture'}, attestation)

    def test_store_settings_project_from_full_flat_native_observation(self) -> None:
        observation = {
            'databaseName': 'appdb', 'databaseOid': 100,
            'searchPath': 'pg_catalog', 'timeZone': 'UTC', 'rowSecurity': 'on',
            'sessionReplicationRole': 'origin', 'transactionReadOnly': 'off',
            'transactionIsolation': 'read committed', 'dateStyle': 'ISO, YMD',
            'serverVersionNum': '180006', 'settingsDigest': 'a' * 64,
        }
        self.assertEqual(LocalPostgresSupervisor._store_settings_from_observation(
            observation), {
                'searchPath': 'pg_catalog', 'timeZone': 'UTC', 'rowSecurity': 'on',
                'sessionReplicationRole': 'origin', 'transactionReadOnly': 'off',
                'transactionIsolation': 'read committed',
            })
        observation['rowSecurity'] = 'off'
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-store-settings-mismatch'):
            LocalPostgresSupervisor._store_settings_from_observation(observation)

    def test_origin_checks_matching_launch_intent_for_config_and_hba(self) -> None:
        with tempfile.TemporaryDirectory(prefix='g11-native-origin-') as temporary:
            root = Path(temporary).resolve()
            hba, config = root / 'pg_hba.conf', root / 'postgresql.conf'
            hba.write_bytes(b'hba fixture')
            config.write_bytes(b'config fixture')
            os.chmod(hba, 0o600)
            os.chmod(config, 0o600)
            stat = root.stat()
            supervisor = object.__new__(LocalPostgresSupervisor)
            attestation = _NativeAttestation(supervisor, {}, {}, 'c' * 64)
            origin = {
                'database': {'name': 'appdb', 'oid': 100, 'systemIdentifier': '123456'},
                'initialPostmaster': {'startToken': 'start-1'},
                'dataDirectory': {'path': str(root), 'device': str(stat.st_dev),
                                  'inode': str(stat.st_ino), 'ownerUid': stat.st_uid},
            }
            launch = {'launchId': 'launch-1', 'process': {'startToken': 'start-1'},
                      'nativeObservationDigest': 'a' * 64, 'endpointReceiptDigest': 'b' * 64}
            launch_intent = {'launchId': 'launch-1', 'hbaDigest': __import__('hashlib').sha256(
                hba.read_bytes()).hexdigest(), 'configDigest': __import__('hashlib').sha256(
                config.read_bytes()).hexdigest()}
            native = {'databaseOid': 100, 'systemIdentifier': '123456',
                      'dataDirectory': str(root), 'hbaFile': str(hba),
                      'configFile': str(config)}
            object.__setattr__(supervisor, '_journal', SimpleNamespace(read=lambda: {
                'events': [
                    {'kind': 'launch-intent', 'payload': launch_intent},
                    {'kind': 'launch-confirmed', 'payload': launch},
                ]}))
            object.__setattr__(supervisor, '_launch', {'sockets': []})
            object.__setattr__(supervisor, '_observer', SimpleNamespace(sockets=lambda _pgid: []))
            with (patch.object(LocalPostgresSupervisor, '_verify_live_process',
                               return_value={'pgid': 70, 'startToken': 'start-1'}),
                  patch.object(LocalPostgresSupervisor, '_observe_native', return_value=native),
                  patch.object(LocalPostgresSupervisor, '_verify_owned_process_group',
                               return_value=[{'pid': 70}]),
                  patch.object(LocalPostgresSupervisor, '_verify_endpoint_sockets',
                               return_value=[])):
                self.assertTrue(supervisor._native_origin_matches(origin, attestation))
                object.__setattr__(supervisor, '_journal', SimpleNamespace(read=lambda: {
                    'events': [{'kind': 'launch-confirmed', 'payload': launch}]}))
                self.assertFalse(supervisor._native_origin_matches(origin, attestation))

    def test_signed_registration_intent_bytes_are_the_effect_payload(self) -> None:
        from test_owner_authority import OwnerAuthorityTests

        fixture = OwnerAuthorityTests()
        with patch.object(bootstrap, 'sys_platform_darwin', return_value=True):
            fixture.setUp()
        try:
            raw = _canonical(fixture._scope_intents()['local-target-registration'])
            request = fixture.authority.prepare_request(
                'local-target-registration', raw,
                context=fixture.authority.authority_context)
            self.assertEqual(_registration_intent_bytes(request), raw)
            self.assertEqual(__import__('hashlib').sha256(raw).hexdigest(),
                             request._intent_digest)
        finally:
            fixture.tearDown()

    def test_recovered_registration_uses_the_fixed_custody_approval_scope(self) -> None:
        from test_owner_authority import OwnerAuthorityTests
        from umf_access.lifecycle.ingress_custody import (
            CustodyJournalError,
            _validate_owner_payload,
        )

        fixture = OwnerAuthorityTests()
        with patch.object(bootstrap, 'sys_platform_darwin', return_value=True):
            fixture.setUp()
        try:
            registration = fixture._scope_intents()['local-target-registration']['registration']
            owner_payload = {**registration, 'ownerApproval': {
                'authorityId': fixture.config['authorityId'],
                'approvalId': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                'approvalDigest': 'a' * 64,
                'scope': 'enroll-owned-local-postgresql-target',
            }}
            _validate_owner_payload(owner_payload)
            forged = copy.deepcopy(owner_payload)
            forged['ownerApproval']['scope'] = 'local-target-registration'
            with self.assertRaises(CustodyJournalError):
                _validate_owner_payload(forged)
        finally:
            fixture.tearDown()

    def test_owner_registration_event_is_already_unwrapped_and_closed(self) -> None:
        payload = {'registrationId': '11111111-1111-4111-8111-111111111111',
                   'payloadDigest': 'a' * 64,
                   'approvalId': '22222222-2222-4222-8222-222222222222',
                   'approvalDigest': 'b' * 64}
        event = {'kind': 'owner-registration-approved', 'payload': payload}
        self.assertIs(_owner_registration_approval_payload([event]), payload)
        for events in ([{'kind': event['kind'], 'payload': {'payload': payload}}],
                       [event, event],
                       [{'kind': event['kind'], 'payload': {**payload, 'extra': 'x'}}]):
            with self.subTest(events=events), self.assertRaisesRegex(
                    LocalPostgresError, 'local-postgresql-store-preparation-unverified'):
                _owner_registration_approval_payload(events)

    def test_attached_postmaster_waits_for_exact_process_and_group_absence(self) -> None:
        expected = {'pid': 321, 'pgid': 321, 'uid': os.geteuid(),
                    'gid': os.getegid(), 'startToken': 'boot.pid.start',
                    'path': '/usr/local/bin/postgres',
                    'argv': ['/usr/local/bin/postgres', '-D', '/data']}

        class Observer:
            active = True
            def process(self, _pid):
                if not self.active:
                    raise LocalPostgresError('process-gone')
                return dict(expected)
            def group(self, _pgid):
                return [dict(expected)] if self.active else []

        observer = Observer()
        process = _AttachedPostmaster(observer, expected)
        self.assertIsNone(process.poll())
        observer.active = False
        self.assertEqual(process.wait(timeout=0.2), 0)

    def test_attached_postmaster_rejects_reused_pid(self) -> None:
        expected = {'pid': 321, 'pgid': 321, 'uid': os.geteuid(),
                    'gid': os.getegid(), 'startToken': 'boot.pid.start',
                    'path': '/usr/local/bin/postgres',
                    'argv': ['/usr/local/bin/postgres', '-D', '/data']}

        class Observer:
            def process(self, _pid):
                return {**expected, 'startToken': 'different-process'}
            def group(self, _pgid):
                return [dict(expected)]

        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-process-origin-mismatch'):
            _AttachedPostmaster(Observer(), expected).poll()

    def test_original_owner_observation_uses_exact_existing_journal_request(self) -> None:
        supervisor_id = '11111111-1111-4111-8111-111111111111'
        custodian_id = '44444444-4444-4444-8444-444444444444'
        provider_id = '22222222-2222-4222-8222-222222222222'
        installation_id = 'installation-1'
        preparation_id = '55555555-5555-4555-8555-555555555555'
        approval_id = '66666666-6666-4666-8666-666666666666'
        intent = {
            'profile': 'umf.local-postgresql-principal-preparation/0.1',
            'preparationId': preparation_id, 'supervisorId': supervisor_id,
            'custodianId': custodian_id, 'providerId': provider_id,
            'installationId': installation_id,
        }
        request_digest = __import__('hashlib').sha256(_canonical(intent)).hexdigest()
        creation = {
            'supervisorId': supervisor_id, 'purpose': 'native-acceptance',
            'installationId': installation_id,
            'controlDirectory': '/control/' + supervisor_id.replace('-', ''),
            'dataDirectory': '/data/' + supervisor_id.replace('-', ''),
            'ownerUid': os.geteuid(),
        }
        outcome = SimpleNamespace(
            approval_id=approval_id, scope='native-principal-preparation',
            intent_digest=request_digest, approval_status='consumed',
            approval_digest='a' * 64, effect_status='effect-pending',
            effect_digest='b' * 64, effect_receipt_digest=None)

        class Journal:
            def read(self):
                return {'events': [
                    {'kind': 'creation-intent', 'payload': creation},
                    {'kind': 'principal-request-prepared', 'payload': {
                        'preparationId': preparation_id, 'approvalId': approval_id,
                        'intent': intent, 'requestDigest': request_digest}},
                ]}

        class Authority:
            def __init__(self):
                self.recovered = []
                self.observed = []
            def _recover_original_request(self, scope, exact_bytes, *, context,
                                         expected_approval_id):
                self.recovered.append((scope, exact_bytes, context, expected_approval_id))
                return SimpleNamespace(_scope=scope, _intent_bytes=exact_bytes,
                                       _approval_id=expected_approval_id,
                                       effect_key=(scope, supervisor_id, preparation_id))
            def observe_original_request(self, context, effect_key):
                self.observed.append((context, effect_key))
                return outcome

        authority = Authority()
        context = object()
        supervisor = object.__new__(LocalPostgresSupervisor)
        for name, value in {
            '_supervisor_id': supervisor_id, '_custodian_id': custodian_id,
            '_provider_id': provider_id, '_bound_installation_id': installation_id,
            '_profile': SimpleNamespace(
                purpose='native-acceptance', installation_id=installation_id,
                control_home=Path('/control'), data_home=Path('/data')),
            '_journal': Journal(), '_owner_core': authority,
            '_authority_context': context,
        }.items():
            object.__setattr__(supervisor, name, value)

        with _synthetic_control_lease(supervisor, 'principals-recover'):
            observed = supervisor.observe_original_owner_request(
                'native-principal-preparation')
        self.assertIs(observed, outcome)
        self.assertEqual(len(authority.recovered), 1)
        self.assertEqual(authority.recovered[0][0], 'native-principal-preparation')
        self.assertEqual(authority.recovered[0][1], _canonical(intent))
        self.assertEqual(authority.recovered[0][2], context)
        self.assertEqual(authority.recovered[0][3], approval_id)
        self.assertEqual(authority.observed, [(context,
            ('native-principal-preparation', supervisor_id, preparation_id))])

    def test_original_owner_observation_never_creates_missing_request(self) -> None:
        supervisor_id = '11111111-1111-4111-8111-111111111111'
        creation = {
            'supervisorId': supervisor_id, 'purpose': 'native-acceptance',
            'installationId': 'installation-1',
            'controlDirectory': '/control/' + supervisor_id.replace('-', ''),
            'dataDirectory': '/data/' + supervisor_id.replace('-', ''),
            'ownerUid': os.geteuid(),
        }

        class Journal:
            def read(self):
                return {'events': [{'kind': 'creation-intent', 'payload': creation}]}

        class Authority:
            called = False
            def _recover_original_request(self, *_args, **_kwargs):
                self.called = True
                raise AssertionError('no request should be resolved')

        supervisor = object.__new__(LocalPostgresSupervisor)
        authority = Authority()
        for name, value in {
            '_supervisor_id': supervisor_id,
            '_profile': SimpleNamespace(
                purpose='native-acceptance', installation_id='installation-1',
                control_home=Path('/control'), data_home=Path('/data')),
            '_journal': Journal(), '_owner_core': authority,
            '_authority_context': object(),
        }.items():
            object.__setattr__(supervisor, name, value)
        with (_synthetic_control_lease(supervisor, 'principals-recover'),
              self.assertRaisesRegex(LocalPostgresError,
                                     'local-postgresql-original-request-unavailable')):
            supervisor.observe_original_owner_request('native-principal-preparation')
        self.assertFalse(authority.called)

    def test_native_effect_recovery_reuses_exact_original_reservation(self) -> None:
        supervisor_id = '11111111-1111-4111-8111-111111111111'
        custodian_id = '44444444-4444-4444-8444-444444444444'
        provider_id = '22222222-2222-4222-8222-222222222222'
        installation_id = 'installation-1'
        preparation_id = '55555555-5555-4555-8555-555555555555'
        approval_id = '66666666-6666-4666-8666-666666666666'
        intent = {
            'profile': 'umf.local-postgresql-principal-preparation/0.1',
            'preparationId': preparation_id, 'supervisorId': supervisor_id,
            'custodianId': custodian_id, 'providerId': provider_id,
            'installationId': installation_id,
        }
        intent_bytes = _canonical(intent)
        request_digest = __import__('hashlib').sha256(intent_bytes).hexdigest()
        approval_digest = 'a' * 64
        reservation_id = '77777777-7777-4777-8777-777777777777'
        reservation_digest = 'b' * 64
        request = SimpleNamespace(
            _scope='native-principal-preparation', _intent_bytes=intent_bytes,
            _approval_id=approval_id, _intent_digest=request_digest,
            effect_key=('native-principal-preparation', supervisor_id, preparation_id))
        approval = SimpleNamespace(
            _request=request, approval_id=approval_id,
            approval_digest=approval_digest)
        effect_payload = {
            'reservationId': reservation_id, 'scope': 'native-principal-preparation',
            'effectKey': ['native-principal-preparation', supervisor_id, preparation_id],
            'purpose': 'native-acceptance', 'requestId': approval_id,
            'requestDigest': request_digest, 'approvalId': approval_id,
            'approvalDigest': approval_digest, 'stage': 'native-principal-preparation',
            'payloadDigest': request_digest,
        }
        chain_events = [
            {'sequence': 1, 'kind': 'creation-intent', 'recordDigest': '1' * 64,
             'payload': {
                'supervisorId': supervisor_id, 'purpose': 'native-acceptance',
                'installationId': installation_id,
                'controlDirectory': '/control/' + supervisor_id.replace('-', ''),
                'dataDirectory': '/data/' + supervisor_id.replace('-', ''),
                'ownerUid': os.geteuid(),
            }},
            {'sequence': 2, 'kind': 'principal-request-prepared', 'recordDigest': '2' * 64,
             'payload': {
                'preparationId': preparation_id, 'approvalId': approval_id,
                'intent': intent, 'requestDigest': request_digest,
            }},
            {'kind': 'native-effect-intent', 'sequence': 3,
             'recordDigest': reservation_digest, 'payload': effect_payload},
        ]
        owner_outcome = SimpleNamespace(
            approval_id=approval_id, scope='native-principal-preparation',
            intent_digest=request_digest, effect_status='effect-pending',
            effect_receipt_digest=None)

        class Journal:
            def __init__(self):
                self.writes = 0
            def read(self):
                return {'events': chain_events}
            def append(self, *_args, **_kwargs):
                self.writes += 1
                raise AssertionError('recovery must not append a replacement intent')

        class Authority:
            def __init__(self):
                self.recovered_id = None
                self.bound = []
            def _recover_original_request(self, scope, raw, *, context,
                                         expected_approval_id):
                self.recovered_id = expected_approval_id
                self.asserted = (scope, raw, context)
                return request
            def _recover_verified_approval(self, original_request):
                if original_request is not request:
                    raise AssertionError('request identity changed')
                return approval
            def _resolve_verified_approval(self, verified, *, original_request,
                                           scope, intent_digest):
                if (verified is not approval or original_request is not request
                        or scope != request._scope or intent_digest != request._intent_digest):
                    raise AssertionError('approval binding changed')
            def bind_native_effect(self, verified, reservation):
                self.bound.append((verified, reservation.reservation_id,
                                   reservation.journal_record_digest))
                return object()
            def observe_original_request(self, context, effect_key):
                if effect_key != request.effect_key:
                    raise AssertionError('effect key changed')
                return owner_outcome

        authority, journal = Authority(), Journal()
        supervisor = object.__new__(LocalPostgresSupervisor)
        context = object()
        for name, value in {
            '_supervisor_id': supervisor_id, '_custodian_id': custodian_id,
            '_provider_id': provider_id, '_bound_installation_id': installation_id,
            '_profile': SimpleNamespace(purpose='native-acceptance',
                                        installation_id=installation_id,
                                        control_home=Path('/control'), data_home=Path('/data')),
            '_journal': journal, '_owner_core': authority,
            '_authority_context': context, '_native_effect_reservations': {},
            '_native_effect_outcomes': {},
        }.items():
            object.__setattr__(supervisor, name, value)

        with _synthetic_control_lease(supervisor, 'principals-recover'):
            reservation, outcome, recovered = supervisor._recover_original_native_effect(
                'native-principal-preparation')
        self.assertIs(recovered, request)
        self.assertIsNone(outcome)
        self.assertEqual(reservation.reservation_id, reservation_id)
        self.assertEqual(reservation.journal_record_digest, reservation_digest)
        self.assertEqual(reservation.effect_key, request.effect_key)
        self.assertEqual(authority.recovered_id, approval_id)
        self.assertEqual(authority.bound, [])
        self.assertEqual(journal.writes, 0)

    def test_principal_recovery_is_owned_by_facade_not_native_supervisor(self) -> None:
        from umf_access.lifecycle.owner_authority import OwnerAuthoritySession

        self.assertFalse(hasattr(LocalPostgresSupervisor, 'resume_original_principal_stage'))
        self.assertTrue(hasattr(OwnerAuthoritySession, 'resume_original_principal_stage'))

        target = object()
        reservation = SimpleNamespace(_approval=object())
        receipt = {'profile': 'test.principal-recovery-receipt/1'}
        outcome = SimpleNamespace(_reservation=reservation)
        binding, handle = SimpleNamespace(_reservation=reservation), object()

        class Supervisor:
            def __init__(self):
                self._native_effect_outcomes = {id(outcome): outcome}
                self.calls = []

            def prepare_original_principal_recovery(self, actual_target):
                self.calls.append(('prepare', actual_target))
                return reservation

            def execute_original_principal_recovery(self, actual_reservation, actual_handle):
                self.calls.append(('execute', actual_reservation, actual_handle))
                return receipt

            @contextmanager
            def _original_control_lease(self, *, operation_kind):
                self.calls.append(('lease', operation_kind))
                yield SimpleNamespace(_operation_kind=operation_kind)

            def _require_original_control_lease(self, _lease, *, operation_kind):
                self.calls.append(('lease-revalidate', operation_kind))

        supervisor = Supervisor()
        session = object.__new__(OwnerAuthoritySession)
        object.__setattr__(session, '_supervisor', supervisor)
        object.__setattr__(session, '_authority', object())
        object.__setattr__(session, '_bootstrap_issuer', object())
        object.__setattr__(session, '_effect_bindings', {id(binding): binding})
        observed = []
        with (patch.object(OwnerAuthoritySession, 'bind_native_effect',
                           return_value=binding) as bind,
              patch.object(OwnerAuthoritySession, '_pending_effect_handle',
                           return_value=handle) as pending,
              patch.object(OwnerAuthoritySession, 'record_native_outcome',
                           side_effect=lambda actual_binding, actual_outcome:
                               observed.append((actual_binding, actual_outcome)))):
            self.assertIs(session.resume_original_principal_stage(target), receipt)
        bind.assert_called_once_with(reservation._approval, reservation)
        pending.assert_called_once_with(binding, mode='recover')
        self.assertEqual(supervisor.calls, [
            ('lease', 'principals-recover'),
            ('prepare', target), ('execute', reservation, handle),
            ('lease-revalidate', 'principals-recover')])
        self.assertEqual(observed, [(binding, outcome)])

    def test_target_preparation_creates_no_target_paths_or_native_journal(self) -> None:
        if os.geteuid() == 0:
            self.skipTest('owner target preparation requires an unprivileged test process')
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            control_home, data_home = root / 'control', root / 'data'
            control_home.mkdir(mode=0o700)
            data_home.mkdir(mode=0o700)
            os.chmod(control_home, 0o700)
            os.chmod(data_home, 0o700)
            supervisor_id = str(uuid.uuid4())
            profile = SimpleNamespace(
                control_home=control_home, data_home=data_home,
                business_owner='umf_owner', database_name='umf_app', port=55439,
                purpose='native-acceptance', installation_id='installation-test')

            class Authority:
                authority_context = object()
                def prepare_request(self, _scope, intent, *, context):
                    self.intent = intent
                    self.context = context
                    return object()

            authority = Authority()
            supervisor = object.__new__(LocalPostgresSupervisor)
            for name, value in {
                '_profile': profile, '_owner_core': authority,
                '_authority_context': authority.authority_context,
                '_supervisor_id': supervisor_id, '_custodian_id': str(uuid.uuid4()),
                '_provider_id': str(uuid.uuid4()),
                '_bound_installation_id': profile.installation_id,
                '_pending_creations': {}, '_pending_creation_values': {},
                '_active_creation': None,
                '_maintenance_password': None, '_target_paths': {},
                '_owner_payloads': {}, '_journal': None,
            }.items():
                object.__setattr__(supervisor, name, value)
            postgres, initdb = root / 'postgres', root / 'initdb'
            postgres.write_bytes(b'fixture postgres executable identity')
            initdb.write_bytes(b'fixture initdb executable identity')
            with (patch.object(LocalPostgresSupervisor, '_validate_installation_binaries',
                               return_value=(postgres, initdb)),
                  patch.object(native, '_sha_file', return_value='a' * 64),
                  patch('umf_access.lifecycle.owner_bootstrap._owner_context_journal_metadata',
                        return_value={
                            'profile': 'umf.owner-context-journal-metadata/0.1',
                            'enrollmentProfile': 'umf.local-owner-bootstrap-enrollment/0.1',
                            'ownerContextProfile': 'umf.local-owner-bootstrap-context/0.3',
                            'ownerBootstrapContextDigest': '0' * 64,
                            'supervisorJournal': None,
                        }),
                  _synthetic_control_lease(supervisor, 'target-prepare')):
                pending, _request = supervisor.prepare_target_creation()

            self.assertIs(supervisor._pending_creations[id(pending)], pending)
            target_control = control_home / supervisor_id.replace('-', '')
            target_data = data_home / supervisor_id.replace('-', '')
            self.assertFalse(target_control.exists())
            self.assertFalse(target_data.exists())
            self.assertEqual(list(control_home.iterdir()), [])
            self.assertEqual(list(data_home.iterdir()), [])
            self.assertEqual(authority.context, authority.authority_context)
            self.assertTrue(authority.intent)

    def test_creation_recovery_request_keeps_v02_birth_and_context_digests(self) -> None:
        from umf_access.lifecycle.ingress_local_postgres import _creation_request_fields

        legacy = {key: key for key in (
            'profile', 'supervisorId', 'clusterId', 'incarnationId', 'installationId',
            'ownerUid', 'databaseName', 'businessOwner', 'maintenanceName',
            'controllerName', 'controlDirectory', 'dataDirectory', 'postgresPath',
            'postgresSha256', 'initdbPath', 'initdbSha256', 'port', 'configDigest',
            'hbaDigest')}
        legacy.update({'profile': 'umf.local-postgresql-create-request/0.1',
                       'supervisorJournalBirthDigest': 'a' * 64,
                       'ownerBootstrapContextDigest': 'b' * 64})
        self.assertNotIn('supervisorJournalBirthDigest', _creation_request_fields(legacy))
        version_two = {**legacy, 'profile': 'umf.local-postgresql-create-request/0.2'}
        selected = _creation_request_fields(version_two)
        self.assertEqual(selected['supervisorJournalBirthDigest'], 'a' * 64)
        self.assertEqual(selected['ownerBootstrapContextDigest'], 'b' * 64)

    def test_original_enrollment_is_read_only_and_missing_primary_context_refuses(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            control = Path(tmp)
            os.chmod(control, 0o700)
            native_profile = {
                'controlHome': str(control), 'dataHome': str(control.parent / 'data'),
                'postgresBinary': '/usr/local/bin/postgres',
                'initdbBinary': '/usr/local/bin/initdb',
                'processObserver': '/usr/local/bin/observer',
                'processObserverSha256': 'a' * 64, 'port': 55439,
                'databaseName': 'umf_app', 'businessOwner': 'umf_owner',
                'custodianId': '44444444-4444-4444-8444-444444444444',
                'supervisorId': '11111111-1111-4111-8111-111111111111',
                'providerId': '22222222-2222-4222-8222-222222222222',
                'installationId': 'installation-1', 'purpose': 'native-acceptance',
            }
            record = {
                'profile': 'umf.local-owner-bootstrap-enrollment/0.1',
                'enrollmentId': '33333333-3333-4333-8333-333333333333',
                'purpose': 'native-acceptance',
                'context': {
                    'custodianId': '44444444-4444-4444-8444-444444444444',
                    'supervisorId': '11111111-1111-4111-8111-111111111111',
                    'providerId': '22222222-2222-4222-8222-222222222222',
                    'installationId': 'installation-1',
                },
                'ownerConfiguration': {}, 'nativeProfile': native_profile,
            }
            enrollment = control / 'owner-bootstrap-enrollment.json'
            original = _canonical(record)
            _write_private(enrollment, original)
            parsed, raw = _read_bootstrap_enrollment(enrollment)
            self.assertEqual(parsed, record)
            self.assertEqual(raw, original)
            digest = __import__('hashlib').sha256(raw).hexdigest()
            _verify_bootstrap_enrollment(enrollment, digest)
            before = enrollment.read_bytes()
            with self.assertRaisesRegex(LocalPostgresError,
                                        'local-postgresql-bootstrap-context-unavailable'):
                _validate_bootstrap_context_journal(control, record, raw, 'd' * 64)
            self.assertFalse((control / 'owner-bootstrap-context.json').exists())
            # The runtime loader must never install a missing primary context
            # from the enrollment file or from its own matching digest.
            with self.assertRaisesRegex(LocalPostgresError,
                                        'local-postgresql-bootstrap-context-unavailable'):
                _validate_bootstrap_context_journal(control, record, raw, 'd' * 64)
            self.assertEqual(enrollment.read_bytes(), before)
            with self.assertRaisesRegex(LocalPostgresError,
                                        'local-postgresql-bootstrap-context-unavailable'):
                _validate_bootstrap_context_journal(control, record, raw, 'e' * 64)
            self.assertEqual(enrollment.read_bytes(), before)

    def test_native_effect_outcome_retains_exact_terminal_journal_reference(self) -> None:
        reservation = object.__new__(_NativeEffectReservation)
        outcome = _VerifiedNativeEffectOutcome(
            _NATIVE_EFFECT_OUTCOME_SEAL, object(), reservation, sequence=8,
            status='confirmed', receipt_digest='a' * 64,
            journal_record_digest='b' * 64)
        self.assertEqual(outcome.status, 'confirmed')
        self.assertEqual(outcome.receipt_digest, 'a' * 64)
        self.assertEqual(outcome.journal_sequence, 8)
        self.assertEqual(outcome.journal_record_digest, 'b' * 64)

    def test_stage_dispatch_reservations_block_repeated_effect_calls(self) -> None:
        supervisor = object.__new__(LocalPostgresSupervisor)
        target = SimpleNamespace(_issuer=supervisor)
        principal = object.__new__(_PreparedOriginalPrincipals)
        for name, value in {'_issuer': supervisor, '_target': target,
                            '_request': object(), '_request_bytes': b'{}',
                            '_values': {}}.items():
            object.__setattr__(principal, name, value)
        registration = object.__new__(_PreparedTargetRegistration)
        for name, value in {'_issuer': supervisor, '_target': target,
                            '_request': object(), '_request_bytes': b'{}',
                            '_registration': {}}.items():
            object.__setattr__(registration, name, value)
        object.__setattr__(supervisor, '_principal_preparations', {id(principal): principal})
        object.__setattr__(supervisor, '_registration_preparations', {
            id(registration): registration})
        object.__setattr__(supervisor, '_journal', object())
        object.__setattr__(supervisor, '_launch', {})
        object.__setattr__(supervisor, '_native_targets', {id(target): target})
        reservation = object()
        object.__setattr__(supervisor, '_principal_dispatches', {id(principal): reservation})
        object.__setattr__(supervisor, '_registration_dispatches', {
            id(registration): reservation})
        object.__setattr__(supervisor, '_authority_context', object())
        object.__setattr__(supervisor, '_active_control_lease',
                           SimpleNamespace(_operation_kind='principals-apply'))
        with patch('umf_access.lifecycle.ingress_local_postgres._resolve_original_control_lease',
                   side_effect=lambda value, **_kwargs: value):
            with self.assertRaisesRegex(LocalPostgresError,
                                        'local-postgresql-principal-outcome-unresolved'):
                supervisor.reserve_original_principals(principal, object())
            object.__setattr__(supervisor, '_active_control_lease',
                               SimpleNamespace(_operation_kind='registration-apply'))
            with self.assertRaisesRegex(LocalPostgresError,
                                        'local-postgresql-registration-outcome-unresolved'):
                supervisor.reserve_target_registration(registration, object())

    def test_fixed_hba_and_external_config_are_closed(self) -> None:
        hba = _render_hba('umf_m_0123456789abcdef0123456789abcdef')
        self.assertEqual(hba,
            b'host all "umf_m_0123456789abcdef0123456789abcdef" 127.0.0.1/32 scram-sha-256\n'
            b'local all all reject\n'
            b'host all all 0.0.0.0/0 reject\n'
            b'host all all ::/0 reject\n')
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = _render_config(55439, root / 'pg_hba.conf', root / 'pg_ident.conf')
        text = config.decode('utf-8')
        self.assertNotIn('include', text.lower())
        self.assertIn("listen_addresses = '127.0.0.1'", text)
        self.assertIn("unix_socket_directories = ''", text)
        self.assertIn('port = 55439', text)
        self.assertNotIn('data_directory', text)

    def test_hba_rejects_injection_and_invalid_role(self) -> None:
        for value in ('postgres', 'pg_catalog', 'UMF_owner', 'x"\ntrust all all', 'a' * 64, ''):
            with self.subTest(value=value), self.assertRaises(LocalPostgresError):
                _render_hba(value)

    def test_membership_payload_order_is_stable_for_both_owner_name_orders(self) -> None:
        maintenance, controller = 'umf_m_123', 'umf_c_123'
        for owner in ('a_business_owner', 'z_business_owner'):
            rows = [(maintenance, owner, False, False, True),
                    (maintenance, controller, False, False, True)]
            self.assertEqual(_ordered_required_memberships(
                rows, maintenance, controller, owner),
                [(maintenance, controller, False, False, True),
                 (maintenance, owner, False, False, True)])
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-membership-closure-mismatch'):
            _ordered_required_memberships(
                [(maintenance, controller, False, False, True),
                 (maintenance, 'unexpected', False, False, True)],
                maintenance, controller, 'a_business_owner')

    def test_native_membership_payload_is_stable_when_owner_oid_precedes_controller(self) -> None:
        # Catalog queries are OID-ordered. The signed profile is always
        # controller then business owner, regardless of which OID sorts first.
        expected = [
            {'memberOid': 100, 'roleOid': 200, 'admin': False,
             'inherit': False, 'set': True},
            {'memberOid': 100, 'roleOid': 50, 'admin': False,
             'inherit': False, 'set': True},
        ]
        for rows in (
            [(100, 50, False, False, True), (100, 200, False, False, True)],
            [(100, 200, False, False, True), (100, 50, False, False, True)],
        ):
            self.assertEqual(_ordered_membership_payload(rows, 100, 200, 50), expected)
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-membership-closure-mismatch'):
            _ordered_membership_payload(
                [(100, 50, False, False, True), (100, 200, False, True, True)],
                100, 200, 50)

    def test_membership_edge_uses_three_fixed_postgresql_grants(self) -> None:
        self.assertEqual(_membership_grant_statements('umf_m_123', 'umf_c_123'), (
            'GRANT "umf_c_123" TO "umf_m_123" WITH ADMIN FALSE',
            'GRANT "umf_c_123" TO "umf_m_123" WITH INHERIT FALSE',
            'GRANT "umf_c_123" TO "umf_m_123" WITH SET TRUE',
        ))
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-identifier-invalid'):
            _membership_grant_statements('umf_m_123', 'x; CREATE ROLE attacker')

    def test_store_authority_settings_are_exact_and_not_a_subset(self) -> None:
        expected = {
            'searchPath': 'pg_catalog', 'timeZone': 'UTC', 'rowSecurity': 'on',
            'sessionReplicationRole': 'origin', 'transactionReadOnly': 'off',
            'transactionIsolation': 'read committed',
        }
        check = LocalPostgresSupervisor._store_required_settings
        self.assertEqual(check(expected), expected)
        for key, wrong in (('searchPath', 'public, pg_catalog'),
                           ('timeZone', 'America/New_York'),
                           ('rowSecurity', 'off'),
                           ('sessionReplicationRole', 'replica'),
                           ('transactionReadOnly', 'on'),
                           ('transactionIsolation', 'serializable')):
            with self.subTest(key=key), self.assertRaisesRegex(
                    LocalPostgresError, 'local-postgresql-store-settings-mismatch'):
                check({**expected, key: wrong})
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-store-settings-mismatch'):
            check({**expected, 'unexpected': 'value'})

    def test_store_observation_requires_original_maintenance_and_controller_roles(self) -> None:
        check = LocalPostgresSupervisor._assert_store_session
        actual = {'sessionUser': 'umf_maintenance', 'currentUser': 'umf_controller',
                  'roleSetting': 'umf_controller'}
        check(actual, 'umf_maintenance', 'umf_controller')
        for key, wrong in (('sessionUser', 'other_maintenance'),
                           ('currentUser', 'umf_owner'),
                           ('roleSetting', 'none')):
            with self.subTest(key=key), self.assertRaisesRegex(
                    LocalPostgresError,
                    'local-postgresql-store-session-authority-mismatch'):
                check({**actual, key: wrong}, 'umf_maintenance', 'umf_controller')

    def test_existing_or_symlink_data_root_is_never_adopted(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            existing = root / 'existing'
            existing.mkdir(mode=0o700)
            with self.assertRaisesRegex(LocalPostgresError,
                                        'supervisor-path-already-exists'):
                _private_directory(existing, create=True)
            link = root / 'alias'
            link.symlink_to(existing, target_is_directory=True)
            with self.assertRaisesRegex(LocalPostgresError,
                                        'supervisor-path-unsafe'):
                _private_directory(link)

    def test_native_identity_files_reject_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            actual = root / 'actual'
            actual.write_bytes(b'18\n')
            os.chmod(actual, 0o600)
            link = root / 'PG_VERSION'
            link.symlink_to(actual)
            with self.assertRaisesRegex(
                    LocalPostgresError,
                    'supervisor-native-identity-file-unavailable'):
                _read_owned_regular_nofollow(link)
            self.assertEqual(_read_owned_regular_nofollow(actual), b'18\n')

    def test_postmaster_pidfile_binds_pid_data_port_and_listener(self) -> None:
        path = Path('/private/var/umf/data')
        record = b'321\n/private/var/umf/data\n123456789\n55439\n\n127.0.0.1\n'
        self.assertTrue(_postmaster_pidfile_matches(
            record, pid=321, data_directory=path, port=55439))
        for changed in (
                record.replace(b'321\n', b'322\n'),
                record.replace(b'55439\n', b'55440\n'),
                record.replace(b'127.0.0.1', b'0.0.0.0'),
                record.replace(b'/private/var/umf/data', b'/other/data')):
            self.assertFalse(_postmaster_pidfile_matches(
                changed, pid=321, data_directory=path, port=55439))

    def test_store_profile_admission_is_exact_and_provider_derived(self) -> None:
        provider = '33333333-3333-4333-8333-333333333333'
        self.assertEqual(_store_descriptor(
            'umf.pg-generation-ingress-store/0.1', provider), {
                'profile': 'umf.pg-generation-ingress-store/0.1',
                'storeId': provider,
                'schemaName': 'umf_ingress_33333333333343338333333333333333'})
        self.assertEqual(_store_descriptor(
            'umf.native-row-originals-store/0.1', provider), {
                'profile': 'umf.native-row-originals-store/0.1',
                'storeId': provider,
                'schemaName': 'umf_originals_33333333333343338333333333333333'})
        for profile in (None, 'umf.native-row-originals-store/0.2', 'other'):
            with self.subTest(profile=profile), self.assertRaisesRegex(
                    LocalPostgresError,
                    'local-postgresql-store-profile-unsupported'):
                _store_descriptor(profile, provider)

    def test_endpoint_and_owned_group_reject_external_listener_or_process(self) -> None:
        supervisor = object.__new__(LocalPostgresSupervisor)
        temporary = tempfile.TemporaryDirectory(prefix='umf-owned-process-fixture-')
        self.addCleanup(temporary.cleanup)
        postgres_binary = Path(temporary.name) / 'postgres'
        postgres_binary.write_bytes(b'fixture executable')
        postgres_binary.chmod(0o700)
        object.__setattr__(supervisor, '_profile',
                           SimpleNamespace(port=55439,
                                           postgres_binary=postgres_binary))
        loopback_listener = {'pid': 123, 'fd': 4, 'family': 2, 'kind': 1,
            'type': 1, 'protocol': 6, 'state': 10, 'listening': True,
            'address': '127.0.0.1', 'port': 55439, 'peerAddress': '0.0.0.0'}
        loopback_connection = {'pid': 123, 'fd': 5, 'family': 2, 'kind': 1,
            'type': 1, 'protocol': 6, 'state': 5, 'listening': False,
            'address': '127.0.0.1', 'port': 51321, 'peerAddress': '127.0.0.1'}
        self.assertEqual(supervisor._verify_endpoint_sockets(
            [loopback_listener, loopback_connection], {123}),
            [loopback_listener, loopback_connection])
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-socket-profile-mismatch'):
            supervisor._verify_endpoint_sockets(
                [loopback_listener, {**loopback_connection, 'peerAddress': '192.0.2.7'}], {123})
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-socket-profile-mismatch'):
            supervisor._verify_endpoint_sockets(
                [loopback_listener, {**loopback_connection, 'family': 30,
                                     'address': '::1'}], {123})

        class Observer:
            def __init__(self, members): self.members = members
            def group(self, _pgid): return self.members

        member = {'pid': 123, 'pgid': 123, 'uid': os.geteuid(), 'gid': os.getegid(),
                  'path': str(postgres_binary.resolve())}
        object.__setattr__(supervisor, '_observer', Observer([member]))
        self.assertEqual(supervisor._verify_owned_process_group(123), [member])
        object.__setattr__(supervisor, '_observer', Observer([{**member, 'uid': -1}]))
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-process-group-ownership-unknown'):
            supervisor._verify_owned_process_group(123)

    def test_attestation_from_another_supervisor_cannot_verify_origin(self) -> None:
        current, other = object.__new__(LocalPostgresSupervisor), object()
        attestation = _NativeAttestation(other, {}, {}, 'a' * 64)
        self.assertFalse(current._native_origin_matches({}, attestation))

    def test_journal_requires_original_creation_and_initdb_before_launch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            os.chmod(root, 0o700)
            supervisor_id = str(uuid.uuid4())
            journal = _SupervisorJournal(root / 'supervisor.json', supervisor_id)
            launch_id = str(uuid.uuid4())
            argv = ['/usr/local/bin/postgres', '-D', str(root / 'data'),
                    '-c', f'config_file={root}/postgresql.conf',
                    '-c', f'hba_file={root}/pg_hba.conf',
                    '-c', f'ident_file={root}/pg_ident.conf']
            launch = {'launchId': launch_id, 'launchNumber': 1,
                      'argv': argv, 'configDigest': 'a' * 64,
                      'hbaDigest': 'b' * 64, 'binarySha256': 'c' * 64,
                      'dataDevice': '1', 'dataInode': '2'}
            with self.assertRaisesRegex(LocalPostgresError, 'supervisor-journal-order-invalid'):
                journal.append('launch-intent', launch)
            creation = {
                'profile': 'umf.local-postgresql-create-request/0.1',
                'supervisorId': supervisor_id,
                'clusterId': str(uuid.uuid4()), 'incarnationId': str(uuid.uuid4()),
                'installationId': 'source-test', 'ownerUid': os.geteuid(),
                'databaseName': 'umf_app', 'businessOwner': 'umf_owner',
                'maintenanceName': 'umf_maint', 'controllerName': 'umf_control',
                'controlDirectory': str(root), 'dataDirectory': str(root / 'data'),
                'postgresPath': '/usr/local/bin/postgres', 'postgresSha256': 'c' * 64,
                'initdbPath': '/usr/local/bin/initdb', 'initdbSha256': 'd' * 64,
                'port': 55439, 'configDigest': 'a' * 64, 'hbaDigest': 'b' * 64,
                'purpose': 'native-acceptance', 'requestDigest': 'f' * 64,
                'approvalId': str(uuid.uuid4()), 'approvalDigest': 'e' * 64,
            }
            journal.append('creation-intent', creation)
            journal.append('initdb-confirmed', {
                'clusterId': creation['clusterId'], 'dataDevice': '1', 'dataInode': '2',
                'ownerUid': os.geteuid(), 'initdbReceiptDigest': 'f' * 64,
            })
            journal.append('launch-intent', launch)
            process = {'pid': 123, 'pgid': 123, 'uid': os.geteuid(), 'gid': os.getegid(),
                       'startSec': 100, 'startUsec': 1,
                       'path': '/usr/local/bin/postgres', 'argv': argv, 'startToken': 'token'}
            journal.append('launch-confirmed', {
                'launchId': launch_id, 'process': process,
                'nativeObservationDigest': '1' * 64, 'endpointReceiptDigest': '2' * 64,
            })
            first = journal.read()
            self.assertEqual(first['sequence'], 4)
            self.assertEqual(len(first['headDigest']), 64)
            self.assertEqual(journal.read(), first)
            second_launch = {**launch, 'launchId': str(uuid.uuid4()), 'launchNumber': 2}
            with self.assertRaisesRegex(LocalPostgresError, 'supervisor-journal-order-invalid'):
                journal.append('launch-intent', second_launch)
            journal.append('stop-intent', {'launchId': launch_id,
                                           'processStartToken': 'token'})
            journal.append('stop-confirmed', {'launchId': launch_id,
                'processGroupAbsent': True, 'controlDataDigest': '3' * 64})
            journal.append('launch-intent', second_launch)
            second_process = {**process, 'pid': 124, 'pgid': 124,
                              'startSec': 101, 'startToken': 'token-2'}
            journal.append('launch-confirmed', {'launchId': second_launch['launchId'],
                'process': second_process, 'nativeObservationDigest': '4' * 64,
                'endpointReceiptDigest': '5' * 64})
            self.assertEqual(journal.read()['sequence'], 8)

    def test_supervisor_resolver_uses_declared_private_slot(self) -> None:
        supervisor = object.__new__(LocalPostgresSupervisor)
        resolver = object()
        supervisor._resolver = resolver
        self.assertIs(supervisor._resolver, resolver)

    def test_native_preparation_evidence_is_opaque_immutable_and_bounded(self) -> None:
        issuer, supervisor, custodian, target, verified = (object() for _ in range(5))
        request = object.__new__(OwnerApprovalRequest)
        evidence = _VerifiedNativeStorePreparation(
            _VERIFIED_STORE_PREPARATION_SEAL, issuer, supervisor, custodian, target,
            verified, request, b'{"a":1}', b'{"native":true}')
        with self.assertRaises(AttributeError):
            evidence._payload_bytes = b'{"a":2}'
        with self.assertRaises(TypeError):
            evidence.__reduce_ex__(4)
        with self.assertRaises(AttributeError):
            evidence.native_observation_bytes = b'{"native":false}'
        with self.assertRaises(TypeError):
            _VerifiedNativeStorePreparation(
                object(), issuer, supervisor, custodian, target, verified,
                request, b'{"a":1}', b'{"native":true}')
        with self.assertRaises(LocalPostgresError):
            _VerifiedNativeStorePreparation(
                _VERIFIED_STORE_PREPARATION_SEAL, issuer, supervisor, custodian,
                target, verified, request, b' ' * 65_537, b'{"native":true}')

    def test_lost_journal_acknowledgement_recovers_original_event_without_retry(self) -> None:
        class LostAcknowledgementJournal(_SupervisorJournal):
            def _atomic_replace(self, data: bytes) -> None:
                super()._atomic_replace(data)
                raise LocalPostgresError('supervisor-journal-acknowledgement-lost')

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            os.chmod(root, 0o700)
            supervisor_id = str(uuid.uuid4())
            raw = LostAcknowledgementJournal(root / 'supervisor.json', supervisor_id)
            creation = {
                'profile': 'umf.local-postgresql-create-request/0.1',
                'supervisorId': supervisor_id,
                'clusterId': str(uuid.uuid4()), 'incarnationId': str(uuid.uuid4()),
                'installationId': 'lost-ack-test', 'ownerUid': os.geteuid(),
                'databaseName': 'umf_app', 'businessOwner': 'umf_owner',
                'maintenanceName': 'umf_maint', 'controllerName': 'umf_control',
                'controlDirectory': str(root), 'dataDirectory': str(root / 'data'),
                'postgresPath': '/usr/local/bin/postgres', 'postgresSha256': 'c' * 64,
                'initdbPath': '/usr/local/bin/initdb', 'initdbSha256': 'd' * 64,
                'port': 55439, 'configDigest': 'a' * 64, 'hbaDigest': 'b' * 64,
                'purpose': 'native-acceptance', 'requestDigest': 'f' * 64,
                'approvalId': str(uuid.uuid4()), 'approvalDigest': 'e' * 64,
            }
            with self.assertRaisesRegex(LocalPostgresError,
                                        'supervisor-journal-acknowledgement-lost'):
                raw.append('creation-intent', creation)
            recovered = _SupervisorJournal(root / 'supervisor.json', supervisor_id)
            state = recovered.read()
            self.assertEqual(state['sequence'], 1)
            self.assertEqual(state['events'][0]['payload'], creation)
            with self.assertRaisesRegex(LocalPostgresError,
                                        'supervisor-journal-order-invalid'):
                recovered.append('creation-intent', creation)

    def test_canonical_journal_values_reject_python_only_and_unsafe_numbers(self) -> None:
        for value in (float('nan'), 1.0, 9_007_199_254_740_992, {'x': object()}):
            with self.subTest(value=value), self.assertRaises(LocalPostgresError):
                _canonical(value)
        self.assertEqual(_canonical({'b': 2, 'a': 1}), b'{"a":1,"b":2}')


if __name__ == '__main__':
    unittest.main()

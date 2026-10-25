# SPDX-License-Identifier: MIT OR Apache-2.0
"""Source controls for the external G11 journal; these do not attest a target."""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from umf_access.lifecycle import ingress_custody as journal
from umf_access.lifecycle.ingress_custody import (
    JOURNAL_PROFILE,
    CustodyJournalError,
    ExternalCustodyJournal,
    LocalTargetCustodian,
    _bind_owner_registration_resolver,
    _bootstrap_local_target_custodian,
    _digest,
    _issue_owner_registration_evidence,
)


def _hex(char: str = 'a') -> str:
    return char * 64


@contextmanager
def _synthetic_control_lease(operation_kind: str):
    """Test-only token for journal controls; no native authority is asserted."""
    del operation_kind
    lease = object()
    with patch('umf_access.lifecycle.owner_bootstrap._resolve_original_control_lease',
               return_value=lease):
        yield lease


def _owner_payload() -> dict:
    return {
        'profile': 'umf.local-owner-target-registration/0.1',
        'registrationId': '10000000-0000-4000-8000-000000000001',
        'custodianId': '10000000-0000-4000-8000-000000000002',
        'providerId': '10000000-0000-4000-8000-000000000003',
        'installationId': 'installation-a',
        'ownerApproval': {
            'authorityId': 'owner-approval-authority',
            'approvalId': '10000000-0000-4000-8000-000000000004',
            'approvalDigest': _hex('b'),
            'scope': 'enroll-owned-local-postgresql-target',
        },
        'origin': {
            'profile': 'postgresql18-local-supervised-origin/0.1',
            'supervisorId': '10000000-0000-4000-8000-000000000005',
            'clusterId': '10000000-0000-4000-8000-000000000006',
            'incarnationId': '10000000-0000-4000-8000-000000000007',
            'creationReceiptDigest': _hex('c'),
            'nativeBinary': {'path': '/opt/pg/bin/postgres', 'sha256': _hex('d'), 'version': '18.6'},
            'dataDirectory': {'path': '/var/lib/pg/data', 'device': '1', 'inode': '2', 'ownerUid': 501},
            'initialPostmaster': {'pid': 42, 'startToken': 'boot-token', 'launchReceiptDigest': _hex('e')},
            'database': {'name': 'postgres', 'oid': 5, 'systemIdentifier': '123456'},
            'endpoint': {'host': '127.0.0.1', 'port': 55439},
        },
        'endpointControl': {
            'controllerId': '10000000-0000-4000-8000-000000000008',
            'profile': 'umf.local-postgresql-endpoint-controller/0.1',
            'authorityReceiptDigest': _hex('f'),
        },
    }


def _registration_events(journal: ExternalCustodyJournal) -> None:
    owner = _owner_payload()
    journal._append('registration-intent', {
        'registrationId': owner['registrationId'], 'registrationDigest': _hex('1'),
        'ownerPayload': owner,
        'ownerApproval': {'approvalId': owner['ownerApproval']['approvalId'],
                          'approvalDigest': owner['ownerApproval']['approvalDigest']},
    })
    journal._append('registration-observation', {
        'registrationId': owner['registrationId'],
        'observation': {
            'profile': 'umf.local-target-registration-observation/0.1',
            'registrationDigest': _hex('1'), 'originReceiptDigest': _hex('c'),
            'currentLaunchReceiptDigest': _hex('2'), 'continuityChainDigest': _hex('3'),
            'endpointGateReceiptDigest': _hex('f'), 'nativeObservationDigest': _hex('4'),
            'custodianSequence': 1,
        },
    })
    journal._append('registration-confirmed', {
        'registrationId': owner['registrationId'],
        'targetCustody': _custody_ref(),
    })


def _custody_ref() -> dict:
    owner = _owner_payload()
    return {'profile': 'umf.native-target-custody/0.1',
            'custodianId': owner['custodianId'], 'registrationId': owner['registrationId'],
            'resourceId': owner['origin']['clusterId'],
            'incarnation': owner['origin']['incarnationId'], 'registrationDigest': _hex('1')}


def _provision_reserved(journal: ExternalCustodyJournal) -> tuple[str, str]:
    request = {
        'profile': 'umf.ingress-epoch-provision/0.1',
        'providerId': _owner_payload()['providerId'],
        'enrollmentId': '20000000-0000-4000-8000-000000000001',
        'installationId': 'installation-a', 'targetCustody': _custody_ref(),
        'planDigest': _hex('1'), 'fileDigest': _hex('2'), 'expectedHead': _hex('3'),
        'previousSourceDigest': _hex('4'), 'nextSourceDigest': _hex('5'),
        'nextBundleDigest': _hex('6'), 'newEpoch': '20000000-0000-4000-8000-000000000002',
        'issuerProfile': 'qualified-test-issuer/0.1',
        'principals': [{'loginName': 'epoch_person_1',
                        'subject': {'oid': 501, 'name': 'alice'}, 'audience': 'person'}],
        'maximumRoles': 1,
    }
    request_digest = _digest(request)
    approval_digest = _hex('7')
    snapshot = journal.snapshot()
    reservation_id = '20000000-0000-4000-8000-000000000003'
    reservation = {
        'profile': 'umf.native-epoch-provision-reservation/0.1', 'id': reservation_id,
        'custodianId': _owner_payload()['custodianId'],
        'registrationId': _owner_payload()['registrationId'],
        'incarnation': _owner_payload()['origin']['incarnationId'],
        'sequence': snapshot['sequence'] + 1, 'requestDigest': request_digest,
        'provisioningApprovalDigest': approval_digest, 'parentStateDigest': snapshot['headDigest'],
    }
    journal._append('epoch-provision-reserved', {
        'request': request, 'requestDigest': request_digest,
        'provisioningApprovalDigest': approval_digest, 'reservation': reservation,
    })
    return reservation_id, request_digest


class _SourceControlOwnerAdapter:
    """Synthetic adapter for journal controls only; never native qualification."""

    binding = None

    def __init__(self) -> None:
        self.calls = 0

    def resolve_owner_registration(self, request, *, custodian_id, provider_id):
        if (custodian_id != _owner_payload()['custodianId']
                or provider_id != _owner_payload()['providerId']):
            raise AssertionError('wrong registration scope')
        return self.evidence(request, 1)

    def observe_original_registration(self, request, *, original_payload,
                                      custodian_sequence):
        if original_payload != _owner_payload():
            raise AssertionError('changed original registration')
        if type(custodian_sequence) is not int or custodian_sequence < 1:
            raise AssertionError('invalid custodian sequence')
        self.calls += 1
        return self.evidence(request, custodian_sequence)

    def evidence(self, request, sequence):
        payload = _owner_payload()
        observation = {
            'profile': 'umf.local-target-registration-observation/0.1',
            'registrationDigest': _hex('1'), 'originReceiptDigest': _hex('c'),
            'currentLaunchReceiptDigest': _hex('2'), 'continuityChainDigest': _hex('3'),
            'endpointGateReceiptDigest': _hex('f'), 'nativeObservationDigest': _hex('4'),
            'custodianSequence': sequence,
        }
        return _issue_owner_registration_evidence(
            self.binding, request, payload, observation, object())


class ExternalCustodyJournalTests(unittest.TestCase):
    def test_originals_store_reservation_is_closed_and_only_admitted_in_02(self) -> None:
        store = {'profile': 'umf.native-row-originals-store/0.1',
                 'storeId': '10000000-0000-4000-8000-000000000003',
                 'schemaName': 'umf_originals_10000000000040008000000000000003'}
        evidence = {
            'profile': 'umf.pg18.original-store-authority-evidence/0.1',
            'supervisorId': '10000000-0000-4000-8000-000000000005',
            'custodianId': '10000000-0000-4000-8000-000000000002',
            'providerId': store['storeId'], 'installationId': 'installation-a',
            'ownerAuthorityId': '10000000-0000-4000-8000-000000000008',
            'ownerPolicyRevision': 'policy-a', 'registrationDigest': _hex('a'),
            'targetCustodyDigest': _hex('b'),
            'authorityPreparationReceiptDigest': _hex('c'),
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
                {'memberOid': 20, 'roleOid': 21, 'inherit': False, 'set': True, 'admin': False},
                {'memberOid': 20, 'roleOid': 22, 'inherit': False, 'set': True, 'admin': False},
            ],
            'requiredSettings': {'searchPath': 'pg_catalog', 'timeZone': 'UTC',
                'rowSecurity': 'on', 'sessionReplicationRole': 'origin',
                'transactionReadOnly': 'off', 'transactionIsolation': 'read committed'},
            'nativeAuthorityObservationDigest': _hex('d'),
        }
        request = {'profile': 'umf.owner-store-create-intent/0.1',
                   'store': store, 'evidence': evidence}
        custody = {
            'profile': 'umf.native-target-custody/0.1',
            'custodianId': '10000000-0000-4000-8000-000000000002',
            'registrationId': '10000000-0000-4000-8000-000000000009',
            'resourceId': '10000000-0000-4000-8000-000000000010',
            'incarnation': '10000000-0000-4000-8000-000000000011',
            'registrationDigest': _hex('e'),
        }
        evidence['targetCustodyDigest'] = _digest(custody)
        reservation = {
            'profile': 'umf.row-originals-store-reservation/0.1',
            'reservationId': '10000000-0000-4000-8000-000000000012',
            'providerId': store['storeId'], 'installationId': 'installation-a',
            'targetCustody': custody, 'store': store,
            'creationRequestDigest': _digest(request),
            'creationApprovalDigest': _hex('f'),
            'nativeAuthorityEvidenceDigest': evidence['nativeAuthorityObservationDigest'],
            'configurationDigest': _hex('1'), 'custodySequence': 1,
        }
        payload = {
            'purpose': 'native-acceptance', 'request': request,
            'approvalDigest': reservation['creationApprovalDigest'],
            'reservation': reservation, 'reservationDigest': _digest(reservation),
            'parent': {'sequence': 0, 'headDigest': '0' * 64},
        }
        self.assertEqual(journal._validate_event_payload(
            'originals-store-reserved', payload, profile=journal.JOURNAL_PROFILE_02),
            payload)
        with self.assertRaises(CustodyJournalError):
            journal._validate_event_payload('originals-store-reserved', payload)
        mismatched = {**payload, 'reservationDigest': _hex('2')}
        with self.assertRaises(CustodyJournalError):
            journal._validate_event_payload(
                'originals-store-reserved', mismatched, profile=journal.JOURNAL_PROFILE_02)

        events: list[dict[str, object]] = []
        head = '0' * 64

        def append(kind: str, event_payload: dict[str, object]) -> None:
            nonlocal head
            event: dict[str, object] = {
                'sequence': len(events) + 1, 'previousDigest': head,
                'kind': kind, 'payload': event_payload,
            }
            event['recordDigest'] = _digest(event)
            head = event['recordDigest']
            events.append(event)

        append('registration-intent', {'registrationId': custody['registrationId']})
        append('registration-observation', {
            'registrationId': custody['registrationId'],
            'observation': {'custodianSequence': 1},
        })
        append('registration-confirmed', {'targetCustody': custody})
        reserved = {**reservation, 'custodySequence': len(events) + 1}
        reserved_payload = {
            **payload, 'reservation': reserved,
            'reservationDigest': _digest(reserved),
            'parent': {'sequence': len(events), 'headDigest': head},
        }
        append('originals-store-reserved', reserved_payload)
        unknown = {
            'purpose': 'native-acceptance', 'reservationId': reserved['reservationId'],
            'reservationDigest': reserved_payload['reservationDigest'],
            'supervisorIntentDigest': _hex('3'), 'outcome': 'unknown',
            'nativeReceipt': None, 'nativeReceiptDigest': None, 'schemaOid': None,
            'nativeObservationDigest': _hex('4'),
            'transactionOutcomeDigest': _hex('5'),
            'parent': {'sequence': len(events), 'headDigest': head},
        }
        append('originals-store-observation', unknown)
        replayed = journal._replay(events, profile=journal.JOURNAL_PROFILE_02)
        self.assertEqual(next(iter(replayed['stores'].values()))['status'], 'reserved')
        self.assertEqual(len(next(iter(replayed['stores'].values()))['observations']), 1)
        competing = dict(reserved_payload)
        competing_reservation = {**reserved, 'reservationId':
                                 '10000000-0000-4000-8000-000000000013',
                                 'custodySequence': len(events) + 1}
        competing.update({
            'reservation': competing_reservation,
            'reservationDigest': _digest(competing_reservation),
            'parent': {'sequence': len(events), 'headDigest': head},
        })
        competing_event = {
            'sequence': len(events) + 1, 'previousDigest': head,
            'kind': 'originals-store-reserved', 'payload': competing,
        }
        competing_event['recordDigest'] = _digest(competing_event)
        with self.assertRaises(CustodyJournalError):
            journal._replay([*events, competing_event], profile=journal.JOURNAL_PROFILE_02)

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        os.chmod(self.temp.name, 0o700)
        self.path = Path(self.temp.name).resolve() / 'custody.json'
        self.journal = ExternalCustodyJournal(self.path, _owner_payload()['custodianId'])

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_registration_intent_observation_confirmation_are_durable_and_ordered(self) -> None:
        _registration_events(self.journal)
        snapshot = self.journal.snapshot()
        self.assertEqual(snapshot['profile'], JOURNAL_PROFILE)
        self.assertEqual(snapshot['sequence'], 3)
        self.assertEqual(snapshot['pending'], {})
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        on_disk = json.loads(self.path.read_text())
        self.assertEqual(on_disk['sequence'], 3)
        self.assertEqual(on_disk['events'][0]['kind'], 'registration-intent')
        self.assertEqual(on_disk['events'][0]['payload']['ownerPayload'], _owner_payload())

    def test_uncertain_registration_cannot_be_replaced_by_a_new_intent(self) -> None:
        owner = _owner_payload()
        self.journal._append('registration-intent', {
            'registrationId': owner['registrationId'], 'registrationDigest': _hex('1'),
            'ownerPayload': owner,
            'ownerApproval': {'approvalId': owner['ownerApproval']['approvalId'],
                              'approvalDigest': owner['ownerApproval']['approvalDigest']},
        })
        with self.assertRaisesRegex(CustodyJournalError, 'journal-order-invalid'):
            second_owner = _owner_payload()
            second_owner['registrationId'] = '20000000-0000-4000-8000-000000000001'
            self.journal._append('registration-intent', {
                'registrationId': second_owner['registrationId'],
                'registrationDigest': _hex('2'), 'ownerPayload': second_owner,
                'ownerApproval': {'approvalId': second_owner['ownerApproval']['approvalId'],
                                  'approvalDigest': second_owner['ownerApproval']['approvalDigest']},
            })
        self.assertEqual(self.journal.snapshot()['sequence'], 1)
        self.assertEqual(self.journal.snapshot()['pending'], {'registration': owner['registrationId']})

    def test_custodian_and_owner_request_cannot_be_constructed_without_private_seals(self) -> None:
        from umf_access.lifecycle.generation_ingress import OwnerEnrollmentRequest

        with self.assertRaises(TypeError):
            OwnerEnrollmentRequest(object(), object(), 'umf.local-owner-target-registration/0.1')
        with self.assertRaises(TypeError):
            LocalTargetCustodian(object(), self.journal, _owner_payload()['custodianId'],
                                 _owner_payload()['providerId'], object())

    def test_owner_issuer_binding_mints_identity_registered_custody_and_restart_reobserves(self) -> None:
        from umf_access.lifecycle import generation_ingress

        issuer = object()
        adapter = _SourceControlOwnerAdapter()
        resolver = _bind_owner_registration_resolver(issuer, adapter, object())
        adapter.binding = resolver
        request = generation_ingress.OwnerEnrollmentRequest(
            generation_ingress._CAPABILITY_SEAL, issuer,
            'umf.local-owner-target-registration/0.1')
        custodian = _bootstrap_local_target_custodian(
            self.journal, _owner_payload()['custodianId'], _owner_payload()['providerId'], resolver)
        self.assertIs(type(custodian), LocalTargetCustodian)
        with _synthetic_control_lease('registration-apply') as lease:
            handle = custodian.register_target(request, control_lease=lease)
        verified = custodian._resolve_target_custody(handle)
        self.assertIs(verified.custodian, custodian)
        self.assertEqual(custodian._public_reference(handle)['registrationDigest'], _hex('1'))
        self.assertEqual(self.journal.snapshot()['sequence'], 3)

        forged = generation_ingress.TargetCustody(
            generation_ingress._CAPABILITY_SEAL, object(), 'umf.native-target-custody/0.1')
        with self.assertRaisesRegex(CustodyJournalError, 'target-custody-required'):
            custodian._resolve_target_custody(forged)

        restarted = _bootstrap_local_target_custodian(
            self.journal, _owner_payload()['custodianId'], _owner_payload()['providerId'], resolver)
        with _synthetic_control_lease('registration-apply') as lease:
            reissued = restarted.register_target(request, control_lease=lease)
        self.assertEqual(restarted._public_reference(reissued), custodian._public_reference(handle))
        self.assertEqual(self.journal.snapshot()['sequence'], 4)

    def test_lost_confirmation_ack_reconciles_same_registration_after_durability_barrier(self) -> None:
        from umf_access.lifecycle import generation_ingress

        issuer = object()
        adapter = _SourceControlOwnerAdapter()
        resolver = _bind_owner_registration_resolver(issuer, adapter, object())
        adapter.binding = resolver
        request = generation_ingress.OwnerEnrollmentRequest(
            generation_ingress._CAPABILITY_SEAL, issuer,
            'umf.local-owner-target-registration/0.1')
        custodian = _bootstrap_local_target_custodian(
            self.journal, _owner_payload()['custodianId'], _owner_payload()['providerId'], resolver)
        original_replace = ExternalCustodyJournal._replace
        replacements = 0

        def replace_then_lose_confirmation(self, data):
            nonlocal replacements
            replacements += 1
            original_replace(self, data)
            if replacements == 3:
                raise CustodyJournalError('journal-write-failed')

        with (patch.object(ExternalCustodyJournal, '_replace', replace_then_lose_confirmation),
              self.assertRaisesRegex(CustodyJournalError,
                                     'registration-confirmation-outcome-unknown'),
              _synthetic_control_lease('registration-apply') as lease):
            custodian.register_target(request, control_lease=lease)
        self.assertEqual(self.journal.snapshot()['sequence'], 3)
        self.assertEqual(self.journal.snapshot()['pending'], {})
        # The next call reobserves and issues a new volatile handle from the
        # same confirmed registration; it does not reserve a second ID.
        with _synthetic_control_lease('registration-apply') as lease:
            reissued = custodian.register_target(request, control_lease=lease)
        self.assertEqual(self.journal.snapshot()['sequence'], 4)
        self.assertEqual(custodian._public_reference(reissued)['registrationId'],
                         _owner_payload()['registrationId'])

    def test_confirmed_reattachment_reissues_handle_without_journal_mutation(self) -> None:
        from umf_access.lifecycle import generation_ingress

        issuer = object()
        adapter = _SourceControlOwnerAdapter()
        resolver = _bind_owner_registration_resolver(issuer, adapter, object())
        adapter.binding = resolver
        request = generation_ingress.OwnerEnrollmentRequest(
            generation_ingress._CAPABILITY_SEAL, issuer,
            'umf.local-owner-target-registration/0.1')
        initial = _bootstrap_local_target_custodian(
            self.journal, _owner_payload()['custodianId'], _owner_payload()['providerId'], resolver)
        with _synthetic_control_lease('registration-apply') as lease:
            original_handle = initial.register_target(request, control_lease=lease)
        original_ref = initial._public_reference(original_handle)
        original_bytes = self.path.read_bytes()
        original_sequence = self.journal.snapshot()['sequence']

        restarted = _bootstrap_local_target_custodian(
            self.journal, _owner_payload()['custodianId'], _owner_payload()['providerId'], resolver)
        with _synthetic_control_lease('registration-recover') as lease:
            handle = restarted.reattach_confirmed_target(request, control_lease=lease)

        self.assertEqual(restarted._public_reference(handle), original_ref)
        self.assertIsNot(handle, original_handle)
        self.assertEqual(self.path.read_bytes(), original_bytes)
        self.assertEqual(self.journal.snapshot()['sequence'], original_sequence)

    def test_confirmed_reattachment_refuses_unconfirmed_or_changed_original(self) -> None:
        from umf_access.lifecycle import generation_ingress

        issuer = object()
        adapter = _SourceControlOwnerAdapter()
        resolver = _bind_owner_registration_resolver(issuer, adapter, object())
        adapter.binding = resolver
        request = generation_ingress.OwnerEnrollmentRequest(
            generation_ingress._CAPABILITY_SEAL, issuer,
            'umf.local-owner-target-registration/0.1')
        custodian = _bootstrap_local_target_custodian(
            self.journal, _owner_payload()['custodianId'], _owner_payload()['providerId'], resolver)
        self.journal._append('registration-intent', {
            'registrationId': _owner_payload()['registrationId'],
            'registrationDigest': _hex('1'), 'ownerPayload': _owner_payload(),
            'ownerApproval': {'approvalId': _owner_payload()['ownerApproval']['approvalId'],
                              'approvalDigest': _owner_payload()['ownerApproval']['approvalDigest']},
        })
        before = self.path.read_bytes()
        with (self.assertRaisesRegex(CustodyJournalError,
                                     'registration-confirmation-required'),
              _synthetic_control_lease('registration-recover') as lease):
            custodian.reattach_confirmed_target(request, control_lease=lease)
        self.assertEqual(self.path.read_bytes(), before)

    def test_unknown_members_duplicate_keys_and_noncanonical_bytes_refuse(self) -> None:
        owner = _owner_payload()
        payload = {'registrationId': owner['registrationId'], 'registrationDigest': _hex('1'),
                   'ownerPayload': owner,
                   'ownerApproval': {'approvalId': owner['ownerApproval']['approvalId'],
                                     'approvalDigest': owner['ownerApproval']['approvalDigest']},
                   'extra': True}
        with self.assertRaisesRegex(CustodyJournalError, 'journal-invalid'):
            self.journal._append('registration-intent', payload)
        self.path.write_text('{"a":1,"a":1}')
        os.chmod(self.path, 0o600)
        with self.assertRaisesRegex(CustodyJournalError, 'journal-corrupt'):
            self.journal.snapshot()

    def test_tampered_digest_or_sequence_refuses_on_read(self) -> None:
        _registration_events(self.journal)
        doc = json.loads(self.path.read_text())
        doc['events'][1]['sequence'] = 9
        self.path.write_text(json.dumps(doc, sort_keys=True, separators=(',', ':')))
        os.chmod(self.path, 0o600)
        with self.assertRaisesRegex(CustodyJournalError, 'journal-corrupt'):
            self.journal.snapshot()

    def test_symlink_journal_is_not_followed(self) -> None:
        target = Path(self.temp.name) / 'target'
        target.write_text('{}')
        os.chmod(target, 0o600)
        self.path.symlink_to(target)
        with self.assertRaisesRegex(CustodyJournalError, 'journal-unavailable'):
            self.journal.snapshot()
        self.assertEqual(target.read_text(), '{}')

    def test_no_new_transition_reservation_before_original_provision_is_confirmed(self) -> None:
        _registration_events(self.journal)
        request = {'profile': 'umf.table-generation-ingress/0.1'}
        invalid = {'reservationId': '20000000-0000-4000-8000-000000000001',
                   'request': request, 'requestDigest': _hex('1'),
                   'ingressApprovalDigest': _hex('2'), 'reservation': {}}
        with self.assertRaisesRegex(CustodyJournalError, 'journal-invalid'):
            self.journal._append('transition-reserved', invalid)
        self.assertEqual(self.journal.snapshot()['sequence'], 3)

    def test_provision_reservation_is_durable_and_transition_waits_for_exact_confirmation(self) -> None:
        _registration_events(self.journal)
        reservation_id, _request_digest = _provision_reserved(self.journal)
        snapshot = self.journal.snapshot()
        self.assertEqual(snapshot['pending'], {'provision': reservation_id})
        receipt_digest = _hex('8')
        self.journal._append('epoch-provision-observation', {
            'reservationId': reservation_id, 'outcome': 'pending', 'nativeReceiptDigest': None,
        })
        self.assertEqual(self.journal.snapshot()['pending'], {'provision': reservation_id})
        self.journal._append('epoch-provision-observation', {
            'reservationId': reservation_id, 'outcome': 'prepared',
            'nativeReceiptDigest': receipt_digest,
        })
        with self.assertRaisesRegex(CustodyJournalError, 'journal-order-invalid'):
            _provision_reserved(self.journal)
        self.journal._append('epoch-provision-confirmed', {
            'reservationId': reservation_id, 'nativeReceiptDigest': receipt_digest,
        })

        request = {
            'profile': 'umf.table-generation-ingress/0.1',
            'providerId': _owner_payload()['providerId'],
            'enrollmentId': '20000000-0000-4000-8000-000000000001',
            'installationId': 'installation-a', 'targetCustody': _custody_ref(),
            'targetIdentityDigest': _hex('9'), 'planDigest': _hex('a'),
            'fileDigest': _hex('b'), 'expectedHead': _hex('c'),
            'previousSourceDigest': _hex('d'), 'nextSourceDigest': _hex('e'),
            'previousBundleDigest': _hex('f'), 'nextBundleDigest': _hex('1'),
            'oldEpoch': '20000000-0000-4000-8000-000000000002',
            'newEpoch': '20000000-0000-4000-8000-000000000004',
            'oldPrincipalsDigest': _hex('2'), 'newPrincipalsDigest': _hex('3'),
            'approvalDigest': _hex('4'),
            'executionPolicyDigest': _hex('8'),
        }
        self.assertEqual(journal._validate_event_payload('transition-reserved', {
            'reservationId': '20000000-0000-4000-8000-000000000005',
            'request': request, 'requestDigest': _digest(request),
            'ingressApprovalDigest': _hex('5'),
            'reservation': {
                'profile': 'umf.native-target-reservation/0.1',
                'id': '20000000-0000-4000-8000-000000000005',
                'custodianId': _owner_payload()['custodianId'],
                'registrationId': _owner_payload()['registrationId'],
                'incarnation': _owner_payload()['origin']['incarnationId'],
                'sequence': self.journal.snapshot()['sequence'] + 1,
                'requestDigest': _digest(request), 'ingressApprovalDigest': _hex('5'),
                'parentStateDigest': self.journal.snapshot()['headDigest'],
            },
        })['request'], request)
        for mutate in (
                lambda value: value.pop('executionPolicyDigest'),
                lambda value: value.update(unexpected='closed')):
            invalid_request = dict(request)
            mutate(invalid_request)
            invalid = {
                'reservationId': '20000000-0000-4000-8000-000000000005',
                'request': invalid_request,
                'requestDigest': _digest(invalid_request),
                'ingressApprovalDigest': _hex('5'),
                'reservation': {
                    'profile': 'umf.native-target-reservation/0.1',
                    'id': '20000000-0000-4000-8000-000000000005',
                    'custodianId': _owner_payload()['custodianId'],
                    'registrationId': _owner_payload()['registrationId'],
                    'incarnation': _owner_payload()['origin']['incarnationId'],
                    'sequence': self.journal.snapshot()['sequence'] + 1,
                    'requestDigest': _digest(invalid_request),
                    'ingressApprovalDigest': _hex('5'),
                    'parentStateDigest': self.journal.snapshot()['headDigest'],
                },
            }
            with self.assertRaisesRegex(CustodyJournalError, 'journal-invalid'):
                journal._validate_event_payload('transition-reserved', invalid)
        request_digest = _digest(request)
        approval_digest = _hex('5')
        snapshot = self.journal.snapshot()
        reservation_id = '20000000-0000-4000-8000-000000000005'
        reservation = {
            'profile': 'umf.native-target-reservation/0.1', 'id': reservation_id,
            'custodianId': _owner_payload()['custodianId'],
            'registrationId': _owner_payload()['registrationId'],
            'incarnation': _owner_payload()['origin']['incarnationId'],
            'sequence': snapshot['sequence'] + 1, 'requestDigest': request_digest,
            'ingressApprovalDigest': approval_digest, 'parentStateDigest': snapshot['headDigest'],
        }
        self.journal._append('transition-reserved', {
            'reservationId': reservation_id, 'request': request,
            'requestDigest': request_digest, 'ingressApprovalDigest': approval_digest,
            'reservation': reservation,
        })
        self.assertEqual(self.journal.snapshot()['pending'], {'transition': reservation_id})
        self.journal._append('transition-observation', {
            'reservationId': reservation_id, 'nativeState': 'fenced',
            'nativeReceiptDigest': _hex('6'),
        })
        self.journal._append('transition-confirmed', {
            'reservationId': reservation_id, 'nativeReceiptDigest': _hex('6'),
        })
        self.assertEqual(self.journal.snapshot()['pending'], {})
        self.assertEqual(request_digest, _digest(request))

    def test_digest_is_stable_over_closed_json(self) -> None:
        self.assertEqual(_digest({'a': 1, 'b': [True, None]}),
                         hashlib.sha256(b'{"a":1,"b":[true,null]}').hexdigest())


if __name__ == '__main__':
    unittest.main()

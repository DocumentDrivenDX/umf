# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import copy
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from umf_access.lifecycle import generation_ingress
from umf_access.lifecycle import ingress_custody as journal
from umf_access.lifecycle import ingress_store as store
from umf_access.lifecycle.catalog import CatalogError
from umf_access.lifecycle.phase_policy import FieldReplacementExecutionPolicy


def _custody():
    return {
        'profile': store.TARGET_CUSTODY_PROFILE,
        'custodianId': '00000000-0000-4000-8000-000000000002',
        'registrationId': '00000000-0000-4000-8000-000000000003',
        'resourceId': '00000000-0000-4000-8000-000000000006',
        'incarnation': '00000000-0000-4000-8000-000000000007',
        'registrationDigest': '1' * 64,
    }


_custody_fixture = None


def _registered_custody():
    global _custody_fixture
    if _custody_fixture is not None:
        return _custody_fixture[1:]
    owner = {
        'profile': 'umf.local-owner-target-registration/0.1',
        'registrationId': _custody()['registrationId'],
        'custodianId': _custody()['custodianId'],
        'providerId': '00000000-0000-4000-8000-000000000001',
        'installationId': 'installation-a',
        'ownerApproval': {'authorityId': 'test',
                          'approvalId': '00000000-0000-4000-8000-000000000004',
                          'approvalDigest': 'b' * 64,
                          'scope': 'enroll-owned-local-postgresql-target'},
        'origin': {
            'profile': 'postgresql18-local-supervised-origin/0.1',
            'supervisorId': '00000000-0000-4000-8000-000000000005',
            'clusterId': _custody()['resourceId'],
            'incarnationId': _custody()['incarnation'],
            'creationReceiptDigest': 'c' * 64,
            'nativeBinary': {'path': '/test/postgres', 'sha256': 'd' * 64, 'version': '18.6'},
            'dataDirectory': {'path': '/test/data', 'device': '1', 'inode': '2', 'ownerUid': 501},
            'initialPostmaster': {'pid': 42, 'startToken': 'boot', 'launchReceiptDigest': 'e' * 64},
            'database': {'name': 'fixture_db', 'oid': 52001, 'systemIdentifier': '7123456789'},
            'endpoint': {'host': '127.0.0.1', 'port': 55439},
        },
        'endpointControl': {'controllerId': '00000000-0000-4000-8000-000000000008',
                            'profile': 'umf.local-postgresql-endpoint-controller/0.1',
                            'authorityReceiptDigest': 'f' * 64},
    }
    temp = tempfile.TemporaryDirectory()
    os.chmod(temp.name, 0o700)
    journal_file = journal.ExternalCustodyJournal(
        Path(temp.name).resolve() / 'custody.json', owner['custodianId'])
    issuer = object()

    class TestOwnerAdapter:
        resolver = None

        def evidence(self, request, sequence):
            observation = {
                'profile': 'umf.local-target-registration-observation/0.1',
                'registrationDigest': '1' * 64, 'originReceiptDigest': 'c' * 64,
                'currentLaunchReceiptDigest': '2' * 64, 'continuityChainDigest': '3' * 64,
                'endpointGateReceiptDigest': 'f' * 64, 'nativeObservationDigest': '4' * 64,
                'custodianSequence': sequence,
            }
            return journal._issue_owner_registration_evidence(
                self.resolver, request, owner, observation, object())

        def resolve_owner_registration(self, request, *, custodian_id, provider_id):
            if custodian_id != owner['custodianId'] or provider_id != owner['providerId']:
                raise AssertionError('wrong test custody identity')
            return self.evidence(request, 1)

        def observe_original_registration(self, request, *, original_payload, custodian_sequence):
            if (original_payload != owner or type(custodian_sequence) is not int
                    or custodian_sequence < 1):
                raise AssertionError('changed test registration')
            return self.evidence(request, custodian_sequence)

    adapter = TestOwnerAdapter()
    resolver = journal._bind_owner_registration_resolver(issuer, adapter)
    adapter.resolver = resolver
    request = generation_ingress.OwnerEnrollmentRequest(
        generation_ingress._CAPABILITY_SEAL, issuer,
        'umf.local-owner-target-registration/0.1')
    custodian = journal._bootstrap_local_target_custodian(
        journal_file, owner['custodianId'], owner['providerId'], resolver)
    handle = custodian.register_target(request)
    verified = custodian._resolve_target_custody(handle)
    _custody_fixture = (temp, custodian, handle, verified, custodian._public_reference(handle))
    return _custody_fixture[1:]


def _principals():
    return [{
        'login': {'oid': 41001, 'name': 'login_a'},
        'subject': {'oid': 42001, 'name': 'subject_a'},
        'audience': 'person',
        'issuerProfile': 'test-issuer/1',
        'issuerReceiptDigest': 'b' * 64,
        'ownershipReceiptDigest': 'c' * 64,
        'memberships': [{
            'roleOid': 43001, 'roleName': 'subject_a',
            'inherit': False, 'set': True, 'admin': False,
        }],
    }]


def _epoch(epoch_id, *, state, head, sequence):
    principals = _principals()
    principals_digest = store._digest(principals)
    return {
        'profile': store.EPOCH_PROFILE,
        'providerId': '00000000-0000-4000-8000-000000000001',
        'enrollmentId': 'enrollment-a',
        'installationId': 'installation-a',
        'targetCustody': _custody(),
        'epoch': epoch_id,
        'state': state,
        'sourceDigest': 'd' * 64,
        'bundleDigest': 'e' * 64,
        'headDigest': head,
        'principals': principals,
        'principalsDigest': principals_digest,
        'custodySequence': sequence,
        'origin': 'provision',
        'originReceipt': {
            'profile': 'umf.native-ingress-provision-receipt/0.1',
            'providerId': '00000000-0000-4000-8000-000000000001',
            'enrollmentId': 'enrollment-a',
            'epoch': epoch_id,
            'requestDigest': '1' * 64,
            'reservationDigest': '2' * 64,
            'principalsDigest': principals_digest,
            'nativeOwnershipDigest': '3' * 64,
            'targetObservationDigest': '4' * 64,
        },
    }


def _transition():
    policy = FieldReplacementExecutionPolicy().normal_form()
    request = {
        'profile': 'umf.table-generation-ingress/0.1',
        'providerId': '00000000-0000-4000-8000-000000000001',
        'enrollmentId': '00000000-0000-4000-8000-000000000008',
        'installationId': 'installation-a',
        'targetIdentityDigest': '5' * 64, 'planDigest': '6' * 64,
        'fileDigest': '7' * 64, 'expectedHead': '8' * 64,
        'previousSourceDigest': 'd' * 64, 'nextSourceDigest': '9' * 64,
        'previousBundleDigest': 'e' * 64, 'nextBundleDigest': 'a' * 64,
        'oldEpoch': '00000000-0000-4000-8000-000000000002',
        'newEpoch': '00000000-0000-4000-8000-000000000003',
        'oldPrincipalsDigest': store._digest(_principals()),
        'newPrincipalsDigest': store._digest(_principals()),
        'approvalDigest': 'b' * 64,
        'targetCustody': _custody(),
        'executionPolicyDigest': store._digest(policy),
    }
    reservation = {
        'profile': 'umf.native-target-reservation/0.1',
        'id': 'reservation-a', 'custodianId': _custody()['custodianId'],
        'registrationId': _custody()['registrationId'], 'incarnation': _custody()['incarnation'],
        'sequence': 1, 'requestDigest': store._digest(request),
        'ingressApprovalDigest': 'c' * 64, 'parentStateDigest': 'd' * 64,
    }
    return {
        'profile': store.TRANSITION_PROFILE,
        'transitionId': '00000000-0000-4000-8000-000000000004',
        'request': request,
        'requestDigest': store._digest(request),
        'ingressApprovalDigest': 'c' * 64,
        'reservation': reservation,
        'reservationDigest': store._digest(reservation),
        'state': 'prepared', 'phaseIndex': 0,
        'executionPolicy': policy,
        'fenceReceipt': None, 'phaseReceipt': None,
        'phaseBudgetReceipt': None, 'publicationReceipt': None,
    }


def _phase_records():
    fenced = _transition()
    fenced['state'] = 'fenced'
    fenced['fenceReceipt'] = _fence(fenced)
    policy = FieldReplacementExecutionPolicy()
    from umf_access.lifecycle.phase_policy import PhaseBudgetCounter
    budget = PhaseBudgetCounter(policy).receipt()
    cutover = copy.deepcopy(fenced)
    cutover.update(state='cutover', phaseIndex=1,
                   phaseReceipt={
                       'migrationId': 'migration-a',
                       'planDigest': fenced['request']['planDigest'],
                       'expectedHead': fenced['request']['expectedHead'],
                       'fileDigest': fenced['request']['fileDigest'],
                       'phaseIndex': 1, 'state': 'complete',
                       'phaseDigest': '3' * 64, 'completedSteps': ['step-00001'],
                       'prefixWitness': {},
                   },
                   phaseBudgetReceipt=budget)
    return fenced, cutover


class _HookConnection:
    def __init__(self):
        from psycopg.pq import TransactionStatus
        self.info = SimpleNamespace(transaction_status=TransactionStatus.INTRANS)
        self.calls = []
        self.closed = False
        self.rollback_calls = 0

    def rollback(self):
        self.rollback_calls += 1
        self.info.transaction_status = 0

    def close(self):
        self.closed = True


def _phase_binding(connection):
    return store._bind_phase_transaction(
        connection, provider_id='00000000-0000-4000-8000-000000000001',
        installation_id='installation-a', target_identity_digest='5' * 64,
        session_user='maintenance_a', session_user_oid=51001,
        business_owner='owner_a', business_owner_oid=51004, database_oid=52001)


def _journal_transition(custody_journal):
    provision_request = {
        'profile': 'umf.ingress-epoch-provision/0.1',
        'providerId': '00000000-0000-4000-8000-000000000001',
        'enrollmentId': '20000000-0000-4000-8000-000000000001',
        'installationId': 'installation-a', 'targetCustody': _custody(),
        'planDigest': '1' * 64, 'fileDigest': '2' * 64,
        'expectedHead': '3' * 64, 'previousSourceDigest': '4' * 64,
        'nextSourceDigest': '5' * 64, 'nextBundleDigest': '6' * 64,
        'newEpoch': '20000000-0000-4000-8000-000000000002',
        'issuerProfile': 'test-issuer/1',
        'principals': [{'loginName': 'login_a',
                        'subject': {'oid': 42001, 'name': 'subject_a'},
                        'audience': 'person'}],
        'maximumRoles': 1,
    }
    provision_digest = store._digest(provision_request)
    provision_approval = '7' * 64
    snapshot = custody_journal.snapshot()
    provision_id = '20000000-0000-4000-8000-000000000003'
    provision_reservation = {
        'profile': 'umf.native-epoch-provision-reservation/0.1',
        'id': provision_id, 'custodianId': _custody()['custodianId'],
        'registrationId': _custody()['registrationId'],
        'incarnation': _custody()['incarnation'],
        'sequence': snapshot['sequence'] + 1,
        'requestDigest': provision_digest,
        'provisioningApprovalDigest': provision_approval,
        'parentStateDigest': snapshot['headDigest'],
    }
    custody_journal._append('epoch-provision-reserved', {
        'request': provision_request, 'requestDigest': provision_digest,
        'provisioningApprovalDigest': provision_approval,
        'reservation': provision_reservation,
    })
    receipt = '9' * 64
    custody_journal._append('epoch-provision-observation', {
        'reservationId': provision_id, 'outcome': 'prepared',
        'nativeReceiptDigest': receipt,
    })
    custody_journal._append('epoch-provision-confirmed', {
        'reservationId': provision_id, 'nativeReceiptDigest': receipt,
    })
    record = _transition()
    request = record['request']
    request['targetCustody'] = _custody()
    record['requestDigest'] = store._digest(request)
    reservation = {
        'profile': 'umf.native-target-reservation/0.1',
        'id': '20000000-0000-4000-8000-000000000005',
        'custodianId': request['targetCustody']['custodianId'],
        'registrationId': request['targetCustody']['registrationId'],
        'incarnation': request['targetCustody']['incarnation'],
        'sequence': custody_journal.snapshot()['sequence'] + 1,
        'requestDigest': record['requestDigest'],
        'ingressApprovalDigest': 'c' * 64,
        'parentStateDigest': custody_journal.snapshot()['headDigest'],
    }
    custody_journal._append('transition-reserved', {
        'reservationId': reservation['id'], 'request': request,
        'requestDigest': record['requestDigest'],
        'ingressApprovalDigest': reservation['ingressApprovalDigest'],
        'reservation': reservation,
    })
    return custody_journal._load()['events'][-1]['payload'], record


def _fence(record):
    return {
        'profile': 'umf.native-ingress-fence/0.1',
        'requestDigest': record['requestDigest'],
        'reservationDigest': record['reservationDigest'],
        'targetObservationDigest': '1' * 64,
        'oldRolesDigest': '2' * 64,
        'oldMembershipsDigest': '3' * 64,
        'affectedAclsDigest': '4' * 64,
        'barrierCandidates': [], 'retiredSessions': [],
        'catalogSide': 'previous',
    }


def _original_authority(*, memberships=None, flags=None, settings=None,
                        business_owner_oid=51004):
    custodian, handle, verified, reference = _registered_custody()
    if memberships is None:
        memberships = tuple(sorted(((51001, 51002, False, True, False),
                                    (51001, business_owner_oid, False, True, False))))
    if flags is None:
        flags = ((True, False, False, False, False, False, False),
                 (False, False, False, False, False, False, False),
                 (True, False, False, False, False, False, False))
    return store._OriginalStoreCreationAuthority(
        provider_id='00000000-0000-4000-8000-000000000001',
        installation_id='installation-a', custodian=custodian,
        verified_target=verified, target_handle=handle, target_custody=reference,
        schema_oid=None, registration_digest='d' * 64,
        authority_preparation_receipt_digest='e' * 64,
        creation_approval_digest='f' * 64,
        target_custody_digest=store._digest(reference),
        maintenance_user='maintenance_a', maintenance_user_oid=51001,
        controller_role='controller_a', controller_oid=51002,
        business_owner='owner_a', business_owner_oid=business_owner_oid,
        principal_flags=flags, membership_observations=memberships,
        required_settings=store._STORE_SETTINGS if settings is None else settings,
        database_name='fixture_db', database_system_identifier='7123456789',
        native_authority_observation_digest='a' * 64, _seal=store._CAPABILITY_SEAL)


def _store_instance(authority):
    return store.PgGenerationIngressStore(
        object(), provider_id='00000000-0000-4000-8000-000000000001',
        installation_id='installation-a', controller_role='controller_a',
        controller_oid=51002, database_oid=52001, custodian=authority.custodian,
        target_custody=authority.target_handle, creation_authority=authority)


class G11IngressStoreTests(unittest.TestCase):
    def test_schema_ddl_has_only_epoch_active_partial_index(self):
        statements = []
        with patch.object(store, '_execute', side_effect=lambda _c, sql, *_a: statements.append(sql)):
            aliases = {}
            store._create_table(None, 'control', 'transitions', store._TRANSITION_COLUMNS,
                                store._TRANSITION_CONSTRAINTS, aliases, foreign_keys=True)
            self.assertFalse(any(sql.startswith('CREATE UNIQUE INDEX') for sql in statements))

            statements.clear()
            aliases.clear()
            store._create_table(None, 'control', 'scratch_epochs', store._EPOCH_COLUMNS,
                                store._EPOCH_CONSTRAINTS, aliases)
        index_sql = [sql for sql in statements if sql.startswith('CREATE UNIQUE INDEX')]
        self.assertEqual(len(index_sql), 1)
        self.assertIn('WHERE "state" = \'active\'', index_sql[0])
        self.assertIn('ingress_epochs_one_active', aliases.values())
        self.assertEqual(store._literal("provider's marker"), "'provider''s marker'")

    def test_epoch_record_requires_exact_provision_receipt_and_valid_principal_inventory(self):
        record = _epoch('00000000-0000-4000-8000-000000000005',
                        state='prepared', head=None, sequence=1)
        checked, digest = store._validate_store_record(record, store.EPOCH_PROFILE)
        self.assertEqual(checked, record)
        self.assertEqual(digest, store._digest(record))

        for mutate in (
                lambda value: value['principals'][0]['memberships'][0].update(admin=True),
                lambda value: value['originReceipt'].update(epoch='not-the-epoch'),
                lambda value: value.update(custodySequence=True)):
            broken = copy.deepcopy(record)
            with self.subTest(mutation=mutate):
                mutate(broken)
                with self.assertRaises(CatalogError):
                    store._validate_store_record(broken, store.EPOCH_PROFILE)

        broken = copy.deepcopy(record)
        broken['unexpected'] = True
        with self.assertRaisesRegex(CatalogError, 'ingress-record-invalid'):
            store._validate_store_record(broken, store.EPOCH_PROFILE)

    def test_transition_record_binds_request_reservation_policy_and_phase_state(self):
        record = _transition()
        checked, _ = store._validate_store_record(record, store.TRANSITION_PROFILE)
        self.assertEqual(checked, record)
        following = copy.deepcopy(record)
        following['state'] = 'fencing'
        self.assertTrue(store._legal_transition(record, following))

        fenced = copy.deepcopy(following)
        fenced['state'] = 'fenced'
        fenced['fenceReceipt'] = _fence(record)
        self.assertTrue(store._legal_transition(following, fenced))
        self.assertEqual(store._validate_store_record(fenced, store.TRANSITION_PROFILE)[0], fenced)

        following['request']['planDigest'] = 'f' * 64
        self.assertFalse(store._legal_transition(record, following))

        malformed = copy.deepcopy(record)
        malformed['reservation']['sequence'] = True
        malformed['reservationDigest'] = store._digest(malformed['reservation'])
        with self.assertRaisesRegex(CatalogError, 'ingress-record-invalid'):
            store._validate_store_record(malformed, store.TRANSITION_PROFILE)

        impossible = copy.deepcopy(record)
        impossible['phaseReceipt'] = {}
        with self.assertRaisesRegex(CatalogError, 'ingress-record-invalid'):
            store._validate_store_record(impossible, store.TRANSITION_PROFILE)

    def test_transition_columns_are_derived_from_the_nested_request_and_round_trip_exactly(self):
        record = _transition()
        columns = store._record_columns(record)
        self.assertEqual(columns[:5], (
            record['transitionId'], record['request']['providerId'],
            record['request']['installationId'], record['request']['oldEpoch'],
            record['request']['newEpoch']))
        row = (*columns, record, store._digest(record))
        authority = _original_authority()
        instance = _store_instance(authority)
        with (patch.object(store.PgGenerationIngressStore, 'verify_original_store'),
              patch.object(store, '_one', return_value=row)):
            self.assertEqual(instance._read_transition_on(
                instance._connection, record['transitionId']), record)
        damaged = (columns[0], columns[1], 'other-installation', *columns[3:])
        with self.assertRaisesRegex(CatalogError, 'ingress-record-column-mismatch'):
            instance._checked_row((*damaged, record, store._digest(record)),
                                  store.TRANSITION_PROFILE)

    def test_journal_reserved_request_is_persisted_and_read_back_without_identity_drift(self):
        custodian, _handle, _verified, _reference = _registered_custody()
        payload, template = _journal_transition(custodian._journal)
        record = copy.deepcopy(template)
        record.update(request=payload['request'], requestDigest=payload['requestDigest'],
                      ingressApprovalDigest=payload['ingressApprovalDigest'],
                      reservation=payload['reservation'],
                      reservationDigest=store._digest(payload['reservation']))
        old_epoch = _epoch(record['request']['oldEpoch'], state='active',
                           head=record['request']['expectedHead'], sequence=1)
        new_epoch = _epoch(record['request']['newEpoch'], state='prepared',
                           head=None, sequence=2)
        new_epoch['sourceDigest'] = record['request']['nextSourceDigest']
        new_epoch['bundleDigest'] = record['request']['nextBundleDigest']
        instance = _store_instance(_original_authority())
        with (patch.object(store.PgGenerationIngressStore, 'verify_original_store'),
              patch.object(store.PgGenerationIngressStore, '_read_transition_on',
                           return_value=None),
              patch.object(store.PgGenerationIngressStore, 'read_epoch',
                           side_effect=[old_epoch, new_epoch]),
              patch.object(store, '_one', side_effect=[(0,), (record['transitionId'],)]) as query):
            persisted = instance.insert_transition(record)
        self.assertEqual(persisted, record)
        insert_args = query.call_args.args
        self.assertIn('INSERT INTO', insert_args[1])
        json_record = insert_args[2][-2]
        self.assertEqual(json_record.obj, record)
        self.assertEqual(json_record.obj['request'], payload['request'])
        restored = instance._checked_row(
            (*store._record_columns(record), json_record.obj, store._digest(record)),
            store.TRANSITION_PROFILE)
        self.assertEqual(restored, record)

    def test_public_transition_cas_cannot_cut_over_without_the_phase_hook(self):
        _fenced, cutover = _phase_records()
        instance = _store_instance(_original_authority())
        with (patch.object(store.PgGenerationIngressStore, 'verify_original_store') as verify,
              patch.object(store.PgGenerationIngressStore, '_advance_transition_on') as advance,
              self.assertRaisesRegex(CatalogError, 'ingress-publication-hook-required')):
            instance.advance_transition(cutover['transitionId'], 'fenced', cutover)
        verify.assert_not_called()
        advance.assert_not_called()

    def test_phase_hook_dispatches_on_bound_transaction_and_normalizes_native_system_id(self):
        fenced, cutover = _phase_records()
        authority = _original_authority()
        instance = _store_instance(authority)
        instance._schema_oid = 61001
        connection = _HookConnection()
        binding = _phase_binding(connection)
        before = ('maintenance_a', 'owner_a', ['pg_catalog'], 'on', 'origin', 'UTF8',
                  'read committed', 'off', 'owner_a', 'pg_catalog', 'UTC',
                  51004, 51001, 52001, 180006, 'fixture_db', '7123456789')
        controller = ('maintenance_a', 'controller_a', ['pg_catalog'], 'on', 'origin',
                      'UTF8', 'read committed', 'off', 'controller_a', 'pg_catalog',
                      'UTC', 51002, 51001, 52001, 180006, 'fixture_db', 7123456789)
        calls = []
        with (patch.object(store.PgGenerationIngressStore, '_check_phase_binding') as check_binding,
              patch.object(store.PgGenerationIngressStore, '_phase_identity', side_effect=[before, before]),
              patch.object(store.PgGenerationIngressStore, '_verify_business_owner_context'),
              patch.object(store.PgGenerationIngressStore, '_verify_controller_session'),
              patch.object(store.PgGenerationIngressStore, '_verify_store_shape'),
              patch.object(store, '_one', return_value=controller),
              patch.object(store, '_execute', side_effect=lambda conn, sql: calls.append((conn, sql))),
              patch.object(store.PgGenerationIngressStore, '_advance_transition_on', return_value=cutover) as advance):
            actual = instance.record_phase_in_transaction(
                binding, transition_id=fenced['transitionId'], expected_state='fenced',
                next_record=cutover)
        self.assertEqual(actual, cutover)
        self.assertEqual([call[0] for call in calls], [connection, connection])
        self.assertEqual([call[1] for call in calls], [
            'SET LOCAL ROLE "controller_a"', 'SET LOCAL ROLE "owner_a"'])
        check_binding.assert_called_once_with(binding)
        advance.assert_called_once()
        self.assertIs(advance.call_args.kwargs['phase_binding'], binding)
        self.assertFalse(connection.closed)
        self.assertEqual(connection.rollback_calls, 0)

    def test_phase_hook_failure_aborts_and_closes_same_connection(self):
        fenced, cutover = _phase_records()
        instance = _store_instance(_original_authority())
        instance._schema_oid = 61001
        connection = _HookConnection()
        binding = _phase_binding(connection)
        before = ('maintenance_a', 'owner_a', ['pg_catalog'], 'on', 'origin', 'UTF8',
                  'read committed', 'off', 'owner_a', 'pg_catalog', 'UTC',
                  51004, 51001, 52001, 180006, 'fixture_db', '7123456789')
        controller = ('maintenance_a', 'controller_a', ['pg_catalog'], 'on', 'origin',
                      'UTF8', 'read committed', 'off', 'controller_a', 'pg_catalog',
                      'UTC', 51002, 51001, 52001, 180006, 'fixture_db', 7123456789)
        with (patch.object(store.PgGenerationIngressStore, '_check_phase_binding'),
              patch.object(store.PgGenerationIngressStore, '_phase_identity', side_effect=[before]),
              patch.object(store.PgGenerationIngressStore, '_verify_business_owner_context'),
              patch.object(store.PgGenerationIngressStore, '_verify_controller_session'),
              patch.object(store.PgGenerationIngressStore, '_verify_store_shape'),
              patch.object(store, '_one', return_value=controller),
              patch.object(store, '_execute'),
              patch.object(store.PgGenerationIngressStore, '_advance_transition_on',
                           side_effect=CatalogError('native-write-failed')),
              self.assertRaisesRegex(CatalogError, 'native-write-failed')):
            instance.record_phase_in_transaction(
                binding, transition_id=fenced['transitionId'], expected_state='fenced',
                next_record=cutover)
        self.assertEqual(connection.rollback_calls, 1)
        self.assertTrue(connection.closed)

    def test_phase_hook_restore_failure_rolls_back_and_closes_without_retrying_role_change(self):
        fenced, cutover = _phase_records()
        instance = _store_instance(_original_authority())
        instance._schema_oid = 61001
        connection = _HookConnection()
        binding = _phase_binding(connection)
        before = ('maintenance_a', 'owner_a', ['pg_catalog'], 'on', 'origin', 'UTF8',
                  'read committed', 'off', 'owner_a', 'pg_catalog', 'UTC',
                  51004, 51001, 52001, 180006, 'fixture_db', '7123456789')
        controller = ('maintenance_a', 'controller_a', ['pg_catalog'], 'on', 'origin',
                      'UTF8', 'read committed', 'off', 'controller_a', 'pg_catalog',
                      'UTC', 51002, 51001, 52001, 180006, 'fixture_db', 7123456789)
        role_sql = []
        def fail_rollback():
            connection.rollback_calls += 1
            raise KeyboardInterrupt('rollback-interrupted')

        def fail_close():
            connection.closed = True
            raise SystemExit('close-interrupted')

        connection.rollback = fail_rollback
        connection.close = fail_close

        def fail_owner_restore(_connection, sql):
            role_sql.append(sql)
            if len(role_sql) == 2:
                raise CatalogError('owner-role-restore-failed')

        with (patch.object(store.PgGenerationIngressStore, '_check_phase_binding'),
              patch.object(store.PgGenerationIngressStore, '_phase_identity', side_effect=[before]),
              patch.object(store.PgGenerationIngressStore, '_verify_business_owner_context'),
              patch.object(store.PgGenerationIngressStore, '_verify_controller_session'),
              patch.object(store.PgGenerationIngressStore, '_verify_store_shape'),
              patch.object(store, '_one', return_value=controller),
              patch.object(store, '_execute', side_effect=fail_owner_restore),
              patch.object(store.PgGenerationIngressStore, '_advance_transition_on',
                           return_value=cutover),
              self.assertRaisesRegex(CatalogError, 'owner-role-restore-failed')):
            instance.record_phase_in_transaction(
                binding, transition_id=fenced['transitionId'], expected_state='fenced',
                next_record=cutover)
        self.assertEqual(role_sql, ['SET LOCAL ROLE "controller_a"',
                                    'SET LOCAL ROLE "owner_a"'])
        self.assertEqual(connection.rollback_calls, 1)
        self.assertTrue(connection.closed)
        with self.assertRaisesRegex(CatalogError, 'ingress-phase-connection-mismatch'):
            instance._check_phase_binding(binding)

    def test_operation_keyboard_interrupt_is_rethrown_after_abort_and_lease_invalidation(self):
        fenced, cutover = _phase_records()
        instance = _store_instance(_original_authority())
        connection = _HookConnection()
        binding = _phase_binding(connection)
        before = ('maintenance_a', 'owner_a', ['pg_catalog'], 'on', 'origin', 'UTF8',
                  'read committed', 'off', 'owner_a', 'pg_catalog', 'UTC',
                  51004, 51001, 52001, 180006, 'fixture_db', '7123456789')
        with (patch.object(store.PgGenerationIngressStore, '_phase_identity', return_value=before),
              patch.object(store.PgGenerationIngressStore, '_verify_business_owner_context',
                           side_effect=KeyboardInterrupt('operation-interrupted')),
              self.assertRaisesRegex(KeyboardInterrupt, 'operation-interrupted')):
            instance.record_phase_in_transaction(
                binding, transition_id=fenced['transitionId'], expected_state='fenced',
                next_record=cutover)
        self.assertEqual(connection.rollback_calls, 1)
        self.assertTrue(connection.closed)
        with self.assertRaisesRegex(CatalogError, 'ingress-phase-connection-mismatch'):
            instance._check_phase_binding(binding)

    def test_publication_record_validation_failure_also_aborts_and_closes_bound_transaction(self):
        connection = _HookConnection()
        binding = _phase_binding(connection)
        instance = _store_instance(_original_authority())
        with self.assertRaisesRegex(CatalogError, 'ingress-record-invalid'):
            instance.record_publication_in_transaction(
                binding, transition_id='00000000-0000-4000-8000-000000000004',
                expected_state='cutover', next_record={})
        self.assertEqual(connection.rollback_calls, 1)
        self.assertTrue(connection.closed)

    def test_canonical_receipt_json_is_bounded_closed_and_utf8_safe(self):
        self.assertEqual(store._canonical_bytes({'a': 1}), b'{"a":1}')
        for invalid in ({'n': float('nan')}, {'n': 2**53}, {'s': '\ud800'},
                        {'x': object()}, {'é': 1}):
            with (self.subTest(invalid=repr(invalid)),
                  self.assertRaisesRegex(CatalogError, 'ingress-record-invalid')):
                store._canonical_bytes(invalid)
        nested = value = {}
        for _ in range(66):
            nested['x'] = {}
            nested = nested['x']
        with self.assertRaisesRegex(CatalogError, 'ingress-record-capacity'):
            store._canonical_bytes(value)
        with self.assertRaisesRegex(CatalogError, 'ingress-record-capacity'):
            store._canonical_bytes({'payload': 'x' * (store._MAX_RECORD_BYTES + 1)})

    def test_original_store_authority_binds_distinct_maintenance_and_controller_identities(self):
        authority = _original_authority()
        instance = _store_instance(authority)
        identity = (52001, 'controller_a', 51002, 'maintenance_a', 51001,
                    'controller_a', 'pg_catalog', 'UTC', 'on', 'origin',
                    'UTF8', 'off', 'read committed', 180006,
                    'fixture_db', 7123456789)
        principal_rows = [
            (51001, 'maintenance_a', True, False, False, False, False, False, False),
            (51002, 'controller_a', False, False, False, False, False, False, False),
            (51004, 'owner_a', True, False, False, False, False, False, False),
        ]
        with (patch.object(store, '_one', return_value=identity),
              patch.object(store, '_all', return_value=principal_rows),
              patch.object(store.PgGenerationIngressStore, '_set_membership_snapshot',
                           return_value=authority.membership_observations)):
            instance._verify_controller_session()

        with self.assertRaisesRegex(CatalogError, 'ingress-controller-set-membership-required'):
            _original_authority(
                memberships=((51001, 51002, False, False, False),
                             (51001, 51004, False, True, False)))

        with self.assertRaisesRegex(CatalogError, 'ingress-record-invalid'):
            _original_authority(settings=(('search_path', 'public'),))

        wrong_flags = [(51001, 'maintenance_a', True, True, False,
                        False, False, False, False), *principal_rows[1:]]
        with (patch.object(store, '_all', return_value=wrong_flags),
              self.assertRaisesRegex(CatalogError, 'ingress-store-principal-mismatch')):
            instance._verify_principal_observations(object())

        with self.assertRaisesRegex(CatalogError, 'ingress-store-custody-mismatch'):
            store.PgGenerationIngressStore(
                object(), provider_id='00000000-0000-4000-8000-000000000001',
                installation_id='installation-a', controller_role='controller_b',
                controller_oid=51002, database_oid=52001, custodian=authority.custodian,
                target_custody=authority.target_handle, creation_authority=authority)

        wrong_actor = (52001, 'controller_a', 51002, 'other_maintenance', 51001,
                       'controller_a', 'pg_catalog', 'UTC', 'on', 'origin',
                       'UTF8', 'off', 'read committed', 180006,
                       'fixture_db', 7123456789)
        with (patch.object(store, '_one', return_value=wrong_actor),
              patch.object(store, '_all', return_value=principal_rows),
              patch.object(store.PgGenerationIngressStore, '_set_membership_snapshot',
                           return_value=authority.membership_observations),
              self.assertRaisesRegex(CatalogError, 'ingress-store-controller-required')):
            instance._verify_controller_session()

        changed_graph = ((51001, 51002, False, True, True),
                         (51001, 51004, False, True, False))
        with (patch.object(store, '_one', return_value=identity),
              patch.object(store, '_all', return_value=principal_rows),
              patch.object(store.PgGenerationIngressStore, '_set_membership_snapshot',
                           return_value=changed_graph),
              self.assertRaisesRegex(CatalogError, 'ingress-store-controller-required')):
            instance._verify_controller_session()

    def test_store_creation_authority_requires_identity_bound_custody_not_a_copied_reference(self):
        authority = _original_authority()
        self.assertFalse(hasattr(store, '_issue_original_store_creation'))
        with self.assertRaisesRegex(CatalogError, 'ingress-store-custody-mismatch'):
            store._OriginalStoreCreationAuthority(
                provider_id=authority.provider_id,
                installation_id=authority.installation_id,
                custodian=authority.custodian,
                verified_target=authority.verified_target,
                target_handle=authority.target_handle,
                target_custody=dict(authority.target_custody, registrationDigest='f' * 64),
                schema_oid=None, registration_digest=authority.registration_digest,
                authority_preparation_receipt_digest=authority.authority_preparation_receipt_digest,
                creation_approval_digest=authority.creation_approval_digest,
                target_custody_digest=authority.target_custody_digest,
                maintenance_user=authority.maintenance_user,
                maintenance_user_oid=authority.maintenance_user_oid,
                controller_role=authority.controller_role, controller_oid=authority.controller_oid,
                business_owner=authority.business_owner,
                business_owner_oid=authority.business_owner_oid,
                principal_flags=authority.principal_flags,
                membership_observations=authority.membership_observations,
                required_settings=authority.required_settings,
                database_name=authority.database_name,
                database_system_identifier=authority.database_system_identifier,
                native_authority_observation_digest=authority.native_authority_observation_digest,
                _seal=store._CAPABILITY_SEAL)

        with self.assertRaisesRegex(CatalogError, 'ingress-store-custody-required'):
            store.PgGenerationIngressStore(
                object(), provider_id=authority.provider_id,
                installation_id=authority.installation_id,
                controller_role=authority.controller_role,
                controller_oid=authority.controller_oid, database_oid=52001,
                custodian=authority.custodian, target_custody=dict(authority.target_custody),
                creation_authority=authority)

    def test_membership_snapshot_reads_and_orders_native_set_closure(self):
        rows = [
            (51001, 51002, False, True, False),
            (51001, 51004, False, True, False),
            (51002, 51006, True, True, False),
        ]
        with patch.object(store, '_all', return_value=rows) as query:
            snapshot = store.PgGenerationIngressStore._set_membership_snapshot(None, 51001)
        self.assertEqual(snapshot, tuple(rows))
        self.assertIn('m.set_option', query.call_args.args[1])
        self.assertIn('m.inherit_option,m.set_option,m.admin_option', query.call_args.args[1])
        with self.assertRaisesRegex(CatalogError, 'ingress-record-invalid'):
            _original_authority(memberships=(tuple(rows[1]), tuple(rows[0])))

        # Membership catalog order is numeric, while the contract's required
        # two direct edges name controller before owner.
        reordered_oids = ((51001, 51000, False, True, False),
                          (51001, 51002, False, True, False))
        authority = _original_authority(memberships=reordered_oids,
                                        business_owner_oid=51000)
        self.assertEqual(authority.business_owner_oid, 51000)

    def test_store_acl_check_refuses_unenrolled_role_set_reachability(self):
        instance = _store_instance(_original_authority())
        with (patch.object(store, '_one', return_value=(1,)) as query,
              self.assertRaisesRegex(CatalogError, 'ingress-store-role-reachability-mismatch')):
            instance._verify_acl(60001, object())
        sql = query.call_args.args[1]
        self.assertIn("pg_catalog.pg_has_role(r.oid,%s,'SET')", sql)

    def test_store_relation_rejects_dropped_columns_triggers_and_policies(self):
        expected = [(1, False), (2, False)]
        with (patch.object(store, '_all', return_value=expected),
              patch.object(store, '_one', side_effect=[(0,), (0,)])):
            store._verify_relation_side_objects(object(), 'control', 'epochs', 2)

        with (patch.object(store, '_all', return_value=[(1, False), (2, True)]),
              self.assertRaisesRegex(CatalogError, 'ingress-store-catalog-mismatch')):
            store._verify_relation_side_objects(object(), 'control', 'epochs', 2)

        with (patch.object(store, '_all', return_value=expected),
              patch.object(store, '_one', side_effect=[(1,)]),
              self.assertRaisesRegex(CatalogError, 'ingress-store-catalog-mismatch')):
            store._verify_relation_side_objects(object(), 'control', 'epochs', 2)

        with (patch.object(store, '_all', return_value=expected),
              patch.object(store, '_one', side_effect=[(0,), (1,)]),
              self.assertRaisesRegex(CatalogError, 'ingress-store-catalog-mismatch')):
            store._verify_relation_side_objects(object(), 'control', 'epochs', 2)


if __name__ == '__main__':
    unittest.main()

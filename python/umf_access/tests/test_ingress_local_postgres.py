"""Source controls for the concrete G11 local owner supervisor."""
from __future__ import annotations

import copy
import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from umf_access.lifecycle.ingress_local_postgres import (
    _NATIVE_EFFECT_OUTCOME_SEAL,
    _VERIFIED_STORE_PREPARATION_SEAL,
    LocalPostgresError,
    LocalPostgresSupervisor,
    _AttachedPostmaster,
    _canonical,
    _membership_grant_statements,
    _NativeAttestation,
    _NativeEffectReservation,
    _ordered_membership_payload,
    _ordered_required_memberships,
    _OriginalNativeTarget,
    _owner_registration_approval_payload,
    _PendingTargetCreation,
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


class LocalPostgresSupervisorSourceTests(unittest.TestCase):
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
              as issue):
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
            '_journal': Journal(), '_owner_authority': authority,
            '_authority_context': context,
        }.items():
            object.__setattr__(supervisor, name, value)

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
            '_journal': Journal(), '_owner_authority': authority,
            '_authority_context': object(),
        }.items():
            object.__setattr__(supervisor, name, value)
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-original-request-unavailable'):
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
            '_journal': journal, '_owner_authority': authority,
            '_authority_context': context, '_native_effect_reservations': {},
            '_native_effect_bindings': {}, '_native_effect_outcomes': {},
        }.items():
            object.__setattr__(supervisor, name, value)

        reservation, outcome, recovered = supervisor._recover_original_native_effect(
            'native-principal-preparation')
        self.assertIs(recovered, request)
        self.assertIsNone(outcome)
        self.assertEqual(reservation.reservation_id, reservation_id)
        self.assertEqual(reservation.journal_record_digest, reservation_digest)
        self.assertEqual(reservation.effect_key, request.effect_key)
        self.assertEqual(authority.recovered_id, approval_id)
        self.assertEqual(authority.bound, [(approval, reservation_id, reservation_digest)])
        self.assertEqual(journal.writes, 0)

    def test_principal_recovery_continues_only_database_after_role_proof(self) -> None:
        supervisor_id = '11111111-1111-4111-8111-111111111111'
        preparation_id = '55555555-5555-4555-8555-555555555555'
        approval_id = '66666666-6666-4666-8666-666666666666'
        request_digest = 'a' * 64
        reservation_id = '77777777-7777-4777-8777-777777777777'
        intent = {
            'profile': 'umf.local-postgresql-principal-preparation/0.1',
            'preparationId': preparation_id, 'creationRequestDigest': 'b' * 64,
            'maintenanceBefore': {'name': 'umf_m_test'},
            'controller': {'name': 'umf_c_test'},
            'businessOwner': {'name': 'umf_owner'},
            'applicationDatabase': {'name': 'umf_app', 'ownerName': 'umf_owner'},
        }
        request = SimpleNamespace(_intent_digest=request_digest, _intent_bytes=_canonical(intent),
                                  _approval_id=approval_id,
                                  effect_key=('native-principal-preparation',
                                              supervisor_id, preparation_id))
        creation_request = SimpleNamespace(_intent_digest='b' * 64)
        creation = object.__new__(_PendingTargetCreation)
        object.__setattr__(creation, '_issuer', None)
        object.__setattr__(creation, '_request', creation_request)
        target = object.__new__(_OriginalNativeTarget)
        object.__setattr__(target, '_issuer', None)
        object.__setattr__(target, '_creation', creation)
        object.__setattr__(target, '_reservation', object())
        object.__setattr__(target, '_target_id', '88888888-8888-4888-8888-888888888888')
        reservation = SimpleNamespace(reservation_id=reservation_id,
                                      request_digest=request_digest,
                                      approval_digest='c' * 64,
                                      journal_record_digest='d' * 64)
        role_observation = {'roles': {'verified': True}, 'memberships': []}
        database = {'oid': 9100, 'name': 'umf_app', 'systemIdentifier': '1234'}

        initial_events = [
            {'kind': 'principal-request-prepared', 'payload': {
                'preparationId': preparation_id, 'approvalId': approval_id,
                'intent': intent, 'requestDigest': request_digest}},
            {'kind': 'native-effect-intent', 'payload': {
                'reservationId': reservation_id,
                'scope': 'native-principal-preparation'}},
            {'kind': 'principal-roles-intent', 'payload': {
                'reservationId': reservation_id, 'preparationId': preparation_id}},
            {'kind': 'principal-database-intent', 'payload': {
                'reservationId': reservation_id, 'databaseName': 'umf_app'}},
        ]

        class Journal:
            def __init__(self):
                self.events = list(initial_events)
                self.appended = []
            def read(self):
                return {'events': list(self.events)}
            def append(self, kind, payload):
                self.appended.append((kind, payload))
                self.events.append({'kind': kind, 'payload': payload})

        journal = Journal()
        supervisor = object.__new__(LocalPostgresSupervisor)
        object.__setattr__(creation, '_issuer', supervisor)
        object.__setattr__(target, '_issuer', supervisor)
        for name, value in {
            '_supervisor_id': supervisor_id, '_journal': journal,
            '_profile': SimpleNamespace(purpose='native-acceptance'),
            '_launch': {},
            '_native_targets': {id(target): target},
            '_principal_preparations': {}, '_principal_dispatches': {},
            '_native_effect_bindings': {}, '_authority_context': object(),
            '_owner_authority': object(),
        }.items():
            object.__setattr__(supervisor, name, value)
        with (patch.object(LocalPostgresSupervisor, '_recover_original_native_effect',
                           return_value=(reservation, None, request)),
              patch.object(LocalPostgresSupervisor, '_observe_original_principal_roles',
                           return_value=role_observation),
              patch.object(LocalPostgresSupervisor, '_observe_original_application_database',
                           return_value=None),
              patch.object(LocalPostgresSupervisor, '_create_application_database',
                           return_value=database) as create_db,
              patch.object(LocalPostgresSupervisor, '_apply_principal_role_transaction',
                           side_effect=AssertionError('role DDL must not be replayed')),
              patch.object(LocalPostgresSupervisor, '_record_native_effect_outcome'),
              patch.object(LocalPostgresSupervisor, '_finalize_recovered_principal_receipt')):
            receipt = supervisor.resume_original_principal_stage(target)
        create_db.assert_called_once()
        self.assertEqual(receipt['applicationDatabase'], database)
        self.assertEqual([kind for kind, _payload in journal.appended],
                         ['principal-roles-confirmed', 'principal-database-confirmed'])

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
                '_profile': profile, '_owner_authority': authority,
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
            with patch.object(LocalPostgresSupervisor, '_validate_installation_binaries',
                              return_value=(postgres, initdb)):
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

    def test_original_enrollment_is_read_only_and_context_journal_is_bound(self) -> None:
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
            context_bytes = _validate_bootstrap_context_journal(
                control, record, raw, 'd' * 64)
            self.assertEqual((control / 'owner-bootstrap-context.json').read_bytes(),
                             context_bytes)
            _validate_bootstrap_context_journal(control, record, raw, 'd' * 64)
            self.assertEqual(enrollment.read_bytes(), before)
            with self.assertRaisesRegex(LocalPostgresError,
                                        'local-postgresql-bootstrap-context-mismatch'):
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
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-principal-outcome-unresolved'):
            supervisor.apply_original_principals(principal, object())
        with self.assertRaisesRegex(LocalPostgresError,
                                    'local-postgresql-registration-outcome-unresolved'):
            supervisor.apply_target_registration(registration, object())

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
        object.__setattr__(supervisor, '_profile',
                           SimpleNamespace(port=55439,
                                           postgres_binary=Path(sys.executable)))
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
                  'path': str(Path(sys.executable).resolve())}
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

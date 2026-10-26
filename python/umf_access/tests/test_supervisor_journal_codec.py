# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native-free controls for the fixed original journal codec profiles."""
from __future__ import annotations

import base64
import copy
import hashlib
import unittest

import test_generation_root_registry as root_transition_tests
import test_ingress_local_postgres as legacy_supervisor_tests
from umf_access.lifecycle import supervisor_journal_codec as codec


def _birth(generation_root_policy_digest: str | None = None) -> dict[str, object]:
    supervisor = '12121212-1212-4212-8212-121212121212'
    owner_configuration = {'profile': 'umf.owner-authority-config/0.1'}
    config_digest = hashlib.sha256(codec.canonical(owner_configuration)).hexdigest()
    enrollment = {
        'profile': codec.ENROLLMENT_03,
        'enrollmentId': '23232323-2323-4232-8232-232323232323',
        'purpose': 'native-acceptance',
        'context': {
            'custodianId': '34343434-3434-4434-8434-343434343434',
            'supervisorId': supervisor,
            'providerId': '45454545-4545-4454-8454-454545454545',
            'installationId': 'codec-test-installation',
        },
        'ownerConfiguration': owner_configuration,
        'nativeProfile': {
            'controlHome': '/private/control', 'supervisorId': supervisor,
        },
        'generationAuthorityRoots': [],
        'supervisorJournalBirth': None,
    }
    definition = {
        'profile': codec.DEFINITION_PROFILE,
        'journalProfile': codec.JOURNAL_PROFILE_02,
        'physicalEvents': 'umf.supervisor-physical-events/0.2',
        'rootEvents': 'umf.supervisor-generation-root-events/0.1',
        'originalsEvents': 'umf.supervisor-originals-store-events/0.1',
        'ingressEvents': None, 'applicationEvents': None,
    }
    definition_digest = hashlib.sha256(codec.canonical(definition)).hexdigest()
    path, lock_path = codec.expected_paths('/private/control', supervisor)
    native_digest = hashlib.sha256(codec.canonical(enrollment['nativeProfile'])).hexdigest()
    anchor = {
        'profile': codec.ANCHOR_PROFILE,
        'enrollmentId': enrollment['enrollmentId'],
        'purpose': enrollment['purpose'], 'context': enrollment['context'],
        'authorityConfigurationDigest': config_digest,
        'nativeProfileDigest': native_digest,
        'generationRootPolicyDigest': generation_root_policy_digest,
        'journalId': '56565656-5656-4565-8565-565656565656',
        'path': path, 'lockPath': lock_path,
        'definitionDigest': definition_digest,
    }
    anchor_digest = hashlib.sha256(codec.canonical(anchor)).hexdigest()
    initial = codec.initial_record(
        supervisor_id=supervisor, journal_id=anchor['journalId'],
        definition_digest=definition_digest, anchor_digest=anchor_digest)
    birth = {
        'profile': codec.BIRTH_PROFILE,
        'journalProfile': codec.JOURNAL_PROFILE_02,
        'journalId': anchor['journalId'], 'supervisorId': supervisor,
        'definition': definition, 'definitionDigest': definition_digest,
        'path': path, 'lockPath': lock_path, 'anchorDigest': anchor_digest,
        'initialHeaderDigest': hashlib.sha256(initial).hexdigest(),
    }
    enrollment['supervisorJournalBirth'] = birth
    return {'enrollment': enrollment, 'birth': birth,
            'configurationDigest': config_digest,
            'generationRootPolicyDigest': generation_root_policy_digest}


def _event(sequence: int, kind: str, payload: dict[str, object], previous: str) -> dict[str, object]:
    event: dict[str, object] = {
        'sequence': sequence, 'kind': kind, 'payload': payload,
        'previousDigest': previous,
    }
    event['recordDigest'] = hashlib.sha256(codec.canonical(event)).hexdigest()
    return event


def _append(events: list[dict[str, object]], kind: str, payload: dict[str, object],
            anchor: str) -> dict[str, object]:
    previous = events[-1]['recordDigest'] if events else anchor
    event = _event(len(events) + 1, kind, payload, previous)
    events.append(event)
    return event


def _rechain(events: list[dict[str, object]], anchor: str) -> list[dict[str, object]]:
    rebuilt: list[dict[str, object]] = []
    previous = anchor
    for sequence, event in enumerate(events, 1):
        rebuilt.append(_event(sequence, event['kind'], event['payload'], previous))
        previous = rebuilt[-1]['recordDigest']
    return rebuilt


def _record(events: list[dict[str, object]], birth: dict[str, object]) -> bytes:
    return codec.canonical({
        'profile': codec.JOURNAL_PROFILE_02,
        'supervisorId': birth['supervisorId'], 'journalId': birth['journalId'],
        'definitionDigest': birth['definitionDigest'], 'anchorDigest': birth['anchorDigest'],
        'sequence': len(events), 'headDigest': events[-1]['recordDigest'],
        'events': events,
    })


class SupervisorJournalCodecTests(unittest.TestCase):
    def test_fresh_external_custody_birth_is_closed_and_metadata_bound(self) -> None:
        value = _birth()
        enrollment = value['enrollment']
        enrollment['profile'] = codec.ENROLLMENT_05
        enrollment['nativeProfile']['custodianId'] = enrollment['context']['custodianId']
        definition = {
            'profile': codec.TARGET_CUSTODY_DEFINITION_PROFILE,
            'journalProfile': codec.TARGET_CUSTODY_JOURNAL_PROFILE_02,
            'eventKinds': list(codec.TARGET_CUSTODY_EVENT_KINDS),
        }
        header = {
            'profile': codec.TARGET_CUSTODY_JOURNAL_PROFILE_02,
            'custodianId': enrollment['context']['custodianId'],
            'sequence': 0, 'headDigest': '0' * 64, 'events': [],
        }
        birth = {
            'profile': codec.TARGET_CUSTODY_BIRTH_PROFILE,
            'journalProfile': codec.TARGET_CUSTODY_JOURNAL_PROFILE_02,
            'custodianId': enrollment['context']['custodianId'],
            'supervisorId': enrollment['context']['supervisorId'],
            'path': '/private/control/target-custody.json',
            'lockPath': '/private/control/target-custody.json.lock',
            'definition': definition,
            'definitionDigest': hashlib.sha256(codec.canonical(definition)).hexdigest(),
            'initialHeaderDigest': hashlib.sha256(codec.canonical(header)).hexdigest(),
        }
        enrollment['targetCustodyJournalBirth'] = birth
        self.assertEqual(codec.validate_target_custody_birth(
            birth, enrollment=enrollment), birth)
        metadata = {
            'profile': codec.TARGET_CUSTODY_METADATA_PROFILE_02,
            'enrollmentProfile': codec.ENROLLMENT_05,
            'ownerContextProfile': 'umf.local-owner-bootstrap-context/0.3',
            'ownerBootstrapContextDigest': 'a' * 64,
            'supervisorJournal': {
                'birthDigest': 'b' * 64,
                'journalProfile': codec.JOURNAL_PROFILE_02,
                'journalId': '56565656-5656-4565-8565-565656565656',
                'definitionDigest': 'c' * 64,
            },
            'targetCustodyJournal': {
                'birthDigest': hashlib.sha256(codec.canonical(birth)).hexdigest(),
                'journalProfile': codec.TARGET_CUSTODY_JOURNAL_PROFILE_02,
                'definitionDigest': birth['definitionDigest'],
            },
        }
        self.assertEqual(codec.validate_metadata(metadata), metadata)
        wrong_path = {**birth, 'path': '/private/control/other.json'}
        with self.assertRaises(codec.SupervisorJournalCodecError):
            codec.validate_target_custody_birth(wrong_path, enrollment=enrollment)
        wrong_definition = {**birth, 'definition': {**definition, 'eventKinds': []}}
        with self.assertRaises(codec.SupervisorJournalCodecError):
            codec.validate_target_custody_birth(wrong_definition, enrollment=enrollment)

    def test_legacy_01_native_store_effect_keeps_original_scope4_replay(self) -> None:
        supervisor = '12121212-1212-4212-8212-121212121212'
        cluster = '23232323-2323-4232-8232-232323232323'
        incarnation = '34343434-3434-4434-8434-343434343434'
        launch_id = '45454545-4545-4454-8454-454545454545'
        control = '/private/legacy-control'
        data = '/private/legacy-data'
        postgres = '/usr/local/bin/postgres'
        argv = [postgres, '-D', data, '-c', f'config_file={control}/postgresql.conf',
                '-c', f'hba_file={control}/pg_hba.conf',
                '-c', f'ident_file={control}/pg_ident.conf']
        creation = {
            'profile': 'umf.local-postgresql-create-request/0.1',
            'supervisorId': supervisor, 'clusterId': cluster,
            'incarnationId': incarnation, 'installationId': 'legacy-fixture',
            'ownerUid': 501, 'databaseName': 'umf_app', 'businessOwner': 'umf_owner',
            'maintenanceName': 'umf_maint', 'controllerName': 'umf_control',
            'controlDirectory': control, 'dataDirectory': data,
            'postgresPath': postgres, 'postgresSha256': 'a' * 64,
            'initdbPath': '/usr/local/bin/initdb', 'initdbSha256': 'b' * 64,
            'port': 55439, 'configDigest': 'c' * 64, 'hbaDigest': 'd' * 64,
            'purpose': 'native-acceptance', 'requestDigest': 'e' * 64,
            'approvalId': '56565656-5656-4565-8565-565656565656',
            'approvalDigest': 'f' * 64,
        }
        events: list[dict[str, object]] = []
        anchor = '0' * 64
        _append(events, 'creation-intent', creation, anchor)
        _append(events, 'initdb-confirmed', {
            'clusterId': cluster, 'dataDevice': '1', 'dataInode': '2',
            'ownerUid': 501, 'initdbReceiptDigest': '1' * 64,
        }, anchor)
        _append(events, 'launch-intent', {
            'launchId': launch_id, 'launchNumber': 1, 'argv': argv,
            'configDigest': 'c' * 64, 'hbaDigest': 'd' * 64,
            'binarySha256': 'a' * 64, 'dataDevice': '1', 'dataInode': '2',
        }, anchor)
        _append(events, 'launch-confirmed', {
            'launchId': launch_id,
            'process': {'pid': 601, 'pgid': 601, 'uid': 501, 'gid': 20,
                        'startSec': 100, 'startUsec': 5, 'path': postgres,
                        'argv': argv, 'startToken': 'legacy-process-start'},
            'nativeObservationDigest': '2' * 64, 'endpointReceiptDigest': '3' * 64,
        }, anchor)
        effect_payload = {
            'reservationId': '67676767-6767-4767-8767-676767676767',
            'scope': 'native-store-creation',
            'effectKey': ['native-store-creation', 'legacy-provider', 'legacy-store'],
            'purpose': 'native-acceptance',
            'requestId': '78787878-7878-4787-8787-787878787878',
            'requestDigest': '8' * 64, 'approvalId': '78787878-7878-4787-8787-787878787878',
            'approvalDigest': '9' * 64, 'stage': 'dispatch', 'payloadDigest': 'a' * 64,
        }
        _append(events, 'native-effect-intent', effect_payload, anchor)
        original = object.__new__(legacy_supervisor_tests._SupervisorJournal)
        original.supervisor_id = supervisor
        for outcome_kind in ('native-effect-confirmed', 'native-effect-aborted'):
            candidate = [dict(event, payload=dict(event['payload'])) for event in events]
            _append(candidate, outcome_kind, {
                'reservationId': effect_payload['reservationId'],
                'receiptDigest': 'b' * 64,
            }, anchor)
            with self.subTest(outcome=outcome_kind):
                # Keep the actual retained .1 state machine as the compatibility oracle.
                original._replay(candidate)
                legacy_raw = codec.canonical({
                    'profile': codec.LEGACY_PROFILE, 'supervisorId': supervisor,
                    'sequence': len(candidate), 'headDigest': candidate[-1]['recordDigest'],
                    'events': candidate,
                })
                self.assertEqual(
                    codec.validate_legacy_record(legacy_raw, supervisor_id=supervisor)['events'],
                    candidate)

        # The same generic .2 store effect has no adopted ingress event family and
        # cannot bypass its typed parent. This guard remains strict for profile .2.
        fixture = _birth()
        birth = codec.validate_birth(
            fixture['birth'], enrollment=fixture['enrollment'],
            configuration_digest=fixture['configurationDigest'],
            generation_root_policy_digest=None)
        create_v2 = dict(creation, profile='umf.local-postgresql-create-request/0.2',
                         supervisorId=birth['supervisorId'],
                         supervisorJournalBirthDigest=hashlib.sha256(
                             codec.canonical(birth)).hexdigest(),
                         ownerBootstrapContextDigest='c' * 64)
        v2_events: list[dict[str, object]] = []
        _append(v2_events, 'creation-intent', create_v2, birth['anchorDigest'])
        _append(v2_events, 'initdb-confirmed', {
            'clusterId': cluster, 'dataDevice': '1', 'dataInode': '2',
            'ownerUid': 501, 'initdbReceiptDigest': '1' * 64,
        }, birth['anchorDigest'])
        _append(v2_events, 'launch-intent', {
            'launchId': launch_id, 'launchNumber': 1, 'argv': argv,
            'configDigest': 'c' * 64, 'hbaDigest': 'd' * 64,
            'binarySha256': 'a' * 64, 'dataDevice': '1', 'dataInode': '2',
        }, birth['anchorDigest'])
        _append(v2_events, 'launch-confirmed', {
            'launchId': launch_id,
            'process': {'pid': 601, 'pgid': 601, 'uid': 501, 'gid': 20,
                        'startSec': 100, 'startUsec': 5, 'path': postgres,
                        'argv': argv, 'startToken': 'legacy-process-start'},
            'nativeObservationDigest': '2' * 64, 'endpointReceiptDigest': '3' * 64,
        }, birth['anchorDigest'])
        _append(v2_events, 'native-effect-intent', effect_payload, birth['anchorDigest'])
        with self.assertRaises(codec.SupervisorJournalCodecError):
            codec._Replay(
                birth['supervisorId'], codec.JOURNAL_PROFILE_02,
                owner_bootstrap_context_digest='c' * 64,
                birth_digest=hashlib.sha256(codec.canonical(birth)).hexdigest(),
            )._replay(v2_events)

    def test_legacy_01_empty_record_keeps_its_original_zero_digest_form(self) -> None:
        supervisor = '12121212-1212-4212-8212-121212121212'
        raw = codec.canonical({
            'profile': codec.LEGACY_PROFILE, 'supervisorId': supervisor,
            'sequence': 0, 'headDigest': '0' * 64, 'events': [],
        })
        self.assertEqual(codec.validate_legacy_record(raw, supervisor_id=supervisor), {
            'profile': codec.LEGACY_PROFILE, 'supervisorId': supervisor,
            'sequence': 0, 'headDigest': '0' * 64, 'events': [],
        })
        fixture = _birth()
        birth = codec.validate_birth(
            fixture['birth'], enrollment=fixture['enrollment'],
            configuration_digest=fixture['configurationDigest'],
            generation_root_policy_digest=None)
        with self.assertRaises(codec.SupervisorJournalCodecError):
            codec.validate_record(raw, birth=birth,
                                  owner_bootstrap_context_digest='a' * 64,
                                  generation_root_policy_digest=None)

    def test_legacy_01_nonzero_physical_history_keeps_existing_replay_semantics(self) -> None:
        supervisor = '12121212-1212-4212-8212-121212121212'
        cluster = '23232323-2323-4232-8232-232323232323'
        incarnation = '34343434-3434-4434-8434-343434343434'
        launch_id = '45454545-4545-4454-8454-454545454545'
        control = '/private/legacy-control'
        data = '/private/legacy-data'
        postgres = '/usr/local/bin/postgres'
        argv = [postgres, '-D', data, '-c', f'config_file={control}/postgresql.conf',
                '-c', f'hba_file={control}/pg_hba.conf',
                '-c', f'ident_file={control}/pg_ident.conf']
        creation = {
            'profile': 'umf.local-postgresql-create-request/0.1',
            'supervisorId': supervisor, 'clusterId': cluster,
            'incarnationId': incarnation, 'installationId': 'legacy-fixture',
            'ownerUid': 501, 'databaseName': 'umf_app', 'businessOwner': 'umf_owner',
            'maintenanceName': 'umf_maint', 'controllerName': 'umf_control',
            'controlDirectory': control, 'dataDirectory': data,
            'postgresPath': postgres, 'postgresSha256': 'a' * 64,
            'initdbPath': '/usr/local/bin/initdb', 'initdbSha256': 'b' * 64,
            'port': 55439, 'configDigest': 'c' * 64, 'hbaDigest': 'd' * 64,
            'purpose': 'native-acceptance', 'requestDigest': 'e' * 64,
            'approvalId': '56565656-5656-4565-8565-565656565656',
            'approvalDigest': 'f' * 64,
        }
        events: list[dict[str, object]] = []
        anchor = '0' * 64
        _append(events, 'creation-intent', creation, anchor)
        _append(events, 'initdb-confirmed', {
            'clusterId': cluster, 'dataDevice': '1', 'dataInode': '2',
            'ownerUid': 501, 'initdbReceiptDigest': '1' * 64,
        }, anchor)
        _append(events, 'launch-intent', {
            'launchId': launch_id, 'launchNumber': 1, 'argv': argv,
            'configDigest': 'c' * 64, 'hbaDigest': 'd' * 64,
            'binarySha256': 'a' * 64, 'dataDevice': '1', 'dataInode': '2',
        }, anchor)
        _append(events, 'launch-confirmed', {
            'launchId': launch_id,
            'process': {'pid': 601, 'pgid': 601, 'uid': 501, 'gid': 20,
                        'startSec': 100, 'startUsec': 5, 'path': postgres,
                        'argv': argv, 'startToken': 'legacy-process-start'},
            'nativeObservationDigest': '2' * 64, 'endpointReceiptDigest': '3' * 64,
        }, anchor)
        raw = codec.canonical({
            'profile': codec.LEGACY_PROFILE, 'supervisorId': supervisor,
            'sequence': len(events), 'headDigest': events[-1]['recordDigest'],
            'events': events,
        })
        validated = codec.validate_legacy_record(raw, supervisor_id=supervisor)
        self.assertEqual(validated['sequence'], 4)
        self.assertEqual(validated['events'], events)
        self.assertEqual(validated['headDigest'], events[-1]['recordDigest'])
        original = object.__new__(legacy_supervisor_tests._SupervisorJournal)
        original.supervisor_id = supervisor
        original._replay(events)
        first_launch = [dict(event) for event in events]
        _append(events, 'stop-intent', {
            'launchId': launch_id, 'processStartToken': 'legacy-process-start',
        }, anchor)
        _append(events, 'stop-confirmed', {
            'launchId': launch_id, 'processGroupAbsent': True,
            'controlDataDigest': '4' * 64,
        }, anchor)
        second_launch_id = '67676767-6767-4767-8767-676767676767'
        _append(events, 'launch-intent', {
            'launchId': second_launch_id, 'launchNumber': 2, 'argv': argv,
            'configDigest': 'c' * 64, 'hbaDigest': 'd' * 64,
            'binarySha256': 'a' * 64, 'dataDevice': '1', 'dataInode': '2',
        }, anchor)
        _append(events, 'launch-confirmed', {
            'launchId': second_launch_id,
            'process': {'pid': 602, 'pgid': 602, 'uid': 501, 'gid': 20,
                        'startSec': 101, 'startUsec': 7, 'path': postgres,
                        'argv': argv, 'startToken': 'legacy-process-start-2'},
            'nativeObservationDigest': '5' * 64, 'endpointReceiptDigest': '6' * 64,
        }, anchor)
        validated_restart = codec.validate_legacy_record(codec.canonical({
            'profile': codec.LEGACY_PROFILE, 'supervisorId': supervisor,
            'sequence': len(events), 'headDigest': events[-1]['recordDigest'],
            'events': events,
        }), supervisor_id=supervisor)
        self.assertEqual(validated_restart['sequence'], 8)
        original._replay(events)

        # Journal .2 replays the physical history by prefix. In particular, a
        # second stop must bind to launch 2, not to a future launch found by
        # scanning the complete event list backwards.
        birth_fixture = _birth()
        birth = birth_fixture['birth']
        context_digest = '8' * 64
        profile_events = [dict(event, payload=dict(event['payload'])) for event in events]
        profile_events[0]['payload'].update({
            'profile': 'umf.local-postgresql-create-request/0.2',
            'supervisorId': birth['supervisorId'],
            'supervisorJournalBirthDigest': hashlib.sha256(
                codec.canonical(birth)).hexdigest(),
            'ownerBootstrapContextDigest': context_digest,
        })
        profile_events = _rechain(profile_events, birth['anchorDigest'])
        second_stop = {
            'launchId': events[-1]['payload']['launchId'],
            'processStartToken': 'legacy-process-start-2',
        }
        profile_events.append(_event(
            len(profile_events) + 1, 'stop-intent', second_stop,
            profile_events[-1]['recordDigest']))
        replay = codec._Replay(
            birth['supervisorId'], codec.JOURNAL_PROFILE_02,
            owner_bootstrap_context_digest=context_digest,
            birth_digest=hashlib.sha256(codec.canonical(birth)).hexdigest())
        replay._replay(profile_events)

        invalid_events = first_launch
        _append(invalid_events, 'launch-intent', {
            'launchId': '67676767-6767-4767-8767-676767676767',
            'launchNumber': 2, 'argv': argv, 'configDigest': 'c' * 64,
            'hbaDigest': 'd' * 64, 'binarySha256': 'a' * 64,
            'dataDevice': '1', 'dataInode': '2',
        }, anchor)
        invalid_raw = codec.canonical({
            'profile': codec.LEGACY_PROFILE, 'supervisorId': supervisor,
            'sequence': len(invalid_events),
            'headDigest': invalid_events[-1]['recordDigest'], 'events': invalid_events,
        })
        with self.assertRaisesRegex(legacy_supervisor_tests.LocalPostgresError,
                                    'supervisor-journal-order-invalid'):
            original._replay(invalid_events)
        with self.assertRaisesRegex(codec.SupervisorJournalCodecError,
                                    'supervisor-journal-order-invalid'):
            codec.validate_legacy_record(invalid_raw, supervisor_id=supervisor)

    def test_fixed_definition_birth_anchor_and_zero_record(self) -> None:
        fixture = _birth()
        birth = codec.validate_birth(
            fixture['birth'], enrollment=fixture['enrollment'],
            configuration_digest=fixture['configurationDigest'],
            generation_root_policy_digest=None)
        raw = codec.initial_record(
            supervisor_id=birth['supervisorId'], journal_id=birth['journalId'],
            definition_digest=birth['definitionDigest'], anchor_digest=birth['anchorDigest'])
        record = codec.validate_record(
            raw, birth=birth, owner_bootstrap_context_digest='8' * 64,
            generation_root_policy_digest=None)
        self.assertEqual(record['sequence'], 0)
        self.assertEqual(record['headDigest'], birth['anchorDigest'])
        self.assertEqual(record['events'], [])

    def test_original_metadata_dispatches_old_null_and_new_descriptor_exactly(self) -> None:
        digest = 'a' * 64
        old = {
            'profile': codec.CONTEXT_METADATA_PROFILE,
            'enrollmentProfile': 'umf.local-owner-bootstrap-enrollment/0.2',
            'ownerContextProfile': 'umf.local-owner-bootstrap-context/0.3',
            'ownerBootstrapContextDigest': digest, 'supervisorJournal': None,
        }
        self.assertEqual(codec.validate_metadata(old), old)
        new = dict(old, enrollmentProfile=codec.ENROLLMENT_03,
                   supervisorJournal={
                       'birthDigest': 'b' * 64,
                       'journalProfile': codec.JOURNAL_PROFILE_02,
                       'journalId': '56565656-5656-4565-8565-565656565656',
                       'definitionDigest': 'c' * 64,
                   })
        self.assertEqual(codec.validate_metadata(new), new)
        for bad in (
            dict(new, supervisorJournal=None),
            dict(old, supervisorJournal=new['supervisorJournal']),
            dict(new, supervisorJournal={**new['supervisorJournal'], 'extra': 1}),
        ):
            with self.subTest(bad=bad), self.assertRaises(codec.SupervisorJournalCodecError):
                codec.validate_metadata(bad)

    def test_nonzero_v2_record_replays_and_old_untyped_store_events_refuse(self) -> None:
        fixture = _birth()
        birth = codec.validate_birth(
            fixture['birth'], enrollment=fixture['enrollment'],
            configuration_digest=fixture['configurationDigest'],
            generation_root_policy_digest=None)
        create = {
            'profile': 'umf.local-postgresql-create-request/0.2',
            'supervisorId': birth['supervisorId'],
            'clusterId': '67676767-6767-4676-8676-676767676767',
            'incarnationId': '78787878-7878-4787-8787-787878787878',
            'installationId': 'codec-test-installation', 'ownerUid': 501,
            'databaseName': 'appdb', 'businessOwner': 'app_owner',
            'maintenanceName': 'maintenance', 'controllerName': 'controller',
            'controlDirectory': '/private/control', 'dataDirectory': '/private/data',
            'postgresPath': '/opt/postgres/bin/postgres', 'postgresSha256': '1' * 64,
            'initdbPath': '/opt/postgres/bin/initdb', 'initdbSha256': '2' * 64,
            'port': 55439, 'configDigest': '3' * 64, 'hbaDigest': '4' * 64,
            'purpose': 'native-acceptance', 'requestDigest': '5' * 64,
            'approvalId': '89898989-8989-4989-8989-898989898989',
            'approvalDigest': '6' * 64,
            'supervisorJournalBirthDigest': hashlib.sha256(
                codec.canonical(birth)).hexdigest(),
            'ownerBootstrapContextDigest': '8' * 64,
        }
        event = _event(1, 'creation-intent', create, birth['anchorDigest'])
        raw = codec.canonical({
            'profile': codec.JOURNAL_PROFILE_02,
            'supervisorId': birth['supervisorId'], 'journalId': birth['journalId'],
            'definitionDigest': birth['definitionDigest'], 'anchorDigest': birth['anchorDigest'],
            'sequence': 1, 'headDigest': event['recordDigest'], 'events': [event],
        })
        self.assertEqual(codec.validate_record(
            raw, birth=birth, owner_bootstrap_context_digest='8' * 64,
            generation_root_policy_digest=None)['sequence'], 1)
        altered = dict(create, ownerBootstrapContextDigest='9' * 64)
        altered_event = _event(1, 'creation-intent', altered, birth['anchorDigest'])
        altered_raw = codec.canonical({
            'profile': codec.JOURNAL_PROFILE_02,
            'supervisorId': birth['supervisorId'], 'journalId': birth['journalId'],
            'definitionDigest': birth['definitionDigest'], 'anchorDigest': birth['anchorDigest'],
            'sequence': 1, 'headDigest': altered_event['recordDigest'], 'events': [altered_event],
        })
        with self.assertRaises(codec.SupervisorJournalCodecError):
            codec.validate_record(altered_raw, birth=birth,
                                  owner_bootstrap_context_digest='8' * 64,
                                  generation_root_policy_digest=None)
        legacy_store = _event(
            2, 'store-creation-intent',
            {'storeId': 's', 'payloadDigest': '9' * 64, 'schemaName': 's'},
            event['recordDigest'])
        corrupt = codec.canonical({
            'profile': codec.JOURNAL_PROFILE_02,
            'supervisorId': birth['supervisorId'], 'journalId': birth['journalId'],
            'definitionDigest': birth['definitionDigest'], 'anchorDigest': birth['anchorDigest'],
            'sequence': 2, 'headDigest': legacy_store['recordDigest'],
            'events': [event, legacy_store],
        })
        with self.assertRaises(codec.SupervisorJournalCodecError):
            codec.validate_record(corrupt, birth=birth,
                                  owner_bootstrap_context_digest='8' * 64,
                                  generation_root_policy_digest=None)

    def test_wrong_definition_header_digest_and_sequence_refuse(self) -> None:
        fixture = _birth()
        birth = codec.validate_birth(
            fixture['birth'], enrollment=fixture['enrollment'],
            configuration_digest=fixture['configurationDigest'],
            generation_root_policy_digest=None)
        with self.assertRaises(codec.SupervisorJournalCodecError):
            codec.validate_definition(dict(birth['definition'], ingressEvents='future'))
        initial = codec.initial_record(
            supervisor_id=birth['supervisorId'], journal_id=birth['journalId'],
            definition_digest=birth['definitionDigest'], anchor_digest=birth['anchorDigest'])
        doc = __import__('json').loads(initial)
        doc['sequence'] = True
        with self.assertRaises(codec.SupervisorJournalCodecError):
            codec.validate_record(codec.canonical(doc), birth=birth,
                                  owner_bootstrap_context_digest='8' * 64,
                                  generation_root_policy_digest=None)
        bad_birth = dict(birth, initialHeaderDigest='f' * 64)
        with self.assertRaises(codec.SupervisorJournalCodecError):
            codec.validate_birth(
                bad_birth, enrollment=fixture['enrollment'],
                configuration_digest=fixture['configurationDigest'],
                generation_root_policy_digest=None)

    def test_birth_requires_exact_enrolled_descriptor_and_config_digest(self) -> None:
        fixture = _birth()
        birth = fixture['birth']
        enrollment = fixture['enrollment']
        bad_enrollment = dict(enrollment, supervisorJournalBirth={**birth, 'path': '/elsewhere'})
        with self.assertRaises(codec.SupervisorJournalCodecError):
            codec.validate_birth(
                birth, enrollment=bad_enrollment,
                configuration_digest=fixture['configurationDigest'],
                generation_root_policy_digest=None)
        with self.assertRaises(codec.SupervisorJournalCodecError):
            codec.validate_birth(
                birth, enrollment=enrollment,
                configuration_digest='f' * 64,
                generation_root_policy_digest=None)

    def test_parser_rejects_duplicate_noncanonical_and_malformed_replay_without_leaking(self) -> None:
        fixture = _birth()
        birth = codec.validate_birth(
            fixture['birth'], enrollment=fixture['enrollment'],
            configuration_digest=fixture['configurationDigest'],
            generation_root_policy_digest=None)
        valid = codec.initial_record(
            supervisor_id=birth['supervisorId'], journal_id=birth['journalId'],
            definition_digest=birth['definitionDigest'], anchor_digest=birth['anchorDigest'])
        for raw in (
            valid + b'\n',
            b'{"profile":"x","profile":"y"}',
        ):
            with self.subTest(raw=raw), self.assertRaises(codec.SupervisorJournalCodecError):
                codec.validate_record(
                    raw, birth=birth, owner_bootstrap_context_digest='8' * 64,
                    generation_root_policy_digest=None)
        malformed = _event(1, 'native-effect-intent', {}, birth['anchorDigest'])
        doc = {
            'profile': codec.JOURNAL_PROFILE_02,
            'supervisorId': birth['supervisorId'], 'journalId': birth['journalId'],
            'definitionDigest': birth['definitionDigest'], 'anchorDigest': birth['anchorDigest'],
            'sequence': 1, 'headDigest': malformed['recordDigest'], 'events': [malformed],
        }
        with self.assertRaises(codec.SupervisorJournalCodecError):
            codec.validate_record(
                codec.canonical(doc), birth=birth,
                owner_bootstrap_context_digest='8' * 64,
                generation_root_policy_digest=None)

    def test_native_evidence_requires_canonical_json_object_bytes(self) -> None:
        self.assertEqual(codec._validate_native_evidence_bytes(
            b'{"catalogDigest":"' + b'a' * 64 + b'","observed":true}'),
            {'catalogDigest': 'a' * 64, 'observed': True})
        rejected = (
            b'not JSON',
            b'{"profile":"x","profile":"y"}',
            b'{"n":1.0}',
            b'\xff',
            b'[]',
            b'null',
            b'{ "observed":true}',
            b'{"observed":true}\n',
        )
        for raw in rejected:
            with self.subTest(raw=raw), self.assertRaisesRegex(
                    codec.SupervisorJournalCodecError,
                    'supervisor-journal-root-observation-invalid'):
                codec._validate_native_evidence_bytes(raw)

    def test_original_root_replay_context_is_derived_from_exact_empty_registry(self) -> None:
        fixture = root_transition_tests.RootRegistryTransitionsTests()
        fixture.setUp()
        try:
            import umf_access.lifecycle.generation_authority_bootstrap as root
            raw = root.initial_registry_bytes(fixture.registry_id, fixture.anchor)
            context = {
                'registryId': fixture.registry_id,
                'anchorDigest': fixture.anchor,
                'rootPolicy': fixture.policy,
                'purpose': fixture.fixture.config['purpose'],
                'bootstrapEnrollmentId': fixture.bootstrap_id,
                'initialRegistryDigest': hashlib.sha256(raw).hexdigest(),
            }
            self.assertEqual(codec._validate_root_replay_context(context)['initialBytes'], raw)
            with self.assertRaises(codec.SupervisorJournalCodecError):
                codec._validate_root_replay_context(
                    dict(context, initialRegistryDigest='f' * 64))
            with self.assertRaises(codec.SupervisorJournalCodecError):
                codec._validate_root_replay_context(dict(context, extra=True))
        finally:
            fixture.tearDown()

    def test_root_mutation_events_replay_signed_original_registry_transitions(self) -> None:
        root_fixture = root_transition_tests.RootRegistryTransitionsTests()
        root_fixture.setUp()
        try:
            import umf_access.lifecycle.generation_authority_bootstrap as root
            from umf_access.lifecycle.generation_root_registry import (
                confirm_prepared,
                reserve_prepared,
            )
            root_policy_digest = hashlib.sha256(
                root._root_canonical(root_fixture.policy)).hexdigest()
            fixture = _birth(root_policy_digest)
            enrollment = fixture['enrollment']
            enrollment['generationAuthorityRoots'] = [root_fixture.policy]
            birth = codec.validate_birth(
                fixture['birth'], enrollment=enrollment,
                configuration_digest=fixture['configurationDigest'],
                generation_root_policy_digest=root_policy_digest)
            owner_context_digest = '8' * 64
            initial_root = root.initial_registry_bytes(root_fixture.registry_id,
                                                       root_fixture.anchor)
            root_context = {
                'registryId': root_fixture.registry_id,
                'anchorDigest': root_fixture.anchor,
                'rootPolicy': root_fixture.policy,
                'purpose': root_fixture.fixture.config['purpose'],
                'bootstrapEnrollmentId': root_fixture.bootstrap_id,
                'initialRegistryDigest': hashlib.sha256(initial_root).hexdigest(),
            }
            request = root_fixture.requests[0]
            request_digest = hashlib.sha256(
                root._root_canonical(request['intent'])).hexdigest()
            native_evidence_digest = request['intent']['nativeEvidenceDigest']
            configuration_digest = request['intent']['configurationDigest']
            events: list[dict[str, object]] = []
            creation = {
                'profile': 'umf.local-postgresql-create-request/0.2',
                'supervisorId': birth['supervisorId'],
                'clusterId': '67676767-6767-4676-8676-676767676767',
                'incarnationId': '78787878-7878-4787-8787-787878787878',
                'installationId': 'codec-test-installation', 'ownerUid': 501,
                'databaseName': 'appdb', 'businessOwner': 'app_owner',
                'maintenanceName': 'maintenance', 'controllerName': 'controller',
                'controlDirectory': '/private/control', 'dataDirectory': '/private/data',
                'postgresPath': '/opt/postgres/bin/postgres', 'postgresSha256': '1' * 64,
                'initdbPath': '/opt/postgres/bin/initdb', 'initdbSha256': '2' * 64,
                'port': 55439, 'configDigest': '3' * 64, 'hbaDigest': '4' * 64,
                'purpose': 'native-acceptance', 'requestDigest': '5' * 64,
                'approvalId': '89898989-8989-4989-8989-898989898989',
                'approvalDigest': '6' * 64,
                'supervisorJournalBirthDigest': hashlib.sha256(
                    codec.canonical(birth)).hexdigest(),
                'ownerBootstrapContextDigest': owner_context_digest,
            }
            _append(events, 'creation-intent', creation, birth['anchorDigest'])
            _append(events, 'initdb-confirmed', {
                'clusterId': creation['clusterId'], 'dataDevice': 1, 'dataInode': 2,
                'ownerUid': 501, 'initdbReceiptDigest': 'a' * 64,
            }, birth['anchorDigest'])
            launch_id = '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a'
            argv = [creation['postgresPath'], '-D', creation['dataDirectory'],
                    '-c', 'config_file=/private/control/postgresql.conf',
                    '-c', 'hba_file=/private/control/pg_hba.conf',
                    '-c', 'ident_file=/private/control/pg_ident.conf']
            _append(events, 'launch-intent', {
                'launchId': launch_id, 'launchNumber': 1, 'argv': argv,
                'configDigest': creation['configDigest'], 'hbaDigest': creation['hbaDigest'],
                'binarySha256': creation['postgresSha256'], 'dataDevice': 1, 'dataInode': 2,
            }, birth['anchorDigest'])
            _append(events, 'launch-confirmed', {
                'launchId': launch_id,
                'process': {'pid': 55, 'pgid': 55, 'uid': 501, 'gid': 20,
                            'startSec': 1, 'startUsec': 2, 'path': creation['postgresPath'],
                            'argv': argv, 'startToken': 'native-start-token'},
                'nativeObservationDigest': 'b' * 64, 'endpointReceiptDigest': 'c' * 64,
            }, birth['anchorDigest'])
            principal_preparation_id = 'abababab-abab-4bab-8bab-abababababac'
            principal_approval_id = 'bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc'
            principal_approval_digest = 'd' * 64
            principal_intent = {
                'profile': 'umf.local-postgresql-principal-preparation/0.1',
                'preparationId': principal_preparation_id,
            }
            principal_request_digest = hashlib.sha256(
                codec.canonical(principal_intent)).hexdigest()
            _append(events, 'principal-request-prepared', {
                'preparationId': principal_preparation_id,
                'approvalId': principal_approval_id,
                'intent': principal_intent,
                'requestDigest': principal_request_digest,
            }, birth['anchorDigest'])
            principal_effect_id = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdce'
            _append(events, 'native-effect-intent', {
                'reservationId': principal_effect_id,
                'scope': 'native-principal-preparation',
                'effectKey': ['native-principal-preparation', birth['supervisorId'],
                              principal_preparation_id],
                'purpose': creation['purpose'],
                'requestId': principal_approval_id,
                'requestDigest': principal_request_digest,
                'approvalId': principal_approval_id,
                'approvalDigest': principal_approval_digest,
                'stage': 'native-principal-preparation',
                'payloadDigest': 'e' * 64,
            }, birth['anchorDigest'])
            _append(events, 'principal-roles-intent', {
                'reservationId': principal_effect_id,
                'preparationId': principal_preparation_id,
            }, birth['anchorDigest'])
            _append(events, 'principal-roles-confirmed', {
                'reservationId': principal_effect_id, 'observationDigest': 'f' * 64,
            }, birth['anchorDigest'])
            _append(events, 'principal-database-intent', {
                'reservationId': principal_effect_id, 'databaseName': 'appdb',
            }, birth['anchorDigest'])
            _append(events, 'principal-database-confirmed', {
                'reservationId': principal_effect_id, 'databaseOid': 42,
                'systemIdentifier': '181818181818',
            }, birth['anchorDigest'])
            _append(events, 'native-effect-confirmed', {
                'reservationId': principal_effect_id, 'receiptDigest': '8' * 64,
            }, birth['anchorDigest'])
            creation_receipt = {
                'profile': 'umf.local-supervisor-creation-receipt/0.1',
                'supervisorId': birth['supervisorId'], 'clusterId': creation['clusterId'],
                'incarnationId': creation['incarnationId'],
                'creationRequestDigest': creation['requestDigest'],
                'creationApprovalDigest': creation['approvalDigest'],
                'initdbReceiptDigest': 'a' * 64, 'initialLaunchReceiptDigest': '2' * 64,
                'principalPreparationRequestDigest': principal_request_digest,
                'principalPreparationApprovalDigest': principal_approval_digest,
                'principalPreparationReceiptDigest': '5' * 64,
                'applicationDatabase': {'name': 'appdb'},
            }
            creation_receipt_digest = hashlib.sha256(codec.canonical(creation_receipt)).hexdigest()
            _append(events, 'creation-finalized', {
                'receipt': creation_receipt, 'receiptDigest': creation_receipt_digest,
            }, birth['anchorDigest'])
            registration_id = 'abababab-abab-4bab-8bab-abababababab'
            custodian_id = 'bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc'
            provider_id = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd'
            registration = {
                'profile': 'umf.local-owner-target-registration/0.1',
                'registrationId': registration_id, 'custodianId': custodian_id,
                'providerId': provider_id, 'installationId': creation['installationId'],
                'origin': {'profile': 'postgresql18-local-supervised-origin/0.1',
                           'supervisorId': birth['supervisorId'],
                           'clusterId': creation['clusterId'],
                           'incarnationId': creation['incarnationId'],
                           'creationReceiptDigest': creation_receipt_digest},
                'endpointControl': {'profile': 'umf.local-postgresql-endpoint-controller/0.1'},
            }
            registration_intent = {
                'profile': 'umf.owner-target-registration-intent/0.1',
                'registration': registration,
            }
            registration_request_digest = hashlib.sha256(
                codec.canonical(registration_intent)).hexdigest()
            registration_approval_id = 'dededede-dede-4ded-8ded-dededededede'
            registration_approval_digest = '6' * 64
            _append(events, 'registration-request-prepared', {
                'registrationId': registration_id, 'approvalId': registration_approval_id,
                'intent': registration_intent, 'requestDigest': registration_request_digest,
            }, birth['anchorDigest'])
            _append(events, 'registration-signature-verified', {
                'registrationId': registration_id,
                'requestDigest': registration_request_digest,
                'approvalId': registration_approval_id,
                'approvalDigest': registration_approval_digest,
            }, birth['anchorDigest'])
            _append(events, 'owner-registration-approved', {
                'registrationId': registration_id, 'payloadDigest': '7' * 64,
                'approvalId': registration_approval_id,
                'approvalDigest': registration_approval_digest,
            }, birth['anchorDigest'])
            target_custody = {
                'profile': 'umf.native-target-custody/0.1',
                'custodianId': custodian_id, 'registrationId': registration_id,
                'resourceId': creation['clusterId'], 'incarnation': creation['incarnationId'],
                'registrationDigest': hashlib.sha256(codec.canonical(registration)).hexdigest(),
            }
            store = {'profile': 'umf.native-row-originals-store/0.1',
                     'storeId': provider_id,
                     'schemaName': 'umf_originals_' + provider_id.replace('-', '')}
            reservation = {
                'profile': 'umf.row-originals-store-reservation/0.1',
                'reservationId': 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1',
                'providerId': provider_id, 'installationId': creation['installationId'],
                'targetCustody': target_custody, 'store': store,
                'creationRequestDigest': 'b' * 64, 'creationApprovalDigest': 'c' * 64,
                'nativeAuthorityEvidenceDigest': 'd' * 64,
                'configurationDigest': 'e' * 64, 'custodySequence': 1,
            }
            reservation_digest = hashlib.sha256(codec.canonical(reservation)).hexdigest()
            for field, replacement in (
                    ('effectKey', ['native-principal-preparation',
                                   birth['supervisorId'], 'ffffffff-ffff-4fff-8fff-ffffffffffff']),
                    ('approvalId', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
                    ('purpose', 'production')):
                candidate = copy.deepcopy(events)
                principal_effect = next(
                    event['payload'] for event in candidate
                    if event['kind'] == 'native-effect-intent'
                    and event['payload'].get('scope') == 'native-principal-preparation')
                principal_effect[field] = replacement
                candidate = _rechain(candidate, birth['anchorDigest'])
                with self.subTest(principalEffectField=field), self.assertRaisesRegex(
                        codec.SupervisorJournalCodecError,
                        'supervisor-journal-order-invalid'):
                    codec.validate_record(
                        _record(candidate, birth), birth=birth,
                        owner_bootstrap_context_digest=owner_context_digest,
                        generation_root_policy_digest=root_policy_digest,
                        root_replay_context=root_context)
            missing_principal_authority = [event for event in events if event['kind'] not in {
                'principal-request-prepared', 'native-effect-intent',
                'principal-roles-intent', 'principal-roles-confirmed',
                'principal-database-intent', 'principal-database-confirmed',
                'native-effect-confirmed'}]
            _append(missing_principal_authority, 'originals-store-creation-intent', {
                'purpose': creation['purpose'], 'reservation': reservation,
                'reservationDigest': reservation_digest,
                'custodianReservedEventDigest': '1' * 64,
                'creationRequestDigest': reservation['creationRequestDigest'],
                'creationApprovalDigest': reservation['creationApprovalDigest'],
                'nativeAuthorityEvidenceDigest': reservation[
                    'nativeAuthorityEvidenceDigest'],
            }, birth['anchorDigest'])
            with self.assertRaises(codec.SupervisorJournalCodecError):
                codec.validate_record(
                    _record(_rechain(missing_principal_authority, birth['anchorDigest']), birth),
                    birth=birth, owner_bootstrap_context_digest=owner_context_digest,
                    generation_root_policy_digest=root_policy_digest,
                    root_replay_context=root_context)
            ingress_reservation = dict(reservation)
            ingress_reservation['store'] = {
                'profile': 'umf.pg-generation-ingress-store/0.1',
                'storeId': provider_id,
                'schemaName': 'umf_ingress_' + provider_id.replace('-', ''),
            }
            ingress_digest = hashlib.sha256(
                codec.canonical(ingress_reservation)).hexdigest()
            ingress_events = [dict(event, payload=dict(event['payload']))
                              for event in events]
            _append(ingress_events, 'originals-store-creation-intent', {
                'purpose': creation['purpose'], 'reservation': ingress_reservation,
                'reservationDigest': ingress_digest,
                'custodianReservedEventDigest': '1' * 64,
                'creationRequestDigest': ingress_reservation['creationRequestDigest'],
                'creationApprovalDigest': ingress_reservation['creationApprovalDigest'],
                'nativeAuthorityEvidenceDigest': ingress_reservation[
                    'nativeAuthorityEvidenceDigest'],
            }, birth['anchorDigest'])
            with self.assertRaises(codec.SupervisorJournalCodecError):
                codec.validate_record(
                    _record(_rechain(ingress_events, birth['anchorDigest']), birth),
                    birth=birth, owner_bootstrap_context_digest=owner_context_digest,
                    generation_root_policy_digest=root_policy_digest,
                    root_replay_context=root_context)
            _append(events, 'originals-store-creation-intent', {
                'purpose': creation['purpose'], 'reservation': reservation,
                'reservationDigest': reservation_digest,
                'custodianReservedEventDigest': '1' * 64,
                'creationRequestDigest': reservation['creationRequestDigest'],
                'creationApprovalDigest': reservation['creationApprovalDigest'],
                'nativeAuthorityEvidenceDigest': reservation['nativeAuthorityEvidenceDigest'],
            }, birth['anchorDigest'])
            # The reservation digest is not a substitute for validating its
            # nested custody projection. Rehashing malformed data must still
            # fail the closed custody fields and registration association.
            self.assertEqual(codec.validate_record(
                _record(events, birth), birth=birth,
                owner_bootstrap_context_digest=owner_context_digest,
                generation_root_policy_digest=root_policy_digest,
                root_replay_context=root_context)['sequence'], len(events))
            for nested_path, replacement in (
                    (('registrationDigest',), 'not-a-digest'),
                    (('registrationDigest',), '0' * 64),
                    (('registrationId',), True),
                    (('registrationId',), 'abababab-abab-4bab-8bab-abababababac')):
                candidate = copy.deepcopy(events)
                candidate_reservation = candidate[-1]['payload']['reservation']
                candidate_custody = candidate_reservation['targetCustody']
                candidate_custody[nested_path[0]] = replacement
                candidate_digest = hashlib.sha256(codec.canonical(candidate_reservation)).hexdigest()
                candidate[-1]['payload']['reservationDigest'] = candidate_digest
                candidate = _rechain(candidate, birth['anchorDigest'])
                with self.subTest(nestedPath=nested_path, replacement=replacement), \
                        self.assertRaisesRegex(
                            codec.SupervisorJournalCodecError,
                            'supervisor-journal-origin-mismatch'):
                    codec.validate_record(
                        _record(candidate, birth), birth=birth,
                        owner_bootstrap_context_digest=owner_context_digest,
                        generation_root_policy_digest=root_policy_digest,
                        root_replay_context=root_context)
            native_reservation_id = '20202020-2020-4020-8020-202020202020'
            _append(events, 'native-effect-intent', {
                'reservationId': native_reservation_id, 'scope': 'native-store-creation',
                'effectKey': ['native-store-creation', provider_id, store['profile'], provider_id],
                'purpose': creation['purpose'], 'requestId': registration_approval_id,
                'requestDigest': reservation['creationRequestDigest'],
                'approvalId': registration_approval_id,
                'approvalDigest': reservation['creationApprovalDigest'],
                'stage': 'dispatch', 'payloadDigest': 'f' * 64,
            }, birth['anchorDigest'])
            untyped_parent = _rechain(
                [event for event in events
                 if event['kind'] != 'originals-store-creation-intent'],
                birth['anchorDigest'])
            with self.assertRaises(codec.SupervisorJournalCodecError):
                codec.validate_record(
                    _record(untyped_parent, birth), birth=birth,
                    owner_bootstrap_context_digest=owner_context_digest,
                    generation_root_policy_digest=root_policy_digest,
                    root_replay_context=root_context)
            receipt_digest = '2' * 64
            _append(events, 'originals-store-creation-confirmed', {
                'purpose': creation['purpose'], 'reservationDigest': reservation_digest,
                'supervisorIntentDigest': events[-1]['recordDigest'],
                'custodianConfirmationDigest': '3' * 64,
                'nativeReceiptDigest': receipt_digest, 'schemaOid': 16384,
            }, birth['anchorDigest'])
            _append(events, 'native-effect-confirmed', {
                'reservationId': native_reservation_id, 'receiptDigest': receipt_digest,
            }, birth['anchorDigest'])
            native_bytes = codec.canonical({
                'catalogDigest': 'a' * 64, 'observed': True,
            })
            observation_id = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd'
            observed = _append(events, 'generation-authority-observed', {
                'purpose': request['intent']['configuration']['purpose'],
                'observationId': observation_id,
                'configurationDigest': configuration_digest,
                'nativeEvidenceDigest': hashlib.sha256(native_bytes).hexdigest(),
                'nativeEvidence': {'encoding': 'base64',
                                   'data': base64.b64encode(native_bytes).decode('ascii')},
            }, birth['anchorDigest'])
            malformed_observation = [dict(event, payload=dict(event['payload']))
                                     for event in events]
            malformed_payload = malformed_observation[-1]['payload']
            malformed_payload['nativeEvidence'] = {
                'encoding': 'base64',
                'data': base64.b64encode(b'not JSON').decode('ascii'),
            }
            malformed_payload['nativeEvidenceDigest'] = hashlib.sha256(
                b'not JSON').hexdigest()
            malformed_observation = _rechain(
                malformed_observation, birth['anchorDigest'])
            with self.assertRaisesRegex(
                    codec.SupervisorJournalCodecError,
                    'supervisor-journal-root-observation-invalid'):
                codec.validate_record(
                    _record(malformed_observation, birth), birth=birth,
                    owner_bootstrap_context_digest=owner_context_digest,
                    generation_root_policy_digest=root_policy_digest,
                    root_replay_context=root_context)
            root_args = root_fixture._args()
            next_reserve = reserve_prepared(initial_root, request, **root_args)
            mutation_id = 'dededede-dede-4ded-8ded-dededededede'
            reserve_payload = {
                'purpose': request['intent']['configuration']['purpose'],
                'mutationId': mutation_id, 'operation': 'reserve',
                'registryId': root_fixture.registry_id, 'rootRequestId': request['requestId'],
                'rootIntentDigest': request_digest,
                'configurationDigest': configuration_digest,
                'ownerBootstrapContextDigest': owner_context_digest,
                'nativeEvidenceDigest': native_evidence_digest,
                'validationObservationEventDigest': observed['recordDigest'],
                'prior': {'sequence': 0, 'digest': hashlib.sha256(initial_root).hexdigest()},
                'next': {'sequence': 1, 'digest': hashlib.sha256(next_reserve).hexdigest()},
                'delta': {'request': request}, 'subordinateBirth': None,
            }
            reserve_intent = _append(
                events, 'generation-authority-root-mutation-intent', reserve_payload,
                birth['anchorDigest'])
            pending_root_record = codec.canonical({
                'profile': codec.JOURNAL_PROFILE_02,
                'supervisorId': birth['supervisorId'], 'journalId': birth['journalId'],
                'definitionDigest': birth['definitionDigest'],
                'anchorDigest': birth['anchorDigest'], 'sequence': len(events),
                'headDigest': events[-1]['recordDigest'], 'events': events,
            })
            _pending_document, replayed_root, pending_root = codec.validate_record(
                pending_root_record, birth=birth,
                owner_bootstrap_context_digest=owner_context_digest,
                generation_root_policy_digest=root_policy_digest,
                root_replay_context=root_context, include_root_state=True)
            self.assertEqual(replayed_root, initial_root)
            self.assertEqual(pending_root, next_reserve)
            _append(events, 'generation-authority-root-mutation-confirmed', {
                'purpose': reserve_payload['purpose'], 'mutationId': mutation_id,
                'intentEventDigest': reserve_intent['recordDigest'], 'operation': 'reserve',
                'registryId': root_fixture.registry_id, 'rootRequestId': request['requestId'],
                'rootSequence': 1, 'rootStateDigest': hashlib.sha256(next_reserve).hexdigest(),
                'rootEnrollmentId': None, 'contextId': None, 'subordinateBirthDigest': None,
            }, birth['anchorDigest'])

            # The next observation and signed confirmation advance the same exact
            # original request; no replacement request or registry ID is created.
            observed2 = _append(events, 'generation-authority-observed', {
                'purpose': reserve_payload['purpose'],
                'observationId': 'efefefef-efef-4fef-8fef-efefefefefef',
                'configurationDigest': configuration_digest,
                'nativeEvidenceDigest': hashlib.sha256(native_bytes).hexdigest(),
                'nativeEvidence': {'encoding': 'base64',
                                   'data': base64.b64encode(native_bytes).decode('ascii')},
            }, birth['anchorDigest'])
            envelope = root_fixture._sign(request)
            next_confirm = confirm_prepared(
                next_reserve, request['requestId'], envelope, **root_args)
            derived = root._parse(next_confirm)['enrollments'][0]
            subordinate = {
                'profile': 'umf.generation-authority-logical-birth/0.1',
                'rootRegistryId': root_fixture.registry_id,
                'contextJournalRegistryId': 'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0',
                'contextId': derived['contextId'], 'rootRequestId': request['requestId'],
                'trustEnrollmentId': derived['trust']['enrollmentId'],
                'configurationDigest': derived['configurationDigest'],
                'contextProjectionDigest': 'd' * 64,
                'logicalEnrollmentId': 'abababab-abab-4bab-8bab-abababababab',
                'initialEpoch': 'acacacac-acac-4cac-8cac-acacacacacac',
                'contextJournalPath': '/private/control/context.json',
                'contextJournalEntryDigest': 'e' * 64,
                'contextBirthMarkerPath': '/private/control/birth.json',
                'contextBirthMarkerDigest': 'f' * 64,
                'approvalLedgerPath': '/private/control/approval.jsonl',
                'approvalLedgerLockPath': '/private/control/approval.jsonl.lock',
                'approvalLedgerBirthDigest': '1' * 64,
            }
            confirm_payload = {
                'purpose': reserve_payload['purpose'], 'mutationId': 'bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc',
                'operation': 'confirm', 'registryId': root_fixture.registry_id,
                'rootRequestId': request['requestId'], 'rootIntentDigest': request_digest,
                'configurationDigest': configuration_digest,
                'ownerBootstrapContextDigest': owner_context_digest,
                'nativeEvidenceDigest': native_evidence_digest,
                'validationObservationEventDigest': observed2['recordDigest'],
                'prior': {'sequence': 1, 'digest': hashlib.sha256(next_reserve).hexdigest()},
                'next': {'sequence': 2, 'digest': hashlib.sha256(next_confirm).hexdigest()},
                'delta': {'requestId': request['requestId'], 'approvalEnvelope': envelope,
                          'enrollment': derived},
                'subordinateBirth': subordinate,
            }
            confirm_intent = _append(
                events, 'generation-authority-root-mutation-intent', confirm_payload,
                birth['anchorDigest'])
            confirm_event = _append(events, 'generation-authority-root-mutation-confirmed', {
                'purpose': confirm_payload['purpose'], 'mutationId': confirm_payload['mutationId'],
                'intentEventDigest': confirm_intent['recordDigest'], 'operation': 'confirm',
                'registryId': root_fixture.registry_id, 'rootRequestId': request['requestId'],
                'rootSequence': 2, 'rootStateDigest': hashlib.sha256(next_confirm).hexdigest(),
                'rootEnrollmentId': derived['enrollmentId'], 'contextId': derived['contextId'],
                'subordinateBirthDigest': hashlib.sha256(codec.canonical(subordinate)).hexdigest(),
            }, birth['anchorDigest'])
            _append(events, 'generation-authority-bound', {
                'purpose': confirm_payload['purpose'], 'registryId': root_fixture.registry_id,
                'rootEnrollmentId': derived['enrollmentId'], 'contextId': derived['contextId'],
                'rootEntryDigest': hashlib.sha256(codec.canonical(derived)).hexdigest(),
                'configurationDigest': derived['configurationDigest'],
                'confirmEventDigest': confirm_event['recordDigest'],
                'subordinateBirthDigest': hashlib.sha256(codec.canonical(subordinate)).hexdigest(),
                'targetCustodyDigest': derived['trust']['targetCustodyDigest'],
                'storeCreationReceiptDigest': derived['trust']['storeCreationReceiptDigest'],
                'nativeEvidenceDigest': derived['nativeEvidenceDigest'],
                'observationEventDigest': observed2['recordDigest'],
            }, birth['anchorDigest'])
            raw = codec.canonical({
                'profile': codec.JOURNAL_PROFILE_02,
                'supervisorId': birth['supervisorId'], 'journalId': birth['journalId'],
                'definitionDigest': birth['definitionDigest'], 'anchorDigest': birth['anchorDigest'],
                'sequence': len(events), 'headDigest': events[-1]['recordDigest'],
                'events': events,
            })
            record = codec.validate_record(
                raw, birth=birth, owner_bootstrap_context_digest=owner_context_digest,
                generation_root_policy_digest=root_policy_digest,
                root_replay_context=root_context)
            self.assertEqual(record['sequence'], len(events))
        finally:
            root_fixture.tearDown()


if __name__ == '__main__':
    unittest.main()

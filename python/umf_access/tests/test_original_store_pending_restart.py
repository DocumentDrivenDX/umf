# SPDX-License-Identifier: MIT OR Apache-2.0
"""G04 real Core/journal recovery across the external-reservation crash cut.

This is journal/recovery-control evidence. The fake PostgreSQL process and SQL
transport do not qualify bounded driver I/O. Core signing, supervisor/owner
journals, target registration, provider reattachment, and store recovery all
use their production implementations.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import tempfile
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from owner_bootstrap_setup_fixture import install_pending_owner_setup
from umf_access.lifecycle import ingress_custody as custody
from umf_access.lifecycle import ingress_local_postgres as native
from umf_access.lifecycle import owner_bootstrap as bootstrap
from umf_access.lifecycle import supervisor_journal_codec as codec
from umf_access.lifecycle.owner_authority import (
    _SIGNATURE_DOMAIN, _canonical_bytes, create_owner_authority_session,
)
from umf_access.lifecycle.row_originals import STORE_PROFILE


class _Cursor:
    def __init__(self, rows=()):
        self.rows = list(rows)

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return list(self.rows)


class _FakeDatabase:
    """Narrow query transport for the fixed owner bootstrap/recovery queries."""
    def __init__(self, profile, provider_id):
        self.profile = profile
        self.provider_id = provider_id
        self.roles = {}
        self.memberships = []
        self.application_database = None
        self.next_oid = 51001
        self.ddl = []
        self.absence_queries = []
        self.namespace_queries = []

    def maintenance(self, name):
        self.roles[name] = (self.next_oid, True, True, False, False, False, False, False)
        self.next_oid += 1

    def execute(self, sql, params=None):
        text = ' '.join(sql.split())
        params = params or ()
        if text.startswith('ALTER ROLE '):
            self.ddl.append(text)
            name = text.split()[2].strip('"')
            oid = self.roles[name][0]
            self.roles[name] = (oid, True, True, False, False, False, False, False)
            return _Cursor()
        if text.startswith('CREATE ROLE '):
            self.ddl.append(text)
            name = text.split()[2].strip('"')
            superuser = ' SUPERUSER ' in text
            login = ' LOGIN' in text
            self.roles[name] = (self.next_oid, login, superuser, False, False, False, False, False)
            self.next_oid += 1
            return _Cursor()
        if text.startswith('GRANT '):
            self.ddl.append(text)
            # The production statements explicitly grant the fixed set/inherit options.
            granted = text.split()[1].strip('"')
            member = text.split(' TO ', 1)[1].split(' WITH ', 1)[0].strip('"')
            prior = next((row for row in self.memberships
                          if row[0] == member and row[1] == granted),
                         (member, granted, False, False, False))
            self.memberships = [row for row in self.memberships
                                if row[:2] != (member, granted)]
            self.memberships.append((member, granted,
                                     prior[2] or 'ADMIN TRUE' in text,
                                     prior[3] or 'INHERIT TRUE' in text,
                                     prior[4] or 'SET TRUE' in text))
            return _Cursor()
        if text.startswith('CREATE DATABASE '):
            self.ddl.append(text)
            pieces = text.split()
            name = pieces[2].strip('"')
            owner = pieces[4].strip('"')
            self.application_database = (self.next_oid, name, 'C', 'C', owner)
            self.next_oid += 1
            return _Cursor()
        if text.startswith('WITH RECURSIVE reach('):
            rows = [(self.roles[m][0], self.roles[g][0], admin, inherit, setting)
                    for m, g, admin, inherit, setting in self.memberships]
            return _Cursor(rows)
        if text.startswith('SELECT rolname,oid,rolcanlogin,'):
            names = params[0]
            return _Cursor([(name, self.roles[name][0], *self.roles[name][1:])
                            for name in sorted(names) if name in self.roles])
        if text.startswith('SELECT member.oid,granted.oid,'):
            member = params[0]
            return _Cursor([(self.roles[member][0], self.roles[granted][0],
                             admin, inherit, setting)
                            for m, granted, admin, inherit, setting in self.memberships
                            if m == member and member in self.roles
                            and granted in self.roles])
        if text.startswith('SELECT member.rolname,granted.rolname,'):
            member = params[0]
            return _Cursor([(member, granted, admin, inherit, setting)
                            for m, granted, admin, inherit, setting in self.memberships
                            if m == member])
        if 'FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r' in text:
            name = params[0]
            row = self.application_database
            return _Cursor([row] if row is not None and row[1] == name else [])
        if 'SELECT system_identifier::pg_catalog.text' in text:
            return _Cursor([('181818181818',)])
        if 'FROM pg_catalog.pg_namespace n WHERE n.nspname=%s' in text:
            self.namespace_queries.append((text, tuple(params)))
            return _Cursor([])
        if 'FROM pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database()' in text:
            self.absence_queries.append(text)
            controller = next((name for name in self.roles if name.startswith('umf_c_')), None)
            maintenance = next((name for name in self.roles if name.startswith('umf_m_')), None)
            return _Cursor([('fixturedb', 5, '181818181818', maintenance,
                             controller, controller, 'pg_catalog', 'UTC', 'on',
                             'origin', 'on', 'read committed',
                             self.roles[maintenance][0], self.roles[controller][0])])
        return _Cursor()


class _FakeConnection:
    def __init__(self, db):
        self.db = db
        self.info = SimpleNamespace(transaction_status=0)
        self.autocommit = False
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    @contextmanager
    def transaction(self):
        previous = self.info.transaction_status
        self.info.transaction_status = 2
        try:
            yield self
        finally:
            self.info.transaction_status = previous

    def execute(self, sql, params=None):
        text = ' '.join(sql.split())
        if text == 'BEGIN READ ONLY' or text == 'BEGIN':
            self.info.transaction_status = 2
            return _Cursor()
        if text in ('COMMIT', 'ROLLBACK'):
            self.info.transaction_status = 0
            return _Cursor()
        if text.startswith('SET ') or text.startswith('RESET '):
            return _Cursor()
        return self.db.execute(sql, params)


def _execute_journal_recovery_control_transport(_issuer, _budget, connection, query, params=None, **_kwargs):
    """Journal/recovery-control transport seam, not bounded-I/O qualification."""
    return connection.execute(query, params)


class _FakeProcessObserver:
    def __init__(self):
        self.process_value = None
        self.sockets_value = []

    def process(self, _pid):
        return self.process_value

    def group(self, _pgid):
        return [self.process_value] if self.process_value else []

    def sockets(self, _pgid):
        return list(self.sockets_value)


class _FakeProcess:
    def __init__(self, pid):
        self.pid = pid

    def poll(self):
        return None


class OriginalStorePendingRestartTests(unittest.TestCase):
    def _signed_envelope(self, authority, private_key, request):
        exported = authority.export_signing_request(request)
        signature = private_key.sign(
            _SIGNATURE_DOMAIN + _canonical_bytes(exported['payload']))
        return {'payload': exported['payload'],
                'signature': base64.urlsafe_b64encode(signature).decode('ascii').rstrip('=')}

    def test_external_reserved_only_prefix_recovers_readonly_and_survives_restart(self):
        with tempfile.TemporaryDirectory(prefix='umf-g04-pending-restart-') as temporary:
            root = Path(temporary).resolve()
            control, data = root / 'control', root / 'data'
            control.mkdir(mode=0o700); data.mkdir(mode=0o700)
            for directory in (root, control, data):
                os.chmod(directory, 0o700)
            supervisor_id, custodian_id, provider_id = (str(uuid.uuid4()) for _ in range(3))
            installation_id = 'g04-pending-restart'
            private_key = Ed25519PrivateKey.generate()
            public_key = private_key.public_key().public_bytes(
                serialization.Encoding.Raw, serialization.PublicFormat.Raw)
            config = {
                'profile': 'umf.configured-owner-authority/0.1',
                'authorityId': str(uuid.uuid4()), 'policyRevision': 'g04-test-policy',
                'purpose': 'native-acceptance',
                'keys': [{'keyId': 'owner-key',
                          'publicKey': base64.urlsafe_b64encode(public_key).decode('ascii').rstrip('='),
                          'principalId': 'g04-owner',
                          'scopes': ['local-target-creation', 'local-target-registration',
                                     'native-principal-preparation', 'native-store-creation'],
                          'supervisorIds': [supervisor_id], 'providerIds': [provider_id],
                          'installationIds': [installation_id]}],
            }
            root_private = Ed25519PrivateKey.generate()
            root_public = root_private.public_key().public_bytes(
                serialization.Encoding.Raw, serialization.PublicFormat.Raw)
            roots = {'profile': 'umf.generation-authority-root-policy/0.1',
                     'authorityId': str(uuid.uuid4()), 'policyRevision': 'g04-roots',
                     'keys': [{'keyId': 'root-key',
                               'publicKey': base64.urlsafe_b64encode(root_public).decode('ascii').rstrip('='),
                               'principalId': 'g04-root',
                               'logicalAuthorityIds': [config['authorityId']],
                               'configurationProfiles': [
                                   'umf.configured-generation-enrollment-authority/0.1']}]}
            with patch.object(bootstrap, 'sys_platform_darwin', return_value=True):
                profile = native.LocalPostgresProfile(
                    control_home=control, data_home=data, postgres_binary=root / 'postgres',
                    initdb_binary=root / 'initdb', process_observer=root / 'observer',
                    process_observer_sha256='a' * 64, port=55439, database_name='fixturedb',
                    business_owner='fixture_owner', custodian_id=custodian_id,
                    supervisor_id=supervisor_id, provider_id=provider_id,
                    installation_id=installation_id, purpose='native-acceptance')
            for binary in (profile.postgres_binary, profile.initdb_binary):
                binary.write_bytes(b'fixture executable'); binary.chmod(0o700)
            native_profile = native._profile_to_enrollment(profile)
            native_profile['custodianId'] = custodian_id
            definition = {
                'profile': codec.DEFINITION_PROFILE, 'journalProfile': codec.JOURNAL_PROFILE_02,
                'physicalEvents': 'umf.supervisor-physical-events/0.2',
                'rootEvents': 'umf.supervisor-generation-root-events/0.1',
                'originalsEvents': 'umf.supervisor-originals-store-events/0.1',
                'ingressEvents': None, 'applicationEvents': None,
            }
            definition_digest = hashlib.sha256(codec.canonical(definition)).hexdigest()
            journal_id = str(uuid.uuid4())
            journal_path, lock_path = codec.expected_paths(str(control), supervisor_id)
            root_digest = hashlib.sha256(codec.canonical(roots)).hexdigest()
            context = {'custodianId': custodian_id, 'supervisorId': supervisor_id,
                       'providerId': provider_id, 'installationId': installation_id}
            anchor = {'profile': codec.ANCHOR_PROFILE, 'enrollmentId': str(uuid.uuid4()),
                      'purpose': 'native-acceptance', 'context': context,
                      'authorityConfigurationDigest': hashlib.sha256(codec.canonical(config)).hexdigest(),
                      'nativeProfileDigest': hashlib.sha256(codec.canonical(native_profile)).hexdigest(),
                      'generationRootPolicyDigest': root_digest, 'journalId': journal_id,
                      'path': journal_path, 'lockPath': lock_path,
                      'definitionDigest': definition_digest}
            anchor_digest = hashlib.sha256(codec.canonical(anchor)).hexdigest()
            initial = codec.initial_record(supervisor_id=supervisor_id, journal_id=journal_id,
                                           definition_digest=definition_digest,
                                           anchor_digest=anchor_digest)
            birth = {'profile': codec.BIRTH_PROFILE, 'journalProfile': codec.JOURNAL_PROFILE_02,
                     'journalId': journal_id, 'supervisorId': supervisor_id,
                     'definition': definition, 'definitionDigest': definition_digest,
                     'path': journal_path, 'lockPath': lock_path, 'anchorDigest': anchor_digest,
                     'initialHeaderDigest': hashlib.sha256(initial).hexdigest()}
            target_definition = {'profile': codec.TARGET_CUSTODY_DEFINITION_PROFILE,
                                 'journalProfile': codec.TARGET_CUSTODY_JOURNAL_PROFILE_02,
                                 'eventKinds': list(codec.TARGET_CUSTODY_EVENT_KINDS)}
            target_header = {'profile': codec.TARGET_CUSTODY_JOURNAL_PROFILE_02,
                             'custodianId': custodian_id, 'sequence': 0,
                             'headDigest': '0' * 64, 'events': []}
            target_path = str(control / 'target-custody.json')
            target_birth = {'profile': codec.TARGET_CUSTODY_BIRTH_PROFILE,
                            'journalProfile': codec.TARGET_CUSTODY_JOURNAL_PROFILE_02,
                            'custodianId': custodian_id, 'supervisorId': supervisor_id,
                            'path': target_path, 'lockPath': target_path + '.lock',
                            'definition': target_definition,
                            'definitionDigest': hashlib.sha256(codec.canonical(target_definition)).hexdigest(),
                            'initialHeaderDigest': hashlib.sha256(codec.canonical(target_header)).hexdigest()}
            enrollment = {'profile': codec.ENROLLMENT_05, 'enrollmentId': anchor['enrollmentId'],
                          'purpose': 'native-acceptance', 'context': context,
                          'ownerConfiguration': config, 'nativeProfile': native_profile,
                          'generationAuthorityRoots': roots,
                          'supervisorJournalBirth': birth,
                          'targetCustodyJournalBirth': target_birth}
            enrollment_bytes = bootstrap._canonical(enrollment)
            bootstrap._write_private(control / 'owner-bootstrap-enrollment.json', enrollment_bytes)
            owner_ledger = control / 'original-owner-approvals.jsonl'
            install_pending_owner_setup(control, enrollment, enrollment_bytes, owner_ledger,
                                        generation_registry_id=str(uuid.uuid4()))

            db = _FakeDatabase(profile, provider_id)
            observer = _FakeProcessObserver()
            readonly_observations = []
            with (patch.object(native, 'sys_platform_darwin', return_value=True),
                  patch.object(native, '_DarwinProcessObserver', return_value=observer)):
                session = create_owner_authority_session(profile, ledger_path=owner_ledger)
            supervisor = session.supervisor
            authority = session.authority
            db.maintenance('umf_m_' + supervisor_id.replace('-', ''))
            def native_observation(_self, database_name, *, current_role=None,
                                  budget_reservation=None, readonly_budget=None):
                del budget_reservation
                if readonly_budget is not None:
                    readonly_observations.append(readonly_budget)
                maintenance = 'umf_m_' + supervisor_id.replace('-', '')
                controller = 'umf_c_' + supervisor_id.replace('-', '')
                role = current_role or maintenance
                readonly = readonly_budget is not None
                return {
                    'serverVersionNum': '180006', 'listenAddresses': '127.0.0.1',
                    'unixSocketDirectories': '', 'port': str(profile.port),
                    'dataDirectory': str(supervisor._target_paths['data']) if supervisor._target_paths else str(data / supervisor_id.replace('-', '')),
                    'configFile': str(control / supervisor_id.replace('-', '') / 'postgresql.conf'),
                    'hbaFile': str(control / supervisor_id.replace('-', '') / 'pg_hba.conf'),
                    'identFile': str(control / supervisor_id.replace('-', '') / 'pg_ident.conf'),
                    'ssl': 'off', 'passwordEncryption': 'scram-sha-256', 'timeZone': 'UTC',
                    'dateStyle': 'ISO, YMD', 'maxPreparedTransactions': '0',
                    'sharedPreloadLibraries': '', 'sessionPreloadLibraries': '',
                    'localPreloadLibraries': '', 'authenticationTimeout': '10s',
                    'logStatement': 'none', 'logMinErrorStatement': 'panic',
                    'logErrorVerbosity': 'terse', 'searchPath': 'pg_catalog', 'rowSecurity': 'on',
                    'sessionReplicationRole': 'origin', 'transactionReadOnly': 'on' if readonly else 'off',
                    'transactionIsolation': 'read committed', 'databaseName': database_name,
                    'databaseOid': 5 if database_name == 'postgres' else 6,
                    'systemIdentifier': '181818181818', 'sessionUser': maintenance,
                    'currentUser': role, 'roleSetting': current_role or 'none',
                    'sessionUserOid': db.roles[maintenance][0],
                    'currentUserOid': db.roles.get(role, (52000,))[0],
                    'serverVersion': 'PostgreSQL 18.6 fixture',
                    'settingsDigest': 'e' * 64, 'settingsCount': 1,
                    'hbaRules': [['host', ['all'], [maintenance], '127.0.0.1', '255.255.255.255', 'scram-sha-256', [], None],
                                 ['local', ['all'], ['all'], None, None, 'reject', [], None],
                                 ['host', ['all'], ['all'], '0.0.0.0', '0.0.0.0', 'reject', [], None],
                                 ['host', ['all'], ['all'], '::', '0', 'reject', [], None]],
                }
            @contextmanager
            def connect_maintenance(_self, _database_name, **_kwargs):
                yield _FakeConnection(db)
            def run_child(_self, argv, _log_path, _timeout, **_kwargs):
                data_path = Path(argv[2])
                (data_path / 'global').mkdir()
                (data_path / 'global' / 'pg_control').write_bytes(b'fixture control')
                (data_path / 'PG_VERSION').write_text('18\n')
            def launch(_self, postgres, data_dir, config_path, hba_path, ident_path,
                       config_digest, hba_digest, *, launch_number, **_kwargs):
                pid = 42001 + launch_number
                argv = [str(postgres), '-D', str(data_dir), '-c', f'config_file={config_path}',
                        '-c', f'hba_file={hba_path}', '-c', f'ident_file={ident_path}']
                process = {'uid': os.geteuid(), 'gid': os.getegid(), 'pgid': pid,
                           'pid': pid, 'startSec': launch_number, 'startUsec': 0,
                           'path': str(postgres), 'argv': argv,
                           'startToken': f'fixture-{launch_number}'}
                observer.process_value = process
                observer.sockets_value = [{'family': 2, 'address': '127.0.0.1',
                                           'port': profile.port, 'pid': pid,
                                           'listening': True, 'peerAddress': '0.0.0.0'}]
                fake_process = _FakeProcess(pid)
                _self._pg_process = fake_process
                (data_dir / 'postmaster.pid').write_text(
                    f'{pid}\n{data_dir}\n0\n{profile.port}\n\n127.0.0.1\n')
                native_state = native_observation(_self, 'postgres')
                endpoint_digest = native._digest({
                    'hbaDigest': hba_digest, 'configDigest': config_digest,
                    'listen': '127.0.0.1', 'port': profile.port,
                    'unixSocketDirectories': '',
                    'socketsDigest': native._digest(observer.sockets_value),
                    'nativeSettingsDigest': native._digest(native_state),
                    'processStartToken': process['startToken'],
                })
                _self._launch = {'launchId': str(uuid.uuid4()), 'launchNumber': launch_number,
                                 'argv': argv, 'process': process,
                                 'native': native_state, 'sockets': observer.sockets_value,
                                 'nativeAttestation': native._NativeAttestation(
                                     _self, process, native_state, endpoint_digest)}
                assert _self._journal is not None
                _self._append_supervisor_journal('launch-intent', {
                    'launchId': _self._launch['launchId'], 'launchNumber': launch_number,
                    'argv': argv, 'configDigest': config_digest, 'hbaDigest': hba_digest,
                    'binarySha256': 'b' * 64,
                    'dataDevice': str(os.stat(data_dir).st_dev),
                    'dataInode': str(os.stat(data_dir).st_ino)})
                _self._append_supervisor_journal('launch-confirmed', {
                    'launchId': _self._launch['launchId'], 'process': process,
                    'nativeObservationDigest': native._digest(_self._launch['native']),
                    'endpointReceiptDigest': endpoint_digest})
            supervisor._observer = observer
            create_patches = (
                patch.object(native.LocalPostgresSupervisor,
                             '_validate_installation_binaries', autospec=True,
                             return_value=(profile.postgres_binary, profile.initdb_binary)),
                patch.object(native, '_sha_file', return_value='b' * 64),
                patch.object(native.LocalPostgresSupervisor, '_run_bounded_child', run_child),
                patch.object(native.LocalPostgresSupervisor, '_launch_postmaster', launch),
                patch.object(native.LocalPostgresSupervisor, '_observe_native', native_observation),
                patch.object(native.LocalPostgresSupervisor, '_connect_maintenance', connect_maintenance),
            )
            with create_patches[0], create_patches[1], create_patches[2], create_patches[3], create_patches[4], create_patches[5]:
                pending, creation_request = session.prepare_target_creation()
                target = session.create_target(
                    pending, self._signed_envelope(authority, private_key, creation_request))
                principal, principal_request = session.prepare_original_principals(target)
                session.apply_original_principals(
                    principal, self._signed_envelope(authority, private_key, principal_request))
                registration, registration_request = session.prepare_target_registration(target)
                foreign_issuer = native._issue_local_owner_bootstrap_issuer(profile)
                foreign_birth_handle = (
                    bootstrap._target_custody_journal_birth_for_issuer(foreign_issuer))
                self.assertIsNot(foreign_issuer, supervisor._bootstrap_issuer)
                self.assertIsNot(foreign_birth_handle,
                                 supervisor._target_custody_journal_birth)
                try:
                    with self.assertRaisesRegex(
                            bootstrap.LocalPostgresError,
                            'target-custody-journal-birth-unverified'):
                        bootstrap._resolve_original_target_custody_journal_birth(
                            supervisor._target_custody_journal_birth,
                            issuer=foreign_issuer,
                            context=session.authority.authority_context,
                            supervisor=supervisor, control_lease=None)
                finally:
                    bootstrap._TARGET_CUSTODY_JOURNAL_BIRTHS.pop(
                        id(foreign_issuer), None)
                    bootstrap._SUPERVISOR_JOURNAL_BIRTHS.pop(
                        id(foreign_issuer), None)
                    native._BOOTSTRAP_ISSUERS.pop(id(foreign_issuer), None)
                public_or_handle = session.apply_target_registration(
                    registration, self._signed_envelope(
                        authority, private_key, registration_request))
                self.assertIs(supervisor.custody_handle, public_or_handle)
                self.assertIs(supervisor._custodian._journal._issuer,
                              supervisor._bootstrap_issuer)
                with supervisor._original_control_lease(operation_kind='store'):
                    evidence = supervisor.prepare_original_store_evidence(
                        public_or_handle, store_profile=STORE_PROFILE)
                    store_request = evidence.owner_request
                    store_approval = supervisor.prepare_original_store_authority(
                        store_request, self._signed_envelope(
                            authority, private_key, store_request))[1]
                    payload = json.loads(store_request._intent_bytes)
                    store = payload['store']
                    reference = supervisor._custodian._public_reference(public_or_handle)
                    external_reservation = {
                        'profile': 'umf.row-originals-store-reservation/0.1',
                        'reservationId': str(uuid.uuid4()), 'providerId': provider_id,
                        'installationId': installation_id, 'targetCustody': reference,
                        'store': store, 'creationRequestDigest': store_request._intent_digest,
                        'creationApprovalDigest': store_approval.approval_digest,
                        'nativeAuthorityEvidenceDigest': payload['evidence'][
                            'nativeAuthorityObservationDigest'],
                        'configurationDigest': authority.configuration_digest,
                        'custodySequence': 0,
                    }
                    # This is the real first durable append inside
                    # reserve_originals_store_creation; interruption immediately afterward
                    # leaves the genuine external-only prefix.
                    external_append = supervisor._custodian._journal._reserve_originals_store(
                        purpose=profile.purpose, request=payload,
                        approval_digest=store_approval.approval_digest,
                        reservation=external_reservation)
                    external_event = next(
                        event for event in supervisor._custodian._journal._read()['events']
                        if event['recordDigest'] == external_append['recordDigest'])
                    external_payload = external_event['payload']
                    external_reservation = external_payload['reservation']
                    self.assertEqual(external_payload['request'], payload)
                    self.assertEqual(external_payload['approvalDigest'],
                                     store_approval.approval_digest)
                    self.assertEqual(external_payload['reservationDigest'],
                                     native._digest(external_reservation))
                    self.assertEqual(external_reservation['creationRequestDigest'],
                                     store_request._intent_digest)
                    self.assertEqual(external_reservation['creationApprovalDigest'],
                                     store_approval.approval_digest)
                    state = supervisor._custodian._journal.snapshot()
                    self.assertEqual(state['pending']['stores'],
                                     [external_reservation['reservationId']])
                    self.assertFalse(any(
                        event['kind'] == 'originals-store-creation-intent'
                        for event in supervisor._journal.read()['events']))
                    ddl_before_recovery = list(db.ddl)

                # Recreate Core and supervisor on the same durable enrollment and journals.
                with patch.object(native, 'sys_platform_darwin', return_value=True), \
                     patch.object(native, '_DarwinProcessObserver', return_value=observer):
                    restarted = create_owner_authority_session(profile, ledger_path=owner_ledger)
                restarted_supervisor = restarted.supervisor
                restarted_supervisor._observer = observer
                with patch.object(native, '_sha_file', return_value='b' * 64), \
                     patch.object(native.LocalPostgresSupervisor, '_observe_native', native_observation), \
                     patch.object(native.LocalPostgresSupervisor, '_connect_maintenance', connect_maintenance):
                    restarted_target = restarted.reattach_original_target()
                    registration_id = reference['registrationId']
                    handles_before_failure = dict(restarted_supervisor._handles)
                    payloads_before_failure = dict(restarted_supervisor._owner_payloads)
                    dispatches_before_failure = dict(
                        restarted_supervisor._registration_recovery_dispatches)
                    with patch.object(
                            custody, '_bootstrap_original_02_target_custodian',
                            side_effect=RuntimeError('fixture-bootstrap-cut')):
                        with self.assertRaisesRegex(RuntimeError, 'fixture-bootstrap-cut'):
                            restarted.reattach_original_registration(restarted_target)
                    self.assertIsNone(restarted_supervisor._resolver)
                    self.assertIsNone(restarted_supervisor.custody_handle)
                    self.assertEqual(restarted_supervisor._handles, handles_before_failure)
                    self.assertEqual(restarted_supervisor._owner_payloads,
                                     payloads_before_failure)
                    self.assertNotIn(registration_id,
                                     restarted_supervisor._owner_payloads)
                    self.assertTrue(set(dispatches_before_failure).issubset(
                        restarted_supervisor._registration_recovery_dispatches))
                    self.assertEqual(
                        len(restarted_supervisor._registration_recovery_dispatches),
                        len(dispatches_before_failure) + 1)
                    recovery_key = next(
                        key for key in restarted_supervisor._registration_recovery_dispatches
                        if key not in dispatches_before_failure)
                    recovery_dispatch = (
                        restarted_supervisor._registration_recovery_dispatches[recovery_key])
                    reservation = recovery_dispatch[0]
                    self.assertIs(recovery_dispatch[1], restarted_target)
                    binding = next(
                        item for item in restarted._effect_bindings.values()
                        if item._reservation is reservation)
                    effect_handle = restarted._pending_effect_handle(
                        binding, mode='recover')

                    callback_failure = [True]
                    def fail_registration_observation_once(
                            _self, database_name, *, current_role=None,
                            budget_reservation=None, readonly_budget=None):
                        if callback_failure[0]:
                            callback_failure[0] = False
                            raise native.LocalPostgresError(
                                'fixture-registration-observation-cut')
                        return native_observation(
                            _self, database_name, current_role=current_role,
                            budget_reservation=budget_reservation,
                            readonly_budget=readonly_budget)
                    with patch.object(
                            native.LocalPostgresSupervisor, '_observe_native',
                            fail_registration_observation_once):
                        with self.assertRaisesRegex(
                                native.LocalPostgresError,
                                'local-postgresql-registration-outcome-unresolved'):
                            with restarted_supervisor._original_control_lease(
                                    operation_kind='registration-recover'):
                                restarted_supervisor.execute_original_registration_reattachment(
                                    reservation, effect_handle)
                    self.assertFalse(callback_failure[0])
                    self.assertIsNone(restarted_supervisor._resolver)
                    self.assertIsNone(restarted_supervisor.custody_handle)
                    self.assertEqual(restarted_supervisor._handles, handles_before_failure)
                    self.assertEqual(restarted_supervisor._owner_payloads,
                                     payloads_before_failure)
                    self.assertNotIn(registration_id,
                                     restarted_supervisor._owner_payloads)
                    self.assertTrue(set(dispatches_before_failure).issubset(
                        restarted_supervisor._registration_recovery_dispatches))
                    self.assertEqual(
                        len(restarted_supervisor._registration_recovery_dispatches),
                        len(dispatches_before_failure) + 1)
                    self.assertIs(
                        restarted_supervisor._registration_recovery_dispatches[recovery_key],
                        recovery_dispatch)

                    with restarted_supervisor._original_control_lease(
                            operation_kind='registration-recover'):
                        public_reference = (
                            restarted_supervisor.execute_original_registration_reattachment(
                                reservation, effect_handle))
                        recovered_outcome = next(
                            item for item in restarted_supervisor._native_effect_outcomes.values()
                            if item._reservation is reservation)
                        restarted.record_native_outcome(binding, recovered_outcome)
                    self.assertEqual(public_reference, reference)
                    self.assertIsNone(restarted_supervisor.custody_handle)
                    caller_connection = _FakeConnection(db)
                    psycopg_fixture = SimpleNamespace(Connection=_FakeConnection)
                    with patch.dict(sys.modules, {'psycopg': psycopg_fixture}):
                        recovery_provider = restarted_supervisor.open_originals_store_recovery(
                            caller_connection, provider_id=provider_id)
                    with self.assertRaisesRegex(Exception, 'store-recovery-only'):
                        recovery_provider.create()
                    with self.assertRaisesRegex(Exception, 'store-recovery-only'):
                        recovery_provider.resume_creation()
                    recovery_codes = []
                    original_recover = native.LocalPostgresSupervisor.recover_originals_store_creation
                    def capture_recovery_code(issuer, *args, **kwargs):
                        try:
                            return original_recover(issuer, *args, **kwargs)
                        except native.LocalPostgresError as error:
                            recovery_codes.append(error.code)
                            raise
                    absence_queries_before = len(db.absence_queries)
                    namespace_queries_before = len(db.namespace_queries)
                    with (patch.dict(sys.modules, {'psycopg': psycopg_fixture}),
                          patch.object(native, '_execute_original_store_sql',
                                       _execute_journal_recovery_control_transport),
                          patch.object(native.LocalPostgresSupervisor,
                                       'recover_originals_store_creation',
                                       capture_recovery_code)):
                        with self.assertRaisesRegex(
                                Exception,
                                r'^row-originals-store-recovery-invalid$'):
                            recovery_provider.recover_creation()
                    self.assertEqual(recovery_codes, [
                        'local-postgresql-store-recovery-noncommit-unproven'])
                    self.assertGreater(len(db.absence_queries), absence_queries_before)
                    self.assertTrue(all(
                        'FROM pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database()'
                        in query for query in db.absence_queries[absence_queries_before:]))
                    new_namespace_queries = db.namespace_queries[namespace_queries_before:]
                    self.assertEqual(len(new_namespace_queries), 1)
                    self.assertIn(
                        'FROM pg_catalog.pg_namespace n WHERE n.nspname=%s',
                        new_namespace_queries[0][0])
                    self.assertEqual(new_namespace_queries[0][1], (store['schemaName'],))
                    with restarted_supervisor._original_control_lease(
                            operation_kind='store'):
                        first_events = restarted_supervisor._journal.read()['events']
                    typed_events = [event for event in first_events
                                    if event['kind'] == 'originals-store-creation-intent'
                                    and event['payload'].get('reservationDigest')
                                        == external_payload['reservationDigest']]
                    effect_events = [event for event in first_events
                                     if event['kind'] == 'native-effect-intent'
                                     and event['payload'].get('scope')
                                        == 'native-store-creation'
                                     and event['payload'].get('requestDigest')
                                        == store_request._intent_digest]
                    self.assertEqual(len(typed_events), 1)
                    self.assertEqual(len(effect_events), 1)
                    typed_event, effect_event = typed_events[0], effect_events[0]
                    typed_payload = typed_event['payload']
                    self.assertEqual(typed_payload['purpose'], profile.purpose)
                    self.assertEqual(typed_payload['reservation'], external_reservation)
                    self.assertEqual(typed_payload['reservationDigest'],
                                     external_payload['reservationDigest'])
                    self.assertEqual(typed_payload['custodianReservedEventDigest'],
                                     external_event['recordDigest'])
                    self.assertEqual(typed_payload['creationRequestDigest'],
                                     store_request._intent_digest)
                    self.assertEqual(typed_payload['creationApprovalDigest'],
                                     store_approval.approval_digest)
                    self.assertEqual(typed_payload['nativeAuthorityEvidenceDigest'],
                                     external_reservation['nativeAuthorityEvidenceDigest'])
                    effect_payload = effect_event['payload']
                    self.assertEqual(effect_payload['scope'], 'native-store-creation')
                    self.assertEqual(effect_payload['purpose'], profile.purpose)
                    self.assertEqual(effect_payload['effectKey'],
                                     list(store_request._effect_key))
                    self.assertEqual(effect_payload['requestId'],
                                     store_request._approval_id)
                    self.assertEqual(effect_payload['requestDigest'],
                                     store_request._intent_digest)
                    self.assertEqual(effect_payload['approvalId'],
                                     store_approval.approval_id)
                    self.assertEqual(effect_payload['approvalDigest'],
                                     store_approval.approval_digest)
                    self.assertEqual(effect_payload['stage'], 'native-store-creation')
                    self.assertEqual(effect_payload['payloadDigest'],
                                     hashlib.sha256(store_request._intent_bytes).hexdigest())
                    self.assertEqual(effect_event['sequence'], typed_event['sequence'] + 1)
                    self.assertEqual(effect_event['previousDigest'],
                                     typed_event['recordDigest'])
                    pending_outcome = restarted.authority.observe_original_request(
                        restarted.authority.authority_context,
                        store_request._effect_key)
                    self.assertEqual(pending_outcome.approval_id,
                                     store_request._approval_id)
                    self.assertEqual(pending_outcome.intent_digest,
                                     store_request._intent_digest)
                    self.assertEqual(pending_outcome.approval_status, 'consumed')
                    self.assertEqual(pending_outcome.effect_status, 'effect-pending')
                    self.assertEqual(pending_outcome.effect_digest,
                                     native._digest(effect_event['recordDigest']))
                    self.assertIsNone(restarted_supervisor.custody_handle)
                    self.assertIsNone(recovery_provider._creation_reservation)
                    self.assertIsNone(recovery_provider._creation_capability)
                    self.assertIsNone(recovery_provider._schema_oid)
                    self.assertEqual(db.ddl, ddl_before_recovery)
                    self.assertTrue(readonly_observations)

                    # The new generic-pending prefix is reattached from the same
                    # enrolled files. A second read-only observation still cannot
                    # turn absence into a committed store or normal capability.
                    with patch.object(native, 'sys_platform_darwin', return_value=True), \
                         patch.object(native, '_DarwinProcessObserver', return_value=observer):
                        after_pending = create_owner_authority_session(
                            profile, ledger_path=owner_ledger)
                    after_pending_supervisor = after_pending.supervisor
                    after_pending_supervisor._observer = observer
                    pending_target = after_pending.reattach_original_target()
                    self.assertEqual(after_pending.reattach_original_registration(pending_target),
                                     reference)
                    self.assertIsNone(after_pending_supervisor.custody_handle)
                    pending_connection = _FakeConnection(db)
                    with patch.dict(sys.modules, {'psycopg': psycopg_fixture}):
                        pending_provider = after_pending_supervisor.open_originals_store_recovery(
                            pending_connection, provider_id=provider_id)
                    with self.assertRaisesRegex(Exception, 'store-recovery-only'):
                        pending_provider.create()
                    with self.assertRaisesRegex(Exception, 'store-recovery-only'):
                        pending_provider.resume_creation()
                    before_retry_observations = len(readonly_observations)
                    before_retry_absence_queries = len(db.absence_queries)
                    before_retry_namespace_queries = len(db.namespace_queries)
                    with after_pending_supervisor._original_control_lease(
                            operation_kind='store'):
                        before_retry_events = after_pending_supervisor._journal.read()['events']
                    second_recovery_codes = []
                    second_original_recover = (
                        native.LocalPostgresSupervisor.recover_originals_store_creation)
                    def capture_second_recovery_code(issuer, *args, **kwargs):
                        try:
                            return second_original_recover(issuer, *args, **kwargs)
                        except native.LocalPostgresError as error:
                            second_recovery_codes.append(error.code)
                            raise
                    with (patch.dict(sys.modules, {'psycopg': psycopg_fixture}),
                          patch.object(native, '_execute_original_store_sql',
                                       _execute_journal_recovery_control_transport),
                          patch.object(native.LocalPostgresSupervisor,
                                       'recover_originals_store_creation',
                                       capture_second_recovery_code)):
                        with self.assertRaisesRegex(
                                Exception,
                                r'^row-originals-store-recovery-invalid$'):
                            pending_provider.recover_creation()
                    self.assertEqual(second_recovery_codes, [
                        'local-postgresql-store-recovery-noncommit-unproven'])
                    self.assertGreater(len(db.absence_queries), before_retry_absence_queries)
                    self.assertTrue(all(
                        'FROM pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database()'
                        in query for query in db.absence_queries[before_retry_absence_queries:]))
                    retry_namespace_queries = db.namespace_queries[before_retry_namespace_queries:]
                    self.assertEqual(len(retry_namespace_queries), 1)
                    self.assertIn(
                        'FROM pg_catalog.pg_namespace n WHERE n.nspname=%s',
                        retry_namespace_queries[0][0])
                    self.assertEqual(retry_namespace_queries[0][1], (store['schemaName'],))
                    self.assertGreater(len(readonly_observations), before_retry_observations)
                    with after_pending_supervisor._original_control_lease(
                            operation_kind='store'):
                        second_events = after_pending_supervisor._journal.read()['events']
                    self.assertEqual(second_events, before_retry_events)
                    self.assertEqual(len([event for event in second_events
                        if event['kind'] == 'originals-store-creation-intent'
                        and event['payload'].get('reservationDigest')
                            == external_payload['reservationDigest']]), 1)
                    self.assertEqual(len([event for event in second_events
                        if event['kind'] == 'native-effect-intent'
                        and event['payload'].get('scope') == 'native-store-creation'
                        and event['payload'].get('requestDigest')
                            == store_request._intent_digest]), 1)
                    second_pending_outcome = after_pending.authority.observe_original_request(
                        after_pending.authority.authority_context,
                        store_request._effect_key)
                    self.assertEqual(second_pending_outcome.approval_id,
                                     pending_outcome.approval_id)
                    self.assertEqual(second_pending_outcome.intent_digest,
                                     pending_outcome.intent_digest)
                    self.assertEqual(second_pending_outcome.approval_status, 'consumed')
                    self.assertEqual(second_pending_outcome.effect_status, 'effect-pending')
                    self.assertEqual(second_pending_outcome.effect_digest,
                                     pending_outcome.effect_digest)
                    self.assertEqual(db.ddl, ddl_before_recovery)
                    self.assertIsNone(after_pending_supervisor.custody_handle)
                    self.assertIsNone(pending_provider._creation_reservation)
                    self.assertIsNone(pending_provider._creation_capability)
                    self.assertIsNone(pending_provider._schema_oid)
                    with patch.object(native.LocalPostgresSupervisor,
                                      '_validate_installation_binaries', autospec=True,
                                      return_value=(profile.postgres_binary,
                                                    profile.initdb_binary)), \
                         patch.object(native, '_sha_file', return_value='b' * 64):
                        with self.assertRaisesRegex(
                                native.LocalPostgresError,
                                'original-creation-already-exists'):
                            after_pending.prepare_target_creation()

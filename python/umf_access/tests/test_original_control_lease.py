# SPDX-License-Identifier: MIT OR Apache-2.0
"""Bounded source controls for the shared original owner setup lease."""
from __future__ import annotations

import base64
import fcntl
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import test_owner_ledger_birth_recovery as birth_fixture
from umf_access.lifecycle import ingress_local_postgres as native
from umf_access.lifecycle import owner_bootstrap as bootstrap
from umf_access.lifecycle.owner_authority import (
    _SIGNATURE_DOMAIN,
    _canonical_bytes,
    create_owner_authority_session,
)


@contextmanager
def _synthetic_control_lease(supervisor, operation_kind):
    lease = SimpleNamespace(_operation_kind=operation_kind)
    object.__setattr__(supervisor, '_active_control_lease', lease)
    with patch('umf_access.lifecycle.ingress_local_postgres._resolve_original_control_lease',
               return_value=lease):
        try:
            yield lease
        finally:
            object.__setattr__(supervisor, '_active_control_lease', None)


class OriginalControlLeaseTests(unittest.TestCase):
    @unittest.skipUnless(hasattr(os, 'fork'), 'requires a fork-capable host')
    def test_forked_normal_context_exit_does_not_release_parent_flock(self) -> None:
        temporary, _root, control, _profile, _enrollment, _raw, ledger, _setup = (
            birth_fixture.OwnerLedgerBirthRecoveryTests()._fixture())

        def probe(path: Path) -> bytes:
            read_fd, write_fd = os.pipe()
            child = os.fork()
            if child == 0:
                os.close(read_fd)
                fd = os.open(path, os.O_RDWR)
                try:
                    try:
                        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        os.write(write_fd, b'blocked')
                    else:
                        fcntl.flock(fd, fcntl.LOCK_UN)
                        os.write(write_fd, b'acquired')
                finally:
                    os.close(fd)
                    os.close(write_fd)
                os._exit(0)
            os.close(write_fd)
            result = os.read(read_fd, 16)
            os.close(read_fd)
            _pid, status = os.waitpid(child, 0)
            self.assertEqual(os.waitstatus_to_exitcode(status), 0)
            return result

        def inherited_context_exits(context_factory, path: Path) -> None:
            child_exit = False
            with context_factory():
                child = os.fork()
                if child == 0:
                    # Returning normally runs the inherited context manager's
                    # cleanup in the child while the parent's lease is active.
                    child_exit = True
                else:
                    _pid, status = os.waitpid(child, 0)
                    self.assertEqual(os.waitstatus_to_exitcode(status), 0)
                    self.assertEqual(probe(path), b'blocked')
            if child_exit:
                os._exit(0)

        try:
            setup_path = control / bootstrap._OWNER_SETUP_LOCK
            inherited_context_exits(
                lambda: bootstrap._owner_setup_lease(control, timeout_ms=1000),
                setup_path)
            self.assertEqual(probe(setup_path), b'acquired')

            resource_path = ledger.with_name(ledger.name + '.lock')
            bootstrap._create_empty_private(resource_path)
            inherited_context_exits(
                lambda: bootstrap._owner_resource_lease(
                    resource_path, 'owner-approval-ledger-lock-invalid'),
                resource_path)
            self.assertEqual(probe(resource_path), b'acquired')
        finally:
            temporary.cleanup()

    def test_lock_replacement_during_real_prepare_refuses_before_request_or_return(self) -> None:
        temporary, _root, control, profile, _enrollment, _raw, ledger, _setup = (
            birth_fixture.OwnerLedgerBirthRecoveryTests()._fixture())
        try:
            with patch.object(native, '_DarwinProcessObserver', return_value=object()):
                session = create_owner_authority_session(profile, ledger_path=ledger)
            lock = control / bootstrap._OWNER_SETUP_LOCK
            before = ledger.read_bytes()

            def replace_during_binary_observation():
                lock.unlink()
                lock.write_bytes(b'')
                os.chmod(lock, 0o600)
                return profile.postgres_binary, profile.initdb_binary

            with (patch.object(native.LocalPostgresSupervisor,
                               '_validate_installation_binaries',
                               side_effect=replace_during_binary_observation),
                  patch.object(native, '_sha_file', return_value='a' * 64),
                  self.assertRaises(bootstrap.LocalPostgresError)):
                session.prepare_target_creation()
            self.assertEqual(ledger.read_bytes(), before)
            self.assertEqual(session.supervisor._pending_creations, {})
            self.assertIsNone(session.supervisor._active_control_lease)
        finally:
            temporary.cleanup()

    def test_copied_supervisor_projection_cannot_acquire_original_lease(self) -> None:
        temporary, _root, _control, profile, _enrollment, _raw, ledger, _setup = (
            birth_fixture.OwnerLedgerBirthRecoveryTests()._fixture())
        try:
            with patch.object(native, '_DarwinProcessObserver', return_value=object()):
                session = create_owner_authority_session(profile, ledger_path=ledger)
            real = session.supervisor
            copied = SimpleNamespace(**{
                name: getattr(real, name) for name in (
                    '_bootstrap_issuer', '_authority_context', '_profile',
                    '_supervisor_id', '_custodian_id', '_provider_id',
                    '_bound_installation_id', '_owner_core')})
            with (self.assertRaisesRegex(
                    native.LocalPostgresError,
                    'owner-bootstrap-control-lease-unverified'),
                  bootstrap._acquire_original_control_lease(
                      real._bootstrap_issuer, real._authority_context, copied,
                      operation_kind='target-prepare', timeout_ms=100)):
                self.fail('copied supervisor projection acquired original lease')
        finally:
            temporary.cleanup()

    def test_database_stage_uses_actual_original_pending_outcome_shape(self) -> None:
        from umf_access.lifecycle.ingress_local_postgres import (
            _BOOTSTRAP_ISSUER_SEAL,
            _canonical,
            _OriginalNativeTarget,
            _PendingTargetCreation,
            _PreparedOriginalPrincipals,
        )

        temporary, _root, _control, profile, _enrollment, _raw, ledger, _setup = (
            birth_fixture.OwnerLedgerBirthRecoveryTests()._fixture(
                owner_scopes=('local-target-creation', 'native-principal-preparation')))
        try:
            with patch.object(native, '_DarwinProcessObserver', return_value=object()):
                session = create_owner_authority_session(profile, ledger_path=ledger)
            supervisor = session.supervisor
            def flags(*, login=False, superuser=False):
                return {'canLogin': login, 'superuser': superuser,
                        'createDatabase': False, 'createRole': False,
                        'replication': False, 'bypassRls': False, 'inherit': False}
            prep_id = '89898989-8989-4989-8989-898989898989'
            owner = 'synthetic_owner'
            intent = {
                'profile': 'umf.local-postgresql-principal-preparation/0.1',
                'preparationId': prep_id, 'supervisorId': profile.supervisor_id,
                'custodianId': profile.custodian_id, 'providerId': profile.provider_id,
                'installationId': profile.installation_id,
                'creationRequestDigest': 'a' * 64, 'creationApprovalDigest': 'b' * 64,
                'bootstrapOriginDigest': 'c' * 64,
                'bootstrapDatabase': {'oid': 1, 'name': 'postgres',
                                      'systemIdentifier': '123456'},
                'maintenanceBefore': {'oid': 10, 'name': 'umf_maintenance',
                                      'flags': flags(login=True, superuser=True)},
                'maintenanceAfter': {'name': 'umf_maintenance',
                                     'operation': 'alter-bootstrap',
                                     'flags': flags(login=True, superuser=True)},
                'controller': {'name': 'umf_controller', 'operation': 'create-absent',
                               'flags': flags(superuser=True)},
                'businessOwner': {'name': owner, 'operation': 'create-absent',
                                  'flags': flags()},
                'applicationDatabase': {'name': 'synthetic_app', 'ownerName': owner,
                                        'encoding': 'UTF8', 'locale': 'C',
                                        'operation': 'create-absent'},
                'memberships': [
                    {'memberName': 'umf_maintenance', 'roleName': 'umf_controller',
                     'inherit': False, 'set': True, 'admin': False},
                    {'memberName': 'umf_maintenance', 'roleName': owner,
                     'inherit': False, 'set': True, 'admin': False}],
                'maximumRoles': 3,
            }
            request = session.authority.prepare_request(
                'native-principal-preparation', _canonical_bytes(intent),
                context=supervisor.authority_context)
            exported = session.authority.export_signing_request(request)
            signer = birth_fixture.signing_key_for_fixture(profile.control_home)
            signature = signer.sign(_SIGNATURE_DOMAIN + _canonical_bytes(exported['payload']))
            envelope = {'payload': exported['payload'],
                        'signature': base64.urlsafe_b64encode(signature)
                        .decode('ascii').rstrip('=')}
            approval = session.authority.verify_approval(request, envelope)
            event = {'sequence': 1, 'recordDigest': 'd' * 64,
                     'kind': 'principal-request-prepared', 'payload': {'intent': intent}}

            class Journal:
                def __init__(self):
                    self.events = [event]
                def read(self):
                    return {'events': list(self.events)}
                def append(self, kind, payload):
                    body = {'sequence': len(self.events) + 1, 'kind': kind,
                            'payload': payload}
                    body['recordDigest'] = native._digest(body)
                    self.events.append(body)
                    return body

            supervisor._journal = Journal()
            with supervisor._original_control_lease(operation_kind='principals-apply'):
                reservation = supervisor._make_native_effect_reservation(
                    request, approval, 'native-principal-preparation', request.effect_key,
                    profile.purpose, None, event, _canonical_bytes(intent))
                binding = session.bind_native_effect(approval, reservation)
                effect_handle = session._pending_effect_handle(binding)
            pending = _PendingTargetCreation(
                _BOOTSTRAP_ISSUER_SEAL, supervisor, request, _canonical_bytes(intent))
            target = _OriginalNativeTarget(
                _BOOTSTRAP_ISSUER_SEAL, supervisor, pending, reservation,
                '55555555-5555-4555-8555-555555555555')
            supervisor._native_targets[id(target)] = target
            prepared = _PreparedOriginalPrincipals(
                _BOOTSTRAP_ISSUER_SEAL, supervisor, target, request,
                _canonical(intent), {'intent': intent})
            supervisor._principal_preparations[id(prepared)] = prepared
            supervisor._principal_dispatches[id(prepared)] = reservation

            class Connection:
                autocommit = False
                def __enter__(self):
                    return self
                def __exit__(self, *_args):
                    return False
                def execute(self, sql, _params=None):
                    if sql.startswith('CREATE DATABASE'):
                        return SimpleNamespace(fetchone=lambda: None)
                    if 'pg_database' in sql:
                        return SimpleNamespace(fetchone=lambda: (
                            42, 'synthetic_app', 'C', 'C', 'synthetic_owner'))
                    return SimpleNamespace(fetchone=lambda: ('987654321',))

            with (patch.object(native.LocalPostgresSupervisor,
                               '_connect_maintenance',
                               return_value=Connection()),
                  supervisor._original_control_lease(operation_kind='principals-apply')):
                actual = supervisor._create_application_database(prepared, effect_handle)
            self.assertEqual(actual, {'oid': 42, 'name': 'synthetic_app',
                                      'systemIdentifier': '987654321'})
        finally:
            temporary.cleanup()

    def test_config_write_cannot_be_authorized_by_lease_alone(self) -> None:
        temporary, _root, _control, profile, _enrollment, _raw, ledger, _setup = (
            birth_fixture.OwnerLedgerBirthRecoveryTests()._fixture())
        try:
            with patch.object(native, '_DarwinProcessObserver', return_value=object()):
                session = create_owner_authority_session(profile, ledger_path=ledger)
            supervisor = session.supervisor
            sentinel = profile.control_home / 'must-not-exist.conf'
            values = {'configPath': sentinel, 'config': b'unapproved'}
            with (supervisor._original_control_lease(operation_kind='target-apply'),
                  patch.object(native.subprocess, 'Popen', side_effect=AssertionError),
                  self.assertRaisesRegex(
                      native.LocalPostgresError,
                      'local-postgresql-original-creation-not-reserved')):
                supervisor._write_creation_config(values, None, None, None)
            self.assertFalse(sentinel.exists())
            with (supervisor._original_control_lease(operation_kind='target-apply'),
                  patch.object(native.subprocess, 'Popen', side_effect=AssertionError),
                  self.assertRaisesRegex(
                      native.LocalPostgresError,
                      'local-postgresql-postmaster-operation-unverified')):
                supervisor._launch_postmaster(
                    profile.postgres_binary, profile.data_home,
                    profile.control_home / 'postgresql.conf',
                    profile.control_home / 'pg_hba.conf',
                    profile.control_home / 'pg_ident.conf', 'a' * 64, 'b' * 64,
                    launch_number=1)
            with (supervisor._original_control_lease(operation_kind='principals-apply'),
                  patch.object(native.LocalPostgresSupervisor,
                               '_connect_maintenance', side_effect=AssertionError),
                  self.assertRaisesRegex(
                      native.LocalPostgresError,
                      'local-postgresql-principal-preparation-unverified')):
                supervisor._create_application_database(None, None)
        finally:
            temporary.cleanup()

    def test_bootstrap_issuer_cannot_be_rebound_to_another_supervisor(self) -> None:
        temporary, _root, _control, profile, _enrollment, _raw, ledger, _setup = (
            birth_fixture.OwnerLedgerBirthRecoveryTests()._fixture())
        try:
            with patch.object(native, '_DarwinProcessObserver', return_value=object()):
                session = create_owner_authority_session(profile, ledger_path=ledger)
                supervisor = session.supervisor
                with self.assertRaisesRegex(
                        native.LocalPostgresError,
                        'local-postgresql-original-supervisor-binding-invalid'):
                    native.LocalPostgresSupervisor(
                        profile, owner_core=supervisor._owner_core,
                        authority_context=supervisor.authority_context,
                        bootstrap_issuer=supervisor._bootstrap_issuer)
            self.assertIs(supervisor._bootstrap_issuer._supervisor, supervisor)
        finally:
            temporary.cleanup()

    def test_failed_supervisor_construction_does_not_register_native_origin(self) -> None:
        temporary, _root, _control, profile, _enrollment, _raw, ledger, _setup = (
            birth_fixture.OwnerLedgerBirthRecoveryTests()._fixture())
        try:
            with patch.object(native, '_DarwinProcessObserver', return_value=object()):
                session = create_owner_authority_session(profile, ledger_path=ledger)
            before = dict(native._NATIVE_SUPERVISORS)
            with (patch.object(native, '_DarwinProcessObserver',
                               side_effect=RuntimeError('controlled observer failure')),
                  self.assertRaisesRegex(RuntimeError, 'controlled observer failure')):
                native.LocalPostgresSupervisor(
                    profile, owner_core=session.supervisor._owner_core,
                    authority_context=session.supervisor.authority_context,
                    bootstrap_issuer=session.supervisor._bootstrap_issuer)
            self.assertEqual(native._NATIVE_SUPERVISORS, before)
        finally:
            temporary.cleanup()

    @unittest.skipUnless(hasattr(os, 'fork'), 'requires a fork-capable host')
    def test_forked_supervisor_copy_is_not_original_native_origin(self) -> None:
        temporary, _root, _control, profile, _enrollment, _raw, ledger, _setup = (
            birth_fixture.OwnerLedgerBirthRecoveryTests()._fixture())
        read_fd, write_fd = os.pipe()
        try:
            with patch.object(native, '_DarwinProcessObserver', return_value=object()):
                supervisor = create_owner_authority_session(
                    profile, ledger_path=ledger).supervisor
            child = os.fork()
            if child == 0:
                os.close(read_fd)
                try:
                    supervisor._require_native_supervisor_origin()
                except native.LocalPostgresError as error:
                    os.write(write_fd, str(error).encode('ascii'))
                    os._exit(0)
                os.write(write_fd, b'origin-accepted')
                os._exit(1)
            os.close(write_fd)
            outcome = os.read(read_fd, 128)
            _pid, status = os.waitpid(child, 0)
            self.assertEqual(os.waitstatus_to_exitcode(status), 0)
            self.assertEqual(
                outcome, b'local-postgresql-native-supervisor-origin-unverified')
        finally:
            for fd in (read_fd, write_fd):
                try:
                    os.close(fd)
                except OSError:
                    pass
            temporary.cleanup()

    def test_private_first_effect_helpers_refuse_without_original_operation_lease(self) -> None:
        temporary, _root, _control, profile, _enrollment, _raw, ledger, _setup = (
            birth_fixture.OwnerLedgerBirthRecoveryTests()._fixture())
        try:
            with patch.object(native, '_DarwinProcessObserver', return_value=object()):
                session = create_owner_authority_session(profile, ledger_path=ledger)
            supervisor = session.supervisor
            calls: list[str] = []
            self.assertFalse(hasattr(supervisor, '_cleanup_unstarted_target'))
            with patch.object(native.subprocess, 'Popen',
                              side_effect=lambda *_a, **_k: calls.append('popen')):
                cases = (
                    lambda: supervisor._run_target_creation(None, None, {}, None),
                    lambda: supervisor._finalize_recovered_principal_receipt(
                        None, {}, {}, {}),
                    lambda: supervisor._run_bounded_child(
                        ['never-run'], profile.control_home / 'never.log', 1,
                        allowed_binaries=set()),
                    lambda: supervisor._terminate_owned_child(None, set()),
                    supervisor._restart_same_target_under_lease,
                    lambda: supervisor._launch_postmaster(
                        profile.postgres_binary, profile.data_home,
                        profile.control_home / 'config', profile.control_home / 'hba',
                        profile.control_home / 'ident', 'a' * 64, 'b' * 64,
                        launch_number=1),
                    supervisor._stop_postmaster,
                )
                for operation in cases:
                    with self.assertRaisesRegex(
                            native.LocalPostgresError,
                            'local-postgresql-control-lease-required'):
                        operation()
            self.assertEqual(calls, [])
            self.assertFalse((profile.control_home / 'never.log').exists())
            child = SimpleNamespace(pid=987_654, poll=lambda: None)
            with (_synthetic_control_lease(supervisor, 'target-apply'),
                  patch.object(native.os, 'killpg', side_effect=lambda *_: calls.append('kill')),
                  self.assertRaisesRegex(
                      native.LocalPostgresError,
                      'local-postgresql-child-ownership-unknown')):
                supervisor._terminate_owned_child(
                    child, {str(profile.initdb_binary), str(profile.postgres_binary)})
            self.assertEqual(calls, [])
        finally:
            temporary.cleanup()

    def test_timeout_is_exact_integer_and_lock_is_never_created_or_adopted(self) -> None:
        with tempfile.TemporaryDirectory(prefix='umf-control-lock-input-') as raw:
            control = Path(raw).resolve()
            os.chmod(control, 0o700)
            lock = control / bootstrap._OWNER_SETUP_LOCK
            lock.write_bytes(b'')
            os.chmod(lock, 0o600)
            before = (lock.stat().st_dev, lock.stat().st_ino, lock.stat().st_mode,
                      lock.stat().st_size)
            for timeout in (True, 0, 30_001, '5'):
                with (self.subTest(timeout=timeout), self.assertRaisesRegex(
                        bootstrap.LocalPostgresError,
                        'owner-bootstrap-setup-lock-timeout-invalid'),
                      bootstrap._owner_setup_lease(control, timeout_ms=timeout)):
                    self.fail('invalid acquisition budget was accepted')
            after = (lock.stat().st_dev, lock.stat().st_ino, lock.stat().st_mode,
                     lock.stat().st_size)
            self.assertEqual(after, before)
            lock.unlink()
            lock.symlink_to(control / 'missing-target')
            with (self.assertRaises(bootstrap.LocalPostgresError),
                  bootstrap._owner_setup_lease(control, timeout_ms=50)):
                self.fail('a symlink lock was followed')
            self.assertTrue(lock.is_symlink())

    def test_original_supervisor_lease_reentry_is_same_registered_object(self) -> None:
        temporary, _root, _control, profile, _enrollment, _raw, path, _setup = (
            birth_fixture.OwnerLedgerBirthRecoveryTests()._fixture())
        try:
            with patch.object(native, '_DarwinProcessObserver', return_value=object()):
                session = create_owner_authority_session(profile, ledger_path=path)
            supervisor = session.supervisor
            with self.assertRaisesRegex(
                    native.LocalPostgresError,
                    'local-postgresql-control-lease-required'):
                supervisor.prepare_target_creation()
            with patch.object(native.LocalPostgresSupervisor,
                              '_validate_installation_binaries',
                              return_value=(profile.postgres_binary, profile.initdb_binary)), \
                    patch.object(native, '_sha_file', return_value='a' * 64):
                pending, request = session.prepare_target_creation()
            self.assertIs(supervisor._pending_creations[id(pending)], pending)
            self.assertIs(request, pending._request)
            self.assertIsNone(supervisor._active_control_lease)
            with supervisor._original_control_lease(
                    operation_kind='target-prepare', timeout_ms=1000) as lease:
                self.assertIs(supervisor._require_original_control_lease(
                    lease, operation_kind='target-prepare'), lease)
                with supervisor._reuse_original_control_lease(
                        lease, operation_kind='target-prepare') as reused:
                    self.assertIs(reused, lease)
                with self.assertRaisesRegex(
                        native.LocalPostgresError,
                        'owner-bootstrap-control-lease-unverified'):
                    bootstrap._resolve_original_control_lease(
                        object(), context=session.authority_context,
                        supervisor=supervisor, operation_kind='target-prepare')
                with (self.assertRaisesRegex(
                        native.LocalPostgresError,
                        'local-postgresql-control-lease-kind-mismatch'),
                      supervisor._reuse_original_control_lease(
                          lease, operation_kind='target-apply')):
                    self.fail('a lease changed operation kind')
                start = time.monotonic()
                with (self.assertRaisesRegex(
                        bootstrap.LocalPostgresError,
                        'owner-bootstrap-setup-lock-timeout'),
                      bootstrap._owner_setup_lease(
                          profile.control_home, timeout_ms=35)):
                    self.fail('same-thread second acquisition reentered the lock')
                self.assertLess(time.monotonic() - start, 0.5)
            with self.assertRaisesRegex(
                    native.LocalPostgresError,
                    'owner-bootstrap-control-lease-unverified'):
                bootstrap._resolve_original_control_lease(
                    lease, context=session.authority_context,
                    supervisor=supervisor, operation_kind='target-prepare')
        finally:
            temporary.cleanup()

    def test_setup_lock_serializes_threads_and_uses_one_acquisition_budget(self) -> None:
        with tempfile.TemporaryDirectory(prefix='umf-control-lock-thread-') as raw:
            control = Path(raw).resolve()
            os.chmod(control, 0o700)
            lock = control / bootstrap._OWNER_SETUP_LOCK
            lock.write_bytes(b'')
            os.chmod(lock, 0o600)
            completed: list[str] = []
            with bootstrap._owner_setup_lease(control, timeout_ms=500):
                worker = threading.Thread(target=lambda: self._try_lock(
                    control, completed, timeout_ms=50))
                worker.start()
                worker.join(timeout=1)
                self.assertFalse(worker.is_alive())
            self.assertEqual(completed, ['owner-bootstrap-setup-lock-timeout'])

    def test_setup_lock_rejects_path_replacement_and_closed_descriptor(self) -> None:
        with tempfile.TemporaryDirectory(prefix='umf-control-lock-identity-') as raw:
            control = Path(raw).resolve()
            os.chmod(control, 0o700)
            lock = control / bootstrap._OWNER_SETUP_LOCK
            lock.write_bytes(b'')
            os.chmod(lock, 0o600)
            with bootstrap._owner_setup_lease(control, timeout_ms=500) as handle:
                original = (handle.device, handle.inode)
                lock.unlink()
                lock.write_bytes(b'')
                os.chmod(lock, 0o600)
                self.assertNotEqual((lock.stat().st_dev, lock.stat().st_ino), original)
                with self.assertRaisesRegex(
                        bootstrap.LocalPostgresError,
                        'owner-bootstrap-setup-lock-invalid'):
                    bootstrap._verify_owner_setup_lock_handle(handle)
            with self.assertRaisesRegex(
                    bootstrap.LocalPostgresError,
                    'owner-bootstrap-setup-lock-unavailable'):
                bootstrap._verify_owner_setup_lock_handle(handle)

    def test_setup_lock_serializes_processes_without_creating_or_replacing_lock(self) -> None:
        temporary, _root, control, _profile, _enrollment, _raw, _path, _setup = (
            birth_fixture.OwnerLedgerBirthRecoveryTests()._fixture())
        try:
            lock = control / bootstrap._OWNER_SETUP_LOCK
            before = lock.stat()
            child_code = '''
from pathlib import Path
import sys
from umf_access.lifecycle.owner_bootstrap import LocalPostgresError, _owner_setup_lease
try:
    with _owner_setup_lease(Path(sys.argv[1]), timeout_ms=80):
        print('acquired')
except LocalPostgresError as error:
    print(error.code)
'''
            env = os.environ.copy()
            env['PYTHONDONTWRITEBYTECODE'] = '1'
            with bootstrap._owner_setup_lease(control, timeout_ms=1000):
                result = subprocess.run(
                    [sys.executable, '-B', '-c', child_code, str(control)],
                    text=True, capture_output=True, timeout=2, env=env, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), 'owner-bootstrap-setup-lock-timeout')
            after = lock.stat()
            self.assertEqual((before.st_dev, before.st_ino, before.st_mode, before.st_size),
                             (after.st_dev, after.st_ino, after.st_mode, after.st_size))
        finally:
            temporary.cleanup()

    @staticmethod
    def _try_lock(control: Path, completed: list[str], *, timeout_ms: int) -> None:
        try:
            with bootstrap._owner_setup_lease(control, timeout_ms=timeout_ms):
                completed.append('acquired')
        except bootstrap.LocalPostgresError as error:
            completed.append(error.code)


if __name__ == '__main__':
    unittest.main()

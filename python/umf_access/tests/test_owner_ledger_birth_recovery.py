# SPDX-License-Identifier: MIT OR Apache-2.0
"""Source controls for original primary owner-bootstrap context0.3 setup."""
from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from owner_bootstrap_setup_fixture import install_pending_owner_setup
from umf_access.lifecycle import ingress_local_postgres as native
from umf_access.lifecycle import owner_bootstrap as bootstrap
from umf_access.lifecycle.owner_authority import create_owner_authority_session

_FIXTURE_SIGNERS: dict[Path, Ed25519PrivateKey] = {}


def signing_key_for_fixture(control_home: Path) -> Ed25519PrivateKey:
    return _FIXTURE_SIGNERS[control_home]


class OwnerLedgerBirthRecoveryTests(unittest.TestCase):
    def _fixture(self, *, generation_roots: bool = False,
                 owner_scopes: tuple[str, ...] = ('local-target-creation',)):
        temporary = tempfile.TemporaryDirectory(prefix='umf-owner-setup-')
        root = Path(temporary.name).resolve()
        os.chmod(root, 0o700)
        control, data = root / 'control', root / 'data'
        control.mkdir(mode=0o700); data.mkdir(mode=0o700)
        private = Ed25519PrivateKey.generate()
        public = private.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        ids = {
            'supervisor': '12121212-1212-4212-8212-121212121212',
            'custodian': '23232323-2323-4232-8232-232323232323',
            'provider': '34343434-3434-4434-8434-343434343434',
            'authority': '45454545-4545-4454-8454-454545454545',
            'enrollment': '56565656-5656-4565-8565-565656565656',
            'installation': 'ledger-birth-installation',
        }
        config = {
            'profile': 'umf.configured-owner-authority/0.1',
            'authorityId': ids['authority'], 'policyRevision': 'ledger-birth-source-control',
            'purpose': 'native-acceptance',
            'keys': [{
                'keyId': 'ledger-birth-key',
                'publicKey': base64.urlsafe_b64encode(public).decode('ascii').rstrip('='),
                'principalId': 'ledger-birth-owner',
                'scopes': list(owner_scopes),
                'supervisorIds': [ids['supervisor']],
                'providerIds': [ids['provider']],
                'installationIds': [ids['installation']],
            }],
        }
        with patch.object(native, 'sys_platform_darwin', return_value=True):
            profile = native.LocalPostgresProfile(
                control_home=control, data_home=data,
                postgres_binary=root / 'postgres', initdb_binary=root / 'initdb',
                process_observer=root / 'observer', process_observer_sha256='a' * 64,
                port=55441, database_name='ledger_birth_db',
                business_owner='ledger_birth_owner', custodian_id=ids['custodian'],
                supervisor_id=ids['supervisor'], provider_id=ids['provider'],
                installation_id=ids['installation'], purpose='native-acceptance')
        enrollment = {
            'profile': ('umf.local-owner-bootstrap-enrollment/0.2' if generation_roots
                        else 'umf.local-owner-bootstrap-enrollment/0.1'),
            'enrollmentId': ids['enrollment'], 'purpose': 'native-acceptance',
            'context': {'custodianId': ids['custodian'], 'supervisorId': ids['supervisor'],
                        'providerId': ids['provider'], 'installationId': ids['installation']},
            'ownerConfiguration': config, 'nativeProfile': native._profile_to_enrollment(profile),
        }
        if generation_roots:
            enrollment['generationAuthorityRoots'] = {
                'profile': 'umf.generation-authority-root-policy/0.1',
                'authorityId': '67676767-6767-4676-8676-676767676767',
                'policyRevision': 'root-policy-1',
                'keys': [{
                    'keyId': 'generation-root-key',
                    'publicKey': base64.urlsafe_b64encode(public).decode('ascii').rstrip('='),
                    'principalId': 'generation-root-owner',
                    'logicalAuthorityIds': ['78787878-7878-4787-8787-787878787878'],
                    'configurationProfiles': [
                        'umf.configured-generation-enrollment-authority/0.1'],
                }],
            }
        enrollment_bytes = bootstrap._canonical(enrollment)
        bootstrap._write_private(control / 'owner-bootstrap-enrollment.json', enrollment_bytes)
        _FIXTURE_SIGNERS[control] = private
        path = control / 'owner-approvals.jsonl'
        setup = install_pending_owner_setup(
            control, enrollment, enrollment_bytes, path,
            generation_registry_id=('89898989-8989-4989-8989-898989898989'
                                    if generation_roots else None))
        return temporary, root, control, profile, enrollment, enrollment_bytes, path, setup

    def test_invalid_setup_and_resource_leases_close_descriptors_and_preserve_errors(self) -> None:
        with tempfile.TemporaryDirectory(prefix='umf-owner-lease-fd-') as directory:
            root = Path(directory).resolve()
            setup_lock = root / bootstrap._OWNER_SETUP_LOCK
            setup_lock.write_bytes(b''); os.chmod(setup_lock, 0o644)
            resource_lock = root / 'resource.lock'
            resource_lock.write_bytes(b''); os.chmod(resource_lock, 0o644)
            opened: list[int] = []
            real_open = os.open

            def tracked_open(path, flags, *args, **kwargs):
                descriptor = real_open(path, flags, *args, **kwargs)
                opened.append(descriptor)
                return descriptor

            with patch.object(bootstrap.os, 'open', side_effect=tracked_open):
                with self.assertRaisesRegex(
                        bootstrap.LocalPostgresError,
                        'owner-bootstrap-setup-lock-invalid'), bootstrap._owner_setup_lease(root):
                    self.fail('invalid setup lock acquired')
                with self.assertRaisesRegex(
                        bootstrap.LocalPostgresError,
                        'owner-approval-ledger-lock-invalid'), bootstrap._owner_resource_lease(
                            resource_lock, 'owner-approval-ledger-lock-invalid'):
                    self.fail('invalid resource lock acquired')
            self.assertEqual(len(opened), 2)
            for descriptor in opened:
                with self.assertRaises(OSError):
                    os.fstat(descriptor)

            valid_lock = root / 'valid.lock'
            valid_lock.write_bytes(b''); os.chmod(valid_lock, 0o600)
            expected_error = bootstrap.LocalPostgresError('protected-body-error')
            with self.assertRaises(bootstrap.LocalPostgresError) as caught, \
                    bootstrap._owner_resource_lease(
                        valid_lock, 'owner-approval-ledger-lock-invalid'):
                raise expected_error
            self.assertIs(caught.exception, expected_error)

    def _subprocess_open(self, root: Path, control: Path, path: Path) -> subprocess.CompletedProcess[str]:
        code = r'''
import json, sys
from pathlib import Path
from unittest.mock import patch
from umf_access.lifecycle import ingress_local_postgres as native
from umf_access.lifecycle.owner_authority import create_owner_authority_session
root, control, ledger = map(Path, sys.argv[1:])
with patch.object(native, '_DarwinProcessObserver', return_value=object()):
    profile = native.LocalPostgresProfile(
        control_home=control, data_home=root/'data', postgres_binary=root/'postgres',
        initdb_binary=root/'initdb', process_observer=root/'observer',
        process_observer_sha256='a'*64, port=55441, database_name='ledger_birth_db',
        business_owner='ledger_birth_owner',
        custodian_id='23232323-2323-4232-8232-232323232323',
        supervisor_id='12121212-1212-4212-8212-121212121212',
        provider_id='34343434-3434-4434-8434-343434343434',
        installation_id='ledger-birth-installation', purpose='native-acceptance')
    session = create_owner_authority_session(profile, ledger_path=ledger)
    context = json.loads((control/'owner-bootstrap-context.json').read_bytes())
    print(json.dumps({'state':context['state'],'setupId':context['setupId'],
        'ledgerId':context['ownerLedger']['ledgerId'],
        'ledgerPath':session.authority._core._ledger.path.as_posix()}))
'''
        env = os.environ.copy()
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        return subprocess.run([sys.executable, '-B', '-c', code, str(root), str(control), str(path)],
                              text=True, capture_output=True, env=env, check=False)

    def test_pending_initial_header_resumes_in_new_process_at_original_path(self) -> None:
        temporary, root, control, profile, enrollment, _raw, path, original = self._fixture()
        try:
            expected_header = bootstrap._owner_header_bytes(
                enrollment, original['authorityConfigurationDigest'])
            with (patch.object(bootstrap, '_atomic_replace_private',
                               side_effect=OSError('simulated process loss before confirmation')),
                  patch.object(native, '_DarwinProcessObserver', return_value=object()),
                  self.assertRaises(OSError)):
                create_owner_authority_session(profile, ledger_path=path)
            pending = json.loads((control / 'owner-bootstrap-context.json').read_bytes())
            self.assertEqual(pending, original)
            self.assertEqual(path.read_bytes(), expected_header)
            self.assertFalse((control / 'owner-approval-ledger-birth.json').exists())
            self.assertFalse((control / 'owner-approval-ledger-anchor.json').exists())
            resumed = self._subprocess_open(root, control, path)
            self.assertEqual(resumed.returncode, 0, resumed.stderr)
            result = json.loads(resumed.stdout)
            self.assertEqual(result['state'], 'confirmed')
            self.assertEqual(result['setupId'], original['setupId'])
            self.assertEqual(result['ledgerId'], original['ownerLedger']['ledgerId'])
            self.assertEqual(result['ledgerPath'], str(path))
        finally:
            temporary.cleanup()

    def test_confirmed_context_ignores_both_obsolete_sidecars_but_refuses_lost_resources(self) -> None:
        temporary, root, control, profile, _enrollment, _raw, path, _original = self._fixture()
        try:
            for old in ('owner-approval-ledger-birth.json', 'owner-approval-ledger-anchor.json'):
                bootstrap._write_private(control / old, b'obsolete and non-authoritative')
            for old in ('owner-approval-ledger-birth.json', 'owner-approval-ledger-anchor.json'):
                (control / old).unlink()
            result = self._subprocess_open(root, control, path)
            self.assertEqual(result.returncode, 0, result.stderr)
            for old in ('owner-approval-ledger-birth.json', 'owner-approval-ledger-anchor.json'):
                self.assertFalse((control / old).exists())
            # Caller-selected alternate paths cannot replace the original primary binding.
            alternate = control / 'alternate.jsonl'
            with (patch.object(native, '_DarwinProcessObserver', return_value=object()),
                  self.assertRaisesRegex(bootstrap.LocalPostgresError,
                                         'owner-approval-ledger-path-mismatch')):
                create_owner_authority_session(profile, ledger_path=alternate)
            self.assertFalse(alternate.exists())
            original_ledger = path.read_bytes()
            path.unlink()
            with (patch.object(native, '_DarwinProcessObserver', return_value=object()),
                  self.assertRaisesRegex(bootstrap.LocalPostgresError,
                                         'owner-approval-ledger-birth-incomplete')):
                create_owner_authority_session(profile, ledger_path=path)
            self.assertFalse(path.exists())
            self.assertNotEqual(original_ledger, b'')
        finally:
            temporary.cleanup()

    def test_crash_after_primary_confirmation_reopens_same_ids_without_sidecars(self) -> None:
        temporary, root, control, profile, enrollment, _raw, path, original = self._fixture()
        try:
            replace = bootstrap._atomic_replace_private

            def confirm_then_lose_return(target, data):
                replace(target, data)
                raise OSError('simulated crash after durable primary confirmation')

            with patch.object(bootstrap, '_atomic_replace_private',
                              side_effect=confirm_then_lose_return), \
                    patch.object(native, '_DarwinProcessObserver', return_value=object()), \
                    self.assertRaisesRegex(OSError, 'simulated crash'):
                create_owner_authority_session(profile, ledger_path=path)
            confirmed = json.loads((control / 'owner-bootstrap-context.json').read_bytes())
            self.assertEqual(confirmed['state'], 'confirmed')
            self.assertEqual(confirmed['setupId'], original['setupId'])
            self.assertEqual(confirmed['ownerLedger'], original['ownerLedger'])
            self.assertEqual(path.read_bytes(), bootstrap._owner_header_bytes(
                enrollment, original['authorityConfigurationDigest']))
            resumed = self._subprocess_open(root, control, path)
            self.assertEqual(resumed.returncode, 0, resumed.stderr)
            result = json.loads(resumed.stdout)
            self.assertEqual(result['setupId'], original['setupId'])
            self.assertEqual(result['ledgerId'], original['ownerLedger']['ledgerId'])
            self.assertEqual(result['ledgerPath'], str(path))
            self.assertFalse((control / 'owner-approval-ledger-birth.json').exists())
            self.assertFalse((control / 'owner-approval-ledger-anchor.json').exists())
        finally:
            temporary.cleanup()

    def test_pending_prefix_is_completed_and_single_primary_transition_confirms(self) -> None:
        temporary, _root, control, profile, enrollment, _raw, path, original = self._fixture()
        try:
            expected = bootstrap._owner_header_bytes(
                enrollment, original['authorityConfigurationDigest'])
            path.write_bytes(expected[:13]); os.chmod(path, 0o600)
            with patch.object(native, '_DarwinProcessObserver', return_value=object()):
                session = create_owner_authority_session(profile, ledger_path=path)
            confirmed = json.loads((control / 'owner-bootstrap-context.json').read_bytes())
            self.assertEqual(confirmed['state'], 'confirmed')
            self.assertEqual(confirmed['setupId'], original['setupId'])
            self.assertEqual(confirmed['ownerLedger']['ledgerId'], original['ownerLedger']['ledgerId'])
            self.assertTrue(path.read_bytes().startswith(expected))
            self.assertEqual(session.authority._core._ledger.path, path)
            lock = Path(confirmed['ownerLedger']['lockPath'])
            lock.unlink()
            with (patch.object(native, '_DarwinProcessObserver', return_value=object()),
                  self.assertRaisesRegex(bootstrap.LocalPostgresError,
                                         'owner-approval-ledger-birth-incomplete')):
                create_owner_authority_session(profile, ledger_path=path)
            self.assertFalse(lock.exists())
        finally:
            temporary.cleanup()

    def test_two_processes_share_one_pending_setup_and_enrollment02_composes_roots(self) -> None:
        temporary, root, control, _profile, _enrollment, _raw, path, original = self._fixture(
            generation_roots=True)
        try:
            first = subprocess.Popen(
                [sys.executable, '-B', '-c', self._subprocess_code(), str(root), str(control), str(path)],
                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
            second = subprocess.Popen(
                [sys.executable, '-B', '-c', self._subprocess_code(), str(root), str(control), str(path)],
                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
            out1, err1 = first.communicate(timeout=20); out2, err2 = second.communicate(timeout=20)
            self.assertEqual(first.returncode, 0, err1)
            self.assertEqual(second.returncode, 0, err2)
            a, b = json.loads(out1), json.loads(out2)
            self.assertEqual((a['setupId'], a['ledgerId']),
                             (original['setupId'], original['ownerLedger']['ledgerId']))
            self.assertEqual((b['setupId'], b['ledgerId']),
                             (original['setupId'], original['ownerLedger']['ledgerId']))
            setup = json.loads((control / 'owner-bootstrap-context.json').read_bytes())
            self.assertEqual(setup['generationAuthority']['rootPolicyDigest'],
                             original['generationAuthority']['rootPolicyDigest'])
            birth = setup['generationAuthority']['registryBirth']
            registry_bytes = Path(birth['registryPath']).read_bytes()
            self.assertEqual(registry_bytes, bootstrap._initial_generation_registry(
                birth['registryId'], birth['anchorDigest']))
            self.assertEqual(Path(birth['lockPath']).read_bytes(), b'')
        finally:
            temporary.cleanup()

    @staticmethod
    def _subprocess_code() -> str:
        return r'''
import json, sys
from pathlib import Path
from unittest.mock import patch
from umf_access.lifecycle import ingress_local_postgres as native
from umf_access.lifecycle.owner_authority import create_owner_authority_session
root, control, ledger = map(Path, sys.argv[1:])
with patch.object(native, '_DarwinProcessObserver', return_value=object()):
    profile = native.LocalPostgresProfile(
        control_home=control, data_home=root/'data', postgres_binary=root/'postgres',
        initdb_binary=root/'initdb', process_observer=root/'observer',
        process_observer_sha256='a'*64, port=55441, database_name='ledger_birth_db',
        business_owner='ledger_birth_owner',
        custodian_id='23232323-2323-4232-8232-232323232323',
        supervisor_id='12121212-1212-4212-8212-121212121212',
        provider_id='34343434-3434-4434-8434-343434343434',
        installation_id='ledger-birth-installation', purpose='native-acceptance')
    session=create_owner_authority_session(profile, ledger_path=ledger)
    setup=json.loads((control/'owner-bootstrap-context.json').read_bytes())
    print(json.dumps({'setupId':setup['setupId'],'ledgerId':setup['ownerLedger']['ledgerId'],
        'generationAuthority':setup['generationAuthority'],
        'ledgerPath':session.authority._core._ledger.path.as_posix()}))
'''


if __name__ == '__main__':
    unittest.main()

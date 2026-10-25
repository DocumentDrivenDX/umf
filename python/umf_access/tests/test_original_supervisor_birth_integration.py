# SPDX-License-Identifier: MIT OR Apache-2.0
"""Source-only end-to-end selection of the enrolled .2 supervisor journal."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from owner_bootstrap_setup_fixture import install_pending_owner_setup
from umf_access.lifecycle import ingress_local_postgres as native
from umf_access.lifecycle import owner_bootstrap as bootstrap
from umf_access.lifecycle import supervisor_journal_codec as codec
from umf_access.lifecycle.owner_approval_core import OwnerApprovalCore


class OriginalSupervisorBirthIntegrationTests(unittest.TestCase):
    def _exercise_confirmed_enrollment_birth(self, *, fresh_target_custody: bool):
        with tempfile.TemporaryDirectory(prefix='umf-owner-journal-03-') as temporary:
            root = Path(temporary).resolve()
            control_home = root / 'control'
            data_home = root / 'data'
            control_home.mkdir(mode=0o700)
            data_home.mkdir(mode=0o700)
            os.chmod(control_home, 0o700)
            os.chmod(data_home, 0o700)
            supervisor_id = str(uuid.uuid4())
            custodian_id = str(uuid.uuid4())
            provider_id = str(uuid.uuid4())
            configuration_private = Ed25519PrivateKey.generate()
            configuration_public = configuration_private.public_key().public_bytes(
                serialization.Encoding.Raw, serialization.PublicFormat.Raw)
            configuration = {
                'profile': 'umf.configured-owner-authority/0.1',
                'authorityId': str(uuid.uuid4()),
                'policyRevision': 'test-owner-policy',
                'purpose': 'native-acceptance',
                'keys': [{
                    'keyId': 'owner-key',
                    'publicKey': base64.urlsafe_b64encode(configuration_public)
                        .decode('ascii').rstrip('='),
                    'principalId': 'test-owner',
                    'scopes': ['local-target-creation'],
                    'supervisorIds': [supervisor_id],
                    'providerIds': [provider_id],
                    'installationIds': ['installed-test'],
                }],
            }
            root_private = Ed25519PrivateKey.generate()
            root_public = root_private.public_key().public_bytes(
                serialization.Encoding.Raw, serialization.PublicFormat.Raw)
            roots = {
                'profile': 'umf.generation-authority-root-policy/0.1',
                'authorityId': str(uuid.uuid4()),
                'policyRevision': 'test-root-policy',
                'keys': [{
                    'keyId': 'root-key',
                    'publicKey': base64.urlsafe_b64encode(root_public)
                        .decode('ascii').rstrip('='),
                    'principalId': 'test-root',
                    'logicalAuthorityIds': [configuration['authorityId']],
                    'configurationProfiles': ['umf.configured-generation-enrollment-authority/0.1'],
                }],
            }
            context = {
                'custodianId': custodian_id, 'supervisorId': supervisor_id,
                'providerId': provider_id, 'installationId': 'installed-test',
            }
            profile = native.LocalPostgresProfile(
                control_home=control_home, data_home=data_home,
                postgres_binary=root / 'postgres', initdb_binary=root / 'initdb',
                process_observer=root / 'observer', process_observer_sha256='a' * 64,
                port=55439, database_name='umf_test', business_owner='umf_owner',
                custodian_id=custodian_id, supervisor_id=supervisor_id,
                provider_id=provider_id, installation_id='installed-test',
                purpose='native-acceptance')
            enrollment_native_profile = native._profile_to_enrollment(profile)
            if fresh_target_custody:
                enrollment_native_profile['custodianId'] = custodian_id
            definition = {
                'profile': codec.DEFINITION_PROFILE,
                'journalProfile': codec.JOURNAL_PROFILE_02,
                'physicalEvents': 'umf.supervisor-physical-events/0.2',
                'rootEvents': 'umf.supervisor-generation-root-events/0.1',
                'originalsEvents': 'umf.supervisor-originals-store-events/0.1',
                'ingressEvents': None, 'applicationEvents': None,
            }
            definition_digest = hashlib.sha256(codec.canonical(definition)).hexdigest()
            journal_id = str(uuid.uuid4())
            journal_path, lock_path = codec.expected_paths(str(control_home), supervisor_id)
            root_policy_digest = hashlib.sha256(codec.canonical(roots)).hexdigest()
            birth_anchor = {
                'profile': codec.ANCHOR_PROFILE,
                'enrollmentId': str(uuid.uuid4()),
                'purpose': 'native-acceptance', 'context': context,
                'authorityConfigurationDigest': hashlib.sha256(
                    codec.canonical(configuration)).hexdigest(),
                'nativeProfileDigest': hashlib.sha256(codec.canonical(
                    enrollment_native_profile)).hexdigest(),
                'generationRootPolicyDigest': root_policy_digest,
                'journalId': journal_id, 'path': journal_path,
                'lockPath': lock_path, 'definitionDigest': definition_digest,
            }
            enrollment_id = birth_anchor['enrollmentId']
            anchor_digest = hashlib.sha256(codec.canonical(birth_anchor)).hexdigest()
            initial = codec.initial_record(
                supervisor_id=supervisor_id, journal_id=journal_id,
                definition_digest=definition_digest, anchor_digest=anchor_digest)
            birth = {
                'profile': codec.BIRTH_PROFILE,
                'journalProfile': codec.JOURNAL_PROFILE_02,
                'journalId': journal_id, 'supervisorId': supervisor_id,
                'definition': definition, 'definitionDigest': definition_digest,
                'path': journal_path, 'lockPath': lock_path,
                'anchorDigest': anchor_digest,
                'initialHeaderDigest': hashlib.sha256(initial).hexdigest(),
            }
            target_birth = None
            if fresh_target_custody:
                target_definition = {
                    'profile': codec.TARGET_CUSTODY_DEFINITION_PROFILE,
                    'journalProfile': codec.TARGET_CUSTODY_JOURNAL_PROFILE_02,
                    'eventKinds': list(codec.TARGET_CUSTODY_EVENT_KINDS),
                }
                target_header = {
                    'profile': codec.TARGET_CUSTODY_JOURNAL_PROFILE_02,
                    'custodianId': custodian_id, 'sequence': 0,
                    'headDigest': '0' * 64, 'events': [],
                }
                target_path = str(control_home / 'target-custody.json')
                target_birth = {
                    'profile': codec.TARGET_CUSTODY_BIRTH_PROFILE,
                    'journalProfile': codec.TARGET_CUSTODY_JOURNAL_PROFILE_02,
                    'custodianId': custodian_id, 'supervisorId': supervisor_id,
                    'path': target_path, 'lockPath': target_path + '.lock',
                    'definition': target_definition,
                    'definitionDigest': hashlib.sha256(
                        codec.canonical(target_definition)).hexdigest(),
                    'initialHeaderDigest': hashlib.sha256(
                        codec.canonical(target_header)).hexdigest(),
                }
                codec.validate_target_custody_birth(
                    target_birth, enrollment={
                        'profile': codec.ENROLLMENT_05,
                        'context': context,
                        'nativeProfile': enrollment_native_profile,
                    })
            enrollment = {
                'profile': (codec.ENROLLMENT_05 if fresh_target_custody
                            else codec.ENROLLMENT_03),
                'enrollmentId': enrollment_id,
                'purpose': 'native-acceptance', 'context': context,
                'ownerConfiguration': configuration,
                'nativeProfile': enrollment_native_profile,
                'generationAuthorityRoots': roots,
                'supervisorJournalBirth': birth,
            }
            if target_birth is not None:
                enrollment['targetCustodyJournalBirth'] = target_birth
            enrollment_path = control_home / 'owner-bootstrap-enrollment.json'
            enrollment_raw = bootstrap._canonical(enrollment)
            bootstrap._write_private(enrollment_path, enrollment_raw)
            owner_ledger = control_home / 'original-owner-approvals.jsonl'
            install_pending_owner_setup(
                control_home, enrollment, enrollment_raw, owner_ledger,
                generation_registry_id=str(uuid.uuid4()))
            with patch.object(native, 'sys_platform_darwin', return_value=True):
                bootstrap._settle_original_owner_setup(profile, owner_ledger)
                issuer = native._issue_local_owner_bootstrap_issuer(profile)
                if target_birth is not None:
                    target_birth_handle = bootstrap._target_custody_journal_birth_for_issuer(
                        issuer)
                    self.assertIsNotNone(target_birth_handle)
                    self.assertEqual(Path(target_birth['path']).read_bytes(),
                                     codec.canonical(target_header))
                authority_context = bootstrap._issue_owner_authority_context(
                    issuer, hashlib.sha256(codec.canonical(configuration)).hexdigest())
                self.addCleanup(native._BOOTSTRAP_ISSUERS.pop, id(issuer), None)
                self.addCleanup(bootstrap._SUPERVISOR_JOURNAL_BIRTHS.pop, id(issuer), None)
                self.addCleanup(bootstrap._CONTEXTS.pop, id(authority_context), None)
                self.addCleanup(bootstrap._CONTEXT_JOURNAL_METADATA.pop,
                                id(authority_context), None)
                owner_core = OwnerApprovalCore(
                    configuration, ledger_path=owner_ledger, context=authority_context)
                with patch.object(native, '_DarwinProcessObserver', return_value=object()):
                    supervisor = native.LocalPostgresSupervisor(
                        profile, owner_core=owner_core,
                        authority_context=authority_context, bootstrap_issuer=issuer)
                postgres = root / 'postgres'
                initdb = root / 'initdb'
                postgres.write_bytes(b'fake pinned postgres executable')
                initdb.write_bytes(b'fake pinned initdb executable')
                with (patch.object(native.LocalPostgresSupervisor,
                                   '_validate_installation_binaries',
                                   return_value=(postgres, initdb)),
                      patch.object(native, '_sha_file', return_value='b' * 64),
                      supervisor._original_control_lease(operation_kind='target-prepare')):
                    pending, _approval_request = supervisor.prepare_target_creation()
                    request = pending._request
                    request_intent = json.loads(request._intent_bytes)
                    self.assertEqual(request._scope, 'local-target-creation')
                    self.assertEqual(request_intent['profile'],
                                     'umf.local-postgresql-create-request/0.2')
                    self.assertEqual(request_intent['supervisorJournalBirthDigest'],
                                     hashlib.sha256(codec.canonical(birth)).hexdigest())
                    context_raw = bootstrap._read_private(
                        control_home / 'owner-bootstrap-context.json')
                    self.assertEqual(request_intent['ownerBootstrapContextDigest'],
                                     hashlib.sha256(context_raw).hexdigest())
                    journal = supervisor._journal
                    self.assertEqual(journal.profile, codec.JOURNAL_PROFILE_02)
                    self.assertEqual(journal.read()['events'], [])
                    self.assertTrue(Path(journal_path).is_file())
                    self.assertEqual(Path(journal_path).read_bytes(), initial)
                    self.assertFalse((control_home / supervisor_id.replace('-', '')).exists())
                exported = owner_core.export_signing_request(request)['payload']
                signature = configuration_private.sign(
                    b'umf.host-owner-approval/0.1\x00' + codec.canonical(exported))
                envelope = {
                    'payload': exported,
                    'signature': base64.urlsafe_b64encode(signature)
                        .decode('ascii').rstrip('='),
                }
                approval = owner_core.verify_approval(request, envelope)
                creation_intent = dict(request_intent)
                creation_intent.update({
                    'purpose': profile.purpose,
                    'requestDigest': request._intent_digest,
                    'approvalId': approval.approval_id,
                    'approvalDigest': approval.approval_digest,
                })
                with supervisor._original_control_lease(operation_kind='target-apply'):
                    event = supervisor._append_supervisor_journal(
                        'creation-intent', creation_intent)
                    self.assertEqual(event['kind'], 'creation-intent')
                    stored = supervisor._select_supervisor_journal().read()['events'][0]
                    self.assertEqual(stored['payload'], creation_intent)
                    self.assertEqual(stored['payload']['supervisorJournalBirthDigest'],
                                     hashlib.sha256(codec.canonical(birth)).hexdigest())
                    self.assertEqual(stored['payload']['ownerBootstrapContextDigest'],
                                     hashlib.sha256(context_raw).hexdigest())
                original_journal_bytes = Path(journal_path).read_bytes()
                Path(journal_path).unlink()
                with self.assertRaisesRegex(
                        native.LocalPostgresError, 'supervisor-journal-birth-incomplete'):
                    native._issue_local_owner_bootstrap_issuer(profile)
                self.assertFalse((control_home / supervisor_id.replace('-', '')).exists())
                bootstrap._write_private(Path(journal_path), original_journal_bytes)
                lock_path_obj = Path(lock_path)
                original_lock_bytes = lock_path_obj.read_bytes()
                lock_path_obj.unlink()
                with self.assertRaisesRegex(
                        native.LocalPostgresError, 'supervisor-journal-birth-incomplete'):
                    native._issue_local_owner_bootstrap_issuer(profile)
                self.assertFalse(lock_path_obj.exists())
                lock_path_obj.write_bytes(original_lock_bytes)
                os.chmod(lock_path_obj, 0o600)
                reattached_issuer = native._issue_local_owner_bootstrap_issuer(profile)
                reattached_context = bootstrap._issue_owner_authority_context(
                    reattached_issuer,
                    hashlib.sha256(codec.canonical(configuration)).hexdigest())
                self.addCleanup(native._BOOTSTRAP_ISSUERS.pop, id(reattached_issuer), None)
                self.addCleanup(bootstrap._SUPERVISOR_JOURNAL_BIRTHS.pop,
                                id(reattached_issuer), None)
                self.addCleanup(bootstrap._CONTEXTS.pop, id(reattached_context), None)
                self.addCleanup(bootstrap._CONTEXT_JOURNAL_METADATA.pop,
                                id(reattached_context), None)
                reattached_core = OwnerApprovalCore(
                    configuration, ledger_path=owner_ledger, context=reattached_context)
                with patch.object(native, '_DarwinProcessObserver', return_value=object()):
                    reattached = native.LocalPostgresSupervisor(
                        profile, owner_core=reattached_core,
                        authority_context=reattached_context,
                        bootstrap_issuer=reattached_issuer)
                if target_birth is not None:
                    self.assertIsNotNone(
                        bootstrap._target_custody_journal_birth_for_issuer(
                            reattached_issuer))
                self.addCleanup(native._NATIVE_SUPERVISORS.pop, id(reattached), None)
                with reattached._original_control_lease(operation_kind='target-recover'):
                    outcome = reattached.observe_original_owner_request(
                        'local-target-creation')
                    self.assertEqual(outcome.approval_id, request._approval_id)
                    self.assertEqual(outcome.scope, 'local-target-creation')
                    self.assertEqual(outcome.intent_digest, request._intent_digest)
                    self.assertEqual(outcome.approval_status, 'consumed')
                    self.assertEqual(outcome.effect_status, 'prepared')
            native._NATIVE_SUPERVISORS.pop(id(supervisor), None)
            self.addCleanup(native._NATIVE_SUPERVISORS.pop, id(supervisor), None)

    def test_confirmed_03_enrollment_selects_signed_creation_02_without_native_effects(self):
        self._exercise_confirmed_enrollment_birth(fresh_target_custody=False)

    def test_confirmed_05_enrollment_binds_fresh_target_custody_birth(self):
        self._exercise_confirmed_enrollment_birth(fresh_target_custody=True)


if __name__ == '__main__':
    unittest.main()

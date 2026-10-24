# SPDX-License-Identifier: MIT OR Apache-2.0
"""Source controls binding original root requests to the physical .3 context."""
from __future__ import annotations

import copy
import hashlib
import json
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import test_generation_enrollment_authority as enrollment_tests
import test_owner_ledger_birth_recovery as ledger_tests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from owner_bootstrap_setup_fixture import install_pending_owner_setup
from umf_access.lifecycle import ingress_local_postgres as native
from umf_access.lifecycle import owner_bootstrap as bootstrap
from umf_access.lifecycle.owner_authority import create_owner_authority_session


class GenerationAuthorityPhysicalBindingTests(unittest.TestCase):
    def _case(self, *, state: str, mutation: str | None) -> str:
        fixture = ledger_tests.OwnerLedgerBirthRecoveryTests()
        temporary, _root, control, profile, enrollment, _enrollment_bytes, path, _setup = (
            fixture._fixture(generation_roots=True))
        root_fixture = enrollment_tests.GenerationEnrollmentAuthorityTests()
        root_fixture.setUp()
        try:
            raw, policy, _registry_id, _anchor = root_fixture._root_registry(confirmed=False)
            registry = enrollment_tests.root_authority._parse(raw)
            request = registry['requests'][0]
            signing_key = Ed25519PrivateKey.generate()
            public_key = signing_key.public_key().public_bytes(
                serialization.Encoding.Raw, serialization.PublicFormat.Raw)
            policy['keys'][0]['publicKey'] = enrollment_tests.authority._b64encode_bytes(public_key)

            # The generation root policy is present in the original installation record
            # before the first fixed session opens its native-free fixture boundary.
            enrollment['generationAuthorityRoots'] = policy
            for name in ('owner-bootstrap-enrollment.json',
                         'owner-bootstrap-context.json', 'owner-bootstrap-setup.lock'):
                (control / name).unlink()
            enrollment_bytes = bootstrap._canonical(enrollment)
            bootstrap._write_private(control / 'owner-bootstrap-enrollment.json',
                                     enrollment_bytes)
            install_pending_owner_setup(
                control, enrollment, enrollment_bytes, path,
                generation_registry_id=str(uuid.uuid4()))
            with (patch.object(native, 'sys_platform_darwin', return_value=True),
                  patch.object(native, '_DarwinProcessObserver', return_value=object())):
                create_owner_authority_session(profile, ledger_path=path)

            physical_raw = (control / 'owner-bootstrap-context.json').read_bytes()
            physical = json.loads(physical_raw)
            birth = physical['generationAuthority']['registryBirth']
            cfg = request['intent']['configuration']
            cfg.update(enrollment['context'])
            cfg['storeId'] = cfg['providerId']
            cfg['targetCustody']['custodianId'] = cfg['custodianId']
            cfg['purpose'] = enrollment['purpose']
            request['effectKey'] = [
                'enroll-generation-authority', enrollment['enrollmentId'],
                cfg['providerId'], cfg['installationId'], cfg['authorityId'],
                cfg['policyRevision'],
            ]
            trust = request['intent']['trust']
            trust.update(enrollment['context'])
            trust['ownerBootstrapContextDigest'] = hashlib.sha256(physical_raw).hexdigest()
            request['payload'].update(
                bootstrapEnrollmentId=enrollment['enrollmentId'],
                purpose=enrollment['purpose'],
                rootPolicyDigest=hashlib.sha256(
                    enrollment_tests.root_authority._root_canonical(policy)).hexdigest(),
                **enrollment['context'])

            if mutation == 'physical-digest':
                trust['ownerBootstrapContextDigest'] = 'f' * 64
            elif mutation in {'supervisorId', 'custodianId', 'providerId', 'installationId'}:
                replacement = ('foreign-installation' if mutation == 'installationId'
                               else str(uuid.uuid4()))
                cfg[mutation] = replacement
                trust[mutation] = replacement
                request['payload'][mutation] = replacement
                if mutation == 'custodianId':
                    cfg['targetCustody'][mutation] = replacement
                if mutation == 'providerId':
                    cfg['storeId'] = replacement
                    request['effectKey'][2] = replacement
                if mutation == 'installationId':
                    request['effectKey'][3] = replacement
            elif mutation is not None:
                raise AssertionError(f'unrecognized fixture mutation: {mutation}')

            intent = request['intent']
            config_digest = hashlib.sha256(enrollment_tests.root_authority._root_canonical(cfg)).hexdigest()
            intent['configurationDigest'] = config_digest
            trust['configurationDigest'] = config_digest
            trust['targetCustodyDigest'] = hashlib.sha256(
                enrollment_tests.root_authority._root_canonical(cfg['targetCustody'])).hexdigest()
            request['payload']['intentDigest'] = hashlib.sha256(
                enrollment_tests.root_authority._root_canonical(intent)).hexdigest()

            confirmed = state == 'confirmed'
            request['state'] = state
            request['confirmedSequence'] = 2 if confirmed else None
            request['reservedSequence'] = 1
            request['approvalEnvelope'] = None
            registry['sequence'] = 2 if confirmed else 1
            registry['registryId'] = birth['registryId']
            registry['anchorDigest'] = birth['anchorDigest']
            registry['enrollments'] = []
            if confirmed:
                payload = copy.deepcopy(request['payload'])
                signature = signing_key.sign(
                    enrollment_tests.root_authority.ROOT_APPROVAL_PROFILE.encode('ascii') + b'\x00'
                    + enrollment_tests.root_authority._root_canonical(payload, maximum=16_384))
                envelope = {'payload': payload,
                            'signature': enrollment_tests.authority._b64encode_bytes(signature)}
                request['approvalEnvelope'] = envelope
                registry['enrollments'].append({
                    'profile': enrollment_tests.root_authority.ROOT_ENROLLMENT_PROFILE,
                    'enrollmentId': request['enrollmentId'],
                    'requestId': request['requestId'],
                    'contextId': request['contextId'],
                    'bootstrapEnrollmentId': enrollment['enrollmentId'],
                    'rootPolicyDigest': payload['rootPolicyDigest'],
                    'rootApprovalDigest': hashlib.sha256(
                        enrollment_tests.root_authority._root_canonical(envelope)).hexdigest(),
                    'trust': copy.deepcopy(trust), 'configuration': copy.deepcopy(cfg),
                    'configurationDigest': intent['configurationDigest'],
                    'nativeEvidenceDigest': intent['nativeEvidenceDigest'],
                    'state': 'confirmed', 'registrySequence': 2,
                })
            candidate = enrollment_tests.root_authority._root_canonical(registry)
            enrollment_tests.root_authority.validate_registry(
                candidate, registry_id=birth['registryId'],
                anchor_digest=birth['anchorDigest'], root_policy=policy,
                purpose=enrollment['purpose'],
                bootstrap_enrollment_id=enrollment['enrollmentId'])
            bootstrap._write_private(Path(birth['registryPath']), candidate, exclusive=False)

            try:
                with (patch.object(native, 'sys_platform_darwin', return_value=True),
                      patch.object(native, '_DarwinProcessObserver', return_value=object())):
                    create_owner_authority_session(profile, ledger_path=path)
                return 'accepted'
            except native.LocalPostgresError as exc:
                return f'refused:{exc.code}'
        finally:
            root_fixture.tearDown()
            temporary.cleanup()

    def test_prepared_and_confirmed_requests_require_original_physical_context(self) -> None:
        for state in ('prepared', 'confirmed'):
            with self.subTest(state=state, mutation=None):
                self.assertEqual(self._case(state=state, mutation=None), 'accepted')
            for mutation in ('physical-digest', 'supervisorId', 'custodianId',
                             'providerId', 'installationId'):
                with self.subTest(state=state, mutation=mutation):
                    self.assertEqual(
                        self._case(state=state, mutation=mutation),
                        'refused:generation-authority-registry-birth-incomplete')


if __name__ == '__main__':
    unittest.main()

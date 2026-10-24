from __future__ import annotations

import copy
import hashlib
import itertools
import unittest
import uuid
from collections import UserDict
from unittest import mock

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from umf_access.lifecycle import generation_authority_bootstrap as root
from umf_access.lifecycle import generation_enrollment_authority as authority
from umf_access.lifecycle.generation_root_registry import (
    confirm_prepared,
    reserve_prepared,
)


def uid() -> str:
    return str(uuid.uuid4())


def digest(value: object) -> str:
    return hashlib.sha256(root._root_canonical(value)).hexdigest()


class RootRegistryTransitionsTests(unittest.TestCase):
    def setUp(self) -> None:
        import test_generation_enrollment_authority as enrollment_tests
        self.fixture = enrollment_tests.GenerationEnrollmentAuthorityTests()
        self.fixture.setUp()
        self.private = Ed25519PrivateKey.generate()
        public = self.private.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.policy = {
            'profile': root.ROOT_POLICY_PROFILE, 'authorityId': uid(),
            'policyRevision': 'transition-policy-1', 'keys': [{
                'keyId': 'root-key', 'publicKey': authority._b64encode_bytes(public),
                'principalId': 'operator-service', 'logicalAuthorityIds': [],
                'configurationProfiles': [authority.AUTHORITY_PROFILE],
            }],
        }
        self.bootstrap_id = uid()
        self.registry_id = uid()
        self.anchor = digest({'anchor': self.registry_id})
        self.raw = root.initial_registry_bytes(self.registry_id, self.anchor)
        self.requests = [self._prepared(i) for i in (1, 2)]
        policy_digest = digest(self.policy)
        for request in self.requests:
            request['payload']['rootPolicyDigest'] = policy_digest

    def tearDown(self) -> None:
        self.fixture.tearDown()

    def _prepared(self, sequence: int) -> dict[str, object]:
        _raw, _policy, _rid, _anchor = self.fixture._root_registry(confirmed=False)
        item = root._parse(_raw)['requests'][0]
        cfg = copy.deepcopy(self.fixture.config)
        cfg['authorityId'] = uid()
        self.policy['keys'][0]['logicalAuthorityIds'].append(cfg['authorityId'])
        enrollment_id = uid(); context_id = uid()
        trust = item['intent']['trust']
        trust.update({'enrollmentId': enrollment_id,
                      'configurationDigest': digest(cfg),
                      'custodySequence': sequence})
        intent = item['intent']
        intent.update({'contextId': context_id, 'configuration': cfg,
                       'configurationDigest': digest(cfg)})
        payload = item['payload']
        payload.update({'approvalId': uid(), 'rootAuthorityId': self.policy['authorityId'],
                        'rootPolicyRevision': self.policy['policyRevision'],
                        'rootPolicyDigest': digest(self.policy),
                        'intentDigest': digest(intent),
                        'bootstrapEnrollmentId': self.bootstrap_id})
        item.update({'requestId': uid(), 'enrollmentId': enrollment_id,
                     'contextId': context_id,
                     'effectKey': ['enroll-generation-authority', self.bootstrap_id,
                                   cfg['providerId'], cfg['installationId'],
                                   cfg['authorityId'], cfg['policyRevision']],
                     'reservedSequence': sequence, 'confirmedSequence': None,
                     'approvalEnvelope': None, 'state': 'prepared'})
        return item

    def _sign(self, request: dict[str, object]) -> dict[str, object]:
        payload = copy.deepcopy(request['payload'])
        message = root.ROOT_APPROVAL_PROFILE.encode('ascii') + b'\x00' + root._root_canonical(payload, maximum=16_384)
        return {'payload': payload, 'signature': authority._b64encode_bytes(self.private.sign(message))}

    def _args(self) -> dict[str, object]:
        return {'registry_id': self.registry_id, 'anchor_digest': self.anchor,
                'root_policy': self.policy, 'purpose': self.fixture.config['purpose'],
                'bootstrap_enrollment_id': self.bootstrap_id}

    def test_reserve_confirm_all_orders_and_exact_replay(self) -> None:
        for order in itertools.permutations(self.requests):
            with self.subTest(confirmationOrder=[item['requestId'] for item in order]):
                raw = self.raw
                for request in self.requests:
                    raw = reserve_prepared(raw, request, **self._args())
                after_reserve = raw
                for request in self.requests:
                    raw = reserve_prepared(raw, request, **self._args())
                    self.assertEqual(raw, after_reserve)
                for request in order:
                    envelope = self._sign(request)
                    raw = confirm_prepared(raw, request['requestId'], envelope, **self._args())
                    self.assertEqual(
                        confirm_prepared(raw, request['requestId'], envelope, **self._args()),
                        raw)
                registry = root._parse(raw)
                self.assertEqual(registry['sequence'], 4)
                self.assertEqual([r['reservedSequence'] for r in registry['requests']], [1, 2])
                self.assertEqual(
                    [entry['registrySequence'] for entry in registry['enrollments']], [3, 4])
                self.assertEqual(
                    [entry['requestId'] for entry in registry['enrollments']],
                    [request['requestId'] for request in order])

    def test_changed_occupied_request_or_effect_refuses(self) -> None:
        request = self.requests[0]
        self.raw = reserve_prepared(self.raw, request, **self._args())
        altered = copy.deepcopy(request); altered['payload']['purpose'] = 'production'
        with self.assertRaises(root.GenerationAuthorityBootstrapError):
            reserve_prepared(self.raw, altered, **self._args())
        other = self._prepared(2); other['effectKey'] = list(request['effectKey'])
        with self.assertRaises(root.GenerationAuthorityBootstrapError):
            reserve_prepared(self.raw, other, **self._args())

    def test_changed_signature_or_unknown_request_refuses(self) -> None:
        request = self.requests[0]
        self.raw = reserve_prepared(self.raw, request, **self._args())
        envelope = self._sign(request)
        bad = copy.deepcopy(envelope); bad['signature'] = authority._b64encode_bytes(bytes(64))
        with self.assertRaises(root.GenerationAuthorityBootstrapError):
            confirm_prepared(self.raw, request['requestId'], bad, **self._args())
        valid = self._sign(request)
        self.raw = confirm_prepared(self.raw, request['requestId'], valid, **self._args())
        with self.assertRaises(root.GenerationAuthorityBootstrapError):
            confirm_prepared(self.raw, request['requestId'], bad, **self._args())
        with self.assertRaises(root.GenerationAuthorityBootstrapError):
            confirm_prepared(self.raw, uid(), envelope, **self._args())

    def test_inputs_and_unaffected_registry_are_not_mutated(self) -> None:
        request = self.requests[0]; before = copy.deepcopy(request)
        raw_before = self.raw
        updated = reserve_prepared(self.raw, request, **self._args())
        self.assertEqual(request, before)
        self.assertEqual(self.raw, raw_before)
        self.assertNotEqual(updated, raw_before)
        self.assertEqual(root._parse(updated)['requests'][0], request)

    def test_policy_and_anchor_mismatch_refuse(self) -> None:
        request = self.requests[0]
        self.raw = reserve_prepared(self.raw, request, **self._args())
        altered = copy.deepcopy(self.policy); altered['policyRevision'] = 'changed'
        with self.assertRaises(root.GenerationAuthorityBootstrapError):
            reserve_prepared(self.raw, self.requests[1], **{**self._args(), 'root_policy': altered})
        with self.assertRaises(root.GenerationAuthorityBootstrapError):
            reserve_prepared(self.raw, self.requests[1], **{**self._args(), 'anchor_digest': digest('other')})

    def test_sequence_gap_and_request_capacity_refuse(self) -> None:
        with self.assertRaises(root.GenerationAuthorityBootstrapError):
            reserve_prepared(self.raw, self.requests[1], **self._args())
        with (mock.patch.object(root, '_MAX_REQUESTS', 0),
              self.assertRaises(root.GenerationAuthorityBootstrapError)):
            reserve_prepared(self.raw, self.requests[0], **self._args())

    def test_replay_rejects_bool_float_nested_counter_and_unhashable_effect(self) -> None:
        request = self.requests[0]
        self.raw = reserve_prepared(self.raw, request, **self._args())
        for malformed in (True, 1.0):
            candidate = copy.deepcopy(request)
            candidate['reservedSequence'] = malformed
            with (self.subTest(reservedSequence=malformed),
                  self.assertRaises(root.GenerationAuthorityBootstrapError)):
                reserve_prepared(self.raw, candidate, **self._args())
        malformed_effect = copy.deepcopy(request)
        malformed_effect['effectKey'][2] = ['unhashable']
        with self.assertRaises(root.GenerationAuthorityBootstrapError):
            reserve_prepared(self.raw, malformed_effect, **self._args())
        nonplain_nested = copy.deepcopy(request)
        nonplain_nested['intent'] = UserDict(nonplain_nested['intent'])
        with self.assertRaises(root.GenerationAuthorityBootstrapError):
            reserve_prepared(self.raw, nonplain_nested, **self._args())

    def test_confirmed_replay_compares_canonical_envelope_bytes(self) -> None:
        request = self.requests[0]
        self.raw = reserve_prepared(self.raw, request, **self._args())
        envelope = self._sign(request)
        self.raw = confirm_prepared(self.raw, request['requestId'], envelope, **self._args())
        self.assertEqual(
            confirm_prepared(self.raw, request['requestId'], envelope, **self._args()),
            self.raw)
        for spoof in (True, 1.0):
            altered = copy.deepcopy(envelope)
            altered['payload']['unrecognizedCounter'] = spoof
            with (self.subTest(unrecognizedCounter=spoof),
                  self.assertRaises(root.GenerationAuthorityBootstrapError)):
                confirm_prepared(self.raw, request['requestId'], altered, **self._args())

    def test_enrollment_capacity_refuses_confirmation(self) -> None:
        request = self.requests[0]
        self.raw = reserve_prepared(self.raw, request, **self._args())
        with (mock.patch.object(root, '_MAX_ENROLLMENTS', 0),
              self.assertRaises(root.GenerationAuthorityBootstrapError)):
            confirm_prepared(self.raw, request['requestId'], self._sign(request),
                             **self._args())


if __name__ == '__main__':
    unittest.main()

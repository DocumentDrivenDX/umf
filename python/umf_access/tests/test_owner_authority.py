# SPDX-License-Identifier: MIT OR Apache-2.0
"""Configured owner signature, request custody, and durable replay controls."""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import os
import pickle
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from umf_access.lifecycle.owner_authority import (
    _SIGNATURE_DOMAIN,
    ConfiguredEd25519OwnerAuthority,
    OwnerAuthorityError,
)
from umf_access.native_program import canonical_json


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('ascii').rstrip('=')


def _hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class OwnerAuthorityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='umf-owner-authority-')
        self.root = Path(self.temp.name).resolve()
        os.chmod(self.root, 0o700)
        self.private_key = Ed25519PrivateKey.generate()
        self.public_key = self.private_key.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.config = self._config()
        self.authority = ConfiguredEd25519OwnerAuthority(
            self.config, ledger_path=self.root / 'approval-ledger.jsonl')
        self.intent = self._intent()
        self.intent_bytes = canonical_json(self.intent).encode('utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def _config(self, *, public_key: bytes | None = None, scopes=None,
                supervisor_ids=None, provider_ids=None, installation_ids=None):
        return {
            'profile': 'umf.configured-owner-authority/0.1',
            'authorityId': '11111111-1111-4111-8111-111111111111',
            'policyRevision': 'policy-2026-10',
            'keys': [{
                'keyId': 'owner-key-1', 'publicKey': _b64(public_key or self.public_key),
                'principalId': 'owner-service-prod',
                'scopes': scopes or ['native-store-creation'],
                'supervisorIds': supervisor_ids or ['22222222-2222-4222-8222-222222222222'],
                'providerIds': provider_ids or ['33333333-3333-4333-8333-333333333333'],
                'installationIds': installation_ids or ['installation-a'],
            }],
        }

    def _intent(self):
        flags = {'canLogin': True, 'superuser': False, 'createDatabase': False,
                 'createRole': False, 'replication': False, 'bypassRls': False,
                 'inherit': False}
        return {
            'profile': 'umf.pg18.original-store-authority-evidence/0.1',
            'supervisorId': '22222222-2222-4222-8222-222222222222',
            'custodianId': '44444444-4444-4444-8444-444444444444',
            'providerId': '33333333-3333-4333-8333-333333333333',
            'installationId': 'installation-a',
            'ownerAuthorityId': '11111111-1111-4111-8111-111111111111',
            'ownerPolicyRevision': 'policy-2026-10',
            'registrationDigest': _hex('registration'),
            'targetCustodyDigest': _hex('custody'),
            'authorityPreparationReceiptDigest': _hex('preparation'),
            'maintenance': {'oid': 51001, 'name': 'umf_maintenance', 'flags':
                            {**flags, 'superuser': True}},
            'controller': {'oid': 51002, 'name': 'umf_controller', 'flags':
                           {**flags, 'canLogin': False, 'superuser': True}},
            'businessOwner': {'oid': 51003, 'name': 'business_owner', 'flags':
                              {**flags, 'canLogin': False, 'superuser': False}},
            'requiredMemberships': [
                {'memberOid': 51001, 'roleOid': 51002,
                 'inherit': False, 'set': True, 'admin': False},
                {'memberOid': 51001, 'roleOid': 51003,
                 'inherit': False, 'set': True, 'admin': False},
            ],
            'requiredSettings': {'searchPath': 'pg_catalog', 'timeZone': 'UTC',
                                 'rowSecurity': 'on', 'sessionReplicationRole': 'origin',
                                 'transactionReadOnly': 'off',
                                 'transactionIsolation': 'read committed'},
            'nativeAuthorityObservationDigest': _hex('native-observation'),
        }

    def _request(self):
        return self.authority.prepare_request('native-store-creation', self.intent_bytes)

    def _envelope(self, request, *, mutate_payload=None, private_key=None):
        exported = self.authority.export_signing_request(request)
        payload = copy.deepcopy(exported['payload'])
        if mutate_payload:
            mutate_payload(payload)
        signature = (private_key or self.private_key).sign(
            _SIGNATURE_DOMAIN + canonical_json(payload).encode('utf-8'))
        return {'payload': payload, 'signature': _b64(signature)}

    def _run_forced_registry_interleaving(self, method_name, first_call, second_call):
        original = getattr(ConfiguredEd25519OwnerAuthority, method_name)
        first_entered = threading.Event()
        release_first = threading.Event()
        second_started = threading.Event()
        calls = []
        results = []
        errors = []
        calls_lock = threading.Lock()

        def delayed(authority, *args, **kwargs):
            with calls_lock:
                calls.append(1)
                first = len(calls) == 1
            if first:
                first_entered.set()
                if not release_first.wait(timeout=3):
                    raise AssertionError('test interleaving timed out')
            return original(authority, *args, **kwargs)

        def run(call, started=None):
            try:
                if started is not None:
                    started.set()
                results.append(call())
            except OwnerAuthorityError as error:
                errors.append(error)

        with patch.object(ConfiguredEd25519OwnerAuthority, method_name, delayed):
            first_thread = threading.Thread(target=run, args=(first_call,))
            first_thread.start()
            self.assertTrue(first_entered.wait(timeout=2))
            second_thread = threading.Thread(target=run, args=(second_call, second_started))
            second_thread.start()
            self.assertTrue(second_started.wait(timeout=2))
            threading.Event().wait(0.05)
            release_first.set()
            first_thread.join(timeout=4)
            second_thread.join(timeout=4)
        self.assertFalse(first_thread.is_alive())
        self.assertFalse(second_thread.is_alive())
        self.assertEqual(errors, [])
        return calls, results

    def test_signed_decision_is_verified_and_durably_reserved_before_dispatch(self):
        request = self._request()
        exported = self.authority.export_signing_request(request)
        exported['intent']['businessOwner']['name'] = 'attacker'
        exported['payload']['principalId'] = 'attacker'
        reread = self.authority.export_signing_request(request)
        self.assertEqual(reread['intent'], self.intent)
        self.assertEqual(reread['payload']['principalId'], 'owner-service-prod')

        verified = self.authority.verify_approval(request, self._envelope(request))
        self.assertEqual(verified.scope, 'native-store-creation')
        self.assertEqual(verified.authority_id, self.authority.authority_id)
        self.assertEqual(verified.policy_revision, 'policy-2026-10')
        self.assertEqual(verified.intent_digest, hashlib.sha256(self.intent_bytes).hexdigest())
        outcome = self.authority.observe_approval(request)
        self.assertEqual(outcome.approval_status, 'approved')
        self.assertEqual(outcome.effect_status, 'not-dispatched')
        resolved = self.authority._resolve_verified_approval(
            verified, original_request=request, scope='native-store-creation',
            intent_digest=verified.intent_digest)
        self.assertIs(resolved, verified)
        self.authority._consume_verified_approval(
            verified, original_request=request, scope='native-store-creation',
            intent_digest=verified.intent_digest)
        self.assertEqual(self.authority.observe_approval(request).effect_status,
                         'dispatch-reserved-outcome-owned-by-native-journal')
        with self.assertRaisesRegex(OwnerAuthorityError, 'already-consumed'):
            self.authority._consume_verified_approval(
                verified, original_request=request, scope='native-store-creation',
                intent_digest=verified.intent_digest)

    def test_original_signature_resolves_after_authority_restart(self):
        request = self._request()
        envelope = self._envelope(request)
        first = self.authority.verify_approval(request, envelope)
        restarted = ConfiguredEd25519OwnerAuthority(
            self.config, ledger_path=self.root / 'approval-ledger.jsonl')
        # Recreate the exact original request from the same scope and intent.
        replay_request = restarted.prepare_request('native-store-creation', self.intent_bytes)
        # Current implementation never substitutes a different request ID.
        # A restarted authority must resolve from durable records, not mint one.
        self.assertEqual(replay_request._approval_id, first.approval_id)

    def test_same_process_reprepare_preserves_request_capability_identity(self):
        request = self._request()
        envelope = self._envelope(request)
        verified = self.authority.verify_approval(request, envelope)
        repeated_request = self._request()
        self.assertIs(repeated_request, request)
        repeated_verified = self.authority.verify_approval(repeated_request, envelope)
        self.assertIs(repeated_verified, verified)
        self.assertIs(self.authority._resolve_verified_approval(
            repeated_verified, original_request=repeated_request,
            scope='native-store-creation', intent_digest=verified.intent_digest), verified)

    def test_same_issuer_concurrent_prepare_returns_one_request_object(self):
        calls, requests = self._run_forced_registry_interleaving(
            '_make_request', self._request, self._request)
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(requests), 2)
        self.assertIs(requests[0], requests[1])

    def test_same_issuer_concurrent_verify_returns_one_capability(self):
        request = self._request()
        envelope = self._envelope(request)
        calls, approvals = self._run_forced_registry_interleaving(
            '_make_verified',
            lambda: self.authority.verify_approval(request, envelope),
            lambda: self.authority.verify_approval(request, envelope))
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(approvals), 2)
        self.assertIs(approvals[0], approvals[1])
        self.assertIs(self.authority._resolve_verified_approval(
            approvals[1], original_request=request, scope='native-store-creation',
            intent_digest=approvals[0].intent_digest), approvals[0])

    def test_concurrent_preparation_reserves_one_original_request(self):
        second = ConfiguredEd25519OwnerAuthority(
            self.config, ledger_path=self.root / 'approval-ledger.jsonl')
        barrier = threading.Barrier(2)
        requests = []
        failures = []

        def prepare(authority):
            try:
                barrier.wait(timeout=2)
                requests.append(authority.prepare_request(
                    'native-store-creation', self.intent_bytes))
            except OwnerAuthorityError as error:
                failures.append(error)

        threads = [threading.Thread(target=prepare, args=(owner,))
                   for owner in (self.authority, second)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=4)
        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(failures, [])
        self.assertEqual(len(requests), 2)
        self.assertEqual(requests[0]._approval_id, requests[1]._approval_id)

    def test_bad_signature_and_embedded_key_substitution_refuse(self):
        request = self._request()
        other_key = Ed25519PrivateKey.generate()
        with self.assertRaisesRegex(OwnerAuthorityError, 'signature-invalid'):
            self.authority.verify_approval(request, self._envelope(request, private_key=other_key))
        with self.assertRaisesRegex(OwnerAuthorityError, 'request-mismatch'):
            self.authority.verify_approval(
                request, self._envelope(request, mutate_payload=lambda p: p.update(principalId='other')))

    def test_wrong_target_policy_and_scope_never_prepare(self):
        bad = ConfiguredEd25519OwnerAuthority(
            self._config(supervisor_ids=['99999999-9999-4999-8999-999999999999']),
            ledger_path=self.root / 'bad-ledger.jsonl')
        with self.assertRaisesRegex(OwnerAuthorityError, 'target-not-authorized'):
            bad.prepare_request('native-store-creation', self.intent_bytes)
        wrong_policy = dict(self.intent, ownerPolicyRevision='other')
        with self.assertRaisesRegex(OwnerAuthorityError, 'authority-mismatch'):
            self.authority.prepare_request('native-store-creation',
                                           canonical_json(wrong_policy).encode())
        with self.assertRaisesRegex(OwnerAuthorityError, 'scope-invalid'):
            self.authority.prepare_request('not-a-scope', self.intent_bytes)
        with self.assertRaisesRegex(OwnerAuthorityError, 'scope-unsupported'):
            self.authority.prepare_request('native-principal-preparation', self.intent_bytes)

    def test_closed_configuration_and_intent_shapes_refuse(self):
        bad = self._config()
        bad['extra'] = True
        with self.assertRaisesRegex(OwnerAuthorityError, 'config-invalid'):
            ConfiguredEd25519OwnerAuthority(bad, ledger_path=self.root / 'bad-config.jsonl')
        bad_intent = dict(self.intent, unexpected=True)
        with self.assertRaisesRegex(OwnerAuthorityError, 'intent-invalid'):
            self.authority.prepare_request('native-store-creation',
                                           canonical_json(bad_intent).encode())

    def test_noncanonical_duplicate_float_and_oversized_intent_refuse(self):
        with self.assertRaisesRegex(OwnerAuthorityError, 'noncanonical'):
            self.authority.prepare_request('native-store-creation',
                                          b'{"x":1, "y":2}')
        with self.assertRaisesRegex(OwnerAuthorityError, 'intent-invalid'):
            self.authority.prepare_request('native-store-creation', b'{"x":1.0}')
        with self.assertRaisesRegex(OwnerAuthorityError, 'intent-capacity'):
            self.authority.prepare_request('native-store-creation', b' ' * 65_537)

    def test_request_handle_cannot_be_copied_or_serialized(self):
        request = self._request()
        with self.assertRaises(TypeError):
            copy.copy(request)
        with self.assertRaises(TypeError):
            pickle.dumps(request)
        with self.assertRaisesRegex(OwnerAuthorityError, 'original-request-required'):
            self.authority.export_signing_request(object())

    def test_ledger_corruption_and_configuration_rebinding_fail_closed(self):
        request = self._request()
        self.assertEqual(self.authority.observe_approval(request).approval_status, 'prepared')
        ledger_path = self.root / 'approval-ledger.jsonl'
        ledger_path.write_bytes(ledger_path.read_bytes() + b'corruption\n')
        with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-corrupt'):
            self.authority.observe_approval(request)
        other = dict(self.config, authorityId='55555555-5555-4555-8555-555555555555',
                     policyRevision='policy-2027')
        clean_path = self.root / 'clean-ledger.jsonl'
        clean_owner = ConfiguredEd25519OwnerAuthority(
            self.config, ledger_path=clean_path)
        clean_owner.prepare_request('native-store-creation', self.intent_bytes)
        authority = ConfiguredEd25519OwnerAuthority(
            other, ledger_path=clean_path)
        with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-binding-mismatch'):
            changed_intent = dict(self.intent,
                                  ownerAuthorityId='55555555-5555-4555-8555-555555555555',
                                  ownerPolicyRevision='policy-2027')
            authority.prepare_request('native-store-creation',
                                      canonical_json(changed_intent).encode())

    def test_ledger_request_payload_binding_is_rechecked_after_rehash(self):
        self._request()
        ledger = self.root / 'approval-ledger.jsonl'
        rows = [json.loads(line) for line in ledger.read_text().splitlines()]
        rows[1]['payload']['payloadDigest'] = _hex('different payload')
        body = {key: rows[1][key] for key in ('sequence', 'previousDigest', 'kind', 'payload')}
        rows[1]['digest'] = hashlib.sha256(canonical_json(body).encode()).hexdigest()
        ledger.write_text(''.join(canonical_json(row) + '\n' for row in rows))
        restarted = ConfiguredEd25519OwnerAuthority(
            self.config, ledger_path=ledger)
        with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-corrupt'):
            restarted.prepare_request('native-store-creation', self.intent_bytes)

    def test_hardlinked_ledger_is_rejected(self):
        ledger = self.root / 'approval-ledger.jsonl'
        ledger.write_text('')
        os.chmod(ledger, 0o600)
        os.link(ledger, self.root / 'ledger-alias')
        authority = ConfiguredEd25519OwnerAuthority(self.config, ledger_path=ledger)
        with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-unavailable'):
            authority.prepare_request('native-store-creation', self.intent_bytes)

    def test_existing_unsafe_permissions_are_not_repaired(self):
        ledger = self.root / 'unsafe-ledger.jsonl'
        ledger.write_text('')
        os.chmod(ledger, 0o644)
        authority = ConfiguredEd25519OwnerAuthority(self.config, ledger_path=ledger)
        with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-unavailable'):
            authority.prepare_request('native-store-creation', self.intent_bytes)
        self.assertEqual(ledger.stat().st_mode & 0o777, 0o644)

    def test_ledger_is_private_and_records_original_canonical_intent(self):
        request = self._request()
        ledger = self.root / 'approval-ledger.jsonl'
        self.assertEqual(ledger.stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.root / 'approval-ledger.jsonl.lock').stat().st_mode & 0o777,
                         0o600)
        self.assertIn(self.intent_bytes.decode(), ledger.read_text())
        self.assertEqual(list(self.root.glob('*.tmp')), [])
        self.assertEqual(self.authority.observe_approval(request).approval_status, 'prepared')


if __name__ == '__main__':
    unittest.main()

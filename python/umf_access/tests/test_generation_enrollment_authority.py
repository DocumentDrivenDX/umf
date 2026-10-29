# SPDX-License-Identifier: MIT OR Apache-2.0
"""Source controls for the initial-generation approval domain.

The fixture issuer below is explicitly source-test-only.  These tests prove
canonical signed requests, durable logical reservation and recovery; they do
not qualify a PostgreSQL/provider effect or a production trust enrollment.
"""
from __future__ import annotations

import copy
import hashlib
import multiprocessing
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest import mock

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from umf_access.lifecycle import generation_authority_bootstrap as root_authority
from umf_access.lifecycle import generation_authority_session as session
from umf_access.lifecycle import generation_enrollment_authority as authority

_CONCURRENT = None
_CONCURRENT_CONTEXT = None


def _concurrent_prepare_worker(start, output) -> None:
    config, context, ledger_path, enrollment_id, intent = _CONCURRENT
    try:
        auth = authority.ConfiguredGenerationEnrollmentAuthority(
            config, context=context, ledger_path=ledger_path)
        identity = auth.recover_identity(enrollment_id)
        start.wait(3)
        request = auth.prepare_request(authority.PREPARE_SCOPE, intent, identity)
        output.put(('created', request.request_id))
    except authority.GenerationEnrollmentAuthorityError as exc:
        output.put(('refused', exc.code))


def _concurrent_context_worker(start, output) -> None:
    issuer, trust, supervisor, custodian, ingress = _CONCURRENT_CONTEXT
    try:
        start.wait(3)
        context = issuer.enroll_generation_authority(trust, supervisor, custodian, ingress)
        output.put(('created', context.public_reference['contextId']))
    except authority.GenerationEnrollmentAuthorityError as exc:
        output.put(('refused', exc.code))


def _uuid() -> str:
    return str(uuid.uuid4())


def _digest(value: bytes | str) -> str:
    if isinstance(value, str):
        value = value.encode()
    return hashlib.sha256(value).hexdigest()


class _OpaqueFixtureHandle:
    pass


class GenerationEnrollmentAuthorityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        self.private = Ed25519PrivateKey.generate()
        self.public = self.private.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.target = {
            'profile': 'umf.native-target-custody/0.1', 'custodianId': _uuid(),
            'registrationId': _uuid(), 'resourceId': _uuid(), 'incarnation': _uuid(),
            'registrationDigest': _digest('registration'),
        }
        self.subject_flags = {
            'canLogin': True, 'superuser': False, 'createDatabase': False,
            'createRole': False, 'replication': False, 'bypassRls': False,
            'inherit': False,
        }
        memberships: list[dict[str, object]] = []
        self.subject = {'oid': 101, 'name': 'person_role'}
        approved_subject = {
            'subject': self.subject, 'audience': 'person',
            'ownershipReceiptDigest': _digest('owner'),
            'membershipsDigest': _digest(authority._canonical(memberships)),
            'flagsDigest': _digest(authority._canonical(self.subject_flags)),
        }
        self.cohort = {
            'sourceDigest': _digest('source'), 'bundleDigest': _digest('bundle'),
            'sourceCohortDigest': _digest('cohort'),
            'executionPolicyDigest': _digest('execution-policy'),
        }
        self.config = {
            'profile': authority.CONFIG_PROFILE, 'authorityId': _uuid(),
            'policyRevision': 'test-policy-1', 'purpose': 'native-acceptance',
            'supervisorId': _uuid(), 'custodianId': self.target['custodianId'],
            'providerId': _uuid(), 'installationId': 'fixture-installation',
            'targetCustody': self.target, 'storeId': None,
            'sourcePolicy': {
                'profile': authority.SOURCE_POLICY_PROFILE,
                'approvedCohorts': [self.cohort], 'approvedSubjects': [approved_subject],
                'issuerProfile': 'umf.test-issuer/0.1', 'maximumSubjects': 8,
                'allowLegacyLoginConversion': True,
            },
            'keys': [],
        }
        self.config['storeId'] = self.config['providerId']
        self.config['keys'] = [{
            'keyId': 'fixture-key', 'publicKey': authority._b64encode_bytes(self.public),
            'principalId': 'fixture-owner', 'scopes': list(authority.SCOPES),
        }]
        self.supervisor = _OpaqueFixtureHandle()
        self.custodian = _OpaqueFixtureHandle()
        self.ingress = _OpaqueFixtureHandle()
        self.issuer = authority._source_test_generation_trust_issuer(
            registry_id=_uuid(), registry=object(), supervisor=self.supervisor,
            custodian=self.custodian, ingress_store=self.ingress,
            registry_path=str(self.root / 'contexts.jsonl'))
        statement = {
            'profile': authority.TRUST_PROFILE, 'enrollmentId': _uuid(),
            'ownerBootstrapContextDigest': _digest('bootstrap-context'),
            'configurationDigest': _digest(authority._canonical(self.config)),
            'supervisorId': self.config['supervisorId'], 'custodianId': self.config['custodianId'],
            'providerId': self.config['providerId'], 'installationId': self.config['installationId'],
            'targetCustodyDigest': _digest(authority._canonical(self.target)),
            'storeCreationReceiptDigest': _digest('original-store-created'),
            'custodySequence': 4,
        }
        self.trust = self.issuer._issue_original_trust_entry(
            statement, self.config, ledger_path=str(self.root / 'approvals.jsonl'))
        self.context = self.issuer.enroll_generation_authority(
            self.trust, self.supervisor, self.custodian, self.ingress)
        self.auth = authority.ConfiguredGenerationEnrollmentAuthority(
            self.config, context=self.context, ledger_path=str(self.root / 'approvals.jsonl'))
        self.identity = self.auth.allocate_identity()
        trust_statement = authority._parse_canonical(self.trust._statement_bytes)
        self.assertNotIn('initialEpoch', trust_statement)
        self.assertNotEqual(self.identity.enrollment_id, trust_statement['enrollmentId'])

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _prepare_intent(self) -> bytes:
        return authority._canonical({
            'profile': authority.PREPARE_INTENT_PROFILE,
            'providerId': self.config['providerId'],
            'enrollmentId': self.identity.enrollment_id,
            'installationId': self.config['installationId'],
            'targetCustody': self.target, 'storeId': self.config['storeId'],
            'source': {'format': 'json', 'sha256': self.cohort['sourceDigest']},
            'bundleDigest': self.cohort['bundleDigest'],
            'expectedHead': _digest('head'),
            'sourceCohortDigest': self.cohort['sourceCohortDigest'],
            'executionPolicyDigest': self.cohort['executionPolicyDigest'],
            'issuerProfile': 'umf.test-issuer/0.1',
            'initialEpoch': self.identity.initial_epoch,
            'subjects': [{
                'subject': self.subject, 'audience': 'person',
                'observedFlags': self.subject_flags, 'memberships': [],
                'ownershipReceiptDigest': _digest('owner'), 'newLoginName': 'person_login',
            }], 'maximumRoles': 1,
        })

    def _root_registry(self, *, confirmed: bool, custody_sequence: int = 1,
                       allow_authority: bool = True) -> tuple[bytes, dict[str, object], str, str]:
        root_private = Ed25519PrivateKey.generate()
        root_public = root_private.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        root_policy = {
            'profile': root_authority.ROOT_POLICY_PROFILE,
            'authorityId': _uuid(), 'policyRevision': 'root-policy-1',
            'keys': [{
                'keyId': 'root-key',
                'publicKey': authority._b64encode_bytes(root_public),
                'principalId': 'operator-service',
                'logicalAuthorityIds': [self.config['authorityId'] if allow_authority else _uuid()],
                'configurationProfiles': [authority.AUTHORITY_PROFILE],
            }],
        }
        registry_id = _uuid()
        anchor = _digest('root-anchor')
        bootstrap_id = _uuid()
        context_id = _uuid()
        trust = {
            'profile': root_authority.TRUST_PROFILE,
            'enrollmentId': _uuid(),
            'ownerBootstrapContextDigest': _digest('physical-context'),
            'configurationDigest': _digest(authority._canonical(self.config)),
            'supervisorId': self.config['supervisorId'],
            'custodianId': self.config['custodianId'],
            'providerId': self.config['providerId'],
            'installationId': self.config['installationId'],
            'targetCustodyDigest': _digest(authority._canonical(self.target)),
            'storeCreationReceiptDigest': _digest('store-receipt'),
            'custodySequence': custody_sequence,
        }
        intent = {
            'profile': root_authority.ROOT_INTENT_PROFILE,
            'contextId': context_id,
            'trust': trust,
            'configuration': self.config,
            'configurationDigest': _digest(authority._canonical(self.config)),
            'nativeEvidenceDigest': _digest('native-evidence'),
        }
        payload = {
            'profile': root_authority.ROOT_APPROVAL_PROFILE,
            'scope': 'enroll-generation-authority',
            'rootAuthorityId': root_policy['authorityId'],
            'rootPolicyRevision': root_policy['policyRevision'],
            'keyId': 'root-key', 'principalId': 'operator-service',
            'approvalId': _uuid(), 'purpose': self.config['purpose'],
            'bootstrapEnrollmentId': bootstrap_id,
            'rootPolicyDigest': _digest(root_authority._root_canonical(root_policy)),
            'supervisorId': self.config['supervisorId'],
            'custodianId': self.config['custodianId'],
            'providerId': self.config['providerId'],
            'installationId': self.config['installationId'],
            'intentDigest': _digest(root_authority._root_canonical(intent)),
        }
        request = {
            'requestId': _uuid(), 'enrollmentId': trust['enrollmentId'],
            'contextId': context_id,
            'effectKey': ['enroll-generation-authority', bootstrap_id,
                          self.config['providerId'], self.config['installationId'],
                          self.config['authorityId'], self.config['policyRevision']],
            'intent': intent, 'payload': payload,
            'state': 'prepared' if not confirmed else 'confirmed',
            'reservedSequence': 1,
            'confirmedSequence': None if not confirmed else 2,
            'approvalEnvelope': None,
        }
        sequence = 1
        enrollments = []
        if confirmed:
            message = (root_authority.ROOT_APPROVAL_PROFILE.encode('ascii') + b'\x00'
                       + root_authority._root_canonical(payload, maximum=16_384))
            signature = root_private.sign(message)
            envelope = {'payload': payload,
                        'signature': authority._b64encode_bytes(signature)}
            request['approvalEnvelope'] = envelope
            sequence = 2
            enrollments.append({
                'profile': root_authority.ROOT_ENROLLMENT_PROFILE,
                'enrollmentId': trust['enrollmentId'],
                'requestId': request['requestId'], 'contextId': context_id,
                'bootstrapEnrollmentId': bootstrap_id,
                'rootPolicyDigest': payload['rootPolicyDigest'],
                'rootApprovalDigest': _digest(root_authority._root_canonical(envelope)),
                'trust': trust, 'configuration': self.config,
                'configurationDigest': intent['configurationDigest'],
                'nativeEvidenceDigest': intent['nativeEvidenceDigest'],
                'state': 'confirmed', 'registrySequence': 2,
            })
        registry = {
            'profile': root_authority.ROOT_REGISTRY_PROFILE,
            'registryId': registry_id, 'anchorDigest': anchor,
            'sequence': sequence, 'requests': [request],
            'enrollments': enrollments,
        }
        raw = root_authority._root_canonical(registry)
        return raw, root_policy, registry_id, anchor

    def test_root_registry_accepts_prepared_and_signed_confirmed_records(self) -> None:
        for confirmed in (False, True):
            with self.subTest(confirmed=confirmed):
                raw, root_policy, registry_id, anchor = self._root_registry(confirmed=confirmed)
                result = root_authority.validate_registry(
                    raw, registry_id=registry_id, anchor_digest=anchor,
                    root_policy=root_policy, purpose=self.config['purpose'],
                    bootstrap_enrollment_id=(
                        root_authority._parse(raw)['requests'][0]['effectKey'][1]))
                self.assertEqual(result, root_authority._parse(raw))

    def test_root_registry_requires_custody_sequence_to_match_reservation(self) -> None:
        # The confirmed fixture is signed over the mismatched intent, so this
        # exercises the cross-link independently of signature rejection.
        for confirmed in (False, True):
            with self.subTest(confirmed=confirmed):
                raw, root_policy, registry_id, anchor = self._root_registry(
                    confirmed=confirmed, custody_sequence=4)
                parsed = root_authority._parse(raw)
                with self.assertRaises(root_authority.GenerationAuthorityBootstrapError):
                    root_authority.validate_registry(
                        raw, registry_id=registry_id, anchor_digest=anchor,
                        root_policy=root_policy, purpose=self.config['purpose'],
                        bootstrap_enrollment_id=parsed['requests'][0]['effectKey'][1])

    def test_signed_registry_rejects_python_cross_type_enrollment_copies(self) -> None:
        mutations = (
            (('trust', 'custodySequence'), True),
            (('configuration', 'sourcePolicy', 'maximumSubjects'), True),
            (('configuration', 'sourcePolicy', 'allowLegacyLoginConversion'), 1),
        )
        original_maximum = self.config['sourcePolicy']['maximumSubjects']
        self.config['sourcePolicy']['maximumSubjects'] = 1
        try:
            for path, replacement in mutations:
                with self.subTest(path=path, replacement=replacement):
                    raw, root_policy, registry_id, anchor = self._root_registry(confirmed=True)
                    registry = root_authority._parse(raw)
                    self.assertIs(type(registry['enrollments'][0]['configuration']
                                      ['sourcePolicy']['maximumSubjects']), int)
                    self.assertEqual(registry['enrollments'][0]['configuration']
                                     ['sourcePolicy']['maximumSubjects'], 1)
                    target = registry['enrollments'][0]
                    for part in path[:-1]:
                        target = target[part]
                    target[path[-1]] = replacement
                    bootstrap_id = registry['requests'][0]['effectKey'][1]
                    with self.assertRaisesRegex(
                            root_authority.GenerationAuthorityBootstrapError,
                            'generation-root-registry-crosslink-invalid'):
                        root_authority.validate_registry(
                            root_authority._root_canonical(registry),
                            registry_id=registry_id, anchor_digest=anchor,
                            root_policy=root_policy, purpose=self.config['purpose'],
                            bootstrap_enrollment_id=bootstrap_id)

        finally:
            self.config['sourcePolicy']['maximumSubjects'] = original_maximum

    def test_root_registry_accepts_reverse_confirmation_order(self) -> None:
        raw, policy, registry_id, anchor = self._root_registry(confirmed=True)
        original = root_authority._parse(raw)
        request = original['requests'][0]
        private = Ed25519PrivateKey.generate()
        public = private.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        first_config = copy.deepcopy(self.config)
        second_config = copy.deepcopy(self.config)
        second_config['authorityId'] = _uuid()
        policy['keys'][0]['publicKey'] = authority._b64encode_bytes(public)
        policy['keys'][0]['logicalAuthorityIds'] = [
            first_config['authorityId'], second_config['authorityId']]
        bootstrap_id = request['effectKey'][1]
        requests: list[dict[str, object]] = []
        enrollments: list[dict[str, object]] = []

        for config, reserve_sequence, confirm_sequence in (
                (first_config, 1, 4), (second_config, 2, 3)):
            item = copy.deepcopy(request)
            item['requestId'] = _uuid()
            item['enrollmentId'] = _uuid()
            item['contextId'] = _uuid()
            item['reservedSequence'] = reserve_sequence
            item['confirmedSequence'] = confirm_sequence
            intent = item['intent']
            intent['contextId'] = item['contextId']
            intent['configuration'] = config
            intent['configurationDigest'] = _digest(root_authority._root_canonical(config))
            trust = intent['trust']
            trust['enrollmentId'] = item['enrollmentId']
            trust['configurationDigest'] = _digest(root_authority._root_canonical(config))
            trust['custodySequence'] = reserve_sequence
            item['effectKey'] = [
                'enroll-generation-authority', bootstrap_id, config['providerId'],
                config['installationId'], config['authorityId'], config['policyRevision']]
            payload = item['payload']
            payload['approvalId'] = _uuid()
            payload['rootPolicyDigest'] = _digest(root_authority._root_canonical(policy))
            payload['intentDigest'] = _digest(root_authority._root_canonical(intent))
            envelope = {
                'payload': copy.deepcopy(payload),
                'signature': authority._b64encode_bytes(private.sign(
                    root_authority.ROOT_APPROVAL_PROFILE.encode('ascii') + b'\x00'
                    + root_authority._root_canonical(payload, maximum=16_384))),
            }
            item['approvalEnvelope'] = envelope
            enrollments.append({
                'profile': root_authority.ROOT_ENROLLMENT_PROFILE,
                'enrollmentId': item['enrollmentId'], 'requestId': item['requestId'],
                'contextId': item['contextId'], 'bootstrapEnrollmentId': bootstrap_id,
                'rootPolicyDigest': payload['rootPolicyDigest'],
                'rootApprovalDigest': _digest(root_authority._root_canonical(envelope)),
                'trust': copy.deepcopy(trust), 'configuration': copy.deepcopy(config),
                'configurationDigest': intent['configurationDigest'],
                'nativeEvidenceDigest': intent['nativeEvidenceDigest'],
                'state': 'confirmed', 'registrySequence': confirm_sequence,
            })
            requests.append(item)

        candidate = {
            'profile': root_authority.ROOT_REGISTRY_PROFILE,
            'registryId': registry_id, 'anchorDigest': anchor, 'sequence': 4,
            'requests': requests,
            'enrollments': sorted(enrollments, key=lambda entry: entry['registrySequence']),
        }
        result = root_authority.validate_registry(
            root_authority._root_canonical(candidate), registry_id=registry_id,
            anchor_digest=anchor, root_policy=policy, purpose=self.config['purpose'],
            bootstrap_enrollment_id=bootstrap_id)
        self.assertEqual([entry['registrySequence'] for entry in result['enrollments']], [3, 4])

    def test_root_registry_rejects_crosslink_and_nested_corruption(self) -> None:
        raw, root_policy, registry_id, anchor = self._root_registry(confirmed=True)
        original = root_authority._parse(raw)
        bootstrap_id = original['requests'][0]['effectKey'][1]

        def rejected(mutator, *, policy=root_policy) -> None:
            candidate = copy.deepcopy(original)
            mutator(candidate)
            with self.assertRaises(root_authority.GenerationAuthorityBootstrapError):
                root_authority.validate_registry(
                    root_authority._root_canonical(candidate), registry_id=registry_id,
                    anchor_digest=anchor, root_policy=policy,
                    purpose=self.config['purpose'], bootstrap_enrollment_id=bootstrap_id)

        rejected(lambda value: value['requests'][0]['intent'].__setitem__('trust', []))
        rejected(lambda value: value['requests'][0]['intent'].__setitem__('unknown', True))
        rejected(lambda value: value['requests'][0]['payload'].__setitem__('unexpected', 'x'))
        rejected(lambda value: value['requests'][0]['effectKey'].__setitem__(2, _uuid()))
        rejected(lambda value: value['requests'][0]['approvalEnvelope']['payload']
                 .__setitem__('intentDigest', _digest('other intent')))
        rejected(lambda value: value['requests'][0]['payload']
                 .__setitem__('purpose', 'production'))
        rejected(lambda value: value['requests'][0]['intent']
                 .__setitem__('configurationDigest', _digest('other config')))
        rejected(lambda value: value['requests'][0]['intent']['configuration']
                 .__setitem__('authorityId', _uuid()))
        rejected(lambda value: value.__setitem__('sequence', 9_007_199_254_740_991))
        rejected(lambda value: value['requests'][0]['approvalEnvelope']
                 .__setitem__('signature', authority._b64encode_bytes(bytes(64))))
        rejected(lambda value: value['enrollments'][0]['trust']
                 .__setitem__('storeCreationReceiptDigest', _digest('other store')))
        rejected(lambda value: value['enrollments'][0]
                 .__setitem__('rootApprovalDigest', _digest('other envelope')))
        rejected(lambda value: value['enrollments'][0]
                 .__setitem__('bootstrapEnrollmentId', _uuid()))
        changed_policy = copy.deepcopy(root_policy)
        changed_policy['policyRevision'] = 'other-root-policy'
        with self.assertRaises(root_authority.GenerationAuthorityBootstrapError):
            root_authority.validate_registry(
                raw, registry_id=registry_id, anchor_digest=anchor,
                root_policy=changed_policy, purpose=self.config['purpose'],
                bootstrap_enrollment_id=bootstrap_id)
        disallowed_raw, disallowed_policy, disallowed_registry, disallowed_anchor = (
            self._root_registry(confirmed=True, allow_authority=False))
        disallowed_bootstrap = root_authority._parse(disallowed_raw)['requests'][0]['effectKey'][1]
        with self.assertRaises(root_authority.GenerationAuthorityBootstrapError):
            root_authority.validate_registry(
                disallowed_raw, registry_id=disallowed_registry, anchor_digest=disallowed_anchor,
                root_policy=disallowed_policy, purpose=self.config['purpose'],
                bootstrap_enrollment_id=disallowed_bootstrap)

    def _sign(self, request: authority.InitialGenerationEnrollmentRequest) -> dict[str, object]:
        payload = self.auth.export_signing_request(request)['payload']
        encoded = authority._canonical(payload)
        signature = self.private.sign(authority.SIGNING_DOMAIN + encoded)
        return {'payload': payload, 'keyId': payload['keyId'],
                'signature': authority._b64encode_bytes(signature)}

    def test_prepare_signature_reservation_and_original_recovery(self) -> None:
        intent = self._prepare_intent()
        request = self.auth.prepare_request(authority.PREPARE_SCOPE, intent, self.identity)
        envelope = self._sign(request)
        verified = self.auth.verify_approval(request, envelope)
        reservation = self.auth.reserve_effect(verified)
        outcome = self.auth._record_source_test_outcome(
            reservation, 'confirmed', _digest('provider-receipt-fixture'))
        self.assertTrue(outcome['sourceTestOnly'])
        self.assertEqual(self.auth.observe(request)['effectStatus'], 'confirmed')
        restarted = authority.ConfiguredGenerationEnrollmentAuthority(
            self.config, context=self.context, ledger_path=str(self.root / 'approvals.jsonl'))
        identity = restarted.recover_identity(self.identity.enrollment_id)
        recovered = restarted.recover_request(
            authority.PREPARE_SCOPE, intent, identity, request.request_id)
        recovered_approval = restarted.recover_approval(recovered)
        recovered_reservation = restarted.recover_reservation(
            recovered, reservation.reservation_id)
        self.assertEqual(recovered_approval.approval_digest, verified.approval_digest)
        self.assertEqual(recovered_reservation.journal_record_digest,
                         reservation.journal_record_digest)
        self.assertEqual(restarted.observe(recovered)['effectReceiptDigest'],
                         _digest('provider-receipt-fixture'))
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            restarted.reserve_effect(recovered_approval)

    def test_scope_handle_is_immutable_and_revalidated_against_signed_ledger(self) -> None:
        request = self.auth.prepare_request(
            authority.PREPARE_SCOPE, self._prepare_intent(), self.identity)
        with self.assertRaises(AttributeError):
            request._scope = authority.ACTIVATE_SCOPE
        envelope = self._sign(request)
        self.assertEqual(self.auth.verify_approval(request, envelope).scope,
                         authority.PREPARE_SCOPE)
        forged = self.auth.recover_request(
            authority.PREPARE_SCOPE, self._prepare_intent(), self.identity,
            request.request_id)
        object.__setattr__(forged, '_scope', authority.ACTIVATE_SCOPE)
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            self.auth.export_signing_request(forged)

    def test_context_birth_records_intent_before_ledger_and_resumes_same_ids(self) -> None:
        registry = self.root / 'interrupted-contexts.jsonl'
        ledger_path = self.root / 'interrupted-approvals.jsonl'
        issuer = authority._source_test_generation_trust_issuer(
            registry_id=_uuid(), registry=object(), supervisor=self.supervisor,
            custodian=self.custodian, ingress_store=self.ingress,
            registry_path=str(registry))
        statement = authority._parse_canonical(self.trust._statement_bytes)
        statement['enrollmentId'] = _uuid()
        statement['ownerBootstrapContextDigest'] = _digest('interrupted-bootstrap')
        trust = issuer._issue_original_trust_entry(
            statement, self.config, ledger_path=str(ledger_path))
        original_append = authority._ContextJournal._append_event

        def fail_confirm(journal, events, kind, payload):
            if kind == 'context-birth-confirmed':
                raise OSError('synthetic confirmation interruption')
            return original_append(journal, events, kind, payload)

        with (mock.patch.object(authority._ContextJournal, '_append_event', fail_confirm),
              self.assertRaises(OSError)):
            issuer.enroll_generation_authority(
                trust, self.supervisor, self.custodian, self.ingress)
        pending = authority._ContextJournal(registry, issuer._registry_id).context_for(
            trust._entry_id)
        self.assertIsNotNone(pending)
        self.assertFalse(pending['confirmed'])
        original_identity = (pending['logicalEnrollmentId'], pending['initialEpoch'])
        self.assertTrue(ledger_path.exists())
        resumed = issuer.enroll_generation_authority(
            trust, self.supervisor, self.custodian, self.ingress)
        self.assertEqual((resumed._logical_enrollment_id, resumed._initial_epoch),
                         original_identity)
        self.assertEqual(len(registry.read_bytes().splitlines()), 2)

    def test_lost_confirmed_context_history_refuses_recreation(self) -> None:
        registry = self.root / 'contexts.jsonl'
        lock = registry.with_name(registry.name + '.lock')
        registry.unlink(); lock.unlink()
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            self.issuer.enroll_generation_authority(
                self.trust, self.supervisor, self.custodian, self.ingress)
        self.assertFalse(registry.exists())
        self.assertFalse(lock.exists())

    def test_missing_confirmed_context_lock_is_not_recreated(self) -> None:
        registry = self.root / 'contexts.jsonl'
        lock = registry.with_name(registry.name + '.lock')
        lock.unlink()
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            self.issuer.enroll_generation_authority(
                self.trust, self.supervisor, self.custodian, self.ingress)
        self.assertTrue(registry.exists())
        self.assertFalse(lock.exists())

    def test_activation_is_bound_to_preparation_and_same_identity(self) -> None:
        intent = self._prepare_intent()
        request = self.auth.prepare_request(authority.PREPARE_SCOPE, intent, self.identity)
        approved = self.auth.verify_approval(request, self._sign(request))
        principals = [{
            'login': {'oid': 201, 'name': 'person_login'}, 'subject': self.subject,
            'audience': 'person', 'issuerProfile': 'umf.test-issuer/0.1',
            'issuerReceiptDigest': _digest('issuer-receipt'),
            'ownershipReceiptDigest': _digest('owner'), 'memberships': [],
        }]
        activation = {
            'profile': authority.ACTIVATE_INTENT_PROFILE,
            'providerId': self.config['providerId'], 'enrollmentId': self.identity.enrollment_id,
            'installationId': self.config['installationId'], 'targetCustody': self.target,
            'storeId': self.config['storeId'], 'prepareRequestDigest': request.intent_digest,
            'prepareApprovalDigest': approved.approval_digest,
            'preparationReceiptDigest': _digest('native-preparation-receipt'),
            'source': {'format': 'json', 'sha256': self.cohort['sourceDigest']},
            'bundleDigest': self.cohort['bundleDigest'], 'expectedHead': _digest('head'),
            'sourceCohortDigest': self.cohort['sourceCohortDigest'],
            'executionPolicyDigest': self.cohort['executionPolicyDigest'],
            'initialEpoch': self.identity.initial_epoch, 'principals': principals,
            'principalsDigest': _digest(authority._canonical(principals)),
            'fenceReceiptDigest': _digest('fence'),
            'externalReservationDigest': _digest('external-reservation'),
        }
        activation_bytes = authority._canonical(activation)
        activate = self.auth.prepare_request(authority.ACTIVATE_SCOPE, activation_bytes,
                                             self.identity, preparation=approved)
        self.assertEqual(activate.scope, authority.ACTIVATE_SCOPE)
        activation_approval = self.auth.verify_approval(activate, self._sign(activate))
        activation_reservation = self.auth.reserve_effect(activation_approval)
        self.assertEqual(activation_reservation._request, activate)
        other = authority.InitialEnrollmentIdentity(
            authority._REQUEST_SEAL, self.auth, self.context, _uuid(), _uuid())
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            self.auth.prepare_request(authority.ACTIVATE_SCOPE, activation_bytes,
                                      other, preparation=approved)

    def test_source_test_context_cannot_authorize_native_resolution(self) -> None:
        request = self.auth.prepare_request(authority.PREPARE_SCOPE,
                                            self._prepare_intent(), self.identity)
        approved = self.auth.verify_approval(request, self._sign(request))
        reservation = self.auth.reserve_effect(approved)
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError) as caught:
            self.auth._resolve_native_reservation(reservation, approved)
        self.assertEqual(caught.exception.code,
                         'generation-authority-native-reservation-unavailable')
        self.assertTrue(self.context.public_reference['sourceTestOnly'])

    def test_bad_signature_key_id_and_context_projection_refuse(self) -> None:
        request = self.auth.prepare_request(authority.PREPARE_SCOPE,
                                            self._prepare_intent(), self.identity)
        envelope = self._sign(request)
        wrong = dict(envelope); wrong['keyId'] = 'other-key'
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            self.auth.verify_approval(request, wrong)
        wrong = dict(envelope); wrong['signature'] = authority._b64encode_bytes(b'0' * 64)
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            self.auth.verify_approval(request, wrong)
        with self.assertRaises(TypeError):
            authority.GenerationEnrollmentAuthorityContext(
                object(), self.issuer, self.trust, self.context._projection_bytes)
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            self.auth._resolve_native_reservation(object(), object())

    def test_closed_config_subject_numeric_boolean_name_membership_scope_and_cohort(self) -> None:
        malformed_configs = []
        value = copy.deepcopy(self.config)
        value['sourcePolicy']['approvedSubjects'][0]['subject']['oid'] = True
        malformed_configs.append(value)
        value = copy.deepcopy(self.config)
        value['keys'][0]['scopes'] = [authority.PREPARE_SCOPE, authority.PREPARE_SCOPE]
        malformed_configs.append(value)
        value = copy.deepcopy(self.config)
        value['sourcePolicy']['approvedSubjects'][0]['audience'] = 'admin'
        malformed_configs.append(value)
        for value in malformed_configs:
            with self.subTest(config=value), self.assertRaises(
                    authority.GenerationEnrollmentAuthorityError):
                authority._config(value)

        for name in ('x' * 64, 'bad\x00name', '\ud800'):
            with self.subTest(name=repr(name)), self.assertRaises(
                    authority.GenerationEnrollmentAuthorityError):
                authority._name(name)

        bad_memberships = [
            [{'roleOid': 22, 'roleName': 'parent', 'inherit': True, 'set': False, 'admin': False},
             {'roleOid': 22, 'roleName': 'other', 'inherit': True, 'set': False, 'admin': False}],
            [{'roleOid': 23, 'roleName': 'parent', 'inherit': 1, 'set': False, 'admin': False}],
        ]
        for memberships in bad_memberships:
            with self.subTest(memberships=memberships), self.assertRaises(
                    authority.GenerationEnrollmentAuthorityError):
                authority._membership_list(memberships)

        intent = authority._parse_canonical(self._prepare_intent())
        intent['source']['sha256'] = _digest('unapproved source')
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            self.auth.prepare_request(authority.PREPARE_SCOPE, authority._canonical(intent),
                                      self.identity)
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            self.auth.prepare_request('prepare-initial-enrollment/other',
                                      self._prepare_intent(), self.identity)

        production_config = copy.deepcopy(self.config)
        production_config['purpose'] = 'production'
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            authority.ConfiguredGenerationEnrollmentAuthority(
                production_config, context=self.context,
                ledger_path=str(self.root / 'approvals.jsonl'))

    def test_subject_flags_membership_and_activation_principal_cross_bindings(self) -> None:
        for change in (
                lambda subject: subject.__setitem__('observedFlags', {
                    **subject['observedFlags'], 'superuser': True}),
                lambda subject: subject.__setitem__('memberships', [{
                    'roleOid': 999, 'roleName': 'unexpected', 'inherit': False,
                    'set': False, 'admin': False}] ),
                lambda subject: subject.__setitem__('newLoginName', 'person_role')):
            intent = authority._parse_canonical(self._prepare_intent())
            change(intent['subjects'][0])
            with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
                self.auth.prepare_request(authority.PREPARE_SCOPE,
                                          authority._canonical(intent), self.identity)

        intent = self._prepare_intent()
        request = self.auth.prepare_request(authority.PREPARE_SCOPE, intent, self.identity)
        approved = self.auth.verify_approval(request, self._sign(request))
        activation = {
            'profile': authority.ACTIVATE_INTENT_PROFILE,
            'providerId': self.config['providerId'], 'enrollmentId': self.identity.enrollment_id,
            'installationId': self.config['installationId'], 'targetCustody': self.target,
            'storeId': self.config['storeId'], 'prepareRequestDigest': request.intent_digest,
            'prepareApprovalDigest': approved.approval_digest,
            'preparationReceiptDigest': _digest('native-preparation-receipt'),
            'source': {'format': 'json', 'sha256': self.cohort['sourceDigest']},
            'bundleDigest': self.cohort['bundleDigest'], 'expectedHead': _digest('head'),
            'sourceCohortDigest': self.cohort['sourceCohortDigest'],
            'executionPolicyDigest': self.cohort['executionPolicyDigest'],
            'initialEpoch': self.identity.initial_epoch, 'principals': [{
                'login': {'oid': 201, 'name': 'person_login'}, 'subject': self.subject,
                'audience': 'person', 'issuerProfile': 'umf.test-issuer/0.1',
                'issuerReceiptDigest': _digest('issuer-receipt'),
                'ownershipReceiptDigest': _digest('owner'), 'memberships': [],
            }],
            'principalsDigest': '', 'fenceReceiptDigest': _digest('fence'),
            'externalReservationDigest': _digest('external-reservation')}
        activation['principalsDigest'] = _digest(authority._canonical(activation['principals']))
        activation['principals'][0]['login']['oid'] = True
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            self.auth.prepare_request(authority.ACTIVATE_SCOPE,
                                      authority._canonical(activation), self.identity,
                                      preparation=approved)

    def test_production_issuer_does_not_mint_from_submitted_config_or_mapping(self) -> None:
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError) as caught:
            session._issue_generation_trust_issuer(
                supervisor=self.supervisor, custodian=self.custodian,
                ingress_store=self.ingress)
        self.assertEqual(caught.exception.code,
                         'generation-authority-original-trust-required')
        self.assertFalse((self.root / 'production-contexts.jsonl').exists())

    def test_forged_or_subclassed_test_issuer_cannot_mint_production_context(self) -> None:
        production = copy.deepcopy(self.config)
        production['purpose'] = 'production'

        class ForgedTestIssuer(authority._SourceTestGenerationTrustIssuer):
            def _projection(self, entry):
                projection = super()._projection(entry)
                projection.pop('sourceTestOnly', None)
                return projection

            def resolve_generation_authority_context(self, handle):
                return handle

        forged = ForgedTestIssuer(
            authority._SOURCE_TEST_ISSUER_SEAL, registry_id=_uuid(),
            registry=object(), supervisor=self.supervisor, custodian=self.custodian,
            ingress_store=self.ingress,
            registry_path=self.root / 'forged-subclass-contexts.jsonl')
        statement = {
            'profile': authority.TRUST_PROFILE, 'enrollmentId': _uuid(),
            'ownerBootstrapContextDigest': _digest('bootstrap-context'),
            'configurationDigest': _digest(authority._canonical(production)),
            'supervisorId': production['supervisorId'],
            'custodianId': production['custodianId'],
            'providerId': production['providerId'],
            'installationId': production['installationId'],
            'targetCustodyDigest': _digest(authority._canonical(production['targetCustody'])),
            'storeCreationReceiptDigest': _digest('original-store-created'),
            'custodySequence': 4,
        }
        trust = forged._issue_original_trust_entry(
            statement, production, ledger_path=str(self.root / 'forged-subclass-ledger.jsonl'))
        context = forged.enroll_generation_authority(
            trust, self.supervisor, self.custodian, self.ingress)
        self.assertNotIn('sourceTestOnly', context.public_reference)
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError) as caught:
            authority.ConfiguredGenerationEnrollmentAuthority(
                production, context=context,
                ledger_path=str(self.root / 'forged-subclass-ledger.jsonl'))
        self.assertEqual(caught.exception.code, 'generation-authority-context-unverified')

        # Even the exact test class and its private seal do not establish a
        # factory-origin association.  A valid test fixture remains usable
        # only when created by the registered source-test factory.
        direct = authority._SourceTestGenerationTrustIssuer(
            authority._SOURCE_TEST_ISSUER_SEAL, registry_id=_uuid(), registry=object(),
            supervisor=self.supervisor, custodian=self.custodian,
            ingress_store=self.ingress,
            registry_path=self.root / 'forged-exact-contexts.jsonl')
        direct_trust = direct._issue_original_trust_entry(
            {**statement, 'enrollmentId': _uuid()}, production,
            ledger_path=str(self.root / 'forged-exact-ledger.jsonl'))
        direct_context = direct.enroll_generation_authority(
            direct_trust, self.supervisor, self.custodian, self.ingress)
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError) as caught:
            authority.ConfiguredGenerationEnrollmentAuthority(
                production, context=direct_context,
                ledger_path=str(self.root / 'forged-exact-ledger.jsonl'))
        self.assertEqual(caught.exception.code, 'generation-authority-context-unverified')

    def test_registered_origin_purpose_invariant_preserves_both_real_purposes(self) -> None:
        unmarked = {'profile': authority.CONTEXT_PROFILE}
        for purpose in authority.PURPOSES:
            authority._check_issuer_purpose('production', unmarked, purpose)
        authority._check_issuer_purpose(
            'source-test', {**unmarked, 'sourceTestOnly': True}, 'native-acceptance')
        for origin, projection, purpose in (
                ('production', {**unmarked, 'sourceTestOnly': True}, 'production'),
                ('source-test', {**unmarked, 'sourceTestOnly': True}, 'production'),
                ('source-test', unmarked, 'native-acceptance')):
            with (self.subTest(origin=origin, purpose=purpose),
                  self.assertRaises(authority.GenerationEnrollmentAuthorityError)):
                authority._check_issuer_purpose(origin, projection, purpose)

    def test_duplicate_effect_key_and_no_create_recovery(self) -> None:
        intent = self._prepare_intent()
        first = self.auth.prepare_request(authority.PREPARE_SCOPE, intent, self.identity)
        second = self.auth.prepare_request(authority.PREPARE_SCOPE, intent, self.identity)
        self.assertEqual(first.request_id, second.request_id)
        events = self.auth._ledger.events(create=False)
        self.assertEqual(sum(event['kind'] == 'request-prepared' for event in events), 1)

        absent = authority._Ledger(self.root / 'missing.jsonl', self.config['authorityId'],
                                   _digest(authority._canonical(self.config)),
                                   _digest(self.context._projection_bytes), self.config['purpose'])
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            absent.events(create=False)
        self.assertFalse((self.root / 'missing.jsonl').exists())
        self.assertFalse((self.root / 'missing.jsonl.lock').exists())

    def test_existing_context_never_recreates_missing_ledger(self) -> None:
        ledger = self.root / 'approvals.jsonl'
        lock = ledger.with_name(ledger.name + '.lock')
        ledger.unlink()
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            restarted = authority.ConfiguredGenerationEnrollmentAuthority(
                self.config, context=self.context, ledger_path=str(ledger))
            restarted.allocate_identity()
        self.assertFalse(ledger.exists())
        self.assertTrue(lock.exists())

    def test_existing_context_never_recreates_missing_ledger_lock(self) -> None:
        ledger = self.root / 'approvals.jsonl'
        lock = ledger.with_name(ledger.name + '.lock')
        lock.unlink()
        with self.assertRaises(authority.GenerationEnrollmentAuthorityError):
            restarted = authority.ConfiguredGenerationEnrollmentAuthority(
                self.config, context=self.context, ledger_path=str(ledger))
            restarted.allocate_identity()
        self.assertTrue(ledger.exists())
        self.assertFalse(lock.exists())

    def test_context_recovery_uses_original_durable_entry(self) -> None:
        context_id = self.context.public_reference['contextId']
        self.issuer._contexts.clear()
        recovered = self.issuer.recover_generation_authority_context(
            context_id, self.trust, self.supervisor, self.custodian, self.ingress)
        self.assertIsNot(recovered, self.context)
        self.assertEqual(recovered.public_reference, self.context.public_reference)
        self.assertIs(recovered._trust, self.trust)
        self.assertTrue(recovered.public_reference['sourceTestOnly'])

    @unittest.skipUnless('fork' in multiprocessing.get_all_start_methods(),
                         'cross-process flock control requires fork')
    def test_concurrent_context_reservation_has_one_original_record(self) -> None:
        global _CONCURRENT_CONTEXT
        registry = self.root / 'concurrent-contexts.jsonl'
        issuer = authority._source_test_generation_trust_issuer(
            registry_id=_uuid(), registry=object(), supervisor=self.supervisor,
            custodian=self.custodian, ingress_store=self.ingress,
            registry_path=str(registry))
        statement = authority._parse_canonical(self.trust._statement_bytes)
        statement['enrollmentId'] = _uuid()
        statement['ownerBootstrapContextDigest'] = _digest('concurrent-context-bootstrap')
        trust = issuer._issue_original_trust_entry(
            statement, self.config, ledger_path=str(self.root / 'concurrent-approvals.jsonl'))
        _CONCURRENT_CONTEXT = (issuer, trust, self.supervisor,
                               self.custodian, self.ingress)
        context = multiprocessing.get_context('fork')
        start = context.Event(); output = context.Queue()
        children = [context.Process(target=_concurrent_context_worker, args=(start, output))
                    for _ in range(2)]
        for child in children:
            child.start()
        start.set()
        results = [output.get(timeout=5) for _ in children]
        for child in children:
            child.join(timeout=5)
            self.assertFalse(child.is_alive(), 'context contender did not terminate')
            self.assertEqual(child.exitcode, 0)
        self.assertEqual([result[0] for result in results], ['created', 'created'], results)
        lines = registry.read_bytes().splitlines()
        self.assertEqual(len(lines), 2)
        recovered = issuer.recover_generation_authority_context(
            trust._entry_id, trust, self.supervisor, self.custodian, self.ingress)
        self.assertEqual(recovered.public_reference['contextId'], trust._entry_id)
        _CONCURRENT_CONTEXT = None

    @unittest.skipUnless('fork' in multiprocessing.get_all_start_methods(),
                         'cross-process flock control requires fork')
    def test_concurrent_request_key_has_one_durable_winner(self) -> None:
        global _CONCURRENT
        intent = self._prepare_intent()
        _CONCURRENT = (self.config, self.context, str(self.root / 'approvals.jsonl'),
                       self.identity.enrollment_id, intent)
        context = multiprocessing.get_context('fork')
        start = context.Event(); output = context.Queue()
        children = [context.Process(target=_concurrent_prepare_worker, args=(start, output))
                    for _ in range(2)]
        for child in children:
            child.start()
        start.set()
        results = [output.get(timeout=5) for _ in children]
        for child in children:
            child.join(timeout=5)
            self.assertFalse(child.is_alive(), 'request contender did not terminate')
            self.assertEqual(child.exitcode, 0)
        self.assertEqual(sum(result[0] == 'created' for result in results), 2, results)
        self.assertEqual(results[0][1], results[1][1])
        events = self.auth._ledger.events(create=False)
        prepared = [event for event in events if event['kind'] == 'request-prepared']
        self.assertEqual(len(prepared), 1)
        _CONCURRENT = None


if __name__ == '__main__':
    unittest.main()

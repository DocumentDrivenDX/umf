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
import uuid
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from umf_access.canonical import canonical_json as public_canonical_json
from umf_access.lifecycle.owner_approval_core import OwnerApprovalCore
from umf_access.lifecycle.owner_authority import (
    _SIGNATURE_DOMAIN,
    ConfiguredEd25519OwnerAuthority,
    OwnerAuthorityError,
    OwnerAuthoritySession,
    _canonical_bytes,
    _digest_bytes,
)
from umf_access.native_program import canonical_json


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('ascii').rstrip('=')


def _hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class OwnerAuthorityTests(unittest.TestCase):
    def test_canonical_json_is_reexported_without_changing_utf16_ordering(self):
        self.assertIs(canonical_json, public_canonical_json)
        value = {'\U00010000': 1, '\ue000': 2, 'plain': 3}
        expected = '{"plain":3,"𐀀":1,"":2}'
        self.assertEqual(canonical_json(value), expected)
        self.assertEqual(canonical_json(value).encode('utf-8'), expected.encode('utf-8'))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='umf-owner-authority-')
        self.root = Path(self.temp.name).resolve()
        os.chmod(self.root, 0o700)
        self.private_key = Ed25519PrivateKey.generate()
        self.test_issuers = []
        self.public_key = self.private_key.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.config = self._config()
        self.authority = self._authority(self.config, self.root / 'approval-ledger.jsonl')
        self.evidence = self._intent()
        self.intent = {'profile': 'umf.owner-store-create-intent/0.1',
                       'store': {'profile': 'umf.pg-generation-ingress-store/0.1',
                                 'storeId': '33333333-3333-4333-8333-333333333333',
                                 'schemaName': 'umf_ingress_33333333333343338333333333333333'},
                       'evidence': self.evidence}
        self.intent_bytes = canonical_json(self.intent).encode('utf-8')

    def tearDown(self):
        from umf_access.lifecycle import ingress_local_postgres as native

        for issuer in self.test_issuers:
            native._BOOTSTRAP_ISSUERS.pop(id(issuer), None)
        self.temp.cleanup()

    @contextmanager
    def _synthetic_native_lease(self, supervisor, operation_kind):
        from umf_access.lifecycle import ingress_local_postgres as native

        lease = SimpleNamespace(_operation_kind=operation_kind)
        object.__setattr__(supervisor, '_active_control_lease', lease)
        with patch.object(native, '_resolve_original_control_lease',
                          return_value=lease):
            yield

    def _config(self, *, public_key: bytes | None = None, scopes=None,
                supervisor_ids=None, provider_ids=None, installation_ids=None):
        return {
            'profile': 'umf.configured-owner-authority/0.1',
            'authorityId': '11111111-1111-4111-8111-111111111111',
            'policyRevision': 'policy-2026-10',
            'purpose': 'native-acceptance',
            'keys': [{
                'keyId': 'owner-key-1', 'publicKey': _b64(public_key or self.public_key),
                'principalId': 'owner-service-prod',
                'scopes': scopes or ['local-target-creation', 'local-target-registration',
                                     'native-principal-preparation', 'native-store-creation',
                                     'disabled-epoch-provision',
                                     'generation-ingress-transition'],
                'supervisorIds': supervisor_ids or ['22222222-2222-4222-8222-222222222222'],
                'providerIds': provider_ids or ['33333333-3333-4333-8333-333333333333'],
                'installationIds': installation_ids or ['installation-a'],
            }],
        }

    def _authority(self, config, path):
        from umf_access.lifecycle import ingress_local_postgres as native

        issuer = object.__new__(native._LocalOwnerBootstrapIssuer)
        native._BOOTSTRAP_ISSUERS[id(issuer)] = issuer
        self.test_issuers.append(issuer)
        digest = _digest_bytes(_canonical_bytes(config))
        material = (config['purpose'], '44444444-4444-4444-8444-444444444444',
                    '22222222-2222-4222-8222-222222222222',
                    '33333333-3333-4333-8333-333333333333', 'installation-a', digest)
        with patch.object(native._LocalOwnerBootstrapIssuer,
                          '_owner_authority_context_material', lambda _self: material):
            from umf_access.lifecycle.owner_bootstrap import (
                _issue_owner_authority_context,
            )
            context = _issue_owner_authority_context(issuer, digest)
            return ConfiguredEd25519OwnerAuthority(
                config, ledger_path=path, context=context)

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
        return self.authority.prepare_request('native-store-creation', self.intent_bytes,
                                              context=self.authority.authority_context)

    def _scope_intents(self):
        d = lambda value: _hex(value)
        supervisor = '22222222-2222-4222-8222-222222222222'
        custodian = '44444444-4444-4444-8444-444444444444'
        provider = '33333333-3333-4333-8333-333333333333'
        installation = 'installation-a'
        flags = {'canLogin': False, 'superuser': False, 'createDatabase': False,
                 'createRole': False, 'replication': False, 'bypassRls': False,
                 'inherit': False}
        # Preserve an actual bootstrap observation, which can differ from the
        # fixed post-alter role profile signed below.
        maintenance_flags = {**flags, 'canLogin': True, 'superuser': True,
                             'createDatabase': True, 'createRole': True, 'inherit': True}
        maintenance_after_flags = {**flags, 'canLogin': True, 'superuser': True}
        controller_flags = {**flags, 'superuser': True}
        creation = {
            'profile': 'umf.local-postgresql-create-request/0.1',
            'supervisorId': supervisor, 'clusterId': '55555555-5555-4555-8555-555555555555',
            'incarnationId': '66666666-6666-4666-8666-666666666666',
            'installationId': installation, 'ownerUid': 501, 'databaseName': 'appdb',
            'businessOwner': 'business_owner', 'maintenanceName': 'umf_maintenance',
            'controllerName': 'umf_controller', 'controlDirectory': '/var/lib/umf/control',
            'dataDirectory': '/var/lib/postgresql/data', 'postgresPath': '/opt/pg/bin/postgres',
            'postgresSha256': d('1'), 'initdbPath': '/opt/pg/bin/initdb',
            'initdbSha256': d('2'), 'port': 55440, 'configDigest': d('3'), 'hbaDigest': d('4'),
        }
        principal = {
            'profile': 'umf.local-postgresql-principal-preparation/0.1',
            'preparationId': '77777777-7777-4777-8777-777777777777',
            'supervisorId': supervisor, 'custodianId': custodian, 'providerId': provider,
            'installationId': installation, 'creationRequestDigest': d('5'),
            'creationApprovalDigest': d('6'), 'bootstrapOriginDigest': d('7'),
            'bootstrapDatabase': {'oid': 5, 'name': 'postgres', 'systemIdentifier': '123456'},
            'maintenanceBefore': {'oid': 51001, 'name': 'umf_maintenance', 'flags': maintenance_flags},
            'maintenanceAfter': {'name': 'umf_maintenance', 'operation': 'alter-bootstrap',
                                 'flags': maintenance_after_flags},
            'controller': {'name': 'umf_controller', 'operation': 'create-absent',
                           'flags': controller_flags},
            'businessOwner': {'name': 'business_owner', 'operation': 'create-absent',
                              'flags': flags},
            'applicationDatabase': {'name': 'appdb', 'ownerName': 'business_owner',
                                    'encoding': 'UTF8', 'locale': 'C', 'operation': 'create-absent'},
            'memberships': [
                {'memberName': 'umf_maintenance', 'roleName': 'umf_controller',
                 'inherit': False, 'set': True, 'admin': False},
                {'memberName': 'umf_maintenance', 'roleName': 'business_owner',
                 'inherit': False, 'set': True, 'admin': False}],
            'maximumRoles': 3,
        }
        registration = {
            'profile': 'umf.owner-target-registration-intent/0.1',
            'registration': {
                'profile': 'umf.local-owner-target-registration/0.1',
                'registrationId': '88888888-8888-4888-8888-888888888888',
                'custodianId': custodian, 'providerId': provider,
                'installationId': installation,
                'origin': {'profile': 'postgresql18-local-supervised-origin/0.1',
                           'supervisorId': supervisor,
                           'clusterId': '55555555-5555-4555-8555-555555555555',
                           'incarnationId': '66666666-6666-4666-8666-666666666666',
                           'creationReceiptDigest': d('8'),
                           'nativeBinary': {'path': '/opt/pg/bin/postgres', 'sha256': d('1'), 'version': '18.6'},
                           'dataDirectory': {'path': '/var/lib/postgresql/data', 'device': '1', 'inode': '2', 'ownerUid': 501},
                           'initialPostmaster': {'pid': 42, 'startToken': 'boot-token', 'launchReceiptDigest': d('9')},
                           'database': {'name': 'appdb', 'oid': 5, 'systemIdentifier': '123456'},
                           'endpoint': {'host': '127.0.0.1', 'port': 55440}},
                'endpointControl': {'controllerId': '99999999-9999-4999-8999-999999999999',
                                    'profile': 'umf.local-postgresql-endpoint-controller/0.1',
                                    'authorityReceiptDigest': d('a')},
            },
        }
        custody = {'profile': 'umf.native-target-custody/0.1',
                   'custodianId': custodian,
                   'registrationId': registration['registration']['registrationId'],
                   'resourceId': '55555555-5555-4555-8555-555555555555',
                   'incarnation': '66666666-6666-4666-8666-666666666666',
                   'registrationDigest': d('b')}
        provision_request = {
            'profile': 'umf.ingress-epoch-provision/0.1', 'providerId': provider,
            'enrollmentId': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'installationId': installation, 'targetCustody': custody,
            'planDigest': d('1'), 'fileDigest': d('2'), 'expectedHead': d('3'),
            'previousSourceDigest': d('4'), 'nextSourceDigest': d('5'),
            'nextBundleDigest': d('6'), 'newEpoch': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'issuerProfile': 'umf.pg18.login-issuer/0.1',
            'principals': [{'loginName': 'login_a', 'subject': {'oid': 42001, 'name': 'subject_a'},
                            'audience': 'person'}], 'maximumRoles': 1,
        }
        transition_request = {
            'profile': 'umf.table-generation-ingress/0.1', 'providerId': provider,
            'enrollmentId': provision_request['enrollmentId'], 'installationId': installation,
            'targetIdentityDigest': d('7'), 'planDigest': d('1'), 'fileDigest': d('2'),
            'expectedHead': d('3'), 'previousSourceDigest': d('4'), 'nextSourceDigest': d('5'),
            'previousBundleDigest': d('6'), 'nextBundleDigest': d('7'),
            'oldEpoch': 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'newEpoch': 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            'oldPrincipalsDigest': d('8'), 'newPrincipalsDigest': d('9'),
            'approvalDigest': d('a'), 'targetCustody': custody,
            'executionPolicyDigest': d('b'),
        }
        return {
            'local-target-creation': creation,
            'native-principal-preparation': principal,
            'local-target-registration': registration,
            'native-store-creation': self.intent,
            'disabled-epoch-provision': {'profile': 'umf.owner-epoch-provision-intent/0.1',
                                         'request': provision_request},
            'generation-ingress-transition': {'profile': 'umf.owner-ingress-transition-intent/0.1',
                                              'request': transition_request},
        }

    def test_all_six_original_scope_intents_are_closed_and_context_bound(self):
        from umf_access.lifecycle import ingress_local_postgres as native

        supervisor = object.__new__(native.LocalPostgresSupervisor)
        supervisor._owner_core = self.authority._core
        supervisor._authority_context = self.authority.authority_context
        supervisor._bootstrap_issuer = self.authority.authority_context._issuer
        supervisor._profile = SimpleNamespace(purpose='native-acceptance')
        events = []
        journal = SimpleNamespace(read=lambda: {'events': list(events)})
        supervisor._journal = journal
        supervisor._native_effect_reservations = {}
        supervisor._native_effect_outcomes = {}
        session = OwnerAuthoritySession(
            self.authority, bootstrap_issuer=supervisor._bootstrap_issuer,
            supervisor=supervisor)

        for index, (scope, intent) in enumerate(self._scope_intents().items(), start=1):
            with self.subTest(scope=scope):
                raw = canonical_json(intent).encode()
                request = self.authority.prepare_request(scope, raw,
                                                         context=self.authority.authority_context)
                self.assertEqual(request.scope, scope)
                self.assertEqual(request.effect_key[0], scope)
                self.assertEqual(self.authority.export_signing_request(request)['intent'], intent)
                envelope = self._envelope(request)
                verified = self.authority.verify_approval(request, envelope)
                self.assertEqual(verified.scope, scope)
                self.assertEqual(verified.purpose, 'native-acceptance')

                reservation_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'g11-test:{scope}'))
                reservation_event = {
                    'sequence': index * 2 - 1,
                    'recordDigest': _hex(f'reservation:{scope}'),
                    'kind': 'native-effect-intent',
                    'payload': {'reservationId': reservation_id,
                                'effectKey': list(request.effect_key),
                                'payloadDigest': hashlib.sha256(raw).hexdigest()},
                }
                events.append(reservation_event)
                reservation = native._NativeEffectReservation(
                    native._NATIVE_EFFECT_RESERVATION_SEAL, supervisor,
                    request=request, approval=verified, scope=scope,
                    effect_key=request.effect_key, purpose='native-acceptance', target=None,
                    sequence=reservation_event['sequence'], payload_bytes=raw,
                    reservation_id=reservation_id,
                    journal_record_digest=reservation_event['recordDigest'])
                supervisor._native_effect_reservations[id(reservation)] = reservation
                operation_kind = {
                    'local-target-creation': 'target-apply',
                    'native-principal-preparation': 'principals-apply',
                    'local-target-registration': 'registration-apply',
                    'native-store-creation': 'store',
                    'disabled-epoch-provision': 'epoch',
                    'generation-ingress-transition': 'transition',
                }[scope]
                with self._synthetic_native_lease(supervisor, operation_kind):
                    binding = session.bind_native_effect(verified, reservation)
                pending = self.authority.observe_original_request(
                    self.authority.authority_context, request.effect_key)
                self.assertEqual(pending.approval_status, 'consumed')
                self.assertEqual(pending.effect_status, 'effect-pending')

                receipt = _hex(f'outcome:{scope}')
                outcome_event = {
                    'sequence': index * 2,
                    'recordDigest': _hex(f'outcome-event:{scope}'),
                    'kind': 'native-effect-confirmed',
                    'payload': {'reservationId': reservation_id,
                                'receiptDigest': receipt},
                }
                events.append(outcome_event)
                outcome = native._VerifiedNativeEffectOutcome(
                    native._NATIVE_EFFECT_OUTCOME_SEAL, supervisor, reservation,
                    sequence=outcome_event['sequence'], status='confirmed',
                    receipt_digest=receipt,
                    journal_record_digest=outcome_event['recordDigest'])
                supervisor._native_effect_outcomes[id(outcome)] = outcome
                with self._synthetic_native_lease(supervisor, operation_kind):
                    terminal = session.record_native_outcome(binding, outcome)
                self.assertEqual(terminal.approval_id, request._approval_id)
                self.assertEqual(terminal.scope, scope)
                self.assertEqual(terminal.approval_status, 'consumed')
                self.assertEqual(terminal.effect_status, 'confirmed')
                self.assertEqual(terminal.effect_receipt_digest, receipt)

    def test_each_scope_requires_every_top_level_member(self):
        for scope, intent in self._scope_intents().items():
            for member in intent:
                with self.subTest(scope=scope, missing=member):
                    malformed = copy.deepcopy(intent)
                    del malformed[member]
                    with self.assertRaisesRegex(OwnerAuthorityError, 'owner-intent-invalid'):
                        self.authority.prepare_request(
                            scope, canonical_json(malformed).encode(),
                            context=self.authority.authority_context)

    def test_store_profiles_are_fixed_and_transition_keeps_plan_approval_digest(self):
        original = copy.deepcopy(self.intent)
        original['store'] = {
            'profile': 'umf.native-row-originals-store/0.1',
            'storeId': '33333333-3333-4333-8333-333333333333',
            'schemaName': 'umf_originals_33333333333343338333333333333333',
        }
        self.authority.prepare_request('native-store-creation', canonical_json(original).encode(),
                                       context=self.authority.authority_context)
        original['store']['schemaName'] = 'umf_originals_wrong'
        with self.assertRaisesRegex(OwnerAuthorityError, 'owner-intent-invalid'):
            self.authority.prepare_request('native-store-creation', canonical_json(original).encode(),
                                           context=self.authority.authority_context)
        transition = self._scope_intents()['generation-ingress-transition']
        exported_request = self.authority.prepare_request(
            'generation-ingress-transition', canonical_json(transition).encode(),
            context=self.authority.authority_context)
        exported = self.authority.export_signing_request(exported_request)
        self.assertEqual(exported['intent']['request']['approvalDigest'],
                         transition['request']['approvalDigest'])
        transition['request']['ingressApprovalDigest'] = _hex('c')
        with self.assertRaisesRegex(OwnerAuthorityError, 'owner-intent-invalid'):
            self.authority.prepare_request('generation-ingress-transition',
                                           canonical_json(transition).encode(),
                                           context=self.authority.authority_context)

    def test_each_scope_rejects_unknown_members_and_changed_effect_key_intent(self):
        for scope, intent in self._scope_intents().items():
            with self.subTest(scope=scope):
                malformed = copy.deepcopy(intent)
                malformed['extra'] = 'not admitted'
                with self.assertRaisesRegex(OwnerAuthorityError, 'owner-intent-invalid'):
                    self.authority.prepare_request(
                        scope, canonical_json(malformed).encode(),
                        context=self.authority.authority_context)
        original = self._scope_intents()['local-target-creation']
        raw = canonical_json(original).encode()
        request = self.authority.prepare_request(
            'local-target-creation', raw, context=self.authority.authority_context)
        changed = copy.deepcopy(original)
        changed['hbaDigest'] = _hex('c')
        with self.assertRaisesRegex(OwnerAuthorityError, 'original-request-invalid'):
            self.authority.prepare_request(
                'local-target-creation', canonical_json(changed).encode(),
                context=self.authority.authority_context)
        self.assertEqual(self.authority.export_signing_request(request)['intent'], original)

    def test_expected_head_null_refuses_for_both_purposes(self):
        intent = self._scope_intents()['disabled-epoch-provision']
        intent['request']['expectedHead'] = None
        for purpose in ('native-acceptance', 'production'):
            with self.subTest(purpose=purpose):
                config = self._config()
                config['purpose'] = purpose
                authority = self._authority(config, self.root / f'{purpose}-null-head.jsonl')
                with self.assertRaisesRegex(OwnerAuthorityError, 'owner-intent-invalid'):
                    authority.prepare_request('disabled-epoch-provision',
                                              canonical_json(intent).encode(),
                                              context=authority.authority_context)

    def test_scope_two_observed_role_flags_and_membership_types(self):
        base = self._scope_intents()['native-principal-preparation']
        self.authority.prepare_request('native-principal-preparation',
                                       canonical_json(base).encode(),
                                       context=self.authority.authority_context)
        renamed = copy.deepcopy(base)
        renamed['maintenanceAfter']['name'] = 'different_maintenance'
        with self.assertRaisesRegex(OwnerAuthorityError, 'owner-intent-invalid'):
            self.authority.prepare_request('native-principal-preparation',
                                           canonical_json(renamed).encode(),
                                           context=self.authority.authority_context)
        numeric_flags = copy.deepcopy(base)
        numeric_flags['memberships'][0].update(inherit=0, set=1, admin=0)
        with self.assertRaisesRegex(OwnerAuthorityError, 'owner-intent-invalid'):
            self.authority.prepare_request('native-principal-preparation',
                                           canonical_json(numeric_flags).encode(),
                                           context=self.authority.authority_context)

    def test_native_oid_uses_uint32_and_database_role_names_are_distinct_only(self):
        store = copy.deepcopy(self._scope_intents()['native-store-creation'])
        for role in ('maintenance', 'controller', 'businessOwner'):
            store['evidence'][role]['oid'] = 2**32
        for edge in store['evidence']['requiredMemberships']:
            edge['memberOid'] = 2**32
        with self.assertRaisesRegex(OwnerAuthorityError, 'owner-intent-invalid'):
            self.authority.prepare_request('native-store-creation',
                                           canonical_json(store).encode(),
                                           context=self.authority.authority_context)
        creation = copy.deepcopy(self._scope_intents()['local-target-creation'])
        creation['databaseName'] = creation['businessOwner']
        self.authority.prepare_request('local-target-creation',
                                       canonical_json(creation).encode(),
                                       context=self.authority.authority_context)

    def test_rehashed_ledger_rejects_mismatched_effect_outcome_and_stable_key(self):
        for case in ('outcome-reservation', 'stable-key'):
            with self.subTest(case=case):
                self.authority = self._authority(self.config, self.root / f'{case}.jsonl')
                self.test_all_six_original_scope_intents_are_closed_and_context_bound()
                ledger = self.root / f'{case}.jsonl'
                rows = [json.loads(line) for line in ledger.read_text().splitlines()]
                if case == 'outcome-reservation':
                    target = next(row for row in rows if row.get('kind') == 'effect-outcome')
                    target['payload']['reservationDigest'] = _hex('wrong-reservation')
                else:
                    target = next(row for row in rows if row.get('kind') == 'request-prepared')
                    target['payload']['stableKey'] = ['unrelated-context', 'wrong-effect-key']
                previous = rows[0]['digest']
                for row in rows[1:]:
                    row['previousDigest'] = previous
                    body = {key: row[key] for key in
                            ('sequence', 'previousDigest', 'kind', 'payload')}
                    row['digest'] = hashlib.sha256(canonical_json(body).encode()).hexdigest()
                    previous = row['digest']
                ledger.write_text(''.join(canonical_json(row) + '\n' for row in rows))
                with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-corrupt'):
                    self.authority.observe_approval(self._request())

    def test_context_is_mandatory_and_cannot_be_substituted(self):
        with self.assertRaisesRegex(OwnerAuthorityError, 'context-mismatch'):
            self.authority.prepare_request('native-store-creation', self.intent_bytes,
                                           context=object())
        other = self._authority(self.config, self.root / 'second-ledger.jsonl')
        with self.assertRaisesRegex(OwnerAuthorityError, 'context-mismatch'):
            self.authority.prepare_request('native-store-creation', self.intent_bytes,
                                           context=other.authority_context)

    def test_native_effect_binding_consumes_once_and_records_only_verified_outcome(self):
        from umf_access.lifecycle import ingress_local_postgres as native

        request = self._request()
        approval = self.authority.verify_approval(request, self._envelope(request))
        supervisor = object.__new__(native.LocalPostgresSupervisor)
        supervisor._owner_core = self.authority._core
        supervisor._authority_context = self.authority.authority_context
        supervisor._bootstrap_issuer = self.authority.authority_context._issuer
        supervisor._profile = SimpleNamespace(purpose='native-acceptance')
        event = {'sequence': 1, 'recordDigest': _hex('1'),
                 'kind': 'native-effect-intent',
                 'payload': {'reservationId': 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                             'effectKey': list(request.effect_key),
                             'payloadDigest': hashlib.sha256(request._intent_bytes).hexdigest()}}
        journal = SimpleNamespace(read=lambda: {'events': [event]})
        supervisor._journal = journal
        reservation = native._NativeEffectReservation(
            native._NATIVE_EFFECT_RESERVATION_SEAL, supervisor,
            request=request, approval=approval, scope=request.scope,
            effect_key=request.effect_key, purpose='native-acceptance', target=None,
            sequence=1, payload_bytes=request._intent_bytes,
            reservation_id=event['payload']['reservationId'],
            journal_record_digest=event['recordDigest'])
        supervisor._native_effect_reservations = {id(reservation): reservation}
        supervisor._native_effect_outcomes = {}
        session = OwnerAuthoritySession(
            self.authority, bootstrap_issuer=supervisor._bootstrap_issuer,
            supervisor=supervisor)

        with self._synthetic_native_lease(supervisor, 'store'):
            binding = session.bind_native_effect(approval, reservation)
            self.assertIs(session.bind_native_effect(approval, reservation), binding)
        pending = self.authority.observe_original_request(
            self.authority.authority_context, request.effect_key)
        self.assertEqual(pending.approval_status, 'consumed')
        self.assertEqual(pending.effect_status, 'effect-pending')
        with (self._synthetic_native_lease(supervisor, 'store'),
              self.assertRaisesRegex(OwnerAuthorityError, 'native-outcome-untrusted')):
            session.record_native_outcome(binding, {'status': 'confirmed'})

        receipt = _hex('2')
        outcome_event = {'sequence': 2, 'recordDigest': _hex('3'),
                         'kind': 'native-effect-confirmed',
                         'payload': {'reservationId': reservation.reservation_id,
                                     'receiptDigest': receipt}}
        journal.read = lambda: {'events': [event, outcome_event]}
        native_outcome = native._VerifiedNativeEffectOutcome(
            native._NATIVE_EFFECT_OUTCOME_SEAL, supervisor, reservation,
            sequence=2, status='confirmed', receipt_digest=receipt,
            journal_record_digest=outcome_event['recordDigest'])
        supervisor._native_effect_outcomes[id(native_outcome)] = native_outcome
        with self._synthetic_native_lease(supervisor, 'store'):
            completed = session.record_native_outcome(binding, native_outcome)
        self.assertEqual(completed.effect_status, 'confirmed')
        self.assertEqual(completed.effect_receipt_digest, receipt)

    def _envelope(self, request, *, mutate_payload=None, private_key=None):
        exported = self.authority.export_signing_request(request)
        payload = copy.deepcopy(exported['payload'])
        if mutate_payload:
            mutate_payload(payload)
        signature = (private_key or self.private_key).sign(
            _SIGNATURE_DOMAIN + canonical_json(payload).encode('utf-8'))
        return {'payload': payload, 'signature': _b64(signature)}

    def _run_forced_registry_interleaving(self, method_name, first_call, second_call):
        original = getattr(OwnerApprovalCore, method_name)
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

        with patch.object(OwnerApprovalCore, method_name, delayed):
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
        exported['intent']['evidence']['businessOwner']['name'] = 'attacker'
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
        self.assertEqual(outcome.approval_status, 'consumed')
        self.assertEqual(outcome.effect_status, 'prepared')
        resolved = self.authority._resolve_verified_approval(
            verified, original_request=request, scope='native-store-creation',
            intent_digest=verified.intent_digest)
        self.assertIs(resolved, verified)
        with self.assertRaisesRegex(OwnerAuthorityError, 'native-reservation-required'):
            self.authority._core._consume_verified_approval(
                verified, original_request=request, scope='native-store-creation',
                intent_digest=verified.intent_digest)
        self.assertEqual(self.authority.observe_approval(request).effect_status,
                         'prepared')

    def test_original_signature_resolves_after_authority_restart(self):
        request = self._request()
        envelope = self._envelope(request)
        first = self.authority.verify_approval(request, envelope)
        restarted = self._authority(self.config, self.root / 'approval-ledger.jsonl')
        # Recreate the exact original request from the same scope and intent.
        replay_request = restarted.prepare_request('native-store-creation', self.intent_bytes, context=restarted.authority_context)
        # Current implementation never substitutes a different request ID.
        # A restarted authority must resolve from durable records, not mint one.
        self.assertEqual(replay_request._approval_id, first.approval_id)

    def test_recovery_resolves_only_original_request_without_creating_history(self):
        request = self._request()
        envelope = self._envelope(request)
        verified = self.authority.verify_approval(request, envelope)
        restarted = self._authority(self.config, self.root / 'approval-ledger.jsonl')
        recovered = restarted._recover_original_request(
            request.scope, self.intent_bytes, context=restarted.authority_context,
            expected_approval_id=request._approval_id)
        self.assertEqual(recovered._approval_id, request._approval_id)
        repeated = restarted._recover_verified_approval(recovered)
        self.assertEqual(repeated.approval_id, verified.approval_id)
        self.assertEqual(repeated._approval_digest, verified._approval_digest)
        self.assertEqual(restarted.observe_approval(recovered).approval_status, 'consumed')

        absent_path = self.root / 'must-not-be-created.jsonl'
        absent = self._authority(self.config, absent_path)
        with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-unavailable'):
            absent._recover_original_request(
                'native-store-creation', self.intent_bytes,
                context=absent.authority_context,
                expected_approval_id=request._approval_id)
        with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-unavailable'):
            absent.observe_original_request(absent.authority_context, request.effect_key)
        self.assertFalse(absent_path.exists())
        self.assertFalse(absent_path.with_name(absent_path.name + '.lock').exists())

    def test_recover_verified_approval_refuses_unapproved_request_without_writes(self):
        request = self._request()
        ledger = self.root / 'approval-ledger.jsonl'
        restarted = self._authority(self.config, ledger)
        recovered = restarted._recover_original_request(
            request.scope, self.intent_bytes, context=restarted.authority_context,
            expected_approval_id=request._approval_id)
        # A prepared request alone is not a signed decision and cannot be
        # promoted to an approval during recovery.
        with self.assertRaisesRegex(OwnerAuthorityError, 'owner-approval-original-approval-unavailable'):
            restarted._recover_verified_approval(recovered)
        self.assertEqual(restarted.observe_approval(recovered).approval_status, 'prepared')

    def test_observation_of_removed_history_does_not_recreate_it(self):
        request = self._request()
        ledger = self.root / 'approval-ledger.jsonl'
        lock = ledger.with_name(ledger.name + '.lock')
        ledger.unlink()
        lock.unlink()
        with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-unavailable'):
            self.authority.observe_approval(request)
        self.assertFalse(ledger.exists())
        self.assertFalse(lock.exists())

    def test_recovery_refuses_changed_intent_or_approval_identity(self):
        request = self._request()
        changed = copy.deepcopy(self.intent)
        changed['store']['schemaName'] = 'umf_ingress_changed'
        with self.assertRaisesRegex(OwnerAuthorityError, 'owner-intent-invalid'):
            self.authority._recover_original_request(
                request.scope, canonical_json(changed).encode(),
                context=self.authority.authority_context,
                expected_approval_id=request._approval_id)
        with self.assertRaisesRegex(OwnerAuthorityError, 'original-request-invalid'):
            self.authority._recover_original_request(
                request.scope, self.intent_bytes,
                context=self.authority.authority_context,
                expected_approval_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

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
            '_make_request', lambda: self.authority._core.prepare_request(
                'native-store-creation', self.intent_bytes,
                context=self.authority.authority_context),
            lambda: self.authority._core.prepare_request(
                'native-store-creation', self.intent_bytes,
                context=self.authority.authority_context))
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(requests), 2)
        self.assertIs(requests[0], requests[1])

    def test_same_issuer_concurrent_verify_returns_one_capability(self):
        request = self._request()
        envelope = self._envelope(request)
        calls, approvals = self._run_forced_registry_interleaving(
            '_make_verified',
            lambda: self.authority._core.verify_approval(request, envelope),
            lambda: self.authority._core.verify_approval(request, envelope))
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(approvals), 2)
        self.assertIs(approvals[0], approvals[1])
        self.assertIs(self.authority._resolve_verified_approval(
            approvals[1], original_request=request, scope='native-store-creation',
            intent_digest=approvals[0].intent_digest), approvals[0])

    def test_concurrent_preparation_reserves_one_original_request(self):
        second = self._authority(self.config, self.root / 'approval-ledger.jsonl')
        barrier = threading.Barrier(2)
        requests = []
        failures = []

        def prepare(authority):
            try:
                barrier.wait(timeout=2)
                requests.append(authority.prepare_request(
                    'native-store-creation', self.intent_bytes, context=authority.authority_context))
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
        with self.assertRaisesRegex(OwnerAuthorityError, 'request-mismatch'):
            self.authority.verify_approval(
                request, self._envelope(request, mutate_payload=lambda p: p.update(purpose='production')))

    def test_wrong_target_policy_and_scope_never_prepare(self):
        bad = self._authority(self._config(supervisor_ids=['99999999-9999-4999-8999-999999999999']),
                              self.root / 'bad-ledger.jsonl')
        with self.assertRaisesRegex(OwnerAuthorityError, 'target-not-authorized'):
            bad.prepare_request('native-store-creation', self.intent_bytes, context=bad.authority_context)
        wrong_policy = copy.deepcopy(self.intent)
        wrong_policy['evidence']['ownerPolicyRevision'] = 'other'
        with self.assertRaisesRegex(OwnerAuthorityError, 'authority-mismatch'):
            self.authority.prepare_request('native-store-creation', canonical_json(wrong_policy).encode(), context=self.authority.authority_context)
        with self.assertRaisesRegex(OwnerAuthorityError, 'scope-invalid'):
            self.authority.prepare_request('not-a-scope', self.intent_bytes, context=self.authority.authority_context)
        with self.assertRaisesRegex(OwnerAuthorityError, 'owner-intent-invalid'):
            self.authority.prepare_request('native-principal-preparation', self.intent_bytes, context=self.authority.authority_context)

    def test_closed_configuration_and_intent_shapes_refuse(self):
        bad = self._config()
        bad['extra'] = True
        with self.assertRaisesRegex(OwnerAuthorityError, 'config-invalid'):
            self._authority(bad, self.root / 'bad-config.jsonl')
        bad_intent = dict(self.intent, unexpected=True)
        with self.assertRaisesRegex(OwnerAuthorityError, 'intent-invalid'):
            self.authority.prepare_request('native-store-creation', canonical_json(bad_intent).encode(), context=self.authority.authority_context)

    def test_noncanonical_duplicate_float_and_oversized_intent_refuse(self):
        with self.assertRaisesRegex(OwnerAuthorityError, 'noncanonical'):
            self.authority.prepare_request('native-store-creation', b'{"x":1, "y":2}', context=self.authority.authority_context)
        with self.assertRaisesRegex(OwnerAuthorityError, 'intent-invalid'):
            self.authority.prepare_request('native-store-creation', b'{"x":1.0}', context=self.authority.authority_context)
        with self.assertRaisesRegex(OwnerAuthorityError, 'intent-capacity'):
            self.authority.prepare_request('native-store-creation', b' ' * 65_537, context=self.authority.authority_context)

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
        clean_owner = self._authority(self.config, clean_path)
        clean_owner.prepare_request('native-store-creation', self.intent_bytes,
                                    context=clean_owner.authority_context)
        authority = self._authority(other, clean_path)
        with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-binding-mismatch'):
            changed_intent = copy.deepcopy(self.intent)
            changed_intent['evidence']['ownerAuthorityId'] = other['authorityId']
            changed_intent['evidence']['ownerPolicyRevision'] = other['policyRevision']
            authority.prepare_request('native-store-creation', canonical_json(changed_intent).encode(), context=authority.authority_context)

    def test_ledger_request_payload_binding_is_rechecked_after_rehash(self):
        self._request()
        ledger = self.root / 'approval-ledger.jsonl'
        rows = [json.loads(line) for line in ledger.read_text().splitlines()]
        rows[1]['payload']['payloadDigest'] = _hex('different payload')
        body = {key: rows[1][key] for key in ('sequence', 'previousDigest', 'kind', 'payload')}
        rows[1]['digest'] = hashlib.sha256(canonical_json(body).encode()).hexdigest()
        ledger.write_text(''.join(canonical_json(row) + '\n' for row in rows))
        restarted = self._authority(self.config, ledger)
        with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-corrupt'):
            restarted.prepare_request('native-store-creation', self.intent_bytes, context=restarted.authority_context)

    def test_hardlinked_ledger_is_rejected(self):
        ledger = self.root / 'approval-ledger.jsonl'
        ledger.write_text('')
        os.chmod(ledger, 0o600)
        os.link(ledger, self.root / 'ledger-alias')
        authority = self._authority(self.config, ledger)
        with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-unavailable'):
            authority.prepare_request('native-store-creation', self.intent_bytes, context=authority.authority_context)

    def test_existing_unsafe_permissions_are_not_repaired(self):
        ledger = self.root / 'unsafe-ledger.jsonl'
        ledger.write_text('')
        os.chmod(ledger, 0o644)
        authority = self._authority(self.config, ledger)
        with self.assertRaisesRegex(OwnerAuthorityError, 'ledger-unavailable'):
            authority.prepare_request('native-store-creation', self.intent_bytes, context=authority.authority_context)
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

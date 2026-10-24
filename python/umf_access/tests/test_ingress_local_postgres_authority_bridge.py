"""Real authority/supervisor bridge control with fabricated native journal only."""
from __future__ import annotations

import base64
import hashlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from umf_access.lifecycle import ingress_local_postgres as native
from umf_access.lifecycle.owner_authority import (
    _SIGNATURE_DOMAIN,
    ConfiguredEd25519OwnerAuthority,
    _canonical_bytes,
)


class RealAuthoritySupervisorBridgeTests(unittest.TestCase):
    """The fixture is real source/config; process and journal effects are fabricated."""

    def test_signed_creation_request_crosses_native_reservation_resolver(self) -> None:
        with tempfile.TemporaryDirectory(prefix='g11-owner-bridge-') as temporary:
            root = Path(temporary).resolve()
            os.chmod(root, 0o700)
            control_home, data_home = root / 'control', root / 'data'
            control_home.mkdir(mode=0o700)
            data_home.mkdir(mode=0o700)
            private_key = Ed25519PrivateKey.generate()
            public_key = private_key.public_key().public_bytes(
                serialization.Encoding.Raw, serialization.PublicFormat.Raw)
            supervisor_id = '22222222-2222-4222-8222-222222222222'
            custodian_id = '44444444-4444-4444-8444-444444444444'
            provider_id = '33333333-3333-4333-8333-333333333333'
            authority_id = '11111111-1111-4111-8111-111111111111'
            installation_id = 'g11-source-fixture'
            key = {
                'keyId': 'owner-fixture',
                'publicKey': base64.urlsafe_b64encode(public_key).decode('ascii').rstrip('='),
                'principalId': 'fixture-owner',
                'scopes': ['local-target-creation'],
                'supervisorIds': [supervisor_id], 'providerIds': [provider_id],
                'installationIds': [installation_id],
            }
            config = {
                'profile': 'umf.configured-owner-authority/0.1',
                'authorityId': authority_id, 'policyRevision': 'fixture-policy-1',
                'purpose': 'native-acceptance', 'keys': [key],
            }
            with patch.object(native, 'sys_platform_darwin', return_value=True):
                profile = native.LocalPostgresProfile(
                    control_home=control_home, data_home=data_home,
                    postgres_binary=root / 'postgres', initdb_binary=root / 'initdb',
                    process_observer=root / 'observer', process_observer_sha256='a' * 64,
                    port=55439, database_name='fixturedb', business_owner='fixture_owner',
                    custodian_id=custodian_id, supervisor_id=supervisor_id,
                    provider_id=provider_id, installation_id=installation_id,
                    purpose='native-acceptance')
            enrollment = {
                'profile': 'umf.local-owner-bootstrap-enrollment/0.1',
                'enrollmentId': '55555555-5555-4555-8555-555555555555',
                'purpose': 'native-acceptance',
                'context': {'custodianId': custodian_id, 'supervisorId': supervisor_id,
                            'providerId': provider_id, 'installationId': installation_id},
                'ownerConfiguration': config,
                'nativeProfile': native._profile_to_enrollment(profile),
            }
            native._write_private(
                control_home / 'owner-bootstrap-enrollment.json',
                native._canonical(enrollment))

            with patch.object(native, 'sys_platform_darwin', return_value=True), \
                    patch.object(native, '_DarwinProcessObserver', return_value=object()):
                issuer = native._issue_local_owner_bootstrap_issuer(profile)
                authority = ConfiguredEd25519OwnerAuthority(
                    config, ledger_path=control_home / 'owner-approvals.jsonl',
                    bootstrap_issuer=issuer)
                supervisor = native.LocalPostgresSupervisor(
                    profile, owner_authority=authority)

            intent = {
                'profile': 'umf.local-postgresql-create-request/0.1',
                'supervisorId': supervisor_id,
                'clusterId': '66666666-6666-4666-8666-666666666666',
                'incarnationId': '77777777-7777-4777-8777-777777777777',
                'installationId': installation_id, 'ownerUid': os.geteuid(),
                'databaseName': 'fixturedb', 'businessOwner': 'fixture_owner',
                'maintenanceName': 'umf_maintenance', 'controllerName': 'umf_controller',
                'controlDirectory': str(control_home / supervisor_id.replace('-', '')),
                'dataDirectory': str(data_home / supervisor_id.replace('-', '')),
                'postgresPath': str(root / 'postgres'), 'postgresSha256': '1' * 64,
                'initdbPath': str(root / 'initdb'), 'initdbSha256': '2' * 64,
                'port': 55439, 'configDigest': '3' * 64, 'hbaDigest': '4' * 64,
            }
            request = authority.prepare_request(
                'local-target-creation', _canonical_bytes(intent),
                context=supervisor.authority_context)
            exported = authority.export_signing_request(request)
            signature = private_key.sign(
                _SIGNATURE_DOMAIN + _canonical_bytes(exported['payload']))
            envelope = {'payload': exported['payload'],
                        'signature': base64.urlsafe_b64encode(signature)
                                     .decode('ascii').rstrip('=')}
            approval = authority.verify_approval(request, envelope)

            payload = _canonical_bytes(intent)
            event_record = {'sequence': 1, 'recordDigest': hashlib.sha256(b'fixture').hexdigest(),
                            'kind': 'creation-intent', 'payload': intent}

            class Journal:
                def __init__(self):
                    self.events = [event_record]

                def read(self):
                    return {'events': list(self.events)}

                def append(self, kind, data):
                    body = {'sequence': len(self.events) + 1, 'kind': kind,
                            'payload': data}
                    body['recordDigest'] = native._digest(body)
                    self.events.append(body)
                    return {'sequence': body['sequence'],
                            'recordDigest': body['recordDigest']}

            supervisor._journal = Journal()
            reservation = supervisor._make_native_effect_reservation(
                request, approval, 'local-target-creation', request.effect_key,
                'native-acceptance', None, event_record, payload)
            self.assertIs(supervisor._resolve_native_effect_reservation(
                reservation, approval), reservation)
            authority_binding = authority.bind_native_effect(approval, reservation)
            self.assertIsNotNone(authority_binding)
            supervisor._native_effect_bindings[id(reservation)] = authority_binding
            observed = authority.observe_original_request(
                supervisor.authority_context, request.effect_key)
            self.assertEqual(observed.effect_status, 'effect-pending')
            self.assertEqual(observed.approval_id, request._approval_id)

            # Record a real Ed25519-backed terminal receipt, then recover it
            # through a fresh authority/supervisor instance. The owner ledger
            # stores the receipt digest as an already-computed opaque digest;
            # recovery must compare that value directly rather than hash it a
            # second time.
            intent.update({'purpose': 'native-acceptance',
                           'requestDigest': request._intent_digest,
                           'approvalId': approval.approval_id,
                           'approvalDigest': approval.approval_digest})
            receipt = {'profile': 'test.native-terminal-receipt/1',
                       'requestDigest': request._intent_digest}
            terminal = supervisor._record_native_effect_outcome(
                reservation, 'confirmed', receipt)
            terminal_state = authority.observe_original_request(
                supervisor.authority_context, request.effect_key)
            self.assertEqual(terminal_state.effect_status, 'confirmed')
            self.assertEqual(terminal_state.effect_receipt_digest, terminal.receipt_digest)

            fresh_authority = ConfiguredEd25519OwnerAuthority(
                issuer.owner_configuration, ledger_path=authority._ledger.path,
                bootstrap_issuer=issuer)
            with patch.object(native, 'sys_platform_darwin', return_value=True), \
                    patch.object(native, '_DarwinProcessObserver', return_value=object()):
                attached = native.LocalPostgresSupervisor(
                    supervisor._profile, owner_authority=fresh_authority)
            attached._journal = supervisor._journal
            recovered, recovered_outcome, recovered_request = (
                attached._recover_original_native_effect('local-target-creation'))
            self.assertEqual(recovered.request_digest, request._intent_digest)
            self.assertEqual(recovered_request._intent_bytes, payload)
            self.assertIsNotNone(recovered_outcome)
            self.assertEqual(recovered_outcome.status, 'confirmed')
            self.assertEqual(recovered_outcome.receipt_digest, terminal.receipt_digest)


if __name__ == '__main__':
    unittest.main()

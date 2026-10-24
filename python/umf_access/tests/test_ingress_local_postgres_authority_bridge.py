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
from owner_bootstrap_setup_fixture import install_pending_owner_setup
from umf_access.lifecycle import ingress_local_postgres as native
from umf_access.lifecycle.owner_authority import (
    _SIGNATURE_DOMAIN,
    _canonical_bytes,
    create_owner_authority_session,
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
                'scopes': ['local-target-creation', 'native-principal-preparation'],
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
            enrollment_bytes = native._canonical(enrollment)
            native._write_private(
                control_home / 'owner-bootstrap-enrollment.json', enrollment_bytes)
            install_pending_owner_setup(
                control_home, enrollment, enrollment_bytes,
                control_home / 'owner-approvals.jsonl')

            with patch.object(native, 'sys_platform_darwin', return_value=True), \
                    patch.object(native, '_DarwinProcessObserver', return_value=object()):
                session = create_owner_authority_session(
                    profile, ledger_path=control_home / 'owner-approvals.jsonl')
                authority = session.authority
                supervisor = session.supervisor

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
            with supervisor._original_control_lease(operation_kind='target-apply'):
                reservation = supervisor._make_native_effect_reservation(
                    request, approval, 'local-target-creation', request.effect_key,
                    'native-acceptance', None, event_record, payload)
                self.assertIs(supervisor._resolve_native_effect_reservation(
                    reservation, approval), reservation)
                with self.assertRaisesRegex(
                        native.LocalPostgresError,
                        'local-postgresql-owner-effect-binding-required'):
                    supervisor._require_bound_pending_effect(reservation, object())
                authority_binding = session.bind_native_effect(approval, reservation)
            self.assertIsNotNone(authority_binding)
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
            pending_handle = session._pending_effect_handle(authority_binding)
            with supervisor._original_control_lease(operation_kind='target-apply'):
                terminal = supervisor._record_native_effect_outcome(
                    reservation, 'confirmed', receipt, pending_handle)

            # The native journal is terminal, but the independent owner ledger
            # remains pending until the facade records this exact outcome.
            birth_path = control_home / 'owner-approval-ledger-birth.json'
            anchor_path = control_home / 'owner-approval-ledger-anchor.json'
            # These obsolete optional sidecars are deliberately absent. The
            # primary0.3 setup record alone pins the original path and IDs.
            original_ledger = authority._core._ledger.path.read_bytes()
            replacement = control_home / 'replacement-owner-approvals.jsonl'
            with patch.object(native, 'sys_platform_darwin', return_value=True), \
                    patch.object(native, '_DarwinProcessObserver', return_value=object()), \
                    self.assertRaisesRegex(
                        native.LocalPostgresError,
                        'owner-approval-ledger-path-mismatch'):
                create_owner_authority_session(supervisor._profile,
                                               ledger_path=replacement)
            self.assertEqual(authority._core._ledger.path.read_bytes(), original_ledger)
            self.assertFalse(replacement.exists())
            self.assertFalse(birth_path.exists())
            self.assertFalse(anchor_path.exists())

            with supervisor._original_control_lease(operation_kind='target-apply'):
                session.record_native_outcome(authority_binding, terminal)
            terminal_state = authority.observe_original_request(
                supervisor.authority_context, request.effect_key)
            self.assertEqual(terminal_state.effect_status, 'confirmed')
            self.assertEqual(terminal_state.effect_receipt_digest, terminal.receipt_digest)

            with patch.object(native, 'sys_platform_darwin', return_value=True), \
                    patch.object(native, '_DarwinProcessObserver', return_value=object()):
                attached_session = create_owner_authority_session(
                    supervisor._profile, ledger_path=authority._core._ledger.path)
            attached = attached_session.supervisor
            attached._journal = supervisor._journal
            with attached._original_control_lease(operation_kind='target-recover'):
                recovered, recovered_outcome, recovered_request = (
                    attached._recover_original_native_effect('local-target-creation'))
            self.assertEqual(recovered.request_digest, request._intent_digest)
            self.assertEqual(recovered_request._intent_bytes, payload)
            self.assertIsNotNone(recovered_outcome)
            self.assertEqual(recovered_outcome.status, 'confirmed')
            self.assertEqual(recovered_outcome.receipt_digest, terminal.receipt_digest)

            # The new process can reattach the exact terminal record, but that
            # record must not mint authority to execute a second native effect.
            with attached._original_control_lease(operation_kind='target-recover'):
                recovered_binding = attached_session.bind_native_effect(
                    recovered._approval, recovered)
                recovered_handle = attached_session._pending_effect_handle(
                    recovered_binding, mode='recover')
            self.assertIsNot(recovered_handle, pending_handle)
            with attached._original_control_lease(operation_kind='target-recover'):
                with self.assertRaisesRegex(
                        native.LocalPostgresError,
                        'local-postgresql-owner-effect-binding-required'):
                    attached._require_bound_pending_effect(recovered, pending_handle)
                with self.assertRaisesRegex(
                        native.LocalPostgresError,
                        'local-postgresql-owner-effect-binding-required'):
                    attached._require_bound_pending_effect(recovered, recovered_handle)

            # Exercise the crash gap where the native principal receipt is
            # confirmed but the facade has not yet finished the owner ledger.
            flags = {name: False for name in (
                'canLogin', 'superuser', 'createDatabase', 'createRole',
                'replication', 'bypassRls', 'inherit')}
            maintenance_before = {**flags, 'canLogin': True, 'superuser': True,
                                  'createDatabase': True, 'createRole': True,
                                  'inherit': True}
            maintenance_after = {**flags, 'canLogin': True, 'superuser': True}
            controller_flags = {**flags, 'superuser': True}
            principal_intent = {
                'profile': 'umf.local-postgresql-principal-preparation/0.1',
                'preparationId': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                'supervisorId': supervisor_id, 'custodianId': custodian_id,
                'providerId': provider_id, 'installationId': installation_id,
                'creationRequestDigest': '5' * 64,
                'creationApprovalDigest': '6' * 64,
                'bootstrapOriginDigest': '7' * 64,
                'bootstrapDatabase': {'oid': 5, 'name': 'postgres',
                                      'systemIdentifier': '181818'},
                'maintenanceBefore': {'oid': 51001, 'name': 'umf_maintenance',
                                      'flags': maintenance_before},
                'maintenanceAfter': {'name': 'umf_maintenance',
                                     'operation': 'alter-bootstrap',
                                     'flags': maintenance_after},
                'controller': {'name': 'umf_controller', 'operation': 'create-absent',
                               'flags': controller_flags},
                'businessOwner': {'name': 'fixture_owner', 'operation': 'create-absent',
                                  'flags': flags},
                'applicationDatabase': {'name': 'fixturedb',
                                        'ownerName': 'fixture_owner',
                                        'encoding': 'UTF8', 'locale': 'C',
                                        'operation': 'create-absent'},
                'memberships': [
                    {'memberName': 'umf_maintenance', 'roleName': 'umf_controller',
                     'inherit': False, 'set': True, 'admin': False},
                    {'memberName': 'umf_maintenance', 'roleName': 'fixture_owner',
                     'inherit': False, 'set': True, 'admin': False}],
                'maximumRoles': 3,
            }
            principal_bytes = _canonical_bytes(principal_intent)
            principal_request = authority.prepare_request(
                'native-principal-preparation', principal_bytes,
                context=supervisor.authority_context)
            principal_exported = authority.export_signing_request(principal_request)
            principal_envelope = {
                'payload': principal_exported['payload'],
                'signature': base64.urlsafe_b64encode(private_key.sign(
                    _SIGNATURE_DOMAIN + _canonical_bytes(principal_exported['payload'])
                )).decode('ascii').rstrip('='),
            }
            principal_approval = authority.verify_approval(
                principal_request, principal_envelope)
            principal_event = {
                'sequence': 1,
                'recordDigest': hashlib.sha256(b'principal-fixture').hexdigest(),
                'kind': 'principal-fixture-intent', 'payload': principal_intent,
            }
            supervisor._journal = Journal()
            supervisor._journal.events = [principal_event]
            with supervisor._original_control_lease(operation_kind='principals-apply'):
                principal_reservation = supervisor._make_native_effect_reservation(
                    principal_request, principal_approval,
                    'native-principal-preparation', principal_request.effect_key,
                    'native-acceptance', None, principal_event, principal_bytes)
                principal_binding = session.bind_native_effect(
                    principal_approval, principal_reservation)
                principal_handle = session._pending_effect_handle(principal_binding)
            observed_roles = {'roles': 'synthetic exact native observation'}
            observed_database = {'oid': 17301, 'name': 'fixturedb',
                                 'systemIdentifier': '181818'}
            principal_receipt = {
                'profile': 'umf.local-postgresql-principal-preparation-receipt/0.1',
                'preparationId': principal_intent['preparationId'],
                'requestDigest': principal_reservation.request_digest,
                'approvalDigest': principal_reservation.approval_digest,
                'roleObservationDigest': native._digest(observed_roles),
                'applicationDatabase': observed_database,
                'creationReceiptDigest': principal_reservation.journal_record_digest,
                'purpose': 'native-acceptance',
            }
            with supervisor._original_control_lease(operation_kind='principals-apply'):
                principal_outcome = supervisor._record_native_effect_outcome(
                    principal_reservation, 'confirmed', principal_receipt, principal_handle)
            self.assertEqual(authority.observe_original_request(
                supervisor.authority_context,
                principal_request.effect_key).effect_status, 'effect-pending')
            prepared = native._PreparedOriginalPrincipals(
                native._BOOTSTRAP_ISSUER_SEAL, supervisor, object(), principal_request,
                principal_bytes, {'intent': principal_intent})
            supervisor._principal_preparations[id(prepared)] = prepared
            supervisor._principal_dispatches[id(prepared)] = principal_reservation
            supervisor._principal_recovery_dispatches[id(principal_reservation)] = (
                principal_reservation, prepared, principal_outcome, observed_roles,
                observed_database, principal_intent)
            recovered_handle = session._pending_effect_handle(
                principal_binding, mode='recover')
            with (supervisor._original_control_lease(operation_kind='principals-recover'),
                  patch.object(
                      native.LocalPostgresSupervisor,
                      '_finalize_recovered_principal_receipt') as finalize,
                  patch.object(
                      native.LocalPostgresSupervisor, '_create_application_database',
                      side_effect=AssertionError('recovery must not replay DDL'))):
                self.assertEqual(supervisor.execute_original_principal_recovery(
                    principal_reservation, recovered_handle), principal_receipt)
                finalize.assert_called_once()
            self.assertEqual(authority.observe_original_request(
                supervisor.authority_context,
                principal_request.effect_key).effect_status, 'effect-pending')
            with supervisor._original_control_lease(operation_kind='principals-recover'):
                session.record_native_outcome(principal_binding, principal_outcome)
            self.assertEqual(authority.observe_original_request(
                supervisor.authority_context,
                principal_request.effect_key).effect_status, 'confirmed')


if __name__ == '__main__':
    unittest.main()

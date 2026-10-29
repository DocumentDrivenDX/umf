# SPDX-License-Identifier: MIT OR Apache-2.0
"""Closed generation ROOT registry and original setup records.

This module contains native-free codecs and the configured ROOT verifier.
Native observations and process/session authority are supplied only by the
fixed supervisor facade above this module.
"""
from __future__ import annotations

import base64
import fcntl
import hashlib
import json
import os
import re
import stat
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from ..canonical import canonical_json
from .generation_enrollment_ledger import (
    _MAX_CONFIG,
    _MAX_RECORDS,
    _MAX_REQUEST,
    GenerationEnrollmentAuthorityError,
    _config,
    _json_copy,
    _Ledger,
    _parse_canonical,
    _text,
    _uint,
)
from .generation_enrollment_ledger import (
    _fail as _logical_fail,
)

ROOT_REGISTRY_PROFILE = 'umf.generation-authority-registry/0.1'
ROOT_POLICY_PROFILE = 'umf.generation-authority-root-policy/0.1'
ROOT_APPROVAL_PROFILE = 'umf.generation-authority-trust-approval/0.1'
ROOT_INTENT_PROFILE = 'umf.generation-authority-trust-intent/0.1'
ROOT_ENROLLMENT_PROFILE = 'umf.original-generation-authority-enrollment/0.1'
_HEX = re.compile(r'^[a-f0-9]{64}$')
_UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
_MAX_SAFE = 9_007_199_254_740_991
_MAX_SAFE_INT = _MAX_SAFE
_MAX_REGISTRY = 8 * 1024 * 1024
_MAX_REQUESTS = 4096
_MAX_ENROLLMENTS = 256

TRUST_PROFILE = 'umf.generation-authority-trust-enrollment/0.1'
CONTEXT_PROFILE = 'umf.generation-authority-context/0.1'
PURPOSES = ('production', 'native-acceptance')
_CONTEXT_REGISTRY_PROFILE = 'umf.generation-authority-context-registry/0.2'
_CONTEXT_EVENT_KINDS = {'context-birth-intent', 'context-birth-confirmed'}
_TRUST_SEAL = object()
_TRUST_ISSUER_ORIGINS: dict[int, tuple[object, str, object, object]] = {}
_CONTEXT_SEAL = object()


class _ImmutableOpaque:
    __slots__ = ()

    def __setattr__(self, name: str, value: object) -> None:
        if hasattr(self, name):
            raise AttributeError('opaque authority values are immutable')
        object.__setattr__(self, name, value)

    def __delattr__(self, name: str) -> None:
        raise AttributeError('opaque authority values are immutable')


class GenerationAuthorityBootstrapError(RuntimeError):
    """Sanitized failure from the original generation ROOT registry."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _fail(code: str) -> None:
    raise GenerationAuthorityBootstrapError(code)


def _closed(value: object, keys: set[str], code: str = 'generation-root-record-invalid') -> dict[str, Any]:
    if type(value) is not dict or set(value) != keys:
        _fail(code)
    return value


def _uuid(value: object) -> str:
    if type(value) is not str or not _UUID.fullmatch(value):
        _fail('generation-root-record-invalid')
    try:
        if str(uuid.UUID(value)) != value:
            _fail('generation-root-record-invalid')
    except ValueError:
        _fail('generation-root-record-invalid')
    return value


def _digest(value: object) -> str:
    if type(value) is not str or not _HEX.fullmatch(value):
        _fail('generation-root-record-invalid')
    return value


def _canonical(value: object) -> bytes:
    try:
        return canonical_json(value).encode('utf-8')
    except (TypeError, ValueError, UnicodeError, RecursionError):
        _fail('generation-root-record-invalid')


def _parse(raw: object) -> dict[str, Any]:
    if type(raw) is not bytes or not 1 <= len(raw) <= _MAX_REGISTRY:
        _fail('generation-root-registry-invalid')
    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in items:
            if key in result:
                _fail('generation-root-registry-invalid')
            result[key] = value
        return result
    try:
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                           parse_float=lambda _item: _fail('generation-root-registry-invalid'),
                           parse_constant=lambda _item: _fail('generation-root-registry-invalid'))
    except GenerationAuthorityBootstrapError:
        raise
    except (UnicodeError, ValueError, RecursionError):
        _fail('generation-root-registry-invalid')
    if type(value) is not dict or _canonical(value) != raw:
        _fail('generation-root-registry-noncanonical')
    return value


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def initial_registry(registry_id: str, anchor_digest: str) -> dict[str, Any]:
    return {'profile': ROOT_REGISTRY_PROFILE, 'registryId': _uuid(registry_id),
            'anchorDigest': _digest(anchor_digest), 'sequence': 0,
            'requests': [], 'enrollments': []}


def initial_registry_bytes(registry_id: str, anchor_digest: str) -> bytes:
    """Return the canonical zero-state registry (no terminal LF)."""
    return _canonical(initial_registry(registry_id, anchor_digest))


def _root_text(value: object, maximum: int) -> str:
    if type(value) is not str or not value or '\x00' in value:
        _fail('generation-root-registry-invalid')
    try:
        if len(value.encode('utf-8')) > maximum:
            _fail('generation-root-registry-invalid')
    except UnicodeEncodeError:
        _fail('generation-root-registry-invalid')
    return value


def _root_canonical(value: object, *, maximum: int = _MAX_REGISTRY) -> bytes:
    try:
        copied = _json_copy(value)
        encoded = canonical_json(copied).encode('utf-8')
    except (GenerationEnrollmentAuthorityError, TypeError, ValueError,
            UnicodeError, RecursionError):
        _fail('generation-root-registry-invalid')
    if len(encoded) > maximum:
        _fail('generation-root-registry-capacity')
    return encoded


def _root_same_json(left: object, right: object) -> bool:
    """Compare JSON values without Python's bool/int/float equality aliases."""
    try:
        return _root_canonical(left) == _root_canonical(right)
    except GenerationAuthorityBootstrapError:
        return False


def _root_config(value: object) -> dict[str, Any]:
    try:
        config, _keys = _config(value)
        if _root_canonical(config, maximum=_MAX_CONFIG) != _root_canonical(
                value, maximum=_MAX_CONFIG):
            _fail('generation-root-registry-invalid')
        return config
    except (GenerationEnrollmentAuthorityError, TypeError, ValueError, KeyError,
            AttributeError, RecursionError, UnicodeError):
        _fail('generation-root-registry-invalid')


def _root_policy(value: object) -> tuple[dict[str, Any], dict[str, Any]]:
    policy = _closed(value, {'profile', 'authorityId', 'policyRevision', 'keys'})
    if policy['profile'] != ROOT_POLICY_PROFILE:
        _fail('generation-root-policy-invalid')
    authority_id = _uuid(policy['authorityId'])
    revision = _root_text(policy['policyRevision'], 128)
    keys = policy['keys']
    if type(keys) is not list or not 1 <= len(keys) <= 32:
        _fail('generation-root-policy-invalid')
    seen: set[str] = set()
    for raw_key in keys:
        key = _closed(raw_key, {'keyId', 'publicKey', 'principalId',
                                'logicalAuthorityIds', 'configurationProfiles'})
        key_id = _root_text(key['keyId'], 128)
        _root_text(key['principalId'], 128)
        if key_id in seen:
            _fail('generation-root-policy-invalid')
        seen.add(key_id)
        public = key['publicKey']
        if type(public) is not str or re.fullmatch(r'[A-Za-z0-9_-]{43}', public) is None:
            _fail('generation-root-policy-invalid')
        try:
            public_bytes = base64.urlsafe_b64decode(public + '=')
        except (ValueError, TypeError):
            _fail('generation-root-policy-invalid')
        if (len(public_bytes) != 32
                or base64.urlsafe_b64encode(public_bytes).decode('ascii').rstrip('=') != public):
            _fail('generation-root-policy-invalid')
        logical_ids = key['logicalAuthorityIds']
        if type(logical_ids) is not list or not 1 <= len(logical_ids) <= 256:
            _fail('generation-root-policy-invalid')
        normalized_ids = [_uuid(item) for item in logical_ids]
        if len(set(normalized_ids)) != len(normalized_ids):
            _fail('generation-root-policy-invalid')
        profiles = key['configurationProfiles']
        if (type(profiles) is not list or not profiles
                or any(type(item) is not str for item in profiles)
                or len(set(profiles)) != len(profiles)
                or any(item != _config_profile() for item in profiles)):
            _fail('generation-root-policy-invalid')
    # The policy is separately bound by the original owner-bootstrap record;
    # payload validation selects the matching configured key below.
    try:
        policy_bytes = _root_canonical(policy, maximum=_MAX_CONFIG)
    except GenerationEnrollmentAuthorityError:
        _fail('generation-root-policy-invalid')
    return policy, {'authorityId': authority_id, 'policyRevision': revision,
                    'digest': _sha(policy_bytes)}


def _config_profile() -> str:
    return 'umf.configured-generation-enrollment-authority/0.1'


_ROOT_PAYLOAD_FIELDS = {
    'profile', 'scope', 'rootAuthorityId', 'rootPolicyRevision', 'keyId',
    'principalId', 'approvalId', 'purpose', 'bootstrapEnrollmentId',
    'rootPolicyDigest', 'supervisorId', 'custodianId', 'providerId',
    'installationId', 'intentDigest',
}


def _validate_root_intent(intent_value: object, *, request: dict[str, Any]
                          ) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    intent = _closed(intent_value, {'profile', 'contextId', 'trust', 'configuration',
                                    'configurationDigest', 'nativeEvidenceDigest'})
    if intent['profile'] != ROOT_INTENT_PROFILE:
        _fail('generation-root-registry-invalid')
    context_id = _uuid(intent['contextId'])
    trust = _closed(intent['trust'], {
        'profile', 'enrollmentId', 'ownerBootstrapContextDigest', 'configurationDigest',
        'supervisorId', 'custodianId', 'providerId', 'installationId',
        'targetCustodyDigest', 'storeCreationReceiptDigest', 'custodySequence',
    })
    configuration = _root_config(intent['configuration'])
    configuration_digest = _digest(intent['configurationDigest'])
    _digest(intent['nativeEvidenceDigest'])
    if (trust['profile'] != TRUST_PROFILE
            or _uuid(trust['enrollmentId']) != request['enrollmentId']
            or trust['configurationDigest'] != configuration_digest
            or configuration_digest != _sha(_root_canonical(configuration, maximum=_MAX_CONFIG))
            or _uuid(trust['supervisorId']) != configuration['supervisorId']
            or _uuid(trust['custodianId']) != configuration['custodianId']
            or _uuid(trust['providerId']) != configuration['providerId']
            or _root_text(trust['installationId'], 256) != configuration['installationId']
            or _digest(trust['targetCustodyDigest'])
               != _sha(_root_canonical(configuration['targetCustody']))
            or _uint_root(trust['custodySequence']) != request['reservedSequence']):
        _fail('generation-root-registry-crosslink-invalid')
    _digest(trust['ownerBootstrapContextDigest'])
    _digest(trust['storeCreationReceiptDigest'])
    if context_id != request['contextId']:
        _fail('generation-root-registry-crosslink-invalid')
    return intent, trust, configuration


def _uint_root(value: object) -> int:
    if type(value) is not int or not 0 <= value <= _MAX_SAFE:
        _fail('generation-root-registry-invalid')
    return value


def _validate_root_payload(payload_value: object, *, intent: dict[str, Any],
                           trust: dict[str, Any], configuration: dict[str, Any],
                           effect: list[str], root_policy: object, purpose: str,
                           bootstrap_enrollment_id: str) -> dict[str, Any]:
    payload = _closed(payload_value, _ROOT_PAYLOAD_FIELDS)
    if (payload['profile'] != ROOT_APPROVAL_PROFILE
            or payload['scope'] != 'enroll-generation-authority'):
        _fail('generation-root-approval-invalid')
    root_authority_id = _uuid(payload['rootAuthorityId'])
    root_revision = _root_text(payload['rootPolicyRevision'], 128)
    key_id = _root_text(payload['keyId'], 128)
    principal_id = _root_text(payload['principalId'], 128)
    _uuid(payload['approvalId'])
    payload_purpose = payload['purpose']
    if payload_purpose not in PURPOSES:
        _fail('generation-root-approval-invalid')
    bootstrap_id = _uuid(payload['bootstrapEnrollmentId'])
    policy_digest = _digest(payload['rootPolicyDigest'])
    supervisor_id = _uuid(payload['supervisorId'])
    custodian_id = _uuid(payload['custodianId'])
    provider_id = _uuid(payload['providerId'])
    installation_id = _root_text(payload['installationId'], 256)
    intent_digest = _digest(payload['intentDigest'])
    if (payload_purpose != purpose or payload_purpose != configuration['purpose']
            or bootstrap_id != bootstrap_enrollment_id
            or intent_digest != _sha(_root_canonical(intent, maximum=2 * _MAX_CONFIG))
            or supervisor_id != trust['supervisorId']
            or custodian_id != trust['custodianId']
            or provider_id != trust['providerId']
            or installation_id != trust['installationId']
            or effect != ['enroll-generation-authority', bootstrap_id, provider_id,
                          installation_id, configuration['authorityId'],
                          configuration['policyRevision']]):
        _fail('generation-root-registry-crosslink-invalid')
    policy, policy_meta = _root_policy(root_policy)
    if (root_authority_id != policy_meta['authorityId']
            or root_revision != policy_meta['policyRevision']
            or policy_digest != policy_meta['digest']):
        _fail('generation-root-approval-invalid')
    matching = [key for key in policy['keys']
                if key['keyId'] == key_id and key['principalId'] == principal_id]
    if len(matching) != 1:
        _fail('generation-root-key-unavailable')
    selected = matching[0]
    if (configuration['authorityId'] not in selected['logicalAuthorityIds']
            or configuration['profile'] not in selected['configurationProfiles']):
        _fail('generation-root-profile-denied')
    return payload


def _validate_root_envelope(envelope_value: object, *, payload: dict[str, Any]) -> str:
    envelope = _closed(envelope_value, {'payload', 'signature'})
    envelope_payload = _closed(envelope['payload'], _ROOT_PAYLOAD_FIELDS)
    if not _root_same_json(envelope_payload, payload):
        _fail('generation-root-registry-crosslink-invalid')
    _root_canonical(payload, maximum=16_384)
    signature = envelope['signature']
    if type(signature) is not str or re.fullmatch(r'[A-Za-z0-9_-]{86}', signature) is None:
        _fail('generation-root-signature-invalid')
    try:
        raw = base64.urlsafe_b64decode(signature + '==')
    except (ValueError, TypeError):
        _fail('generation-root-signature-invalid')
    if (len(raw) != 64
            or base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=') != signature):
        _fail('generation-root-signature-invalid')
    return _sha(_root_canonical(envelope, maximum=16_384))


def validate_registry(raw: bytes, *, registry_id: str,
                      anchor_digest: str, root_policy: object, purpose: str,
                      bootstrap_enrollment_id: str) -> dict[str, Any]:
    """Validate the closed registry against its original configured root.

    This checks structural/cross-record integrity and verifies every confirmed
    root signature. It does not establish native deployment custody or nonrewind
    provenance; those remain obligations of the fixed original host resolver.
    """
    value = _parse(raw)
    _closed(value, {'profile', 'registryId', 'anchorDigest', 'sequence',
                    'requests', 'enrollments'}, 'generation-root-registry-invalid')
    if (value['profile'] != ROOT_REGISTRY_PROFILE
            or value['registryId'] != _uuid(registry_id)
            or value['anchorDigest'] != _digest(anchor_digest)):
        _fail('generation-root-registry-binding-mismatch')
    bootstrap_id = _uuid(bootstrap_enrollment_id)
    if type(purpose) is not str or purpose not in PURPOSES:
        _fail('generation-root-approval-invalid')
    try:
        trusted_policy = _closed(_json_copy(root_policy), {
            'profile', 'authorityId', 'policyRevision', 'keys'})
    except GenerationEnrollmentAuthorityError:
        _fail('generation-root-policy-invalid')
    _root_policy(trusted_policy)
    sequence = value['sequence']
    requests = value['requests']
    enrollments = value['enrollments']
    if (type(sequence) is not int or not 0 <= sequence <= _MAX_SAFE
            or type(requests) is not list or len(requests) > _MAX_REQUESTS
            or type(enrollments) is not list or len(enrollments) > _MAX_ENROLLMENTS):
        _fail('generation-root-registry-capacity')
    reserved: list[int] = []
    confirmed: list[int] = []
    request_ids: set[str] = set()
    approval_ids: set[str] = set()
    enrollment_ids: set[str] = set()
    effect_keys: set[tuple[str, ...]] = set()
    by_id: dict[str, dict[str, Any]] = {}
    context_ids: set[str] = set()
    validated: dict[str, dict[str, Any]] = {}
    for request in requests:
        _closed(request, {'requestId', 'enrollmentId', 'contextId', 'effectKey',
                          'intent', 'payload', 'state', 'reservedSequence',
                          'confirmedSequence', 'approvalEnvelope'},
                 'generation-root-registry-invalid')
        request_id = _uuid(request['requestId'])
        enrollment_id = _uuid(request['enrollmentId'])
        context_id = _uuid(request['contextId'])
        if (request_id in request_ids or enrollment_id in enrollment_ids
                or context_id in context_ids):
            _fail('generation-root-registry-duplicate-identity')
        request_ids.add(request_id); enrollment_ids.add(enrollment_id)
        context_ids.add(context_id)
        key = request['effectKey']
        if (type(key) is not list or len(key) != 6
                or any(type(part) is not str or not part for part in key)):
            _fail('generation-root-registry-invalid')
        for part in key:
            _root_text(part, 256)
        effect = tuple(key)
        if effect in effect_keys:
            _fail('generation-root-registry-duplicate-effect')
        effect_keys.add(effect)
        reserve_seq = request['reservedSequence']
        confirm_seq = request['confirmedSequence']
        if (type(reserve_seq) is not int or not 1 <= reserve_seq <= sequence):
            _fail('generation-root-registry-sequence-invalid')
        reserved.append(reserve_seq)
        intent, trust, configuration = _validate_root_intent(request['intent'], request=request)
        payload = _validate_root_payload(
            request['payload'], intent=intent, trust=trust, configuration=configuration,
            effect=key, root_policy=trusted_policy, purpose=purpose,
            bootstrap_enrollment_id=bootstrap_id)
        approval_id = _uuid(payload['approvalId'])
        if approval_id in approval_ids:
            _fail('generation-root-registry-duplicate-approval')
        approval_ids.add(approval_id)
        envelope_digest: str | None = None
        if request['state'] == 'prepared':
            if confirm_seq is not None or request['approvalEnvelope'] is not None:
                _fail('generation-root-registry-invalid')
        elif request['state'] == 'confirmed':
            if (type(confirm_seq) is not int or not reserve_seq < confirm_seq <= sequence
                    or type(request['approvalEnvelope']) is not dict):
                _fail('generation-root-registry-invalid')
            confirmed.append(confirm_seq)
            verifier = ConfiguredGenerationAuthorityRootVerifier(trusted_policy, purpose=purpose)
            envelope_digest = _validate_root_envelope(
                request['approvalEnvelope'], payload=payload)
            try:
                verified_approval_id = verifier.verify_approval(
                    request['approvalEnvelope']['payload'],
                    request['approvalEnvelope']['signature'])
            except GenerationAuthorityBootstrapError:
                raise
            except (ImportError, ValueError, TypeError, KeyError, AttributeError,
                    IndexError, OverflowError):
                _fail('generation-root-signature-invalid')
            if verified_approval_id != approval_id:
                _fail('generation-root-registry-crosslink-invalid')
        else:
            _fail('generation-root-registry-invalid')
        by_id[request_id] = request
        validated[request_id] = {'intent': intent, 'trust': trust,
                                 'configuration': configuration, 'payload': payload,
                                 'envelopeDigest': envelope_digest}
    if reserved != sorted(reserved) or len(set(reserved)) != len(reserved):
        _fail('generation-root-registry-sequence-invalid')
    if len(set(confirmed)) != len(confirmed):
        _fail('generation-root-registry-sequence-invalid')
    if sequence != len(requests) + len(enrollments):
        _fail('generation-root-registry-sequence-invalid')
    if sorted(reserved + confirmed) != list(range(1, sequence + 1)):
        _fail('generation-root-registry-sequence-invalid')
    enrollment_sequences: list[int] = []
    seen_requests: set[str] = set()
    for item in enrollments:
        _closed(item, {'profile', 'enrollmentId', 'requestId', 'contextId',
                       'bootstrapEnrollmentId', 'rootPolicyDigest', 'rootApprovalDigest',
                       'trust', 'configuration', 'configurationDigest',
                       'nativeEvidenceDigest', 'state', 'registrySequence'},
                 'generation-root-registry-invalid')
        if item['profile'] != ROOT_ENROLLMENT_PROFILE or item['state'] != 'confirmed':
            _fail('generation-root-registry-invalid')
        request_id = _uuid(item['requestId'])
        if request_id in seen_requests or request_id not in by_id:
            _fail('generation-root-registry-invalid')
        seen_requests.add(request_id)
        request = by_id[request_id]
        info = validated[request_id]
        if (request['state'] != 'confirmed'
                or item['enrollmentId'] != request['enrollmentId']
                or item['contextId'] != request['contextId']
                or item['bootstrapEnrollmentId'] != bootstrap_id
                or item['bootstrapEnrollmentId'] != request['effectKey'][1]
                or item['rootPolicyDigest'] != info['payload']['rootPolicyDigest']
                or item['rootApprovalDigest'] != info['envelopeDigest']
                or not _root_same_json(item['trust'], info['trust'])
                or not _root_same_json(item['configuration'], info['configuration'])
                or item['configurationDigest'] != info['intent']['configurationDigest']
                or item['nativeEvidenceDigest'] != info['intent']['nativeEvidenceDigest']):
            _fail('generation-root-registry-crosslink-invalid')
        seq = item['registrySequence']
        if type(seq) is not int or seq != request['confirmedSequence']:
            _fail('generation-root-registry-sequence-invalid')
        enrollment_sequences.append(seq)
        for field in ('rootPolicyDigest', 'rootApprovalDigest', 'configurationDigest',
                      'nativeEvidenceDigest'):
            _digest(item[field])
    if (enrollment_sequences != sorted(enrollment_sequences)
            or len(seen_requests) != len(enrollments)
            or {r['requestId'] for r in requests if r['state'] == 'confirmed'} != seen_requests):
        _fail('generation-root-registry-crosslink-invalid')
    return value


def _verify_trust_observation(entry: OriginalGenerationTrustEnrollment,
                              current: object) -> None:
    statement = _parse_canonical(entry._statement_bytes)
    config = _parse_canonical(entry._configuration_bytes, maximum=_MAX_CONFIG)
    fields = {'profile', 'statementDigest', 'configurationDigest',
              'ownerBootstrapContextDigest', 'targetCustodyDigest',
              'storeCreationReceiptDigest', 'custodySequence', 'supervisorId',
              'custodianId', 'providerId', 'installationId', 'targetCustody'}
    if type(current) is not dict or set(current) != fields:
        _logical_fail('generation-authority-original-trust-unverified')
    expected = {
        'profile': 'umf.generation-authority-native-trust-observation/0.1',
        'statementDigest': _sha(entry._statement_bytes),
        'configurationDigest': _sha(entry._configuration_bytes),
        'ownerBootstrapContextDigest': statement['ownerBootstrapContextDigest'],
        'targetCustodyDigest': _sha(_canonical(config['targetCustody'])),
        'storeCreationReceiptDigest': statement['storeCreationReceiptDigest'],
        'custodySequence': statement['custodySequence'],
        'supervisorId': config['supervisorId'], 'custodianId': config['custodianId'],
        'providerId': config['providerId'], 'installationId': config['installationId'],
        'targetCustody': config['targetCustody'],
    }
    if _canonical(current) != _canonical(expected):
        _logical_fail('generation-authority-original-trust-unverified')


def _validate_context_projection(projection: object) -> dict[str, Any]:
    if type(projection) is not dict:
        _logical_fail('generation-authority-registry-corrupt')
    base = {'profile','contextId','trustEnrollmentDigest','configurationDigest',
            'supervisorId','custodianId','providerId','installationId',
            'targetCustodyDigest','storeCreationReceiptDigest','purpose'}
    if set(projection) == base | {'sourceTestOnly'}:
        if projection['sourceTestOnly'] is not True:
            _logical_fail('generation-authority-registry-corrupt')
    elif set(projection) != base:
        _logical_fail('generation-authority-registry-corrupt')
    if projection['profile'] != CONTEXT_PROFILE:
        _logical_fail('generation-authority-registry-corrupt')
    _uuid(projection['contextId'])
    for field in ('trustEnrollmentDigest','configurationDigest',
                  'targetCustodyDigest','storeCreationReceiptDigest'):
        _digest(projection[field])
    for field in ('supervisorId','custodianId','providerId'):
        _uuid(projection[field])
    _text(projection['installationId'], 256)
    if projection['purpose'] not in PURPOSES:
        _logical_fail('generation-authority-registry-corrupt')
    return projection


def _context_replay(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    contexts: dict[str, dict[str, Any]] = {}
    for event in events:
        payload = event['payload']
        if event['kind'] == 'context-birth-intent':
            projection = payload['projection']
            context_id = projection['contextId']
            contexts[context_id] = {
                **payload, 'contextId': context_id, 'intentDigest': event['digest'],
                'confirmed': False, 'ledgerBirthDigest': None,
            }
        else:
            state = contexts.get(payload['contextId'])
            if (state is None or state['confirmed']
                    or state['intentDigest'] != payload['intentDigest']):
                _logical_fail('generation-authority-registry-corrupt')
            state['confirmed'] = True
            state['ledgerBirthDigest'] = payload['ledgerBirthDigest']
    return contexts


def _context_identity(journal: _ContextJournal, context_id: str) -> tuple[str, str]:
    state = journal.context_for(context_id)
    if state is None or not state['confirmed']:
        _logical_fail('generation-authority-original-context-missing')
    return state['logicalEnrollmentId'], state['initialEpoch']


def _verify_durable_context(journal: _ContextJournal,
                            entry: OriginalGenerationTrustEnrollment,
                            projection: dict[str, Any]) -> dict[str, Any]:
    state = journal.context_for(projection['contextId'])
    if (state is None or not state['confirmed'] or state['projection'] != projection
            or state['trustEntryDigest'] != _sha(entry._statement_bytes)
            or state['configurationDigest'] != _sha(entry._configuration_bytes)):
        _logical_fail('generation-authority-original-context-missing')
    config = _parse_canonical(entry._configuration_bytes, maximum=_MAX_CONFIG)
    ledger = _Ledger(entry._ledger_path, config['authorityId'],
                     _sha(entry._configuration_bytes), _sha(_canonical(projection)),
                     config['purpose'])
    records = ledger.events(create=False)
    identities = [record for record in records if record['kind'] == 'identity-allocated']
    if (len(identities) != 1 or identities[0]['payload'] != {
            'enrollmentId': state['logicalEnrollmentId'],
            'initialEpoch': state['initialEpoch']}
            or identities[0]['digest'] != state['ledgerBirthDigest']):
        _logical_fail('generation-authority-original-history-missing')
    return state


class OriginalGenerationTrustEnrollment(_ImmutableOpaque):
    """Opaque original host-registry entry; never construct from a projection."""

    __slots__ = (
        '_configuration_bytes',
        '_custodian',
        '_entry_id',
        '_ingress_store',
        '_issuer',
        '_ledger_path',
        '_statement_bytes',
        '_supervisor',
    )

    def __init__(self, seal: object, issuer: object, *, statement_bytes: bytes,
                 configuration_bytes: bytes, supervisor: object, custodian: object,
                 ingress_store: object, ledger_path: Path, entry_id: str):
        if seal is not _TRUST_SEAL:
            raise TypeError('original generation trust enrollment is issuer-created')
        self._issuer = issuer
        self._statement_bytes = bytes(statement_bytes)
        self._configuration_bytes = bytes(configuration_bytes)
        self._supervisor = supervisor
        self._custodian = custodian
        self._ingress_store = ingress_store
        self._ledger_path = ledger_path
        self._entry_id = entry_id

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('original generation trust enrollment is not serializable')


class GenerationEnrollmentAuthorityContext(_ImmutableOpaque):
    """Opaque logical-authority context bound to original physical handles."""

    __slots__ = (
        '_configuration_bytes',
        '_custodian',
        '_ingress_store',
        '_initial_epoch',
        '_issuer',
        '_ledger_path',
        '_logical_enrollment_id',
        '_projection_bytes',
        '_supervisor',
        '_trust',
    )

    def __init__(self, seal: object, issuer: object, trust: OriginalGenerationTrustEnrollment,
                 projection_bytes: bytes, logical_enrollment_id: str,
                 initial_epoch: str):
        if seal is not _CONTEXT_SEAL:
            raise TypeError('generation authority context is issuer-created')
        self._issuer = issuer
        self._trust = trust
        self._projection_bytes = bytes(projection_bytes)
        self._configuration_bytes = bytes(trust._configuration_bytes)
        self._supervisor = trust._supervisor
        self._custodian = trust._custodian
        self._ingress_store = trust._ingress_store
        self._ledger_path = trust._ledger_path
        self._logical_enrollment_id = _uuid(logical_enrollment_id)
        self._initial_epoch = _uuid(initial_epoch)

    @property
    def public_reference(self) -> dict[str, Any]:
        return _parse_canonical(self._projection_bytes)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('generation authority context is not serializable')


class _GenerationTrustIssuer:
    """Native-free issuer state; the fixed session layer performs native checks."""

    __slots__ = (
        '_contexts',
        '_custodian',
        '_entries',
        '_ingress_store',
        '_lock',
        '_registry',
        '_registry_id',
        '_registry_path',
        '_supervisor',
    )

    def __init__(self, seal: object, *, registry_id: str, registry: object,
                 supervisor: object, custodian: object, ingress_store: object,
                 registry_path: Path):
        if seal is not _TRUST_SEAL:
            raise TypeError('generation trust issuer is original-bootstrap-only')
        self._registry_id = _uuid(registry_id)
        self._registry = registry
        self._supervisor = supervisor
        self._custodian = custodian
        self._ingress_store = ingress_store
        self._registry_path = registry_path
        self._entries: dict[str, OriginalGenerationTrustEnrollment] = {}
        self._contexts: dict[str, GenerationEnrollmentAuthorityContext] = {}
        self._lock = threading.RLock()

    def _issue_original_trust_entry(self, *_args: object, **_kwargs: object
                                    ) -> OriginalGenerationTrustEnrollment:
        """Production trust entries must be resolved from the real host registry."""
        _logical_fail('generation-authority-native-bootstrap-unavailable')

    def _enroll_registered_context(
            self, entry: OriginalGenerationTrustEnrollment
            ) -> GenerationEnrollmentAuthorityContext:
        """Persist logical birth for the exact native-registered original entry.

        The caller is the fixed session layer.  This method accepts the original
        opaque entry, never an observation mapping or caller-supplied resolver.
        """
        _require_registered_issuer(self, 'production')
        if (type(entry) is not OriginalGenerationTrustEnrollment
                or entry._issuer is not self or self._entries.get(entry._entry_id) is not entry
                or entry._supervisor is not self._supervisor
                or entry._custodian is not self._custodian
                or entry._ingress_store is not self._ingress_store):
            _logical_fail('generation-authority-original-trust-required')
        config = _parse_canonical(entry._configuration_bytes, maximum=_MAX_CONFIG)
        statement = _parse_canonical(entry._statement_bytes)
        config, _keys = _config(config)
        context_id = statement['enrollmentId']
        projection = {
            'profile': CONTEXT_PROFILE, 'contextId': context_id,
            'trustEnrollmentDigest': _sha(entry._statement_bytes),
            'configurationDigest': _sha(entry._configuration_bytes),
            'supervisorId': config['supervisorId'], 'custodianId': config['custodianId'],
            'providerId': config['providerId'], 'installationId': config['installationId'],
            'targetCustodyDigest': _sha(_canonical(config['targetCustody'])),
            'storeCreationReceiptDigest': statement['storeCreationReceiptDigest'],
            'purpose': config['purpose'],
        }
        projection_bytes = _canonical(projection)
        existing = self._contexts.get(context_id)
        if existing is not None:
            if existing._projection_bytes != projection_bytes or existing._trust is not entry:
                _logical_fail('generation-authority-context-rebound')
            _verify_durable_context(
                _ContextJournal(self._registry_path, self._registry_id), entry, projection)
            return existing
        registry = _ContextJournal(self._registry_path, self._registry_id)
        ledger = _Ledger(entry._ledger_path, config['authorityId'],
                         _sha(entry._configuration_bytes), _sha(projection_bytes),
                         config['purpose'])
        logical_enrollment_id, initial_epoch = registry.reserve_context(projection, entry, ledger)
        context = GenerationEnrollmentAuthorityContext(
            _CONTEXT_SEAL, self, entry, projection_bytes,
            logical_enrollment_id, initial_epoch)
        self._contexts[context_id] = context
        return context

    def resolve_generation_authority_context(
            self, handle: object) -> GenerationEnrollmentAuthorityContext:
        _require_registered_issuer(self, 'production')
        if (type(handle) is not GenerationEnrollmentAuthorityContext
                or handle._issuer is not self
                or self._contexts.get(handle.public_reference['contextId']) is not handle):
            _logical_fail('generation-authority-context-unverified')
        entry = handle._trust
        if self._entries.get(entry._entry_id) is not entry:
            _logical_fail('generation-authority-context-unverified')
        _verify_durable_context(
            _ContextJournal(self._registry_path, self._registry_id), entry,
            handle.public_reference)
        return handle

    def _recover_registered_context(
            self, context_id: str, entry: OriginalGenerationTrustEnrollment
            ) -> GenerationEnrollmentAuthorityContext:
        _require_registered_issuer(self, 'production')
        context_id = _uuid(context_id)
        existing = self._contexts.get(context_id)
        if existing is None:
            # Read-only: do not create context journal/lock and do not enroll anew.
            projection = _ContextJournal(self._registry_path, self._registry_id).find(context_id)
            if projection is None:
                _logical_fail('generation-authority-original-context-missing')
        if (type(entry) is not OriginalGenerationTrustEnrollment or entry._issuer is not self
                or self._entries.get(entry._entry_id) is not entry
                or entry._supervisor is not self._supervisor
                or entry._custodian is not self._custodian
                or entry._ingress_store is not self._ingress_store):
            _logical_fail('generation-authority-original-trust-required')
        if existing is not None:
            self.resolve_generation_authority_context(existing)
            if existing._trust is not entry:
                _logical_fail('generation-authority-context-rebound')
            return existing
        journal = _ContextJournal(self._registry_path, self._registry_id)
        expected = journal.projection_for(context_id)
        config = _parse_canonical(entry._configuration_bytes, maximum=_MAX_CONFIG)
        statement = _parse_canonical(entry._statement_bytes)
        config, _ = _config(config)
        projection = {
            'profile': CONTEXT_PROFILE, 'contextId': context_id,
            'trustEnrollmentDigest': _sha(entry._statement_bytes),
            'configurationDigest': _sha(entry._configuration_bytes),
            'supervisorId': config['supervisorId'], 'custodianId': config['custodianId'],
            'providerId': config['providerId'], 'installationId': config['installationId'],
            'targetCustodyDigest': _sha(_canonical(config['targetCustody'])),
            'storeCreationReceiptDigest': statement['storeCreationReceiptDigest'],
            'purpose': config['purpose'],
        }
        if expected != projection:
            _logical_fail('generation-authority-context-rebound')
        _verify_durable_context(journal, entry, projection)
        logical_enrollment_id, initial_epoch = _context_identity(journal, context_id)
        context = GenerationEnrollmentAuthorityContext(
            _CONTEXT_SEAL, self, entry, _canonical(projection),
            logical_enrollment_id, initial_epoch)
        self._contexts[context_id] = context
        return context


def _register_trust_issuer(issuer: object, origin: str) -> None:
    """Record an issuer only at a fixed bootstrap factory boundary."""
    if origin == 'production':
        issuer_type = _GenerationTrustIssuer
    elif origin == 'source-test':
        issuer_type = _SourceTestGenerationTrustIssuer
    else:
        _logical_fail('generation-authority-context-unverified')
    if type(issuer) is not issuer_type:
        _logical_fail('generation-authority-context-unverified')
    _TRUST_ISSUER_ORIGINS[id(issuer)] = (
        issuer, origin, issuer_type.resolve_generation_authority_context,
        getattr(issuer_type, '_projection', None))


def _require_registered_issuer(issuer: object, expected_origin: str) -> str:
    entry = _TRUST_ISSUER_ORIGINS.get(id(issuer))
    if entry is None or entry[0] is not issuer or entry[1] != expected_origin:
        _logical_fail('generation-authority-context-unverified')
    expected_type = (_SourceTestGenerationTrustIssuer if expected_origin == 'source-test'
                     else _GenerationTrustIssuer)
    if type(issuer) is not expected_type:
        _logical_fail('generation-authority-context-unverified')
    resolver = expected_type.resolve_generation_authority_context
    projection = getattr(expected_type, '_projection', None)
    if resolver is not entry[2] or projection is not entry[3]:
        _logical_fail('generation-authority-context-unverified')
    return expected_origin


def _check_issuer_purpose(origin: str, projection: dict[str, Any], purpose: str) -> None:
    if origin == 'source-test':
        if projection.get('sourceTestOnly') is not True or purpose != 'native-acceptance':
            _logical_fail('generation-authority-source-test-purpose-invalid')
        return
    if origin == 'production':
        if 'sourceTestOnly' in projection or purpose not in PURPOSES:
            _logical_fail('generation-authority-context-unverified')
        return
    _logical_fail('generation-authority-context-unverified')


class _ContextJournal:
    """Small durable immutable context registry under original control custody."""

    __slots__ = ('_path', '_registry_id')

    def __init__(self, path: Path, registry_id: str):
        self._path = path
        self._registry_id = registry_id

    def reserve_context(self, projection: dict[str, Any], entry: OriginalGenerationTrustEnrollment,
                        ledger: _Ledger) -> tuple[str, str]:
        # An absent registry and lock is the only fresh-birth state. A partial
        # or previously existing pair is evidence of interruption or loss and
        # is never silently replaced.
        context_id = projection['contextId']
        marker_path = self._birth_marker_path(context_id)
        fresh = not self._path.exists() and not self._path.with_name(self._path.name + '.lock').exists()
        marker = self._read_birth_marker(context_id)
        if fresh and marker is None:
            ledger_lock = ledger.path.with_name(ledger.path.name + '.lock')
            if ledger.path.exists() or ledger_lock.exists():
                _logical_fail('generation-authority-original-context-missing')
            marker = self._write_birth_marker(
                context_id, projection, entry, ledger, str(uuid.uuid4()), str(uuid.uuid4()),
                'pending', create=True)
        if marker is None:
            _logical_fail('generation-authority-original-context-missing')
        if (marker['projection'] != projection
                or marker['trustEntryDigest'] != _sha(entry._statement_bytes)
                or marker['configurationDigest'] != _sha(entry._configuration_bytes)
                or marker['ledgerPath'] != str(ledger.path)):
            _logical_fail('generation-authority-context-rebound')
        if fresh and marker['state'] != 'pending':
            _logical_fail('generation-authority-original-context-missing')
        if not self._path.exists() and marker['state'] != 'pending':
            _logical_fail('generation-authority-original-context-missing')
        create_registry = fresh or (not self._path.exists() and marker['state'] == 'pending')
        with self._locked(create=create_registry, exclusive=True):
            events = self._load_locked(create=create_registry)
            context_id = projection['contextId']
            binding = {'projection': projection, 'trustEntryDigest': _sha(entry._statement_bytes),
                       'configurationDigest': _sha(entry._configuration_bytes),
                       'ownerBootstrapContextDigest': _parse_canonical(entry._statement_bytes)[
                           'ownerBootstrapContextDigest']}
            context_state = _context_replay(events)
            prior = context_state.get(context_id)
            if prior is not None:
                if any(prior[key] != value for key, value in binding.items()):
                    _logical_fail('generation-authority-context-rebound')
                logical_id, epoch = prior['logicalEnrollmentId'], prior['initialEpoch']
                if (logical_id != marker['logicalEnrollmentId']
                        or epoch != marker['initialEpoch']):
                    _logical_fail('generation-authority-context-rebound')
                if prior['confirmed']:
                    records = ledger.events(create=False)
                    identity_events = [record for record in records
                                       if record['kind'] == 'identity-allocated']
                    if (len(identity_events) != 1
                            or identity_events[0]['payload'] != {'enrollmentId': logical_id,
                                                                 'initialEpoch': epoch}
                            or identity_events[0]['digest'] != prior['ledgerBirthDigest']):
                        _logical_fail('generation-authority-original-history-missing')
                    if marker['state'] != 'confirmed':
                        self._set_birth_state(marker_path, marker, 'confirmed')
                    return logical_id, epoch
            else:
                logical_id, epoch = marker['logicalEnrollmentId'], marker['initialEpoch']
                intent = {**binding, 'logicalEnrollmentId': logical_id,
                          'initialEpoch': epoch, 'ledgerPath': str(ledger.path)}
                intent_record = self._append_event(events, 'context-birth-intent', intent)
                events.append(intent_record)
                # A pending intent authorizes settling only these exact IDs.
                prior = {**intent, 'contextId': context_id,
                         'intentDigest': intent_record['digest'], 'confirmed': False,
                         'ledgerBirthDigest': None}

            if prior['ledgerPath'] != str(ledger.path):
                _logical_fail('generation-authority-context-rebound')
            # A pending intent may complete the same ledger birth after a
            # crash. No replacement identity or context can be allocated.
            ledger._initialize_identity(logical_id, epoch)
            records = ledger.events(create=False)
            identity_event = next((record for record in records
                                   if record['kind'] == 'identity-allocated'), None)
            if (identity_event is None or identity_event['payload'] != {
                    'enrollmentId': logical_id, 'initialEpoch': epoch}):
                _logical_fail('generation-authority-original-history-missing')
            if marker['state'] == 'pending':
                marker = self._set_birth_state(marker_path, marker, 'confirming')
            confirm = {'contextId': context_id, 'intentDigest': prior['intentDigest'],
                       'ledgerBirthDigest': identity_event['digest']}
            self._append_event(events, 'context-birth-confirmed', confirm)
            self._set_birth_state(marker_path, marker, 'confirmed')
            return logical_id, epoch

    def _birth_marker_path(self, context_id: str) -> Path:
        return self._path.with_name(self._path.name + '.birth-' + _uuid(context_id))

    def _read_birth_marker(self, context_id: str) -> dict[str, Any] | None:
        path = self._birth_marker_path(context_id)
        try:
            fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
        except FileNotFoundError:
            return None
        except OSError:
            _logical_fail('generation-authority-registry-unavailable')
        try:
            st = os.fstat(fd)
            if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                    or st.st_nlink != 1 or st.st_mode & 0o077 or st.st_size > _MAX_REQUEST):
                _logical_fail('generation-authority-registry-path-invalid')
            data = os.read(fd, _MAX_REQUEST + 1)
        finally:
            os.close(fd)
        marker = _parse_canonical(data)
        _closed(marker, {'profile','registryId','contextId','projection','trustEntryDigest',
                         'configurationDigest','ownerBootstrapContextDigest','ledgerPath',
                         'logicalEnrollmentId','initialEpoch','state'},
                 'generation-authority-registry-corrupt')
        if (marker['profile'] != 'umf.generation-authority-context-birth/0.1'
                or marker['registryId'] != self._registry_id
                or marker['contextId'] != context_id
                or marker['state'] not in ('pending','confirming','confirmed')):
            _logical_fail('generation-authority-registry-corrupt')
        _validate_context_projection(marker['projection'])
        for field in ('trustEntryDigest','configurationDigest','ownerBootstrapContextDigest'):
            _digest(marker[field])
        _text(marker['ledgerPath'], 4096)
        _uuid(marker['logicalEnrollmentId']); _uuid(marker['initialEpoch'])
        return marker

    def _write_birth_marker(self, context_id: str, projection: dict[str, Any],
                            entry: OriginalGenerationTrustEnrollment, ledger: _Ledger,
                            logical_id: str, epoch: str, state: str, *,
                            create: bool = False) -> dict[str, Any]:
        statement = _parse_canonical(entry._statement_bytes)
        marker = {'profile':'umf.generation-authority-context-birth/0.1',
                  'registryId':self._registry_id,'contextId':context_id,
                  'projection':projection,'trustEntryDigest':_sha(entry._statement_bytes),
                  'configurationDigest':_sha(entry._configuration_bytes),
                  'ownerBootstrapContextDigest':statement['ownerBootstrapContextDigest'],
                  'ledgerPath':str(ledger.path),'logicalEnrollmentId':logical_id,
                  'initialEpoch':epoch,'state':state}
        _uuid(logical_id); _uuid(epoch)
        data = _canonical(marker)
        path = self._birth_marker_path(context_id)
        if not create:
            _logical_fail('generation-authority-registry-corrupt')
        temp = path.with_name(path.name + '.tmp-' + str(uuid.uuid4()))
        try:
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                         | getattr(os, 'O_NOFOLLOW', 0), 0o600)
            try:
                view = memoryview(data)
                while view:
                    written = os.write(fd, view)
                    if written <= 0:
                        _logical_fail('generation-authority-registry-write-failed')
                    view = view[written:]
                os.fsync(fd)
            finally:
                os.close(fd)
            try:
                os.link(temp, path, follow_symlinks=False)
            except FileExistsError:
                existing = self._read_birth_marker(context_id)
                if (existing is None or existing['projection'] != projection
                        or existing['trustEntryDigest'] != marker['trustEntryDigest']
                        or existing['configurationDigest'] != marker['configurationDigest']
                        or existing['ledgerPath'] != marker['ledgerPath']):
                    _logical_fail('generation-authority-context-rebound')
                return existing
        except OSError:
            _logical_fail('generation-authority-registry-write-failed')
        finally:
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                pass
        parent_fd = os.open(self._path.parent, os.O_RDONLY)
        try:
            os.fsync(parent_fd)
        finally:
            os.close(parent_fd)
        return marker

    def _set_birth_state(self, path: Path, marker: dict[str, Any], state: str
                         ) -> dict[str, Any]:
        allowed = {'pending': {'confirming', 'confirmed'},
                   'confirming': {'confirmed'}, 'confirmed': {'confirmed'}}
        if state not in allowed.get(marker['state'], set()):
            _logical_fail('generation-authority-registry-corrupt')
        updated = {**marker, 'state':state}
        temp = path.with_name(path.name + '.tmp-' + str(uuid.uuid4()))
        data = _canonical(updated)
        try:
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                         | getattr(os, 'O_NOFOLLOW', 0), 0o600)
            try:
                os.write(fd, data); os.fsync(fd)
            finally:
                os.close(fd)
            os.replace(temp, path)
            parent_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(parent_fd)
            finally:
                os.close(parent_fd)
        except OSError:
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                pass
            _logical_fail('generation-authority-registry-write-failed')
        return updated

    def _append_event(self, events: list[dict[str, Any]], kind: str,
                      payload: dict[str, Any]) -> dict[str, Any]:
        record = {'profile': _CONTEXT_REGISTRY_PROFILE,
                  'registryId': self._registry_id, 'sequence': len(events) + 1,
                  'previousDigest': events[-1]['digest'] if events else '0' * 64,
                  'kind': kind, 'payload': payload}
        record['digest'] = _sha(_canonical(record))
        self._append(record)
        return record

    def _load(self, *, create: bool) -> list[dict[str, Any]]:
        with self._locked(create=create):
            return self._load_locked(create=create)

    @contextmanager
    def _locked(self, *, create: bool, exclusive: bool = False):
        parent = self._path.parent
        try:
            st = parent.lstat()
            if (not stat.S_ISDIR(st.st_mode) or stat.S_ISLNK(st.st_mode)
                    or st.st_uid != os.geteuid() or st.st_mode & 0o077):
                _logical_fail('generation-authority-registry-path-invalid')
        except OSError:
            _logical_fail('generation-authority-registry-unavailable')
        lock_path = self._path.with_name(self._path.name + '.lock')
        flags = os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0) | (os.O_CREAT if create else 0)
        try:
            lock_fd = os.open(lock_path, flags, 0o600)
        except OSError:
            _logical_fail('generation-authority-original-context-missing' if not create
                  else 'generation-authority-registry-unavailable')
        try:
            st = os.fstat(lock_fd)
            if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid() or st.st_nlink != 1 or st.st_mode & 0o077:
                _logical_fail('generation-authority-registry-path-invalid')
            fcntl.flock(lock_fd, fcntl.LOCK_EX if create or exclusive else fcntl.LOCK_SH)
            yield lock_fd
        finally:
            os.close(lock_fd)

    def _load_locked(self, *, create: bool) -> list[dict[str, Any]]:
        parent = self._path.parent
        try:
            try:
                fd = os.open(self._path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
            except FileNotFoundError:
                if not create:
                    _logical_fail('generation-authority-original-context-missing')
                fd = os.open(self._path, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                             | getattr(os, 'O_NOFOLLOW', 0), 0o600)
                os.fsync(fd); os.close(fd)
                parent_fd = os.open(parent, os.O_RDONLY)
                try:
                    os.fsync(parent_fd)
                finally:
                    os.close(parent_fd)
                return []
            try:
                st = os.fstat(fd)
                if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid() or st.st_nlink != 1 or st.st_mode & 0o077 or st.st_size > 1_048_576:
                    _logical_fail('generation-authority-registry-path-invalid')
                chunks=[]
                while True:
                    data=os.read(fd,65536)
                    if not data: break
                    chunks.append(data)
            finally:
                os.close(fd)
            raw=b''.join(chunks)
            if not raw: return []
            if not raw.endswith(b'\n'):
                _logical_fail('generation-authority-registry-corrupt')
            events=[]; previous='0'*64; seen_contexts:set[str]=set()
            for n,line in enumerate(raw.splitlines(),1):
                record=_parse_canonical(line)
                _closed(record, {'profile','registryId','sequence','previousDigest','kind',
                                 'payload','digest'},
                         'generation-authority-registry-corrupt')
                digest=record.pop('digest')
                if (record['profile'] != _CONTEXT_REGISTRY_PROFILE
                        or record['registryId']!=self._registry_id or record['sequence']!=n
                        or record['previousDigest']!=previous or record['kind'] not in _CONTEXT_EVENT_KINDS
                        or digest!=_sha(_canonical(record))):
                    _logical_fail('generation-authority-registry-corrupt')
                payload = record['payload']
                if type(payload) is not dict:
                    _logical_fail('generation-authority-registry-corrupt')
                if record['kind'] == 'context-birth-intent':
                    _closed(payload, {'projection','trustEntryDigest','configurationDigest',
                                      'ownerBootstrapContextDigest','logicalEnrollmentId',
                                      'initialEpoch','ledgerPath'},
                            'generation-authority-registry-corrupt')
                    projection=payload['projection']
                    _validate_context_projection(projection)
                    context_id=_uuid(projection['contextId'])
                    if context_id in seen_contexts:
                        _logical_fail('generation-authority-registry-corrupt')
                    seen_contexts.add(context_id)
                    _uuid(payload['logicalEnrollmentId']); _uuid(payload['initialEpoch'])
                    _text(payload['ledgerPath'], 4096)
                    for field in ('trustEntryDigest','configurationDigest','ownerBootstrapContextDigest'):
                        _digest(payload[field])
                else:
                    _closed(payload, {'contextId','intentDigest','ledgerBirthDigest'},
                            'generation-authority-registry-corrupt')
                    _uuid(payload['contextId']); _digest(payload['intentDigest'])
                    _digest(payload['ledgerBirthDigest'])
                record['digest']=digest; previous=digest; events.append(record)
                if len(events)>_MAX_RECORDS: _logical_fail('generation-authority-capacity')
            _context_replay(events)
            return events
        except OSError:
            _logical_fail('generation-authority-registry-unavailable')

    def _append(self, record: dict[str, Any]) -> None:
        data = _canonical(record) + b'\n'
        current = self._path.stat(follow_symlinks=False)
        if (not stat.S_ISREG(current.st_mode) or current.st_uid != os.geteuid()
                or current.st_nlink != 1 or current.st_mode & 0o077
                or current.st_size + len(data) > 1_048_576):
            _logical_fail('generation-authority-registry-capacity')
        fd = os.open(self._path, os.O_WRONLY | os.O_APPEND | getattr(os, 'O_NOFOLLOW', 0))
        try:
            st = os.fstat(fd)
            if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid() or st.st_nlink != 1 or st.st_mode & 0o077:
                _logical_fail('generation-authority-registry-path-invalid')
            view = memoryview(data)
            while view:
                written = os.write(fd, view)
                if written <= 0:
                    _logical_fail('generation-authority-registry-write-failed')
                view = view[written:]
            os.fsync(fd)
        except OSError:
            _logical_fail('generation-authority-registry-write-failed')
        finally:
            os.close(fd)

    def find(self, context_id: str) -> dict[str, Any] | None:
        events = self._load(create=False)
        state = _context_replay(events).get(context_id)
        return state['projection'] if state is not None and state['confirmed'] else None

    def context_for(self, context_id: str) -> dict[str, Any] | None:
        _uuid(context_id)
        return _context_replay(self._load(create=False)).get(context_id)

    def projection_for(self, context_id: str) -> dict[str, Any] | None:
        return self.find(context_id)


# The following source-test issuer is deliberately incapable of issuing any
# native/provider capability.  Production enrollment must come from the
# original LocalPostgresSupervisor deployment registry, which is not yet
# integrated with this module.
_SOURCE_TEST_ISSUER_SEAL = object()


class _SourceTestGenerationTrustIssuer(_GenerationTrustIssuer):
    """Test-only context issuer; never accepted for native effect binding."""

    __slots__ = ('_source_test_only',)

    def __init__(self, seal: object, *, registry_id: str, registry: object,
                 supervisor: object, custodian: object, ingress_store: object,
                 registry_path: Path):
        if seal is not _SOURCE_TEST_ISSUER_SEAL:
            raise TypeError('source-test trust issuer is test-only')
        super().__init__(_TRUST_SEAL, registry_id=registry_id, registry=registry,
                         supervisor=supervisor, custodian=custodian,
                         ingress_store=ingress_store, registry_path=registry_path)
        self._source_test_only = True

    def _issue_original_trust_entry(self, statement: object, configuration: object,
                                    *, ledger_path: str | os.PathLike[str]
                                    ) -> OriginalGenerationTrustEnrollment:
        """Create a marked fixture enrollment only for source-level tests."""
        record = _json_copy(statement)
        config, _keys = _config(configuration)
        expected = {'profile', 'enrollmentId', 'ownerBootstrapContextDigest',
                    'configurationDigest', 'supervisorId', 'custodianId', 'providerId',
                    'installationId', 'targetCustodyDigest', 'storeCreationReceiptDigest',
                    'custodySequence'}
        _closed(record, expected, 'generation-authority-trust-invalid')
        if (record['profile'] != TRUST_PROFILE
                or record['configurationDigest'] != _sha(_canonical(config))
                or record['supervisorId'] != config['supervisorId']
                or record['custodianId'] != config['custodianId']
                or record['providerId'] != config['providerId']
                or record['installationId'] != config['installationId']
                or record['targetCustodyDigest'] != _sha(_canonical(config['targetCustody']))):
            _logical_fail('generation-authority-trust-invalid')
        _uuid(record['enrollmentId'])
        for key in ('ownerBootstrapContextDigest', 'configurationDigest',
                    'targetCustodyDigest', 'storeCreationReceiptDigest'):
            _digest(record[key])
        _uint(record['custodySequence'], 1, _MAX_SAFE_INT)
        path = Path(os.fspath(ledger_path))
        if not path.is_absolute() or os.path.normpath(str(path)) != str(path):
            _logical_fail('generation-authority-ledger-path-invalid')
        statement_bytes = _canonical(record); configuration_bytes = _canonical(config)
        with self._lock:
            prior = self._entries.get(record['enrollmentId'])
            if prior is not None:
                if (prior._statement_bytes != statement_bytes
                        or prior._configuration_bytes != configuration_bytes
                        or prior._ledger_path != path):
                    _logical_fail('generation-authority-trust-rebound')
                return prior
            entry = OriginalGenerationTrustEnrollment(
                _TRUST_SEAL, self, statement_bytes=statement_bytes,
                configuration_bytes=configuration_bytes, supervisor=self._supervisor,
                custodian=self._custodian, ingress_store=self._ingress_store,
                ledger_path=path, entry_id=record['enrollmentId'])
            self._entries[entry._entry_id] = entry
            return entry

    def enroll_generation_authority(self, original_trust_enrollment: object,
                                    original_supervisor: object, original_custodian: object,
                                    original_ingress_store: object
                                    ) -> GenerationEnrollmentAuthorityContext:
        entry = original_trust_enrollment
        if (type(entry) is not OriginalGenerationTrustEnrollment
                or entry._issuer is not self or self._entries.get(entry._entry_id) is not entry
                or original_supervisor is not self._supervisor
                or original_custodian is not self._custodian
                or original_ingress_store is not self._ingress_store):
            _logical_fail('generation-authority-original-trust-required')
        projection = self._projection(entry)
        logical_enrollment_id, initial_epoch = self._reserve_context(entry, projection)
        existing = self._contexts.get(entry._entry_id)
        if existing is not None:
            return existing
        context = GenerationEnrollmentAuthorityContext(
            _CONTEXT_SEAL, self, entry, _canonical(projection),
            logical_enrollment_id, initial_epoch)
        self._contexts[entry._entry_id] = context
        return context

    def resolve_generation_authority_context(
            self, handle: object) -> GenerationEnrollmentAuthorityContext:
        _require_registered_issuer(self, 'source-test')
        if (type(handle) is not GenerationEnrollmentAuthorityContext
                or handle._issuer is not self
                or self._contexts.get(handle._trust._entry_id) is not handle
                or not handle.public_reference.get('sourceTestOnly')):
            _logical_fail('generation-authority-context-unverified')
        entry = handle._trust
        if self._entries.get(entry._entry_id) is not entry:
            _logical_fail('generation-authority-context-unverified')
        projection = _ContextJournal(self._registry_path, self._registry_id).projection_for(
            entry._entry_id)
        if projection != handle.public_reference:
            _logical_fail('generation-authority-context-unverified')
        _verify_durable_context(
            _ContextJournal(self._registry_path, self._registry_id), entry, projection)
        return handle

    def recover_generation_authority_context(
            self, context_id: str, original_trust_enrollment: object,
            original_supervisor: object, original_custodian: object,
            original_ingress_store: object) -> GenerationEnrollmentAuthorityContext:
        context_id = _uuid(context_id)
        entry = original_trust_enrollment
        if (type(entry) is not OriginalGenerationTrustEnrollment or entry._issuer is not self
                or self._entries.get(entry._entry_id) is not entry
                or entry._entry_id != context_id or original_supervisor is not self._supervisor
                or original_custodian is not self._custodian
                or original_ingress_store is not self._ingress_store):
            _logical_fail('generation-authority-original-trust-required')
        expected = _ContextJournal(self._registry_path, self._registry_id).projection_for(context_id)
        projection = self._projection(entry)
        if expected != projection:
            _logical_fail('generation-authority-context-rebound')
        existing = self._contexts.get(context_id)
        if existing is not None:
            return self.resolve_generation_authority_context(existing)
        logical_enrollment_id, initial_epoch = _context_identity(
            _ContextJournal(self._registry_path, self._registry_id), context_id)
        context = GenerationEnrollmentAuthorityContext(
            _CONTEXT_SEAL, self, entry, _canonical(projection),
            logical_enrollment_id, initial_epoch)
        self._contexts[context_id] = context
        return context

    def _projection(self, entry: OriginalGenerationTrustEnrollment) -> dict[str, Any]:
        config = _parse_canonical(entry._configuration_bytes, maximum=_MAX_CONFIG)
        statement = _parse_canonical(entry._statement_bytes)
        return {
            'profile': CONTEXT_PROFILE, 'contextId': entry._entry_id,
            'trustEnrollmentDigest': _sha(entry._statement_bytes),
            'configurationDigest': _sha(entry._configuration_bytes),
            'supervisorId': config['supervisorId'], 'custodianId': config['custodianId'],
            'providerId': config['providerId'], 'installationId': config['installationId'],
            'targetCustodyDigest': _sha(_canonical(config['targetCustody'])),
            'storeCreationReceiptDigest': statement['storeCreationReceiptDigest'],
            'purpose': config['purpose'], 'sourceTestOnly': True,
        }

    def _reserve_context(self, entry: OriginalGenerationTrustEnrollment,
                         projection: dict[str, Any]) -> tuple[str, str]:
        # Test-only enrollment is still durable and exact; its provenance is
        # explicit in the projection and can never satisfy production checks.
        config = _parse_canonical(entry._configuration_bytes, maximum=_MAX_CONFIG)
        ledger = _Ledger(entry._ledger_path, config['authorityId'],
                         _sha(entry._configuration_bytes), _sha(_canonical(projection)),
                         config['purpose'])
        journal = _ContextJournal(self._registry_path, self._registry_id)
        return journal.reserve_context(projection, entry, ledger)


def _source_test_generation_trust_issuer(*, registry_id: str, registry: object,
                                         supervisor: object, custodian: object,
                                         ingress_store: object,
                                         registry_path: str | os.PathLike[str]
                                         ) -> _SourceTestGenerationTrustIssuer:
    """Private test fixture constructor; has no production/native authority."""
    path = Path(os.fspath(registry_path))
    if not path.is_absolute() or os.path.normpath(str(path)) != str(path):
        _logical_fail('generation-authority-registry-path-invalid')
    issuer = _SourceTestGenerationTrustIssuer(
        _SOURCE_TEST_ISSUER_SEAL, registry_id=registry_id, registry=registry,
        supervisor=supervisor, custodian=custodian, ingress_store=ingress_store,
        registry_path=path)
    _register_trust_issuer(issuer, 'source-test')
    return issuer




class ConfiguredGenerationAuthorityRootVerifier:
    """Exact Ed25519 verifier for the new ROOT trust signing domain."""

    __slots__ = ('_policy', '_purpose')

    def __init__(self, policy: dict[str, Any], *, purpose: str):
        self._policy = policy
        self._purpose = purpose

    def verify_approval(self, payload: object, signature: object) -> str:
        """Verify one policy-selected original root key; no key is caller supplied."""
        try:
            from cryptography import __version__ as crypto_version
            from cryptography.exceptions import InvalidSignature
            from cryptography.hazmat.primitives.asymmetric.ed25519 import (
                Ed25519PublicKey,
            )
        except ImportError:
            _fail('generation-root-crypto-unavailable')
        if crypto_version != '50.0.2':
            _fail('generation-root-crypto-version-unsupported')
        exact = _closed(payload, {
            'profile', 'scope', 'rootAuthorityId', 'rootPolicyRevision', 'keyId',
            'principalId', 'approvalId', 'purpose', 'bootstrapEnrollmentId',
            'rootPolicyDigest', 'supervisorId', 'custodianId', 'providerId',
            'installationId', 'intentDigest'}, 'generation-root-approval-invalid')
        policy = _closed(self._policy, {'profile', 'authorityId', 'policyRevision', 'keys'},
                         'generation-root-policy-invalid')
        if (exact['profile'] != ROOT_APPROVAL_PROFILE
                or exact['scope'] != 'enroll-generation-authority'
                or exact['rootAuthorityId'] != policy['authorityId']
                or exact['rootPolicyRevision'] != policy['policyRevision']
                or exact['purpose'] != self._purpose):
            _fail('generation-root-approval-invalid')
        selected = [item for item in policy['keys']
                    if item.get('keyId') == exact['keyId']
                    and item.get('principalId') == exact['principalId']]
        if len(selected) != 1:
            _fail('generation-root-key-unavailable')
        item = selected[0]
        if 'umf.configured-generation-enrollment-authority/0.1' not in item['configurationProfiles']:
            _fail('generation-root-profile-denied')
        if exact['purpose'] not in ('production', 'native-acceptance'):
            _fail('generation-root-purpose-denied')
        if (type(signature) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{86}', signature)):
            _fail('generation-root-signature-invalid')
        try:
            raw_key = base64.urlsafe_b64decode(item['publicKey'] + '=')
            raw_sig = base64.urlsafe_b64decode(signature + '==')
            if len(raw_key) != 32 or len(raw_sig) != 64:
                _fail('generation-root-signature-invalid')
            message = (ROOT_APPROVAL_PROFILE.encode('ascii') + b'\x00'
                       + _canonical(exact))
            Ed25519PublicKey.from_public_bytes(raw_key).verify(raw_sig, message)
        except InvalidSignature:
            _fail('generation-root-signature-invalid')
        except (ValueError, TypeError):
            _fail('generation-root-signature-invalid')
        return exact['approvalId']

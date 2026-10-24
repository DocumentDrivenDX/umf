"""Pure source-level transitions for the governed generation ROOT registry.

These functions transform caller-supplied canonical bytes. They do not provide
persistence, locking, compare-and-swap, authority, or native custody.
"""
from __future__ import annotations

from typing import Any

from umf_access.lifecycle import generation_authority_bootstrap as root


def _context(raw: bytes, *, registry_id: str, anchor_digest: str,
             root_policy: object, purpose: str,
             bootstrap_enrollment_id: str) -> dict[str, Any]:
    root.validate_registry(raw, registry_id=registry_id, anchor_digest=anchor_digest,
                           root_policy=root_policy, purpose=purpose,
                           bootstrap_enrollment_id=bootstrap_enrollment_id)
    return root._parse(raw)


def reserve_prepared(raw: bytes, request: object, *, registry_id: str,
                     anchor_digest: str, root_policy: object, purpose: str,
                     bootstrap_enrollment_id: str) -> bytes:
    """Append one exact prepared request, or return bytes unchanged on replay."""
    value = _context(raw, registry_id=registry_id, anchor_digest=anchor_digest,
                     root_policy=root_policy, purpose=purpose,
                     bootstrap_enrollment_id=bootstrap_enrollment_id)
    # Canonical copying rejects non-JSON containers and floats before any Python
    # equality/hash operation can treat them as equivalent to signed JSON values.
    candidate_bytes = root._root_canonical(request, maximum=root._MAX_REQUEST)
    candidate_request = root._parse(candidate_bytes)
    root._closed(candidate_request, {
        'requestId', 'enrollmentId', 'contextId', 'effectKey', 'intent', 'payload',
        'state', 'reservedSequence', 'confirmedSequence', 'approvalEnvelope'},
        'generation-root-registry-invalid')
    if (candidate_request['state'] != 'prepared'
            or candidate_request['confirmedSequence'] is not None
            or candidate_request['approvalEnvelope'] is not None):
        root._fail('generation-root-registry-invalid')
    reserve_sequence = candidate_request['reservedSequence']
    if (type(reserve_sequence) is not int
            or not 1 <= reserve_sequence <= root._MAX_SAFE):
        root._fail('generation-root-registry-sequence-invalid')
    request_id = root._uuid(candidate_request['requestId'])
    root._uuid(candidate_request['enrollmentId'])
    root._uuid(candidate_request['contextId'])
    effect_key = candidate_request['effectKey']
    if (type(effect_key) is not list or len(effect_key) != 6
            or any(type(part) is not str or not part for part in effect_key)):
        root._fail('generation-root-registry-invalid')
    for part in effect_key:
        root._root_text(part, 256)
    intent, trust, configuration = root._validate_root_intent(
        candidate_request['intent'], request=candidate_request)
    root._validate_root_payload(
        candidate_request['payload'], intent=intent, trust=trust,
        configuration=configuration, effect=effect_key, root_policy=root_policy,
        purpose=purpose, bootstrap_enrollment_id=bootstrap_enrollment_id)
    existing_by_id = {item['requestId']: item for item in value['requests']}
    existing_by_effect = {tuple(item['effectKey']): item for item in value['requests']}
    effect_identity = tuple(effect_key)
    if request_id in existing_by_id:
        existing = existing_by_id[request_id]
        stable_existing = {k: v for k, v in existing.items()
                           if k not in ('state', 'confirmedSequence', 'approvalEnvelope')}
        stable_candidate = {k: v for k, v in candidate_request.items()
                           if k not in ('state', 'confirmedSequence', 'approvalEnvelope')}
        if root._root_canonical(stable_candidate) == root._root_canonical(stable_existing):
            return raw
        root._fail('generation-root-registry-duplicate-identity')
    if effect_identity in existing_by_effect:
        root._fail('generation-root-registry-duplicate-effect')
    if (len(value['requests']) >= root._MAX_REQUESTS
            or value['sequence'] >= root._MAX_SAFE
            or reserve_sequence != value['sequence'] + 1):
        root._fail('generation-root-registry-sequence-invalid')
    updated = dict(value)
    updated['requests'] = [*value['requests'], candidate_request]
    updated['sequence'] = value['sequence'] + 1
    encoded = root._root_canonical(updated)
    _context(encoded, registry_id=registry_id, anchor_digest=anchor_digest,
             root_policy=root_policy, purpose=purpose,
             bootstrap_enrollment_id=bootstrap_enrollment_id)
    return encoded


def confirm_prepared(raw: bytes, request_id: str, envelope: object, *,
                     registry_id: str, anchor_digest: str, root_policy: object,
                     purpose: str, bootstrap_enrollment_id: str) -> bytes:
    """Confirm one prepared request with a verified signed envelope."""
    value = _context(raw, registry_id=registry_id, anchor_digest=anchor_digest,
                     root_policy=root_policy, purpose=purpose,
                     bootstrap_enrollment_id=bootstrap_enrollment_id)
    request_id = root._uuid(request_id)
    envelope_bytes = root._root_canonical(envelope, maximum=16_384)
    envelope_value = root._parse(envelope_bytes)
    matches = [item for item in value['requests'] if item['requestId'] == request_id]
    if len(matches) != 1:
        root._fail('generation-root-registry-invalid')
    current = matches[0]
    if current['state'] == 'confirmed':
        current_envelope_bytes = root._root_canonical(
            current['approvalEnvelope'], maximum=16_384)
        if envelope_bytes == current_envelope_bytes:
            return raw
        root._fail('generation-root-registry-crosslink-invalid')
    if (current['state'] != 'prepared'
            or value['sequence'] >= root._MAX_SAFE
            or len(value['enrollments']) >= root._MAX_ENROLLMENTS):
        root._fail('generation-root-registry-invalid')
    updated = root._json_copy(value)
    target = next(item for item in updated['requests'] if item['requestId'] == request_id)
    target['state'] = 'confirmed'
    target['confirmedSequence'] = value['sequence'] + 1
    target['approvalEnvelope'] = envelope_value
    intent = target['intent']
    trust = intent['trust']
    payload = target['payload']
    enrollment = {
        'profile': root.ROOT_ENROLLMENT_PROFILE,
        'enrollmentId': target['enrollmentId'], 'requestId': target['requestId'],
        'contextId': target['contextId'],
        'bootstrapEnrollmentId': bootstrap_enrollment_id,
        'rootPolicyDigest': payload['rootPolicyDigest'],
        'rootApprovalDigest': root._sha(envelope_bytes),
        'trust': trust, 'configuration': intent['configuration'],
        'configurationDigest': intent['configurationDigest'],
        'nativeEvidenceDigest': intent['nativeEvidenceDigest'],
        'state': 'confirmed', 'registrySequence': value['sequence'] + 1,
    }
    updated['enrollments'].append(enrollment)
    updated['sequence'] = value['sequence'] + 1
    encoded = root._root_canonical(updated)
    _context(encoded, registry_id=registry_id, anchor_digest=anchor_digest,
             root_policy=root_policy, purpose=purpose,
             bootstrap_enrollment_id=bootstrap_enrollment_id)
    return encoded

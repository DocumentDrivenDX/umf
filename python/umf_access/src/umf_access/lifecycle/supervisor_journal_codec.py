# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native-free supervisor journal profile codec."""
from __future__ import annotations

import base64
import hashlib
import json
import re
from typing import Any

MAX_EVENTS = 4096
MAX_BYTES = 8 * 1024 * 1024
LEGACY_PROFILE = 'umf.local-postgresql-supervisor-journal/0.1'
JOURNAL_PROFILE_02 = 'umf.local-postgresql-owner-journal/0.2'
DEFINITION_PROFILE = 'umf.supervisor-journal-definition/0.1'
BIRTH_PROFILE = 'umf.original-supervisor-journal-birth/0.1'
ANCHOR_PROFILE = 'umf.original-supervisor-journal-anchor/0.1'
CONTEXT_METADATA_PROFILE = 'umf.owner-context-journal-metadata/0.1'
ENROLLMENT_03 = 'umf.local-owner-bootstrap-enrollment/0.3'
_HEX = re.compile(r'^[a-f0-9]{64}$')
_UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')

class SupervisorJournalCodecError(ValueError):
    def __init__(self, code: str):
        super().__init__(code); self.code = code

def canonical(value: Any) -> bytes:
    stack = [(value, 0)]
    count = 0
    while stack:
        item, depth = stack.pop()
        count += 1
        if count > 100_000 or depth > 64:
            raise SupervisorJournalCodecError('supervisor-journal-capacity')
        if item is None or type(item) is bool:
            continue
        if type(item) is int:
            if abs(item) > 9_007_199_254_740_991:
                raise SupervisorJournalCodecError('supervisor-journal-corrupt')
        elif type(item) is str:
            try:
                item.encode('utf-8')
            except UnicodeEncodeError:
                raise SupervisorJournalCodecError('supervisor-journal-corrupt') from None
            if '\x00' in item:
                raise SupervisorJournalCodecError('supervisor-journal-corrupt')
        elif type(item) is list:
            if len(item) > MAX_EVENTS:
                raise SupervisorJournalCodecError('supervisor-journal-capacity')
            stack.extend((child, depth + 1) for child in item)
        elif type(item) is dict:
            if any(type(key) is not str or not key.isascii() for key in item):
                raise SupervisorJournalCodecError('supervisor-journal-corrupt')
            stack.extend((key, depth + 1) for key in item)
            stack.extend((child, depth + 1) for child in item.values())
        else:
            raise SupervisorJournalCodecError('supervisor-journal-corrupt')
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')
    except (TypeError, ValueError, UnicodeError, RecursionError):
        raise SupervisorJournalCodecError('supervisor-journal-corrupt') from None

def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()

_digest = digest


def _validate_native_evidence_bytes(raw: bytes) -> dict[str, Any]:
    """Require canonical JSON-object bytes, without claiming native authority."""
    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in items:
            if key in result:
                raise SupervisorJournalCodecError(
                    'supervisor-journal-root-observation-invalid')
            result[key] = value
        return result

    def reject_number(_value: str) -> Any:
        raise SupervisorJournalCodecError(
            'supervisor-journal-root-observation-invalid')

    try:
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                           parse_float=reject_number, parse_constant=reject_number)
    except SupervisorJournalCodecError:
        raise
    except (UnicodeError, ValueError, RecursionError):
        raise SupervisorJournalCodecError(
            'supervisor-journal-root-observation-invalid') from None
    try:
        canonical_bytes = canonical(value) if type(value) is dict else None
    except SupervisorJournalCodecError:
        raise SupervisorJournalCodecError(
            'supervisor-journal-root-observation-invalid') from None
    if canonical_bytes != raw:
        raise SupervisorJournalCodecError(
            'supervisor-journal-root-observation-invalid')
    return value

def validate_definition(value: object) -> dict[str, Any]:
    expected = {'profile': DEFINITION_PROFILE, 'journalProfile': JOURNAL_PROFILE_02,
                'physicalEvents': 'umf.supervisor-physical-events/0.2',
                'rootEvents': 'umf.supervisor-generation-root-events/0.1',
                'originalsEvents': 'umf.supervisor-originals-store-events/0.1',
                'ingressEvents': None, 'applicationEvents': None}
    if type(value) is not dict or value != expected or set(value) != set(expected):
        raise SupervisorJournalCodecError('supervisor-journal-definition-unsupported')
    return dict(value)

def validate_metadata(value: object) -> dict[str, Any]:
    keys = {'profile', 'enrollmentProfile', 'ownerContextProfile', 'ownerBootstrapContextDigest', 'supervisorJournal'}
    if type(value) is not dict or set(value) != keys or value.get('profile') != CONTEXT_METADATA_PROFILE:
        raise SupervisorJournalCodecError('supervisor-journal-context-metadata-invalid')
    if value['ownerContextProfile'] != 'umf.local-owner-bootstrap-context/0.3' or type(value['ownerBootstrapContextDigest']) is not str or not _HEX.fullmatch(value['ownerBootstrapContextDigest']):
        raise SupervisorJournalCodecError('supervisor-journal-context-metadata-invalid')
    descriptor = value['supervisorJournal']
    if value['enrollmentProfile'] in ('umf.local-owner-bootstrap-enrollment/0.1', 'umf.local-owner-bootstrap-enrollment/0.2'):
        if descriptor is not None:
            raise SupervisorJournalCodecError('supervisor-journal-context-metadata-invalid')
    elif value['enrollmentProfile'] == ENROLLMENT_03:
        names = {'birthDigest', 'journalProfile', 'journalId', 'definitionDigest'}
        if (type(descriptor) is not dict or set(descriptor) != names or descriptor.get('journalProfile') != JOURNAL_PROFILE_02 or type(descriptor.get('journalId')) is not str or not _UUID.fullmatch(descriptor['journalId']) or any(type(descriptor.get(k)) is not str or not _HEX.fullmatch(descriptor[k]) for k in ('birthDigest', 'definitionDigest'))):
            raise SupervisorJournalCodecError('supervisor-journal-context-metadata-invalid')
    else:
        raise SupervisorJournalCodecError('supervisor-journal-context-metadata-invalid')
    return json.loads(canonical(value))

def expected_paths(control_home: object, supervisor_id: object) -> tuple[str, str]:
    if type(control_home) is not str or not control_home.startswith('/') or '\x00' in control_home or type(supervisor_id) is not str or not _UUID.fullmatch(supervisor_id):
        raise SupervisorJournalCodecError('supervisor-journal-birth-invalid')
    basename = 'owner-journal-' + supervisor_id.replace('-', '') + '.json'
    path = control_home.rstrip('/') + '/' + basename
    return path, path + '.lock'

def initial_record(*, supervisor_id: str, journal_id: str, definition_digest: str, anchor_digest: str) -> bytes:
    return canonical({'profile': JOURNAL_PROFILE_02, 'supervisorId': supervisor_id, 'journalId': journal_id, 'definitionDigest': definition_digest, 'anchorDigest': anchor_digest, 'sequence': 0, 'headDigest': anchor_digest, 'events': []})

def validate_birth(value: object, *, enrollment: dict[str, Any],
                   configuration_digest: str, generation_root_policy_digest: str | None) -> dict[str, Any]:
    keys = {'profile', 'journalProfile', 'journalId', 'supervisorId', 'definition',
            'definitionDigest', 'path', 'lockPath', 'anchorDigest', 'initialHeaderDigest'}
    if type(value) is not dict or set(value) != keys:
        raise SupervisorJournalCodecError('supervisor-journal-birth-invalid')
    if value['profile'] != BIRTH_PROFILE or value['journalProfile'] != JOURNAL_PROFILE_02:
        raise SupervisorJournalCodecError('supervisor-journal-birth-invalid')
    journal_id, supervisor_id = value['journalId'], value['supervisorId']
    if (type(journal_id) is not str or not _UUID.fullmatch(journal_id)
            or type(supervisor_id) is not str or not _UUID.fullmatch(supervisor_id)):
        raise SupervisorJournalCodecError('supervisor-journal-birth-invalid')
    expected_enrollment = {'profile', 'enrollmentId', 'purpose', 'context',
                           'ownerConfiguration', 'nativeProfile',
                           'generationAuthorityRoots', 'supervisorJournalBirth'}
    context, native = enrollment.get('context'), enrollment.get('nativeProfile')
    if (type(context) is not dict or type(native) is not dict
            or set(enrollment) != expected_enrollment
            or enrollment.get('profile') != ENROLLMENT_03
            or type(enrollment.get('enrollmentId')) is not str
            or not _UUID.fullmatch(enrollment['enrollmentId'])
            or enrollment.get('purpose') not in ('production', 'native-acceptance')
            or type(configuration_digest) is not str
            or not _HEX.fullmatch(configuration_digest)
            or (generation_root_policy_digest is not None
                and (type(generation_root_policy_digest) is not str
                     or not _HEX.fullmatch(generation_root_policy_digest)))
            or supervisor_id != context.get('supervisorId')
            or supervisor_id != native.get('supervisorId')):
        raise SupervisorJournalCodecError('supervisor-journal-birth-invalid')
    if hashlib.sha256(canonical(enrollment['ownerConfiguration'])).hexdigest() != configuration_digest:
        raise SupervisorJournalCodecError('supervisor-journal-birth-invalid')
    paths = expected_paths(native.get('controlHome'), supervisor_id)
    if (value['path'], value['lockPath']) != paths:
        raise SupervisorJournalCodecError('supervisor-journal-birth-invalid')
    definition = validate_definition(value['definition'])
    definition_digest = hashlib.sha256(canonical(definition)).hexdigest()
    if value['definitionDigest'] != definition_digest:
        raise SupervisorJournalCodecError('supervisor-journal-birth-invalid')
    for name in ('anchorDigest', 'initialHeaderDigest'):
        if type(value[name]) is not str or not _HEX.fullmatch(value[name]):
            raise SupervisorJournalCodecError('supervisor-journal-birth-invalid')
    native_digest = hashlib.sha256(canonical(native)).hexdigest()
    anchor = {'profile': ANCHOR_PROFILE, 'enrollmentId': enrollment.get('enrollmentId'),
              'purpose': enrollment.get('purpose'), 'context': context,
              'authorityConfigurationDigest': configuration_digest,
              'nativeProfileDigest': native_digest,
              'generationRootPolicyDigest': generation_root_policy_digest,
              'journalId': journal_id, 'path': paths[0], 'lockPath': paths[1],
              'definitionDigest': definition_digest}
    anchor_digest = hashlib.sha256(canonical(anchor)).hexdigest()
    if value['anchorDigest'] != anchor_digest:
        raise SupervisorJournalCodecError('supervisor-journal-birth-invalid')
    if enrollment['supervisorJournalBirth'] != value:
        raise SupervisorJournalCodecError('supervisor-journal-birth-invalid')
    initial = initial_record(supervisor_id=supervisor_id, journal_id=journal_id,
                             definition_digest=definition_digest,
                             anchor_digest=anchor_digest)
    if hashlib.sha256(initial).hexdigest() != value['initialHeaderDigest']:
        raise SupervisorJournalCodecError('supervisor-journal-birth-invalid')
    return json.loads(canonical(value))

def validate_record(raw: object, *, birth: dict[str, Any],
                    owner_bootstrap_context_digest: str,
                    generation_root_policy_digest: str | None,
                    root_replay_context: object | None = None,
                    include_root_state: bool = False) -> dict[str, Any] | tuple[
                        dict[str, Any], bytes | None, bytes | None]:
    if type(raw) is not bytes or not 1 <= len(raw) <= MAX_BYTES:
        raise SupervisorJournalCodecError('supervisor-journal-corrupt')
    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, val in items:
            if key in result:
                raise SupervisorJournalCodecError('supervisor-journal-corrupt')
            result[key] = val
        return result
    try:
        doc = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                         parse_float=lambda _v: (_ for _ in ()).throw(
                             SupervisorJournalCodecError('supervisor-journal-corrupt')),
                         parse_constant=lambda _v: (_ for _ in ()).throw(
                             SupervisorJournalCodecError('supervisor-journal-corrupt')))
    except SupervisorJournalCodecError:
        raise
    except (UnicodeError, ValueError, RecursionError):
        raise SupervisorJournalCodecError('supervisor-journal-corrupt') from None
    if canonical(doc) != raw:
        raise SupervisorJournalCodecError('supervisor-journal-noncanonical')
    keys = {'profile', 'supervisorId', 'journalId', 'definitionDigest',
            'anchorDigest', 'sequence', 'headDigest', 'events'}
    if (type(doc) is not dict or set(doc) != keys
            or doc['profile'] != JOURNAL_PROFILE_02
            or doc['supervisorId'] != birth['supervisorId']
            or doc['journalId'] != birth['journalId']
            or doc['definitionDigest'] != birth['definitionDigest']
            or doc['anchorDigest'] != birth['anchorDigest']
            or type(doc['events']) is not list or len(doc['events']) > MAX_EVENTS
            or type(doc['sequence']) is not int
            or doc['sequence'] != len(doc['events'])):
        raise SupervisorJournalCodecError('supervisor-journal-corrupt')
    previous = birth['anchorDigest']
    for index, event in enumerate(doc['events'], 1):
        if (type(event) is not dict or set(event) != {
                'sequence', 'kind', 'payload', 'previousDigest', 'recordDigest'}
                or type(event['sequence']) is not int or event['sequence'] != index
                or type(event['kind']) is not str or type(event['payload']) is not dict
                or event['previousDigest'] != previous):
            raise SupervisorJournalCodecError('supervisor-journal-corrupt')
        unhashed = {key: event[key] for key in
                    ('sequence', 'kind', 'payload', 'previousDigest')}
        if event['recordDigest'] != hashlib.sha256(canonical(unhashed)).hexdigest():
            raise SupervisorJournalCodecError('supervisor-journal-corrupt')
        previous = event['recordDigest']
    if doc['headDigest'] != previous:
        raise SupervisorJournalCodecError('supervisor-journal-corrupt')
    if type(owner_bootstrap_context_digest) is not str or not _HEX.fullmatch(
            owner_bootstrap_context_digest):
        raise SupervisorJournalCodecError('supervisor-journal-context-metadata-invalid')
    if (generation_root_policy_digest is not None
            and (type(generation_root_policy_digest) is not str
                 or not _HEX.fullmatch(generation_root_policy_digest))):
        raise SupervisorJournalCodecError('supervisor-journal-root-context-invalid')
    validated_root_context = _validate_root_replay_context(root_replay_context)
    if validated_root_context is not None and (
            generation_root_policy_digest is None
            or hashlib.sha256(canonical(validated_root_context['rootPolicy'])).hexdigest()
                != generation_root_policy_digest):
        raise SupervisorJournalCodecError('supervisor-journal-root-context-invalid')
    try:
        replay = _Replay(
            birth['supervisorId'],
            owner_bootstrap_context_digest=owner_bootstrap_context_digest,
            birth_digest=hashlib.sha256(canonical(birth)).hexdigest(),
            root_replay_context=root_replay_context,
        )
        replay._replay(doc['events'])
    except SupervisorJournalCodecError:
        raise
    except (AssertionError, AttributeError, IndexError, KeyError, TypeError):
        raise SupervisorJournalCodecError('supervisor-journal-corrupt') from None
    return (doc, replay.root_raw, replay.pending_root_raw) if include_root_state else doc

def validate_legacy_record(raw: object, *, supervisor_id: str) -> dict[str, Any]:
    """Validate the retained 0.1 bytes without selecting or upgrading 0.2."""
    if type(raw) is not bytes or not 1 <= len(raw) <= MAX_BYTES:
        raise SupervisorJournalCodecError('supervisor-journal-corrupt')
    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, val in items:
            if key in result:
                raise SupervisorJournalCodecError('supervisor-journal-corrupt')
            result[key] = val
        return result
    try:
        doc = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                         parse_float=lambda _v: (_ for _ in ()).throw(
                             SupervisorJournalCodecError('supervisor-journal-corrupt')),
                         parse_constant=lambda _v: (_ for _ in ()).throw(
                             SupervisorJournalCodecError('supervisor-journal-corrupt')))
    except SupervisorJournalCodecError:
        raise
    except (UnicodeError, ValueError, RecursionError):
        raise SupervisorJournalCodecError('supervisor-journal-corrupt') from None
    if canonical(doc) != raw:
        raise SupervisorJournalCodecError('supervisor-journal-noncanonical')
    if (type(doc) is not dict or set(doc) != {
            'profile', 'supervisorId', 'sequence', 'headDigest', 'events'}
            or doc['profile'] != LEGACY_PROFILE or doc['supervisorId'] != supervisor_id
            or type(doc['events']) is not list or len(doc['events']) > MAX_EVENTS
            or type(doc['sequence']) is not int
            or doc['sequence'] != len(doc['events'])):
        raise SupervisorJournalCodecError('supervisor-journal-corrupt')
    previous = '0' * 64
    for index, event in enumerate(doc['events'], 1):
        if (type(event) is not dict or set(event) != {
                'sequence', 'kind', 'payload', 'previousDigest', 'recordDigest'}
                or type(event['sequence']) is not int or event['sequence'] != index
                or type(event['kind']) is not str or type(event['payload']) is not dict
                or event['previousDigest'] != previous):
            raise SupervisorJournalCodecError('supervisor-journal-corrupt')
        unhashed = {key: event[key] for key in
                    ('sequence', 'kind', 'payload', 'previousDigest')}
        if event['recordDigest'] != hashlib.sha256(canonical(unhashed)).hexdigest():
            raise SupervisorJournalCodecError('supervisor-journal-corrupt')
        previous = event['recordDigest']
    if doc['headDigest'] != previous:
        raise SupervisorJournalCodecError('supervisor-journal-corrupt')
    try:
        _Replay(supervisor_id, LEGACY_PROFILE)._replay(doc['events'])
    except SupervisorJournalCodecError:
        raise
    except (AssertionError, AttributeError, IndexError, KeyError, TypeError):
        raise SupervisorJournalCodecError('supervisor-journal-corrupt') from None
    return doc



# Fixed state machine shared by enrolled 0.2 record validation.
_canonical = canonical
_MAX_EVENTS = MAX_EVENTS
def _uuid(value: object) -> str:
    if type(value) is not str or not _UUID.fullmatch(value):
        raise SupervisorJournalCodecError('supervisor-journal-corrupt')
    return value


def _validate_root_replay_context(value: object | None) -> dict[str, Any] | None:
    if value is None:
        return None
    keys = {'registryId', 'anchorDigest', 'rootPolicy', 'purpose',
            'bootstrapEnrollmentId', 'initialRegistryDigest'}
    if type(value) is not dict or set(value) != keys:
        raise SupervisorJournalCodecError('supervisor-journal-root-context-invalid')
    if (type(value['registryId']) is not str or not _UUID.fullmatch(value['registryId'])
            or type(value['bootstrapEnrollmentId']) is not str
            or not _UUID.fullmatch(value['bootstrapEnrollmentId'])
            or value['purpose'] not in ('production', 'native-acceptance')
            or any(type(value[key]) is not str or not _HEX.fullmatch(value[key])
                   for key in ('anchorDigest', 'initialRegistryDigest'))):
        raise SupervisorJournalCodecError('supervisor-journal-root-context-invalid')
    from umf_access.lifecycle import generation_authority_bootstrap as root
    try:
        raw = root.initial_registry_bytes(value['registryId'], value['anchorDigest'])
        if hashlib.sha256(raw).hexdigest() != value['initialRegistryDigest']:
            raise SupervisorJournalCodecError('supervisor-journal-root-context-invalid')
        root.validate_registry(
            raw, registry_id=value['registryId'], anchor_digest=value['anchorDigest'],
            root_policy=value['rootPolicy'], purpose=value['purpose'],
            bootstrap_enrollment_id=value['bootstrapEnrollmentId'])
    except root.GenerationAuthorityBootstrapError:
        raise SupervisorJournalCodecError('supervisor-journal-root-context-invalid') from None
    copied = json.loads(canonical(value))
    copied['initialBytes'] = raw
    return copied


def _root_projection(raw: bytes) -> dict[str, Any]:
    from umf_access.lifecycle import generation_authority_bootstrap as root
    value = root._parse(raw)
    return {'sequence': value['sequence'], 'digest': hashlib.sha256(raw).hexdigest()}


def _root_projection_matches(value: object, expected: dict[str, Any]) -> bool:
    return (type(value) is dict and set(value) == {'sequence', 'digest'}
            and type(value['sequence']) is int
            and value['sequence'] == expected['sequence']
            and type(value['digest']) is str
            and value['digest'] == expected['digest'])


def _apply_root_mutation(payload: dict[str, Any], *, context: dict[str, Any],
                         prior_raw: bytes, owner_context_digest: str
                         ) -> tuple[bytes, dict[str, Any] | None, str | None]:
    from umf_access.lifecycle import generation_authority_bootstrap as root
    from umf_access.lifecycle.generation_root_registry import (
        confirm_prepared,
        reserve_prepared,
    )
    keys = {'purpose', 'mutationId', 'operation', 'registryId', 'rootRequestId',
            'rootIntentDigest', 'configurationDigest', 'ownerBootstrapContextDigest',
            'nativeEvidenceDigest', 'validationObservationEventDigest', 'prior',
            'next', 'delta', 'subordinateBirth'}
    if type(payload) is not dict or set(payload) != keys:
        raise SupervisorJournalCodecError('supervisor-journal-root-event-invalid')
    operation = payload['operation']
    if operation not in ('reserve', 'confirm'):
        raise SupervisorJournalCodecError('supervisor-journal-root-event-invalid')
    if (payload['purpose'] != context['purpose']
            or payload['registryId'] != context['registryId']
            or payload['ownerBootstrapContextDigest'] != owner_context_digest
            or type(payload['mutationId']) is not str
            or not _UUID.fullmatch(payload['mutationId'])
            or type(payload['rootRequestId']) is not str
            or not _UUID.fullmatch(payload['rootRequestId'])
            or any(type(payload[name]) is not str or not _HEX.fullmatch(payload[name])
                   for name in ('rootIntentDigest', 'configurationDigest',
                                'nativeEvidenceDigest', 'validationObservationEventDigest'))):
        raise SupervisorJournalCodecError('supervisor-journal-root-origin-mismatch')
    expected_prior = _root_projection(prior_raw)
    if not _root_projection_matches(payload['prior'], expected_prior):
        raise SupervisorJournalCodecError('supervisor-journal-root-origin-mismatch')
    args = {'registry_id': context['registryId'], 'anchor_digest': context['anchorDigest'],
            'root_policy': context['rootPolicy'], 'purpose': context['purpose'],
            'bootstrap_enrollment_id': context['bootstrapEnrollmentId']}
    derived_enrollment = None
    subordinate_digest = None
    try:
        if operation == 'reserve':
            if (type(payload['delta']) is not dict or set(payload['delta']) != {'request'}
                    or payload['subordinateBirth'] is not None):
                raise SupervisorJournalCodecError('supervisor-journal-root-event-invalid')
            request = payload['delta']['request']
            if (type(request) is not dict or request.get('requestId') != payload['rootRequestId']
                    or _digest(request.get('intent')) != payload['rootIntentDigest']
                    or request.get('intent', {}).get('configurationDigest') != payload['configurationDigest']
                    or request.get('intent', {}).get('nativeEvidenceDigest') != payload['nativeEvidenceDigest']):
                raise SupervisorJournalCodecError('supervisor-journal-root-origin-mismatch')
            next_raw = reserve_prepared(prior_raw, request, **args)
        else:
            if (type(payload['delta']) is not dict
                    or set(payload['delta']) != {'requestId', 'approvalEnvelope', 'enrollment'}
                    or payload['delta']['requestId'] != payload['rootRequestId']):
                raise SupervisorJournalCodecError('supervisor-journal-root-event-invalid')
            envelope = payload['delta']['approvalEnvelope']
            current = root._parse(prior_raw)
            matched = [item for item in current['requests']
                       if item['requestId'] == payload['rootRequestId']]
            if (len(matched) != 1
                    or _digest(matched[0]['intent']) != payload['rootIntentDigest']
                    or matched[0]['intent'].get('configurationDigest')
                        != payload['configurationDigest']
                    or matched[0]['intent'].get('nativeEvidenceDigest')
                        != payload['nativeEvidenceDigest']
                    or type(envelope) is not dict
                    or type(envelope.get('payload')) is not dict
                    or envelope['payload'].get('intentDigest')
                        != payload['rootIntentDigest']):
                raise SupervisorJournalCodecError('supervisor-journal-root-origin-mismatch')
            next_raw = confirm_prepared(
                prior_raw, payload['rootRequestId'], envelope, **args)
            updated = root._parse(next_raw)
            matches = [item for item in updated['enrollments']
                       if item['requestId'] == payload['rootRequestId']]
            if len(matches) != 1 or canonical(matches[0]) != canonical(payload['delta']['enrollment']):
                raise SupervisorJournalCodecError('supervisor-journal-root-origin-mismatch')
            derived_enrollment = matches[0]
            subordinate = payload['subordinateBirth']
            birth_keys = {'profile', 'rootRegistryId', 'contextJournalRegistryId',
                          'contextId', 'rootRequestId', 'trustEnrollmentId',
                          'configurationDigest', 'contextProjectionDigest',
                          'logicalEnrollmentId', 'initialEpoch', 'contextJournalPath',
                          'contextJournalEntryDigest', 'contextBirthMarkerPath',
                          'contextBirthMarkerDigest', 'approvalLedgerPath',
                          'approvalLedgerLockPath', 'approvalLedgerBirthDigest'}
            if (type(subordinate) is not dict or set(subordinate) != birth_keys
                    or subordinate.get('profile') != 'umf.generation-authority-logical-birth/0.1'
                    or subordinate.get('rootRegistryId') != context['registryId']
                    or subordinate.get('contextId') != derived_enrollment['contextId']
                    or subordinate.get('rootRequestId') != payload['rootRequestId']
                    or subordinate.get('trustEnrollmentId') != derived_enrollment['trust']['enrollmentId']
                    or subordinate.get('configurationDigest') != derived_enrollment['configurationDigest']):
                raise SupervisorJournalCodecError('supervisor-journal-root-origin-mismatch')
            uuid_fields = ('rootRegistryId', 'contextJournalRegistryId', 'contextId',
                           'rootRequestId', 'trustEnrollmentId', 'logicalEnrollmentId',
                           'initialEpoch')
            digest_fields = ('configurationDigest', 'contextProjectionDigest',
                             'contextJournalEntryDigest', 'contextBirthMarkerDigest',
                             'approvalLedgerBirthDigest')
            path_fields = ('contextJournalPath', 'contextBirthMarkerPath',
                           'approvalLedgerPath', 'approvalLedgerLockPath')
            if (any(type(subordinate[name]) is not str or not _UUID.fullmatch(subordinate[name])
                    for name in uuid_fields)
                    or any(type(subordinate[name]) is not str or not _HEX.fullmatch(subordinate[name])
                           for name in digest_fields)
                    or any(type(subordinate[name]) is not str
                           or not subordinate[name].startswith('/')
                           or '\x00' in subordinate[name]
                           or any(part in ('.', '..') for part in subordinate[name].split('/'))
                           for name in path_fields)
                    or subordinate['approvalLedgerLockPath']
                        != subordinate['approvalLedgerPath'] + '.lock'):
                raise SupervisorJournalCodecError('supervisor-journal-root-origin-mismatch')
            subordinate_digest = _digest(subordinate)
    except SupervisorJournalCodecError:
        raise
    except root.GenerationAuthorityBootstrapError:
        raise SupervisorJournalCodecError('supervisor-journal-root-transition-invalid') from None
    if not _root_projection_matches(payload['next'], _root_projection(next_raw)):
        raise SupervisorJournalCodecError('supervisor-journal-root-origin-mismatch')
    return next_raw, derived_enrollment, subordinate_digest

class _Replay:
    __slots__ = ('birth_digest', 'owner_context_digest', 'pending_root_raw',
                 'profile', 'root_context', 'root_raw', 'supervisor_id')
    def __init__(self, supervisor_id: str, profile: str = JOURNAL_PROFILE_02, *,
                 owner_bootstrap_context_digest: str | None = None,
                 birth_digest: str | None = None,
                 root_replay_context: object | None = None):
        self.supervisor_id = _uuid(supervisor_id)
        self.profile = profile
        self.owner_context_digest = owner_bootstrap_context_digest
        self.birth_digest = birth_digest
        self.root_context = _validate_root_replay_context(root_replay_context)
        self.root_raw = (None if self.root_context is None else
                         self.root_context['initialBytes'])
        self.pending_root_raw = None
    def _replay(self, events: list[dict[str, Any]]) -> None:
        created = initdb = False
        launch_pending = False
        running = False
        stop_pending = False
        launch_number = 0
        creation: dict[str, Any] | None = None
        creation_finalized: dict[str, Any] | None = None
        initdb_receipt: dict[str, Any] | None = None
        current_launch: dict[str, Any] | None = None
        registration_done = authority_done = store_intent = store_done = False
        registration_request: dict[str, Any] | None = None
        registration_signature_verified = False
        principal_request: dict[str, Any] | None = None
        native_effects: dict[str, dict[str, Any]] = {}
        principal_stages: dict[str, dict[str, str | None]] = {}
        confirmed_process_start_token: str | None = None
        original_stores: dict[tuple[str, str], dict[str, Any]] = {}
        original_stores_by_reservation: dict[str, dict[str, Any]] = {}
        store_effects_by_reservation: dict[str, dict[str, Any]] = {}
        pending_original_store_effect: str | None = None
        pending_original_store_intent_digest: str | None = None
        root_observations: dict[str, dict[str, Any]] = {}
        root_pending: dict[str, Any] | None = None
        root_confirmations: dict[str, dict[str, Any]] = {}
        root_bindings: set[tuple[str, str, str]] = set()
        for event in events:
            kind = event['kind']
            payload = event['payload']
            if root_pending is not None and kind != 'generation-authority-root-mutation-confirmed':
                raise SupervisorJournalCodecError('supervisor-journal-root-order-invalid')
            if pending_original_store_effect is not None and kind != 'native-effect-intent':
                raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
            if kind == 'creation-intent':
                expected_creation = {'profile', 'supervisorId', 'clusterId', 'incarnationId', 'installationId',
                        'ownerUid', 'databaseName', 'businessOwner', 'maintenanceName',
                        'controllerName', 'controlDirectory', 'dataDirectory', 'postgresPath',
                        'postgresSha256', 'initdbPath', 'initdbSha256', 'port',
                        'configDigest', 'hbaDigest', 'purpose', 'requestDigest',
                        'approvalId', 'approvalDigest'}
                if self.profile == JOURNAL_PROFILE_02:
                    expected_creation |= {'supervisorJournalBirthDigest',
                                          'ownerBootstrapContextDigest'}
                if created or set(payload) != expected_creation:
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                if (payload['profile'] != ('umf.local-postgresql-create-request/0.2' if self.profile == JOURNAL_PROFILE_02 else 'umf.local-postgresql-create-request/0.1')
                        or payload['purpose'] not in ('production', 'native-acceptance')
                        or payload['supervisorId'] != self.supervisor_id
                        or not _HEX.fullmatch(payload['requestDigest'])
                        or not _HEX.fullmatch(payload['approvalDigest'])
                        or (self.profile == JOURNAL_PROFILE_02 and any(
                            not _HEX.fullmatch(payload[name]) for name in (
                                'supervisorJournalBirthDigest',
                                'ownerBootstrapContextDigest')))):
                    raise SupervisorJournalCodecError('supervisor-journal-origin-mismatch')
                if self.profile == JOURNAL_PROFILE_02 and (
                        payload['supervisorJournalBirthDigest'] != self.birth_digest
                        or payload['ownerBootstrapContextDigest'] != self.owner_context_digest
                        or self.birth_digest is None or self.owner_context_digest is None):
                    raise SupervisorJournalCodecError('supervisor-journal-origin-mismatch')
                created = True
                creation = payload
            elif kind == 'initdb-confirmed':
                if not created or initdb or set(payload) != {'clusterId', 'dataDevice',
                        'dataInode', 'ownerUid', 'initdbReceiptDigest'}:
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                initdb = True
                initdb_receipt = payload
            elif kind == 'launch-intent':
                if (not initdb or running or launch_pending
                        or payload.get('launchNumber') != launch_number + 1
                        or set(payload) != {
                        'launchId', 'launchNumber', 'argv', 'configDigest', 'hbaDigest',
                        'binarySha256', 'dataDevice', 'dataInode'}):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                assert creation is not None and initdb_receipt is not None
                control = creation['controlDirectory']
                expected_argv = [creation['postgresPath'], '-D', creation['dataDirectory'],
                                 '-c', f'config_file={control}/postgresql.conf',
                                 '-c', f'hba_file={control}/pg_hba.conf',
                                 '-c', f'ident_file={control}/pg_ident.conf']
                if (payload['argv'] != expected_argv
                        or payload['binarySha256'] != creation['postgresSha256']
                        or payload['configDigest'] != creation['configDigest']
                        or payload['hbaDigest'] != creation['hbaDigest']
                        or payload['dataDevice'] != initdb_receipt['dataDevice']
                        or payload['dataInode'] != initdb_receipt['dataInode']):
                    raise SupervisorJournalCodecError('supervisor-journal-origin-mismatch')
                launch_number += 1
                current_launch = payload
                launch_pending = True
            elif kind == 'launch-confirmed':
                if not launch_pending or running or set(payload) != {'launchId', 'process',
                        'nativeObservationDigest', 'endpointReceiptDigest'}:
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                assert current_launch is not None and creation is not None
                process = payload['process']
                if (type(process) is not dict or set(process) != {
                        'pid', 'pgid', 'uid', 'gid', 'startSec', 'startUsec',
                        'path', 'argv', 'startToken'}
                        or type(process['pid']) is not int or process['pid'] <= 0
                        or process['pgid'] != process['pid']
                        or process['uid'] != creation['ownerUid']
                        or process['path'] != creation['postgresPath']
                        or process['argv'] != current_launch['argv']
                        or type(process['startToken']) is not str
                        or not process['startToken']):
                    raise SupervisorJournalCodecError('supervisor-journal-origin-mismatch')
                if (not _HEX.fullmatch(payload['nativeObservationDigest'])
                        or not _HEX.fullmatch(payload['endpointReceiptDigest'])):
                    raise SupervisorJournalCodecError('supervisor-journal-corrupt')
                launch_pending = False
                running = True
                confirmed_process_start_token = process['startToken']
            elif kind == 'stop-intent':
                expected_start_token = (
                    confirmed_process_start_token
                    if self.profile == JOURNAL_PROFILE_02 else
                    next((e['payload']['process']['startToken'] for e in reversed(events[:-1])
                          if e['kind'] == 'launch-confirmed'), None))
                if (not running or stop_pending or current_launch is None
                        or set(payload) != {'launchId', 'processStartToken'}
                        or payload['launchId'] != current_launch['launchId']
                        or payload['processStartToken'] != expected_start_token):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                stop_pending = True
            elif kind == 'stop-confirmed':
                if not stop_pending or not running or set(payload) != {
                        'launchId', 'processGroupAbsent', 'controlDataDigest'}:
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                if payload['processGroupAbsent'] is not True:
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                if not _HEX.fullmatch(payload['controlDataDigest']):
                    raise SupervisorJournalCodecError('supervisor-journal-corrupt')
                running = False
                stop_pending = False
                if self.profile == JOURNAL_PROFILE_02:
                    confirmed_process_start_token = None
            elif kind == 'owner-registration-approved':
                if (not running or registration_done or registration_request is None
                        or not registration_signature_verified
                        or set(payload) != {'registrationId', 'payloadDigest',
                                            'approvalId', 'approvalDigest'}
                        or payload['registrationId'] != registration_request['registrationId']
                        or payload['approvalId'] != registration_request['approvalId']
                        or payload['approvalDigest'] != registration_request['approvalDigest']):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                registration_done = True
            elif kind == 'principal-request-prepared':
                if (not running or principal_request is not None
                        or set(payload) != {'preparationId', 'approvalId', 'intent', 'requestDigest'}
                        or type(payload['intent']) is not dict
                        or payload['intent'].get('profile')
                            != 'umf.local-postgresql-principal-preparation/0.1'
                        or payload['intent'].get('preparationId') != payload['preparationId']
                        or _uuid(payload['approvalId']) != payload['approvalId']
                        or _uuid(payload['preparationId']) != payload['preparationId']
                        or _digest(payload['intent']) != payload['requestDigest']):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                principal_request = payload
            elif kind == 'registration-request-prepared':
                if (not running or registration_request is not None
                        or set(payload) != {'registrationId', 'approvalId', 'intent', 'requestDigest'}
                        or type(payload['intent']) is not dict
                        or payload['intent'].get('profile')
                            != 'umf.owner-target-registration-intent/0.1'
                        or payload['intent'].get('registration', {}).get('registrationId')
                            != payload['registrationId']
                        or _uuid(payload['registrationId']) != payload['registrationId']
                        or _uuid(payload['approvalId']) != payload['approvalId']
                        or _digest(payload['intent']) != payload['requestDigest']):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                if self.profile == JOURNAL_PROFILE_02:
                    registration = payload['intent'].get('registration')
                    origin = registration.get('origin') if type(registration) is dict else None
                    if (not created or creation_finalized is None or type(origin) is not dict
                            or origin.get('supervisorId') != self.supervisor_id
                            or origin.get('clusterId') != creation['clusterId']
                            or origin.get('incarnationId') != creation['incarnationId']
                            or origin.get('creationReceiptDigest')
                                != creation_finalized['receiptDigest']
                            or registration.get('installationId') != creation['installationId']):
                        raise SupervisorJournalCodecError('supervisor-journal-origin-mismatch')
                registration_request = {
                    'registrationId': payload['registrationId'],
                    'approvalId': payload['approvalId'],
                    'requestDigest': payload['requestDigest'],
                    'intent': payload['intent'],
                }
            elif kind == 'registration-signature-verified':
                if (not running or registration_done or registration_request is None
                        or registration_signature_verified
                        or set(payload) != {'registrationId', 'requestDigest',
                                            'approvalId', 'approvalDigest'}
                        or payload['registrationId'] != registration_request['registrationId']
                        or payload['requestDigest'] != registration_request['requestDigest']
                        or not all(_HEX.fullmatch(payload[key]) for key in
                                   ('requestDigest', 'approvalDigest'))):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                _uuid(payload['registrationId']); _uuid(payload['approvalId'])
                registration_signature_verified = True
                if self.profile == JOURNAL_PROFILE_02:
                    registration_request['approvalDigest'] = payload['approvalDigest']
            elif kind == 'authority-preparation-approved':
                if (not running or authority_done or set(payload) != {'installationId', 'payloadDigest',
                                                    'approvalId', 'approvalDigest'}):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                authority_done = True
            elif kind == 'generation-authority-observed':
                keys = {'purpose', 'observationId', 'configurationDigest',
                        'nativeEvidenceDigest', 'nativeEvidence'}
                evidence = payload.get('nativeEvidence')
                if (not running or self.profile != JOURNAL_PROFILE_02
                        or self.root_context is None or set(payload) != keys
                        or payload['purpose'] != self.root_context['purpose']
                        or type(payload['observationId']) is not str
                        or not _UUID.fullmatch(payload['observationId'])
                        or any(type(payload[name]) is not str or not _HEX.fullmatch(payload[name])
                               for name in ('configurationDigest', 'nativeEvidenceDigest'))
                        or type(evidence) is not dict or set(evidence) != {'encoding', 'data'}
                        or evidence.get('encoding') != 'base64' or type(evidence.get('data')) is not str):
                    raise SupervisorJournalCodecError('supervisor-journal-root-observation-invalid')
                try:
                    evidence_bytes = base64.b64decode(evidence['data'], validate=True)
                except (ValueError, TypeError):
                    raise SupervisorJournalCodecError('supervisor-journal-root-observation-invalid') from None
                if (len(evidence_bytes) > 4 * 1024 * 1024
                        or base64.b64encode(evidence_bytes).decode('ascii') != evidence['data']
                        or hashlib.sha256(evidence_bytes).hexdigest()
                            != payload['nativeEvidenceDigest']):
                    raise SupervisorJournalCodecError('supervisor-journal-root-observation-invalid')
                _validate_native_evidence_bytes(evidence_bytes)
                root_observations[event['recordDigest']] = {
                    'purpose': payload['purpose'],
                    'configurationDigest': payload['configurationDigest'],
                    'nativeEvidenceDigest': payload['nativeEvidenceDigest'],
                    'observationId': payload['observationId'],
                }
            elif kind == 'generation-authority-root-mutation-intent':
                if self.profile != JOURNAL_PROFILE_02 or self.root_context is None or self.root_raw is None:
                    raise SupervisorJournalCodecError('supervisor-journal-root-context-invalid')
                observation = root_observations.get(payload.get('validationObservationEventDigest'))
                if (not running or observation is None
                        or observation['purpose'] != payload.get('purpose')
                        or observation['configurationDigest'] != payload.get('configurationDigest')):
                    raise SupervisorJournalCodecError('supervisor-journal-root-observation-invalid')
                next_root, enrollment, subordinate_digest = _apply_root_mutation(
                    payload, context=self.root_context, prior_raw=self.root_raw,
                    owner_context_digest=self.owner_context_digest or '')
                root_pending = {'payload': payload, 'intentEventDigest': event['recordDigest'],
                                'nextRaw': next_root, 'enrollment': enrollment,
                                'subordinateDigest': subordinate_digest}
                self.pending_root_raw = next_root
            elif kind == 'generation-authority-root-mutation-confirmed':
                if root_pending is None:
                    raise SupervisorJournalCodecError('supervisor-journal-root-order-invalid')
                intent = root_pending['payload']
                keys = {'purpose', 'mutationId', 'intentEventDigest', 'operation',
                        'registryId', 'rootRequestId', 'rootSequence', 'rootStateDigest',
                        'rootEnrollmentId', 'contextId', 'subordinateBirthDigest'}
                projection = _root_projection(root_pending['nextRaw'])
                confirmed_enrollment = root_pending['enrollment']
                expected_ids = ((None, None, None) if confirmed_enrollment is None else (
                    confirmed_enrollment['enrollmentId'], confirmed_enrollment['contextId'],
                    root_pending['subordinateDigest']))
                if (set(payload) != keys or payload['purpose'] != intent['purpose']
                        or payload['mutationId'] != intent['mutationId']
                        or payload['intentEventDigest'] != root_pending['intentEventDigest']
                        or payload['operation'] != intent['operation']
                        or payload['registryId'] != intent['registryId']
                        or payload['rootRequestId'] != intent['rootRequestId']
                        or type(payload['rootSequence']) is not int
                        or payload['rootSequence'] != projection['sequence']
                        or payload['rootStateDigest'] != projection['digest']
                        or (payload['rootEnrollmentId'], payload['contextId'],
                            payload['subordinateBirthDigest']) != expected_ids):
                    raise SupervisorJournalCodecError('supervisor-journal-root-origin-mismatch')
                self.root_raw = root_pending['nextRaw']
                self.pending_root_raw = None
                root_confirmations[intent['rootRequestId']] = {
                    'eventDigest': event['recordDigest'],
                    'intent': intent, 'enrollment': confirmed_enrollment,
                    'subordinateDigest': root_pending['subordinateDigest'],
                }
                root_pending = None
            elif kind == 'generation-authority-bound':
                keys = {'purpose', 'registryId', 'rootEnrollmentId', 'contextId',
                        'rootEntryDigest', 'configurationDigest', 'confirmEventDigest',
                        'subordinateBirthDigest', 'targetCustodyDigest',
                        'storeCreationReceiptDigest', 'nativeEvidenceDigest',
                        'observationEventDigest'}
                context = self.root_context
                observation = root_observations.get(payload.get('observationEventDigest'))
                confirmation = next((value for value in root_confirmations.values()
                                     if value['eventDigest'] == payload.get('confirmEventDigest')),
                                    None)
                if self.root_raw is None or context is None:
                    raise SupervisorJournalCodecError('supervisor-journal-root-context-invalid')
                from umf_access.lifecycle import generation_authority_bootstrap as root
                registry = root._parse(self.root_raw)
                matches = [entry for entry in registry['enrollments']
                           if entry['enrollmentId'] == payload.get('rootEnrollmentId')
                           and entry['contextId'] == payload.get('contextId')]
                if (not running or set(payload) != keys or len(matches) != 1
                        or confirmation is None or confirmation['enrollment'] != matches[0]
                        or payload['purpose'] != context['purpose']
                        or payload['registryId'] != context['registryId']
                        or payload['rootEntryDigest'] != _digest(matches[0])
                        or payload['configurationDigest'] != matches[0]['configurationDigest']
                        or payload['subordinateBirthDigest'] != confirmation['subordinateDigest']
                        or payload['targetCustodyDigest'] != matches[0]['trust']['targetCustodyDigest']
                        or payload['storeCreationReceiptDigest'] != matches[0]['trust']['storeCreationReceiptDigest']
                        or payload['nativeEvidenceDigest'] != matches[0]['nativeEvidenceDigest']
                        or observation is None
                        or observation['configurationDigest'] != payload['configurationDigest']
                        or observation['purpose'] != payload['purpose']):
                    raise SupervisorJournalCodecError('supervisor-journal-root-origin-mismatch')
                binding_key = (payload['registryId'], payload['rootEnrollmentId'], payload['contextId'])
                if binding_key in root_bindings:
                    raise SupervisorJournalCodecError('supervisor-journal-root-order-invalid')
                root_bindings.add(binding_key)
            elif kind == 'store-creation-intent':
                if (self.profile == JOURNAL_PROFILE_02 or not running or not registration_done or not authority_done or store_intent
                        or set(payload) != {'storeId', 'payloadDigest', 'schemaName'}):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                store_intent = True
            elif kind == 'store-creation-confirmed':
                if (self.profile == JOURNAL_PROFILE_02 or not running or not store_intent or store_done or set(payload) != {'storeId', 'schemaOid',
                                                    'nativeReceiptDigest'}):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                store_done = True
            elif kind == 'originals-store-creation-intent':
                keys = {'purpose', 'reservation', 'reservationDigest',
                        'custodianReservedEventDigest', 'creationRequestDigest',
                        'creationApprovalDigest', 'nativeAuthorityEvidenceDigest'}
                reservation = payload.get('reservation')
                reservation_keys = {'profile', 'reservationId', 'providerId',
                                    'installationId', 'targetCustody', 'store',
                                    'creationRequestDigest', 'creationApprovalDigest',
                                    'nativeAuthorityEvidenceDigest', 'configurationDigest',
                                    'custodySequence'}
                if (self.profile != JOURNAL_PROFILE_02 or not running
                        or not registration_done or not authority_done
                        or creation_finalized is None
                        or pending_original_store_effect is not None
                        or any(item.get('nativeEffectOutcome') != 'confirmed'
                               for item in original_stores.values())
                        or set(payload) != keys or type(reservation) is not dict
                        or set(reservation) != reservation_keys
                        or reservation['profile'] != 'umf.row-originals-store-reservation/0.1'
                        or payload['purpose'] not in ('production', 'native-acceptance')
                        or type(payload['custodianReservedEventDigest']) is not str
                        or not _HEX.fullmatch(payload['custodianReservedEventDigest'])
                        or payload['reservationDigest'] != _digest(reservation)
                        or payload['creationRequestDigest']
                            != reservation['creationRequestDigest']
                        or payload['creationApprovalDigest']
                            != reservation['creationApprovalDigest']
                        or payload['nativeAuthorityEvidenceDigest']
                            != reservation['nativeAuthorityEvidenceDigest']
                        or type(reservation['reservationId']) is not str
                        or not _UUID.fullmatch(reservation['reservationId'])
                        or any(type(reservation[name]) is not str or not _HEX.fullmatch(
                            reservation[name]) for name in ('creationRequestDigest',
                            'creationApprovalDigest', 'nativeAuthorityEvidenceDigest',
                            'configurationDigest'))
                        or type(reservation['providerId']) is not str
                        or not _UUID.fullmatch(reservation['providerId'])
                        or reservation['installationId'] != creation['installationId']
                        or type(reservation['targetCustody']) is not dict
                        or set(reservation['targetCustody']) != {
                            'profile', 'custodianId', 'registrationId', 'resourceId',
                            'incarnation', 'registrationDigest'}
                        or reservation['targetCustody'].get('profile')
                            != 'umf.native-target-custody/0.1'
                        or type(reservation['store']) is not dict
                        or set(reservation['store']) != {'profile', 'storeId', 'schemaName'}
                        or type(reservation['custodySequence']) is not int
                        or reservation['custodySequence'] < 1):
                    raise SupervisorJournalCodecError('supervisor-journal-origin-mismatch')
                registration = (registration_request['intent'].get('registration')
                                if registration_request is not None else None)
                origin = registration.get('origin') if type(registration) is dict else None
                custody = reservation['targetCustody']
                store = reservation['store']
                schema_prefixes = {
                    'umf.native-row-originals-store/0.1': 'umf_originals_',
                }
                if (type(registration) is not dict or type(origin) is not dict
                        or custody.get('custodianId') != registration.get('custodianId')
                        or custody.get('registrationId') != registration.get('registrationId')
                        or custody.get('resourceId') != origin.get('clusterId')
                        or custody.get('incarnation') != origin.get('incarnationId')
                        or custody.get('registrationDigest') != _digest(registration)
                        or reservation['providerId'] != registration.get('providerId')
                        or reservation['installationId'] != registration.get('installationId')
                        or any(type(custody.get(name)) is not str
                               or not _UUID.fullmatch(custody[name])
                               for name in ('custodianId', 'registrationId',
                                            'resourceId', 'incarnation'))
                        or type(custody.get('registrationDigest')) is not str
                        or not _HEX.fullmatch(custody['registrationDigest'])
                        or custody.get('profile') != 'umf.native-target-custody/0.1'
                        or store.get('profile') not in schema_prefixes
                        or store.get('storeId') != reservation['providerId']
                        or store.get('schemaName') != schema_prefixes.get(store.get('profile'), '')
                            + reservation['providerId'].replace('-', '')):
                    raise SupervisorJournalCodecError('supervisor-journal-origin-mismatch')
                custody = reservation['targetCustody']
                store_key = (custody['registrationId'], reservation['providerId'],
                             reservation['installationId'], store['profile'],
                             store['storeId'], store['schemaName'])
                reservation_id = reservation['reservationId']
                if (store_key in original_stores
                        or reservation_id in original_stores_by_reservation):
                    raise SupervisorJournalCodecError('supervisor-journal-origin-mismatch')
                original_store = {
                    'purpose': payload['purpose'], 'reservation': reservation,
                    'reservationDigest': payload['reservationDigest'],
                    'custodianReservedEventDigest': payload['custodianReservedEventDigest'],
                    'creationRequestDigest': payload['creationRequestDigest'],
                    'creationApprovalDigest': payload['creationApprovalDigest'],
                    'nativeAuthorityEvidenceDigest': payload['nativeAuthorityEvidenceDigest'],
                    'creationIntentDigest': event['recordDigest'],
                    'supervisorIntentDigest': None, 'confirmed': False,
                }
                original_stores[store_key] = original_store
                original_stores_by_reservation[reservation_id] = original_store
                pending_original_store_effect = payload['reservationDigest']
                pending_original_store_intent_digest = event['recordDigest']
            elif kind == 'originals-store-creation-confirmed':
                keys = {'purpose', 'reservationDigest', 'supervisorIntentDigest',
                        'custodianConfirmationDigest', 'nativeReceiptDigest', 'schemaOid'}
                original_store = next((item for item in original_stores.values()
                                       if item['reservationDigest']
                                       == payload.get('reservationDigest')), None)
                if (self.profile != JOURNAL_PROFILE_02 or not running
                        or original_store is None or original_store['confirmed']
                        or set(payload) != keys
                        or payload['purpose'] != original_store['purpose']
                        or payload['supervisorIntentDigest'] != original_store['supervisorIntentDigest']
                        or type(payload['custodianConfirmationDigest']) is not str
                        or not _HEX.fullmatch(payload['custodianConfirmationDigest'])
                        or type(payload['nativeReceiptDigest']) is not str
                        or not _HEX.fullmatch(payload['nativeReceiptDigest'])
                        or type(payload['schemaOid']) is not int
                        or not 1 <= payload['schemaOid'] <= 4_294_967_295):
                    raise SupervisorJournalCodecError('supervisor-journal-origin-mismatch')
                original_store.update({'custodianConfirmationDigest': payload['custodianConfirmationDigest'],
                                       'nativeReceiptDigest': payload['nativeReceiptDigest'],
                                       'schemaOid': payload['schemaOid'], 'confirmed': True})
            elif kind == 'native-effect-intent':
                required = {'reservationId', 'scope', 'effectKey', 'purpose',
                            'requestId', 'requestDigest', 'approvalId',
                            'approvalDigest', 'stage', 'payloadDigest'}
                if ((not running and payload['scope'] != 'local-target-creation')
                        or set(payload) != required
                        or type(payload['reservationId']) is not str
                        or not _HEX.fullmatch(payload['requestDigest'])
                        or not _HEX.fullmatch(payload['approvalDigest'])
                        or not _HEX.fullmatch(payload['payloadDigest'])
                        or type(payload['effectKey']) is not list
                        or not payload['effectKey']
                        or any(type(part) is not str or not part for part in payload['effectKey'])
                        or payload['purpose'] not in ('production', 'native-acceptance')
                        or payload['scope'] not in {
                            'local-target-creation', 'native-principal-preparation',
                            'local-target-registration', 'native-store-creation',
                            'disabled-epoch-provision', 'generation-ingress-transition'}
                        or payload['reservationId'] in native_effects):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                if self.profile == JOURNAL_PROFILE_02 and pending_original_store_effect is not None:
                    store_state = next((item for item in original_stores.values()
                                        if item['reservationDigest']
                                        == pending_original_store_effect), None)
                    if (store_state is None
                            or payload['scope'] != 'native-store-creation'
                            or event['previousDigest'] != pending_original_store_intent_digest
                            or payload['purpose'] != store_state['purpose']
                            or payload['effectKey'] != [
                                'native-store-creation',
                                store_state['reservation']['providerId'],
                                store_state['reservation']['store']['profile'],
                                store_state['reservation']['store']['storeId']]
                            or payload['requestDigest'] != store_state['reservation']['creationRequestDigest']
                            or payload['approvalDigest'] != store_state['reservation']['creationApprovalDigest']):
                        raise SupervisorJournalCodecError('supervisor-journal-origin-mismatch')
                    store_state['supervisorIntentDigest'] = event['recordDigest']
                    store_state['nativeEffectReservationId'] = payload['reservationId']
                    store_effects_by_reservation[payload['reservationId']] = store_state
                    pending_original_store_effect = None
                    pending_original_store_intent_digest = None
                elif (self.profile == JOURNAL_PROFILE_02
                      and payload['scope'] == 'native-store-creation'):
                    # Journal 0.2 has no ingress event family; a generic store
                    # effect must have its exact typed ORIGINALS parent.
                    raise SupervisorJournalCodecError(
                        'supervisor-journal-origin-mismatch')
                elif (self.profile == JOURNAL_PROFILE_02
                      and any(not item['confirmed'] for item in original_stores.values())):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                if (payload['scope'] == 'native-principal-preparation'
                        and (principal_request is None
                             or principal_request['requestDigest'] != payload['requestDigest'])):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                if (payload['scope'] == 'local-target-registration'
                        and (registration_request is None
                             or not registration_signature_verified
                             or registration_request['requestDigest'] != payload['requestDigest'])):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                native_effects[payload['reservationId']] = {
                    'intent': payload, 'outcome': None,
                }
                if payload['scope'] == 'native-principal-preparation':
                    principal_stages[payload['reservationId']] = {
                        'roles': None, 'database': None,
                    }
            elif kind == 'principal-roles-intent':
                reservation_id = payload.get('reservationId') if type(payload) is dict else None
                stages = principal_stages.get(reservation_id)
                if (not running or stages is None or stages['roles'] is not None
                        or set(payload) != {'reservationId', 'preparationId'}
                        or type(payload['preparationId']) is not str):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                stages['roles'] = 'pending:' + payload['preparationId']
            elif kind == 'principal-roles-confirmed':
                reservation_id = payload.get('reservationId') if type(payload) is dict else None
                stages = principal_stages.get(reservation_id)
                if (not running or stages is None or stages['roles'] is None
                        or stages['roles'].startswith('confirmed:')
                        or set(payload) != {'reservationId', 'observationDigest'}
                        or not _HEX.fullmatch(payload['observationDigest'])):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                stages['roles'] = 'confirmed:' + payload['observationDigest']
            elif kind == 'principal-database-intent':
                reservation_id = payload.get('reservationId') if type(payload) is dict else None
                stages = principal_stages.get(reservation_id)
                if (not running or stages is None or stages['roles'] is None
                        or not stages['roles'].startswith('confirmed:')
                        or stages['database'] is not None
                        or set(payload) != {'reservationId', 'databaseName'}
                        or type(payload['databaseName']) is not str):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                stages['database'] = 'pending:' + payload['databaseName']
            elif kind == 'principal-database-confirmed':
                reservation_id = payload.get('reservationId') if type(payload) is dict else None
                stages = principal_stages.get(reservation_id)
                if (not running or stages is None or stages['database'] is None
                        or stages['database'].startswith('confirmed:')
                        or set(payload) != {'reservationId', 'databaseOid',
                                             'systemIdentifier'}
                        or type(payload['databaseOid']) is not int
                        or payload['databaseOid'] <= 0
                        or type(payload['systemIdentifier']) is not str):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                stages['database'] = ('confirmed:' + str(payload['databaseOid']) + ':'
                                      + payload['systemIdentifier'])
            elif kind in ('native-effect-confirmed', 'native-effect-aborted'):
                reservation_id = payload.get('reservationId')
                scope = (native_effects.get(reservation_id, {})
                         .get('intent', {}).get('scope'))
                if ((not running and scope != 'local-target-creation')
                        or set(payload) != {'reservationId', 'receiptDigest'}
                        or payload['reservationId'] not in native_effects
                        or native_effects[payload['reservationId']]['outcome'] is not None
                        or not _HEX.fullmatch(payload['receiptDigest'])):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                if scope == 'native-principal-preparation':
                    stages = principal_stages[payload['reservationId']]
                    if (stages['roles'] is None or not stages['roles'].startswith('confirmed:')
                            or stages['database'] is None
                            or not stages['database'].startswith('confirmed:')):
                        raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                if (self.profile == JOURNAL_PROFILE_02
                        and scope == 'native-store-creation'
                        and (kind != 'native-effect-confirmed'
                             or reservation_id not in store_effects_by_reservation
                             or not store_effects_by_reservation[reservation_id]['confirmed']
                             or payload['receiptDigest'] != store_effects_by_reservation[
                                 reservation_id]['nativeReceiptDigest'])):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                if self.profile == JOURNAL_PROFILE_02 and scope == 'native-store-creation':
                    store_effects_by_reservation[reservation_id][
                        'nativeEffectOutcome'] = 'confirmed'
                native_effects[payload['reservationId']]['outcome'] = (
                    'confirmed' if kind == 'native-effect-confirmed' else 'known-aborted',
                    payload['receiptDigest'])
            elif kind == 'creation-finalized':
                if (not running or not created or not initdb
                        or (self.profile == JOURNAL_PROFILE_02
                            and creation_finalized is not None)
                        or set(payload) != {'receipt', 'receiptDigest'}
                        or type(payload['receipt']) is not dict
                        or _digest(payload['receipt']) != payload['receiptDigest']
                        or not _HEX.fullmatch(payload['receiptDigest'])):
                    raise SupervisorJournalCodecError('supervisor-journal-order-invalid')
                receipt = payload['receipt']
                if (set(receipt) != {'profile', 'supervisorId', 'clusterId',
                        'incarnationId', 'creationRequestDigest',
                        'creationApprovalDigest', 'initdbReceiptDigest',
                        'initialLaunchReceiptDigest',
                        'principalPreparationRequestDigest',
                        'principalPreparationApprovalDigest',
                        'principalPreparationReceiptDigest', 'applicationDatabase'}
                        or receipt['profile'] != 'umf.local-supervisor-creation-receipt/0.1'
                        or receipt['supervisorId'] != self.supervisor_id
                        or not all(_HEX.fullmatch(receipt[key]) for key in (
                            'creationRequestDigest', 'creationApprovalDigest',
                            'initdbReceiptDigest', 'initialLaunchReceiptDigest',
                            'principalPreparationRequestDigest',
                            'principalPreparationApprovalDigest',
                            'principalPreparationReceiptDigest'))):
                    raise SupervisorJournalCodecError('supervisor-journal-origin-mismatch')
                if self.profile == JOURNAL_PROFILE_02:
                    assert creation is not None and initdb_receipt is not None
                    if (receipt['clusterId'] != creation['clusterId']
                            or receipt['incarnationId'] != creation['incarnationId']
                            or receipt['creationRequestDigest'] != creation['requestDigest']
                            or receipt['creationApprovalDigest'] != creation['approvalDigest']
                            or receipt['initdbReceiptDigest'] != initdb_receipt['initdbReceiptDigest']):
                        raise SupervisorJournalCodecError('supervisor-journal-origin-mismatch')
                    creation_finalized = payload
            else:
                raise SupervisorJournalCodecError('supervisor-journal-corrupt')


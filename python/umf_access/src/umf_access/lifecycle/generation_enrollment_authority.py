# SPDX-License-Identifier: MIT OR Apache-2.0
"""Separate signed authority for existing-head initial generation enrollment.

This module owns only the logical two-scope approval domain.  It does not
create PostgreSQL roles, epochs, fences, or public generation capabilities.
Those effects require the original native provider and its independently
qualified issuer.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import uuid
from pathlib import Path
from typing import Any

from ..canonical import canonical_json

AUTHORITY_PROFILE = 'umf.configured-generation-enrollment-authority/0.1'
CONFIG_PROFILE = AUTHORITY_PROFILE
SOURCE_POLICY_PROFILE = 'umf.existing-head-enrollment-policy/0.1'
TRUST_PROFILE = 'umf.generation-authority-trust-enrollment/0.1'
CONTEXT_PROFILE = 'umf.generation-authority-context/0.1'
APPROVAL_PROFILE = 'umf.initial-generation-enrollment-approval/0.1'
LEDGER_PROFILE = 'umf.initial-generation-enrollment-ledger/0.1'
PREPARE_INTENT_PROFILE = 'umf.initial-generation-enrollment-prepare/0.1'
ACTIVATE_INTENT_PROFILE = 'umf.initial-generation-enrollment-activate/0.1'
PREPARE_SCOPE = 'prepare-initial-enrollment'
ACTIVATE_SCOPE = 'activate-initial-enrollment'
SCOPES = (PREPARE_SCOPE, ACTIVATE_SCOPE)
PURPOSES = ('production', 'native-acceptance')
SIGNING_DOMAIN = b'umf.initial-generation-enrollment-approval/0.1\x00'

_UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
_HEX = re.compile(r'^[a-f0-9]{64}$')
_B64URL = re.compile(r'^[A-Za-z0-9_-]+$')
_MAX_CONFIG = 1_048_576
_MAX_REQUEST = 1_048_576
_MAX_LEDGER = 8 * 1024 * 1024
_MAX_RECORDS = 4096
_MAX_SAFE_INT = 9_007_199_254_740_991
_ROLE_FLAGS = ('canLogin', 'superuser', 'createDatabase', 'createRole',
               'replication', 'bypassRls', 'inherit')
_EVENT_KINDS = {'identity-allocated', 'request-prepared', 'approval-verified',
                'effect-reserved', 'effect-settled'}
_CONTEXT_EVENT_KINDS = {'context-birth-intent', 'context-birth-confirmed'}
_CONTEXT_REGISTRY_PROFILE = 'umf.generation-authority-context-registry/0.2'
_REQUEST_SEAL = object()
_APPROVAL_SEAL = object()
_RESERVATION_SEAL = object()
_OUTCOME_SEAL = object()


class _ImmutableOpaque:
    __slots__ = ()

    def __setattr__(self, name: str, value: object) -> None:
        if hasattr(self, name):
            raise AttributeError('opaque authority values are immutable')
        object.__setattr__(self, name, value)

    def __delattr__(self, name: str) -> None:
        raise AttributeError('opaque authority values are immutable')


def _fail(code: str) -> None:
    raise GenerationEnrollmentAuthorityError(code)


def _closed(value: object, keys: set[str], code: str = 'generation-authority-invalid') -> dict[str, Any]:
    if type(value) is not dict or set(value) != keys or any(type(key) is not str for key in value):
        _fail(code)
    return value


def _text(value: object, limit: int = 256) -> str:
    if type(value) is not str or not value or '\x00' in value:
        _fail('generation-authority-invalid')
    try:
        if len(value.encode('utf-8')) > limit:
            _fail('generation-authority-invalid')
    except UnicodeEncodeError:
        _fail('generation-authority-invalid')
    return value


def _uuid(value: object) -> str:
    if type(value) is not str or not _UUID.fullmatch(value):
        _fail('generation-authority-invalid')
    try:
        if str(uuid.UUID(value)) != value:
            _fail('generation-authority-invalid')
    except ValueError:
        _fail('generation-authority-invalid')
    return value


def _digest(value: object) -> str:
    if type(value) is not str or not _HEX.fullmatch(value):
        _fail('generation-authority-invalid')
    return value


def _uint(value: object, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        _fail('generation-authority-invalid')
    return value


def _json_copy(value: object, *, depth: int = 0, count: list[int] | None = None) -> object:
    if count is None:
        count = [0]
    count[0] += 1
    if count[0] > 100_000 or depth > 48:
        _fail('generation-authority-capacity')
    if value is None or type(value) is bool:
        return value
    if type(value) is int:
        if abs(value) > _MAX_SAFE_INT:
            _fail('generation-authority-invalid')
        return value
    if type(value) is str:
        _text(value, _MAX_REQUEST)
        return value
    if type(value) is list:
        if len(value) > 4096:
            _fail('generation-authority-capacity')
        return [_json_copy(item, depth=depth + 1, count=count) for item in value]
    if type(value) is dict:
        if len(value) > 128 or any(type(key) is not str or not key.isascii() for key in value):
            _fail('generation-authority-invalid')
        return {key: _json_copy(item, depth=depth + 1, count=count)
                for key, item in value.items()}
    _fail('generation-authority-invalid')


def _canonical(value: object) -> bytes:
    try:
        copied = _json_copy(value)
        encoded = canonical_json(copied).encode('utf-8')
    except GenerationEnrollmentAuthorityError:
        raise
    except (TypeError, ValueError, UnicodeError, RecursionError):
        _fail('generation-authority-invalid')
    if len(encoded) > _MAX_REQUEST:
        _fail('generation-authority-capacity')
    return encoded


def _parse_canonical(data: object, *, maximum: int = _MAX_REQUEST) -> dict[str, Any]:
    if type(data) is not bytes or not 1 <= len(data) <= maximum:
        _fail('generation-authority-capacity')

    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        parsed: dict[str, Any] = {}
        for key, value in items:
            if key in parsed:
                _fail('generation-authority-invalid')
            parsed[key] = value
        return parsed

    try:
        value = json.loads(data.decode('utf-8'), object_pairs_hook=pairs,
                           parse_float=lambda _v: _fail('generation-authority-invalid'),
                           parse_constant=lambda _v: _fail('generation-authority-invalid'))
    except GenerationEnrollmentAuthorityError:
        raise
    except (UnicodeError, ValueError, RecursionError):
        _fail('generation-authority-invalid')
    copied = _json_copy(value)
    if type(copied) is not dict or _canonical(copied) != data:
        _fail('generation-authority-noncanonical')
    return copied


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _b64decode(value: object, size: int) -> bytes:
    if type(value) is not str or not _B64URL.fullmatch(value):
        _fail('generation-authority-signature-invalid')
    try:
        raw = base64.urlsafe_b64decode(value + '=' * ((4 - len(value) % 4) % 4))
    except (ValueError, TypeError):
        _fail('generation-authority-signature-invalid')
    if len(raw) != size or base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=') != value:
        _fail('generation-authority-signature-invalid')
    return raw


def _target_custody(value: object) -> dict[str, Any]:
    target = _closed(value, {'profile', 'custodianId', 'registrationId', 'resourceId',
                             'incarnation', 'registrationDigest'})
    if target['profile'] != 'umf.native-target-custody/0.1':
        _fail('generation-authority-target-invalid')
    for key in ('custodianId', 'registrationId', 'resourceId', 'incarnation'):
        _uuid(target[key])
    _digest(target['registrationDigest'])
    return target


def _name(value: object) -> str:
    # Native role identifiers may be quoted UTF-8 names; preserve their
    # semantics while enforcing PostgreSQL's established 63-byte bound.
    return _text(value, 63)


def _flags(value: object) -> dict[str, bool]:
    flags = _closed(value, set(_ROLE_FLAGS))
    if any(type(flags[key]) is not bool for key in _ROLE_FLAGS):
        _fail('generation-authority-invalid')
    return flags


def _membership_list(value: object) -> list[dict[str, Any]]:
    if type(value) is not list or len(value) > 1024:
        _fail('generation-authority-invalid')
    result = []
    seen_oids: set[int] = set()
    seen_names: set[str] = set()
    for entry in value:
        item = _closed(entry, {'roleOid', 'roleName', 'inherit', 'set', 'admin'})
        oid = _uint(item['roleOid'], 1, 4_294_967_295)
        name = _name(item['roleName'])
        if oid in seen_oids or name in seen_names:
            _fail('generation-authority-invalid')
        if any(type(item[key]) is not bool for key in ('inherit', 'set', 'admin')):
            _fail('generation-authority-invalid')
        seen_oids.add(oid); seen_names.add(name)
        result.append({'roleOid': oid, 'roleName': name,
                       'inherit': item['inherit'], 'set': item['set'], 'admin': item['admin']})
    return result


def _config(value: object) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    config = _closed(value, {'profile', 'authorityId', 'policyRevision', 'purpose',
                             'supervisorId', 'custodianId', 'providerId', 'installationId',
                             'targetCustody', 'storeId', 'sourcePolicy', 'keys'})
    if config['profile'] != CONFIG_PROFILE or config['purpose'] not in PURPOSES:
        _fail('generation-authority-configuration-invalid')
    _uuid(config['authorityId']); _uuid(config['supervisorId']); _uuid(config['custodianId'])
    _uuid(config['providerId']); _text(config['installationId'], 256)
    _text(config['policyRevision'], 128)
    target = _target_custody(config['targetCustody'])
    if target['custodianId'] != config['custodianId'] or config['storeId'] != config['providerId']:
        _fail('generation-authority-configuration-invalid')
    policy = _closed(config['sourcePolicy'], {'profile', 'approvedCohorts', 'approvedSubjects',
                                               'issuerProfile', 'maximumSubjects',
                                               'allowLegacyLoginConversion'})
    if (policy['profile'] != SOURCE_POLICY_PROFILE
            or policy['allowLegacyLoginConversion'] is not True):
        _fail('generation-authority-configuration-invalid')
    maximum_subjects = _uint(policy['maximumSubjects'], 1, 256)
    _text(policy['issuerProfile'], 256)
    cohorts = policy['approvedCohorts']
    if type(cohorts) is not list or not 1 <= len(cohorts) <= 256:
        _fail('generation-authority-configuration-invalid')
    cohort_seen: set[bytes] = set()
    normalized_cohorts = []
    for cohort in cohorts:
        item = _closed(cohort, {'sourceDigest', 'bundleDigest', 'sourceCohortDigest',
                                'executionPolicyDigest'})
        for key in ('sourceDigest', 'bundleDigest', 'sourceCohortDigest', 'executionPolicyDigest'):
            _digest(item[key])
        encoded = _canonical(item)
        if encoded in cohort_seen:
            _fail('generation-authority-configuration-invalid')
        cohort_seen.add(encoded); normalized_cohorts.append(item)
    subjects = policy['approvedSubjects']
    if type(subjects) is not list or not 1 <= len(subjects) <= maximum_subjects:
        _fail('generation-authority-configuration-invalid')
    normalized_subjects = []
    seen_subjects: set[tuple[int, str]] = set()
    seen_subject_oids: set[int] = set()
    seen_subject_names: set[str] = set()
    for subject in subjects:
        item = _closed(subject, {'subject', 'audience', 'ownershipReceiptDigest',
                                'membershipsDigest', 'flagsDigest'})
        ref = _closed(item['subject'], {'oid', 'name'})
        oid = _uint(ref['oid'], 1, 4_294_967_295); name = _name(ref['name'])
        if ((oid, name) in seen_subjects or oid in seen_subject_oids
                or name in seen_subject_names or item['audience'] not in ('person', 'batch')):
            _fail('generation-authority-configuration-invalid')
        seen_subjects.add((oid, name)); seen_subject_oids.add(oid); seen_subject_names.add(name)
        for key in ('ownershipReceiptDigest', 'membershipsDigest', 'flagsDigest'):
            _digest(item[key])
        normalized_subjects.append({'subject': {'oid': oid, 'name': name},
                                    'audience': item['audience'],
                                    'ownershipReceiptDigest': item['ownershipReceiptDigest'],
                                    'membershipsDigest': item['membershipsDigest'],
                                    'flagsDigest': item['flagsDigest']})
    if len(normalized_subjects) > maximum_subjects:
        _fail('generation-authority-configuration-invalid')
    keys = config['keys']
    if type(keys) is not list or not 1 <= len(keys) <= 32:
        _fail('generation-authority-configuration-invalid')
    keys_by_id: dict[str, dict[str, Any]] = {}
    scope_order = {scope: index for index, scope in enumerate(SCOPES)}
    for key in keys:
        item = _closed(key, {'keyId', 'publicKey', 'principalId', 'scopes'})
        key_id = _text(item['keyId'], 128); _text(item['principalId'], 128)
        public = _b64decode(item['publicKey'], 32)
        scopes = item['scopes']
        if (type(scopes) is not list or not scopes or len(scopes) > 2
                or any(type(s) is not str or s not in SCOPES for s in scopes)
                or len(set(scopes)) != len(scopes)
                or scopes != sorted(scopes, key=scope_order.__getitem__)):
            _fail('generation-authority-configuration-invalid')
        if key_id in keys_by_id:
            _fail('generation-authority-configuration-invalid')
        keys_by_id[key_id] = {'keyId': key_id, 'publicKeyBytes': public,
                              'principalId': item['principalId'], 'scopes': tuple(scopes)}
    normalized = _json_copy(config)
    if len(_canonical(normalized)) > _MAX_CONFIG:
        _fail('generation-authority-capacity')
    # Force full bounded validation while retaining the original exact config.
    return normalized, keys_by_id


def _validate_subjects(value: object, policy: dict[str, Any]) -> list[dict[str, Any]]:
    if type(value) is not list or not 1 <= len(value) <= policy['maximumSubjects']:
        _fail('generation-authority-intent-invalid')
    approved = policy['approvedSubjects']
    if len(value) != len(approved):
        _fail('generation-authority-subject-coverage-mismatch')
    seen_oid: set[int] = set(); seen_name: set[str] = set(); all_names: set[str] = set()
    result = []
    edge_count = 0
    for index, raw in enumerate(value):
        item = _closed(raw, {'subject', 'audience', 'observedFlags', 'memberships',
                             'ownershipReceiptDigest', 'newLoginName'},
                       'generation-authority-intent-invalid')
        sub = _closed(item['subject'], {'oid', 'name'}, 'generation-authority-intent-invalid')
        oid = _uint(sub['oid'], 1, 4_294_967_295); name = _name(sub['name'])
        if oid in seen_oid or name in seen_name:
            _fail('generation-authority-intent-invalid')
        seen_oid.add(oid); seen_name.add(name); all_names.add(name)
        if item['audience'] not in ('person', 'batch'):
            _fail('generation-authority-intent-invalid')
        flags = _flags(item['observedFlags'])
        if not flags['canLogin'] or any(flags[k] for k in _ROLE_FLAGS if k not in ('canLogin', 'inherit')):
            _fail('generation-authority-subject-flags-mismatch')
        memberships = _membership_list(item['memberships'])
        edge_count += len(memberships)
        if edge_count > 1024:
            _fail('generation-authority-capacity')
        ownership = _digest(item['ownershipReceiptDigest'])
        new_login = _name(item['newLoginName'])
        if new_login in all_names or new_login in {r['newLoginName'] for r in result}:
            _fail('generation-authority-intent-invalid')
        expected = approved[index]
        subject_ref = {'oid': oid, 'name': name}
        if (expected['subject'] != subject_ref or expected['audience'] != item['audience']
                or expected['ownershipReceiptDigest'] != ownership
                or expected['membershipsDigest'] != _sha(_canonical(memberships))
                or expected['flagsDigest'] != _sha(_canonical(flags))):
            _fail('generation-authority-subject-coverage-mismatch')
        result.append({'subject': subject_ref, 'audience': item['audience'],
                       'observedFlags': flags, 'memberships': memberships,
                       'ownershipReceiptDigest': ownership, 'newLoginName': new_login})
    if all_names.intersection(r['newLoginName'] for r in result):
        _fail('generation-authority-intent-invalid')
    return result


def _validate_principals(value: object, prepared: dict[str, Any]) -> list[dict[str, Any]]:
    if type(value) is not list or len(value) != len(prepared['subjects']):
        _fail('generation-authority-intent-invalid')
    result = []
    seen_login: set[int] = set(); seen_subject: set[int] = set()
    for i, raw in enumerate(value):
        item = _closed(raw, {'login', 'subject', 'audience', 'issuerProfile',
                             'issuerReceiptDigest', 'ownershipReceiptDigest', 'memberships'},
                       'generation-authority-intent-invalid')
        roles = {}
        for key in ('login', 'subject'):
            role = _closed(item[key], {'oid', 'name'}, 'generation-authority-intent-invalid')
            roles[key] = {'oid': _uint(role['oid'], 1, 4_294_967_295),
                          'name': _name(role['name'])}
        if roles['login']['oid'] in seen_login or roles['subject']['oid'] in seen_subject:
            _fail('generation-authority-intent-invalid')
        seen_login.add(roles['login']['oid']); seen_subject.add(roles['subject']['oid'])
        original = prepared['subjects'][i]
        if (roles['subject'] != original['subject']
                or roles['login']['name'] != original['newLoginName']
                or item['audience'] != original['audience']):
            _fail('generation-authority-intent-invalid')
        issuer = _text(item['issuerProfile'], 256)
        issuer_receipt = _digest(item['issuerReceiptDigest'])
        ownership = _digest(item['ownershipReceiptDigest'])
        memberships = _membership_list(item['memberships'])
        if (issuer != prepared['issuerProfile']
                or ownership != original['ownershipReceiptDigest']
                or memberships != original['memberships']):
            _fail('generation-authority-intent-invalid')
        result.append({'login': roles['login'], 'subject': roles['subject'],
                       'audience': item['audience'], 'issuerProfile': issuer,
                       'issuerReceiptDigest': issuer_receipt,
                       'ownershipReceiptDigest': ownership, 'memberships': memberships})
    return result


def _validate_intent(scope: str, raw: dict[str, Any], config: dict[str, Any],
                     identity: InitialEnrollmentIdentity | None,
                     prepared: dict[str, Any] | None
                     ) -> tuple[dict[str, Any], tuple[str, str, str]]:
    policy = config['sourcePolicy']
    if scope == PREPARE_SCOPE:
        fields = {'profile', 'providerId', 'enrollmentId', 'installationId', 'targetCustody',
                  'storeId', 'source', 'bundleDigest', 'expectedHead', 'sourceCohortDigest',
                  'executionPolicyDigest', 'issuerProfile', 'initialEpoch', 'subjects',
                  'maximumRoles'}
        item = _closed(raw, fields, 'generation-authority-intent-invalid')
        if item['profile'] != PREPARE_INTENT_PROFILE:
            _fail('generation-authority-intent-invalid')
        if identity is None or type(identity._context) is not GenerationEnrollmentAuthorityContext:
            _fail('generation-authority-identity-required')
        if (item['providerId'] != config['providerId'] or item['storeId'] != config['storeId']
                or item['installationId'] != config['installationId']
                or item['enrollmentId'] != identity.enrollment_id
                or item['initialEpoch'] != identity.initial_epoch
                or _target_custody(item['targetCustody']) != config['targetCustody']):
            _fail('generation-authority-target-mismatch')
        source = _closed(item['source'], {'format', 'sha256'}, 'generation-authority-intent-invalid')
        if source['format'] != 'json':
            _fail('generation-authority-intent-invalid')
        _digest(source['sha256'])
        for key in ('bundleDigest', 'expectedHead', 'sourceCohortDigest', 'executionPolicyDigest'):
            _digest(item[key])
        _text(item['issuerProfile'], 256)
        if item['issuerProfile'] != policy['issuerProfile']:
            _fail('generation-authority-policy-mismatch')
        cohort = {'sourceDigest': source['sha256'], 'bundleDigest': item['bundleDigest'],
                  'sourceCohortDigest': item['sourceCohortDigest'],
                  'executionPolicyDigest': item['executionPolicyDigest']}
        if not any(_canonical(cohort) == _canonical(approved)
                   for approved in policy['approvedCohorts']):
            _fail('generation-authority-cohort-not-approved')
        subjects = _validate_subjects(item['subjects'], policy)
        if (type(item['maximumRoles']) is not int or item['maximumRoles'] != len(subjects)
                or item['maximumRoles'] > 256):
            _fail('generation-authority-intent-invalid')
        return {**item, 'source': source, 'subjects': subjects}, (scope, item['providerId'], item['enrollmentId'])

    fields = {'profile', 'providerId', 'enrollmentId', 'installationId', 'targetCustody',
              'storeId', 'prepareRequestDigest', 'prepareApprovalDigest',
              'preparationReceiptDigest', 'source', 'bundleDigest', 'expectedHead',
              'sourceCohortDigest', 'executionPolicyDigest', 'initialEpoch', 'principals',
              'principalsDigest', 'fenceReceiptDigest', 'externalReservationDigest'}
    item = _closed(raw, fields, 'generation-authority-intent-invalid')
    if item['profile'] != ACTIVATE_INTENT_PROFILE or prepared is None:
        _fail('generation-authority-activation-preparation-required')
    original = prepared['intent']
    for key, source_key in (('providerId', 'providerId'), ('enrollmentId', 'enrollmentId'),
                            ('installationId', 'installationId'), ('targetCustody', 'targetCustody'),
                            ('storeId', 'storeId'), ('source', 'source'), ('bundleDigest', 'bundleDigest'),
                            ('expectedHead', 'expectedHead'), ('sourceCohortDigest', 'sourceCohortDigest'),
                            ('executionPolicyDigest', 'executionPolicyDigest'), ('initialEpoch', 'initialEpoch')):
        if item[key] != original[source_key]:
            _fail('generation-authority-activation-binding-mismatch')
    _digest(item['prepareRequestDigest']); _digest(item['prepareApprovalDigest'])
    _digest(item['preparationReceiptDigest']); _digest(item['principalsDigest'])
    _digest(item['fenceReceiptDigest']); _digest(item['externalReservationDigest'])
    principals = _validate_principals(item['principals'], original)
    if _sha(_canonical(principals)) != item['principalsDigest']:
        _fail('generation-authority-principals-digest-mismatch')
    # The receipt digest is asserted by the native provider.  The logical
    # authority binds the activation request to the exact earlier signed
    # preparation, but cannot manufacture or authenticate that provider receipt.
    if (item['prepareRequestDigest'] != prepared['intentDigest']
            or item['prepareApprovalDigest'] != prepared['approvalDigest']):
        _fail('generation-authority-activation-binding-mismatch')
    return {**item, 'principals': principals}, (scope, item['providerId'], item['enrollmentId'])


from .generation_enrollment_ledger import (
    GenerationEnrollmentAuthorityError,
    _Ledger,
    _replay,
)


def _b64encode_bytes(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode('ascii').rstrip('=')


def _b64decode_bytes(value: object) -> bytes:
    if type(value) is not str or not _B64URL.fullmatch(value):
        _fail('generation-authority-ledger-corrupt')
    try:
        result = base64.urlsafe_b64decode(value + '=' * ((4 - len(value) % 4) % 4))
    except (ValueError, TypeError):
        _fail('generation-authority-ledger-corrupt')
    if base64.urlsafe_b64encode(result).decode('ascii').rstrip('=') != value:
        _fail('generation-authority-ledger-corrupt')
    return result


from .generation_authority_bootstrap import (
    _SOURCE_TEST_ISSUER_SEAL,
    _TRUST_ISSUER_ORIGINS,
    GenerationEnrollmentAuthorityContext,
    OriginalGenerationTrustEnrollment,
    _check_issuer_purpose,
    _ContextJournal,
    _GenerationTrustIssuer,
    _require_registered_issuer,
    _source_test_generation_trust_issuer,
    _SourceTestGenerationTrustIssuer,
)

__all__ = (
    '_SOURCE_TEST_ISSUER_SEAL',
    '_TRUST_ISSUER_ORIGINS',
    'GenerationEnrollmentAuthorityContext',
    'OriginalGenerationTrustEnrollment',
    '_ContextJournal',
    '_GenerationTrustIssuer',
    '_SourceTestGenerationTrustIssuer',
    '_check_issuer_purpose',
    '_source_test_generation_trust_issuer',
)

class InitialEnrollmentIdentity(_ImmutableOpaque):
    """Opaque pair of original enrollment and preallocated initial epoch IDs."""

    __slots__ = ('_context', '_issuer', 'enrollment_id', 'initial_epoch')

    def __init__(self, seal: object, issuer: object, context: GenerationEnrollmentAuthorityContext,
                 enrollment_id: str, initial_epoch: str):
        if seal is not _REQUEST_SEAL:
            raise TypeError('initial enrollment identity is authority-issued')
        self._issuer = issuer
        self._context = context
        self.enrollment_id = enrollment_id
        self.initial_epoch = initial_epoch

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('initial enrollment identity is not serializable')


class InitialGenerationEnrollmentRequest(_ImmutableOpaque):
    __slots__ = (
        '_effect_key',
        '_identity',
        '_intent_bytes',
        '_intent_digest',
        '_issuer',
        '_payload_bytes',
        '_request_id',
        '_scope',
    )

    def __init__(self, seal: object, issuer: object, *, request_id: str, scope: str,
                 effect_key: tuple[str, str, str], intent_bytes: bytes,
                 intent_digest: str, payload_bytes: bytes,
                 identity: InitialEnrollmentIdentity):
        if seal is not _REQUEST_SEAL:
            raise TypeError('generation enrollment request is authority-issued')
        self._issuer = issuer; self._request_id = request_id; self._scope = scope
        self._effect_key = effect_key; self._intent_bytes = bytes(intent_bytes)
        self._intent_digest = intent_digest; self._payload_bytes = bytes(payload_bytes)
        self._identity = identity

    @property
    def request_id(self) -> str:
        return self._request_id

    @property
    def scope(self) -> str:
        return self._scope

    @property
    def effect_key(self) -> tuple[str, str, str]:
        return self._effect_key

    @property
    def intent_digest(self) -> str:
        return self._intent_digest

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('generation enrollment request is not serializable')


class VerifiedInitialGenerationApproval(_ImmutableOpaque):
    __slots__ = ('_approval_digest', '_envelope_bytes', '_issuer', '_request')

    def __init__(self, seal: object, issuer: object,
                 request: InitialGenerationEnrollmentRequest,
                 approval_digest: str, envelope_bytes: bytes):
        if seal is not _APPROVAL_SEAL:
            raise TypeError('generation enrollment approval is authority-issued')
        self._issuer = issuer; self._request = request
        self._approval_digest = approval_digest; self._envelope_bytes = bytes(envelope_bytes)

    @property
    def request_id(self) -> str:
        return self._request.request_id

    @property
    def scope(self) -> str:
        return self._request.scope

    @property
    def approval_digest(self) -> str:
        return self._approval_digest

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('generation enrollment approval is not serializable')


class InitialGenerationReservation(_ImmutableOpaque):
    """One-shot logical reservation; not authority to perform a native effect."""

    __slots__ = ('_issuer', '_request', '_reservation_digest', '_reservation_id')

    def __init__(self, seal: object, issuer: object,
                 request: InitialGenerationEnrollmentRequest,
                 reservation_id: str, reservation_digest: str):
        if seal is not _RESERVATION_SEAL:
            raise TypeError('generation reservation is authority-issued')
        self._issuer = issuer; self._request = request
        self._reservation_id = reservation_id
        self._reservation_digest = reservation_digest

    @property
    def reservation_id(self) -> str:
        return self._reservation_id

    @property
    def journal_record_digest(self) -> str:
        return self._reservation_digest

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('generation reservation is not serializable')


class _VerifiedInitialGenerationOutcome(_ImmutableOpaque):
    """Opaque source/native-provider outcome. The source-test path is marked."""

    __slots__ = ('_issuer', '_receipt_digest', '_reservation', '_source_test_only', '_status')

    def __init__(self, seal: object, issuer: object, reservation: InitialGenerationReservation,
                 status: str, receipt_digest: str, *, source_test_only: bool):
        if seal is not _OUTCOME_SEAL:
            raise TypeError('generation outcome is provider-issued')
        self._issuer = issuer; self._reservation = reservation; self._status = status
        self._receipt_digest = receipt_digest; self._source_test_only = source_test_only

    @property
    def status(self) -> str:
        return self._status

    @property
    def receipt_digest(self) -> str:
        return self._receipt_digest

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('generation outcome is not serializable')


class ConfiguredGenerationEnrollmentAuthority:
    """Configured two-scope authority; it never performs native effects."""

    __slots__ = (
        '_approvals',
        '_config',
        '_config_bytes',
        '_config_digest',
        '_context',
        '_context_digest',
        '_identities',
        '_issuer',
        '_keys',
        '_ledger',
        '_outcomes',
        '_prepared',
        '_requests',
        '_requests_by_id',
        '_reservations',
    )

    def __init__(self, configuration: object, *, context: GenerationEnrollmentAuthorityContext,
                 ledger_path: str | os.PathLike[str]):
        if type(context) is not GenerationEnrollmentAuthorityContext:
            _fail('generation-authority-context-unverified')
        issuer = context._issuer
        if type(issuer) is _SourceTestGenerationTrustIssuer:
            origin = _require_registered_issuer(issuer, 'source-test')
            resolver = _SourceTestGenerationTrustIssuer.resolve_generation_authority_context
        elif type(issuer) is _GenerationTrustIssuer:
            origin = _require_registered_issuer(issuer, 'production')
            resolver = _GenerationTrustIssuer.resolve_generation_authority_context
        else:
            _fail('generation-authority-context-unverified')
        resolver(issuer, context)
        config, keys = _config(configuration)
        projection = context.public_reference
        _check_issuer_purpose(origin, projection, config['purpose'])
        encoded = _canonical(config)
        if encoded != context._trust._configuration_bytes:
            _fail('generation-authority-configuration-mismatch')
        projection = context.public_reference
        self._config = config; self._config_bytes = encoded
        self._config_digest = _sha(encoded); self._keys = keys
        self._context = context; self._context_digest = _sha(context._projection_bytes)
        self._issuer = issuer
        self._ledger = _Ledger(ledger_path, config['authorityId'], self._config_digest,
                               self._context_digest, config['purpose'])
        if Path(os.fspath(ledger_path)) != context._trust._ledger_path:
            _fail('generation-authority-ledger-path-mismatch')
        if projection['configurationDigest'] != self._config_digest:
            _fail('generation-authority-context-mismatch')
        # A context is already an original enrollment.  Therefore its missing
        # ledger or lock is evidence loss, never permission to initialize a new
        # history.  First-ledger creation belongs to the original bootstrap
        # enrollment path, which is not yet integrated for production.
        records = self._ledger.events(create=False)
        replay = _replay(records)
        self._identities: dict[str, InitialEnrollmentIdentity] = {}
        self._requests: dict[int, InitialGenerationEnrollmentRequest] = {}
        self._requests_by_id: dict[str, InitialGenerationEnrollmentRequest] = {}
        self._approvals: dict[int, VerifiedInitialGenerationApproval] = {}
        self._reservations: dict[int, InitialGenerationReservation] = {}
        self._outcomes: dict[int, _VerifiedInitialGenerationOutcome] = {}
        self._prepared = replay['requests']

    @property
    def authority_id(self) -> str:
        return self._config['authorityId']

    @property
    def purpose(self) -> str:
        return self._config['purpose']

    @property
    def context(self) -> GenerationEnrollmentAuthorityContext:
        return self._context

    def allocate_identity(self) -> InitialEnrollmentIdentity:
        # The original issuer durably reserved both logical IDs at context
        # birth. They are separate from the trust-registry entry ID.
        enrollment_id = self._context._logical_enrollment_id
        epoch = self._context._initial_epoch
        entries = [event['payload'] for event in self._ledger.events(create=False)
                   if event['kind'] == 'identity-allocated']
        if entries != [{'enrollmentId': enrollment_id, 'initialEpoch': epoch}]:
            _fail('generation-authority-original-identity-mismatch')
        prior = self._identities.get(enrollment_id)
        if prior is not None:
            if prior.initial_epoch != epoch or prior._context is not self._context:
                _fail('generation-authority-original-identity-mismatch')
            return prior
        identity = InitialEnrollmentIdentity(_REQUEST_SEAL, self, self._context,
                                             enrollment_id, epoch)
        self._identities[enrollment_id] = identity
        return identity

    def prepare_request(self, scope: str, exact_intent_bytes: bytes,
                        identity: InitialEnrollmentIdentity,
                        *, preparation: VerifiedInitialGenerationApproval | None = None
                        ) -> InitialGenerationEnrollmentRequest:
        self._require_identity(identity)
        if scope not in SCOPES:
            _fail('generation-authority-scope-invalid')
        raw = _parse_canonical(exact_intent_bytes, maximum=_MAX_REQUEST)
        prepared = None
        if scope == ACTIVATE_SCOPE:
            if type(preparation) is not VerifiedInitialGenerationApproval:
                _fail('generation-authority-activation-preparation-required')
            previous = self._require_approval(preparation)
            if previous._request._identity is not identity:
                _fail('generation-authority-activation-identity-mismatch')
            prepared = self._prepared.get(previous.request_id)
            if prepared is None or prepared['approvedEnvelope'] is None:
                _fail('generation-authority-activation-preparation-required')
            _parse_canonical(_b64decode_bytes(prepared['payload']['signedPayloadBytes']))
            prepared = {'intent': _parse_canonical(_b64decode_bytes(prepared['payload']['intentBytes'])),
                        'intentDigest': prepared['payload']['intentDigest'],
                        'approvalDigest': _sha(_canonical(prepared['approvedEnvelope'])),
                        'preparationReceiptDigest': None}
        normalized, effect_key = _validate_intent(scope, raw, self._config, identity, prepared)
        intent_bytes = _canonical(normalized)
        current = _replay(self._ledger.events(create=False))
        previous_id = current['effectKeys'].get(effect_key)
        if previous_id is not None:
            saved = current['requests'][previous_id]['payload']
            if (saved['identityEnrollmentId'] != identity.enrollment_id
                    or _b64decode_bytes(saved['intentBytes']) != intent_bytes):
                _fail('generation-authority-original-request-mismatch')
            return self.recover_request(scope, intent_bytes, identity, previous_id)
        request_id = str(uuid.uuid4())
        key = next((item for item in self._config['keys']
                    if scope in item['scopes']), None)
        if key is None:
            _fail('generation-authority-key-unavailable')
        payload = {'profile': APPROVAL_PROFILE, 'authorityId': self.authority_id,
                   'principalId': key['principalId'], 'keyId': key['keyId'],
                   'requestId': request_id, 'purpose': self.purpose, 'scope': scope,
                   'policyRevision': self._config['policyRevision'],
                   'configurationDigest': self._config_digest,
                   'contextDigest': self._context_digest,
                   'targetCustody': self._config['targetCustody'], 'intent': normalized}
        payload_bytes = _canonical(payload)
        logpayload = {'requestId': request_id, 'scope': scope,
                      'effectKey': list(effect_key), 'intentBytes': _b64encode_bytes(intent_bytes),
                      'intentDigest': _sha(intent_bytes),
                      'signedPayloadBytes': _b64encode_bytes(payload_bytes),
                      'identityEnrollmentId': identity.enrollment_id}
        try:
            self._ledger._append('request-prepared', logpayload)
        except GenerationEnrollmentAuthorityError:
            # A process may have appended the stable effect key concurrently.
            latest = _replay(self._ledger.events(create=False))
            winner_id = latest['effectKeys'].get(effect_key)
            if winner_id is None:
                raise
            winner = latest['requests'][winner_id]['payload']
            if (winner['identityEnrollmentId'] != identity.enrollment_id
                    or _b64decode_bytes(winner['intentBytes']) != intent_bytes):
                _fail('generation-authority-original-request-mismatch')
            return self.recover_request(scope, intent_bytes, identity, winner_id)
        request = InitialGenerationEnrollmentRequest(
            _REQUEST_SEAL, self, request_id=request_id, scope=scope,
            effect_key=effect_key, intent_bytes=intent_bytes,
            intent_digest=_sha(intent_bytes), payload_bytes=payload_bytes, identity=identity)
        self._requests[id(request)] = request; self._requests_by_id[request_id] = request
        self._prepared[request_id] = {'payload': logpayload, 'signedPayload': payload,
                                      'approvedEnvelope': None, 'reservation': None,
                                      'settlement': None}
        return request

    def export_signing_request(self, request: InitialGenerationEnrollmentRequest) -> dict[str, Any]:
        request = self._require_request(request)
        return {'domain': SIGNING_DOMAIN.decode('ascii'),
                'payload': _parse_canonical(request._payload_bytes),
                'intent': _parse_canonical(request._intent_bytes)}

    def verify_approval(self, request: InitialGenerationEnrollmentRequest,
                        signed_envelope: object) -> VerifiedInitialGenerationApproval:
        request = self._require_request(request)
        envelope = _json_copy(signed_envelope)
        _closed(envelope, {'payload', 'keyId', 'signature'},
                'generation-authority-envelope-invalid')
        if type(envelope['payload']) is not dict:
            _fail('generation-authority-envelope-invalid')
        payload_bytes = _canonical(envelope['payload'])
        if payload_bytes != request._payload_bytes:
            _fail('generation-authority-request-mismatch')
        if envelope['keyId'] != envelope['payload'].get('keyId'):
            _fail('generation-authority-key-mismatch')
        key = self._keys.get(envelope['keyId'])
        if key is None or request.scope not in key['scopes']:
            _fail('generation-authority-key-untrusted')
        sig = _b64decode(envelope['signature'], 64)
        try:
            from cryptography import __version__ as crypto_version
            from cryptography.exceptions import InvalidSignature
            from cryptography.hazmat.primitives.asymmetric.ed25519 import (
                Ed25519PublicKey,
            )
        except ImportError:
            _fail('generation-authority-crypto-unavailable')
        if crypto_version != '50.0.2':
            _fail('generation-authority-crypto-version-unqualified')
        try:
            Ed25519PublicKey.from_public_bytes(key['publicKeyBytes']).verify(
                sig, SIGNING_DOMAIN + payload_bytes)
        except InvalidSignature:
            _fail('generation-authority-signature-invalid')
        except (TypeError, ValueError):
            _fail('generation-authority-key-invalid')
        envelope_bytes = _canonical(envelope)
        digest = _sha(envelope_bytes)
        prior = self._prepared[request.request_id]
        if prior['approvedEnvelope'] is not None:
            if _canonical(prior['approvedEnvelope']) != envelope_bytes:
                _fail('generation-authority-replay-conflict')
            existing = next((v for v in self._approvals.values() if v._request is request), None)
            if existing is not None:
                return existing
        else:
            # Re-read before appending so a concurrent process that verified
            # this exact signed envelope is observed as the original decision.
            current = _replay(self._ledger.events(create=False))['requests'].get(
                request.request_id)
            if current is None:
                _fail('generation-authority-original-request-missing')
            if current['approvedEnvelope'] is not None:
                if _canonical(current['approvedEnvelope']) != envelope_bytes:
                    _fail('generation-authority-replay-conflict')
            else:
                self._ledger._append('approval-verified', {
                    'requestId': request.request_id,
                    'envelopeBytes': _b64encode_bytes(envelope_bytes),
                    'approvalDigest': digest})
            prior['approvedEnvelope'] = envelope
        verified = VerifiedInitialGenerationApproval(
            _APPROVAL_SEAL, self, request, digest, envelope_bytes)
        self._approvals[id(verified)] = verified
        return verified

    def reserve_effect(self, approval: VerifiedInitialGenerationApproval
                       ) -> InitialGenerationReservation:
        approval = self._require_approval(approval)
        request = approval._request
        prior = self._prepared[request.request_id]
        if prior['reservation'] is not None:
            _fail('generation-authority-effect-already-reserved')
        reservation_id = str(uuid.uuid4())
        payload = {'requestId': request.request_id, 'reservationId': reservation_id,
                   'approvalDigest': approval.approval_digest,
                   'effectKey': list(request.effect_key)}
        record = self._ledger._append('effect-reserved', payload)
        reservation = InitialGenerationReservation(_RESERVATION_SEAL, self, request,
                                                    reservation_id, record['digest'])
        self._reservations[id(reservation)] = reservation
        prior['reservation'] = payload
        return reservation

    def observe(self, request: InitialGenerationEnrollmentRequest) -> dict[str, Any]:
        request = self._require_request(request)
        events = self._ledger.events(create=False)
        replay = _replay(events)['requests'].get(request.request_id)
        if replay is None:
            _fail('generation-authority-original-request-missing')
        return {'requestId': request.request_id, 'scope': request.scope,
                'intentDigest': request.intent_digest,
                'approvalStatus': 'verified' if replay['approvedEnvelope'] else 'prepared',
                'approvalDigest': (_sha(_canonical(replay['approvedEnvelope']))
                                   if replay['approvedEnvelope'] else None),
                'effectStatus': (replay['settlement']['status'] if replay['settlement']
                                 else 'reserved' if replay['reservation'] else 'not-reserved'),
                'reservationId': (replay['reservation']['reservationId']
                                  if replay['reservation'] else None),
                'reservationDigest': next((event['digest'] for event in events
                                           if event['kind'] == 'effect-reserved'
                                           and event['payload']['requestId'] == request.request_id), None),
                'effectReceiptDigest': (replay['settlement']['receiptDigest']
                                        if replay['settlement'] else None)}

    def recover_request(self, scope: str, exact_intent_bytes: bytes,
                        identity: InitialEnrollmentIdentity,
                        expected_request_id: str) -> InitialGenerationEnrollmentRequest:
        identity = self._require_identity(identity)
        expected_request_id = _uuid(expected_request_id)
        if scope not in SCOPES:
            _fail('generation-authority-scope-invalid')
        events = self._ledger.events(create=False)
        matches = [e['payload'] for e in events if e['kind'] == 'request-prepared'
                   and e['payload']['requestId'] == expected_request_id]
        if len(matches) != 1:
            _fail('generation-authority-original-request-missing')
        payload = matches[0]
        if (payload['scope'] != scope or payload['identityEnrollmentId'] != identity.enrollment_id
                or _b64decode_bytes(payload['intentBytes']) != exact_intent_bytes):
            _fail('generation-authority-original-request-mismatch')
        signed_payload = _b64decode_bytes(payload['signedPayloadBytes'])
        request = InitialGenerationEnrollmentRequest(
            _REQUEST_SEAL, self, request_id=expected_request_id, scope=scope,
            effect_key=tuple(payload['effectKey']), intent_bytes=exact_intent_bytes,
            intent_digest=_sha(exact_intent_bytes), payload_bytes=signed_payload,
            identity=identity)
        self._requests[id(request)] = request; self._requests_by_id[expected_request_id] = request
        return request

    def recover_approval(self, request: InitialGenerationEnrollmentRequest
                        ) -> VerifiedInitialGenerationApproval:
        request = self._require_request(request)
        events = self._ledger.events(create=False)
        matches = [event['payload'] for event in events
                   if event['kind'] == 'approval-verified'
                   and event['payload']['requestId'] == request.request_id]
        if len(matches) != 1:
            _fail('generation-authority-original-approval-missing')
        envelope = _parse_canonical(_b64decode_bytes(matches[0]['envelopeBytes']))
        return self.verify_approval(request, envelope)

    def recover_reservation(self, request: InitialGenerationEnrollmentRequest,
                            expected_reservation_id: str
                            ) -> InitialGenerationReservation:
        request = self._require_request(request)
        expected_reservation_id = _uuid(expected_reservation_id)
        events = self._ledger.events(create=False)
        replay = _replay(events)['requests'].get(request.request_id)
        if replay is None or replay['reservation'] is None:
            _fail('generation-authority-original-reservation-missing')
        saved = replay['reservation']
        if saved['reservationId'] != expected_reservation_id:
            _fail('generation-authority-original-reservation-mismatch')
        record = next(event for event in events
                      if event['kind'] == 'effect-reserved'
                      and event['payload']['requestId'] == request.request_id)
        reservation = InitialGenerationReservation(
            _RESERVATION_SEAL, self, request, expected_reservation_id, record['digest'])
        self._reservations[id(reservation)] = reservation
        self._prepared[request.request_id]['reservation'] = saved
        return reservation

    def recover_identity(self, enrollment_id: str) -> InitialEnrollmentIdentity:
        enrollment_id = _uuid(enrollment_id)
        events = self._ledger.events(create=False)
        entries = [e['payload'] for e in events if e['kind'] == 'identity-allocated'
                   and e['payload']['enrollmentId'] == enrollment_id]
        if len(entries) != 1:
            _fail('generation-authority-original-identity-missing')
        prior = self._identities.get(enrollment_id)
        if prior is not None:
            if prior.initial_epoch != entries[0]['initialEpoch']:
                _fail('generation-authority-original-identity-mismatch')
            return prior
        identity = InitialEnrollmentIdentity(
            _REQUEST_SEAL, self, self._context, enrollment_id, entries[0]['initialEpoch'])
        self._identities[enrollment_id] = identity
        return identity

    def _require_identity(self, value: object) -> InitialEnrollmentIdentity:
        if (type(value) is not InitialEnrollmentIdentity or value._issuer is not self
                or value._context is not self._context
                or self._identities.get(value.enrollment_id) is not value
                or value.enrollment_id != self._context._logical_enrollment_id
                or value.initial_epoch != self._context._initial_epoch):
            _fail('generation-authority-identity-required')
        return value

    def _require_request(self, value: object) -> InitialGenerationEnrollmentRequest:
        if (type(value) is not InitialGenerationEnrollmentRequest or value._issuer is not self
                or self._requests.get(id(value)) is not value):
            _fail('generation-authority-request-required')
        _uuid(value._request_id)
        identity = self._require_identity(value._identity)
        if (value._scope not in SCOPES or value._intent_digest != _sha(value._intent_bytes)
                or _parse_canonical(value._payload_bytes).get('scope') != value._scope
                or _parse_canonical(value._payload_bytes).get('requestId') != value._request_id
                or _parse_canonical(value._payload_bytes).get('contextDigest') != self._context_digest
                or _parse_canonical(value._payload_bytes).get('configurationDigest') != self._config_digest):
            _fail('generation-authority-request-mismatch')
        replay = _replay(self._ledger.events(create=False))
        saved = replay['requests'].get(value._request_id)
        if (saved is None
                or saved['payload']['identityEnrollmentId'] != identity.enrollment_id
                or saved['payload']['scope'] != value._scope
                or saved['payload']['intentDigest'] != value._intent_digest
                or _b64decode_bytes(saved['payload']['intentBytes']) != value._intent_bytes
                or _b64decode_bytes(saved['payload']['signedPayloadBytes']) != value._payload_bytes
                or tuple(saved['payload']['effectKey']) != value._effect_key):
            _fail('generation-authority-request-mismatch')
        return value

    def _require_approval(self, value: object) -> VerifiedInitialGenerationApproval:
        if (type(value) is not VerifiedInitialGenerationApproval or value._issuer is not self
                or self._approvals.get(id(value)) is not value):
            _fail('generation-authority-approval-required')
        request = self._require_request(value._request)
        envelope = _parse_canonical(value._envelope_bytes)
        if (value._approval_digest != _sha(value._envelope_bytes)
                or envelope.get('payload') != _parse_canonical(request._payload_bytes)):
            _fail('generation-authority-approval-required')
        replay = _replay(self._ledger.events(create=False))['requests'].get(request.request_id)
        if (replay is None or replay['approvedEnvelope'] is None
                or _canonical(replay['approvedEnvelope']) != value._envelope_bytes):
            _fail('generation-authority-approval-required')
        return value

    def _resolve_native_reservation(self, value: object,
                                    approval: VerifiedInitialGenerationApproval) -> InitialGenerationReservation:
        approval = self._require_approval(approval)
        if (self._context.public_reference.get('sourceTestOnly') is True
                or type(value) is not InitialGenerationReservation
                or value._issuer is not self or self._reservations.get(id(value)) is not value
                or value._request is not approval._request):
            _fail('generation-authority-native-reservation-unavailable')
        _fail('generation-authority-native-provider-unavailable')

    def _resolve_native_outcome(self, outcome: object,
                                reservation: InitialGenerationReservation) -> _VerifiedInitialGenerationOutcome:
        if (self._context.public_reference.get('sourceTestOnly') is True
                or type(outcome) is not _VerifiedInitialGenerationOutcome
                or outcome._issuer is not self or outcome._reservation is not reservation
                or outcome._source_test_only):
            _fail('generation-authority-native-outcome-unavailable')
        return outcome

    def _record_source_test_outcome(self, reservation: InitialGenerationReservation,
                                    status: str, receipt_digest: str
                                    ) -> dict[str, Any]:
        """Test-only logical exercise; explicitly unavailable to production contexts."""
        if (self._context.public_reference.get('sourceTestOnly') is not True
                or type(reservation) is not InitialGenerationReservation
                or reservation._issuer is not self
                or self._reservations.get(id(reservation)) is not reservation
                or status not in ('confirmed', 'known-aborted')):
            _fail('generation-authority-source-test-only')
        _digest(receipt_digest)
        request = reservation._request
        payload = {'requestId': request.request_id,
                   'reservationId': reservation.reservation_id,
                   'status': status, 'receiptDigest': receipt_digest}
        record = self._ledger._append('effect-settled', payload)
        self._prepared[request.request_id]['settlement'] = payload
        return {'status': status, 'journalRecordDigest': record['digest'],
                'sourceTestOnly': True}



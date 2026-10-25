# SPDX-License-Identifier: MIT OR Apache-2.0
"""Durable external journal primitives for G11 target custody.

The journal is deliberately separate from the PostgreSQL ingress store.  Its
append chain is an external source of original intent and sequence; it is not
by itself proof that a local server, process, data directory, or endpoint is
owned.  Production ``TargetCustodian`` issuance remains fail-closed until the
bootstrap-enrolled native owner/supervisor adapter is implemented.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import stat
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

JOURNAL_PROFILE = 'umf.local-target-custody-journal/0.1'
JOURNAL_PROFILE_02 = 'umf.local-target-custody-journal/0.2'
_MAX_BYTES = 8 * 1024 * 1024
_MAX_EVENTS = 4096
_MAX_SAFE = 9_007_199_254_740_991
_HEX = re.compile(r'^[a-f0-9]{64}$')
_UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
_OWNER_REQUEST_KIND = 'umf.local-owner-target-registration/0.1'
_KINDS = frozenset({
    'registration-intent', 'registration-observation', 'registration-confirmed',
    'epoch-provision-reserved', 'epoch-provision-observation', 'epoch-provision-confirmed',
    'transition-reserved', 'transition-observation', 'transition-confirmed',
})
_KINDS_02 = _KINDS | frozenset({
    'originals-store-reserved', 'originals-store-observation',
    'originals-store-confirmed',
})


class CustodyJournalError(RuntimeError):
    """Fixed journal failure without leaking private payloads or paths."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


_OWNER_RESOLVER_SEAL = object()
_OWNER_EVIDENCE_SEAL = object()
_CUSTODY_SEAL = object()


class _OwnerRegistrationEvidence:
    """Private result tied to the exact bootstrap-enrolled resolver object."""

    __slots__ = ('native_attestation', 'observation', 'payload', 'request', 'resolver')

    def __init__(self, seal: object, resolver: object, request: object, payload: dict[str, Any],
                 observation: dict[str, Any], native_attestation: object):
        if seal is not _OWNER_EVIDENCE_SEAL:
            raise TypeError('owner registration evidence is issuer-created')
        self.resolver = resolver
        self.request = request
        self.payload = payload
        self.observation = observation
        self.native_attestation = native_attestation

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('owner registration evidence cannot be serialized')


class _OwnerRegistrationResolver:
    """Exact enrolled resolver binding; a structural protocol is not accepted."""

    __slots__ = ('_context', '_observe', '_resolve', 'adapter', 'issuer')

    def __init__(self, seal: object, issuer: object, adapter: object,
                 control_context: object):
        if seal is not _OWNER_RESOLVER_SEAL or issuer is None or control_context is None:
            raise TypeError('owner resolver binding is trusted-bootstrap-only')
        resolve = getattr(adapter, 'resolve_owner_registration', None)
        observe = getattr(adapter, 'observe_original_registration', None)
        if (getattr(resolve, '__self__', None) is not adapter
                or getattr(observe, '__self__', None) is not adapter):
            raise TypeError('owner resolver must be bound to its enrolled adapter')
        self.issuer = issuer
        self.adapter = adapter
        self._context = control_context
        self._resolve = resolve
        self._observe = observe

    def require_control_lease(self, value: object, *, operation_kind: str) -> object:
        """Resolve the fixed physical bootstrap lease without an adapter callback."""
        from .owner_bootstrap import _resolve_original_control_lease

        return _resolve_original_control_lease(
            value, context=self._context, supervisor=self.adapter,
            operation_kind=operation_kind)

    def resolve(self, request: object, custodian_id: str, provider_id: str) -> _OwnerRegistrationEvidence:
        from .generation_ingress import OwnerEnrollmentRequest

        if (type(request) is not OwnerEnrollmentRequest
                or not request._issued_by(self.issuer, _OWNER_REQUEST_KIND)):
            raise CustodyJournalError('owner-enrollment-required')
        evidence = self._resolve(request, custodian_id=custodian_id, provider_id=provider_id)
        if (type(evidence) is not _OwnerRegistrationEvidence or evidence.resolver is not self
                or evidence.request is not request):
            raise CustodyJournalError('owner-registration-unverified')
        return evidence

    def observe_original(self, request: object, original_payload: dict[str, Any],
                         custodian_sequence: int) -> _OwnerRegistrationEvidence:
        from .generation_ingress import OwnerEnrollmentRequest

        if (type(request) is not OwnerEnrollmentRequest
                or not request._issued_by(self.issuer, _OWNER_REQUEST_KIND)):
            raise CustodyJournalError('owner-enrollment-required')
        evidence = self._observe(request, original_payload=original_payload,
                                 custodian_sequence=custodian_sequence)
        if (type(evidence) is not _OwnerRegistrationEvidence or evidence.resolver is not self
                or evidence.request is not request or evidence.payload != original_payload):
            raise CustodyJournalError('owner-registration-unverified')
        return evidence


def _bind_owner_registration_resolver(issuer: object, adapter: object,
                                      control_context: object) -> _OwnerRegistrationResolver:
    """Private bootstrap seam; only trusted host bootstrap may call this."""
    return _OwnerRegistrationResolver(_OWNER_RESOLVER_SEAL, issuer, adapter,
                                      control_context)


def _issue_owner_registration_evidence(resolver: _OwnerRegistrationResolver, request: object,
                                       payload: dict[str, Any], observation: dict[str, Any],
                                       native_attestation: object) -> _OwnerRegistrationEvidence:
    """Private issuer seam used by the enrolled native owner adapter."""
    from .generation_ingress import OwnerEnrollmentRequest

    if (type(resolver) is not _OwnerRegistrationResolver
            or type(request) is not OwnerEnrollmentRequest
            or not request._issued_by(resolver.issuer, _OWNER_REQUEST_KIND)
            or native_attestation is None):
        raise CustodyJournalError('owner-registration-unverified')
    _validate_owner_payload(payload)
    if payload['registrationId'] != getattr(request, '_registration_id', payload['registrationId']):
        raise CustodyJournalError('owner-registration-unverified')
    _validate_observation(observation, payload)
    return _OwnerRegistrationEvidence(_OWNER_EVIDENCE_SEAL, resolver, request,
                                      payload, observation, native_attestation)


def _validate_observation(observation: dict[str, Any], payload: dict[str, Any]) -> None:
    _closed(observation, {'profile', 'registrationDigest', 'originReceiptDigest',
           'currentLaunchReceiptDigest', 'continuityChainDigest', 'endpointGateReceiptDigest',
           'nativeObservationDigest', 'custodianSequence'})
    if observation['profile'] != 'umf.local-target-registration-observation/0.1':
        raise CustodyJournalError('journal-invalid')
    for key in ('registrationDigest', 'originReceiptDigest', 'currentLaunchReceiptDigest',
                'continuityChainDigest', 'endpointGateReceiptDigest', 'nativeObservationDigest'):
        _hex(observation[key])
    if (type(observation['custodianSequence']) is not int
            or not 1 <= observation['custodianSequence'] <= _MAX_SAFE):
        raise CustodyJournalError('journal-invalid')
    if (observation['originReceiptDigest'] != payload['origin']['creationReceiptDigest']
            or observation['endpointGateReceiptDigest'] != payload['endpointControl']['authorityReceiptDigest']):
        raise CustodyJournalError('owner-observation-mismatch')


class _VerifiedTargetCustody:
    """Nonserializable binding from an issued handle to its retained origin."""

    __slots__ = ('_seal', 'custodian', 'native_attestation', 'reference', 'registration')

    def __init__(self, seal: object, custodian: object, registration: dict[str, Any],
                 native_attestation: object, reference: dict[str, Any]):
        if seal is not _CUSTODY_SEAL:
            raise TypeError('verified target custody is custodian-issued')
        self.custodian = custodian
        self.registration = registration
        self.native_attestation = native_attestation
        self.reference = reference
        self._seal = seal

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('verified target custody cannot be serialized')


def _canonical(value: Any) -> bytes:
    """Encode a bounded JSON value, rejecting Python-only and unsafe values."""
    pending = [(value, 0)]
    nodes = 0
    while pending:
        item, depth = pending.pop()
        nodes += 1
        if nodes > 100_000 or depth > 48:
            raise CustodyJournalError('journal-capacity')
        if item is None or type(item) is bool:
            continue
        if type(item) is int:
            if abs(item) > _MAX_SAFE:
                raise CustodyJournalError('journal-invalid')
        elif type(item) is str:
            try:
                item.encode('utf-8')
            except UnicodeEncodeError:
                raise CustodyJournalError('journal-invalid') from None
            if '\x00' in item:
                raise CustodyJournalError('journal-invalid')
        elif type(item) is list:
            if len(item) > _MAX_EVENTS:
                raise CustodyJournalError('journal-capacity')
            pending.extend((child, depth + 1) for child in item)
        elif type(item) is dict:
            if len(item) > 128 or any(type(key) is not str or not key.isascii() for key in item):
                raise CustodyJournalError('journal-invalid')
            pending.extend((child, depth + 1) for child in item.values())
        else:
            raise CustodyJournalError('journal-invalid')
    try:
        data = json.dumps(value, ensure_ascii=False, sort_keys=True,
                          separators=(',', ':'), allow_nan=False).encode('utf-8')
    except (TypeError, ValueError, UnicodeError, RecursionError):
        raise CustodyJournalError('journal-invalid') from None
    if len(data) > _MAX_BYTES:
        raise CustodyJournalError('journal-capacity')
    return data


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _pairs_no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise CustodyJournalError('journal-corrupt')
        result[key] = value
    return result


def _read_json(data: bytes) -> Any:
    try:
        value = json.loads(data.decode('utf-8'), object_pairs_hook=_pairs_no_duplicates,
                           parse_constant=lambda _value: (_ for _ in ()).throw(
                               CustodyJournalError('journal-corrupt')))
    except CustodyJournalError:
        raise
    except (UnicodeError, ValueError, RecursionError):
        raise CustodyJournalError('journal-corrupt') from None
    if _canonical(value) != data:
        raise CustodyJournalError('journal-corrupt')
    return value


def _closed(value: Any, keys: set[str]) -> dict[str, Any]:
    if type(value) is not dict or set(value) != keys:
        raise CustodyJournalError('journal-invalid')
    return value


def _text(value: Any, maximum: int = 4096) -> str:
    if type(value) is not str or not value or '\x00' in value:
        raise CustodyJournalError('journal-invalid')
    try:
        size = len(value.encode('utf-8'))
    except UnicodeEncodeError:
        raise CustodyJournalError('journal-invalid') from None
    if size > maximum:
        raise CustodyJournalError('journal-invalid')
    return value


def _safe_uint32(value: Any) -> int:
    if type(value) is not int or not 1 <= value <= 2**32 - 1:
        raise CustodyJournalError('journal-invalid')
    return value


def _uuid(value: Any) -> str:
    if type(value) is not str or not _UUID.fullmatch(value):
        raise CustodyJournalError('journal-invalid')
    return value


def _hex(value: Any) -> str:
    if type(value) is not str or not _HEX.fullmatch(value):
        raise CustodyJournalError('journal-invalid')
    return value


def _decimal(value: Any, maximum: int) -> str:
    if (type(value) is not str or not value.isascii() or not value.isdecimal()
            or (len(value) > 1 and value[0] == '0') or int(value) > maximum):
        raise CustodyJournalError('journal-invalid')
    return value


def _validate_owner_payload(owner: Any) -> None:
    _closed(owner, {'profile', 'registrationId', 'custodianId', 'providerId',
           'installationId', 'ownerApproval', 'origin', 'endpointControl'})
    if owner['profile'] != 'umf.local-owner-target-registration/0.1':
        raise CustodyJournalError('journal-invalid')
    for key in ('registrationId', 'custodianId', 'providerId'):
        _uuid(owner[key])
    _text(owner['installationId'], 128)
    _closed(owner['ownerApproval'], {'authorityId', 'approvalId', 'approvalDigest', 'scope'})
    approval = owner['ownerApproval']
    _text(approval['authorityId'], 256); _uuid(approval['approvalId']); _hex(approval['approvalDigest'])
    if approval['scope'] != 'enroll-owned-local-postgresql-target':
        raise CustodyJournalError('journal-invalid')
    origin = owner['origin']
    _closed(origin, {'profile', 'supervisorId', 'clusterId', 'incarnationId',
           'creationReceiptDigest', 'nativeBinary', 'dataDirectory', 'initialPostmaster',
           'database', 'endpoint'})
    if origin['profile'] != 'postgresql18-local-supervised-origin/0.1':
        raise CustodyJournalError('journal-invalid')
    for key in ('supervisorId', 'clusterId', 'incarnationId'):
        _uuid(origin[key])
    _hex(origin['creationReceiptDigest'])
    binary = origin['nativeBinary']
    _closed(binary, {'path', 'sha256', 'version'})
    _canonical_path(binary['path']); _hex(binary['sha256'])
    if binary['version'] != '18.6':
        raise CustodyJournalError('journal-invalid')
    directory = origin['dataDirectory']
    _closed(directory, {'path', 'device', 'inode', 'ownerUid'})
    _canonical_path(directory['path'])
    _decimal(directory['device'], 18_446_744_073_709_551_615)
    _decimal(directory['inode'], 18_446_744_073_709_551_615)
    if type(directory['ownerUid']) is not int or not 0 <= directory['ownerUid'] <= 4_294_967_295:
        raise CustodyJournalError('journal-invalid')
    postmaster = origin['initialPostmaster']
    _closed(postmaster, {'pid', 'startToken', 'launchReceiptDigest'})
    if type(postmaster['pid']) is not int or not 1 <= postmaster['pid'] <= 2_147_483_647:
        raise CustodyJournalError('journal-invalid')
    token = postmaster['startToken']
    if type(token) is not str or not token.isascii() or not 1 <= len(token) <= 128:
        raise CustodyJournalError('journal-invalid')
    _hex(postmaster['launchReceiptDigest'])
    database = origin['database']
    _closed(database, {'name', 'oid', 'systemIdentifier'})
    _text(database['name'], 63)
    if type(database['oid']) is not int or not 1 <= database['oid'] <= 4_294_967_295:
        raise CustodyJournalError('journal-invalid')
    _decimal(database['systemIdentifier'], 18_446_744_073_709_551_615)
    endpoint = origin['endpoint']
    _closed(endpoint, {'host', 'port'})
    if endpoint['host'] != '127.0.0.1' or type(endpoint['port']) is not int or not 1 <= endpoint['port'] <= 65535:
        raise CustodyJournalError('journal-invalid')
    control = owner['endpointControl']
    _closed(control, {'controllerId', 'profile', 'authorityReceiptDigest'})
    _uuid(control['controllerId']); _hex(control['authorityReceiptDigest'])
    if control['profile'] != 'umf.local-postgresql-endpoint-controller/0.1':
        raise CustodyJournalError('journal-invalid')


def _canonical_path(value: Any) -> str:
    path = _text(value, 4096)
    if not os.path.isabs(path) or os.path.normpath(path) != path:
        raise CustodyJournalError('journal-invalid')
    return path


def _validate_event_payload(kind: str, payload: Any, *, profile: str = JOURNAL_PROFILE) -> dict[str, Any]:
    """Validate the fixed journal event envelopes and their exact references."""
    if kind == 'registration-intent':
        _closed(payload, {'registrationId', 'registrationDigest', 'ownerPayload', 'ownerApproval'})
        _uuid(payload['registrationId']); _hex(payload['registrationDigest'])
        _validate_owner_payload(payload['ownerPayload'])
        owner = payload['ownerPayload']
        if owner['registrationId'] != payload['registrationId']:
            raise CustodyJournalError('journal-invalid')
        approval = owner['ownerApproval']
        _closed(payload['ownerApproval'], {'approvalId', 'approvalDigest'})
        if payload['ownerApproval'] != {'approvalId': approval['approvalId'],
                                        'approvalDigest': approval['approvalDigest']}:
            raise CustodyJournalError('journal-invalid')
    elif kind == 'registration-observation':
        _closed(payload, {'registrationId', 'observation'})
        _uuid(payload['registrationId'])
        observation = payload['observation']
        _closed(observation, {'profile', 'registrationDigest', 'originReceiptDigest',
               'currentLaunchReceiptDigest', 'continuityChainDigest', 'endpointGateReceiptDigest',
               'nativeObservationDigest', 'custodianSequence'})
        if observation['profile'] != 'umf.local-target-registration-observation/0.1':
            raise CustodyJournalError('journal-invalid')
        for key in ('registrationDigest', 'originReceiptDigest', 'currentLaunchReceiptDigest',
                    'continuityChainDigest', 'endpointGateReceiptDigest', 'nativeObservationDigest'):
            _hex(observation[key])
        sequence = observation['custodianSequence']
        if type(sequence) is not int or not 1 <= sequence <= _MAX_SAFE:
            raise CustodyJournalError('journal-invalid')
    elif kind == 'registration-confirmed':
        _closed(payload, {'registrationId', 'targetCustody'})
        _uuid(payload['registrationId'])
        custody = payload['targetCustody']
        _closed(custody, {'profile', 'custodianId', 'registrationId', 'resourceId',
               'incarnation', 'registrationDigest'})
        if custody['profile'] != 'umf.native-target-custody/0.1' or custody['registrationId'] != payload['registrationId']:
            raise CustodyJournalError('journal-invalid')
        for key in ('custodianId', 'registrationId', 'resourceId', 'incarnation'):
            _text(custody[key], 256)
        _hex(custody['registrationDigest'])
    elif kind == 'epoch-provision-reserved':
        _closed(payload, {'request', 'requestDigest', 'provisioningApprovalDigest', 'reservation'})
        _hex(payload['requestDigest']); _hex(payload['provisioningApprovalDigest'])
        request = payload['request']
        _closed(request, {'profile', 'providerId', 'enrollmentId', 'installationId', 'targetCustody',
               'planDigest', 'fileDigest', 'expectedHead', 'previousSourceDigest', 'nextSourceDigest',
               'nextBundleDigest', 'newEpoch', 'issuerProfile', 'principals', 'maximumRoles'})
        if request['profile'] != 'umf.ingress-epoch-provision/0.1':
            raise CustodyJournalError('journal-invalid')
        if payload['requestDigest'] != _digest(request):
            raise CustodyJournalError('journal-invalid')
        for key in ('providerId', 'enrollmentId', 'newEpoch'):
            _uuid(request[key])
        if request['profile'] != 'umf.ingress-epoch-provision/0.1':
            raise CustodyJournalError('journal-invalid')
        for key in ('planDigest', 'fileDigest', 'expectedHead', 'previousSourceDigest',
                    'nextSourceDigest', 'nextBundleDigest'):
            _hex(request[key])
        _text(request['installationId'], 128); _text(request['issuerProfile'], 256)
        custody = request['targetCustody']
        _closed(custody, {'profile', 'custodianId', 'registrationId', 'resourceId',
               'incarnation', 'registrationDigest'})
        if custody['profile'] != 'umf.native-target-custody/0.1':
            raise CustodyJournalError('journal-invalid')
        for key in ('custodianId', 'registrationId', 'resourceId', 'incarnation'):
            _uuid(custody[key])
        _hex(custody['registrationDigest'])
        if (type(request['principals']) is not list or not request['principals']
                or type(request['maximumRoles']) is not int
                or not 1 <= request['maximumRoles'] <= 256
                or request['maximumRoles'] != len(request['principals'])):
            raise CustodyJournalError('journal-invalid')
        for item in request['principals']:
            _closed(item, {'loginName', 'subject', 'audience'})
            _text(item['loginName'], 63)
            _closed(item['subject'], {'oid', 'name'})
            if type(item['subject']['oid']) is not int or not 1 <= item['subject']['oid'] <= 2**32 - 1:
                raise CustodyJournalError('journal-invalid')
            _text(item['subject']['name'], 63)
            if item['audience'] not in ('person', 'batch'):
                raise CustodyJournalError('journal-invalid')
        reservation = payload['reservation']
        _closed(reservation, {'profile', 'id', 'custodianId', 'registrationId', 'incarnation',
               'sequence', 'requestDigest', 'provisioningApprovalDigest', 'parentStateDigest'})
        if reservation['profile'] != 'umf.native-epoch-provision-reservation/0.1':
            raise CustodyJournalError('journal-invalid')
        for key in ('id', 'custodianId', 'registrationId', 'incarnation'):
            _uuid(reservation[key])
        if (type(reservation['sequence']) is not int
                or not 1 <= reservation['sequence'] <= _MAX_SAFE):
            raise CustodyJournalError('journal-invalid')
        for key in ('requestDigest', 'provisioningApprovalDigest', 'parentStateDigest'):
            _hex(reservation[key])
        if (reservation['requestDigest'] != payload['requestDigest']
                or reservation['provisioningApprovalDigest'] != payload['provisioningApprovalDigest']):
            raise CustodyJournalError('journal-invalid')
    elif kind == 'epoch-provision-observation':
        _closed(payload, {'reservationId', 'outcome', 'nativeReceiptDigest'})
        _uuid(payload['reservationId'])
        if payload['outcome'] not in ('pending', 'prepared', 'not-committed'):
            raise CustodyJournalError('journal-invalid')
        _hex(payload['nativeReceiptDigest']) if payload['nativeReceiptDigest'] is not None else None
    elif kind == 'epoch-provision-confirmed':
        _closed(payload, {'reservationId', 'nativeReceiptDigest'})
        _uuid(payload['reservationId']); _hex(payload['nativeReceiptDigest'])
    elif kind == 'transition-reserved':
        _closed(payload, {'reservationId', 'request', 'requestDigest', 'ingressApprovalDigest', 'reservation'})
        _uuid(payload['reservationId']); _hex(payload['requestDigest']); _hex(payload['ingressApprovalDigest'])
        request = payload['request']
        _closed(request, {'profile', 'providerId', 'enrollmentId', 'installationId',
               'targetCustody',
               'targetIdentityDigest', 'planDigest', 'fileDigest', 'expectedHead',
               'previousSourceDigest', 'nextSourceDigest', 'previousBundleDigest',
               'nextBundleDigest', 'oldEpoch', 'newEpoch', 'oldPrincipalsDigest',
               'newPrincipalsDigest', 'approvalDigest', 'executionPolicyDigest'})
        _uuid(request['providerId']); _uuid(request['enrollmentId'])
        if request['profile'] != 'umf.table-generation-ingress/0.1':
            raise CustodyJournalError('journal-invalid')
        if payload['requestDigest'] != _digest(request) or request['oldEpoch'] == request['newEpoch']:
            raise CustodyJournalError('journal-invalid')
        _text(request['installationId'], 128)
        custody = request['targetCustody']
        _closed(custody, {'profile', 'custodianId', 'registrationId', 'resourceId',
               'incarnation', 'registrationDigest'})
        if custody['profile'] != 'umf.native-target-custody/0.1':
            raise CustodyJournalError('journal-invalid')
        for key in ('custodianId', 'registrationId', 'resourceId', 'incarnation'):
            _uuid(custody[key])
        _hex(custody['registrationDigest'])
        for key in ('targetIdentityDigest', 'planDigest', 'fileDigest',
                    'previousSourceDigest', 'nextSourceDigest', 'previousBundleDigest',
                    'nextBundleDigest', 'oldPrincipalsDigest', 'newPrincipalsDigest', 'approvalDigest'):
            _hex(request[key])
        if request['expectedHead'] is not None:
            _hex(request['expectedHead'])
        _hex(request['executionPolicyDigest'])
        _uuid(request['oldEpoch']); _uuid(request['newEpoch'])
        reservation = payload['reservation']
        _closed(reservation, {'profile', 'id', 'custodianId', 'registrationId', 'incarnation',
               'sequence', 'requestDigest', 'ingressApprovalDigest', 'parentStateDigest'})
        if reservation['profile'] != 'umf.native-target-reservation/0.1':
            raise CustodyJournalError('journal-invalid')
        for key in ('id', 'custodianId', 'registrationId', 'incarnation'):
            _uuid(reservation[key])
        sequence = reservation['sequence']
        if type(sequence) is not int or not 1 <= sequence <= _MAX_SAFE:
            raise CustodyJournalError('journal-invalid')
        if (reservation['requestDigest'] != payload['requestDigest']
                or reservation['ingressApprovalDigest'] != payload['ingressApprovalDigest']):
            raise CustodyJournalError('journal-invalid')
        _hex(reservation['requestDigest']); _hex(reservation['ingressApprovalDigest'])
        _hex(reservation['parentStateDigest'])
    elif kind == 'transition-observation':
        _closed(payload, {'reservationId', 'nativeState', 'nativeReceiptDigest'})
        _uuid(payload['reservationId'])
        if payload['nativeState'] not in ('unresolved', 'prepared', 'fenced', 'cutover', 'published'):
            raise CustodyJournalError('journal-invalid')
        _hex(payload['nativeReceiptDigest']) if payload['nativeReceiptDigest'] is not None else None
    elif kind == 'transition-confirmed':
        _closed(payload, {'reservationId', 'nativeReceiptDigest'})
        _uuid(payload['reservationId']); _hex(payload['nativeReceiptDigest'])
    elif profile == JOURNAL_PROFILE_02 and kind == 'originals-store-reserved':
        _closed(payload, {'purpose', 'request', 'approvalDigest', 'reservation',
                          'reservationDigest', 'parent'})
        if payload['purpose'] not in ('production', 'native-acceptance'):
            raise CustodyJournalError('journal-invalid')
        request = payload['request']
        _closed(request, {'profile', 'store', 'evidence'})
        if request['profile'] != 'umf.owner-store-create-intent/0.1':
            raise CustodyJournalError('journal-invalid')
        store = request['store']
        _closed(store, {'profile', 'storeId', 'schemaName'})
        if (store['profile'] != 'umf.native-row-originals-store/0.1'
                or store['schemaName'] != 'umf_originals_' + _uuid(store['storeId']).replace('-', '')):
            raise CustodyJournalError('journal-invalid')
        evidence = request['evidence']
        _closed(evidence, {'profile', 'supervisorId', 'custodianId', 'providerId',
                           'installationId', 'ownerAuthorityId', 'ownerPolicyRevision',
                           'registrationDigest', 'targetCustodyDigest',
                           'authorityPreparationReceiptDigest', 'maintenance',
                           'controller', 'businessOwner', 'requiredMemberships',
                           'requiredSettings', 'nativeAuthorityObservationDigest'})
        if evidence['profile'] != 'umf.pg18.original-store-authority-evidence/0.1':
            raise CustodyJournalError('journal-invalid')
        for key in ('supervisorId', 'custodianId', 'providerId', 'ownerAuthorityId'):
            _uuid(evidence[key])
        for key in ('registrationDigest', 'targetCustodyDigest',
                    'authorityPreparationReceiptDigest', 'nativeAuthorityObservationDigest'):
            _hex(evidence[key])
        _text(evidence['installationId'], 256)
        _text(evidence['ownerPolicyRevision'], 128)
        role_names: list[str] = []
        role_oids: list[int] = []
        role_flags: list[dict[str, bool]] = []
        for role_name in ('maintenance', 'controller', 'businessOwner'):
            role = evidence[role_name]
            _closed(role, {'oid', 'name', 'flags'})
            role_names.append(_text(role['name'], 63))
            role_oids.append(_safe_uint32(role['oid']))
            flags = role['flags']
            _closed(flags, {'canLogin', 'superuser', 'createDatabase',
                            'createRole', 'replication', 'bypassRls', 'inherit'})
            if any(type(flag) is not bool for flag in flags.values()):
                raise CustodyJournalError('journal-invalid')
            role_flags.append(flags)
        if len(set(role_names)) != 3 or len(set(role_oids)) != 3:
            raise CustodyJournalError('journal-invalid')
        expected_flags = [
            {'canLogin': True, 'superuser': True, 'createDatabase': False,
             'createRole': False, 'replication': False, 'bypassRls': False,
             'inherit': False},
            {'canLogin': False, 'superuser': True, 'createDatabase': False,
             'createRole': False, 'replication': False, 'bypassRls': False,
             'inherit': False},
            {'canLogin': False, 'superuser': False, 'createDatabase': False,
             'createRole': False, 'replication': False, 'bypassRls': False,
             'inherit': False},
        ]
        if role_flags != expected_flags:
            raise CustodyJournalError('journal-invalid')
        memberships = evidence['requiredMemberships']
        if type(memberships) is not list or len(memberships) != 2:
            raise CustodyJournalError('journal-invalid')
        expected_memberships = [
            {'memberOid': role_oids[0], 'roleOid': role_oids[1],
             'inherit': False, 'set': True, 'admin': False},
            {'memberOid': role_oids[0], 'roleOid': role_oids[2],
             'inherit': False, 'set': True, 'admin': False},
        ]
        for membership in memberships:
            _closed(membership, {'memberOid', 'roleOid', 'inherit', 'set', 'admin'})
        if memberships != expected_memberships:
            raise CustodyJournalError('journal-invalid')
        settings = evidence['requiredSettings']
        _closed(settings, {'searchPath', 'timeZone', 'rowSecurity',
                           'sessionReplicationRole', 'transactionReadOnly',
                           'transactionIsolation'})
        if settings != {'searchPath': 'pg_catalog', 'timeZone': 'UTC',
                        'rowSecurity': 'on', 'sessionReplicationRole': 'origin',
                        'transactionReadOnly': 'off',
                        'transactionIsolation': 'read committed'}:
            raise CustodyJournalError('journal-invalid')
        reservation = payload['reservation']
        _closed(reservation, {'profile', 'reservationId', 'providerId', 'installationId',
                              'targetCustody', 'store', 'creationRequestDigest',
                              'creationApprovalDigest', 'nativeAuthorityEvidenceDigest',
                              'configurationDigest', 'custodySequence'})
        if reservation['profile'] != 'umf.row-originals-store-reservation/0.1':
            raise CustodyJournalError('journal-invalid')
        _uuid(reservation['reservationId']); _uuid(reservation['providerId'])
        _text(reservation['installationId'], 256)
        custody = reservation['targetCustody']
        _closed(custody, {'profile', 'custodianId', 'registrationId', 'resourceId',
                          'incarnation', 'registrationDigest'})
        if custody['profile'] != 'umf.native-target-custody/0.1':
            raise CustodyJournalError('journal-invalid')
        for key in ('custodianId', 'registrationId', 'resourceId', 'incarnation'):
            _text(custody[key], 256)
        _hex(custody['registrationDigest'])
        _closed(reservation['store'], {'profile', 'storeId', 'schemaName'})
        for key in ('creationRequestDigest', 'creationApprovalDigest',
                    'nativeAuthorityEvidenceDigest', 'configurationDigest'):
            _hex(reservation[key])
        if (type(reservation['custodySequence']) is not int
                or not 1 <= reservation['custodySequence'] <= _MAX_SAFE
                or reservation['providerId'] != store['storeId']
                or reservation['store'] != store
                or reservation['creationRequestDigest'] != _digest(request)
                or reservation['creationApprovalDigest'] != payload['approvalDigest']
                or reservation['nativeAuthorityEvidenceDigest'] != evidence['nativeAuthorityObservationDigest']
                or reservation['installationId'] != evidence['installationId']
                or reservation['providerId'] != evidence['providerId']
                or custody['custodianId'] != evidence['custodianId']
                or reservation['targetCustody'] != custody
                or evidence['targetCustodyDigest'] != _digest(custody)):
            raise CustodyJournalError('journal-invalid')
        _hex(payload['approvalDigest']); _hex(payload['reservationDigest'])
        if payload['reservationDigest'] != _digest(reservation):
            raise CustodyJournalError('journal-invalid')
        parent = payload['parent']
        _closed(parent, {'sequence', 'headDigest'})
        if (type(parent['sequence']) is not int or parent['sequence'] < 0
                or parent['sequence'] > _MAX_SAFE):
            raise CustodyJournalError('journal-invalid')
        _hex(parent['headDigest'])
    elif profile == JOURNAL_PROFILE_02 and kind == 'originals-store-observation':
        _closed(payload, {'purpose', 'reservationId', 'reservationDigest',
                          'supervisorIntentDigest', 'outcome', 'nativeReceipt',
                          'nativeReceiptDigest', 'schemaOid', 'nativeObservationDigest',
                          'transactionOutcomeDigest', 'parent'})
        if payload['purpose'] not in ('production', 'native-acceptance'):
            raise CustodyJournalError('journal-invalid')
        _uuid(payload['reservationId'])
        for key in ('reservationDigest', 'supervisorIntentDigest',
                    'nativeObservationDigest', 'transactionOutcomeDigest'):
            _hex(payload[key])
        if payload['outcome'] not in ('committed', 'known-aborted', 'unknown'):
            raise CustodyJournalError('journal-invalid')
        if payload['outcome'] == 'committed':
            if (type(payload['nativeReceipt']) is not dict
                    or type(payload['nativeReceiptDigest']) is not str
                    or type(payload['schemaOid']) is not int
                    or not 1 <= payload['schemaOid'] <= 2**32 - 1):
                raise CustodyJournalError('journal-invalid')
            from .row_originals_creation import canonical_bytes, validate_receipt
            receipt = validate_receipt(payload['nativeReceipt'])
            if (canonical_bytes(receipt) != canonical_bytes(payload['nativeReceipt'])
                    or payload['nativeReceiptDigest'] != _digest(receipt)
                    or receipt['schemaOid'] != payload['schemaOid']):
                raise CustodyJournalError('journal-invalid')
        elif any(payload[key] is not None for key in
                 ('nativeReceipt', 'nativeReceiptDigest', 'schemaOid')):
            raise CustodyJournalError('journal-invalid')
        parent = payload['parent']
        _closed(parent, {'sequence', 'headDigest'})
        if type(parent['sequence']) is not int or parent['sequence'] < 0:
            raise CustodyJournalError('journal-invalid')
        _hex(parent['headDigest'])
    elif profile == JOURNAL_PROFILE_02 and kind == 'originals-store-confirmed':
        _closed(payload, {'purpose', 'reservationId', 'reservationDigest',
                          'supervisorIntentDigest', 'observationEventDigest',
                          'nativeReceiptDigest', 'schemaOid'})
        if payload['purpose'] not in ('production', 'native-acceptance'):
            raise CustodyJournalError('journal-invalid')
        _uuid(payload['reservationId'])
        for key in ('reservationDigest', 'supervisorIntentDigest',
                    'observationEventDigest', 'nativeReceiptDigest'):
            _hex(payload[key])
        if type(payload['schemaOid']) is not int or not 1 <= payload['schemaOid'] <= 2**32 - 1:
            raise CustodyJournalError('journal-invalid')
    else:
        raise CustodyJournalError('journal-invalid')
    _canonical(payload)
    return payload


def _replay(events: list[dict[str, Any]], *, profile: str = JOURNAL_PROFILE) -> dict[str, Any]:
    """Validate append ordering and return state; pending intents are retained."""
    state: dict[str, Any] = {'registration': None, 'provision': None, 'transition': None}
    if profile == JOURNAL_PROFILE_02:
        state['stores'] = {}
    operation_ids: set[tuple[str, str]] = set()
    for event in events:
        kind, payload = event['kind'], event['payload']
        category = ('registration' if kind.startswith('registration-') else
                    'provision' if kind.startswith('epoch-provision-') else
                    'store' if kind.startswith('originals-store-') else 'transition')
        if category == 'store' and profile != JOURNAL_PROFILE_02:
            raise CustodyJournalError('journal-invalid')
        operation_id = payload.get('registrationId' if category == 'registration' else
                                   'reservationId')
        if category == 'provision' and kind == 'epoch-provision-reserved':
            operation_id = payload['reservation']['id']
        if category == 'store' and kind == 'originals-store-reserved':
            operation_id = payload['reservation']['reservationId']
        if kind.endswith(('intent', 'reserved')):
            marker = (category, operation_id)
            if marker in operation_ids:
                raise CustodyJournalError('journal-order-invalid')
            operation_ids.add(marker)
        if category == 'store':
            parent = payload.get('parent')
            if (parent is not None
                    and (parent.get('sequence') != event['sequence'] - 1
                         or parent.get('headDigest') != event['previousDigest'])):
                raise CustodyJournalError('journal-order-invalid')
            if kind == 'originals-store-reserved':
                if (state['registration'] is None
                        or state['registration']['status'] != 'confirmed'
                        or state['provision'] is not None
                        and state['provision']['status'] != 'confirmed'
                        or state['transition'] is not None
                        and state['transition']['status'] != 'confirmed'):
                    raise CustodyJournalError('journal-order-invalid')
                key = tuple(payload['reservation']['targetCustody'][field]
                            for field in ('registrationId',)) + (
                    payload['reservation']['providerId'],
                    payload['reservation']['installationId'],
                    payload['reservation']['store']['profile'],
                    payload['reservation']['store']['storeId'],
                    payload['reservation']['store']['schemaName'])
                if (payload['reservation']['targetCustody'] != state['registration']['custody']
                        or key in state['stores'] or len(state['stores']) >= 256
                        or any(item['status'] != 'confirmed'
                               for item in state['stores'].values())):
                    raise CustodyJournalError('journal-order-invalid')
                state['stores'][key] = {
                    'id': payload['reservation']['reservationId'], 'key': key,
                    'status': 'reserved', 'purpose': payload['purpose'],
                    'request': payload['request'], 'reservation': payload['reservation'],
                    'reservationDigest': payload['reservationDigest'],
                    'approvalDigest': payload['approvalDigest'], 'observations': [],
                }
            elif kind == 'originals-store-observation':
                current = next((item for item in state['stores'].values()
                                if item['id'] == payload['reservationId']), None)
                prior_intent_digest = (current.get('observedSupervisorIntentDigest')
                                       if current is not None else None)
                if (current is None or current['status'] not in ('reserved', 'observed-committed')
                        or current['purpose'] != payload['purpose']
                        or current['reservationDigest'] != payload['reservationDigest']
                        or prior_intent_digest is not None
                        and prior_intent_digest != payload['supervisorIntentDigest']):
                    raise CustodyJournalError('journal-order-invalid')
                if current['status'] == 'observed-committed':
                    raise CustodyJournalError('journal-order-invalid')
                current['observedSupervisorIntentDigest'] = payload['supervisorIntentDigest']
                current['observations'].append({
                    'eventDigest': event['recordDigest'], 'payload': payload})
                if payload['outcome'] == 'committed':
                    receipt = payload['nativeReceipt']
                    reservation = current['reservation']
                    if (receipt['profile'] != 'umf.originals-creation-receipt/0.1'
                            or receipt['providerId'] != reservation['providerId']
                            or receipt['installationId'] != reservation['installationId']
                            or receipt['storeProfile'] != reservation['store']['profile']
                            or receipt['storeId'] != reservation['store']['storeId']
                            or receipt['reservationDigest'] != current['reservationDigest']
                            or receipt['creationRequestDigest']
                                != reservation['creationRequestDigest']
                            or receipt['creationApprovalDigest']
                                != reservation['creationApprovalDigest']
                            or receipt['targetCustodyDigest']
                                != _digest(reservation['targetCustody'])
                            or receipt['schemaOid'] != payload['schemaOid']
                            or receipt['state'] != 'created'):
                        raise CustodyJournalError('journal-order-invalid')
                    current.update(status='observed-committed',
                                   observedSupervisorIntentDigest=payload['supervisorIntentDigest'],
                                   nativeReceiptDigest=payload['nativeReceiptDigest'],
                                   schemaOid=payload['schemaOid'])
            elif kind == 'originals-store-confirmed':
                current = next((item for item in state['stores'].values()
                                if item['id'] == payload['reservationId']), None)
                if (current is None or current['status'] != 'observed-committed'
                        or current['purpose'] != payload['purpose']
                        or current['reservationDigest'] != payload['reservationDigest']
                        or current['observedSupervisorIntentDigest']
                            != payload['supervisorIntentDigest']
                        or current['observations'][-1]['eventDigest']
                            != payload['observationEventDigest']
                        or current['nativeReceiptDigest'] != payload['nativeReceiptDigest']
                        or current['schemaOid'] != payload['schemaOid']):
                    raise CustodyJournalError('journal-order-invalid')
                current['status'] = 'confirmed'
            continue
        if kind == 'registration-intent':
            if state['registration'] is not None:
                raise CustodyJournalError('journal-order-invalid')
            state['registration'] = {'id': payload['registrationId'], 'status': 'intent'}
        elif kind == 'registration-observation':
            current = state['registration']
            if (current is None or current['status'] not in ('intent', 'observed', 'confirmed')
                    or current['id'] != payload['registrationId']):
                raise CustodyJournalError('journal-order-invalid')
            prior_observation = current.get('observation')
            if (prior_observation is not None
                    and payload['observation']['custodianSequence'] < prior_observation['custodianSequence']):
                raise CustodyJournalError('journal-sequence-rewound')
            current['observation'] = payload['observation']
            if current['status'] != 'confirmed':
                current['status'] = 'observed'
        elif kind == 'registration-confirmed':
            current = state['registration']
            if current is None or current['status'] != 'observed' or current['id'] != payload['registrationId']:
                raise CustodyJournalError('journal-order-invalid')
            current.update(status='confirmed', custody=payload['targetCustody'])
        elif kind == 'epoch-provision-reserved':
            current = state['provision']
            if (state['registration'] is None or state['registration']['status'] != 'confirmed'
                    or current and current['status'] != 'confirmed'
                    or profile == JOURNAL_PROFILE_02
                    and any(item['status'] != 'confirmed' for item in state['stores'].values())):
                raise CustodyJournalError('journal-order-invalid')
            if payload['request']['targetCustody'] != state['registration']['custody']:
                raise CustodyJournalError('journal-order-invalid')
            reservation_id = payload['reservation']['id']
            state['provision'] = {'id': reservation_id, 'status': 'reserved', 'request': payload['request'],
                                  'reservation': payload['reservation']}
        elif kind == 'epoch-provision-observation':
            current = state['provision']
            if (current is None or current['id'] != payload['reservationId']
                    or current['status'] not in ('reserved', 'observed')):
                raise CustodyJournalError('journal-order-invalid')
            if current.get('outcome') == 'prepared' and payload['outcome'] != 'prepared':
                raise CustodyJournalError('journal-order-invalid')
            current.update(status='observed', outcome=payload['outcome'], receipt=payload['nativeReceiptDigest'])
        elif kind == 'epoch-provision-confirmed':
            current = state['provision']
            if (current is None or current['id'] != payload['reservationId']
                    or current['status'] != 'observed' or current['outcome'] != 'prepared'
                    or current['receipt'] != payload['nativeReceiptDigest']):
                raise CustodyJournalError('journal-order-invalid')
            current['status'] = 'confirmed'
        elif kind == 'transition-reserved':
            current = state['transition']
            if (state['provision'] is None or state['provision']['status'] != 'confirmed'
                    or current and current['status'] != 'confirmed'
                    or profile == JOURNAL_PROFILE_02
                    and any(item['status'] != 'confirmed' for item in state['stores'].values())):
                raise CustodyJournalError('journal-order-invalid')
            if payload['request']['targetCustody'] != state['registration']['custody']:
                raise CustodyJournalError('journal-order-invalid')
            state['transition'] = {'id': payload['reservationId'], 'status': 'reserved', 'request': payload['request']}
        elif kind == 'transition-observation':
            current = state['transition']
            if (current is None or current['id'] != payload['reservationId']
                    or current['status'] not in ('reserved', 'observed')):
                raise CustodyJournalError('journal-order-invalid')
            order = {'unresolved': 0, 'prepared': 1, 'fenced': 2, 'cutover': 3, 'published': 4}
            if (current.get('nativeState') is not None
                    and order[payload['nativeState']] < order[current['nativeState']]):
                raise CustodyJournalError('journal-order-invalid')
            current.update(status='observed', nativeState=payload['nativeState'], receipt=payload['nativeReceiptDigest'])
        elif kind == 'transition-confirmed':
            current = state['transition']
            if (current is None or current['id'] != payload['reservationId']
                    or current['status'] != 'observed'
                    or current['nativeState'] not in ('fenced', 'cutover', 'published')
                    or current['receipt'] != payload['nativeReceiptDigest']):
                raise CustodyJournalError('journal-order-invalid')
            current['status'] = 'confirmed'
    return state


def validate_original_target_custody_record(raw: bytes,
                                           birth: dict[str, Any]) -> dict[str, Any]:
    """Validate a 0.2 chain against an already resolved original birth."""
    if type(raw) is not bytes or not 1 <= len(raw) <= _MAX_BYTES:
        raise CustodyJournalError('journal-corrupt')
    doc = _read_json(raw)
    _closed(doc, {'profile', 'custodianId', 'sequence', 'headDigest', 'events'})
    if (doc['profile'] != JOURNAL_PROFILE_02
            or doc['custodianId'] != birth.get('custodianId')
            or type(doc['events']) is not list or len(doc['events']) > _MAX_EVENTS
            or type(doc['sequence']) is not int
            or doc['sequence'] != len(doc['events'])):
        raise CustodyJournalError('journal-corrupt')
    initial = {'profile': JOURNAL_PROFILE_02,
               'custodianId': birth['custodianId'], 'sequence': 0,
               'headDigest': '0' * 64, 'events': []}
    if hashlib.sha256(_canonical(initial)).hexdigest() != birth.get('initialHeaderDigest'):
        raise CustodyJournalError('journal-origin-unverified')
    previous = '0' * 64
    for index, event in enumerate(doc['events'], 1):
        _closed(event, {'sequence', 'kind', 'payload', 'previousDigest', 'recordDigest'})
        if (type(event['sequence']) is not int or event['sequence'] != index
                or event['previousDigest'] != previous
                or event['kind'] not in _KINDS_02):
            raise CustodyJournalError('journal-corrupt')
        _validate_event_payload(event['kind'], event['payload'], profile=JOURNAL_PROFILE_02)
        unhashed = {key: event[key] for key in
                    ('sequence', 'kind', 'payload', 'previousDigest')}
        if event['recordDigest'] != _digest(unhashed):
            raise CustodyJournalError('journal-corrupt')
        previous = event['recordDigest']
    if doc['headDigest'] != previous or raw != _canonical(doc):
        raise CustodyJournalError('journal-corrupt')
    _replay(doc['events'], profile=JOURNAL_PROFILE_02)
    return doc

class ExternalCustodyJournal:
    """Private append journal; it cannot detect replacement by an older copy alone.

    The enrolled native owner/controller must compare this sequence against its
    independently retained original custody chain before issuing capabilities.
    """

    __slots__ = ('_birth_bytes', '_birth_handle', '_context', '_custodian_id',
                 '_issuer', '_lock_path', '_path', '_profile', '_resolver',
                 '_supervisor')

    def __init__(self, path: str | os.PathLike[str], custodian_id: str):
        self._path = Path(path)
        self._lock_path = self._path.with_name(self._path.name + '.lock')
        self._custodian_id = _text(custodian_id, 256)
        self._profile = JOURNAL_PROFILE
        self._birth_bytes = None
        self._birth_handle = None
        self._context = None
        self._issuer = None
        self._resolver = None
        self._supervisor = None
        parent = self._path.parent
        if not parent.is_absolute() or os.path.normpath(str(parent)) != str(parent):
            raise CustodyJournalError('journal-directory-unsafe')
        try:
            st = os.lstat(parent)
        except OSError:
            raise CustodyJournalError('journal-directory-unavailable') from None
        if (not stat.S_ISDIR(st.st_mode) or stat.S_ISLNK(st.st_mode)
                or st.st_uid != os.geteuid() or stat.S_IMODE(st.st_mode) & 0o077
                or any(part.is_symlink() for part in (parent, *parent.parents))):
            raise CustodyJournalError('journal-directory-unsafe')

    @classmethod
    def _open_original_02(cls, birth_handle: object, *, resolver: _OwnerRegistrationResolver,
                          control_lease: object,
                          operation_kind: str) -> ExternalCustodyJournal:
        """Open only the bootstrap-selected original 0.2 journal under its lease."""
        from .owner_bootstrap import _resolve_original_target_custody_journal_birth
        if type(resolver) is not _OwnerRegistrationResolver:
            raise CustodyJournalError('journal-origin-unverified')
        try:
            if operation_kind not in ('registration-apply', 'registration-recover', 'store'):
                raise CustodyJournalError('journal-origin-unverified')
            resolver.require_control_lease(control_lease, operation_kind=operation_kind)
            descriptor = _resolve_original_target_custody_journal_birth(
                birth_handle, issuer=resolver.adapter._bootstrap_issuer,
                context=resolver._context,
                supervisor=resolver.adapter, control_lease=control_lease)
        except Exception:  # noqa: BLE001 - redact bootstrap details at journal boundary
            raise CustodyJournalError('journal-origin-unverified') from None
        path = Path(descriptor['path'])
        parent = path.parent
        try:
            st = os.lstat(parent)
        except OSError:
            raise CustodyJournalError('journal-directory-unavailable') from None
        if (not stat.S_ISDIR(st.st_mode) or stat.S_ISLNK(st.st_mode)
                or st.st_uid != os.geteuid() or stat.S_IMODE(st.st_mode) & 0o077
                or any(part.is_symlink() for part in (parent, *parent.parents))):
            raise CustodyJournalError('journal-directory-unsafe')
        journal = object.__new__(cls)
        journal._path = path
        journal._lock_path = Path(descriptor['lockPath'])
        journal._custodian_id = _uuid(descriptor['custodianId'])
        journal._profile = JOURNAL_PROFILE_02
        journal._birth_bytes = _canonical(descriptor)
        journal._birth_handle = birth_handle
        journal._context = resolver._context
        journal._issuer = resolver.adapter._bootstrap_issuer
        journal._resolver = resolver
        journal._supervisor = resolver.adapter
        return journal

    def _verify_original_birth(self) -> dict[str, Any]:
        if self._profile != JOURNAL_PROFILE_02:
            raise CustodyJournalError('journal-origin-unverified')
        from .owner_bootstrap import _resolve_original_target_custody_journal_birth
        try:
            lease = self._supervisor._require_original_control_lease()
            descriptor = _resolve_original_target_custody_journal_birth(
                self._birth_handle, issuer=self._issuer, context=self._context,
                supervisor=self._supervisor, control_lease=lease)
        except Exception:  # noqa: BLE001 - every missing/changed binding refuses
            raise CustodyJournalError('journal-origin-unverified') from None
        if _canonical(descriptor) != self._birth_bytes:
            raise CustodyJournalError('journal-origin-unverified')
        return descriptor

    def _read(self) -> dict[str, Any]:
        if self._profile == JOURNAL_PROFILE_02:
            self._verify_original_birth()
        try:
            fd = os.open(self._path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
        except FileNotFoundError:
            if self._profile == JOURNAL_PROFILE_02:
                raise CustodyJournalError('journal-unavailable') from None
            return {'profile': JOURNAL_PROFILE, 'custodianId': self._custodian_id,
                    'sequence': 0, 'headDigest': '0' * 64, 'events': []}
        except OSError:
            raise CustodyJournalError('journal-unavailable') from None
        try:
            st = os.fstat(fd)
            if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid != os.geteuid()
                    or stat.S_IMODE(st.st_mode) & 0o077 or st.st_size > _MAX_BYTES):
                raise CustodyJournalError('journal-unsafe')
            if self._profile == JOURNAL_PROFILE_02:
                path_st = os.lstat(self._path)
                if (not stat.S_ISREG(path_st.st_mode) or stat.S_ISLNK(path_st.st_mode)
                        or path_st.st_uid != os.geteuid() or path_st.st_nlink != 1
                        or stat.S_IMODE(path_st.st_mode) != 0o600
                        or (path_st.st_dev, path_st.st_ino) != (st.st_dev, st.st_ino)):
                    raise CustodyJournalError('journal-unsafe')
            chunks = bytearray()
            while len(chunks) <= _MAX_BYTES:
                chunk = os.read(fd, min(65536, _MAX_BYTES + 1 - len(chunks)))
                if not chunk:
                    break
                chunks.extend(chunk)
            if len(chunks) > _MAX_BYTES:
                raise CustodyJournalError('journal-capacity')
            # Re-observation after an interrupted replace fsyncs the visible
            # inode and parent entry before any capability may be reissued.
            os.fsync(fd)
        except OSError:
            raise CustodyJournalError('journal-read-failed') from None
        finally:
            os.close(fd)
        try:
            dirfd = os.open(self._path.parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
            try:
                os.fsync(dirfd)
            finally:
                os.close(dirfd)
        except OSError:
            raise CustodyJournalError('journal-durability-unverified') from None
        doc = _read_json(bytes(chunks))
        _closed(doc, {'profile', 'custodianId', 'sequence', 'headDigest', 'events'})
        if (doc['profile'] != self._profile or doc['custodianId'] != self._custodian_id
                or type(doc['events']) is not list or len(doc['events']) > _MAX_EVENTS):
            raise CustodyJournalError('journal-corrupt')
        allowed_kinds = _KINDS_02 if self._profile == JOURNAL_PROFILE_02 else _KINDS
        previous = '0' * 64
        for index, event in enumerate(doc['events'], 1):
            _closed(event, {'sequence', 'kind', 'payload', 'previousDigest', 'recordDigest'})
            if (type(event['sequence']) is not int or event['sequence'] != index
                    or event['previousDigest'] != previous or event['kind'] not in allowed_kinds):
                raise CustodyJournalError('journal-corrupt')
            _validate_event_payload(event['kind'], event['payload'], profile=self._profile)
            unhashed = {key: event[key] for key in ('sequence', 'kind', 'payload', 'previousDigest')}
            if event['recordDigest'] != _digest(unhashed):
                raise CustodyJournalError('journal-corrupt')
            previous = event['recordDigest']
        if (type(doc['sequence']) is not int or doc['sequence'] != len(doc['events'])
                or doc['headDigest'] != previous):
            raise CustodyJournalError('journal-corrupt')
        _replay(doc['events'], profile=self._profile)
        return doc

    @contextmanager
    def _locked(self) -> Iterator[int]:
        flags = os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0)
        if self._profile == JOURNAL_PROFILE:
            flags |= os.O_CREAT
        try:
            fd = os.open(self._lock_path, flags, 0o600)
            if self._profile == JOURNAL_PROFILE:
                os.fchmod(fd, 0o600)
            st = os.fstat(fd)
            if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid != os.geteuid():
                raise CustodyJournalError('journal-lock-unsafe')
            if self._profile == JOURNAL_PROFILE_02:
                path_st = os.lstat(self._lock_path)
                if (not stat.S_ISREG(path_st.st_mode) or stat.S_ISLNK(path_st.st_mode)
                        or path_st.st_uid != os.geteuid() or path_st.st_nlink != 1
                        or stat.S_IMODE(path_st.st_mode) != 0o600
                        or (path_st.st_dev, path_st.st_ino) != (st.st_dev, st.st_ino)):
                    raise CustodyJournalError('journal-lock-unsafe')
            fcntl.flock(fd, fcntl.LOCK_EX)
        except CustodyJournalError:
            if 'fd' in locals():
                os.close(fd)
            raise
        except OSError:
            if 'fd' in locals():
                os.close(fd)
            raise CustodyJournalError('journal-lock-unavailable') from None
        try:
            yield fd
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)

    def _append(self, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Internal trusted-adapter seam; never accept a caller authorization here."""
        allowed_kinds = _KINDS_02 if self._profile == JOURNAL_PROFILE_02 else _KINDS
        if kind not in allowed_kinds:
            raise CustodyJournalError('journal-invalid')
        payload = _validate_event_payload(kind, payload, profile=self._profile)
        with self._locked():
            doc = self._read()
            if len(doc['events']) >= _MAX_EVENTS:
                raise CustodyJournalError('journal-capacity')
            if kind == 'originals-store-reserved':
                if (payload['parent'] != {'sequence': doc['sequence'],
                                          'headDigest': doc['headDigest']}
                        or payload['reservation']['custodySequence'] != doc['sequence'] + 1):
                    raise CustodyJournalError('journal-state-mismatch')
            elif kind == 'originals-store-observation':
                if payload['parent'] != {'sequence': doc['sequence'],
                                         'headDigest': doc['headDigest']}:
                    raise CustodyJournalError('journal-state-mismatch')
            if kind in ('epoch-provision-reserved', 'transition-reserved'):
                reservation_key = 'reservation'
                reservation = payload[reservation_key]
                if (reservation['sequence'] != doc['sequence'] + 1
                        or reservation['parentStateDigest'] != doc['headDigest']):
                    raise CustodyJournalError('journal-state-mismatch')
            event = {'sequence': doc['sequence'] + 1, 'kind': kind, 'payload': payload,
                     'previousDigest': doc['headDigest']}
            event['recordDigest'] = _digest(event)
            events = [*doc['events'], event]
            _replay(events, profile=self._profile)
            updated = {'profile': self._profile, 'custodianId': self._custodian_id,
                       'sequence': event['sequence'], 'headDigest': event['recordDigest'],
                       'events': events}
            data = _canonical(updated)
            self._replace(data)
            return {'sequence': event['sequence'], 'recordDigest': event['recordDigest'],
                    'headDigest': event['recordDigest']}

    def _reserve_originals_store(self, *, purpose: str, request: dict[str, Any],
                                 approval_digest: str,
                                 reservation: dict[str, Any]) -> dict[str, Any]:
        if self._profile != JOURNAL_PROFILE_02:
            raise CustodyJournalError('journal-profile-mismatch')
        parent_doc = self._load()
        original = dict(reservation)
        original['custodySequence'] = parent_doc['sequence'] + 1
        payload = {'purpose': purpose, 'request': request,
                   'approvalDigest': approval_digest, 'reservation': original,
                   'reservationDigest': _digest(original),
                   'parent': {'sequence': parent_doc['sequence'],
                              'headDigest': parent_doc['headDigest']}}
        return self._append('originals-store-reserved', payload)

    def _observe_originals_store(self, *, purpose: str, reservation_id: str,
                                 reservation_digest: str, supervisor_intent_digest: str,
                                 outcome: str, native_receipt: dict[str, Any] | None,
                                 native_receipt_digest: str | None, schema_oid: int | None,
                                 native_observation_digest: str,
                                 transaction_outcome_digest: str) -> dict[str, Any]:
        if self._profile != JOURNAL_PROFILE_02:
            raise CustodyJournalError('journal-profile-mismatch')
        parent_doc = self._load()
        payload = {
            'purpose': purpose, 'reservationId': reservation_id,
            'reservationDigest': reservation_digest,
            'supervisorIntentDigest': supervisor_intent_digest,
            'outcome': outcome, 'nativeReceipt': native_receipt,
            'nativeReceiptDigest': native_receipt_digest, 'schemaOid': schema_oid,
            'nativeObservationDigest': native_observation_digest,
            'transactionOutcomeDigest': transaction_outcome_digest,
            'parent': {'sequence': parent_doc['sequence'],
                       'headDigest': parent_doc['headDigest']},
        }
        return self._append('originals-store-observation', payload)

    def _confirm_originals_store(self, *, purpose: str, reservation_id: str,
                                 reservation_digest: str, supervisor_intent_digest: str,
                                 observation_event_digest: str,
                                 native_receipt_digest: str, schema_oid: int) -> dict[str, Any]:
        if self._profile != JOURNAL_PROFILE_02:
            raise CustodyJournalError('journal-profile-mismatch')
        return self._append('originals-store-confirmed', {
            'purpose': purpose, 'reservationId': reservation_id,
            'reservationDigest': reservation_digest,
            'supervisorIntentDigest': supervisor_intent_digest,
            'observationEventDigest': observation_event_digest,
            'nativeReceiptDigest': native_receipt_digest, 'schemaOid': schema_oid,
        })

    def _replace(self, data: bytes) -> None:
        parent = self._path.parent
        fd = -1
        temporary = None
        try:
            fd, temporary = tempfile.mkstemp(prefix='.custody-', dir=parent)
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, 'wb', closefd=True) as stream:
                fd = -1
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self._path)
            temporary = None
            dirfd = os.open(parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
            try:
                os.fsync(dirfd)
            finally:
                os.close(dirfd)
        except OSError:
            raise CustodyJournalError('journal-write-failed') from None
        finally:
            if fd >= 0:
                os.close(fd)
            if temporary is not None:
                try:
                    os.unlink(temporary)
                except OSError:
                    pass

    def snapshot(self) -> dict[str, Any]:
        """Return only non-secret journal state for diagnostics; payloads stay private."""
        doc = self._load()
        state = _replay(doc['events'], profile=self._profile)
        pending = {key: value['id'] for key, value in state.items()
                   if key != 'stores' and value is not None
                   and value['status'] != 'confirmed'}
        if self._profile == JOURNAL_PROFILE_02:
            pending['stores'] = sorted(
                value['id'] for value in state['stores'].values()
                if value['status'] != 'confirmed')
        return {'profile': self._profile, 'custodianId': self._custodian_id,
                'sequence': doc['sequence'], 'headDigest': doc['headDigest'],
                'pending': pending}

    def _load(self) -> dict[str, Any]:
        with self._locked():
            return self._read()

class LocalTargetCustodian:
    """External journal plus identity-bound custody handle issuance.

    The constructor is private-bootstrap-only.  The enrolled adapter must
    resolve an original owner request and return object-bound native evidence;
    this file journal cannot establish physical target ownership on its own.
    """

    __slots__ = ('_handles', '_issuer', '_journal', '_resolver', 'custodian_id', 'provider_id')

    def __init__(self, seal: object, journal: ExternalCustodyJournal,
                 custodian_id: str, provider_id: str,
                 resolver: _OwnerRegistrationResolver):
        if (seal is not _CUSTODY_SEAL or type(journal) is not ExternalCustodyJournal
                or type(resolver) is not _OwnerRegistrationResolver):
            raise TypeError('local target custodian requires trusted host bootstrap')
        self._journal = journal
        self.custodian_id = _uuid(custodian_id)
        self.provider_id = _uuid(provider_id)
        self._resolver = resolver
        self._issuer = object()
        self._handles: dict[int, tuple[object, _VerifiedTargetCustody]] = {}

    def register_target(self, owner_enrollment: object, *, control_lease: object) -> object:
        from .generation_ingress import OwnerEnrollmentRequest, TargetCustody

        self._resolver.require_control_lease(
            control_lease, operation_kind='registration-apply')
        if type(owner_enrollment) is not OwnerEnrollmentRequest:
            raise CustodyJournalError('owner-enrollment-required')
        evidence = self._resolver.resolve(owner_enrollment, self.custodian_id, self.provider_id)
        payload = evidence.payload
        _validate_owner_payload(payload)
        if payload['custodianId'] != self.custodian_id or payload['providerId'] != self.provider_id:
            raise CustodyJournalError('owner-registration-mismatch')
        registration_id = payload['registrationId']
        document = self._journal._load()
        current = _replay(document['events'])['registration']
        if current is None:
            # An original durable intent is recorded before any subsequent
            # provider enrollment operation.  It is never replaced on restart.
            _validate_observation(evidence.observation, payload)
            approval = payload['ownerApproval']
            expected_intent = {
                'registrationId': registration_id,
                'registrationDigest': evidence.observation['registrationDigest'],
                'ownerPayload': payload,
                'ownerApproval': {'approvalId': approval['approvalId'],
                                  'approvalDigest': approval['approvalDigest']},
            }
            try:
                self._resolver.require_control_lease(
                    control_lease, operation_kind='registration-apply')
                self._journal._append('registration-intent', expected_intent)
            except CustodyJournalError:
                # The atomic replace may have completed before its acknowledgement
                # was lost.  Reconcile only the same original intent; never retry
                # with a new registration identity.
                observed = self._journal._load()
                intents = [event['payload'] for event in observed['events']
                           if event['kind'] == 'registration-intent']
                if intents != [expected_intent]:
                    raise
            document = self._journal._load()
            current = _replay(document['events'])['registration']
        else:
            original_intent = next(event['payload'] for event in document['events']
                                   if event['kind'] == 'registration-intent')
            if (current['id'] != registration_id
                    or original_intent['ownerPayload'] != payload):
                raise CustodyJournalError('registration-original-outcome-unresolved')
        intent = next(event['payload'] for event in document['events']
                      if event['kind'] == 'registration-intent')
        fresh = self._resolver.observe_original(owner_enrollment, intent['ownerPayload'],
                                               document['sequence'])
        self._check_fresh_observation(fresh, document, payload, intent['registrationDigest'])

        observation = fresh.observation
        observation_event = {'registrationId': registration_id, 'observation': observation}
        try:
            self._resolver.require_control_lease(
                control_lease, operation_kind='registration-apply')
            self._journal._append('registration-observation', observation_event)
        except CustodyJournalError:
            observed = self._journal._load()
            matching = [event['payload'] for event in observed['events']
                        if event['kind'] == 'registration-observation'
                        and event['payload'] == observation_event]
            if not matching:
                raise
        latest = _replay(self._journal._load()['events'])['registration']
        reference = {
            'profile': 'umf.native-target-custody/0.1',
            'custodianId': self.custodian_id,
            'registrationId': registration_id,
            'resourceId': payload['origin']['clusterId'],
            'incarnation': payload['origin']['incarnationId'],
            'registrationDigest': observation['registrationDigest'],
        }
        if latest['status'] != 'confirmed':
            confirmation = {
                'registrationId': registration_id, 'targetCustody': reference,
            }
            try:
                self._resolver.require_control_lease(
                    control_lease, operation_kind='registration-apply')
                self._journal._append('registration-confirmed', confirmation)
            except CustodyJournalError:
                observed = self._journal._load()
                confirmations = [event['payload'] for event in observed['events']
                                 if event['kind'] == 'registration-confirmed']
                if confirmations != [confirmation]:
                    raise
                raise CustodyJournalError('registration-confirmation-outcome-unknown') from None
        handle = TargetCustody(_target_capability_seal(), self._issuer,
                               'umf.native-target-custody/0.1')
        verified = _VerifiedTargetCustody(_CUSTODY_SEAL, self, payload,
                                          fresh.native_attestation, reference)
        self._handles[id(handle)] = (handle, verified)
        self._resolver.require_control_lease(
            control_lease, operation_kind='registration-apply')
        return handle

    def reattach_confirmed_target(self, owner_enrollment: object, *,
                                  control_lease: object) -> object:
        """Reissue volatile custody for the exact already-confirmed registration.

        This recovery path is deliberately read-only: it requires the original
        intent and confirmation in the journal, re-resolves the exact owner
        request, and obtains a fresh native observation.  It never appends an
        observation or confirmation and cannot create a new registration.
        """
        from .generation_ingress import OwnerEnrollmentRequest, TargetCustody

        self._resolver.require_control_lease(
            control_lease, operation_kind='registration-recover')
        if type(owner_enrollment) is not OwnerEnrollmentRequest:
            raise CustodyJournalError('owner-enrollment-required')
        evidence = self._resolver.resolve(owner_enrollment, self.custodian_id,
                                         self.provider_id)
        payload = evidence.payload
        _validate_owner_payload(payload)
        if (payload['custodianId'] != self.custodian_id
                or payload['providerId'] != self.provider_id):
            raise CustodyJournalError('owner-registration-mismatch')

        document = self._journal._load()
        state = _replay(document['events'])['registration']
        if state is None or state.get('status') != 'confirmed':
            raise CustodyJournalError('registration-confirmation-required')
        intents = [event['payload'] for event in document['events']
                   if event['kind'] == 'registration-intent']
        confirmations = [event['payload'] for event in document['events']
                         if event['kind'] == 'registration-confirmed']
        if (len(intents) != 1 or len(confirmations) != 1
                or state.get('id') != payload['registrationId']
                or intents[0]['registrationId'] != payload['registrationId']
                or intents[0]['ownerPayload'] != payload
                or intents[0]['registrationDigest'] != evidence.observation['registrationDigest']
                or confirmations[0] != {'registrationId': payload['registrationId'],
                                         'targetCustody': state.get('custody')}):
            raise CustodyJournalError('registration-original-outcome-unresolved')

        fresh = self._resolver.observe_original(
            owner_enrollment, intents[0]['ownerPayload'], document['sequence'])
        self._check_fresh_observation(
            fresh, document, payload, intents[0]['registrationDigest'])
        observation = fresh.observation
        reference = {
            'profile': 'umf.native-target-custody/0.1',
            'custodianId': self.custodian_id,
            'registrationId': payload['registrationId'],
            'resourceId': payload['origin']['clusterId'],
            'incarnation': payload['origin']['incarnationId'],
            'registrationDigest': observation['registrationDigest'],
        }
        if reference != state.get('custody'):
            raise CustodyJournalError('registration-original-outcome-unresolved')

        handle = TargetCustody(_target_capability_seal(), self._issuer,
                               'umf.native-target-custody/0.1')
        verified = _VerifiedTargetCustody(_CUSTODY_SEAL, self, payload,
                                          fresh.native_attestation, reference)
        self._handles[id(handle)] = (handle, verified)
        self._resolver.require_control_lease(
            control_lease, operation_kind='registration-recover')
        return handle

    @staticmethod
    def _check_fresh_observation(evidence: _OwnerRegistrationEvidence,
                                 document: dict[str, Any], payload: dict[str, Any],
                                 original_digest: str | None) -> None:
        _validate_observation(evidence.observation, payload)
        if evidence.observation['custodianSequence'] != document['sequence']:
            raise CustodyJournalError('owner-observation-sequence-mismatch')
        if (original_digest is not None
                and evidence.observation['registrationDigest'] != original_digest):
            raise CustodyJournalError('registration-original-outcome-unresolved')

    def _resolve_target_custody(self, handle: object) -> _VerifiedTargetCustody:
        from .generation_ingress import TargetCustody

        if (type(handle) is not TargetCustody
                or not handle._issued_by(self._issuer, 'umf.native-target-custody/0.1')):
            raise CustodyJournalError('target-custody-required')
        entry = self._handles.get(id(handle))
        if (entry is None or entry[0] is not handle
                or type(entry[1]) is not _VerifiedTargetCustody
                or entry[1].custodian is not self):
            raise CustodyJournalError('target-custody-required')
        return entry[1]

    def _public_reference(self, handle: object) -> dict[str, Any]:
        return dict(self._resolve_target_custody(handle).reference)


def _bootstrap_local_target_custodian(journal: ExternalCustodyJournal,
                                      custodian_id: str, provider_id: str,
                                      resolver: _OwnerRegistrationResolver) -> LocalTargetCustodian:
    """Private trusted-bootstrap entry; not a user-selected resolver API."""
    return LocalTargetCustodian(_CUSTODY_SEAL, journal, custodian_id, provider_id, resolver)


def _bootstrap_original_02_target_custodian(
        birth_handle: object, *, custodian_id: str, provider_id: str,
        resolver: _OwnerRegistrationResolver, control_lease: object,
        operation_kind: str) -> LocalTargetCustodian:
    """Select the fresh external 0.2 journal only through original birth custody."""
    journal = ExternalCustodyJournal._open_original_02(
        birth_handle, resolver=resolver, control_lease=control_lease,
        operation_kind=operation_kind)
    return LocalTargetCustodian(_CUSTODY_SEAL, journal, custodian_id,
                                provider_id, resolver)


def _target_capability_seal() -> object:
    """Internal access to the opaque-handle seal, never a public issuer API."""
    from . import generation_ingress

    return generation_ingress._CAPABILITY_SEAL

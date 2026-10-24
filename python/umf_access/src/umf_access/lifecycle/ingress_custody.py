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


def _validate_event_payload(kind: str, payload: Any) -> dict[str, Any]:
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
    else:
        raise CustodyJournalError('journal-invalid')
    _canonical(payload)
    return payload


def _replay(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Validate append ordering and return state; pending intents are retained."""
    state: dict[str, Any] = {'registration': None, 'provision': None, 'transition': None}
    operation_ids: set[tuple[str, str]] = set()
    for event in events:
        kind, payload = event['kind'], event['payload']
        category = ('registration' if kind.startswith('registration-') else
                    'provision' if kind.startswith('epoch-provision-') else 'transition')
        operation_id = payload.get('registrationId' if category == 'registration' else
                                   'reservationId')
        if category == 'provision' and kind == 'epoch-provision-reserved':
            operation_id = payload['reservation']['id']
        if kind.endswith(('intent', 'reserved')):
            marker = (category, operation_id)
            if marker in operation_ids:
                raise CustodyJournalError('journal-order-invalid')
            operation_ids.add(marker)
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
            if state['registration'] is None or state['registration']['status'] != 'confirmed' or current and current['status'] != 'confirmed':
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
                    or current and current['status'] != 'confirmed'):
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

class ExternalCustodyJournal:
    """Private append journal; it cannot detect replacement by an older copy alone.

    The enrolled native owner/controller must compare this sequence against its
    independently retained original custody chain before issuing capabilities.
    """

    __slots__ = ('_custodian_id', '_lock_path', '_path')

    def __init__(self, path: str | os.PathLike[str], custodian_id: str):
        self._path = Path(path)
        self._lock_path = self._path.with_name(self._path.name + '.lock')
        self._custodian_id = _text(custodian_id, 256)
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

    def _read(self) -> dict[str, Any]:
        try:
            fd = os.open(self._path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
        except FileNotFoundError:
            return {'profile': JOURNAL_PROFILE, 'custodianId': self._custodian_id,
                    'sequence': 0, 'headDigest': '0' * 64, 'events': []}
        except OSError:
            raise CustodyJournalError('journal-unavailable') from None
        try:
            st = os.fstat(fd)
            if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid != os.geteuid()
                    or stat.S_IMODE(st.st_mode) & 0o077 or st.st_size > _MAX_BYTES):
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
        if (doc['profile'] != JOURNAL_PROFILE or doc['custodianId'] != self._custodian_id
                or type(doc['events']) is not list or len(doc['events']) > _MAX_EVENTS):
            raise CustodyJournalError('journal-corrupt')
        previous = '0' * 64
        for index, event in enumerate(doc['events'], 1):
            _closed(event, {'sequence', 'kind', 'payload', 'previousDigest', 'recordDigest'})
            if (type(event['sequence']) is not int or event['sequence'] != index
                    or event['previousDigest'] != previous or event['kind'] not in _KINDS):
                raise CustodyJournalError('journal-corrupt')
            _validate_event_payload(event['kind'], event['payload'])
            unhashed = {key: event[key] for key in ('sequence', 'kind', 'payload', 'previousDigest')}
            if event['recordDigest'] != _digest(unhashed):
                raise CustodyJournalError('journal-corrupt')
            previous = event['recordDigest']
        if (type(doc['sequence']) is not int or doc['sequence'] != len(doc['events'])
                or doc['headDigest'] != previous):
            raise CustodyJournalError('journal-corrupt')
        _replay(doc['events'])
        return doc

    @contextmanager
    def _locked(self) -> Iterator[int]:
        flags = os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0)
        try:
            fd = os.open(self._lock_path, flags, 0o600)
            os.fchmod(fd, 0o600)
            st = os.fstat(fd)
            if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid != os.geteuid():
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
        if kind not in _KINDS:
            raise CustodyJournalError('journal-invalid')
        payload = _validate_event_payload(kind, payload)
        with self._locked():
            doc = self._read()
            if len(doc['events']) >= _MAX_EVENTS:
                raise CustodyJournalError('journal-capacity')
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
            _replay(events)
            updated = {'profile': JOURNAL_PROFILE, 'custodianId': self._custodian_id,
                       'sequence': event['sequence'], 'headDigest': event['recordDigest'],
                       'events': events}
            data = _canonical(updated)
            self._replace(data)
            return {'sequence': event['sequence'], 'recordDigest': event['recordDigest'],
                    'headDigest': event['recordDigest']}

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
        state = _replay(doc['events'])
        return {'profile': JOURNAL_PROFILE, 'custodianId': self._custodian_id,
                'sequence': doc['sequence'], 'headDigest': doc['headDigest'],
                'pending': {key: value['id'] for key, value in state.items()
                            if value is not None and value['status'] != 'confirmed'}}

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


def _target_capability_seal() -> object:
    """Internal access to the opaque-handle seal, never a public issuer API."""
    from . import generation_ingress

    return generation_ingress._CAPABILITY_SEAL

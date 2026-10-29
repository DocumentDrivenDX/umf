# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pure target-custody journal encoding and validation primitives."""
from __future__ import annotations

import hashlib
import json
import os
import re
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
            from .row_originals_receipt import canonical_bytes, validate_receipt
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

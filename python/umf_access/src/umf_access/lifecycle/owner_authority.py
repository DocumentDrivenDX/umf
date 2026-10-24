# SPDX-License-Identifier: MIT OR Apache-2.0
"""Configured, durable Ed25519 owner approval for G11 host operations.

This module verifies a signed, scope-bound decision from an independently
configured owner authority.  It does not create signing keys or authorize
native effects by itself.  The supervisor remains responsible for binding a
verified approval to its own original native evidence and effect journal.
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
from dataclasses import dataclass
from functools import wraps
from pathlib import Path
from typing import Any

from ..native_program import canonical_json

OWNER_APPROVAL_PROFILE = 'umf.authenticated-host-owner-approval/0.1'
OWNER_AUTHORITY_PROFILE = 'umf.configured-owner-authority/0.1'
OWNER_LEDGER_PROFILE = 'umf.configured-owner-approval-ledger/0.1'
OWNER_INTENT_PROFILE = 'umf.pg18.original-store-authority-evidence/0.1'
OWNER_PURPOSES = ('production', 'native-acceptance')
_SIGNATURE_DOMAIN = b'umf.host-owner-approval/0.1\x00'
_SCOPES = (
    'local-target-creation', 'local-target-registration',
    'native-principal-preparation', 'native-store-creation',
    'disabled-epoch-provision', 'generation-ingress-transition',
)
_UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
_HEX = re.compile(r'^[a-f0-9]{64}$')
_B64URL = re.compile(r'^[A-Za-z0-9_-]+$')
_NATIVE_NAME = re.compile(r'^[a-z][a-z0-9_]{0,62}$')
_ROLE_FLAGS = {'canLogin', 'superuser', 'createDatabase', 'createRole',
               'replication', 'bypassRls', 'inherit'}
_MAX_INTENT = 65_536
_MAX_CONFIG = 1_048_576
_MAX_LEDGER = 8 * 1024 * 1024
_MAX_LEDGER_RECORDS = 4096
_MAX_REQUESTS = 4096
_SAFE_INT = 9_007_199_254_740_991
_REQUEST_KIND = 'umf.owner-approval-request/0.1'
_VERIFIED_KIND = 'umf.owner-approval-verified/0.1'
_CAPABILITY_SEAL = object()
_CONTEXT_SEAL = object()
_EFFECT_SEAL = object()


class OwnerAuthorityError(RuntimeError):
    """Fixed owner-authority refusal without private signed material."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _reject(code: str) -> None:
    raise OwnerAuthorityError(code)


def _closed(value: object, keys: set[str], code: str = 'owner-authority-invalid') -> dict[str, Any]:
    if type(value) is not dict or set(value) != keys or any(type(k) is not str for k in value):
        _reject(code)
    return value


def _text(value: object, maximum: int = 128) -> str:
    if type(value) is not str or not value or '\x00' in value:
        _reject('owner-authority-invalid')
    try:
        encoded = value.encode('utf-8')
    except UnicodeEncodeError:
        _reject('owner-authority-invalid')
    if len(encoded) > maximum:
        _reject('owner-authority-invalid')
    return value


def _uuid(value: object) -> str:
    if type(value) is not str or not _UUID.fullmatch(value):
        _reject('owner-authority-invalid')
    try:
        if str(uuid.UUID(value)) != value:
            _reject('owner-authority-invalid')
    except ValueError:
        _reject('owner-authority-invalid')
    return value


def _digest(value: object) -> str:
    if type(value) is not str or not _HEX.fullmatch(value):
        _reject('owner-authority-invalid')
    return value


def _name(value: object) -> str:
    if type(value) is not str or not _NATIVE_NAME.fullmatch(value):
        _reject('owner-intent-invalid')
    return value


def _uint(value: object, maximum: int) -> int:
    if type(value) is not int or not 0 <= value <= maximum:
        _reject('owner-intent-invalid')
    return value


def _path(value: object) -> str:
    path = _text(value, 4096)
    if not path.startswith('/') or os.path.normpath(path) != path:
        _reject('owner-intent-invalid')
    return path


def _flags(value: object) -> dict[str, Any]:
    flags = _closed(value, _ROLE_FLAGS, 'owner-intent-invalid')
    if any(type(flag) is not bool for flag in flags.values()):
        _reject('owner-intent-invalid')
    return flags


def _principal(value: object, *, operation: str | None = None,
               expected_flags: dict[str, bool] | None = None) -> dict[str, Any]:
    fields = {'name', 'operation', 'flags'} if operation is not None else {'oid', 'name', 'flags'}
    principal = _closed(value, fields, 'owner-intent-invalid')
    _name(principal['name'])
    if operation is not None and principal['operation'] != operation:
        _reject('owner-intent-invalid')
    if operation is None:
        _uint(principal['oid'], 4_294_967_295)
        if principal['oid'] == 0:
            _reject('owner-intent-invalid')
    flags = _flags(principal['flags'])
    if expected_flags is not None and flags != expected_flags:
        _reject('owner-intent-invalid')
    return principal


def _expected_role_flags(role: str) -> dict[str, bool]:
    values = {name: False for name in _ROLE_FLAGS}
    if role == 'maintenance':
        values.update({'canLogin': True, 'superuser': True})
    elif role == 'controller':
        values.update({'superuser': True})
    return values


def _base64url(value: object, size: int) -> bytes:
    if type(value) is not str or not _B64URL.fullmatch(value):
        _reject('owner-authority-invalid')
    try:
        decoded = base64.urlsafe_b64decode(value + '=' * ((4 - len(value) % 4) % 4))
    except (ValueError, TypeError):
        _reject('owner-authority-invalid')
    if len(decoded) != size or base64.urlsafe_b64encode(decoded).decode('ascii').rstrip('=') != value:
        _reject('owner-authority-invalid')
    return decoded


def _base64url_encoded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode('ascii').rstrip('=')


def _plain_json(value: object, *, depth: int = 0, count: list[int] | None = None,
                byte_count: list[int] | None = None,
                byte_limit: int = _MAX_LEDGER) -> object:
    """Copy a strict JSON value and reject subclasses, floats, and cycles."""
    if count is None:
        count = [0]
    if byte_count is None:
        byte_count = [0]
    count[0] += 1
    if count[0] > 100_000 or depth > 48:
        _reject('owner-authority-capacity')
    if value is None or type(value) is bool:
        return value
    if type(value) is int:
        if abs(value) > _SAFE_INT:
            _reject('owner-authority-invalid')
        return value
    if type(value) is str:
        if '\x00' in value:
            _reject('owner-authority-invalid')
        try:
            byte_count[0] += len(value.encode('utf-8'))
        except UnicodeEncodeError:
            _reject('owner-authority-invalid')
        if byte_count[0] > byte_limit:
            _reject('owner-authority-capacity')
        return value
    if type(value) is list:
        if len(value) > 4096:
            _reject('owner-authority-capacity')
        return [_plain_json(item, depth=depth + 1, count=count, byte_count=byte_count,
                            byte_limit=byte_limit)
                for item in value]
    if type(value) is dict:
        if len(value) > 128 or any(type(key) is not str or not key.isascii() for key in value):
            _reject('owner-authority-invalid')
        byte_count[0] += sum(len(key) for key in value)
        if byte_count[0] > byte_limit:
            _reject('owner-authority-capacity')
        return {key: _plain_json(item, depth=depth + 1, count=count, byte_count=byte_count,
                                 byte_limit=byte_limit)
                for key, item in value.items()}
    _reject('owner-authority-invalid')


def _parse_canonical_intent(data: bytes) -> dict[str, Any]:
    if type(data) is not bytes or not 1 <= len(data) <= _MAX_INTENT:
        _reject('owner-intent-capacity')

    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in items:
            if key in result:
                _reject('owner-intent-invalid')
            result[key] = value
        return result

    def bad_constant(_value: str) -> None:
        _reject('owner-intent-invalid')

    try:
        parsed = json.loads(data.decode('utf-8'), object_pairs_hook=pairs,
                            parse_float=lambda _value: _reject('owner-intent-invalid'),
                            parse_constant=bad_constant)
    except OwnerAuthorityError:
        raise
    except (UnicodeError, ValueError, RecursionError):
        _reject('owner-intent-invalid')
    copied = _plain_json(parsed)
    if type(copied) is not dict:
        _reject('owner-intent-invalid')
    try:
        encoded = canonical_json(copied).encode('utf-8')
    except (TypeError, ValueError, UnicodeError, RecursionError):
        _reject('owner-intent-invalid')
    if encoded != data:
        _reject('owner-intent-noncanonical')
    return copied


def _decode_canonical_object(data: bytes) -> dict[str, Any]:
    try:
        parsed = json.loads(data.decode('utf-8'), object_pairs_hook=_no_duplicates,
                            parse_float=lambda _value: _reject('owner-authority-invalid'),
                            parse_constant=lambda _value: _reject('owner-authority-invalid'))
    except OwnerAuthorityError:
        raise
    except (UnicodeError, ValueError, RecursionError):
        _reject('owner-authority-invalid')
    copied = _plain_json(parsed)
    if type(copied) is not dict or _canonical_bytes(copied) != data:
        _reject('owner-authority-invalid')
    return copied


def _validate_native_store_evidence(intent: dict[str, Any], authority_id: str,
                                    policy_revision: str) -> dict[str, str]:
    expected = {'profile', 'supervisorId', 'custodianId', 'providerId', 'installationId',
                'ownerAuthorityId', 'ownerPolicyRevision', 'registrationDigest',
                'targetCustodyDigest', 'authorityPreparationReceiptDigest', 'maintenance',
                'controller', 'businessOwner', 'requiredMemberships', 'requiredSettings',
                'nativeAuthorityObservationDigest'}
    _closed(intent, expected, 'owner-intent-invalid')
    if (intent['profile'] != OWNER_INTENT_PROFILE
            or _uuid(intent['ownerAuthorityId']) != authority_id
            or _text(intent['ownerPolicyRevision']) != policy_revision):
        _reject('owner-intent-authority-mismatch')
    supervisor = _uuid(intent['supervisorId'])
    custodian = _uuid(intent['custodianId'])
    provider = _uuid(intent['providerId'])
    installation = _text(intent['installationId'])
    for name in ('registrationDigest', 'targetCustodyDigest',
                 'authorityPreparationReceiptDigest', 'nativeAuthorityObservationDigest'):
        _digest(intent[name])
    principal_fields = {'oid', 'name', 'flags'}
    flag_fields = {'canLogin', 'superuser', 'createDatabase', 'createRole',
                   'replication', 'bypassRls', 'inherit'}
    names: set[str] = set()
    oids: set[int] = set()
    expected_flags = {
        'maintenance': {'canLogin': True, 'superuser': True, 'createDatabase': False,
                        'createRole': False, 'replication': False, 'bypassRls': False,
                        'inherit': False},
        'controller': {'canLogin': False, 'superuser': True, 'createDatabase': False,
                       'createRole': False, 'replication': False, 'bypassRls': False,
                       'inherit': False},
        'businessOwner': {'canLogin': False, 'superuser': False, 'createDatabase': False,
                          'createRole': False, 'replication': False, 'bypassRls': False,
                          'inherit': False},
    }
    for key in ('maintenance', 'controller', 'businessOwner'):
        principal = _closed(intent[key], principal_fields, 'owner-intent-invalid')
        oid = principal['oid']
        if type(oid) is not int or not 1 <= oid <= 4_294_967_295:
            _reject('owner-intent-invalid')
        name = _text(principal['name'])
        flags = _closed(principal['flags'], flag_fields, 'owner-intent-invalid')
        if (any(type(flag) is not bool for flag in flags.values())
                or flags != expected_flags[key] or oid in oids or name in names):
            _reject('owner-intent-invalid')
        oids.add(oid)
        names.add(name)
    memberships = intent['requiredMemberships']
    if type(memberships) is not list or len(memberships) > 32:
        _reject('owner-intent-invalid')
    seen_memberships: set[tuple[int, int]] = set()
    for membership in memberships:
        row = _closed(membership, {'memberOid', 'roleOid', 'inherit', 'set', 'admin'},
                       'owner-intent-invalid')
        member, role = row['memberOid'], row['roleOid']
        if (type(member) is not int or type(role) is not int or member <= 0 or role <= 0
                or member > 4_294_967_295 or role > 4_294_967_295
                or any(type(row[k]) is not bool for k in ('inherit', 'set', 'admin'))
                or member not in oids or role not in oids
                or (member, role) in seen_memberships):
            _reject('owner-intent-invalid')
        seen_memberships.add((member, role))
    maintenance_oid = intent['maintenance']['oid']
    controller_oid = intent['controller']['oid']
    owner_oid = intent['businessOwner']['oid']
    if memberships != [
            {'memberOid': maintenance_oid, 'roleOid': controller_oid,
             'inherit': False, 'set': True, 'admin': False},
            {'memberOid': maintenance_oid, 'roleOid': owner_oid,
             'inherit': False, 'set': True, 'admin': False}]:
        _reject('owner-intent-invalid')
    settings = _closed(intent['requiredSettings'],
                       {'searchPath', 'timeZone', 'rowSecurity', 'sessionReplicationRole',
                        'transactionReadOnly', 'transactionIsolation'}, 'owner-intent-invalid')
    expected_settings = {'searchPath': 'pg_catalog', 'timeZone': 'UTC', 'rowSecurity': 'on',
                         'sessionReplicationRole': 'origin', 'transactionReadOnly': 'off',
                         'transactionIsolation': 'read committed'}
    if settings != expected_settings:
        _reject('owner-intent-invalid')
    return {'supervisorId': supervisor, 'custodianId': custodian,
            'providerId': provider, 'installationId': installation}


def _target_custody(value: object) -> dict[str, Any]:
    custody = _closed(value, {'profile', 'custodianId', 'registrationId', 'resourceId',
                              'incarnation', 'registrationDigest'}, 'owner-intent-invalid')
    if custody['profile'] != 'umf.native-target-custody/0.1':
        _reject('owner-intent-invalid')
    for name in ('custodianId', 'registrationId', 'resourceId', 'incarnation'):
        _uuid(custody[name])
    _digest(custody['registrationDigest'])
    return custody


def _validate_registration_without_approval(registration: object) -> dict[str, str]:
    registration = _closed(registration, {'profile', 'registrationId', 'custodianId',
                                          'providerId', 'installationId', 'origin',
                                          'endpointControl'}, 'owner-intent-invalid')
    # Reuse the adopted custody shape checker with a local, never-exported marker.
    # This marker is not part of the intent and is not signed or persisted.
    marker = {'authorityId': '00000000-0000-4000-8000-000000000000',
              'approvalId': '00000000-0000-4000-8000-000000000000',
              'approvalDigest': '0' * 64,
              'scope': 'enroll-owned-local-postgresql-target'}
    try:
        from .ingress_custody import CustodyJournalError, _validate_owner_payload
    except ImportError:
        _reject('owner-intent-invalid')
    try:
        _validate_owner_payload({**registration, 'ownerApproval': marker})
    except CustodyJournalError:
        _reject('owner-intent-invalid')
    return {'custodianId': registration['custodianId'],
            'providerId': registration['providerId'],
            'installationId': registration['installationId'],
            'supervisorId': registration['origin']['supervisorId']}


def _validate_scope_intent(scope: str, intent: dict[str, Any], *, authority_id: str,
                           policy_revision: str,
                           context: OwnerAuthorityContext) -> tuple[dict[str, str], tuple[object, ...]]:
    """Validate one frozen owner intent and derive its stable idempotency key."""
    if scope == 'local-target-creation':
        _closed(intent, {'profile', 'supervisorId', 'clusterId', 'incarnationId',
                         'installationId', 'ownerUid', 'databaseName', 'businessOwner',
                         'maintenanceName', 'controllerName', 'controlDirectory',
                         'dataDirectory', 'postgresPath', 'postgresSha256', 'initdbPath',
                         'initdbSha256', 'port', 'configDigest', 'hbaDigest'},
                'owner-intent-invalid')
        if intent['profile'] != 'umf.local-postgresql-create-request/0.1':
            _reject('owner-intent-invalid')
        supervisor = _uuid(intent['supervisorId'])
        cluster = _uuid(intent['clusterId'])
        _uuid(intent['incarnationId'])
        _uint(intent['ownerUid'], 4_294_967_295)
        database = _name(intent['databaseName'])
        business_owner = _name(intent['businessOwner'])
        maintenance = _name(intent['maintenanceName'])
        controller = _name(intent['controllerName'])
        if len({business_owner, maintenance, controller}) != 3:
            _reject('owner-intent-invalid')
        control = _path(intent['controlDirectory'])
        data = _path(intent['dataDirectory'])
        if (control == data or data.startswith(control.rstrip('/') + '/')
                or control.startswith(data.rstrip('/') + '/')):
            _reject('owner-intent-invalid')
        _path(intent['postgresPath']); _path(intent['initdbPath'])
        for name in ('postgresSha256', 'initdbSha256', 'configDigest', 'hbaDigest'):
            _digest(intent[name])
        port = _uint(intent['port'], 65535)
        if port == 0 or supervisor != context._supervisor_id:
            _reject('owner-intent-context-mismatch')
        if _text(intent['installationId']) != context._installation_id:
            _reject('owner-intent-context-mismatch')
        return _context_target(context), (scope, supervisor, cluster)

    if scope == 'native-principal-preparation':
        _closed(intent, {'profile', 'preparationId', 'supervisorId', 'custodianId',
                         'providerId', 'installationId', 'creationRequestDigest',
                         'creationApprovalDigest', 'bootstrapOriginDigest',
                         'bootstrapDatabase', 'maintenanceBefore', 'maintenanceAfter',
                         'controller', 'businessOwner', 'applicationDatabase',
                         'memberships', 'maximumRoles'}, 'owner-intent-invalid')
        if intent['profile'] != 'umf.local-postgresql-principal-preparation/0.1':
            _reject('owner-intent-invalid')
        preparation = _uuid(intent['preparationId'])
        target = _validate_context_fields(intent, context,
                                          ('supervisorId', 'custodianId', 'providerId',
                                           'installationId'))
        for field in ('creationRequestDigest', 'creationApprovalDigest', 'bootstrapOriginDigest'):
            _digest(intent[field])
        database = _closed(intent['bootstrapDatabase'], {'oid', 'name', 'systemIdentifier'},
                            'owner-intent-invalid')
        if database['name'] != 'postgres' or _uint(database['oid'], 4_294_967_295) == 0:
            _reject('owner-intent-invalid')
        _decimal_text(database['systemIdentifier'])
        maintenance_before = _principal(intent['maintenanceBefore'])
        maintenance_after = _principal(
            intent['maintenanceAfter'], operation='alter-bootstrap',
            expected_flags=_expected_role_flags('maintenance'))
        controller = _principal(intent['controller'], operation='create-absent',
                                expected_flags=_expected_role_flags('controller'))
        owner = _principal(intent['businessOwner'], operation='create-absent',
                            expected_flags=_expected_role_flags('businessOwner'))
        if (maintenance_after['name'] != maintenance_before['name']
                or len({maintenance_before['name'], controller['name'], owner['name']}) != 3):
            _reject('owner-intent-invalid')
        appdb = _closed(intent['applicationDatabase'],
                        {'name', 'ownerName', 'encoding', 'locale', 'operation'},
                        'owner-intent-invalid')
        if (appdb['name'] == 'postgres' or _name(appdb['name']) != appdb['name']
                or appdb['ownerName'] != owner['name'] or appdb['encoding'] != 'UTF8'
                or appdb['locale'] != 'C' or appdb['operation'] != 'create-absent'):
            _reject('owner-intent-invalid')
        memberships = intent['memberships']
        expected_memberships = [
            {'memberName': intent['maintenanceBefore']['name'],
             'roleName': controller['name'], 'inherit': False, 'set': True, 'admin': False},
            {'memberName': intent['maintenanceBefore']['name'],
             'roleName': owner['name'], 'inherit': False, 'set': True, 'admin': False},
        ]
        if (type(memberships) is not list or len(memberships) != 2
                or any(type(row) is not dict for row in memberships)
                or any(set(row) != {'memberName', 'roleName', 'inherit', 'set', 'admin'}
                       for row in memberships)
                or any(type(row[key]) is not bool for row in memberships
                       for key in ('inherit', 'set', 'admin'))
                or memberships != expected_memberships
                or type(intent['maximumRoles']) is not int or intent['maximumRoles'] != 3):
            _reject('owner-intent-invalid')
        return target, (scope, target['supervisorId'], preparation)

    if scope == 'local-target-registration':
        _closed(intent, {'profile', 'registration'}, 'owner-intent-invalid')
        if intent['profile'] != 'umf.owner-target-registration-intent/0.1':
            _reject('owner-intent-invalid')
        target = _validate_registration_without_approval(intent['registration'])
        _validate_context_fields(target, context,
                                 ('supervisorId', 'custodianId', 'providerId', 'installationId'))
        return _context_target(context), (scope, target['custodianId'],
                                           intent['registration']['registrationId'])

    if scope == 'native-store-creation':
        _closed(intent, {'profile', 'store', 'evidence'}, 'owner-intent-invalid')
        if intent['profile'] != 'umf.owner-store-create-intent/0.1':
            _reject('owner-intent-invalid')
        evidence_target = _validate_native_store_evidence(
            intent['evidence'], authority_id, policy_revision)
        _validate_context_fields(evidence_target, context,
                                 ('supervisorId', 'custodianId', 'providerId', 'installationId'))
        store = _closed(intent['store'], {'profile', 'storeId', 'schemaName'},
                        'owner-intent-invalid')
        store_profiles = {
            'umf.pg-generation-ingress-store/0.1': 'umf_ingress_',
            'umf.native-row-originals-store/0.1': 'umf_originals_',
        }
        prefix = store_profiles.get(store['profile'])
        store_id = _uuid(store['storeId'])
        if (prefix is None or store_id != evidence_target['providerId']
                or store['schemaName'] != prefix + store_id.replace('-', '')):
            _reject('owner-intent-invalid')
        return _context_target(context), (scope, evidence_target['providerId'],
                                           store['profile'], store_id)

    if scope == 'disabled-epoch-provision':
        _closed(intent, {'profile', 'request'}, 'owner-intent-invalid')
        if intent['profile'] != 'umf.owner-epoch-provision-intent/0.1':
            _reject('owner-intent-invalid')
        request = _closed(intent['request'], {'profile', 'providerId', 'enrollmentId',
                    'installationId', 'targetCustody', 'planDigest', 'fileDigest',
                    'expectedHead', 'previousSourceDigest', 'nextSourceDigest',
                    'nextBundleDigest', 'newEpoch', 'issuerProfile', 'principals',
                    'maximumRoles'}, 'owner-intent-invalid')
        if request['profile'] != 'umf.ingress-epoch-provision/0.1':
            _reject('owner-intent-invalid')
        custody = _target_custody(request['targetCustody'])
        target = {'supervisorId': context._supervisor_id,
                  'custodianId': custody['custodianId'],
                  'providerId': _uuid(request['providerId']),
                  'installationId': _text(request['installationId'])}
        _validate_context_fields(target, context,
                                 ('supervisorId', 'custodianId', 'providerId', 'installationId'))
        for field in ('planDigest', 'fileDigest', 'previousSourceDigest',
                      'nextSourceDigest', 'nextBundleDigest'):
            _digest(request[field])
        if request['expectedHead'] is None:
            _reject('owner-intent-invalid')
        _digest(request['expectedHead'])
        _uuid(request['enrollmentId']); epoch = _uuid(request['newEpoch'])
        _text(request['issuerProfile'], 256)
        principals = request['principals']
        maximum = request['maximumRoles']
        if (type(principals) is not list or not 1 <= len(principals) <= 256
                or type(maximum) is not int or maximum != len(principals)):
            _reject('owner-intent-invalid')
        logins: set[str] = set()
        for principal in principals:
            principal = _closed(principal, {'loginName', 'subject', 'audience'},
                                'owner-intent-invalid')
            login = _name(principal['loginName'])
            subject = _closed(principal['subject'], {'oid', 'name'}, 'owner-intent-invalid')
            if (login in logins or _uint(subject['oid'], 4_294_967_295) == 0
                    or _name(subject['name']) != subject['name']
                    or principal['audience'] not in ('person', 'batch')):
                _reject('owner-intent-invalid')
            logins.add(login)
        return _context_target(context), (scope, target['providerId'], epoch)

    if scope == 'generation-ingress-transition':
        _closed(intent, {'profile', 'request'}, 'owner-intent-invalid')
        if intent['profile'] != 'umf.owner-ingress-transition-intent/0.1':
            _reject('owner-intent-invalid')
        request = _closed(intent['request'], {'profile', 'providerId', 'enrollmentId',
                    'installationId', 'targetIdentityDigest', 'planDigest', 'fileDigest',
                    'expectedHead', 'previousSourceDigest', 'nextSourceDigest',
                    'previousBundleDigest', 'nextBundleDigest', 'oldEpoch', 'newEpoch',
                    'oldPrincipalsDigest', 'newPrincipalsDigest', 'approvalDigest',
                    'targetCustody', 'executionPolicyDigest'}, 'owner-intent-invalid')
        if request['profile'] != 'umf.table-generation-ingress/0.1':
            _reject('owner-intent-invalid')
        custody = _target_custody(request['targetCustody'])
        target = {'supervisorId': context._supervisor_id,
                  'custodianId': custody['custodianId'],
                  'providerId': _uuid(request['providerId']),
                  'installationId': _text(request['installationId'])}
        _validate_context_fields(target, context,
                                 ('supervisorId', 'custodianId', 'providerId', 'installationId'))
        for field in ('targetIdentityDigest', 'planDigest', 'fileDigest', 'expectedHead',
                      'previousSourceDigest', 'nextSourceDigest', 'previousBundleDigest',
                      'nextBundleDigest', 'oldPrincipalsDigest', 'newPrincipalsDigest',
                      'approvalDigest', 'executionPolicyDigest'):
            _digest(request[field])
        _uuid(request['enrollmentId'])
        old_epoch, new_epoch = _uuid(request['oldEpoch']), _uuid(request['newEpoch'])
        if old_epoch == new_epoch:
            _reject('owner-intent-invalid')
        return _context_target(context), (scope, target['providerId'], new_epoch)

    _reject('owner-approval-scope-invalid')


def _decimal_text(value: object) -> str:
    if (type(value) is not str or not value.isascii() or not value.isdigit()
            or len(value) > 20 or (len(value) > 1 and value.startswith('0'))
            or not 1 <= int(value) <= 18_446_744_073_709_551_615):
        _reject('owner-intent-invalid')
    return value


def _context_target(context: OwnerAuthorityContext) -> dict[str, str]:
    return {'supervisorId': context._supervisor_id,
            'custodianId': context._custodian_id,
            'providerId': context._provider_id,
            'installationId': context._installation_id}


def _validate_context_fields(target: dict[str, str], context: OwnerAuthorityContext,
                             fields: tuple[str, ...]) -> dict[str, str]:
    expected = _context_target(context)
    for field in fields:
        if target.get(field) != expected[field]:
            _reject('owner-intent-context-mismatch')
    return expected


def _validate_config(value: object) -> tuple[dict[str, Any], tuple[dict[str, Any], ...]]:
    config = _plain_json(value, byte_limit=_MAX_CONFIG)
    if len(_canonical_bytes(config)) > _MAX_CONFIG:
        _reject('owner-authority-config-invalid')
    _closed(config, {'profile', 'authorityId', 'policyRevision', 'purpose', 'keys'},
            'owner-authority-config-invalid')
    if config['profile'] != OWNER_AUTHORITY_PROFILE:
        _reject('owner-authority-config-invalid')
    _uuid(config['authorityId'])
    _text(config['policyRevision'])
    if config['purpose'] not in OWNER_PURPOSES:
        _reject('owner-authority-config-invalid')
    keys = config['keys']
    if type(keys) is not list or not 1 <= len(keys) <= 32:
        _reject('owner-authority-config-invalid')
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for item in keys:
        key = _closed(item, {'keyId', 'publicKey', 'principalId', 'scopes',
                             'supervisorIds', 'providerIds', 'installationIds'},
                      'owner-authority-config-invalid')
        key_id = _text(key['keyId'])
        if key_id in seen:
            _reject('owner-authority-config-invalid')
        seen.add(key_id)
        principal_id = _text(key['principalId'])
        public_key = _base64url(key['publicKey'], 32)
        scopes = key['scopes']
        if (type(scopes) is not list or not scopes
                or any(type(scope) is not str or scope not in _SCOPES for scope in scopes)
                or len(scopes) != len(set(scopes))
                or scopes != [scope for scope in _SCOPES if scope in scopes]):
            _reject('owner-authority-config-invalid')
        bounds: dict[str, tuple[str, ...]] = {}
        for name in ('supervisorIds', 'providerIds', 'installationIds'):
            entries = key[name]
            if (type(entries) is not list or not 1 <= len(entries) <= 256
                    or any(type(entry) is not str for entry in entries)
                    or len(entries) != len(set(entries))):
                _reject('owner-authority-config-invalid')
            bounds[name] = tuple(_text(entry) if name == 'installationIds' else _uuid(entry)
                                 for entry in entries)
        normalized.append({'keyId': key_id, 'publicKey': public_key,
                           'principalId': principal_id, 'scopes': tuple(scopes),
                           **bounds})
    return config, tuple(normalized)


def _canonical_bytes(value: object) -> bytes:
    try:
        return canonical_json(value).encode('utf-8')
    except (TypeError, ValueError, UnicodeError, RecursionError):
        _reject('owner-authority-invalid')


def _digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _ledger_intent_bytes(value: object) -> bytes:
    if type(value) is not str or not _B64URL.fullmatch(value):
        _reject('owner-approval-ledger-corrupt')
    try:
        decoded = base64.urlsafe_b64decode(value + '=' * ((4 - len(value) % 4) % 4))
    except (ValueError, TypeError):
        _reject('owner-approval-ledger-corrupt')
    if (not 1 <= len(decoded) <= _MAX_INTENT
            or base64.urlsafe_b64encode(decoded).decode('ascii').rstrip('=') != value):
        _reject('owner-approval-ledger-corrupt')
    return decoded


def _ledger_parse(data: bytes) -> list[dict[str, Any]]:
    if len(data) > _MAX_LEDGER or (data and not data.endswith(b'\n')):
        _reject('owner-approval-ledger-corrupt')
    if not data:
        return []
    lines = data.splitlines()
    if len(lines) > _MAX_LEDGER_RECORDS * 4 + 1:
        _reject('owner-approval-ledger-capacity')
    records: list[dict[str, Any]] = []
    previous = '0' * 64
    for index, line in enumerate(lines, start=1):
        try:
            record = json.loads(line.decode('utf-8'), object_pairs_hook=_no_duplicates,
                                parse_constant=lambda _v: _reject('owner-approval-ledger-corrupt'))
        except OwnerAuthorityError:
            raise
        except (UnicodeError, ValueError, RecursionError):
            _reject('owner-approval-ledger-corrupt')
        if type(record) is not dict or _canonical_bytes(record) != line:
            _reject('owner-approval-ledger-corrupt')
        if index == 1:
            if (set(record) != {'profile', 'authorityId', 'configurationDigest', 'digest'}
                    or record['profile'] != OWNER_LEDGER_PROFILE):
                _reject('owner-approval-ledger-corrupt')
            body = {key: record[key] for key in ('profile', 'authorityId', 'configurationDigest')}
            if record['digest'] != _digest_bytes(_canonical_bytes(body)):
                _reject('owner-approval-ledger-corrupt')
        else:
            if set(record) != {'sequence', 'previousDigest', 'kind', 'payload', 'digest'}:
                _reject('owner-approval-ledger-corrupt')
            body = {key: record[key] for key in ('sequence', 'previousDigest', 'kind', 'payload')}
            if (record['sequence'] != index - 1 or record['previousDigest'] != previous
                    or type(record['kind']) is not str
                    or type(record['payload']) is not dict
                    or record['digest'] != _digest_bytes(_canonical_bytes(body))):
                _reject('owner-approval-ledger-corrupt')
        previous = record['digest']
        records.append(record)
    _validate_ledger_events(records)
    return records


def _validate_ledger_events(records: list[dict[str, Any]]) -> None:
    requests: dict[str, dict[str, Any]] = {}
    approvals: dict[str, dict[str, Any]] = {}
    dispatched: set[str] = set()
    outcomes: dict[str, dict[str, Any]] = {}
    effect_keys: dict[tuple[str, str], str] = {}
    authority_id = records[0]['authorityId']
    configuration_digest = records[0]['configurationDigest']
    for record in records[1:]:
        kind = record['kind']
        payload = record['payload']
        if kind == 'request-prepared':
            if set(payload) != {'approvalId', 'scope', 'purpose', 'intentDigest', 'payloadDigest',
                                'contextDigest', 'effectKey', 'stableKey', 'target', 'intent', 'signedPayload',
                                'intentBytes'}:
                _reject('owner-approval-ledger-corrupt')
            approval_id = payload['approvalId']
            signed = payload['signedPayload']
            if (type(approval_id) is not str or approval_id in requests
                    or type(payload['scope']) is not str or payload['scope'] not in _SCOPES
                    or payload['purpose'] not in OWNER_PURPOSES
                    or type(payload['contextDigest']) is not str
                    or not _HEX.fullmatch(payload['contextDigest'])
                    or type(payload['effectKey']) is not list
                    or not payload['effectKey']
                    or type(payload['stableKey']) is not list
                    or not payload['stableKey']
                    or type(payload['intentDigest']) is not str
                    or not _HEX.fullmatch(payload['intentDigest'])
                    or type(payload['payloadDigest']) is not str
                    or not _HEX.fullmatch(payload['payloadDigest'])
                    or type(signed) is not dict
                    or set(signed) != {'profile', 'authorityId', 'policyRevision', 'keyId',
                                       'principalId', 'approvalId', 'purpose', 'scope', 'custodianId',
                                       'supervisorId', 'providerId', 'installationId',
                                       'intentDigest'}
                    or signed.get('profile') != OWNER_APPROVAL_PROFILE
                    or signed.get('authorityId') != authority_id
                    or signed.get('approvalId') != approval_id
                    or signed.get('purpose') != payload['purpose']
                    or signed.get('scope') != payload['scope']
                    or signed.get('intentDigest') != payload['intentDigest']
                    or payload['payloadDigest'] != _digest_bytes(_canonical_bytes(signed))):
                _reject('owner-approval-ledger-corrupt')
            try:
                _uuid(approval_id)
                intent_bytes = _ledger_intent_bytes(payload['intentBytes'])
                intent = _parse_canonical_intent(intent_bytes)
            except (OwnerAuthorityError, TypeError):
                _reject('owner-approval-ledger-corrupt')
            if (type(payload['target']) is not dict
                    or set(payload['target']) != {'supervisorId', 'custodianId', 'providerId',
                                                  'installationId'}
                    or type(payload['intent']) is not dict or intent != payload['intent']
                    or _digest_bytes(intent_bytes) != payload['intentDigest']
                    or any(signed.get(key) != value for key, value in payload['target'].items())):
                _reject('owner-approval-ledger-corrupt')
            stable = payload['stableKey']
            target = payload['target']
            if (payload['contextDigest'] != configuration_digest
                    or len(stable) < 6
                    or stable[:5] != [payload['purpose'], target['custodianId'],
                                      target['supervisorId'], target['providerId'],
                                      target['installationId']]):
                _reject('owner-approval-ledger-corrupt')
            replay_context = _LedgerReplayContext(
                _purpose=payload['purpose'], _custodian_id=target['custodianId'],
                _supervisor_id=target['supervisorId'], _provider_id=target['providerId'],
                _installation_id=target['installationId'])
            try:
                derived_target, derived_effect_key = _validate_scope_intent(
                    payload['scope'], intent, authority_id=authority_id,
                    policy_revision=signed['policyRevision'], context=replay_context)
            except (OwnerAuthorityError, KeyError, TypeError):
                _reject('owner-approval-ledger-corrupt')
            expected_stable = [payload['purpose'], target['custodianId'],
                               target['supervisorId'], target['providerId'],
                               target['installationId'], *derived_effect_key]
            if (derived_target != target or payload['effectKey'] != list(derived_effect_key)
                    or stable != expected_stable):
                _reject('owner-approval-ledger-corrupt')
            key = (_canonical_bytes(payload['stableKey']).decode('utf-8'), payload['purpose'])
            previous_request = effect_keys.get(key)
            if previous_request is not None:
                _reject('owner-approval-ledger-corrupt')
            effect_keys[key] = approval_id
            requests[approval_id] = payload
        elif kind == 'approval-reserved':
            if set(payload) != {'approvalId', 'intentDigest', 'envelopeDigest', 'envelope'}:
                _reject('owner-approval-ledger-corrupt')
            approval_id = payload['approvalId']
            request = requests.get(approval_id)
            envelope = payload['envelope']
            if (request is None or approval_id in approvals
                    or payload['intentDigest'] != request['intentDigest']
                    or type(payload['envelopeDigest']) is not str
                    or not _HEX.fullmatch(payload['envelopeDigest'])
                    or type(envelope) is not dict or set(envelope) != {'payload', 'signature'}
                    or type(envelope['payload']) is not dict
                    or envelope['payload'] != request['signedPayload']
                    or payload['envelopeDigest'] != _digest_bytes(_canonical_bytes(envelope))):
                _reject('owner-approval-ledger-corrupt')
            try:
                _base64url(envelope['signature'], 64)
            except OwnerAuthorityError:
                _reject('owner-approval-ledger-corrupt')
            approvals[approval_id] = payload
        elif kind == 'effect-dispatch-reserved':
            if set(payload) != {'approvalId', 'envelopeDigest'}:
                _reject('owner-approval-ledger-corrupt')
            approval_id = payload['approvalId']
            approval = approvals.get(approval_id)
            if (approval is None or approval_id in dispatched
                    or payload['envelopeDigest'] != approval['envelopeDigest']):
                _reject('owner-approval-ledger-corrupt')
            dispatched.add(approval_id)
        elif kind == 'effect-pending':
            if set(payload) != {'approvalId', 'reservationDigest'}:
                _reject('owner-approval-ledger-corrupt')
            approval_id = payload['approvalId']
            approval = approvals.get(approval_id)
            if (approval is None or approval_id in dispatched
                    or type(payload['reservationDigest']) is not str
                    or not _HEX.fullmatch(payload['reservationDigest'])):
                _reject('owner-approval-ledger-corrupt')
            dispatched.add(approval_id)
            outcomes[approval_id] = {'reservationDigest': payload['reservationDigest']}
        elif kind == 'effect-outcome':
            if set(payload) != {'approvalId', 'reservationDigest', 'status', 'receiptDigest'}:
                _reject('owner-approval-ledger-corrupt')
            approval_id = payload['approvalId']
            pending = outcomes.get(approval_id)
            if (approval_id not in dispatched or pending is None or 'status' in pending
                    or type(payload['reservationDigest']) is not str
                    or not _HEX.fullmatch(payload['reservationDigest'])
                    or payload['reservationDigest'] != pending['reservationDigest']
                    or payload['status'] not in ('confirmed', 'aborted')
                    or type(payload['receiptDigest']) is not str
                    or not _HEX.fullmatch(payload['receiptDigest'])):
                _reject('owner-approval-ledger-corrupt')
            outcomes[approval_id] = payload
        else:
            _reject('owner-approval-ledger-corrupt')


@dataclass(frozen=True)
class _LedgerReplayContext:
    """Bound context reconstructed only to validate signed ledger semantics."""

    _purpose: str
    _custodian_id: str
    _supervisor_id: str
    _provider_id: str
    _installation_id: str


def _no_duplicates(items: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in items:
        if key in result:
            _reject('owner-approval-ledger-corrupt')
        result[key] = value
    return result


class _ApprovalLedger:
    """Small append-only fsynced ledger, separate from the PostgreSQL data dir."""

    __slots__ = ('authority_id', 'configuration_digest', 'lock_path', 'path')

    def __init__(self, path: str | os.PathLike[str], authority_id: str,
                 configuration_digest: str):
        if type(path) is not str and not isinstance(path, Path):
            _reject('owner-approval-ledger-path-invalid')
        target = Path(path)
        if not target.is_absolute() or target.name in ('', '.', '..'):
            _reject('owner-approval-ledger-path-invalid')
        parent = target.parent
        try:
            parent_stat = parent.stat(follow_symlinks=False)
        except OSError:
            _reject('owner-approval-ledger-path-invalid')
        if (not stat.S_ISDIR(parent_stat.st_mode) or parent.is_symlink()
                or parent.resolve(strict=True) != parent
                or parent_stat.st_uid != os.geteuid() or parent_stat.st_mode & 0o077):
            _reject('owner-approval-ledger-path-invalid')
        self.path = target
        self.lock_path = target.with_name(target.name + '.lock')
        self.authority_id = authority_id
        self.configuration_digest = configuration_digest

    def _open_locked(self) -> tuple[int, int, bool]:
        lock_fd = -1
        fd = -1
        flags = os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0)
        try:
            try:
                lock_fd = os.open(self.lock_path, flags | os.O_CREAT | os.O_EXCL, 0o600)
                new_lock = True
            except FileExistsError:
                lock_fd = os.open(self.lock_path, flags)
                new_lock = False
            lock_stat = os.fstat(lock_fd)
            if (not stat.S_ISREG(lock_stat.st_mode) or lock_stat.st_uid != os.geteuid()
                    or lock_stat.st_mode & 0o077 or lock_stat.st_nlink != 1):
                raise OSError('unsafe existing lock')
            if new_lock:
                os.fchmod(lock_fd, 0o600)
            fcntl.flock(lock_fd, fcntl.LOCK_EX)
            try:
                fd = os.open(self.path, flags | os.O_CREAT | os.O_EXCL, 0o600)
                is_new = True
            except FileExistsError:
                fd = os.open(self.path, flags)
                is_new = False
            file_stat = os.fstat(fd)
            if (not stat.S_ISREG(file_stat.st_mode) or file_stat.st_uid != os.geteuid()
                    or file_stat.st_mode & 0o077 or file_stat.st_nlink != 1):
                raise OSError('unsafe existing ledger')
            if is_new:
                os.fchmod(fd, 0o600)
            return lock_fd, fd, is_new
        except (OSError, ValueError):
            try:
                if fd >= 0:
                    os.close(fd)
                if lock_fd >= 0:
                    fcntl.flock(lock_fd, fcntl.LOCK_UN)
                    os.close(lock_fd)
            except OSError:
                pass
            _reject('owner-approval-ledger-unavailable')

    def _records(self, fd: int, is_new: bool) -> list[dict[str, Any]]:
        os.lseek(fd, 0, os.SEEK_SET)
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            total += len(chunk)
            if total > _MAX_LEDGER:
                _reject('owner-approval-ledger-capacity')
            chunks.append(chunk)
        records = _ledger_parse(b''.join(chunks))
        if not records and is_new:
            body = {'profile': OWNER_LEDGER_PROFILE, 'authorityId': self.authority_id,
                    'configurationDigest': self.configuration_digest}
            record = {**body, 'digest': _digest_bytes(_canonical_bytes(body))}
            data = _canonical_bytes(record) + b'\n'
            written = 0
            while written < len(data):
                count = os.write(fd, data[written:])
                if count <= 0:
                    _reject('owner-approval-ledger-write-failed')
                written += count
            os.fsync(fd)
            os.fchmod(fd, 0o600)
            records = [record]
            _fsync_parent(self.path.parent)
        if (not records or records[0].get('authorityId') != self.authority_id
                or records[0].get('configurationDigest') != self.configuration_digest):
            _reject('owner-approval-ledger-binding-mismatch')
        return records

    def _append(self, fd: int, record: dict[str, Any]) -> None:
        data = _canonical_bytes(record) + b'\n'
        initial_stat = os.fstat(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            total += len(chunk)
            if total + len(data) > _MAX_LEDGER:
                _reject('owner-approval-ledger-capacity')
            chunks.append(chunk)
        original = b''.join(chunks)
        if len(original.splitlines()) + 1 > _MAX_LEDGER_RECORDS * 4 + 1:
            _reject('owner-approval-ledger-capacity')
        complete = original + data
        temporary = self.path.with_name(f'.{self.path.name}.{uuid.uuid4().hex}.tmp')
        temp_fd = -1
        try:
            temp_fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                              | getattr(os, 'O_NOFOLLOW', 0), 0o600)
            offset = 0
            while offset < len(complete):
                count = os.write(temp_fd, complete[offset:])
                if count <= 0:
                    raise OSError('short write')
                offset += count
            os.fchmod(temp_fd, 0o600)
            os.fsync(temp_fd)
            os.close(temp_fd)
            temp_fd = -1
            current_stat = self.path.stat(follow_symlinks=False)
            if (not stat.S_ISREG(current_stat.st_mode) or current_stat.st_nlink != 1
                    or (current_stat.st_dev, current_stat.st_ino)
                    != (initial_stat.st_dev, initial_stat.st_ino)):
                _reject('owner-approval-ledger-unavailable')
            os.replace(temporary, self.path)
            _fsync_parent(self.path.parent)
        except OSError:
            _reject('owner-approval-ledger-write-failed')
        finally:
            if temp_fd >= 0:
                os.close(temp_fd)
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass

    def _with_records(self, operation):
        lock_fd, fd, is_new = self._open_locked()
        try:
            records = self._records(fd, is_new)
            return operation(fd, records)
        finally:
            os.close(fd)
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
            os.close(lock_fd)

    def _with_existing_records(self, operation):
        """Read existing history under its lock without creating either file."""
        lock_fd = -1
        fd = -1
        flags = os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0)
        try:
            lock_fd = os.open(self.lock_path, flags)
            lock_stat = os.fstat(lock_fd)
            if (not stat.S_ISREG(lock_stat.st_mode) or lock_stat.st_uid != os.geteuid()
                    or lock_stat.st_mode & 0o077 or lock_stat.st_nlink != 1):
                _reject('owner-approval-ledger-unavailable')
            fcntl.flock(lock_fd, fcntl.LOCK_EX)
            fd = os.open(self.path, flags)
            file_stat = os.fstat(fd)
            if (not stat.S_ISREG(file_stat.st_mode) or file_stat.st_uid != os.geteuid()
                    or file_stat.st_mode & 0o077 or file_stat.st_nlink != 1):
                _reject('owner-approval-ledger-unavailable')
            records = self._records(fd, False)
            return operation(fd, records)
        except OSError:
            _reject('owner-approval-ledger-unavailable')
        finally:
            if fd >= 0:
                os.close(fd)
            if lock_fd >= 0:
                fcntl.flock(lock_fd, fcntl.LOCK_UN)
                os.close(lock_fd)

    def find_or_reserve_request(self, *, scope: str, intent_digest: str,
                                target: dict[str, str], intent: dict[str, Any],
                                intent_bytes: bytes, effect_key: tuple[object, ...],
                                context: OwnerAuthorityContext, create_payload) -> dict[str, Any]:
        def apply(fd: int, records: list[dict[str, Any]]) -> dict[str, Any]:
            full_effect_key = [context._purpose, context._custodian_id,
                               context._supervisor_id, context._provider_id,
                               context._installation_id, *effect_key]
            for row in reversed(records[1:]):
                if row['kind'] != 'request-prepared':
                    continue
                saved = row['payload']
                if saved['stableKey'] == full_effect_key:
                    if (saved['intent'] != intent or saved['scope'] != scope
                            or saved['contextDigest'] != context._configuration_digest
                            or saved['intentBytes'] != _base64url_encoded(intent_bytes)):
                        _reject('owner-approval-original-request-invalid')
                    return saved
            request_count = sum(row['kind'] == 'request-prepared' for row in records[1:])
            if request_count >= _MAX_REQUESTS:
                _reject('owner-approval-ledger-capacity')
            payload = create_payload()
            request = {'approvalId': payload['approvalId'], 'scope': scope,
                       'purpose': context._purpose,
                       'intentDigest': intent_digest,
                       'contextDigest': context._configuration_digest,
                       'effectKey': list(effect_key), 'stableKey': full_effect_key,
                       'target': target,
                       'payloadDigest': _digest_bytes(_canonical_bytes(payload))}
            body = {'sequence': len(records), 'previousDigest': records[-1]['digest'],
                    'kind': 'request-prepared',
                    'payload': {**request, 'intent': intent,
                                'signedPayload': payload,
                                'intentBytes': base64.urlsafe_b64encode(intent_bytes).decode('ascii').rstrip('=')
                                }}
            self._append(fd, {**body, 'digest': _digest_bytes(_canonical_bytes(body))})
            return body['payload']
        return self._with_records(apply)

    def find_original_request(self, *, scope: str, intent_digest: str,
                              target: dict[str, str], intent: dict[str, Any],
                              intent_bytes: bytes, effect_key: tuple[object, ...],
                              context: OwnerAuthorityContext) -> dict[str, Any]:
        """Resolve an exact prior request without initializing or appending history."""
        full_effect_key = [context._purpose, context._custodian_id,
                           context._supervisor_id, context._provider_id,
                           context._installation_id, *effect_key]

        def apply(_fd: int, records: list[dict[str, Any]]) -> dict[str, Any]:
            saved = next((row['payload'] for row in reversed(records[1:])
                          if row['kind'] == 'request-prepared'
                          and row['payload'].get('stableKey') == full_effect_key), None)
            if saved is None:
                _reject('owner-approval-original-request-unavailable')
            if (saved['scope'] != scope or saved['intentDigest'] != intent_digest
                    or saved['contextDigest'] != context._configuration_digest
                    or saved['target'] != target or saved['intent'] != intent
                    or saved['intentBytes'] != _base64url_encoded(intent_bytes)
                    or saved['effectKey'] != list(effect_key)):
                _reject('owner-approval-original-request-invalid')
            return saved
        return self._with_existing_records(apply)

    def reserve_approval(self, request_id: str, envelope: dict[str, Any],
                         envelope_digest: str, intent_digest: str) -> bool:
        def apply(fd: int, records: list[dict[str, Any]]) -> bool:
            requests = [row for row in records[1:] if row.get('kind') == 'request-prepared'
                        and row['payload'].get('approvalId') == request_id]
            if not requests or requests[-1]['payload'].get('intentDigest') != intent_digest:
                _reject('owner-approval-request-not-original')
            existing = [row for row in records[1:] if row.get('kind') == 'approval-reserved'
                        and row.get('payload', {}).get('approvalId') == request_id]
            if existing:
                if existing[-1]['payload'].get('envelopeDigest') != envelope_digest:
                    _reject('owner-approval-replay-conflict')
                return False
            body = {'sequence': len(records), 'previousDigest': records[-1]['digest'],
                    'kind': 'approval-reserved',
                    'payload': {'approvalId': request_id, 'intentDigest': intent_digest,
                                'envelopeDigest': envelope_digest, 'envelope': envelope}}
            self._append(fd, {**body, 'digest': _digest_bytes(_canonical_bytes(body))})
            return True
        return self._with_existing_records(apply)

    def find_original_approval(self, request_id: str,
                               intent_digest: str) -> dict[str, Any]:
        """Read the exact originally reserved signature for restart recovery."""
        def apply(_fd: int, records: list[dict[str, Any]]) -> dict[str, Any]:
            request = next((row['payload'] for row in records[1:]
                            if row['kind'] == 'request-prepared'
                            and row['payload'].get('approvalId') == request_id), None)
            approval = next((row['payload'] for row in reversed(records[1:])
                             if row['kind'] == 'approval-reserved'
                             and row['payload'].get('approvalId') == request_id), None)
            if (request is None or request['intentDigest'] != intent_digest
                    or approval is None or approval['intentDigest'] != intent_digest):
                _reject('owner-approval-original-approval-unavailable')
            return approval['envelope']
        return self._with_existing_records(apply)

    def observe(self, request_id: str) -> tuple[dict[str, Any] | None,
                                                   dict[str, Any] | None, bool]:
        def apply(_fd: int, records: list[dict[str, Any]]):
            request = next((row['payload'] for row in records[1:]
                            if row.get('kind') == 'request-prepared'
                            and row.get('payload', {}).get('approvalId') == request_id), None)
            approval = next((row['payload'] for row in reversed(records[1:])
                            if row.get('kind') == 'approval-reserved'
                            and row.get('payload', {}).get('approvalId') == request_id), None)
            dispatched = any(row.get('kind') == 'effect-dispatch-reserved'
                             and row.get('payload', {}).get('approvalId') == request_id
                             for row in records[1:])
            return request, approval, dispatched
        return self._with_existing_records(apply)

    def reserve_effect_dispatch(self, request_id: str, envelope_digest: str) -> None:
        def apply(fd: int, records: list[dict[str, Any]]) -> None:
            approvals = [row['payload'] for row in records[1:]
                         if row.get('kind') == 'approval-reserved'
                         and row.get('payload', {}).get('approvalId') == request_id]
            if not approvals or approvals[-1].get('envelopeDigest') != envelope_digest:
                _reject('owner-approval-not-reserved')
            if any(row.get('kind') == 'effect-dispatch-reserved'
                   and row.get('payload', {}).get('approvalId') == request_id
                   for row in records[1:]):
                _reject('owner-approval-already-consumed')
            body = {'sequence': len(records), 'previousDigest': records[-1]['digest'],
                    'kind': 'effect-dispatch-reserved',
                    'payload': {'approvalId': request_id, 'envelopeDigest': envelope_digest}}
            self._append(fd, {**body, 'digest': _digest_bytes(_canonical_bytes(body))})
        self._with_existing_records(apply)

    def bind_effect(self, request_id: str, reservation_digest: str) -> bool:
        def apply(fd: int, records: list[dict[str, Any]]) -> bool:
            approvals = [row['payload'] for row in records[1:]
                         if row.get('kind') == 'approval-reserved'
                         and row.get('payload', {}).get('approvalId') == request_id]
            if not approvals:
                _reject('owner-approval-not-reserved')
            prior = [row['payload'] for row in records[1:]
                     if row.get('kind') == 'effect-pending'
                     and row.get('payload', {}).get('approvalId') == request_id]
            if prior:
                if prior[-1]['reservationDigest'] != reservation_digest:
                    _reject('owner-approval-replay-conflict')
                return False
            if any(row.get('kind') == 'effect-dispatch-reserved'
                   and row.get('payload', {}).get('approvalId') == request_id
                   for row in records[1:]):
                _reject('owner-approval-already-consumed')
            body = {'sequence': len(records), 'previousDigest': records[-1]['digest'],
                    'kind': 'effect-pending',
                    'payload': {'approvalId': request_id,
                                'reservationDigest': reservation_digest}}
            self._append(fd, {**body, 'digest': _digest_bytes(_canonical_bytes(body))})
            return True
        return self._with_existing_records(apply)

    def finish_effect(self, request_id: str, reservation_digest: str, *,
                      status: str, receipt_digest: str) -> None:
        def apply(fd: int, records: list[dict[str, Any]]) -> None:
            pending = [row['payload'] for row in records[1:]
                       if row.get('kind') == 'effect-pending'
                       and row.get('payload', {}).get('approvalId') == request_id]
            finished = next((row['payload'] for row in records[1:]
                             if row.get('kind') == 'effect-outcome'
                             and row.get('payload', {}).get('approvalId') == request_id), None)
            if (not pending or pending[-1]['reservationDigest'] != reservation_digest
                    or status not in ('confirmed', 'aborted')):
                _reject('owner-approval-effect-state-invalid')
            if finished is not None:
                if (finished['reservationDigest'] == reservation_digest
                        and finished['status'] == status
                        and finished['receiptDigest'] == receipt_digest):
                    return False
                _reject('owner-approval-effect-state-invalid')
            body = {'sequence': len(records), 'previousDigest': records[-1]['digest'],
                    'kind': 'effect-outcome',
                    'payload': {'approvalId': request_id,
                                'reservationDigest': reservation_digest,
                                'status': status, 'receiptDigest': _digest(receipt_digest)}}
            self._append(fd, {**body, 'digest': _digest_bytes(_canonical_bytes(body))})
            return True
        return self._with_existing_records(apply)

    def observe_effect(self, request_id: str) -> tuple[dict[str, Any] | None,
                                                        dict[str, Any] | None]:
        def apply(_fd: int, records: list[dict[str, Any]]):
            pending = next((row['payload'] for row in reversed(records[1:])
                            if row.get('kind') == 'effect-pending'
                            and row['payload'].get('approvalId') == request_id), None)
            outcome = next((row['payload'] for row in reversed(records[1:])
                            if row.get('kind') == 'effect-outcome'
                            and row['payload'].get('approvalId') == request_id), None)
            return pending, outcome
        return self._with_existing_records(apply)

    def find_effect(self, effect_key: list[object], purpose: str) -> dict[str, Any] | None:
        def apply(_fd: int, records: list[dict[str, Any]]):
            request = next((row['payload'] for row in reversed(records[1:])
                            if row.get('kind') == 'request-prepared'
                            and row['payload'].get('stableKey') == effect_key
                            and row['payload'].get('purpose') == purpose), None)
            return request
        return self._with_existing_records(apply)


def _fsync_parent(parent: Path) -> None:
    fd = os.open(parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class OwnerApprovalRequest:
    """Opaque immutable request bound to exact configured authority and bytes."""

    __slots__ = ('_approval_id', '_context', '_effect_key', '_intent_bytes',
                 '_intent_digest', '_issuer', '_kind', '_payload_bytes', '_scope')

    def __init__(self, seal: object, issuer: object, *, approval_id: str, scope: str,
                 intent_bytes: bytes, intent_digest: str,
                 payload_bytes: bytes, effect_key: tuple[object, ...],
                 context: OwnerAuthorityContext):
        if seal is not _CAPABILITY_SEAL:
            raise TypeError('owner approval requests are authority-issued')
        object.__setattr__(self, '_issuer', issuer)
        object.__setattr__(self, '_kind', _REQUEST_KIND)
        object.__setattr__(self, '_approval_id', approval_id)
        object.__setattr__(self, '_scope', scope)
        object.__setattr__(self, '_intent_bytes', intent_bytes)
        object.__setattr__(self, '_intent_digest', intent_digest)
        object.__setattr__(self, '_payload_bytes', payload_bytes)
        object.__setattr__(self, '_effect_key', effect_key)
        object.__setattr__(self, '_context', context)

    def __setattr__(self, _name: str, _value: object) -> None:
        raise AttributeError('owner approval request is immutable')

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('owner approval requests cannot be serialized')

    def __repr__(self) -> str:
        return '<OwnerApprovalRequest opaque>'

    @property
    def scope(self) -> str:
        return self._scope

    @property
    def effect_key(self) -> tuple[object, ...]:
        return self._effect_key


class VerifiedOwnerApproval:
    """Opaque verified decision. It is not an effect receipt or native outcome."""

    __slots__ = ('_approval_digest', '_envelope_bytes', '_issuer', '_kind',
                 '_payload_bytes', '_request')

    def __init__(self, seal: object, issuer: object, request: OwnerApprovalRequest,
                 payload: dict[str, Any], approval_digest: str, envelope_bytes: bytes):
        if seal is not _CAPABILITY_SEAL:
            raise TypeError('verified owner approval is authority-issued')
        object.__setattr__(self, '_issuer', issuer)
        object.__setattr__(self, '_kind', _VERIFIED_KIND)
        object.__setattr__(self, '_request', request)
        object.__setattr__(self, '_payload_bytes', _canonical_bytes(payload))
        object.__setattr__(self, '_approval_digest', approval_digest)
        object.__setattr__(self, '_envelope_bytes', envelope_bytes)

    def __setattr__(self, _name: str, _value: object) -> None:
        raise AttributeError('verified owner approval is immutable')

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('verified owner approval cannot be serialized')

    def __repr__(self) -> str:
        return '<VerifiedOwnerApproval opaque>'

    @property
    def authority_id(self) -> str:
        return _decode_canonical_object(self._payload_bytes)['authorityId']

    @property
    def policy_revision(self) -> str:
        return _decode_canonical_object(self._payload_bytes)['policyRevision']

    @property
    def approval_id(self) -> str:
        return _decode_canonical_object(self._payload_bytes)['approvalId']

    @property
    def scope(self) -> str:
        return _decode_canonical_object(self._payload_bytes)['scope']

    @property
    def principal_id(self) -> str:
        return _decode_canonical_object(self._payload_bytes)['principalId']

    @property
    def purpose(self) -> str:
        return _decode_canonical_object(self._payload_bytes)['purpose']

    @property
    def intent_digest(self) -> str:
        return _decode_canonical_object(self._payload_bytes)['intentDigest']

    @property
    def approval_digest(self) -> str:
        return self._approval_digest


@dataclass(frozen=True, slots=True)
class OriginalApprovalOutcome:
    """Read-only durable approval state; never asserts that a native effect committed."""

    approval_id: str
    scope: str
    intent_digest: str
    approval_status: str
    approval_digest: str | None
    effect_status: str
    effect_digest: str | None = None
    effect_receipt_digest: str | None = None


class OriginalEffectBinding:
    """Opaque durable link from a verified approval to one native reservation."""

    __slots__ = ('_issuer', '_kind', '_request', '_reservation', '_reservation_digest')

    def __init__(self, seal: object, issuer: object, request: OwnerApprovalRequest,
                 reservation: object, reservation_digest: str):
        if seal is not _EFFECT_SEAL:
            raise TypeError('native effect bindings are authority-issued')
        object.__setattr__(self, '_issuer', issuer)
        object.__setattr__(self, '_kind', 'umf.owner-native-effect-binding/0.1')
        object.__setattr__(self, '_request', request)
        object.__setattr__(self, '_reservation', reservation)
        object.__setattr__(self, '_reservation_digest', _digest(reservation_digest))

    def __setattr__(self, _name: str, _value: object) -> None:
        raise AttributeError('native effect binding is immutable')

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('native effect binding cannot be serialized')

    def __repr__(self) -> str:
        return '<OriginalEffectBinding opaque>'


class OwnerAuthorityContext:
    """Opaque immutable identity/purpose binding issued by original bootstrap."""

    __slots__ = ('_configuration_digest', '_custodian_id', '_installation_id',
                 '_issuer', '_issuer_registry', '_kind', '_provider_id', '_purpose',
                 '_supervisor_id')

    def __init__(self, seal: object, issuer: object, *, purpose: str, custodian_id: str,
                 supervisor_id: str, provider_id: str, installation_id: str,
                 configuration_digest: str):
        if seal is not _CONTEXT_SEAL:
            raise TypeError('owner authority context is bootstrap-issued')
        if purpose not in OWNER_PURPOSES:
            _reject('owner-authority-context-invalid')
        object.__setattr__(self, '_issuer', issuer)
        object.__setattr__(self, '_issuer_registry', issuer)
        object.__setattr__(self, '_kind', 'umf.owner-authority-context/0.1')
        object.__setattr__(self, '_purpose', purpose)
        object.__setattr__(self, '_custodian_id', _uuid(custodian_id))
        object.__setattr__(self, '_supervisor_id', _uuid(supervisor_id))
        object.__setattr__(self, '_provider_id', _uuid(provider_id))
        object.__setattr__(self, '_installation_id', _text(installation_id))
        object.__setattr__(self, '_configuration_digest', _digest(configuration_digest))

    def __setattr__(self, _name: str, _value: object) -> None:
        raise AttributeError('owner authority context is immutable')

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('owner authority context cannot be serialized')

    def __repr__(self) -> str:
        return '<OwnerAuthorityContext opaque>'


def _issue_owner_authority_context(issuer: object, configuration: object) -> OwnerAuthorityContext:
    """Issue a private context only from the enrolled concrete native bootstrap."""
    from . import ingress_local_postgres as native
    from .ingress_local_postgres import _LocalOwnerBootstrapIssuer
    if (type(issuer) is not _LocalOwnerBootstrapIssuer
            or native._BOOTSTRAP_ISSUERS.get(id(issuer)) is not issuer):
        _reject('owner-authority-context-issuer-required')
    resolver = getattr(type(issuer), '_owner_authority_context_material', None)
    bound = getattr(issuer, '_owner_authority_context_material', None)
    if resolver is None or getattr(bound, '__func__', None) is not resolver:
        _reject('owner-authority-context-issuer-required')
    config, _keys = _validate_config(configuration)
    material = issuer._owner_authority_context_material()
    if type(material) is not tuple or len(material) != 6:
        _reject('owner-authority-context-invalid')
    purpose, custodian_id, supervisor_id, provider_id, installation_id, config_digest = material
    expected_digest = _digest_bytes(_canonical_bytes(config))
    if (purpose != config['purpose'] or config_digest != expected_digest):
        _reject('owner-authority-context-binding-mismatch')
    context = OwnerAuthorityContext(_CONTEXT_SEAL, issuer, purpose=purpose,
                                 custodian_id=custodian_id, supervisor_id=supervisor_id,
                                 provider_id=provider_id, installation_id=installation_id,
                                 configuration_digest=config_digest)
    _CONTEXTS[id(context)] = context
    return context


_CONTEXTS: dict[int, OwnerAuthorityContext] = {}


def _serialize_registry_access(method):
    @wraps(method)
    def serialized(self, *args, **kwargs):
        with self._registry_lock:
            return method(self, *args, **kwargs)
    return serialized


class ConfiguredEd25519OwnerAuthority:
    """Configured Ed25519 signature verifier with an independent fsynced ledger."""

    __slots__ = (
        '_authority_id',
        '_config',
        '_config_digest',
        '_context',
        '_effect_bindings',
        '_keys',
        '_ledger',
        '_native_supervisor',
        '_policy_revision',
        '_registry_lock',
        '_requests',
        '_requests_by_approval',
        '_verified',
        '_verified_by_request',
    )

    def __init__(self, configuration: object, *, ledger_path: str | os.PathLike[str],
                 bootstrap_issuer: object):
        config, keys = _validate_config(configuration)
        config_bytes = _canonical_bytes(config)
        self._config = config
        self._keys = keys
        self._authority_id = config['authorityId']
        self._policy_revision = config['policyRevision']
        self._config_digest = _digest_bytes(config_bytes)
        context = _issue_owner_authority_context(bootstrap_issuer, config)
        self._context = context
        self._ledger = _ApprovalLedger(ledger_path, self._authority_id, self._config_digest)
        self._native_supervisor = None
        self._requests: dict[int, OwnerApprovalRequest] = {}
        self._requests_by_approval: dict[str, OwnerApprovalRequest] = {}
        self._verified: dict[int, VerifiedOwnerApproval] = {}
        self._verified_by_request: dict[str, VerifiedOwnerApproval] = {}
        self._effect_bindings: dict[int, OriginalEffectBinding] = {}
        self._registry_lock = threading.RLock()

    @property
    def authority_id(self) -> str:
        return self._authority_id

    @property
    def policy_revision(self) -> str:
        return self._policy_revision

    @property
    def configuration_digest(self) -> str:
        return self._config_digest

    @property
    def authority_context(self) -> OwnerAuthorityContext:
        return self._context

    @_serialize_registry_access
    def prepare_request(self, scope: str, exact_intent_bytes: bytes, *,
                        context: OwnerAuthorityContext) -> OwnerApprovalRequest:
        if (type(context) is not OwnerAuthorityContext or context is not self._context
                or _CONTEXTS.get(id(context)) is not context
                or context._issuer_registry is not context._issuer
                or context._configuration_digest != self._config_digest
                or context._purpose != self._config['purpose']):
            _reject('owner-authority-context-mismatch')
        if type(scope) is not str or scope not in _SCOPES:
            _reject('owner-approval-scope-invalid')
        intent = _parse_canonical_intent(exact_intent_bytes)
        target, effect_key = _validate_scope_intent(
            scope, intent, authority_id=self._authority_id,
            policy_revision=self._policy_revision, context=context)
        key = next((entry for entry in self._keys if scope in entry['scopes']
                    and target['supervisorId'] in entry['supervisorIds']
                    and target['providerId'] in entry['providerIds']
                    and target['installationId'] in entry['installationIds']), None)
        if key is None:
            _reject('owner-approval-target-not-authorized')
        intent_digest = _digest_bytes(exact_intent_bytes)
        def create_payload() -> dict[str, Any]:
            approval_id = str(uuid.uuid4())
            return {'profile': OWNER_APPROVAL_PROFILE, 'authorityId': self._authority_id,
                    'policyRevision': self._policy_revision, 'keyId': key['keyId'],
                    'principalId': key['principalId'], 'approvalId': approval_id,
                    'purpose': context._purpose,
                    'scope': scope, 'custodianId': target['custodianId'],
                    'supervisorId': target['supervisorId'], 'providerId': target['providerId'],
                    'installationId': target['installationId'], 'intentDigest': intent_digest}
        prior = self._ledger.find_or_reserve_request(
            scope=scope, intent_digest=intent_digest, target=target, intent=intent,
            intent_bytes=exact_intent_bytes, effect_key=effect_key,
            context=context, create_payload=create_payload)
        payload = prior['signedPayload']
        if (payload.get('keyId') != key['keyId']
                or payload.get('principalId') != key['principalId']):
            _reject('owner-approval-original-request-invalid')
        approval_id = _uuid(payload.get('approvalId'))
        payload_bytes = _canonical_bytes(payload)
        if len(payload_bytes) > 16_384:
            _reject('owner-approval-payload-capacity')
        existing_request = self._requests_by_approval.get(approval_id)
        if existing_request is not None:
            if (existing_request._payload_bytes != payload_bytes
                    or existing_request._intent_bytes != exact_intent_bytes):
                _reject('owner-approval-original-request-invalid')
            return existing_request
        request = self._make_request(approval_id, scope, exact_intent_bytes,
                                     intent_digest, payload_bytes,
                                     effect_key, context)
        self._requests[id(request)] = request
        self._requests_by_approval[approval_id] = request
        return request

    @_serialize_registry_access
    def _recover_original_request(self, scope: str, exact_intent_bytes: bytes, *,
                                  context: OwnerAuthorityContext,
                                  expected_approval_id: str) -> OwnerApprovalRequest:
        """Recreate a request capability only from its exact existing ledger row.

        This path is for recovery after process restart. It never creates a ledger,
        reserves a request, or substitutes a newly allocated approval identifier.
        """
        if (type(context) is not OwnerAuthorityContext or context is not self._context
                or _CONTEXTS.get(id(context)) is not context
                or context._issuer_registry is not context._issuer
                or context._configuration_digest != self._config_digest
                or context._purpose != self._config['purpose']):
            _reject('owner-authority-context-mismatch')
        if type(scope) is not str or scope not in _SCOPES:
            _reject('owner-approval-scope-invalid')
        expected_id = _uuid(expected_approval_id)
        intent = _parse_canonical_intent(exact_intent_bytes)
        target, effect_key = _validate_scope_intent(
            scope, intent, authority_id=self._authority_id,
            policy_revision=self._policy_revision, context=context)
        key = next((entry for entry in self._keys if scope in entry['scopes']
                    and target['supervisorId'] in entry['supervisorIds']
                    and target['providerId'] in entry['providerIds']
                    and target['installationId'] in entry['installationIds']), None)
        if key is None:
            _reject('owner-approval-target-not-authorized')
        intent_digest = _digest_bytes(exact_intent_bytes)
        prior = self._ledger.find_original_request(
            scope=scope, intent_digest=intent_digest, target=target, intent=intent,
            intent_bytes=exact_intent_bytes, effect_key=effect_key, context=context)
        payload = prior['signedPayload']
        if (payload['approvalId'] != expected_id or payload['keyId'] != key['keyId']
                or payload['principalId'] != key['principalId']):
            _reject('owner-approval-original-request-invalid')
        approval_id = _uuid(payload['approvalId'])
        payload_bytes = _canonical_bytes(payload)
        if len(payload_bytes) > 16_384:
            _reject('owner-approval-payload-capacity')
        existing_request = self._requests_by_approval.get(approval_id)
        if existing_request is not None:
            if (existing_request._payload_bytes != payload_bytes
                    or existing_request._intent_bytes != exact_intent_bytes):
                _reject('owner-approval-original-request-invalid')
            return existing_request
        request = self._make_request(approval_id, scope, exact_intent_bytes,
                                     intent_digest, payload_bytes, effect_key, context)
        self._requests[id(request)] = request
        self._requests_by_approval[approval_id] = request
        return request

    @_serialize_registry_access
    def _recover_verified_approval(
            self, original_request: OwnerApprovalRequest) -> VerifiedOwnerApproval:
        """Re-verify only the original durably stored signature; never allocate."""
        request = self._require_request(original_request)
        envelope = self._ledger.find_original_approval(
            request._approval_id, request._intent_digest)
        return self.verify_approval(request, envelope)

    def _make_request(self, approval_id: str, scope: str, intent_bytes: bytes,
                      intent_digest: str, payload_bytes: bytes,
                      effect_key: tuple[object, ...],
                      context: OwnerAuthorityContext) -> OwnerApprovalRequest:
        return OwnerApprovalRequest(_CAPABILITY_SEAL, self, approval_id=approval_id,
                                    scope=scope, intent_bytes=bytes(intent_bytes),
                                    intent_digest=intent_digest, payload_bytes=payload_bytes,
                                    effect_key=effect_key, context=context)

    @_serialize_registry_access
    def export_signing_request(self, original_request: OwnerApprovalRequest) -> dict[str, Any]:
        request = self._require_request(original_request)
        return {'payload': _decode_canonical_object(request._payload_bytes),
                'intent': _parse_canonical_intent(request._intent_bytes)}

    @_serialize_registry_access
    def verify_approval(self, original_request: OwnerApprovalRequest,
                        signed_envelope: object) -> VerifiedOwnerApproval:
        request = self._require_request(original_request)
        envelope = _plain_json(signed_envelope, byte_limit=32_768)
        _closed(envelope, {'payload', 'signature'}, 'owner-approval-envelope-invalid')
        payload = _plain_json(envelope['payload'])
        _closed(payload, {'profile', 'authorityId', 'policyRevision', 'keyId', 'principalId',
                          'approvalId', 'purpose', 'scope', 'custodianId', 'supervisorId', 'providerId',
                          'installationId', 'intentDigest'}, 'owner-approval-envelope-invalid')
        payload_bytes = _canonical_bytes(payload)
        if payload_bytes != request._payload_bytes:
            _reject('owner-approval-request-mismatch')
        if payload.get('purpose') != self._context._purpose:
            _reject('owner-approval-request-mismatch')
        signature = _base64url(envelope['signature'], 64)
        key = next((entry for entry in self._keys if entry['keyId'] == payload['keyId']), None)
        if key is None or key['principalId'] != payload['principalId']:
            _reject('owner-approval-key-untrusted')
        try:
            from cryptography import __version__ as crypto_version
            from cryptography.exceptions import InvalidSignature
            from cryptography.hazmat.primitives.asymmetric.ed25519 import (
                Ed25519PublicKey,
            )
        except ImportError:
            _reject('owner-approval-crypto-unavailable')
        if crypto_version != '50.0.2':
            _reject('owner-approval-crypto-version-unqualified')
        try:
            Ed25519PublicKey.from_public_bytes(key['publicKey']).verify(
                signature, _SIGNATURE_DOMAIN + payload_bytes)
        except InvalidSignature:
            _reject('owner-approval-signature-invalid')
        except (TypeError, ValueError):
            _reject('owner-approval-key-invalid')
        envelope_bytes = _canonical_bytes(envelope)
        envelope_digest = _digest_bytes(envelope_bytes)
        self._ledger.reserve_approval(request._approval_id, envelope,
                                      envelope_digest, request._intent_digest)
        existing = self._verified_by_request.get(request._approval_id)
        if existing is not None:
            if existing._approval_digest != envelope_digest:
                _reject('owner-approval-replay-conflict')
            return existing
        verified = self._make_verified(request, payload, envelope_digest, envelope_bytes)
        self._verified[id(verified)] = verified
        self._verified_by_request[request._approval_id] = verified
        return verified

    def _make_verified(self, request: OwnerApprovalRequest, payload: dict[str, Any],
                       envelope_digest: str, envelope_bytes: bytes) -> VerifiedOwnerApproval:
        return VerifiedOwnerApproval(_CAPABILITY_SEAL, self, request, payload,
                                     envelope_digest, envelope_bytes)

    @_serialize_registry_access
    def observe_approval(self, original_request: OwnerApprovalRequest) -> OriginalApprovalOutcome:
        request = self._require_request(original_request)
        saved_request, approval, dispatched = self._ledger.observe(request._approval_id)
        if saved_request is None or saved_request['intentDigest'] != request._intent_digest:
            _reject('owner-approval-original-request-unavailable')
        pending, effect_outcome = self._ledger.observe_effect(request._approval_id)
        effect_status = ('prepared' if pending is None else 'effect-pending')
        receipt_digest = None
        if effect_outcome is not None:
            effect_status = effect_outcome['status']
            receipt_digest = effect_outcome['receiptDigest']
        elif dispatched and pending is None:
            effect_status = 'legacy-dispatch-recorded'
        return OriginalApprovalOutcome(
            approval_id=request._approval_id, scope=request._scope,
            intent_digest=request._intent_digest,
            approval_status='consumed' if approval else 'prepared',
            approval_digest=approval['envelopeDigest'] if approval else None,
            effect_status=effect_status,
            effect_digest=pending['reservationDigest'] if pending else None,
            effect_receipt_digest=receipt_digest)

    @_serialize_registry_access
    def _require_request(self, value: object) -> OwnerApprovalRequest:
        if (type(value) is not OwnerApprovalRequest or value._issuer is not self
                or value._kind != _REQUEST_KIND or self._requests.get(id(value)) is not value):
            _reject('owner-approval-original-request-required')
        return value

    @_serialize_registry_access
    def _resolve_verified_approval(self, value: object, *,
                                   original_request: OwnerApprovalRequest,
                                   scope: str, intent_digest: str) -> VerifiedOwnerApproval:
        request = self._require_request(original_request)
        if (type(value) is not VerifiedOwnerApproval or value._issuer is not self
                or value._kind != _VERIFIED_KIND or self._verified.get(id(value)) is not value
                or value._request is not request or value.scope != scope
                or value.intent_digest != intent_digest):
            _reject('owner-approval-capability-mismatch')
        return value

    @_serialize_registry_access
    def _consume_verified_approval(self, value: object, *,
                                   original_request: OwnerApprovalRequest,
                                   scope: str, intent_digest: str) -> VerifiedOwnerApproval:
        """Refuse legacy dispatch without an original native reservation."""
        self._resolve_verified_approval(
            value, original_request=original_request, scope=scope,
            intent_digest=intent_digest)
        _reject('owner-native-reservation-required')

    @_serialize_registry_access
    def _bind_native_effect_issuer(self, supervisor: object) -> None:
        from .ingress_local_postgres import LocalPostgresSupervisor

        if (type(supervisor) is not LocalPostgresSupervisor
                or getattr(supervisor, 'authority_context', None) is not self._context
                or getattr(supervisor, '_owner_authority', None) is not self):
            _reject('owner-native-issuer-untrusted')
        if self._native_supervisor not in (None, supervisor):
            _reject('owner-native-issuer-already-bound')
        self._native_supervisor = supervisor

    @_serialize_registry_access
    def bind_native_effect(self, verified_approval: VerifiedOwnerApproval,
                           reservation: object) -> OriginalEffectBinding:
        if self._native_supervisor is None:
            _reject('owner-native-issuer-unavailable')
        request = (verified_approval._request
                   if type(verified_approval) is VerifiedOwnerApproval else None)
        request = self._require_request(request)
        verified = self._resolve_verified_approval(
            verified_approval, original_request=request, scope=request._scope,
            intent_digest=request._intent_digest)
        from .ingress_local_postgres import _NativeEffectReservation

        if type(reservation) is not _NativeEffectReservation:
            _reject('owner-native-reservation-untrusted')
        resolver = getattr(type(self._native_supervisor),
                           '_resolve_native_effect_reservation', None)
        bound = getattr(self._native_supervisor, '_resolve_native_effect_reservation', None)
        if resolver is None or getattr(bound, '__func__', None) is not resolver:
            _reject('owner-native-reservation-untrusted')
        resolver_result = self._native_supervisor._resolve_native_effect_reservation(
            reservation, verified)
        if resolver_result is None:
            _reject('owner-native-reservation-untrusted')
        if (reservation.scope != request._scope
                or tuple(reservation.effect_key) != request._effect_key
                or reservation.purpose != self._context._purpose
                or reservation.request_id != request._approval_id
                or reservation.request_digest != request._intent_digest
                or reservation.approval_id != verified.approval_id
                or reservation.approval_digest != verified.approval_digest):
            _reject('owner-native-reservation-mismatch')
        reservation_digest = _digest(reservation.journal_record_digest)
        existing = next((binding for binding in self._effect_bindings.values()
                         if binding._request is request), None)
        if existing is not None:
            if existing._reservation is reservation:
                return existing
            _reject('owner-approval-already-consumed')
        self._ledger.bind_effect(request._approval_id, reservation_digest)
        binding = OriginalEffectBinding(_EFFECT_SEAL, self, request, reservation,
                                        reservation_digest)
        self._effect_bindings[id(binding)] = binding
        return binding

    @_serialize_registry_access
    def record_native_outcome(self, binding: OriginalEffectBinding,
                              outcome: object) -> OriginalApprovalOutcome:
        if (type(binding) is not OriginalEffectBinding or binding._issuer is not self
                or self._effect_bindings.get(id(binding)) is not binding
                or binding._kind != 'umf.owner-native-effect-binding/0.1'):
            _reject('owner-native-effect-binding-required')
        if self._native_supervisor is None:
            _reject('owner-native-issuer-unavailable')
        from .ingress_local_postgres import _VerifiedNativeEffectOutcome

        if type(outcome) is not _VerifiedNativeEffectOutcome:
            _reject('owner-native-outcome-untrusted')
        resolver = getattr(type(self._native_supervisor),
                           '_resolve_native_effect_outcome', None)
        bound = getattr(self._native_supervisor, '_resolve_native_effect_outcome', None)
        if resolver is None or getattr(bound, '__func__', None) is not resolver:
            _reject('owner-native-outcome-untrusted')
        verified = self._native_supervisor._resolve_native_effect_outcome(
            outcome, binding._reservation)
        if verified is None or outcome.receipt_digest != _digest(outcome.receipt_digest):
            _reject('owner-native-outcome-untrusted')
        if outcome.status not in ('confirmed', 'known-aborted'):
            _reject('owner-native-outcome-untrusted')
        status = 'confirmed' if outcome.status == 'confirmed' else 'aborted'
        self._ledger.finish_effect(binding._request._approval_id,
                                   binding._reservation_digest, status=status,
                                   receipt_digest=outcome.receipt_digest)
        return self.observe_original_request(binding._request._context,
                                             binding._request._effect_key)

    @_serialize_registry_access
    def observe_original_request(self, context: OwnerAuthorityContext,
                                 effect_key: tuple[object, ...]) -> OriginalApprovalOutcome:
        if (type(context) is not OwnerAuthorityContext or context is not self._context
                or _CONTEXTS.get(id(context)) is not context):
            _reject('owner-authority-context-mismatch')
        if type(effect_key) is not tuple or not effect_key:
            _reject('owner-approval-effect-key-invalid')
        stable = [context._purpose, context._custodian_id, context._supervisor_id,
                  context._provider_id, context._installation_id, *effect_key]
        request = self._ledger.find_effect(stable, context._purpose)
        if request is None:
            _reject('owner-approval-original-request-unavailable')
        _saved_request, approval, _dispatched = self._ledger.observe(request['approvalId'])
        pending, outcome = self._ledger.observe_effect(request['approvalId'])
        if approval is None:
            approval_status, approval_digest = 'prepared', None
        else:
            approval_status, approval_digest = 'consumed', approval['envelopeDigest']
        effect_status = ('prepared' if pending is None else 'effect-pending')
        if outcome is not None:
            effect_status = outcome['status']
        return OriginalApprovalOutcome(
            approval_id=request['approvalId'], scope=request['scope'],
            intent_digest=request['intentDigest'], approval_status=approval_status,
            approval_digest=approval_digest,
            effect_status=effect_status,
            effect_digest=pending['reservationDigest'] if pending else None,
            effect_receipt_digest=outcome['receiptDigest'] if outcome else None)

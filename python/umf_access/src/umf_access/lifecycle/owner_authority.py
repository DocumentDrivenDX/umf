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
_SIGNATURE_DOMAIN = b'umf.host-owner-approval/0.1\x00'
_SCOPES = (
    'local-target-creation', 'local-target-registration',
    'native-principal-preparation', 'native-store-creation',
    'disabled-epoch-provision', 'generation-ingress-transition',
)
_UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
_HEX = re.compile(r'^[a-f0-9]{64}$')
_B64URL = re.compile(r'^[A-Za-z0-9_-]+$')
_MAX_INTENT = 65_536
_MAX_LEDGER = 8 * 1024 * 1024
_MAX_LEDGER_RECORDS = 4096
_SAFE_INT = 9_007_199_254_740_991
_REQUEST_KIND = 'umf.owner-approval-request/0.1'
_VERIFIED_KIND = 'umf.owner-approval-verified/0.1'
_CAPABILITY_SEAL = object()


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


def _plain_json(value: object, *, depth: int = 0, count: list[int] | None = None) -> object:
    """Copy a strict JSON value and reject subclasses, floats, and cycles."""
    if count is None:
        count = [0]
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
            value.encode('utf-8')
        except UnicodeEncodeError:
            _reject('owner-authority-invalid')
        return value
    if type(value) is list:
        if len(value) > 4096:
            _reject('owner-authority-capacity')
        return [_plain_json(item, depth=depth + 1, count=count) for item in value]
    if type(value) is dict:
        if len(value) > 128 or any(type(key) is not str or not key.isascii() for key in value):
            _reject('owner-authority-invalid')
        return {key: _plain_json(item, depth=depth + 1, count=count)
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


def _validate_native_store_intent(intent: dict[str, Any], authority_id: str,
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
        if type(oid) is not int or not 1 <= oid <= _SAFE_INT:
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
                or member > _SAFE_INT or role > _SAFE_INT
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


def _validate_config(value: object) -> tuple[dict[str, Any], tuple[dict[str, Any], ...]]:
    config = _plain_json(value)
    _closed(config, {'profile', 'authorityId', 'policyRevision', 'keys'},
            'owner-authority-config-invalid')
    if config['profile'] != OWNER_AUTHORITY_PROFILE:
        _reject('owner-authority-config-invalid')
    _uuid(config['authorityId'])
    _text(config['policyRevision'])
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
    if len(lines) > _MAX_LEDGER_RECORDS:
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
    authority_id = records[0]['authorityId']
    for record in records[1:]:
        kind = record['kind']
        payload = record['payload']
        if kind == 'request-prepared':
            if set(payload) != {'approvalId', 'scope', 'intentDigest', 'payloadDigest',
                                'intent', 'signedPayload', 'intentBytes'}:
                _reject('owner-approval-ledger-corrupt')
            approval_id = payload['approvalId']
            signed = payload['signedPayload']
            if (type(approval_id) is not str or approval_id in requests
                    or type(payload['scope']) is not str or payload['scope'] not in _SCOPES
                    or type(payload['intentDigest']) is not str
                    or not _HEX.fullmatch(payload['intentDigest'])
                    or type(payload['payloadDigest']) is not str
                    or not _HEX.fullmatch(payload['payloadDigest'])
                    or type(signed) is not dict
                    or set(signed) != {'profile', 'authorityId', 'policyRevision', 'keyId',
                                       'principalId', 'approvalId', 'scope', 'custodianId',
                                       'supervisorId', 'providerId', 'installationId',
                                       'intentDigest'}
                    or signed.get('profile') != OWNER_APPROVAL_PROFILE
                    or signed.get('authorityId') != authority_id
                    or signed.get('approvalId') != approval_id
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
            if (type(payload['intent']) is not dict or intent != payload['intent']
                    or _digest_bytes(intent_bytes) != payload['intentDigest']
                    or signed.get('custodianId') != intent.get('custodianId')
                    or signed.get('supervisorId') != intent.get('supervisorId')
                    or signed.get('providerId') != intent.get('providerId')
                    or signed.get('installationId') != intent.get('installationId')):
                _reject('owner-approval-ledger-corrupt')
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
        else:
            _reject('owner-approval-ledger-corrupt')


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
        if len(original.splitlines()) + 1 > _MAX_LEDGER_RECORDS:
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

    def find_or_reserve_request(self, *, scope: str, intent_digest: str,
                                target: dict[str, str], intent: dict[str, Any],
                                intent_bytes: bytes, create_payload) -> dict[str, Any]:
        def apply(fd: int, records: list[dict[str, Any]]) -> dict[str, Any]:
            for row in reversed(records[1:]):
                if row['kind'] != 'request-prepared':
                    continue
                saved = row['payload']
                signed = saved['signedPayload']
                if (signed['scope'] == scope and signed['intentDigest'] == intent_digest
                        and signed['supervisorId'] == target['supervisorId']
                        and signed['custodianId'] == target['custodianId']
                        and signed['providerId'] == target['providerId']
                        and signed['installationId'] == target['installationId']):
                    if (saved['intent'] != intent
                            or saved['intentBytes'] != _base64url_encoded(intent_bytes)):
                        _reject('owner-approval-original-request-invalid')
                    return saved
            payload = create_payload()
            request = {'approvalId': payload['approvalId'], 'scope': scope,
                       'intentDigest': intent_digest,
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
        return self._with_records(apply)

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
        return self._with_records(apply)

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
        self._with_records(apply)


def _fsync_parent(parent: Path) -> None:
    fd = os.open(parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class OwnerApprovalRequest:
    """Opaque immutable request bound to exact configured authority and bytes."""

    __slots__ = ('_approval_id', '_intent_bytes', '_intent_digest', '_issuer',
                 '_kind', '_payload_bytes', '_scope')

    def __init__(self, seal: object, issuer: object, *, approval_id: str, scope: str,
                 intent_bytes: bytes, intent_digest: str,
                 payload_bytes: bytes):
        if seal is not _CAPABILITY_SEAL:
            raise TypeError('owner approval requests are authority-issued')
        object.__setattr__(self, '_issuer', issuer)
        object.__setattr__(self, '_kind', _REQUEST_KIND)
        object.__setattr__(self, '_approval_id', approval_id)
        object.__setattr__(self, '_scope', scope)
        object.__setattr__(self, '_intent_bytes', intent_bytes)
        object.__setattr__(self, '_intent_digest', intent_digest)
        object.__setattr__(self, '_payload_bytes', payload_bytes)

    def __setattr__(self, _name: str, _value: object) -> None:
        raise AttributeError('owner approval request is immutable')

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('owner approval requests cannot be serialized')

    def __repr__(self) -> str:
        return '<OwnerApprovalRequest opaque>'


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
        '_keys',
        '_ledger',
        '_policy_revision',
        '_registry_lock',
        '_requests',
        '_requests_by_approval',
        '_verified',
        '_verified_by_request',
    )

    def __init__(self, configuration: object, *, ledger_path: str | os.PathLike[str]):
        config, keys = _validate_config(configuration)
        config_bytes = _canonical_bytes(config)
        self._config = config
        self._keys = keys
        self._authority_id = config['authorityId']
        self._policy_revision = config['policyRevision']
        self._config_digest = _digest_bytes(config_bytes)
        self._ledger = _ApprovalLedger(ledger_path, self._authority_id, self._config_digest)
        self._requests: dict[int, OwnerApprovalRequest] = {}
        self._requests_by_approval: dict[str, OwnerApprovalRequest] = {}
        self._verified: dict[int, VerifiedOwnerApproval] = {}
        self._verified_by_request: dict[str, VerifiedOwnerApproval] = {}
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

    @_serialize_registry_access
    def prepare_request(self, scope: str, exact_intent_bytes: bytes) -> OwnerApprovalRequest:
        if type(scope) is not str or scope not in _SCOPES:
            _reject('owner-approval-scope-invalid')
        intent = _parse_canonical_intent(exact_intent_bytes)
        if scope == 'native-store-creation':
            target = _validate_native_store_intent(intent, self._authority_id,
                                                   self._policy_revision)
        else:
            # Other G11 scope-specific schemas must be adopted before admission.
            _reject('owner-intent-scope-unsupported')
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
                    'scope': scope, 'custodianId': target['custodianId'],
                    'supervisorId': target['supervisorId'], 'providerId': target['providerId'],
                    'installationId': target['installationId'], 'intentDigest': intent_digest}
        prior = self._ledger.find_or_reserve_request(
            scope=scope, intent_digest=intent_digest, target=target, intent=intent,
            intent_bytes=exact_intent_bytes, create_payload=create_payload)
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
                                     intent_digest, payload_bytes)
        self._requests[id(request)] = request
        self._requests_by_approval[approval_id] = request
        return request

    def _make_request(self, approval_id: str, scope: str, intent_bytes: bytes,
                      intent_digest: str, payload_bytes: bytes) -> OwnerApprovalRequest:
        return OwnerApprovalRequest(_CAPABILITY_SEAL, self, approval_id=approval_id,
                                    scope=scope, intent_bytes=bytes(intent_bytes),
                                    intent_digest=intent_digest, payload_bytes=payload_bytes)

    @_serialize_registry_access
    def export_signing_request(self, original_request: OwnerApprovalRequest) -> dict[str, Any]:
        request = self._require_request(original_request)
        return {'payload': _decode_canonical_object(request._payload_bytes),
                'intent': _parse_canonical_intent(request._intent_bytes)}

    @_serialize_registry_access
    def verify_approval(self, original_request: OwnerApprovalRequest,
                        signed_envelope: object) -> VerifiedOwnerApproval:
        request = self._require_request(original_request)
        envelope = _plain_json(signed_envelope)
        _closed(envelope, {'payload', 'signature'}, 'owner-approval-envelope-invalid')
        payload = _plain_json(envelope['payload'])
        _closed(payload, {'profile', 'authorityId', 'policyRevision', 'keyId', 'principalId',
                          'approvalId', 'scope', 'custodianId', 'supervisorId', 'providerId',
                          'installationId', 'intentDigest'}, 'owner-approval-envelope-invalid')
        payload_bytes = _canonical_bytes(payload)
        if payload_bytes != request._payload_bytes:
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
        return OriginalApprovalOutcome(
            approval_id=request._approval_id, scope=request._scope,
            intent_digest=request._intent_digest,
            approval_status='approved' if approval else 'prepared',
            approval_digest=approval['envelopeDigest'] if approval else None,
            effect_status=('dispatch-reserved-outcome-owned-by-native-journal' if dispatched
                           else 'not-dispatched'))

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
        """Durably reserve dispatch before the native supervisor begins its effect."""
        verified = self._resolve_verified_approval(
            value, original_request=original_request, scope=scope,
            intent_digest=intent_digest)
        self._ledger.reserve_effect_dispatch(verified.approval_id,
                                             verified.approval_digest)
        return verified

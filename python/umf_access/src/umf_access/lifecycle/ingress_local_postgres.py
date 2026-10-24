# SPDX-License-Identifier: MIT OR Apache-2.0
"""Owner-operated PostgreSQL 18.6 supervisor for the local G11 profile.

This module is intentionally host-only.  It is not imported by the browser
surface or selected by migration plans.  The implementation creates a fresh,
private PostgreSQL cluster and keeps its own creation/launch journal outside
PGDATA.  The compiled Darwin observer is a separately pinned input; until its
actual binary/SDK and the whole profile pass native qualification, production
bootstrap must not call this module.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import secrets
import signal
import stat
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .generation_ingress import OwnerEnrollmentRequest

_JOURNAL_PROFILE = 'umf.local-postgresql-supervisor-journal/0.1'
_OWNER_KIND = 'umf.local-owner-target-registration/0.1'
_ORIGIN_PROFILE = 'postgresql18-local-supervised-origin/0.1'
_ENDPOINT_PROFILE = 'umf.local-postgresql-endpoint-controller/0.1'
_OWNER_APPROVAL_SCOPE = 'enroll-owned-local-postgresql-target'
_VERIFIED_STORE_PREPARATION_SEAL = object()
_VERSION = '18.6'
_VERSION_NUM = 180006
_MAX_JOURNAL = 8 * 1024 * 1024
_MAX_EVENTS = 16_384
_MAX_SAFE = 9_007_199_254_740_991
_NATIVE_EFFECT_RESERVATION_SEAL = object()
_NATIVE_EFFECT_OUTCOME_SEAL = object()
_BOOTSTRAP_ISSUER_SEAL = object()
_BOOTSTRAP_ISSUERS: dict[int, object] = {}
_ROLE = re.compile(r'^[a-z][a-z0-9_]{0,62}$')
_HEX = re.compile(r'^[a-f0-9]{64}$')
_STORE_SCHEMA_PREFIXES = {
    'umf.pg-generation-ingress-store/0.1': 'umf_ingress_',
    'umf.native-row-originals-store/0.1': 'umf_originals_',
}
_ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC'}
_POSTGRES_SETTINGS = (
    "listen_addresses = '127.0.0.1'",
    'unix_socket_directories = \'\'',
    'ssl = off',
    "password_encryption = 'scram-sha-256'",
    'max_prepared_transactions = 0',
    "shared_preload_libraries = ''",
    "session_preload_libraries = ''",
    "local_preload_libraries = ''",
    "TimeZone = 'UTC'",
    "DateStyle = 'ISO, YMD'",
    "authentication_timeout = '10s'",
    "log_statement = 'none'",
    "log_min_error_statement = 'panic'",
    "log_error_verbosity = 'terse'",
)


class LocalPostgresError(RuntimeError):
    """Sanitized failure from the concrete local owner profile."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _canonical(value: Any) -> bytes:
    stack = [(value, 0)]
    nodes = 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > 100_000 or depth > 64:
            raise LocalPostgresError('supervisor-record-capacity')
        if item is None or type(item) is bool:
            continue
        if type(item) is int:
            if abs(item) > _MAX_SAFE:
                raise LocalPostgresError('supervisor-record-invalid')
        elif type(item) is str:
            try:
                item.encode('utf-8')
            except UnicodeEncodeError:
                raise LocalPostgresError('supervisor-record-invalid') from None
            if '\x00' in item:
                raise LocalPostgresError('supervisor-record-invalid')
        elif type(item) is list:
            stack.extend((x, depth + 1) for x in item)
        elif type(item) is dict:
            for key, child in item.items():
                if type(key) is not str or not key.isascii():
                    raise LocalPostgresError('supervisor-record-invalid')
                stack.extend(((key, depth + 1), (child, depth + 1)))
        else:
            raise LocalPostgresError('supervisor-record-invalid')
    try:
        raw = json.dumps(value, ensure_ascii=False, sort_keys=True,
                         separators=(',', ':'), allow_nan=False).encode('utf-8')
    except (TypeError, ValueError, UnicodeError, RecursionError):
        raise LocalPostgresError('supervisor-record-invalid') from None
    if len(raw) > _MAX_JOURNAL:
        raise LocalPostgresError('supervisor-record-capacity')
    return raw


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _sha_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
    except OSError:
        raise LocalPostgresError('supervisor-input-unavailable') from None
    return digest.hexdigest()


def _uuid(value: str) -> str:
    try:
        parsed = uuid.UUID(value)
    except (ValueError, TypeError, AttributeError):
        raise LocalPostgresError('supervisor-identity-invalid') from None
    if str(parsed) != value:
        raise LocalPostgresError('supervisor-identity-invalid')
    return value


def _role(value: str) -> str:
    if (type(value) is not str or not _ROLE.fullmatch(value)
            or value == 'postgres' or value.startswith('pg_')):
        raise LocalPostgresError('supervisor-role-name-invalid')
    return value


def _store_descriptor(profile: object, provider_id: object) -> dict[str, str]:
    if type(profile) is not str or profile not in _STORE_SCHEMA_PREFIXES:
        raise LocalPostgresError('local-postgresql-store-profile-unsupported')
    provider = _uuid(provider_id)
    return {'profile': profile, 'storeId': provider,
            'schemaName': _STORE_SCHEMA_PREFIXES[profile] + provider.replace('-', '')}


def _registration_intent_bytes(request: object) -> bytes:
    """Return the exact signed registration intent after checking its binding."""
    from .owner_authority import OwnerApprovalRequest

    if (type(request) is not OwnerApprovalRequest
            or type(request._intent_bytes) is not bytes
            or hashlib.sha256(request._intent_bytes).hexdigest() != request._intent_digest
            or request._scope != 'local-target-registration'):
        raise LocalPostgresError('local-postgresql-registration-request-invalid')
    return request._intent_bytes


def _owner_registration_approval_payload(events: object) -> dict[str, Any]:
    if type(events) is not list:
        raise LocalPostgresError('local-postgresql-store-preparation-unverified')
    matches = [event.get('payload') for event in events
               if type(event) is dict and event.get('kind') == 'owner-registration-approved']
    if len(matches) != 1 or type(matches[0]) is not dict:
        raise LocalPostgresError('local-postgresql-store-preparation-unverified')
    payload = matches[0]
    if (set(payload) != {'registrationId', 'payloadDigest', 'approvalId', 'approvalDigest'}
            or any(type(payload[key]) is not str for key in
                   ('registrationId', 'payloadDigest', 'approvalId', 'approvalDigest'))
            or _uuid(payload['registrationId']) != payload['registrationId']
            or not _HEX.fullmatch(payload['payloadDigest'])
            or _uuid(payload['approvalId']) != payload['approvalId']
            or not _HEX.fullmatch(payload['approvalDigest'])):
        raise LocalPostgresError('local-postgresql-store-preparation-unverified')
    return payload


def _private_directory(path: Path, *, create: bool = False) -> Path:
    if not path.is_absolute() or os.path.normpath(str(path)) != str(path):
        raise LocalPostgresError('supervisor-path-invalid')
    if create:
        try:
            path.mkdir(mode=0o700)
        except FileExistsError:
            raise LocalPostgresError('supervisor-path-already-exists') from None
        except OSError:
            raise LocalPostgresError('supervisor-path-create-failed') from None
    try:
        st = os.lstat(path)
    except OSError:
        raise LocalPostgresError('supervisor-path-unavailable') from None
    if (not stat.S_ISDIR(st.st_mode) or stat.S_ISLNK(st.st_mode)
            or st.st_uid != os.geteuid() or stat.S_IMODE(st.st_mode) != 0o700):
        raise LocalPostgresError('supervisor-path-unsafe')
    if path.resolve(strict=True) != path:
        raise LocalPostgresError('supervisor-path-unsafe')
    return path


def _regular_owned(path: Path, *, executable: bool = False) -> Path:
    try:
        resolved = path.resolve(strict=True)
        st = os.stat(resolved, follow_symlinks=False)
    except OSError:
        raise LocalPostgresError('supervisor-input-unavailable') from None
    if (not stat.S_ISREG(st.st_mode) or st.st_uid not in (0, os.geteuid())
            or st.st_mode & 0o022 or (executable and not st.st_mode & 0o111)):
        raise LocalPostgresError('supervisor-input-unsafe')
    return resolved


def _write_private(path: Path, data: bytes, *, exclusive: bool = True) -> None:
    flags = os.O_WRONLY | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0)
    flags |= os.O_EXCL if exclusive else os.O_TRUNC
    try:
        fd = os.open(path, flags, 0o600)
    except OSError:
        raise LocalPostgresError('supervisor-private-file-create-failed') from None
    try:
        os.fchmod(fd, 0o600)
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid() or st.st_nlink != 1:
            raise LocalPostgresError('supervisor-private-file-unsafe')
        view = memoryview(data)
        while view:
            written = os.write(fd, view)
            if written <= 0:
                raise LocalPostgresError('supervisor-private-file-write-failed')
            view = view[written:]
        os.fsync(fd)
    except OSError:
        raise LocalPostgresError('supervisor-private-file-write-failed') from None
    finally:
        os.close(fd)
    _fsync_directory(path.parent)


def _fsync_directory(path: Path) -> None:
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except OSError:
        raise LocalPostgresError('supervisor-directory-durability-unverified') from None


def _read_private(path: Path) -> bytes:
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    except OSError:
        raise LocalPostgresError('supervisor-private-file-unavailable') from None
    try:
        st = os.fstat(fd)
        if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                or st.st_nlink != 1 or stat.S_IMODE(st.st_mode) != 0o600
                or st.st_size > _MAX_JOURNAL):
            raise LocalPostgresError('supervisor-private-file-unsafe')
        raw = bytearray()
        while len(raw) <= _MAX_JOURNAL:
            chunk = os.read(fd, min(65_536, _MAX_JOURNAL + 1 - len(raw)))
            if not chunk:
                break
            raw.extend(chunk)
        if len(raw) > _MAX_JOURNAL:
            raise LocalPostgresError('supervisor-record-capacity')
        os.fsync(fd)
    except OSError:
        raise LocalPostgresError('supervisor-private-file-read-failed') from None
    finally:
        os.close(fd)
    _fsync_directory(path.parent)
    return bytes(raw)


def _read_owned_regular_nofollow(path: Path, *, limit: int = 4096) -> bytes:
    """Read a small owner-controlled PostgreSQL identity file without symlinks."""
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    except OSError:
        raise LocalPostgresError('supervisor-native-identity-file-unavailable') from None
    try:
        st = os.fstat(fd)
        if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                or st.st_nlink != 1 or st.st_size > limit):
            raise LocalPostgresError('supervisor-native-identity-file-unsafe')
        raw = bytearray()
        while len(raw) <= limit:
            chunk = os.read(fd, min(1024, limit + 1 - len(raw)))
            if not chunk:
                break
            raw.extend(chunk)
        if len(raw) > limit:
            raise LocalPostgresError('supervisor-native-identity-file-oversized')
        return bytes(raw)
    except OSError:
        raise LocalPostgresError('supervisor-native-identity-file-read-failed') from None
    finally:
        os.close(fd)


def _postmaster_pidfile_matches(raw: bytes, *, pid: int, data_directory: Path,
                                port: int) -> bool:
    try:
        lines = raw.decode('ascii').splitlines()
    except UnicodeDecodeError:
        return False
    return (len(lines) >= 6 and lines[0] == str(pid)
            and lines[1] == str(data_directory) and lines[3] == str(port)
            and lines[4] == '' and lines[5] == '127.0.0.1')


def _no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise LocalPostgresError('supervisor-journal-corrupt')
        result[key] = value
    return result


class _SupervisorJournal:
    """Private owner journal with lock, append order and atomic durability."""

    __slots__ = ('lock_path', 'path', 'supervisor_id')

    def __init__(self, path: Path, supervisor_id: str):
        self.path = path
        self.lock_path = path.with_name(path.name + '.lock')
        self.supervisor_id = _uuid(supervisor_id)
        _private_directory(path.parent)

    def _locked(self):
        flags = os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0)
        try:
            fd = os.open(self.lock_path, flags, 0o600)
            os.fchmod(fd, 0o600)
            st = os.fstat(fd)
            if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1
                    or st.st_uid != os.geteuid()):
                raise LocalPostgresError('supervisor-lock-unsafe')
            fcntl.flock(fd, fcntl.LOCK_EX)
            return fd
        except BaseException:
            if 'fd' in locals():
                os.close(fd)
            raise

    def read(self) -> dict[str, Any]:
        try:
            raw = _read_private(self.path)
        except LocalPostgresError as exc:
            if exc.code == 'supervisor-private-file-unavailable' and not self.path.exists():
                return {'profile': _JOURNAL_PROFILE, 'supervisorId': self.supervisor_id,
                        'sequence': 0, 'headDigest': '0' * 64, 'events': []}
            raise
        try:
            doc = json.loads(raw, object_pairs_hook=_no_duplicates,
                             parse_constant=lambda _value: (_ for _ in ()).throw(
                                 LocalPostgresError('supervisor-journal-corrupt')))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise LocalPostgresError('supervisor-journal-corrupt') from None
        if _canonical(doc) != raw:
            raise LocalPostgresError('supervisor-journal-noncanonical')
        if (type(doc) is not dict or set(doc) != {'profile', 'supervisorId', 'sequence',
                                                  'headDigest', 'events'}
                or doc['profile'] != _JOURNAL_PROFILE
                or doc['supervisorId'] != self.supervisor_id
                or type(doc['events']) is not list or len(doc['events']) > _MAX_EVENTS):
            raise LocalPostgresError('supervisor-journal-corrupt')
        previous = '0' * 64
        for index, event in enumerate(doc['events'], 1):
            if (type(event) is not dict or set(event) != {'sequence', 'kind', 'payload',
                                                         'previousDigest', 'recordDigest'}
                    or type(event['sequence']) is not int or event['sequence'] != index
                    or event['previousDigest'] != previous
                    or type(event['kind']) is not str or type(event['payload']) is not dict):
                raise LocalPostgresError('supervisor-journal-corrupt')
            unhashed = {key: event[key] for key in ('sequence', 'kind', 'payload', 'previousDigest')}
            if event['recordDigest'] != _digest(unhashed):
                raise LocalPostgresError('supervisor-journal-corrupt')
            previous = event['recordDigest']
        if (type(doc['sequence']) is not int or doc['sequence'] != len(doc['events'])
                or doc['headDigest'] != previous):
            raise LocalPostgresError('supervisor-journal-corrupt')
        self._replay(doc['events'])
        return doc

    def _replay(self, events: list[dict[str, Any]]) -> None:
        created = initdb = False
        launch_pending = False
        running = False
        stop_pending = False
        launch_number = 0
        creation: dict[str, Any] | None = None
        initdb_receipt: dict[str, Any] | None = None
        current_launch: dict[str, Any] | None = None
        registration_done = authority_done = store_intent = store_done = False
        registration_request: dict[str, Any] | None = None
        registration_signature_verified = False
        principal_request: dict[str, Any] | None = None
        native_effects: dict[str, dict[str, Any]] = {}
        principal_stages: dict[str, dict[str, str | None]] = {}
        for event in events:
            kind = event['kind']
            payload = event['payload']
            if kind == 'creation-intent':
                if created or set(payload) != {'profile', 'supervisorId', 'clusterId', 'incarnationId', 'installationId',
                        'ownerUid', 'databaseName', 'businessOwner', 'maintenanceName',
                        'controllerName', 'controlDirectory', 'dataDirectory', 'postgresPath',
                        'postgresSha256', 'initdbPath', 'initdbSha256', 'port',
                        'configDigest', 'hbaDigest', 'purpose', 'requestDigest',
                        'approvalId', 'approvalDigest'}:
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                if (payload['profile'] != 'umf.local-postgresql-create-request/0.1'
                        or payload['purpose'] not in ('production', 'native-acceptance')
                        or payload['supervisorId'] != self.supervisor_id
                        or not _HEX.fullmatch(payload['requestDigest'])
                        or not _HEX.fullmatch(payload['approvalDigest'])):
                    raise LocalPostgresError('supervisor-journal-origin-mismatch')
                created = True
                creation = payload
            elif kind == 'initdb-confirmed':
                if not created or initdb or set(payload) != {'clusterId', 'dataDevice',
                        'dataInode', 'ownerUid', 'initdbReceiptDigest'}:
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                initdb = True
                initdb_receipt = payload
            elif kind == 'launch-intent':
                if (not initdb or running or launch_pending
                        or payload.get('launchNumber') != launch_number + 1
                        or set(payload) != {
                        'launchId', 'launchNumber', 'argv', 'configDigest', 'hbaDigest',
                        'binarySha256', 'dataDevice', 'dataInode'}):
                    raise LocalPostgresError('supervisor-journal-order-invalid')
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
                    raise LocalPostgresError('supervisor-journal-origin-mismatch')
                launch_number += 1
                current_launch = payload
                launch_pending = True
            elif kind == 'launch-confirmed':
                if not launch_pending or running or set(payload) != {'launchId', 'process',
                        'nativeObservationDigest', 'endpointReceiptDigest'}:
                    raise LocalPostgresError('supervisor-journal-order-invalid')
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
                    raise LocalPostgresError('supervisor-journal-origin-mismatch')
                if (not _HEX.fullmatch(payload['nativeObservationDigest'])
                        or not _HEX.fullmatch(payload['endpointReceiptDigest'])):
                    raise LocalPostgresError('supervisor-journal-corrupt')
                launch_pending = False
                running = True
            elif kind == 'stop-intent':
                if (not running or stop_pending or current_launch is None
                        or set(payload) != {'launchId', 'processStartToken'}
                        or payload['launchId'] != current_launch['launchId']
                        or payload['processStartToken'] !=
                           next((e['payload']['process']['startToken'] for e in reversed(events[:-1])
                                 if e['kind'] == 'launch-confirmed'), None)):
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                stop_pending = True
            elif kind == 'stop-confirmed':
                if not stop_pending or not running or set(payload) != {
                        'launchId', 'processGroupAbsent', 'controlDataDigest'}:
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                if payload['processGroupAbsent'] is not True:
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                if not _HEX.fullmatch(payload['controlDataDigest']):
                    raise LocalPostgresError('supervisor-journal-corrupt')
                running = False
                stop_pending = False
            elif kind == 'owner-registration-approved':
                if (not running or registration_done or registration_request is None
                        or not registration_signature_verified
                        or set(payload) != {'registrationId', 'payloadDigest',
                                            'approvalId', 'approvalDigest'}
                        or payload['registrationId'] != registration_request['registrationId']
                        or payload['approvalId'] != registration_request['approvalId']
                        or payload['approvalDigest'] != registration_request['approvalDigest']):
                    raise LocalPostgresError('supervisor-journal-order-invalid')
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
                    raise LocalPostgresError('supervisor-journal-order-invalid')
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
                    raise LocalPostgresError('supervisor-journal-order-invalid')
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
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                _uuid(payload['registrationId']); _uuid(payload['approvalId'])
                registration_signature_verified = True
            elif kind == 'authority-preparation-approved':
                if (not running or authority_done or set(payload) != {'installationId', 'payloadDigest',
                                                    'approvalId', 'approvalDigest'}):
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                authority_done = True
            elif kind == 'store-creation-intent':
                if (not running or not registration_done or not authority_done or store_intent
                        or set(payload) != {'storeId', 'payloadDigest', 'schemaName'}):
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                store_intent = True
            elif kind == 'store-creation-confirmed':
                if (not running or not store_intent or store_done or set(payload) != {'storeId', 'schemaOid',
                                                    'nativeReceiptDigest'}):
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                store_done = True
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
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                if (payload['scope'] == 'native-principal-preparation'
                        and (principal_request is None
                             or principal_request['requestDigest'] != payload['requestDigest'])):
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                if (payload['scope'] == 'local-target-registration'
                        and (registration_request is None
                             or not registration_signature_verified
                             or registration_request['requestDigest'] != payload['requestDigest'])):
                    raise LocalPostgresError('supervisor-journal-order-invalid')
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
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                stages['roles'] = 'pending:' + payload['preparationId']
            elif kind == 'principal-roles-confirmed':
                reservation_id = payload.get('reservationId') if type(payload) is dict else None
                stages = principal_stages.get(reservation_id)
                if (not running or stages is None or stages['roles'] is None
                        or stages['roles'].startswith('confirmed:')
                        or set(payload) != {'reservationId', 'observationDigest'}
                        or not _HEX.fullmatch(payload['observationDigest'])):
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                stages['roles'] = 'confirmed:' + payload['observationDigest']
            elif kind == 'principal-database-intent':
                reservation_id = payload.get('reservationId') if type(payload) is dict else None
                stages = principal_stages.get(reservation_id)
                if (not running or stages is None or stages['roles'] is None
                        or not stages['roles'].startswith('confirmed:')
                        or stages['database'] is not None
                        or set(payload) != {'reservationId', 'databaseName'}
                        or type(payload['databaseName']) is not str):
                    raise LocalPostgresError('supervisor-journal-order-invalid')
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
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                stages['database'] = ('confirmed:' + str(payload['databaseOid']) + ':'
                                      + payload['systemIdentifier'])
            elif kind in ('native-effect-confirmed', 'native-effect-aborted'):
                scope = (native_effects.get(payload.get('reservationId'), {})
                         .get('intent', {}).get('scope'))
                if ((not running and scope != 'local-target-creation')
                        or set(payload) != {'reservationId', 'receiptDigest'}
                        or payload['reservationId'] not in native_effects
                        or native_effects[payload['reservationId']]['outcome'] is not None
                        or not _HEX.fullmatch(payload['receiptDigest'])):
                    raise LocalPostgresError('supervisor-journal-order-invalid')
                if scope == 'native-principal-preparation':
                    stages = principal_stages[payload['reservationId']]
                    if (stages['roles'] is None or not stages['roles'].startswith('confirmed:')
                            or stages['database'] is None
                            or not stages['database'].startswith('confirmed:')):
                        raise LocalPostgresError('supervisor-journal-order-invalid')
                native_effects[payload['reservationId']]['outcome'] = (
                    'confirmed' if kind == 'native-effect-confirmed' else 'known-aborted',
                    payload['receiptDigest'])
            elif kind == 'creation-finalized':
                if (not running or not created or not initdb
                        or set(payload) != {'receipt', 'receiptDigest'}
                        or type(payload['receipt']) is not dict
                        or _digest(payload['receipt']) != payload['receiptDigest']
                        or not _HEX.fullmatch(payload['receiptDigest'])):
                    raise LocalPostgresError('supervisor-journal-order-invalid')
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
                    raise LocalPostgresError('supervisor-journal-origin-mismatch')
            else:
                raise LocalPostgresError('supervisor-journal-corrupt')

    def append(self, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        if type(payload) is not dict:
            raise LocalPostgresError('supervisor-journal-invalid')
        _canonical(payload)
        fd = self._locked()
        try:
            doc = self.read()
            event = {'sequence': doc['sequence'] + 1, 'kind': kind,
                     'payload': dict(payload), 'previousDigest': doc['headDigest']}
            event['recordDigest'] = _digest(event)
            events = [*doc['events'], event]
            if len(events) > _MAX_EVENTS:
                raise LocalPostgresError('supervisor-journal-capacity')
            self._replay(events)
            encoded = _canonical({'profile': _JOURNAL_PROFILE,
                                  'supervisorId': self.supervisor_id,
                                  'sequence': event['sequence'],
                                  'headDigest': event['recordDigest'], 'events': events})
            self._atomic_replace(encoded)
            return dict(event)
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)

    def _atomic_replace(self, data: bytes) -> None:
        fd = -1
        name: str | None = None
        try:
            fd, name = tempfile.mkstemp(prefix='.owner-journal-', dir=self.path.parent)
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, 'wb', closefd=True) as stream:
                fd = -1
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, self.path)
            name = None
            _fsync_directory(self.path.parent)
        except OSError:
            raise LocalPostgresError('supervisor-journal-write-failed') from None
        finally:
            if fd >= 0:
                os.close(fd)
            if name:
                try:
                    os.unlink(name)
                except OSError:
                    pass


@dataclass(frozen=True, slots=True)
class LocalPostgresProfile:
    """Trusted installed host profile, never constructed from migration input."""

    control_home: Path
    data_home: Path
    postgres_binary: Path
    initdb_binary: Path
    process_observer: Path
    process_observer_sha256: str
    port: int
    database_name: str
    business_owner: str
    custodian_id: str
    supervisor_id: str
    provider_id: str
    installation_id: str
    purpose: str

    def __post_init__(self) -> None:
        if os.name != 'posix' or not sys_platform_darwin():
            raise LocalPostgresError('local-postgresql-profile-unsupported-platform')
        if type(self.port) is not int or not 1 <= self.port <= 65535:
            raise LocalPostgresError('local-postgresql-port-invalid')
        _role(self.database_name)
        _role(self.business_owner)
        _uuid(self.custodian_id)
        _uuid(self.supervisor_id)
        _uuid(self.provider_id)
        if (type(self.installation_id) is not str
                or not 1 <= len(self.installation_id.encode('utf-8')) <= 128
                or '\x00' in self.installation_id
                or self.purpose not in ('production', 'native-acceptance')):
            raise LocalPostgresError('local-postgresql-profile-invalid')
        if self.supervisor_id == self.provider_id:
            raise LocalPostgresError('local-postgresql-profile-invalid')
        if type(self.process_observer_sha256) is not str or not _HEX.fullmatch(self.process_observer_sha256):
            raise LocalPostgresError('local-postgresql-observer-pin-invalid')
        for name in ('control_home', 'data_home'):
            path = getattr(self, name)
            if not isinstance(path, Path):
                raise LocalPostgresError('local-postgresql-profile-invalid')
            _private_directory(path)
        if (self.control_home == self.data_home
                or self.control_home in self.data_home.parents
                or self.data_home in self.control_home.parents):
            raise LocalPostgresError('local-postgresql-roots-overlap')
        for name in ('postgres_binary', 'initdb_binary', 'process_observer'):
            if not isinstance(getattr(self, name), Path):
                raise LocalPostgresError('local-postgresql-profile-invalid')


class _LocalOwnerBootstrapIssuer:
    """Original private host enrollment used to bind the immutable authority context.

    This is created by the trusted installation factory, before a target exists.
    It is deliberately not derived from a UID, public registration, or journal
    dictionary and is never serialized as an authority.
    """

    __slots__ = (
        '_configuration_bytes',
        '_configuration_digest',
        '_context_bytes',
        '_context_material',
        '_enrollment_digest',
        '_enrollment_id',
        '_enrollment_path',
        '_installation_id',
        '_issuer_id',
        '_profile',
        '_purpose',
    )

    def __init__(self, seal: object, profile: LocalPostgresProfile,
                 configuration_digest: str, *, enrollment_id: str,
                 enrollment_path: Path, enrollment_digest: str,
                 configuration_bytes: bytes, context_material: tuple[str, ...],
                 context_bytes: bytes):
        if seal is not _BOOTSTRAP_ISSUER_SEAL or type(profile) is not LocalPostgresProfile:
            raise TypeError('local bootstrap issuer is trusted-host issued')
        if type(configuration_digest) is not str or not _HEX.fullmatch(configuration_digest):
            raise LocalPostgresError('local-postgresql-owner-configuration-invalid')
        self._profile = profile
        self._purpose = profile.purpose
        self._installation_id = profile.installation_id
        self._configuration_digest = configuration_digest
        self._issuer_id = str(uuid.uuid4())
        self._enrollment_id = _uuid(enrollment_id)
        self._enrollment_path = enrollment_path
        self._enrollment_digest = enrollment_digest
        self._configuration_bytes = bytes(configuration_bytes)
        self._context_material = context_material
        self._context_bytes = bytes(context_bytes)
        _BOOTSTRAP_ISSUERS[id(self)] = self

    def _owner_authority_context_material(self) -> tuple[str, str, str, str, str, str]:
        if _BOOTSTRAP_ISSUERS.get(id(self)) is not self:
            raise LocalPostgresError('local-postgresql-bootstrap-issuer-unverified')
        _verify_bootstrap_enrollment(self._enrollment_path, self._enrollment_digest)
        try:
            if _read_private(self._profile.control_home / 'owner-bootstrap-context.json') != self._context_bytes:
                raise LocalPostgresError('local-postgresql-bootstrap-context-changed')
        except LocalPostgresError:
            raise LocalPostgresError('local-postgresql-bootstrap-context-unavailable') from None
        return self._context_material

    @property
    def owner_configuration(self) -> dict[str, Any]:
        _verify_bootstrap_enrollment(self._enrollment_path, self._enrollment_digest)
        value = json.loads(self._configuration_bytes, object_pairs_hook=_no_duplicates)
        if type(value) is not dict:
            raise LocalPostgresError('local-postgresql-owner-configuration-invalid')
        return value

    def __setattr__(self, name: str, value: object) -> None:
        if hasattr(self, name):
            raise AttributeError('local bootstrap issuer is immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('local bootstrap issuer cannot be serialized')


def _issue_local_owner_bootstrap_issuer(
        profile: LocalPostgresProfile) -> _LocalOwnerBootstrapIssuer:
    """Load an originally installed enrollment; never enroll or rewrite production."""
    record_path = profile.control_home / 'owner-bootstrap-enrollment.json'
    record, raw = _read_bootstrap_enrollment(record_path)
    from .owner_authority import _canonical_bytes, _digest_bytes, _validate_config

    config, _keys = _validate_config(record['ownerConfiguration'])
    config_bytes = _canonical_bytes(config)
    context = record['context']
    if (config['purpose'] != profile.purpose
            or record['nativeProfile'] != _profile_to_enrollment(profile)
            or record['purpose'] != profile.purpose
            or context['custodianId'] != profile.custodian_id
            or context['supervisorId'] != profile.supervisor_id
            or context['providerId'] != profile.provider_id
            or context['installationId'] != profile.installation_id):
        raise LocalPostgresError('local-postgresql-owner-context-mismatch')
    material = (record['purpose'], context['custodianId'], context['supervisorId'],
                context['providerId'], context['installationId'], _digest_bytes(config_bytes))
    context_bytes = _validate_bootstrap_context_journal(
        profile.control_home, record, raw, _digest_bytes(config_bytes))
    return _LocalOwnerBootstrapIssuer(
        _BOOTSTRAP_ISSUER_SEAL, profile, _digest_bytes(config_bytes),
        enrollment_id=record['enrollmentId'], enrollment_path=record_path,
        enrollment_digest=_digest_bytes(raw), configuration_bytes=config_bytes,
        context_material=material, context_bytes=context_bytes)


_NATIVE_PROFILE_KEYS = {
    'controlHome', 'dataHome', 'postgresBinary', 'initdbBinary',
    'processObserver', 'processObserverSha256', 'port', 'databaseName',
    'businessOwner', 'custodianId', 'supervisorId', 'providerId',
    'installationId', 'purpose',
}


def _profile_to_enrollment(profile: LocalPostgresProfile) -> dict[str, Any]:
    return {'controlHome': str(profile.control_home), 'dataHome': str(profile.data_home),
            'postgresBinary': str(profile.postgres_binary),
            'initdbBinary': str(profile.initdb_binary),
            'processObserver': str(profile.process_observer),
            'processObserverSha256': profile.process_observer_sha256,
            'port': profile.port, 'databaseName': profile.database_name,
            'businessOwner': profile.business_owner,
            'custodianId': profile.custodian_id,
            'supervisorId': profile.supervisor_id, 'providerId': profile.provider_id,
            'installationId': profile.installation_id, 'purpose': profile.purpose}


def _read_bootstrap_enrollment(path: Path) -> tuple[dict[str, Any], bytes]:
    if (not isinstance(path, Path) or not path.is_absolute()
            or path.name != 'owner-bootstrap-enrollment.json'):
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-required')
    raw = _read_private(path)
    try:
        record = json.loads(raw, object_pairs_hook=_no_duplicates)
    except (json.JSONDecodeError, UnicodeDecodeError, LocalPostgresError):
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid') from None
    if _canonical(record) != raw:
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-noncanonical')
    if (type(record) is not dict or set(record) != {
            'profile', 'enrollmentId', 'purpose', 'context',
            'ownerConfiguration', 'nativeProfile'}
            or record['profile'] != 'umf.local-owner-bootstrap-enrollment/0.1'
            or record['purpose'] not in ('production', 'native-acceptance')
            or type(record['ownerConfiguration']) is not dict
            or type(record['nativeProfile']) is not dict
            or set(record['nativeProfile']) != _NATIVE_PROFILE_KEYS):
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
    _uuid(record['enrollmentId'])
    context = record['context']
    if (type(context) is not dict or set(context) != {
            'custodianId', 'supervisorId', 'providerId', 'installationId'}):
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
    for name in ('custodianId', 'supervisorId', 'providerId'):
        _uuid(context[name])
    if type(context['installationId']) is not str or not context['installationId']:
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
    return record, raw


def _verify_bootstrap_enrollment(path: Path, expected_digest: str) -> None:
    _record, raw = _read_bootstrap_enrollment(path)
    if hashlib.sha256(raw).hexdigest() != expected_digest:
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-changed')


def _validate_bootstrap_context_journal(control_home: Path, record: dict[str, Any],
                                        raw: bytes, configuration_digest: str) -> bytes:
    path = control_home / 'owner-bootstrap-context.json'
    context = record['context']
    expected = {'profile': 'umf.local-owner-bootstrap-context/0.1',
                'enrollmentId': record['enrollmentId'],
                'enrollmentRecordDigest': hashlib.sha256(raw).hexdigest(),
                'authorityConfigurationDigest': configuration_digest,
                'purpose': record['purpose'], 'context': context}
    encoded = _canonical(expected)
    try:
        current = _read_private(path)
    except LocalPostgresError as exc:
        if exc.code != 'supervisor-private-file-unavailable' or path.exists():
            raise LocalPostgresError('local-postgresql-bootstrap-context-unavailable') from None
        _write_private(path, encoded)
        return encoded
    if current != encoded:
        raise LocalPostgresError('local-postgresql-bootstrap-context-mismatch')
    return encoded


class _NativeEffectReservation:
    """Opaque reservation for one durably journaled native stage intent."""

    __slots__ = (
        '_approval',
        '_approval_digest',
        '_effect_key',
        '_issuer',
        '_journal_record_digest',
        '_kind',
        '_payload_bytes',
        '_purpose',
        '_request',
        '_request_digest',
        '_request_id',
        '_reservation_id',
        '_scope',
        '_sequence',
        '_supervisor',
        '_target',
    )

    def __init__(self, seal: object, issuer: object, *, request: object,
                 approval: object, scope: str, effect_key: tuple[str, ...],
                 purpose: str, target: object, sequence: int, payload_bytes: bytes,
                 reservation_id: str, journal_record_digest: str):
        if seal is not _NATIVE_EFFECT_RESERVATION_SEAL:
            raise TypeError('native effect reservation is supervisor-issued')
        self._issuer = issuer
        self._kind = 'umf.local-native-effect-reservation/0.1'
        self._request = request
        self._approval = approval
        self._request_id = request._approval_id
        self._request_digest = request._intent_digest
        self._approval_digest = approval.approval_digest
        self._scope = scope
        self._effect_key = tuple(effect_key)
        self._purpose = purpose
        self._target = target
        self._supervisor = issuer
        self._sequence = sequence
        self._payload_bytes = bytes(payload_bytes)
        self._reservation_id = _uuid(reservation_id)
        self._journal_record_digest = journal_record_digest

    @property
    def scope(self) -> str:
        return self._scope

    @property
    def effect_key(self) -> tuple[str, ...]:
        return self._effect_key

    @property
    def purpose(self) -> str:
        return self._purpose

    @property
    def request_id(self) -> str:
        return self._request_id

    @property
    def request_digest(self) -> str:
        return self._request_digest

    @property
    def approval_id(self) -> str:
        return self._approval._request._approval_id

    @property
    def approval_digest(self) -> str:
        return self._approval_digest

    @property
    def reservation_id(self) -> str:
        return self._reservation_id

    @property
    def journal_sequence(self) -> int:
        return self._sequence

    @property
    def journal_record_digest(self) -> str:
        return self._journal_record_digest

    def __setattr__(self, name: str, value: object) -> None:
        if hasattr(self, name):
            raise AttributeError('native effect reservation is immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('native effect reservation cannot be serialized')


class _VerifiedNativeEffectOutcome:
    """Opaque terminal observation; unknown native outcomes have no handle."""

    __slots__ = (
        '_issuer',
        '_journal_record_digest',
        '_kind',
        '_receipt_digest',
        '_reservation',
        '_sequence',
        '_status',
    )

    def __init__(self, seal: object, issuer: object, reservation: _NativeEffectReservation,
                 *, sequence: int, status: str, receipt_digest: str,
                 journal_record_digest: str):
        if seal is not _NATIVE_EFFECT_OUTCOME_SEAL:
            raise TypeError('native effect outcome is supervisor-issued')
        if status not in ('confirmed', 'known-aborted') or not _HEX.fullmatch(receipt_digest):
            raise LocalPostgresError('local-postgresql-native-outcome-invalid')
        self._issuer = issuer
        self._kind = 'umf.local-native-effect-outcome/0.1'
        self._reservation = reservation
        self._sequence = sequence
        self._status = status
        self._receipt_digest = receipt_digest
        self._journal_record_digest = journal_record_digest

    def __setattr__(self, name: str, value: object) -> None:
        if hasattr(self, name):
            raise AttributeError('native effect outcome is immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('native effect outcome cannot be serialized')

    @property
    def status(self) -> str:
        return self._status

    @property
    def receipt_digest(self) -> str:
        return self._receipt_digest

    @property
    def journal_sequence(self) -> int:
        return self._sequence

    @property
    def journal_record_digest(self) -> str:
        return self._journal_record_digest


class _PendingTargetCreation:
    """Opaque reversible setup; not permission to create a native target."""

    __slots__ = ('_issuer', '_request', '_request_bytes')

    def __init__(self, seal: object, issuer: object, request: object,
                 request_bytes: bytes):
        if seal is not _BOOTSTRAP_ISSUER_SEAL:
            raise TypeError('pending target creation is supervisor-issued')
        self._issuer = issuer
        self._request = request
        self._request_bytes = bytes(request_bytes)

    def __setattr__(self, name: str, value: object) -> None:
        if hasattr(self, name):
            raise AttributeError('pending target creation is immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('pending target creation cannot be serialized')


class _PreparedOriginalPrincipals:
    """Signed, pre-effect request for the exact principal/database stage."""

    __slots__ = ('_issuer', '_request', '_request_bytes', '_target', '_values')

    def __init__(self, seal: object, issuer: object, target: object, request: object,
                 request_bytes: bytes, values: dict[str, Any]):
        if seal is not _BOOTSTRAP_ISSUER_SEAL:
            raise TypeError('principal preparation is supervisor-issued')
        self._issuer = issuer
        self._target = target
        self._request = request
        self._request_bytes = bytes(request_bytes)
        self._values = dict(values)

    def __setattr__(self, name: str, value: object) -> None:
        if hasattr(self, name):
            raise AttributeError('principal preparation is immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('principal preparation cannot be serialized')


class _PreparedTargetRegistration:
    """Opaque exact registration request prepared from completed native stages."""

    __slots__ = ('_issuer', '_registration', '_request', '_request_bytes', '_target')

    def __init__(self, seal: object, issuer: object, target: object, request: object,
                 request_bytes: bytes, registration: dict[str, Any]):
        if seal is not _BOOTSTRAP_ISSUER_SEAL:
            raise TypeError('target registration preparation is supervisor-issued')
        self._issuer = issuer
        self._target = target
        self._request = request
        self._request_bytes = bytes(request_bytes)
        self._registration = json.loads(_canonical(registration))

    def __setattr__(self, name: str, value: object) -> None:
        if hasattr(self, name):
            raise AttributeError('target registration preparation is immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('target registration preparation cannot be serialized')


class _OriginalNativeTarget:
    """Opaque handle to this supervisor's original maintenance-only cluster."""

    __slots__ = ('_creation', '_issuer', '_reservation', '_target_id')

    def __init__(self, seal: object, issuer: object, creation: _PendingTargetCreation,
                 reservation: _NativeEffectReservation, target_id: str):
        if seal is not _BOOTSTRAP_ISSUER_SEAL:
            raise TypeError('original native target is supervisor-issued')
        self._issuer = issuer
        self._creation = creation
        self._reservation = reservation
        self._target_id = _uuid(target_id)

    def __setattr__(self, name: str, value: object) -> None:
        if hasattr(self, name):
            raise AttributeError('original native target is immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('original native target cannot be serialized')


def sys_platform_darwin() -> bool:
    import sys

    return sys.platform == 'darwin'


def _render_hba(maintenance_name: str) -> bytes:
    maintenance_name = _role(maintenance_name)
    lines = (
        f'host all "{maintenance_name}" 127.0.0.1/32 scram-sha-256',
        'local all all reject',
        'host all all 0.0.0.0/0 reject',
        'host all all ::/0 reject',
    )
    return ('\n'.join(lines) + '\n').encode('ascii')


def _render_config(port: int, hba_path: Path, ident_path: Path) -> bytes:
    if type(port) is not int or not 1 <= port <= 65535:
        raise LocalPostgresError('local-postgresql-port-invalid')
    if not hba_path.is_absolute() or not ident_path.is_absolute():
        raise LocalPostgresError('local-postgresql-config-path-invalid')
    lines = [
        "data_directory = ''",  # -D is the only selected PGDATA value.
        f"hba_file = '{_quote_pg_path(str(hba_path))}'",
        f"ident_file = '{_quote_pg_path(str(ident_path))}'",
        f'port = {port}',
        *_POSTGRES_SETTINGS,
    ]
    # `data_directory` is omitted from the effective config: PostgreSQL's -D
    # argument selects it.  Keeping an empty assignment would be invalid.
    lines = [line for line in lines if line != "data_directory = ''"]
    return ('\n'.join(lines) + '\n').encode('utf-8')


def _quote_pg_path(value: str) -> str:
    if '\x00' in value or '\n' in value or '\r' in value:
        raise LocalPostgresError('local-postgresql-config-path-invalid')
    return value.replace('\\', '\\\\').replace("'", "''")


def _quote_identifier(value: str) -> str:
    if type(value) is not str or not _ROLE.fullmatch(value):
        raise LocalPostgresError('local-postgresql-identifier-invalid')
    return '"' + value.replace('"', '""') + '"'


def _membership_grant_statements(member: str, role: str) -> tuple[str, str, str]:
    """Render PostgreSQL 18's separately specified grant options for one edge."""
    member_q = _quote_identifier(member)
    role_q = _quote_identifier(role)
    return (
        f'GRANT {role_q} TO {member_q} WITH ADMIN FALSE',
        f'GRANT {role_q} TO {member_q} WITH INHERIT FALSE',
        f'GRANT {role_q} TO {member_q} WITH SET TRUE',
    )


def _ordered_required_memberships(rows: list[tuple[Any, ...]], maintenance: str,
                                  controller: str, business_owner: str
                                  ) -> list[tuple[Any, ...]]:
    """Validate exact edges and return contract order, independent of OIDs."""
    if type(rows) is not list:
        raise LocalPostgresError('local-postgresql-membership-closure-mismatch')
    by_role = {}
    for row in rows:
        if type(row) is not tuple or len(row) != 5 or row[1] in by_role:
            raise LocalPostgresError('local-postgresql-membership-closure-mismatch')
        by_role[row[1]] = row
    expected = {
        controller: (maintenance, controller, False, False, True),
        business_owner: (maintenance, business_owner, False, False, True),
    }
    if by_role != expected:
        raise LocalPostgresError('local-postgresql-membership-closure-mismatch')
    return [by_role[controller], by_role[business_owner]]


def _ordered_membership_payload(rows: list[tuple[Any, ...]], maintenance_oid: int,
                                controller_oid: int, business_owner_oid: int
                                ) -> list[dict[str, Any]]:
    """Return the exact grant edges in contract order, independent of OID order."""
    if type(rows) is not list or len(rows) != 2:
        raise LocalPostgresError('local-postgresql-membership-closure-mismatch')
    by_role: dict[int, dict[str, Any]] = {}
    for row in rows:
        if (type(row) is not tuple or len(row) != 5
                or type(row[0]) is not int or type(row[1]) is not int
                or any(type(row[index]) is not bool for index in (2, 3, 4))
                or row[0] != maintenance_oid or row[1] in by_role):
            raise LocalPostgresError('local-postgresql-membership-closure-mismatch')
        by_role[row[1]] = {'memberOid': row[0], 'roleOid': row[1],
                           'admin': row[2], 'inherit': row[3], 'set': row[4]}
    expected = [
        {'memberOid': maintenance_oid, 'roleOid': controller_oid,
         'admin': False, 'inherit': False, 'set': True},
        {'memberOid': maintenance_oid, 'roleOid': business_owner_oid,
         'admin': False, 'inherit': False, 'set': True},
    ]
    if [by_role.get(controller_oid), by_role.get(business_owner_oid)] != expected:
        raise LocalPostgresError('local-postgresql-membership-closure-mismatch')
    return expected


def _approval(scope: str, payload_digest: str) -> dict[str, str]:
    """Reject the removed UID/TTY authorization path."""
    del scope, payload_digest
    raise LocalPostgresError('local-postgresql-signed-owner-approval-required')


class _DarwinProcessObserver:
    __slots__ = ('binary', 'sha256')

    def __init__(self, binary: Path, expected_sha256: str):
        self.binary = _regular_owned(binary, executable=True)
        self.sha256 = _sha_file(self.binary)
        if self.sha256 != expected_sha256:
            raise LocalPostgresError('local-postgresql-observer-mismatch')

    def _run(self, *args: str) -> dict[str, Any]:
        try:
            result = subprocess.run([str(self.binary), *args], stdin=subprocess.DEVNULL,
                                    capture_output=True, env=dict(_ENV), close_fds=True,
                                    timeout=3, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise LocalPostgresError('local-postgresql-process-observation-failed') from None
        if result.returncode != 0 or len(result.stdout) > 2 * 1024 * 1024:
            raise LocalPostgresError('local-postgresql-process-observation-failed')
        try:
            data = json.loads(result.stdout, object_pairs_hook=_no_duplicates)
        except (json.JSONDecodeError, UnicodeDecodeError, LocalPostgresError):
            raise LocalPostgresError('local-postgresql-process-observation-invalid') from None
        if type(data) is not dict:
            raise LocalPostgresError('local-postgresql-process-observation-invalid')
        return data

    def process(self, pid: int) -> dict[str, Any]:
        result = self._run('--pid', str(pid))
        if set(result) != {'profile', 'bootSec', 'bootUsec', 'process'} or result['profile'] != 'umf.darwin-process-observer/0.1':
            raise LocalPostgresError('local-postgresql-process-observation-invalid')
        process = result['process']
        if set(process) != {'pid', 'pgid', 'uid', 'gid', 'startSec', 'startUsec', 'path', 'argv'}:
            raise LocalPostgresError('local-postgresql-process-observation-invalid')
        if (type(process['pid']) is not int or process['pid'] != pid
                or type(process['pgid']) is not int or type(process['uid']) is not int
                or type(process['startSec']) is not int or type(process['startUsec']) is not int
                or type(process['argv']) is not list or any(type(x) is not str for x in process['argv'])):
            raise LocalPostgresError('local-postgresql-process-observation-invalid')
        process['startToken'] = (f"{result['bootSec']}.{result['bootUsec']}"
                                 f".{process['pid']}.{process['startSec']}.{process['startUsec']}")
        return process

    def group(self, pgid: int) -> list[dict[str, Any]]:
        result = self._run('--pgid', str(pgid))
        if (set(result) != {'profile', 'pgid', 'processes'}
                or result['profile'] != 'umf.darwin-process-group-observer/0.1'
                or result['pgid'] != pgid or type(result['processes']) is not list):
            raise LocalPostgresError('local-postgresql-process-observation-invalid')
        return result['processes']

    def sockets(self, pgid: int) -> list[dict[str, Any]]:
        result = self._run('--sockets', str(pgid))
        if (set(result) != {'profile', 'pgid', 'sockets'}
                or result['profile'] != 'umf.darwin-socket-group-observer/0.1'
                or result['pgid'] != pgid or type(result['sockets']) is not list
                or len(result['sockets']) > 100_000):
            raise LocalPostgresError('local-postgresql-socket-observation-invalid')
        for item in result['sockets']:
            if (type(item) is not dict or set(item) != {
                    'pid', 'fd', 'family', 'kind', 'type', 'protocol', 'state',
                    'listening', 'address', 'port', 'peerAddress'}
                    or type(item['pid']) is not int or type(item['fd']) is not int
                    or type(item['family']) is not int or type(item['kind']) is not int
                    or type(item['type']) is not int or type(item['protocol']) is not int
                    or type(item['state']) is not int or type(item['listening']) is not bool
                    or type(item['address']) is not str
                    or (item['port'] is not None and type(item['port']) is not int)
                    or (item['peerAddress'] is not None and type(item['peerAddress']) is not str)):
                raise LocalPostgresError('local-postgresql-socket-observation-invalid')
        return result['sockets']


class _AttachedPostmaster:
    """Waitable local handle backed only by the pinned OS process observer."""

    __slots__ = ('expected', 'observer', 'pid')

    def __init__(self, observer: _DarwinProcessObserver, process: dict[str, Any]):
        self.observer = observer
        self.pid = process['pid']
        self.expected = dict(process)

    def poll(self) -> int | None:
        try:
            process = self.observer.process(self.pid)
        except LocalPostgresError:
            if not self.observer.group(self.pid):
                return 0
            raise LocalPostgresError('local-postgresql-process-observation-unknown') from None
        if (process['startToken'] != self.expected['startToken']
                or process['path'] != self.expected['path']
                or process['argv'] != self.expected['argv']
                or process['uid'] != self.expected['uid']
                or process['gid'] != self.expected['gid']
                or process['pgid'] != self.expected['pgid']):
            raise LocalPostgresError('local-postgresql-process-origin-mismatch')
        return None

    def wait(self, timeout: float | None = None) -> int:
        deadline = None if timeout is None else time.monotonic() + timeout
        while self.poll() is None:
            if deadline is not None and time.monotonic() >= deadline:
                raise subprocess.TimeoutExpired('attached-postmaster', timeout)
            time.sleep(0.05)
        return 0


class _VerifiedNativeStorePreparation:
    """Identity capability retained by the native supervisor, never a record."""

    __slots__ = (
        '_issuer',
        '_payload_bytes',
        'custodian',
        'native_observation_bytes',
        'owner_request',
        'supervisor',
        'target_handle',
        'verified_target',
    )

    def __init__(self, seal: object, issuer: object, supervisor: object,
                 custodian: object, target_handle: object, verified_target: object,
                 owner_request: object, payload_bytes: bytes,
                 native_observation_bytes: bytes):
        if seal is not _VERIFIED_STORE_PREPARATION_SEAL:
            raise TypeError('verified native preparation is supervisor-issued')
        from .owner_authority import OwnerApprovalRequest
        if type(owner_request) is not OwnerApprovalRequest:
            raise LocalPostgresError('local-postgresql-owner-request-required')
        if type(payload_bytes) is not bytes or len(payload_bytes) > 65_536:
            raise LocalPostgresError('local-postgresql-store-preparation-capacity')
        if (type(native_observation_bytes) is not bytes
                or len(native_observation_bytes) > 65_536):
            raise LocalPostgresError('local-postgresql-store-observation-capacity')
        if _canonical(json.loads(payload_bytes)) != payload_bytes:
            raise LocalPostgresError('local-postgresql-store-preparation-invalid')
        if _canonical(json.loads(native_observation_bytes)) != native_observation_bytes:
            raise LocalPostgresError('local-postgresql-store-observation-invalid')
        self._issuer = issuer
        self.supervisor = supervisor
        self.custodian = custodian
        self.target_handle = target_handle
        self.verified_target = verified_target
        self.owner_request = owner_request
        self._payload_bytes = bytes(payload_bytes)
        self.native_observation_bytes = bytes(native_observation_bytes)

    def __setattr__(self, name: str, value: Any) -> None:
        if hasattr(self, name):
            raise AttributeError('verified native preparation is immutable')
        object.__setattr__(self, name, value)

    def __delattr__(self, _name: str) -> None:
        raise AttributeError('verified native preparation is immutable')

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('verified native preparation cannot be serialized')


class LocalPostgresSupervisor:
    """Create and supervise one fresh PostgreSQL 18.6 local installation.

    The supplied profile is trusted installation configuration.  Source/model
    requests cannot select binaries, paths, listeners, role flags or HBA rules.
    """

    __slots__ = (
        '__resolver',
        '_active_creation',
        '_authority_context',
        '_bootstrap_issuer',
        '_bound_installation_id',
        '_custodian',
        '_custodian_id',
        '_custody_handle',
        '_handles',
        '_journal',
        '_launch',
        '_maintenance_password',
        '_native_effect_bindings',
        '_native_effect_outcomes',
        '_native_effect_reservations',
        '_native_targets',
        '_observer',
        '_owner_authority',
        '_owner_payloads',
        '_pending_creation_values',
        '_pending_creations',
        '_pg_process',
        '_principal_dispatches',
        '_principal_preparations',
        '_profile',
        '_provider_id',
        '_registration_dispatches',
        '_registration_preparations',
        '_store_issuer',
        '_store_preparations',
        '_supervisor_id',
        '_target_paths',
    )

    def __init__(self, profile: LocalPostgresProfile, *, owner_authority: object):
        if type(profile) is not LocalPostgresProfile:
            raise TypeError('local PostgreSQL profile must be trusted host configuration')
        if not sys_platform_darwin():
            raise LocalPostgresError('local-postgresql-profile-unsupported-platform')
        from .owner_authority import ConfiguredEd25519OwnerAuthority
        if type(owner_authority) is not ConfiguredEd25519OwnerAuthority:
            raise LocalPostgresError('local-postgresql-owner-authority-required')
        context = getattr(owner_authority, 'authority_context', None)
        issuer = getattr(context, '_issuer', None)
        if (type(issuer) is not _LocalOwnerBootstrapIssuer
                or _BOOTSTRAP_ISSUERS.get(id(issuer)) is not issuer
                or issuer._profile is not profile
                or issuer._purpose != profile.purpose
                or issuer._installation_id != profile.installation_id
                or issuer._context_material[1] != profile.custodian_id
                or issuer._configuration_digest != owner_authority.configuration_digest):
            raise LocalPostgresError('local-postgresql-owner-context-unverified')
        self._profile = profile
        self._owner_authority = owner_authority
        self._authority_context = context
        self._bootstrap_issuer = issuer
        self._bound_installation_id = profile.installation_id
        self._observer = _DarwinProcessObserver(profile.process_observer,
                                                 profile.process_observer_sha256)
        self._supervisor_id = profile.supervisor_id
        self._custodian_id = profile.custodian_id
        self._provider_id = profile.provider_id
        self._journal: _SupervisorJournal | None = None
        self._target_paths: dict[str, Path] = {}
        self._maintenance_password: bytes | None = None
        self._pg_process: subprocess.Popen[bytes] | None = None
        self._launch: dict[str, Any] | None = None
        self._handles: dict[int, tuple[OwnerEnrollmentRequest, dict[str, Any], object]] = {}
        self._owner_payloads: dict[str, dict[str, Any]] = {}
        self._custodian = None
        self._custody_handle = None
        self._store_issuer = object()
        self._store_preparations: dict[
            int, tuple[object, _VerifiedNativeStorePreparation, bytes, bytes, bytes]
        ] = {}
        self._native_effect_reservations: dict[int, _NativeEffectReservation] = {}
        self._native_effect_outcomes: dict[int, _VerifiedNativeEffectOutcome] = {}
        self._pending_creations: dict[int, _PendingTargetCreation] = {}
        self._pending_creation_values: dict[int, tuple[_PendingTargetCreation, dict[str, Any]]] = {}
        self._active_creation: _PendingTargetCreation | None = None
        self._native_effect_bindings: dict[int, object] = {}
        self._native_targets: dict[int, _OriginalNativeTarget] = {}
        self._principal_preparations: dict[int, _PreparedOriginalPrincipals] = {}
        self._registration_preparations: dict[int, _PreparedTargetRegistration] = {}
        self._principal_dispatches: dict[int, _NativeEffectReservation] = {}
        self._registration_dispatches: dict[int, _NativeEffectReservation] = {}
        try:
            owner_authority._bind_native_effect_issuer(self)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-native-effect-issuer-binding-failed') from None

    @property
    def authority_context(self) -> object:
        return self._authority_context

    def _make_native_effect_reservation(
            self, request: object, approval: object, scope: str,
            effect_key: tuple[str, ...], purpose: str, target: object,
            journal_event: dict[str, Any], payload_bytes: bytes
            ) -> _NativeEffectReservation:
        if self._journal is None:
            raise LocalPostgresError('local-postgresql-native-effect-journal-unavailable')
        from .owner_authority import OwnerApprovalRequest, VerifiedOwnerApproval
        if (type(request) is not OwnerApprovalRequest
                or type(approval) is not VerifiedOwnerApproval
                or approval._request is not request
                or purpose != self._profile.purpose
                or type(effect_key) is not tuple or not effect_key
                or type(payload_bytes) is not bytes or len(payload_bytes) > 65_536):
            raise LocalPostgresError('local-postgresql-native-effect-reservation-invalid')
        if (type(journal_event) is not dict
                or self._journal.read()['events'][-1]['recordDigest']
                   != journal_event.get('recordDigest')):
            raise LocalPostgresError('local-postgresql-native-effect-reservation-stale')
        reservation_id = str(uuid.uuid4())
        event = self._journal.append('native-effect-intent', {
            'reservationId': reservation_id, 'scope': scope,
            'effectKey': list(effect_key), 'purpose': purpose,
            'requestId': request._approval_id, 'requestDigest': request._intent_digest,
            'approvalId': approval.approval_id,
            'approvalDigest': approval.approval_digest,
            'stage': scope, 'payloadDigest': hashlib.sha256(payload_bytes).hexdigest(),
        })
        reservation = _NativeEffectReservation(
            _NATIVE_EFFECT_RESERVATION_SEAL, self, request=request,
            approval=approval, scope=scope, effect_key=effect_key, purpose=purpose,
            target=target, sequence=event['sequence'], payload_bytes=payload_bytes,
            reservation_id=reservation_id, journal_record_digest=event['recordDigest'])
        self._native_effect_reservations[id(reservation)] = reservation
        return reservation

    def _resolve_native_effect_reservation(
            self, value: object, verified_approval: object) -> _NativeEffectReservation:
        from .owner_authority import OwnerAuthorityError
        if (type(value) is not _NativeEffectReservation
                or value._issuer is not self or value._supervisor is not self
                or self._native_effect_reservations.get(id(value)) is not value
                or value._purpose != self._profile.purpose
                or value._request is not value._approval._request
                or value._approval is not verified_approval
                or self._journal is None):
            raise LocalPostgresError('local-postgresql-native-effect-reservation-unverified')
        try:
            self._owner_authority._resolve_verified_approval(
                verified_approval, original_request=value._request,
                scope=value._scope, intent_digest=value._request_digest)
        except OwnerAuthorityError:
            raise LocalPostgresError('local-postgresql-native-effect-approval-mismatch') from None
        event = next((item for item in self._journal.read()['events']
                      if item['sequence'] == value._sequence), None)
        if (event is None or event['recordDigest'] != value._journal_record_digest
                or event['kind'] != 'native-effect-intent'
                or event['payload'].get('reservationId') != value._reservation_id
                or event['payload'].get('effectKey') != list(value._effect_key)
                or event['payload'].get('payloadDigest')
                   != hashlib.sha256(value._payload_bytes).hexdigest()):
            raise LocalPostgresError('local-postgresql-native-effect-reservation-stale')
        return value

    def _record_native_effect_outcome(
            self, reservation: _NativeEffectReservation, status: str,
            receipt: dict[str, Any]) -> _VerifiedNativeEffectOutcome:
        self._resolve_native_effect_reservation(reservation, reservation._approval)
        if status not in ('confirmed', 'known-aborted'):
            raise LocalPostgresError('local-postgresql-native-effect-outcome-unknown')
        assert self._journal is not None
        receipt_digest = _digest(receipt)
        event = self._journal.append(
            'native-effect-confirmed' if status == 'confirmed' else 'native-effect-aborted',
            {'reservationId': reservation._reservation_id,
             'receiptDigest': receipt_digest})
        outcome = _VerifiedNativeEffectOutcome(
            _NATIVE_EFFECT_OUTCOME_SEAL, self, reservation,
            sequence=event['sequence'], status=status, receipt_digest=receipt_digest,
            journal_record_digest=event['recordDigest'])
        self._native_effect_outcomes[id(outcome)] = outcome
        binding = self._native_effect_bindings.get(id(reservation))
        if binding is None:
            raise LocalPostgresError('local-postgresql-native-effect-binding-unavailable')
        try:
            self._owner_authority.record_native_outcome(binding, outcome)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            # Journal receipt remains authoritative; caller must observe this
            # original operation and must not dispatch a replacement.
            raise LocalPostgresError('local-postgresql-native-effect-record-pending') from None
        return outcome

    def _resolve_native_effect_outcome(
            self, value: object, reservation: object) -> _VerifiedNativeEffectOutcome:
        if (type(value) is not _VerifiedNativeEffectOutcome
                or type(reservation) is not _NativeEffectReservation
                or value._issuer is not self or value._reservation is not reservation
                or self._native_effect_outcomes.get(id(value)) is not value
                or self._native_effect_reservations.get(id(reservation)) is not reservation
                or self._journal is None):
            raise LocalPostgresError('local-postgresql-native-effect-outcome-unverified')
        event = next((item for item in self._journal.read()['events']
                      if item['sequence'] == value._sequence), None)
        expected_kind = ('native-effect-confirmed' if value._status == 'confirmed'
                         else 'native-effect-aborted')
        if (event is None or event['recordDigest'] != value._journal_record_digest
                or event['kind'] != expected_kind
                or event['payload'] != {'reservationId': reservation._reservation_id,
                                         'receiptDigest': value._receipt_digest}):
            raise LocalPostgresError('local-postgresql-native-effect-outcome-stale')
        return value

    def observe_original_owner_request(self, scope: str) -> object:
        """Read the owner authority's existing request/outcome for this target.

        This is a no-create recovery entrypoint.  It opens only the journal at
        the originally enrolled supervisor path, derives the original exact
        request bytes from its authenticated event chain, and asks the owner
        authority to resolve that exact approval ID from its existing ledger.
        It never prepares a replacement request or infers native completion.
        """
        if scope not in ('local-target-creation', 'native-principal-preparation',
                         'local-target-registration'):
            raise LocalPostgresError('local-postgresql-original-request-scope-invalid')
        if self._journal is None:
            suffix = self._supervisor_id.replace('-', '')
            journal = _SupervisorJournal(
                self._profile.control_home / f'owner-journal-{suffix}.json',
                self._supervisor_id)
        else:
            journal = self._journal
        chain = journal.read()
        events = chain['events']
        creation_event = next((event for event in events
                               if event['kind'] == 'creation-intent'), None)
        if creation_event is None:
            raise LocalPostgresError('local-postgresql-original-request-unavailable')
        creation = creation_event['payload']
        suffix = self._supervisor_id.replace('-', '')
        if (creation['supervisorId'] != self._supervisor_id
                or creation['purpose'] != self._profile.purpose
                or creation['installationId'] != self._profile.installation_id
                or creation['controlDirectory']
                    != str(self._profile.control_home / suffix)
                or creation['dataDirectory'] != str(self._profile.data_home / suffix)
                or creation['ownerUid'] != os.geteuid()):
            raise LocalPostgresError('local-postgresql-original-target-mismatch')

        if scope == 'local-target-creation':
            request_fields = {
                'profile', 'supervisorId', 'clusterId', 'incarnationId',
                'installationId', 'ownerUid', 'databaseName', 'businessOwner',
                'maintenanceName', 'controllerName', 'controlDirectory',
                'dataDirectory', 'postgresPath', 'postgresSha256', 'initdbPath',
                'initdbSha256', 'port', 'configDigest', 'hbaDigest',
            }
            intent = {key: creation[key] for key in request_fields}
            approval_id = creation['approvalId']
        elif scope == 'native-principal-preparation':
            prepared_event = next((event for event in events
                                   if event['kind'] == 'principal-request-prepared'), None)
            if prepared_event is None:
                raise LocalPostgresError('local-postgresql-original-request-unavailable')
            prepared = prepared_event['payload']
            intent = prepared['intent']
            approval_id = prepared['approvalId']
        else:
            prepared_event = next((event for event in events
                                   if event['kind'] == 'registration-request-prepared'), None)
            if prepared_event is None:
                raise LocalPostgresError('local-postgresql-original-request-unavailable')
            prepared = prepared_event['payload']
            intent = prepared['intent']
            approval_id = prepared['approvalId']

        intent_bytes = _canonical(intent)
        expected_digest = (creation['requestDigest'] if scope == 'local-target-creation'
                           else prepared['requestDigest'])
        if hashlib.sha256(intent_bytes).hexdigest() != expected_digest:
            raise LocalPostgresError('local-postgresql-original-request-mismatch')
        try:
            request = self._owner_authority._recover_original_request(
                scope, intent_bytes, context=self._authority_context,
                expected_approval_id=approval_id)
            if (request._scope != scope or request._intent_bytes != intent_bytes
                    or request._approval_id != approval_id):
                raise LocalPostgresError('local-postgresql-original-request-mismatch')
            outcome = self._owner_authority.observe_original_request(
                self._authority_context, request.effect_key)
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-original-request-observation-failed') from None
        if (outcome.approval_id != approval_id or outcome.scope != scope
                or outcome.intent_digest != expected_digest):
            raise LocalPostgresError('local-postgresql-original-outcome-mismatch')
        return outcome

    def reattach_original_target(self) -> _OriginalNativeTarget:
        """Reattach only the enrolled original live cluster after full proof.

        No target path, cluster identifier, process, credential, or approval is
        adopted from a caller.  Every identity is recovered from the original
        signed journal and checked against the enrolled profile, live process
        group, configuration, endpoint, and PostgreSQL native observation.
        """
        if (os.geteuid() == 0 or self._pg_process is not None
                or self._launch is not None or self._journal is not None):
            raise LocalPostgresError('local-postgresql-reattach-state-invalid')
        try:
            self._bootstrap_issuer._owner_authority_context_material()
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-owner-context-unverified') from None
        suffix = self._supervisor_id.replace('-', '')
        control = _private_directory(self._profile.control_home / suffix)
        data = _private_directory(self._profile.data_home / suffix)
        journal = _SupervisorJournal(
            self._profile.control_home / f'owner-journal-{suffix}.json',
            self._supervisor_id)
        events = journal.read()['events']
        creation_event = next((event for event in events
                               if event['kind'] == 'creation-intent'), None)
        initdb_event = next((event for event in events
                             if event['kind'] == 'initdb-confirmed'), None)
        launch_event = next((event for event in reversed(events)
                             if event['kind'] == 'launch-confirmed'), None)
        if creation_event is None or initdb_event is None or launch_event is None:
            raise LocalPostgresError('local-postgresql-original-target-incomplete')
        creation = creation_event['payload']
        initdb_receipt = initdb_event['payload']
        launch_confirmation = launch_event['payload']
        launch_intent_event = next((event for event in reversed(events)
                                    if event['kind'] == 'launch-intent'
                                    and event['payload'].get('launchId')
                                        == launch_confirmation['launchId']), None)
        if launch_intent_event is None:
            raise LocalPostgresError('local-postgresql-original-launch-incomplete')
        launch_intent = launch_intent_event['payload']
        if (creation['supervisorId'] != self._supervisor_id
                or creation['ownerUid'] != os.geteuid()
                or creation['purpose'] != self._profile.purpose
                or creation['installationId'] != self._profile.installation_id
                or creation['controlDirectory'] != str(control)
                or creation['dataDirectory'] != str(data)
                or initdb_receipt['clusterId'] != creation['clusterId']
                or initdb_receipt['ownerUid'] != os.geteuid()
                or launch_intent['binarySha256'] != creation['postgresSha256']):
            raise LocalPostgresError('local-postgresql-original-target-mismatch')

        postgres = _regular_owned(self._profile.postgres_binary, executable=True)
        initdb = _regular_owned(self._profile.initdb_binary, executable=True)
        if (str(postgres) != creation['postgresPath']
                or str(initdb) != creation['initdbPath']
                or _sha_file(postgres) != creation['postgresSha256']
                or _sha_file(initdb) != creation['initdbSha256']):
            raise LocalPostgresError('local-postgresql-original-binary-mismatch')
        config_path, hba_path, ident_path = (
            control / 'postgresql.conf', control / 'pg_hba.conf', control / 'pg_ident.conf')
        expected_config = _render_config(self._profile.port, hba_path, ident_path)
        expected_hba = _render_hba(creation['maintenanceName'])
        if (hashlib.sha256(expected_config).hexdigest() != creation['configDigest']
                or hashlib.sha256(expected_hba).hexdigest() != creation['hbaDigest']
                or _read_private(config_path) != expected_config
                or _read_private(hba_path) != expected_hba
                or _read_private(ident_path) != b''):
            raise LocalPostgresError('local-postgresql-original-config-mismatch')
        pg_version = _read_owned_regular_nofollow(data / 'PG_VERSION', limit=32)
        _read_owned_regular_nofollow(data / 'global' / 'pg_control', limit=1_048_576)
        pid_file = _read_owned_regular_nofollow(data / 'postmaster.pid', limit=4096)
        pid_matches = _postmaster_pidfile_matches(
            pid_file, pid=launch_confirmation['process']['pid'],
            data_directory=data, port=self._profile.port)
        if (pg_version.decode('ascii', errors='replace').strip() != '18'
                or not pid_matches):
            raise LocalPostgresError('local-postgresql-original-data-invalid')
        data_stat = os.stat(data, follow_symlinks=False)
        if (str(data_stat.st_dev) != initdb_receipt['dataDevice']
                or str(data_stat.st_ino) != initdb_receipt['dataInode']
                or data_stat.st_uid != initdb_receipt['ownerUid']):
            raise LocalPostgresError('local-postgresql-original-data-identity-mismatch')
        credential_path = control / 'maintenance.credential'
        credential = _read_private(credential_path)
        if not credential.endswith(b'\n') or len(credential) < 32:
            raise LocalPostgresError('local-postgresql-credential-unavailable')
        try:
            self._maintenance_password = credential[:-1]
            self._maintenance_password.decode('ascii')
        except UnicodeDecodeError:
            self._maintenance_password = None
            raise LocalPostgresError('local-postgresql-credential-invalid') from None

        process = launch_confirmation['process']
        expected_argv = launch_intent['argv']
        if (process['path'] != str(postgres) or process['argv'] != expected_argv
                or process['pgid'] != process['pid']
                or process['uid'] != os.geteuid() or process['gid'] != os.getegid()
                or launch_intent['dataDevice'] != initdb_receipt['dataDevice']
                or launch_intent['dataInode'] != initdb_receipt['dataInode']):
            raise LocalPostgresError('local-postgresql-original-process-identity-mismatch')
        observed_process = self._observer.process(process['pid'])
        members = self._observer.group(process['pgid'])
        if (observed_process['startToken'] != process['startToken']
                or observed_process['path'] != process['path']
                or observed_process['argv'] != process['argv']
                or not members):
            raise LocalPostgresError('local-postgresql-original-process-unverified')
        owned_members = self._verify_owned_process_group(process['pgid'])
        sockets = self._verify_endpoint_sockets(
            self._observer.sockets(process['pgid']),
            {item['pid'] for item in owned_members})

        self._journal = journal
        self._target_paths = {'control': control, 'data': data}
        launch_id = launch_confirmation['launchId']
        launch_number = launch_intent['launchNumber']
        attached = _AttachedPostmaster(self._observer, process)
        self._pg_process = attached  # type: ignore[assignment]
        self._launch = {'launchId': launch_id, 'launchNumber': launch_number,
                        'argv': expected_argv, 'process': observed_process,
                        'native': {}, 'sockets': sockets}
        if self._verify_live_process()['startToken'] != process['startToken']:
            raise LocalPostgresError('local-postgresql-original-process-unverified')
        native = self._observe_native('postgres')
        if _digest(native) != launch_confirmation['nativeObservationDigest']:
            raise LocalPostgresError('local-postgresql-original-native-state-mismatch')
        endpoint_digest = _digest({
            'hbaDigest': creation['hbaDigest'], 'configDigest': creation['configDigest'],
            'listen': '127.0.0.1', 'port': self._profile.port,
            'unixSocketDirectories': '', 'socketsDigest': _digest(sockets),
            'nativeSettingsDigest': _digest(native),
            'processStartToken': process['startToken'],
        })
        if endpoint_digest != launch_confirmation['endpointReceiptDigest']:
            raise LocalPostgresError('local-postgresql-original-endpoint-mismatch')
        attestation = _NativeAttestation(self, observed_process, native, endpoint_digest)
        self._launch = {'launchId': launch_id, 'launchNumber': launch_number,
                        'argv': expected_argv, 'process': observed_process,
                        'native': native, 'sockets': sockets,
                        'nativeAttestation': attestation}

        reservation, outcome, request = self._recover_original_native_effect(
            'local-target-creation')
        first_launch = next(event for event in events
                            if event['kind'] == 'launch-confirmed')
        receipt = {
            'profile': 'umf.local-supervisor-target-creation-receipt/0.1',
            'clusterId': creation['clusterId'],
            'incarnationId': creation['incarnationId'],
            'requestDigest': reservation.request_digest,
            'approvalDigest': reservation.approval_digest,
            'initdbReceiptDigest': initdb_receipt['initdbReceiptDigest'],
            'launchReceiptDigest': first_launch['recordDigest'],
            'purpose': self._profile.purpose,
        }
        expected_receipt_digest = _digest(receipt)
        if outcome is not None and outcome.receipt_digest != expected_receipt_digest:
            raise LocalPostgresError('local-postgresql-original-creation-outcome-mismatch')
        if outcome is None:
            self._record_native_effect_outcome(reservation, 'confirmed', receipt)
        creation_request = _PendingTargetCreation(
            _BOOTSTRAP_ISSUER_SEAL, self, request, _canonical({
                key: creation[key] for key in (
                    'profile', 'supervisorId', 'clusterId', 'incarnationId',
                    'installationId', 'ownerUid', 'databaseName', 'businessOwner',
                    'maintenanceName', 'controllerName', 'controlDirectory',
                    'dataDirectory', 'postgresPath', 'postgresSha256', 'initdbPath',
                    'initdbSha256', 'port', 'configDigest', 'hbaDigest')
            }))
        target = _OriginalNativeTarget(
            _BOOTSTRAP_ISSUER_SEAL, self, creation_request, reservation,
            creation['clusterId'])
        self._native_targets[id(target)] = target
        self._owner_payloads['creationRequest'] = json.loads(_canonical(
            {key: creation[key] for key in (
                'profile', 'supervisorId', 'clusterId', 'incarnationId',
                'installationId', 'ownerUid', 'databaseName', 'businessOwner',
                'maintenanceName', 'controllerName', 'controlDirectory',
                'dataDirectory', 'postgresPath', 'postgresSha256', 'initdbPath',
                'initdbSha256', 'port', 'configDigest', 'hbaDigest')}))
        return target

    def _recover_original_native_effect(self, scope: str, *, target: object = None
                                        ) -> tuple[_NativeEffectReservation,
                                                   _VerifiedNativeEffectOutcome | None,
                                                   object]:
        """Rehydrate the exact journaled reservation; never allocate a new ID.

        This restores process-local opaque capabilities from the enrolled
        journal and owner ledger.  It does not itself assert that an effect
        committed; callers must perform the scope-specific native observation
        before settling an unknown outcome.
        """
        if self._journal is None:
            suffix = self._supervisor_id.replace('-', '')
            self._journal = _SupervisorJournal(
                self._profile.control_home / f'owner-journal-{suffix}.json',
                self._supervisor_id)
        events = self._journal.read()['events']
        matches = [event for event in events
                   if event['kind'] == 'native-effect-intent'
                   and event['payload'].get('scope') == scope]
        if len(matches) != 1:
            raise LocalPostgresError('local-postgresql-original-effect-unavailable')
        effect_event = matches[0]
        effect = effect_event['payload']
        if effect['purpose'] != self._profile.purpose:
            raise LocalPostgresError('local-postgresql-original-target-mismatch')

        if scope == 'local-target-creation':
            creation_event = next((event for event in events
                                   if event['kind'] == 'creation-intent'), None)
            if creation_event is None:
                raise LocalPostgresError('local-postgresql-original-request-unavailable')
            creation = creation_event['payload']
            request_fields = {
                'profile', 'supervisorId', 'clusterId', 'incarnationId',
                'installationId', 'ownerUid', 'databaseName', 'businessOwner',
                'maintenanceName', 'controllerName', 'controlDirectory',
                'dataDirectory', 'postgresPath', 'postgresSha256', 'initdbPath',
                'initdbSha256', 'port', 'configDigest', 'hbaDigest',
            }
            intent_bytes = _canonical({key: creation[key] for key in request_fields})
            approval_id = creation['approvalId']
            effect_key = ('local-target-creation', self._supervisor_id,
                          creation['clusterId'])
            if creation['requestDigest'] != effect['requestDigest']:
                raise LocalPostgresError('local-postgresql-original-effect-mismatch')
        elif scope == 'native-principal-preparation':
            prepared_event = next((event for event in events
                                   if event['kind'] == 'principal-request-prepared'), None)
            if prepared_event is None:
                raise LocalPostgresError('local-postgresql-original-request-unavailable')
            prepared = prepared_event['payload']
            intent_bytes = _canonical(prepared['intent'])
            approval_id = prepared['approvalId']
            effect_key = ('native-principal-preparation', self._supervisor_id,
                          prepared['preparationId'])
            if prepared['requestDigest'] != effect['requestDigest']:
                raise LocalPostgresError('local-postgresql-original-effect-mismatch')
        elif scope == 'local-target-registration':
            prepared_event = next((event for event in events
                                   if event['kind'] == 'registration-request-prepared'), None)
            if prepared_event is None:
                raise LocalPostgresError('local-postgresql-original-request-unavailable')
            prepared = prepared_event['payload']
            intent_bytes = _canonical(prepared['intent'])
            approval_id = prepared['approvalId']
            effect_key = ('local-target-registration', self._custodian_id,
                          prepared['registrationId'])
            if (prepared['requestDigest'] != effect['requestDigest']
                    or not any(event['kind'] == 'registration-signature-verified'
                               and event['payload'].get('approvalId') == approval_id
                               and event['payload'].get('requestDigest')
                                   == prepared['requestDigest'] for event in events)):
                raise LocalPostgresError('local-postgresql-original-effect-mismatch')
        else:
            raise LocalPostgresError('local-postgresql-original-effect-scope-invalid')

        if (effect['effectKey'] != list(effect_key)
                or effect['requestId'] != approval_id
                or effect['approvalId'] != approval_id
                or hashlib.sha256(intent_bytes).hexdigest() != effect['requestDigest']
                or hashlib.sha256(intent_bytes).hexdigest() != effect['payloadDigest']):
            raise LocalPostgresError('local-postgresql-original-effect-mismatch')
        try:
            request = self._owner_authority._recover_original_request(
                scope, intent_bytes, context=self._authority_context,
                expected_approval_id=approval_id)
            approval = self._owner_authority._recover_verified_approval(request)
            self._owner_authority._resolve_verified_approval(
                approval, original_request=request, scope=scope,
                intent_digest=effect['requestDigest'])
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-original-approval-recovery-failed') from None
        if (approval.approval_id != effect['approvalId']
                or approval.approval_digest != effect['approvalDigest']
                or request.effect_key != effect_key):
            raise LocalPostgresError('local-postgresql-original-approval-mismatch')

        payload_bytes = intent_bytes
        if hashlib.sha256(payload_bytes).hexdigest() != effect['payloadDigest']:
            raise LocalPostgresError('local-postgresql-original-effect-mismatch')
        reservation = _NativeEffectReservation(
            _NATIVE_EFFECT_RESERVATION_SEAL, self, request=request,
            approval=approval, scope=scope, effect_key=effect_key,
            purpose=self._profile.purpose, target=target,
            sequence=effect_event['sequence'], payload_bytes=payload_bytes,
            reservation_id=effect['reservationId'],
            journal_record_digest=effect_event['recordDigest'])
        self._native_effect_reservations[id(reservation)] = reservation
        try:
            self._resolve_native_effect_reservation(reservation, approval)
            binding = self._owner_authority.bind_native_effect(approval, reservation)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-original-effect-binding-recovery-failed') from None
        self._native_effect_bindings[id(reservation)] = binding

        terminal = next((event for event in events
                         if event['kind'] in ('native-effect-confirmed',
                                              'native-effect-aborted')
                         and event['payload'].get('reservationId')
                            == effect['reservationId']), None)
        outcome = None
        if terminal is not None:
            status = ('confirmed' if terminal['kind'] == 'native-effect-confirmed'
                      else 'known-aborted')
            outcome = _VerifiedNativeEffectOutcome(
                _NATIVE_EFFECT_OUTCOME_SEAL, self, reservation,
                sequence=terminal['sequence'], status=status,
                receipt_digest=terminal['payload']['receiptDigest'],
                journal_record_digest=terminal['recordDigest'])
            self._native_effect_outcomes[id(outcome)] = outcome
            self._resolve_native_effect_outcome(outcome, reservation)
        owner_state = self._owner_authority.observe_original_request(
            self._authority_context, request.effect_key)
        if (owner_state.approval_id != approval_id
                or owner_state.intent_digest != effect['requestDigest']):
            raise LocalPostgresError('local-postgresql-original-outcome-mismatch')
        if terminal is None:
            if owner_state.effect_status != 'effect-pending':
                raise LocalPostgresError('local-postgresql-original-outcome-mismatch')
        elif owner_state.effect_status not in ('effect-pending',
                                               'confirmed' if outcome.status == 'confirmed'
                                               else 'aborted') or (owner_state.effect_status != 'effect-pending'
              and owner_state.effect_receipt_digest != outcome.receipt_digest):
            raise LocalPostgresError('local-postgresql-original-outcome-mismatch')
        return reservation, outcome, request

    def reattach_original_registration(self, target: object) -> object:
        """Reconcile only the exact signed registration for an attached target.

        The custody journal and opaque handle are reconstructed through the
        enrolled owner resolver.  Journal payloads are inputs to verification,
        never authority to mint a custody capability.
        """
        if (type(target) is not _OriginalNativeTarget or target._issuer is not self
                or self._native_targets.get(id(target)) is not target
                or self._journal is None or self._launch is None):
            raise LocalPostgresError('local-postgresql-original-target-unverified')
        if self._custodian is not None or self._custody_handle is not None:
            raise LocalPostgresError('local-postgresql-registration-already-attached')
        events = self._journal.read()['events']
        prepared_event = next((event for event in events
                               if event['kind'] == 'registration-request-prepared'), None)
        signature_event = next((event for event in events
                                if event['kind'] == 'registration-signature-verified'), None)
        if prepared_event is None or signature_event is None:
            raise LocalPostgresError('local-postgresql-registration-recovery-unavailable')
        if (prepared_event['payload']['registrationId']
                != signature_event['payload']['registrationId']
                or prepared_event['payload']['approvalId']
                   != signature_event['payload']['approvalId']
                or prepared_event['payload']['requestDigest']
                   != signature_event['payload']['requestDigest']):
            raise LocalPostgresError('local-postgresql-registration-recovery-mismatch')
        reservation, outcome, request = self._recover_original_native_effect(
            'local-target-registration', target=target)
        intent = prepared_event['payload']['intent']
        if (request._intent_bytes != _canonical(intent)
                or request._intent_digest != prepared_event['payload']['requestDigest']
                or request._approval_id != prepared_event['payload']['approvalId']):
            raise LocalPostgresError('local-postgresql-registration-recovery-mismatch')
        registration = intent['registration']
        creation_identity = json.loads(target._creation._request_bytes)
        if (registration['registrationId'] != prepared_event['payload']['registrationId']
                or registration['custodianId'] != self._custodian_id
                or registration['providerId'] != self._provider_id
                or registration['installationId'] != self._bound_installation_id
                or registration['origin']['clusterId'] != target._target_id
                or registration['origin']['incarnationId']
                   != creation_identity['incarnationId']):
            raise LocalPostgresError('local-postgresql-registration-recovery-mismatch')

        approval = reservation._approval
        payload = {**registration, 'ownerApproval': {
            'authorityId': approval.authority_id,
            'approvalId': approval.approval_id,
            'approvalDigest': approval.approval_digest,
            'scope': _OWNER_APPROVAL_SCOPE,
        }}
        owner_approved = next((event['payload'] for event in events
                               if event['kind'] == 'owner-registration-approved'
                               and event['payload'].get('registrationId')
                                   == registration['registrationId']), None)
        if (owner_approved is not None
                and (owner_approved['payloadDigest'] != _digest(payload)
                     or owner_approved['approvalId'] != approval.approval_id
                     or owner_approved['approvalDigest'] != approval.approval_digest)):
            raise LocalPostgresError('local-postgresql-registration-recovery-mismatch')

        from .ingress_custody import (
            ExternalCustodyJournal,
            _bind_owner_registration_resolver,
            _bootstrap_local_target_custodian,
        )
        control = self._target_paths['control']
        resolver = _bind_owner_registration_resolver(self, self)
        custody_journal = ExternalCustodyJournal(
            control / 'target-custody.json', self._custodian_id)
        custodian = _bootstrap_local_target_custodian(
            custody_journal, self._custodian_id, self._provider_id, resolver)
        owner_request = OwnerEnrollmentRequest(
            _owner_capability_seal(), self, _OWNER_KIND)
        self._owner_payloads[registration['registrationId']] = payload
        self._handles[id(owner_request)] = (
            owner_request, payload, self._launch['nativeAttestation'])
        try:
            handle = custodian.register_target(owner_request)
            reference = custodian._public_reference(handle)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError(
                'local-postgresql-registration-outcome-unresolved') from None
        self._resolver = resolver
        self._custodian = custodian
        self._custody_handle = handle
        if owner_approved is None:
            self._journal.append('owner-registration-approved', {
                'registrationId': registration['registrationId'],
                'payloadDigest': _digest(payload),
                'approvalId': approval.approval_id,
                'approvalDigest': approval.approval_digest,
            })
        receipt = {
            'profile': 'umf.local-target-registration-effect-receipt/0.1',
            'registrationId': registration['registrationId'],
            'registrationDigest': _digest(payload),
            'targetCustodyDigest': _digest(reference),
            'requestDigest': reservation.request_digest,
            'approvalDigest': reservation.approval_digest,
            'purpose': self._profile.purpose,
        }
        expected_receipt = _digest(receipt)
        if outcome is None:
            self._record_native_effect_outcome(reservation, 'confirmed', receipt)
        elif (outcome.status != 'confirmed'
              or outcome.receipt_digest != expected_receipt):
            raise LocalPostgresError('local-postgresql-registration-outcome-mismatch')
        else:
            owner_state = self._owner_authority.observe_original_request(
                self._authority_context, request.effect_key)
            if owner_state.effect_status == 'effect-pending':
                try:
                    self._owner_authority.record_native_outcome(
                        self._native_effect_bindings[id(reservation)], outcome)
                except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
                    raise LocalPostgresError(
                        'local-postgresql-registration-outcome-record-pending') from None
            elif (owner_state.effect_status != 'confirmed'
                  or owner_state.effect_receipt_digest != outcome.receipt_digest):
                raise LocalPostgresError('local-postgresql-registration-outcome-mismatch')
        return handle

    def prepare_target_creation(self) -> tuple[_PendingTargetCreation, object]:
        """Reserve the original target identity and signed request without native effects."""
        if os.geteuid() == 0:
            raise LocalPostgresError('local-postgresql-nonroot-owner-required')
        if self._pending_creations or self._active_creation is not None:
            raise LocalPostgresError('local-postgresql-original-creation-already-reserved')
        postgres, initdb = self._validate_installation_binaries()
        cluster_id, incarnation_id = str(uuid.uuid4()), str(uuid.uuid4())
        maintenance = f'umf_m_{self._supervisor_id.replace("-", "")}'
        controller = f'umf_c_{self._supervisor_id.replace("-", "")}'
        business_owner = _role(self._profile.business_owner)
        suffix = self._supervisor_id.replace('-', '')
        # Preparation is inert: target directories and credentials do not exist
        # until the original owner signature has been verified and durably
        # consumed by create_target().
        control_dir = self._profile.control_home / suffix
        data_dir = self._profile.data_home / suffix
        for candidate in (control_dir, data_dir):
            try:
                os.lstat(candidate)
            except FileNotFoundError:
                continue
            except OSError:
                raise LocalPostgresError('local-postgresql-target-path-unavailable') from None
            raise LocalPostgresError('local-postgresql-target-path-already-exists')
        self._target_paths = {'control': control_dir, 'data': data_dir}
        # The monotonic operation journal is outside the not-yet-created target
        # directories, under the originally enrolled private control root.
        self._journal = _SupervisorJournal(
            self._profile.control_home / f'owner-journal-{suffix}.json',
            self._supervisor_id)
        if self._journal.read()['events']:
            self._journal = None
            self._maintenance_password = None
            raise LocalPostgresError('local-postgresql-original-creation-already-exists')
        password = secrets.token_urlsafe(48).encode('ascii')
        self._maintenance_password = password
        pw_path = control_dir / 'initdb.pwfile'
        credential_path = control_dir / 'maintenance.credential'
        config_path, hba_path, ident_path = (control_dir / 'postgresql.conf',
                                              control_dir / 'pg_hba.conf',
                                              control_dir / 'pg_ident.conf')
        hba = _render_hba(maintenance)
        config = _render_config(self._profile.port, hba_path, ident_path)
        config_digest = hashlib.sha256(config).hexdigest()
        hba_digest = hashlib.sha256(hba).hexdigest()
        request_value = {
            'profile': 'umf.local-postgresql-create-request/0.1',
            'supervisorId': self._supervisor_id, 'clusterId': cluster_id,
            'incarnationId': incarnation_id, 'installationId': self._bound_installation_id,
            'ownerUid': os.geteuid(), 'databaseName': self._profile.database_name,
            'businessOwner': business_owner, 'maintenanceName': maintenance,
            'controllerName': controller, 'controlDirectory': str(control_dir),
            'dataDirectory': str(data_dir), 'postgresPath': str(postgres),
            'postgresSha256': _sha_file(postgres), 'initdbPath': str(initdb),
            'initdbSha256': _sha_file(initdb), 'port': self._profile.port,
            'configDigest': config_digest, 'hbaDigest': hba_digest,
        }
        request_bytes = _canonical(request_value)
        try:
            request = self._owner_authority.prepare_request(
                'local-target-creation', request_bytes, context=self._authority_context)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            self._maintenance_password = None
            raise LocalPostgresError('local-postgresql-owner-request-unavailable') from None
        # No config installation, initdb or postmaster launch occurs until the
        # original signed request is verified and durably effect-bound.
        pending = _PendingTargetCreation(_BOOTSTRAP_ISSUER_SEAL, self, request,
                                         request_bytes)
        values = {
            'request': request_value, 'postgres': postgres, 'initdb': initdb,
            'control': control_dir, 'data': data_dir, 'pwPath': pw_path,
            'configPath': config_path, 'hbaPath': hba_path, 'identPath': ident_path,
            'config': config, 'hba': hba, 'configDigest': config_digest,
            'hbaDigest': hba_digest, 'credentialPath': credential_path,
        }
        self._pending_creation_values[id(pending)] = (pending, values)
        self._pending_creations[id(pending)] = pending
        self._owner_payloads['creationRequest'] = request_value
        return pending, request

    def export_owner_signing_request(self, request: object) -> dict[str, Any]:
        pending = next((item for item in self._pending_creations.values()
                        if item._request is request), None)
        if pending is None:
            raise LocalPostgresError('local-postgresql-owner-request-not-original')
        try:
            return self._owner_authority.export_signing_request(request)
        except Exception:  # noqa: BLE001 - redact signer details at the public boundary.
            raise LocalPostgresError('local-postgresql-owner-request-unavailable') from None

    def create_target(self, pending: object, signed_envelope: object) -> object:
        """Create the approved original target and stop at maintenance-only launch."""
        if type(pending) is not _PendingTargetCreation or pending._issuer is not self:
            raise LocalPostgresError('local-postgresql-original-creation-required')
        if self._pending_creations.get(id(pending)) is not pending or self._active_creation is not None:
            raise LocalPostgresError('local-postgresql-original-creation-not-reserved')
        from .owner_authority import OwnerAuthorityError
        request = pending._request
        try:
            approval = self._owner_authority.verify_approval(request, signed_envelope)
            self._owner_authority._resolve_verified_approval(
                approval, original_request=request, scope='local-target-creation',
                intent_digest=request._intent_digest)
        except OwnerAuthorityError:
            raise LocalPostgresError('local-postgresql-original-creation-approval-invalid') from None
        pending_values = self._pending_creation_values.get(id(pending))
        if pending_values is None or pending_values[0] is not pending:
            raise LocalPostgresError('local-postgresql-original-creation-not-reserved')
        values = pending_values[1]
        value = values['request']
        assert self._journal is not None
        # Record the exact original operation before consuming its one-shot native
        # dispatch reservation or invoking initdb.
        intent = dict(value)
        intent.update({'purpose': self._profile.purpose,
                       'requestDigest': request._intent_digest,
                       'approvalId': approval.approval_id,
                       'approvalDigest': approval.approval_digest})
        self._journal.append('creation-intent', intent)
        effect_key = ('local-target-creation', self._supervisor_id,
                      value['clusterId'])
        reservation = self._make_native_effect_reservation(
            request, approval, 'local-target-creation', effect_key,
            self._profile.purpose, None, self._journal.read()['events'][-1],
            pending._request_bytes)
        try:
            binding = self._owner_authority.bind_native_effect(approval, reservation)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-original-creation-dispatch-unavailable') from None
        self._native_effect_reservations[id(reservation)] = reservation
        self._native_effect_bindings[id(reservation)] = binding
        self._pending_creations.pop(id(pending), None)
        self._pending_creation_values.pop(id(pending), None)
        try:
            _private_directory(values['control'], create=True)
            _private_directory(values['data'], create=True)
            _write_private(values['pwPath'], self._maintenance_password + b'\n')
            _write_private(values['credentialPath'], self._maintenance_password + b'\n')
            _write_private(values['identPath'], b'')
            target = self._run_target_creation(pending, reservation, values)
        except BaseException:  # noqa: TRY203 - preserve the original effect failure and unresolved journal.
            # The effect is not called aborted from an exception. The original
            # journal remains authoritative until explicit observation resolves it.
            raise
        return target

    def _run_target_creation(self, pending: _PendingTargetCreation,
                             reservation: _NativeEffectReservation,
                             values: dict[str, Any]) -> _OriginalNativeTarget:
        request = values['request']
        self._active_creation = pending
        self._write_creation_config(values)
        initdb_argv = [str(values['initdb']), '-D', str(values['data']),
                       '-U', request['maintenanceName'], '--encoding=UTF8',
                       '--locale=C', '--auth-local=reject',
                       '--auth-host=scram-sha-256',
                       f"--pwfile={values['pwPath']}"]
        self._run_bounded_child(initdb_argv, values['control'] / 'initdb.log', 180,
                                allowed_binaries={str(values['initdb']),
                                                  str(values['postgres'])})
        pg_version = values['data'] / 'PG_VERSION'
        if not pg_version.is_file() or pg_version.read_text().strip() != '18':
            raise LocalPostgresError('local-postgresql-initdb-result-invalid')
        data_stat = os.stat(values['data'], follow_symlinks=False)
        assert self._journal is not None
        initdb_receipt = {'argv': initdb_argv, 'status': 'success', 'pgVersion': '18'}
        self._journal.append('initdb-confirmed', {
            'clusterId': request['clusterId'], 'dataDevice': str(data_stat.st_dev),
            'dataInode': str(data_stat.st_ino), 'ownerUid': os.geteuid(),
            'initdbReceiptDigest': _digest(initdb_receipt),
        })
        try:
            values['pwPath'].unlink()
            _fsync_directory(values['control'])
        except OSError:
            raise LocalPostgresError('local-postgresql-secret-cleanup-unverified') from None
        self._launch_postmaster(values['postgres'], values['data'], values['configPath'],
                                values['hbaPath'], values['identPath'],
                                values['configDigest'], values['hbaDigest'], launch_number=1)
        receipt = {'profile': 'umf.local-supervisor-target-creation-receipt/0.1',
                   'clusterId': request['clusterId'],
                   'incarnationId': request['incarnationId'],
                   'requestDigest': reservation.request_digest,
                   'approvalDigest': reservation.approval_digest,
                   'initdbReceiptDigest': _digest(initdb_receipt),
                   'launchReceiptDigest': self._journal.read()['events'][-1]['recordDigest'],
                   'purpose': self._profile.purpose}
        self._record_native_effect_outcome(reservation, 'confirmed', receipt)
        target = _OriginalNativeTarget(
            _BOOTSTRAP_ISSUER_SEAL, self, pending, reservation, request['clusterId'])
        self._native_targets[id(target)] = target
        self._active_creation = None
        return target

    def prepare_original_principals(self, target: object
                                    ) -> tuple[_PreparedOriginalPrincipals, object]:
        """Observe the fresh bootstrap and reserve the exact principal-stage request."""
        if (type(target) is not _OriginalNativeTarget or target._issuer is not self
                or self._native_targets.get(id(target)) is not target
                or target._creation._issuer is not self):
            raise LocalPostgresError('local-postgresql-original-target-unverified')
        if self._journal is None or self._launch is None:
            raise LocalPostgresError('local-postgresql-original-target-unavailable')
        events = self._journal.read()['events']
        if any((event['kind'] in ('principal-request-prepared', 'principal-roles-intent',
                                  'principal-roles-confirmed',
                                  'principal-database-intent', 'principal-database-confirmed')
                or (event['kind'] == 'native-effect-intent'
                    and event['payload'].get('scope') == 'native-principal-preparation'))
               for event in events):
            raise LocalPostgresError('local-postgresql-principal-stage-already-reserved')
        creation_event = next((event for event in events if event['kind'] == 'creation-intent'), None)
        if creation_event is None:
            raise LocalPostgresError('local-postgresql-original-creation-unverified')
        creation = creation_event['payload']
        if (creation.get('clusterId') != target._target_id
                or creation.get('purpose') != self._profile.purpose):
            raise LocalPostgresError('local-postgresql-original-target-mismatch')
        native = self._observe_native('postgres')
        maintenance = creation['maintenanceName']
        controller = creation['controllerName']
        business_owner = creation['businessOwner']
        try:
            with self._connect_maintenance('postgres') as connection:
                rows = connection.execute(
                    "SELECT rolname,oid,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,"
                    "rolreplication,rolbypassrls,rolinherit FROM pg_catalog.pg_roles "
                    "WHERE rolname = ANY(%s)",
                    ([maintenance, controller, business_owner],)).fetchall()
                by_name = {row[0]: row for row in rows}
                db = connection.execute(
                    'SELECT oid FROM pg_catalog.pg_database WHERE datname=%s',
                    (self._profile.database_name,)).fetchone()
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-principal-preflight-failed') from None
        if (set(by_name) != {maintenance} or db is not None):
            raise LocalPostgresError('local-postgresql-original-principal-state-not-absent')
        mrow = by_name[maintenance]
        flags = {'canLogin': mrow[2], 'superuser': mrow[3], 'createDatabase': mrow[4],
                 'createRole': mrow[5], 'replication': mrow[6],
                 'bypassRls': mrow[7], 'inherit': mrow[8]}
        maintenance_before = {'oid': int(mrow[1]), 'name': maintenance, 'flags': flags}
        maintenance_after = {'name': maintenance, 'operation': 'alter-bootstrap',
                             'flags': {'canLogin': True, 'superuser': True,
                                       'createDatabase': False, 'createRole': False,
                                       'replication': False, 'bypassRls': False,
                                       'inherit': False}}
        controller_spec = {'name': controller, 'operation': 'create-absent',
                           'flags': {'canLogin': False, 'superuser': True,
                                     'createDatabase': False, 'createRole': False,
                                     'replication': False, 'bypassRls': False,
                                     'inherit': False}}
        owner_spec = {'name': business_owner, 'operation': 'create-absent',
                      'flags': {'canLogin': False, 'superuser': False,
                                'createDatabase': False, 'createRole': False,
                                'replication': False, 'bypassRls': False,
                                'inherit': False}}
        preparation_id = str(uuid.uuid4())
        launch = self._launch
        initial_launch = next((event for event in events
                               if event['kind'] == 'launch-confirmed'), None)
        if initial_launch is None:
            raise LocalPostgresError('local-postgresql-original-launch-unverified')
        bootstrap_origin = {
            'clusterId': target._target_id,
            'incarnationId': creation['incarnationId'],
            'launchReceiptDigest': initial_launch['recordDigest'],
            'launchNativeDigest': _digest(launch['native']),
            'systemIdentifier': str(native['systemIdentifier']),
            'maintenance': maintenance_before,
        }
        intent_value = {
            'profile': 'umf.local-postgresql-principal-preparation/0.1',
            'preparationId': preparation_id,
            'supervisorId': self._supervisor_id, 'custodianId': self._custodian_id,
            'providerId': self._provider_id, 'installationId': self._bound_installation_id,
            'creationRequestDigest': creation['requestDigest'],
            'creationApprovalDigest': creation['approvalDigest'],
            'bootstrapOriginDigest': _digest(bootstrap_origin),
            'bootstrapDatabase': {'oid': native['databaseOid'], 'name': 'postgres',
                                  'systemIdentifier': str(native['systemIdentifier'])},
            'maintenanceBefore': maintenance_before,
            'maintenanceAfter': maintenance_after,
            'controller': controller_spec, 'businessOwner': owner_spec,
            'applicationDatabase': {'name': self._profile.database_name,
                                    'ownerName': business_owner, 'encoding': 'UTF8',
                                    'locale': 'C', 'operation': 'create-absent'},
            'memberships': [
                {'memberName': maintenance, 'roleName': controller,
                 'inherit': False, 'set': True, 'admin': False},
                {'memberName': maintenance, 'roleName': business_owner,
                 'inherit': False, 'set': True, 'admin': False}],
            'maximumRoles': 3,
        }
        intent_bytes = _canonical(intent_value)
        try:
            request = self._owner_authority.prepare_request(
                'native-principal-preparation', intent_bytes,
                context=self._authority_context)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-principal-request-unavailable') from None
        self._journal.append('principal-request-prepared', {
            'preparationId': preparation_id, 'approvalId': request._approval_id,
            'intent': intent_value,
            'requestDigest': request._intent_digest,
        })
        prepared = _PreparedOriginalPrincipals(
            _BOOTSTRAP_ISSUER_SEAL, self, target, request, intent_bytes,
            {'intent': intent_value, 'bootstrapOrigin': bootstrap_origin,
             'maintenance': maintenance, 'controller': controller,
             'businessOwner': business_owner})
        self._principal_preparations[id(prepared)] = prepared
        return prepared, request

    def export_principal_signing_request(self, prepared: object) -> dict[str, Any]:
        if (type(prepared) is not _PreparedOriginalPrincipals
                or prepared._issuer is not self
                or self._principal_preparations.get(id(prepared)) is not prepared):
            raise LocalPostgresError('local-postgresql-principal-request-not-original')
        try:
            return self._owner_authority.export_signing_request(prepared._request)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-principal-request-unavailable') from None

    def apply_original_principals(self, prepared: object,
                                  signed_envelope: object) -> dict[str, Any]:
        """Apply the approved role transaction, then separately create the application DB."""
        if (type(prepared) is not _PreparedOriginalPrincipals
                or prepared._issuer is not self
                or self._principal_preparations.get(id(prepared)) is not prepared
                or prepared._target._issuer is not self):
            raise LocalPostgresError('local-postgresql-principal-request-not-original')
        if id(prepared) in self._principal_dispatches:
            raise LocalPostgresError('local-postgresql-principal-outcome-unresolved')
        request = prepared._request
        from .owner_authority import OwnerAuthorityError
        try:
            approval = self._owner_authority.verify_approval(request, signed_envelope)
            self._owner_authority._resolve_verified_approval(
                approval, original_request=request, scope='native-principal-preparation',
                intent_digest=request._intent_digest)
        except OwnerAuthorityError:
            raise LocalPostgresError('local-postgresql-principal-approval-invalid') from None
        intent_value = prepared._values['intent']
        assert self._journal is not None
        event = self._journal.read()['events'][-1]
        effect_key = ('native-principal-preparation', self._supervisor_id,
                      intent_value['preparationId'])
        reservation = self._make_native_effect_reservation(
            request, approval, 'native-principal-preparation', effect_key,
            self._profile.purpose, prepared._target, event, prepared._request._intent_bytes)
        # Persist the in-process dispatch fence before binding approval or
        # entering either native stage. A failure at any later point must be
        # observed through the original journal reservation, never replayed.
        self._principal_dispatches[id(prepared)] = reservation
        try:
            binding = self._owner_authority.bind_native_effect(approval, reservation)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-principal-dispatch-unavailable') from None
        self._native_effect_bindings[id(reservation)] = binding
        self._journal.append('principal-roles-intent', {
            'reservationId': reservation.reservation_id,
            'preparationId': intent_value['preparationId']})
        role_observation = self._apply_principal_role_transaction(prepared)
        role_digest = _digest(role_observation)
        self._journal.append('principal-roles-confirmed', {
            'reservationId': reservation.reservation_id,
            'observationDigest': role_digest})
        self._journal.append('principal-database-intent', {
            'reservationId': reservation.reservation_id,
            'databaseName': intent_value['applicationDatabase']['name']})
        database = self._create_application_database(prepared)
        self._journal.append('principal-database-confirmed', {
            'reservationId': reservation.reservation_id,
            'databaseOid': database['oid'],
            'systemIdentifier': database['systemIdentifier']})
        receipt = {'profile': 'umf.local-postgresql-principal-preparation-receipt/0.1',
                   'preparationId': intent_value['preparationId'],
                   'requestDigest': reservation.request_digest,
                   'approvalDigest': reservation.approval_digest,
                   'roleObservationDigest': role_digest,
                   'applicationDatabase': database,
                   'creationReceiptDigest': reservation.journal_record_digest,
                   'purpose': self._profile.purpose}
        self._record_native_effect_outcome(reservation, 'confirmed', receipt)
        assert self._journal is not None
        chain = self._journal.read()
        creation = next(event['payload'] for event in chain['events']
                        if event['kind'] == 'creation-intent')
        initdb = next(event['payload'] for event in chain['events']
                       if event['kind'] == 'initdb-confirmed')
        initial_launch = next(event for event in chain['events']
                              if event['kind'] == 'launch-confirmed')
        principal_receipt = {
            'profile': receipt['profile'],
            'preparationId': receipt['preparationId'],
            'requestDigest': receipt['requestDigest'],
            'approvalDigest': receipt['approvalDigest'],
            'roleObservationDigest': receipt['roleObservationDigest'],
            'applicationDatabase': database,
            'purpose': self._profile.purpose,
        }
        principal_receipt_digest = _digest(principal_receipt)
        creation_receipt = {
            'profile': 'umf.local-supervisor-creation-receipt/0.1',
            'supervisorId': self._supervisor_id,
            'clusterId': creation['clusterId'],
            'incarnationId': creation['incarnationId'],
            'creationRequestDigest': creation['requestDigest'],
            'creationApprovalDigest': creation['approvalDigest'],
            'initdbReceiptDigest': initdb['initdbReceiptDigest'],
            'initialLaunchReceiptDigest': initial_launch['recordDigest'],
            'principalPreparationRequestDigest': reservation.request_digest,
            'principalPreparationApprovalDigest': reservation.approval_digest,
            'principalPreparationReceiptDigest': principal_receipt_digest,
            'applicationDatabase': database,
        }
        creation_receipt_digest = _digest(creation_receipt)
        self._journal.append('creation-finalized', {
            'receipt': creation_receipt, 'receiptDigest': creation_receipt_digest})
        self._owner_payloads['creationReceipt'] = creation_receipt
        self._owner_payloads['creationReceiptDigest'] = creation_receipt_digest
        self._owner_payloads['principalObservations'] = {
            'roles': role_observation, 'applicationDatabase': database,
            'requestDigest': reservation.request_digest,
            'approvalDigest': reservation.approval_digest,
            'receiptDigest': _digest(receipt),
        }
        self._principal_preparations.pop(id(prepared), None)
        return receipt

    def resume_original_principal_stage(self, target: object) -> dict[str, Any]:
        """Reconcile the original role/DB stage and continue only its DB substage.

        This recovery path requires the exact original prepared request, verified
        signature, and native effect reservation. It never repeats role DDL. If
        the roles transaction is not fully visible with the reviewed flags and
        memberships, it refuses for further observation rather than guessing.
        An absent application database after committed roles may be created only
        under the original database substage and original approval.
        """
        if (type(target) is not _OriginalNativeTarget or target._issuer is not self
                or self._native_targets.get(id(target)) is not target
                or self._journal is None or self._launch is None):
            raise LocalPostgresError('local-postgresql-original-target-unverified')
        events = self._journal.read()['events']
        request_event = next((event for event in events
                              if event['kind'] == 'principal-request-prepared'), None)
        if request_event is None:
            raise LocalPostgresError('local-postgresql-principal-recovery-unavailable')
        intent = request_event['payload']['intent']
        if intent['creationRequestDigest'] != target._creation._request._intent_digest:
            raise LocalPostgresError('local-postgresql-principal-recovery-mismatch')
        reservation, outcome, request = self._recover_original_native_effect(
            'native-principal-preparation', target=target)
        if request._approval_id != request_event['payload']['approvalId']:
            raise LocalPostgresError('local-postgresql-principal-recovery-mismatch')
        values = {'intent': intent,
                  'maintenance': intent['maintenanceBefore']['name'],
                  'controller': intent['controller']['name'],
                  'businessOwner': intent['businessOwner']['name']}
        prepared = _PreparedOriginalPrincipals(
            _BOOTSTRAP_ISSUER_SEAL, self, target, request,
            request._intent_bytes, values)
        self._principal_preparations[id(prepared)] = prepared
        self._principal_dispatches[id(prepared)] = reservation

        role_observation = self._observe_original_principal_roles(prepared)
        role_digest = _digest(role_observation)
        role_confirmed = next((event for event in events
                               if event['kind'] == 'principal-roles-confirmed'
                               and event['payload'].get('reservationId')
                                   == reservation.reservation_id), None)
        if role_confirmed is not None:
            if role_confirmed['payload']['observationDigest'] != role_digest:
                raise LocalPostgresError('local-postgresql-principal-role-state-mismatch')
        else:
            if not any(event['kind'] == 'principal-roles-intent'
                       and event['payload'].get('reservationId')
                           == reservation.reservation_id for event in events):
                raise LocalPostgresError('local-postgresql-principal-role-intent-unavailable')
            self._journal.append('principal-roles-confirmed', {
                'reservationId': reservation.reservation_id,
                'observationDigest': role_digest})

        database = self._observe_original_application_database(prepared)
        database_confirmed = next((event for event in events
                                   if event['kind'] == 'principal-database-confirmed'
                                   and event['payload'].get('reservationId')
                                       == reservation.reservation_id), None)
        database_intent = next((event for event in events
                                if event['kind'] == 'principal-database-intent'
                                and event['payload'].get('reservationId')
                                    == reservation.reservation_id), None)
        if database_confirmed is not None:
            if (database is None
                    or database_confirmed['payload']['databaseOid'] != database['oid']
                    or database_confirmed['payload']['systemIdentifier']
                        != database['systemIdentifier']):
                raise LocalPostgresError('local-postgresql-database-state-mismatch')
        elif database is not None:
            # A lost CREATE DATABASE acknowledgement is settled by the actual
            # catalog row, owner, locale, and system identifier, without DDL.
            if database_intent is None:
                raise LocalPostgresError('local-postgresql-database-intent-unavailable')
            self._journal.append('principal-database-confirmed', {
                'reservationId': reservation.reservation_id,
                'databaseOid': database['oid'],
                'systemIdentifier': database['systemIdentifier']})
        else:
            if database_intent is not None and (
                    database_intent['payload']['databaseName']
                    != intent['applicationDatabase']['name']):
                raise LocalPostgresError('local-postgresql-database-intent-mismatch')
            if database_intent is None:
                self._journal.append('principal-database-intent', {
                    'reservationId': reservation.reservation_id,
                    'databaseName': intent['applicationDatabase']['name']})
            database = self._create_application_database(prepared)
            self._journal.append('principal-database-confirmed', {
                'reservationId': reservation.reservation_id,
                'databaseOid': database['oid'],
                'systemIdentifier': database['systemIdentifier']})

        receipt = {'profile': 'umf.local-postgresql-principal-preparation-receipt/0.1',
                   'preparationId': intent['preparationId'],
                   'requestDigest': reservation.request_digest,
                   'approvalDigest': reservation.approval_digest,
                   'roleObservationDigest': role_digest,
                   'applicationDatabase': database,
                   'creationReceiptDigest': reservation.journal_record_digest,
                   'purpose': self._profile.purpose}
        expected_receipt_digest = _digest(receipt)
        if outcome is None:
            self._record_native_effect_outcome(reservation, 'confirmed', receipt)
        elif outcome.status != 'confirmed' or outcome.receipt_digest != expected_receipt_digest:
            raise LocalPostgresError('local-postgresql-principal-outcome-mismatch')
        else:
            owner_state = self._owner_authority.observe_original_request(
                self._authority_context, request.effect_key)
            if owner_state.effect_status == 'effect-pending':
                try:
                    self._owner_authority.record_native_outcome(
                        self._native_effect_bindings[id(reservation)], outcome)
                except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
                    raise LocalPostgresError(
                        'local-postgresql-principal-outcome-record-pending') from None
            elif (owner_state.effect_status != 'confirmed'
                  or owner_state.effect_receipt_digest != outcome.receipt_digest):
                raise LocalPostgresError('local-postgresql-principal-outcome-mismatch')

        self._finalize_recovered_principal_receipt(
            reservation, receipt, role_observation, database)
        return receipt

    def _observe_original_principal_roles(
            self, prepared: _PreparedOriginalPrincipals) -> dict[str, Any]:
        values = prepared._values
        intent = values['intent']
        maintenance, controller, owner = (values['maintenance'], values['controller'],
                                            values['businessOwner'])
        try:
            with self._connect_maintenance('postgres') as connection:
                roles = connection.execute(
                    "SELECT rolname,oid,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,"
                    "rolreplication,rolbypassrls,rolinherit FROM pg_catalog.pg_roles "
                    "WHERE rolname = ANY(%s)", ([maintenance, controller, owner],)
                ).fetchall()
                memberships = connection.execute(
                    "SELECT member.rolname,granted.rolname,m.admin_option,"
                    "m.inherit_option,m.set_option FROM pg_catalog.pg_auth_members m "
                    "JOIN pg_catalog.pg_roles member ON member.oid=m.member "
                    "JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid "
                    "WHERE member.rolname=%s", (maintenance,)).fetchall()
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-principal-observation-failed') from None
        role_map = {row[0]: row for row in roles}
        expected_flags = {
            maintenance: (True, True, False, False, False, False, False),
            controller: (False, True, False, False, False, False, False),
            owner: (False, False, False, False, False, False, False),
        }
        if (set(role_map) != set(expected_flags)
                or any(tuple(role_map[name][2:]) != flags
                       for name, flags in expected_flags.items())
                or int(role_map[maintenance][1])
                    != intent['maintenanceBefore']['oid']):
            raise LocalPostgresError('local-postgresql-principal-role-state-unresolved')
        normalized = _ordered_required_memberships(
            memberships, maintenance, controller, owner)
        observation = {
            'roles': {name: {'oid': int(role_map[name][1]),
                             'flags': dict(zip(('canLogin', 'superuser', 'createDatabase',
                                               'createRole', 'replication', 'bypassRls',
                                               'inherit'), expected_flags[name], strict=True))}
                      for name in (maintenance, controller, owner)},
            'memberships': [list(row) for row in normalized],
            'intentDigest': prepared._request._intent_digest,
        }
        return observation

    def _observe_original_application_database(
            self, prepared: _PreparedOriginalPrincipals) -> dict[str, Any] | None:
        intent = prepared._values['intent']['applicationDatabase']
        try:
            with self._connect_maintenance('postgres') as connection:
                row = connection.execute(
                    "SELECT d.oid,d.datname,d.datcollate,d.datctype,r.rolname "
                    "FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r "
                    "ON r.oid=d.datdba WHERE d.datname=%s", (intent['name'],)
                ).fetchone()
                if row is None:
                    return None
                system_identifier = connection.execute(
                    'SELECT system_identifier::pg_catalog.text FROM '
                    'pg_catalog.pg_control_system()').fetchone()[0]
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-database-observation-failed') from None
        if (row[1] != intent['name'] or row[2] != 'C' or row[3] != 'C'
                or row[4] != intent['ownerName']):
            raise LocalPostgresError('local-postgresql-database-state-mismatch')
        return {'oid': int(row[0]), 'name': row[1],
                'systemIdentifier': str(system_identifier)}

    def _finalize_recovered_principal_receipt(
            self, reservation: _NativeEffectReservation,
            receipt: dict[str, Any], role_observation: dict[str, Any],
            database: dict[str, Any]) -> None:
        assert self._journal is not None
        chain = self._journal.read()
        creation = next(event['payload'] for event in chain['events']
                        if event['kind'] == 'creation-intent')
        initdb = next(event['payload'] for event in chain['events']
                      if event['kind'] == 'initdb-confirmed')
        initial_launch = next(event for event in chain['events']
                              if event['kind'] == 'launch-confirmed')
        principal_receipt = {
            'profile': receipt['profile'],
            'preparationId': receipt['preparationId'],
            'requestDigest': receipt['requestDigest'],
            'approvalDigest': receipt['approvalDigest'],
            'roleObservationDigest': receipt['roleObservationDigest'],
            'applicationDatabase': database,
            'purpose': self._profile.purpose,
        }
        creation_receipt = {
            'profile': 'umf.local-supervisor-creation-receipt/0.1',
            'supervisorId': self._supervisor_id,
            'clusterId': creation['clusterId'],
            'incarnationId': creation['incarnationId'],
            'creationRequestDigest': creation['requestDigest'],
            'creationApprovalDigest': creation['approvalDigest'],
            'initdbReceiptDigest': initdb['initdbReceiptDigest'],
            'initialLaunchReceiptDigest': initial_launch['recordDigest'],
            'principalPreparationRequestDigest': reservation.request_digest,
            'principalPreparationApprovalDigest': reservation.approval_digest,
            'principalPreparationReceiptDigest': _digest(principal_receipt),
            'applicationDatabase': database,
        }
        creation_receipt_digest = _digest(creation_receipt)
        finalized = next((event['payload'] for event in chain['events']
                          if event['kind'] == 'creation-finalized'), None)
        if finalized is not None:
            if (finalized['receipt'] != creation_receipt
                    or finalized['receiptDigest'] != creation_receipt_digest):
                raise LocalPostgresError('local-postgresql-final-receipt-mismatch')
        else:
            self._journal.append('creation-finalized', {
                'receipt': creation_receipt,
                'receiptDigest': creation_receipt_digest})
        final = self._journal.read()['events'][-1]
        if final['kind'] == 'creation-finalized':
            creation_receipt = final['payload']['receipt']
            self._owner_payloads['creationReceipt'] = creation_receipt
            self._owner_payloads['creationReceiptDigest'] = final['payload']['receiptDigest']
            self._owner_payloads['principalObservations'] = {
                'roles': role_observation, 'applicationDatabase': database,
                'requestDigest': reservation.request_digest,
                'approvalDigest': reservation.approval_digest,
                'receiptDigest': _digest(receipt),
            }
        self._principal_preparations.clear()

    def prepare_target_registration(
            self, target: object) -> tuple[_PreparedTargetRegistration, object]:
        """Prepare registration only after the exact original principal stage."""
        if (type(target) is not _OriginalNativeTarget or target._issuer is not self
                or self._native_targets.get(id(target)) is not target
                or self._journal is None or self._launch is None):
            raise LocalPostgresError('local-postgresql-original-target-unverified')
        if self._journal is not None and any(
                event['kind'] in ('registration-request-prepared',
                                  'registration-signature-verified',
                                  'owner-registration-approved')
                or (event['kind'] == 'native-effect-intent'
                    and event['payload'].get('scope') == 'local-target-registration')
                for event in self._journal.read()['events']):
            raise LocalPostgresError('local-postgresql-registration-stage-already-reserved')
        creation_receipt = self._owner_payloads.get('creationReceipt')
        receipt_digest = self._owner_payloads.get('creationReceiptDigest')
        if (type(creation_receipt) is not dict or type(receipt_digest) is not str
                or _digest(creation_receipt) != receipt_digest):
            raise LocalPostgresError('local-postgresql-principal-preparation-incomplete')
        creation = next((event['payload'] for event in self._journal.read()['events']
                         if event['kind'] == 'creation-intent'), None)
        if (creation is None or creation['clusterId'] != target._target_id
                or creation['purpose'] != self._profile.purpose):
            raise LocalPostgresError('local-postgresql-original-target-mismatch')
        postgres = _regular_owned(self._profile.postgres_binary, executable=True)
        native = self._observe_native(self._profile.database_name)
        origin = self._origin(target._target_id, creation['incarnationId'], postgres,
                              self._target_paths['data'], self._launch, native)
        endpoint = self._endpoint_control()
        registration = {
            'profile': 'umf.local-owner-target-registration/0.1',
            'registrationId': str(uuid.uuid4()),
            'custodianId': self._custodian_id,
            'providerId': self._provider_id,
            'installationId': self._bound_installation_id,
            'origin': origin,
            'endpointControl': endpoint,
        }
        intent = {'profile': 'umf.owner-target-registration-intent/0.1',
                  'registration': registration}
        intent_bytes = _canonical(intent)
        try:
            request = self._owner_authority.prepare_request(
                'local-target-registration', intent_bytes,
                context=self._authority_context)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-registration-request-unavailable') from None
        self._journal.append('registration-request-prepared', {
            'registrationId': registration['registrationId'],
            'approvalId': request._approval_id,
            'intent': intent, 'requestDigest': request._intent_digest,
        })
        prepared = _PreparedTargetRegistration(
            _BOOTSTRAP_ISSUER_SEAL, self, target, request, intent_bytes, registration)
        self._registration_preparations[id(prepared)] = prepared
        return prepared, request

    def export_target_registration_request(
            self, prepared: object) -> dict[str, Any]:
        if (type(prepared) is not _PreparedTargetRegistration
                or prepared._issuer is not self
                or self._registration_preparations.get(id(prepared)) is not prepared):
            raise LocalPostgresError('local-postgresql-registration-request-not-original')
        try:
            return self._owner_authority.export_signing_request(prepared._request)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-registration-request-unavailable') from None

    def apply_target_registration(self, prepared: object,
                                  signed_envelope: object) -> object:
        """Verify signed registration, then let the original custodian journal it."""
        if (type(prepared) is not _PreparedTargetRegistration
                or prepared._issuer is not self
                or self._registration_preparations.get(id(prepared)) is not prepared
                or self._journal is None or self._launch is None
                or self._native_targets.get(id(prepared._target)) is not prepared._target):
            raise LocalPostgresError('local-postgresql-registration-request-not-original')
        if id(prepared) in self._registration_dispatches:
            raise LocalPostgresError('local-postgresql-registration-outcome-unresolved')
        request = prepared._request
        from .owner_authority import OwnerAuthorityError
        try:
            approval = self._owner_authority.verify_approval(request, signed_envelope)
            self._owner_authority._resolve_verified_approval(
                approval, original_request=request, scope='local-target-registration',
                intent_digest=request._intent_digest)
        except OwnerAuthorityError:
            raise LocalPostgresError('local-postgresql-registration-approval-invalid') from None
        creation = prepared._registration
        # Preserve the approved operation before any further observations. If
        # verification succeeded but later source/target checks are uncertain,
        # the same prepared identity must not be replaced by a new request.
        self._journal.append('registration-signature-verified', {
            'registrationId': creation['registrationId'],
            'requestDigest': request._intent_digest,
            'approvalId': approval.approval_id,
            'approvalDigest': approval.approval_digest,
        })
        fresh_native = self._observe_native(creation['origin']['database']['name'])
        if (fresh_native['systemIdentifier'] != creation['origin']['database']['systemIdentifier']
                or fresh_native['databaseOid'] != creation['origin']['database']['oid']
                or not self._native_origin_matches(
                    creation['origin'], self._launch.get('nativeAttestation'))):
            raise LocalPostgresError('local-postgresql-registration-origin-stale')
        owner_approval = {
            'authorityId': approval.authority_id,
            'approvalId': approval.approval_id,
            'approvalDigest': approval.approval_digest,
            'scope': _OWNER_APPROVAL_SCOPE,
        }
        payload = {**creation, 'ownerApproval': owner_approval}
        # The reservation payload is the exact signed intent, not the outer
        # public registration envelope. Recovery reconstructs this same byte
        # sequence from the journaled request before resolving the approval.
        payload_bytes = _registration_intent_bytes(request)
        effect_key = ('local-target-registration', self._custodian_id,
                      creation['registrationId'])
        event = self._journal.read()['events'][-1]
        reservation = self._make_native_effect_reservation(
            request, approval, 'local-target-registration', effect_key,
            self._profile.purpose, prepared._target, event, payload_bytes)
        self._registration_dispatches[id(prepared)] = reservation
        try:
            binding = self._owner_authority.bind_native_effect(approval, reservation)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-registration-dispatch-unavailable') from None
        self._native_effect_bindings[id(reservation)] = binding
        from .ingress_custody import (
            ExternalCustodyJournal,
            _bind_owner_registration_resolver,
            _bootstrap_local_target_custodian,
        )
        owner_request = OwnerEnrollmentRequest(
            _owner_capability_seal(), self, _OWNER_KIND)
        self._owner_payloads[creation['registrationId']] = payload
        self._handles[id(owner_request)] = (
            owner_request, payload, self._launch['nativeAttestation'])
        self._resolver = _bind_owner_registration_resolver(self, self)
        control = self._target_paths['control']
        custody_journal = ExternalCustodyJournal(
            control / 'target-custody.json', self._custodian_id)
        self._custodian = _bootstrap_local_target_custodian(
            custody_journal, self._custodian_id, self._provider_id, self._resolver)
        try:
            handle = self._custodian.register_target(owner_request)
            reference = self._custodian._public_reference(handle)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            # Registration may have committed in the external journal. Keep its
            # signed original intent and effect reservation for observation; do
            # not issue another registration identity or effect.
            raise LocalPostgresError('local-postgresql-registration-outcome-unresolved') from None
        self._journal.append('owner-registration-approved', {
            'registrationId': creation['registrationId'],
            'payloadDigest': _digest(payload),
            'approvalId': approval.approval_id,
            'approvalDigest': approval.approval_digest,
        })
        receipt = {'profile': 'umf.local-target-registration-effect-receipt/0.1',
                   'registrationId': creation['registrationId'],
                   'registrationDigest': _digest(payload),
                   'targetCustodyDigest': _digest(reference),
                   'requestDigest': reservation.request_digest,
                   'approvalDigest': reservation.approval_digest,
                   'purpose': self._profile.purpose}
        self._record_native_effect_outcome(reservation, 'confirmed', receipt)
        self._custody_handle = handle
        self._registration_preparations.pop(id(prepared), None)
        return handle

    def _apply_principal_role_transaction(
            self, prepared: _PreparedOriginalPrincipals) -> dict[str, Any]:
        values = prepared._values
        maintenance, controller, owner = (values['maintenance'], values['controller'],
                                            values['businessOwner'])
        try:
            with self._connect_maintenance('postgres') as connection, connection.transaction():
                    connection.execute(
                        f'ALTER ROLE {_quote_identifier(maintenance)} SUPERUSER LOGIN '
                        'NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT')
                    connection.execute(
                        f'CREATE ROLE {_quote_identifier(controller)} SUPERUSER NOLOGIN '
                        'NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT')
                    connection.execute(
                        f'CREATE ROLE {_quote_identifier(owner)} NOSUPERUSER NOLOGIN '
                        'NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT')
                    for member in (controller, owner):
                        for statement in _membership_grant_statements(maintenance, member):
                            connection.execute(statement)
                    roles = connection.execute(
                        "SELECT rolname,oid,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,"
                        "rolreplication,rolbypassrls,rolinherit FROM pg_catalog.pg_roles "
                        "WHERE rolname = ANY(%s)", ([maintenance, controller, owner],)
                    ).fetchall()
                    memberships = connection.execute(
                        "SELECT member.rolname,granted.rolname,m.admin_option,"
                        "m.inherit_option,m.set_option FROM pg_catalog.pg_auth_members m "
                        "JOIN pg_catalog.pg_roles member ON member.oid=m.member "
                        "JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid "
                        "WHERE member.rolname=%s", (maintenance,)).fetchall()
            role_map = {row[0]: row for row in roles}
            expected_flags = {
                maintenance: (True, True, False, False, False, False, False),
                controller: (False, True, False, False, False, False, False),
                owner: (False, False, False, False, False, False, False),
            }
            if set(role_map) != set(expected_flags) or any(
                    tuple(role_map[name][2:]) != flags
                    for name, flags in expected_flags.items()):
                raise LocalPostgresError('local-postgresql-role-flags-mismatch')
            normalized_memberships = _ordered_required_memberships(
                memberships, maintenance, controller, owner)
            observation = {
                'roles': {name: {'oid': int(role_map[name][1]),
                                 'flags': dict(zip(('canLogin', 'superuser', 'createDatabase',
                                                   'createRole', 'replication', 'bypassRls',
                                                   'inherit'), expected_flags[name], strict=True))}
                          for name in (maintenance, controller, owner)},
                'memberships': [list(row) for row in normalized_memberships],
                'intentDigest': prepared._request._intent_digest,
            }
            return observation
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-role-transaction-outcome-unknown') from None

    def _create_application_database(self,
                                     prepared: _PreparedOriginalPrincipals) -> dict[str, Any]:
        intent = prepared._values['intent']['applicationDatabase']
        try:
            with self._connect_maintenance('postgres') as connection:
                connection.autocommit = True
                connection.execute(
                    f'CREATE DATABASE {_quote_identifier(intent["name"])} '
                    f'OWNER {_quote_identifier(intent["ownerName"])} '
                    "ENCODING 'UTF8' LOCALE 'C'")
                row = connection.execute(
                    "SELECT d.oid,d.datname,d.datcollate,d.datctype,r.rolname "
                    "FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r "
                    "ON r.oid=d.datdba WHERE d.datname=%s", (intent['name'],)
                ).fetchone()
                system_identifier = connection.execute(
                    'SELECT system_identifier::pg_catalog.text FROM '
                    'pg_catalog.pg_control_system()').fetchone()[0]
            if (row is None or row[1] != intent['name'] or row[2] != 'C'
                    or row[3] != 'C' or row[4] != intent['ownerName']):
                raise LocalPostgresError('local-postgresql-database-observation-mismatch')
            return {'oid': int(row[0]), 'name': row[1],
                    'systemIdentifier': str(system_identifier)}
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-database-creation-outcome-unknown') from None

    def _write_creation_config(self, values: dict[str, Any]) -> None:
        _write_private(values['configPath'], values['config'], exclusive=False)
        _write_private(values['hbaPath'], values['hba'], exclusive=False)

    def _cleanup_unstarted_target(self) -> None:
        """Remove only known reversible pre-effect files/directories."""
        paths = self._target_paths
        control, data = paths.get('control'), paths.get('data')
        if self._pg_process is not None or self._journal is not None and self._journal.read()['events']:
            raise LocalPostgresError('local-postgresql-cleanup-not-proven-safe')
        if control is not None:
            for name in ('initdb.pwfile', 'maintenance.credential', 'postgresql.conf',
                         'pg_hba.conf', 'pg_ident.conf', 'owner-journal.json.lock'):
                candidate = control / name
                try:
                    st = os.lstat(candidate)
                    if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid():
                        raise LocalPostgresError('local-postgresql-cleanup-path-unsafe')
                    candidate.unlink()
                except FileNotFoundError:
                    pass
            try:
                control.rmdir()
            except OSError:
                raise LocalPostgresError('local-postgresql-cleanup-unverified') from None
        if data is not None:
            try:
                data.rmdir()
            except OSError:
                raise LocalPostgresError('local-postgresql-cleanup-unverified') from None

    def _validate_installation_binaries(self) -> tuple[Path, Path]:
        postgres = _regular_owned(self._profile.postgres_binary, executable=True)
        initdb = _regular_owned(self._profile.initdb_binary, executable=True)
        if postgres.parent != initdb.parent:
            raise LocalPostgresError('local-postgresql-binary-directory-mismatch')
        for binary in (postgres, initdb):
            try:
                result = subprocess.run([str(binary), '--version'], stdin=subprocess.DEVNULL,
                                        capture_output=True, env=dict(_ENV), close_fds=True,
                                        timeout=5, check=False)
            except (OSError, subprocess.TimeoutExpired):
                raise LocalPostgresError('local-postgresql-binary-probe-failed') from None
            if result.returncode != 0 or _VERSION.encode() not in result.stdout:
                raise LocalPostgresError('local-postgresql-version-unsupported')
        return postgres, initdb

    def _legacy_create_target(self, *, installation_id: str) -> OwnerEnrollmentRequest:
        """Legacy one-shot API is disabled; use the signed staged interface."""
        del installation_id
        raise LocalPostgresError('local-postgresql-staged-owner-approval-required')

    def _prepare_original_principals(self, maintenance: str, controller: str,
                                     business_owner: str) -> None:
        """Legacy combined principal/database mutation is disabled."""
        del maintenance, controller, business_owner
        raise LocalPostgresError('local-postgresql-staged-owner-approval-required')

    def _installation_id(self) -> str:
        assert self._journal is not None
        intent = next(event['payload'] for event in self._journal.read()['events']
                      if event['kind'] == 'creation-intent')
        return intent['installationId']

    def resolve_owner_registration(self, request: OwnerEnrollmentRequest, *,
                                   custodian_id: str, provider_id: str):
        entry = self._handles.get(id(request))
        if (entry is None or entry[0] is not request or custodian_id != self._custodian_id
                or provider_id != self._provider_id):
            raise LocalPostgresError('owner-registration-unverified')
        payload, attestation = entry[1], entry[2]
        if not self._native_origin_matches(payload['origin'], attestation):
            raise LocalPostgresError('owner-registration-origin-mismatch')
        return self._owner_evidence(request, payload, attestation)

    def observe_original_registration(self, request: OwnerEnrollmentRequest, *,
                                      original_payload: dict[str, Any],
                                      custodian_sequence: int):
        entry = self._handles.get(id(request))
        if (entry is None or entry[0] is not request or entry[1] != original_payload
                or type(custodian_sequence) is not int or custodian_sequence < 1):
            raise LocalPostgresError('owner-registration-unverified')
        process = self._verify_live_process()
        native = self._observe_native(original_payload['origin']['database']['name'])
        if (str(native['systemIdentifier']) != original_payload['origin']['database']['systemIdentifier']
                or native['databaseOid'] != original_payload['origin']['database']['oid']
                or not self._native_origin_matches(original_payload['origin'], entry[2])):
            raise LocalPostgresError('owner-registration-origin-mismatch')
        observation = self._registration_observation(original_payload, native, process,
                                                     custodian_sequence)
        return self._issue_evidence(request, original_payload, observation, entry[2])

    def _owner_evidence(self, request: OwnerEnrollmentRequest,
                        payload: dict[str, Any], attestation: object):
        native = self._observe_native(payload['origin']['database']['name'])
        process = self._verify_live_process()
        observation = self._registration_observation(payload, native, process, 1)
        return self._issue_evidence(request, payload, observation, attestation)

    def _issue_evidence(self, request: OwnerEnrollmentRequest, payload: dict[str, Any],
                        observation: dict[str, Any], attestation: object):
        from .ingress_custody import _issue_owner_registration_evidence

        resolver = self._resolver
        if resolver is None:
            raise LocalPostgresError('owner-registration-unverified')
        return _issue_owner_registration_evidence(resolver, request, payload,
                                                  observation, attestation)

    def _launch_postmaster(self, postgres: Path, data_dir: Path, config_path: Path,
                           hba_path: Path, ident_path: Path, config_digest: str,
                           hba_digest: str, *, launch_number: int) -> None:
        assert self._journal is not None
        current_hba = _render_hba(self._maintenance_name())
        if hashlib.sha256(current_hba).hexdigest() != hba_digest:
            raise LocalPostgresError('local-postgresql-hba-profile-mismatch')
        _write_private(hba_path, current_hba, exclusive=False)
        argv = [str(postgres), '-D', str(data_dir), '-c', f'config_file={config_path}',
                '-c', f'hba_file={hba_path}', '-c', f'ident_file={ident_path}']
        launch_id = str(uuid.uuid4())
        data_st = os.stat(data_dir, follow_symlinks=False)
        self._journal.append('launch-intent', {
            'launchId': launch_id, 'launchNumber': launch_number,
            'argv': argv, 'configDigest': config_digest, 'hbaDigest': hba_digest,
            'binarySha256': _sha_file(postgres), 'dataDevice': str(data_st.st_dev),
            'dataInode': str(data_st.st_ino),
        })
        log_path = self._target_paths['control'] / f'postgres-launch-{launch_number}.log'
        log_fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.fchmod(log_fd, 0o600)
        try:
            self._pg_process = subprocess.Popen(
                argv, cwd=str(self._target_paths['control']), env=dict(_ENV),
                stdin=subprocess.DEVNULL, stdout=log_fd, stderr=subprocess.STDOUT,
                close_fds=True, start_new_session=True)
        except OSError:
            os.close(log_fd)
            raise LocalPostgresError('local-postgresql-postmaster-start-failed') from None
        finally:
            try:
                os.close(log_fd)
            except OSError:
                pass
        self._launch = {'launchId': launch_id, 'launchNumber': launch_number,
                        'argv': argv, 'process': None}
        started = time.monotonic()
        last_error = None
        while time.monotonic() - started < 30:
            if self._pg_process.poll() is not None:
                self._assert_group_absent(self._pg_process.pid)
                raise LocalPostgresError('local-postgresql-postmaster-exited-during-start')
            try:
                process = self._verify_live_process()
                # Initdb creates only the maintenance database.  The application
                # database is created later after process/configuration proof.
                native = self._observe_native('postgres')
                break
            except LocalPostgresError as exc:
                last_error = exc.code
                time.sleep(0.2)
        else:
            raise LocalPostgresError('local-postgresql-postmaster-start-timeout:' + str(last_error))
        members = self._verify_owned_process_group(process['pgid'])
        sockets = self._verify_endpoint_sockets(
            self._observer.sockets(process['pgid']), {item['pid'] for item in members})
        endpoint_digest = _digest({'hbaDigest': hba_digest, 'configDigest': config_digest,
                                   'listen': '127.0.0.1', 'port': self._profile.port,
                                   'unixSocketDirectories': '',
                                   'socketsDigest': _digest(sockets),
                                   'nativeSettingsDigest': _digest(native),
                                   'processStartToken': process['startToken']})
        self._launch = {'launchId': launch_id, 'launchNumber': launch_number,
                        'argv': argv, 'process': process, 'native': native,
                        'sockets': sockets,
                        'nativeAttestation': _NativeAttestation(self, process, native,
                                                               endpoint_digest)}
        self._journal.append('launch-confirmed', {
            'launchId': launch_id, 'process': process,
            'nativeObservationDigest': _digest(native),
            'endpointReceiptDigest': endpoint_digest,
        })

    def _verify_live_process(self) -> dict[str, Any]:
        process = self._pg_process
        if process is None or process.poll() is not None:
            raise LocalPostgresError('local-postgresql-process-not-owned')
        observed = self._observer.process(process.pid)
        expected_binary = str(_regular_owned(self._profile.postgres_binary, executable=True))
        launch = self._launch
        if launch is None:
            raise LocalPostgresError('local-postgresql-process-not-owned')
        if (observed['uid'] != os.geteuid() or observed['gid'] != os.getegid()
                or observed['pgid'] != process.pid or observed['path'] != expected_binary
                or observed['pid'] != process.pid or observed['argv'] != launch['argv']):
            raise LocalPostgresError('local-postgresql-process-origin-mismatch')
        return observed

    def _verify_owned_process_group(self, pgid: int) -> list[dict[str, Any]]:
        members = self._observer.group(pgid)
        expected_binary = str(_regular_owned(self._profile.postgres_binary, executable=True))
        if (not members or len({item.get('pid') for item in members}) != len(members)
                or any(type(item) is not dict or item.get('pgid') != pgid
                       or item.get('uid') != os.geteuid()
                       or item.get('gid') != os.getegid()
                       or item.get('path') != expected_binary
                       for item in members)):
            raise LocalPostgresError('local-postgresql-process-group-ownership-unknown')
        return members

    def _verify_endpoint_sockets(self, sockets: list[dict[str, Any]],
                                 process_ids: set[int] | None = None) -> list[dict[str, Any]]:
        listeners = [item for item in sockets if item['listening']]
        if (len(listeners) != 1 or listeners[0]['family'] != 2
                or listeners[0]['address'] != '127.0.0.1'
                or listeners[0]['port'] != self._profile.port
                or any(item['family'] != 2 or item['address'] != '127.0.0.1'
                       or (process_ids is not None and item['pid'] not in process_ids)
                       or (item['listening'] and item['peerAddress'] != '0.0.0.0')
                       or (not item['listening'] and item['peerAddress'] not in ('127.0.0.1', None))
                       for item in sockets)):
            raise LocalPostgresError('local-postgresql-socket-profile-mismatch')
        return sockets

    def _assert_group_absent(self, pgid: int) -> None:
        for _attempt in range(5):
            members = self._observer.group(pgid)
            if not members:
                return
            time.sleep(0.1)
        raise LocalPostgresError('local-postgresql-process-group-still-live')

    def _run_bounded_child(self, argv: list[str], log_path: Path, timeout: float,
                           *, allowed_binaries: set[str]) -> None:
        log_fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.fchmod(log_fd, 0o600)
        try:
            child = subprocess.Popen(argv, cwd=str(log_path.parent), env=dict(_ENV),
                                     stdin=subprocess.DEVNULL, stdout=log_fd,
                                     stderr=subprocess.STDOUT, close_fds=True,
                                     start_new_session=True)
        except OSError:
            os.close(log_fd)
            raise LocalPostgresError('local-postgresql-child-start-failed') from None
        finally:
            try:
                os.close(log_fd)
            except OSError:
                pass
        try:
            status = child.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            self._terminate_owned_child(child, allowed_binaries)
            raise LocalPostgresError('local-postgresql-child-timeout') from None
        self._assert_group_absent(child.pid)
        if status != 0:
            raise LocalPostgresError('local-postgresql-child-failed')

    def _terminate_owned_child(self, child: subprocess.Popen[bytes],
                               allowed_binaries: set[str]) -> None:
        if child.poll() is not None:
            self._assert_group_absent(child.pid)
            return
        members = self._observer.group(child.pid)
        expected = {str(Path(x).resolve(strict=True)) for x in allowed_binaries}
        if (not members or any(member.get('pgid') != child.pid
                               or member.get('uid') != os.geteuid()
                               or member.get('path') not in expected for member in members)):
            raise LocalPostgresError('local-postgresql-child-ownership-unknown')
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            members = self._observer.group(child.pid)
            if (not members or any(member.get('pgid') != child.pid
                                   or member.get('uid') != os.geteuid()
                                   or member.get('path') not in expected for member in members)):
                raise LocalPostgresError('local-postgresql-child-ownership-unknown')
            os.killpg(child.pid, signal.SIGKILL)
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                raise LocalPostgresError('local-postgresql-child-terminal-unknown') from None
        self._assert_group_absent(child.pid)

    def _maintenance_name(self) -> str:
        if self._journal is None:
            raise LocalPostgresError('local-postgresql-not-created')
        intent = next((event['payload'] for event in self._journal.read()['events']
                       if event['kind'] == 'creation-intent'), None)
        if intent is None:
            raise LocalPostgresError('local-postgresql-not-created')
        return intent['maintenanceName']

    def _connect_maintenance(self, database_name: str):
        if self._maintenance_password is None:
            raise LocalPostgresError('local-postgresql-credential-unavailable')
        try:
            import psycopg

            return psycopg.connect(host='127.0.0.1', port=self._profile.port,
                                    dbname=database_name, user=self._maintenance_name(),
                                    password=self._maintenance_password.decode('ascii').rstrip('\n'),
                                    sslmode='disable', connect_timeout=3,
                                    application_name='umf_g11_local_owner',
                                    options="-c search_path=pg_catalog -c row_security=on "
                                            "-c session_replication_role=origin "
                                            "-c default_transaction_read_only=off "
                                            "-c 'default_transaction_isolation=read committed'")
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-maintenance-authentication-failed') from None

    def _observe_native(self, database_name: str, *, current_role: str | None = None) -> dict[str, Any]:
        try:
            with self._connect_maintenance(database_name) as connection:
                connection.autocommit = True
                if current_role is not None:
                    connection.execute(f'SET ROLE {_quote_identifier(current_role)}')
                row = connection.execute("""SELECT current_setting('server_version_num'),
current_setting('listen_addresses'),current_setting('unix_socket_directories'),
current_setting('port'),current_setting('data_directory'),current_setting('config_file'),
current_setting('hba_file'),current_setting('ident_file'),current_setting('ssl'),
current_setting('password_encryption'),current_setting('TimeZone'),current_setting('DateStyle'),
current_setting('max_prepared_transactions'),current_setting('shared_preload_libraries'),
current_setting('session_preload_libraries'),current_setting('local_preload_libraries'),
current_setting('authentication_timeout'),current_setting('log_statement'),
current_setting('log_min_error_statement'),current_setting('log_error_verbosity'),
current_setting('search_path'),current_setting('row_security'),
current_setting('session_replication_role'),current_setting('transaction_read_only'),
current_setting('transaction_isolation'),
current_database(),(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()),
(SELECT system_identifier::pg_catalog.text FROM pg_catalog.pg_control_system()),
session_user,current_user,current_setting('role'),
(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=session_user),
(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user),pg_catalog.version()""").fetchone()
                names = ('serverVersionNum', 'listenAddresses', 'unixSocketDirectories',
                         'port', 'dataDirectory', 'configFile', 'hbaFile', 'identFile', 'ssl',
                         'passwordEncryption', 'timeZone', 'dateStyle', 'maxPreparedTransactions',
                         'sharedPreloadLibraries', 'sessionPreloadLibraries',
                         'localPreloadLibraries', 'authenticationTimeout', 'logStatement',
                         'logMinErrorStatement', 'logErrorVerbosity', 'searchPath',
                         'rowSecurity', 'sessionReplicationRole', 'transactionReadOnly',
                         'transactionIsolation', 'databaseName',
                         'databaseOid', 'systemIdentifier', 'sessionUser', 'currentUser',
                         'roleSetting',
                         'sessionUserOid', 'currentUserOid', 'serverVersion')
                native = dict(zip(names, row, strict=True))
                rules = connection.execute("""SELECT type,database,user_name,address,netmask,
auth_method,options,error FROM pg_catalog.pg_hba_file_rules ORDER BY line_number""").fetchall()
                native['hbaRules'] = [list(item) for item in rules]
                setting_rows = connection.execute("""SELECT name,setting,source,sourcefile,
pending_restart FROM pg_catalog.pg_settings ORDER BY name""").fetchall()
                native['settingsDigest'] = _digest([list(item) for item in setting_rows])
                native['settingsCount'] = len(setting_rows)
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-native-observation-failed') from None
        expected_role = current_role or self._maintenance_name()
        expected = {
            'serverVersionNum': str(_VERSION_NUM), 'listenAddresses': '127.0.0.1',
            'unixSocketDirectories': '', 'port': str(self._profile.port), 'ssl': 'off',
            'passwordEncryption': 'scram-sha-256', 'timeZone': 'UTC',
            'dateStyle': 'ISO, YMD', 'maxPreparedTransactions': '0',
            'sharedPreloadLibraries': '', 'sessionPreloadLibraries': '',
            'localPreloadLibraries': '', 'authenticationTimeout': '10s',
            'logStatement': 'none', 'logMinErrorStatement': 'panic',
            'logErrorVerbosity': 'terse', 'sessionUser': self._maintenance_name(),
            'currentUser': expected_role,
            'roleSetting': current_role or 'none',
            'searchPath': 'pg_catalog', 'rowSecurity': 'on',
            'sessionReplicationRole': 'origin', 'transactionReadOnly': 'off',
            'transactionIsolation': 'read committed',
            'databaseName': database_name,
        }
        if any(native.get(key) != value for key, value in expected.items()):
            raise LocalPostgresError('local-postgresql-effective-settings-mismatch')
        if (native['serverVersion'] is None or 'PostgreSQL 18.6' not in native['serverVersion']
                or str(native['systemIdentifier']) == '' or type(native['databaseOid']) is not int):
            raise LocalPostgresError('local-postgresql-native-identity-invalid')
        if self._target_paths and (Path(native['dataDirectory']) != self._target_paths['data']
                                   or Path(native['configFile']) != self._target_paths['control'] / 'postgresql.conf'
                                   or Path(native['hbaFile']) != self._target_paths['control'] / 'pg_hba.conf'
                                   or Path(native['identFile']) != self._target_paths['control'] / 'pg_ident.conf'):
            raise LocalPostgresError('local-postgresql-effective-path-mismatch')
        self._verify_effective_settings(setting_rows, native)
        self._verify_hba_rules(native['hbaRules'])
        return native

    def _verify_effective_settings(self, rows: list[tuple[Any, ...]],
                                   native: dict[str, Any]) -> None:
        expected_file = {
            'listen_addresses': '127.0.0.1', 'unix_socket_directories': '',
            'port': str(self._profile.port), 'ssl': 'off',
            'password_encryption': 'scram-sha-256', 'max_prepared_transactions': '0',
            'shared_preload_libraries': '', 'session_preload_libraries': '',
            'local_preload_libraries': '', 'timezone': 'UTC', 'datestyle': 'ISO, YMD',
            'authentication_timeout': '10s', 'log_statement': 'none',
            'log_min_error_statement': 'panic', 'log_error_verbosity': 'terse',
        }
        expected_command = {
            'config_file': str(self._target_paths['control'] / 'postgresql.conf'),
            'data_directory': str(self._target_paths['data']),
            'hba_file': str(self._target_paths['control'] / 'pg_hba.conf'),
            'ident_file': str(self._target_paths['control'] / 'pg_ident.conf'),
        }
        expected_client = {
            'application_name': 'umf_g11_local_owner', 'client_encoding': 'UTF8',
            'search_path': 'pg_catalog', 'row_security': 'on',
            'session_replication_role': 'origin', 'default_transaction_read_only': 'off',
            'default_transaction_isolation': 'read committed',
        }
        seen_file: set[str] = set()
        seen_command: set[str] = set()
        seen_client: set[str] = set()
        for name, setting, source, sourcefile, pending_restart in rows:
            key = str(name).lower()
            if pending_restart is not False:
                raise LocalPostgresError('local-postgresql-effective-settings-mismatch')
            if source == 'configuration file':
                if (key not in expected_file or setting != expected_file[key]
                        or sourcefile != native['configFile']):
                    raise LocalPostgresError('local-postgresql-effective-settings-mismatch')
                seen_file.add(key)
            elif source == 'command line':
                if key not in expected_command or setting != expected_command[key] or sourcefile is not None:
                    raise LocalPostgresError('local-postgresql-effective-settings-mismatch')
                seen_command.add(key)
            elif source == 'client':
                if key not in expected_client or setting != expected_client[key] or sourcefile is not None:
                    raise LocalPostgresError('local-postgresql-effective-settings-mismatch')
                seen_client.add(key)
            elif key == 'role' and source == 'session':
                if setting != native['roleSetting'] or sourcefile is not None:
                    raise LocalPostgresError('local-postgresql-effective-settings-mismatch')
            elif source == 'default':
                if sourcefile is not None:
                    raise LocalPostgresError('local-postgresql-effective-settings-mismatch')
            else:
                # Environment, session, auto.conf, override and unknown sources
                # are outside this closed initialization profile.
                raise LocalPostgresError('local-postgresql-effective-settings-mismatch')
        if (seen_file != set(expected_file) or seen_command != set(expected_command)
                or seen_client != set(expected_client)):
            raise LocalPostgresError('local-postgresql-effective-settings-mismatch')

    def _verify_hba_rules(self, rules: list[list[Any]]) -> None:
        maintenance = self._maintenance_name()
        selected = []
        for row in rules:
            if row[-1] is not None:
                raise LocalPostgresError('local-postgresql-hba-parse-error')
            selected.append(row)
        expected_shape = [
            ['host', ['all'], [maintenance], '127.0.0.1', '255.255.255.255', 'scram-sha-256', [], None],
            ['local', ['all'], ['all'], None, None, 'reject', [], None],
            ['host', ['all'], ['all'], '0.0.0.0', '0.0.0.0', 'reject', [], None],
            ['host', ['all'], ['all'], '::', '0', 'reject', [], None],
        ]
        if selected != expected_shape:
            raise LocalPostgresError('local-postgresql-hba-rules-mismatch')

    def _origin(self, cluster_id: str, incarnation_id: str, postgres: Path,
                data_dir: Path, launch: dict[str, Any] | None,
                native: dict[str, Any]) -> dict[str, Any]:
        creation_receipt_digest = self._owner_payloads.get('creationReceiptDigest')
        if launch is None or type(creation_receipt_digest) is not str:
            raise LocalPostgresError('local-postgresql-launch-unverified')
        st = os.stat(data_dir, follow_symlinks=False)
        assert self._journal is not None
        initial_launch = next((event for event in self._journal.read()['events']
                               if event['kind'] == 'launch-confirmed'), None)
        if initial_launch is None:
            raise LocalPostgresError('local-postgresql-launch-unverified')
        process = initial_launch['payload']['process']
        return {
            'profile': _ORIGIN_PROFILE, 'supervisorId': self._supervisor_id,
            'clusterId': cluster_id, 'incarnationId': incarnation_id,
            'creationReceiptDigest': creation_receipt_digest,
            'nativeBinary': {'path': str(postgres), 'sha256': _sha_file(postgres),
                             'version': _VERSION},
            'dataDirectory': {'path': str(data_dir), 'device': str(st.st_dev),
                              'inode': str(st.st_ino), 'ownerUid': os.geteuid()},
            'initialPostmaster': {'pid': process['pid'], 'startToken': process['startToken'],
                                  'launchReceiptDigest': initial_launch['recordDigest']},
            'database': {'name': native['databaseName'], 'oid': native['databaseOid'],
                         'systemIdentifier': str(native['systemIdentifier'])},
            'endpoint': {'host': '127.0.0.1', 'port': self._profile.port},
        }

    def _endpoint_control(self) -> dict[str, str]:
        assert self._journal is not None
        intent = next(event['payload'] for event in self._journal.read()['events']
                      if event['kind'] == 'creation-intent')
        launch = next((event for event in reversed(self._journal.read()['events'])
                       if event['kind'] == 'launch-confirmed'), None)
        if launch is None or self._launch is None:
            raise LocalPostgresError('local-postgresql-launch-unverified')
        return {'controllerId': self._supervisor_id, 'profile': _ENDPOINT_PROFILE,
                'authorityReceiptDigest': _digest({'supervisorId': self._supervisor_id,
                    'port': self._profile.port, 'hbaDigest': intent['hbaDigest'],
                    'configDigest': intent['configDigest'],
                    'listen': '127.0.0.1', 'unixSocketDirectories': '',
                    'launchReceiptDigest': launch['recordDigest'],
                    'processStartToken': self._launch['process']['startToken'],
                    'nativeObservationDigest': launch['payload']['nativeObservationDigest'],
                    'endpointRuntimeDigest': self._launch[
                        'nativeAttestation'].endpoint_digest})}

    def _registration_observation(self, payload: dict[str, Any],
                                  native: dict[str, Any], process: dict[str, Any],
                                  sequence: int) -> dict[str, Any]:
        from .ingress_custody import _digest as custody_digest

        registration_digest = custody_digest({key: value for key, value in payload.items()
                                              if key != 'ownerApproval'})
        assert self._journal is not None
        chain = self._journal.read()
        current_launch = next((event for event in reversed(chain['events'])
                               if event['kind'] == 'launch-confirmed'), None)
        if current_launch is None:
            raise LocalPostgresError('local-postgresql-launch-unverified')
        return {
            'profile': 'umf.local-target-registration-observation/0.1',
            'registrationDigest': registration_digest,
            'originReceiptDigest': payload['origin']['creationReceiptDigest'],
            'currentLaunchReceiptDigest': current_launch['recordDigest'],
            'continuityChainDigest': chain['headDigest'],
            'endpointGateReceiptDigest': payload['endpointControl']['authorityReceiptDigest'],
            'nativeObservationDigest': custody_digest({'native': native, 'process': process}),
            'custodianSequence': sequence,
        }

    def _native_origin_matches(self, origin: dict[str, Any], attestation: object) -> bool:
        if type(attestation) is not _NativeAttestation or attestation.supervisor is not self:
            return False
        try:
            process = self._verify_live_process()
            native = self._observe_native(origin['database']['name'])
            members = self._verify_owned_process_group(process['pgid'])
            sockets = self._verify_endpoint_sockets(
                self._observer.sockets(process['pgid']), {item['pid'] for item in members})
            assert self._journal is not None
            events = self._journal.read()['events']
            launch_tokens = [event['payload']['process']['startToken'] for event in events
                             if event['kind'] == 'launch-confirmed']
            data = origin['dataDirectory']
            st = os.stat(data['path'], follow_symlinks=False)
            launch_events = [event for event in events if event['kind'] == 'launch-confirmed']
            current_launch = launch_events[-1]
            matching_launch_intents = [event['payload'] for event in events
                                       if event['kind'] == 'launch-intent'
                                       and event['payload'].get('launchId')
                                           == current_launch['payload'].get('launchId')]
            if len(matching_launch_intents) != 1:
                return False
            launch_intent = matching_launch_intents[0]
        except LocalPostgresError:
            return False
        except OSError:
            return False
        return (bool(launch_tokens) and process['startToken'] == launch_tokens[-1]
                and origin['initialPostmaster']['startToken'] in launch_tokens
                and native['databaseOid'] == origin['database']['oid']
                and str(native['systemIdentifier']) == origin['database']['systemIdentifier']
                and Path(native['dataDirectory']) == Path(data['path'])
                and str(st.st_dev) == data['device'] and str(st.st_ino) == data['inode']
                and st.st_uid == data['ownerUid']
                and hashlib.sha256(_read_private(Path(native['hbaFile']))).hexdigest()
                    == launch_intent['hbaDigest']
                and hashlib.sha256(_read_private(Path(native['configFile']))).hexdigest()
                    == launch_intent['configDigest']
                and launch_intent['launchId'] == current_launch['payload']['launchId']
                and self._launch is not None and sockets == self._launch['sockets'])

    def _stop_postmaster(self) -> None:
        if self._pg_process is None or self._launch is None or self._journal is None:
            raise LocalPostgresError('local-postgresql-process-not-owned')
        process = self._verify_live_process()
        launch_id = self._launch['launchId']
        self._journal.append('stop-intent', {'launchId': launch_id,
                                             'processStartToken': process['startToken']})
        self._verify_owned_process_group(process['pgid'])
        os.killpg(process['pgid'], signal.SIGINT)
        try:
            self._pg_process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            members = self._observer.group(process['pgid'])
            if not members or any(member['startToken'] != process['startToken']
                                  for member in members if member['pid'] == process['pid']):
                raise LocalPostgresError('local-postgresql-process-ownership-unknown')
            os.killpg(process['pgid'], signal.SIGKILL)
            try:
                self._pg_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                raise LocalPostgresError('local-postgresql-process-terminal-unknown') from None
        self._assert_group_absent(process['pgid'])
        self._journal.append('stop-confirmed', {'launchId': launch_id,
                         'processGroupAbsent': True,
                         'controlDataDigest': _digest({'systemIdentifier': self._launch['native']['systemIdentifier'],
                                                       'databaseOid': self._launch['native']['databaseOid']})})
        self._pg_process = None

    def restart_same_target(self) -> dict[str, Any]:
        """Controlled restart retaining the original PGDATA and custody chain."""
        if self._journal is None or self._launch is None or self._pg_process is None:
            raise LocalPostgresError('local-postgresql-process-not-owned')
        intent = next(event['payload'] for event in self._journal.read()['events']
                      if event['kind'] == 'creation-intent')
        control = self._target_paths['control']
        data = self._target_paths['data']
        postgres = _regular_owned(self._profile.postgres_binary, executable=True)
        config, hba, ident = (control / 'postgresql.conf', control / 'pg_hba.conf',
                              control / 'pg_ident.conf')
        expected_hba = _render_hba(intent['maintenanceName'])
        if hashlib.sha256(expected_hba).hexdigest() != intent['hbaDigest']:
            raise LocalPostgresError('local-postgresql-hba-profile-mismatch')
        _write_private(hba, expected_hba, exclusive=False)
        _fsync_directory(control)
        next_launch = int(self._launch['launchNumber']) + 1
        previous_native = self._observe_native(self._profile.database_name)
        self._stop_postmaster()
        self._launch_postmaster(postgres, data, config, hba, ident,
                                intent['configDigest'], intent['hbaDigest'],
                                launch_number=next_launch)
        native = self._observe_native(self._profile.database_name)
        if (native['systemIdentifier'] != previous_native['systemIdentifier']
                or native['databaseOid'] != previous_native['databaseOid']):
            raise LocalPostgresError('local-postgresql-restart-continuity-mismatch')
        assert self._journal is not None and self._launch is not None
        return {'profile': 'umf.local-postgresql-restart-observation/0.1',
                'launchReceiptDigest': self._journal.read()['events'][-1]['recordDigest'],
                'processStartToken': self._launch['process']['startToken'],
                'systemIdentifier': str(native['systemIdentifier']),
                'databaseOid': native['databaseOid']}

    def prepare_original_store_evidence(self, target_custody: object, *,
                                        store_profile: str =
                                        'umf.pg-generation-ingress-store/0.1'
                                        ) -> _VerifiedNativeStorePreparation:
        """Observe the original target for one exact, admitted scope-4 store profile."""
        if target_custody is not self._custody_handle:
            raise LocalPostgresError('local-postgresql-original-target-unverified')
        store = _store_descriptor(store_profile, self._provider_id)
        if (self._custodian is None or self._custody_handle is None
                or self._journal is None or self._launch is None):
            raise LocalPostgresError('local-postgresql-original-target-unavailable')
        from .ingress_custody import CustodyJournalError
        try:
            verified = self._custodian._resolve_target_custody(self._custody_handle)
            reference = self._custodian._public_reference(self._custody_handle)
        except (AttributeError, TypeError, CustodyJournalError):
            raise LocalPostgresError('local-postgresql-original-target-unverified') from None
        registration, authority = self._original_registration_and_principal_authority()
        intent = next(event['payload'] for event in self._journal.read()['events']
                      if event['kind'] == 'creation-intent')
        controller = intent['controllerName']
        native = self._observe_native(self._profile.database_name, current_role=controller)
        if not self._native_origin_matches(
                self._owner_payloads.get(registration['registrationId'], {}).get('origin', {}),
                self._launch.get('nativeAttestation')):
            raise LocalPostgresError('local-postgresql-original-target-continuity-unverified')
        evidence_payload, native_observation = self._native_store_preparation_payload(
            reference, verified, registration, authority, native)
        preparation_payload = {'profile': 'umf.owner-store-create-intent/0.1',
                               'store': store, 'evidence': evidence_payload}
        owner_request = self._owner_authority.prepare_request(
            'native-store-creation', _canonical(preparation_payload),
            context=self._authority_context)
        evidence = _VerifiedNativeStorePreparation(
            _VERIFIED_STORE_PREPARATION_SEAL, self._store_issuer, self,
            self._custodian, self._custody_handle, verified, owner_request,
            _canonical(preparation_payload),
            _canonical(native_observation))
        origin = self._owner_payloads.get(registration['registrationId'], {}).get('origin')
        if type(origin) is not dict:
            raise LocalPostgresError('local-postgresql-original-target-unverified')
        self._store_preparations[id(evidence)] = (
            evidence, evidence, _canonical(origin), _canonical(registration),
            _canonical(authority))
        return evidence

    def _original_registration_and_principal_authority(
            self) -> tuple[dict[str, Any], dict[str, Any]]:
        if self._journal is None:
            raise LocalPostgresError('local-postgresql-original-authority-incomplete')
        events = self._journal.read()['events']
        registration_event = next((event for event in events
                                   if event['kind'] == 'owner-registration-approved'), None)
        principal_intent = next((event for event in events
                                 if event['kind'] == 'native-effect-intent'
                                 and event['payload'].get('scope')
                                     == 'native-principal-preparation'), None)
        principal_outcome = next((event for event in events
                                  if event['kind'] == 'native-effect-confirmed'
                                  and principal_intent is not None
                                  and event['payload'].get('reservationId')
                                      == principal_intent['payload']['reservationId']), None)
        creation_receipt = self._owner_payloads.get('creationReceipt')
        if (registration_event is None or principal_intent is None
                or principal_outcome is None or type(creation_receipt) is not dict):
            raise LocalPostgresError('local-postgresql-original-authority-incomplete')
        registration = {
            'registrationId': registration_event['payload']['registrationId'],
            'payloadDigest': registration_event['payload']['payloadDigest'],
            'authorityId': self._owner_authority.authority_id,
            'approvalScope': 'local-target-registration',
            'approvalReceiptDigest': registration_event['payload']['approvalDigest'],
        }
        authority = {
            'installationId': self._bound_installation_id,
            'payloadDigest': principal_intent['payload']['payloadDigest'],
            'approvalIntentDigest': principal_intent['payload']['requestDigest'],
            'approvalId': principal_intent['payload']['approvalId'],
            'approvalDigest': principal_intent['payload']['approvalDigest'],
            'authorityId': self._owner_authority.authority_id,
            'approvalScope': 'native-principal-preparation',
            'approvalReceiptDigest': creation_receipt['principalPreparationReceiptDigest'],
        }
        return registration, authority

    def export_original_store_signing_request(
            self, evidence: object) -> dict[str, Any]:
        entry = self._store_preparations.get(id(evidence))
        if (type(evidence) is not _VerifiedNativeStorePreparation or entry is None
                or entry[0] is not evidence or entry[1] is not evidence
                or evidence.supervisor is not self):
            raise LocalPostgresError('local-postgresql-store-preparation-unverified')
        try:
            return self._owner_authority.export_signing_request(evidence.owner_request)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-owner-request-unavailable') from None

    def prepare_original_store_authority(
            self, request: object, signed_envelope: object
            ) -> tuple[_VerifiedNativeStorePreparation, object]:
        """Verify a signed final approval against the retained original evidence."""
        from .owner_authority import OwnerApprovalRequest, OwnerAuthorityError
        if type(request) is not OwnerApprovalRequest:
            raise LocalPostgresError('local-postgresql-owner-request-required')
        evidence = next((item[1] for item in self._store_preparations.values()
                         if item[1].owner_request is request), None)
        if evidence is None:
            raise LocalPostgresError('local-postgresql-owner-request-not-original')
        try:
            approval = self._owner_authority.verify_approval(request, signed_envelope)
            self._owner_authority._resolve_verified_approval(
                approval, original_request=request, scope='native-store-creation',
                intent_digest=request._intent_digest)
        except OwnerAuthorityError:
            raise LocalPostgresError('local-postgresql-final-approval-unverified') from None
        self._resolve_original_store_preparation(
            evidence, approval, custodian=self._custodian, target=self._custody_handle)
        return evidence, approval

    def _native_store_preparation_payload(self, reference: dict[str, Any], verified: object,
                                          registration: dict[str, Any], authority: dict[str, Any],
                                          native: dict[str, Any]
                                          ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Capture the closed, actually observed principal authority profile."""
        if self._journal is None:
            raise LocalPostgresError('local-postgresql-original-authority-incomplete')
        intent = next((event['payload'] for event in self._journal.read()['events']
                       if event['kind'] == 'creation-intent'), None)
        if type(intent) is not dict:
            raise LocalPostgresError('local-postgresql-original-authority-incomplete')
        controller = intent['controllerName']
        expected_role_names = (self._maintenance_name(), controller,
                               self._profile.business_owner)
        self._assert_store_session(native, expected_role_names[0], controller)
        try:
            with self._connect_maintenance(self._profile.database_name) as connection:
                connection.execute(f'SET ROLE {_quote_identifier(controller)}')
                rows = connection.execute(
                    "SELECT rolname,oid,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,"
                    "rolreplication,rolbypassrls,rolinherit FROM pg_catalog.pg_roles "
                    "WHERE rolname = ANY(%s) ORDER BY rolname", (list(expected_role_names),)
                ).fetchall()
                memberships = connection.execute(
                    "SELECT member.oid,granted.oid,m.admin_option,m.inherit_option,m.set_option "
                    "FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles member "
                    "ON member.oid=m.member JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid "
                    "WHERE member.rolname=%s ORDER BY granted.oid", (expected_role_names[0],)
                ).fetchall()
                membership_closure = connection.execute(
                    "WITH RECURSIVE reach(member,roleid,admin_option,inherit_option,set_option,path) AS ("
                    "SELECT m.member,m.roleid,m.admin_option,m.inherit_option,m.set_option,"
                    "ARRAY[m.member,m.roleid]::oid[] FROM pg_catalog.pg_auth_members m "
                    "WHERE m.member IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = ANY(%s)) "
                    "UNION ALL SELECT r.member,m.roleid,m.admin_option,m.inherit_option,m.set_option,"
                    "r.path||m.roleid FROM reach r JOIN pg_catalog.pg_auth_members m "
                    "ON m.member=r.roleid WHERE NOT m.roleid=ANY(r.path)) "
                    "SELECT member,roleid,admin_option,inherit_option,set_option FROM reach "
                    "ORDER BY member,roleid", (list(expected_role_names),)).fetchall()
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-authority-observation-failed') from None
        if (len(rows) != 3 or tuple(row[0] for row in rows) != tuple(sorted(expected_role_names))
                or any(type(row[1]) is not int or row[1] <= 0 for row in rows)):
            raise LocalPostgresError('local-postgresql-role-inventory-mismatch')
        expected_flags = {
            expected_role_names[0]: (True, True, False, False, False, False, False),
            expected_role_names[1]: (False, True, False, False, False, False, False),
            expected_role_names[2]: (False, False, False, False, False, False, False),
        }
        if any(tuple(row[2:]) != expected_flags[row[0]] for row in rows):
            raise LocalPostgresError('local-postgresql-role-flags-mismatch')
        role_rows = {row[0]: row for row in rows}
        def role(name: str) -> dict[str, Any]:
            row = role_rows[name]
            return {'oid': row[1], 'name': row[0],
                    'flags': {'canLogin': row[2], 'superuser': row[3],
                              'createDatabase': row[4], 'createRole': row[5],
                              'replication': row[6], 'bypassRls': row[7],
                              'inherit': row[8]}}
        maintenance_oid = role_rows[expected_role_names[0]][1]
        controller_oid = role_rows[expected_role_names[1]][1]
        owner_oid = role_rows[expected_role_names[2]][1]
        expected_memberships = [
            {'memberOid': maintenance_oid, 'roleOid': controller_oid,
             'inherit': False, 'set': True, 'admin': False},
            {'memberOid': maintenance_oid, 'roleOid': owner_oid,
             'inherit': False, 'set': True, 'admin': False},
        ]
        actual_memberships = _ordered_membership_payload(
            memberships, maintenance_oid, controller_oid, owner_oid)
        if actual_memberships != expected_memberships:
            raise LocalPostgresError('local-postgresql-membership-closure-mismatch')
        expected_closure = sorted([
            [maintenance_oid, controller_oid, False, False, True],
            [maintenance_oid, owner_oid, False, False, True],
        ])
        actual_closure = sorted([list(row) for row in membership_closure])
        if actual_closure != expected_closure:
            raise LocalPostgresError('local-postgresql-membership-closure-mismatch')
        settings = self._store_settings_from_observation(native)
        authority_observation = {
            'profile': 'umf.pg18.native-session-authority-observation/0.1',
            'authorityScopeDigest': authority['approvalIntentDigest'],
            'registrationDigest': registration['payloadDigest'],
            'targetCustodyDigest': _digest(reference),
            'nativeServerVersionNum': int(native['serverVersionNum']),
            'database': {'name': native['databaseName'], 'oid': native['databaseOid'],
                         'systemIdentifier': str(native['systemIdentifier'])},
            'sessionUser': native['sessionUser'], 'currentUser': native['currentUser'],
            'roleSetting': native['roleSetting'], 'settings': settings,
            'principalObservations': [role(name) for name in expected_role_names],
            'membershipObservations': [list(row) for row in membership_closure],
            'privilegeClosureDigest': _digest({
                'roleRows': [list(row) for row in rows],
                'allMemberships': [list(row) for row in membership_closure],
                'settingsDigest': native['settingsDigest']}),
        }
        evidence = {
            'profile': 'umf.pg18.original-store-authority-evidence/0.1',
            'supervisorId': self._supervisor_id,
            'custodianId': self._custodian_id,
            'providerId': self._provider_id,
            'installationId': self._installation_id(),
            'ownerAuthorityId': self._owner_authority.authority_id,
            'ownerPolicyRevision': self._owner_authority.policy_revision,
            'registrationDigest': registration['payloadDigest'],
            'targetCustodyDigest': _digest(reference),
            'authorityPreparationReceiptDigest': authority['approvalReceiptDigest'],
            'maintenance': role(expected_role_names[0]),
            'controller': role(expected_role_names[1]),
            'businessOwner': role(expected_role_names[2]),
            'requiredMemberships': expected_memberships,
            'requiredSettings': settings,
            'nativeAuthorityObservationDigest': _digest(authority_observation),
        }
        return evidence, authority_observation

    @classmethod
    def _store_settings_from_observation(cls, native: dict[str, Any]) -> dict[str, str]:
        if type(native) is not dict:
            raise LocalPostgresError('local-postgresql-store-settings-mismatch')
        return cls._store_required_settings({
            'searchPath': native.get('searchPath'),
            'timeZone': native.get('timeZone'),
            'rowSecurity': native.get('rowSecurity'),
            'sessionReplicationRole': native.get('sessionReplicationRole'),
            'transactionReadOnly': native.get('transactionReadOnly'),
            'transactionIsolation': native.get('transactionIsolation'),
        })

    @staticmethod
    def _assert_store_session(native: dict[str, Any], maintenance: str,
                              controller: str) -> None:
        if (type(native) is not dict
                or native.get('sessionUser') != maintenance
                or native.get('currentUser') != controller
                or native.get('roleSetting') != controller):
            raise LocalPostgresError('local-postgresql-store-session-authority-mismatch')

    @staticmethod
    def _store_required_settings(native: dict[str, Any]) -> dict[str, str]:
        settings = {
            'searchPath': 'pg_catalog', 'timeZone': 'UTC', 'rowSecurity': 'on',
            'sessionReplicationRole': 'origin', 'transactionReadOnly': 'off',
            'transactionIsolation': 'read committed',
        }
        if type(native) is not dict or set(native) != {
                'searchPath', 'timeZone', 'rowSecurity', 'sessionReplicationRole',
                'transactionReadOnly', 'transactionIsolation'}:
            raise LocalPostgresError('local-postgresql-store-settings-mismatch')
        actual = {
            'searchPath': native.get('searchPath'), 'timeZone': native.get('timeZone'),
            'rowSecurity': native.get('rowSecurity'),
            'sessionReplicationRole': native.get('sessionReplicationRole'),
            'transactionReadOnly': native.get('transactionReadOnly'),
            'transactionIsolation': native.get('transactionIsolation'),
        }
        if actual != settings:
            raise LocalPostgresError('local-postgresql-store-settings-mismatch')
        return settings

    def _resolve_original_store_preparation(self, evidence: object, approval: object, *,
                                            custodian: object, target: object):
        from .ingress_custody import CustodyJournalError
        from .owner_authority import OwnerAuthorityError, VerifiedOwnerApproval
        if (type(evidence) is not _VerifiedNativeStorePreparation
                or evidence._issuer is not self._store_issuer
                or evidence.supervisor is not self
                or evidence.custodian is not custodian
                or evidence.target_handle is not target):
            raise LocalPostgresError('local-postgresql-store-preparation-unverified')
        entry = self._store_preparations.get(id(evidence))
        if (entry is None or entry[0] is not evidence or entry[1] is not evidence):
            raise LocalPostgresError('local-postgresql-store-preparation-unverified')
        if type(approval) is not VerifiedOwnerApproval:
            raise LocalPostgresError('local-postgresql-final-approval-unverified')
        try:
            self._owner_authority._resolve_verified_approval(
                approval, original_request=evidence.owner_request,
                scope='native-store-creation',
                intent_digest=evidence.owner_request._intent_digest)
        except OwnerAuthorityError:
            raise LocalPostgresError('local-postgresql-final-approval-unverified') from None
        try:
            verified = custodian._resolve_target_custody(target)
            if verified is not evidence.verified_target:
                raise LocalPostgresError('local-postgresql-store-preparation-target-mismatch')
        except (AttributeError, TypeError, CustodyJournalError):
            raise LocalPostgresError('local-postgresql-store-preparation-target-mismatch') from None
        if self._journal is None or self._launch is None:
            raise LocalPostgresError('local-postgresql-store-preparation-unverified')
        intent = next((event['payload'] for event in self._journal.read()['events']
                       if event['kind'] == 'creation-intent'), None)
        if intent is None:
            raise LocalPostgresError('local-postgresql-store-preparation-unverified')
        registration, authority = self._original_registration_and_principal_authority()
        registration_event = _owner_registration_approval_payload(
            self._journal.read()['events'])
        intent_payload = json.loads(evidence._payload_bytes)
        if (type(intent_payload) is not dict
                or set(intent_payload) != {'profile', 'store', 'evidence'}
                or intent_payload['profile'] != 'umf.owner-store-create-intent/0.1'):
            raise LocalPostgresError('local-postgresql-store-preparation-unverified')
        payload = intent_payload['evidence']
        requested_store = intent_payload['store']
        if (type(requested_store) is not dict
                or requested_store != _store_descriptor(
                    requested_store.get('profile'), self._provider_id)):
            raise LocalPostgresError('local-postgresql-store-preparation-unverified')
        controller = intent['controllerName']
        native = self._observe_native(self._profile.database_name, current_role=controller)
        attestation = self._launch.get('nativeAttestation')
        origin = self._owner_payloads.get(registration['registrationId'], {}).get('origin', {})
        if (_canonical(registration) != entry[3]
                or _canonical(authority) != entry[4]
                or _canonical(origin) != entry[2]
                or registration_event['payloadDigest'] != registration['payloadDigest']):
            raise LocalPostgresError('local-postgresql-store-preparation-stale')
        fresh_payload, fresh_observation = self._native_store_preparation_payload(
            self._custodian._public_reference(target), verified, registration,
            authority, native)
        if (not self._native_origin_matches(origin, attestation)
                or payload.get('providerId') != self._provider_id
                or payload.get('installationId') != intent['installationId']
                or approval.intent_digest != evidence.owner_request._intent_digest
                or approval.scope != 'native-store-creation'
                or _canonical(payload) != _canonical(fresh_payload)
                or evidence.native_observation_bytes != _canonical(fresh_observation)):
            raise LocalPostgresError('local-postgresql-store-preparation-stale')
        return {'profile': payload['profile'], 'payload': payload,
                'store': dict(requested_store),
                'verifiedTarget': verified, 'approval': approval,
                'nativeObservation': json.loads(evidence.native_observation_bytes)}

    def stop(self) -> None:
        """Stop only this adapter's verified server process group."""
        if self._pg_process is not None:
            self._stop_postmaster()

    @property
    def custodian(self):
        return self._custodian

    @property
    def custody_handle(self):
        return self._custody_handle

    @property
    def _resolver(self):
        return self.__resolver

    @_resolver.setter
    def _resolver(self, value):
        self.__resolver = value


@dataclass(frozen=True, slots=True)
class _NativeAttestation:
    supervisor: LocalPostgresSupervisor
    process: dict[str, Any]
    native: dict[str, Any]
    endpoint_digest: str


def _owner_capability_seal() -> object:
    from .generation_ingress import _CAPABILITY_SEAL

    return _CAPABILITY_SEAL

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Original local-host bootstrap authority and immutable owner context."""
from __future__ import annotations

import base64
import fcntl
import hashlib
import json
import os
import re
import stat
import sys
import threading
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..canonical import canonical_json
from .owner_wire import OwnerWireError, validate_owner_configuration

_MAX_SAFE = 9_007_199_254_740_991
_MAX_JOURNAL = 8 * 1024 * 1024
_HEX = re.compile(r'^[a-f0-9]{64}$')
_ROLE = re.compile(r'^[a-z][a-z0-9_]{0,62}$')
_BOOTSTRAP_ISSUER_SEAL = object()
_BOOTSTRAP_ISSUERS: dict[int, object] = {}
_CONTEXT_SEAL = object()
_CONTEXTS: dict[int, object] = {}
_OWNER_PURPOSES = ('production', 'native-acceptance')
_OWNER_CONTEXT_PROFILE = 'umf.local-owner-bootstrap-context/0.3'
_OWNER_SETUP_LOCK = 'owner-bootstrap-setup.lock'
_OWNER_LEDGER_PROFILE = 'umf.configured-owner-approval-ledger/0.1'
_OWNER_SETUP_LOCKS: dict[str, threading.RLock] = {}
_OWNER_SETUP_LOCKS_GUARD = threading.Lock()
_NATIVE_PROFILE_KEYS = {
    'controlHome', 'dataHome', 'postgresBinary', 'initdbBinary',
    'processObserver', 'processObserverSha256', 'port', 'databaseName',
    'businessOwner', 'custodianId', 'supervisorId', 'providerId',
    'installationId', 'purpose',
}

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


def _no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise LocalPostgresError('supervisor-journal-corrupt')
        result[key] = value
    return result


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
        # The public identifier is stable across a process restart for the
        # exact enrolled bytes. The issuer object itself remains process-local
        # and registry-bound, so this identifier is not a capability.
        self._issuer_id = str(uuid.uuid5(
            uuid.NAMESPACE_URL,
            'umf.local-owner-bootstrap-issuer/0.1:' + enrollment_digest))
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
    if len(raw) > 2 * 1024 * 1024:
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
    try:
        record = json.loads(raw, object_pairs_hook=_no_duplicates)
    except (json.JSONDecodeError, UnicodeDecodeError, LocalPostgresError):
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid') from None
    if _canonical(record) != raw:
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-noncanonical')
    profile = record.get('profile') if type(record) is dict else None
    expected_keys = {'profile', 'enrollmentId', 'purpose', 'context',
                     'ownerConfiguration', 'nativeProfile'}
    if profile == 'umf.local-owner-bootstrap-enrollment/0.2':
        expected_keys.add('generationAuthorityRoots')
    if (type(record) is not dict or set(record) != expected_keys
            or profile not in ('umf.local-owner-bootstrap-enrollment/0.1',
                               'umf.local-owner-bootstrap-enrollment/0.2')
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
    if profile == 'umf.local-owner-bootstrap-enrollment/0.2':
        _validate_generation_roots(record['generationAuthorityRoots'])
    return record, raw


def _validate_generation_roots(value: object) -> None:
    if (type(value) is not dict or set(value) != {
            'profile', 'authorityId', 'policyRevision', 'keys'}
            or value['profile'] != 'umf.generation-authority-root-policy/0.1'):
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
    _uuid(value['authorityId'])
    revision = value['policyRevision']
    if (type(revision) is not str or not revision or '\x00' in revision
            or len(revision.encode('utf-8')) > 128):
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
    keys = value['keys']
    if type(keys) is not list or not 1 <= len(keys) <= 32:
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
    seen: set[str] = set()
    for item in keys:
        if (type(item) is not dict or set(item) != {
                'keyId', 'publicKey', 'principalId', 'logicalAuthorityIds',
                'configurationProfiles'}):
            raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
        for name in ('keyId', 'principalId'):
            text = item[name]
            if (type(text) is not str or not text or '\x00' in text
                    or len(text.encode('utf-8')) > 128):
                raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
        if item['keyId'] in seen:
            raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
        seen.add(item['keyId'])
        encoded = item['publicKey']
        if type(encoded) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{43}', encoded):
            raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
        try:
            key = base64.urlsafe_b64decode(encoded + '=')
        except (ValueError, base64.binascii.Error):
            raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid') from None
        if len(key) != 32 or base64.urlsafe_b64encode(key).decode('ascii').rstrip('=') != encoded:
            raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
        ids = item['logicalAuthorityIds']
        if type(ids) is not list or not 1 <= len(ids) <= 256:
            raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
        normalized = [_uuid(identity) for identity in ids]
        if len(set(normalized)) != len(normalized):
            raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')
        profiles = item['configurationProfiles']
        if (type(profiles) is not list or not profiles
                or len(set(profiles)) != len(profiles)
                or any(profile != 'umf.configured-generation-enrollment-authority/0.1'
                       for profile in profiles)):
            raise LocalPostgresError('local-postgresql-bootstrap-enrollment-invalid')


def _verify_bootstrap_enrollment(path: Path, expected_digest: str) -> None:
    _record, raw = _read_bootstrap_enrollment(path)
    if hashlib.sha256(raw).hexdigest() != expected_digest:
        raise LocalPostgresError('local-postgresql-bootstrap-enrollment-changed')


def _validate_bootstrap_context_journal(control_home: Path, record: dict[str, Any],
                                        raw: bytes, configuration_digest: str) -> bytes:
    path = control_home / 'owner-bootstrap-context.json'
    try:
        current = _read_private(path)
    except LocalPostgresError:
        raise LocalPostgresError('local-postgresql-bootstrap-context-unavailable') from None
    value = _parse_owner_setup(current, record, raw, configuration_digest, control_home)
    if value['state'] != 'confirmed':
        raise LocalPostgresError('local-postgresql-bootstrap-context-unconfirmed')
    if current != _canonical(value):
        raise LocalPostgresError('local-postgresql-bootstrap-context-mismatch')
    return current


def _parse_owner_setup(raw: bytes, enrollment: dict[str, Any], enrollment_raw: bytes,
                       configuration_digest: str, control_home: Path) -> dict[str, Any]:
    try:
        value = json.loads(raw, object_pairs_hook=_no_duplicates)
    except (json.JSONDecodeError, UnicodeDecodeError, LocalPostgresError):
        raise LocalPostgresError('local-postgresql-bootstrap-context-invalid') from None
    keys = {'profile', 'enrollmentId', 'enrollmentRecordDigest',
            'authorityConfigurationDigest', 'purpose', 'context', 'setupId',
            'state', 'ownerLedger', 'generationAuthority'}
    if (type(value) is not dict or set(value) != keys or _canonical(value) != raw
            or value['profile'] != _OWNER_CONTEXT_PROFILE
            or value['enrollmentId'] != enrollment['enrollmentId']
            or value['enrollmentRecordDigest'] != hashlib.sha256(enrollment_raw).hexdigest()
            or value['authorityConfigurationDigest'] != configuration_digest
            or value['purpose'] != enrollment['purpose']
            or value['context'] != enrollment['context']
            or value['state'] not in ('pending', 'confirmed')):
        raise LocalPostgresError('local-postgresql-bootstrap-context-mismatch')
    _uuid(value['setupId'])
    owner = value['ownerLedger']
    if (type(owner) is not dict or set(owner) != {
            'ledgerId', 'ledgerPath', 'lockPath', 'initialHeaderDigest'}):
        raise LocalPostgresError('owner-approval-ledger-binding-invalid')
    _uuid(owner['ledgerId'])
    ledger_path = _canonical_private_path(owner['ledgerPath'])
    lock_path = _canonical_private_path(owner['lockPath'])
    if lock_path != ledger_path.with_name(ledger_path.name + '.lock'):
        raise LocalPostgresError('owner-approval-ledger-binding-invalid')
    configuration = enrollment['ownerConfiguration']
    header_body = {'profile': _OWNER_LEDGER_PROFILE,
                   'authorityId': configuration['authorityId'],
                   'configurationDigest': configuration_digest}
    header = {**header_body, 'digest': hashlib.sha256(_canonical(header_body)).hexdigest()}
    expected_header = _canonical(header) + b'\n'
    if owner['initialHeaderDigest'] != hashlib.sha256(expected_header).hexdigest():
        raise LocalPostgresError('owner-approval-ledger-binding-invalid')
    if any(type(owner[key]) is not str or not _HEX.fullmatch(owner[key])
           for key in ('initialHeaderDigest',)):
        raise LocalPostgresError('owner-approval-ledger-binding-invalid')
    generation = value['generationAuthority']
    if enrollment['profile'] == 'umf.local-owner-bootstrap-enrollment/0.1':
        if generation is not None:
            raise LocalPostgresError('local-postgresql-bootstrap-context-mismatch')
    else:
        if (type(generation) is not dict or set(generation) != {
                'rootPolicyDigest', 'registryBirth'}):
            raise LocalPostgresError('local-postgresql-bootstrap-context-mismatch')
        roots = enrollment.get('generationAuthorityRoots')
        roots_bytes = _canonical(roots)
        if generation['rootPolicyDigest'] != hashlib.sha256(roots_bytes).hexdigest():
            raise LocalPostgresError('local-postgresql-bootstrap-context-mismatch')
        birth = generation['registryBirth']
        if (type(birth) is not dict or set(birth) != {
                'registryId', 'anchorDigest', 'registryPath', 'lockPath',
                'initialRegistryDigest'}):
            raise LocalPostgresError('local-postgresql-bootstrap-context-mismatch')
        _uuid(birth['registryId'])
        for field in ('anchorDigest', 'initialRegistryDigest'):
            if type(birth[field]) is not str or not _HEX.fullmatch(birth[field]):
                raise LocalPostgresError('local-postgresql-bootstrap-context-mismatch')
        registry_path = control_home / 'generation-authority-registry.json'
        registry_lock = registry_path.with_name(registry_path.name + '.lock')
        anchor = {
            'enrollmentRecordDigest': hashlib.sha256(enrollment_raw).hexdigest(),
            'authorityConfigurationDigest': configuration_digest,
            'generationRootPolicyDigest': generation['rootPolicyDigest'],
            'purpose': enrollment['purpose'], 'context': enrollment['context'],
        }
        if (birth['registryPath'] != str(registry_path)
                or birth['lockPath'] != str(registry_lock)
                or birth['initialRegistryDigest'] != hashlib.sha256(
                    _initial_generation_registry(birth['registryId'],
                                                 birth['anchorDigest'])).hexdigest()
                or birth['anchorDigest'] != hashlib.sha256(_canonical(anchor)).hexdigest()):
            raise LocalPostgresError('local-postgresql-bootstrap-context-mismatch')
    reserved = {
        control_home / 'owner-bootstrap-enrollment.json',
        control_home / 'owner-bootstrap-context.json',
        control_home / _OWNER_SETUP_LOCK,
        control_home / 'generation-authority-registry.json',
        control_home / 'generation-authority-registry.json.lock',
    }
    if ledger_path in reserved or lock_path in reserved:
        raise LocalPostgresError('owner-approval-ledger-path-invalid')
    return value


def _canonical_private_path(value: object) -> Path:
    if type(value) is not str or '\x00' in value or len(value.encode('utf-8')) > 4096:
        raise LocalPostgresError('owner-approval-ledger-path-invalid')
    path = Path(value)
    if not path.is_absolute() or os.path.normpath(value) != value:
        raise LocalPostgresError('owner-approval-ledger-path-invalid')
    try:
        if path.parent.resolve(strict=True) != path.parent or path.parent.is_symlink():
            raise LocalPostgresError('owner-approval-ledger-path-invalid')
    except OSError:
        raise LocalPostgresError('owner-approval-ledger-path-invalid') from None
    return path


@contextmanager
def _owner_setup_lease(control_home: Path):
    path = control_home / _OWNER_SETUP_LOCK
    with _OWNER_SETUP_LOCKS_GUARD:
        local = _OWNER_SETUP_LOCKS.setdefault(str(path), threading.RLock())
    with local:
        fd = -1
        locked = False
        try:
            fd = os.open(path, os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0))
            st = os.fstat(fd)
            if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                    or st.st_nlink != 1 or stat.S_IMODE(st.st_mode) != 0o600
                    or os.read(fd, 1)):
                raise LocalPostgresError('owner-bootstrap-setup-lock-invalid')
            fcntl.flock(fd, fcntl.LOCK_EX)
            locked = True
        except OSError:
            if fd >= 0:
                try:
                    os.close(fd)
                finally:
                    fd = -1
            raise LocalPostgresError('owner-bootstrap-setup-lock-unavailable') from None
        except BaseException:
            if fd >= 0:
                try:
                    os.close(fd)
                finally:
                    fd = -1
            raise
        try:
            yield
        except BaseException:
            if fd >= 0:
                try:
                    if locked:
                        try:
                            fcntl.flock(fd, fcntl.LOCK_UN)
                        except OSError:
                            pass
                finally:
                    os.close(fd)
                    fd = -1
            raise
        else:
            if fd >= 0:
                try:
                    if locked:
                        fcntl.flock(fd, fcntl.LOCK_UN)
                finally:
                    os.close(fd)
                    fd = -1
        finally:
            if fd >= 0:
                os.close(fd)


@contextmanager
def _owner_resource_lease(path: Path, error_code: str):
    fd = -1
    locked = False
    try:
        fd = os.open(path, os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0))
        st = os.fstat(fd)
        if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                or st.st_nlink != 1 or stat.S_IMODE(st.st_mode) != 0o600):
            raise LocalPostgresError(error_code)
        fcntl.flock(fd, fcntl.LOCK_EX)
        locked = True
    except OSError:
        if fd >= 0:
            try:
                os.close(fd)
            finally:
                fd = -1
        raise LocalPostgresError(error_code) from None
    except BaseException:
        if fd >= 0:
            try:
                os.close(fd)
            finally:
                fd = -1
        raise
    try:
        yield
    except BaseException:
        if fd >= 0:
            try:
                if locked:
                    try:
                        fcntl.flock(fd, fcntl.LOCK_UN)
                    except OSError:
                        pass
            finally:
                os.close(fd)
                fd = -1
        raise
    else:
        if fd >= 0:
            try:
                if locked:
                    fcntl.flock(fd, fcntl.LOCK_UN)
            finally:
                os.close(fd)
                fd = -1
    finally:
        if fd >= 0:
            os.close(fd)


def _atomic_replace_private(path: Path, data: bytes) -> None:
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    fd = -1
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                     | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        os.fchmod(fd, 0o600)
        view = memoryview(data)
        while view:
            written = os.write(fd, view)
            if written <= 0:
                raise OSError('short setup-state write')
            view = view[written:]
        os.fsync(fd)
        os.close(fd); fd = -1
        os.replace(temporary, path)
        _fsync_directory(path.parent)
    except OSError:
        raise LocalPostgresError('owner-bootstrap-context-confirmation-failed') from None
    finally:
        if fd >= 0:
            os.close(fd)
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def _owner_header_bytes(enrollment: dict[str, Any], configuration_digest: str) -> bytes:
    body = {'profile': _OWNER_LEDGER_PROFILE,
            'authorityId': enrollment['ownerConfiguration']['authorityId'],
            'configurationDigest': configuration_digest}
    return _canonical({**body, 'digest': hashlib.sha256(_canonical(body)).hexdigest()}) + b'\n'


def _initial_generation_registry(registry_id: str, anchor_digest: str) -> bytes:
    from .generation_authority_bootstrap import initial_registry_bytes
    return initial_registry_bytes(registry_id, anchor_digest)


def _create_initial_registry(path: Path, registry_id: str, anchor_digest: str) -> None:
    expected = _initial_generation_registry(registry_id, anchor_digest)
    try:
        current = _read_private(path)
    except LocalPostgresError as exc:
        if exc.code != 'supervisor-private-file-unavailable':
            raise
        _write_private(path, expected)
        return
    if current != expected:
        raise LocalPostgresError('generation-authority-registry-birth-incomplete')


def _check_private_parent(path: Path) -> None:
    try:
        st = path.parent.lstat()
    except OSError:
        raise LocalPostgresError('owner-approval-ledger-path-invalid') from None
    if (not stat.S_ISDIR(st.st_mode) or stat.S_ISLNK(st.st_mode)
            or st.st_uid != os.geteuid() or st.st_mode & 0o077
            or path.parent.resolve(strict=True) != path.parent):
        raise LocalPostgresError('owner-approval-ledger-path-invalid')


def _create_empty_private(path: Path) -> None:
    fd = -1
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                     | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        os.fchmod(fd, 0o600)
        os.fsync(fd)
        os.close(fd); fd = -1
        _fsync_directory(path.parent)
    except FileExistsError:
        return
    except OSError:
        raise LocalPostgresError('owner-bootstrap-resource-create-failed') from None
    finally:
        if fd >= 0:
            os.close(fd)


def _ensure_pending_owner_resources(setup: dict[str, Any], enrollment: dict[str, Any],
                                    configuration_digest: str, control_home: Path) -> None:
    owner = setup['ownerLedger']
    ledger = Path(owner['ledgerPath'])
    lock = Path(owner['lockPath'])
    _check_private_parent(ledger)
    forbidden = {
        control_home / 'owner-bootstrap-enrollment.json',
        control_home / 'owner-bootstrap-context.json',
        control_home / _OWNER_SETUP_LOCK,
        control_home / 'generation-authority-registry.json',
        control_home / 'generation-authority-registry.json.lock',
    }
    if ledger in forbidden or lock in forbidden or ledger == lock:
        raise LocalPostgresError('owner-approval-ledger-path-invalid')
    expected = _owner_header_bytes(enrollment, configuration_digest)
    # The setup lease excludes all ordinary sessions. A pending initial header
    # is the only prefix that may be completed; it cannot contain a request.
    _create_empty_private(lock)
    with _owner_resource_lease(lock, 'owner-approval-ledger-lock-invalid'):
        try:
            lock_bytes = _read_private(lock)
            if lock_bytes != b'':
                raise LocalPostgresError('owner-approval-ledger-lock-invalid')
        except LocalPostgresError:
            raise LocalPostgresError('owner-approval-ledger-lock-invalid') from None
        try:
            current = _read_private(ledger)
        except LocalPostgresError as exc:
            if exc.code != 'supervisor-private-file-unavailable':
                raise
            _write_private(ledger, expected)
            current = expected
        if not expected.startswith(current):
            raise LocalPostgresError('owner-approval-ledger-birth-incomplete')
        if current != expected:
            fd = -1
            try:
                fd = os.open(ledger, os.O_WRONLY | os.O_APPEND | getattr(os, 'O_NOFOLLOW', 0))
                st = os.fstat(fd)
                if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                        or st.st_nlink != 1 or stat.S_IMODE(st.st_mode) != 0o600):
                    raise OSError('unsafe pending owner ledger')
                remaining = memoryview(expected[len(current):])
                while remaining:
                    written = os.write(fd, remaining)
                    if written <= 0:
                        raise OSError('short owner ledger prefix write')
                    remaining = remaining[written:]
                os.fsync(fd)
            except OSError:
                raise LocalPostgresError('owner-approval-ledger-birth-incomplete') from None
            finally:
                if fd >= 0:
                    os.close(fd)
            _fsync_directory(ledger.parent)
    if hashlib.sha256(expected).hexdigest() != owner['initialHeaderDigest']:
        raise LocalPostgresError('owner-approval-ledger-binding-invalid')
    generation = setup['generationAuthority']
    if generation is not None:
        birth = generation['registryBirth']
        registry = Path(birth['registryPath']); registry_lock = Path(birth['lockPath'])
        _create_empty_private(registry_lock)
        with _owner_resource_lease(registry_lock,
                                   'generation-authority-registry-birth-incomplete'):
            _create_initial_registry(registry, birth['registryId'], birth['anchorDigest'])
            if (_read_private(registry_lock) != b''
                    or hashlib.sha256(_initial_generation_registry(
                        birth['registryId'], birth['anchorDigest'])).hexdigest()
                    != birth['initialRegistryDigest']
                    or _read_private(registry) != _initial_generation_registry(
                        birth['registryId'], birth['anchorDigest'])):
                raise LocalPostgresError('generation-authority-registry-birth-incomplete')


def _settle_original_owner_setup(profile: LocalPostgresProfile,
                                 requested_ledger_path: object) -> bytes:
    """Settle only the preinstalled original0.3 owner setup before issuing objects."""
    if type(profile) is not LocalPostgresProfile:
        raise LocalPostgresError('local-postgresql-profile-invalid')
    record_path = profile.control_home / 'owner-bootstrap-enrollment.json'
    enrollment, enrollment_raw = _read_bootstrap_enrollment(record_path)
    if (enrollment['nativeProfile'] != _profile_to_enrollment(profile)
            or enrollment['purpose'] != profile.purpose
            or enrollment['context']['custodianId'] != profile.custodian_id
            or enrollment['context']['supervisorId'] != profile.supervisor_id
            or enrollment['context']['providerId'] != profile.provider_id
            or enrollment['context']['installationId'] != profile.installation_id):
        raise LocalPostgresError('local-postgresql-owner-context-mismatch')
    try:
        config, _keys = validate_owner_configuration(enrollment['ownerConfiguration'])
    except OwnerWireError:
        raise LocalPostgresError('local-postgresql-owner-configuration-invalid') from None
    config_digest = hashlib.sha256(canonical_json(config).encode('utf-8')).hexdigest()
    context_path = profile.control_home / 'owner-bootstrap-context.json'
    try:
        pending_raw = _read_private(context_path)
    except LocalPostgresError:
        raise LocalPostgresError('local-postgresql-bootstrap-context-unavailable') from None
    setup = _parse_owner_setup(pending_raw, enrollment, enrollment_raw,
                               config_digest, profile.control_home)
    path = _canonical_private_path(setup['ownerLedger']['ledgerPath'])
    if (type(requested_ledger_path) is not str and not isinstance(requested_ledger_path, Path)
            or Path(requested_ledger_path) != path):
        raise LocalPostgresError('owner-approval-ledger-path-mismatch')
    with _owner_setup_lease(profile.control_home):
        # Re-read the immutable primary after acquiring the setup lease.
        current_raw = _read_private(context_path)
        current = _parse_owner_setup(current_raw, enrollment, enrollment_raw,
                                     config_digest, profile.control_home)
        if ({**current, 'state': ''} != {**setup, 'state': ''}
                or (setup['state'] != current['state']
                    and (setup['state'], current['state']) != ('pending', 'confirmed'))):
            raise LocalPostgresError('local-postgresql-bootstrap-context-changed')
        _check_private_parent(path)
        if current['state'] == 'pending':
            _ensure_pending_owner_resources(current, enrollment, config_digest,
                                            profile.control_home)
            confirmed = dict(current); confirmed['state'] = 'confirmed'
            _atomic_replace_private(context_path, _canonical(confirmed))
            current = confirmed
        else:
            _verify_primary_owner_resources(current, enrollment, config_digest)
        reread = _read_private(context_path)
        verified = _parse_owner_setup(reread, enrollment, enrollment_raw,
                                      config_digest, profile.control_home)
        if verified != current or verified['state'] != 'confirmed':
            raise LocalPostgresError('local-postgresql-bootstrap-context-unverified')
        _verify_primary_owner_resources(verified, enrollment, config_digest)
        return reread


def _verify_primary_owner_resources(setup: dict[str, Any], enrollment: dict[str, Any],
                                    configuration_digest: str) -> None:
    owner = setup['ownerLedger']; ledger = Path(owner['ledgerPath'])
    lock = Path(owner['lockPath']); _check_private_parent(ledger)
    try:
        ledger_bytes = _read_private(ledger); lock_bytes = _read_private(lock)
    except LocalPostgresError:
        raise LocalPostgresError('owner-approval-ledger-birth-incomplete') from None
    expected = _owner_header_bytes(enrollment, configuration_digest)
    if not ledger_bytes.startswith(expected) or lock_bytes != b'':
        raise LocalPostgresError('owner-approval-ledger-birth-incomplete')
    if setup['generationAuthority'] is not None:
        birth = setup['generationAuthority']['registryBirth']
        try:
            raw = _read_private(Path(birth['registryPath']))
            _read_private(Path(birth['lockPath']))
        except LocalPostgresError:
            raise LocalPostgresError('generation-authority-registry-birth-incomplete') from None
        expected_initial = _initial_generation_registry(birth['registryId'], birth['anchorDigest'])
        if hashlib.sha256(expected_initial).hexdigest() != birth['initialRegistryDigest']:
            raise LocalPostgresError('generation-authority-registry-birth-incomplete')
        try:
            from .generation_authority_bootstrap import (
                GenerationAuthorityBootstrapError,
                validate_registry,
            )
            registry = validate_registry(
                raw, registry_id=birth['registryId'],
                anchor_digest=birth['anchorDigest'],
                root_policy=enrollment['generationAuthorityRoots'],
                purpose=enrollment['purpose'],
                bootstrap_enrollment_id=enrollment['enrollmentId'])
            _verify_generation_registry_physical_binding(
                registry, setup, enrollment, configuration_digest,
                Path(birth['registryPath']).parent / 'owner-bootstrap-context.json')
        except GenerationAuthorityBootstrapError:
            raise LocalPostgresError('generation-authority-registry-birth-incomplete') from None


def _verify_generation_registry_physical_binding(
        registry: dict[str, Any], setup: dict[str, Any], enrollment: dict[str, Any],
        configuration_digest: str, physical_path: Path) -> None:
    """Bind every signed root request to the exact original .3 context bytes."""
    try:
        physical_raw = _read_private(physical_path)
        if physical_raw != _canonical(setup):
            raise LocalPostgresError('generation-authority-registry-birth-incomplete')
        original_enrollment, original_enrollment_raw = _read_bootstrap_enrollment(
            physical_path.parent / 'owner-bootstrap-enrollment.json')
        if (_canonical(original_enrollment) != _canonical(enrollment)
                or original_enrollment_raw != _canonical(enrollment)):
            raise LocalPostgresError('generation-authority-registry-birth-incomplete')
        physical_setup = _parse_owner_setup(
            physical_raw, original_enrollment, original_enrollment_raw,
            configuration_digest, physical_path.parent)
        if physical_setup != setup:
            raise LocalPostgresError('generation-authority-registry-birth-incomplete')
        context = enrollment['context']
        physical_digest = hashlib.sha256(physical_raw).hexdigest()
        context_fields = ('supervisorId', 'custodianId', 'providerId', 'installationId')
        expected = {field: context[field] for field in context_fields}
        for request in registry['requests']:
            trust = request['intent']['trust']
            configuration = request['intent']['configuration']
            payload = request['payload']
            for projection in (trust, configuration, payload):
                if any(type(projection.get(field)) is not str
                       or projection[field] != expected[field]
                       for field in context_fields):
                    raise LocalPostgresError(
                        'generation-authority-registry-birth-incomplete')
            if (type(trust.get('ownerBootstrapContextDigest')) is not str
                    or trust['ownerBootstrapContextDigest'] != physical_digest):
                raise LocalPostgresError('generation-authority-registry-birth-incomplete')
    except (KeyError, TypeError, ValueError, OSError):
        raise LocalPostgresError('generation-authority-registry-birth-incomplete') from None


def sys_platform_darwin() -> bool:

    return sys.platform == 'darwin'


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
        if purpose not in _OWNER_PURPOSES:
            _context_reject('owner-authority-context-invalid')
        object.__setattr__(self, '_issuer', issuer)
        object.__setattr__(self, '_issuer_registry', issuer)
        object.__setattr__(self, '_kind', 'umf.owner-authority-context/0.1')
        object.__setattr__(self, '_purpose', purpose)
        object.__setattr__(self, '_custodian_id', _context_uuid(custodian_id))
        object.__setattr__(self, '_supervisor_id', _context_uuid(supervisor_id))
        object.__setattr__(self, '_provider_id', _context_uuid(provider_id))
        object.__setattr__(self, '_installation_id', _context_text(installation_id))
        object.__setattr__(self, '_configuration_digest', _context_digest(configuration_digest))

    def __setattr__(self, _name: str, _value: object) -> None:
        raise AttributeError('owner authority context is immutable')

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('owner authority context cannot be serialized')

    def __repr__(self) -> str:
        return '<OwnerAuthorityContext opaque>'


def _context_reject(code: str) -> None:
    raise LocalPostgresError(code)


def _context_uuid(value: object) -> str:
    if type(value) is not str:
        _context_reject('owner-authority-context-invalid')
    try:
        if str(uuid.UUID(value)) != value:
            _context_reject('owner-authority-context-invalid')
    except ValueError:
        _context_reject('owner-authority-context-invalid')
    return value


def _context_text(value: object) -> str:
    if type(value) is not str or not value or '\x00' in value:
        _context_reject('owner-authority-context-invalid')
    try:
        value.encode('utf-8')
    except UnicodeEncodeError:
        _context_reject('owner-authority-context-invalid')
    return value


def _context_digest(value: object) -> str:
    if type(value) is not str or not _HEX.fullmatch(value):
        _context_reject('owner-authority-context-invalid')
    return value


def _issue_owner_authority_context(issuer: object, configuration_digest: str) -> OwnerAuthorityContext:
    """Issue only from the exact registered original-bootstrap issuer."""
    if (type(issuer) is not _LocalOwnerBootstrapIssuer
            or _BOOTSTRAP_ISSUERS.get(id(issuer)) is not issuer):
        _context_reject('owner-authority-context-issuer-required')
    material = issuer._owner_authority_context_material()
    if type(material) is not tuple or len(material) != 6:
        _context_reject('owner-authority-context-invalid')
    purpose, custodian_id, supervisor_id, provider_id, installation_id, issuer_digest = material
    if issuer_digest != configuration_digest:
        _context_reject('owner-authority-context-binding-mismatch')
    context = OwnerAuthorityContext(
        _CONTEXT_SEAL, issuer, purpose=purpose, custodian_id=custodian_id,
        supervisor_id=supervisor_id, provider_id=provider_id,
        installation_id=installation_id, configuration_digest=issuer_digest)
    _CONTEXTS[id(context)] = context
    return context


def _require_owner_context(context: object, *, issuer: object | None = None,
                           configuration_digest: str | None = None) -> OwnerAuthorityContext:
    if (type(context) is not OwnerAuthorityContext
            or _CONTEXTS.get(id(context)) is not context
            or context._issuer_registry is not context._issuer
            or (issuer is not None and context._issuer is not issuer)
            or (configuration_digest is not None
                and context._configuration_digest != configuration_digest)):
        _context_reject('owner-authority-context-unverified')
    context._issuer._owner_authority_context_material()
    return context


_OWNER_LEDGER_BIRTH_PROFILE = 'umf.owner-approval-ledger-birth/0.1'
_OWNER_LEDGER_ANCHOR_PROFILE = 'umf.owner-approval-ledger-anchor/0.1'


def _ledger_birth_path(issuer: object) -> Path:
    if (type(issuer) is not _LocalOwnerBootstrapIssuer
            or _BOOTSTRAP_ISSUERS.get(id(issuer)) is not issuer):
        raise LocalPostgresError('local-postgresql-bootstrap-issuer-unverified')
    issuer._owner_authority_context_material()
    return issuer._profile.control_home / 'owner-approval-ledger-birth.json'


def _ledger_anchor_path(issuer: object) -> Path:
    if (type(issuer) is not _LocalOwnerBootstrapIssuer
            or _BOOTSTRAP_ISSUERS.get(id(issuer)) is not issuer):
        raise LocalPostgresError('local-postgresql-bootstrap-issuer-unverified')
    issuer._owner_authority_context_material()
    return issuer._profile.control_home / 'owner-approval-ledger-anchor.json'


def _ledger_birth_record(issuer: _LocalOwnerBootstrapIssuer, ledger_path: object,
                         status: str) -> dict[str, Any]:
    if (type(ledger_path) is not str and not isinstance(ledger_path, Path)):
        raise LocalPostgresError('owner-approval-ledger-path-invalid')
    path = Path(ledger_path)
    if (not path.is_absolute() or os.path.normpath(str(path)) != str(path)
            or type(status) is not str or status not in ('pending', 'confirmed')):
        raise LocalPostgresError('owner-approval-ledger-path-invalid')
    material = issuer._owner_authority_context_material()
    configuration = issuer.owner_configuration
    return {'profile': _OWNER_LEDGER_BIRTH_PROFILE, 'status': status,
            'issuerId': issuer._issuer_id, 'enrollmentId': issuer._enrollment_id,
            'enrollmentDigest': issuer._enrollment_digest,
            'configurationDigest': issuer._configuration_digest,
            'authorityId': configuration['authorityId'],
            'purpose': material[0], 'custodianId': material[1],
            'supervisorId': material[2], 'providerId': material[3],
            'installationId': material[4], 'ledgerPath': str(path)}


def _ledger_anchor_record(issuer: _LocalOwnerBootstrapIssuer, ledger_path: object,
                          status: str) -> dict[str, Any]:
    birth = _ledger_birth_record(issuer, ledger_path, status)
    return {'profile': _OWNER_LEDGER_ANCHOR_PROFILE, 'status': status,
            'issuerId': birth['issuerId'], 'enrollmentId': birth['enrollmentId'],
            'enrollmentDigest': birth['enrollmentDigest'],
            'configurationDigest': birth['configurationDigest'],
            'authorityId': birth['authorityId'], 'purpose': birth['purpose'],
            'custodianId': birth['custodianId'], 'supervisorId': birth['supervisorId'],
            'providerId': birth['providerId'], 'installationId': birth['installationId'],
            'ledgerPath': birth['ledgerPath']}


def _read_ledger_anchor(issuer: _LocalOwnerBootstrapIssuer) -> dict[str, Any]:
    raw = _read_private(_ledger_anchor_path(issuer))
    try:
        value = json.loads(raw, object_pairs_hook=_no_duplicates)
    except (json.JSONDecodeError, UnicodeDecodeError, LocalPostgresError):
        raise LocalPostgresError('owner-approval-ledger-anchor-invalid') from None
    if (type(value) is not dict or _canonical(value) != raw
            or set(value) != {'profile', 'status', 'issuerId', 'enrollmentId',
                'enrollmentDigest', 'configurationDigest', 'authorityId', 'purpose',
                'custodianId', 'supervisorId', 'providerId', 'installationId',
                'ledgerPath'}
            or value['profile'] != _OWNER_LEDGER_ANCHOR_PROFILE
            or value['status'] not in ('pending', 'confirmed')):
        raise LocalPostgresError('owner-approval-ledger-anchor-invalid')
    return value


def _read_ledger_birth(issuer: _LocalOwnerBootstrapIssuer) -> dict[str, Any]:
    path = _ledger_birth_path(issuer)
    raw = _read_private(path)
    try:
        value = json.loads(raw, object_pairs_hook=_no_duplicates)
    except (json.JSONDecodeError, UnicodeDecodeError, LocalPostgresError):
        raise LocalPostgresError('owner-approval-ledger-birth-invalid') from None
    if type(value) is not dict or _canonical(value) != raw:
        raise LocalPostgresError('owner-approval-ledger-birth-invalid')
    return value


def _begin_owner_ledger_birth(issuer: object, ledger_path: object,
                              configuration_digest: str) -> Path:
    """Durably bind one original ledger path before the approval core opens it."""
    if (type(issuer) is not _LocalOwnerBootstrapIssuer
            or _BOOTSTRAP_ISSUERS.get(id(issuer)) is not issuer
            or issuer._configuration_digest != configuration_digest):
        raise LocalPostgresError('local-postgresql-bootstrap-issuer-unverified')
    path = _ledger_birth_path(issuer)
    anchor_path = _ledger_anchor_path(issuer)
    pending = _ledger_birth_record(issuer, ledger_path, 'pending')
    anchor = _ledger_anchor_record(issuer, ledger_path, 'pending')
    try:
        current_anchor = _read_ledger_anchor(issuer)
    except LocalPostgresError as exc:
        if exc.code != 'supervisor-private-file-unavailable':
            raise
        # Upgrade an intact original birth record in place. If both binding
        # records are absent, an existing ledger is never adopted.
        try:
            existing_birth = _read_ledger_birth(issuer)
        except LocalPostgresError as birth_exc:
            if birth_exc.code != 'supervisor-private-file-unavailable':
                raise
            existing_birth = None
        if existing_birth is not None:
            existing_status = existing_birth.get('status')
            if (existing_status not in ('pending', 'confirmed')
                    or existing_birth != _ledger_birth_record(
                        issuer, ledger_path, existing_status)):
                raise LocalPostgresError('owner-approval-ledger-birth-mismatch')
            current_anchor = _ledger_anchor_record(issuer, ledger_path, existing_status)
            _write_private(anchor_path, _canonical(current_anchor))
        else:
            # The anchor precedes the ledger and birth marker. An existing
            # ledger without its original anchor cannot be adopted at a path.
            target = Path(pending['ledgerPath'])
            if target.exists() or target.with_name(target.name + '.lock').exists():
                raise LocalPostgresError('owner-approval-ledger-anchor-required') from None
            _write_private(anchor_path, _canonical(anchor))
            current_anchor = anchor
    expected_anchor = dict(anchor)
    expected_anchor['status'] = current_anchor.get('status')
    if current_anchor != expected_anchor:
        raise LocalPostgresError('owner-approval-ledger-anchor-mismatch')
    if current_anchor['status'] == 'confirmed':
        try:
            current_birth = _read_ledger_birth(issuer)
        except LocalPostgresError:
            raise LocalPostgresError('owner-approval-ledger-birth-missing') from None
        expected = _ledger_birth_record(issuer, ledger_path, 'confirmed')
        if current_birth != expected:
            raise LocalPostgresError('owner-approval-ledger-birth-mismatch')
        _verify_confirmed_owner_ledger_birth(issuer, ledger_path,
                                             configuration_digest)
        return Path(expected['ledgerPath'])
    try:
        current = _read_ledger_birth(issuer)
    except LocalPostgresError as exc:
        if exc.code != 'supervisor-private-file-unavailable':
            raise
        target = Path(pending['ledgerPath'])
        lock_path = target.with_name(target.name + '.lock')
        if target.exists() or lock_path.exists():
            _verify_unconfirmed_owner_ledger(target, configuration_digest,
                                             _ledger_anchor_record(issuer, ledger_path,
                                                                   'pending')['authorityId'])
        _write_private(path, _canonical(pending))
        return Path(pending['ledgerPath'])
    expected = dict(pending)
    expected['status'] = current.get('status') if type(current) is dict else None
    if current != expected or current.get('status') not in ('pending', 'confirmed'):
        raise LocalPostgresError('owner-approval-ledger-birth-mismatch')
    if current['status'] == 'pending':
        target = Path(pending['ledgerPath'])
        if target.exists():
            _verify_unconfirmed_owner_ledger(
                target, configuration_digest, pending['authorityId'])
    if current['status'] == 'confirmed':
        _verify_confirmed_owner_ledger_birth(issuer, current['ledgerPath'],
                                             configuration_digest)
    return Path(current['ledgerPath'])


def _verify_confirmed_owner_ledger_birth(issuer: object, ledger_path: object,
                                         configuration_digest: str) -> Path:
    if type(issuer) is not _LocalOwnerBootstrapIssuer:
        raise LocalPostgresError('local-postgresql-bootstrap-issuer-unverified')
    issuer._owner_authority_context_material()
    if type(ledger_path) is not str and not isinstance(ledger_path, Path):
        raise LocalPostgresError('owner-approval-ledger-path-invalid')
    target = _canonical_private_path(str(ledger_path))
    context_path = issuer._profile.control_home / 'owner-bootstrap-context.json'
    try:
        raw = _read_private(context_path)
    except LocalPostgresError:
        raise LocalPostgresError('local-postgresql-bootstrap-context-unavailable') from None
    enrollment, enrollment_raw = _read_bootstrap_enrollment(
        issuer._profile.control_home / 'owner-bootstrap-enrollment.json')
    setup = _parse_owner_setup(raw, enrollment, enrollment_raw,
                               configuration_digest, issuer._profile.control_home)
    if (setup['state'] != 'confirmed'
            or setup['ownerLedger']['ledgerPath'] != str(target)
            or raw != issuer._context_bytes):
        raise LocalPostgresError('local-postgresql-bootstrap-context-unverified')
    _verify_primary_owner_resources(setup, enrollment, configuration_digest)
    try:
        _read_private(issuer._profile.control_home / _OWNER_SETUP_LOCK)
    except LocalPostgresError:
        raise LocalPostgresError('owner-bootstrap-setup-lock-unavailable') from None
    return target


def _confirm_owner_ledger_birth(issuer: object, ledger_path: object,
                                configuration_digest: str) -> Path:
    if (type(issuer) is not _LocalOwnerBootstrapIssuer
            or _BOOTSTRAP_ISSUERS.get(id(issuer)) is not issuer
            or issuer._configuration_digest != configuration_digest):
        raise LocalPostgresError('local-postgresql-bootstrap-issuer-unverified')
    path = _ledger_birth_path(issuer)
    current = _read_ledger_birth(issuer)
    pending = _ledger_birth_record(issuer, ledger_path, 'pending')
    if current != pending:
        if current == _ledger_birth_record(issuer, ledger_path, 'confirmed'):
            return _verify_confirmed_owner_ledger_birth(
                issuer, ledger_path, configuration_digest)
        raise LocalPostgresError('owner-approval-ledger-birth-mismatch')
    anchor_path = _ledger_anchor_path(issuer)
    anchor = _read_ledger_anchor(issuer)
    if anchor != _ledger_anchor_record(issuer, ledger_path, 'pending'):
        raise LocalPostgresError('owner-approval-ledger-anchor-mismatch')
    confirmed = _ledger_birth_record(issuer, ledger_path, 'confirmed')
    target = Path(ledger_path)
    try:
        ledger = _read_private(target)
        lock = _read_private(target.with_name(target.name + '.lock'))
    except LocalPostgresError:
        raise LocalPostgresError('owner-approval-ledger-birth-incomplete') from None
    try:
        first = json.loads(ledger.splitlines()[0], object_pairs_hook=_no_duplicates)
    except (IndexError, json.JSONDecodeError, UnicodeDecodeError, LocalPostgresError):
        raise LocalPostgresError('owner-approval-ledger-birth-incomplete') from None
    issuer._owner_authority_context_material()
    if (type(first) is not dict
            or first.get('profile') != 'umf.configured-owner-approval-ledger/0.1'
            or first.get('configurationDigest') != configuration_digest
            or first.get('authorityId') != confirmed['authorityId']
            or type(lock) is not bytes):
        raise LocalPostgresError('owner-approval-ledger-birth-incomplete')
    # Mark the independent anchor first. If the following write is interrupted,
    # the remaining pending marker is rejected rather than rebinding history.
    _write_private(anchor_path,
                   _canonical(_ledger_anchor_record(issuer, ledger_path, 'confirmed')),
                   exclusive=False)
    _write_private(path, _canonical(confirmed), exclusive=False)
    return _verify_confirmed_owner_ledger_birth(issuer, ledger_path,
                                                configuration_digest)


def _verify_unconfirmed_owner_ledger(path: Path, configuration_digest: str,
                                     authority_id: str) -> None:
    """Allow only the initialized header when resuming an anchored pending birth."""
    try:
        raw = _read_private(path)
        _read_private(path.with_name(path.name + '.lock'))
        first_line, *tail = raw.splitlines()
        first = json.loads(first_line, object_pairs_hook=_no_duplicates)
    except (LocalPostgresError, ValueError, IndexError, UnicodeDecodeError):
        raise LocalPostgresError('owner-approval-ledger-birth-incomplete') from None
    if (tail or type(first) is not dict
            or first.get('profile') != 'umf.configured-owner-approval-ledger/0.1'
            or first.get('configurationDigest') != configuration_digest
            or first.get('authorityId') != authority_id):
        raise LocalPostgresError('owner-approval-ledger-birth-incomplete')

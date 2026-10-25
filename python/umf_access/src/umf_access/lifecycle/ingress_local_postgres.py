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
import select
import signal
import stat
import subprocess
import tempfile
import time
import uuid
from contextlib import contextmanager, nullcontext
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .catalog import _one
from .generation_ingress import OwnerEnrollmentRequest
from .owner_bootstrap import (
    _BOOTSTRAP_ISSUER_SEAL,
    _BOOTSTRAP_ISSUERS,
    LocalPostgresError,
    LocalPostgresProfile,
    _acquire_original_control_lease,
    _canonical,
    _digest,
    _fsync_directory,
    _LocalOwnerBootstrapIssuer,
    _no_duplicates,
    _private_directory,
    _profile_to_enrollment,
    _read_bootstrap_enrollment,
    _read_private,
    _resolve_original_control_lease,
    _role,
    _uuid,
    _validate_bootstrap_context_journal,
    _verify_bootstrap_enrollment,  # noqa: F401 - compatibility import used by source tests.
    _write_private,
    sys_platform_darwin,
)

_JOURNAL_PROFILE = 'umf.local-postgresql-supervisor-journal/0.1'
_OWNER_KIND = 'umf.local-owner-target-registration/0.1'
_ORIGIN_PROFILE = 'postgresql18-local-supervised-origin/0.1'
_ENDPOINT_PROFILE = 'umf.local-postgresql-endpoint-controller/0.1'
_OWNER_APPROVAL_SCOPE = 'enroll-owned-local-postgresql-target'
_VERIFIED_STORE_PREPARATION_SEAL = object()
_VERIFIED_STORE_RECOVERY_OBSERVATION_SEAL = object()
_VERIFIED_STORE_ABSENCE_SEAL = object()
_VERSION = '18.6'
_VERSION_NUM = 180006
_MAX_JOURNAL = 8 * 1024 * 1024
_MAX_EVENTS = 16_384
_MAX_SAFE = 9_007_199_254_740_991
_NATIVE_EFFECT_RESERVATION_SEAL = object()
_NATIVE_EFFECT_OUTCOME_SEAL = object()
_ORIGINAL_STORE_RESERVATION_SEAL = object()
_ORIGINAL_STORE_CAPABILITY_SEAL = object()
_ORIGINAL_STORE_ATTEMPT_SEAL = object()
_ORIGINAL_STORE_BUDGET_SEAL = object()
_ORIGINAL_STORE_READONLY_BUDGET_SEAL = object()
_ORIGINAL_STORE_HOST_WINDOW_NS = 30_000_000_000
_ORIGINAL_STORE_READONLY_WINDOW_NS = 30_000_000_000
_ORIGINAL_STORE_MAX_ATTEMPTS = 2
_ROLE = re.compile(r'^[a-z][a-z0-9_]{0,62}$')
_HEX = re.compile(r'^[a-f0-9]{64}$')
_STORE_SCHEMA_PREFIXES = {
    'umf.pg-generation-ingress-store/0.1': 'umf_ingress_',
    'umf.native-row-originals-store/0.1': 'umf_originals_',
}
_NATIVE_SUPERVISORS: dict[int, tuple[object, int]] = {}
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


def _sha_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
    except OSError:
        raise LocalPostgresError('supervisor-input-unavailable') from None
    return digest.hexdigest()


def _store_descriptor(profile: object, provider_id: object) -> dict[str, str]:
    if type(profile) is not str or profile not in _STORE_SCHEMA_PREFIXES:
        raise LocalPostgresError('local-postgresql-store-profile-unsupported')
    provider = _uuid(provider_id)
    return {'profile': profile, 'storeId': provider,
            'schemaName': _STORE_SCHEMA_PREFIXES[profile] + provider.replace('-', '')}


def _registration_intent_bytes(request: object) -> bytes:
    """Return the exact signed registration intent after checking its binding."""
    from .owner_approval_core import OwnerApprovalRequest

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


def _creation_request_fields(creation: dict[str, Any]) -> dict[str, Any]:
    fields = ('profile', 'supervisorId', 'clusterId', 'incarnationId',
              'installationId', 'ownerUid', 'databaseName', 'businessOwner',
              'maintenanceName', 'controllerName', 'controlDirectory',
              'dataDirectory', 'postgresPath', 'postgresSha256', 'initdbPath',
              'initdbSha256', 'port', 'configDigest', 'hbaDigest')
    if creation.get('profile') == 'umf.local-postgresql-create-request/0.2':
        fields += ('supervisorJournalBirthDigest', 'ownerBootstrapContextDigest')
    return {key: creation[key] for key in fields}


class _SupervisorJournal:
    """Private owner journal with lock, append order and atomic durability."""

    __slots__ = ('birth', 'context', 'context_digest', 'issuer', 'lock_path',
                 'path', 'profile', 'root_context', 'root_policy_digest',
                 'supervisor', 'supervisor_id')

    def __init__(self, path: Path, supervisor_id: str):
        self.path = path
        self.lock_path = path.with_name(path.name + '.lock')
        self.supervisor_id = _uuid(supervisor_id)
        self.profile = _JOURNAL_PROFILE
        self.birth = None
        self.context = None
        self.context_digest = None
        self.issuer = None
        self.root_context = None
        self.root_policy_digest = None
        self.supervisor = None
        _private_directory(path.parent)

    @classmethod
    def open_original(cls, birth_handle: object, *, issuer: object, context: object,
                      supervisor: object, control_lease: object) -> _SupervisorJournal:
        """Open only the journal selected by the verified original .3 birth."""
        from .owner_bootstrap import (
            _parse_owner_setup,
            _resolve_original_supervisor_journal_birth,
        )
        from .supervisor_journal_codec import (
            SupervisorJournalCodecError,
            validate_birth,
            validate_record,
        )
        descriptor = _resolve_original_supervisor_journal_birth(
            birth_handle, issuer=issuer, context=context, supervisor=supervisor,
            control_lease=control_lease)
        enrollment, enrollment_raw = _read_bootstrap_enrollment(issuer._enrollment_path)
        setup_raw = _read_private(issuer._profile.control_home / 'owner-bootstrap-context.json')
        setup = _parse_owner_setup(setup_raw, enrollment, enrollment_raw,
                                   issuer._configuration_digest, issuer._profile.control_home)
        try:
            descriptor = validate_birth(
                descriptor, enrollment=enrollment,
                configuration_digest=issuer._configuration_digest,
                generation_root_policy_digest=setup['generationAuthority']['rootPolicyDigest'])
            root_birth = setup['generationAuthority']['registryBirth']
            root_context = {
                'registryId': root_birth['registryId'],
                'anchorDigest': root_birth['anchorDigest'],
                'rootPolicy': enrollment['generationAuthorityRoots'],
                'purpose': enrollment['purpose'],
                'bootstrapEnrollmentId': enrollment['enrollmentId'],
                'initialRegistryDigest': root_birth['initialRegistryDigest'],
            }
            value = cls(Path(descriptor['path']), descriptor['supervisorId'])
            value.profile = descriptor['journalProfile']
            value.birth = descriptor
            value.context = context
            value.context_digest = hashlib.sha256(_canonical(setup)).hexdigest()
            value.issuer = issuer
            value.root_context = root_context
            value.root_policy_digest = setup['generationAuthority']['rootPolicyDigest']
            value.supervisor = supervisor
            raw = _read_private(value.path)
            if _read_private(value.lock_path) != b'':
                raise SupervisorJournalCodecError('supervisor-journal-lock-invalid')
            _document, replayed_root, pending_root = validate_record(
                raw, birth=descriptor,
                owner_bootstrap_context_digest=value.context_digest,
                generation_root_policy_digest=value.root_policy_digest,
                root_replay_context=root_context, include_root_state=True)
            current_root = _read_private(Path(root_birth['registryPath']))
            if current_root not in (replayed_root, pending_root):
                raise SupervisorJournalCodecError('supervisor-journal-root-origin-mismatch')
            return value
        except (KeyError, TypeError, SupervisorJournalCodecError):
            raise LocalPostgresError('supervisor-journal-birth-incomplete') from None

    def _locked(self):
        flags = os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0)
        try:
            try:
                fd = os.open(self.lock_path, flags)
            except FileNotFoundError:
                if self.birth is not None:
                    raise LocalPostgresError('supervisor-journal-lock-unavailable')
                fd = os.open(self.lock_path, flags | os.O_CREAT, 0o600)
            if self.birth is None:
                os.fchmod(fd, 0o600)
            st = os.fstat(fd)
            if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1
                    or st.st_uid != os.geteuid()):
                raise LocalPostgresError('supervisor-lock-unsafe')
            if self.birth is not None:
                path_stat = self.lock_path.stat(follow_symlinks=False)
                if ((path_stat.st_dev, path_stat.st_ino) != (st.st_dev, st.st_ino)
                        or stat.S_IMODE(path_stat.st_mode) & 0o077):
                    raise LocalPostgresError('supervisor-journal-lock-unavailable')
            fcntl.flock(fd, fcntl.LOCK_EX)
            return fd
        except BaseException:
            if 'fd' in locals():
                os.close(fd)
            raise

    def read(self) -> dict[str, Any]:
        if self.birth is not None:
            from .owner_bootstrap import (
                _parse_owner_setup,
                _resolve_original_supervisor_journal_birth,
                _supervisor_journal_birth_for_issuer,
                _verify_primary_owner_resources,
            )
            from .supervisor_journal_codec import validate_record
            try:
                lease = self.supervisor._require_original_control_lease()
                current_birth = _resolve_original_supervisor_journal_birth(
                    _supervisor_journal_birth_for_issuer(self.issuer),
                    issuer=self.issuer, context=self.context,
                    supervisor=self.supervisor, control_lease=lease)
                if _canonical(current_birth) != _canonical(self.birth):
                    raise LocalPostgresError('supervisor-journal-birth-unverified')
                setup_path = self.path.parent / 'owner-bootstrap-context.json'
                enrollment, enrollment_raw = _read_bootstrap_enrollment(
                    self.path.parent / 'owner-bootstrap-enrollment.json')
                setup_raw = _read_private(setup_path)
                configuration_digest = hashlib.sha256(
                    _canonical(enrollment['ownerConfiguration'])).hexdigest()
                setup = _parse_owner_setup(setup_raw, enrollment, enrollment_raw,
                                           configuration_digest, self.path.parent)
                if hashlib.sha256(_canonical(setup)).hexdigest() != self.context_digest:
                    raise LocalPostgresError('supervisor-journal-context-metadata-invalid')
                _verify_primary_owner_resources(setup, enrollment, configuration_digest)
                raw = _read_private(self.path)
                _document, replayed_root, pending_root = validate_record(
                    raw, birth=self.birth,
                    owner_bootstrap_context_digest=self.context_digest,
                    generation_root_policy_digest=self.root_policy_digest,
                    root_replay_context=self.root_context, include_root_state=True)
                root_birth = setup['generationAuthority']['registryBirth']
                current_root = _read_private(Path(root_birth['registryPath']))
                if current_root not in (replayed_root, pending_root):
                    raise LocalPostgresError('supervisor-journal-root-origin-mismatch')
                self.supervisor._require_original_control_lease(lease)
                return json.loads(raw, object_pairs_hook=_no_duplicates)
            except LocalPostgresError:
                raise
            except (KeyError, TypeError, ValueError, OSError):
                raise LocalPostgresError('supervisor-journal-corrupt') from None
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
            if self.birth is not None:
                from .supervisor_journal_codec import validate_record
                event = {'sequence': doc['sequence'] + 1, 'kind': kind,
                         'payload': dict(payload), 'previousDigest': doc['headDigest']}
                event['recordDigest'] = _digest(event)
                events = [*doc['events'], event]
                if len(events) > _MAX_EVENTS:
                    raise LocalPostgresError('supervisor-journal-capacity')
                encoded = _canonical({
                    'profile': self.profile, 'supervisorId': self.supervisor_id,
                    'journalId': self.birth['journalId'],
                    'definitionDigest': self.birth['definitionDigest'],
                    'anchorDigest': self.birth['anchorDigest'],
                    'sequence': event['sequence'], 'headDigest': event['recordDigest'],
                    'events': events,
                })
                _document, replayed_root, pending_root = validate_record(
                    encoded, birth=self.birth,
                    owner_bootstrap_context_digest=self.context_digest,
                    generation_root_policy_digest=self.root_policy_digest,
                    root_replay_context=self.root_context, include_root_state=True)
                current_root = _read_private(
                    self.path.parent / 'generation-authority-registry.json')
                if current_root not in (replayed_root, pending_root):
                    raise LocalPostgresError('supervisor-journal-root-origin-mismatch')
                self._atomic_replace(encoded)
                return dict(event)
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


def _issue_local_owner_bootstrap_issuer(
        profile: LocalPostgresProfile) -> _LocalOwnerBootstrapIssuer:
    """Load an originally installed enrollment; never enroll or rewrite production."""
    record_path = profile.control_home / 'owner-bootstrap-enrollment.json'
    record, raw = _read_bootstrap_enrollment(record_path)
    from .owner_approval_core import _canonical_bytes, _digest_bytes, _validate_config

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
    configuration_digest = _digest_bytes(config_bytes)
    material = (record['purpose'], context['custodianId'], context['supervisorId'],
                context['providerId'], context['installationId'], configuration_digest)
    context_bytes = _validate_bootstrap_context_journal(
        profile.control_home, record, raw, configuration_digest)
    issuer = _LocalOwnerBootstrapIssuer(
        _BOOTSTRAP_ISSUER_SEAL, profile, configuration_digest,
        enrollment_id=record['enrollmentId'], enrollment_path=record_path,
        enrollment_digest=_digest_bytes(raw), configuration_bytes=config_bytes,
        context_material=material, context_bytes=context_bytes)
    if record['profile'] in ('umf.local-owner-bootstrap-enrollment/0.3',
                             'umf.local-owner-bootstrap-enrollment/0.5'):
        from .owner_bootstrap import _issue_original_supervisor_journal_birth
        _issue_original_supervisor_journal_birth(issuer)
    if record['profile'] == 'umf.local-owner-bootstrap-enrollment/0.5':
        from .owner_bootstrap import _issue_original_target_custody_journal_birth
        _issue_original_target_custody_journal_birth(issuer)
    return issuer


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
        from .owner_approval_core import OwnerApprovalRequest
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


class _VerifiedOriginalStoreRecoveryObservation:
    """Private checked comparison of immutable creation evidence and live RO facts."""

    __slots__ = ('_issuer', '_budget', '_request', '_reservation_digest',
                 '_original_payload_bytes', '_actual_payload_bytes',
                 '_actual_observation_bytes')

    def __init__(self, seal: object, issuer: object,
                 budget: _OriginalStoreReadonlyBudget, request: object,
                 reservation_digest: str, original_payload: dict[str, Any],
                 actual_payload: dict[str, Any], actual_observation: dict[str, Any]):
        if seal is not _VERIFIED_STORE_RECOVERY_OBSERVATION_SEAL:
            raise TypeError('original store recovery observation is supervisor-issued')
        self._issuer = issuer
        self._budget = budget
        self._request = request
        self._reservation_digest = reservation_digest
        self._original_payload_bytes = _canonical(original_payload)
        self._actual_payload_bytes = _canonical(actual_payload)
        self._actual_observation_bytes = _canonical(actual_observation)

    def __setattr__(self, name: str, value: Any) -> None:
        if hasattr(self, name):
            raise AttributeError('original store recovery observation is immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('original store recovery observation cannot be serialized')


class _VerifiedOriginalStoreAbsence:
    """In-process proof that this invocation observed the exact schema absent."""

    __slots__ = ('_issuer', '_budget', '_reservation_digest', '_schema_name', '_proof_bytes')

    def __init__(self, seal: object, issuer: object,
                 budget: _OriginalStoreReadonlyBudget, reservation_digest: str,
                 schema_name: str, proof: dict[str, Any]):
        if (seal is not _VERIFIED_STORE_ABSENCE_SEAL
                or type(proof) is not dict
                or proof.get('profile') != 'umf.original-store-absence-proof/0.1'
                or proof.get('schemaName') != schema_name
                or proof.get('state') != 'absent'):
            raise TypeError('verified original store absence is supervisor-issued')
        self._issuer = issuer
        self._budget = budget
        self._reservation_digest = reservation_digest
        self._schema_name = schema_name
        self._proof_bytes = _canonical(proof)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('verified original store absence cannot be serialized')


class _OriginalStoreCreationReservation:
    """Opaque source-bound reservation retained across the native DDL attempt."""

    __slots__ = ('_approval', '_custodian', '_evidence', '_issuer',
                 '_connection', '_effect_handle', '_native_effect',
                 '_record_bytes', '_store', '_target', '_budget',
                 'record_bytes')

    def __init__(self, seal: object, issuer: object, *, evidence: object,
                 approval: object, custodian: object, target: object,
                 connection: object, effect_handle: object,
                 native_effect: object, record_bytes: bytes, store: dict[str, Any],
                 budget: object | None):
        if seal is not _ORIGINAL_STORE_RESERVATION_SEAL:
            raise TypeError('original store reservation is supervisor-issued')
        if type(record_bytes) is not bytes or len(record_bytes) > 65_536:
            raise LocalPostgresError('local-postgresql-store-reservation-capacity')
        self._issuer = issuer
        self._evidence = evidence
        self._approval = approval
        self._custodian = custodian
        self._target = target
        self._connection = connection
        self._effect_handle = effect_handle
        self._native_effect = native_effect
        self._record_bytes = bytes(record_bytes)
        self.record_bytes = bytes(record_bytes)
        self._store = _canonical(store)
        self._budget = budget

    def __setattr__(self, name: str, value: Any) -> None:
        if hasattr(self, name):
            raise AttributeError('original store reservation is immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('original store reservation cannot be serialized')


class _OriginalStoreCreationAttempt:
    """Volatile issuer handle for one actual native transaction attempt."""

    __slots__ = ('_issuer', '_reservation', '_connection', '_xid',
                 '_database_name', '_database_oid', '_system_identifier',
                 '_backend_pid', '_backend_start', '_budget')

    def __init__(self, seal: object, issuer: object, reservation: object,
                 connection: object, *, xid: str, database_name: str,
                 database_oid: int, system_identifier: str,
                 backend_pid: int, backend_start: str, budget: object):
        if seal is not _ORIGINAL_STORE_ATTEMPT_SEAL:
            raise TypeError('original store attempt is supervisor-issued')
        self._issuer = issuer
        self._reservation = reservation
        self._connection = connection
        self._xid = xid
        self._database_name = database_name
        self._database_oid = database_oid
        self._system_identifier = system_identifier
        self._backend_pid = backend_pid
        self._backend_start = backend_start
        self._budget = budget

    def __setattr__(self, name: str, value: Any) -> None:
        if hasattr(self, name):
            raise AttributeError('original store attempt is immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('original store attempt cannot be serialized')


class _OriginalStoreCreationBudget:
    """Private, process-bound allowance for one exact original creation effect."""

    __slots__ = ('_issuer', '_creator_pid', '_request', '_effect_key', '_evidence',
                 '_approval', '_custodian', '_target', '_connection', '_store_bytes',
                 '_request_digest', '_approval_digest', '_configuration_digest',
                 '_started_ns', '_deadline_ns', '_attempts', '_reservation_digest',
                 '_reservation', '_caller_timeout_lower_ms', '_timeout_state', '_fenced',
                 '_timeout_discovery_complete')

    def __init__(self, seal: object, issuer: object, *, request: object,
                 evidence: object, approval: object, custodian: object,
                 target: object, connection: object, store: dict[str, Any],
                 started_ns: int,
                 caller_timeout_lower_ms: tuple[tuple[str, int], ...] | None = None):
        if seal is not _ORIGINAL_STORE_BUDGET_SEAL:
            raise TypeError('original store budget is supervisor-issued')
        self._issuer = issuer
        self._creator_pid = os.getpid()
        self._request = request
        self._effect_key = request.effect_key
        self._evidence = evidence
        self._approval = approval
        self._custodian = custodian
        self._target = target
        self._connection = connection
        self._store_bytes = _canonical(store)
        self._request_digest = request._intent_digest
        self._approval_digest = approval.approval_digest
        self._configuration_digest = issuer._owner_core.configuration_digest
        if (caller_timeout_lower_ms is not None
                and (type(caller_timeout_lower_ms) is not tuple or len(caller_timeout_lower_ms) != 2
                or tuple(name for name, _value in caller_timeout_lower_ms)
                    != ('lock_timeout', 'statement_timeout')
                or any(type(value) is not int or value < 0
                       for _name, value in caller_timeout_lower_ms))):
            raise TypeError('original store budget timeout evidence is invalid')
        self._started_ns = started_ns
        self._deadline_ns = started_ns + _ORIGINAL_STORE_HOST_WINDOW_NS
        self._attempts = 0
        self._reservation_digest = None
        self._reservation = None
        self._caller_timeout_lower_ms = caller_timeout_lower_ms
        self._timeout_state = {}
        self._fenced = False
        self._timeout_discovery_complete = caller_timeout_lower_ms is not None

    def __setattr__(self, name: str, value: Any) -> None:
        if hasattr(self, name):
            raise AttributeError('original store budget is supervisor-issued')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('original store budget cannot be serialized')


def _execute_original_store_sql(issuer: Any, budget: Any, connection: Any,
                                query: Any, params: Any = None, *,
                                prepare: bool | None = None,
                                binary: bool | None = None,
                                cursor: Any = None):
    """Drive one fixed original-store psycopg query with finite socket waits.

    Psycopg 3.2.13's synchronous Cursor.execute() uses the same private
    ``_execute_gen`` but delegates waiting to an unbounded connection wait.
    This narrow adapter drives that generator using the pinned Wait/Ready
    protocol and the invocation's existing absolute deadline. It never owns,
    commits, rolls back, or closes the caller's connection.
    """
    try:
        from psycopg import Connection, Cursor
        from psycopg._enums import Ready, Wait
    except Exception:  # noqa: BLE001 -- exact driver contract unavailable
        raise LocalPostgresError(
            'local-postgresql-store-budget-driver-unavailable') from None
    if type(connection) is not Connection:
        raise LocalPostgresError('local-postgresql-store-budget-driver-unsupported')
    if cursor is None:
        cursor = connection.cursor()
    if type(cursor) is not Cursor or cursor.connection is not connection:
        raise LocalPostgresError('local-postgresql-store-budget-cursor-unsupported')

    def require_budget() -> int:
        if type(budget) is _OriginalStoreCreationBudget:
            if budget._issuer is not issuer:
                raise LocalPostgresError('local-postgresql-store-budget-unavailable')
            if budget._reservation is None:
                return issuer._require_original_store_budget_pre_reservation(budget)
            return issuer._require_original_store_budget(budget._reservation)
        readonly_type = globals().get('_OriginalStoreReadonlyBudget')
        if readonly_type is not None and type(budget) is readonly_type:
            return issuer._require_original_store_readonly_budget(budget)
        raise LocalPostgresError('local-postgresql-store-budget-unavailable')

    lock = connection.lock
    try:
        acquired = lock.acquire(blocking=False)
    except Exception:  # noqa: BLE001 -- do not operate through unknown lock
        acquired = False
    if not acquired:
        raise LocalPostgresError('local-postgresql-store-budget-connection-busy')

    pgconn = connection.pgconn
    old_nonblocking = None
    complete = False
    operation_started = False
    keep_locked = False
    try:
        require_budget()
        readonly_type = globals().get('_OriginalStoreReadonlyBudget')
        starting_readonly_transaction = (
            readonly_type is not None and type(budget) is readonly_type
            and query == 'BEGIN READ ONLY')
        allowed_transaction_states = (
            (0,) if starting_readonly_transaction
            else (0, 2) if connection.autocommit else (2,))
        if (connection.closed or pgconn.status != 0
                or pgconn.transaction_status not in allowed_transaction_states
                or pgconn.pipeline_status != 0):
            raise LocalPostgresError(
                'local-postgresql-store-budget-connection-state-invalid')
        old_nonblocking = pgconn.nonblocking
        if type(old_nonblocking) is not int or old_nonblocking not in (0, 1):
            raise LocalPostgresError(
                'local-postgresql-store-budget-connection-state-invalid')
        socket_fd = pgconn.socket
        if type(socket_fd) is not int or socket_fd < 0:
            raise LocalPostgresError(
                'local-postgresql-store-budget-connection-state-invalid')
        pgconn.nonblocking = 1
        require_budget()
        generator = cursor._execute_gen(
            query, params, prepare=prepare, binary=binary)
        operation_started = True
        try:
            wait_mask = next(generator)
        except StopIteration:
            wait_mask = None
            complete = True
        while not complete:
            require_budget()
            if (type(wait_mask) not in (int, Wait)
                    or int(wait_mask) not in (1, 2, 3)):
                raise LocalPostgresError(
                    'local-postgresql-store-budget-query-protocol-invalid')
            remaining_ns = budget._deadline_ns - time.monotonic_ns()
            if remaining_ns <= 0:
                raise LocalPostgresError('local-postgresql-store-budget-exhausted')
            timeout = min(0.025, remaining_ns / 1_000_000_000)
            mask = int(wait_mask)
            readable = bool(mask & 1)
            writable = bool(mask & 2)
            ready_read, ready_write, _exceptional = select.select(
                [socket_fd] if readable else [],
                [socket_fd] if writable else [], [], timeout)
            require_budget()
            ready = (Ready.R if ready_read else Ready.NONE)
            if ready_write:
                ready = Ready(int(ready) | int(Ready.W))
            try:
                wait_mask = generator.send(ready)
            except StopIteration:
                complete = True
        require_budget()
        pgconn.nonblocking = old_nonblocking
        old_nonblocking = None
        require_budget()
        return cursor
    except BaseException as exc:  # noqa: BLE001 -- interrupts also quarantine uncertain I/O
        keep_locked = operation_started
        if not operation_started and old_nonblocking is not None:
            try:
                pgconn.nonblocking = old_nonblocking
                old_nonblocking = None
            except Exception:  # noqa: BLE001 -- preserve lock if driver state is uncertain
                keep_locked = True
        if keep_locked:
            if type(budget) is _OriginalStoreCreationBudget:
                object.__setattr__(budget, '_fenced', True)
                issuer._original_store_connection_fences[id(connection)] = connection
            else:
                object.__setattr__(budget, '_fenced', True)
                issuer._original_store_readonly_connection_fences[
                    id(connection)] = connection
        if isinstance(exc, LocalPostgresError):
            raise
        if isinstance(exc, (KeyboardInterrupt, SystemExit, GeneratorExit)):
            raise
        raise LocalPostgresError(
            'local-postgresql-store-budget-query-unresolved') from None
    finally:
        if not keep_locked:
            lock.release()


class _BudgetedOriginalStoreConnection:
    """Bound each fixed creation SQL call to the same live host allowance."""

    __slots__ = ('_issuer', '_reservation', '_budget', '_connection', '_lower_ms')

    def __init__(self, issuer: object,
                 reservation: _OriginalStoreCreationReservation | _OriginalStoreCreationBudget,
                 *, connection: object | None = None):
        self._issuer = issuer
        self._reservation = reservation if type(reservation) is _OriginalStoreCreationReservation else None
        self._budget = reservation._budget if self._reservation is not None else reservation
        self._connection = self._budget._connection if connection is None else connection
        if self._connection is self._budget._connection:
            self._lower_ms = dict(self._budget._caller_timeout_lower_ms or ())
        else:
            issuer._require_original_store_budget(reservation)
            # This connection was created by the supervisor with those exact
            # startup options; do not perform an unbounded discovery query.
            self._lower_ms = dict(self._budget._caller_timeout_lower_ms or ())

    def _install_timeout(self, name: str, proposal_ms: int) -> None:
        # The value is a supervisor-derived positive integer, never caller SQL.
        remaining_ms = self._issuer._require_original_store_budget(self._budget)
        caps = [remaining_ms, proposal_ms]
        existing = self._lower_ms[name]
        if existing > 0:
            caps.append(existing)
        timeout_ms = min(caps)
        # SET LOCAL is required whenever this connection is already inside a
        # transaction, including explicit transactions on autocommit=True
        # connections.  Otherwise the supervisor's temporary cap would become
        # session state owned by the caller.
        transaction_status = self._connection.info.transaction_status
        scope = 'SET LOCAL' if int(transaction_status) == 2 else 'SET'
        _execute_original_store_sql(
            self._issuer, self._budget, self._connection,
            f"{scope} {name} = '{timeout_ms}ms'")
        self._budget._timeout_state[name] = timeout_ms
        self._issuer._require_original_store_budget(self._budget)

    def execute(self, query: Any, *args: Any, **kwargs: Any):
        self._install_timeout('lock_timeout', 5_000)
        # Install the statement cap last so it reflects the closest pre-query
        # sample of the same absolute deadline.
        self._install_timeout('statement_timeout', 30_000)
        self._issuer._require_original_store_budget(self._budget)
        if len(args) > 1 or (args and 'params' in kwargs):
            raise TypeError('execute accepts one parameter sequence')
        params = args[0] if args else kwargs.pop('params', None)
        prepare = kwargs.pop('prepare', None)
        binary = kwargs.pop('binary', None)
        if kwargs:
            raise TypeError('unsupported bounded execute option')
        cursor = _execute_original_store_sql(
            self._issuer, self._budget, self._connection,
            query, params, prepare=prepare, binary=binary)
        self._issuer._require_original_store_budget(self._budget)
        return _BudgetedOriginalStoreCursor(
            self._issuer, self._reservation, cursor, self._connection,
            budget=self._budget)

    def restore_caller_timeouts(self) -> None:
        """Restore the exact observed caller settings without owning its txn."""
        budget = self._budget
        if (self._reservation is None
                or self._connection is not self._reservation._connection
                or budget._caller_timeout_lower_ms is None):
            return
        try:
            status = int(self._connection.info.transaction_status)
            # An aborted transaction will roll back SET LOCAL itself.  Never
            # issue recovery SQL into that transaction, and never end it.
            if status != 2:
                return
            self._issuer._require_original_store_budget(self._budget)
            for name, value in self._reservation._budget._caller_timeout_lower_ms:
                self._issuer._require_original_store_budget(self._budget)
                _execute_original_store_sql(
                    self._issuer, budget, self._connection,
                    f"SET LOCAL {name} = '{value}ms'")
            self._issuer._require_original_store_budget(self._budget)
        except BaseException:
            # Settings restoration is part of preserving caller ownership.
            # If it cannot be proven, quarantine this connection and make the
            # original creation budget unavailable for any further DDL.
            object.__setattr__(budget, '_fenced', True)
            self._issuer._original_store_connection_fences[id(self._connection)] = (
                self._connection)
            raise LocalPostgresError(
                'local-postgresql-store-timeout-restore-unresolved') from None

    def __getattr__(self, name: str) -> Any:
        if name == 'cursor':
            return self.cursor
        if name in {'executemany', 'transaction', 'commit', 'rollback', 'close',
                    'pipeline', 'copy', 'cancel'}:
            raise AttributeError(name)
        return getattr(self._connection, name)

    def cursor(self, *args: Any, **kwargs: Any):
        self._issuer._require_original_store_budget(self._budget)
        cursor = self._connection.cursor(*args, **kwargs)
        return _BudgetedOriginalStoreCursor(
            self._issuer, self._reservation, cursor, self._connection,
            budget=self._budget)


class _BudgetedOriginalStoreCursor:
    """Check the same absolute limit around fetches on an original-store query."""

    __slots__ = ('_issuer', '_reservation', '_budget', '_cursor', '_connection')

    def __init__(self, issuer: Any,
                 reservation: _OriginalStoreCreationReservation | None,
                 cursor: Any, connection: Any | None = None,
                 *, budget: _OriginalStoreCreationBudget | None = None):
        self._issuer = issuer
        self._reservation = reservation
        self._budget = (reservation._budget if reservation is not None else budget)
        self._cursor = cursor
        self._connection = self._budget._connection if connection is None else connection

    def execute(self, query: Any, params: Any = None, *,
                prepare: bool | None = None, binary: bool | None = None):
        self._issuer._require_original_store_budget(self._budget)
        bounded = _BudgetedOriginalStoreConnection(
            self._issuer, self._reservation or self._budget,
            connection=self._connection)
        bounded._install_timeout('lock_timeout', 5_000)
        bounded._install_timeout('statement_timeout', 30_000)
        self._cursor = _execute_original_store_sql(
            self._issuer, self._budget,
            self._connection, query, params,
            prepare=prepare, binary=binary, cursor=self._cursor)
        self._issuer._require_original_store_budget(self._budget)
        return self

    def __enter__(self):
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        self._cursor.close()

    def close(self) -> None:
        self._cursor.close()

    def __getattr__(self, name: str) -> Any:
        if name in {'executemany', 'stream', 'copy', 'close'}:
            raise AttributeError(name)
        return getattr(self._cursor, name)

    def fetchone(self):
        self._issuer._require_original_store_budget(self._budget)
        result = self._cursor.fetchone()
        self._issuer._require_original_store_budget(self._budget)
        return result

    def fetchall(self):
        self._issuer._require_original_store_budget(self._budget)
        result = self._cursor.fetchall()
        self._issuer._require_original_store_budget(self._budget)
        return result

    def fetchmany(self, size: int | None = None):
        self._issuer._require_original_store_budget(self._budget)
        result = (self._cursor.fetchmany() if size is None
                  else self._cursor.fetchmany(size))
        self._issuer._require_original_store_budget(self._budget)
        return result

    def __iter__(self):
        return iter(self.fetchall())


class _OriginalStoreReadonlyBudget:
    """One supervisor-issued read-only invocation; independent of DDL allowance."""

    __slots__ = ('_issuer', '_pid', '_reservation', '_request', '_effect',
                 '_reservation_digest', '_reservation_record_bytes',
                 '_target', '_connection', '_store_bytes',
                 '_operation', '_started_ns', '_deadline_ns', '_fenced',
                 '_timeout_state')

    def __init__(self, seal: object, issuer: object, reservation: object,
                 request: object, effect: object, reservation_digest: str,
                 reservation_record_bytes: bytes,
                 target: object, connection: object, store: dict[str, Any], operation: str,
                 started_ns: int):
        if seal is not _ORIGINAL_STORE_READONLY_BUDGET_SEAL:
            raise TypeError('original store read-only budget is supervisor-issued')
        self._issuer = issuer
        self._pid = os.getpid()
        self._reservation = reservation
        self._request = request
        self._effect = effect
        self._reservation_digest = reservation_digest
        self._reservation_record_bytes = bytes(reservation_record_bytes)
        self._target = target
        self._connection = connection
        self._store_bytes = _canonical(store)
        self._operation = operation
        self._started_ns = started_ns
        self._deadline_ns = started_ns + _ORIGINAL_STORE_READONLY_WINDOW_NS
        self._fenced = False
        # Mutable only inside this private invocation to bind timeout evidence
        # to the values actually installed on its supervisor-owned connection.
        self._timeout_state = {}

    def __setattr__(self, name: str, value: Any) -> None:
        if hasattr(self, name):
            raise AttributeError('original store read-only budget is immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('original store read-only budget cannot be serialized')


class _BudgetedOriginalStoreReadonlyConnection:
    """Clamp SQL and fetch work to one separately owned read-only window."""

    __slots__ = ('_issuer', '_budget', '_connection', '_lower_ms')

    def __init__(self, issuer: object, budget: _OriginalStoreReadonlyBudget,
                 connection: object):
        self._issuer = issuer
        self._budget = budget
        self._connection = connection
        issuer._require_original_store_readonly_budget(budget)
        try:
            cursor = _execute_original_store_sql(
                issuer, budget, connection,
                "SELECT name, setting::pg_catalog.int8 FROM pg_catalog.pg_settings "
                "WHERE name IN ('statement_timeout','lock_timeout')")
            rows = cursor.fetchall()
        except Exception:  # noqa: BLE001 -- no blocking fallback
            raise LocalPostgresError('local-postgresql-store-readonly-timeout-unavailable') from None
        if (type(rows) is not list or len(rows) != 2
                or {row[0] for row in rows} != {'statement_timeout', 'lock_timeout'}
                or any(type(row[1]) is not int or row[1] <= 0 for row in rows)):
            raise LocalPostgresError('local-postgresql-store-readonly-timeout-invalid')
        issuer._require_original_store_readonly_budget(budget)
        self._lower_ms = {row[0]: row[1] for row in rows}
        startup = budget._timeout_state
        if (self._lower_ms['statement_timeout']
                != startup.get('startupStatementTimeoutMs')
                or self._lower_ms['lock_timeout'] != startup.get('startupLockTimeoutMs')):
            raise LocalPostgresError('local-postgresql-store-readonly-timeout-invalid')

    def _install_timeout(self, name: str, proposal_ms: int) -> None:
        remaining_ms = self._issuer._require_original_store_readonly_budget(self._budget)
        caps = [remaining_ms, proposal_ms]
        if self._lower_ms[name] > 0:
            caps.append(self._lower_ms[name])
        timeout_ms = min(caps)
        if timeout_ms <= 0:
            raise LocalPostgresError('local-postgresql-store-readonly-exhausted')
        _execute_original_store_sql(
            self._issuer, self._budget, self._connection,
            f"SET LOCAL {name} = '{timeout_ms}ms'")
        self._budget._timeout_state[name] = timeout_ms
        self._issuer._require_original_store_readonly_budget(self._budget)

    def execute(self, query: Any, *args: Any, **kwargs: Any):
        self._issuer._require_original_store_readonly_budget(self._budget)
        self._install_timeout('lock_timeout', 5_000)
        self._install_timeout('statement_timeout', 30_000)
        if len(args) > 1 or (args and 'params' in kwargs):
            raise TypeError('execute accepts one parameter sequence')
        params = args[0] if args else kwargs.pop('params', None)
        prepare = kwargs.pop('prepare', None)
        binary = kwargs.pop('binary', None)
        if kwargs:
            raise TypeError('unsupported bounded execute option')
        cursor = _execute_original_store_sql(
            self._issuer, self._budget, self._connection, query, params,
            prepare=prepare, binary=binary)
        self._issuer._require_original_store_readonly_budget(self._budget)
        return _BudgetedOriginalStoreReadonlyCursor(self._issuer, self._budget, cursor)

    def __getattr__(self, name: str) -> Any:
        if name == 'cursor':
            return self.cursor
        if name in {'executemany', 'transaction', 'commit', 'rollback', 'close',
                    'pipeline', 'copy', 'cancel'}:
            raise AttributeError(name)
        return getattr(self._connection, name)

    def cursor(self, *args: Any, **kwargs: Any):
        self._issuer._require_original_store_readonly_budget(self._budget)
        cursor = self._connection.cursor(*args, **kwargs)
        return _BudgetedOriginalStoreReadonlyCursor(
            self._issuer, self._budget, cursor, self._connection)


class _BudgetedOriginalStoreReadonlyCursor:
    __slots__ = ('_issuer', '_budget', '_cursor', '_connection')

    def __init__(self, issuer: object, budget: _OriginalStoreReadonlyBudget,
                 cursor: object, connection: object | None = None):
        self._issuer = issuer
        self._budget = budget
        self._cursor = cursor
        self._connection = budget._connection if connection is None else connection

    def execute(self, query: Any, params: Any = None, *,
                prepare: bool | None = None, binary: bool | None = None):
        self._issuer._require_original_store_readonly_budget(self._budget)
        bounded = _BudgetedOriginalStoreReadonlyConnection(
            self._issuer, self._budget, self._connection)
        bounded._install_timeout('lock_timeout', 5_000)
        bounded._install_timeout('statement_timeout', 30_000)
        self._cursor = _execute_original_store_sql(
            self._issuer, self._budget, self._connection,
            query, params, prepare=prepare, binary=binary, cursor=self._cursor)
        self._issuer._require_original_store_readonly_budget(self._budget)
        return self

    def __enter__(self):
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        self._cursor.close()

    def close(self) -> None:
        self._cursor.close()

    def fetchone(self):
        self._issuer._require_original_store_readonly_budget(self._budget)
        value = self._cursor.fetchone()
        self._issuer._require_original_store_readonly_budget(self._budget)
        return value

    def fetchall(self):
        self._issuer._require_original_store_readonly_budget(self._budget)
        value = self._cursor.fetchall()
        self._issuer._require_original_store_readonly_budget(self._budget)
        return value

    def fetchmany(self, size: int | None = None):
        self._issuer._require_original_store_readonly_budget(self._budget)
        value = (self._cursor.fetchmany() if size is None
                 else self._cursor.fetchmany(size))
        self._issuer._require_original_store_readonly_budget(self._budget)
        return value

    def __iter__(self):
        return iter(self.fetchall())

    def __getattr__(self, name: str) -> Any:
        if name in {'executemany', 'stream', 'copy', 'close'}:
            raise AttributeError(name)
        return getattr(self._cursor, name)


class _OriginalStoreCreationCapability:
    """Opaque capability issued after all original journals and the core finish."""

    __slots__ = ('_issuer', '_reservation', '_receipt_digest', '_kind')

    def __init__(self, seal: object, issuer: object, reservation: object,
                 receipt_digest: str):
        if seal is not _ORIGINAL_STORE_CAPABILITY_SEAL:
            raise TypeError('original store capability is supervisor-issued')
        if type(receipt_digest) is not str or not _HEX.fullmatch(receipt_digest):
            raise LocalPostgresError('local-postgresql-store-capability-invalid')
        self._issuer = issuer
        self._reservation = reservation
        self._receipt_digest = receipt_digest
        self._kind = 'umf.original-row-store-creation-capability/0.1'

    def __setattr__(self, name: str, value: Any) -> None:
        if hasattr(self, name):
            raise AttributeError('original store capability is immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('original store capability cannot be serialized')


_TARGET_LEASE_SEAL = object()


class _OriginalNativeTargetLease:
    """Supervisor-owned registered-target view over the same control lease."""

    __slots__ = ('_control_lease', '_custodian', '_issuer', '_reference',
                 '_supervisor', '_target_handle', '_verified_target')

    def __init__(self, seal: object, supervisor: object, control_lease: object,
                 custodian: object, target_handle: object, verified_target: object,
                 reference: dict[str, Any]):
        if seal is not _TARGET_LEASE_SEAL:
            raise TypeError('native target leases are supervisor-issued')
        object.__setattr__(self, '_issuer', supervisor)
        object.__setattr__(self, '_supervisor', supervisor)
        object.__setattr__(self, '_control_lease', control_lease)
        object.__setattr__(self, '_custodian', custodian)
        object.__setattr__(self, '_target_handle', target_handle)
        object.__setattr__(self, '_verified_target', verified_target)
        object.__setattr__(self, '_reference', _canonical(reference))

    def __setattr__(self, _name: str, _value: object) -> None:
        raise AttributeError('native target lease is immutable')

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('native target lease cannot be serialized')

    def __repr__(self) -> str:
        return '<OriginalNativeTargetLease opaque>'


class LocalPostgresSupervisor:
    """Create and supervise one fresh PostgreSQL 18.6 local installation.

    The supplied profile is trusted installation configuration.  Source/model
    requests cannot select binaries, paths, listeners, role flags or HBA rules.
    """

    __slots__ = (
        '__resolver',
        '_active_child',
        '_active_control_lease',
        '_active_creation',
        '_active_target_lease',
        '_authority_context',
        '_bootstrap_issuer',
        '_bound_installation_id',
        '_creation_recovery_receipts',
        '_custodian',
        '_custodian_id',
        '_custody_handle',
        '_handles',
        '_journal',
        '_launch',
        '_maintenance_password',
        '_native_effect_outcomes',
        '_native_effect_reservations',
        '_native_targets',
        '_original_store_reservations',
        '_original_store_attempts',
        '_original_store_budgets',
        '_original_store_readonly_budgets',
        '_original_store_readonly_connection_fences',
        '_original_store_issuer_pid',
        '_pending_original_store_recovery',
        '_original_store_connection_fences',
        '_original_store_capabilities',
        '_observer',
        '_owner_core',
        '_owner_payloads',
        '_pending_creation_values',
        '_pending_creations',
        '_pg_process',
        '_principal_dispatches',
        '_principal_preparations',
        '_principal_recovery_dispatches',
        '_profile',
        '_provider_id',
        '_registration_dispatches',
        '_registration_preparations',
        '_registration_recovery_dispatches',
        '_reserved_creation_values',
        '_store_issuer',
        '_store_preparations',
        '_supervisor_id',
        '_target_leases',
        '_target_custody_journal_birth',
        '_target_paths',
    )

    def __init__(self, profile: LocalPostgresProfile, *, owner_core: object,
                 authority_context: object, bootstrap_issuer: object):
        if type(profile) is not LocalPostgresProfile:
            raise TypeError('local PostgreSQL profile must be trusted host configuration')
        if not sys_platform_darwin():
            raise LocalPostgresError('local-postgresql-profile-unsupported-platform')
        from .owner_approval_core import OwnerApprovalCore
        from .owner_bootstrap import (
            _require_owner_context,
            _verify_confirmed_owner_ledger_birth,
        )
        if type(owner_core) is not OwnerApprovalCore:
            raise LocalPostgresError('local-postgresql-owner-core-required')
        context = _require_owner_context(
            authority_context, issuer=bootstrap_issuer,
            configuration_digest=owner_core.configuration_digest)
        issuer = bootstrap_issuer
        if (type(issuer) is not _LocalOwnerBootstrapIssuer
                or _BOOTSTRAP_ISSUERS.get(id(issuer)) is not issuer
                or issuer._profile is not profile
                or issuer._purpose != profile.purpose
                or issuer._installation_id != profile.installation_id
                or issuer._context_material[1] != profile.custodian_id
                or issuer._configuration_digest != owner_core.configuration_digest):
            raise LocalPostgresError('local-postgresql-owner-context-unverified')
        _verify_confirmed_owner_ledger_birth(
            issuer, owner_core._ledger.path, owner_core.configuration_digest)
        self._profile = profile
        self._owner_core = owner_core
        self._authority_context = context
        self._bootstrap_issuer = issuer
        enrollment, _enrollment_raw = _read_bootstrap_enrollment(issuer._enrollment_path)
        if enrollment['profile'] == 'umf.local-owner-bootstrap-enrollment/0.5':
            from .owner_bootstrap import _target_custody_journal_birth_for_issuer
            self._target_custody_journal_birth = _target_custody_journal_birth_for_issuer(issuer)
            if self._target_custody_journal_birth is None:
                raise LocalPostgresError('target-custody-journal-birth-unverified')
        else:
            self._target_custody_journal_birth = None
        self._bound_installation_id = profile.installation_id
        self._observer = _DarwinProcessObserver(profile.process_observer,
                                                 profile.process_observer_sha256)
        self._supervisor_id = profile.supervisor_id
        self._custodian_id = profile.custodian_id
        self._provider_id = profile.provider_id
        self._journal: _SupervisorJournal | None = None
        self._target_paths: dict[str, Path] = {}
        self._active_control_lease = None
        self._active_target_lease = None
        self._target_leases: dict[int, _OriginalNativeTargetLease] = {}
        self._maintenance_password: bytes | None = None
        self._pg_process: subprocess.Popen[bytes] | None = None
        self._launch: dict[str, Any] | None = None
        self._handles: dict[int, tuple[OwnerEnrollmentRequest, dict[str, Any], object]] = {}
        self._owner_payloads: dict[str, dict[str, Any]] = {}
        self._custodian = None
        self._custody_handle = None
        self._creation_recovery_receipts: dict[int, dict[str, Any]] = {}
        self._store_issuer = object()
        self._store_preparations: dict[
            int, tuple[object, _VerifiedNativeStorePreparation, bytes, bytes, bytes]
        ] = {}
        self._native_effect_reservations: dict[int, _NativeEffectReservation] = {}
        self._native_effect_outcomes: dict[int, _VerifiedNativeEffectOutcome] = {}
        self._original_store_reservations: dict[int, tuple[object, dict[str, Any], dict[str, Any]]] = {}
        self._original_store_attempts: dict[int, tuple[object, object, str]] = {}
        self._original_store_budgets: dict[int, _OriginalStoreCreationBudget] = {}
        self._original_store_readonly_budgets: dict[int, _OriginalStoreReadonlyBudget] = {}
        self._original_store_readonly_connection_fences: dict[int, object] = {}
        self._original_store_issuer_pid = os.getpid()
        self._pending_original_store_recovery = None
        self._original_store_connection_fences: dict[int, object] = {}
        self._original_store_capabilities: dict[int, tuple[object, object]] = {}
        self._pending_creations: dict[int, _PendingTargetCreation] = {}
        self._pending_creation_values: dict[int, tuple[_PendingTargetCreation, dict[str, Any]]] = {}
        self._reserved_creation_values: dict[
            int, tuple[_NativeEffectReservation, dict[str, Any]]
        ] = {}
        self._active_creation: _PendingTargetCreation | None = None
        self._active_child: subprocess.Popen[bytes] | None = None
        self._native_targets: dict[int, _OriginalNativeTarget] = {}
        self._principal_preparations: dict[int, _PreparedOriginalPrincipals] = {}
        self._registration_preparations: dict[int, _PreparedTargetRegistration] = {}
        self._principal_dispatches: dict[int, _NativeEffectReservation] = {}
        self._principal_recovery_dispatches: dict[
            int, tuple[_NativeEffectReservation, _PreparedOriginalPrincipals,
                       _VerifiedNativeEffectOutcome | None, dict[str, Any],
                       dict[str, Any] | None, dict[str, Any]]
        ] = {}
        self._registration_dispatches: dict[int, _NativeEffectReservation] = {}
        self._registration_recovery_dispatches: dict[
            int, tuple[_NativeEffectReservation, _OriginalNativeTarget, object,
                       _VerifiedNativeEffectOutcome | None, dict[str, Any],
                       dict[str, Any], dict[str, Any] | None]
        ] = {}
        # This exact concrete constructor binds itself once after all context
        # and core checks; no issuer-side generic registrar accepts objects.
        if issuer._supervisor is not None:
            raise LocalPostgresError('local-postgresql-original-supervisor-binding-invalid')
        object.__setattr__(issuer, '_supervisor', self)
        _NATIVE_SUPERVISORS[id(self)] = (self, os.getpid())

    @property
    def authority_context(self) -> object:
        return self._authority_context

    @contextmanager
    def _original_control_lease(self, *, operation_kind: str,
                                timeout_ms: int = 5000):
        """Hold the existing enrolled setup exclusion for one native operation."""
        if self._active_control_lease is not None:
            raise LocalPostgresError('local-postgresql-control-lease-already-active')
        with _acquire_original_control_lease(
                self._bootstrap_issuer, self._authority_context, self,
                operation_kind=operation_kind, timeout_ms=timeout_ms) as lease:
            self._active_control_lease = lease
            try:
                self._require_original_control_lease(lease, operation_kind=operation_kind)
                yield lease
            finally:
                if self._active_target_lease is not None:
                    self._target_leases.pop(id(self._active_target_lease), None)
                    self._active_target_lease = None
                self._active_control_lease = None

    @contextmanager
    def _reuse_original_control_lease(self, lease: object, *, operation_kind: str):
        """Internal same-operation reentry; never opens another descriptor/flock."""
        self._require_original_control_lease(lease, operation_kind=operation_kind)
        yield lease

    def _require_original_control_lease(self, lease: object | None = None, *,
                                        operation_kind: str | None = None) -> object:
        current = getattr(self, '_active_control_lease', None)
        if lease is None:
            lease = current
        if lease is None or current is not lease:
            raise LocalPostgresError('local-postgresql-control-lease-required')
        if (operation_kind is not None
                and getattr(lease, '_operation_kind', None) != operation_kind):
            raise LocalPostgresError('local-postgresql-control-lease-kind-mismatch')
        return _resolve_original_control_lease(
            lease, context=self._authority_context, supervisor=self,
            operation_kind=operation_kind)

    def _require_native_supervisor_origin(self) -> None:
        if (type(self) is not LocalPostgresSupervisor
                or _NATIVE_SUPERVISORS.get(id(self)) != (self, os.getpid())):
            raise LocalPostgresError('local-postgresql-native-supervisor-origin-unverified')

    def _require_native_effect_operation(self, *allowed: str) -> object:
        """Bind native origin and the fixed active operation at every effect edge."""
        self._require_native_supervisor_origin()
        return self._require_control_operation(*allowed)

    def _require_control_operation(self, *allowed: str) -> object:
        lease = self._require_original_control_lease()
        if lease._operation_kind not in allowed:
            raise LocalPostgresError('local-postgresql-control-lease-kind-mismatch')
        return lease

    def _append_supervisor_journal(self, kind: str,
                                   payload: dict[str, Any]) -> dict[str, Any]:
        """Revalidate the exact outer lease at each durable native-journal write."""
        lease = self._require_original_control_lease()
        if self._journal is None:
            raise LocalPostgresError('local-postgresql-native-effect-journal-unavailable')
        result = self._journal.append(kind, payload)
        self._require_original_control_lease(lease)
        return result

    def _select_supervisor_journal(self, *, retain: bool = True) -> _SupervisorJournal:
        """Select the journal fixed by original bootstrap metadata; never downgrade."""
        lease = self._require_original_control_lease()
        if self._journal is not None:
            return self._journal
        from .owner_bootstrap import (
            _owner_context_journal_metadata,
            _supervisor_journal_birth_for_issuer,
        )
        metadata = _owner_context_journal_metadata(self._authority_context)
        descriptor = metadata['supervisorJournal']
        if descriptor is None:
            suffix = self._supervisor_id.replace('-', '')
            journal = _SupervisorJournal(
                self._profile.control_home / f'owner-journal-{suffix}.json',
                self._supervisor_id)
        else:
            birth = _supervisor_journal_birth_for_issuer(self._bootstrap_issuer)
            if birth is None:
                raise LocalPostgresError('supervisor-journal-birth-unavailable')
            journal = _SupervisorJournal.open_original(
                birth, issuer=self._bootstrap_issuer, context=self._authority_context,
                supervisor=self, control_lease=lease)
        self._require_original_control_lease(lease)
        if retain:
            self._journal = journal
        return journal

    def _require_effect_control_operation(self, scope: str, *, recovery: bool = False) -> object:
        kinds = {
            'local-target-creation': ('target-apply', 'target-recover'),
            'native-principal-preparation': ('principals-apply', 'principals-recover'),
            'local-target-registration': ('registration-apply', 'registration-recover'),
            'native-store-creation': ('store',),
            'disabled-epoch-provision': ('epoch',),
            'generation-ingress-transition': ('transition',),
        }.get(scope)
        if kinds is None:
            raise LocalPostgresError('local-postgresql-native-effect-scope-invalid')
        return self._require_control_operation(*(kinds[1:] if recovery else kinds))

    @contextmanager
    def acquire_original_target_lease(self, custodian: object,
                                      target_custody: object, *,
                                      timeout_ms: int = 5000):
        """Acquire a registered-target lease over the same original setup lock."""
        self._require_native_supervisor_origin()
        with self._original_control_lease(
                operation_kind='target-registered', timeout_ms=timeout_ms) as control:
            from .ingress_custody import CustodyJournalError, LocalTargetCustodian
            if (type(custodian) is not LocalTargetCustodian
                    or custodian is not self._custodian
                    or target_custody is not self._custody_handle
                    or target_custody is None):
                raise LocalPostgresError('local-postgresql-target-lease-unverified')
            self._require_original_control_lease(
                control, operation_kind='target-registered')
            try:
                verified = custodian._resolve_target_custody(target_custody)
                reference = custodian._public_reference(target_custody)
            except CustodyJournalError:
                raise LocalPostgresError('local-postgresql-target-lease-unverified') from None
            if (self._launch is None
                    or not self._native_origin_matches(
                        reference.get('origin'), self._launch.get('nativeAttestation'))):
                raise LocalPostgresError('local-postgresql-target-lease-origin-mismatch')
            lease = _OriginalNativeTargetLease(
                _TARGET_LEASE_SEAL, self, control, custodian,
                target_custody, verified, reference)
            if self._active_target_lease is not None:
                raise LocalPostgresError('local-postgresql-target-lease-already-active')
            self._active_target_lease = lease
            self._target_leases[id(lease)] = lease
            try:
                self._resolve_original_target_lease(
                    lease, custodian=custodian, target_custody=target_custody)
                yield lease
            finally:
                self._target_leases.pop(id(lease), None)
                if self._active_target_lease is lease:
                    self._active_target_lease = None

    def _resolve_original_target_lease(self, value: object, *, custodian: object,
                                       target_custody: object) -> _OriginalNativeTargetLease:
        if (type(value) is not _OriginalNativeTargetLease
                or value._issuer is not self or value._supervisor is not self
                or self._target_leases.get(id(value)) is not value
                or self._active_target_lease is not value
                or value._custodian is not custodian
                or value._target_handle is not target_custody
                or value._control_lease is not self._active_control_lease):
            raise LocalPostgresError('local-postgresql-target-lease-unverified')
        self._require_original_control_lease(
            value._control_lease, operation_kind='target-registered')
        try:
            verified = custodian._resolve_target_custody(target_custody)
            reference = custodian._public_reference(target_custody)
        except Exception:  # noqa: BLE001 - custody details remain private.
            raise LocalPostgresError('local-postgresql-target-lease-unverified') from None
        if (verified is not value._verified_target
                or _canonical(reference) != value._reference
                or self._launch is None
                or not self._native_origin_matches(
                    reference.get('origin'), self._launch.get('nativeAttestation'))):
            raise LocalPostgresError('local-postgresql-target-lease-origin-mismatch')
        return value

    def _make_native_effect_reservation(
            self, request: object, approval: object, scope: str,
            effect_key: tuple[str, ...], purpose: str, target: object,
            journal_event: dict[str, Any], payload_bytes: bytes
            ) -> _NativeEffectReservation:
        self._require_effect_control_operation(scope, recovery=False)
        if self._journal is None:
            raise LocalPostgresError('local-postgresql-native-effect-journal-unavailable')
        from .owner_approval_core import OwnerApprovalRequest, VerifiedOwnerApproval
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
        event = self._append_supervisor_journal('native-effect-intent', {
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
        if type(value) is _NativeEffectReservation:
            self._require_effect_control_operation(value._scope)
        from .owner_approval_core import OwnerAuthorityError
        if (type(value) is not _NativeEffectReservation
                or value._issuer is not self or value._supervisor is not self
                or self._native_effect_reservations.get(id(value)) is not value
                or value._purpose != self._profile.purpose
                or value._request is not value._approval._request
                or value._approval is not verified_approval
                or self._journal is None):
            raise LocalPostgresError('local-postgresql-native-effect-reservation-unverified')
        try:
            self._owner_core._resolve_verified_approval(
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

    def _require_bound_pending_effect(
            self, reservation: object, effect_handle: object, *,
            mode: str = 'execute') -> None:
        """Require the exact core-issued ledger binding before native effects."""
        if type(reservation) is _NativeEffectReservation:
            self._require_effect_control_operation(reservation._scope)
        from .owner_approval_core import OwnerAuthorityError

        if (type(reservation) is not _NativeEffectReservation
                or reservation._supervisor is not self
                or self._native_effect_reservations.get(id(reservation)) is not reservation):
            raise LocalPostgresError('local-postgresql-native-effect-reservation-unverified')
        try:
            self._owner_core._resolve_pending_effect(
                effect_handle, original_request=reservation._request,
                reservation_digest=reservation._journal_record_digest, mode=mode)
        except OwnerAuthorityError:
            raise LocalPostgresError('local-postgresql-owner-effect-binding-required') from None

    def _record_native_effect_outcome(
            self, reservation: _NativeEffectReservation, status: str,
            receipt: dict[str, Any], effect_handle: object) -> _VerifiedNativeEffectOutcome:
        self._require_effect_control_operation(reservation._scope)
        self._require_bound_pending_effect(reservation, effect_handle)
        self._resolve_native_effect_reservation(reservation, reservation._approval)
        if status not in ('confirmed', 'known-aborted'):
            raise LocalPostgresError('local-postgresql-native-effect-outcome-unknown')
        assert self._journal is not None
        receipt_digest = _digest(receipt)
        event = self._append_supervisor_journal(
            'native-effect-confirmed' if status == 'confirmed' else 'native-effect-aborted',
            {'reservationId': reservation._reservation_id,
             'receiptDigest': receipt_digest})
        outcome = _VerifiedNativeEffectOutcome(
            _NATIVE_EFFECT_OUTCOME_SEAL, self, reservation,
            sequence=event['sequence'], status=status, receipt_digest=receipt_digest,
            journal_record_digest=event['recordDigest'])
        self._native_effect_outcomes[id(outcome)] = outcome
        return outcome

    def _resolve_native_effect_outcome(
            self, value: object, reservation: object) -> _VerifiedNativeEffectOutcome:
        if type(reservation) is _NativeEffectReservation:
            self._require_effect_control_operation(reservation._scope)
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
        self._require_effect_control_operation(scope, recovery=True)
        if scope not in ('local-target-creation', 'native-principal-preparation',
                         'local-target-registration'):
            raise LocalPostgresError('local-postgresql-original-request-scope-invalid')
        journal = self._select_supervisor_journal(retain=False)
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
            intent = _creation_request_fields(creation)
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
            request = self._owner_core._recover_original_request(
                scope, intent_bytes, context=self._authority_context,
                expected_approval_id=approval_id)
            if (request._scope != scope or request._intent_bytes != intent_bytes
                    or request._approval_id != approval_id):
                raise LocalPostgresError('local-postgresql-original-request-mismatch')
            outcome = self._owner_core.observe_original_request(
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
        self._require_original_control_lease(operation_kind='target-recover')
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
        journal = self._select_supervisor_journal()
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
        self._creation_recovery_receipts[id(reservation)] = receipt
        creation_request = _PendingTargetCreation(
            _BOOTSTRAP_ISSUER_SEAL, self, request, _canonical(
                _creation_request_fields(creation)))
        target = _OriginalNativeTarget(
            _BOOTSTRAP_ISSUER_SEAL, self, creation_request, reservation,
            creation['clusterId'])
        self._native_targets[id(target)] = target
        self._owner_payloads['creationRequest'] = json.loads(
            _canonical(_creation_request_fields(creation)))
        return target

    def confirm_reattached_target_creation(
            self, target: object, effect_handle: object) -> None:
        """Bind a fresh native observation to the original pending ledger row.

        A previously confirmed effect is only compared with the newly observed
        receipt; this method never repeats target creation.
        """
        self._require_original_control_lease(operation_kind='target-recover')
        if (type(target) is not _OriginalNativeTarget or target._issuer is not self
                or self._native_targets.get(id(target)) is not target
                or self._journal is None):
            raise LocalPostgresError('local-postgresql-original-target-unverified')
        reservation = target._reservation
        receipt = self._creation_recovery_receipts.get(id(reservation))
        if receipt is None:
            raise LocalPostgresError('local-postgresql-original-creation-outcome-mismatch')
        outcome = next((item for item in self._native_effect_outcomes.values()
                        if item._reservation is reservation), None)
        if outcome is not None:
            self._require_bound_pending_effect(reservation, effect_handle, mode='recover')
            if (outcome.status != 'confirmed'
                    or outcome.receipt_digest != _digest(receipt)):
                raise LocalPostgresError('local-postgresql-original-creation-outcome-mismatch')
            return
        self._require_bound_pending_effect(reservation, effect_handle, mode='execute')
        self._record_native_effect_outcome(
            reservation, 'confirmed', receipt, effect_handle)

    def _recover_original_native_effect(
            self, scope: str, *, target: object = None,
            expected_request_digest: str | None = None,
            expected_effect_key: tuple[Any, ...] | None = None
            ) -> tuple[_NativeEffectReservation,
                                                   _VerifiedNativeEffectOutcome | None,
                                                   object]:
        """Rehydrate the exact journaled reservation; never allocate a new ID.

        This restores process-local opaque capabilities from the enrolled
        journal and owner ledger.  It does not itself assert that an effect
        committed; callers must perform the scope-specific native observation
        before settling an unknown outcome.
        """
        operation_kind = {
            'local-target-creation': 'target-recover',
            'native-principal-preparation': 'principals-recover',
            'local-target-registration': 'registration-recover',
            'native-store-creation': 'store',
        }.get(scope)
        if operation_kind is None:
            raise LocalPostgresError('local-postgresql-original-effect-scope-invalid')
        self._require_control_operation(operation_kind)
        self._select_supervisor_journal()
        events = self._journal.read()['events']
        matches = [event for event in events
                   if event['kind'] == 'native-effect-intent'
                   and event['payload'].get('scope') == scope
                   and (expected_request_digest is None
                        or event['payload'].get('requestDigest')
                            == expected_request_digest)
                   and (expected_effect_key is None
                        or event['payload'].get('effectKey') == list(expected_effect_key))]
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
            intent_bytes = _canonical(_creation_request_fields(creation))
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
        elif scope == 'native-store-creation':
            # Rehydration is allowed for the issuer-held pending target only
            # under the store lease. Normal effect/DDL dispatch still requires
            # the fully promoted custody handle.
            self._require_original_store_recovery_target(target)
            try:
                from .ingress_custody import JOURNAL_PROFILE_02, _replay
                external_doc = self._custodian._journal._load()
                external_state = _replay(
                    external_doc['events'], profile=JOURNAL_PROFILE_02)
            except Exception:  # noqa: BLE001 -- durable custody must validate before recovery
                raise LocalPostgresError('local-postgresql-store-recovery-unavailable') from None
            candidates = [item for item in external_state['stores'].values()
                          if item['reservation']['creationRequestDigest']
                             == effect['requestDigest']]
            if len(candidates) != 1:
                raise LocalPostgresError('local-postgresql-original-request-unavailable')
            store_state = candidates[0]
            reservation_record = store_state['reservation']
            reserved_event = next((event for event in external_doc['events']
                                   if event['kind'] == 'originals-store-reserved'
                                   and event['payload']['reservation']['reservationId']
                                       == reservation_record['reservationId']), None)
            typed_event = next((event for event in events
                                if event['kind'] == 'originals-store-creation-intent'
                                and event['payload'].get('reservationDigest')
                                    == store_state['reservationDigest']), None)
            if (reserved_event is None or typed_event is None
                    or typed_event['payload'].get('custodianReservedEventDigest')
                        != reserved_event['recordDigest']
                    or typed_event['sequence'] + 1 != effect_event['sequence']
                    or effect_event['previousDigest'] != typed_event['recordDigest']
                    or reservation_record['creationRequestDigest'] != effect['requestDigest']
                    or reservation_record['creationApprovalDigest']
                        != store_state['approvalDigest']):
                raise LocalPostgresError('local-postgresql-original-effect-mismatch')
            request_value = reserved_event['payload']['request']
            intent_bytes = _canonical(request_value)
            approval_id = effect['approvalId']
            store = reservation_record['store']
            effect_key = ('native-store-creation', reservation_record['providerId'],
                          store['profile'], store['storeId'])
            if (request_value.get('profile') != 'umf.owner-store-create-intent/0.1'
                    or request_value.get('store') != store
                    or request_value['evidence'].get('nativeAuthorityObservationDigest')
                        != reservation_record['nativeAuthorityEvidenceDigest']):
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
            request = self._owner_core._recover_original_request(
                scope, intent_bytes, context=self._authority_context,
                expected_approval_id=approval_id)
            approval = self._owner_core._recover_verified_approval(request)
            self._owner_core._resolve_verified_approval(
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
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-original-effect-binding-recovery-failed') from None

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
        owner_state = self._owner_core.observe_original_request(
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

    def _validate_original_store_custody_history(self, target: object) -> bool:
        """Validate original store chains; return true for a strict pending prefix."""
        self._require_original_control_lease()
        if target is not self._custody_handle or self._custodian is None or self._journal is None:
            raise LocalPostgresError('local-postgresql-store-history-unavailable')
        try:
            from .ingress_custody import JOURNAL_PROFILE_02, _replay
            if self._custodian._journal._profile != JOURNAL_PROFILE_02:
                self._pending_original_store_recovery = None
                return False
            external_doc = self._custodian._journal._load()
            state = _replay(external_doc['events'], profile=JOURNAL_PROFILE_02)
            stores = state['stores']
            if type(stores) is not dict:
                raise LocalPostgresError('local-postgresql-store-history-invalid')
            supervisor_events = self._journal.read()['events']
            target_reference = self._custodian._public_reference(target)
            has_pending_prefix = False
            for key, store_state in stores.items():
                if (type(key) is not tuple or len(key) != 6
                        or store_state.get('key') != key
                        or store_state.get('status') not in
                            ('reserved', 'observed-committed', 'confirmed')):
                    raise LocalPostgresError(
                        'local-postgresql-store-history-incomplete')
                record = store_state['reservation']
                store_descriptor = record['store']
                expected_external_key = (
                    target_reference['registrationId'], self._provider_id,
                    self._bound_installation_id, store_descriptor['profile'],
                    store_descriptor['storeId'], store_descriptor['schemaName'])
                if (key != expected_external_key
                        or record['targetCustody'] != target_reference):
                    raise LocalPostgresError(
                        'local-postgresql-store-history-identity-mismatch')
                reserved = next((event for event in external_doc['events']
                                 if event['kind'] == 'originals-store-reserved'
                                 and event['payload']['reservation']['reservationId']
                                     == store_state['id']), None)
                typed = [event for event in supervisor_events
                         if event['kind'] == 'originals-store-creation-intent'
                         and event['payload'].get('reservationDigest')
                             == store_state['reservationDigest']]
                typed_confirmation = [event for event in supervisor_events
                                      if event['kind']
                                          == 'originals-store-creation-confirmed'
                                      and event['payload'].get('reservationDigest')
                                          == store_state['reservationDigest']]
                if reserved is None:
                    raise LocalPostgresError(
                        'local-postgresql-store-history-supervisor-mismatch')
                effect_key = ['native-store-creation', record['providerId'],
                              record['store']['profile'], record['store']['storeId']]
                effects = [event for event in supervisor_events
                           if event['kind'] == 'native-effect-intent'
                           and event['payload'].get('scope') == 'native-store-creation'
                           and event['payload'].get('requestDigest')
                               == record['creationRequestDigest']
                           and event['payload'].get('effectKey') == effect_key]
                if store_state.get('status') != 'confirmed':
                    # Registration classifies prefixes without Core rehydration
                    # or journal writes. Those actions belong to the bounded
                    # store-lease continuation after native absence/authority
                    # has been observed.
                    matching_typed = [event for event in typed
                                      if event['payload'].get(
                                          'custodianReservedEventDigest')
                                          == reserved['recordDigest']
                                      and event['payload'].get('creationRequestDigest')
                                          == record['creationRequestDigest']
                                      and event['payload'].get('creationApprovalDigest')
                                          == record['creationApprovalDigest']]
                    same_key_effects = [event for event in supervisor_events
                                        if event['kind'] == 'native-effect-intent'
                                        and event['payload'].get('scope')
                                            == 'native-store-creation'
                                        and event['payload'].get('effectKey')
                                            == effect_key]
                    same_key_typed = []
                    for event in supervisor_events:
                        if event['kind'] != 'originals-store-creation-intent':
                            continue
                        other = event['payload'].get('reservation')
                        if (type(other) is dict and type(other.get('store')) is dict
                                and type(other.get('targetCustody')) is dict
                                and (other['targetCustody'].get('registrationId'),
                                     other.get('providerId'),
                                     other.get('installationId'),
                                     other['store'].get('profile'),
                                     other['store'].get('storeId'),
                                     other['store'].get('schemaName'))
                                    == key
                                and event['payload'].get('reservationDigest')
                                    != store_state['reservationDigest']):
                            same_key_typed.append(event)
                    if (len(typed) > 1 or len(effects) > 1
                            or typed_confirmation
                            or (typed and len(matching_typed) != 1)
                            or len(same_key_typed) != 0
                            or (not typed and bool(effects))
                            or (same_key_effects and len(effects) != 1)):
                        raise LocalPostgresError(
                            'local-postgresql-store-history-supervisor-mismatch')
                    if typed:
                        pending_typed = typed[0]
                        matching_effects = [event for event in effects
                                            if event['sequence']
                                                == pending_typed['sequence'] + 1
                                            and event['previousDigest']
                                                == pending_typed['recordDigest']
                                            and event['payload'].get('approvalDigest')
                                                == record['creationApprovalDigest']
                                            and event['payload'].get('requestDigest')
                                                == record['creationRequestDigest']]
                        if effects and len(matching_effects) != 1:
                            raise LocalPostgresError(
                                'local-postgresql-store-history-supervisor-mismatch')
                    if (store_state.get('status') == 'observed-committed'
                            and (len(typed) != 1 or len(effects) != 1
                                 or len(matching_typed) != 1
                                 or len(matching_effects) != 1
                                 or store_state.get('observedSupervisorIntentDigest')
                                    != effects[0]['recordDigest']
                                 or store_state.get('nativeReceiptDigest')
                                    != store_state['observations'][-1]['payload'].get(
                                        'nativeReceiptDigest'))):
                        raise LocalPostgresError(
                            'local-postgresql-store-history-supervisor-mismatch')
                    has_pending_prefix = True
                    continue
                if (reserved is None or len(typed) != 1 or len(effects) != 1
                        or len(typed_confirmation) != 1):
                    raise LocalPostgresError(
                        'local-postgresql-store-history-supervisor-mismatch')
                typed_event, effect_event = typed[0], effects[0]
                typed_payload = typed_event['payload']
                effect = effect_event['payload']
                if (typed_payload.get('custodianReservedEventDigest')
                        != reserved['recordDigest']
                        or typed_payload.get('creationRequestDigest')
                            != record['creationRequestDigest']
                        or typed_payload.get('creationApprovalDigest')
                            != record['creationApprovalDigest']
                        or typed_event['sequence'] + 1 != effect_event['sequence']
                        or effect_event['previousDigest'] != typed_event['recordDigest']
                        or effect.get('approvalDigest')
                            != record['creationApprovalDigest']
                        or effect.get('requestDigest')
                            != record['creationRequestDigest']):
                    raise LocalPostgresError(
                        'local-postgresql-store-history-supervisor-mismatch')
                receipt_digest = store_state.get('nativeReceiptDigest')
                typed_confirmation_payload = typed_confirmation[0]['payload']
                native_confirmation = next((event for event in supervisor_events
                                            if event['kind'] == 'native-effect-confirmed'
                                            and event['payload'].get('reservationId')
                                                == effect.get('reservationId')), None)
                if (typed_confirmation_payload.get('nativeReceiptDigest') != receipt_digest
                        or native_confirmation is None
                        or native_confirmation['payload'].get('receiptDigest') != receipt_digest):
                    raise LocalPostgresError(
                        'local-postgresql-store-history-native-mismatch')
                request_value = reserved['payload']['request']
                intent_bytes = _canonical(request_value)
                if (hashlib.sha256(intent_bytes).hexdigest()
                        != record['creationRequestDigest']):
                    raise LocalPostgresError(
                        'local-postgresql-store-history-request-mismatch')
                target_fields = {
                    'supervisorId': self._supervisor_id,
                    'custodianId': self._custodian_id,
                    'providerId': self._provider_id,
                    'installationId': self._bound_installation_id,
                }
                saved = self._owner_core._ledger.find_original_request(
                    scope='native-store-creation',
                    intent_digest=record['creationRequestDigest'],
                    target=target_fields, intent=request_value, intent_bytes=intent_bytes,
                    effect_key=('native-store-creation', record['providerId'],
                                record['store']['profile'], record['store']['storeId']),
                    context=self._authority_context)
                if saved.get('approvalId') != effect['approvalId']:
                    raise LocalPostgresError(
                        'local-postgresql-store-history-approval-mismatch')
                request = self._owner_core._recover_original_request(
                    'native-store-creation', intent_bytes,
                    context=self._authority_context,
                    expected_approval_id=effect['approvalId'])
                approval = self._owner_core._recover_verified_approval(request)
                self._owner_core._resolve_verified_approval(
                    approval, original_request=request, scope='native-store-creation',
                    intent_digest=record['creationRequestDigest'])
                expected_key = ('native-store-creation', record['providerId'],
                                record['store']['profile'], record['store']['storeId'])
                if (request.effect_key != expected_key
                        or approval.approval_digest != record['creationApprovalDigest']
                        or approval.approval_id != effect['approvalId']):
                    raise LocalPostgresError(
                        'local-postgresql-store-history-approval-mismatch')
                owner_state = self._owner_core.observe_original_request(
                    self._authority_context, request.effect_key)
                _core_pending, core_outcome = self._owner_core._ledger.observe_effect(
                    approval.approval_id)
                if (owner_state.effect_status != 'confirmed'
                        or owner_state.effect_receipt_digest != receipt_digest
                        or core_outcome is None or core_outcome.get('status') != 'confirmed'
                        or core_outcome.get('reservationDigest')
                            != _digest(effect_event['recordDigest'])
                        or core_outcome.get('receiptDigest') != receipt_digest):
                    raise LocalPostgresError(
                        'local-postgresql-store-history-core-mismatch')
                self._require_original_control_lease()
            if has_pending_prefix:
                self._pending_original_store_recovery = (
                    target, self._custodian, self._custodian_id,
                    self._authority_context, os.getpid(), target_reference)
            else:
                self._pending_original_store_recovery = None
            return has_pending_prefix
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- no custodian from incomplete cross-chain state
            raise LocalPostgresError(
                'local-postgresql-store-history-unavailable') from None

    def _recover_original_store_effect(
            self, target: object, external_doc: dict[str, Any],
            store_state: dict[str, Any], reserved_event: dict[str, Any], *,
            readonly_budget: _OriginalStoreReadonlyBudget | None = None,
            recovery_observation: _VerifiedOriginalStoreRecoveryObservation | None = None,
            absence_authorization: _VerifiedOriginalStoreAbsence | None = None
            ) -> tuple[_NativeEffectReservation | None,
                       _VerifiedNativeEffectOutcome | None, object]:
        """Reconstruct original authority; create missing intents only after proof."""
        if (self._journal is None or not self._is_original_store_recovery_target(target)
                or type(external_doc) is not dict
                or not any(event is reserved_event
                           or event == reserved_event
                           for event in external_doc.get('events', []))
                or reserved_event['payload']['reservationDigest']
                    != store_state['reservationDigest']):
            raise LocalPostgresError('local-postgresql-store-recovery-intent-mismatch')
        events = self._journal.read()['events']
        reservation_record = store_state['reservation']
        store = reservation_record['store']
        selected_effect_key = ['native-store-creation', reservation_record['providerId'],
                               store['profile'], store['storeId']]
        same_store_effects = [event for event in events
                              if event['kind'] == 'native-effect-intent'
                              and event['payload'].get('scope') == 'native-store-creation'
                              and event['payload'].get('effectKey') == selected_effect_key]
        effects = [event for event in same_store_effects
                   if event['payload'].get('requestDigest')
                      == reservation_record['creationRequestDigest']]
        typed = [event for event in events
                 if event['kind'] == 'originals-store-creation-intent'
                 and event['payload'].get('reservationDigest')
                    == store_state['reservationDigest']]
        if len(effects) > 1 or len(typed) > 1 or (same_store_effects and not effects):
            raise LocalPostgresError('local-postgresql-store-recovery-intent-conflict')
        # Another store's typed intent is legal. A duplicate/conflicting intent
        # for this exact six-part external key is not.
        selected_key = tuple(reservation_record['targetCustody'][field]
                             for field in ('registrationId',)) + (
            reservation_record['providerId'], reservation_record['installationId'],
            store['profile'], store['storeId'], store['schemaName'])
        for event in events:
            if event['kind'] != 'originals-store-creation-intent':
                continue
            payload = event['payload']
            other = payload.get('reservation')
            if type(other) is not dict:
                continue
            other_store = other.get('store')
            other_target = other.get('targetCustody')
            if (type(other_store) is dict and type(other_target) is dict
                    and tuple(other_target.get(field) for field in ('registrationId',))
                        + (other.get('providerId'), other.get('installationId'),
                           other_store.get('profile'), other_store.get('storeId'),
                           other_store.get('schemaName')) == selected_key
                    and payload.get('reservationDigest') != store_state['reservationDigest']):
                raise LocalPostgresError('local-postgresql-store-recovery-intent-conflict')
        if typed:
            typed_event = typed[0]
            if (typed_event['payload'].get('custodianReservedEventDigest')
                    != reserved_event['recordDigest']
                    or typed_event['payload'].get('creationRequestDigest')
                        != reservation_record['creationRequestDigest']
                    or typed_event['payload'].get('creationApprovalDigest')
                        != reservation_record['creationApprovalDigest']):
                raise LocalPostgresError('local-postgresql-store-recovery-intent-mismatch')
        elif absence_authorization is not None:
            if (type(absence_authorization) is not _VerifiedOriginalStoreAbsence
                    or absence_authorization._issuer is not self
                    or absence_authorization._budget is not readonly_budget):
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-absence-unverified')
            self._require_original_store_readonly_budget(absence_authorization._budget)
            if (absence_authorization._budget._issuer is not self
                    or absence_authorization._reservation_digest
                        != store_state['reservationDigest']
                    or absence_authorization._schema_name
                        != reservation_record['store']['schemaName']
                    or type(recovery_observation)
                        is not _VerifiedOriginalStoreRecoveryObservation
                    or recovery_observation._issuer is not self
                    or recovery_observation._budget is not readonly_budget
                    or recovery_observation._request
                        is not absence_authorization._budget._request
                    or recovery_observation._reservation_digest
                        != store_state['reservationDigest']):
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-absence-unverified')
            if same_store_effects:
                raise LocalPostgresError('local-postgresql-store-recovery-intent-conflict')
        request_value = reserved_event['payload']['request']
        intent_bytes = _canonical(request_value)
        effect_key = ('native-store-creation', reservation_record['providerId'],
                      reservation_record['store']['profile'],
                      reservation_record['store']['storeId'])
        target_fields = {
            'supervisorId': self._supervisor_id, 'custodianId': self._custodian_id,
            'providerId': self._provider_id, 'installationId': self._bound_installation_id,
        }
        try:
            saved = self._owner_core._ledger.find_original_request(
                scope='native-store-creation',
                intent_digest=reservation_record['creationRequestDigest'],
                target=target_fields, intent=request_value, intent_bytes=intent_bytes,
                effect_key=effect_key, context=self._authority_context)
            approval_id = saved['approvalId']
            request = self._owner_core._recover_original_request(
                'native-store-creation', intent_bytes, context=self._authority_context,
                expected_approval_id=approval_id)
            approval = self._owner_core._recover_verified_approval(request)
            self._owner_core._resolve_verified_approval(
                approval, original_request=request, scope='native-store-creation',
                intent_digest=reservation_record['creationRequestDigest'])
        except Exception:  # noqa: BLE001 -- only the exact original signed request may resume
            raise LocalPostgresError('local-postgresql-store-recovery-approval-unavailable') from None
        if (request.effect_key != effect_key
                or approval.approval_digest != reservation_record['creationApprovalDigest']):
            raise LocalPostgresError('local-postgresql-store-recovery-approval-mismatch')
        if (absence_authorization is not None
                and (absence_authorization._budget._request._intent_bytes != intent_bytes
                     or absence_authorization._budget._target is not target
                     or absence_authorization._proof_bytes
                        != _canonical(json.loads(absence_authorization._proof_bytes)))):
            raise LocalPostgresError(
                'local-postgresql-store-recovery-absence-unverified')
        if not typed and absence_authorization is None:
            # The external reservation is durable, but no supervisor intent is
            # inferred from it.  The caller must first finish its bounded live
            # authority and complete-absence observation before any append.
            if effects:
                raise LocalPostgresError('local-postgresql-store-recovery-intent-mismatch')
            return None, None, request
        if not typed and typed_event is None:
            if absence_authorization is None:
                raise LocalPostgresError('local-postgresql-store-recovery-absence-unverified')
            typed_event = self._append_supervisor_journal(
                'originals-store-creation-intent', {
                    'purpose': store_state['purpose'],
                    'reservation': reservation_record,
                    'reservationDigest': store_state['reservationDigest'],
                    'custodianReservedEventDigest': reserved_event['recordDigest'],
                    'creationRequestDigest': reservation_record['creationRequestDigest'],
                    'creationApprovalDigest': reservation_record['creationApprovalDigest'],
                    'nativeAuthorityEvidenceDigest':
                        reservation_record['nativeAuthorityEvidenceDigest'],
                })
        if effects:
            effect = effects[0]
            if (effect['payload'].get('requestDigest')
                    != reservation_record['creationRequestDigest']
                    or effect['payload'].get('approvalId') != approval.approval_id
                    or effect['payload'].get('approvalDigest') != approval.approval_digest
                    or effect['payload'].get('effectKey') != list(effect_key)
                    or effect['sequence'] != typed_event['sequence'] + 1
                    or effect['previousDigest'] != typed_event['recordDigest']):
                raise LocalPostgresError('local-postgresql-store-recovery-intent-mismatch')
            try:
                self._owner_core._bind_effect_digest(
                    approval, effect['recordDigest'])
            except Exception:  # noqa: BLE001 -- restore only the original exact binding
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-binding-unresolved') from None
            return self._recover_original_native_effect(
                'native-store-creation', target=target,
                expected_request_digest=reservation_record['creationRequestDigest'],
                expected_effect_key=effect_key)
        if absence_authorization is None:
            return None, None, request
        self._make_native_effect_reservation(
            request, approval, 'native-store-creation', effect_key,
            self._profile.purpose, target, typed_event, intent_bytes)
        try:
            self._owner_core._bind_effect_digest(
                approval, _digest(self._journal.read()['events'][-1]['recordDigest']))
        except Exception:  # noqa: BLE001 -- preserve the original intent without DDL
            raise LocalPostgresError('local-postgresql-store-recovery-binding-unresolved') from None
        return self._recover_original_native_effect(
            'native-store-creation', target=target,
            expected_request_digest=reservation_record['creationRequestDigest'],
            expected_effect_key=effect_key)

    def _is_original_store_recovery_target(self, target: object) -> bool:
        if target is self._custody_handle and self._custodian is not None:
            return True
        pending = getattr(self, '_pending_original_store_recovery', None)
        return (type(pending) is tuple and len(pending) == 6
                and pending[0] is target and pending[1] is self._custodian
                and pending[2] == self._custodian_id
                and pending[3] is self._authority_context
                and pending[4] == os.getpid()
                and type(pending[5]) is dict
                and self._custodian is not None and self._journal is not None)

    def _require_original_store_recovery_target(self, target: object) -> None:
        self._require_original_control_lease(operation_kind='store')
        if not self._is_original_store_recovery_target(target):
            raise LocalPostgresError('local-postgresql-store-recovery-unverified')
        pending = self._pending_original_store_recovery
        if pending is not None and pending[0] is target:
            try:
                reference = self._custodian._public_reference(target)
                verified = self._custodian._resolve_target_custody(target)
            except Exception:  # noqa: BLE001 -- private pending handle is revalidated
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-unverified') from None
            if reference != pending[5] or verified.reference != pending[5]:
                raise LocalPostgresError('local-postgresql-store-recovery-unverified')

    def prepare_original_registration_reattachment(
            self, target: object) -> _NativeEffectReservation:
        """Prepare reconciliation of the exact signed registration, without effects.

        The custody journal and opaque handle are reconstructed through the
        enrolled owner resolver.  Journal payloads are inputs to verification,
        never authority to mint a custody capability.
        """
        self._require_control_operation('registration-recover')
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

        self._registration_recovery_dispatches[id(reservation)] = (
            reservation, target, request, outcome, registration, payload, owner_approved)
        return reservation

    def execute_original_registration_reattachment(
            self, reservation: object, effect_handle: object) -> object:
        """Run the exact recovered registration after facade ledger binding."""
        self._require_control_operation('registration-recover')
        recovery = self._registration_recovery_dispatches.get(id(reservation))
        if (type(reservation) is not _NativeEffectReservation
                or recovery is None or recovery[0] is not reservation
                or self._native_effect_reservations.get(id(reservation)) is not reservation
                or reservation._supervisor is not self):
            raise LocalPostgresError('local-postgresql-registration-recovery-unverified')
        (_reservation, target, request, outcome, registration, payload,
         owner_approved) = recovery
        self._require_bound_pending_effect(
            reservation, effect_handle,
            mode='recover' if outcome is not None else 'execute')
        if (type(target) is not _OriginalNativeTarget or target._issuer is not self
                or self._native_targets.get(id(target)) is not target
                or self._journal is None or self._launch is None):
            raise LocalPostgresError('local-postgresql-original-target-unverified')
        from .ingress_custody import (
            ExternalCustodyJournal,
            _bind_owner_registration_resolver,
            _bootstrap_original_02_target_custodian,
            _bootstrap_local_target_custodian,
        )
        control = self._target_paths['control']
        resolver = _bind_owner_registration_resolver(
            self, self, self._authority_context)
        if self._target_custody_journal_birth is not None:
            custodian = _bootstrap_original_02_target_custodian(
                self._target_custody_journal_birth, custodian_id=self._custodian_id,
                provider_id=self._provider_id, resolver=resolver,
                control_lease=self._require_original_control_lease(
                    operation_kind='registration-recover'),
                operation_kind='registration-recover')
        else:
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
            if outcome is not None:
                if outcome.status != 'confirmed':
                    raise LocalPostgresError('local-postgresql-registration-outcome-mismatch')
                handle = custodian.reattach_confirmed_target(
                    owner_request, control_lease=self._require_original_control_lease())
            else:
                handle = custodian.register_target(
                    owner_request, control_lease=self._require_original_control_lease())
            reference = custodian._public_reference(handle)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError(
                'local-postgresql-registration-outcome-unresolved') from None
        self._resolver = resolver
        self._custodian = custodian
        self._custody_handle = handle
        try:
            pending_store_recovery = self._validate_original_store_custody_history(handle)
        except Exception:
            self._custodian = None
            self._custody_handle = None
            self._pending_original_store_recovery = None
            self._resolver = None
            raise
        if pending_store_recovery:
            self._custody_handle = None
        if owner_approved is None and outcome is None:
            self._append_supervisor_journal('owner-registration-approved', {
                'registrationId': registration['registrationId'],
                'payloadDigest': _digest(payload),
                'approvalId': reservation.approval_id,
                'approvalDigest': reservation.approval_digest,
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
            self._record_native_effect_outcome(
                reservation, 'confirmed', receipt, effect_handle)
        elif (outcome.status != 'confirmed'
              or outcome.receipt_digest != expected_receipt):
            raise LocalPostgresError('local-postgresql-registration-outcome-mismatch')
        else:
            owner_state = self._owner_core.observe_original_request(
                self._authority_context, request.effect_key)
            if (owner_state.effect_status not in ('effect-pending', 'confirmed')
                  or (owner_state.effect_status == 'confirmed'
                      and owner_state.effect_receipt_digest != outcome.receipt_digest)):
                raise LocalPostgresError('local-postgresql-registration-outcome-mismatch')
        self._registration_recovery_dispatches.pop(id(reservation), None)
        # A valid incomplete original-store prefix grants only the private
        # recovery route; do not return its TargetCustody capability.
        return reference if pending_store_recovery else handle

    def prepare_target_creation(self) -> tuple[_PendingTargetCreation, object]:
        """Reserve the original target identity and signed request without native effects."""
        self._require_original_control_lease(operation_kind='target-prepare')
        if os.geteuid() == 0:
            raise LocalPostgresError('local-postgresql-nonroot-owner-required')
        if self._pending_creations or self._active_creation is not None:
            raise LocalPostgresError('local-postgresql-original-creation-already-reserved')
        postgres, initdb = self._validate_installation_binaries()
        self._require_original_control_lease(operation_kind='target-prepare')
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
        self._journal = self._select_supervisor_journal()
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
        from .owner_bootstrap import _owner_context_journal_metadata
        journal_metadata = _owner_context_journal_metadata(self._authority_context)
        journal_descriptor = journal_metadata['supervisorJournal']
        request_value = {
            'profile': ('umf.local-postgresql-create-request/0.1'
                        if journal_descriptor is None
                        else 'umf.local-postgresql-create-request/0.2'),
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
        if journal_descriptor is not None:
            request_value['supervisorJournalBirthDigest'] = journal_descriptor['birthDigest']
            request_value['ownerBootstrapContextDigest'] = (
                journal_metadata['ownerBootstrapContextDigest'])
        request_bytes = _canonical(request_value)
        try:
            self._require_original_control_lease(operation_kind='target-prepare')
            request = self._owner_core.prepare_request(
                'local-target-creation', request_bytes, context=self._authority_context)
            self._require_original_control_lease(operation_kind='target-prepare')
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
        self._require_original_control_lease(operation_kind='target-prepare')
        return pending, request

    def export_owner_signing_request(self, request: object) -> dict[str, Any]:
        pending = next((item for item in self._pending_creations.values()
                        if item._request is request), None)
        if pending is None:
            raise LocalPostgresError('local-postgresql-owner-request-not-original')
        try:
            return self._owner_core.export_signing_request(request)
        except Exception:  # noqa: BLE001 - redact signer details at the public boundary.
            raise LocalPostgresError('local-postgresql-owner-request-unavailable') from None

    def reserve_target_creation(
            self, pending: object, approval: object) -> _NativeEffectReservation:
        """Durably reserve an already verified creation approval; perform no DDL."""
        self._require_original_control_lease(operation_kind='target-apply')
        if type(pending) is not _PendingTargetCreation or pending._issuer is not self:
            raise LocalPostgresError('local-postgresql-original-creation-required')
        if self._pending_creations.get(id(pending)) is not pending or self._active_creation is not None:
            raise LocalPostgresError('local-postgresql-original-creation-not-reserved')
        request = pending._request
        try:
            self._owner_core._resolve_verified_approval(
                approval, original_request=request, scope='local-target-creation',
                intent_digest=request._intent_digest)
        except Exception:  # noqa: BLE001 - redact private authority failure details.
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
        self._append_supervisor_journal('creation-intent', intent)
        effect_key = ('local-target-creation', self._supervisor_id,
                      value['clusterId'])
        reservation = self._make_native_effect_reservation(
            request, approval, 'local-target-creation', effect_key,
            self._profile.purpose, None, self._journal.read()['events'][-1],
            pending._request_bytes)
        self._native_effect_reservations[id(reservation)] = reservation
        self._reserved_creation_values[id(reservation)] = (reservation, pending_values[1])
        self._pending_creations.pop(id(pending), None)
        self._pending_creation_values.pop(id(pending), None)
        self._require_original_control_lease(operation_kind='target-apply')
        return reservation

    def execute_target_creation(self, pending: object, reservation: object,
                                effect_handle: object) -> object:
        """Execute only the exact reservation returned for this pending creation."""
        self._require_original_control_lease(operation_kind='target-apply')
        if (type(pending) is not _PendingTargetCreation or pending._issuer is not self
                or type(reservation) is not _NativeEffectReservation
                or self._native_effect_reservations.get(id(reservation)) is not reservation
                or reservation._supervisor is not self
                or reservation._request is not pending._request
                or reservation._scope != 'local-target-creation'
                or self._active_creation is not None):
            raise LocalPostgresError('local-postgresql-original-creation-not-reserved')
        self._require_bound_pending_effect(reservation, effect_handle)
        # The reservation is already durable.  The public owner session must
        # bind it to its independent ledger before this native stage is called.
        pending_values = self._creation_values_for_reservation(reservation)
        values = pending_values
        try:
            self._require_original_control_lease(operation_kind='target-apply')
            _private_directory(values['control'], create=True)
            self._require_original_control_lease(operation_kind='target-apply')
            _private_directory(values['data'], create=True)
            self._require_original_control_lease(operation_kind='target-apply')
            _write_private(values['pwPath'], self._maintenance_password + b'\n')
            self._require_original_control_lease(operation_kind='target-apply')
            _write_private(values['credentialPath'], self._maintenance_password + b'\n')
            self._require_original_control_lease(operation_kind='target-apply')
            _write_private(values['identPath'], b'')
            target = self._run_target_creation(pending, reservation, values, effect_handle)
            self._require_original_control_lease(operation_kind='target-apply')
        except BaseException:  # noqa: TRY203 - preserve the original effect failure and unresolved journal.
            # The effect is not called aborted from an exception. The original
            # journal remains authoritative until explicit observation resolves it.
            raise
        return target

    def _creation_values_for_reservation(
            self, reservation: _NativeEffectReservation) -> dict[str, Any]:
        # The value set is moved out of the preparation registry at reservation
        # time; retain it under the exact reservation identity until execution.
        values = self._reserved_creation_values.get(id(reservation))
        if values is None or values[0] is not reservation:
            raise LocalPostgresError('local-postgresql-original-creation-not-reserved')
        return values[1]

    def _verify_original_creation_values(self, pending: _PendingTargetCreation,
                                         reservation: _NativeEffectReservation,
                                         values: dict[str, Any]) -> None:
        """Tie native paths and bytes to the exact originally signed request."""
        reserved = self._reserved_creation_values.get(id(reservation))
        if (type(pending) is not _PendingTargetCreation or pending._issuer is not self
                or pending._request is not reservation._request
                or reserved is None or reserved[0] is not reservation
                or reserved[1] is not values
                or self._native_effect_reservations.get(id(reservation)) is not reservation
                or type(values.get('request')) is not dict
                or _canonical(values['request']) != pending._request_bytes):
            raise LocalPostgresError('local-postgresql-original-creation-not-reserved')
        request = values['request']
        expected = {
            'controlDirectory': values['control'], 'dataDirectory': values['data'],
            'postgresPath': values['postgres'], 'initdbPath': values['initdb'],
            'configDigest': hashlib.sha256(values['config']).hexdigest(),
            'hbaDigest': hashlib.sha256(values['hba']).hexdigest(),
        }
        if (any(request[key] != str(value) if isinstance(value, Path)
                else request[key] != value for key, value in expected.items())
                or values['config'] != _render_config(
                    self._profile.port, values['hbaPath'], values['identPath'])
                or values['hba'] != _render_hba(request['maintenanceName'])
                or values['configPath'] != values['control'] / 'postgresql.conf'
                or values['hbaPath'] != values['control'] / 'pg_hba.conf'
                or values['identPath'] != values['control'] / 'pg_ident.conf'
                or values['pwPath'] != values['control'] / 'initdb.pwfile'):
            raise LocalPostgresError('local-postgresql-original-creation-not-reserved')

    def _run_target_creation(self, pending: _PendingTargetCreation,
                             reservation: _NativeEffectReservation,
                             values: dict[str, Any],
                             effect_handle: object) -> _OriginalNativeTarget:
        self._require_native_effect_operation('target-apply')
        reserved = self._reserved_creation_values.get(id(reservation))
        if (type(pending) is not _PendingTargetCreation
                or pending._issuer is not self
                or type(reservation) is not _NativeEffectReservation
                or self._native_effect_reservations.get(id(reservation)) is not reservation
                or self._active_creation is not None
                or pending._request is not reservation._request
                or reserved is None or reserved[0] is not reservation
                or reserved[1] is not values):
            raise LocalPostgresError('local-postgresql-original-creation-not-reserved')
        self._verify_original_creation_values(pending, reservation, values)
        self._require_bound_pending_effect(reservation, effect_handle)
        request = values['request']
        self._active_creation = pending
        self._write_creation_config(values, pending, reservation, effect_handle)
        initdb_argv = [str(values['initdb']), '-D', str(values['data']),
                       '-U', request['maintenanceName'], '--encoding=UTF8',
                       '--locale=C', '--auth-local=reject',
                       '--auth-host=scram-sha-256',
                       f"--pwfile={values['pwPath']}"]
        self._run_bounded_child(initdb_argv, values['control'] / 'initdb.log', 180,
                                allowed_binaries={str(values['initdb']),
                                                  str(values['postgres'])},
                                reservation=reservation, effect_handle=effect_handle)
        pg_version = values['data'] / 'PG_VERSION'
        if not pg_version.is_file() or pg_version.read_text().strip() != '18':
            raise LocalPostgresError('local-postgresql-initdb-result-invalid')
        data_stat = os.stat(values['data'], follow_symlinks=False)
        assert self._journal is not None
        initdb_receipt = {'argv': initdb_argv, 'status': 'success', 'pgVersion': '18'}
        self._append_supervisor_journal('initdb-confirmed', {
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
                                values['configDigest'], values['hbaDigest'], launch_number=1,
                                reservation=reservation, effect_handle=effect_handle)
        receipt = {'profile': 'umf.local-supervisor-target-creation-receipt/0.1',
                   'clusterId': request['clusterId'],
                   'incarnationId': request['incarnationId'],
                   'requestDigest': reservation.request_digest,
                   'approvalDigest': reservation.approval_digest,
                   'initdbReceiptDigest': _digest(initdb_receipt),
                   'launchReceiptDigest': self._journal.read()['events'][-1]['recordDigest'],
                   'purpose': self._profile.purpose}
        self._record_native_effect_outcome(
            reservation, 'confirmed', receipt, effect_handle)
        target = _OriginalNativeTarget(
            _BOOTSTRAP_ISSUER_SEAL, self, pending, reservation, request['clusterId'])
        self._native_targets[id(target)] = target
        self._active_creation = None
        return target

    def prepare_original_principals(self, target: object
                                    ) -> tuple[_PreparedOriginalPrincipals, object]:
        """Observe the fresh bootstrap and reserve the exact principal-stage request."""
        self._require_original_control_lease(operation_kind='principals-prepare')
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
            self._require_original_control_lease(operation_kind='principals-prepare')
            request = self._owner_core.prepare_request(
                'native-principal-preparation', intent_bytes,
                context=self._authority_context)
            self._require_original_control_lease(operation_kind='principals-prepare')
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-principal-request-unavailable') from None
        self._append_supervisor_journal('principal-request-prepared', {
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
                or self._principal_preparations.get(id(prepared)) is not prepared
                or type(prepared._target) is not _OriginalNativeTarget
                or prepared._target._issuer is not self
                or self._native_targets.get(id(prepared._target)) is not prepared._target):
            raise LocalPostgresError('local-postgresql-principal-request-not-original')
        try:
            return self._owner_core.export_signing_request(prepared._request)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-principal-request-unavailable') from None

    def reserve_original_principals(self, prepared: object,
                                    approval: object) -> _NativeEffectReservation:
        """Reserve the verified principal operation without running native DDL."""
        self._require_original_control_lease(operation_kind='principals-apply')
        if (type(prepared) is not _PreparedOriginalPrincipals
                or prepared._issuer is not self
                or self._principal_preparations.get(id(prepared)) is not prepared
                or prepared._target._issuer is not self):
            raise LocalPostgresError('local-postgresql-principal-request-not-original')
        if id(prepared) in self._principal_dispatches:
            raise LocalPostgresError('local-postgresql-principal-outcome-unresolved')
        request = prepared._request
        try:
            self._owner_core._resolve_verified_approval(
                approval, original_request=request, scope='native-principal-preparation',
                intent_digest=request._intent_digest)
        except Exception:  # noqa: BLE001 - redact private authority failure details.
            raise LocalPostgresError('local-postgresql-principal-approval-invalid') from None
        intent_value = prepared._values['intent']
        assert self._journal is not None
        event = self._journal.read()['events'][-1]
        effect_key = ('native-principal-preparation', self._supervisor_id,
                      intent_value['preparationId'])
        reservation = self._make_native_effect_reservation(
            request, approval, 'native-principal-preparation', effect_key,
            self._profile.purpose, prepared._target, event, prepared._request._intent_bytes)
        # Persist the in-process dispatch fence before returning the reservation.
        self._principal_dispatches[id(prepared)] = reservation
        self._native_effect_reservations[id(reservation)] = reservation
        return reservation

    def execute_original_principals(self, prepared: object, reservation: object,
                                    effect_handle: object) -> dict[str, Any]:
        """Run native principal DDL only after the session facade ledger-binds it."""
        self._require_original_control_lease(operation_kind='principals-apply')
        if (type(prepared) is not _PreparedOriginalPrincipals
                or prepared._issuer is not self
                or self._principal_preparations.get(id(prepared)) is not prepared
                or self._principal_dispatches.get(id(prepared)) is not reservation
                or type(reservation) is not _NativeEffectReservation
                or self._native_effect_reservations.get(id(reservation)) is not reservation
                or reservation._supervisor is not self
                or reservation._request is not prepared._request):
            raise LocalPostgresError('local-postgresql-principal-dispatch-unverified')
        self._require_bound_pending_effect(reservation, effect_handle)
        intent_value = prepared._values['intent']
        assert self._journal is not None
        self._append_supervisor_journal('principal-roles-intent', {
            'reservationId': reservation.reservation_id,
            'preparationId': intent_value['preparationId']})
        role_observation = self._apply_principal_role_transaction(
            prepared, reservation, effect_handle)
        role_digest = _digest(role_observation)
        self._append_supervisor_journal('principal-roles-confirmed', {
            'reservationId': reservation.reservation_id,
            'observationDigest': role_digest})
        self._append_supervisor_journal('principal-database-intent', {
            'reservationId': reservation.reservation_id,
            'databaseName': intent_value['applicationDatabase']['name']})
        database = self._create_application_database(prepared, effect_handle)
        self._append_supervisor_journal('principal-database-confirmed', {
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
        self._record_native_effect_outcome(
            reservation, 'confirmed', receipt, effect_handle)
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
        self._append_supervisor_journal('creation-finalized', {
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

    def prepare_original_principal_recovery(self, target: object) -> _NativeEffectReservation:
        """Reconstruct the exact original principal dispatch without native DDL."""
        self._require_control_operation('principals-recover')
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
            self._append_supervisor_journal('principal-roles-confirmed', {
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
            self._append_supervisor_journal('principal-database-confirmed', {
                'reservationId': reservation.reservation_id,
                'databaseOid': database['oid'],
                'systemIdentifier': database['systemIdentifier']})
        else:
            if database_intent is not None and (
                    database_intent['payload']['databaseName']
                    != intent['applicationDatabase']['name']):
                raise LocalPostgresError('local-postgresql-database-intent-mismatch')
            if database_intent is None:
                self._append_supervisor_journal('principal-database-intent', {
                    'reservationId': reservation.reservation_id,
                    'databaseName': intent['applicationDatabase']['name']})
        self._principal_recovery_dispatches[id(reservation)] = (
            reservation, prepared, outcome, role_observation, database, intent)
        return reservation

    def execute_original_principal_recovery(
            self, reservation: object, effect_handle: object) -> dict[str, Any]:
        """Continue only the original database substage after facade binding."""
        self._require_control_operation('principals-recover')
        recovery = self._principal_recovery_dispatches.get(id(reservation))
        if (type(reservation) is not _NativeEffectReservation
                or recovery is None or recovery[0] is not reservation
                or self._native_effect_reservations.get(id(reservation)) is not reservation
                or reservation._supervisor is not self):
            raise LocalPostgresError('local-postgresql-principal-recovery-unverified')
        self._require_bound_pending_effect(reservation, effect_handle, mode='recover')
        (_reservation, prepared, outcome, role_observation, database, intent) = recovery
        if (type(prepared) is not _PreparedOriginalPrincipals
                or prepared._issuer is not self
                or self._principal_preparations.get(id(prepared)) is not prepared
                or self._principal_dispatches.get(id(prepared)) is not reservation):
            raise LocalPostgresError('local-postgresql-principal-recovery-unverified')
        if outcome is not None:
            owner_state = self._owner_core.observe_original_request(
                self._authority_context, prepared._request.effect_key)
            if (outcome.status != 'confirmed' or database is None
                    or owner_state.effect_status not in ('effect-pending', 'confirmed')
                    or (owner_state.effect_status == 'confirmed'
                        and owner_state.effect_receipt_digest != outcome.receipt_digest)):
                raise LocalPostgresError('local-postgresql-principal-outcome-mismatch')
        if database is None:
            # A terminal native outcome is reconciliation-only. It can settle
            # the matching owner ledger row, but can never authorize a retry.
            if outcome is not None:
                raise LocalPostgresError('local-postgresql-principal-outcome-mismatch')
            database = self._observe_original_application_database(prepared)
            if database is None:
                database = self._create_application_database(prepared, effect_handle)
            assert self._journal is not None
            self._append_supervisor_journal('principal-database-confirmed', {
                'reservationId': reservation.reservation_id,
                'databaseOid': database['oid'],
                'systemIdentifier': database['systemIdentifier']})

        request = prepared._request
        role_digest = _digest(role_observation)
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
            self._record_native_effect_outcome(
                reservation, 'confirmed', receipt, effect_handle)
        elif outcome.status != 'confirmed' or outcome.receipt_digest != expected_receipt_digest:
            raise LocalPostgresError('local-postgresql-principal-outcome-mismatch')
        else:
            owner_state = self._owner_core.observe_original_request(
                self._authority_context, request.effect_key)
            if (owner_state.effect_status not in ('effect-pending', 'confirmed')
                    or (owner_state.effect_status == 'confirmed'
                        and owner_state.effect_receipt_digest != outcome.receipt_digest)):
                raise LocalPostgresError('local-postgresql-principal-outcome-mismatch')

        self._finalize_recovered_principal_receipt(
            reservation, receipt, role_observation, database)
        self._principal_recovery_dispatches.pop(id(reservation), None)
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
        self._require_control_operation('principals-recover')
        if (type(reservation) is not _NativeEffectReservation
                or self._native_effect_reservations.get(id(reservation)) is not reservation
                or reservation._supervisor is not self):
            raise LocalPostgresError('local-postgresql-principal-recovery-unverified')
        recovery = self._principal_recovery_dispatches.get(id(reservation))
        if (recovery is None or recovery[0] is not reservation
                or recovery[1]._request is not reservation._request):
            raise LocalPostgresError('local-postgresql-principal-recovery-unverified')
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
            self._append_supervisor_journal('creation-finalized', {
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
        self._require_original_control_lease(operation_kind='registration-prepare')
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
            self._require_original_control_lease(operation_kind='registration-prepare')
            request = self._owner_core.prepare_request(
                'local-target-registration', intent_bytes,
                context=self._authority_context)
            self._require_original_control_lease(operation_kind='registration-prepare')
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-registration-request-unavailable') from None
        self._append_supervisor_journal('registration-request-prepared', {
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
            return self._owner_core.export_signing_request(prepared._request)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-registration-request-unavailable') from None

    def reserve_target_registration(self, prepared: object,
                                    approval: object) -> _NativeEffectReservation:
        """Verify signed registration, then let the original custodian journal it."""
        self._require_original_control_lease(operation_kind='registration-apply')
        if (type(prepared) is not _PreparedTargetRegistration
                or prepared._issuer is not self
                or self._registration_preparations.get(id(prepared)) is not prepared
                or self._journal is None or self._launch is None
                or self._native_targets.get(id(prepared._target)) is not prepared._target):
            raise LocalPostgresError('local-postgresql-registration-request-not-original')
        if id(prepared) in self._registration_dispatches:
            raise LocalPostgresError('local-postgresql-registration-outcome-unresolved')
        request = prepared._request
        try:
            self._owner_core._resolve_verified_approval(
                approval, original_request=request, scope='local-target-registration',
                intent_digest=request._intent_digest)
        except Exception:  # noqa: BLE001 - redact private authority failure details.
            raise LocalPostgresError('local-postgresql-registration-approval-invalid') from None
        creation = prepared._registration
        # Preserve the approved operation before any further observations. If
        # verification succeeded but later source/target checks are uncertain,
        # the same prepared identity must not be replaced by a new request.
        self._append_supervisor_journal('registration-signature-verified', {
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
        self._native_effect_reservations[id(reservation)] = reservation
        return reservation

    def execute_target_registration(self, prepared: object, reservation: object,
                                    effect_handle: object) -> object:
        self._require_original_control_lease(operation_kind='registration-apply')
        if (type(prepared) is not _PreparedTargetRegistration
                or prepared._issuer is not self
                or self._registration_preparations.get(id(prepared)) is not prepared
                or self._registration_dispatches.get(id(prepared)) is not reservation
                or type(reservation) is not _NativeEffectReservation
                or self._native_effect_reservations.get(id(reservation)) is not reservation
                or reservation._supervisor is not self
                or reservation._request is not prepared._request):
            raise LocalPostgresError('local-postgresql-registration-dispatch-unverified')
        self._require_bound_pending_effect(reservation, effect_handle)
        creation = prepared._registration
        approval = reservation._approval
        payload = {**creation, 'ownerApproval': {
            'authorityId': approval.authority_id,
            'approvalId': approval.approval_id,
            'approvalDigest': approval.approval_digest,
            'scope': _OWNER_APPROVAL_SCOPE,
        }}
        from .ingress_custody import (
            ExternalCustodyJournal,
            _bind_owner_registration_resolver,
            _bootstrap_original_02_target_custodian,
            _bootstrap_local_target_custodian,
        )
        owner_request = OwnerEnrollmentRequest(
            _owner_capability_seal(), self, _OWNER_KIND)
        self._owner_payloads[creation['registrationId']] = payload
        self._handles[id(owner_request)] = (
            owner_request, payload, self._launch['nativeAttestation'])
        self._resolver = _bind_owner_registration_resolver(
            self, self, self._authority_context)
        control = self._target_paths['control']
        if self._target_custody_journal_birth is not None:
            self._custodian = _bootstrap_original_02_target_custodian(
                self._target_custody_journal_birth, custodian_id=self._custodian_id,
                provider_id=self._provider_id, resolver=self._resolver,
                control_lease=self._require_original_control_lease(
                    operation_kind='registration-apply'),
                operation_kind='registration-apply')
        else:
            custody_journal = ExternalCustodyJournal(
                control / 'target-custody.json', self._custodian_id)
            self._custodian = _bootstrap_local_target_custodian(
                custody_journal, self._custodian_id, self._provider_id, self._resolver)
        try:
            handle = self._custodian.register_target(
                owner_request, control_lease=self._require_original_control_lease())
            reference = self._custodian._public_reference(handle)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            # Registration may have committed in the external journal. Keep its
            # signed original intent and effect reservation for observation; do
            # not issue another registration identity or effect.
            raise LocalPostgresError('local-postgresql-registration-outcome-unresolved') from None
        self._append_supervisor_journal('owner-registration-approved', {
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
        self._record_native_effect_outcome(
            reservation, 'confirmed', receipt, effect_handle)
        self._custody_handle = handle
        try:
            pending_store_recovery = self._validate_original_store_custody_history(handle)
        except Exception:
            self._custodian = None
            self._custody_handle = None
            self._pending_original_store_recovery = None
            self._resolver = None
            raise
        if pending_store_recovery:
            self._custody_handle = None
        self._registration_preparations.pop(id(prepared), None)
        return reference if pending_store_recovery else handle

    def _apply_principal_role_transaction(
            self, prepared: _PreparedOriginalPrincipals,
            reservation: _NativeEffectReservation,
            effect_handle: object) -> dict[str, Any]:
        self._require_native_effect_operation('principals-apply')
        if (type(prepared) is not _PreparedOriginalPrincipals
                or self._principal_preparations.get(id(prepared)) is not prepared
                or self._principal_dispatches.get(id(prepared)) is not reservation
                or self._native_effect_reservations.get(id(reservation)) is not reservation):
            raise LocalPostgresError('local-postgresql-principal-dispatch-unverified')
        self._require_bound_pending_effect(reservation, effect_handle)
        values = prepared._values
        maintenance, controller, owner = (values['maintenance'], values['controller'],
                                            values['businessOwner'])
        try:
            with self._connect_maintenance('postgres') as connection, connection.transaction():
                    self._require_original_control_lease(operation_kind='principals-apply')
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

    def _create_application_database(self, prepared: _PreparedOriginalPrincipals,
                                     effect_handle: object) -> dict[str, Any]:
        lease = self._require_native_effect_operation('principals-apply', 'principals-recover')
        if (type(prepared) is not _PreparedOriginalPrincipals
                or prepared._issuer is not self
                or self._principal_preparations.get(id(prepared)) is not prepared):
            raise LocalPostgresError('local-postgresql-principal-preparation-unverified')
        reservation = self._principal_dispatches.get(id(prepared))
        if (type(reservation) is not _NativeEffectReservation
                or self._native_effect_reservations.get(id(reservation)) is not reservation
                or reservation._supervisor is not self
                or reservation._request is not prepared._request):
            raise LocalPostgresError('local-postgresql-principal-dispatch-unverified')
        if lease._operation_kind == 'principals-recover':
            recovery = self._principal_recovery_dispatches.get(id(reservation))
            if (recovery is None or recovery[0] is not reservation
                    or recovery[1] is not prepared or recovery[2] is not None
                    or recovery[4] is not None or recovery[3] is None):
                raise LocalPostgresError('local-postgresql-principal-recovery-unverified')
        else:
            dispatch = self._principal_dispatches.get(id(prepared))
            if dispatch is not reservation:
                raise LocalPostgresError('local-postgresql-principal-dispatch-unverified')
        state = self._owner_core.observe_original_request(
            self._authority_context, prepared._request.effect_key)
        if (state.effect_status != 'effect-pending'
                or state.approval_id != reservation.approval_id
                or state.intent_digest != reservation.request_digest):
            raise LocalPostgresError('local-postgresql-principal-effect-not-pending')
        self._require_bound_pending_effect(
            reservation, effect_handle,
            mode='recover' if lease._operation_kind == 'principals-recover' else 'execute')
        self._require_original_control_lease(lease)
        intent = prepared._values['intent']['applicationDatabase']
        try:
            with self._connect_maintenance('postgres') as connection:
                self._require_original_control_lease(lease)
                connection.autocommit = True
                self._require_original_control_lease(lease)
                connection.execute(
                    f'CREATE DATABASE {_quote_identifier(intent["name"])} '
                    f'OWNER {_quote_identifier(intent["ownerName"])} '
                    "ENCODING 'UTF8' LOCALE 'C'")
                self._require_original_control_lease(lease)
                row = connection.execute(
                    "SELECT d.oid,d.datname,d.datcollate,d.datctype,r.rolname "
                    "FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r "
                    "ON r.oid=d.datdba WHERE d.datname=%s", (intent['name'],)
                ).fetchone()
                system_identifier = connection.execute(
                    'SELECT system_identifier::pg_catalog.text FROM '
                    'pg_catalog.pg_control_system()').fetchone()[0]
            self._require_original_control_lease(lease)
            if (row is None or row[1] != intent['name'] or row[2] != 'C'
                    or row[3] != 'C' or row[4] != intent['ownerName']):
                raise LocalPostgresError('local-postgresql-database-observation-mismatch')
            return {'oid': int(row[0]), 'name': row[1],
                    'systemIdentifier': str(system_identifier)}
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-database-creation-outcome-unknown') from None

    def _write_creation_config(self, values: dict[str, Any],
                               pending: _PendingTargetCreation,
                               reservation: _NativeEffectReservation,
                               effect_handle: object) -> None:
        self._require_native_effect_operation('target-apply')
        if pending is not self._active_creation:
            raise LocalPostgresError('local-postgresql-original-creation-not-reserved')
        self._verify_original_creation_values(pending, reservation, values)
        self._require_bound_pending_effect(reservation, effect_handle)
        _write_private(values['configPath'], values['config'], exclusive=False)
        self._require_original_control_lease(operation_kind='target-apply')
        _write_private(values['hbaPath'], values['hba'], exclusive=False)
        self._require_original_control_lease(operation_kind='target-apply')

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
        control_lease = self._require_original_control_lease()
        if control_lease._operation_kind not in ('registration-apply',
                                                  'registration-recover'):
            raise LocalPostgresError('local-postgresql-control-lease-kind-mismatch')
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
        control_lease = self._require_original_control_lease()
        if control_lease._operation_kind not in ('registration-apply',
                                                  'registration-recover'):
            raise LocalPostgresError('local-postgresql-control-lease-kind-mismatch')
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
                           hba_digest: str, *, launch_number: int,
                           reservation: _NativeEffectReservation | None = None,
                           effect_handle: object = None) -> None:
        self._require_native_effect_operation('target-apply', 'target-recover',
                                              'process-recover')
        if launch_number == 1:
            pending = self._active_creation
            reserved = (self._reserved_creation_values.get(id(reservation))
                        if reservation is not None else None)
            if (pending is None or reserved is None or reserved[0] is not reservation
                    or self._native_effect_reservations.get(id(reservation)) is not reservation
                    or pending._request is not reservation._request
                    or Path(postgres) != reserved[1]['postgres']
                    or Path(data_dir) != reserved[1]['data']
                    or Path(config_path) != reserved[1]['configPath']
                    or Path(hba_path) != reserved[1]['hbaPath']
                    or Path(ident_path) != reserved[1]['identPath']
                    or config_digest != reserved[1]['configDigest']
                    or hba_digest != reserved[1]['hbaDigest']):
                raise LocalPostgresError('local-postgresql-postmaster-operation-unverified')
            self._verify_original_creation_values(pending, reservation, reserved[1])
            self._require_bound_pending_effect(reservation, effect_handle)
        else:
            targets = [target for target in self._native_targets.values()
                       if target._issuer is self
                       and self._native_targets.get(id(target)) is target
                       and target._reservation._scope == 'local-target-creation']
            if (launch_number < 2 or len(targets) != 1 or self._launch is None
                    or self._journal is None or self._active_creation is not None
                    or self._require_original_control_lease()._operation_kind
                       != 'process-recover'):
                raise LocalPostgresError('local-postgresql-postmaster-operation-unverified')
            target = targets[0]
            reservation = target._reservation
            outcome = self._native_effect_outcomes.get(id(reservation))
            request_value = json.loads(target._creation._request_bytes)
            owner_state = self._owner_core.observe_original_request(
                self._authority_context, reservation._effect_key)
            if (outcome is None or outcome.status != 'confirmed'
                    or owner_state.effect_status != 'confirmed'
                    or owner_state.approval_id != reservation.approval_id
                    or owner_state.intent_digest != reservation.request_digest
                    or launch_number != int(self._launch['launchNumber']) + 1
                    or Path(postgres) != Path(request_value['postgresPath'])
                    or Path(data_dir) != Path(request_value['dataDirectory'])
                    or Path(config_path) != Path(request_value['controlDirectory'])
                    / 'postgresql.conf'
                    or Path(hba_path) != Path(request_value['controlDirectory']) / 'pg_hba.conf'
                    or Path(ident_path) != Path(request_value['controlDirectory']) / 'pg_ident.conf'
                    or config_digest != request_value['configDigest']
                    or hba_digest != request_value['hbaDigest']):
                raise LocalPostgresError('local-postgresql-postmaster-operation-unverified')
            self._resolve_native_effect_reservation(reservation, reservation._approval)
        assert self._journal is not None
        current_hba = _render_hba(self._maintenance_name())
        if hashlib.sha256(current_hba).hexdigest() != hba_digest:
            raise LocalPostgresError('local-postgresql-hba-profile-mismatch')
        self._require_native_effect_operation('target-apply', 'target-recover',
                                              'process-recover')
        _write_private(hba_path, current_hba, exclusive=False)
        argv = [str(postgres), '-D', str(data_dir), '-c', f'config_file={config_path}',
                '-c', f'hba_file={hba_path}', '-c', f'ident_file={ident_path}']
        launch_id = str(uuid.uuid4())
        data_st = os.stat(data_dir, follow_symlinks=False)
        self._append_supervisor_journal('launch-intent', {
            'launchId': launch_id, 'launchNumber': launch_number,
            'argv': argv, 'configDigest': config_digest, 'hbaDigest': hba_digest,
            'binarySha256': _sha_file(postgres), 'dataDevice': str(data_st.st_dev),
            'dataInode': str(data_st.st_ino),
        })
        log_path = self._target_paths['control'] / f'postgres-launch-{launch_number}.log'
        self._require_native_effect_operation('target-apply', 'target-recover',
                                              'process-recover')
        log_fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.fchmod(log_fd, 0o600)
        try:
            self._require_native_effect_operation('target-apply', 'target-recover',
                                                  'process-recover')
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
        self._append_supervisor_journal('launch-confirmed', {
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
                           *, allowed_binaries: set[str],
                           reservation: _NativeEffectReservation | None = None,
                           effect_handle: object = None) -> None:
        self._require_native_effect_operation('target-apply')
        if self._active_child is not None:
            raise LocalPostgresError('local-postgresql-child-already-active')
        pending = self._active_creation
        candidates = [
            (reservation, values)
            for reservation, values in self._reserved_creation_values.values()
            if pending is not None
            and values.get('request') is not None
            and _canonical(values['request']) == pending._request_bytes
        ]
        if len(candidates) != 1:
            raise LocalPostgresError('local-postgresql-child-operation-unverified')
        candidate_reservation, values = candidates[0]
        if (reservation is not candidate_reservation
                or type(reservation) is not _NativeEffectReservation
                or self._native_effect_reservations.get(id(reservation)) is not reservation):
            raise LocalPostgresError('local-postgresql-child-operation-unverified')
        self._verify_original_creation_values(pending, reservation, values)
        self._require_bound_pending_effect(reservation, effect_handle)
        expected_argv = [str(values['initdb']), '-D', str(values['data']),
                         '-U', values['request']['maintenanceName'],
                         '--encoding=UTF8', '--locale=C', '--auth-local=reject',
                         '--auth-host=scram-sha-256', f"--pwfile={values['pwPath']}"]
        if (argv != expected_argv or timeout != 180
                or log_path != values['control'] / 'initdb.log'
                or allowed_binaries != {str(values['initdb']), str(values['postgres'])}):
            raise LocalPostgresError('local-postgresql-child-operation-unverified')
        self._require_original_control_lease(operation_kind='target-apply')
        log_fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.fchmod(log_fd, 0o600)
        try:
            self._require_original_control_lease(operation_kind='target-apply')
            child = subprocess.Popen(argv, cwd=str(log_path.parent), env=dict(_ENV),
                                     stdin=subprocess.DEVNULL, stdout=log_fd,
                                     stderr=subprocess.STDOUT, close_fds=True,
                                     start_new_session=True)
            self._active_child = child
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
        if self._active_child is not child:
            raise LocalPostgresError('local-postgresql-child-ownership-unknown')
        self._active_child = None
        if status != 0:
            raise LocalPostgresError('local-postgresql-child-failed')

    def _terminate_owned_child(self, child: subprocess.Popen[bytes],
                               allowed_binaries: set[str]) -> None:
        self._require_native_effect_operation('target-apply')
        if self._active_child is not child:
            raise LocalPostgresError('local-postgresql-child-ownership-unknown')
        if child.poll() is not None:
            self._assert_group_absent(child.pid)
            self._active_child = None
            return
        members = self._observer.group(child.pid)
        expected = {str(Path(x).resolve(strict=True)) for x in allowed_binaries}
        if (not members or any(member.get('pgid') != child.pid
                               or member.get('uid') != os.geteuid()
                               or member.get('path') not in expected for member in members)):
            raise LocalPostgresError('local-postgresql-child-ownership-unknown')
        self._require_original_control_lease(operation_kind='target-apply')
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            members = self._observer.group(child.pid)
            if (not members or any(member.get('pgid') != child.pid
                                   or member.get('uid') != os.geteuid()
                                   or member.get('path') not in expected for member in members)):
                raise LocalPostgresError('local-postgresql-child-ownership-unknown')
            self._require_original_control_lease(operation_kind='target-apply')
            os.killpg(child.pid, signal.SIGKILL)
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                raise LocalPostgresError('local-postgresql-child-terminal-unknown') from None
        self._assert_group_absent(child.pid)
        if self._active_child is not child:
            raise LocalPostgresError('local-postgresql-child-ownership-unknown')
        self._active_child = None

    def _maintenance_name(self) -> str:
        if self._journal is None:
            raise LocalPostgresError('local-postgresql-not-created')
        intent = next((event['payload'] for event in self._journal.read()['events']
                       if event['kind'] == 'creation-intent'), None)
        if intent is None:
            raise LocalPostgresError('local-postgresql-not-created')
        return intent['maintenanceName']

    def _connect_maintenance(self, database_name: str, *,
                             budget_reservation: _OriginalStoreCreationReservation | _OriginalStoreCreationBudget | None = None,
                             readonly_budget: _OriginalStoreReadonlyBudget | None = None):
        if self._maintenance_password is None:
            raise LocalPostgresError('local-postgresql-credential-unavailable')
        connection = None
        try:
            from psycopg import connect
            connect_timeout = 3
            if budget_reservation is not None:
                remaining_ms = self._require_original_store_budget(budget_reservation)
                connect_timeout = min(3, remaining_ms // 1000)
                if connect_timeout <= 0:
                    raise LocalPostgresError('local-postgresql-store-budget-exhausted')
            if readonly_budget is not None:
                remaining_ms = self._require_original_store_readonly_budget(readonly_budget)
                connect_timeout = min(connect_timeout, remaining_ms // 1000)
                if connect_timeout <= 0:
                    raise LocalPostgresError('local-postgresql-store-readonly-exhausted')
                # The private connection starts with finite server-side waits
                # before the first query that discovers the installed values.
                # The discovery query is therefore bounded from connection
                # startup rather than relying on a Python deadline check alone.
                statement_startup_ms = min(remaining_ms, 30_000)
                lock_startup_ms = min(remaining_ms, 5_000)
                if statement_startup_ms <= 0 or lock_startup_ms <= 0:
                    raise LocalPostgresError('local-postgresql-store-readonly-exhausted')
                readonly_budget._timeout_state['startupStatementTimeoutMs'] = \
                    statement_startup_ms
                readonly_budget._timeout_state['startupLockTimeoutMs'] = lock_startup_ms
                self._require_original_store_readonly_budget(readonly_budget)
            options = ("-c search_path=pg_catalog -c row_security=on "
                       "-c session_replication_role=origin "
                       "-c default_transaction_read_only=off "
                       "-c 'default_transaction_isolation=read committed'")
            if budget_reservation is not None:
                statement_startup_ms = min(remaining_ms, 30_000)
                lock_startup_ms = min(remaining_ms, 5_000)
                creation_budget = (budget_reservation._budget
                                   if type(budget_reservation)
                                   is _OriginalStoreCreationReservation
                                   else budget_reservation)
                lower = dict(creation_budget._caller_timeout_lower_ms or ())
                if lower.get('statement_timeout', 0) > 0:
                    statement_startup_ms = min(
                        statement_startup_ms, lower['statement_timeout'])
                if lower.get('lock_timeout', 0) > 0:
                    lock_startup_ms = min(lock_startup_ms, lower['lock_timeout'])
                if statement_startup_ms <= 0 or lock_startup_ms <= 0:
                    raise LocalPostgresError('local-postgresql-store-budget-exhausted')
            if readonly_budget is not None:
                options += (f" -c statement_timeout={statement_startup_ms}ms"
                            f" -c lock_timeout={lock_startup_ms}ms")
            elif budget_reservation is not None:
                options += (f" -c statement_timeout={statement_startup_ms}ms"
                            f" -c lock_timeout={lock_startup_ms}ms")
            connection = connect(host='127.0.0.1', port=self._profile.port,
                           dbname=database_name, user=self._maintenance_name(),
                           password=self._maintenance_password.decode('ascii').rstrip('\n'),
                           sslmode='disable', connect_timeout=connect_timeout,
                           application_name='umf_g11_local_owner',
                           options=options)
            if budget_reservation is not None:
                self._require_original_store_budget(budget_reservation)
            if readonly_budget is not None:
                self._require_original_store_readonly_budget(readonly_budget)
            return connection
        except LocalPostgresError:
            if connection is not None:
                try:
                    connection.close()
                except Exception:  # noqa: BLE001 -- preserve the original fail-closed error
                    pass
            raise
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            if connection is not None:
                try:
                    connection.close()
                except Exception:  # noqa: BLE001 -- preserve the original fail-closed error
                    pass
            raise LocalPostgresError('local-postgresql-maintenance-authentication-failed') from None

    def _observe_native(self, database_name: str, *, current_role: str | None = None,
                        budget_reservation: _OriginalStoreCreationReservation | _OriginalStoreCreationBudget | None = None,
                        readonly_budget: _OriginalStoreReadonlyBudget | None = None
                        ) -> dict[str, Any]:
        try:
            with self._connect_maintenance(
                    database_name, budget_reservation=budget_reservation,
                    readonly_budget=readonly_budget) as raw_connection:
                raw_connection.autocommit = True
                connection = (self._budgeted_original_store_connection(
                    budget_reservation, connection=raw_connection)
                    if budget_reservation is not None else raw_connection)
                if current_role is not None and readonly_budget is None:
                    if budget_reservation is not None:
                        self._require_original_store_budget(budget_reservation)
                    if readonly_budget is not None:
                        self._require_original_store_readonly_budget(readonly_budget)
                    connection.execute(f'SET ROLE {_quote_identifier(current_role)}')
                    if budget_reservation is not None:
                        self._require_original_store_budget(budget_reservation)
                    if readonly_budget is not None:
                        self._require_original_store_readonly_budget(readonly_budget)
                if budget_reservation is not None:
                    self._require_original_store_budget(budget_reservation)
                if readonly_budget is not None:
                    self._require_original_store_readonly_budget(readonly_budget)
                query_native = """SELECT current_setting('server_version_num'),
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
(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user),pg_catalog.version()"""
                row = (self._fetch_original_store_readonly(
                    connection, readonly_budget, query_native,
                    current_role=current_role, many=False)
                    if readonly_budget is not None
                    else connection.execute(query_native).fetchone())
                if budget_reservation is not None:
                    self._require_original_store_budget(budget_reservation)
                if readonly_budget is not None:
                    self._require_original_store_readonly_budget(readonly_budget)
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
                if budget_reservation is not None:
                    self._require_original_store_budget(budget_reservation)
                if readonly_budget is not None:
                    self._require_original_store_readonly_budget(readonly_budget)
                query_rules = """SELECT type,database,user_name,address,netmask,
auth_method,options,error FROM pg_catalog.pg_hba_file_rules ORDER BY line_number"""
                rules = (self._fetch_original_store_readonly(
                    connection, readonly_budget, query_rules,
                    current_role=current_role, many=True)
                    if readonly_budget is not None
                    else connection.execute(query_rules).fetchall())
                native['hbaRules'] = [list(item) for item in rules]
                if budget_reservation is not None:
                    self._require_original_store_budget(budget_reservation)
                if readonly_budget is not None:
                    self._require_original_store_readonly_budget(readonly_budget)
                query_settings = """SELECT name,setting,source,sourcefile,
pending_restart FROM pg_catalog.pg_settings ORDER BY name"""
                setting_rows = (self._fetch_original_store_readonly(
                    connection, readonly_budget, query_settings,
                    current_role=current_role, many=True)
                    if readonly_budget is not None
                    else connection.execute(query_settings).fetchall())
                if budget_reservation is not None:
                    self._require_original_store_budget(budget_reservation)
                if readonly_budget is not None:
                    self._require_original_store_readonly_budget(readonly_budget)
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
            'sessionReplicationRole': 'origin',
            'transactionReadOnly': 'on' if readonly_budget is not None else 'off',
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
        self._verify_effective_settings(
            setting_rows, native, budget_reservation=budget_reservation,
            readonly_budget=readonly_budget)
        self._verify_hba_rules(native['hbaRules'])
        return native

    def _verify_effective_settings(
            self, rows: list[tuple[Any, ...]], native: dict[str, Any], *,
            budget_reservation: _OriginalStoreCreationReservation | _OriginalStoreCreationBudget | None = None,
            readonly_budget: _OriginalStoreReadonlyBudget | None = None) -> None:
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
        seen_readonly_waits: set[str] = set()
        seen_creation_waits: set[str] = set()
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
            elif (key == 'transaction_read_only' and source == 'session'
                  and native['transactionReadOnly'] == 'on' and setting == 'on'
                  and sourcefile is None):
                pass
            elif (budget_reservation is not None
                  and key in {'statement_timeout', 'lock_timeout'}
                  and source == 'session' and sourcefile is None
                  and type(setting) is str and setting.isdecimal()
                  and setting == str((budget_reservation._budget
                                      if type(budget_reservation)
                                      is _OriginalStoreCreationReservation
                                      else budget_reservation)._timeout_state.get(key))
                  and int(setting) > 0
                  and int(setting) <= (30_000 if key == 'statement_timeout' else 5_000)):
                seen_creation_waits.add(key)
            elif (readonly_budget is not None
                  and key in {'statement_timeout', 'lock_timeout'}
                  and source == 'session' and sourcefile is None
                  and type(setting) is str and setting.isdecimal()
                  and setting == str(readonly_budget._timeout_state.get(key))
                  and int(setting) > 0
                  and int(setting) <= (30_000 if key == 'statement_timeout' else 5_000)):
                # This is the exact actual value installed for the query by the
                # same invocation wrapper; the raw settings rows/digest remain
                # unmodified in the observation.
                seen_readonly_waits.add(key)
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
        if (readonly_budget is not None
                and seen_readonly_waits != {'statement_timeout', 'lock_timeout'}):
            raise LocalPostgresError('local-postgresql-effective-settings-mismatch')
        if (budget_reservation is not None
                and seen_creation_waits != {'statement_timeout', 'lock_timeout'}):
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

    def _native_origin_matches(
            self, origin: dict[str, Any], attestation: object, *,
            budget_reservation: _OriginalStoreCreationReservation | _OriginalStoreCreationBudget | None = None,
            readonly_budget: _OriginalStoreReadonlyBudget | None = None) -> bool:
        if type(attestation) is not _NativeAttestation or attestation.supervisor is not self:
            return False
        try:
            if budget_reservation is not None:
                self._require_original_store_budget(budget_reservation)
            if readonly_budget is not None:
                self._require_original_store_readonly_budget(readonly_budget)
            process = self._verify_live_process()
            if budget_reservation is not None:
                self._require_original_store_budget(budget_reservation)
            if readonly_budget is not None:
                self._require_original_store_readonly_budget(readonly_budget)
            native = self._observe_native(
                origin['database']['name'], budget_reservation=budget_reservation,
                readonly_budget=readonly_budget)
            if budget_reservation is not None:
                self._require_original_store_budget(budget_reservation)
            if readonly_budget is not None:
                self._require_original_store_readonly_budget(readonly_budget)
            if budget_reservation is not None:
                self._require_original_store_budget(budget_reservation)
            members = self._verify_owned_process_group(process['pgid'])
            if budget_reservation is not None:
                self._require_original_store_budget(budget_reservation)
            if readonly_budget is not None:
                self._require_original_store_readonly_budget(readonly_budget)
            sockets = self._verify_endpoint_sockets(
                self._observer.sockets(process['pgid']), {item['pid'] for item in members})
            if budget_reservation is not None:
                self._require_original_store_budget(budget_reservation)
            if readonly_budget is not None:
                self._require_original_store_readonly_budget(readonly_budget)
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
        self._require_native_effect_operation('process-recover')
        if self._pg_process is None or self._launch is None or self._journal is None:
            raise LocalPostgresError('local-postgresql-process-not-owned')
        targets = [target for target in self._native_targets.values()
                   if target._issuer is self
                   and self._native_targets.get(id(target)) is target
                   and target._reservation._scope == 'local-target-creation']
        if len(targets) != 1:
            raise LocalPostgresError('local-postgresql-process-recovery-unverified')
        target_reservation = targets[0]._reservation
        target_outcome = self._native_effect_outcomes.get(id(target_reservation))
        owner_state = self._owner_core.observe_original_request(
            self._authority_context, target_reservation._effect_key)
        if (target_outcome is None or target_outcome.status != 'confirmed'
                or owner_state.effect_status != 'confirmed'
                or owner_state.approval_id != target_reservation.approval_id
                or owner_state.intent_digest != target_reservation.request_digest):
            raise LocalPostgresError('local-postgresql-process-recovery-unverified')
        self._resolve_native_effect_reservation(
            target_reservation, target_reservation._approval)
        process = self._verify_live_process()
        launch_id = self._launch['launchId']
        self._append_supervisor_journal('stop-intent', {'launchId': launch_id,
                                             'processStartToken': process['startToken']})
        self._verify_owned_process_group(process['pgid'])
        self._require_control_operation('target-apply', 'target-recover',
                                        'process-recover')
        os.killpg(process['pgid'], signal.SIGINT)
        try:
            self._pg_process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            members = self._observer.group(process['pgid'])
            if not members or any(member['startToken'] != process['startToken']
                                  for member in members if member['pid'] == process['pid']):
                raise LocalPostgresError('local-postgresql-process-ownership-unknown')
            self._require_control_operation('target-apply', 'target-recover',
                                            'process-recover')
            os.killpg(process['pgid'], signal.SIGKILL)
            try:
                self._pg_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                raise LocalPostgresError('local-postgresql-process-terminal-unknown') from None
        self._assert_group_absent(process['pgid'])
        self._append_supervisor_journal('stop-confirmed', {'launchId': launch_id,
                         'processGroupAbsent': True,
                         'controlDataDigest': _digest({'systemIdentifier': self._launch['native']['systemIdentifier'],
                                                       'databaseOid': self._launch['native']['databaseOid']})})
        self._pg_process = None

    def restart_same_target(self) -> dict[str, Any]:
        """Controlled restart retaining the original PGDATA and custody chain."""
        with self._original_control_lease(operation_kind='process-recover'):
            return self._restart_same_target_under_lease()

    def _restart_same_target_under_lease(self) -> dict[str, Any]:
        """Perform restart while the original control lease is retained."""
        self._require_control_operation('process-recover')
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
        self._require_control_operation('process-recover')
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
        self._require_control_operation('store')
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
        self._require_original_control_lease(operation_kind='store')
        owner_request = self._owner_core.prepare_request(
            'native-store-creation', _canonical(preparation_payload),
            context=self._authority_context)
        self._require_original_control_lease(operation_kind='store')
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
            'authorityId': self._owner_core.authority_id,
            'approvalScope': 'local-target-registration',
            'approvalReceiptDigest': registration_event['payload']['approvalDigest'],
        }
        authority = {
            'installationId': self._bound_installation_id,
            'payloadDigest': principal_intent['payload']['payloadDigest'],
            'approvalIntentDigest': principal_intent['payload']['requestDigest'],
            'approvalId': principal_intent['payload']['approvalId'],
            'approvalDigest': principal_intent['payload']['approvalDigest'],
            'authorityId': self._owner_core.authority_id,
            'approvalScope': 'native-principal-preparation',
            'approvalReceiptDigest': creation_receipt['principalPreparationReceiptDigest'],
        }
        return registration, authority

    def _resolve_original_target_custody_journal_birth(
            self, *, operation_kind: str | None = None) -> dict[str, Any]:
        """Resolve the opaque fresh-enrollment selector under the original lease."""
        if self._target_custody_journal_birth is None:
            raise LocalPostgresError('target-custody-journal-birth-unavailable')
        from .owner_bootstrap import _resolve_original_target_custody_journal_birth
        lease = self._require_original_control_lease(operation_kind=operation_kind)
        return _resolve_original_target_custody_journal_birth(
            self._target_custody_journal_birth, issuer=self._bootstrap_issuer,
            context=self._authority_context, supervisor=self, control_lease=lease)

    def export_original_store_signing_request(
            self, evidence: object) -> dict[str, Any]:
        entry = self._store_preparations.get(id(evidence))
        if (type(evidence) is not _VerifiedNativeStorePreparation or entry is None
                or entry[0] is not evidence or entry[1] is not evidence
                or evidence.supervisor is not self):
            raise LocalPostgresError('local-postgresql-store-preparation-unverified')
        try:
            return self._owner_core.export_signing_request(evidence.owner_request)
        except Exception:  # noqa: BLE001 - redact private authority or driver details; fail closed.
            raise LocalPostgresError('local-postgresql-owner-request-unavailable') from None

    def prepare_original_store_authority(
            self, request: object, signed_envelope: object
            ) -> tuple[_VerifiedNativeStorePreparation, object]:
        """Verify a signed final approval against the retained original evidence."""
        from .owner_approval_core import OwnerApprovalRequest, OwnerAuthorityError
        if type(request) is not OwnerApprovalRequest:
            raise LocalPostgresError('local-postgresql-owner-request-required')
        evidence = next((item[1] for item in self._store_preparations.values()
                         if item[1].owner_request is request), None)
        if evidence is None:
            raise LocalPostgresError('local-postgresql-owner-request-not-original')
        try:
            approval = self._owner_core.verify_approval(request, signed_envelope)
            self._owner_core._resolve_verified_approval(
                approval, original_request=request, scope='native-store-creation',
                intent_digest=request._intent_digest)
        except OwnerAuthorityError:
            raise LocalPostgresError('local-postgresql-final-approval-unverified') from None
        self._resolve_original_store_preparation(
            evidence, approval, custodian=self._custodian, target=self._custody_handle)
        return evidence, approval

    def _native_store_preparation_payload(self, reference: dict[str, Any], verified: object,
                                          registration: dict[str, Any], authority: dict[str, Any],
                                          native: dict[str, Any], *,
                                          budget_reservation: _OriginalStoreCreationReservation | _OriginalStoreCreationBudget | None = None,
                                          readonly_budget: _OriginalStoreReadonlyBudget | None = None
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
        if budget_reservation is not None and readonly_budget is not None:
            raise LocalPostgresError('local-postgresql-store-observation-budget-ambiguous')
        try:
            with self._connect_maintenance(
                    self._profile.database_name,
                    budget_reservation=budget_reservation,
                    readonly_budget=readonly_budget) as raw_connection:
                transaction = (self._original_store_readonly_transaction(
                    raw_connection, readonly_budget) if readonly_budget is not None
                    else nullcontext(raw_connection))
                with transaction as observed_connection:
                    if readonly_budget is not None:
                        connection = observed_connection
                    elif budget_reservation is not None:
                        connection = self._budgeted_original_store_connection(
                            budget_reservation, connection=raw_connection)
                    else:
                        connection = raw_connection
                    connection.execute(f'SET ROLE {_quote_identifier(controller)}')
                    rows = connection.execute(
                        "SELECT rolname,oid,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,"
                        "rolreplication,rolbypassrls,rolinherit FROM pg_catalog.pg_roles "
                        "WHERE rolname = ANY(%s) ORDER BY rolname", (list(expected_role_names),)
                    ).fetchall()
                    memberships = connection.execute(
                        "SELECT member.oid,granted.oid,m.admin_option,m.inherit_option,m.set_option "
                        "FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles member "
                        "ON m.member=member.oid JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid "
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
        settings = self._store_settings_from_observation(
            native, readonly_budget=readonly_budget)
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
            'ownerAuthorityId': self._owner_core.authority_id,
            'ownerPolicyRevision': self._owner_core.policy_revision,
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
    def _store_settings_from_observation(
            cls, native: dict[str, Any], *,
            readonly_budget: _OriginalStoreReadonlyBudget | None = None
            ) -> dict[str, str]:
        if type(native) is not dict:
            raise LocalPostgresError('local-postgresql-store-settings-mismatch')
        observed = {
            'searchPath': native.get('searchPath'),
            'timeZone': native.get('timeZone'),
            'rowSecurity': native.get('rowSecurity'),
            'sessionReplicationRole': native.get('sessionReplicationRole'),
            'transactionReadOnly': native.get('transactionReadOnly'),
            'transactionIsolation': native.get('transactionIsolation'),
        }
        if readonly_budget is None:
            return cls._store_required_settings(observed)
        expected = dict(observed)
        expected['transactionReadOnly'] = 'on'
        if observed != expected:
            raise LocalPostgresError('local-postgresql-store-settings-mismatch')
        return expected

    def _resolve_original_store_recovery_observation(
            self, original_evidence: object, actual_evidence: object,
            actual_observation: object, *, authority: dict[str, Any],
            readonly_budget: _OriginalStoreReadonlyBudget
            ) -> _VerifiedOriginalStoreRecoveryObservation:
        """Compare immutable signed facts with the truthful current RO session."""
        self._require_original_store_readonly_budget(readonly_budget)
        try:
            original_request = json.loads(readonly_budget._request._intent_bytes,
                                          object_pairs_hook=_no_duplicates)
        except Exception:  # noqa: BLE001 -- original signed request is the authority
            raise LocalPostgresError('local-postgresql-store-recovery-request-mismatch') from None
        if (type(original_request) is not dict
                or type(original_request.get('evidence')) is not dict
                or original_request['evidence'] != original_evidence
                or type(original_evidence) is not dict
                or type(actual_evidence) is not dict
                or type(actual_observation) is not dict
                or set(actual_evidence) != set(original_evidence)):
            raise LocalPostgresError('local-postgresql-store-recovery-evidence-invalid')
        varying = {'requiredSettings', 'nativeAuthorityObservationDigest'}
        if any(original_evidence[key] != actual_evidence[key]
               for key in original_evidence if key not in varying):
            raise LocalPostgresError('local-postgresql-store-recovery-authority-stale')
        original_settings = original_evidence['requiredSettings']
        actual_settings = actual_evidence['requiredSettings']
        if (type(original_settings) is not dict or type(actual_settings) is not dict
                or set(original_settings) != set(actual_settings)
                or original_settings.get('transactionReadOnly') != 'off'
                or actual_settings.get('transactionReadOnly') != 'on'
                or any(original_settings[key] != actual_settings[key]
                       for key in original_settings if key != 'transactionReadOnly')
                or actual_observation.get('settings') != actual_settings
                or actual_observation.get('profile')
                    != 'umf.pg18.native-session-authority-observation/0.1'
                or actual_observation.get('authorityScopeDigest')
                    != authority.get('approvalIntentDigest')
                or actual_evidence.get('authorityPreparationReceiptDigest')
                    != authority.get('approvalReceiptDigest')
                or actual_observation.get('registrationDigest')
                    != original_evidence.get('registrationDigest')
                or actual_observation.get('targetCustodyDigest')
                    != original_evidence.get('targetCustodyDigest')
                or actual_evidence.get('nativeAuthorityObservationDigest')
                    != _digest(actual_observation)):
            raise LocalPostgresError('local-postgresql-store-recovery-session-mismatch')
        expected_principals = [original_evidence.get('maintenance'),
                               original_evidence.get('controller'),
                               original_evidence.get('businessOwner')]
        if (actual_observation.get('principalObservations') != expected_principals
                or type(original_evidence.get('requiredMemberships')) is not list):
            raise LocalPostgresError('local-postgresql-store-recovery-principal-mismatch')
        expected_edges = sorted([
            [edge.get('memberOid'), edge.get('roleOid'), edge.get('admin'),
             edge.get('inherit'), edge.get('set')]
            for edge in original_evidence['requiredMemberships']
            if type(edge) is dict and set(edge) == {
                'memberOid', 'roleOid', 'admin', 'inherit', 'set'}])
        actual_edges = actual_observation.get('membershipObservations')
        if (len(expected_edges) != len(original_evidence['requiredMemberships'])
                or type(actual_edges) is not list
                or sorted(actual_edges) != expected_edges):
            raise LocalPostgresError('local-postgresql-store-recovery-membership-mismatch')
        self._require_original_store_readonly_budget(readonly_budget)
        return _VerifiedOriginalStoreRecoveryObservation(
            _VERIFIED_STORE_RECOVERY_OBSERVATION_SEAL, self, readonly_budget,
            readonly_budget._request, readonly_budget._reservation_digest,
            original_evidence, actual_evidence, actual_observation)

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

    def _mint_original_store_readonly_budget(
            self, reservation: object, request: object, effect: object,
            reservation_digest: str, reservation_record_bytes: bytes,
            operation: str, target: object, connection: object,
            store: dict[str, Any], started_ns: int
            ) -> _OriginalStoreReadonlyBudget:
        """Mint an observational window without touching creation attempts or expiry."""
        if (operation not in {'confirm', 'recover'}
                or os.getpid() != self._original_store_issuer_pid
                or not self._is_original_store_recovery_target(target)
                or type(store) is not dict
                or store != _store_descriptor(store.get('profile'), self._provider_id)
                or (effect is not None and (
                    type(effect) is not _NativeEffectReservation
                    or effect._request is not request))
                or (effect is None and (reservation is not None
                    or operation != 'recover'))
                or request._intent_digest != hashlib.sha256(request._intent_bytes).hexdigest()
                or type(reservation_digest) is not str
                or not _HEX.fullmatch(reservation_digest)
                or type(reservation_record_bytes) is not bytes
                or _canonical(json.loads(reservation_record_bytes,
                                         object_pairs_hook=_no_duplicates))
                    != reservation_record_bytes
                or _digest(json.loads(reservation_record_bytes,
                                      object_pairs_hook=_no_duplicates))
                    != reservation_digest
                or (reservation is not None and (
                    type(reservation) is not _OriginalStoreCreationReservation
                    or self._original_store_reservations.get(
                        id(reservation), (None,))[0] is not reservation
                    or reservation._target is not target
                    or reservation._connection is not connection))
                or (reservation is None and operation != 'recover')
                or (type(started_ns) is not int or started_ns <= 0
                    or started_ns > time.monotonic_ns())):
            raise LocalPostgresError('local-postgresql-store-readonly-unavailable')
        budget = _OriginalStoreReadonlyBudget(
            _ORIGINAL_STORE_READONLY_BUDGET_SEAL, self, reservation, request,
            effect, reservation_digest, reservation_record_bytes, target,
            connection, store, operation, started_ns)
        self._original_store_readonly_budgets[id(budget)] = budget
        return budget

    def _require_original_store_readonly_budget(
            self, budget: _OriginalStoreReadonlyBudget) -> int:
        reservation = budget._reservation
        if (type(budget) is not _OriginalStoreReadonlyBudget
                or budget._issuer is not self
                or self._original_store_readonly_budgets.get(id(budget)) is not budget
                or budget._pid != os.getpid()
                or budget._pid != self._original_store_issuer_pid
                or self._original_store_readonly_connection_fences.get(
                    id(budget._connection)) is budget._connection
                or budget._operation not in {'confirm', 'recover'}
                or not self._is_original_store_recovery_target(budget._target)
                or (budget._effect is not None
                    and (type(budget._effect) is not _NativeEffectReservation
                         or budget._effect._request is not budget._request))
                or (budget._effect is None
                    and (reservation is not None or budget._operation != 'recover'))
                or budget._request._intent_digest
                    != hashlib.sha256(budget._request._intent_bytes).hexdigest()
                or _canonical(json.loads(
                    budget._reservation_record_bytes, object_pairs_hook=_no_duplicates))
                    != budget._reservation_record_bytes
                or _digest(json.loads(
                    budget._reservation_record_bytes, object_pairs_hook=_no_duplicates))
                    != budget._reservation_digest
                or (reservation is not None
                    and budget._store_bytes != reservation._store)
                or json.loads(budget._store_bytes) != _store_descriptor(
                    json.loads(budget._store_bytes).get('profile'), self._provider_id)
                or (reservation is not None and (
                    self._original_store_reservations.get(
                        id(reservation), (None,))[0] is not reservation
                    or reservation._issuer is not self
                    or reservation._target is not budget._target
                    or reservation._connection is not budget._connection
                    or reservation._native_effect is not budget._effect
                    or reservation._evidence.owner_request is not budget._request
                    or hashlib.sha256(reservation._record_bytes).hexdigest()
                        != budget._reservation_digest))
                or (reservation is None and budget._operation != 'recover')):
            raise LocalPostgresError('local-postgresql-store-readonly-unavailable')
        try:
            if (budget._operation == 'recover'
                    and int(budget._connection.info.transaction_status) != 0):
                raise LocalPostgresError(
                    'local-postgresql-store-readonly-transaction-active')
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- caller transaction ownership is unprovable
            raise LocalPostgresError(
                'local-postgresql-store-readonly-transaction-unavailable') from None
        now_ns = time.monotonic_ns()
        if (type(now_ns) is not int or now_ns < budget._started_ns
                or now_ns >= budget._deadline_ns or budget._fenced):
            object.__setattr__(budget, '_fenced', True)
            raise LocalPostgresError('local-postgresql-store-readonly-exhausted')
        remaining_ms = (budget._deadline_ns - now_ns) // 1_000_000
        if remaining_ms <= 0:
            object.__setattr__(budget, '_fenced', True)
            raise LocalPostgresError('local-postgresql-store-readonly-exhausted')
        return min(remaining_ms, _ORIGINAL_STORE_READONLY_WINDOW_NS // 1_000_000)

    @contextmanager
    def _original_store_readonly_transaction(self, connection: object,
                                             budget: _OriginalStoreReadonlyBudget):
        """Own one read-only transaction; never adopt or settle a caller transaction."""
        self._require_original_store_readonly_budget(budget)
        try:
            if int(connection.info.transaction_status) != 0:
                raise LocalPostgresError(
                    'local-postgresql-store-readonly-transaction-active')
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- ownership cannot be established
            raise LocalPostgresError(
                'local-postgresql-store-readonly-transaction-unknown') from None
        _execute_original_store_sql(self, budget, connection, 'BEGIN READ ONLY')
        completed = False
        try:
            yield _BudgetedOriginalStoreReadonlyConnection(self, budget, connection)
            self._require_original_store_readonly_budget(budget)
            _execute_original_store_sql(self, budget, connection, 'COMMIT')
            completed = True
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- no unbounded native fallback
            raise LocalPostgresError('local-postgresql-store-readonly-unresolved') from None
        finally:
            if not completed and not budget._fenced:
                try:
                    self._require_original_store_readonly_budget(budget)
                    _execute_original_store_sql(self, budget, connection, 'ROLLBACK')
                except Exception:  # noqa: BLE001 -- failed bounded cleanup stays fenced
                    object.__setattr__(budget, '_fenced', True)
                    self._original_store_readonly_connection_fences[id(connection)] = connection

    def _fetch_original_store_readonly(self, connection: object,
                                      budget: _OriginalStoreReadonlyBudget,
                                      query: str, *, current_role: str | None,
                                      many: bool) -> Any:
        with self._original_store_readonly_transaction(connection, budget) as bounded:
            if current_role is not None:
                bounded.execute(f'SET LOCAL ROLE {_quote_identifier(current_role)}')
            cursor = bounded.execute(query)
            result = cursor.fetchall() if many else cursor.fetchone()
            return result

    def _capture_original_store_timeout_lower_bounds(
            self, connection: object, budget: _OriginalStoreCreationBudget
            ) -> tuple[tuple[str, int], ...]:
        """Read the caller's two lower waits through bounded same-PGconn I/O.

        Psycopg 3.2.13's public PGconn protocol exposes the nonblocking libpq
        send/flush/consume/result calls. The caller's Connection.lock is held
        for the whole operation so normal Psycopg calls cannot interleave.
        Any uncertain/incomplete operation leaves that lock held and fences
        this exact caller connection; it is never returned to the caller as
        quiescent and no legacy blocking execute/fetch path is attempted.
        """
        try:
            from psycopg import Connection
        except Exception:  # noqa: BLE001 -- exact driver is unavailable
            raise LocalPostgresError(
                'local-postgresql-store-budget-driver-unavailable') from None
        if type(connection) is not Connection:
            raise LocalPostgresError(
                'local-postgresql-store-budget-driver-unsupported')
        if (self._original_store_connection_fences.get(id(connection)) is connection
                or budget._connection is not connection
                or budget._issuer is not self
                or budget._creator_pid != os.getpid()):
            raise LocalPostgresError('local-postgresql-store-budget-connection-fenced')

        lock = connection.lock
        try:
            acquired = lock.acquire(blocking=False)
        except Exception:  # noqa: BLE001 -- do not duck-type another driver lock
            acquired = False
        if not acquired:
            raise LocalPostgresError(
                'local-postgresql-store-budget-connection-busy')

        pgconn = connection.pgconn
        locked_until_drain = False
        safely_restored = False
        old_nonblocking = None
        collected: tuple[tuple[str, int], ...] | None = None
        saw_final = False
        try:
            self._require_original_store_budget_pre_reservation(budget)
            if (connection.closed or pgconn.status != 0
                    or pgconn.transaction_status != 2
                    or pgconn.pipeline_status != 0):
                raise LocalPostgresError(
                    'local-postgresql-store-budget-connection-state-invalid')
            old_nonblocking = pgconn.nonblocking
            if type(old_nonblocking) is not int or old_nonblocking not in (0, 1):
                raise LocalPostgresError(
                    'local-postgresql-store-budget-connection-state-invalid')
            socket_fd = pgconn.socket
            if type(socket_fd) is not int or socket_fd < 0:
                raise LocalPostgresError(
                    'local-postgresql-store-budget-connection-state-invalid')
            pgconn.nonblocking = 1
            self._require_original_store_budget_pre_reservation(budget)
            query = (b"SELECT name, setting::pg_catalog.int8 FROM pg_catalog.pg_settings "
                     b"WHERE name IN ('statement_timeout','lock_timeout')")
            pgconn.send_query_params(query, None)

            def wait_ready(*, readable: bool = False, writable: bool = False) -> None:
                self._require_original_store_budget_pre_reservation(budget)
                remaining_ns = budget._deadline_ns - time.monotonic_ns()
                if remaining_ns <= 0:
                    raise LocalPostgresError(
                        'local-postgresql-store-budget-exhausted')
                timeout = min(0.025, remaining_ns / 1_000_000_000)
                ready_read, ready_write, _exceptional = select.select(
                    [socket_fd] if readable else [],
                    [socket_fd] if writable else [], [], timeout)
                self._require_original_store_budget_pre_reservation(budget)
                if not ready_read and not ready_write:
                    return

            while True:
                flush_status = pgconn.flush()
                if flush_status == 0:
                    break
                if type(flush_status) is not int or flush_status != 1:
                    raise LocalPostgresError(
                        'local-postgresql-store-budget-timeout-unavailable')
                wait_ready(writable=True)

            result_count = 0
            malformed = False
            while not saw_final:
                self._require_original_store_budget_pre_reservation(budget)
                if pgconn.is_busy():
                    wait_ready(readable=True)
                    pgconn.consume_input()
                    continue
                result = pgconn.get_result()
                if result is None:
                    saw_final = True
                    break
                result_count += 1
                try:
                    if (result_count != 1 or result.status != 2
                            or result.nfields != 2 or result.fname(0) != b'name'
                            or result.fname(1) != b'setting'
                            or result.ntuples != 2):
                        malformed = True
                    else:
                        names = []
                        values = []
                        for row in range(2):
                            name_bytes = result.get_value(row, 0)
                            setting_bytes = result.get_value(row, 1)
                            if (type(name_bytes) is not bytes
                                    or type(setting_bytes) is not bytes):
                                malformed = True
                                continue
                            try:
                                name = name_bytes.decode('ascii')
                                setting_text = setting_bytes.decode('ascii')
                            except UnicodeDecodeError:
                                malformed = True
                                continue
                            if (name not in ('statement_timeout', 'lock_timeout')
                                    or not setting_text.isascii()
                                    or not setting_text.isdigit()):
                                malformed = True
                                continue
                            names.append(name)
                            values.append((name, int(setting_text)))
                        if (len(names) != 2 or len(set(names)) != 2
                                or set(names) != {'statement_timeout', 'lock_timeout'}):
                            malformed = True
                        else:
                            collected = tuple(sorted(values))
                finally:
                    result.clear()

            pgconn.nonblocking = old_nonblocking
            safely_restored = True
            if (malformed or collected is None
                    or pgconn.transaction_status != 2
                    or pgconn.pipeline_status != 0):
                raise LocalPostgresError(
                    'local-postgresql-store-budget-timeout-invalid')
            self._require_original_store_budget_pre_reservation(budget)
            object.__setattr__(budget, '_caller_timeout_lower_ms', collected)
            object.__setattr__(budget, '_timeout_discovery_complete', True)
            return collected
        except BaseException as exc:  # noqa: BLE001 -- interrupts fence in-flight query state
            if not saw_final or not safely_restored:
                locked_until_drain = True
                object.__setattr__(budget, '_fenced', True)
                self._original_store_connection_fences[id(connection)] = connection
            if isinstance(exc, LocalPostgresError):
                raise
            if isinstance(exc, (KeyboardInterrupt, SystemExit, GeneratorExit)):
                raise
            raise LocalPostgresError(
                'local-postgresql-store-budget-timeout-unavailable') from None
        finally:
            if not locked_until_drain:
                lock.release()

    def _mint_original_store_creation_budget(
            self, *, evidence: object, approval: object, custodian: object,
            target: object, connection: object, store: dict[str, Any],
            caller_timeout_lower_ms: tuple[tuple[str, int], ...] | None = None
            ) -> _OriginalStoreCreationBudget:
        """Mint once, after final approval and before the first reservation write."""
        request = evidence.owner_request
        key = id(request)
        if os.getpid() != self._original_store_issuer_pid:
            raise LocalPostgresError('local-postgresql-store-budget-unavailable')
        if key in self._original_store_budgets:
            raise LocalPostgresError('local-postgresql-store-budget-already-minted')
        started_ns = time.monotonic_ns()
        budget = _OriginalStoreCreationBudget(
            _ORIGINAL_STORE_BUDGET_SEAL, self, request=request,
            evidence=evidence, approval=approval, custodian=custodian,
            target=target, connection=connection, store=store,
            caller_timeout_lower_ms=caller_timeout_lower_ms, started_ns=started_ns)
        self._original_store_budgets[key] = budget
        return budget

    def _require_original_store_budget(
            self, reservation: _OriginalStoreCreationReservation | _OriginalStoreCreationBudget) -> int:
        """Return remaining whole milliseconds for the exact live original effect."""
        if type(reservation) is _OriginalStoreCreationBudget:
            budget = reservation
            if (budget._issuer is not self
                    or self._original_store_budgets.get(id(budget._request)) is not budget
                    or budget._creator_pid != os.getpid()
                    or budget._creator_pid != self._original_store_issuer_pid
                    or budget._request is not budget._evidence.owner_request
                    or budget._effect_key != budget._request.effect_key
                    or budget._request_digest != budget._request._intent_digest
                    or budget._approval_digest != budget._approval.approval_digest
                    or budget._configuration_digest != self._owner_core.configuration_digest
                    or budget._fenced):
                raise LocalPostgresError('local-postgresql-store-budget-unavailable')
            if budget._reservation is None:
                return self._require_original_store_budget_pre_reservation(budget)
            reservation = budget._reservation
        else:
            budget = reservation._budget
        entry = self._original_store_reservations.get(id(reservation))
        if (type(budget) is not _OriginalStoreCreationBudget
                or budget._issuer is not self
                or self._original_store_budgets.get(id(budget._request)) is not budget
                or budget._creator_pid != os.getpid()
                or budget._creator_pid != self._original_store_issuer_pid
                or budget._reservation is not reservation
                or budget._reservation_digest is None
                or budget._request is not reservation._evidence.owner_request
                or budget._effect_key != budget._request.effect_key
                or budget._evidence is not reservation._evidence
                or budget._approval is not reservation._approval
                or budget._custodian is not reservation._custodian
                or budget._target is not reservation._target
                or budget._connection is not reservation._connection
                or budget._store_bytes != reservation._store
                or reservation._native_effect._request is not budget._request
                or reservation._native_effect._request.effect_key != budget._effect_key
                or budget._request_digest != budget._request._intent_digest
                or budget._approval_digest != reservation._approval.approval_digest
                or budget._configuration_digest != self._owner_core.configuration_digest
                or not budget._timeout_discovery_complete
                or entry is None or entry[0] is not reservation
                or entry[1]['reservationDigest'] != budget._reservation_digest
                or entry[1]['supervisorIntentDigest']
                    != reservation._native_effect._journal_record_digest
                or hashlib.sha256(reservation._record_bytes).hexdigest()
                    != budget._reservation_digest):
            raise LocalPostgresError('local-postgresql-store-budget-unavailable')
        now_ns = time.monotonic_ns()
        if (type(now_ns) is not int or now_ns < budget._started_ns
                or now_ns >= budget._deadline_ns or budget._fenced):
            object.__setattr__(budget, '_fenced', True)
            raise LocalPostgresError('local-postgresql-store-budget-exhausted')
        remaining_ms = (budget._deadline_ns - now_ns) // 1_000_000
        if remaining_ms <= 0:
            object.__setattr__(budget, '_fenced', True)
            raise LocalPostgresError('local-postgresql-store-budget-exhausted')
        return min(remaining_ms, _ORIGINAL_STORE_HOST_WINDOW_NS // 1_000_000)

    def _consume_original_store_creation_attempt(
            self, reservation: _OriginalStoreCreationReservation) -> _OriginalStoreCreationBudget:
        budget = reservation._budget
        self._require_original_store_budget(reservation)
        if budget._attempts >= _ORIGINAL_STORE_MAX_ATTEMPTS:
            raise LocalPostgresError('local-postgresql-store-attempt-capacity')
        object.__setattr__(budget, '_attempts', budget._attempts + 1)
        return budget

    def _budgeted_original_store_connection(
            self, reservation: object, *, connection: object | None = None
            ) -> _BudgetedOriginalStoreConnection:
        if type(reservation) not in (_OriginalStoreCreationReservation,
                                     _OriginalStoreCreationBudget):
            raise LocalPostgresError('local-postgresql-store-budget-unavailable')
        self._require_original_store_budget(reservation)
        return _BudgetedOriginalStoreConnection(
            self, reservation, connection=connection)

    def reserve_originals_store_creation(
            self, evidence: object, approval: object, *, custodian: object,
            target: object, store: dict[str, Any],
            connection: object, creation_budget: object | None = None
            ) -> _OriginalStoreCreationReservation:
        """Write the original custodian reservation and adjacent owner effects."""
        self._require_original_control_lease(operation_kind='store')
        if (type(store) is not dict
                or set(store) != {'profile', 'storeId', 'schemaName'}
                or store != _store_descriptor(store.get('profile'), self._provider_id)
                or self._journal is None or self._custodian is not custodian):
            raise LocalPostgresError('local-postgresql-store-reservation-invalid')
        budget = creation_budget
        if (type(budget) is not _OriginalStoreCreationBudget
                or budget._issuer is not self
                or budget._request is not evidence.owner_request
                or budget._evidence is not evidence or budget._approval is not approval
                or budget._custodian is not custodian or budget._target is not target
                or budget._connection is not connection
                or budget._store_bytes != _canonical(store)
                or budget._timeout_discovery_complete is not True):
            raise LocalPostgresError('local-postgresql-store-budget-unavailable')
        self._require_original_store_budget(budget)
        resolved = self._resolve_original_store_preparation(
            evidence, approval, custodian=custodian, target=target,
            budget_reservation=budget)
        if resolved['store'] != store:
            raise LocalPostgresError('local-postgresql-store-preparation-stale')
        if (self._target_custody_journal_birth is None
                or getattr(custodian._journal, '_profile', None)
                    != 'umf.local-target-custody-journal/0.2'):
            raise LocalPostgresError('target-custody-journal-birth-unavailable')
        request = evidence.owner_request
        if (request._scope != 'native-store-creation'
                or hashlib.sha256(request._intent_bytes).hexdigest()
                    != request._intent_digest):
            raise LocalPostgresError('local-postgresql-store-request-unverified')
        try:
            request_value = json.loads(request._intent_bytes, object_pairs_hook=_no_duplicates)
        except (json.JSONDecodeError, UnicodeDecodeError, TypeError, ValueError):
            raise LocalPostgresError('local-postgresql-store-request-unverified') from None
        reservation = {
            'profile': 'umf.row-originals-store-reservation/0.1',
            'reservationId': str(uuid.uuid4()), 'providerId': self._provider_id,
            'installationId': self._bound_installation_id,
            'targetCustody': custodian._public_reference(target), 'store': dict(store),
            'creationRequestDigest': request._intent_digest,
            'creationApprovalDigest': approval.approval_digest,
            'nativeAuthorityEvidenceDigest': resolved['payload']['nativeAuthorityObservationDigest'],
            'configurationDigest': self._owner_core.configuration_digest,
            'custodySequence': 0,
        }
        if self._original_store_connection_fences.get(id(connection)) is connection:
            raise LocalPostgresError(
                'local-postgresql-store-budget-connection-fenced')
        if not budget._timeout_discovery_complete:
            raise LocalPostgresError(
                'local-postgresql-store-budget-timeout-unavailable')
        self._require_original_store_budget_pre_reservation(budget)
        try:
            external = custodian._journal._reserve_originals_store(
                purpose=self._profile.purpose, request=request_value,
                approval_digest=approval.approval_digest, reservation=reservation)
            self._require_original_store_budget_pre_reservation(budget)
            external_record = next(
                event for event in custodian._journal._load()['events']
                if event['recordDigest'] == external['recordDigest'])
        except Exception:  # noqa: BLE001 -- preserve durable ambiguity, redact authority
            raise LocalPostgresError('local-postgresql-store-reservation-outcome-unresolved') from None
        self._require_original_store_budget_pre_reservation(budget)
        reservation = external_record['payload']['reservation']
        reservation_digest = external_record['payload']['reservationDigest']
        self._require_original_store_budget_pre_reservation(budget)
        typed = self._append_supervisor_journal('originals-store-creation-intent', {
            'purpose': self._profile.purpose, 'reservation': reservation,
            'reservationDigest': reservation_digest,
            'custodianReservedEventDigest': external['recordDigest'],
            'creationRequestDigest': request._intent_digest,
            'creationApprovalDigest': approval.approval_digest,
            'nativeAuthorityEvidenceDigest': resolved['payload']['nativeAuthorityObservationDigest'],
        })
        self._require_original_store_budget_pre_reservation(budget)
        native_effect = self._make_native_effect_reservation(
            request, approval, 'native-store-creation',
            ('native-store-creation', self._provider_id, store['profile'], store['storeId']),
            self._profile.purpose, target, typed, request._intent_bytes)
        try:
            self._require_original_store_budget_pre_reservation(budget)
            effect_handle = self._owner_core._bind_effect_digest(
                approval, _digest(native_effect._journal_record_digest))
        except Exception:  # noqa: BLE001 -- pending binding must precede DDL
            raise LocalPostgresError('local-postgresql-owner-effect-binding-required') from None
        result = _OriginalStoreCreationReservation(
            _ORIGINAL_STORE_RESERVATION_SEAL, self, evidence=evidence,
            approval=approval, custodian=custodian, target=target,
            connection=connection, effect_handle=effect_handle,
            native_effect=native_effect, record_bytes=_canonical(reservation), store=store,
            budget=budget)
        object.__setattr__(budget, '_reservation_digest', reservation_digest)
        object.__setattr__(budget, '_reservation', result)
        self._original_store_reservations[id(result)] = (
            result, {'externalEventDigest': external['recordDigest'],
                     'reservationDigest': reservation_digest,
                     'supervisorIntentDigest': native_effect._journal_record_digest},
            resolved)
        self._require_original_store_budget(result)
        return result

    @staticmethod
    def _require_original_store_budget_pre_reservation(
            budget: _OriginalStoreCreationBudget) -> int:
        now_ns = time.monotonic_ns()
        if (budget._creator_pid != os.getpid()
                or budget._creator_pid != budget._issuer._original_store_issuer_pid
                or type(now_ns) is not int
                or now_ns < budget._started_ns or now_ns >= budget._deadline_ns
                or budget._fenced):
            object.__setattr__(budget, '_fenced', True)
            raise LocalPostgresError('local-postgresql-store-budget-exhausted')
        remaining = (budget._deadline_ns - now_ns) // 1_000_000
        if remaining <= 0:
            object.__setattr__(budget, '_fenced', True)
            raise LocalPostgresError('local-postgresql-store-budget-exhausted')
        return min(remaining, _ORIGINAL_STORE_HOST_WINDOW_NS // 1_000_000)

    def begin_originals_store_creation_attempt(
            self, reservation: object) -> _OriginalStoreCreationAttempt:
        """Charge once, then bind the exact active transaction to its original budget."""
        self._require_original_control_lease(operation_kind='store')
        entry = self._original_store_reservations.get(id(reservation))
        if (type(reservation) is not _OriginalStoreCreationReservation
                or entry is None or entry[0] is not reservation):
            raise LocalPostgresError('local-postgresql-store-attempt-unverified')
        if any(existing_reservation is reservation and state == 'open'
               for _existing, existing_reservation, state
               in self._original_store_attempts.values()):
            raise LocalPostgresError('local-postgresql-store-attempt-already-open')
        budget = self._consume_original_store_creation_attempt(reservation)
        return self._bind_original_store_creation_attempt(reservation, budget)

    def _bind_original_store_creation_attempt(
            self, reservation: _OriginalStoreCreationReservation,
            budget: _OriginalStoreCreationBudget) -> _OriginalStoreCreationAttempt:
        self._require_original_control_lease(operation_kind='store')
        self._require_original_store_budget(reservation)
        if budget is not reservation._budget:
            raise LocalPostgresError('local-postgresql-store-budget-unavailable')
        self._require_original_store_budget(reservation)
        self._resolve_originals_store_creation_reservation(
            reservation, evidence=reservation._evidence,
            approval=reservation._approval, custodian=reservation._custodian,
            target=reservation._target, store=json.loads(reservation._store),
            budget_reservation=reservation)
        self._require_original_store_budget(reservation)
        connection = reservation._connection
        try:
            if int(connection.info.transaction_status) != 2:
                raise LocalPostgresError('local-postgresql-store-attempt-transaction-required')
            bounded = self._budgeted_original_store_connection(reservation)
            row = _one(bounded, '''SELECT pg_catalog.current_database(), d.oid,
 pg_catalog.pg_control_system().system_identifier::pg_catalog.text,
 pg_catalog.pg_current_xact_id()::pg_catalog.text, pg_catalog.pg_backend_pid(),
 (SELECT a.backend_start::pg_catalog.text FROM pg_catalog.pg_stat_activity a
  WHERE a.pid=pg_catalog.pg_backend_pid())
 FROM pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database()''')
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- transaction identity is native evidence
            raise LocalPostgresError('local-postgresql-store-attempt-identity-unavailable') from None
        if (row is None or type(row[0]) is not str or type(row[1]) is not int
                or type(row[2]) is not str or type(row[3]) is not str
                or not row[3].isdecimal()
                or not 1 <= int(row[3]) <= 2**64 - 1
                or type(row[4]) is not int or row[4] <= 0
                or type(row[5]) is not str or not row[5]):
            raise LocalPostgresError('local-postgresql-store-attempt-identity-invalid')
        attempt = _OriginalStoreCreationAttempt(
            _ORIGINAL_STORE_ATTEMPT_SEAL, self, reservation, connection,
            xid=row[3], database_name=row[0], database_oid=row[1],
            system_identifier=row[2], backend_pid=row[4], backend_start=row[5],
            budget=budget)
        self._original_store_attempts[id(attempt)] = (attempt, reservation, 'open')
        return attempt

    def resume_originals_store_creation_attempt(
            self, reservation: object, attempt: object) -> _OriginalStoreCreationAttempt:
        """Consume actual original-abort evidence, then bind the current retry txn."""
        self._require_original_control_lease(operation_kind='store')
        entry = self._original_store_attempts.get(id(attempt))
        if (type(attempt) is not _OriginalStoreCreationAttempt
                or entry != (attempt, reservation, 'open')
                or attempt._issuer is not self or attempt._reservation is not reservation
                or type(reservation) is not _OriginalStoreCreationReservation
                or attempt._connection is not reservation._connection):
            raise LocalPostgresError('local-postgresql-store-attempt-unverified')
        budget = self._consume_original_store_creation_attempt(reservation)
        if attempt._budget is not budget:
            raise LocalPostgresError('local-postgresql-store-budget-unavailable')
        self._resolve_originals_store_creation_reservation(
            reservation, evidence=reservation._evidence,
            approval=reservation._approval, custodian=reservation._custodian,
            target=reservation._target, store=json.loads(reservation._store),
            budget_reservation=reservation)
        self._require_original_store_budget(reservation)
        connection = reservation._connection
        try:
            if int(connection.info.transaction_status) != 2:
                raise LocalPostgresError('local-postgresql-store-retry-transaction-required')
            bounded = self._budgeted_original_store_connection(reservation)
            row = _one(bounded, '''SELECT pg_catalog.current_database(), d.oid,
 pg_catalog.pg_control_system().system_identifier::pg_catalog.text,
 pg_catalog.pg_backend_pid(),
 (SELECT a.backend_start::pg_catalog.text FROM pg_catalog.pg_stat_activity a
  WHERE a.pid=pg_catalog.pg_backend_pid()),
 pg_catalog.pg_xact_status(%s::pg_catalog.xid8)
 FROM pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database()''',
                        (attempt._xid,))
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- unavailable status cannot authorize retry
            raise LocalPostgresError('local-postgresql-store-attempt-outcome-unresolved') from None
        self._require_original_store_attempt_aborted(attempt, row)
        try:
            from .row_originals_creation import observe_absent_creation_schema
            request = reservation._native_effect._request
            request_value = json.loads(request._intent_bytes, object_pairs_hook=_no_duplicates)
            registration, authority = self._original_registration_and_principal_authority()
            origin = self._owner_payloads.get(registration['registrationId'], {}).get('origin')
            self._require_original_store_budget(reservation)
            verified_target = reservation._custodian._resolve_target_custody(
                reservation._target)
            self._require_original_store_budget(reservation)
            native_now = self._observe_native(
                self._profile.database_name,
                current_role=request_value['evidence']['controller']['name'],
                budget_reservation=reservation)
            self._require_original_store_budget(reservation)
            evidence_payload, _native_observation = self._native_store_preparation_payload(
                reservation._custodian._public_reference(reservation._target),
                verified_target, registration, authority, native_now,
                budget_reservation=reservation)
            if (evidence_payload != request_value['evidence'] or type(origin) is not dict
                    or not self._native_origin_matches(
                        origin, self._launch.get('nativeAttestation')
                        if self._launch is not None else None,
                        budget_reservation=reservation)):
                raise LocalPostgresError('local-postgresql-store-retry-authority-stale')
            reservation_record = json.loads(
                reservation._record_bytes, object_pairs_hook=_no_duplicates)
            absence = observe_absent_creation_schema(
                bounded, reservation_record['store']['schemaName'], native_now,
                request_value['evidence']['controller']['oid'])
            if absence is None:
                raise LocalPostgresError('local-postgresql-store-retry-schema-present')
            owner_state = self._owner_core.observe_original_request(
                self._authority_context, request.effect_key)
            if owner_state.effect_status != 'effect-pending':
                raise LocalPostgresError('local-postgresql-store-retry-core-not-pending')
            external_doc = reservation._custodian._journal._load()
            from .ingress_custody import JOURNAL_PROFILE_02, _replay
            external_state = _replay(external_doc['events'], profile=JOURNAL_PROFILE_02)
            store_state = next((item for item in external_state['stores'].values()
                                if item['id'] == reservation_record['reservationId']), None)
            reservation_entry = self._original_store_reservations[id(reservation)]
            if (store_state is None or store_state['status'] != 'reserved'
                    or store_state['reservationDigest']
                        != reservation_entry[1]['reservationDigest']):
                raise LocalPostgresError('local-postgresql-store-retry-custody-stale')
            attempt_proof = {
                'profile': 'umf.original-store-transaction-attempt-abort/0.1',
                'xid': attempt._xid,
                'database': {'name': attempt._database_name,
                             'oid': attempt._database_oid,
                             'systemIdentifier': attempt._system_identifier},
                'state': 'aborted',
            }
            native_observation_digest = _digest(native_now)
            transaction_digest = _digest({
                'profile': 'umf.original-store-known-aborted-observation/0.1',
                'reservationDigest': reservation_entry[1]['reservationDigest'],
                'attemptProofDigest': _digest(attempt_proof),
                'absenceProofDigest': _digest(absence),
                'nativeObservationDigest': native_observation_digest,
            })
            # Consume before the durable observation append. If the append
            # outcome is lost, its presence cannot reconstruct this live token.
            self._original_store_attempts[id(attempt)] = (
                attempt, reservation, 'consumed')
            self._require_original_store_budget(reservation)
            reservation._custodian._journal._observe_originals_store(
                purpose=self._profile.purpose,
                reservation_id=reservation_record['reservationId'],
                reservation_digest=reservation_entry[1]['reservationDigest'],
                supervisor_intent_digest=reservation_entry[1]['supervisorIntentDigest'],
                outcome='known-aborted', native_receipt=None,
                native_receipt_digest=None, schema_oid=None,
                native_observation_digest=native_observation_digest,
                transaction_outcome_digest=transaction_digest)
            self._require_original_store_budget(reservation)
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- uncertainty never becomes retry authority
            raise LocalPostgresError('local-postgresql-store-retry-settlement-unresolved') from None
        # Consume before dispatch. Lost process memory cannot reconstruct this
        # authorization from the durable attempt observation.
        return self._bind_original_store_creation_attempt(reservation, budget)

    @staticmethod
    def _require_original_store_attempt_aborted(
            attempt: _OriginalStoreCreationAttempt, row: object) -> None:
        """Accept only PostgreSQL's exact aborted result for the captured database/XID."""
        if (type(row) is not tuple or len(row) != 6
                or row[0] != attempt._database_name
                or type(row[1]) is not int or row[1] != attempt._database_oid
                or row[2] != attempt._system_identifier
                or type(row[3]) is not int or row[3] != attempt._backend_pid
                or row[4] != attempt._backend_start or row[5] != 'aborted'):
            raise LocalPostgresError('local-postgresql-store-attempt-noncommit-unproven')

    def open_originals_store_recovery(
            self, connection: object, *, provider_id: str) -> object:
        """Issue a restricted provider for one exact original store journal key."""
        with self._original_control_lease(operation_kind='store'):
            self._require_original_control_lease(operation_kind='store')
            if (type(provider_id) is not str
                    or provider_id != self._provider_id
                    or self._journal is None or self._custodian is None
                    or (self._custody_handle is None
                        and self._pending_original_store_recovery is None)):
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-unavailable')
            target = (self._custody_handle if self._custody_handle is not None
                      else self._pending_original_store_recovery[0])
            self._require_original_store_recovery_target(target)
            try:
                from psycopg import Connection
                if type(connection) is not Connection or connection.closed:
                    raise LocalPostgresError(
                        'local-postgresql-store-recovery-connection-invalid')
                if int(connection.info.transaction_status) != 0:
                    raise LocalPostgresError(
                        'local-postgresql-store-readonly-transaction-active')
                from .ingress_custody import JOURNAL_PROFILE_02, _replay
                from .row_originals import (
                    PgRowOriginalsStore, STORE_PROFILE,
                    _RECOVERY_PROVIDER_SEAL,
                )
                target_reference = self._custodian._public_reference(
                    target)
                verified_target = self._custodian._resolve_target_custody(
                    target)
                if (verified_target.reference != target_reference
                        or target_reference.get('custodianId') != self._custodian_id
                        or target_reference.get('resourceId') is None
                        or target_reference.get('incarnation') is None):
                    raise LocalPostgresError(
                        'local-postgresql-store-recovery-target-invalid')
                store = _store_descriptor(STORE_PROFILE, provider_id)
                external_doc = self._custodian._journal._load()
                external = _replay(
                    external_doc['events'], profile=JOURNAL_PROFILE_02)
                key = (target_reference['registrationId'], self._provider_id,
                       self._bound_installation_id, store['profile'],
                       store['storeId'], store['schemaName'])
                matches = [(candidate, state) for candidate, state
                           in external['stores'].items() if candidate == key]
                if len(matches) != 1:
                    raise LocalPostgresError(
                        'local-postgresql-store-recovery-outcome-unresolved')
                _selected_key, state = matches[0]
                reserved_events = [event for event in external_doc['events']
                                   if event['kind'] == 'originals-store-reserved'
                                   and event['payload']['reservation']['reservationId']
                                       == state.get('id')]
                if (state.get('status') not in {
                        'reserved', 'observed-committed', 'confirmed'}
                        or len(reserved_events) != 1
                        or reserved_events[0]['payload']['reservation'].get('store') != store
                        or reserved_events[0]['payload']['reservation'].get(
                            'targetCustody') != target_reference):
                    raise LocalPostgresError(
                        'local-postgresql-store-recovery-prefix-invalid')
                supervisor_intent = next((event['payload']
                    for event in self._journal.read()['events']
                    if event['kind'] == 'creation-intent'), None)
                if type(supervisor_intent) is not dict:
                    raise LocalPostgresError(
                        'local-postgresql-store-recovery-unavailable')
                return PgRowOriginalsStore._from_recovery(
                    _RECOVERY_PROVIDER_SEAL, supervisor=self,
                    connection=connection, provider_id=provider_id,
                    installation_id=self._bound_installation_id,
                    controller_role=supervisor_intent['controllerName'],
                    custodian=self._custodian, target=target)
            except LocalPostgresError:
                raise
            except Exception:  # noqa: BLE001 -- no authority from malformed prefix
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-unavailable') from None

    def recover_originals_store_creation(
            self, target: object, connection: object, *,
            store: dict[str, Any]) -> tuple[_OriginalStoreCreationReservation,
                                             _OriginalStoreCreationCapability,
                                             dict[str, Any]]:
        """Recover a committed receipt within a fresh, owned read-only window."""
        readonly_started_ns = time.monotonic_ns()
        self._require_original_control_lease(operation_kind='store')
        try:
            if int(connection.info.transaction_status) != 0:
                raise LocalPostgresError(
                    'local-postgresql-store-readonly-transaction-active')
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- caller transaction ownership is unprovable
            raise LocalPostgresError(
                'local-postgresql-store-readonly-transaction-unavailable') from None
        if not self._is_original_store_recovery_target(target) or self._journal is None:
            raise LocalPostgresError('local-postgresql-store-recovery-unverified')
        # Reuse the exact original reservation when one exists.  After a
        # process-local reservation has been lost, reconstruct only signed
        # request and journal identities here; intent creation is deferred
        # until the bounded observer has proved current authority and absence.
        reservation = next((entry[0] for entry in self._original_store_reservations.values()
                            if entry[0]._connection is connection), None)
        if reservation is None:
            try:
                from .ingress_custody import JOURNAL_PROFILE_02, _replay
                external_doc = self._custodian._journal._load()
                external_state = _replay(
                    external_doc['events'], profile=JOURNAL_PROFILE_02)
                target_reference = self._custodian._public_reference(target)
                key = (target_reference['registrationId'], self._provider_id,
                       self._bound_installation_id, store['profile'],
                       store['storeId'], store['schemaName'])
                store_state = external_state['stores'].get(key)
                reserved_event = next((event for event in external_doc['events']
                                       if event['kind'] == 'originals-store-reserved'
                                       and event['payload']['reservation']['reservationId']
                                           == (store_state['id'] if store_state else None)), None)
                if store_state is None or reserved_event is None:
                    raise LocalPostgresError(
                        'local-postgresql-store-readonly-unavailable')
                verified_target = self._custodian._resolve_target_custody(target)
                registration, authority = \
                    self._original_registration_and_principal_authority()
                if (reserved_event['payload']['reservation']['targetCustody']
                        != target_reference
                        or verified_target.reference.get('custodianId')
                            != self._custodian_id
                        or registration.get('registrationId')
                            != target_reference['registrationId']
                        or authority.get('approvalReceiptDigest')
                            != reserved_event['payload']['request']['evidence'].get(
                                'authorityPreparationReceiptDigest')):
                    raise LocalPostgresError(
                        'local-postgresql-store-recovery-authority-stale')
                effect, _outcome, request = self._recover_original_store_effect(
                    target, external_doc, store_state, reserved_event)
                record = store_state['reservation']
                record_bytes = _canonical(record)
                reservation_digest = store_state['reservationDigest']
            except LocalPostgresError:
                raise
            except Exception:  # noqa: BLE001 -- journal reconstruction is authority-sensitive
                raise LocalPostgresError(
                    'local-postgresql-store-readonly-unavailable') from None
            reservation_digest_for_budget = reservation_digest
            effect_for_budget = effect
            record_bytes_for_budget = record_bytes
            request_for_budget = request
        else:
            registry_entry = self._original_store_reservations[id(reservation)][1]
            reservation_digest_for_budget = registry_entry['reservationDigest']
            effect_for_budget = reservation._native_effect
            record_bytes_for_budget = reservation._record_bytes
            request_for_budget = reservation._evidence.owner_request
        budget = self._mint_original_store_readonly_budget(
            reservation, request_for_budget, effect_for_budget,
            reservation_digest_for_budget, record_bytes_for_budget,
            'recover', target, connection, store, readonly_started_ns)
        try:
            with self._connect_maintenance(
                    self._profile.database_name,
                    readonly_budget=budget) as recovery_connection:
                with self._original_store_readonly_transaction(
                        recovery_connection, budget) as bounded:
                    recovered = self._recover_originals_store_creation_readonly(
                        target, bounded, store=store, readonly_budget=budget)
                if (self._pending_original_store_recovery is not None
                        and self._pending_original_store_recovery[0] is target):
                    self._custody_handle = target
                    try:
                        if self._validate_original_store_custody_history(target):
                            raise LocalPostgresError(
                                'local-postgresql-store-history-incomplete')
                    except Exception:
                        self._custody_handle = None
                        raise
                    self._pending_original_store_recovery = None
                return recovered
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- no ambient transaction recovery
            raise LocalPostgresError('local-postgresql-store-recovery-unverified') from None

    def _recover_originals_store_creation_readonly(
            self, target: object, connection: object, *, store: dict[str, Any],
            readonly_budget: _OriginalStoreReadonlyBudget
            ) -> tuple[_OriginalStoreCreationReservation,
                       _OriginalStoreCreationCapability, dict[str, Any]]:
        """Reattach only a committed original store from its durable receipt chain.

        This path performs no DDL.  A pending or ambiguous native outcome stays
        fenced for a separate scope-specific recovery decision.
        """
        self._require_original_control_lease(operation_kind='store')
        if (not self._is_original_store_recovery_target(target) or self._journal is None
                or self._custodian is None or self._target_custody_journal_birth is None
                or type(store) is not dict
                or store != _store_descriptor(store.get('profile'), self._provider_id)):
            raise LocalPostgresError('local-postgresql-store-recovery-unverified')
        self._require_original_store_readonly_budget(readonly_budget)
        try:
            from .ingress_custody import JOURNAL_PROFILE_02, _replay
            external_doc = self._custodian._journal._load()
            external_state = _replay(external_doc['events'], profile=JOURNAL_PROFILE_02)
            target_reference = self._custodian._public_reference(target)
        except Exception:  # noqa: BLE001 -- no recovery authority from malformed state
            raise LocalPostgresError('local-postgresql-store-recovery-unavailable') from None
        key = (target_reference['registrationId'], self._provider_id,
               self._bound_installation_id, store['profile'], store['storeId'],
               store['schemaName'])
        store_state = external_state['stores'].get(key)
        if store_state is None:
            raise LocalPostgresError('local-postgresql-store-recovery-outcome-unresolved')
        reserved_event = next((event for event in external_doc['events']
                               if event['kind'] == 'originals-store-reserved'
                               and event['payload']['reservation']['reservationId']
                                   == store_state['id']), None)
        observations = store_state['observations']
        committed = next((item for item in reversed(observations)
                          if item['payload']['outcome'] == 'committed'), None)
        if reserved_event is None:
            raise LocalPostgresError('local-postgresql-store-recovery-receipt-unavailable')
        if (store_state['status'] not in ('reserved', 'observed-committed', 'confirmed')
                or (store_state['status'] in ('observed-committed', 'confirmed')
                    and committed is None)):
            raise LocalPostgresError('local-postgresql-store-recovery-outcome-unresolved')
        reservation_record = store_state['reservation']
        observation = committed['payload'] if committed is not None else None
        receipt = observation['nativeReceipt'] if observation is not None else None
        if observation is not None and (
                observation['reservationDigest'] != store_state['reservationDigest']
                or observation['supervisorIntentDigest']
                    != store_state.get('observedSupervisorIntentDigest')
                or observation['nativeReceiptDigest'] != _digest(receipt)
                or observation['schemaOid'] != receipt['schemaOid']
                or observation['transactionOutcomeDigest'] != _digest({
                    'profile': 'umf.original-store-committed-observation/0.1',
                    'reservationDigest': store_state['reservationDigest'],
                    'receiptDigest': observation['nativeReceiptDigest'],
                    'schemaOid': observation['schemaOid'],
                    'nativeObservationDigest': observation['nativeObservationDigest'],
                })):
            raise LocalPostgresError('local-postgresql-store-recovery-receipt-invalid')
        absence_proof = None
        absence_authorization = None
        try:
            native_effect, native_outcome, request = self._recover_original_store_effect(
                target, external_doc, store_state, reserved_event)
            if receipt is not None and native_effect is None:
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-intent-mismatch')
            request_value = json.loads(request._intent_bytes, object_pairs_hook=_no_duplicates)
            if (request_value != reserved_event['payload']['request']
                    or request._intent_digest != reservation_record['creationRequestDigest']):
                raise LocalPostgresError('local-postgresql-store-recovery-request-mismatch')
            intent_payload = request_value
            registration, authority = self._original_registration_and_principal_authority()
            origin = self._owner_payloads.get(registration['registrationId'], {}).get('origin')
            if type(origin) is not dict:
                raise LocalPostgresError('local-postgresql-store-recovery-origin-unverified')
            verified_target = self._custodian._resolve_target_custody(target)
            self._require_original_store_readonly_budget(readonly_budget)
            native_now = self._observe_native(
                self._profile.database_name,
                current_role=intent_payload['evidence']['controller']['name'],
                readonly_budget=readonly_budget)
            self._require_original_store_readonly_budget(readonly_budget)
            evidence_payload, native_observation = self._native_store_preparation_payload(
                target_reference, verified_target, registration, authority, native_now,
                readonly_budget=readonly_budget)
            recovery_observation = self._resolve_original_store_recovery_observation(
                intent_payload['evidence'], evidence_payload, native_observation,
                authority=authority,
                readonly_budget=readonly_budget)
            if not self._native_origin_matches(
                    origin, self._launch.get('nativeAttestation')
                    if self._launch is not None else None,
                    readonly_budget=readonly_budget):
                raise LocalPostgresError('local-postgresql-store-recovery-authority-stale')
            if receipt is None:
                from .row_originals_creation import (
                    observe_absent_creation_schema, recover_creation_receipt)
                absence_proof = observe_absent_creation_schema(
                    connection, store['schemaName'], native_now,
                    intent_payload['evidence']['controller']['oid'],
                    readonly=True)
                if absence_proof is not None:
                    absence_authorization = _VerifiedOriginalStoreAbsence(
                        _VERIFIED_STORE_ABSENCE_SEAL, self, readonly_budget,
                        store_state['reservationDigest'], store['schemaName'],
                        absence_proof)
                if absence_proof is None:
                    self._require_original_store_readonly_budget(readonly_budget)
                    receipt = recover_creation_receipt(connection, store['schemaName'], {
                        'profile': 'umf.originals-creation-receipt/0.1',
                        'providerId': reservation_record['providerId'],
                        'installationId': reservation_record['installationId'],
                        'storeProfile': store['profile'], 'storeId': store['storeId'],
                        'reservationDigest': store_state['reservationDigest'],
                        'creationRequestDigest': reservation_record['creationRequestDigest'],
                        'creationApprovalDigest': reservation_record['creationApprovalDigest'],
                        'targetCustodyDigest': _digest(reservation_record['targetCustody']),
                        'state': 'created'},
                        intent_payload['evidence']['controller']['oid'])
                    self._require_original_store_readonly_budget(readonly_budget)
                elif native_effect is None:
                    # A reserved-only or typed-intent-only cut cannot acquire
                    # an owner effect merely from absence.  Recheck all live
                    # authority/absence facts above, then append only the
                    # matching original intent chain; this path still performs
                    # no DDL and cannot restore a lost creation budget.
                    native_effect, native_outcome, request = \
                        self._recover_original_store_effect(
                            target, external_doc, store_state, reserved_event,
                            readonly_budget=readonly_budget,
                            recovery_observation=recovery_observation,
                            absence_authorization=absence_authorization)
                    if native_effect is None:
                        raise LocalPostgresError(
                            'local-postgresql-store-recovery-intent-unresolved')
                    object.__setattr__(readonly_budget, '_effect', native_effect)
            if (absence_proof is None
                    and (type(receipt) is not dict or receipt['schemaOid'] <= 0
                         or receipt['reservationDigest'] != store_state['reservationDigest'])):
                raise LocalPostgresError('local-postgresql-store-recovery-receipt-invalid')
            approval = self._owner_core._recover_verified_approval(request)
            self._owner_core._resolve_verified_approval(
                approval, original_request=request, scope='native-store-creation',
                intent_digest=request._intent_digest)
            evidence = _VerifiedNativeStorePreparation(
                _VERIFIED_STORE_PREPARATION_SEAL, self._store_issuer, self,
                self._custodian, target, verified_target, request,
                bytes(request._intent_bytes), _canonical(native_observation))
            self._store_preparations[id(evidence)] = (
                evidence, evidence, _canonical(origin), _canonical(registration),
                _canonical(authority))
            effect_handle = self._owner_core._bind_effect_digest(
                approval, _digest(native_effect._journal_record_digest))
            reservation = _OriginalStoreCreationReservation(
                _ORIGINAL_STORE_RESERVATION_SEAL, self, evidence=evidence,
                approval=approval, custodian=self._custodian, target=target,
                connection=readonly_budget._connection,
                effect_handle=effect_handle,
                native_effect=native_effect, record_bytes=_canonical(reservation_record),
                store=store, budget=None)
            object.__setattr__(readonly_budget, '_reservation', reservation)
            typed_event = next((event for event in self._journal.read()['events']
                                if event['kind'] == 'originals-store-creation-intent'
                                and event['payload'].get('reservationDigest')
                                    == store_state['reservationDigest']), None)
            if (typed_event is None
                    or (observation is not None
                        and typed_event['recordDigest']
                            != observation['supervisorIntentDigest'])):
                raise LocalPostgresError('local-postgresql-store-recovery-intent-mismatch')
            registry_entry = {
                'externalEventDigest': reserved_event['recordDigest'],
                'reservationDigest': store_state['reservationDigest'],
                'supervisorIntentDigest': typed_event['recordDigest'],
            }
            self._original_store_reservations[id(reservation)] = (
                reservation, registry_entry, recovery_observation)
            self._resolve_originals_store_creation_reservation(
                reservation, evidence=evidence, approval=approval,
                custodian=self._custodian, target=target, store=store, mode='recover',
                readonly_budget=readonly_budget)
            self._require_original_store_readonly_budget(readonly_budget)
            if absence_proof is None:
                from .row_originals_creation import verify_creation_receipt
                verified_receipt = verify_creation_receipt(
                    connection, store['schemaName'], receipt,
                    intent_payload['evidence']['controller']['oid'])
                if verified_receipt != receipt:
                    raise LocalPostgresError(
                        'local-postgresql-store-recovery-footprint-mismatch')
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- durable/native recovery is fail-closed
            raise LocalPostgresError('local-postgresql-store-recovery-unverified') from None

        if absence_proof is not None:
            # Catalog absence alone cannot establish transaction noncommit.
            # Recovery has no original live attempt handle, so it must remain
            # fenced and cannot terminalize either native or owner state.
            raise LocalPostgresError(
                'local-postgresql-store-recovery-noncommit-unproven')

        receipt_digest = _digest(receipt)
        if (native_outcome is not None
                and (native_outcome.status != 'confirmed'
                     or native_outcome.receipt_digest != receipt_digest)):
            raise LocalPostgresError('local-postgresql-store-recovery-outcome-conflict')
        if observation is None:
            try:
                self._require_original_store_readonly_budget(readonly_budget)
                native = self._observe_native(
                    self._profile.database_name,
                    current_role=intent_payload['evidence']['controller']['name'],
                    readonly_budget=readonly_budget)
                self._require_original_store_readonly_budget(readonly_budget)
                native_observation_digest = _digest(native)
                transaction_digest = _digest({
                    'profile': 'umf.original-store-committed-observation/0.1',
                    'reservationDigest': store_state['reservationDigest'],
                    'receiptDigest': receipt_digest, 'schemaOid': receipt['schemaOid'],
                    'nativeObservationDigest': native_observation_digest,
                })
                observed = self._custodian._journal._observe_originals_store(
                    purpose=store_state['purpose'], reservation_id=store_state['id'],
                    reservation_digest=store_state['reservationDigest'],
                    supervisor_intent_digest=self._original_store_reservations[
                        id(reservation)][1]['supervisorIntentDigest'],
                    outcome='committed', native_receipt=receipt,
                    native_receipt_digest=receipt_digest, schema_oid=receipt['schemaOid'],
                    native_observation_digest=native_observation_digest,
                    transaction_outcome_digest=transaction_digest)
                self._require_original_store_readonly_budget(readonly_budget)
                committed = {'eventDigest': observed['recordDigest']}
                store_state['status'] = 'observed-committed'
                store_state['observedSupervisorIntentDigest'] = \
                    self._original_store_reservations[id(reservation)][1][
                        'supervisorIntentDigest']
                store_state['nativeReceiptDigest'] = receipt_digest
                store_state['schemaOid'] = receipt['schemaOid']
                observation = {
                    'supervisorIntentDigest': self._original_store_reservations[
                        id(reservation)][1]['supervisorIntentDigest'],
                    'nativeReceiptDigest': receipt_digest, 'schemaOid': receipt['schemaOid'],
                }
            except Exception:  # noqa: BLE001 -- no positive observation, no settlement
                raise LocalPostgresError('local-postgresql-store-recovery-observation-unresolved') from None

        receipt_digest = observation['nativeReceiptDigest']
        if store_state['status'] == 'observed-committed':
            self._require_original_store_readonly_budget(readonly_budget)
            confirmation = self._custodian._journal._confirm_originals_store(
                purpose=store_state['purpose'], reservation_id=store_state['id'],
                reservation_digest=store_state['reservationDigest'],
                supervisor_intent_digest=observation['supervisorIntentDigest'],
                observation_event_digest=committed['eventDigest'],
                native_receipt_digest=receipt_digest, schema_oid=observation['schemaOid'])
        else:
            confirmation = next((event for event in external_doc['events']
                                 if event['kind'] == 'originals-store-confirmed'
                                 and event['payload']['reservationId'] == store_state['id']), None)
            if (confirmation is None
                    or confirmation['payload']['observationEventDigest']
                        != committed['eventDigest']):
                raise LocalPostgresError('local-postgresql-store-recovery-confirmation-mismatch')
            confirmation = {'recordDigest': confirmation['recordDigest']}
        supervisor_confirmation = next((event for event in self._journal.read()['events']
                                        if event['kind'] == 'originals-store-creation-confirmed'
                                        and event['payload'].get('reservationDigest')
                                            == store_state['reservationDigest']), None)
        if supervisor_confirmation is None:
            self._require_original_store_readonly_budget(readonly_budget)
            self._append_supervisor_journal('originals-store-creation-confirmed', {
                'purpose': store_state['purpose'],
                'reservationDigest': store_state['reservationDigest'],
                'supervisorIntentDigest': observation['supervisorIntentDigest'],
                'custodianConfirmationDigest': confirmation['recordDigest'],
                'nativeReceiptDigest': receipt_digest, 'schemaOid': observation['schemaOid'],
            })
        elif (supervisor_confirmation['payload'].get('custodianConfirmationDigest')
              != confirmation['recordDigest']):
            raise LocalPostgresError('local-postgresql-store-recovery-confirmation-mismatch')
        if native_outcome is None:
            self._require_original_store_readonly_budget(readonly_budget)
            native_outcome = self._record_native_effect_outcome(
                native_effect, 'confirmed', receipt, effect_handle)
        elif (native_outcome.status != 'confirmed'
              or native_outcome.receipt_digest != receipt_digest):
            raise LocalPostgresError('local-postgresql-store-recovery-outcome-mismatch')
        owner_state = self._owner_core.observe_original_request(
            self._authority_context, request.effect_key)
        if owner_state.effect_status == 'effect-pending':
            self._require_original_store_readonly_budget(readonly_budget)
            self._owner_core._finish_effect_digest(
                request, _digest(native_effect._journal_record_digest),
                status='confirmed', receipt_digest=native_outcome.receipt_digest)
        elif (owner_state.effect_status != 'confirmed'
              or owner_state.effect_receipt_digest != receipt_digest):
            raise LocalPostgresError('local-postgresql-store-recovery-core-mismatch')
        capability = _OriginalStoreCreationCapability(
            _ORIGINAL_STORE_CAPABILITY_SEAL, self, reservation, receipt_digest)
        self._original_store_capabilities[id(capability)] = (capability, reservation)
        self._resolve_original_store_capability(
            capability, original_reservation=reservation,
            readonly_budget=readonly_budget)
        return reservation, capability, json.loads(_canonical(receipt))

    def _resolve_originals_store_creation_reservation(
            self, value: object, *, evidence: object, approval: object,
            custodian: object, target: object, store: dict[str, Any],
            mode: str = 'execute',
            budget_reservation: _OriginalStoreCreationReservation | None = None,
            readonly_budget: _OriginalStoreReadonlyBudget | None = None
            ) -> _OriginalStoreCreationReservation:
        if (type(value) is not _OriginalStoreCreationReservation
                or value._issuer is not self or value._evidence is not evidence
                or value._approval is not approval or value._custodian is not custodian
                or value._target is not target or value._store != _canonical(store)):
            raise LocalPostgresError('local-postgresql-store-reservation-unverified')
        entry = self._original_store_reservations.get(id(value))
        if entry is None or entry[0] is not value:
            raise LocalPostgresError('local-postgresql-store-reservation-unverified')
        if budget_reservation is not None:
            if budget_reservation is not value:
                raise LocalPostgresError('local-postgresql-store-budget-unavailable')
            self._require_original_store_budget(value)
        reservation = json.loads(value._record_bytes, object_pairs_hook=_no_duplicates)
        if mode == 'recover' and readonly_budget is not None:
            self._require_original_store_readonly_budget(readonly_budget)
            recovery_observation = entry[2]
            try:
                original_request_payload = json.loads(
                    value._native_effect._request._intent_bytes,
                    object_pairs_hook=_no_duplicates)
            except Exception:  # noqa: BLE001 -- only the original signed bytes are authority
                raise LocalPostgresError(
                    'local-postgresql-store-reservation-stale') from None
            if (type(recovery_observation) is not _VerifiedOriginalStoreRecoveryObservation
                    or recovery_observation._issuer is not self
                    or recovery_observation._budget is not readonly_budget
                    or recovery_observation._request is not value._native_effect._request
                    or recovery_observation._reservation_digest
                        != entry[1]['reservationDigest']
                    or readonly_budget._reservation is not value
                    or readonly_budget._effect is not value._native_effect
                    or readonly_budget._connection is not value._connection
                    or recovery_observation._original_payload_bytes
                        != _canonical(original_request_payload.get('evidence'))
                    or value._evidence._payload_bytes
                        != value._native_effect._request._intent_bytes
                    or recovery_observation._actual_observation_bytes
                        != value._evidence.native_observation_bytes
                    or reservation['store'] != store):
                raise LocalPostgresError('local-postgresql-store-reservation-stale')
            resolved = recovery_observation
        else:
            if readonly_budget is not None:
                self._require_original_store_readonly_budget(readonly_budget)
            resolved = self._resolve_original_store_preparation(
                evidence, approval, custodian=custodian, target=target,
                budget_reservation=budget_reservation)
            if budget_reservation is not None:
                self._require_original_store_budget(value)
            if (resolved['store'] != store or reservation['store'] != store
                    or _canonical(resolved) != _canonical(entry[2])):
                raise LocalPostgresError('local-postgresql-store-reservation-stale')
        if reservation['store'] != store:
            raise LocalPostgresError('local-postgresql-store-reservation-stale')
        try:
            from .ingress_custody import JOURNAL_PROFILE_02, _replay
            if budget_reservation is not None:
                self._require_original_store_budget(value)
            doc = custodian._journal._load()
            external_state = _replay(doc['events'], profile=JOURNAL_PROFILE_02)
            if budget_reservation is not None:
                self._require_original_store_budget(value)
        except Exception:  # noqa: BLE001
            raise LocalPostgresError('local-postgresql-store-reservation-stale') from None
        store_state = next((item for item in external_state['stores'].values()
                            if item['id'] == reservation['reservationId']), None)
        if (store_state is None or store_state['reservation'] != reservation
                or store_state['reservationDigest'] != entry[1]['reservationDigest']):
            raise LocalPostgresError('local-postgresql-store-reservation-stale')
        external_event = next((event for event in doc['events']
                               if event['kind'] == 'originals-store-reserved'
                               and event['payload']['reservation']['reservationId']
                                   == reservation['reservationId']), None)
        if budget_reservation is not None:
            self._require_original_store_budget(value)
        supervisor_events = self._journal.read()['events']
        if budget_reservation is not None:
            self._require_original_store_budget(value)
        typed_event = next((event for event in supervisor_events
                            if event['kind'] == 'originals-store-creation-intent'
                            and event['payload']['reservationDigest']
                                == entry[1]['reservationDigest']), None)
        if (external_event is None
                or external_event['recordDigest'] != entry[1]['externalEventDigest']
                or typed_event is None
                or typed_event['payload']['custodianReservedEventDigest']
                    != external_event['recordDigest']):
            raise LocalPostgresError('local-postgresql-store-reservation-stale')
        if budget_reservation is not None:
            self._require_original_store_budget(value)
        self._resolve_native_effect_reservation(value._native_effect, approval)
        if budget_reservation is not None:
            self._require_original_store_budget(value)
        self._require_bound_pending_effect(
            value._native_effect, value._effect_handle, mode=mode)
        if budget_reservation is not None:
            self._require_original_store_budget(value)
        return value

    def confirm_originals_store_creation(
            self, reservation: object, *, receipt: dict[str, Any]) -> _OriginalStoreCreationCapability:
        """Confirm only the exact committed receipt on the reserved original store."""
        readonly_started_ns = time.monotonic_ns()
        self._require_original_control_lease(operation_kind='store')
        entry = self._original_store_reservations.get(id(reservation))
        if (type(reservation) is not _OriginalStoreCreationReservation
                or entry is None or entry[0] is not reservation
                or type(receipt) is not dict or self._journal is None):
            raise LocalPostgresError('local-postgresql-store-confirmation-unverified')
        connection = reservation._connection
        registry_entry = self._original_store_reservations[id(reservation)][1]
        readonly_budget = self._mint_original_store_readonly_budget(
            reservation, reservation._evidence.owner_request,
            reservation._native_effect, registry_entry['reservationDigest'],
            reservation._record_bytes, 'confirm', reservation._target, connection,
            json.loads(reservation._store), readonly_started_ns)
        try:
            self._require_original_store_readonly_budget(readonly_budget)
            original_payload = json.loads(reservation._evidence._payload_bytes,
                                          object_pairs_hook=_no_duplicates)
            evidence = original_payload.get('evidence')
            registration, authority = self._original_registration_and_principal_authority()
            verified_target = reservation._custodian._resolve_target_custody(
                reservation._target)
            reference = reservation._custodian._public_reference(reservation._target)
            current_native = self._observe_native(
                self._profile.database_name,
                current_role=evidence['controller']['name'],
                readonly_budget=readonly_budget)
            actual_evidence, actual_observation = self._native_store_preparation_payload(
                reference, verified_target, registration, authority, current_native,
                readonly_budget=readonly_budget)
            recovery_observation = self._resolve_original_store_recovery_observation(
                evidence, actual_evidence, actual_observation, authority=authority,
                readonly_budget=readonly_budget)
            origin = self._owner_payloads.get(
                registration['registrationId'], {}).get('origin', {})
            if (self._launch is None or not self._native_origin_matches(
                    origin, self._launch.get('nativeAttestation'),
                    readonly_budget=readonly_budget)):
                raise LocalPostgresError('local-postgresql-store-origin-unverified')
            self._original_store_reservations[id(reservation)] = (
                reservation, registry_entry, recovery_observation)
            self._resolve_originals_store_creation_reservation(
                reservation, evidence=reservation._evidence,
                approval=reservation._approval, custodian=reservation._custodian,
                target=reservation._target, store=json.loads(reservation._store),
                mode='recover', readonly_budget=readonly_budget)
            reserved = json.loads(reservation._record_bytes, object_pairs_hook=_no_duplicates)
            expected_fields = {
                'profile': 'umf.originals-creation-receipt/0.1',
                'providerId': reserved['providerId'],
                'installationId': reserved['installationId'],
                'storeProfile': reserved['store']['profile'],
                'storeId': reserved['store']['storeId'],
                'reservationDigest': _digest(reserved),
                'creationRequestDigest': reserved['creationRequestDigest'],
                'creationApprovalDigest': reserved['creationApprovalDigest'],
                'targetCustodyDigest': _digest(reserved['targetCustody']),
                'state': 'created',
            }
            from .row_originals_creation import verify_creation_receipt
            if (type(receipt) is not dict or any(receipt.get(key) != value
                                                 for key, value in expected_fields.items())):
                raise LocalPostgresError('local-postgresql-store-receipt-mismatch')
            with self._connect_maintenance(
                    self._profile.database_name,
                    readonly_budget=readonly_budget) as recovery_connection:
                with self._original_store_readonly_transaction(
                        recovery_connection, readonly_budget) as readonly_connection:
                    verified_receipt = verify_creation_receipt(
                        readonly_connection, reserved['store']['schemaName'], receipt,
                        evidence['controller']['oid'])
            self._require_original_store_readonly_budget(readonly_budget)
            if verified_receipt != receipt:
                raise LocalPostgresError('local-postgresql-store-receipt-mismatch')
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- native/catalog details remain private
            raise LocalPostgresError('local-postgresql-store-footprint-unverified') from None
        receipt_digest = _digest(receipt)
        self._require_original_store_readonly_budget(readonly_budget)
        native = self._observe_native(self._profile.database_name,
                                      current_role=json.loads(
                                          reservation._evidence._payload_bytes)
                                      ['evidence']['controller']['name'],
                                      readonly_budget=readonly_budget)
        self._require_original_store_readonly_budget(readonly_budget)
        if (self._launch is None
                or not self._native_origin_matches(
                    self._owner_payloads.get(
                        reserved['targetCustody']['registrationId'], {}).get('origin', {}),
                    self._launch.get('nativeAttestation'),
                    readonly_budget=readonly_budget)):
            raise LocalPostgresError('local-postgresql-store-origin-unverified')
        native_observation_digest = _digest(native)
        transaction_digest = _digest({
            'profile': 'umf.original-store-committed-observation/0.1',
            'reservationDigest': entry[1]['reservationDigest'],
            'receiptDigest': receipt_digest,
            'schemaOid': receipt['schemaOid'],
            'nativeObservationDigest': native_observation_digest,
        })
        try:
            self._require_original_store_readonly_budget(readonly_budget)
            observed = reservation._custodian._journal._observe_originals_store(
                purpose=self._profile.purpose,
                reservation_id=reserved['reservationId'],
                reservation_digest=entry[1]['reservationDigest'],
                supervisor_intent_digest=entry[1]['supervisorIntentDigest'],
                outcome='committed', native_receipt=receipt,
                native_receipt_digest=receipt_digest, schema_oid=receipt['schemaOid'],
                native_observation_digest=native_observation_digest,
                transaction_outcome_digest=transaction_digest)
            self._require_original_store_readonly_budget(readonly_budget)
            confirmed = reservation._custodian._journal._confirm_originals_store(
                purpose=self._profile.purpose,
                reservation_id=reserved['reservationId'],
                reservation_digest=entry[1]['reservationDigest'],
                supervisor_intent_digest=entry[1]['supervisorIntentDigest'],
                observation_event_digest=observed['recordDigest'],
                native_receipt_digest=receipt_digest, schema_oid=receipt['schemaOid'])
        except Exception:  # noqa: BLE001 -- retain original pending state for recovery
            raise LocalPostgresError('local-postgresql-store-custody-confirmation-unresolved') from None
        self._require_original_store_readonly_budget(readonly_budget)
        self._append_supervisor_journal('originals-store-creation-confirmed', {
            'purpose': self._profile.purpose,
            'reservationDigest': entry[1]['reservationDigest'],
            'supervisorIntentDigest': entry[1]['supervisorIntentDigest'],
            'custodianConfirmationDigest': confirmed['recordDigest'],
            'nativeReceiptDigest': receipt_digest, 'schemaOid': receipt['schemaOid'],
        })
        self._require_original_store_readonly_budget(readonly_budget)
        outcome = self._record_native_effect_outcome(
            reservation._native_effect, 'confirmed', receipt,
            reservation._effect_handle)
        try:
            self._require_original_store_readonly_budget(readonly_budget)
            self._owner_core._finish_effect_digest(
                reservation._native_effect._request,
                _digest(reservation._native_effect._journal_record_digest),
                status='confirmed', receipt_digest=outcome.receipt_digest)
        except Exception:  # noqa: BLE001 -- no capability without core completion
            raise LocalPostgresError('local-postgresql-store-owner-completion-unresolved') from None
        capability = _OriginalStoreCreationCapability(
            _ORIGINAL_STORE_CAPABILITY_SEAL, self, reservation, receipt_digest)
        self._original_store_capabilities[id(capability)] = (capability, reservation)
        return capability

    def _resolve_original_store_capability(
            self, value: object, *, original_reservation: object,
            readonly_budget: _OriginalStoreReadonlyBudget | None = None
            ) -> _OriginalStoreCreationCapability:
        if (type(value) is not _OriginalStoreCreationCapability
                or value._issuer is not self or value._reservation is not original_reservation
                or self._original_store_capabilities.get(id(value))
                    != (value, original_reservation)):
            raise LocalPostgresError('local-postgresql-store-capability-unverified')
        registry_entry = self._original_store_reservations.get(id(original_reservation))
        if registry_entry is None or registry_entry[0] is not original_reservation:
            raise LocalPostgresError('local-postgresql-store-capability-unverified')
        recovery_authority = registry_entry[2]
        try:
            original_request_payload = json.loads(
                original_reservation._native_effect._request._intent_bytes,
                object_pairs_hook=_no_duplicates)
        except Exception:  # noqa: BLE001 -- only original request bytes are authority
            raise LocalPostgresError(
                'local-postgresql-store-capability-unverified') from None
        if (type(recovery_authority) is _VerifiedOriginalStoreRecoveryObservation
                and recovery_authority._issuer is self
                and recovery_authority._request
                    is original_reservation._native_effect._request
                and recovery_authority._reservation_digest
                    == registry_entry[1]['reservationDigest']
                and recovery_authority._original_payload_bytes
                    == _canonical(original_request_payload.get('evidence'))
                and recovery_authority._actual_observation_bytes
                    == original_reservation._evidence.native_observation_bytes):
            # The full readonly observation already validated the exact original
            # evidence against live authority. Do not reinterpret it as creation/off.
            if readonly_budget is not None:
                self._require_original_store_readonly_budget(readonly_budget)
        else:
            self._resolve_originals_store_creation_reservation(
                original_reservation, evidence=original_reservation._evidence,
                approval=original_reservation._approval,
                custodian=original_reservation._custodian,
                target=original_reservation._target,
                store=json.loads(original_reservation._store), mode='recover',
                readonly_budget=readonly_budget)
        try:
            from .ingress_custody import JOURNAL_PROFILE_02, _replay
            external_doc = original_reservation._custodian._journal._load()
            external_state = _replay(external_doc['events'], profile=JOURNAL_PROFILE_02)
            record = json.loads(original_reservation._record_bytes,
                                 object_pairs_hook=_no_duplicates)
            store_state = next((item for item in external_state['stores'].values()
                                if item['id'] == record['reservationId']), None)
            reservation_entry = self._original_store_reservations.get(
                id(original_reservation))
            if reservation_entry is None or reservation_entry[0] is not original_reservation:
                raise LocalPostgresError('local-postgresql-store-capability-unverified')
            supervisor_events = self._journal.read()['events']
            typed = next((event for event in supervisor_events
                          if event['kind'] == 'originals-store-creation-intent'
                          and event['payload']['reservationDigest']
                              == reservation_entry[1]['reservationDigest']), None)
            typed_confirmation = next((event for event in supervisor_events
                                       if event['kind'] == 'originals-store-creation-confirmed'
                                       and event['payload']['reservationDigest']
                                           == _digest(record)), None)
            native_outcome_event = next((event for event in supervisor_events
                                         if event['kind'] == 'native-effect-confirmed'
                                         and event['payload']['reservationId']
                                             == original_reservation._native_effect._reservation_id), None)
            core_pending, core_outcome = self._owner_core._ledger.observe_effect(
                original_reservation._native_effect._request._approval_id)
            outcomes = [outcome for outcome in self._native_effect_outcomes.values()
                        if outcome._reservation is original_reservation._native_effect]
            if (store_state is None or store_state['status'] != 'confirmed'
                    or store_state['nativeReceiptDigest'] != value._receipt_digest
                    or typed is None or typed_confirmation is None
                    or typed_confirmation['payload']['nativeReceiptDigest']
                        != value._receipt_digest
                    or native_outcome_event is None
                    or native_outcome_event['payload']['receiptDigest'] != value._receipt_digest
                    or core_pending is None or core_outcome is None
                    or core_outcome.get('status') != 'confirmed'
                    or core_outcome.get('reservationDigest')
                        != _digest(original_reservation._native_effect._journal_record_digest)
                    or core_outcome.get('receiptDigest') != value._receipt_digest
                    or not any(item.status == 'confirmed'
                               and item.receipt_digest == value._receipt_digest
                               for item in outcomes)):
                raise LocalPostgresError('local-postgresql-store-capability-unverified')
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- any incomplete cross-chain evidence refuses
            raise LocalPostgresError('local-postgresql-store-capability-unverified') from None
        return value

    def _resolve_original_store_preparation(self, evidence: object, approval: object, *,
                                            custodian: object, target: object,
                                            budget_reservation: _OriginalStoreCreationReservation | _OriginalStoreCreationBudget | None = None,
                                            readonly_budget: _OriginalStoreReadonlyBudget | None = None):
        from .ingress_custody import CustodyJournalError
        from .owner_approval_core import OwnerAuthorityError, VerifiedOwnerApproval
        if (type(evidence) is not _VerifiedNativeStorePreparation
                or evidence._issuer is not self._store_issuer
                or evidence.supervisor is not self
                or evidence.custodian is not custodian
                or evidence.target_handle is not target):
            raise LocalPostgresError('local-postgresql-store-preparation-unverified')
        if budget_reservation is not None and readonly_budget is not None:
            raise LocalPostgresError('local-postgresql-store-observation-budget-ambiguous')
        if readonly_budget is not None:
            self._require_original_store_readonly_budget(readonly_budget)
        entry = self._store_preparations.get(id(evidence))
        if (entry is None or entry[0] is not evidence or entry[1] is not evidence):
            raise LocalPostgresError('local-postgresql-store-preparation-unverified')
        if type(approval) is not VerifiedOwnerApproval:
            raise LocalPostgresError('local-postgresql-final-approval-unverified')
        try:
            self._owner_core._resolve_verified_approval(
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
        if budget_reservation is not None:
            self._require_original_store_budget(budget_reservation)
        native = self._observe_native(
            self._profile.database_name, current_role=controller,
            budget_reservation=budget_reservation, readonly_budget=readonly_budget)
        if budget_reservation is not None:
            self._require_original_store_budget(budget_reservation)
        if readonly_budget is not None:
            self._require_original_store_readonly_budget(readonly_budget)
        attestation = self._launch.get('nativeAttestation')
        origin = self._owner_payloads.get(registration['registrationId'], {}).get('origin', {})
        if (_canonical(registration) != entry[3]
                or _canonical(authority) != entry[4]
                or _canonical(origin) != entry[2]
                or registration_event['payloadDigest'] != registration['payloadDigest']):
            raise LocalPostgresError('local-postgresql-store-preparation-stale')
        fresh_payload, fresh_observation = self._native_store_preparation_payload(
            self._custodian._public_reference(target), verified, registration,
            authority, native, budget_reservation=budget_reservation,
            readonly_budget=readonly_budget)
        if budget_reservation is not None:
            self._require_original_store_budget(budget_reservation)
        if readonly_budget is not None:
            self._require_original_store_readonly_budget(readonly_budget)
        if (not self._native_origin_matches(
                    origin, attestation, budget_reservation=budget_reservation,
                    readonly_budget=readonly_budget)
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
                'nativeObservation': fresh_observation}

    def _resolve_recovered_original_store_current_authority(
            self, reservation: _OriginalStoreCreationReservation,
            capability: _OriginalStoreCreationCapability,
            connection: object) -> dict[str, Any]:
        """Refresh current authority for a fully settled recovered store.

        This is deliberately separate from the original creation/OFF resolver:
        the signed request and approval remain the immutable authority, while
        every current native fact is observed truthfully through a distinct
        bounded read-only invocation.
        """
        if (type(reservation) is not _OriginalStoreCreationReservation
                or type(capability) is not _OriginalStoreCreationCapability
                or reservation._issuer is not self
                or reservation._budget is not None
                or reservation._evidence.owner_request is not capability._reservation._evidence.owner_request
                or capability._issuer is not self
                or capability._reservation is not reservation
                or self._original_store_capabilities.get(id(capability))
                    != (capability, reservation)):
            raise LocalPostgresError(
                'local-postgresql-store-recovery-authority-unverified')
        started_ns = time.monotonic_ns()
        budget = self._mint_original_store_readonly_budget(
            reservation, reservation._evidence.owner_request,
            reservation._native_effect,
            self._original_store_reservations[id(reservation)][1]['reservationDigest'],
            reservation._record_bytes, 'confirm', self._custody_handle,
            connection, json.loads(reservation._store), started_ns)
        try:
            if self._resolve_original_store_capability(
                    capability, original_reservation=reservation,
                    readonly_budget=budget) is not capability:
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-authority-unverified')
            evidence = reservation._evidence
            approval = reservation._approval
            entry = self._store_preparations.get(id(evidence))
            if (type(evidence) is not _VerifiedNativeStorePreparation
                    or evidence._issuer is not self._store_issuer
                    or evidence.supervisor is not self
                    or evidence.custodian is not reservation._custodian
                    or evidence.target_handle is not reservation._target
                    or entry is None or entry[0] is not evidence or entry[1] is not evidence
                    or self._journal is None or self._launch is None):
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-authority-unverified')
            self._owner_core._resolve_verified_approval(
                approval, original_request=evidence.owner_request,
                scope='native-store-creation',
                intent_digest=evidence.owner_request._intent_digest)
            verified_target = reservation._custodian._resolve_target_custody(
                reservation._target)
            if verified_target is not evidence.verified_target:
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-target-mismatch')
            try:
                request_payload = json.loads(
                    evidence.owner_request._intent_bytes,
                    object_pairs_hook=_no_duplicates)
                retained_payload = json.loads(
                    evidence._payload_bytes, object_pairs_hook=_no_duplicates)
            except Exception:  # noqa: BLE001 -- exact signed bytes are the authority
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-request-mismatch') from None
            if (type(request_payload) is not dict
                    or retained_payload != request_payload
                    or type(retained_payload.get('evidence')) is not dict
                    or retained_payload.get('profile')
                        != 'umf.owner-store-create-intent/0.1'
                    or retained_payload.get('store') != json.loads(reservation._store)):
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-request-mismatch')
            intent = next((event['payload'] for event in self._journal.read()['events']
                           if event['kind'] == 'creation-intent'), None)
            if type(intent) is not dict:
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-authority-unverified')
            registration, authority = self._original_registration_and_principal_authority()
            registration_event = _owner_registration_approval_payload(
                self._journal.read()['events'])
            origin = self._owner_payloads.get(
                registration['registrationId'], {}).get('origin', {})
            if (_canonical(registration) != entry[3]
                    or _canonical(authority) != entry[4]
                    or _canonical(origin) != entry[2]
                    or registration_event['payloadDigest']
                        != registration['payloadDigest']):
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-authority-stale')
            payload = retained_payload['evidence']
            store = retained_payload['store']
            if store != _store_descriptor(store.get('profile'), self._provider_id):
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-request-mismatch')
            self._require_original_store_readonly_budget(budget)
            native_now = self._observe_native(
                self._profile.database_name, current_role=intent['controllerName'],
                readonly_budget=budget)
            self._require_original_store_readonly_budget(budget)
            reference = reservation._custodian._public_reference(reservation._target)
            actual_payload, actual_observation = self._native_store_preparation_payload(
                reference, verified_target, registration, authority, native_now,
                readonly_budget=budget)
            current_observation = self._resolve_original_store_recovery_observation(
                payload, actual_payload, actual_observation,
                authority=authority, readonly_budget=budget)
            if not self._native_origin_matches(
                    origin, self._launch.get('nativeAttestation'),
                    readonly_budget=budget):
                raise LocalPostgresError(
                    'local-postgresql-store-recovery-authority-stale')
            self._require_original_store_readonly_budget(budget)
            return {
                'profile': payload['profile'], 'payload': payload,
                'store': dict(store), 'verifiedTarget': verified_target,
                'approval': approval,
                # Keep the truthful live readonly observation. The payload
                # remains the immutable signed authority used for caller-session
                # checks; no readonly facts are normalized to OFF.
                'nativeObservation': actual_observation,
                'targetCustody': reference,
                'creationReservationDigest': budget._reservation_digest,
            }
        except LocalPostgresError:
            raise
        except Exception:  # noqa: BLE001 -- current-authority observation is fail-closed
            object.__setattr__(budget, '_fenced', True)
            raise LocalPostgresError(
                'local-postgresql-store-recovery-authority-unverified') from None

    def stop(self) -> None:
        """Stop only this adapter's verified server process group."""
        with self._original_control_lease(operation_kind='process-recover'):
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

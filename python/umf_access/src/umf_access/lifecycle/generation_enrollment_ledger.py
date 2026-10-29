# SPDX-License-Identifier: MIT OR Apache-2.0
"""Separate signed authority for existing-head initial generation enrollment.

This module owns only the logical two-scope approval domain.  It does not
create PostgreSQL roles, epochs, fences, or public generation capabilities.
Those effects require the original native provider and its independently
qualified issuer.
"""
from __future__ import annotations

import base64
import fcntl
import hashlib
import json
import os
import re
import stat
import uuid
from contextlib import contextmanager
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
_CONTEXT_SEAL = object()
_CONTEXT_REGISTRY_PROFILE = 'umf.generation-authority-context-registry/0.2'
_TRUST_SEAL = object()
_TRUST_ISSUER_ORIGINS: dict[int, tuple[object, str, object, object]] = {}
_REQUEST_SEAL = object()
_APPROVAL_SEAL = object()
_RESERVATION_SEAL = object()
_OUTCOME_SEAL = object()


class GenerationEnrollmentAuthorityError(RuntimeError):
    """Fixed refusal without signed payloads, secrets, or filesystem paths."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


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


class _Ledger:
    """Bound append-only ledger; existing-history reads never create files."""

    __slots__ = ('_authority_id', '_config_digest', '_context_digest', '_path', '_purpose')

    def __init__(self, path: str | os.PathLike[str], authority_id: str,
                 config_digest: str, context_digest: str, purpose: str):
        raw = os.fspath(path)
        if type(raw) is not str or not raw.startswith('/') or os.path.normpath(raw) != raw:
            _fail('generation-authority-ledger-path-invalid')
        self._path = Path(raw)
        self._authority_id = authority_id
        self._config_digest = config_digest
        self._context_digest = context_digest
        self._purpose = purpose

    @property
    def path(self) -> Path:
        return self._path

    @contextmanager
    def _locked(self, *, create: bool, birth: bool = False, exclusive: bool = False):
        # The lock and ledger must already live in an owned private directory.
        parent = self._path.parent
        try:
            pstat = parent.lstat()
        except OSError:
            _fail('generation-authority-ledger-unavailable')
        if (not stat.S_ISDIR(pstat.st_mode) or stat.S_ISLNK(pstat.st_mode)
                or pstat.st_uid != os.geteuid() or pstat.st_mode & 0o077):
            _fail('generation-authority-ledger-path-invalid')
        lock_path = self._path.with_name(self._path.name + '.lock')
        if create and not birth and (self._path.exists() or lock_path.exists()):
            _fail('generation-authority-original-history-missing')
        flags = os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0)
        if create:
            flags |= os.O_CREAT
        try:
            lock_fd = os.open(lock_path, flags, 0o600)
        except OSError:
            _fail('generation-authority-ledger-unavailable')
        try:
            st = os.fstat(lock_fd)
            if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                    or st.st_nlink != 1 or st.st_mode & 0o077):
                _fail('generation-authority-ledger-path-invalid')
            fcntl.flock(lock_fd, fcntl.LOCK_EX if create or exclusive else fcntl.LOCK_SH)
            yield lock_fd
        finally:
            os.close(lock_fd)

    def _read(self, *, create: bool) -> list[dict[str, Any]]:
        with self._locked(create=create):
            return self._read_locked(create=create)

    def _read_locked(self, *, create: bool) -> list[dict[str, Any]]:
            flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0)
            try:
                fd = os.open(self._path, flags)
            except FileNotFoundError:
                if not create:
                    _fail('generation-authority-original-history-missing')
                fd = os.open(self._path, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                             | getattr(os, 'O_NOFOLLOW', 0), 0o600)
                os.fsync(fd)
                os.close(fd)
                parent_fd = os.open(self._path.parent, os.O_RDONLY)
                try:
                    os.fsync(parent_fd)
                finally:
                    os.close(parent_fd)
                return []
            except OSError:
                _fail('generation-authority-ledger-unavailable')
            try:
                st = os.fstat(fd)
                if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                        or st.st_nlink != 1 or st.st_mode & 0o077
                        or st.st_size > _MAX_LEDGER):
                    _fail('generation-authority-ledger-path-invalid')
                chunks = []
                while True:
                    block = os.read(fd, 65536)
                    if not block:
                        break
                    chunks.append(block)
                data = b''.join(chunks)
            finally:
                os.close(fd)
            if not data:
                return []
            if not data.endswith(b'\n'):
                _fail('generation-authority-ledger-corrupt')
            try:
                records = [_parse_canonical(line, maximum=_MAX_LEDGER)
                           for line in data.splitlines()]
            except GenerationEnrollmentAuthorityError:
                _fail('generation-authority-ledger-corrupt')
            if len(records) > _MAX_RECORDS:
                _fail('generation-authority-ledger-capacity')
            previous = '0' * 64
            for sequence, record in enumerate(records, 1):
                _closed(record, {'profile', 'authorityId', 'configurationDigest',
                                 'contextDigest', 'purpose', 'sequence', 'previousDigest',
                                 'kind', 'payload', 'digest'},
                         'generation-authority-ledger-corrupt')
                digest = record.pop('digest')
                if (record['profile'] != LEDGER_PROFILE
                        or record['authorityId'] != self._authority_id
                        or record['configurationDigest'] != self._config_digest
                        or record['contextDigest'] != self._context_digest
                        or record['purpose'] != self._purpose
                        or record['sequence'] != sequence or record['previousDigest'] != previous
                        or record['kind'] not in _EVENT_KINDS
                        or digest != _sha(_canonical(record))):
                    _fail('generation-authority-ledger-corrupt')
                record['digest'] = digest
                previous = digest
            _replay(records)
            return records

    def _append(self, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        # The read/validate/append sequence must be exclusive across processes;
        # a shared lock can let two effect-key contenders both validate empty history.
        with self._locked(create=False, exclusive=True):
            records = self._read_locked(create=False)
            return self._append_locked(records, kind, payload)

    def _initialize_identity(self, enrollment_id: str, initial_epoch: str) -> None:
        """Settle only the exact IDs in a durable pending context-birth intent."""
        enrollment_id = _uuid(enrollment_id); initial_epoch = _uuid(initial_epoch)
        with self._locked(create=True, birth=True):
            records = self._read_locked(create=True)
            identities = [record for record in records
                          if record['kind'] == 'identity-allocated']
            expected = {'enrollmentId': enrollment_id, 'initialEpoch': initial_epoch}
            if identities:
                if len(identities) != 1 or identities[0]['payload'] != expected:
                    _fail('generation-authority-ledger-birth-id-mismatch')
                return
            if records:
                _fail('generation-authority-ledger-corrupt')
            self._append_locked(records, 'identity-allocated', expected)

    def _append_locked(self, records: list[dict[str, Any]], kind: str,
                       payload: dict[str, Any]) -> dict[str, Any]:
            if len(records) >= _MAX_RECORDS:
                _fail('generation-authority-ledger-capacity')
            previous = records[-1]['digest'] if records else '0' * 64
            record = {'profile': LEDGER_PROFILE, 'authorityId': self._authority_id,
                      'configurationDigest': self._config_digest,
                      'contextDigest': self._context_digest, 'purpose': self._purpose,
                      'sequence': len(records) + 1, 'previousDigest': previous,
                      'kind': kind, 'payload': _json_copy(payload)}
            record['digest'] = _sha(_canonical(record))
            encoded = _canonical(record) + b'\n'
            if sum(len(_canonical(item)) + 1 for item in records) + len(encoded) > _MAX_LEDGER:
                _fail('generation-authority-ledger-capacity')
            # Validate the full state transition before durable append. This
            # rejects duplicate effect keys atomically across processes.
            _replay([*records, record])
            try:
                fd = os.open(self._path, os.O_WRONLY | os.O_APPEND | getattr(os, 'O_NOFOLLOW', 0))
            except OSError:
                _fail('generation-authority-ledger-write-failed')
            try:
                st = os.fstat(fd)
                if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                        or st.st_nlink != 1 or st.st_mode & 0o077):
                    _fail('generation-authority-ledger-path-invalid')
                view = memoryview(encoded)
                while view:
                    written = os.write(fd, view)
                    if written <= 0:
                        _fail('generation-authority-ledger-write-failed')
                    view = view[written:]
                os.fsync(fd)
            except OSError:
                _fail('generation-authority-ledger-write-failed')
            finally:
                os.close(fd)
            return record

    def events(self, *, create: bool = False) -> list[dict[str, Any]]:
        return self._read(create=create)


def _replay(records: list[dict[str, Any]]) -> dict[str, Any]:
    identities: dict[str, dict[str, Any]] = {}
    requests: dict[str, dict[str, Any]] = {}
    effect_keys: dict[tuple[str, str, str], str] = {}
    for record in records:
        kind, payload = record['kind'], record['payload']
        if type(payload) is not dict:
            _fail('generation-authority-ledger-corrupt')
        if kind == 'identity-allocated':
            _closed(payload, {'enrollmentId', 'initialEpoch'}, 'generation-authority-ledger-corrupt')
            enrollment_id = _uuid(payload['enrollmentId']); epoch = _uuid(payload['initialEpoch'])
            if enrollment_id in identities or any(v['initialEpoch'] == epoch for v in identities.values()):
                _fail('generation-authority-ledger-corrupt')
            identities[enrollment_id] = {'initialEpoch': epoch}
        elif kind == 'request-prepared':
            _closed(payload, {'requestId', 'scope', 'effectKey', 'intentBytes', 'intentDigest',
                              'signedPayloadBytes', 'identityEnrollmentId'},
                    'generation-authority-ledger-corrupt')
            request_id = _uuid(payload['requestId'])
            if request_id in requests or payload['scope'] not in SCOPES:
                _fail('generation-authority-ledger-corrupt')
            key = payload['effectKey']
            if (type(key) is not list or len(key) != 3 or key[0] != payload['scope']
                    or not all(type(x) is str for x in key)):
                _fail('generation-authority-ledger-corrupt')
            effect_key = tuple(key)
            if effect_key in effect_keys:
                _fail('generation-authority-ledger-corrupt')
            intent_bytes = _b64decode_bytes(payload['intentBytes'])
            signed_bytes = _b64decode_bytes(payload['signedPayloadBytes'])
            if _sha(intent_bytes) != payload['intentDigest']:
                _fail('generation-authority-ledger-corrupt')
            _parse_canonical(intent_bytes)
            signed_payload = _parse_canonical(signed_bytes)
            if (signed_payload.get('requestId') != request_id
                    or signed_payload.get('scope') != payload['scope']):
                _fail('generation-authority-ledger-corrupt')
            identity_id = payload['identityEnrollmentId']
            if identity_id is not None and identity_id not in identities:
                _fail('generation-authority-ledger-corrupt')
            requests[request_id] = {'payload': payload, 'signedPayload': signed_payload,
                                    'approvedEnvelope': None, 'reservation': None,
                                    'settlement': None}
            effect_keys[effect_key] = request_id
        elif kind == 'approval-verified':
            _closed(payload, {'requestId', 'envelopeBytes', 'approvalDigest'},
                    'generation-authority-ledger-corrupt')
            request = requests.get(_uuid(payload['requestId']))
            envelope_bytes = _b64decode_bytes(payload['envelopeBytes'])
            if request is None or request['approvedEnvelope'] is not None:
                _fail('generation-authority-ledger-corrupt')
            if _sha(envelope_bytes) != payload['approvalDigest']:
                _fail('generation-authority-ledger-corrupt')
            request['approvedEnvelope'] = _parse_canonical(envelope_bytes)
            request['approvalDigest'] = payload['approvalDigest']
        elif kind == 'effect-reserved':
            _closed(payload, {'requestId', 'reservationId', 'approvalDigest', 'effectKey'},
                    'generation-authority-ledger-corrupt')
            request = requests.get(_uuid(payload['requestId']))
            if (request is None or request['approvedEnvelope'] is None
                    or request['reservation'] is not None
                    or payload['approvalDigest'] != request.get('approvalDigest')
                    or tuple(payload['effectKey']) != tuple(request['payload']['effectKey'])):
                _fail('generation-authority-ledger-corrupt')
            _uuid(payload['reservationId'])
            request['reservation'] = payload
        elif kind == 'effect-settled':
            _closed(payload, {'requestId', 'reservationId', 'status', 'receiptDigest'},
                    'generation-authority-ledger-corrupt')
            request = requests.get(_uuid(payload['requestId']))
            if (request is None or request['reservation'] is None or request['settlement'] is not None
                    or payload['reservationId'] != request['reservation']['reservationId']
                    or payload['status'] not in ('confirmed', 'known-aborted')):
                _fail('generation-authority-ledger-corrupt')
            _digest(payload['receiptDigest'])
            request['settlement'] = payload
    return {'identities': identities, 'requests': requests, 'effectKeys': effect_keys}



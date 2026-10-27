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

from .target_custody_codec import (
    CustodyJournalError as CustodyJournalError,
    JOURNAL_PROFILE as JOURNAL_PROFILE,
    JOURNAL_PROFILE_02 as JOURNAL_PROFILE_02,
    _HEX as _HEX,
    _KINDS as _KINDS,
    _KINDS_02 as _KINDS_02,
    _MAX_BYTES as _MAX_BYTES,
    _MAX_EVENTS as _MAX_EVENTS,
    _MAX_SAFE as _MAX_SAFE,
    _OWNER_REQUEST_KIND as _OWNER_REQUEST_KIND,
    _UUID as _UUID,
    _canonical as _canonical,
    _canonical_path as _canonical_path,
    _closed as _closed,
    _decimal as _decimal,
    _digest as _digest,
    _hex as _hex,
    _pairs_no_duplicates as _pairs_no_duplicates,
    _read_json as _read_json,
    _replay as _replay,
    _safe_uint32 as _safe_uint32,
    _text as _text,
    _uuid as _uuid,
    _validate_event_payload as _validate_event_payload,
    _validate_observation as _validate_observation,
    _validate_owner_payload as _validate_owner_payload,
    validate_original_target_custody_record as validate_original_target_custody_record,
)


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
            elif (kind == 'originals-store-observation'
                  and payload['parent'] != {'sequence': doc['sequence'],
                                            'headDigest': doc['headDigest']}):
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
        current = _replay(document['events'], profile=self._journal._profile)['registration']
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
            current = _replay(document['events'], profile=self._journal._profile)['registration']
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
        latest = _replay(self._journal._load()['events'],
                         profile=self._journal._profile)['registration']
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
        state = _replay(document['events'], profile=self._journal._profile)['registration']
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

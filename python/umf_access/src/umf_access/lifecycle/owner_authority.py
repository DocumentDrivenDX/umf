# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public owner-approval facade and native lifecycle orchestration."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from .owner_approval_core import (
    _SCOPES,
    _SIGNATURE_DOMAIN,
    OWNER_APPROVAL_PROFILE,
    OWNER_AUTHORITY_PROFILE,
    OWNER_INTENT_PROFILE,
    OWNER_LEDGER_PROFILE,
    OWNER_PURPOSES,
    OriginalApprovalOutcome,
    OwnerApprovalCore,
    OwnerApprovalRequest,
    OwnerAuthorityError,
    VerifiedOwnerApproval,
    _canonical_bytes,
    _digest,
    _digest_bytes,
    _reject,
    _validate_config,
)
from .owner_bootstrap import (
    LocalPostgresProfile,
    OwnerAuthorityContext,
    _issue_owner_authority_context,
    _LocalOwnerBootstrapIssuer,
)

__all__ = [
    'OWNER_APPROVAL_PROFILE',
    'OWNER_AUTHORITY_PROFILE',
    'OWNER_INTENT_PROFILE',
    'OWNER_LEDGER_PROFILE',
    'OWNER_PURPOSES',
    '_SCOPES',
    '_SIGNATURE_DOMAIN',
    'ConfiguredEd25519OwnerAuthority',
    'LocalPostgresProfile',
    'OriginalApprovalOutcome',
    'OriginalEffectBinding',
    'OwnerApprovalCore',
    'OwnerApprovalRequest',
    'OwnerAuthorityContext',
    'OwnerAuthorityError',
    'OwnerAuthoritySession',
    'VerifiedOwnerApproval',
    '_canonical_bytes',
    '_digest',
    '_digest_bytes',
    '_reject',
    '_validate_config',
    'create_owner_authority_session',
]

_EFFECT_SEAL = object()

class OriginalEffectBinding:
    """Opaque durable link from a verified approval to one native reservation."""

    __slots__ = ('_core_handle', '_issuer', '_kind', '_request', '_reservation',
                 '_reservation_digest')

    def __init__(self, seal: object, issuer: object, request: OwnerApprovalRequest,
                 reservation: object, reservation_digest: str,
                 core_handle: object):
        if seal is not _EFFECT_SEAL:
            raise TypeError('native effect bindings are authority-issued')
        object.__setattr__(self, '_issuer', issuer)
        object.__setattr__(self, '_kind', 'umf.owner-native-effect-binding/0.1')
        object.__setattr__(self, '_request', request)
        object.__setattr__(self, '_reservation', reservation)
        object.__setattr__(self, '_reservation_digest', _digest(reservation_digest))
        object.__setattr__(self, '_core_handle', core_handle)

    def __setattr__(self, _name: str, _value: object) -> None:
        raise AttributeError('native effect binding is immutable')

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('native effect binding cannot be serialized')

    def __repr__(self) -> str:
        return '<OriginalEffectBinding opaque>'


class ConfiguredEd25519OwnerAuthority:
    """Pure configured owner-approval facade over the native-free core."""

    __slots__ = ('_core',)

    def __init__(self, configuration: object, *, ledger_path: str | os.PathLike[str],
                 context: OwnerAuthorityContext):
        self._core = OwnerApprovalCore(configuration, ledger_path=ledger_path,
                                       context=context)

    @property
    def authority_id(self) -> str:
        return self._core.authority_id

    @property
    def policy_revision(self) -> str:
        return self._core.policy_revision

    @property
    def configuration_digest(self) -> str:
        return self._core.configuration_digest

    @property
    def authority_context(self) -> OwnerAuthorityContext:
        return self._core.authority_context

    def prepare_request(self, scope: str, exact_intent_bytes: bytes, *,
                        context: OwnerAuthorityContext) -> OwnerApprovalRequest:
        return self._core.prepare_request(scope, exact_intent_bytes, context=context)

    def export_signing_request(self, original_request: OwnerApprovalRequest) -> dict[str, Any]:
        return self._core.export_signing_request(original_request)

    def verify_approval(self, original_request: OwnerApprovalRequest,
                        signed_envelope: object) -> VerifiedOwnerApproval:
        return self._core.verify_approval(original_request, signed_envelope)

    def observe_approval(self, original_request: OwnerApprovalRequest) -> OriginalApprovalOutcome:
        return self._core.observe_approval(original_request)

    def observe_original_request(self, context: OwnerAuthorityContext,
                                 effect_key: tuple[object, ...]) -> OriginalApprovalOutcome:
        return self._core.observe_original_request(context, effect_key)

    def _recover_original_request(self, scope: str, exact_intent_bytes: bytes, *,
                                  context: OwnerAuthorityContext,
                                  expected_approval_id: str) -> OwnerApprovalRequest:
        return self._core._recover_original_request(
            scope, exact_intent_bytes, context=context,
            expected_approval_id=expected_approval_id)

    def _recover_verified_approval(
            self, original_request: OwnerApprovalRequest) -> VerifiedOwnerApproval:
        return self._core._recover_verified_approval(original_request)

    def _resolve_verified_approval(self, value: object, *,
                                   original_request: OwnerApprovalRequest,
                                   scope: str,
                                   intent_digest: str) -> VerifiedOwnerApproval:
        return self._core._resolve_verified_approval(
            value, original_request=original_request,
            scope=scope, intent_digest=intent_digest)


class OwnerAuthoritySession:
    """Native owner-session facade; all core/native transitions are joined here."""

    __slots__ = ('_authority', '_bootstrap_issuer', '_effect_bindings', '_supervisor')

    def __init__(self, authority: ConfiguredEd25519OwnerAuthority, *,
                 bootstrap_issuer: object, supervisor: object):
        from .ingress_local_postgres import LocalPostgresSupervisor
        if (type(authority) is not ConfiguredEd25519OwnerAuthority
                or type(supervisor) is not LocalPostgresSupervisor
                or type(bootstrap_issuer) is not _LocalOwnerBootstrapIssuer):
            _reject('owner-native-session-untrusted')
        if (supervisor._owner_core is not authority._core
                or supervisor.authority_context is not authority.authority_context
                or supervisor._bootstrap_issuer is not bootstrap_issuer):
            _reject('owner-native-session-mismatch')
        self._authority = authority
        self._bootstrap_issuer = bootstrap_issuer
        self._supervisor = supervisor
        self._effect_bindings: dict[int, OriginalEffectBinding] = {}

    @property
    def authority(self) -> ConfiguredEd25519OwnerAuthority:
        return self._authority

    @property
    def supervisor(self):
        return self._supervisor

    @property
    def authority_context(self) -> OwnerAuthorityContext:
        return self._authority.authority_context

    @property
    def authority_id(self) -> str:
        return self._authority.authority_id

    @property
    def policy_revision(self) -> str:
        return self._authority.policy_revision

    def bind_native_effect(self, verified_approval: VerifiedOwnerApproval,
                           reservation: object) -> OriginalEffectBinding:
        request = (verified_approval._request
                   if type(verified_approval) is VerifiedOwnerApproval else None)
        if type(request) is not OwnerApprovalRequest:
            _reject('owner-approval-capability-mismatch')
        verified = self._authority._resolve_verified_approval(
            verified_approval, original_request=request, scope=request._scope,
            intent_digest=request._intent_digest)
        from .ingress_local_postgres import (
            LocalPostgresSupervisor,
            _NativeEffectReservation,
        )
        supervisor = self._supervisor
        if (type(supervisor) is not LocalPostgresSupervisor
                or type(reservation) is not _NativeEffectReservation):
            _reject('owner-native-reservation-untrusted')
        if (supervisor._native_effect_reservations.get(id(reservation)) is not reservation
                or reservation._supervisor is not supervisor):
            _reject('owner-native-reservation-untrusted')
        if supervisor._resolve_native_effect_reservation(reservation, verified) is None:
            _reject('owner-native-reservation-untrusted')
        context = self.authority_context
        if (reservation.scope != request._scope
                or tuple(reservation.effect_key) != request._effect_key
                or reservation.purpose != context._purpose
                or reservation.request_id != request._approval_id
                or reservation.request_digest != request._intent_digest
                or reservation.approval_id != verified.approval_id
                or reservation.approval_digest != verified.approval_digest):
            _reject('owner-native-reservation-mismatch')
        existing = next((binding for binding in self._effect_bindings.values()
                         if binding._request is request), None)
        if existing is not None:
            if existing._reservation is reservation:
                return existing
            _reject('owner-approval-already-consumed')
        reservation_digest = _digest(reservation.journal_record_digest)
        core_handle = self._authority._core._bind_effect_digest(verified, reservation_digest)
        binding = OriginalEffectBinding(_EFFECT_SEAL, self, request, reservation,
                                        reservation_digest, core_handle)
        self._effect_bindings[id(binding)] = binding
        return binding

    def _binding_for_reservation(self, reservation: object) -> OriginalEffectBinding:
        binding = next((item for item in self._effect_bindings.values()
                        if item._reservation is reservation), None)
        if binding is None:
            _reject('owner-native-effect-binding-required')
        return binding

    def _pending_effect_handle(self, binding: object, *, mode: str = 'execute') -> object:
        """Return only this session's exact core handle for native verification."""
        if (type(binding) is not OriginalEffectBinding or binding._issuer is not self
                or self._effect_bindings.get(id(binding)) is not binding):
            _reject('owner-native-effect-binding-required')
        try:
            self._authority._core._resolve_pending_effect(
                binding._core_handle, original_request=binding._request,
                reservation_digest=binding._reservation_digest, mode=mode)
        except OwnerAuthorityError:
            _reject('owner-native-effect-binding-required')
        return binding._core_handle

    def record_native_outcome(self, binding: OriginalEffectBinding,
                              outcome: object) -> OriginalApprovalOutcome:
        if (type(binding) is not OriginalEffectBinding or binding._issuer is not self
                or self._effect_bindings.get(id(binding)) is not binding
                or binding._kind != 'umf.owner-native-effect-binding/0.1'):
            _reject('owner-native-effect-binding-required')
        from .ingress_local_postgres import _VerifiedNativeEffectOutcome
        supervisor = self._supervisor
        reservation = binding._reservation
        if type(outcome) is not _VerifiedNativeEffectOutcome:
            _reject('owner-native-outcome-untrusted')
        if (supervisor._native_effect_outcomes.get(id(outcome)) is not outcome
                or outcome._issuer is not supervisor
                or outcome._reservation is not reservation):
            _reject('owner-native-outcome-untrusted')
        from .ingress_local_postgres import LocalPostgresSupervisor
        if type(supervisor) is not LocalPostgresSupervisor:
            _reject('owner-native-outcome-untrusted')
        if supervisor._resolve_native_effect_outcome(outcome, reservation) is None:
            _reject('owner-native-outcome-untrusted')
        if outcome.status not in ('confirmed', 'known-aborted'):
            _reject('owner-native-outcome-untrusted')
        result = self._authority._core._finish_effect_digest(
            binding._request, binding._reservation_digest,
            status='confirmed' if outcome.status == 'confirmed' else 'aborted',
            receipt_digest=outcome.receipt_digest)
        return result

    def prepare_target_creation(self):
        return self._supervisor.prepare_target_creation()

    def reattach_original_target(self):
        """Reattach native state, then settle its exact owner-ledger outcome."""
        target = self._supervisor.reattach_original_target()
        reservation = target._reservation
        binding = self.bind_native_effect(reservation._approval, reservation)
        handle = self._pending_effect_handle(binding, mode='recover')
        self._supervisor.confirm_reattached_target_creation(target, handle)
        outcome = next((item for item in self._supervisor._native_effect_outcomes.values()
                        if item._reservation is reservation), None)
        if outcome is None:
            _reject('owner-native-outcome-untrusted')
        binding = next((item for item in self._effect_bindings.values()
                        if item._reservation is reservation), None)
        if binding is None:
            _reject('owner-native-effect-binding-required')
        self.record_native_outcome(binding, outcome)
        return target

    def export_owner_signing_request(self, request: object) -> dict[str, Any]:
        return self._supervisor.export_owner_signing_request(request)

    def create_target(self, pending: object, signed_envelope: object) -> object:
        request = pending._request
        approval = self._authority.verify_approval(request, signed_envelope)
        self._authority._resolve_verified_approval(
            approval, original_request=request, scope='local-target-creation',
            intent_digest=request._intent_digest)
        reservation = self._supervisor.reserve_target_creation(pending, approval)
        binding = self.bind_native_effect(approval, reservation)
        handle = self._pending_effect_handle(binding)
        target = self._supervisor.execute_target_creation(pending, reservation, handle)
        outcome = next((item for item in self._supervisor._native_effect_outcomes.values()
                        if item._reservation is reservation), None)
        if outcome is None:
            _reject('owner-native-outcome-untrusted')
        binding = next((item for item in self._effect_bindings.values()
                        if item._reservation is reservation), None)
        if binding is None:
            _reject('owner-native-effect-binding-required')
        self.record_native_outcome(binding, outcome)
        return target

    def prepare_original_principals(self, target: object):
        return self._supervisor.prepare_original_principals(target)

    def resume_original_principal_stage(self, target: object) -> dict[str, Any]:
        reservation = self._supervisor.prepare_original_principal_recovery(target)
        binding = self.bind_native_effect(reservation._approval, reservation)
        handle = self._pending_effect_handle(binding, mode='recover')
        receipt = self._supervisor.execute_original_principal_recovery(reservation, handle)
        outcome = next((item for item in self._supervisor._native_effect_outcomes.values()
                        if item._reservation is reservation), None)
        if outcome is None:
            _reject('owner-native-outcome-untrusted')
        binding = next((item for item in self._effect_bindings.values()
                        if item._reservation is reservation), None)
        if binding is None:
            _reject('owner-native-effect-binding-required')
        self.record_native_outcome(binding, outcome)
        return receipt

    def export_principal_signing_request(self, prepared: object) -> dict[str, Any]:
        return self._supervisor.export_principal_signing_request(prepared)

    def apply_original_principals(self, prepared: object,
                                  signed_envelope: object) -> dict[str, Any]:
        request = prepared._request
        approval = self._authority.verify_approval(request, signed_envelope)
        self._authority._resolve_verified_approval(
            approval, original_request=request,
            scope='native-principal-preparation', intent_digest=request._intent_digest)
        reservation = self._supervisor.reserve_original_principals(prepared, approval)
        binding = self.bind_native_effect(approval, reservation)
        handle = self._pending_effect_handle(binding)
        receipt = self._supervisor.execute_original_principals(prepared, reservation, handle)
        outcome = next((item for item in self._supervisor._native_effect_outcomes.values()
                        if item._reservation is reservation), None)
        if outcome is None:
            _reject('owner-native-outcome-untrusted')
        binding = next((item for item in self._effect_bindings.values()
                        if item._reservation is reservation), None)
        if binding is None:
            _reject('owner-native-effect-binding-required')
        self.record_native_outcome(binding, outcome)
        return receipt

    def prepare_target_registration(self, target: object):
        return self._supervisor.prepare_target_registration(target)

    def reattach_original_registration(self, target: object) -> object:
        reservation = self._supervisor.prepare_original_registration_reattachment(target)
        binding = self.bind_native_effect(reservation._approval, reservation)
        handle = self._pending_effect_handle(binding, mode='recover')
        result = self._supervisor.execute_original_registration_reattachment(
            reservation, handle)
        outcome = next((item for item in self._supervisor._native_effect_outcomes.values()
                        if item._reservation is reservation), None)
        if outcome is None:
            _reject('owner-native-outcome-untrusted')
        binding = next((item for item in self._effect_bindings.values()
                        if item._reservation is reservation), None)
        if binding is None:
            _reject('owner-native-effect-binding-required')
        self.record_native_outcome(binding, outcome)
        return result

    def export_target_registration_request(self, prepared: object) -> dict[str, Any]:
        return self._supervisor.export_target_registration_request(prepared)

    def apply_target_registration(self, prepared: object,
                                  signed_envelope: object) -> object:
        request = prepared._request
        approval = self._authority.verify_approval(request, signed_envelope)
        self._authority._resolve_verified_approval(
            approval, original_request=request, scope='local-target-registration',
            intent_digest=request._intent_digest)
        reservation = self._supervisor.reserve_target_registration(prepared, approval)
        binding = self.bind_native_effect(approval, reservation)
        handle = self._pending_effect_handle(binding)
        result = self._supervisor.execute_target_registration(prepared, reservation, handle)
        outcome = next((item for item in self._supervisor._native_effect_outcomes.values()
                        if item._reservation is reservation), None)
        if outcome is None:
            _reject('owner-native-outcome-untrusted')
        binding = next((item for item in self._effect_bindings.values()
                        if item._reservation is reservation), None)
        if binding is None:
            _reject('owner-native-effect-binding-required')
        self.record_native_outcome(binding, outcome)
        return result


def create_owner_authority_session(profile: LocalPostgresProfile, *,
                                   ledger_path: str | os.PathLike[str]) -> OwnerAuthoritySession:
    """Create a native session only from original enrollment and a durably bound ledger."""
    from .ingress_local_postgres import (
        LocalPostgresSupervisor,
        _issue_local_owner_bootstrap_issuer,
    )
    from .owner_bootstrap import _settle_original_owner_setup

    _settle_original_owner_setup(profile, ledger_path)
    issuer = _issue_local_owner_bootstrap_issuer(profile)
    config, _keys = _validate_config(issuer.owner_configuration)
    configuration_digest = _digest_bytes(_canonical_bytes(config))
    context = _issue_owner_authority_context(issuer, configuration_digest)
    bound_path = Path(ledger_path)
    authority = ConfiguredEd25519OwnerAuthority(
        config, ledger_path=bound_path, context=context)
    authority._core._ensure_ledger_initialized()
    supervisor = LocalPostgresSupervisor(
        profile, owner_core=authority._core, authority_context=context,
        bootstrap_issuer=issuer)
    return OwnerAuthoritySession(authority, bootstrap_issuer=issuer,
                                 supervisor=supervisor)

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Host-neutral G11 generation-ingress capability interfaces.

This module defines typing boundaries only. Structural protocol conformance or
an instance of an opaque handle is not trusted provider/custodian evidence and
does not authorize native .6 execution. The production host remains fail-closed
until a concrete provider verifies issuer identity, target custody, native
receipts and the selected execution profile.
"""
from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Any, Protocol, runtime_checkable

_CAPABILITY_SEAL = object()


class _OpaqueCapability:
    """Non-serializable handle base; no public/dictionary minting constructor."""

    __slots__ = ('__issuer', '__kind')

    def __init__(self, seal: object, issuer: object, kind: str):
        if seal is not _CAPABILITY_SEAL or issuer is None or type(kind) is not str:
            raise TypeError('capability handles are issued by a trusted provider')
        object.__setattr__(self, '_OpaqueCapability__issuer', issuer)
        object.__setattr__(self, '_OpaqueCapability__kind', kind)

    def __setattr__(self, name: str, value: object) -> None:
        raise AttributeError('opaque capabilities are immutable')

    def __reduce_ex__(self, protocol: int):
        raise TypeError('opaque capabilities cannot be serialized')

    def _issued_by(self, issuer: object, kind: str) -> bool:
        return (self.__issuer is issuer and self.__kind == kind
                and type(self) is not _OpaqueCapability)

    def __repr__(self) -> str:
        return f'<{type(self).__name__} opaque>'


class TargetCustody(_OpaqueCapability):
    """Opaque external registration for one physical installation incarnation."""


class OwnerEnrollmentRequest(_OpaqueCapability):
    """Trusted owner-side request used before a custodian issues TargetCustody.

    This is not a native enrollment or a custody capability. A future concrete
    owner-side issuer must create it from authenticated registration intent;
    caller dictionaries and structural protocol conformance cannot mint it.
    """


class TargetReservation(_OpaqueCapability):
    """Opaque durable reservation of the original transition intent."""


class GenerationEnrollment(_OpaqueCapability):
    """Opaque enrollment of exact stable subject identities and target."""


class EpochProvisionRequest(_OpaqueCapability):
    """Custodian-bound original disabled-epoch request and separate approval.

    A concrete provider may issue this handle only after validating and
    retaining the exact closed provisioning request and its approval binding.
    It is a distinct pre-OID authority, not a final transition request.
    """


class EpochProvisionReservation(_OpaqueCapability):
    """External reservation of one original epoch-provision request/approval."""


class PreparedGenerationEpoch(_OpaqueCapability):
    """Opaque receipt for an exact newly provisioned disabled login epoch."""


class GenerationIngressRequest(_OpaqueCapability):
    """Opaque source/plan/approval/policy binding for one transition."""


class GenerationTransition(_OpaqueCapability):
    """Opaque original intent/reservation pair; never author-serializable."""


class GenerationFenceReceipt(_OpaqueCapability):
    """Opaque native proof of a committed admission fence and retirement."""


class GenerationAdmission(_OpaqueCapability):
    """Opaque fresh credential/factory admission for a committed generation."""


class GenerationObservation(Protocol):
    """Read-only status whose concrete issuer must be independently checked."""


@runtime_checkable
class GenerationIngressLease(Protocol):
    """One provider lease for fencing, per-phase hooks, and publication hooks."""

    def observe(self) -> GenerationObservation: ...

    def fence_and_retire(self, deadline: object) -> GenerationFenceReceipt: ...

    def require_fenced(self, native_phase_connection: Any,
                       catalog_side: str) -> None: ...

    def record_phase(self, native_phase_connection: Any,
                     verified_phase_receipt: object) -> None: ...

    def record_publication(self, native_final_connection: Any,
                           verified_reference: object) -> None: ...


@runtime_checkable
class GenerationIngressProvider(Protocol):
    """Trusted provider API; the Protocol is not itself a capability check."""

    @property
    def provider_id(self) -> str: ...

    def enroll_installation(self, enrollment_request: object,
                            enrollment_approval: object) -> GenerationEnrollment: ...

    def prepare_epoch_provision_request(
            self, enrollment: GenerationEnrollment, closed_request: object,
            provisioning_approval: object) -> EpochProvisionRequest: ...

    # The custodian reservation is required before this method can perform
    # native work; its separate authority is not interchangeable with the
    # later GenerationIngressRequest/TargetReservation pair.
    def provision_disabled_epoch(self, enrollment: GenerationEnrollment,
                                 provision_request: EpochProvisionRequest,
                                 reservation: EpochProvisionReservation,
                                 provisioning_approval: object) -> PreparedGenerationEpoch: ...

    def transition_request(self, plan_request: object,
                           enrollment: GenerationEnrollment,
                           prepared_epoch: PreparedGenerationEpoch,
                           plan_approval: object) -> GenerationIngressRequest: ...

    def prepare_transition(self, request: GenerationIngressRequest,
                           enrollment: GenerationEnrollment,
                           ingress_approval: object) -> GenerationTransition: ...

    def acquire(self, transition: GenerationTransition) -> AbstractContextManager[GenerationIngressLease]: ...

    def admit(self, authenticated_subject: object, expected_reference: object,
              purpose: str) -> GenerationAdmission: ...


@runtime_checkable
class TargetCustodian(Protocol):
    """External physical-target custody and append-only transition authority."""

    @property
    def custodian_id(self) -> str: ...

    def register_target(self, owner_enrollment: OwnerEnrollmentRequest) -> TargetCustody: ...

    def reserve_epoch_provision(
            self, request: EpochProvisionRequest,
            provisioning_approval: object) -> EpochProvisionReservation: ...

    # These methods reconcile the original pre-OID reservation. They must not
    # be implemented by wrapping the later transition observation API.
    def observe_epoch_provision(
            self, target: TargetCustody,
            reservation: EpochProvisionReservation) -> GenerationObservation: ...

    def confirm_epoch_provision(
            self, reservation: EpochProvisionReservation,
            native_receipt: object) -> GenerationObservation: ...

    def reserve_transition(self, request: GenerationIngressRequest,
                           ingress_approval: object) -> TargetReservation: ...

    def observe(self, target: TargetCustody) -> GenerationObservation: ...

    def confirm_transition(self, reservation: TargetReservation,
                           native_receipt: object) -> GenerationObservation: ...

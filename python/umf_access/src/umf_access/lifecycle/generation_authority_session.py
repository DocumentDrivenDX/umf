# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed upper native session for generation trust enrollment.

The bootstrap and logical authority modules are native-free.  This module is
the only production bridge that binds their original opaque entries to the
concrete PostgreSQL supervisor, target custodian, and ingress store.
"""
from __future__ import annotations

from .generation_authority_bootstrap import (
    _TRUST_SEAL,
    GenerationEnrollmentAuthorityContext,
    OriginalGenerationTrustEnrollment,
    _GenerationTrustIssuer,
    _logical_fail,
    _register_trust_issuer,
    _require_registered_issuer,
    _verify_trust_observation,
)


def _issue_generation_trust_issuer(*, supervisor: object, custodian: object,
                                   ingress_store: object) -> _GenerationTrustIssuer:
    """Create the one issuer bound to the exact original native objects."""
    from .ingress_custody import LocalTargetCustodian
    from .ingress_local_postgres import LocalPostgresSupervisor
    from .ingress_store import PgGenerationIngressStore

    if (type(supervisor) is not LocalPostgresSupervisor
            or type(custodian) is not LocalTargetCustodian
            or type(ingress_store) is not PgGenerationIngressStore
            or supervisor._custodian is not custodian
            or ingress_store._custodian is not custodian
            or supervisor._custody_handle is not ingress_store._target_handle
            or supervisor._profile.supervisor_id != supervisor._supervisor_id
            or supervisor._profile.custodian_id != custodian.custodian_id
            or supervisor._profile.provider_id != ingress_store.provider_id
            or supervisor._profile.installation_id != ingress_store.installation_id):
        _logical_fail('generation-authority-original-trust-required')
    registry_path = (supervisor._profile.control_home /
                     'generation-authority-context-registry.jsonl')
    issuer = _GenerationTrustIssuer(
        _TRUST_SEAL, registry_id=supervisor._supervisor_id, registry=supervisor,
        supervisor=supervisor, custodian=custodian, ingress_store=ingress_store,
        registry_path=registry_path)
    _register_trust_issuer(issuer, 'production')
    return issuer


def _registered_entry(issuer: _GenerationTrustIssuer,
                      enrollment: object) -> OriginalGenerationTrustEnrollment:
    _require_registered_issuer(issuer, 'production')
    if (type(enrollment) is not OriginalGenerationTrustEnrollment
            or enrollment._issuer is not issuer
            or issuer._entries.get(enrollment._entry_id) is not enrollment):
        _logical_fail('generation-authority-original-trust-required')
    supervisor = issuer._supervisor
    try:
        entry = supervisor._resolve_generation_authority_enrollment(
            enrollment._entry_id, supervisor, issuer._custodian, issuer._ingress_store)
    except Exception:  # noqa: BLE001 - native diagnostics remain private
        _logical_fail('generation-authority-original-trust-unverified')
    if entry is not enrollment:
        _logical_fail('generation-authority-original-trust-unverified')
    return enrollment


def _verify_original_native_trust(issuer: _GenerationTrustIssuer,
                                  entry: OriginalGenerationTrustEnrollment) -> None:
    try:
        observation = issuer._supervisor._verify_generation_authority_trust(
            entry, issuer._custodian, issuer._ingress_store)
    except Exception:  # noqa: BLE001 - native diagnostics remain private
        _logical_fail('generation-authority-original-trust-unverified')
    _verify_trust_observation(entry, observation)


def _enroll_generation_authority(
        issuer: _GenerationTrustIssuer, original_trust_enrollment: object,
        original_supervisor: object, original_custodian: object,
        original_ingress_store: object) -> GenerationEnrollmentAuthorityContext:
    """Verify fresh native trust, then persist logical context birth."""
    _require_registered_issuer(issuer, 'production')
    if (original_supervisor is not issuer._supervisor
            or original_custodian is not issuer._custodian
            or original_ingress_store is not issuer._ingress_store):
        _logical_fail('generation-authority-original-trust-required')
    entry = _registered_entry(issuer, original_trust_enrollment)
    _verify_original_native_trust(issuer, entry)
    return issuer._enroll_registered_context(entry)


def _resolve_generation_authority_context(
        issuer: _GenerationTrustIssuer, context: object,
        original_supervisor: object, original_custodian: object,
        original_ingress_store: object) -> GenerationEnrollmentAuthorityContext:
    """Recheck original native trust before exposing a logical context."""
    _require_registered_issuer(issuer, 'production')
    if (original_supervisor is not issuer._supervisor
            or original_custodian is not issuer._custodian
            or original_ingress_store is not issuer._ingress_store
            or type(context) is not GenerationEnrollmentAuthorityContext
            or context._issuer is not issuer):
        _logical_fail('generation-authority-context-unverified')
    entry = context._trust
    if issuer._entries.get(entry._entry_id) is not entry:
        _logical_fail('generation-authority-context-unverified')
    _verify_original_native_trust(issuer, entry)
    return issuer.resolve_generation_authority_context(context)


def _recover_generation_authority_context(
        issuer: _GenerationTrustIssuer, context_id: str,
        original_trust_enrollment: object, original_supervisor: object,
        original_custodian: object,
        original_ingress_store: object) -> GenerationEnrollmentAuthorityContext:
    """Read-only recovery of an existing context after native revalidation."""
    _require_registered_issuer(issuer, 'production')
    if (original_supervisor is not issuer._supervisor
            or original_custodian is not issuer._custodian
            or original_ingress_store is not issuer._ingress_store):
        _logical_fail('generation-authority-original-trust-required')
    entry = _registered_entry(issuer, original_trust_enrollment)
    _verify_original_native_trust(issuer, entry)
    return issuer._recover_registered_context(context_id, entry)

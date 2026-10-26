# SPDX-License-Identifier: MIT OR Apache-2.0
"""Administrative table lifecycle and head observation; no implicit pool or driver."""
from .approval import ApprovalBinding, ApprovalReceipt, TargetIdentity
from .catalog import CatalogError, verify_native_catalog
from .concurrent import apply_concurrent_indexes
from .correspondence import prepare_table_correspondence
from .head import prepare_table_head, read_table_head
from .generation_ingress import (
    EpochProvisionRequest,
    EpochProvisionReservation,
    GenerationAdmission,
    GenerationEnrollment,
    GenerationFenceReceipt,
    GenerationIngressLease,
    GenerationIngressProvider,
    GenerationIngressRequest,
    GenerationObservation,
    GenerationTransition,
    OwnerEnrollmentRequest,
    PreparedGenerationEpoch,
    TargetCustodian,
    TargetCustody,
    TargetReservation,
)
from .host import (
    HostCapabilities,
    HostOutcomeUnknown,
    MigrationHost,
    MigrationRequest,
    PsycopgMigrationHost,
    apply_migration_on_host,
)
from .ledger import apply_table_migration, inspect_table_history
from .mixed import apply_mixed_migration
from .phase_policy import (
    DERIVED_ADMIN_MODULE_PROFILE,
    FieldReplacementExecutionPolicy,
    PhaseBudgetCounter,
    PhaseDeadline,
    validate_phase_budget_receipt,
)
from .privileges import verify_native_privileges
from .roles import verify_native_role_scope
from .sql_containment import ContainmentRefused, SqlParser, check_sql_containment

__all__ = ["DERIVED_ADMIN_MODULE_PROFILE", "ApprovalBinding", "ApprovalReceipt", "CatalogError", "ContainmentRefused", "EpochProvisionRequest", "EpochProvisionReservation", "FieldReplacementExecutionPolicy", "GenerationAdmission", "GenerationEnrollment", "GenerationFenceReceipt", "GenerationIngressLease", "GenerationIngressProvider", "GenerationIngressRequest", "GenerationObservation", "GenerationTransition", "HostCapabilities", "HostOutcomeUnknown", "MigrationHost", "MigrationRequest", "OwnerEnrollmentRequest", "PhaseBudgetCounter", "PhaseDeadline", "PreparedGenerationEpoch", "PsycopgMigrationHost", "SqlParser", "TargetCustodian", "TargetCustody", "TargetIdentity", "TargetReservation", "apply_concurrent_indexes", "apply_migration_on_host", "apply_mixed_migration", "apply_table_migration", "check_sql_containment", "inspect_table_history", "prepare_table_correspondence", "prepare_table_head", "read_table_head", "validate_phase_budget_receipt", "verify_native_catalog", "verify_native_privileges", "verify_native_role_scope"]

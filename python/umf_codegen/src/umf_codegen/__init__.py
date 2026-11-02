# SPDX-License-Identifier: MIT OR Apache-2.0
"""Generate the same typed Python client as UMF's portable TypeScript API."""
from __future__ import annotations

from typing import Literal, TypedDict, cast

from ._native import GenerationError, execute

__version__ = "0.2.0"


class RecordSelection(TypedDict):
    module: str
    element: str


class ActionSelection(TypedDict):
    module: str
    action: str


class GeneratedFile(TypedDict):
    path: str
    text: str
    sha256: str


class PythonClientResult(TypedDict):
    sourceDigest: str
    description: dict[str, object]
    files: list[GeneratedFile]


class TableDeploymentConfiguration(TypedDict):
    module: str
    schema: str
    ownerRole: str
    personRole: str
    batchRole: str
    groupRoles: dict[str, str]


class TableDeploymentDiagnostic(TypedDict):
    code: str
    path: str
    message: str
    severity: str


class CompiledTableDeployment(TypedDict):
    status: Literal["compiled"]
    bundle: dict[str, object]
    diagnostics: list[TableDeploymentDiagnostic]


class BlockedTableDeployment(TypedDict):
    status: Literal["blocked"]
    diagnostics: list[TableDeploymentDiagnostic]


class TableMigrationPredecessor(TypedDict):
    id: str
    digest: str


class CompiledTableMigration(TypedDict):
    status: Literal["compiled"]
    plan: dict[str, object]
    diagnostics: list[TableDeploymentDiagnostic]


class BlockedTableMigration(TypedDict):
    status: Literal["blocked"]
    diagnostics: list[TableDeploymentDiagnostic]


class ReviewedChangeCandidate(TypedDict):
    id: str
    kind: str
    path: str
    oldDigest: str
    newDigest: str
    oldValue: object
    newValue: object


class TableMigrationDiscoveryOptions(TypedDict):
    version: Literal["umf.table-migration-discovery/0.2"]


def compile_table_migration(*, migration_id: str, predecessor: TableMigrationPredecessor | None,
                            previous_bundle: dict[str, object] | None, next_bundle: dict[str, object],
                            options: dict[str, object] | None = None,
                            timeout_seconds: float = 30) -> CompiledTableMigration | BlockedTableMigration:
    """Compile an inert forward plan; native ledger and approval remain required."""
    return cast(CompiledTableMigration | BlockedTableMigration,
                execute({"id": migration_id, "predecessor": predecessor,
                         "previous": previous_bundle, "next": next_bundle,
                         **({"options": options} if options is not None else {})},
                        timeout_seconds, operation="migration"))


def verify_table_migration(plan: dict[str, object], *, timeout_seconds: float = 30) -> dict[str, object]:
    """Recompile a complete plan; consistency cannot authenticate native history."""
    return execute({"plan": plan}, timeout_seconds, operation="verify_migration")


def discover_table_migration_changes(previous_bundle: dict[str, object], next_bundle: dict[str, object],
                                     *, options: TableMigrationDiscoveryOptions | None = None,
                                     timeout_seconds: float = 30) -> list[ReviewedChangeCandidate]:
    """Discover exact source-bound review candidates from two verified deployment bundles.

    Returned values explain each delta. Copy only id, kind, path, oldDigest and
    newDigest into `reviewedChanges`; a supported type conversion must also be
    selected explicitly as `pg-cast-v1`.
    Omitting `options`, or passing `None`, retains the historical discovery
    profile. G03 candidates require the explicit discovery 0.2 selector.
    """
    request = {"previous": previous_bundle, "next": next_bundle}
    if options is not None:
        request["options"] = options
    result = execute(request, timeout_seconds,
                     operation="discover_changes")
    changes = result.get("changes")
    if not isinstance(changes, list) or any(not isinstance(item, dict) for item in changes):
        raise GenerationError("PAYLOAD_INVALID", "Embedded compiler returned invalid reviewed changes")
    return cast(list[ReviewedChangeCandidate], changes)


def compile_table_deployment(text: str, *, configuration: TableDeploymentConfiguration,
                             format: Literal["json", "yaml"] = "json", timeout_seconds: float = 30
                             ) -> CompiledTableDeployment | BlockedTableDeployment:
    """Compile inert initial DDL using UMF's original portable implementation."""
    return cast(CompiledTableDeployment | BlockedTableDeployment,
                execute({"text": text, "format": format, "configuration": configuration},
                        timeout_seconds, operation="deployment"))


def verify_table_deployment(bundle: dict[str, object], *, timeout_seconds: float = 30) -> dict[str, object]:
    """Recompile a bundle; hosts must additionally verify their trusted digest."""
    return execute({"bundle": bundle}, timeout_seconds, operation="verify_deployment")


def normalize_row_scope(input: dict[str, object], *, context: dict[str, object],
                        timeout_seconds: float = 30) -> dict[str, object]:
    """Normalize row_scope with exact host bindings and lifecycle/native admission."""
    return execute({"input": input, "context": context}, timeout_seconds, operation="row_scope")


def generate_python_client(text: str, *, package: str, format: Literal["json", "yaml"] = "json",
                           records: list[RecordSelection] | None = None,
                           actions: list[ActionSelection] | None = None,
                           timeout_seconds: float = 30) -> PythonClientResult:
    request: dict[str, object] = {"text": text, "package": package, "format": format}
    if records is not None:
        request["records"] = records
    if actions is not None:
        request["actions"] = actions
    return cast(PythonClientResult, execute(request, timeout_seconds))


__all__ = [
    "ActionSelection",
    "BlockedTableDeployment",
    "BlockedTableMigration",
    "CompiledTableDeployment",
    "CompiledTableMigration",
    "GeneratedFile",
    "GenerationError",
    "PythonClientResult",
    "RecordSelection",
    "ReviewedChangeCandidate",
    "TableDeploymentConfiguration",
    "TableDeploymentDiagnostic",
    "TableMigrationDiscoveryOptions",
    "TableMigrationPredecessor",
    "__version__",
    "compile_table_deployment",
    "compile_table_migration",
    "discover_table_migration_changes",
    "generate_python_client",
    "normalize_row_scope",
    "verify_table_deployment",
    "verify_table_migration",
]

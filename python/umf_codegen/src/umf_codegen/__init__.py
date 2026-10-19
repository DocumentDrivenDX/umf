# SPDX-License-Identifier: MIT OR Apache-2.0
"""Generate the same typed Python client as UMF's portable TypeScript API."""
from __future__ import annotations

from typing import Literal, TypedDict, cast

from ._embedded import GenerationError, execute


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


def compile_table_migration(*, migration_id: str, predecessor: TableMigrationPredecessor | None,
                            previous_bundle: dict[str, object] | None, next_bundle: dict[str, object],
                            timeout_seconds: float = 30) -> CompiledTableMigration | BlockedTableMigration:
    """Compile an inert forward plan; native ledger and approval remain required."""
    return cast(CompiledTableMigration | BlockedTableMigration,
                execute({"id": migration_id, "predecessor": predecessor,
                         "previous": previous_bundle, "next": next_bundle},
                        timeout_seconds, operation="migration"))


def verify_table_migration(plan: dict[str, object], *, timeout_seconds: float = 30) -> dict[str, object]:
    """Recompile a complete plan; consistency cannot authenticate native history."""
    return execute({"plan": plan}, timeout_seconds, operation="verify_migration")


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
    "TableDeploymentConfiguration",
    "TableDeploymentDiagnostic",
    "TableMigrationPredecessor",
    "compile_table_deployment",
    "compile_table_migration",
    "generate_python_client",
    "verify_table_deployment",
    "verify_table_migration",
]

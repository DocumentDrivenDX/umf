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
    "CompiledTableDeployment",
    "GeneratedFile",
    "GenerationError",
    "PythonClientResult",
    "RecordSelection",
    "TableDeploymentConfiguration",
    "TableDeploymentDiagnostic",
    "compile_table_deployment",
    "generate_python_client",
    "verify_table_deployment",
]

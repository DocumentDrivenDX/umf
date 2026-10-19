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


__all__ = ["ActionSelection", "GeneratedFile", "GenerationError", "PythonClientResult", "RecordSelection", "generate_python_client"]

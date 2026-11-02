# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public Rust-backed Pack Tools generator."""

from __future__ import annotations

from typing import Any

from . import _rust
from .adapters import execute_adapter


def generate_pack_tools(
    request: dict[str, Any],
    *,
    max_work: int | None = None,
    meter=None,
    is_cancelled=None,
    now=None,
    deadline_ms: int | None = None,
) -> dict[str, Any]:
    """Generate source-bound DDL, ORM mappings, and CRUD files from one pack.

    ``request`` is the complete ``umf.pack-tools/1`` request, including its
    declared pack and local source texts. The Rust compiler owns source parsing
    and all generation semantics. Semantic refusals are returned in the result
    report; malformed or unbounded requests raise the existing structured
    ``ValueError`` type with ``code`` and ``path`` attributes.
    """
    if type(request) is not dict:
        raise TypeError("request must be a dict")
    result = execute_adapter(
        "pack-tools",
        "generatePackTools",
        request=request,
        max_work=max_work,
        meter=meter,
        is_cancelled=is_cancelled,
        now=now,
        deadline_ms=deadline_ms,
    )
    if type(result) is not dict or result.get("profile") != "umf.pack-tools-result/1":
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Pack Tools result")
    return result

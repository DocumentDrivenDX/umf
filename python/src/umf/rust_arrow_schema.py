# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust binding for Arrow integration-schema JSON preservation."""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls

_PROFILE = "umf-r8-arrow-schema/0.1.0"


def profile_version() -> str:
    """Return the exact native capability identifier for this profile."""
    return _rust._rust_core.arrow_schema_profile_version()


def _call(op: str, fields: dict[str, Any], *, max_work=None, meter=None,
          is_cancelled=None, now=None, deadline_ms=None):
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core Arrow schema capability profile mismatch")
    has_controls = any(value is not None for value in
                       (max_work, meter, is_cancelled, now, deadline_ms))
    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    request = {"op": f"arrow.schema.{op}", **fields}
    wire = json.dumps(
        _rust._wire(request, work=host_work),
        ensure_ascii=True,
        separators=(",", ":"),
    )
    response_text = (
        _rust._rust_core.execute_arrow_schema_wire(wire, charge)
        if has_controls
        else _rust._rust_core.execute_arrow_schema_wire(wire)
    )
    host_work(len(response_text))
    try:
        envelope = json.loads(response_text)
    except json.JSONDecodeError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust response") from error
    if type(envelope) is not dict or envelope.get("profile") != "umf.core-wire/1":
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust result envelope")
    if envelope.get("status") == "error":
        _rust._raise_native(ValueError(response_text))
    if envelope.get("status") != "ok" or type(envelope.get("wire")) is not str:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust result envelope")
    host_work(len(envelope["wire"]))
    try:
        return _rust._from_wire(json.loads(envelope["wire"]), host_work)
    except json.JSONDecodeError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust tagged value") from error


def import_schema(source: str, document_id: str, **controls):
    """Import schema JSON using exact UTF-16 source transport."""
    if type(source) is not str or type(document_id) is not str:
        raise TypeError("source and document_id must be strings")
    return _call("import", {"source": source, "id": document_id}, **controls)


def inspect(document: Any, **controls):
    """Inspect a preserved Arrow schema without claiming native validity."""
    return _call("inspect", {"document": document}, **controls)


def export_schema(document: Any, **controls) -> str:
    """Export the exact native schema JSON text, preserving numeric tokens."""
    result = _call("export", {"document": document}, **controls)
    if type(result) is not str:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Arrow schema export was not text")
    return result


def get_node(document: Any, pointer: str, **controls):
    """Return a copied native JSON subtree at a JSON Pointer."""
    if type(pointer) is not str:
        raise TypeError("pointer must be a string")
    return _call("getNode", {"document": document, "pointer": pointer}, **controls)


def propose_node_edit(document: Any, pointer: str, replacement: str, **controls):
    """Return a validated edit proposal while leaving the input unchanged."""
    if type(pointer) is not str or type(replacement) is not str:
        raise TypeError("pointer and replacement must be strings")
    return _call(
        "proposeNodeEdit",
        {"document": document, "pointer": pointer, "replacement": replacement},
        **controls,
    )

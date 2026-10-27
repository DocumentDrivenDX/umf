# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust binding for exact Arrow IPC source capture."""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls

_PROFILE = "umf-r8-arrow-ipc/0.1.0"
_MAX_SOURCE_BYTES = 1_000_000


def profile_version() -> str:
    """Return the exact native capability identifier for this profile."""
    return _rust._rust_core.arrow_ipc_profile_version()


def _call(op: str, fields: dict[str, Any], *, max_work=None, meter=None,
          is_cancelled=None, now=None, deadline_ms=None):
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core Arrow IPC capability profile mismatch")
    has_controls = any(value is not None for value in
                       (max_work, meter, is_cancelled, now, deadline_ms))
    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    request = {"op": f"arrow.ipc.{op}", **fields}
    wire = json.dumps(_rust._wire(request, work=host_work),
                      ensure_ascii=True, separators=(",", ":"))
    response_text = (
        _rust._rust_core.execute_arrow_ipc_wire(wire, charge)
        if has_controls
        else _rust._rust_core.execute_arrow_ipc_wire(wire)
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


def capture(source: bytes, document_id: str, **controls):
    """Capture up to one million source bytes without parsing Arrow semantics."""
    if type(source) is not bytes or type(document_id) is not str:
        raise TypeError("source must be bytes and document_id must be a string")
    if len(source) > _MAX_SOURCE_BYTES:
        raise _rust.UmfCoreError("ARROW_IPC_LIMIT", "Expected at most 1000000 source bytes")
    return _call("capture", {"bytes": source.hex(), "id": document_id}, **controls)


def export(document: Any, **controls) -> bytes:
    """Return a fresh copy of the exact captured bytes."""
    result = _call("export", {"document": document}, **controls)
    if type(result) is not str:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Arrow IPC export was not hexadecimal text")
    try:
        return bytes.fromhex(result)
    except ValueError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Arrow IPC export was malformed") from error


def inspect(document: Any, **controls):
    """Validate capture structure and report incomplete interpretation."""
    return _call("inspect", {"document": document}, **controls)

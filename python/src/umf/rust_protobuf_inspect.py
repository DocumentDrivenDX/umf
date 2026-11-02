# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust binding for the bounded Protobuf descriptor inspector."""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls

_PROFILE = "umf-r5-protobuf-inspect/0.1.0"


def profile_version() -> str:
    """Return the exact opt-in inspector capability identifier."""
    return _rust._rust_core.protobuf_inspect_profile_version()


def inspect(document: Any, *, max_work=None, meter=None, is_cancelled=None,
            now=None, deadline_ms=None) -> Any:
    """Inspect a UMF document while retaining UTF-16 through core-wire/1."""
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core Protobuf inspector capability profile mismatch")
    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    request = {"op": "protobuf.descriptor.inspect", "document": document}
    wire = json.dumps(_rust._wire(request, work=host_work), ensure_ascii=True,
                      separators=(",", ":"))
    response_text = _rust._rust_core.execute_protobuf_inspect_wire(wire, charge)
    host_work(len(response_text))
    try:
        envelope = json.loads(response_text)
    except json.JSONDecodeError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust response") from error
    if envelope.get("profile") != "umf.core-wire/1":
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

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust inspection for a whole UMF document carrying an Avro schema."""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls

_PROFILE = "umf-r5-avro-document-inspect/0.1.0"


def profile_version() -> str:
    """Return the exact opt-in native capability identifier."""
    return _rust._rust_core.avro_document_inspect_profile_version()


def inspect(document: Any, *, max_work=None, meter=None, is_cancelled=None,
            now=None, deadline_ms=None) -> dict[str, Any]:
    """Inspect UMF admission and bounded native Avro semantics independently."""
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core Avro document inspector capability profile mismatch")
    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    host_work(1)
    wire = json.dumps(_rust._wire({"op": "avro.document.inspect", "document": document}, work=host_work),
                      ensure_ascii=True, separators=(",", ":"))
    response_text = _rust._rust_core.execute_avro_document_inspect_wire(wire, charge)
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
        report = _rust._from_wire(json.loads(envelope["wire"]), host_work)
    except json.JSONDecodeError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust document inspection report") from error
    if not isinstance(report, dict) or report.get("profile") != _PROFILE or "admission" not in report or "nativeInspection" not in report:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust document inspection report")
    return report

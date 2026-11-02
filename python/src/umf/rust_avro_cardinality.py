# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in shared Rust Avro Cardinality classification, verification and recovery."""
from __future__ import annotations
import json
from typing import Any
from . import _rust
from .rust_iceberg_schema import _controls

_PROFILE = "umf.avro-cardinality-binding/1.0.0"

def profile_version() -> str:
    return _rust._rust_core.avro_cardinality_binding_profile_version()

def _call(op: str, fields: dict[str, Any], *, max_work=None, meter=None,
          is_cancelled=None, now=None, deadline_ms=None) -> Any:
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core Avro Cardinality binding profile mismatch")
    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    host_work(1)
    request = {"profile": _PROFILE, "op": op, **fields}
    wire = json.dumps(_rust._wire(request, work=host_work), ensure_ascii=True, separators=(",", ":"))
    response_text = _rust._rust_core.execute_avro_cardinality_wire(wire, charge)
    host_work(len(response_text))
    try:
        response = json.loads(response_text)
    except json.JSONDecodeError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust response") from error
    if type(response) is not dict or response.get("profile") != "umf.core-wire/1":
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust result envelope")
    if response.get("status") == "error":
        _rust._raise_native(ValueError(response_text))
    if response.get("status") != "ok" or type(response.get("wire")) is not str:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust result envelope")
    host_work(len(response["wire"]))
    try:
        return _rust._from_wire(json.loads(response["wire"]), host_work)
    except json.JSONDecodeError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust tagged result") from error

def classify(source: Any, request: Any, **controls: Any) -> Any:
    return _call("classifyAvroCardinality", {"source": source, "request": request}, **controls)

def verify(receipt: Any, current: Any, **controls: Any) -> Any:
    return _call("verifyAvroCardinalityClassification", {"receipt": receipt, "current": current}, **controls)

def recover(receipt: Any, current: Any, **controls: Any) -> Any:
    return _call("recoverAvroCardinalityBundle", {"receipt": receipt, "current": current}, **controls)

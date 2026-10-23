# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust binding for the bounded standalone Iceberg schema profile."""

from __future__ import annotations

import json
import math
from collections.abc import Callable
from typing import Any

from . import _rust

_PROFILE = "umf-r5-iceberg-schema/0.1.0"


def profile_version() -> str:
    """Return the native capability identifier for this binding."""
    return _rust._rust_core.iceberg_schema_profile_version()


def _controls(max_work, meter, is_cancelled, now, deadline_ms):
    if max_work is not None and (type(max_work) is not int or max_work < 0):
        raise TypeError("max_work must be a non-negative integer")
    if deadline_ms is not None and (type(deadline_ms) is not int or now is None):
        raise TypeError("now is required with an integer deadline_ms")
    for name, callback in (("meter", meter), ("is_cancelled", is_cancelled), ("now", now)):
        if callback is not None and not callable(callback):
            raise TypeError(f"{name} must be callable")
    charged = 0

    def charge(amount: int):
        nonlocal charged
        charged += amount
        if max_work is not None and charged > max_work:
            return ("RESOURCE_LIMIT", "Host work budget exceeded", "")
        if amount and meter is not None:
            try:
                meter(amount)
            except Exception as error:
                return ("METER_FAILURE", str(error), "")
        if is_cancelled is not None:
            try:
                cancelled = is_cancelled()
            except Exception as error:
                return ("CANCELLATION_CHECK_FAILURE", str(error), "")
            if type(cancelled) is not bool:
                return ("CANCELLATION_CHECK_FAILURE", "Cancellation callback must return bool", "")
            if cancelled:
                return ("CANCELLED", "Operation cancelled by host", "")
        if deadline_ms is not None:
            try:
                current = now()
            except Exception as error:
                return ("CLOCK_CAPABILITY_REQUIRED", str(error), "")
            if type(current) not in (int, float) or (type(current) is float and not math.isfinite(current)):
                return ("CLOCK_CAPABILITY_REQUIRED", "Host clock must return a finite number", "")
            if current > deadline_ms:
                return ("DEADLINE", "Deadline elapsed", "")
        return None

    def host_work(amount: int):
        failure = charge(amount)
        if failure is not None:
            raise _rust.UmfCoreError(*failure)

    return charge, host_work


def _call(op: str, fields: dict[str, Any], *, max_work=None, meter=None,
          is_cancelled=None, now=None, deadline_ms=None):
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core Iceberg schema capability profile mismatch")
    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    request = {"op": f"iceberg.schema.{op}", **fields}
    wire = json.dumps(_rust._wire(request, work=host_work), ensure_ascii=True, separators=(",", ":"))
    response_text = _rust._rust_core.execute_iceberg_wire(wire, charge)
    host_work(len(response_text))
    try:
        envelope = json.loads(response_text)
    except json.JSONDecodeError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed native response") from error
    if envelope.get("status") == "error":
        _rust._raise_native(ValueError(response_text))
    host_work(len(envelope["wire"]))
    result = json.loads(envelope["wire"])
    return _rust._from_wire(result, host_work)


def import_schema(source: str, document_id: str, **controls):
    """Import native schema JSON while retaining exact UTF-16 source text."""
    return _call("import", {"source": source, "id": document_id}, **controls)


def export_schema(document: Any, **controls):
    return _call("export", {"document": document}, **controls)


def inspect(document: Any, **controls):
    return _call("inspect", {"document": document}, **controls)


def get_node(document: Any, pointer: str, **controls):
    return _call("getNode", {"document": document, "pointer": pointer}, **controls)


def propose_node_edit(document: Any, pointer: str, replacement: Any, **controls):
    return _call("proposeNodeEdit", {
        "document": document, "pointer": pointer, "replacement": replacement,
    }, **controls)

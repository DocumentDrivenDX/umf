# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public Python transport for the shared Rust adapter operations."""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls


def adapter_info(family: str) -> dict[str, Any]:
    """Describe a closed adapter family using the compiled Rust registry."""
    if type(family) is not str:
        raise TypeError("family must be a string")
    response = _rust._rust_core.native_adapter_metadata(family)
    return _rust._from_wire(json.loads(_rust._checked_envelope(response)))


def execute_adapter(
    family: str,
    operation: str,
    *,
    max_work=None,
    meter=None,
    is_cancelled=None,
    now=None,
    deadline_ms=None,
    **fields: Any,
) -> Any:
    """Run a Rust adapter operation with optional cumulative host controls.

    Use ``adapter_info(family)["operations"]`` for available operation names.
    Request fields use the shared API's names; source text is passed unchanged.
    """
    if type(operation) is not str:
        raise TypeError("operation must be a string")
    if "profile" in fields or "op" in fields:
        raise TypeError("profile and op are selected by the adapter interface")
    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    host_work(1)
    info = adapter_info(family)
    wire_operation = info["operations"].get(operation)
    if wire_operation is None:
        raise TypeError("Unknown operation for native adapter family")
    request = {"profile": info["profile"], "op": wire_operation, **fields}
    wire = json.dumps(_rust._wire(request, work=host_work),
                      ensure_ascii=True, separators=(",", ":"))
    has_controls = any(value is not None for value in
                       (max_work, meter, is_cancelled, now, deadline_ms))
    response = (_rust._rust_core.execute_native_family_wire(family, wire, charge)
                if has_controls else
                _rust._rust_core.execute_native_family_wire(family, wire))
    host_work(len(response))
    result = _rust._checked_envelope(response)
    host_work(len(result))
    return _rust._from_wire(json.loads(result), host_work)

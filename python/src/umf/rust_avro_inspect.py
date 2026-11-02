# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in binding for the bounded, incomplete Rust Avro structural inspector."""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls

_PROFILE = "umf-r5-avro-inspect/0.1.0"
_MAX_DEPENDENCIES = 100_000


def profile_version() -> str:
    """Return the exact native capability identifier."""
    return _rust._rust_core.avro_inspect_profile_version()


def inspect(root: Any, dependencies=(), *, max_work=None, meter=None,
            is_cancelled=None, now=None, deadline_ms=None) -> Any:
    """Inspect a tagged Avro schema tree and ordered tagged dependencies.

    The result is an explicit structural subset; ``complete`` is always false.
    The inspector does not parse source text, load dependencies, or activate the
    default adapter.
    """
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core Avro inspector capability profile mismatch")
    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    host_work(1)
    if type(dependencies) not in (list, tuple):
        raise TypeError("dependencies must be a list or tuple")
    if len(dependencies) > _MAX_DEPENDENCIES:
        raise ValueError("too many Avro dependencies")
    host_work(len(dependencies) + 1)
    owned_dependencies = []
    for dependency in dependencies:
        host_work(1)
        if type(dependency) is not tuple or len(dependency) != 2:
            raise TypeError("each dependency must be an exact (id, root) tuple")
        dependency_id, schema = dependency
        if type(dependency_id) is not str:
            raise TypeError("dependency ID must be an exact string")
        host_work(len(dependency_id) + 1)
        owned_dependencies.append({"id": dependency_id, "root": schema})
    request = {"op": "avro.schema.inspect", "root": root,
               "dependencies": owned_dependencies}
    wire = json.dumps(_rust._wire(request, work=host_work), ensure_ascii=True,
                      separators=(",", ":"))
    response_text = _rust._rust_core.execute_avro_inspect_wire(wire, charge)
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

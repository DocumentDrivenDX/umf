# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust bridge for lossless Avro candidate document edits.

This candidate operation preserves the admitted source and proposes a detached
document. It reports bounded native inspection separately and does not change
the default Avro adapter or certify Avro validity.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls

_PROFILE = "umf-r5-avro-candidate/0.1.0"


def profile_version() -> str:
    """Return the exact opt-in native capability identifier."""
    return _rust._rust_core.avro_candidate_profile_version()


def propose_node_edit(
    document: Any,
    path: str,
    replacement_json: str,
    *,
    dependency_id: str | None = None,
    max_work: int | None = None,
    meter: Callable[[int], object] | None = None,
    is_cancelled: Callable[[], bool] | None = None,
    now: Callable[[], int | float | None] | None = None,
    deadline_ms: int | None = None,
) -> dict[str, Any]:
    """Return a detached Avro candidate report for one explicit native edit.

    ``replacement_json`` is passed as source text to Rust without host JSON
    parsing or re-encoding, preserving exact integer tokens. The report keeps
    structural admission separate from bounded native inspection.
    """
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core Avro candidate capability profile mismatch")
    if type(path) is not str:
        raise TypeError("path must be an exact string")
    if type(replacement_json) is not str:
        raise TypeError("replacement_json must be an exact string")
    if dependency_id is not None and type(dependency_id) is not str:
        raise TypeError("dependency_id must be an exact string or None")

    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    host_work(1)
    request = {
        "op": "avro.schema.proposeNodeEdit",
        "document": document,
        "path": path,
        "replacementJson": replacement_json,
    }
    if dependency_id is not None:
        request["dependencyId"] = dependency_id
    wire = json.dumps(
        _rust._wire(request, work=host_work),
        ensure_ascii=True,
        separators=(",", ":"),
    )
    response_text = _rust._rust_core.execute_avro_candidate_wire(wire, charge)
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
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust candidate report") from error
    if not isinstance(report, dict) or report.get("profile") != _PROFILE:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust candidate report")
    return report

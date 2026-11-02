# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust binding for the bounded Core Cardinality operations.

This module does not change UMF's default Python model APIs or claim native
storage equivalence. It owns only the explicit inspect, declare, and receipt
verification operations backed by the shared Rust core.

``max_work`` meters native core-wire work and ``timeout_ms`` sets its native
deadline. Python-side resource loading and wire encoding happen before native
dispatch and are not charged against ``max_work``; the native deadline begins
when the encoded request enters Rust.
"""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .generated_resources import generated_resource

_PROFILE = "umf-core-cardinality/0.1.0"
_RESOURCE_NAMES = {
    "coreSchema": "schema",
    "referenceSchema": "semantic_reference",
    "packageSchema": "package_schema",
    "constraints": "constraints",
    "domainPolicy": "domain_policy",
}


def profile_version() -> str:
    """Return the versioned opt-in capability identifier."""
    return _rust._rust_core.core_cardinality_profile_version()


def _call(op: str, fields: dict[str, Any], *, max_work=None, timeout_ms=None):
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core Cardinality capability profile mismatch")
    for name, value in (("max_work", max_work), ("timeout_ms", timeout_ms)):
        if value is not None and (type(value) is not int or value < 0):
            raise TypeError(f"{name} must be a non-negative integer")
    resources = {
        name: generated_resource(resource_name)
        for name, resource_name in _RESOURCE_NAMES.items()
    }
    request = {"op": op, "resources": resources, **fields}
    wire = json.dumps(_rust._wire(request), ensure_ascii=True, separators=(",", ":"))
    response_text = _rust._rust_core.execute_core_cardinality_wire(
        wire, max_work, timeout_ms
    )
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
    try:
        return _rust._from_wire(json.loads(response["wire"]))
    except json.JSONDecodeError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust tagged value") from error


def inspect(source: Any, identity: Any, *, max_work=None, timeout_ms=None) -> Any:
    """Inspect cardinality meaning for one explicit ``{module, element}`` identity."""
    return _call(
        "model/inspectCoreCardinality",
        {"source": source, "identity": identity},
        max_work=max_work,
        timeout_ms=timeout_ms,
    )


def declare(source: Any, identity: Any, request: Any, *, max_work=None, timeout_ms=None) -> Any:
    """Create a versioned Cardinality declaration receipt."""
    return _call(
        "model/declareCoreCardinality",
        {"source": source, "identity": identity, "request": request},
        max_work=max_work,
        timeout_ms=timeout_ms,
    )


def verify(receipt: Any, current: Any, *, max_work=None, timeout_ms=None) -> Any:
    """Verify a declaration receipt against the current document."""
    return _call(
        "model/verifyCoreCardinalityDeclaration",
        {"receipt": receipt, "current": current},
        max_work=max_work,
        timeout_ms=timeout_ms,
    )

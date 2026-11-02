# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust binding for the four public Core Facets operations.

This module leaves the default Python model APIs unchanged and does not claim
native-system equivalence. Python-side copying, resource loading and tagged-wire
encoding happen before native dispatch and are not charged to ``max_work``; the
native deadline starts when the encoded wire enters Rust.
"""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .generated_resources import generated_resource

_PROFILE = "umf-core-facets/0.1.0"
_RESOURCE_NAMES = {
    "coreSchema": "schema",
    "referenceSchema": "semantic_reference",
    "packageSchema": "package_schema",
    "constraints": "constraints",
    "domainPolicy": "domain_policy",
}


def profile_version() -> str:
    """Return the versioned opt-in capability identifier."""
    return _rust._rust_core.core_facets_profile_version()


def _call(op: str, fields: dict[str, Any], *, max_work=None, timeout_ms=None):
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core Facets capability profile mismatch")
    for name, value in (("max_work", max_work), ("timeout_ms", timeout_ms)):
        if value is not None and (type(value) is not int or value < 0):
            raise TypeError(f"{name} must be a non-negative integer")
    resources = {
        name: generated_resource(resource_name)
        for name, resource_name in _RESOURCE_NAMES.items()
    }
    request = {"op": op, "resources": resources, **fields}
    wire = json.dumps(_rust._wire(request), ensure_ascii=True, separators=(",", ":"))
    response_text = _rust._rust_core.execute_core_facets_wire(
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
    """Inspect the preserved and interpreted facet meaning for one field."""
    return _call(
        "model/inspectCoreFacets",
        {"source": source, "identity": identity},
        max_work=max_work,
        timeout_ms=timeout_ms,
    )


def declare(source: Any, identity: Any, request: Any, *, max_work=None, timeout_ms=None) -> Any:
    """Add a versioned authored facet declaration to a copied core document."""
    return _call(
        "model/declareCoreFacets",
        {"source": source, "identity": identity, "request": request},
        max_work=max_work,
        timeout_ms=timeout_ms,
    )


def verify(receipt: Any, current: Any, *, max_work=None, timeout_ms=None) -> Any:
    """Verify a declaration receipt and the current document snapshot."""
    return _call(
        "model/verifyCoreFacetDeclaration",
        {"receipt": receipt, "current": current},
        max_work=max_work,
        timeout_ms=timeout_ms,
    )


def historical_patch(input: Any, *, max_work=None, timeout_ms=None) -> Any:
    """Project a closed interpreted facet value into the historical patch form."""
    return _call(
        "model/historicalCoreFacetPatch",
        {"input": input},
        max_work=max_work,
        timeout_ms=timeout_ms,
    )

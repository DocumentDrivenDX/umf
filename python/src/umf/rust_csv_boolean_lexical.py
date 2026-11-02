# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust binding for the two public CSV Boolean lexical operations."""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .generated_resources import generated_resource

_PROFILE = "umf-csv-boolean-lexical/0.1.0"
_RESOURCE_NAMES = {
    "coreSchema": "schema",
    "referenceSchema": "semantic_reference",
    "packageSchema": "package_schema",
    "constraints": "constraints",
    "domainPolicy": "domain_policy",
}


def profile_version() -> str:
    return _rust._rust_core.csv_boolean_lexical_profile_version()


def _call(op: str, fields: dict[str, Any], *, max_work=None, timeout_ms=None):
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core CSV Boolean lexical capability profile mismatch")
    for name, value in (("max_work", max_work), ("timeout_ms", timeout_ms)):
        if value is not None and (type(value) is not int or value < 0):
            raise TypeError(f"{name} must be a non-negative integer")
    resources = {
        name: generated_resource(resource_name)
        for name, resource_name in _RESOURCE_NAMES.items()
    }
    wire = json.dumps(
        _rust._wire({"op": op, "resources": resources, **fields}),
        ensure_ascii=True,
        separators=(",", ":"),
    )
    response_text = _rust._rust_core.execute_csv_boolean_lexical_wire(
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


def validate(source: Any, csv_request: Any, *, max_work=None, timeout_ms=None) -> Any:
    return _call(
        "model/validateCsvBooleanLexical",
        {"source": source, "csvRequest": csv_request},
        max_work=max_work,
        timeout_ms=timeout_ms,
    )


def verify(receipt: Any, source: Any, csv_request: Any, *, max_work=None, timeout_ms=None) -> Any:
    return _call(
        "model/verifyCsvBooleanLexical",
        {"receipt": receipt, "source": source, "csvRequest": csv_request},
        max_work=max_work,
        timeout_ms=timeout_ms,
    )

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Strict host admission and compatibility entrypoint for the shared Rust core."""

from __future__ import annotations

import json
import struct
import sys
from functools import cache
from typing import Any

try:
    from . import _rust_core
except ImportError as error:  # fail closed; no Python semantic fallback
    raise ImportError("umf-core was installed without its required Rust engine") from error


class UmfCoreError(ValueError):
    def __init__(self, code: str, message: str, path: str = "") -> None:
        super().__init__(message)
        self.code = code
        self.path = path


def _units(text: str) -> list[int]:
    raw = text.encode("utf-16-le", "surrogatepass")
    return list(struct.unpack(f"<{len(raw) // 2}H", raw)) if raw else []


def _wire(value: Any, path: str = "", depth: int = 0, counter: list[int] | None = None, *, max_values: int = 100_000, max_depth: int = 128, work: Any = None) -> dict[str, Any]:
    if work is not None:
        work(1)
    if counter is None:
        counter = [0]
    counter[0] += 1
    if counter[0] > max_values or depth > max_depth:
        raise UmfCoreError("LIMIT", "JSON structural limit exceeded", path)
    if value is None:
        return {"kind": "null"}
    if type(value) is bool:
        return {"kind": "boolean", "value": value}
    if type(value) is int:
        if abs(value) > 9_007_199_254_740_991:
            # Rust owns final numeric admission; retaining the exact token here avoids rounding.
            raise UmfCoreError("NUMBER", "Integer is outside the safe binary64 envelope", path)
        value = float(value)
    if type(value) is float:
        bits = struct.pack(">d", value).hex()
        return {"kind": "number", "bits": bits}
    if type(value) is str:
        if work is not None:
            work(len(value) * 2)
        return {"kind": "string", "units": _units(value)}
    if type(value) is list:
        if work is not None:
            work(len(value))
        return {"kind": "array", "items": [_wire(item, f"{path}/{index}", depth + 1, counter, max_values=max_values, max_depth=max_depth, work=work) for index, item in enumerate(value)]}
    if type(value) is dict:
        members = []
        for key, item in dict.items(value):
            if type(key) is not str:
                raise UmfCoreError("UNSUPPORTED_KEY", "JSON object keys must be strings", path)
            if work is not None:
                work(len(key) * 2 + 1)
            escaped = key.replace("~", "~0").replace("/", "~1")
            members.append({"key": _units(key), "value": _wire(item, f"{path}/{escaped}", depth + 1, counter, max_values=max_values, max_depth=max_depth, work=work)})
        return {"kind": "object", "members": members}
    raise UmfCoreError("UNSUPPORTED_VALUE", f"Unsupported Python value type: {type(value).__name__}", path)


def _from_wire(value: dict[str, Any], work: Any = None) -> Any:
    if work is not None:
        work(1)
    kind = value["kind"]
    if kind == "null":
        return None
    if kind == "boolean":
        return value["value"]
    if kind == "number":
        return struct.unpack(">d", bytes.fromhex(value["bits"]))[0]
    if kind == "string":
        if work is not None:
            work(len(value["units"]))
        raw = struct.pack(f"<{len(value['units'])}H", *value["units"]) if value["units"] else b""
        return raw.decode("utf-16-le", "surrogatepass")
    if kind == "array":
        return [_from_wire(item, work) for item in value["items"]]
    if kind == "object":
        result = {}
        for member in value["members"]:
            if work is not None:
                work(len(member["key"]) + 1)
            raw = struct.pack(f"<{len(member['key'])}H", *member["key"]) if member["key"] else b""
            key = raw.decode("utf-16-le", "surrogatepass")
            if key in result:
                raise UmfCoreError("DUPLICATE_KEY", "Duplicate object key")
            result[key] = _from_wire(member["value"], work)
        return result
    raise UmfCoreError("WIRE_FORMAT", f"Unknown umf.core-wire/1 tag {kind!r}")


def _from_units(value: Any) -> str:
    if type(value) is not list or any(type(unit) is not int or unit < 0 or unit > 0xFFFF for unit in value):
        raise UmfCoreError("WIRE_FORMAT", "Malformed UTF-16 error field")
    raw = struct.pack(f"<{len(value)}H", *value) if value else b""
    return raw.decode("utf-16-le", "surrogatepass")


def _raise_native(error: ValueError) -> None:
    """Reconstitute the closed Rust error envelope without UTF-8 loss."""
    text = str(error)
    try:
        result = json.loads(text)
    except (TypeError, json.JSONDecodeError):
        raise error
    if result.get("profile") != "umf.core-wire/1" or result.get("status") != "error":
        raise error
    raise UmfCoreError(
        result.get("code", "ENGINE"),
        _from_units(result.get("messageUnits")),
        _from_units(result.get("pathUnits")),
    ) from error


def _checked_envelope(text: str) -> str:
    result = json.loads(text)
    if type(result) is not dict or result.get("profile") != "umf.core-wire/1":
        raise UmfCoreError("WIRE_FORMAT", "Malformed Rust result envelope")
    if result.get("status") == "error":
        raise UmfCoreError(
            result.get("code", "ENGINE"),
            _from_units(result.get("messageUnits")),
            _from_units(result.get("pathUnits")),
        )
    if result.get("status") != "ok" or type(result.get("wire")) is not str:
        raise UmfCoreError("WIRE_FORMAT", "Malformed Rust result envelope")
    return result["wire"]


def copy_json(value: Any) -> Any:
    """Return an isolated, Rust-admitted snapshot of a plain JSON value."""
    try:
        return _rust_core.copy_python_json_value(value)
    except ValueError as error:
        _raise_native(error)


def copy_python_consumer_value(value: Any) -> Any:
    """Copy a built-in Python consumer value without collapsing its origin."""
    try:
        return _rust_core.copy_python_consumer_value(value)
    except ValueError as error:
        _raise_native(error)


def compile_python_schema(schema: Any, *, resources: Any = (), strict: bool = False, python_minor: int | None = None):
    """Compile a source-preserving Python consumer schema in Rust."""
    python_minor = sys.version_info.minor if python_minor is None else python_minor
    try:
        return _rust_core.NativePythonSchema(schema, resources, strict, python_minor)
    except ValueError as error:
        _raise_native(error)


def evaluate_python_schema(compiled: Any, instance: Any, *, first_error: bool = False) -> tuple[list[dict[str, Any]], str | None]:
    """Evaluate with Rust's ordered schema mode and retain a deferred terminal error."""
    try:
        errors, terminal = compiled.evaluate(instance, first_error)
    except ValueError as error:
        _raise_native(error)
    if type(errors) is not list or (terminal is not None and type(terminal) is not str):
        raise UmfCoreError("WIRE_FORMAT", "Rust schema evaluator returned malformed results")
    return errors, terminal


def raise_native_envelope(envelope: str) -> None:
    """Raise the closed native error represented by a deferred envelope."""
    _raise_native(ValueError(envelope))


def read_value(text: str, format: str = "json") -> Any:
    if type(text) is not str:
        raise TypeError("source text must be a string")
    try:
        return _rust_core.read_python_value(text, format)
    except ValueError as error:
        _raise_native(error)


def write_value(value: Any, format: str = "json") -> str:
    try:
        return _rust_core.write_python_value(value, format)
    except ValueError as error:
        _raise_native(error)


def validate_schema(schema: Any, instance: Any, *, resources: Any = (), strict: bool = False, python_minor: int | None = None) -> list[dict[str, Any]]:
    """Run consumer JSON Schema evaluation in the Rust engine."""
    schema_wire = encode_wire(schema, catalog=True)
    instance_wire = encode_wire(instance)
    resources_wire = _encode_catalog_bundle(list(resources))
    python_minor = sys.version_info.minor if python_minor is None else python_minor
    try:
        result = _checked_envelope(_rust_core.validate_schema_wire(schema_wire, instance_wire, resources_wire, strict, python_minor))
    except ValueError as error:
        _raise_native(error)
    decoded = _from_wire(json.loads(result))
    if type(decoded) is not list:
        raise UmfCoreError("WIRE_FORMAT", "Rust schema validator returned malformed diagnostics")
    return decoded


def check_schema(schema: Any, *, resources: Any = (), strict: bool = False, python_minor: int | None = None) -> None:
    """Admit a schema in Rust without evaluating it against an instance."""
    schema_wire = encode_wire(schema, catalog=True)
    resources_wire = _encode_catalog_bundle(list(resources))
    python_minor = sys.version_info.minor if python_minor is None else python_minor
    try:
        _checked_envelope(_rust_core.check_schema_wire(schema_wire, resources_wire, strict, python_minor))
    except ValueError as error:
        _raise_native(error)


def _literal_result(function, *values):
    wires = [encode_wire(value) for value in values]
    try:
        result = _checked_envelope(function(*wires))
    except ValueError as error:
        _raise_native(error)
    return _from_wire(json.loads(result))


def literal_errors(document, field, value, enabled, policy):
    result = _literal_result(
        lambda document_wire, field_wire, value_wire, policy_wire: _rust_core.literal_errors_wire(
            document_wire, field_wire, value_wire, enabled, policy_wire,
        ),
        document, field, value, policy,
    )
    return result


def literal_identity(field, value, policy):
    result = _literal_result(_rust_core.literal_identity_wire, field, value, policy)
    return result


def numeric_interval(field, numeric_range, policy):
    return _literal_result(_rust_core.numeric_interval_wire, field, numeric_range, policy)


def _engine_with_constraints(program, domain_policy):
    from .generated_resources import generated_resource

    resources = [
        generated_resource("schema"),
        generated_resource("semantic_reference"),
        generated_resource("package_schema"),
        program,
        domain_policy,
    ]
    try:
        return _rust_core.NativeEngine(*(encode_wire(value, catalog=True) for value in resources))
    except ValueError as error:
        _raise_native(error)


def run_core_constraints(document, registry=None, *, program=None, domain_policy=None):
    from .generated_resources import generated_resource

    engine = _current_engine() if program is None and domain_policy is None else _engine_with_constraints(
        generated_resource("constraints") if program is None else program,
        generated_resource("domain_policy") if domain_policy is None else domain_policy,
    )
    rust_registry = new_registry() if registry is None else getattr(registry, "_rust_registry", registry)
    try:
        result = engine.run_core_constraints(document, rust_registry)
    except ValueError as error:
        _raise_native(error)
    from .registry import Diagnostic

    return tuple(Diagnostic(**item) for item in result)


def check_constraint_program(program):
    from .generated_resources import generated_resource

    _engine_with_constraints(program, generated_resource("domain_policy"))


def encode_wire(value: Any, *, catalog: bool = False) -> str:
    """Encode inspected values under per-tree structural limits, preserving arbitrary copied text."""
    values = 1_000_000 if catalog else 100_000
    return json.dumps(_wire(value, max_values=values), ensure_ascii=True, separators=(",", ":"))


def _encode_catalog_bundle(values: list[Any]) -> str:
    """Transport independently bounded catalog trees in one tagged array."""
    wire = {"kind": "array", "items": [_wire(value, max_values=1_000_000) for value in values]}
    return json.dumps(wire, ensure_ascii=True, separators=(",", ":"))


@cache
def _current_engine():
    from .generated_resources import generated_resource

    resources = (
        generated_resource("schema"),
        generated_resource("semantic_reference"),
        generated_resource("package_schema"),
        generated_resource("constraints"),
        generated_resource("domain_policy"),
    )
    try:
        return _rust_core.NativeEngine(*(encode_wire(value, catalog=True) for value in resources))
    except ValueError as error:
        _raise_native(error)


def new_registry():
    return _current_engine().registry()


def validate_document(
    value: Any,
    registry: Any = None,
    *,
    max_work: int | None = None,
    meter=None,
    is_cancelled=None,
    now=None,
    deadline_ms: int | None = None,
) -> dict[str, Any]:
    if type(value) in (dict, list, str, bool, int, float) or value is None:
        document = value
    else:
        from pydantic import BaseModel

        from .models import Document

        if not isinstance(value, Document):
            raise UmfCoreError("NON_JSON", "Plain JSON values or UMF Document models are required")
        document = BaseModel.model_dump(value, by_alias=True, exclude_unset=True)
    if registry is None:
        rust_registry = new_registry()
    else:
        rust_registry = getattr(registry, "_rust_registry", registry)
    try:
        return _current_engine().validate_document(
            document,
            rust_registry,
            max_work=max_work,
            meter=meter,
            is_cancelled=is_cancelled,
            now=now,
            deadline_ms=deadline_ms,
        )
    except ValueError as error:
        _raise_native(error)

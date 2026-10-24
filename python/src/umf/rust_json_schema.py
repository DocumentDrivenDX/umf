# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust host for the bounded JSON Schema preservation profile.

Exported JSON numbers use :class:`ExactJsonNumber`, an immutable carrier that
retains the original token without Python integer digit limits, decimal
context limits, or binary-float conversion. Use :func:`dump_native_json` to
serialize returned schemas/resources while emitting those values as numbers.
The standard ``json.dumps`` encoder does not know this carrier.
"""

from __future__ import annotations

import json
import re
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls

_PROFILE = "umf-r5-json-schema/0.1.0"
_JSON_NUMBER = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\Z")


class ExactJsonNumber:
    """Immutable JSON number token with explicit exact serialization."""

    __slots__ = ("lexeme",)

    def __init__(self, lexeme: str):
        if type(lexeme) is not str or _JSON_NUMBER.fullmatch(lexeme) is None:
            raise ValueError("JSON number lexeme must match JSON number syntax")
        object.__setattr__(self, "lexeme", lexeme)

    def __setattr__(self, name, value):
        raise AttributeError("ExactJsonNumber is immutable")

    def __delattr__(self, name):
        raise AttributeError("ExactJsonNumber is immutable")

    def __repr__(self) -> str:
        return f"ExactJsonNumber({self.lexeme!r})"

    def __str__(self) -> str:
        return self.lexeme

    def __eq__(self, other: object) -> bool:
        return type(other) is ExactJsonNumber and self.lexeme == other.lexeme

    def __hash__(self) -> int:
        return hash((ExactJsonNumber, self.lexeme))

    def __copy__(self):
        return self

    def __deepcopy__(self, memo):
        return self

    def to_json(self) -> str:
        """Return the exact token as a JSON number literal."""
        return self.lexeme


__all__ = [
    "ExactJsonNumber", "dump_native_json", "export_json_schema",
    "export_json_schema_bundle", "export_json_schema_resources", "get_node",
    "import_json_schema", "inspect", "profile_version", "walk",
]


def _native_json(source: str, host_work):
    """Decode numeric tokens without constructing bounded Python numerics."""
    host_work(1 + 2 * len(source))
    try:
        return json.loads(
            source,
            parse_int=ExactJsonNumber,
            parse_float=ExactJsonNumber,
            parse_constant=lambda token: (_ for _ in ()).throw(
                ValueError(f"Invalid JSON numeric constant {token}")
            ),
        )
    except (json.JSONDecodeError, ValueError) as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed native JSON result") from error


def _int_token(value: int) -> str:
    if value == 0:
        return "0"
    negative = value < 0
    remainder = -value if negative else value
    chunks = []
    while remainder:
        remainder, chunk = divmod(remainder, 1_000_000_000)
        chunks.append(chunk)
    token = str(chunks[-1]) + "".join(f"{chunk:09d}" for chunk in reversed(chunks[:-1]))
    return "-" + token if negative else token


def dump_native_json(value: Any) -> str:
    """Serialize returned JSON-shaped values without normalizing number tokens."""
    if type(value) is ExactJsonNumber:
        return value.to_json()
    if value is None or type(value) in (bool, float, str):
        return json.dumps(value, ensure_ascii=True, separators=(",", ":"), allow_nan=False)
    if type(value) is int:
        return _int_token(value)
    if type(value) is list:
        return "[" + ",".join(dump_native_json(item) for item in value) + "]"
    if type(value) is dict:
        if any(type(key) is not str for key in value):
            raise TypeError("native JSON object keys must be strings")
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=True) + ":" + dump_native_json(item)
            for key, item in value.items()
        ) + "}"
    raise TypeError(f"unsupported native JSON value {type(value).__name__}")


def profile_version() -> str:
    """Return the exact native capability identifier for this profile."""
    return _rust._rust_core.json_schema_profile_version()


def _call(op: str, fields: dict[str, Any], *, max_work=None, meter=None,
          is_cancelled=None, now=None, deadline_ms=None, _control_state=None,
          _has_controls=None,
          _result_decoder=None):
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core JSON Schema capability profile mismatch")
    if _control_state is None:
        charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
        has_controls = any(value is not None for value in
                           (max_work, meter, is_cancelled, now, deadline_ms))
    else:
        charge, host_work = _control_state
        has_controls = bool(_has_controls)
    request = {"profile": _PROFILE, "op": op, **fields}
    wire = json.dumps(_rust._wire(request, work=host_work), ensure_ascii=True,
                      separators=(",", ":"))
    # Native Rust admission and resource limits still run without a Python
    # hook; only explicit host controls need the callback-bearing entry point.
    response_text = (_rust._rust_core.execute_json_schema_wire(wire, charge)
                     if has_controls else _rust._rust_core.execute_json_schema_wire(wire))
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
        result = _rust._from_wire(json.loads(envelope["wire"]), host_work)
        if _result_decoder is not None:
            return _result_decoder(result, host_work)
        return result
    except json.JSONDecodeError as error:
        raise _rust.UmfCoreError("WIRE_FORMAT", "Malformed Rust tagged value") from error


def import_json_schema(source: str, document_id: str, base_uri: str,
                        resources: dict[str, str] | None = None, *, max_work=None,
                        meter=None, is_cancelled=None, now=None, deadline_ms=None):
    """Import schema text and explicitly ordered retrieval URI/source pairs."""
    if type(source) is not str or type(document_id) is not str or type(base_uri) is not str:
        raise TypeError("source, document_id, and base_uri must be strings")
    if resources is None:
        resources = {}
    # Validate controls before touching a caller-owned container. Restrict the
    # carrier to an exact dict so iteration cannot execute an arbitrary
    # Mapping.items implementation between budget checks.
    charge, host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
    host_work(0)
    if type(resources) is not dict:
        raise TypeError("resources must be a dict of string URIs to schema source strings")
    host_work(1)
    ordered = []
    resource_iter = iter(dict.items(resources))
    while True:
        host_work(1)
        try:
            uri, text = next(resource_iter)
        except StopIteration:
            break
        if type(uri) is not str or type(text) is not str:
            raise TypeError("resources must map string URIs to string schema sources")
        host_work(2 + len(uri) * 2 + len(text) * 2)
        ordered.append({"uri": uri, "source": text})
    return _call("importJsonSchema", {
        "source": source, "id": document_id, "baseUri": base_uri, "resources": ordered,
    }, _control_state=(charge, host_work), _has_controls=any(value is not None for value in
        (max_work, meter, is_cancelled, now, deadline_ms)))


def inspect(document: Any, **controls):
    return _call("inspectJsonSchema", {"document": document}, **controls)


def export_json_schema(document: Any, **controls):
    return _call(
        "exportJsonSchema", {"document": document},
        _result_decoder=lambda source, work: _native_json(source, work), **controls,
    )


def export_json_schema_resources(document: Any, **controls):
    def decode_resources(pairs, work):
        resources = {}
        for pair in pairs:
            work(1)
            resources[pair["uri"]] = _native_json(pair["source"], work)
        return resources
    return _call(
        "exportJsonSchemaResources", {"document": document},
        _result_decoder=decode_resources, **controls,
    )


def export_json_schema_bundle(document: Any, **controls):
    def decode_bundle(bundle, work):
        resources = {}
        for pair in bundle["resources"]:
            work(1)
            resources[pair["uri"]] = _native_json(pair["source"], work)
        return {
            "root": _native_json(bundle["root"], work),
            "resources": resources,
            "source": bundle["source"],
            "diagnostics": bundle["diagnostics"],
        }
    return _call(
        "exportJsonSchemaBundle", {"document": document},
        _result_decoder=decode_bundle, **controls,
    )


def get_node(document: Any, pointer: str, **controls):
    return _call("getJsonSchemaNode", {"document": document, "pointer": pointer}, **controls)


def walk(document: Any, **controls):
    return _call("walkJsonSchema", {"document": document}, **controls)

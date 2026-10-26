# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust renderer for a frozen logical-catalog DTO profile.

This operation ends before Weft compilation. The Python catalog builder remains
the default route and continues to own capture, source custody, and publishing.
"""

from __future__ import annotations

import json
import math
from dataclasses import fields, is_dataclass
from decimal import Decimal
from enum import Enum
from typing import Any, get_args, get_origin

from umf import rust_access_catalog as _core

_PROFILE = "umf-access-logical-render/0.1.0"
_MAX_CAPTURE_NODES = 50_000
_MAX_CAPTURE_DEPTH = 64
_MAX_CAPTURE_UTF8_BYTES = 8 * 1024 * 1024


class CatalogLogicalRenderUnavailable(RuntimeError):
    """The installed native logical-render profile is unavailable."""


def profile_version() -> str:
    try:
        version = _core.logical_render_profile_version()
    except (AttributeError, ImportError):
        raise CatalogLogicalRenderUnavailable(
            "Rust catalog logical-render capability unavailable"
        ) from None
    if version != _PROFILE:
        raise CatalogLogicalRenderUnavailable(
            "Rust catalog logical-render capability profile mismatch"
        )
    return version


def render_variant(value: dict[str, Any]) -> dict[str, Any]:
    """Render one admitted DTO or return a stable refusal response."""
    if type(value) is not dict:
        raise TypeError("captured logical render input must be an exact dict")
    profile_version()
    try:
        result = _core.render_logical_variant(value)
    except AttributeError:
        raise CatalogLogicalRenderUnavailable(
            "Rust catalog logical-render capability unavailable"
        ) from None
    if type(result) is not dict or result.get("profile") != _PROFILE:
        raise RuntimeError("Rust catalog logical-render returned an invalid response")
    if result.get("outcome") == "rendered":
        if (
            set(result) != {"profile", "outcome", "logicalRequest"}
            or type(result["logicalRequest"]) is not str
        ):
            raise RuntimeError("Rust catalog logical-render returned an invalid result")
    elif result.get("outcome") == "refused":
        if (
            set(result) != {"profile", "outcome", "code", "message"}
            or type(result["code"]) is not str
            or type(result["message"]) is not str
        ):
            raise RuntimeError("Rust catalog logical-render returned an invalid refusal")
    else:
        raise RuntimeError("Rust catalog logical-render returned an invalid outcome")
    return result


_GRAPH_PROFILE = "umf-access-captured-graph-validation/0.1.0"


def _validate_graph_variant(value: object) -> None:
    """Opt-in validator for the narrow captured-DTO graph profile."""
    if type(value) is not dict:
        raise TypeError("captured graph input must be an exact dict")
    try:
        from umf import _rust
        result = _rust._rust_core.access_validate_captured_graph_variant(value)
    except (AttributeError, ImportError):
        raise CatalogLogicalRenderUnavailable(
            "Rust captured graph validation capability unavailable"
        ) from None
    if type(result) is not dict or result.get("profile") != _GRAPH_PROFILE:
        raise RuntimeError("Rust captured graph validator returned an invalid response")
    if result.get("outcome") == "accepted" and set(result) == {"profile", "outcome"}:
        return
    if (
        result.get("outcome") == "refused"
        and set(result) == {"profile", "outcome", "kind", "code", "rule"}
        and all(type(result[key]) is str for key in ("kind", "code", "rule"))
    ):
        if result["kind"] == "capture-error":
            from umf_access.capture import CaptureError
            raise CaptureError(result["code"], result["rule"])
        raise RuntimeError("Rust captured graph validator returned an unsupported refusal")
    raise RuntimeError("Rust captured graph validator returned an invalid outcome")


def capture_with_rust_graph_validator(function: object) -> object:
    """Private opt-in capture route; public ``capture`` stays Python-selected."""
    from umf_access.capture import CapturedVariant, _capture_with_validator

    def validate(node: object, parameters: tuple[object, ...], presence: frozenset[str]) -> None:
        budget = _EncodingBudget()
        ordered_presence = tuple(
            parameter.name for parameter in parameters if parameter.name in presence
        )
        dto = _encode_capture(CapturedVariant(ordered_presence, node, parameters), budget)
        budget.charge_output(dto)
        _validate_graph_variant(dto)

    return _capture_with_validator(function, validate)


class _EncodingBudget:
    def __init__(self) -> None:
        self.nodes = 0
        self.utf8_bytes = 0
        self.output_bytes = 0

    def charge(self, value: object, depth: int) -> None:
        self.nodes += 1
        if self.nodes > _MAX_CAPTURE_NODES or depth > _MAX_CAPTURE_DEPTH:
            raise ValueError("captured declaration exceeds Rust bridge resource limits")
        if type(value) is str:
            remaining = _MAX_CAPTURE_UTF8_BYTES - self.utf8_bytes
            if len(value) > remaining:
                raise ValueError("captured declaration exceeds Rust bridge resource limits")
            encoded_bytes = len(value.encode("utf-8", errors="strict"))
            if encoded_bytes > remaining:
                raise ValueError("captured declaration exceeds Rust bridge resource limits")
            self.utf8_bytes += encoded_bytes

    def charge_output(self, value: object) -> None:
        measured = 0
        encoder = json.JSONEncoder(
            ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":")
        )
        for chunk in encoder.iterencode(value):
            remaining = _MAX_CAPTURE_UTF8_BYTES - self.output_bytes - measured
            if len(chunk) > remaining:
                raise ValueError("captured declaration exceeds Rust bridge resource limits")
            encoded_bytes = len(chunk.encode("utf-8", errors="strict"))
            if encoded_bytes > remaining:
                raise ValueError("captured declaration exceeds Rust bridge resource limits")
            measured += encoded_bytes
        self.output_bytes += measured

    def preflight_output(self, minimum_chars: int) -> None:
        if minimum_chars > _MAX_CAPTURE_UTF8_BYTES - self.output_bytes:
            raise ValueError("captured declaration exceeds Rust bridge resource limits")


def _encode_capture(value: object, budget: _EncodingBudget, depth: int = 0) -> object:
    """Encode the frozen capture DTO tags without coercing unknown values."""
    from umf_access.types import MISSING

    budget.charge(value, depth)

    def encode(item: object) -> object:
        return _encode_capture(item, budget, depth + 1)

    if value is MISSING:
        return {"$sentinel": "umf_access.types.MISSING"}
    if isinstance(value, Enum):
        return {"$enum": f"{type(value).__module__}.{type(value).__qualname__}", "value": encode(value.value)}
    if value is None or type(value) in (str, bool, int):
        return value
    if type(value) is float:
        if not math.isfinite(value):
            raise TypeError("non-finite float has no captured DTO representation")
        return value
    if isinstance(value, bytes):
        budget.preflight_output(len(value) * 2)
        return {"$bytesHex": value.hex()}
    if isinstance(value, Decimal):
        budget.preflight_output(len(value.as_tuple().digits))
        return {"$decimal": str(value)}
    if is_dataclass(value) and not isinstance(value, type):
        return {
            "$type": f"{type(value).__module__}.{type(value).__qualname__}",
            "fields": {field.name: encode(getattr(value, field.name)) for field in fields(value)},
        }
    if isinstance(value, type):
        return {"$typeRef": f"{value.__module__}.{value.__qualname__}"}
    origin = get_origin(value)
    if origin is not None:
        origin_name = getattr(origin, "__module__", "builtins") + "." + getattr(origin, "__qualname__", repr(origin))
        return {"$typing": origin_name, "args": [encode(arg) for arg in get_args(value)]}
    if isinstance(value, tuple):
        return {"$tuple": [encode(item) for item in value]}
    if isinstance(value, list):
        return {"$list": [encode(item) for item in value]}
    if isinstance(value, frozenset):
        encoded = [encode(item) for item in value]
        return {
            "$frozenset": sorted(
                encoded,
                key=lambda item: json.dumps(
                    item,
                    ensure_ascii=False,
                    allow_nan=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ),
            )
        }
    raise TypeError(f"no captured DTO representation for {type(value).__module__}.{type(value).__qualname__}")


def render_declaration(declaration: object) -> dict[str, Any]:
    """Capture one explicit declaration in Python and render its variants in Rust.

    This is an opt-in bridge only. It does not change catalog compilation or
    make Rust responsible for Python imports, annotations, model identity, or
    Weft compilation.
    """
    from umf_access.capture import CaptureError, capture

    try:
        captured = capture(declaration)
    except CaptureError as error:
        return {
            "profile": _PROFILE,
            "outcome": "refused",
            "stage": "capture",
            "code": error.code,
            "message": str(error),
        }

    variants: list[dict[str, Any]] = []
    budget = _EncodingBudget()
    for index, variant in enumerate(captured.variants):
        try:
            dto = _encode_capture(variant, budget)
            budget.charge_output(dto)
        except (TypeError, ValueError, UnicodeError) as error:
            variants.append({
                "index": index,
                "presence": list(variant.presence),
                "outcome": "refused",
                "stage": "encoding",
                "code": "CAPTURE_DTO_UNENCODABLE",
                "message": str(error),
            })
            continue
        rendered = render_variant({"profile": _PROFILE, "variant": dto})
        variants.append({"index": index, "presence": list(variant.presence), **rendered, "stage": "render"})
    return {
        "profile": _PROFILE,
        "outcome": "captured",
        "declaration": captured.name,
        "variants": variants,
    }

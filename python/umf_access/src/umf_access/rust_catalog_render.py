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
        if (
            result["kind"] == "type-error"
            and result["code"] == ""
            and result["rule"] == "expression column belongs to another Record"
        ):
            raise TypeError(result["rule"])
        raise RuntimeError("Rust captured graph validator returned an unsupported refusal")
    raise RuntimeError("Rust captured graph validator returned an invalid outcome")


def capture_with_rust_graph_validator(function: object) -> object:
    """Private opt-in capture route; public ``capture`` stays Python-selected."""
    from umf import _rust

    from umf_access.capture import (
        CapturedDeclaration,
        CapturedVariant,
        CaptureError,
        _canonical,
        _invoke,
        _parameters,
    )

    def validate(
        node: object, parameters: tuple[object, ...], presence: frozenset[str]
    ) -> None:
        budget = _EncodingBudget()
        ordered_presence = tuple(
            parameter.name for parameter in parameters if parameter.name in presence
        )
        dto = _encode_capture(CapturedVariant(ordered_presence, node, parameters), budget)
        budget.charge_output(dto)
        _validate_graph_variant(dto)

    kind = getattr(function, "__umf_kind__", None)
    if kind not in ("query", "command"):
        raise CaptureError(
            "CAPTURE_UNSUPPORTED", "explicit query/command decorator required"
        )
    parameters = _parameters(function)
    optional = tuple(parameter.name for parameter in parameters if parameter.optional)

    def pair(
        presence: frozenset[str],
        expected_used: tuple[str, ...] | None,
        stage: str,
    ):
        first = _invoke(function, parameters, presence, validate)
        second = _invoke(function, parameters, presence, validate)
        first_bytes = json.dumps(
            _canonical(first),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        )
        second_bytes = json.dumps(
            _canonical(second),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        )
        pairs = []
        for (node, used), canonical_bytes in zip(
            (first, second), (first_bytes, second_bytes)
        ):
            used_names = [
                parameter.name
                for parameter in parameters
                if parameter.name in used
            ]
            pairs.append(
                {
                    "canonical": canonical_bytes,
                    "usedOptional": used_names,
                    "terminalOp": node.op,
                }
            )
        request = {
            "profile": "umf-access-capture-orchestration/0.1.0",
            "stage": stage,
            "kind": kind,
            "parameters": [
                {"name": parameter.name, "optional": parameter.optional}
                for parameter in parameters
            ],
            "presence": [
                parameter.name
                for parameter in parameters
                if parameter.name in presence
            ],
            "expectedUsed": (
                None if expected_used is None else list(expected_used)
            ),
            "pairs": pairs,
        }
        try:
            result = _rust._rust_core.access_orchestrate_capture_pair(request)
        except AttributeError:
            raise CatalogLogicalRenderUnavailable(
                "Rust capture orchestration capability unavailable"
            ) from None
        if (
            type(result) is not dict
            or result.get("profile") != "umf-access-capture-orchestration/0.1.0"
        ):
            raise RuntimeError("Rust capture orchestrator returned an invalid response")
        if (
            result.get("outcome") == "refused"
            and set(result) == {"profile", "outcome", "kind", "code", "rule"}
            and all(type(result[key]) is str for key in ("kind", "code", "rule"))
        ):
            raise CaptureError(result["code"], result["rule"])
        if stage == "discover":
            if (
                set(result) != {"profile", "outcome", "presences"}
                or result.get("outcome") != "scheduled"
            ):
                raise RuntimeError("Rust capture orchestrator returned an invalid schedule")
            presences = result["presences"]
            if type(presences) is not list or len(presences) > 16:
                raise RuntimeError("Rust capture orchestrator returned an invalid schedule")
            optional_names = set(optional)
            for selected in presences:
                if (
                    type(selected) is not list
                    or any(
                        type(name) is not str or name not in optional_names
                        for name in selected
                    )
                    or len(selected) != len(set(selected))
                    or selected != [name for name in optional if name in selected]
                ):
                    raise RuntimeError("Rust capture orchestrator returned an invalid schedule")
            return first[0], first[1], presences
        if (
            set(result) != {"profile", "outcome", "presences"}
            or result.get("outcome") != "accepted"
            or result.get("presences") != []
        ):
            raise RuntimeError("Rust capture orchestrator returned an invalid acceptance")
        return first[0], first[1], None

    _, used, presences = pair(frozenset(optional), None, "discover")
    variants = []
    used_names = tuple(parameter.name for parameter in parameters if parameter.name in used)
    for selected in presences:
        if type(selected) is not list or any(type(name) is not str for name in selected):
            raise RuntimeError("Rust capture orchestrator returned an invalid presence variant")
        node, _variant_used, _ = pair(frozenset(selected), used_names, "variant")
        variants.append(CapturedVariant(tuple(selected), node, parameters))
    action = None
    if kind == "command":
        from umf_access.types import ActionRef

        reference = getattr(function, "__umf_action__", None)
        if not isinstance(reference, ActionRef):
            raise CaptureError(
                "CAPTURE_UNSUPPORTED", "command requires generated action identity"
            )
        action = reference.source
    return CapturedDeclaration(function.__name__, kind, parameters, tuple(variants), action)


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
    if value is Ellipsis:
        return {"$ellipsis": True}
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

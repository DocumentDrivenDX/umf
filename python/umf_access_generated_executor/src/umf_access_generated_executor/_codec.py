"""Interpreter for Weft-issued, closed query input codec instructions."""

from __future__ import annotations

import math
import re
import struct
from collections.abc import Mapping
from dataclasses import dataclass
from typing import cast

from umf_access_generated_executor._canonical import _scalar_text
from umf_access_generated_executor._errors import GeneratedExecutionError

MAX_TOKEN_BYTES = 4_000_000
MAX_WIDTH_BITS = 9_007_199_254_740_991
_MAX_WIDTH_COMPARISON_BITS = 13_287_714
_INTEGER = re.compile(r"-?(?:0|[1-9][0-9]*)\Z")
_FLOAT = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\Z")


@dataclass(frozen=True, slots=True)
class _Identity:
    kind: str
    value: object
    native: object | None = None


def execute_codec(
    codec: object, value: object, *, carrier: str, nullable: bool
) -> object:
    instructions = _validate_codec(codec, carrier=carrier, nullable=nullable)
    wrapper, parser, refinements, normalize = instructions
    parsed = _parse(wrapper, parser, value)
    if parsed is None:
        return None
    _refine(refinements, parsed)
    return _normalize(normalize, parsed, parser)


def _validate_codec(
    codec: object, *, carrier: str, nullable: bool
) -> tuple[dict[str, object], ...]:
    if not isinstance(codec, dict) or set(codec) != {"profile", "steps"}:
        raise ValueError("codec shape")
    if codec["profile"] != "weft.query-codec-instructions/1":
        raise ValueError("codec profile")
    steps = codec["steps"]
    if (
        type(steps) is not list
        or len(steps) != 4
        or any(type(step) is not dict for step in steps)
    ):
        raise ValueError("codec step sequence")
    wrapper, parser, refinements, normalize = steps
    _exact(wrapper, {"op", "wrapper", "nullable"}, "require-exact-wrapper")
    _exact(
        parser,
        {"op", "carrier", "profile", "scale", "precision", "maxTokenBytes"},
        "parse-carrier",
    )
    _exact(
        refinements,
        {"op", "carrier", "length", "integerWidth", "range", "allowedIdentities"},
        "check-refinements",
    )
    _exact(normalize, {"op", "carrier", "mode"}, "normalize-native-query-value")

    wrappers = {
        "boolean": "boolean",
        "string": "string",
        "float": "floatToken",
        "integer": "integerToken",
        "decimal": "decimalToken",
    }
    profiles = {
        "boolean": "weft.boolean/1",
        "string": "weft.string/1",
        "float": "weft.finite-ascii-f64-token/1",
        "integer": "weft.exact-coefficient/1",
        "decimal": "weft.exact-coefficient/1",
    }
    modes = {
        "boolean": "identity",
        "string": "identity",
        "float": "preserve-float-token",
        "integer": "canonical-integer-decimal",
        "decimal": "canonical-scaled-decimal",
    }
    for instruction in (parser, refinements, normalize):
        if instruction.get("carrier") != carrier:
            raise ValueError("codec carrier mismatch")
    if carrier not in wrappers:
        raise ValueError("unsupported codec carrier")
    if wrapper["wrapper"] != wrappers[carrier] or type(wrapper["nullable"]) is not bool:
        raise ValueError("input wrapper mismatch")
    if wrapper["nullable"] is not nullable:
        raise ValueError("nullability mismatch")
    if parser["profile"] != profiles[carrier]:
        raise ValueError("carrier profile mismatch")
    if normalize["mode"] != modes[carrier]:
        raise ValueError("normalization mode mismatch")

    scale, precision, token_limit = (
        parser["scale"],
        parser["precision"],
        parser["maxTokenBytes"],
    )
    if carrier in {"boolean", "string"}:
        if (scale, precision, token_limit) != (None, None, None):
            raise ValueError("primitive carrier operands")
    elif carrier == "float":
        if (scale, precision, token_limit) != (None, None, 128):
            raise ValueError("float carrier operands")
    elif carrier == "integer":
        if (scale, precision, token_limit) != (0, None, MAX_TOKEN_BYTES):
            raise ValueError("integer carrier operands")
    elif (
        type(scale) is not int
        or scale < 0
        or type(precision) is not int
        or precision < 1
        or scale > precision
        or token_limit != MAX_TOKEN_BYTES
    ):
        raise ValueError("decimal carrier operands")
    _validate_refinement_operands(refinements, carrier)
    return wrapper, parser, refinements, normalize


def _exact(value: dict[str, object], keys: set[str], opcode: str) -> None:
    if set(value) != keys or value.get("op") != opcode:
        raise ValueError("codec opcode shape")


def _validate_refinement_operands(instruction: dict[str, object], carrier: str) -> None:
    length, width, numeric_range, allowed = (
        instruction["length"],
        instruction["integerWidth"],
        instruction["range"],
        instruction["allowedIdentities"],
    )
    allowed_by_carrier = {
        "boolean": {"boolean"},
        "string": {"string"},
        "float": {"float64Bits"},
        "integer": {"numberCoefficient"},
        "decimal": {"numberCoefficient"},
    }
    if carrier != "string" and length is not None:
        raise ValueError("length refinement on non-string")
    if carrier not in {"integer", "decimal"} and width is not None:
        raise ValueError("integer width on non-integer")
    if carrier not in {"integer", "decimal"} and numeric_range is not None:
        raise ValueError("numeric range on non-numeric carrier")
    if allowed is not None:
        if type(allowed) is not list:
            raise ValueError("allowed identity list")
        seen: set[tuple[str, object]] = set()
        for identity in allowed:
            if type(identity) is not dict or set(identity) != {"kind", "value"}:
                raise ValueError("allowed identity shape")
            kind, item = identity["kind"], identity["value"]
            if kind not in allowed_by_carrier[carrier]:
                raise ValueError("allowed identity carrier")
            if kind == "boolean" and type(item) is not bool:
                raise ValueError("boolean allowed identity")
            if kind == "string" and type(item) is str:
                _scalar_text(item)
            elif kind == "string":
                raise ValueError("string allowed identity")
            if kind == "numberCoefficient" and (
                type(item) is not str
                or _INTEGER.fullmatch(item) is None
                or item == "-0"
            ):
                raise ValueError("numeric allowed identity")
            if kind == "float64Bits" and (
                type(item) is not str or re.fullmatch("[0-9a-f]{16}", item) is None
            ):
                raise ValueError("float allowed identity")
            identity_key = (kind, item)
            if identity_key in seen:
                raise ValueError("duplicate allowed identity")
            seen.add(identity_key)
    if length is not None:
        if type(length) is not dict or set(length) - {"unit", "min", "max"}:
            raise ValueError("length refinement shape")
        if length.get("unit") != "unicode-scalar":
            raise ValueError("length unit unsupported")
        _bounds(length, "length")
    if width is not None:
        if type(width) is not dict or set(width) != {"bits", "signed"}:
            raise ValueError("integer width shape")
        if type(width["bits"]) is not int or not 1 <= width["bits"] <= MAX_WIDTH_BITS:
            raise ValueError("integer width limit")
        if type(width["signed"]) is not bool:
            raise ValueError("integer signedness")
    if numeric_range is not None:
        if type(numeric_range) is not dict or set(numeric_range) != {
            "minCoefficient",
            "minInclusive",
            "maxCoefficient",
            "maxInclusive",
        }:
            raise ValueError("numeric range shape")
        for key in ("minCoefficient", "maxCoefficient"):
            item = numeric_range[key]
            if item is not None and (
                type(item) is not str or _INTEGER.fullmatch(item) is None
            ):
                raise ValueError("numeric range coefficient")
        for key in ("minInclusive", "maxInclusive"):
            if type(numeric_range[key]) is not bool:
                raise ValueError("numeric range inclusivity")
        minimum, maximum = (
            numeric_range["minCoefficient"],
            numeric_range["maxCoefficient"],
        )
        if minimum is None and numeric_range["minInclusive"] is not True:
            raise ValueError("missing minimum must use the canonical inclusive marker")
        if maximum is None and numeric_range["maxInclusive"] is not True:
            raise ValueError("missing maximum must use the canonical inclusive marker")
        if minimum is not None and maximum is not None:
            order = _compare_coefficients(minimum, maximum)
            if order > 0 or (
                order == 0
                and not (
                    numeric_range["minInclusive"] and numeric_range["maxInclusive"]
                )
            ):
                raise ValueError("numeric range is empty")


def _bounds(value: dict[str, object], name: str) -> None:
    minimum, maximum = value.get("min"), value.get("max")
    if minimum is not None and (type(minimum) is not int or minimum < 0):
        raise ValueError(name + " minimum")
    if maximum is not None and (type(maximum) is not int or maximum < 0):
        raise ValueError(name + " maximum")
    if minimum is not None and maximum is not None and minimum > maximum:
        raise ValueError(name + " bounds")


def _parse(
    wrapper: dict[str, object], parser: dict[str, object], value: object
) -> _Identity | None:
    if value is None:
        if wrapper["nullable"]:
            return None
        raise ValueError("null is not admitted")
    key = wrapper["wrapper"]
    if not isinstance(value, Mapping) or set(value) != {key}:
        raise ValueError("input wrapper differs")
    raw = value[key]
    carrier = cast(str, parser["carrier"])
    if carrier == "boolean" and type(raw) is bool:
        return _Identity("boolean", raw)
    if carrier == "string" and type(raw) is str:
        _scalar_text(raw)
        return _Identity("string", raw)
    if carrier in {"float", "integer", "decimal"}:
        if type(raw) is not str:
            raise ValueError("numeric token must be text")
        limit = cast(int, parser["maxTokenBytes"])
        if len(raw.encode("utf-8")) > limit:
            raise ValueError("numeric token capacity")
        if carrier == "float":
            if _FLOAT.fullmatch(raw) is None:
                raise ValueError("float token syntax")
            number = float(raw)
            if not math.isfinite(number):
                raise ValueError("float token is non-finite")
            bits = (
                "0000000000000000" if number == 0 else struct.pack(">d", number).hex()
            )
            return _Identity("float64Bits", bits, raw)
        scale = cast(int, parser["scale"])
        precision = cast(int | None, parser["precision"])
        coefficient = _coefficient(raw, scale, precision)
        return _Identity("numberCoefficient", coefficient)
    raise ValueError("unsupported input carrier")


def _coefficient(token: str, scale: int, precision: int | None) -> str:
    if len(token) > MAX_TOKEN_BYTES:
        raise ValueError("coefficient token capacity")
    negative, body = (
        token.startswith("-"),
        token.removeprefix("-"),
    )
    at = next((index for index, char in enumerate(body) if char in "eE"), None)
    mantissa, exponent_text = (
        (body[:at], body[at + 1 :]) if at is not None else (body, "0")
    )
    if "." in mantissa:
        whole, fraction = mantissa.split(".", 1)
        if not fraction or not fraction.isascii() or not fraction.isdigit():
            raise ValueError("coefficient fraction syntax")
    else:
        whole, fraction = mantissa, ""
    if (
        not whole
        or not whole.isascii()
        or not whole.isdigit()
        or (len(whole) > 1 and whole.startswith("0"))
    ):
        raise ValueError("coefficient integer syntax")
    exponent_digits = exponent_text.lstrip("+-")
    if (
        not exponent_digits
        or not exponent_digits.isascii()
        or not exponent_digits.isdigit()
    ):
        raise ValueError("coefficient exponent syntax")
    digits = (whole + fraction).lstrip("0")
    if not digits:
        return "0"
    if len(exponent_text) > 32:
        raise ValueError("coefficient exponent syntax")
    exponent = int(exponent_text)
    shift = exponent - len(fraction) + scale
    if shift < 0:
        cut = -shift
        if cut > len(digits) or any(character != "0" for character in digits[-cut:]):
            raise ValueError("coefficient is not exactly representable")
        digits = digits[:-cut]
    else:
        bound = min(
            precision if precision is not None else MAX_TOKEN_BYTES, MAX_TOKEN_BYTES
        )
        if len(digits) + shift > bound:
            raise ValueError("coefficient expansion limit")
        digits += "0" * shift
    if precision is not None and len(digits) > precision:
        raise ValueError("coefficient precision limit")
    if not digits:
        return "0"
    return ("-" if negative else "") + digits


def _refine(instruction: dict[str, object], identity: _Identity) -> None:
    length = cast(dict[str, object] | None, instruction["length"])
    if length is not None:
        size = len(identity.value)  # type: ignore[arg-type]
        minimum = cast(int | None, length.get("min"))
        maximum = cast(int | None, length.get("max"))
        if minimum is not None and size < minimum:
            raise ValueError("string shorter than minimum")
        if maximum is not None and size > maximum:
            raise ValueError("string longer than maximum")
    width = cast(dict[str, object] | None, instruction["integerWidth"])
    if width is not None and not _fits_width(identity.value, width):  # type: ignore[arg-type]
        raise ValueError("integer width")
    numeric_range = cast(dict[str, object] | None, instruction["range"])
    if numeric_range is not None:
        for prefix, lower in (("min", True), ("max", False)):
            bound = cast(str | None, numeric_range[prefix + "Coefficient"])
            if bound is None:
                continue
            comparison = _compare_coefficients(identity.value, bound)  # type: ignore[arg-type]
            inclusive = cast(bool, numeric_range[prefix + "Inclusive"])
            if (lower and (comparison < 0 or (comparison == 0 and not inclusive))) or (
                not lower and (comparison > 0 or (comparison == 0 and not inclusive))
            ):
                raise ValueError("numeric range")
    allowed = cast(list[dict[str, object]] | None, instruction["allowedIdentities"])
    if allowed is not None:
        wanted = (identity.kind, identity.value)
        if not any((entry["kind"], entry["value"]) == wanted for entry in allowed):
            raise ValueError("value outside allowed identities")


def _compare_coefficients(left: str, right: str) -> int:
    left_negative, right_negative = left.startswith("-"), right.startswith("-")
    left_digits, right_digits = (
        left.lstrip("-").lstrip("0") or "0",
        right.lstrip("-").lstrip("0") or "0",
    )
    if left_negative != right_negative:
        return -1 if left_negative else 1
    magnitude = (len(left_digits) > len(right_digits)) - (
        len(left_digits) < len(right_digits)
    )
    if magnitude == 0:
        magnitude = (left_digits > right_digits) - (left_digits < right_digits)
    return -magnitude if left_negative else magnitude


def _fits_width(coefficient: str, width: dict[str, object]) -> bool:
    bits = cast(int, width["bits"])
    signed = cast(bool, width["signed"])
    if bits > _MAX_WIDTH_COMPARISON_BITS:
        return True
    lower = _decimal_integer(-(1 << (bits - 1))) if signed else "0"
    upper = _decimal_integer((1 << (bits - (1 if signed else 0))) - 1)
    return (
        _compare_coefficients(lower, coefficient) <= 0
        and _compare_coefficients(coefficient, upper) <= 0
    )


def _decimal_integer(value: int) -> str:
    """Convert a bounded VM integer without Python's global digit limit."""
    if value == 0:
        return "0"
    negative = value < 0
    remaining = -value if negative else value
    chunks: list[int] = []
    while remaining:
        remaining, chunk = divmod(remaining, 1_000_000_000)
        chunks.append(chunk)
    digits = str(chunks.pop()) + "".join(f"{chunk:09d}" for chunk in reversed(chunks))
    return ("-" if negative else "") + digits


def _normalize(
    instruction: dict[str, object], identity: _Identity, parser: dict[str, object]
) -> object:
    mode = cast(str, instruction["mode"])
    if mode == "identity":
        return identity.value
    if mode == "preserve-float-token":
        return identity.native
    if mode == "canonical-integer-decimal":
        return identity.value
    if mode == "canonical-scaled-decimal":
        coefficient = cast(str, identity.value)
        if coefficient == "0":
            return "0"
        negative = coefficient.startswith("-")
        digits = coefficient[1:] if negative else coefficient
        stripped = digits.rstrip("0")
        zeros = len(digits) - len(stripped)
        exponent = zeros - cast(int, parser["scale"])
        normalized = ("-" if negative else "") + stripped
        return normalized if exponent == 0 else normalized + "e" + str(exponent)
    raise ValueError("unsupported normalization")


def run_issued_codec(
    codec: object, value: object, *, carrier: str, nullable: bool
) -> object:
    try:
        return execute_codec(codec, value, carrier=carrier, nullable=nullable)
    except (KeyError, TypeError, ValueError, OverflowError):
        raise GeneratedExecutionError("INVALID") from None


def run_issued_result_codec(
    codec: object,
    value: object,
    *,
    carrier: str,
    nullable: bool,
    native_type: Mapping[str, object],
    oid: int,
) -> object:
    """Validate one tagged output through its issuer-selected closed codec."""
    if not isinstance(codec, Mapping):
        raise GeneratedExecutionError("ARTIFACT_REFUSED")
    profile = codec.get("profile")
    if profile == "weft.query-codec-instructions/1":
        if carrier not in {"boolean", "string", "integer", "decimal", "float"}:
            raise GeneratedExecutionError("ARTIFACT_REFUSED")
        decoded = run_issued_codec(codec, value, carrier=carrier, nullable=nullable)
        from umf_access_generated_executor._result_values import fits_native_type

        if not fits_native_type(decoded, native_type):
            raise GeneratedExecutionError("INVALID")
        return decoded
    _validate_issued_result_codec(codec, carrier, nullable, native_type, oid)
    return _decode_native_result_value(value, carrier, nullable, native_type)


def _validate_issued_result_codec(
    codec: object, carrier: str, nullable: bool, native_type: Mapping[str, object], oid: int
) -> Mapping[str, object]:
    if not isinstance(codec, Mapping):
        raise GeneratedExecutionError("ARTIFACT_REFUSED")
    decoder_profiles = {
        ("uuid", "uuid", 2950): "weft.postgresql18.uuid/1",
        ("bits128", "bytea", 17): "weft.postgresql18.bits128/1",
        ("date", "date", 1082): "weft.postgresql18.date/1",
        ("timestamp", "timestamptz", 1184): "weft.postgresql18.timestamp/1",
    }
    kind = native_type.get("kind")
    expected_decoder = decoder_profiles.get((carrier, cast(str, kind), oid))
    if expected_decoder is None or set(codec) != {
        "profile", "carrier", "nullable", "nativeType", "oid", "decoder", "refinements"
    }:
        raise GeneratedExecutionError("ARTIFACT_REFUSED")
    decoder, refinements = codec.get("decoder"), codec.get("refinements")
    if (
        codec.get("profile") != "weft.query-result-codec/1"
        or codec.get("carrier") != carrier
        or codec.get("nullable") is not nullable
        or codec.get("nativeType") != dict(native_type)
        or codec.get("oid") != oid
        or not isinstance(decoder, Mapping)
        or set(decoder) != {"op", "profile"}
        or decoder.get("op") != "decode-native-result"
        or decoder.get("profile") != expected_decoder
        or not isinstance(refinements, Mapping)
        or set(refinements) != {"profile", "facets", "allowedValues"}
        or refinements.get("profile") != "weft.query-result-refinements/1"
        or refinements.get("facets") != {}
        or refinements.get("allowedValues") != []
    ):
        raise GeneratedExecutionError("ARTIFACT_REFUSED")
    return codec


def _validate_output_codec(
    codec: object, *, carrier: str, nullable: bool, native_type: Mapping[str, object], oid: int
) -> None:
    if isinstance(codec, Mapping) and codec.get("profile") == "weft.query-codec-instructions/1":
        if carrier not in {"boolean", "string", "integer", "decimal", "float"}:
            raise ValueError("input codec profile cannot represent this output carrier")
        _validate_codec(codec, carrier=carrier, nullable=nullable)
        return
    _validate_issued_result_codec(codec, carrier, nullable, native_type, oid)


def _decode_native_result_value(
    value: object, carrier: str, nullable: bool, native_type: Mapping[str, object]
) -> object:
    from umf_access_generated_executor._result_values import decode_result_literal, fits_native_type

    decoded = decode_result_literal(value, {"carrier": carrier, "nullable": nullable})
    if not fits_native_type(decoded, native_type):
        raise GeneratedExecutionError("INVALID")
    return decoded

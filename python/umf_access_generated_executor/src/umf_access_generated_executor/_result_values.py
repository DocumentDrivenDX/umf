"""Shared pure typed-result validation for compiler-free generated reads."""
from __future__ import annotations

import math
import re
import struct
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from collections.abc import Mapping
from typing import cast
from uuid import UUID

from umf_access_generated_executor._errors import GeneratedExecutionError

_WRAPPERS = {"boolean": "boolean", "string": "string", "integer": "integerToken", "decimal": "decimalToken", "float": "floatToken", "date": "date", "timestamp": "timestamp", "uuid": "uuid", "bits128": "bits128Hex"}
_INT_TOKEN = re.compile(r"-?(?:0|[1-9][0-9]*)\Z")
_DECIMAL_TOKEN = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\Z")
_FLOAT_TOKEN = re.compile(r"[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?)|(?:\.[0-9]+))(?:[eE][+-]?[0-9]+)?\Z")
_UTC_TIMESTAMP = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z\Z")


def decode_result_literal(value: object, output: Mapping[str, object]) -> object:
    """Decode one closed SDK tagged scalar without depending on UMF runtime."""
    if value is None:
        if output.get("nullable") is True:
            return None
        raise GeneratedExecutionError("INVALID")
    carrier = output.get("carrier")
    wrapper = _WRAPPERS.get(cast(str, carrier)) if type(carrier) is str else None
    if wrapper is None or type(value) is not dict or set(value) != {wrapper}:
        raise GeneratedExecutionError("INVALID")
    scalar = value[wrapper]
    if carrier == "boolean" and type(scalar) is bool:
        return scalar
    if carrier == "string" and type(scalar) is str:
        return scalar
    if carrier == "integer" and type(scalar) is str and _INT_TOKEN.fullmatch(scalar):
        return int(scalar)
    if carrier == "decimal" and type(scalar) is str and _DECIMAL_TOKEN.fullmatch(scalar):
        try:
            parsed = Decimal(scalar)
            if parsed.is_finite():
                return parsed
        except InvalidOperation:
            pass
    if carrier == "float" and type(scalar) is str and _FLOAT_TOKEN.fullmatch(scalar):
        try:
            parsed = float(scalar)
            if math.isfinite(parsed):
                return parsed
        except ValueError:
            pass
    if carrier == "date" and type(scalar) is str:
        try:
            parsed_date = date.fromisoformat(scalar)
            if parsed_date.isoformat() == scalar:
                return parsed_date
        except ValueError:
            pass
    if carrier == "timestamp" and type(scalar) is str and _UTC_TIMESTAMP.fullmatch(scalar):
        try:
            return datetime.fromisoformat(scalar)
        except ValueError:
            pass
    if carrier == "uuid" and type(scalar) is str:
        try:
            parsed_uuid = UUID(scalar)
            if str(parsed_uuid) == scalar:
                return parsed_uuid
        except ValueError:
            pass
    if carrier == "bits128" and type(scalar) is str and re.fullmatch(r"[0-9a-f]{32}", scalar):
        return bytes.fromhex(scalar)
    raise GeneratedExecutionError("INVALID")


def fits_native_type(value: object, native_type: Mapping[str, object]) -> bool:
    """Apply physical native bounds after tagged scalar decoding."""
    if value is None:
        return True
    kind = native_type.get("kind")
    if kind == "int2":
        return type(value) is int and -(2**15) <= value < 2**15
    if kind == "int4":
        return type(value) is int and -(2**31) <= value < 2**31
    if kind == "int8":
        return type(value) is int and -(2**63) <= value < 2**63
    if kind in {"varchar", "char"}:
        length = native_type.get("length")
        return type(value) is str and type(length) is int and len(value) <= length
    if kind == "numeric" and isinstance(value, Decimal):
        precision, scale = native_type.get("precision"), native_type.get("scale")
        if type(precision) is int and type(scale) is int:
            if value.as_tuple().exponent != -scale:
                return False
            integer_limit = precision - scale
            return value.is_zero() or value.copy_abs().adjusted() < integer_limit
        return value.is_finite()
    if kind == "float4" and type(value) is float:
        try:
            return math.isfinite(struct.unpack("!f", struct.pack("!f", value))[0])
        except (OverflowError, struct.error):
            return False
    if kind == "float8":
        return type(value) is float and math.isfinite(value)
    if kind == "bytea":
        return type(value) is bytes
    return True

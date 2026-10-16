"""Strict Python carriers and explicit, resolved constraint helpers.

No native transport is guessed here. temporal_token implements only the selected
CONTRACT-075 oracle serialization, not a backend or permissive token parser.
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from math import isfinite
from struct import pack, unpack
from typing import Literal, TypeVar, cast

from .types import ValueRuleError, Vector

T = TypeVar("T")
N = TypeVar("N", int, Decimal)


def validate_boolean(value: object) -> bool:
    if type(value) is not bool:
        raise ValueRuleError("boolean carrier required")
    return value


def validate_integer(
    value: object, *, bits: int | None = None, signed: bool = True
) -> int:
    if type(value) is not int:
        raise ValueRuleError("integer carrier required; boolean excluded")
    if (
        type(signed) is not bool
        or bits is not None
        and (type(bits) is not int or bits < 1)
    ):
        raise ValueRuleError("invalid authored integer width")
    if bits is not None:
        magnitude = abs(value)
        width = magnitude.bit_length()
        fits = (
            (
                width < bits
                or value < 0
                and width == bits
                and magnitude & (magnitude - 1) == 0
            )
            if signed
            else value >= 0 and width <= bits
        )
        if not fits:
            raise ValueRuleError("integer outside authored width")
    return value


def validate_decimal(
    value: object, *, precision: int | None = None, scale: int | None = None
) -> Decimal:
    if not isinstance(value, Decimal) or not value.is_finite():
        raise ValueRuleError("finite Decimal carrier required")
    if (
        (precision is not None and (type(precision) is not int or precision < 1))
        or (scale is not None and (type(scale) is not int or scale < 0))
        or (precision is not None and scale is not None and scale > precision)
    ):
        raise ValueRuleError("invalid authored decimal precision or scale")
    _, digits, exponent = value.as_tuple()
    # is_finite above makes the exponent an int. Never expand huge exponents.
    assert isinstance(exponent, int)
    if not any(digits):
        return value
    if scale is not None:
        shift = exponent + scale
        length = len(digits) + shift
        if shift < 0:
            cut = -shift
            if cut > len(digits) or any(digits[len(digits) - cut :]):
                raise ValueRuleError("decimal requires rounding at authored scale")
        if precision is not None and length > precision:
            raise ValueRuleError("decimal outside authored precision")
    elif precision is not None:
        # No target scale is invented. Count significant coefficient digits.
        if len(digits) > precision:
            raise ValueRuleError("decimal outside authored precision")
    return value


def validate_string(value: object) -> str:
    if not isinstance(value, str):
        raise ValueRuleError("string carrier required")
    if any(0xD800 <= ord(char) <= 0xDFFF for char in value):
        raise ValueRuleError("string contains unpaired surrogate")
    return value


def validate_binary(value: object) -> bytes:
    if type(value) is not bytes:
        raise ValueRuleError("bytes carrier required")
    return value


def validate_date(value: object) -> date:
    if type(value) is not date:
        raise ValueRuleError("date carrier required; datetime excluded")
    return value


def validate_instant(value: object) -> datetime:
    if (
        type(value) is not datetime
        or type(value.tzinfo) is not timezone
        or value.fold != 0
    ):
        raise ValueRuleError("instant requires fixed-offset datetime with default fold")
    try:
        value.astimezone(timezone.utc)
    except (OverflowError, ValueError):
        raise ValueRuleError(
            "instant UTC normalization outside supported years"
        ) from None
    return value


def validate_local(value: object) -> datetime:
    if type(value) is not datetime or value.tzinfo is not None or value.fold != 0:
        raise ValueRuleError("local requires naive datetime with default fold")
    return value


def temporal_token(kind: Literal["date", "instant", "local"], value: object) -> str:
    """Serialize an admitted carrier canonically for umf-access-temporal/0.1.0."""
    if kind == "date":
        day = validate_date(value)
        return f"{day.year:04d}-{day.month:02d}-{day.day:02d}"
    if kind == "instant":
        instant = validate_instant(value)
        try:
            stamp = instant.astimezone(timezone.utc)
        except (OverflowError, ValueError):
            raise ValueRuleError(
                "instant UTC normalization outside supported years"
            ) from None
    elif kind == "local":
        stamp = validate_local(value)
    else:
        raise ValueRuleError("unsupported temporal kind")
    return (
        f"{stamp.year:04d}-{stamp.month:02d}-{stamp.day:02d}T"
        f"{stamp.hour:02d}:{stamp.minute:02d}:{stamp.second:02d}."
        f"{stamp.microsecond:06d}" + ("Z" if kind == "instant" else "")
    )


def validate_length(
    value: T, *, minimum: int | None = None, maximum: int | None = None
) -> T:
    """Length for resolved string/bytes/array/map constraints; no coercion."""
    if type(value) not in (str, bytes, tuple, list, dict):
        raise ValueRuleError("length requires a supported carrier")
    size = len(
        cast(
            str | bytes | tuple[object, ...] | list[object] | dict[object, object],
            value,
        )
    )
    if (minimum is not None and size < minimum) or (
        maximum is not None and size > maximum
    ):
        raise ValueRuleError("length outside authored bounds")
    return value


def validate_range(
    value: N,
    *,
    minimum: N | None = None,
    maximum: N | None = None,
    min_inclusive: bool = True,
    max_inclusive: bool = True,
) -> N:
    if type(value) not in (int, Decimal):
        raise ValueRuleError("range requires an exact numeric carrier")
    if isinstance(value, Decimal):
        validate_decimal(value)
    for bound in (minimum, maximum):
        if bound is not None and type(bound) is not type(value):
            raise ValueRuleError("range bound carrier mismatch")
        if isinstance(bound, Decimal):
            validate_decimal(bound)
    if (
        minimum is not None
        and (value < minimum or value == minimum and not min_inclusive)
        or maximum is not None
        and (value > maximum or value == maximum and not max_inclusive)
    ):
        raise ValueRuleError("value outside authored range")
    return value


def validate_allowed(value: T, allowed: tuple[T, ...]) -> T:
    if not any(
        type(candidate) is type(value) and candidate == value for candidate in allowed
    ):
        raise ValueRuleError("value outside authored allowed values")
    return value


def validate_vector(value: object, *, dimensions: int) -> Vector:
    if type(dimensions) is not int or dimensions < 1 or type(value) is not tuple:
        raise ValueRuleError("vector dimension or carrier mismatch")
    items = value
    if len(items) != dimensions:
        raise ValueRuleError("vector dimension or carrier mismatch")
    for item in items:
        if type(item) is not float or not isfinite(item):
            raise ValueRuleError("vector requires finite float32 values")
        try:
            exact = unpack("!f", pack("!f", item))[0]
        except OverflowError:
            raise ValueRuleError("vector value outside float32") from None
        if exact != item:
            raise ValueRuleError("vector value requires float32 rounding")
    return cast(Vector, value)


def validate_float32(value: object) -> float:
    return validate_vector((value,), dimensions=1)[0]

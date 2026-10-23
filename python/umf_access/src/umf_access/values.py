# SPDX-License-Identifier: MIT OR Apache-2.0
"""Strict Python carriers and explicit, resolved constraint helpers.

No native transport is guessed here. temporal_token implements only the selected
CONTRACT-075 oracle serialization, not a backend or permissive token parser.
"""

from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Literal, TypeVar, cast

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
    native = _native_values_bridge()
    try:
        fits = native.access_values_integer_fits(value, bits, signed)
    except ValueError as error:
        if str(error) == "invalid authored integer width":
            raise ValueRuleError("invalid authored integer width") from None
        raise ValueRuleError("native integer width decision failed") from None
    if type(fits) is not bool:
        raise ValueRuleError("native integer width result differs")
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
    # Python retains Decimal carrier and tuple extraction. Rust owns all
    # coefficient/exponent comparisons and never constructs 10**exponent.
    native = _native_values_bridge()
    try:
        result = native.access_values_validate_decimal(
            digits, exponent, precision, scale
        )
    except ValueError as error:
        message = str(error)
        if message in {
            "decimal requires rounding at authored scale",
            "decimal outside authored precision",
            "invalid authored decimal precision or scale",
        }:
            raise ValueRuleError(message) from None
        raise ValueRuleError("native decimal decision failed") from None
    if result is not None:
        raise ValueRuleError("native decimal result differs")
    return value


def _native_values_bridge() -> Any:
    """Require the exact installed core capability; never use a Python fallback."""
    try:
        from umf import rust_values
    except ImportError:
        raise ValueRuleError("installed umf-core Rust values engine required") from None
    version = getattr(rust_values, "access_values_profile_version", None)
    integer = getattr(rust_values, "access_values_integer_fits", None)
    decimal = getattr(rust_values, "access_values_validate_decimal", None)
    try:
        matches = callable(version) and version() == "umf-access-values/0.1.0"
    except (TypeError, ValueError, OverflowError):
        matches = False
    if not (matches and callable(integer) and callable(decimal)):
        raise ValueRuleError("installed umf-core lacks the required values profile")
    return rust_values


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
    instant, offset_microseconds = _instant_carrier_fields(value)
    # Range validation belongs to the shared native temporal profile. This
    # still preserves the validator's public refusal for unrepresentable UTC.
    _native_temporal_token("instant", instant, offset_microseconds)
    return instant


def _instant_carrier_fields(value: object) -> tuple[datetime, int]:
    if (
        type(value) is not datetime
        or type(value.tzinfo) is not timezone
        or value.fold != 0
    ):
        raise ValueRuleError("instant requires fixed-offset datetime with default fold")
    try:
        offset = value.utcoffset()
    except (OverflowError, ValueError):
        raise ValueRuleError("instant requires an explicit fixed offset") from None
    if type(offset) is not timedelta:
        raise ValueRuleError("instant requires an explicit fixed offset")
    return (
        value,
        (offset.days * 86_400 + offset.seconds) * 1_000_000 + offset.microseconds,
    )


def validate_local(value: object) -> datetime:
    if type(value) is not datetime or value.tzinfo is not None or value.fold != 0:
        raise ValueRuleError("local requires naive datetime with default fold")
    return value


def _native_temporal_token(
    kind: str,
    value: date | datetime,
    offset_microseconds: int | None = None,
) -> str:
    """Delegate canonicalization to the installed shared Rust engine."""
    try:
        from umf import rust_temporal
    except ImportError:
        raise ValueRuleError("installed umf-core Rust temporal engine required") from None
    canonicalize = getattr(rust_temporal, "access_temporal_canonical_token", None)
    profile_version = getattr(rust_temporal, "access_temporal_profile_version", None)
    if (
        not callable(canonicalize)
        or not callable(profile_version)
        or profile_version() != "umf-access-temporal/0.1.0"
    ):
        raise ValueRuleError("installed umf-core lacks the required temporal profile")
    try:
        token = canonicalize(
            kind,
            value.year,
            value.month,
            value.day,
            value.hour if type(value) is datetime else 0,
            value.minute if type(value) is datetime else 0,
            value.second if type(value) is datetime else 0,
            value.microsecond if type(value) is datetime else 0,
            offset_microseconds,
        )
    except ValueError as error:
        if str(error) == "normalized instant is outside years 0001 through 9999":
            raise ValueRuleError(
                "instant UTC normalization outside supported years"
            ) from None
        raise ValueRuleError("temporal carrier cannot be canonicalized") from None
    except (TypeError, OverflowError):
        raise ValueRuleError("temporal carrier cannot be canonicalized") from None
    if type(token) is not str:
        raise ValueRuleError("native temporal result differs")
    return token


def temporal_token(kind: Literal["date", "instant", "local"], value: object) -> str:
    """Serialize an admitted carrier canonically for umf-access-temporal/0.1.0."""
    if kind == "date":
        day = validate_date(value)
        return _native_temporal_token("date", day)
    if kind == "instant":
        instant, offset_microseconds = _instant_carrier_fields(value)
        return _native_temporal_token("instant", instant, offset_microseconds)
    elif kind == "local":
        stamp = validate_local(value)
    else:
        raise ValueRuleError("unsupported temporal kind")
    return _native_temporal_token("local", stamp)


def normalize_instant(value: object) -> datetime:
    """Return the codec's UTC datetime carrier from Rust-canonical token fields."""
    instant, offset_microseconds = _instant_carrier_fields(value)
    token = _native_temporal_token("instant", instant, offset_microseconds)
    separators = ((4, "-"), (7, "-"), (10, "T"), (13, ":"), (16, ":"), (19, "."), (26, "Z"))
    if (
        len(token) != 27
        or any(token[index] != marker for index, marker in separators)
        or any(
            not "0" <= character <= "9"
            for index, character in enumerate(token)
            if index not in {position for position, _ in separators}
        )
    ):
        raise ValueRuleError("native temporal result differs")
    try:
        return datetime(
            int(token[0:4]),
            int(token[5:7]),
            int(token[8:10]),
            int(token[11:13]),
            int(token[14:16]),
            int(token[17:19]),
            int(token[20:26]),
            tzinfo=UTC,
        )
    except (TypeError, ValueError, OverflowError):
        raise ValueRuleError("native temporal result differs") from None


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
    # Preserve Python's exact comparison protocol for unusual bounds. Exact
    # integer bounds use Rust, one at a time, so minimum failure still prevents
    # even inspecting/comparing maximum.
    if minimum is not None:
        if type(minimum) in (int, bool):
            native = _native_constraints_bridge()
            try:
                within = native.access_constraints_length_within(size, int(minimum), None)
            except (TypeError, ValueError, OverflowError):
                raise ValueRuleError("native length decision failed") from None
            if type(within) is not bool:
                raise ValueRuleError("native length result differs")
            if not within:
                raise ValueRuleError("length outside authored bounds")
        elif size < minimum:
            raise ValueRuleError("length outside authored bounds")
    if maximum is not None:
        if type(maximum) in (int, bool):
            native = _native_constraints_bridge()
            try:
                within = native.access_constraints_length_within(size, None, int(maximum))
            except (TypeError, ValueError, OverflowError):
                raise ValueRuleError("native length decision failed") from None
            if type(within) is not bool:
                raise ValueRuleError("native length result differs")
            if not within:
                raise ValueRuleError("length outside authored bounds")
        elif size > maximum:
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
    if minimum is None and maximum is None:
        return value
    native = _native_range_bridge()
    if minimum is not None:
        ordering = _compare_range_values(native, value, minimum)
        if ordering < 0 or ordering == 0 and not min_inclusive:
            raise ValueRuleError("value outside authored range")
    if maximum is not None:
        ordering = _compare_range_values(native, value, maximum)
        if ordering > 0 or ordering == 0 and not max_inclusive:
            raise ValueRuleError("value outside authored range")
    return value


def _native_range_bridge() -> Any:
    """Require the exact installed Rust range capability; never fall back."""
    try:
        from umf import rust_values
    except ImportError:
        raise ValueRuleError("installed umf-core Rust range engine required") from None
    version = getattr(rust_values, "access_range_profile_version", None)
    integer = getattr(rust_values, "access_range_compare_integer", None)
    decimal = getattr(rust_values, "access_range_compare_decimal", None)
    try:
        matches = callable(version) and version() == "umf-access-range/0.1.0"
    except (TypeError, ValueError, OverflowError):
        matches = False
    if not (matches and callable(integer) and callable(decimal)):
        raise ValueRuleError("installed umf-core lacks the required range profile")
    return rust_values


def _native_constraints_bridge() -> Any:
    """Require the exact installed Rust constraint capability; never fall back."""
    try:
        from umf import rust_values
    except ImportError:
        raise ValueRuleError("installed umf-core Rust constraints engine required") from None
    version = getattr(rust_values, "access_constraints_profile_version", None)
    length = getattr(rust_values, "access_constraints_length_within", None)
    equal = (
        getattr(rust_values, "access_constraints_equal_boolean", None),
        getattr(rust_values, "access_constraints_equal_integer", None),
        getattr(rust_values, "access_constraints_equal_text", None),
        getattr(rust_values, "access_constraints_equal_bytes", None),
        getattr(rust_values, "access_constraints_equal_decimal", None),
    )
    try:
        matches = callable(version) and version() == "umf-access-constraints/0.1.0"
    except (TypeError, ValueError, OverflowError):
        matches = False
    if not (
        matches
        and callable(length)
        and all(callable(function) for function in equal)
    ):
        raise ValueRuleError("installed umf-core lacks the required constraints profile")
    return rust_values


def _compare_range_values(native: Any, value: int | Decimal, bound: int | Decimal) -> int:
    try:
        if type(value) is int:
            ordering = native.access_range_compare_integer(value, bound)
        else:
            ordering = native.access_range_compare_decimal(
                value.as_tuple(), bound.as_tuple()
            )
    except (TypeError, ValueError, OverflowError):
        raise ValueRuleError("native range comparison failed") from None
    if type(ordering) is not int or ordering not in (-1, 0, 1):
        raise ValueRuleError("native range comparison result differs")
    return ordering


def validate_allowed(value: T, allowed: tuple[T, ...]) -> T:
    for candidate in allowed:
        if type(candidate) is not type(value):
            continue
        equal: Any
        arguments: tuple[Any, ...]
        if type(value) is bool:
            native = _native_constraints_bridge()
            equal = native.access_constraints_equal_boolean
            arguments = (candidate, value)
        elif type(value) is int:
            native = _native_constraints_bridge()
            equal = native.access_constraints_equal_integer
            arguments = (candidate, value)
        elif type(value) is str and type(candidate) is str and not any(
            0xD800 <= ord(character) <= 0xDFFF
            for text in (candidate, value)
            for character in text
        ):
            native = _native_constraints_bridge()
            equal = native.access_constraints_equal_text
            arguments = (candidate, value)
        elif type(value) is bytes:
            native = _native_constraints_bridge()
            equal = native.access_constraints_equal_bytes
            arguments = (candidate, value)
        elif type(value) is Decimal and value.is_finite() and candidate.is_finite():
            native = _native_constraints_bridge()
            equal = native.access_constraints_equal_decimal
            arguments = (candidate.as_tuple(), value.as_tuple())
        else:
            # Preserve candidate.__eq__(value), its truth conversion and any
            # host exception for custom, nested, float, non-finite or exotic data.
            if candidate == value:
                return value
            continue
        try:
            outcome = equal(*arguments)
        except (TypeError, ValueError, OverflowError):
            raise ValueRuleError("native allowed-value comparison failed") from None
        if type(outcome) is not bool:
            raise ValueRuleError("native allowed-value result differs")
        if outcome:
            return value
    raise ValueRuleError("value outside authored allowed values")


def validate_vector(value: object, *, dimensions: int) -> Vector:
    if type(dimensions) is not int or dimensions < 1 or type(value) is not tuple:
        raise ValueRuleError("vector dimension or carrier mismatch")
    items = value
    if len(items) != dimensions:
        raise ValueRuleError("vector dimension or carrier mismatch")
    native = None
    for item in items:
        if type(item) is not float:
            raise ValueRuleError("vector requires finite float32 values")
        if native is None:
            native = _float32_bridge()
        try:
            outcome = native.access_float32_classify(item)
        except (TypeError, ValueError, OverflowError):
            raise ValueRuleError("native float32 validation failed") from None
        if type(outcome) is not int:
            raise ValueRuleError("native float32 validation result differs")
        if outcome == 1:
            raise ValueRuleError("vector requires finite float32 values")
        if outcome == 2:
            raise ValueRuleError("vector value outside float32")
        if outcome == 3:
            raise ValueRuleError("vector value requires float32 rounding")
        if outcome != 0:
            raise ValueRuleError("native float32 validation result differs")
    return cast(Vector, value)


def _float32_bridge() -> Any:
    try:
        from umf import rust_values
    except ImportError:
        raise ValueRuleError("installed umf-core lacks the required float32 profile") from None
    version = getattr(rust_values, "access_float32_profile_version", None)
    classify = getattr(rust_values, "access_float32_classify", None)
    try:
        matches = callable(version) and version() == "umf-access-float32/0.1.0"
    except (TypeError, ValueError, OverflowError):
        matches = False
    if not (matches and callable(classify)):
        raise ValueRuleError("installed umf-core lacks the required float32 profile")
    return rust_values


# Generated packages carry instances of this metadata-driven callable, not
# private copies of validation algorithms.
from dataclasses import dataclass
from typing import Any

from pydantic import TypeAdapter


@dataclass(frozen=True)
class FieldValidator:
    kind: str
    dimensions: int | None = None
    bits: int | None = None
    signed: bool = True
    precision: int | None = None
    scale: int | None = None
    adapter: TypeAdapter[Any] | None = None
    minimum: int | None = None
    maximum: int | None = None
    range_min: int | Decimal | None = None
    range_max: int | Decimal | None = None
    min_inclusive: bool = True
    max_inclusive: bool = True
    allowed: tuple[object, ...] | None = None

    def __call__(self, value: object) -> object:
        if self.adapter is not None:
            checked = self.adapter.validate_python(value, strict=True)
        elif self.kind == "vector":
            if self.dimensions is None:
                raise ValueRuleError("vector dimension metadata required")
            checked = validate_vector(value, dimensions=self.dimensions)
        elif self.kind == "float32":
            checked = validate_float32(value)
        elif self.kind == "integer":
            checked = validate_integer(value, bits=self.bits, signed=self.signed)
        elif self.kind == "decimal":
            checked = validate_decimal(value, precision=self.precision, scale=self.scale)
        else:
            validators = {"boolean": validate_boolean, "binary": validate_binary,
                          "string": validate_string, "date": validate_date,
                          "instant": validate_instant, "local": validate_local}
            validator = validators.get(self.kind)
            if validator is None:
                raise ValueRuleError("unsupported generated carrier metadata")
            checked = validator(value)
        if self.minimum is not None or self.maximum is not None:
            checked = validate_length(checked, minimum=self.minimum, maximum=self.maximum)
        if self.range_min is not None or self.range_max is not None:
            checked = validate_range(checked, minimum=self.range_min, maximum=self.range_max,
                                     min_inclusive=self.min_inclusive, max_inclusive=self.max_inclusive)
        if self.allowed is not None:
            checked = validate_allowed(checked, self.allowed)
        return checked
def validate_float32(value: object) -> float:
    checked = validate_vector((value,), dimensions=1)
    return checked[0]

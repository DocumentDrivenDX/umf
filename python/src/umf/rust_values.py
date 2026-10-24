# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public versioned bridge for exact typed-access value decisions."""

from . import _rust

_PROFILE = "umf-access-values/0.1.0"
_FLOAT32_PROFILE = "umf-access-float32/0.1.0"


def access_float32_profile_version() -> str:
    return _rust._rust_core.access_float32_profile_version()


def access_float32_classify(value: float) -> int:
    """Return 0 valid, 1 nonfinite, 2 overflow, or 3 rounding required."""
    return _rust._rust_core.access_float32_classify(value)


def access_values_profile_version() -> str:
    return _rust._rust_core.access_values_profile_version()


def access_values_string_profile_version() -> str:
    """Return the version of the Unicode scalar admission profile."""
    return _rust._rust_core.access_values_string_profile_version()


def access_values_validate_string(value: str) -> bool:
    """Return whether exact built-in string code points are Unicode scalars."""
    return _rust._rust_core.access_values_validate_string(value)


def access_values_integer_fits(
    value: int, bits: int | None, signed: bool
) -> bool:
    return _rust._rust_core.access_values_integer_fits(value, bits, signed)


def access_values_validate_decimal(
    digits: tuple[int, ...],
    exponent: int,
    precision: int | None,
    scale: int | None,
) -> None:
    return _rust._rust_core.access_values_validate_decimal(
        digits, exponent, precision, scale
    )


def access_range_profile_version() -> str:
    return _rust._rust_core.access_range_profile_version()


def access_range_compare_integer(left: int, right: int) -> int:
    return _rust._rust_core.access_range_compare_integer(left, right)


def access_range_compare_decimal(
    left: tuple[int, tuple[int, ...], int],
    right: tuple[int, tuple[int, ...], int],
) -> int:
    return _rust._rust_core.access_range_compare_decimal(left, right)


def access_constraints_profile_version() -> str:
    return _rust._rust_core.access_constraints_profile_version()


def access_constraints_length_within(
    size: int, minimum: int | None, maximum: int | None
) -> bool:
    return _rust._rust_core.access_constraints_length_within(size, minimum, maximum)


def access_constraints_equal_boolean(left: bool, right: bool) -> bool:
    return _rust._rust_core.access_constraints_equal_boolean(left, right)


def access_constraints_equal_integer(left: int, right: int) -> bool:
    return _rust._rust_core.access_constraints_equal_integer(left, right)


def access_constraints_equal_text(left: str, right: str) -> bool:
    return _rust._rust_core.access_constraints_equal_text(left, right)


def access_constraints_equal_bytes(left: bytes, right: bytes) -> bool:
    return _rust._rust_core.access_constraints_equal_bytes(left, right)


def access_constraints_equal_decimal(
    left: tuple[int, tuple[int, ...], int],
    right: tuple[int, tuple[int, ...], int],
) -> bool:
    return _rust._rust_core.access_constraints_equal_decimal(left, right)

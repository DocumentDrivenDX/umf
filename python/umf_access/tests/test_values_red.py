# SPDX-License-Identifier: MIT OR Apache-2.0
"""Red specification for proposed runtime ABI; not generated-model acceptance."""

import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, localcontext
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from umf import rust_values
from umf_access.values import (
    FieldValidator,
    validate_allowed,
    validate_binary,
    validate_boolean,
    validate_date,
    validate_decimal,
    validate_instant,
    validate_integer,
    validate_length,
    validate_local,
    validate_range,
    validate_string,
    validate_vector,
)


class ValuePolicyTests(unittest.TestCase):
    # @covers US-081-AC2
    def test_exact_decimal_without_rounding_or_context(self):
        with localcontext() as context:
            context.prec = 1
            for spelling in (
                "125.5",
                "1.2",
                "1.20",
                "1.200",
                "0.000",
                "-9999999999.99",
            ):
                value = Decimal(spelling)
                result = validate_decimal(value, precision=12, scale=2)
                self.assertEqual(result.as_tuple(), value.as_tuple())
            for value in (
                Decimal("1.234"),
                Decimal(10000000000),
                Decimal("NaN"),
                Decimal("Infinity"),
                1.2,
                "1.20",
                True,
            ):
                with (
                    self.subTest(value_type=type(value).__name__),
                    self.assertRaises(ValueError),
                ):
                    validate_decimal(value, precision=12, scale=2)

    # @covers US-081-AC2
    def test_integer_width_excludes_bool_and_coercion(self):
        for value in (-128, 0, 127):
            self.assertEqual(validate_integer(value, bits=8, signed=True), value)
        for value in (-129, 128, True, "1", 1.0):
            with self.assertRaises(ValueError):
                validate_integer(value, bits=8, signed=True)
        self.assertEqual(validate_integer(255, bits=8, signed=False), 255)
        with self.assertRaises(ValueError):
            validate_integer(-1, bits=8, signed=False)

    # @covers US-081-AC2
    def test_string_preserves_unicode_without_surrogates(self):
        for value in ("e\u0301", "é", "😀", ""):
            self.assertEqual(validate_string(value), value)
        for value in ("\ud800", "x\udfff", b"text", 1):
            with self.assertRaises(ValueError):
                validate_string(value)

    def test_string_rust_admission_preserves_identity_and_subclass_protocol(self):
        self.assertEqual(
            rust_values.access_values_string_profile_version(), "umf-access-string/0.1.0"
        )
        for value in ("", "ASCII", "é", "😀", "e\u0301"):
            self.assertIs(rust_values.access_values_validate_string(value), True)
        for value in ("\ud800", "x\udfff", "\ud83d\ude00"):
            self.assertIs(rust_values.access_values_validate_string(value), False)
        class RawSubclass(str):
            pass

        with self.assertRaisesRegex(ValueError, "string carrier required"):
            rust_values.access_values_validate_string(RawSubclass("subclass"))

        for value in ("", "ascii", "é", "e\u0301", "😀"):
            self.assertIs(validate_string(value), value)
            self.assertIs(FieldValidator(kind="string")(value), value)
        for value in ("\ud800", "x\udfff", "\ud83d\ude00"):
            for validator in (validate_string, FieldValidator(kind="string")):
                with self.subTest(value=repr(value)), self.assertRaisesRegex(
                    ValueError, "string contains unpaired surrogate"
                ):
                    validator(value)

        class IteratedString(str):
            def __iter__(self):
                return iter(("v",))

        class SurrogateString(str):
            def __iter__(self):
                return iter(("\ud800",))

        class IterationFailure(Exception):
            pass

        failure = IterationFailure("custom iteration failed")

        class RaisingString(str):
            def __iter__(self):
                raise failure

        for value in (IteratedString("stored"),):
            self.assertIs(validate_string(value), value)
            self.assertIs(FieldValidator(kind="string")(value), value)
        for value in (SurrogateString("stored"),):
            for validator in (validate_string, FieldValidator(kind="string")):
                with self.assertRaisesRegex(ValueError, "string contains unpaired surrogate"):
                    validator(value)
        for validator in (validate_string, FieldValidator(kind="string")):
            with self.assertRaises(IterationFailure) as caught:
                validator(RaisingString("stored"))
            self.assertIs(caught.exception, failure)

    def test_string_requires_matching_native_capability_for_exact_strings(self):
        missing = ModuleType("umf")
        with patch.dict("sys.modules", {"umf": missing}):
            sys.modules.pop("umf.rust_values", None)
            with self.assertRaisesRegex(ValueError, "string carrier required"):
                validate_string(b"not a string")
            for validator in (validate_string, FieldValidator(kind="string")):
                with self.assertRaisesRegex(
                    ValueError, "installed umf-core Rust string engine required"
                ):
                    validator("exact string")
            with self.assertRaisesRegex(
                ValueError, "installed umf-core Rust string engine required"
            ):
                validate_string("\ud800")

            class Subclass(str):
                def __iter__(self):
                    return iter(("s",))

            subclass = Subclass("stored")
            self.assertIs(validate_string(subclass), subclass)
            self.assertIs(FieldValidator(kind="string")(subclass), subclass)

        mismatched = ModuleType("umf")
        mismatched.rust_values = SimpleNamespace(
            access_values_string_profile_version=lambda: "umf-access-string/9.9.9",
            access_values_validate_string=lambda value: None,
        )
        with patch.dict("sys.modules", {"umf": mismatched}):
            for validator in (validate_string, FieldValidator(kind="string")):
                with self.assertRaisesRegex(
                    ValueError, "installed umf-core lacks the required string profile"
                ):
                    validator("exact string")
            for validator in (validate_string, FieldValidator(kind="string")):
                with self.assertRaisesRegex(
                    ValueError, "installed umf-core lacks the required string profile"
                ):
                    validator("\ud800")

        native_failure = ValueError("native control failure envelope")
        failing = ModuleType("umf")
        failing.rust_values = SimpleNamespace(
            access_values_string_profile_version=lambda: "umf-access-string/0.1.0",
            access_values_validate_string=lambda value: (_ for _ in ()).throw(native_failure),
        )
        with patch.dict("sys.modules", {"umf": failing}):
            with self.assertRaises(ValueError) as caught:
                validate_string("exact string")
            self.assertIs(caught.exception, native_failure)

    # @covers US-081-AC2
    def test_resolved_scalar_and_container_constraints(self):
        self.assertIs(validate_boolean(True), True)
        for value in (1, "true", None):
            with self.assertRaises(ValueError):
                validate_boolean(value)
        self.assertEqual(validate_binary(b"\xff"), b"\xff")
        for value in (bytearray(b"x"), "ff", memoryview(b"x")):
            with self.assertRaises(ValueError):
                validate_binary(value)
        self.assertEqual(validate_length("😀", minimum=1, maximum=1), "😀")
        for value in ([], {}, (), "", b""):
            with self.assertRaises(ValueError):
                validate_length(value, minimum=1)
        for value in (0, 3):
            with self.assertRaises(ValueError):
                validate_range(value, minimum=0, maximum=2, min_inclusive=False)
        self.assertEqual(validate_range(2, minimum=0, maximum=2), 2)
        self.assertEqual(
            validate_allowed(Decimal("1.200"), (Decimal("1.2"),)), Decimal("1.200")
        )
        with self.assertRaises(ValueError):
            validate_allowed(True, (1,))

    # @covers US-081-AC2
    def test_vector_preserves_finite_float32_without_silent_rounding(self):
        value = (1.0, -0.0, 0.5)
        self.assertIs(validate_vector(value, dimensions=3), value)
        for value in (
            (float("nan"),),
            (float("inf"),),
            (0.1,),
            (1e100,),
            (1,),
            [1.0],
            (),
        ):
            with self.assertRaises(ValueError):
                validate_vector(value, dimensions=1)

    # @covers US-081-AC2
    def test_temporal_carriers_remain_distinct(self):
        day = date(2026, 10, 15)
        local = datetime(2026, 10, 15, 12)
        instant = local.replace(tzinfo=timezone(timedelta(hours=5, minutes=30)))
        self.assertEqual(validate_date(day), day)
        self.assertEqual(validate_local(local), local)
        self.assertEqual(validate_instant(instant), instant)
        for check, value in (
            (validate_date, local),
            (validate_date, "2026-10-15"),
            (validate_local, instant),
            (validate_instant, local),
        ):
            with self.assertRaises(ValueError):
                check(value)


if __name__ == "__main__":
    unittest.main()

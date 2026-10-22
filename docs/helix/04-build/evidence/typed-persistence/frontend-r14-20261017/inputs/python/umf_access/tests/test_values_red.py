"""Red specification for proposed runtime ABI; not generated-model acceptance."""

import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, localcontext

from umf_access.values import (
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

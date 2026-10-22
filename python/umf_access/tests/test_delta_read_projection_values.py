# SPDX-License-Identifier: MIT OR Apache-2.0
"""Driver result decoding controls; native engine qualification is separate."""

from __future__ import annotations

import unittest
from decimal import Decimal

from umf_access.delta_read import _native_projection
from umf_access.pages import ReadObligationUnmet
from umf_access.values import ValueRuleError


class SparkProjectionValues(unittest.TestCase):
    def test_exact_binary_and_fixed_float32_vector(self) -> None:
        binary = {"carrier": "binary", "nullable": False, "nativeType": "binary"}
        self.assertEqual(
            _native_projection(binary, bytearray(b"\x00\xff")), b"\x00\xff"
        )
        vector = {
            "carrier": "vector",
            "nullable": False,
            "nativeType": "array<float>",
            "dimensions": 2,
        }
        self.assertEqual(_native_projection(vector, [0.5, -2.0]), (0.5, -2.0))
        for value in ([0.1, 0.0], [float("nan"), 0.0], [0.5], [0, 0.0], [None, 0.0]):
            with self.subTest(value=value), self.assertRaises(ValueRuleError):
                _native_projection(vector, value)
        with self.assertRaises(ReadObligationUnmet):
            _native_projection(binary, "00ff")
        with self.assertRaises(ReadObligationUnmet):
            _native_projection(vector, (0.5, -2.0))
        with self.assertRaises(ReadObligationUnmet):
            _native_projection(vector, None)

    def test_exact_integer_width_and_decimal_scale(self) -> None:
        integer = {
            "carrier": "integer",
            "nullable": False,
            "integerWidth": {"bits": 8, "signed": True},
        }
        self.assertEqual(_native_projection(integer, -128), -128)
        for value in (-129, 128, True):
            with self.subTest(value=value), self.assertRaises(ValueRuleError):
                _native_projection(integer, value)
        decimal = {"carrier": "decimal", "nullable": False, "precision": 5, "scale": 2}
        self.assertEqual(
            _native_projection(decimal, Decimal("123.45")), Decimal("123.45")
        )
        for value in (Decimal("1234.56"), Decimal("1.234"), Decimal("Infinity"), 1.2):
            with self.subTest(value=value), self.assertRaises(ValueRuleError):
                _native_projection(decimal, value)


if __name__ == "__main__":
    unittest.main()

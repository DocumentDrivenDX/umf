"""Integer result decoding follows compiler carriers, never numeric coercion."""

import unittest
from decimal import Decimal

from umf_access.pages import ReadObligationUnmet
from umf_access.postgres_read import _output_value


class IntegerNativeOutputTests(unittest.TestCase):
    def test_exact_numeric_integer_is_unbounded(self) -> None:
        for value in (Decimal(0), Decimal("-4.000"), Decimal(18446744073709551614)):
            result = _output_value(value, {"carrier": "integer"})
            self.assertIs(type(result), int)
            self.assertEqual(result, value)

    def test_fractional_and_nonfinite_numeric_refuse(self) -> None:
        for value in (Decimal("1.01"), Decimal("NaN"), Decimal("sNaN"), Decimal("Infinity"), Decimal("-Infinity")):
            with self.subTest(value=str(value)), self.assertRaises(ReadObligationUnmet):
                _output_value(value, {"carrier": "integer"})

    def test_other_native_values_and_decimal_carrier_are_not_coerced(self) -> None:
        for value in (None, True, 2, 1.0, "2", Decimal("2.00")):
            self.assertIs(_output_value(value, {"carrier": "decimal"}), value)
        for value in (None, True, 2, 1.0, "2"):
            self.assertIs(_output_value(value, {"carrier": "integer"}), value)


if __name__ == "__main__":
    unittest.main()

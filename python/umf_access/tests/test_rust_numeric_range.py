# SPDX-License-Identifier: MIT OR Apache-2.0
"""Frozen predecessor and independent exact-order checks for R6 numeric ranges."""

import json
import unittest
from decimal import Decimal
from fractions import Fraction
from pathlib import Path
from unittest.mock import patch

from umf_access.types import ValueRuleError
from umf_access.values import validate_range


ROOT = Path(__file__).parents[3]
FROZEN = (
    ROOT
    / "docs/helix/04-build/evidence/rust-migration/r6-numeric-range/frozen-predecessor.json"
)


def _number(spec: dict[str, object]) -> object:
    if "int" in spec:
        return int(spec["int"])
    if "decimal" in spec:
        return Decimal(spec["decimal"])
    if "string" in spec:
        return spec["string"]
    if "float" in spec:
        return float("nan")
    raise AssertionError(f"unknown numeric test carrier: {spec!r}")


class RustNumericRangeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.corpus = json.loads(FROZEN.read_text(encoding="utf-8"))

    def test_frozen_predecessor_outcomes_and_identity(self) -> None:
        for case in self.corpus["cases"]:
            with self.subTest(case=case["name"]):
                value = _number(case["value"])
                kwargs: dict[str, object] = {}
                for key in ("minimum", "maximum"):
                    if key in case:
                        kwargs[key] = _number(case[key])
                if "minInclusive" in case:
                    kwargs["min_inclusive"] = case["minInclusive"]
                if "maxInclusive" in case:
                    kwargs["max_inclusive"] = case["maxInclusive"]
                outcome = case["outcome"]
                if outcome == "same-input":
                    self.assertIs(validate_range(value, **kwargs), value)
                else:
                    with self.assertRaisesRegex(ValueRuleError, f"^{outcome}$"):
                        validate_range(value, **kwargs)

    def test_integer_order_against_python_integer_oracle(self) -> None:
        # Python's arbitrary-precision integers are independent of the Rust bridge.
        for value in range(-120, 121):
            for bound in range(-120, 121):
                original = value
                expected = value >= bound
                if expected:
                    self.assertIs(validate_range(original, minimum=bound), original)
                else:
                    with self.assertRaisesRegex(ValueRuleError, "value outside authored range"):
                        validate_range(original, minimum=bound)
        huge = 1 << 4096
        negative_huge = -huge
        self.assertIs(validate_range(huge, minimum=huge), huge)
        self.assertIs(validate_range(negative_huge, maximum=negative_huge), negative_huge)
        with self.assertRaisesRegex(ValueRuleError, "value outside authored range"):
            validate_range(huge, maximum=huge - 1)

    def test_decimal_order_against_fraction_oracle(self) -> None:
        # Fraction provides an independently represented exact rational value.
        spellings = ("-10.01", "-1.0", "-0", "0.000", "0.01", "1", "1.000", "10.01")
        values = tuple(Decimal(spelling) for spelling in spellings)
        for value in values:
            for bound in values:
                expected = Fraction(value) >= Fraction(bound)
                if expected:
                    self.assertIs(validate_range(value, minimum=bound), value)
                else:
                    with self.assertRaisesRegex(ValueRuleError, "value outside authored range"):
                        validate_range(value, minimum=bound)

    def test_decimal_order_against_fraction_oracle_for_exponents_and_signs(self) -> None:
        coefficients = (1, 2, 9, 10, 11, 99)
        exponents = (-9, -2, 0, 4, 99)
        values = tuple(
            Decimal((sign, tuple(int(digit) for digit in str(coefficient)), exponent))
            for sign in (0, 1)
            for coefficient in coefficients
            for exponent in exponents
        )
        for value in values:
            for bound in values:
                expected = Fraction(value) >= Fraction(bound)
                if expected:
                    self.assertIs(validate_range(value, minimum=bound), value)
                else:
                    with self.assertRaisesRegex(ValueRuleError, "value outside authored range"):
                        validate_range(value, minimum=bound)

    def test_inclusive_truthiness_runs_only_for_equal_endpoint(self) -> None:
        class RaisesWhenTruthTested:
            def __bool__(self) -> bool:
                raise RuntimeError("truth test reached")

        flag = RaisesWhenTruthTested()
        with self.assertRaisesRegex(ValueRuleError, "value outside authored range"):
            validate_range(1, minimum=2, min_inclusive=flag)
        with self.assertRaisesRegex(RuntimeError, "truth test reached"):
            validate_range(1, minimum=1, min_inclusive=flag)
        with self.assertRaisesRegex(ValueRuleError, "range bound carrier mismatch"):
            validate_range(1, minimum=2, maximum="bad", max_inclusive=flag)

    def test_separate_profile_is_required_and_raw_inputs_fail_closed(self) -> None:
        from umf import _rust, rust_values

        self.assertEqual(
            rust_values.access_values_profile_version(), "umf-access-values/0.1.0"
        )
        self.assertEqual(
            rust_values.access_range_profile_version(), "umf-access-range/0.1.0"
        )
        original = 7
        with patch.object(rust_values, "access_range_profile_version", None):
            self.assertIs(validate_range(original), original)
            with self.assertRaisesRegex(ValueRuleError, "required range profile"):
                validate_range(original, minimum=0)
            with self.assertRaisesRegex(ValueRuleError, "range bound carrier mismatch"):
                validate_range(original, minimum=Decimal("0"))
        with patch.object(
            rust_values,
            "access_range_profile_version",
            return_value="umf-access-range/9.9.9",
        ):
            with self.assertRaisesRegex(ValueRuleError, "required range profile"):
                validate_range(1, minimum=0)

        native = _rust._rust_core
        with self.assertRaisesRegex(ValueError, "integer range carrier required"):
            native.access_range_compare_integer(True, 1)
        for left in (
            (2, (1,), 0),
            (0, (10,), 0),
            (0, (1,), True),
            [0, (1,), 0],
        ):
            with self.subTest(left=left):
                with self.assertRaises(ValueError):
                    native.access_range_compare_decimal(left, (0, (1,), 0))


if __name__ == "__main__":
    unittest.main()

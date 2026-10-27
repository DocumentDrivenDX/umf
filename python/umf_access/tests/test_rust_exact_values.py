# SPDX-License-Identifier: MIT OR Apache-2.0
"""Frozen predecessor replay and independent exact numeric oracles for R6."""

import json
import unittest
from decimal import Decimal
from fractions import Fraction
from pathlib import Path
from unittest.mock import patch

from umf_access.types import ValueRuleError
from umf_access.values import validate_decimal, validate_integer

ROOT = Path(__file__).parents[3]
FROZEN = ROOT / "docs/helix/04-build/evidence/rust-migration/r6-exact-values/frozen-predecessor.json"


def _integer(spec: object) -> int:
    if isinstance(spec, str) and spec.startswith("pow2:"):
        return 1 << int(spec.partition(":")[2])
    return int(spec)


def _input_value(case: dict[str, object]) -> object:
    if case["op"] == "integer":
        spec = case["value"]
        return spec if type(spec) is bool else _integer(spec)
    return Decimal(case["value"])


def _predecessor_result(case: dict[str, object], value: object | None = None) -> object:
    value = _input_value(case) if value is None else value
    if case["op"] == "integer":
        return validate_integer(
            value,
            bits=None if case["bits"] is None else int(case["bits"]),
            signed=case["signed"],
        )
    return validate_decimal(
        value,
        precision=None if case["precision"] is None else int(case["precision"]),
        scale=None if case["scale"] is None else int(case["scale"]),
    )


class RustExactValuesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.corpus = json.loads(FROZEN.read_text(encoding="utf-8"))

    def test_frozen_predecessor_outcomes(self) -> None:
        for case in self.corpus["cases"]:
            with self.subTest(case=case["name"]):
                outcome = case["outcome"]
                if outcome == "same-input":
                    original = _input_value(case)
                    self.assertIs(_predecessor_result(case, original), original)
                else:
                    with self.assertRaisesRegex(ValueRuleError, f"^{outcome}$"):
                        _predecessor_result(case)

    def test_independent_integer_interval_oracle(self) -> None:
        cases = [case for case in self.corpus["cases"] if case["op"] == "integer"]
        for case in cases:
            value = _integer(case["value"])
            bits = None if case["bits"] is None else int(case["bits"])
            if bits is None:
                expected = True
            elif type(bits) is int and bits >= 1 and type(case["signed"]) is bool:
                bound = 1 << (bits - 1 if case["signed"] else bits)
                expected = -bound <= value < bound if case["signed"] else 0 <= value < bound
            else:
                expected = None
            with self.subTest(case=case["name"]):
                if expected is None:
                    with self.assertRaises(ValueRuleError):
                        _predecessor_result(case)
                elif expected:
                    original = _integer(case["value"])
                    self.assertIs(validate_integer(original, bits=bits, signed=case["signed"]), original)
                else:
                    with self.assertRaisesRegex(ValueRuleError, "integer outside authored width"):
                        _predecessor_result(case)

    def test_independent_fraction_oracle_for_bounded_decimal_cases(self) -> None:
        for spelling, precision, scale, expected in (
            ("1.20", 3, 2, True),
            ("1.2300", 3, 2, True),
            ("1.234", 4, 2, False),
            ("1000", 3, 0, False),
        ):
            value = Decimal(spelling)
            scaled = Fraction(value) * (10**scale)
            oracle = scaled.denominator == 1 and abs(scaled.numerator) < 10**precision
            self.assertEqual(oracle, expected)
            if expected:
                self.assertIs(validate_decimal(value, precision=precision, scale=scale), value)
            else:
                with self.assertRaises(ValueRuleError):
                    validate_decimal(value, precision=precision, scale=scale)

    def test_bridge_is_versioned_and_has_no_python_fallback(self) -> None:
        from umf import rust_values

        self.assertEqual(rust_values.access_values_profile_version(), "umf-access-values/0.1.0")
        original = Decimal("1.20")
        with patch.object(rust_values, "access_values_profile_version", return_value="umf-access-values/9.9.9"), self.assertRaisesRegex(ValueRuleError, "required values profile"):
                validate_decimal(original, precision=3, scale=2)


if __name__ == "__main__":
    unittest.main()

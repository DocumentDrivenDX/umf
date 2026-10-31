# SPDX-License-Identifier: MIT OR Apache-2.0
"""R6 binary32 predecessor replay and independent IEEE/rational checks."""

import json
import math
import random
import struct
import unittest
from fractions import Fraction
from pathlib import Path
from unittest.mock import patch

from umf_access.types import ValueRuleError
from umf_access.values import FieldValidator, validate_float32, validate_vector

ROOT = Path(__file__).parents[3]
FROZEN = ROOT / "tests/rust-core/fixtures/r6-exact-values/float32-frozen-predecessor.json"


def _case_value(expression: str) -> object:
    class TupleSub(tuple):
        pass

    class FloatSub(float):
        pass

    return eval(expression, {"TupleSub": TupleSub, "FloatSub": FloatSub})


def _rational_binary32_exact(value: float) -> str:
    if not math.isfinite(value):
        return "vector requires finite float32 values"
    exact = abs(Fraction.from_float(value))
    overflow_midpoint = Fraction((1 << 128) - (1 << 103))
    if exact >= overflow_midpoint:
        return "vector value outside float32"
    if exact == 0:
        return "valid"
    if exact < Fraction(1, 1 << 126):
        return "valid" if (exact * (1 << 149)).denominator == 1 else "vector value requires float32 rounding"
    numerator = exact.numerator
    # A normal binary32 value has at most 24 significant bits after removing
    # powers of two; its exponent is already bounded by the finite check above.
    while numerator % 2 == 0:
        numerator //= 2
    return "valid" if numerator.bit_length() <= 24 else "vector value requires float32 rounding"


class RustFloat32Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.corpus = json.loads(FROZEN.read_text(encoding="utf-8"))

    def test_frozen_predecessor_rows_and_tuple_identity(self) -> None:
        for case in self.corpus["cases"]:
            with self.subTest(case=case["name"]):
                value = _case_value(case["carrier"])
                outcome = case["outcome"]
                validator = case.get("validator")
                if validator == "float32":
                    check = FieldValidator(kind="float32")
                elif validator == "vector":
                    check = FieldValidator(kind="vector", dimensions=case["dimensions"])
                else:
                    dimensions = case["dimensions"]
                    check = lambda item, dimensions=dimensions: validate_vector(item, dimensions=dimensions)
                if outcome == "same-input":
                    self.assertIs(check(value), value)
                else:
                    with self.assertRaisesRegex(ValueRuleError, f"^{outcome}$"):
                        check(value)

    def test_independent_ieee_rational_oracle_over_random_binary64_patterns(self) -> None:
        rng = random.Random(0xF32A)
        for _ in range(1500):
            bits = rng.getrandbits(64)
            value = struct.unpack(">d", bits.to_bytes(8, "big"))[0]
            expected = _rational_binary32_exact(value)
            with self.subTest(bits=f"{bits:016x}"):
                if expected == "valid":
                    self.assertEqual(validate_float32(value), value)
                else:
                    with self.assertRaisesRegex(ValueRuleError, f"^{expected}$"):
                        validate_float32(value)

    def test_raw_binding_rejects_coercible_and_subclass_float_carriers(self) -> None:
        from umf import rust_values

        class FloatSub(float):
            pass

        for value in (1, True, "1.0", FloatSub(1.0)):
            with self.subTest(value=type(value).__name__), self.assertRaises((TypeError, ValueError)):
                    rust_values.access_float32_classify(value)

    def test_bridge_fails_closed_on_missing_or_mismatched_profile(self) -> None:
        from umf import rust_values

        value = 1.0
        with patch.object(rust_values, "access_float32_profile_version", return_value="umf-access-float32/9.9"), self.assertRaisesRegex(ValueRuleError, "required float32 profile"):
                validate_float32(value)


if __name__ == "__main__":
    unittest.main()

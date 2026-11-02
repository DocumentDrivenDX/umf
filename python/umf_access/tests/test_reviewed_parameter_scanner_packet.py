# SPDX-License-Identifier: MIT OR Apache-2.0
"""Behavior vectors for the current host-side reviewed parameter scanner."""
from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

from umf_access.reviewed import ReadBuildError, _parameter_positions_python

ROOT = Path(__file__).resolve().parents[3]
CASES = ROOT / "tests/rust-core/fixtures/reviewed-parameter-scanner/cases.json"


def _sql(case: dict[str, object]) -> str:
    if "codepoints" in case:
        return "".join(chr(codepoint) for codepoint in case["codepoints"])
    return case["sql"]


def _expected(case: dict[str, object]) -> dict[str, object]:
    version = f"{sys.version_info.major}.{sys.version_info.minor}"
    if "expected_by_cpython" in case:
        return case["expected_by_cpython"][version]
    return case


class ReviewedParameterScanner(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.cases = json.loads(CASES.read_text(encoding="utf-8"))

    def test_functional_scanner_cases(self) -> None:
        cases = list(self.cases["cases"])
        for case in self.cases.get("versioned_cases", []):
            version = f"{sys.version_info.major}.{sys.version_info.minor}"
            if version in case["expected_by_cpython"]:
                cases.append({**case, **case["expected_by_cpython"][version]})
        for case in cases:
            with self.subTest(case=case["id"]):
                expected = _expected(case)
                if "spans" in expected:
                    actual = _parameter_positions_python(_sql(case))
                    normalized = [[start, end, str(ordinal)] for start, end, ordinal in actual]
                    self.assertEqual(normalized, expected["spans"])
                else:
                    error = expected["error"]
                    with self.assertRaisesRegex(ReadBuildError, f"^{re.escape(error['message'])}$"):
                        _parameter_positions_python(_sql(case))

    def test_default_integer_digit_limit_is_preserved(self) -> None:
        if not hasattr(sys, "get_int_max_str_digits") or not sys.get_int_max_str_digits():
            self.skipTest("this interpreter has no active int digit limit")
        digits = "1" * (sys.get_int_max_str_digits() + 1)
        with self.assertRaises(ValueError):
            _parameter_positions_python("$" + digits)


if __name__ == "__main__":
    unittest.main()

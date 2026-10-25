# SPDX-License-Identifier: MIT OR Apache-2.0
"""Gate 0 source-only tests for the frozen legacy parameter scanner."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
PACKET = ROOT / "docs/helix/04-build/evidence/rust-migration/r6-reviewed-parameters"
CAPTURE_PATH = PACKET / "capture.py"
CAPTURE_SPEC = importlib.util.spec_from_file_location("r6_reviewed_parameter_capture", CAPTURE_PATH)
assert CAPTURE_SPEC is not None and CAPTURE_SPEC.loader is not None
CAPTURE = importlib.util.module_from_spec(CAPTURE_SPEC)
CAPTURE_SPEC.loader.exec_module(CAPTURE)


def expected_outcome(case: dict[str, Any]) -> dict[str, Any]:
    if "spans" in case:
        return {"spans": case["spans"]}
    error = case["error"]
    return {
        "error": {
            "type": error["type"],
            "message": error["message"],
            "cause": None,
            "context": None,
            "suppress_context": False,
        }
    }


class ReviewedParameterScannerPacket(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.report = CAPTURE.capture_report()
        cls.independent = json.loads(
            (PACKET / "independent/cases.json").read_text(encoding="utf-8")
        )
        version = ".".join(cls.report["python"]["version"].split(".")[:2])
        cls.expected_cases = {
            item["id"]: item for item in cls.independent["cases"]
        }
        for item in cls.independent.get("versioned_cases", []):
            cls.expected_cases[item["id"]] = item["expected_by_cpython"][version]

    def test_active_source_matches_frozen_predecessor_and_independent_cases(self) -> None:
        by_id = {item["id"]: item for item in self.report["cases"]}
        expected_cases = self.expected_cases
        self.assertEqual(set(by_id) - set(expected_cases), {
            "python_int_digit_limit_default",
            "python_int_digit_limit_disabled",
        })
        self.assertEqual(set(expected_cases), set(by_id) & set(expected_cases))

        for case_id, frozen_case in by_id.items():
            with self.subTest(case=case_id):
                self.assertEqual(frozen_case["input"], frozen_case["frozen"])
                independent_case = expected_cases.get(case_id)
                if independent_case is not None:
                    expected = expected_outcome(independent_case)
                    actual = {
                        key: value
                        for key, value in frozen_case["input"].items()
                        if key != "sql_codepoints"
                    }
                    if "spans" in expected:
                        self.assertEqual(actual, expected)
                    else:
                        self.assertEqual(actual["error"]["type"], expected["error"]["type"])
                        self.assertEqual(actual["error"]["message"], expected["error"]["message"])

    def test_digit_limit_matches_python_int_oracle(self) -> None:
        by_id = {item["id"]: item for item in self.report["cases"]}
        default = by_id["python_int_digit_limit_default"]
        self.assertEqual(default["input"], default["frozen"])
        self.assertEqual(default["input"]["error"]["type"], "ValueError")
        self.assertIn(
            f"value has {default['int_max_str_digits'] + 1} digits",
            default["input"]["error"]["message"],
        )

        disabled = by_id["python_int_digit_limit_disabled"]
        self.assertEqual(disabled["input"], disabled["frozen"])
        self.assertIn("spans", disabled["input"])
        self.assertEqual(
            len(disabled["input"]["spans"][0][2]),
            by_id["python_int_digit_limit_default"]["int_max_str_digits"] + 1,
        )

    def test_unicode_alnum_classification_is_python_versioned(self) -> None:
        version = ".".join(self.report["python"]["version"].split(".")[:2])
        expected = version == "3.14"
        self.assertEqual(self.report["host_capabilities"]["isalnum_u1c89"], expected)
        case = next(
            item
            for item in self.report["cases"]
            if item["id"] == "unicode_alnum_profile_difference_u1c89"
        )
        actual = {
            key: value for key, value in case["input"].items() if key != "sql_codepoints"
        }
        expected_out = case["independent_expected"]
        if "spans" in expected_out:
            self.assertEqual(actual, expected_out)
        else:
            self.assertEqual(actual["error"]["type"], expected_out["error"]["type"])
            self.assertEqual(actual["error"]["message"], expected_out["error"]["message"])

    def test_packet_source_identity_is_frozen(self) -> None:
        source_hashes = json.loads(
            (PACKET / "source-hashes.json").read_text(encoding="utf-8")
        )
        active_path = ROOT / "python/umf_access/src/umf_access/reviewed.py"
        frozen_path = PACKET / "frozen/reviewed_parameter_scanner.py"
        cases_path = PACKET / "independent/cases.json"
        self.assertEqual(
            hashlib.sha256(active_path.read_bytes()).hexdigest(),
            source_hashes["current_reviewed_py_sha256"],
        )
        self.assertEqual(
            hashlib.sha256(frozen_path.read_bytes()).hexdigest(),
            source_hashes["frozen_scanner_sha256"],
        )
        self.assertEqual(
            hashlib.sha256(cases_path.read_bytes()).hexdigest(),
            source_hashes["independent_cases_sha256"],
        )
        self.assertEqual(
            hashlib.sha256(CAPTURE_PATH.read_bytes()).hexdigest(),
            source_hashes["capture_harness_sha256"],
        )
        self.assertEqual(
            hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            source_hashes["focused_test_sha256"],
        )
        adapter_path = Path(__file__).with_name("test_reviewed_parameter_native_adapter.py")
        self.assertEqual(
            hashlib.sha256(adapter_path.read_bytes()).hexdigest(),
            source_hashes["native_adapter_test_sha256"],
        )
        bridge_path = ROOT / "python/src/umf/rust_reviewed_parameters.py"
        self.assertEqual(
            hashlib.sha256(bridge_path.read_bytes()).hexdigest(),
            source_hashes["public_bridge_sha256"],
        )
        for report_name, hash_key in (
            ("frozen/cpython-3.11.json", "cpython_3_11_report_sha256"),
            ("frozen/cpython-3.14.json", "cpython_3_14_report_sha256"),
        ):
            self.assertEqual(
                hashlib.sha256((PACKET / report_name).read_bytes()).hexdigest(),
                source_hashes[hash_key],
            )


if __name__ == "__main__":
    unittest.main()

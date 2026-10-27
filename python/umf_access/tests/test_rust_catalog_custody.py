# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust projection parity against a frozen Python predecessor packet."""

from __future__ import annotations

import copy
import hashlib
import json
import unittest
from pathlib import Path

from umf_access.build.catalog import CatalogBuildError, _native_column_bindings
from umf_access.rust_catalog_custody import evaluate, profile_version

ROOT = Path(__file__).resolve().parents[3]
PACKET = ROOT / "python/umf_access/tests/fixtures/rust-catalog-custody/predecessor.json"
MESSAGES_TO_CODES = {
    "related reads require one identical original native binding": "RELATED_READ_CUSTODY",
    "bounded original native ColumnSet sources required": "COLUMN_SET_BOUND",
    "native columns require an original binding source": "ORIGINAL_BINDING_SHAPE",
    "native binding source must be UTF-8": "ORIGINAL_BINDING_UTF8",
    "native binding source digest differs": "ORIGINAL_BINDING_DIGEST",
}


class RustCatalogCustodyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.packet = json.loads(PACKET.read_text(encoding="utf-8"))

    def test_packet_pins_unchanged_python_source(self) -> None:
        source = ROOT / "python/umf_access/src/umf_access/build/catalog.py"
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), self.packet["sourceSha256"])

    def test_rust_matches_frozen_python_predecessor_packet(self) -> None:
        self.assertEqual(profile_version(), "umf-access-catalog-custody/0.1.0")
        for case in self.packet["cases"]:
            with self.subTest(case=case["name"]):
                value = copy.deepcopy(case["input"])
                before = copy.deepcopy(value)
                try:
                    expected = {"status": "returned", "bindings": list(_native_column_bindings(value))}
                except CatalogBuildError as error:
                    expected = {"status": "refused", "message": str(error)}
                self.assertEqual(expected, case["expected"])
                native = evaluate(value)
                if expected["status"] == "returned":
                    self.assertEqual(native, {"outcome": "returned", "bindings": expected["bindings"]})
                else:
                    self.assertEqual(
                        native,
                        {
                            "outcome": "refused",
                            "code": MESSAGES_TO_CODES[expected["message"]],
                            "message": expected["message"],
                        },
                    )
                self.assertEqual(value, before)

    def test_default_catalog_function_remains_python_owned(self) -> None:
        source = (ROOT / "python/umf_access/src/umf_access/build/catalog.py").read_text()
        self.assertNotIn("rust_catalog_custody", source)
        self.assertNotIn("access_native_column_bindings", source)

    def test_non_json_custom_equality_is_rejected_without_callback(self) -> None:
        called = False

        class EqualityTrap:
            def __eq__(self, other: object) -> bool:
                nonlocal called
                called = True
                raise AssertionError("custom equality must not run")

        value = copy.deepcopy(self.packet["cases"][3]["input"])
        value["source"]["binding"]["x"] = EqualityTrap()
        value["target"]["binding"]["x"] = EqualityTrap()
        with self.assertRaises(ValueError):
            evaluate(value)
        self.assertFalse(called)

    def test_non_dict_top_level_target_fails_closed(self) -> None:
        # The predecessor starts with target.get(...); non-dicts raise there.
        # The opt-in Rust profile defines its supported top-level domain as dict.
        with self.assertRaisesRegex(ValueError, "native catalog target must be an exact dict"):
            evaluate([])

    def test_nonfinite_related_equality_is_explicitly_refused(self) -> None:
        packet = self.packet["cases"][3]["input"]
        value = copy.deepcopy(packet)
        value["source"]["binding"]["x"] = float("nan")
        value["target"]["binding"]["x"] = float("nan")
        result = evaluate(value)
        self.assertEqual(result["outcome"], "refused")
        self.assertEqual(result["code"], "NONFINITE_EQUALITY_UNSUPPORTED")


if __name__ == "__main__":
    unittest.main()

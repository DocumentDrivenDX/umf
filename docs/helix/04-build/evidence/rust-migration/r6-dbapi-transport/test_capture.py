# SPDX-License-Identifier: MIT OR Apache-2.0
"""Reproduce the hand-authored legacy DB-API source predecessor packet."""
from __future__ import annotations

import hashlib
import json
import sys
import unittest
from pathlib import Path

import capture

PACKET = Path(__file__).resolve().parent


class LegacyDbapiTransportPacket(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = capture.report()
        cls.by_id = {case["id"]: case for case in cls.report["cases"]}

    def test_checked_in_versioned_capture_reproduces_exactly(self):
        version = f"{sys.version_info.major}.{sys.version_info.minor}"
        self.assertIn(version, {"3.11", "3.14"})
        expected = (PACKET / f"cpython-{version}.json").read_text(encoding="utf-8")
        actual = json.dumps(self.report, ensure_ascii=True, sort_keys=True, indent=2) + "\n"
        self.assertEqual(actual, expected)
        self.assertEqual(self.report["implementation"], "cpython")
        self.assertEqual(
            hashlib.sha256(capture.SOURCE.read_bytes()).hexdigest(),
            self.report["reviewed_py_sha256"],
        )
        hashes = json.loads((PACKET / "source-hashes.json").read_text(encoding="utf-8"))
        paths = {
            "current_reviewed_py_sha256": capture.SOURCE,
            "capture_harness_sha256": PACKET / "capture.py",
            "cases_sha256": PACKET / "cases.json",
            "focused_test_sha256": Path(__file__),
            "cpython_3_11_report_sha256": PACKET / "cpython-3.11.json",
            "cpython_3_14_report_sha256": PACKET / "cpython-3.14.json",
        }
        for key, path in paths.items():
            with self.subTest(hash=key):
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), hashes[key])

    def test_percent_rewrite_slots_and_codepoint_spans(self):
        first = self.by_id["percent-comments-literals-and-ordered-slots"]
        self.assertEqual(first["dbapi_sql"], "SELECT %s, '$3', -- $4 %%\n%s, 50%% /* $5 %% */")
        self.assertEqual(first["dbapi_order"], ["second", "first"])
        repeated = self.by_id["repeated-and-high-ordinal-slots"]
        self.assertEqual(repeated["dbapi_order"], ["zero", "zero", "two"])
        self.assertEqual(self.by_id["unicode-codepoint-span"]["positions"], [[7, 9, 1]])
        self.assertEqual(self.by_id["lone-surrogate-indexing"]["positions"], [[2, 4, 0]])
        self.assertEqual(self.by_id["explicit-surrogate-pair-indexing"]["positions"], [[3, 5, 0]])

    def test_versioned_unicode_subclass_and_refusal_order(self):
        unicode_case = self.by_id["unicode-e-prefix-classification"]
        if sys.version_info.minor == 11:
            self.assertEqual(unicode_case["positions"], [[15, 17, 1]])
        else:
            self.assertEqual(unicode_case["positions_error"]["message"], "unterminated compiler SQL quote")
        subclass = self.by_id["str-subclass-overrides-startswith"]
        self.assertEqual(subclass["sql_type"], "StartsComment")
        self.assertEqual(subclass["positions"], [])
        refusal = self.by_id["lexical-refusal-precedes-order-inventory-check"]
        self.assertEqual(refusal["order_error"]["message"], "unterminated compiler SQL comment")
        self.assertEqual(
            self.by_id["ordinal-outside-order-inventory"]["order_error"]["message"],
            "compiler parameter ordinal outside inventory",
        )
        self.assertEqual(self.by_id["python-int-limit-before-later-lexical-refusal"]["positions_error"]["type"], "ValueError")

    def test_sealed_transport_gate_and_legacy_fallback_shape(self):
        self.assertEqual(self.report["transport_seal"], {"sealed_transport": True, "legacy_without_transport": False})
        self.assertEqual(
            self.report["build_transport_gate"],
            {"sealed_predicate_precedes_rebuild": True, "rebuild_guard_calls_dbapi_and_order": True},
        )


if __name__ == "__main__":
    unittest.main()

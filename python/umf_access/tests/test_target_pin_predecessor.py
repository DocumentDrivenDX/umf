"""Freshness and direct behavior checks for the frozen TargetPin packet."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACKET = ROOT / "docs/helix/04-build/evidence/rust-migration/target-pin-python-predecessor-20261028/packet.json"
HISTORICAL_SOURCE_SHA256 = "188e816ccad9ed609c1382ea8090471a5ed1266f412742e69b7800d32ed455ec"


class TargetPinPredecessorTests(unittest.TestCase):
    def test_packet_preserves_historical_capture(self):
        packet = json.loads(PACKET.read_text())
        self.assertEqual(packet["format"], "umf-target-pin-python-predecessor/1")
        self.assertEqual(packet["source"], "python/umf_access/src/umf_access/catalog.py")
        self.assertEqual(packet["source_sha256"], HISTORICAL_SOURCE_SHA256)
        self.assertEqual(packet["case_count"], len(packet["cases"]))
        self.assertEqual(packet["pass_count"], packet["case_count"])
        self.assertEqual(packet["mismatch_count"], 0)
        cases = {case["name"]: case for case in packet["cases"]}
        self.assertTrue(cases["exact-identity"]["expected"])
        self.assertTrue(
            cases["duplicate-observed-name-misses-other-pinned-name"]["expected"]
        )
        self.assertFalse(cases["duplicate-observed-name-bad-version"]["expected"])


if __name__ == "__main__":
    unittest.main()

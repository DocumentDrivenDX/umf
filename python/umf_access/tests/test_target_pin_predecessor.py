"""Freshness and direct behavior checks for the frozen TargetPin packet."""

from __future__ import annotations

import hashlib
import json
import runpy
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts/rust-migration/capture_target_pin_predecessor.py"
PACKET = ROOT / "docs/helix/04-build/evidence/rust-migration/target-pin-python-predecessor-20261028/packet.json"


class TargetPinPredecessorTests(unittest.TestCase):
    def test_packet_is_fresh_and_matches_direct_python_behavior(self):
        packet = json.loads(PACKET.read_text())
        source = ROOT / packet["source"]
        self.assertEqual(packet["source_sha256"], hashlib.sha256(source.read_bytes()).hexdigest())
        self.assertEqual(packet["case_count"], len(packet["cases"]))
        self.assertEqual(packet["pass_count"], packet["case_count"])
        self.assertEqual(packet["mismatch_count"], 0)

        namespace = runpy.run_path(str(SCRIPT))
        pin = namespace["PIN"]
        identity_type = namespace["TargetIdentity"]
        for case in packet["cases"]:
            with self.subTest(case=case["name"]):
                identity = identity_type(**case["identity"])
                self.assertIs(pin.matches(identity), case["expected"])


if __name__ == "__main__":
    unittest.main()

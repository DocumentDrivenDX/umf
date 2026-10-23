#!/usr/bin/env python3
"""Unit controls for preserving extension identity in capture parity checks."""
import importlib.util
import unittest
from pathlib import Path

CAPTURE_PATH = Path(__file__).with_name("capture.py")
SPEC = importlib.util.spec_from_file_location("r6_capture", CAPTURE_PATH)
CAPTURE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CAPTURE)


def report(version, identity_marker=...):
    runtime = {"implementation": "cpython", "version": version}
    if identity_marker is not ...:
        runtime["loadedRustExtension"] = identity_marker
    return {"runtime": runtime, "semantic": {"slot": "stable"}}


class CaptureParity(unittest.TestCase):
    def test_matching_binary_identity_survives_version_normalization(self):
        identity = {"path": "/same/_rust_core.abi3.so", "sha256": "a" * 64}
        self.assertTrue(CAPTURE.compare_report_parity([report([3, 11], identity), report([3, 14], identity)]))

    def test_different_binary_hash_refuses_parity(self):
        left = {"path": "/same/_rust_core.abi3.so", "sha256": "a" * 64}
        right = {"path": "/same/_rust_core.abi3.so", "sha256": "b" * 64}
        with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
            CAPTURE.compare_report_parity([report([3, 11], left), report([3, 14], right)])

    def test_different_binary_path_refuses_parity(self):
        left = {"path": "/one/_rust_core.abi3.so", "sha256": "a" * 64}
        right = {"path": "/two/_rust_core.abi3.so", "sha256": "a" * 64}
        with self.assertRaisesRegex(ValueError, "path or SHA-256 differs"):
            CAPTURE.compare_report_parity([report([3, 11], left), report([3, 14], right)])

    def test_historical_reports_remain_explicitly_unbound(self):
        self.assertFalse(CAPTURE.compare_report_parity([report([3, 11]), report([3, 14])]))
        self.assertFalse(CAPTURE.compare_report_parity([report([3, 11], None), report([3, 14])]))

    def test_mixed_bound_and_historical_reports_refuse_parity(self):
        identity = {"path": "/same/_rust_core.abi3.so", "sha256": "a" * 64}
        with self.assertRaisesRegex(ValueError, "whether the Rust extension is bound"):
            CAPTURE.compare_report_parity([report([3, 11], identity), report([3, 14])])

    def test_malformed_binary_identity_refuses_parity(self):
        for invalid in ({"path": "/x"}, {"path": "/x", "sha256": "bad"}, {"path": "", "sha256": "a" * 64}):
            with self.subTest(identity=invalid), self.assertRaisesRegex(ValueError, "malformed loaded Rust extension identity"):
                CAPTURE.compare_report_parity([report([3, 11], invalid), report([3, 14], invalid)])


if __name__ == "__main__":
    unittest.main()

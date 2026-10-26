from __future__ import annotations

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import prepare_rust_pair_release as custody


class RustPairCustodyTests(unittest.TestCase):
    def test_manifest_binds_exact_workflow_run_and_aggregate(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            temporary = Path(raw)
            workflow = ROOT / ".github/workflows/python-coordinated-release.yml"
            aggregate = temporary / "matrix.json"
            aggregate.write_text("aggregate receipt bytes\n")
            base = {
                "schema": "umf.python-coordinated-release-preparation/1",
                "sourceRevision": "a" * 40,
                "runId": "1234",
                "artifacts": {"umf_core-0.11.0.tar.gz": {"sha256": "b" * 64}},
            }
            with patch.object(custody.pair, "prepare", return_value=base):
                result = custody.prepare(
                    temporary,
                    aggregate,
                    ROOT,
                    "a" * 40,
                    "1234",
                    "1",
                    "org/umf/.github/workflows/python-coordinated-release.yml@refs/heads/main",
                    "org/umf",
                )

            self.assertEqual(result["schema"], "umf.rust-port-pair-custody/1")
            self.assertFalse(result["publishing"])
            self.assertTrue(result["workflowOnMain"])
            self.assertFalse(result["releaseEligible"])
            self.assertEqual(result["runAttempt"], 1)
            self.assertEqual(
                result["qualification"]["workflowSha256"],
                hashlib.sha256(workflow.read_bytes()).hexdigest(),
            )
            self.assertEqual(
                result["qualification"]["aggregateReceiptSha256"],
                hashlib.sha256(aggregate.read_bytes()).hexdigest(),
            )

    def test_manifest_rejects_unbound_execution_context(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            temporary = Path(raw)
            aggregate = temporary / "matrix.json"
            aggregate.write_text("receipt")
            cases = (
                ("0", "1", "org/umf/.github/workflows/python-coordinated-release.yml@refs/heads/main"),
                ("123", "0", "org/umf/.github/workflows/python-coordinated-release.yml@refs/heads/main"),
                ("123", "2", "org/umf/.github/workflows/python-coordinated-release.yml@refs/heads/main"),
                ("123", "1", "org/umf/.github/workflows/other.yml@refs/heads/main"),
                ("123", "1", "attacker/umf/.github/workflows/python-coordinated-release.yml@refs/heads/main"),
            )
            for run_id, attempt, workflow_ref in cases:
                with self.subTest(run_id=run_id, attempt=attempt, workflow_ref=workflow_ref):
                    with patch.object(
                        custody.pair,
                        "prepare",
                        return_value={"sourceRevision": "a" * 40, "runId": run_id},
                    ):
                        with self.assertRaises(ValueError):
                            custody.prepare(
                                temporary,
                                aggregate,
                                ROOT,
                                "a" * 40,
                                run_id,
                                attempt,
                                workflow_ref,
                                "org/umf",
                            )

    def test_workflow_keeps_read_only_nonpublishing_custody_gate(self) -> None:
        workflow = (ROOT / ".github/workflows/python-coordinated-release.yml").read_text()
        self.assertIn("permissions:\n  contents: read", workflow)
        self.assertIn("prepare_rust_pair_release.py", workflow)
        self.assertIn("umf-rust-pair-custody.json", workflow)
        self.assertIn("github.run_attempt != 1", workflow)
        self.assertNotIn("pypa/gh-action-pypi-publish", workflow)
        self.assertNotIn("id-token: write", workflow)

    def test_manifest_rejects_verifier_from_another_checkout(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            other_checkout = Path(raw)
            (other_checkout / ".github/workflows").mkdir(parents=True)
            (other_checkout / ".github/workflows/python-coordinated-release.yml").write_text("workflow")
            (other_checkout / "tools").mkdir()
            aggregate = other_checkout / "matrix.json"
            aggregate.write_text("receipt")
            with patch.object(
                custody.pair,
                "prepare",
                return_value={"sourceRevision": "a" * 40, "runId": "123"},
            ):
                with self.assertRaisesRegex(ValueError, "outside the source repository"):
                    custody.prepare(
                        other_checkout,
                        aggregate,
                        other_checkout,
                        "a" * 40,
                        "123",
                        "1",
                        "org/umf/.github/workflows/python-coordinated-release.yml@refs/heads/main",
                        "org/umf",
                    )


if __name__ == "__main__":
    unittest.main()

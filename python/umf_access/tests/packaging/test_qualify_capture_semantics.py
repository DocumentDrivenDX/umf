# SPDX-License-Identifier: MIT OR Apache-2.0

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import qualify_installed_artifact as installed_gate

MODULE_PATH = Path(__file__).with_name("qualify_capture_semantics.py")
SPEC = importlib.util.spec_from_file_location("capture_qualification", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
QUALIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(QUALIFIER)


class CaptureQualificationControls(unittest.TestCase):
    def test_comparator_accepts_exact_predecessor_match(self):
        QUALIFIER.compare({"status": "pass", "value": []}, {"status": "pass", "value": []})

    def test_comparator_rejects_changed_public_capture_value(self):
        with self.assertRaisesRegex(ValueError, "differs"):
            QUALIFIER.compare(
                {"status": "pass", "value": ["expected"]},
                {"status": "pass", "value": ["changed"]},
            )

    def test_source_digest_guard_rejects_changed_predecessor(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "capture.py"
            path.write_text("def capture(_): return None\n")
            with self.assertRaisesRegex(ValueError, "digest mismatch"):
                QUALIFIER.load_predecessor(path)

    def test_installed_receipt_binds_passing_cohort_wheel_and_source_closure(self):
        receipt = {
            "schema": "umf.access-installed-artifact-qualification/1",
            "status": "passed",
            "cohort": "macos-arm64-cpython-314-local",
            "wheelSha256": "a" * 64,
            "wheelMembers": {"umf_access/capture.py": "d" * 64},
            "profileEvidence": {"receiptCohortMatchesLocalEvidence": True},
            "sourceClosure": {"source-revision:git-head": "b" * 40},
        }
        QUALIFIER.validate_installed_artifact_receipt(
            receipt, wheel_sha256="a" * 64, cohort="macos-arm64-cpython-314-local"
        )

    def test_installed_receipt_rejects_status_cohort_digest_or_missing_closure(self):
        receipt = {
            "schema": "umf.access-installed-artifact-qualification/1",
            "status": "passed",
            "cohort": "macos-arm64-cpython-314-local",
            "wheelSha256": "a" * 64,
            "wheelMembers": {"umf_access/capture.py": "d" * 64},
            "profileEvidence": {"receiptCohortMatchesLocalEvidence": True},
            "sourceClosure": {"source-revision:git-head": "b" * 40},
        }
        for field, replacement, error in (
            ("schema", "other", "schema mismatch"),
            ("status", "refused", "did not pass"),
            ("cohort", "linux-x86_64-cpython-314", "cohort mismatch"),
            ("wheelSha256", "c" * 64, "digest mismatch"),
            ("profileEvidence", {}, "does not match local evidence scope"),
            ("sourceClosure", {}, "source closure is unavailable"),
            ("wheelMembers", {}, "lacks the capture wheel member hash"),
        ):
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, error):
                QUALIFIER.validate_installed_artifact_receipt(
                    {**receipt, field: replacement},
                    wheel_sha256="a" * 64,
                    cohort="macos-arm64-cpython-314-local",
                )

    def test_installed_receipt_requires_full_source_revision_identity(self):
        receipt = {
            "schema": "umf.access-installed-artifact-qualification/1",
            "status": "passed",
            "cohort": "macos-arm64-cpython-314-local",
            "wheelSha256": "a" * 64,
            "wheelMembers": {"umf_access/capture.py": "d" * 64},
            "profileEvidence": {"receiptCohortMatchesLocalEvidence": True},
            "sourceClosure": {"source-revision:git-head": "b" * 40},
        }
        for revision in ("b" * 39, "g" * 40, ""):
            with self.subTest(revision=revision), self.assertRaisesRegex(
                ValueError, "source closure is unavailable"
            ):
                QUALIFIER.validate_installed_artifact_receipt(
                    {**receipt, "sourceClosure": {"source-revision:git-head": revision}},
                    wheel_sha256="a" * 64,
                    cohort="macos-arm64-cpython-314-local",
                )

    def test_bounded_semantic_case_census_is_explicit(self):
        self.assertEqual(
            set(QUALIFIER.declarations()),
            {"direct", "filtered", "optional", "refusal", "projected", "compound"},
        )

    def test_capture_origin_must_be_inside_installed_distribution(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            package = root / "site-packages/umf_access"
            package.mkdir(parents=True)
            module = package / "capture.py"
            module.write_text("# installed capture\n")
            module_hash = QUALIFIER.sha(module)
            QUALIFIER.validate_capture_origin(module, package.parent, module_hash)
            outside = root / "checkout/umf_access/capture.py"
            outside.parent.mkdir(parents=True)
            outside.write_text("# source shadow\n")
            with self.assertRaisesRegex(ValueError, "not the installed capture wheel member"):
                QUALIFIER.validate_capture_origin(outside, package.parent, QUALIFIER.sha(outside))
            with self.assertRaisesRegex(ValueError, "differs from artifact receipt"):
                QUALIFIER.validate_capture_origin(module, package.parent, "0" * 64)

    def test_capture_origin_rejects_sibling_inside_installed_package(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory) / "site-packages/umf_access"
            package.mkdir(parents=True)
            sibling = package / "capture.pyc"
            sibling.write_bytes(b"sibling")
            with self.assertRaisesRegex(ValueError, "not the installed capture wheel member"):
                QUALIFIER.validate_capture_origin(
                    sibling, package.parent, QUALIFIER.sha(sibling)
                )

    def test_source_closure_rejects_dirty_selected_checkout(self):
        root = MODULE_PATH.parents[4]
        responses = [
            subprocess.CompletedProcess([], 0, f"{root}\n", ""),
            subprocess.CompletedProcess([], 0, " M python/umf_access/src/umf_access/capture.py\n", ""),
        ]
        with patch.object(installed_gate.subprocess, "run", side_effect=responses), self.assertRaisesRegex(ValueError, "selected source checkout is dirty"):
                installed_gate.source_closure(
                    root / "python/umf_access", root / "python/umf_access/compatibility-profile-dev7-local-candidate.json"
                )


if __name__ == "__main__":
    unittest.main()

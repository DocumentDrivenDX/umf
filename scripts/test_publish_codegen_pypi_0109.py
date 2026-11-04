from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from email.message import Message
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish_codegen_pypi_0109 as publisher

ADMISSION = Path(__file__).resolve().parents[1] / ".github/release-admissions/umf-codegen-0.10.9.json"
WORKFLOW = Path(__file__).resolve().parents[1] / ".github/workflows/publish-codegen-pypi.yml"


class Codegen109PublisherControls(unittest.TestCase):
    def setUp(self):
        self.raw = ADMISSION.read_bytes()
        self.admission = json.loads(self.raw)
        self.pin = hashlib.sha256(self.raw).hexdigest()

    def test_reviewed_shape_accepts_exact_0109_admission(self):
        value = publisher.admission_identity(self.raw, self.pin)
        self.assertEqual(value["tag"], "umf-v0.10.9")
        self.assertEqual(value["version"], "0.10.9")
        self.assertEqual(set(value["files"]), {
            "umf_codegen-0.10.9-py3-none-any.whl", "umf_codegen-0.10.9.tar.gz"})

    def test_changed_admission_digest_is_rejected(self):
        with self.assertRaises(ValueError):
            publisher.admission_identity(self.raw, "f" * 64)

    def test_unreviewed_or_legacy_version_is_rejected(self):
        for key, value in (("schema", "umf.codegen-publication-admission/1"),
                           ("tag", "umf-v0.10.8"), ("version", "0.10.8")):
            changed = dict(self.admission)
            changed[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                publisher.admission_identity(json.dumps(changed).encode(), hashlib.sha256(json.dumps(changed).encode()).hexdigest())

    def test_extra_admission_field_is_rejected(self):
        changed = dict(self.admission)
        changed["fallback"] = True
        raw = json.dumps(changed).encode()
        with self.assertRaises(ValueError):
            publisher.admission_identity(raw, hashlib.sha256(raw).hexdigest())

    def test_invalid_tracked_receipt_path_is_rejected(self):
        changed = json.loads(self.raw)
        changed["local_qualification"]["freeze"]["path"] = "../outside.json"
        raw = json.dumps(changed).encode()
        with self.assertRaises(ValueError):
            publisher.admission_identity(raw, hashlib.sha256(raw).hexdigest())

    def test_core_archive_roster_is_exact(self):
        changed = json.loads(self.raw)
        changed["core"]["files"].pop("umf_core-0.10.9.tar.gz")
        raw = json.dumps(changed).encode()
        with self.assertRaises(ValueError):
            publisher.admission_identity(raw, hashlib.sha256(raw).hexdigest())

    def test_release_pins_use_core_stage_shape_and_bind_exact_core_files(self):
        pins = {"tag": "umf-v0.10.9", "commit": self.admission["source_sha"],
            "distribution": "umf-core", "version": "0.10.9", "sdk": "0.10.9",
            "umf_core": "0.10.9", "files": self.admission["core"]["files"]}
        publisher.validate_release_pins(pins, self.admission)
        wrong = dict(pins, files={})
        with self.assertRaises(ValueError):
            publisher.validate_release_pins(wrong, self.admission)

    def test_metadata_requires_the_exact_paired_core(self):
        for dependency in ("umf-core==0.10.9", "umf-core>=0.10.9", "umf-core==0.10.8"):
            msg = Message()
            msg["Name"] = "umf-codegen"
            msg["Version"] = "0.10.9"
            msg["Requires-Python"] = ">=3.11, <3.15"
            msg["Requires-Dist"] = dependency
            raw = msg.as_bytes()
            if dependency == "umf-core==0.10.9":
                publisher.package_metadata(raw)
            else:
                with self.subTest(dependency=dependency), self.assertRaises(ValueError):
                    publisher.package_metadata(raw)

    def test_installed_pair_fields_are_read_from_actual_nested_receipt(self):
        core_files = self.admission["core"]["files"]
        mac_wheel = next(name for name in core_files if name.endswith("macosx_11_0_arm64.whl"))
        receipt = {
            "installedPairSmoke": {
                "result": {"status": "passed", "version": "0.10.9", "codegenResources": 10},
                "runtimeCoreAndCodegenSameResults": True, "keyedAndUnkeyedCases": 2, "resourceCount": 10,
            },
            "core": {
                "wheelBuiltOnceFromExtractedSdist": {"sha256": core_files[mac_wheel]},
                "sdist": {"sha256": core_files["umf_core-0.10.9.tar.gz"]},
            },
        }
        publisher.validate_installed_pair_receipt(receipt, self.admission)

    def test_top_level_copied_installed_pair_claims_are_rejected(self):
        core_files = self.admission["core"]["files"]
        mac_wheel = next(name for name in core_files if name.endswith("macosx_11_0_arm64.whl"))
        receipt = {
            "installedPairSmoke": {
                "result": {"status": "passed", "version": "0.10.9", "codegenResources": 10},
            },
            "runtimeCoreAndCodegenSameResults": True, "keyedAndUnkeyedCases": 2, "resourceCount": 10,
            "core": {
                "wheelBuiltOnceFromExtractedSdist": {"sha256": core_files[mac_wheel]},
                "sdist": {"sha256": core_files["umf_core-0.10.9.tar.gz"]},
            },
        }
        with self.assertRaises(ValueError):
            publisher.validate_installed_pair_receipt(receipt, self.admission)

    def test_release_must_be_published_and_immutable(self):
        release = {"tag_name": "umf-v0.10.9", "draft": False, "prerelease": False, "immutable": True}
        publisher.verify_release_state(release)
        for key, value in (("draft", True), ("prerelease", True), ("immutable", False)):
            changed = dict(release)
            changed[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                publisher.verify_release_state(changed)

    def test_publish_preflight_rejects_a_sums_pin_outside_admission(self):
        with self.assertRaises(ValueError):
            publisher.check_prepared_artifact(Path("/does-not-need-to-exist"), self.admission,
                self.pin, "f" * 64, "umf-v0.10.9", self.admission["source_sha"])

    def test_each_mac_receipt_binds_both_codegen_archives(self):
        receipt = {"profile": "umf.macos-python-release-build/1", "status": "passed", "version": "0.10.9",
            "sourceRoot": "/frozen/source", "codegen": {
                "wheel": {"sha256": self.admission["files"]["umf_codegen-0.10.9-py3-none-any.whl"]},
                "sdist": {"sha256": self.admission["files"]["umf_codegen-0.10.9.tar.gz"]}}}
        freeze = {"sourceRoot": "/frozen/source"}
        publisher.validate_mac_codegen_receipt(receipt, "sourceInventory", freeze, self.admission)
        wrong = json.loads(json.dumps(receipt))
        wrong["codegen"]["sdist"]["sha256"] = "f" * 64
        with self.assertRaises(ValueError):
            publisher.validate_mac_codegen_receipt(wrong, "sourceInventory", freeze, self.admission)

    def test_duplicate_distribution_metadata_is_rejected(self):
        msg = Message()
        msg["Name"] = "umf-codegen"
        msg["Name"] = "umf-codegen"
        msg["Version"] = "0.10.9"
        msg["Requires-Python"] = ">=3.11, <3.15"
        msg["Requires-Dist"] = "umf-core==0.10.9"
        with self.assertRaises(ValueError):
            publisher.package_metadata(msg.as_bytes())

    def test_pure_codegen_archive_rejects_native_and_noncanonical_paths(self):
        for member in ("umf_codegen/module.so", "umf_codegen/../escape.py"):
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "malicious.whl"
                with zipfile.ZipFile(path, "w") as archive:
                    archive.writestr(member, b"bad")
                with self.subTest(member=member), self.assertRaises(ValueError):
                    publisher.inspect_archive(path, wheel=True)

    def test_workflow_keeps_0108_route_and_requires_local_qualification_for_0109(self):
        text = WORKFLOW.read_text()
        self.assertIn("locally_qualified:\n        description:", text)
        self.assertIn("default: false", text)
        self.assertIn("inputs.tag == 'umf-v0.10.8'", text)
        self.assertIn("inputs.tag != 'umf-v0.10.8'", text)
        self.assertIn('test "$LOCALLY_QUALIFIED" = true', text)
        self.assertIn("inputs.locally_qualified == true", text)
        self.assertIn("\n  publish-0109:", text)


if __name__ == "__main__":
    unittest.main()

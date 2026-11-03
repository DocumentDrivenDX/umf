"""Pure transport/source/wiring controls; never execute a native CLI."""
import base64
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("cli_intake", ROOT / "tools/temporal_cli_intake.py")
intake = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(intake)
PINS = {"wheel": "0eb762d4f95c6f29ae97c02d8859bbe65a3f9124579e5d48e42fefbf7458f603",
        "cli": "baf21fe9806dd08a468b7a1986c5b188be9bfb19238776ca54043e315d5569cc"}


class CliIntakeControls(unittest.TestCase):
    def carrier(self):
        return {"id": 101, "tag_name": intake.CARRIER_TAG, "name": intake.CARRIER_TAG,
                "target_commitish": intake.SOURCE, "draft": True, "published_at": None,
                "assets": [{"id": 201, "name": intake.MAC_WHEEL, "state": "uploaded",
                            "size": 30278759, "digest": "sha256:" + PINS["wheel"]},
                           {"id": 202, "name": intake.MAC_MANIFEST, "state": "uploaded",
                            "size": intake.MAC_MANIFEST_BYTES, "digest": "sha256:" + intake.MAC_MANIFEST_SHA}]}

    def test_draft_exact_source_roster_and_asset_pins(self):
        self.assertEqual(set(intake.validate_carrier(self.carrier(), PINS["wheel"])),
                         {intake.MAC_WHEEL, intake.MAC_MANIFEST})
        for mutate in [lambda d: d.update(draft=False), lambda d: d.update(published_at="now"),
                       lambda d: d.update(target_commitish="f" * 40), lambda d: d.update(tag_name="umf-v0.10.8"),
                       lambda d: d["assets"].append(d["assets"][0]),
                       lambda d: d["assets"][1].update(id=201), lambda d: d["assets"][0].update(id=True),
                       lambda d: d["assets"][0].update(size=1), lambda d: d["assets"][0].update(digest="sha256:" + "f" * 64),
                       lambda d: d["assets"][0].update(state="new")]:
            d = self.carrier()
            mutate(d)
            with self.assertRaises(ValueError): intake.validate_carrier(d, PINS["wheel"])

    def manifest(self, root):
        (root / "input").write_bytes(b"source fixture")
        attestation = {"sourceCommit": intake.SOURCE, "sourceTree": intake.SOURCE_TREE, "sharedAttempt": 490,
            "target": "aarch64-apple-darwin", "invocationUUID": "69192e93-ca17-4a5e-9e4e-eac7778fa244",
            "archives": [{"path": intake.MAC_WHEEL, "sha256": PINS["wheel"], "sourceCommit": intake.SOURCE, "tree": intake.SOURCE_TREE}],
            "sourceInputHashes": {"input": hashlib.sha256(b"source fixture").hexdigest()}}
        proofs = {}
        for name in ["artifact-build-attestation.json", "completed-artifacts.json", "installed-component-receipt.json", "attempt490-receipt.json"]:
            raw = json.dumps(attestation if name.startswith("artifact-build") else {}).encode()
            proofs[name] = {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "bytesBase64": base64.b64encode(raw).decode()}
        return {"profile": "umf.packaged-cli-transport-material/1", "unqualifiedTransportOnly": True,
            "sourceCommit": intake.SOURCE, "sourceTree": intake.SOURCE_TREE, "distribution": "umf-core", "version": "0.10.8",
            "platform": "macos-arm64", "wheel": {"filename": intake.MAC_WHEEL, "bytes": 30278759, "sha256": PINS["wheel"]},
            "embeddedCLI": {"member": "umf/_bin/umf", "bytes": 48831080, "sha256": PINS["cli"]},
            "nativeExtension": {"member": "umf/_rust_core.abi3.so", "bytes": 49074784,
                "sha256": "91e9686341be07a597e44fbad9ba07e5f8a7e57c5f930adc4fe66ea1d66cc0df"},
            "originalProducerProofs": proofs, "scope": "Synthetic metadata fixture, no native qualification"}

    def validate_fixture(self, value, root):
        raw = json.dumps(value).encode()
        with patch.object(intake, "MAC_MANIFEST_SHA", hashlib.sha256(raw).hexdigest()), \
                patch.object(intake, "MAC_MANIFEST_BYTES", len(raw)):
            intake.validate_material_manifest(raw, root, PINS)

    def test_closed_manifest_preserves_original_proof_hashes_and_source_inputs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            original = self.manifest(root)
            self.validate_fixture(original, root)
            for mutate in [lambda d: d.update(extra=True), lambda d: d.update(version="0.10.9"),
                           lambda d: d.update(unqualifiedTransportOnly=False),
                           lambda d: d["embeddedCLI"].update(sha256="f" * 64),
                           lambda d: d["originalProducerProofs"].pop("attempt490-receipt.json"),
                           lambda d: d["originalProducerProofs"]["artifact-build-attestation.json"].update(sha256="f" * 64)]:
                d = copy.deepcopy(original)
                mutate(d)
                with self.assertRaises(ValueError): self.validate_fixture(d, root)
            (root / "input").write_bytes(b"changed")
            with self.assertRaises(ValueError): self.validate_fixture(original, root)

    def test_real_manifest_digest_is_not_caller_selectable(self):
        with tempfile.TemporaryDirectory() as temp, self.assertRaises(ValueError):
            intake.validate_material_manifest(b"{}", Path(temp), PINS)

    def test_controller_boundary_remains_closed(self):
        intake.validate_controller_paths(set(intake.prior.APPROVED) | intake.ADDITIONAL_PATHS)
        for path in ["Cargo.lock", "crates/umf-core/src/resources.rs", "python/pyproject.toml", "src/index-node-v4.ts"]:
            with self.assertRaises(ValueError): intake.validate_controller_paths(set(intake.prior.APPROVED) | {path})

    def response(self, data):
        r = io.BytesIO(data)
        r.status = 200
        return r

    def test_direct_download_requires_exact_hash_and_size(self):
        for payload, digest, size, ok in [(b"abc", hashlib.sha256(b"abc").hexdigest(), 3, True),
                                          (b"abcd", hashlib.sha256(b"abcd").hexdigest(), 3, False),
                                          (b"abc", "f" * 64, 3, False)]:
            with tempfile.TemporaryDirectory() as temp:
                opener = Mock()
                opener.open.return_value = self.response(payload)
                with patch.object(intake.urllib.request, "build_opener", return_value=opener):
                    if ok:
                        intake.download_asset(Path(temp) / "asset", {"id": 1, "size": size, "digest": "sha256:" + digest}, "test-token")
                    else:
                        with self.assertRaises(ValueError):
                            intake.download_asset(Path(temp) / "asset", {"id": 1, "size": size, "digest": "sha256:" + digest}, "test-token")

    def test_redirect_does_not_forward_github_authorization(self):
        for location, ok in [("https://objects.githubusercontent.com/material", True), ("http://objects.example/material", False)]:
            with tempfile.TemporaryDirectory() as temp:
                opener = Mock()
                opener.open.side_effect = urllib.error.HTTPError("api", 302, "redirect", {"Location": location}, None)
                with patch.object(intake.urllib.request, "build_opener", return_value=opener), \
                        patch.object(intake.urllib.request, "urlopen", return_value=self.response(b"abc")) as download:
                    if ok:
                        intake.download_asset(Path(temp) / "asset", {"id": 1, "size": 3, "digest": "sha256:" + hashlib.sha256(b"abc").hexdigest()}, "test-token")
                        self.assertEqual(download.call_args.args, (location,))
                        self.assertEqual(set(download.call_args.kwargs), {"timeout"})
                    else:
                        with self.assertRaises(ValueError): intake.download_asset(Path(temp) / "asset", {"id": 1, "size": 3}, "test-token")
                        download.assert_not_called()

    def test_manual_serial_two_host_wiring_has_no_build_or_token_in_cli_step(self):
        workflow = (ROOT / ".github/workflows/sagas.yml").read_text()
        linux, mac = workflow.split("  packaged-cli-linux:\n", 1)[1].split("  packaged-cli-macos:\n", 1)
        self.assertIn("needs: packaged-cli-linux", mac)
        self.assertIn("contents: read", linux)
        self.assertIn("contents: write", mac)
        for job in [linux, mac]:
            self.assertIn("inputs.temporal_phase == 'packaged-cli'", job)
            self.assertIn("timeout-minutes: 45", job)
            self.assertNotIn("matrix:", job)
            self.assertNotIn("cargo build", job)
            self.assertNotIn("build:sdk", job)
            cli_step = job.split("      - name: Only exact packaged CLI nineteen independent vectors\n", 1)[1].split("      - name:", 1)[0]
            self.assertNotIn("GH_TOKEN", cli_step)
            self.assertNotIn("github.token", cli_step)
            self.assertIn("scripts/saga-portable/other-hosts.ts cli", cli_step)
            self.assertIn("qualify_packaged_cli.py verify", cli_step)
            self.assertIn("if: always()", job)


if __name__ == "__main__": unittest.main()

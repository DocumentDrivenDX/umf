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

    def completed_linux_metadata(self):
        run = {"id": 41651139875, "head_sha": "bcdf9fe5a613f4d6fc4e3774681234ee678b1244",
               "run_attempt": 1, "event": "workflow_dispatch", "workflow_id": 401955635,
               "path": ".github/workflows/sagas.yml", "status": "completed", "conclusion": "failure",
               "head_branch": "codex/temporal-qualification-controller"}
        artifact = {"id": 13237746692, "expired": False, "size_in_bytes": 430014112,
            "digest": "sha256:2af2f98b140a4f6073d0f2820c752811282c6f504adee2a869663aee1d62083b",
            "name": "packaged-cli-linux-bcdf9fe5a613f4d6fc4e3774681234ee678b1244-41651139875",
            "workflow_run": {"id": run["id"], "head_sha": run["head_sha"]}}
        job = {"id": 125969297266, "run_id": run["id"], "name": "packaged-cli-linux",
               "status": "completed", "conclusion": "success", "steps": [
                   {"name": name, "status": "completed", "conclusion": "success"} for name in [
                       "Authenticate exact retained wheel and unqualified draft material carrier",
                       "Prepare unchanged wheel-embedded executable copy",
                       "Only exact packaged CLI nineteen independent vectors",
                       "Retain material, report and verification bytes without replay or repair"]]}
        return run, artifact, job

    def test_completed_linux_metadata_requires_exact_successful_job_not_run_success(self):
        original = self.completed_linux_metadata()
        intake.validate_completed_linux_metadata(*original)
        for index, field, value in [(0, "head_sha", "f" * 40), (0, "run_attempt", 2),
                                   (0, "event", "pull_request"), (0, "conclusion", "success"),
                                   (1, "id", 1), (1, "expired", True), (1, "digest", "sha256:" + "f" * 64),
                                   (1, "size_in_bytes", 1), (2, "conclusion", "failure"), (2, "id", 1)]:
            rows = copy.deepcopy(original)
            rows[index][field] = value
            with self.assertRaises(ValueError): intake.validate_completed_linux_metadata(*rows)
        rows = copy.deepcopy(original)
        rows[2]["steps"].pop()
        with self.assertRaises(ValueError): intake.validate_completed_linux_metadata(*rows)

    def completed_linux_receipts(self, mutate=None):
        h = intake.helper(ROOT)
        materials = h.snapshot(ROOT)
        pin = h.PINS["linux-x86_64"]
        prepare = {"profile": "umf.packaged-cli-prepare/1", "sourceS": intake.SOURCE,
                   "target": "linux-x86_64", "root": "/original/controller", "wheel": "/original/wheel.whl",
                   "copy": "/original/extracted/umf", "wheelSha256": pin["wheel"],
                   "cliSha256": pin["cli"], "materials": materials}
        vectors = json.loads((ROOT / "fixtures/saga/portable.json").read_text())["cases"]
        report = {"profile": "umf.saga.portable-host-receipt/2", "host": "cli", "hostId": "cli",
                  "runtime": {"platform": "linux", "arch": "x64"}, "cases": 19, "passed": 19,
                  "results": [{"id": v["id"], "covers": v["covers"], "passed": True} for v in vectors],
                  "qualificationInputs": {n: materials[n] for n in h.input_paths(ROOT)},
                  "corpusSha256": materials["fixtures/saga/portable.json"],
                  "artifacts": {"cliBinary": {"path": prepare["copy"], "sha256": pin["cli"]}}}
        verification = {"profile": "umf.packaged-cli-verification/1", "sourceS": intake.SOURCE,
            "target": "linux-x86_64", "status": "passed", "cases": 19, "passed": 19,
            "wheelSha256": pin["wheel"], "cliSha256": pin["cli"],
            "beforeMaterials": materials, "afterMaterials": materials}
        observed = {"artifactSourceS": intake.SOURCE, "sourceTree": intake.SOURCE_TREE,
            "controllerQ": "bcdf9fe5a613f4d6fc4e3774681234ee678b1244", "platform": "linux-x86_64",
            "wheel": prepare["wheel"], "wheelSHA256": pin["wheel"], "cliSHA256": pin["cli"],
            "helperSHA256": intake.HELPER_SHA}
        if mutate: mutate(prepare, report, verification, observed)
        raw = {"extracted/prepare.json": json.dumps(prepare).encode(), "cli19.json": json.dumps(report).encode()}
        for name, key, field in [("prepared.sha256", "extracted/prepare.json", "preparedSha256"),
                                  ("report.sha256", "cli19.json", "reportSha256")]:
            value = hashlib.sha256(raw[key]).hexdigest()
            raw[name] = (value + "\n").encode()
            verification[field] = value
        raw["verification.json"] = json.dumps(verification).encode()
        raw["intake.json"] = json.dumps(observed).encode()
        capture = {"artifactSourceS": intake.SOURCE, "controllerQ": observed["controllerQ"],
            "controllerTree": "1504c88ced89be57333969d4f42420cf87cd9c79", "controllerStatus": "",
            "files": [{"path": n, "bytes": len(b), "sha256": hashlib.sha256(b).hexdigest()} for n, b in raw.items()]}
        raw["capture.json"] = json.dumps(capture).encode()
        return raw

    def test_completed_linux_receipts_preserve_full_ordered_oracle_and_byte_identity(self):
        self.assertEqual(intake.validate_completed_linux_receipts(ROOT, self.completed_linux_receipts())["passed"], 19)
        for mutate in [lambda p,r,v,i: r.update(passed=18),
                       lambda p,r,v,i: r["results"].reverse(),
                       lambda p,r,v,i: r["results"][0].update(passed=False),
                       lambda p,r,v,i: r.update(runtime={"platform": "darwin", "arch": "arm64"}),
                       lambda p,r,v,i: r["artifacts"]["cliBinary"].update(path="/another/umf"),
                       lambda p,r,v,i: v.update(afterMaterials={}),
                       lambda p,r,v,i: i.update(controllerQ="f" * 40),
                       lambda p,r,v,i: p.update(cliSha256="f" * 64)]:
            with self.assertRaises(ValueError):
                intake.validate_completed_linux_receipts(ROOT, self.completed_linux_receipts(mutate))

    def test_completed_linux_log_is_immutable_and_not_a_runtime_equivalence_claim(self):
        original = b"Synthetic original successful job log; no native execution"
        with patch.object(intake, "COMPLETED_CLI_LOG_SHA", hashlib.sha256(original).hexdigest()):
            intake.validate_completed_linux_log(original)
            with self.assertRaises(ValueError): intake.validate_completed_linux_log(original + b"changed")
        with self.assertRaises(ValueError): intake.validate_completed_linux_log(original)

    def test_completed_linux_receipts_require_retained_roster_and_external_pins(self):
        for name in ["capture.json", "prepared.sha256", "report.sha256", "intake.json", "verification.json"]:
            rows = self.completed_linux_receipts()
            rows.pop(name)
            with self.assertRaises(ValueError): intake.validate_completed_linux_receipts(ROOT, rows)
        rows = self.completed_linux_receipts()
        rows["report.sha256"] = b"f" * 64
        with self.assertRaises(ValueError): intake.validate_completed_linux_receipts(ROOT, rows)

    def test_missing_only_mac_phase_requires_completed_linux_intake_and_exact_controller(self):
        workflow = (ROOT / ".github/workflows/sagas.yml").read_text()
        linux, mac = workflow.split("  packaged-cli-linux:\n", 1)[1].split("  packaged-cli-macos:\n", 1)
        self.assertIn("packaged-cli-macos]", workflow)
        self.assertNotIn("inputs.temporal_phase == 'packaged-cli-macos'", linux)
        self.assertIn("if: always() &&", mac)
        self.assertIn("needs.packaged-cli-linux.result == 'success'", mac)
        self.assertIn("inputs.temporal_phase == 'packaged-cli-macos'", mac)
        self.assertIn("python-version: '3.13.17'", mac)
        self.assertIn("architecture: arm64", mac)
        self.assertIn("sys.version_info[:3] == (3,13,17)", mac)
        self.assertIn("Authenticate completed Linux CLI19 without replay", mac)
        self.assertIn("temporal_cli_intake.py reuse-linux", mac)
        self.assertLess(mac.index("temporal_cli_intake.py reuse-linux"),
                        mac.index("qualify_packaged_cli.py prepare"))
        self.assertIn("bun install --frozen-lockfile --ignore-scripts", mac)
        self.assertIn("/patches/jsonld@9.0.0.patch", mac)
        self.assertIn("/bunfig.toml", mac)

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

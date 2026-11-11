"""Synthetic negative controls for the default-off local 0.10.10 release route."""
from __future__ import annotations

import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish_local_pypi_01010 as local


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class LocalQualificationTests(unittest.TestCase):
    def setUp(self):
        self.source = {"commit": "a" * 40, "tree": "b" * 40}
        self.resources = {
            "manifest": "c" * 64,
            "releaseAuthority": "d" * 64,
            "files": {name: sha(name.encode()) for name in sorted(local.RESOURCE_NAMES)},
            "protocols": local.PROTOCOLS.copy(),
        }
        self.outputs = {}
        self.native_source = {"commit": "7" * 40, "tree": "8" * 40}
        probes = {}
        sdk_names = {"macos-arm64": "umf-sdk-0.10.10-macos-aarch64.tgz",
                     "linux-x86_64": "umf-sdk-0.10.10-linux-x86_64.tgz"}
        runtime_checks = {}
        for role, host in (("nodeFileLoader", "node"), ("bun", "bun")):
            platform_results = {}
            for platform, sdk_name in sdk_names.items():
                platform_results[platform] = {
                    "profile": "umf.node-file-loader-installed-probe/1", "status": "passed",
                    "packageVersion": local.VERSION, "host": host, "fetchCalls": 0,
                    "initializationCalls": 2,
                    "copyJson": {"profile": "umf-node-file-loader/1", "unicode": "μ🙂",
                                 "values": [0, False, None]},
                    "archiveSha256": "e" * 64, "assets": {"index-node.js": "a" * 64},
                }
            runtime_checks[role] = {"profile": "umf.release-host-probes/1", "status": "passed",
                                    "version": local.VERSION, "platforms": platform_results}
        checks = {
            **runtime_checks,
            "python": {"status": "passed", "version": local.VERSION, "coreVersion": local.VERSION,
                       "resourceCount": 10, "resources": self.resources["files"]},
            "browser": {"profile": "umf.node-file-loader-browser-probe/1", "status": "passed",
                        "packageVersion": local.VERSION, "pageErrors": [], "externalRequests": [],
                        "wasmRequests": ["/dist/runtime/wasm/pkg/umf_core_wasm_bg.wasm",
                                         "/dist/umf_core_wasm_bg.wasm"], "browserProcessAbsent": True},
        }
        for role in local.PROBES:
            raw = json.dumps(checks[role], sort_keys=True).encode()
            path = f"evidence/{role}.json"
            probes[role] = {"path": path, "sha256": sha(raw)}
            self.outputs["HEAD:" + path] = raw
        self.value = {
            "profile": local.QUALIFICATION_PROFILE,
            "status": "passed",
            "version": local.VERSION,
            "source": self.source.copy(),
            "artifacts": {name: {"sha256": (sha(b"e") if name == "umf_core-0.10.10.tar.gz" else "e" * 64),
                                  "size": 1} for name in local.PRODUCT_FILES},
            "platforms": {
                name: {"toolchain": {"rustc": "1.90.0", "cargo": "1.90.0"},
                       "sourceSnapshot": {"commit": self.native_source["commit"], "tree": self.native_source["tree"],
                                          "beforeSha256": "f" * 64, "afterSha256": "f" * 64}}
                for name in local.PLATFORMS
            },
            "probes": probes,
            "resources": self.resources,
            "nativeSourceJoin": {"path": "evidence/native-s4-source-join.json", "sha256": ""},
        }
        self.native_join = {
            "profile": "umf.native-sdist-source-join/1",
            "nativePackagingSource": self.native_source,
            "releaseSource": self.source,
            "sdistSha256": sha(b"e"),
            "changedGitPath": "src/extensions/actions/plan-identity.ts",
            "changedPathAbsentFromSdist": True,
            "changedPathAbsentFromMetamodelInputs": True,
        }
        join_raw = json.dumps(self.native_join, sort_keys=True).encode()
        self.value["nativeSourceJoin"]["sha256"] = sha(join_raw)
        self.outputs["HEAD:evidence/native-s4-source-join.json"] = join_raw

    def validate(self, value=None):
        def git_output(args, **kwargs):
            if args[1] == "diff":
                return "src/extensions/actions/plan-identity.ts\n" if kwargs.get("text") else b"src/extensions/actions/plan-identity.ts\n"
            if args[1] == "rev-parse":
                commit = args[2].split("^")[0]
                result = {self.native_source["commit"]: self.native_source["tree"],
                          self.source["commit"]: self.source["tree"]}[commit]
                return result if kwargs.get("text") else result.encode()
            return self.outputs[args[-1]]
        with patch.object(local.subprocess, "check_output", side_effect=git_output):
            return local.validate_qualification(copy.deepcopy(value or self.value), self.source)

    def test_complete_source_bound_receipt(self):
        self.assertEqual(len(self.validate()["artifacts"]), 10)

    def test_swapped_source_refuses(self):
        with self.assertRaises(local.LocalReleaseError):
            self.validate({**self.value, "source": {"commit": "1" * 40, "tree": "b" * 40}})

    def test_wrong_raw_output_digest_refuses(self):
        value = copy.deepcopy(self.value)
        value["probes"]["python"]["sha256"] = "0" * 64
        with self.assertRaises(local.LocalReleaseError):
            self.validate(value)

    def test_wrong_version_refuses(self):
        raw = self.outputs["HEAD:evidence/nodeFileLoader.json"]
        result = json.loads(raw)
        result["version"] = "0.10.9"
        changed = json.dumps(result, sort_keys=True).encode()
        self.outputs["HEAD:evidence/nodeFileLoader.json"] = changed
        value = copy.deepcopy(self.value)
        value["probes"]["nodeFileLoader"]["sha256"] = sha(changed)
        with self.assertRaises(local.LocalReleaseError):
            self.validate(value)

    def test_failed_probe_refuses(self):
        raw = self.outputs["HEAD:evidence/browser.json"]
        result = json.loads(raw)
        result["status"] = "failed"
        failed = json.dumps(result, sort_keys=True).encode()
        self.outputs["HEAD:evidence/browser.json"] = failed
        value = copy.deepcopy(self.value)
        value["probes"]["browser"]["sha256"] = sha(failed)
        with self.assertRaises(local.LocalReleaseError):
            self.validate(value)

    def test_missing_platform_refuses(self):
        value = copy.deepcopy(self.value)
        value["platforms"].pop("linux-x86_64")
        with self.assertRaises(local.LocalReleaseError):
            self.validate(value)

    def test_changed_platform_snapshot_refuses(self):
        value = copy.deepcopy(self.value)
        value["platforms"]["macos-arm64"]["sourceSnapshot"]["afterSha256"] = "0" * 64
        with self.assertRaises(local.LocalReleaseError):
            self.validate(value)

    def test_platform_builds_must_bind_final_source(self):
        value = copy.deepcopy(self.value)
        value["platforms"]["macos-arm64"]["sourceSnapshot"]["commit"] = "9" * 40
        with self.assertRaises(local.LocalReleaseError):
            self.validate(value)

    def test_native_source_join_rejects_unexpected_s3_to_s4_delta(self):
        original = self.outputs["HEAD:evidence/native-s4-source-join.json"]
        join = json.loads(original)
        join["changedGitPath"] = "src/other.ts"
        changed = json.dumps(join, sort_keys=True).encode()
        self.outputs["HEAD:evidence/native-s4-source-join.json"] = changed
        value = copy.deepcopy(self.value)
        value["nativeSourceJoin"]["sha256"] = sha(changed)
        with self.assertRaises(local.LocalReleaseError):
            self.validate(value)

    def test_unsafe_raw_output_path_refuses(self):
        value = copy.deepcopy(self.value)
        value["probes"]["nodeFileLoader"]["path"] = "../../outside.json"
        with self.assertRaises(local.LocalReleaseError):
            self.validate(value)

    def test_node_probe_requires_file_loading_without_fetch_and_copy_json(self):
        raw = self.outputs["HEAD:evidence/nodeFileLoader.json"]
        result = json.loads(raw)
        result["platforms"]["macos-arm64"]["fetchCalls"] = 1
        changed = json.dumps(result, sort_keys=True).encode()
        self.outputs["HEAD:evidence/nodeFileLoader.json"] = changed
        value = copy.deepcopy(self.value)
        value["probes"]["nodeFileLoader"]["sha256"] = sha(changed)
        with self.assertRaises(local.LocalReleaseError):
            self.validate(value)

    def test_dispatch_must_match_each_independent_pin(self):
        admission = {"source": self.source, "sums_sha256": "1" * 64}
        local.validate_dispatch_pins(local.TAG, self.source["commit"], "1" * 64, "2" * 64,
                                     admission, "2" * 64)
        for tag, source, sums, admission_sha in (
            ("umf-v0.10.9", self.source["commit"], "1" * 64, "2" * 64),
            (local.TAG, "9" * 40, "1" * 64, "2" * 64),
            (local.TAG, self.source["commit"], "3" * 64, "2" * 64),
        ):
            with self.subTest(tag=tag, source=source, sums=sums), self.assertRaises(local.LocalReleaseError):
                local.validate_dispatch_pins(tag, source, sums, admission_sha, admission, "2" * 64)

    def test_release_pins_must_select_exact_core_source_and_files(self):
        files = {name: "4" * 64 for name in local.CORE_FILES}
        admission = {"distribution": "umf-core", "files": files}
        pins = {"tag": local.TAG, "commit": self.source["commit"], "distribution": "umf-core",
                "version": local.VERSION, "sdk": local.VERSION, "umf_core": local.VERSION, "files": files}
        local.validate_release_pins(pins, admission, self.source["commit"])
        changed = copy.deepcopy(pins)
        changed["files"].pop(next(iter(changed["files"])))
        with self.assertRaises(local.LocalReleaseError):
            local.validate_release_pins(changed, admission, self.source["commit"])

    def test_controller_q_ancestor_and_identical_files_allow_descendant_admission_p(self):
        contents = {path: ("reviewed " + path).encode() for path in local.CONTROLLER_FILES}
        controller = {"commit": "1" * 40, "tree": "2" * 40,
                      "files": {path: sha(raw) for path, raw in contents.items()}}
        local.validate_controller_snapshot(controller, "3" * 40, "2" * 40, True,
                                           contents, contents, contents)

    def test_controller_rejects_non_ancestor_q(self):
        contents = {path: ("reviewed " + path).encode() for path in local.CONTROLLER_FILES}
        controller = {"commit": "1" * 40, "tree": "2" * 40,
                      "files": {path: sha(raw) for path, raw in contents.items()}}
        with self.assertRaises(local.LocalReleaseError):
            local.validate_controller_snapshot(controller, "3" * 40, "2" * 40, False,
                                                contents, contents, contents)

    def test_controller_rejects_mutated_reviewed_q_files(self):
        contents = {path: ("reviewed " + path).encode() for path in local.CONTROLLER_FILES}
        controller = {"commit": "1" * 40, "tree": "2" * 40,
                      "files": {path: sha(raw) for path, raw in contents.items()}}
        mutated = contents.copy()
        first = next(iter(mutated))
        mutated[first] += b" changed after Q"
        with self.assertRaises(local.LocalReleaseError):
            local.validate_controller_snapshot(controller, "3" * 40, "2" * 40, True,
                                                contents, mutated, contents)

    def test_workflow_keeps_candidate_and_local_routes_mutually_exclusive(self):
        root = Path(__file__).resolve().parents[1]
        core_workflow = (root / ".github/workflows/publish-pypi.yml").read_text()
        codegen_workflow = (root / ".github/workflows/publish-codegen-pypi.yml").read_text()
        self.assertIn("expected_admission_sha256", core_workflow)
        self.assertIn("inputs.locally_qualified == true", core_workflow)
        self.assertIn("publish_local_pypi_01010.py", core_workflow)
        self.assertIn("inputs.locally_qualified != true", codegen_workflow)
        self.assertIn("verify-01010-local:", codegen_workflow)
        self.assertIn("publish-01010-local:", codegen_workflow)
        self.assertIn("environment: pypi", codegen_workflow)
        self.assertIn("inputs.publish == true && inputs.locally_qualified == true", codegen_workflow)


if __name__ == "__main__":
    unittest.main()

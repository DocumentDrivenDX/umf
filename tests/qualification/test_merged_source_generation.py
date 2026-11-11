# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pure controls for the full-only merged source generation workflow."""
from __future__ import annotations

import hashlib
import json
import os
import ast
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(os.environ.get("UMF_TEST_ROOT", Path(__file__).resolve().parents[2]))
WORKFLOW = REPO / ".github/workflows/merged-source-generation.yml"

def decoded_run_bodies() -> list[str]:
    lines = WORKFLOW.read_text().splitlines()
    bodies = []
    index = 0
    while index < len(lines):
        if re.match(r"^\s+run:\s*\|\s*$", lines[index]):
            index += 1
            block = []
            while index < len(lines) and (not lines[index].strip() or lines[index].startswith("          ")):
                block.append(lines[index][10:] if lines[index].startswith("          ") else "")
                index += 1
            while block and not block[-1]:
                block.pop()
            bodies.append("\n".join(block) + "\n")
            continue
        index += 1
    return bodies

def controller_text() -> str:
    pieces = []
    for body in decoded_run_bodies():
        lines = body.splitlines()
        for i, line in enumerate(lines):
            if line in {
                'cat > "$RUNNER_TEMP/merged_source_generation.py" <<\'PYTHON\'',
                'cat >> "$RUNNER_TEMP/merged_source_generation.py" <<\'PYTHON\'',
            }:
                end = lines.index("PYTHON", i + 1)
                pieces.extend(lines[i + 1:end])
                break
    if not pieces:
        raise AssertionError("embedded full-route controller heredoc missing")
    return "\n".join(pieces) + "\n"

def load_controller():
    namespace = {"__name__": "gen1_controller_tests"}
    exec(compile(controller_text(), str(WORKFLOW), "exec"), namespace)
    namespace["ROOT"] = REPO
    return namespace

def source_text(path: str) -> str:
    return (REPO / path).read_text()

class FullOnlyWorkflowTests(unittest.TestCase):
    def test_all_decoded_run_steps_under_github_character_limit(self):
        bodies = decoded_run_bodies()
        self.assertGreater(len(bodies), 0)
        lengths = [len(body) for body in bodies]
        self.assertTrue(all(length <= 21_000 for length in lengths), lengths)
        self.assertGreater(max(lengths), 0)

    def test_manual_workflow_is_inputless_and_keeps_locked_execution_boundary(self):
        text = WORKFLOW.read_text()
        self.assertRegex(text, r"(?m)^on:\n  workflow_dispatch:\s*$")
        self.assertNotIn("inputs:", text)
        self.assertNotIn("resume-c8-d", text)
        self.assertNotIn("continue-intake", text)
        self.assertIn("permissions:\n  contents: read", text)
        for pin in ("11d5960a326750d5838078e36cf38b85af677262", "0c5077e51419868618aeaa5fe8019c62421857d6", "ece7cb06caefa5fff74198d8649806c4678c61a1", "ea165f8d65b6e75b540449e92b4886f43607fa02"):
            self.assertIn(pin, text)
        self.assertIn("dtolnay/rust-toolchain@stable", text)
        self.assertIn("toolchain: 1.90.0", text)
        self.assertIn("group: umf-merged-source-generation-${{ github.ref }}", text)
        self.assertIn("cancel-in-progress: false", text)
        self.assertIn("runs-on: ubuntu-24.04", text)
        self.assertIn("timeout-minutes: 35", text)
        self.assertIn("fetch-depth: 24", text)
        for stage in [*(f"A{i}" for i in range(1,5)), *(f"B{i}" for i in range(1,5)), *(f"C{i}" for i in range(1,9))]:
            self.assertRegex(text, rf"(?m)^\s*run_stage {stage} ")
        self.assertIn("if: always()", text)
        self.assertIn("${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}", text)

    def test_exact_output_roster_matches_all_current_source_writers(self):
        ns = load_controller()
        outputs = ns["OUTPUTS"]
        build = source_text("scripts/metamodel/build.ts")
        output_block = re.search(r"const OUTPUT_PATHS=\[(.*?)\] as const;", build, re.S).group(1)
        metamodel = set(re.findall(r"'([^']+)'", output_block))
        metamodel.add("src/generated/core-validators-accounted.ts")
        portable_block = re.search(r"const portablePaths=new Set\(\[(.*?)\]\);", build, re.S).group(1)
        rust_portable = set(re.findall(r"'([^']+)'", portable_block))
        self.assertEqual(ns["RUST_PORTABLE_OUTPUTS"], rust_portable)
        js_portable_block = re.search(r"const rustExpected=\[(.*?)\];", WORKFLOW.read_text(), re.S).group(1)
        self.assertEqual(set(re.findall(r"'([^']+)'", js_portable_block)), rust_portable)
        js_backend_block = re.search(r"const backendOnly=\[(.*?)\];", WORKFLOW.read_text(), re.S).group(1)
        self.assertEqual(set(re.findall(r"'([^']+)'", js_backend_block)), ns["BACKEND_OUTPUTS"])
        self.assertEqual(ns["BACKEND_OUTPUTS"], {"src/generated/core-validators.ts", "src/generated/core-validators-accounted.ts"})
        self.assertIn("outputs['src/generated/core-validators.ts']", build)
        self.assertIn("outputs[ACCOUNTED_COMPANION_PATH]", build)
        sync = source_text("scripts/rust-migration/r4/sync_codegen_resources.py")
        source_block = re.search(r"SOURCES = (\{.*?\n\})", sync, re.S).group(1)
        sources = ast.literal_eval(source_block)
        codegen = {"python/umf_codegen/src/umf_codegen/_resources/" + name for name in sources}
        codegen |= {"python/umf_codegen/src/umf_codegen/_resources/manifest.json", "python/umf_codegen/src/umf_codegen/_release.py"}
        rustgen = {"crates/umf-core/src/canonical_codegen_literals.rs"}
        action_runtime = {"python/src/umf/action_runtime.py", "python/src/umf/action_runtime_resource_manifest.json"}
        action_manifest_helper = source_text("python/src/umf/_action_runtime_manifest.py")
        self.assertIn('package_root / "src/umf/action_runtime.py"', action_manifest_helper)
        self.assertIn('package_root / "src/umf/action_runtime_resource_manifest.json"', action_manifest_helper)
        action_identity = {"src/extensions/actions/plan-identity.ts"}
        self.assertEqual(outputs, metamodel | codegen | rustgen | action_runtime | action_identity)
        self.assertEqual(len(outputs), 34)
        for path in outputs:
            self.assertTrue((REPO / path).is_file(), path)

    def test_raw_nine_oracle_binds_data_and_each_current_raw_root(self):
        ns = load_controller()
        with tempfile.TemporaryDirectory() as temp:
            oracle = Path(temp) / "oracle.json"
            anchor = Path(temp) / "immutable-c-roster.json"
            anchor.write_text("{}\n")
            ns["pure_oracle"](str(oracle), str(anchor))
            receipt = json.loads(oracle.read_text())
            ns["validate_oracle_receipt"]({"outputs": {ns["DATA"]: {"bytes": Path(ns["ROOT"], ns["DATA"]).stat().st_size, "sha256": hashlib.sha256(Path(ns["ROOT"], ns["DATA"]).read_bytes()).hexdigest()} }}, receipt)
            self.assertEqual(len(receipt["roots"]), 9)
            damaged = json.loads(json.dumps(receipt))
            damaged["roots"][0]["sha256"] = "0" * 64
            with self.assertRaisesRegex(ValueError, "does not bind current bytes"):
                ns["validate_oracle_receipt"]({"outputs": {ns["DATA"]: receipt["data"]}}, damaged)
            damaged = json.loads(json.dumps(receipt))
            damaged["roots"].reverse()
            with self.assertRaisesRegex(ValueError, "ordering mismatch"):
                ns["validate_oracle_receipt"]({"outputs": {ns["DATA"]: receipt["data"]}}, damaged)
            self.assertEqual(anchor.read_text(), "{}\n")

    def test_final_compiler_artifact_requires_regular_matching_bytes_and_hash(self):
        ns = load_controller()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            artifact = root / "umf-metamodel-cli"
            data_buffer = bytearray(64)
            data_buffer[:6] = b"\x7fELF\x02\x01"
            data_buffer[18:20] = (62).to_bytes(2, "little")
            data = bytes(data_buffer)
            artifact.write_bytes(data)
            sha = hashlib.sha256(data).hexdigest()
            record = {"path": artifact.name, "bytes": len(data), "sha256": sha}
            ns["verify_compiler_artifact"](record, {"bytes": len(data), "sha256": sha}, root)
            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                ns["verify_compiler_artifact"]({**record, "sha256": "0"*64}, {"bytes": len(data), "sha256": sha}, root)
            invalid = bytearray(data); invalid[0] = 0
            artifact.write_bytes(invalid)
            invalid_sha = hashlib.sha256(invalid).hexdigest()
            with self.assertRaisesRegex(ValueError, "not ELF64"):
                ns["verify_compiler_artifact"]({"path": artifact.name, "bytes": len(invalid), "sha256": invalid_sha}, {"bytes": len(invalid), "sha256": invalid_sha}, root)
            artifact.unlink()
            artifact.symlink_to(Path("/etc/hosts"))
            with self.assertRaisesRegex(ValueError, "symlink"):
                ns["verify_compiler_artifact"](record, {"bytes": len(data), "sha256": sha}, root)

    def test_manifest_data_transition_and_final_roster_refuse_substitution(self):
        ns = load_controller()
        data_path = ns["DATA"]
        old = "1" * 64
        new = "2" * 64
        initial = {"outputs": {data_path: {"sha256": old}}}
        before = {"outputs": {data_path: {"sha256": old}}, "metamodelManifest": {"sources": {data_path: old}, "workspaceInputs": {}, "compilerInputs": {}}}
        after = {"outputs": {data_path: {"sha256": new}}, "metamodelManifest": {"sources": {data_path: new}, "workspaceInputs": {}, "compilerInputs": {}}}
        ns["manifest_delta"](initial, before, after)
        unchanged = {"outputs": {data_path: {"sha256": old}}, "metamodelManifest": {"sources": {data_path: old}, "workspaceInputs": {}, "compilerInputs": {}}}
        ns["manifest_delta"](initial, before, unchanged)
        bad = json.loads(json.dumps(after))
        bad["metamodelManifest"]["sources"][data_path] = "3" * 64
        with self.assertRaisesRegex(ValueError, "does not match observed"):
            ns["manifest_delta"](initial, before, bad)
        with self.assertRaisesRegex(ValueError, "literal role/path mismatch"):
            ns["check_literal_row"]({"name":"wrong","path":"x","bytes":0,"sha256":hashlib.sha256(b"").hexdigest(),"value":None}, "coreSchema", "spec/core/schema.json", b"", None)

    def test_final_attestation_must_join_manifest_model_compiler_and_complete_outputs(self):
        ns = load_controller()
        path = "spec/core/schema.json"
        digest = "a" * 64
        ts_paths = {"src/generated/core-validators.ts", "src/generated/core-validators-accounted.ts"}
        ts_rows = {p: {"sha256": "d" * 64, "bytes": 19} for p in ts_paths}
        rust_rows = {p: {"sha256": digest if p == path else hashlib.sha256(p.encode()).hexdigest(), "bytes": 12} for p in ns["RUST_PORTABLE_OUTPUTS"]}
        manifest = {
            "profile": "umf.metamodel.outputs/1",
            "provenance": {"modelSha256": "b" * 64, "compilerSha256": "c" * 64},
            "outputs": {**rust_rows, **ts_rows},
        }
        snapshot = {"metamodelManifest": manifest, "outputs": {**rust_rows, **ts_rows}}
        attestation = {
            "profile": "umf.metamodel.compile/1",
            "modelSha256": "b" * 64,
            "compilerSha256": "c" * 64,
            "portableOutputs": {p: row["sha256"] for p, row in rust_rows.items()},
        }
        ns["validate_compiler_attestation"](snapshot, attestation)
        for changed in (
            {**attestation, "modelSha256": "d" * 64},
            {**attestation, "compilerSha256": "d" * 64},
            {**attestation, "portableOutputs": {k: v for k, v in attestation["portableOutputs"].items() if k != path}},
            {**attestation, "portableOutputs": {**attestation["portableOutputs"], "extra/rust-output": "e" * 64}},
        ):
            with self.assertRaises(ValueError):
                ns["validate_compiler_attestation"](snapshot, changed)
        substituted_rows = {**rust_rows, **ts_rows, "src/generated/core-validators.ts": {"sha256": "f" * 64, "bytes": 19}}
        substituted = {"metamodelManifest": manifest, "outputs": substituted_rows}
        with self.assertRaisesRegex(ValueError, "captured C roster"):
            ns["validate_compiler_attestation"](substituted, attestation)

    def test_ab_finalize_accepts_only_closed_manifest_identity_changes(self):
        ns = load_controller()
        data = ns["DATA"]
        manifest_path = "spec/metamodel/generated/manifest.json"
        identity_path = "src/extensions/actions/plan-identity.ts"
        old, new = "1" * 64, "2" * 64
        source_map = {"tracked-source.ts": {"bytes": 4, "sha256": "3" * 64}}
        initial_outputs = {path: {"bytes": 1, "sha256": "4" * 64} for path in ns["OUTPUTS"]}
        initial_outputs[data] = {"bytes": 1, "sha256": old}
        before_outputs = dict(initial_outputs)
        before_outputs[data] = {"bytes": 1, "sha256": new}
        after_outputs = dict(before_outputs)
        after_outputs[manifest_path] = {"bytes": 2, "sha256": "5" * 64}
        after_outputs[identity_path] = {"bytes": 2, "sha256": "6" * 64}
        before = {
            "outputs": before_outputs,
            "sources": source_map,
            "actionIdentityNonProducerSha256": "7" * 64,
            "metamodelManifest": {"profile": "umf.metamodel.outputs/1", "sources": {data: old}, "workspaceInputs": {}, "compilerInputs": {}},
        }
        after = {
            **before,
            "outputs": after_outputs,
            "metamodelManifest": {"profile": "umf.metamodel.outputs/1", "sources": {data: new}, "workspaceInputs": {}, "compilerInputs": {}},
        }
        initial = {"outputs": initial_outputs, "sources": source_map, "actionIdentityNonProducerSha256": "7" * 64}
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            initial_path, before_path, final_path = (root / name for name in ("initial.json", "before.json", "final.json"))
            initial_path.write_text(json.dumps(initial)); before_path.write_text(json.dumps(before))
            previous_roster = ns["roster"]
            try:
                ns["roster"] = lambda: after
                ns["finalize"](str(initial_path), str(before_path), str(final_path))
                self.assertEqual(json.loads(final_path.read_text()), after)
                bad_source = {**after, "sources": {"unlisted.ts": {"bytes": 1, "sha256": "8" * 64}}}
                ns["roster"] = lambda: bad_source
                with self.assertRaisesRegex(ValueError, "unlisted source mutation"):
                    ns["finalize"](str(initial_path), str(before_path), str(final_path))
                bad_output = {**after, "outputs": {**after_outputs, "spec/core/schema.json": {"bytes": 9, "sha256": "9" * 64}}}
                ns["roster"] = lambda: bad_output
                with self.assertRaisesRegex(ValueError, "non-manifest/Data bootstrap drift"):
                    ns["finalize"](str(initial_path), str(before_path), str(final_path))
            finally:
                ns["roster"] = previous_roster

    def test_package_copies_only_exact_roster_and_checks_manifest_derived_pins(self):
        ns = load_controller()
        root = REPO
        outputs = ns["filemap"](ns["OUTPUTS"])
        baseline = {"outputs": outputs, "derivedPinBaselines": {}}
        for name in (ns["RELEASE"], ns["ACTION_RUNTIME"]):
            raw = (root / name).read_bytes()
            _, normalized = ns["pin_parts"](name, raw)
            baseline["derivedPinBaselines"][name] = {
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "normalizedSha256": hashlib.sha256(normalized).hexdigest(),
            }
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            initial = directory / "source-inputs.json"
            initial.write_text(json.dumps(baseline))
            real_run = subprocess.run
            try:
                subprocess.run = lambda *args, **kwargs: type("Completed", (), {"stdout": b""})()
                ns["package"](str(directory), str(directory / "output-receipt.json"), str(directory / "final-source.patch"), str(initial))
            finally:
                subprocess.run = real_run
            staged = directory / "source-output"
            members = {p.relative_to(staged).as_posix() for p in staged.rglob("*") if p.is_file()}
            self.assertEqual(members, ns["OUTPUTS"])
            receipt = json.loads((directory / "output-receipt.json").read_text())
            self.assertEqual(set(receipt["outputs"]), ns["OUTPUTS"])
            self.assertEqual((directory / "final-source.patch").read_bytes(), b"")
            tampered = dict(baseline)
            tampered["derivedPinBaselines"] = json.loads(json.dumps(baseline["derivedPinBaselines"]))
            tampered["derivedPinBaselines"][ns["RELEASE"]]["normalizedSha256"] = "0" * 64
            initial.write_text(json.dumps(tampered))
            with self.assertRaisesRegex(ValueError, "non-pin source drift"):
                ns["verify_pins"](str(initial))

    def test_patch_parser_rejects_outputs_outside_exact_writer_roster(self):
        ns = load_controller()
        allowed = "spec/core/schema.json"
        patch = f"diff --git a/{allowed} b/{allowed}\nindex 1111111..2222222 100644\n--- a/{allowed}\n+++ b/{allowed}\n@@ -1 +1 @@\n-a\n+b\n".encode()
        self.assertEqual(ns["source_patch_paths"](patch), {allowed})
        extra = "README.md"
        bad = patch + f"diff --git a/{extra} b/{extra}\n".encode()
        with self.assertRaisesRegex(ValueError, "closed 34-output roster"):
            ns["source_patch_paths"](bad)

    def test_controller_identity_binds_candidate_workflow_sources_run_job_and_attempt(self):
        ns = load_controller()
        commit, tree = "a" * 40, "b" * 40
        env = {
            "GITHUB_REPOSITORY": "DocumentDrivenDX/umf",
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_REF": "refs/heads/candidate",
            "GITHUB_SHA": commit,
            "GITHUB_RUN_ID": "12345",
            "GITHUB_RUN_ATTEMPT": "2",
            "GITHUB_JOB": "generate",
        }
        def git_identity(args, **kwargs):
            value = commit if args[-1] == "HEAD" else tree
            return value if kwargs.get("text") else value.encode()
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, env), patch.object(subprocess, "check_output", side_effect=git_identity):
            target = Path(temp) / "identity.json"
            ns["source_identity"](str(target))
            identity = json.loads(target.read_text())
            self.assertEqual(identity["sourceSha"], commit)
            self.assertEqual(identity["treeSha"], tree)
            self.assertEqual(identity["runId"], "12345")
            self.assertEqual(identity["runAttempt"], "2")
            self.assertEqual(identity["job"], "generate")
            self.assertEqual(identity["workflowSha256"], hashlib.sha256(WORKFLOW.read_bytes()).hexdigest())
            self.assertIn("scripts/metamodel/rust.ts", identity["controllerSources"])
            with patch.dict(os.environ, {"GITHUB_SHA": "c" * 40}):
                with self.assertRaisesRegex(ValueError, "candidate workflow/run/job binding mismatch"):
                    ns["source_identity"](str(target))

if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Negative controls for the Rust migration boundary rules."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("rust_boundaries", ROOT / "scripts/check-rust-boundaries.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class BoundaryRuleTests(unittest.TestCase):
    def test_v8_is_rejected_even_at_the_former_bridge_path(self):
        for path in ["python/umf_codegen/src/umf_codegen/_embedded.py", "python/umf_access/src/umf_access/values.py"]:
            findings = MODULE.scan_text(path, "from py_mini_racer import MiniRacer")
            self.assertEqual("forbidden-python-javascript-engine", findings[0]["rule"])

    def test_saga_boundaries_use_actual_checker(self):
        rust = "crates/umf-codegen/src/actions/saga/references.rs"
        wrapper = "src/extensions/actions/saga.ts"
        self.assertEqual([], MODULE.scan_text(rust, "use umf_core::{Context, Value}; use super::structure;"))
        self.assertEqual("saga-host-capability", MODULE.scan_text(rust, "use std::net::TcpStream;")[0]["rule"])
        self.assertEqual("saga-native-dependency", MODULE.scan_text(wrapper, "import {db} from '../../../scripts/saga-reference/store';")[0]["rule"])
        self.assertEqual("saga-wrapper-semantic-fork", MODULE.scan_text(wrapper, "if (compensation.kind === 'action') return true;")[0]["rule"])
        self.assertEqual([], MODULE.scan_text(wrapper, "export const inspectSagas = (source, registry) => engine.inspectSagas(source, registry);"))
        for path, source in [("bindings/core/node/index.js", "import {db} from '../../../scripts/saga-reference/store';"), ("crates/umf-core-wire/src/saga.rs", "use saga_reference::store;"), ("bindings/core/python/src/lib.rs", "use actions_reference::gateway;")]:
            self.assertEqual("saga-native-dependency", MODULE.scan_text(path, source)[0]["rule"])

    def test_generic_kinds_keep_ecosystem_semantics_out_of_core(self):
        self.assertEqual([], MODULE.scan_text("crates/umf-core/src/kinds.rs", 'let tag = get(payload, "kind");'))
        self.assertEqual("ecosystem-kind-in-generic-core", MODULE.scan_text("crates/umf-core/src/kinds.rs", 'if tag == "dashboard" {}')[0]["rule"])
        self.assertEqual("kind-core-adapter-import", MODULE.scan_text("src/model/extension-kinds.ts", "import {x} from '../extensions/vendor';")[0]["rule"])

    def test_kind_wrapper_transport_and_semantic_fork_controls(self):
        path = "bindings/core/node/index.js"
        good = "const manifest = dataProperty(extension, 'manifest', false); return {manifest, kinds, semantic: false};"
        self.assertEqual([], MODULE.scan_text(path, good))
        self.assertEqual("kind-manifest-transport-loss", MODULE.scan_text(path, good.replace("{manifest, kinds,", "{id, version,"))[0]["rule"])
        self.assertEqual("kind-semantic-fork-in-wrapper", MODULE.scan_text(path, "if (payload.kind === 'vendor-kind') return true;")[0]["rule"])

    def test_production_core_cannot_restore_retired_runtime_or_reference_fallback(self):
        for source in ["from jsonschema import Draft7Validator", "from ruamel.yaml import YAML"]:
            findings = MODULE.scan_text("python/src/umf/schema.py", source)
            self.assertEqual("retired-python-core-runtime", findings[0]["rule"])
        findings = MODULE.scan_text("bindings/core/node/index.js", "import {validateDocument} from '../../../../src/validation/document';")
        self.assertEqual("rust-binding-semantic-fallback", findings[0]["rule"])
        self.assertEqual([], MODULE.scan_text("bindings/core/node/tests/reference.test.js", "import {validateDocument} from '../../../../src/validation/document';"))
        self.assertEqual("rust-binding-semantic-fallback", MODULE.scan_text("bindings/core/node/src/reference.js", "import {validateDocument} from '../../../../src/validation/document';")[0]["rule"])
        self.assertEqual([], MODULE.scan_text("src/validation/document.ts", "import {validate} from './reference'"))

    def test_cross_package_private_import_is_rejected(self):
        findings = MODULE.scan_text("python/src/umf/example.py", "from umf_access._internal import private_api")
        self.assertEqual("cross-package-private-import", findings[0]["rule"])
        native_path = "python/umf_codegen/src/umf_codegen/_native.py"
        self.assertEqual([], MODULE.scan_text(native_path, "from umf._rust import _rust_core"))
        self.assertEqual("cross-package-private-import", MODULE.scan_text(native_path, "from umf._rust import other_private")[0]["rule"])

    def test_browser_library_rejects_node_engine_import(self):
        findings = MODULE.scan_text("src/model/example.ts", "import {runInNewContext} from 'node:vm';")
        self.assertEqual("forbidden-javascript-engine-import", findings[0]["rule"])

    def test_allowed_relative_typescript_import(self):
        self.assertEqual([], MODULE.scan_text("src/model/example.ts", "import {parse} from '../validation/index.js';"))

    def test_temporary_manifests_exercise_core_dependency_policy(self):
        with tempfile.TemporaryDirectory(prefix="umf-boundary-test-") as temp:
            root = Path(temp)
            allowed = root / "allowed.toml"
            forbidden = root / "forbidden.toml"
            allowed.write_text('[package]\nname="fixture"\nversion="0.1.0"\n[dependencies]\nserde="1"\n')
            forbidden.write_text('[package]\nname="fixture"\nversion="0.1.0"\n[dependencies]\npyo3="0.26"\n')
            self.assertEqual([], MODULE.core_dependency_findings(MODULE.fixture_manifest_dependencies(allowed)))
            self.assertEqual("host-dependency-in-rust-core-closure", MODULE.core_dependency_findings(MODULE.fixture_manifest_dependencies(forbidden))[0]["rule"])

    def test_production_dependency_closure_rejects_forbidden_crates(self):
        def report(source):
            with patch.object(MODULE, "cargo_tree", return_value={"status": "resolved", "stdout": source, "stderr": ""}), patch.object(MODULE.subprocess, "run", return_value=SimpleNamespace(stdout="host: x86_64-unknown-linux-gnu\n")):
                return MODULE.check_production_core()
        findings, reports = report("umf-core v0.1.0\nserde v1.0.219\n")
        self.assertEqual([], findings)
        self.assertTrue(all(item["status"] == "pass" for item in reports))
        for forbidden in ["getrandom", "wasm-bindgen", "jsonschema", "ahash", "pyo3", "v8", "boa_engine"]:
            findings, reports = report(f"umf-core v0.1.0\n{forbidden} v1.0.0\n")
            self.assertEqual(2 * len(MODULE.PRODUCTION_PACKAGES), len(findings), forbidden)
            self.assertTrue(all(item["status"] == "fail" for item in reports))

    def test_codegen_is_checked_on_host_and_wasm_without_entropy_exception(self):
        with patch.object(MODULE, "cargo_tree", return_value={"status": "resolved", "stdout": "umf-codegen v0.1.0\n", "stderr": ""}) as tree, patch.object(MODULE.subprocess, "run", return_value=SimpleNamespace(stdout="host: aarch64-apple-darwin\n")):
            findings, reports = MODULE.check_production_core()
        self.assertEqual([], findings)
        self.assertEqual({"aarch64-apple-darwin", "wasm32-unknown-unknown"}, {row["target"] for row in reports if row["package"] == "umf-codegen"})
        self.assertEqual(2, sum(call.args[2] == "umf-codegen" for call in tree.call_args_list))
        self.assertIn("crates/umf-codegen/src", MODULE.PRODUCTION_SOURCE_FOLDERS)

    def test_codegen_source_host_capability_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="umf-codegen-boundary-") as temp:
            root = Path(temp)
            source = root / "crates/umf-codegen/src"
            source.mkdir(parents=True)
            (source / "forbidden.rs").write_text("pub fn read() { std::fs::read(\"ambient\"); }\n")
            with patch.object(MODULE, "ROOT", root), patch.object(MODULE, "cargo_tree", return_value={"status": "resolved", "stdout": "umf-codegen v0.1.0\n", "stderr": ""}), patch.object(MODULE.subprocess, "run", return_value=SimpleNamespace(stdout="host: aarch64-apple-darwin\n")):
                findings, _ = MODULE.check_production_core()
            self.assertEqual(["production-core-host-capability"], [row["rule"] for row in findings])
            self.assertEqual("crates/umf-codegen/src/forbidden.rs", findings[0]["path"])



if __name__ == "__main__":
    unittest.main()

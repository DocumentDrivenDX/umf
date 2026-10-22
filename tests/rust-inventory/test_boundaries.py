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
    def test_current_v8_is_only_allowed_at_exact_pre_r4_sources(self):
        debt = {}
        for path, record in MODULE.V8_DEBT.items():
            debt[path] = record
        self.assertEqual([], MODULE.scan_text("python/umf_codegen/src/umf_codegen/_embedded.py", "from py_mini_racer import MiniRacer", allowed_debt=debt))
        self.assertTrue(MODULE.scan_text("python/umf_access/src/umf_access/values.py", "import py_mini_racer", allowed_debt=debt))

    def test_production_core_cannot_restore_retired_runtime_or_reference_fallback(self):
        for source in ["from jsonschema import Draft7Validator", "from ruamel.yaml import YAML"]:
            findings = MODULE.scan_text("python/src/umf/schema.py", source)
            self.assertEqual("retired-python-core-runtime", findings[0]["rule"])
        findings = MODULE.scan_text("bindings/core/node/index.js", "import {validateDocument} from '../../../../src/validation/document';")
        self.assertEqual("rust-binding-semantic-fallback", findings[0]["rule"])
        self.assertEqual([], MODULE.scan_text("src/validation/document.ts", "import {validate} from './reference'"))

    def test_cross_package_private_import_is_rejected(self):
        findings = MODULE.scan_text("python/src/umf/example.py", "from umf_access._internal import private_api")
        self.assertEqual("cross-package-private-import", findings[0]["rule"])

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

    def test_wasm_entropy_exception_is_target_path_feature_and_source_exact(self):
        edge = {"name": "getrandom", "version": "0.3.4"}
        js_sys = {"name": "js-sys", "version": "0.3.77"}
        binding = {"name": "umf-rust-spike-wasm", "version": "0.1.0"}
        good = dict(target="wasm32-unknown-unknown", wasm_bindgen_ids=["wasm-bindgen@0.2.100"],
                    paths=[MODULE.WASM_R1_ENTROPY_EXCEPTION["path"]], incoming_edges=[edge, js_sys, binding],
                    source_hashes=MODULE.WASM_R1_ENTROPY_EXCEPTION["sourceHashes"],
                    features={"ahash": ["default", "getrandom", "runtime-rng", "serde", "std"], "getrandom": ["default", "wasm_js"]})
        self.assertEqual("qualified-r1-wasm-entropy-exception", MODULE.qualify_wasm_entropy_exception(**good)["status"])
        direct = {**good, "paths": [["umf-rust-spike-core@0.1.0", "wasm-bindgen@0.2.100"]], "incoming_edges": [{"name": "umf-rust-spike-core", "version": "0.1.0"}, js_sys, binding]}
        self.assertEqual("unqualified", MODULE.qualify_wasm_entropy_exception(**direct)["status"])
        multiple = {**good, "incoming_edges": [*good["incoming_edges"], {"name": "other-package", "version": "1.0.0"}]}
        self.assertEqual("unqualified", MODULE.qualify_wasm_entropy_exception(**multiple)["status"])
        drift = {**good, "source_hashes": {**good["source_hashes"], "Cargo.lock": "drift"}}
        self.assertEqual("unqualified", MODULE.qualify_wasm_entropy_exception(**drift)["status"])

    def test_production_graph_has_no_spike_entropy_exception(self):
        def report(source):
            with patch.object(MODULE, "cargo_tree", return_value={"status": "resolved", "stdout": source, "stderr": ""}), patch.object(MODULE.subprocess, "run", return_value=SimpleNamespace(stdout="host: x86_64-unknown-linux-gnu\n")):
                return MODULE.check_production_core()
        findings, reports = report("umf-core v0.1.0\nserde v1.0.219\n")
        self.assertEqual([], findings)
        self.assertTrue(all(item["status"] == "pass" for item in reports))
        for forbidden in ["getrandom", "wasm-bindgen", "jsonschema", "ahash", "pyo3", "v8", "boa_engine"]:
            findings, reports = report(f"umf-core v0.1.0\n{forbidden} v1.0.0\n")
            self.assertEqual(6, len(findings), forbidden)
            self.assertTrue(all(item["status"] == "fail" for item in reports))

    def test_inverse_cargo_tree_reports_only_active_target_parents_and_path(self):
        fixture = """wasm-bindgen v0.2.100
├── getrandom v0.3.4
│   └── ahash v0.8.12
│       └── jsonschema v0.29.1
│           └── umf-rust-spike-core v0.1.0
├── js-sys v0.3.77
└── umf-rust-spike-wasm v0.1.0
"""
        direct, paths = MODULE.parse_inverse_cargo_tree(fixture)
        self.assertEqual(["getrandom@0.3.4", "js-sys@0.3.77", "umf-rust-spike-wasm@0.1.0"], direct)
        self.assertEqual([["wasm-bindgen@0.2.100", "getrandom@0.3.4", "ahash@0.8.12", "jsonschema@0.29.1", "umf-rust-spike-core@0.1.0"]], paths)
        self.assertNotIn("uuid@1.0.0", direct)

    def test_feature_tree_parser_captures_only_named_package_features(self):
        fixture = '''ahash v0.8.12
├── ahash feature "default"
│   └── jsonschema v0.29.1
├── ahash feature "runtime-rng"
│   └── ahash feature "getrandom"
└── getrandom feature "wasm_js"
'''
        self.assertEqual(["default", "getrandom", "runtime-rng"], MODULE.parse_cargo_feature_tree(fixture, "ahash"))


if __name__ == "__main__":
    unittest.main()

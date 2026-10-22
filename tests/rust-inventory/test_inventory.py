#!/usr/bin/env python3
"""Regression controls for exact dependency resolution in the R0 census."""
import importlib.util
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("rust_inventory", ROOT / "scripts/rust-inventory.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class InventoryDependencyTests(unittest.TestCase):
    def test_rust_input_identity_covers_embedded_data_but_excludes_artifacts(self):
        import tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            for name in ("crates/umf-core/src/schema_metas.json", "crates/umf-core/src/schema_metas.LICENSE",
                         "crates/umf-core/Cargo.toml", "crates/umf-core/vendor/saphyr-parser/.licenses/MIT-2023", "crates/umf-core/target/temporary.json",
                         "bindings/core/wasm/pkg/generated.js", "bindings/core/node/engine.node"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("first")
            with patch.object(MODULE, "ROOT", root):
                before = {item["path"]: item["sha256"] for item in MODULE.rust_build_inputs()}
                self.assertEqual({"crates/umf-core/src/schema_metas.json", "crates/umf-core/src/schema_metas.LICENSE", "crates/umf-core/Cargo.toml", "crates/umf-core/vendor/saphyr-parser/.licenses/MIT-2023"}, set(before))
                (root / "crates/umf-core/src/schema_metas.json").write_text("changed")
                after = {item["path"]: item["sha256"] for item in MODULE.rust_build_inputs()}
                self.assertNotEqual(before["crates/umf-core/src/schema_metas.json"], after["crates/umf-core/src/schema_metas.json"])

    def test_shared_transitive_keeps_exact_version_origins_and_disposition(self):
        package = {"dependencies": {"@typespec/compiler": "1.16.0", "ajv": "8.20.0"}, "devDependencies": {}}
        lock = {"packages": {
            "@typespec/compiler": ["@typespec/compiler@1.16.0", "", {"dependencies": {"ajv": "^8.20.0", "yaml": "^2.9.0"}}, "sha512-a"],
            "ajv": ["ajv@8.20.0", "", {"dependencies": {"fast-deep-equal": "^3.1.3"}}, "sha512-b"],
            "yaml": ["yaml@2.9.1", "", {}, "sha512-c"],
            "fast-deep-equal": ["fast-deep-equal@3.1.3", "", {}, "sha512-d"],
        }}
        closure = {item["name"]: item for item in MODULE.bun_closure(package, lock)}
        self.assertEqual("1.16.0", closure["@typespec/compiler"]["version"])
        self.assertEqual("8.20.0", closure["ajv"]["version"])
        self.assertEqual("2.9.1", closure["yaml"]["version"])
        ajv = closure["ajv"]
        self.assertEqual({"@typespec/compiler", "ajv"}, {origin["root"] for origin in ajv["origins"]})
        self.assertEqual("JSON Schema validators; present in production dependency closure, replace or explicitly retain with versioned family evidence", ajv["migrationDisposition"])
        self.assertEqual("8.20.0", ajv["directSpecifiers"][0]["specifier"])
        self.assertTrue(all(item.get("migrationDisposition") for item in closure.values()))

    def test_real_bun_lock_direct_versions_match_package_manifest(self):
        package = json.loads((ROOT / "package.json").read_text())
        lock_text = (ROOT / "bun.lock").read_text()
        lock = json.loads(re.sub(r",\s*([}\]])", r"\1", lock_text))
        closure = {item["name"]: item for item in MODULE.bun_closure(package, lock)}
        for name, version in {"@typespec/compiler": "1.16.0", "ajv": "8.20.0", "yaml": "2.9.1"}.items():
            self.assertEqual(version, closure[name]["version"])
        self.assertEqual([], [item["name"] for item in closure.values() if not item.get("migrationDisposition")])

    def test_python_toml_separates_runtime_optional_dev_and_build_groups(self):
        source = '''
[build-system]
requires = ["hatchling>=1.27,<2"]
build-backend = "hatchling.build"
[project]
name = "fixture"
dependencies = ["pydantic>=2.13,<3"]
[project.optional-dependencies]
docs = ["sphinx>=8"]
[dependency-groups]
dev = ["pytest>=8"]
'''
        declarations = MODULE.python_project_declarations(MODULE.tomllib.loads(source), "fixture/pyproject.toml")
        by_group = {entry["group"]: entry["package"] for entry in declarations}
        self.assertEqual({"project.dependencies": "pydantic", "project.optional-dependencies.docs": "sphinx",
                          "dependency-groups.dev": "pytest", "build-system.requires": "hatchling"}, by_group)
        self.assertNotIn("hatchling.build", by_group.values())

    def test_current_python_manifests_capture_runtime_names_not_build_backend(self):
        declarations = []
        for path in sorted((ROOT / "python").glob("*/pyproject.toml")) + [ROOT / "python/pyproject.toml"]:
            declarations.extend(MODULE.python_project_declarations(MODULE.tomllib.loads(path.read_text()), path.relative_to(ROOT).as_posix()))
        runtime = {(entry["projectName"], entry["package"]) for entry in declarations if entry["kind"] == "runtime"}
        self.assertIn(("umf-core", "pydantic"), runtime)
        # R2 retires Python schema/YAML execution in favor of the native engine.
        self.assertNotIn(("umf-core", "jsonschema"), runtime)
        self.assertNotIn(("umf-core", "ruamel-yaml"), runtime)
        self.assertEqual({"pydantic"}, {package for project, package in runtime if project == "umf-core"})
        self.assertIn(("umf-codegen", "mini-racer"), runtime)
        self.assertNotIn(("umf-core", "hatchling.build"), runtime)
        self.assertTrue(any(entry["kind"] == "build-requirement" and entry["package"] == "hatchling" for entry in declarations))


if __name__ == "__main__":
    unittest.main()

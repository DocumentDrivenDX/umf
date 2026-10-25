#!/usr/bin/env python3
"""Regression controls for exact dependency resolution in the R0 census."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("rust_inventory", ROOT / "scripts/rust-inventory.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)
SUCCESSOR_SPEC = importlib.util.spec_from_file_location(
    "rust_successor_inventory", ROOT / "scripts/rust-migration/r4/inventory/capture.py")
SUCCESSOR = importlib.util.module_from_spec(SUCCESSOR_SPEC)
assert SUCCESSOR_SPEC.loader is not None
SUCCESSOR_SPEC.loader.exec_module(SUCCESSOR)


class InventoryDependencyTests(unittest.TestCase):
    def test_successor_census_canonical_output_check_cannot_be_bypassed_by_explicit_path(self):
        with tempfile.TemporaryDirectory() as directory:
            canonical = Path(directory) / "census.json"
            diagnostic = Path(directory) / "candidate.json"
            with patch.object(SUCCESSOR, "OUT", canonical):
                self.assertTrue(SUCCESSOR.is_canonical_output(canonical))
                self.assertTrue(SUCCESSOR.is_canonical_output(canonical.parent / "." / canonical.name))
                self.assertFalse(SUCCESSOR.is_canonical_output(diagnostic))

    def test_stale_authority_blocks_canonical_writes_but_allows_read_only_check(self):
        with tempfile.TemporaryDirectory() as directory:
            canonical = Path(directory) / "census.json"
            with patch.object(SUCCESSOR, "OUT", canonical):
                self.assertTrue(SUCCESSOR.refuses_canonical_replace(canonical, "stale", check_only=False))
                self.assertFalse(SUCCESSOR.refuses_canonical_replace(canonical, "stale", check_only=True))
                self.assertFalse(SUCCESSOR.refuses_canonical_replace(canonical, "current", check_only=False))

    def test_matching_stale_census_cannot_pass_read_only_check(self):
        payload = '{"sourceCohortSha256":"same"}\n'
        self.assertFalse(SUCCESSOR.census_check_passes(payload, payload, "stale"))
        self.assertFalse(SUCCESSOR.census_check_passes(payload, payload, "missing"))
        self.assertFalse(SUCCESSOR.census_check_passes(payload, "different", "current"))
        self.assertTrue(SUCCESSOR.census_check_passes(payload, payload, "current"))

    def test_successor_census_binds_metamodel_sources_and_schema_outputs_to_fixed_point(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            model = root / "spec/metamodel/umf.yaml"
            schema = root / "spec/core/schema.json"
            generated = root / "src/generated/core-model.ts"
            for path, content in ((model, b"model-v1"), (schema, b"schema-v1"),
                                  (generated, b"generated-v1")):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
            sha = lambda value: __import__("hashlib").sha256(value).hexdigest()
            manifest = {
                "profile": "umf.metamodel.outputs/1",
                "sources": {"spec/metamodel/umf.yaml": sha(b"model-v1")},
                "outputs": {"spec/core/schema.json": {"sha256": sha(b"schema-v1")},
                            "src/generated/core-model.ts": {"sha256": sha(b"generated-v1")}},
            }
            manifest_path = root / "spec/metamodel/generated/manifest.json"
            manifest_path.parent.mkdir(parents=True)
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            snapshot = SUCCESSOR.metamodel_authority_snapshot(root)
            self.assertEqual("current", snapshot["manifestDigestStatus"])
            self.assertIn("manifest-digests-only", snapshot["verification"])
            self.assertEqual(["spec/core/schema.json"],
                             [item["path"] for item in snapshot["schemaInputs"]])
            self.assertTrue(all(item["matches"] for item in snapshot["sources"] + snapshot["outputs"]))

            model.write_bytes(b"model-v2")
            stale = SUCCESSOR.metamodel_authority_snapshot(root)
            self.assertEqual("stale", stale["manifestDigestStatus"])
            self.assertFalse(stale["sources"][0]["matches"])

            model.write_bytes(b"model-v1")
            generated.write_bytes(b"generated-v2")
            stale_output = SUCCESSOR.metamodel_authority_snapshot(root)
            self.assertEqual("stale", stale_output["manifestDigestStatus"])
            self.assertFalse(next(item for item in stale_output["outputs"]
                                  if item["path"] == "src/generated/core-model.ts")["matches"])

    def test_successor_census_reports_missing_or_invalid_metamodel_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.assertEqual("missing-manifest", SUCCESSOR.metamodel_authority_snapshot(root)["manifestDigestStatus"])
            manifest = root / "spec/metamodel/generated/manifest.json"
            manifest.parent.mkdir(parents=True)
            manifest.write_text("not json", encoding="utf-8")
            self.assertEqual("invalid-manifest", SUCCESSOR.metamodel_authority_snapshot(root)["manifestDigestStatus"])

    def test_successor_census_rejects_manifest_paths_outside_repository_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            model = root / "spec/metamodel/umf.yaml"
            schema = root / "spec/core/schema.json"
            generated = root / "src/generated/core-model.ts"
            for path in (model, schema, generated):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"fixture")
            manifest = {
                "profile": "umf.metamodel.outputs/1",
                "sources": {"spec/metamodel/umf.yaml": "0" * 64,
                            "../outside-secret": "1" * 64,
                            str(root.parent / "absolute-secret"): "4" * 64},
                "outputs": {"spec/core/schema.json": {"sha256": "2" * 64},
                            "src/generated/core-model.ts": {"sha256": "3" * 64}},
            }
            manifest_path = root / "spec/metamodel/generated/manifest.json"
            manifest_path.parent.mkdir(parents=True)
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            snapshot = SUCCESSOR.metamodel_authority_snapshot(root)
            self.assertEqual("invalid-manifest-paths", snapshot["manifestDigestStatus"])
            self.assertEqual([], snapshot["sources"])
            self.assertEqual([], snapshot["outputs"])

            outside = root.parent / "symlink-secret"
            outside.write_bytes(b"must not be read")
            link = root / "spec/metamodel/external.yaml"
            link.symlink_to(outside)
            manifest["sources"].pop("../outside-secret")
            manifest["sources"].pop(str(root.parent / "absolute-secret"))
            manifest["sources"]["spec/metamodel/external.yaml"] = "5" * 64
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            symlink_snapshot = SUCCESSOR.metamodel_authority_snapshot(root)
            self.assertEqual("invalid-manifest-paths", symlink_snapshot["manifestDigestStatus"])
            self.assertEqual([], symlink_snapshot["sources"])
            outside.unlink()

    def test_python_console_scripts_activate_only_resolved_authored_entrypoint_modules(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            manifest = root / "python/example/pyproject.toml"
            entrypoint = root / "python/example/src/pkg/cli.py"
            unrelated = root / "python/example/src/pkg/unused.py"
            for path in (manifest, entrypoint, unrelated):
                path.parent.mkdir(parents=True, exist_ok=True)
            manifest.write_text(
                '[project.scripts]\n"example-cli" = "pkg.cli:main.run"\n'
                '"external" = "other.cli:main"\n"no-callable" = "pkg.cli"\n'
                '"empty-callable" = "pkg.cli:"\n"empty-module" = ":main"\n'
                '"extra-target" = "pkg.cli:main unexpected"\n', encoding="utf-8")
            with patch.object(MODULE, "ROOT", root):
                roots = MODULE.python_console_entrypoint_roots([manifest], [entrypoint, unrelated])
            self.assertEqual({"python/example/src/pkg/cli.py": {"project.scripts:example-cli (python/example/pyproject.toml)"}}, roots)
            self.assertNotIn("python/example/src/pkg/unused.py", roots)

    def test_workflow_unittest_discovery_activates_only_matching_files_under_declared_start(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            selected = root / "tests/lifecycle/test_parser.py"
            another = root / "tests/lifecycle/test_other.py"
            outside = root / "tests/other/test_parser.py"
            for path in (selected, another, outside):
                path.parent.mkdir(parents=True, exist_ok=True)
            workflow_runs = {".github/workflows/optional.yml": [
                "python -m unittest discover -s tests/lifecycle -p test_parser.py",
                "python -I -m unittest discover -s tests/lifecycle -v",
                "python -m unittest tests.not_discovery",
            ]}
            with patch.object(MODULE, "ROOT", root):
                roots, unresolved = MODULE.workflow_unittest_discovery_roots(workflow_runs, [selected, another, outside])
            self.assertEqual({
                "tests/lifecycle/test_parser.py": {
                    "workflow:.github/workflows/optional.yml unittest discover -s tests/lifecycle -p test_parser.py",
                    "workflow:.github/workflows/optional.yml unittest discover -s tests/lifecycle -p test*.py",
                },
                "tests/lifecycle/test_other.py": {
                    "workflow:.github/workflows/optional.yml unittest discover -s tests/lifecycle -p test*.py",
                },
            }, roots)
            self.assertEqual([], unresolved)
            self.assertNotIn("tests/other/test_parser.py", roots)

    def test_workflow_unittest_discovery_ignores_comments_help_malformed_and_broad_flags(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            selected = root / "tests/lifecycle/test_parser.py"
            for path in (selected,):
                path.parent.mkdir(parents=True, exist_ok=True)
            workflow_runs = {".github/workflows/optional.yml": [
                "# python -m unittest discover -s tests/lifecycle -p test_parser.py",
                "python -m unittest discover --help",
                "python -m unittest discover -s",
                "python -m unittest discover -p test_parser.py",
                "python -m unittest discover -s . -p test_parser.py",
                "python -m unittest discover -s ../outside -p test_parser.py",
                "python -m unittest discover -s tests/lifecycle -p '*.py'",
                "python -m unittest discover -s tests/lifecycle -p test_parser.py --unknown",
                "python -m unittest discover -s tests/lifecycle -p 'unterminated",
                "cat <<'TEXT'\npython -m unittest discover -s tests/lifecycle -p test_parser.py\nTEXT",
                'echo "python -m unittest discover -s tests/lifecycle -p test_parser.py\n"',
                "python -m unittest discover \\\n-s tests/lifecycle -p test_parser.py",
            ]}
            with patch.object(MODULE, "ROOT", root):
                roots, unresolved = MODULE.workflow_unittest_discovery_roots(workflow_runs, [selected])
            self.assertEqual({}, roots)
            self.assertEqual(11, len(unresolved))
            self.assertTrue(all(item["workflow"] == ".github/workflows/optional.yml" for item in unresolved))
            self.assertTrue(all(len(item["commandSha256"]) == 64 for item in unresolved))
            self.assertEqual({
                "unsupported-or-incomplete-unittest-discovery-options",
                "unbounded-or-out-of-root-unittest-start-directory",
                "unbounded-or-invalid-unittest-pattern",
                "malformed-unittest-discovery-command",
                "multiline-unittest-discovery-run-block-not-admitted",
            }, {item["reason"] for item in unresolved})

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

    def test_environment_presence_does_not_change_authored_source_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            authored = ["python/src/umf/owned.py", "python/src/venv/owned.py",
                        "python/src/environment_helpers.py", "scripts/owned.ts"]
            for name in authored:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("def owned(): pass" if path.suffix == ".py" else "export function owned() {}")
            with patch.object(MODULE, "ROOT", root):
                before = MODULE.source_files([root / "python", root / "scripts"])
                generated = ["python/.venv/bin/activate_this.py",
                             "python/nested/.venv/lib/python3.13/site-packages/vendor.py",
                             "python/venv/pyvenv.cfg", "python/venv/Scripts/activate_this.py",
                             "python/custom-name/pyvenv.cfg", "python/custom-name/bin/generated.py",
                             "python/.tox/py311/vendor.py", "python/.nox/test/vendor.py",
                             "python/lib/python3.12/site-packages/vendor.py",
                             "python/Lib/site-packages/vendor.py",
                             "python/lib/python3/dist-packages/vendor.py"]
                for name in generated:
                    path = root / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text("generated environment content is not Python source")
                self.assertEqual(before, MODULE.source_files([root / "python", root / "scripts"]))
                self.assertEqual(set(authored), {MODULE.rel(path) for path in before})

    def test_environment_symlinks_cannot_alias_authored_or_installed_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            owned = root / "python/src/owned.py"
            installed = root / "python/.venv/vendor.py"
            for path in [owned, installed]:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("def value(): pass")
            generated_alias = root / "python/.venv/alias.py"
            generated_alias.symlink_to(owned)
            authored_alias = root / "python/installed-alias.py"
            authored_alias.symlink_to(installed)
            regular_alias = root / "python/owned-alias.py"
            regular_alias.symlink_to(owned)
            with patch.object(MODULE, "ROOT", root):
                self.assertEqual([], MODULE.tracked_or_existing([generated_alias, authored_alias]))
                self.assertEqual([owned], MODULE.tracked_or_existing([regular_alias, owned]))

    def test_source_parse_errors_are_explicit_instead_of_zero_symbol_captures(self):
        for capture in [MODULE.algorithm_names, MODULE.py_symbols]:
            with self.assertRaisesRegex(RuntimeError, "broken.py.*never silently omits"):
                capture(Path("broken.py"), "def broken(: pass")
        self.assertEqual(["owned"], MODULE.algorithm_names(Path("owned.py"), "def owned(): pass"))

    def test_old_inventory_interpreter_refuses_before_any_capture(self):
        with patch.object(MODULE.sys, "version_info", (3, 9)), patch.object(MODULE.subprocess, "check_output") as capture:
            error = io.StringIO()
            with contextlib.redirect_stderr(error):
                self.assertEqual(2, MODULE.main())
            self.assertIn("requires Python 3.11", error.getvalue())
            capture.assert_not_called()

    def test_check_ignores_environment_drift_but_refuses_real_source_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / "scripts").mkdir()
            source = root / "scripts/owned.py"
            source.write_text("def owned(): pass")
            for name, value in {"package.json": {}, "bun.lock": {"packages": {}}}.items():
                (root / name).write_text(json.dumps(value))
            for name in ["Cargo.toml", "Cargo.lock"]:
                (root / name).write_text("")
            golden = root / "golden.json"
            capture = json.dumps({"typescriptVersion": "fixture", "files": {}})
            with patch.object(MODULE, "ROOT", root), patch.object(MODULE, "OUT", golden), patch.object(MODULE, "__file__", str(root / "scripts/rust-inventory.py")), patch.object(MODULE.subprocess, "check_output", return_value=capture):
                with patch.object(MODULE.sys, "argv", ["rust-inventory.py"]), contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(0, MODULE.main())
                before = golden.read_bytes()
                generated = root / "python/arbitrary-environment"
                generated.mkdir(parents=True)
                (generated / "pyvenv.cfg").write_text("home = /python")
                (generated / "vendor.py").write_text("def installed_only(): pass")
                with patch.object(MODULE.sys, "argv", ["rust-inventory.py", "--check"]), contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(0, MODULE.main())
                self.assertEqual(before, golden.read_bytes())
                source.write_text("def owned(): pass\ndef authored_change(): pass")
                error = io.StringIO()
                with patch.object(MODULE.sys, "argv", ["rust-inventory.py", "--check"]), contextlib.redirect_stderr(error):
                    self.assertEqual(1, MODULE.main())
                self.assertIn("Rust inventory is stale", error.getvalue())
                self.assertEqual(before, golden.read_bytes())

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
        self.assertIn(("umf-codegen", "umf-core"), runtime)
        self.assertIn(("umf_access", "umf-core"), runtime)
        self.assertFalse(any(package == "mini-racer" for _, package in runtime))
        self.assertNotIn(("umf-core", "hatchling.build"), runtime)
        self.assertTrue(any(entry["kind"] == "build-requirement" and entry["package"] == "hatchling" for entry in declarations))


if __name__ == "__main__":
    unittest.main()

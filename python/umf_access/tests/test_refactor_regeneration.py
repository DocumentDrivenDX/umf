"""Generator-backed US-082-AC4 proof. Host tooling, never shipped runtime code.

Uses an exact installed runtime wheel; generated modules come only from the
actual stage-one generator. Source compatibility is distinct from value/native
and installed-target compatibility, which this test does not claim.
"""
import ast
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs/helix/04-build/evidence/typed-persistence"
CHECKER_BIN = Path("/private/tmp/umf-tp001-compat-env/bin")
sys.path.insert(0, str(Path(__file__).parent / "packaging"))
from replay_installed import inspect_wheel, verify_installed_files


class RefactorByRegeneration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix="umf-b005-refactor-", dir="/private/tmp")
        cls.generated = Path(cls.folder.name)
        snapshot_path = Path(os.environ.get("UMF_ACCESS_INSTALLED_SNAPSHOT", str(EVIDENCE / "production-packaging/stable-runtime-checkpoint.json")))
        cls.snapshot = json.loads(snapshot_path.read_text())
        cls.report = {"scope": "real generator, source-compatibility/refactor typing, exact installed runtime; not full STP or native acceptance", "snapshot": cls.snapshot, "checks": []}
        wheel = Path(cls.snapshot["wheel"])
        if hashlib.sha256(wheel.read_bytes()).hexdigest() != cls.snapshot["wheelSha256"]:
            raise AssertionError("wheel bytes differ from immutable snapshot")
        cls.env = {k: v for k, v in os.environ.items() if k not in {"PYTHONPATH", "PYTHONHOME", "MYPYPATH", "VIRTUAL_ENV", "CONDA_PREFIX"}}
        probe = subprocess.run([cls.snapshot["python"], "-I", "-B", "-c", "import umf_access, importlib.metadata as m, json,sys; print(json.dumps({'file':umf_access.__file__,'abi':umf_access.RUNTIME_ABI,'version':m.version('umf_access'),'pydantic':m.version('pydantic'),'python':sys.version_info[:3]}))"], cwd="/private/tmp", env=cls.env, capture_output=True, text=True, check=True)
        cls.probe = json.loads(probe.stdout)
        if cls.probe["abi"] != "umf-access-runtime/0.1" or cls.probe["version"] != "0.1.0.dev0" or cls.probe["pydantic"] != "2.14.1" or cls.probe["python"] != [3, 14, 8]:
            raise AssertionError("installed profile mismatch")
        site = Path(cls.probe["file"]).parent.parent
        if "/site-packages/" not in cls.probe["file"] or not str(site).startswith(str(Path(cls.snapshot["python"]).parents[1])):
            raise AssertionError("runtime lookup used development fallback")
        pin = {"distribution": "umf_access", "version": cls.probe["version"], "abi": cls.probe["abi"]}
        verify_installed_files(inspect_wheel(wheel, pin), site)
        cls.compiler_inputs = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for directory in (ROOT / "src", ROOT / "spec") for p in directory.rglob("*") if p.is_file() and p.suffix in (".ts", ".json")}
        command = ["bun", str(EVIDENCE / "b-tp-005-generate-corpus.ts"), str(cls.generated)]
        generated = subprocess.run(command, cwd=ROOT, env=cls.env, capture_output=True, text=True, check=False)
        cls.report["generation"] = {"command": command, "exitCode": generated.returncode, "stdout": generated.stdout, "stderr": generated.stderr}
        if generated.returncode:
            raise AssertionError("real generator refused fixture; not a typing-negative pass")
        cls.generation = json.loads((EVIDENCE / "b-tp-005-generated-corpus.json").read_text())
        if cls.generation["destination"] != str(cls.generated):
            raise AssertionError("generation evidence was overwritten concurrently")
        cls.addClassCleanup(cls.folder.cleanup)

    @classmethod
    def tearDownClass(cls):
        cls.report["compilerSourceSha256"] = cls.compiler_inputs
        cls.report["changedCompilerInputs"] = [name for name, digest in cls.compiler_inputs.items() if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest]
        cls.report["installedLookup"] = cls.probe
        cls.report["generatedInputs"] = [{"variant": o["variant"], "inputDigest": o["inputDigest"], "snapshotIdentity": o["snapshotIdentity"], "snapshotPath": o["snapshotPath"]} for o in cls.generation["outcomes"]]
        cls.report["passed"] = not cls.report["changedCompilerInputs"] and all(c["passed"] for c in cls.report["checks"]) and len({c["stage"] for c in cls.report["checks"]}) == 3
        (EVIDENCE / "b-tp-005-refactor-integration.json").write_text(json.dumps(cls.report, indent=2) + "\n")

    def record(self, stage, passed, **details):
        self.report["checks"].append({"stage": stage, "passed": passed, **details})
        self.assertTrue(passed, details)

    # @covers US-082-AC4
    def test_refactor_by_regeneration(self):
        expected = json.loads((ROOT / "tests/compilation/python/static/queries/refactor/expected.json").read_text())
        source = ROOT / "tests/compilation/python/static/queries/refactor/unchanged.py"
        for case in expected["cases"]:
            generated_root = self.generated / case["variant"]
            config = self.generated / (case["variant"] + "-pyright.json")
            config.write_text(json.dumps({"extends": str(EVIDENCE / "dsl-typing-spike/compatibility/pyrightconfig.json"), "extraPaths": [str(generated_root)]}))
            commands = {
                "pyright": [str(CHECKER_BIN / "pyright"), "--project", str(config), "--pythonpath", self.snapshot["python"], "--outputjson", str(source)],
                "mypy": [str(CHECKER_BIN / "mypy"), "--python-executable", self.snapshot["python"], "--config-file", str(EVIDENCE / "dsl-typing-spike/compatibility/mypy.ini"), str(source)],
            }
            for checker, command in commands.items():
                env = {**self.env, "MYPYPATH": str(generated_root), "MYPY_CACHE_DIR": str(self.generated / ("cache-" + case["variant"])), "PYTHONDONTWRITEBYTECODE": "1"}
                run = subprocess.run(command, cwd="/private/tmp", env=env, capture_output=True, text=True, check=False)
                if checker == "pyright":
                    diagnostics = json.loads(run.stdout)["generalDiagnostics"]
                    actual = [{"line": d["range"]["start"]["line"] + 1, "rule": d.get("rule")} for d in diagnostics if d["severity"] == "error"]
                    wanted = case["observedPyright"]
                else:
                    actual = [{"line": int(m[0]), "rule": m[1]} for m in re.findall(r":(\d+): error: [^\n]*  \[([a-z-]+)\]$", run.stdout, re.MULTILINE)]
                    wanted = case["observedMypy"]
                passed = actual == wanted and run.returncode == (1 if wanted else 0) and not run.stderr
                self.record("typing", passed, variant=case["variant"], checker=checker, command=command, actual=actual, expected=wanted, exitCode=run.returncode, stdout=run.stdout, stderr=run.stderr)

    # @covers US-082-AC4
    def test_source_pointer_attribute_docstrings(self):
        checked = 0
        for outcome in self.generation["outcomes"]:
            package = Path(outcome["output"]) / "commerce"
            sources = json.loads((package / "_umf/sources.json").read_text())
            document = json.loads(next(s["text"] for s in sources if s["id"] == "logical"))
            tree = ast.parse((package / "fields.py").read_text())
            for columns in [n for n in tree.body if isinstance(n, ast.ClassDef) and n.name.endswith("Columns")]:
                for index, statement in enumerate(columns.body):
                    if not isinstance(statement, ast.AnnAssign) or not isinstance(statement.annotation, ast.Subscript) or not isinstance(statement.annotation.value, ast.Name) or statement.annotation.value.id != "Column":
                        continue
                    keywords = {k.arg: ast.literal_eval(k.value) for k in statement.value.args[0].keywords}
                    module_index, module = next((i, m) for i, m in enumerate(document["modules"]) if m["id"] == keywords["field_module"])
                    field_index = next(i for i, f in enumerate(module["elements"]) if f["id"] == keywords["field"])
                    pointer = f"/modules/{module_index}/elements/{field_index}"
                    following = columns.body[index + 1] if index + 1 < len(columns.body) else None
                    text = following.value.value if isinstance(following, ast.Expr) and isinstance(following.value, ast.Constant) and isinstance(following.value.value, str) else ""
                    self.record("docstrings", pointer in text, variant=outcome["variant"], column=statement.target.id, expectedPointer=pointer, docstring=text)
                    checked += 1
        self.assertGreater(checked, 0)

    # @covers US-082-AC4
    def test_manifest_diff_marks_source_changes(self):
        expected = {"memo-rename": ("Order.c.memo", "breaking"), "amount-retype": ("Order.c.amount", "breaking"), "memo-remove": ("Order.c.memo", "breaking"), "memo-rename-with-names-override": ("Order.c.memo", "source-compatible")}
        base = self.generation["outcomes"][0]
        for outcome in self.generation["outcomes"][1:]:
            symbol, classification = expected[outcome["variant"]]
            matched = [c for c in outcome["changes"] if c["symbol"] == symbol and c["role"] == "fields"]
            self.record("classification", len(matched) == 1 and matched[0]["classification"] == classification and outcome["inputDigest"] != base["inputDigest"], variant=outcome["variant"], expectedSymbol=symbol, expectedClassification=classification, actual=matched)


if __name__ == "__main__":
    unittest.main()

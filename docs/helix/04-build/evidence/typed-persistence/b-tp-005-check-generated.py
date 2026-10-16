"""Exact real-generated query typing replay against a pinned installed runtime.

No stage-two stand-ins. Restore only byte-verified real stage-one candidate data.
"""
from pathlib import Path
import hashlib
import importlib.metadata
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[5]
EVIDENCE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "python/umf_access/tests/packaging"))
from replay_installed import inspect_wheel, verify_installed_files, safe_relative, check_generated_inventory
from snapshot_runtime import generated_snapshot_identity

for package, version in {"pydantic": "2.14.1", "mypy": "2.4.0", "pyright": "1.1.414"}.items():
    if importlib.metadata.version(package) != version:
        raise SystemExit("wrong checker dependency pin: " + package)
refactor = json.loads((EVIDENCE / "b-tp-005-refactor-integration.json").read_text())
if not refactor["passed"]:
    raise SystemExit("refactor generation was not a coherent passing checkpoint")
base = next(o for o in refactor["generatedInputs"] if o["variant"] == "base")
artifact_path = Path(base["snapshotPath"])
artifact = json.loads(artifact_path.read_text())
snapshot = json.loads((EVIDENCE / "production-packaging/stable-runtime-checkpoint.json").read_text())
identity, _ = generated_snapshot_identity(snapshot["wheelSha256"], artifact["generatorSourceDigest"], artifact["inputDigest"])
if identity != base["snapshotIdentity"] or identity != artifact_path.stem or artifact["wheelSha256"] != snapshot["wheelSha256"]:
    raise SystemExit("generated/runtime composite snapshot mismatch")
wheel = Path(snapshot["wheel"])
if hashlib.sha256(wheel.read_bytes()).hexdigest() != snapshot["wheelSha256"]:
    raise SystemExit("wheel bytes changed")
env = {k: v for k, v in os.environ.items() if k not in {"PYTHONPATH", "PYTHONHOME", "MYPYPATH", "VIRTUAL_ENV", "CONDA_PREFIX"}}
probe = subprocess.run([snapshot["python"], "-I", "-B", "-c", "import umf_access,json; print(json.dumps({'file':umf_access.__file__,'abi':umf_access.RUNTIME_ABI}))"], cwd="/private/tmp", env=env, capture_output=True, text=True, check=True)
lookup = json.loads(probe.stdout)
site = Path(lookup["file"]).parent.parent
if not str(site).startswith(str(Path(snapshot["python"]).parents[1])) or lookup["abi"] != "umf-access-runtime/0.1":
    raise SystemExit("development runtime fallback")
verify_installed_files(inspect_wheel(wheel, artifact["result"]["runtimeAbi"]), site)
expected_path = ROOT / "tests/compilation/python/static/queries/negative/expected.json"
expected = json.loads(expected_path.read_text())
cases = [c for c in expected["cases"] if not c["file"].startswith("runtime_") and "observedPyright" in c]
results = []
source_hashes = {}
with tempfile.TemporaryDirectory(prefix="umf-b005-static-", dir="/private/tmp") as directory:
    generated = Path(directory)
    for member in artifact["result"]["files"]:
        relative = safe_relative(member["path"])
        if relative.parts[0] != "commerce" or relative.name == "queries.py":
            raise SystemExit("unexpected stage-one path")
        data = member["text"].encode()
        if hashlib.sha256(data).hexdigest() != member["sha256"]:
            raise SystemExit("generated snapshot member bytes differ")
        path = generated.joinpath(*relative.parts)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as stream:
            stream.write(data)
    check_generated_inventory(generated, json.loads((generated / "commerce/_umf/manifest.json").read_text()))
    config = generated / "pyright.json"
    config.write_text(json.dumps({"extends": str(EVIDENCE / "dsl-typing-spike/compatibility/pyrightconfig.json"), "extraPaths": [str(generated)]}))
    positive = sorted((ROOT / "tests/compilation/python/static/queries/positive").glob("*.py"))
    generated_python = sorted((generated / "commerce").glob("*.py"))
    batches = [("positive", positive, None), ("generated-package", generated_python, None)]
    batches += [(case["file"], [expected_path.parent / case["file"]], case) for case in cases]
    for name, sources, case in batches:
        for source in sources:
            source_hashes[str(source)] = hashlib.sha256(source.read_bytes()).hexdigest()
        for checker in ("pyright", "mypy"):
            executable = str(Path(sys.executable).parent / checker)
            if checker == "pyright":
                command = [executable, "--project", str(config), "--pythonpath", snapshot["python"], "--outputjson", *map(str, sources)]
            else:
                command = [executable, "--python-executable", snapshot["python"], "--config-file", str(EVIDENCE / "dsl-typing-spike/compatibility/mypy.ini"), *map(str, sources)]
            run = subprocess.run(command, cwd="/private/tmp", env={**env, "MYPYPATH": str(generated), "MYPY_CACHE_DIR": str(generated / "cache"), "PYTHONDONTWRITEBYTECODE": "1"}, capture_output=True, text=True)
            if checker == "pyright":
                diagnostics = json.loads(run.stdout)["generalDiagnostics"]
                actual = [{"line": d["range"]["start"]["line"] + 1, "rule": d.get("rule")} for d in diagnostics if d["severity"] == "error"]
                wanted = [] if case is None else case["observedPyright"]
            else:
                actual = [{"line": int(m[0]), "rule": m[1]} for m in re.findall(r":(\d+): error: [^\n]*  \[([a-z-]+)\]$", run.stdout, re.MULTILINE)]
                wanted = [] if case is None else case["observedMypy"]
            passed = actual == wanted and run.returncode == (1 if wanted else 0) and not run.stderr
            if "reportMissingImports" in run.stdout or "import-not-found" in run.stdout:
                passed = False
            results.append({"case": name, "checker": checker, "command": command, "exitCode": run.returncode, "actual": actual, "expected": wanted, "passed": passed, "stdout": run.stdout, "stderr": run.stderr})
    config_sha = hashlib.sha256(config.read_bytes()).hexdigest()
report = {"scope": "exact installed runtime plus real stage-one generated query/static corpora; not full STP, stage-two or native acceptance", "wheelSha256": snapshot["wheelSha256"], "runtimeLookup": lookup, "generatedSnapshot": str(artifact_path), "snapshotIdentity": identity, "sourceSha256": source_hashes, "expectedSha256": hashlib.sha256(expected_path.read_bytes()).hexdigest(), "pyrightOverlaySha256": config_sha, "results": results, "passed": all(r["passed"] for r in results), "untested": [c["file"] for c in expected["cases"] if c["pyright"] is None]}
(EVIDENCE / "b-tp-005-generated-checks.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"real generated/installed typing: {sum(r['passed'] for r in results)}/{len(results)} exact checks passed")
for result in results:
    if not result["passed"]:
        print(result["case"], result["checker"], result["actual"])
raise SystemExit(0 if report["passed"] else 1)

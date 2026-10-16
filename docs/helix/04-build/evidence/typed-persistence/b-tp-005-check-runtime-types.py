"""Replay exact runtime typing diagnostics; does not qualify generated commerce."""
from pathlib import Path
import hashlib
import importlib.metadata
import json
import os
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[5]
evidence = Path(__file__).resolve().parent
profile = evidence / "dsl-typing-spike/compatibility/profile.json"
expected = root / "tests/compilation/python/static/queries/negative/expected.json"
config = evidence / "b-tp-005-pyrightconfig.json"
for package, version in {"pydantic": "2.14.1", "mypy": "2.4.0", "pyright": "1.1.414"}.items():
    if importlib.metadata.version(package) != version:
        raise SystemExit(f"wrong dependency pin: {package}")
if sys.version_info[:3] != (3, 14, 8):
    raise SystemExit("wrong interpreter pin")
env = {**os.environ, "MYPYPATH": str(root / "python/umf_access/src"),
       "MYPY_CACHE_DIR": "/private/tmp/umf-b005-mypy-cache", "PYTHONDONTWRITEBYTECODE": "1"}
cases = [c for c in json.loads(expected.read_text())["cases"] if c["file"].startswith("runtime_")]
positive = root / "tests/compilation/python/static/queries/positive/runtime_types.py"
results = []
for source, case in [(positive, None), *[(expected.parent / c["file"], c) for c in cases]]:
    for checker in ("pyright", "mypy"):
        if checker == "pyright":
            command = [str(Path(sys.executable).parent / checker), "--project", str(config), "--pythonpath", sys.executable, "--outputjson", str(source)]
        else:
            command = [str(Path(sys.executable).parent / checker), "--config-file", str(evidence / "dsl-typing-spike/compatibility/mypy.ini"), str(source)]
        run = subprocess.run(command, cwd=root, env=env, capture_output=True, text=True)
        if checker == "pyright":
            parsed = json.loads(run.stdout)
            actual = [{"line": d["range"]["start"]["line"] + 1, "rule": d.get("rule")} for d in parsed["generalDiagnostics"] if d["severity"] == "error"]
            wanted = [] if case is None else case["observedPyright"]
        else:
            actual = [{"line": int(m[0]), "rule": m[1]} for m in re.findall(r":(\d+): error: [^\n]*  \[([a-z-]+)\]$", run.stdout, re.MULTILINE)]
            wanted = [] if case is None else case["observedMypy"]
        passed = actual == wanted and run.returncode == (0 if case is None else 1) and not run.stderr
        if "import-not-found" in run.stdout or "reportMissingImports" in run.stdout:
            passed = False
        results.append({"file": str(source.relative_to(root)), "checker": checker, "command": command, "exitCode": run.returncode,
                        "actual": actual, "expected": wanted, "passed": passed, "stdout": run.stdout, "stderr": run.stderr})
report = {"scope": "production runtime source typing subset; not generated-package/STP-082 acceptance", "profile": str(profile.relative_to(root)),
          "configSha256": hashlib.sha256(config.read_bytes()).hexdigest(), "results": results,
          "passed": all(r["passed"] for r in results)}
(evidence / "b-tp-005-runtime-types-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"runtime typing: {sum(r['passed'] for r in results)}/{len(results)} exact diagnostic checks passed")
raise SystemExit(0 if report["passed"] else 1)

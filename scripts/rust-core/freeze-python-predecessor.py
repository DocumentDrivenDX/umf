# SPDX-License-Identifier: MIT OR Apache-2.0
"""Capture Python predecessor observations from an isolated origin/main source archive."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REF = os.environ.get("UMF_PYTHON_BASELINE_REF", "origin/main")
OUTPUT = ROOT / "docs/helix/04-build/evidence/rust-migration/r2"
ARCHIVE_PATHS = (
    "python/src/umf",
    "spec/core",
    "spec/metamodel/generated",
    "spec/extensions/domain-pack",
    "spec/extensions/dataset-source",
    "fixtures/metamodel/current-conformance.json",
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    revision = subprocess.check_output(["git", "rev-parse", "--verify", REF], cwd=ROOT, text=True).strip()
    tar_bytes = subprocess.check_output(["git", "archive", "--format=tar", revision, *ARCHIVE_PATHS], cwd=ROOT)
    with tempfile.TemporaryDirectory(prefix="umf-r2-python-predecessor-") as directory:
        temp = Path(directory)
        with tarfile.open(fileobj=__import__("io").BytesIO(tar_bytes), mode="r:") as archive:
            archive.extractall(temp, filter="data")
        python_source = temp / "python/src"
        fixture = temp / "fixtures/metamodel/current-conformance.json"
        runner = r'''import json, sys
from umf import Diagnostic, Extension, Registry, validate_document
corpus=json.load(open(sys.argv[1],encoding="utf-8"))
out=[]
for case in corpus["cases"]:
 registry=Registry()
 spec=case.get("registry")
 if spec is not None:
  def callback(payload, context):
   return [Diagnostic("BASELINE_CALLBACK",context["path"],f'{context["document"]["id"]}:{context["scope"]}:{payload["kind"]}',"warning")]
  registry.register(Extension(spec["id"],spec["version"],(spec["scope"],),True,callback))
 try:
  value=validate_document(case["document"],registry)
  result={"valid":value.valid,"complete":value.complete,"diagnostics":[item.__dict__ for item in value.diagnostics]}
  out.append({"id":case["id"],"outcome":result,"error":None})
 except BaseException as error:
  out.append({"id":case["id"],"outcome":None,"error":{"type":type(error).__name__,"message":str(error)}})
print(json.dumps({"package":__import__("umf").__file__,"outcomes":out},ensure_ascii=True,separators=(",",":")))
'''
        env = {**os.environ, "PYTHONPATH": str(python_source)}
        python = env.get("UMF_PREDECESSOR_PYTHON") or env.get("UMF_PYTHON") or env.get("PYTHON_SYS_EXECUTABLE") or "python3.11"
        result = subprocess.run([python, "-c", runner, str(fixture)], cwd=temp, env=env, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(f"Predecessor capture failed ({result.returncode}): {result.stderr}")
        captured = json.loads(result.stdout)
        if not Path(captured["package"]).resolve().is_relative_to(python_source.resolve()):
            raise RuntimeError(f"Imported non-archived Python package: {captured['package']}")
        corpus = json.loads(fixture.read_text(encoding="utf-8"))
        if len(captured["outcomes"]) != 139:
            raise RuntimeError("Predecessor did not produce exactly 139 outcomes")
        source_files = sorted((temp / "python/src/umf").rglob("*.py"))
        source_digest = hashlib.sha256()
        for path in source_files:
            relative = path.relative_to(temp).as_posix().encode()
            source_digest.update(len(relative).to_bytes(4, "big"))
            source_digest.update(relative)
            source_digest.update(path.read_bytes())
        expected = {case["id"]: {
            "valid": case["valid"], "complete": case["complete"], "diagnostics": case["diagnostics"]
        } for case in corpus["cases"]}
        disagreements = []
        for item in captured["outcomes"]:
            if item["outcome"] != expected[item["id"]] or item["error"] is not None:
                disagreements.append(item)
        receipt = {
            "id": "umf.rust-migration.r2.python-predecessor-baseline",
            "status": "captured-predecessor-observations",
            "sourceRef": REF,
            "sourceCommit": revision,
            "sourcePackage": "python/src/umf from git archive, imported outside the checkout",
            "pythonSourceFileCount": len(source_files),
            "pythonSourceSha256": source_digest.hexdigest(),
            "fixture": "fixtures/metamodel/current-conformance.json",
            "fixtureSha256": sha256(fixture.read_bytes()),
            "cases": 139,
            "outcomes": sum(item["outcome"] is not None for item in captured["outcomes"]),
            "errors": sum(item["error"] is not None for item in captured["outcomes"]),
            "disagreementCount": len(disagreements),
            "disagreementIds": [item["id"] for item in disagreements],
            "note": "Historical Python observations are captured for review; they are not treated as a correctness oracle. Resolve disagreements against frozen requirements before describing target semantics.",
        }
        payload = {"receipt": receipt, "outcomes": captured["outcomes"], "disagreements": disagreements}
        OUTPUT.mkdir(parents=True, exist_ok=True)
        for name, data in (
            ("baseline-python-predecessor.json", payload),
            ("baseline-python-predecessor-receipt.json", receipt),
        ):
            path = OUTPUT / name
            encoded = (json.dumps(data, ensure_ascii=True, indent=2) + "\n").encode()
            if path.exists():
                if path.read_bytes() != encoded:
                    raise RuntimeError(f"Refusing to overwrite frozen Python baseline {path}")
            else:
                path.write_bytes(encoded)
        print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

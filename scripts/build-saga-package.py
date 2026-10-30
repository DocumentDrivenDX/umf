#!/usr/bin/env python3
"""Generate the opt-in saga extension package from reviewed contract inputs.

ADR-005 core definitions remain owned by spec/metamodel/umf.yaml. Saga is an
independently versioned extension: its reviewed schemas remain the sole shape
inputs until separately migrated into the metamodel language.
"""
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "schema.json": "docs/helix/02-design/contracts/schemas/saga-0.1.0.schema.json",
    "runtime.schema.json": "docs/helix/02-design/contracts/schemas/saga-runtime-1.schema.json",
}
def render():
    outputs = {}
    sources = {}
    for name, source in SOURCES.items():
        data = (ROOT / source).read_bytes()
        sources[source] = hashlib.sha256(data).hexdigest()
        outputs[name] = data
    schema = json.loads(outputs["schema.json"])
    package = {"id": "umf.actions.saga", "version": "0.1.0", "coreVersion": "0.10.0",
        "description": "Sequential saga declarations; host execution requires independent qualification.",
        "schema": schema, "semantics": "CONTRACT-908; portable analysis only; registration grants no execution authority.",
        "scopes": ["module"], "capabilities": {"validation": "semantic", "directions": [], "evidence": []}}
    outputs["package.json"] = (json.dumps(package, ensure_ascii=False, indent=2) + "\n").encode()
    outputs["generated.json"] = (json.dumps({"generator": "scripts/build-saga-package.py", "sources": sources,
        "outputs": {name: hashlib.sha256(data).hexdigest() for name, data in outputs.items()}}, indent=2) + "\n").encode()
    return outputs
if __name__ == "__main__":
    target = ROOT / "spec/extensions/saga"
    outputs = render()
    if "--check" in sys.argv:
        bad = [name for name, data in outputs.items() if not (target / name).is_file() or (target / name).read_bytes() != data]
        if bad:
            raise SystemExit("Stale saga generated outputs: " + ", ".join(bad))
    else:
        target.mkdir(parents=True, exist_ok=True)
        for name, data in outputs.items():
            (target / name).write_bytes(data)
    print("Saga package generation verified (4 outputs).")

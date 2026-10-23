#!/usr/bin/env python3
"""Verify R7 inventory root membership, source hashes, and enumerated imports."""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
INVENTORY = ROOT / "docs/helix/04-build/evidence/rust-migration/r7-tooling-inventory/inventory.json"
CENSUS = ROOT / "docs/helix/04-build/evidence/rust-migration/r4/inventory/census.json"

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main() -> int:
    data = json.loads(INVENTORY.read_text())
    census = json.loads(CENSUS.read_text())
    rows = data["activeRoots"]
    roots = census["r7ToolingRoots"]["activeScripts"]
    failures = []
    if len(roots) != 31 or len(rows) != 31:
        failures.append(f"root count mismatch census={len(roots)} map={len(rows)}")
    if [row["path"] for row in rows] != roots:
        failures.append("mapped paths/order differ from R4 r7ToolingRoots.activeScripts")
    if data["r4Census"]["sha256"] != sha(CENSUS):
        failures.append("R4 census hash changed")
    for row in rows:
        path = ROOT / row["path"]
        if not path.is_file():
            failures.append(f"missing active root: {row['path']}")
            continue
        raw = path.read_bytes()
        if sha(path) != row["sha256"] or len(raw) != row["bytes"]:
            failures.append(f"source hash/size changed: {row['path']}")
        imports = re.findall(r"^import .*? from ['\"]([^'\"]+)['\"]", raw.decode("utf-8"), re.M)
        if imports != row["directImports"]:
            failures.append(f"direct imports changed: {row['path']}")
        exports = re.findall(r"^export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type)\s+([A-Za-z_$][\w$]*)", raw.decode("utf-8"), re.M)
        if exports != row["exportedDeclarations"]:
            failures.append(f"exported operation/type declarations changed: {row['path']}")
    for path, expected in data["firstPortCandidate"]["gateSourceHashes"].items():
        if sha(ROOT / path) != expected:
            failures.append(f"first-port gate source changed: {path}")
    for path, expected in data.get("liveActivationSources", {}).items():
        if sha(ROOT / path) != expected:
            failures.append(f"live activation source changed: {path}")
    if failures:
        print("R7 tooling inventory check FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(f"R7 tooling inventory check passed: {len(rows)} active roots, {len(data['firstPortCandidate']['gateSourceHashes'])} first-port gate sources")
    print(f"R4 census SHA-256: {data['r4Census']['sha256']}")
    print("Root/import hashes are current; transitive dependency closure is not claimed.")
    return 0

if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Capture the Python API baseline and pin the accepted TypeScript v3 packet."""

import argparse
import ast
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/helix/04-build/evidence/rust-migration/r5-semantic-value-python/frozen-predecessor.json"
TS_PACKET = "docs/helix/04-build/evidence/rust-migration/r5-semantic-value/frozen-typescript.json"
BASELINE_FILES = (
    "python/src/umf/__init__.py",
    "python/src/umf/registry.py",
    "python/src/umf/_rust.py",
    "bindings/core/python/src/lib.rs",
    "python/tests/test_core.py",
)
LIVE_FILES = (
    "docs/helix/02-design/contracts/CONTRACT-078-semantic-types.md",
    "src/extensions/semantic-types/index.ts",
    "src/model/semantic-types.ts",
    "tests/semantic-types/core.test.ts",
)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def tracked_at_head(path: str) -> bytes:
    return subprocess.run(
        ["git", "show", f"HEAD:{path}"], cwd=ROOT, check=True, capture_output=True
    ).stdout


def root_exports(source: bytes) -> list[str]:
    tree = ast.parse(source.decode("utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "__all__" for target in node.targets
        ):
            value = ast.literal_eval(node.value)
            return [item for item in value if type(item) is str]
    return []


def capture() -> dict:
    baseline = {path: tracked_at_head(path) for path in BASELINE_FILES}
    packet = json.loads((ROOT / TS_PACKET).read_text(encoding="utf-8"))
    baseline_exports = root_exports(baseline["python/src/umf/__init__.py"])
    return {
        "schema": "umf.r5.semantic-value.python-predecessor.v1",
        "scope": "The pinned TypeScript v3 packet is the semantic predecessor. Python at HEAD has no semantic value registry/validator API; this additive slice introduces cooperative-v1.",
        "baselineCommit": subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip(),
        "pythonRuntime": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "pythonExportsAtBaseline": baseline_exports,
        "semanticValidatorExportsAtBaseline": [name for name in baseline_exports if "semantic" in name.lower() or "validator" in name.lower()],
        "typescriptPacket": {"path": TS_PACKET, "sha256": sha((ROOT / TS_PACKET).read_bytes()), "schema": packet.get("schema"), "caseCount": len(packet.get("cases", {}))},
        "typescriptAndAuthoritySources": {path: sha((ROOT / path).read_bytes()) for path in LIVE_FILES},
        "pythonBaselineSources": {path: sha(content) for path, content in baseline.items()},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = json.dumps(capture(), indent=2, sort_keys=True) + "\n"
    if args.check:
        if not OUT.is_file() or OUT.read_text(encoding="utf-8") != result:
            print("Python semantic-value predecessor packet drift detected", file=sys.stderr)
            return 1
        print("Python semantic-value predecessor packet: PASS")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(result, encoding="utf-8")
    print(OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

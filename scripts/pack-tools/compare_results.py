#!/usr/bin/env python3
"""Compare native and browser Pack Tools result streams for parity."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def rows(path: Path):
    raw = path.read_text().strip()
    if not raw:
        return []
    try:
        value = json.loads(raw)
        items = value if isinstance(value, list) else None
    except json.JSONDecodeError:
        items = None
    if items is None:
        items = [json.loads(line) for line in raw.splitlines() if line.strip()]
    results = []
    for item in items:
        if isinstance(item, dict) and item.get("ok") is True:
            item = item.get("result")
        elif isinstance(item, dict) and isinstance(item.get("result"), dict):
            item = item["result"]
        if not isinstance(item, dict) or item.get("profile") != "umf.pack-tools-result/1":
            raise ValueError(f"Unexpected result envelope in {path}")
        results.append(item)
    return results


def signature(result: dict):
    files = sorted((file["path"], file["kind"], file["sha256"]) for file in result["files"])
    diagnostics = sorted(
        (item.get("severity"), item.get("code"), item.get("source"), item.get("path"), item.get("message"))
        for item in result["diagnostics"]
    )
    coverage = sorted(
        (item.get("source"), item.get("status"), item.get("table"), tuple(item.get("operations", [])))
        for item in result["coverage"]
    )
    return result["pack"], result["status"], result["sourceDigest"], files, diagnostics, coverage


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("native_results", type=Path)
    parser.add_argument("wasm_results", type=Path)
    args = parser.parse_args()
    native, wasm = rows(args.native_results), rows(args.wasm_results)
    if len(native) != 28 or len(wasm) != 28:
        raise ValueError(f"Expected 28 native and WASM rows; received {len(native)} and {len(wasm)}")
    def by_pack(items):
        mapped = {(item["pack"]["id"], item["pack"]["version"]): item for item in items}
        if len(mapped) != len(items):
            raise ValueError("Duplicate pack identity in result stream")
        return mapped
    native_by_pack, wasm_by_pack = by_pack(native), by_pack(wasm)
    if set(native_by_pack) != set(wasm_by_pack):
        raise AssertionError("Native and WASM streams contain different pack identities")
    for key in sorted(native_by_pack):
        left, right = native_by_pack[key], wasm_by_pack[key]
        if signature(left) != signature(right):
            raise AssertionError(f"Native/WASM output mismatch for pack {key[0]}@{key[1]}")
    print(json.dumps({"packs_compared": len(native), "source_digest_file_hash_diagnostic_coverage_parity": "passed"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

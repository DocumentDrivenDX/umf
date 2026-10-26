#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Prepare a deterministic, local hash manifest from one verified release run.

This tool never uploads artifacts or contacts a package registry.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import verify_python_release_matrix as matrix


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def prepare(artifacts: Path, aggregate_receipt: Path) -> dict[str, Any]:
    receipt_bytes = aggregate_receipt.read_bytes()
    receipt = json.loads(receipt_bytes)
    if type(receipt) is not dict:
        raise ValueError("Aggregate receipt must be a JSON object")
    if (receipt.get("schema"), receipt.get("status"), receipt.get("publishing")) != (
        "umf.python-coordinated-release-matrix/1", "passed", False
    ):
        raise ValueError("Aggregate receipt is not a passed non-publishing matrix receipt")
    revision, run_id = receipt.get("sourceRevision"), receipt.get("runId")
    if not isinstance(revision, str) or not isinstance(run_id, str):
        raise ValueError("Aggregate receipt is missing source revision or workflow run")

    verified = matrix.verify_matrix(artifacts, revision, run_id)
    artifacts = artifacts.resolve()
    # Host capture is expected to differ locally. All workflow identity, cohort,
    # receipt, closure, and artifact hash claims must otherwise match exactly.
    if set(receipt) != set(verified):
        raise ValueError("Aggregate receipt field set differs from verified matrix")
    for key in verified:
        if key == "hostCapture":
            continue
        if _canonical(receipt.get(key)) != _canonical(verified.get(key)):
            raise ValueError(f"Aggregate receipt differs from verified downloaded bytes: {key}")

    names = receipt["deduplicatedArtifactHashes"]
    if type(names) is not dict or len(names) != 5:
        raise ValueError("Expected the exact five deduplicated core/codegen artifacts")
    locations: dict[str, str] = {}
    # The verifier has already enforced exact bytes in each cohort and global
    # same-name identity. Select the first cohort path deterministically.
    for name in sorted(names):
        candidates = [artifacts / f"python-release-{cohort}" / "umf-coordinated-artifacts" / name for cohort in matrix.COHORTS]
        found = next((p for p in candidates if p.is_file() and not p.is_symlink()), None)
        if found is None or _sha256(found) != names[name]:
            raise ValueError(f"Aggregate artifact bytes are unavailable or differ: {name}")
        locations[name] = found.relative_to(artifacts.resolve()).as_posix()
    return {
        "schema": "umf.python-coordinated-release-preparation/1",
        "status": "prepared",
        "publishing": False,
        "sourceRevision": revision,
        "runId": run_id,
        "versions": {"umf-core": "0.11.0", "umf-codegen": "0.2.0"},
        "cohorts": sorted(matrix.COHORTS),
        "sourcePins": receipt["sourcePins"],
        "aggregateReceiptSha256": hashlib.sha256(receipt_bytes).hexdigest(),
        "artifacts": {
            name: {"path": locations[name], "sha256": names[name]}
            for name in sorted(names)
        },
        "releaseUse": "Local preparation manifest only; no upload or publication performed.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path, required=True, help="Downloaded six-cohort artifact tree")
    parser.add_argument("--aggregate-receipt", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    result = prepare(args.artifacts, args.aggregate_receipt)
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"status": result["status"], "artifacts": len(result["artifacts"]), "publishing": False}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

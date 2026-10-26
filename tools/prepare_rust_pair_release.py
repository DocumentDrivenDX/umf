#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Create a deterministic custody manifest for a verified Rust-backed Python pair.

This is a local/Actions preparation gate only. It never contacts a registry or
publishes an artifact.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
from typing import Any

import prepare_python_release_pair as pair

HEX = re.compile(r"[0-9a-f]{64}\Z")
RUN_ID = re.compile(r"[1-9][0-9]*\Z")
RUN_ATTEMPT = re.compile(r"[1-9][0-9]*\Z")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def prepare(
    artifacts: Path,
    aggregate_receipt: Path,
    repository: Path,
    source_revision: str,
    run_id: str,
    run_attempt: str,
    workflow_ref: str,
    repository_slug: str,
) -> dict[str, Any]:
    if not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", source_revision):
        raise ValueError("Expected a full source revision SHA")
    if RUN_ID.fullmatch(run_id) is None or RUN_ATTEMPT.fullmatch(run_attempt) is None:
        raise ValueError("Workflow run ID and attempt must be positive decimal integers")
    if run_attempt != "1":
        raise ValueError("Rerun attempts are not accepted; dispatch a fresh workflow run for clean artifact custody")
    expected_prefix = f"{repository_slug}/.github/workflows/python-coordinated-release.yml@"
    if not repository_slug or not workflow_ref.startswith(expected_prefix):
        raise ValueError("Workflow ref does not match the expected repository and qualification workflow")
    base = pair.prepare(artifacts, aggregate_receipt)
    if base["sourceRevision"] != source_revision or base["runId"] != run_id:
        raise ValueError("Custody context differs from the verified aggregate receipt")
    repository = repository.resolve()
    workflow_path = repository / ".github/workflows/python-coordinated-release.yml"
    script_path = Path(__file__).resolve()
    expected_script_path = repository / "tools/prepare_rust_pair_release.py"
    if script_path != expected_script_path.resolve():
        raise ValueError("Executed custody verifier is outside the source repository being qualified")
    workflow_hash = sha256(workflow_path)
    script_hash = sha256(script_path)
    aggregate_hash = sha256(aggregate_receipt)
    for digest in (workflow_hash, script_hash, aggregate_hash):
        if HEX.fullmatch(digest) is None:
            raise ValueError("Malformed custody digest")
    return {
        "schema": "umf.rust-port-pair-custody/1",
        "status": "prepared",
        "publishing": False,
        "sourceRevision": source_revision,
        "runId": run_id,
        "runAttempt": int(run_attempt),
        "workflowRef": workflow_ref,
        "workflowOnMain": workflow_ref.endswith("@refs/heads/main"),
        "releaseEligible": False,
        "qualification": {
            "workflow": ".github/workflows/python-coordinated-release.yml",
            "workflowSha256": workflow_hash,
            "custodyVerifier": "tools/prepare_rust_pair_release.py",
            "custodyVerifierSha256": script_hash,
            "aggregateReceiptSha256": aggregate_hash,
            "aggregateReceiptSchema": "umf.python-coordinated-release-matrix/1",
        },
        "pair": base,
        "publisherUse": "Qualification custody only. A publisher must independently require this exact source/run/attempt and artifact hash set.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--aggregate-receipt", type=Path, required=True)
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--run-attempt", required=True)
    parser.add_argument("--workflow-ref", required=True)
    parser.add_argument("--repository-slug", required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    manifest = prepare(
        args.artifacts,
        args.aggregate_receipt,
        args.repository,
        args.source_revision,
        args.run_id,
        args.run_attempt,
        args.workflow_ref,
        args.repository_slug,
    )
    payload = json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n"
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(payload, encoding="utf-8")
    print(json.dumps({"status": manifest["status"], "publishing": False, "artifacts": len(manifest["pair"]["artifacts"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

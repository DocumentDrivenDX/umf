#!/usr/bin/env python3
"""Validate the additive R5 Iceberg current-source replay and drift assessment."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema"
BASELINE = EVIDENCE / "baseline.json"
REPLAY = EVIDENCE / "current-source-replay.json"
SOURCE_CLOSURE = EVIDENCE / "source-closure.json"
ASSESSMENT = EVIDENCE / "current-source-assessment.json"
PLAN = "docs/helix/04-build/rust-migration-plan.md"
GENERATED = [
    "src/generated/core-model.ts",
    "src/generated/core-validators.ts",
    "spec/metamodel/generated/domain-policy.json",
    "spec/metamodel/generated/core-constraints.json",
    "spec/core/extension-package.schema.json",
    "spec/core/semantic-type-reference.schema.json",
    "spec/core/schema.json",
]
EXPECTED_DRIFT = set(GENERATED + [PLAN])


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text())


def git_head(path: str) -> bytes:
    return subprocess.check_output(["git", "show", f"HEAD:{path}"], cwd=ROOT)


def normalized(path: str, content: bytes):
    text = content.decode("utf-8")
    if path.endswith(".json"):
        value = json.loads(text)

        def scrub(item):
            if isinstance(item, dict):
                return {
                    key: scrub(value)
                    for key, value in item.items()
                    if key != "compilerSha256"
                }
            if isinstance(item, list):
                return [scrub(value) for value in item]
            if isinstance(item, str):
                return re.sub(r"compiler [0-9a-f]{64}", "compiler <sha256>", item)
            return item

        return scrub(value)
    return re.sub(r"compiler [0-9a-f]{64}", "compiler <sha256>", text)


def checked_file(path: str) -> Path:
    candidate = (ROOT / path).resolve()
    if not candidate.is_relative_to(ROOT) or not candidate.is_file():
        raise ValueError(f"missing or escaped source path: {path}")
    return candidate


def verify_authored_inputs(rows, reader=None) -> None:
    """Bind every authored fixture in the closure receipt to its current bytes."""
    if reader is None:
        reader = lambda path: checked_file(path).read_bytes()
    if len(rows) != 35:
        raise ValueError(f"expected 35 authored fixture hashes, found {len(rows)}")
    paths = [row.get("path") for row in rows]
    ids = [row.get("id") for row in rows]
    if len(set(paths)) != 35 or len(set(ids)) != 35:
        raise ValueError("duplicate authored fixture path or id in source closure")
    for row in rows:
        path = row["path"]
        content = reader(path)
        if len(content) != row["byteLength"]:
            raise ValueError(f"authored fixture byte length differs from closure receipt: {path}")
        if sha(content) != row["sha256"]:
            raise ValueError(f"authored fixture hash differs from closure receipt: {path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="compare the assessment without writing it")
    args = parser.parse_args()
    baseline = read_json(BASELINE)
    replay = read_json(REPLAY)
    source_closure = read_json(SOURCE_CLOSURE)
    baseline_sha = sha(BASELINE.read_bytes())
    if baseline_sha != source_closure["capturedFrom"]["baselineSha256"]:
        raise ValueError("historical baseline changed since its closure receipt")
    authored_inputs = source_closure["authoredInputs"]
    if source_closure["scope"]["authoredInputs"] != 35:
        raise ValueError("source closure authored-input scope is not 35")
    verify_authored_inputs(authored_inputs)

    # Exercise the same checker with one fixture's bytes mutated in memory. This
    # proves the authored-input binding rejects a changed fixture without
    # touching the checked-in fixture or any historical evidence.
    mutated_path = authored_inputs[0]["path"]
    actual = checked_file(mutated_path).read_bytes()
    mutant = bytes([actual[0] ^ 1]) + actual[1:]
    try:
        verify_authored_inputs(
            authored_inputs,
            reader=lambda path: mutant if path == mutated_path else checked_file(path).read_bytes(),
        )
    except ValueError as exc:
        if mutated_path not in str(exc):
            raise ValueError("authored fixture mutation control failed for an unrelated reason") from exc
    else:
        raise ValueError("authored fixture mutation control was not rejected")
    if replay["comparison"]["historicalBaselineSha256"] != baseline_sha:
        raise ValueError("current replay is not bound to the frozen baseline")
    if replay["comparison"]["authoredCaseOutcomesEqual"] is not True or replay["comparison"]["upstreamCaseOutcomesEqual"] is not True:
        raise ValueError("semantic outcome mismatch; no waiver is permitted")
    if replay["authoredCases"] != baseline["authoredCases"] or replay["upstreamCases"] != baseline["upstreamCases"]:
        raise ValueError("current operation outcomes differ from frozen baseline")
    for field in ("copyControl", "rejectedEditControl", "malformedEditControl", "representationControl"):
        if replay[field] != baseline[field]:
            raise ValueError(f"current control outcome differs from frozen baseline: {field}")

    historical_sources = {row["path"]: row["sha256"] for row in baseline["sourceHashes"]}
    current_sources = {row["path"]: row["sha256"] for row in replay["sourceHashes"]}
    if len(current_sources) != len(replay["sourceHashes"]):
        raise ValueError("duplicate current source path")
    for path, observed in current_sources.items():
        if sha(checked_file(path).read_bytes()) != observed:
            raise ValueError(f"current replay source hash is stale: {path}")
    drift = {path for path, old in historical_sources.items() if current_sources.get(path) != old}
    if drift != EXPECTED_DRIFT:
        raise ValueError(f"unexpected source drift set: {sorted(drift)}")

    generated_assessment = []
    for path in GENERATED:
        old, current = git_head(path), checked_file(path).read_bytes()
        if normalized(path, old) != normalized(path, current):
            raise ValueError(f"generated artifact contains non-provenance changes: {path}")
        generated_assessment.append({
            "path": path,
            "historicalBaselineSha256": historical_sources[path],
            "headSha256": sha(old),
            "currentSha256": sha(current),
            "classification": "compiler/provenance metadata only relative to HEAD",
            "normalizedPayloadEqualToHead": True,
            "historicalBaselineBytesRetained": False,
        })

    # Preserve exact predecessor oracle material; this checker never invokes an oracle.
    for row in baseline["priorOracleEvidence"]:
        current = checked_file(row["path"]).read_text()
        if current != row["content"]:
            raise ValueError(f"historical native/browser oracle output changed: {row['path']}")
    for row in replay["upstreamSourceHashes"]:
        if sha(checked_file("fixtures/iceberg/upstream/" + row["path"]).read_bytes()) != row["observedSha256"]:
            raise ValueError(f"upstream predecessor input drift: {row['path']}")

    old_plan = historical_sources[PLAN]
    current_plan = sha(checked_file(PLAN).read_bytes())
    assessment = {
        "receipt": "R5-Iceberg-current-source-replay-assessment-1",
        "historicalBaseline": {"path": "baseline.json", "sha256": baseline_sha, "immutable": True},
        "replay": {
            "path": "current-source-replay.json",
            "sha256": sha(REPLAY.read_bytes()),
            "authoredCases": len(replay["authoredCases"]),
            "upstreamOccurrences": len(replay["upstreamCases"]),
            "authoredOutcomesEqualFrozen": True,
            "upstreamOutcomesEqualFrozen": True,
            "nativeOracleInvoked": False,
        },
        "authoredFixtureInputs": {
            "count": len(authored_inputs),
            "sourceClosurePath": "source-closure.json",
            "sourceClosureSha256": sha(SOURCE_CLOSURE.read_bytes()),
            "allCurrentHashesMatch": True,
            "mutationControl": {
                "path": mutated_path,
                "changedBytesInMemory": True,
                "rejected": True,
            },
        },
        "generatedSourceDrift": generated_assessment,
        "governanceContextDrift": {
            "path": PLAN,
            "historicalSha256": old_plan,
            "currentSha256": current_plan,
            "classification": "plan drift, independently recorded; not executable input",
        },
        "historicalOracleOutputs": {
            "verifiedUnchanged": True,
            "paths": [row["path"] for row in baseline["priorOracleEvidence"]],
            "rerun": False,
        },
        "limits": [
            "The frozen baseline stores historical generated-source hashes, not their bytes; generated payload equality is therefore checked against current HEAD after removing only compiler/provenance metadata.",
            "Outcome equality establishes current TypeScript predecessor behavior for this fixture set; it does not establish native equivalence or contract correctness.",
        ],
        "checker": {
            "path": "scripts/rust-migration/r5/check-iceberg-current-source-replay.py",
            "sha256": sha(Path(__file__).read_bytes()),
        },
    }
    rendered = json.dumps(assessment, indent=2) + "\n"
    if args.check:
        if ASSESSMENT.read_text() != rendered:
            raise ValueError("current-source assessment differs; review before refreshing")
    else:
        ASSESSMENT.write_text(rendered)
    print("Current-source Iceberg replay passed: 35 authored + 21 upstream outcomes equal frozen baseline")
    print("Generated drift: seven compiler/provenance-only changes relative to HEAD; migration plan drift recorded separately")
    print(f"Historical baseline remains {baseline_sha}; prior native/browser outputs verified unchanged")


if __name__ == "__main__":
    main()

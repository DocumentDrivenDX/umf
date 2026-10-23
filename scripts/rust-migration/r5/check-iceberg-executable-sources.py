#!/usr/bin/env python3
"""Check the frozen Iceberg source/resource packet without rewriting it.

The migration plan is governance context, not an adapter runtime dependency.
Its historical and current hashes are both reported when it has changed.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
PACKET = ROOT / "docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema/baseline.json"
PLAN = "docs/helix/04-build/rust-migration-plan.md"
UPSTREAM = ROOT / "fixtures/iceberg/upstream"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_path(base: Path, name: str) -> Path:
    path = (base / name).resolve()
    if not path.is_relative_to(base.resolve()) or not path.is_file():
        raise ValueError(f"missing or escaped packet path: {name}")
    return path


def main() -> None:
    packet = json.loads(PACKET.read_text())
    scope = packet["scope"]
    if (scope["authoredCases"], scope["upstreamOccurrences"], scope["upstreamDocuments"]) != (35, 21, 19):
        raise ValueError("Iceberg packet scope changed")
    if len(packet["authoredCases"]) != 35 or len(packet["upstreamCases"]) != 21:
        raise ValueError("Iceberg packet cases changed")
    sources = packet["sourceHashes"]
    if len(sources) != 51 or len({row["path"] for row in sources}) != 51:
        raise ValueError("Iceberg source inventory changed or contains duplicates")
    plan_rows = [row for row in sources if row["path"] == PLAN]
    if len(plan_rows) != 1:
        raise ValueError("Iceberg packet must bind exactly one migration plan")
    for row in sources:
        observed = digest(checked_path(ROOT, row["path"]))
        if row["path"] != PLAN and observed != row.get("sha256"):
            raise ValueError(f"Iceberg executable/source drift: {row['path']}")
    upstream = packet["upstreamSourceHashes"]
    if len(upstream) != 42 or len({row["path"] for row in upstream}) != 42:
        raise ValueError("Iceberg upstream resource inventory changed or contains duplicates")
    for row in upstream:
        observed = digest(checked_path(UPSTREAM, row["path"]))
        if observed != row["observedSha256"] or not row["verified"]:
            raise ValueError(f"Iceberg upstream resource drift: {row['path']}")
        if row["expectedSha256"] is not None and observed != row["expectedSha256"]:
            raise ValueError(f"Iceberg upstream manifest mismatch: {row['path']}")
    evidence = packet["priorOracleEvidence"]
    if len(evidence) != 5 or len({row["path"] for row in evidence}) != 5:
        raise ValueError("Iceberg prior-oracle inventory changed or contains duplicates")
    for row in evidence:
        current = checked_path(ROOT, row["path"]).read_text()
        if current != row["content"]:
            raise ValueError(f"Iceberg prior-oracle output drift: {row['path']}")
    historical = plan_rows[0]["sha256"]
    current = digest(checked_path(ROOT, PLAN))
    print(f"Iceberg executable/source check passed: {len(sources)} sources, {len(upstream)} upstream resources, {len(evidence)} prior-oracle files")
    if historical != current:
        print(f"Governance-context drift only: {PLAN} captured={historical} current={current}")


if __name__ == "__main__":
    main()

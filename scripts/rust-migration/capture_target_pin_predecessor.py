#!/usr/bin/env python3
"""Capture and check the direct Python TargetPin.matches predecessor."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python/umf_access/src"))

from umf_access.adoption import TargetIdentity  # noqa: E402
from umf_access.catalog import TargetPin  # noqa: E402

SOURCE = ROOT / "python/umf_access/src/umf_access/catalog.py"
PACKET = ROOT / "docs/helix/04-build/evidence/rust-migration/target-pin-python-predecessor-20261028/packet.json"

PIN = TargetPin(
    "postgresql", "pg", "18", "profile-a", "a" * 64,
    (("driver", ("3.2", "3.3")), ("server", ("18.1",))),
)
BASE = dict(
    kind="postgresql", backend_id="pg", backend_version="18",
    target_profile="profile-a", binding_sha256="a" * 64,
)


def make_cases() -> list[dict[str, object]]:
    cases: list[dict[str, object]] = []

    def add(name: str, changes: dict[str, object], expected: bool, note: str) -> None:
        fields = BASE | changes
        identity = TargetIdentity(**fields)
        cases.append({
            "name": name,
            "identity": {
                "kind": identity.kind, "backend_id": identity.backend_id,
                "backend_version": identity.backend_version,
                "target_profile": identity.target_profile,
                "binding_sha256": identity.binding_sha256,
                "platform": [list(item) for item in identity.platform],
            },
            "expected": expected,
            "note": note,
        })

    add("exact-identity", {"platform": (("driver", "3.2"), ("server", "18.1"))}, True, "All five identity fields and both platform pairs match.")
    for field, value in (
        ("kind", "lakebase"), ("backend_id", "other"),
        ("backend_version", "19"), ("target_profile", "profile-b"),
        ("binding_sha256", "b" * 64),
    ):
        add(f"identity-field-{field}-differs", {field: value, "platform": (("driver", "3.2"), ("server", "18.1"))}, False, f"Only {field} differs.")
    add("platform-version-alternative-in-qualified-set", {"platform": (("driver", "3.3"), ("server", "18.1"))}, True, "Any listed version for a named component is accepted.")
    add("platform-version-outside-qualified-set", {"platform": (("driver", "3.4"), ("server", "18.1"))}, False, "An unlisted version is rejected.")
    add("platform-cardinality-one-missing", {"platform": (("driver", "3.2"),)}, False, "Different component counts are rejected.")
    add("platform-cardinality-one-extra", {"platform": (("driver", "3.2"), ("server", "18.1"), ("tls", "1"))}, False, "Different component counts are rejected.")
    add("same-cardinality-name-absent-from-pin", {"platform": (("driver", "3.2"), ("other", "18.1"))}, False, "A name absent from the pin fails containment.")
    add("duplicate-observed-name-misses-other-pinned-name", {"platform": (("driver", "3.2"), ("driver", "3.3"))}, True, "Observed behavior: equal counts plus per-item containment accepts a duplicate name and does not require every pinned name to be observed.")
    add("duplicate-observed-name-bad-version", {"platform": (("driver", "3.4"), ("driver", "3.2"))}, False, "Every duplicate observed pair is still checked against the pinned version set.")
    return cases


def source_sha256() -> str:
    return hashlib.sha256(SOURCE.read_bytes()).hexdigest()


def evaluate() -> dict[str, object]:
    cases = make_cases()
    mismatches = []
    for case in cases:
        identity = TargetIdentity(**case["identity"])
        actual = PIN.matches(identity)
        if actual is not case["expected"]:
            mismatches.append({"case": case["name"], "expected": case["expected"], "actual": actual})
    return {
        "format": "umf-target-pin-python-predecessor/1",
        "scope": "python/umf_access/src/umf_access/catalog.py TargetPin.matches only",
        "source": SOURCE.relative_to(ROOT).as_posix(),
        "source_sha256": source_sha256(),
        "case_count": len(cases),
        "pass_count": len(cases) - len(mismatches),
        "mismatch_count": len(mismatches),
        "cases": cases,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--capture", action="store_true")
    group.add_argument("--check", action="store_true")
    parser.add_argument("--packet", type=Path, default=PACKET)
    args = parser.parse_args()
    current = evaluate()
    if current["mismatch_count"]:
        print(json.dumps(current, indent=2))
        return 1
    if args.capture:
        args.packet.parent.mkdir(parents=True, exist_ok=True)
        args.packet.write_text(json.dumps(current, indent=2) + "\n")
        print(f"captured {current['case_count']} cases; source sha256 {current['source_sha256']}")
        return 0
    frozen = json.loads(args.packet.read_text())
    if frozen["source_sha256"] != current["source_sha256"]:
        print("stale packet: catalog.py source SHA-256 differs")
        return 1
    if frozen["cases"] != current["cases"] or frozen["case_count"] != current["case_count"]:
        print("stale packet: case inventory or frozen expected behavior differs")
        return 1
    print(f"checked {current['case_count']} cases; source sha256 {current['source_sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

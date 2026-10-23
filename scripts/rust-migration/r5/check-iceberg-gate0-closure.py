#!/usr/bin/env python3
"""Check additive Iceberg Gate 0 input/native-source closure and exact extraction.

This reads source text and frozen observations only. It never launches Java,
Maven, PyIceberg, Chromium, Cargo, or rustc.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema"
RECEIPT = EVIDENCE / "source-closure.json"
AUTHORED_MANIFEST = ROOT / "fixtures/iceberg/manifest.json"
UPSTREAM_MANIFEST = ROOT / "fixtures/iceberg/upstream/manifest.json"
NATIVE_MANIFEST = ROOT / "native/iceberg/sources/manifest.json"
BASELINE = EVIDENCE / "baseline.json"
BASELINE_HARNESS = ROOT / "scripts/rust-migration/r5/iceberg-schema-baseline.ts"
CONTROLS = EVIDENCE / "controls.json"
CONTROL_HARNESS = ROOT / "scripts/rust-migration/r5/iceberg-gate0-controls.ts"

# These exact hashes identify the reviewed Gate 0 predecessor capture. If the
# packet is deliberately regenerated, update these anchors in a reviewed change.
FROZEN_BASELINE_SHA256 = "22b7654f7e05cbf3290da46db3dab887e62f419b4973eb1ee25e64a4bbef68ef"
FROZEN_BASELINE_HARNESS_SHA256 = "0d21365332c84c6d5b8e7a7a8415b8a502b4fbe9ba5cc2e0fd55a4951ceb72c2"

NATIVE_PROVENANCE_FILES = (
    "native/iceberg/sources/manifest.json",
    "native/iceberg/sources/spec.md",
    "native/iceberg/sources/LICENSE",
    "native/iceberg/sources/NOTICE",
    "native/iceberg/oracle/pom.xml",
    "native/iceberg/oracle/src/main/java/IcebergOracle.java",
    "scripts/iceberg-java-oracle.ts",
    "scripts/iceberg-upstream-oracle.py",
    "scripts/iceberg-oracle.py",
)


@dataclass(frozen=True)
class NumberToken:
    text: str


@dataclass(frozen=True)
class ObjectPairs:
    pairs: tuple[tuple[str, Any], ...]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_digest(relative: str) -> str:
    return digest((ROOT / relative).read_bytes())


def read_exact_json(path: Path) -> Any:
    def object_pairs(pairs: list[tuple[str, Any]]) -> ObjectPairs:
        names = [key for key, _ in pairs]
        if len(names) != len(set(names)):
            raise ValueError(f"duplicate JSON object key in {path}")
        return ObjectPairs(tuple(pairs))

    return json.loads(
        path.read_text(encoding="utf-8"),
        parse_int=NumberToken,
        parse_float=NumberToken,
        object_pairs_hook=object_pairs,
        parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"invalid JSON token {value}")),
    )


def pointer_node(value: Any, pointer: str, source: str) -> Any:
    if pointer == "":
        return value
    if not pointer.startswith("/"):
        raise ValueError(f"invalid source pointer in {source}: {pointer}")
    current = value
    for raw in pointer[1:].split("/"):
        token = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(current, ObjectPairs):
            choices = [v for k, v in current.pairs if k == token]
            if len(choices) != 1:
                raise ValueError(f"source pointer not found uniquely in {source}: {pointer}")
            current = choices[0]
        elif isinstance(current, list):
            if token != "0" and (not token.isdecimal() or token.startswith("0")):
                raise ValueError(f"noncanonical array pointer in {source}: {pointer}")
            index = int(token)
            if index >= len(current):
                raise ValueError(f"source pointer outside array in {source}: {pointer}")
            current = current[index]
        else:
            raise ValueError(f"source pointer traverses scalar in {source}: {pointer}")
    return current


def source_pointer_receipt(upstream: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for occurrence in upstream["schemas"]:
        original = UPSTREAM_MANIFEST.parent / occurrence["path"]
        extracted = UPSTREAM_MANIFEST.parent / "extracted" / f"{occurrence['id']}.json"
        source_tree = pointer_node(read_exact_json(original), occurrence["pointer"], occurrence["path"])
        extracted_tree = read_exact_json(extracted)
        matches = source_tree == extracted_tree
        if not matches:
            raise ValueError(f"exact source-pointer tree differs from extracted occurrence: {occurrence['id']}")
        rows.append({
            "id": occurrence["id"],
            "sourcePath": occurrence["path"],
            "pointer": occurrence["pointer"],
            "extractedPath": f"extracted/{occurrence['id']}.json",
            "sourceResourceSha256": file_digest(f"fixtures/iceberg/upstream/{occurrence['path']}"),
            "extractedSha256": file_digest(f"fixtures/iceberg/upstream/extracted/{occurrence['id']}.json"),
            "exactTreeMatch": True,
            "numericLexemesAndObjectOrderCompared": True,
        })
    return rows


def make_receipt() -> dict[str, Any]:
    baseline_hash = file_digest("docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema/baseline.json")
    harness_hash = file_digest("scripts/rust-migration/r5/iceberg-schema-baseline.ts")
    if baseline_hash != FROZEN_BASELINE_SHA256 or harness_hash != FROZEN_BASELINE_HARNESS_SHA256:
        raise ValueError("provisional baseline or capture harness changed from the reviewed freeze")
    authored = json.loads(AUTHORED_MANIFEST.read_text())
    upstream = json.loads(UPSTREAM_MANIFEST.read_text())
    native_manifest = json.loads(NATIVE_MANIFEST.read_text())
    if len(authored["cases"]) != 35 or len(upstream["schemas"]) != 21:
        raise ValueError("authored/upstream corpus counts changed")

    authored_inputs = []
    for case in authored["cases"]:
        path = case["path"]
        authored_inputs.append({
            "id": case["id"],
            "path": path,
            "sha256": file_digest(path),
            "umfValid": case["umfValid"],
            "nativeAcceptedInExistingRecord": case["nativeAccepted"],
            "byteLength": (ROOT / path).stat().st_size,
        })

    native_authority = []
    for item in native_manifest["files"]:
        path = f"native/iceberg/sources/{item['path']}"
        observed = file_digest(path)
        if observed != item["sha256"]:
            raise ValueError(f"pinned Apache source hash mismatch: {path}")
        native_authority.append({"path": path, "sha256": observed, "manifestSha256": item["sha256"], "verified": True})

    native_oracle_sources = [{"path": path, "sha256": file_digest(path)} for path in NATIVE_PROVENANCE_FILES]
    py_results = json.loads((ROOT / "fixtures/iceberg/upstream/oracle-results.json").read_text())
    java_results = json.loads((ROOT / "fixtures/iceberg/upstream/java-oracle-results.json").read_text())
    browser_results = json.loads((ROOT / "fixtures/iceberg/upstream/browser-results.json").read_text())
    pom = (ROOT / "native/iceberg/oracle/pom.xml").read_text()
    provenance = {
        "apacheIceberg": {"version": native_manifest["version"], "commit": native_manifest["commit"], "authorityManifestPath": "native/iceberg/sources/manifest.json"},
        "pyIceberg": {"version": py_results.get("runtime"), "observedIn": "fixtures/iceberg/upstream/oracle-results.json", "resultFilePreservedButNotRerun": True},
        "javaOracle": {"runtime": java_results.get("runtime"), "javaVersion": java_results.get("javaVersion"), "observedIn": "fixtures/iceberg/upstream/java-oracle-results.json", "resultFilePreservedButNotRerun": True},
        "javaBuildConfiguration": {
            "mavenRuntimeVersion": None,
            "mavenRuntimeVersionStatus": "not recorded in the frozen outputs inspected for this packet",
            "compilerRelease": "17" if "<maven.compiler.release>17</maven.compiler.release>" in pom else None,
            "mavenCompilerPlugin": "3.14.0" if "<artifactId>maven-compiler-plugin</artifactId><version>3.14.0</version>" in pom else None,
            "mavenDependencyPlugin": "3.8.1" if "<artifactId>maven-dependency-plugin</artifactId><version>3.8.1</version>" in pom else None,
            "icebergCore": "1.11.0",
            "pomPath": "native/iceberg/oracle/pom.xml",
        },
        "browser": {"version": browser_results.get("browser"), "observedIn": "fixtures/iceberg/upstream/browser-results.json", "resultFilePreservedButNotRerun": True},
        "bun": {"version": json.loads(BASELINE.read_text())["runtime"]["bunVersion"], "observedIn": "baseline.json"},
        "oracleExecutionThisGate": False,
    }

    controls = json.loads(CONTROLS.read_text())
    baseline = json.loads(BASELINE.read_text())
    plan_row = next(row for row in baseline["sourceHashes"] if row["path"] == "docs/helix/04-build/rust-migration-plan.md")
    current_plan_hash = file_digest("docs/helix/04-build/rust-migration-plan.md")
    return {
        "receipt": "R5-Iceberg-Gate0-source-closure-1",
        "purpose": "Additive immutable source/resource closure supplement; baseline.json remains untouched by this receipt.",
        "capturedFrom": {"baselineSha256": baseline_hash, "baselineHarnessSha256": harness_hash, "controlCaptureSha256": file_digest("scripts/rust-migration/r5/iceberg-gate0-controls.ts"), "controlsSha256": file_digest("docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema/controls.json"), "closureCheckerSha256": file_digest("scripts/rust-migration/r5/check-iceberg-gate0-closure.py")},
        "governanceContext": {"planPath": "docs/helix/04-build/rust-migration-plan.md", "capturedSha256": plan_row["sha256"], "currentSha256": current_plan_hash, "driftIsContextOnly": plan_row["sha256"] != current_plan_hash, "baselineWasNotRewritten": True},
        "scope": {"authoredInputs": len(authored_inputs), "upstreamOccurrences": len(upstream["schemas"]), "upstreamJsonDocuments": len([f for f in upstream["files"] if f["path"].endswith(".json")]), "nativeAuthorityFiles": len(native_authority), "nativeOracleProvenanceFiles": len(native_oracle_sources), "additionalControls": len(controls["probes"])},
        "authoredInputs": authored_inputs,
        "nativeAuthority": native_authority,
        "nativeOracleSources": native_oracle_sources,
        "sourcePointerChecks": source_pointer_receipt(upstream),
        "toolchainProvenance": provenance,
        "historicalOutputHashes": [{"path": row["path"], "sha256": file_digest(row["path"]), "embeddedInBaseline": True, "rerun": False} for row in baseline["priorOracleEvidence"]],
        "noNativeOrBrowserExecution": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="write a newly reviewed source-closure receipt")
    mode.add_argument("--check", action="store_true", help="compare current closure to the frozen receipt (default)")
    args = parser.parse_args()
    receipt = make_receipt()
    rendered = json.dumps(receipt, indent=2, ensure_ascii=False) + "\n"
    if args.write:
        RECEIPT.write_text(rendered, encoding="utf-8")
        print(f"wrote Gate 0 closure receipt: {len(receipt['authoredInputs'])} authored inputs, {len(receipt['sourcePointerChecks'])} exact source-pointer matches")
        return
    if not RECEIPT.is_file() or RECEIPT.read_text(encoding="utf-8") != rendered:
        raise SystemExit("Gate 0 source-closure receipt differs; review before refreshing")
    print(f"Gate 0 closure check passed: {len(receipt['authoredInputs'])} authored inputs, {len(receipt['sourcePointerChecks'])} exact source-pointer matches, {len(receipt['nativeOracleSources'])} oracle provenance files; no native/browser execution")
    context = receipt["governanceContext"]
    if context["driftIsContextOnly"]:
        print(f"Governance-context drift only: {context['planPath']} captured={context['capturedSha256']} current={context['currentSha256']}; baseline unchanged")


if __name__ == "__main__":
    main()

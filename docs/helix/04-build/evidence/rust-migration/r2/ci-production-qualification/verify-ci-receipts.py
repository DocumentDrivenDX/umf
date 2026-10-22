#!/usr/bin/env python3
"""Verify UMF R2 production-host CI receipts against source trees and evidence."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import Any

EXPECTED_ID = "umf.rust-migration.r2.production-host-qualification"
EXPECTED_SOURCE_FILES = 439
EXPECTED_FINAL_CLOSURE = "2896e4e122cad5e2fde4b4ef04789fddfddb350e8fb054c3a5bc57ed2c83c1cd"
EXPECTED_QUALIFIERS = {"python", "javascript", "browser", "cli", "resourceProfile"}
EXPECTED_TOP_RESULTS = {
    "nativeBuild", "node", "bun", "cli", "wasmDefaultBuild", "chromiumDefaultWasm",
    "wasmFeatureBuild", "chromiumRegexFeatureWasm", "pythonBuild", "sdistArchiveAudit",
    "pythonWheelInstall", "noJavascriptPath", "sdistWheelBuild", "pythonSdistInstall",
}
REQUIRED_PY_COUNTS = {
    "suite": {"passed": 198},
    "corpus": {"cases": 139, "valid": 51, "invalid": 88},
    "schema": {"admissionCases": 9282, "officialCases": 4995, "officialEvaluated": 4995,
                "numericCases": 2586, "numericValidityResults": 2316,
                "numericInstanceErrors": 270, "mismatches": 0},
    "schemaEvaluationOrder": {"cases": 2879, "methodObservations": 7671,
                               "errorMetadataObservations": 263, "runtimeErrorObservations": 6,
                               "schemaAdmissionRefusals": 29, "mismatches": 0},
    "serialization": {"cases": 1742, "oracleCount": 18, "passed": 1742,
                       "failed": 0, "mismatches": []},
}
HEX64 = re.compile(r"^[0-9a-f]{64}$")


class VerificationError(Exception):
    pass


def fail(message: str) -> None:
    raise VerificationError(message)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(repo: Path, *args: str) -> bytes:
    result = subprocess.run(["git", "-C", str(repo), *args], stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, check=False)
    if result.returncode:
        fail(f"git {' '.join(args)} failed: {result.stderr.decode(errors='replace').strip()}")
    return result.stdout


def tree_oid(repo: Path, revision: str) -> str:
    value = git(repo, "rev-parse", f"{revision}^{{tree}}").decode().strip()
    if not re.fullmatch(r"[0-9a-f]{40,64}", value):
        fail(f"cannot resolve tree for {revision!r}")
    return value


def source_path(path: str) -> PurePosixPath:
    candidate = PurePosixPath(path)
    if candidate.is_absolute() or not path or ".." in candidate.parts or "\\" in path:
        fail(f"unsafe sourceFileHashes path: {path!r}")
    return candidate


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def check_statuses_and_raw_hashes(value: Any, where: str = "receipt") -> int:
    """Recursively validate each result status and raw output's recorded digest."""
    checked = 0
    if isinstance(value, dict):
        for raw_key, digest_key in (("rawStdout", "stdoutSha256"), ("rawStderr", "stderrSha256")):
            if raw_key in value:
                raw = value[raw_key]
                digest = value.get(digest_key)
                require(isinstance(raw, str), f"{where}.{raw_key} must be a string")
                require(isinstance(digest, str) and HEX64.fullmatch(digest),
                        f"{where}.{digest_key} missing or malformed")
                actual = sha256(raw.encode("utf-8"))
                require(actual == digest, f"{where}.{digest_key} does not hash {raw_key}")
                checked += 1
        if "status" in value:
            require(value["status"] == "pass", f"{where}.status is {value['status']!r}, expected 'pass'")
        for key, child in value.items():
            if isinstance(child, (dict, list)):
                checked += check_statuses_and_raw_hashes(child, f"{where}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            checked += check_statuses_and_raw_hashes(child, f"{where}[{index}]")
    return checked


def nested_at(obj: dict[str, Any], *path: str) -> dict[str, Any]:
    current: Any = obj
    for key in path:
        current = current.get(key) if isinstance(current, dict) else None
    if not isinstance(current, dict):
        fail("missing object: " + ".".join(path))
    return current


def require_count_record(record: dict[str, Any], expected: dict[str, Any], where: str) -> None:
    counts = record.get("counts")
    report = record.get("report")
    raw_stdout = record.get("rawStdout")
    if isinstance(report, dict):
        try:
            parsed = json.loads(raw_stdout.strip())
        except (AttributeError, json.JSONDecodeError):
            fail(f"{where}.rawStdout is not the JSON report recorded in report")
        require(parsed == report, f"{where}.report disagrees with parsed rawStdout")
        if isinstance(counts, dict):
            for key, value in counts.items():
                require(report.get(key) == value,
                        f"{where}.counts.{key}={value!r} disagrees with report value {report.get(key)!r}")
    for key, expected_value in expected.items():
        # Counts are captured by the runner; for detailed Python reports, confirm
        # the same exact value in both the compact count record and raw report.
        if isinstance(counts, dict) and key in counts:
            actual = counts[key]
        elif isinstance(report, dict) and key in report:
            actual = report[key]
        else:
            fail(f"{where} lacks exact count {key}={expected_value}")
        require(actual == expected_value,
                f"{where}.{key}={actual!r}, expected {expected_value}")
        if isinstance(counts, dict) and key in counts and isinstance(report, dict) and key in report:
            require(report[key] == expected_value,
                    f"{where}.report.{key}={report[key]!r}, expected {expected_value}")


def require_report(results: dict[str, Any], name: str, expected: dict[str, Any]) -> dict[str, Any]:
    entry = results.get(name)
    report = entry.get("report") if isinstance(entry, dict) else None
    require(isinstance(report, dict), f"results.{name}.report is missing")
    try:
        raw_report = json.loads(entry["rawStdout"].strip())
    except (KeyError, AttributeError, json.JSONDecodeError):
        fail(f"results.{name}.rawStdout is not the JSON report recorded in report")
    require(raw_report == report, f"results.{name}.report disagrees with parsed rawStdout")
    for key, value in expected.items():
        require(report.get(key) == value,
                f"results.{name}.report.{key}={report.get(key)!r}, expected {value!r}")
    counts = entry.get("counts", {})
    if "cases" in expected:
        require(isinstance(counts, dict) and counts.get("cases") == expected["cases"],
                f"results.{name}.counts.cases must equal {expected['cases']}")
    return report


SDIST_REQUIRED_MEMBERS = [
    "Cargo.toml", "Cargo.lock", "rust-toolchain.toml", ".cargo/config.toml",
    "LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE", "crates/umf-core/src/lib.rs",
    "bindings/core/python/Cargo.toml", "bindings/core/node/Cargo.toml", "bindings/core/wasm/Cargo.toml",
]
HOST_CONTROLS = ["meter", "cancel", "deadline", "reentry"]


def validate_non_python_hosts(results: dict[str, Any], artifacts: dict[str, Any], receipt_path: Path) -> None:
    fixture_hash = "bb008a98b8448050748e65f867e7863475ccad9501a5b9229ae9e6d336691544"
    standard_runtime = {
        "cases": 139, "fixtureSha256": fixture_hash, "orderedDiagnostics": True,
        "copiedTextUnits": 6000000, "sourceTextUnits": 4000000, "maxDocumentDepth": 128,
        "inventoryExtensionDepth": {"accepted": 122, "refused": 123}, "hostControls": HOST_CONTROLS,
    }
    require_report(results, "node", {**standard_runtime, "engineVersion": "umf-core-r2",
                                      "runtime": "Node v26.12.0"})
    require_report(results, "bun", {**standard_runtime, "engineVersion": "umf-core-r2",
                                     "runtime": "Bun 1.4.3"})
    require_report(results, "cli", {"cases": 139, "fixtureSha256": fixture_hash,
                                     "orderedDiagnostics": True, "path": "empty"})

    browser_common = {
        "cases": 139, "engineVersion": "umf-core-r2", "copiedTextUnits": 6000000,
        "sourceTextUnits": 4000000, "maxDocumentDepth": 128,
        "inventoryExtensionDepth": {"accepted": 122, "refused": 123},
        "hostControls": HOST_CONTROLS, "externalRequests": 0,
        "rawSurrogateCallback": True, "jsonYamlRoundTrip": True,
    }
    require_report(results, "chromiumDefaultWasm", {
        **browser_common, "wasmQualification": "default-production",
    })
    feature = require_report(results, "chromiumRegexFeatureWasm", {
        **browser_common,
        "wasmQualification": "python-regex-feature",
        "regexOutcomeParserControls": 15,
        "wideWorkCounter": "u64-portable-chunks-and-refusal",
        "pythonRegexCasesPerProfile": 6372,
        "pythonRegexComparisons": 19116,
        "pythonRegexInfoCasesPerProfile": 15120,
        "pythonRegexInfoComparisons": 45360,
        "pythonRegexHexCasesPerProfile": 2022,
        "pythonRegexHexComparisons": 6066,
        "pythonRegexProfiles": [11, 12, 13],
        "schemaDepth128Accepted129Refused": True,
        "annotatedVisitorDepth128Accepted129Refused": True,
    })
    total_regex_outcomes = (feature["pythonRegexComparisons"]
                            + feature["pythonRegexInfoComparisons"]
                            + feature["pythonRegexHexComparisons"])
    require(total_regex_outcomes == 70542,
            f"results.chromiumRegexFeatureWasm reports {total_regex_outcomes} regex outcomes, expected 70542")

    sdist = artifacts.get("sdistArchive")
    require(isinstance(sdist, dict), f"{receipt_path}: sdistArchive artifact missing")
    require(sdist.get("memberCount") == 443,
            f"{receipt_path}: sdist memberCount must be exactly 443")
    require(sdist.get("requiredMembers") == SDIST_REQUIRED_MEMBERS,
            f"{receipt_path}: sdist requiredMembers do not match the 11 required source members")
    require(not sdist.get("missingRequiredMembers") and not sdist.get("excludedMembers"),
            f"{receipt_path}: sdist archive has missing or excluded members")
    sdist_audit = require_report(results, "sdistArchiveAudit", {
        "memberCount": 443, "requiredMembers": SDIST_REQUIRED_MEMBERS,
        "missingRequiredMembers": [], "excludedMembers": [],
    })
    require(sdist_audit == sdist,
            f"{receipt_path}: sdistArchive artifact disagrees with sdistArchiveAudit report")


def validate_artifact_metadata(artifacts: dict[str, Any], results: dict[str, Any], receipt_path: Path) -> None:
    required = {
        "nodeAddon": {"sha256", "bytes"},
        "nodePackage": {"sha256", "bytes", "addonSha256", "addonBytes"},
        "cli": {"sha256", "bytes"},
        "wasmDefault": {"wasmSha256", "wasmBytes", "jsSha256", "jsBytes"},
        "wasmRegexFeature": {"wasmSha256", "wasmBytes", "jsSha256", "jsBytes"},
        "pythonRegexCorpus": {"fixtureSha256", "outcomesSha256", "infoFixtureSha256",
                              "infoOutcomesSha256", "hexFixtureSha256", "hexOutcomesSha256"},
        "pythonWheel": {"sha256", "bytes"},
        "pythonSdist": {"sha256", "bytes"},
        "sdistBuiltWheel": {"sha256", "bytes"},
        "sdistArchive": {"memberCount", "memberListSha256", "requiredMembers",
                         "missingRequiredMembers", "excludedMembers"},
    }
    require(set(artifacts) == set(required),
            f"{receipt_path}: artifact set mismatch; got {sorted(artifacts)}")
    for artifact, fields in required.items():
        require(isinstance(artifacts.get(artifact), dict)
                and fields <= set(artifacts[artifact]),
                f"{receipt_path}: {artifact} is missing required metadata fields {sorted(fields - set(artifacts.get(artifact, {}))) if isinstance(artifacts.get(artifact), dict) else sorted(fields)}")

    def walk(value: Any, where: str) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "sha256" or key.endswith("Sha256"):
                    require(isinstance(child, str) and HEX64.fullmatch(child),
                            f"{receipt_path}: malformed artifact digest at {where}.{key}")
                if key == "bytes" or key.endswith("Bytes"):
                    require(isinstance(child, int) and child > 0,
                            f"{receipt_path}: artifact byte count at {where}.{key} must be positive")
                walk(child, f"{where}.{key}")
        elif isinstance(value, list):
            for index, child in enumerate(value):
                walk(child, f"{where}[{index}]")

    walk(artifacts, "artifacts")
    addon = artifacts.get("nodeAddon")
    packed = artifacts.get("nodePackage")
    require(isinstance(addon, dict) and isinstance(packed, dict),
            f"{receipt_path}: Node addon/package artifacts are missing")
    require(addon.get("sha256") == packed.get("addonSha256"),
            f"{receipt_path}: packed addon digest does not match nodeAddon digest")
    require(addon.get("bytes") == packed.get("addonBytes"),
            f"{receipt_path}: packed addon byte count does not match nodeAddon bytes")

    cli_artifact = artifacts.get("cli")
    cli_report = results.get("cli", {}).get("report", {})
    require(isinstance(cli_artifact, dict) and cli_report.get("sourceSha256") == cli_artifact.get("sha256"),
            f"{receipt_path}: CLI conformance sourceSha256 does not match artifact digest")


def validate_input_bindings(inputs: Any, source_hashes: dict[str, str], receipt_path: Path) -> int:
    bindings = 0

    def walk(value: Any, where: str) -> None:
        nonlocal bindings
        if isinstance(value, dict):
            if isinstance(value.get("path"), str) and isinstance(value.get("sha256"), str):
                path = value["path"]
                require(path in source_hashes,
                        f"{receipt_path}: qualification input {where} path is outside sourceFileHashes: {path}")
                require(value["sha256"] == source_hashes[path],
                        f"{receipt_path}: qualification input hash disagrees with sourceFileHashes for {path}")
                bindings += 1
            for key, child in value.items():
                walk(child, f"{where}.{key}")
        elif isinstance(value, list):
            for index, child in enumerate(value):
                walk(child, f"{where}[{index}]")

    walk(inputs, "qualificationInputs")
    require(bindings > 0, f"{receipt_path}: no path/hash qualification inputs were checked")
    return bindings


def validate_no_javascript_path(results: dict[str, Any], receipt_path: Path) -> None:
    control = results.get("noJavascriptPath")
    require(isinstance(control, dict) and control.get("status") == "pass",
            f"{receipt_path}: noJavascriptPath.status must pass")
    entries = control.get("entries")
    require(isinstance(entries, list), f"{receipt_path}: noJavascriptPath.entries must be an array")
    names = {item.get("name") for item in entries if isinstance(item, dict)}
    for name in ("uv", "cargo", "rustc", "rustup", "python", "python3", "python3.11"):
        require(name in names, f"{receipt_path}: noJavascriptPath lacks required tool {name}")
    prohibited = {"node", "nodejs", "bun", "bunx", "npm", "npx", "yarn", "pnpm", "corepack", "deno", "tsc", "tsx", "ts-node"}
    require(not (names & prohibited),
            f"{receipt_path}: noJavascriptPath exposes JavaScript tools: {sorted(names & prohibited)}")
    verification = control.get("verification")
    try:
        verified = json.loads(verification)
    except (TypeError, json.JSONDecodeError):
        fail(f"{receipt_path}: noJavascriptPath.verification is not JSON")
    require(verified == {},
            f"{receipt_path}: noJavascriptPath.verification must be an empty discovery result, got {verified!r}")


def validate_receipt(data: dict[str, Any], *, repo: Path, receipt_path: Path,
                     expected_tree_commit: str | None, expected_closure: str | None,
                     check_worktree: bool, expected_python: str | None) -> dict[str, Any]:
    require(data.get("id") == EXPECTED_ID, f"{receipt_path}: unexpected receipt id")
    require(data.get("status") == "pass", f"{receipt_path}: status must be pass")
    require(data.get("gitStatusAtStart") == "", f"{receipt_path}: gitStatusAtStart must be empty")
    source_commit = data.get("sourceCommit")
    require(isinstance(source_commit, str) and source_commit,
            f"{receipt_path}: sourceCommit missing")

    source_entries = data.get("sourceFileHashes")
    require(isinstance(source_entries, list), f"{receipt_path}: sourceFileHashes must be an array")
    require(len(source_entries) == EXPECTED_SOURCE_FILES,
            f"{receipt_path}: expected {EXPECTED_SOURCE_FILES} source hashes, found {len(source_entries)}")
    seen: set[str] = set()
    normalized: list[tuple[str, str]] = []
    for item in source_entries:
        require(isinstance(item, dict), f"{receipt_path}: malformed source hash entry")
        path = item.get("path")
        digest = item.get("sha256")
        require(isinstance(path, str), f"{receipt_path}: source entry path missing")
        source_path(path)
        require(path not in seen, f"{receipt_path}: duplicate source path {path}")
        seen.add(path)
        require(isinstance(digest, str) and HEX64.fullmatch(digest),
                f"{receipt_path}: malformed source SHA-256 for {path}")
        normalized.append((path, digest))
    require(normalized == sorted(normalized), f"{receipt_path}: source hashes are not path-sorted")
    closure = sha256("".join(f"{path}\0{digest}\n" for path, digest in normalized).encode())
    require(data.get("sourceClosureSha256") == closure,
            f"{receipt_path}: sourceClosureSha256 does not match its 439 entries")
    if expected_closure:
        require(closure == expected_closure,
                f"{receipt_path}: source closure {closure} != expected {expected_closure}")

    source_tree = tree_oid(repo, source_commit)
    checked_tree_commit = expected_tree_commit or source_commit
    expected_tree = tree_oid(repo, checked_tree_commit)
    require(source_tree == expected_tree,
            f"{receipt_path}: sourceCommit {source_commit} tree {source_tree} != expected-source-tree "
            f"{checked_tree_commit} tree {expected_tree}; sourceCommit label is preserved")
    review_tree = None
    if check_worktree:
        review_tree = tree_oid(repo, "HEAD")
        if expected_tree_commit:
            require(review_tree == expected_tree,
                    f"{receipt_path}: current HEAD tree {review_tree} != expected tree {expected_tree}")
        elif source_tree != review_tree:
            fail(f"{receipt_path}: sourceCommit tree {source_tree} != reviewed HEAD tree {review_tree}")

    for path, digest in normalized:
        blob = git(repo, "show", f"{source_commit}:{path}")
        require(sha256(blob) == digest,
                f"{receipt_path}: committed blob hash mismatch for {path} at {source_commit}")
        if check_worktree:
            local_path = repo.joinpath(*source_path(path).parts)
            require(local_path.is_file(), f"{receipt_path}: current file missing: {path}")
            require(sha256(local_path.read_bytes()) == digest,
                    f"{receipt_path}: current file hash mismatch for {path}")
    source_hash_map = dict(normalized)
    input_bindings = validate_input_bindings(data.get("qualificationInputs"), source_hash_map, receipt_path)

    result_tree = data.get("results")
    require(isinstance(result_tree, dict), f"{receipt_path}: results missing")
    require(set(result_tree) == EXPECTED_TOP_RESULTS,
            f"{receipt_path}: top-level result set mismatch; got {sorted(result_tree)}")
    checked_output_hashes = check_statuses_and_raw_hashes(data, "receipt")
    require(checked_output_hashes == 42,
            f"{receipt_path}: expected exactly 42 raw stdout/stderr hashes, checked {checked_output_hashes}")
    for name, result in result_tree.items():
        require(isinstance(result, dict), f"{receipt_path}: host result {name} must be an object")
        if "status" in result:
            require(result["status"] == "pass", f"{receipt_path}: host result {name} must pass")

    qualifiers = data.get("qualifications")
    require(isinstance(qualifiers, dict) and set(qualifiers) == EXPECTED_QUALIFIERS,
            f"{receipt_path}: all five host qualifiers must be present")
    for name, qualifier in qualifiers.items():
        require(isinstance(qualifier, str) and qualifier.strip(),
                f"{receipt_path}: qualification {name} must contain a nonempty claim")
    qualifier_checks = {
        "python": ("wheel", "sdist", "schema"),
        "javascript": ("node", "bun"),
        "browser": ("chromium", "wasm"),
        "cli": ("binary", "path"),
        "resourceProfile": ("cooperative", "hardisolated"),
    }
    for name, tokens in qualifier_checks.items():
        text = qualifiers[name].lower()
        require(all(token in text for token in tokens),
                f"{receipt_path}: qualification {name} lacks required evidence terms {tokens}")

    artifacts = data.get("artifacts")
    require(isinstance(artifacts, dict), f"{receipt_path}: artifacts missing")
    for artifact in ("pythonWheel", "pythonSdist", "sdistBuiltWheel"):
        entry = artifacts.get(artifact)
        require(isinstance(entry, dict) and isinstance(entry.get("bytes"), int) and entry["bytes"] > 0
                and isinstance(entry.get("sha256"), str) and HEX64.fullmatch(entry["sha256"]),
                f"{receipt_path}: {artifact} must have positive bytes and a SHA-256")
    validate_non_python_hosts(result_tree, artifacts, receipt_path)

    for branch in ("pythonWheelInstall", "pythonSdistInstall"):
        install = result_tree.get(branch)
        require(isinstance(install, dict), f"{receipt_path}: {branch} missing")
        for leaf, expected_counts in REQUIRED_PY_COUNTS.items():
            record = install.get(leaf)
            require(isinstance(record, dict) and record.get("status") == "pass",
                    f"{receipt_path}: {branch}.{leaf} must pass")
            require_count_record(record, expected_counts, f"{branch}.{leaf}")
        versions = install.get("versions")
        require(isinstance(versions, dict), f"{receipt_path}: {branch}.versions missing")
        runtime = versions.get("python") or versions.get("runtime")
        require(isinstance(runtime, str) and runtime.strip(),
                f"{receipt_path}: {branch} Python runtime version missing")

    runtime = data.get("runtime")
    require(isinstance(runtime, dict), f"{receipt_path}: runtime missing")
    for key in ("runner", "node", "bun", "python", "rust"):
        require(isinstance(runtime.get(key), str) and runtime[key].strip(),
                f"{receipt_path}: runtime.{key} version missing")
    require(runtime["node"].strip() == "v26.12.0", f"{receipt_path}: expected Node v26.12.0")
    require(runtime["bun"].strip() == "1.4.3", f"{receipt_path}: expected Bun 1.4.3")
    require(runtime["rust"].startswith("cargo 1.90.0 "), f"{receipt_path}: expected Cargo 1.90.0")
    python_versions = []
    for branch in ("pythonWheelInstall", "pythonSdistInstall"):
        versions = nested_at(result_tree, branch, "versions")
        runtime_description = versions.get("python")
        match = re.match(r"^(3\.(?:11\.17|12\.15|13\.16))\b", runtime_description or "")
        require(match is not None,
                f"{receipt_path}: {branch} Python version must be one of 3.11.17, 3.12.15, 3.13.16")
        python_versions.append(match.group(1))
    require(python_versions[0] == python_versions[1],
            f"{receipt_path}: original wheel and sdist-built wheel Python versions differ")
    if expected_python:
        require(python_versions == [expected_python, expected_python],
                f"{receipt_path}: expected Python {expected_python}, found {python_versions}")
    eval_python = nested_at(result_tree, "pythonWheelInstall", "schemaEvaluationOrder", "report").get("python")
    require(eval_python == python_versions[0],
            f"{receipt_path}: schema evaluation report Python {eval_python!r} disagrees with installed runtime")
    validate_no_javascript_path(result_tree, receipt_path)
    validate_artifact_metadata(artifacts, result_tree, receipt_path)

    return {
        "receipt": str(receipt_path), "sourceCommit": source_commit,
        "sourceTree": source_tree, "reviewTree": review_tree or expected_tree,
        "sourceClosureSha256": closure, "sourceFileCount": len(normalized),
        "rawOutputHashesChecked": checked_output_hashes,
        "qualificationInputBindingsChecked": input_bindings,
        "hostResults": len(result_tree), "hostQualifiers": sorted(qualifiers),
        "pythonWheelSuitePassed": nested_at(result_tree, "pythonWheelInstall", "suite")["counts"]["passed"],
        "pythonSdistSuitePassed": nested_at(result_tree, "pythonSdistInstall", "suite")["counts"]["passed"],
        "pythonWheelRuntime": nested_at(result_tree, "pythonWheelInstall", "versions").get("runtime") or nested_at(result_tree, "pythonWheelInstall", "versions").get("python"),
        "pythonSdistRuntime": nested_at(result_tree, "pythonSdistInstall", "versions").get("runtime") or nested_at(result_tree, "pythonSdistInstall", "versions").get("python"),
        "artifactCheckScope": "recorded digests, positive byte counts, and receipt-internal relations; binary bytes were not downloaded",
    }


def mutate_path(data: dict[str, Any], *path: str, fn) -> None:
    value: Any = data
    for key in path[:-1]:
        value = value[key]
    value[path[-1]] = fn(value[path[-1]])


def self_test(args: argparse.Namespace) -> dict[str, Any]:
    require(bool(args.expected_tree_commit), "--self-test requires --expected-tree-commit")
    require(len(args.receipts) == 1, "--self-test requires exactly one receipt")
    path = args.receipts[0]
    baseline = json.loads(path.read_text())
    base = validate_receipt(baseline, repo=args.repo, receipt_path=path,
                            expected_tree_commit=args.expected_tree_commit,
                            expected_closure=args.expected_closure,
                            check_worktree=False, expected_python=args.expected_python)
    changed_python_raw = copy.deepcopy(baseline)
    serialization = changed_python_raw["results"]["pythonWheelInstall"]["serialization"]
    raw = json.loads(serialization["rawStdout"])
    raw["cases"] -= 1
    serialization["rawStdout"] = json.dumps(raw, separators=(",", ":")) + "\n"
    serialization["stdoutSha256"] = sha256(serialization["rawStdout"].encode())
    controls = [
        ("source-hash", ("sourceFileHashes", 0, "sha256"), lambda old: ("0" if old[0] != "0" else "1") + old[1:]),
        ("count", ("results", "pythonWheelInstall", "suite", "counts", "passed"), lambda old: old + 1),
        ("raw-output-hash", ("results", "node", "stdoutSha256"), lambda old: ("0" if old[0] != "0" else "1") + old[1:]),
        ("dirty-start", ("gitStatusAtStart",), lambda old: "M controlled-file"),
        ("browser-count", ("results", "chromiumRegexFeatureWasm", "report", "cases"), lambda old: old + 1),
        ("python-raw-report", None, None),
        ("no-javascript-verification", ("results", "noJavascriptPath", "verification"), lambda old: '{"node":"/usr/bin/node"}'),
        ("artifact-digest", ("artifacts", "nodeAddon", "sha256"), lambda old: "malformed"),
    ]
    rejected = []
    for label, path_parts, fn in controls:
        changed = changed_python_raw if label == "python-raw-report" else copy.deepcopy(baseline)
        if label == "dirty-start":
            changed["gitStatusAtStart"] = fn(changed["gitStatusAtStart"])
        elif label == "python-raw-report":
            pass
        else:
            mutate_path(changed, *path_parts, fn=fn)
        try:
            validate_receipt(changed, repo=args.repo, receipt_path=path,
                             expected_tree_commit=args.expected_tree_commit,
                             expected_closure=args.expected_closure, check_worktree=False,
                             expected_python=args.expected_python)
        except VerificationError:
            rejected.append(label)
        else:
            fail(f"self-test negative control was accepted: {label}")
    return {"status": "pass", "historicalReceipt": str(path),
            "expectedTreeCommit": args.expected_tree_commit, "positive": base,
            "negativeControlsRejected": rejected}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipts", nargs="*", type=Path, help="receipt JSON paths (batch supported)")
    parser.add_argument("--repo", type=Path, required=True, help="repository working tree")
    parser.add_argument("--expected-tree-commit", help="require sourceCommit's tree to equal this reviewed tree")
    parser.add_argument("--expected-closure", default=EXPECTED_FINAL_CLOSURE,
                        help="required sourceClosureSha256 for each receipt (default: final R2 closure)")
    parser.add_argument("--expected-python", choices=("3.11.17", "3.12.15", "3.13.16"),
                        help="require this exact installed Python version for both wheel paths")
    parser.add_argument("--skip-current", action="store_true",
                        help="historical-source mode: verify sourceCommit blobs without asserting working-tree file bytes")
    parser.add_argument("--output", type=Path, help="write JSON summary to this path; default stdout")
    parser.add_argument("--self-test", action="store_true",
                        help="verify the single receipt positively, then require source/count/hash/clean-start controls to fail")
    args = parser.parse_args()
    args.repo = args.repo.resolve()
    try:
        if args.self_test:
            summary = self_test(args)
        else:
            if not args.receipts:
                fail("provide one or more receipt paths")
            summaries = []
            failures = []
            for receipt_path in args.receipts:
                path = receipt_path.resolve()
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                    if not isinstance(data, dict):
                        fail("top-level receipt must be a JSON object")
                    summaries.append(validate_receipt(
                        data, repo=args.repo, receipt_path=path,
                        expected_tree_commit=args.expected_tree_commit,
                        expected_closure=args.expected_closure,
                        check_worktree=not args.skip_current, expected_python=args.expected_python,
                    ))
                except (OSError, json.JSONDecodeError, VerificationError) as exc:
                    failures.append({"receipt": str(path), "error": str(exc)})
            summary = {"status": "pass" if not failures else "fail",
                       "receiptsVerified": len(summaries), "receiptsFailed": len(failures),
                       "results": summaries, "failures": failures}
        output = json.dumps(summary, indent=2, sort_keys=True) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(output, encoding="utf-8")
        else:
            sys.stdout.write(output)
        return 0 if summary.get("status") == "pass" else 1
    except (OSError, json.JSONDecodeError, VerificationError) as exc:
        print(json.dumps({"status": "fail", "error": str(exc)}, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

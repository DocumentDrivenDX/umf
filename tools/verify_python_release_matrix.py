#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fail-closed aggregation of one coordinated Python release run."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import re
from pathlib import Path
from typing import Any

COHORTS = {
    "linux-x86_64-cpython-311": ("3.11.17", "Linux", "x86_64"),
    "linux-x86_64-cpython-312": ("3.12.15", "Linux", "x86_64"),
    "linux-x86_64-cpython-313": ("3.13.16", "Linux", "x86_64"),
    "macos-arm64-cpython-311": ("3.11.17", "Darwin", "arm64"),
    "macos-arm64-cpython-312": ("3.12.15", "Darwin", "arm64"),
    "macos-arm64-cpython-313": ("3.13.16", "Darwin", "arm64"),
}
LINUX_COHORTS = {name: value for name, value in COHORTS.items() if name.startswith("linux-")}
HEX = re.compile(r"[0-9a-f]{64}\Z")
REVISION = re.compile(r"(?:[0-9a-f]{40}|[0-9a-f]{64})\Z")
PAIR_SCHEMA = "umf.python-coordinated-release-qualification/1"
CORE_SCHEMA = "umf.python-artifact-qualification/1"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if type(value) is not dict:
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def _one_file(directory: Path, name: str) -> Path:
    path = directory / name
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Expected regular artifact file {name} under {directory}")
    return path


def _only_regular_files(directory: Path) -> set[str]:
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError(f"Expected artifact directory: {directory}")
    found: set[str] = set()
    for path in directory.iterdir():
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"Unexpected non-file artifact member: {path}")
        found.add(path.name)
    return found


def _canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def _current_source_pins(repository: Path) -> dict[str, str]:
    paths = {
        "releasePairVerifierSha256": "tools/verify_python_release_pair.py",
        "coreArtifactVerifierSha256": "tools/verify_python_artifacts.py",
        "sdistClosureVerifierSha256": "tools/_python_sdist.py",
        "workflowSha256": ".github/workflows/python-coordinated-release.yml",
        "installedPairSmokeFixtureSha256": "fixtures/actions-binding/source.json",
    }
    result: dict[str, str] = {}
    for key, relative in paths.items():
        path = repository / relative
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"Pinned source file is unavailable: {relative}")
        result[key] = _sha256(path)
    return result


def _check_digest(value: Any, label: str) -> str:
    if not isinstance(value, str) or HEX.fullmatch(value) is None:
        raise ValueError(f"Invalid SHA-256 for {label}")
    return value


def _verify_cohort(
    root: Path, cohort: str, source_revision: str, run_id: str, source_pins: dict[str, str]
) -> dict[str, Any]:
    expected_python, expected_system, expected_machine = COHORTS[cohort]
    directory = root / f"python-release-{cohort}"
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError(f"Missing cohort artifact: {cohort}")
    required_root = {
        "umf-coordinated-artifacts",
        "umf-core-sdist-rebuilt",
        "umf-core-artifact-receipt.json",
        "umf-coordinated-release-receipt.json",
    }
    children = list(directory.iterdir())
    members = {item.name for item in children}
    if members != required_root or any(item.is_symlink() for item in children):
        raise ValueError(f"Incomplete or unexpected cohort artifact layout: {cohort}")
    if any(item.is_file() for item in children if item.name in {"umf-coordinated-artifacts", "umf-core-sdist-rebuilt"}):
        raise ValueError(f"Artifact directory was replaced by a file: {cohort}")
    package_dir = directory / "umf-coordinated-artifacts"
    rebuilt_dir = directory / "umf-core-sdist-rebuilt"
    if package_dir.is_symlink() or not package_dir.is_dir() or rebuilt_dir.is_symlink() or not rebuilt_dir.is_dir():
        raise ValueError(f"Invalid artifact subdirectory for {cohort}")

    pair_path = _one_file(directory, "umf-coordinated-release-receipt.json")
    core_path = _one_file(directory, "umf-core-artifact-receipt.json")
    pair = _read_json(pair_path)
    core = _read_json(core_path)
    if pair.get("schema") != PAIR_SCHEMA or pair.get("status") != "passed" or pair.get("publishing") is not False:
        raise ValueError(f"Pair receipt is not a passed non-publishing receipt: {cohort}")
    if pair.get("pair", {}).get("installedImportAndGeneration") != "passed" or pair.get("pair", {}).get("installedCliHelp") != "passed":
        raise ValueError(f"Installed pair smoke or CLI gate did not pass: {cohort}")
    if (
        pair.get("cohort") != cohort
        or pair.get("sourceRevision") != source_revision
        or pair.get("runId") != run_id
        or pair.get("workflowRun") != run_id
    ):
        raise ValueError(f"Pair receipt source/run/cohort differs: {cohort}")
    host = pair.get("host")
    if type(host) is not dict or (
        host.get("python"), host.get("machine")
    ) != (expected_python, expected_machine):
        raise ValueError(f"Pair receipt host differs from expected cohort: {cohort}")
    if expected_system == "Linux" and "linux" not in str(host.get("platform", "")).lower():
        raise ValueError(f"Pair receipt is not Linux: {cohort}")
    if expected_system == "Darwin" and "macos" not in str(host.get("platform", "")).lower():
        raise ValueError(f"Pair receipt is not macOS: {cohort}")
    if core.get("schema") != CORE_SCHEMA or core.get("source_payload_verification") != "passed":
        raise ValueError(f"Core receipt is not a passed payload receipt: {cohort}")
    if core.get("semantic_core_version") != "0.10.0":
        raise ValueError(f"Core semantic version differs from the release plan: {cohort}")
    core_host = core.get("platform")
    if type(core_host) is not dict or (
        str(core_host.get("system", "")).lower(),
        core_host.get("machine"),
        core_host.get("python"),
    ) != (expected_system.lower(), expected_machine, expected_python):
        raise ValueError(f"Core receipt host differs from expected cohort: {cohort}")
    core_hash = _sha256(core_path)
    if pair.get("coreSdistVerificationReceiptSha256") != core_hash or pair.get("corePayloadReceiptSha256") != core_hash:
        raise ValueError(f"Pair receipt does not bind the cohort core receipt: {cohort}")

    artifacts = pair.get("artifacts")
    if type(artifacts) is not dict or len(artifacts) != 4:
        raise ValueError(f"Pair receipt must name exactly four package artifacts: {cohort}")
    package_files = _only_regular_files(package_dir)
    if package_files != set(artifacts):
        raise ValueError(f"Package artifact set differs from receipt: {cohort}")
    actual_artifacts: dict[str, dict[str, Any]] = {}
    for name, info in artifacts.items():
        if type(info) is not dict:
            raise ValueError(f"Malformed artifact entry {name}: {cohort}")
        path = _one_file(package_dir, name)
        actual_hash = _sha256(path)
        if actual_hash != _check_digest(info.get("sha256"), f"{cohort}/{name}") or path.stat().st_size != info.get("size"):
            raise ValueError(f"Artifact hash/size differs from receipt: {cohort}/{name}")
        actual_artifacts[name] = {"sha256": actual_hash, "size": path.stat().st_size}

    core_artifacts = core.get("artifacts")
    if type(core_artifacts) is not dict:
        raise ValueError(f"Core artifact receipt is missing artifact records: {cohort}")
    direct = core_artifacts.get("direct", {})
    core_sdist = core.get("sdist", {})
    rebuilt = core.get("artifacts", {}).get("sdist_rebuilt", {})
    direct_name = direct.get("filename")
    if (
        direct_name not in artifacts
        or direct.get("sha256") != artifacts[direct_name].get("sha256")
        or pair.get("pair", {}).get("core", {}).get("wheel") != direct_name
    ):
        raise ValueError(f"Core receipt direct wheel differs from pair artifact: {cohort}")
    if expected_system == "Linux" and not any(token in direct_name.lower() for token in ("linux", "manylinux")):
        raise ValueError(f"Core wheel platform differs from Linux cohort: {cohort}")
    if expected_system == "Darwin" and "macosx" not in direct_name.lower():
        raise ValueError(f"Core wheel platform differs from macOS cohort: {cohort}")
    if expected_machine == "x86_64" and "x86_64" not in direct_name.lower():
        raise ValueError(f"Core wheel architecture differs from Linux cohort: {cohort}")
    if expected_machine == "arm64" and "arm64" not in direct_name.lower():
        raise ValueError(f"Core wheel architecture differs from macOS cohort: {cohort}")
    core_sdist_name = core_sdist.get("filename")
    if core_sdist_name not in artifacts or core_sdist.get("sha256") != artifacts[core_sdist_name].get("sha256"):
        raise ValueError(f"Core receipt sdist differs from pair artifact: {cohort}")
    rebuilt = core_artifacts.get("sdist_rebuilt", {})
    rebuilt_name = rebuilt.get("filename")
    rebuilt_files = _only_regular_files(rebuilt_dir)
    if rebuilt_files != {rebuilt_name}:
        raise ValueError(f"Core sdist rebuilt wheel set differs from receipt: {cohort}")
    rebuilt_path = _one_file(rebuilt_dir, rebuilt_name)
    if _sha256(rebuilt_path) != rebuilt.get("sha256"):
        raise ValueError(f"Core rebuilt wheel hash differs from receipt: {cohort}")

    codegen_rebuild = pair.get("codegenSdistOfflineRebuild", {})
    codegen_wheel_name = pair.get("pair", {}).get("codegen", {}).get("wheel")
    pair_versions = pair.get("pair", {})
    if (
        pair_versions.get("core", {}).get("version") != "0.11.0"
        or pair_versions.get("codegen", {}).get("version") != "0.2.0"
        or pair_versions.get("requires") != "umf-core==0.11.0"
        or core.get("distribution_version") != "0.11.0"
    ):
        raise ValueError(f"Cohort is not the reviewed 0.11.0/0.2.0 release pair: {cohort}")
    if (
        codegen_rebuild.get("matchesDirectWheel") is not True
        or codegen_rebuild.get("wheel") != codegen_wheel_name
        or codegen_rebuild.get("sha256") != artifacts.get(codegen_wheel_name, {}).get("sha256")
    ):
        raise ValueError(f"Codegen sdist rebuild is not bound to its direct wheel: {cohort}")

    pair_source = pair.get("source")
    core_resources = core.get("action_runtime_resource_sha256")
    core_inputs = core.get("sdist_build_inputs")
    if type(pair_source) is not dict or type(core_resources) is not dict or type(core_inputs) is not dict:
        raise ValueError(f"Missing source/resource closure in cohort receipt: {cohort}")
    for value in pair_source.values():
        _check_digest(value, f"{cohort} source closure")
    if pair_source != source_pins:
        raise ValueError(f"Pair source pins differ from this checked-out revision: {cohort}")
    if len(core_resources) != 9:
        raise ValueError(f"Core receipt must bind exactly nine runtime resources: {cohort}")
    for value in core_resources.values():
        _check_digest(value, f"{cohort} resource closure")
    input_files = core_inputs.get("files")
    if type(input_files) is not dict or core_inputs.get("file_count") != len(input_files):
        raise ValueError(f"Malformed core sdist input manifest: {cohort}")
    for value in input_files.values():
        _check_digest(value, f"{cohort} sdist input")

    return {
        "cohort": cohort,
        "pairReceiptSha256": _sha256(pair_path),
        "coreReceiptSha256": core_hash,
        "sourceRevision": source_revision,
        "runId": run_id,
        "host": host,
        "pairSource": pair_source,
        "runtimeResources": core_resources,
        "sdistInputs": core_inputs,
        "artifacts": actual_artifacts,
        "rebuiltCoreWheelSha256": _sha256(rebuilt_path),
    }


def verify_matrix(root: Path, source_revision: str, run_id: str, cohort_set: str = "six-cohort") -> dict[str, Any]:
    if REVISION.fullmatch(source_revision) is None or not run_id:
        raise ValueError("Expected a full Git source revision SHA and nonempty workflow run ID")
    if root.is_symlink():
        raise ValueError("Artifact root must not be a symlink")
    root = root.resolve()
    if not root.is_dir():
        raise ValueError("Artifact root must be a regular directory")
    if cohort_set not in {"six-cohort", "linux-only"}:
        raise ValueError("Cohort set must be six-cohort or linux-only")
    cohorts = COHORTS if cohort_set == "six-cohort" else LINUX_COHORTS
    expected = {f"python-release-{name}" for name in cohorts}
    actual = {item.name for item in root.iterdir()}
    if actual != expected or any(item.is_symlink() or not item.is_dir() for item in root.iterdir()):
        description = "six cohorts" if cohort_set == "six-cohort" else "three Linux cohorts"
        raise ValueError(f"Artifact root must contain exactly one directory for each of {description}")

    repository = Path(__file__).resolve().parents[1]
    source_pins = _current_source_pins(repository)
    rows = [_verify_cohort(root, name, source_revision, run_id, source_pins) for name in cohorts]
    identity_fields = ("pairSource", "runtimeResources", "sdistInputs")
    for field in identity_fields:
        expected_bytes = _canonical(rows[0][field])
        if any(_canonical(row[field]) != expected_bytes for row in rows[1:]):
            raise ValueError(f"Cohort {field} closures differ across the {cohort_set} artifacts")

    # A repeated filename is publishable only if every cohort produced identical bytes.
    filename_hashes: dict[str, str] = {}
    for row in rows:
        for name, info in row["artifacts"].items():
            previous = filename_hashes.setdefault(name, info["sha256"])
            if previous != info["sha256"]:
                raise ValueError(f"Same artifact filename has divergent hashes: {name}")
    common_sdists = [name for name in filename_hashes if name.endswith(".tar.gz")]
    common_codegen = [name for name in filename_hashes if name.startswith("umf_codegen-")]
    if len(common_sdists) != 2 or len(common_codegen) != 2:
        raise ValueError("Expected one core and one codegen wheel/sdist pair across cohorts")
    core_wheels = [name for name in filename_hashes if name.startswith("umf_core-") and name.endswith(".whl")]
    expected_common = {
        "umf_core-0.11.0.tar.gz",
        "umf_codegen-0.2.0-py3-none-any.whl",
        "umf_codegen-0.2.0.tar.gz",
    }
    expected_wheels = 2 if cohort_set == "six-cohort" else 1
    if not expected_common.issubset(filename_hashes) or len(core_wheels) != expected_wheels:
        raise ValueError(f"Expected the exact core/codegen source pair and {expected_wheels} platform wheel(s)")
    if not any("linux" in name.lower() or "manylinux" in name.lower() for name in core_wheels):
        raise ValueError("No Linux core wheel was captured")
    if cohort_set == "six-cohort" and not any("macosx" in name.lower() for name in core_wheels):
        raise ValueError("No macOS core wheel was captured")

    result = {
        "schema": "umf.python-coordinated-release-linux-matrix/1" if cohort_set == "linux-only" else "umf.python-coordinated-release-matrix/1",
        "status": "passed",
        "publishing": False,
        "sourceRevision": source_revision,
        "runId": run_id,
        "sourcePins": source_pins,
        "cohorts": rows,
        "deduplicatedArtifactHashes": dict(sorted(filename_hashes.items())),
        "releaseUse": "Qualification receipt only; a separate reviewed publication gate is required.",
        "verifier": Path(__file__).name,
        "verifierSha256": _sha256(Path(__file__).resolve()),
        "hostCapture": {"python": platform.python_version(), "platform": platform.platform()},
    }
    if cohort_set == "linux-only":
        result["qualificationScope"] = "linux-only"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--cohort-set", choices=("six-cohort", "linux-only"), default="six-cohort")
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    result = verify_matrix(args.artifacts, args.source_revision, args.run_id, args.cohort_set)
    payload = json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n"
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(payload, encoding="utf-8")
    print(json.dumps({"status": result["status"], "cohorts": len(result["cohorts"]), "artifactNames": len(result["deduplicatedArtifactHashes"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

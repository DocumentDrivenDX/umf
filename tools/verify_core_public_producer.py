# SPDX-License-Identifier: MIT OR Apache-2.0
"""Verify the exact successful Core 0.10.3 producer run and its closed artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

ARTIFACT_LIMIT = 16_777_216


def api_json(url: str, token: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "umf-core-public-install-proof",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = response.read(1_048_577)
    if len(payload) > 1_048_576:
        raise ValueError("GitHub Actions identity response exceeded the one MiB bound")
    result = json.loads(payload)
    if not isinstance(result, dict):
        raise ValueError("GitHub Actions identity response has an unexpected shape")
    return result


def artifact_zip(row: dict, repo: str, token: str) -> dict[str, bytes]:
    size = row.get("size_in_bytes")
    if type(size) is not int or size <= 0 or size > ARTIFACT_LIMIT or row.get("expired") is not False:
        raise ValueError("Producer artifact size or expiry state is invalid")
    url = f"https://api.github.com/repos/{repo}/actions/artifacts/{row['id']}/zip"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "umf-core-public-install-proof",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        chunks = bytearray()
        while len(chunks) <= size:
            block = response.read(min(65536, size + 1 - len(chunks)))
            if not block:
                break
            chunks.extend(block)
    if len(chunks) != size:
        raise ValueError(f"Producer artifact download size differs: {row['name']}")
    expected_digest = row.get("digest")
    actual_digest = hashlib.sha256(chunks).hexdigest()
    if isinstance(expected_digest, str) and expected_digest.startswith("sha256:") and expected_digest.removeprefix("sha256:") != actual_digest:
        raise ValueError(f"Producer artifact API digest differs: {row['name']}")
    files: dict[str, bytes] = {}
    with zipfile.ZipFile(__import__("io").BytesIO(chunks)) as archive:
        entries = [entry for entry in archive.infolist() if not entry.is_dir()]
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)) or sum(entry.file_size for entry in entries) > ARTIFACT_LIMIT:
            raise ValueError(f"Producer artifact has duplicate members or exceeds its expanded cap: {row['name']}")
        if any(entry.file_size > ARTIFACT_LIMIT or (entry.external_attr >> 16) & 0o170000 == stat.S_IFLNK for entry in entries):
            raise ValueError(f"Producer artifact has an oversized or linked member: {row['name']}")
        for entry in entries:
            files[entry.filename] = archive.read(entry)
    return files


def named_file(files: dict[str, bytes], suffix: str) -> bytes:
    matches = [payload for name, payload in files.items() if PurePosixPath(name).name == suffix]
    if len(matches) != 1:
        raise ValueError(f"Producer artifact must contain exactly one {suffix}")
    return matches[0]


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", type=int, required=True)
    parser.add_argument("--attempt", type=int, required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--tree", required=True)
    parser.add_argument("--packet", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    repo = os.environ.get("GH_REPO", "")
    token = os.environ.get("GH_TOKEN", "")
    if repo != "DocumentDrivenDX/umf" or not token:
        raise SystemExit("Exact repository and read-only Actions token are required")
    packet = json.loads(args.packet.read_text(encoding="utf-8"))
    producer = packet["producer"]
    release = packet["publicRelease"]
    run = api_json(f"https://api.github.com/repos/{repo}/actions/runs/{args.run_id}", token)
    expected_run = {
        "id": args.run_id,
        "run_attempt": args.attempt,
        "head_sha": args.commit,
        "head_branch": producer["headBranch"],
        "event": producer["event"],
        "path": producer["workflowPath"],
        "status": "completed",
        "conclusion": "success",
    }
    if any(run.get(key) != value for key, value in expected_run.items()):
        raise ValueError("Producer workflow run identity, event, head or success status differs from the reviewed packet")
    jobs = api_json(f"https://api.github.com/repos/{repo}/actions/runs/{args.run_id}/attempts/{args.attempt}/jobs?per_page=100", token).get("jobs")
    if not isinstance(jobs, list):
        raise ValueError("Producer job roster is missing")
    successful_jobs = [job for job in jobs if job.get("run_attempt") == args.attempt and job.get("status") == "completed" and job.get("conclusion") == "success"]
    expected_source_jobs = {
        "qualify-installed-artifact (linux-x86_64, ubuntu-24.04, x64, 3.11.17, x86_64, linux_x86_64)",
        "qualify-installed-artifact (macos-arm64, macos-15, arm64, 3.11.9, arm64, macos_arm64)",
    }
    expected_selected_jobs = {
        f"{cohort} Python {version} selected release wheel"
        for cohort in ("linux-x86_64", "macos-arm64")
        for version in (("3.11.17", "3.14.8") if cohort == "linux-x86_64" else ("3.11.9", "3.14.8"))
    }
    source_jobs = [job for job in successful_jobs if job.get("name") in expected_source_jobs]
    selected_jobs = [job for job in successful_jobs if job.get("name") in expected_selected_jobs]
    if (
        len(successful_jobs) != 6
        or {job.get("name") for job in source_jobs} != expected_source_jobs
        or {job.get("name") for job in selected_jobs} != expected_selected_jobs
        or len(source_jobs) != len(expected_source_jobs)
        or len(selected_jobs) != len(expected_selected_jobs)
    ):
        raise ValueError("Producer successful job roster is not two source artifacts plus all four selected wheel cells")
    artifacts_value = api_json(f"https://api.github.com/repos/{repo}/actions/runs/{args.run_id}/artifacts?per_page=100", token)
    artifact_rows = artifacts_value.get("artifacts")
    if not isinstance(artifact_rows, list):
        raise ValueError("Producer artifact roster is missing")
    expected_names = {
        "umf-python-action-runtime-linux-x86_64",
        "umf-python-action-runtime-macos-arm64",
        "umf-core-0.10.3-release-linux-x86_64",
        "umf-core-0.10.3-release-macos-arm64",
        *(f"umf-core-0.10.3-installed-{cohort}-py{minor}" for cohort in ("linux-x86_64", "macos-arm64") for minor in ("11", "14")),
    }
    selected = artifact_rows
    if {row.get("name") for row in selected} != expected_names or len(selected) != len(expected_names):
        raise ValueError("Producer artifact roster is not the exact two-cohort/eight-artifact set")
    by_name = {row["name"]: row for row in selected}
    if len({row.get("id") for row in selected}) != len(selected):
        raise ValueError("Producer artifact IDs are not unique")
    if any(not isinstance(row.get("digest"), str) or not row["digest"].startswith("sha256:") or len(row["digest"]) != 71 for row in selected):
        raise ValueError("Producer artifact roster lacks exact API SHA-256 digests")
    downloaded = {name: artifact_zip(row, repo, token) for name, row in by_name.items()}
    for cohort in ("linux-x86_64", "macos-arm64"):
        evidence = downloaded[f"umf-python-action-runtime-{cohort}"]
        qualification = json.loads(named_file(evidence, "umf-qualification.json"))
        if qualification.get("source_revision") != args.commit or qualification.get("installed_qualification") != "passed":
            raise ValueError(f"Original direct/sdist producer cohort is not qualified at the exact source: {cohort}")
        installed_artifacts = qualification.get("installed_artifacts")
        if not isinstance(installed_artifacts, dict) or set(installed_artifacts) != {"direct", "sdist_rebuilt"}:
            raise ValueError(f"Original direct/sdist producer receipt does not contain its exact two artifact roles: {cohort}")
        for artifact in installed_artifacts.values():
            counts = artifact.get("test_counts")
            if artifact.get("qualification") != "passed" or not isinstance(counts, dict) or counts.get("tests") != 254 or counts.get("errors") != 0 or counts.get("failures") != 0 or counts.get("skipped") != 0:
                raise ValueError(f"Original direct/sdist installed suite is incomplete: {cohort}")
    platform_selection: dict[str, dict] = {}
    for cohort in ("linux-x86_64", "macos-arm64"):
        name = f"umf-core-0.10.3-release-{cohort}"
        files = downloaded[name]
        selection = json.loads(named_file(files, "selection.json"))
        if selection.get("status") != "passed" or not selection.get("recordVerified"):
            raise ValueError(f"Producer selection is not qualified: {cohort}")
        wheel_row = selection.get("selectedWheel", {})
        wheel = named_file(files, wheel_row.get("path", "")) if wheel_row.get("path") else b""
        sdist = named_file(files, "umf_core-0.10.3.tar.gz")
        if digest(wheel) != wheel_row.get("sha256") or digest(sdist) != selection.get("sdist", {}).get("sha256"):
            raise ValueError(f"Producer selected archive receipt differs from bytes: {cohort}")
        asset = release["assets"]["linuxWheel" if cohort == "linux-x86_64" else "macosWheel"]
        if len(wheel) != asset["sizeBytes"] or digest(wheel) != asset["sha256"] or selection.get("nativeSha256") != asset["nativeSha256"]:
            raise ValueError(f"Public release wheel does not correspond to the exact qualified producer selection: {cohort}")
        platform_selection[cohort] = {"selection": selection, "wheel": wheel, "sdist": sdist}
    if platform_selection["linux-x86_64"]["sdist"] != platform_selection["macos-arm64"]["sdist"]:
        raise ValueError("Producer platform selections do not share one common source archive")
    if digest(platform_selection["linux-x86_64"]["sdist"]) != release["assets"]["sdist"]["sha256"]:
        raise ValueError("Public source archive differs from the producer-selected common source archive")
    cells = []
    for cohort in ("linux-x86_64", "macos-arm64"):
        selection = platform_selection[cohort]["selection"]
        for minor in ("11", "14"):
            name = f"umf-core-0.10.3-installed-{cohort}-py{minor}"
            files = downloaded[name]
            receipt = json.loads(named_file(files, "umf-selected-wheel-cell.json"))
            if receipt.get("status") != "passed" or receipt.get("cohort") != cohort or receipt.get("testCounts", {}).get("tests") != 254 or receipt.get("testCounts", {}).get("errors") != 0 or receipt.get("testCounts", {}).get("failures") != 0 or receipt.get("testCounts", {}).get("skipped") != 0:
                raise ValueError(f"Producer installed cell is incomplete or not the unchanged 254-case roster: {name}")
            expected_python = "3.14.8" if minor == "14" else ("3.11.17" if cohort == "linux-x86_64" else "3.11.9")
            if receipt.get("requestedPython") != expected_python or receipt.get("sourceRevision") != args.commit:
                raise ValueError(f"Producer installed cell Python or source identity differs: {name}")
            if receipt.get("selectedWheelSha256") != selection["selectedWheel"]["sha256"] or receipt.get("expectedNativeSha256") != selection["nativeSha256"] or receipt.get("commonSdistSha256") != selection["sdist"]["sha256"]:
                raise ValueError(f"Producer four-cell receipt does not correspond to selected platform bytes: {name}")
            probes = receipt.get("runtimeProbes")
            if not isinstance(probes, dict) or probes.get("python") != expected_python or probes.get("machine", "").lower() != ("x86_64" if cohort == "linux-x86_64" else "arm64") or probes.get("umfVersion") != "0.10.3" or probes.get("pydanticVersion") != "2.14.1" or probes.get("pydanticCoreVersion") != "2.50.1" or probes.get("documentRoundTrips") != {"json": True, "yaml": True}:
                raise ValueError(f"Producer installed-cell runtime receipt is missing: {name}")
            if minor == "14" and probes.get("profile314Probes") != {"strictEndAnchor": True, "emptyInputNonBoundary": True, "unicode16Word": True, "futureProfileRefused": True}:
                raise ValueError(f"Producer Python 3.14 behavior probes differ: {name}")
            cells.append({"artifact": name, "sha256": hashlib.sha256(json.dumps(receipt, sort_keys=True).encode()).hexdigest(), "cohort": cohort, "pythonMinor": minor, "selectedWheelSha256": receipt["selectedWheelSha256"], "nativeSha256": receipt["expectedNativeSha256"], "commonSdistSha256": receipt["commonSdistSha256"], "testCounts": receipt["testCounts"], "runtimeProbes": probes})
    output = {
        "profile": "umf.core-public-producer-identity/1",
        "status": "passed",
        "run": {key: run.get(key) for key in expected_run},
        "jobs": {"qualify-installed-artifact": len(source_jobs), "qualify-selected-release-wheel-four-cells": len(selected_jobs)},
        "artifacts": [{"id": row["id"], "name": row["name"], "sizeBytes": row["size_in_bytes"], "digest": row.get("digest")} for row in sorted(selected, key=lambda row: row["name"])],
        "cells": cells,
        "selected": {cohort: {"wheelSha256": digest(row["wheel"]), "sdistSha256": digest(row["sdist"]), "nativeSha256": row["selection"]["nativeSha256"]} for cohort, row in platform_selection.items()},
    }
    args.output.write_text(json.dumps(output, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

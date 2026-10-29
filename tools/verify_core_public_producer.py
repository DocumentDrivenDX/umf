# SPDX-License-Identifier: MIT OR Apache-2.0
"""Verify a strict successful Core producer run or the named retained S34 cohort."""

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
RETAINED_PROFILE = "umf.core-retained-s34-producer/1"
RETAINED_SOURCE_COMMIT = "34a337b2d398b5ae33954cc250f6237bc1661c21"
RETAINED_SOURCE_TREE = "0379258db62e498a4b489d2b7f613e99e63c0a4b"
RETAINED_RUN_ID = 40448360241
RETAINED_RUN_ATTEMPT = 1
RETAINED_RUN_SHA256 = "cd6391428d262d066eb4f2adb4b138106bec97ddd9bf81dd9aabf4df1525e193"
RETAINED_ATTEMPT_SHA256 = "74dc0d0e5942b25734ac88af6e695b89344e188d213e54414946fe64d49c78bd"
RETAINED_JOB_ROSTER_SHA256 = "866cbd89f555c562a942c8ccae52f47daf86a52723d7090a7ed870bb382a7cf7"
RETAINED_MAP_SHA256 = "3eed351abf9255eb36316089b3d3b2b6ee1985b117468fbbe4bedeceda1b24a6"
RETAINED_TEST_PATH = "tests/test_distribution_artifact.py"
RETAINED_TEST_SHA256 = "57c2bc4de660798ac1028b93f480ddb77934b2110fce03a72d968039667ae8c1"
RETAINED_ARCHIVES = {
    "linuxWheel": {
        "filename": "umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl",
        "sizeBytes": 3612043,
        "sha256": "cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75",
        "nativeSha256": "c51b511a06bc1ccde6cc2208d33a4fb70ef66c67507ba8f2a6ea05fd2543cf57",
    },
    "macosWheel": {
        "filename": "umf_core-0.10.3-cp311-abi3-macosx_11_0_arm64.whl",
        "sizeBytes": 3331547,
        "sha256": "dc2586793e1492d1f825bd9e12f27d5db9f9330ae2343d9e7773c7052f1f6ea6",
        "nativeSha256": "df3dca411dfe11b045e6cd858bc5e3999c314fbe946826ba3b98f1a7d6934256",
    },
    "sdist": {
        "filename": "umf_core-0.10.3.tar.gz",
        "sizeBytes": 2826487,
        "sha256": "61b3e12a84f68f890fa34e2da14bbda47e101b7c6eadd5207680827e8daa694c",
    },
}

RETAINED_JOBS = (
    (122004937598, "qualify-installed-artifact (linux-x86_64, ubuntu-24.04, x64, 3.11.17, x86_64, linux_x86_64)", "success"),
    (122004937315, "qualify-installed-artifact (macos-arm64, macos-15, arm64, 3.11.9, arm64, macos_arm64)", "success"),
    (122037259839, "linux-x86_64 Python 3.11.17 selected release wheel", "success"),
    (122037259894, "linux-x86_64 Python 3.14.8 selected release wheel", "success"),
    (122037259849, "macos-arm64 Python 3.11.9 selected release wheel", "success"),
    (122037259968, "macos-arm64 Python 3.14.8 selected release wheel", "cancelled"),
)

RETAINED_ARTIFACTS = (
    (12708559992, "umf-python-action-runtime-linux-x86_64", 10225196, "1258b5f6f5d4c2a700aa0c7c04b3ec3aaf85ad7f3e65c67b838cad4838c479d8"),
    (12713123008, "umf-python-action-runtime-macos-arm64", 8770184, "702c6d96c844e308ea29f0116b75c0ebecc17c36262f8456aeb15f91a77c3e48"),
    (12709765210, "umf-core-0.10.3-release-linux-x86_64", 5895170, "b14e112d3bbe65b1eeb49bf6d55afc307564b76f2ee4abecdcf19a632f078b53"),
    (12712708341, "umf-core-0.10.3-release-macos-arm64", 5604087, "7758601bd5c2487f55dff837297aac20b83f5aca3a77b76a10376fff9e9e4730"),
    (12712644670, "umf-core-0.10.3-installed-linux-x86_64-py11", 13201, "432a5d96e7b7aeed93d3cd76253dd7032495a80f9a197efcb938e54165f4e09b"),
    (12713508187, "umf-core-0.10.3-installed-linux-x86_64-py14", 13405, "be4ee43e1417b71f3b942361edcc28b17f79b3f837c26cbadaa239581f356375"),
    (12717852883, "umf-core-0.10.3-installed-macos-arm64-py11", 13442, "37fcd9b5960e8ed6598ffcbed0497eb95e95e8b0e3b61d0f1e9e4dc671143959"),
)

RETAINED_COVERAGE = {
    "qualifiedProducerCohorts": ["linux-x86_64", "macos-arm64"],
    "qualifiedSelectedCells": [
        "linux-x86_64-py11",
        "linux-x86_64-py14",
        "macos-arm64-py11",
    ],
    "cancelledSelectedCell": "macos-arm64-py14",
    "macosPython314": "unqualified",
}


def retained_policy_packet() -> dict:
    """Return the one closed retained-build policy accepted by this verifier."""
    return {
        "profile": RETAINED_PROFILE,
        "runStatus": "completed",
        "runConclusion": "cancelled",
        "runJsonSha256": RETAINED_RUN_SHA256,
        "attemptJsonSha256": RETAINED_ATTEMPT_SHA256,
        "attemptJobRosterSha256": RETAINED_JOB_ROSTER_SHA256,
        "jobs": [
            {"id": job_id, "name": name, "status": "completed", "conclusion": conclusion}
            for job_id, name, conclusion in RETAINED_JOBS
        ],
        "artifacts": [
            {"id": artifact_id, "name": name, "sizeBytes": size, "sha256": sha}
            for artifact_id, name, size, sha in RETAINED_ARTIFACTS
        ],
        "coverage": RETAINED_COVERAGE,
    }


def validate_retained_identity(
    producer: dict,
    run: dict,
    jobs_response: dict,
    artifacts_response: dict | None,
    *,
    run_id: int,
    attempt: int,
    commit: str,
    tree: str,
) -> tuple[list[dict], list[dict]]:
    """Validate the single historical cancelled-run policy without waiving identity."""
    if not isinstance(producer, dict) or not isinstance(run, dict) or not isinstance(jobs_response, dict):
        raise ValueError("Retained producer API or packet objects have an invalid shape")
    policy = retained_policy_packet()
    expected_producer = {
        "sourceCommit": RETAINED_SOURCE_COMMIT,
        "sourceTree": RETAINED_SOURCE_TREE,
        "workflowPath": ".github/workflows/python-action-runtime.yml",
        "event": "workflow_dispatch",
        "headBranch": "codex/core-python314-generation",
        "workflowRunId": RETAINED_RUN_ID,
        "workflowRunAttempt": RETAINED_RUN_ATTEMPT,
        "retainedBuild": policy,
    }
    if producer != expected_producer or (run_id, attempt, commit, tree) != (
        RETAINED_RUN_ID,
        RETAINED_RUN_ATTEMPT,
        RETAINED_SOURCE_COMMIT,
        RETAINED_SOURCE_TREE,
    ):
        raise ValueError("Retained producer packet differs from the one fixed S34 source and run")
    expected_run = {
        "id": RETAINED_RUN_ID,
        "run_attempt": RETAINED_RUN_ATTEMPT,
        "head_sha": RETAINED_SOURCE_COMMIT,
        "head_branch": "codex/core-python314-generation",
        "event": "workflow_dispatch",
        "path": ".github/workflows/python-action-runtime.yml",
        "status": "completed",
        "conclusion": "cancelled",
    }
    if any(run.get(key) != value for key, value in expected_run.items()):
        raise ValueError("Retained producer run identity or exact cancelled conclusion differs")

    jobs = jobs_response.get("jobs")
    if jobs_response.get("total_count") != len(RETAINED_JOBS) or not isinstance(jobs, list) or len(jobs) != len(RETAINED_JOBS):
        raise ValueError("Retained producer attempt does not contain the complete six-job roster")
    expected_jobs = {job_id: (name, conclusion) for job_id, name, conclusion in RETAINED_JOBS}
    if any(not isinstance(job, dict) for job in jobs):
        raise ValueError("Retained producer attempt contains a malformed job row")
    if len({job.get("id") for job in jobs if isinstance(job, dict)}) != len(jobs):
        raise ValueError("Retained producer attempt repeats a job identity")
    for job in jobs:
        expected = expected_jobs.get(job.get("id"))
        if (
            expected is None
            or job.get("run_id") != RETAINED_RUN_ID
            or job.get("run_attempt") != RETAINED_RUN_ATTEMPT
            or job.get("head_sha") != RETAINED_SOURCE_COMMIT
            or job.get("head_branch") != "codex/core-python314-generation"
            or job.get("name") != expected[0]
            or job.get("status") != "completed"
            or job.get("conclusion") != expected[1]
        ):
            raise ValueError("Retained producer job roster differs from the fixed success/cancellation map")

    if artifacts_response is None:
        return jobs, []
    if not isinstance(artifacts_response, dict):
        raise ValueError("Retained producer artifact response has an invalid shape")
    artifacts = artifacts_response.get("artifacts")
    if not isinstance(artifacts, list) or len(artifacts) != len(RETAINED_ARTIFACTS):
        raise ValueError("Retained producer artifact roster is not the exact seven-file set")
    if any(not isinstance(row, dict) for row in artifacts):
        raise ValueError("Retained producer artifact roster contains a malformed row")
    expected_artifacts = {name: (artifact_id, size, sha) for artifact_id, name, size, sha in RETAINED_ARTIFACTS}
    if len({row.get("id") for row in artifacts if isinstance(row, dict)}) != len(artifacts):
        raise ValueError("Retained producer artifact roster repeats an artifact ID")
    if len({row.get("name") for row in artifacts if isinstance(row, dict)}) != len(artifacts):
        raise ValueError("Retained producer artifact roster repeats an artifact name")
    for row in artifacts:
        expected = expected_artifacts.get(row.get("name"))
        workflow_run = row.get("workflow_run")
        if (
            expected is None
            or row.get("id") != expected[0]
            or row.get("size_in_bytes") != expected[1]
            or row.get("digest") != "sha256:" + expected[2]
            or row.get("expired") is not False
            or not isinstance(workflow_run, dict)
            or workflow_run.get("id") != RETAINED_RUN_ID
            or workflow_run.get("head_sha") != RETAINED_SOURCE_COMMIT
            or workflow_run.get("head_branch") != "codex/core-python314-generation"
        ):
            raise ValueError("Retained producer artifact identity is not bound to the exact source run")
    return jobs, artifacts


def api_json(url: str, token: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "umf-core-public-install-proof",
        },
    )
    request.add_unredirected_header("Authorization", f"Bearer {token}")
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
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "umf-core-public-install-proof",
        },
    )
    request.add_unredirected_header("Authorization", f"Bearer {token}")
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


def validate_sdist_build_inputs(value: object) -> dict:
    if not isinstance(value, dict) or set(value) != {"schema", "file_count", "sha256", "files"}:
        raise ValueError("Retained producer source map has an unexpected shape")
    files = value.get("files")
    if (
        value.get("schema") != "umf.python-sdist-build-inputs/1"
        or value.get("file_count") != 531
        or not isinstance(files, dict)
        or len(files) != 531
        or files.get(RETAINED_TEST_PATH) != RETAINED_TEST_SHA256
        or any(
            not isinstance(path, str)
            or not path
            or "\\" in path
            or PurePosixPath(path).is_absolute()
            or any(part in {"", ".", ".."} for part in PurePosixPath(path).parts)
            or PurePosixPath(path).as_posix() != path
            or not isinstance(file_hash, str)
            or re.fullmatch(r"[0-9a-f]{64}", file_hash) is None
            for path, file_hash in files.items()
        )
    ):
        raise ValueError("Retained producer source map lacks the exact 531-file/test-file closure")
    canonical = json.dumps(files, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    if hashlib.sha256(canonical).hexdigest() != RETAINED_MAP_SHA256 or value.get("sha256") != RETAINED_MAP_SHA256:
        raise ValueError("Retained producer canonical source map digest differs")
    return value


def validate_retained_cell_receipt(
    receipt: object,
    *,
    cohort: str,
    minor: str,
    expected_python: str,
    wheel_sha256: str,
    native_sha256: str,
    sdist_sha256: str,
) -> None:
    required = {
        "cohort", "commonSdistSha256", "expectedNativeSha256", "expectedWheelSha256",
        "installedPayload", "platform", "postTestPayload", "probeOutcome", "profile",
        "requestedPython", "runtimeProbes", "selectedWheelSha256", "sourceRevision",
        "status", "testCounts", "testOutcome",
    }
    if not isinstance(receipt, dict) or set(receipt) != required:
        raise ValueError("Retained installed-cell receipt differs from its closed actual schema")
    expected_platform = "linux" if cohort == "linux-x86_64" else "macos"
    if (
        receipt.get("status") != "passed"
        or receipt.get("profile") != "umf.core-python314-installed-release-cell/1"
        or receipt.get("cohort") != cohort
        or receipt.get("platform") != expected_platform
        or receipt.get("requestedPython") != expected_python
        or receipt.get("sourceRevision") != RETAINED_SOURCE_COMMIT
        or receipt.get("testOutcome") != "success"
        or receipt.get("probeOutcome") != "success"
        or receipt.get("testCounts") != {"tests": 254, "errors": 0, "failures": 0, "skipped": 0}
        or receipt.get("selectedWheelSha256") != wheel_sha256
        or receipt.get("expectedWheelSha256") != wheel_sha256
        or receipt.get("expectedNativeSha256") != native_sha256
        or receipt.get("commonSdistSha256") != sdist_sha256
    ):
        raise ValueError("Retained installed-cell identity, test result, or selected archive differs")
    for key in ("installedPayload", "postTestPayload"):
        payload = receipt.get(key)
        if (
            not isinstance(payload, dict)
            or set(payload) != {
                "all_files_inside_platlib", "distribution_version", "installed_file_count",
                "native_sha256", "package_file_count", "status", "wheel_sha256",
            }
            or payload.get("status") != "passed"
            or payload.get("all_files_inside_platlib") is not True
            or payload.get("distribution_version") != "0.10.3"
            or type(payload.get("installed_file_count")) is not int
            or payload.get("installed_file_count") <= 0
            or type(payload.get("package_file_count")) is not int
            or payload.get("package_file_count") <= 0
            or payload.get("wheel_sha256") != wheel_sha256
            or payload.get("native_sha256") != native_sha256
        ):
            raise ValueError("Retained installed-cell pre/post payload is incomplete or differs from selected bytes")
    installed = receipt["installedPayload"]
    post_test = receipt["postTestPayload"]
    if (
        installed["installed_file_count"] != post_test["installed_file_count"]
        or installed["package_file_count"] != post_test["package_file_count"]
    ):
        raise ValueError("Retained installed-cell post-test file inventory differs from its pre-test inventory")
    probes = receipt.get("runtimeProbes")
    if (
        not isinstance(probes, dict)
        or probes.get("python") != expected_python
        or probes.get("machine") != ("x86_64" if cohort == "linux-x86_64" else "arm64")
        or probes.get("umfVersion") != "0.10.3"
        or probes.get("semanticCoreVersion") != "0.10.0"
        or probes.get("pydanticVersion") != "2.14.1"
        or probes.get("pydanticCoreVersion") != "2.50.1"
        or probes.get("documentRoundTrips") != {"json": True, "yaml": True}
        or (minor == "11" and probes.get("profile314Probes") != {})
    ):
        raise ValueError("Retained installed-cell runtime probe receipt is incomplete")
    if minor == "14" and probes.get("profile314Probes") != {
        "strictEndAnchor": True,
        "emptyInputNonBoundary": True,
        "unicode16Word": True,
        "futureProfileRefused": True,
    }:
        raise ValueError("Retained Python 3.14 installed-cell probes differ from the fixed profile")


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
    retained = producer.get("retainedBuild") == retained_policy_packet()
    if "retainedBuild" in producer and not retained:
        raise ValueError("Retained producer policy is not the exact fixed S34 profile")
    if retained and release.get("assets") != RETAINED_ARCHIVES:
        raise ValueError("Retained public archive identities differ from the fixed S34 producer bytes")
    run = api_json(f"https://api.github.com/repos/{repo}/actions/runs/{args.run_id}", token)
    jobs_response = api_json(f"https://api.github.com/repos/{repo}/actions/runs/{args.run_id}/attempts/{args.attempt}/jobs?per_page=100", token)
    if retained:
        jobs, _ = validate_retained_identity(
            producer,
            run,
            jobs_response,
            None,
            run_id=args.run_id,
            attempt=args.attempt,
            commit=args.commit,
            tree=args.tree,
        )
    else:
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
    jobs = jobs_response.get("jobs")
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
    if not retained and (
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
    selected = artifact_rows
    if retained:
        _, selected = validate_retained_identity(
            producer,
            run,
            jobs_response,
            artifacts_value,
            run_id=args.run_id,
            attempt=args.attempt,
            commit=args.commit,
            tree=args.tree,
        )
        expected_names = {row[1] for row in RETAINED_ARTIFACTS}
    else:
        expected_names = {
            "umf-python-action-runtime-linux-x86_64",
            "umf-python-action-runtime-macos-arm64",
            "umf-core-0.10.3-release-linux-x86_64",
            "umf-core-0.10.3-release-macos-arm64",
            *(f"umf-core-0.10.3-installed-{cohort}-py{minor}" for cohort in ("linux-x86_64", "macos-arm64") for minor in ("11", "14")),
        }
    if {row.get("name") for row in selected} != expected_names or len(selected) != len(expected_names):
        raise ValueError("Producer artifact roster differs from the exact closed profile")
    by_name = {row["name"]: row for row in selected}
    if len({row.get("id") for row in selected}) != len(selected):
        raise ValueError("Producer artifact IDs are not unique")
    if any(not isinstance(row.get("digest"), str) or not row["digest"].startswith("sha256:") or len(row["digest"]) != 71 for row in selected):
        raise ValueError("Producer artifact roster lacks exact API SHA-256 digests")
    downloaded = {name: artifact_zip(row, repo, token) for name, row in by_name.items()}
    retained_source_map = None
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
        if retained:
            current_map = validate_sdist_build_inputs(qualification.get("sdist_build_inputs"))
            if retained_source_map is not None and current_map != retained_source_map:
                raise ValueError("Retained Linux and Mac producer maps differ")
            retained_source_map = current_map
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
        asset_key = "linuxWheel" if cohort == "linux-x86_64" else "macosWheel"
        asset = release["assets"][asset_key]
        if len(wheel) != asset["sizeBytes"] or digest(wheel) != asset["sha256"] or selection.get("nativeSha256") != asset.get("nativeSha256"):
            raise ValueError(f"Public release wheel does not correspond to the exact qualified producer selection: {cohort}")
        if retained and (
            PurePosixPath(wheel_row.get("path", "")).name != asset["filename"]
            or digest(wheel) != RETAINED_ARCHIVES[asset_key]["sha256"]
            or len(wheel) != RETAINED_ARCHIVES[asset_key]["sizeBytes"]
            or selection.get("nativeSha256") != RETAINED_ARCHIVES[asset_key]["nativeSha256"]
            or digest(sdist) != RETAINED_ARCHIVES["sdist"]["sha256"]
            or len(sdist) != RETAINED_ARCHIVES["sdist"]["sizeBytes"]
        ):
            raise ValueError(f"Retained selected archive differs from its fixed S34 identity: {cohort}")
        platform_selection[cohort] = {"selection": selection, "wheel": wheel, "sdist": sdist}
    if platform_selection["linux-x86_64"]["sdist"] != platform_selection["macos-arm64"]["sdist"]:
        raise ValueError("Producer platform selections do not share one common source archive")
    if digest(platform_selection["linux-x86_64"]["sdist"]) != release["assets"]["sdist"]["sha256"]:
        raise ValueError("Public source archive differs from the producer-selected common source archive")
    cells = []
    cell_specs = (
        (("linux-x86_64", "11", "3.11.17"), ("linux-x86_64", "14", "3.14.8"), ("macos-arm64", "11", "3.11.9"))
        if retained
        else tuple(
            (cohort, minor, "3.14.8" if minor == "14" else ("3.11.17" if cohort == "linux-x86_64" else "3.11.9"))
            for cohort in ("linux-x86_64", "macos-arm64")
            for minor in ("11", "14")
        )
    )
    for cohort, minor, expected_python in cell_specs:
        selection = platform_selection[cohort]["selection"]
        name = f"umf-core-0.10.3-installed-{cohort}-py{minor}"
        files = downloaded[name]
        receipt = json.loads(named_file(files, "umf-selected-wheel-cell.json"))
        if retained:
            validate_retained_cell_receipt(
                receipt,
                cohort=cohort,
                minor=minor,
                expected_python=expected_python,
                wheel_sha256=selection["selectedWheel"]["sha256"],
                native_sha256=selection["nativeSha256"],
                sdist_sha256=selection["sdist"]["sha256"],
            )
            probes = receipt["runtimeProbes"]
        else:
            if receipt.get("status") != "passed" or receipt.get("cohort") != cohort or receipt.get("testCounts", {}).get("tests") != 254 or receipt.get("testCounts", {}).get("errors") != 0 or receipt.get("testCounts", {}).get("failures") != 0 or receipt.get("testCounts", {}).get("skipped") != 0:
                raise ValueError(f"Producer installed cell is incomplete or not the unchanged 254-case roster: {name}")
            if receipt.get("requestedPython") != expected_python or receipt.get("sourceRevision") != args.commit:
                raise ValueError(f"Producer installed cell Python or source identity differs: {name}")
            if receipt.get("selectedWheelSha256") != selection["selectedWheel"]["sha256"] or receipt.get("expectedNativeSha256") != selection["nativeSha256"] or receipt.get("commonSdistSha256") != selection["sdist"]["sha256"]:
                raise ValueError(f"Producer installed cell does not correspond to selected platform bytes: {name}")
            probes = receipt.get("runtimeProbes")
            if not isinstance(probes, dict) or probes.get("python") != expected_python or probes.get("machine", "").lower() != ("x86_64" if cohort == "linux-x86_64" else "arm64") or probes.get("umfVersion") != "0.10.3" or probes.get("pydanticVersion") != "2.14.1" or probes.get("pydanticCoreVersion") != "2.50.1" or probes.get("documentRoundTrips") != {"json": True, "yaml": True}:
                raise ValueError(f"Producer installed-cell runtime receipt is missing: {name}")
            if minor == "14" and probes.get("profile314Probes") != {"strictEndAnchor": True, "emptyInputNonBoundary": True, "unicode16Word": True, "futureProfileRefused": True}:
                raise ValueError(f"Producer Python 3.14 behavior probes differ: {name}")
        cells.append({"artifact": name, "sha256": hashlib.sha256(json.dumps(receipt, sort_keys=True).encode()).hexdigest(), "cohort": cohort, "pythonMinor": minor, "selectedWheelSha256": receipt["selectedWheelSha256"], "nativeSha256": receipt["expectedNativeSha256"], "commonSdistSha256": receipt["commonSdistSha256"], "testCounts": receipt["testCounts"], "runtimeProbes": probes})
    if retained and (len(cells) != 3 or {f"{row['cohort']}-py{row['pythonMinor']}" for row in cells} != set(RETAINED_COVERAGE["qualifiedSelectedCells"])):
        raise ValueError("Retained selected-wheel coverage is not the exact qualified three-cell subset")
    run_fields = ("id", "run_attempt", "head_sha", "head_branch", "event", "path", "status", "conclusion") if retained else tuple(expected_run)
    output = {
        "profile": "umf.core-retained-public-producer/1" if retained else "umf.core-public-producer-identity/1",
        "status": "passed",
        "run": {key: run.get(key) for key in run_fields},
        "jobs": (retained_policy_packet()["jobs"] if retained else {"qualify-installed-artifact": len(source_jobs), "qualify-selected-release-wheel-four-cells": len(selected_jobs)}),
        "artifacts": (retained_policy_packet()["artifacts"] if retained else [{"id": row["id"], "name": row["name"], "sizeBytes": row["size_in_bytes"], "digest": row.get("digest")} for row in sorted(selected, key=lambda row: row["name"])]),
        "cells": cells,
        "selected": {cohort: {"wheelSha256": digest(row["wheel"]), "sdistSha256": digest(row["sdist"]), "nativeSha256": row["selection"]["nativeSha256"]} for cohort, row in platform_selection.items()},
    }
    if retained:
        output["retainedBuild"] = retained_policy_packet()
        output["coverage"] = RETAINED_COVERAGE
        output["apiEvidenceSha256"] = {"run": RETAINED_RUN_SHA256, "attempt": RETAINED_ATTEMPT_SHA256, "jobRoster": RETAINED_JOB_ROSTER_SHA256}
        output["sdistBuildInputs"] = retained_source_map
    args.output.write_text(json.dumps(output, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

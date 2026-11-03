#!/usr/bin/env python3
"""Qualification controller only; artifact source remains immutable S."""
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import shutil
import stat
import subprocess
import sys
import sysconfig
import tarfile
import urllib.error
import urllib.request
import zipfile

SOURCE = "e3f38ef6f05ae636d2837f9d69f8d6805222664b"
RUN = 41593142176
ARTIFACT = 13213549400
ZIP_SHA = "4da83dd0d2e07444454d70e819595330be7bf57fe81d5671b1cdd81a2de03941"
SDK_SHA = "cd153fd817a6551d46c29a7b0979b8de488151802a56e5d520d8a602431afe0c"
SDK_SOURCE_SHA = "d794cde1d38c1065e3c757946851ee298dc868d5123557090c53c154316afaa9"
LINUX_RUN = 41608568860
LINUX_ARTIFACT = 13218662858
LINUX_Q = "6f0ca8a0a6777016bdeb0e7a49807ccee2ab1a02"
LINUX_ZIP_SHA = "b5ae6367a46b705795e9f00f6a0e140cf15185d557afe108b99a450ef12db03b"
DIRECT_RUN = 41622923509
DIRECT_ARTIFACT = 13224613401
DIRECT_Q = "a2a8fc9bb0ab0d12af0ad4b98f3ea653aeaf3a3a"
DIRECT_ZIP_SHA = "3dee5b013e12d6e424d70998c2a733fa9a5b694f0d0cc691c8589b9399e46a4b"
DIRECT_JOB = 125872935653
DIRECT_JOB_LOG_SHA = "c742715b89b8135259903d7daa93e720dd8ee6bf3b40407fc2905fdecb91b54b"
CONTROLLER_TEST = "python/tests/test_python_artifact_version.py"
DIRECT_FILES = {
    "python-saga.log": "8aceba16b33ba57bb2d507f86a86c2f7a78a32214ec742da2e83228d1b442236",
    "installed-linux311.json": "56bd013ad1d2f9c5514e41ca987a5eb67ab442ef89b588cbe3e355d0008cf795",
    "installed-inventories/temporal-python-consumer.json": "927de727723424af2847688de09ac3537e3ee6d5c1fedf4eb88da3be178fbbe1",
    "linux-binary-closure.json": "be30d1c1e576a9c0a887f02c3604222722c0c0aaa9aa7ecf4e1b9f118d77af1d",
    "dist/selection.json": "b2daa344ad425239212d57a5b79fd1faf89e3d1e21c56c8b18ff3d780aef0421",
    "dist/umf_core-0.10.8-cp311-abi3-manylinux_2_34_x86_64.whl": "2dd4f00869240b37aa89fb9009e0663bf4c78cde103995d9d5c6e6b2333d92dd",
    "dist/umf_core-0.10.8.tar.gz": "4f2a21532fa58f17a85162752789cbbdee7a3657bb5dccf5a350338e4eb2b048",
}
LINUX_FILES = {
    "raw/umf_core-0.10.8-cp311-abi3-linux_x86_64.whl": "d8da5e64fbc3f9d112daf5e5d6032d96f17bca6e8349a8b52064597fec827bb5",
    "repaired/umf_core-0.10.8-cp311-abi3-manylinux_2_34_x86_64.whl": "2dd4f00869240b37aa89fb9009e0663bf4c78cde103995d9d5c6e6b2333d92dd",
    "raw/umf_core-0.10.8.tar.gz": "4f2a21532fa58f17a85162752789cbbdee7a3657bb5dccf5a350338e4eb2b048",
    "pure/umf_codegen-0.10.8-py3-none-any.whl": "0d21acef3171442b818a4ad1dfdbaf99cc0f0f5557e5c670d5ce56243235dbc5",
    "pure/umf_access-0.1.0.dev10-py3-none-any.whl": "493c5f92cc9795403e08a421b6b3ba4a6e5799b94a4980f1613f38ecf2f1c2d7",
    "installed-sdk-custody.json": "74608803cd91230825b2a5c9132b80a61db48af51cfed11d86c0edf4373a24b9",
    "installed-sdk-browser.json": "f17d3d92e210869825a763bfe00d8f447a7eb972e510bca3461fd3eb65c3dade",
}
APPROVED = {
    "scripts/saga-portable/verify.ts": "09bf569611574c28e6728dead6ad10137271bf26366f99faec6803ccf5fca9e5",
    "tests/saga/custody.test.ts": "d6e63a9ddfae1811819ff0987c624b2f0a17ee7e3f4b2c5279c80b4e5970dff4",
}
OVERLAY = (*APPROVED, "scripts/test-sdk-install.ts")
WIRING = {
    ".github/workflows/sagas.yml", "tools/temporal_resume.py",
    "scripts/saga-portable/installed-browser.ts", "tests/qualification/test_temporal_resume.py",
    "tools/qualify_python_release_wheel.py", "python/tests/test_distribution_artifact.py",
    CONTROLLER_TEST,
}


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(data)
    return h.hexdigest()


def write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


def validate_paths(paths: set[str]) -> None:
    if not set(APPROVED) <= paths or not paths <= set(OVERLAY) | WIRING:
        raise ValueError("Controller changes exceed the reviewed qualification-only surface")


def verify_sources(source: Path, inputs: dict[str, str], changed: set[str]) -> None:
    if changed & inputs.keys():
        raise ValueError("Qualification overlay enters SDK producer inputs")
    for name, expected in inputs.items():
        path = source / name
        if not path.resolve().is_relative_to(source.resolve()) or not path.is_file() or digest(path) != expected:
            raise ValueError("SDK producer input differs from source S: " + name)


def extract_zip(archive: Path, target: Path, expected: str) -> None:
    if digest(archive) != expected:
        raise ValueError("Retained artifact ZIP digest mismatch")
    with zipfile.ZipFile(archive) as z:
        names = set()
        for info in z.infolist():
            path = target / info.filename
            if (info.filename in names or not path.resolve().is_relative_to(target.resolve())
                    or stat.S_ISLNK(info.external_attr >> 16)):
                raise ValueError("Unsafe or duplicate retained artifact member")
            names.add(info.filename)
            if not info.is_dir():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(z.read(info))


def sdk_manifest(archive: Path) -> dict:
    if digest(archive) != SDK_SHA:
        raise ValueError("Retained SDK archive digest mismatch")
    with tarfile.open(archive, "r:gz") as t:
        members = [m for m in t.getmembers() if m.name == "package/dist/rust-default-manifest.json"]
        if len(members) != 1 or not members[0].isfile():
            raise ValueError("SDK producer manifest roster mismatch")
        manifest = json.load(t.extractfile(members[0]))
    if manifest["sourceClosure"]["sha256"] != SDK_SOURCE_SHA or manifest["packageVersion"] != "0.10.8":
        raise ValueError("SDK source/version mismatch")
    return manifest


def api(path: str, token: str) -> dict:
    request = urllib.request.Request("https://api.github.com/repos/DocumentDrivenDX/umf/" + path,
        headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def download(archive: Path, token: str, artifact_id: int = ARTIFACT, *, endpoint: str | None = None) -> None:
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    request = urllib.request.Request(
        "https://api.github.com/repos/DocumentDrivenDX/umf/" + (endpoint or f"actions/artifacts/{artifact_id}/zip"),
        headers={"Authorization": "Bearer " + token})
    try:
        urllib.request.build_opener(NoRedirect).open(request, timeout=60)
    except urllib.error.HTTPError as response:
        if response.code != 302:
            raise
        location = response.headers["Location"]
    else:
        raise ValueError("Expected artifact redirect")
    if not location.startswith("https://"):
        raise ValueError("Artifact redirect is not HTTPS")
    # A new unauthenticated request prevents forwarding GitHub credentials.
    with urllib.request.urlopen(location, timeout=120) as response, archive.open("wb") as output:
        shutil.copyfileobj(response, output)


def check_roots(source: Path, controller: Path) -> str:
    if git(source, "rev-parse", "HEAD") != SOURCE or git(source, "status", "--porcelain=v1"):
        raise ValueError("Artifact source is not clean immutable S")
    q = git(controller, "rev-parse", "HEAD")
    if q != os.environ["UMF_CONTROLLER_COMMIT"] or git(controller, "status", "--porcelain=v1"):
        raise ValueError("Controller checkout differs from workflow Q")
    validate_paths(set(git(controller, "diff", "--name-only", SOURCE, q).splitlines()))
    for path, expected in APPROVED.items():
        if digest(controller / path) != expected:
            raise ValueError("Approved oracle/control hash differs")
    return q


def prepare(source: Path, controller: Path, output: Path) -> None:
    q = check_roots(source, controller)
    output.mkdir(parents=True, exist_ok=True)
    token = os.environ["GH_TOKEN"]
    run = api(f"actions/runs/{RUN}", token)
    artifact = api(f"actions/artifacts/{ARTIFACT}", token)
    if (run["head_sha"] != SOURCE or run["run_attempt"] != 1 or run["conclusion"] != "failure"
            or artifact["workflow_run"]["id"] != RUN or artifact["expired"]
            or artifact["name"] != "saga-qualification-" + SOURCE
            or artifact["digest"] != "sha256:" + ZIP_SHA):
        raise ValueError("Retained artifact/run custody mismatch")
    archive = output / "original-artifact.zip"
    download(archive, token)
    retained = output / "original-artifact"
    extract_zip(archive, retained, ZIP_SHA)
    candidates = list(retained.rglob("umf-sdk.tgz"))
    if len(candidates) != 1:
        raise ValueError("Retained SDK archive roster mismatch")
    manifest = sdk_manifest(candidates[0])
    verify_sources(source, manifest["sourceClosure"]["inputs"], set(OVERLAY) | WIRING)
    destination = source / ".cache/sdk-distribution"
    destination.mkdir(parents=True, exist_ok=True)
    for name in ["umf-sdk.tgz", "manifest.json", "receipt.json"]:
        shutil.copyfile(candidates[0].parent / name, destination / name)
    write(output / "source-and-controller.json", {
        "artifactSourceS": SOURCE, "controllerQ": q, "retainedRun": RUN, "artifactID": ARTIFACT,
        "originalZIP_SHA256": ZIP_SHA, "sdkArchiveSHA256": SDK_SHA,
        "sdkProducerSourceSHA256": SDK_SOURCE_SHA, "run": run, "artifact": artifact,
        "overlayHashes": {name: digest(controller / name) for name in OVERLAY},
        "overlayActive": False,
        "originalReceiptsPreserved": True, "fullCampaignReplayed": False,
    })


def verify_retained_linux(root: Path) -> dict:
    inventory = json.loads((root / "files.json").read_text())
    provenance = json.loads((root / "source-and-controller.json").read_text())
    if (inventory["artifactSourceS"] != SOURCE or inventory["sourceHead"] != SOURCE
            or inventory["sourceStatus"] or inventory["controllerQ"] != LINUX_Q
            or provenance["artifactSourceS"] != SOURCE or provenance["controllerQ"] != LINUX_Q
            or provenance["overlayActive"]):
        raise ValueError("Prior producer source/controller/restoration identity mismatch")
    rows = inventory["files"]
    names = [row["path"] for row in rows]
    actual = {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()}
    if len(names) != len(set(names)) or actual != set(names) | {"files.json"}:
        raise ValueError("Prior retained inventory roster differs")
    for row in rows:
        path = root / row["path"]
        if (not path.resolve().is_relative_to(root.resolve()) or not path.is_file()
                or path.stat().st_size != row["bytes"] or digest(path) != row["sha256"]):
            raise ValueError("Prior retained inventory member differs")
    for name, expected in LINUX_FILES.items():
        if digest(root / name) != expected:
            raise ValueError("Pinned Linux producer/proof bytes differ: " + name)
    sdk = json.loads((root / "installed-sdk-custody.json").read_text())
    browser = json.loads((root / "installed-sdk-browser.json").read_text())
    if (sdk["archiveSha256"] != SDK_SHA or browser["archiveSha256"] != SDK_SHA
            or browser["artifactSourceS"] != SOURCE or browser["controllerQ"] != LINUX_Q
            or sdk["sagaResult"]["cases"] != 19 or sdk["sagaResult"]["passed"] != 19
            or browser["result"]["cases"] != 19 or browser["result"]["passed"] != 19
            or browser["hostCalls"] != 0):
        raise ValueError("Prior SDK/browser passing proof differs")
    return provenance


def prepare_linux(source: Path, controller: Path, output: Path) -> None:
    q = check_roots(source, controller)
    output.mkdir(parents=True, exist_ok=True)
    token = os.environ["GH_TOKEN"]
    run = api(f"actions/runs/{LINUX_RUN}", token)
    artifact = api(f"actions/artifacts/{LINUX_ARTIFACT}", token)
    if (run["head_sha"] != LINUX_Q or run["run_attempt"] != 1 or run["conclusion"] != "failure"
            or run["event"] != "workflow_dispatch" or run["workflow_id"] != 401955635
            or artifact["workflow_run"]["id"] != LINUX_RUN or artifact["expired"]
            or artifact["name"] != f"temporal-resume-{LINUX_Q}-{LINUX_RUN}"
            or artifact["digest"] != "sha256:" + LINUX_ZIP_SHA):
        raise ValueError("Prior Linux producer artifact/run mismatch")
    archive = output / "prior-linux-artifact.zip"
    download(archive, token, LINUX_ARTIFACT)
    retained = output / "prior-linux"
    extract_zip(archive, retained, LINUX_ZIP_SHA)
    prior = verify_retained_linux(retained)
    current_overlay = {name: digest(controller / name) for name in OVERLAY}
    if current_overlay != prior["overlayHashes"]:
        raise ValueError("Previously qualified SDK oracle/installer changed; cannot reuse passes")
    candidates = list(retained.rglob("umf-sdk.tgz"))
    if len(candidates) != 1:
        raise ValueError("Prior SDK archive roster mismatch")
    manifest = sdk_manifest(candidates[0])
    verify_sources(source, manifest["sourceClosure"]["inputs"], set(OVERLAY) | WIRING)
    destination = source / ".cache/sdk-distribution"
    destination.mkdir(parents=True, exist_ok=True)
    for name in ["umf-sdk.tgz", "manifest.json", "receipt.json"]:
        shutil.copyfile(candidates[0].parent / name, destination / name)
    shutil.copytree(retained / "pure", output / "pure")
    write(output / "source-and-controller.json", {
        "artifactSourceS": SOURCE, "controllerQ": q, "overlayHashes": current_overlay,
        "overlayActive": False, "priorProducerQ": LINUX_Q, "priorRun": LINUX_RUN,
        "priorArtifact": LINUX_ARTIFACT, "priorZIP_SHA256": LINUX_ZIP_SHA,
        "priorProvenance": prior, "priorSDK19AndBrowser19PreservedOriginalIdentities": True,
        "directProducerRebuilt": False, "SDKOrBrowserReplayed": False,
        "newVerifierSHA256": digest(controller / "tools/qualify_python_release_wheel.py"),
        "newVerifierTestsSHA256": digest(controller / "python/tests/test_distribution_artifact.py"),
        "unchangedRetainedPins": LINUX_FILES,
    })


def validate_direct_receipts(saga: dict, installed: dict, observed: dict) -> None:
    binding = saga["installedBinding"]
    wheel_sha = DIRECT_FILES["dist/umf_core-0.10.8-cp311-abi3-manylinux_2_34_x86_64.whl"]
    native_sha = "7716d79ae0c85ac92ba679d531c213811fe66501397b0ec0f78e8bad53c296da"
    if (saga["profile"] != "umf.saga.portable-host-receipt/2" or saga["cases"] != 19 or saga["passed"] != 19
            or len(saga["results"]) != 19 or not all(row["passed"] is True for row in saga["results"])
            or saga["runtime"] != {"python": "3.11.17", "platform": "Linux", "arch": "x86_64"}
            or binding != {"status": "passed", "wheelSha256": wheel_sha,
                "beforeNativeSha256": native_sha, "afterNativeSha256": native_sha,
                "beforeInstalledFileCount": 81, "afterInstalledFileCount": 81,
                "beforePackageFileCount": 72, "afterPackageFileCount": 72}
            or saga["artifacts"]["pythonWheel"]["sha256"] != wheel_sha
            or installed["artifactSourceS"] != SOURCE or installed["controllerQ"] != DIRECT_Q
            or installed["actualPython"] != "3.11.17" or installed["pydantic"] != "2.14.2"
            or installed["inspectionCases"] != 17 or installed["inspectionCalls"] != 51
            or installed["companionResourceAndNativeChecks"] is not True
            or observed["actualPython"] != "3.11.17" or observed["isolated"] is not True
            or observed["dontWriteBytecode"] is not True):
        raise ValueError("Completed Linux311 runtime/source/Saga/strict binding proof differs")
    files = {row["path"]: row for row in observed["files"]}
    packages = {name: row["sha256"] for name, row in files.items()
                if row["kind"] == "file" and name.startswith(("umf/", "umf_codegen/", "umf_access/"))}
    if (len(files) != len(observed["files"]) or any(row["kind"] != "file" for row in files.values())
            or packages != {name: row["sha256"] for name, row in installed["installedFiles"].items()}):
        raise ValueError("Completed Linux311 observed package inventory differs")
    records = observed["records"]
    if len(records) != 3 or {row["path"] for row in records} != {
            "umf_core-0.10.8.dist-info/RECORD", "umf_codegen-0.10.8.dist-info/RECORD",
            "umf_access-0.1.0.dev10.dist-info/RECORD"}:
        raise ValueError("Completed Linux311 actual RECORD roster differs")
    for row in records:
        if hashlib.sha256(base64.b64decode(row["bytesBase64"], validate=True)).hexdigest() != files[row["path"]]["sha256"]:
            raise ValueError("Completed Linux311 actual RECORD bytes differ")


def verify_completed_linux(root: Path, job_log: Path) -> dict:
    inventory = json.loads((root / "files.json").read_text())
    prior = json.loads((root / "source-and-controller.json").read_text())
    if (inventory["artifactSourceS"] != SOURCE or inventory["sourceHead"] != SOURCE
            or inventory["sourceStatus"] or inventory["controllerQ"] != DIRECT_Q
            or prior["artifactSourceS"] != SOURCE or prior["controllerQ"] != DIRECT_Q or prior["overlayActive"]):
        raise ValueError("Completed Linux311 source/controller/restoration differs")
    rows = inventory["files"]
    names = [row["path"] for row in rows]
    actual = {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()}
    # The original capture omitted all files.json basenames; the nested producer
    # inventory is independently authenticated below under its original identity.
    if len(names) != len(set(names)) or actual != set(names) | {"files.json", "prior-linux/files.json"}:
        raise ValueError("Completed Linux311 retained inventory roster differs")
    for row in rows:
        path = root / row["path"]
        if (not path.resolve().is_relative_to(root.resolve()) or path.stat().st_size != row["bytes"]
                or digest(path) != row["sha256"]):
            raise ValueError("Completed Linux311 retained member differs")
    verify_retained_linux(root / "prior-linux")
    for name, expected in DIRECT_FILES.items():
        if digest(root / name) != expected:
            raise ValueError("Pinned completed Linux311 bytes differ: " + name)
    if digest(job_log) != DIRECT_JOB_LOG_SHA:
        raise ValueError("Original Linux311 lifecycle/pytest job log differs")
    log = job_log.read_text()
    if "Ran 2 tests in 24.999s" not in log or "1 failed, 45 passed in 0.83s" not in log:
        raise ValueError("Original Linux311 lifecycle/pytest outcomes differ")
    validate_direct_receipts(json.loads((root / "python-saga.log").read_text()),
        json.loads((root / "installed-linux311.json").read_text()),
        json.loads((root / "installed-inventories/temporal-python-consumer.json").read_text()))
    return prior


def prepare_consumers(source: Path, controller: Path, output: Path) -> None:
    q = check_roots(source, controller)
    output.mkdir(parents=True, exist_ok=True)
    token = os.environ["GH_TOKEN"]
    run = api(f"actions/runs/{DIRECT_RUN}", token)
    artifact = api(f"actions/artifacts/{DIRECT_ARTIFACT}", token)
    job = api(f"actions/jobs/{DIRECT_JOB}", token)
    if (run["head_sha"] != DIRECT_Q or run["run_attempt"] != 1 or run["conclusion"] != "failure"
            or run["event"] != "workflow_dispatch" or run["workflow_id"] != 401955635
            or artifact["workflow_run"]["id"] != DIRECT_RUN or artifact["expired"]
            or artifact["name"] != f"temporal-resume-{DIRECT_Q}-{DIRECT_RUN}"
            or artifact["digest"] != "sha256:" + DIRECT_ZIP_SHA or job["run_id"] != DIRECT_RUN
            or job["name"] != "temporal-resume" or job["status"] != "completed" or job["conclusion"] != "failure"):
        raise ValueError("Completed Linux311 original artifact/run/job identity differs")
    archive = output / "completed-linux311-artifact.zip"
    download(archive, token, DIRECT_ARTIFACT)
    retained = output / "completed-linux311"
    extract_zip(archive, retained, DIRECT_ZIP_SHA)
    log = output / "original-linux311-job.log"
    download(log, token, endpoint=f"actions/jobs/{DIRECT_JOB}/logs")
    prior = verify_completed_linux(retained, log)
    current_overlay = {name: digest(controller / name) for name in OVERLAY}
    if current_overlay != prior["overlayHashes"]:
        raise ValueError("Previously qualified oracle/installer changed; cannot reuse direct311")
    candidates = list((retained / "prior-linux").rglob("umf-sdk.tgz"))
    if len(candidates) != 1:
        raise ValueError("Completed Linux311 original SDK roster differs")
    manifest = sdk_manifest(candidates[0])
    verify_sources(source, manifest["sourceClosure"]["inputs"], set(OVERLAY) | WIRING)
    destination = source / ".cache/sdk-distribution"
    destination.mkdir(parents=True, exist_ok=True)
    for name in ["umf-sdk.tgz", "manifest.json", "receipt.json"]:
        shutil.copyfile(candidates[0].parent / name, destination / name)
    for name in ["pure", "dist"]:
        shutil.copytree(retained / name, output / name)
    write(output / "source-and-controller.json", {
        "artifactSourceS": SOURCE, "controllerQ": q, "overlayHashes": current_overlay,
        "overlayActive": False, "retainedDirectQ": DIRECT_Q, "retainedDirectRun": DIRECT_RUN,
        "retainedDirectArtifact": DIRECT_ARTIFACT, "retainedDirectZIP_SHA256": DIRECT_ZIP_SHA,
        "retainedLifecycleAnd45PytestLog_SHA256": DIRECT_JOB_LOG_SHA, "priorProvenance": prior,
        "reusedDirect311Saga19Lifecycle2And45PytestOriginalIdentities": True,
        "direct311OrSDKOrBrowserOrProducerReplayed": False,
        "controllerOwnedTests": {CONTROLLER_TEST: digest(controller / CONTROLLER_TEST)},
        "controllerOwnedTestBytesAreNotSourceArchiveBytes": True,
        "productionVerifierSHA256": digest(controller / "tools/verify_python_artifacts.py"),
    })


def overlay(source: Path, controller: Path, output: Path, restore: bool) -> None:
    record = json.loads((output / "source-and-controller.json").read_text())
    if git(source, "rev-parse", "HEAD") != SOURCE or git(controller, "rev-parse", "HEAD") != record["controllerQ"]:
        raise ValueError("Source/controller commit changed")
    if restore and not record["overlayActive"]:
        if git(source, "status", "--porcelain=v1"):
            raise ValueError("Inactive qualification overlay has dirty source")
        return
    if not restore and record["overlayActive"]:
        raise ValueError("Qualification overlay is already active")
    for name, expected in record["overlayHashes"].items():
        if digest(controller / name) != expected:
            raise ValueError("Controller file changed")
        if restore:
            if digest(source / name) != expected:
                raise ValueError("Qualification file changed during execution")
            (source / name).write_bytes(subprocess.check_output(["git", "show", SOURCE + ":" + name], cwd=source))
        else:
            original = subprocess.check_output(["git", "show", SOURCE + ":" + name], cwd=source)
            if (source / name).read_bytes() != original:
                raise ValueError("Source overlay is not starting from S")
            shutil.copyfile(controller / name, source / name)
    manifest = sdk_manifest(source / ".cache/sdk-distribution/umf-sdk.tgz")
    verify_sources(source, manifest["sourceClosure"]["inputs"], set(OVERLAY) | WIRING)
    if restore and git(source, "status", "--porcelain=v1"):
        raise ValueError("Restored artifact source is not clean S")
    record["overlayActive"] = not restore
    write(output / "source-and-controller.json", record)


CONSUMER_PYTHONS = ("3.11.17", "3.13.17")


def validate_consumer(expected: str, version: tuple, system: str, machine: str,
                      isolated: bool, implementation: str) -> None:
    if (expected not in CONSUMER_PYTHONS or version != tuple(map(int, expected.split(".")))
            or system != "Linux" or machine != "x86_64" or not isolated or implementation != "cpython"):
        raise ValueError("Expected isolated Linux x86_64 CPython" + expected + " consumer")


def probe(source: Path, output: Path, expected_python: str, install_report: Path, receipt: Path) -> None:
    validate_consumer(expected_python, sys.version_info[:3], platform.system(), platform.machine(),
                      bool(sys.flags.isolated), sys.implementation.name)
    if (not install_report.resolve().is_relative_to(output.resolve())
            or not receipt.resolve().is_relative_to(output.resolve())
            or install_report.resolve() == receipt.resolve()):
        raise ValueError("Consumer report/receipt paths must be distinct retained outputs")
    import umf
    import umf_codegen
    import umf_access
    from umf import _rust_core
    from umf.rust_codegen import CodegenEngine
    from umf_codegen import _native
    from umf_access.types import RUNTIME_IDENTITY
    from packaging.specifiers import SpecifierSet
    from packaging.tags import sys_tags
    from packaging.utils import parse_wheel_filename
    prefix = Path(sys.prefix).resolve()
    report = json.loads(install_report.read_text())
    selected = {}
    for row in report["install"]:
        name = row["metadata"]["name"].lower().replace("_", "-")
        if name in {"umf-core", "umf-codegen", "umf-access"}:
            from urllib.parse import urlsplit, unquote
            url = urlsplit(row["download_info"]["url"])
            path = Path(unquote(url.path))
            if url.scheme != "file" or not path.resolve().is_relative_to(output.resolve()):
                raise ValueError("Candidate wheel did not come from retained wheelhouse")
            if digest(path) != row["download_info"]["archive_info"]["hashes"]["sha256"]:
                raise ValueError("Installed wheel differs from actual candidate")
            selected[name] = {"path": str(path), "sha256": digest(path), "version": row["metadata"]["version"]}
            if expected_python not in SpecifierSet(row["metadata"]["requires_python"]):
                raise ValueError("Wheel Requires-Python excludes actual consumer " + expected_python)
            tags = parse_wheel_filename(path.name)[3]
            if not tags & set(sys_tags()):
                raise ValueError("Actual wheel tags exclude this Linux " + expected_python + " consumer")
            if name == "umf-core" and any(t.interpreter != "cp311" or t.abi != "abi3" for t in tags):
                raise ValueError("Consumer did not receive the genuine cp311-abi3 Core wheel")
    if set(selected) != {"umf-core", "umf-codegen", "umf-access"}:
        raise ValueError("Candidate resolver distribution roster mismatch")
    if {k: v["version"] for k, v in selected.items()} != {"umf-core": "0.10.8", "umf-codegen": "0.10.8", "umf-access": "0.1.0.dev10"}:
        raise ValueError("Installed candidate identity mismatch")
    if umf.current_core_version() != "0.10.0" or RUNTIME_IDENTITY != ("umf_access", "0.1.0.dev10", "umf-access-runtime/0.1"):
        raise ValueError("Semantic or Access runtime identity changed")
    origins = {}
    for module in [umf, umf_codegen, umf_access, _rust_core]:
        path = Path(module.__file__).resolve()
        if not path.is_relative_to(prefix):
            raise ValueError("Loaded checkout or foreign package instead of installed candidate")
        origins[module.__name__] = {"path": str(path), "sha256": digest(path)}
    installed_files = {}
    for name, candidate in selected.items():
        distribution = importlib.metadata.distribution(name)
        with zipfile.ZipFile(candidate["path"]) as wheel:
            for member in wheel.namelist():
                if member.endswith("/") or not member.startswith(("umf/", "umf_codegen/", "umf_access/")):
                    continue
                path = Path(distribution.locate_file(member)).resolve()
                expected = hashlib.sha256(wheel.read(member)).hexdigest()
                if not path.is_relative_to(prefix) or not path.is_file() or digest(path) != expected:
                    raise ValueError("Installed package member differs from exact wheel: " + member)
                installed_files[member] = {"path": str(path), "sha256": expected}
    _native._verify_native()
    _native._load_resource_manifest()
    resources = Path(umf_codegen.__file__).resolve().parent / "_resources"
    roster = {"coreSchema": "core.schema.json", "referenceSchema": "core.reference-schema.json", "packageSchema": "core.package-schema.json", "constraints": "core.constraints.json", "domainPolicy": "core.domain-policy.json", "tablesPackage": "tables.package.json", "actionsPackage": "actions.package.json", "bindingPackage": "binding.package.json", "stableBindingPackage": "stable-binding.package.json"}
    engine = CodegenEngine({name: json.loads((resources / path).read_text()) for name, path in roster.items()})
    cases = json.loads((source / "tests/rust-core/fixtures/access-inspection/cases.json").read_text())["cases"]
    if len(cases) != 17:
        raise ValueError("Frozen inspection corpus changed")
    for case in cases:
        request = case["request"]
        before = json.dumps(request)
        if engine.call("inspectAccessViews", request) != {"ok": True, "result": case["expected"]}:
            raise ValueError("Installed inspection dispatcher parity: " + case["id"])
        for carrier in [list, tuple]:
            if engine.inspect_access_views(request["document"], request["selected"], carrier(request.get("bindings", [])), request.get("sourceId", "logical")) != case["expected"]:
                raise ValueError("Installed convenience parity: " + case["id"])
        if json.dumps(request) != before:
            raise ValueError("Inspection mutated request custody")
    provenance = json.loads((output / "source-and-controller.json").read_text())
    write(receipt, {"artifactSourceS": SOURCE, "controllerQ": provenance["controllerQ"], "runtime": sys.version,
        "expectedPython": expected_python, "actualPython": platform.python_version(),
        "implementation": sys.implementation.name, "installReport": str(install_report),
        "selected": selected, "origins": origins, "installedFiles": installed_files,
        "pydantic": importlib.metadata.version("pydantic"),
        "inspectionCases": 17, "inspectionCalls": 51, "companionResourceAndNativeChecks": True,
        "scope": "Actual Linux " + expected_python + " component install; no Truss/native enrollment or broader host claim"})


def installed_inventory(platlib: Path, prefix: Path) -> dict:
    """Read-only evidence, including unrecorded files; never import UMF or repair it."""
    platlib = platlib.resolve(strict=True)
    if not platlib.is_relative_to(prefix.resolve(strict=True)):
        raise ValueError("Installed inventory platlib escapes its interpreter prefix")
    roots = [platlib / name for name in ("umf", "umf_codegen", "umf_access")]
    for name in ("umf_core", "umf_codegen", "umf_access"):
        roots.extend(sorted(platlib.glob(name + "-*.dist-info")))
    files, records = [], []
    for root in roots:
        if not root.exists() and not root.is_symlink():
            continue
        paths = [root] if root.is_symlink() or not root.is_dir() else sorted(root.rglob("*"))
        for path in paths:
            mode = path.lstat().st_mode
            name = path.relative_to(platlib).as_posix()
            if stat.S_ISLNK(mode):
                files.append({"path": name, "kind": "symlink", "target": os.readlink(path)})
            elif stat.S_ISREG(mode):
                files.append({"path": name, "kind": "file", "bytes": path.stat().st_size, "sha256": digest(path)})
                if path.name == "RECORD" and root.name.endswith(".dist-info"):
                    records.append({"path": name, "bytesBase64": base64.b64encode(path.read_bytes()).decode("ascii")})
            elif not stat.S_ISDIR(mode):
                files.append({"path": name, "kind": "other", "mode": mode})
    return {"profile": "umf.installed-files-observation/1", "platlib": str(platlib),
            "prefix": str(prefix), "files": files, "records": records,
            "scope": "Observed files and lossless installed RECORD bytes; not a qualification acceptance"}


def capture(source: Path, controller: Path, output: Path) -> None:
    runner_temp = os.environ.get("RUNNER_TEMP")
    if runner_temp:
        for name in ("temporal-python-consumer", "temporal-rebuilt-consumer",
                     "temporal-python313-direct", "temporal-python313-rebuilt"):
            python = Path(runner_temp) / name / "bin/python"
            if python.is_file():
                subprocess.run([str(python), "-I", "-B", str(controller / "tools/temporal_resume.py"),
                    "inventory", "--source", str(source), "--controller", str(controller),
                    "--output", str(output / "installed-inventories" / (name + ".json"))], check=True)
    write(output / "files.json", {"artifactSourceS": SOURCE, "controllerQ": git(controller, "rev-parse", "HEAD"),
        "sourceHead": git(source, "rev-parse", "HEAD"), "sourceStatus": git(source, "status", "--porcelain=v1"),
        "files": [{"path": str(p.relative_to(output)), "bytes": p.stat().st_size, "sha256": digest(p)}
                  for p in sorted(output.rglob("*")) if p.is_file() and p.name != "files.json"]})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["prepare", "prepare-linux", "prepare-consumers", "overlay", "restore", "probe", "capture", "inventory"])
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--controller", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-python", choices=CONSUMER_PYTHONS)
    parser.add_argument("--install-report", type=Path)
    parser.add_argument("--receipt", type=Path)
    args = parser.parse_args()
    if args.operation == "prepare":
        prepare(args.source, args.controller, args.output)
    elif args.operation == "prepare-linux":
        prepare_linux(args.source, args.controller, args.output)
    elif args.operation == "prepare-consumers":
        prepare_consumers(args.source, args.controller, args.output)
    elif args.operation in {"overlay", "restore"}:
        overlay(args.source, args.controller, args.output, args.operation == "restore")
    elif args.operation == "probe":
        if not args.expected_python or not args.install_report or not args.receipt:
            parser.error("probe requires exact --expected-python, --install-report and --receipt")
        probe(args.source, args.output, args.expected_python, args.install_report, args.receipt)
    elif args.operation == "inventory":
        if not sys.flags.isolated or not sys.dont_write_bytecode:
            raise ValueError("Installed inventory requires explicit -I -B")
        value = installed_inventory(Path(sysconfig.get_paths()["platlib"]), Path(sys.prefix))
        value.update(actualPython=platform.python_version(), isolated=True, dontWriteBytecode=True)
        write(args.output, value)
    else:
        capture(args.source, args.controller, args.output)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Qualification controller only; artifact source remains immutable S."""
from __future__ import annotations

import argparse
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


def download(archive: Path, token: str, artifact_id: int = ARTIFACT) -> None:
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    request = urllib.request.Request(
        f"https://api.github.com/repos/DocumentDrivenDX/umf/actions/artifacts/{artifact_id}/zip",
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


def capture(source: Path, controller: Path, output: Path) -> None:
    write(output / "files.json", {"artifactSourceS": SOURCE, "controllerQ": git(controller, "rev-parse", "HEAD"),
        "sourceHead": git(source, "rev-parse", "HEAD"), "sourceStatus": git(source, "status", "--porcelain=v1"),
        "files": [{"path": str(p.relative_to(output)), "bytes": p.stat().st_size, "sha256": digest(p)}
                  for p in sorted(output.rglob("*")) if p.is_file() and p.name != "files.json"]})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["prepare", "prepare-linux", "overlay", "restore", "probe", "capture"])
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
    elif args.operation in {"overlay", "restore"}:
        overlay(args.source, args.controller, args.output, args.operation == "restore")
    elif args.operation == "probe":
        if not args.expected_python or not args.install_report or not args.receipt:
            parser.error("probe requires exact --expected-python, --install-report and --receipt")
        probe(args.source, args.output, args.expected_python, args.install_report, args.receipt)
    else:
        capture(args.source, args.controller, args.output)


if __name__ == "__main__":
    main()

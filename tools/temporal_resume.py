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
APPROVED = {
    "scripts/saga-portable/verify.ts": "09bf569611574c28e6728dead6ad10137271bf26366f99faec6803ccf5fca9e5",
    "tests/saga/custody.test.ts": "d6e63a9ddfae1811819ff0987c624b2f0a17ee7e3f4b2c5279c80b4e5970dff4",
}
OVERLAY = (*APPROVED, "scripts/test-sdk-install.ts")
WIRING = {
    ".github/workflows/sagas.yml", "tools/temporal_resume.py",
    "scripts/saga-portable/installed-browser.ts", "tests/qualification/test_temporal_resume.py",
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


def download(archive: Path, token: str) -> None:
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    request = urllib.request.Request(
        f"https://api.github.com/repos/DocumentDrivenDX/umf/actions/artifacts/{ARTIFACT}/zip",
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


def prepare(source: Path, controller: Path, output: Path) -> None:
    if git(source, "rev-parse", "HEAD") != SOURCE or git(source, "status", "--porcelain=v1"):
        raise ValueError("Artifact source is not clean immutable S")
    q = git(controller, "rev-parse", "HEAD")
    if q != os.environ["UMF_CONTROLLER_COMMIT"] or git(controller, "status", "--porcelain=v1"):
        raise ValueError("Controller checkout differs from workflow Q")
    validate_paths(set(git(controller, "diff", "--name-only", SOURCE, q).splitlines()))
    for path, expected in APPROVED.items():
        if digest(controller / path) != expected:
            raise ValueError("Approved oracle/control hash differs")
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


def probe(source: Path, output: Path) -> None:
    if platform.system() != "Linux" or platform.machine() != "x86_64" or sys.version_info[:3] != (3, 11, 17) or not sys.flags.isolated:
        raise ValueError("Expected isolated Linux x86_64 CPython3.11.17 consumer")
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
    report = json.loads((output / "install-report.json").read_text())
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
            if "3.11.17" not in SpecifierSet(row["metadata"]["requires_python"]):
                raise ValueError("Wheel Requires-Python excludes actual3.11")
            if not parse_wheel_filename(path.name)[3] & set(sys_tags()):
                raise ValueError("Actual wheel tags exclude this Linux311 consumer")
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
    write(output / "installed-linux311.json", {"artifactSourceS": SOURCE, "runtime": sys.version,
        "selected": selected, "origins": origins, "installedFiles": installed_files,
        "pydantic": importlib.metadata.version("pydantic"),
        "inspectionCases": 17, "inspectionCalls": 51, "companionResourceAndNativeChecks": True,
        "scope": "Actual Linux311 component install; no Truss/native enrollment or broader host claim"})


def capture(source: Path, controller: Path, output: Path) -> None:
    write(output / "files.json", {"artifactSourceS": SOURCE, "controllerQ": git(controller, "rev-parse", "HEAD"),
        "sourceHead": git(source, "rev-parse", "HEAD"), "sourceStatus": git(source, "status", "--porcelain=v1"),
        "files": [{"path": str(p.relative_to(output)), "bytes": p.stat().st_size, "sha256": digest(p)}
                  for p in sorted(output.rglob("*")) if p.is_file() and p.name != "files.json"]})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["prepare", "overlay", "restore", "probe", "capture"])
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--controller", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.operation == "prepare":
        prepare(args.source, args.controller, args.output)
    elif args.operation in {"overlay", "restore"}:
        overlay(args.source, args.controller, args.output, args.operation == "restore")
    elif args.operation == "probe":
        probe(args.source, args.output)
    else:
        capture(args.source, args.controller, args.output)


if __name__ == "__main__":
    main()

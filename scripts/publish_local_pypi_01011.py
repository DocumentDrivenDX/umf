#!/usr/bin/env python3
"""Validate and stage the locally qualified 0.10.11 Core or Codegen archives."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tarfile
import zipfile
from email.parser import BytesParser
from pathlib import Path, PurePosixPath

import publish_core_pypi_release as core

REPOSITORY = "DocumentDrivenDX/umf"
TAG = "umf-v0.10.11"
VERSION = "0.10.11"
QUALIFICATION_PROFILE = "umf.local-release-qualification/1"
ADMISSION_PROFILE = "umf.local-pypi-admission/1"
ADMISSION_PATHS = {
    "umf-core": ".github/release-admissions/umf-core-0.10.11-local.json",
    "umf-codegen": ".github/release-admissions/umf-codegen-0.10.11-local.json",
}
PLATFORMS = ("macos-arm64", "linux-x86_64")
# The 0.10.11 PyPI admission binds the native Python pair directly. The SDK
# browser/site evidence has its own publication lane and is not reclassified here.
PROBES = ("python",)
RESOURCE_NAMES = {
    "actions.package.json", "binding.package.json", "core.constraints.json",
    "core.domain-policy.json", "core.package-schema.json", "core.reference-schema.json",
    "core.schema.json", "saga.package.json", "stable-binding.package.json", "tables.package.json",
}
PRODUCT_FILES = {
    "umf-v0.10.11-source.tar.gz",
    "umf-v0.10.11-aarch64-apple-darwin.tar.gz",
    "umf-v0.10.11-x86_64-unknown-linux-gnu.tar.gz",
    "umf-sdk-0.10.11-macos-aarch64.tgz",
    "umf-sdk-0.10.11-linux-x86_64.tgz",
    "umf_core-0.10.11-cp311-abi3-macosx_11_0_arm64.whl",
    "umf_core-0.10.11-cp311-abi3-manylinux_2_34_x86_64.whl",
    "umf_core-0.10.11.tar.gz",
    "umf_codegen-0.10.11-py3-none-any.whl",
    "umf_codegen-0.10.11.tar.gz",
}
CORE_FILES = {name for name in PRODUCT_FILES if name.startswith("umf_core-")}
CODEGEN_FILES = {name for name in PRODUCT_FILES if name.startswith("umf_codegen-")}
CONTROLLER_FILES = {
    ".github/workflows/publish-pypi.yml",
    ".github/workflows/publish-codegen-pypi.yml",
    "scripts/publish_core_pypi_release.py",
    "scripts/publish_local_pypi_01011.py",
}
PROTOCOLS = {
    "engine": "umf-core-r2",
    "native": "umf-codegen-r3-seven-ops-nine-resources/1",
    "cli": "umf.codegen-cli/1",
    "resources": "umf.codegen-resources/1",
}
MAX_CODEGEN_ARCHIVE = 1024 * 1024
MAX_CODEGEN_EXPANDED = 8 * 1024 * 1024


class LocalReleaseError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise LocalReleaseError(message)


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def hash_file(path: Path) -> tuple[str, int]:
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
            size += len(block)
    return h.hexdigest(), size


def closed(value, keys: set[str], label: str) -> None:
    require(type(value) is dict and set(value) == keys, "closed " + label + " required")


def safe_path(value: str) -> str:
    require(type(value) is str and "\\" not in value and "\x00" not in value,
            "unsafe tracked receipt path")
    path = PurePosixPath(value)
    require(not path.is_absolute() and path.as_posix() == value
            and all(part not in ("", ".", "..") for part in path.parts),
            "unsafe tracked receipt path")
    return value


def hash_map(value, expected_names: set[str], label: str) -> None:
    require(type(value) is dict and set(value) == expected_names, label + " inventory differs")
    require(all(type(name) is str and type(sha) is str and core.SHA.fullmatch(sha)
                for name, sha in value.items()), label + " has an invalid SHA-256")


def validate_probe(role: str, value: dict, qualification: dict) -> dict:
    closed(value, {"path", "sha256"}, role + " raw output reference")
    safe_path(value["path"])
    require(type(value["sha256"]) is str and core.SHA.fullmatch(value["sha256"]),
            role + " raw output digest is invalid")
    raw = subprocess.check_output(["git", "show", "HEAD:" + value["path"]])
    require(digest(raw) == value["sha256"], role + " raw output differs from its pinned bytes")
    require(len(raw) <= 1024 * 1024, role + " raw output exceeds the one MiB bound")
    try:
        result = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise LocalReleaseError(role + " raw output must be JSON") from exc
    require(type(result) is dict and result.get("status") == "passed",
            role + " did not pass")
    require(role == "python", "0.10.11 PyPI admission supports only the local Python pair receipt")
    if role == "python":
        require(result.get("profile") == "umf.local-python-pair-admission/1"
                and result.get("version") == VERSION and result.get("coreVersion") == VERSION
                and result.get("resourceCount") == len(RESOURCE_NAMES),
                "Python pair summary must bind Core 0.10.11 and all ten resources")
        hash_map(result.get("resources"), RESOURCE_NAMES, "Python resource")
        require(result["resources"] == qualification["resources"]["files"],
                "Python resource hashes differ from the qualified cohort")
        platforms = result.get("platforms")
        closed(platforms, set(PLATFORMS), "Python pair platform map")
        for platform, record in platforms.items():
            require(type(record) is dict and record.get("profile") == "umf.python-pair-qualification/1"
                    and record.get("status") == "passed" and record.get("version") == VERSION
                    and record.get("coreVersion") == VERSION and record.get("resourceCount") == 10
                    and record.get("resources") == qualification["resources"]["files"]
                    and record.get("source") == qualification["source"]
                    and record.get("resultSha256") == result.get("resultSha256")
                    and record.get("cliVersion") == VERSION,
                    "Python pair receipt differs from the qualified source or pair result: " + platform)
            wheel_artifacts = record.get("wheelArtifacts")
            core_wheel = "umf_core-0.10.11-cp311-abi3-macosx_11_0_arm64.whl" if platform == "macos-arm64" else "umf_core-0.10.11-cp311-abi3-manylinux_2_34_x86_64.whl"
            codegen_wheel = "umf_codegen-0.10.11-py3-none-any.whl"
            require(type(wheel_artifacts) is dict and set(wheel_artifacts) == {core_wheel, codegen_wheel}
                    and all(wheel_artifacts[n].get("sha256") == qualification["artifacts"][n]["sha256"]
                            and wheel_artifacts[n].get("bytes") == qualification["artifacts"][n]["size"]
                            for n in (core_wheel, codegen_wheel)),
                    "Python pair wheel bytes differ from the qualified release: " + platform)
            raw_ref = record.get("rawOutput")
            closed(raw_ref, {"path", "sha256"}, platform + " Python raw output reference")
            safe_path(raw_ref["path"])
            raw = subprocess.check_output(["git", "show", "HEAD:" + raw_ref["path"]])
            require(digest(raw) == raw_ref["sha256"] and json.loads(raw) == {k: v for k, v in record.items()
                    if k != "rawOutput"}, "Python pair raw receipt differs: " + platform)
        require(type(result.get("resultSha256")) is str and core.SHA.fullmatch(result["resultSha256"])
                and platforms["macos-arm64"].get("resultSha256") == platforms["linux-x86_64"].get("resultSha256"),
                "Python platforms must produce the exact same generation result")
    return result


def validate_qualification(value: dict, source: dict, assets_dir: Path | None = None) -> dict:
    closed(value, {"profile", "status", "version", "source", "artifacts", "platforms", "probes", "resources",
                   "nativeSourceJoin",
                   },
           "local qualification receipt")
    require(value["profile"] == QUALIFICATION_PROFILE and value["status"] == "passed"
            and value["version"] == VERSION and value["source"] == source,
            "local qualification receipt is not passed for the exact source and version")
    resources = value["resources"]
    closed(resources, {"manifest", "releaseAuthority", "files", "protocols"}, "Codegen resource identity")
    require(type(resources["manifest"]) is str and core.SHA.fullmatch(resources["manifest"])
            and type(resources["releaseAuthority"]) is str and core.SHA.fullmatch(resources["releaseAuthority"]),
            "resource manifest or authority digest is invalid")
    hash_map(resources["files"], RESOURCE_NAMES, "Codegen resource")
    require(resources["protocols"] == PROTOCOLS, "Codegen protocol identity differs")
    artifacts = value["artifacts"]
    closed(artifacts, PRODUCT_FILES, "qualified product artifact map")
    for name, identity in artifacts.items():
        closed(identity, {"sha256", "size"}, "artifact identity")
        require(type(identity["sha256"]) is str and core.SHA.fullmatch(identity["sha256"])
                and type(identity["size"]) is int and identity["size"] > 0,
                "artifact digest or size is invalid: " + name)
    join_ref = value["nativeSourceJoin"]
    closed(join_ref, {"path", "sha256"}, "native sdist source join reference")
    safe_path(join_ref["path"])
    require(type(join_ref["sha256"]) is str and core.SHA.fullmatch(join_ref["sha256"]),
            "native sdist source join digest is invalid")
    join_raw = subprocess.check_output(["git", "show", "HEAD:" + join_ref["path"]])
    require(digest(join_raw) == join_ref["sha256"], "native sdist source join receipt differs")
    join = json.loads(join_raw)
    closed(join, {"profile", "nativePackagingSource", "releaseSource", "buildInput", "sameGitTree",
                  "commonSdist", "sdistSha256", "changedGitPaths", "changedGitPath",
                  "changedPathAbsentFromSdist", "changedPathAbsentFromMetamodelInputs"},
           "native sdist source join receipt")
    native_source = join["nativePackagingSource"]
    release_source = join["releaseSource"]
    closed(native_source, {"commit", "tree"}, "native packaging source identity")
    closed(release_source, {"commit", "tree"}, "final release source identity")
    build_input = join["buildInput"]
    closed(build_input, {"commit", "tree", "treeMatchesMergedIdentity"}, "frozen build input")
    common_sdist = join["commonSdist"]
    closed(common_sdist, {"filename", "sha256", "bytes", "builtFromGitTree", "extractedSourceFileCount"},
           "common source distribution")
    require(join["profile"] == "umf.native-sdist-source-join/1"
            and release_source == source and native_source == source and join["sameGitTree"] is True
            and build_input["tree"] == source["tree"] and build_input["treeMatchesMergedIdentity"] is True
            and common_sdist["builtFromGitTree"] == source["tree"]
            and common_sdist["filename"] == "umf_core-0.10.11.tar.gz"
            and common_sdist["sha256"] == join["sdistSha256"]
            and common_sdist["bytes"] == value["artifacts"][common_sdist["filename"]]["size"]
            and join["changedGitPaths"] == [] and join["changedGitPath"] is None
            and join["changedPathAbsentFromSdist"] is False
            and join["changedPathAbsentFromMetamodelInputs"] is False
            and core.COMMIT.fullmatch(native_source["commit"])
            and core.COMMIT.fullmatch(native_source["tree"]), "native source join identities differ")
    native_tree = subprocess.check_output(["git", "rev-parse", native_source["commit"] + "^{tree}"],
                                          text=True).strip()
    release_tree = subprocess.check_output(["git", "rev-parse", source["commit"] + "^{tree}"],
                                           text=True).strip()
    require(native_tree == native_source["tree"] and release_tree == source["tree"],
            "native source join Git trees differ")
    core_sdist = "umf_core-0.10.11.tar.gz"
    require(join["sdistSha256"] == artifacts[core_sdist]["sha256"],
            "native source join does not bind the qualified common Core sdist bytes")
    sdist_path = assets_dir / core_sdist if assets_dir is not None else None
    if sdist_path is not None and sdist_path.is_file():
        require(hash_file(sdist_path)[0] == join["sdistSha256"],
                "local common Core sdist differs from source join receipt")
        require(hash_file(sdist_path)[1] == common_sdist["bytes"], "common Core sdist size differs")
    platforms = value["platforms"]
    closed(platforms, set(PLATFORMS), "native platform map")
    for platform in PLATFORMS:
        record = platforms[platform]
        closed(record, {"toolchain", "sourceSnapshot"}, platform + " build provenance")
        require(type(record["toolchain"]) is dict and record["toolchain"], platform + " toolchain identity required")
        snap = record["sourceSnapshot"]
        closed(snap, {"commit", "tree", "beforeSha256", "afterSha256"}, platform + " source snapshot")
        require(type(snap["beforeSha256"]) is str and core.SHA.fullmatch(snap["beforeSha256"])
                and snap["beforeSha256"] == snap["afterSha256"], platform + " source snapshot changed during build")
        expected_source = source
        require(snap["commit"] == expected_source["commit"] and snap["tree"] == expected_source["tree"],
                platform + " build source differs from its attested native packaging source")
    probes = value["probes"]
    closed(probes, set(PROBES), "local installed probe map")
    outputs = {role: validate_probe(role, ref, value) for role, ref in probes.items()}
    return {"artifacts": artifacts, "resources": resources, "probes": outputs}


def validate_dispatch_pins(tag: str, source_sha: str, sums_sha: str, admission_sha: str,
                           admission: dict, expected_admission_sha: str) -> None:
    require(tag == TAG and source_sha == admission.get("source", {}).get("commit"),
            "dispatch tag/source do not match the local admission")
    require(sums_sha == admission.get("sums_sha256"), "dispatch sums pin differs from the local admission")
    require(admission_sha == expected_admission_sha and core.SHA.fullmatch(expected_admission_sha),
            "dispatch admission digest differs or is malformed")


def validate_controller_snapshot(controller: dict, head_sha: str, q_tree: str,
                                 is_ancestor: bool, q_files: dict[str, bytes],
                                 head_files: dict[str, bytes], worktree_files: dict[str, bytes]) -> None:
    closed(controller, {"commit", "tree", "files"}, "publisher controller identity")
    q_sha = controller["commit"]
    require(core.COMMIT.fullmatch(q_sha) is not None and q_sha != head_sha,
            "reviewed controller Q must be a distinct valid commit")
    require(is_ancestor, "reviewed controller Q must be an ancestor of the admission commit")
    require(core.COMMIT.fullmatch(controller["tree"]) is not None and q_tree == controller["tree"],
            "controller Q tree differs from local admission")
    hash_map(controller["files"], CONTROLLER_FILES, "publisher controller source")
    require(set(q_files) == CONTROLLER_FILES and set(head_files) == CONTROLLER_FILES
            and set(worktree_files) == CONTROLLER_FILES, "controller source file inventory differs")
    for path, expected in controller["files"].items():
        require(digest(q_files[path]) == expected and digest(head_files[path]) == expected
                and digest(worktree_files[path]) == expected,
                "publisher controller Q source file differs: " + path)


def validate_release_pins(pins: dict, admission: dict, source_sha: str) -> None:
    core_files = admission["files"] if admission["distribution"] == "umf-core" else admission["core"]["files"]
    require(type(pins) is dict and pins.get("tag") == TAG and pins.get("commit") == source_sha
            and pins.get("distribution") == "umf-core" and pins.get("version") == VERSION
            and pins.get("sdk") == VERSION and pins.get("umf_core") == VERSION
            and pins.get("sourceTree") == admission["source"]["tree"]
            and pins.get("files") == core_files, "release-pins does not bind exact source/Core cohort")
    if "umf_codegen" in pins:
        require(pins["umf_codegen"] == VERSION, "release-pins Codegen version differs")
    if admission["distribution"] == "umf-codegen":
        require(pins.get("umf_codegen") == VERSION and pins.get("codegenFiles") == admission["files"],
                "release-pins Codegen version or exact Codegen inventory differs")
        require(core.check_pypi("umf-core", VERSION, admission["core"]["files"]) == "matching",
                "exact public Core archive bytes are required before Codegen publication")


def validate_admission(value: dict, distribution: str, source_sha: str, controller_sha: str,
                       expected_sha: str, qualification: dict) -> dict:
    closed(value, {"schema", "status", "repository", "distribution", "tag", "version", "source",
                   "controller", "files", "core", "corePublic", "resources", "qualification", "release_pins_sha256",
                   "sums_sha256", "publisher"}, "local publisher admission")
    require(value["schema"] == ADMISSION_PROFILE and value["status"] == "qualified"
            and value["repository"] == REPOSITORY and value["distribution"] == distribution
            and value["tag"] == TAG and value["version"] == VERSION,
            "local publisher admission is not qualified for this distribution and release")
    source = value["source"]
    closed(source, {"commit", "tree"}, "frozen source identity")
    require(source["commit"] == source_sha and core.COMMIT.fullmatch(source_sha)
            and core.COMMIT.fullmatch(source["tree"]), "local admission source S differs")
    controller = value["controller"]
    require(core.COMMIT.fullmatch(controller_sha) is not None, "admission commit P is invalid")
    q_sha = controller.get("commit", "")
    require(core.COMMIT.fullmatch(q_sha) is not None, "reviewed controller Q is invalid")
    is_ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", q_sha, controller_sha]).returncode == 0
    q_tree = subprocess.check_output(["git", "rev-parse", q_sha + "^{tree}"], text=True).strip()
    q_files = {path: subprocess.check_output(["git", "show", q_sha + ":" + path])
               for path in CONTROLLER_FILES}
    head_files = {path: subprocess.check_output(["git", "show", controller_sha + ":" + path])
                  for path in CONTROLLER_FILES}
    worktree_files = {path: Path(path).read_bytes() for path in CONTROLLER_FILES}
    validate_controller_snapshot(controller, controller_sha, q_tree, is_ancestor,
                                 q_files, head_files, worktree_files)
    actual_admission = subprocess.check_output(["git", "show", "HEAD:" + ADMISSION_PATHS[distribution]])
    require(digest(actual_admission) == expected_sha, "tracked local admission digest differs")
    tree = subprocess.check_output(["git", "rev-parse", source_sha + "^{tree}"], text=True).strip()
    require(tree == source["tree"], "source S tree differs from local admission")
    files = CORE_FILES if distribution == "umf-core" else CODEGEN_FILES
    hash_map(value["files"], files, distribution + " archive")
    if distribution == "umf-core":
        require(value["core"] is None, "Core admission cannot depend on its own publication")
        require(value["corePublic"] is None, "Core admission cannot depend on its own publication")
    else:
        closed(value["core"], {"version", "files"}, "paired Core files")
        require(value["core"]["version"] == VERSION, "paired Core version differs")
        hash_map(value["core"]["files"], CORE_FILES, "paired Core archive")
        require(value["corePublic"] is None,
                "Codegen admission uses live exact PyPI Core bytes, not a publication receipt")
    require(value["resources"] == qualification["resources"], "local resources differ from receipt")
    qref = value["qualification"]
    closed(qref, {"path", "sha256"}, "qualification receipt reference")
    safe_path(qref["path"])
    require(type(qref["sha256"]) is str and core.SHA.fullmatch(qref["sha256"]),
            "qualification receipt hash is invalid")
    require(type(value["release_pins_sha256"]) is str and core.SHA.fullmatch(value["release_pins_sha256"])
            and type(value["sums_sha256"]) is str and core.SHA.fullmatch(value["sums_sha256"]),
            "release metadata digest pin is invalid")
    expected_publisher = {"repository": REPOSITORY, "distribution": distribution,
                          "workflow": ".github/workflows/publish-pypi.yml" if distribution == "umf-core"
                          else ".github/workflows/publish-codegen-pypi.yml", "environment": "pypi"}
    require(value["publisher"] == expected_publisher, "publisher must use its existing PyPI workflow identity")
    return value


def validate_release_assets(assets: Path, release: dict, tag_ref: dict, tag_object: dict | None,
                            source_sha: str, admission: dict, qualification: dict) -> dict:
    require(release.get("tag_name") == TAG and release.get("draft") is False
            and release.get("prerelease") is False and release.get("immutable") is True,
            "immutable published release is required")
    require(core.resolve_tag_commit(tag_ref, tag_object, TAG) == source_sha,
            "release tag does not resolve to frozen source S")
    sums_path, pins_path = assets / "SHA256SUMS", assets / "release-pins.json"
    require(sums_path.is_file() and not sums_path.is_symlink() and pins_path.is_file() and not pins_path.is_symlink(),
            "release sums or pins asset is missing")
    sums_raw = sums_path.read_bytes()
    require(digest(sums_raw) == admission["sums_sha256"], "SHA256SUMS digest differs from admission")
    sums = core.parse_sums(sums_raw)
    pins_raw = pins_path.read_bytes()
    require(digest(pins_raw) == admission["release_pins_sha256"], "release pins digest differs from admission")
    pins = json.loads(pins_raw)
    validate_release_pins(pins, admission, source_sha)
    expected_names = PRODUCT_FILES | {"release-pins.json"}
    require(set(sums) == expected_names, "SHA256SUMS is not the exact ten-product-plus-pins roster")
    rows = release.get("assets")
    require(type(rows) is list and len(rows) == 12, "GitHub release is not the exact twelve-asset cohort")
    github = {row.get("name"): row for row in rows if type(row) is dict}
    require(len(github) == len(rows) and set(github) == expected_names | {"SHA256SUMS"},
            "GitHub release asset roster differs from the complete release cohort")
    qualification_artifacts = qualification["artifacts"]
    selected = CORE_FILES if admission["distribution"] == "umf-core" else CODEGEN_FILES
    for name in PRODUCT_FILES:
        path = assets / name
        expected = qualification_artifacts[name]
        row = github[name]
        require(row.get("digest") == "sha256:" + expected["sha256"]
                and row.get("size") == expected["size"],
                "GitHub asset identity differs from original local qualification bytes: " + name)
        require(sums.get(name) == expected["sha256"], "SHA256SUMS digest differs: " + name)
        if name in selected:
            require(path.is_file() and not path.is_symlink(), "selected release asset is missing or unsafe: " + name)
            actual_hash, actual_size = hash_file(path)
            require(actual_hash == expected["sha256"] and actual_size == expected["size"] == path.stat().st_size,
                    "asset differs from original local qualification bytes: " + name)
    for name, row in github.items():
        if name == "SHA256SUMS": expected_digest, expected_size = digest(sums_raw), len(sums_raw)
        elif name == "release-pins.json": expected_digest, expected_size = digest(pins_raw), len(pins_raw)
        else:
            identity = qualification_artifacts[name]
            expected_digest, expected_size = identity["sha256"], identity["size"]
        require(row.get("digest") == "sha256:" + expected_digest and row.get("size") == expected_size,
                "GitHub asset digest or size differs: " + name)
    for name in selected:
        if name in CORE_FILES:
            core.validate_archive(assets / name, "umf-core", VERSION)
        else:
            validate_codegen_archive(assets / name, admission)
    return {"sums_sha256": digest(sums_raw), "release_pins_sha256": digest(pins_raw), "files": sums}


def validate_codegen_archive(path: Path, admission: dict) -> None:
    require(path.stat().st_size <= MAX_CODEGEN_ARCHIVE, "Codegen archive exceeds the one MiB bound")
    wheel = path.name.endswith(".whl")
    core.validate_archive(path, "umf-codegen", VERSION)
    if wheel:
        with zipfile.ZipFile(path) as archive:
            metadata_names = [item for item in archive.infolist() if item.filename.endswith(".dist-info/METADATA")]
            require(len(metadata_names) == 1 and metadata_names[0].file_size <= 1024 * 1024,
                    "Codegen wheel METADATA inventory or size differs")
            message = BytesParser().parsebytes(archive.read(metadata_names[0]))
            require(message.get_all("Requires-Dist", []) == ["umf-core==" + VERSION],
                    "Codegen wheel must require exactly umf-core==0.10.11")
            resource_infos = [item for item in archive.infolist() if item.filename.startswith("umf_codegen/_resources/")]
            require(sum(item.file_size for item in resource_infos) <= MAX_CODEGEN_EXPANDED,
                    "Codegen wheel resources exceed the eight MiB bound")
            members = {item.filename[len("umf_codegen/_resources/"):]: archive.read(item)
                       for item in resource_infos}
    else:
        with tarfile.open(path, "r:gz") as archive:
            infos = [m for m in archive.getmembers() if m.isfile() and "/PKG-INFO" in m.name]
            require(len(infos) == 1 and infos[0].size <= 1024 * 1024,
                    "Codegen sdist PKG-INFO inventory or size differs")
            stream = archive.extractfile(infos[0]); require(stream is not None, "Codegen sdist PKG-INFO unreadable")
            message = BytesParser().parsebytes(stream.read())
            require(message.get_all("Requires-Dist", []) == ["umf-core==" + VERSION],
                    "Codegen sdist must require exactly umf-core==0.10.11")
            members = {}
            resource_members = [member for member in archive.getmembers()
                                if member.isfile() and "/umf_codegen/_resources/" in member.name]
            require(sum(member.size for member in resource_members) <= MAX_CODEGEN_EXPANDED,
                    "Codegen sdist resources exceed the eight MiB bound")
            for member in resource_members:
                handle = archive.extractfile(member)
                require(handle is not None, "Codegen resource unreadable")
                members[member.name.split("/umf_codegen/_resources/", 1)[1]] = handle.read()
    require(set(members) == RESOURCE_NAMES | {"manifest.json"}, "Codegen archive resource roster differs")
    resource_files = {name: raw for name, raw in members.items() if name in RESOURCE_NAMES}
    require(set(resource_files) == RESOURCE_NAMES, "Codegen archive resource roster differs")
    for name, expected in admission["resources"]["files"].items():
        require(digest(resource_files[name]) == expected, "Codegen resource hash differs: " + name)
    require(digest(members["manifest.json"]) == admission["resources"]["manifest"],
            "Codegen manifest digest differs")


def prepare(args) -> dict:
    root = Path(__file__).resolve().parents[1]
    admission_raw = subprocess.check_output(["git", "show", "HEAD:" + ADMISSION_PATHS[args.distribution]], cwd=root)
    require(digest(admission_raw) == args.expected_admission_sha256, "tracked local admission digest differs")
    admission = json.loads(admission_raw)
    source = admission.get("source", {})
    controller = admission.get("controller", {})
    qualification_ref = admission.get("qualification", {})
    qraw = subprocess.check_output(["git", "show", "HEAD:" + safe_path(qualification_ref.get("path", ""))], cwd=root)
    require(digest(qraw) == qualification_ref.get("sha256"), "qualification receipt digest differs")
    qualification = json.loads(qraw)
    qresult = validate_qualification(qualification, source, args.assets_dir)
    controller_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    admission = validate_admission(admission, args.distribution, args.source_sha, controller_sha,
                                   args.expected_admission_sha256, qresult)
    validate_dispatch_pins(args.tag, args.source_sha, args.expected_sums_sha256,
                           args.expected_admission_sha256, admission, args.expected_admission_sha256)
    tree = subprocess.check_output(["git", "rev-parse", args.source_sha + "^{tree}"], cwd=root, text=True).strip()
    require(tree == source["tree"], "source S tree differs")
    result = validate_release_assets(args.assets_dir, json.loads(args.release_json.read_bytes()),
        json.loads(args.tag_ref_json.read_bytes()), json.loads(args.tag_object_json.read_bytes()) if args.tag_object_json else None,
        args.source_sha, admission, qresult)
    files = admission["files"]
    selected = files
    require(not args.output_dir.exists(), "verified output directory must be new")
    args.output_dir.mkdir(parents=True)
    for name, expected in selected.items():
        raw = (args.assets_dir / name).read_bytes()
        require(digest(raw) == expected, "selected package archive differs: " + name)
        (args.output_dir / name).write_bytes(raw)
    receipt = {
        "schema": "pypi-release-source.v1", "status": "verified", "repository": REPOSITORY,
        "tag": TAG, "source_sha": args.source_sha, "distribution": args.distribution,
        "version": VERSION, "sums_sha256": result["sums_sha256"],
        "release_pins_sha256": result["release_pins_sha256"], "files": selected,
        "localAdmissionSha256": args.expected_admission_sha256,
        "qualificationSha256": qualification_ref["sha256"],
    }
    (args.output_dir / "source-receipt.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    return receipt


def verify_prepared(args) -> str:
    root = Path(__file__).resolve().parents[1]
    raw = subprocess.check_output(["git", "show", "HEAD:" + ADMISSION_PATHS[args.distribution]], cwd=root)
    require(digest(raw) == args.expected_admission_sha256, "tracked local admission digest differs")
    admission = json.loads(raw)
    source = admission.get("source", {})
    qref = admission.get("qualification", {})
    qraw = subprocess.check_output(["git", "show", "HEAD:" + safe_path(qref.get("path", ""))], cwd=root)
    require(digest(qraw) == qref.get("sha256"), "qualification receipt digest differs")
    qresult = validate_qualification(json.loads(qraw), source)
    controller_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    admission = validate_admission(admission, args.distribution, args.source_sha, controller_sha,
                                   args.expected_admission_sha256, qresult)
    source_tree = subprocess.check_output(["git", "rev-parse", args.source_sha + "^{tree}"], cwd=root, text=True).strip()
    require(source_tree == source.get("tree"), "source S tree differs from local admission")
    validate_dispatch_pins(args.tag, args.source_sha, args.expected_sums_sha256,
                           args.expected_admission_sha256, admission, args.expected_admission_sha256)
    require(admission.get("source", {}).get("commit") == args.source_sha and admission.get("tag") == TAG
            and admission.get("version") == VERSION and args.tag == TAG
            and args.expected_sums_sha256 == admission.get("sums_sha256"),
            "prepared dispatch identities differ from the tracked admission")
    receipt_path = args.assets_dir / "source-receipt.json"
    require(receipt_path.is_file() and not receipt_path.is_symlink(), "verified source receipt is missing")
    receipt = json.loads(receipt_path.read_bytes())
    expected_files = admission["files"]
    require(type(receipt) is dict and receipt.get("schema") == "pypi-release-source.v1"
            and receipt.get("status") == "verified" and receipt.get("repository") == REPOSITORY
            and receipt.get("tag") == TAG and receipt.get("source_sha") == args.source_sha
            and receipt.get("distribution") == args.distribution and receipt.get("version") == VERSION
            and receipt.get("sums_sha256") == args.expected_sums_sha256
            and receipt.get("release_pins_sha256") == admission["release_pins_sha256"]
            and receipt.get("localAdmissionSha256") == args.expected_admission_sha256
            and receipt.get("qualificationSha256") == admission["qualification"]["sha256"]
            and receipt.get("files") == expected_files, "prepared receipt differs from the tracked admission")
    prefix = "umf_core-" if args.distribution == "umf-core" else "umf_codegen-"
    actual = {p.name for p in args.assets_dir.iterdir() if p.name.startswith(prefix)
              and (p.suffix == ".whl" or p.name.endswith(".tar.gz"))}
    require(actual == set(expected_files), "prepared archive file inventory differs")
    for name, sha in expected_files.items():
        path = args.assets_dir / name
        require(path.is_file() and not path.is_symlink() and hash_file(path)[0] == sha,
                "prepared archive bytes differ: " + name)
        if args.distribution == "umf-core":
            core.validate_archive(path, "umf-core", VERSION)
        else:
            validate_codegen_archive(path, admission)
    if args.distribution == "umf-codegen":
        require(core.check_pypi("umf-core", VERSION, admission["core"]["files"]) == "matching",
                "exact public Core archive bytes are required before Codegen publication")
    return (core.wait_for_pypi(args.distribution, VERSION, expected_files)
            if args.wait else core.check_pypi(args.distribution, VERSION, expected_files))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("prepare", "check-pypi", "roster"))
    parser.add_argument("--distribution", choices=("umf-core", "umf-codegen"), required=True)
    parser.add_argument("--assets-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--expected-sums-sha256", required=True)
    parser.add_argument("--expected-admission-sha256", required=True)
    parser.add_argument("--release-json", type=Path)
    parser.add_argument("--tag-ref-json", type=Path)
    parser.add_argument("--tag-object-json", type=Path)
    parser.add_argument("--wait", action="store_true")
    args = parser.parse_args()
    require(args.tag == TAG, "local route accepts only umf-v0.10.11")
    require(core.SHA.fullmatch(args.expected_admission_sha256) is not None
            and core.SHA.fullmatch(args.expected_sums_sha256) is not None, "dispatch digests must be SHA-256")
    if args.command == "roster":
        root = Path(__file__).resolve().parents[1]
        raw = subprocess.check_output(["git", "show", "HEAD:" + ADMISSION_PATHS[args.distribution]], cwd=root)
        require(digest(raw) == args.expected_admission_sha256, "tracked local admission digest differs")
        admission = json.loads(raw)
        validate_dispatch_pins(args.tag, args.source_sha, args.expected_sums_sha256,
                               args.expected_admission_sha256, admission, args.expected_admission_sha256)
        selected = CORE_FILES if args.distribution == "umf-core" else CODEGEN_FILES
        print("\n".join(sorted(selected | {"SHA256SUMS", "release-pins.json"})))
        return 0
    if args.command == "check-pypi":
        state = verify_prepared(args)
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
                output.write("status=" + state + "\n")
        print(json.dumps({"status": state, "distribution": args.distribution, "version": VERSION}, sort_keys=True))
        return 0
    require(args.output_dir is not None and args.release_json is not None and args.tag_ref_json is not None,
            "prepare requires release, tag reference, and new output paths")
    receipt = prepare(args)
    print(json.dumps({"status": "verified", "distribution": args.distribution,
                      "version": VERSION, "files": receipt["files"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (LocalReleaseError, core.ReleaseError, OSError, KeyError, TypeError,
            ValueError, subprocess.CalledProcessError, zipfile.BadZipFile, tarfile.TarError) as exc:
        print("local 0.10.11 publication refused: " + str(exc), file=sys.stderr)
        raise SystemExit(1) from exc

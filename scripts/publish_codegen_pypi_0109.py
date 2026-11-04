#!/usr/bin/env python3
"""Verify and publish only the locally qualified UMF Codegen 0.10.9 archives."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import tarfile
import zipfile
from email.parser import BytesParser
from pathlib import Path
from pathlib import PurePosixPath

import publish_core_pypi_release as core
from publish_access_pypi_release import AccessReleaseError, decode, require, safe_name

REPOSITORY = "DocumentDrivenDX/umf"
TAG = "umf-v0.10.9"
VERSION = "0.10.9"
DISTRIBUTION = "umf-codegen"
WORKFLOW = ".github/workflows/publish-codegen-pypi.yml"
ADMISSION_PATH = ".github/release-admissions/umf-codegen-0.10.9.json"
ADMISSION_SCHEMA = "umf.codegen-local-publication-admission/1"
PROTOCOLS = {"engine": "umf-core-r2", "native": "umf-codegen-r3-seven-ops-nine-resources/1",
             "cli": "umf.codegen-cli/1", "resources": "umf.codegen-resources/1"}
RESOURCE_NAMES = {"actions.package.json", "binding.package.json", "core.constraints.json",
    "core.domain-policy.json", "core.package-schema.json", "core.reference-schema.json", "core.schema.json",
    "saga.package.json", "stable-binding.package.json", "tables.package.json"}
MAX_CODEGEN_ARCHIVE = 1024 * 1024
MAX_EXPANDED = 8 * 1024 * 1024
MAX_CORE_ARCHIVE = 64 * 1024 * 1024


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def read_asset(directory: Path, name: str, expected: str, limit: int = MAX_CORE_ARCHIVE) -> bytes:
    safe_name(name)
    require(type(expected) is str and core.SHA.fullmatch(expected), "invalid asset digest")
    path = directory / name
    require(path.is_file() and not path.is_symlink() and path.stat().st_size <= limit,
            "missing, oversized, or unsafe asset: " + name)
    raw = path.read_bytes()
    require(digest(raw) == expected, "asset bytes differ: " + name)
    return raw


def require_hash_map(value, *, names=None):
    require(type(value) is dict and value, "nonempty closed SHA-256 map required")
    if names is not None:
        require(set(value) == set(names), "hash map inventory differs")
    require(all(type(k) is str and type(v) is str and core.SHA.fullmatch(v) for k, v in value.items()),
            "invalid SHA-256 map entry")


def tracked_path(path: str) -> str:
    require(type(path) is str and "\\" not in path and "\x00" not in path,
            "invalid tracked receipt path")
    parsed = PurePosixPath(path)
    require(not parsed.is_absolute() and parsed.as_posix() == path
        and all(part not in ("", ".", "..") for part in parsed.parts),
        "unsafe tracked receipt path")
    return path


def tracked_json(ref: dict) -> dict:
    raw = subprocess.check_output(["git", "show", "HEAD:" + tracked_path(ref["path"])])
    require(digest(raw) == ref["sha256"], "tracked local qualification receipt digest differs")
    return decode(raw)


def admission_identity(raw: bytes, expected_hash: str) -> dict:
    require(digest(raw) == expected_hash, "tracked admission digest differs")
    value = decode(raw)
    required = {"schema", "repository", "distribution", "tag", "version", "source_sha", "source_tree",
        "files", "core", "resources", "local_qualification", "release_pins_sha256", "sums_sha256", "publisher"}
    require(type(value) is dict and set(value) == required,
            "closed local Codegen admission required")
    require(value["schema"] == ADMISSION_SCHEMA and value["repository"] == REPOSITORY
        and value["distribution"] == DISTRIBUTION and value["tag"] == TAG and value["version"] == VERSION
        and type(value["source_sha"]) is str and core.COMMIT.fullmatch(value["source_sha"])
        and type(value["source_tree"]) is str and core.COMMIT.fullmatch(value["source_tree"]),
        "admission must identify only the frozen 0.10.9 source cohort")
    codegen_names = {f"umf_codegen-{VERSION}-py3-none-any.whl", f"umf_codegen-{VERSION}.tar.gz"}
    require_hash_map(value["files"], names=codegen_names)
    require(type(value["core"]) is dict and set(value["core"]) == {"version", "files"}
        and value["core"]["version"] == VERSION, "exact paired Core admission required")
    core_names = {f"umf_core-{VERSION}-cp311-abi3-macosx_11_0_arm64.whl",
        f"umf_core-{VERSION}-cp311-abi3-manylinux_2_34_x86_64.whl", f"umf_core-{VERSION}.tar.gz"}
    require_hash_map(value["core"]["files"], names=core_names)
    resources = value["resources"]
    require(type(resources) is dict and set(resources) == {"manifest", "releaseAuthority", "files", "protocols"},
            "closed resource identity required")
    require_hash_map({"manifest": resources["manifest"], "releaseAuthority": resources["releaseAuthority"]})
    require_hash_map(resources["files"], names=RESOURCE_NAMES)
    require(resources["protocols"] == PROTOCOLS, "protocol identifiers differ from frozen Codegen")
    for key in ("release_pins_sha256", "sums_sha256"):
        require(type(value[key]) is str and core.SHA.fullmatch(value[key]), "release digest pin is invalid: " + key)
    publisher = value["publisher"]
    require(type(publisher) is dict and set(publisher) == {"repository", "distribution", "workflow", "environment"}
        and publisher == {"repository": REPOSITORY, "distribution": DISTRIBUTION, "workflow": WORKFLOW, "environment": "pypi"},
        "publisher identity must use the existing PyPI OIDC workflow/environment")
    local = value["local_qualification"]
    require(type(local) is dict and set(local) == {"freeze", "sourceInventory", "wheelSdistParity", "installedPairResources"},
            "four local qualification receipts required")
    for ref in local.values():
        require(type(ref) is dict and set(ref) == {"path", "sha256"}, "local receipt reference must be {path, sha256}")
        tracked_path(ref["path"])
        require(type(ref["sha256"]) is str and core.SHA.fullmatch(ref["sha256"]), "local receipt hash is invalid")
    return value


def admission_from_git(expected_hash: str) -> tuple[bytes, dict]:
    raw = subprocess.check_output(["git", "show", "HEAD:" + ADMISSION_PATH])
    return raw, admission_identity(raw, expected_hash)


def package_metadata(raw: bytes) -> None:
    message = BytesParser().parsebytes(raw)
    require(all(len(message.get_all(field, [])) == 1 for field in ("Name", "Version", "Requires-Python")),
            "ambiguous Codegen package metadata")
    require(message.get("Name") == DISTRIBUTION and message.get("Version") == VERSION,
            "Codegen archive metadata name/version differs")
    require(message.get_all("Requires-Dist") == ["umf-core==" + VERSION],
            "Codegen archive must require exactly the paired Core version")
    require(set(re.sub(r"\s", "", message.get("Requires-Python", "")).split(",")) == {">=3.11", "<3.15"},
            "Python version range differs")


def inspect_archive(path: Path, *, wheel: bool) -> dict[str, bytes]:
    require(path.is_file() and not path.is_symlink() and path.stat().st_size <= MAX_CODEGEN_ARCHIVE,
            "archive missing, oversized, or unsafe")
    members = {}
    if wheel:
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            require(len(infos) <= 1000 and sum(i.file_size for i in infos) <= MAX_EXPANDED,
                    "wheel bounds exceeded")
            for info in infos:
                name = info.filename
                if info.is_dir():
                    continue
                require(not name.startswith("/") and "\\" not in name and ":" not in name
                    and all(part not in ("", ".", "..") for part in name.split("/")),
                        "unsafe wheel member")
                require(stat.S_IFMT(info.external_attr >> 16) in (0, stat.S_IFREG), "wheel links/nonfiles refused")
                require(name not in members, "duplicate wheel member")
                members[name] = archive.read(name)
    else:
        with tarfile.open(path, "r:gz") as archive:
            infos = archive.getmembers()
            require(len(infos) <= 1000 and sum(i.size for i in infos) <= MAX_EXPANDED,
                    "sdist bounds exceeded")
            for info in infos:
                if info.isdir():
                    continue
                require(info.isfile() and not info.issym() and not info.islnk(), "sdist links/nonfiles refused")
                name = info.name
                require(not name.startswith("/") and "\\" not in name and ":" not in name
                    and all(part not in ("", ".", "..") for part in name.split("/")),
                        "unsafe sdist member")
                require(name not in members, "duplicate sdist member")
                stream = archive.extractfile(info)
                require(stream is not None, "sdist member missing")
                members[name] = stream.read()
    require(not any(name.lower().endswith((".so", ".pyd", ".dll", ".dylib")) for name in members),
            "Codegen archives must remain pure Python")
    return members


def inspect_codegen(path: Path, *, wheel: bool, admission: dict) -> None:
    members = inspect_archive(path, wheel=wheel)
    root = "umf_codegen-" + VERSION
    prefix = "" if wheel else root + "/src/"
    package = prefix + "umf_codegen/"
    meta_name = root + (".dist-info/METADATA" if wheel else "/PKG-INFO")
    require(meta_name in members, "unique Codegen package metadata missing")
    require(sum(1 for name in members if name.endswith(".dist-info/METADATA" if wheel else "/PKG-INFO")) == 1,
            "ambiguous Codegen metadata")
    package_metadata(members[meta_name])
    release = members.get(package + "_release.py")
    manifest_raw = members.get(package + "_resources/manifest.json")
    require(release is not None and digest(release) == admission["resources"]["releaseAuthority"],
            "Codegen release authority bytes differ")
    require(manifest_raw is not None and digest(manifest_raw) == admission["resources"]["manifest"],
            "Codegen resource manifest bytes differ")
    manifest = decode(manifest_raw)
    require(type(manifest) is dict and set(manifest) == {"profile", "files"}
        and manifest["profile"] == PROTOCOLS["resources"], "resource manifest profile differs")
    require_hash_map(manifest["files"], names=RESOURCE_NAMES)
    require(manifest["files"] == admission["resources"]["files"], "resource hashes differ from admission")
    expected_resource_members = {package + "_resources/manifest.json", *(package + "_resources/" + name for name in RESOURCE_NAMES)}
    actual_resource_members = {name for name in members if name.startswith(package + "_resources/")}
    require(actual_resource_members == expected_resource_members, "packaged resource member inventory differs")
    for name, expected in manifest["files"].items():
        raw = members.get(package + "_resources/" + name)
        require(raw is not None and digest(raw) == expected, "packaged resource bytes differ: " + name)
    release_text = release.decode("utf-8")
    for identifier in (VERSION, PROTOCOLS["engine"], PROTOCOLS["native"], PROTOCOLS["cli"], PROTOCOLS["resources"]):
        require(identifier in release_text, "release protocol/version identity missing: " + identifier)
    if wheel:
        wheel_info = BytesParser().parsebytes(members[root + ".dist-info/WHEEL"])
        require(wheel_info.get_all("Root-Is-Purelib") == ["true"]
            and wheel_info.get_all("Tag") == ["py3-none-any"], "Codegen wheel is not pure py3-none-any")


def validate_installed_pair_receipt(receipt: dict, admission: dict) -> None:
    smoke = receipt.get("installedPairSmoke")
    result = smoke.get("result") if type(smoke) is dict else None
    require(type(result) is dict and result.get("status") == "passed" and result.get("version") == VERSION
        and result.get("codegenResources") == 10 and smoke.get("runtimeCoreAndCodegenSameResults") is True
        and smoke.get("keyedAndUnkeyedCases") == 2 and smoke.get("resourceCount") == 10,
        "installed Codegen/Core pair and resources receipt does not pass the exact smoke")
    core_wheel = next((n for n in admission["core"]["files"] if n.endswith("macosx_11_0_arm64.whl")), None)
    core_sdist = f"umf_core-{VERSION}.tar.gz"
    core_receipt = receipt.get("core", {})
    require(core_wheel is not None
        and core_receipt.get("wheelBuiltOnceFromExtractedSdist", {}).get("sha256") == admission["core"]["files"][core_wheel]
        and core_receipt.get("sdist", {}).get("sha256") == admission["core"]["files"].get(core_sdist),
        "installed pair receipt does not bind admitted Core Mac wheel and sdist")


def validate_mac_codegen_receipt(receipt: dict, role: str, freeze: dict, admission: dict) -> None:
    require(type(receipt) is dict and receipt.get("profile") == "umf.macos-python-release-build/1"
        and receipt.get("status") == "passed" and receipt.get("version") == VERSION
        and receipt.get("sourceRoot") == freeze["sourceRoot"],
        "local macOS qualification receipt differs: " + role)
    codegen = receipt.get("codegen")
    wheel_name = f"umf_codegen-{VERSION}-py3-none-any.whl"
    sdist_name = f"umf_codegen-{VERSION}.tar.gz"
    require(type(codegen) is dict and codegen.get("wheel", {}).get("sha256") == admission["files"][wheel_name]
        and codegen.get("sdist", {}).get("sha256") == admission["files"][sdist_name],
        "local Mac receipt does not bind both admitted Codegen archive bytes: " + role)


def local_proof_checks(admission: dict) -> dict:
    refs = admission["local_qualification"]
    proof = {}
    for role, ref in refs.items():
        proof[role] = tracked_json(ref)
    freeze = proof["freeze"]
    require(type(freeze) is dict and freeze.get("profile") == "umf.release-build-source/3"
        and freeze.get("status") == "git-archive-complete-build-inputs" and freeze.get("commit") == admission["source_sha"]
        and freeze.get("expectedQCommit") == admission["source_sha"] and freeze.get("sourceRoot"),
        "actual source-freeze receipt is not bound to Q")
    for role in ("sourceInventory", "wheelSdistParity", "installedPairResources"):
        validate_mac_codegen_receipt(proof[role], role, freeze, admission)
    source_inventory = proof["sourceInventory"].get("codegen", {})
    inputs = source_inventory.get("sourceInputs")
    require(type(inputs) is dict and len(inputs) > 0 and source_inventory.get("sourceInputCount") == len(inputs)
        and all(type(v) is str and core.SHA.fullmatch(v) for v in inputs.values()),
        "local source-input inventory receipt is incomplete")
    parity = proof["wheelSdistParity"].get("codegen", {})
    wheel_name = f"umf_codegen-{VERSION}-py3-none-any.whl"
    require(parity.get("pureWheelRebuildMatchesDirect") is True
        and parity.get("pureWheelRebuildSha256") == admission["files"][wheel_name],
        "pure sdist/wheel parity receipt does not bind the exact admitted wheel")
    validate_installed_pair_receipt(proof["installedPairResources"], admission)
    return proof


def validate_release_pins(pins: dict, admission: dict) -> None:
    require(type(pins) is dict and pins.get("tag") == TAG and pins.get("commit") == admission["source_sha"]
        and pins.get("distribution") == "umf-core" and pins.get("version") == VERSION
        and pins.get("sdk") == VERSION and pins.get("umf_core") == VERSION
        and pins.get("files") == admission["core"]["files"], "release pins differ from the frozen Core cohort")


def verify_assets(assets: Path, raw_admission: bytes, expected_admission_sha: str,
                  expected_sums_sha: str, tag: str, source: str) -> tuple[dict, dict, dict]:
    admission = admission_identity(raw_admission, expected_admission_sha)
    require(tag == TAG and source == admission["source_sha"], "only the source locked by the tracked 0.10.9 admission is supported")
    require(expected_sums_sha == admission["sums_sha256"], "SHA256SUMS pin differs from tracked admission")
    sums_raw = read_asset(assets, "SHA256SUMS", expected_sums_sha)
    sums = core.parse_sums(sums_raw)
    pins_raw = read_asset(assets, "release-pins.json", admission["release_pins_sha256"])
    pins = decode(pins_raw)
    validate_release_pins(pins, admission)
    codegen_files = admission["files"]
    core_files = admission["core"]["files"]
    for name, expected in {**codegen_files, **core_files}.items():
        raw = read_asset(assets, name, expected)
        if name.startswith("umf_codegen-"):
            inspect_codegen(assets / name, wheel=name.endswith(".whl"), admission=admission)
        else:
            core.validate_archive(assets / name, "umf-core", VERSION)
        require(sums.get(name) == expected, "archive absent or hash differs in SHA256SUMS: " + name)
    require(sums.get("release-pins.json") == admission["release_pins_sha256"], "release pins hash absent from SHA256SUMS")
    source_name = f"umf-v{VERSION}-source.tar.gz"
    require(source_name in sums, "frozen source archive missing from SHA256SUMS")
    proof = local_proof_checks(admission)
    require(core.check_pypi("umf-core", VERSION, core_files) == "matching",
            "exact paired Core archives are not already public on PyPI")
    return admission, sums, proof


def verify_github(release: dict, tag_ref: dict, tag_object: dict | None, commit: dict,
                  admission: dict, sums: dict, sums_sha: str) -> None:
    verify_release_state(release)
    require(core.resolve_tag_commit(tag_ref, tag_object, TAG) == admission["source_sha"], "immutable 0.10.9 tag does not resolve to the admitted source")
    require(commit.get("sha") == admission["source_sha"] and commit.get("tree", {}).get("sha") == admission["source_tree"],
            "GitHub source commit/tree differs from the tracked admission")
    rows = release.get("assets")
    expected = {**sums, "SHA256SUMS": sums_sha}
    require(type(rows) is list and len(rows) == len(expected)
        and {row.get("name") for row in rows if type(row) is dict} == set(expected),
        "GitHub release asset inventory differs from SHA256SUMS")
    for row in rows:
        require(row.get("digest") == "sha256:" + expected[row["name"]],
                "GitHub release asset digest differs: " + row["name"])


def verify_release_state(release: dict) -> None:
    require(release.get("tag_name") == TAG and release.get("draft") is False and release.get("prerelease") is False
        and release.get("immutable") is True, "published immutable non-draft 0.10.9 release is required")


def write_roster(expected_admission_sha: str) -> None:
    _, admission = admission_from_git(expected_admission_sha)
    names = {"SHA256SUMS", "release-pins.json", *admission["files"], *admission["core"]["files"]}
    for name in names:
        safe_name(name)
    print("\n".join(sorted(names)))


def check_prepared_artifact(assets: Path, admission: dict, admission_sha: str,
                            sums_sha: str, tag: str, source: str) -> dict:
    require(tag == TAG and source == admission["source_sha"], "only the admitted 0.10.9 source can be checked")
    require(sums_sha == admission["sums_sha256"], "SHA256SUMS pin differs from the tracked admission")
    receipt_path = assets / "source-receipt.json"
    require(receipt_path.is_file() and not receipt_path.is_symlink(), "verified source receipt missing")
    receipt = decode(receipt_path.read_bytes())
    require(type(receipt) is dict and receipt.get("schema") == "umf.codegen-pypi-0.10.9-source/1"
        and receipt.get("status") == "verified" and receipt.get("repository") == REPOSITORY
        and receipt.get("tag") == TAG and receipt.get("source_sha") == admission["source_sha"]
        and receipt.get("source_tree") == admission["source_tree"] and receipt.get("version") == VERSION
        and receipt.get("admission_sha256") == admission_sha and receipt.get("sums_sha256") == sums_sha
        and receipt.get("files") == admission["files"] and receipt.get("core") == admission["core"]
        and receipt.get("local_qualification") == admission["local_qualification"],
        "verified source receipt is not bound to the current admission")
    require(receipt.get("proofs") == {k: "passed" for k in admission["local_qualification"]},
            "verified receipt does not report all exact local proof roles")
    local_proof_checks(admission)
    expected = set(admission["files"])
    actual = {path.name for path in assets.iterdir() if path.name.startswith("umf_codegen-") and path.suffix in {".whl", ".gz"}}
    require(actual == expected, "prepared artifact must contain exactly the two admitted Codegen archives")
    for name, sha in admission["files"].items():
        read_asset(assets, name, sha)
        inspect_codegen(assets / name, wheel=name.endswith(".whl"), admission=admission)
    require(core.check_pypi("umf-core", VERSION, admission["core"]["files"]) == "matching",
            "paired Core artifacts are not public with the admitted bytes")
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("roster", "verify", "check-pypi"))
    parser.add_argument("--assets-dir", type=Path, required=True)
    parser.add_argument("--expected-admission-sha256", required=True)
    parser.add_argument("--expected-sums-sha256", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--release-json", type=Path)
    parser.add_argument("--tag-ref-json", type=Path)
    parser.add_argument("--tag-object-json", type=Path)
    parser.add_argument("--commit-json", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--wait", action="store_true")
    args = parser.parse_args()
    raw_admission, admission = admission_from_git(args.expected_admission_sha256)
    if args.command == "roster":
        require(args.tag == TAG and args.source_sha == admission["source_sha"]
            and args.expected_sums_sha256 == admission["sums_sha256"],
            "dispatch tag/source/SHA256SUMS must match the tracked admission")
        write_roster(args.expected_admission_sha256)
        return 0
    if args.command == "check-pypi":
        receipt = check_prepared_artifact(args.assets_dir, admission, args.expected_admission_sha256,
            args.expected_sums_sha256, args.tag, args.source_sha)
        state = core.wait_for_pypi(DISTRIBUTION, VERSION, admission["files"]) if args.wait else core.check_pypi(DISTRIBUTION, VERSION, admission["files"])
        receipt["registryState"] = state
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
                stream.write("status=" + state + "\n")
        print(json.dumps(receipt, indent=2))
        return 0
    value, sums, proofs = verify_assets(args.assets_dir, raw_admission, args.expected_admission_sha256,
        args.expected_sums_sha256, args.tag, args.source_sha)
    receipt = {"schema": "umf.codegen-pypi-0.10.9-source/1", "status": "verified",
        "repository": REPOSITORY, "tag": TAG, "source_sha": value["source_sha"], "source_tree": value["source_tree"],
        "distribution": DISTRIBUTION, "version": VERSION, "admission_sha256": args.expected_admission_sha256,
        "sums_sha256": args.expected_sums_sha256, "files": value["files"], "core": value["core"],
        "local_qualification": value["local_qualification"], "proofs": {k: "passed" for k in proofs}}
    if args.command == "verify":
        require(args.release_json and args.tag_ref_json and args.commit_json and args.output_dir,
                "verify requires release, tag reference, commit tree, and output paths")
        verify_github(decode(args.release_json.read_bytes()), decode(args.tag_ref_json.read_bytes()),
            decode(args.tag_object_json.read_bytes()) if args.tag_object_json else None,
            decode(args.commit_json.read_bytes()), value, sums, args.expected_sums_sha256)
        require(not args.output_dir.exists(), "verified artifact output directory must be new")
        args.output_dir.mkdir()
        for name in value["files"]:
            shutil.copyfile(args.assets_dir / name, args.output_dir / name)
        (args.output_dir / "source-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AccessReleaseError, core.ReleaseError, OSError, KeyError, TypeError, ValueError,
            tarfile.TarError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        raise SystemExit("Codegen 0.10.9 publication refused: " + str(error))

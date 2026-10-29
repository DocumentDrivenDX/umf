# SPDX-License-Identifier: MIT OR Apache-2.0
"""Verify the exact source payload and rebuilt-sdist parity of an UMF wheel."""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import importlib.util
import io
import json
import os
import platform
import re
import subprocess
import sys
import sysconfig
import tarfile
import tempfile
import tomllib
import zipfile
from email.parser import Parser
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote

NATIVE_MEMBER = "umf/_rust_core.abi3.so"
CLI_MEMBER = "umf/_bin/umf"
WINDOWS_CLI_MEMBER = "umf/_bin/umf.exe"
RESOURCE_MANIFEST = "umf/action_runtime_resource_manifest.json"
EXPECTED_RUNTIME_FILES = {
    "actionsPackage.json",
    "bindingPackage.json",
    "constraints.json",
    "coreSchema.json",
    "domainPolicy.json",
    "packageSchema.json",
    "referenceSchema.json",
    "stableBindingPackage.json",
    "tablesPackage.json",
}
EXPECTED_RUNTIME_SOURCES = {
    "actionsPackage.json": "spec/extensions/actions/package.json",
    "bindingPackage.json": "spec/extensions/binding/package.json",
    "constraints.json": "spec/metamodel/generated/core-constraints.json",
    "coreSchema.json": "spec/core/schema.json",
    "domainPolicy.json": "spec/metamodel/generated/domain-policy.json",
    "packageSchema.json": "spec/core/extension-package.schema.json",
    "referenceSchema.json": "spec/core/semantic-type-reference.schema.json",
    "stableBindingPackage.json": "spec/extensions/binding-stable/package.json",
    "tablesPackage.json": "spec/extensions/tables/package.json",
}
SHA256_RE = re.compile(r"[0-9a-f]{64}\Z")
NATIVE_PLATFORM_HELPER_SHA256 = (
    "5856eb375d176af7671ad22981d983a14cec24663e3a8bc466446b433c2cd7b1"
)
SDIST_HELPER_SHA256 = "7ec7b4883325438a344141da6c83db6d7903a5a0ee09e2da3a5e8b895c64468f"


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _native_platform_helper() -> tuple[Any, Path]:
    path = Path(__file__).resolve().parents[1] / "python/_native_platform.py"
    try:
        payload = path.read_bytes()
    except OSError as error:
        raise ValueError("Pinned native-platform inspector is unavailable") from error
    if _sha256(payload) != NATIVE_PLATFORM_HELPER_SHA256:
        raise ValueError("Native-platform inspector differs from its source pin")
    spec = importlib.util.spec_from_file_location(
        "umf_qualification_native_platform", path
    )
    if spec is None or spec.loader is None:
        raise ValueError("Pinned native-platform inspector cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if _sha256(path.read_bytes()) != NATIVE_PLATFORM_HELPER_SHA256:
        raise ValueError("Native-platform inspector changed during verification")
    return module, path


def _sdist_helper(repository: Path) -> tuple[Any, Path]:
    path = repository / "tools/_python_sdist.py"
    try:
        payload = path.read_bytes()
    except OSError as error:
        raise ValueError("Pinned sdist input verifier is unavailable") from error
    if _sha256(payload) != SDIST_HELPER_SHA256:
        raise ValueError("Sdist input verifier differs from its source pin")
    spec = importlib.util.spec_from_file_location(
        "umf_qualification_python_sdist", path
    )
    if spec is None or spec.loader is None:
        raise ValueError("Pinned sdist input verifier cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if _sha256(path.read_bytes()) != SDIST_HELPER_SHA256:
        raise ValueError("Sdist input verifier changed during verification")
    return module, path


def _wheel_metadata_bytes(wheel_path: Path) -> bytes:
    with zipfile.ZipFile(wheel_path) as wheel:
        names = [
            name for name in wheel.namelist() if name.endswith(".dist-info/METADATA")
        ]
        if len(names) != 1:
            raise ValueError("Wheel must contain exactly one metadata file")
        return wheel.read(names[0])


def _inspect_macos_native(payload: bytes) -> dict[str, Any]:
    module, path = _native_platform_helper()
    result = module.inspect_macho_bytes(payload, "arm64")
    if _sha256(path.read_bytes()) != NATIVE_PLATFORM_HELPER_SHA256:
        raise ValueError("Native-platform inspector changed during verification")
    return result


def _python_package_payloads(package_source: Path) -> dict[str, bytes]:
    payloads: dict[str, bytes] = {}
    for source in sorted(package_source.iterdir()):
        if source.name == "__pycache__":
            continue
        if source.name == "_rust_core.abi3.so":
            if source.is_symlink() or not source.is_file():
                raise ValueError("Generated Rust extension is not a regular file")
            continue
        if source.name == "_bin":
            if source.is_symlink() or not source.is_dir():
                raise ValueError("Generated CLI directory is not a regular directory")
            cli_files = sorted(source.iterdir())
            if len(cli_files) > 1 or any(
                path.name not in {"umf", "umf.exe"}
                or path.is_symlink()
                or not path.is_file()
                for path in cli_files
            ):
                raise ValueError("Generated CLI directory has unexpected content")
            continue
        if source.is_symlink() or source.is_dir():
            raise ValueError("Source package contains a symlink")
        if source.is_file():
            if source.suffix in {".pyc", ".pyo"} or source.name == ".DS_Store":
                continue
            payloads[f"umf/{source.name}"] = source.read_bytes()
    return payloads


def _source_payloads(repository: Path) -> tuple[dict[str, bytes], dict[str, str]]:
    package_source = repository / "python/src/umf"
    pyproject_path = repository / "python/pyproject.toml"
    if not package_source.is_dir() or not pyproject_path.is_file():
        raise ValueError("Python source package or project metadata is missing")

    payloads = _python_package_payloads(package_source)

    manifest_bytes = payloads.get(RESOURCE_MANIFEST)
    if manifest_bytes is None or len(manifest_bytes) > 65_536:
        raise ValueError("Action runtime resource inventory is missing or oversized")
    runtime_source = (package_source / "action_runtime.py").read_text(encoding="utf-8")
    pinned_digest = re.search(
        r'^_MANIFEST_SHA256 = "([0-9a-f]{64})"$', runtime_source, re.MULTILINE
    )
    if pinned_digest is None or _sha256(manifest_bytes) != pinned_digest.group(1):
        raise ValueError("Action runtime manifest does not match its source pin")
    manifest = json.loads(manifest_bytes.decode("utf-8", errors="strict"))
    if (
        type(manifest) is not dict
        or set(manifest) != {"format", "resources"}
        or manifest["format"] != "umf.action-runtime-resources/1"
        or type(manifest["resources"]) is not dict
        or set(manifest["resources"])
        != {
            "actionsPackage",
            "bindingPackage",
            "constraints",
            "coreSchema",
            "domainPolicy",
            "packageSchema",
            "referenceSchema",
            "stableBindingPackage",
            "tablesPackage",
        }
    ):
        raise ValueError(
            "Action runtime inventory does not name the fixed nine resources"
        )

    resource_hashes: dict[str, str] = {}
    for entry in manifest["resources"].values():
        if type(entry) is not dict or set(entry) != {"file", "source", "sha256"}:
            raise ValueError("Action runtime inventory entry has an invalid shape")
        filename, source_name, digest = entry["file"], entry["source"], entry["sha256"]
        if (
            type(filename) is not str
            or filename not in EXPECTED_RUNTIME_FILES
            or type(source_name) is not str
            or source_name != EXPECTED_RUNTIME_SOURCES.get(filename)
            or type(digest) is not str
            or SHA256_RE.fullmatch(digest) is None
        ):
            raise ValueError("Action runtime inventory entry has invalid identifiers")
        source = repository / source_name
        if not source.is_file() or source.is_symlink():
            raise ValueError("An official action runtime source is missing")
        payload = source.read_bytes()
        if _sha256(payload) != digest:
            raise ValueError("An official action runtime source digest changed")
        target = f"umf/action_runtime_resources/{filename}"
        if target in payloads:
            raise ValueError("Action runtime resource target is duplicated")
        payloads[target] = payload
        resource_hashes[filename] = digest
    if (
        set(resource_hashes) != EXPECTED_RUNTIME_FILES
        or set(EXPECTED_RUNTIME_SOURCES) != EXPECTED_RUNTIME_FILES
    ):
        raise ValueError("Action runtime inventory does not cover the exact nine files")

    for filename in (
        "schema.json",
        "semantic-type-reference.schema.json",
        "extension-package.schema.json",
    ):
        source = repository / "spec/core" / filename
        if not source.is_file() or source.is_symlink():
            raise ValueError("A canonical core schema is missing")
        payloads[f"umf/spec/core/{filename}"] = source.read_bytes()
    _add_generated_json(payloads, repository / "spec/metamodel/generated")
    for extension in ("domain-pack", "dataset-source"):
        source = repository / "spec/extensions" / extension / "schema.json"
        if not source.is_file() or source.is_symlink():
            raise ValueError("A canonical extension schema is missing")
        payloads[f"umf/spec/extensions/{extension}/schema.json"] = source.read_bytes()

    return payloads, resource_hashes


def _add_generated_json(payloads: dict[str, bytes], source_root: Path) -> None:
    if not source_root.is_dir():
        raise ValueError("Generated canonical resources are missing")
    for source in sorted(source_root.iterdir()):
        if source.is_symlink() or source.is_dir():
            raise ValueError(
                "Generated canonical resource tree contains unexpected content"
            )
        if source.suffix == ".json":
            payloads[f"umf/spec/metamodel/generated/{source.name}"] = (
                source.read_bytes()
            )
        elif source.name != ".DS_Store":
            raise ValueError(
                "Generated canonical resource tree contains a non-JSON file"
            )


def _check_record(
    archive: zipfile.ZipFile, filenames: set[str], record_name: str
) -> None:
    try:
        rows = csv.reader(io.StringIO(archive.read(record_name).decode("utf-8")))
    except (KeyError, UnicodeDecodeError, csv.Error) as error:
        raise ValueError("Wheel RECORD is missing or malformed") from error
    recorded: dict[str, tuple[str, str]] = {}
    for row in rows:
        if len(row) != 3 or row[0] in recorded:
            raise ValueError("Wheel RECORD has a malformed or duplicate row")
        recorded[row[0]] = (row[1], row[2])
    if set(recorded) != filenames:
        raise ValueError("Wheel RECORD does not cover the exact archive contents")
    for name in filenames:
        digest, size = recorded[name]
        if name == record_name:
            if digest or size:
                raise ValueError(
                    "Wheel RECORD must leave its own digest and size blank"
                )
            continue
        payload = archive.read(name)
        expected = "sha256=" + base64.urlsafe_b64encode(
            hashlib.sha256(payload).digest()
        ).decode().rstrip("=")
        if digest != expected or size != str(len(payload)):
            raise ValueError("Wheel RECORD entry does not match its payload")


def _record_entries(payload: bytes) -> dict[str, tuple[str, str]]:
    try:
        rows = csv.reader(io.StringIO(payload.decode("utf-8", errors="strict")))
        entries: dict[str, tuple[str, str]] = {}
        for row in rows:
            if len(row) != 3:
                raise ValueError("Installed RECORD has a malformed row")
            name = unquote(row[0])
            path = PurePosixPath(name)
            if (
                not name
                or path.is_absolute()
                or ".." in path.parts
                or "\\" in name
                or name in entries
            ):
                raise ValueError("Installed RECORD has an unsafe or duplicate path")
            entries[name] = (row[1], row[2])
        return entries
    except (UnicodeDecodeError, csv.Error) as error:
        raise ValueError("Installed RECORD is malformed") from error


def _validate_installed_wheel(
    wheel_path: Path, platlib: Path, distribution_version: str
) -> dict[str, Any]:
    platlib = platlib.resolve(strict=True)
    with zipfile.ZipFile(wheel_path) as wheel:
        names_list = [name for name in wheel.namelist() if not name.endswith("/")]
        if len(names_list) != len(set(names_list)):
            raise ValueError("Wheel contains duplicate archive members")
        names = set(names_list)
        dist_info_dirs = {
            name.split("/", 1)[0] for name in names if ".dist-info/" in name
        }
        if len(dist_info_dirs) != 1:
            raise ValueError("Wheel must contain exactly one dist-info directory")
        dist_info = next(iter(dist_info_dirs))
        metadata = Parser().parsestr(
            wheel.read(f"{dist_info}/METADATA").decode("utf-8")
        )
        if (
            metadata.get("Name", "").lower().replace("_", "-") != "umf-core"
            or metadata.get("Version") != distribution_version
        ):
            raise ValueError(
                "Installed distribution version does not match the exact wheel"
            )

        installed_record_path = platlib / dist_info / "RECORD"
        record_resolved = installed_record_path.resolve(strict=True)
        record_parts = [
            platlib.joinpath(dist_info),
            installed_record_path,
        ]
        if (
            not record_resolved.is_relative_to(platlib)
            or any(path.is_symlink() for path in record_parts)
            or not installed_record_path.is_file()
        ):
            raise ValueError("Installed distribution RECORD is missing or unsafe")
        installed_entries = _record_entries(installed_record_path.read_bytes())
        archive_record_path = f"{dist_info}/RECORD"
        if archive_record_path not in names:
            raise ValueError("Wheel RECORD is missing")
        _check_record(wheel, names, archive_record_path)
        allowed_installer_files = {
            f"{dist_info}/INSTALLER",
            f"{dist_info}/REQUESTED",
            f"{dist_info}/direct_url.json",
        }
        installer_files = set(installed_entries) - names
        if not installer_files <= allowed_installer_files:
            raise ValueError(
                "Installed distribution contains an unexpected installer file"
            )
        if set(installed_entries) != names | installer_files:
            raise ValueError("Installed distribution RECORD omits or adds files")

        for root_name in ("umf", dist_info):
            root = platlib / root_name
            if root.is_symlink() or not root.is_dir():
                raise ValueError("Installed package root is missing or unsafe")
            actual: set[str] = set()
            for path in root.rglob("*"):
                if path.is_symlink():
                    raise ValueError("Installed package contains a symlink")
                if path.is_file():
                    actual.add(path.relative_to(platlib).as_posix())
            recorded = {
                name
                for name in installed_entries
                if name == root_name or name.startswith(root_name + "/")
            }
            if actual != recorded:
                raise ValueError("Installed package contains files omitted from RECORD")

        for name, (digest, size) in installed_entries.items():
            relative = PurePosixPath(name)
            path = platlib.joinpath(*relative.parts)
            resolved = path.resolve(strict=True)
            path_parts = [
                platlib.joinpath(*relative.parts[:index])
                for index in range(1, len(relative.parts) + 1)
            ]
            if (
                not resolved.is_relative_to(platlib)
                or any(part.is_symlink() for part in path_parts)
                or not path.is_file()
            ):
                raise ValueError(
                    "Installed distribution file escapes or links outside platlib"
                )
            payload = path.read_bytes()
            if name == archive_record_path:
                if digest or size:
                    raise ValueError(
                        "Installed RECORD must leave its own digest and size blank"
                    )
                continue
            expected_digest = "sha256=" + base64.urlsafe_b64encode(
                hashlib.sha256(payload).digest()
            ).decode().rstrip("=")
            if digest != expected_digest or size != str(len(payload)):
                raise ValueError(
                    "Installed distribution RECORD does not match its files"
                )
            if name in names and payload != wheel.read(name):
                raise ValueError(
                    "Installed distribution differs from the exact wheel payload"
                )

        expected_package = {name for name in names if name.startswith("umf/")}
        installed_package = {
            name for name in installed_entries if name.startswith("umf/")
        }
        if (
            installed_package != expected_package
            or NATIVE_MEMBER not in installed_package
            or len({CLI_MEMBER, WINDOWS_CLI_MEMBER} & installed_package) != 1
        ):
            raise ValueError("Installed package inventory differs from the exact wheel")
        return {
            "status": "passed",
            "distribution_version": distribution_version,
            "wheel_sha256": _sha256(wheel_path.read_bytes()),
            "installed_file_count": len(installed_entries),
            "package_file_count": len(installed_package),
            "native_sha256": _sha256((platlib / NATIVE_MEMBER).read_bytes()),
            "cli_sha256": _sha256(
                (platlib / next(iter({CLI_MEMBER, WINDOWS_CLI_MEMBER} & installed_package))).read_bytes()
            ),
            "all_files_inside_platlib": True,
        }


def _platform_matches(tag_platform: str, expected_platform: str) -> bool:
    if expected_platform == "auto":
        return True
    if expected_platform == "linux_x86_64":
        return tag_platform == expected_platform
    if expected_platform == "macos_arm64":
        return tag_platform == "macosx_11_0_arm64"
    return False


def _validate_wheel(
    wheel_path: Path,
    expected_payloads: dict[str, bytes],
    expected_licenses: dict[str, bytes],
    expected_version: str,
    expected_platform: str,
) -> dict[str, Any]:
    with zipfile.ZipFile(wheel_path) as wheel:
        filenames_list = [name for name in wheel.namelist() if not name.endswith("/")]
        if len(filenames_list) != len(set(filenames_list)):
            raise ValueError("Wheel contains duplicate archive members")
        filenames = set(filenames_list)
        dist_info_dirs = {
            name.split("/", 1)[0] for name in filenames if ".dist-info/" in name
        }
        if len(dist_info_dirs) != 1:
            raise ValueError("Wheel must contain exactly one dist-info directory")
        dist_info = next(iter(dist_info_dirs))
        if not dist_info.endswith(".dist-info"):
            raise ValueError("Wheel dist-info path is malformed")
        metadata_name = f"{dist_info}/METADATA"
        wheel_name = f"{dist_info}/WHEEL"
        record_name = f"{dist_info}/RECORD"
        metadata = Parser().parsestr(wheel.read(metadata_name).decode("utf-8"))
        if metadata.get("Name", "").lower().replace("_", "-") != "umf-core":
            raise ValueError("Wheel distribution name is not umf-core")
        if metadata.get("Version") != expected_version:
            raise ValueError("Wheel distribution version does not match the source")
        wheel_metadata = wheel.read(wheel_name).decode("utf-8")
        if "Root-Is-Purelib: false" not in wheel_metadata.splitlines():
            raise ValueError("Wheel is not marked as a platform-specific artifact")
        tags = [
            line.removeprefix("Tag: ")
            for line in wheel_metadata.splitlines()
            if line.startswith("Tag: ")
        ]
        if len(tags) != 1:
            raise ValueError("Wheel must declare exactly one platform tag")
        tag = tags[0]
        pieces = tag.split("-")
        if len(pieces) != 3 or pieces[:2] != ["cp311", "abi3"]:
            raise ValueError("Wheel does not declare the supported CPython abi3 tag")
        if not _platform_matches(pieces[2], expected_platform):
            raise ValueError("Wheel platform tag does not match the requested cohort")
        package_files = {name for name in filenames if name.startswith("umf/")}
        cli_member = WINDOWS_CLI_MEMBER if pieces[2].startswith("win") else CLI_MEMBER
        native_members = {NATIVE_MEMBER, cli_member}
        required_package_files = set(expected_payloads) | native_members
        if package_files != required_package_files:
            raise ValueError(
                "Wheel package payload differs from the exact source inventory"
            )
        license_members = {f"{dist_info}/licenses/{name}" for name in expected_licenses}
        required_archive_files = (
            package_files
            | {
                metadata_name,
                wheel_name,
                record_name,
            }
            | license_members
        )
        if filenames != required_archive_files:
            raise ValueError("Wheel contains an unexpected top-level or metadata file")
        native_bytes = wheel.read(NATIVE_MEMBER)
        if not native_bytes:
            raise ValueError("Wheel native extension is empty")
        cli_bytes = wheel.read(cli_member)
        if not cli_bytes:
            raise ValueError("Wheel native CLI is empty")
        native_platform = (
            _inspect_macos_native(native_bytes)
            if expected_platform == "macos_arm64"
            else None
        )
        cli_platform = (
            _inspect_macos_native(cli_bytes)
            if expected_platform == "macos_arm64"
            else None
        )
        for name, payload in expected_payloads.items():
            if wheel.read(name) != payload:
                raise ValueError(
                    f"Wheel payload does not match its exact source: {name}"
                )
        for filename, payload in expected_licenses.items():
            if wheel.read(f"{dist_info}/licenses/{filename}") != payload:
                raise ValueError("Wheel license payload does not match its source")
        _check_record(wheel, filenames, record_name)
        return {
            "filename": wheel_path.name,
            "sha256": _sha256(wheel_path.read_bytes()),
            "version": expected_version,
            "tag": tag,
            "package_file_count": len(package_files),
            "native_sha256": _sha256(native_bytes),
            "cli_member": cli_member,
            "cli_sha256": _sha256(cli_bytes),
            "native_platform": native_platform,
            "cli_platform": cli_platform,
        }


def _extract_sdist(
    sdist: Path, destination: Path, expected_version: str = "0.11.0"
) -> Path:
    destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise ValueError("Source extraction destination must be empty")
    with tarfile.open(sdist, "r:gz") as archive:
        members = archive.getmembers()
        if (
            len(members) > 100_000
            or sum(max(member.size, 0) for member in members) > 1_000_000_000
        ):
            raise ValueError("Source archive exceeds the extraction bounds")
        seen: set[str] = set()
        top_levels: set[str] = set()
        for member in members:
            path = PurePosixPath(member.name)
            normalized_name = member.name.rstrip("/") if member.isdir() else member.name
            if (
                path.is_absolute()
                or ".." in path.parts
                or path.as_posix() != normalized_name
                or normalized_name in seen
                or member.issym()
                or member.islnk()
            ):
                raise ValueError("Source archive contains an unsafe member path")
            if not (member.isfile() or member.isdir()):
                raise ValueError("Source archive contains an unsupported member type")
            if not path.parts or path.parts[0] in {"", "."}:
                raise ValueError("Source archive must have one named project root")
            top_levels.add(path.parts[0])
            if len(path.parts) == 1 and not member.isdir():
                raise ValueError(
                    "Source archive contains a file outside its project root"
                )
            seen.add(normalized_name)
            target = destination.joinpath(*path.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            source = archive.extractfile(member)
            if source is None:
                raise ValueError("Source archive member cannot be read")
            target.write_bytes(source.read())
    roots = list(destination.iterdir())
    if (
        len(top_levels) != 1
        or len(roots) != 1
        or roots[0].is_symlink()
        or not roots[0].is_dir()
    ):
        raise ValueError("Source archive must contain exactly one safe project root")
    project_file = roots[0] / "pyproject.toml"
    if project_file.is_symlink() or not project_file.is_file():
        raise ValueError("Source archive root has no project metadata")
    try:
        project = tomllib.loads(project_file.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        raise ValueError("Source archive project metadata is malformed") from error
    metadata = project.get("project")
    if (
        type(metadata) is not dict
        or type(metadata.get("name")) is not str
        or metadata["name"].lower().replace("_", "-") != "umf-core"
        or metadata.get("version") != expected_version
    ):
        raise ValueError("Source archive root is not the expected UMF distribution")
    return roots[0]


def _rebuild_sdist_wheel(
    sdist: Path,
    output_dir: Path,
    expected_version: str,
    repository: Path,
    expected_pkg_info: bytes,
) -> tuple[Path, dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    if any(output_dir.iterdir()):
        raise ValueError("Retained sdist-rebuild wheel directory must be empty")
    with tempfile.TemporaryDirectory(prefix="umf-action-sdist-") as temporary:
        temp_root = Path(temporary)
        source_root = _extract_sdist(sdist, temp_root / "source", expected_version)
        helper, helper_path = _sdist_helper(repository)
        source_manifest = helper.verify_sdist_inputs(
            source_root,
            repository,
            expected_version=expected_version,
            expected_pkg_info=expected_pkg_info,
        )
        if _sha256(helper_path.read_bytes()) != SDIST_HELPER_SHA256:
            raise ValueError("Sdist input verifier changed before the rebuild")
        rebuilt = temp_root / "wheel"
        rebuilt.mkdir()
        build_env = dict(os.environ)
        build_env["CARGO_TARGET_DIR"] = str(temp_root / "cargo-target")
        build_env["PYTHONDONTWRITEBYTECODE"] = "1"
        subprocess.run(
            [
                sys.executable,
                "-m",
                "build",
                "--wheel",
                "--no-isolation",
                "--outdir",
                str(rebuilt),
                str(source_root),
            ],
            check=True,
            timeout=1800,
            env=build_env,
        )
        wheels = list(rebuilt.glob("*.whl"))
        if len(wheels) != 1:
            raise ValueError("Source archive did not rebuild to exactly one wheel")
        helper_after, helper_path_after = _sdist_helper(repository)
        source_manifest_after = helper_after.verify_sdist_inputs(
            source_root,
            repository,
            expected_version=expected_version,
            expected_pkg_info=expected_pkg_info,
        )
        if (
            source_manifest_after != source_manifest
            or _sha256(helper_path_after.read_bytes()) != SDIST_HELPER_SHA256
        ):
            raise ValueError("Sdist build inputs changed during the rebuild")
        target = output_dir / wheels[0].name
        target.write_bytes(wheels[0].read_bytes())
        return target, source_manifest


def _wheel_package_bytes(
    path: Path,
) -> tuple[dict[str, bytes], str, str, dict[str, str], bytes, bytes]:
    with zipfile.ZipFile(path) as archive:
        names = [name for name in archive.namelist() if not name.endswith("/")]
        cli_members = [name for name in names if name in {CLI_MEMBER, WINDOWS_CLI_MEMBER}]
        if len(cli_members) != 1 or NATIVE_MEMBER not in names:
            raise ValueError("Wheel is missing one or more native payloads")
        native_digests = {
            NATIVE_MEMBER: _sha256(archive.read(NATIVE_MEMBER)),
            cli_members[0]: _sha256(archive.read(cli_members[0])),
        }
        package = {
            name: archive.read(name)
            for name in names
            if name.startswith("umf/")
            and name not in {NATIVE_MEMBER, CLI_MEMBER, WINDOWS_CLI_MEMBER}
        }
        dist_info = next(
            name.split("/", 1)[0] for name in names if ".dist-info/" in name
        )
        metadata = Parser().parsestr(
            archive.read(f"{dist_info}/METADATA").decode("utf-8")
        )
        wheel = archive.read(f"{dist_info}/WHEEL").decode("utf-8")
        tag = next(
            line.removeprefix("Tag: ")
            for line in wheel.splitlines()
            if line.startswith("Tag: ")
        )
        return (
            package,
            metadata.get("Version", ""),
            tag,
            native_digests,
            archive.read(f"{dist_info}/METADATA"),
            archive.read(f"{dist_info}/WHEEL"),
        )


def _compare_wheel_package_sources(direct: Path, rebuilt: Path) -> dict[str, Any]:
    (
        direct_payload,
        direct_version,
        direct_tag,
        direct_native,
        direct_metadata,
        direct_wheel_metadata,
    ) = _wheel_package_bytes(direct)
    (
        rebuilt_payload,
        rebuilt_version,
        rebuilt_tag,
        rebuilt_native,
        rebuilt_metadata,
        rebuilt_wheel_metadata,
    ) = _wheel_package_bytes(rebuilt)
    if direct_payload != rebuilt_payload:
        raise ValueError("Source archive rebuild changed non-native package payload")
    if direct_version != rebuilt_version:
        raise ValueError("Source archive rebuild changed the distribution version")
    if direct_tag != rebuilt_tag:
        raise ValueError("Source archive rebuild changed the platform tag")
    if direct_metadata != rebuilt_metadata:
        raise ValueError("Source archive rebuild changed wheel METADATA bytes")
    if direct_wheel_metadata != rebuilt_wheel_metadata:
        raise ValueError("Source archive rebuild changed wheel WHEEL bytes")
    return {
        "non_native_package_payload_matches": True,
        "version_matches": True,
        "tag_matches": True,
        "metadata_byte_identity": True,
        "wheel_byte_identity": True,
        "native_byte_identity": direct_native == rebuilt_native,
        "native_byte_identity_by_member": {
            member: direct_native[member] == rebuilt_native[member]
            for member in sorted(direct_native)
        },
    }


def verify(
    wheel_path: Path,
    repository: Path,
    expected_platform: str,
    sdist_path: Path | None,
    rebuilt_wheel_directory: Path | None = None,
    expected_version: str = "0.11.0",
) -> dict[str, Any]:
    repository = repository.resolve()
    project = tomllib.loads((repository / "python/pyproject.toml").read_text())
    distribution_version = project["project"]["version"]
    if distribution_version != expected_version:
        raise ValueError("The SDK distribution source does not match the expected version")
    init_source = (repository / "python/src/umf/__init__.py").read_text(
        encoding="utf-8"
    )
    if f'__version__ = "{expected_version}"' not in init_source:
        raise ValueError(
            "The Python package version does not match distribution metadata"
        )
    semantic_schema = json.loads((repository / "spec/core/schema.json").read_text())
    core_version = semantic_schema["properties"]["umf"]["const"]
    if core_version != "0.10.0":
        raise ValueError("The current UMF semantic core version changed unexpectedly")
    expected_payloads, resource_hashes = _source_payloads(repository)
    expected_licenses = {
        name: (repository / "python" / name).read_bytes()
        for name in ("LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE")
    }
    wheel_info = _validate_wheel(
        wheel_path,
        expected_payloads,
        expected_licenses,
        distribution_version,
        expected_platform,
    )
    receipt: dict[str, Any] = {
        "schema": "umf.python-artifact-qualification/1",
        "source_payload_verification": "passed",
        "distribution_version": distribution_version,
        "semantic_core_version": core_version,
        "platform": {
            "system": sys.platform,
            "machine": platform.machine(),
            "python": platform.python_version(),
            "python_platform": sysconfig.get_platform(),
        },
        "wheel": wheel_info,
        "artifacts": {
            "direct": wheel_info,
        },
        "package_payload_sha256": _sha256(
            json.dumps(
                {
                    name: _sha256(payload)
                    for name, payload in sorted(expected_payloads.items())
                },
                sort_keys=True,
                separators=(",", ":"),
            ).encode()
        ),
        "action_runtime_resource_count": len(resource_hashes),
        "action_runtime_resource_sha256": resource_hashes,
        "native_platform_helper_sha256": NATIVE_PLATFORM_HELPER_SHA256,
    }
    if sdist_path is not None:
        if rebuilt_wheel_directory is None:
            raise ValueError(
                "A retained output directory is required for the sdist-rebuilt wheel"
            )
        receipt["sdist"] = {
            "filename": sdist_path.name,
            "sha256": _sha256(sdist_path.read_bytes()),
        }
        rebuilt, source_manifest = _rebuild_sdist_wheel(
            sdist_path,
            rebuilt_wheel_directory,
            distribution_version,
            repository,
            _wheel_metadata_bytes(wheel_path),
        )
        rebuilt_info = _validate_wheel(
            rebuilt,
            expected_payloads,
            expected_licenses,
            distribution_version,
            expected_platform,
        )
        source_parity = _compare_wheel_package_sources(wheel_path, rebuilt)
        receipt["artifacts"]["sdist_rebuilt"] = rebuilt_info
        receipt["sdist_rebuild"] = source_parity
        receipt["sdist_build_inputs"] = source_manifest
        receipt["sdist_helper_sha256"] = SDIST_HELPER_SHA256
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wheel", type=Path, required=True)
    parser.add_argument(
        "--expected-version",
        default="0.11.0",
        help="Expected umf-core distribution/package version",
    )
    parser.add_argument(
        "--verify-installed-wheel",
        action="store_true",
        help="Compare the current installation and RECORD to the exact wheel",
    )
    parser.add_argument(
        "--repository", type=Path, default=Path(__file__).resolve().parents[1]
    )
    parser.add_argument(
        "--expected-platform",
        choices=("auto", "linux_x86_64", "macos_arm64"),
        default="auto",
    )
    parser.add_argument("--sdist", type=Path)
    parser.add_argument(
        "--rebuilt-wheel-directory",
        type=Path,
        help="Retain the independently rebuilt wheel in this separate directory",
    )
    parser.add_argument("--receipt", type=Path)
    args = parser.parse_args()
    if args.verify_installed_wheel:
        with zipfile.ZipFile(args.wheel) as wheel:
            names = [name for name in wheel.namelist() if ".dist-info/METADATA" in name]
            if len(names) != 1:
                raise ValueError(
                    "Wheel must contain exactly one distribution metadata file"
                )
            metadata = Parser().parsestr(wheel.read(names[0]).decode("utf-8"))
            if metadata.get("Name", "").lower().replace("_", "-") != "umf-core":
                raise ValueError("Wheel distribution name is not umf-core")
            distribution_version = metadata.get("Version", "")
        if distribution_version != args.expected_version:
            raise ValueError("Wheel distribution version does not match the expected version")
        installed = _validate_installed_wheel(
            args.wheel,
            Path(sysconfig.get_path("platlib")),
            distribution_version,
        )
        encoded = json.dumps(installed, sort_keys=True, separators=(",", ":")) + "\n"
        if args.receipt is not None:
            args.receipt.parent.mkdir(parents=True, exist_ok=True)
            args.receipt.write_text(encoded, encoding="utf-8")
        print(encoded, end="")
        return 0
    receipt = verify(
        args.wheel,
        args.repository,
        args.expected_platform,
        args.sdist,
        args.rebuilt_wheel_directory,
        args.expected_version,
    )
    encoded = json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n"
    if args.receipt is not None:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

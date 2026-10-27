# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pure controls for the exact Python wheel artifact verifier."""

from __future__ import annotations

import ast
import base64
import csv
import hashlib
import importlib.util
import io
import json
import os
import re
import struct
import subprocess
import sys
import tarfile
import textwrap
import tomllib
import types
import zipfile
from email.parser import Parser
from pathlib import Path

import pytest
from packaging.specifiers import SpecifierSet


def _verifier():
    path = Path(__file__).resolve().parents[2] / "tools/verify_python_artifacts.py"
    spec = importlib.util.spec_from_file_location("umf_test_artifact_verifier", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _release_wheel_qualifier():
    path = Path(__file__).resolve().parents[2] / "tools/qualify_python_release_wheel.py"
    spec = importlib.util.spec_from_file_location("umf_test_release_wheel_qualifier", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _core_public_producer_verifier():
    path = Path(__file__).resolve().parents[2] / "tools/verify_core_public_producer.py"
    spec = importlib.util.spec_from_file_location("umf_test_core_public_producer", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _core_public_release_verifier():
    path = Path(__file__).resolve().parents[2] / "tools/verify_core_public_release.py"
    spec = importlib.util.spec_from_file_location("umf_test_core_public_release", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    ("raw", "repaired"),
    (
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n\n",
        ),
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nX-UMF-Unknown: retain exactly  \nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nX-UMF-Unknown: retain exactly  \nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
    ),
)
def test_repair_wheel_metadata_allows_only_tag_and_one_terminal_separator(
    raw, repaired
):
    qualifier = _release_wheel_qualifier()

    matches, reason = qualifier._compare_wheel_metadata(
        raw,
        repaired,
        "cp311-abi3-linux_x86_64",
        "cp311-abi3-manylinux_2_34_x86_64",
    )

    assert matches is True
    assert reason == "EXACT_AFTER_TAG_AND_ONE_TERMINAL_LF"


@pytest.mark.parametrize(
    ("raw", "repaired"),
    (
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.1\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
        (
            b"Wheel-Version: 1.0\nX-UMF-Unknown: before\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n",
            b"Wheel-Version: 1.0\nX-UMF-Unknown: after\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
        (
            b"Generator: hatchling 1.27.0\nWheel-Version: 1.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0 \nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n\nBody: forbidden\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n\n\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
        (
            b"Wheel-Version: 1.0\n\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\nTag: cp311-abi3-linux_x86_64\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag:\tcp311-abi3-linux_x86_64\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
        (
            b"Wheel-Version: 1.0\r\nGenerator: hatchling 1.27.0\r\nRoot-Is-Purelib: false\r\nTag: cp311-abi3-linux_x86_64\r\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n",
        ),
        (
            b"\nWheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n",
            b"\nWheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n\n",
        ),
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\ntag: unchanged duplicate\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\ntag: unchanged duplicate\n",
        ),
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n folded value\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n folded value\n",
        ),
        (
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-linux_x86_64\n\tfolded value\n",
            b"Wheel-Version: 1.0\nGenerator: hatchling 1.27.0\nRoot-Is-Purelib: false\nTag: cp311-abi3-manylinux_2_34_x86_64\n\tfolded value\n",
        ),
    ),
)
def test_repair_wheel_metadata_refuses_any_other_framing_or_header_change(
    raw, repaired
):
    qualifier = _release_wheel_qualifier()

    matches, reason = qualifier._compare_wheel_metadata(
        raw,
        repaired,
        "cp311-abi3-linux_x86_64",
        "cp311-abi3-manylinux_2_34_x86_64",
    )

    assert matches is False
    assert reason != "EXACT_AFTER_TAG_AND_ONE_TERMINAL_LF"


def test_wheel_metadata_pair_diagnostic_is_bounded_and_lossless_for_small_bytes(
    tmp_path,
):
    qualifier = _release_wheel_qualifier()
    raw = b"Tag: cp311-abi3-linux_x86_64\n"
    repaired = b"Tag: cp311-abi3-manylinux_2_34_x86_64\n"

    diagnostic_bytes = qualifier._wheel_metadata_pair_diagnostic(
        tmp_path / "raw.whl", raw, tmp_path / "repaired.whl", repaired, "MATCH",
        "EXACT_AFTER_TAG_AND_ONE_TERMINAL_LF",
    )
    diagnostic = json.loads(diagnostic_bytes)

    assert len(diagnostic_bytes) <= 16 * 1024
    assert diagnostic["raw"]["bytesBase64"] == base64.b64encode(raw).decode("ascii")
    assert diagnostic["repaired"]["bytesBase64"] == base64.b64encode(repaired).decode("ascii")
    assert diagnostic["raw"]["sha256"] == hashlib.sha256(raw).hexdigest()
    assert diagnostic["repaired"]["sha256"] == hashlib.sha256(repaired).hexdigest()


def test_wheel_metadata_pair_diagnostic_marks_oversize_bytes_unavailable(tmp_path):
    qualifier = _release_wheel_qualifier()
    raw = b"r" * (4 * 1024 + 1)
    repaired = b"s" * (4 * 1024 + 2)

    diagnostic_bytes = qualifier._wheel_metadata_pair_diagnostic(
        tmp_path / "raw.whl", raw, tmp_path / "repaired.whl", repaired, "MISMATCH",
        "NON_TAG_BYTES_DIFFER",
    )
    diagnostic = json.loads(diagnostic_bytes)

    assert len(diagnostic_bytes) <= 16 * 1024
    assert diagnostic["status"] == "MISMATCH"
    for key, payload in (("raw", raw), ("repaired", repaired)):
        assert diagnostic[key]["bytesBase64"] is None
        assert diagnostic[key]["bytesStatus"] == "UNAVAILABLE_OVERSIZE"
        assert diagnostic[key]["sizeBytes"] == len(payload)
        assert diagnostic[key]["sha256"] == hashlib.sha256(payload).hexdigest()


def _macho(machine="arm64", minimum=(11, 0, 0), *, fat=False, include_version=True):
    if fat:
        return b"\xca\xfe\xba\xbe" + bytes(64)
    cpu_type = {"arm64": 0x0100000C, "x86_64": 0x01000007}[machine]
    commands = b""
    command_count = 0
    if include_version:
        packed = (minimum[0] << 16) | (minimum[1] << 8) | minimum[2]
        commands = struct.pack("<IIIIII", 0x32, 24, 1, packed, packed, 0)
        command_count = 1
    header = struct.pack(
        "<IiiIIIII", 0xFEEDFACF, cpu_type, 0, 2, command_count, len(commands), 0, 0
    )
    return header + commands


def _wheel(
    path,
    package,
    *,
    version="0.10.3",
    tag="cp311-abi3-linux_x86_64",
    native=b"native",
    metadata_extra="",
    wheel_extra="",
    corrupt_record=False,
):
    verifier = _verifier()
    dist_info = f"umf_core-{version}.dist-info"
    files = {
        **package,
        verifier.NATIVE_MEMBER: native,
        f"{dist_info}/METADATA": (
            f"Metadata-Version: 2.3\nName: umf-core\nVersion: {version}\n"
            f"Requires-Python: >=3.11,<3.15\n{metadata_extra}"
        ).encode(),
        f"{dist_info}/WHEEL": (
            f"Wheel-Version: 1.0\nRoot-Is-Purelib: false\nTag: {tag}\n{wheel_extra}"
        ).encode(),
    }
    for name in ("LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE"):
        files[f"{dist_info}/licenses/{name}"] = b"license"
    record_name = f"{dist_info}/RECORD"
    rows = []
    for name, payload in files.items():
        digest = (
            base64.urlsafe_b64encode(hashlib.sha256(payload).digest())
            .decode()
            .rstrip("=")
        )
        rows.append((name, f"sha256={digest}", str(len(payload))))
    rows.append((record_name, "", ""))
    output = io.StringIO()
    csv.writer(output, lineterminator="\n").writerows(rows)
    files[record_name] = (
        b"umf/__init__.py,,\n" if corrupt_record else output.getvalue().encode()
    )
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, payload in files.items():
            archive.writestr(name, payload)
    return path


def _install_wheel(wheel_path, destination, *, extra_files=None):
    extra_files = extra_files or {}
    with zipfile.ZipFile(wheel_path) as archive:
        for name in archive.namelist():
            if name.endswith(("/", "/RECORD")):
                continue
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(name))
    dist_info = next(destination.glob("umf_core-*.dist-info"))
    (dist_info / "INSTALLER").write_text("pip\n", encoding="utf-8")
    (dist_info / "REQUESTED").write_bytes(b"")
    (dist_info / "direct_url.json").write_text(
        '{"url":"file:///private/runner/path.whl"}\n', encoding="utf-8"
    )
    for name, payload in extra_files.items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
    files = sorted(
        path.relative_to(destination).as_posix()
        for path in destination.rglob("*")
        if path.is_file() and path.name != "RECORD"
    )
    rows = []
    for name in files:
        payload = (destination / name).read_bytes()
        digest = (
            base64.urlsafe_b64encode(hashlib.sha256(payload).digest())
            .decode()
            .rstrip("=")
        )
        rows.append((name, f"sha256={digest}", str(len(payload))))
    rows.append((f"{dist_info.name}/RECORD", "", ""))
    output = io.StringIO()
    csv.writer(output, lineterminator="\n").writerows(rows)
    (dist_info / "RECORD").write_text(output.getvalue(), encoding="utf-8")


def _rewrite_installed_record(destination):
    dist_info = next(destination.glob("umf_core-*.dist-info"))
    files = sorted(
        path.relative_to(destination).as_posix()
        for path in destination.rglob("*")
        if path.is_file() and path.name != "RECORD"
    )
    rows = []
    for name in files:
        payload = (destination / name).read_bytes()
        digest = (
            base64.urlsafe_b64encode(hashlib.sha256(payload).digest())
            .decode()
            .rstrip("=")
        )
        rows.append((name, f"sha256={digest}", str(len(payload))))
    rows.append((f"{dist_info.name}/RECORD", "", ""))
    output = io.StringIO()
    csv.writer(output, lineterminator="\n").writerows(rows)
    (dist_info / "RECORD").write_text(output.getvalue(), encoding="utf-8")


def test_source_inventory_contains_all_nine_bound_runtime_resources():
    verifier = _verifier()
    repository = Path(__file__).resolve().parents[2]
    payloads, resources = verifier._source_payloads(repository)
    assert len(resources) == 9
    assert set(resources) == verifier.EXPECTED_RUNTIME_FILES
    assert {
        name for name in payloads if name.startswith("umf/action_runtime_resources/")
    } == {
        f"umf/action_runtime_resources/{name}"
        for name in verifier.EXPECTED_RUNTIME_FILES
    }


def test_exact_wheel_payload_and_record_are_accepted(tmp_path):
    verifier = _verifier()
    package = {"umf/__init__.py": b"__version__ = '0.10.3'\n"}
    expected_licenses = {
        name: b"license" for name in ("LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE")
    }
    wheel = _wheel(tmp_path / "valid.whl", package)

    result = verifier._validate_wheel(
        wheel, package, expected_licenses, "0.10.3", "linux_x86_64"
    )

    assert result["version"] == "0.10.3"
    assert result["tag"] == "cp311-abi3-linux_x86_64"
    assert result["package_file_count"] == 2


def test_macos_arm64_tag_is_accepted_only_for_the_arm64_cohort(tmp_path):
    verifier = _verifier()
    package = {"umf/__init__.py": b"source"}
    expected_licenses = {
        name: b"license" for name in ("LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE")
    }
    wheel = _wheel(
        tmp_path / "macos.whl",
        package,
        tag="cp311-abi3-macosx_11_0_arm64",
        native=_macho(),
    )

    result = verifier._validate_wheel(
        wheel, package, expected_licenses, "0.10.3", "macos_arm64"
    )

    assert result["tag"] == "cp311-abi3-macosx_11_0_arm64"
    assert result["native_platform"] == {
        "format": "thin-64-bit-macho",
        "machine": "arm64",
        "version_command": "LC_BUILD_VERSION",
        "minimum_os": "11.0.0",
    }


@pytest.mark.parametrize(
    ("native", "message"),
    (
        (_macho(fat=True), "thin"),
        (_macho(machine="x86_64"), "CPU"),
        (_macho(include_version=False), "version command"),
        (_macho(minimum=(15, 0, 0)), "exactly macOS 11.0.0"),
    ),
)
def test_macos_artifact_rejects_fat_wrong_cpu_or_unqualified_minimum(
    tmp_path, native, message
):
    verifier = _verifier()
    package = {"umf/__init__.py": b"source"}
    licenses = {
        name: b"license" for name in ("LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE")
    }
    wheel = _wheel(
        tmp_path / "invalid-macos.whl",
        package,
        tag="cp311-abi3-macosx_11_0_arm64",
        native=native,
    )

    with pytest.raises(ValueError, match=message):
        verifier._validate_wheel(wheel, package, licenses, "0.10.3", "macos_arm64")


def test_hatch_hook_loads_its_native_inspector_outside_project_directory(
    tmp_path, monkeypatch
):
    repository = Path(__file__).resolve().parents[2]
    hook_path = repository / "python/hatch_build.py"
    monkeypatch.chdir(tmp_path)
    package_names = (
        "hatchling",
        "hatchling.builders",
        "hatchling.builders.hooks",
        "hatchling.builders.hooks.plugin",
    )
    for name in package_names:
        package = types.ModuleType(name)
        package.__path__ = []
        monkeypatch.setitem(sys.modules, name, package)
    interface = types.ModuleType("hatchling.builders.hooks.plugin.interface")
    interface.BuildHookInterface = type("BuildHookInterface", (), {})
    monkeypatch.setitem(
        sys.modules, "hatchling.builders.hooks.plugin.interface", interface
    )
    spec = importlib.util.spec_from_file_location("umf_test_hatch_hook", hook_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.macos_target("darwin", "arm64") == (
        "aarch64-apple-darwin",
        "macosx_11_0_arm64",
        "arm64",
    )


def test_native_platform_target_is_explicit_and_rejects_unknown_hosts():
    helper = _native_platform_helper()
    assert helper.macos_target("darwin", "arm64") == (
        "aarch64-apple-darwin",
        "macosx_11_0_arm64",
        "arm64",
    )
    assert helper.macos_target("darwin", "x86_64") == (
        "x86_64-apple-darwin",
        "macosx_11_0_x86_64",
        "x86_64",
    )
    with pytest.raises(helper.NativePlatformError):
        helper.macos_target("darwin", "universal2")


def _native_platform_helper():
    path = Path(__file__).resolve().parents[1] / "_native_platform.py"
    spec = importlib.util.spec_from_file_location("umf_test_native_platform", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_sdist_rebuild_accepts_distinct_native_bytes_without_claiming_identity(
    tmp_path,
):
    verifier = _verifier()
    package = {"umf/__init__.py": b"source"}
    direct = _wheel(tmp_path / "direct.whl", package, native=b"native-direct")
    rebuilt = _wheel(tmp_path / "rebuilt.whl", package, native=b"native-rebuilt")

    parity = verifier._compare_wheel_package_sources(direct, rebuilt)

    assert parity == {
        "non_native_package_payload_matches": True,
        "version_matches": True,
        "tag_matches": True,
        "metadata_byte_identity": True,
        "wheel_byte_identity": True,
        "native_byte_identity": False,
    }


@pytest.mark.parametrize(
    ("rebuilt_package", "version", "tag", "message"),
    [
        (
            {"umf/__init__.py": b"changed"},
            "0.10.3",
            "cp311-abi3-linux_x86_64",
            "non-native",
        ),
        (
            {"umf/__init__.py": b"source"},
            "0.10.0",
            "cp311-abi3-linux_x86_64",
            "version",
        ),
        (
            {"umf/__init__.py": b"source"},
            "0.10.3",
            "cp311-abi3-linux_aarch64",
            "platform tag",
        ),
        (
            {"umf/__init__.py": b"source"},
            "0.10.3",
            "cp311-abi3-linux_x86_64",
            "wheel METADATA",
        ),
        (
            {"umf/__init__.py": b"source"},
            "0.10.3",
            "cp311-abi3-linux_x86_64",
            "wheel WHEEL",
        ),
    ],
)
def test_sdist_rebuild_rejects_source_version_tag_or_metadata_drift(
    tmp_path, rebuilt_package, version, tag, message
):
    verifier = _verifier()
    direct = _wheel(tmp_path / "direct.whl", {"umf/__init__.py": b"source"})
    rebuilt = _wheel(
        tmp_path / "rebuilt.whl",
        rebuilt_package,
        version=version,
        tag=tag,
        metadata_extra="Summary: changed\n" if message == "wheel METADATA" else "",
        wheel_extra="Generator: changed\n" if message == "wheel WHEEL" else "",
    )

    with pytest.raises(ValueError, match=message):
        verifier._compare_wheel_package_sources(direct, rebuilt)


def test_installed_wheel_payload_and_record_match_the_exact_archive(tmp_path):
    verifier = _verifier()
    package = {"umf/__init__.py": b"__version__ = '0.10.3'\n"}
    wheel = _wheel(tmp_path / "installed.whl", package)
    platlib = tmp_path / "site-packages"
    _install_wheel(wheel, platlib)

    result = verifier._validate_installed_wheel(wheel, platlib, "0.10.3")

    assert result["status"] == "passed"
    assert result["all_files_inside_platlib"] is True
    assert result["package_file_count"] == 2
    assert result["native_sha256"] == hashlib.sha256(b"native").hexdigest()


@pytest.mark.parametrize("damage", ("payload", "record", "extra", "pyc", "symlink"))
def test_installed_wheel_verification_rejects_changed_or_escaped_files(
    tmp_path, damage
):
    verifier = _verifier()
    package = {"umf/__init__.py": b"source"}
    wheel = _wheel(tmp_path / "installed.whl", package)
    platlib = tmp_path / "site-packages"
    _install_wheel(wheel, platlib)
    package_file = platlib / "umf/__init__.py"
    if damage == "payload":
        package_file.write_bytes(b"replaced")
        _rewrite_installed_record(platlib)
        expected = "exact wheel payload"
    elif damage == "record":
        package_file.write_bytes(b"replaced")
        expected = "RECORD"
    elif damage == "extra":
        extra = platlib / "umf_core-0.10.3.dist-info/EXTRA"
        extra.write_text("unexpected", encoding="utf-8")
        expected = "omitted from RECORD"
    elif damage == "pyc":
        bytecode = platlib / "umf/__pycache__/module.cpython-311.pyc"
        bytecode.parent.mkdir()
        bytecode.write_bytes(b"generated bytecode")
        expected = "omitted from RECORD"
    else:
        outside = tmp_path / "outside.py"
        outside.write_bytes(package_file.read_bytes())
        package_file.unlink()
        package_file.symlink_to(outside)
        expected = "symlink"

    with pytest.raises(ValueError, match=expected):
        verifier._validate_installed_wheel(wheel, platlib, "0.10.3")


def test_installed_workflow_disables_bytecode_and_hashes_verifier_source():
    workflow = (
        Path(__file__).resolve().parents[2]
        / ".github/workflows/python-action-runtime.yml"
    ).read_text(encoding="utf-8")

    assert "--no-compile" in workflow
    assert "-I -B" in workflow
    assert "hashFiles(" not in workflow
    assert "hashlib.sha256(verifier_path.read_bytes()).hexdigest()" in workflow
    assert 'current.endswith("_arm64")' not in workflow
    assert 'current.startswith("macosx_")' in workflow


def test_workflow_independently_installs_and_qualifies_both_native_artifacts():
    workflow = (
        Path(__file__).resolve().parents[2]
        / ".github/workflows/python-action-runtime.yml"
    ).read_text(encoding="utf-8")
    producer_start_marker = "  qualify-installed-artifact:\n"
    selected_start_marker = "  qualify-selected-release-wheel-four-cells:\n"
    assert workflow.count(producer_start_marker) == 1
    assert workflow.count(selected_start_marker) == 1
    producer_start = workflow.index(producer_start_marker)
    selected_start = workflow.index(selected_start_marker)
    assert producer_start < selected_start
    producer_workflow = workflow[producer_start:selected_start]

    producer_matrix_start = producer_workflow.index("      matrix:\n")
    producer_matrix_end = producer_workflow.index(
        "\n    runs-on: ${{ matrix.runs-on }}\n", producer_matrix_start
    ) + 1
    producer_matrix = producer_workflow[producer_matrix_start:producer_matrix_end]
    assert producer_matrix.count("          - cohort: ") == 1
    assert producer_matrix.count("          - cohort: linux-x86_64\n") == 1
    assert producer_matrix.count("            runs-on: ubuntu-24.04\n") == 1
    assert producer_matrix.count("            python-version: '3.11.17'\n") == 1
    assert producer_matrix.count("            python-architecture: x64\n") == 1
    assert producer_matrix.count("            expected-machine: x86_64\n") == 1
    assert producer_matrix.count("            expected-platform: linux_x86_64\n") == 1
    assert "macos" not in producer_matrix

    selected_workflow = workflow[selected_start:]
    selected_matrix_start = selected_workflow.index("      matrix:\n")
    selected_matrix_end = selected_workflow.index(
        "\n    runs-on: ${{ matrix.runs-on }}\n", selected_matrix_start
    ) + 1
    selected_matrix = selected_workflow[selected_matrix_start:selected_matrix_end]
    assert selected_matrix.count("          - cohort: ") == 2
    assert selected_matrix.count("          - cohort: linux-x86_64\n") == 2
    assert selected_matrix.count("            runs-on: ubuntu-24.04\n") == 2
    assert selected_matrix.count("            platform: linux\n") == 2
    assert selected_matrix.count("            python-version: '3.11.17'\n") == 1
    assert selected_matrix.count("            expected-python-minor: '11'\n") == 1
    assert selected_matrix.count("            python-version: '3.14.8'\n") == 1
    assert selected_matrix.count("            expected-python-minor: '14'\n") == 1
    assert selected_matrix.count("            expected-machine: x86_64\n") == 2
    assert "macos" not in selected_matrix

    public_workflow_path = (
        Path(__file__).resolve().parents[2]
        / ".github/workflows/core-0.10.3-public-install-proof.yml"
    )
    public_workflow = public_workflow_path.read_text(encoding="utf-8")
    public_job_marker = "  public-installed-wheel:\n"
    assert public_workflow.count(public_job_marker) == 1
    public_job = public_workflow[public_workflow.index(public_job_marker) :]
    public_matrix_start = public_job.index("      matrix:\n")
    public_matrix_end = public_job.index(
        "\n    runs-on: ${{ matrix.runs-on }}\n", public_matrix_start
    ) + 1
    public_matrix = public_job[public_matrix_start:public_matrix_end]
    assert public_matrix.count("          - cohort: ") == 2
    assert public_matrix.count("          - cohort: linux-x86_64\n") == 2
    assert public_matrix.count("            runs-on: ubuntu-24.04\n") == 2
    assert public_matrix.count("            platform: linux\n") == 2
    assert public_matrix.count("            python-version: '3.11.17'\n") == 1
    assert public_matrix.count("            expected-python-minor: '11'\n") == 1
    assert public_matrix.count("            python-version: '3.14.8'\n") == 1
    assert public_matrix.count("            expected-python-minor: '14'\n") == 1
    assert public_matrix.count("            wheel-key: linuxWheel\n") == 2
    assert "macos" not in public_matrix

    assert "python -m build --wheel --sdist --no-isolation python" in workflow
    assert "--rebuilt-wheel-directory" in workflow
    assert '"$RUNNER_TEMP/umf-installed-direct/bin/python" -m pip install' in workflow
    assert (
        '"$RUNNER_TEMP/umf-installed-sdist-rebuilt/bin/python" -m pip install'
        in workflow
    )
    assert producer_workflow.count("id: direct_installed_tests") == 1
    assert producer_workflow.count("id: rebuilt_installed_tests") == 1
    assert producer_workflow.count("python/tests/test_action_fixture_vectors.py") == 2
    for step_id in ("direct_installed_tests", "rebuilt_installed_tests"):
        step_marker = f"id: {step_id}"
        step_index = producer_workflow.index(step_marker)
        step_start = producer_workflow.rfind("      - name:", 0, step_index)
        next_step = producer_workflow.find("\n      - name:", step_index)
        step_end = len(producer_workflow) if next_step < 0 else next_step
        assert step_start >= 0
        assert producer_workflow[step_start:step_end].count(
            "python/tests/test_action_fixture_vectors.py"
        ) == 1
    assert 'counts["tests"] == 254' in producer_workflow
    assert 'counts["errors"] == 0' in producer_workflow
    assert 'counts["failures"] == 0' in producer_workflow
    assert 'counts["skipped"] == 0' in producer_workflow
    assert 'receipt.get("source_payload_verification") == "passed"' in producer_workflow
    assert '"native_byte_identity"' in producer_workflow
    assert 'counts["tests"] == 254' in selected_workflow
    assert 'counts["errors"] == 0' in selected_workflow
    assert 'counts["failures"] == 0' in selected_workflow
    assert 'counts["skipped"] == 0' in selected_workflow
    assert 'counts["tests"] == 254' in public_job
    assert 'counts["errors"] == 0' in public_job
    assert 'counts["failures"] == 0' in public_job
    assert 'counts["skipped"] == 0' in public_job
    assert '"linuxWheel", "macosWheel", "sdist"' in public_job
    assert 'assets["macosWheel"]["filename"] != "umf_core-0.10.3-cp311-abi3-macosx_11_0_arm64.whl"' in public_job

    for section, total_seconds in (
        (producer_workflow, 1800),
        (selected_workflow, 1200),
    ):
        assert f'"totalSeconds": {total_seconds}' in section
        assert '"cleanupReserveSeconds": 60' in section
        assert '"timeoutKillGraceSeconds": 10' in section
        assert '"drainMarginSeconds": 2' in section
        assert '"childSeconds": 180' in section
        assert '"aggregateLogBytes": 1048576' in section
        assert '"artifactBytes": 16777216' in section
    assert '"totalSeconds": 1200' in public_job
    assert '"cleanupReserveSeconds": 60' in public_job
    assert '"timeoutKillGraceSeconds": 10' in public_job
    assert '"drainMarginSeconds": 2' in public_job
    assert '"childSeconds": 180' in public_job
    assert '"aggregateLogBytes": 1048576' in public_job
    assert '"artifactBytes": 16777216' in public_job
    assert "--no-index --no-deps --only-binary=:all:" in selected_workflow
    assert "--no-index --no-deps --only-binary=:all:" in public_job
    assert (
        'installed_artifacts.get("direct", {}).get("qualification") == "passed"'
        in workflow
    )
    assert (
        'installed_artifacts.get("sdist_rebuilt", {}).get("qualification") == "passed"'
        in workflow
    )
    assert 'receipt["native_byte_identity"]' in workflow
    assert (
        "Native bytes differ; each artifact requires independent qualification, and binary equivalence is not claimed."
        in workflow
    )
    assert "umf-sdist-rebuilt/*.whl" in workflow


def _retained_producer_api_fixture(verifier):
    producer = {
        "sourceCommit": verifier.RETAINED_SOURCE_COMMIT,
        "sourceTree": verifier.RETAINED_SOURCE_TREE,
        "workflowPath": ".github/workflows/python-action-runtime.yml",
        "event": "workflow_dispatch",
        "headBranch": "codex/core-python314-generation",
        "workflowRunId": verifier.RETAINED_RUN_ID,
        "workflowRunAttempt": verifier.RETAINED_RUN_ATTEMPT,
        "retainedBuild": verifier.retained_policy_packet(),
    }
    run = {
        "id": verifier.RETAINED_RUN_ID,
        "run_attempt": verifier.RETAINED_RUN_ATTEMPT,
        "head_sha": verifier.RETAINED_SOURCE_COMMIT,
        "head_branch": "codex/core-python314-generation",
        "event": "workflow_dispatch",
        "path": ".github/workflows/python-action-runtime.yml",
        "status": "completed",
        "conclusion": "cancelled",
    }
    jobs = [
        {
            "id": row["id"],
            "run_id": verifier.RETAINED_RUN_ID,
            "name": row["name"],
            "status": row["status"],
            "conclusion": row["conclusion"],
            "run_attempt": verifier.RETAINED_RUN_ATTEMPT,
            "head_sha": verifier.RETAINED_SOURCE_COMMIT,
            "head_branch": "codex/core-python314-generation",
        }
        for row in producer["retainedBuild"]["jobs"]
    ]
    artifacts = [
        {
            "id": row["id"],
            "name": row["name"],
            "size_in_bytes": row["sizeBytes"],
            "digest": "sha256:" + row["sha256"],
            "expired": False,
            "workflow_run": {
                "id": verifier.RETAINED_RUN_ID,
                "head_sha": verifier.RETAINED_SOURCE_COMMIT,
                "head_branch": "codex/core-python314-generation",
            },
        }
        for row in producer["retainedBuild"]["artifacts"]
    ]
    return producer, run, {"total_count": len(jobs), "jobs": jobs}, {"artifacts": artifacts}


def test_retained_s34_producer_policy_accepts_only_exact_three_cell_coverage():
    verifier = _core_public_producer_verifier()
    producer, run, jobs, artifacts = _retained_producer_api_fixture(verifier)
    validated_jobs, validated_artifacts = verifier.validate_retained_identity(
        producer,
        run,
        jobs,
        artifacts,
        run_id=verifier.RETAINED_RUN_ID,
        attempt=verifier.RETAINED_RUN_ATTEMPT,
        commit=verifier.RETAINED_SOURCE_COMMIT,
        tree=verifier.RETAINED_SOURCE_TREE,
    )
    assert len(validated_jobs) == 6
    assert len(validated_artifacts) == 7
    assert producer["retainedBuild"]["coverage"]["qualifiedSelectedCells"] == [
        "linux-x86_64-py11",
        "linux-x86_64-py14",
        "macos-arm64-py11",
    ]
    assert producer["retainedBuild"]["coverage"]["macosPython314"] == "unqualified"


@pytest.mark.parametrize(
    "mutation",
    (
        "wrong-run",
        "wrong-attempt",
        "wrong-source",
        "wrong-tree",
        "wrong-run-event",
        "wrong-run-path",
        "wrong-job-run",
        "wrong-job-source",
        "wrong-job-branch",
        "other-cancelled-job",
        "cancelled-macos11",
        "wrong-job-attempt",
        "missing-job",
        "extra-job",
        "duplicate-job",
        "missing-artifact",
        "extra-artifact",
        "wrong-artifact-id",
        "wrong-artifact-size",
        "expired-artifact",
        "wrong-artifact-digest",
        "wrong-artifact-source",
    ),
)
def test_retained_s34_producer_policy_refuses_identity_or_roster_changes(mutation):
    verifier = _core_public_producer_verifier()
    producer, run, jobs, artifacts = _retained_producer_api_fixture(verifier)
    run_id = verifier.RETAINED_RUN_ID
    attempt = verifier.RETAINED_RUN_ATTEMPT
    commit = verifier.RETAINED_SOURCE_COMMIT
    tree = verifier.RETAINED_SOURCE_TREE
    if mutation == "wrong-run":
        run["id"] += 1
    elif mutation == "wrong-attempt":
        attempt += 1
    elif mutation == "wrong-source":
        commit = "0" * 40
        run["head_sha"] = commit
    elif mutation == "wrong-tree":
        tree = "0" * 40
    elif mutation == "wrong-run-event":
        run["event"] = "push"
    elif mutation == "wrong-run-path":
        run["path"] = ".github/workflows/other.yml"
    elif mutation == "wrong-job-run":
        jobs["jobs"][0]["run_id"] += 1
    elif mutation == "wrong-job-source":
        jobs["jobs"][0]["head_sha"] = "0" * 40
    elif mutation == "wrong-job-branch":
        jobs["jobs"][0]["head_branch"] = "other-branch"
    elif mutation == "other-cancelled-job":
        jobs["jobs"][-1]["conclusion"] = "success"
        jobs["jobs"][0]["conclusion"] = "cancelled"
    elif mutation == "cancelled-macos11":
        jobs["jobs"][4]["conclusion"] = "cancelled"
        jobs["jobs"][5]["conclusion"] = "success"
    elif mutation == "wrong-job-attempt":
        jobs["jobs"][0]["run_attempt"] += 1
    elif mutation == "missing-job":
        jobs["jobs"].pop()
        jobs["total_count"] -= 1
    elif mutation == "extra-job":
        jobs["jobs"].append(dict(jobs["jobs"][0], id=999999999))
        jobs["total_count"] += 1
    elif mutation == "duplicate-job":
        jobs["jobs"].append(dict(jobs["jobs"][0]))
        jobs["total_count"] += 1
    elif mutation == "missing-artifact":
        artifacts["artifacts"].pop()
    elif mutation == "extra-artifact":
        artifacts["artifacts"].append(dict(artifacts["artifacts"][0]))
    elif mutation == "wrong-artifact-id":
        artifacts["artifacts"][0]["id"] += 1
    elif mutation == "wrong-artifact-size":
        artifacts["artifacts"][0]["size_in_bytes"] += 1
    elif mutation == "expired-artifact":
        artifacts["artifacts"][0]["expired"] = True
    elif mutation == "wrong-artifact-digest":
        artifacts["artifacts"][0]["digest"] = "sha256:" + "0" * 64
    elif mutation == "wrong-artifact-source":
        artifacts["artifacts"][0]["workflow_run"]["head_sha"] = "0" * 40

    with pytest.raises(ValueError):
        verifier.validate_retained_identity(
            producer,
            run,
            jobs,
            artifacts,
            run_id=run_id,
            attempt=attempt,
            commit=commit,
            tree=tree,
        )


def _retained_installed_cell_receipt_fixture(verifier):
    return {
        "cohort": "linux-x86_64",
        "commonSdistSha256": "61b3e12a84f68f890fa34e2da14bbda47e101b7c6eadd5207680827e8daa694c",
        "expectedNativeSha256": "c51b511a06bc1ccde6cc2208d33a4fb70ef66c67507ba8f2a6ea05fd2543cf57",
        "expectedWheelSha256": "cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75",
        "installedPayload": {
            "all_files_inside_platlib": True,
            "distribution_version": "0.10.3",
            "installed_file_count": 43,
            "native_sha256": "c51b511a06bc1ccde6cc2208d33a4fb70ef66c67507ba8f2a6ea05fd2543cf57",
            "package_file_count": 34,
            "status": "passed",
            "wheel_sha256": "cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75",
        },
        "platform": "linux",
        "postTestPayload": {
            "all_files_inside_platlib": True,
            "distribution_version": "0.10.3",
            "installed_file_count": 43,
            "native_sha256": "c51b511a06bc1ccde6cc2208d33a4fb70ef66c67507ba8f2a6ea05fd2543cf57",
            "package_file_count": 34,
            "status": "passed",
            "wheel_sha256": "cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75",
        },
        "probeOutcome": "success",
        "profile": "umf.core-python314-installed-release-cell/1",
        "requestedPython": "3.11.17",
        "runtimeProbes": {
            "documentRoundTrips": {"json": True, "yaml": True},
            "machine": "x86_64",
            "profile314Probes": {},
            "pydanticCoreVersion": "2.50.1",
            "pydanticVersion": "2.14.1",
            "python": "3.11.17",
            "semanticCoreVersion": "0.10.0",
            "umfVersion": "0.10.3",
        },
        "selectedWheelSha256": "cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75",
        "sourceRevision": verifier.RETAINED_SOURCE_COMMIT,
        "status": "passed",
        "testCounts": {"errors": 0, "failures": 0, "skipped": 0, "tests": 254},
        "testOutcome": "success",
    }


def test_retained_installed_cell_accepts_actual_posttest_receipt_shape():
    verifier = _core_public_producer_verifier()
    receipt = _retained_installed_cell_receipt_fixture(verifier)
    assert "posttestOutcome" not in receipt
    verifier.validate_retained_cell_receipt(
        receipt,
        cohort="linux-x86_64",
        minor="11",
        expected_python="3.11.17",
        wheel_sha256="cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75",
        native_sha256="c51b511a06bc1ccde6cc2208d33a4fb70ef66c67507ba8f2a6ea05fd2543cf57",
        sdist_sha256="61b3e12a84f68f890fa34e2da14bbda47e101b7c6eadd5207680827e8daa694c",
    )


@pytest.mark.parametrize(
    "mutation",
    (
        "count253",
        "skip1",
        "missing-post-payload",
        "wrong-post-wheel",
        "wrong-post-native",
        "changed-post-count",
        "wrong-runtime-probe",
        "failed-test",
    ),
)
def test_retained_installed_cell_rejects_incomplete_actual_receipt(mutation):
    verifier = _core_public_producer_verifier()
    receipt = _retained_installed_cell_receipt_fixture(verifier)
    if mutation == "count253":
        receipt["testCounts"]["tests"] = 253
    elif mutation == "skip1":
        receipt["testCounts"]["skipped"] = 1
    elif mutation == "missing-post-payload":
        receipt.pop("postTestPayload")
    elif mutation == "wrong-post-wheel":
        receipt["postTestPayload"]["wheel_sha256"] = "0" * 64
    elif mutation == "wrong-post-native":
        receipt["postTestPayload"]["native_sha256"] = "0" * 64
    elif mutation == "changed-post-count":
        receipt["postTestPayload"]["package_file_count"] += 1
    elif mutation == "wrong-runtime-probe":
        receipt["runtimeProbes"]["semanticCoreVersion"] = "0.10.3"
    elif mutation == "failed-test":
        receipt["testOutcome"] = "failure"

    with pytest.raises(ValueError):
        verifier.validate_retained_cell_receipt(
            receipt,
            cohort="linux-x86_64",
            minor="11",
            expected_python="3.11.17",
            wheel_sha256="cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75",
            native_sha256="c51b511a06bc1ccde6cc2208d33a4fb70ef66c67507ba8f2a6ea05fd2543cf57",
            sdist_sha256="61b3e12a84f68f890fa34e2da14bbda47e101b7c6eadd5207680827e8daa694c",
        )


def test_retained_sdist_source_delta_allows_only_the_distribution_test_path():
    verifier = _core_public_release_verifier()
    producer = {"tests/test_distribution_artifact.py": "a" * 64, "src/umf/core.py": "b" * 64}
    release = {"tests/test_distribution_artifact.py": "c" * 64, "src/umf/core.py": "b" * 64}
    assert verifier._single_test_source_delta(producer, release) == {
        "tests/test_distribution_artifact.py"
    }
    release["src/umf/core.py"] = "d" * 64
    with pytest.raises(ValueError, match="outside the one reviewed test-only path"):
        verifier._single_test_source_delta(producer, release)
    with pytest.raises(ValueError, match="identical path sets"):
        verifier._single_test_source_delta(producer, {**producer, "extra.py": "e" * 64})


def test_retained_source_correspondence_refuses_held_final_identity():
    verifier = _core_public_release_verifier()
    correspondence = {
        "profile": verifier.RETAINED_SOURCE_PROFILE,
        "archiveFileCount": 531,
        "producerMapSha256": verifier.RETAINED_SOURCE_MAP_SHA256,
        "releaseMapSha256": "HELD",
        "testPath": verifier.RETAINED_TEST_PATH,
        "producerTestSha256": verifier.RETAINED_TEST_OLD_SHA256,
        "releaseTestSha256": "HELD",
    }
    with pytest.raises(ValueError, match="held or malformed"):
        verifier.validate_source_map_delta({}, {}, {}, {}, correspondence)


def test_retained_sdist_rejects_oversized_pkg_info_before_reading_payload(monkeypatch):
    verifier = _core_public_release_verifier()
    archive_bytes = io.BytesIO()
    payload = b"x" * (verifier.PKG_INFO_LIMIT + 1)
    with tarfile.open(fileobj=archive_bytes, mode="w:gz") as archive:
        member = tarfile.TarInfo("umf_core-0.10.3/PKG-INFO")
        member.size = len(payload)
        archive.addfile(member, io.BytesIO(payload))

    def unexpected_payload_read(*_args, **_kwargs):
        raise AssertionError("oversized PKG-INFO payload was read before its declared-size refusal")

    monkeypatch.setattr(tarfile.TarFile, "extractfile", unexpected_payload_read)
    with pytest.raises(ValueError, match="PKG-INFO exceeds one MiB"):
        verifier.source_archive_data(archive_bytes.getvalue())


def test_retained_source_map_rejects_noncanonical_paths():
    verifier = _core_public_release_verifier()
    for path in ("../escape", "/absolute", "a\\b", "./normalized"):
        with pytest.raises(ValueError, match="noncanonical path"):
            verifier._canonical_source_map({path: "a" * 64})


@pytest.fixture(scope="module")
def retained_sdist_source_fixture():
    verifier = _core_public_release_verifier()
    repository = Path(__file__).resolve().parents[2]
    helper_path = repository / "tools/_python_sdist.py"
    spec = importlib.util.spec_from_file_location(
        "umf_test_retained_sdist_inventory", helper_path
    )
    assert spec is not None and spec.loader is not None
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)

    release_files = helper._source_inventory(repository)
    assert release_files[verifier.RETAINED_TEST_PATH] != verifier.RETAINED_TEST_OLD_SHA256
    release_files["PKG-INFO"] = (
        "aa760d74b8bc9a535520613f5d2788c50f5aed9ca5b3b59fbd941b9711d29b93"
    )
    producer_files = dict(release_files)
    producer_files[verifier.RETAINED_TEST_PATH] = verifier.RETAINED_TEST_OLD_SHA256
    manifest_digest = hashlib.sha256(
        json.dumps(
            producer_files, sort_keys=True, separators=(",", ":"), ensure_ascii=True
        ).encode("ascii")
    ).hexdigest()
    assert len(release_files) == 531
    assert manifest_digest == verifier.RETAINED_SOURCE_MAP_SHA256
    manifest = {
        "schema": "umf.python-sdist-build-inputs/1",
        "file_count": len(producer_files),
        "sha256": manifest_digest,
        "files": producer_files,
    }
    release_map_digest = hashlib.sha256(
        json.dumps(
            release_files, sort_keys=True, separators=(",", ":"), ensure_ascii=True
        ).encode("ascii")
    ).hexdigest()
    correspondence = {
        "profile": verifier.RETAINED_SOURCE_PROFILE,
        "archiveFileCount": 531,
        "producerMapSha256": verifier.RETAINED_SOURCE_MAP_SHA256,
        "releaseMapSha256": release_map_digest,
        "testPath": verifier.RETAINED_TEST_PATH,
        "producerTestSha256": verifier.RETAINED_TEST_OLD_SHA256,
        "releaseTestSha256": release_files[verifier.RETAINED_TEST_PATH],
    }
    return {
        "verifier": verifier,
        "producerFiles": producer_files,
        "releaseFiles": release_files,
        "manifest": manifest,
        "correspondence": correspondence,
    }


def test_retained_source_map_validates_full_531_file_archive_and_exact_m_delta(
    retained_sdist_source_fixture,
):
    fixture = retained_sdist_source_fixture
    result = fixture["verifier"].validate_source_map_delta(
        fixture["manifest"],
        fixture["producerFiles"],
        fixture["producerFiles"],
        fixture["releaseFiles"],
        fixture["correspondence"],
    )
    assert result == fixture["correspondence"]


@pytest.mark.parametrize(
    "mutation",
    (
        "archive-digest",
        "archive-missing",
        "archive-extra",
        "producer-projection",
        "m-runtime",
        "m-cargo",
        "m-schema",
        "m-build-hook",
        "m-resource",
        "m-added",
        "m-deleted",
        "wrong-test-old",
        "wrong-test-new",
        "missing-test-delta",
        "malformed-map-path",
        "wrong-map-digest",
        "extra-correspondence-field",
    ),
)
def test_retained_source_map_refuses_any_unreviewed_path_or_byte_change(
    retained_sdist_source_fixture, mutation
):
    fixture = retained_sdist_source_fixture
    verifier = fixture["verifier"]
    producer = dict(fixture["producerFiles"])
    archive = dict(fixture["producerFiles"])
    release = dict(fixture["releaseFiles"])
    correspondence = dict(fixture["correspondence"])
    manifest = {
        **fixture["manifest"],
        "files": dict(producer),
    }
    if mutation == "archive-digest":
        archive["Cargo.toml"] = "0" * 64
    elif mutation == "archive-missing":
        archive.pop("Cargo.toml")
    elif mutation == "archive-extra":
        archive["unreviewed.txt"] = "0" * 64
    elif mutation == "producer-projection":
        producer["Cargo.lock"] = "0" * 64
    elif mutation in {
        "m-runtime", "m-cargo", "m-schema", "m-build-hook", "m-resource"
    }:
        path = {
            "m-runtime": "src/umf/action_runtime.py",
            "m-cargo": "Cargo.toml",
            "m-schema": "spec/core/schema.json",
            "m-build-hook": "hatch_build.py",
            "m-resource": "src/umf/action_runtime_resource_manifest.json",
        }[mutation]
        assert path in release
        release[path] = "0" * 64
    elif mutation == "m-added":
        release["unreviewed.txt"] = "0" * 64
    elif mutation == "m-deleted":
        release.pop("Cargo.toml")
    elif mutation == "wrong-test-old":
        producer[verifier.RETAINED_TEST_PATH] = "0" * 64
        manifest["files"] = producer
    elif mutation == "wrong-test-new":
        correspondence["releaseTestSha256"] = "0" * 64
    elif mutation == "missing-test-delta":
        release[verifier.RETAINED_TEST_PATH] = verifier.RETAINED_TEST_OLD_SHA256
        correspondence["releaseTestSha256"] = verifier.RETAINED_TEST_OLD_SHA256
        correspondence["releaseMapSha256"] = verifier._canonical_source_map(release)["sha256"]
    elif mutation == "malformed-map-path":
        producer["../escape"] = "0" * 64
        manifest["files"] = producer
        manifest["file_count"] += 1
    elif mutation == "wrong-map-digest":
        correspondence["releaseMapSha256"] = "0" * 64
    elif mutation == "extra-correspondence-field":
        correspondence["ignoredPaths"] = []

    with pytest.raises(ValueError):
        verifier.validate_source_map_delta(
            manifest,
            archive,
            producer,
            release,
            correspondence,
        )


def test_retained_source_projections_refuse_altered_helper_before_import(tmp_path):
    verifier = _core_public_release_verifier()
    original = (Path(__file__).resolve().parents[2] / "tools/_python_sdist.py").read_bytes()
    producer_helper = tmp_path / "producer/tools/_python_sdist.py"
    release_helper = tmp_path / "release/tools/_python_sdist.py"
    producer_helper.parent.mkdir(parents=True)
    release_helper.parent.mkdir(parents=True)
    producer_helper.write_bytes(original)
    release_helper.write_bytes(original + b"\nnot valid python\n")

    with pytest.raises(ValueError, match="fixed reviewed digest"):
        verifier._retained_source_projections(
            producer_helper.parents[1], release_helper.parents[1], b"PKG-INFO"
        )


def test_retained_producer_cell_summary_binds_exact_three_selected_receipts():
    verifier = _core_public_release_verifier()
    selected = {
        "linux-x86_64": {
            "wheelSha256": "a" * 64,
            "nativeSha256": "b" * 64,
            "sdistSha256": "c" * 64,
        },
        "macos-arm64": {
            "wheelSha256": "d" * 64,
            "nativeSha256": "e" * 64,
            "sdistSha256": "c" * 64,
        },
    }
    cells = []
    for artifact, cohort, minor, python_version in verifier.RETAINED_CELLS:
        source = selected[cohort]
        probes = {
            "python": python_version,
            "machine": "x86_64" if cohort == "linux-x86_64" else "arm64",
            "umfVersion": "0.10.3",
            "semanticCoreVersion": "0.10.0",
            "pydanticVersion": "2.14.1",
            "pydanticCoreVersion": "2.50.1",
            "documentRoundTrips": {"json": True, "yaml": True},
        }
        if minor == "14":
            probes["profile314Probes"] = {
                "strictEndAnchor": True,
                "emptyInputNonBoundary": True,
                "unicode16Word": True,
                "futureProfileRefused": True,
            }
        cells.append(
            {
                "artifact": artifact,
                "sha256": "f" * 64,
                "cohort": cohort,
                "pythonMinor": minor,
                "selectedWheelSha256": source["wheelSha256"],
                "nativeSha256": source["nativeSha256"],
                "commonSdistSha256": source["sdistSha256"],
                "testCounts": {"tests": 254, "errors": 0, "failures": 0, "skipped": 0},
                "runtimeProbes": probes,
            }
        )

    verifier.validate_retained_cells(cells, selected)
    cells[2]["artifact"] = "umf-core-0.10.3-installed-macos-arm64-py14"
    with pytest.raises(ValueError, match="exact three-cell subset"):
        verifier.validate_retained_cells(cells, selected)


def _finalizer_source(workflow: str) -> str:
    marker = 'python - "$GITHUB_WORKSPACE/tools/verify_python_artifacts.py" "$RUNNER_TEMP/umf-artifact-payload.json"'
    start = workflow.index(marker)
    block = workflow[start:]
    match = re.search(r"<<'PY'\n(.*?)^\s*PY\s*$", block, re.MULTILINE | re.DOTALL)
    assert match is not None
    return textwrap.dedent(match.group(1))


def _write_finalizer_inputs(
    root: Path,
    *,
    missing_rebuilt_tests: bool = False,
    missing_rebuilt_posttest: bool = False,
    malformed_source_map: bool = False,
    junit_failure: tuple[str, int, int] | None = None,
) -> None:
    direct = {
        "filename": "umf_core-0.10.3-cp311-abi3-macosx_11_0_arm64.whl",
        "sha256": "a" * 64,
        "version": "0.10.3",
        "tag": "cp311-abi3-macosx_11_0_arm64",
        "package_file_count": 14,
        "native_sha256": "b" * 64,
        "native_platform": {
            "format": "thin-64-bit-macho",
            "machine": "arm64",
            "version_command": "LC_BUILD_VERSION",
            "minimum_os": "11.0.0",
        },
    }
    rebuilt = {
        **direct,
        "filename": "umf_core-0.10.3-cp311-abi3-macosx_11_0_arm64.whl",
        "sha256": "c" * 64,
        "native_sha256": "d" * 64,
    }
    receipt = {
        "schema": "umf.python-artifact-qualification/1",
        "source_payload_verification": "passed",
        "distribution_version": "0.10.3",
        "semantic_core_version": "0.10.0",
        "action_runtime_resource_count": 9,
        "artifacts": {"direct": direct, "sdist_rebuilt": rebuilt},
        "sdist_rebuild": {
            "non_native_package_payload_matches": True,
            "version_matches": True,
            "tag_matches": True,
            "metadata_byte_identity": True,
            "wheel_byte_identity": True,
            "native_byte_identity": False,
        },
        "sdist_build_inputs": {
            "schema": "umf.python-sdist-build-inputs/1",
            "file_count": 521,
            "sha256": ("z" if malformed_source_map else "f") * 64,
        },
        "sdist_helper_sha256": "81ce3ed420fce370ae9440d2994413d11e3b3838aa0e3eb9c32df8594f2d6b7e",
        "native_platform_helper_sha256": "5856eb375d176af7671ad22981d983a14cec24663e3a8bc466446b433c2cd7b1",
    }
    (root / "umf-artifact-payload.json").write_text(
        json.dumps(receipt), encoding="utf-8"
    )
    for name, artifact in (("direct", direct), ("sdist-rebuilt", rebuilt)):
        (root / f"umf-install-{name}.json").write_text(
            json.dumps(
                {
                    "installed_inside_environment": True,
                    "distribution_version": "0.10.3",
                    "semantic_core_version": "0.10.0",
                }
            ),
            encoding="utf-8",
        )
        (root / f"umf-installed-{name}-payload.json").write_text(
            json.dumps(
                {
                    "status": "passed",
                    "wheel_sha256": artifact["sha256"],
                    "native_sha256": artifact["native_sha256"],
                    "package_file_count": artifact["package_file_count"],
                }
            ),
            encoding="utf-8",
        )
        if not (missing_rebuilt_posttest and name == "sdist-rebuilt"):
            (root / f"umf-installed-{name}-posttest.json").write_text(
                json.dumps(
                    {
                        "status": "passed",
                        "wheel_sha256": artifact["sha256"],
                        "native_sha256": artifact["native_sha256"],
                        "package_file_count": artifact["package_file_count"],
                    }
                ),
                encoding="utf-8",
            )
    def junit_for(role: str) -> str:
        tests, skipped = (254, 0)
        if junit_failure is not None and junit_failure[0] == role:
            _, tests, skipped = junit_failure
        return (
            f'<testsuite tests="{tests}" errors="0" failures="0" '
            f'skipped="{skipped}" />\n'
        )

    (root / "umf-direct-action-tests.xml").write_text(
        junit_for("direct"), encoding="utf-8"
    )
    if not missing_rebuilt_tests:
        (root / "umf-sdist-rebuilt-action-tests.xml").write_text(
            junit_for("sdist-rebuilt"), encoding="utf-8"
        )


@pytest.mark.parametrize(
    (
        "missing_rebuilt_tests",
        "missing_rebuilt_posttest",
        "malformed_source_map",
        "junit_failure",
    ),
    (
        (False, False, False, None),
        (True, False, False, None),
        (False, True, False, None),
        (False, False, True, None),
        (False, False, False, ("direct", 253, 0)),
        (False, False, False, ("direct", 254, 1)),
        (False, False, False, ("sdist-rebuilt", 253, 0)),
        (False, False, False, ("sdist-rebuilt", 254, 1)),
    ),
)
def test_workflow_finalizer_requires_positive_installed_proof_for_both_wheels(
    tmp_path,
    missing_rebuilt_tests,
    missing_rebuilt_posttest,
    malformed_source_map,
    junit_failure,
):
    workflow_path = (
        Path(__file__).resolve().parents[2]
        / ".github/workflows/python-action-runtime.yml"
    )
    workflow = workflow_path.read_text(encoding="utf-8")
    finalizer = _finalizer_source(workflow)
    _write_finalizer_inputs(
        tmp_path,
        missing_rebuilt_tests=missing_rebuilt_tests,
        missing_rebuilt_posttest=missing_rebuilt_posttest,
        malformed_source_map=malformed_source_map,
        junit_failure=junit_failure,
    )
    output = tmp_path / "umf-qualification.json"
    environment = {
        **os.environ,
        "COHORT": "macos-arm64",
        "SOURCE_REVISION": "e" * 40,
        "RUN_ID": "123",
        "RUN_ATTEMPT": "1",
        "RUNNER_TEMP": str(tmp_path),
        "DIRECT_TEST_OUTCOME": "success",
        "SDIST_REBUILT_TEST_OUTCOME": "success",
    }

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            finalizer,
            str(workflow_path.parents[2] / "tools/verify_python_artifacts.py"),
            str(tmp_path / "umf-artifact-payload.json"),
            str(tmp_path / "umf-rustc-version.txt"),
            str(tmp_path / "umf-cargo-version.txt"),
            str(output),
        ],
        check=False,
        capture_output=True,
        text=True,
        env=environment,
    )

    assert output.is_file(), result.stderr
    receipt = json.loads(output.read_text(encoding="utf-8"))
    incomplete = (
        missing_rebuilt_tests
        or missing_rebuilt_posttest
        or malformed_source_map
        or junit_failure is not None
    )
    expected = "failed_or_incomplete" if incomplete else "passed"
    assert receipt["installed_qualification"] == expected
    assert receipt["native_byte_identity"] is False
    direct_expected = (
        "failed_or_incomplete"
        if junit_failure is not None and junit_failure[0] == "direct"
        else "passed"
    )
    assert (
        receipt["installed_artifacts"]["direct"]["qualification"]
        == direct_expected
    )
    rebuilt_expected = (
        "failed_or_incomplete"
        if missing_rebuilt_tests
        or missing_rebuilt_posttest
        or (junit_failure is not None and junit_failure[0] == "sdist-rebuilt")
        else "passed"
    )
    assert (
        receipt["installed_artifacts"]["sdist_rebuilt"]["qualification"]
        == rebuilt_expected
    )
    if incomplete:
        assert result.returncode != 0
    else:
        assert result.returncode == 0


def test_sdist_licenses_have_one_declared_inclusion_route():
    repository = Path(__file__).resolve().parents[2]
    project = tomllib.loads(
        (repository / "python/pyproject.toml").read_text(encoding="utf-8")
    )
    tree = ast.parse((repository / "python/hatch_build.py").read_text(encoding="utf-8"))
    source_files = next(
        ast.literal_eval(node.value)
        for node in tree.body
        if isinstance(node, ast.Assign)
        and any(
            isinstance(target, ast.Name) and target.id == "SDIST_SOURCE_FILES"
            for target in node.targets
        )
    )
    licenses = set(project["project"]["license-files"])

    assert licenses == {"LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE"}
    assert not licenses.intersection(source_files)
    force_include = project["tool"]["hatch"]["build"]["targets"]["sdist"][
        "force-include"
    ]
    assert "_native_platform.py" not in force_include
    assert (repository / "python/_native_platform.py").is_file()


def test_python_distribution_metadata_admits_only_declared_minors(tmp_path):
    repository = Path(__file__).resolve().parents[2]
    project = tomllib.loads(
        (repository / "python/pyproject.toml").read_text(encoding="utf-8")
    )
    declared = SpecifierSet(project["project"]["requires-python"])
    assert declared == SpecifierSet(">=3.11,<3.15")
    assert all(declared.contains(f"3.{minor}") for minor in (11, 12, 13, 14))
    assert not declared.contains("3.10")
    assert not declared.contains("3.15")

    wheel = _wheel(
        tmp_path / "metadata-range-fixture.whl",
        {"umf/__init__.py": b"__version__ = '0.10.3'\n"},
    )
    with zipfile.ZipFile(wheel) as archive:
        metadata_name = next(
            name for name in archive.namelist() if name.endswith(".dist-info/METADATA")
        )
        wheel_metadata = Parser().parsestr(archive.read(metadata_name).decode("utf-8"))
    assert SpecifierSet(wheel_metadata["Requires-Python"]) == declared


def test_python_support_tests_install_the_hatch_build_backend():
    repository = Path(__file__).resolve().parents[2]
    project = tomllib.loads(
        (repository / "python/pyproject.toml").read_text(encoding="utf-8")
    )
    workflow = (repository / ".github/workflows/python.yml").read_text(encoding="utf-8")

    assert "hatchling>=1.27,<2" in project["dependency-groups"]["dev"]
    assert "'hatchling>=1.27,<2'" in workflow


def test_sdist_extraction_rejects_parent_traversal(tmp_path):
    verifier = _verifier()
    archive_path = tmp_path / "unsafe.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        member = tarfile.TarInfo("../outside.txt")
        member.size = 1
        archive.addfile(member, io.BytesIO(b"x"))

    with pytest.raises(ValueError, match="unsafe member path"):
        verifier._extract_sdist(archive_path, tmp_path / "extract")
    assert not (tmp_path / "outside.txt").exists()


def test_sdist_extraction_selects_the_single_top_level_project_with_nested_projects(
    tmp_path,
):
    verifier = _verifier()
    archive_path = tmp_path / "source.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        for name in (
            "umf_core-0.10.3/",
            "umf_core-0.10.3/nested/",
        ):
            member = tarfile.TarInfo(name)
            member.type = tarfile.DIRTYPE
            archive.addfile(member)
        files = {
            "umf_core-0.10.3/pyproject.toml": (
                b'[project]\nname = "umf-core"\nversion = "0.10.3"\n'
            ),
            "umf_core-0.10.3/nested/pyproject.toml": (
                b'[project]\nname = "nested-helper"\nversion = "1.0"\n'
            ),
        }
        for name, payload in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(payload)
            archive.addfile(member, io.BytesIO(payload))

    root = verifier._extract_sdist(
        archive_path, tmp_path / "source", expected_version="0.10.3"
    )

    assert root.name == "umf_core-0.10.3"
    assert (root / "nested/pyproject.toml").is_file()


@pytest.mark.parametrize(
    ("mutate", "version", "tag", "platform", "message"),
    [
        ("extra", "0.10.3", "cp311-abi3-linux_x86_64", "linux_x86_64", "payload"),
        ("record", "0.10.3", "cp311-abi3-linux_x86_64", "linux_x86_64", "RECORD"),
        (None, "0.10.0", "cp311-abi3-linux_x86_64", "linux_x86_64", "version"),
        (None, "0.10.3", "py3-none-any", "linux_x86_64", "abi3"),
        (None, "0.10.3", "cp311-abi3-linux_x86_64", "macos_arm64", "platform"),
    ],
)
def test_wheel_verifier_rejects_unexpected_payload_or_claim(
    tmp_path, mutate, version, tag, platform, message
):
    verifier = _verifier()
    package = {"umf/__init__.py": b"source"}
    expected_licenses = {
        name: b"license" for name in ("LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE")
    }
    wheel = _wheel(
        tmp_path / "invalid.whl",
        package,
        version=version,
        tag=tag,
        corrupt_record=mutate == "record",
    )
    if mutate == "extra":
        with zipfile.ZipFile(wheel, "a") as archive:
            archive.writestr("umf/unexpected.py", b"unexpected")
    with pytest.raises(ValueError, match=message):
        verifier._validate_wheel(wheel, package, expected_licenses, "0.10.3", platform)

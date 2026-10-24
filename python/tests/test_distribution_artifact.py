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
from pathlib import Path

import pytest


def _verifier():
    path = Path(__file__).resolve().parents[2] / "tools/verify_python_artifacts.py"
    spec = importlib.util.spec_from_file_location("umf_test_artifact_verifier", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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
    version="0.11.0",
    tag="cp311-abi3-linux_x86_64",
    native=b"native",
    cli=b"cli-native",
    include_cli=True,
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
            f"Metadata-Version: 2.3\nName: umf-core\nVersion: {version}\n{metadata_extra}"
        ).encode(),
        f"{dist_info}/WHEEL": (
            f"Wheel-Version: 1.0\nRoot-Is-Purelib: false\nTag: {tag}\n{wheel_extra}"
        ).encode(),
    }
    if include_cli:
        files[verifier.WINDOWS_CLI_MEMBER if "win" in tag else verifier.CLI_MEMBER] = cli
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


def test_generated_source_tree_binaries_are_not_canonical_payloads(tmp_path):
    verifier = _verifier()
    package_source = tmp_path / "umf"
    package_source.mkdir()
    (package_source / "__init__.py").write_bytes(b"source")
    (package_source / "_rust_core.abi3.so").write_bytes(b"stale extension")
    cli_dir = package_source / "_bin"
    cli_dir.mkdir()
    (cli_dir / "umf").write_bytes(b"stale cli")

    payloads = verifier._python_package_payloads(package_source)

    assert payloads == {"umf/__init__.py": b"source"}


def test_exact_wheel_payload_and_record_are_accepted(tmp_path):
    verifier = _verifier()
    package = {"umf/__init__.py": b"__version__ = '0.11.0'\n"}
    expected_licenses = {
        name: b"license" for name in ("LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE")
    }
    wheel = _wheel(tmp_path / "valid.whl", package)

    result = verifier._validate_wheel(
        wheel, package, expected_licenses, "0.11.0", "linux_x86_64"
    )

    assert result["version"] == "0.11.0"
    assert result["tag"] == "cp311-abi3-linux_x86_64"
    assert result["package_file_count"] == 3


def test_exact_wheel_requires_a_nonempty_cli_payload(tmp_path):
    verifier = _verifier()
    package = {"umf/__init__.py": b"source"}
    licenses = {
        name: b"license" for name in ("LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE")
    }
    wheel = _wheel(tmp_path / "empty-cli.whl", package, cli=b"")

    with pytest.raises(ValueError, match="native CLI is empty"):
        verifier._validate_wheel(wheel, package, licenses, "0.11.0", "linux_x86_64")


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
        cli=_macho(),
    )

    result = verifier._validate_wheel(
        wheel, package, expected_licenses, "0.11.0", "macos_arm64"
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
        cli=native,
    )

    with pytest.raises(ValueError, match=message):
        verifier._validate_wheel(wheel, package, licenses, "0.11.0", "macos_arm64")


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
    direct = _wheel(
        tmp_path / "direct.whl", package, native=b"native-direct", cli=b"cli-direct"
    )
    rebuilt = _wheel(
        tmp_path / "rebuilt.whl", package, native=b"native-rebuilt", cli=b"cli-rebuilt"
    )

    parity = verifier._compare_wheel_package_sources(direct, rebuilt)

    assert parity == {
        "non_native_package_payload_matches": True,
        "version_matches": True,
        "tag_matches": True,
        "metadata_byte_identity": True,
        "wheel_byte_identity": True,
        "native_byte_identity": False,
        "native_byte_identity_by_member": {
            "umf/_bin/umf": False,
            "umf/_rust_core.abi3.so": False,
        },
    }


@pytest.mark.parametrize(
    ("rebuilt_package", "version", "tag", "message"),
    [
        (
            {"umf/__init__.py": b"changed"},
            "0.11.0",
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
            "0.11.0",
            "cp311-abi3-linux_aarch64",
            "platform tag",
        ),
        (
            {"umf/__init__.py": b"source"},
            "0.11.0",
            "cp311-abi3-linux_x86_64",
            "wheel METADATA",
        ),
        (
            {"umf/__init__.py": b"source"},
            "0.11.0",
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
    package = {"umf/__init__.py": b"__version__ = '0.11.0'\n"}
    wheel = _wheel(tmp_path / "installed.whl", package)
    platlib = tmp_path / "site-packages"
    _install_wheel(wheel, platlib)

    result = verifier._validate_installed_wheel(wheel, platlib, "0.11.0")

    assert result["status"] == "passed"
    assert result["all_files_inside_platlib"] is True
    assert result["package_file_count"] == 3
    assert result["native_sha256"] == hashlib.sha256(b"native").hexdigest()
    assert result["cli_sha256"] == hashlib.sha256(b"cli-native").hexdigest()


def test_installed_wheel_requires_the_cli_in_the_package_closure(tmp_path):
    verifier = _verifier()
    package = {"umf/__init__.py": b"source"}
    wheel = _wheel(tmp_path / "missing-cli.whl", package, include_cli=False)
    platlib = tmp_path / "site-packages"
    _install_wheel(wheel, platlib)

    with pytest.raises(ValueError, match="package inventory"):
        verifier._validate_installed_wheel(wheel, platlib, "0.11.0")


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
        extra = platlib / "umf_core-0.11.0.dist-info/EXTRA"
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
        verifier._validate_installed_wheel(wheel, platlib, "0.11.0")


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

    assert "python-version: '3.11.17'" in workflow
    assert "python-version: '3.11.9'" in workflow
    assert "python -m build --wheel --sdist --no-isolation python" in workflow
    assert "--rebuilt-wheel-directory" in workflow
    assert '"$RUNNER_TEMP/umf-installed-direct/bin/python" -m pip install' in workflow
    assert (
        '"$RUNNER_TEMP/umf-installed-sdist-rebuilt/bin/python" -m pip install'
        in workflow
    )
    assert "id: direct_installed_tests" in workflow
    assert "id: rebuilt_installed_tests" in workflow
    assert workflow.count("python/tests/test_action_fixture_vectors.py") == 2
    assert 'counts["skipped"] == 0' in workflow
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
        "Extension or CLI bytes differ; each artifact requires independent qualification, and binary equivalence is not claimed."
        in workflow
    )
    assert "umf-sdist-rebuilt/*.whl" in workflow


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
) -> None:
    direct = {
        "filename": "umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl",
        "sha256": "a" * 64,
        "version": "0.11.0",
        "tag": "cp311-abi3-macosx_11_0_arm64",
        "package_file_count": 14,
        "native_sha256": "b" * 64,
        "cli_member": "umf/_bin/umf",
        "cli_sha256": "c" * 64,
        "cli_platform": {
            "format": "thin-64-bit-macho",
            "machine": "arm64",
            "version_command": "LC_BUILD_VERSION",
            "minimum_os": "11.0.0",
        },
        "native_platform": {
            "format": "thin-64-bit-macho",
            "machine": "arm64",
            "version_command": "LC_BUILD_VERSION",
            "minimum_os": "11.0.0",
        },
    }
    rebuilt = {
        **direct,
        "filename": "umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl",
        "sha256": "c" * 64,
        "native_sha256": "d" * 64,
        "cli_sha256": "e" * 64,
    }
    receipt = {
        "schema": "umf.python-artifact-qualification/1",
        "source_payload_verification": "passed",
        "distribution_version": "0.11.0",
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
            "native_byte_identity_by_member": {
                "umf/_bin/umf": False,
                "umf/_rust_core.abi3.so": False,
            },
        },
        "sdist_build_inputs": {
            "schema": "umf.python-sdist-build-inputs/1",
            "file_count": 521,
            "sha256": ("z" if malformed_source_map else "f") * 64,
        },
        "sdist_helper_sha256": "3416d6ac12a58ffece96efe35fd2cb47e89a5e909652e69fc09fcbb72675612a",
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
                    "distribution_version": "0.11.0",
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
                    "cli_sha256": artifact["cli_sha256"],
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
                    "cli_sha256": artifact["cli_sha256"],
                        "package_file_count": artifact["package_file_count"],
                    }
                ),
                encoding="utf-8",
            )
    junit = '<testsuite tests="1" errors="0" failures="0" skipped="0" />\n'
    (root / "umf-direct-action-tests.xml").write_text(junit, encoding="utf-8")
    if not missing_rebuilt_tests:
        (root / "umf-sdist-rebuilt-action-tests.xml").write_text(
            junit, encoding="utf-8"
        )


@pytest.mark.parametrize(
    ("missing_rebuilt_tests", "missing_rebuilt_posttest", "malformed_source_map"),
    (
        (False, False, False),
        (True, False, False),
        (False, True, False),
        (False, False, True),
    ),
)
def test_workflow_finalizer_requires_positive_installed_proof_for_both_wheels(
    tmp_path, missing_rebuilt_tests, missing_rebuilt_posttest, malformed_source_map
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
        missing_rebuilt_tests or missing_rebuilt_posttest or malformed_source_map
    )
    expected = "failed_or_incomplete" if incomplete else "passed"
    assert receipt["installed_qualification"] == expected
    assert receipt["native_byte_identity"] is False
    assert receipt["installed_artifacts"]["direct"]["qualification"] == "passed"
    rebuilt_expected = (
        "failed_or_incomplete"
        if missing_rebuilt_tests or missing_rebuilt_posttest
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
    assert licenses.issubset(set(source_files))
    force_include = project["tool"]["hatch"]["build"]["targets"]["sdist"][
        "force-include"
    ]
    assert "_native_platform.py" not in force_include
    assert (repository / "python/_native_platform.py").is_file()


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
            "umf_core-0.11.0/",
            "umf_core-0.11.0/nested/",
        ):
            member = tarfile.TarInfo(name)
            member.type = tarfile.DIRTYPE
            archive.addfile(member)
        files = {
            "umf_core-0.11.0/pyproject.toml": (
                b'[project]\nname = "umf-core"\nversion = "0.11.0"\n'
            ),
            "umf_core-0.11.0/nested/pyproject.toml": (
                b'[project]\nname = "nested-helper"\nversion = "1.0"\n'
            ),
        }
        for name, payload in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(payload)
            archive.addfile(member, io.BytesIO(payload))

    root = verifier._extract_sdist(archive_path, tmp_path / "source")

    assert root.name == "umf_core-0.11.0"
    assert (root / "nested/pyproject.toml").is_file()


@pytest.mark.parametrize(
    ("mutate", "version", "tag", "platform", "message"),
    [
        ("extra", "0.11.0", "cp311-abi3-linux_x86_64", "linux_x86_64", "payload"),
        ("record", "0.11.0", "cp311-abi3-linux_x86_64", "linux_x86_64", "RECORD"),
        (None, "0.10.0", "cp311-abi3-linux_x86_64", "linux_x86_64", "version"),
        (None, "0.11.0", "py3-none-any", "linux_x86_64", "abi3"),
        (None, "0.11.0", "cp311-abi3-linux_x86_64", "macos_arm64", "platform"),
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
        verifier._validate_wheel(wheel, package, expected_licenses, "0.11.0", platform)

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pure controls for the exact Python wheel artifact verifier."""

from __future__ import annotations

import ast
import base64
import csv
import hashlib
import importlib.util
import io
import tarfile
import tomllib
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


def _wheel(
    path,
    package,
    *,
    version="0.10.1",
    tag="cp311-abi3-linux_x86_64",
    corrupt_record=False,
):
    verifier = _verifier()
    dist_info = f"umf_core-{version}.dist-info"
    files = {
        **package,
        verifier.NATIVE_MEMBER: b"native",
        f"{dist_info}/METADATA": (
            f"Metadata-Version: 2.3\nName: umf-core\nVersion: {version}\n"
        ).encode(),
        f"{dist_info}/WHEEL": (
            f"Wheel-Version: 1.0\nRoot-Is-Purelib: false\nTag: {tag}\n"
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
    package = {"umf/__init__.py": b"__version__ = '0.10.1'\n"}
    expected_licenses = {
        name: b"license" for name in ("LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE")
    }
    wheel = _wheel(tmp_path / "valid.whl", package)

    result = verifier._validate_wheel(
        wheel, package, expected_licenses, "0.10.1", "linux_x86_64"
    )

    assert result["version"] == "0.10.1"
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
    )

    result = verifier._validate_wheel(
        wheel, package, expected_licenses, "0.10.1", "macos_arm64"
    )

    assert result["tag"] == "cp311-abi3-macosx_11_0_arm64"


def test_installed_wheel_payload_and_record_match_the_exact_archive(tmp_path):
    verifier = _verifier()
    package = {"umf/__init__.py": b"__version__ = '0.10.1'\n"}
    wheel = _wheel(tmp_path / "installed.whl", package)
    platlib = tmp_path / "site-packages"
    _install_wheel(wheel, platlib)

    result = verifier._validate_installed_wheel(wheel, platlib, "0.10.1")

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
        extra = platlib / "umf_core-0.10.1.dist-info/EXTRA"
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
        verifier._validate_installed_wheel(wheel, platlib, "0.10.1")


def test_installed_workflow_disables_bytecode_and_hashes_verifier_source():
    workflow = (
        Path(__file__).resolve().parents[2]
        / ".github/workflows/python-action-runtime.yml"
    ).read_text(encoding="utf-8")

    assert "--no-compile" in workflow
    assert "-I -B" in workflow
    assert "hashFiles(" not in workflow
    assert "hashlib.sha256(verifier_path.read_bytes()).hexdigest()" in workflow


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
            "umf_core-0.10.1/",
            "umf_core-0.10.1/nested/",
        ):
            member = tarfile.TarInfo(name)
            member.type = tarfile.DIRTYPE
            archive.addfile(member)
        files = {
            "umf_core-0.10.1/pyproject.toml": (
                b'[project]\nname = "umf-core"\nversion = "0.10.1"\n'
            ),
            "umf_core-0.10.1/nested/pyproject.toml": (
                b'[project]\nname = "nested-helper"\nversion = "1.0"\n'
            ),
        }
        for name, payload in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(payload)
            archive.addfile(member, io.BytesIO(payload))

    root = verifier._extract_sdist(archive_path, tmp_path / "source")

    assert root.name == "umf_core-0.10.1"
    assert (root / "nested/pyproject.toml").is_file()


@pytest.mark.parametrize(
    ("mutate", "version", "tag", "platform", "message"),
    [
        ("extra", "0.10.1", "cp311-abi3-linux_x86_64", "linux_x86_64", "payload"),
        ("record", "0.10.1", "cp311-abi3-linux_x86_64", "linux_x86_64", "RECORD"),
        (None, "0.10.0", "cp311-abi3-linux_x86_64", "linux_x86_64", "version"),
        (None, "0.10.1", "py3-none-any", "linux_x86_64", "abi3"),
        (None, "0.10.1", "cp311-abi3-linux_x86_64", "macos_arm64", "platform"),
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
        verifier._validate_wheel(wheel, package, expected_licenses, "0.10.1", platform)

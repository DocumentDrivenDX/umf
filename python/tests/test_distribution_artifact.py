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
import posixpath
import re
import shutil
import struct
import subprocess
import sys
import tarfile
import tempfile
import textwrap
import tomllib
import types
import zipfile
from email.parser import Parser
from pathlib import Path, PurePosixPath

import pytest
from packaging.specifiers import SpecifierSet










def test_native_workspace_members_are_in_sdist_closure():
    repository = Path(__file__).resolve().parents[2]
    workspace = tomllib.loads((repository / "Cargo.toml").read_text())["workspace"]
    hook = ast.parse((repository / "python/hatch_build.py").read_text())
    closure = {
        target.id: ast.literal_eval(node.value)
        for node in hook.body
        if isinstance(node, ast.Assign)
        for target in node.targets
        if isinstance(target, ast.Name)
        and target.id in {"SDIST_SOURCE_FILES", "SDIST_SOURCE_TREES"}
    }
    for member in workspace["members"]:
        manifest = f"{member}/Cargo.toml"
        assert (repository / manifest).is_file()
        assert manifest in closure["SDIST_SOURCE_FILES"] or any(
            member == tree or member.startswith(tree + "/")
            for tree in closure["SDIST_SOURCE_TREES"]
        ), f"Cargo workspace member is absent from the source archive: {member}"


def test_parquet_capture_compile_time_resource_is_in_sdist_closure():
    repository = Path(__file__).resolve().parents[2]
    source = repository / "crates/umf-core/src/parquet_capture_inspection.rs"
    source_text = source.read_text(encoding="utf-8")
    includes = re.findall(r'include_(?:str|bytes)!\s*\(\s*"([^"\n]+)"', source_text)
    resources = {
        (source.parent / include).resolve().relative_to(repository).as_posix()
        for include in includes
        if "/spec/extensions/parquet/" in f"/{include}"
    }
    assert resources == {"spec/extensions/parquet/idl.json"}

    build_hook = (repository / "python/hatch_build.py").read_text(encoding="utf-8")
    assignments = ast.parse(build_hook)
    sdist_files = next(
        ast.literal_eval(node.value)
        for node in assignments.body
        if isinstance(node, ast.Assign)
        and any(
            isinstance(target, ast.Name) and target.id == "SDIST_SOURCE_FILES"
            for target in node.targets
        )
    )

    assert resources <= set(sdist_files)










































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
    # Hatch includes project license-files itself. Force-including the root
    # copies at the same names produces duplicate tar members.
    assert licenses.isdisjoint(set(source_files))
    for name in licenses:
        assert (repository / name).read_bytes() == (repository / "python" / name).read_bytes()
    force_include = project["tool"]["hatch"]["build"]["targets"]["sdist"][
        "force-include"
    ]
    assert "_native_platform.py" not in force_include
    assert (repository / "python/_native_platform.py").is_file()











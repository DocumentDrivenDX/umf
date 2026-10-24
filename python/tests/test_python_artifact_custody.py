# SPDX-License-Identifier: MIT OR Apache-2.0
"""Controls for the sdist input gate in the integrated artifact verifier."""

from __future__ import annotations

import importlib.util
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest


def _verifier():
    path = Path(__file__).resolve().parents[2] / "tools/verify_python_artifacts.py"
    spec = importlib.util.spec_from_file_location("umf_custody_test_verifier", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _set_up_rebuild(monkeypatch, tmp_path, *, manifests=None, expected_pkg_info=None):
    verifier = _verifier()
    source_root = tmp_path / "synthetic-source"
    source_root.mkdir()
    (source_root / "pyproject.toml").write_text(
        '[project]\nname = "umf-core"\nversion = "0.10.1"\n', encoding="utf-8"
    )
    repository = tmp_path / "checkout"
    repository.mkdir()
    helper_path = repository / "tools/_python_sdist.py"
    helper_path.parent.mkdir()
    shutil.copyfile(
        Path(__file__).resolve().parents[2] / "tools/_python_sdist.py", helper_path
    )

    calls = []
    manifest_values = manifests or [{"schema": "fixture/1", "sha256": "stable"}] * 2

    def verify_inputs(extracted, checkout, *, expected_version, expected_pkg_info):
        calls.append((extracted, checkout, expected_version, expected_pkg_info))
        if expected_pkg_info != b"Name: umf-core\nVersion: 0.10.1\n\n":
            raise ValueError("fixture rejected wheel metadata mismatch")
        return manifest_values[min(len(calls) - 1, len(manifest_values) - 1)]

    helper = SimpleNamespace(verify_sdist_inputs=verify_inputs)
    monkeypatch.setattr(
        verifier,
        "_extract_sdist",
        lambda _sdist, _destination, _version: source_root,
    )
    monkeypatch.setattr(
        verifier, "_sdist_helper", lambda _repository: (helper, helper_path)
    )
    return verifier, source_root, repository, helper_path, calls


def test_wrong_wheel_metadata_stops_before_build_and_retains_no_wheel(
    monkeypatch, tmp_path
):
    verifier, _source, repository, _helper_path, calls = _set_up_rebuild(
        monkeypatch, tmp_path
    )
    ran_build = []
    monkeypatch.setattr(
        verifier.subprocess, "run", lambda *args, **kwargs: ran_build.append(args)
    )
    output = tmp_path / "retained"

    with pytest.raises(ValueError, match="metadata mismatch"):
        verifier._rebuild_sdist_wheel(
            tmp_path / "input.tar.gz",
            output,
            "0.10.1",
            repository,
            b"Name: umf-core\nVersion: 0.10.1\nSummary: altered\n\n",
        )

    assert len(calls) == 1
    assert ran_build == []
    assert list(output.iterdir()) == []


def test_source_map_is_rechecked_after_build_before_retaining_wheel(
    monkeypatch, tmp_path
):
    first = {"schema": "fixture/1", "sha256": "before"}
    changed = {"schema": "fixture/1", "sha256": "after"}
    verifier, _source, repository, _helper_path, calls = _set_up_rebuild(
        monkeypatch, tmp_path, manifests=[first, changed]
    )
    build_calls = []

    def fake_build(command, *, check, timeout, env):
        build_calls.append((command, check, timeout, env))
        wheel_dir = Path(command[command.index("--outdir") + 1])
        (wheel_dir / "umf_core-0.10.1-py3-none-any.whl").write_bytes(b"wheel")

    monkeypatch.setattr(verifier.subprocess, "run", fake_build)
    output = tmp_path / "retained"

    with pytest.raises(ValueError, match="inputs changed"):
        verifier._rebuild_sdist_wheel(
            tmp_path / "input.tar.gz",
            output,
            "0.10.1",
            repository,
            b"Name: umf-core\nVersion: 0.10.1\n\n",
        )

    assert len(calls) == 2
    assert len(build_calls) == 1
    assert build_calls[0][1:3] == (True, 1800)
    assert list(output.iterdir()) == []


def test_stable_source_map_is_returned_only_after_both_checks(monkeypatch, tmp_path):
    stable = {"schema": "fixture/1", "sha256": "stable"}
    verifier, _source, repository, _helper_path, calls = _set_up_rebuild(
        monkeypatch, tmp_path, manifests=[stable, stable]
    )

    def fake_build(command, *, check, timeout, env):
        wheel_dir = Path(command[command.index("--outdir") + 1])
        (wheel_dir / "umf_core-0.10.1-py3-none-any.whl").write_bytes(b"wheel")

    monkeypatch.setattr(verifier.subprocess, "run", fake_build)
    output = tmp_path / "retained"

    wheel, manifest = verifier._rebuild_sdist_wheel(
        tmp_path / "input.tar.gz",
        output,
        "0.10.1",
        repository,
        b"Name: umf-core\nVersion: 0.10.1\n\n",
    )

    assert wheel.read_bytes() == b"wheel"
    assert manifest == stable
    assert len(calls) == 2

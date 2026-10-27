# SPDX-License-Identifier: MIT OR Apache-2.0
"""Focused fail-closed tests for local coordinated release preparation."""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("release_matrix", ROOT / "tools/verify_python_release_matrix.py")
assert SPEC is not None and SPEC.loader is not None
matrix = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(matrix)
SPEC = importlib.util.spec_from_file_location("release_preparation", ROOT / "tools/prepare_python_release_pair.py")
assert SPEC is not None and SPEC.loader is not None
preparation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preparation)

sys.path.insert(0, str(ROOT / "python/tests"))
from test_python_release_matrix import REVISION, RUN_ID, _linux_matrix, _matrix


def _aggregate(root: Path, path: Path) -> dict:
    value = matrix.verify_matrix(root, REVISION, RUN_ID)
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    return value


def test_preparation_emits_deterministic_five_artifact_manifest(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = _matrix(tmp_path)
    receipt_path = tmp_path / "aggregate.json"
    _aggregate(root, receipt_path)
    first = preparation.prepare(root, receipt_path)
    second = preparation.prepare(root, receipt_path)
    monkeypatch.chdir(tmp_path)
    relative = preparation.prepare(Path(root.name), receipt_path)
    assert first == second
    assert first == relative
    assert first["publishing"] is False
    assert first["sourceRevision"] == REVISION
    assert first["runId"] == RUN_ID
    assert set(first["artifacts"]) == {
        "umf_core-0.11.0-cp311-abi3-manylinux_2_34_x86_64.whl",
        "umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl",
        "umf_core-0.11.0.tar.gz",
        "umf_codegen-0.2.0-py3-none-any.whl",
        "umf_codegen-0.2.0.tar.gz",
    }
    assert len(first["artifacts"]) == 5
    assert len([name for name in first["artifacts"] if name.startswith("umf_core-") and name.endswith(".whl")]) == 2


def test_preparation_emits_explicit_linux_only_manifest(tmp_path: Path) -> None:
    root = _linux_matrix(tmp_path)
    receipt_path = tmp_path / "linux-aggregate.json"
    value = matrix.verify_matrix(root, REVISION, RUN_ID, "linux-only")
    receipt_path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    result = preparation.prepare(root, receipt_path)
    assert result["qualificationScope"] == "linux-only"
    assert result["aggregateReceiptSchema"] == "umf.python-coordinated-release-linux-matrix/1"
    assert len(result["cohorts"]) == 3
    assert len(result["artifacts"]) == 4


def test_preparation_rejects_missing_cohort(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    receipt = tmp_path / "aggregate.json"
    _aggregate(root, receipt)
    import shutil
    shutil.rmtree(root / "python-release-linux-x86_64-cpython-313")
    with pytest.raises(ValueError, match="exactly one directory"):
        preparation.prepare(root, receipt)


@pytest.mark.parametrize("field,value", [("sourceRevision", "b" * 40), ("runId", "other-run")])
def test_preparation_rejects_mixed_revision_or_run(tmp_path: Path, field: str, value: str) -> None:
    root = _matrix(tmp_path)
    receipt = tmp_path / "aggregate.json"
    _aggregate(root, receipt)
    cohort = root / "python-release-macos-arm64-cpython-312" / "umf-coordinated-release-receipt.json"
    claim = json.loads(cohort.read_text())
    claim[field] = value
    cohort.write_text(json.dumps(claim))
    with pytest.raises(ValueError, match="source/run/cohort differs"):
        preparation.prepare(root, receipt)


def test_preparation_rejects_altered_artifact_bytes(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    receipt = tmp_path / "aggregate.json"
    _aggregate(root, receipt)
    artifact = root / "python-release-linux-x86_64-cpython-311" / "umf-coordinated-artifacts" / "umf_codegen-0.2.0.tar.gz"
    artifact.write_bytes(b"altered")
    with pytest.raises(ValueError, match="Artifact hash/size differs"):
        preparation.prepare(root, receipt)


@pytest.mark.parametrize("filename", ["umf_core-0.11.0.tar.gz", "umf_codegen-0.2.0-py3-none-any.whl"])
def test_preparation_rejects_wrong_release_versions(tmp_path: Path, filename: str) -> None:
    root = _matrix(tmp_path)
    receipt = tmp_path / "aggregate.json"
    _aggregate(root, receipt)
    path = root / "python-release-linux-x86_64-cpython-311" / "umf-coordinated-artifacts" / filename
    renamed = path.with_name(filename.replace("0.11.0", "0.12.0").replace("0.2.0", "0.3.0"))
    path.rename(renamed)
    with pytest.raises(ValueError, match="Package artifact set differs"):
        preparation.prepare(root, receipt)


def test_preparation_rejects_omitted_platform_core_wheel(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    receipt = tmp_path / "aggregate.json"
    _aggregate(root, receipt)
    core = next((root / "python-release-macos-arm64-cpython-313" / "umf-coordinated-artifacts").glob("umf_core-*.whl"))
    core.unlink()
    with pytest.raises(ValueError, match="Package artifact set differs"):
        preparation.prepare(root, receipt)


def test_preparation_rejects_wrong_versions_claimed_by_receipt(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    receipt = tmp_path / "aggregate.json"
    aggregate = _aggregate(root, receipt)
    aggregate["deduplicatedArtifactHashes"] = {**aggregate["deduplicatedArtifactHashes"], "umf_core-0.12.0.tar.gz": aggregate["deduplicatedArtifactHashes"].pop("umf_core-0.11.0.tar.gz")}
    receipt.write_text(json.dumps(aggregate))
    with pytest.raises(ValueError, match="Aggregate receipt differs"):
        preparation.prepare(root, receipt)


def test_preparation_rejects_unverified_aggregate_field(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    receipt = tmp_path / "aggregate.json"
    aggregate = _aggregate(root, receipt)
    aggregate["publisherApproved"] = True
    receipt.write_text(json.dumps(aggregate))
    with pytest.raises(ValueError, match="field set differs"):
        preparation.prepare(root, receipt)

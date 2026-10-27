# SPDX-License-Identifier: MIT OR Apache-2.0
"""Negative controls for fail-closed hosted Python release aggregation."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "tools/verify_python_release_matrix.py"
SPEC = importlib.util.spec_from_file_location("umf_release_matrix", TOOL)
assert SPEC is not None and SPEC.loader is not None
matrix = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(matrix)

REVISION = "a" * 40
RUN_ID = "99123"
CORE_SDIST = "umf_core-0.11.0.tar.gz"
CODEGEN_WHEEL = "umf_codegen-0.2.0-py3-none-any.whl"
CODEGEN_SDIST = "umf_codegen-0.2.0.tar.gz"


def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")


def _cohort_artifact(root: Path, cohort: str, expected: tuple[str, str, str]) -> None:
    python_version, system, machine = expected
    directory = root / f"python-release-{cohort}"
    package = directory / "umf-coordinated-artifacts"
    rebuilt_dir = directory / "umf-core-sdist-rebuilt"
    package.mkdir(parents=True)
    rebuilt_dir.mkdir()
    platform_tag = "manylinux_2_34_x86_64" if system == "Linux" else "macosx_11_0_arm64"
    core_wheel = f"umf_core-0.11.0-cp311-abi3-{platform_tag}.whl"
    payloads = {
        core_wheel: f"core wheel {system}".encode(),
        CORE_SDIST: b"identical core source archive",
        CODEGEN_WHEEL: b"identical codegen wheel",
        CODEGEN_SDIST: b"identical codegen source archive",
    }
    for name, payload in payloads.items():
        (package / name).write_bytes(payload)
    rebuilt_name = core_wheel
    rebuilt_path = rebuilt_dir / rebuilt_name
    rebuilt_path.write_bytes(f"rebuilt {system} core wheel".encode())

    core_receipt = {
        "schema": "umf.python-artifact-qualification/1",
        "source_payload_verification": "passed",
        "distribution_version": "0.11.0",
        "semantic_core_version": "0.10.0",
        "platform": {"system": "linux" if system == "Linux" else "darwin", "machine": machine, "python": python_version, "python_platform": "linux_x86_64" if system == "Linux" else "macosx_11_0_arm64"},
        "artifacts": {
            "direct": {"filename": core_wheel, "sha256": _hash(payloads[core_wheel])},
            "sdist_rebuilt": {"filename": rebuilt_name, "sha256": _hash(rebuilt_path.read_bytes())},
        },
        "sdist": {"filename": CORE_SDIST, "sha256": _hash(payloads[CORE_SDIST])},
        "action_runtime_resource_sha256": {f"resource-{index}": _hash(f"resource {index}".encode()) for index in range(9)},
        "sdist_build_inputs": {"file_count": 2, "files": {"Cargo.toml": _hash(b"cargo"), "python/pyproject.toml": _hash(b"project")}},
    }
    core_path = directory / "umf-core-artifact-receipt.json"
    _write_json(core_path, core_receipt)
    pair = {
        "schema": "umf.python-coordinated-release-qualification/1",
        "status": "passed",
        "publishing": False,
        "cohort": cohort,
        "sourceRevision": REVISION,
        "runId": RUN_ID,
        "workflowRun": RUN_ID,
        "host": {"python": python_version, "machine": machine, "platform": "Linux-6.8" if system == "Linux" else "macOS-27.0.1"},
        "coreSdistVerificationReceiptSha256": _hash(core_path.read_bytes()),
        "corePayloadReceiptSha256": _hash(core_path.read_bytes()),
        "pair": {"core": {"version": "0.11.0", "wheel": core_wheel}, "codegen": {"version": "0.2.0", "wheel": CODEGEN_WHEEL}, "requires": "umf-core==0.11.0", "installedImportAndGeneration": "passed", "installedCliHelp": "passed"},
        "artifacts": {name: {"sha256": _hash(payload), "size": len(payload)} for name, payload in payloads.items()},
        "codegenSdistOfflineRebuild": {"matchesDirectWheel": True, "wheel": CODEGEN_WHEEL, "sha256": _hash(payloads[CODEGEN_WHEEL])},
        "source": matrix._current_source_pins(ROOT),
    }
    _write_json(directory / "umf-coordinated-release-receipt.json", pair)


def _matrix(tmp_path: Path) -> Path:
    root = tmp_path / "artifacts"
    root.mkdir()
    for cohort, expected in matrix.COHORTS.items():
        _cohort_artifact(root, cohort, expected)
    return root


def _linux_matrix(tmp_path: Path) -> Path:
    import shutil
    root = _matrix(tmp_path)
    for cohort in set(matrix.COHORTS) - set(matrix.LINUX_COHORTS):
        shutil.rmtree(root / f"python-release-{cohort}")
    return root


def test_linux_only_aggregation_is_explicit_and_qualified(tmp_path: Path) -> None:
    result = matrix.verify_matrix(_linux_matrix(tmp_path), REVISION, RUN_ID, "linux-only")
    assert result["status"] == "passed"
    assert result["qualificationScope"] == "linux-only"
    assert result["schema"] == "umf.python-coordinated-release-linux-matrix/1"
    assert len(result["cohorts"]) == 3
    assert len(result["deduplicatedArtifactHashes"]) == 4


@pytest.mark.parametrize("mutation", ["missing", "mac-extra"])
def test_linux_only_requires_exactly_three_linux_cohorts(tmp_path: Path, mutation: str) -> None:
    import shutil
    root = _linux_matrix(tmp_path)
    if mutation == "missing":
        shutil.rmtree(root / "python-release-linux-x86_64-cpython-313")
    else:
        _cohort_artifact(root, "macos-arm64-cpython-311", matrix.COHORTS["macos-arm64-cpython-311"])
    with pytest.raises(ValueError, match="three Linux cohorts"):
        matrix.verify_matrix(root, REVISION, RUN_ID, "linux-only")


@pytest.mark.parametrize("field,value", [("sourceRevision", "b" * 40), ("runId", "other-run")])
def test_linux_only_rejects_stale_source_or_run(tmp_path: Path, field: str, value: str) -> None:
    root = _linux_matrix(tmp_path)
    path = root / "python-release-linux-x86_64-cpython-312" / "umf-coordinated-release-receipt.json"
    receipt = json.loads(path.read_text())
    receipt[field] = value
    _write_json(path, receipt)
    with pytest.raises(ValueError, match="source/run/cohort differs"):
        matrix.verify_matrix(root, REVISION, RUN_ID, "linux-only")


def test_linux_only_rejects_tampered_archive(tmp_path: Path) -> None:
    root = _linux_matrix(tmp_path)
    target = root / "python-release-linux-x86_64-cpython-311" / "umf-coordinated-artifacts" / CORE_SDIST
    target.write_bytes(b"tampered source archive")
    with pytest.raises(ValueError, match="Artifact hash/size differs"):
        matrix.verify_matrix(root, REVISION, RUN_ID, "linux-only")


def test_six_cohort_aggregation_binds_one_run_and_common_source(tmp_path: Path) -> None:
    result = matrix.verify_matrix(_matrix(tmp_path), REVISION, RUN_ID)
    assert result["status"] == "passed"
    assert result["publishing"] is False
    assert len(result["cohorts"]) == 6
    assert set(result["deduplicatedArtifactHashes"]) == {
        "umf_core-0.11.0-cp311-abi3-manylinux_2_34_x86_64.whl",
        "umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl",
        CORE_SDIST,
        CODEGEN_WHEEL,
        CODEGEN_SDIST,
    }


@pytest.mark.parametrize("mutation", ["missing", "extra", "duplicate-claim"])
def test_matrix_requires_exactly_six_distinct_cohorts(tmp_path: Path, mutation: str) -> None:
    root = _matrix(tmp_path)
    if mutation == "missing":
        import shutil

        shutil.rmtree(root / "python-release-linux-x86_64-cpython-313")
    elif mutation == "extra":
        (root / "python-release-duplicate").mkdir()
    else:
        path = root / "python-release-linux-x86_64-cpython-312" / "umf-coordinated-release-receipt.json"
        receipt = json.loads(path.read_text())
        receipt["cohort"] = "linux-x86_64-cpython-311"
        _write_json(path, receipt)
    expected_error = "source/run/cohort differs" if mutation == "duplicate-claim" else "exactly one directory"
    with pytest.raises(ValueError, match=expected_error):
        matrix.verify_matrix(root, REVISION, RUN_ID)


@pytest.mark.parametrize("field,value", [("sourceRevision", "b" * 40), ("runId", "other-run")])
def test_matrix_rejects_source_or_run_mismatch(tmp_path: Path, field: str, value: str) -> None:
    root = _matrix(tmp_path)
    path = root / "python-release-linux-x86_64-cpython-312" / "umf-coordinated-release-receipt.json"
    receipt = json.loads(path.read_text())
    receipt[field] = value
    _write_json(path, receipt)
    with pytest.raises(ValueError, match="source/run/cohort differs"):
        matrix.verify_matrix(root, REVISION, RUN_ID)


def test_matrix_rejects_bad_core_receipt_link(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    path = root / "python-release-macos-arm64-cpython-312" / "umf-coordinated-release-receipt.json"
    receipt = json.loads(path.read_text())
    receipt["corePayloadReceiptSha256"] = "0" * 64
    _write_json(path, receipt)
    with pytest.raises(ValueError, match="does not bind the cohort core receipt"):
        matrix.verify_matrix(root, REVISION, RUN_ID)


def test_matrix_rejects_source_closure_mismatch(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    path = root / "python-release-macos-arm64-cpython-312" / "umf-coordinated-release-receipt.json"
    receipt = json.loads(path.read_text())
    receipt["source"]["workflowSha256"] = "0" * 64
    _write_json(path, receipt)
    with pytest.raises(ValueError, match="source pins differ from this checked-out revision"):
        matrix.verify_matrix(root, REVISION, RUN_ID)


def test_matrix_rejects_mismatched_artifact_hash(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    target = root / "python-release-linux-x86_64-cpython-311" / "umf-coordinated-artifacts" / CODEGEN_WHEEL
    target.write_bytes(b"tampered")
    with pytest.raises(ValueError, match="Artifact hash/size differs"):
        matrix.verify_matrix(root, REVISION, RUN_ID)


def test_matrix_rejects_same_filename_with_divergent_bytes(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    cohort = "linux-x86_64-cpython-312"
    directory = root / f"python-release-{cohort}"
    target = directory / "umf-coordinated-artifacts" / CODEGEN_WHEEL
    target.write_bytes(b"different codegen wheel")
    pair_path = directory / "umf-coordinated-release-receipt.json"
    pair = json.loads(pair_path.read_text())
    pair["artifacts"][CODEGEN_WHEEL] = {"sha256": _hash(target.read_bytes()), "size": target.stat().st_size}
    pair["codegenSdistOfflineRebuild"]["sha256"] = _hash(target.read_bytes())
    _write_json(pair_path, pair)
    with pytest.raises(ValueError, match="Same artifact filename has divergent hashes"):
        matrix.verify_matrix(root, REVISION, RUN_ID)


def test_matrix_rejects_incomplete_artifact_set(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    directory = root / "python-release-macos-arm64-cpython-313" / "umf-coordinated-artifacts"
    (directory / CODEGEN_SDIST).unlink()
    with pytest.raises(ValueError, match="Package artifact set differs"):
        matrix.verify_matrix(root, REVISION, RUN_ID)


def test_matrix_rejects_wrong_host_for_named_cohort(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    path = root / "python-release-linux-x86_64-cpython-311" / "umf-coordinated-release-receipt.json"
    receipt = json.loads(path.read_text())
    receipt["host"]["machine"] = "arm64"
    _write_json(path, receipt)
    with pytest.raises(ValueError, match="host differs from expected cohort"):
        matrix.verify_matrix(root, REVISION, RUN_ID)


def test_matrix_rejects_wrong_core_receipt_platform(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    path = root / "python-release-linux-x86_64-cpython-311" / "umf-core-artifact-receipt.json"
    receipt = json.loads(path.read_text())
    receipt["platform"]["machine"] = "arm64"
    _write_json(path, receipt)
    with pytest.raises(ValueError, match="Core receipt host differs from expected cohort"):
        matrix.verify_matrix(root, REVISION, RUN_ID)


def test_matrix_rejects_wheel_for_the_wrong_platform(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    directory = root / "python-release-linux-x86_64-cpython-311"
    package = directory / "umf-coordinated-artifacts"
    old_name = next(name for name in (path.name for path in package.iterdir()) if "core" in name and name.endswith(".whl"))
    new_name = "umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl"
    (package / old_name).rename(package / new_name)
    pair_path = directory / "umf-coordinated-release-receipt.json"
    pair = json.loads(pair_path.read_text())
    pair["artifacts"][new_name] = pair["artifacts"].pop(old_name)
    pair["pair"]["core"]["wheel"] = new_name
    _write_json(pair_path, pair)
    core_path = directory / "umf-core-artifact-receipt.json"
    core = json.loads(core_path.read_text())
    core["artifacts"]["direct"]["filename"] = new_name
    _write_json(core_path, core)
    pair["corePayloadReceiptSha256"] = _hash(core_path.read_bytes())
    pair["coreSdistVerificationReceiptSha256"] = _hash(core_path.read_bytes())
    _write_json(pair_path, pair)
    with pytest.raises(ValueError, match="Core wheel platform differs from Linux cohort"):
        matrix.verify_matrix(root, REVISION, RUN_ID)


def test_matrix_rejects_same_os_wheel_with_wrong_architecture(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    cohort = "linux-x86_64-cpython-311"
    directory = root / f"python-release-{cohort}"
    package = directory / "umf-coordinated-artifacts"
    old_name = next(path.name for path in package.iterdir() if path.name.startswith("umf_core-") and path.name.endswith(".whl"))
    new_name = "umf_core-0.11.0-cp311-abi3-manylinux_2_34_arm64.whl"
    (package / old_name).rename(package / new_name)
    pair_path = directory / "umf-coordinated-release-receipt.json"
    pair = json.loads(pair_path.read_text())
    pair["artifacts"][new_name] = pair["artifacts"].pop(old_name)
    pair["pair"]["core"]["wheel"] = new_name
    core_path = directory / "umf-core-artifact-receipt.json"
    core = json.loads(core_path.read_text())
    core["artifacts"]["direct"]["filename"] = new_name
    _write_json(core_path, core)
    pair["corePayloadReceiptSha256"] = _hash(core_path.read_bytes())
    pair["coreSdistVerificationReceiptSha256"] = _hash(core_path.read_bytes())
    _write_json(pair_path, pair)
    with pytest.raises(ValueError, match="Core wheel architecture differs from Linux cohort"):
        matrix.verify_matrix(root, REVISION, RUN_ID)


def test_matrix_rejects_contradictory_core_receipt_platform(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    directory = root / "python-release-macos-arm64-cpython-312"
    core_path = directory / "umf-core-artifact-receipt.json"
    core = json.loads(core_path.read_text())
    core["platform"]["machine"] = "x86_64"
    _write_json(core_path, core)
    pair_path = directory / "umf-coordinated-release-receipt.json"
    pair = json.loads(pair_path.read_text())
    pair["corePayloadReceiptSha256"] = _hash(core_path.read_bytes())
    pair["coreSdistVerificationReceiptSha256"] = _hash(core_path.read_bytes())
    _write_json(pair_path, pair)
    with pytest.raises(ValueError, match="Core receipt host differs from expected cohort"):
        matrix.verify_matrix(root, REVISION, RUN_ID)


def test_matrix_rejects_wrong_semantic_core_version(tmp_path: Path) -> None:
    root = _matrix(tmp_path)
    directory = root / "python-release-linux-x86_64-cpython-313"
    core_path = directory / "umf-core-artifact-receipt.json"
    core = json.loads(core_path.read_text())
    core["semantic_core_version"] = "0.11.0"
    _write_json(core_path, core)
    pair_path = directory / "umf-coordinated-release-receipt.json"
    pair = json.loads(pair_path.read_text())
    pair["corePayloadReceiptSha256"] = _hash(core_path.read_bytes())
    pair["coreSdistVerificationReceiptSha256"] = _hash(core_path.read_bytes())
    _write_json(pair_path, pair)
    with pytest.raises(ValueError, match="semantic version differs from the release plan"):
        matrix.verify_matrix(root, REVISION, RUN_ID)


def test_existing_release_dispatcher_is_scoped_to_core_release_publisher() -> None:
    dispatcher = (ROOT / ".github/workflows/pypi.yml").read_text()
    assert "types: [published]" in dispatcher
    assert 'workflows: ["*"]' in dispatcher
    assert "scripts/dispatch_core_pypi_release.py" in dispatcher
    assert "gh workflow run publish-pypi.yml" in dispatcher
    assert "id-token: write" not in dispatcher
    assert "pypa/gh-action-pypi-publish" not in dispatcher

    publisher = (ROOT / ".github/workflows/publish-pypi.yml").read_text()
    assert "workflow_dispatch:" in publisher
    assert "Exact existing qualified release tag" in publisher
    assert "Exact commit targeted by the immutable release tag" in publisher
    assert "--distribution umf-core" in publisher
    assert "--expected-sums-sha256" in publisher
    assert "id-token: write" in publisher
    assert "pypa/gh-action-pypi-publish@release/v1" in publisher


def test_rust_pair_candidate_cannot_bypass_same_run_aggregate_for_publication() -> None:
    workflow = (ROOT / ".github/workflows/python-coordinated-release.yml").read_text()
    assert "aggregate-release-cohorts:" in workflow
    assert "needs: build-verify-pair" in workflow
    assert "pattern: python-release-*" in workflow
    assert "tools/verify_python_release_matrix.py" in workflow
    assert "python-release-aggregate" in workflow
    assert "publish-pypi.yml" not in workflow
    assert "gh workflow run" not in workflow
    assert "id-token: write" not in workflow
    assert "pypa/gh-action-pypi-publish" not in workflow


def test_coordinated_workflow_aggregates_only_after_the_matrix() -> None:
    workflow = (ROOT / ".github/workflows/python-coordinated-release.yml").read_text()
    for rust_input in ("Cargo.toml", "Cargo.lock", ".cargo/**", "rust-toolchain.toml"):
        assert f"- '{rust_input}'" in workflow
    assert "aggregate-release-cohorts:" in workflow
    assert "needs: build-verify-pair" in workflow
    assert "actions/download-artifact@v4" in workflow
    assert "pattern: python-release-*" in workflow
    assert "tools/verify_python_release_matrix.py" in workflow
    assert "python-release-aggregate" in workflow
    assert "id-token: write" not in workflow


def test_publisher_workflow_changes_trigger_coordinated_gate() -> None:
    workflow = (ROOT / ".github/workflows/python-coordinated-release.yml").read_text()
    assert "- '.github/workflows/pypi.yml'" in workflow

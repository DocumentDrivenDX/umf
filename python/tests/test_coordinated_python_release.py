# SPDX-License-Identifier: MIT OR Apache-2.0
"""Safety and identity checks for the coordinated release qualification tool."""

from __future__ import annotations

import importlib.util
import tarfile
from pathlib import Path

import pytest

_TOOL = Path(__file__).resolve().parents[2] / "tools/verify_python_release_pair.py"
_SPEC = importlib.util.spec_from_file_location("umf_release_pair", _TOOL)
assert _SPEC is not None and _SPEC.loader is not None
release_pair = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(release_pair)


def test_sdist_extractor_rejects_parent_traversal(tmp_path: Path) -> None:
    archive_path = tmp_path / "unsafe.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        member = tarfile.TarInfo("../escape.txt")
        member.size = 1
        archive.addfile(member, __import__("io").BytesIO(b"x"))

    with pytest.raises(ValueError, match="unsafe archive member"):
        release_pair._extract_sdist(archive_path, tmp_path / "extracted")


def test_sdist_extractor_requires_single_root(tmp_path: Path) -> None:
    archive_path = tmp_path / "multi-root.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        for name in ("first/README.md", "second/README.md"):
            member = tarfile.TarInfo(name)
            member.size = 1
            archive.addfile(member, __import__("io").BytesIO(b"x"))

    with pytest.raises(ValueError, match="one top-level directory"):
        release_pair._extract_sdist(archive_path, tmp_path / "extracted")


def test_sdist_extractor_rejects_links(tmp_path: Path) -> None:
    archive_path = tmp_path / "link.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        member = tarfile.TarInfo("package/link")
        member.type = tarfile.SYMTYPE
        member.linkname = "../../outside"
        archive.addfile(member)

    with pytest.raises(ValueError, match="unsafe archive member"):
        release_pair._extract_sdist(archive_path, tmp_path / "extracted")


def test_coordinated_workflow_is_nonpublishing_and_builds_both_release_pairs() -> None:
    repository = Path(__file__).resolve().parents[2]
    workflow = (repository / ".github/workflows/python-coordinated-release.yml").read_text()
    verifier_source = _TOOL.read_text()
    assert "python -m build --no-isolation --wheel --sdist python" in workflow
    assert "python -m build --no-isolation --wheel --sdist python/umf_codegen" in workflow
    assert "tools/verify_python_artifacts.py" in workflow
    assert "tools/verify_python_release_pair.py" in workflow
    assert "tools/verify_python_release_matrix.py" in workflow
    assert "python/tests/test_coordinated_python_release.py" in workflow
    assert "python/tests/test_python_release_matrix.py" in workflow
    assert "python -m pytest -q" in workflow
    assert "fixtures/actions-binding/source.json" in workflow
    assert "fixtures/actions-binding/source.json" in verifier_source
    assert "CARGO_NET_OFFLINE: 'true'" in workflow
    assert "cohort.startswith('linux-x86_64-')" in workflow
    assert "cohort.startswith('macos-arm64-')" in workflow
    assert "platform.python_version() != os.environ['EXPECTED_PYTHON']" in workflow
    assert "actions/upload-artifact@v4" in workflow
    assert "pypa/gh-action-pypi-publish" not in workflow
    assert "id-token: write" not in workflow


def _core_receipt(wheel: Path, sdist: Path) -> dict[str, object]:
    return {
        "schema": "umf.python-artifact-qualification/1",
        "source_payload_verification": "passed",
        "distribution_version": "0.11.0",
        "semantic_core_version": "0.10.0",
        "artifacts": {
            "direct": {"sha256": release_pair._sha256(wheel)},
            "sdist_rebuilt": {"version": "0.11.0"},
        },
        "sdist": {"sha256": release_pair._sha256(sdist)},
        "sdist_rebuild": {
            "non_native_package_payload_matches": True,
            "version_matches": True,
            "tag_matches": True,
            "metadata_byte_identity": True,
        },
        "sdist_build_inputs": {"schema": "umf.python-sdist-build-inputs/1"},
    }


def test_core_receipt_is_bound_to_pair_artifacts(tmp_path: Path) -> None:
    wheel = tmp_path / "umf_core-0.11.0.whl"
    sdist = tmp_path / "umf_core-0.11.0.tar.gz"
    wheel.write_bytes(b"wheel")
    sdist.write_bytes(b"sdist")
    receipt = _core_receipt(wheel, sdist)

    release_pair._verify_core_receipt(receipt, "0.11.0", wheel, sdist)

    wrong_wheel = dict(receipt)
    wrong_wheel["artifacts"] = {
        "direct": {"sha256": "0" * 64},
        "sdist_rebuilt": {"version": "0.11.0"},
    }
    with pytest.raises(ValueError, match="does not bind"):
        release_pair._verify_core_receipt(wrong_wheel, "0.11.0", wheel, sdist)

    wrong_sdist = dict(receipt)
    wrong_sdist["sdist"] = {"sha256": "1" * 64}
    with pytest.raises(ValueError, match="does not bind"):
        release_pair._verify_core_receipt(wrong_sdist, "0.11.0", wheel, sdist)

    wrong_schema = dict(receipt)
    wrong_schema["schema"] = "umf.python-artifact-qualification/0"
    with pytest.raises(ValueError, match="does not bind"):
        release_pair._verify_core_receipt(wrong_schema, "0.11.0", wheel, sdist)

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed Rust binding checks for exact Arrow IPC capture."""

import json
from pathlib import Path

import pytest
from umf import _rust
from umf import rust_arrow_ipc as arrow


def test_capture_export_and_inspection_preserve_exact_bytes():
    assert arrow.profile_version() == "umf-r8-arrow-ipc/0.1.0"
    source = bytes(range(256)) + b"trailing-invalid-content"
    document = arrow.capture(source, "ipc-python")
    assert document["id"] == "ipc-python"

    exported = arrow.export(document)
    assert exported == source
    assert type(exported) is bytes
    assert exported is not source

    validation = arrow.inspect(document)
    assert validation["valid"] is True
    assert validation["complete"] is False


def test_empty_and_invalid_sources_are_archived_without_native_claim():
    for source in (b"", b"not an Arrow stream"):
        document = arrow.capture(source, "opaque")
        assert arrow.export(document) == source
        result = arrow.inspect(document)
        assert result["complete"] is False


def test_all_authored_arrow_ipc_fixtures_export_byte_for_byte():
    root = Path(__file__).resolve().parents[2]
    fixture_root = root / "fixtures/arrow/ipc-inputs"
    cases = json.loads((fixture_root / "manifest.json").read_text())["cases"]
    assert len(cases) == 18
    for index, case in enumerate(cases):
        source = (fixture_root / case["file"]).read_bytes()
        document = arrow.capture(source, f"fixture-{index}")
        assert arrow.export(document) == source, case["file"]
        assert arrow.inspect(document)["complete"] is False


def test_exact_one_megabyte_boundary_captures_and_exports_byte_for_byte():
    source = bytes(range(256)) * (1_000_000 // 256) + bytes(range(1_000_000 % 256))
    assert len(source) == 1_000_000
    document = arrow.capture(source, "exact-limit")
    assert arrow.export(document) == source


def test_size_type_unknown_content_and_resource_controls():
    with pytest.raises(_rust.UmfCoreError) as caught:
        arrow.capture(b"x" * 1_000_001, "too-large")
    assert caught.value.code == "ARROW_IPC_LIMIT"
    with pytest.raises(TypeError, match="source must be bytes"):
        arrow.capture(bytearray(b"x"), "wrong-type")

    document = arrow.capture(b"source", "unknown")
    document["modules"][0]["elements"][0]["extensions"]["umf.arrow.ipc"][
        "future"
    ] = True
    with pytest.raises(_rust.UmfCoreError) as caught:
        arrow.export(document)
    assert caught.value.code == "ARROW_IPC_REPRESENTATION"

    document = arrow.capture(b"source", "controls")
    work = []
    assert arrow.inspect(document, meter=work.append)["valid"] is True
    assert work and sum(work) > 0
    with pytest.raises(_rust.UmfCoreError) as caught:
        arrow.inspect(document, max_work=0)
    assert caught.value.code == "RESOURCE_LIMIT"
    with pytest.raises(_rust.UmfCoreError) as caught:
        arrow.inspect(document, is_cancelled=lambda: True)
    assert caught.value.code == "CANCELLED"


def test_profile_mismatch_fails_closed(monkeypatch):
    monkeypatch.setattr(
        arrow._rust._rust_core, "arrow_ipc_profile_version", lambda: "wrong"
    )
    with pytest.raises(RuntimeError, match="profile mismatch"):
        arrow.inspect({})

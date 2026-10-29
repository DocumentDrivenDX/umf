# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed Rust binding checks for bounded Parquet capture inspection."""

from pathlib import Path

import pytest
from umf import _rust
from umf import rust_parquet_capture as parquet


def test_ten_parquet_operations_run_through_the_native_wire_binding():
    assert parquet.profile_version() == "umf-r8-parquet-capture-inspection/0.1.0"
    root = Path(__file__).resolve().parents[2]
    source = (root / "fixtures/parquet/rename/none.parquet").read_bytes()
    document = parquet.capture(source, "parquet-python")
    assert parquet.export(document) == source
    assert type(parquet.export(document)) is bytes
    assert parquet.inspect_framing(document)["status"] == "located"
    assert parquet.decode_footer(document)["status"] == "decoded"
    assert parquet.inspect_metadata(document)["status"] == "mapped"
    assert parquet.inspect_schema(document)["status"] == "checked"

    logical = (root / "fixtures/parquet/logical/decimal32.parquet").read_bytes()
    assert parquet.inspect_logical_types(parquet.capture(logical, "logical-python"))["status"] == "checked"
    assert parquet.inspect_containers(parquet.capture(logical, "containers-python"))["status"] == "checked"
    fields = parquet.get_field_metadata(parquet.capture(logical, "fields-python"))
    assert fields["status"] == "checked"
    assert fields["fields"][0]["element"]["scalarType"] == "decimal"
    imported = parquet.import_schema(logical, "import-python")
    assert any(module["id"] == "parquet.fields" for module in imported["modules"])


def test_parquet_capture_is_opt_in_bounded_and_cooperatively_metered():
    with pytest.raises(_rust.UmfCoreError) as caught:
        parquet.capture(b"x" * 1_000_001, "too-large")
    assert caught.value.code == "PARQUET_LIMIT"
    with pytest.raises(TypeError, match="source must be bytes"):
        parquet.capture(bytearray(b"x"), "wrong-type")

    document = parquet.capture(b"opaque", "controls")
    work = []
    assert parquet.inspect_framing(document, meter=work.append)["complete"] is False
    assert work and sum(work) > 0
    with pytest.raises(_rust.UmfCoreError) as caught:
        parquet.inspect_schema(document, max_work=0)
    assert caught.value.code == "RESOURCE_LIMIT"
    with pytest.raises(_rust.UmfCoreError) as caught:
        parquet.decode_footer(document, is_cancelled=lambda: True)
    assert caught.value.code == "CANCELLED"

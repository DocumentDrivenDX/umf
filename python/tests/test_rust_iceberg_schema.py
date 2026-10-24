# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed-binding parity controls for the bounded R5 Iceberg profile."""

import json
from pathlib import Path

import pytest

from umf import _rust
from umf import rust_iceberg_schema as iceberg


ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema/baseline.json"


def _pointer(value, pointer):
    for segment in pointer.split("/")[1:]:
        segment = segment.replace("~1", "/").replace("~0", "~")
        value = value[int(segment)] if isinstance(value, list) else value[segment]
    return value


def test_frozen_r5_authored_and_upstream_replay():
    packet = json.loads(BASELINE.read_text())
    imported_count = rejected_count = 0
    for case in packet["authoredCases"]:
        operations = case["operations"]
        source = (ROOT / case["path"]).read_text()
        try:
            document = iceberg.import_schema(source, operations["import"].get("id", case["id"]))
        except _rust.UmfCoreError as error:
            assert operations["import"]["status"] == "error"
            assert error.code == operations["import"]["error"]["code"]
            assert str(error) == operations["import"]["error"]["message"]
            rejected_count += 1
            continue
        assert operations["import"]["status"] == "ok"
        imported_count += 1
        assert document["id"] == operations["import"]["id"]
        assert iceberg.inspect(document) == operations["inspect"]
        assert iceberg.export_schema(document) == operations["export"]["nativeJson"]
        assert iceberg.get_node(document, operations["get"]["path"]) == operations["get"]["value"]
        missing = operations["getMissing"]
        with pytest.raises(_rust.UmfCoreError) as caught:
            iceberg.get_node(document, missing["path"])
        assert (caught.value.code, str(caught.value)) == (
            missing["error"]["code"], missing["error"]["message"]
        )
        edit = operations["proposeEdit"]
        proposal = iceberg.propose_node_edit(document, edit["path"], edit["replacement"])
        assert proposal["validation"] == edit["validation"]
        assert iceberg.export_schema(proposal["document"]) == edit["export"]
        assert iceberg.export_schema(document) == edit["sourceAfter"]

    assert (imported_count, rejected_count) == (26, 9)

    imported_count = rejected_count = 0
    for case in packet["upstreamCases"]:
        source_meta = case["source"]
        source_doc = json.loads((ROOT / "fixtures/iceberg/upstream" / source_meta["path"]).read_text())
        native = json.dumps(_pointer(source_doc, source_meta["pointer"]), ensure_ascii=True, separators=(",", ":"))
        if "operations" not in case:
            with pytest.raises(_rust.UmfCoreError) as caught:
                iceberg.import_schema(native, source_meta["id"])
            assert caught.value.code == case["error"]["code"]
            assert str(caught.value) == case["error"]["message"]
            rejected_count += 1
            continue
        operations = case["operations"]
        document = iceberg.import_schema(native, source_meta["id"])
        imported_count += 1
        assert document["id"] == operations["import"]["id"]
        assert iceberg.inspect(document) == operations["inspect"]
        assert iceberg.export_schema(document) == operations["export"]
        assert iceberg.get_node(document, operations["get"]["path"]) == operations["get"]["value"]
        edit = operations["proposeEdit"]
        replacement = json.dumps(edit["to"], ensure_ascii=True, separators=(",", ":"))
        proposal = iceberg.propose_node_edit(document, "/fields/0/name", replacement)
        assert iceberg.export_schema(proposal["document"]) == edit["export"]
        assert iceberg.export_schema(document) == edit["sourceAfter"]

    assert (imported_count, rejected_count) == (20, 1)


def test_utf16_copy_isolation_and_per_operation_controls():
    source = (
        '{"type":"struct","fields":[{"id":1,"name":"x","type":"long","required":true}],'
        '"schema-id":0,"identifier-field-ids":[],"future":"\\ud800"}'
    )
    document = iceberg.import_schema(source, "utf16")
    assert iceberg.get_node(document, "/future")["value"] == "\ud800"
    assert "\\ud800" in iceberg.export_schema(document)

    proposal = iceberg.propose_node_edit(document, "/fields/0/name", '"copied"')
    assert iceberg.get_node(proposal["document"], "/fields/0/name")["value"] == "copied"
    assert iceberg.get_node(document, "/fields/0/name")["value"] == "x"

    work = []
    assert iceberg.inspect(document, meter=work.append)["valid"] is True
    assert work and sum(work) > 0
    assert iceberg.inspect(document)["valid"] is True
    assert iceberg.inspect(document, meter=work.append) == iceberg.inspect(document)

    errors = []
    for controls in ({}, {"meter": lambda amount: None}):
        with pytest.raises(_rust.UmfCoreError) as caught:
            iceberg.import_schema("null", "invalid", **controls)
        errors.append((caught.value.code, str(caught.value)))
    assert errors[0] == errors[1]
    for controls, code in (
        ({"max_work": 0}, "RESOURCE_LIMIT"),
        ({"is_cancelled": lambda: True}, "CANCELLED"),
        ({"now": lambda: 5, "deadline_ms": 0}, "DEADLINE"),
    ):
        with pytest.raises(_rust.UmfCoreError) as caught:
            iceberg.inspect(document, **controls)
        assert caught.value.code == code

    events = []
    charge, _ = iceberg._controls(
        None, lambda amount: events.append(("meter", amount)),
        lambda: events.append(("cancel", None)) or False,
        lambda: events.append(("clock", None)) or 0, 10,
    )
    assert charge(1) is None
    assert events == [("meter", 1), ("cancel", None), ("clock", None)]

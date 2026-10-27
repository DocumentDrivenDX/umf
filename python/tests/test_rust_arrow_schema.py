# SPDX-License-Identifier: MIT OR Apache-2.0
"""Focused installed-binding checks for the opt-in Arrow schema profile."""

import pytest
from umf import _rust
from umf import rust_arrow_schema as arrow


def _source():
    return (
        '{"futureRoot":true,"metadata":[{"key":"dup","value":"a"},'
        '{"key":"dup","value":"b"}],"fields":[{"name":"x",'
        '"nullable":true,"futureField":true,"futureText":"\\ud800",'
        '"metadata":[{"key":"dup","value":"a"},{"key":"dup",'
        '"value":"b"}],"type":{"name":"utf8","futureParam":1.000e+3}}]}'
    )


def test_profile_and_all_five_schema_operations_preserve_source_and_copies():
    assert arrow.profile_version() == "umf-r8-arrow-schema/0.1.0"
    source = _source()
    document = arrow.import_schema(source, "arrow-python")

    validation = arrow.inspect(document)
    assert validation["valid"] is True
    assert validation["complete"] is False
    assert arrow.export_schema(document) == source
    assert arrow.get_node(document, "/fields/0/type/futureParam") == {
        "kind": "number",
        "value": "1.000e+3",
    }

    proposal = arrow.propose_node_edit(document, "/fields/0/name", '"edited"')
    assert proposal["validation"]["valid"] is True
    assert arrow.get_node(proposal["document"], "/fields/0/name") == {
        "kind": "string",
        "value": "edited",
    }
    assert arrow.get_node(document, "/fields/0/name") == {
        "kind": "string",
        "value": "x",
    }
    assert arrow.export_schema(document) == source
    proposal["document"]["id"] = "mutated-proposal"
    assert document["id"] == "arrow-python"
    assert arrow.export_schema(document) == source


def test_inspection_diagnostic_order_and_paths_are_preserved():
    document = arrow.import_schema(_source(), "arrow-diagnostics")
    diagnostics = arrow.inspect(document)["diagnostics"]
    assert [(item["code"], item["path"]) for item in diagnostics] == [
        ("ARROW_NATIVE_UNVERIFIED", ""),
        ("ARROW_UNKNOWN", "/futureRoot"),
        ("ARROW_DUPLICATE_METADATA", "/metadata/1"),
        ("ARROW_UNKNOWN", "/fields/0/futureField"),
        ("ARROW_UNKNOWN", "/fields/0/futureText"),
        ("ARROW_DUPLICATE_METADATA", "/fields/0/metadata/1"),
        ("ARROW_UNKNOWN", "/fields/0/type/futureParam"),
    ]


def test_native_error_envelope_and_resource_controls():
    document = arrow.import_schema(_source(), "arrow-controls")
    with pytest.raises(_rust.UmfCoreError) as caught:
        arrow.get_node(document, "/fields/0/notThere")
    assert (caught.value.code, caught.value.path, str(caught.value)) == (
        "JSON_SCHEMA_POINTER", "", "Native JSON Pointer target does not exist"
    )

    work = []
    assert arrow.inspect(document, meter=work.append)["valid"] is True
    assert work and sum(work) > 0
    with pytest.raises(_rust.UmfCoreError) as caught:
        arrow.inspect(document, max_work=0)
    assert caught.value.code == "RESOURCE_LIMIT"
    with pytest.raises(_rust.UmfCoreError) as caught:
        arrow.inspect(document, is_cancelled=lambda: True)
    assert caught.value.code == "CANCELLED"
    with pytest.raises(_rust.UmfCoreError) as caught:
        arrow.inspect(document, now=lambda: 5, deadline_ms=0)
    assert caught.value.code == "DEADLINE"


def test_import_argument_types_and_profile_fail_closed(monkeypatch):
    with pytest.raises(TypeError, match="source and document_id"):
        arrow.import_schema(b"{}", "bad")

    monkeypatch.setattr(arrow._rust._rust_core, "arrow_schema_profile_version", lambda: "wrong")
    with pytest.raises(RuntimeError, match="profile mismatch"):
        arrow.inspect({})

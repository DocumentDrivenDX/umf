# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public Python surface for the Rust Pack Tools source compiler."""

import pytest

from umf import generate_pack_tools
from umf._rust import UmfCoreError


def _request(*, keyed: bool) -> dict:
    pack = {
        "id": "python-smoke",
        "version": "1.0.0",
        "schemas": [{"id": "items", "reference": "items.json", "format": "tablespec"}],
    }
    table = {
        "version": "1.0",
        "table_name": "items",
        "columns": [
            {"name": "id", "data_type": "INTEGER", "nullable": False},
            {"name": "label", "data_type": "VARCHAR", "nullable": False},
        ],
    }
    if keyed:
        table["primary_key"] = ["id"]
    import json

    return {
        "profile": "umf.pack-tools/1",
        "pack": {"id": pack["id"], "version": pack["version"], "text": json.dumps(pack)},
        "sources": [{
            "id": "items",
            "path": "items.json",
            "format": "json",
            "schemaFormat": "tablespec",
            "text": json.dumps(table),
        }],
        "options": {"schema": "public", "package": "python_smoke"},
        "targets": ["ddl", "orm", "crud"],
    }


def test_public_pack_tools_generates_declared_key_outputs():
    result = generate_pack_tools(_request(keyed=True))
    assert result["profile"] == "umf.pack-tools-result/1"
    assert result["status"] == "generated"
    assert result["pack"] == {"id": "python-smoke", "version": "1.0.0"}
    assert {file["kind"] for file in result["files"]} >= {"ddl", "orm", "crud", "source", "report", "readme"}
    crud = next(file["text"] for file in result["files"] if file["kind"] == "crud")
    assert "def create_items" in crud
    assert "def delete_items" in crud
    assert "session.commit()" not in crud


def test_public_pack_tools_returns_explicit_unkeyed_refusal_and_honors_controls():
    result = generate_pack_tools(_request(keyed=False))
    assert result["status"] == "partial"
    assert any(row["code"] == "PACK_TOOLS_CRUD_KEY_REQUIRED" for row in result["diagnostics"])
    with pytest.raises(UmfCoreError) as failure:
        generate_pack_tools(_request(keyed=True), max_work=0)
    assert failure.value.code == "RESOURCE_LIMIT"


def test_public_pack_tools_rejects_profile_mismatch_as_structured_error():
    request = _request(keyed=True)
    request["profile"] = "umf.pack-tools/0"
    with pytest.raises(UmfCoreError) as failure:
        generate_pack_tools(request)
    assert failure.value.code == "REQUEST"

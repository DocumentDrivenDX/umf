# SPDX-License-Identifier: MIT OR Apache-2.0
"""Focused ordinary Python transport check for the native GraphQL wire."""

import json

from umf import _rust


def _call(op, **fields):
    request = {"profile": "umf.graphql-wire/1", "op": f"graphql.{op}", **fields}
    wire = json.dumps(_rust._wire(request), ensure_ascii=True, separators=(",", ":"))
    response = _rust._rust_core.execute_graphql_wire(wire)
    return _rust._from_wire(json.loads(_rust._checked_envelope(response)))


def test_graphql_import_export_roundtrip_through_native_python_transport():
    assert _rust._rust_core.graphql_profile_version() == "umf.graphql-wire/1"
    source = "type Query { hello: String }\n"
    document = _call("import", source=source, id="python-graphql", mode="schema")
    assert document["id"] == "python-graphql"
    assert _call("export", document=document) == source

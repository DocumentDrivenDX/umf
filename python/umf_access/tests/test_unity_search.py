"""Fault controls over an actual compiler program; no native acceptance claim."""

from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path
from typing import ClassVar

from umf_access.adoption import TargetIdentity
from umf_access.catalog import TargetPin
from umf_access.native_program import NativeProgram, canonical_json
from umf_access.search_catalog import SearchEntry, SearchVariant
from umf_access.types import StrictModel
from umf_access.unity_search import (
    NativeHydration,
    UnityCatalogSearchTarget,
    UnitySearchError,
    _candidates,
)


class Row(StrictModel):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "a" * 64
    id: str
    body: str


class Key(StrictModel):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "a" * 64
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("search", "id", "id"),)
    id: str


def fixture():
    raw = (Path(__file__).parent / "fixtures/unity-search-ann-compiler-r2.json").read_text()
    program = json.loads(raw)
    statement = program["hydration"]["statement"]
    native = NativeProgram(raw, canonical_json({"/hydration/statement": {
        "sql": statement["sql"], "order": list(range(len(statement["parameters"])))
    }}), "a" * 64)
    identity = TargetIdentity("unity-catalog", "weft-databricks", "0.1", "weft.unity-search/0.1", "b" * 64, (("fixture", "1"),))
    pin = TargetPin(identity.kind, identity.backend_id, identity.backend_version, identity.target_profile, identity.binding_sha256, (("fixture", ("1",)),))
    variant = SearchVariant((), pin, (SearchEntry(native, Row, Key, "vector"),), (), 3)
    return program, identity, variant


class Transport:
    def __init__(self, program):
        self.program = program
        expected = program["obligations"]["nativeIndex"]
        self.metadata = {
            "name": expected["name"], "endpoint_name": expected["endpointName"],
            "index_type": "DIRECT_ACCESS", "primary_key": expected["primaryKey"],
            "status": {"ready": True},
            "direct_access_index_spec": {
                "embedding_vector_columns": [{"name": expected["vectorColumn"], "embedding_dimension": expected["dimensions"]}],
                "schema_json": json.dumps({"id": "string", "body": "string", "embedding": "array<float>"}),
            },
        }
        self.calls = []
        self.subject = "reader@example.test"
        self.fail_key = None
        self.change_principal = False
        self.change_table = False
        self.duplicate = False

    def principal(self, *, deadline):
        return "changed@example.test" if self.change_principal and self.calls else self.subject

    def index_metadata(self, name, *, deadline):
        return copy.deepcopy(self.metadata)

    def query_index(self, method, path, body, *, deadline):
        assert method == "POST" and path == self.program["query"]["path"]
        assert body["query_vector"] == [1.0, 0.0, 0.0]
        assert body["num_results"] == 3
        return {"manifest": {"column_count": 2, "columns": [{"name": "id"}, {"name": "score"}]},
                "result": {"row_count": 3, "data_array": [["deleted", 0.9], ["filtered", 0.8], ["valid", 0.7]]}}

    def read_current(self, table, statement, parameters, *, deadline):
        assert statement == self.program["hydration"]["statement"]["sql"]
        key = parameters["p1"]
        self.calls.append(key)
        if key == self.fail_key:
            raise PermissionError("original native SELECT denial")
        rows = (("valid", "current body", "valid"),) if key == "valid" else ()
        if self.duplicate:
            rows = rows + rows
        return NativeHydration(("id", "body", "__umf_key_0"), rows,
                               table["id"], "repointed" if self.change_table else table["id"], self.subject, self.subject)


class UnitySearchTests(unittest.TestCase):
    def run_search(self, transport, identity, variant):
        return UnityCatalogSearchTarget(transport, identity).search(variant, {"vector": (1.0, 0.0, 0.0)})

    def test_preserves_native_rank_and_never_refills_stale_hits(self):
        program, identity, variant = fixture()
        transport = Transport(program)
        result = self.run_search(transport, identity, variant)
        self.assertEqual(transport.calls, ["deleted", "filtered", "valid"])
        self.assertEqual(result.stale, 2)
        self.assertTrue(result.approximate)
        self.assertTrue(result.partial)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].rank, 3)
        self.assertEqual(result[0].item, Row(id="valid", body="current body"))
        self.assertEqual(result[0].score.kind, "implementation-defined")

    def test_native_denial_propagates_without_refill(self):
        program, identity, variant = fixture()
        transport = Transport(program)
        transport.fail_key = "filtered"
        with self.assertRaisesRegex(PermissionError, "original native"):
            self.run_search(transport, identity, variant)
        self.assertEqual(transport.calls, ["deleted", "filtered"])

    def test_unready_index_refuses_before_candidate_query(self):
        for ready in (False, None, 1, "true"):
            program, identity, variant = fixture()
            transport = Transport(program)
            transport.metadata["status"]["ready"] = ready
            with self.subTest(ready=ready), self.assertRaises(UnitySearchError):
                self.run_search(transport, identity, variant)
            self.assertEqual(transport.calls, [])

    def test_closing_principal_table_and_duplicate_key_refuse_release(self):
        for field in ("change_principal", "change_table", "duplicate"):
            program, identity, variant = fixture()
            transport = Transport(program)
            setattr(transport, field, True)
            with self.subTest(fault=field), self.assertRaises(UnitySearchError):
                self.run_search(transport, identity, variant)

    def test_corrupt_native_candidate_inventory_refuses(self):
        original = {"manifest": {"column_count": 2, "columns": [{"name": "id"}, {"name": "score"}]},
                    "result": {"row_count": 1, "data_array": [["valid", 0.7]]}}
        mutations = [
            lambda v: v["result"].update(row_count=2),
            lambda v: v["result"].update(row_count=True),
            lambda v: v["manifest"].update(column_count=1),
            lambda v: v["result"]["data_array"][0].__setitem__(0, 1),
            lambda v: v["result"]["data_array"][0].__setitem__(1, float("nan")),
            lambda v: v.update(next_page_token="unconsumed"),
        ]
        for mutate in mutations:
            value = copy.deepcopy(original)
            mutate(value)
            with self.subTest(mutation=mutate), self.assertRaises(UnitySearchError):
                _candidates(value, "id", 3)


if __name__ == "__main__":
    unittest.main()

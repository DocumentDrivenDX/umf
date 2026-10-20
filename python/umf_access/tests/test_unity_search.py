# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fault controls over an actual compiler program; no native acceptance claim."""

from __future__ import annotations

import copy
import json
import unittest
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from typing import ClassVar
from unittest.mock import patch

from umf_access.adoption import TargetIdentity
from umf_access.catalog import TargetPin
from umf_access.native_program import NativeProgram, canonical_json
from umf_access.search_catalog import SearchEntry, SearchVariant
from umf_access.targets import TargetMismatch
from umf_access.types import StrictModel
from umf_access.unity_search import (
    NativeHydration,
    NativeSearchVerification,
    UnityCatalogSearchTarget,
    UnitySearchError,
    _candidates,
    _native_value,
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
    raw = (Path(__file__).parent / "fixtures/unity-search-ann-current-010.json").read_text()
    program = json.loads(raw)
    statement = program["hydration"]["statement"]
    native = NativeProgram(raw, canonical_json({"/hydration/statement": {
        "sql": statement["sql"], "order": list(range(len(statement["parameters"])))
    }}), "a" * 64)
    identity = TargetIdentity("unity-catalog", "weft-databricks", "0.1", "weft.unity-search/0.1", "b" * 64, (("databricks-sql", "fixture-version"),))
    pin = TargetPin(identity.kind, identity.backend_id, identity.backend_version, identity.target_profile, identity.binding_sha256, (("databricks-sql", ("fixture-version",)),))
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
        self.platform_version = "fixture-version"

    def platform(self, *, deadline):
        return (("databricks-sql", self.platform_version),)

    def verify_current(self, table, *, deadline):
        return NativeSearchVerification(table["id"], "repointed" if self.change_table else table["id"], self.subject, self.subject)

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
        names = tuple(output["name"] for output in self.program["hydration"]["outputs"] + self.program["hydration"]["hiddenKey"])
        values = {
            "id": key,
            "body": "current body",
            "embedding": [1.0, 0.0, 0.0],
            "count": 1,
            "amount": Decimal("1.0000000000"),
            "payload": b"\x00",
            "__umf_key_0": key,
        }
        rows = (tuple(values[name] for name in names),) if key == "valid" else ()
        if self.duplicate:
            rows = rows + rows
        return NativeHydration(names, rows,
                               table["id"], "repointed" if self.change_table else table["id"], self.subject, self.subject)


class UnitySearchTests(unittest.TestCase):
    def test_empty_candidates_still_require_current_native_table_admission(self):
        program, identity, variant = fixture()
        transport = Transport(program)
        transport.change_table = True
        target = UnityCatalogSearchTarget(transport, identity)
        with patch.object(transport, "query_index") as query:
            with self.assertRaises(UnitySearchError):
                target.search(variant, {"vector": (1.0, 0.0, 0.0)})
            query.assert_not_called()
        transport.change_table = False
        empty = {"manifest": {"column_count": 1, "columns": [{"name": "id"}]},
                 "result": {"row_count": 0, "data_array": []}}
        valid = NativeSearchVerification(program["obligations"]["currentTableId"], program["obligations"]["currentTableId"], transport.subject, transport.subject)
        changed = NativeSearchVerification("changed", "changed", transport.subject, transport.subject)
        with patch.object(transport, "query_index", return_value=empty), patch.object(transport, "verify_current", side_effect=[valid, changed]), self.assertRaises(UnitySearchError):
            target.search(variant, {"vector": (1.0, 0.0, 0.0)})

    def test_eager_verification_observes_native_platform_table_and_index(self):
        program, identity, variant = fixture()
        transport = Transport(program)
        target = UnityCatalogSearchTarget(transport, identity, catalog_variants=(variant,))
        self.assertEqual(target.identity(), identity)
        target.verify()
        self.assertEqual(transport.calls, [])
        transport.change_table = True
        with self.assertRaises(TargetMismatch):
            target.verify()
        transport.change_table = False
        transport.platform_version = "changed"
        for operation in (target.identity, target.verify):
            with self.assertRaises(TargetMismatch):
                operation()
        with self.assertRaises(UnitySearchError):
            target.search(variant, {"vector": (1.0, 0.0, 0.0)})

    def test_default_deadline_and_eager_inventory_are_required(self):
        program, identity, _ = fixture()
        for timeout in (0, None, timedelta(0), timedelta(seconds=-1), timedelta(seconds=121)):
            with self.subTest(timeout=timeout), self.assertRaises(ValueError):
                UnityCatalogSearchTarget(Transport(program), identity, timeout=timeout)
        with self.assertRaisesRegex(TargetMismatch, "explicit catalog"):
            UnityCatalogSearchTarget(Transport(program), identity).verify()

    def test_expired_call_refuses_before_any_native_operation(self):
        program, identity, variant = fixture()
        transport = Transport(program)
        target = UnityCatalogSearchTarget(transport, identity)
        with patch.object(transport, "platform") as platform, patch.object(transport, "principal") as principal:
            with self.assertRaises(TimeoutError):
                target.search(variant, {"vector": (1.0, 0.0, 0.0)}, timeout=timedelta(0))
            for timeout in (0, timedelta(seconds=-1), timedelta(seconds=121)):
                with self.subTest(timeout=timeout), self.assertRaises(ValueError):
                    target.search(variant, {"vector": (1.0, 0.0, 0.0)}, timeout=timeout)
            platform.assert_not_called()
            principal.assert_not_called()
        self.assertEqual(transport.calls, [])

    def test_native_exact_projection_carriers_never_round_or_invent_null(self):
        value = Decimal("1.2300")
        self.assertIs(_native_value({"carrier": "decimal"}, value), value)
        binary = bytearray(b"\x00\xff")
        decoded = _native_value({"carrier": "binary"}, binary)
        binary[0] = 1
        self.assertEqual(decoded, b"\x00\xff")
        self.assertEqual(_native_value({"carrier": "integer"}, 42), 42)
        self.assertIsNone(_native_value({"carrier": "vector", "nullable": True}, None))
        for carrier, wrong in (("integer", True), ("integer", Decimal(1)), ("decimal", 0.1), ("binary", "AA=="), ("string", None)):
            with self.subTest(carrier=carrier), self.assertRaises(UnitySearchError):
                _native_value({"carrier": carrier}, wrong)

    def test_native_vector_projection_preserves_exact_float32_values(self):
        output = {"carrier": "vector", "dimensions": 3, "nativeType": "array<float>"}
        self.assertEqual(_native_value(output, [1.0, 0.0, -0.0]), (1.0, 0.0, -0.0))
        for value in ([1, 0, 0], [0.1, 0.0, 0.0], [float("nan"), 0.0, 0.0], [1.0]):
            with self.subTest(value=value), self.assertRaises(ValueError):
                _native_value(output, value)
        with self.assertRaises(UnitySearchError):
            _native_value({**output, "nativeType": "array<double>"}, [1.0, 0.0, 0.0])

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

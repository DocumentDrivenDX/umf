"""Offline transport-seam controls over actual original-compiled catalog."""

import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "offline-platform-generated"))
import native_runner as runner
from search_docs import queries

UUID = "00000000-0000-0000-0000-000000000001"


class IO:
    def __init__(self):
        self.calls = []
        self.denied = False
        self.foreign = False
        self.query_count = 0

    def sql(self, sql, parameters, *, deadline):
        self.calls.append((sql, dict(parameters)))
        assert deadline > time.monotonic()
        if sql == "SELECT current_user() AS principal":
            return runner.SQLRows(("principal",), (("native-test-principal",),))
        if sql == "SELECT version() AS native_version":
            return runner.SQLRows(("native_version",), (("OFFLINE-NOT-NATIVE",),))
        if sql == "DESCRIBE DETAIL " + runner.TABLE:
            return runner.SQLRows(
                ("id", "name", "format"),
                (("wrong" if self.foreign else UUID, runner.TABLE, "delta"),),
            )
        if sql.endswith(" LIMIT 0"):
            if self.denied:
                raise PermissionError("native denial simulation")
            return runner.SQLRows(("id",), ())
        originals = [
            p.variants[0].entries[0].artifact()["hydration"]["statement"]
            for p in (queries._S0, queries._S1, queries._S2)
        ]
        statement = next((s for s in originals if s["sql"] == sql), None)
        assert statement is not None, "unidentified SQL"
        assert set(parameters) == {p["name"] for p in statement["parameters"]}
        if self.denied:
            raise PermissionError("native denial simulation")
        key = next(
            parameters[p["name"]]
            for p in statement["parameters"]
            if p["source"] == {"candidateKey": 0}
        )
        return runner.SQLRows(
            ("col_0", "col_1", "__umf_key_0"),
            (("d0", "running", "d0"),) if key == "d0" else (),
        )

    def api(self, method, path, body, *, deadline):
        assert deadline > time.monotonic()
        if method == "GET":
            assert path == "/api/2.0/vector-search/indexes/" + runner.INDEX
            return {
                "name": runner.INDEX,
                "endpoint_name": runner.ENDPOINT,
                "index_type": "DIRECT_ACCESS",
                "primary_key": "id",
                "status": {"ready": True},
                "direct_access_index_spec": {
                    "embedding_vector_columns": [
                        {"name": "embedding", "embedding_dimension": 3}
                    ],
                    "schema_json": '{"id":"string","body":"string","embedding":"array<float>"}',
                },
            }
        assert (
            method == "POST"
            and path == "/api/2.0/vector-search/indexes/" + runner.INDEX + "/query"
        )
        self.query_count += 1
        assert body["query_vector"] == [1.0, 0.0, 0.0] and body["num_results"] == 4
        assert body["query_type"] in ("ANN", "HYBRID")
        if body["query_type"] == "HYBRID":
            assert body["query_text"] == "running"
        return {
            "manifest": {
                "column_count": 2,
                "columns": [{"name": "id"}, {"name": "score"}],
            },
            "result": {
                "row_count": 3,
                "data_array": [["deleted", 0.9], ["filtered", 0.8], ["d0", 0.7]],
            },
        }


class Controls(unittest.TestCase):
    def test_actual_generated_ann_filtered_hybrid_preserve_candidates_and_no_refill(
        self,
    ):
        io = IO()
        results, calls = runner.run_queries(queries, io, UUID, "OFFLINE-NOT-NATIVE")
        self.assertEqual(io.query_count, 3)
        for r in results.values():
            self.assertEqual(len(r), 1)
            self.assertEqual(r.stale, 2)
            self.assertEqual(r[0].rank, 3)
            self.assertEqual(r[0].item, ("d0", "running"))
            self.assertTrue(r.partial)
            self.assertTrue(r.approximate)
        self.assertGreater(len(calls), 0)

    def test_current_native_permission_error_never_becomes_empty(self):
        io = IO()
        io.denied = True
        with self.assertRaises(PermissionError):
            runner.run_queries(queries, io, UUID, "OFFLINE-NOT-NATIVE")
        self.assertEqual(io.query_count, 0)

    def test_uuid_refusal_before_candidate_query(self):
        io = IO()
        io.foreign = True
        with self.assertRaises(ValueError):
            runner.run_queries(queries, io, UUID, "OFFLINE-NOT-NATIVE")
        self.assertEqual(io.query_count, 0)

    def test_foreign_endpoint_and_query_paths_refuse(self):
        t = runner.Transport(IO(), UUID, "OFFLINE-NOT-NATIVE")
        with self.assertRaises(ValueError):
            t.index_metadata("shared.production", deadline=time.monotonic() + 5)
        with self.assertRaises(ValueError):
            t.query_index("GET", "/foreign", {}, deadline=time.monotonic() + 5)

    def test_exact_deadline_before_sql_and_host_embedder(self):
        io = IO()
        t = runner.Transport(io, UUID, "OFFLINE-NOT-NATIVE")
        with self.assertRaises(TimeoutError):
            t.principal(deadline=time.monotonic() - 1)
        self.assertEqual(io.calls, [])
        with self.assertRaises(ValueError):
            runner.Embedder().embed(["external service"])


if __name__ == "__main__":
    unittest.main()

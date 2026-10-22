import copy
import json
import tempfile
import time
import unittest
from pathlib import Path
from typing import ClassVar
from unittest.mock import patch

import transport as t
from lifecycle import Resources

PLAN = json.loads((Path(__file__).parent / "native-plan.json").read_text())


class Sock:
    def getpeercert(self, **k):
        return b"native-certificate"

    def settimeout(self, x):
        assert x > 0


class Response:
    def __init__(self, status, raw):
        self.status = status
        self.raw = raw

    def read1(self, n):
        b = self.raw[:n]
        self.raw = self.raw[n:]
        return b


class Conn:
    calls: ClassVar[list] = []
    status = 200
    raw = b"{}"
    close_socket = False

    def __init__(self, host, port, **kwargs):
        assert host == t.HOST and port == 443
        self.sock = Sock()
        self.closed = False
        Conn.calls.append(self)

    def connect(self):
        pass

    def request(self, *args):
        self.args = args

    def getresponse(self):
        if self.close_socket:
            self.sock = None
        return Response(self.status, self.raw)

    def close(self):
        self.closed = True


class FakeHTTP:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def request(self, m, p, b, **k):
        self.calls.append((m, p, b))
        return copy.deepcopy(self.reply)


def result(rows=(("a",),)):
    return {
        "manifest": {
            "format": "JSON_ARRAY",
            "truncated": False,
            "total_row_count": len(rows),
            "total_chunk_count": 1,
            "chunks": [{"chunk_index": 0, "row_count": len(rows), "row_offset": 0}],
            "schema": {
                "column_count": 1,
                "columns": [
                    {"position": 0, "name": "principal", "type_name": "STRING"}
                ],
            },
        },
        "result": {
            "chunk_index": 0,
            "row_count": len(rows),
            "row_offset": 0,
            "data_array": [list(r) for r in rows],
        },
    }


class Controls(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.p = Path(self.tmp.name)
        Conn.calls = []
        Conn.status = 200
        Conn.raw = b"{}"
        Conn.close_socket = False

    def tearDown(self):
        self.tmp.cleanup()

    def http(self):
        return t.HTTPS("never-retained-test-token", self.p / "http")

    def test_hardheld_entrypoint_and_missing_fence_zero_business(self):
        fake = FakeHTTP({})
        io = t.NativeIO(
            fake,
            [
                {
                    "hydration": {
                        "statement": {
                            "sql": "ORIGINAL",
                            "parameters": [{"name": "p1", "carrier": "string"}],
                        }
                    }
                }
            ],
        )
        with self.assertRaises(t.CapabilityMissing):
            io.native_entrypoint()
        with self.assertRaises(t.CapabilityMissing):
            io.sql("ORIGINAL", {"p1": "a"}, deadline=time.monotonic() + 5)
        self.assertEqual(fake.calls, [])
        r = Resources(io, PLAN, self.p / "resources")
        with self.assertRaises(t.CapabilityMissing):
            r.execute(None)
        self.assertEqual(fake.calls, [])

    def test_connection_close_retains_socket_and_exact_raw_no_token(self):
        Conn.close_socket = True
        Conn.raw = b'{"ok":true}'
        with patch.object(t.http.client, "HTTPSConnection", Conn):
            self.assertEqual(
                self.http().request(
                    "GET", t.EP + "/" + t.ENDPOINT, None, deadline=time.monotonic() + 1
                ),
                {"ok": True},
            )
        self.assertEqual(len(Conn.calls), 1)
        self.assertTrue(Conn.calls[0].closed)
        self.assertEqual((self.p / "http/000-response.bin").read_bytes(), Conn.raw)
        self.assertNotIn(
            "never-retained-test-token",
            "".join(p.read_text() for p in (self.p / "http").glob("*.json")),
        )

    def test_no_redirect_retry_and_foreign_resource_refusal(self):
        Conn.status = 302
        with patch.object(t.http.client, "HTTPSConnection", Conn):
            h = self.http()
            with self.assertRaises(t.NativeHTTPError):
                h.request(
                    "GET", t.EP + "/" + t.ENDPOINT, None, deadline=time.monotonic() + 1
                )
            with self.assertRaises(t.Refused):
                h.request(
                    "GET", t.EP + "/production", None, deadline=time.monotonic() + 1
                )
            with self.assertRaises(t.Refused):
                h.request(
                    "POST", t.EP, {"name": "foreign"}, deadline=time.monotonic() + 1
                )
        self.assertEqual(len(Conn.calls), 1)

    def test_malformed_raw_write_and_serverfail_indeterminate(self):
        Conn.raw = b"\xff"
        with (
            patch.object(t.http.client, "HTTPSConnection", Conn),
            self.assertRaises(t.UncertainDispatch),
        ):
            self.http().request(
                "POST",
                t.EP,
                PLAN["endpoint"]["body"],
                deadline=time.monotonic() + 1,
            )
        self.assertEqual((self.p / "http/000-response.bin").read_bytes(), b"\xff")

    def test_expired_absolute_budget_zero_connection(self):
        with (
            patch.object(t.http.client, "HTTPSConnection", Conn),
            self.assertRaises(TimeoutError),
        ):
            self.http().request(
                "GET", t.EP + "/" + t.ENDPOINT, None, deadline=time.monotonic() - 1
            )
        self.assertEqual(Conn.calls, [])

    def test_manifest_rejects_incomplete_external_boolean_arity_types(self):
        good = result()
        self.assertEqual(t.complete_rows(good)[1], (("a",),))
        for mutation in ("truncated", "external", "bool", "arity", "schema"):
            x = copy.deepcopy(good)
            if mutation == "truncated":
                x["manifest"]["truncated"] = True
            if mutation == "external":
                x["result"]["external_links"] = ["evil"]
            if mutation == "bool":
                x["manifest"]["total_row_count"] = True
            if mutation == "arity":
                x["result"]["data_array"] = [[]]
            if mutation == "schema":
                x["manifest"]["schema"]["columns"][0]["position"] = True
            with self.subTest(mutation=mutation), self.assertRaises(t.Refused):
                t.complete_rows(x)

    def test_original_parameter_inventory_and_unknown_sql_refuse(self):
        fake = FakeHTTP({})
        io = t.NativeIO(
            fake,
            [
                {
                    "hydration": {
                        "statement": {
                            "sql": "ORIGINAL",
                            "parameters": [{"name": "p1", "carrier": "string"}],
                        }
                    }
                }
            ],
        )
        for s, p in [
            ("ORIGINAL", {"p1": None}),
            ("ORIGINAL", {"wrong": "x"}),
            ("invented", {}),
        ]:
            with self.assertRaises(t.Refused):
                io.sql(s, p, deadline=time.monotonic() + 1)
        self.assertEqual(fake.calls, [])

    def test_native_principal_mismatch_is_not_equivalence(self):
        fake = FakeHTTP({"id": "native-id", "userName": "actorA"})
        io = t.NativeIO(fake, [])
        with (
            patch.object(io, "_statement", return_value=result((("actorB",),))),
            self.assertRaises(t.CapabilityMissing),
        ):
            io.observe_principal_equivalence(deadline=time.monotonic() + 1)

    def test_create_ack_without_uuid_remains_pending_no_guessed_delete(self):
        class IO:
            def __init__(self):
                self.calls = []

            def api(self, m, p, b, **k):
                self.calls.append((m, p, b))
                if len(self.calls) == 1:
                    raise t.NativeHTTPError(404)
                if m == "POST":
                    return {}
                return {
                    "name": t.ENDPOINT,
                    "endpoint_type": "STANDARD",
                    "creation_timestamp": 1,
                    "creator": "actor",
                }

        io = IO()
        r = Resources(io, PLAN, self.p / "resources")
        with self.assertRaises((t.Refused, TypeError, ValueError, AttributeError)):
            r._create("endpoint", time.monotonic() + 1)
        self.assertTrue(r.ledger["endpoint"]["acknowledged"])
        self.assertEqual(r.owned, {})
        cleanup = r.cleanup(deadline=time.monotonic() + 1)
        self.assertFalse(cleanup["complete"])
        self.assertEqual(cleanup["pendingUnidentifiedCreations"], ["endpoint"])
        self.assertFalse(any(c[0] == "DELETE" for c in io.calls))

    def test_cleanup_changed_native_identity_no_delete(self):
        r = Resources(object(), PLAN, self.p / "resources")
        r.owned["endpoint"] = {"id": "old"}
        r.ledger["endpoint"] = {}
        with patch.object(r, "identity", return_value={"id": "new"}):
            cleanup = r.cleanup(deadline=time.monotonic() + 1)
        self.assertFalse(cleanup["complete"])
        self.assertEqual(cleanup["resources"]["endpoint"]["errorType"], "Refused")

    def test_foreign_plan_refuses_constructor(self):
        wrong = copy.deepcopy(PLAN)
        wrong["endpoint"]["body"]["name"] = "prod"
        with self.assertRaises(t.Refused):
            Resources(object(), wrong, self.p / "resources")

    def test_original_statement_bytes_bindings_and_native_schema_retained(self):
        reply = result()
        reply["statement_id"] = "00000000-0000-0000-0000-000000000001"
        reply["status"] = {"state": "SUCCEEDED"}
        fake = FakeHTTP(reply)
        io = t.NativeIO(fake, [])
        sql = "SELECT :p1 AS principal /* original whitespace */"
        returned = io._statement(
            sql, {"p1": "e\u0301%\\"}, deadline=time.monotonic() + 2
        )
        self.assertEqual(returned, reply)
        request = fake.calls[0][2]
        self.assertEqual(request["statement"], sql)
        self.assertEqual(
            request["parameters"],
            [{"name": "p1", "type": "STRING", "value": "e\u0301%\\"}],
        )

    def test_server_error_write_is_uncertain_never_retried(self):
        Conn.status = 503
        with (
            patch.object(t.http.client, "HTTPSConnection", Conn),
            self.assertRaises(t.UncertainDispatch),
        ):
            self.http().request(
                "POST",
                t.EP,
                PLAN["endpoint"]["body"],
                deadline=time.monotonic() + 1,
            )
        self.assertEqual(len(Conn.calls), 1)

    def test_slow_read_consumes_original_deadline_and_retains_partial(self):
        clock = [0.0]

        class Slow(Response):
            def read1(self, n):
                clock[0] = 2.0
                return b"partial"

        class C(Conn):
            def getresponse(self):
                return Slow(200, b"")

        with (
            patch.object(t.time, "monotonic", side_effect=lambda: clock[0]),
            patch.object(t.http.client, "HTTPSConnection", C),
            self.assertRaises(TimeoutError),
        ):
            self.http().request("GET", t.EP + "/" + t.ENDPOINT, None, deadline=1.0)
        self.assertEqual((self.p / "http/000-response.bin").read_bytes(), b"partial")
        self.assertFalse(
            json.loads((self.p / "http/000-response.json").read_text())["complete"]
        )

    def test_pending_statement_cancel_uses_original_sid_and_separate_bound(self):
        sid = "00000000-0000-0000-0000-000000000001"

        class H:
            def __init__(self):
                self.calls = []

            def request(self, m, p, b, **k):
                self.calls.append((m, p, b, k))
                if len(self.calls) == 1:
                    return {"statement_id": sid, "status": {"state": "RUNNING"}}
                if p.endswith("/cancel"):
                    return {}
                raise TimeoutError("native poll deadline")

        h = H()
        io = t.NativeIO(h, [])
        with patch.object(t.time, "sleep"), self.assertRaises(TimeoutError):
            io._statement("SELECT 1", {}, deadline=time.monotonic() + 1)
        self.assertEqual([c[0] for c in h.calls], ["POST", "GET", "POST"])
        self.assertTrue(h.calls[-1][1].endswith(sid + "/cancel"))

    def test_native_column_type_not_coerced_to_float_or_other_carrier(self):
        reply = result((("0.1",),))
        reply["manifest"]["schema"]["columns"][0]["type_name"] = "FLOAT"
        columns, rows = t.complete_rows(reply)
        self.assertEqual(columns[0]["type_name"], "FLOAT")
        self.assertEqual(rows, (("0.1",),))

    def test_fixed_sql_returns_original_shared_row_type_without_coercion(self):
        reply = result()
        reply["statement_id"] = "00000000-0000-0000-0000-000000000001"
        reply["status"] = {"state": "SUCCEEDED"}
        fake = FakeHTTP(reply)
        io = t.NativeIO(fake, [])
        rows = io.sql(
            "SELECT current_user() AS principal", {}, deadline=time.monotonic() + 2
        )
        from native_runner import SQLRows

        self.assertIsInstance(rows, SQLRows)
        self.assertEqual(rows.rows, (("a",),))

    def test_native_principal_success_remains_observation_not_authority(self):
        fake = FakeHTTP({"id": "native-id", "userName": "actorA"})
        io = t.NativeIO(fake, [])
        with patch.object(io, "_statement", return_value=result((("actorA",),))):
            proof = io.observe_principal_equivalence(deadline=time.monotonic() + 1)
        self.assertFalse(proof["independentActorQualified"])
        self.assertEqual(proof["effectiveRoleObservation"], "UNOBSERVED")

    def test_unknown_cleanup_identity_and_uncertain_submission_cannot_complete(self):
        r = Resources(object(), PLAN, self.p / "resources")
        r.ledger["index"] = {"submissionAttempted": True, "acknowledged": False}
        r.uncertain = True
        proof = r.cleanup(deadline=time.monotonic() + 1)
        self.assertFalse(proof["complete"])
        self.assertEqual(proof["pendingUnidentifiedCreations"], ["index"])

    def test_empty_ack_only_known_delete_cancel_stop_routes(self):
        routes = [
            ("DELETE", t.EP + "/" + t.ENDPOINT),
            ("DELETE", t.IX + "/" + t.INDEX),
            (
                "POST",
                "/api/2.0/sql/statements/00000000-0000-0000-0000-000000000001/cancel",
            ),
            ("POST", "/api/2.0/sql/warehouses/" + t.WAREHOUSE + "/stop"),
        ]
        Conn.status = 204
        Conn.raw = b""
        with patch.object(t.http.client, "HTTPSConnection", Conn):
            h = self.http()
            for method, path in routes:
                self.assertEqual(
                    h.request(
                        method,
                        path,
                        None if method == "DELETE" or path.endswith("/stop") else {},
                        deadline=time.monotonic() + 1,
                    ),
                    {},
                )
            with self.assertRaises(t.UncertainDispatch):
                h.request(
                    "POST",
                    t.EP,
                    PLAN["endpoint"]["body"],
                    deadline=time.monotonic() + 1,
                )
            with self.assertRaises(t.Refused):
                h.request(
                    "GET", t.EP + "/" + t.ENDPOINT, None, deadline=time.monotonic() + 1
                )
        self.assertEqual(len(Conn.calls), 6)

    def test_work_budget_exhaustion_does_not_consume_cleanup_or_stop(self):
        with patch.object(t.http.client, "HTTPSConnection", Conn):
            h = self.http()
            h.phase_counts["work"] = 240
            with self.assertRaises(t.Refused):
                h.request(
                    "GET", t.EP + "/" + t.ENDPOINT, None, deadline=time.monotonic() + 1
                )
            for phase in ("cleanup", "warehouse-stop"):
                self.assertEqual(
                    h.request(
                        "GET",
                        t.EP + "/" + t.ENDPOINT,
                        None,
                        deadline=time.monotonic() + 1,
                        phase=phase,
                    ),
                    {},
                )
            h.phase_counts["cleanup"] = 40
            with self.assertRaises(t.Refused):
                h.request(
                    "GET",
                    t.EP + "/" + t.ENDPOINT,
                    None,
                    deadline=time.monotonic() + 1,
                    phase="cleanup",
                )
        self.assertEqual(len(Conn.calls), 2)

    def test_sql_missing_statement_id_records_creation_uncertainty(self):
        class H:
            def request(self, method, path, body, **kwargs):
                if method == "GET":
                    raise t.NativeHTTPError(404)
                return {"status": {"state": "SUCCEEDED"}}

        io = t.NativeIO(H(), [])
        r = Resources(io, PLAN, self.p / "resources")
        with self.assertRaises(t.UncertainDispatch):
            r._create("table", time.monotonic() + 5)
        self.assertTrue(r.uncertain)
        self.assertFalse(r.ledger["table"]["acknowledged"])
        self.assertEqual(r.owned, {})

    def test_provisioning_sixty_bounded_observations_not_quarter_second_loop(self):
        class HTTP:
            phase = "work"

        class IO:
            def __init__(self):
                self.http = HTTP()
                self.calls = 0

            def api(self, *args, **kwargs):
                self.calls += 1
                return {"endpoint_status": {"state": "PROVISIONING"}}

        io = IO()
        r = Resources(io, PLAN, self.p / "resources")
        with patch("lifecycle.time.sleep") as sleep, self.assertRaises(TimeoutError):
            r._wait_ready("endpoint", time.monotonic() + 300)
        self.assertEqual(io.calls, 60)
        self.assertEqual(sleep.call_count, 60)
        self.assertEqual(io.http.phase, "work")
        self.assertTrue(all(4.9 <= call.args[0] <= 5 for call in sleep.call_args_list))

    def test_index_identity_uses_documented_securable_manifest_not_table_type(self):
        class IO:
            wrong = False

            def api(self, method, path, body, **kwargs):
                if path.startswith(t.UC):
                    response = {
                        "full_name": t.INDEX,
                        "table_type": "MANAGED",
                        "data_source_format": "VECTOR_INDEX_FORMAT",
                        "created_at": 1,
                        "owner": "actor",
                        "table_id": "00000000-0000-0000-0000-000000000002",
                        "securable_kind_manifest": {
                            "securable_type": "TABLE",
                            "securable_kind": "TABLE_ONLINE_VECTOR_INDEX_DIRECT",
                        },
                    }
                    if self.wrong:
                        response.pop("securable_kind_manifest")
                        response["table_type"] = "TABLE_ONLINE_VECTOR_INDEX_DIRECT"
                    return response
                return PLAN["index"]["body"]

        io = IO()
        r = Resources(io, PLAN, self.p / "resources")
        proof = r.identity("index", deadline=time.monotonic() + 1)
        self.assertEqual(proof["id"], "00000000-0000-0000-0000-000000000002")
        io.wrong = True
        with self.assertRaises(t.Refused):
            r.identity("index", deadline=time.monotonic() + 1)

    def test_duplicate_and_nonjson_numeric_members_refuse_without_losing_raw(self):
        for raw in (b'{"id":"a","id":"b"}', b'{"score":NaN}', b'{"score":Infinity}'):
            with self.subTest(raw=raw), self.assertRaises(t.Refused):
                t.strict_native_object(raw)


if __name__ == "__main__":
    unittest.main()

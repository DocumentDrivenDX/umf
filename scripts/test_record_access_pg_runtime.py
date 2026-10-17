from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "capture", str(Path(__file__).with_name("record-access-pg-runtime.py"))
)
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class CaptureTests(unittest.TestCase):
    def test_connection_identity_never_substitutes_startup_login_for_effective_role(self):
        info = types.SimpleNamespace(backend_pid=101, dbname="fixture", user="login", host="/private/tmp/owned", port=55513)
        connection = types.SimpleNamespace(info=info, pgconn=types.SimpleNamespace(backend_pid=101))
        cursor = types.SimpleNamespace(connection=connection)
        observed = capture.connection_identity(cursor)
        self.assertEqual(observed["startupUser"], "login")
        self.assertEqual(observed["sessionUser"], "UNOBSERVED")
        self.assertEqual(observed["effectiveUser"], "UNOBSERVED")
        self.assertEqual(observed["backendPid"], 101)
        connection.pgconn.backend_pid = 102
        with self.assertRaises(ValueError):
            capture.connection_identity(cursor)
        connection.pgconn.backend_pid = 101
        info.port = "55513"
        with self.assertRaises(ValueError):
            capture.connection_identity(cursor)

    def run_capture(
        self,
        body,
        *,
        error=None,
        broken=False,
        cached=False,
        conversion_count=1,
        converted_none=False,
    ):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            package = root / "umf_access"
            package.mkdir()
            script = package / "native_actions.py"
            script.write_text(body)
            out = root / "transcript.json"
            sentinel = object()
            seen = []

            class Cursor:
                def __init__(self):
                    self.connection = types.SimpleNamespace(
                        info=types.SimpleNamespace(backend_pid=101, dbname="fixture", user="startup_login", host="/private/tmp/owned", port=55513),
                        pgconn=types.SimpleNamespace(backend_pid=101),
                    )
                    self.description = [types.SimpleNamespace(name="id", type_code=25)]
                    self._query = types.SimpleNamespace(
                        query=None if broken else b"SELECT $1",
                        types=(21,),
                        formats=(1,),
                        params=(b"\x00\x07",),
                    )

                    self.native = None if converted_none else self._query

                def _convert_query(self, query, params):
                    return self.native

                def execute(self, query, params=None, **kwargs):
                    for _ in range(conversion_count):
                        native = self._convert_query(query, params)
                        assert native is self.native
                    if cached:
                        self._query = None
                    seen.append((query, params, kwargs))
                    if error is not None:
                        raise error
                    return sentinel

            class AsyncCursor(Cursor):
                async def execute(self, query, params=None, **kwargs):
                    for _ in range(conversion_count):
                        native = self._convert_query(query, params)
                        assert native is self.native
                    if cached:
                        self._query = None
                    seen.append((query, params, kwargs))
                    if error is not None:
                        raise error
                    return sentinel

            fake = types.SimpleNamespace(
                Cursor=Cursor, AsyncCursor=AsyncCursor, sentinel=sentinel, error=error
            )
            sync = Cursor.execute
            asynchronous = AsyncCursor.execute
            conversion = Cursor._convert_query
            failure = None
            with (
                patch.object(capture, "psycopg", fake),
                patch.dict(sys.modules, {"psycopg": fake}),
                patch.object(sys, "argv", ["capture", "--out", str(out), str(script)]),
            ):
                try:
                    capture.main()
                except RuntimeError as caught:
                    failure = caught
            self.assertIs(Cursor.execute, sync)
            self.assertIs(AsyncCursor.execute, asynchronous)
            self.assertIs(Cursor._convert_query, conversion)
            self.assertNotIn("_convert_query", AsyncCursor.__dict__)
            return (
                json.loads(out.read_text()) if out.exists() else None,
                seen,
                failure,
                list(root.glob("*.capture-failures.json")),
                [
                    json.loads(line)
                    for line in out.with_suffix(".jsonl").read_text().splitlines()
                ]
                if out.with_suffix(".jsonl").exists()
                else [],
            )

    def test_exact_catalog_subprocess_route_preserves_flags_and_arguments(self):
        command = [
            sys.executable,
            "-I",
            "-B",
            "-m",
            "umf_access.build.catalog",
            "catalog",
            "--root",
            "path with spaces",
            "--check",
        ]
        original = list(command)
        changed = capture.compiler_command(
            command, Path("capture"), Path("recorder.py")
        )
        self.assertEqual(command, original)
        self.assertEqual(
            changed,
            [
                sys.executable,
                "-I",
                "-B",
                "recorder.py",
                "capture",
                "catalog",
                "--root",
                "path with spaces",
                "--check",
            ],
        )
        for wrong in [
            ["sh", *command[1:]],
            [sys.executable, "-c", "payload", *command[3:]],
            [sys.executable, "-m", "other.module", "catalog"],
            [sys.executable, "-m", "umf_access.build.catalog", "other"],
            "shell command",
        ]:
            with self.subTest(command=wrong):
                self.assertIsNone(
                    capture.compiler_command(
                        wrong, Path("capture"), Path("recorder.py")
                    )
                )

    def test_sync_exact_forwarding_and_protocol(self):
        doc, seen, error, _, _ = self.run_capture(
            "import psycopg\nassert psycopg.Cursor().execute('SELECT %s',(7,),prepare=False) is psycopg.sentinel\n"
        )
        self.assertIsNone(error)
        self.assertEqual(seen, [("SELECT %s", (7,), {"prepare": False})])
        self.assertEqual(doc["calls"][0]["protocol"]["parameterOids"], [21])
        self.assertEqual(doc["calls"][0]["protocol"]["parameterFormats"], [1])
        self.assertEqual(
            doc["calls"][0]["resultColumns"], [{"native": "id", "typeOid": 25}]
        )
        self.assertFalse(doc["nativeAuthority"])
        self.assertFalse(doc["inventoryComplete"])
        self.assertFalse(doc["parameterValuesRetained"])
        self.assertNotIn("params", doc["calls"][0])
        self.assertEqual(doc["calls"][0]["outcome"], "returned")

    def test_async_exact_forwarding(self):
        doc, seen, error, _, _ = self.run_capture(
            "import psycopg,asyncio\nasync def run():\n assert await psycopg.AsyncCursor().execute('SELECT %s',(7,),binary=True) is psycopg.sentinel\nasyncio.run(run())\n"
        )
        self.assertIsNone(error)
        self.assertEqual(seen, [("SELECT %s", (7,), {"binary": True})])
        self.assertEqual(len(doc["calls"]), 1)

    def test_prepared_driver_does_not_retain_query_sync_and_async(self):
        doc, seen, error, _, _ = self.run_capture(
            "import psycopg,asyncio\nc=psycopg.Cursor()\nfor _ in range(2): assert c.execute('SELECT %s',(7,)) is psycopg.sentinel\nasync def run():\n c=psycopg.AsyncCursor()\n for _ in range(2): assert await c.execute('SELECT %s',(7,)) is psycopg.sentinel\nasyncio.run(run())\n",
            cached=True,
        )
        self.assertIsNone(error)
        self.assertEqual(len(seen), 4)
        self.assertEqual(len(doc["calls"]), 4)
        self.assertTrue(
            all(
                call["protocol"]["observed"]
                and call["protocol"]["parameterOids"] == [21]
                for call in doc["calls"]
            )
        )
        self.assertTrue(doc["driverConversionSourcesUnchanged"])
        self.assertTrue(doc["driverConversionSources"])

    def test_missing_or_multiple_conversions_fail_closed_after_native_return(self):
        for count in (0, 2):
            with self.subTest(count=count):
                _, seen, error, receipts, _ = self.run_capture(
                    "import psycopg\nassert psycopg.Cursor().execute('SELECT %s',(7,)) is psycopg.sentinel\n",
                    conversion_count=count,
                )
                self.assertEqual(len(seen), 1)
                self.assertIsInstance(error, RuntimeError)
                self.assertEqual(len(receipts), 1)

    def test_explicit_absent_conversion_never_reuses_stale_cursor_query(self):
        _, seen, error, receipts, _ = self.run_capture(
            "import psycopg\nassert psycopg.Cursor().execute('SELECT %s',(7,)) is psycopg.sentinel\n",
            converted_none=True,
        )
        self.assertEqual(len(seen), 1)
        self.assertIsInstance(error, RuntimeError)
        self.assertEqual(len(receipts), 1)

    def test_original_failure_identity(self):
        original = RuntimeError("original")
        doc, _, error, _, _ = self.run_capture(
            "import psycopg\ntry: psycopg.Cursor().execute('SELECT %s',(7,))\nexcept RuntimeError as error: assert error is psycopg.error\n",
            error=original,
        )
        self.assertIsNone(error)
        self.assertEqual(doc["calls"][0]["outcome"], "raised")

    def test_capture_failure_preserves_native_return_then_fails_qualification(self):
        _, _, error, receipts, _ = self.run_capture(
            "import psycopg\nassert psycopg.Cursor().execute('SELECT %s',(7,)) is psycopg.sentinel\n",
            broken=True,
        )
        self.assertIsInstance(error, RuntimeError)
        self.assertEqual(len(receipts), 1)

    def test_full_journal_retains_every_event_after_summary_bound(self):
        doc, seen, error, _, journal = self.run_capture(
            "import psycopg\nfor _ in range(1003): psycopg.Cursor().execute('SELECT %s',(7,))\n"
        )
        self.assertIsNone(error)
        self.assertEqual(len(seen), 1003)
        self.assertEqual(doc["totalCalls"], 1003)
        self.assertEqual(len(doc["calls"]), 1000)
        self.assertFalse(doc["callsComplete"])
        self.assertEqual([entry["sequence"] for entry in journal], list(range(1003)))
        self.assertTrue(doc["sourceFilesUnchanged"])

    def test_cached_source_hash_is_hard_checked_at_exit(self):
        doc, _, error, receipts, _ = self.run_capture(
            "import psycopg\nfrom pathlib import Path\nassert psycopg.Cursor().execute('SELECT %s',(7,)) is psycopg.sentinel\nPath(__file__).write_text('changed source')\n"
        )
        self.assertIsInstance(error, RuntimeError)
        self.assertFalse(doc["sourceFilesUnchanged"])
        self.assertEqual(len(receipts), 1)


if __name__ == "__main__":
    unittest.main()

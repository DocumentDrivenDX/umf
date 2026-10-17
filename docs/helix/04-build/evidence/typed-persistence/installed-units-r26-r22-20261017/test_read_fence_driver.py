"""Driver ordering controls; these mocks do not qualify a native deployment."""

import asyncio
import json
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from umf_access.pages import ReadObligationUnmet, ReadPage
from umf_access.postgres_read import (
    _async_drive,
    _DeadlineCursor,
    _drive,
    _early_relation_locks,
    _program,
    _snapshot_free_search_path,
)

LOCK = 'LOCK TABLE "owned"."catalogs" IN SHARE MODE NOWAIT'


def operations():
    yield ("catalog-fence", LOCK)
    yield ("execute", "SELECT original_guard()", ())
    return ReadPage((), None)


class ReadFenceDriverTests(unittest.TestCase):
    def test_sync_fence_precedes_snapshot_timeout_select(self):
        calls = []

        class Raw:
            def execute(self, *args):
                calls.append(args)

        _drive(operations(), _DeadlineCursor(Raw(), time.monotonic() + 5))
        self.assertTrue(calls[0][0].startswith("SET LOCAL statement_timeout = '"))
        self.assertEqual(calls[1], (LOCK,))
        self.assertEqual(calls[2][0], "SELECT pg_catalog.set_config('statement_timeout', %s, true)")
        self.assertEqual(calls[3], ("SELECT original_guard()", ()))

    def test_async_fence_precedes_snapshot_timeout_select(self):
        calls = []

        class Raw:
            async def execute(self, *args):
                calls.append(args)

        asyncio.run(_async_drive(operations(), Raw(), time.monotonic() + 5))
        self.assertTrue(calls[0][0].startswith("SET LOCAL statement_timeout = '"))
        self.assertEqual(calls[1], (LOCK,))
        self.assertEqual(calls[2][0], "SELECT pg_catalog.set_config('statement_timeout', %s, true)")
        self.assertEqual(calls[3], ("SELECT original_guard()", ()))

    def test_original_relation_context_and_deduplication(self):
        relation = 'LOCK TABLE "orders" IN ACCESS SHARE MODE'
        legacy = list(_early_relation_locks({"schema": None}, (relation, relation), 'app"name'))
        self.assertEqual(legacy, [
            ("snapshot-free", 'SET LOCAL search_path = pg_catalog, "app""name", pg_temp'),
            ("snapshot-free", relation),
        ])
        for binding in ({"schemaBinding": "search-path", "schema": None},
                        {"schemaBinding": "qualified", "schema": "owned"},
                        {"schema": "owned"}):
            self.assertEqual(list(_early_relation_locks(binding, (relation,), "unused")),
                             [("snapshot-free", relation)])

    def test_context_utility_rejects_invalid_native_identifiers(self):
        for name in ("", "a" * 64, "bad\x00name", "\ud800"):
            with self.assertRaises(ReadObligationUnmet):
                _snapshot_free_search_path(name)
        self.assertIn('"é"', _snapshot_free_search_path("é"))

    def test_relation_and_context_steps_have_no_snapshot_select(self):
        def steps():
            yield from _early_relation_locks({"schema": None}, (LOCK,), "owned")
            yield ("execute", "SELECT first_snapshot()", ())
            return ReadPage((), None)
        calls = []
        class Raw:
            def execute(self, *args): calls.append(args)
        _drive(steps(), _DeadlineCursor(Raw(), time.monotonic() + 5))
        self.assertEqual(calls[1], ('SET LOCAL search_path = pg_catalog, "owned", pg_temp',))
        self.assertEqual(calls[3], (LOCK,))
        self.assertTrue(all(not call[0].startswith("SELECT") for call in calls[:4]))
        self.assertEqual(calls[-1], ("SELECT first_snapshot()", ()))

    def test_actual_context_operations_do_not_reset_full_timeout(self):
        packet = Path(__file__).resolve().parents[3] / "docs/helix/04-build/evidence/typed-persistence/read-consistency-r25-r22-20261017/public-stream/original-artifact.json"
        artifact = json.loads(packet.read_text())
        class Entry:
            def artifact(self): return artifact
        connection = SimpleNamespace(info=SimpleNamespace(transaction_status=0, server_version=180006))
        program = _program(connection, Entry(), None, app_schema="native_app", timeout_ms=1000, _verify_only=True)
        operations = []
        for operation in program:
            operations.append(operation)
            if operation[0] == "execute":
                self.assertNotIn("statement_timeout", operation[1])
                self.assertEqual(operation[2], ('pg_catalog, "native_app", pg_temp',))
                break
        self.assertEqual(operations[0][0], "begin")
        self.assertEqual(operations[1][0], "snapshot-free")
        self.assertEqual(operations[2], ("snapshot-free", artifact["lockSql"][0]))
        program.close()

    def test_lock_elapsed_time_is_subtracted_before_context_select(self):
        clock = [100.0]
        calls = []
        class Raw:
            def execute(self, *args):
                calls.append(args)
                if args[0] == LOCK:
                    clock[0] += 0.7
        def operations():
            yield ("snapshot-free", LOCK)
            yield ("execute", "SELECT context_only()", ())
            return ReadPage((), None)
        with patch("umf_access.postgres_read.time.monotonic", side_effect=lambda: clock[0]):
            _drive(operations(), _DeadlineCursor(Raw(), 101.0))
        self.assertEqual(calls[1], (LOCK,))
        self.assertLessEqual(int(calls[2][1][0]), 301)
        self.assertGreater(int(calls[2][1][0]), 0)
        self.assertEqual(calls[3], ("SELECT context_only()", ()))

    def test_lock_failure_releases_no_guard_or_rows(self):
        calls = []
        failure = RuntimeError("original native lock refusal")

        class Raw:
            def execute(self, *args):
                calls.append(args)
                if args[0] == LOCK:
                    raise failure

        with self.assertRaises(RuntimeError) as caught:
            _drive(operations(), _DeadlineCursor(Raw(), time.monotonic() + 5))
        self.assertIs(caught.exception, failure)
        self.assertEqual(len(calls), 2)


if __name__ == "__main__":
    unittest.main()

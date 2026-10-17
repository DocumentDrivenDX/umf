"""Driver ordering controls; these mocks do not qualify a native deployment."""

import asyncio
import time
import unittest

from umf_access.pages import ReadPage
from umf_access.postgres_read import _async_drive, _DeadlineCursor, _drive

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

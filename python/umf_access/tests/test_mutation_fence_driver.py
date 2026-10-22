# SPDX-License-Identifier: MIT OR Apache-2.0
"""Transport-order controls using original packets; no native lock proof."""

import asyncio
import json
import unittest
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from umf_access.native_actions import (
    AsyncPostgresActionExecutor,
    PostgresActionExecutor,
)

ROOT = Path(__file__).resolve().parents[3]


class State:
    read_only = True
    scope = None

    def __init__(self, program):
        self.program = program

    def execute(self, validate):
        yield ("rollback",)
        return "transport-control-only"


class MutationFenceDriverTests(unittest.TestCase):
    def check_order(self, events, program):
        self.assertEqual(events[0], "BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY")
        first_select = next(i for i, sql in enumerate(events) if sql.startswith("SELECT"))
        locks = program["obligations"]["mutationIndexEffects"]["lockSql"]
        catalog = program["obligations"].get("nativeCatalogFence")
        expected = ([catalog["lockSql"]] if catalog else []) + locks
        self.assertEqual([sql for sql in events[:first_select] if sql.startswith("LOCK")], expected)
        for sql in expected:
            self.assertTrue(events[events.index(sql) - 1].startswith("SET LOCAL statement_timeout = '"))
        self.assertEqual(events[first_select + 1], "HOST_ADMIT")
        self.assertEqual(events[-1], "ROLLBACK")

    def test_sync_and_async_complete_early_locks_precede_snapshot_and_host(self):
        for name in ("scalar-action.json", "effect-action.json"):
            program = json.loads((ROOT / "fixtures/access/native-catalog-fence/source-6d7c463" / name).read_text())
            for asynchronous in (False, True):
                with self.subTest(name=name, asynchronous=asynchronous):
                    events = []
                    if asynchronous:
                        class Connection:
                            info = SimpleNamespace(transaction_status=0)

                            async def execute(self, sql, parameters=None, *, recorded=events):
                                recorded.append(sql)

                            async def rollback(self, *, recorded=events):
                                recorded.append("ROLLBACK")

                        class Admission:
                            async def admit(self, connection, original, *, deadline, recorded=events):
                                recorded.append("HOST_ADMIT")

                        executor = AsyncPostgresActionExecutor(Connection(), (), Admission(), default_timeout=timedelta(seconds=3))
                        with patch.object(executor, "_state", return_value=State(program)):
                            result = asyncio.run(executor._run(None, {}, None, False))
                    else:
                        class Connection:
                            info = SimpleNamespace(transaction_status=0)

                            def execute(self, sql, parameters=None, *, recorded=events):
                                recorded.append(sql)

                            def rollback(self, *, recorded=events):
                                recorded.append("ROLLBACK")

                        class Admission:
                            def admit(self, connection, original, *, deadline, recorded=events):
                                recorded.append("HOST_ADMIT")

                        executor = PostgresActionExecutor(Connection(), (), Admission(), default_timeout=timedelta(seconds=3))
                        with patch.object(executor, "_state", return_value=State(program)):
                            result = executor._run(None, {}, None, False)
                    self.assertEqual(result, "transport-control-only")
                    self.check_order(events, program)


if __name__ == "__main__":
    unittest.main()

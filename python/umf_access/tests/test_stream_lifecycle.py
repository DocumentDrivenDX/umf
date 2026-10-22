# SPDX-License-Identifier: MIT OR Apache-2.0
"""Finite streams distinguish bounds, natural exhaustion and cleanup."""

import asyncio
import unittest
from contextlib import asynccontextmanager, contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from umf_access.pages import (
    ReadContinuation,
    ReadObligationUnmet,
    ReadPage,
    StreamLimitReached,
)
from umf_access.postgres_read import _async_stream, _stream

CURSOR = ReadContinuation((2,), "owner-context")


class Connection:
    def __init__(self):
        self.info = SimpleNamespace(transaction_status=0)
        self.exits = []

    @contextmanager
    def transaction(self):
        self.info.transaction_status = 2
        try:
            yield
        finally:
            self.info.transaction_status = 0
            self.exits.append("closed")

    @contextmanager
    def cursor(self):
        yield SimpleNamespace(execute=lambda *args: None)


class StreamLifecycleTests(unittest.TestCase):
    def stream(self, connection, max_rows):
        return _stream(
            connection,
            object(),
            object(),
            app_schema="fixture",
            max_rows=max_rows,
            target="postgresql18",
            timeout_ms=1000,
        )

    def test_buffered_and_exact_page_limits_signal_without_extra_page(self):
        for bound, truncated in ((1, True), (2, None)):
            connection = Connection()
            items = []
            with patch(
                "umf_access.postgres_read._execute",
                return_value=ReadPage((1, 2), CURSOR),
            ) as execute:
                with self.assertRaises(StreamLimitReached) as caught:
                    items.extend(self.stream(connection, bound))
                self.assertEqual(items, list(range(1, bound + 1)))
                self.assertEqual(caught.exception.emitted, bound)
                self.assertIs(caught.exception.truncated, truncated)
                self.assertEqual(execute.call_count, 1)
            self.assertEqual(connection.info.transaction_status, 0)
            self.assertEqual(connection.exits, ["closed"])

    def test_partial_exhaustion_at_bound_and_before_bound_returns_naturally(self):
        for bound in (3, 4):
            connection = Connection()
            with patch(
                "umf_access.postgres_read._execute",
                side_effect=[ReadPage((1, 2), CURSOR), ReadPage((3,), None)],
            ):
                self.assertEqual(list(self.stream(connection, bound)), [1, 2, 3])
            self.assertEqual(connection.exits, ["closed"])

    def test_explicit_close_after_break_releases_read_transaction(self):
        connection = Connection()
        with patch(
            "umf_access.postgres_read._execute", return_value=ReadPage((1, 2), CURSOR)
        ):
            stream = self.stream(connection, 9)
            for value in stream:
                self.assertEqual(value, 1)
                break
            self.assertEqual(connection.info.transaction_status, 2)
            stream.close()
        self.assertEqual(connection.info.transaction_status, 0)
        self.assertEqual(connection.exits, ["closed"])

    def test_empty_continuation_page_refuses_without_unbounded_loop(self):
        connection = Connection()
        with patch(
            "umf_access.postgres_read._execute", return_value=ReadPage((), CURSOR)
        ) as execute:
            with self.assertRaises(ReadObligationUnmet):
                list(self.stream(connection, 9))
            self.assertEqual(execute.call_count, 1)
        self.assertEqual(connection.exits, ["closed"])


class AsyncConnection:
    def __init__(self):
        self.info = SimpleNamespace(transaction_status=0)
        self.exits = []

    @asynccontextmanager
    async def transaction(self):
        self.info.transaction_status = 2
        try:
            yield
        finally:
            self.info.transaction_status = 0
            self.exits.append("closed")

    @asynccontextmanager
    async def cursor(self):
        async def execute(*args):
            pass

        yield SimpleNamespace(execute=execute)


class AsyncStreamLifecycleTests(unittest.IsolatedAsyncioTestCase):
    def stream(self, connection, bound):
        return _async_stream(
            connection,
            object(),
            object(),
            app_schema="fixture",
            max_rows=bound,
            target="postgresql18",
            timeout_ms=1000,
        )

    async def test_async_buffered_and_exact_page_limits_and_natural_exhaustion(self):
        for bound, expected in ((1, True), (2, None), (3, "natural")):
            connection = AsyncConnection()
            items = []
            with patch(
                "umf_access.postgres_read._async_execute",
                new=AsyncMock(
                    side_effect=[ReadPage((1, 2), CURSOR), ReadPage((3,), None)]
                ),
            ) as execute:
                if expected == "natural":
                    items = [item async for item in self.stream(connection, bound)]
                else:
                    with self.assertRaises(StreamLimitReached) as caught:
                        async for item in self.stream(connection, bound):
                            items.append(item)
                    self.assertIs(caught.exception.truncated, expected)
                    self.assertEqual(execute.call_count, 1)
            self.assertEqual(items, list(range(1, bound + 1)))
            self.assertEqual(connection.exits, ["closed"])

    async def test_async_close_and_task_cancellation_release_transaction(self):
        connection = AsyncConnection()
        with patch(
            "umf_access.postgres_read._async_execute",
            new=AsyncMock(return_value=ReadPage((1, 2), CURSOR)),
        ):
            stream = self.stream(connection, 9)
            self.assertEqual(await anext(stream), 1)
            await stream.aclose()
        self.assertEqual(connection.exits, ["closed"])
        connection = AsyncConnection()
        entered = asyncio.Event()

        async def page(*args, **kwargs):
            if not entered.is_set():
                entered.set()
                return ReadPage((1,), CURSOR)
            await asyncio.Event().wait()

        with patch("umf_access.postgres_read._async_execute", side_effect=page):
            stream = self.stream(connection, 9)
            self.assertEqual(await anext(stream), 1)
            task = asyncio.create_task(anext(stream))
            await asyncio.sleep(0)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            await stream.aclose()
        self.assertEqual(connection.info.transaction_status, 0)
        self.assertEqual(connection.exits, ["closed"])

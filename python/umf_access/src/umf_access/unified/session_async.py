# SPDX-License-Identifier: MIT OR Apache-2.0
"""Psycopg 3 async leases with cancellation-safe transaction and pool cleanup."""
from __future__ import annotations

import asyncio
import os
import sys
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from typing import Any, Literal

from .session_policy import GET_SETTING, ROLE_CHECK, SET_LOCAL, SessionError, SessionIdentity, SessionPolicy, verify_role


async def _finish(operation: Awaitable[None]) -> None:
    """Finish cleanup before cancellation reaches the pool or caller."""
    task = asyncio.create_task(operation)
    cancellation = None
    while True:
        try:
            await asyncio.shield(task)
            break
        except asyncio.CancelledError as error:
            if task.done():
                # Cleanup itself being cancelled is a failure, not successful cleanup.
                task.result()
                cancellation = error
                break
            cancellation = error
    if cancellation is not None:
        raise cancellation


class AsyncSession:
    """Per-call factory counterpart to SyncSession; no global pool or event loop."""
    def __init__(self, factory: Callable[[SessionIdentity], AbstractAsyncContextManager[Any]], policy: SessionPolicy,
                 *, transaction_owner: Literal["adapter", "caller"] = "adapter"):
        if transaction_owner not in ("adapter", "caller"):
            raise ValueError("transaction_owner must be adapter or caller")
        self.transaction_owner = transaction_owner
        self.factory = factory
        self.policy = policy
        self._pid = os.getpid()
        self._active: set[int] = set()

    @asynccontextmanager
    async def open(self, identity: SessionIdentity, *, read_only: bool = True) -> AsyncIterator[Any]:
        if os.getpid() != self._pid:
            raise SessionError("create session factories and pools after process creation")
        if type(read_only) is not bool:
            raise ValueError("read_only must be bool")
        settings = self.policy.settings(identity)
        lease = self.factory(identity)
        connection = await lease.__aenter__()
        key = id(connection)
        transaction = None
        entered = False
        owned = False
        previous = {}
        failure = (None, None, None)
        registered = False
        try:
            if key in self._active:
                raise SessionError("connection already leased by this adapter")
            self._active.add(key)
            registered = True
            status = int(connection.info.transaction_status)
            if status not in (0, 2):
                raise SessionError("connection is not idle or in a healthy caller transaction")
            owned = self.transaction_owner == "adapter"
            if status != (0 if owned else 2):
                raise SessionError("connection state differs from explicit transaction ownership")
            transaction = connection.transaction()
            try:
                await transaction.__aenter__()
                entered = True
            except BaseException:
                await _finish(connection.close())
                raise
            async with connection.cursor() as cursor:
                if owned:
                    if read_only:
                        await cursor.execute("SET TRANSACTION READ ONLY")
                elif read_only:
                    await cursor.execute(GET_SETTING, ("transaction_read_only",))
                    if await cursor.fetchone() != ("on",):
                        raise SessionError("caller transaction must already be read-only")
                for name in settings:
                    await cursor.execute(GET_SETTING, (name,))
                    previous[name] = (await cursor.fetchone())[0]
                for name, value in settings.items():
                    await cursor.execute(SET_LOCAL, (name, value))
                await cursor.execute(ROLE_CHECK)
                session_user = verify_role(await cursor.fetchone(), settings["role"])
                effective = {}
                for name in settings:
                    await cursor.execute(GET_SETTING, (name,))
                    effective[name] = (await cursor.fetchone())[0]
            yield connection
        except BaseException:
            failure = sys.exc_info()
            raise
        finally:
            body_failed = failure[0] is not None

            async def cleanup() -> None:
                nonlocal failure
                try:
                    if entered:
                        if failure[0] is None:
                            try:
                                async with connection.cursor() as cursor:
                                    await cursor.execute(ROLE_CHECK)
                                    verify_role(await cursor.fetchone(), settings["role"], session_user)
                                    for name, value in effective.items():
                                        await cursor.execute(GET_SETTING, (name,))
                                        if (await cursor.fetchone())[0] != value:
                                            raise SessionError("session settings changed during execution")
                                    if not owned:
                                        for name, value in previous.items():
                                            await cursor.execute(SET_LOCAL, (name, value))
                            except BaseException:
                                failure = sys.exc_info()
                        try:
                            await transaction.__aexit__(*failure)
                        except BaseException:
                            failure = sys.exc_info()
                            await connection.close()
                            raise
                        if failure[0] is not None and not body_failed:
                            # A failure first detected during cleanup must reach the caller.
                            raise failure[1].with_traceback(failure[2])
                except BaseException:
                    failure = sys.exc_info()
                    raise
                finally:
                    try:
                        await lease.__aexit__(*failure)
                    except BaseException:
                        await connection.close()
                        raise
                    finally:
                        if registered:
                            self._active.remove(key)
            await _finish(cleanup())

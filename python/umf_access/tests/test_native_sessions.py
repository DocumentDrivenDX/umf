# SPDX-License-Identifier: MIT OR Apache-2.0
"""Scheduling and lease fault injection only; these doubles do not qualify PostgreSQL."""
from __future__ import annotations

import asyncio
import copy
import unittest
from contextlib import asynccontextmanager, nullcontext
from types import SimpleNamespace

from umf_access.unified import (
    AsyncSession,
    SessionError,
    SessionIdentity,
    SessionPolicy,
    SyncSession,
)

ALICE = SessionIdentity("person", "alice")
BATCH = SessionIdentity("batch", "run")
POLICY = SessionPolicy({"alice": "alice_role"}, {"run": "batch_role"}, "plugin")


class Cursor:
    def __init__(self, connection):
        self.connection = connection
        self.row = None

    def __enter__(self): return self
    def __exit__(self, *_): pass

    def execute(self, sql, parameters=()):
        c = self.connection
        if "current_setting" in sql:
            self.row = (c.settings[parameters[0]],)
        elif "set_config" in sql:
            c.settings[parameters[0]] = parameters[1]
            self.row = (parameters[1],)
        elif "pg_roles" in sql:
            self.row = (c.settings["role"], "login", c.superuser, c.bypass)
        elif sql == "SET TRANSACTION READ ONLY":
            c.settings["transaction_read_only"] = "on"
        else:
            raise AssertionError(sql)
        return self

    def fetchone(self): return self.row


class Transaction:
    def __init__(self, connection): self.connection = connection

    def __enter__(self):
        self.status = self.connection.info.transaction_status
        self.before = copy.copy(self.connection.settings)
        self.connection.info.transaction_status = 2
        return self

    def __exit__(self, kind, *_):
        c = self.connection
        if c.exit_fail:
            raise RuntimeError("cleanup fault")
        if kind is not None or self.status == 0:
            c.settings = self.before
        c.info.transaction_status = self.status
        c.events.append("rollback" if kind else "commit" if self.status == 0 else "release")


class Connection:
    def __init__(self, status=0):
        self.info = SimpleNamespace(transaction_status=status)
        self.settings = {"role": "login", "row_security": "off", "search_path": "public",
                         "statement_timeout": "0", "lock_timeout": "0", "transaction_read_only": "off"}
        self.superuser = self.bypass = self.closed = self.exit_fail = False
        self.events = []

    def cursor(self): return Cursor(self)
    def transaction(self): return Transaction(self)
    def close(self): self.closed = True


class AsyncCursor(Cursor):
    async def __aenter__(self): return self
    async def __aexit__(self, *_): pass
    async def execute(self, *args): return super().execute(*args)
    async def fetchone(self): return super().fetchone()


class AsyncTransaction(Transaction):
    async def __aenter__(self): return super().__enter__()
    async def __aexit__(self, *args):
        if self.connection.exit_gate is not None:
            self.connection.exit_started.set()
            await self.connection.exit_gate.wait()
        return super().__exit__(*args)


class AsyncConnection(Connection):
    def __init__(self, status=0):
        super().__init__(status)
        self.exit_gate = None
        self.exit_started = asyncio.Event()

    def cursor(self): return AsyncCursor(self)
    def transaction(self): return AsyncTransaction(self)
    async def close(self): super().close()


class PolicyTests(unittest.TestCase):
    def test_explicit_batch_registry(self):
        self.assertEqual(POLICY.role(BATCH), "batch_role")
        with self.assertRaises(SessionError): POLICY.role(SessionIdentity("batch", "alice"))
        with self.assertRaises(ValueError): SessionIdentity("", "alice")
        with self.assertRaises(ValueError): SessionPolicy({"a": "same"}, {"b": "same"}, "plugin")
        with self.assertRaises(TypeError): POLICY.people["bob"] = "bob_role"

    def test_cursor_authority_and_policy_scope(self):
        secret = b"x" * 32
        a = POLICY.cursor_secret(ALICE, secret)
        self.assertEqual(a, POLICY.cursor_secret(ALICE, secret))
        self.assertNotEqual(a, POLICY.cursor_secret(BATCH, secret))
        other = SessionPolicy(POLICY.people, POLICY.batches, "other")
        self.assertNotEqual(a, other.cursor_secret(ALICE, secret))


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.connection = Connection()
        self.acquired = 0
        def factory(_identity):
            self.acquired += 1
            return nullcontext(self.connection)
        self.session = SyncSession(factory, POLICY)

    def test_owned_transaction_and_cleanup(self):
        before = copy.copy(self.connection.settings)
        for identity in (ALICE, BATCH):
            with self.session.open(identity) as connection:
                self.assertEqual(connection.settings["role"], POLICY.role(identity))
                self.assertEqual(connection.settings["row_security"], "on")
                self.assertEqual(connection.settings["transaction_read_only"], "on")
            self.assertEqual(self.connection.settings, before)
            self.assertEqual(self.connection.info.transaction_status, 0)
        self.assertEqual(self.acquired, 2)
        self.assertEqual(self.connection.events, ["commit", "commit"])

    def test_failure_and_privileged_role_rollback(self):
        with self.assertRaisesRegex(RuntimeError, "body"), self.session.open(ALICE):
            raise RuntimeError("body")
        self.connection.bypass = True
        with self.assertRaises(SessionError), self.session.open(ALICE):
            self.fail("privileged role reached caller")
        self.assertEqual(self.connection.events, ["rollback", "rollback"])
        self.assertEqual(self.connection.settings["role"], "login")

    def test_outer_transaction_preserved(self):
        self.connection.info.transaction_status = 2
        self.session = SyncSession(self.session.factory, POLICY, transaction_owner="caller")
        self.connection.settings["transaction_read_only"] = "on"
        before = copy.copy(self.connection.settings)
        with self.session.open(ALICE): pass
        self.assertEqual(self.connection.settings, before)
        self.assertEqual(self.connection.info.transaction_status, 2)
        self.assertEqual(self.connection.events, ["release"])
        with self.assertRaises(ValueError), self.session.open(ALICE):
            raise ValueError("rollback savepoint")
        self.assertEqual(self.connection.settings, before)
        self.assertEqual(self.connection.events[-1], "rollback")
        self.assertEqual(self.connection.info.transaction_status, 2)

    def test_invalid_outer_and_unknown_identity(self):
        with self.assertRaises(SessionError), self.session.open(SessionIdentity("batch", "alice")):
            pass
        self.assertEqual(self.acquired, 0)
        self.connection.info.transaction_status = 3
        with self.assertRaises(SessionError), self.session.open(ALICE): pass
        self.assertFalse(self.connection.closed)
        self.assertEqual(self.connection.events, [])
        self.connection.info.transaction_status = 2
        with self.assertRaises(SessionError), self.session.open(ALICE): pass
        self.session = SyncSession(self.session.factory, POLICY, transaction_owner="caller")
        with self.assertRaises(SessionError), self.session.open(ALICE): pass
        self.assertEqual(self.connection.info.transaction_status, 2)

    def test_ownership_tampering_and_cleanup_failure(self):
        with self.assertRaises(SessionError), self.session.open(ALICE):
            self.connection.settings["role"] = "other"
        self.assertEqual(self.connection.settings["role"], "login")
        self.connection.exit_fail = True
        with self.assertRaisesRegex(RuntimeError, "cleanup"), self.session.open(ALICE):
            pass
        self.assertTrue(self.connection.closed)
        self.assertEqual(self.session._active, set())

    def test_settings_tampering_rolls_back(self):
        with self.assertRaises(SessionError), self.session.open(ALICE):
            self.connection.settings["search_path"] = "other"
        self.assertEqual(self.connection.settings["search_path"], "public")
        self.assertEqual(self.connection.events, ["rollback"])

    def test_no_postfork_use(self):
        self.session._pid = -1
        with self.assertRaises(SessionError), self.session.open(ALICE): pass
        self.assertEqual(self.acquired, 0)


class AsyncTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.connection = AsyncConnection()
        self.releases = []
        @asynccontextmanager
        async def factory(_identity):
            try:
                yield self.connection
            finally:
                self.releases.append((self.connection.info.transaction_status, self.connection.closed))
        self.session = AsyncSession(factory, POLICY)

    async def test_success_and_failure(self):
        async with self.session.open(BATCH):
            self.assertEqual(self.connection.settings["role"], "batch_role")
        with self.assertRaisesRegex(ValueError, "body"):
            async with self.session.open(ALICE): raise ValueError("body")
        self.assertEqual(self.connection.events, ["commit", "rollback"])
        self.assertEqual(self.releases, [(0, False), (0, False)])

    async def test_cancel_body_and_repeated_cancel_during_cleanup(self):
        started = asyncio.Event()
        self.connection.exit_gate = asyncio.Event()
        async def operation():
            async with self.session.open(ALICE):
                started.set()
                await asyncio.Event().wait()
        task = asyncio.create_task(operation())
        await started.wait()
        task.cancel()
        await self.connection.exit_started.wait()
        task.cancel()
        await asyncio.sleep(0)
        task.cancel()
        self.assertEqual(self.releases, [])
        self.assertFalse(task.done())
        self.connection.exit_gate.set()
        with self.assertRaises(asyncio.CancelledError): await task
        self.assertEqual(self.connection.events, ["rollback"])
        self.assertEqual(self.releases, [(0, False)])
        self.assertEqual(self.session._active, set())

    async def test_cancellation_during_successful_cleanup_waits_for_release(self):
        self.connection.exit_gate = asyncio.Event()
        async def operation():
            async with self.session.open(ALICE): pass
        task = asyncio.create_task(operation())
        await self.connection.exit_started.wait()
        task.cancel()
        await asyncio.sleep(0)
        self.assertFalse(task.done())
        self.connection.exit_gate.set()
        with self.assertRaises(asyncio.CancelledError): await task
        self.assertEqual(self.releases, [(0, False)])

    async def test_cleanup_failure_closes_before_pool_release(self):
        self.connection.exit_fail = True
        with self.assertRaisesRegex(RuntimeError, "cleanup"):
            async with self.session.open(ALICE): pass
        self.assertEqual(self.releases, [(2, True)])
        self.assertEqual(self.session._active, set())

    async def test_settings_tampering_rolls_back(self):
        with self.assertRaises(SessionError):
            async with self.session.open(ALICE): self.connection.settings["statement_timeout"] = "0"
        self.assertEqual(self.connection.events, ["rollback"])
        self.assertEqual(self.releases, [(0, False)])

    async def test_role_tampering_rolls_back_and_propagates(self):
        with self.assertRaises(SessionError):
            async with self.session.open(ALICE): self.connection.settings["role"] = "other"
        self.assertEqual(self.connection.events, ["rollback"])
        self.assertEqual(self.releases, [(0, False)])


if __name__ == "__main__": unittest.main()

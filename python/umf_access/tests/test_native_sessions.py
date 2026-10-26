# SPDX-License-Identifier: MIT OR Apache-2.0
"""Scheduling and lease fault injection only; these doubles do not qualify PostgreSQL."""
from __future__ import annotations

import asyncio
import copy
import threading
import unittest
from contextlib import asynccontextmanager, nullcontext
from types import SimpleNamespace
from unittest.mock import patch

from umf_access.unified import (
    AsyncSession,
    SessionError,
    SessionIdentity,
    SessionPolicy,
    SyncSession,
    observe_table_head,
    observe_table_head_async,
)
from umf_access.unified.operation_values import token_decode, token_encode
from umf_access.unified.session_policy import (
    GET_SETTING,
    GET_SETTINGS,
    ROLE_SETTINGS_CHECK,
    SET_SETTINGS,
    SETTING_NAMES,
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
        if sql == GET_SETTINGS:
            self.row = tuple(c.settings[name] for name in SETTING_NAMES)
        elif sql == GET_SETTING:
            self.row = (c.settings[parameters[0]],)
        elif sql == SET_SETTINGS:
            for name, value in zip(SETTING_NAMES, parameters, strict=True):
                c.settings[name] = value
            self.row = tuple(c.settings[name] for name in SETTING_NAMES)
        elif sql == ROLE_SETTINGS_CHECK:
            self.row = (c.settings["role"], "login", c.superuser, c.bypass,
                        *(c.settings[name] for name in SETTING_NAMES))
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

    def cursor(self, *, row_factory=None): return Cursor(self)
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

    def cursor(self, *, row_factory=None): return AsyncCursor(self)
    def transaction(self): return AsyncTransaction(self)
    async def close(self): super().close()


class PolicyTests(unittest.TestCase):
    def test_table_operation_profile_is_a_trusted_closed_policy_choice(self):
        legacy=SessionPolicy(POLICY.people,POLICY.batches,POLICY.schema)
        selected=SessionPolicy(POLICY.people,POLICY.batches,POLICY.schema,
                               table_operation_module_profile='weft.table-operation-module/0.2')
        self.assertEqual(legacy.table_operation_module_profile,'weft.table-operation-module/0.1')
        self.assertEqual(selected.table_operation_module_profile,'weft.table-operation-module/0.2')
        self.assertNotIn('table_operation_module_profile',legacy.settings(ALICE))
        self.assertNotIn('table_operation_module_profile',selected.settings(ALICE))
        for invalid in ('weft.table-operation-module/0.3',None,0):
            with self.subTest(invalid=invalid),self.assertRaisesRegex(ValueError,'unsupported table operation module profile'):
                SessionPolicy(POLICY.people,POLICY.batches,POLICY.schema,
                              table_operation_module_profile=invalid)

    def test_catalog_only_resolution_is_explicit_and_scoped(self):
        catalog=SessionPolicy(POLICY.people,POLICY.batches,POLICY.schema,catalog_only=True)
        self.assertEqual(catalog.settings(ALICE)['search_path'],'pg_catalog')
        self.assertEqual(POLICY.settings(ALICE)['search_path'],'pg_catalog,"plugin"')
        self.assertNotEqual(catalog.cursor_secret(ALICE,b'x'*32),POLICY.cursor_secret(ALICE,b'x'*32))
        with self.assertRaises(ValueError):SessionPolicy({}, {}, 'plugin',catalog_only='yes')

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

    def test_cursor_profile_domain_preserves_legacy_bytes_and_separates_opt_in(self):
        secret=b'x'*32
        legacy=POLICY.cursor_secret(ALICE,secret)
        self.assertEqual(legacy.hex(),'4527fd2331403ffb065ebeea0a0543794076dc4f904fe15ecdd50d8fd040e1ca')
        selected=SessionPolicy(POLICY.people,POLICY.batches,POLICY.schema,
                               table_operation_module_profile='weft.table-operation-module/0.2')
        self.assertEqual(selected.cursor_secret(ALICE,secret).hex(),
                         'cd8f2827db824d10cc40f39bba20f6a370070ebf5b52118a82ac13d937ed4571')
        self.assertNotEqual(legacy,selected.cursor_secret(ALICE,secret))

    def test_authenticated_page_tokens_refuse_across_module_profiles_both_directions(self):
        root=b'x'*32
        legacy=POLICY
        selected=SessionPolicy(POLICY.people,POLICY.batches,POLICY.schema,
                               table_operation_module_profile='weft.table-operation-module/0.2')
        old_scope={'module':'demo','operation':'page'}
        new_scope={**old_scope,'tableOperationModuleProfile':'weft.table-operation-module/0.2'}
        old_token=token_encode(legacy.cursor_secret(ALICE,root),old_scope,[{'integerToken':'1'}])
        self.assertEqual(token_decode(legacy.cursor_secret(ALICE,root),old_token)['scope'],old_scope)
        with self.assertRaises(SessionError):token_decode(selected.cursor_secret(ALICE,root),old_token)
        new_token=token_encode(selected.cursor_secret(ALICE,root),new_scope,[{'integerToken':'1'}])
        self.assertEqual(token_decode(selected.cursor_secret(ALICE,root),new_token)['scope'],new_scope)
        with self.assertRaises(SessionError):token_decode(legacy.cursor_secret(ALICE,root),new_token)


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

    def test_head_guard_rejects_before_lease_or_optional_compiler(self):
        with self.assertRaisesRegex(SessionError,'catalog-only'):
            observe_table_head(self.session,ALICE,{}, {})
        with self.assertRaisesRegex(SessionError,'no grant'):
            observe_table_head(self.session,SessionIdentity('person','missing'),{}, {})
        self.assertEqual(self.acquired,0)

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
    async def test_cancelled_preparation_never_acquires_a_late_lease(self):
        started,finish,done=threading.Event(),threading.Event(),threading.Event()
        acquired=[]
        @asynccontextmanager
        async def factory(identity):
            acquired.append(identity)
            yield AsyncConnection()
        session=AsyncSession(factory,POLICY)
        def bounded_preparation(*args):
            started.set()
            try:finish.wait(2)
            finally:done.set()
            return object()
        with patch('umf_access.unified.head_session._prepare',bounded_preparation):
            task=asyncio.create_task(observe_table_head_async(session,ALICE,{},{}))
            try:
                self.assertTrue(await asyncio.to_thread(started.wait,2))
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):await task
            finally:finish.set()
            self.assertTrue(await asyncio.to_thread(done.wait,2))
            self.assertEqual(acquired,[])

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

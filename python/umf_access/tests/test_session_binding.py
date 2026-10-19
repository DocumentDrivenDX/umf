# SPDX-License-Identifier: MIT OR Apache-2.0
"""Transport composition against explicit doubles; native execution is a separate gate."""
from __future__ import annotations

import asyncio
import json
import unittest
from contextlib import asynccontextmanager, nullcontext

import test_unified_binding_identity as fixtures
from test_native_sessions import ALICE, BATCH, POLICY, AsyncConnection, Connection
from umf_access.unified import (
    AsyncSession,
    SyncSession,
    SyncWeftTableBinding,
    UnifiedAccessError,
)
from umf_access.unified.session_binding import (
    AsyncSessionTransport,
    SyncSessionTransport,
)


class Compiler:
    def compile_raw_read_json(self, source):
        request = json.loads(source)
        return dict(request, status="compiled", sourceSql=request["sql"])


class SessionBindingTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.UnifiedBindingIdentityTests()
        fixture.setUp()
        self.original, self.schema = fixture.binding, fixture.schema
        self.request = {"contract": "umf.access/1", "schema": self.schema, "kind": "read",
                        "query": {"record": "sales.region.Order"}, "size": 1}
        self.connection = Connection()
        self.session = SyncSession(lambda _: nullcontext(self.connection), POLICY)
        self.calls = 0

    def read(self, connection, artifact, request):
        self.assertIs(connection, self.connection)
        self.assertEqual(artifact["status"], "compiled")
        self.calls += 1
        return {"schema": self.schema, "rows": [{"code": "a"}, {"code": "b"}]}

    def transport(self, identity=ALICE, **kwargs):
        return SyncSessionTransport(self.session, identity, self.original, Compiler(), self.read,
                                    cursor_secret=b"x" * 32, **kwargs)

    def test_cursor_scope_across_calls_and_identities(self):
        response = self.transport().execute(self.request)
        self.assertEqual(response["rows"], [{"code": "a"}])
        self.assertIsInstance(response["cursor"], str)
        continued = dict(self.request, after=response["cursor"])
        # A new per-call binding shares a stable authority-scoped cursor secret.
        self.assertNotIn("error", self.transport().execute(continued))
        denied = self.transport(BATCH).execute(continued)
        self.assertEqual(denied["error"]["code"], "INVALID_CURSOR")
        self.assertEqual(self.calls, 2)
        self.assertEqual(self.connection.events, ["commit", "commit", "rollback"])

    def test_error_response_rolls_back_action_before_return(self):
        def action(connection, *_):
            connection.events.append("effect")
            raise UnifiedAccessError("DENIED", "policy refused")
        request = dict(self.request, kind="apply", action="sales.region.fulfill.fast", inputs={})
        response = self.transport(action=action).execute(request)
        self.assertEqual(response["error"]["code"], "DENIED")
        self.assertEqual(self.connection.events, ["effect", "rollback"])
        self.assertEqual(self.connection.settings["role"], "login")

    def test_missing_action_and_malformed_request_refuse(self):
        response = self.transport().execute(dict(self.request, kind="apply", action="sales.region.fulfill.fast", inputs={}))
        self.assertEqual(response["error"]["code"], "UNSUPPORTED")
        self.assertEqual(self.connection.events, ["rollback"])
        self.assertEqual(self.transport().execute([])["error"]["code"], "INVALID")
        self.assertEqual(self.calls, 0)

    def test_binding_schema_containment(self):
        self.original["schema"] = "other_plugin"
        with self.assertRaises(ValueError): self.transport()

    def test_sync_rejects_async_functions_and_disguised_awaitables(self):
        async def read(*_): return {"schema": self.schema, "rows": []}
        with self.assertRaises(TypeError):
            SyncWeftTableBinding(self.original, Compiler(), read, target="postgresql18")
        class AsyncCallable:
            async def __call__(self, *_): return {}
        with self.assertRaises(TypeError):
            SyncWeftTableBinding(self.original, Compiler(), AsyncCallable(), target="postgresql18")
        binding = SyncWeftTableBinding(self.original, Compiler(), lambda *args: read(*args), target="postgresql18")
        self.assertEqual(binding.execute(self.request)["error"]["code"], "INVALID")

    def test_sync_does_not_use_running_event_loop(self):
        async def main():
            return self.transport().execute(self.request)
        self.assertNotIn("error", asyncio.run(main()))

    def test_async_transport_rolls_back_shared_wire_error(self):
        connection = AsyncConnection()
        @asynccontextmanager
        async def factory(_): yield connection
        async def read(*_): return {"schema": self.schema, "rows": []}
        async def action(*_): raise UnifiedAccessError("DENIED", "policy refused")
        transport = AsyncSessionTransport(AsyncSession(factory, POLICY), ALICE, self.original, Compiler(),
                                          read, action=action, cursor_secret=b"x" * 32)
        request = dict(self.request, kind="apply", action="sales.region.fulfill.fast", inputs={})
        response = asyncio.run(transport.execute(request))
        self.assertEqual(response["error"]["code"], "DENIED")
        self.assertEqual(connection.events, ["rollback"])


if __name__ == "__main__": unittest.main()

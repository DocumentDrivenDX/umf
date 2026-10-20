# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import asyncio
import hashlib
import json
import sys
import unittest
from contextlib import ExitStack, contextmanager
from types import ModuleType
from unittest.mock import patch

from umf_access.unified import table_reads, table_writes
from umf_access.unified.session_policy import SessionError, SessionIdentity


def _fixture(kind="read"):
    source = {
        "modules": [
            {
                "id": "module",
                "extensions": {
                    "umf.tables": {
                        "tables": [{"id": "table", "name": "items", "record": "Item"}],
                        "commands": [
                            {
                                "id": "operation",
                                "consistency": "snapshot",
                                "replay": "none",
                                "body": {"kind": kind, "table": "table"},
                            }
                        ],
                    }
                },
            }
        ]
    }
    raw_source = json.dumps(source, sort_keys=True, separators=(",", ":"))
    source_digest = hashlib.sha256(raw_source.encode()).hexdigest()
    context = {
        "module": "module",
        "schema": "public",
        "sourceUtf8": raw_source,
        "sourceDigest": source_digest,
        "configurationDigest": "c" * 64,
        "bundleDigest": "b" * 64,
        "headDigest": "h" * 64,
        "referenceDigest": "r" * 64,
    }
    binding = {
        "modelJson": raw_source,
        "modelSha256": source_digest,
        "schema": "public",
        "nativeLifecycle": {
            "version": "umf.table-lifecycle/0.1",
            "module": "module",
            "configurationDigest": context["configurationDigest"],
            "deploymentDigest": context["bundleDigest"],
        },
    }

    class Probe:
        binding_context = context

    class Policy:
        @staticmethod
        def cursor_secret(_identity, secret):
            return secret

    class Session:
        policy = Policy()

    return Session(), binding, Probe(), SessionIdentity("person", "alice")


class _CompilerCapture:
    def __init__(self, test):
        self.test = test
        self.original_digest = table_reads.digest
        self.digests = []
        self.requests = []

    def digest(self, value):
        self.digests.append(value)
        return self.original_digest(value)

    def compile(self, raw):
        self.requests.append(json.loads(raw))
        raise SessionError("stop after compiler input capture")

    @contextmanager
    def patches(self, prepare):
        with ExitStack() as stack:
            stack.enter_context(patch.object(table_reads, "_prepare", side_effect=prepare))
            stack.enter_context(patch.object(table_reads, "digest", side_effect=self.digest))
            compiler = ModuleType("weft")
            compiler.check_table_operation_json = lambda _raw: None
            compiler.compile_table_operation_json = self.compile
            stack.enter_context(patch.dict(sys.modules, {"weft": compiler}))
            yield

    def assert_snapshot(self, original, *, batch=False):
        call = self.requests[0]["call"]
        key = "items" if batch else "inputs"
        expected_kind = "batch" if batch else "single"
        self.test.assertEqual(call["kind"], expected_kind)
        self.test.assertEqual(call[key], original)
        self.test.assertEqual(self.digests, [original])
        self.test.assertEqual(self.original_digest(call[key]), self.original_digest(original))


def _mutate(tree):
    values = tree if isinstance(tree, list) else [tree]
    for value in values:
        value["filter"]["name"] = "after"
        value["filter"]["tags"].append("b")


class InputSnapshotTests(unittest.IsolatedAsyncioTestCase):
    def test_sync_read_compiles_and_hashes_one_owned_snapshot(self):
        session, binding, probe, identity = _fixture()
        reader = table_reads.SyncTableReader(session, {}, {}, binding, cursor_secret=b"s" * 32)
        caller = {"filter": {"name": "before", "tags": ["a"]}}
        original = {"filter": {"name": "before", "tags": ["a"]}}
        capture = _CompilerCapture(self)

        def mutate_during_prepare(*_args, **_kwargs):
            _mutate(caller)
            return probe

        with capture.patches(mutate_during_prepare), self.assertRaisesRegex(
            SessionError, "stop after compiler input capture"
        ):
            reader.read(identity, "operation", caller)

        self.assertEqual(caller["filter"], {"name": "after", "tags": ["a", "b"]})
        capture.assert_snapshot(original)

    async def test_async_read_snapshots_before_thread_offload(self):
        session, binding, probe, identity = _fixture()
        reader = table_reads.AsyncTableReader(session, {}, {}, binding, cursor_secret=b"s" * 32)
        caller = {"filter": {"name": "before", "tags": ["a"]}}
        original = {"filter": {"name": "before", "tags": ["a"]}}
        capture = _CompilerCapture(self)
        original_to_thread = asyncio.to_thread

        async def mutate_after_snapshot(function, *args, **kwargs):
            _mutate(caller)
            return await original_to_thread(function, *args, **kwargs)

        with capture.patches(lambda *_args, **_kwargs: probe), patch.object(
            asyncio, "to_thread", side_effect=mutate_after_snapshot
        ), self.assertRaisesRegex(SessionError, "stop after compiler input capture"):
            await reader.read(identity, "operation", caller)

        self.assertEqual(caller["filter"], {"name": "after", "tags": ["a", "b"]})
        capture.assert_snapshot(original)

    def test_sync_write_batch_compiles_and_hashes_one_owned_snapshot(self):
        session, binding, probe, identity = _fixture("update")
        writer = table_writes.SyncTableWriter(session, {}, {}, binding, outcome_secret=b"s" * 32)
        caller = [{"filter": {"name": "before", "tags": ["a"]}}]
        original = [{"filter": {"name": "before", "tags": ["a"]}}]
        capture = _CompilerCapture(self)

        def mutate_during_prepare(*_args, **_kwargs):
            _mutate(caller)
            return probe

        with capture.patches(mutate_during_prepare), self.assertRaisesRegex(
            SessionError, "stop after compiler input capture"
        ):
            writer.write_batch(identity, "operation", caller)

        self.assertEqual(caller[0]["filter"], {"name": "after", "tags": ["a", "b"]})
        capture.assert_snapshot(original, batch=True)

    async def test_async_write_batch_snapshots_before_thread_offload(self):
        session, binding, probe, identity = _fixture("update")
        writer = table_writes.AsyncTableWriter(session, {}, {}, binding, outcome_secret=b"s" * 32)
        caller = [{"filter": {"name": "before", "tags": ["a"]}}]
        original = [{"filter": {"name": "before", "tags": ["a"]}}]
        capture = _CompilerCapture(self)
        original_to_thread = asyncio.to_thread

        async def mutate_after_snapshot(function, *args, **kwargs):
            _mutate(caller)
            return await original_to_thread(function, *args, **kwargs)

        with capture.patches(lambda *_args, **_kwargs: probe), patch.object(
            asyncio, "to_thread", side_effect=mutate_after_snapshot
        ), self.assertRaisesRegex(SessionError, "stop after compiler input capture"):
            await writer.write_batch(identity, "operation", caller)

        self.assertEqual(caller[0]["filter"], {"name": "after", "tags": ["a", "b"]})
        capture.assert_snapshot(original, batch=True)


if __name__ == "__main__":
    unittest.main()

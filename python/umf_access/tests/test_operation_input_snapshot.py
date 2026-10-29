# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import asyncio
import hashlib
import json
import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack, contextmanager
from threading import Event
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
                                "version": "umf.table-operation/0.1",
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
        def __init__(self):
            self.principals = []

        def for_principal(self, *, principal_role, audience):
            self.principals.append((principal_role,audience))
            return self

    class Policy:
        table_operation_module_profile = "weft.table-operation-module/0.1"

        @staticmethod
        def role(identity):
            registry = {"alice":"alice", "bob":"bob"} if identity.kind=="person" else {"job":"job"}
            if identity.subject not in registry:
                raise SessionError("subject has no grant for this session kind")
            return registry[identity.subject]

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
        self.module_requests = []

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
            capture = self
            class Operation:
                def bind_json(self, raw):return capture.compile(raw)
            class Module:
                def prepare(self, _operation):return Operation()
            compiler.prepare_table_operation_module_json = lambda raw: capture.module_requests.append(
                json.loads(raw)
            ) or Module()
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
    def test_operation_scope_adds_only_opt_in_module_profile(self):
        context={'module':'module','schema':'public','sourceDigest':'a'*64,
                 'configurationDigest':'c'*64,'bundleDigest':'b'*64,
                 'headDigest':'h'*64,'referenceDigest':'r'*64}
        legacy=table_reads._operation_scope(context,'operation','postgresql18',{'value':1},None,None,
                                            'weft.table-operation-module/0.1')
        selected=table_reads._operation_scope(context,'operation','postgresql18',{'value':1},None,None,
                                              'weft.table-operation-module/0.2')
        self.assertEqual(legacy,{
            **context,'operation':'operation','target':'postgresql18',
            'inputsDigest':table_reads.digest({'value':1}),'requestedSize':None,
            'profile':'python-sorted-json/0.1'})
        self.assertNotIn('tableOperationModuleProfile',legacy)
        self.assertEqual(selected,{**legacy,'tableOperationModuleProfile':'weft.table-operation-module/0.2'})

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
        for profile in ("weft.table-operation-module/0.1", "weft.table-operation-module/0.2"):
            with self.subTest(profile=profile):
                session, binding, probe, identity = _fixture()
                session.policy.table_operation_module_profile = profile
                reader = table_reads.AsyncTableReader(session, {}, {}, binding, cursor_secret=b"s" * 32)
                caller = {"filter": {"name": "before", "tags": ["a"]}}
                original = {"filter": {"name": "before", "tags": ["a"]}}
                capture = _CompilerCapture(self)
                original_to_thread = asyncio.to_thread

                async def mutate_after_snapshot(
                    function, *args, _caller=caller,
                    _original_to_thread=original_to_thread, **kwargs
                ):
                    _mutate(_caller)
                    return await _original_to_thread(function, *args, **kwargs)

                with capture.patches(lambda *_args, _probe=probe, **_kwargs: _probe), patch.object(
                    asyncio, "to_thread", side_effect=mutate_after_snapshot
                ), self.assertRaisesRegex(SessionError, "stop after compiler input capture"):
                    await reader.read(identity, "operation", caller)

                self.assertEqual(caller["filter"], {"name": "after", "tags": ["a", "b"]})
                capture.assert_snapshot(original)
                self.assertEqual(capture.module_requests[0]["version"], profile)

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
        for profile in ("weft.table-operation-module/0.1", "weft.table-operation-module/0.2"):
            with self.subTest(profile=profile):
                session, binding, probe, identity = _fixture("update")
                session.policy.table_operation_module_profile = profile
                writer = table_writes.AsyncTableWriter(session, {}, {}, binding, outcome_secret=b"s" * 32)
                caller = [{"filter": {"name": "before", "tags": ["a"]}}]
                original = [{"filter": {"name": "before", "tags": ["a"]}}]
                capture = _CompilerCapture(self)
                original_to_thread = asyncio.to_thread

                async def mutate_after_snapshot(
                    function, *args, _caller=caller,
                    _original_to_thread=original_to_thread, **kwargs
                ):
                    _mutate(_caller)
                    return await _original_to_thread(function, *args, **kwargs)

                with capture.patches(lambda *_args, _probe=probe, **_kwargs: _probe), patch.object(
                    asyncio, "to_thread", side_effect=mutate_after_snapshot
                ), self.assertRaisesRegex(SessionError, "stop after compiler input capture"):
                    await writer.write_batch(identity, "operation", caller)

                self.assertEqual(caller[0]["filter"], {"name": "after", "tags": ["a", "b"]})
                capture.assert_snapshot(original, batch=True)
                self.assertEqual(capture.module_requests[0]["version"], profile)


if __name__ == "__main__":
    unittest.main()


class SourcePreparationCacheTests(unittest.TestCase):
    def reader(self):
        session,binding,probe,identity=_fixture()
        reader=table_reads.SyncTableReader(session,{}, {},binding,cursor_secret=b"s"*32)
        return reader,session,probe,identity

    def test_source_is_prepared_once_but_each_principal_is_bound_fresh(self):
        reader,_,probe,alice=self.reader()
        bob=SessionIdentity("person","bob");job=SessionIdentity("batch","job")
        with patch.object(table_reads,"_prepare",return_value=probe) as prepare:
            first=reader._source_for(alice)
            second=reader._source_for(bob)
            reader._source_for(job)
        self.assertEqual(prepare.call_count,1)
        self.assertIs(first[2],second[2])
        self.assertIs(first[3],second[3])
        self.assertEqual(probe.principals,[("alice","person"),("bob","person"),("job","batch")])

    def test_current_registry_is_checked_before_cached_preparation(self):
        reader,_,probe,alice=self.reader()
        with patch.object(table_reads,"_prepare",return_value=probe) as prepare:
            reader._source_for(alice)
            with self.assertRaisesRegex(SessionError,"subject has no grant"):
                reader._source_for(SessionIdentity("person","unknown"))
        self.assertEqual(prepare.call_count,1)
        self.assertEqual(probe.principals,[("alice","person")])

    def test_new_policy_object_invalidates_source_preparation(self):
        reader,session,probe,alice=self.reader()
        with patch.object(table_reads,"_prepare",return_value=probe) as prepare:
            reader._source_for(alice)
            session.policy=type(session.policy)()
            reader._source_for(alice)
        self.assertEqual(prepare.call_count,2)

    def test_failed_binding_does_not_populate_source_cache(self):
        reader,_,probe,alice=self.reader()
        reader._binding['modelSha256']='wrong'
        with patch.object(table_reads,"_prepare",return_value=probe) as prepare:
            for _ in range(2):
                with self.assertRaisesRegex(SessionError,"binding differs"):
                    reader._source_for(alice)
        self.assertEqual(prepare.call_count,2)
        self.assertIsNone(reader._source_state)

    def test_concurrent_first_calls_share_only_source_preparation(self):
        reader,_,probe,alice=self.reader();started=Event();release=Event()
        def prepare(*_args,**_kwargs):
            started.set()
            self.assertTrue(release.wait(timeout=5))
            return probe
        with patch.object(table_reads,"_prepare",side_effect=prepare) as prepared, ThreadPoolExecutor(max_workers=2) as workers:
            first=workers.submit(reader._source_for,alice)
            self.assertTrue(started.wait(timeout=5))
            second=workers.submit(reader._source_for,SessionIdentity("batch","job"))
            release.set();first.result(timeout=5);second.result(timeout=5)
        self.assertEqual(prepared.call_count,1)
        self.assertCountEqual(probe.principals,[("alice","person"),("job","batch")])

    def test_inherited_process_rejects_before_touching_a_lock(self):
        reader,_,_,alice=self.reader()
        with (patch.object(table_reads.os,"getpid",return_value=reader._source_pid+1),
              patch.object(reader,"_source_lock") as lock,
              self.assertRaisesRegex(SessionError,"after process creation")):
            reader._source_for(alice)
        lock.__enter__.assert_not_called()

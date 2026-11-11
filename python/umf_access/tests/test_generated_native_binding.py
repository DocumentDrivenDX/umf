# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compiler-free reader admission checks before a native session lease."""

from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from umf_access.generated import GeneratedNativeTableBinding
from umf_access.lifecycle import CatalogError
from umf_access.unified import (
    AsyncSession,
    SessionError,
    SessionIdentity,
    SessionPolicy,
)
from umf_access_generated_executor import ExecutionScope, GeneratedOrdinaryPageCall, prepare_generated

# Share the verifier's canonical artifact builder rather than a second local
# implementation of manifest digests and external receipt pins.
_EXECUTOR_TESTS = (
    Path(__file__).resolve().parents[2] / "umf_access_generated_executor" / "tests"
)
sys.path.insert(0, str(_EXECUTOR_TESTS))
from test_admission import valid_artifact


class GeneratedNativeBindingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.identity = SessionIdentity("person", "alice")
        self.policy = SessionPolicy(
            {"alice": "board_person"}, {}, "board", catalog_only=True
        )
        self.acquired: list[SessionIdentity] = []

        class NoLease:
            async def __aenter__(self):
                raise AssertionError("generated admission opened a native lease")

            async def __aexit__(self, *_args):
                return None

        def factory(identity):
            self.acquired.append(identity)
            return NoLease()

        self.session = AsyncSession(factory, self.policy)
        manifest, files, trusted, self.target = valid_artifact(native=True)
        self.executor = prepare_generated(manifest, files, trusted, self.target)
        self.admitted = self.executor.native_table
        self.reference: dict[str, object] = {}
        self.binding = GeneratedNativeTableBinding.from_generated(
            self.session,
            self.admitted,
            self.reference,
            self.executor,
            cursor_secret=b"c" * 32,
            outcome_secret=b"o" * 32,
            target=self.target,
        )

    def request(self, *, operation="board.tasks", inputs=None):
        return {
            "contract": "umf.access/1",
            "schema": self.admitted.source_digest,
            "kind": "table",
            "module": "board",
            "operation": operation,
            "call": {"kind": "single", "inputs": {} if inputs is None else inputs},
            "phase": "invoke",
            "mutation": False,
            "idempotency_key": None,
        }

    def scope(self):
        return ExecutionScope(
            object(), self.identity, "request-1", time.monotonic() + 30, "lease-1"
        )

    async def test_factory_is_the_generated_reader_and_identity_scope_is_host_bound(
        self,
    ):
        self.assertIs(type(self.binding), GeneratedNativeTableBinding)
        self.assertEqual(
            self.binding.artifact_digest,
            self.executor.trusted_artifact.artifact_digest,
        )
        self.assertEqual(
            self.binding.receipt_digest,
            self.executor.trusted_artifact.receipt_digest,
        )
        wrong = SessionIdentity("batch", "run")
        response = await self.binding.execute(
            self.request(), identity=wrong, scope=self.scope()
        )
        self.assertEqual(response["error"]["code"], "DENIED")
        self.assertEqual(self.acquired, [])

    async def test_export_only_refuses_before_head_probe_or_native_lease(self):
        with patch(
            "umf_access.generated_native_port.GeneratedNativeExecutionPort.prepare_probe",
            return_value=object(),
        ):
            response = await self.binding.execute(
                self.request(), identity=self.identity, scope=self.scope()
            )
        self.assertEqual(response["error"]["code"], "INVALID")
        self.assertEqual(self.acquired, [])

    async def test_invalid_request_and_expired_scope_refuse_before_admission(self):
        with patch(
            "umf_access.generated_native_port.GeneratedNativeExecutionPort.prepare_probe",
            side_effect=AssertionError("invalid request reached lifecycle preparation"),
        ):
            invalid = await self.binding.execute(
                self.request(operation="board.not-admitted"),
                identity=self.identity,
                scope=self.scope(),
            )
            expired_scope = ExecutionScope(
                object(), self.identity, "request-2", time.monotonic() - 1, "lease-2"
            )
            expired = await self.binding.execute(
                self.request(), identity=self.identity, scope=expired_scope
            )
        self.assertEqual(invalid["error"]["code"], "INVALID")
        self.assertEqual(expired["error"]["code"], "INVALID")
        self.assertEqual(self.acquired, [])

    async def test_standalone_v3_refuses_request_consistency_before_authority_or_lease(
        self,
    ):
        scope = ExecutionScope(
            object(),
            self.identity,
            "request-snapshot-1",
            time.monotonic() + 30,
            "lease-1",
            consistency="request-snapshot/1",
        )
        with patch.object(
            SessionPolicy,
            "role",
            side_effect=AssertionError("unsupported consistency reached authority"),
        ):
            response = await self.binding.execute_read_v3(
                object(), identity=self.identity, scope=scope
            )
        self.assertEqual(response["error"]["code"], "INVALID")
        self.assertEqual(self.acquired, [])

    async def test_request_snapshot_requires_v4_profile_before_any_lease(self):
        scope = ExecutionScope(
            object(),
            self.identity,
            "request-snapshot-1",
            time.monotonic() + 30,
            "lease-1",
            consistency="request-snapshot/1",
        )
        data_session = AsyncSession(self.session.factory, self.policy)
        with self.assertRaisesRegex(SessionError, "request snapshot scope"):
            async with self.binding.open_request(
                self.identity, scope, data_session=data_session
            ):
                self.fail("export-only artifact must not open a request snapshot")
        self.assertEqual(self.acquired, [])

    async def test_untrusted_executor_or_projection_is_rejected_at_construction(self):
        class StructuralExecutor:
            target = self.target

            @property
            def native_table(self):
                return self.admitted

            def bind(self, *_args):
                raise AssertionError("structural executor must never bind")

        with self.assertRaisesRegex(SessionError, "provenance"):
            GeneratedNativeTableBinding.from_generated(
                self.session,
                self.admitted,
                self.reference,
                StructuralExecutor(),
                cursor_secret=b"c" * 32,
                outcome_secret=b"o" * 32,
                target=self.target,
            )

    async def test_compiler_free_head_helper_uses_admitted_projection(self):
        from umf_access.lifecycle import prepare_generated_table_head

        with self.assertRaises(CatalogError):
            prepare_generated_table_head(self.admitted, self.reference)
        self.assertEqual(self.acquired, [])


if __name__ == "__main__":
    unittest.main()

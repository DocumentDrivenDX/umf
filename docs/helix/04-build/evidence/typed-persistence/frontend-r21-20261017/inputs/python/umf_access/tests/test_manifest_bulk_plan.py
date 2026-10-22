"""Manifest control views preserve issuer custody and never retry on failure."""

import asyncio
import unittest
from datetime import timedelta

from umf_access.bulk import AsyncManifestBulkPlan, BulkPreview, ManifestBulkPlan


class Host:
    def __init__(self):
        self.calls = []
        self.result = object()

    def preview(self, **kwargs):
        self.calls.append(("preview", kwargs))
        return BulkPreview((), "original summary")

    def seal(self, **kwargs):
        self.calls.append(("seal", kwargs))
        return self.result

    def submit(self, sealed, **kwargs):
        self.calls.append(("submit", sealed, kwargs))
        return self.result

    def recover_control(self, recovery, **kwargs):
        self.calls.append(("recover", recovery, kwargs))
        return self.result


class ManifestPlanTests(unittest.TestCase):
    def test_original_control_custody_is_not_reconstructed(self):
        host = Host()
        plan = ManifestBulkPlan(host)
        attempt, artifact, recovery = object(), object(), object()
        timeout = timedelta(seconds=3)
        self.assertIs(plan.seal(attempt=attempt, timeout=timeout), host.result)
        self.assertIs(
            plan.submit(artifact, submission_key="stable", attempt=attempt), host.result
        )
        self.assertIs(plan.recover_control(recovery), host.result)
        self.assertEqual(
            host.calls,
            [
                ("seal", {"attempt": attempt, "timeout": timeout}),
                (
                    "submit",
                    artifact,
                    {"submission_key": "stable", "attempt": attempt, "timeout": None},
                ),
                ("recover", recovery, {"timeout": None}),
            ],
        )
        self.assertFalse(hasattr(plan, "execute"))

    def test_unknown_ack_exception_does_not_trigger_mutation_or_recovery(self):
        error = RuntimeError("original transport unknown")

        class UnknownHost(Host):
            def seal(self, **kwargs):
                super().seal(**kwargs)
                raise error

        host = UnknownHost()
        with self.assertRaises(RuntimeError) as raised:
            ManifestBulkPlan(host).seal(attempt=object())
        self.assertIs(raised.exception, error)
        self.assertEqual(len(host.calls), 1)


class AsyncManifestPlanTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancellation_retains_original_single_call(self):
        calls = []
        entered = asyncio.Event()
        attempt = object()

        class Host:
            async def seal(self, **kwargs):
                calls.append(kwargs)
                entered.set()
                await asyncio.Future()

        plan = AsyncManifestBulkPlan(Host())
        task = asyncio.create_task(plan.seal(attempt=attempt))
        await entered.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(calls, [{"attempt": attempt, "timeout": None}])
        self.assertFalse(hasattr(plan, "execute"))

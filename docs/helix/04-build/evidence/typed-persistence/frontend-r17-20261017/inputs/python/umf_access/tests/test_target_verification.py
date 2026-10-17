"""Public eager verification distinguishes shape mismatch from native denial."""

import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from umf_access.pages import ReadObligationUnmet
from umf_access.targets import (
    AsyncPostgresTarget,
    PostgresConfiguration,
    PostgresTarget,
    TargetMismatch,
)


def target(cls):
    connection = SimpleNamespace(info=SimpleNamespace(server_version=180006))
    configuration = PostgresConfiguration("app", "b" * 64, (180006,), timedelta(seconds=5))
    return cls(connection, configuration, (object(),))


class VerificationTests(unittest.TestCase):
    def test_shape_mismatch_wraps_but_original_native_denial_propagates(self):
        instance = target(PostgresTarget)
        original = ReadObligationUnmet("native shape differs")
        with patch.object(instance, "_admit", return_value=5000), patch("umf_access.targets.verify_read", side_effect=original), self.assertRaises(TargetMismatch) as caught:
            instance.verify()
        self.assertIs(caught.exception.__cause__, original)
        denial = PermissionError("original native metadata denial")
        with patch.object(instance, "_admit", return_value=5000), patch("umf_access.targets.verify_read", side_effect=denial), self.assertRaises(PermissionError) as caught:
            instance.verify()
        self.assertIs(caught.exception, denial)


class AsyncVerificationTests(unittest.IsolatedAsyncioTestCase):
    async def test_async_shape_mismatch_retains_original_cause(self):
        instance = target(AsyncPostgresTarget)
        original = ReadObligationUnmet("native shape differs")
        with patch.object(instance, "_admit", return_value=5000), patch("umf_access.targets.verify_read_async", side_effect=original), self.assertRaises(TargetMismatch) as caught:
            await instance.verify()
        self.assertIs(caught.exception.__cause__, original)


if __name__ == "__main__":
    unittest.main()

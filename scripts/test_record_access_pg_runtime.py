from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "capture", str(Path(__file__).with_name("record-access-pg-runtime.py"))
)
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class CaptureTests(unittest.TestCase):
    def run_capture(self, body, *, error=None, broken=False):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            package = root / "umf_access"
            package.mkdir()
            script = package / "native_actions.py"
            script.write_text(body)
            out = root / "transcript.json"
            sentinel = object()
            seen = []

            class Cursor:
                def __init__(self):
                    self._query = types.SimpleNamespace(
                        query=None if broken else b"SELECT $1",
                        types=(21,),
                        formats=(1,),
                        params=(b"\x00\x07",),
                    )

                def execute(self, query, params=None, **kwargs):
                    seen.append((query, params, kwargs))
                    if error is not None:
                        raise error
                    return sentinel

            class AsyncCursor(Cursor):
                async def execute(self, query, params=None, **kwargs):
                    return super().execute(query, params, **kwargs)

            fake = types.SimpleNamespace(
                Cursor=Cursor, AsyncCursor=AsyncCursor, sentinel=sentinel, error=error
            )
            sync = Cursor.execute
            asynchronous = AsyncCursor.execute
            failure = None
            with (
                patch.object(capture, "psycopg", fake),
                patch.dict(sys.modules, {"psycopg": fake}),
                patch.object(sys, "argv", ["capture", "--out", str(out), str(script)]),
            ):
                try:
                    capture.main()
                except RuntimeError as caught:
                    failure = caught
            self.assertIs(Cursor.execute, sync)
            self.assertIs(AsyncCursor.execute, asynchronous)
            return (
                json.loads(out.read_text()) if out.exists() else None,
                seen,
                failure,
                list(root.glob("*.capture-failures.json")),
            )

    def test_exact_catalog_subprocess_route_preserves_flags_and_arguments(self):
        command = [
            sys.executable,
            "-I",
            "-B",
            "-m",
            "umf_access.build.catalog",
            "catalog",
            "--root",
            "path with spaces",
            "--check",
        ]
        original = list(command)
        changed = capture.compiler_command(
            command, Path("capture"), Path("recorder.py")
        )
        self.assertEqual(command, original)
        self.assertEqual(
            changed,
            [
                sys.executable,
                "-I",
                "-B",
                "recorder.py",
                "capture",
                "catalog",
                "--root",
                "path with spaces",
                "--check",
            ],
        )
        for wrong in [
            ["sh", *command[1:]],
            [sys.executable, "-c", "payload", *command[3:]],
            [sys.executable, "-m", "other.module", "catalog"],
            [sys.executable, "-m", "umf_access.build.catalog", "other"],
            "shell command",
        ]:
            with self.subTest(command=wrong):
                self.assertIsNone(
                    capture.compiler_command(
                        wrong, Path("capture"), Path("recorder.py")
                    )
                )

    def test_sync_exact_forwarding_and_protocol(self):
        doc, seen, error, _ = self.run_capture(
            "import psycopg\nassert psycopg.Cursor().execute('SELECT %s',(7,),prepare=False) is psycopg.sentinel\n"
        )
        self.assertIsNone(error)
        self.assertEqual(seen, [("SELECT %s", (7,), {"prepare": False})])
        self.assertEqual(doc["calls"][0]["protocol"]["parameterOids"], [21])
        self.assertEqual(doc["calls"][0]["protocol"]["parameterFormats"], [1])
        self.assertFalse(doc["nativeAuthority"])
        self.assertFalse(doc["inventoryComplete"])
        self.assertFalse(doc["parameterValuesRetained"])
        self.assertNotIn("params", doc["calls"][0])
        self.assertEqual(doc["calls"][0]["outcome"], "returned")

    def test_async_exact_forwarding(self):
        doc, seen, error, _ = self.run_capture(
            "import psycopg,asyncio\nasync def run():\n assert await psycopg.AsyncCursor().execute('SELECT %s',(7,),binary=True) is psycopg.sentinel\nasyncio.run(run())\n"
        )
        self.assertIsNone(error)
        self.assertEqual(seen, [("SELECT %s", (7,), {"binary": True})])
        self.assertEqual(len(doc["calls"]), 2)

    def test_original_failure_identity(self):
        original = RuntimeError("original")
        doc, _, error, _ = self.run_capture(
            "import psycopg\ntry: psycopg.Cursor().execute('SELECT %s',(7,))\nexcept RuntimeError as error: assert error is psycopg.error\n",
            error=original,
        )
        self.assertIsNone(error)
        self.assertEqual(doc["calls"][0]["outcome"], "raised")

    def test_capture_failure_preserves_native_return_then_fails_qualification(self):
        _, _, error, receipts = self.run_capture(
            "import psycopg\nassert psycopg.Cursor().execute('SELECT %s',(7,)) is psycopg.sentinel\n",
            broken=True,
        )
        self.assertIsInstance(error, RuntimeError)
        self.assertEqual(len(receipts), 1)


if __name__ == "__main__":
    unittest.main()

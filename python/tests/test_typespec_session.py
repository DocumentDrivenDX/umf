# SPDX-License-Identifier: MIT OR Apache-2.0
"""Baseline for the explicit compiler transport; no JavaScript runtime needed."""
import json
import os
import subprocess
import unittest

from umf import TypeSpecSession
from umf import _rust
from umf._rust import UmfCoreError


class TypeSpecSessionBaseline(unittest.TestCase):
    def exercise(self, call):
        source = "model Item { id: string; }"
        prepared = call("typespec.prepareImport", input={
            "entrypoint": "main.tsp", "files": {"main.tsp": source}}, id="host-typespec")
        document = call("typespec.completeImport", token=prepared["token"], response=[])
        prepared = call("typespec.prepareCompile", document=document)
        self.assertEqual(prepared["request"]["operation"], "compile")
        report = call("typespec.completeCompile", token=prepared["token"],
                      response={"valid": True, "diagnostics": []})
        self.assertTrue(report["valid"])
        # A compiler response is not a completeness claim.
        self.assertFalse(report["complete"])
        with self.assertRaises(UmfCoreError):
            call("typespec.prepareImport", input={
                "entrypoint": "../main.tsp", "files": {"../main.tsp": source}}, id="invalid")

    def test_python_session_prepare_complete_and_refusal(self):
        self.exercise(TypeSpecSession().execute)

    @unittest.skipUnless(os.environ.get("UMF_TEST_CLI"), "requires the freshly built Rust CLI")
    def test_cli_interactive_session_prepare_complete_and_refusal(self):
        with subprocess.Popen([os.environ["UMF_TEST_CLI"], "typespec", "--stdin-session"],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True) as process:
            def call(operation, **fields):
                request = {"profile": "umf.typespec-source-wire/1", "op": operation, **fields}
                process.stdin.write(json.dumps(_rust._wire(request)) + "\n")
                process.stdin.flush()
                line = process.stdout.readline()
                self.assertTrue(line, "CLI must flush each response before waiting for the next request")
                return _rust._from_wire(json.loads(_rust._checked_envelope(line)))
            try:
                self.exercise(call)
            finally:
                process.stdin.close()
                self.assertEqual(process.wait(timeout=15), 0, process.stderr.read())


if __name__ == "__main__":
    unittest.main()

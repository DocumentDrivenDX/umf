# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compiler-capability protocol baseline; Python does not execute TeaVM."""
import json
import os
import subprocess
import unittest
from umf import SmithySession, _rust
from umf._rust import UmfCoreError


class SmithySessionBaseline(unittest.TestCase):
    def exercise(self, call):
        source = '$version: "2"\nnamespace demo\nstring Thing'
        document = call('smithy.importSources', files={'model.smithy': source}, id='python-smithy')
        prepared = call('smithy.prepareAssembly', document=document, id='python-assembled',
                        identity='smithy-model@1.73.0/teavm@0.15.0/umf-compat-v1')
        self.assertEqual(prepared['request']['operation'], 'assemble')
        self.assertEqual(prepared['request']['files']['model.smithy'], source)
        completed = call('smithy.completeAssembly', token=prepared['token'], response={
            'valid': True, 'events': [], 'modelJson': json.dumps({
                'smithy': '2.0', 'shapes': {'demo#Thing': {'type': 'string'}}})})
        self.assertEqual(completed['result']['status'], 'assembled')
        selected = call('smithy.prepareSelection', assemblyToken=completed['assemblyToken'], selector='string')
        self.assertEqual(selected['request']['operation'], 'select')
        report = call('smithy.completeSelection', token=selected['token'], response={'shapeIds': ['demo#Thing']})
        self.assertEqual(report['status'], 'selected')
        self.assertEqual(report['shapeIds'], ['demo#Thing'])
        self.assertFalse(report['assembly']['complete'])
        with self.assertRaises(UmfCoreError):
            call('smithy.importSources', files={'../model.smithy': source}, id='invalid')

    def test_python_prepare_complete_select_and_refusal(self):
        self.exercise(SmithySession().execute)

    @unittest.skipUnless(os.environ.get('UMF_TEST_CLI'), 'requires the freshly built Rust CLI')
    def test_cli_interactive_prepare_complete_select_and_refusal(self):
        with subprocess.Popen([os.environ['UMF_TEST_CLI'], 'smithy', '--stdin-session'],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True) as process:
            def call(operation, **fields):
                request = {'profile': 'umf.smithy-native-wire/1', 'op': operation, **fields}
                process.stdin.write(json.dumps(_rust._wire(request)) + '\n')
                process.stdin.flush()
                line = process.stdout.readline()
                self.assertTrue(line, 'CLI must flush each response before reading the next request')
                return _rust._from_wire(json.loads(_rust._checked_envelope(line)))
            try:
                self.exercise(call)
            finally:
                process.stdin.close()
                self.assertEqual(process.wait(timeout=15), 0, process.stderr.read())


if __name__ == '__main__':
    unittest.main()

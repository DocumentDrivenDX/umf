# SPDX-License-Identifier: MIT OR Apache-2.0
"""Baseline for the Rust registry-backed generic adapter CLI transport."""
import json
import os
import subprocess
import unittest
from umf import _rust
from umf._rust import UmfCoreError


@unittest.skipUnless(os.environ.get('UMF_TEST_CLI'), 'requires the freshly built Rust CLI')
class NativeCliBaseline(unittest.TestCase):
    def test_delta_source_roundtrip_and_malformed_refusal(self):
        command = [os.environ['UMF_TEST_CLI'], 'adapter', 'delta-schema']

        def result(arguments, request=None):
            data = None if request is None else json.dumps(_rust._wire(request))
            process = subprocess.run(command + arguments, input=data, text=True,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     check=True, timeout=30)
            return _rust._from_wire(json.loads(_rust._checked_envelope(process.stdout)))

        info = result(['--capabilities'])
        def call(operation, **fields):
            return result(['--stdin-wire'], {'profile': info['profile'],
                'op': info['operations'][operation], **fields})

        source = '{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}'
        document = call('import', source=source, id='cli-delta-source')
        self.assertEqual(json.loads(call('export', document=document)), json.loads(source))
        with self.assertRaises(UmfCoreError) as refused:
            call('import', source='{bad', id='cli-invalid-source')
        self.assertEqual(refused.exception.code, 'JSON_SCHEMA_SYNTAX')


if __name__ == '__main__':
    unittest.main()

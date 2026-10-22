# SPDX-License-Identifier: MIT OR Apache-2.0
"""Original portable compiler controls, separate from native engine authority."""
import hashlib
import importlib.metadata
import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

import weft
from umf_access.build.catalog import compile_catalog
from umf_access.manifest_commands import (
    ManifestBuildError,
    ManifestCompilationError,
    ManifestProgram,
)

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / 'fixtures/access/manifest-command-current-010'

class ManifestProgramTests(unittest.TestCase):
    def program(self):
        return ManifestProgram.build(weft, (FIXTURE/'registry.json').read_text(), json.loads((FIXTURE/'request.json').read_text()), bundle_input_digest='0'*64)

    def test_actual_original_blocked_response_retained(self):
        registry = (FIXTURE/'registry.json').read_text()
        request = json.loads((FIXTURE/'request.json').read_text())
        request['sql'] = 'DELETE FROM Customer'
        from umf_access.native_program import canonical_json
        original = weft.MutationCompiler(registry).compile_json(canonical_json(request))
        self.assertNotEqual(json.loads(original)['status'], 'compiled')
        with self.assertRaises(ManifestCompilationError) as caught:
            ManifestProgram.build(weft, registry, request, bundle_input_digest='0'*64)
        self.assertEqual(caught.exception.original_json, original)
        self.assertTrue(json.loads(caught.exception.original_json)['diagnostics'])
        self.assertIn(original, str(caught.exception))

    def test_invalid_registry_refuses_before_parser_and_compiler(self):
        bad = (' ' * (4*1024*1024+1),
               '{"actions":[],"selectionBackends":[],"x":"' + chr(0xD800) + '"}',
               '{"actions":[],"selectionBackends":[],"x":"\\ud800"}',
               '{"actions":' + '['*64 + '0' + ']'*64 + ',"selectionBackends":[]}')
        request = json.loads((FIXTURE/'request.json').read_text())
        class NoCompiler:
            def __getattr__(self, name):
                raise AssertionError('compiler was accessed: ' + name)
        for registry in bad:
            with self.subTest(prefix=repr(registry[:30])), patch('umf_access.manifest_commands.program_json', side_effect=AssertionError('parser was accessed')) as parse:
                with self.assertRaises(ManifestBuildError):
                    ManifestProgram.build(NoCompiler(), registry, request, bundle_input_digest='0'*64)
                parse.assert_not_called()
            with tempfile.TemporaryDirectory(prefix='manifest-source-bound-') as directory:
                root = Path(directory)
                model = request['model']['utf8']
                (root/'model.json').write_text(model)
                config = {'package':'candidate','modules':['not_imported'],
                          'weft':{'distribution':'weft-sql','version':importlib.metadata.version('weft-sql')},
                          'umf':{'documents':[{'path':'model.json','sha256':hashlib.sha256(model.encode()).hexdigest()}]},
                          'targets':[{'id':'truss','kind':'truss','binding':{'modelJson':model},
                                      'manifestCommands':{'command:0':{'configuration':registry,'request':request}}}]}
                with patch('umf_access.manifest_commands.program_json', side_effect=AssertionError('parser was accessed')) as parse:
                    with self.assertRaises(ManifestBuildError):
                        compile_catalog(config, root, NoCompiler())
                    parse.assert_not_called()

    def test_actual_original_compiler_and_recompilation(self):
        program = self.program()
        program.verify_original(weft)
        self.assertEqual(json.loads(program.checked()['utf8'])['protocol'], 'umf.actions.plan/1')
        self.assertFalse(hasattr(program, 'execute'))

    def test_original_artifact_bytes_not_replaced(self):
        program = self.program()
        response = json.loads(program.response_json)
        response['plan']['utf8'] += ' '
        with self.assertRaisesRegex(ManifestBuildError, 'INTEGRITY'):
            replace(program, response_json=json.dumps(response)).checked()

    def test_original_witness_request_custody(self):
        program = self.program()
        request=json.loads(program.request_json)
        request['parameters']['cutoff']['integerToken']='101'
        with self.assertRaisesRegex(ManifestBuildError, 'SOURCE_DIFFERS'):
            replace(program, request_json=json.dumps(request)).checked()

    def test_wrong_roots_and_budget_closed(self):
        program=self.program()
        for text in ('null','[]','{"actions":[],"actions":[]}','"'+('a'*(4*1024*1024))+'"'):
            with self.subTest(text=text[:30]), self.assertRaises(ManifestBuildError):
                replace(program, configuration_json=text).checked()

    def test_no_runtime_configuration_or_backend_code(self):
        request=json.loads((FIXTURE/'request.json').read_text())
        for config in ({'actions':[],'selectionBackends':[],'connection':'forbidden'}, {'actions':[],'selectionBackends':[{'code':'forbidden'}]}):
            with self.assertRaisesRegex(ManifestBuildError,'REGISTRY'):
                ManifestProgram.build(weft,json.dumps(config),request,bundle_input_digest='0'*64)

    def test_explicit_sdk_artifact_and_total_limits_refuse(self):
        program = self.program()
        response = json.loads(program.response_json)
        text = json.dumps({"padding": "x" * (1024 * 1024)})
        response["plan"] = {"mediaType": "application/json", "utf8": text,
                            "sha256": hashlib.sha256(text.encode()).hexdigest()}
        with self.assertRaisesRegex(ManifestBuildError, 'ARTIFACT_LIMIT'):
            replace(program, response_json=json.dumps(response)).checked()
        with self.assertRaisesRegex(ManifestBuildError, 'RETAINED_INPUT_LIMIT'):
            replace(program, configuration_json=' ' * (4 * 1024 * 1024)).checked()

    def test_bundle_digest_closed(self):
        program = self.program()
        for digest in ('', 'a' * 63, 'A' * 64, None):
            with self.subTest(digest=digest), self.assertRaisesRegex(ManifestBuildError, 'BUNDLE_DIGEST'):
                replace(program, bundle_input_digest=digest).checked()

    def test_missing_original_provider_never_falls_back(self):
        with self.assertRaisesRegex(ManifestBuildError,'COMPILER_REQUIRED'):
            ManifestProgram.build(object(),(FIXTURE/'registry.json').read_text(),json.loads((FIXTURE/'request.json').read_text()),bundle_input_digest='0'*64)

if __name__=='__main__': unittest.main()

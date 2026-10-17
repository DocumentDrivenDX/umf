"""Parser and fail-closed negative acceptance controls; no compiler/native mocks."""
from pathlib import Path
import hashlib
import json
import tempfile
import unittest

from access_type_diagnostics import DiagnosticMismatch, parse_diagnostics, validate_negative


class ExactDiagnosticControls(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.file = self.root / 'bad.py'
        self.file.write_text('from known import wrong\nresult = wrong(1)\n')
        self.spec = {'version': 'umf-static-negative-sites/0.1', 'cases': [{
            'path': 'bad.py', 'sourceSha256': hashlib.sha256(self.file.read_bytes()).hexdigest(),
            'sites': [{'line': 2, 'source': 'result = wrong(1)', 'rules': {
                'mypy': ['arg-type'], 'pyright': ['reportArgumentType'], 'ty': ['invalid-argument-type']}}]}]}

    def text(self, tool, *, line=2, rule=None, extra=False):
        rule = rule or {'mypy': 'arg-type', 'pyright': 'reportArgumentType', 'ty': 'invalid-argument-type'}[tool]
        if tool == 'pyright':
            item = {'file': str(self.file), 'severity': 'error', 'rule': rule, 'range': {'start': {'line': line-1}}}
            return json.dumps({'generalDiagnostics': [item] * (2 if extra else 1)})
        row = (f'bad.py:{line}: error: wrong argument  [{rule}]' if tool == 'mypy'
               else f'bad.py:{line}:5: error[{rule}] wrong argument')
        return row + ('\n'+row if extra else '')

    def validate(self, tool, text, returncode=1):
        return validate_negative(tool, text, self.spec, self.root, returncode=returncode, files=[self.file])

    def test_exact_each_checker_and_multiplicity(self):
        for tool in ('mypy', 'pyright', 'ty'):
            with self.subTest(tool=tool):
                self.assertEqual(len(self.validate(tool, self.text(tool))), 1)
                for text in (self.text(tool, line=1), self.text(tool, rule='unrelated-rule'),
                             self.text(tool, extra=True), '{"generalDiagnostics": []}' if tool == 'pyright' else ''):
                    with self.assertRaises(DiagnosticMismatch):
                        self.validate(tool, text)
                for code in (0, 2, -9):
                    with self.assertRaises(DiagnosticMismatch):
                        self.validate(tool, self.text(tool), returncode=code)

    def test_import_error_and_unparsed_fatal_refuse(self):
        for tool, rule in (('mypy', 'import-not-found'), ('pyright', 'reportMissingImports'), ('ty', 'unresolved-import')):
            with self.subTest(tool=tool), self.assertRaises(DiagnosticMismatch):
                self.validate(tool, self.text(tool, line=1, rule=rule))
        for tool in ('mypy', 'ty'):
            with self.assertRaises(DiagnosticMismatch):
                self.validate(tool, self.text(tool)+'\nerror: checker failed to load configuration')
        with self.assertRaises(DiagnosticMismatch):
            self.validate('pyright', 'checker failed before JSON')

    def test_source_drift_and_missing_file_set_refuse(self):
        self.file.write_text('# shifted\nfrom known import wrong\nresult = wrong(1)\n')
        with self.assertRaises(DiagnosticMismatch):
            self.validate('mypy', self.text('mypy'))
        with self.assertRaises(DiagnosticMismatch):
            validate_negative('mypy', self.text('mypy'), self.spec, self.root, returncode=1, files=[])

    def test_extra_file_outside_repository_and_missing_rule_refuse(self):
        text = self.text('mypy')+'\nforeign.py:2: error: unrelated  [arg-type]'
        with self.assertRaises(DiagnosticMismatch):
            self.validate('mypy', text)
        with self.assertRaises(DiagnosticMismatch):
            self.validate('mypy', self.text('mypy').replace('bad.py', '/outside.py'))
        obj = json.loads(self.text('pyright'));del obj['generalDiagnostics'][0]['rule']
        with self.assertRaises(DiagnosticMismatch):
            self.validate('pyright', json.dumps(obj))


if __name__ == '__main__':
    unittest.main()

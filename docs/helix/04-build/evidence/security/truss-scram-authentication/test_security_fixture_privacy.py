"""Native evidence failure channels must not publish ephemeral credentials."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
HELPER = ROOT / 'docs/helix/04-build/evidence/design-audit/native_fixture_safety.py'
spec = importlib.util.spec_from_file_location('native_fixture_safety_test', HELPER)
safety = importlib.util.module_from_spec(spec)
spec.loader.exec_module(safety)


class SecurityFixturePrivacyTests(unittest.TestCase):
    def test_failure_receipt_and_stderr_both_redact_original_context(self):
        secret = 'sentinel_native_fixture_password_7091'
        with tempfile.TemporaryDirectory() as folder:
            receipt = Path(folder) / 'failed.json'
            code = '''import importlib.util, sys
spec=importlib.util.spec_from_file_location('safety',sys.argv[1])
safety=importlib.util.module_from_spec(spec);spec.loader.exec_module(safety)
secret=sys.argv[3]
try:
 raise ValueError('driver/setup failure with '+secret)
except BaseException as error:
 safety.fail_safely(sys.argv[2],error,[secret],nested={'source':secret})
'''
            result = subprocess.run([sys.executable, '-c', code, str(HELPER), str(receipt), secret],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn(secret, result.stdout + result.stderr + receipt.read_text())
            self.assertIn('[redacted fixture secret]', result.stderr)
            self.assertNotIn('During handling of the above exception', result.stderr)
            retained = json.loads(receipt.read_text())
            self.assertTrue(retained['diagnosticRedacted'])
            self.assertEqual(retained['error'], 'ValueError')
            self.assertEqual(retained['nested']['source'], '[redacted fixture secret]')

    def test_unwritable_receipt_still_redacts_stderr_and_original_context(self):
        secret = 'sentinel_unwritable_fixture_secret_1048'
        with tempfile.TemporaryDirectory() as folder:
            parent = Path(folder) / 'is-file'
            parent.write_text('not a directory')
            receipt = parent / 'failed.json'
            code = """import importlib.util,sys
spec=importlib.util.spec_from_file_location('safety',sys.argv[1])
safety=importlib.util.module_from_spec(spec);spec.loader.exec_module(safety)
secret=sys.argv[3]
try:
 raise ValueError('original driver failure '+secret)
except BaseException as error:
 safety.fail_safely(sys.argv[2],error,[secret])
"""
            result = subprocess.run([sys.executable, '-c', code, str(HELPER), str(receipt), secret],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(receipt.exists())
            self.assertNotIn(secret, result.stdout + result.stderr)
            self.assertIn('[redacted fixture secret]', result.stderr)
            self.assertNotIn('During handling of the above exception', result.stderr)

    def test_close_failure_still_closes_remaining_connections_and_cluster(self):
        calls = []
        class First:
            def close(self):
                calls.append('first')
                raise OSError('sentinel_close_secret')
        class Second:
            def close(self): calls.append('second')
        class Server:
            def cleanup(self): calls.append('server')
        errors = safety.cleanup_owned([First(), Second()], Server())
        self.assertEqual(calls, ['first', 'second', 'server'])
        self.assertEqual(len(errors), 1)
        self.assertEqual(safety.sanitized_message(errors[0], ['sentinel_close_secret']),
                         '[redacted fixture secret]')

    def test_cluster_cleanup_failure_is_retained_after_all_closes(self):
        calls = []
        class Connection:
            def close(self): calls.append('connection')
        class Server:
            def cleanup(self):
                calls.append('server')
                raise OSError('cluster cleanup failed')
        errors = safety.cleanup_owned([Connection(), Connection()], Server())
        self.assertEqual(calls, ['connection', 'connection', 'server'])
        self.assertEqual(len(errors), 1)
        self.assertEqual(str(errors[0]), 'cluster cleanup failed')

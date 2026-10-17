import copy
import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path

from pg_runtime_utility_provenance import timeout_utility


class UtilityControls(unittest.TestCase):
    def example(self, root):
        package = root / 'umf_access'
        package.mkdir()
        source = package / 'postgres_read.py'
        source.write_text('def _snapshot_free_timeout(deadline):\n    return "fixture-only"\n')
        caller = package / 'postgres_search.py'
        caller.write_text('def _run_search():\n    pass\n')
        archive = root / 'runtime.whl'
        with zipfile.ZipFile(archive, 'w') as wheel:
            for path in (source, caller):
                wheel.write(path, 'umf_access/' + path.name)
        digest = lambda data: hashlib.sha256(data).hexdigest()
        query = "SET LOCAL statement_timeout = '5000ms'"
        observation = {'sql': query, 'sqlSha256': digest(query.encode()), 'outcome': 'returned', 'resultColumns': [], 'origin': [{'path': str(caller), 'sourceSha256': digest(caller.read_bytes()), 'function': '_run_search'}], 'protocol': {'observed': True, 'nativeSql': query, 'nativeSqlSha256': digest(query.encode()), 'parameterOids': [], 'parameterFormats': [], 'parameterNulls': []}}
        return observation, {'path': str(archive), 'sha256': digest(archive.read_bytes())}

    def test_exact_successful_utility_has_no_fabricated_ast_or_authority(self):
        with tempfile.TemporaryDirectory() as folder:
            obs, archive = self.example(Path(folder))
            proof = timeout_utility(obs, archive)
            self.assertFalse(proof['parseTreeAnalysisApplicable'])
            self.assertFalse(proof['nativeAuthority'])
            self.assertFalse(proof['inventoryComplete'])
            self.assertEqual(proof['milliseconds'], 5000)
            self.assertEqual(proof['nativeAuthorizationOutcome'], 'selected-execution-returned')

    def test_noncanonical_domain_and_injection_refuse(self):
        with tempfile.TemporaryDirectory() as folder:
            obs, archive = self.example(Path(folder))
            for query in ("SET LOCAL statement_timeout = '0ms'", "SET LOCAL statement_timeout = '05000ms'", "SET LOCAL statement_timeout = '2147483648ms'", "SET LOCAL statement_timeout = '5ms'; SELECT true", "SELECT pg_catalog.set_config('statement_timeout','5ms',true)"):
                with self.subTest(query=query), self.assertRaises(ValueError):
                    timeout_utility(dict(obs, sql=query), archive)

    def test_missing_protocol_callsite_and_changed_source_refuse(self):
        with tempfile.TemporaryDirectory() as folder:
            obs, archive = self.example(Path(folder))
            for mutate in (lambda x: x['protocol'].update(observed=False), lambda x: x['protocol'].update(nativeSql='SELECT true'), lambda x: x.update(resultColumns=[{'native':'x'}]), lambda x: x['protocol'].update(parameterOids=[0]), lambda x: x.update(origin=[]), lambda x: x.update(outcome='raised')):
                bad = copy.deepcopy(obs)
                mutate(bad)
                with self.assertRaises(ValueError):
                    timeout_utility(bad, archive)
            Path(obs['origin'][0]['path']).write_text('changed')
            with self.assertRaises(ValueError):
                timeout_utility(obs, archive)


if __name__ == '__main__':
    unittest.main()

import copy
import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path

from pg_runtime_utility_provenance import search_path_utility, timeout_utility


class UtilityControls(unittest.TestCase):
    def example(self, root):
        package = root / 'umf_access'
        package.mkdir()
        source = package / 'postgres_read.py'
        source.write_text('def _snapshot_free_timeout(deadline):\n    return "fixture-only"\ndef _snapshot_free_search_path(app_schema):\n    return "fixture-only"\n')
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


    def context_observation(self, observation, schema):
        result = copy.deepcopy(observation)
        query = 'SET LOCAL search_path = pg_catalog, "' + schema.replace('"', '""') + '", pg_temp'
        digest = hashlib.sha256(query.encode()).hexdigest()
        result.update(sql=query, sqlSha256=digest)
        result['protocol'].update(nativeSql=query, nativeSqlSha256=digest)
        return result

    def test_exact_quoted_context_preserves_identifier_bytes_without_authority(self):
        with tempfile.TemporaryDirectory() as folder:
            observation, archive = self.example(Path(folder))
            for schema in ('app', 'é', 'a"b', 'a; SELECT true', 'x' * 63):
                with self.subTest(schema=schema):
                    proof = search_path_utility(self.context_observation(observation, schema), archive)
                    self.assertEqual(proof['applicationSchema'], schema)
                    self.assertEqual(proof['kind'], 'snapshot-free-legacy-search-path')
                    self.assertFalse(proof['parseTreeAnalysisApplicable'])
                    self.assertFalse(proof['nativeAuthority'])

    def test_context_noncanonical_or_overlong_refuses(self):
        with tempfile.TemporaryDirectory() as folder:
            observation, archive = self.example(Path(folder))
            for query in ('SET LOCAL search_path = app', 'SET LOCAL search_path = pg_catalog, "app", public', 'SET LOCAL search_path = pg_catalog, "a"b", pg_temp', 'SET LOCAL search_path = pg_catalog, "app", pg_temp; SELECT true'):
                with self.subTest(query=query), self.assertRaises(ValueError):
                    search_path_utility(dict(observation, sql=query), archive)
            for schema in ('', 'é' * 32, 'a' * 64, 'a\x00b'):
                with self.subTest(schema=schema), self.assertRaises(ValueError):
                    search_path_utility(self.context_observation(observation, schema), archive)

    def test_context_protocol_callsite_and_wheel_custody_required(self):
        with tempfile.TemporaryDirectory() as folder:
            observation, archive = self.example(Path(folder))
            observation = self.context_observation(observation, 'app')
            for mutate in (lambda x: x['protocol'].update(parameterOids=[0]), lambda x: x['protocol'].update(nativeSql='SELECT true'), lambda x: x.update(resultColumns=[{'native':'x'}]), lambda x: x.update(origin=[]), lambda x: x.update(outcome='raised')):
                bad = copy.deepcopy(observation)
                mutate(bad)
                with self.assertRaises(ValueError):
                    search_path_utility(bad, archive)
            Path(observation['origin'][0]['path']).write_text('changed')
            with self.assertRaises(ValueError):
                search_path_utility(observation, archive)

if __name__ == '__main__':
    unittest.main()

"""Source-level controls for the G02 native fixture's RLS-independent observer."""
from __future__ import annotations

import ast
import json
import os
import unittest
from pathlib import Path

PACKET = Path(__file__).resolve().parents[3]
RUNNER = Path(__file__).with_name('g02-temporal-native.py')
FIXTURE = Path(os.environ['UMF_G02_TEMPORAL_FIXTURE'])


def function_node(tree: ast.Module, name: str) -> ast.FunctionDef:
    return next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == name)


def null_failure_branch(tree: ast.Module) -> ast.If:
    for node in ast.walk(tree):
        if not isinstance(node, ast.If):
            continue
        test = ast.dump(node.test)
        if "expectedFailure" in test and "null-result" in test:
            return node
    raise AssertionError('null-result failure branch not found')


def call_source(source: str, node: ast.AST) -> str:
    return ast.get_source_segment(source, node) or ''


class ObserverControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = RUNNER.read_text()
        cls.tree = ast.parse(cls.source, filename=str(RUNNER))
        cls.fixture = json.loads(FIXTURE.read_text())
        cls.branch = null_failure_branch(cls.tree)
        cls.branch_source = call_source(cls.source, cls.branch)

    def test_manual_full_row_oracle_matches_fixture_initial_rows(self) -> None:
        node = function_node(self.tree, 'matched_null_initial_rows')
        isolated = ast.Module(body=[node], type_ignores=[])
        namespace: dict[str, object] = {}
        exec(compile(isolated, str(RUNNER), 'exec'), namespace)
        oracle = namespace['matched_null_initial_rows'](('alice_role', 'bob_role'))
        case = next(c for c in self.fixture['cases'] if c['id'] == 'temporal-matched-null-date-rollback')
        owners = {'g02_alice': 'alice_role', 'g02_bob': 'bob_role'}
        expected = []
        order = ('id', 'owner', 'birthDate', 'birthday', 'sourceInstant', 'occurredAt', 'sourceUuid', 'externalId', 'sourceActive', 'active')
        for row in sorted(case['initialRows'], key=lambda value: value['id']):
            expected.append(tuple(owners[row['owner']] if name == 'owner' else row[name] for name in order))
        self.assertEqual(oracle, expected)
        self.assertEqual(len(oracle), 3)

    def test_both_full_row_snapshots_use_one_read_only_admin_observer(self) -> None:
        source = self.branch_source
        self.assertIn("with psycopg.connect(dsn,autocommit=True) as observer:", source)
        self.assertIn("observer.execute('SET TIME ZONE UTC')", source)
        self.assertIn("observer.execute('SET default_transaction_read_only=on')", source)
        self.assertIn("observer.execute('SET row_security=on')", source)
        self.assertIn('before_rows=table_rows(observer,cfg)', source)
        self.assertIn('after_rows=table_rows(observer,cfg)', source)
        self.assertNotIn('table_rows(connection,cfg)', source)
        self.assertIn('before_identity=observer_context(observer)', source)
        self.assertIn('after_identity=observer_context(observer)', source)
        self.assertIn('after_identity==before_identity', source)
        self.assertIn('(before_identity[4] or before_identity[5])', source)
        self.assertIn("before_identity[2]=='on'", source)
        self.assertIn('host_identity_before[0]==before_identity[0]', source)

    def test_manual_initial_oracle_is_asserted_before_host_effect(self) -> None:
        source = self.branch_source
        oracle_at = source.index("check(case['id']+'-initial-full-row-manual-oracle'")
        effect_at = source.index('apply_migration_on_host(host,plan')
        after_snapshot_at = source.index('after_rows=table_rows(observer,cfg)')
        self.assertLess(oracle_at, effect_at)
        self.assertLess(effect_at, after_snapshot_at)
        self.assertIn('before_rows==expected_before and len(before_rows)==3', source)
        self.assertIn('before_rows==after_rows and after_rows==expected_before and len(after_rows)==3', source)

    def test_host_effect_connection_remains_owner_bound(self) -> None:
        source = self.branch_source
        self.assertIn('host_identity_before=connection.execute(', source)
        self.assertIn('host_identity_after=connection.execute(', source)
        self.assertIn('host_identity_after==host_identity_before', source)
        self.assertIn('before_identity[0]==before_identity[1]', source)
        self.assertIn('(before_identity[4] or before_identity[5])', source)
        self.assertIn("before_identity[3]=='none'", source)


if __name__ == '__main__':
    unittest.main(verbosity=2)

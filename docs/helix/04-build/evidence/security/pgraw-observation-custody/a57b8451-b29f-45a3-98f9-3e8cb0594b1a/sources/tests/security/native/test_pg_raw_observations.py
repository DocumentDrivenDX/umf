"""Exercise the original runner's assertion functions without starting a database."""
import ast
import unittest
from pathlib import Path

source = Path(__file__).with_name('pg-raw-membership.py')
names = {'exact_json_equal', 'validate_observations', 'check'}
parsed = ast.parse(source.read_text())
selected = [node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name in names]
assert {node.name for node in selected} == names
import json
namespace = {'json': json, 'CASE': 'pg-raw.control', 'observations': []}
exec(compile(ast.Module(body=selected, type_ignores=[]), str(source), 'exec'), namespace)

class NativeObservationTests(unittest.TestCase):
    def setUp(self):
        namespace['observations'] = []

    def test_nested_scalar_carrier_mismatches_refuse(self):
        for left, right in [(True, 1), (False, 0), (1, 1.0), ('1', 1), (None, False)]:
            with self.subTest(left=left, right=right):
                with self.assertRaises(AssertionError):
                    namespace['check']('types', {'rows': [[left]]}, {'rows': [[right]]})
        self.assertEqual(namespace['observations'], [])

    def test_snapshot_survives_mutation_of_both_inputs(self):
        expected = {'rows': [[1, True]]}
        observed = {'rows': [[1, True]]}
        namespace['check']('snapshot', expected, observed)
        expected['rows'][0][0] = 9
        observed['rows'].append([False])
        self.assertEqual(namespace['observations'][0]['expected'], {'rows': [[1, True]]})
        self.assertEqual(namespace['observations'][0]['observed'], {'rows': [[1, True]]})
        namespace['validate_observations'](namespace['observations'])

    def test_final_validation_detects_corrupted_record(self):
        namespace['check']('final', {'active': True}, {'active': True})
        namespace['observations'][0]['observed']['active'] = 1
        with self.assertRaises(AssertionError):
            namespace['validate_observations'](namespace['observations'])

    def test_duplicate_assertion_refuses(self):
        namespace['check']('duplicate', [], [])
        namespace['check']('duplicate', [], [])
        with self.assertRaises(AssertionError):
            namespace['validate_observations'](namespace['observations'])

    def test_object_order_is_irrelevant_array_order_is_exact(self):
        namespace['check']('order', {'a': 1, 'b': [2, 3]}, {'b': [2, 3], 'a': 1})
        with self.assertRaises(AssertionError):
            namespace['check']('array-order', [2, 3], [3, 2])

    def test_nonfinite_json_refuses(self):
        with self.assertRaises(ValueError):
            namespace['check']('nonfinite', float('inf'), float('inf'))

if __name__ == '__main__':
    unittest.main()

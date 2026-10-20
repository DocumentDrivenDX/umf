# SPDX-License-Identifier: MIT OR Apache-2.0
import copy
import json
import unittest

from umf_access.unified.operation_values import native_batch_arguments
from umf_access.unified.session_policy import SessionError
from umf_access.unified.table_writes import _effect_frames


def program(batch=True, count=2):
    result = {
        'outputs': [{'name': 'umf_result_0', 'field': {'element': 'label'},
                     'carrier': 'string', 'nullable': False}],
        'result': {'affectedMarker': 'umf_affected', 'maxRows': 1},
        'nativeInputs': [{'name': str(i)} for i in range(count)],
        'parameterOrder': ['input', 'fixed'],
        'parameterSources': [
            {'id': 'input', 'source': {'kind': 'input', 'parameter': 'name'}},
            {'id': 'fixed', 'source': {'kind': 'literal', 'nativeValue': 'constant'}},
        ],
        'dbapiSql': 'scalar', 'dbapiParameterOrder': ['input', 'fixed'],
    }
    if batch:
        result['nativeBatch'] = {
            'version': 'weft.table-insert-batch/0.1', 'dbapiSql': 'batch',
            'dbapiParameterOrder': ['nativeRows', 'nativeLiterals'],
            'ordinalColumn': 'umf_input_ordinal',
        }
    return result


def run_frames(plan, replies):
    work = _effect_frames(plan)
    commands = []
    try:
        command = next(work)
        for reply in replies:
            commands.append(command)
            command = work.send(reply)
    except StopIteration as done:
        return commands, done.value
    finally:
        work.close()
    raise AssertionError('unexpected extra database command')


class BatchFrameTests(unittest.TestCase):
    def test_batch_and_scalar_return_identical_ordered_effects(self):
        columns = ['umf_result_0', 'umf_affected']
        scalar, expected = run_frames(program(False), [
            (columns, [('first', 1)]), (columns, [('second', 1)]),
        ])
        batch, actual = run_frames(program(), [
            (['umf_input_ordinal', *columns], [(0, 'first', 1), (1, 'second', 1)]),
        ])
        self.assertEqual(actual, expected)
        self.assertEqual(len(scalar), 2)
        self.assertEqual(len(batch), 1)
        self.assertEqual(actual[0], [1, 1])

    def test_thousand_items_use_one_command_and_one_literal_payload(self):
        plan = program(count=1000)
        commands, (effects, frames) = run_frames(plan, [
            (['umf_input_ordinal', 'umf_result_0', 'umf_affected'],
             [(i, str(i), 1) for i in range(1000)]),
        ])
        self.assertEqual(len(commands), 1)
        rows, literals = map(json.loads, commands[0].parameters)
        self.assertEqual(rows, [[str(i)] for i in range(1000)])
        self.assertEqual(literals, ['constant'])
        self.assertEqual(effects, [1] * 1000)
        self.assertEqual(len(frames), 1000)

    def test_batch_refuses_missing_duplicate_or_reordered_ordinals(self):
        columns = ['umf_input_ordinal', 'umf_result_0', 'umf_affected']
        for rows in [[(0, 'a', 1)], [(0, 'a', 1), (0, 'b', 1)],
                     [(1, 'a', 1), (0, 'b', 1)], [(False, 'a', 1), (1, 'b', 1)]]:
            with self.subTest(rows=rows), self.assertRaises(SessionError):
                run_frames(program(), [(columns, rows)])

    def test_effect_markers_and_output_columns_remain_required(self):
        for columns, rows in [
            (['wrong', 'umf_result_0', 'umf_affected'], [(0, 'a', 1), (1, 'b', 1)]),
            (['umf_input_ordinal', 'umf_result_0', 'umf_affected'], [(0, 'a', 0), (1, 'b', 1)]),
        ]:
            with self.subTest(columns=columns, rows=rows), self.assertRaises(SessionError):
                run_frames(program(), [(columns, rows)])

    def test_no_returning_still_records_one_effect_per_input(self):
        plan = program()
        plan['outputs'] = []
        _, (effects, frames) = run_frames(plan, [
            (['umf_input_ordinal', 'umf_affected'], [(0, 1), (1, 1)]),
        ])
        self.assertEqual(effects, [1, 1])
        self.assertEqual(frames, [
            {'affectedCount': {'integerToken': '1'}, 'rows': []},
            {'affectedCount': {'integerToken': '1'}, 'rows': []},
        ])

    def test_parameters_preserve_exact_native_values_and_order(self):
        plan = program()
        plan['nativeInputs'] = [{'name': '1.00'}, {'name': None}]
        plan['parameterSources'][1]['source']['nativeValue'] = '🙂 % \\ "'
        before = copy.deepcopy(plan)
        rows, literals = map(json.loads, native_batch_arguments(plan))
        self.assertEqual(rows, [['1.00'], [None]])
        self.assertEqual(literals, ['🙂 % \\ "'])
        self.assertEqual(plan, before)


if __name__ == '__main__':
    unittest.main()

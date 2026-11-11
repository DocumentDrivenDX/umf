# SPDX-License-Identifier: MIT OR Apache-2.0
"""UNEXECUTED native sidecar; place beside test_retained_codegen_native.py.

Private native boundary controls, not additional public 1M feasibility cases.
The existing 51 strict cold public cases remain mandatory and unchanged.
"""
import json
import unittest
from test_retained_codegen_native import (
    _resources, _cases, _rust_core, _raise_native, UmfCoreError,
    _ConstructionControl, _request_wire, _native_result, CONVERSION, COMPILATION,
)


class CombinedBudgetConversionBoundaryTests(unittest.TestCase):
    def reject(self, resources, code, path):
        control = _ConstructionControl()
        marker = object()
        result = marker
        try:
            with self.assertRaises(ValueError) as raw:
                result = _rust_core.create_codegen_resources(resources, control)
            self.assertIs(result, marker, 'Failed conversion published a handle')
            with self.assertRaises(UmfCoreError) as converted:
                _raise_native(raw.exception)
            self.assertEqual(converted.exception.code, code)
            self.assertEqual(converted.exception.path, path)
            self.assertGreater(control.phase_work[CONVERSION], 0)
            return converted.exception
        finally:
            print('combined-conversion-control ' + json.dumps(control.receipt()), flush=True)

    def test_nested_paths_escape_each_segment_and_preserve_utf16_and_failure_order(self):
        # Insert order deliberately differs from lexical order. Default contains
        # DATA, not schema keywords. Unsupported objects never reach compilation.
        for key in ('a/~\U0001f600', 'a/~\ud83d\ude00', '\ud800/~'):
            resources = _resources()
            self.assertNotIn('default', resources['coreSchema'])
            resources['coreSchema']['default'] = {key: [None, object()], 'earlier-lexically': object()}
            normalized = key.encode('utf-16-le', 'surrogatepass').decode('utf-16-le', 'surrogatepass')
            segment = normalized.replace('~', '~0').replace('/', '~1')
            self.reject(resources, 'UNSUPPORTED_VALUE', '/default/' + segment + '/1')

    def test_normalized_key_collision_refuses_in_both_orders_even_in_unknown_default_data(self):
        scalar, pair = '\U0001f600', '\ud83d\ude00'
        self.assertNotEqual(scalar, pair)
        for keys in ((scalar, pair), (pair, scalar)):
            resources = _resources()
            self.assertNotIn('default', resources['coreSchema'])
            resources['coreSchema']['default'] = {keys[0]: 1, keys[1]: 2}
            self.assertEqual(len(resources['coreSchema']['default']), 2)
            # Actual owner guard reports collision at root, not invented path.
            self.reject(resources, 'DUPLICATE_KEY', '')

    def test_first_bad_value_precedes_later_collision_and_unsafe_integer_keeps_exact_path(self):
        resources = _resources()
        self.assertNotIn('default', resources['coreSchema'])
        resources['coreSchema']['default'] = {'first/~': 2**53, '\U0001f600': 1, '\ud83d\ude00': 2}
        self.reject(resources, 'NUMBER', '/default/first~1~0')

    def test_compilation_owns_nested_mutable_python_content_and_reentry_denial_is_terminal(self):
        resources = _resources()
        self.assertNotIn('default', resources['coreSchema'])
        payload = {'future/~\ud800': [0.0, 1.25, {'opaque': '\ud800'}]}
        resources['coreSchema']['default'] = payload
        outer = _ConstructionControl()
        inner = _ConstructionControl(deny_phase=CONVERSION)
        entered = [False]
        def control(amount, phase):
            if phase == COMPILATION and amount > 0 and not entered[0]:
                entered[0] = True
                # Compilation must already own the complete tree. Mutating the
                # original annotation and clearing the resource map cannot affect
                # it. A separate nested candidate cannot replace outer state.
                payload.clear()
                resources['coreSchema'].clear()
                resources.clear()
                with self.assertRaises(UmfCoreError) as error:
                    _rust_core.create_codegen_resources(_resources(), inner)
                self.assertIs(error.exception, inner.failure)
                self.assertEqual(inner.after_denial, 0)
            return outer(amount, phase)
        try:
            handle = _rust_core.create_codegen_resources(resources, control)
            self.assertTrue(entered[0], 'Actual compilation callback not reached')
            self.assertEqual(resources, {})
            self.assertGreater(outer.phase_work[CONVERSION], 0)
            self.assertGreater(outer.phase_work[COMPILATION], 0)
            row = _cases()[0]
            self.assertEqual(_native_result(handle.execute_wire(
                _request_wire(row['request']), lambda amount, phase: None)),
                {'ok': True, 'result': row['expected']})
        finally:
            print('combined-reentrant-control ' + json.dumps(
                {'outer': outer.receipt(), 'inner': inner.receipt()}), flush=True)


if __name__ == '__main__':
    unittest.main()

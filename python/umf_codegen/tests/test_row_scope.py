# SPDX-License-Identifier: MIT OR Apache-2.0
"""Keep the Python authoring wrapper on the shared native operation path."""
import unittest
from unittest.mock import patch

from umf_codegen import normalize_row_scope


class RowScopeWrapper(unittest.TestCase):
    @patch('umf_codegen.execute')
    def test_dispatches_json_context_to_shared_native_operation(self, execute):
        expected = {'valid': True, 'policy': {}, 'source': {}, 'diagnostics': [], 'sourceToOutput': {}}
        execute.return_value = expected
        source = {'row_scope': {'commands': ['select'], 'batch': []}}
        context = {'record': {'module': 'legal', 'element': 'matters'},
                   'ownerColumns': {}, 'via': [], 'lifecycleDocument': {},
                   'tableId': 'matters', 'deploymentConfiguration': {}}
        self.assertEqual(normalize_row_scope(source, context=context), expected)
        execute.assert_called_once_with({'input': source, 'context': context}, 30, operation='row_scope')


if __name__ == '__main__':
    unittest.main()

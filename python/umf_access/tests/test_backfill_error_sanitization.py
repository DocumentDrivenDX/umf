# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import json
import sys
import traceback
import types
import unittest
from unittest.mock import patch

from umf_access.lifecycle.backfills import _apply_backfill
from umf_access.lifecycle.catalog import CatalogError

_GUARD = {
    'profile': 'pg18-row-expression-exact/0.1',
    'sqlstate': '22012',
    'scope': 'all-direct-target-rows',
    'nullResult': 'statement-error-and-transaction-rollback',
    'nonfiniteInput': 'statement-error-and-transaction-rollback',
    'lossyAssignment': 'statement-error-and-transaction-rollback',
    'privateResults': True,
}


class _Cursor:
    def __init__(self, error):
        self.error = error

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, *_args):
        raise self.error


def _apply_with_error(error, *, derived=True, psycopg_module=None):
    version = 'umf.table-migration/0.4' if derived else 'umf.table-migration/0.3'
    options_version = 'umf.table-migration-options/0.4' if derived else 'umf.table-migration-options/0.3'
    program_version = 'weft.table-operation/0.2' if derived else 'weft.table-operation/0.1'
    result = {'kind': 'mutation', 'affectedMarker': 'umf_affected', 'maxRows': 10}
    if derived:
        result['nativeExactValueGuard'] = _GUARD
    program = {
        'status': 'compiled',
        'outputs': [],
        'version': program_version,
        'binding': {'modelSha256': 'source-digest'},
        'module': 'demo',
        'operation': 'derive_total',
        'result': result,
        'nativeInputs': ['one'],
        'parameterSources': [],
        'dbapiParameterOrder': [],
        'dbapiSql': 'UPDATE "app"."notes" SET "total" = 1',
    }
    compiled = types.SimpleNamespace(bind_json=lambda _call: json.dumps(program))
    operation_module = types.SimpleNamespace(prepare=lambda _operation: compiled)
    weft_module = types.ModuleType('weft')
    weft_module.prepare_table_operation_module_json = lambda _source: operation_module
    bundle = {
        'module': 'demo',
        'sourceDigest': 'source-digest',
        'expectedCatalog': {'tables': [{'id': 'notes', 'name': 'notes'}]},
        'configuration': {'schema': 'app'},
    }
    plan = {
        'version': version,
        'digest': 'plan-digest',
        'next': bundle,
        'options': {
            'version': options_version,
            'backfills': [{'operation': 'derive_total', 'table': 'notes', 'scopedRows': True}],
        },
    }
    modules = {'weft': weft_module}
    if psycopg_module is not None:
        modules['psycopg'] = psycopg_module
    with patch.dict(sys.modules, modules), \
         patch('umf_access.lifecycle.backfills._binding', return_value={}), \
         patch('umf_access.lifecycle.backfills._execute'), \
         patch('umf_access.lifecycle.backfills._cursor', return_value=_Cursor(error)):
        _apply_backfill(object(), plan, {'operation': 'derive_total', 'phaseOperation': 'backfill'})


class BackfillErrorSanitizationTests(unittest.TestCase):
    def test_missing_psycopg_keeps_the_lazy_import_error(self):
        with (patch.dict(sys.modules, {'psycopg': None}),
              self.assertRaises(ModuleNotFoundError) as raised):
            _apply_with_error(RuntimeError('private database detail'))
        self.assertIn('psycopg', str(raised.exception))

    def test_psycopg_error_is_sanitized_but_keeps_sqlstate(self):
        class FakePsycopgError(Exception):
            sqlstate = '22012'

        psycopg_module = types.ModuleType('psycopg')
        psycopg_module.Error = FakePsycopgError
        error = FakePsycopgError('private row data and SQL text')
        with self.assertRaises(CatalogError) as raised:
            _apply_with_error(error, psycopg_module=psycopg_module)
        self.assertEqual(str(raised.exception), 'derived-backfill-native-error')
        self.assertEqual(raised.exception.sqlstate, '22012')
        self.assertTrue(raised.exception.__suppress_context__)
        self.assertNotIn('private row data', ''.join(traceback.format_exception(raised.exception)))
        self.assertNotIn('SQL text', ''.join(traceback.format_exception(raised.exception)))

    def test_legacy_profile_rethrows_driver_error_without_g02_sanitization(self):
        error = RuntimeError('legacy native detail')
        with (patch.dict(sys.modules, {'psycopg': None}),
              self.assertRaises(RuntimeError) as raised):
            _apply_with_error(error, derived=False)
        self.assertIs(raised.exception, error)


if __name__ == '__main__':
    unittest.main()

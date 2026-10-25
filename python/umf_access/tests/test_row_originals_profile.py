# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import copy
import inspect
import unittest
from unittest.mock import patch

from umf_access.lifecycle import row_originals as originals
from umf_access.lifecycle.catalog import CatalogError


class RowOriginalsProfileTests(unittest.TestCase):
    def _acl_store(self):
        store = object.__new__(originals.PgRowOriginalsStore)
        store._schema = 'umf_originals_00000000000040008000000000000001'
        store._controller_oid = 50001
        store._connection = object()
        return store

    def _pg18_acl_rows(self, *, include_maintain=True, grantable=False):
        privileges = ['INSERT', 'SELECT', 'UPDATE', 'DELETE', 'TRUNCATE',
                      'REFERENCES', 'TRIGGER']
        if include_maintain:
            privileges.append('MAINTAIN')
        table_rows = [
            (table, 50001, 50001, privilege, grantable)
            for table in ('row_tables', 'archives', 'issued_instances')
            for privilege in privileges
        ]
        schema_rows = [(50001, 50001, privilege, False)
                       for privilege in ('CREATE', 'USAGE')]
        return table_rows, schema_rows

    def test_pg18_default_owner_acls_accept_only_exact_ordinary_privileges(self):
        table_rows, schema_rows = self._pg18_acl_rows()
        with patch.object(originals, '_all', side_effect=[table_rows, schema_rows]):
            self._acl_store()._verify_store_acl()

    def test_pg18_default_owner_acl_rejects_missing_extra_or_grantable_privileges(self):
        table_rows, schema_rows = self._pg18_acl_rows()
        extra_public = table_rows + [('archives', 0, 0, 'SELECT', False)]
        wrong_grantor = [
            (table, grantee, 60001, privilege, grantable)
            for table, grantee, _grantor, privilege, grantable in table_rows
        ]
        grantable_schema = [(grantee, grantor, privilege, True)
                            for grantee, grantor, privilege, _grantable in schema_rows]
        for candidate_tables, candidate_schema in (
                self._pg18_acl_rows(include_maintain=False),
                self._pg18_acl_rows(grantable=True),
                (extra_public, schema_rows),
                (wrong_grantor, schema_rows),
                (table_rows, grantable_schema)):
            with self.subTest(table_rows=candidate_tables[-1:],
                               schema_rows=candidate_schema), \
                    patch.object(originals, '_all',
                                 side_effect=[candidate_tables, candidate_schema]), \
                    self.assertRaisesRegex(CatalogError,
                                           'row-originals-store-acl-mismatch'):
                self._acl_store()._verify_store_acl()

    def test_provider_schema_name_is_exact_lowercase_uuid_incarnation(self):
        self.assertEqual(
            originals.originals_schema_name('00000000-0000-4000-8000-000000000001'),
            'umf_originals_00000000000040008000000000000001')
        for value in ('00000000-0000-4000-8000-00000000000A',
                      'umf_originals_00000000000040008000000000000001',
                      '00000000000040008000000000000001'):
            with self.subTest(value=value), self.assertRaisesRegex(
                    CatalogError, 'row-originals-record-invalid'):
                originals.originals_schema_name(value)

    def test_row_table_record_is_closed_bounded_and_digest_covers_unknowns(self):
        record = {
            'profile': originals.ROW_RECORD_PROFILE,
            'providerId': '00000000-0000-4000-8000-000000000001',
            'installationId': 'installation-a',
            'targetCustody': {'profile': 'custody/1', 'digest': 'a' * 64},
            'tableToken': '00000000-0000-4000-8000-000000000002',
            'tableBinding': 'module/Table',
            'businessRelation': {'schemaOid': 16384, 'schemaName': 'app',
                                 'tableOid': 16385, 'tableName': 'items'},
            'idColumn': {'attnum': 4, 'name': '__umf_row_id_a',
                         'typeOid': 2950, 'typeMod': -1},
            'revisionColumn': {'attnum': 5, 'name': '__umf_row_rev_a',
                                'typeOid': 20, 'typeMod': -1},
            'uniqueConstraint': {'oid': 16390, 'name': 'key_a',
                                 'definitionDigest': 'b' * 64},
            'revisionConstraint': {'oid': 16391, 'name': 'positive_a',
                                   'definitionDigest': 'c' * 64},
            'trigger': {'oid': 16392, 'name': 'guard_a',
                        'definitionDigest': 'd' * 64},
            'function': {'oid': 16393, 'name': 'identity_a',
                         'definitionDigest': 'e' * 64},
            'creationReservationDigest': 'f' * 64,
            'maxIssuedInstances': 1_000_000,
        }
        checked = originals.validate_row_table_record(record)
        self.assertEqual(checked, record)
        digest = originals.record_digest(checked)
        changed = copy.deepcopy(checked)
        changed['maxIssuedInstances'] -= 1
        self.assertNotEqual(originals.record_digest(changed), digest)
        for mutation in (
                lambda item: item.update({'extra': True}),
                lambda item: item.update({'maxIssuedInstances': True}),
                lambda item: item['businessRelation'].update({'tableOid': 0}),
                lambda item: item['targetCustody'].update({'bad': '\ud800'})):
            bad = copy.deepcopy(record)
            mutation(bad)
            with self.subTest(bad=bad), self.assertRaises(CatalogError):
                originals.validate_row_table_record(bad)

    def test_archive_record_requires_complete_typed_domain_and_policy(self):
        record = {
            'profile': originals.ARCHIVE_RECORD_PROFILE,
            'providerId': '00000000-0000-4000-8000-000000000001',
            'installationId': 'installation-a',
            'targetCustody': {'profile': 'custody/1', 'digest': 'a' * 64},
            'archiveId': '00000000-0000-4000-8000-000000000003',
            'tableToken': '00000000-0000-4000-8000-000000000002',
            'field': {'module': 'module', 'element': 'value'},
            'sourceDigest': '1' * 64, 'targetDigest': '2' * 64,
            'planDigest': '3' * 64, 'approvalDigest': '4' * 64,
            'policy': {'id': 'retention-a', 'revision': 'r1'},
            'sourceNativeDomain': {'schema': 'pg_catalog', 'name': 'int4',
                                   'typeOid': 23, 'typeMod': -1, 'collationOid': 0},
            'valuesRelation': {'schema': 'umf_originals_00000000000040008000000000000001',
                               'name': 'values_00000000000040008000000000000003',
                               'oid': 16394},
            'creationReservationDigest': '5' * 64,
            'state': 'capturing', 'rowCount': 0, 'logicalBytes': 0,
        }
        self.assertEqual(originals.validate_archive_record(record), record)
        invalid = copy.deepcopy(record)
        invalid['policy']['revision'] = ''
        with self.assertRaisesRegex(CatalogError, 'row-originals-record-invalid'):
            originals.validate_archive_record(invalid)
        invalid = copy.deepcopy(record)
        invalid['rowCount'] = 1_000_001
        with self.assertRaisesRegex(CatalogError, 'row-originals-record-invalid'):
            originals.validate_archive_record(invalid)

    def test_native_domain_renderer_uses_only_qualified_pg_catalog_types(self):
        response = ('pg_catalog', 'int4', 'b', 0, -1, 0, None, None)
        domain = {'schema': 'pg_catalog', 'name': 'int4', 'typeOid': 23,
                  'typeMod': -1, 'collationOid': 0}
        with patch.object(originals, '_one', return_value=response):
            self.assertEqual(originals._source_type_sql(object(), domain), 'pg_catalog.int4')
            forged = {**domain, 'schema': 'public'}
            with self.assertRaisesRegex(CatalogError, 'row-originals-native-domain-mismatch'):
                originals._source_type_sql(object(), forged)
        with patch.object(originals, '_one', return_value=(
                'pg_catalog', 'int4', 'b', 0, -1, 0, None, None)):
            for forged in ({**domain, 'extra': 'ignored'},
                           {**domain, 'typeMod': 2},
                           {**domain, 'collationOid': 100}):
                with self.subTest(forged=forged), self.assertRaises(CatalogError):
                    originals._source_type_sql(object(), forged)

    def test_exact_text_collation_and_signed_numeric_typmods_are_preserved(self):
        text_response = ('pg_catalog', 'text', 'b', 0, -1, 950, 'C', 'pg_catalog')
        text_domain = {'schema': 'pg_catalog', 'name': 'text', 'typeOid': 25,
                       'typeMod': -1, 'collationOid': 950}
        with patch.object(originals, '_one', return_value=text_response):
            self.assertEqual(originals._source_type_sql(object(), text_domain),
                             'pg_catalog.text COLLATE pg_catalog."C"')
            with self.assertRaisesRegex(CatalogError, 'row-originals-native-domain-unsupported'):
                originals._source_type_sql(
                    object(), {**text_domain, 'collationOid': 951})

        def numeric_typmod(precision: int, scale: int) -> int:
            return 4 + (precision << 16) + (scale & 0x7FF)

        numeric_domain = {'schema': 'pg_catalog', 'name': 'numeric', 'typeOid': 1700,
                          'typeMod': numeric_typmod(12, -2), 'collationOid': 0}
        numeric_response = ('pg_catalog', 'numeric', 'b', 0, -1, 0, None, None)
        with patch.object(originals, '_one', return_value=numeric_response):
            self.assertEqual(originals._source_type_sql(object(), numeric_domain),
                             'pg_catalog.numeric(12,-2)')
            too_wide = {**numeric_domain, 'typeMod': numeric_typmod(12, -1001)}
            with self.assertRaisesRegex(CatalogError, 'row-originals-native-domain-unsupported'):
                originals._source_type_sql(object(), too_wide)

    def test_identity_guard_is_fixed_and_reserves_without_conflict_suppression(self):
        sql = originals.identity_function_sql(
            'umf_originals_00000000000040008000000000000001', 'identity_a',
            token='00000000-0000-4000-8000-000000000002', table_oid=16385,
            table_schema='app', table_name='items', id_column='row_id',
            revision_column='row_revision')
        self.assertIn('TG_RELID <> 16385::pg_catalog.oid', sql)
        self.assertIn('TG_TABLE_SCHEMA <> \'app\'', sql)
        self.assertIn('issued_count" < ("record"->>\'maxIssuedInstances\')', sql)
        self.assertIn('INSERT INTO "umf_originals_00000000000040008000000000000001"."issued_instances"', sql)
        self.assertNotIn('ON CONFLICT', sql)
        self.assertNotIn('EXECUTE ', sql)
        for bad in ('bad\x00schema', 'bad\x00column'):
            with self.subTest(bad=bad), self.assertRaisesRegex(
                    CatalogError, 'row-originals-record-invalid'):
                originals.identity_function_sql(
                    'safe', 'identity_a', token='00000000-0000-4000-8000-000000000002',
                    table_oid=16385, table_schema='app', table_name='items',
                    id_column=bad, revision_column='row_revision')

    def test_missing_exact_native_adapter_fails_closed(self):
        with patch.dict('sys.modules', {
                'umf_access.lifecycle.ingress_local_postgres': None}):
            with self.assertRaisesRegex(CatalogError,
                                       'row-originals-authority-unavailable'):
                originals._authority_context(object(), object(), object(), object(), object())

    def test_purge_is_not_admitted_by_profile_01(self):
        store = object.__new__(originals.PgRowOriginalsStore)
        with self.assertRaisesRegex(CatalogError, 'row-originals-purge-unavailable'):
            store.purge('00000000-0000-4000-8000-000000000003')

    def test_business_table_operations_fail_closed_until_native_session_contract(self):
        store = object.__new__(originals.PgRowOriginalsStore)
        with patch.object(originals.PgRowOriginalsStore, 'verify', lambda _self: None):
            with self.assertRaisesRegex(CatalogError,
                                        'row-originals-table-enrollment-unavailable'):
                store.enroll_table(relation_schema='app', relation_name='items',
                                   table_binding='module/Table', installation_id='x')
            with self.assertRaisesRegex(CatalogError,
                                        'row-originals-session-capability-unavailable'):
                store.capture_originals(table=object(), field={}, column_name='value',
                                        source_digest='a' * 64, target_digest='b' * 64,
                                        plan_digest='c' * 64, approval_digest='d' * 64,
                                        policy={}, source_native_domain={})
            with self.assertRaisesRegex(CatalogError,
                                        'row-originals-session-capability-unavailable'):
                store.record_post_conversion_baseline(object(), table=object())
            with self.assertRaisesRegex(CatalogError,
                                        'row-originals-session-capability-unavailable'):
                store.inspect_restore(object(), table=object())

    def test_capture_source_never_disables_rls_or_switches_business_role(self):
        source = inspect.getsource(originals.PgRowOriginalsStore._capture_rows)
        self.assertNotIn('DISABLE ROW LEVEL SECURITY', source)
        self.assertNotIn('SET ROLE', source)
        self.assertIn('row-originals-session-capability-unavailable', source)


if __name__ == '__main__':
    unittest.main()

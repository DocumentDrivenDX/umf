# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import copy
import hashlib
import unittest
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock, patch

from umf_access.lifecycle import row_originals_creation as creation
from umf_access.lifecycle import row_originals as originals
from umf_access.lifecycle import ingress_local_postgres as postgres_supervisor
from umf_access.lifecycle.ingress_local_postgres import LocalPostgresSupervisor
from umf_access.lifecycle.catalog import CatalogError

PROVIDER = '00000000-0000-4000-8000-000000000001'
SCHEMA = 'umf_originals_00000000000040008000000000000001'
SCHEMA_OID = 16384


def _address(class_id: int, object_id: int, sub_id: int = 0) -> dict[str, int]:
    return {'classId': class_id, 'objectId': object_id, 'subId': sub_id}


def _object(class_id: int, object_id: int, sub_id: int, kind: str,
            schema: str, name: str, member: str | None,
            parent: dict[str, int] | None) -> dict[str, object]:
    return {
        'classId': class_id,
        'objectId': object_id,
        'subId': sub_id,
        'kind': kind,
        'qualifiedName': {'schema': schema, 'name': name, 'member': member},
        'definitionDigest': 'a' * 64,
        'parent': parent,
    }


def _objects() -> list[dict[str, object]]:
    namespace = _address(2615, SCHEMA_OID)
    tables = [_address(1259, oid) for oid in (16385, 16386, 16387)]
    objects = [_object(2615, SCHEMA_OID, 0, 'schema', SCHEMA, SCHEMA, None, None)]
    for relation, name in zip(tables, ('row_tables', 'archives', 'issued_instances'),
                              strict=True):
        objects.append(_object(1259, relation['objectId'], 0, 'table', SCHEMA,
                               name, None, namespace))
        objects.append(_object(1247, relation['objectId'] + 10, 0, 'row-type',
                               SCHEMA, name, None, relation))
        objects.append(_object(1247, relation['objectId'] + 20, 0, 'array-type',
                               SCHEMA, '_' + name, None,
                               _address(1247, relation['objectId'] + 10)))
    objects.append(_object(1259, tables[0]['objectId'], 1, 'column', SCHEMA,
                           'row_tables', 'table_token', tables[0]))
    # The wire format is sorted by native object address.
    return sorted(objects, key=lambda item: (
        item['classId'], item['objectId'], item['subId']))


def _receipt(objects: list[dict[str, object]]) -> dict[str, object]:
    return {
        'profile': creation.RECEIPT_PROFILE,
        'providerId': PROVIDER,
        'installationId': 'installation-a',
        'storeProfile': 'umf.native-row-originals-store/0.1',
        'storeId': PROVIDER,
        'reservationDigest': 'b' * 64,
        'creationRequestDigest': 'c' * 64,
        'creationApprovalDigest': 'd' * 64,
        'targetCustodyDigest': 'e' * 64,
        'schemaOid': SCHEMA_OID,
        'objects': objects,
        'state': 'created',
    }


class RowOriginalsCreationTests(unittest.TestCase):
    def test_provider_verify_uses_issuer_original_store_capability_method(self):
        capability, reservation = object(), object()
        supervisor = object.__new__(LocalPostgresSupervisor)
        store = object.__new__(originals.PgRowOriginalsStore)
        store._supervisor = supervisor
        store._creation_capability = capability
        store._creation_reservation = reservation
        with (patch.object(LocalPostgresSupervisor,
                           '_resolve_original_store_capability',
                           return_value=capability) as resolve,
              patch.object(originals.PgRowOriginalsStore, '_refresh_authority'),
              patch.object(originals.PgRowOriginalsStore, '_require_tx'),
              patch.object(originals.PgRowOriginalsStore, '_verify_controller_session'),
              patch.object(originals.PgRowOriginalsStore, '_verify_store')):
            store.verify()
        resolve.assert_called_once_with(capability, original_reservation=reservation)
        self.assertTrue(callable(LocalPostgresSupervisor._resolve_original_store_capability))

    def test_provider_confirm_creation_resolves_actual_issuer_capability(self):
        capability, reservation = object(), object()
        supervisor = object.__new__(LocalPostgresSupervisor)
        store = object.__new__(originals.PgRowOriginalsStore)
        store._supervisor = supervisor
        store._connection = Mock()
        store._connection.info.transaction_status = 0
        store._creation_reservation = reservation
        store._creation_receipt = {'schemaOid': SCHEMA_OID}
        store._creation_capability = None
        store._recovery_only = False
        with (patch.object(LocalPostgresSupervisor,
                           'confirm_originals_store_creation',
                           return_value=capability) as confirm,
              patch.object(LocalPostgresSupervisor,
                           '_resolve_original_store_capability',
                           return_value=capability) as resolve,
              patch.object(originals.PgRowOriginalsStore, '_refresh_authority')):
            self.assertIs(store.confirm_creation(), capability)
        confirm.assert_called_once_with(reservation, receipt={'schemaOid': SCHEMA_OID})
        resolve.assert_called_once_with(capability, original_reservation=reservation)
        self.assertIs(store._creation_capability, capability)

    def test_creation_attempt_handle_is_issuer_sealed_immutable_and_nonserializable(self):
        reservation = object()
        connection = object()
        attempt_type = postgres_supervisor._OriginalStoreCreationAttempt
        with self.assertRaisesRegex(TypeError, 'supervisor-issued'):
            attempt_type(object(), object(), reservation, connection, xid='12',
                         database_name='db', database_oid=42,
                         system_identifier='12345678901234567', backend_pid=99,
                         backend_start='2026-01-01 00:00:00+00', budget=None)
        attempt = attempt_type(
            postgres_supervisor._ORIGINAL_STORE_ATTEMPT_SEAL,
            object(), reservation, connection, xid='12', database_name='db',
            database_oid=42, system_identifier='12345678901234567', backend_pid=99,
            backend_start='2026-01-01 00:00:00+00', budget=None)
        with self.assertRaisesRegex(AttributeError, 'immutable'):
            attempt._xid = '13'
        with self.assertRaisesRegex(TypeError, 'cannot be serialized'):
            attempt.__reduce_ex__(4)

    def test_explicit_resume_uses_same_reservation_and_live_attempt(self):
        connection = Mock()
        connection.info.transaction_status = 2
        supervisor = object.__new__(LocalPostgresSupervisor)
        reservation, old_attempt, next_attempt = (
            SimpleNamespace(_budget=object()), object(), object())
        store = object.__new__(originals.PgRowOriginalsStore)
        store._supervisor = supervisor
        store._connection = connection
        store._schema = SCHEMA
        store._controller_role = 'controller'
        store._controller_oid = 42
        store._creation_reservation = reservation
        store._creation_attempt = old_attempt
        store._creation_receipt_fields = {'profile': 'receipt-fields'}
        store._creation_capability = None
        store._creation_receipt = {'stale': 'rolled-back'}
        store._schema_oid = 19000
        store._recovery_only = False
        with (patch.object(originals.PgRowOriginalsStore, '_refresh_authority'),
              patch.object(originals.PgRowOriginalsStore, '_require_tx'),
              patch.object(originals.PgRowOriginalsStore, '_verify_controller_session'),
              patch.object(originals.PgRowOriginalsStore, '_verify_store'),
              patch.object(LocalPostgresSupervisor,
                           '_require_original_store_budget'),
              patch.object(LocalPostgresSupervisor,
                           'resume_originals_store_creation_attempt',
                           return_value=next_attempt) as settle,
              patch.object(LocalPostgresSupervisor,
                           'reserve_originals_store_creation',
                           side_effect=AssertionError('must not reserve again')),
              patch.object(LocalPostgresSupervisor,
                           '_budgeted_original_store_connection',
                           return_value=connection),
              patch.object(originals, '_create_store_schema', return_value=SCHEMA_OID) as ddl,
              patch.object(creation, 'observe_and_write_receipt', return_value={'schemaOid': SCHEMA_OID}) as receipt):
            result = store.resume_creation()
        self.assertEqual(result, SCHEMA_OID)
        settle.assert_called_once_with(reservation, old_attempt)
        ddl.assert_called_once_with(connection, SCHEMA, 'controller')
        receipt.assert_called_once_with(
            connection, SCHEMA, SCHEMA_OID, 42, {'profile': 'receipt-fields'})
        self.assertIs(store._creation_reservation, reservation)
        self.assertIs(store._creation_attempt, next_attempt)
        self.assertIsNone(store._creation_receipt.get('stale'))

    def test_column_address_and_pg_depend_lookup_use_relation_subid(self):
        address = creation._column_address({'pg_class': 1259}, 16385, 7)
        self.assertEqual(address, {'classId': 1259, 'objectId': 16385, 'subId': 7})
        connection = Mock()
        connection.transaction.side_effect = lambda: nullcontext()
        dependency = (1259, 16385, 7, 1249, 23, 0, 'n')
        with patch.object(creation, '_all', return_value=[dependency]) as query:
            rows = creation._column_dependencies(connection, {'pg_class': 1259},
                                                 16385, 7)
        self.assertIn('objsubid=%s', query.call_args.args[1])
        self.assertEqual(query.call_args.args[2], (1259, 16385, 7))
        self.assertEqual(rows, [[1259, 16385, 7, 1249, 23, 0, 'n']])

    def test_constraint_definition_preserves_catalog_index_oid(self):
        definition = creation._constraint_definition(
            kind='f', conrelid=16385, confrelid=16386, conindid=16391,
            conkey=[1], confkey=[1], deferrable=False, deferred=False,
            validated=True, enforced=True, noinherit=False, period=False,
            update_action='a', delete_action='r', match_type='s',
            is_local=True, inh_count=0, definition_text='FOREIGN KEY (id) REFERENCES x(id)',
            dependencies=[])
        self.assertEqual(definition['conindid'], 16391)
        self.assertEqual(definition['confrelid'], 16386)
        self.assertEqual(definition['conkey'], [1])

    def test_pg18_not_null_rows_are_exact_fixed_columns_and_definitions(self):
        count = 0
        for relation, columns in creation._FIXED_NOT_NULL_COLUMNS.items():
            for attnum, column in enumerate(columns, 1):
                count += 1
                creation._validate_not_null_constraint(
                    relation_name=relation,
                    constraint_name=f'{relation}_{column}_not_null',
                    conrelid=16385, confrelid=0, conindid=0,
                    conkey=[attnum], confkey=None, deferrable=False,
                    deferred=False, validated=True, enforced=True,
                    noinherit=False, period=False, is_local=True, inh_count=0,
                    update_action=' ', delete_action=' ', match_type=' ',
                    definition_text=f'NOT NULL {column}')
        self.assertEqual(count, 18)
        for mutation in (
                {'constraint_name': 'row_tables_unrelated_not_null'},
                {'conkey': [2]}, {'confrelid': 42}, {'conindid': 42},
                {'deferrable': True}, {'validated': False},
                {'update_action': 'r'}, {'match_type': 's'},
                {'update_action': '\x00'}, {'delete_action': '\x00'},
                {'definition_text': 'NOT NULL other_column'}):
            values = {
                'relation_name': 'row_tables',
                'constraint_name': 'row_tables_table_token_not_null',
                'conrelid': 16385, 'confrelid': 0, 'conindid': 0,
                'conkey': [1], 'confkey': None, 'deferrable': False,
                'deferred': False, 'validated': True, 'enforced': True,
                'noinherit': False, 'period': False, 'is_local': True,
                'inh_count': 0, 'update_action': ' ',
                'delete_action': ' ', 'match_type': ' ',
                'definition_text': 'NOT NULL table_token'}
            values.update(mutation)
            with self.subTest(mutation=mutation), self.assertRaises(CatalogError):
                creation._validate_not_null_constraint(**values)

    def test_fk_trigger_set_requires_exact_function_event_and_endpoint_multiset(self):
        expected = creation._expected_fk_trigger_signatures(
            referencing_oid=16386, referenced_oid=16385,
            index_oid=16401, constraint_oid=16402)
        creation._validate_fk_trigger_set(
            expected, referencing_oid=16386, referenced_oid=16385,
            index_oid=16401, constraint_oid=16402)
        wrong_combinations = (
            [expected[0]] * 4,
            expected[:-1],
            expected[:-1] + [(expected[-1][0], expected[-1][1], 9,
                              expected[-1][3], expected[-1][4], expected[-1][5])],
            expected[:-1] + [(expected[-1][0], expected[-1][1], expected[-1][2],
                              99999, expected[-1][4], expected[-1][5])],
            expected[:-1] + [(expected[-1][0], expected[-1][1], expected[-1][2],
                              expected[-1][3], expected[-1][4], 99999)],
        )
        for observed in wrong_combinations:
            with self.subTest(observed=observed), self.assertRaisesRegex(
                    CatalogError, 'row-originals-creation-ri-trigger-mismatch'):
                creation._validate_fk_trigger_set(
                    observed, referencing_oid=16386, referenced_oid=16385,
                    index_oid=16401, constraint_oid=16402)

    def test_self_referencing_fk_set_uses_function_identity_for_each_endpoint(self):
        expected = creation._expected_fk_trigger_signatures(
            referencing_oid=16386, referenced_oid=16386,
            index_oid=16401, constraint_oid=16402)
        creation._validate_fk_trigger_set(
            expected, referencing_oid=16386, referenced_oid=16386,
            index_oid=16401, constraint_oid=16402)
        malformed = expected.copy()
        malformed[-1] = (malformed[-1][0], 'RI_FKey_check_upd', *malformed[-1][2:])
        with self.assertRaisesRegex(CatalogError,
                                   'row-originals-creation-ri-trigger-mismatch'):
            creation._validate_fk_trigger_set(
                malformed, referencing_oid=16386, referenced_oid=16386,
                index_oid=16401, constraint_oid=16402)

    def test_pg18_restrict_ri_trigger_uses_exact_function_event_and_empty_args(self):
        common = {
            'relation_is_referencing': True, 'relation_oid': 16386,
            'expected_relation_oid': 16386, 'parent_oid': 0, 'function_oid': 16410,
            'function_namespace': 11, 'pg_catalog_namespace': 11, 'enabled': 'O',
            'internal': True, 'trigger_relation': 16385,
            'expected_trigger_relation': 16385, 'trigger_index': 16401,
            'expected_index': 16401, 'trigger_constraint': 16402,
            'expected_constraint': 16402, 'deferrable': False,
            'deferred': False, 'argument_count': 0, 'arguments': b'',
            'attributes': [], 'comment': None}
        for function_name, trigger_type in (
                ('RI_FKey_check_ins', 5), ('RI_FKey_check_upd', 17)):
            creation._validate_ri_trigger(
                function_name=function_name, trigger_type=trigger_type, **common)
        for mutation in (
                {'argument_count': 6, 'arguments': b'\x00' * 6},
                {'trigger_type': 4}, {'function_name': 'RI_FKey_restrict_del'},
                {'function_namespace': 2200}, {'trigger_index': 0},
                {'enabled': 'D'}, {'internal': False}):
            values = dict(common, function_name='RI_FKey_check_ins', trigger_type=5)
            values.update(mutation)
            with self.subTest(mutation=mutation), self.assertRaises(CatalogError):
                creation._validate_ri_trigger(**values)
        referenced = dict(common, relation_is_referencing=False,
                          relation_oid=16385, expected_relation_oid=16385,
                          trigger_relation=16386, expected_trigger_relation=16386)
        for function_name, trigger_type in (
                ('RI_FKey_restrict_del', 9), ('RI_FKey_restrict_upd', 17)):
            creation._validate_ri_trigger(
                function_name=function_name, trigger_type=trigger_type, **referenced)

    def test_reservation_receipt_links_hash_exact_record_and_target(self):
        record = {
            'providerId': PROVIDER, 'installationId': 'installation-a',
            'creationRequestDigest': '1' * 64, 'creationApprovalDigest': '2' * 64,
        }
        record_bytes = creation.canonical_bytes(record)
        target = {'profile': 'custody/1', 'digest': 'a' * 64}
        fields = creation._reservation_receipt_fields(record_bytes, record, target)
        self.assertEqual(fields['reservationDigest'], hashlib.sha256(record_bytes).hexdigest())
        self.assertEqual(fields['targetCustodyDigest'],
                         hashlib.sha256(creation.canonical_bytes(target)).hexdigest())
        self.assertEqual(fields['creationRequestDigest'], '1' * 64)

    def test_fixed_receipt_round_trips_canonical_comment(self):
        receipt = _receipt(_objects())
        encoded = creation.encode_comment(receipt)
        self.assertEqual(creation.decode_comment(encoded), receipt)
        self.assertTrue(encoded.startswith(creation.COMMENT_PREFIX))

    def test_recovery_requires_original_owner_and_exact_comment_identity(self):
        receipt = _receipt(_objects())
        expected = {key: receipt[key] for key in (
            'profile', 'providerId', 'installationId', 'storeProfile', 'storeId',
            'reservationDigest', 'creationRequestDigest', 'creationApprovalDigest',
            'targetCustodyDigest', 'state')}
        owner_oid = 42
        connection = Mock()
        connection.transaction.side_effect = lambda: nullcontext()
        with (patch.object(creation, '_one', side_effect=[
                (SCHEMA_OID, owner_oid), (creation.encode_comment(receipt),)]) as query,
              patch.object(creation, 'verify_creation_receipt', return_value=receipt) as verify):
            recovered = creation.recover_creation_receipt(
                connection, SCHEMA, expected, owner_oid)
        self.assertEqual(recovered, receipt)
        self.assertEqual(query.call_count, 2)
        verify.assert_called_once_with(connection, SCHEMA, receipt, owner_oid)

        wrong = dict(expected, reservationDigest='f' * 64)
        with (patch.object(creation, '_one', side_effect=[
                (SCHEMA_OID, owner_oid), (creation.encode_comment(receipt),)]) as query,
              patch.object(creation, 'verify_creation_receipt') as verify,
              self.assertRaisesRegex(CatalogError,
                                     'row-originals-creation-receipt-mismatch')):
            creation.recover_creation_receipt(connection, SCHEMA, wrong, owner_oid)
        verify.assert_not_called()

    def test_absence_proof_requires_same_native_session_and_missing_namespace(self):
        identity = (
            'postgres', 42, '12345678901234567', 'maint', 'controller', 'controller',
            'pg_catalog', 'UTC', 'on', 'origin', 'off', 'read committed', 41, 42)
        expected = {
            'databaseName': identity[0], 'databaseOid': identity[1],
            'systemIdentifier': identity[2], 'sessionUser': identity[3],
            'currentUser': identity[4], 'roleSetting': identity[5],
            'searchPath': identity[6], 'timeZone': identity[7],
            'rowSecurity': identity[8], 'sessionReplicationRole': identity[9],
            'transactionReadOnly': identity[10], 'transactionIsolation': identity[11],
            'sessionUserOid': identity[12], 'currentUserOid': identity[13],
        }
        connection = Mock()
        connection.transaction.side_effect = lambda: nullcontext()
        with patch.object(creation, '_one', side_effect=[identity, None]) as query:
            proof = creation.observe_absent_creation_schema(
                connection, SCHEMA, expected, controller_oid=42)
        self.assertEqual(proof['schemaName'], SCHEMA)
        self.assertEqual(proof['database']['systemIdentifier'], identity[2])
        self.assertEqual(proof['state'], 'absent')
        self.assertEqual(query.call_count, 2)

        readonly_identity = identity[:10] + ('on',) + identity[11:]
        readonly_expected = dict(expected, transactionReadOnly='on')
        with patch.object(creation, '_one', side_effect=[readonly_identity, None]):
            readonly_proof = creation.observe_absent_creation_schema(
                connection, SCHEMA, readonly_expected, controller_oid=42, readonly=True)
        self.assertEqual(readonly_proof['state'], 'absent')
        self.assertEqual(readonly_proof['session']['roleSetting'], 'controller')
        with (patch.object(creation, '_one', return_value=readonly_identity),
              self.assertRaisesRegex(CatalogError,
                                     'row-originals-creation-absence-unverified')):
            creation.observe_absent_creation_schema(
                connection, SCHEMA, readonly_expected, controller_oid=42)

        wrong_identity = identity[:4] + ('other-controller',) + identity[5:]
        with (patch.object(creation, '_one', return_value=wrong_identity) as query,
              self.assertRaisesRegex(CatalogError,
                                     'row-originals-creation-absence-unverified')):
            creation.observe_absent_creation_schema(
                connection, SCHEMA, expected, controller_oid=42)
        query.assert_called_once()

        with patch.object(creation, '_one', side_effect=[identity, (SCHEMA_OID, 42)]):
            self.assertIsNone(creation.observe_absent_creation_schema(
                connection, SCHEMA, expected, controller_oid=42))

    def test_rejects_duplicate_keys_noncanonical_json_and_oversize_comment(self):
        for comment in (
                creation.COMMENT_PREFIX + '{"profile":"x","profile":"y"}',
                creation.COMMENT_PREFIX + '{ "not-canonical": true }',
                creation.COMMENT_PREFIX + (' ' * creation.MAX_RECEIPT_BYTES)):
            with self.subTest(comment=comment[:48]), self.assertRaises(CatalogError):
                creation.decode_comment(comment)

    def test_receipt_is_closed_and_provider_schema_identity_bound(self):
        original = _receipt(_objects())
        before = copy.deepcopy(original)
        self.assertEqual(creation.validate_receipt(original), before)
        self.assertEqual(original, before)
        for mutation in (
                lambda value: value.update({'extra': True}),
                lambda value: value.update({'storeId': '00000000-0000-4000-8000-000000000002'}),
                lambda value: value.update({'schemaOid': True}),
                lambda value: value['objects'][1].update({'unexpected': 1}),
        ):
            candidate = copy.deepcopy(original)
            mutation(candidate)
            with self.subTest(candidate=candidate), self.assertRaises(CatalogError):
                creation.validate_receipt(candidate)

    def test_object_graph_requires_exact_root_parent_kinds_and_sorted_addresses(self):
        original = _objects()
        self.assertEqual(len(creation.validate_objects(original, SCHEMA, SCHEMA_OID)), 11)
        column = next(item for item in original if item['kind'] == 'column')
        self.assertEqual((column['classId'], column['objectId'], column['subId']),
                         (1259, 16385, 1))
        wrong_column_class = copy.deepcopy(original)
        next(item for item in wrong_column_class if item['kind'] == 'column')['classId'] = 1249
        wrong_column_class.sort(
            key=lambda item: (item['classId'], item['objectId'], item['subId']))
        with self.assertRaises(CatalogError):
            creation.validate_objects(wrong_column_class, SCHEMA, SCHEMA_OID)
        mutations = []
        missing_parent = copy.deepcopy(original)
        missing_parent[1]['parent'] = _address(1259, 99999)
        mutations.append(missing_parent)
        wrong_parent = copy.deepcopy(original)
        wrong_parent[2]['parent'] = _address(2615, SCHEMA_OID)
        mutations.append(wrong_parent)
        unordered = copy.deepcopy(original)
        unordered[0], unordered[1] = unordered[1], unordered[0]
        mutations.append(unordered)
        duplicated = copy.deepcopy(original)
        duplicated.insert(1, copy.deepcopy(duplicated[0]))
        mutations.append(duplicated)
        for candidate in mutations:
            with self.subTest(candidate=candidate), self.assertRaises(CatalogError):
                creation.validate_objects(candidate, SCHEMA, SCHEMA_OID)

    def test_object_addresses_are_unique_and_graph_cannot_cycle_or_escape_schema(self):
        original = _objects()
        duplicate = copy.deepcopy(original)
        duplicate.insert(1, copy.deepcopy(duplicate[0]))
        duplicate.sort(key=lambda item: (item['classId'], item['objectId'], item['subId']))
        with self.assertRaises(CatalogError):
            creation.validate_objects(duplicate, SCHEMA, SCHEMA_OID)

        escaped = copy.deepcopy(original)
        escaped[0]['objectId'] += 1
        with self.assertRaises(CatalogError):
            creation.validate_objects(escaped, SCHEMA, SCHEMA_OID)

    def test_internal_native_objects_are_explicitly_typed_and_parent_bound(self):
        objects = _objects()
        schema_address = _address(2615, SCHEMA_OID)
        toast = _object(1259, 20001, 0, 'toast-table', 'pg_toast',
                        'pg_toast_16385', None, _address(1259, 16385))
        toast_index = _object(1259, 20002, 0, 'toast-index', 'pg_toast',
                              'pg_toast_16385_index', None, _address(1259, 20001))
        objects.extend((toast, toast_index))
        objects.sort(key=lambda item: (item['classId'], item['objectId'], item['subId']))
        self.assertEqual(len(creation.validate_objects(objects, SCHEMA, SCHEMA_OID)), 13)
        forged = copy.deepcopy(objects)
        forged[-1]['kind'] = 'unrelated-trigger'
        with self.assertRaises(CatalogError):
            creation.validate_objects(forged, SCHEMA, SCHEMA_OID)
        forged = copy.deepcopy(objects)
        toast_object = next(item for item in forged if item['kind'] == 'toast-table')
        toast_object['parent'] = schema_address
        with self.assertRaises(CatalogError):
            creation.validate_objects(forged, SCHEMA, SCHEMA_OID)
        forged = copy.deepcopy(_objects())
        forged[0]['qualifiedName']['schema'] = 'pg_toast'
        with self.assertRaises(CatalogError):
            creation.validate_objects(forged, SCHEMA, SCHEMA_OID)


if __name__ == '__main__':
    unittest.main()

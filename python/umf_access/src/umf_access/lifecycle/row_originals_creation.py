# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed native inventory and public creation receipt for the G04 store.

The receipt is deliberately only a catalog witness. Original custody remains
in the external supervisor/custodian registry and is required separately.
"""
from __future__ import annotations

import base64
import hashlib
from typing import Any

from .catalog import CatalogError, _all, _one
from .row_originals_receipt import (
    COMMENT_PREFIX as COMMENT_PREFIX,
    MAX_OBJECTS,
    MAX_RECEIPT_BYTES,
    RECEIPT_PROFILE,
    _FIXED_NOT_NULL_COLUMNS,
    _constraint_definition,
    _digest as _digest,
    _expected_fk_trigger_signatures as _expected_fk_trigger_signatures,
    _expected_ri_trigger as _expected_ri_trigger,
    _no_duplicates as _no_duplicates,
    _safe_int as _safe_int,
    _uuid as _uuid,
    _validate_fk_trigger_set,
    _validate_not_null_constraint,
    _validate_ri_trigger,
    canonical_bytes,
    decode_comment,
    encode_comment,
    validate_objects,
    validate_receipt,
)


def _fail(code: str = 'row-originals-creation-receipt-invalid') -> None:
    raise CatalogError(code)



def _native(value: Any) -> Any:
    if isinstance(value, bytes):
        return {'$bytesBase64Url': base64.urlsafe_b64encode(value).rstrip(b'=').decode('ascii')}
    if isinstance(value, tuple):
        return [_native(item) for item in value]
    if isinstance(value, list):
        return [_native(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _native(item) for key, item in value.items()}
    if value is None or type(value) in (str, int, bool):
        return value
    _fail('row-originals-creation-catalog-unsupported')


def _dependencies(connection: Any, class_id: int, object_id: int,
                  sub_id: int = 0) -> list[list[Any]]:
    rows = _all(connection, '''SELECT classid::pg_catalog.oid,objid::pg_catalog.oid,objsubid,
 refclassid::pg_catalog.oid,refobjid::pg_catalog.oid,refobjsubid,deptype
 FROM pg_catalog.pg_depend WHERE classid=%s AND objid=%s AND objsubid=%s
 ORDER BY classid,objid,objsubid,refclassid,refobjid,refobjsubid,deptype LIMIT 1025''',
                (class_id, object_id, sub_id))
    if len(rows) > MAX_OBJECTS:
        _fail('row-originals-creation-receipt-capacity')
    return [_native(row) for row in rows]


def _column_address(classes: dict[str, int], relation_oid: int,
                    attnum: int) -> dict[str, int]:
    """Use pg_class/relation OID plus pg_depend's column-number sub-ID."""
    return {'classId': classes['pg_class'], 'objectId': relation_oid, 'subId': attnum}


def _column_dependencies(connection: Any, classes: dict[str, int],
                         relation_oid: int, attnum: int) -> list[list[Any]]:
    address = _column_address(classes, relation_oid, attnum)
    return _dependencies(connection, address['classId'], address['objectId'],
                         address['subId'])


def _catalog_class_oids(connection: Any) -> dict[str, int]:
    rows = _all(connection, '''SELECT c.relname,c.oid::pg_catalog.oid
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='pg_catalog' AND c.relname=ANY(%s)''',
                (['pg_class', 'pg_namespace', 'pg_constraint', 'pg_type', 'pg_trigger'],))
    result = dict(rows)
    if set(result) != {'pg_class', 'pg_namespace', 'pg_constraint', 'pg_type', 'pg_trigger'}:
        _fail('row-originals-creation-catalog-unsupported')
    return result


def _add_object(output: list[dict[str, Any]], *, class_id: int, object_id: int,
                sub_id: int, kind: str, schema: str, name: str,
                member: str | None, parent: dict[str, int] | None,
                definition: Any) -> dict[str, int]:
    if len(output) >= MAX_OBJECTS:
        _fail('row-originals-creation-receipt-capacity')
    address = {'classId': int(class_id), 'objectId': int(object_id), 'subId': int(sub_id)}
    object_record = {
        **address, 'kind': kind,
        'qualifiedName': {'schema': schema, 'name': name, 'member': member},
        'definitionDigest': hashlib.sha256(canonical_bytes(_native(definition))).hexdigest(),
        'parent': parent,
    }
    output.append(object_record)
    return address


def observe_creation_objects(connection: Any, schema: str, schema_oid: int,
                             controller_oid: int) -> list[dict[str, Any]]:
    """Observe the exact fixed G04 store's created objects and native closure.

    This function refuses anything outside the three-table .1 constructor,
    including unmanaged triggers, parentless TOAST objects, and foreign RI
    triggers. Native acceptance still requires real PG18.6 execution.
    """
    if (type(schema) is not str or not schema.startswith('umf_originals_')
            or '\x00' in schema):
        _fail('row-originals-creation-catalog-unsupported')
    classes = _catalog_class_oids(connection)
    ns = _one(connection, '''SELECT n.oid::pg_catalog.oid,n.nspowner::pg_catalog.oid,
 pg_catalog.current_setting('server_version_num')::pg_catalog.int4
 FROM pg_catalog.pg_namespace n WHERE n.nspname=%s''', (schema,))
    if ns is None or ns[0] != schema_oid or ns[1] != controller_oid or ns[2] != 180006:
        _fail('row-originals-creation-catalog-mismatch')
    output: list[dict[str, Any]] = []
    schema_address = _add_object(
        output, class_id=classes['pg_namespace'], object_id=schema_oid, sub_id=0,
        kind='schema', schema=schema, name=schema, member=None, parent=None,
        definition={
            'owner': ns[1],
            'acl': _all(connection, '''SELECT acl.grantee::pg_catalog.oid,
 acl.grantor::pg_catalog.oid,acl.privilege_type,acl.is_grantable
 FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL pg_catalog.aclexplode(
 COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) acl WHERE n.oid=%s
 ORDER BY acl.grantee,acl.grantor,acl.privilege_type,acl.is_grantable''', (schema_oid,)),
            'dependencies': _dependencies(connection, classes['pg_namespace'], schema_oid),
        })

    relation_rows = _all(connection, '''SELECT c.oid::pg_catalog.oid,c.relname,n.nspname,
 c.relkind,c.relpersistence,c.relowner::pg_catalog.oid,c.relam::pg_catalog.oid,
 c.reltablespace::pg_catalog.oid,c.reloptions,c.relrowsecurity,c.relforcerowsecurity,
 c.relispartition,c.relhassubclass,c.relhasrules,c.relreplident,c.reltoastrelid::pg_catalog.oid,
 c.reltype::pg_catalog.oid,c.relacl,pg_catalog.obj_description(c.oid,'pg_class')
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=%s ORDER BY c.oid LIMIT 1025''', (schema,))
    if len(relation_rows) > MAX_OBJECTS:
        _fail('row-originals-creation-receipt-capacity')
    table_names = {'row_tables', 'archives', 'issued_instances'}
    # A schema containing an extra view, sequence, materialized view, or
    # unowned index is not the fixed constructor, even if the three expected
    # heaps are also present.
    if any(row[3] not in ('r', 'i') for row in relation_rows):
        _fail('row-originals-creation-catalog-mismatch')
    base_rows = [row for row in relation_rows if row[3] == 'r']
    if {row[1] for row in base_rows} != table_names:
        _fail('row-originals-creation-catalog-mismatch')
    by_relation_oid: dict[int, dict[str, Any]] = {}
    expected_index_names = {
        'row_tables': {'row_tables_pkey', 'row_tables_business_table_oid_key'},
        'archives': {'archives_pkey', 'archives_values_relation_oid_key'},
        'issued_instances': {'issued_instances_pkey'},
    }
    indexes_by_table_name: dict[str, set[str]] = {name: set() for name in table_names}
    for row in base_rows:
        (oid, name, _ns, _kind, persistence, owner, access_method, tablespace,
         options, row_security, force_rls, partitioned, has_subclasses, has_rules,
         replica_identity, toast_oid, row_type_oid, _acl, comment) = row
        if (persistence != 'p' or owner != controller_oid or row_security or force_rls
                or partitioned or has_subclasses or has_rules or comment is not None):
            _fail('row-originals-creation-catalog-mismatch')
        acl = _all(connection, '''SELECT acl.grantee::pg_catalog.oid,
 acl.grantor::pg_catalog.oid,acl.privilege_type,acl.is_grantable
 FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(
 COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl WHERE c.oid=%s
 ORDER BY acl.grantee,acl.grantor,acl.privilege_type,acl.is_grantable''', (oid,))
        index_rows = _all(connection, '''SELECT i.indexrelid::pg_catalog.oid
 FROM pg_catalog.pg_index i WHERE i.indrelid=%s ORDER BY i.indexrelid LIMIT 1025''', (oid,))
        if len(index_rows) > MAX_OBJECTS:
            _fail('row-originals-creation-receipt-capacity')
        index_ids = [item[0] for item in index_rows]
        definition = {
            'relkind': 'r', 'persistence': persistence, 'owner': owner,
            'accessMethod': access_method, 'tablespace': tablespace,
            'options': options, 'rowSecurity': row_security,
            'forceRowSecurity': force_rls, 'partitioned': partitioned,
            'hasSubclasses': has_subclasses, 'hasRules': has_rules,
            'replicaIdentity': replica_identity, 'toastRelationOid': toast_oid,
            'rowTypeOid': row_type_oid, 'acl': acl,
            'indexes': index_ids,
            'dependencies': _dependencies(connection, classes['pg_class'], oid),
        }
        address = _add_object(output, class_id=classes['pg_class'], object_id=oid,
                              sub_id=0, kind='table', schema=schema, name=name,
                              member=None, parent=schema_address, definition=definition)
        by_relation_oid[oid] = {'row': row, 'address': address, 'indexes': index_ids}

    # Reject additional indexes not owned by one of the three fixed heaps.
    expected_index_ids = {index_oid for info in by_relation_oid.values()
                          for index_oid in info['indexes']}
    actual_index_ids = {row[0] for row in relation_rows if row[3] == 'i'}
    if actual_index_ids != expected_index_ids:
        _fail('row-originals-creation-catalog-mismatch')

    # Constraint records also define the exact expected internal FK-trigger set.
    constraints_by_oid: dict[int, dict[str, Any]] = {}
    fk_rows: list[tuple[Any, ...]] = []
    for relation_oid, info in by_relation_oid.items():
        relation_name = info['row'][1]
        rows = _all(connection, '''SELECT co.oid::pg_catalog.oid,co.conname,co.contype,
 co.conrelid::pg_catalog.oid,co.confrelid::pg_catalog.oid,co.conindid::pg_catalog.oid,
 co.conkey,co.confkey,co.condeferrable,co.condeferred,co.convalidated,co.conenforced,
 co.connoinherit,co.conperiod,co.confupdtype,co.confdeltype,co.confmatchtype,
 co.conislocal,co.coninhcount,pg_catalog.pg_get_constraintdef(co.oid,true),
 pg_catalog.obj_description(co.oid,'pg_constraint')
 FROM pg_catalog.pg_constraint co WHERE co.conrelid=%s ORDER BY co.oid LIMIT 1025''', (relation_oid,))
        if len(rows) > MAX_OBJECTS:
            _fail('row-originals-creation-receipt-capacity')
        for row in rows:
            (oid, name, kind, conrelid, confrelid, conindid, conkey, confkey,
             deferrable, deferred, validated, enforced, noinherit, period,
             update_action, delete_action, match_type, is_local, inh_count,
             definition_text, comment) = row
            if comment is not None or conrelid != relation_oid:
                _fail('row-originals-creation-catalog-mismatch')
            if kind == 'n':
                _validate_not_null_constraint(
                    relation_name=relation_name, constraint_name=name,
                    conrelid=conrelid, confrelid=confrelid, conindid=conindid,
                    conkey=conkey, confkey=confkey, deferrable=deferrable,
                    deferred=deferred, validated=validated, enforced=enforced,
                    noinherit=noinherit, period=period, is_local=is_local,
                    inh_count=inh_count, update_action=update_action,
                    delete_action=delete_action, match_type=match_type,
                    definition_text=definition_text)
                # These FK-only char fields are catalog NULs for a NOT NULL row.
                update_action = delete_action = match_type = None
            elif kind not in {'p', 'u', 'c', 'f'}:
                _fail('row-originals-creation-catalog-mismatch')
            if kind == 'f' and (update_action != 'r' or delete_action != 'r'
                                or match_type != 's' or deferrable or deferred
                                or not validated or not enforced or noinherit
                                or period or not is_local or inh_count != 0):
                _fail('row-originals-creation-catalog-mismatch')
            definition = _constraint_definition(
                kind=kind, conrelid=conrelid, confrelid=confrelid,
                conindid=conindid, conkey=conkey, confkey=confkey,
                deferrable=deferrable, deferred=deferred, validated=validated,
                enforced=enforced, noinherit=noinherit, period=period,
                update_action=update_action, delete_action=delete_action,
                match_type=match_type, is_local=is_local, inh_count=inh_count,
                definition_text=definition_text,
                dependencies=_dependencies(connection, classes['pg_constraint'], oid))
            address = _add_object(output, class_id=classes['pg_constraint'], object_id=oid,
                                  sub_id=0, kind='constraint', schema=schema,
                                  name=relation_name, member=name,
                                  parent=info['address'], definition=definition)
            constraints_by_oid[oid] = {'row': row, 'address': address}
            if kind == 'f':
                fk_rows.append(row)

    expected_constraint_names = {
        'row_tables': {
            'row_tables_pkey', 'row_tables_business_table_oid_key',
            'row_tables_installation_id_check', 'row_tables_issued_count_check',
            'row_tables_record_check', 'row_tables_record_digest_check',
            *(f'row_tables_{column}_not_null'
              for column in _FIXED_NOT_NULL_COLUMNS['row_tables']),
        },
        'archives': {
            'archives_pkey', 'archives_values_relation_oid_key',
            'archives_table_token_fkey', 'archives_state_check',
            'archives_row_count_check', 'archives_logical_bytes_check',
            'archives_record_check', 'archives_record_digest_check',
            *(f'archives_{column}_not_null'
              for column in _FIXED_NOT_NULL_COLUMNS['archives']),
        },
        'issued_instances': {
            'issued_instances_pkey', 'issued_instances_table_token_fkey',
            *(f'issued_instances_{column}_not_null'
              for column in _FIXED_NOT_NULL_COLUMNS['issued_instances']),
        },
    }
    if ({info['row'][1]: {entry['row'][1] for entry in constraints_by_oid.values()
                          if entry['row'][3] == oid}
         for oid, info in by_relation_oid.items()} != expected_constraint_names):
        _fail('row-originals-creation-catalog-mismatch')

    index_ids_by_rel: dict[int, list[int]] = {}
    for relation_oid in by_relation_oid:
        index_ids_by_rel[relation_oid] = []
        index_rows = _all(connection, '''SELECT i.indexrelid::pg_catalog.oid,
 ic.relname,ic.relnamespace::pg_catalog.oid,ic.relowner::pg_catalog.oid,
 ic.relpersistence,ic.reltablespace::pg_catalog.oid,ic.reloptions,ic.relacl,
 i.indnatts,i.indnkeyatts,i.indisunique,i.indisprimary,i.indisexclusion,
 i.indimmediate,i.indisvalid,i.indcheckxmin,i.indisready,i.indislive,
 i.indisreplident,i.indnullsnotdistinct,i.indkey::pg_catalog.int2[],
 i.indclass::pg_catalog.oid[],i.indcollation::pg_catalog.oid[],
 i.indoption::pg_catalog.int2[],pg_catalog.pg_get_expr(i.indexprs,i.indrelid),
 pg_catalog.pg_get_expr(i.indpred,i.indrelid),am.amname,
 pg_catalog.pg_get_indexdef(i.indexrelid),pg_catalog.obj_description(ic.oid,'pg_class')
 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
 JOIN pg_catalog.pg_am am ON am.oid=ic.relam WHERE i.indrelid=%s ORDER BY i.indexrelid LIMIT 1025''',
                           (relation_oid,))
        if len(index_rows) > MAX_OBJECTS:
            _fail('row-originals-creation-receipt-capacity')
        for row in index_rows:
            (oid, name, namespace_oid, owner, persistence, tablespace, options, _acl,
             natts, nkeyatts, unique, primary, exclusion, immediate, valid, checkxmin,
             ready, live, replica, nullsnotdistinct, indkey, indclass, indcollation,
             indoption, expressions, predicate, access_method, definition_text, comment) = row
            if (namespace_oid != _one(connection, 'SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=%s',
                                      (schema,))[0]
                    or owner != controller_oid or persistence != 'p' or comment is not None):
                _fail('row-originals-creation-catalog-mismatch')
            indexes_by_table_name[by_relation_oid[relation_oid]['row'][1]].add(name)
            acl = _all(connection, '''SELECT acl.grantee::pg_catalog.oid,
 acl.grantor::pg_catalog.oid,acl.privilege_type,acl.is_grantable
 FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(
 COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl WHERE c.oid=%s
 ORDER BY acl.grantee,acl.grantor,acl.privilege_type,acl.is_grantable''', (oid,))
            definition = {
                'owner': owner, 'persistence': persistence, 'tablespace': tablespace,
                'options': options, 'acl': acl, 'indnatts': natts,
                'indnkeyatts': nkeyatts, 'indisunique': unique, 'indisprimary': primary,
                'indisexclusion': exclusion, 'indimmediate': immediate,
                'indisvalid': valid, 'indcheckxmin': checkxmin, 'indisready': ready,
                'indislive': live, 'indisreplident': replica,
                'indnullsnotdistinct': nullsnotdistinct, 'indkey': indkey,
                'indclass': indclass, 'indcollation': indcollation,
                'indoption': indoption, 'expressions': expressions,
                'predicate': predicate, 'accessMethod': access_method,
                'definition': definition_text,
                'dependencies': _dependencies(connection, classes['pg_class'], oid),
            }
            _add_object(output, class_id=classes['pg_class'], object_id=oid, sub_id=0,
                        kind='index', schema=schema, name=name, member=None,
                        parent=by_relation_oid[relation_oid]['address'], definition=definition)
            index_ids_by_rel[relation_oid].append(oid)

    if indexes_by_table_name != expected_index_names:
        _fail('row-originals-creation-catalog-mismatch')

    # User columns and their auto-created composite row and array types.
    row_type_addresses: dict[int, dict[str, int]] = {}
    for relation_oid, info in by_relation_oid.items():
        name = info['row'][1]
        columns = _all(connection, '''SELECT a.attnum,a.attname,a.attisdropped,
 a.atttypid::pg_catalog.oid,a.atttypmod,a.attnotnull,a.attcollation::pg_catalog.oid,
 a.attidentity,a.attgenerated,a.attstorage,a.attcompression,a.attoptions,a.attacl,
 a.attinhcount,a.attislocal,a.attstattarget,
 pg_catalog.pg_get_expr(d.adbin,d.adrelid),pg_catalog.col_description(a.attrelid,a.attnum)
 FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d
 ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid=%s AND a.attnum>0 ORDER BY a.attnum LIMIT 1025''', (relation_oid,))
        if len(columns) > MAX_OBJECTS:
            _fail('row-originals-creation-receipt-capacity')
        for row in columns:
            (attnum, column, dropped, type_oid, typmod, notnull, collation,
             identity, generated, storage, compression, options, acl,
             inhcount, islocal, stattarget, default_expr, comment) = row
            if dropped or comment is not None:
                _fail('row-originals-creation-catalog-mismatch')
            address = _column_address(classes, relation_oid, attnum)
            definition = {
                'attnum': attnum, 'name': column, 'typeOid': type_oid,
                'typeMod': typmod, 'notNull': notnull, 'collationOid': collation,
                'identity': identity, 'generated': generated, 'storage': storage,
                'compression': compression, 'options': options, 'acl': acl,
                'inheritanceCount': inhcount, 'isLocal': islocal,
                'statisticsTarget': stattarget, 'default': default_expr,
                'dependencies': _column_dependencies(connection, classes,
                                                     relation_oid, attnum),
            }
            _add_object(output, class_id=address['classId'], object_id=address['objectId'],
                        sub_id=address['subId'], kind='column', schema=schema, name=name,
                        member=column, parent=info['address'], definition=definition)
        row_type_oid = info['row'][16]
        if row_type_oid:
            type_address = _add_type_object(
                connection, output, classes, row_type_oid, schema, name,
                'row-type', info['address'])
            row_type_addresses[row_type_oid] = type_address
            type_row = _one(connection, '''SELECT typarray::pg_catalog.oid
 FROM pg_catalog.pg_type WHERE oid=%s''', (row_type_oid,))
            if type_row is None:
                _fail('row-originals-creation-catalog-mismatch')
            array_oid = type_row[0]
            if array_oid:
                _add_type_object(connection, output, classes, array_oid, schema,
                                 '_' + name, 'array-type', type_address)

    # Exact PostgreSQL TOAST child closure; no schema-name prefix inference.
    toast_by_oid: dict[int, dict[str, Any]] = {}
    for relation_oid, info in by_relation_oid.items():
        toast_oid = info['row'][15]
        if toast_oid == 0:
            continue
        toast = _one(connection, '''SELECT c.oid::pg_catalog.oid,c.relname,n.nspname,
 c.relkind,c.relpersistence,c.relowner::pg_catalog.oid,c.relam::pg_catalog.oid,
 c.reltablespace::pg_catalog.oid,c.reloptions,c.relrowsecurity,c.relforcerowsecurity,
 c.relispartition,c.relhassubclass,c.relhasrules,c.relreplident,
 c.reltoastrelid::pg_catalog.oid,c.reltype::pg_catalog.oid,c.relacl,
 pg_catalog.obj_description(c.oid,'pg_class')
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE c.oid=%s''', (toast_oid,))
        if (toast is None or toast[2] != 'pg_toast' or toast[3] != 't'
                or toast[1] != 'pg_toast_' + str(relation_oid)
                or toast[4] != 'p' or toast[5] != controller_oid
                or toast[6] != _one(connection, "SELECT oid FROM pg_catalog.pg_am WHERE amname='heap'")[0]
                or toast[7] != 0 or toast[8] is not None or toast[9] or toast[10]
                or toast[11] or toast[12] or toast[13] or toast[14] != 'd'
                or toast[15] != 0 or toast[16] != 0 or toast[18] is not None):
            _fail('row-originals-creation-toast-mismatch')
        toast_acl = _all(connection, '''SELECT acl.grantee::pg_catalog.oid,
 acl.grantor::pg_catalog.oid,acl.privilege_type,acl.is_grantable
 FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(
 COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl WHERE c.oid=%s
 ORDER BY acl.grantee,acl.grantor,acl.privilege_type,acl.is_grantable''', (toast_oid,))
        toast_definition = {
            'relkind': toast[3], 'persistence': toast[4], 'owner': toast[5],
            'accessMethod': toast[6], 'tablespace': toast[7], 'options': toast[8],
            'rowSecurity': toast[9], 'forceRowSecurity': toast[10],
            'partitioned': toast[11], 'hasSubclasses': toast[12],
            'hasRules': toast[13], 'replicaIdentity': toast[14],
            'reltoastrelid': toast[15], 'reltype': toast[16], 'acl': toast_acl,
            'dependencies': _dependencies(connection, classes['pg_class'], toast_oid),
        }
        toast_address = _add_object(
            output, class_id=classes['pg_class'], object_id=toast_oid, sub_id=0,
            kind='toast-table', schema='pg_toast', name=toast[1], member=None,
            parent=info['address'], definition=toast_definition)
        toast_by_oid[toast_oid] = {'row': toast, 'address': toast_address}
        toast_columns = _all(connection, '''SELECT a.attnum,a.attname,a.attisdropped,
 a.atttypid::pg_catalog.oid,a.atttypmod,a.attnotnull,a.attcollation::pg_catalog.oid,
 a.attidentity,a.attgenerated,a.attstorage,a.attcompression,a.attoptions,a.attacl,
 a.attinhcount,a.attislocal,a.attstattarget,
 pg_catalog.pg_get_expr(d.adbin,d.adrelid),pg_catalog.col_description(a.attrelid,a.attnum)
 FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d
 ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid=%s AND a.attnum>0 ORDER BY a.attnum LIMIT 4''', (toast_oid,))
        if len(toast_columns) != 3:
            _fail('row-originals-creation-toast-mismatch')
        expected_toast_columns = (('chunk_id', 26), ('chunk_seq', 23), ('chunk_data', 17))
        for row, (expected_name, expected_type) in zip(toast_columns, expected_toast_columns,
                                                       strict=True):
            (attnum, column, dropped, type_oid, typmod, notnull, collation,
             identity, generated, storage, compression, options, acl, inhcount,
             islocal, stattarget, default_expr, comment) = row
            if (column != expected_name or dropped or type_oid != expected_type
                    or typmod != -1 or not notnull or collation != 0
                    or identity or generated or options is not None or acl is not None
                    or inhcount or not islocal or stattarget != -1
                    or default_expr is not None or comment is not None):
                _fail('row-originals-creation-toast-mismatch')
            address = _column_address(classes, toast_oid, attnum)
            definition = {'attnum': attnum, 'name': column, 'typeOid': type_oid,
                          'typeMod': typmod, 'notNull': notnull,
                          'collationOid': collation, 'identity': identity,
                          'generated': generated, 'storage': storage,
                          'compression': compression, 'options': options, 'acl': acl,
                          'inheritanceCount': inhcount, 'isLocal': islocal,
                          'statisticsTarget': stattarget, 'default': default_expr,
                          'dependencies': _column_dependencies(connection, classes,
                                                               toast_oid, attnum)}
            _add_object(output, class_id=address['classId'], object_id=address['objectId'],
                        sub_id=address['subId'], kind='column', schema='pg_toast',
                        name=toast[1], member=column, parent=toast_address,
                        definition=definition)
        toast_indexes = _all(connection, '''SELECT i.indexrelid::pg_catalog.oid,
 ic.relname,ic.relnamespace::pg_catalog.oid,ic.relowner::pg_catalog.oid,
 ic.relpersistence,ic.reltablespace::pg_catalog.oid,ic.reloptions,
 pg_catalog.pg_get_indexdef(i.indexrelid),i.indnatts,i.indnkeyatts,i.indisunique,
 i.indisprimary,i.indisexclusion,i.indimmediate,i.indisvalid,i.indcheckxmin,
 i.indisready,i.indislive,i.indisreplident,i.indnullsnotdistinct,
 i.indkey::pg_catalog.int2[],i.indclass::pg_catalog.oid[],
 i.indcollation::pg_catalog.oid[],i.indoption::pg_catalog.int2[],
 pg_catalog.pg_get_expr(i.indexprs,i.indrelid),pg_catalog.pg_get_expr(i.indpred,i.indrelid),
 am.amname,pg_catalog.obj_description(ic.oid,'pg_class')
 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
 JOIN pg_catalog.pg_am am ON am.oid=ic.relam
 WHERE i.indrelid=%s ORDER BY i.indexrelid LIMIT 2''', (toast_oid,))
        if len(toast_indexes) != 1:
            _fail('row-originals-creation-toast-mismatch')
        index = toast_indexes[0]
        (index_oid, index_name, index_namespace, index_owner, index_persistence,
         index_tablespace, index_options, index_definition, natts, nkeyatts, unique,
         primary, exclusion, immediate, valid, checkxmin, ready, live, replica,
         nulls_not_distinct, indkey, indclass, indcollation, indoption, expressions,
         predicate, access_method, comment) = index
        toast_namespace_oid = _one(connection,
                                    "SELECT oid FROM pg_catalog.pg_namespace WHERE nspname='pg_toast'")[0]
        if (index_namespace != toast_namespace_oid or index_owner != controller_oid
                or index_persistence != 'p' or index_tablespace != 0
                or index_options is not None or not unique or primary or exclusion
                or not immediate or not valid or checkxmin or not ready or not live
                or replica or nulls_not_distinct or expressions is not None
                or predicate is not None or access_method != 'btree' or comment is not None):
            _fail('row-originals-creation-toast-mismatch')
        index_acl = _all(connection, '''SELECT acl.grantee::pg_catalog.oid,
 acl.grantor::pg_catalog.oid,acl.privilege_type,acl.is_grantable
 FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(
 COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl WHERE c.oid=%s
 ORDER BY acl.grantee,acl.grantor,acl.privilege_type,acl.is_grantable''', (index_oid,))
        _add_object(
            output, class_id=classes['pg_class'], object_id=index_oid, sub_id=0,
            kind='toast-index', schema='pg_toast', name=index_name, member=None,
            parent=toast_address,
            definition={'namespaceOid': index_namespace, 'owner': index_owner,
                        'persistence': index_persistence, 'tablespace': index_tablespace,
                        'options': index_options,
                        'definition': index_definition, 'indnatts': natts,
                        'indnkeyatts': nkeyatts, 'unique': unique, 'primary': primary,
                        'exclusion': exclusion, 'immediate': immediate,
                        'valid': valid, 'checkxmin': checkxmin, 'ready': ready,
                        'live': live, 'replicaIdentity': replica,
                        'nullsNotDistinct': nulls_not_distinct, 'indkey': indkey,
                        'indclass': indclass, 'indcollation': indcollation,
                        'indoption': indoption, 'expressions': expressions,
                        'predicate': predicate, 'accessMethod': access_method,
                        'acl': index_acl,
                        'dependencies': _dependencies(connection, classes['pg_class'],
                                                     index_oid)})

    # PostgreSQL creates exactly four internal RI triggers per declared FK.
    fk_trigger_addresses: list[dict[str, int]] = []
    for fk in fk_rows:
        constraint_oid, _constraint_name, _kind, relid, confrelid, conindid = fk[:6]
        observed_signatures: list[tuple[int, str, int, int, int, int]] = []
        triggers = _all(connection, '''SELECT t.oid::pg_catalog.oid,t.tgname,
 t.tgrelid::pg_catalog.oid,t.tgparentid::pg_catalog.oid,t.tgfoid::pg_catalog.oid,
 t.tgtype,t.tgenabled,t.tgisinternal,t.tgconstrrelid::pg_catalog.oid,
 t.tgconstrindid::pg_catalog.oid,t.tgconstraint::pg_catalog.oid,
 t.tgdeferrable,t.tginitdeferred,t.tgnargs,t.tgargs,t.tgattr::pg_catalog.int2[],
 pg_catalog.pg_get_triggerdef(t.oid,true),p.proname,p.pronamespace::pg_catalog.oid,
 pg_catalog.obj_description(t.oid,'pg_trigger')
 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
 WHERE t.tgconstraint=%s ORDER BY t.oid LIMIT 5''', (constraint_oid,))
        if len(triggers) != 4:
            _fail('row-originals-creation-ri-trigger-mismatch')
        for row in triggers:
            (oid, name, relation_oid, parent_oid, function_oid, tgtype, enabled,
             internal, trigger_relation, trigger_index, trigger_constraint,
             deferrable, deferred, nargs, args, attrs, definition_text,
             function_name, function_namespace, comment) = row
            if (not internal or parent_oid != 0 or enabled != 'O'
                    or relation_oid not in (relid, confrelid)):
                _fail('row-originals-creation-ri-trigger-mismatch')
            relation_is_referencing = function_name in {
                'RI_FKey_check_ins', 'RI_FKey_check_upd'}
            _validate_ri_trigger(
                relation_is_referencing=relation_is_referencing,
                relation_oid=relation_oid,
                expected_relation_oid=relid if relation_is_referencing else confrelid,
                parent_oid=parent_oid, function_oid=function_oid,
                function_name=function_name, function_namespace=function_namespace,
                pg_catalog_namespace=_one(
                    connection, "SELECT oid FROM pg_catalog.pg_namespace WHERE nspname='pg_catalog'")[0],
                trigger_type=tgtype, enabled=enabled, internal=internal,
                trigger_relation=trigger_relation,
                expected_trigger_relation=confrelid if relation_is_referencing else relid,
                trigger_index=trigger_index, expected_index=conindid,
                trigger_constraint=trigger_constraint,
                expected_constraint=constraint_oid, deferrable=deferrable,
                deferred=deferred, argument_count=nargs, arguments=args,
                attributes=attrs, comment=comment)
            observed_signatures.append((relation_oid, function_name, tgtype,
                                        trigger_relation, trigger_index,
                                        trigger_constraint))
            trig_definition = {
                'relationOid': relation_oid, 'parentTriggerOid': parent_oid,
                'functionOid': function_oid, 'functionName': function_name,
                'triggerType': tgtype, 'enabled': enabled, 'internal': internal,
                'constraintRelationOid': trigger_relation,
                'constraintIndexOid': trigger_index, 'constraintOid': trigger_constraint,
                'deferrable': deferrable, 'initiallyDeferred': deferred,
                'argumentCount': nargs, 'arguments': _native(args),
                'attributes': attrs, 'definition': definition_text,
                'dependencies': _dependencies(connection, classes['pg_trigger'], oid),
            }
            rel_info = by_relation_oid.get(relation_oid)
            if rel_info is None:
                _fail('row-originals-creation-ri-trigger-mismatch')
            constraint = constraints_by_oid[constraint_oid]
            trigger_address = _add_object(
                output, class_id=classes['pg_trigger'], object_id=oid, sub_id=0,
                kind='internal-ri-trigger', schema=schema,
                name=rel_info['row'][1], member=name,
                parent=constraint['address'], definition=trig_definition)
            fk_trigger_addresses.append(trigger_address)
        _validate_fk_trigger_set(
            observed_signatures, referencing_oid=relid, referenced_oid=confrelid,
            index_oid=conindid, constraint_oid=constraint_oid)

    # Reject any trigger not accounted for by the exact two fixed FKs.
    all_triggers = _all(connection, '''SELECT t.oid,t.tgname,t.tgconstraint,t.tgisinternal
 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=ANY(%s) ORDER BY t.oid LIMIT 1025''',
                        (list(by_relation_oid),))
    if len(all_triggers) > MAX_OBJECTS:
        _fail('row-originals-creation-receipt-capacity')
    expected_trigger_oids = {item['objectId'] for item in fk_trigger_addresses}
    if ({row[0] for row in all_triggers} != expected_trigger_oids
            or any(not row[3] or row[2] not in constraints_by_oid for row in all_triggers)):
        _fail('row-originals-creation-ri-trigger-mismatch')
    objects = sorted(output, key=lambda item: (
        item['classId'], item['objectId'], item['subId']))
    return validate_objects(objects, schema, schema_oid)


def _add_type_object(connection: Any, output: list[dict[str, Any]],
                     classes: dict[str, int], type_oid: int, schema: str,
                     name: str, kind: str, parent: dict[str, int]) -> dict[str, int]:
    row = _one(connection, '''SELECT t.oid::pg_catalog.oid,n.nspname,t.typname,
 t.typnamespace::pg_catalog.oid,t.typowner::pg_catalog.oid,t.typlen,t.typbyval,
 t.typtype,t.typcategory,t.typispreferred,t.typisdefined,t.typdelim,
 t.typrelid::pg_catalog.oid,t.typelem::pg_catalog.oid,t.typarray::pg_catalog.oid,
 t.typinput::pg_catalog.oid,t.typoutput::pg_catalog.oid,t.typreceive::pg_catalog.oid,
 t.typsend::pg_catalog.oid,t.typmodin::pg_catalog.oid,t.typmodout::pg_catalog.oid,
 t.typanalyze::pg_catalog.oid,t.typalign,t.typstorage,t.typnotnull,t.typbasetype::pg_catalog.oid,
 t.typtypmod,t.typndims,t.typcollation::pg_catalog.oid,t.typacl,
 pg_catalog.obj_description(t.oid,'pg_type')
 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
 WHERE t.oid=%s''', (type_oid,))
    if row is None or row[1] != schema or row[2] != name or row[30] is not None:
        _fail('row-originals-creation-catalog-mismatch')
    acl = _all(connection, '''SELECT acl.grantee::pg_catalog.oid,
 acl.grantor::pg_catalog.oid,acl.privilege_type,acl.is_grantable
 FROM pg_catalog.pg_type t CROSS JOIN LATERAL pg_catalog.aclexplode(
 COALESCE(t.typacl,pg_catalog.acldefault('T',t.typowner))) acl WHERE t.oid=%s
 ORDER BY acl.grantee,acl.grantor,acl.privilege_type,acl.is_grantable''', (type_oid,))
    definition = {
        'namespaceOid': row[3], 'owner': row[4], 'length': row[5], 'byValue': row[6],
        'typeKind': row[7], 'category': row[8], 'preferred': row[9],
        'defined': row[10], 'delimiter': row[11], 'relationOid': row[12],
        'elementOid': row[13], 'arrayOid': row[14], 'inputOid': row[15],
        'outputOid': row[16], 'receiveOid': row[17], 'sendOid': row[18],
        'typmodInOid': row[19], 'typmodOutOid': row[20], 'analyzeOid': row[21],
        'alignment': row[22], 'storage': row[23], 'notNull': row[24],
        'baseTypeOid': row[25], 'typeMod': row[26], 'dimensions': row[27],
        'collationOid': row[28], 'acl': acl,
        'dependencies': _dependencies(connection, classes['pg_type'], type_oid),
    }
    return _add_object(output, class_id=classes['pg_type'], object_id=type_oid,
                       sub_id=0, kind=kind, schema=schema, name=name,
                       member=None, parent=parent, definition=definition)


def observe_and_write_receipt(connection: Any, schema: str, schema_oid: int,
                              controller_oid: int, fields: dict[str, Any]) -> dict[str, Any]:
    """Build the public comment after DDL; caller still must externally confirm COMMIT."""
    objects = observe_creation_objects(connection, schema, schema_oid, controller_oid)
    receipt = validate_receipt({**fields, 'profile': RECEIPT_PROFILE,
                                'storeProfile': 'umf.native-row-originals-store/0.1',
                                'schemaOid': schema_oid, 'objects': objects,
                                'state': 'created'})
    comment = encode_comment(receipt)
    if len(comment.encode('utf-8')) > MAX_RECEIPT_BYTES:
        _fail('row-originals-creation-receipt-capacity')
    literal = "'" + comment.replace("'", "''") + "'"
    from .catalog import _execute, _q

    _execute(connection, 'COMMENT ON SCHEMA ' + _q(schema) + ' IS ' + literal)
    observed = _one(connection, '''SELECT pg_catalog.obj_description(n.oid,'pg_namespace')
 FROM pg_catalog.pg_namespace n WHERE n.oid=%s''', (schema_oid,))
    if observed != (comment,):
        _fail('row-originals-creation-receipt-unobserved')
    return receipt


def verify_creation_receipt(connection: Any, schema: str, expected: dict[str, Any],
                            controller_oid: int) -> dict[str, Any]:
    checked = validate_receipt(expected)
    observed_comment = _one(connection, '''SELECT pg_catalog.obj_description(n.oid,'pg_namespace')
 FROM pg_catalog.pg_namespace n WHERE n.oid=%s''', (checked['schemaOid'],))
    if observed_comment is None:
        _fail('row-originals-creation-receipt-unavailable')
    actual = decode_comment(observed_comment[0])
    if actual != checked or actual['state'] != 'created':
        _fail('row-originals-creation-receipt-mismatch')
    objects = observe_creation_objects(connection, schema, checked['schemaOid'], controller_oid)
    if objects != checked['objects']:
        _fail('row-originals-creation-inventory-mismatch')
    return actual


def recover_creation_receipt(connection: Any, schema: str,
                             expected_fields: dict[str, Any],
                             controller_oid: int) -> dict[str, Any]:
    """Read and fully re-observe a committed receipt without repeating DDL."""
    if (type(schema) is not str or type(expected_fields) is not dict
            or type(controller_oid) is not int or controller_oid <= 0):
        _fail('row-originals-creation-receipt-unavailable')
    with connection.transaction():
        namespace = _one(connection, '''SELECT n.oid,n.nspowner
 FROM pg_catalog.pg_namespace n WHERE n.nspname=%s''', (schema,))
        if namespace is None or namespace[1] != controller_oid:
            _fail('row-originals-creation-receipt-unavailable')
        observed = _one(connection, '''SELECT pg_catalog.obj_description(n.oid,'pg_namespace')
 FROM pg_catalog.pg_namespace n WHERE n.oid=%s''', (namespace[0],))
        if observed is None or type(observed[0]) is not str:
            _fail('row-originals-creation-receipt-unavailable')
        receipt = decode_comment(observed[0])
        if (receipt['schemaOid'] != namespace[0]
                or any(receipt.get(key) != value for key, value in expected_fields.items())):
            _fail('row-originals-creation-receipt-mismatch')
        return verify_creation_receipt(connection, schema, receipt, controller_oid)


def observe_absent_creation_schema(connection: Any, schema: str,
                                   expected_native: dict[str, Any],
                                   controller_oid: int, *,
                                   readonly: bool = False) -> dict[str, Any] | None:
    """Prove absence on the original controller session without changing mode."""
    if (type(schema) is not str or type(expected_native) is not dict
            or type(controller_oid) is not int or controller_oid <= 0):
        _fail('row-originals-creation-absence-unverified')
    with connection.transaction():
        row = _one(connection, '''SELECT pg_catalog.current_database(),d.oid,
 pg_catalog.pg_control_system().system_identifier::pg_catalog.text,
 session_user,current_user,pg_catalog.current_setting('role'),
 pg_catalog.current_setting('search_path'),pg_catalog.current_setting('TimeZone'),
 pg_catalog.current_setting('row_security'),
 pg_catalog.current_setting('session_replication_role'),
 pg_catalog.current_setting('transaction_read_only'),
 pg_catalog.current_setting('transaction_isolation'),
 (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname=session_user),
 (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname=current_user)
 FROM pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database()''')
        if row is None:
            _fail('row-originals-creation-absence-unverified')
        actual = {
            'databaseName': row[0], 'databaseOid': row[1], 'systemIdentifier': row[2],
            'sessionUser': row[3], 'currentUser': row[4], 'roleSetting': row[5],
            'searchPath': row[6], 'timeZone': row[7], 'rowSecurity': row[8],
            'sessionReplicationRole': row[9], 'transactionReadOnly': row[10],
            'transactionIsolation': row[11], 'sessionUserOid': row[12],
            'currentUserOid': row[13],
        }
        if (any(expected_native.get(key) != value for key, value in actual.items())
                or actual['currentUserOid'] != controller_oid
                or actual['transactionReadOnly'] != ('on' if readonly else 'off')
                or actual['transactionIsolation'] != 'read committed'):
            _fail('row-originals-creation-absence-unverified')
        namespace = _one(connection, '''SELECT n.oid,n.nspowner
 FROM pg_catalog.pg_namespace n WHERE n.nspname=%s''', (schema,))
        if namespace is not None:
            return None
    return {
        'profile': 'umf.original-store-absence-proof/0.1',
        'database': {'name': actual['databaseName'], 'oid': actual['databaseOid'],
                     'systemIdentifier': actual['systemIdentifier']},
        'session': {'sessionUser': actual['sessionUser'],
                    'sessionUserOid': actual['sessionUserOid'],
                    'controller': actual['currentUser'],
                    'controllerOid': actual['currentUserOid'],
                    'roleSetting': actual['roleSetting']},
        'schemaName': schema, 'state': 'absent',
    }

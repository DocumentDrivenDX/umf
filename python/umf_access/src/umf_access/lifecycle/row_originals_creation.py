# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed native inventory and public creation receipt for the G04 store.

The receipt is deliberately only a catalog witness. Original custody remains
in the external supervisor/custodian registry and is required separately.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
from typing import Any

from .catalog import CatalogError, _all, _one

RECEIPT_PROFILE = 'umf.originals-creation-receipt/0.1'
COMMENT_PREFIX = RECEIPT_PROFILE + ':'
MAX_RECEIPT_BYTES = 1_048_576
MAX_OBJECTS = 1024
_HEX = re.compile(r'^[a-f0-9]{64}$')
_KINDS = {
    'schema', 'table', 'column', 'constraint', 'index', 'row-type', 'array-type',
    'toast-table', 'toast-index', 'internal-ri-trigger',
}
_RECEIPT_KEYS = {
    'profile', 'providerId', 'installationId', 'storeProfile', 'storeId',
    'reservationDigest', 'creationRequestDigest', 'creationApprovalDigest',
    'targetCustodyDigest', 'schemaOid', 'objects', 'state',
}
_RESERVATION_PROFILE = 'umf.row-originals-store-reservation/0.1'
_RESERVATION_KEYS = {
    'profile', 'reservationId', 'providerId', 'installationId', 'targetCustody',
    'store', 'creationRequestDigest', 'creationApprovalDigest',
    'nativeAuthorityEvidenceDigest', 'configurationDigest', 'custodySequence',
}
_OBJECT_KEYS = {
    'classId', 'objectId', 'subId', 'kind', 'qualifiedName',
    'definitionDigest', 'parent',
}
_ADDRESS_KEYS = {'classId', 'objectId', 'subId'}
_KIND_CLASS = {
    'schema': 2615, 'table': 1259, 'column': 1259, 'constraint': 2606,
    'index': 1259, 'row-type': 1247, 'array-type': 1247,
    'toast-table': 1259, 'toast-index': 1259, 'internal-ri-trigger': 2620,
}
_FIXED_NOT_NULL_COLUMNS = {
    'row_tables': ('table_token', 'installation_id', 'business_table_oid',
                   'business_schema_oid', 'table_binding', 'issued_count',
                   'record', 'record_digest'),
    'archives': ('archive_id', 'table_token', 'state', 'values_relation_oid',
                 'row_count', 'logical_bytes', 'record', 'record_digest'),
    'issued_instances': ('table_token', 'instance_id'),
}


def _fail(code: str = 'row-originals-creation-receipt-invalid') -> None:
    raise CatalogError(code)


def _safe_int(value: Any, low: int, high: int) -> int:
    if type(value) is not int or not low <= value <= high:
        _fail()
    return value


def _uuid(value: Any) -> str:
    if type(value) is not str or len(value) != 36 or value.lower() != value:
        _fail()
    import uuid

    try:
        if str(uuid.UUID(value)) != value:
            _fail()
    except (ValueError, AttributeError):
        _fail()
    return value


def _digest(value: Any) -> str:
    if type(value) is not str or _HEX.fullmatch(value) is None:
        _fail()
    return value


def canonical_bytes(value: Any) -> bytes:
    """Encode the closed JSON subset used by this receipt, with hard bounds."""
    stack: list[tuple[Any, int]] = [(value, 0)]
    nodes = 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > 100_000 or depth > 64:
            _fail('row-originals-creation-receipt-capacity')
        if item is None or type(item) is bool:
            continue
        if type(item) is int:
            if abs(item) > 9_007_199_254_740_991:
                _fail()
            continue
        if type(item) is str:
            try:
                item.encode('utf-8')
            except UnicodeEncodeError:
                _fail()
            if '\x00' in item:
                _fail()
            continue
        if type(item) is list:
            stack.extend((child, depth + 1) for child in item)
            continue
        if type(item) is dict:
            for key, child in item.items():
                if type(key) is not str or not key.isascii():
                    _fail()
                stack.append((key, depth + 1))
                stack.append((child, depth + 1))
            continue
        _fail()
    try:
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':'), allow_nan=False).encode('utf-8')
    except (TypeError, ValueError, UnicodeError, RecursionError):
        _fail()
    if len(encoded) > MAX_RECEIPT_BYTES:
        _fail('row-originals-creation-receipt-capacity')
    return encoded


def _constraint_definition(*, kind: str, conrelid: int, confrelid: int,
                           conindid: int, conkey: Any, confkey: Any,
                           deferrable: bool, deferred: bool, validated: bool,
                           enforced: bool, noinherit: bool, period: bool,
                           update_action: str, delete_action: str,
                           match_type: str, is_local: bool, inh_count: int,
                           definition_text: str,
                           dependencies: list[dict[str, Any]]) -> dict[str, Any]:
    """Retain every catalog field used to define a fixed-store constraint."""
    return {
        'contype': kind, 'conrelid': conrelid, 'confrelid': confrelid,
        'conindid': conindid, 'conkey': conkey, 'confkey': confkey,
        'condeferrable': deferrable, 'condeferred': deferred,
        'convalidated': validated, 'conenforced': enforced,
        'connoinherit': noinherit, 'conperiod': period,
        'confupdtype': update_action, 'confdeltype': delete_action,
        'confmatchtype': match_type, 'conislocal': is_local,
        'coninhcount': inh_count, 'definition': definition_text,
        'dependencies': dependencies,
    }


def _validate_not_null_constraint(*, relation_name: str, constraint_name: str,
                                  conrelid: int, confrelid: int, conindid: int,
                                  conkey: Any, confkey: Any, deferrable: bool,
                                  deferred: bool, validated: bool, enforced: bool,
                                  noinherit: bool, period: bool, is_local: bool,
                                  inh_count: int, update_action: str,
                                  delete_action: str, match_type: str,
                                  definition_text: str) -> None:
    """Admit only the PG18 NOT NULL rows emitted by the fixed table DDL."""
    columns = _FIXED_NOT_NULL_COLUMNS.get(relation_name)
    if columns is None:
        _fail('row-originals-creation-catalog-mismatch')
    expected = {f'{relation_name}_{column}_not_null': index
                for index, column in enumerate(columns, 1)}
    attnum = expected.get(constraint_name)
    column = columns[attnum - 1] if attnum is not None else None
    if (attnum is None or conrelid <= 0 or confrelid != 0 or conindid != 0
            or conkey != [attnum] or confkey is not None
            or deferrable or deferred or not validated or not enforced
            or noinherit or period or not is_local or inh_count != 0
            # StoreRelNotNull calls CreateConstraintEntry with spaces for the
            # FK-only catalog fields.  Keep this exact PG18 row shape closed.
            or update_action != ' ' or delete_action != ' '
            or match_type != ' '
            or definition_text != f'NOT NULL {column}'):
        _fail('row-originals-creation-catalog-mismatch')


def _expected_ri_trigger(relation_is_referencing: bool) -> dict[str, int]:
    """Return PG18's exact function/event pairs for fixed RESTRICT FKs."""
    if relation_is_referencing:
        return {'RI_FKey_check_ins': 5, 'RI_FKey_check_upd': 17}
    return {'RI_FKey_restrict_del': 9, 'RI_FKey_restrict_upd': 17}


def _expected_fk_trigger_signatures(*, referencing_oid: int,
                                    referenced_oid: int, index_oid: int,
                                    constraint_oid: int) -> list[tuple[int, str, int, int, int, int]]:
    """Return the complete fixed PG18 RI trigger multiset for one FK."""
    return [
        (referencing_oid, 'RI_FKey_check_ins', 5, referenced_oid,
         index_oid, constraint_oid),
        (referencing_oid, 'RI_FKey_check_upd', 17, referenced_oid,
         index_oid, constraint_oid),
        (referenced_oid, 'RI_FKey_restrict_del', 9, referencing_oid,
         index_oid, constraint_oid),
        (referenced_oid, 'RI_FKey_restrict_upd', 17, referencing_oid,
         index_oid, constraint_oid),
    ]


def _validate_fk_trigger_set(observed: list[tuple[int, str, int, int, int, int]],
                             *, referencing_oid: int, referenced_oid: int,
                             index_oid: int, constraint_oid: int) -> None:
    expected = _expected_fk_trigger_signatures(
        referencing_oid=referencing_oid, referenced_oid=referenced_oid,
        index_oid=index_oid, constraint_oid=constraint_oid)
    if sorted(observed) != sorted(expected):
        _fail('row-originals-creation-ri-trigger-mismatch')


def _validate_ri_trigger(*, relation_is_referencing: bool, relation_oid: int,
                         expected_relation_oid: int, parent_oid: int,
                         function_oid: int, function_name: str, function_namespace: int,
                         pg_catalog_namespace: int, trigger_type: int,
                         enabled: str, internal: bool, trigger_relation: int,
                         expected_trigger_relation: int, trigger_index: int,
                         expected_index: int, trigger_constraint: int,
                         expected_constraint: int, deferrable: bool, deferred: bool,
                         argument_count: int, arguments: Any, attributes: Any,
                         comment: str | None) -> None:
    expected_functions = _expected_ri_trigger(relation_is_referencing)
    if (relation_oid != expected_relation_oid or not internal or parent_oid != 0
            or enabled != 'O' or trigger_constraint != expected_constraint
            or trigger_relation != expected_trigger_relation
            or trigger_index != expected_index or function_namespace != pg_catalog_namespace
            or expected_functions.get(function_name) != trigger_type
            or type(function_oid) is not int or function_oid <= 0
            or deferrable or deferred or argument_count != 0
            or arguments != b'' or attributes != []
            or comment is not None):
        _fail('row-originals-creation-ri-trigger-mismatch')


def _reservation_receipt_fields(record_bytes: bytes, record: dict[str, Any],
                                target_reference: dict[str, Any]) -> dict[str, Any]:
    """Derive the public receipt links from the exact original reservation."""
    return {
        'providerId': record['providerId'],
        'installationId': record['installationId'],
        'storeId': record['providerId'],
        'reservationDigest': hashlib.sha256(record_bytes).hexdigest(),
        'creationRequestDigest': record['creationRequestDigest'],
        'creationApprovalDigest': record['creationApprovalDigest'],
        'targetCustodyDigest': hashlib.sha256(canonical_bytes(target_reference)).hexdigest(),
    }


def _address(value: Any) -> tuple[int, int, int]:
    if type(value) is not dict or set(value) != _ADDRESS_KEYS:
        _fail()
    return (_safe_int(value['classId'], 1, 2**32 - 1),
            _safe_int(value['objectId'], 1, 2**32 - 1),
            _safe_int(value['subId'], 0, 2**32 - 1))


def _name(value: Any, schema: str, kind: str) -> dict[str, Any]:
    if type(value) is not dict or set(value) != {'schema', 'name', 'member'}:
        _fail()
    actual_schema, name, member = value['schema'], value['name'], value['member']
    allowed_schema = {schema}
    if kind in {'toast-table', 'toast-index'} or (
            kind == 'column' and actual_schema == 'pg_toast'):
        allowed_schema.add('pg_toast')
    try:
        name_size = len(name.encode('utf-8')) if type(name) is str else MAX_RECEIPT_BYTES + 1
    except UnicodeEncodeError:
        _fail()
    if (type(actual_schema) is not str or actual_schema not in allowed_schema
            or type(name) is not str or not name
            or name_size > 63 or '\x00' in name):
        _fail()
    member_kinds = {'column', 'constraint', 'internal-ri-trigger'}
    if kind in member_kinds:
        try:
            member_size = len(member.encode('utf-8')) if type(member) is str else MAX_RECEIPT_BYTES + 1
        except UnicodeEncodeError:
            _fail()
        if (type(member) is not str or not member or member_size > 63 or '\x00' in member):
            _fail()
    elif member is not None:
        _fail()
    return value


def validate_objects(value: Any, schema: str, schema_oid: int) -> list[dict[str, Any]]:
    if (type(schema) is not str
            or re.fullmatch(r'umf_originals_[a-f0-9]{32}', schema) is None):
        _fail()
    if type(value) is not list or not 1 <= len(value) <= MAX_OBJECTS:
        _fail('row-originals-creation-receipt-capacity')
    _safe_int(schema_oid, 1, 2**32 - 1)
    checked: list[dict[str, Any]] = []
    by_address: dict[tuple[int, int, int], dict[str, Any]] = {}
    previous: tuple[int, int, int] | None = None
    for item in value:
        if type(item) is not dict or set(item) != _OBJECT_KEYS:
            _fail()
        address = _address({key: item[key] for key in _ADDRESS_KEYS})
        if previous is not None and address <= previous:
            _fail()
        previous = address
        kind = item['kind']
        if type(kind) is not str or kind not in _KINDS:
            _fail()
        if address[0] != _KIND_CLASS[kind]:
            _fail()
        _name(item['qualifiedName'], schema, kind)
        _digest(item['definitionDigest'])
        parent = item['parent']
        if parent is not None:
            parent = _address(parent)
        if kind == 'schema':
            if (address[1] != schema_oid or address[2] != 0 or parent is not None
                    or item['qualifiedName'] != {'schema': schema, 'name': schema,
                                                 'member': None}):
                _fail()
        elif parent is None:
            _fail()
        normalized = dict(item)
        by_address[address] = normalized
        checked.append(normalized)
    if sum(item['kind'] == 'schema' for item in checked) != 1:
        _fail()
    for item in checked:
        kind = item['kind']
        address = _address({key: item[key] for key in _ADDRESS_KEYS})
        parent = item['parent']
        if kind == 'schema':
            continue
        assert parent is not None
        parent_item = by_address.get(_address(parent))
        if parent_item is None:
            _fail()
        parent_kind = parent_item['kind']
        valid_parent = {
            'table': {'schema'}, 'index': {'table'}, 'column': {'table', 'toast-table'},
            'constraint': {'table'}, 'row-type': {'table'}, 'array-type': {'row-type'},
            'toast-table': {'table'}, 'toast-index': {'toast-table'},
            'internal-ri-trigger': {'constraint'},
        }
        if parent_kind not in valid_parent[kind]:
            _fail()
        if kind == 'toast-table' and item['qualifiedName']['schema'] != 'pg_toast':
            _fail()
        if kind == 'toast-index' and item['qualifiedName']['schema'] != 'pg_toast':
            _fail()
        parent_schema = parent_item['qualifiedName']['schema']
        child_schema = item['qualifiedName']['schema']
        if kind == 'toast-table':
            if parent_schema != schema or child_schema != 'pg_toast':
                _fail()
        elif child_schema != parent_schema:
            _fail()
        # Every edge must eventually terminate at the one root schema.
        seen = {address}
        cursor = parent_item
        while cursor['kind'] != 'schema':
            next_parent = cursor['parent']
            if next_parent is None:
                _fail()
            next_address = _address(next_parent)
            if next_address in seen:
                _fail()
            seen.add(next_address)
            cursor = by_address.get(next_address)
            if cursor is None:
                _fail()
    return checked


def validate_receipt(value: Any) -> dict[str, Any]:
    if type(value) is not dict or set(value) != _RECEIPT_KEYS:
        _fail()
    if value['profile'] != RECEIPT_PROFILE or value['state'] != 'created':
        _fail()
    provider = _uuid(value['providerId'])
    _uuid(value['storeId'])
    if value['storeId'] != provider:
        _fail()
    installation = value['installationId']
    try:
        installation_size = len(installation.encode('utf-8')) if type(installation) is str else MAX_RECEIPT_BYTES + 1
    except UnicodeEncodeError:
        _fail()
    if (type(installation) is not str or not installation or '\x00' in installation
            or installation_size > 256):
        _fail()
    if value['storeProfile'] != 'umf.native-row-originals-store/0.1':
        _fail()
    for key in ('reservationDigest', 'creationRequestDigest', 'creationApprovalDigest',
                'targetCustodyDigest'):
        _digest(value[key])
    schema_oid = _safe_int(value['schemaOid'], 1, 2**32 - 1)
    schema = 'umf_originals_' + provider.replace('-', '')
    checked = dict(value)
    checked['objects'] = validate_objects(value['objects'], schema, schema_oid)
    if len(canonical_bytes(checked)) > MAX_RECEIPT_BYTES:
        _fail('row-originals-creation-receipt-capacity')
    return checked


def encode_comment(receipt: Any) -> str:
    checked = validate_receipt(receipt)
    encoded = canonical_bytes(checked)
    return COMMENT_PREFIX + encoded.decode('utf-8')


def decode_comment(value: Any) -> dict[str, Any]:
    if type(value) is not str or not value.startswith(COMMENT_PREFIX):
        _fail()
    try:
        if len(value.encode('utf-8')) > MAX_RECEIPT_BYTES:
            _fail('row-originals-creation-receipt-capacity')
    except UnicodeEncodeError:
        _fail()
    payload = value[len(COMMENT_PREFIX):]
    try:
        parsed = json.loads(payload, object_pairs_hook=_no_duplicates)
    except (json.JSONDecodeError, UnicodeDecodeError, CatalogError, RecursionError):
        _fail()
    if canonical_bytes(parsed).decode('utf-8') != payload:
        _fail()
    return validate_receipt(parsed)


def _no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            _fail()
        result[key] = value
    return result


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


def reserve_originals_store_creation(supervisor: object, evidence: object,
                                     approval: object, custodian: object,
                                     target: object, store: dict[str, Any],
                                     connection: Any,
                                     *, creation_budget: object | None = None,
                                     ) -> tuple[object, dict[str, Any]]:
    """Resolve the exact supervisor-issued original reservation before DDL."""
    try:
        from .ingress_local_postgres import LocalPostgresSupervisor
    except ImportError:
        _fail('row-originals-creation-reservation-unavailable')
    if type(supervisor) is not LocalPostgresSupervisor:
        _fail('row-originals-creation-reservation-invalid')
    if type(store) is not dict:
        _fail('row-originals-creation-reservation-invalid')
    try:
        from .generation_ingress import TargetCustody
        from .ingress_custody import LocalTargetCustodian
    except ImportError:
        _fail('row-originals-creation-reservation-unavailable')
    if type(custodian) is not LocalTargetCustodian or type(target) is not TargetCustody:
        _fail('row-originals-creation-reservation-invalid')
    expected_store = {
        'profile': 'umf.native-row-originals-store/0.1',
        'storeId': store.get('storeId'),
        'schemaName': store.get('schemaName'),
    }
    if set(store) != {'profile', 'storeId', 'schemaName'} or store != expected_store:
        _fail('row-originals-creation-reservation-invalid')
    try:
        reservation = supervisor.reserve_originals_store_creation(
            evidence, approval, custodian=custodian, target=target, store=store,
            connection=connection, creation_budget=creation_budget)
        verified = supervisor._resolve_originals_store_creation_reservation(
            reservation, evidence=evidence, approval=approval,
            custodian=custodian, target=target, store=store,
            budget_reservation=reservation)
    except CatalogError:
        raise
    except Exception:  # noqa: BLE001 -- authority implementation details stay private
        _fail('row-originals-creation-reservation-invalid')
    if verified is not reservation:
        _fail('row-originals-creation-reservation-invalid')
    record_bytes = getattr(reservation, 'record_bytes', None)
    if type(record_bytes) is not bytes:
        _fail('row-originals-creation-reservation-invalid')
    try:
        record = json.loads(record_bytes, object_pairs_hook=_no_duplicates)
    except (json.JSONDecodeError, UnicodeDecodeError, CatalogError, RecursionError):
        _fail('row-originals-creation-reservation-invalid')
    if (canonical_bytes(record) != record_bytes or type(record) is not dict
            or set(record) != _RESERVATION_KEYS
            or record['profile'] != _RESERVATION_PROFILE):
        _fail('row-originals-creation-reservation-invalid')
    _uuid(record['reservationId'])
    provider_id = _uuid(record['providerId'])
    if record['providerId'] != store.get('storeId'):
        _fail('row-originals-creation-reservation-invalid')
    installation_id = record['installationId']
    try:
        installation_size = len(installation_id.encode('utf-8')) if type(installation_id) is str else MAX_RECEIPT_BYTES + 1
    except UnicodeEncodeError:
        _fail('row-originals-creation-reservation-invalid')
    if (type(installation_id) is not str or not installation_id or '\x00' in installation_id
            or installation_size > 256):
        _fail('row-originals-creation-reservation-invalid')
    if (provider_id != supervisor._provider_id
            or installation_id != supervisor._bound_installation_id):
        _fail('row-originals-creation-reservation-invalid')
    _digest(record['creationRequestDigest'])
    _digest(record['creationApprovalDigest'])
    _digest(record['nativeAuthorityEvidenceDigest'])
    _digest(record['configurationDigest'])
    _safe_int(record['custodySequence'], 1, 2**53 - 1)
    target_reference = custodian._public_reference(target)
    if record['targetCustody'] != target_reference:
        _fail('row-originals-creation-reservation-invalid')
    if record['store'] != store:
        _fail('row-originals-creation-reservation-invalid')
    try:
        if (approval.intent_digest != record['creationRequestDigest']
                or approval.approval_digest != record['creationApprovalDigest']):
            _fail('row-originals-creation-reservation-invalid')
    except AttributeError:
        _fail('row-originals-creation-reservation-invalid')
    receipt_fields = _reservation_receipt_fields(record_bytes, record, target_reference)
    return reservation, receipt_fields

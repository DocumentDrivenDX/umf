# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pure closed receipt representation for the native row-originals store."""
from __future__ import annotations

import json
import re
from typing import Any

from .catalog import CatalogError

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


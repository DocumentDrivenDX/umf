# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed PostgreSQL row-originals store and issued-instance guard.

This is a deliberately finite G04 provider.  It is not an archive API and does
not accept author SQL, caller-selected native types, or caller-created custody
objects.  The native supervisor/owner-approval adapter is loaded lazily so an
unintegrated adapter fails closed instead of falling back to structural trust.
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from typing import Any

from .catalog import CatalogError, _all, _execute, _one, _q

STORE_PROFILE = 'umf.native-row-originals-store/0.1'
IDENTITY_PROFILE = 'umf.native-row-identity/0.1'
ROW_RECORD_PROFILE = 'umf.native-row-identity/0.1'
ARCHIVE_RECORD_PROFILE = 'umf.native-row-originals/0.1'
AUTHORITY_PROFILE = 'umf.pg18.original-store-authority-evidence/0.1'
_RECOVERY_PROVIDER_SEAL = object()
_HEX = re.compile(r'^[a-f0-9]{64}$')
_MAX_RECORD_BYTES = 1_048_576
_MAX_TABLES = 4096
_MAX_ARCHIVES = 4096
_MAX_ISSUED = 1_000_000
_MAX_LOGICAL_BYTES = 1_073_741_824

_ROW_TABLE_DDL = '''CREATE TABLE {schema}."row_tables" (
 "table_token" pg_catalog.uuid PRIMARY KEY,
 "installation_id" pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK ("installation_id" <> ''),
 "business_table_oid" pg_catalog.oid NOT NULL UNIQUE,
 "business_schema_oid" pg_catalog.oid NOT NULL,
 "table_binding" pg_catalog.text COLLATE pg_catalog."C" NOT NULL,
 "issued_count" pg_catalog.int8 NOT NULL CHECK ("issued_count" BETWEEN 0 AND 1000000),
 "record" pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof("record") = 'object'),
 "record_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK ("record_digest" ~ '^[a-f0-9]{{64}}$')
) USING heap'''
_ARCHIVES_DDL = '''CREATE TABLE {schema}."archives" (
 "archive_id" pg_catalog.uuid PRIMARY KEY,
 "table_token" pg_catalog.uuid NOT NULL REFERENCES {schema}."row_tables"("table_token") ON UPDATE RESTRICT ON DELETE RESTRICT,
 "state" pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK ("state" IN ('capturing','complete')),
 "values_relation_oid" pg_catalog.oid NOT NULL UNIQUE,
 "row_count" pg_catalog.int8 NOT NULL CHECK ("row_count" BETWEEN 0 AND 1000000),
 "logical_bytes" pg_catalog.int8 NOT NULL CHECK ("logical_bytes" BETWEEN 0 AND 1073741824),
 "record" pg_catalog.jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof("record") = 'object'),
 "record_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL CHECK ("record_digest" ~ '^[a-f0-9]{{64}}$')
) USING heap'''
_ISSUED_DDL = '''CREATE TABLE {schema}."issued_instances" (
 "table_token" pg_catalog.uuid NOT NULL REFERENCES {schema}."row_tables"("table_token") ON UPDATE RESTRICT ON DELETE RESTRICT,
 "instance_id" pg_catalog.uuid NOT NULL,
 PRIMARY KEY ("table_token", "instance_id")
) USING heap'''

_ROW_RECORD_KEYS = {
    'profile', 'providerId', 'installationId', 'targetCustody', 'tableToken',
    'tableBinding', 'businessRelation', 'idColumn', 'revisionColumn',
    'uniqueConstraint', 'revisionConstraint', 'trigger', 'function',
    'creationReservationDigest', 'maxIssuedInstances',
}
_ARCHIVE_RECORD_KEYS = {
    'profile', 'providerId', 'installationId', 'targetCustody', 'archiveId',
    'tableToken', 'field', 'sourceDigest', 'targetDigest', 'planDigest',
    'approvalDigest', 'policy', 'sourceNativeDomain', 'valuesRelation',
    'creationReservationDigest', 'state', 'rowCount', 'logicalBytes',
}


def _fail(reason: str) -> None:
    raise CatalogError(reason)


def _exact_object(value: Any, keys: set[str], reason: str = 'row-originals-record-invalid') -> dict[str, Any]:
    if type(value) is not dict or set(value) != keys:
        _fail(reason)
    return value


def _uuid(value: Any) -> str:
    if type(value) is not str:
        _fail('row-originals-record-invalid')
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError):
        _fail('row-originals-record-invalid')
    if str(parsed) != value:
        _fail('row-originals-record-invalid')
    return value


def _digest(value: Any) -> str:
    if type(value) is not str or _HEX.fullmatch(value) is None:
        _fail('row-originals-record-invalid')
    return value


def _safe_int(value: Any, low: int, high: int) -> int:
    if type(value) is not int or not low <= value <= high:
        _fail('row-originals-record-invalid')
    return value


def _canonical_bytes(value: Any) -> bytes:
    # Bound depth/node count before JSON encoding; reject Python-only values,
    # non-finite floats, non-ASCII keys and non-UTF8 strings.
    stack: list[tuple[Any, int]] = [(value, 0)]
    nodes = 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > 100_000 or depth > 64:
            _fail('row-originals-record-capacity')
        if item is None or type(item) is bool:
            continue
        if type(item) is int:
            if abs(item) > 9_007_199_254_740_991:
                _fail('row-originals-record-invalid')
            continue
        if type(item) is float:
            _fail('row-originals-record-invalid')
        if type(item) is str:
            try:
                item.encode('utf-8')
            except UnicodeEncodeError:
                _fail('row-originals-record-invalid')
            if '\x00' in item:
                _fail('row-originals-record-invalid')
            continue
        if type(item) is list:
            stack.extend((child, depth + 1) for child in item)
            continue
        if type(item) is dict:
            for key, child in item.items():
                if type(key) is not str or not key.isascii():
                    _fail('row-originals-record-invalid')
                stack.append((key, depth + 1))
                stack.append((child, depth + 1))
            continue
        _fail('row-originals-record-invalid')
    try:
        result = json.dumps(value, ensure_ascii=False, sort_keys=True,
                            separators=(',', ':'), allow_nan=False).encode('utf-8')
    except (TypeError, ValueError, UnicodeError, RecursionError):
        _fail('row-originals-record-invalid')
    if len(result) > _MAX_RECORD_BYTES:
        _fail('row-originals-record-capacity')
    return result


def record_digest(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def originals_schema_name(provider_id: str) -> str:
    provider = _uuid(provider_id)
    return 'umf_originals_' + provider.replace('-', '')


def validate_row_table_record(value: Any) -> dict[str, Any]:
    record = _exact_object(value, _ROW_RECORD_KEYS)
    if record['profile'] != ROW_RECORD_PROFILE:
        _fail('row-originals-record-invalid')
    _uuid(record['providerId']); _uuid(record['tableToken'])
    if type(record['installationId']) is not str or not record['installationId']:
        _fail('row-originals-record-invalid')
    if (type(record['tableBinding']) is not str or not record['tableBinding']
            or '\x00' in record['tableBinding']):
        _fail('row-originals-record-invalid')
    relation = _exact_object(record['businessRelation'],
                             {'schemaOid', 'schemaName', 'tableOid', 'tableName'})
    _safe_int(relation['schemaOid'], 1, 2**32 - 1)
    _safe_int(relation['tableOid'], 1, 2**32 - 1)
    for key in ('schemaName', 'tableName'):
        if type(relation[key]) is not str or not relation[key] or '\x00' in relation[key]:
            _fail('row-originals-record-invalid')
    for key in ('idColumn', 'revisionColumn'):
        _native_column(record[key])
    for key in ('uniqueConstraint', 'revisionConstraint', 'trigger', 'function'):
        item = _exact_object(record[key], {'oid', 'name', 'definitionDigest'})
        _safe_int(item['oid'], 1, 2**32 - 1)
        if type(item['name']) is not str or not item['name'] or '\x00' in item['name']:
            _fail('row-originals-record-invalid')
        _digest(item['definitionDigest'])
    _digest(record['creationReservationDigest'])
    _safe_int(record['maxIssuedInstances'], 1, _MAX_ISSUED)
    if 'targetCustody' not in record or type(record['targetCustody']) is not dict:
        _fail('row-originals-record-invalid')
    _canonical_bytes(record)
    return record


def _native_column(value: Any) -> dict[str, Any]:
    item = _exact_object(value, {'attnum', 'name', 'typeOid', 'typeMod'})
    _safe_int(item['attnum'], 1, 32767)
    _safe_int(item['typeOid'], 1, 2**32 - 1)
    _safe_int(item['typeMod'], -1, 2**31 - 1)
    if type(item['name']) is not str or not item['name'] or '\x00' in item['name']:
        _fail('row-originals-record-invalid')
    return item


def validate_archive_record(value: Any) -> dict[str, Any]:
    record = _exact_object(value, _ARCHIVE_RECORD_KEYS)
    if record['profile'] != ARCHIVE_RECORD_PROFILE or record['state'] not in ('capturing', 'complete'):
        _fail('row-originals-record-invalid')
    for key in ('providerId', 'archiveId', 'tableToken'):
        _uuid(record[key])
    if type(record['installationId']) is not str or not record['installationId']:
        _fail('row-originals-record-invalid')
    for key in ('sourceDigest', 'targetDigest', 'planDigest', 'approvalDigest',
                'creationReservationDigest'):
        _digest(record[key])
    _safe_int(record['rowCount'], 0, _MAX_ISSUED)
    _safe_int(record['logicalBytes'], 0, _MAX_LOGICAL_BYTES)
    policy = _exact_object(record['policy'], {'id', 'revision'})
    field = _exact_object(record['field'], {'module', 'element'})
    for item in (*policy.values(), *field.values()):
        if type(item) is not str or not item or '\x00' in item:
            _fail('row-originals-record-invalid')
    domain = _exact_object(record['sourceNativeDomain'],
                           {'schema', 'name', 'typeOid', 'typeMod', 'collationOid'})
    for key in ('schema', 'name'):
        if type(domain[key]) is not str or not domain[key] or '\x00' in domain[key]:
            _fail('row-originals-record-invalid')
    _safe_int(domain['typeOid'], 1, 2**32 - 1)
    _safe_int(domain['typeMod'], -1, 2**31 - 1)
    _safe_int(domain['collationOid'], 0, 2**32 - 1)
    values = _exact_object(record['valuesRelation'], {'schema', 'name', 'oid'})
    for key in ('schema', 'name'):
        if type(values[key]) is not str or not values[key] or '\x00' in values[key]:
            _fail('row-originals-record-invalid')
    _safe_int(values['oid'], 1, 2**32 - 1)
    _canonical_bytes(record)
    return record


def _authority_context(supervisor: object, evidence: object, approval: object,
                       custodian: object, target: object, *,
                       budget_reservation: object | None = None) -> dict[str, Any]:
    """Resolve only the exact supervisor capability; missing G04 adapter refuses."""
    try:
        from .ingress_local_postgres import (
            LocalPostgresSupervisor,
            _VerifiedNativeStorePreparation,
        )
    except ImportError:
        _fail('row-originals-authority-unavailable')
    if (type(supervisor) is not LocalPostgresSupervisor
            or type(evidence) is not _VerifiedNativeStorePreparation
            or evidence.supervisor is not supervisor
            or evidence.custodian is not custodian
            or evidence.target_handle is not target):
        _fail('row-originals-authority-required')
    try:
        from .generation_ingress import TargetCustody
        from .ingress_custody import LocalTargetCustodian
        if type(custodian) is not LocalTargetCustodian or type(target) is not TargetCustody:
            _fail('row-originals-authority-required')
        verified_target = custodian._resolve_target_custody(target)
        target_reference = custodian._public_reference(target)
        if evidence.verified_target is not verified_target:
            _fail('row-originals-authority-invalid')
    except CatalogError:
        raise
    except Exception:  # noqa: BLE001 -- native custody failures are sanitized at this boundary
        _fail('row-originals-authority-invalid')
    try:
        verified = supervisor._resolve_original_store_preparation(
            evidence, approval, custodian=custodian, target=target,
            budget_reservation=budget_reservation)
    except TypeError:
        # An earlier adapter signature cannot silently authorize the G04 store.
        _fail('row-originals-authority-unavailable')
    except Exception:  # noqa: BLE001 -- resolver diagnostics never leave the trust boundary
        _fail('row-originals-authority-invalid')
    required_verified = {
        'profile', 'payload', 'store', 'verifiedTarget', 'approval', 'nativeObservation',
    }
    if (type(verified) is not dict or set(verified) != required_verified
            or verified.get('profile') != AUTHORITY_PROFILE):
        _fail('row-originals-authority-invalid')
    payload = verified.get('payload')
    payload_fields = {
        'profile', 'supervisorId', 'custodianId', 'providerId', 'installationId',
        'ownerAuthorityId', 'ownerPolicyRevision', 'registrationDigest',
        'targetCustodyDigest', 'authorityPreparationReceiptDigest', 'maintenance',
        'controller', 'businessOwner', 'requiredMemberships', 'requiredSettings',
        'nativeAuthorityObservationDigest',
    }
    if (type(payload) is not dict or set(payload) != payload_fields
            or payload.get('profile') != AUTHORITY_PROFILE
            or verified['verifiedTarget'] is not verified_target
            or verified['approval'] is not approval):
        _fail('row-originals-authority-invalid')
    if (payload['custodianId'] != custodian.custodian_id
            or payload['providerId'] != supervisor._provider_id
            or payload['installationId'] != supervisor._bound_installation_id
            or payload['targetCustodyDigest'] != _digest_json(target_reference)):
        _fail('row-originals-authority-invalid')
    from .owner_authority import _validate_native_store_intent
    try:
        _validate_native_store_intent(payload, supervisor._owner_authority.authority_id,
                                       supervisor._owner_authority.policy_revision)
    except Exception:  # noqa: BLE001 -- native observation text is not exposed
        _fail('row-originals-authority-invalid')
    observation = verified['nativeObservation']
    if (type(observation) is not dict
            or _digest_json(observation) != payload['nativeAuthorityObservationDigest']
            or observation.get('profile') != 'umf.pg18.native-session-authority-observation/0.1'
            or observation.get('registrationDigest') != payload['registrationDigest']
            or observation.get('targetCustodyDigest') != payload['targetCustodyDigest']):
        _fail('row-originals-authority-invalid')
    store = verified.get('store')
    expected_store = {
        'profile': STORE_PROFILE,
        'storeId': payload.get('providerId'),
        'schemaName': originals_schema_name(payload.get('providerId')),
    }
    if store != expected_store:
        _fail('row-originals-authority-invalid')
    return {**verified, 'targetCustody': target_reference}


def _digest_json(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _create_store_schema(connection: Any, schema: str, controller: str) -> int:
    existing = _one(connection,
                    'SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=%s', (schema,))
    if existing is not None:
        _fail('row-originals-store-conflict')
    _execute(connection, 'CREATE SCHEMA ' + _q(schema) + ' AUTHORIZATION ' + _q(controller))
    for ddl in (_ROW_TABLE_DDL, _ARCHIVES_DDL, _ISSUED_DDL):
        _execute(connection, ddl.format(schema=_q(schema)))
    row = _one(connection, 'SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=%s', (schema,))
    if row is None:
        _fail('row-originals-store-create-unobserved')
    return int(row[0])


def identity_function_sql(schema: str, function_name: str, *, token: str,
                          table_oid: int, table_schema: str, table_name: str,
                          id_column: str, revision_column: str) -> str:
    """Render the one fixed guard; all identifiers are validated then quoted."""
    token = _uuid(token)
    _safe_int(table_oid, 1, 2**32 - 1)
    for value in (schema, function_name, table_schema, table_name, id_column, revision_column):
        if type(value) is not str or not value or '\x00' in value:
            _fail('row-originals-record-invalid')
    qschema, qfunction = _q(schema), _q(function_name)
    qid, qrev = _q(id_column), _q(revision_column)
    literal_schema = "'" + table_schema.replace("'", "''") + "'"
    literal_table = "'" + table_name.replace("'", "''") + "'"
    literal_token = "'" + token + "'::pg_catalog.uuid"
    qualified_tables = qschema + '."row_tables"'
    qualified_ledger = qschema + '."issued_instances"'
    return f'''CREATE FUNCTION {qschema}.{qfunction}() RETURNS trigger
 LANGUAGE plpgsql VOLATILE CALLED ON NULL INPUT SECURITY DEFINER
 PARALLEL UNSAFE COST 100 SET search_path = pg_catalog AS $umf_identity$
DECLARE reservation_count pg_catalog.int8;
BEGIN
 IF TG_RELID <> {table_oid}::pg_catalog.oid OR TG_TABLE_SCHEMA <> {literal_schema}
    OR TG_TABLE_NAME <> {literal_table} THEN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'umf row identity target denied';
 END IF;
 IF TG_OP = 'INSERT' THEN
  UPDATE {qualified_tables} SET "issued_count" = "issued_count" OPERATOR(pg_catalog.+) 1
   WHERE "table_token" = {literal_token} AND "business_table_oid" = TG_RELID
     AND "issued_count" < ("record"->>'maxIssuedInstances')::pg_catalog.int8;
  GET DIAGNOSTICS reservation_count = ROW_COUNT;
  IF reservation_count <> 1 THEN
   RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'umf row identity capacity exhausted';
  END IF;
  NEW.{qid} := pg_catalog.gen_random_uuid();
  NEW.{qrev} := 1::pg_catalog.int8;
  INSERT INTO {qualified_ledger} ("table_token", "instance_id")
   VALUES ({literal_token}, NEW.{qid});
 ELSIF TG_OP = 'UPDATE' THEN
  IF NEW.{qid} IS DISTINCT FROM OLD.{qid} OR NEW.{qrev} IS DISTINCT FROM OLD.{qrev} THEN
   RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'umf row identity mutation denied';
  END IF;
  IF OLD.{qrev} = 9223372036854775807 THEN
   RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'umf row revision exhausted';
  END IF;
  NEW.{qid} := OLD.{qid};
  NEW.{qrev} := OLD.{qrev} OPERATOR(pg_catalog.+) 1::pg_catalog.int8;
 ELSE
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'umf row identity event denied';
 END IF;
 RETURN NEW;
END;
$umf_identity$'''


_HANDLE_SEAL = object()


class EnrolledTable:
    """Opaque provider handle for one object-bound enrolled table."""

    __slots__ = (
        '_id_column', '_issuer', '_max_issued_instances', '_relation_oid',
        '_revision_column', '_schema_name', '_table_name', '_table_token',
    )

    def __init__(self, seal: object, issuer: object, *, table_token: str,
                 relation_oid: int, schema_name: str, table_name: str,
                 id_column: str, revision_column: str, max_issued_instances: int):
        if seal is not _HANDLE_SEAL:
            raise TypeError('row table handles are provider-issued')
        self._issuer = issuer
        self._table_token = table_token
        self._relation_oid = relation_oid
        self._schema_name = schema_name
        self._table_name = table_name
        self._id_column = id_column
        self._revision_column = revision_column
        self._max_issued_instances = max_issued_instances

    def __setattr__(self, name: str, value: object) -> None:
        if hasattr(self, name):
            raise AttributeError('row table handles are immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('row table handles cannot be serialized')

    def __repr__(self) -> str:
        return '<EnrolledTable opaque>'


class OriginalArchive:
    """Opaque provider handle; original values and archive records stay private."""

    __slots__ = ('_archive_id', '_issuer', '_table_token')

    def __init__(self, seal: object, issuer: object, archive_id: str, table_token: str):
        if seal is not _HANDLE_SEAL:
            raise TypeError('archive handles are provider-issued')
        self._issuer = issuer
        self._archive_id = archive_id
        self._table_token = table_token

    def __setattr__(self, name: str, value: object) -> None:
        if hasattr(self, name):
            raise AttributeError('archive handles are immutable')
        object.__setattr__(self, name, value)

    def __reduce_ex__(self, _protocol: int):
        raise TypeError('archive handles cannot be serialized')

    def __repr__(self) -> str:
        return '<OriginalArchive opaque>'


class PgRowOriginalsStore:
    """Private same-database store for typed original values and row identity.

    All public methods require an active transaction and a freshly resolved
    supervisor-issued G04 store authority.  No purge method exists in .1.
    """

    __slots__ = (
        '_approval', '_archives', '_authority', '_connection', '_controller_oid',
        '_controller_role', '_creation_attempt', '_creation_capability',
        '_creation_receipt', '_creation_receipt_fields', '_creation_reservation',
        '_custodian', '_evidence', '_installation_id', '_issuer',
        '_provider_id', '_recovery_only', '_schema', '_schema_oid',
        '_supervisor', '_tables', '_target',
    )

    def __init__(self, connection: Any, *, supervisor: object, evidence: object,
                 approval: object, custodian: object, target: object,
                 provider_id: str, installation_id: str, controller_role: str,
                 controller_oid: int):
        self._authority = _authority_context(supervisor, evidence, approval, custodian, target)
        self._connection = connection
        self._supervisor = supervisor
        self._evidence = evidence
        self._approval = approval
        self._custodian = custodian
        self._target = target
        self._provider_id = _uuid(provider_id)
        self._installation_id = installation_id
        self._controller_role = controller_role
        self._controller_oid = _safe_int(controller_oid, 1, 2**32 - 1)
        self._schema = originals_schema_name(provider_id)
        self._schema_oid: int | None = None
        self._creation_reservation: object | None = None
        self._creation_attempt: object | None = None
        self._creation_receipt_fields: dict[str, Any] | None = None
        self._creation_receipt: dict[str, Any] | None = None
        self._creation_capability: object | None = None
        self._issuer = object()
        self._tables: dict[int, tuple[EnrolledTable, dict[str, Any]]] = {}
        self._archives: dict[int, tuple[OriginalArchive, dict[str, Any]]] = {}
        self._recovery_only = False
        payload = self._authority['payload']
        if (payload.get('providerId') != self._provider_id
                or payload.get('installationId') != installation_id
                or payload.get('controller', {}).get('name') != controller_role
                or payload.get('controller', {}).get('oid') != controller_oid):
            _fail('row-originals-authority-invalid')

    def _refresh_authority(self, *, budget: object | None = None) -> None:
        if self._recovery_only:
            if (self._creation_reservation is None
                    or self._creation_capability is None):
                _fail('row-originals-store-recovery-required')
            try:
                with self._supervisor._original_control_lease(operation_kind='store'):
                    self._authority = (
                        self._supervisor._resolve_recovered_original_store_current_authority(
                            self._creation_reservation, self._creation_capability,
                            self._connection))
            except CatalogError:
                raise
            except Exception:  # noqa: BLE001 -- fresh current authority is required
                _fail('row-originals-store-recovery-authority-invalid')
            payload = self._authority['payload']
            self._controller_role = payload['controller']['name']
            self._controller_oid = payload['controller']['oid']
            return
        self._authority = _authority_context(
            self._supervisor, self._evidence, self._approval, self._custodian,
            self._target, budget_reservation=budget)

    @classmethod
    def _from_recovery(cls, seal: object, *, supervisor: object,
                       connection: Any, provider_id: str, installation_id: str,
                       controller_role: str, custodian: object, target: object):
        """Construct the supervisor's restricted recovery-only provider."""
        if seal is not _RECOVERY_PROVIDER_SEAL:
            _fail('row-originals-store-recovery-invalid')
        instance = object.__new__(cls)
        instance._approval = None
        instance._archives = {}
        instance._authority = None
        instance._connection = connection
        instance._controller_oid = 0
        instance._controller_role = controller_role
        instance._creation_capability = None
        instance._creation_receipt = None
        instance._creation_attempt = None
        instance._creation_receipt_fields = None
        instance._creation_reservation = None
        instance._custodian = custodian
        instance._evidence = None
        instance._installation_id = installation_id
        instance._issuer = object()
        instance._provider_id = _uuid(provider_id)
        instance._schema = originals_schema_name(provider_id)
        instance._schema_oid = None
        instance._supervisor = supervisor
        instance._tables = {}
        instance._target = target
        instance._recovery_only = True
        return instance

    def _require_tx(self) -> None:
        # A transaction may be active before PostgreSQL assigns an XID (e.g.
        # during catalog-only preparation).  Asking for an assigned XID would
        # both reject that valid state and conflate transaction state with XID
        # allocation.
        if int(self._connection.info.transaction_status) != 2:
            _fail('row-originals-transaction-required')

    def create(self) -> int:
        if self._recovery_only:
            _fail('row-originals-store-recovery-only')
        self._require_tx()
        if self._schema_oid is not None or self._creation_reservation is not None:
            _fail('row-originals-store-already-created')
        from .row_originals_creation import (
            observe_and_write_receipt,
            reserve_originals_store_creation,
        )
        store = {'profile': STORE_PROFILE, 'storeId': self._provider_id,
                 'schemaName': self._schema}
        budget = self._supervisor._mint_original_store_creation_budget(
            evidence=self._evidence, approval=self._approval,
            custodian=self._custodian, target=self._target,
            connection=self._connection, store=store)
        self._supervisor._capture_original_store_timeout_lower_bounds(
            self._connection, budget)
        self._refresh_authority(budget=budget)
        self._verify_controller_session(budget=budget)
        reservation, receipt_fields = reserve_originals_store_creation(
            self._supervisor, self._evidence, self._approval, self._custodian,
            self._target, store, self._connection, creation_budget=budget)
        self._creation_reservation = reservation
        self._creation_receipt_fields = receipt_fields
        bounded = self._supervisor._budgeted_original_store_connection(reservation)
        try:
            self._creation_attempt = (
                self._supervisor.begin_originals_store_creation_attempt(reservation))
            self._schema_oid = _create_store_schema(
                bounded, self._schema, self._controller_role)
            bounded.execute('REVOKE ALL ON SCHEMA ' + _q(self._schema) + ' FROM PUBLIC')
            self._creation_receipt = observe_and_write_receipt(
                bounded, self._schema, self._schema_oid,
                self._controller_oid, receipt_fields)
            self._verify_store(connection=bounded)
            self._supervisor._require_original_store_budget(reservation)
            return self._schema_oid
        finally:
            bounded.restore_caller_timeouts()

    def resume_creation(self) -> int:
        """Resume the same pending creation only after its live abort witness settles."""
        if self._recovery_only:
            _fail('row-originals-store-recovery-only')
        self._require_tx()
        reservation = self._creation_reservation
        receipt_fields = self._creation_receipt_fields
        if (reservation is None or self._creation_attempt is None
                or receipt_fields is None
                or self._creation_capability is not None):
            _fail('row-originals-creation-resume-required')
        budget = reservation._budget
        self._supervisor._require_original_store_budget(reservation)
        self._refresh_authority(budget=budget)
        self._verify_controller_session(budget=budget)
        bounded = self._supervisor._budgeted_original_store_connection(
            reservation)
        try:
            try:
                from .ingress_local_postgres import LocalPostgresSupervisor
                if type(self._supervisor) is not LocalPostgresSupervisor:
                    _fail('row-originals-creation-resume-invalid')
                attempt = self._supervisor.resume_originals_store_creation_attempt(
                    reservation, self._creation_attempt)
            except CatalogError:
                raise
            except Exception:  # noqa: BLE001 -- retain the original authority fence
                _fail('row-originals-creation-resume-invalid')
            self._creation_attempt = attempt
            # A positive native aborted status proves the prior transaction's
            # partial catalogue/receipt values were rolled back. Discard only the
            # in-memory values produced by that transaction before fixed replay.
            self._schema_oid = None
            self._creation_receipt = None
            self._schema_oid = _create_store_schema(
                bounded, self._schema, self._controller_role)
            bounded.execute('REVOKE ALL ON SCHEMA ' + _q(self._schema) + ' FROM PUBLIC')
            from .row_originals_creation import observe_and_write_receipt
            self._creation_receipt = observe_and_write_receipt(
                bounded, self._schema, self._schema_oid,
                self._controller_oid, receipt_fields)
            self._verify_store(connection=bounded)
            self._supervisor._require_original_store_budget(reservation)
            return self._schema_oid
        finally:
            bounded.restore_caller_timeouts()

    def confirm_creation(self) -> object:
        """Confirm only the original reservation after its DDL transaction committed."""
        if self._recovery_only:
            _fail('row-originals-store-recovery-only')
        self._refresh_authority()
        if (self._creation_reservation is None or self._creation_receipt is None
                or int(self._connection.info.transaction_status) != 0):
            _fail('row-originals-creation-confirmation-required')
        try:
            from .ingress_local_postgres import LocalPostgresSupervisor
            if type(self._supervisor) is not LocalPostgresSupervisor:
                _fail('row-originals-creation-confirmation-invalid')
            capability = self._supervisor.confirm_originals_store_creation(
                self._creation_reservation, receipt=self._creation_receipt)
            resolved = self._supervisor._resolve_original_store_capability(
                capability, original_reservation=self._creation_reservation)
        except CatalogError:
            raise
        except Exception:  # noqa: BLE001 -- do not expose native confirmation details
            _fail('row-originals-creation-confirmation-invalid')
        if resolved is not capability:
            _fail('row-originals-creation-confirmation-invalid')
        self._creation_capability = capability
        return capability

    def recover_creation(self) -> int:
        """Reattach only a previously committed original store; never issue DDL."""
        if not self._recovery_only:
            self._refresh_authority()
        if self._creation_reservation is not None or self._creation_capability is not None:
            _fail('row-originals-store-recovery-already-attached')
        try:
            from .ingress_local_postgres import LocalPostgresSupervisor
            if type(self._supervisor) is not LocalPostgresSupervisor:
                _fail('row-originals-store-recovery-invalid')
            with self._supervisor._original_control_lease(operation_kind='store'):
                reservation, capability, receipt = (
                    self._supervisor.recover_originals_store_creation(
                        self._target, self._connection,
                        store={'profile': STORE_PROFILE, 'storeId': self._provider_id,
                               'schemaName': self._schema}))
                resolved = self._supervisor._resolve_original_store_capability(
                    capability, original_reservation=reservation)
                if self._recovery_only:
                    self._evidence = reservation._evidence
                    self._approval = reservation._approval
                    self._custodian = reservation._custodian
                    self._target = reservation._target
                    self._authority = (
                        self._supervisor._resolve_recovered_original_store_current_authority(
                            reservation, capability, self._connection))
                    self._controller_role = self._authority['payload']['controller']['name']
                    self._controller_oid = self._authority['payload']['controller']['oid']
        except CatalogError:
            raise
        except Exception:  # noqa: BLE001 -- keep recovery authority failures private
            _fail('row-originals-store-recovery-invalid')
        if resolved is not capability or type(receipt) is not dict:
            _fail('row-originals-store-recovery-invalid')
        self._creation_reservation = reservation
        self._creation_capability = capability
        self._creation_receipt = receipt
        self._schema_oid = receipt['schemaOid']
        return self._schema_oid

    def verify(self) -> None:
        self._refresh_authority()
        self._require_tx()
        self._verify_controller_session()
        self._require_creation_capability()
        self._verify_store()

    def _require_creation_capability(self) -> None:
        if self._creation_capability is None or self._creation_reservation is None:
            _fail('row-originals-creation-confirmation-required')
        try:
            resolved = self._supervisor._resolve_original_store_capability(
                self._creation_capability,
                original_reservation=self._creation_reservation)
        except Exception:  # noqa: BLE001 -- capability resolution is an authority boundary
            _fail('row-originals-creation-confirmation-invalid')
        if resolved is not self._creation_capability:
            _fail('row-originals-creation-confirmation-invalid')

    def _verify_controller_session(self, *, budget: object | None = None) -> None:
        observation = self._authority.get('nativeObservation')
        if type(observation) is not dict:
            _fail('row-originals-authority-invalid')
        query = '''SELECT current_user,
 (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user),session_user,
 pg_catalog.current_setting('role'),pg_catalog.current_setting('search_path'),
 pg_catalog.current_setting('TimeZone'),pg_catalog.current_setting('row_security'),
 pg_catalog.current_setting('session_replication_role'),
 pg_catalog.current_setting('server_encoding'),
 pg_catalog.current_setting('transaction_read_only'),
 pg_catalog.current_setting('transaction_isolation'),
 pg_catalog.current_setting('server_version_num')::pg_catalog.int4,
 (SELECT system_identifier::pg_catalog.text FROM pg_catalog.pg_control_system())'''
        if budget is None:
            actual = _one(self._connection, query)
        else:
            try:
                from .ingress_local_postgres import (
                    LocalPostgresError,
                    _execute_original_store_sql,
                )
                cursor = _execute_original_store_sql(
                    self._supervisor, budget, self._connection, query)
                self._supervisor._require_original_store_budget(budget)
                actual = cursor.fetchone()
                self._supervisor._require_original_store_budget(budget)
            except (CatalogError, LocalPostgresError):
                raise
            except Exception:  # noqa: BLE001 -- no blocking fallback for creation
                _fail('row-originals-controller-session-observation-unresolved')
        expected = self._authority['payload']
        controller = expected['controller']
        maintenance = expected['maintenance']
        settings = expected['requiredSettings']
        if (actual is None or actual[0] != controller['name'] or actual[1] != controller['oid']
                or actual[2] != maintenance['name'] or actual[3] != controller['name']
                or actual[4:11] != (settings['searchPath'], settings['timeZone'],
                                    settings['rowSecurity'], settings['sessionReplicationRole'],
                                    'UTF8', settings['transactionReadOnly'],
                                    settings['transactionIsolation'])
                or actual[11] != 180006
                or actual[12] != observation.get('database', {}).get('systemIdentifier')):
            _fail('row-originals-controller-session-required')

    def _verify_store(self, *, connection: Any | None = None) -> None:
        connection = self._connection if connection is None else connection
        if self._schema_oid is None:
            row = _one(connection,
                       'SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=%s',
                       (self._schema,))
            if row is None:
                _fail('row-originals-store-unavailable')
            self._schema_oid = int(row[0])
        schema = _one(connection, '''SELECT n.oid,n.nspowner,r.rolname,
 pg_catalog.obj_description(n.oid,'pg_namespace')
 FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles r ON r.oid=n.nspowner
 WHERE n.nspname=%s''', (self._schema,))
        if schema is None or schema[:3] != (
                self._schema_oid, self._controller_oid, self._controller_role):
            _fail('row-originals-store-catalog-mismatch')
        if self._creation_receipt is None:
            _fail('row-originals-creation-receipt-unavailable')
        from .row_originals_creation import verify_creation_receipt
        verify_creation_receipt(connection, self._schema,
                                self._creation_receipt, self._controller_oid)
        archive_rows = _all(connection, '''SELECT archive_id,table_token,state,
 values_relation_oid,row_count,logical_bytes,record,record_digest FROM '''
                            + _q(self._schema) + '."archives" ORDER BY archive_id')
        if len(archive_rows) > _MAX_ARCHIVES:
            _fail('row-originals-archive-capacity')
        values_records: list[dict[str, Any]] = []
        for archive_row in archive_rows:
            record = validate_archive_record(archive_row[6])
            native_archive_id, native_table_token = str(archive_row[0]), str(archive_row[1])
            if (record_digest(record) != archive_row[7]
                    or record['archiveId'] != native_archive_id
                    or record['tableToken'] != native_table_token
                    or record['providerId'] != self._provider_id
                    or record['installationId'] != self._installation_id
                    or record['state'] != archive_row[2]
                    or record['rowCount'] != archive_row[4]
                    or record['logicalBytes'] != archive_row[5]
                    or record['valuesRelation'].get('schema') != self._schema
                    or record['valuesRelation'].get('oid') != archive_row[3]
                    or record['valuesRelation'].get('name')
                       != 'values_' + native_archive_id.replace('-', '')):
                _fail('row-originals-archive-corrupt')
            values_records.append(record)
        relations = _all(connection, '''SELECT c.relname,c.relkind,c.relpersistence,
 c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relhassubclass,
 c.relhasrules
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=%s''', (self._schema,))
        expected = {'row_tables', 'archives', 'issued_instances',
                    'row_tables_pkey', 'row_tables_business_table_oid_key',
                    'archives_pkey', 'archives_values_relation_oid_key',
                    'issued_instances_pkey'}
        for record in values_records:
            name = record['valuesRelation']['name']
            expected.update((name, name + '_pkey'))
        actual_names = {row[0] for row in relations}
        if actual_names != expected:
            _fail('row-originals-store-catalog-mismatch')
        if any(row[1] not in ('r', 'i') or row[2] != 'p'
               or row[3] != self._controller_oid or row[4] or row[5] or row[6]
               or row[7] or row[8] for row in relations):
            _fail('row-originals-store-catalog-mismatch')
        expected_columns = {
            'row_tables': (('table_token', 2950), ('installation_id', 25),
                           ('business_table_oid', 26), ('business_schema_oid', 26),
                           ('table_binding', 25), ('issued_count', 20),
                           ('record', 3802), ('record_digest', 25)),
            'archives': (('archive_id', 2950), ('table_token', 2950), ('state', 25),
                         ('values_relation_oid', 26), ('row_count', 20),
                         ('logical_bytes', 20), ('record', 3802), ('record_digest', 25)),
            'issued_instances': (('table_token', 2950), ('instance_id', 2950)),
        }
        for table_name, columns in expected_columns.items():
            rows = _all(connection, '''SELECT a.attname,a.attnum,a.attisdropped,
 a.atttypid::pg_catalog.oid,a.atttypmod,a.attnotnull
 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=%s AND c.relname=%s AND a.attnum>0 ORDER BY a.attnum''',
                        (self._schema, table_name))
            if (len(rows) != len(columns) or any(
                    row != (name, index, False, type_oid, -1, True)
                    for index, ((name, type_oid), row) in enumerate(
                        zip(columns, rows, strict=True), 1))):
                _fail('row-originals-store-catalog-mismatch')
        for archive_row, record in zip(archive_rows, values_records, strict=True):
            values_relation = _one(connection, '''SELECT c.oid,c.relkind,c.relpersistence,
 c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relhassubclass,
 c.relhasrules FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=%s AND c.relname=%s''',
                                   (self._schema, record['valuesRelation']['name']))
            if (values_relation is None or values_relation[0] != archive_row[3]
                    or values_relation[1:3] != ('r', 'p')
                    or values_relation[3] != self._controller_oid
                    or values_relation[4:] != (False, False, False, False, False)):
                _fail('row-originals-archive-catalog-mismatch')
            columns = _all(connection, '''SELECT attname,attnum,attisdropped,
 atttypid::pg_catalog.oid,atttypmod,attnotnull FROM pg_catalog.pg_attribute
 WHERE attrelid=%s AND attnum>0 ORDER BY attnum''', (archive_row[3],))
            domain = record['sourceNativeDomain']
            expected_value_columns = (
                ('instance_id', 2950, -1, True),
                ('captured_revision', 20, -1, True),
                ('post_revision', 20, -1, archive_row[2] == 'complete'),
                ('old_value', domain['typeOid'], domain['typeMod'], False),
            )
            if len(columns) != len(expected_value_columns) or any(
                    item[:6] != (name, index, False, oid, typmod, not_null)
                    for index, ((name, oid, typmod, not_null), item) in enumerate(
                        zip(expected_value_columns, columns, strict=True), 1)):
                _fail('row-originals-archive-catalog-mismatch')
        self._verify_store_acl(tuple(
            record['valuesRelation']['name'] for record in values_records),
            connection=connection)

    def _verify_store_acl(self, values_names: tuple[str, ...] = (), *,
                          connection: Any | None = None) -> None:
        connection = self._connection if connection is None else connection
        # Default ACL NULL means only the owner controls the private relation;
        # explicit PUBLIC grants or extra grantees are rejected.
        grants = _all(connection, '''SELECT c.relname,acl.grantee,acl.grantor,
 acl.privilege_type,acl.is_grantable
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,
 pg_catalog.acldefault('r',c.relowner))) acl
 WHERE n.nspname=%s AND c.relkind='r'
 ORDER BY c.relname,acl.grantee,acl.privilege_type''',
                      (self._schema,))
        expected = set()
        for relation in ('row_tables', 'archives', 'issued_instances', *values_names):
            for privilege in ('INSERT', 'SELECT', 'UPDATE', 'DELETE', 'TRUNCATE',
                              'REFERENCES', 'TRIGGER', 'MAINTAIN'):
                # PG18's acldefault records ordinary owner privileges only;
                # implicit grant authority is not a stored grant option.
                expected.add((relation, self._controller_oid, self._controller_oid,
                              privilege, False))
        if set(grants) != expected:
            _fail('row-originals-store-acl-mismatch')
        schema_grants = _all(connection, '''SELECT acl.grantee,acl.grantor,
 acl.privilege_type,acl.is_grantable FROM pg_catalog.pg_namespace n
 CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,
 pg_catalog.acldefault('n',n.nspowner))) acl WHERE n.nspname=%s''', (self._schema,))
        if set(schema_grants) != {
                (self._controller_oid, self._controller_oid, 'CREATE', False),
                (self._controller_oid, self._controller_oid, 'USAGE', False)}:
            _fail('row-originals-store-acl-mismatch')

    def enroll_table(self, *, relation_schema: str, relation_name: str,
                     table_binding: str, installation_id: str,
                     max_issued_instances: int = _MAX_ISSUED) -> EnrolledTable:
        """Enroll existing rows, reserve every identity and install fixed guard."""
        self.verify()
        # Enrollment mutates the business relation and must be bound to the
        # exact source-derived plan/approval and external object inventory.
        # That supervisor capability is not part of the currently integrated
        # adapter, so do not treat caller-supplied relation names as authority.
        _fail('row-originals-table-enrollment-unavailable')

        # The implementation below is retained as the reviewed finite
        # construction recipe, but is unreachable until the host supplies the
        # typed per-table enrollment capability above.
        if installation_id != self._installation_id:
            _fail('row-originals-authority-invalid')
        _safe_int(max_issued_instances, 1, _MAX_ISSUED)
        for value in (relation_schema, relation_name, table_binding):
            if type(value) is not str or not value or '\x00' in value:
                _fail('row-originals-record-invalid')
        relation = _one(self._connection, '''SELECT c.oid,n.oid,c.relowner,c.relkind,
 c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,
 c.relhassubclass,c.relhasrules,EXISTS(SELECT FROM pg_catalog.pg_trigger t
 WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=%s AND c.relname=%s FOR UPDATE OF c''', (relation_schema, relation_name))
        owner = self._authority['payload']['businessOwner']
        if (relation is None or relation[2] != owner['oid']
                or relation[3:5] != ('r', 'p')
                or relation[5] is not True or relation[6] is not True):
            _fail('row-originals-business-table-unsupported')
        if relation[7] or relation[8] or relation[9] or relation[10]:
            _fail('row-originals-business-table-unsupported')
        if _one(self._connection, 'SELECT count(*) FROM ' + _q(self._schema)
                + '."row_tables"')[0] >= _MAX_TABLES:
            _fail('row-originals-table-capacity')
        if _one(self._connection, 'SELECT count(*) FROM ' + _q(self._schema) + '."archives"')[0] >= _MAX_ARCHIVES:
            _fail('row-originals-archive-capacity')
        table_token = str(uuid.uuid4())
        suffix = table_token.replace('-', '')
        id_name = '__umf_row_id_' + suffix
        rev_name = '__umf_row_rev_' + suffix
        unique_name = '__umf_row_key_' + suffix
        positive_name = '__umf_row_positive_' + suffix
        trigger_name = '__umf_row_guard_' + suffix
        function_name = 'identity_' + suffix
        collision = _one(self._connection, '''SELECT EXISTS(
 SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=%s AND attname=ANY(%s)
 AND attnum>0 AND NOT attisdropped)''',
                         (relation[0], [id_name, rev_name]))
        if collision is None or collision[0]:
            _fail('row-originals-business-name-conflict')
        _execute(self._connection, 'LOCK TABLE ' + _q(relation_schema) + '.'
                 + _q(relation_name) + ' IN ACCESS EXCLUSIVE MODE')
        _execute(self._connection, 'ALTER TABLE ' + _q(relation_schema) + '.' + _q(relation_name)
                 + ' ADD COLUMN ' + _q(id_name) + ' pg_catalog.uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(), '
                 + 'ADD COLUMN ' + _q(rev_name) + ' pg_catalog.int8 NOT NULL DEFAULT 1')
        _execute(self._connection, 'ALTER TABLE ' + _q(relation_schema) + '.' + _q(relation_name)
                 + ' ADD CONSTRAINT ' + _q(unique_name) + ' UNIQUE (' + _q(id_name) + '), '
                 + 'ADD CONSTRAINT ' + _q(positive_name) + ' CHECK (' + _q(rev_name) + ' > 0)')
        # Exact existing-row census runs as the trusted maintenance authority;
        # this provider never substitutes owner-visible RLS rows for full data.
        count = _one(self._connection, 'SELECT count(*) FROM ' + _q(relation_schema)
                     + '.' + _q(relation_name))
        if count is None or type(count[0]) is not int or count[0] > max_issued_instances:
            _fail('row-originals-issued-capacity')
        pending = self._reserve_and_install_identity(
            table_token, max_issued_instances, table_binding,
            int(relation[0]), int(relation[1]), relation_schema, relation_name,
            id_name, rev_name, unique_name, positive_name, trigger_name, function_name,
            count[0])
        handle = EnrolledTable(_HANDLE_SEAL, self._issuer, table_token=table_token,
                               relation_oid=int(relation[0]), schema_name=relation_schema,
                               table_name=relation_name, id_column=id_name,
                               revision_column=rev_name,
                               max_issued_instances=max_issued_instances)
        self._tables[id(handle)] = (handle, pending)
        return handle

    def _resolve_table(self, value: object) -> EnrolledTable:
        entry = self._tables.get(id(value))
        if (type(value) is not EnrolledTable or entry is None or entry[0] is not value
                or value._issuer is not self._issuer):
            _fail('row-originals-table-handle-required')
        return value

    def _resolve_archive(self, value: object) -> OriginalArchive:
        entry = self._archives.get(id(value))
        if (type(value) is not OriginalArchive or entry is None or entry[0] is not value
                or value._issuer is not self._issuer):
            _fail('row-originals-archive-handle-required')
        return value

    def _verify_enrolled_table(self, table: EnrolledTable) -> dict[str, Any]:
        """Reconcile immutable table record, native guard and monotonic ledger."""
        table = self._resolve_table(table)
        row = _one(self._connection, 'SELECT installation_id,business_table_oid,'
                   'business_schema_oid,table_binding,issued_count,record,record_digest '
                   'FROM ' + _q(self._schema)
                   + '."row_tables" WHERE table_token=%s FOR SHARE', (table._table_token,))
        if row is None:
            _fail('row-originals-table-unavailable')
        record = validate_row_table_record(row[5])
        if (record_digest(record) != row[6] or record['tableToken'] != table._table_token
                or record['providerId'] != self._provider_id
                or record['installationId'] != self._installation_id
                or record['businessRelation']['tableOid'] != row[1]
                or record['businessRelation']['schemaOid'] != row[2]
                or row[3] != record['tableBinding']
                or row[0] != self._installation_id or row[4] > record['maxIssuedInstances']
                or row[1] != table._relation_oid
                or record['businessRelation']['schemaName'] != table._schema_name
                or record['businessRelation']['tableName'] != table._table_name):
            _fail('row-originals-table-binding-mismatch')
        if (record['idColumn']['name'] != table._id_column
                or record['revisionColumn']['name'] != table._revision_column
                or record['maxIssuedInstances'] != table._max_issued_instances):
            _fail('row-originals-table-binding-mismatch')
        actual_columns = _all(self._connection, '''SELECT attnum,attname,atttypid::pg_catalog.oid,
 atttypmod FROM pg_catalog.pg_attribute WHERE attrelid=%s AND attname=ANY(%s)
 AND attnum>0 AND NOT attisdropped''',
                              (table._relation_oid, [table._id_column, table._revision_column]))
        column_map = {item[1]: item for item in actual_columns}
        if (len(actual_columns) != 2
                or tuple(column_map.get(table._id_column, ()))
                   != (record['idColumn']['attnum'], table._id_column,
                       record['idColumn']['typeOid'], record['idColumn']['typeMod'])
                or tuple(column_map.get(table._revision_column, ()))
                   != (record['revisionColumn']['attnum'], table._revision_column,
                       record['revisionColumn']['typeOid'], record['revisionColumn']['typeMod'])):
            _fail('row-originals-identity-column-mismatch')
        for key, kind in (('uniqueConstraint', 'u'), ('revisionConstraint', 'c')):
            constraint = record[key]
            actual = self._constraint_record(table._relation_oid, constraint['name'], kind)
            oid = _one(self._connection, 'SELECT oid FROM pg_catalog.pg_constraint '
                       'WHERE conrelid=%s AND conname=%s',
                       (table._relation_oid, constraint['name']))
            if (oid is None or oid[0] != constraint['oid'] or actual != constraint):
                _fail('row-originals-identity-constraint-mismatch')
        function = record['function']
        actual_function = _one(self._connection, '''SELECT p.oid,p.proowner,
 p.prosecdef,p.provolatile,p.proparallel,p.proconfig,pg_catalog.pg_get_functiondef(p.oid)
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname=%s AND p.proname=%s AND p.pronargs=0''',
                               (self._schema, function['name']))
        if (actual_function is None or actual_function[0] != function['oid']
                or actual_function[1] != self._controller_oid or not actual_function[2]
                or actual_function[3] != 'v' or actual_function[4] != 'u'
                or actual_function[5] != ['search_path=pg_catalog']
                or hashlib.sha256(actual_function[6].encode('utf-8')).hexdigest()
                   != function['definitionDigest']):
            _fail('row-originals-identity-guard-mismatch')
        trigger = record['trigger']
        actual_trigger = _one(self._connection, '''SELECT t.oid,t.tgfoid,t.tgenabled,
 pg_catalog.pg_get_triggerdef(t.oid,true) FROM pg_catalog.pg_trigger t
 WHERE t.tgrelid=%s AND t.tgname=%s AND NOT t.tgisinternal''',
                              (table._relation_oid, trigger['name']))
        if (actual_trigger is None or actual_trigger[0] != trigger['oid']
                or actual_trigger[1] != function['oid'] or actual_trigger[2] != 'A'
                or hashlib.sha256(actual_trigger[3].encode('utf-8')).hexdigest()
                   != trigger['definitionDigest']):
            _fail('row-originals-identity-guard-mismatch')
        ledger = _one(self._connection, 'SELECT count(*) FROM ' + _q(self._schema)
                      + '."issued_instances" WHERE table_token=%s', (table._table_token,))
        live = _one(self._connection, 'SELECT count(*) FROM ' + _q(table._schema_name)
                    + '.' + _q(table._table_name))
        missing = _one(self._connection, 'SELECT count(*) FROM ' + _q(table._schema_name)
                       + '.' + _q(table._table_name) + ' b WHERE NOT EXISTS (SELECT 1 FROM '
                       + _q(self._schema) + '."issued_instances" i WHERE i.table_token=%s '
                       'AND i.instance_id=b.' + _q(table._id_column) + ')',
                       (table._table_token,))
        if (ledger is None or live is None or missing != (0,)
                or ledger[0] != row[4] or ledger[0] > record['maxIssuedInstances']):
            _fail('row-originals-issued-ledger-mismatch')
        return record

    def _reserve_and_install_identity(
            self, table_token: str, max_issued_instances: int, table_binding: str,
            relation_oid: int, schema_oid: int, business_schema: str,
            business_table: str, id_name: str, rev_name: str, unique_name: str,
            positive_name: str, trigger_name: str, function_name: str,
            row_count: int) -> dict[str, Any]:
        """Install identity and ledger atomically; bind all native OIDs afterward."""
        self._refresh_authority()
        creation_digest = self._authority.get('creationReservationDigest')
        _digest(creation_digest)
        business = _q(business_schema) + '.' + _q(business_table)
        # No caller-chosen object names are ever used here; all names are the
        # token-derived fixed profile names checked above.
        # Build the one exact fixed guard and install it while ACCESS EXCLUSIVE
        # remains held. No DML can enter before ledger enrollment commits.
        self._connection.execute(identity_function_sql(
            self._schema, function_name, token=table_token, table_oid=relation_oid,
            table_schema=business_schema, table_name=business_table,
            id_column=id_name, revision_column=rev_name))
        self._connection.execute('REVOKE ALL ON FUNCTION ' + _q(self._schema) + '.'
                                 + _q(function_name) + '() FROM PUBLIC')
        self._connection.execute('CREATE TRIGGER ' + _q(trigger_name) + ' BEFORE INSERT OR UPDATE ON '
                                 + business + ' FOR EACH ROW EXECUTE FUNCTION '
                                 + _q(self._schema) + '.' + _q(function_name) + '()')
        self._connection.execute('ALTER TABLE ' + business + ' ENABLE ALWAYS TRIGGER '
                                 + _q(trigger_name))
        columns = _all(self._connection, '''SELECT attnum,attname,atttypid::pg_catalog.oid,atttypmod
 FROM pg_catalog.pg_attribute WHERE attrelid=%s AND attname=ANY(%s)
 AND attnum>0 AND NOT attisdropped''', (relation_oid, [id_name, rev_name]))
        if len(columns) != 2:
            _fail('row-originals-identity-column-unobserved')
        column_map = {row[1]: row for row in columns}
        id_att, rev_att = column_map.get(id_name), column_map.get(rev_name)
        if (id_att is None or rev_att is None or id_att[2] != 2950 or id_att[3] != -1
                or rev_att[2] != 20 or rev_att[3] != -1):
            _fail('row-originals-identity-column-mismatch')
        unique = self._constraint_record(relation_oid, unique_name, 'u')
        positive = self._constraint_record(relation_oid, positive_name, 'c')
        function = _one(self._connection, '''SELECT p.oid,p.proowner,pg_catalog.pg_get_functiondef(p.oid)
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname=%s AND p.proname=%s AND p.pronargs=0''',
                        (self._schema, function_name))
        trigger = _one(self._connection, '''SELECT t.oid,pg_catalog.pg_get_triggerdef(t.oid,true),
 t.tgenabled,t.tgfoid FROM pg_catalog.pg_trigger t
 WHERE t.tgrelid=%s AND t.tgname=%s AND NOT t.tgisinternal''',
                       (relation_oid, trigger_name))
        if (function is None or function[1] != self._controller_oid
                or trigger is None or trigger[2] != 'A' or trigger[3] != function[0]):
            _fail('row-originals-identity-guard-mismatch')
        record = {
            'profile': ROW_RECORD_PROFILE, 'providerId': self._provider_id,
            'installationId': self._installation_id,
            'targetCustody': self._authority['targetCustody'],
            'tableToken': table_token, 'tableBinding': table_binding,
            'businessRelation': {'schemaOid': schema_oid, 'schemaName': business_schema,
                                 'tableOid': relation_oid, 'tableName': business_table},
            'idColumn': {'attnum': id_att[0], 'name': id_name,
                         'typeOid': id_att[2], 'typeMod': id_att[3]},
            'revisionColumn': {'attnum': rev_att[0], 'name': rev_name,
                               'typeOid': rev_att[2], 'typeMod': rev_att[3]},
            'uniqueConstraint': unique, 'revisionConstraint': positive,
            'trigger': {'oid': trigger[0], 'name': trigger_name,
                        'definitionDigest': hashlib.sha256(trigger[1].encode('utf-8')).hexdigest()},
            'function': {'oid': function[0], 'name': function_name,
                         'definitionDigest': hashlib.sha256(function[2].encode('utf-8')).hexdigest()},
            'creationReservationDigest': creation_digest,
            'maxIssuedInstances': max_issued_instances,
        }
        validate_row_table_record(record)
        encoded = _canonical_bytes(record).decode('utf-8')
        self._connection.execute('INSERT INTO ' + _q(self._schema)
                                 + '."row_tables" ("table_token","installation_id",'
                                 '"business_table_oid","business_schema_oid","table_binding",'
                                 '"issued_count","record","record_digest") '
                                 'VALUES (%s,%s,%s,%s,%s,0,%s::pg_catalog.jsonb,%s)',
                                 (table_token, self._installation_id, relation_oid, schema_oid,
                                  table_binding, encoded, record_digest(record)))
        self._connection.execute('INSERT INTO ' + _q(self._schema)
                                 + '."issued_instances" ("table_token","instance_id") '
                                 'SELECT %s,' + _q(id_name) + ' FROM ' + business,
                                 (table_token,))
        ledger_count = _one(self._connection, 'SELECT count(*) FROM ' + _q(self._schema)
                            + '."issued_instances" WHERE "table_token"=%s', (table_token,))
        if ledger_count is None or ledger_count[0] != row_count:
            _fail('row-originals-ledger-enrollment-mismatch')
        self._connection.execute('UPDATE ' + _q(self._schema)
                                 + '."row_tables" SET "issued_count"=%s '
                                 'WHERE "table_token"=%s AND "issued_count"=0',
                                 (row_count, table_token))
        self._connection.execute('ALTER TABLE ' + business + ' ALTER COLUMN '
                                 + _q(id_name) + ' DROP DEFAULT, ALTER COLUMN '
                                 + _q(rev_name) + ' DROP DEFAULT')
        live_missing = _one(self._connection, 'SELECT count(*) FROM ' + business
                            + ' b WHERE NOT EXISTS (SELECT 1 FROM ' + _q(self._schema)
                            + '."issued_instances" i WHERE i."table_token"=%s '
                            'AND i."instance_id"=b.' + _q(id_name) + ')', (table_token,))
        if live_missing != (0,):
            _fail('row-originals-ledger-enrollment-mismatch')
        return record

    def _constraint_record(self, relation_oid: int, name: str,
                           kind: str) -> dict[str, Any]:
        row = _one(self._connection, '''SELECT oid,conname,contype,
 pg_catalog.pg_get_constraintdef(oid,true) FROM pg_catalog.pg_constraint
 WHERE conrelid=%s AND conname=%s''', (relation_oid, name))
        if row is None or row[2] != kind:
            _fail('row-originals-identity-constraint-mismatch')
        return {'oid': row[0], 'name': row[1],
                'definitionDigest': hashlib.sha256(row[3].encode('utf-8')).hexdigest()}

    def capture_originals(self, *, table: EnrolledTable, field: dict[str, str],
                          column_name: str,
                          source_digest: str, target_digest: str, plan_digest: str,
                          approval_digest: str, policy: dict[str, Any],
                          source_native_domain: dict[str, Any]) -> str:
        """Capture exact native old values; returns only the opaque archive ID."""
        self.verify()
        # G04 capture requires an exact same-connection native session receipt
        # and plan enrollment.  The current supervisor API has not yet
        # finalized that capability; fail before creating archive relations or
        # reading business rows.
        _fail('row-originals-session-capability-unavailable')

        # The following typed capture construction is unreachable until that
        # capability has been integrated and independently reviewed.
        table = self._resolve_table(table)
        table_record = self._verify_enrolled_table(table)
        table_token = _uuid(table._table_token)
        for digest in (source_digest, target_digest, plan_digest, approval_digest):
            _digest(digest)
        if (type(field) is not dict or set(field) != {'module', 'element'}
                or any(type(value) is not str or not value or '\x00' in value
                       for value in field.values())):
            _fail('row-originals-record-invalid')
        _strict_ident(column_name)
        if type(policy) is not dict or type(source_native_domain) is not dict:
            _fail('row-originals-record-invalid')
        if set(policy) != {'id', 'revision'} or any(
                type(policy[key]) is not str or not policy[key] or '\x00' in policy[key]
                for key in ('id', 'revision')):
            _fail('row-originals-record-invalid')
        # The source native domain must be re-observed and mapped through the
        # finite pg_catalog scalar renderer. Author type strings are rejected.
        archive_id = str(uuid.uuid4())
        relation_name = 'values_' + archive_id.replace('-', '')
        relation = _one(self._connection, f'''SELECT t.business_schema_oid,t.business_table_oid,
 n.nspname,c.relname FROM {_q(self._schema)}."row_tables" t
 JOIN pg_catalog.pg_namespace n ON n.oid=t.business_schema_oid
 JOIN pg_catalog.pg_class c ON c.oid=t.business_table_oid
 WHERE t.table_token=%s AND t.installation_id=%s AND t.record_digest ~ '^[a-f0-9]{{64}}$' ''',
                     (table_token, self._installation_id))
        if (relation is None or relation[3] != table._table_name
                or relation[2] != table._schema_name):
            _fail('row-originals-table-binding-mismatch')
        column = _one(self._connection, '''SELECT a.attnum,t.oid,tn.nspname,t.typname,
 a.atttypmod,a.attcollation::pg_catalog.oid
 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
 JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace
 WHERE a.attrelid=%s AND a.attname=%s AND a.attnum>0 AND NOT a.attisdropped''',
                      (table._relation_oid, column_name))
        if column is None:
            _fail('row-originals-source-column-mismatch')
        domain = _exact_object(source_native_domain,
                               {'schema', 'name', 'typeOid', 'typeMod', 'collationOid'})
        if (column[1] != domain['typeOid'] or column[2] != domain['schema']
                or column[3] != domain['name'] or column[4] != domain['typeMod']
                or column[5] != domain['collationOid']):
            _fail('row-originals-source-column-mismatch')
        type_sql = _source_type_sql(self._connection, domain)
        _execute(self._connection, 'CREATE TABLE ' + _q(self._schema) + '.' + _q(relation_name)
                 + ' ("instance_id" pg_catalog.uuid PRIMARY KEY, '
                 + '"captured_revision" pg_catalog.int8 NOT NULL CHECK ("captured_revision" > 0), '
                 + '"post_revision" pg_catalog.int8 CHECK ("post_revision" > 0), '
                 + '"old_value" ' + type_sql + ') USING heap')
        archive = {
            'profile': ARCHIVE_RECORD_PROFILE, 'providerId': self._provider_id,
            'installationId': self._installation_id,
            'targetCustody': self._authority['targetCustody'],
            'archiveId': archive_id, 'tableToken': table_token,
            'field': field, 'sourceDigest': source_digest,
            'targetDigest': target_digest, 'planDigest': plan_digest,
            'approvalDigest': approval_digest, 'policy': policy,
            'sourceNativeDomain': source_native_domain,
            'valuesRelation': {'schema': self._schema, 'name': relation_name,
                               'oid': 0},
            'creationReservationDigest': table_record['creationReservationDigest'],
            'state': 'capturing', 'rowCount': 0, 'logicalBytes': 0,
        }
        validate_archive_record(archive)
        # Native, full-row capture is performed by the enrolled host session;
        # no row value is returned through this provider API.
        self._capture_rows_as_native(table, column_name, relation_name, archive)
        handle = OriginalArchive(_HANDLE_SEAL, self._issuer, archive_id, table_token)
        self._archives[id(handle)] = (handle, archive)
        return handle

    def _capture_rows_as_native(self, table: EnrolledTable, column_name: str,
                                values_name: str, archive: dict[str, Any]) -> None:
        # This exact private maintenance hook will be enabled by the concrete
        # same-connection supervisor adapter; no caller callback is accepted.
        self._refresh_authority()
        self._capture_rows(table, column_name, values_name, archive)

    def _capture_rows(self, table: EnrolledTable, column_name: str,
                      values_name: str, archive: dict[str, Any]) -> None:
        """Unavailable until a reviewed same-connection session capability exists."""
        _fail('row-originals-session-capability-unavailable')

    def record_post_conversion_baseline(self, archive_id: OriginalArchive, *,
                                        table: EnrolledTable) -> None:
        """Bind the post-conversion revision baseline before phase commit."""
        self.verify()
        _fail('row-originals-session-capability-unavailable')
        archive = self._resolve_archive(archive_id)
        table = self._resolve_table(table)
        self._verify_enrolled_table(table)
        if archive._table_token != table._table_token:
            _fail('row-originals-archive-binding-mismatch')
        self._refresh_authority()
        _complete_archive_baseline(self._connection, self._schema, archive._archive_id, table)

    def inspect_restore(self, archive_id: OriginalArchive, *, table: EnrolledTable) -> None:
        """Strictly preflight full row identity/revision correspondence.

        G04 restores never expose original values to callers. The eventual
        restore executor consumes them inside the source-bound native phase.
        """
        self.verify()
        _fail('row-originals-session-capability-unavailable')
        archive = self._resolve_archive(archive_id)
        table = self._resolve_table(table)
        self._verify_enrolled_table(table)
        if archive._table_token != table._table_token:
            _fail('row-originals-archive-binding-mismatch')
        _strict_restore_preflight(self._connection, self._schema, archive._archive_id, table)

    def purge(self, _archive_id: str) -> None:
        """Value purge is G05 and is intentionally not an operation in .1."""
        _fail('row-originals-purge-unavailable')


def _source_type_sql(connection: Any, domain: dict[str, Any]) -> str:
    required = {'schema', 'name', 'typeOid', 'typeMod', 'collationOid'}
    item = _exact_object(domain, required)
    oid = _safe_int(item['typeOid'], 1, 2**32 - 1)
    typmod = _safe_int(item['typeMod'], -1, 2**31 - 1)
    collation_oid = _safe_int(item['collationOid'], 0, 2**32 - 1)
    observed = _one(connection, '''SELECT tn.nspname,t.typname,t.typtype,t.typbasetype,
 t.typtypmod,t.typcollation::pg_catalog.oid,co.collname,cn.nspname
 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace
 LEFT JOIN pg_catalog.pg_collation co ON co.oid=t.typcollation
 LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=co.collnamespace
 WHERE t.oid=%s''', (oid,))
    if observed is None or observed[0] != item['schema'] or observed[1] != item['name']:
        _fail('row-originals-native-domain-mismatch')
    if observed[2] != 'b' or observed[3] != 0:
        _fail('row-originals-native-domain-unsupported')
    kind, name = observed[0], observed[1]
    if kind != 'pg_catalog':
        _fail('row-originals-native-domain-unsupported')
    simple = {'int2': 'pg_catalog.int2', 'int4': 'pg_catalog.int4',
              'int8': 'pg_catalog.int8', 'uuid': 'pg_catalog.uuid',
              'bool': 'pg_catalog.bool', 'date': 'pg_catalog.date',
              'timestamptz': 'pg_catalog.timestamptz'}
    if name in simple and typmod == -1 and collation_oid == 0:
        return simple[name]
    if (name == 'text' and typmod == -1 and observed[5] == collation_oid
            and observed[6:8] == ('C', 'pg_catalog')):
        return 'pg_catalog.text COLLATE pg_catalog."C"'
    if name == 'numeric' and typmod >= 4 and collation_oid == 0:
        packed = typmod - 4
        precision = (packed >> 16) & 0xFFFF
        scale = packed & 0x7FF
        if scale >= 0x400:
            scale -= 0x800
        if 1 <= precision <= 1000 and -1000 <= scale <= 1000:
            return f'pg_catalog.numeric({precision},{scale})'
    _fail('row-originals-native-domain-unsupported')


def _strict_restore_preflight(connection: Any, schema: str, archive_id: str,
                              table: EnrolledTable) -> None:
    archive = _one(connection, 'SELECT table_token,state,values_relation_oid,record,record_digest '
                   'FROM ' + _q(schema) + '."archives" WHERE archive_id=%s FOR SHARE',
                   (archive_id,))
    if archive is None or str(archive[0]) != table._table_token or archive[1] != 'complete':
        _fail('row-originals-archive-unavailable')
    record = archive[3]
    validate_archive_record(record)
    if record_digest(record) != archive[4]:
        _fail('row-originals-archive-corrupt')
    values = record['valuesRelation']
    if (type(values) is not dict or values.get('schema') != schema
            or type(values.get('name')) is not str or values.get('oid') != archive[2]):
        _fail('row-originals-archive-corrupt')
    values_name = values['name']
    _strict_ident(values_name)
    table_ident = _q(table._schema_name) + '.' + _q(table._table_name)
    values_ident = _q(schema) + '.' + _q(values_name)
    rows = _one(connection, 'SELECT count(*) FROM ' + table_ident)
    archived = _one(connection, 'SELECT count(*) FROM ' + values_ident)
    mismatch_sql = ('SELECT count(*) FROM (('
                    'SELECT ' + _q(table._id_column) + ' AS id FROM ' + table_ident
                    + ' EXCEPT SELECT "instance_id" FROM ' + values_ident + ') UNION ALL ('
                    'SELECT "instance_id" AS id FROM ' + values_ident
                    + ' EXCEPT SELECT ' + _q(table._id_column) + ' FROM ' + table_ident
                    + ')) mismatch')
    mismatches = _one(connection, mismatch_sql)
    stale = _one(connection, 'SELECT count(*) FROM ' + table_ident + ' b JOIN '
                  + values_ident + ' v ON b.' + _q(table._id_column)
                  + ' = v."instance_id" WHERE v."post_revision" IS NULL OR b.'
                  + _q(table._revision_column) + ' <> v."post_revision"')
    if (rows is None or archived is None or mismatches is None or stale is None
            or rows[0] != archived[0] or mismatches[0] != 0 or stale[0] != 0
            or rows[0] != record['rowCount']):
        _fail('row-originals-restore-conflict')


def _complete_archive_baseline(connection: Any, schema: str, archive_id: str,
                               table: EnrolledTable) -> None:
    """Record complete actual post-conversion revisions and bounded accounting."""
    row = _one(connection, 'SELECT a.table_token,a.state,a.values_relation_oid,a.row_count,'
               'a.record,a.record_digest FROM ' + _q(schema)
               + '."archives" a WHERE a.archive_id=%s FOR UPDATE', (archive_id,))
    if row is None or str(row[0]) != table._table_token or row[1] != 'capturing':
        _fail('row-originals-archive-binding-mismatch')
    record = row[4]
    validate_archive_record(record)
    if record_digest(record) != row[5] or record['archiveId'] != archive_id:
        _fail('row-originals-archive-corrupt')
    values = record['valuesRelation']
    values_relation = _one(connection, '''SELECT c.oid,c.relkind,c.relpersistence,
 c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relhassubclass,
 c.relhasrules FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname=%s AND c.relname=%s''', (schema, values['name']))
    if (values_relation is None or values_relation[0] != row[2]
            or values['oid'] != row[2] or values_relation[1:3] != ('r', 'p')
            or values_relation[3] <= 0 or values_relation[4:] != (False, False, False, False, False)):
        _fail('row-originals-archive-catalog-mismatch')
    values_ident = _q(schema) + '.' + _q(values['name'])
    business = _q(table._schema_name) + '.' + _q(table._table_name)
    instance = _q(table._id_column)
    revision = _q(table._revision_column)
    # Full identity equality is required before setting the post-cutover marker.
    difference = _one(connection, 'SELECT count(*) FROM (('
                     'SELECT ' + instance + ' AS id FROM ' + business
                     + ' EXCEPT SELECT "instance_id" FROM ' + values_ident
                     + ') UNION ALL (SELECT "instance_id" AS id FROM ' + values_ident
                     + ' EXCEPT SELECT ' + instance + ' FROM ' + business + ')) d')
    current_count = _one(connection, 'SELECT count(*) FROM ' + business)
    value_count = _one(connection, 'SELECT count(*) FROM ' + values_ident)
    if (difference != (0,) or current_count is None or value_count is None
            or current_count != value_count or current_count[0] != row[3]
            or current_count[0] != record['rowCount']):
        _fail('row-originals-restore-conflict')
    updated = _one(connection, 'WITH changed AS (UPDATE ' + values_ident
                   + ' v SET "post_revision"=b.' + revision + ' FROM ' + business
                   + ' b WHERE b.' + instance + '=v."instance_id" '
                   'AND v."post_revision" IS NULL RETURNING 1) SELECT count(*) FROM changed')
    if updated is None or updated[0] != record['rowCount']:
        _fail('row-originals-post-revision-mismatch')
    unbound = _one(connection, 'SELECT count(*) FROM ' + values_ident
                    + ' WHERE "post_revision" IS NULL')
    if unbound != (0,):
        _fail('row-originals-post-revision-mismatch')
    connection.execute('ALTER TABLE ' + values_ident
                       + ' ALTER COLUMN "post_revision" SET NOT NULL')
    # Fix output formatting independently of session defaults before measuring
    # canonical native text bytes for the logical-retention projection.
    connection.execute("SET LOCAL TimeZone TO 'UTC'")
    connection.execute("SET LOCAL DateStyle TO 'ISO, YMD'")
    byte_rows = _all(connection, 'SELECT CASE WHEN "old_value" IS NULL THEN 0 '
                     'ELSE pg_catalog.octet_length(pg_catalog.convert_to('
                     '"old_value"::pg_catalog.text,\'UTF8\')) END '
                     'FROM ' + values_ident)
    scalar_bytes = sum(row_value[0] for row_value in byte_rows)
    complete_record = {**record, 'state': 'complete', 'rowCount': current_count[0]}
    complete_record.pop('logicalBytes')
    logical_bytes = len(_canonical_bytes(complete_record)) + 41 * current_count[0] + scalar_bytes
    if logical_bytes > _MAX_LOGICAL_BYTES:
        _fail('row-originals-logical-capacity')
    complete_record['logicalBytes'] = logical_bytes
    validate_archive_record(complete_record)
    connection.execute('UPDATE ' + _q(schema) + '."archives" SET "state"=%s,'
                       '"row_count"=%s,"logical_bytes"=%s,"record"=%s::pg_catalog.jsonb,'
                       '"record_digest"=%s WHERE "archive_id"=%s AND "state"=%s',
                       ('complete', current_count[0], logical_bytes,
                        _canonical_bytes(complete_record).decode('utf-8'),
                        record_digest(complete_record), archive_id, 'capturing'))
    final = _one(connection, 'SELECT state,row_count,logical_bytes,record,record_digest '
                 'FROM ' + _q(schema) + '."archives" WHERE archive_id=%s', (archive_id,))
    if (final is None or final[0] != 'complete' or final[1] != current_count[0]
            or final[2] != logical_bytes or final[3] != complete_record
            or final[4] != record_digest(complete_record)):
        _fail('row-originals-archive-finalize-unverified')


def _strict_ident(value: str) -> str:
    if type(value) is not str or not value or '\x00' in value:
        _fail('row-originals-record-invalid')
    return value

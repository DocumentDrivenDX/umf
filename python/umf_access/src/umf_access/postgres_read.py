"""Execute compiled reads on the host's existing PostgreSQL connection.

No pools, credentials, compiler imports, role switches or runtime query lowering.
The supplied connection must be idle; the read owns only its own transaction.
"""
from __future__ import annotations
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any, Generic, Protocol, cast
from dataclasses import dataclass
import hashlib
import json
import math
import time
from .reviewed import CatalogRead, P, R, ReadBuildError
from .codec_support import revalidate_model, validate_graph

class TimedOut(TimeoutError):
    pass

class ReadObligationUnmet(RuntimeError):
    pass

class Cursor(Protocol):
    description: Any
    def execute(self, query: str, params: Sequence[object] | None = None) -> object: ...
    def fetchone(self) -> Any: ...
    def fetchmany(self, size: int = 1) -> list[Any]: ...
    def __enter__(self) -> Cursor: ...
    def __exit__(self, *args: object) -> object: ...

class Connection(Protocol):
    info: Any
    def cursor(self) -> Any: ...
    def transaction(self) -> Any: ...


class _DeadlineCursor:
    def __init__(self, cursor: Cursor, deadline: float) -> None:
        self.raw = cursor
        self.deadline = deadline

    @property
    def description(self) -> Any:
        return self.raw.description

    def check(self) -> int:
        remaining = math.ceil((self.deadline - time.monotonic()) * 1000)
        if remaining <= 0:
            raise TimedOut("catalog read exceeded its per-call timeout")
        return remaining

    def execute(self, query: str, params: Sequence[object] | None = None) -> object:
        self.raw.execute("SELECT pg_catalog.set_config('statement_timeout', %s, true)", (str(self.check()),))
        return self.raw.execute(query, params)

    def fetchone(self) -> Any:
        self.check()
        return self.raw.fetchone()

    def fetchmany(self, size: int = 1) -> list[Any]:
        self.check()
        return self.raw.fetchmany(size)


_ROLE = """SELECT current_user, session_user, r.rolsuper, r.rolbypassrls
FROM pg_catalog.pg_roles r WHERE r.rolname = current_user"""
_TABLE = """SELECT c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE')
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = %s AND c.relname = %s"""
_COLUMNS = """SELECT a.attname, tn.nspname, t.typname, a.attnotnull
FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace
WHERE a.attrelid = %s AND a.attnum > 0 AND NOT a.attisdropped"""
# Equality and ordering must agree with the operators used by the compiled SQL.
# Attribute-number coincidence alone does not prove a to-one/keyset Key.
_KEYS = """SELECT ARRAY(SELECT a.attname FROM pg_catalog.unnest(i.indkey) WITH ORDINALITY AS k(attnum, pos)
JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
WHERE k.pos <= i.indnkeyatts ORDER BY k.pos)
FROM pg_catalog.pg_index i
JOIN pg_catalog.pg_class ix ON ix.oid = i.indexrelid
JOIN pg_catalog.pg_am am ON am.oid = ix.relam
WHERE i.indrelid = %s AND i.indisunique AND i.indisvalid AND i.indisready
AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indimmediate AND am.amname = 'btree'
AND NOT EXISTS (
 SELECT 1 FROM pg_catalog.unnest(i.indkey) WITH ORDINALITY AS k(attnum, pos)
 JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
 JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
 JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace
 LEFT JOIN pg_catalog.pg_opclass op ON op.oid = i.indclass[(k.pos - 1)::integer]
 LEFT JOIN pg_catalog.pg_namespace ons ON ons.oid = op.opcnamespace
 LEFT JOIN pg_catalog.pg_collation co ON co.oid = a.attcollation
 WHERE k.pos <= i.indnkeyatts AND (
  a.attnotnull AND tn.nspname = 'pg_catalog' AND ons.nspname = 'pg_catalog'
  AND op.opcmethod = ix.relam
  AND op.opcname = CASE t.typname WHEN 'int2' THEN 'int2_ops' WHEN 'int4' THEN 'int4_ops'
   WHEN 'int8' THEN 'int8_ops' WHEN 'numeric' THEN 'numeric_ops'
   WHEN 'text' THEN 'text_ops' WHEN 'varchar' THEN 'text_ops' WHEN 'bool' THEN 'bool_ops' END
  AND i.indcollation[(k.pos - 1)::integer] = a.attcollation
  AND (a.attcollation = 0 OR co.collisdeterministic)
 ) IS NOT TRUE
)"""

_TYPES = {"integer": {"int2", "int4", "int8"}, "decimal": {"numeric"},
          "string": {"text", "varchar"}, "boolean": {"bool"}}


@dataclass(frozen=True)
class ReadContinuation:
    values: tuple[object, ...]
    identity_digest: str

    def __post_init__(self) -> None:
        if type(self.values) is not tuple or type(self.identity_digest) is not str:
            raise TypeError("continuations require immutable values and an identity digest")

@dataclass(frozen=True)
class ReadPage(Generic[R]):
    items: tuple[R, ...]
    next_after: ReadContinuation | None


def _check_cursor_value(field: Mapping[str, object], value: object) -> None:
    if value is None:
        if field.get("nullable") is not True:
            raise ReadObligationUnmet("non-null continuation component is null")
        return
    expected_type = {"integer": int, "decimal": Decimal, "string": str, "boolean": bool}.get(str(field.get("carrier")))
    if expected_type is None or type(value) is not expected_type or isinstance(value, Decimal) and not value.is_finite():
        raise ReadObligationUnmet("continuation carrier differs from ordering")


def _execute(connection: Connection, entry: CatalogRead[P, R], params: P, *,
                 app_schema: str, target: str = "postgresql18", timeout_ms: int = 5000, after: ReadContinuation | None = None) -> ReadPage[R]:
    artifact = entry.artifact()
    if type(timeout_ms) is not int or not 1 <= timeout_ms <= 2_147_483_647:
        raise ValueError("timeout_ms must be a positive PostgreSQL millisecond bound")
    if not app_schema or "\x00" in app_schema or app_schema in ("pg_catalog", "information_schema") or app_schema.startswith("pg_"):
        raise ReadObligationUnmet("app schema is outside the application profile")
    if connection.info.transaction_status != 0:
        raise ReadObligationUnmet("caller connection must be idle; no nested read transaction")
    if not 180000 <= connection.info.server_version < 190000 or target != artifact["target"]:
        raise ReadObligationUnmet("catalog requires its exact PostgreSQL 18 target profile")
    binding = cast(dict[str, object], artifact["binding"])
    schema = binding["schema"]
    if schema is not None and schema != app_schema:
        raise ReadObligationUnmet("catalog schema differs from app schema")
    if type(params) is not entry.parameters:
        raise TypeError("parameters require the exact declared model")
    # Revalidate raw attributes: model_construct/model_copy never bypass codecs.
    checked = revalidate_model(entry.parameters, params)
    values = {name: getattr(checked, name) for name in entry.parameters.model_fields}
    if any(isinstance(value, Decimal) and not value.is_finite() for value in values.values()):
        raise ValueError("nonfinite decimal parameter")
    order = cast(list[str], artifact["dbapiParameterOrder"])
    obligations = cast(dict[str, object], artifact["obligations"])
    cap = obligations["rowCap"]
    if type(cap) is not int or not 1 <= cap <= 1000 or obligations.get("transaction") != "read-only":
        raise ReadBuildError("invalid catalog read obligations")
    search_path = 'pg_catalog, "' + app_schema.replace('"', '""') + '", pg_temp'
    deadline = time.monotonic() + timeout_ms / 1000
    try:
        with connection.transaction():
            with connection.cursor() as raw_cursor:
                cast(Cursor, raw_cursor).execute("SET TRANSACTION READ ONLY")
                cursor = _DeadlineCursor(cast(Cursor, raw_cursor), deadline)
                cursor.execute("SELECT pg_catalog.set_config('statement_timeout', %s, true), pg_catalog.set_config('search_path', %s, true), pg_catalog.set_config('row_security', 'on', true)", (str(timeout_ms), search_path))
                cursor.execute(_ROLE)
                before = cursor.fetchone()
                if before is None or before[2] or before[3]:
                    raise ReadObligationUnmet("caller role bypasses native row security")
                # Locks are compiled by Weft. They stabilize names and native facts
                # until this transaction ends; none are constructed from call input.
                for sql in cast(list[str], artifact["lockSql"]):
                    cursor.execute(sql)
                native_ids: list[object] = []
                for table in cast(list[dict[str, object]], binding["tables"]):
                    cursor.execute(_TABLE, (app_schema, table["native"]))
                    native = cursor.fetchone()
                    if native is None or native[1] != "r" or native[2] and native[4] and not native[3]:
                        raise ReadObligationUnmet("bound base table missing or caller has owner RLS bypass")
                    native_ids.append((table["native"], native[0]))
                    cursor.execute("SELECT pg_catalog.to_regclass(%s)::pg_catalog.oid", ('"' + str(table["native"]).replace('"', '""') + '"',))
                    if cursor.fetchone()[0] != native[0]:
                        raise ReadObligationUnmet("search_path resolves table outside app schema")
                    cursor.execute(_COLUMNS, (native[0],))
                    facts = {row[0]: row[1:] for row in cursor.fetchmany(2000)}
                    columns = cast(list[dict[str, object]], table["columns"])
                    for column in columns:
                        fact = facts.get(column["native"])
                        if fact is None or fact[0] != "pg_catalog" or fact[1] not in _TYPES[cast(str, column["carrier"])] or not column["nullable"] and not fact[2]:
                            raise ReadObligationUnmet("native column differs from compiled type")
                    cursor.execute(_KEYS, (native[0],))
                    physical = {col["logical"]: col["native"] for col in columns}
                    key = [physical[name] for name in cast(list[str], table["key"])]
                    if not any(list(row[0]) == key for row in cursor.fetchmany(2000)):
                        raise ReadObligationUnmet("compiled unique key has no native constraint")
                identity = hashlib.sha256(json.dumps([artifact["structuralDigest"], app_schema, [(name, type(value).__name__, str(value)) for name, value in values.items()], before[0], connection.info.dbname, connection.info.host, connection.info.port, native_ids], separators=(",", ":")).encode()).hexdigest()
                cursor_fields = cast(list[dict[str, object]], artifact["cursorOutputs"])
                if after is not None and (after.identity_digest != identity or len(after.values) != len(cursor_fields)):
                    raise ReadObligationUnmet("stale or incompatible read continuation")
                cursor_params = cast(list[dict[str, object]], artifact["cursorParameters"])
                if cursor_params:
                    values["__umf_has_after"] = after is not None
                    for i, field in enumerate(cursor_fields):
                        value = after.values[i] if after is not None else None
                        if after is not None:
                            _check_cursor_value(field, value)
                        values[f"__umf_after_{i}"] = value
                elif after is not None:
                    raise ReadObligationUnmet("catalog is not a keyset page")
                cursor.execute(cast(str, artifact["dbapiSql"]), tuple(values[name] for name in order))
                expected = list(entry.result.model_fields)
                names = [col.name for col in cursor.description]
                if names != expected + [f["name"] for f in cursor_fields]:
                    raise ReadObligationUnmet("result column inventory differs from catalog")
                rows = cursor.fetchmany(cap + 1)
                if len(rows) > cap:
                    raise ReadObligationUnmet("target returned more than the catalog row cap")
                for row in rows:
                    hidden = row[len(expected):]
                    if len(hidden) != len(cursor_fields):
                        raise ReadObligationUnmet("hidden sort inventory differs from catalog")
                    for field, value in zip(cursor_fields, hidden, strict=True):
                        _check_cursor_value(field, value)
                result = [validate_graph(entry.result, dict(zip(expected, row[:len(expected)], strict=True))) for row in rows]
                cursor.execute(_ROLE)
                if cursor.fetchone() != before:
                    raise ReadObligationUnmet("caller role changed during read")
                continuation = ReadContinuation(tuple(rows[-1][len(expected):]), identity) if cursor_fields and len(rows) == cap else None
                cursor.check()
                return ReadPage(tuple(result), continuation)
    except Exception as error:
        if getattr(error, "sqlstate", None) == "57014":
            raise TimedOut("catalog read exceeded its per-call timeout") from None
        raise


def execute_read(connection: Connection, entry: CatalogRead[P, R], params: P, *, app_schema: str, target: str = "postgresql18", timeout_ms: int = 5000) -> list[R]:
    return list(_execute(connection, entry, params, app_schema=app_schema, target=target, timeout_ms=timeout_ms).items)


def execute_page(connection: Connection, entry: CatalogRead[P, R], params: P, *, app_schema: str, after: ReadContinuation | None = None, target: str = "postgresql18", timeout_ms: int = 5000) -> ReadPage[R]:
    if not entry.artifact().get("cursorOutputs"):
        raise ReadObligationUnmet("catalog was not built as a keyset page")
    return _execute(connection, entry, params, app_schema=app_schema, after=after, target=target, timeout_ms=timeout_ms)

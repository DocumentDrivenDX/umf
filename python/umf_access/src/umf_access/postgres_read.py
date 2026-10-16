"""Execute compiled reads on the host's existing PostgreSQL connection.

No pools, credentials, compiler imports, role switches or runtime query lowering.
The supplied connection must be idle; the read owns only its own transaction.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from collections.abc import AsyncGenerator, Generator, Sequence
from contextlib import nullcontext
from decimal import Decimal
from typing import Any, Protocol, cast

from .pages import ReadContinuation, ReadObligationUnmet, ReadPage, StaleContinuation
from .reviewed import CatalogRead, P, R, ReadBuildError


class TimedOut(TimeoutError):
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
        self.raw.execute(
            "SELECT pg_catalog.set_config('statement_timeout', %s, true)",
            (str(self.check()),),
        )
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
_KEYS = """SELECT ARRAY(SELECT a.attname FROM pg_catalog.unnest(i.indkey) WITH ORDINALITY AS k(attnum, pos)
JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
WHERE k.pos <= i.indnkeyatts ORDER BY k.pos)
FROM pg_catalog.pg_index i WHERE i.indrelid = %s AND i.indisunique AND i.indisvalid
AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indimmediate"""
_TYPES = {
    "integer": {"int2", "int4", "int8"},
    "decimal": {"numeric"},
    "string": {"text", "varchar"},
    "boolean": {"bool"},
}


def _checked_sort_values(
    fields: list[dict[str, object]], values: Sequence[object]
) -> tuple[object, ...]:
    if len(fields) != len(values):
        raise ReadObligationUnmet("cursor output inventory differs")
    for field, value in zip(fields, values, strict=True):
        expected = {
            "integer": int,
            "decimal": Decimal,
            "string": str,
            "boolean": bool,
        }.get(str(field["carrier"]))
        if (
            expected is None
            or value is None
            and not field["nullable"]
            or value is not None
            and type(value) is not expected
            or isinstance(value, Decimal)
            and not value.is_finite()
        ):
            raise ReadObligationUnmet("cursor output carrier differs")
    return tuple(values)


def native_read_admission(
    binding: dict[str, object], app_schema: str, lock_sql: tuple[str, ...]
) -> Generator[tuple[Any, ...], Any, tuple[Any, list[object]]]:
    """Shared native role/table/key admission inside the caller's read snapshot."""
    yield ("execute", _ROLE)
    before = yield ("one",)
    if before is None or before[2] or before[3]:
        raise ReadObligationUnmet("caller role bypasses native row security")
    # Locks are compiled by Weft. They stabilize names and native facts
    # until this transaction ends; none are constructed from call input.
    for sql in lock_sql:
        yield ("execute", sql)
    native_ids: list[object] = []
    for table in cast(list[dict[str, object]], binding["tables"]):
        yield ("execute", _TABLE, (app_schema, table["native"]))
        native = yield ("one",)
        if (
            native is None
            or native[1] != "r"
            or native[2]
            and native[4]
            and not native[3]
        ):
            raise ReadObligationUnmet(
                "bound base table missing or caller has owner RLS bypass"
            )
        native_ids.append((table["native"], native[0]))
        yield (
            "execute",
            "SELECT pg_catalog.to_regclass(%s)::pg_catalog.oid",
            ('"' + str(table["native"]).replace('"', '""') + '"',),
        )
        if (yield ("one",))[0] != native[0]:
            raise ReadObligationUnmet("search_path resolves table outside app schema")
        yield ("execute", _COLUMNS, (native[0],))
        facts = {row[0]: row[1:] for row in (yield ("many", 2000))}
        columns = cast(list[dict[str, object]], table["columns"])
        for column in columns:
            fact = facts.get(column["native"])
            if (
                fact is None
                or fact[0] != "pg_catalog"
                or fact[1] not in _TYPES[cast(str, column["carrier"])]
                or not column["nullable"]
                and not fact[2]
            ):
                raise ReadObligationUnmet("native column differs from compiled type")
        yield ("execute", _KEYS, (native[0],))
        physical = {col["logical"]: col["native"] for col in columns}
        key = [physical[name] for name in cast(list[str], table["key"])]
        if not any(list(row[0]) == key for row in (yield ("many", 2000))):
            raise ReadObligationUnmet("compiled unique key has no native constraint")
    return before, native_ids


def _program(
    connection: Connection,
    entry: CatalogRead[P, R],
    params: P | None,
    *,
    app_schema: str,
    target: str = "postgresql18",
    timeout_ms: int = 5000,
    after: ReadContinuation | None = None,
    _snapshot: bool = False,
    _verify_only: bool = False,
) -> Generator[tuple[Any, ...], Any, ReadPage[R]]:
    artifact = entry.artifact()
    if type(timeout_ms) is not int or not 1 <= timeout_ms <= 2_147_483_647:
        raise ValueError("timeout_ms must be a positive PostgreSQL millisecond bound")
    if (
        not app_schema
        or "\x00" in app_schema
        or app_schema in ("pg_catalog", "information_schema")
        or app_schema.startswith("pg_")
    ):
        raise ReadObligationUnmet("app schema is outside the application profile")
    if connection.info.transaction_status != (2 if _snapshot else 0):
        raise ReadObligationUnmet(
            "caller connection must be idle; no nested read transaction"
        )
    if (
        not 180000 <= connection.info.server_version < 190000
        or target != artifact["target"]
    ):
        raise ReadObligationUnmet(
            "catalog requires its exact PostgreSQL 18 target profile"
        )
    binding = cast(dict[str, object], artifact["binding"])
    schema = binding["schema"]
    if schema is not None and schema != app_schema:
        raise ReadObligationUnmet("catalog schema differs from app schema")
    if not _verify_only and type(params) is not entry.parameters:
        raise TypeError("parameters require the exact declared model")
    # Revalidate raw attributes: model_construct/model_copy never bypass codecs.
    checked = (
        None
        if _verify_only
        else entry.parameters.model_validate(
            {name: getattr(params, name) for name in entry.parameters.model_fields},
            strict=True,
        )
    )
    values = (
        {}
        if checked is None
        else {name: getattr(checked, name) for name in entry.parameters.model_fields}
    )
    if any(
        isinstance(value, Decimal) and not value.is_finite()
        for value in values.values()
    ):
        raise ValueError("nonfinite decimal parameter")
    order = cast(list[str], artifact["dbapiParameterOrder"])
    obligations = cast(dict[str, object], artifact["obligations"])
    cap = obligations["rowCap"]
    if (
        type(cap) is not int
        or not 1 <= cap <= 1000
        or obligations.get("transaction") != "read-only"
    ):
        raise ReadBuildError("invalid catalog read obligations")
    search_path = 'pg_catalog, "' + app_schema.replace('"', '""') + '", pg_temp'
    deadline = time.monotonic() + timeout_ms / 1000
    yield ("begin", deadline)
    yield (
        "execute",
        "SELECT pg_catalog.set_config('statement_timeout', %s, true), pg_catalog.set_config('search_path', %s, true), pg_catalog.set_config('row_security', 'on', true)",
        (str(timeout_ms), search_path),
    )
    before, native_ids = yield from native_read_admission(
        binding, app_schema, tuple(cast(list[str], artifact["lockSql"]))
    )
    yield ("verified",)
    identity = hashlib.sha256(
        json.dumps(
            [
                entry.artifact_json,
                entry.context_json,
                app_schema,
                [
                    (name, type(value).__name__, str(value))
                    for name, value in values.items()
                ],
                before[0],
                connection.info.dbname,
                connection.info.host,
                connection.info.port,
                native_ids,
            ],
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    cursor_fields = cast(list[dict[str, object]], artifact["cursorOutputs"])
    if after is not None and (
        after.identity_digest != identity or len(after.values) != len(cursor_fields)
    ):
        raise StaleContinuation("stale or incompatible read continuation")
    cursor_params = cast(list[dict[str, object]], artifact["cursorParameters"])
    if cursor_params:
        values["__umf_has_after"] = after is not None
        for i, field in enumerate(cursor_fields):
            value = after.values[i] if after is not None else None
            carrier = field["carrier"]
            expected_type = {
                "integer": int,
                "decimal": Decimal,
                "string": str,
                "boolean": bool,
            }[cast(str, carrier)]
            if value is not None and (
                type(value) is not expected_type
                or isinstance(value, Decimal)
                and not value.is_finite()
            ):
                raise StaleContinuation("continuation carrier differs from ordering")
            values[f"__umf_after_{i}"] = value
    elif after is not None:
        raise ReadObligationUnmet("catalog is not a keyset page")
    yield (
        "execute",
        cast(str, artifact["dbapiSql"]),
        tuple(values[name] for name in order),
    )
    expected = list(entry.result.model_fields)
    names = [col.name for col in (yield ("columns",))]
    if names != expected + [f["name"] for f in cursor_fields]:
        raise ReadObligationUnmet("result column inventory differs from catalog")
    rows = yield ("many", cap + 1)
    if len(rows) > cap:
        raise ReadObligationUnmet("target returned more than the catalog row cap")
    result = [
        entry.result.model_validate(
            dict(zip(expected, row[: len(expected)], strict=True)), strict=True
        )
        for row in rows
    ]
    yield ("execute", _ROLE)
    if (yield ("one",)) != before:
        raise ReadObligationUnmet("caller role changed during read")
    continuation = (
        ReadContinuation(
            _checked_sort_values(cursor_fields, rows[-1][len(expected) :]), identity
        )
        if cursor_fields and len(rows) == cap
        else None
    )
    yield ("check",)
    return ReadPage(tuple(result), continuation)


def _drive(
    program: Generator[tuple[Any, ...], Any, ReadPage[R]],
    cursor: _DeadlineCursor,
    verify_only: bool = False,
) -> ReadPage[R]:
    answer: Any = None
    while True:
        try:
            step = program.send(answer)
        except StopIteration as done:
            return cast(ReadPage[R], done.value)
        if step[0] == "execute":
            cursor.execute(step[1], step[2] if len(step) > 2 else None)
            answer = None
        elif step[0] == "one":
            answer = cursor.fetchone()
        elif step[0] == "many":
            answer = cursor.fetchmany(step[1])
        elif step[0] == "columns":
            answer = cursor.description
        elif step[0] == "check":
            answer = cursor.check()
        elif step[0] == "verified":
            if verify_only:
                return ReadPage((), None)
            answer = None
        else:
            raise ReadBuildError("unknown read operation")


def _execute(
    connection: Connection,
    entry: CatalogRead[P, R],
    params: P | None,
    *,
    app_schema: str,
    target: str = "postgresql18",
    timeout_ms: int = 5000,
    after: ReadContinuation | None = None,
    _snapshot: bool = False,
    _verify_only: bool = False,
) -> ReadPage[R]:
    program = _program(
        connection,
        entry,
        params,
        app_schema=app_schema,
        target=target,
        timeout_ms=timeout_ms,
        after=after,
        _snapshot=_snapshot,
        _verify_only=_verify_only,
    )
    begin = next(program)  # All call/identity checks precede transaction entry.
    try:
        with (nullcontext() if _snapshot else connection.transaction()), (connection.cursor()) as raw:
            if not _snapshot:
                raw.execute("SET TRANSACTION READ ONLY")
            return _drive(program, _DeadlineCursor(raw, begin[1]), _verify_only)
    except Exception as error:
        if getattr(error, "sqlstate", None) == "57014":
            raise TimedOut("catalog read exceeded its per-call timeout") from None
        raise
    finally:
        program.close()


class AsyncConnection(Protocol):
    info: Any

    def cursor(self) -> Any: ...
    def transaction(self) -> Any: ...


async def _async_drive(
    program: Generator[tuple[Any, ...], Any, ReadPage[R]],
    raw: Any,
    deadline: float,
    verify_only: bool = False,
) -> ReadPage[R]:
    answer: Any = None
    while True:
        try:
            step = program.send(answer)
        except StopIteration as done:
            return cast(ReadPage[R], done.value)
        remaining = math.ceil((deadline - time.monotonic()) * 1000)
        if remaining <= 0:
            raise TimedOut("catalog read exceeded its per-call timeout")
        if step[0] == "execute":
            await raw.execute(
                "SELECT pg_catalog.set_config('statement_timeout', %s, true)",
                (str(remaining),),
            )
            await raw.execute(step[1], step[2] if len(step) > 2 else None)
            answer = None
        elif step[0] == "one":
            answer = await raw.fetchone()
        elif step[0] == "many":
            answer = await raw.fetchmany(step[1])
        elif step[0] == "columns":
            answer = raw.description
        elif step[0] == "check":
            answer = remaining
        elif step[0] == "verified":
            if verify_only:
                return ReadPage((), None)
            answer = None
        else:
            raise ReadBuildError("unknown read operation")


async def _async_execute(
    connection: AsyncConnection,
    entry: CatalogRead[P, R],
    params: P | None,
    *,
    app_schema: str,
    target: str = "postgresql18",
    timeout_ms: int = 5000,
    after: ReadContinuation | None = None,
    _snapshot: bool = False,
    _verify_only: bool = False,
) -> ReadPage[R]:
    program = _program(
        connection,
        entry,
        params,
        app_schema=app_schema,
        target=target,
        timeout_ms=timeout_ms,
        after=after,
        _snapshot=_snapshot,
        _verify_only=_verify_only,
    )
    begin = next(program)
    try:
        async with (nullcontext() if _snapshot else connection.transaction()), (connection.cursor()) as raw:
            if not _snapshot:
                await raw.execute("SET TRANSACTION READ ONLY")
            return await _async_drive(program, raw, begin[1], _verify_only)
    except Exception as error:
        if getattr(error, "sqlstate", None) == "57014":
            raise TimedOut("catalog read exceeded its per-call timeout") from None
        raise
    finally:
        program.close()


async def execute_read_async(
    connection: AsyncConnection,
    entry: CatalogRead[P, R],
    params: P,
    *,
    app_schema: str,
    target: str = "postgresql18",
    timeout_ms: int = 5000,
) -> list[R]:
    return list(
        (
            await _async_execute(
                connection,
                entry,
                params,
                app_schema=app_schema,
                target=target,
                timeout_ms=timeout_ms,
            )
        ).items
    )


async def execute_page_async(
    connection: AsyncConnection,
    entry: CatalogRead[P, R],
    params: P,
    *,
    app_schema: str,
    after: ReadContinuation | None = None,
    target: str = "postgresql18",
    timeout_ms: int = 5000,
) -> ReadPage[R]:
    if not entry.artifact().get("cursorOutputs"):
        raise ReadObligationUnmet("catalog was not built as a keyset page")
    return await _async_execute(
        connection,
        entry,
        params,
        app_schema=app_schema,
        after=after,
        target=target,
        timeout_ms=timeout_ms,
    )


def execute_stream_async(
    connection: AsyncConnection,
    entry: CatalogRead[P, R],
    params: P,
    *,
    app_schema: str,
    max_rows: int,
    target: str = "postgresql18",
    timeout_ms: int = 5000,
) -> AsyncGenerator[R, None]:
    if type(max_rows) is not int or max_rows < 1:
        raise ValueError("max_rows must be a positive integer")
    if connection.info.transaction_status != 0:
        raise ReadObligationUnmet("caller connection must be idle")
    if not entry.artifact().get("cursorOutputs"):
        raise ReadObligationUnmet("stream requires a compiled keyset catalog")
    if type(timeout_ms) is not int or not 1 <= timeout_ms <= 2_147_483_647:
        raise ValueError("timeout_ms must be a positive PostgreSQL millisecond bound")
    return _async_stream(
        connection,
        entry,
        params,
        app_schema=app_schema,
        max_rows=max_rows,
        target=target,
        timeout_ms=timeout_ms,
    )


async def _async_stream(
    connection: AsyncConnection,
    entry: CatalogRead[P, R],
    params: P,
    *,
    app_schema: str,
    max_rows: int,
    target: str,
    timeout_ms: int,
) -> AsyncGenerator[R, None]:
    if connection.info.transaction_status != 0:
        raise ReadObligationUnmet("caller connection must remain idle")
    async with connection.transaction():
        async with connection.cursor() as cursor:
            await cursor.execute(
                "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
            )
        emitted = 0
        after = None
        while emitted < max_rows:
            page = await _async_execute(
                connection,
                entry,
                params,
                app_schema=app_schema,
                target=target,
                timeout_ms=timeout_ms,
                after=after,
                _snapshot=True,
            )
            for item in page.items:
                if emitted == max_rows:
                    return
                emitted += 1
                yield item
            if page.next_after is None:
                return
            after = page.next_after


def execute_read(
    connection: Connection,
    entry: CatalogRead[P, R],
    params: P,
    *,
    app_schema: str,
    target: str = "postgresql18",
    timeout_ms: int = 5000,
) -> list[R]:
    return list(
        _execute(
            connection,
            entry,
            params,
            app_schema=app_schema,
            target=target,
            timeout_ms=timeout_ms,
        ).items
    )


def execute_page(
    connection: Connection,
    entry: CatalogRead[P, R],
    params: P,
    *,
    app_schema: str,
    after: ReadContinuation | None = None,
    target: str = "postgresql18",
    timeout_ms: int = 5000,
) -> ReadPage[R]:
    if not entry.artifact().get("cursorOutputs"):
        raise ReadObligationUnmet("catalog was not built as a keyset page")
    return _execute(
        connection,
        entry,
        params,
        app_schema=app_schema,
        after=after,
        target=target,
        timeout_ms=timeout_ms,
    )


def execute_stream(
    connection: Connection,
    entry: CatalogRead[P, R],
    params: P,
    *,
    app_schema: str,
    max_rows: int,
    target: str = "postgresql18",
    timeout_ms: int = 5000,
) -> Generator[R, None, None]:
    """Bounded export in one repeatable-read snapshot, using compiled keyset pages.

    Close the iterator when abandoning an export to release its transaction.
    Each page receives its own finite deadline; exceptions never signal a
    successfully completed export. The host retains ownership of the connection.
    """
    if type(max_rows) is not int or max_rows < 1:
        raise ValueError("max_rows must be a positive integer")
    if connection.info.transaction_status != 0:
        raise ReadObligationUnmet("caller connection must be idle")
    if not entry.artifact().get("cursorOutputs"):
        raise ReadObligationUnmet("stream requires a compiled keyset catalog")
    if type(timeout_ms) is not int or not 1 <= timeout_ms <= 2_147_483_647:
        raise ValueError("timeout_ms must be a positive PostgreSQL millisecond bound")
    return _stream(
        connection,
        entry,
        params,
        app_schema=app_schema,
        max_rows=max_rows,
        target=target,
        timeout_ms=timeout_ms,
    )


def _stream(
    connection: Connection,
    entry: CatalogRead[P, R],
    params: P,
    *,
    app_schema: str,
    max_rows: int,
    target: str,
    timeout_ms: int,
) -> Generator[R, None, None]:
    # Recheck at first iteration: a host may have started a transaction since
    # constructing the iterator. Never nest inside host-owned work.
    if connection.info.transaction_status != 0:
        raise ReadObligationUnmet("caller connection must remain idle")
    with connection.transaction():
        with connection.cursor() as cursor:
            cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        emitted = 0
        after = None
        while emitted < max_rows:
            page = _execute(
                connection,
                entry,
                params,
                app_schema=app_schema,
                target=target,
                timeout_ms=timeout_ms,
                after=after,
                _snapshot=True,
            )
            for item in page.items:
                if emitted == max_rows:
                    return
                emitted += 1
                yield item
            if page.next_after is None:
                return
            after = page.next_after


def verify_read(
    connection: Connection,
    entry: CatalogRead[P, R],
    *,
    app_schema: str,
    target: str = "postgresql18",
    timeout_ms: int = 5000,
) -> None:
    _execute(
        connection,
        entry,
        None,
        app_schema=app_schema,
        target=target,
        timeout_ms=timeout_ms,
        _verify_only=True,
    )


async def verify_read_async(
    connection: AsyncConnection,
    entry: CatalogRead[P, R],
    *,
    app_schema: str,
    target: str = "postgresql18",
    timeout_ms: int = 5000,
) -> None:
    await _async_execute(
        connection,
        entry,
        None,
        app_schema=app_schema,
        target=target,
        timeout_ms=timeout_ms,
        _verify_only=True,
    )

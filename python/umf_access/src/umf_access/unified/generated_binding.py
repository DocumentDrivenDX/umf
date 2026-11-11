# SPDX-License-Identifier: MIT OR Apache-2.0
"""Async compiler-free native reader for verifier-issued fixed query artifacts."""

from __future__ import annotations

import asyncio
import hashlib
import math
import re
import time
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from types import MappingProxyType
from typing import TYPE_CHECKING, Any, cast
from weakref import WeakValueDictionary

if TYPE_CHECKING:
    from umf_access_generated_executor import (
        AdmittedNativeTable,
        ExecutionScope,
        GeneratedExecutor,
        GeneratedGetManyCall,
        GeneratedJoinedReadRoot,
        GeneratedOrdinaryPageRoot,
        GeneratedReadCall,
        TargetBinding,
    )

from umf_access.generated_native_port import GeneratedNativeExecutionPort as _NativePort
from umf_access.lifecycle import CatalogError
from .generated_connection import (
    AllowedConnectionFieldProfile,
    GeneratedConnectionRoute,
    GeneratedCursorScope,
    GeneratedForwardConnectionRequest,
    PreparedForwardConnection,
    _decode_connection_cursor,
    _encode_connection_cursor,
    _json_value,
    _PREPARED_ISSUER,
)

from umf_access.unified import (
    AsyncSession,
    GeneratedNativeError,
    SessionError,
    SessionIdentity,
)

_REQUEST = {
    "contract",
    "schema",
    "kind",
    "module",
    "operation",
    "call",
    "phase",
    "mutation",
    "idempotency_key",
}
_GUARD = {
    "profile": "pg18-read-frame/0.1",
    "maxNativeBytes": 8_388_608,
    "sqlstate": "22012",
    "includesLookahead": True,
    "partialFrames": False,
}
_READ_GUARD = {
    "profile": "pg18-read-frame/0.1",
    "maxNativeBytes": 8_388_608,
    "sqlstate": "22012",
    "includesLookahead": True,
    "partialFrames": False,
}


def _check_native_description(
    cursor, program, native_types: tuple[Mapping[str, object], ...] | None = None
) -> tuple[tuple[object, object], ...]:
    """Reuse the runtime's exact name/OID gate without per-binding cache state."""
    allowed = {
        "boolean": {16},
        "integer": {20, 21, 23},
        "decimal": {1700},
        "string": {25, 1042, 1043},
        "float": {701},
        "date": {1082},
        "timestamp": {1184},
        "uuid": {2950},
        "bits128": {17},
    }
    description = getattr(cursor, "native_description", None)
    if description is None:
        description = cursor.description
    outputs = program["outputs"]
    if len(description) != len(outputs):
        raise SessionError("declared query result type differs")
    metadata = []
    for index, (column, output) in enumerate(zip(description, outputs, strict=True)):
        valid_oids = allowed.get(output["carrier"], set())
        if native_types is not None:
            native_type = native_types[index]
            native_kind = native_type.get("kind")
            exact_oids = {
                "boolean": 16,
                "text": 25,
                "varchar": 1043,
                "char": 1042,
                "int2": 21,
                "int4": 23,
                "int8": 20,
                "numeric": 1700,
                "date": 1082,
                "timestamptz": 1184,
                "uuid": 2950,
                "bytea": 17,
            }
            exact_oid = exact_oids.get(cast(str, native_kind))
            expected_carrier = {
                "boolean": "boolean",
                "text": "string",
                "varchar": "string",
                "char": "string",
                "int2": "integer",
                "int4": "integer",
                "int8": "integer",
                "numeric": "decimal",
                "date": "date",
                "timestamptz": "timestamp",
                "uuid": "uuid",
                "bytea": "bits128",
            }.get(cast(str, native_kind))
            valid_oids = {exact_oid} if exact_oid is not None else set()
            if output["carrier"] != expected_carrier:
                raise SessionError("native read carrier differs from its source type")
        if (
            len(column) < 2
            or column[0] != output["name"]
            or column[1] not in valid_oids
        ):
            raise SessionError("declared query result type differs")
        metadata.append((column[0], column[1]))
    return tuple(metadata)


def _read_native_types(
    admitted: AdmittedNativeTable,
    module: str,
    record: str,
    fields: object,
) -> tuple[Mapping[str, object], ...]:
    source = admitted.native_source
    catalog = source["expectedCatalog"]
    tables = cast(Mapping[str, object], catalog)["tables"]
    table = next(
        (
            value
            for value in cast(tuple[object, ...] | list[object], tables)
            if isinstance(value, Mapping)
            and value.get("record") == {"module": module, "element": record}
        ),
        None,
    )
    if not isinstance(table, Mapping):
        raise SessionError(
            "generated read Record is outside the admitted native catalog"
        )
    columns = table.get("columns")
    if not isinstance(columns, (tuple, list)):
        raise SessionError("generated native column inventory differs")
    by_field: dict[tuple[str, str], Mapping[str, object]] = {}
    for value in columns:
        if not isinstance(value, Mapping):
            raise SessionError("generated native column descriptor differs")
        field = value.get("field")
        if not isinstance(field, Mapping):
            raise SessionError("generated native column Field differs")
        key = (cast(str, field.get("module")), cast(str, field.get("element")))
        if key in by_field or not isinstance(value.get("nativeType"), Mapping):
            raise SessionError("generated native Field mapping is ambiguous")
        by_field[key] = cast(Mapping[str, object], value["nativeType"])
    if not isinstance(fields, (tuple, list)):
        raise SessionError("generated bound Field inventory differs")
    result: list[Mapping[str, object]] = []
    for value in fields:
        if not isinstance(value, Mapping):
            raise SessionError("generated bound Field descriptor differs")
        field = value if set(value) == {"module", "element"} else value.get("field")
        if not isinstance(field, Mapping):
            raise SessionError("generated bound Field reference differs")
        key = (cast(str, field.get("module")), cast(str, field.get("element")))
        native_type = by_field.get(key)
        if native_type is None:
            raise SessionError("generated bound Field has no native type")
        result.append(native_type)
    return tuple(result)


def _same_request_authority(expected: Mapping[str, object], observed: object) -> None:
    if not isinstance(observed, Mapping) or dict(observed) != dict(expected):
        raise SessionError("request snapshot authority changed")


async def _request_settings(session, native, identity, expected=None):
    return await _NativePort.request_settings(session, native, identity, expected)


async def _finish_request_cleanup(operation) -> None:
    """Complete a cancelled request task drain before the leases unwind."""
    task = asyncio.create_task(operation)
    cancellation = None
    while True:
        try:
            await asyncio.shield(task)
            break
        except asyncio.CancelledError as error:
            if task.done():
                task.result()
                cancellation = error
                break
            cancellation = error
    if cancellation is not None:
        raise cancellation


async def _backend_pid(session, native) -> int:
    async with session.control_cursor(native) as cursor:
        await cursor.execute("SELECT pg_catalog.pg_backend_pid()")
        row = await cursor.fetchone()
    if not isinstance(row, (tuple, list)) or len(row) != 1 or type(row[0]) is not int:
        raise SessionError("native backend identity is unavailable")
    return row[0]


def _field_id(reference: Mapping[str, object]) -> str:
    module = reference.get("module")
    element = reference.get("element")
    if type(module) is not str or not module or type(element) is not str or not element:
        raise SessionError("generated source Field reference is malformed")
    return (
        module.replace("~", "~0").replace("/", "~1")
        + "/"
        + element.replace("~", "~0").replace("/", "~1")
    )


def _generated_native_error(error: Exception) -> GeneratedNativeError:
    """Reduce generated request failures to a fixed code, never driver text."""
    if isinstance(error, GeneratedNativeError):
        return error
    try:
        from umf_access_generated_executor import GeneratedExecutionError
    except ImportError:
        GeneratedExecutionError = ()
    if isinstance(error, GeneratedExecutionError):
        code = {
            "INVALID": "INVALID",
            "UNSUPPORTED": "UNSUPPORTED",
            "LIMIT_EXCEEDED": "LIMIT_EXCEEDED",
            "ARTIFACT_REFUSED": "SCHEMA_MISMATCH",
        }.get(error.code, "BUSY")
        return GeneratedNativeError(code)
    if isinstance(error, CatalogError):
        return GeneratedNativeError("SCHEMA_MISMATCH")
    if isinstance(error, SessionError):
        if str(error) == "native wire frame bound exceeded":
            return GeneratedNativeError("LIMIT_EXCEEDED")
        code = _NativePort.reason_code(error)
        if code in {
            "DENIED",
            "INVALID",
            "LIMIT_EXCEEDED",
            "PRECONDITION_FAILED",
            "SCHEMA_MISMATCH",
        }:
            return GeneratedNativeError(code)
        return GeneratedNativeError("BUSY")
    sqlstate = getattr(error, "sqlstate", None)
    if type(sqlstate) is str:
        if sqlstate == "42501":
            return GeneratedNativeError("DENIED")
        if sqlstate == "22012":
            return GeneratedNativeError("LIMIT_EXCEEDED")
        if sqlstate == "23514":
            return GeneratedNativeError("PRECONDITION_FAILED")
        if sqlstate in {"42P01", "42703", "42804", "42883", "42846"}:
            return GeneratedNativeError("SCHEMA_MISMATCH")
        if sqlstate == "57014":
            return GeneratedNativeError("BUSY")
    return GeneratedNativeError("BUSY")


class GeneratedReadRequest:
    """Request-owned two-lease reader for verified algebra-v4 artifacts."""

    def __init__(
        self,
        binding: GeneratedNativeTableBinding,
        data_session: AsyncSession,
        identity: SessionIdentity,
        scope: ExecutionScope,
        probe: object,
    ) -> None:
        self._binding = binding
        self._data_session = data_session
        self._identity = identity
        self._scope = scope
        self._probe = probe
        self._guard = None
        self._data = None
        self._authority = None
        self._guard_settings = None
        self._data_settings = None
        self._active = False
        self._failed = False
        self._failure: GeneratedNativeError | None = None
        self._lock = asyncio.Lock()
        self._tasks: set[asyncio.Task[object]] = set()

    async def _deadline(self) -> None:
        if time.monotonic() >= self._scope.deadline_monotonic:
            raise SessionError("request snapshot deadline expired")

    async def _current_guard(self):
        await _request_settings(
            self._binding._session,
            self._guard,
            self._identity,
            self._guard_settings,
        )
        observed = await _NativePort.drive_async(
            self._binding._session, self._guard, self._probe.operation_steps()
        )
        _NativePort.check_principal(self._binding._session, self._identity, observed)
        _same_request_authority(self._authority, observed)
        return observed

    async def execute_get_many(self, call: GeneratedGetManyCall) -> dict[str, object]:
        if not self._active or self._failed:
            raise SessionError("request snapshot is closed or poisoned")
        task = asyncio.current_task()
        if task is None:
            raise SessionError("request snapshot requires an active task")
        self._tasks.add(cast(asyncio.Task[object], task))
        failure: GeneratedNativeError | None = None
        cancelled = False
        try:
            async with self._lock:
                if not self._active or self._failed:
                    raise SessionError("request snapshot is closed or poisoned")
                try:
                    await self._deadline()
                    from umf_access_generated_executor import GeneratedGetManyCall

                    if type(call) is not GeneratedGetManyCall:
                        raise SessionError("generated Key batch call is required")
                    bound = self._binding._executor.bind_get_many(call, self._scope)
                    from umf_access_generated_executor import (
                        BoundKeyBatchProgram,
                        canonical_json,
                    )

                    await self._deadline()
                    if (
                        type(bound) is not BoundKeyBatchProgram
                        or bound.source_digest != self._binding._admitted.source_digest
                        or bound.target_digest != self._binding._target.binding_digest
                        or bound.key_id != call.key_id
                        or bound.input_count != len(call.keys)
                        or dict(bound.root)
                        != {"module": call.module, "record": call.record}
                        or dict(bound.native_read_guard).get("profile")
                        != "pg18-composed-native-frame/1"
                    ):
                        raise SessionError(
                            "generated Key batch binding provenance differs"
                        )
                    program = _NativePort.loads(bound.program_json)
                    expected_field_ids = [
                        _field_id(cast(Mapping[str, object], field))
                        for field in bound.fields
                    ]
                    if (
                        type(program) is not dict
                        or program.get("version") != "umf.generated-key-batch-bound/1"
                        or program.get("sql") != bound.sql
                        or tuple(program.get("parameters", ())) != bound.parameters
                        or program.get("descriptionSql") != bound.description_sql
                        or canonical_json(program.get("keys"))
                        != canonical_json(bound.keys)
                        or program.get("fields") != expected_field_ids
                        or canonical_json(program.get("outputs"))
                        != canonical_json(bound.outputs)
                        or canonical_json(program.get("keyOutputs"))
                        != canonical_json(bound.key_outputs)
                        or canonical_json(program.get("ordinalOutput"))
                        != canonical_json(bound.ordinal_output)
                        or canonical_json(program.get("presentOutput"))
                        != canonical_json(bound.present_output)
                        or canonical_json(program.get("nativeReadGuard"))
                        != canonical_json(bound.native_read_guard)
                        or canonical_json(program.get("obligations"))
                        != canonical_json(bound.obligations)
                        or program.get("source", {}).get("modelSha256")
                        != bound.source_digest
                        or program.get("target", {}).get("bindingDigest")
                        != bound.target_digest
                        or program.get("keyId") != bound.key_id
                        or program.get("inputCount") != bound.input_count
                    ):
                        raise SessionError("generated Key batch bound program differs")

                    selected_native_types = _read_native_types(
                        self._binding._admitted,
                        call.module,
                        call.record,
                        bound.fields,
                    )
                    outputs = (
                        cast(Mapping[str, object], bound.ordinal_output),
                        cast(Mapping[str, object], bound.present_output),
                        *bound.outputs,
                    )
                    native_types = (
                        {"kind": "int8"},
                        {"kind": "boolean"},
                        *selected_native_types,
                    )
                    if len(outputs) != len(native_types):
                        raise SessionError(
                            "generated Key batch output inventory differs"
                        )
                    if self._probe.schema != self._binding._session.policy.schema:
                        raise SessionError("generated Key batch probe schema differs")

                    async with asyncio.timeout(
                        max(0.001, self._scope.deadline_monotonic - time.monotonic())
                    ):
                        await self._current_guard()
                        await _request_settings(
                            self._data_session,
                            self._data,
                            self._identity,
                            self._data_settings,
                        )
                        async with self._data_session.control_cursor(
                            self._data
                        ) as result:
                            await result.execute(bound.sql, bound.parameters)
                            description = _check_native_description(
                                result, {"outputs": outputs}, native_types
                            )
                            rows = await result.fetchall()
                        if len(rows) != bound.input_count:
                            raise SessionError(
                                "generated Key batch ordinal count differs"
                            )
                        if any(len(row) != len(outputs) for row in rows):
                            raise SessionError("generated Key batch row shape differs")
                        items: list[object] = []
                        for index, row in enumerate(rows):
                            ordinal, present = row[0], row[1]
                            if (
                                type(ordinal) is not int
                                or ordinal != index
                                or type(present) is not bool
                            ):
                                raise SessionError(
                                    "generated Key batch ordinal or presence differs"
                                )
                            if not present:
                                items.append(None)
                                continue
                            values = [
                                _NativePort.read_value(
                                    value, output, native_type, description[position][1]
                                )
                                for position, (value, output, native_type) in enumerate(
                                    zip(
                                        row[2:],
                                        bound.outputs,
                                        selected_native_types,
                                        strict=True,
                                    ),
                                    start=2,
                                )
                            ]
                            if any(
                                value is None and output.get("nullable") is False
                                for value, output in zip(
                                    values, bound.outputs, strict=True
                                )
                            ):
                                raise SessionError(
                                    "generated required Key batch value is null"
                                )
                            items.append(
                                {
                                    "key": [dict(value) for value in bound.keys[index]],
                                    "values": values,
                                }
                            )
                        await _request_settings(
                            self._data_session,
                            self._data,
                            self._identity,
                            self._data_settings,
                        )
                        await self._current_guard()
                        await self._deadline()
                        frame = {
                            "version": "umf.generated-key-batch-result/1",
                            "sourceDigest": bound.source_digest,
                            "bindingDigest": bound.target_digest,
                            "module": call.module,
                            "record": call.record,
                            "keyId": bound.key_id,
                            "fields": [dict(field) for field in bound.fields],
                            "items": items,
                        }
                        _NativePort.bounded_size(
                            frame,
                            limit=cast(int, bound.native_read_guard["maxNativeBytes"]),
                        )
                        return frame
                except asyncio.CancelledError:
                    self._failed = True
                    self._failure = GeneratedNativeError("BUSY")
                    cancelled = True
                except Exception as error:  # noqa: BLE001 -- fixed-code native mapping
                    self._failed = True
                    self._failure = _generated_native_error(error)
                    failure = self._failure
        finally:
            self._tasks.discard(cast(asyncio.Task[object], task))
        if cancelled:
            raise asyncio.CancelledError
        if failure is not None:
            raise failure

    async def execute_forward_connection(
        self, prepared: PreparedForwardConnection
    ) -> dict[str, object]:
        """Execute one prepared v5 connection on this request's held leases."""
        if not self._active or self._failed:
            raise SessionError("request snapshot is closed or poisoned")
        task = asyncio.current_task()
        if task is None:
            raise SessionError("request snapshot requires an active task")
        self._tasks.add(cast(asyncio.Task[object], task))
        failure: GeneratedNativeError | None = None
        cancelled = False
        try:
            async with self._lock:
                if not self._active or self._failed:
                    raise SessionError("request snapshot is closed or poisoned")
                try:
                    from umf_access_generated_executor import (
                        BoundForwardConnectionProgram,
                        GeneratedForwardConnectionCall,
                        canonical_json,
                    )

                    if (
                        type(prepared) is not PreparedForwardConnection
                        or prepared._binding is not self._binding
                        or prepared._scope is not self._scope
                        or prepared._identity is not self._identity
                        or prepared._issuer is not _PREPARED_ISSUER
                        or self._binding._prepared_forward.pop(id(prepared), None)
                        is not prepared
                    ):
                        raise SessionError("prepared connection scope or issuer differs")
                    await self._deadline()
                    if (
                        self._binding.read_profile not in {"weft.generated-read-algebra/5", "weft.generated-read-algebra/7", "weft.generated-read-algebra/8"}
                        or type(prepared._call) is not GeneratedForwardConnectionCall
                        or type(prepared._bound) is not BoundForwardConnectionProgram
                        or prepared._route
                        is not self._binding._connection_routes.get(
                            prepared._route.cursor_scope.host_operation_id
                        )
                        or prepared._call.module != prepared._route.module
                        or prepared._call.record != prepared._route.record
                        or prepared._call.module != prepared._bound.root["module"]
                        or prepared._call.record != prepared._bound.root["record"]
                        or prepared._bound.source_digest
                        != self._binding._admitted.source_digest
                        or prepared._bound.target_digest
                        != self._binding._target.binding_digest
                    ):
                        raise SessionError("prepared connection provenance differs")
                    bound = prepared._bound
                    call = prepared._call
                    program = _NativePort.loads(bound.program_json)
                    fresh_bound = self._binding._executor.bind_forward_connection(call)
                    algebra = _NativePort.loads(self._binding._executor.read_algebra_json)
                    root_key = _field_id({"module": call.module, "element": call.record})
                    roots = algebra.get("roots") if type(algebra) is dict else None
                    issued_root = roots.get(root_key) if isinstance(roots, Mapping) else None
                    issued_guard = (
                        issued_root.get("nativeReadGuard")
                        if isinstance(issued_root, Mapping)
                        else None
                    )
                    bound_field_ids = [
                        _field_id(cast(Mapping[str, object], field))
                        for field in bound.fields
                    ]
                    if (
                        type(program) is not dict
                        or program.get("version")
                        != "umf.generated-forward-connection-bound/1"
                        or program.get("sql") != bound.sql
                        or tuple(program.get("parameters", ())) != bound.parameters
                        or program.get("previousSql") != bound.previous_sql
                        or tuple(program.get("previousParameters", ()))
                        != bound.previous_parameters
                        or program.get("root")
                        != _field_id({"module": call.module, "element": call.record})
                        or program.get("fields") != bound_field_ids
                        or call.fields is not None
                        and tuple(program.get("fields", ())) != call.fields
                        or program.get("first") != call.first
                        or program.get("after") != call.after
                        or program.get("source", {}).get("modelSha256")
                        != bound.source_digest
                        or program.get("target", {}).get("bindingDigest")
                        != bound.target_digest
                        or canonical_json(program.get("where"))
                        != canonical_json(_json_value(prepared._context.get("where")))
                        or fresh_bound != bound
                        or canonical_json(issued_guard)
                        != canonical_json(bound.native_read_guard)
                        or bound.native_read_guard.get("profile")
                        != "pg18-composed-native-frame/1"
                        or bound.native_read_guard.get("maxNativeBytes") != 8_388_608
                        or bound.native_read_guard.get("partialFrames") is not False
                    ):
                        raise SessionError("prepared connection bound program differs")

                    profile = prepared._route.allowed_field_profile
                    if profile is None or any(
                        field_id not in {item["fieldId"] for item in profile.body["fields"]}
                        for field_id in program["fields"]
                    ):
                        raise SessionError("prepared connection field profile differs")
                    native_types = _read_native_types(
                        self._binding._admitted, call.module, call.record, bound.fields
                    )
                    key_native_type = cast(Mapping[str, object], bound.key_output)[
                        "nativeType"
                    ]
                    ordinal_output = {
                        "carrier": "integer",
                        "name": "__weft_ordinal",
                        "nativeType": {"kind": "int8"},
                        "nullable": False,
                    }
                    forward_outputs = (ordinal_output, bound.key_output, *bound.outputs)
                    forward_types = ({"kind": "int8"}, key_native_type, *native_types)
                    if len(forward_outputs) != len(forward_types):
                        raise SessionError("prepared connection output inventory differs")

                    timeout = max(
                        0.001, self._scope.deadline_monotonic - time.monotonic()
                    )
                    async with asyncio.timeout(timeout):
                        await self._current_guard()
                        await _request_settings(
                            self._data_session,
                            self._data,
                            self._identity,
                            self._data_settings,
                        )
                        async with self._data_session.control_cursor(self._data) as result:
                            await result.execute(bound.sql, bound.parameters)
                            forward_description = _check_native_description(
                                result, {"outputs": forward_outputs}, forward_types
                            )
                            rows = await result.fetchall()
                        if len(rows) > bound.fetch_limit or any(
                            len(row) != len(forward_outputs)
                            or type(row[0]) is not int
                            or row[0] != index
                            for index, row in enumerate(rows, start=1)
                        ):
                            raise SessionError("forward connection row bound differs")
                        await _request_settings(
                            self._data_session,
                            self._data,
                            self._identity,
                            self._data_settings,
                        )
                        await self._current_guard()
                        await self._deadline()
                        async with self._data_session.control_cursor(self._data) as prior:
                            await prior.execute(
                                bound.previous_sql, bound.previous_parameters
                            )
                            prior_description = _check_native_description(
                                prior,
                                {"outputs": (bound.previous_output,)},
                                (bound.previous_output["nativeType"],),
                            )
                            prior_rows = await prior.fetchall()
                        if (
                            len(prior_rows) != 1
                            or len(prior_rows[0]) != 1
                            or type(prior_rows[0][0]) is not bool
                        ):
                            raise SessionError("prior connection probe differs")
                        has_previous = prior_rows[0][0]
                        await _request_settings(
                            self._data_session,
                            self._data,
                            self._identity,
                            self._data_settings,
                        )
                        await self._current_guard()
                        await self._deadline()

                        has_next = len(rows) > call.first
                        selected_rows = rows[: call.first]
                        fields = list(program["fields"])
                        edges: list[object] = []
                        frame_base = {
                            "version": "umf.generated-forward-connection-result/1",
                            "sourceDigest": bound.source_digest,
                            "bindingDigest": bound.target_digest,
                            "module": call.module,
                            "record": call.record,
                            "fields": [dict(field) for field in bound.fields],
                            "edges": [],
                            "pageInfo": {
                                "hasNextPage": has_next,
                                "hasPreviousPage": has_previous,
                            },
                        }
                        frame_base_bytes = len(canonical_json(frame_base))
                        edge_bytes_total = 0
                        cursor_secret = self._binding._session.policy.cursor_secret(
                            self._identity, self._binding._cursor_secret
                        )
                        context_digest = hashlib.sha256(
                            canonical_json(_json_value(prepared._context))
                        ).hexdigest()
                        limit = cast(int, bound.native_read_guard["maxNativeBytes"])
                        for row in selected_rows:
                            key_value = _NativePort.read_value(
                                row[1],
                                bound.key_output,
                                key_native_type,
                                forward_description[1][1],
                            )
                            if (
                                type(key_value) is not dict
                                or set(key_value) != {"string"}
                                or type(key_value["string"]) is not str
                            ):
                                raise SessionError("connection Key must decode as text")
                            edge_position = key_value["string"]
                            cursor = _encode_connection_cursor(
                                cursor_secret, context_digest, edge_position
                            )
                            values = [
                                _NativePort.read_value(
                                    value,
                                    output,
                                    native_type,
                                    forward_description[index + 2][1],
                                )
                                for index, (value, output, native_type) in enumerate(
                                    zip(
                                        row[2:],
                                        bound.outputs,
                                        native_types,
                                        strict=True,
                                    )
                                )
                            ]
                            edge = {
                                "node": {
                                    "key": {
                                        "keyId": prepared._context["keyId"],
                                        "components": [key_value],
                                    },
                                    "fields": dict(zip(fields, values, strict=True)),
                                },
                                "cursor": cursor,
                            }
                            edge_bytes_total += len(canonical_json(edge))
                            prospective = (
                                frame_base_bytes
                                + edge_bytes_total
                                + max(0, len(edges))
                            )
                            if prospective > limit:
                                raise GeneratedNativeError("LIMIT_EXCEEDED")
                            edges.append(edge)
                        frame = {
                            "version": "umf.generated-forward-connection-result/1",
                            "sourceDigest": bound.source_digest,
                            "bindingDigest": bound.target_digest,
                            "module": call.module,
                            "record": call.record,
                            "fields": [dict(field) for field in bound.fields],
                            "edges": edges,
                            "pageInfo": {
                                "hasNextPage": has_next,
                                "hasPreviousPage": has_previous,
                            },
                        }
                        _NativePort.bounded_size(frame, limit=limit)
                        return frame
                except asyncio.CancelledError:
                    self._failed = True
                    self._failure = GeneratedNativeError("BUSY")
                    cancelled = True
                except Exception as error:  # noqa: BLE001 -- fixed-code native mapping
                    self._failed = True
                    self._failure = _generated_native_error(error)
                    failure = self._failure
        finally:
            self._tasks.discard(cast(asyncio.Task[object], task))
        if cancelled:
            raise asyncio.CancelledError
        if failure is not None:
            raise failure

    async def _drain(self) -> None:
        owner = asyncio.current_task()
        tasks = tuple(task for task in self._tasks if task is not owner)
        if tasks:
            self._failed = True
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


class GeneratedNativeTableBinding:
    """One host-authenticated fixed-query adapter; it never loads UMF/Weft."""

    def __init__(
        self,
        session: AsyncSession,
        admitted: AdmittedNativeTable,
        reference: dict[str, object],
        executor: GeneratedExecutor,
        *,
        cursor_secret: bytes,
        outcome_secret: bytes,
        target: TargetBinding,
        connection_routes: Mapping[str, GeneratedConnectionRoute] | None = None,
    ) -> None:
        try:
            from umf_access_generated_executor import (
                AdmittedNativeTable,
                TargetBinding,
                is_verified_executor_for,
            )
        except ImportError:
            raise SessionError("generated executor extra is unavailable") from None

        if type(session) is not AsyncSession:
            raise SessionError("generated native binding requires an async session")
        if type(admitted) is not AdmittedNativeTable or not is_verified_executor_for(
            executor, admitted
        ):
            raise SessionError("generated executor provenance differs")
        if type(reference) is not dict:
            raise SessionError("trusted installation reference is required")
        if type(target) is not TargetBinding or target != executor.target:
            raise SessionError("generated target differs")
        if type(cursor_secret) is not bytes or len(cursor_secret) < 32:
            raise ValueError("cursor root secret requires at least 256 bits")
        if type(outcome_secret) is not bytes or len(outcome_secret) < 32:
            raise ValueError("outcome root secret requires at least 256 bits")
        if connection_routes is None:
            connection_routes = {}
        if not isinstance(connection_routes, Mapping):
            raise ValueError("generated connection route registry must be a mapping")
        if executor.read_profile == "weft.generated-read-algebra/5" and not connection_routes:
            raise ValueError("generated connection routes are required for profile v5")
        if connection_routes and executor.read_profile not in {
            "weft.generated-read-algebra/5", "weft.generated-read-algebra/7",
            "weft.generated-read-algebra/8",
        }:
            raise ValueError("generated connection routes require an issued connection profile")
        canonical_routes: dict[str, GeneratedConnectionRoute] = {}
        algebra = _NativePort.loads(executor.read_algebra_json) if connection_routes else {}
        roots = algebra.get("roots") if type(algebra) is dict else None
        native_configuration = admitted.native_source.get("configuration")
        native_module = (
            native_configuration.get("module")
            if isinstance(native_configuration, Mapping)
            else None
        )
        host_identity: tuple[str, str, str] | None = None
        seen_operation_ids: set[str] = set()
        for operation_id, route in connection_routes.items():
            if (
                type(operation_id) is not str
                or not operation_id
                or operation_id in seen_operation_ids
                or type(route) is not GeneratedConnectionRoute
                or route.cursor_scope.host_operation_id != operation_id
                or route.module != native_module
            ):
                raise ValueError("generated connection route key differs")
            seen_operation_ids.add(operation_id)
            host_pins = (
                route.cursor_scope.application_id,
                route.cursor_scope.application_digest,
                route.cursor_scope.api_digest,
            )
            if host_identity is None:
                host_identity = host_pins
            elif host_identity != host_pins:
                raise ValueError("generated connection routes cross host scope")
            canonical_profile = AllowedConnectionFieldProfile.from_body(
                cast(Mapping[str, object], _json_value(route.allowed_field_profile.body))
            )
            if canonical_profile.digest != route.allowed_field_profile.digest:
                raise ValueError("generated cursor field profile is not canonical")
            root_id = _field_id({"module": route.module, "element": route.record})
            root = roots.get(root_id) if isinstance(roots, Mapping) else None
            if not isinstance(root, Mapping):
                raise ValueError("generated connection route root is not issued")
            issued_fields = root.get("fields")
            connection = root.get("forwardConnection")
            support = root.get("forwardConnectionSupport")
            if (
                not isinstance(issued_fields, Mapping)
                or not isinstance(connection, Mapping)
                or not isinstance(support, Mapping)
                or support.get("status") != "eligible"
            ):
                raise ValueError("generated connection route is not eligible")
            issued_outputs = {
                field["fieldId"]: field
                for field in cast(tuple[Mapping[str, object], ...], connection["fieldOutputs"])
            }
            for descriptor in cast(
                tuple[Mapping[str, object], ...], route.allowed_field_profile.body["fields"]
            ):
                field_id = cast(str, descriptor["fieldId"])
                issued = issued_outputs.get(field_id)
                field = issued_fields.get(field_id)
                if (
                    not isinstance(issued, Mapping)
                    or not isinstance(field, Mapping)
                    or descriptor["sourceField"] != field.get("sourceField")
                    or descriptor["output"] != issued.get("output")
                    or descriptor["scalar"] != issued["output"].get("carrier")
                    or descriptor["nullable"] != issued["output"].get("nullable")
                ):
                    raise ValueError("generated connection route field join differs")
            canonical_routes[operation_id] = route
        source = admitted.native_source
        configuration = source["configuration"]
        if not isinstance(configuration, Mapping):
            raise SessionError("generated source configuration differs")
        schema = configuration.get("schema")
        module = configuration.get("module")
        if type(schema) is not str or type(module) is not str:
            raise SessionError("generated source identity differs")
        if not session.policy.catalog_only or session.policy.schema != schema:
            raise SessionError(
                "generated source differs from the isolated session schema"
            )
        self._session = session
        self._admitted = admitted
        self._reference = dict(reference)
        self._executor = executor
        self._target = target
        self._cursor_secret = cursor_secret
        self._connection_routes = MappingProxyType(canonical_routes)
        self._prepared_forward: WeakValueDictionary[int, PreparedForwardConnection] = (
            WeakValueDictionary()
        )
        self.schema = admitted.source_digest
        self.module = module
        self._operations = dict(admitted.operations)

    @classmethod
    def from_generated(
        cls,
        session: AsyncSession,
        admitted: AdmittedNativeTable,
        reference: dict[str, object],
        executor: GeneratedExecutor,
        *,
        cursor_secret: bytes,
        outcome_secret: bytes,
        target: TargetBinding,
        connection_routes: Mapping[str, GeneratedConnectionRoute] | None = None,
    ) -> GeneratedNativeTableBinding:
        return cls(
            session,
            admitted,
            reference,
            executor,
            cursor_secret=cursor_secret,
            outcome_secret=outcome_secret,
            target=target,
            connection_routes=connection_routes,
        )

    def prepare_forward_connection(
        self,
        request: GeneratedForwardConnectionRequest,
        *,
        identity: SessionIdentity,
        scope: ExecutionScope,
    ) -> PreparedForwardConnection:
        """Authenticate and bind a v5 connection without opening a lease."""
        from umf_access_generated_executor import (
            ExecutionScope as _ExecutionScope,
            GeneratedForwardConnectionCall,
            canonical_json,
        )

        if type(request) is not GeneratedForwardConnectionRequest:
            raise GeneratedNativeError("INVALID")
        route = self._connection_routes.get(request.operation_id)
        cursor_scope = route.cursor_scope if route is not None else None
        profile = route.allowed_field_profile if route is not None else None
        if (
            cursor_scope is None
            or profile is None
            or self.read_profile not in {"weft.generated-read-algebra/5", "weft.generated-read-algebra/7", "weft.generated-read-algebra/8"}
            or type(request) is not GeneratedForwardConnectionRequest
            or type(identity) is not SessionIdentity
            or type(scope) is not _ExecutionScope
            or scope.principal is not identity
            or scope.api_digest != cursor_scope.api_digest
            or scope.consistency != "request-snapshot/1"
            or request.operation_id != cursor_scope.host_operation_id
            or request.module != route.module
            or request.record != route.record
            or not math.isfinite(scope.deadline_monotonic)
            or time.monotonic() >= scope.deadline_monotonic
        ):
            raise GeneratedNativeError("INVALID")
        if cursor_scope.allowed_field_profile_digest != profile.digest:
            raise GeneratedNativeError("INVALID")
        try:
            self._session.policy.role(identity)
        except SessionError:
            raise GeneratedNativeError("DENIED") from None

        algebra = _NativePort.loads(self._executor.read_algebra_json)
        root_id = _field_id({"module": request.module, "element": request.record})
        roots = algebra.get("roots") if type(algebra) is dict else None
        root = roots.get(root_id) if isinstance(roots, Mapping) else None
        if not isinstance(root, Mapping):
            raise GeneratedNativeError("UNSUPPORTED")
        profile_fields = cast(tuple[Mapping[str, object], ...], profile.body["fields"])
        profile_by_id = {cast(str, field["fieldId"]): field for field in profile_fields}
        issued_fields = root.get("fields")
        connection = root.get("forwardConnection")
        support = root.get("forwardConnectionSupport")
        if (
            not isinstance(issued_fields, Mapping)
            or not isinstance(connection, Mapping)
            or not isinstance(support, Mapping)
            or support.get("status") != "eligible"
        ):
            raise GeneratedNativeError("UNSUPPORTED")
        issued_outputs = {
            field["fieldId"]: field
            for field in cast(tuple[Mapping[str, object], ...], connection["fieldOutputs"])
        }
        for field_id, descriptor in profile_by_id.items():
            issued = issued_outputs.get(field_id)
            field = issued_fields.get(field_id)
            if (
                not isinstance(issued, Mapping)
                or not isinstance(field, Mapping)
                or descriptor.get("sourceField") != field.get("sourceField")
                or descriptor.get("output") != issued.get("output")
                or type(descriptor.get("scalar")) is not str
                or type(descriptor.get("nullable")) is not bool
            ):
                raise GeneratedNativeError("UNSUPPORTED")
        selected = request.fields
        if selected is None:
            defaults = root.get("defaultSelection")
            if not isinstance(defaults, (tuple, list)) or any(
                value not in profile_by_id for value in defaults
            ):
                raise GeneratedNativeError("UNSUPPORTED")
        if selected is not None and any(value not in profile_by_id for value in selected):
            raise GeneratedNativeError("UNSUPPORTED")

        decoded_after = None
        cursor_payload = None
        cursor_secret = self._session.policy.cursor_secret(identity, self._cursor_secret)
        if request.after is not None:
            try:
                cursor_payload = _decode_connection_cursor(cursor_secret, request.after)
                decoded_after = cursor_payload["after"]
                if type(decoded_after) is not str:
                    raise ValueError("cursor position differs")
            except (ValueError, KeyError, TypeError, UnicodeError):
                raise GeneratedNativeError("INVALID_CURSOR") from None
        call = GeneratedForwardConnectionCall(
            request.module,
            request.record,
            selected,
            request.where,
            request.first,
            decoded_after,
        )
        try:
            bound = self._executor.bind_forward_connection(call)
            if len(bound.program_json) > 8_388_608:
                raise GeneratedNativeError("LIMIT_EXCEEDED")
        except GeneratedNativeError:
            raise
        except Exception as error:  # noqa: BLE001 -- fixed refusal boundary
            raise _generated_native_error(error) from None
        program = _NativePort.loads(bound.program_json)
        if type(program) is not dict or program.get("version") != "umf.generated-forward-connection-bound/1":
            raise GeneratedNativeError("SCHEMA_MISMATCH")

        # The cursor binds the pure binder's normalized filter and stable
        # authority context; selection and page size remain outside the token.
        context: dict[str, object] = {
            "version": "umf.generated-connection-cursor-context/1",
            "applicationId": cursor_scope.application_id,
            "applicationDigest": cursor_scope.application_digest,
            "apiDigest": cursor_scope.api_digest,
            "hostOperationId": cursor_scope.host_operation_id,
            "nativeIdentity": {"kind": identity.kind, "subject": identity.subject},
            "module": request.module,
            "record": request.record,
            "sourceDigest": self._admitted.source_digest,
            "targetDigest": self._target.binding_digest,
            "artifactDigest": self._executor.trusted_artifact.artifact_digest,
            "algebraDigest": hashlib.sha256(self._executor.read_algebra_json).hexdigest(),
            "headDigest": self._reference.get("headDigest"),
            "referenceDigest": self._reference.get("referenceDigest"),
            "keyId": connection.get("keyId"),
            "allowedFieldProfileDigest": profile.digest,
            "where": program.get("where"),
            "order": "key-ascending-collation-C/1",
        }
        if any(
            type(context[name]) is not str
            or not re.fullmatch(r"[0-9a-f]{64}", cast(str, context[name]))
            for name in ("headDigest", "referenceDigest")
        ):
            raise GeneratedNativeError("SCHEMA_MISMATCH")
        context_digest = hashlib.sha256(canonical_json(context)).hexdigest()
        if cursor_payload is not None and cursor_payload.get("contextDigest") != context_digest:
            raise GeneratedNativeError("INVALID_CURSOR")
        prepared = PreparedForwardConnection(
            binding=self,
            scope=scope,
            identity=identity,
            route=route,
            call=call,
            bound=bound,
            context=context,
            _issuer=_PREPARED_ISSUER,
        )
        self._prepared_forward[id(prepared)] = prepared
        return prepared

    @property
    def target(self):
        """The immutable target verified with the artifact receipt."""
        return self._target

    @property
    def connection_routes(self) -> Mapping[str, GeneratedConnectionRoute]:
        """Read-only configured route pins for trusted host composition."""
        return self._connection_routes

    @property
    def read_profile(self) -> str | None:
        """Read-only profile marker from the admitted executor descriptor."""
        return self._executor.read_profile

    @property
    def source_digest(self) -> str:
        return self._admitted.source_digest

    @property
    def target_binding_digest(self) -> str:
        return self._target.binding_digest

    @property
    def artifact_digest(self) -> str:
        """Digest of the verified executor artifact bound to this reader."""
        return self._executor.trusted_artifact.artifact_digest

    @property
    def receipt_digest(self) -> str:
        """Receipt digest pinned by the verified executor for this reader."""
        return self._executor.trusted_artifact.receipt_digest

    @property
    def algebra_digest(self) -> str:
        import hashlib

        return hashlib.sha256(self.algebra_json).hexdigest()

    @property
    def algebra_json(self) -> bytes:
        content = self._executor.read_algebra_json
        if type(content) is not bytes:
            raise SessionError("generated read algebra is unavailable")
        return content

    async def execute(
        self,
        request: dict[str, Any],
        *,
        identity: SessionIdentity,
        scope: ExecutionScope,
    ) -> dict[str, object]:
        try:
            prepared = self._prepare(request, identity, scope)
            probe, program, call_scope, secret = prepared
            async with self._session.open(identity, read_only=True) as native:
                observed = await _NativePort.drive_async(
                    self._session, native, probe.operation_steps()
                )
                _NativePort.check_principal(self._session, identity, observed)
                async with self._session.control_cursor(native) as description:
                    await description.execute(
                        program["nativeDescriptionSql"],
                        _NativePort.native_arguments(program),
                    )
                    _check_native_description(description, program)
                async with self._session.control_cursor(native) as result:
                    await result.execute(
                        program["dbapiSql"], _NativePort.native_arguments(program)
                    )
                    _NativePort.validate_read_columns(result, program)
                    rows = await result.fetchall()
                value = _NativePort.result_frame(program, rows, call_scope, secret)
            return {"schema": self.schema, "table": value}
        except Exception as error:  # noqa: BLE001 -- sanitize native and artifact diagnostics
            return {"schema": self.schema, "error": {"code": self._error_code(error)}}

    async def execute_read(
        self,
        call: GeneratedReadCall,
        *,
        identity: SessionIdentity,
        scope: ExecutionScope,
    ) -> dict[str, object]:
        """Execute one compiler-free composed read through the separate /2 seam."""
        try:
            from umf_access_generated_executor import (
                BoundReadProgram,
                ExecutionScope,
                GeneratedReadCall,
                canonical_json,
            )

            self._session.policy.role(identity)
            if (
                self._executor.read_profile != "weft.generated-read-algebra/1"
                or type(call) is not GeneratedReadCall
                or type(scope) is not ExecutionScope
                or type(scope.principal) is not SessionIdentity
                or scope.principal != identity
                or not math.isfinite(scope.deadline_monotonic)
                or time.monotonic() >= scope.deadline_monotonic
            ):
                raise SessionError("generated read scope differs")
            source = self._admitted.native_source
            configuration = cast(Mapping[str, object], source["configuration"])
            if call.module != self.module or configuration["module"] != call.module:
                raise SessionError("generated read module differs")

            # Binding is pure and runs before head observations or a lease.
            bound = self._executor.bind_read(call, scope)
            if time.monotonic() >= scope.deadline_monotonic:
                raise SessionError("generated read scope expired")
            if (
                type(bound) is not BoundReadProgram
                or bound.source_digest != self._admitted.source_digest
                or bound.target_digest != self._target.binding_digest
            ):
                raise SessionError("generated read binding provenance differs")
            program = _NativePort.loads(bound.program_json)
            if (
                type(program) is not dict
                or program.get("version") != "umf.generated-read-bound/1"
                or program.get("sql") != bound.sql
                or tuple(program.get("parameters", ())) != bound.parameters
                or program.get("descriptionSql") != bound.description_sql
                or canonical_json(program.get("outputs"))
                != canonical_json(bound.outputs)
                or canonical_json(program.get("fields")) != canonical_json(bound.fields)
                or canonical_json(program.get("obligations"))
                != canonical_json(bound.obligations)
                or canonical_json(program.get("nativeReadGuard"))
                != canonical_json(bound.native_read_guard)
                or program.get("source", {}).get("modelSha256") != bound.source_digest
                or program.get("target", {}).get("bindingDigest") != bound.target_digest
                or dict(bound.native_read_guard) != _READ_GUARD
            ):
                raise SessionError("unsupported generated read binding profile")
            native_types = _read_native_types(
                self._admitted, call.module, call.record, program.get("fields")
            )
            native_carriers = {
                "boolean": "boolean",
                "text": "string",
                "varchar": "string",
                "char": "string",
                "int2": "integer",
                "int4": "integer",
                "int8": "integer",
                "numeric": "decimal",
                "date": "date",
                "timestamptz": "timestamp",
                "uuid": "uuid",
                "bytea": "bits128",
            }
            if any(
                index >= len(native_types)
                or type(native_types[index].get("kind")) is not str
                or native_carriers.get(cast(str, native_types[index].get("kind")))
                != output.get("carrier")
                for index, output in enumerate(program.get("outputs", ()))
            ) or len(native_types) != len(program.get("outputs", ())):
                raise SessionError(
                    "generated read native types are outside the qualified profile"
                )
            probe = cast(
                Any,
                _NativePort.prepare_probe(
                    self._session,
                    identity,
                    self._admitted,
                    self._reference,
                    correspondence=True,
                ),
            )
            async with self._session.open(identity, read_only=True) as native:
                observed = await _NativePort.drive_async(
                    self._session, native, probe.operation_steps()
                )
                _NativePort.check_principal(self._session, identity, observed)
                async with self._session.control_cursor(native) as description:
                    await description.execute(
                        bound.description_sql, bound.description_parameters
                    )
                    description_metadata = _check_native_description(
                        description, program, native_types
                    )
                async with self._session.control_cursor(native) as result:
                    await result.execute(bound.sql, bound.parameters)
                    result_metadata = tuple(
                        (column[0], column[1]) for column in result.description
                    )
                    if result_metadata != description_metadata:
                        raise SessionError("native read columns differ")
                    rows = await result.fetchall()
                if len(rows) > call.limit:
                    raise SessionError("generated read row bound exceeded")
                tagged_rows = [
                    [
                        _NativePort.read_value(value, output, native_type, oid)
                        for value, output, native_type, (_name, oid) in zip(
                            row,
                            program["outputs"],
                            native_types,
                            result_metadata,
                            strict=True,
                        )
                    ]
                    for row in rows
                ]
                frame = {
                    "version": "umf.generated-read-result/1",
                    "kind": "many",
                    "sourceDigest": bound.source_digest,
                    "module": call.module,
                    "record": call.record,
                    "columns": [
                        {"field": dict(field), "output": dict(output)}
                        for field, output in zip(
                            program["fields"], program["outputs"], strict=True
                        )
                    ],
                    "rows": tagged_rows,
                    "cursor": None,
                }
                _NativePort.bounded_size(
                    frame,
                    limit=cast(int, bound.native_read_guard["maxNativeBytes"]),
                )
            return {"schema": self.schema, "table": frame}
        except Exception as error:  # noqa: BLE001 -- sanitize native and artifact diagnostics
            code = self._error_code(error)
            if code == "INVALID" and isinstance(error, SessionError):
                code = _NativePort.reason_code(error)
            return {"schema": self.schema, "error": {"code": code}}

    async def execute_read_v2(
        self,
        call: object,
        *,
        identity: SessionIdentity,
        scope: ExecutionScope,
    ) -> dict[str, object]:
        """Execute one G3 Boolean/terminal call through the separate v2 seam."""
        try:
            from umf_access_generated_executor import (
                BoundReadProgramV2,
                ExecutionScope,
                GeneratedReadCallV2,
                canonical_json,
            )

            self._session.policy.role(identity)
            if (
                self._executor.read_profile != "weft.generated-read-algebra/2"
                or type(call) is not GeneratedReadCallV2
                or type(scope) is not ExecutionScope
                or type(scope.principal) is not SessionIdentity
                or scope.principal != identity
                or not math.isfinite(scope.deadline_monotonic)
                or time.monotonic() >= scope.deadline_monotonic
            ):
                raise SessionError("generated v2 read scope differs")
            source = self._admitted.native_source
            configuration = cast(Mapping[str, object], source["configuration"])
            if call.module != self.module or configuration["module"] != call.module:
                raise SessionError("generated v2 read module differs")

            bound = self._executor.bind_read_v2(call, scope)
            if time.monotonic() >= scope.deadline_monotonic:
                raise SessionError("generated v2 read scope expired")
            if (
                type(bound) is not BoundReadProgramV2
                or bound.source_digest != self._admitted.source_digest
                or bound.target_digest != self._target.binding_digest
            ):
                raise SessionError("generated v2 binding provenance differs")
            program = _NativePort.loads(bound.program_json)
            if (
                type(program) is not dict
                or program.get("version") != "umf.generated-read-bound/2"
                or program.get("sql") != bound.sql
                or tuple(program.get("parameters", ())) != bound.parameters
                or program.get("descriptionSql") != bound.description_sql
                or canonical_json(program.get("outputs"))
                != canonical_json(bound.outputs)
                or canonical_json(program.get("fields")) != canonical_json(bound.fields)
                or canonical_json(program.get("obligations"))
                != canonical_json(bound.obligations)
                or canonical_json(program.get("nativeReadGuard"))
                != canonical_json(bound.native_read_guard)
                or program.get("terminal") != bound.terminal
                or program.get("resultKind") != bound.result_kind
                or program.get("cardinality") != bound.cardinality
                or program.get("effectiveRowLimit") != bound.row_limit
                or canonical_json(program.get("scalarOutput"))
                != canonical_json(bound.scalar_output)
                or program.get("source", {}).get("modelSha256") != bound.source_digest
                or program.get("target", {}).get("bindingDigest") != bound.target_digest
                or dict(bound.native_read_guard) != _READ_GUARD
            ):
                raise SessionError("unsupported generated v2 binding profile")

            scalar_output = bound.scalar_output
            if bound.result_kind == "scalar":
                if scalar_output is None or not isinstance(
                    scalar_output.get("nativeType"), Mapping
                ):
                    raise SessionError("generated scalar native type is absent")
                native_types = (
                    cast(Mapping[str, object], scalar_output["nativeType"]),
                )
                outputs = (scalar_output,)
            else:
                native_types = _read_native_types(
                    self._admitted, call.module, call.record, program.get("fields")
                )
                outputs = bound.outputs
            native_carriers = {
                "boolean": "boolean",
                "text": "string",
                "varchar": "string",
                "char": "string",
                "int2": "integer",
                "int4": "integer",
                "int8": "integer",
                "numeric": "decimal",
                "date": "date",
                "timestamptz": "timestamp",
                "uuid": "uuid",
                "bytea": "bits128",
            }
            if len(native_types) != len(outputs) or any(
                type(native_types[index].get("kind")) is not str
                or native_carriers.get(cast(str, native_types[index].get("kind")))
                != output.get("carrier")
                for index, output in enumerate(outputs)
            ):
                raise SessionError("generated v2 native types are not qualified")

            probe = cast(
                Any,
                _NativePort.prepare_probe(
                    self._session,
                    identity,
                    self._admitted,
                    self._reference,
                    correspondence=True,
                ),
            )
            async with self._session.open(identity, read_only=True) as native:
                observed = await _NativePort.drive_async(
                    self._session, native, probe.operation_steps()
                )
                _NativePort.check_principal(self._session, identity, observed)
                async with self._session.control_cursor(native) as description:
                    await description.execute(
                        bound.description_sql, bound.description_parameters
                    )
                    description_metadata = _check_native_description(
                        description, {"outputs": outputs}, native_types
                    )
                async with self._session.control_cursor(native) as result:
                    await result.execute(bound.sql, bound.parameters)
                    result_metadata = tuple(
                        (column[0], column[1]) for column in result.description
                    )
                    if result_metadata != description_metadata:
                        raise SessionError("native v2 read columns differ")
                    rows = await result.fetchall()

                terminal = bound.terminal
                if terminal == "count":
                    if len(rows) != 1 or len(rows[0]) != 1:
                        raise SessionError("native count scalar cardinality differs")
                    value = _NativePort.read_value(
                        rows[0][0], outputs[0], native_types[0], result_metadata[0][1]
                    )
                    if value is None or int(value["integerToken"]) < 0:
                        raise SessionError("native count scalar is invalid")
                    frame = {
                        "version": "umf.generated-read-result/2",
                        "kind": "scalar",
                        "terminal": "count",
                        "sourceDigest": bound.source_digest,
                        "module": call.module,
                        "record": call.record,
                        "value": value,
                    }
                elif terminal == "exists":
                    if len(rows) > 1 or any(len(row) != 1 for row in rows):
                        raise SessionError("native exists scalar cardinality differs")
                    if rows:
                        _NativePort.read_value(
                            rows[0][0],
                            outputs[0],
                            native_types[0],
                            result_metadata[0][1],
                        )
                    frame = {
                        "version": "umf.generated-read-result/2",
                        "kind": "scalar",
                        "terminal": "exists",
                        "sourceDigest": bound.source_digest,
                        "module": call.module,
                        "record": call.record,
                        "value": {"boolean": bool(rows)},
                    }
                else:
                    if terminal in {"one", "get"} and len(rows) != 1:
                        raise SessionError("native exact-one cardinality differs")
                    if terminal == "first" and len(rows) > 1:
                        raise SessionError("native first cardinality differs")
                    limit = bound.row_limit
                    if type(limit) is not int:
                        raise SessionError("generated all row limit is absent")
                    if terminal == "all" and len(rows) > limit:
                        raise SessionError("generated read row bound exceeded")
                    tagged_rows = [
                        [
                            _NativePort.read_value(value, output, native_type, oid)
                            for value, output, native_type, (_name, oid) in zip(
                                row, outputs, native_types, result_metadata, strict=True
                            )
                        ]
                        for row in rows
                    ]
                    frame = {
                        "version": "umf.generated-read-result/2",
                        "kind": "rows",
                        "terminal": terminal,
                        "sourceDigest": bound.source_digest,
                        "module": call.module,
                        "record": call.record,
                        "columns": [
                            {"field": dict(field), "output": dict(output)}
                            for field, output in zip(
                                bound.fields, bound.outputs, strict=True
                            )
                        ],
                        "rows": tagged_rows,
                        "cursor": None,
                    }
                _NativePort.bounded_size(
                    frame,
                    limit=cast(int, bound.native_read_guard["maxNativeBytes"]),
                )
            return {"schema": self.schema, "table": frame}
        except Exception as error:  # noqa: BLE001 -- sanitize native and artifact diagnostics
            code = self._error_code(error)
            if code == "INVALID" and isinstance(error, SessionError):
                code = _NativePort.reason_code(error)
            return {"schema": self.schema, "error": {"code": code}}

    @asynccontextmanager
    async def open_request(
        self,
        identity: SessionIdentity,
        scope: ExecutionScope,
        *,
        data_session: AsyncSession,
    ) -> AsyncIterator[GeneratedReadRequest]:
        """Hold distinct RC authority and RR data leases for a v4 request."""
        async with _open_generated_request(
            self, identity, scope, data_session
        ) as request:
            yield request

    async def execute_read_v3(
        self,
        call: object,
        *,
        identity: SessionIdentity,
        scope: ExecutionScope,
    ) -> dict[str, object]:
        """Execute a Rust-issued, server-byte-guarded composed read."""
        try:
            from umf_access_generated_executor import (
                BoundReadProgramV3,
                ExecutionScope,
                GeneratedExecutionError,
                GeneratedReadCallV2,
                canonical_json,
            )

            if type(scope) is ExecutionScope and scope.consistency not in (
                None,
                "statement",
            ):
                raise GeneratedExecutionError("UNSUPPORTED")
            self._session.policy.role(identity)
            if (
                self._executor.read_profile
                not in {
                    "weft.generated-read-algebra/3",
                    "weft.generated-read-algebra/4",
                    "weft.generated-read-algebra/5",
                    # V6 retains the closed V4 composed-read terminal schema;
                    # only the separately issued ordinary Page operation is new.
                    "weft.generated-read-algebra/6",
                    "weft.generated-read-algebra/7",
                    "weft.generated-read-algebra/8",
                }
                or type(call) is not GeneratedReadCallV2
                or type(scope) is not ExecutionScope
                or type(scope.principal) is not SessionIdentity
                or scope.principal != identity
                or not math.isfinite(scope.deadline_monotonic)
                or time.monotonic() >= scope.deadline_monotonic
            ):
                raise SessionError("generated v3 read scope differs")
            configuration = cast(
                Mapping[str, object], self._admitted.native_source["configuration"]
            )
            if call.module != self.module or configuration["module"] != call.module:
                raise SessionError("generated v3 read module differs")

            # The issued SQL and values are checked before observing a head or opening a lease.
            bound = self._executor.bind_read_v3(call, scope)
            if time.monotonic() >= scope.deadline_monotonic:
                raise SessionError("generated v3 read scope expired")
            if (
                type(bound) is not BoundReadProgramV3
                or bound.source_digest != self._admitted.source_digest
                or bound.target_digest != self._target.binding_digest
            ):
                raise SessionError("generated v3 binding provenance differs")
            program = _NativePort.loads(bound.program_json)
            if (
                type(program) is not dict
                or program.get("version") != "umf.generated-read-bound/3"
                or program.get("sql") != bound.sql
                or tuple(program.get("parameters", ())) != bound.parameters
                or program.get("descriptionSql") != bound.description_sql
                or canonical_json(program.get("outputs"))
                != canonical_json(bound.outputs)
                or canonical_json(program.get("fields")) != canonical_json(bound.fields)
                or canonical_json(program.get("obligations"))
                != canonical_json(bound.obligations)
                or canonical_json(program.get("nativeReadGuard"))
                != canonical_json(bound.native_read_guard)
                or program.get("terminal") != bound.terminal
                or program.get("resultKind") != bound.result_kind
                or program.get("cardinality") != bound.cardinality
                or program.get("effectiveRowLimit") != bound.row_limit
                or program.get("fetchLimit") != bound.fetch_limit
                or program.get("overflowCheck") != bound.overflow_check
                or canonical_json(program.get("scalarOutput"))
                != canonical_json(bound.scalar_output)
                or program.get("source", {}).get("modelSha256") != bound.source_digest
                or program.get("target", {}).get("bindingDigest") != bound.target_digest
                or bound.native_read_guard.get("profile")
                != "pg18-composed-native-frame/1"
            ):
                raise SessionError("unsupported generated v3 binding profile")

            scalar_output = bound.scalar_output
            if bound.result_kind == "scalar":
                if scalar_output is None or not isinstance(
                    scalar_output.get("nativeType"), Mapping
                ):
                    raise SessionError("generated v3 scalar native type is absent")
                native_types = (
                    cast(Mapping[str, object], scalar_output["nativeType"]),
                )
                outputs = (scalar_output,)
            else:
                native_types = _read_native_types(
                    self._admitted, call.module, call.record, program.get("fields")
                )
                outputs = bound.outputs
            native_carriers = {
                "boolean": "boolean",
                "text": "string",
                "varchar": "string",
                "char": "string",
                "int2": "integer",
                "int4": "integer",
                "int8": "integer",
                "numeric": "decimal",
                "date": "date",
                "timestamptz": "timestamp",
                "uuid": "uuid",
                "bytea": "bits128",
            }
            if len(native_types) != len(outputs) or any(
                type(native_types[index].get("kind")) is not str
                or native_carriers.get(cast(str, native_types[index].get("kind")))
                != output.get("carrier")
                for index, output in enumerate(outputs)
            ):
                raise SessionError("generated v3 native types are not qualified")

            ordinal_output: Mapping[str, object] = {
                "carrier": "integer",
                "name": "__weft_ordinal",
                "nullable": False,
            }
            described_outputs = (ordinal_output, *outputs)
            described_types = ({"kind": "int8"}, *native_types)
            probe = cast(
                Any,
                _NativePort.prepare_probe(
                    self._session,
                    identity,
                    self._admitted,
                    self._reference,
                    correspondence=True,
                ),
            )
            if probe.schema != self._session.policy.schema:
                raise SessionError("generated v3 probe schema differs")
            async with self._session.open(identity, read_only=True) as native:
                observed = await _NativePort.drive_async(
                    self._session, native, probe.operation_steps()
                )
                _NativePort.check_principal(self._session, identity, observed)
                async with self._session.control_cursor(native) as description:
                    await description.execute(
                        bound.description_sql, bound.description_parameters
                    )
                    description_metadata = _check_native_description(
                        description,
                        {"outputs": described_outputs},
                        described_types,
                    )
                async with self._session.control_cursor(native) as result:
                    await result.execute(bound.sql, bound.parameters)
                    result_metadata = tuple(
                        (column[0], column[1]) for column in result.description
                    )
                    if result_metadata != description_metadata:
                        raise SessionError("native v3 read columns differ")
                    rows = await result.fetchall()

                if len(rows) > bound.fetch_limit:
                    raise SessionError("generated v3 fetch bound exceeded")
                if (
                    bound.overflow_check
                    and type(bound.row_limit) is int
                    and len(rows) > bound.row_limit
                ):
                    raise GeneratedExecutionError("LIMIT_EXCEEDED")
                ordered_rows = []
                for ordinal, row in enumerate(rows, 1):
                    if (
                        len(row) != len(outputs) + 1
                        or type(row[0]) is not int
                        or row[0] != ordinal
                    ):
                        raise SessionError("generated v3 row ordinal differs")
                    ordered_rows.append(row[1:])

                terminal = bound.terminal
                if terminal in {"one", "get"} and len(rows) != 1:
                    raise SessionError(
                        "required row not found"
                        if not rows
                        else "native single-row cardinality exceeded"
                    )
                if terminal == "first" and len(rows) > 1:
                    raise SessionError("native first cardinality differs")
                if terminal == "exists" and len(rows) > 1:
                    raise SessionError("native exists cardinality differs")
                if terminal == "count" and len(rows) != 1:
                    raise SessionError("native count scalar cardinality differs")

                if terminal in {"count", "exists"}:
                    if terminal == "count":
                        value = _NativePort.read_value(
                            ordered_rows[0][0],
                            outputs[0],
                            native_types[0],
                            result_metadata[1][1],
                        )
                        if value is None or int(value["integerToken"]) < 0:
                            raise SessionError("native count scalar is invalid")
                    else:
                        if rows:
                            value = _NativePort.read_value(
                                ordered_rows[0][0],
                                outputs[0],
                                native_types[0],
                                result_metadata[1][1],
                            )
                            if value != {"boolean": True}:
                                raise SessionError("native exists scalar differs")
                        else:
                            value = {"boolean": False}
                    frame = {
                        "version": "umf.generated-read-result/2",
                        "kind": "scalar",
                        "terminal": terminal,
                        "sourceDigest": bound.source_digest,
                        "module": call.module,
                        "record": call.record,
                        "value": value,
                    }
                else:
                    tagged_rows = [
                        [
                            _NativePort.read_value(value, output, native_type, oid)
                            for value, output, native_type, (_name, oid) in zip(
                                row,
                                outputs,
                                native_types,
                                result_metadata[1:],
                                strict=True,
                            )
                        ]
                        for row in ordered_rows
                    ]
                    frame = {
                        "version": "umf.generated-read-result/2",
                        "kind": "rows",
                        "terminal": terminal,
                        "sourceDigest": bound.source_digest,
                        "module": call.module,
                        "record": call.record,
                        "columns": [
                            {"field": dict(field), "output": dict(output)}
                            for field, output in zip(
                                bound.fields, bound.outputs, strict=True
                            )
                        ],
                        "rows": tagged_rows,
                        "cursor": None,
                    }
                _NativePort.bounded_size(
                    frame,
                    limit=cast(int, bound.native_read_guard["maxNativeBytes"]),
                )
            return {"schema": self.schema, "table": frame}
        except Exception as error:  # noqa: BLE001 -- sanitize native and artifact diagnostics
            code = self._error_code(error)
            if code == "BUSY":
                code = _NativePort.reason_code(error)
            return {"schema": self.schema, "error": {"code": code}}

    async def execute_ordinary_page(
        self, call: object, *, identity: SessionIdentity, scope: ExecutionScope
    ) -> dict[str, object]:
        """Execute one verified ordinary Page/6 against the caller's live native head."""
        try:
            from umf_access_generated_executor import (
                ExecutionScope, GeneratedOrdinaryPageCall, GeneratedExecutionError,
                PreparedOrdinaryPage,
            )
            if (
                self.read_profile not in {"weft.generated-read-algebra/6", "weft.generated-read-algebra/7", "weft.generated-read-algebra/8"}
                or type(call) is not GeneratedOrdinaryPageCall
                or type(scope) is not ExecutionScope
                or type(identity) is not SessionIdentity
                or scope.principal != identity
                or scope.consistency not in (None, "statement")
                or not math.isfinite(scope.deadline_monotonic)
                or time.monotonic() >= scope.deadline_monotonic
            ):
                raise GeneratedExecutionError("UNSUPPORTED")
            page_call = cast(GeneratedOrdinaryPageCall, call)
            self._session.policy.role(identity)
            prepared = self._executor.prepare_ordinary_page(page_call)
            if type(prepared) is not PreparedOrdinaryPage:
                raise SessionError("ordinary Page preparation provenance differs")
            # Rebind immediately from the exact verified executor; caller SQL never
            # enters this method and the equality check detects mutation/drift.
            if self._executor.prepare_ordinary_page(page_call) != prepared:
                raise SessionError("ordinary Page issuer output changed")
            algebra = _NativePort.loads(self._executor.read_algebra_json)
            roots = algebra.get("roots") if isinstance(algebra, dict) else None
            root_value = roots.get(page_call.root_id) if isinstance(roots, Mapping) else None
            if not isinstance(root_value, Mapping):
                raise SessionError("ordinary Page root is not issued")
            root = cast(Mapping[str, object], root_value)
            support_value = root.get("ordinaryPage")
            support = support_value if isinstance(support_value, Mapping) else None
            if not isinstance(support, Mapping) or support.get("status") != "eligible":
                raise SessionError("ordinary Page root is not issued")
            escape = lambda value: value.replace("~", "~0").replace("/", "~1")
            if page_call.root_id != escape(cast(str, root["module"])) + "/" + escape(cast(str, root["record"])):
                raise SessionError("ordinary Page root identity differs")
            if root.get("module") != self.module:
                raise SessionError("ordinary Page root module differs")
            page = cast(Mapping[str, object], support["page"])
            key_descriptor = cast(Mapping[str, object], page["hiddenKeyOutput"])
            key_native = cast(Mapping[str, object], key_descriptor["nativeType"])
            output_by_id: dict[str, Mapping[str, object]] = {
                cast(str, item["fieldId"]): item
                for item in cast(tuple[Mapping[str, object], ...], page["fieldOutputs"])
            }
            selected_outputs = tuple(
                cast(Mapping[str, object], output_by_id[field_id]["output"])
                for field_id in page_call.selected_field_ids
            )
            selected_native_types = _read_native_types(
                self._admitted,
                cast(str, root["module"]),
                cast(str, root["record"]),
                tuple(
                    cast(Mapping[str, object], output_by_id[field_id]["sourceField"])
                    for field_id in page_call.selected_field_ids
                ),
            )
            ordinal = cast(Mapping[str, object], page["ordinalOutput"])
            described_outputs = (ordinal, key_descriptor, *selected_outputs)
            described_types = ({"kind": "int8"}, key_native, *selected_native_types)
            probe = _NativePort.prepare_probe(self._session, identity, self._admitted, self._reference, correspondence=True)
            if probe.schema != self._session.policy.schema:
                raise SessionError("ordinary Page probe schema differs")
            async with asyncio.timeout(max(0.001, scope.deadline_monotonic - time.monotonic())):
                async with self._session.open(identity, read_only=True) as native:
                    observed = await _NativePort.drive_async(self._session, native, probe.operation_steps())
                    _NativePort.check_principal(self._session, identity, observed)
                    native_settings = await _request_settings(self._session, native, identity)
                    async with self._session.control_cursor(native) as check:
                        await check.execute(prepared.collation_sql, prepared.collation_parameters)
                        collation_rows = await check.fetchall()
                    if len(collation_rows) != 1 or len(collation_rows[0]) != 3 or tuple(collation_rows[0]) != ("pg_catalog", "C", True):
                        raise SessionError("required native C collation is unavailable")
                    async with self._session.control_cursor(native) as result:
                        await result.execute(prepared.page_sql, prepared.page_parameters)
                        description = _check_native_description(result, {"outputs": described_outputs}, described_types)
                        rows = await result.fetchall()
                    if len(rows) > page_call.size + 1 or any(len(row) != len(described_outputs) or type(row[0]) is not int or row[0] != ordinal for ordinal, row in enumerate(rows, 1)):
                        raise SessionError("ordinary Page result bound or ordinal differs")
                    tagged_rows = []
                    for row in rows:
                        key_value = _NativePort.read_value(row[1], key_descriptor, key_native, description[1][1])
                        values = [_NativePort.read_value(value, output, native_type, description[index + 2][1]) for index, (value, output, native_type) in enumerate(zip(row[2:], selected_outputs, selected_native_types))]
                        tagged_rows.append({"ordinal": row[0], "key": key_value, "values": values})
                    observed_after = await _NativePort.drive_async(self._session, native, probe.operation_steps())
                    _NativePort.check_principal(self._session, identity, observed_after)
                    _same_request_authority(observed, observed_after)
                    await _request_settings(self._session, native, identity, native_settings)
            fields = tuple(
                {
                    "field": dict(cast(Mapping[str, object], output_by_id[field_id]["sourceField"])),
                    "output": dict(cast(Mapping[str, object], output_by_id[field_id]["output"])),
                }
                for field_id in page_call.selected_field_ids
            )
            fixed = cast(Mapping[str, object], cast(Mapping[str, object], support["continuation"])["fixed"])
            frame = {
                "version": "umf.generated-ordinary-page-result/1",
                "sourceDigest": self.schema,
                "targetBindingDigest": self.target_binding_digest,
                "artifactDigest": self.artifact_digest,
                "receiptDigest": self.receipt_digest,
                "algebraInventoryDigest": self.algebra_digest,
                "issuedProgramDigest": fixed["issuedProgramDigest"],
                "pageTemplateSha256": cast(Mapping[str, object], support["page"])["templateSha256"],
                "rootId": page_call.root_id,
                "size": page_call.size,
                "selectedFieldIds": list(page_call.selected_field_ids),
                "module": root["module"],
                "record": root["record"],
                "identityDigest": prepared.identity_digest.hex(),
                "fields": fields,
                "rows": tuple(tagged_rows),
            }
            _NativePort.bounded_size(frame, limit=8_388_608)
            return {"schema": self.schema, "table": frame}
        except Exception as error:  # noqa: BLE001 -- stable public error boundary
            code = self._error_code(error)
            try:
                from umf_access_generated_executor import GeneratedExecutionError
            except ImportError:
                GeneratedExecutionError = ()
            if isinstance(error, GeneratedExecutionError) and error.code == "UNSUPPORTED":
                code = "UNSUPPORTED"
            if isinstance(error, SessionError) and str(error) == "required native C collation is unavailable":
                code = "PRECONDITION_FAILED"
            if isinstance(error, SessionError) and str(error) in {
                "declared query result type differs",
                "native read carrier differs from its source type",
            }:
                code = "SCHEMA_MISMATCH"
            if code == "BUSY":
                code = _NativePort.reason_code(error)
            return {"schema": self.schema, "error": {"code": code}}

    def ordinary_page_identity(self, call: object) -> bytes:
        """Purely preflight Page/6 through this binding's verified executor."""
        from umf_access_generated_executor import GeneratedOrdinaryPageCall

        if self.read_profile not in {"weft.generated-read-algebra/6", "weft.generated-read-algebra/7", "weft.generated-read-algebra/8"} or type(call) is not GeneratedOrdinaryPageCall:
            raise GeneratedNativeError("UNSUPPORTED")
        try:
            return self._executor.prepare_ordinary_page(call).identity_digest
        except Exception as error:  # noqa: BLE001 -- fixed refusal boundary
            raise _generated_native_error(error) from None

    @property
    def ordinary_page_roots(self) -> tuple[GeneratedOrdinaryPageRoot, ...]:
        """Immutable eligible Page root projection from this admitted executor."""
        return self._executor.ordinary_page_roots

    def validate_ordinary_page_result(self, result: object, call: object) -> bool:
        """Purely validate a Page callback frame against fresh issuer preparation."""
        from .generated_page import valid_ordinary_page_result

        return valid_ordinary_page_result(result, call, self._executor)

    @property
    def joined_read_roots(self) -> tuple[GeneratedJoinedReadRoot, ...]:
        """Eligible root/Relationship pairs from this same verified executor."""
        return self._executor.joined_read_roots

    def joined_read_identity(self, call: object) -> str:
        """Purely preflight an issued joined call without acquiring a lease."""
        from umf_access_generated_executor import GeneratedJoinedReadCall

        if self.read_profile != "weft.generated-read-algebra/8" or type(call) is not GeneratedJoinedReadCall:
            raise GeneratedNativeError("UNSUPPORTED")
        try:
            return self._executor.prepare_joined_read(call).call_digest
        except Exception as error:  # noqa: BLE001 -- fixed public error boundary
            raise _generated_native_error(error) from None

    def validate_joined_read_result(self, result: object, call: object) -> bool:
        """Validate against fresh authoritative preparation of the original call."""
        from umf_access_generated_executor import GeneratedJoinedReadCall

        if self.read_profile != "weft.generated-read-algebra/8" or type(call) is not GeneratedJoinedReadCall:
            return False
        try:
            return self._executor.validate_joined_result(call, result)
        except Exception:  # noqa: BLE001 -- public boolean validation predicate
            return False

    async def execute_joined_read(self, call: object, *, identity: SessionIdentity, scope: ExecutionScope) -> dict[str, object]:
        """Execute one required-to-one inner join in an ordinary statement scope."""
        from .generated_join import execute_joined_read

        return await execute_joined_read(self, call, identity=identity, scope=scope)

    def _prepare(self, request, identity, scope):
        from umf_access_generated_executor import (
            BoundProgram,
            ExecutionScope,
            GeneratedCall,
        )

        self._session.policy.role(identity)
        if (
            type(scope) is not ExecutionScope
            or type(scope.principal) is not SessionIdentity
            or scope.principal != identity
            or not math.isfinite(scope.deadline_monotonic)
            or time.monotonic() >= scope.deadline_monotonic
        ):
            raise SessionError("generated execution scope differs")
        if (
            type(request) is not dict
            or set(request) != _REQUEST
            or request.get("contract") != "umf.access/1"
            or request.get("schema") != self.schema
            or request.get("kind") != "table"
            or request.get("module") != self.module
            or request.get("phase") != "invoke"
            or request.get("mutation") is not False
            or request.get("idempotency_key") is not None
        ):
            raise SessionError("invalid generated table request")
        operation = request.get("operation")
        if type(operation) is not str or self._operations.get(operation) != "query":
            raise SessionError("operation is not an admitted fixed query")
        call = request.get("call")
        if (
            type(call) is not dict
            or set(call) != {"kind", "inputs"}
            or call.get("kind") != "single"
            or type(call.get("inputs")) is not dict
        ):
            raise SessionError("fixed query call shape differs")
        probe = _NativePort.prepare_probe(
            self._session,
            identity,
            self._admitted,
            self._reference,
            correspondence=True,
        )
        generated_call = GeneratedCall(operation, call["inputs"])
        bound = self._executor.bind(generated_call, scope)
        if type(bound) is not BoundProgram or bound.operation_kind != "read":
            raise SessionError("generated query binding profile differs")
        program = _NativePort.loads(bound.program_json)
        if (
            type(program) is not dict
            or program.get("status") != "compiled"
            or program.get("version") != "weft.table-operation/0.1"
            or program.get("operation") != operation
            or program.get("module") != self.module
            or type(program.get("binding")) is not dict
            or program["binding"].get("modelSha256") != bound.source_digest
            or program.get("dbapiSql") != bound.sql
            or tuple(_NativePort.native_arguments(program)) != bound.parameters
            or bound.decoder != "umf.table-read-result/0.1"
            or program.get("transport")
            != {"profile": "dbapi-percent/0.1", "bindEmptyParameterTuple": True}
            or not _NativePort.supported_obligations(program.get("obligations"))
            or type(program.get("result")) is not dict
            or program["result"].get("kind") not in {"many", "one", "optional", "count"}
            or program["result"].get("nativeReadGuard") != _GUARD
        ):
            raise SessionError("unsupported generated query execution profile")
        if (
            bound.source_digest != self._admitted.source_digest
            or bound.target_digest != self._target.binding_digest
        ):
            raise SessionError("generated source or target pins differ")
        native_scope = {
            "module": self.module,
            "schema": probe.schema,
            "sourceDigest": bound.source_digest,
            "configurationDigest": self._admitted.configuration_digest,
            "bundleDigest": self._admitted.bundle_digest,
            "headDigest": self._reference["headDigest"],
            "referenceDigest": self._reference["referenceDigest"],
            "operation": operation,
            "target": self._target.id,
            "inputsDigest": _NativePort.digest(call["inputs"]),
            "requestedSize": None,
            "profile": "python-sorted-json/0.1",
        }
        if (
            type(program.get("nativeDescriptionSql")) is not str
            or type(program.get("outputs")) is not list
        ):
            raise SessionError("generated result decoder metadata differs")
        return (
            probe,
            program,
            native_scope,
            self._session.policy.cursor_secret(identity, self._cursor_secret),
        )

    @staticmethod
    def _error_code(error: Exception) -> str:
        try:
            from umf_access_generated_executor import GeneratedExecutionError
        except ImportError:
            GeneratedExecutionError = ()
        if isinstance(error, GeneratedExecutionError):
            return {
                "INVALID": "INVALID",
                "INVALID_CURSOR": "INVALID_CURSOR",
                "ARTIFACT_REFUSED": "SCHEMA_MISMATCH",
                "UNSUPPORTED": "INVALID",
                "LIMIT_EXCEEDED": "LIMIT_EXCEEDED",
            }[error.code]
        if isinstance(error, CatalogError):
            return "SCHEMA_MISMATCH"
        if isinstance(error, SessionError):
            if isinstance(error, GeneratedNativeError):
                return error.code
            if str(error) in {
                "generated execution scope differs",
                "invalid generated table request",
                "operation is not an admitted fixed query",
                "fixed query call shape differs",
            }:
                return "INVALID"
            return _NativePort.reason_code(error)
        return "BUSY"


@asynccontextmanager
async def _open_generated_request(
    binding: GeneratedNativeTableBinding,
    identity: SessionIdentity,
    scope: ExecutionScope,
    data_session: AsyncSession,
) -> AsyncIterator[GeneratedReadRequest]:
    from umf_access_generated_executor import ExecutionScope as _ExecutionScope

    session = binding._session
    if (
        type(session) is not AsyncSession
        or type(data_session) is not AsyncSession
        or session is data_session
        or data_session.factory is not session.factory
        or data_session.policy is not session.policy
        or session.transaction_owner != "adapter"
        or data_session.transaction_owner != "adapter"
    ):
        raise SessionError(
            "request snapshot requires two distinct adapter-owned sessions"
        )
    if (
        binding.read_profile
        not in {
            "weft.generated-read-algebra/4",
            "weft.generated-read-algebra/5",
            # V6's request/key-batch artifacts use the unchanged V4 frame and
            # native guard. This does not admit the V5 forward Relay profile.
            "weft.generated-read-algebra/6",
            "weft.generated-read-algebra/7",
            "weft.generated-read-algebra/8",
        }
        or type(identity) is not SessionIdentity
        or type(scope) is not _ExecutionScope
        or type(scope.principal) is not SessionIdentity
        or scope.principal != identity
        or scope.consistency != "request-snapshot/1"
        or type(scope.request_id) is not str
        or not scope.request_id
        or type(scope.lease_id) is not str
        or not scope.lease_id
        or not math.isfinite(scope.deadline_monotonic)
        or time.monotonic() >= scope.deadline_monotonic
    ):
        raise SessionError("generated request snapshot scope differs")
    session.policy.role(identity)
    probe = _NativePort.prepare_probe(
        session,
        identity,
        binding._admitted,
        binding._reference,
        correspondence=True,
    )
    if probe.schema != session.policy.schema:
        raise SessionError("generated request snapshot probe schema differs")
    request = GeneratedReadRequest(binding, data_session, identity, scope, probe)
    remaining = max(0.001, scope.deadline_monotonic - time.monotonic())
    try:
        async with asyncio.timeout(remaining):
            async with session.open(identity, read_only=True) as guard:
                authority = await _NativePort.drive_async(
                    session, guard, probe.operation_steps()
                )
                _NativePort.check_principal(session, identity, authority)
                guard_settings = await _request_settings(session, guard, identity)
                guard_pid = await _backend_pid(session, guard)
                async with _NativePort.open_request_snapshot(
                    data_session, identity
                ) as data:
                    data_pid = await _backend_pid(data_session, data)
                    if data_pid == guard_pid:
                        raise SessionError(
                            "request guard and data leases share a backend"
                        )
                    snapshot = await _NativePort.drive_async(
                        data_session, data, probe.snapshot_operation_steps()
                    )
                    _NativePort.check_principal(data_session, identity, snapshot)
                    _same_request_authority(authority, snapshot)
                    data_settings = await _request_settings(
                        data_session, data, identity
                    )
                    request._guard = guard
                    request._data = data
                    request._authority = authority
                    request._guard_settings = guard_settings
                    request._data_settings = data_settings
                    request._active = True
                    try:
                        await request._current_guard()
                        yield request
                    finally:
                        request._active = False
                        await _finish_request_cleanup(request._drain())
                    if request._failed:
                        raise request._failure or GeneratedNativeError("BUSY")
    except asyncio.CancelledError:
        raise
    except (SessionError, CatalogError, TimeoutError):
        raise
    except Exception:  # noqa: BLE001 -- sanitize unexpected driver/session diagnostics
        raise SessionError("generated request snapshot admission failed") from None

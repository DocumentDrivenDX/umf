# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native set-based bulk driver over the original action settlement machinery."""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import timedelta
from typing import Any, cast

from pydantic import TypeAdapter

from .bulk import AsyncAtomicBulkPlan, AtomicBulkPlan, BulkOutcome, BulkPreview
from .commands import CommandVariant
from .native_actions import (
    AsyncNativeAdmission,
    AsyncPostgresActionExecutor,
    NativeAdmission,
    PostgresActionExecutor,
    _State,
    native_input_value,
)
from .native_program import NativeProgram, canonical_json
from .protocols import (
    ActionConflict,
    ActionDenied,
    ActionIndeterminate,
    ActionRefused,
    ActionTimedOut,
    Committed,
    Conflict,
    Denied,
    Indeterminate,
    Receipt,
    TimedOut,
)
from .reviewed import validate_list_parameters
from .targets import AsyncPostgresTarget, PostgresConfiguration, PostgresTarget
from .types import ActionRef, StrictModel


def _validate_parameters(
    parameters: list[Any], inputs: Mapping[str, object], action_inputs: Mapping[str, str]
) -> None:
    """Check original parameter values without granting execution authority."""
    from decimal import Decimal

    carriers = {"string": str, "boolean": bool, "integer": int, "decimal": Decimal}
    validate_list_parameters(parameters, inputs)
    for parameter in parameters:
        if parameter.get("container") == "list":
            if parameter["name"] in action_inputs.values():
                raise ActionRefused("NATIVE_BULK_ACTION_INPUT_SCALAR")
            continue
        annotation = carriers[parameter["carrier"]]
        TypeAdapter(
            cast(Any, annotation | None if parameter["nullable"] else annotation)
        ).validate_python(inputs[parameter["name"]], strict=True)


def _bulk_input_value(value: object) -> Any:
    """Retain bounded selection lists; action scalar conversion stays unchanged."""
    return (
        [native_input_value(item) for item in value]
        if type(value) is list
        else native_input_value(value)
    )


class _BulkState(_State):
    def __init__(
        self,
        action: ActionRef[Any, Any],
        program: NativeProgram,
        inputs: Mapping[str, object],
        preview: bool,
    ):
        program.bind(action)
        self.action, self.program, self.inputs = action, program.checked(), dict(inputs)
        if (
            self.program["profile"] != "umf.actions.native-bulk/0.1"
            or action.source is None
            or self.program["source"]["action"] != action.action
            or self.program["source"]["module"] != action.module
            or self.program["source"]["documentSha256"] != action.source.document_sha256
            or getattr(action.input_type, "UMF_BUNDLE_INPUT_DIGEST", None)
            != program.bundle_input_digest
        ):
            raise ActionRefused("NATIVE_BULK_SOURCE_MISMATCH")
        parameters = self.program["parameters"]
        if set(inputs) != {p["name"] for p in parameters}:
            raise ActionRefused("NATIVE_BULK_PARAMETER_INVENTORY")
        _validate_parameters(parameters, inputs, self.program["actionInputs"])
        # Mutation inputs use their original generated Field validators, including
        # constraints, rather than only the SQL scalar carrier.
        for source, name in self.program["actionInputs"].items():
            python_name = next(
                python for original, python in action.input_fields if original == source
            )
            field = action.input_type.model_fields[python_name]
            from typing import Annotated

            TypeAdapter(
                cast(
                    Any,
                    Annotated[(field.annotation, *field.metadata)]
                    if field.metadata
                    else field.annotation,
                )
            ).validate_python(inputs[name], strict=True)
        self.statements = json.loads(program.statements_json)
        self.pre = {}
        self.post = {}
        self.scope = None
        self.receipt = None
        self.markers = []
        self.verification = []
        self.changes = []
        self.parameters = dict(inputs)
        self.request = canonical_json(
            {
                "program": self.program,
                "inputDigest": program.bundle_input_digest,
                "parameters": {
                    name: _bulk_input_value(value)
                    for name, value in self.inputs.items()
                },
            }
        )
        if len(self.request.encode()) > 4_194_304:
            raise ActionRefused("NATIVE_REQUEST_BUDGET")
        self.rows: list[Any] = []
        self.read_only = preview

    def resolve(self, source: Any) -> Any:
        if "bulkInput" in source:
            return self.inputs[source["bulkInput"]]
        if "bulkKeys" in source:
            field = self.program["entity"]["key"]["fields"][source["bulkKeys"]][
                "reference"
            ]
            index = next(
                i
                for i, f in enumerate(self.program["selectionFields"])
                if f["reference"] == field
            )
            return [row[index] for row in self.rows]
        return super().resolve(source)

    def decode_key(self, values: tuple[Any, ...]) -> StrictModel:
        ref = self.program["entity"]["key"]["reference"]
        model = next(
            k.model
            for k in self.action.key_types
            if (k.module, k.element, k.key)
            == (ref["module"], ref["element"], ref["key"])
        )
        fields = self.program["entity"]["key"]["fields"]
        by_ref = {
            (f["reference"]["module"], f["reference"]["element"]): value
            for f, value in zip(fields, values, strict=True)
        }
        return model.model_validate(
            {
                name: by_ref[(module, element)]
                for module, element, name in model.UMF_FIELDS
            },
            strict=True,
        )

    def execute(self, validate: bool):
        rows = yield ("query", *self.statement("/admission"))
        if len(rows) != 1 or len(rows[0]) != 4 or self.scope is None:
            raise ActionRefused("NATIVE_BULK_ADMISSION_MARKER")
        allowed, authenticated, effective, xid = rows[0]
        if (
            (authenticated, effective)
            != (self.scope.authenticated, self.scope.effective)
            or type(xid) is not str
            or not xid.isdecimal()
        ):
            raise ActionRefused("NATIVE_SESSION_CHANGED")
        self.receipt = Receipt(self.scope.store, self.scope.epoch, xid)
        if allowed is not True:
            yield ("rollback",)
            return Denied("ROLE_DENIED", self.details("rolled-back"))
        if not self.read_only:
            for sql in self.program["lockSql"]:
                yield ("query", sql, None)
        yield from self.schema_admissions()
        self.rows = yield (
            "query",
            *self.statement("/preview" if self.read_only else "/selection"),
            self.program["maxItems"] + 2,
        )
        if len(self.rows) > self.program["maxItems"]:
            raise ActionRefused("BULK_LIMIT")
        fields = self.program["selectionFields"]
        entity = self.program["entity"]
        positions = [
            next(i for i, f in enumerate(fields) if f["reference"] == k["reference"])
            for k in entity["key"]["fields"]
        ]
        keys = tuple(
            self.decode_key(tuple(row[i] for i in positions)) for row in self.rows
        )
        if len({key.model_dump_json() for key in keys}) != len(keys):
            raise ActionRefused("NATIVE_BULK_DUPLICATE_KEY")
        for row in self.rows:
            if len(row) != len(fields):
                raise ActionRefused("NATIVE_BULK_ROW_SHAPE")
        if self.read_only:
            yield from self.schema_admissions()
            yield ("rollback",)
            return BulkPreview(
                keys, "one bounded source-bound native SET; preview is advisory"
            )
        expected = 0
        for row in self.rows:
            different = False
            for field, value in self.program["values"]:
                index = next(
                    i
                    for i, f in enumerate(fields)
                    if f["reference"] == field["reference"]
                )
                source = (
                    {"bulkInput": self.program["actionInputs"][value["input"]]}
                    if "input" in value
                    else value
                )
                different = different or row[index] != self.resolve(source)
            if different:
                expected += 1
        changed = yield (
            "query",
            *self.statement("/update"),
            self.program["maxItems"] + 1,
        )
        if len(changed) != expected:
            raise ActionDenied("NATIVE_BULK_EFFECT_DENIED", self.details("pending"))
        returned = tuple(self.decode_key(tuple(row)) for row in changed)
        if len({key.model_dump_json() for key in returned}) != len(returned) or any(
            key not in keys for key in returned
        ):
            raise ActionRefused("NATIVE_BULK_RETURNED_KEY")
        self.markers = [{"selected": len(keys), "changed": len(returned)}]
        self.changes = [
            {"kind": "updated", "key": key.model_dump_json()} for key in returned
        ]
        details = self.details("committed")
        result = Committed(
            BulkOutcome(len(keys), len(returned), self.receipt, details),
            self.receipt,
            (),
            returned,
            details,
        )
        yield from self.schema_admissions()
        yield ("commit", result)
        return result


class _Driver(PostgresActionExecutor):
    def __init__(
        self,
        connection: Any,
        program: NativeProgram,
        action: ActionRef[Any, Any],
        inputs: Mapping[str, object],
        admission: NativeAdmission,
        default_timeout: timedelta,
        reconnect: Any,
    ):
        super().__init__(
            connection,
            (program,),
            admission,
            default_timeout=default_timeout,
            reconnect=reconnect,
        )
        self.action, self.program, self.inputs, self.preview_mode = (
            action,
            program,
            dict(inputs),
            False,
        )

    def _state(
        self, action: ActionRef[Any, Any], inputs: Mapping[str, object]
    ) -> _BulkState:
        if self.quarantined:
            raise ActionRefused("NATIVE_CONNECTION_QUARANTINED")
        return _BulkState(self.action, self.program, self.inputs, self.preview_mode)

    def preview(self, *, timeout: timedelta | None = None) -> BulkPreview:
        self.preview_mode = True
        try:
            result = self._run(self.action, {}, timeout, True)
        finally:
            self.preview_mode = False
        if isinstance(result, BulkPreview):
            return result
        if isinstance(result, Denied):
            raise ActionDenied(result.code, result.original)
        if isinstance(result, TimedOut):
            raise ActionTimedOut("TIMED_OUT", result.original)
        if isinstance(result, Indeterminate):
            raise ActionIndeterminate("INDETERMINATE", result.original)
        if isinstance(result, Conflict):
            raise ActionConflict(result.code, result.retained, result.original)
        raise ActionRefused("NATIVE_BULK_PREVIEW_FAILED")

    def execute(self, *, timeout: timedelta | None = None) -> BulkOutcome:
        result = self._run(self.action, {}, timeout, False)
        if isinstance(result, Committed) and isinstance(result.output, BulkOutcome):
            return result.output
        if isinstance(result, Denied):
            raise ActionDenied(result.code, result.original)
        if isinstance(result, Conflict):
            raise ActionConflict(result.code, result.retained, result.original)
        if isinstance(result, TimedOut):
            raise ActionTimedOut("TIMED_OUT", result.original)
        if isinstance(result, Indeterminate):
            raise ActionIndeterminate("INDETERMINATE", result.original)
        raise ActionRefused("NATIVE_BULK_OUTCOME")


def native_bulk_plan(
    connection: Any,
    program: NativeProgram,
    action: ActionRef[Any, Any],
    inputs: Mapping[str, object],
    admission: NativeAdmission,
    *,
    default_timeout: timedelta,
    reconnect: Any = None,
) -> AtomicBulkPlan:
    return AtomicBulkPlan(
        _Driver(
            connection, program, action, inputs, admission, default_timeout, reconnect
        )
    )


class _AsyncDriver(AsyncPostgresActionExecutor):
    def __init__(
        self,
        connection: Any,
        program: NativeProgram,
        action: ActionRef[Any, Any],
        inputs: Mapping[str, object],
        admission: AsyncNativeAdmission,
        default_timeout: timedelta,
        reconnect: Any,
    ):
        super().__init__(
            connection,
            (program,),
            admission,
            default_timeout=default_timeout,
            reconnect=reconnect,
        )
        self.action, self.program, self.inputs, self.preview_mode = (
            action,
            program,
            dict(inputs),
            False,
        )

    def _state(
        self, action: ActionRef[Any, Any], inputs: Mapping[str, object]
    ) -> _BulkState:
        if self.quarantined:
            raise ActionRefused("NATIVE_CONNECTION_QUARANTINED")
        return _BulkState(self.action, self.program, self.inputs, self.preview_mode)

    async def preview(self, *, timeout: timedelta | None = None) -> BulkPreview:
        self.preview_mode = True
        try:
            result = await self._run(self.action, {}, timeout, True)
        finally:
            self.preview_mode = False
        if isinstance(result, BulkPreview):
            return result
        if isinstance(result, Denied):
            raise ActionDenied(result.code, result.original)
        if isinstance(result, TimedOut):
            raise ActionTimedOut("TIMED_OUT", result.original)
        if isinstance(result, Indeterminate):
            raise ActionIndeterminate("INDETERMINATE", result.original)
        if isinstance(result, Conflict):
            raise ActionConflict(result.code, result.retained, result.original)
        raise ActionRefused("NATIVE_BULK_PREVIEW_FAILED")

    async def execute(self, *, timeout: timedelta | None = None) -> BulkOutcome:
        result = await self._run(self.action, {}, timeout, False)
        if isinstance(result, Committed) and isinstance(result.output, BulkOutcome):
            return result.output
        if isinstance(result, Denied):
            raise ActionDenied(result.code, result.original)
        if isinstance(result, Conflict):
            raise ActionConflict(result.code, result.retained, result.original)
        if isinstance(result, TimedOut):
            raise ActionTimedOut("TIMED_OUT", result.original)
        if isinstance(result, Indeterminate):
            raise ActionIndeterminate("INDETERMINATE", result.original)
        raise ActionRefused("NATIVE_BULK_OUTCOME")


def native_bulk_plan_async(
    connection: Any,
    program: NativeProgram,
    action: ActionRef[Any, Any],
    inputs: Mapping[str, object],
    admission: AsyncNativeAdmission,
    *,
    default_timeout: timedelta,
    reconnect: Any = None,
) -> AsyncAtomicBulkPlan:
    return AsyncAtomicBulkPlan(
        _AsyncDriver(
            connection, program, action, inputs, admission, default_timeout, reconnect
        )
    )


class PostgresBulkTarget(PostgresTarget):
    def __init__(
        self,
        connection: Any,
        configuration: PostgresConfiguration,
        admission: NativeAdmission,
        *,
        reconnect: Any = None,
    ):
        super().__init__(connection, configuration)
        self.admission, self.reconnect = admission, reconnect

    def plan(
        self,
        entry: CommandVariant,
        params: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> AtomicBulkPlan:
        from .targets import _milliseconds

        _milliseconds(timeout, self.configuration.default_timeout)
        if not entry.pin.matches(self.identity()):
            raise ActionRefused("NOT_COMPILED_FOR_TARGET")
        return native_bulk_plan(
            self.connection,
            entry.program,
            entry.action,
            params,
            self.admission,
            default_timeout=self.configuration.default_timeout
            if timeout is None
            else timeout,
            reconnect=self.reconnect,
        )


class AsyncPostgresBulkTarget(AsyncPostgresTarget):
    def __init__(
        self,
        connection: Any,
        configuration: PostgresConfiguration,
        admission: AsyncNativeAdmission,
        *,
        reconnect: Any = None,
    ):
        super().__init__(connection, configuration)
        self.admission, self.reconnect = admission, reconnect

    async def plan(
        self,
        entry: CommandVariant,
        params: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> AsyncAtomicBulkPlan:
        from .targets import _milliseconds

        _milliseconds(timeout, self.configuration.default_timeout)
        if not entry.pin.matches(self.identity()):
            raise ActionRefused("NOT_COMPILED_FOR_TARGET")
        return native_bulk_plan_async(
            self.connection,
            entry.program,
            entry.action,
            params,
            self.admission,
            default_timeout=self.configuration.default_timeout
            if timeout is None
            else timeout,
            reconnect=self.reconnect,
        )


class LakebaseBulkTarget(PostgresBulkTarget):
    kind = "lakebase"
    profile = "lakebase18"


class AsyncLakebaseBulkTarget(AsyncPostgresBulkTarget):
    kind = "lakebase"
    profile = "lakebase18"

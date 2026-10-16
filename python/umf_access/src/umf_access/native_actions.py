"""Source-bound native statement execution. Weft owns all business SQL.

The host admission port owns the original native deployment/authority fence and
writer incarnation. A descriptor is never authentication or a fence credential.
"""

from __future__ import annotations

import contextlib
import json
import math
import time
from collections.abc import Callable, Generator, Mapping
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Any, Protocol, cast

from .native_program import NativeProgram
from .native_program import canonical_json as _json
from .protocols import (
    ActionDenied,
    ActionFailed,
    ActionOutcome,
    ActionRefused,
    Committed,
    Conflict,
    Denied,
    Indeterminate,
    NativeOutcomeDetails,
    Receipt,
    Rejected,
    TimedOut,
    ValidationFailure,
    ValidationResult,
)
from .types import ActionRef, StrictModel


@dataclass(frozen=True)
class NativeScope:
    store: str
    epoch: str
    authenticated: str
    effective: str
    custody: object
    attribution_json: str | None = None

    def __post_init__(self) -> None:
        if any(
            type(v) is not str or not v
            for v in (self.store, self.epoch, self.authenticated, self.effective)
        ):
            raise ActionRefused("ORIGINAL_NATIVE_SCOPE_REQUIRED")


class NativeAdmission(Protocol):
    def admit(
        self, connection: Any, program: Mapping[str, Any], *, deadline: float
    ) -> NativeScope: ...
    def reconnect(
        self, connection: Any, original: NativeScope, *, deadline: float
    ) -> NativeScope: ...
    def quarantine(self, connection: Any, original: NativeScope | None) -> None: ...


def _literal(value: Any) -> Any:
    if value is None:
        return None
    if not isinstance(value, dict) or len(value) != 1:
        raise ActionRefused("NATIVE_LITERAL")
    key, item = next(iter(value.items()))
    if key in ("string", "boolean"):
        return item
    if key == "integerToken":
        return int(item)
    if key == "decimalToken":
        return Decimal(item)
    raise ActionRefused("NATIVE_LITERAL")


def _field_key(reference: Any) -> str:
    return _json([reference["module"], reference["element"]])


def native_input_value(value: object) -> Any:
    if value is None:
        return None
    if type(value) is bool:
        return {"boolean": value}
    if type(value) is str:
        return {"string": value}
    if type(value) is int:
        return {"integerToken": str(value)}
    if isinstance(value, Decimal):
        return {"decimalToken": str(value)}
    if isinstance(value, StrictModel) and getattr(type(value), "UMF_KEY", False):
        return {
            "key": dict(type(value).KEY_IDENTITY),
            "components": [
                {
                    "field": {"module": module, "element": field},
                    "value": native_input_value(getattr(value, name)),
                }
                for module, field, name in type(value).UMF_FIELDS
            ],
        }
    raise ActionRefused("NATIVE_INPUT_CARRIER")


class _State:
    def __init__(
        self,
        action: ActionRef[Any, Any],
        program: NativeProgram,
        inputs: Mapping[str, object],
    ):
        from .codec_support import revalidate_model

        program.bind(action)
        checked = revalidate_model(
            action.input_type,
            action.input_type.model_validate(dict(inputs), strict=True),
        )
        self.action, self.program, self.inputs = (
            action,
            program.checked(),
            dict(checked),
        )
        if (
            getattr(action.input_type, "UMF_BUNDLE_INPUT_DIGEST", None)
            != program.bundle_input_digest
        ):
            raise ActionRefused("CATALOG_STALE")
        self.statements = json.loads(program.statements_json)
        self.pre: dict[str, Any] = {}
        self.post: dict[str, Any] = {}
        self.scope: NativeScope | None = None
        self.receipt: Receipt | None = None
        self.markers: list[Any] = []
        self.verification: list[Any] = []
        self.changes: list[Any] = []
        self.request = _json(
            {
                "program": self.program,
                "inputDigest": program.bundle_input_digest,
                "parameters": {
                    name: native_input_value(value)
                    for name, value in self.inputs.items()
                },
            }
        )
        if len(self.request.encode()) > 4_194_304:
            raise ActionRefused("NATIVE_REQUEST_BUDGET")
        if action.source is None:
            raise ActionRefused("ACTION_SOURCE_REQUIRED")
        source = self.program["source"]
        for name, attribute in [
            ("documentId", "document_id"),
            ("coreVersion", "core_version"),
            ("module", "module"),
            ("action", "action"),
            ("documentSha256", "document_sha256"),
            ("actionPointer", "action_pointer"),
        ]:
            if source[name] != getattr(action.source, attribute):
                raise ActionRefused("NATIVE_ACTION_SOURCE_MISMATCH")
        self.parameters = {
            source: self.inputs[name]
            for source, name in action.input_fields
            if name in self.inputs
        }
        if set(self.parameters) != {
            p["id"] for p in self.program["action"]["parameters"]
        }:
            raise ActionRefused("NATIVE_INPUT_INVENTORY")

    def resolve(self, source: Any) -> Any:
        if "input" in source:
            return self.parameters[source["input"]]
        if "entity" in source:
            entity = self.parameters[source["entity"]]
            ref = next(
                p["target"]
                for p in self.program["action"]["parameters"]
                if p["id"] == source["entity"]
            )
            key = next(
                k
                for k in self.action.key_types
                if k.module == ref["module"]
                and k.element == ref["element"]
                and k.key == ref["key"]
            )
            if type(entity) is not key.model:
                raise ActionRefused("NATIVE_NOMINAL_KEY")
            field = next(
                v
                for v in self.program["entities"].values()
                if v["key"]["reference"] == ref
            )["key"]["fields"][source["component"]]["reference"]
            name = next(
                name
                for module, element, name in key.model.UMF_FIELDS
                if (module, element) == (field["module"], field["element"])
            )
            return getattr(entity, name)
        if "literal" in source:
            return _literal(source["literal"])
        if "nativeRole" in source:
            return source["nativeRole"]
        if "snapshotExists" in source:
            return (self.pre if source["snapshotExists"] == "pre" else self.post)[
                source["image"]
            ] is not None
        if "snapshot" in source:
            row = (self.pre if source["snapshot"] == "pre" else self.post)[
                source["image"]
            ]
            return None if row is None else row[_field_key(source["field"])]
        raise ActionRefused("NATIVE_BINDING_SOURCE")

    def statement(self, path: str) -> tuple[str, tuple[Any, ...]]:
        value: Any = self.program
        for part in path.strip("/").split("/"):
            value = value[int(part)] if isinstance(value, list) else value[part]
        slots = [self.resolve(p["source"]) for p in value["parameters"]]
        bound = self.statements[path]
        return bound["sql"], tuple(slots[i] for i in bound["order"])

    def details(self, transaction: str) -> NativeOutcomeDetails:
        return NativeOutcomeDetails(
            self.action,
            self.program["profile"],
            _json(self.markers),
            not self.changes if transaction == "committed" else None,
            _json(self.verification),
            _json(self.changes),
            None
            if self.scope is None
            else self.scope.attribution_json
            if self.scope.attribution_json is not None
            else _json(
                {
                    "authenticated": self.scope.authenticated,
                    "effective": self.scope.effective,
                }
            ),
            self.receipt,
            _json({"state": transaction}),
            self.request,
            self.scope,
        )

    def key(self, entity: Any) -> StrictModel:
        ref = entity["key"]["reference"]
        key_type = next(
            k.model
            for k in self.action.key_types
            if (k.module, k.element, k.key)
            == (ref["module"], ref["element"], ref["key"])
        )
        # Explicit source Field mapping, never a guessed primary Key/order.
        values = {
            _field_key(f["reference"]): self.resolve(v)
            for f, v in zip(entity["key"]["fields"], entity["components"], strict=True)
        }
        mapping = key_type.UMF_FIELDS
        return key_type.model_validate(
            {name: values[_json([module, field])] for module, field, name in mapping},
            strict=True,
        )

    def images(self, phase: str) -> Generator[Any, Any, None]:
        target = self.pre if phase == "pre" else self.post
        for index, image in enumerate(
            self.program["preImages" if phase == "pre" else "postImages"]
        ):
            rows = yield (
                "query",
                *self.statement(
                    "/"
                    + ("preImages" if phase == "pre" else "postImages")
                    + "/"
                    + str(index)
                    + "/statement"
                ),
            )
            if len(rows) > 1:
                raise ActionRefused("NATIVE_KEY_CARDINALITY")
            if rows:
                from typing import Annotated

                from pydantic import TypeAdapter

                for f, value in zip(image["columns"], rows[0], strict=True):
                    record = next(
                        r.model
                        for r in self.action.record_types
                        if any(
                            (module, element)
                            == (f["reference"]["module"], f["reference"]["element"])
                            for module, element, _ in r.model.UMF_FIELDS
                        )
                    )
                    name = next(
                        name
                        for module, element, name in record.UMF_FIELDS
                        if (module, element)
                        == (f["reference"]["module"], f["reference"]["element"])
                    )
                    field = record.model_fields[name]
                    TypeAdapter(
                        cast(
                            Any,
                            Annotated[tuple([field.annotation, *field.metadata])]
                            if field.metadata
                            else field.annotation,
                        )
                    ).validate_python(value, strict=True)
            target[image["name"]] = (
                None
                if not rows
                else {
                    _field_key(f["reference"]): value
                    for f, value in zip(image["columns"], rows[0], strict=True)
                }
            )

    def conditions(
        self, phase: str, *, collect_all: bool = False
    ) -> Generator[Any, Any, list[ValidationFailure]]:
        failures = []
        for index, condition in enumerate(self.program[phase + "conditions"]):
            rows = yield (
                "query",
                *self.statement(
                    "/" + phase + "conditions/" + str(index) + "/statement"
                ),
            )
            if len(rows) != 1 or len(rows[0]) != 2:
                raise ActionRefused("NATIVE_CONDITION_MARKER")
            error, passed = rows[0]
            if type(error) is not bool or type(passed) is not bool:
                raise ActionRefused("NATIVE_CONDITION_MARKER")
            self.verification.append(
                {
                    "phase": phase,
                    "id": condition["id"],
                    "evaluationError": error,
                    "passed": passed,
                }
            )
            if error:
                raise ActionFailed(
                    "RULE_EVALUATION",
                    ValueError("native rule evaluation error"),
                    self.details("pending"),
                )
            if not passed:
                failures.append(ValidationFailure(condition["code"]))
                if not collect_all:
                    break
        return failures

    def execute(
        self, validate: bool
    ) -> Generator[Any, Any, ActionOutcome | ValidationResult]:
        rows = yield ("query", *self.statement("/admission"))
        if len(rows) != 1 or len(rows[0]) != 4:
            raise ActionRefused("NATIVE_ADMISSION_MARKER")
        allowed, authenticated, effective, xid = rows[0]
        if self.scope is None or (authenticated, effective) != (
            self.scope.authenticated,
            self.scope.effective,
        ):
            raise ActionRefused("NATIVE_SESSION_CHANGED")
        if not isinstance(xid, str) or not xid.isdecimal():
            raise ActionRefused("NATIVE_XID8")
        self.receipt = Receipt(self.scope.store, self.scope.epoch, xid)
        if allowed is not True:
            yield ("rollback",)
            return (
                ValidationResult(False, (ValidationFailure("ROLE_DENIED"),), True)
                if validate
                else Denied("ROLE_DENIED", self.details("rolled-back"))
            )
        for sql in self.program["lockSql"]:
            yield ("query", sql, None)
        yield from self.images("pre")
        missing = [
            name
            for name, entity in self.program["entities"].items()
            if entity["requiredExisting"] and self.pre["entity:" + name] is None
        ]
        failures = (
            [ValidationFailure("ENTITY_MISSING")]
            if missing
            else (yield from self.conditions("pre", collect_all=validate))
        )
        if failures or validate:
            yield ("rollback",)
            if validate:
                return ValidationResult(
                    not failures,
                    tuple(failures),
                    not missing or not self.program["preconditions"],
                )
            condition = next(
                (
                    c
                    for c in self.program["preconditions"]
                    if c["code"] == failures[0].code
                ),
                None,
            )
            return Rejected(
                failures[0].code,
                False if condition is None else condition["retryable"],
                self.details("rolled-back"),
            )
        for index, effect in enumerate(self.program["effects"]):
            if effect["guard"] is not None:
                guard = yield (
                    "query",
                    *self.statement("/effects/" + str(index) + "/guard"),
                )
                if not guard:
                    raise ActionFailed(
                        "ENTITY_MISSING",
                        ValueError("effect entity unavailable"),
                        self.details("pending"),
                    )
                if len(guard) != 1 or type(guard[0][0]) is not bool:
                    raise ActionRefused("NATIVE_EFFECT_MARKER")
                if guard[0][0] is False:
                    self.markers.append({"id": effect["id"], "changed": False})
                    continue
            rows = yield (
                "query",
                *self.statement("/effects/" + str(index) + "/statement"),
            )
            if not rows:
                raise ActionDenied("NATIVE_EFFECT_DENIED", self.details("pending"))
            if len(rows) != 1:
                raise ActionRefused("NATIVE_EFFECT_CARDINALITY")
            expected = tuple(self.resolve(v) for v in effect["entity"]["components"])
            if tuple(rows[0]) != expected:
                raise ActionRefused("NATIVE_EFFECT_KEY_MISMATCH")
            self.markers.append({"id": effect["id"], "changed": True})
        yield from self.images("post")
        failures = yield from self.conditions("post")
        if failures:
            raise ActionFailed(
                "POSTCONDITION_" + failures[0].code,
                ValueError("native postcondition failed"),
                self.details("pending"),
            )
        created: list[StrictModel] = []
        changed: list[StrictModel] = []
        combined: dict[str, Any] = {}
        for index, effect in enumerate(self.program["effects"]):
            identity = _json(
                [
                    effect["entity"]["key"]["reference"],
                    [
                        {"carrier": f["carrier"], "value": str(self.resolve(v))}
                        for f, v in zip(
                            effect["entity"]["key"]["fields"],
                            effect["entity"]["components"],
                            strict=True,
                        )
                    ],
                ]
            )
            before, after = (
                self.pre["effect:" + str(index)],
                self.post["effect:" + str(index)],
            )
            if identity not in combined:
                combined[identity] = {
                    "entity": effect["entity"],
                    "before": None if before is None else {},
                    "after": None if after is None else {},
                }
            net = combined[identity]
            for phase, row in (("before", before), ("after", after)):
                if (net[phase] is None) != (row is None):
                    raise ActionRefused("NATIVE_ENTITY_IMAGE_DISAGREEMENT")
                if row is not None:
                    net[phase].update(row)
        for identity, net in combined.items():
            before, after = net["before"], net["after"]
            if before == after:
                continue
            key = self.key(net["entity"])
            kind = (
                "created"
                if before is None and after is not None
                else "deleted"
                if after is None
                else "updated"
            )
            self.changes.append({"kind": kind, "key": identity})
            if kind == "created":
                created.append(key)
            elif kind == "updated":
                changed.append(key)
        result: Committed[object] = Committed(
            None,
            self.receipt,
            tuple(created),
            tuple(changed),
            self.details("committed"),
        )
        yield ("commit", result)
        return result


class PostgresActionExecutor:
    """One caller-owned idle connection, no retry, explicit host fence/custody."""

    def __init__(
        self,
        connection: Any,
        programs: tuple[NativeProgram, ...],
        admission: NativeAdmission,
        *,
        default_timeout: timedelta,
        reconnect: Callable[[], Any] | None = None,
    ):
        if (
            type(default_timeout) is not timedelta
            or not 0 < default_timeout.total_seconds() < 2_147_483
        ):
            raise ActionRefused("FINITE_DEFAULT_TIMEOUT_REQUIRED")
        (
            self.connection,
            self.programs,
            self.admission,
            self.default_timeout,
            self.reconnect,
        ) = connection, programs, admission, default_timeout, reconnect
        self.quarantined = False

    def _state(
        self, action: ActionRef[Any, Any], inputs: Mapping[str, object]
    ) -> _State:
        if self.quarantined:
            raise ActionRefused("NATIVE_CONNECTION_QUARANTINED")
        matching = [
            p
            for p in self.programs
            if p.checked()["source"]["documentSha256"]
            == getattr(action.source, "document_sha256", None)
            and p.checked()["source"]["action"] == action.action
        ]
        if len(matching) != 1:
            raise ActionRefused("NATIVE_ACTION_NOT_COMPILED")
        if matching[0].checked().get("profile") != "umf.actions.native-sql/0.1":
            raise ActionRefused("POSTGRESQL_NATIVE_PROFILE_REQUIRED")
        return _State(action, matching[0], inputs)

    def _quarantine(self, state: _State) -> Indeterminate:
        self.quarantined = True
        with contextlib.suppress(BaseException):
            self.admission.quarantine(self.connection, state.scope)
        return Indeterminate(state.details("indeterminate"))

    def _run(
        self,
        action: ActionRef[Any, Any],
        inputs: Mapping[str, object],
        timeout: timedelta | None,
        validate: bool,
    ) -> ActionOutcome | ValidationResult:
        state = self._state(action, inputs)
        duration = self.default_timeout if timeout is None else timeout
        if (
            type(duration) is not timedelta
            or not math.isfinite(duration.total_seconds())
            or duration.total_seconds() <= 0
        ):
            raise ActionRefused("DEADLINE_EXPIRED")
        deadline = time.monotonic() + duration.total_seconds()
        began = False
        committed: Committed[Any] | None = None
        if self.connection.info.transaction_status != 0:
            raise ActionRefused("IDLE_CONNECTION_REQUIRED")
        try:
            self.connection.execute(
                "BEGIN ISOLATION LEVEL SERIALIZABLE"
                + (" READ ONLY" if getattr(state, "read_only", False) else "")
            )
            began = True
            self.connection.execute(
                "SELECT pg_catalog.set_config('statement_timeout', %s, true)",
                (str(math.ceil(duration.total_seconds() * 1000)),),
            )
            state.scope = self.admission.admit(
                self.connection, state.program, deadline=deadline
            )
            program = state.execute(validate)
            result: Any = None
            while True:
                try:
                    operation = program.send(result)
                except StopIteration as done:
                    return cast(ActionOutcome | ValidationResult, done.value)
                if operation[0] == "query":
                    if time.monotonic() >= deadline:
                        raise TimeoutError("native deadline")
                    self.connection.execute(
                        "SELECT pg_catalog.set_config('statement_timeout', %s, true)",
                        (str(max(1, math.ceil((deadline - time.monotonic()) * 1000))),),
                    )
                    cursor = self.connection.execute(operation[1], operation[2])
                    result = (
                        []
                        if cursor.description is None
                        else cursor.fetchmany(operation[3] if len(operation) > 3 else 2)
                    )
                elif operation[0] == "rollback":
                    self.connection.rollback()
                    began = False
                    result = None
                elif operation[0] == "commit":
                    committed = operation[1]
                    self.connection.commit()
                    began = False
                    result = None
        except BaseException as error:
            if committed is not None:
                if self.reconnect is not None and state.scope is not None:
                    recovered = None
                    try:
                        recovered = self.reconnect()
                        scope = self.admission.reconnect(
                            recovered, state.scope, deadline=time.monotonic() + 2
                        )
                        if (scope.store, scope.epoch) != (
                            state.scope.store,
                            state.scope.epoch,
                        ):
                            return self._quarantine(state)
                        status = recovered.execute(
                            "SELECT pg_catalog.pg_xact_status(%s::pg_catalog.xid8)",
                            (committed.receipt.version,),
                        ).fetchone()[0]
                        if status == "committed":
                            self._quarantine(state)
                            return committed
                        if status == "aborted":
                            raise ActionFailed(
                                "ABORTED_CAUSE_UNKNOWN",
                                error,
                                state.details("rolled-back"),
                            )
                    except ActionFailed:
                        raise
                    except BaseException:
                        pass
                    finally:
                        if recovered is not None:
                            recovered.close()
                return self._quarantine(state)
            if began:
                try:
                    self.connection.rollback()
                except BaseException:
                    return self._quarantine(state)
            details = state.details("rolled-back")
            code = getattr(error, "sqlstate", None)
            if code in ("40001", "40P01"):
                return Conflict(False, code, details)
            if code == "42501" or isinstance(error, ActionDenied):
                return Denied(getattr(error, "code", "NATIVE_PRIVILEGE"), details)
            if time.monotonic() >= deadline and (
                code == "57014" or isinstance(error, TimeoutError)
            ):
                return TimedOut(details)
            if isinstance(error, ActionRefused):
                raise
            raise ActionFailed(
                getattr(error, "code", "NATIVE_ACTION_FAILED"), error, details
            ) from error

    def invoke(
        self,
        action: ActionRef[StrictModel, object],
        input: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> ActionOutcome:
        return cast(ActionOutcome, self._run(action, input, timeout, False))

    def validate(
        self,
        action: ActionRef[StrictModel, object],
        input: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> ValidationResult:
        return cast(ValidationResult, self._run(action, input, timeout, True))


class AsyncNativeAdmission(Protocol):
    async def admit(
        self, connection: Any, program: Mapping[str, Any], *, deadline: float
    ) -> NativeScope: ...
    async def reconnect(
        self, connection: Any, original: NativeScope, *, deadline: float
    ) -> NativeScope: ...
    async def quarantine(
        self, connection: Any, original: NativeScope | None
    ) -> None: ...


class AsyncPostgresActionExecutor:
    """Native async driver for the same statement/state program; no worker thread."""

    def __init__(
        self,
        connection: Any,
        programs: tuple[NativeProgram, ...],
        admission: AsyncNativeAdmission,
        *,
        default_timeout: timedelta,
        reconnect: Any = None,
    ):
        if (
            type(default_timeout) is not timedelta
            or not 0 < default_timeout.total_seconds() < 2_147_483
        ):
            raise ActionRefused("FINITE_DEFAULT_TIMEOUT_REQUIRED")
        (
            self.connection,
            self.programs,
            self.admission,
            self.default_timeout,
            self.reconnect,
        ) = connection, programs, admission, default_timeout, reconnect
        self.quarantined = False

    def _state(
        self, action: ActionRef[Any, Any], inputs: Mapping[str, object]
    ) -> _State:
        if self.quarantined:
            raise ActionRefused("NATIVE_CONNECTION_QUARANTINED")
        matching = [
            p
            for p in self.programs
            if p.checked()["source"]["documentSha256"]
            == getattr(action.source, "document_sha256", None)
            and p.checked()["source"]["action"] == action.action
        ]
        if len(matching) != 1:
            raise ActionRefused("NATIVE_ACTION_NOT_COMPILED")
        if matching[0].checked().get("profile") != "umf.actions.native-sql/0.1":
            raise ActionRefused("POSTGRESQL_NATIVE_PROFILE_REQUIRED")
        return _State(action, matching[0], inputs)

    async def _quarantine(self, state: _State) -> Indeterminate:
        import asyncio

        self.quarantined = True
        try:
            async with asyncio.timeout(1):
                await self.admission.quarantine(self.connection, state.scope)
        except BaseException:
            pass
        return Indeterminate(state.details("indeterminate"))

    async def _run(
        self,
        action: ActionRef[Any, Any],
        inputs: Mapping[str, object],
        timeout: timedelta | None,
        validate: bool,
    ) -> ActionOutcome | ValidationResult:
        import asyncio

        state = self._state(action, inputs)
        duration = self.default_timeout if timeout is None else timeout
        if (
            type(duration) is not timedelta
            or not math.isfinite(duration.total_seconds())
            or duration.total_seconds() <= 0
        ):
            raise ActionRefused("DEADLINE_EXPIRED")
        deadline = time.monotonic() + duration.total_seconds()
        began = False
        committed: Committed[Any] | None = None
        if self.connection.info.transaction_status != 0:
            raise ActionRefused("IDLE_CONNECTION_REQUIRED")
        try:
            async with asyncio.timeout(duration.total_seconds()):
                await self.connection.execute(
                    "BEGIN ISOLATION LEVEL SERIALIZABLE"
                    + (" READ ONLY" if getattr(state, "read_only", False) else "")
                )
                began = True
                await self.connection.execute(
                    "SELECT pg_catalog.set_config('statement_timeout', %s, true)",
                    (str(math.ceil(duration.total_seconds() * 1000)),),
                )
                state.scope = await self.admission.admit(
                    self.connection, state.program, deadline=deadline
                )
                program = state.execute(validate)
                result: Any = None
                while True:
                    try:
                        operation = program.send(result)
                    except StopIteration as done:
                        return cast(ActionOutcome | ValidationResult, done.value)
                    if operation[0] == "query":
                        cursor = await self.connection.execute(
                            operation[1], operation[2]
                        )
                        result = (
                            []
                            if cursor.description is None
                            else await cursor.fetchmany(
                                operation[3] if len(operation) > 3 else 2
                            )
                        )
                    elif operation[0] == "rollback":
                        await self.connection.rollback()
                        began = False
                        result = None
                    elif operation[0] == "commit":
                        committed = operation[1]
                        await self.connection.commit()
                        began = False
                        result = None
        except BaseException as error:
            # Settlement has its own finite bound and survives caller cancellation.
            async def settle(
                original_error: BaseException = error,
            ) -> ActionOutcome | ValidationResult:
                if committed is not None:
                    if self.reconnect is not None and state.scope is not None:
                        recovered = None
                        try:
                            recovered = await self.reconnect()
                            scope = await self.admission.reconnect(
                                recovered, state.scope, deadline=time.monotonic() + 2
                            )
                            if (scope.store, scope.epoch) != (
                                state.scope.store,
                                state.scope.epoch,
                            ):
                                return await self._quarantine(state)
                            cursor = await recovered.execute(
                                "SELECT pg_catalog.pg_xact_status(%s::pg_catalog.xid8)",
                                (committed.receipt.version,),
                            )
                            row = await cursor.fetchone()
                            status = None if row is None else row[0]
                            if status == "committed":
                                await self._quarantine(state)
                                return committed
                            if status == "aborted":
                                raise ActionFailed(
                                    "ABORTED_CAUSE_UNKNOWN",
                                    original_error,
                                    state.details("rolled-back"),
                                )
                        except ActionFailed:
                            raise
                        except BaseException:
                            pass
                        finally:
                            if recovered is not None:
                                await recovered.close()
                    return await self._quarantine(state)
                if began:
                    try:
                        await self.connection.rollback()
                    except BaseException:
                        return await self._quarantine(state)
                details = state.details("rolled-back")
                code = getattr(original_error, "sqlstate", None)
                if code in ("40001", "40P01"):
                    return Conflict(False, code, details)
                if code == "42501" or isinstance(original_error, ActionDenied):
                    return Denied(
                        getattr(original_error, "code", "NATIVE_PRIVILEGE"), details
                    )
                if time.monotonic() >= deadline and (
                    code == "57014" or isinstance(original_error, TimeoutError)
                ):
                    return TimedOut(details)
                if isinstance(original_error, ActionRefused):
                    raise original_error
                raise ActionFailed(
                    getattr(
                        original_error,
                        "code",
                        "CANCELLED"
                        if isinstance(original_error, asyncio.CancelledError)
                        else "NATIVE_ACTION_FAILED",
                    ),
                    original_error,
                    details,
                ) from original_error

            async def bounded() -> ActionOutcome | ValidationResult:
                try:
                    async with asyncio.timeout(3):
                        return await settle()
                except TimeoutError:
                    return await self._quarantine(state)

            task = asyncio.create_task(bounded())
            while True:
                try:
                    return await asyncio.shield(task)
                except asyncio.CancelledError:
                    # Repeated caller cancellation still awaits this one finite
                    # original settlement; it never starts another operation.
                    if task.done():
                        return task.result()

    async def invoke(
        self,
        action: ActionRef[StrictModel, object],
        input: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> ActionOutcome:
        return cast(ActionOutcome, await self._run(action, input, timeout, False))

    async def validate(
        self,
        action: ActionRef[StrictModel, object],
        input: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> ValidationResult:
        return cast(ValidationResult, await self._run(action, input, timeout, True))

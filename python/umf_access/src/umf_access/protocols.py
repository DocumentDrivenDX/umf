"""Action execution ABI. Hosts supply executors; this module performs no I/O.

Original JSON and transport bytes are retained exactly. Recovery custody is an
opaque host object and never becomes serializable authority in this carrier.
"""
from __future__ import annotations
from dataclasses import dataclass, replace, field
from datetime import timedelta
from collections.abc import Mapping
import json
from math import isfinite
from typing import Generic, Protocol, TypeVar, runtime_checkable, cast
from .types import ActionRef, StrictModel, MISSING
from .codec_support import revalidate_model

I = TypeVar("I", bound=StrictModel)
O = TypeVar("O")

@dataclass(frozen=True)
class OriginalOutcome:
    action: ActionRef[StrictModel, object]
    result_json: str = field(repr=False)
    request_json: str = field(repr=False)
    recovery: object = field(repr=False)
    transport: bytes | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if self.action.source is None:
            raise ValueError("original source-bound action required")
        for text in (self.result_json, self.request_json):
            if type(text) is not str or len(text.encode("utf-8")) > 4_194_304:
                raise ValueError("bounded original JSON required")
            if not isinstance(json.loads(text), dict):
                raise ValueError("original object required")
        if self.transport is not None and type(self.transport) is not bytes:
            raise TypeError("immutable original transport required")

    def result(self) -> dict[str, object]:
        # A fresh view cannot mutate the retained original bytes/string.
        return cast(dict[str, object], json.loads(self.result_json))

@dataclass(frozen=True)
class Receipt:
    store: str
    epoch: str
    version: str

    def __post_init__(self) -> None:
        if any(type(v) is not str or not v for v in (self.store, self.epoch, self.version)):
            raise ValueError("complete original receipt required")

@dataclass(frozen=True)
class Committed(Generic[O]):
    output: O
    receipt: Receipt
    created: tuple[StrictModel, ...]
    changed: tuple[StrictModel, ...]
    original: OriginalOutcome

@dataclass(frozen=True)
class Rejected:
    code: str
    retryable: bool
    original: OriginalOutcome

@dataclass(frozen=True)
class Denied:
    code: str
    original: OriginalOutcome

@dataclass(frozen=True)
class Conflict:
    retained: bool
    code: str
    original: OriginalOutcome

@dataclass(frozen=True)
class TimedOut:
    original: OriginalOutcome

@dataclass(frozen=True)
class Indeterminate:
    original: OriginalOutcome

@dataclass(frozen=True)
class Replayed:
    outcome: Committed[object] | Rejected | Denied | Conflict

ActionOutcome = Committed[object] | Rejected | Denied | Conflict | TimedOut | Indeterminate | Replayed

@dataclass(frozen=True)
class ValidationFailure:
    code: str
    parameter: str | None = None

@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    failures: tuple[ValidationFailure, ...]
    complete: bool

@runtime_checkable
class ActionExecutor(Protocol):
    def invoke(self, action: ActionRef[StrictModel, object], input: Mapping[str, object], *, timeout: timedelta | None = None) -> ActionOutcome: ...
    def validate(self, action: ActionRef[StrictModel, object], input: Mapping[str, object], *, timeout: timedelta | None = None) -> ValidationResult: ...

@runtime_checkable
class ReplayingActionExecutor(ActionExecutor, Protocol):
    def invoke_keyed(self, action: ActionRef[StrictModel, object], input: Mapping[str, object], *, idempotency_key: str, timeout: timedelta | None = None) -> ActionOutcome: ...

class ActionError(RuntimeError):
    def __init__(self, code: str, original: OriginalOutcome | None = None):
        self.code, self.original = code, original
        super().__init__("action result: " + code)

class ActionRefused(ActionError): pass
class ActionDenied(ActionError): pass
class ActionTimedOut(ActionError): pass
class ActionIndeterminate(ActionError): pass

class ActionConflict(ActionError):
    def __init__(self, code: str, retained: bool, original: OriginalOutcome):
        self.retained = retained
        super().__init__(code, original)

class ActionFailed(ActionError):
    def __init__(self, code: str, cause: BaseException, original: OriginalOutcome | None = None):
        self.cause = cause
        super().__init__(code, original)

class ActionRejected(ActionError):
    def __init__(self, code: str, retryable: bool, original: OriginalOutcome | None = None):
        self.retryable = retryable
        super().__init__(code, original)


def _timeout(value: timedelta | None) -> None:
    if value is None:
        return  # Executor is required to apply its finite configured default.
    if type(value) is not timedelta or not isfinite(value.total_seconds()) or value.total_seconds() < 0:
        raise ActionRefused("TIMEOUT")
    if value.total_seconds() == 0:
        raise ActionRefused("DEADLINE_EXPIRED")


def _input(action: ActionRef[I, O], value: I, timeout: timedelta | None) -> dict[str, object]:
    _timeout(timeout)
    if action.source is None:
        raise ActionRefused("ACTION_SOURCE_REQUIRED")
    checked = revalidate_model(action.input_type, value)
    # Local ABI carriers, not an invented engine/native wire encoding. Adapters
    # own profile-specific transport, including exact Key/source correspondence.
    return {name: item for name, item in checked if item is not MISSING}



def _project(action: ActionRef[I, O], outcome: ActionOutcome, rejection: type[ActionRejected]) -> Committed[O]:
    if isinstance(outcome, Replayed):
        outcome = outcome.outcome
    if outcome.original.action != action:
        raise ActionIndeterminate("ORIGINAL_ACTION_MISMATCH", outcome.original)
    if isinstance(outcome, Committed):
        if action.output_type is type(None):
            if outcome.output is not None:
                raise ActionIndeterminate("OUTPUT_TYPE", outcome.original)
        elif isinstance(action.output_type, type) and issubclass(action.output_type, StrictModel):
            try:
                checked = revalidate_model(action.output_type, cast(StrictModel, outcome.output))
            except (TypeError, ValueError) as error:
                raise ActionIndeterminate("OUTPUT_TYPE", outcome.original) from error
            outcome = replace(outcome, output=checked)
        else:
            raise ActionIndeterminate("OUTPUT_TYPE", outcome.original)
        return cast(Committed[O], outcome)
    if isinstance(outcome, Rejected):
        raise rejection(code=outcome.code, retryable=outcome.retryable, original=outcome.original)
    if isinstance(outcome, Denied):
        raise ActionDenied(outcome.code, outcome.original)
    if isinstance(outcome, Conflict):
        raise ActionConflict(outcome.code, outcome.retained, outcome.original)
    if isinstance(outcome, TimedOut):
        raise ActionTimedOut("TIMED_OUT", outcome.original)
    if isinstance(outcome, Indeterminate):
        raise ActionIndeterminate("INDETERMINATE", outcome.original)
    raise TypeError("unknown action outcome")


class ActionEndpoint(Generic[I, O]):
    def __init__(self, executor: ActionExecutor, action: ActionRef[I, O], rejection: type[ActionRejected] = ActionRejected):
        if not isinstance(executor, ActionExecutor):
            raise TypeError("ActionExecutor required")
        self.executor, self.action, self.rejection = executor, action, rejection

    def __call__(self, input: I, *, timeout: timedelta | None = None) -> Committed[O]:
        return _project(self.action, self.executor.invoke(self.action, _input(self.action, input, timeout), timeout=timeout), self.rejection)

    def validate(self, input: I, *, timeout: timedelta | None = None) -> ValidationResult:
        return self.executor.validate(self.action, _input(self.action, input, timeout), timeout=timeout)


class ReplayingActionEndpoint(Generic[I, O]):
    def __init__(self, executor: ReplayingActionExecutor, action: ActionRef[I, O], rejection: type[ActionRejected] = ActionRejected):
        if not isinstance(executor, ReplayingActionExecutor):
            raise TypeError("ReplayingActionExecutor required")
        self.executor, self.action, self.rejection = executor, action, rejection

    def __call__(self, input: I, *, idempotency_key: str, timeout: timedelta | None = None) -> Committed[O]:
        if type(idempotency_key) is not str or not idempotency_key:
            raise ActionRefused("IDEMPOTENCY_KEY")
        return _project(self.action, self.executor.invoke_keyed(self.action, _input(self.action, input, timeout), idempotency_key=idempotency_key, timeout=timeout), self.rejection)

    def validate(self, input: I, *, timeout: timedelta | None = None) -> ValidationResult:
        return self.executor.validate(self.action, _input(self.action, input, timeout), timeout=timeout)

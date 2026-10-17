"""Action execution ABI. Hosts supply executors; this module performs no I/O.

Original JSON and transport bytes are retained exactly. Recovery custody is an
opaque host object and never becomes serializable authority in this carrier.
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator, Awaitable, Generator, Mapping
from dataclasses import dataclass, field
from datetime import timedelta
from math import isfinite
from typing import Any, Generic, Protocol, TypeVar, cast, overload, runtime_checkable

from pydantic import BaseModel

from .adoption import TargetIdentity
from .codec_support import revalidate_model
from .pages import ReadContinuation, ReadPage
from .reviewed import CatalogRead
from .types import MISSING, ActionRef, StrictModel

InputT = TypeVar("InputT", bound=StrictModel)
OutputT = TypeVar("OutputT")


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
                # The protocol reports invalid JSON carrier values uniformly as ValueError.
                raise ValueError("original object required")  # noqa: TRY004
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
        if any(
            type(v) is not str or not v for v in (self.store, self.epoch, self.version)
        ):
            raise ValueError("complete original receipt required")


@dataclass(frozen=True)
class NativeOutcomeDetails:
    """Original native-profile evidence; never a tx/1 result or replay authority."""

    action: ActionRef[StrictModel, object]
    profile: str
    markers_json: str = field(repr=False)
    no_op: bool | None
    verification_json: str | None = field(repr=False)
    changes_json: str | None = field(repr=False)
    attribution_json: str | None = field(repr=False)
    receipt: Receipt | None
    transaction_json: str = field(repr=False)
    request_json: str = field(repr=False)
    recovery: object = field(repr=False)

    def __post_init__(self) -> None:
        if self.action.source is None or self.profile not in (
            "umf.actions.native-sql/0.1",
            "umf.actions.native-bulk/0.1",
            "umf.actions.native-delta/0.1",
            "umf.actions.native-delta-bulk/0.1",
            "umf.actions.managed-delta/0.1",
            "umf.actions.managed-delta-bulk/0.1",
        ):
            raise ValueError("original source-bound native profile required")
        for text in (
            self.markers_json,
            self.verification_json,
            self.changes_json,
            self.attribution_json,
            self.transaction_json,
            self.request_json,
        ):
            if text is not None:
                if type(text) is not str or len(text.encode("utf-8")) > 4_194_304:
                    raise ValueError("bounded original native evidence required")
                json.loads(text)


OutcomeDetails = OriginalOutcome | NativeOutcomeDetails


@dataclass(frozen=True, init=False)
class Committed(Generic[OutputT]):
    output: OutputT
    receipt: Receipt
    _created: tuple[StrictModel, ...]
    _changed: tuple[StrictModel, ...]
    original: OutcomeDetails

    def __init__(
        self,
        output: OutputT,
        receipt: Receipt,
        created: tuple[StrictModel, ...] = (),
        changed: tuple[StrictModel, ...] = (),
        original: OutcomeDetails | None = None,
        *,
        _created: tuple[StrictModel, ...] | None = None,
        _changed: tuple[StrictModel, ...] | None = None,
    ):
        # dataclasses.replace supplies stored field names; preserve its complete
        # Key inventory as well as the public constructor's positional ABI.
        if original is None:
            raise TypeError("complete original outcome required")
        if _created is not None:
            if created:
                raise TypeError("duplicate created inventory")
            created = _created
        if _changed is not None:
            if changed:
                raise TypeError("duplicate changed inventory")
            changed = _changed
        object.__setattr__(self, "output", output)
        object.__setattr__(self, "receipt", receipt)
        object.__setattr__(self, "_created", created)
        object.__setattr__(self, "_changed", changed)
        object.__setattr__(self, "original", original)

    @property
    def created(self) -> tuple[StrictModel, ...]:
        return self._created

    @property
    def changed(self) -> tuple[StrictModel, ...]:
        return self._changed


C = TypeVar("C", bound=Committed[Any])


@dataclass(frozen=True)
class Rejected:
    code: str
    retryable: bool
    original: OutcomeDetails


@dataclass(frozen=True)
class Denied:
    code: str
    original: OutcomeDetails


@dataclass(frozen=True)
class Conflict:
    retained: bool
    code: str
    original: OutcomeDetails


@dataclass(frozen=True)
class TimedOut:
    original: OutcomeDetails


@dataclass(frozen=True)
class Indeterminate:
    original: OutcomeDetails


@dataclass(frozen=True)
class Replayed:
    outcome: Committed[object] | Rejected | Denied | Conflict


ActionOutcome = (
    Committed[object]
    | Rejected
    | Denied
    | Conflict
    | TimedOut
    | Indeterminate
    | Replayed
)


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
    def invoke(
        self,
        action: ActionRef[StrictModel, object],
        input: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> ActionOutcome: ...
    def validate(
        self,
        action: ActionRef[StrictModel, object],
        input: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> ValidationResult: ...


@runtime_checkable
class ReplayingActionExecutor(ActionExecutor, Protocol):
    def invoke_keyed(
        self,
        action: ActionRef[StrictModel, object],
        input: Mapping[str, object],
        *,
        idempotency_key: str,
        timeout: timedelta | None = None,
    ) -> ActionOutcome: ...


@runtime_checkable
class AsyncActionExecutor(Protocol):
    async def invoke(
        self,
        action: ActionRef[StrictModel, object],
        input: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> ActionOutcome: ...
    async def validate(
        self,
        action: ActionRef[StrictModel, object],
        input: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> ValidationResult: ...


@runtime_checkable
class AsyncReplayingActionExecutor(AsyncActionExecutor, Protocol):
    async def invoke_keyed(
        self,
        action: ActionRef[StrictModel, object],
        input: Mapping[str, object],
        *,
        idempotency_key: str,
        timeout: timedelta | None = None,
    ) -> ActionOutcome: ...


# Preserve the published generic parameter spelling and variance.
ExecutorT = TypeVar(  # noqa: PLC0105
    "ExecutorT", bound=ActionExecutor | AsyncActionExecutor, covariant=True
)
# Preserve the published generic parameter spelling and variance.
ReplayingExecutorT = TypeVar(  # noqa: PLC0105
    "ReplayingExecutorT",
    bound=ReplayingActionExecutor | AsyncReplayingActionExecutor,
    covariant=True,
)


class ActionError(RuntimeError):
    def __init__(self, code: str, original: OutcomeDetails | None = None):
        self.code, self.original = code, original
        super().__init__("action result: " + code)


class ActionRefused(ActionError):
    pass


class ActionDenied(ActionError):
    pass


class ActionTimedOut(ActionError):
    pass


class ActionIndeterminate(ActionError):
    pass


class ActionConflict(ActionError):
    def __init__(self, code: str, retained: bool, original: OutcomeDetails):
        self.retained = retained
        super().__init__(code, original)


class ActionFailed(ActionError):
    def __init__(
        self, code: str, cause: BaseException, original: OutcomeDetails | None = None
    ):
        self.cause = cause
        super().__init__(code, original)


class ActionRejected(ActionError):
    def __init__(
        self, code: str, retryable: bool, original: OutcomeDetails | None = None
    ):
        self.retryable = retryable
        super().__init__(code, original)


def _timeout(value: timedelta | None) -> None:
    if value is None:
        return  # Executor is required to apply its finite configured default.
    if (
        type(value) is not timedelta
        or not isfinite(value.total_seconds())
        or value.total_seconds() < 0
    ):
        raise ActionRefused("TIMEOUT")
    if value.total_seconds() == 0:
        raise ActionRefused("DEADLINE_EXPIRED")


def _input(
    action: ActionRef[InputT, OutputT], value: InputT, timeout: timedelta | None
) -> dict[str, object]:
    _timeout(timeout)
    if action.source is None:
        raise ActionRefused("ACTION_SOURCE_REQUIRED")
    checked = revalidate_model(action.input_type, value)
    # Local ABI carriers, not an invented engine/native wire encoding. Adapters
    # own profile-specific transport, including exact Key/source correspondence.
    return {name: item for name, item in checked if item is not MISSING}


def _project(
    action: ActionRef[InputT, OutputT],
    outcome: ActionOutcome,
    rejection: type[ActionRejected],
) -> Committed[OutputT]:
    if isinstance(outcome, Replayed):
        outcome = outcome.outcome
    if outcome.original.action != action:
        raise ActionIndeterminate("ORIGINAL_ACTION_MISMATCH", outcome.original)
    if isinstance(outcome, Committed):
        if action.output_type is type(None):
            if outcome.output is not None:
                raise ActionIndeterminate("OUTPUT_TYPE", outcome.original)
        elif isinstance(action.output_type, type) and issubclass(
            action.output_type, StrictModel
        ):
            try:
                checked = revalidate_model(
                    action.output_type, cast(StrictModel, outcome.output)
                )
            except (TypeError, ValueError) as error:
                raise ActionIndeterminate("OUTPUT_TYPE", outcome.original) from error
            outcome = Committed(
                checked,
                outcome.receipt,
                outcome.created,
                outcome.changed,
                outcome.original,
            )
        else:
            raise ActionIndeterminate("OUTPUT_TYPE", outcome.original)
        return cast(Committed[OutputT], outcome)
    if isinstance(outcome, Rejected):
        raise rejection(
            code=outcome.code, retryable=outcome.retryable, original=outcome.original
        )
    if isinstance(outcome, Denied):
        raise ActionDenied(outcome.code, outcome.original)
    if isinstance(outcome, Conflict):
        raise ActionConflict(outcome.code, outcome.retained, outcome.original)
    if isinstance(outcome, TimedOut):
        raise ActionTimedOut("TIMED_OUT", outcome.original)
    if isinstance(outcome, Indeterminate):
        raise ActionIndeterminate("INDETERMINATE", outcome.original)
    raise TypeError("unknown action outcome")


def make_committed_view(
    action: ActionRef[Any, Any], outcome: Committed[Any], result_type: type[C] | None
) -> C:
    if result_type is None:
        return cast(C, outcome)
    if getattr(result_type, "UMF_BUNDLE_INPUT_DIGEST", None) != getattr(
        action.input_type, "UMF_BUNDLE_INPUT_DIGEST", None
    ):
        raise ActionIndeterminate("RESULT_VIEW_SOURCE", outcome.original)
    checked = []
    for name, allowed_name in (
        ("created", "CREATED_KEY_TYPES"),
        ("changed", "CHANGED_KEY_TYPES"),
    ):
        values = getattr(outcome, name)
        allowed = getattr(result_type, allowed_name, None)
        if type(values) is not tuple or type(allowed) is not tuple:
            raise ActionIndeterminate("RESULT_KEY_INVENTORY", outcome.original)
        keys = []
        for value in values:
            if type(value) not in allowed or not any(
                type(value) is reference.model for reference in action.key_types
            ):
                raise ActionIndeterminate("RESULT_KEY_TYPE", outcome.original)
            if getattr(type(value), "UMF_BUNDLE_INPUT_DIGEST", None) != getattr(
                action.input_type, "UMF_BUNDLE_INPUT_DIGEST", None
            ):
                raise ActionIndeterminate("RESULT_KEY_SOURCE", outcome.original)
            try:
                keys.append(revalidate_model(type(value), value))
            except (TypeError, ValueError) as error:
                raise ActionIndeterminate(
                    "RESULT_KEY_VALUE", outcome.original
                ) from error
        checked.append(tuple(keys))
    return result_type(
        outcome.output, outcome.receipt, checked[0], checked[1], outcome.original
    )


async def _await_project(
    action: ActionRef[InputT, Any],
    outcome: Awaitable[ActionOutcome],
    rejection: type[ActionRejected],
    result_type: type[C] | None,
) -> C:
    # Cancellation/settlement belong to the original executor, never a new call.
    return make_committed_view(
        action, _project(action, await outcome, rejection), result_type
    )


def _dispatch(
    action: ActionRef[InputT, Any],
    answer: ActionOutcome | Awaitable[ActionOutcome],
    rejection: type[ActionRejected],
    result_type: type[C] | None,
) -> C | Awaitable[C]:
    if isinstance(answer, Awaitable):
        return _await_project(action, answer, rejection, result_type)
    return make_committed_view(action, _project(action, answer, rejection), result_type)


class ActionEndpoint(Generic[InputT, C, ExecutorT]):
    def __init__(
        self,
        executor: ExecutorT,
        action: ActionRef[InputT, Any],
        rejection: type[ActionRejected] = ActionRejected,
        result_type: type[C] | None = None,
    ):
        if not isinstance(executor, (ActionExecutor, AsyncActionExecutor)):
            raise TypeError("ActionExecutor required")
        self.executor, self.action, self.rejection, self.result_type = (
            executor,
            action,
            rejection,
            result_type,
        )

    @overload
    def __call__(
        self: ActionEndpoint[InputT, C, ActionExecutor],
        input: InputT,
        *,
        timeout: timedelta | None = None,
    ) -> C: ...
    @overload
    def __call__(
        self: ActionEndpoint[InputT, C, AsyncActionExecutor],
        input: InputT,
        *,
        timeout: timedelta | None = None,
    ) -> Awaitable[C]: ...
    def __call__(
        self, input: InputT, *, timeout: timedelta | None = None
    ) -> C | Awaitable[C]:
        return _dispatch(
            self.action,
            self.executor.invoke(
                self.action, _input(self.action, input, timeout), timeout=timeout
            ),
            self.rejection,
            self.result_type,
        )

    @overload
    def validate(
        self: ActionEndpoint[InputT, C, ActionExecutor],
        input: InputT,
        *,
        timeout: timedelta | None = None,
    ) -> ValidationResult: ...
    @overload
    def validate(
        self: ActionEndpoint[InputT, C, AsyncActionExecutor],
        input: InputT,
        *,
        timeout: timedelta | None = None,
    ) -> Awaitable[ValidationResult]: ...
    def validate(
        self, input: InputT, *, timeout: timedelta | None = None
    ) -> ValidationResult | Awaitable[ValidationResult]:
        return self.executor.validate(
            self.action, _input(self.action, input, timeout), timeout=timeout
        )


class ReplayingActionEndpoint(Generic[InputT, C, ReplayingExecutorT]):
    def __init__(
        self,
        executor: ReplayingExecutorT,
        action: ActionRef[InputT, Any],
        rejection: type[ActionRejected] = ActionRejected,
        result_type: type[C] | None = None,
    ):
        if not isinstance(
            executor, (ReplayingActionExecutor, AsyncReplayingActionExecutor)
        ):
            raise TypeError("ReplayingActionExecutor required")
        self.executor, self.action, self.rejection, self.result_type = (
            executor,
            action,
            rejection,
            result_type,
        )

    @overload
    def __call__(
        self: ReplayingActionEndpoint[InputT, C, ReplayingActionExecutor],
        input: InputT,
        *,
        idempotency_key: str,
        timeout: timedelta | None = None,
    ) -> C: ...
    @overload
    def __call__(
        self: ReplayingActionEndpoint[InputT, C, AsyncReplayingActionExecutor],
        input: InputT,
        *,
        idempotency_key: str,
        timeout: timedelta | None = None,
    ) -> Awaitable[C]: ...
    def __call__(
        self, input: InputT, *, idempotency_key: str, timeout: timedelta | None = None
    ) -> C | Awaitable[C]:
        if type(idempotency_key) is not str or not idempotency_key:
            raise ActionRefused("IDEMPOTENCY_KEY")
        return _dispatch(
            self.action,
            self.executor.invoke_keyed(
                self.action,
                _input(self.action, input, timeout),
                idempotency_key=idempotency_key,
                timeout=timeout,
            ),
            self.rejection,
            self.result_type,
        )

    @overload
    def validate(
        self: ReplayingActionEndpoint[InputT, C, ReplayingActionExecutor],
        input: InputT,
        *,
        timeout: timedelta | None = None,
    ) -> ValidationResult: ...
    @overload
    def validate(
        self: ReplayingActionEndpoint[InputT, C, AsyncReplayingActionExecutor],
        input: InputT,
        *,
        timeout: timedelta | None = None,
    ) -> Awaitable[ValidationResult]: ...
    def validate(
        self, input: InputT, *, timeout: timedelta | None = None
    ) -> ValidationResult | Awaitable[ValidationResult]:
        return self.executor.validate(
            self.action, _input(self.action, input, timeout), timeout=timeout
        )


ReadP = TypeVar("ReadP", bound=BaseModel)
ReadR = TypeVar("ReadR", bound=BaseModel)


class ReadTarget(Protocol):
    def identity(self) -> TargetIdentity: ...
    def read(
        self,
        entry: CatalogRead[ReadP, ReadR],
        parameters: ReadP,
        *,
        timeout: timedelta | None = None,
    ) -> list[ReadR]: ...
    def page(
        self,
        entry: CatalogRead[ReadP, ReadR],
        parameters: ReadP,
        *,
        after: ReadContinuation | None = None,
        timeout: timedelta | None = None,
    ) -> ReadPage[ReadR]: ...
    def stream(
        self,
        entry: CatalogRead[ReadP, ReadR],
        parameters: ReadP,
        *,
        max_rows: int,
        page_size: int | None = None,
        timeout: timedelta | None = None,
    ) -> Generator[ReadR, None, None]: ...


class AsyncReadTarget(Protocol):
    def identity(self) -> TargetIdentity: ...
    async def read(
        self,
        entry: CatalogRead[ReadP, ReadR],
        parameters: ReadP,
        *,
        timeout: timedelta | None = None,
    ) -> list[ReadR]: ...
    async def page(
        self,
        entry: CatalogRead[ReadP, ReadR],
        parameters: ReadP,
        *,
        after: ReadContinuation | None = None,
        timeout: timedelta | None = None,
    ) -> ReadPage[ReadR]: ...
    def stream(
        self,
        entry: CatalogRead[ReadP, ReadR],
        parameters: ReadP,
        *,
        max_rows: int,
        page_size: int | None = None,
        timeout: timedelta | None = None,
    ) -> AsyncGenerator[ReadR, None]: ...

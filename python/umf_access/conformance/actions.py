"""Shared original-protocol action assertions; engine owners supply witnesses.

No authority, engine connections, retry or recovery attempts are manufactured.
The native reference must be read independently after the same invocation; never
invoke a mutation twice on one store to compare two clients.
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from copy import deepcopy
from dataclasses import dataclass
from typing import Protocol

from umf_access.protocols import (
    ActionConflict,
    ActionDenied,
    ActionEndpoint,
    ActionError,
    ActionExecutor,
    ActionFailed,
    ActionIndeterminate,
    ActionRefused,
    ActionRejected,
    Committed,
    OriginalOutcome,
    ReplayingActionEndpoint,
    ValidationResult,
)
from umf_access.types import ActionRef, StrictModel

from .reads import ConformanceFailure

ACTION_CASES = (
    "actions.admission",
    "actions.receipt",
    "actions.conflict",
    "actions.precommit_fault",
    "actions.commit_loss",
    "actions.replay",
    "actions.validate",
)


def _require(condition: bool, reason: str) -> None:
    if not condition:
        raise ConformanceFailure(reason)


@dataclass(frozen=True)
class ActionScenario:
    name: str
    executor: ActionExecutor
    action: ActionRef
    input: StrictModel
    reference: Callable[[], Committed | ActionError | ValidationResult]
    # Engine-owned durable mutation/admission-attempt counter, not SDK dispatch.
    native_attempts: Callable[[], int]
    expected_attempts: int
    idempotency_key: str | None = None
    # Return an independent immutable snapshot of state, journal/feed and ACK.
    # The suite also clones retained observations so mutable aliasing cannot hide
    # fixture-state changes; fixture observations must support deepcopy/equality.
    durable_state: Callable[[], object] | None = None


class ActionFixture(Protocol):
    def open(self, case: str) -> AbstractContextManager[tuple[ActionScenario, ...]]: ...


class _ObservedExecutor:
    def __init__(self, executor):
        self.executor, self.invocations, self.previews = executor, 0, 0

    def invoke(self, *args, **kwargs):
        self.invocations += 1
        return self.executor.invoke(*args, **kwargs)

    def invoke_keyed(self, *args, **kwargs):
        self.invocations += 1
        return self.executor.invoke_keyed(*args, **kwargs)

    def validate(self, *args, **kwargs):
        self.previews += 1
        return self.executor.validate(*args, **kwargs)


def _original(actual, expected) -> None:
    _require(
        isinstance(actual, OriginalOutcome) and isinstance(expected, OriginalOutcome),
        "original tx/1 outcome required; native SQL profiles are separate",
    )
    _require(actual.action == expected.action, "original action/source changed")
    _require(
        actual.result_json == expected.result_json, "original result bytes changed"
    )
    _require(
        actual.request_json == expected.request_json, "original request bytes changed"
    )
    _require(actual.transport == expected.transport, "original transport bytes changed")
    _require(actual.recovery is expected.recovery, "original recovery custody replaced")


def _compare(actual, expected) -> None:
    if isinstance(expected, Committed):
        _require(
            isinstance(actual, Committed), "commit classification differs from native"
        )
        _require(
            actual.output == expected.output and actual.receipt == expected.receipt,
            "output or complete receipt differs from native",
        )
        _require(
            actual.created == expected.created and actual.changed == expected.changed,
            "complete created/changed Key inventory differs",
        )
        _original(actual.original, expected.original)
    elif isinstance(expected, ActionError):
        _require(
            isinstance(actual, type(expected)),
            "action failure classification differs from native",
        )
        _require(actual.code == expected.code, "native failure code changed")
        if isinstance(expected, ActionConflict):
            _require(
                actual.retained == expected.retained,
                "native retained classification changed",
            )
        if isinstance(expected, ActionRejected):
            _require(
                actual.retryable == expected.retryable,
                "native retryable classification changed",
            )
        if isinstance(expected, ActionFailed):
            _require(actual.cause is expected.cause, "native precommit cause replaced")
        if expected.original is None:
            _require(actual.original is None, "refusal invented original outcome")
        else:
            _original(actual.original, expected.original)
    else:
        raise ConformanceFailure("independent native expected action outcome required")


def _invoke(endpoint, scenario):
    try:
        if scenario.idempotency_key is None:
            return endpoint(scenario.input)
        return endpoint(scenario.input, idempotency_key=scenario.idempotency_key)
    except ActionError as error:
        return error


def run_action_case(fixture: ActionFixture, case: str) -> None:
    """@covers US-087-AC2 US-087-AC3 US-087-AC4 US-087-AC5 US-087-AC8"""
    if case not in ACTION_CASES:
        raise ValueError("unknown action conformance case: " + case)
    with fixture.open(case) as scenarios:
        _require(
            type(scenarios) is tuple and bool(scenarios),
            "nonempty owned scenarios required",
        )
        _require(
            len({s.name for s in scenarios}) == len(scenarios), "duplicate scenario"
        )
        required_names = {
            "actions.admission": {
                "authorized-person",
                "unauthorized-person",
                "service-person-required",
                "unenrolled-writer",
            },
            "actions.receipt": {"commit", "noop"},
            "actions.replay": {"success", "rejection", "token-reuse"},
            "actions.validate": {"valid", "invalid", "incomplete"},
        }.get(case)
        if required_names is not None:
            _require(
                {s.name for s in scenarios} == required_names,
                "required scenario inventory differs",
            )
        for scenario in scenarios:
            _require(
                type(scenario.expected_attempts) is int
                and scenario.expected_attempts in (0, 1),
                "explicit zero/one native attempt expectation required",
            )
            observed = _ObservedExecutor(scenario.executor)
            endpoint = (
                ActionEndpoint(observed, scenario.action)
                if scenario.idempotency_key is None
                else ReplayingActionEndpoint(observed, scenario.action)
            )
            before = scenario.native_attempts()
            _require(
                type(before) is int and before >= 0, "native attempt counter required"
            )
            durable_before = (
                deepcopy(scenario.durable_state())
                if scenario.durable_state is not None
                else None
            )
            if case == "actions.validate":
                actual = endpoint.validate(scenario.input)
                expected = scenario.reference()
                _require(
                    type(actual) is ValidationResult
                    and type(expected) is ValidationResult,
                    "complete native preview findings required",
                )
                _require(
                    actual == expected,
                    "preview findings or completeness differ from native",
                )
                _require(
                    observed.previews == 1 and observed.invocations == 0,
                    "preview invoked admission",
                )
                _require(
                    scenario.native_attempts() == before, "preview mutated/admitted"
                )
                if scenario.name == "incomplete":
                    _require(not actual.complete, "partial preview reported complete")
                _require(
                    actual.valid is (scenario.name == "valid"),
                    "required valid/invalid preview was not exercised",
                )
                _require(
                    scenario.durable_state is not None
                    and scenario.durable_state() == durable_before,
                    "preview changed state, journal/feed or ACK",
                )
                continue
            actual = _invoke(endpoint, scenario)
            expected = scenario.reference()
            _compare(actual, expected)
            _require(
                observed.invocations == 1 and observed.previews == 0,
                "SDK dispatched more than once",
            )
            _require(
                scenario.native_attempts() - before == scenario.expected_attempts,
                "native attempt count differs; retry or missing admission",
            )
            required_error = {
                "actions.conflict": ActionConflict,
                "actions.precommit_fault": ActionFailed,
                "actions.commit_loss": ActionIndeterminate,
            }.get(case)
            if required_error is not None:
                _require(
                    isinstance(actual, required_error),
                    "required native fault was not exercised",
                )
            if case == "actions.precommit_fault":
                _require(
                    scenario.durable_state is not None
                    and scenario.durable_state() == durable_before,
                    "precommit fault left durable state, journal/feed or ACK effects",
                )
            if case == "actions.admission" and scenario.name == "authorized-person":
                _require(
                    isinstance(actual, Committed) and scenario.expected_attempts == 1,
                    "authorized valid action did not exercise native admission",
                )
            if case == "actions.admission" and scenario.name != "authorized-person":
                _require(
                    isinstance(actual, (ActionRefused, ActionDenied)),
                    "unauthorized subject admitted or rejected",
                )
            if case == "actions.receipt":
                _require(isinstance(actual, Committed), "receipt case did not commit")
                _require(
                    actual.original.result().get("noOp") is (scenario.name == "noop"),
                    "no-op witness differs",
                )
            if case == "actions.replay":
                _require(
                    scenario.idempotency_key is not None
                    and scenario.durable_state is not None,
                    "keyed original replay and durable native snapshot required",
                )
                if scenario.name == "token-reuse":
                    _require(
                        isinstance(actual, ActionConflict)
                        and actual.code == "TOKEN_REUSE",
                        "TOKEN_REUSE did not preserve conflict code",
                    )
                    _require(
                        scenario.expected_attempts == 0
                        and scenario.native_attempts() == before,
                        "TOKEN_REUSE reached native admission",
                    )
                    _require(
                        scenario.durable_state() == durable_before,
                        "TOKEN_REUSE changed durable effects",
                    )
                    continue
                _require(
                    isinstance(
                        actual,
                        Committed if scenario.name == "success" else ActionRejected,
                    ),
                    "replay scenario lacks required original success/rejection",
                )
                durable = deepcopy(scenario.durable_state())
                attempts = scenario.native_attempts()
                repeated = _invoke(endpoint, scenario)
                _compare(repeated, expected)
                _require(
                    observed.invocations == 2, "keyed replay dispatch count differs"
                )
                _require(
                    scenario.native_attempts() == attempts,
                    "replay evaluated a new attempt",
                )
                _require(
                    scenario.durable_state() == durable,
                    "replay changed durable state, journal/feed or ACK",
                )


def run_action_suite(
    fixture: ActionFixture, *, cases: tuple[str, ...] = ACTION_CASES
) -> tuple[str, ...]:
    _require(
        bool(cases) and len(set(cases)) == len(cases),
        "nonempty unique action cases required",
    )
    for case in cases:
        run_action_case(fixture, case)
    return cases

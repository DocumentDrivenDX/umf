"""Repository-only original manifest-control assertions (STP-087 AC6).

The owner supplies its actual host plan, issued capabilities, independent native
observations and original-result extractors. These are fixture hooks, never a
new shipped control union, authority issuer or engine implementation.
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from copy import deepcopy
from dataclasses import dataclass
from typing import Protocol

from .reads import ConformanceFailure

BULK_CASES = ("bulk.seal_submit", "bulk.control_recovery")


@dataclass(frozen=True)
class BulkScenario:
    name: str
    plan: object
    # Exact original host-issued objects; the suite cannot construct replacements.
    attempt: object
    reference: Callable[[], object]
    original_bytes: Callable[[object], bytes]
    # Owner maps original engine discriminants, never scenario names/results inferred by SDK.
    classify: Callable[[object], str]
    recovery_ref: Callable[[object], object | None]
    job_ref: Callable[[object], object | None]
    native_attempts: Callable[[], int]
    expected_attempts: int
    # Independent native boundary observations, not SDK wrapper counters.
    control_inputs: Callable[[], tuple[object, ...]]
    sdk_control_writes: Callable[[], int]
    durable_state: Callable[[], object]
    sealed: object | None = None
    submission_key: str | None = None
    # For successful materialize/seal, owner invokes original seal inspection.
    inspect_seal: Callable[[object], bytes] | None = None
    reference_seal: Callable[[], bytes] | None = None
    # Independent retained outcome after original recoverControl, not reinvocation.
    recovered_reference: Callable[[], object] | None = None
    # Owner-bound probe uses already issued native capability; suite mints none.
    probe_fresh_mutation: Callable[[], object] | None = None
    fresh_reference: Callable[[], object] | None = None


class BulkFixture(Protocol):
    def open(self, case: str) -> AbstractContextManager[tuple[BulkScenario, ...]]: ...


def _require(ok: bool, message: str) -> None:
    if not ok:
        raise ConformanceFailure(message)


def _same(s: BulkScenario, actual: object, expected: object) -> None:
    _require(type(actual) is type(expected), "original control result class changed")
    actual_bytes, expected_bytes = s.original_bytes(actual), s.original_bytes(expected)
    _require(
        type(actual_bytes) is bytes
        and type(expected_bytes) is bytes
        and bool(expected_bytes),
        "complete original control bytes required",
    )
    _require(
        actual_bytes == expected_bytes, "complete original control result bytes changed"
    )
    _require(
        s.classify(actual) == s.classify(expected),
        "original control discriminant changed",
    )
    _require(
        s.recovery_ref(actual) is s.recovery_ref(expected),
        "original recovery custody replaced",
    )
    _require(s.job_ref(actual) == s.job_ref(expected), "original job reference changed")


def run_bulk_case(fixture: BulkFixture, case: str) -> None:
    _require(case in BULK_CASES, "unknown bulk case")
    required = (
        {
            operation + "." + outcome
            for operation in ("seal", "submit")
            for outcome in ("success", "refusal", "token_reuse")
        }
        if case == "bulk.seal_submit"
        else {
            operation + "." + outcome
            for operation in ("seal", "submit")
            for outcome in ("noncommit", "unknown")
        }
    )
    with fixture.open(case) as scenarios:
        _require(
            len(scenarios) == len(required) and {s.name for s in scenarios} == required,
            "complete unique original bulk scenarios required",
        )
        for s in scenarios:
            _require(
                not hasattr(s.plan, "execute"), "manifest plan exposes worker execute"
            )
            operation, outcome = s.name.split(".")
            _require(
                type(s.expected_attempts) is int and s.expected_attempts in (0, 1),
                "expected native attempt delta must be zero or one",
            )
            attempts_before = s.native_attempts()
            _require(
                type(attempts_before) is int and attempts_before >= 0,
                "native attempt counter required",
            )
            if operation == "seal":
                actual = s.plan.seal(attempt=s.attempt)
            else:
                _require(
                    s.sealed is not None
                    and type(s.submission_key) is str
                    and bool(s.submission_key),
                    "original seal and stable submission key required",
                )
                actual = s.plan.submit(
                    s.sealed, submission_key=s.submission_key, attempt=s.attempt
                )
            inputs = s.control_inputs()
            _require(
                len(inputs) == (1 if operation == "seal" else 3),
                "exact original control request required",
            )
            _require(inputs[-1] is s.attempt, "original control attempt replaced")
            if operation == "submit":
                _require(
                    inputs[0] is s.sealed and inputs[1] == s.submission_key,
                    "original seal or submission key replaced",
                )
            _require(s.sdk_control_writes() == 0, "SDK wrote native control state")
            expected = s.reference()
            _same(s, actual, expected)
            _require(
                s.classify(actual) == outcome and s.classify(expected) == outcome,
                "named scenario does not exercise its original discriminant",
            )
            attempts_after = s.native_attempts()
            _require(
                type(attempts_after) is int
                and attempts_after - attempts_before == s.expected_attempts,
                "native control attempt count changed or implicit retry occurred",
            )
            if operation == "seal" and outcome == "success":
                _require(
                    s.inspect_seal is not None and s.reference_seal is not None,
                    "original successful seal inspection required",
                )
                inspection, reference = s.inspect_seal(actual), s.reference_seal()
                _require(
                    type(inspection) is bytes
                    and type(reference) is bytes
                    and bool(reference)
                    and inspection == reference,
                    "original seal inspection changed",
                )
            if outcome == "unknown":
                recovery = s.recovery_ref(expected)
                _require(
                    recovery is not None and s.recovery_ref(actual) is recovery,
                    "unknown control lost original recovery",
                )
                _require(
                    s.job_ref(actual) is None,
                    "lost ACK before job reference must retain unknown without fabricated job",
                )
                _require(
                    s.recovered_reference is not None,
                    "independent original recovery reference required",
                )
                before, attempts = deepcopy(s.durable_state()), s.native_attempts()
                original_bytes = s.original_bytes(actual)
                _require(
                    s.probe_fresh_mutation is not None
                    and s.fresh_reference is not None,
                    "owner-bound fresh mutation refusal probe required",
                )
                refused_reference = s.fresh_reference()
                if isinstance(refused_reference, BaseException):
                    try:
                        refused = s.probe_fresh_mutation()
                    except type(refused_reference) as error:
                        refused = error
                else:
                    refused = s.probe_fresh_mutation()
                _require(
                    s.classify(refused) == "refusal"
                    and s.classify(refused_reference) == "refusal",
                    "unknown ACK allowed fresh mutation instead of typed refusal",
                )
                _same(s, refused, refused_reference)
                _require(
                    s.native_attempts() == attempts,
                    "unknown ACK fresh probe created native attempt",
                )
                _require(
                    s.durable_state() == before,
                    "unknown ACK fresh probe mutated graph/control state",
                )
                _require(
                    s.sdk_control_writes() == 0,
                    "SDK wrote control state during fresh mutation probe",
                )
                _require(
                    s.original_bytes(actual) == original_bytes
                    and s.recovery_ref(actual) is recovery,
                    "fresh probe changed retained original outcome/custody",
                )
                _require(
                    s.job_ref(actual) is None,
                    "fresh probe fabricated job reference for unknown ACK",
                )
                recovered = s.plan.recover_control(recovery)
                _same(s, recovered, s.recovered_reference())
                _require(
                    s.native_attempts() == attempts,
                    "recovery created fresh native attempt/key/seal/job",
                )
                _require(
                    s.durable_state() == before,
                    "recovery mutated original graph/control state",
                )
                _require(
                    s.sdk_control_writes() == 0,
                    "SDK wrote control state during recovery",
                )


def run_bulk_suite(
    fixture: BulkFixture, *, cases: tuple[str, ...] = BULK_CASES
) -> tuple[str, ...]:
    _require(
        bool(cases) and len(set(cases)) == len(cases),
        "nonempty unique bulk cases required",
    )
    for case in cases:
        run_bulk_case(fixture, case)
    return cases

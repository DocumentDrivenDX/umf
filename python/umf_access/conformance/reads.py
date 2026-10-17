"""Shared non-temporal read assertions against an engine-owned fixture.

The fixture owns native setup/teardown, independent reference observations and
fault placement. These checks grant no authority and cannot substitute for the
engine's native witnesses. No connection, replacement target or retry is created.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from contextlib import AbstractContextManager
from dataclasses import dataclass, replace
from typing import Protocol

from umf_access.catalog import NotCompiledForTarget, Page, ReadPlan, run_query
from umf_access.pages import StaleContinuation
from umf_access.protocols import ReadTarget

READ_CASES = (
    "reads.parity",
    "reads.empty_complete",
    "reads.refusal_not_empty",
    "reads.alias_renamed",
    "reads.alias_repointed",
    "reads.withheld_rows",
    "reads.pin_mismatch",
    "reads.continuation",
)


class ConformanceFailure(AssertionError):
    """An exercising assertion failed; this is not an engine outcome."""


@dataclass(frozen=True)
class ReadWitness:
    target: ReadTarget
    plan: ReadPlan
    arguments: Mapping[str, object]
    reference_rows: Callable[[], Sequence[object]]
    # The owner must install the fault in the native boundary, including after
    # fetch/before closing for withheld_rows; the suite does not simulate it.
    prepare: Callable[[], None] | None = None
    refusal: type[Exception] | None = None
    source_complete: Callable[[], bool] | None = None
    reference_after_transition: Callable[[], Sequence[object]] | None = None


class ReadFixture(Protocol):
    def open(self, case: str) -> AbstractContextManager[ReadWitness]:
        """Own a fresh native fixture interval and cleanup even on assertion failure."""
        ...


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ConformanceFailure(message)


def _rows(answer: object) -> tuple[object, ...]:
    if isinstance(answer, Page):
        return tuple(answer.items)
    _require(type(answer) is list, "read must return a completed list or Page")
    return tuple(answer)  # type: ignore[arg-type]


def _refuses(call: Callable[[], object], expected: type[Exception]) -> None:
    try:
        call()
    except expected:
        return
    except Exception as error:
        raise ConformanceFailure(
            "refusal changed to " + type(error).__name__
        ) from error
    raise ConformanceFailure("refusal released a result, including an empty result")


class _ObservedTarget:
    """Count dispatch without replacing any original target behavior."""

    def __init__(self, target: ReadTarget):
        self.target, self.dispatches = target, 0

    def identity(self):
        return self.target.identity()

    def read(self, *args, **kwargs):
        self.dispatches += 1
        return self.target.read(*args, **kwargs)

    def page(self, *args, **kwargs):
        self.dispatches += 1
        return self.target.page(*args, **kwargs)

    def stream(self, *args, **kwargs):
        self.dispatches += 1
        return self.target.stream(*args, **kwargs)


def run_read_case(fixture: ReadFixture, case: str) -> None:
    """Execute one assertion group; unknown/unavailable cases never pass silently."""
    if case not in READ_CASES:
        raise ValueError("unknown read conformance case: " + case)
    with fixture.open(case) as witness:
        _require(
            witness.plan.terminal in ("all", "page"),
            "fixture needs an all/page catalog",
        )

        def execute(arguments=None, target=None, plan=None):
            return run_query(
                witness.plan if plan is None else plan,
                witness.target if target is None else target,
                witness.arguments if arguments is None else arguments,
            )

        if case == "reads.parity":
            # @covers US-087-AC1 @covers US-088-AC1
            expected = tuple(witness.reference_rows())
            _require(
                _rows(execute()) == expected,
                "rows differ from independent pinned reference",
            )
        elif case == "reads.empty_complete":
            # @covers US-088-AC1
            _require(
                witness.source_complete is not None,
                "owner complete-status observation required",
            )
            _require(
                witness.source_complete() is True,
                "empty source is not independently complete",
            )
            _require(
                tuple(witness.reference_rows()) == (),
                "empty reference fixture required",
            )
            answer = execute()
            _require(_rows(answer) == (), "complete empty read returned rows")
            if isinstance(answer, Page):
                _require(
                    answer.next_after is None,
                    "complete empty page returned continuation",
                )
        elif case in (
            "reads.refusal_not_empty",
            "reads.alias_renamed",
            "reads.alias_repointed",
            "reads.withheld_rows",
        ):
            # @covers US-087-AC1 @covers US-088-AC2 @covers US-088-AC3 @covers US-088-AC4
            _require(
                witness.prepare is not None, "owner fault/alias/closing setup required"
            )
            _require(witness.refusal is not None, "exact owner refusal class required")
            witness.prepare()
            _refuses(execute, witness.refusal)
        elif case == "reads.pin_mismatch":
            # @covers US-087-AC1
            _require(bool(witness.plan.variants), "compiled variants required")
            for field in ("backend_version", "binding_sha256"):
                variants = tuple(
                    replace(
                        variant,
                        pin=replace(
                            variant.pin,
                            **{
                                field: getattr(variant.pin, field)
                                + ".conformance-mismatch"
                            },
                        ),
                    )
                    for variant in witness.plan.variants
                )
                observed = _ObservedTarget(witness.target)
                altered = replace(witness.plan, variants=variants)
                _refuses(
                    lambda observed=observed, altered=altered: execute(
                        target=observed, plan=altered
                    ),
                    NotCompiledForTarget,
                )
                _require(
                    observed.dispatches == 0, "mismatched catalog dispatched to engine"
                )
        else:
            # @covers US-088-AC5
            _require(
                witness.plan.terminal == "page",
                "continuation fixture needs page terminal",
            )
            cursor = witness.plan.cursor_argument
            _require(cursor is not None, "declared cursor argument required")
            _require(
                witness.prepare is not None
                and witness.reference_after_transition is not None,
                "owner publication/expiry/policy transition and reference required",
            )
            initial = execute()
            _require(
                isinstance(initial, Page) and initial.next_after is not None,
                "initial pinned page must produce a continuation",
            )
            _require(
                _rows(initial) == tuple(witness.reference_rows()),
                "initial page differs from reference",
            )
            witness.prepare()
            continued = dict(witness.arguments)
            continued[cursor] = initial.next_after
            _refuses(lambda: execute(arguments=continued), StaleContinuation)
            fresh = dict(witness.arguments)
            fresh[cursor] = None
            expected = tuple(witness.reference_after_transition())
            _require(
                _rows(execute(arguments=fresh)) == expected,
                "fresh page differs from post-transition reference",
            )


def run_read_suite(
    fixture: ReadFixture, *, cases: Sequence[str] = READ_CASES
) -> tuple[str, ...]:
    """Return only exercising successes. Exceptions propagate; no native claims added."""
    completed = []
    for case in cases:
        run_read_case(fixture, case)
        completed.append(case)
    return tuple(completed)

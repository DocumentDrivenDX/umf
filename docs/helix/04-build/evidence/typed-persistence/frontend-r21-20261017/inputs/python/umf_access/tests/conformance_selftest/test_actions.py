"""Deliberately faulty action targets must fail the shared assertions.

These are synthetic suite-detection tests, never Truss native qualification.
"""

import sys
import unittest
from contextlib import contextmanager
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from conformance.actions import (
    ACTION_CASES,
    ActionScenario,
    run_action_case,
    run_action_suite,
)
from conformance.reads import ConformanceFailure
from umf_access.protocols import (
    ActionConflict,
    ActionDenied,
    ActionFailed,
    ActionIndeterminate,
    ActionRefused,
    ActionRejected,
    Committed,
    OriginalOutcome,
    Receipt,
    ValidationFailure,
    ValidationResult,
)
from umf_access.types import ActionRef, ActionSource, StrictModel


class Input(StrictModel):
    value: str


class Output(StrictModel):
    value: str


SOURCE = ActionSource(
    "test",
    "0.8.0",
    "test",
    "change",
    "a" * 64,
    "/modules/0/extensions/umf.actions/actions/0",
    "umf.actions.tx",
    "1",
)
ACTION = ActionRef("test", "change", Input, Output, SOURCE)


class Executor:
    def __init__(self, answer, fault=None):
        self.answer, self.fault = answer, fault
        self.attempts, self.calls, self.durable = 0, 0, 0

    def _dispatch(self, keyed=False):
        self.calls += 1
        expected = self.answer
        if isinstance(expected, ActionConflict):
            answer = ActionConflict(expected.code, expected.retained, expected.original)
        elif isinstance(expected, ActionFailed):
            answer = ActionFailed(expected.code, expected.cause, expected.original)
        elif isinstance(expected, ActionRejected):
            answer = ActionRejected(
                expected.code, expected.retryable, expected.original
            )
        elif isinstance(expected, Exception):
            answer = type(expected)(expected.code, expected.original)
        else:
            answer = replace(expected)
        refusal = (
            isinstance(answer, (ActionDenied, ActionRefused))
            or isinstance(answer, ActionConflict)
            and answer.code == "TOKEN_REUSE"
        )
        replayed = keyed and self.calls > 1
        if not refusal and not replayed:
            self.attempts += 1
            if isinstance(answer, Committed):
                self.durable += 1
        if self.fault == "retry":
            self.attempts += 1
        if self.fault == "replay_evaluates" and replayed:
            self.attempts += 1
            self.durable += 1
        if self.fault == "unknown_dropped" and isinstance(answer, Committed):
            answer = replace(
                answer, original=replace(answer.original, result_json='{"noOp":false}')
            )
        if self.fault == "lost_recovery" and isinstance(answer, ActionIndeterminate):
            answer.original = replace(answer.original, recovery=object())
        if self.fault == "wrong_class" and isinstance(answer, ActionFailed):
            answer = ActionConflict(answer.code, False, answer.original)
        if self.fault == "lost_retention" and isinstance(answer, ActionConflict):
            answer.retained = not answer.retained
        if self.fault == "loss_is_commit" and isinstance(answer, ActionIndeterminate):
            answer = Committed(
                Output(value="ok"), Receipt("s", "e", "v"), original=answer.original
            )
        if isinstance(answer, Exception):
            raise answer
        return answer

    def invoke(self, *args, **kwargs):
        return self._dispatch()

    def invoke_keyed(self, *args, **kwargs):
        return self._dispatch(True)

    def validate(self, *args, **kwargs):
        if self.fault == "preview_admission":
            self.attempts += 1
        return (
            replace(self.answer, complete=True)
            if self.fault == "incomplete_is_complete"
            else self.answer
        )


class Fixture:
    def __init__(self, fault=None):
        self.fault, self.closed = fault, 0

    @contextmanager
    def open(self, case):
        custody = object()

        def original(noop=False):
            return OriginalOutcome(
                ACTION,
                '{ "noOp":' + str(noop).lower() + ', "future":{"opaque":17}}',
                '{"exact":"request"}',
                custody,
                b"original native transport",
            )

        def commit(noop=False):
            return Committed(
                Output(value="ok"), Receipt("s", "e", "v"), original=original(noop)
            )

        definitions = {
            "actions.admission": [
                ("authorized-person", commit()),
                ("unauthorized-person", ActionDenied("ROLE", original())),
                ("service-person-required", ActionRefused("PERSON")),
                ("unenrolled-writer", ActionRefused("UNENROLLED")),
            ],
            "actions.receipt": [("commit", commit()), ("noop", commit(True))],
            "actions.conflict": [
                ("conflict", ActionConflict("CONFLICT", True, original()))
            ],
            "actions.precommit_fault": [
                (
                    "rollback",
                    ActionFailed(
                        "NATIVE_ROLLBACK", RuntimeError("native cause"), original()
                    ),
                )
            ],
            "actions.commit_loss": [
                ("lost-ack", ActionIndeterminate("INDETERMINATE", original()))
            ],
            "actions.replay": [
                ("success", commit()),
                ("rejection", ActionRejected("NOT_READY", False, original())),
                ("token-reuse", ActionConflict("TOKEN_REUSE", False, original())),
            ],
            "actions.validate": [
                ("valid", ValidationResult(True, (), True)),
                (
                    "invalid",
                    ValidationResult(
                        False,
                        (ValidationFailure("ONE"), ValidationFailure("TWO")),
                        True,
                    ),
                ),
                (
                    "incomplete",
                    ValidationResult(False, (ValidationFailure("ONE"),), False),
                ),
            ],
        }
        if self.fault == "authorized_refused" and case == "actions.admission":
            definitions[case][0] = (
                "authorized-person",
                ActionRefused("NOT_IMPLEMENTED"),
            )
        scenarios = []
        for name, expected in definitions[case]:
            executor = Executor(expected, self.fault)
            scenarios.append(
                ActionScenario(
                    name,
                    executor,
                    ACTION,
                    Input(value="ok"),
                    lambda e=expected: e,
                    lambda e=executor: e.attempts,
                    0
                    if isinstance(
                        expected, (ActionDenied, ActionRefused, ValidationResult)
                    )
                    or name == "token-reuse"
                    else 1,
                    "original-key" if case == "actions.replay" else None,
                    lambda e=executor: (e.durable, "journal", "feed", "ack"),
                )
            )
        try:
            yield tuple(scenarios)
        finally:
            self.closed += 1


class ActionConformanceTests(unittest.TestCase):
    def test_correct_fixture_runs_all_cases_and_closes(self):
        fixture = Fixture()
        self.assertEqual(run_action_suite(fixture), ACTION_CASES)
        self.assertEqual(fixture.closed, len(ACTION_CASES))

    def test_faulty_targets_refuse_and_always_close(self):
        for fault, case in (
            ("authorized_refused", "actions.admission"),
            ("retry", "actions.receipt"),
            ("unknown_dropped", "actions.receipt"),
            ("lost_recovery", "actions.commit_loss"),
            ("wrong_class", "actions.precommit_fault"),
            ("lost_retention", "actions.conflict"),
            ("loss_is_commit", "actions.commit_loss"),
            ("replay_evaluates", "actions.replay"),
            ("preview_admission", "actions.validate"),
            ("incomplete_is_complete", "actions.validate"),
        ):
            with self.subTest(fault=fault):
                fixture = Fixture(fault)
                with self.assertRaises(ConformanceFailure):
                    run_action_case(fixture, case)
                self.assertEqual(fixture.closed, 1)

    def test_mutable_preview_snapshot_alias_cannot_hide_mutation(self):
        class MutableSnapshotFixture(Fixture):
            @contextmanager
            def open(self, case):
                with super().open(case) as scenarios:
                    state = {"journal": []}
                    original = scenarios[0]
                    validate = original.executor.validate

                    def mutate(*args, **kwargs):
                        result = validate(*args, **kwargs)
                        state["journal"].append("unexpected effect")
                        return result

                    original.executor.validate = mutate
                    yield (
                        replace(original, durable_state=lambda: state),
                        *scenarios[1:],
                    )

        fixture = MutableSnapshotFixture()
        with self.assertRaisesRegex(ConformanceFailure, "preview changed state"):
            run_action_case(fixture, "actions.validate")
        self.assertEqual(fixture.closed, 1)

    def test_unknown_empty_duplicate_inventory_refuses(self):
        with self.assertRaises(ValueError):
            run_action_case(Fixture(), "unknown")
        for cases in ((), ("actions.receipt", "actions.receipt")):
            with self.assertRaises(ConformanceFailure):
                run_action_suite(Fixture(), cases=cases)


if __name__ == "__main__":
    unittest.main()

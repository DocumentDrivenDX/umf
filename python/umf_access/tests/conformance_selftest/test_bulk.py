"""Synthetic exercising controls; never native Truss qualification."""

import json
import sys
import unittest
from contextlib import contextmanager
from dataclasses import dataclass, replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from conformance.bulk import BULK_CASES, BulkScenario, run_bulk_case, run_bulk_suite
from conformance.reads import ConformanceFailure


@dataclass(frozen=True)
class Original:
    utf8: bytes
    recovery: object | None
    job: object | None = None


class Plan:
    def __init__(self, name, answer, fault):
        self.name, self.answer, self.fault = name, answer, fault
        self.attempts, self.writes, self.state, self.inputs = 7, 0, [], ()

    def _call(self, inputs):
        self.inputs = inputs
        self.attempts += 0 if self.name.endswith(("refusal", "token_reuse")) else 1
        self.state.append(("original", self.name))
        answer = replace(self.answer)
        if self.fault == "retry":
            self.attempts += 1
        if self.fault == "attempt":
            self.inputs = (*inputs[:-1], object())
        if self.fault == "seal" and len(inputs) == 3:
            self.inputs = (object(), *inputs[1:])
        if self.fault == "key" and len(inputs) == 3:
            self.inputs = (inputs[0], "fresh-key", inputs[2])
        if self.fault == "sdk_write":
            self.writes += 1
        if self.fault == "drop_unknown":
            answer = replace(answer, utf8=b'{"status":"sealed"}')
        if self.fault == "wrong_class":
            return {"utf8": answer.utf8}
        if self.fault == "refusal_is_success" and self.name.endswith("refusal"):
            answer = replace(answer, utf8=b'{"status":"sealed"}')
        if self.fault == "conflict_is_noncommit" and self.name.endswith("noncommit"):
            answer = replace(answer, utf8=b'{"status":"conflict"}')
        if self.fault == "recovery_ref" and self.name.endswith("unknown"):
            answer = replace(answer, recovery=object())
        if self.fault == "invent_job" and self.name.endswith("unknown"):
            answer = replace(answer, job="new-job")
        return answer

    def seal(self, *, attempt):
        return self._call((attempt,))

    def submit(self, sealed, *, submission_key, attempt):
        return self._call((sealed, submission_key, attempt))

    def probe_fresh(self, refusal):
        if self.fault == "fresh_allowed":
            return replace(refusal, utf8=b'{"status":"success"}')
        if self.fault == "fresh_attempt":
            self.attempts += 1
        if self.fault == "fresh_write":
            self.writes += 1
        if self.fault == "fresh_state":
            self.state.append(("fresh", "mutation"))
        if self.fault == "fresh_custody":
            self.answer = replace(self.answer, recovery=object())
        return replace(refusal)

    def recover_control(self, recovery):
        if recovery is not self.answer.recovery:
            raise ConformanceFailure("wrong original recovery")
        if self.fault == "recovery_retry":
            self.attempts += 1
        if self.fault == "recovery_mutation":
            self.state.append(("new-job", "fresh-key"))
        if self.fault == "recovery_write":
            self.writes += 1
        return (
            replace(self.answer, utf8=b"changed")
            if self.fault == "recovery_loss"
            else replace(self.answer)
        )


class Fixture:
    def __init__(self, fault=None):
        self.fault, self.closed = fault, 0

    @contextmanager
    def open(self, case):
        scenarios = []
        outcomes = (
            ("success", "refusal", "token_reuse")
            if case == "bulk.seal_submit"
            else ("noncommit", "unknown")
        )
        for operation in ("seal", "submit"):
            for outcome in outcomes:
                name = operation + "." + outcome
                custody = object() if outcome == "unknown" else None
                answer = Original(
                    (
                        ' {"operation":"'
                        + operation
                        + '","status":"'
                        + outcome
                        + '","future":{"opaque":17}} '
                    ).encode(),
                    custody,
                )
                if self.fault == "always_refusal":
                    answer = replace(answer, utf8=b'{"status":"refusal"}')
                fresh_refusal = Original(
                    b'{"status":"refusal","code":"UNKNOWN_CONTROL_HELD"}', None
                )
                plan = Plan(name, answer, self.fault)
                if self.fault == "execute":
                    plan.execute = lambda: None
                scenarios.append(
                    BulkScenario(
                        name,
                        plan,
                        object(),
                        lambda a=answer: a,
                        lambda a: a.utf8,
                        lambda a: json.loads(a.utf8)["status"],
                        lambda a: a.recovery,
                        lambda a: a.job,
                        lambda p=plan: p.attempts,
                        2
                        if self.fault == "expected_two"
                        else True
                        if self.fault == "expected_bool"
                        else 0
                        if outcome in ("refusal", "token_reuse")
                        else 1,
                        lambda p=plan: p.inputs,
                        lambda p=plan: p.writes,
                        lambda p=plan: (tuple(p.state), id(p.answer.recovery)),
                        sealed=object(),
                        submission_key="stable-key",
                        inspect_seal=lambda _a: (
                            b"changed"
                            if self.fault == "seal_inspection"
                            else b"exact original seal"
                        ),
                        reference_seal=lambda: b"exact original seal",
                        recovered_reference=lambda a=answer: a,
                        probe_fresh_mutation=lambda p=plan, a=fresh_refusal: (
                            p.probe_fresh(a)
                        ),
                        fresh_reference=lambda a=fresh_refusal: a,
                    )
                )
        try:
            yield tuple(scenarios[:-1] if self.fault == "missing" else scenarios)
        finally:
            self.closed += 1


class BulkAssertions(unittest.TestCase):
    # @covers US-087-AC6
    def test_correct_fixture_exercises_all_scenarios(self):
        fixture = Fixture()
        self.assertEqual(run_bulk_suite(fixture), BULK_CASES)
        self.assertEqual(fixture.closed, 2)

    # @covers US-087-AC6
    def test_each_deliberate_fault_is_detected_and_fixture_closed(self):
        cases = {
            "always_refusal": "bulk.seal_submit",
            "expected_two": "bulk.seal_submit",
            "expected_bool": "bulk.seal_submit",
            "fresh_allowed": "bulk.control_recovery",
            "fresh_attempt": "bulk.control_recovery",
            "fresh_write": "bulk.control_recovery",
            "fresh_state": "bulk.control_recovery",
            "fresh_custody": "bulk.control_recovery",
            "retry": "bulk.seal_submit",
            "attempt": "bulk.seal_submit",
            "seal": "bulk.seal_submit",
            "key": "bulk.seal_submit",
            "sdk_write": "bulk.seal_submit",
            "drop_unknown": "bulk.seal_submit",
            "wrong_class": "bulk.seal_submit",
            "refusal_is_success": "bulk.seal_submit",
            "seal_inspection": "bulk.seal_submit",
            "execute": "bulk.seal_submit",
            "missing": "bulk.seal_submit",
            "conflict_is_noncommit": "bulk.control_recovery",
            "recovery_ref": "bulk.control_recovery",
            "invent_job": "bulk.control_recovery",
            "recovery_retry": "bulk.control_recovery",
            "recovery_mutation": "bulk.control_recovery",
            "recovery_write": "bulk.control_recovery",
            "recovery_loss": "bulk.control_recovery",
        }
        for fault, case in cases.items():
            with self.subTest(fault=fault):
                fixture = Fixture(fault)
                with self.assertRaises(ConformanceFailure):
                    run_bulk_case(fixture, case)
                self.assertEqual(fixture.closed, 1)

    # @covers US-087-AC6
    def test_case_inventory_refuses_unknown_empty_and_duplicate(self):
        for cases in ((), ("missing",), (BULK_CASES[0], BULK_CASES[0])):
            with self.subTest(cases=cases), self.assertRaises(ConformanceFailure):
                run_bulk_suite(Fixture(), cases=cases)


if __name__ == "__main__":
    unittest.main()

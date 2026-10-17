"""Suite mutation controls, not evidence of native Truss/Ashlar behavior.

The catalogs are built by the actual installed Weft compiler from the retained
native request. Only target behavior is fake, deliberately, to test detection.
"""

from __future__ import annotations

import json
import sys
import unittest
from contextlib import contextmanager
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import weft
from conformance import (
    READ_CASES,
    ConformanceFailure,
    ReadWitness,
    run_read_case,
    run_read_suite,
)
from umf_access.adoption import TargetIdentity
from umf_access.catalog import Argument, ReadPlan, ReadVariant, TargetPin
from umf_access.engine_catalog import EngineRead
from umf_access.pages import ReadContinuation, ReadPage, StaleContinuation
from umf_access.types import StrictModel


class Parameters(StrictModel):
    status: str


class Row(StrictModel):
    id: str
    status: str


class Key(StrictModel):
    id: str


class NativeRefusal(RuntimeError):
    pass


class Target:
    def __init__(self, identity, rows, fault=None):
        self.pin, self.rows, self.fault = identity, rows, fault
        self.failed, self.transitioned = False, False
        self.calls = 0

    def identity(self):
        if self.fault == "forged_pin":
            return replace(
                self.pin,
                backend_version=self.pin.backend_version + ".conformance-mismatch",
            )
        return self.pin

    def read(self, entry, parameters, **kwargs):
        self.calls += 1
        if self.failed:
            if self.fault == "empty_on_failure":
                return []
            if self.fault == "leaked_closing_rows":
                return list(self.rows)
            if self.fault == "latest_alias_fallback":
                return [Row(id="latest", status="draft")]
            if self.fault == "wrong_refusal":
                raise ValueError("changed native classification")
            raise NativeRefusal("engine refusal")
        return (
            list(reversed(self.rows)) if self.fault == "wrong_rows" else list(self.rows)
        )

    def page(self, entry, parameters, *, after=None, **kwargs):
        self.calls += 1
        if (
            after is not None
            and self.transitioned
            and self.fault != "ignore_continuation"
        ):
            raise StaleContinuation("original publication expired")
        if self.transitioned and self.fault != "fresh_still_old":
            return ReadPage((Row(id="new", status="draft"),), None)
        return ReadPage(
            tuple(self.rows), ReadContinuation(("b",), "initial-publication")
        )


class Fixture:
    def __init__(self, entry, page_entry, *, fault=None):
        self.entry, self.page_entry, self.fault = entry, page_entry, fault
        self.closed = []

    @contextmanager
    def open(self, case):
        identity = TargetIdentity(
            "truss",
            "truss.runtime",
            "0.4.41",
            "selftest-only",
            "a" * 64,
            (("postgresql", "18.6"),),
        )
        pin = TargetPin(
            identity.kind,
            identity.backend_id,
            identity.backend_version,
            identity.target_profile,
            identity.binding_sha256,
            (("postgresql", ("18.6",)),),
        )
        rows = [Row(id="a", status="draft"), Row(id="b", status="draft")]
        if case == "reads.empty_complete":
            rows = []
        target = Target(identity, rows, self.fault)
        page = case == "reads.continuation"
        arguments = {"status": "draft", **({"after": None} if page else {})}
        plan = ReadPlan(
            "selftest_real_compiler",
            "page" if page else "all",
            (Argument("status", str),) + ((Argument("after", object),) if page else ()),
            (
                ReadVariant(
                    (),
                    pin,
                    self.page_entry if page else self.entry,
                    (("status", "status", None),),
                ),
            ),
            cursor_argument="after" if page else None,
            cursor_key_model=Key if page else None,
            key_components=(("id", 0),) if page else (),
        )

        def prepare():
            if page:
                target.transitioned = True
            else:
                target.failed = True

        witness = ReadWitness(
            target,
            plan,
            arguments,
            lambda: tuple(rows),
            prepare,
            NativeRefusal,
            lambda: self.fault != "incomplete_empty",
            lambda: (Row(id="new", status="draft"),),
        )
        try:
            yield witness
        finally:
            self.closed.append(case)


class SharedReadSelftests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Actual current compiler, complete original source/binding request.
        root = Path(__file__).resolve().parents[4]
        evidence = (
            root
            / "docs/helix/04-build/evidence/typed-persistence/main-consolidation-20261016/truss"
        )
        request = json.loads((evidence / "original-engine-request.json").read_bytes())
        page_request = json.loads(
            (evidence / "original-engine-page-request.json").read_bytes()
        )
        cls.entry = EngineRead.build(
            weft, request, parameters=Parameters, result=Row, method="truss-runtime"
        )
        cls.page_entry = EngineRead.build(
            weft,
            page_request,
            parameters=Parameters,
            result=Row,
            method="truss-runtime",
            page_size=2,
        )

    def fixture(self, fault=None):
        return Fixture(self.entry, self.page_entry, fault=fault)

    def test_correct_fixture_exercises_every_case_and_closes(self):
        fixture = self.fixture()
        self.assertEqual(run_read_suite(fixture), READ_CASES)
        self.assertEqual(tuple(fixture.closed), READ_CASES)

    def test_faulty_targets_are_detected_and_fixture_cleanup_runs(self):
        cases = {
            "wrong_rows": "reads.parity",
            "incomplete_empty": "reads.empty_complete",
            "empty_on_failure": "reads.refusal_not_empty",
            "latest_alias_fallback": "reads.alias_repointed",
            "leaked_closing_rows": "reads.withheld_rows",
            "forged_pin": "reads.pin_mismatch",
            "ignore_continuation": "reads.continuation",
            "fresh_still_old": "reads.continuation",
            "wrong_refusal": "reads.alias_renamed",
        }
        for fault, case in cases.items():
            with self.subTest(fault=fault, case=case):
                fixture = self.fixture(fault)
                with self.assertRaises(ConformanceFailure):
                    run_read_case(fixture, case)
                self.assertEqual(fixture.closed, [case])

    def test_unavailable_or_unknown_case_is_not_success(self):
        with self.assertRaises(ValueError):
            run_read_case(self.fixture(), "reads.unspecified")

        class MissingFixture:
            def open(self, case):
                raise RuntimeError("native fixture unavailable")

        with self.assertRaisesRegex(RuntimeError, "unavailable"):
            run_read_case(MissingFixture(), "reads.parity")


if __name__ == "__main__":
    unittest.main()

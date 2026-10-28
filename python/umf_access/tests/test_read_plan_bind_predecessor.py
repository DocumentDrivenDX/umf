"""Freeze ReadPlan.bind ordering around the direct TargetPin.matches call."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from pydantic import BaseModel
from umf_access.catalog import Argument, ReadPlan, ReadVariant, TargetPin
from umf_access.rust_target_pin_host import matches as host_matches

ROOT = Path(__file__).resolve().parents[3]
PACKET = (
    ROOT
    / "docs/helix/04-build/evidence/rust-migration/read-plan-bind-python-predecessor-20261028/packet.json"
)
HISTORICAL_SOURCE_SHA256 = (
    "188e816ccad9ed609c1382ea8090471a5ed1266f412742e69b7800d32ed455ec"
)
HISTORICAL_HARNESS_SHA256 = (
    "4a5fd88e2b83342616adacd11ddb85afb8ff40251fb51866192277e014e35f6b"
)
BASE = {
    "kind": "postgresql",
    "backend_id": "pg",
    "backend_version": "18",
    "target_profile": "profile-a",
    "binding_sha256": "a" * 64,
}
PIN = TargetPin(
    "postgresql", "pg", "18", "profile-a", "a" * 64, (("driver", ("3.2",)),)
)


class Params(BaseModel):
    pass


class TrackingIdentity:
    def __init__(self, trace, *, platform=(("driver", "3.2"),), fail_platform=False):
        self.kind, self.backend_id, self.backend_version = (
            BASE["kind"],
            BASE["backend_id"],
            BASE["backend_version"],
        )
        self.target_profile, self.binding_sha256 = (
            BASE["target_profile"],
            BASE["binding_sha256"],
        )
        self._trace, self._platform, self._fail_platform = (
            trace,
            platform,
            fail_platform,
        )

    @property
    def platform(self):
        self._trace.append("identity.platform")
        if self._fail_platform:
            raise RuntimeError("platform observation failed")
        return self._platform


class Entry:
    def __init__(
        self, label, trace, *, fail=False, fail_selected=False, fail_parameters=False
    ):
        self.label, self.trace, self.fail = label, trace, fail
        self.fail_selected, self.fail_parameters, self.artifact_calls = (
            fail_selected,
            fail_parameters,
            0,
        )
        self.parameters = SimpleNamespace(model_validate=self.model_validate)

    def artifact(self):
        self.trace.append(f"artifact:{self.label}")
        self.artifact_calls += 1
        if self.fail or (self.fail_selected and self.artifact_calls == 2):
            raise RuntimeError(f"artifact {self.label} failed")
        return {"label": self.label}

    def model_validate(self, value, *, strict):
        self.trace.append(f"parameters.model_validate:{self.label}")
        if self.fail_parameters:
            raise RuntimeError(f"parameters {self.label} failed")
        assert strict is True
        return Params.model_validate(value, strict=True)


def execute(case, *, route="public"):
    trace = []
    identity = TrackingIdentity(
        trace,
        platform=(("driver", "9.9"),) if case == "no-match" else (("driver", "3.2"),),
    )

    class Target:
        def identity(self):
            trace.append("target.identity")
            if case == "identity-error":
                raise RuntimeError("identity failed")
            if case == "platform-error":
                return TrackingIdentity(trace, fail_platform=True)
            return identity

    if case == "artifact-error":
        variants = tuple(
            ReadVariant((), PIN, Entry(label, trace, fail=(label == "second")), ())
            for label in ("first", "second")
        )
    elif case == "two-variants":
        wrong = TargetPin(
            "postgresql", "pg", "18", "other-profile", "a" * 64, PIN.platform
        )
        variants = (
            ReadVariant((), wrong, Entry("first", trace), ()),
            ReadVariant((), PIN, Entry("second", trace), ()),
        )
    elif case in ("selected-artifact-error", "parameter-error"):
        entry = Entry(
            "only",
            trace,
            fail_selected=(case == "selected-artifact-error"),
            fail_parameters=(case == "parameter-error"),
        )
        variants = (ReadVariant((), PIN, entry, ()),)
    elif case == "multiple-matches":
        variants = tuple(
            ReadVariant((), PIN, Entry(label, trace), ())
            for label in ("first", "second")
        )
    else:
        variants = (ReadVariant((), PIN, Entry("only", trace), ()),)
    plan = ReadPlan("q", "all", (), variants)
    values = {"unexpected": 1} if case == "inventory-error" else {}
    try:
        if route == "rust":
            from umf_access.rust_read_plan_bind import bind

            variant, params, after = bind(plan, Target(), values)
        else:
            variant, params, after = plan.bind(Target(), values)
        outcome = {
            "result": "success",
            "entry": variant.entry.label,
            "parameters": params.model_dump(),
            "after": after,
        }
    except Exception as exc:  # noqa: BLE001 - capture the exact predecessor error class/message
        outcome = {"error": type(exc).__name__, "message": str(exc)}
    return {"outcome": outcome, "trace": trace}


def execute_host_lazy(case):
    with patch.object(TargetPin, "matches", host_matches):
        return execute(case)


def execute_frozen_python_matcher(case):
    from test_rust_target_pin import python_matches

    with patch.object(TargetPin, "matches", python_matches):
        return execute(case, route="rust")


class ReadPlanBindPredecessorTests(unittest.TestCase):
    def test_historical_packet_matches_frozen_python_matcher_and_effect_order(self):
        from test_rust_target_pin import load_candidate_library

        load_candidate_library()
        packet = json.loads(PACKET.read_text())
        self.assertEqual(packet["format"], "umf-read-plan-bind-python-predecessor/1")
        self.assertEqual(packet["source_sha256"], HISTORICAL_SOURCE_SHA256)
        self.assertEqual(packet["harness_sha256"], HISTORICAL_HARNESS_SHA256)
        self.assertEqual(packet["case_count"], 6)
        self.assertEqual(packet["pass_count"], 6)
        self.assertEqual(packet["mismatch_count"], 0)
        for case in packet["cases"]:
            with self.subTest(case=case["name"]):
                self.assertEqual(
                    execute_frozen_python_matcher(case["name"]),
                    {"outcome": case["outcome"], "trace": case["trace"]},
                )

    def test_host_lazy_candidate_matches_all_six_bind_outcomes_and_traces(self):
        from test_rust_target_pin import load_candidate_library

        load_candidate_library()
        packet = json.loads(PACKET.read_text())
        for case in packet["cases"]:
            with self.subTest(case=case["name"]):
                self.assertEqual(
                    execute_host_lazy(case["name"]),
                    {"outcome": case["outcome"], "trace": case["trace"]},
                )

    def test_public_default_route_preserves_all_six_bind_outcomes_and_traces(self):
        from test_rust_target_pin import load_candidate_library
        from umf_access.rust_read_plan_bind import bind

        load_candidate_library()
        packet = json.loads(PACKET.read_text())
        with patch("umf_access.rust_read_plan_bind.bind", wraps=bind) as rust_bind:
            for case in packet["cases"]:
                with self.subTest(case=case["name"]):
                    self.assertEqual(
                        execute(case["name"]),
                        {"outcome": case["outcome"], "trace": case["trace"]},
                    )
            self.assertEqual(rust_bind.call_count, len(packet["cases"]))

    def test_opt_in_rust_route_preserves_all_six_bind_outcomes_and_traces(self):
        from test_rust_target_pin import load_candidate_library

        load_candidate_library()
        packet = json.loads(PACKET.read_text())
        for case in packet["cases"]:
            with self.subTest(case=case["name"]):
                self.assertEqual(
                    execute(case["name"], route="rust"),
                    {"outcome": case["outcome"], "trace": case["trace"]},
                )

    def test_invalid_inventory_and_continuation_refuse_before_host_callbacks(self):
        from umf_access.dsl import Continuation
        from umf_access.pages import StaleContinuation

        trace = []
        entry = Entry("only", trace)
        variant = ReadVariant((), PIN, entry, ())
        plan = ReadPlan("q", "all", (), (variant,))

        class Target:
            def identity(self):
                trace.append("target.identity")
                return TrackingIdentity(trace)

        with self.assertRaisesRegex(
            Exception, "exact catalog argument inventory required"
        ):
            plan.bind(Target(), {"unexpected": 1})
        self.assertEqual(trace, [])

        cursor_plan = ReadPlan(
            "q",
            "page",
            (Argument("cursor", object),),
            (variant,),
            cursor_argument="cursor",
        )
        cursor = Continuation(object(), (1,), "digest")
        with self.assertRaises(StaleContinuation):
            cursor_plan.bind(Target(), {"cursor": cursor})
        self.assertEqual(trace, [])

    def test_selected_artifact_and_parameter_failures_stop_at_their_callback(self):
        from test_rust_target_pin import load_candidate_library

        load_candidate_library()
        expected = {
            "selected-artifact-error": [
                "artifact:only",
                "target.identity",
                "identity.platform",
                "identity.platform",
                "artifact:only",
            ],
            "parameter-error": [
                "artifact:only",
                "target.identity",
                "identity.platform",
                "identity.platform",
                "artifact:only",
                "parameters.model_validate:only",
            ],
            "multiple-matches": [
                "artifact:first",
                "artifact:second",
                "target.identity",
                "identity.platform",
                "identity.platform",
                "identity.platform",
                "identity.platform",
            ],
        }
        for case, trace in expected.items():
            with self.subTest(case=case):
                result = execute(case)
                self.assertEqual(result["trace"], trace)
                if case == "multiple-matches":
                    self.assertEqual(
                        result["outcome"],
                        {
                            "error": "NotCompiledForTarget",
                            "message": "no unique compiled variant for target identity and argument presence",
                        },
                    )
                else:
                    self.assertEqual(result["outcome"]["error"], "RuntimeError")

    def test_public_route_reraises_the_original_host_exception_object(self):
        from test_rust_target_pin import load_candidate_library

        load_candidate_library()
        trace = []
        sentinel = RuntimeError("identity sentinel")
        plan = ReadPlan(
            "q", "all", (), (ReadVariant((), PIN, Entry("only", trace), ()),)
        )

        class Target:
            def identity(self):
                trace.append("target.identity")
                raise sentinel

        with self.assertRaises(RuntimeError) as caught:
            plan.bind(Target(), {})
        self.assertIs(caught.exception, sentinel)
        self.assertEqual(trace, ["artifact:only", "target.identity"])

    def test_variant_presence_is_observed_after_preflight_and_identity(self):
        from test_rust_target_pin import load_candidate_library

        load_candidate_library()
        trace = []
        sentinel = RuntimeError("presence sentinel")

        class Variant:
            pin = PIN
            parameters = ()

            def __init__(self):
                self.entry = Entry("only", trace)

            @property
            def presence(self):
                trace.append("variant.presence")
                raise sentinel

        variant = Variant()
        plan = ReadPlan("q", "all", (), (variant,))

        class Target:
            def identity(self):
                trace.append("target.identity")
                return TrackingIdentity(trace)

        with self.assertRaises(RuntimeError) as caught:
            plan.bind(Target(), {})
        self.assertIs(caught.exception, sentinel)
        self.assertEqual(
            trace,
            ["artifact:only", "target.identity", "variant.presence"],
        )


if __name__ == "__main__":
    unittest.main()

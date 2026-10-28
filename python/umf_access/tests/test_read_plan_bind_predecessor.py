"""Freeze ReadPlan.bind ordering around the direct TargetPin.matches call."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from types import SimpleNamespace

from pydantic import BaseModel
from umf_access.catalog import ReadPlan, ReadVariant, TargetPin

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
    def __init__(self, label, trace, *, fail=False):
        self.label, self.trace, self.fail = label, trace, fail
        self.parameters = SimpleNamespace(model_validate=self.model_validate)

    def artifact(self):
        self.trace.append(f"artifact:{self.label}")
        if self.fail:
            raise RuntimeError(f"artifact {self.label} failed")
        return {"label": self.label}

    def model_validate(self, value, *, strict):
        self.trace.append(f"parameters.model_validate:{self.label}")
        assert strict is True
        return Params.model_validate(value, strict=True)


def execute(case):
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
    else:
        variants = (ReadVariant((), PIN, Entry("only", trace), ()),)
    plan = ReadPlan("q", "all", (), variants)
    values = {"unexpected": 1} if case == "inventory-error" else {}
    try:
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


class ReadPlanBindPredecessorTests(unittest.TestCase):
    def test_historical_packet_and_current_results_and_effect_order_match(self):
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
                    execute(case["name"]),
                    {"outcome": case["outcome"], "trace": case["trace"]},
                )


if __name__ == "__main__":
    unittest.main()

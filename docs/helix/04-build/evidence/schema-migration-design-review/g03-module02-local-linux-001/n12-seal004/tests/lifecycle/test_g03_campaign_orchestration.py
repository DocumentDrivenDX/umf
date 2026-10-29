# SPDX-License-Identifier: MIT OR Apache-2.0
"""Behavioral controls for the actual fixed G03 serial dispatch loop."""
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from g03_campaign_orchestration import CAMPAIGN_ROSTER, run_g03_fixed_roster


class FixedRosterFenceTests(unittest.TestCase):
    def run_campaign(self, *, fail_at=None, observer=None):
        calls = []
        observed = []

        def dispatch(case_id, scenario):
            calls.append((case_id, scenario))
            if scenario == "ordinary":
                return {"status": "UNQUALIFIED", "cleanup": {"status": "PASS_NO_NATIVE_RESOURCES_CREATED"}}
            status, cleanup = fail_at[1:] if fail_at and fail_at[0] == scenario else ("PASS_SELECTED_NATIVE_SUBCASE", "PASS")
            return {"status": status, "cleanup": {"status": cleanup}}

        def observe():
            observed.append("identity")
            return observer() if observer else "target-A"

        reports, summary = run_g03_fixed_roster(
            dispatch=dispatch, observe_target=observe, expected_target="target-A",
            expected_case_bindings={}, binding={"configurationSha256": "a" * 64})
        return calls, observed, reports, summary

    def assert_fenced(self, calls, observed, reports, *, expected_observations):
        self.assertEqual(calls, [("G03-N01", "transitions")])
        self.assertEqual(len(observed), expected_observations)
        self.assertEqual(len(reports), len(CAMPAIGN_ROSTER))
        self.assertEqual(reports[1]["status"], "UNRUN_PRIOR_CASE_NOT_SETTLED")
        self.assertTrue(all(
            result["status"] == "UNRUN"
            for case in reports[1:-1]
            for result in case["scenarioResults"]
        ))
        self.assertFalse(reports[-1]["executedRosterComplete"])
        self.assertFalse(reports[-1]["nativeQualificationClaim"])

    def test_uncertain_cleanup_fences_later_native_dispatch(self):
        calls, observed, reports, _ = self.run_campaign(
            fail_at=("transitions", "FAIL_CLEANUP_UNCERTAIN", "UNKNOWN"))
        self.assert_fenced(calls, observed, reports, expected_observations=1)

    def test_live_writer_unknown_outcome_fences_later_native_dispatch(self):
        calls, observed, reports, _ = self.run_campaign(
            fail_at=("transitions", "FAIL_OR_UNKNOWN", "PASS"))
        self.assert_fenced(calls, observed, reports, expected_observations=1)

    def test_identity_observer_exception_fences_later_native_dispatch(self):
        def observer_error():
            raise OSError("identity observer unavailable")

        calls, observed, reports, _ = self.run_campaign(observer=observer_error)
        self.assert_fenced(calls, observed, reports, expected_observations=2)
        self.assertEqual(reports[0]["scenarioResults"][0]["status"], "FAIL_OR_UNKNOWN")
        self.assertEqual(reports[0]["scenarioResults"][0]["errorType"], "OSError")

    def test_changed_target_identity_fences_later_native_dispatch(self):
        calls, observed, reports, _ = self.run_campaign(observer=lambda: "target-B")
        self.assert_fenced(calls, observed, reports, expected_observations=2)
        self.assertEqual(reports[0]["scenarioResults"][0]["targetContinuity"], "FAIL")

    def test_complete_ordered_roster_is_reported_without_native_qualification(self):
        calls, _, reports, summary = self.run_campaign()
        expected = [(entry["caseId"], scenario) for entry in CAMPAIGN_ROSTER[:-1]
                    for scenario in entry["scenarios"]]
        self.assertEqual(calls, expected)
        self.assertEqual([item["caseId"] for item in reports], [item["caseId"] for item in CAMPAIGN_ROSTER])
        self.assertTrue(reports[-1]["executedRosterComplete"])
        self.assertFalse(reports[-1]["nativeQualificationClaim"])
        self.assertFalse(summary["nativeQualificationClaim"])
        self.assertEqual(summary["ordinaryN12Status"], "UNQUALIFIED")


if __name__ == "__main__":
    unittest.main()

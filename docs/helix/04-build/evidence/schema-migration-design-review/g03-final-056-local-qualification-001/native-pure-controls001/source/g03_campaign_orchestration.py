# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed G03 campaign serial fence, separated for source-level behavioral controls."""
from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

CAMPAIGN_ROSTER = [
    {"caseId": "G03-N01", "scenarios": ["transitions"]},
    {"caseId": "G03-N02", "scenarios": ["empty"]},
    {"caseId": "G03-N03", "scenarios": ["required"]},
    {"caseId": "G03-N04", "scenarios": ["admission-refusal"]},
    {"caseId": "G03-N05", "scenarios": ["semantic-null", "semantic-decimal"]},
    {"caseId": "G03-N06", "scenarios": ["rollback"]},
    {"caseId": "G03-N07", "scenarios": ["commit-observation", "finalize-observation", "finalize-before-publication"]},
    {"caseId": "G03-N08", "scenarios": ["unknown-no-commit"]},
    {"caseId": "G03-N09", "scenarios": ["writer-barrier"]},
    {"caseId": "G03-N10", "scenarios": ["domain-date", "domain-text", "domain-decimal"]},
    {"caseId": "G03-N11", "scenarios": ["domain-uuid", "domain-currentTimestamp"]},
    {"caseId": "G03-N12", "scenarios": ["ordinary"]},
    {"caseId": "G03-N13", "scenarios": ["tampering"]},
    {"caseId": "G03-N14", "scenarios": ["campaign-cleanup"]},
]

_CLEAN = ("PASS", "PASS_NO_NATIVE_RESOURCES_CREATED")
_UNKNOWN = ("FAIL_CLEANUP_UNCERTAIN", "FAIL_OR_UNKNOWN")


def dispatch_campaign_scenario(
    *,
    case_id: str,
    scenario: str,
    campaign_id: str,
    direct: Callable[[], dict[str, Any]],
    scenario_executor: Callable[[str, str, str], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Use an optional test-harness child executor at the native scenario boundary."""
    if scenario_executor is None:
        return direct()
    return scenario_executor(case_id, scenario, campaign_id)


def run_g03_fixed_roster(
    *,
    dispatch: Callable[[str, str], dict[str, Any]],
    observe_target: Callable[[], object],
    expected_target: object,
    expected_case_bindings: Mapping[str, object],
    binding: dict[str, object],
) -> tuple[list[dict[str, Any]], dict[str, object]]:
    """Run the fixed G03 dispatch order; injected callbacks only cross native boundaries."""
    results: list[dict[str, Any]] = []
    all_cleanups_ok = True
    all_required_cases_pass = True
    ordinary_unqualified = False
    ordinary_passed = False
    abort_campaign = False
    abort_reason: str | None = None

    for roster_entry in CAMPAIGN_ROSTER:
        case_id = roster_entry["caseId"]
        scenarios = roster_entry["scenarios"]
        if abort_campaign and case_id != "G03-N14":
            results.append({
                "caseId": case_id, "status": "UNRUN_PRIOR_CASE_NOT_SETTLED",
                "scenarioResults": [
                    {"scenario": scenario, "status": "UNRUN",
                     "reason": abort_reason or "prior native cleanup or ownership is unresolved",
                     "cleanup": {"status": "NOT_RUN_AFTER_SERIAL_FENCE"},
                     "expectedCaseBinding": expected_case_bindings.get(scenario)}
                    for scenario in scenarios
                ],
                "cleanup": {"status": "NOT_RUN_AFTER_SERIAL_FENCE"},
                "serialFenceReason": abort_reason,
                "expectedScenarioBindings": {scenario: expected_case_bindings.get(scenario) for scenario in scenarios},
                "campaignBinding": binding,
            })
            continue

        if case_id == "G03-N14":
            cleanup_states = [item.get("cleanup", {}).get("status") for item in results
                              if type(item.get("cleanup")) is dict]
            missing_cleanup = [item["caseId"] for item in results
                               if item.get("cleanup", {}).get("status") not in _CLEAN]
            all_cleanups_ok = not missing_cleanup
            executed_roster_complete = (
                len(results) == len(CAMPAIGN_ROSTER) - 1
                and len(CAMPAIGN_ROSTER) == 14
                and all(
                    type(item.get("scenarioResults")) is list
                    and [entry.get("scenario") for entry in item["scenarioResults"]] == expected_entry["scenarios"]
                    and all(entry.get("status") != "UNRUN" for entry in item["scenarioResults"])
                    for item, expected_entry in zip(results, CAMPAIGN_ROSTER[:-1])
                )
            )
            try:
                final_target_observation = observe_target()
                final_target_error = None
            except Exception as error:
                final_target_observation = None
                final_target_error = type(error).__name__
            captured_resource_bindings = [
                scenario.get("campaignBinding")
                for case in results
                for scenario in case.get("scenarioResults", [])
                if type(scenario) is dict and type(scenario.get("campaignBinding")) is dict
            ]
            results.append({
                "caseId": case_id,
                "status": "PARTIAL_CLEANUP_PASS_FULL_CASE_OPEN" if all_cleanups_ok and final_target_error is None else "FAIL_CLEANUP_UNCERTAIN",
                "executedRosterComplete": executed_roster_complete,
                "perCaseCleanupStatuses": cleanup_states,
                "missingOrFailedCleanupCases": missing_cleanup,
                "finalTargetObservation": final_target_observation,
                "finalTargetObservationError": final_target_error,
                "capturedResourceBindings": captured_resource_bindings,
                "nativeQualificationClaim": False,
                "campaignBinding": binding,
            })
            continue

        scenario_results: list[dict[str, Any]] = []
        for scenario_index, scenario in enumerate(scenarios):
            try:
                case = dispatch(case_id, scenario)
                case["scenario"] = scenario
                owned_resources = {"database": case.get("database"), "schema": case.get("schema"),
                                   "roles": case.get("roleNames", [])}
                if scenario == "ordinary":
                    ordinary = case.get("ordinaryN12", {})
                    owned_resources["additionalSchemas"] = ordinary.get("schemasCovered", [])[1:]
                    owned_resources["logicalRoleNames"] = case.get("logicalRoleNames", [])
                    owned_resources["allOwnedRoleNames"] = case.get("allOwnedRoleNames", [])
                case["campaignBinding"] = {**binding, "scenario": scenario,
                    "caseConfigurationSha256": case.get("configurationSha256", binding["configurationSha256"]),
                    "ownedResourceNames": owned_resources,
                    "expectedCaseBinding": expected_case_bindings.get(scenario)}
                cleanup_status = case.get("cleanup", {}).get("status")
                unresolved_status = case.get("status") in _UNKNOWN
                if cleanup_status not in _CLEAN or unresolved_status:
                    all_cleanups_ok = False
                    all_required_cases_pass = False
                    abort_campaign = True
                    abort_reason = "prior scenario cleanup or native ownership is unresolved"
                    case["serialFence"] = "later native dispatch refused"
                if case.get("status") in ("FAIL", "FAIL_CLEANUP_UNCERTAIN"):
                    all_required_cases_pass = False
                if scenario.startswith("domain-") and not str(case.get("status", "")).startswith("PASS_SELECTED_NATIVE_SUBCASE"):
                    all_required_cases_pass = False
                if scenario == "ordinary":
                    ordinary_passed = case.get("status") == "PASS" and cleanup_status in _CLEAN
                    ordinary_unqualified = not ordinary_passed
                    if not ordinary_passed:
                        all_required_cases_pass = False
                if not abort_campaign:
                    if observe_target() != expected_target:
                        all_required_cases_pass = False
                        case["targetContinuity"] = "FAIL"
                        all_cleanups_ok = False
                        abort_campaign = True
                        abort_reason = "campaign target identity changed"
                        case["serialFence"] = "later native dispatch refused"
                    else:
                        case["targetContinuity"] = "PASS"
                scenario_results.append(case)
                if abort_campaign:
                    scenario_results.extend(
                        {"scenario": remaining, "status": "UNRUN",
                         "reason": abort_reason or "prior native cleanup or ownership is unresolved",
                         "cleanup": {"status": "NOT_RUN_AFTER_SERIAL_FENCE"},
                         "expectedCaseBinding": expected_case_bindings.get(remaining)}
                        for remaining in scenarios[scenario_index + 1:]
                    )
                    break
            except Exception as error:
                all_required_cases_pass = False
                abort_campaign = True
                abort_reason = "prior scenario outcome or cleanup is unresolved"
                scenario_results.append({"caseId": case_id, "scenario": scenario, "status": "FAIL_OR_UNKNOWN",
                    "errorType": type(error).__name__, "cleanup": {"status": "UNKNOWN"},
                    "expectedCaseBinding": expected_case_bindings.get(scenario),
                    "campaignBinding": {**binding, "scenario": scenario}})
                all_cleanups_ok = False
                scenario_results.extend(
                    {"scenario": remaining, "status": "UNRUN", "reason": abort_reason,
                     "cleanup": {"status": "NOT_RUN_AFTER_SERIAL_FENCE"},
                     "expectedCaseBinding": expected_case_bindings.get(remaining)}
                    for remaining in scenarios[scenario_index + 1:]
                )
                break

        cleanup_statuses = [item.get("cleanup", {}).get("status") for item in scenario_results
                            if type(item.get("cleanup")) is dict]
        cleanup_pass = len(cleanup_statuses) == len(scenario_results) and all(status in _CLEAN for status in cleanup_statuses)
        if not cleanup_pass:
            all_cleanups_ok = False
        case_report: dict[str, Any] = {"caseId": case_id, "scenarioResults": scenario_results,
            "cleanup": {"status": "PASS" if cleanup_pass else "FAIL_OR_UNKNOWN", "subcaseStatuses": cleanup_statuses},
            "campaignBinding": binding}
        if abort_campaign:
            case_report["serialFenceReason"] = abort_reason
        if any(item.get("status") in (*_UNKNOWN, "FAIL", "FAIL_OR_UNKNOWN", "FAIL_CLEANUP_UNCERTAIN") for item in scenario_results):
            case_report["status"] = "FAIL_OR_UNKNOWN"
        elif any(item.get("status") == "UNQUALIFIED" for item in scenario_results):
            case_report["status"] = "UNQUALIFIED"
        elif case_id == "G03-N12" and ordinary_passed:
            case_report["status"] = "PASS"
        else:
            case_report["status"] = "PARTIAL_SUBCASES_PASS_FULL_CASE_OPEN"
        results.append(case_report)

    from g03_campaign_predicates import evaluate_campaign
    predicate_report = evaluate_campaign(results, expected_case_bindings=expected_case_bindings,
        expected_target=expected_target,
        final_target_observation=(results[-1].get("finalTargetObservation") if results else None))
    for case, predicate in zip(results, predicate_report["casePredicates"]):
        case["evidencePredicate"] = predicate
    all_required_cases_pass = predicate_report["predicatePassed"]
    summary = {"cleanupStatus": "PASS_PARTIAL" if all_cleanups_ok else "FAIL_OR_UNKNOWN",
               "ordinaryN12Status": "PASS" if ordinary_passed else ("UNQUALIFIED" if ordinary_unqualified else "NOT_RUN"),
               "nativeQualificationClaim": False,
               "allRequiredCasesPass": all_required_cases_pass,
               "casePredicates": predicate_report["casePredicates"],
               "fullyPassed": (len(results) == len(CAMPAIGN_ROSTER) and all_cleanups_ok and all_required_cases_pass
                   and ordinary_passed and not ordinary_unqualified)}
    return results, summary

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Single-fact controls for the G03 campaign evidence conjunctions."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from g03_campaign_predicates import _ordinary_required_checks, _scenario_predicate, evaluate_case
from g03_campaign_orchestration import CAMPAIGN_ROSTER


def cleanup():
    return {"status": "PASS", "errors": []}, {
        "ownedDatabaseAbsent": True, "ownedRolesAbsent": True,
        "targetIdentityUnchanged": True,
        "schemaAndTableAbsentByOwnedDatabaseRemoval": True,
    }


def transition_report():
    c, v = cleanup()
    rows = [["a", "g03a_fixture", 1, "42", "901", "(0,1)"]]
    steps = []
    progress = []
    for index, (variant, value) in enumerate((
            ("set5", "'5'::numeric"), ("set9", "'9'::numeric"), ("drop", None)), start=1):
        phase_digest = str(index) * 64
        progress.append({"state": "complete", "phaseIndex": 1, "phaseDigest": phase_digest,
                         "completedSteps": [f"step-{index}"]})
        steps.append({"variant": variant, "nativeDdlDispatches": 1,
            "candidate": {"id": f"candidate-{index}", "kind": "change-default",
                          "oldDigest": "a" * 64, "newDigest": str(index) * 64},
            "migrationId": f"migration-{index}", "planDigest": str(index + 3) * 64,
            "fileDigest": "d" * 64, "approvalReceiptId": f"approval-{index}",
            "expectedHead": "e" * 64,
            "completedPhase": {"phaseIndex": 1, "phaseDigest": phase_digest,
                                "completedSteps": [f"step-{index}"]},
            "verifiedPhaseReceipt": {"verification": "verify_completed_progress",
                                      "phaseIndex": 1, "phaseDigest": phase_digest,
                                      "completedSteps": [f"step-{index}"]},
            "expectedPhaseSteps": [f"step-{index}"],
            "hostResult": {"status": "applied", "headDigest": "f" * 64},
            "before": {"rows": rows, "relationFileNode": 99, "columnDefault": value,
                       "columnNativeType": {"oid": 23, "typeName": "int4", "formatted": "integer"}},
            "after": {"rows": rows, "relationFileNode": 99, "columnDefault": value,
                      "columnNativeType": {"oid": 23, "typeName": "int4", "formatted": "integer"}},
            "futureWritesAsPerson": [
                {"kind": "omitted", "actual": {"set5": 5, "set9": 9, "drop": None}[variant]},
                {"kind": "null", "actual": None}, {"kind": "explicit13", "actual": 13}],
        })
    return {"scenario": "transitions", "status": "PASS_SELECTED_NATIVE_SUBCASE_FULL_CASE_OPEN",
        "historicalRows": [["a", "Alice", 1]],
        "roleNames": ["owner", "person", "batch", "g03a_fixture", "g03z_fixture"],
        "cleanup": c, "cleanupVerification": v, "steps": steps,
        "defaultStatementDispatches": 3,
        "progressReads": progress}


def ordinary_report():
    c, v = cleanup()
    roles = ["g03o_fixture", "g03p_fixture", "g03b_fixture", "g03a_fixture", "g03z_fixture"]
    logical_roles = ["g03lo_fixture", "g03lp_fixture", "g03lb_fixture"]
    all_roles = roles + logical_roles
    identities = [
        {"oid": str(index + 100), "name": name, "superuser": False,
         "bypassRls": False, "createDatabase": False, "createRole": False,
         "replication": False, "login": False}
        for index, name in enumerate(all_roles)
    ]
    membership_rows = [["106", "103", False, True, False],
                        ["106", "104", False, True, False]]
    routes = [
        {"adapter": adapter, "profile": profile, "sourceFamily": family, "status": status}
        for adapter, profile, family, status in (
            ("sync", "weft.table-operation-module/0.1", "native-only", "admitted"),
            ("sync", "weft.table-operation-module/0.2", "native-only", "admitted"),
            ("async", "weft.table-operation-module/0.1", "native-only", "admitted"),
            ("async", "weft.table-operation-module/0.2", "native-only", "admitted"),
            ("sync", "weft.table-operation-module/0.2", "logical-matching", "admitted"),
            ("async", "weft.table-operation-module/0.2", "logical-matching", "admitted"),
            ("sync", "weft.table-operation-module/0.1", "logical-matching", "refused-before-lease"),
            ("async", "weft.table-operation-module/0.1", "logical-matching", "refused-before-lease"),
        )]
    occupied = [{"direction": suffix,
        "firstProfile": ("weft.table-operation-module/0.1" if suffix == "cross-a" else "weft.table-operation-module/0.2"),
        "secondProfile": ("weft.table-operation-module/0.2" if suffix == "cross-a" else "weft.table-operation-module/0.1"),
        "principalOid": 1, "keyDigest": f"slot{i}", "expectedSlot": f"slot{i}",
        "slotRowsBefore": [[1, f"slot{i}"]], "slotRowsAfter": [[1, f"slot{i}"]],
        "beforeRowCount": 3, "afterRowCount": 3, "sameProfileRecovery": "recovered",
        "effectRow": ["g03_n12_"+suffix, "g03a_fixture", 23]}
        for i, suffix in ((1, "cross-a"), (2, "cross-b"))]
    recovery = [
        {"kind": "sync-caller-rollback", "afterRollback": "not-observed"},
        {"kind": "async-caller-rollback", "afterRollback": "not-observed"},
        {"kind": "sync-lost-commit", "classification": "unknown", "recovered": "recovered", "effectCount": 1},
        {"kind": "async-lost-commit", "classification": "unknown", "recovered": "recovered", "effectCount": 1},
    ]
    rows = [["a", "g03a_fixture", None], ["b", "g03z_fixture", 2], ["c", "g03a_fixture", 9]]
    proof = {"status": "applied", "beforeDefault": "'5'::numeric", "afterDefault": "'9'::numeric",
             "beforeNativeType": {"oid": 23, "typeName": "int4", "formatted": "integer"},
             "afterNativeType": {"oid": 23, "typeName": "int4", "formatted": "integer"},
             "beforeRows": rows, "afterRows": rows, "migrationId": "mig", "approvalId": "approval",
             "planDigest": "a"*64, "fileDigest": "b"*64, "oldHeadDigest": "c"*64,
             "newHeadDigest": "d"*64, "sourceDigest": "e"*64, "bundleDigest": "f"*64,
             "oldGeneration": 1, "newGeneration": 2}
    evidence = {"profileMatrix": routes, "occupiedSlotObservations": occupied,
        "logicalRoleMembershipWitness": {
            "logicalRootRoleNames": logical_roles,
            "logicalRootRoleIdentities": [
                [str(105 + index), name, False, False, False, False, False, False]
                for index, name in enumerate(logical_roles)],
            "personMembershipRows": membership_rows,
            "expectedPersonMembershipRows": membership_rows},
        "verifierInputControls": {"principalOid": 1, "keyDigest": "slot", "changedInputRefusal": "refused", "rotatedSecretRefusal": "refused",
                                  "slotRows": [[1, "slot"]], "effectRows": [["g03_n12_stable_slot", "g03a_fixture", 41]]},
        "recoveryObservations": recovery, "generationTransition": proof,
        "nativeRowsBefore": rows, "nativeRowsAfter": rows,
        "nativeHistoricalRowsAfter": rows,
        "logicalRowsBefore": rows,
        "logicalRowsAfter": rows + [["g03_n12_logical", "g03a_fixture", 32],
            ["g03_n12_logical_null", "g03a_fixture", None],
            ["g03_n12_logical_value", "g03a_fixture", 31]],
        "logicalAsyncRowsAfter": rows + [["g03_n12_logical", "g03a_fixture", 32],
            ["g03_n12_logical_null", "g03a_fixture", None],
            ["g03_n12_logical_value", "g03a_fixture", 31],
            ["g03_n12_logical_async", "g03z_fixture", 34],
            ["g03_n12_logical_async_null", "g03z_fixture", None],
            ["g03_n12_logical_async_value", "g03z_fixture", 33]]}
    checks = sorted(_ordinary_required_checks())
    preflight_receipts = [
        {"family": "native-only", "profile": profile,
         "configurationSha256": "f" * 64,
         "disposition": "admitted-all-ordinary-operations-and-query"}
        for profile in ("weft.table-operation-module/0.1", "weft.table-operation-module/0.2")
    ] + [
        {"family": "logical-matching", "profile": "weft.table-operation-module/0.1",
         "configurationSha256": "e" * 64, "disposition": "expected-source-admission-refusal"},
        {"family": "logical-matching", "profile": "weft.table-operation-module/0.2",
         "configurationSha256": "e" * 64, "disposition": "admitted-all-ordinary-operations-and-query"},
    ]
    return {"scenario": "ordinary", "status": "PASS", "roleNames": roles,
        "logicalRoleNames": logical_roles, "allOwnedRoleNames": all_roles,
        "createdRoleIdentities": identities, "configurationSha256": "f" * 64, "cleanup": c,
        "cleanupVerification": v,
        "ordinarySourceAdmissionPreflight": {"status": "PASS_SOURCE_ADMISSION_BEFORE_TARGET_RESOURCES",
            "databaseLeases": 0, "businessEffects": 0, "receipts": preflight_receipts},
        "ordinaryN12": {"status": "PASS", "checks": checks, "checkCount": len(checks),
                         "logicalConfigurationSha256": "e" * 64,
                         "structuredEvidence": evidence}}


def required_report():
    report = transition_report()
    report["scenario"] = "required"
    report["steps"] = report["steps"][:2]
    report["steps"][0]["variant"] = "requiredSet9"
    report["steps"][0]["after"]["columnDefault"] = "'9'::numeric"
    report["steps"][0]["futureWritesAsPerson"] = [
        {"kind": "omitted", "actual": 9}, {"kind": "null", "sqlstate": "23502"},
        {"kind": "explicit13", "actual": 13}]
    report["steps"][1]["variant"] = "requiredDrop"
    report["steps"][1]["after"]["columnDefault"] = None
    report["steps"][1]["futureWritesAsPerson"] = [
        {"kind": "omitted", "sqlstate": "23502"}, {"kind": "null", "sqlstate": "23502"},
        {"kind": "explicit13", "actual": 13}]
    report["defaultStatementDispatches"] = 2
    report["progressReads"] = report["progressReads"][:2]
    report["initialRequiredWritesAsPerson"] = [
        {"kind": "omitted", "actual": 5}, {"kind": "null", "sqlstate": "23502"},
        {"kind": "explicit13", "actual": 13}]
    return report


def commit_observation_report():
    report = transition_report()
    report["scenario"] = "commit-observation"
    report["steps"] = report["steps"][:1]
    report["steps"][0]["variant"] = "set5"
    report["steps"][0]["after"]["columnDefault"] = "'5'::numeric"
    report["steps"][0]["hostResult"] = {"status": "applied", "headDigest": "h" * 64,
                                          "generation": 7}
    report["defaultStatementDispatches"] = 1
    report["progressReads"] = report["progressReads"][:1]
    report["lostResponseInjected"] = "after-real-required-phase-commit"
    report["sameOriginalReplay"] = {"status": "already-applied", "headDigest": "h" * 64,
                                    "generation": 7}
    return report


class CampaignPredicateTests(unittest.TestCase):
    def test_complete_transitions_pass_and_single_fact_mutations_open(self):
        original = transition_report()
        self.assertEqual(_scenario_predicate("G03-N01", "transitions", original), [])
        mutations = (
            lambda x: x["steps"][1].update(variant="drop"),
            lambda x: x["steps"][0].update(nativeDdlDispatches=0),
            lambda x: x["steps"][0]["after"].update(columnDefault="5"),
            lambda x: x["steps"][1]["after"].update(columnDefault="'9'::int4"),
            lambda x: x["steps"][0]["before"].update(columnNativeType={"oid": 1700, "typeName": "numeric", "formatted": "numeric"}),
            lambda x: x["steps"][1]["after"].update(relationFileNode=100),
            lambda x: x["steps"][2]["futureWritesAsPerson"][0].update(actual=9),
            lambda x: x["progressReads"].pop(),
            lambda x: x["steps"][0]["verifiedPhaseReceipt"].update(phaseDigest="0" * 64),
            lambda x: x["steps"].append({"variant": "unexpected"}),
        )
        for mutate in mutations:
            changed = copy.deepcopy(original)
            mutate(changed)
            self.assertTrue(_scenario_predicate("G03-N01", "transitions", changed))
            self.assertEqual(changed["status"], original["status"])

    def test_required_initial_matrix_requires_explicit_value(self):
        original = required_report()
        self.assertEqual(_scenario_predicate("G03-N03", "required", original), [])
        changed = copy.deepcopy(original)
        changed["initialRequiredWritesAsPerson"] = [
            item for item in changed["initialRequiredWritesAsPerson"] if item["kind"] != "explicit13"]
        self.assertIn("initial-required-explicit-value",
                      _scenario_predicate("G03-N03", "required", changed))

    def test_commit_observation_requires_same_request_replay_without_redispatch(self):
        original = commit_observation_report()
        self.assertEqual(_scenario_predicate("G03-N07", "commit-observation", original), [])
        mutations = (
            lambda x: x.pop("sameOriginalReplay"),
            lambda x: x["sameOriginalReplay"].update(generation=8),
            lambda x: x.update(defaultStatementDispatches=2),
        )
        for mutate in mutations:
            changed = copy.deepcopy(original)
            mutate(changed)
            self.assertIn("same-original-head-generation-replay-without-redispatch",
                          _scenario_predicate("G03-N07", "commit-observation", changed))

    def test_domain_cases_require_portable_compile_only_controls(self):
        report = transition_report()
        report["scenario"] = "domain-date"
        report["steps"] = report["steps"][:1]
        report["steps"][0]["variant"] = "date"
        report["steps"][0]["nativeDomainFutureWritesAsPerson"] = {"omitted": "2000-02-29"}
        report["defaultStatementDispatches"] = 1
        report["progressReads"] = report["progressReads"][:1]
        report["compileOnlyRefusals"] = [
            {"id": name, "status": "blocked", "diagnosticCodes": ["fixture-refusal"]}
            for name in ("invalid-gregorian-date", "wrong-date-carrier", "wrong-date-native-domain",
                         "temporal-logical-default", "numeric-capacity-overflow")]
        self.assertEqual(_scenario_predicate("G03-N10", "domain-date", report), [])
        report["compileOnlyRefusals"].pop()
        self.assertIn("portable-malformed-domain-refusal-controls",
                      _scenario_predicate("G03-N10", "domain-date", report))

    def test_n12_requires_structured_native_and_logical_witnesses(self):
        original = ordinary_report()
        self.assertEqual(_scenario_predicate("G03-N12", "ordinary", original), [])
        mutations = (
            lambda x: x["ordinaryN12"]["structuredEvidence"]["profileMatrix"].pop(),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["profileMatrix"].__setitem__(
                1, copy.deepcopy(x["ordinaryN12"]["structuredEvidence"]["profileMatrix"][0])),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["occupiedSlotObservations"][0].update(afterRowCount=4),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["occupiedSlotObservations"][1].update(direction="cross-a"),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["occupiedSlotObservations"][0]["slotRowsAfter"].__setitem__(
                0, [2, "slot1"]),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["recoveryObservations"][2].update(effectCount=2),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["generationTransition"].update(afterDefault="'10'::numeric"),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["generationTransition"].update(beforeDefault="5"),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["generationTransition"].update(afterDefault="'9'::int4"),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["generationTransition"].update(afterDefault="'09'::numeric"),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["generationTransition"].update(afterNativeType={"oid": 1700, "typeName": "numeric", "formatted": "numeric"}),
            lambda x: x["ordinaryN12"]["structuredEvidence"].update(logicalRowsAfter=[]),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["logicalRowsAfter"][3].__setitem__(2, 99),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["logicalAsyncRowsAfter"][6].__setitem__(2, 99),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["occupiedSlotObservations"][0]["effectRow"].__setitem__(1, "alice"),
            lambda x: x["logicalRoleNames"].pop(),
            lambda x: x["allOwnedRoleNames"].reverse(),
            lambda x: x["createdRoleIdentities"][7].update(oid=x["createdRoleIdentities"][6]["oid"]),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["logicalRoleMembershipWitness"]["logicalRootRoleIdentities"][1].__setitem__(0, "105"),
            lambda x: x["ordinaryN12"]["structuredEvidence"]["logicalRoleMembershipWitness"]["personMembershipRows"][0].__setitem__(3, False),
            lambda x: x["ordinarySourceAdmissionPreflight"]["receipts"][3].update(configurationSha256="0" * 64),
        )
        for mutate in mutations:
            changed = copy.deepcopy(original)
            mutate(changed)
            self.assertTrue(_scenario_predicate("G03-N12", "ordinary", changed))
            self.assertEqual(changed["status"], original["status"])

    def test_n14_requires_fresh_target_and_exact_cleanup_roster(self):
        report = {"caseId": "G03-N14", "executedRosterComplete": True,
                  "missingOrFailedCleanupCases": [],
                  "perCaseCleanupStatuses": ["PASS"] * 13,
                  "capturedResourceBindings": [{"scenario": scenario}
                      for entry in CAMPAIGN_ROSTER[:-1] for scenario in entry["scenarios"]]}
        self.assertTrue(evaluate_case("G03-N14", report, expected_case_bindings={},
                                      expected_target={"id": 1},
                                      final_target_observation={"id": 1})["predicatePassed"])
        report["executedRosterComplete"] = False
        result = evaluate_case("G03-N14", report, expected_case_bindings={},
                               expected_target={"id": 1}, final_target_observation={"id": 1})
        self.assertFalse(result["predicatePassed"])
        self.assertIn("complete-prior-13-case-roster", result["missingRequirements"])


if __name__ == "__main__":
    unittest.main()

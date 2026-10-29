# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit evidence conjunctions for the fixed G03 campaign; raw statuses are untouched."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from g03_campaign_orchestration import CAMPAIGN_ROSTER


_CASE_SCENARIOS = {entry["caseId"]: entry["scenarios"] for entry in CAMPAIGN_ROSTER}
_GOOD_SCENARIO_STATUSES = {"PASS_SELECTED_NATIVE_SUBCASE_FULL_CASE_OPEN"}
_MODULE_01 = "weft.table-operation-module/0.1"
_MODULE_02 = "weft.table-operation-module/0.2"


def _ordinary_required_checks() -> set[str]:
    checks = {"native-family-historical-baseline", "same-profile-changed-input-observe-refusal",
              "same-profile-secret-rotation-observe-refusal",
              "same-profile-verifier-input-variation-preserves-one-slot-and-effect",
              "caller-rollback-removes-effect-and-outcome",
              "sync-lost-commit-response-classified-unknown", "sync-lost-commit-observed-with-one-effect",
              "async-lost-commit-response-classified-unknown", "async-lost-commit-observed-with-one-effect",
              "async-caller-rollback-removes-effect-and-outcome", "source-derived-next-generation-was-applied",
              "same-profile-new-generation-occupied-slot-refusal",
              "new-generation-refusal-keeps-one-physical-slot-and-effect",
              "logical-family-dedicated-root-roles-and-person-membership",
              "logical-matching-selected-read-and-query", "logical-selected-sync-omitted-default-witness-before-update",
              "logical-matching-selected-profile-and-independent-default",
              "logical-matching-refused-by-legacy-before-lease", "logical-legacy-refusal-precedes-lease",
              "logical-legacy-refusal-had-no-business-effect",
              "logical-matching-async-selected-read-query-write-null-value-update-replay-observe",
              "logical-matching-async-legacy-refusal", "logical-async-legacy-refusal-precedes-lease",
              "logical-async-legacy-refusal-had-no-business-effect",
              "historical-rows-retained-after-all-adapter-effects"}
    for prefix in ("sync-01", "sync-02"):
        checks.update(prefix+"-"+suffix for suffix in ("native-read-page", "same-profile-cursor",
            "declared-query-preserves-null", "omitted-write-observed-default-before-update",
            "explicit-null-and-value", "targeted-update", "same-profile-replay-and-observe",
            "independent-row-observation"))
    for prefix in ("async-01", "async-02"):
        checks.update(prefix+"-"+suffix for suffix in ("native-read-page", "same-profile-cursor",
            "declared-query", "omitted-write-observed-default-before-update",
            "omitted-null-value-update-observed"))
    for direction in ("legacy-to-selected", "selected-to-legacy"):
        checks.update(("same-profile-source-owner-"+direction, "source-owner-"+direction,
                      "cursor-"+direction, "same-profile-async-source-owner-async-"+direction,
                      "async-source-owner-async-"+direction, "async-cursor-async-"+direction))
    for suffix in ("cross-a", "cross-b"):
        checks.update(("occupied-slot-independent-slot-derivation-"+suffix,
                       "occupied-slot-cross-profile-observe-refusal-"+suffix,
                       "occupied-slot-incompatible-"+suffix,
                       "occupied-slot-one-effect-and-same-profile-recovery-"+suffix))
    return checks


def _dict(value: object) -> dict[str, Any]:
    return value if type(value) is dict else {}


def _list(value: object) -> list[Any]:
    return value if type(value) is list else []


def _json_value_matches(actual: Any, expected: Any) -> bool:
    """Compare parsed JSON values without Python bool/int or int/float aliasing."""
    if type(actual) is not type(expected):
        return False
    if type(actual) is dict:
        return (actual.keys() == expected.keys()
                and all(_json_value_matches(actual[key], expected[key]) for key in expected))
    if type(actual) is list:
        return len(actual) == len(expected) and all(
            _json_value_matches(left, right) for left, right in zip(actual, expected))
    return actual == expected


_FIXTURE_SEED_ROWS = {
    "empty": (), "semantic-null": (), "semantic-decimal": (),
    "nullable": (("a", "alice", None), ("b", "bob", 2), ("c", "alice", 9)),
    "required": (("ra", "alice", 1), ("rb", "bob", 2), ("rc", "alice", 9)),
    "domain-date": (("date-1", "alice", {"$type": "date", "value": "1999-12-31"}),),
    "domain-text": (("text-1", "bob", "retained 🧭 text"),),
    "domain-decimal": (("decimal-1", "alice", {"$type": "decimal", "value": "2.25"}),),
    "domain-uuid": (("uuid-1", "bob", {"$type": "uuid", "value": "00000000-0000-4000-8000-000000000002"}),),
    "domain-currentTimestamp": (("timestamp-1", "alice", {"$type": "datetime", "value": "1999-12-31T00:00:00+00:00"}),),
}


def _fixture_rows_for(scenario: str, expected_binding: Mapping[str, Any]) -> list[list[Any]] | None:
    roles = _list(expected_binding.get("roleNames"))
    database = expected_binding.get("database")
    if (len(roles) != 5 or type(database) is not str
            or not database.startswith("g03_") or len(database) != 14
            or roles != ["g03o_"+database[4:], "g03p_"+database[4:], "g03b_"+database[4:],
                         "g03a_"+database[4:], "g03z_"+database[4:]]):
        return None
    seed_key = "required" if scenario == "required" else (
        scenario if scenario in _FIXTURE_SEED_ROWS else "nullable")
    seed = _FIXTURE_SEED_ROWS.get(seed_key, ())
    expected = [[row_id, roles[3] if owner == "alice" else roles[4], value]
                for row_id, owner, value in seed]
    if scenario == "required":
        expected.extend([[f"{database}_initial_omitted", roles[3], 5],
                         [f"{database}_initial_explicit13", roles[3], 13]])
    return expected


def _fixture_historical_rows(scenario: str) -> list[list[Any]]:
    seed_key = "required" if scenario == "required" else (
        scenario if scenario in _FIXTURE_SEED_ROWS else "nullable")
    return [[row_id, "Alice" if owner == "alice" else "Bob", value]
            for row_id, owner, value in _FIXTURE_SEED_ROWS.get(seed_key, ())]


def _successful_probe_values(step: Mapping[str, Any], variant: str) -> list[tuple[str, Any]] | None:
    values = {"set5": 5, "set9": 9, "drop": None,
              "requiredSet9": 9, "requiredDrop": None}
    expected = values.get(variant, object())
    probes = _list(step.get("futureWritesAsPerson"))
    if (len(probes) != 3
            or [_dict(p).get("kind") for p in probes] != ["omitted", "null", "explicit13"]):
        return None
    by_kind = {_dict(p).get("kind"): _dict(p) for p in probes}
    expected_values = {"omitted": expected, "null": None, "explicit13": 13}
    if variant in ("requiredSet9", "requiredDrop"):
        expected_values["null"] = "REFUSED"
    if variant == "requiredDrop":
        expected_values["omitted"] = "REFUSED"
    for kind, val in expected_values.items():
        row = by_kind[kind]
        if val == "REFUSED":
            if (set(row) != {"kind", "expected", "sqlstate"}
                    or row.get("sqlstate") != "23502" or row.get("expected") != "23502"
                    or row.get("actual") is not None):
                return None
        elif (set(row) != {"kind", "expected", "actual"}
                or not _json_value_matches(row.get("actual"), val)
                or not _json_value_matches(row.get("expected"), val)):
            return None
    return [(kind, val) for kind, val in expected_values.items() if val != "REFUSED"]


def _initial_required_probe_matrix(value: object) -> bool:
    probes = _list(value)
    if len(probes) != 3 or [_dict(item).get("kind") for item in probes] != ["omitted", "null", "explicit13"]:
        return False
    omitted, null, explicit = map(_dict, probes)
    return (_json_value_matches(omitted, {"kind": "omitted", "expected": 5, "actual": 5})
            and _json_value_matches(null, {"kind": "null", "expected": "23502", "sqlstate": "23502"})
            and _json_value_matches(explicit, {"kind": "explicit13", "expected": 13, "actual": 13}))


def _historical_values_match(observed: object, expected_manual: list[list[Any]] | None,
                             expected_probes: list[list[Any]]) -> bool:
    if expected_manual is None or type(observed) is not list:
        return False
    actual = []
    for item in observed:
        if type(item) is not list or len(item) != 6 or type(item[0]) is not str:
            return False
        actual.append(item[:3])
    expected = expected_manual + expected_probes
    if len(actual) != len(expected):
        return False
    ordered_actual=sorted(actual,key=lambda row:row[0])
    ordered_expected=sorted(expected,key=lambda row:row[0])
    return all(_json_value_matches(left,right) for left,right in zip(ordered_actual,ordered_expected))


def _cleanup_ok(report: Mapping[str, Any]) -> bool:
    cleanup = _dict(report.get("cleanup"))
    verification = _dict(report.get("cleanupVerification"))
    if cleanup.get("status") == "PASS_NO_NATIVE_RESOURCES_CREATED":
        return (report.get("nativeEffects") == "none; compilation refusal only"
                and report.get("targetBefore") is not None
                and report.get("targetBefore") == report.get("targetAfter"))
    return (cleanup.get("status") == "PASS" and cleanup.get("errors") == []
            and verification.get("ownedDatabaseAbsent") is True
            and verification.get("ownedRolesAbsent") is True
            and verification.get("targetIdentityUnchanged") is True
            and verification.get("schemaAndTableAbsentByOwnedDatabaseRemoval") is True)


def _transition_steps(report: Mapping[str, Any], variants: list[str], *,
                      expected_binding: Mapping[str, Any] | None = None,
                      scenario: str = "transitions",
                      expected_dispatches: int | None = None) -> tuple[bool, list[str]]:
    missing: list[str] = []
    steps = _list(report.get("steps"))
    if [ _dict(item).get("variant") for item in steps ] != variants:
        missing.append("exact-ordered-source-variants")
    if len(steps) != len(variants):
        return False, missing
    plan_digests = [_dict(item).get("planDigest") for item in steps]
    new_digests = [_dict(_dict(item).get("candidate")).get("newDigest") for item in steps]
    migration_ids = [_dict(item).get("migrationId") for item in steps]
    if (any(type(item) is not str for item in plan_digests + new_digests + migration_ids)
            or len(set(plan_digests)) != len(steps)
            or len(set(new_digests)) != len(steps)
            or len(set(migration_ids)) != len(steps)):
        missing.append("distinct-source-plan-and-marker-identities")
    dispatch_values = [_dict(item).get("nativeDdlDispatches", 0) for item in steps]
    dispatch_total = sum(item for item in dispatch_values if type(item) is int)
    if expected_dispatches is None:
        expected_dispatches = len(variants)
    if (any(type(item) is not int or item < 0 for item in dispatch_values)
            or not steps or report.get("defaultStatementDispatches") != expected_dispatches
            or dispatch_total != expected_dispatches):
        missing.append("one-native-ddl-dispatch-per-transition")
    reads = _list(report.get("progressReads"))
    completed = [item for item in reads if _dict(item).get("state") == "complete"]
    completed_digests = [_dict(item).get("phaseDigest") for item in completed]
    if (any(type(item) is not str for item in completed_digests)
            or len(set(completed_digests)) != len(variants)):
        missing.append("authenticated-completed-progress-per-transition")
    # These are closed PostgreSQL information_schema renderings of the
    # compiler's exact integerToken-to-numeric default SQL expressions.
    # Keep the raw expression: bare values, alternate casts, and normalized
    # token spellings are not equivalent evidence for this predicate.
    expected_defaults = {"set5": "'5'::numeric", "set9": "'9'::numeric", "drop": None,
                         "requiredSet9": "'9'::numeric", "requiredDrop": None}
    expected_manual = _fixture_rows_for(scenario, expected_binding or {})
    if not _json_value_matches(report.get("historicalRows"), _fixture_historical_rows(scenario)):
        missing.append("fixture-manual-historical-rows")
    prior_probe_rows: list[list[Any]] = []
    expected_roles = _list((expected_binding or {}).get("roleNames"))
    database = (expected_binding or {}).get("database")
    for index, raw in enumerate(steps):
        step = _dict(raw)
        before, after = _dict(step.get("before")), _dict(step.get("after"))
        candidate, result = _dict(step.get("candidate")), _dict(step.get("hostResult"))
        if type(step.get("nativeDdlDispatches")) is not int or step["nativeDdlDispatches"] < 1 or candidate.get("kind") != "change-default":
            missing.append(f"transition-{index}-source-marker-or-dispatch")
        expected_migration = (f"g03-{database[4:]}-{index+1:03d}"
                              if type(database) is str and database.startswith("g03_") else None)
        installation = _dict(result.get("installationReference"))
        previous_head = (step.get("expectedHead") if index == 0 else
                         _dict(_dict(steps[index-1]).get("hostResult")).get("headDigest"))
        replay_result = (scenario == "finalize-observation" and len(steps) == 1 and index == 0
                         and result.get("status") == "already-applied")
        if replay_result:
            # Public same-request replay uses a closed result schema distinct from a commit.
            replay_keys={"status","migrationId","generation","headDigest","entryDigest",
                         "installedBundleDigest","installationReference"}
            replay_schema_ok = (set(result) in (replay_keys,replay_keys|{"commitResponsibility"})
                                and result.get("commitResponsibility", "adapter") == "adapter")
        else:
            replay_schema_ok = (result.get("status") == "committed"
                                and result.get("commitResponsibility") == "adapter"
                                and result.get("lifecycleAdmission") is False)
        if (not replay_schema_ok
                or result.get("migrationId") != step.get("migrationId")
                or (expected_migration is not None and result.get("migrationId") != expected_migration)
                or type(result.get("generation")) is not int or result.get("generation") != index+2
                or not _json_value_matches(result.get("generation"), installation.get("generation"))
                or result.get("headDigest") != installation.get("headDigest")
                or step.get("expectedHead") != previous_head
                or result.get("entryDigest") != result.get("headDigest")
                or result.get("installedBundleDigest") != installation.get("bundleDigest")
                or installation.get("planDigest") != step.get("planDigest")
                or installation.get("approvalPlanDigest") != step.get("planDigest")
                or installation.get("version") != "umf.table-installation/0.3"):
            missing.append(f"transition-{index}-host-completion")
        for digest in (step.get("planDigest"), candidate.get("oldDigest"), candidate.get("newDigest")):
            if (type(digest) is not str or len(digest) != 64
                    or any(ch not in "0123456789abcdef" for ch in digest)):
                missing.append(f"transition-{index}-source-plan-digest")
                break
        if not step.get("migrationId") or not candidate.get("id"):
            missing.append(f"transition-{index}-source-plan-identity")
        phase = _dict(step.get("completedPhase"))
        if (phase.get("phaseIndex") != 1 or phase.get("completedSteps") != step.get("expectedPhaseSteps")
                or type(phase.get("phaseDigest")) is not str or len(phase["phaseDigest"]) != 64
                or any(ch not in "0123456789abcdef" for ch in phase["phaseDigest"])):
            missing.append(f"transition-{index}-exact-completed-phase-receipt")
        if not any(_dict(item).get("phaseDigest") == phase.get("phaseDigest")
                   and _dict(item).get("completedSteps") == step.get("expectedPhaseSteps")
                   for item in completed):
            missing.append(f"transition-{index}-progress-receipt-correlation")
        verified_phase = _dict(step.get("verifiedPhaseReceipt"))
        if (verified_phase.get("verification") != "verify_completed_progress"
                or verified_phase.get("phaseDigest") != phase.get("phaseDigest")
                or verified_phase.get("completedSteps") != step.get("expectedPhaseSteps")):
            missing.append(f"transition-{index}-independent-progress-verification")
        for key in ("migrationId", "planDigest", "approvalReceiptId"):
            if not step.get(key):
                missing.append(f"transition-{index}-missing-{key}")
        if (before.get("rows") is None or before.get("rows") != after.get("rows")
                or before.get("relationFileNode") is None
                or before.get("relationFileNode") != after.get("relationFileNode")):
            missing.append(f"transition-{index}-historical-physical-witness")
        if variants[index] in expected_defaults:
            expected_native_type = {"oid": 23, "typeName": "int4", "formatted": "integer"}
            if (before.get("columnNativeType") != expected_native_type
                    or after.get("columnNativeType") != expected_native_type):
                missing.append(f"transition-{index}-native-type-identity")
        if not _historical_values_match(before.get("rows"), expected_manual, prior_probe_rows):
            missing.append(f"transition-{index}-historical-values-and-owners")
        if variants[index] in expected_defaults and after.get("columnDefault") != expected_defaults[variants[index]]:
            missing.append(f"transition-{index}-native-default-after")
        for row in _list(before.get("rows")):
            if type(row) is not list or len(row) != 6 or any(row[i] is None for i in (3, 4, 5)):
                missing.append(f"transition-{index}-complete-row-identity")
                break
        probe_values = None
        if variants[index] in ("set5", "set9", "drop", "requiredSet9", "requiredDrop"):
            probe_values = _successful_probe_values(step, variants[index])
            if probe_values is None:
                missing.append(f"transition-{index}-future-write-kinds-values-and-refusals")
        if probe_values is not None and expected_roles and type(database) is str:
            tag = database[4:]
            for kind, value in probe_values:
                prior_probe_rows.append([f"{database}_{index+1}_{kind}", expected_roles[3], value])
    return not missing, missing


def _scenario_predicate(case_id: str, scenario: str, raw: Mapping[str, Any],
                        expected_binding: Mapping[str, Any] | None = None) -> list[str]:
    missing: list[str] = []
    if not _cleanup_ok(raw):
        missing.append("verified-owned-cleanup")
    if raw.get("scenario") != scenario:
        missing.append("scenario-identity")
    if case_id == "G03-N04":
        if raw.get("status") != "PASS_SOURCE_REFUSAL_AND_NATIVE_NO_EFFECTS":
            missing.append("required-source-refusal")
        if raw.get("nativeEffects") != "none; compilation refusal only":
            missing.append("no-native-effects")
        if (raw.get("targetBefore") is None or raw.get("targetBefore") != raw.get("targetAfter")
                or raw.get("acceptedBaselineSourceSha256") == raw.get("refusedSourceSha256")):
            missing.append("independent-no-effect-and-source-distinction")
        return missing
    if scenario == "unknown-no-commit":
        unknown = _dict(raw.get("unknownNoCommit"))
        fence = _dict(unknown.get("fence"))
        if raw.get("status") != "PASS_EXPECTED_FENCED_SUBCASE_FULL_CASE_OPEN":
            missing.append("expected-unknown-fence-status")
        if (unknown.get("result") != "FENCED_NO_AUTHENTICATED_PROGRESS"
                or unknown.get("dispatchDelta") != 1
                or unknown.get("before") is None or unknown.get("before") != unknown.get("after")
                or unknown.get("planDigest") is None or unknown.get("approvalReceiptId") is None):
            missing.append("unknown-outcome-rollback-and-identity")
        if (fence.get("personCanReadHead") is not False or fence.get("batchCanReadHead") is not False
                or fence.get("personCanReadApproval") is not False or fence.get("batchCanReadApproval") is not False
                or fence.get("personCanReadProgress") is not False or fence.get("batchCanReadProgress") is not False
                or (type(fence.get("progress")) is list and len(fence["progress"]) > 1
                    and fence["progress"][1] == "complete")):
            missing.append("unknown-outcome-visibility-fence")
        if not raw.get("unknownInjected"):
            missing.append("unknown-outcome-injection-marker")
        return missing
    allowed_statuses = _GOOD_SCENARIO_STATUSES | ({"PASS"} if case_id == "G03-N12" else set())
    if raw.get("status") not in allowed_statuses:
        missing.append("successful-raw-scenario-status")

    if case_id in ("G03-N01", "G03-N02"):
        expected = ["set5", "set9", "drop"]
        valid, reasons = _transition_steps(raw, expected, expected_binding=expected_binding, scenario=scenario)
        if not valid:
            missing.extend(reasons)
        if case_id == "G03-N02" and (raw.get("initialRowCount") != 0
                                     or _list(_dict(raw.get("initialObservation")).get("rows"))):
            missing.append("independently-observed-initial-empty-table")
    elif case_id == "G03-N03":
        valid, reasons = _transition_steps(raw, ["requiredSet9", "requiredDrop"], expected_binding=expected_binding, scenario=scenario)
        if not valid:
            missing.extend(reasons)
        if not _initial_required_probe_matrix(raw.get("initialRequiredWritesAsPerson")):
            missing.append("initial-required-probe-matrix-exact-order-values-and-refusal")
        steps = _list(raw.get("steps"))
        if len(steps) == 2:
            first = {_dict(item).get("kind"): _dict(item) for item in _list(_dict(steps[0]).get("futureWritesAsPerson"))}
            second = {_dict(item).get("kind"): _dict(item) for item in _list(_dict(steps[1]).get("futureWritesAsPerson"))}
            if (first.get("omitted", {}).get("actual") != 9
                    or first.get("null", {}).get("sqlstate") != "23502"
                    or first.get("explicit13", {}).get("actual") != 13
                    or second.get("omitted", {}).get("sqlstate") != "23502"
                    or second.get("null", {}).get("sqlstate") != "23502"
                    or second.get("explicit13", {}).get("actual") != 13):
                missing.append("required-stage-future-write-matrix")
    elif case_id == "G03-N05":
        valid, reasons = _transition_steps(raw, ["literalNull"] if scenario == "semantic-null" else ["decimalExponent"], expected_binding=expected_binding, scenario=scenario)
        if not valid:
            missing.extend(reasons)
        if not _dict(raw.get("steps", [{}])[0] if _list(raw.get("steps")) else {}).get("candidate", {}).get("newDigest"):
            missing.append("source-derived-semantic-marker")
        steps = _list(raw.get("steps"))
        if len(steps) == 1:
            step = _dict(steps[0])
            before, after = _dict(step.get("before")), _dict(step.get("after"))
            if (before.get("columnDefault") != after.get("columnDefault")
                    or step.get("nativeDdlDispatches") != 1):
                missing.append("semantic-equal-native-witness-with-real-ddl")
    elif case_id == "G03-N06":
        valid, reasons = _transition_steps(raw, ["set5"], expected_binding=expected_binding, scenario=scenario, expected_dispatches=2)
        if not valid:
            missing.extend(reasons)
        aborted = _list(raw.get("knownAbort"))
        if (len(aborted) != 1 or _dict(aborted[0]).get("dispatchDelta") != 1
                or _dict(aborted[0]).get("after") != _dict(_list(raw.get("steps"))[0]).get("before")):
            missing.append("known-abort-rollback-witness")
        if len(aborted) == 1 and _list(raw.get("steps")):
            abort = _dict(aborted[0])
            step = _dict(_list(raw.get("steps"))[0])
            if any(abort.get(a) != step.get(b) for a, b in (
                    ("planDigest", "planDigest"), ("fileDigest", "fileDigest"),
                    ("approvalReceiptId", "approvalReceiptId"))):
                missing.append("exact-original-abort-retry-request-identity")
            if abort.get("expectedHead") != step.get("expectedHead"):
                missing.append("exact-original-abort-retry-head")
        if not raw.get("faultInjected"):
            missing.append("known-abort-fault-injection")
        if raw.get("defaultStatementDispatches") != 2:
            missing.append("exact-abort-plus-retry-dispatch-count")
    elif case_id == "G03-N07":
        valid, reasons = _transition_steps(raw, ["set5"], expected_binding=expected_binding, scenario=scenario)
        if not valid:
            missing.extend(reasons)
        if scenario == "commit-observation" and (not raw.get("lostResponseInjected") or not _list(raw.get("progressReads"))):
            missing.append("commit-observation-progress")
        if scenario == "finalize-observation" and (not raw.get("lostFinalizeResponseInjected")
                or not _dict(raw.get("sameOriginalReplay"))):
            missing.append("finalize-loss-and-same-request-replay")
        if scenario == "finalize-before-publication" and (not raw.get("finalizeRefusalInjected")
                or not _dict(raw.get("committedUnpublishedFence"))
                or not _dict(raw.get("sameOriginalReplay"))):
            missing.append("prepublication-fence-and-recovery")
        replay = _dict(raw.get("sameOriginalReplay"))
        if scenario in ("commit-observation", "finalize-observation", "finalize-before-publication"):
            steps = _list(raw.get("steps"))
            original = _dict(_dict(steps[0]).get("hostResult")) if steps else {}
            original_installation = _dict(_dict(original).get("installationReference"))
            replay_installation = _dict(replay.get("installationReference"))
            replay_keys={"status","migrationId","generation","headDigest","entryDigest",
                         "installedBundleDigest","installationReference"}
            if (set(replay) not in (replay_keys,replay_keys|{"commitResponsibility"})
                    or replay.get("status") != "already-applied"
                    or not _json_value_matches(replay.get("headDigest"), original.get("headDigest"))
                    or not _json_value_matches(replay.get("entryDigest"), original.get("entryDigest"))
                    or not _json_value_matches(replay.get("generation"), original.get("generation"))
                    or not _json_value_matches(replay.get("migrationId"), original.get("migrationId"))
                    or not _json_value_matches(replay.get("installedBundleDigest"), original.get("installedBundleDigest"))
                    or replay.get("commitResponsibility", "adapter") != "adapter"
                    or not _json_value_matches(replay_installation.get("version"), original_installation.get("version"))
                    or not _json_value_matches(replay_installation.get("generation"), original_installation.get("generation"))
                    or not _json_value_matches(replay_installation.get("headDigest"), original_installation.get("headDigest"))
                    or not _json_value_matches(replay_installation.get("bundleDigest"), original_installation.get("bundleDigest"))
                    or not _json_value_matches(replay_installation.get("planDigest"), original_installation.get("planDigest"))
                    or not _json_value_matches(replay_installation.get("approvalPlanDigest"), original_installation.get("approvalPlanDigest"))
                    or (scenario == "finalize-observation"
                        and raw.get("lostFinalizeResponseInjected") != "after-real-final-publication-commit")
                    or raw.get("defaultStatementDispatches") != 1):
                missing.append("same-original-head-generation-plan-install-replay-without-redispatch")
    elif case_id == "G03-N08":
        missing.append("unknown-case-dispatched-to-wrong-predicate")
    elif case_id == "G03-N09":
        valid, reasons = _transition_steps(raw, ["set5"], expected_binding=expected_binding, scenario=scenario)
        if not valid:
            missing.extend(reasons)
        writer = _dict(raw.get("writer"))
        result = _dict(writer.get("afterCommitRolledBackProbe"))
        if result.get("explicitRow") != [13] and result.get("explicitRow") != (13,):
            missing.append("writer-explicit-value-after-barrier")
        if result.get("omittedRow") != [5] and result.get("omittedRow") != (5,):
            missing.append("writer-omitted-default-after-barrier")
        if writer.get("waitEventType") != "Lock" or type(writer.get("backendPid")) is not int:
            missing.append("writer-lock-barrier-observation")
    elif case_id in ("G03-N10", "G03-N11"):
        controls = _list(raw.get("compileOnlyRefusals"))
        expected_controls = {"invalid-gregorian-date", "wrong-date-carrier",
                             "wrong-date-native-domain", "temporal-logical-default",
                             "numeric-capacity-overflow"}
        if (len(controls) != len(expected_controls)
                or any(type(_dict(item).get("id")) is not str for item in controls)
                or any(_dict(item).get("status") != "blocked"
                       or not _list(_dict(item).get("diagnosticCodes")) for item in controls)
                or { _dict(item).get("id") for item in controls } != expected_controls):
            missing.append("portable-malformed-domain-refusal-controls")
        valid, reasons = _transition_steps(raw, [scenario.removeprefix("domain-")], expected_binding=expected_binding, scenario=scenario)
        if not valid:
            missing.extend(reasons)
        step = _dict(_list(raw.get("steps"))[0]) if _list(raw.get("steps")) else {}
        native = _dict(step.get("nativeDomainFutureWritesAsPerson"))
        domain = scenario.removeprefix("domain-")
        if domain == "date":
            expected_date = {"$type": "date", "value": "2000-02-29"}
            native_type = {"oid": 1082, "typeName": "date", "formatted": "date"}
            if (native.get("omitted") != expected_date
                    or _dict(_dict(step.get("before")).get("columnNativeType")) != native_type
                    or _dict(_dict(step.get("after")).get("columnNativeType")) != native_type):
                missing.append("native-date-leap-day-wire-and-type-witness")
        if domain == "text" and native.get("omitted") != "G03 🧭 text":
            missing.append("native-exact-text-witness")
        if domain == "decimal":
            expected_decimal = {"$type": "decimal", "value": "1.00"}
            native_type = {"oid": 1700, "typeName": "numeric", "formatted": "numeric(8,2)"}
            if (native.get("omitted") != expected_decimal
                    or _dict(_dict(step.get("before")).get("columnNativeType")) != native_type
                    or _dict(_dict(step.get("after")).get("columnNativeType")) != native_type):
                missing.append("native-exact-decimal-wire-scale-and-type-witness")
        if domain == "uuid" and native.get("distinct") is not True:
            missing.append("native-random-uuid-witness")
        if domain == "uuid":
            shadow = _dict(raw.get("uuidShadowControl"))
            if (shadow.get("sentinel") != "00000000-0000-4000-8000-000000000001"
                    or shadow.get("acl") != shadow.get("expectedAcl")
                    or len(_list(shadow.get("searchPath"))) != 2):
                missing.append("uuid-shadow-search-path-control")
        if domain == "currentTimestamp" and not (
                native.get("transactionTimestamp") == native.get("first") == native.get("second")
                and native.get("transactionTimestamp") is not None):
            missing.append("native-transaction-timestamp-witness")
    elif case_id == "G03-N12":
        ordinary = _dict(raw.get("ordinaryN12"))
        evidence = _dict(ordinary.get("structuredEvidence"))
        preflight = _dict(raw.get("ordinarySourceAdmissionPreflight"))
        roles = _list(raw.get("roleNames"))
        logical_roles = _list(raw.get("logicalRoleNames"))
        all_roles = _list(raw.get("allOwnedRoleNames"))
        tag = roles[0][5:] if len(roles) == 5 and type(roles[0]) is str and roles[0].startswith("g03o_") else None
        expected_logical_roles = ["g03lo_"+tag, "g03lp_"+tag, "g03lb_"+tag] if tag else []
        expected_all_roles = roles + expected_logical_roles
        identities = _list(raw.get("createdRoleIdentities"))
        identity_names = [_dict(row).get("name") for row in identities]
        identity_oids = [_dict(row).get("oid") for row in identities]
        if (logical_roles != expected_logical_roles or all_roles != expected_all_roles
                or identity_names != expected_all_roles
                or any(type(oid) is not str or not oid.isdecimal() for oid in identity_oids)
                or len(set(identity_oids)) != len(identity_oids)
                or any(any(_dict(row).get(flag) is not False for flag in
                           ("superuser", "bypassRls", "createDatabase", "createRole", "replication", "login"))
                       for row in identities)):
            missing.append("ordinary-exact-eight-fresh-nonprivileged-role-identities")
        role_by_name = {_dict(row).get("name"): _dict(row) for row in identities}
        membership = _dict(evidence.get("logicalRoleMembershipWitness"))
        membership_rows = _list(membership.get("personMembershipRows"))
        expected_membership_rows = _list(membership.get("expectedPersonMembershipRows"))
        logical_person_oid = role_by_name.get(expected_logical_roles[1], {}).get("oid") if expected_logical_roles else None
        expected_person_memberships = sorted(
            [[logical_person_oid, role_by_name.get(role, {}).get("oid"), False, True, False]
             for role in roles[3:5]], key=lambda row: int(row[1]))
        root_identity_rows = _list(membership.get("logicalRootRoleIdentities"))
        root_identity_names = [row[1] for row in root_identity_rows
                               if type(row) is list and len(row) == 8]
        created_oids = {row.get("name"): row.get("oid") for row in
                        (_dict(item) for item in identities)}
        if (membership.get("logicalRootRoleNames") != expected_logical_roles
                or root_identity_names != expected_logical_roles
                or membership_rows != expected_membership_rows
                or membership_rows != expected_person_memberships
                or len(membership_rows) != 2
                or any(type(row) is not list or len(row) != 8
                       or row[0] != role_by_name.get(row[1], {}).get("oid")
                       or row[0] != created_oids.get(row[1])
                       or row[2:] != [False, False, False, False, False, False]
                       for row in root_identity_rows)):
            missing.append("ordinary-logical-root-identity-and-person-membership-witness")
        if ordinary.get("status") != "PASS":
            missing.append("ordinary-adapter-matrix-status")
        preflight_receipts = [_dict(row) for row in _list(preflight.get("receipts"))]
        logical_preflight = [row for row in preflight_receipts if row.get("family") == "logical-matching"]
        native_preflight = [row for row in preflight_receipts if row.get("family") == "native-only"]
        logical_config_sha = ordinary.get("logicalConfigurationSha256")
        if (preflight.get("status") != "PASS_SOURCE_ADMISSION_BEFORE_TARGET_RESOURCES"
                or preflight.get("databaseLeases") != 0 or preflight.get("businessEffects") != 0
                or len(preflight_receipts) != 4 or len(logical_preflight) != 2
                or len(native_preflight) != 2
                or {row.get("profile") for row in logical_preflight}
                   != {"weft.table-operation-module/0.1", "weft.table-operation-module/0.2"}
                or any(row.get("configurationSha256") != logical_config_sha for row in logical_preflight)
                or {row.get("profile"): row.get("disposition") for row in logical_preflight}
                   != {"weft.table-operation-module/0.1": "expected-source-admission-refusal",
                       "weft.table-operation-module/0.2": "admitted-all-ordinary-operations-and-query"}
                or {row.get("profile") for row in native_preflight}
                   != {"weft.table-operation-module/0.1", "weft.table-operation-module/0.2"}
                or any(row.get("configurationSha256") != raw.get("configurationSha256")
                       for row in native_preflight)
                or any(row.get("disposition") != "admitted-all-ordinary-operations-and-query"
                       for row in native_preflight)):
            missing.append("ordinary-pre-resource-source-admission")
        checks = _list(ordinary.get("checks"))
        if (any(type(item) is not str for item in checks)
                or len(checks) != ordinary.get("checkCount") or len(checks) != len(set(checks))
                or set(checks) != _ordinary_required_checks()):
            missing.append("ordinary-exact-semantic-check-set")
        if not {"native-only", "logical-matching"}.issubset(
                {_dict(row).get("sourceFamily") for row in _list(evidence.get("profileMatrix"))}):
            missing.append("ordinary-source-family-matrix")
        routes = _list(evidence.get("profileMatrix"))
        route_keys = {(_dict(row).get("adapter"), _dict(row).get("profile"), _dict(row).get("sourceFamily"),
                       _dict(row).get("status")) for row in routes}
        expected_routes = {
                ("sync", "weft.table-operation-module/0.1", "native-only", "admitted"),
                ("sync", "weft.table-operation-module/0.2", "native-only", "admitted"),
                ("async", "weft.table-operation-module/0.1", "native-only", "admitted"),
                ("async", "weft.table-operation-module/0.2", "native-only", "admitted"),
                ("sync", "weft.table-operation-module/0.2", "logical-matching", "admitted"),
                ("async", "weft.table-operation-module/0.2", "logical-matching", "admitted"),
                ("sync", "weft.table-operation-module/0.1", "logical-matching", "refused-before-lease"),
                ("async", "weft.table-operation-module/0.1", "logical-matching", "refused-before-lease")}
        if len(routes) != len(expected_routes) or len(route_keys) != len(expected_routes) or route_keys != expected_routes:
            missing.append("ordinary-sync-async-profile-routes")
        occupied = _list(evidence.get("occupiedSlotObservations"))
        alice_role = roles[3] if len(roles) == 5 else None
        selected_profile = "weft.table-operation-module/0.2"
        legacy_profile = "weft.table-operation-module/0.1"
        expected_slot_routes = {
            "cross-a": (legacy_profile, selected_profile),
            "cross-b": (selected_profile, legacy_profile),
        }
        occupied_directions = [_dict(row).get("direction") for row in occupied]
        if (len(occupied) != 2 or occupied_directions != ["cross-a", "cross-b"]
                or any((_dict(row).get("firstProfile"), _dict(row).get("secondProfile"))
                       != expected_slot_routes.get(_dict(row).get("direction"))
                or _dict(row).get("keyDigest") != _dict(row).get("expectedSlot")
                or _dict(row).get("slotRowsBefore") != _dict(row).get("slotRowsAfter")
                or _dict(row).get("beforeRowCount") != _dict(row).get("afterRowCount")
                or _dict(row).get("sameProfileRecovery") != "recovered"
                or _list(_dict(row).get("slotRowsBefore")) != [[_dict(row).get("principalOid"),
                                                                  _dict(row).get("keyDigest")]]
                or _dict(row).get("effectRow") != ["g03_n12_"+str(_dict(row).get("direction")), alice_role, 23]
                for row in occupied)):
            missing.append("ordinary-cross-profile-occupied-slots")
        controls = _dict(evidence.get("verifierInputControls"))
        if (not controls.get("changedInputRefusal") or not controls.get("rotatedSecretRefusal")
                or len(_list(controls.get("slotRows"))) != 1 or len(_list(controls.get("effectRows"))) != 1):
            missing.append("ordinary-same-profile-input-verifier-controls")
        elif (controls.get("slotRows")[0] != [controls.get("principalOid"), controls.get("keyDigest")]
              or controls.get("effectRows") != [["g03_n12_stable_slot", alice_role, 41]]):
            missing.append("ordinary-same-profile-slot-row-and-effect")
        recovery = _list(evidence.get("recoveryObservations"))
        recovery_keys = {(_dict(row).get("kind"), _dict(row).get("afterRollback"),
                          _dict(row).get("classification"), _dict(row).get("recovered"),
                          _dict(row).get("effectCount")) for row in recovery}
        if not any(item[0] == "sync-caller-rollback" and item[1] == "not-observed" for item in recovery_keys):
            missing.append("ordinary-sync-rollback-recovery")
        if not any(item[0] == "async-caller-rollback" and item[1] == "not-observed" for item in recovery_keys):
            missing.append("ordinary-async-rollback-recovery")
        if not any(item[0] == "sync-lost-commit" and item[2] == "unknown" and item[3] == "recovered" and item[4] == 1 for item in recovery_keys):
            missing.append("ordinary-sync-lost-commit-recovery")
        if not any(item[0] == "async-lost-commit" and item[2] == "unknown" and item[3] == "recovered" and item[4] == 1 for item in recovery_keys):
            missing.append("ordinary-async-lost-commit-recovery")
        generation = _dict(evidence.get("generationTransition"))
        expected_native_type = {"oid": 23, "typeName": "int4", "formatted": "integer"}
        if (generation.get("status") != "applied" or generation.get("beforeDefault") != "'5'::numeric"
                or generation.get("afterDefault") != "'9'::numeric"
                or generation.get("beforeNativeType") != expected_native_type
                or generation.get("afterNativeType") != expected_native_type
                or generation.get("beforeRows") != generation.get("afterRows")
                or not generation.get("migrationId") or not generation.get("approvalId")
                or not generation.get("planDigest") or not generation.get("fileDigest")
                or not generation.get("oldHeadDigest") or not generation.get("newHeadDigest")
                or not generation.get("sourceDigest") or not generation.get("bundleDigest")
                or type(generation.get("oldGeneration")) is not int
                or type(generation.get("newGeneration")) is not int
                or generation.get("newGeneration", 0) <= generation.get("oldGeneration", 0)):
            missing.append("ordinary-real-source-generation-transition")
        if (not evidence.get("nativeRowsBefore")
                or evidence.get("nativeRowsBefore") != evidence.get("nativeHistoricalRowsAfter")):
            missing.append("ordinary-native-historical-rows")
        if not evidence.get("logicalRowsBefore") or not evidence.get("logicalRowsAfter"):
            missing.append("ordinary-logical-independent-row-witness")
        else:
            logical_before = _list(evidence.get("logicalRowsBefore"))
            logical_sync = _list(evidence.get("logicalRowsAfter"))
            logical_async = _list(evidence.get("logicalAsyncRowsAfter"))
            bob_role = roles[4] if len(roles) == 5 else None

            def row_map(rows: list[Any]) -> dict[str, tuple[Any, Any]] | None:
                if any(type(row) is not list or len(row) != 3 or type(row[0]) is not str for row in rows):
                    return None
                if len({row[0] for row in rows}) != len(rows):
                    return None
                return {row[0]: (row[1], row[2]) for row in rows}

            before_map, sync_map, async_map = map(row_map, (logical_before, logical_sync, logical_async))
            expected_before = {"a": (alice_role, None), "b": (bob_role, 2), "c": (alice_role, 9)}
            expected_sync = {**expected_before,
                "g03_n12_logical": (alice_role, 32),
                "g03_n12_logical_null": (alice_role, None),
                "g03_n12_logical_value": (alice_role, 31)}
            expected_async = {**expected_sync,
                "g03_n12_logical_async": (bob_role, 34),
                "g03_n12_logical_async_null": (bob_role, None),
                "g03_n12_logical_async_value": (bob_role, 33)}
            if before_map != expected_before:
                missing.append("ordinary-logical-historical-row-baseline")
            if sync_map != expected_sync or async_map != expected_async:
                missing.append("ordinary-logical-sync-async-final-row-values-and-owners")
    elif case_id == "G03-N13":
        expected = {"wrong-approval", "wrong-head", "wrong-file", "wrong-source",
                    "wrong-default-target", "wrong-default-value", "wrong-phase", "wrong-marker"}
        refusals = _list(raw.get("tamperingRefusals"))
        if set(refusals) != expected or len(refusals) != len(expected):
            missing.append("exact-eight-pre-effect-refusals")
        valid, reasons = _transition_steps(raw, ["set5"], expected_binding=expected_binding, scenario=scenario)
        if not valid:
            missing.extend(reasons)
        observation = _dict(raw.get("tamperingObservation"))
        before, after = _dict(observation.get("before")), _dict(observation.get("afterRefusals"))
        if (not before or before.get("columnDefault") != after.get("columnDefault")
                or before.get("rows") != after.get("rows")
                or raw.get("defaultStatementDispatches") != 1):
            missing.append("tampering-refusals-before-effects-and-valid-plan-once")
    return missing


def evaluate_case(case_id: str, case_report: Mapping[str, Any], *,
                  expected_case_bindings: Mapping[str, object],
                  expected_target: object | None = None,
                  final_target_observation: object | None = None) -> dict[str, Any]:
    expected_scenarios = _CASE_SCENARIOS[case_id]
    if case_id == "G03-N14":
        missing: list[str] = []
        if case_report.get("executedRosterComplete") is not True:
            missing.append("complete-prior-13-case-roster")
        if case_report.get("missingOrFailedCleanupCases") != []:
            missing.append("all-owned-resource-cleanups")
        if expected_target is None or final_target_observation != expected_target:
            missing.append("fresh-final-target-observation")
        captured = _list(case_report.get("capturedResourceBindings"))
        expected_captured = [scenario for entry in CAMPAIGN_ROSTER[:-1] for scenario in entry["scenarios"]]
        if [ _dict(item).get("scenario") for item in captured ] != expected_captured:
            missing.append("captured-owned-resource-binding-roster")
        if not _list(case_report.get("perCaseCleanupStatuses")) or any(
                status not in ("PASS", "PASS_NO_NATIVE_RESOURCES_CREATED")
                for status in _list(case_report.get("perCaseCleanupStatuses"))):
            missing.append("prior-cleanup-status-roster")
        return {"caseId": case_id, "status": "PASS" if not missing else "OPEN",
                "predicatePassed": not missing, "missingRequirements": missing}
    results = _list(case_report.get("scenarioResults"))
    missing: list[str] = []
    if [ _dict(item).get("scenario") for item in results ] != expected_scenarios:
        missing.append("exact-ordered-scenario-roster")
    for scenario, raw in zip(expected_scenarios, results):
        record = _dict(raw)
        expected = expected_case_bindings.get(scenario)
        missing.extend(f"{scenario}:{item}" for item in _scenario_predicate(
            case_id, scenario, record, expected if type(expected) is dict else None))
        campaign_binding = _dict(record.get("campaignBinding"))
        if expected is not None and campaign_binding.get("expectedCaseBinding") != expected:
            missing.append(f"{scenario}:expected-binding-not-preserved")
        if expected is None:
            missing.append(f"{scenario}:missing-frozen-expected-binding")
        if expected is not None and scenario != "admission-refusal":
            actual = {"database": record.get("database"), "schema": record.get("schema"),
                      "roleNames": record.get("roleNames"),
                      "configurationSha256": record.get("configurationSha256")}
            if scenario == "ordinary":
                ordinary = _dict(record.get("ordinaryN12"))
                schemas = _list(ordinary.get("schemasCovered"))
                actual.update(logicalRoleNames=record.get("logicalRoleNames"),
                              allOwnedRoleNames=record.get("allOwnedRoleNames"),
                              logicalSchema=schemas[1] if len(schemas) == 2 else None,
                              logicalConfigurationSha256=ordinary.get("logicalConfigurationSha256"))
            if actual != expected:
                missing.append(f"{scenario}:actual-resource-or-configuration-mismatch")
    if case_id == "G03-N05" and len(results) == 2:
        first_steps, second_steps = _list(_dict(results[0]).get("steps")), _list(_dict(results[1]).get("steps"))
        if len(first_steps) != 1 or len(second_steps) != 1:
            missing.append("semantic-null-and-decimal-source-plans")
        else:
            first, second = _dict(first_steps[0]), _dict(second_steps[0])
            first_candidate, second_candidate = _dict(first.get("candidate")), _dict(second.get("candidate"))
            if (first.get("planDigest") == second.get("planDigest")
                    or first_candidate.get("newDigest") == second_candidate.get("newDigest")):
                missing.append("semantic-null-and-decimal-independent-source-markers")
    return {"caseId": case_id, "status": "PASS" if not missing else "OPEN",
            "predicatePassed": not missing, "missingRequirements": missing}


def evaluate_campaign(cases: list[dict[str, Any]], *, expected_case_bindings: Mapping[str, object],
                      expected_target: object | None, final_target_observation: object | None) -> dict[str, Any]:
    by_id = {item.get("caseId"): item for item in cases if type(item) is dict}
    predicates = [evaluate_case(entry["caseId"], by_id.get(entry["caseId"], {}),
        expected_case_bindings=expected_case_bindings, expected_target=expected_target,
        final_target_observation=final_target_observation) for entry in CAMPAIGN_ROSTER]
    exact_roster = [item.get("caseId") for item in cases] == [entry["caseId"] for entry in CAMPAIGN_ROSTER]
    passed = exact_roster and all(item["predicatePassed"] for item in predicates)
    return {"status": "PASS" if passed else "OPEN", "predicatePassed": passed,
            "exactRoster": exact_roster, "casePredicates": predicates}

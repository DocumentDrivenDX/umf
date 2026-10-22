# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compare the installed Rust-backed Python schema facade with frozen controls."""
import hashlib
import json
import os
import struct
import subprocess
import sys
from collections import Counter
from pathlib import Path

from umf.schemas import schema_validator

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "docs/helix/04-build/evidence/rust-migration/r2"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def approved_outcome(draft, file, group, case, schema, instance, official_valid,
                     delta, suite_root):
    """Return the reviewed target for the one approved correction, else None."""
    scope = delta["scope"]
    if (draft, file, group, case) != (
        scope["draft"], scope["file"], scope["group"], scope["case"]
    ):
        return None
    suite_file = suite_root / "tests" / draft / file
    if sha256(suite_file) != delta["source"]["suiteFileSha256"]:
        raise RuntimeError("Approved compatibility correction source file changed")
    if schema != delta["schema"] or instance != delta["instance"]:
        raise RuntimeError("Approved compatibility correction no longer matches its exact vector")
    if official_valid != delta["officialSuiteValid"]:
        raise RuntimeError("Approved compatibility correction disagrees with official suite outcome")
    if delta["decision"] != "approved-target-valid-true" or delta["approvedTargetValid"] is not True:
        raise RuntimeError("Approved compatibility correction decision is not the reviewed target")
    return delta["approvedTargetValid"]


def accepted(schema):
    try:
        schema_validator(schema)
        return True
    except Exception:  # noqa: BLE001 - frozen control records any refusal class
        return False


def numeric_instance(recipe):
    if recipe["kind"] == "float":
        return struct.unpack(">d", bytes.fromhex(recipe["bits"]))[0]
    if recipe["kind"] == "int":
        return int(recipe["decimal"])
    raise ValueError(f"Unknown frozen numeric instance recipe: {recipe['kind']}")


NUMERIC_PROFILES = {
    "umf.r2-sol-python-schema-arithmetic/1": {
        "sha256": "79318a3247e8b00d048c7213c402e09adb7779bfe771f84755005da40da1ee6d",
        "cases": 648,
    },
    "umf.r2-sol-python-schema-arithmetic-edges/1": {
        "sha256": "fd6521e6d8673c02529401650303675f2ebe54fae6004ba8df1d0577acbadda2",
        "cases": 1938,
    },
}
NUMERIC_DECISION_SHA256 = "2eed0673a149e772749a5d4e7f6fb906e3bcf9ed5589694ab47fbd7e7c5c7456"
NUMERIC_PROFILES_SHA256 = "29569b202348b5f5dcfa8d4e7395b259c0ee486012aa5f3d5ca6379099b87fdd"
ARITHMETIC_PREDECESSOR_REASONS = {
    "cannot convert float NaN to integer": "nan-to-integer",
    "cannot convert Infinity to integer ratio": "infinity-to-integer-ratio",
    "int too large to convert to float": "integer-to-float-overflow",
}
ARITHMETIC_TARGET_REASONS = frozenset(ARITHMETIC_PREDECESSOR_REASONS.values())


def main():
    if len(sys.argv) != 6:
        raise SystemExit("usage: schema-python-conformance.py ADMISSION.json SUITE-RECEIPT.json SUITE-ROOT PYTHON-ARITHMETIC.json PYTHON-ARITHMETIC-EDGES.json")
    admission_path, suite_receipt_path, suite_root, *arithmetic_paths = map(Path, sys.argv[1:])
    admission = json.loads(admission_path.read_text())
    suite_receipt = json.loads(suite_receipt_path.read_text())
    arithmetic_receipts = [json.loads(path.read_text()) for path in arithmetic_paths]
    arithmetic_decision_path = EVIDENCE / "sol-python-schema-arithmetic-decision.json"
    if sha256(arithmetic_decision_path) != NUMERIC_DECISION_SHA256:
        raise RuntimeError("Reviewed Python arithmetic mapping decision changed")
    arithmetic_decision = json.loads(arithmetic_decision_path.read_text(encoding="utf-8"))
    if (arithmetic_decision.get("id") != "R2-SOL-PYTHON-SCHEMA-ARITHMETIC-001"
            or arithmetic_decision.get("exceptionMapping", {}).get("rustTarget")
            != "EngineError with stable code PYTHON_SCHEMA_ARITHMETIC and deterministic reason for the failed Python arithmetic operation."):
        raise RuntimeError("Python arithmetic exception mapping is not the reviewed target")
    arithmetic_profiles_path = EVIDENCE / "sol-python-schema-arithmetic-profiles.json"
    if sha256(arithmetic_profiles_path) != NUMERIC_PROFILES_SHA256:
        raise RuntimeError("Cross-version Python arithmetic confirmation changed")
    arithmetic_profile_receipt = json.loads(arithmetic_profiles_path.read_text(encoding="utf-8"))
    if (arithmetic_profile_receipt.get("id") != "R2-SOL-PYTHON-SCHEMA-ARITHMETIC-PROFILES-001"
            or arithmetic_profile_receipt.get("basePython") != "3.11.17"
            or len(arithmetic_profile_receipt.get("profiles", [])) != 2):
        raise RuntimeError("Cross-version Python arithmetic profile receipt is incomplete")
    for profile_record in arithmetic_profile_receipt["profiles"]:
        if profile_record.get("python") not in {"3.12.15", "3.13.16"}:
            raise RuntimeError("Unexpected Python version in arithmetic profile receipt")
        captures = {capture.get("fixture"): capture for capture in profile_record.get("captures", [])}
        for fixture, config in (
            ("sol-python-schema-arithmetic-predecessor.json", NUMERIC_PROFILES["umf.r2-sol-python-schema-arithmetic/1"]),
            ("sol-python-schema-arithmetic-edges-predecessor.json", NUMERIC_PROFILES["umf.r2-sol-python-schema-arithmetic-edges/1"]),
        ):
            capture = captures.get(fixture, {})
            if (capture.get("fixtureSha256") != config["sha256"]
                    or capture.get("cases") != config["cases"]
                    or capture.get("completeCaseRecordsEqual") is not True
                    or capture.get("instanceRecipesEqual") is not True):
                raise RuntimeError(f"Cross-version arithmetic confirmation is incomplete for {profile_record['python']}/{fixture}")
    supported_python_profiles = {"3.11.17", "3.12.15", "3.13.16"}
    actual_python = sys.version.split()[0]
    if actual_python not in supported_python_profiles:
        raise RuntimeError(f"No cross-version numeric predecessor confirmation for CPython {actual_python}")
    delta = json.loads((EVIDENCE / "approved-schema-compatibility-deltas.json").read_text(encoding="utf-8"))
    if sha256(suite_receipt_path) != delta["source"]["frozenPredecessorOutcomesSha256"]:
        raise RuntimeError("Frozen predecessor schema outcomes changed")
    suite_root = suite_root.resolve()
    suite_commit = "89e83a74014617ffbe79a56d83d14d054cd11417"
    if suite_receipt.get("suite_commit") != suite_commit:
        raise RuntimeError("Official JSON Schema suite receipt has an unexpected source commit")
    git = os.environ.get("UMF_GIT") or "git"
    actual_commit = subprocess.run([git, "-C", str(suite_root), "rev-parse", "HEAD"], check=True, text=True, capture_output=True).stdout.strip()
    if actual_commit != suite_commit:
        raise RuntimeError(f"Official JSON Schema suite checkout is {actual_commit}, expected {suite_commit}")
    subprocess.run([git, "-C", str(suite_root), "diff", "--quiet", suite_commit, "--", "tests"], check=True)

    failures = []
    admission_count = 0
    for case in admission["cases"]:
        actual = accepted(case["schema"])
        admission_count += 1
        if actual != case["accepted"]:
            failures.append({"profile": "admission", "id": case["id"], "expected": case["accepted"], "actual": actual})

    suite_count = 0
    suite_valid = 0
    dialects = admission["dialects"]
    for draft, draft_receipt in suite_receipt["drafts"].items():
        for group in draft_receipt["groups"]:
            file_path = suite_root / "tests" / draft / group["file"]
            raw_groups = json.loads(file_path.read_text(encoding="utf-8"))
            schema_group = raw_groups[group["group"]]
            schema = schema_group["schema"]
            if isinstance(schema, bool):
                schema = {"$schema": dialects[draft], "allOf": [schema]}
            elif isinstance(schema, dict) and "$schema" not in schema:
                schema = {"$schema": dialects[draft], **schema}
            try:
                validator = schema_validator(schema)
                admitted = True
            except Exception:  # noqa: BLE001 - frozen control records any refusal class
                validator = None
                admitted = False
            if admitted != group["admitted"]:
                failures.append({"profile": "official-admission", "draft": draft, "file": group["file"], "group": group["group"], "expected": group["admitted"], "actual": admitted})
            for case in group.get("tests", ()):
                suite_count += 1
                if admitted:
                    test = schema_group["tests"][case["case"]]
                    suite_valid += 1
                    try:
                        actual = validator.is_valid(test["data"])
                    except Exception as error:  # noqa: BLE001 - candidate errors are parity outcomes
                        failures.append({"profile": "official-error", "draft": draft, "file": group["file"], "group": group["group"], "case": case["case"], "name": case["name"], "error": type(error).__name__, "message": str(error)})
                    else:
                        correction = approved_outcome(
                            draft, group["file"], group["group"], case["case"],
                            schema, test["data"], case["expected"], delta, suite_root,
                        )
                        expected = case["valid"] if correction is None else correction
                        if actual != expected:
                            failures.append({"profile": "official-outcome", "draft": draft, "file": group["file"], "group": group["group"], "case": case["case"], "name": case["name"], "expected": expected, "predecessor": case["valid"], "official": case["expected"], "actual": actual, "approvedCorrection": correction is not None})

    arithmetic_cases = 0
    arithmetic_validity = 0
    arithmetic_instance_errors = 0
    arithmetic_profiles = {}
    for receipt in arithmetic_receipts:
        profile = receipt.get("profile")
        expected_profile = NUMERIC_PROFILES.get(profile)
        if expected_profile is None:
            raise RuntimeError(f"Unexpected frozen Python numeric schema profile: {profile}")
        if sha256(arithmetic_paths[len(arithmetic_profiles)]) != expected_profile["sha256"]:
            raise RuntimeError(f"Frozen Python numeric fixture changed: {profile}")
        if len(receipt.get("cases", [])) != expected_profile["cases"]:
            raise RuntimeError(f"Frozen Python numeric fixture count changed: {profile}")
        if profile in arithmetic_profiles:
            raise RuntimeError(f"Duplicate frozen Python numeric fixture: {profile}")
        if receipt.get("python") != "3.11.17" or receipt.get("jsonschema") != "4.26.0":
            raise RuntimeError(f"Unexpected predecessor metadata in numeric fixture: {profile}")
        if receipt["python"] != "3.11.17":
            raise RuntimeError("The immutable numeric fixture records must remain based on CPython 3.11.17")
        arithmetic_profiles[profile] = len(receipt["cases"])
        recipes = receipt["instanceRecipes"]
        for case in receipt["cases"]:
            arithmetic_cases += 1
            instance = numeric_instance(recipes[case["instance"]])
            try:
                validator = schema_validator(case["schema"])
            except Exception as error:  # noqa: BLE001 - construction is a separate outcome
                actual = {"status": "schema-error", "type": type(error).__name__, "message": str(error)}
            else:
                try:
                    valid = validator.is_valid(instance)
                    actual = {"status": "validity", "valid": bool(valid)}
                    arithmetic_validity += 1
                except Exception as error:  # noqa: BLE001 - preserve old public instance exceptions
                    code = getattr(error, "code", None)
                    reason = str(error) if str(error) in ARITHMETIC_TARGET_REASONS else None
                    actual = {
                        "status": "instance-error",
                        "code": code,
                        "reason": reason,
                    }
                    arithmetic_instance_errors += 1
            expected = case["outcome"]
            if expected.get("status") == "instance-error":
                expected_reason = ARITHMETIC_PREDECESSOR_REASONS.get(expected.get("message"))
                if expected_reason is None:
                    raise RuntimeError(f"Unmapped frozen arithmetic error reason: {profile}/{case['id']}")
                target = {
                    "status": "instance-error",
                    "code": "PYTHON_SCHEMA_ARITHMETIC",
                    "reason": expected_reason,
                }
            else:
                target = expected
            if actual != target:
                failures.append({
                    "profile": profile,
                    "id": case["id"],
                    "expected": target,
                    "actual": actual,
                })
    if set(arithmetic_profiles) != set(NUMERIC_PROFILES):
        raise RuntimeError("The complete frozen Python numeric schema fixture set is required")

    report = {
        "status": "fail" if failures else "pass",
        "admissionCases": admission_count,
        "officialCases": suite_count,
        "officialEvaluated": suite_valid,
        "numericCases": arithmetic_cases,
        "numericValidityResults": arithmetic_validity,
        "numericInstanceErrors": arithmetic_instance_errors,
        "numericProfiles": arithmetic_profiles,
        "numericCandidatePython": actual_python,
        "mismatches": len(failures),
        "mismatchBuckets": dict(Counter(
            "/".join((item.get("profile", ""), item.get("draft", ""), item.get("id", "").split("/")[1] if item.get("profile") == "admission" else item.get("file", "")))
            for item in failures
        )),
        "firstFive": failures[:5],
        "firstPerProfile": {
            profile: next(item for item in failures if item.get("profile") == profile)
            for profile in sorted({item.get("profile", "") for item in failures})
        },
        "failures": failures,
    }
    print(json.dumps(report, ensure_ascii=True))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

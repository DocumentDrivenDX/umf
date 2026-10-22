# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compare Python schema method order with the frozen predecessor receipts."""
from __future__ import annotations

import hashlib
import json
import struct
import sys
from collections import Counter
from pathlib import Path

from umf.schemas import schema_validator


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "docs/helix/04-build/evidence/rust-migration/r2"
FIXTURES = {
    "umf.r2-sol-python-schema-evaluation-order/1": {
        "file": "sol-python-schema-evaluation-order-predecessor.json",
        "sha256": "48a2324dc5e3bba1a351940e49cdf79c73a3ec64d423c19250bed7460d42be95",
        "cases": 792,
    },
    "umf.r2-sol-python-schema-evaluation-order-ordinary/1": {
        "file": "sol-python-schema-evaluation-order-ordinary-predecessor.json",
        "sha256": "e105e9423dfb899ba2d19cd3622bbd62f66a89052f8c68e61e7146f71f1556f6",
        "cases": 264,
    },
    "umf.r2-sol-python-schema-yield-boundaries/1": {
        "file": "sol-python-schema-yield-boundaries-predecessor.json",
        "sha256": "5db4e1f0b5dab27d4c2ba39f7b53907e1570dff9be7f63dfb19a8d23fe9f28cf",
        "cases": 226,
        "methodObservations": 675,
    },
    "umf.r2-sol-python-schema-annotation-reach/1": {
        "file": "sol-python-schema-annotation-reach-predecessor.json",
        "sha256": "d6b746112fe489795aa842824c0f516e39c42aadf1010d47d0226d8b4820611f",
        "cases": 96,
        "methodObservations": 285,
    },
    "umf.r2-sol-python-schema-annotation-mechanism/1": {
        "file": "sol-python-schema-annotation-mechanism-predecessor.json",
        "sha256": "787391e56f71759bf4b39542210466fca06d47ccd95b195529ddceed6e204008",
        "cases": 140,
        "methodObservations": 393,
        "schemaAdmissionRefusals": 9,
    },
    "umf.r2-sol-python-schema-annotation-mechanism-2019/1": {
        "profile": "umf.r2-sol-python-schema-annotation-mechanism/1",
        "file": "sol-python-schema-annotation-mechanism-2019-predecessor.json",
        "sha256": "42e39726fe537b4f39d5bf1c691d598dd14aa51e4ca4e4f4b5299b4e7fcbfce8",
        "cases": 28,
        "methodObservations": 81,
        "schemaAdmissionRefusals": 1,
    },
    "umf.r2-sol-python-schema-2019-ap-target/1": {
        "file": "sol-python-schema-2019-ap-target-proposal.json",
        "sha256": "68807db9a1256d2e2f1ed9598ac99db40e39c83a3d5407b7cc947ee4a0d907f3",
        "profile": "umf.r2-sol-python-schema-2019-ap-target/1",
        "cases": 37,
        "methodObservations": 27,
        "schemaAdmissionRefusals": 0,
        "caseFilter": {
            "draft4-ap-empty-rule", "draft4-ap-valid-extra", "draft4-ap-valid-before-type",
            "draft4-ap-pattern-exclusion", "draft4-ap-declared-exclusion",
            "draft4-ap-rule-member-collision", "draft4-ap-original-correction001",
            "draft4-ap-invalid-extra", "draft4-ap-mixed-extra",
        },
    },
    "umf.r2-sol-python-schema-error-metadata/1": {
        "file": "sol-python-schema-error-metadata-predecessor.json",
        "sha256": "3ef0d7b544aebcccdd800749741c68b8587defcb82165c71abd491e551dcf4d3",
        "cases": 63,
        "errorObservations": 51,
    },
    "umf.r2-sol-python-schema-unordered-targets/1": {
        "file": "sol-python-schema-unordered-targets.json",
        "sha256": "74057db74453ae551490da56d6c4172c4ab2e2aa41e65e997dad46fabd0cc9f2",
        "cases": 36,
        "methodObservations": 108,
    },
    "umf.r2-sol-python-schema-error-subjects/1": {
        "file": "sol-python-schema-error-subjects-predecessor.json",
        "sha256": "e93bac66f68c16acef799beec894638bf8733d8107347f2e062dd075de7f13b1",
        "cases": 63,
        "errorObservations": 38,
        "schemaAdmissionRefusals": 11,
        "runtimeErrorObservations": 6,
    },
    "umf.r2-sol-python-schema-reference-terminals/1": {
        "file": "sol-python-schema-reference-terminals-predecessor.json",
        "sha256": "b056176661edcc71594bd6309b15fb54888d5593f0c24aed0aa6bdcb7b7258e4",
        "cases": 363,
        "methodObservations": 1089,
    },
    "umf.r2-sol-python-schema-reference-indices/1": {
        "file": "sol-python-schema-reference-indices-predecessor.json",
        "sha256": "9755d0e13765268dc2a95cec5fd3fe733a62c1bcddbd8398e8ede8f263ad6407",
        "cases": 315,
        "methodObservations": 945,
    },
    "umf.r2-sol-python-schema-path-segments/1": {
        "file": "sol-python-schema-path-segments-predecessor.json",
        "sha256": "35bfbceb67a1aec0c3d87180c23dd1ba5435e7644eec9a5306d8f65ee9987c63",
        "cases": 48,
        "errorObservations": 42,
        "schemaAdmissionRefusals": 1,
    },
    "umf.r2-sol-python-schema-path-keys/1": {
        "file": "sol-python-schema-path-keys-predecessor.json",
        "sha256": "e9151ff4ae770e372b7251b897fa1278b88f77da47c13ebfcd72d8314c74bbd9",
        "cases": 132,
        "errorObservations": 132,
        "schemaAdmissionRefusals": 0,
    },
    "umf.r2-sol-python-schema-annotation-order/1": {
        "file": "sol-python-schema-annotation-order-predecessor.json",
        "sha256": "47bd4de4cc8c6d3b15c187694e93a443e40ab878610133f10399f8c0ebb32c5c",
        "cases": 53,
        "methodObservations": 159,
        "schemaAdmissionRefusals": 0,
    },
    "umf.r2-sol-python-recursive-resource-scope/1": {
        "file": "sol-python-recursive-resource-scope-predecessor.json",
        "sha256": "c67b6602a40235a9202a00082949e6a9a8af3db1aee614110275afb303de9b15",
        "cases": 89,
        "methodObservations": 255,
        "schemaAdmissionRefusals": 4,
        "admissionErrorCases": {
            "official-7-0": "SCHEMA_REF_UNRESOLVED",
            "official-7-1": "SCHEMA_REF_UNRESOLVED",
            "official-8-0": "SCHEMA_REF_UNRESOLVED",
            "official-8-1": "SCHEMA_REF_UNRESOLVED",
        },
    },
    "umf.r2-sol-python-resource-identity-companion/1": {
        "file": "sol-python-resource-identity-companion-predecessor.json",
        "sha256": "75f772e29f3776969739c423c98b722f9597895bd6e2c215e4fe7f7c3fc44609",
        "cases": 114,
        "methodObservations": 342,
        "schemaAdmissionRefusals": 0,
        "runtimeErrorObservations": 0,
    },
    "umf.r2-sol-python-resource-anchor-companion/1": {
        "file": "sol-python-resource-anchor-companion-predecessor.json",
        "sha256": "ba8357b3d85b64edefea6f57b3ca91872ef8053d3182406ee7543af5bbd2f2d5",
        "cases": 24,
        "methodObservations": 72,
        "schemaAdmissionRefusals": 0,
        "runtimeErrorObservations": 0,
    },
    "umf.r2-sol-python-resource-uri-operations/1": {
        "file": "sol-python-resource-uri-operations-predecessor.json",
        "sha256": "e79cdee8693892517cc372f9b5b05d902199e78b734175bf10359baadeabfae9",
        "cases": 24,
        "methodObservations": 72,
        "schemaAdmissionRefusals": 0,
        "runtimeErrorObservations": 0,
    },
}
BASE_FIXTURES = tuple(key for key in FIXTURES if key not in {
    "umf.r2-sol-python-schema-yield-boundaries/1",
    "umf.r2-sol-python-schema-annotation-reach/1",
    "umf.r2-sol-python-schema-annotation-mechanism/1",
    "umf.r2-sol-python-schema-annotation-mechanism-2019/1",
    "umf.r2-sol-python-schema-2019-ap-target/1",
    "umf.r2-sol-python-schema-error-metadata/1",
    "umf.r2-sol-python-schema-unordered-targets/1",
    "umf.r2-sol-python-schema-error-subjects/1",
    "umf.r2-sol-python-schema-reference-terminals/1",
    "umf.r2-sol-python-schema-reference-indices/1",
    "umf.r2-sol-python-schema-path-segments/1",
    "umf.r2-sol-python-schema-path-keys/1",
    "umf.r2-sol-python-schema-annotation-order/1",
    "umf.r2-sol-python-recursive-resource-scope/1",
    "umf.r2-sol-python-resource-identity-companion/1",
    "umf.r2-sol-python-resource-anchor-companion/1",
    "umf.r2-sol-python-resource-uri-operations/1",
})
DECISION_SHA256 = "038cbc7c8c0de56212a562bb40eccc98276a8b1afeaf78d7d27184f1d8dc80b2"
PROFILES_SHA256 = "727abe40d115fe5d54bf323e7a85649b1efab7f918b7f52f7b2254e9da24f172"
YIELD_PROFILES_SHA256 = "3a6d1dd249e2b012d6ab8c6fb9257e2c8ce80bdc3ad4772ee094b522ec1554af"
ANNOTATION_REACH_PROFILES_SHA256 = "4350b6104b60e306284272221f0747c52efb53f4c1c235a0b7696bc38770c4c1"
ANNOTATION_MECHANISM_PROFILES_SHA256 = "5561db8b10ea44a4fcb894f9b5c867badb764a18b50db6194105a53cd0a4e062"
LEGACY_AP_CORRECTION_SHA256 = "e4f8210cbea8959d20dfd738791fe3a214564c8f7e90c7967e7bc499bc1d21f2"
LEGACY_AP_NATIVE_SHA256 = "8666440936228516f5357d1776a26c69189bf6843139607c56c63da2c2128d07"
LEGACY_AP_TARGET_SHA256 = "68807db9a1256d2e2f1ed9598ac99db40e39c83a3d5407b7cc947ee4a0d907f3"
LEGACY_AP_PROFILES_SHA256 = "13971ee20ac08bda3ec5f6e4eb3a1035d98e1b58b92bdfd186ee8c31acaeae56"
ARITHMETIC_REASONS = {
    "cannot convert float NaN to integer": "nan-to-integer",
    "cannot convert Infinity to integer ratio": "infinity-to-integer-ratio",
    "int too large to convert to float": "integer-to-float-overflow",
}
UNORDERED_CORRECTION_SHA256 = "48d2997ac2c5a5cbeb078dd4d82c89353c8a4858388be3a72ee96334d03c75bd"
METADATA_PROFILES_SHA256 = "b58b03cb6fd663a46bda628e0cd9deaebd58e30b44c1019d72ba4b8818106ee8"
UNORDERED_PROFILES_SHA256 = "2686e1d4294ac5758d1fda4ae05ad4b733630ed70edefe5338ea64528ff1cde5"
SUBJECTS_PROFILES_SHA256 = "1bf717f7063da9fe4a7b3b1bef312acca0a02d59be91ffdc522ae5999fdbfe45"
SUBJECT_PHASES_FILE = "sol-python-schema-error-subject-phases.json"
SUBJECT_PHASES_SHA256 = "2d7b68f0c94d8addfc53ffdca97f52064bfa51d9df367df89093d270d006a27b"
REFERENCE_TERMINALS_PROFILES_SHA256 = "d70d4a77c50ede552ec1e5614abfb15ee7c9a53b97cef4f8ea0e06f8f8f4411d"
REFERENCE_INDICES_PROFILES_SHA256 = "fbe607c386aa26835f69c5d963b7b299d1d56e9935951a669882c8b51ce55e34"
PATH_SEGMENTS_PROFILES_SHA256 = "add048101b07a240b4a0e574ec272f766223538130a5e9cfca7031ba696bd2b0"
PATH_KEYS_PROFILES_SHA256 = "05c89f3719d2686800e866feb436b9291d9572e50b4d26390dcede3605f74fc5"
ANNOTATION_ORDER_PROFILES_SHA256 = "08a25a650d341ce56f781f92c6ed598958ee9fd6fd0063d0dd6c99326bb040b0"
RECURSIVE_SCOPE_PROFILES_SHA256 = "c9953569f226700e7b03bb4529981ae644649e11e40b09597fc86b2d4c703f54"
RECURSIVE_SCOPE_DESIGN_SHA256 = "8a4d6da41bfabefae4ef6e8d31f755bd7336c4bb831a61cb581f9dfd6983acea"
RECURSIVE_SCOPE_CLARIFICATION_SHA256 = "a1ee054a022d62e36ed9bbb67c61b87f31afa29251dd649efdc6e97aa3feffb7"
RESOURCE_IDENTITY_PROFILES_SHA256 = "24ad0adb3e80654d9ce105c84ffcb19f1467d124aa28aa85f81bfca1ab5ea103"
RESOURCE_IDENTITY_DESIGN_SHA256 = "18832e1b97dc010fbee2418865541cc2c23f9468441821ed384d8a248b155b88"
RESOURCE_ANCHOR_PROFILES_SHA256 = "2b0502daba9e9d04d3e72da71ea2c8c325cbee3242b11de0e6a7885eccbe084d"
RESOURCE_IDENTITY_REPRESENTATION_SHA256 = "7d657027d557ad143e8e057c0b9821909f641deedd85ff554ce0700a4712265f"
RESOURCE_URI_OPERATIONS_PROFILES_SHA256 = "1017a9140607d05e84c8f5998cb23ebcb8b4cc3d97cb3c78f691da50768e86fb"
RESOURCE_URI_OPERATIONS_INDEPENDENT_REVIEW_SHA256 = "b859d271d81252dfc66e74e6ee1557c85e0878f568b75bd1211f96cc0daf98d2"
RESOURCE_URI_OPERATIONS_GENERATOR_SHA256 = "db2a75afe2d98c13f6c1def642c1e029198c800efd701d14cb90bfd1c1399fd8"
REFERENCE_TERMINAL_DECISION_SHA256 = "b59548a2480f3373dce7f8b44c385afe1f7aa346aebc221f0689f6b9b6ee6da3"
REFERENCE_PROFILE_AMENDMENT_SHA256 = "847b79e0b20840cb23a3f0479c2b29f931f868b13c237e09b5a1a2f5b92f62dc"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def recipe_value(recipe: dict) -> object:
    kind = recipe["kind"]
    if kind == "float":
        return struct.unpack(">d", bytes.fromhex(recipe["bits"]))[0]
    if kind == "integer":
        return int(recipe["decimal"])
    if kind == "string":
        if "codepoints" in recipe:
            return "".join(chr(point) for point in recipe["codepoints"])
        if "points" in recipe:
            return "".join(chr(point) for point in recipe["points"])
        return recipe["value"]
    if kind == "null":
        return None
    if kind == "bool":
        return recipe["value"]
    if kind == "boolean":
        return recipe["value"]
    if kind == "array":
        return [recipe_value(item) for item in recipe["items"]]
    if kind == "object":
        members = {}
        for key, value in recipe["members"]:
            if isinstance(key, list):
                key = "".join(chr(point) for point in key)
            members[key] = recipe_value(value)
        return members
    raise RuntimeError(f"Unknown frozen schema instance recipe: {kind}")


def make_instance(case: dict, values: dict) -> object:
    recipe = case["instanceRecipe"]
    if "kind" in recipe:
        return recipe_value(recipe)
    value = recipe_value(values[recipe["value"]])
    shape = recipe["shape"]
    if shape == "scalar":
        return value
    if shape == "array":
        return [value]
    if shape == "object":
        return {"x": value}
    raise RuntimeError(f"Unknown frozen schema instance shape: {shape}")


def error_record(error: BaseException) -> dict:
    code = getattr(error, "code", None)
    reason = str(error) if str(error) in ARITHMETIC_REASONS.values() else None
    if code == "PYTHON_SCHEMA_ARITHMETIC" and reason is not None:
        return {"status": "arithmetic-error", "code": code, "reason": reason}
    if code in {"SCHEMA_REF_UNRESOLVED", "PYTHON_SCHEMA_EVALUATION"}:
        return {"status": "evaluation-error", "code": code}
    if hasattr(error, "validator") and hasattr(error, "absolute_path"):
        return {
            "status": "validation-error",
            "error": {
                "keyword": error.validator,
                "instancePath": list(error.absolute_path),
                "schemaPath": list(error.absolute_schema_path),
            },
        }
    return {"status": "unexpected-error", "type": type(error).__name__, "code": code, "message": str(error)}


def admission_error_record(error: BaseException) -> dict:
    code = getattr(error, "code", None)
    if code == "SCHEMA_REF_UNRESOLVED":
        return {"status": "schema-admission-error", "code": code}
    return {"status": "unexpected-admission-error", "type": type(error).__name__, "code": code}


def candidate_method(validator, instance: object, method: str) -> dict:
    if method == "is_valid":
        try:
            return {"status": "validity", "valid": bool(validator.is_valid(instance))}
        except BaseException as error:  # Preserve exception status for comparison.
            return error_record(error)
    if method == "validate":
        try:
            validator.validate(instance)
            return {"status": "valid"}
        except BaseException as error:  # Preserve the first schema or arithmetic outcome.
            return error_record(error)

    # Iteration itself must not evaluate or raise. The terminal arithmetic
    # outcome is observed only after the ordered public error prefix is yielded.
    prefix = []
    try:
        iterator = validator.iter_errors(instance)
    except BaseException as error:
        return {**error_record(error), "prefix": prefix}
    try:
        for error in iterator:
            prefix.append({
                "keyword": error.validator,
                "instancePath": list(error.absolute_path),
                "schemaPath": list(error.absolute_schema_path),
            })
    except BaseException as error:
        return {**error_record(error), "prefix": prefix}
    return {"status": "end", "prefix": prefix}


def target_record(expected: dict) -> dict:
    if expected["status"] == "evaluation-error":
        code = "SCHEMA_REF_UNRESOLVED" if expected.get("type") in {
            "_WrappedReferencingError", "PointerToNowhere",
        } else "PYTHON_SCHEMA_EVALUATION"
        return {"status": "evaluation-error", "code": code}
    if expected["status"] != "arithmetic-error":
        return expected
    reason = ARITHMETIC_REASONS.get(expected.get("message"))
    if reason is None:
        raise RuntimeError(f"Unmapped frozen schema arithmetic outcome: {expected}")
    return {"status": "arithmetic-error", "code": "PYTHON_SCHEMA_ARITHMETIC", "reason": reason}


def verify_legacy_ap_correction() -> tuple[dict[str, dict], dict[str, set[str]]]:
    decision_path = EVIDENCE / "approved-python-schema-2019-ap-correction.json"
    native_path = EVIDENCE / "sol-python-schema-2019-ap-native.json"
    target_path = EVIDENCE / "sol-python-schema-2019-ap-target-proposal.json"
    profiles_path = EVIDENCE / "sol-python-schema-2019-ap-target-profiles.json"
    baseline_path = EVIDENCE / FIXTURES["umf.r2-sol-python-schema-annotation-mechanism-2019/1"]["file"]
    if (sha256(decision_path) != LEGACY_AP_CORRECTION_SHA256
            or sha256(native_path) != LEGACY_AP_NATIVE_SHA256
            or sha256(target_path) != LEGACY_AP_TARGET_SHA256
            or sha256(profiles_path) != LEGACY_AP_PROFILES_SHA256):
        raise RuntimeError("Approved legacy additionalProperties correction inputs changed")
    decision = json.loads(decision_path.read_text(encoding="utf-8"))
    if (decision.get("id") != "R2-SOL-CORRECTION-001-AMENDMENT-001"
            or decision.get("status") != "root-approved-semantic-amendment-and-normalization"
            or decision.get("overallR2Approved") is not False
            or decision.get("sourceApproved") is not False
            or decision.get("selector", {}).get("dialect") != "Draft2019-09"
            or decision.get("selector", {}).get("keyword") != "additionalProperties"
            or decision.get("selector", {}).get("schemaKind") != "Object only"):
        raise RuntimeError("Unexpected approved legacy additionalProperties correction selector")
    if (decision.get("approvedRule") != "Only actual extra instance names, excluding adjacent declared properties and patternProperties matches, are tested with the existing FirstError descendant predicate against the AP rule. Mark successful extras as evaluated. Remove the erroneous AP-rule-own-member-name annotation."
            or decision.get("boolItemsNormalization", {}).get("code") != "PYTHON_SCHEMA_EVALUATION"
            or decision.get("boolItemsNormalization", {}).get("message") != "Draft 2019-09 boolean items annotation has no length"
            or decision.get("boolItemsNormalization", {}).get("selector") != "Reached Draft2019-09 item annotation helper after required reference processing, items is Bool and additionalItems is absent. additionalItems present causes native all-index early return and does not raise."
            or "additionalItems is absent" not in decision.get("boolItemsNormalization", {}).get("selector", "")):
        raise RuntimeError("Unexpected approved legacy annotation rule or boolean-items terminal selector")
    changed_rows = decision.get("selectedChangedRows", [])
    selected = {row.get("id"): set(row.get("methods", [])) for row in changed_rows}
    if len(selected) != 8 or sum(map(len, selected.values())) != 21:
        raise RuntimeError("Unexpected selected legacy additionalProperties correction set")
    if (decision.get("counts", {}).get("nativeCases") != 37
            or decision.get("counts", {}).get("methods") != 108
            or decision.get("counts", {}).get("constructorRefusals") != 1
            or decision.get("counts", {}).get("changedRows") != 8
            or decision.get("counts", {}).get("changedMethods") != 21):
        raise RuntimeError("Unexpected legacy additionalProperties correction counts")
    native = json.loads(native_path.read_text(encoding="utf-8"))
    target = json.loads(target_path.read_text(encoding="utf-8"))
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    if (native.get("profile") != "umf.r2-sol-python-schema-2019-ap-native/1"
            or target.get("profile") != "umf.r2-sol-python-schema-2019-ap-target/1"
            or native.get("jsonschema") != "4.26.0" or target.get("jsonschema") != "4.26.0"
            or len(native.get("cases", [])) != 37 or len(target.get("cases", [])) != 37
            or len(baseline.get("cases", [])) != 28):
        raise RuntimeError("Unexpected legacy additionalProperties native/target fixture shape")
    native_cases = {case["id"]: case for case in native["cases"]}
    target_cases = {case["id"]: case for case in target["cases"]}
    baseline_cases = {case["id"]: case for case in baseline["cases"]}
    if len(native_cases) != 37 or len(target_cases) != 37 or len(baseline_cases) != 28:
        raise RuntimeError("Duplicate case id in legacy additionalProperties receipts")
    if set(baseline_cases) - set(native_cases) or set(native_cases) != set(target_cases):
        raise RuntimeError("Legacy AP receipts do not contain the unchanged legacy baseline and target cases")
    observed_changes = set()
    for case_id, native_case in native_cases.items():
        target_case = target_cases[case_id]
        if (native_case.get("schemaText") != target_case.get("schemaText")
                or native_case.get("instanceRecipe") != target_case.get("instanceRecipe")
                or native_case.get("schemaError") != target_case.get("schemaError")):
            raise RuntimeError(f"Legacy AP target changed schema/instance/admission for {case_id}")
        if set(native_case.get("methods", {})) != set(target_case.get("methods", {})):
            raise RuntimeError(f"Legacy AP target changed method/admission shape for {case_id}")
        for method, expected in native_case.get("methods", {}).items():
            if target_case.get("methods", {}).get(method) != expected:
                observed_changes.add((case_id, method))
        if case_id in baseline_cases and native_case != baseline_cases[case_id]:
            raise RuntimeError(f"Native AP receipt changed frozen legacy case {case_id}")
    expected_changes = {(case_id, method) for case_id, methods in selected.items() for method in methods}
    if observed_changes != expected_changes:
        raise RuntimeError("Legacy AP target changes do not exactly match the approved selected method set")
    profiles = json.loads(profiles_path.read_text(encoding="utf-8"))
    if profiles.get("fixtures") != {
            "sol-python-schema-2019-ap-native.json": LEGACY_AP_NATIVE_SHA256,
            "sol-python-schema-2019-ap-target-proposal.json": LEGACY_AP_TARGET_SHA256,
    }:
        raise RuntimeError("Legacy AP profile receipt references different fixture bytes")
    if (profiles.get("id") != "R2-SOL-PYTHON-SCHEMA-2019-AP-TARGET-PROFILES-001"
            or profiles.get("status") != "independent-proposed-target-qualification-not-semantic-approval"
            or profiles.get("jsonschema") != "4.26.0" or profiles.get("basePython") != "3.11.17"
            or profiles.get("cases") != 37 or profiles.get("methods") != 108
            or profiles.get("admissionRefusals") != 1 or profiles.get("completeRecordsEqual") is not True
            or profiles.get("overallR2Approved") is not False):
        raise RuntimeError("Unexpected legacy AP cross-version profile receipt")
    profile_captures = {
        "3.12.15": {
            "sol-python-schema-2019-ap-native.json": "7f58c8e4027f5d34b18133866b5349aceddf967f729614b11dc2d2d48bad8846",
            "sol-python-schema-2019-ap-target-proposal.json": "b0c35a1af9e8335eb4c581e12c0917752a93a94077c69b4b07832fc3a53cf37f",
        },
        "3.13.16": {
            "sol-python-schema-2019-ap-native.json": "b39e3e8dbe05518db8e6f4046b92c47303c3dafb771629f14850c6de1781beb7",
            "sol-python-schema-2019-ap-target-proposal.json": "c9ddf40d36b014a39c4f896b64eba62c0491f4b378903f710b0c155069261e55",
        },
    }
    if {profile.get("python") for profile in profiles.get("profiles", [])} != set(profile_captures):
        raise RuntimeError("Unexpected legacy AP cross-version profile set")
    for profile in profiles["profiles"]:
        captures = {capture.get("fixture"): capture for capture in profile.get("captures", [])}
        for fixture_name, capture_sha in profile_captures[profile["python"]].items():
            capture = captures.get(fixture_name, {})
            if capture.get("captureSha256") != capture_sha or capture.get("completeRecordsEqual") is not True:
                raise RuntimeError(f"Incomplete legacy AP cross-version receipt for {profile['python']}/{fixture_name}")
    return target_cases, selected


def target_method(expected: dict, method: str) -> dict:
    target = target_record(expected)
    if expected["status"] in {"arithmetic-error", "evaluation-error"} and method == "iterate":
        target["prefix"] = expected["prefix"]
    return target


def runtime_phase_target(expected: dict, method: str) -> dict:
    target = {
        "status": "runtime-error",
        "code": "PYTHON_SCHEMA_EVALUATION",
        "message": "Draft 3 reference target is not an object schema",
    }
    if method == "iter_errors":
        target["prefix"] = expected["prefix"]
    return target


def normalize_runtime_phase(actual: dict, method: str) -> dict:
    target = {
        "status": "runtime-error",
        "code": actual.get("code"),
        "message": actual.get("message"),
    }
    if method == "iter_errors":
        target["prefix"] = actual.get("prefix", [])
    return target


def typed_python_value(value: object) -> dict:
    if value is None:
        return {"kind": "null"}
    if isinstance(value, bool):
        return {"kind": "boolean", "value": value}
    if isinstance(value, int):
        return {"kind": "integer", "decimal": str(value)}
    if isinstance(value, float):
        return {"kind": "float", "bits": struct.pack(">d", value).hex()}
    if isinstance(value, str):
        return {"kind": "string", "points": [ord(char) for char in value]}
    if isinstance(value, (list, tuple)):
        return {"kind": "array", "items": [typed_python_value(item) for item in value]}
    if isinstance(value, dict):
        return {"kind": "object", "members": [[key, typed_python_value(item)] for key, item in value.items()]}
    raise RuntimeError(f"Unsupported Python schema metadata value: {type(value).__name__}")


def candidate_metadata(validator, instance: object) -> list[dict]:
    errors = []
    for error in validator.iter_errors(instance):
        keyword = getattr(error, "validator", None)
        errors.append({
            "keyword": keyword,
            "validatorValue": typed_python_value(getattr(error, "validator_value", None)),
            "instance": typed_python_value(getattr(error, "instance", None)),
            "instancePath": list(error.absolute_path),
            "schemaPath": list(error.absolute_schema_path),
        })
    return errors


def verify_cross_version_profiles(filename: str, expected_sha: str, receipt_id: str,
                                  fixture_profile: str, cases: int, observations: int) -> None:
    path = EVIDENCE / filename
    if sha256(path) != expected_sha:
        raise RuntimeError(f"Cross-version schema fixture confirmation changed: {filename}")
    receipt = json.loads(path.read_text(encoding="utf-8"))
    if receipt.get("id") != receipt_id or receipt.get("overallR2Approved") is not False:
        raise RuntimeError(f"Unexpected cross-version schema fixture receipt: {filename}")
    for profile in receipt.get("profiles", []):
        if profile.get("python") not in {"3.12.15", "3.13.16"}:
            raise RuntimeError(f"Unexpected CPython version in {filename}")
        captures = {capture.get("fixture"): capture for capture in profile.get("captures", [])}
        capture = captures.get(FIXTURES[fixture_profile]["file"], {})
        if (capture.get("fixtureSha256") != FIXTURES[fixture_profile]["sha256"]
                or capture.get("cases") != cases
                or capture.get("methodObservations", capture.get("errorRecords", capture.get("errorObservations"))) != observations
                or capture.get("completeRecordsEqual") is not True):
            raise RuntimeError(f"Incomplete cross-version profile for {profile['python']}/{fixture_profile}")


def verify_complete_profile_receipt(filename: str, expected_sha: str, receipt_id: str,
                                    fixture: str, fixture_sha: str, cases: int,
                                    methods: int, refusals: int = 0) -> None:
    path = EVIDENCE / filename
    if sha256(path) != expected_sha:
        raise RuntimeError(f"Cross-version schema receipt changed: {filename}")
    receipt = json.loads(path.read_text(encoding="utf-8"))
    if (receipt.get("id") != receipt_id
            or receipt.get("fixture") != fixture
            or receipt.get("fixtureSha256") != fixture_sha
            or receipt.get("jsonschema") != "4.26.0"
            or receipt.get("basePython") != "3.11.17"
            or receipt.get("cases") != cases
            or receipt.get("methods") != methods
            or receipt.get("admissionRefusals") != refusals
            or receipt.get("completeRecordsEqual") is not True
            or {profile.get("python") for profile in receipt.get("profiles", [])} != {"3.12.15", "3.13.16"}
            or any(profile.get("completeRecordsEqual") is not True for profile in receipt.get("profiles", []))):
        raise RuntimeError(f"Incomplete cross-version schema receipt: {filename}")


def main() -> None:
    if len(sys.argv) != 1:
        raise SystemExit("usage: schema-evaluation-order-conformance.py")
    actual_python = sys.version.split()[0]
    if actual_python not in {"3.11.17", "3.12.15", "3.13.16"}:
        raise RuntimeError(f"No reviewed schema evaluation-order profile for CPython {actual_python}")

    decision_path = EVIDENCE / "sol-python-schema-evaluation-order-decision.json"
    profiles_path = EVIDENCE / "sol-python-schema-evaluation-order-profiles.json"
    if sha256(decision_path) != DECISION_SHA256:
        raise RuntimeError("Reviewed schema evaluation-order decision changed")
    decision = json.loads(decision_path.read_text(encoding="utf-8"))
    if decision.get("id") != "R2-SOL-PYTHON-SCHEMA-EVALUATION-ORDER-001":
        raise RuntimeError("Unexpected schema evaluation-order decision")
    if sha256(profiles_path) != PROFILES_SHA256:
        raise RuntimeError("Cross-version schema evaluation-order confirmation changed")
    profiles = json.loads(profiles_path.read_text(encoding="utf-8"))
    if profiles.get("id") != "R2-SOL-PYTHON-SCHEMA-EVALUATION-ORDER-PROFILES-001":
        raise RuntimeError("Unexpected schema evaluation-order profiles receipt")
    if profiles.get("overallR2Approved") is not False:
        raise RuntimeError("Unexpected R2 approval state in evaluation-order profile receipt")
    for profile in profiles.get("profiles", []):
        if profile.get("python") not in {"3.12.15", "3.13.16"}:
            raise RuntimeError("Unexpected cross-version evaluation-order profile")
        captures = {capture.get("fixture"): capture for capture in profile.get("captures", [])}
        for fixture_key in BASE_FIXTURES:
            config = FIXTURES[fixture_key]
            capture = captures.get(config["file"], {})
            if (capture.get("fixtureSha256") != config["sha256"]
                    or capture.get("cases") != config["cases"]
                    or capture.get("completeRecordsEqual") is not True):
                raise RuntimeError(f"Incomplete cross-version receipt for {profile['python']}/{config['file']}")

    yield_profiles_path = EVIDENCE / "sol-python-schema-yield-boundaries-profiles.json"
    if sha256(yield_profiles_path) != YIELD_PROFILES_SHA256:
        raise RuntimeError("Cross-version schema yield-boundary confirmation changed")
    yield_profiles = json.loads(yield_profiles_path.read_text(encoding="utf-8"))
    if yield_profiles.get("id") != "R2-SOL-PYTHON-SCHEMA-YIELD-BOUNDARIES-PROFILES-001":
        raise RuntimeError("Unexpected schema yield-boundary profile receipt")
    if yield_profiles.get("overallR2Approved") is not False:
        raise RuntimeError("Unexpected R2 approval state in yield-boundary receipt")
    for profile in yield_profiles.get("profiles", []):
        if profile.get("python") not in {"3.12.15", "3.13.16"}:
            raise RuntimeError("Unexpected yield-boundary cross-version profile")
        captures = {capture.get("fixture"): capture for capture in profile.get("captures", [])}
        capture = captures.get(FIXTURES["umf.r2-sol-python-schema-yield-boundaries/1"]["file"], {})
        if (capture.get("fixtureSha256") != FIXTURES["umf.r2-sol-python-schema-yield-boundaries/1"]["sha256"]
                or capture.get("cases") != 226
                or capture.get("methodObservations") != 675
                or capture.get("completeRecordsEqual") is not True):
            raise RuntimeError(f"Incomplete yield-boundary cross-version receipt for {profile['python']}")

    annotation_profiles_path = EVIDENCE / "sol-python-schema-annotation-reach-profiles.json"
    if sha256(annotation_profiles_path) != ANNOTATION_REACH_PROFILES_SHA256:
        raise RuntimeError("Cross-version schema annotation-reach confirmation changed")
    annotation_profiles = json.loads(annotation_profiles_path.read_text(encoding="utf-8"))
    if annotation_profiles.get("id") != "R2-SOL-PYTHON-SCHEMA-ANNOTATION-REACH-PROFILES-001":
        raise RuntimeError("Unexpected schema annotation-reach profile receipt")
    if annotation_profiles.get("overallR2Approved") is not False:
        raise RuntimeError("Unexpected R2 approval state in annotation-reach receipt")
    for profile in annotation_profiles.get("profiles", []):
        if profile.get("python") not in {"3.12.15", "3.13.16"}:
            raise RuntimeError("Unexpected annotation-reach cross-version profile")
        captures = {capture.get("fixture"): capture for capture in profile.get("captures", [])}
        capture = captures.get(FIXTURES["umf.r2-sol-python-schema-annotation-reach/1"]["file"], {})
        if (capture.get("fixtureSha256") != FIXTURES["umf.r2-sol-python-schema-annotation-reach/1"]["sha256"]
                or capture.get("cases") != 96
                or capture.get("methodObservations") != 285
                or capture.get("completeRecordsEqual") is not True):
            raise RuntimeError(f"Incomplete annotation-reach cross-version receipt for {profile['python']}")

    annotation_mechanism_profiles_path = EVIDENCE / "sol-python-schema-annotation-mechanism-profiles.json"
    if sha256(annotation_mechanism_profiles_path) != ANNOTATION_MECHANISM_PROFILES_SHA256:
        raise RuntimeError("Cross-version schema annotation-mechanism confirmation changed")
    annotation_mechanism_profiles = json.loads(annotation_mechanism_profiles_path.read_text(encoding="utf-8"))
    if (annotation_mechanism_profiles.get("id") != "R2-SOL-PYTHON-SCHEMA-ANNOTATION-MECHANISM-PROFILES-001"
            or annotation_mechanism_profiles.get("basePython") != "3.11.17"
            or annotation_mechanism_profiles.get("jsonschema") != "4.26.0"
            or annotation_mechanism_profiles.get("overallR2Approved") is not False
            or annotation_mechanism_profiles.get("completeRecordsEqual") is not True):
        raise RuntimeError("Unexpected schema annotation-mechanism profile receipt")
    expected_annotation_fixtures = {
        "sol-python-schema-annotation-mechanism-predecessor.json": ("787391e56f71759bf4b39542210466fca06d47ccd95b195529ddceed6e204008", 140, 393, 9),
        "sol-python-schema-annotation-mechanism-2019-predecessor.json": ("42e39726fe537b4f39d5bf1c691d598dd14aa51e4ca4e4f4b5299b4e7fcbfce8", 28, 81, 1),
    }
    receipt_fixtures = {entry.get("fixture"): entry for entry in annotation_mechanism_profiles.get("fixtures", [])}
    if set(receipt_fixtures) != set(expected_annotation_fixtures):
        raise RuntimeError("Unexpected fixture set in annotation-mechanism profile receipt")
    for filename, (fixture_sha, cases, methods, refusals) in expected_annotation_fixtures.items():
        capture = receipt_fixtures[filename]
        if (capture.get("fixtureSha256") != fixture_sha or capture.get("cases") != cases
                or capture.get("methods") != methods or capture.get("admissionRefusals") != refusals):
            raise RuntimeError(f"Incomplete annotation-mechanism fixture receipt for {filename}")
    expected_captures = {
        "3.12.15": {
            "sol-python-schema-annotation-mechanism-predecessor.json": "8885097c7fdc7b086dce300d049137ca44716573667fa89013b936acf777ea66",
            "sol-python-schema-annotation-mechanism-2019-predecessor.json": "5d9893520407f93baa140f38e414b486f11b6ae000171c071e0528560bc0d473",
        },
        "3.13.16": {
            "sol-python-schema-annotation-mechanism-predecessor.json": "d516dae589d5320314585dd9084d1e121a80575901db1807ad751fe7df6333b4",
            "sol-python-schema-annotation-mechanism-2019-predecessor.json": "edbe6760f03b605cf60ef5a60ba18a1411e29f8c39bb90bd48b0dab4e9740828",
        },
    }
    if {profile.get("python") for profile in annotation_mechanism_profiles.get("profiles", [])} != set(expected_captures):
        raise RuntimeError("Unexpected annotation-mechanism profile set")
    for profile in annotation_mechanism_profiles.get("profiles", []):
        if profile.get("python") not in {"3.12.15", "3.13.16"}:
            raise RuntimeError("Unexpected annotation-mechanism cross-version profile")
        captures = {capture.get("fixture"): capture for capture in profile.get("captures", [])}
        for filename in expected_annotation_fixtures:
            capture = captures.get(filename, {})
            if (capture.get("captureSha256") != expected_captures[profile["python"]][filename]
                    or capture.get("completeRecordsEqual") is not True):
                raise RuntimeError(f"Incomplete annotation-mechanism cross-version receipt for {profile['python']}/{filename}")

    verify_cross_version_profiles(
        "sol-python-schema-error-metadata-profiles.json", METADATA_PROFILES_SHA256,
        "R2-SOL-PYTHON-SCHEMA-ERROR-METADATA-PROFILES-001",
        "umf.r2-sol-python-schema-error-metadata/1", 63, 51,
    )
    verify_cross_version_profiles(
        "sol-python-schema-unordered-targets-profiles.json", UNORDERED_PROFILES_SHA256,
        "R2-SOL-PYTHON-SCHEMA-UNORDERED-TARGETS-PROFILES-001",
        "umf.r2-sol-python-schema-unordered-targets/1", 36, 108,
    )
    verify_cross_version_profiles(
        "sol-python-schema-error-subjects-profiles.json", SUBJECTS_PROFILES_SHA256,
        "R2-SOL-PYTHON-SCHEMA-ERROR-SUBJECTS-PROFILES-001",
        "umf.r2-sol-python-schema-error-subjects/1", 63, 38,
    )
    verify_complete_profile_receipt(
        "sol-python-schema-reference-terminals-profiles.json", REFERENCE_TERMINALS_PROFILES_SHA256,
        "R2-SOL-PYTHON-SCHEMA-REFERENCE-TERMINALS-PROFILES-001",
        "sol-python-schema-reference-terminals-predecessor.json",
        FIXTURES["umf.r2-sol-python-schema-reference-terminals/1"]["sha256"], 363, 1089,
    )
    verify_complete_profile_receipt(
        "sol-python-schema-reference-indices-profiles.json", REFERENCE_INDICES_PROFILES_SHA256,
        "R2-SOL-PYTHON-SCHEMA-REFERENCE-INDICES-PROFILES-001",
        "sol-python-schema-reference-indices-predecessor.json",
        FIXTURES["umf.r2-sol-python-schema-reference-indices/1"]["sha256"], 315, 945,
    )
    verify_complete_profile_receipt(
        "sol-python-schema-path-segments-profiles.json", PATH_SEGMENTS_PROFILES_SHA256,
        "R2-SOL-PYTHON-SCHEMA-PATH-SEGMENTS-PROFILES-001",
        "sol-python-schema-path-segments-predecessor.json",
        FIXTURES["umf.r2-sol-python-schema-path-segments/1"]["sha256"], 48, 42, 1,
    )
    path_keys_profiles_path = EVIDENCE / "sol-python-schema-path-keys-profiles.json"
    if sha256(path_keys_profiles_path) != PATH_KEYS_PROFILES_SHA256:
        raise RuntimeError("Cross-version typed schema path-key receipt changed")
    path_keys_profiles = json.loads(path_keys_profiles_path.read_text(encoding="utf-8"))
    if (path_keys_profiles.get("id") != "R2-SOL-PYTHON-SCHEMA-PATH-KEYS-PROFILES-001"
            or path_keys_profiles.get("fixture") != FIXTURES["umf.r2-sol-python-schema-path-keys/1"]["file"]
            or path_keys_profiles.get("fixtureSha256") != FIXTURES["umf.r2-sol-python-schema-path-keys/1"]["sha256"]
            or path_keys_profiles.get("sourceSha256") != "22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402"
            or path_keys_profiles.get("jsonschema") != "4.26.0"
            or path_keys_profiles.get("basePython") != "3.11.17"
            or path_keys_profiles.get("cases") != 132
            or path_keys_profiles.get("errorRecords") != 132
            or path_keys_profiles.get("admissionRefusals") != 0
            or path_keys_profiles.get("runtimeRefusals") != 0
            or path_keys_profiles.get("completeRecordsEqual") is not True
            or path_keys_profiles.get("overallR2Approved") is not False):
        raise RuntimeError("Unexpected typed schema path-key cross-version receipt")
    expected_path_key_captures = {
        "3.12.15": "ed7c975d39890a76a041394babef68e44e081a95b98245643ad84e0f34182eac",
        "3.13.16": "62fbdbb5dc00388104d91b46e0d0e18732442fe7ad1901bbe56645821021b772",
    }
    if {profile.get("python") for profile in path_keys_profiles.get("profiles", [])} != set(expected_path_key_captures):
        raise RuntimeError("Unexpected typed schema path-key profile set")
    for profile in path_keys_profiles["profiles"]:
        if (profile.get("completeRecordsEqual") is not True
                or profile.get("captureSha256") != expected_path_key_captures[profile["python"]]):
            raise RuntimeError(f"Incomplete typed schema path-key capture for {profile['python']}")
    annotation_order_profiles_path = EVIDENCE / "sol-python-schema-annotation-order-profiles.json"
    if sha256(annotation_order_profiles_path) != ANNOTATION_ORDER_PROFILES_SHA256:
        raise RuntimeError("Cross-version schema annotation-order receipt changed")
    annotation_order_profiles = json.loads(annotation_order_profiles_path.read_text(encoding="utf-8"))
    if (annotation_order_profiles.get("id") != "R2-SOL-PYTHON-SCHEMA-ANNOTATION-ORDER-PROFILES-001"
            or annotation_order_profiles.get("fixture") != FIXTURES["umf.r2-sol-python-schema-annotation-order/1"]["file"]
            or annotation_order_profiles.get("fixtureSha256") != FIXTURES["umf.r2-sol-python-schema-annotation-order/1"]["sha256"]
            or annotation_order_profiles.get("generatorSha256") != "3b685f52d8c4320f0767649f51f3a9079ae78cc515853c0733bd641619548039"
            or annotation_order_profiles.get("jsonschema") != "4.26.0"
            or annotation_order_profiles.get("basePython") != "3.11.17"
            or annotation_order_profiles.get("methods") != 159
            or annotation_order_profiles.get("admissionRefusals") != 0
            or annotation_order_profiles.get("completeRecordsEqual") is not True
            or annotation_order_profiles.get("overallR2Approved") is not False):
        raise RuntimeError("Unexpected schema annotation-order cross-version receipt")
    expected_annotation_order_captures = {
        "3.12.15": "7c74450985180353d1e454c8d36baf7ae8ea45313a04a1bcd3d811c163fd5af9",
        "3.13.16": "d6c3077d68e9a794a729607d5380a826d79e57e95117b1c2ca309911f07537fe",
    }
    if {profile.get("python") for profile in annotation_order_profiles.get("profiles", [])} != set(expected_annotation_order_captures):
        raise RuntimeError("Unexpected schema annotation-order profile set")
    for profile in annotation_order_profiles["profiles"]:
        if (profile.get("completeRecordsEqual") is not True
                or profile.get("captureSha256") != expected_annotation_order_captures[profile["python"]]):
            raise RuntimeError(f"Incomplete annotation-order capture for {profile['python']}")
    reference_decision = EVIDENCE / "sol-python-schema-reference-terminal-decision.json"
    reference_amendment = EVIDENCE / "sol-python-schema-reference-profile-amendment.json"
    if (sha256(reference_decision) != REFERENCE_TERMINAL_DECISION_SHA256
            or json.loads(reference_decision.read_text(encoding="utf-8")).get("id")
            != "R2-SOL-PYTHON-SCHEMA-REFERENCE-TERMINALS-001"
            or sha256(reference_amendment) != REFERENCE_PROFILE_AMENDMENT_SHA256
            or json.loads(reference_amendment.read_text(encoding="utf-8")).get("id")
            != "R2-SOL-PYTHON-SCHEMA-REFERENCE-PROFILE-002"):
        raise RuntimeError("Reviewed Python local-reference decision or profile amendment changed")
    phase_path = EVIDENCE / SUBJECT_PHASES_FILE
    if sha256(phase_path) != SUBJECT_PHASES_SHA256:
        raise RuntimeError("Frozen Python schema error-subject phase receipt changed")
    phase_receipt = json.loads(phase_path.read_text(encoding="utf-8"))
    if (phase_receipt.get("id") != "R2-SOL-PYTHON-SCHEMA-ERROR-SUBJECT-PHASES-001"
            or phase_receipt.get("originalFixtureSha256") != FIXTURES["umf.r2-sol-python-schema-error-subjects/1"]["sha256"]
            or phase_receipt.get("targetMapping", {}).get("code") != "PYTHON_SCHEMA_EVALUATION"
            or phase_receipt.get("targetMapping", {}).get("message") != "Draft 3 reference target is not an object schema"
            or sum(record.get("phase") == "construction" for record in phase_receipt.get("cases", [])) != 11
            or sum(record.get("phase") == "iteration" for record in phase_receipt.get("cases", [])) != 2
            or {profile.get("python") for profile in phase_receipt.get("profiles", [])} != {"3.11.17", "3.12.15", "3.13.16"}
            or any(not profile.get("completePhaseRecordsEqual") for profile in phase_receipt.get("profiles", []))):
        raise RuntimeError("Unexpected Python schema error-subject phase receipt")
    phase_by_id = {record["id"]: record for record in phase_receipt["cases"]}
    correction_path = EVIDENCE / "approved-python-schema-unordered-extras-correction.json"
    if sha256(correction_path) != UNORDERED_CORRECTION_SHA256:
        raise RuntimeError("Approved unordered-extra compatibility correction changed")
    correction = json.loads(correction_path.read_text(encoding="utf-8"))
    if (correction.get("id") != "R2-SOL-CORRECTION-003"
            or correction.get("targets", {}).get("file") != FIXTURES["umf.r2-sol-python-schema-unordered-targets/1"]["file"]
            or correction.get("targets", {}).get("sha256") != FIXTURES["umf.r2-sol-python-schema-unordered-targets/1"]["sha256"]):
        raise RuntimeError("Unexpected approved unordered-extra target")
    legacy_ap_target_cases, legacy_ap_selected_methods = verify_legacy_ap_correction()

    recursive_config = FIXTURES["umf.r2-sol-python-recursive-resource-scope/1"]
    recursive_profiles_path = EVIDENCE / "sol-python-recursive-resource-scope-profiles.json"
    recursive_design_path = EVIDENCE / "sol-python-recursive-resource-scope-design.json"
    recursive_clarification_path = EVIDENCE / "sol-python-recursive-resource-scope-clarification.json"
    if (sha256(recursive_profiles_path) != RECURSIVE_SCOPE_PROFILES_SHA256
            or sha256(recursive_design_path) != RECURSIVE_SCOPE_DESIGN_SHA256
            or sha256(recursive_clarification_path) != RECURSIVE_SCOPE_CLARIFICATION_SHA256):
        raise RuntimeError("Recursive resource-scope review inputs changed")
    recursive_profiles = json.loads(recursive_profiles_path.read_text(encoding="utf-8"))
    recursive_design = json.loads(recursive_design_path.read_text(encoding="utf-8"))
    recursive_clarification = json.loads(recursive_clarification_path.read_text(encoding="utf-8"))
    if (recursive_profiles.get("id") != "R2-SOL-PYTHON-RECURSIVE-RESOURCE-SCOPE-PROFILES-001"
            or recursive_profiles.get("profile") != "umf.r2-sol-python-recursive-resource-scope/1"
            or recursive_profiles.get("fixture") != recursive_config["file"]
            or recursive_profiles.get("fixtureSha256") != recursive_config["sha256"]
            or recursive_profiles.get("basePython") != "3.11.17"
            or recursive_profiles.get("baseCaptureSha256") != recursive_config["sha256"]
            or recursive_profiles.get("jsonschema") != "4.26.0"
            or recursive_profiles.get("cases") != 89
            or recursive_profiles.get("methods") != 255
            or recursive_profiles.get("constructorRefusals") != 4
            or recursive_design.get("id") != "R2-SOL-PYTHON-RESOURCE-SCOPE-001"
            or recursive_design.get("fixture", {}).get("sha256") != recursive_config["sha256"]
            or recursive_design.get("fixture", {}).get("cases") != 89
            or recursive_design.get("fixture", {}).get("admittedCases") != 85
            or recursive_design.get("fixture", {}).get("methods") != 255
            or recursive_design.get("fixture", {}).get("constructorRefusals") != 4
            or recursive_clarification.get("id") != "R2-SOL-PYTHON-RESOURCE-SCOPE-CLARIFICATION-001"
            or recursive_clarification.get("fixture", {}).get("sha256") != recursive_config["sha256"]
            or recursive_clarification.get("baseDesign", {}).get("sha256") != RECURSIVE_SCOPE_DESIGN_SHA256
            or recursive_clarification.get("phaseAndEnvelope", {}).get("construction", {}).get("ids")
            != list(recursive_config["admissionErrorCases"])
            or recursive_clarification.get("phaseAndEnvelope", {}).get("construction", {}).get("target")
            != {"status": "schema-admission-error", "code": "SCHEMA_REF_UNRESOLVED"}
            or recursive_clarification.get("phaseAndEnvelope", {}).get("runtime", {}).get("ids")
            != [
                "draft4-nested-pointer-inner", "draft4-nested-pointer-outer",
                "draft6-nested-pointer-inner", "draft6-nested-pointer-outer",
                "draft7-nested-pointer-inner", "draft7-nested-pointer-outer",
            ]
            or recursive_clarification.get("phaseAndEnvelope", {}).get("runtime", {}).get("target", {}).get("code")
            != "SCHEMA_REF_UNRESOLVED"):
        raise RuntimeError("Unexpected recursive resource-scope profile/design receipt")
    recursive_cases = {case["id"]: case for case in json.loads(
        (EVIDENCE / recursive_config["file"]).read_text(encoding="utf-8")
    )["cases"]}
    runtime_reference_ids = recursive_clarification["phaseAndEnvelope"]["runtime"]["ids"]
    if any(
            case_id not in recursive_cases
            or set(recursive_cases[case_id].get("methods", {})) != {"is_valid", "validate", "iterate"}
            or any(recursive_cases[case_id]["methods"][method].get("status") != "evaluation-error"
                   or method == "iterate" and recursive_cases[case_id]["methods"][method].get("prefix") != []
                   for method in ("is_valid", "validate", "iterate"))
            for case_id in runtime_reference_ids):
        raise RuntimeError("Recursive-scope clarification runtime rows no longer match the frozen 18-method phase")
    recursive_profile_entries = recursive_profiles.get("profiles", [])
    expected_recursive_profiles = {
        "3.12.15": "a2668db417d9d17c82c594392f23c00926ef1d6cc8e6c18c6c960248af0ae769",
        "3.13.16": "e51c0ab7e215e9d9b501e8cf8a11f80412c9f73718c6376343d9f809c9b0b41e",
    }
    if {item.get("python") for item in recursive_profile_entries} != set(expected_recursive_profiles):
        raise RuntimeError("Unexpected recursive resource-scope cross-version profile set")
    for item in recursive_profile_entries:
        if (item.get("captureSha256") != expected_recursive_profiles[item["python"]]
                or item.get("completeCaseRecordsEqual") is not True
                or item.get("typedSourceAndInstanceRecipesEqual") is not True
                or item.get("cases") != 89
                or item.get("methods") != 255
                or item.get("constructorRefusals") != 4):
            raise RuntimeError(f"Incomplete recursive resource-scope profile for {item.get('python')}")

    identity_config = FIXTURES["umf.r2-sol-python-resource-identity-companion/1"]
    identity_profiles_path = EVIDENCE / "sol-python-resource-identity-companion-profiles.json"
    identity_design_path = EVIDENCE / "sol-python-resource-identity-design.json"
    if (sha256(identity_profiles_path) != RESOURCE_IDENTITY_PROFILES_SHA256
            or sha256(identity_design_path) != RESOURCE_IDENTITY_DESIGN_SHA256):
        raise RuntimeError("Python resource-identity companion review inputs changed")
    identity_profiles = json.loads(identity_profiles_path.read_text(encoding="utf-8"))
    identity_design = json.loads(identity_design_path.read_text(encoding="utf-8"))
    identity_uri_profile = {
        "checkSchemaUsesClassFormatChecker": True,
        "optionalModules": {
            "rfc3987": False,
            "rfc3986_validator": False,
            "rfc3987_syntax": False,
            "uri_template": False,
        },
        "registeredUriFormatCheckers": {
            "Draft4Validator": [],
            "Draft6Validator": [],
            "Draft7Validator": [],
            "Draft201909Validator": [],
            "Draft202012Validator": [],
        },
        "declaredPredecessorDependency": "jsonschema>=4.25,<5 without format extras",
    }
    if (identity_profiles.get("id") != "R2-SOL-PYTHON-RESOURCE-IDENTITY-PROFILES-001"
            or identity_profiles.get("profile") != "umf.r2-sol-python-resource-identity-companion/1"
            or identity_profiles.get("fixture") != identity_config["file"]
            or identity_profiles.get("fixtureSha256") != identity_config["sha256"]
            or identity_profiles.get("basePython") != "3.11.17"
            or identity_profiles.get("baseCaptureSha256") != identity_config["sha256"]
            or identity_profiles.get("jsonschema") != "4.26.0"
            or identity_profiles.get("referencing") != "0.37.0"
            or identity_profiles.get("cases") != 114
            or identity_profiles.get("methods") != 342
            or identity_profiles.get("constructorRefusals") != 0
            or identity_profiles.get("uriAdmissionProfile") != identity_uri_profile
            or identity_design.get("id") != "R2-SOL-PYTHON-RESOURCE-IDENTITY-001"
            or identity_design.get("fixture", {}).get("sha256") != identity_config["sha256"]
            or identity_design.get("fixture", {}).get("cases") != 114
            or identity_design.get("fixture", {}).get("methods") != 342
            or identity_design.get("fixture", {}).get("constructorRefusals") != 0
            or identity_design.get("nativeUriProfile") != identity_uri_profile):
        raise RuntimeError("Unexpected Python resource-identity profile/design receipt")
    expected_identity_profiles = {
        "3.12.15": "da79275b90b9b6ff90af946057df117d277741710ccb1ef18be3482d63ac776b",
        "3.13.16": "1148d7310a1979dd3180a57ca66da10bcff20715fc36051e0e061a920007483c",
    }
    identity_profile_entries = identity_profiles.get("profiles", [])
    if {item.get("python") for item in identity_profile_entries} != set(expected_identity_profiles):
        raise RuntimeError("Unexpected resource-identity cross-version profile set")
    for item in identity_profile_entries:
        if (item.get("captureSha256") != expected_identity_profiles[item["python"]]
                or item.get("completeCaseRecordsEqual") is not True
                or item.get("typedSourceAndInstanceRecipesEqual") is not True
                or item.get("uriAdmissionProfileEqual") is not True
                or item.get("cases") != 114
                or item.get("methods") != 342
                or item.get("constructorRefusals") != 0):
            raise RuntimeError(f"Incomplete resource-identity profile for {item.get('python')}")

    anchor_config = FIXTURES["umf.r2-sol-python-resource-anchor-companion/1"]
    anchor_profiles_path = EVIDENCE / "sol-python-resource-anchor-companion-profiles.json"
    identity_representation_path = EVIDENCE / "sol-python-resource-identity-representation.json"
    if (sha256(anchor_profiles_path) != RESOURCE_ANCHOR_PROFILES_SHA256
            or sha256(identity_representation_path) != RESOURCE_IDENTITY_REPRESENTATION_SHA256):
        raise RuntimeError("Python resource-anchor review inputs changed")
    anchor_profiles = json.loads(anchor_profiles_path.read_text(encoding="utf-8"))
    identity_representation = json.loads(identity_representation_path.read_text(encoding="utf-8"))
    if (anchor_profiles.get("id") != "R2-SOL-PYTHON-RESOURCE-ANCHOR-PROFILES-001"
            or anchor_profiles.get("fixture") != anchor_config["file"]
            or anchor_profiles.get("sha256") != anchor_config["sha256"]
            or anchor_profiles.get("cases") != 24
            or anchor_profiles.get("methods") != 72
            or anchor_profiles.get("constructorRefusals") != 0
            or anchor_profiles.get("target") != "Exact frozen predecessor; no semantic correction."
            or identity_representation.get("id") != "R2-SOL-PYTHON-RESOURCE-IDENTITY-REPRESENTATION-001"
            or identity_representation.get("qualification", {}).get("identity114") != identity_config["sha256"]
            or identity_representation.get("qualification", {}).get("anchor24") != anchor_config["sha256"]):
        raise RuntimeError("Unexpected Python resource-anchor profile/representation receipt")
    expected_anchor_profiles = {
        "3.11.17": "ba8357b3d85b64edefea6f57b3ca91872ef8053d3182406ee7543af5bbd2f2d5",
        "3.12.15": "c8e6f7f2a69f5efe9595dc5357b39f27a8788274462e38b964ae30da7dff00bb",
        "3.13.16": "61383ec0c7ac95d464a6039204af009fa9a8bde737a5f66c26a8c9478f462894",
    }
    anchor_profile_entries = anchor_profiles.get("profiles", [])
    if {item.get("python") for item in anchor_profile_entries} != set(expected_anchor_profiles):
        raise RuntimeError("Unexpected resource-anchor cross-version profile set")
    for item in anchor_profile_entries:
        if (item.get("captureSha256") != expected_anchor_profiles[item["python"]]
                or item.get("recordsEqual") is not True
                or item.get("uriAdmissionProfileEqual") is not True):
            raise RuntimeError(f"Incomplete resource-anchor profile for {item.get('python')}")

    uri_operations_config = FIXTURES["umf.r2-sol-python-resource-uri-operations/1"]
    uri_operations_profiles_path = EVIDENCE / "sol-python-resource-uri-operations-profiles.json"
    uri_operations_review_path = EVIDENCE / "sol-python-resource-uri-operations-independent-review.json"
    uri_operations_generator_path = EVIDENCE / "freeze-python-resource-uri-operations.py"
    if (sha256(uri_operations_profiles_path) != RESOURCE_URI_OPERATIONS_PROFILES_SHA256
            or sha256(uri_operations_review_path) != RESOURCE_URI_OPERATIONS_INDEPENDENT_REVIEW_SHA256
            or sha256(uri_operations_generator_path) != RESOURCE_URI_OPERATIONS_GENERATOR_SHA256):
        raise RuntimeError("Python resource-URI operation review inputs changed")
    uri_operations_profiles = json.loads(uri_operations_profiles_path.read_text(encoding="utf-8"))
    uri_operations_review = json.loads(uri_operations_review_path.read_text(encoding="utf-8"))
    expected_uri_operations_captures = {
        "3.11.17": uri_operations_config["sha256"],
        "3.12.15": "bd602fb6df7048475df71080faa45bbeb462c86a172050f1398743cb759a7970",
        "3.13.16": "c0435239437dfdb8a9c9997203354435a2422784324870c69614d94f03e50a7f",
    }
    uri_profile = {
        "checkSchemaUsesClassFormatChecker": True,
        "optionalModules": {
            "rfc3987": False,
            "rfc3986_validator": False,
            "rfc3987_syntax": False,
            "uri_template": False,
        },
        "registeredUriFormatCheckers": {
            "Draft4Validator": [],
            "Draft6Validator": [],
            "Draft7Validator": [],
            "Draft201909Validator": [],
            "Draft202012Validator": [],
        },
        "declaredPredecessorDependency": "jsonschema>=4.25,<5 without format extras",
    }
    if (uri_operations_profiles.get("id") != "R2-SOL-PYTHON-RESOURCE-URI-OPERATIONS-PROFILES-001"
            or uri_operations_profiles.get("fixture") != uri_operations_config["file"]
            or uri_operations_profiles.get("sha256") != uri_operations_config["sha256"]
            or uri_operations_profiles.get("cases") != 24
            or uri_operations_profiles.get("methods") != 72
            or uri_operations_profiles.get("uriOperations") != 140
            or uri_operations_profiles.get("constructorRefusals") != 0
            or uri_operations_profiles.get("generatorSha256") != RESOURCE_URI_OPERATIONS_GENERATOR_SHA256
            or uri_operations_profiles.get("uriAdmissionProfile") != uri_profile
            or uri_operations_review.get("id") != "R2-SOL-PYTHON-RESOURCE-URI-OPERATIONS-INDEPENDENT-REVIEW-001"
            or uri_operations_review.get("status") != "native finite companion independently verified; implementation/source closure and artifacts remain pending"
            or uri_operations_review.get("sourceApproved") is not False
            or uri_operations_review.get("overallR2Approved") is not False
            or uri_operations_review.get("fixture", {}).get("sha256") != uri_operations_config["sha256"]
            or uri_operations_review.get("fixture", {}).get("publicCases") != 24
            or uri_operations_review.get("fixture", {}).get("methodObservations") != 72
            or uri_operations_review.get("fixture", {}).get("constructorRefusals") != 0
            or uri_operations_review.get("fixture", {}).get("nativeUriOperationCases") != 140
            or uri_operations_review.get("profiles", {}).get("sha256") != RESOURCE_URI_OPERATIONS_PROFILES_SHA256
            or uri_operations_review.get("generator", {}).get("sha256") != RESOURCE_URI_OPERATIONS_GENERATOR_SHA256):
        raise RuntimeError("Unexpected Python resource-URI operation profile/review receipt")
    uri_profile_entries = uri_operations_profiles.get("profiles", [])
    if {item.get("python") for item in uri_profile_entries} != set(expected_uri_operations_captures):
        raise RuntimeError("Unexpected resource-URI operation cross-version profile set")
    for item in uri_profile_entries:
        if (item.get("captureSha256") != expected_uri_operations_captures[item["python"]]
                or item.get("recordsEqual") is not True
                or item.get("uriOperationsEqual") is not True
                or item.get("uriAdmissionProfileEqual") is not True):
            raise RuntimeError(f"Incomplete resource-URI operation profile for {item.get('python')}")

    failures = []
    case_count = observation_count = arithmetic_count = iterator_terminal_count = 0
    error_observation_count = 0
    runtime_error_observation_count = 0
    per_fixture = {}
    schema_refusal_count = 0
    for profile, config in FIXTURES.items():
        path = EVIDENCE / config["file"]
        if sha256(path) != config["sha256"]:
            raise RuntimeError(f"Frozen evaluation-order fixture changed: {config['file']}")
        receipt = json.loads(path.read_text(encoding="utf-8"))
        if receipt.get("profile") != config.get("profile", profile) or receipt.get("jsonschema") != "4.26.0":
            raise RuntimeError(f"Unexpected evaluation-order fixture metadata: {config['file']}")
        cases = receipt.get("cases", [])
        if len(cases) != config["cases"]:
            raise RuntimeError(f"Frozen case count changed: {config['file']}")
        if profile == "umf.r2-sol-python-schema-error-subjects/1":
            original_phase_ids = {case["id"] for case in cases if "schemaError" in case}
            if original_phase_ids != set(phase_by_id):
                raise RuntimeError("Supplemental phase receipt no longer covers exactly the original mislabeled cases")
        fixture_expected_observations = config.get("methodObservations")
        fixture_observations = 0
        fixture_case_count = 0
        for case in cases:
            case_filter = config.get("caseFilter")
            if case_filter is not None and case["id"] not in case_filter:
                continue
            case_count += 1
            fixture_case_count += 1
            phase = phase_by_id.get(case["id"]) if profile == "umf.r2-sol-python-schema-error-subjects/1" else None
            schema = recipe_value(case["schemaRecipe"]) if "schemaRecipe" in case else json.loads(case["schemaText"])
            instance = make_instance(case, receipt.get("instanceValues", {}))
            try:
                validator = schema_validator(schema)
            except BaseException as error:
                admission_code = config.get("admissionErrorCases", {}).get(case["id"])
                if admission_code is not None:
                    expected_admission = {"status": "schema-admission-error", "code": admission_code}
                    actual_admission = admission_error_record(error)
                    schema_refusal_count += 1
                    if actual_admission != expected_admission:
                        failures.append({"profile": profile, "id": case["id"], "method": "admission",
                                         "expected": expected_admission, "actual": actual_admission})
                    continue
                if "schemaError" not in case or phase is not None and phase.get("phase") != "construction":
                    failures.append({"profile": profile, "id": case["id"], "method": "admission",
                                     "expected": "admitted", "actual": error_record(error)})
                    continue
                schema_refusal_count += 1
                continue
            if "schemaError" in case:
                if case["id"] in config.get("admissionErrorCases", {}):
                    failures.append({"profile": profile, "id": case["id"], "method": "admission",
                                     "expected": {"status": "schema-admission-error",
                                                  "code": config["admissionErrorCases"][case["id"]]},
                                     "actual": "admitted"})
                    continue
                if phase is None or phase.get("phase") == "construction":
                    schema_refusal_count += 1
                    failures.append({"profile": profile, "id": case["id"], "method": "admission",
                                     "expected": "schema refusal", "actual": "admitted"})
                    continue
                if phase.get("phase") != "iteration" or phase.get("construction") != "accepted":
                    failures.append({"profile": profile, "id": case["id"], "method": "phase-map",
                                     "expected": "construction refusal or admitted runtime failure", "actual": phase})
                    continue
                for method in ("is_valid", "validate", "iter_errors"):
                    expected = runtime_phase_target(phase["methods"][method], method)
                    actual = normalize_runtime_phase(candidate_method(validator, instance, method), method)
                    runtime_error_observation_count += 1
                    if actual != expected:
                        failures.append({"profile": profile, "id": case["id"], "method": method,
                                         "expected": expected, "actual": actual})
                continue
            if config.get("errorObservations") is not None:
                expected = case["errors"]
                actual = candidate_metadata(validator, instance)
                error_observation_count += len(actual)
                fixture_observations += len(actual)
                if actual != expected:
                    failures.append({"profile": profile, "id": case["id"], "method": "error-metadata",
                                     "expected": expected, "actual": actual})
                continue
            for method in ("is_valid", "validate", "iterate"):
                expected_source = case["methods"][method]
                if profile == "umf.r2-sol-python-schema-annotation-mechanism-2019/1":
                    if method in legacy_ap_selected_methods.get(case["id"], set()):
                        expected_source = legacy_ap_target_cases[case["id"]]["methods"][method]
                expected = target_method(expected_source, method)
                actual = candidate_method(validator, instance, method)
                observation_count += 1
                fixture_observations += 1
                if actual.get("status") == "arithmetic-error":
                    arithmetic_count += 1
                    if method == "iterate":
                        iterator_terminal_count += 1
                if actual != expected:
                    failures.append({"profile": profile, "id": case["id"], "method": method,
                                     "expected": expected, "actual": actual})
        if (fixture_expected_observations is not None
                and fixture_observations != fixture_expected_observations):
            failures.append({"profile": profile, "id": "<fixture>", "method": "observation-count",
                             "expected": fixture_expected_observations, "actual": fixture_observations})
        if config.get("errorObservations") is not None and fixture_observations != config["errorObservations"]:
            failures.append({"profile": profile, "id": "<fixture>", "method": "error-observation-count",
                             "expected": config["errorObservations"], "actual": fixture_observations})
        expected_refusals = config.get("schemaAdmissionRefusals")
        if expected_refusals is not None:
            if profile == "umf.r2-sol-python-schema-error-subjects/1":
                actual_refusals = sum(record.get("phase") == "construction" for record in phase_receipt["cases"])
            else:
                refusal_cases = cases if config.get("caseFilter") is None else [case for case in cases if case["id"] in config["caseFilter"]]
                actual_refusals = sum("schemaError" in case for case in refusal_cases)
            if actual_refusals != expected_refusals:
                raise RuntimeError(f"Frozen schema refusal count changed: {config['file']}")
        per_fixture[profile] = {
            "cases": fixture_case_count,
            "methodObservations": fixture_observations if config.get("methodObservations") is not None else 0,
            "errorObservations": fixture_observations if config.get("errorObservations") is not None else 0,
        }

    report = {
        "status": "fail" if failures else "pass",
        "python": actual_python,
        "jsonschema": "4.26.0",
        "fixtures": per_fixture,
        "cases": case_count,
        "methodObservations": observation_count,
        "errorMetadataObservations": error_observation_count,
        "runtimeErrorObservations": runtime_error_observation_count,
        "arithmeticErrors": arithmetic_count,
        "deferredIteratorArithmeticErrors": iterator_terminal_count,
        "schemaAdmissionRefusals": schema_refusal_count,
        "mismatches": len(failures),
        "mismatchBuckets": dict(Counter(f"{item['profile']}/{item['method']}" for item in failures)),
        "firstFive": failures[:5],
        "failures": failures,
    }
    print(json.dumps(report, ensure_ascii=True))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

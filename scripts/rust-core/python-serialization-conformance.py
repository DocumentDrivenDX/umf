# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compare the installed typed Python serialization API with frozen oracles."""

from __future__ import annotations

import json
import hashlib
import struct
import sys
from pathlib import Path
from typing import Any

from umf.serialization import read_json_value, write_json_value


def text(points: list[int]) -> str:
    return "".join(chr(point) for point in points)


def from_tagged(value: dict[str, Any]) -> Any:
    kind = value["kind"]
    if kind == "null":
        return None
    if kind == "bool":
        return value["value"]
    if kind == "int":
        return int(value["decimal"])
    if kind == "float":
        return struct.unpack(">d", bytes.fromhex(value["bits"]))[0]
    if kind == "str":
        return text(value["codepoints"])
    if kind == "list":
        return [from_tagged(item) for item in value["items"]]
    if kind == "dict":
        return {from_tagged(key): from_tagged(item) for key, item in value["entries"]}
    raise ValueError(f"Unknown frozen value kind: {kind}")


def tagged(value: Any) -> dict[str, Any]:
    if value is None:
        return {"kind": "null"}
    if type(value) is bool:
        return {"kind": "bool", "value": value}
    if type(value) is int:
        return {"kind": "int", "decimal": str(value)}
    if type(value) is float:
        return {"kind": "float", "bits": struct.pack(">d", value).hex()}
    if type(value) is str:
        return {"kind": "str", "codepoints": [ord(char) for char in value]}
    if type(value) is list:
        return {"kind": "list", "items": [tagged(item) for item in value]}
    if type(value) is dict:
        return {"kind": "dict", "entries": [[tagged(key), tagged(item)] for key, item in value.items()]}
    raise TypeError(f"Unexpected installed result type: {type(value).__name__}")


def case_canonical_hash(case: dict[str, Any]) -> str:
    encoded = json.dumps(case, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    return hashlib.sha256(encoded).hexdigest()


def main() -> int:
    if len(sys.argv) != 11:
        raise SystemExit(
            "usage: python-serialization-conformance.py BASE ORDERING SCALARS CHARACTERS SOURCE-CONTEXT PROFILE-EDGES BREAK-CONTEXT DIRECTIVES DIRECTIVE-TAIL NEL-CORRECTION"
        )
    receipts = [json.loads(Path(path).read_text(encoding="utf-8")) for path in sys.argv[1:10]]
    correction = json.loads(Path(sys.argv[10]).read_text(encoding="utf-8"))
    character_path = Path(sys.argv[4])
    character_hash = hashlib.sha256(character_path.read_bytes()).hexdigest()
    if correction.get("id") != "R2-SOL-CORRECTION-002" or correction.get("status") != "approved-required-correction":
        raise RuntimeError("The narrowly scoped Python YAML NEL correction is not approved")
    selector = correction.get("baseline", {})
    if selector.get("fixtureSha256") != character_hash:
        raise RuntimeError("The approved NEL correction does not match the exact character fixture hash")
    python_minor = sys.version_info.minor
    matching = [(receipt, oracle_id, oracle) for receipt in receipts
                for oracle_id, oracle in receipt["oracles"].items()
                if oracle_id.startswith(f"cpython3.{python_minor}/")]
    if not matching:
        raise RuntimeError(f"No frozen Python serialization oracle for CPython 3.{python_minor}")
    outcomes = []
    counts = {"base": 0, "ordering": 0, "yamlScalars": 0, "yamlCharacters": 0, "yamlSourceContext": 0, "yamlProfileEdges": 0, "yamlBreakContext": 0, "yamlDirectives": 0, "yamlDirectiveTail": 0, "nelCorrection": 0}
    for receipt, oracle_id, oracle in matching:
        for case in oracle["cases"]:
            expected = case["predecessor"]
            actual: dict[str, Any]
            try:
                if case["operation"] == "read":
                    result = read_json_value(text(case["sourceCodepoints"]), case["format"])
                else:
                    source = from_tagged(case["input"])
                    serialized = write_json_value(source, case["format"])
                    result = read_json_value(serialized, case["format"])
                actual = {"status": "value", "value": tagged(result)}
            except (TypeError, ValueError, OverflowError, UnicodeError) as error:
                actual = {"status": "error", "type": type(error).__name__, "message": str(error)}

            if expected["status"] == "value" and case["operation"] == "write":
                wanted = expected["readBack"]
            elif expected["status"] == "value":
                wanted = expected["value"]
            else:
                wanted = None
            profile = receipt["profile"]
            category = (
                "ordering" if "ordering" in profile or case["id"].startswith(("write-order-", "read-source-order-"))
                else "yamlScalars" if "scalar" in profile
                else "yamlCharacters" if "character" in profile
                else "yamlSourceContext" if "source-context" in profile
                else "yamlProfileEdges" if "profile-edges" in profile
                else "yamlBreakContext" if "break-context" in profile
                else "yamlDirectiveTail" if "directive-tail" in profile
                else "yamlDirectives" if "directive" in profile
                else "base"
            )
            correction_applied = False
            if (
                category == "yamlCharacters"
                and case["id"] == selector.get("caseId")
                and oracle_id in selector.get("observedProfiles", [])
            ):
                if case_canonical_hash(case) != selector.get("caseCanonicalSha256"):
                    raise RuntimeError("The approved NEL correction case hash does not match")
                if case.get("input") != selector.get("input") or expected != selector.get("predecessorResult"):
                    raise RuntimeError("The approved NEL correction baseline no longer matches its selected case")
                wanted = correction.get("target", {}).get("readBack")
                correction_applied = True
            passed = (actual["status"] == expected["status"] and
                      (expected["status"] != "value" or actual.get("value") == wanted))
            counts[category] += 1
            counts["nelCorrection"] += int(correction_applied)
            outcomes.append({
                "oracle": oracle_id,
                "id": case["id"],
                "category": category,
                "approvedCorrection": correction_applied,
                "passed": passed,
                "expected": wanted if expected["status"] == "value" else {"status": "error"},
                "actual": actual,
            })
    mismatches = [item for item in outcomes if not item["passed"]]
    result = {
        "profile": "umf.r2.python-serialization-conformance/1",
        "python": sys.version,
        "pythonMinor": python_minor,
        "oracleCount": len(matching),
        **counts,
        "cases": len(outcomes),
        "passed": len(outcomes) - len(mismatches),
        "failed": len(mismatches),
        "mismatches": mismatches[:10],
    }
    print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
    return 1 if mismatches else 0


if __name__ == "__main__":
    raise SystemExit(main())

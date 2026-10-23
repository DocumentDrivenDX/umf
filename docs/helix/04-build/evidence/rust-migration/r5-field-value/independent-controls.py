#!/usr/bin/env python3
"""Independent stdlib Fraction and Unicode-scalar controls for R5 literals."""
import json
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).parent
frozen = json.loads((ROOT / "frozen-typescript.json").read_text())
actual = {row["id"]: row["result"] for row in json.loads((ROOT / "rust-actual-results.json").read_text()) if "result" in row}

checks = {
    "integer-accepted": Fraction("2e0") in {Fraction("1"), Fraction("2")},
    "integer-refused": Fraction("3") in {Fraction("1"), Fraction("2")},
    "decimal-exact": Fraction("999999999999999999.99") == Fraction(99999999999999999999, 100),
    "unicode-scalar-length": len("😀😀😀") == 3,
    "binary-case-insensitive": bytes.fromhex("FF") == bytes.fromhex("ff"),
}
for case_id, expected in checks.items():
    assert actual[case_id]["valid"] is expected, (case_id, actual[case_id], expected)

result = {"oracle": "Python 3 stdlib Fraction and Unicode code-point/bytes behavior", "checks": checks, "allPassed": True}
(ROOT / "independent-controls.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result))

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Source-built Python binding replay of complete Cardinality receipts."""
import json
from pathlib import Path

from umf import rust_avro_cardinality as api

here = Path(__file__).resolve().parent
predecessor = json.loads((here / "typescript-predecessor.json").read_text())
extra = json.loads((here / "typescript-extra.json").read_text())
base = predecessor["outcomes"]["empty-array/present-non-null-schema/strict"]

actual = api.classify(base["source"], base["request"])
assert actual == base["result"]
assert api.verify(actual, actual["target"]) == actual
assert api.recover(actual, actual["target"]) == base["recovered"]

changed_ids = [
    "duplicate-named", "verify-duplicate-named", "recover-duplicate-named",
    "fixed-unsafe-token", "verify-fixed-unsafe-token", "recover-fixed-unsafe-token",
    "fixed-exponent", "verify-fixed-exponent", "recover-fixed-exponent",
]
cases = {row["id"]: row for row in extra["cases"]}
for case_id in changed_ids:
    row = cases[case_id]
    args = row["args"]
    if row["op"] == "classifyAvroCardinality":
        observed = api.classify(args["source"], args["request"])
    elif row["op"] == "verifyAvroCardinalityClassification":
        observed = api.verify(args["receipt"], args["current"])
    else:
        observed = api.recover(args["receipt"], args["current"])
    assert observed == row["result"], case_id

print(json.dumps({"python": True, "cases": 3 + len(changed_ids), "classify": True, "verify": True, "recover": True}))

with (here / "typescript-type-order-utf16.json").open() as stream:
    adversarial = json.load(stream)
for case in adversarial["cases"]:
    args = case["args"]
    value = api.classify(args["source"], args["request"])
    assert value == case["result"], case["id"]
    assert api.verify(value, value["target"]) == value, case["id"]
    assert api.recover(value, value["target"]) == {"schema": args["request"]["nativeSource"], "dependencies": args["request"]["dependencies"]}, case["id"]
print(json.dumps({"adversarialOutcomes":len(adversarial["cases"])*3}))

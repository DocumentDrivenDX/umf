# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent graph/filter oracle for complete Rust selection envelopes."""
import json
import os
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
fixture = json.load(open(os.path.join(ROOT, "fixtures/validation/core-selection.json"), encoding="utf-8"))
env = dict(os.environ)
env["CARGO_TARGET_DIR"] = "/private/tmp/umf-r5-selection-target"
run = subprocess.run(
    ["cargo", "run", "--quiet", "-p", "umf-core", "--example", "r5_selection_output"],
    cwd=ROOT,
    env=env,
    check=True,
    text=True,
    capture_output=True,
)
actual = json.loads(run.stdout)


def graph_oracle(source, query):
    entries = []
    by_id = {}
    for mi, module in enumerate(source["modules"]):
        for ei, element in enumerate(module["elements"]):
            ident = (module["id"], element["id"])
            entry = {
                "module": module["id"],
                "namespace": module["namespace"],
                "path": f"/modules/{mi}/elements/{ei}",
                "element": element,
                "identity": ident,
            }
            entries.append(entry)
            by_id[ident] = entry

    categories = ("modules", "namespaces", "names", "scalarTypes", "cardinalities")
    initial = []
    for entry in entries:
        element = entry["element"]
        values = (entry["module"], entry["namespace"], element.get("name"),
                  element.get("scalarType"), element.get("cardinality"))
        if not all(category not in query or value in query[category]
                   for category, value in zip(categories, values)):
            continue
        identity = {"module": entry["identity"][0], "element": entry["identity"][1]}
        if "identities" in query and identity not in query["identities"]:
            continue
        initial.append(entry["identity"])

    included = set(initial)
    pending = list(initial)
    if query["references"] == "transitive":
        while pending:
            current = pending.pop(0)
            element = by_id[current]["element"]
            outgoing = list(element.get("references", []))
            outgoing += [element["itemType"]] if "itemType" in element else []
            outgoing += element.get("members", [])
            outgoing += [reference for key in element.get("keys", [])
                         for reference in key.get("fields", [])]
            for reference in outgoing:
                target = (reference["module"], reference["element"])
                if target not in included:
                    included.add(target)
                    pending.append(target)

    selection = [
        {key: entry[key] for key in ("module", "namespace", "path", "element")}
        | {"includedBy": "match" if entry["identity"] in initial else "reference"}
        for entry in entries if entry["identity"] in included
    ]
    boundaries = {name: [] for name in ("boundaryReferences", "boundaryItemTypes",
                                        "boundaryMembers", "boundaryKeyFields")}
    for entry in entries:
        ident = entry["identity"]
        if ident not in included:
            continue
        element = entry["element"]
        base = entry["path"]

        def outside(reference):
            target = (reference["module"], reference["element"])
            return target not in included, by_id[target]["path"]

        for reference in element.get("references", []):
            absent, target_path = outside(reference)
            if absent:
                boundaries["boundaryReferences"].append({
                    "from": {"module": ident[0], "element": ident[1]},
                    "reference": reference, "targetPath": target_path,
                })
        if "itemType" in element:
            reference = element["itemType"]
            absent, target_path = outside(reference)
            if absent:
                boundaries["boundaryItemTypes"].append({
                    "from": {"module": ident[0], "element": ident[1]},
                    "reference": reference, "path": base + "/itemType",
                    "targetPath": target_path,
                })
        for index, reference in enumerate(element.get("members", [])):
            absent, target_path = outside(reference)
            if absent:
                boundaries["boundaryMembers"].append({
                    "from": {"module": ident[0], "element": ident[1]},
                    "reference": reference, "path": f"{base}/members/{index}",
                    "targetPath": target_path,
                })
        for ki, key in enumerate(element.get("keys", [])):
            for fi, reference in enumerate(key.get("fields", [])):
                absent, target_path = outside(reference)
                if absent:
                    boundaries["boundaryKeyFields"].append({
                        "from": {"module": ident[0], "element": ident[1]},
                        "key": key["id"], "reference": reference,
                        "path": f"{base}/keys/{ki}/fields/{fi}",
                        "targetPath": target_path,
                    })

    return selection, boundaries


for name, query_key in (("result", "query"), ("closure", "closureQuery")):
    want_selection, want_boundaries = graph_oracle(fixture["source"], fixture[query_key])
    got = actual[name]
    assert got["selection"] == want_selection, name
    for boundary, expected in want_boundaries.items():
        assert got[boundary] == expected, (name, boundary)

for name, query_key in (("graphBoundaries", "graphBoundedQuery"),
                        ("graphTraversal", "graphTraversalQuery"),
                        ("cardinalityResult", "cardinalityQuery")):
    want_selection, want_boundaries = graph_oracle(actual["graphSource"], actual[query_key])
    got = actual[name]
    assert got["selection"] == want_selection, name
    for boundary, expected in want_boundaries.items():
        assert got[boundary] == expected, (name, boundary)
print(json.dumps({"oracle": "independent-python-graph", "outputs": 5, "matched": True}))

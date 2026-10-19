# SPDX-License-Identifier: MIT OR Apache-2.0
"""One pinned fixture-authoring derivation; not a runtime legacy-format adapter.

Read only the exact reviewed Praxis catalog and seed. Emit a newly authored
current-0.10 declaration using consumer-owned handlers, not executable recipes.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path


SOURCE_COMMIT = "0d7a11d0faf48ecff744e4e89f34f753050c5cb6"
SOURCE_PATH = "config/hohfeld/catalog/catalog.umf.json"
SEED_PATH = "config/hohfeld/catalog/seed.json"
SOURCE_SHA256 = "6b59abf445829667ee1ae9d66f2402064ba613edc26bde026467c041b947f507"
SEED_SHA256 = "bf6147c3967d818686d12e49d102404a0b0bb24da8e88a312657142fd2509230"


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def wire(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def derive(source_bytes: bytes, seed_bytes: bytes) -> tuple[dict, dict]:
    assert sha(source_bytes) == SOURCE_SHA256, "Pinned fixture source changed"
    assert sha(seed_bytes) == SEED_SHA256, "Pinned seed data changed"
    source = json.loads(source_bytes)
    assert source["id"] == "praxis-catalog" and len(source["modules"]) == 1
    model = copy.deepcopy(source)
    model["umf"] = "0.10.0"
    model["vocabularies"]["umf.actions"] = {"version": "0.1.0"}
    module = model["modules"][0]
    mid = module["id"]
    original_actions = module.pop("actions")
    assert len(original_actions) == 20
    elements = {e["id"]: e for e in module["elements"]}
    records = {k: e for k, e in elements.items() if e["kind"] == "record"}
    relationships = {r["name"]: r for r in module["relationships"]}
    action_maps = []
    current_actions = []

    def record_ref(name: str) -> dict:
        assert name in records
        return {"module": mid, "element": name}

    def key_of(name: str) -> dict:
        keys = records[name]["keys"]
        assert len(keys) == 1 and len(keys[0]["fields"]) == 1
        return {**record_ref(name), "key": keys[0]["id"]}

    def field_ref(name: str, field: str) -> dict:
        ref = {"module": mid, "element": name + "." + field}
        assert ref in records[name]["members"] and ref["element"] in elements
        return ref

    for ordinal, original in enumerate(original_actions):
        original_sha = sha(wire(original).encode())
        params = {p["name"]: p for p in original["inputs"]}
        aliases: dict[str, tuple[str, str]] = {}
        contexts: dict[str, dict] = {}
        for p in original["inputs"]:
            if p["type"]["kind"] == "ref":
                assert p["cardinality"] == "one"
                typ = p["type"]["type"]
                contexts["input." + p["name"]] = {
                    "type": typ,
                    "selector": {"entity": p["name"]},
                    "parameters": [p["name"]],
                    "binding": {"parameter": p["name"]},
                }
        for i, effect in enumerate(original["effects"]):
            if effect["op"] == "create":
                assert set(effect["key"]) == {"input"}
                typ = effect["type"]
                ctx = "created." + str(i)
                contexts[ctx] = {
                    "type": typ,
                    "selector": {"key": key_of(typ)["key"], "components": [{"input": effect["key"]["input"]}]},
                    "parameters": [effect["key"]["input"]],
                    "binding": {"created": "effect." + str(i)},
                }
                if "as" in effect:
                    aliases[effect["as"]] = (ctx, typ)

        def entity_context(expr: dict) -> str:
            if set(expr) == {"input"}:
                ctx = "input." + expr["input"]
            else:
                assert set(expr) == {"alias"}
                ctx = aliases[expr["alias"]][0]
            assert ctx in contexts
            return ctx

        scalar_targets: dict[str, dict] = {}
        normalized_effects = []
        write_specs: dict[str, dict] = {}
        for i, effect in enumerate(original["effects"]):
            op = effect["op"]
            assert op in {"create", "update", "delete", "link"}
            ctx = "created." + str(i) if op == "create" else entity_context(effect["key"] if op in {"update", "delete"} else effect["source"])
            typ = contexts[ctx]["type"]
            spec = write_specs.setdefault(ctx, {"fields": [], "relationships": [], "create": False, "delete": False})
            normalized = {"id": "effect." + str(i), "kind": {"update": "set"}.get(op, op)}
            if op in {"create", "update"}:
                assignments = copy.deepcopy(effect["properties"])
                if op == "create":
                    key_field = records[typ]["keys"][0]["fields"][0]["element"].rsplit(".", 1)[1]
                    assignments = {key_field: effect["key"], **assignments}
                    normalized.update(record=record_ref(typ), key=key_of(typ)["key"])
                    spec["create"] = True
                else:
                    normalized["entity"] = contexts[ctx]["binding"]
                values = []
                for name, expression in assignments.items():
                    assert set(expression) == {"input"}
                    pid = expression["input"]
                    ref = field_ref(typ, name)
                    previous = scalar_targets.setdefault(pid, ref)
                    assert previous == ref, (original["id"], pid)
                    if ref not in spec["fields"]:
                        spec["fields"].append(ref)
                    values.append({"field": ref, "value": {"parameter": pid}})
                normalized["values"] = values
                assert not effect.get("unset")
            elif op == "delete":
                normalized["entity"] = contexts[ctx]["binding"]
                spec["delete"] = True
            else:
                relationship = relationships[effect["type"]]
                rel_ref = {"module": mid, "relationship": relationship["id"]}
                assert record_ref(typ) in relationship["source"]
                target = contexts[entity_context(effect["target"])]
                assert any(r["element"] == target["type"] for r in relationship["target"])
                if rel_ref not in spec["relationships"]:
                    spec["relationships"].append(rel_ref)
                normalized.update(relationship=rel_ref, source=contexts[ctx]["binding"], target=target["binding"])
            normalized_effects.append(normalized)

        parameters = []
        for p in original["inputs"]:
            pid, kind = p["name"], p["type"]["kind"]
            if kind == "ref":
                parameters.append({"id": pid, "kind": "entity", "target": key_of(p["type"]["type"]), "required": True})
            else:
                assert kind == "scalar" and p["cardinality"] in {"one", "optional"}
                ref = scalar_targets[pid]
                assert elements[ref["element"]]["scalarType"] == p["type"]["name"]
                parameters.append({"id": pid, "kind": "value", "field": ref, "required": p["cardinality"] == "one"})

        def frame(ctx: str, fid: str, spec: dict | None = None) -> dict:
            context = contexts[ctx]
            return {"id": fid, "record": record_ref(context["type"]),
                    "selector": {"language": "umf.actions.keys", "version": "1", "expression": wire(context["selector"]), "references": [{"parameter": p} for p in context["parameters"]]},
                    "maxEntities": 1, **(spec or {"fields": [], "relationships": [], "create": False, "delete": False})}

        reads = {}
        preconditions = []
        for condition in original["preconditions"]:
            pred = condition["predicate"]
            assert pred["op"] in {"absent", "exists"}
            if pred["op"] == "exists":
                ctx = entity_context(pred["ref"])
            else:
                matches = [c for c, v in contexts.items() if v["type"] == pred["type"] and v["selector"].get("components") == [{"input": pred["key"]["input"]}]]
                assert len(matches) == 1
                ctx = matches[0]
            fid = "read." + ctx
            reads.setdefault(ctx, frame(ctx, fid))
            expression = {"exists": {"state": "pre", "frame": fid}}
            if pred["op"] == "absent":
                expression = {"op": "not", "args": [expression]}
            failure = {"code": condition["id"], "message": condition["reason"]}
            preconditions.append({"id": condition["id"], "rule": {"language": "umf.actions.rules", "version": "1", "expression": wire(expression), "references": [{"record": record_ref(contexts[ctx]["type"])}]}, "failure": failure})
        writes = [frame(ctx, "write." + ctx, spec) for ctx, spec in write_specs.items()]
        action = {
            "id": original["id"], "name": original["id"], "description": original["description"],
            "parameters": parameters, "outputs": [], "preconditions": preconditions,
            "postconditions": [], "reads": list(reads.values()), "writes": writes,
            "failures": [{**p["failure"], "retryable": False} for p in preconditions],
            "binding": {"kind": "handler", "profile": {"id": "praxis.hohfeld.catalog", "version": "0.4.5"}, "handler": {"id": mid + "." + original["id"], "version": "sha256:" + original_sha}},
            "authorization": {"kind": "policy", "profile": {"id": "hohfeld.authority", "version": "0.4.5"}, "resources": [f["id"] for f in writes]},
            "attribution": {"subject": "person-required"}, "atomicity": "single-store",
            "idempotency": "caller-key-optional", "result": {"identities": "created-and-changed", "version": "store-opaque", "receipt": "read-at-least"},
            "x-praxis-handler-contract": {
                "interpretation": "retained external handler contract; not a graph-write recipe or executor qualification",
                "sourceActionSha256": original_sha,
                "effectOrder": normalized_effects,
                "optionalValueAssignments": "omitted or explicit null input produces no assignment; it never unsets a property",
                "originalDeclaration": copy.deepcopy(original),
            },
        }
        current_actions.append(action)
        action_maps.append({"sourcePointer": "/modules/0/actions/" + str(ordinal), "targetPointer": "/modules/0/extensions/umf.actions/actions/" + str(ordinal), "id": original["id"], "sourceActionSha256": original_sha, "parameterIds": list(params), "preconditionIds": [p["id"] for p in original["preconditions"]], "effectKinds": [e["op"] for e in original["effects"]], "currentEffectKinds": [e["kind"] for e in normalized_effects]})
    module["extensions"]["umf.actions"] = {"actions": current_actions}
    seed = json.loads(seed_bytes)
    assert all(s["action"].split(".", 1)[1] in {a["id"] for a in original_actions} for s in seed)
    provenance = {
        "status": "fixture/design preparation; not native or production Praxis integration qualification",
        "sourceRepository": "https://synaptiq.ghe.com/Skadden/praxis-harness.git",
        "sourceCommit": SOURCE_COMMIT,
        "originalCatalog": {"path": SOURCE_PATH, "sha256": sha(source_bytes), "bytes": len(source_bytes), "umf": source["umf"]},
        "seed": {"path": SEED_PATH, "sha256": sha(seed_bytes), "bytes": len(seed_bytes), "steps": len(seed), "derivation": "unchanged UTF-8 bytes; ordinary data/action invocations, not a source-format adapter"},
        "target": {"path": "tests/unified/praxis/catalog.json", "umf": "0.10.0", "actions": len(current_actions), "records": len(records), "relationships": len(module["relationships"])},
        "derivation": ["New authored current010 fixture; not the original capture", "All original elements, relationships, DDD and presentation metadata retained structurally", "Only source envelope, actions vocabulary and action declaration location/form changed", "All 20 source action identities/typed inputs/preconditions/ordered effects retained", "Handler identities and authority profile are inert consumer-owned metadata, not executable code or authenticated grants", "No legacy source syntax is admitted by the runtime; original declarations remain provenance inside unchecked handler metadata"],
        "actionMappings": action_maps,
        "actionHashEncoding": "SHA-256 of parsed original action serialized as compact UTF-8 JSON with ensure_ascii=False and original member order; not a hash of a raw source-text substring",
    }
    return model, provenance


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--praxis", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source_bytes = (args.praxis / SOURCE_PATH).read_bytes()
    seed_bytes = (args.praxis / SEED_PATH).read_bytes()
    model, provenance = derive(source_bytes, seed_bytes)
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    catalog = (json.dumps(model, ensure_ascii=False, indent=2) + "\n").encode()
    provenance["target"].update(sha256=sha(catalog), bytes=len(catalog))
    (output / "catalog.json").write_bytes(catalog)
    (output / "seed.json").write_bytes(seed_bytes)
    (output / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")

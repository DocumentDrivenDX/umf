"""Validate proposed saga structures; this is not a UMF semantic implementation."""
import copy
import hashlib
import importlib.metadata
import json
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[5]
HERE = Path(__file__).resolve().parent
SCHEMAS = ROOT / "docs/helix/02-design/contracts/schemas"
PATHS = [ROOT / "spec/extensions/actions/schema.json",
         ROOT / "spec/extensions/actions/tx-results.schema.json",
         SCHEMAS / "saga-0.1.0.schema.json", SCHEMAS / "saga-runtime-1.schema.json"]


def main():
    schemas = [json.loads(p.read_text()) for p in PATHS]
    for schema in schemas:
        Draft202012Validator.check_schema(schema)
    registry = Registry().with_resources(
        (s["$id"], Resource.from_contents(s)) for s in schemas)
    declaration = Draft202012Validator(schemas[2], registry=registry)
    protocol = Draft202012Validator(schemas[3], registry=registry)
    actions = Draft202012Validator(schemas[0], registry=registry)
    source = json.loads((HERE / "allocation.json").read_text())
    module = source["modules"][0]
    payload = module["extensions"]["umf.actions.saga"]
    submit = json.loads((HERE / "submit.json").read_text())
    cases = []

    def check(name, validator, value, expected=True):
        errors = list(validator.iter_errors(value))
        valid = not errors
        assert valid == expected, (name, [e.message for e in errors])
        cases.append(dict(name=name, valid=valid, expectedValid=expected))

    check("fabricated_local_actions", actions, module["extensions"]["umf.actions"])
    check("fabricated_saga_declaration", declaration, payload)
    check("submit_request", protocol, submit)
    missing = copy.deepcopy(payload)
    del missing["sagas"][0]["steps"][0]["compensation"]
    check("missing_disposition_is_malformed", declaration, missing, False)
    both = copy.deepcopy(payload)
    both["sagas"][0]["steps"][0]["inputs"][0]["from"].update(step="reserve", output="reservation")
    check("two_source_discriminators_refuse", declaration, both, False)
    unknown = copy.deepcopy(payload)
    unknown["sagas"][0]["steps"][0]["compensation"] = {"kind": "future-recovery", "native": {"x": [1, 2]}}
    check("unknown_recovery_shape_retained_not_qualified", declaration, unknown)
    extra = copy.deepcopy(payload)
    extra["vendor.native"] = {"meaning": "retain"}
    check("unknown_attachment_member_retained_not_qualified", declaration, extra)
    overflow = copy.deepcopy(payload)
    overflow["sagas"][0]["steps"] *= 17
    check("step_count_limit", declaration, overflow, False)
    override = copy.deepcopy(submit)
    override["principal"] = "document-cannot-authorize"
    check("runtime_principal_override_refuses", protocol, override, False)
    unknown_op = copy.deepcopy(submit)
    unknown_op["operation"] = "resume"
    check("unselected_resume_refuses", protocol, unknown_op, False)
    instance = {"namespace": "tenant_safe", "id": "instance_1"}
    state = dict(status="state", instance=instance, definition=submit["target"],
                 phase="queued", cancelRequested=False, forward=[], compensations=[], pending=[])
    result = lambda name: Draft202012Validator(
        {"$ref": schemas[3]["$id"] + "#/$defs/" + name}, registry=registry)
    check("protected_state_structure", result("statusResult"), state)
    success = {**state, "phase": "succeeded"}
    check("success_requires_outputs", result("statusResult"), success, False)
    success["outputs"] = {}
    check("success_with_outputs_structure", result("statusResult"), success)
    outcome = dict(status="outcome", instance=instance,
                   invocation={"step": "allocate", "direction": "forward"},
                   result={"status": "rejected", "code": "CAPACITY"})
    check("original_business_rejection_structure", result("executeResult"), outcome)
    outcome["result"] = {"status": "indeterminate"}
    check("uncertainty_is_not_a_terminal_business_outcome", result("outcome"), outcome, False)
    bad_namespace = dict(protocol="umf.actions.saga/1", operation="status",
                         instance={"namespace": "bad\n", "id": "instance_1"})
    check("namespace_encoding_is_strict", protocol, bad_namespace, False)
    report = dict(jsonschemaVersion=importlib.metadata.version("jsonschema"),
                  results=cases,
                  sources={str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                           for p in [*PATHS, HERE / "allocation.json", HERE / "submit.json", Path(__file__).resolve()]},
                  limits=["Structural shapes only; full core/Field/Key compatibility and availability are not checked",
                          "Unknown retained shapes are not qualified or eligible",
                          "No runtime, browser, provider, authorization or execution evidence is established"])
    target = ROOT / "docs/helix/02-design/experiments/saga/evidence/schema-results.json"
    target.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(dict(structuralCasesPassed=len(cases), report=str(target.relative_to(ROOT)))))


if __name__ == "__main__":
    main()

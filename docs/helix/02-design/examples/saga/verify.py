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
    close = dict(protocol="umf.actions.saga/1", operation="close", instance=instance,
                 expectedHistorySequence=7,
                 disposition=dict(kind="accepted-residual-effects", reason="Reviewed residual allocation", evidence="review_7"))
    check("settled_close_request_shape", protocol, close)
    missing_evidence = copy.deepcopy(close)
    del missing_evidence["disposition"]["evidence"]
    check("close_requires_evidence_reference", protocol, missing_evidence, False)
    cause = {"kind": "failure", "step": "allocate", "code": "TRANSIENT_ABORT"}
    closed = {**state, "phase": "closed", "stopCause": cause, "disposition": close["disposition"]}
    check("closed_disposition_structure", result("statusResult"), closed)
    pending_closed = {**closed, "pending": [{"step": "allocate", "direction": "forward"}]}
    check("closed_cannot_retain_pending", result("statusResult"), pending_closed, False)
    without_disposition = {**state, "phase": "closed", "stopCause": cause}
    check("closed_requires_disposition", result("statusResult"), without_disposition, False)
    compensated = {**state, "phase": "compensated", "stopCause": {"kind": "failure", "code": "TRANSIENT_ABORT"}}
    check("empty_prefix_compensated_shape_retains_failure", result("statusResult"), compensated)
    del compensated["stopCause"]
    check("unwind_requires_original_cause", result("statusResult"), compensated, False)
    check("closure_control_recovery_shape", result("recover-controlResult"),
          dict(status="recovered", operation="close", result=closed))
    # Regression: closed-event guards must not replace outcome-event guards.
    event = dict(sequence=1, kind="outcome", actor="worker_1",
                 invocation={"step": "allocate", "direction": "forward"},
                 result={"status": "rejected", "code": "CAPACITY"})
    check("complete_original_outcome_event", result("event"), event)
    for fields in [("invocation",), ("result",), ("invocation", "result")]:
        malformed = copy.deepcopy(event)
        for field in fields:
            del malformed[field]
        check("outcome_event_requires_" + "_and_".join(fields), result("event"), malformed, False)
    closed_event = dict(sequence=2, kind="closed", actor="operator_1", stopCause=cause, disposition=close["disposition"])
    check("closed_event_with_disposition", result("event"), closed_event)
    missing_event_cause = copy.deepcopy(closed_event)
    del missing_event_cause["stopCause"]
    check("closed_event_retains_original_cause", result("event"), missing_event_cause, False)
    del closed_event["disposition"]
    check("closed_event_requires_disposition", result("event"), closed_event, False)
    missing_cause = copy.deepcopy(closed)
    del missing_cause["stopCause"]
    check("closed_requires_original_stop_cause", result("statusResult"), missing_cause, False)
    intervention = {**state, "phase": "intervention-required", "stopCause": cause}
    check("intervention_preserves_failure_cause", result("statusResult"), intervention)
    del intervention["stopCause"]
    check("intervention_requires_stop_cause", result("statusResult"), intervention, False)
    intervention["stopCause"] = {"kind": "intervention", "code": "SAGA_LIMIT"}
    check("budget_intervention_has_coordination_cause", result("statusResult"), intervention)
    del intervention["stopCause"]["code"]
    check("coordination_stop_requires_code", result("statusResult"), intervention, False)
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

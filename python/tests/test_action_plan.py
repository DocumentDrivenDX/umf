# SPDX-License-Identifier: MIT OR Apache-2.0
import hashlib
import json
from pathlib import Path

from umf import (
    ActionPlanSession,
    Diagnostic,
    Extension,
    Registry,
    inspect_action_plan,
    prepare_action_plan_model,
)

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "docs/helix/03-test/fixtures/bulk-update/model.json"
ACTIONS = ROOT / "spec/extensions/actions/package.json"


def artifact(value):
    source = value if isinstance(value, str) else json.dumps(value, separators=(",", ":"))
    return {"mediaType": "application/json", "utf8": source,
            "sha256": hashlib.sha256(source.encode()).hexdigest()}


def setup():
    document = json.loads(FIXTURE.read_text())
    document["vocabularies"]["test.audit"] = {"version": "1.0.0"}
    document["modules"][0].setdefault("extensions", {})["test.audit"] = {"checked": True}
    model = artifact(document)
    model_pin = {"documentId": document["id"], "revision": "python1",
                 "umfVersion": "0.10.0", "sha256": model["sha256"]}
    action_pin = {"identity": {"module": "sales", "action": "set-active"},
                  "documentSha256": model["sha256"],
                  "invocation": {"id": "umf.actions.tx", "version": "1"}}
    semantics_calls = []
    registry = Registry()
    registry.register_package(json.loads(ACTIONS.read_text()), lambda payload, context: [])
    registry.register(Extension(
        "test.audit", "1.0.0", ("module",), {"type": "object"},
        lambda payload, context: semantics_calls.append(context["path"]) or [],
    ))
    dependency = {"module": "sales", "element": "last-seen"}
    plan = {
        "protocol": "umf.actions.plan/1", "model": model_pin, "action": action_pin,
        "source": artifact({"sql": "UPDATE Customer SET active=FALSE WHERE last_seen<100"}),
        "selection": {"profile": {"id": "test.selection", "version": "1"},
                      "artifact": artifact({"field": dependency, "value": {"integerToken": "100"}}),
                      "dependencies": [dependency]},
        "target": {"module": "sales", "element": "customer", "key": "pk"},
        "inputs": {"entityParameter": "customer", "assignments": [{
            "input": "active-value", "field": {"module": "sales", "element": "active"},
            "value": {"boolean": False}}]},
        "execution": {"selection": "frozen", "atomicity": "batch", "conflict": "stop",
                      "partition": "manifest-order", "batchSize": 2},
        "limits": {"maxItems": 10000, "maxManifestBytes": 16777216},
    }
    context = {
        "registry": registry,
        "models": [{"pin": model_pin, "artifact": model}],
        "actions": [{"pin": action_pin, "artifact": model}],
        "selections": [{
            "profile": {"id": "test.selection", "version": "1"},
            "inspect": lambda selected_artifact, original, target: {
                "eligible": True, "dependencies": [dependency], "diagnostics": []}}],
    }
    return ActionPlanSession(), context, model_pin, action_pin, plan, semantics_calls


def test_public_action_plan_uses_registry_selection_and_rust_session():
    session, context, model_pin, action_pin, plan, semantics_calls = setup()
    prepared = prepare_action_plan_model(session, model_pin, action_pin,
                                         context["models"], context["actions"], context["registry"])
    assert json.loads(prepared["utf8"])["frames"] == ["customer-write"]
    report = inspect_action_plan(session, artifact(plan), context["models"],
                                 context["actions"], context["selections"], context["registry"])
    assert report["eligible"] is True
    assert report["plan"]["selection"]["dependencies"] == [{"module": "sales", "element": "last-seen"}]
    assert semantics_calls == [
        "/modules/0/extensions/test.audit",
        "/modules/0/extensions/test.audit",
    ]


def test_public_action_plan_returns_blocked_report_for_dependency_mismatch():
    session, context, _, _, plan, _ = setup()
    plan["selection"]["dependencies"] = [{"module": "sales", "element": "active"}]
    report = inspect_action_plan(session, artifact(plan), context["models"],
                                 context["actions"], context["selections"], context["registry"])
    assert report["eligible"] is False
    assert report["diagnostics"]
    assert any(diagnostic["code"] == "PAP_ACTION" for diagnostic in report["diagnostics"])


def test_python_registry_clone_metadata_keeps_registered_kinds():
    cases = json.loads((ROOT / "fixtures/extension-kinds/conformance.json").read_text())
    item = cases[0]["registrations"][0]
    registry = Registry()
    registry.register_package(item["manifest"], kinds=True)
    extension, manifest, kinds = registry.registrations()[0]
    assert extension.id == item["manifest"]["id"]
    assert manifest == item["manifest"]
    assert kinds is True


def test_public_action_plan_honors_custom_action_package_refusal():
    session, context, _, _, plan, _ = setup()
    calls = []

    def refuse(payload, callback_context):
        calls.append(callback_context["path"])
        return [Diagnostic("CALLER_ACTION_REFUSAL", callback_context["path"],
                           "caller-specific Action constraint refused the payload")]

    registry = Registry()
    registry.register_package(json.loads(ACTIONS.read_text()), refuse)
    context["registry"] = registry

    report = inspect_action_plan(session, artifact(plan), context["models"],
                                 context["actions"], context["selections"], registry)

    assert report["eligible"] is False
    assert any(item["code"] == "CALLER_ACTION_REFUSAL"
               for item in report["diagnostics"])
    assert calls == ["/modules/0/extensions/umf.actions"]

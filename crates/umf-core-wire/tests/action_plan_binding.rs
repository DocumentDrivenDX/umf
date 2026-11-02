// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::{json, Value as Json};
use sha2::{Digest, Sha256};
use umf_core::{Context, Utf16, Value};
use umf_core_wire::action_plan_binding::{execute_wire_with_session, Session, PROFILE};

fn object(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn text(value: &str) -> Value {
    Value::string_utf8(value)
}
fn field<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
        .unwrap_or_else(|| panic!("missing {name}: {value:?}"))
}
fn has_field(value: &Value, name: &str) -> bool {
    let Value::Object(fields) = value else {
        return false;
    };
    fields.iter().any(|(key, _)| key == &Utf16::from(name))
}
fn index(value: &Value, index: usize) -> &Value {
    let Value::Array(items) = value else {
        panic!("expected array")
    };
    &items[index]
}
fn token(value: &Value) -> Value {
    field(value, "token").clone()
}
fn call(
    session: &mut Session,
    op: &str,
    fields: impl IntoIterator<Item = (&'static str, Value)>,
) -> Result<Value, Json> {
    let mut request = vec![
        (Utf16::from("profile"), text(PROFILE)),
        (Utf16::from("op"), text(op)),
    ];
    request.extend(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value)),
    );
    let wire = umf_core_wire::encode(&Value::Object(request), &mut Context::ordinary()).unwrap();
    let envelope: Json =
        serde_json::from_str(&execute_wire_with_session(session, &wire, &mut |_| Ok(()))).unwrap();
    if envelope["status"] != "ok" {
        return Err(envelope);
    }
    Ok(
        umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary())
            .unwrap(),
    )
}
fn sha256(source: &str) -> String {
    format!("{:x}", Sha256::digest(source.as_bytes()))
}
fn artifact(source: &str) -> Value {
    object([
        ("mediaType", text("application/json")),
        ("utf8", text(source)),
        ("sha256", text(&sha256(source))),
    ])
}
fn test_inputs() -> (Value, Value, Value, Value) {
    let source = include_str!("../../../docs/helix/03-test/fixtures/bulk-update/model.json");
    plan_inputs_from_source(source)
}
fn ddd_inputs() -> (Value, Value, Value, Value) {
    let mut document: Json = serde_json::from_str(include_str!(
        "../../../docs/helix/03-test/fixtures/bulk-update/model.json"
    ))
    .unwrap();
    document["vocabularies"]["umf.ddd"] = json!({"version":"0.1.0"});
    document["modules"][0]["extensions"]["umf.ddd"] = json!({"kind":"bounded-context","terms":[]});
    document["modules"][0]["elements"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "id":"order-service",
            "name":"OrderService",
            "kind":"field",
            "scalarType":"string",
            "cardinality":"one",
            "nullability":"required",
            "extensions":{"umf.ddd":{"kind":"domain-service","operations":[{"name":"setActive"}]}}
        }));
    document["modules"][0]["extensions"]["umf.actions"]["actions"][0]["dddOperation"] =
        json!({"module":"sales","element":"order-service","operation":"setActive"});
    let source = serde_json::to_string(&document).unwrap();
    plan_inputs_from_source(&source)
}
fn plan_inputs_from_source(source: &str) -> (Value, Value, Value, Value) {
    let model_digest = sha256(source);
    let model_pin = object([
        ("documentId", text("bulk-update-owner-fixture")),
        ("revision", text("fixture1")),
        ("umfVersion", text("0.10.0")),
        ("sha256", text(&model_digest)),
    ]);
    let action_pin = object([
        (
            "identity",
            object([("module", text("sales")), ("action", text("set-active"))]),
        ),
        ("documentSha256", text(&model_digest)),
        (
            "invocation",
            object([("id", text("umf.actions.tx")), ("version", text("1"))]),
        ),
    ]);
    let models = Value::Array(vec![object([
        ("pin", model_pin.clone()),
        ("artifact", artifact(source)),
    ])]);
    let actions = Value::Array(vec![object([
        ("pin", action_pin.clone()),
        ("artifact", artifact(source)),
    ])]);
    let dependency = object([("module", text("sales")), ("element", text("last-seen"))]);
    let plan_json = json!({
        "protocol": "umf.actions.plan/1",
        "model": {"documentId":"bulk-update-owner-fixture","revision":"fixture1","umfVersion":"0.10.0","sha256":model_digest},
        "action": {"identity":{"module":"sales","action":"set-active"},"documentSha256":model_digest,"invocation":{"id":"umf.actions.tx","version":"1"}},
        "source": {"mediaType":"application/json","utf8":"{\"sql\":\"UPDATE Customer SET active=FALSE WHERE last_seen<100\"}","sha256":sha256("{\"sql\":\"UPDATE Customer SET active=FALSE WHERE last_seen<100\"}")},
        "selection": {"profile":{"id":"test.selection","version":"1"},"artifact":artifact_json("{\"field\":\"last-seen\",\"value\":{\"integerToken\":\"100\"}}"),"dependencies":[{"module":"sales","element":"last-seen"}]},
        "target": {"module":"sales","element":"customer","key":"pk"},
        "inputs": {"entityParameter":"customer","assignments":[{"input":"active-value","field":{"module":"sales","element":"active"},"value":{"boolean":false}}]},
        "execution": {"selection":"frozen","atomicity":"batch","conflict":"stop","partition":"manifest-order","batchSize":2},
        "limits": {"maxItems":10000,"maxManifestBytes":16777216}
    });
    let plan_source = serde_json::to_string(&plan_json).unwrap();
    let plan = artifact(&plan_source);
    let selections = Value::Array(vec![object([(
        "profile",
        object([("id", text("test.selection")), ("version", text("1"))]),
    )])]);
    (
        models,
        actions,
        selections,
        object([("plan", plan), ("dependency", dependency)]),
    )
}
fn artifact_json(source: &str) -> Json {
    json!({"mediaType":"application/json","utf8":source,"sha256":sha256(source)})
}

#[test]
fn action_plan_wire_admits_originals_and_completes_registry_and_selection_stages() {
    let mut session = Session::new();
    let (models, actions, selections, bundle) = test_inputs();
    let model_pin = field(index(&models, 0), "pin");
    let action_pin = field(index(&actions, 0), "pin");
    let prepared_model = call(
        &mut session,
        "actions.prepareModel",
        [
            ("modelPin", model_pin.clone()),
            ("actionPin", action_pin.clone()),
            ("models", models.clone()),
            ("actions", actions.clone()),
        ],
    )
    .unwrap();
    let prepared = call(
        &mut session,
        "actions.completeRegistry",
        [
            ("token", token(&prepared_model)),
            (
                "response",
                object([
                    ("source", field(&prepared_model, "document").clone()),
                    ("diagnostics", Value::Array(vec![])),
                    ("actionSemantics", Value::Bool(true)),
                    ("dddSemantics", Value::Bool(false)),
                ]),
            ),
        ],
    )
    .unwrap();
    let prepared_source = match field(&prepared, "utf8") {
        Value::String(source) => source.to_utf8().unwrap(),
        _ => panic!("prepared model UTF-8 source missing"),
    };
    let prepared_body: Json = serde_json::from_str(&prepared_source).unwrap();
    assert_eq!(prepared_body["protocol"], "umf.actions.plan-model/1");
    assert_eq!(prepared_body["entityParameter"], "customer");
    assert_eq!(prepared_body["assignments"][0]["input"], "active-value");
    assert!(prepared_body["producer"]["build"]
        .as_str()
        .is_some_and(|build| build.starts_with("sha256:") && build.len() == 71));

    let inspect_stage = call(
        &mut session,
        "actions.prepareInspect",
        [
            ("artifact", field(&bundle, "plan").clone()),
            ("models", models),
            ("actions", actions),
            ("selections", selections),
        ],
    )
    .unwrap();
    let select_stage = call(
        &mut session,
        "actions.completeRegistry",
        [
            ("token", token(&inspect_stage)),
            (
                "response",
                object([
                    ("source", field(&inspect_stage, "document").clone()),
                    ("diagnostics", Value::Array(vec![])),
                    ("actionSemantics", Value::Bool(true)),
                    ("dddSemantics", Value::Bool(false)),
                ]),
            ),
        ],
    )
    .unwrap();
    let inspected = call(
        &mut session,
        "actions.completeSelection",
        [
            ("token", token(&select_stage)),
            (
                "response",
                object([
                    ("eligible", Value::Bool(true)),
                    (
                        "dependencies",
                        Value::Array(vec![field(&bundle, "dependency").clone()]),
                    ),
                    ("diagnostics", Value::Array(vec![])),
                ]),
            ),
        ],
    )
    .unwrap();
    assert_eq!(field(&inspected, "eligible"), &Value::Bool(true));
}

#[test]
fn action_plan_wire_reports_blocked_inspection_after_artifact_admission() {
    let mut session = Session::new();
    let (models, actions, selections, _) = test_inputs();
    let malformed = artifact("{not-json");
    let report = call(
        &mut session,
        "actions.prepareInspect",
        [
            ("artifact", malformed.clone()),
            ("models", models),
            ("actions", actions),
            ("selections", selections),
        ],
    )
    .unwrap();
    assert_eq!(field(&report, "plan"), &Value::Null);
    assert_eq!(field(&report, "source"), &malformed);
    assert_eq!(field(&report, "eligible"), &Value::Bool(false));
    assert!(matches!(field(&report, "diagnostics"), Value::Array(items) if items.len() == 1));
    assert!(!has_field(&report, "stage"));

    let mut assessment_session = Session::new();
    let (models, actions, selections, _) = test_inputs();
    let assessment = call(
        &mut assessment_session,
        "actions.prepareAssess",
        [
            ("inspection", object([])),
            ("capabilities", object([])),
            ("models", models),
            ("actions", actions),
            ("selections", selections),
        ],
    )
    .unwrap();
    assert_eq!(field(&assessment, "compatible"), &Value::Bool(false));
    assert_eq!(field(&assessment, "executionVerified"), &Value::Bool(false));
    assert!(matches!(field(&assessment, "diagnostics"), Value::Array(items) if items.len() == 1));
    assert!(!has_field(&assessment, "stage"));
}

#[test]
fn action_plan_wire_blocks_selection_dependency_that_differs_from_plan() {
    let mut session = Session::new();
    let (models, actions, selections, bundle) = test_inputs();
    let inspect_stage = call(
        &mut session,
        "actions.prepareInspect",
        [
            ("artifact", field(&bundle, "plan").clone()),
            ("models", models),
            ("actions", actions),
            ("selections", selections),
        ],
    )
    .unwrap();
    let select_stage = call(
        &mut session,
        "actions.completeRegistry",
        [
            ("token", token(&inspect_stage)),
            (
                "response",
                object([
                    ("source", field(&inspect_stage, "document").clone()),
                    ("diagnostics", Value::Array(vec![])),
                    ("actionSemantics", Value::Bool(true)),
                    ("dddSemantics", Value::Bool(false)),
                ]),
            ),
        ],
    )
    .unwrap();
    let blocked = call(
        &mut session,
        "actions.completeSelection",
        [
            ("token", token(&select_stage)),
            (
                "response",
                object([
                    ("eligible", Value::Bool(true)),
                    ("dependencies", Value::Array(vec![])),
                    ("diagnostics", Value::Array(vec![])),
                ]),
            ),
        ],
    )
    .unwrap();
    assert_eq!(field(&blocked, "eligible"), &Value::Bool(false));
    assert!(matches!(field(&blocked, "diagnostics"), Value::Array(items) if !items.is_empty()));
}

#[test]
fn action_plan_wire_refuses_registry_errors_before_requesting_selection() {
    let mut session = Session::new();
    let (models, actions, selections, bundle) = test_inputs();
    let inspect_stage = call(
        &mut session,
        "actions.prepareInspect",
        [
            ("artifact", field(&bundle, "plan").clone()),
            ("models", models),
            ("actions", actions),
            ("selections", selections),
        ],
    )
    .unwrap();
    let refused = call(
        &mut session,
        "actions.completeRegistry",
        [
            ("token", token(&inspect_stage)),
            (
                "response",
                object([
                    ("source", field(&inspect_stage, "document").clone()),
                    (
                        "diagnostics",
                        Value::Array(vec![object([
                            ("code", text("TEST_REGISTRY_REJECT")),
                            ("path", text("/modules/0")),
                            ("message", text("blocked by installed Registry")),
                            ("severity", text("error")),
                        ])]),
                    ),
                    ("actionSemantics", Value::Bool(true)),
                    ("dddSemantics", Value::Bool(false)),
                ]),
            ),
        ],
    )
    .unwrap();
    assert_eq!(field(&refused, "eligible"), &Value::Bool(false));
    assert!(matches!(field(&refused, "diagnostics"), Value::Array(items) if !items.is_empty()));
    assert!(!has_field(&refused, "stage"));
}

#[test]
fn action_plan_wire_requires_and_honors_an_explicit_ddd_semantics_registration() {
    let (models, actions, selections, bundle) = ddd_inputs();
    let mut session = Session::new();
    let inspect_stage = call(
        &mut session,
        "actions.prepareInspect",
        [
            ("artifact", field(&bundle, "plan").clone()),
            ("models", models.clone()),
            ("actions", actions.clone()),
            ("selections", selections.clone()),
        ],
    )
    .unwrap();
    let select_stage = call(
        &mut session,
        "actions.completeRegistry",
        [
            ("token", token(&inspect_stage)),
            (
                "response",
                object([
                    ("source", field(&inspect_stage, "document").clone()),
                    ("diagnostics", Value::Array(vec![])),
                    ("actionSemantics", Value::Bool(true)),
                    ("dddSemantics", Value::Bool(true)),
                ]),
            ),
        ],
    )
    .unwrap();
    let eligible = call(
        &mut session,
        "actions.completeSelection",
        [
            ("token", token(&select_stage)),
            (
                "response",
                object([
                    ("eligible", Value::Bool(true)),
                    (
                        "dependencies",
                        Value::Array(vec![field(&bundle, "dependency").clone()]),
                    ),
                    ("diagnostics", Value::Array(vec![])),
                ]),
            ),
        ],
    )
    .unwrap();
    assert_eq!(field(&eligible, "eligible"), &Value::Bool(true));

    let mut refused_session = Session::new();
    let inspect_stage = call(
        &mut refused_session,
        "actions.prepareInspect",
        [
            ("artifact", field(&bundle, "plan").clone()),
            ("models", models),
            ("actions", actions),
            ("selections", selections),
        ],
    )
    .unwrap();
    let refused = call(
        &mut refused_session,
        "actions.completeRegistry",
        [
            ("token", token(&inspect_stage)),
            (
                "response",
                object([
                    ("source", field(&inspect_stage, "document").clone()),
                    ("diagnostics", Value::Array(vec![])),
                    ("actionSemantics", Value::Bool(true)),
                    ("dddSemantics", Value::Bool(false)),
                ]),
            ),
        ],
    )
    .unwrap();
    assert_eq!(field(&refused, "eligible"), &Value::Bool(false));
}

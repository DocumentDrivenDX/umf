#![cfg(feature = "embedded-adapters")]
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{
    decode,
    delta_log_binding::{execute_json, PROFILE},
    encode,
};

fn text(v: &str) -> Value {
    Value::String(Utf16::from(v))
}
fn object(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
}
fn request(op: &str, fields: Vec<(&str, Value)>) -> String {
    let mut v = vec![("profile", text(PROFILE)), ("op", text(op))];
    v.extend(fields);
    encode(&object(v), &mut Context::ordinary()).unwrap()
}
fn result(response: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(response).unwrap();
    assert_eq!(v["status"], "ok", "{response}");
    v["wire"].as_str().unwrap().to_owned()
}
fn json(v: &Value) -> serde_json::Value {
    match v {
        Value::Null => serde_json::Value::Null,
        Value::Bool(b) => serde_json::json!(b),
        Value::Number(n) if n.fract() == 0.0 => serde_json::json!(*n as i64),
        Value::Number(n) => serde_json::json!(n),
        Value::String(s) => serde_json::json!(s.to_utf8().unwrap()),
        Value::Array(a) => serde_json::Value::Array(a.iter().map(json).collect()),
        Value::Object(o) => serde_json::Value::Object(
            o.iter()
                .map(|(k, v)| (k.to_utf8().unwrap(), json(v)))
                .collect(),
        ),
    }
}

#[test]
fn action_inspection_matches_frozen_typescript_diagnostics_and_retains_sources() {
    let packet:serde_json::Value=serde_json::from_str(include_str!("../../../tests/rust-core/fixtures/r8-delta-spark-hash/delta-actions-predecessor.json")).unwrap();
    for case in packet["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let source = case["text"].as_str().unwrap();
        let imported = decode(
            &result(&execute_json(&request(
                "delta/log.capture",
                vec![("source", text(source)), ("id", text(id))],
            ))),
            &mut Context::ordinary(),
        )
        .unwrap();
        let inspected = decode(
            &result(&execute_json(&request(
                "delta/log.inspectActions",
                vec![("document", imported.clone())],
            ))),
            &mut Context::ordinary(),
        )
        .unwrap();
        let actual = json(&inspected);
        let expected = serde_json::json!({"parsedAll":case["parsedAll"],"complete":case["complete"],"knownShapesValid":case["knownShapesValid"],"lines":case["lines"],"diagnostics":case["diagnostics"]});
        assert_eq!(
            serde_json::json!({"parsedAll":actual["parsedAll"],"complete":actual["complete"],"knownShapesValid":actual["knownShapesValid"],"lines":actual["lines"],"diagnostics":actual["diagnostics"]}),
            expected,
            "{}",
            id
        );
        let exported = decode(
            &result(&execute_json(&request(
                "delta/log.export",
                vec![("document", imported)],
            ))),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(exported, text(source));
    }
}

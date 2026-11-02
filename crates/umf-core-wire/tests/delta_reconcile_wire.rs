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
fn result(s: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(s).unwrap();
    assert_eq!(v["status"], "ok", "{s}");
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
fn reconciliation_matches_frozen_typescript_reports_and_preserves_sources() {
    let packet:serde_json::Value=serde_json::from_str(include_str!("../../../tests/rust-core/fixtures/r8-delta-spark-hash/delta-reconcile-predecessor.json")).unwrap();
    for case in packet["cases"].as_array().unwrap() {
        let mut commits = Vec::new();
        for c in case["commits"].as_array().unwrap() {
            let version = c["version"].as_str().unwrap();
            let source = c["text"].as_str().unwrap();
            let doc = decode(
                &result(&execute_json(&request(
                    "delta/log.capture",
                    vec![("id", text(version)), ("source", text(source))],
                ))),
                &mut Context::ordinary(),
            )
            .unwrap();
            commits.push(object(vec![("version", text(version)), ("source", doc)]));
        }
        let got = decode(
            &result(&execute_json(&request(
                "delta/log.reconcileCommits",
                vec![("commits", Value::Array(commits))],
            ))),
            &mut Context::ordinary(),
        )
        .unwrap();
        if case["id"] == "malformed-utf16-txn-identity" {
            let actual = json(&got);
            assert_eq!(actual["status"], "blocked");
            assert_eq!(actual["diagnostics"][0]["code"], "DELTA_HISTORY_UTF16");
            assert_eq!(actual["sources"], case["result"]["sources"]);
            assert!(actual.get("state").is_none());
            assert_eq!(
                case["result"]["state"]["transactions"][0]["appIdCodeUnits"],
                serde_json::json!([0xd800])
            );
            continue;
        }
        assert_eq!(
            json(&got),
            case["result"],
            "{}",
            case["id"].as_str().unwrap()
        );
    }
}

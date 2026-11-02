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
fn reconciles_explicit_jsonl_sidecars_and_refuses_missing_sidecar_atomically() {
    let packet: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/delta/sidecars/results.json"
    ))
    .unwrap();
    let expected = &packet["results"][0];
    let fields = |sidecars: serde_json::Value| {
        vec![
            ("checkpoint", from_json(&expected["checkpoint"])),
            ("commits", from_json(&expected["sources"])),
            ("sidecars", from_json(&sidecars)),
        ]
    };
    let recovered = json(
        &decode(
            &result(&execute_json(&request(
                "delta/log.reconcileCheckpointSidecars",
                fields(expected["sidecars"].clone()),
            ))),
            &mut Context::ordinary(),
        )
        .unwrap(),
    );
    assert_eq!(
        recovered["status"], "reconciled",
        "{:?}",
        recovered["diagnostics"]
    );
    assert_eq!(recovered["state"]["version"], "10");
    assert_eq!(recovered["origins"].as_array().unwrap().len(), 8);

    let blocked = json(
        &decode(
            &result(&execute_json(&request(
                "delta/log.reconcileCheckpointSidecars",
                fields(serde_json::json!([])),
            ))),
            &mut Context::ordinary(),
        )
        .unwrap(),
    );
    assert_eq!(blocked["status"], "blocked");
    assert!(blocked.get("state").is_none());
    assert!(blocked["diagnostics"].as_array().unwrap().iter().any(|d| {
        d["message"]
            .as_str()
            .is_some_and(|message| message.contains("No explicitly supplied sidecar"))
    }));
}

fn from_json(v: &serde_json::Value) -> Value {
    match v {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(value) => Value::Bool(*value),
        serde_json::Value::Number(value) => Value::Number(value.as_f64().unwrap()),
        serde_json::Value::String(value) => text(value),
        serde_json::Value::Array(values) => Value::Array(values.iter().map(from_json).collect()),
        serde_json::Value::Object(values) => object(
            values
                .iter()
                .map(|(key, value)| (key.as_str(), from_json(value)))
                .collect(),
        ),
    }
}

#[test]
fn captures_exports_and_inspects_utf16_jsonl_source_without_normalizing_it() {
    let source="😀\r\n\t \n{\"txn\":{\"appId\":\"x\",\"version\":9223372036854775807}}\n{\"future\":{\"n\":1e400}}\nnot json\n{\"add\":{},\"remove\":{}}\n{\"metaData\":null}";
    let imported = decode(
        &result(&execute_json(&request(
            "delta/log.capture",
            vec![("source", text(source)), ("id", text("log"))],
        ))),
        &mut Context::ordinary(),
    )
    .unwrap();
    let exported = decode(
        &result(&execute_json(&request(
            "delta/log.export",
            vec![("document", imported.clone())],
        ))),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(exported, text(source));
    let inspected = decode(
        &result(&execute_json(&request(
            "delta/log.inspect",
            vec![("document", imported)],
        ))),
        &mut Context::ordinary(),
    )
    .unwrap();
    let v = json(&inspected);
    assert_eq!(v["parsedAll"], false);
    assert_eq!(v["lines"][1]["start"].as_f64(), Some(4.0));
    assert_eq!(v["lines"][1]["terminator"], "\n");
    assert_eq!(
        v["lines"][2]["node"]["members"]["txn"]["members"]["version"]["value"],
        "9223372036854775807"
    );
    assert_eq!(v["lines"][3]["action"], "future");
    assert_eq!(
        v["lines"][3]["node"]["members"]["future"]["members"]["n"]["value"],
        "1e400"
    );
}

#[test]
fn inspection_matches_the_frozen_typescript_predecessor_cases() {
    let packet: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/rust-core/fixtures/r8-delta-spark-hash/delta-log-predecessor.json"
    ))
    .unwrap();
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
        let actual = json(
            &decode(
                &result(&execute_json(&request(
                    "delta/log.inspect",
                    vec![("document", imported)],
                ))),
                &mut Context::ordinary(),
            )
            .unwrap(),
        );
        let expected = serde_json::json!({"parsedAll":case["parsedAll"],"complete":case["complete"],"lines":case["lines"],"diagnostics":case["diagnostics"]});
        assert_eq!(
            serde_json::json!({"parsedAll":actual["parsedAll"],"complete":actual["complete"],"lines":actual["lines"],"diagnostics":actual["diagnostics"]}),
            expected,
            "{}",
            id
        );
    }
}

#[test]
fn duplicate_keys_and_empty_sources_are_diagnostic_and_source_preserving() {
    for (id, source, diagnostic) in [
        (
            "duplicate",
            "{\"txn\":{\"appId\":\"x\",\"app\\u0049d\":\"y\"}}\n",
            "DELTA_LOG_JSON",
        ),
        ("empty", "", "DELTA_LOG_EMPTY"),
    ] {
        let imported = decode(
            &result(&execute_json(&request(
                "delta/log.capture",
                vec![("source", text(source)), ("id", text(id))],
            ))),
            &mut Context::ordinary(),
        )
        .unwrap();
        let report = json(
            &decode(
                &result(&execute_json(&request(
                    "delta/log.inspect",
                    vec![("document", imported.clone())],
                ))),
                &mut Context::ordinary(),
            )
            .unwrap(),
        );
        assert!(report["diagnostics"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["code"] == diagnostic));
        assert_eq!(
            decode(
                &result(&execute_json(&request(
                    "delta/log.export",
                    vec![("document", imported)]
                ))),
                &mut Context::ordinary()
            )
            .unwrap(),
            text(source)
        );
    }
}

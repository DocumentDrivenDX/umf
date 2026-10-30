#![cfg(feature = "embedded-adapters")]
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{
    decode,
    delta_schema_table::{execute_json, PROFILE},
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

fn raw(s: &str) -> serde_json::Value {
    serde_json::from_str(s).unwrap()
}

fn value(v: &Value) -> serde_json::Value {
    match v {
        Value::Null => serde_json::Value::Null,
        Value::Bool(b) => serde_json::json!(b),
        Value::Number(n) if n.fract() == 0.0 => serde_json::json!(*n as i64),
        Value::Number(n) => serde_json::json!(n),
        Value::String(s) => serde_json::json!(s.to_utf8().unwrap()),
        Value::Array(a) => serde_json::Value::Array(a.iter().map(value).collect()),
        Value::Object(o) => serde_json::Value::Object(
            o.iter()
                .map(|(k, v)| (k.to_utf8().unwrap(), value(v)))
                .collect(),
        ),
    }
}

#[test]
fn mapped_rename_matches_frozen_typescript_data_and_refusal_order() {
    let packet: serde_json::Value = serde_json::from_str(include_str!("../../../tests/rust-core/fixtures/r8-delta-spark-hash/delta-rename-predecessor.json")).unwrap();
    for case in packet["cases"].as_array().unwrap() {
        let source = case["text"].as_str().unwrap();
        let id = case["tableId"].as_str().unwrap();
        let imported = raw(&execute_json(&request(
            "delta/table.import",
            vec![("source", text(source)), ("id", text(id))],
        )));
        assert_eq!(imported["status"], "ok", "{imported}");
        let doc = decode(imported["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
        let opts = &case["options"];
        let options = object(vec![
            ("fieldPointer", text(opts["fieldPointer"].as_str().unwrap())),
            ("name", text(opts["name"].as_str().unwrap())),
            (
                "uninterpretedReferences",
                text(opts["uninterpretedReferences"].as_str().unwrap()),
            ),
        ]);
        let response = raw(&execute_json(&request(
            "delta/table.renameMappedField",
            vec![("document", doc), ("options", options)],
        )));
        if let Some(error) = case.get("error") {
            assert_eq!(response["status"], "error", "{}", case["id"]);
            assert_eq!(response["code"], error["code"], "{}", case["id"]);
            assert_eq!(
                response["messageUnits"],
                serde_json::json!(error["message"]
                    .as_str()
                    .unwrap()
                    .encode_utf16()
                    .collect::<Vec<_>>()),
                "{}",
                case["id"]
            );
        } else {
            assert_eq!(response["status"], "ok", "{}: {response}", case["id"]);
            let got = decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
            assert_eq!(value(&got), case["result"], "{}", case["id"]);
        }
    }
}

#[test]
fn malformed_utf16_pointer_segment_is_refused_without_replacement() {
    let packet: serde_json::Value = serde_json::from_str(include_str!("../../../tests/rust-core/fixtures/r8-delta-spark-hash/delta-rename-predecessor.json")).unwrap();
    let case = &packet["cases"][0];
    let imported = raw(&execute_json(&request(
        "delta/table.import",
        vec![
            ("source", text(case["text"].as_str().unwrap())),
            ("id", text(case["tableId"].as_str().unwrap())),
        ],
    )));
    let document = decode(imported["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    let pointer = Utf16::new(vec![
        b'/' as u16,
        b'f' as u16,
        b'i' as u16,
        b'e' as u16,
        b'l' as u16,
        b'd' as u16,
        b's' as u16,
        b'/' as u16,
        0xd800,
    ]);
    let options = object(vec![
        ("fieldPointer", Value::String(pointer)),
        ("name", text("new_name")),
        ("uninterpretedReferences", text("preserve-and-report")),
    ]);
    let response = raw(&execute_json(&request(
        "delta/table.renameMappedField",
        vec![("document", document), ("options", options)],
    )));
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "DELTA_RENAME_PATH");
    assert_eq!(
        response["messageUnits"],
        serde_json::json!("Pointer segment must contain well-formed UTF-16"
            .encode_utf16()
            .collect::<Vec<_>>())
    );
}

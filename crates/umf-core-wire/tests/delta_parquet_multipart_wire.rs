#![cfg(feature = "embedded-adapters")]
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{decode, encode, parquet_capture_binding};

fn text(value: &str) -> Value {
    Value::String(Utf16::from(value))
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn wire(op: &str, fields: Vec<(&str, Value)>) -> String {
    let mut members = vec![
        (
            Utf16::from("profile"),
            text(parquet_capture_binding::PROFILE),
        ),
        (Utf16::from("op"), text(op)),
    ];
    members.extend(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value)),
    );
    encode(&Value::Object(members), &mut Context::ordinary()).unwrap()
}
fn response(wire: &str) -> serde_json::Value {
    serde_json::from_str(&parquet_capture_binding::execute_wire(wire)).unwrap()
}
fn decoded(wire: &str) -> Value {
    let response = response(wire);
    assert_eq!(response["status"], "ok", "{response}");
    decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}
fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}
fn string(value: Option<&Value>) -> Option<String> {
    if let Some(Value::String(value)) = value {
        value.to_utf8().ok()
    } else {
        None
    }
}
fn captured(bytes: &[u8], id: &str) -> Value {
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    decoded(&wire(
        "parquet.capture",
        vec![("bytes", text(&hex)), ("id", text(id))],
    ))
}
fn part(name: &str, source: Value) -> Value {
    object(vec![("name", text(name)), ("source", source)])
}

#[test]
fn multipart_checkpoint_replays_out_of_order_parts_and_restores_version() {
    let first_name = "00000000000000000010.checkpoint.0000000001.0000000002.parquet";
    let second_name = "00000000000000000010.checkpoint.0000000002.0000000002.parquet";
    let first = captured(include_bytes!("../../../fixtures/delta/multipart/00000000000000000010.checkpoint.0000000001.0000000002.parquet"), first_name);
    let second = captured(include_bytes!("../../../fixtures/delta/multipart/00000000000000000010.checkpoint.0000000002.0000000002.parquet"), second_name);
    let report = decoded(&wire(
        "delta.parquet.reconcileMultipart",
        vec![
            ("version", text("10")),
            ("partCount", Value::Number(2.0)),
            (
                "parts",
                Value::Array(vec![part(second_name, second), part(first_name, first)]),
            ),
            ("commits", Value::Array(Vec::new())),
        ],
    ));
    assert_eq!(string(get(&report, "status")), Some("reconciled".into()));
    let recovery = get(&report, "recovery").unwrap();
    assert_eq!(
        string(get(get(recovery, "state").unwrap(), "version")),
        Some("10".into())
    );
    assert!(matches!(get(&report, "parts"), Some(Value::Array(rows)) if rows.len() == 2));
}

#[test]
fn multipart_checkpoint_refuses_duplicate_part_ordinals_without_partial_recovery() {
    let name = "00000000000000000010.checkpoint.0000000001.0000000002.parquet";
    let source = captured(include_bytes!("../../../fixtures/delta/multipart/00000000000000000010.checkpoint.0000000001.0000000002.parquet"), name);
    let report = decoded(&wire(
        "delta.parquet.reconcileMultipart",
        vec![
            ("version", text("10")),
            ("partCount", Value::Number(2.0)),
            (
                "parts",
                Value::Array(vec![part(name, source.clone()), part(name, source)]),
            ),
            ("commits", Value::Array(Vec::new())),
        ],
    ));
    assert_eq!(string(get(&report, "status")), Some("blocked".into()));
    assert!(get(&report, "recovery").is_none());
}

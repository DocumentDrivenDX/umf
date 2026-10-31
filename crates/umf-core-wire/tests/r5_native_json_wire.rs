#![cfg(feature = "embedded-adapters")]
use umf_core::{Context, EngineError, Utf16, Value};
use umf_core_wire::{
    encode, execute_json_schema_wire, execute_json_schema_wire_with_control, JSON_SCHEMA_PROFILE,
};

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
fn request(source: Value) -> String {
    encode(
        &object(vec![
            ("profile", text(JSON_SCHEMA_PROFILE)),
            ("op", text("parseNativeJson")),
            ("source", source),
        ]),
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn envelope(response: &str) -> serde_json::Value {
    serde_json::from_str(response).unwrap()
}
fn message(response: &serde_json::Value) -> String {
    String::from_utf16(
        &response["messageUnits"]
            .as_array()
            .unwrap()
            .iter()
            .map(|unit| unit.as_u64().unwrap() as u16)
            .collect::<Vec<_>>(),
    )
    .unwrap()
}
#[test]
fn native_json_dispatch_refuses_non_string_tagged_source_before_parser() {
    let response = envelope(&execute_json_schema_wire(&request(Value::Object(vec![]))));
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "REQUEST");
    assert_eq!(message(&response), "Native JSON source is required");
}

#[test]
fn native_json_dispatch_honors_control_before_parsing_source() {
    let wire = request(text("[null,null,null]"));
    let mut calls = 0;
    let response = execute_json_schema_wire_with_control(&wire, &mut |amount| {
        calls += 1;
        assert!(amount > 0);
        Err(EngineError::new(
            "RESOURCE_LIMIT",
            Utf16::default(),
            "Host work budget exceeded",
        ))
    });
    let response = envelope(&response);
    assert!(calls > 0);
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "RESOURCE_LIMIT");
    assert_eq!(message(&response), "Host work budget exceeded");
}

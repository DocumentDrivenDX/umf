// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{Context, EngineError, Utf16, Value};
use umf_core_wire::{
    encode, read_typescript_json_value_wire, read_typescript_json_value_wire_with_control,
    read_value_wire, read_value_wire_with_control, write_typescript_json_value_wire,
    write_typescript_json_value_wire_with_control, write_value_wire,
};

fn source_wire(source: &str) -> String {
    encode(
        &Value::String(Utf16::from(source)),
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn response(text: &str) -> Json {
    serde_json::from_str(text).unwrap()
}

fn message(value: &Json) -> String {
    String::from_utf16(
        &value["messageUnits"]
            .as_array()
            .unwrap()
            .iter()
            .map(|unit| unit.as_u64().unwrap() as u16)
            .collect::<Vec<_>>(),
    )
    .unwrap()
}

fn decoded_string(value: &Json) -> String {
    let wire = value["wire"].as_str().unwrap();
    let Value::String(text) = umf_core_wire::decode(wire, &mut Context::ordinary()).unwrap() else {
        panic!("expected tagged string");
    };
    String::from_utf16(text.units()).unwrap()
}

#[test]
fn generic_reader_supports_json_and_yaml_but_keeps_rust_error_taxonomy() {
    let yaml = response(&read_value_wire(
        &source_wire("name: example\nitems:\n  - true\n  - 1.25\n"),
        "yaml",
    ));
    assert_eq!(yaml["status"], "ok");

    let json = response(&read_value_wire(
        &source_wire("{\"name\":\"example\",\"items\":[true,1.25]}"),
        "json",
    ));
    assert_eq!(json["status"], "ok");

    let alias = response(&read_value_wire(&source_wire("x: &a 1\ny: *a\n"), "yaml"));
    assert_eq!(alias["status"], "error");
    assert_eq!(alias["code"], "YAML_ALIAS");
    assert_eq!(message(&alias), "YAML aliases are not allowed");
}

#[test]
fn generic_writer_supports_yaml_and_json_formats() {
    let value = Value::Object(vec![
        (Utf16::from("name"), Value::string_utf8("example")),
        (
            Utf16::from("items"),
            Value::Array(vec![Value::Bool(true), Value::Number(1.25)]),
        ),
    ]);
    let wire = encode(&value, &mut Context::ordinary()).unwrap();
    let yaml = response(&write_value_wire(&wire, "yaml"));
    assert_eq!(yaml["status"], "ok");
    assert_eq!(
        decoded_string(&yaml),
        "\"name\": \"example\"\n\"items\":\n  - true\n  - 1.25\n"
    );
    let json = response(&write_value_wire(&wire, "json"));
    assert_eq!(json["status"], "ok");
    assert!(decoded_string(&json).starts_with("{\n  \"name\""));
}

#[test]
fn reader_honors_host_control_before_returning_a_value() {
    let wire = source_wire("name: example\n");
    let mut calls = 0;
    let result = response(&read_value_wire_with_control(
        &wire,
        "yaml",
        &mut |amount| {
            calls += 1;
            assert!(amount > 0);
            Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Host work budget exceeded",
            ))
        },
    ));
    assert!(calls > 0);
    assert_eq!(result["status"], "error");
    assert_eq!(result["code"], "RESOURCE_LIMIT");
    assert_eq!(message(&result), "Host work budget exceeded");
}

#[test]
fn typescript_json_value_profile_is_opt_in_yaml_default_and_admits_format_strictly() {
    let result = response(&read_typescript_json_value_wire(
        &source_wire("name: example\nitems:\n  - true\n"),
        "yaml",
    ));
    assert_eq!(result["status"], "ok");

    let generic = response(&read_value_wire(&source_wire("x: &a 1\ny: *a\n"), "yaml"));
    let profile = response(&read_typescript_json_value_wire(
        &source_wire("x: &a 1\ny: *a\n"),
        "yaml",
    ));
    assert_eq!(generic["code"], "YAML_ALIAS");
    assert_eq!(profile["code"], "ALIAS");

    let invalid = response(&read_typescript_json_value_wire(&source_wire("{}"), "YAML"));
    assert_eq!(invalid["status"], "error");
    assert_eq!(invalid["code"], "FORMAT");

    let syntax_precedence = response(&read_typescript_json_value_wire(
        &source_wire("{\"x\": 1, \"x\": 2,}"),
        "json",
    ));
    assert_eq!(syntax_precedence["code"], "SYNTAX");
}

#[test]
fn typescript_json_value_profile_honors_host_control() {
    let mut calls = 0;
    let result = response(&read_typescript_json_value_wire_with_control(
        &source_wire("name: example\n"),
        "yaml",
        &mut |amount| {
            calls += 1;
            assert!(amount > 0);
            Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Host work budget exceeded",
            ))
        },
    ));
    assert!(calls > 0);
    assert_eq!(result["code"], "RESOURCE_LIMIT");
    assert_eq!(message(&result), "Host work budget exceeded");
}

#[test]
fn typescript_json_value_writer_is_yaml_default_and_keeps_generic_writer_separate() {
    let value = Value::Object(vec![
        (Utf16::from("name"), Value::string_utf8("example")),
        (
            Utf16::from("items"),
            Value::Array(vec![Value::Bool(true), Value::Number(1.25)]),
        ),
    ]);
    let wire = encode(&value, &mut Context::ordinary()).unwrap();
    let yaml = response(&write_typescript_json_value_wire(&wire, "yaml"));
    assert_eq!(yaml["status"], "ok");
    assert_eq!(
        decoded_string(&yaml),
        "name: example\nitems:\n  - true\n  - 1.25\n"
    );

    let json = response(&write_typescript_json_value_wire(&wire, "json"));
    assert_eq!(
        decoded_string(&json),
        "{\n  \"name\": \"example\",\n  \"items\": [\n    true,\n    1.25\n  ]\n}\n"
    );
    let generic = response(&write_value_wire(&wire, "yaml"));
    assert_eq!(
        decoded_string(&generic),
        "\"name\": \"example\"\n\"items\":\n  - true\n  - 1.25\n"
    );

    let invalid = response(&write_typescript_json_value_wire(&wire, "YAML"));
    assert_eq!(invalid["code"], "FORMAT");
}

#[test]
fn typescript_json_value_writer_preserves_refusals_limits_and_host_control() {
    for bits in ["8000000000000000", "7ff0000000000000"] {
        let wire = format!(r#"{{"kind":"number","bits":"{bits}"}}"#);
        let result = response(&write_typescript_json_value_wire(&wire, "json"));
        assert_eq!(result["code"], "NUMBER");
        assert_eq!(
            message(&result),
            "Number outside the core interoperable numeric profile"
        );
    }

    let large = Value::String(Utf16::from("x".repeat(4_000_001)));
    let wire = encode(&large, &mut Context::ordinary()).unwrap();
    let result = response(&write_typescript_json_value_wire(&wire, "json"));
    assert_eq!(result["code"], "LIMIT");
    assert_eq!(message(&result), "Serialized text exceeds limit");

    let small = encode(&Value::string_utf8("x"), &mut Context::ordinary()).unwrap();
    let result = response(&write_typescript_json_value_wire_with_control(
        &small,
        "yaml",
        &mut |_| {
            Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Host work budget exceeded",
            ))
        },
    ));
    assert_eq!(result["code"], "RESOURCE_LIMIT");
    assert_eq!(message(&result), "Host work budget exceeded");
}

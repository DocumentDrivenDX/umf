// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{avro_binding, decode, encode};

fn call_project(document: Value, policy: Vec<(&'static str, Value)>) -> Result<Value, Json> {
    let mut members = vec![
        (
            Utf16::from("profile"),
            Value::string_utf8("umf.avro-json-schema-projection-wire/1"),
        ),
        (
            Utf16::from("op"),
            Value::string_utf8("avro-json-schema-projection.projectAvroToJsonSchema"),
        ),
        (Utf16::from("document"), document),
        (
            Utf16::from("bindings"),
            Value::Object(
                policy
                    .into_iter()
                    .map(|(k, v)| (Utf16::from(k), v))
                    .collect(),
            ),
        ),
    ];
    let wire = encode(
        &Value::Object(std::mem::take(&mut members)),
        &mut Context::ordinary(),
    )
    .unwrap();
    let response: Json = serde_json::from_str(
        &umf_core_wire::avro_json_schema_projection_binding::execute_wire(&wire),
    )
    .unwrap();
    if response["status"] != "ok" {
        return Err(response);
    }
    Ok(decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap())
}

#[test]
fn projects_admitted_avro_record_and_makes_losses_explicit() {
    let request = Value::Object(vec![
        (
            Utf16::from("profile"),
            Value::string_utf8(avro_binding::PROFILE),
        ),
        (Utf16::from("op"), Value::string_utf8("avro.import")),
        (Utf16::from("id"), Value::string_utf8("projection-source")),
        (
            Utf16::from("source"),
            Value::string_utf8(
                r#"{"type":"record","name":"Thing","fields":[{"name":"id","type":"long"},{"name":"tags","type":{"type":"array","items":"string"}}]}"#,
            ),
        ),
    ]);
    let imported_wire = encode(&request, &mut Context::ordinary()).unwrap();
    let imported_response: Json =
        serde_json::from_str(&avro_binding::execute_wire(&imported_wire)).unwrap();
    let document = decode(
        imported_response["wire"].as_str().unwrap(),
        &mut Context::ordinary(),
    )
    .unwrap();
    let result = call_project(
        document,
        vec![
            ("id", Value::string_utf8("json-schema-target")),
            (
                "schemaId",
                Value::string_utf8("https://example.test/avro/thing"),
            ),
            ("long", Value::string_utf8("decimal-string")),
            ("bytes", Value::string_utf8("hex-string")),
            ("union", Value::string_utf8("untagged")),
            ("lossPolicy", Value::string_utf8("allow-reported-loss")),
        ],
    )
    .unwrap();
    assert_eq!(
        field(&result, "status"),
        Some(&Value::string_utf8("projected"))
    );
    assert!(field(&result, "target").is_some());
    assert!(
        matches!(field(&result, "nativeSchema"), Some(Value::String(schema)) if schema.to_utf8().unwrap().contains("$defs"))
    );
    assert!(
        matches!(field(&result, "issues"), Some(Value::Array(items)) if items.iter().any(|item| field(item, "code") == Some(&Value::string_utf8("LONG_ENCODING"))))
    );
}

#[test]
fn strict_projection_and_invalid_binding_are_refused_without_target() {
    let request = Value::Object(vec![
        (
            Utf16::from("profile"),
            Value::string_utf8(avro_binding::PROFILE),
        ),
        (Utf16::from("op"), Value::string_utf8("avro.import")),
        (Utf16::from("id"), Value::string_utf8("strict-source")),
        (
            Utf16::from("source"),
            Value::string_utf8(
                r#"{"type":"record","name":"Thing","fields":[{"name":"id","type":"long"}]}"#,
            ),
        ),
    ]);
    let wire = encode(&request, &mut Context::ordinary()).unwrap();
    let response: Json = serde_json::from_str(&avro_binding::execute_wire(&wire)).unwrap();
    let document = decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    let result = call_project(
        document.clone(),
        vec![
            ("id", Value::string_utf8("strict-target")),
            (
                "schemaId",
                Value::string_utf8("https://example.test/strict"),
            ),
            ("long", Value::string_utf8("decimal-string")),
            ("bytes", Value::string_utf8("hex-string")),
            ("union", Value::string_utf8("untagged")),
            ("lossPolicy", Value::string_utf8("strict")),
        ],
    )
    .unwrap();
    assert_eq!(
        field(&result, "status"),
        Some(&Value::string_utf8("blocked"))
    );
    assert!(field(&result, "target").is_none());
    let invalid = call_project(
        document,
        vec![
            ("id", Value::string_utf8("bad")),
            ("schemaId", Value::string_utf8("relative")),
            ("long", Value::string_utf8("decimal-string")),
            ("bytes", Value::string_utf8("hex-string")),
            ("union", Value::string_utf8("untagged")),
            ("lossPolicy", Value::string_utf8("allow-reported-loss")),
        ],
    )
    .unwrap_err();
    assert_eq!(invalid["code"], "AVRO_BINDINGS");
}

#[test]
fn unresolved_named_dependency_is_a_blocked_projection() {
    let request = Value::Object(vec![
        (
            Utf16::from("profile"),
            Value::string_utf8(avro_binding::PROFILE),
        ),
        (Utf16::from("op"), Value::string_utf8("avro.import")),
        (Utf16::from("id"), Value::string_utf8("unresolved-source")),
        (
            Utf16::from("source"),
            Value::string_utf8(
                r#"{"type":"record","name":"ApplicationEvent","namespace":"model","fields":[{"name":"document","type":"DocumentInfo"}]}"#,
            ),
        ),
    ]);
    let wire = encode(&request, &mut Context::ordinary()).unwrap();
    let response: Json = serde_json::from_str(&avro_binding::execute_wire(&wire)).unwrap();
    let document = decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    let result = call_project(
        document,
        vec![
            ("id", Value::string_utf8("unresolved-target")),
            (
                "schemaId",
                Value::string_utf8("https://example.test/unresolved"),
            ),
            ("long", Value::string_utf8("decimal-string")),
            ("bytes", Value::string_utf8("hex-string")),
            ("union", Value::string_utf8("untagged")),
            ("lossPolicy", Value::string_utf8("allow-reported-loss")),
        ],
    )
    .unwrap();
    assert_eq!(
        field(&result, "status"),
        Some(&Value::string_utf8("blocked"))
    );
    assert!(field(&result, "target").is_none());
    assert!(
        matches!(field(&result, "issues"), Some(Value::Array(items)) if items.iter().any(|item| field(item, "code") == Some(&Value::string_utf8("AVRO_UNSUPPORTED"))))
    );
}

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}

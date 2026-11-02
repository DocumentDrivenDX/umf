// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};

use umf_core_wire::{avro_binding, decode, encode};

fn call(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> Result<Value, Json> {
    let mut values = vec![
        (
            Utf16::from("profile"),
            Value::string_utf8(avro_binding::PROFILE),
        ),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    values.extend(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value)),
    );
    let wire = encode(&Value::Object(values), &mut Context::ordinary()).unwrap();
    let response: Json = serde_json::from_str(&avro_binding::execute_wire(&wire)).unwrap();
    if response["status"] != "ok" {
        return Err(response);
    }
    Ok(decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap())
}

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

#[test]
fn source_import_metadata_edit_export_and_dependency_refusal_are_callable() {
    let imported = call(
        "avro.import",
        [
            ("id", Value::string_utf8("avro-public-flow")),
            ("source", Value::string_utf8(r#"{"type":"record","name":"Person","fields":[{"name":"name","type":"string"}]}"#)),
        ],
    )
    .unwrap();
    let payload = field(
        field(
            field(&imported, "modules")
                .and_then(|value| match value {
                    Value::Array(items) => items.first(),
                    _ => None,
                })
                .unwrap(),
            "elements",
        )
        .and_then(|value| match value {
            Value::Array(items) => items.first(),
            _ => None,
        })
        .unwrap(),
        "extensions",
    )
    .and_then(|value| field(value, "umf.avro"))
    .unwrap();
    let mut extended_payload = payload.clone();
    if let Value::Object(fields) = &mut extended_payload {
        fields.push((
            Utf16::from("futurePayloadField"),
            Value::string_utf8("retained"),
        ));
    }
    let warnings = call("avro.inspectPayload", [("payload", extended_payload)]).unwrap();
    assert!(
        matches!(&warnings, Value::Array(rows) if rows.iter().any(|row| matches!(field(row, "code"), Some(Value::String(code)) if code == &Utf16::from("AVRO_REPRESENTATION"))))
    );
    let fields = call(
        "avro.fields",
        [
            ("root", field(payload, "root").unwrap().clone()),
            (
                "dependencies",
                field(payload, "dependencies")
                    .cloned()
                    .unwrap_or(Value::Array(Vec::new())),
            ),
        ],
    )
    .unwrap();
    assert!(matches!(fields, Value::Array(ref items) if items.len() == 1));

    let edited = call(
        "avro.editNode",
        [
            ("document", imported.clone()),
            ("path", Value::string_utf8("/fields/0/name")),
            ("replacementJson", Value::string_utf8(r#""fullName""#)),
        ],
    )
    .unwrap();
    let exported = call("avro.export", [("document", edited.clone())]).unwrap();
    assert!(
        matches!(exported, Value::String(ref text) if text.to_utf8().unwrap().contains("fullName"))
    );
    assert_ne!(edited, imported);

    let with_dependency = call(
        "avro.import",
        [
            ("id", Value::string_utf8("avro-bundle-flow")),
            (
                "source",
                Value::string_utf8(
                    r#"{"type":"record","name":"Root","fields":[{"name":"child","type":"Child"}]}"#,
                ),
            ),
            (
                "dependencies",
                Value::Array(vec![Value::Object(vec![
                    (Utf16::from("id"), Value::string_utf8("child-schema")),
                    (
                        Utf16::from("schema"),
                        Value::string_utf8(r#"{"type":"record","name":"Child","fields":[]}"#),
                    ),
                ])]),
            ),
        ],
    )
    .unwrap();
    let refused = call("avro.export", [("document", with_dependency.clone())]).unwrap_err();
    assert_eq!(refused["code"], "AVRO_DEPENDENCIES_REQUIRED");
    let bundle = call("avro.exportBundle", [("document", with_dependency)]).unwrap();
    assert!(matches!(field(&bundle, "dependencies"), Some(Value::Array(rows)) if rows.len() == 1));
}

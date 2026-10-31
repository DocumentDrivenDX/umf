#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0

use umf_core::{Context, Utf16, Value};
use umf_core_wire::{decode, encode, execute_arrow_schema_wire, ARROW_SCHEMA_PROFILE};

fn request(op: &str, fields: Vec<(&str, Value)>) -> String {
    let mut members = vec![(Utf16::from("op"), Value::string_utf8(op))];
    members.extend(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value)),
    );
    encode(&Value::Object(members), &mut Context::ordinary()).unwrap()
}

fn string(text: &str) -> Value {
    Value::String(Utf16::from(text))
}

fn execute(op: &str, fields: Vec<(&str, Value)>) -> Result<Value, serde_json::Value> {
    let response: serde_json::Value =
        serde_json::from_str(&execute_arrow_schema_wire(&request(op, fields))).unwrap();
    assert_eq!(response["profile"], "umf.core-wire/1");
    if response["status"] == "error" {
        return Err(response);
    }
    let wire = response["wire"].as_str().unwrap();
    Ok(decode(wire, &mut Context::ordinary()).unwrap())
}

#[test]
fn arrow_schema_wire_exposes_the_five_utf16_tagged_operations() {
    assert_eq!(ARROW_SCHEMA_PROFILE, "umf-r8-arrow-schema/0.1.0");
    let source = r#"{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":1e3}}]}"#;
    let document = execute(
        "arrow.schema.import",
        vec![("source", string(source)), ("id", string("wire-arrow"))],
    )
    .unwrap();
    let validation = execute("arrow.schema.inspect", vec![("document", document.clone())]).unwrap();
    assert!(matches!(validation, Value::Object(_)));
    let exported = execute("arrow.schema.export", vec![("document", document.clone())]).unwrap();
    assert_eq!(exported, string(source));
    let node = execute(
        "arrow.schema.getNode",
        vec![
            ("document", document.clone()),
            ("pointer", string("/fields/0/dictionary/id")),
        ],
    )
    .unwrap();
    assert_eq!(
        node,
        Value::Object(vec![
            (Utf16::from("kind"), string("number")),
            (Utf16::from("value"), string("1e3")),
        ])
    );
    let edited = execute(
        "arrow.schema.proposeNodeEdit",
        vec![
            ("document", document.clone()),
            ("pointer", string("/fields/0/name")),
            ("replacement", string("\"renamed\"")),
        ],
    )
    .unwrap();
    assert!(matches!(edited, Value::Object(_)));
    let original = execute("arrow.schema.export", vec![("document", document)]).unwrap();
    assert_eq!(original, string(source));
}

#[test]
fn arrow_schema_wire_returns_the_typescript_error_code_and_ordered_diagnostics() {
    let invalid = r#"{"fields":[{"name":"x","nullable":true,"type":{"name":"int","bitWidth":7,"isSigned":true}}]}"#;
    let error = execute(
        "arrow.schema.import",
        vec![("source", string(invalid)), ("id", string("invalid"))],
    )
    .unwrap_err();
    assert_eq!(error["code"], "ARROW_DOCUMENT");
    let units = error["messageUnits"]
        .as_array()
        .unwrap()
        .iter()
        .map(|unit| unit.as_u64().unwrap() as u16)
        .collect::<Vec<_>>();
    let message = String::from_utf16(&units).unwrap();
    assert_eq!(
        message,
        include_str!("../../../fixtures/arrow/invalid-integer-width-diagnostics.json")
    );

    let valid_with_warnings = r#"{"fields":[{"name":"x","nullable":true,"futureField":true,"type":{"name":"future_type"},"metadata":[{"key":"k","value":"a"},{"key":"k","value":"b"}]}]}"#;
    let document = execute(
        "arrow.schema.import",
        vec![
            ("source", string(valid_with_warnings)),
            ("id", string("diagnostic-order")),
        ],
    )
    .unwrap();
    let inspected = execute("arrow.schema.inspect", vec![("document", document)]).unwrap();
    let diagnostics = match inspected {
        Value::Object(fields) => match fields
            .into_iter()
            .find(|(key, _)| key == &Utf16::from("diagnostics"))
        {
            Some((_, Value::Array(items))) => items,
            _ => panic!("inspection diagnostics are missing"),
        },
        _ => panic!("inspection result is not an object"),
    };
    let keys = |value: &Value| match value {
        Value::Object(fields) => fields
            .iter()
            .map(|(key, _)| key.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        _ => panic!("diagnostic is not an object"),
    };
    assert_eq!(
        keys(&diagnostics[0]),
        ["code", "path", "severity", "message"]
    );
    assert_eq!(
        keys(&diagnostics[1]),
        ["code", "path", "message", "severity"]
    );
    let unknown = execute("arrow.schema.wat", vec![]).unwrap_err();
    assert_eq!(unknown["code"], "REQUEST");
}

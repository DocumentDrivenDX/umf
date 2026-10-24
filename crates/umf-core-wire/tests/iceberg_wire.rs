#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{Context, EngineError, Utf16, Value};

const SCHEMA: &str = r#"{"type":"struct","schema-id":0,"fields":[{"id":1,"name":"a","type":"long","required":true,"initial-default":9223372036854775807}]}"#;

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value))
            .collect(),
    )
}

fn field<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else { panic!("object expected") };
    &fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .expect("field")
        .1
}

fn execute(fields: Vec<(&str, Value)>) -> Value {
    let response = execute_envelope(fields);
    assert_eq!(response["status"], "ok", "{response}");
    umf_core_wire::decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}

fn execute_envelope(fields: Vec<(&str, Value)>) -> serde_json::Value {
    let request = umf_core_wire::encode(&object(fields), &mut Context::ordinary()).unwrap();
    serde_json::from_str(&umf_core_wire::execute_iceberg_wire(&request)).unwrap()
}

#[test]
fn standalone_iceberg_wire_preserves_exact_tokens_and_copied_edits() {
    let document = execute(vec![
        ("op", Value::string_utf8("iceberg.schema.import")),
        ("source", Value::string_utf8(SCHEMA)),
        ("id", Value::string_utf8("iceberg")),
    ]);
    let inspection = execute(vec![
        ("op", Value::string_utf8("iceberg.schema.inspect")),
        ("document", document.clone()),
    ]);
    assert_eq!(field(&inspection, "valid"), &Value::Bool(true));
    let original = execute(vec![
        ("op", Value::string_utf8("iceberg.schema.export")),
        ("document", document.clone()),
    ]);
    assert_eq!(original, Value::string_utf8(SCHEMA));

    let selected = execute(vec![
        ("op", Value::string_utf8("iceberg.schema.getNode")),
        ("document", document.clone()),
        ("pointer", Value::string_utf8("/fields/0/initial-default")),
    ]);
    assert_eq!(field(&selected, "kind"), &Value::string_utf8("number"));
    assert_eq!(field(&selected, "value"), &Value::string_utf8("9223372036854775807"));

    let edit = execute(vec![
        ("op", Value::string_utf8("iceberg.schema.proposeNodeEdit")),
        ("document", document.clone()),
        ("pointer", Value::string_utf8("/fields/0/name")),
        ("replacement", Value::string_utf8(r#""renamed""#)),
    ]);
    assert_eq!(field(field(&edit, "validation"), "valid"), &Value::Bool(true));
    let renamed = execute(vec![
        ("op", Value::string_utf8("iceberg.schema.export")),
        ("document", field(&edit, "document").clone()),
    ]);
    let Value::String(renamed) = renamed else { panic!("text expected") };
    assert!(renamed.to_utf8().unwrap().contains("\"name\":\"renamed\""));
    assert_eq!(
        execute(vec![
            ("op", Value::string_utf8("iceberg.schema.export")),
            ("document", document),
        ]),
        Value::string_utf8(SCHEMA),
        "editing a copied document must not mutate the original",
    );
}

#[test]
fn iceberg_wire_work_control_covers_request_before_resource_build() {
    let request = umf_core_wire::encode(
        &object(vec![
            ("op", Value::string_utf8("iceberg.schema.import")),
            ("source", Value::string_utf8(SCHEMA)),
            ("id", Value::string_utf8("iceberg")),
        ]),
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut control = |_amount: usize| {
        Err(EngineError::new(
            "RESOURCE_LIMIT",
            Utf16::default(),
            "budget exhausted",
        ))
    };
    let response: serde_json::Value = serde_json::from_str(
        &umf_core_wire::execute_iceberg_wire_with_control(&request, &mut control),
    )
    .unwrap();
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "RESOURCE_LIMIT");
}

#[test]
fn iceberg_wire_import_replays_all_frozen_authored_and_upstream_cases() {
    let baseline: serde_json::Value = serde_json::from_str(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema/baseline.json"
    ))
    .unwrap();
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let authored = baseline["authoredCases"].as_array().unwrap();
    let upstream = baseline["upstreamCases"].as_array().unwrap();
    assert_eq!((authored.len(), upstream.len()), (35, 21));
    for case in authored.iter().chain(upstream) {
        let id = case["id"]
            .as_str()
            .or_else(|| case["source"]["id"].as_str())
            .unwrap();
        let relative = case["path"].as_str().map(str::to_owned).unwrap_or_else(|| {
            format!("fixtures/iceberg/upstream/extracted/{id}.json")
        });
        let source = std::fs::read_to_string(root.join(relative)).unwrap();
        let response = execute_envelope(vec![
            ("op", Value::string_utf8("iceberg.schema.import")),
            ("source", Value::string_utf8(&source)),
            ("id", Value::string_utf8(id)),
        ]);
        let expected_import = &case["operations"]["import"];
        if expected_import["status"] == "error" || case.get("error").is_some() {
            let expected_error = if case.get("error").is_some() {
                &case["error"]
            } else {
                &expected_import["error"]
            };
            assert_eq!(response["status"], "error", "{id}: {response}");
            assert_eq!(response["code"], expected_error["code"], "{id}");
            if let Some(message) = expected_error["message"].as_str() {
                let actual = response["messageUnits"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|unit| unit.as_u64().unwrap() as u16)
                    .collect::<Vec<_>>();
                assert_eq!(String::from_utf16(&actual).unwrap(), message, "{id}");
            }
        } else {
            assert_eq!(response["status"], "ok", "{id}: {response}");
            let document = umf_core_wire::decode(
                response["wire"].as_str().unwrap(),
                &mut Context::ordinary(),
            )
            .unwrap();
            assert_eq!(field(&document, "id"), &Value::string_utf8(id), "{id}");
        }
    }
}

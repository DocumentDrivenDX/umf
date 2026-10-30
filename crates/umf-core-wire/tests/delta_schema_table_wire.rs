#![cfg(feature = "embedded-adapters")]
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{
    decode,
    delta_schema_table::{execute_json, execute_json_with_control, PROFILE},
    encode,
};

fn text(s: &str) -> Value {
    Value::String(Utf16::from(s))
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn request(op: &str, fields: Vec<(&str, Value)>) -> String {
    let mut all = vec![("profile", text(PROFILE)), ("op", text(op))];
    all.extend(fields);
    encode(&object(all), &mut Context::ordinary()).unwrap()
}
fn result(response: &str) -> String {
    let envelope: serde_json::Value = serde_json::from_str(response).unwrap();
    assert_eq!(envelope["profile"], "umf.core-wire/1", "{response}");
    assert_eq!(envelope["status"], "ok", "{response}");
    envelope["wire"].as_str().unwrap().to_owned()
}
fn error(response: &str) -> (String, String) {
    let envelope: serde_json::Value = serde_json::from_str(response).unwrap();
    assert_eq!(envelope["status"], "error", "{response}");
    (
        envelope["code"].as_str().unwrap().to_owned(),
        String::from_utf16(
            &envelope["messageUnits"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_u64().unwrap() as u16)
                .collect::<Vec<_>>(),
        )
        .unwrap(),
    )
}

fn diagnostic_rows(value: &Value) -> Vec<serde_json::Value> {
    let Value::Object(result) = value else {
        panic!("inspection result must be an object")
    };
    let diagnostics = result
        .iter()
        .find(|(key, _)| key == &Utf16::from("diagnostics"))
        .map(|(_, value)| value)
        .unwrap();
    let Value::Array(items) = diagnostics else {
        panic!("diagnostics must be an array")
    };
    items.iter().map(|item| {
        let Value::Object(fields)=item else {panic!("diagnostic must be an object")};
        let text=|name:&str|fields.iter().find(|(key,_)|key==&Utf16::from(name)).and_then(|(_,v)|if let Value::String(s)=v{s.to_utf8().ok()}else{None}).unwrap();
        serde_json::json!({"code":text("code"),"path":text("path"),"message":text("message"),"severity":text("severity")})
    }).collect()
}

#[test]
fn schema_and_table_inspect_wire_match_source_frozen_warning_receipts() {
    let schema_receipt: serde_json::Value = serde_json::from_str(include_str!("../../../tests/rust-core/fixtures/r8-delta-spark-hash/delta-warning-predecessor.json")).unwrap();
    let mut schema_ctx = Context::ordinary();
    let schema_resources =
        umf_core::delta_schema::DeltaSchemaResources::new(&mut schema_ctx).unwrap();
    for case in schema_receipt["cases"].as_array().unwrap() {
        let source = case["source"].as_str().expect("frozen schema input");
        let document = umf_core::delta_schema::import_delta_schema(
            &source.encode_utf16().collect::<Vec<_>>(),
            &Utf16::from("wire-inspect"),
            &schema_resources,
            &mut schema_ctx,
        )
        .unwrap();
        let response = execute_json(&request(
            "delta/schema.inspect",
            vec![("document", document)],
        ));
        let actual = decode(&result(&response), &mut Context::ordinary()).unwrap();
        assert_eq!(
            diagnostic_rows(&actual).as_slice(),
            case["diagnostics"].as_array().unwrap().as_slice(),
            "{}",
            case["id"]
        );
    }

    let table_receipt: serde_json::Value = serde_json::from_str(include_str!("../../../tests/rust-core/fixtures/r8-delta-spark-hash/delta-table-warning-predecessor.json")).unwrap();
    let selected = [
        "embeddedSchemaAndPartitions",
        "mappingPartialState",
        "mappingLexicalVersionTokens",
    ];
    let mut table_ctx = Context::ordinary();
    let table_resources = umf_core::delta_table::DeltaTableResources::new(&mut table_ctx).unwrap();
    for case in table_receipt["cases"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|case| selected.contains(&case["id"].as_str().unwrap()))
    {
        let source = case["source"].as_str().expect("frozen table input");
        let document = umf_core::delta_table::import_delta_table(
            &source.encode_utf16().collect::<Vec<_>>(),
            &Utf16::from("wire-inspect"),
            &table_resources,
            &mut table_ctx,
        )
        .unwrap();
        let response = execute_json(&request(
            "delta/table.inspect",
            vec![("document", document)],
        ));
        let actual = decode(&result(&response), &mut Context::ordinary()).unwrap();
        assert_eq!(
            diagnostic_rows(&actual).as_slice(),
            case["diagnostics"].as_array().unwrap().as_slice(),
            "{}",
            case["id"]
        );
    }
}

#[test]
fn eight_opt_in_operations_roundtrip_preserve_and_return_tagged_results() {
    let schema_source = include_str!("../../../fixtures/delta/nested.json");
    let table_source = r#"{"protocol":{"minReaderVersion":3,"minWriterVersion":7},"metaData":{"id":"t","format":{"provider":"parquet"},"schemaString":"{}","partitionColumns":[],"configuration":{}}}"#;
    for (kind, source) in [("schema", schema_source), ("table", table_source)] {
        let imported = result(&execute_json(&request(
            &format!("delta/{kind}.import"),
            vec![("source", text(source)), ("id", text("wire-test"))],
        )));
        let document = decode(&imported, &mut Context::ordinary()).unwrap();
        let doc_wire = encode(&document, &mut Context::ordinary()).unwrap();
        let doc_value = decode(&doc_wire, &mut Context::ordinary()).unwrap();
        let exported = decode(
            &result(&execute_json(&request(
                &format!("delta/{kind}.export"),
                vec![("document", doc_value.clone())],
            ))),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(exported, text(source));
        let node = result(&execute_json(&request(
            &format!("delta/{kind}.getNode"),
            vec![
                ("document", doc_value.clone()),
                (
                    "pointer",
                    text(if kind == "schema" {
                        "/fields/0/name"
                    } else {
                        "/metaData/id"
                    }),
                ),
            ],
        )));
        assert!(!node.is_empty());
        let pointer = if kind == "schema" {
            "/fields/0/name"
        } else {
            "/metaData/id"
        };
        let replacement = if kind == "schema" {
            r#""renamed""#
        } else {
            r#""renamed""#
        };
        let edit = execute_json(&request(
            &format!("delta/{kind}.proposeNodeEdit"),
            vec![
                ("document", doc_value.clone()),
                ("pointer", text(pointer)),
                ("replacement", text(replacement)),
            ],
        ));
        let edit_wire = result(&edit);
        let edited = decode(&edit_wire, &mut Context::ordinary()).unwrap();
        assert!(matches!(edited, Value::Object(_)));
        let original_after_edit = decode(
            &result(&execute_json(&request(
                &format!("delta/{kind}.export"),
                vec![("document", doc_value)],
            ))),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(original_after_edit, text(source));
    }
}

#[test]
fn frozen_wire_errors_preserve_pointer_before_replacement_and_closed_dispatch() {
    let source = include_str!("../../../fixtures/delta/nested.json");
    let document = decode(
        &result(&execute_json(&request(
            "delta/schema.import",
            vec![("source", text(source)), ("id", text("errors"))],
        ))),
        &mut Context::ordinary(),
    )
    .unwrap();
    let pointer_error = error(&execute_json(&request(
        "delta/schema.proposeNodeEdit",
        vec![
            ("document", document.clone()),
            ("pointer", text("not-a-pointer")),
            ("replacement", text("{")),
        ],
    )));
    assert_eq!(
        pointer_error,
        (
            "JSON_SCHEMA_POINTER".to_owned(),
            "Invalid JSON Pointer".to_owned()
        )
    );
    let replacement_error = error(&execute_json(&request(
        "delta/schema.proposeNodeEdit",
        vec![
            ("document", document),
            ("pointer", text("/fields")),
            ("replacement", text("{")),
        ],
    )));
    assert_eq!(
        replacement_error,
        (
            "JSON_SCHEMA_SYNTAX".to_owned(),
            "Invalid native JSON".to_owned()
        )
    );
    let (code, _) = error(&execute_json(&request("delta/nope.inspect", vec![])));
    assert_eq!(code, "REQUEST");
}

#[test]
fn control_cancellation_is_reported_inside_the_same_wire_envelope() {
    let request = request(
        "delta/schema.import",
        vec![
            (
                "source",
                text(include_str!("../../../fixtures/delta/nested.json")),
            ),
            ("id", text("controlled")),
        ],
    );
    let mut calls = 0;
    let response = execute_json_with_control(&request, &mut |_amount| {
        calls += 1;
        Err(umf_core::EngineError::new(
            "CONTROL_TEST",
            Utf16::from("/host"),
            "stop",
        ))
    });
    assert!(calls > 0);
    assert_eq!(
        error(&response),
        ("CONTROL_TEST".to_owned(), "stop".to_owned())
    );
}

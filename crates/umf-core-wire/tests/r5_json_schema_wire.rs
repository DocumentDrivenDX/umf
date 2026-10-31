#![cfg(feature = "embedded-adapters")]
use umf_core::{Context, EngineError, Utf16, Value};
use umf_core_wire::{
    decode, encode, execute_json_schema_wire, execute_json_schema_wire_with_control,
    execute_prepared_json_schema_wire, JSON_SCHEMA_PROFILE, prepare_json_schema_runtime,
};

fn text(value: &str) -> Value {
    Value::String(Utf16::from(value))
}
fn has_true_member(value: &Value, name: &str) -> bool {
    matches!(value, Value::Object(fields) if fields.iter().any(|(key, value)| key == &Utf16::from(name) && matches!(value, Value::Bool(true))))
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn request(op: &str, fields: Vec<(&str, Value)>) -> String {
    let mut all = vec![("profile", text(JSON_SCHEMA_PROFILE)), ("op", text(op))];
    all.extend(fields);
    encode(&object(all), &mut Context::ordinary()).unwrap()
}
fn result_wire(response: &str) -> String {
    let envelope: serde_json::Value = serde_json::from_str(response).unwrap();
    assert_eq!(envelope["profile"], "umf.core-wire/1");
    assert_eq!(envelope["status"], "ok", "{response}");
    envelope["wire"].as_str().unwrap().to_owned()
}

#[test]
fn json_schema_dispatcher_covers_seven_closed_operations() {
    let imported = execute_json_schema_wire(&request(
        "importJsonSchema",
        vec![
            (
                "source",
                text(r#"{"type":"object","properties":{"x":{"type":"string"}}}"#),
            ),
            ("id", text("urn:umf:r5:wire")),
            ("baseUri", text("https://example.test/schema")),
            ("resources", Value::Array(Vec::new())),
        ],
    ));
    let document = decode(&result_wire(&imported), &mut Context::ordinary()).unwrap();
    let document = encode(&document, &mut Context::ordinary()).unwrap();
    let operations = [
        ("inspectJsonSchema", vec![]),
        ("exportJsonSchema", vec![]),
        ("exportJsonSchemaResources", vec![]),
        ("exportJsonSchemaBundle", vec![]),
        (
            "getJsonSchemaNode",
            vec![("pointer", text("/properties/x"))],
        ),
        ("walkJsonSchema", vec![]),
    ];
    for (op, extra) in operations {
        let document = decode(&document, &mut Context::ordinary()).unwrap();
        let mut fields = vec![("document", document)];
        fields.extend(extra);
        result_wire(&execute_json_schema_wire(&request(op, fields)));
    }

    let valid_document = decode(&document, &mut Context::ordinary()).unwrap();
    let validated = execute_json_schema_wire(&request(
        "validateJsonSchemaDocumentForGet",
        vec![("document", valid_document)],
    ));
    let validated_value = decode(&result_wire(&validated), &mut Context::ordinary()).unwrap();
    assert!(matches!(validated_value, Value::Bool(true)));

    let invalid = execute_json_schema_wire(&request(
        "validateJsonSchemaDocumentForGet",
        vec![("document", object(vec![]))],
    ));
    let envelope: serde_json::Value = serde_json::from_str(&invalid).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "INVALID_DOCUMENT");
}

#[test]
fn prepared_json_schema_runtime_matches_stateless_eight_operation_dispatch() {
    let runtime = prepare_json_schema_runtime().unwrap();
    let imported_request = request(
        "importJsonSchema",
        vec![
            (
                "source",
                text(r#"{"type":"object","properties":{"x":{"type":"string"}}}"#),
            ),
            ("id", text("urn:umf:r5:prepared")),
            ("baseUri", text("https://example.test/prepared")),
            ("resources", Value::Array(Vec::new())),
        ],
    );
    let imported = execute_json_schema_wire(&imported_request);
    assert_eq!(execute_prepared_json_schema_wire(&runtime, &imported_request), imported);
    let document = decode(&result_wire(&imported), &mut Context::ordinary()).unwrap();

    let operations = [
        ("inspectJsonSchema", vec![]),
        ("exportJsonSchema", vec![]),
        ("exportJsonSchemaResources", vec![]),
        ("exportJsonSchemaBundle", vec![]),
        ("getJsonSchemaNode", vec![("pointer", text("/properties/x"))]),
        ("walkJsonSchema", vec![]),
        (
            "editJsonSchemaNode",
            vec![
                ("pointer", text("/properties/x")),
                ("replacement", text(r#"{"type":"integer"}"#)),
            ],
        ),
    ];
    for (op, extra) in operations {
        let mut fields = vec![("document", document.clone())];
        fields.extend(extra);
        let wire = request(op, fields);
        assert_eq!(
            execute_prepared_json_schema_wire(&runtime, &wire),
            execute_json_schema_wire(&wire),
            "operation={op}"
        );
    }
}

#[test]
fn json_schema_dispatcher_rejects_unknown_operation_and_profile() {
    let unknown = execute_json_schema_wire(&request("unknownJsonSchemaOperation", vec![]));
    let envelope: serde_json::Value = serde_json::from_str(&unknown).unwrap();
    assert_eq!(envelope["status"], "error");
    let wrong_profile = encode(
        &object(vec![
            ("profile", text("wrong")),
            ("op", text("walkJsonSchema")),
        ]),
        &mut Context::ordinary(),
    )
    .unwrap();
    let envelope: serde_json::Value =
        serde_json::from_str(&execute_json_schema_wire(&wrong_profile)).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "REQUEST");
}

#[test]
fn json_schema_native_parse_and_node_edit_are_opt_in_wire_operations() {
    let parsed = execute_json_schema_wire(&request(
        "parseNativeJson",
        vec![("source", text(r#"{"n":900719925474099312345,"s":"x"}"#))],
    ));
    let parsed = decode(&result_wire(&parsed), &mut Context::ordinary()).unwrap();
    fn has_text(value: &Value, expected: &str) -> bool {
        match value {
            Value::String(value) => value == &Utf16::from(expected),
            Value::Array(items) => items.iter().any(|item| has_text(item, expected)),
            Value::Object(fields) => fields
                .iter()
                .any(|(key, value)| key == &Utf16::from(expected) || has_text(value, expected)),
            _ => false,
        }
    }
    assert!(has_text(&parsed, "900719925474099312345"));

    let imported = execute_json_schema_wire(&request(
        "importJsonSchema",
        vec![
            (
                "source",
                text(r#"{"type":"object","properties":{"x":{"type":"string"}}}"#),
            ),
            ("id", text("urn:umf:r5:wire-edit")),
            ("baseUri", text("https://example.test/schema")),
            ("resources", Value::Array(Vec::new())),
        ],
    ));
    let document = decode(&result_wire(&imported), &mut Context::ordinary()).unwrap();
    let edited = execute_json_schema_wire(&request(
        "editJsonSchemaNode",
        vec![
            ("document", document),
            ("pointer", text("/properties/x/type")),
            ("replacement", text(r#""integer""#)),
        ],
    ));
    let edited = decode(&result_wire(&edited), &mut Context::ordinary()).unwrap();
    let inspect =
        execute_json_schema_wire(&request("inspectJsonSchema", vec![("document", edited)]));
    result_wire(&inspect);
}

#[test]
fn json_schema_parser_preserves_duplicate_and_structural_limit_precedence() {
    let duplicate = execute_json_schema_wire(&request(
        "parseNativeJson",
        vec![("source", text(r#"{"x":1,"x":2}"#))],
    ));
    let duplicate: serde_json::Value = serde_json::from_str(&duplicate).unwrap();
    assert_eq!(duplicate["status"], "error");
    assert_eq!(duplicate["code"], "JSON_SCHEMA_SYNTAX");
    assert_eq!(
        String::from_utf16(
            &duplicate["messageUnits"]
                .as_array()
                .unwrap()
                .iter()
                .map(|unit| unit.as_u64().unwrap() as u16)
                .collect::<Vec<_>>(),
        )
        .unwrap(),
        "Map keys must be unique at line 1, column 8:\n\n{\"x\":1,\"x\":2}\n       ^\n"
    );

    let depth = 129;
    let source = format!("{}0{}", "[".repeat(depth), "]".repeat(depth));
    let depth_refusal =
        execute_json_schema_wire(&request("parseNativeJson", vec![("source", text(&source))]));
    let depth_refusal: serde_json::Value = serde_json::from_str(&depth_refusal).unwrap();
    assert_eq!(depth_refusal["status"], "error");
    assert_eq!(depth_refusal["code"], "LIMIT");
    assert_eq!(
        String::from_utf16(
            &depth_refusal["messageUnits"]
                .as_array()
                .unwrap()
                .iter()
                .map(|unit| unit.as_u64().unwrap() as u16)
                .collect::<Vec<_>>(),
        )
        .unwrap(),
        "Native JSON structural limit exceeded"
    );
}

#[test]
fn json_schema_qualified_edit_subset_roundtrips_and_preserves_source() {
    let imported = execute_json_schema_wire(&request(
        "importJsonSchema",
        vec![
            (
                "source",
                text(r#"{"type":"object","properties":{"x":{"type":"string"}}}"#),
            ),
            ("id", text("urn:umf:r5:qualified-edit")),
            ("baseUri", text("https://example.test/qualified-edit")),
            ("resources", Value::Array(Vec::new())),
        ],
    ));
    let original = decode(&result_wire(&imported), &mut Context::ordinary()).unwrap();
    let original_wire = encode(&original, &mut Context::ordinary()).unwrap();
    let inspection = execute_json_schema_wire(&request(
        "inspectJsonSchema",
        vec![("document", original.clone())],
    ));
    let inspection: serde_json::Value = serde_json::from_str(&inspection).unwrap();
    let inspection = decode(
        inspection["wire"].as_str().unwrap(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(has_true_member(&inspection, "valid"));
    assert!(has_true_member(&inspection, "complete"));

    let edited = execute_json_schema_wire(&request(
        "editJsonSchemaNode",
        vec![
            ("document", original.clone()),
            ("pointer", text("/properties/x/type")),
            ("replacement", text(r#""integer""#)),
        ],
    ));
    let edited = decode(&result_wire(&edited), &mut Context::ordinary()).unwrap();
    let original_after = encode(&original, &mut Context::ordinary()).unwrap();
    assert_eq!(
        original_after, original_wire,
        "editing must not mutate source"
    );

    let exported = execute_json_schema_wire(&request(
        "exportJsonSchema",
        vec![("document", edited.clone())],
    ));
    let exported: serde_json::Value = serde_json::from_str(&exported).unwrap();
    let exported = decode(exported["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert!(
        matches!(exported, Value::String(source) if source == Utf16::from("{\"type\":\"object\",\"properties\":{\"x\":{\"type\":\"integer\"}}}\n"))
    );

    let after = execute_json_schema_wire(&request("inspectJsonSchema", vec![("document", edited)]));
    let after: serde_json::Value = serde_json::from_str(&after).unwrap();
    let after = decode(after["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert!(has_true_member(&after, "valid"));
    assert!(has_true_member(&after, "complete"));
}

#[test]
fn json_schema_root_scalar_refusal_follows_result_validation() {
    let imported = execute_json_schema_wire(&request(
        "importJsonSchema",
        vec![
            ("source", text(r#"{"type":"object"}"#)),
            ("id", text("urn:umf:r5:root-scalar")),
            ("baseUri", text("https://example.test/schema")),
            ("resources", Value::Array(Vec::new())),
        ],
    ));
    let document = decode(&result_wire(&imported), &mut Context::ordinary()).unwrap();
    let refused = execute_json_schema_wire(&request(
        "editJsonSchemaNode",
        vec![
            ("document", document),
            ("pointer", text("")),
            ("replacement", text("1")),
        ],
    ));
    let refused: serde_json::Value = serde_json::from_str(&refused).unwrap();
    assert_eq!(refused["status"], "error");
    assert_eq!(refused["code"], "INVALID_EDIT");
    let message = String::from_utf16(
        &refused["messageUnits"]
            .as_array()
            .unwrap()
            .iter()
            .map(|unit| unit.as_u64().unwrap() as u16)
            .collect::<Vec<_>>(),
    )
    .unwrap();
    assert_eq!(
        message,
        r#"[{"code":"JSON_SCHEMA_ROOT","path":"/modules/0/elements/0/extensions/umf.json-schema","message":"Resource https://example.test/schema must be object or boolean","severity":"error"}]"#
    );
}

#[test]
fn json_schema_edit_fixed_registry_resources_do_not_consume_request_control_budget() {
    let imported = execute_json_schema_wire(&request(
        "importJsonSchema",
        vec![
            (
                "source",
                text(r#"{"type":"object","properties":{"x":{"type":"string"}}}"#),
            ),
            ("id", text("urn:umf:r5:wire-control")),
            ("baseUri", text("https://example.test/schema")),
            ("resources", Value::Array(Vec::new())),
        ],
    ));
    let document = decode(&result_wire(&imported), &mut Context::ordinary()).unwrap();
    let wire = request(
        "editJsonSchemaNode",
        vec![
            ("document", document),
            ("pointer", text("/properties/x/type")),
            ("replacement", text(r#""integer""#)),
        ],
    );
    let mut charged = 0usize;
    let mut largest_charge = 0usize;
    let response = execute_json_schema_wire_with_control(&wire, &mut |amount| {
        charged = charged.saturating_add(amount);
        largest_charge = largest_charge.max(amount);
        if charged > 7_500_000 {
            return Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Host work budget exceeded",
            ));
        }
        Ok(())
    });
    result_wire(&response);
    assert!(charged > 0);
    // The fixed embedded resource text alone adds 344,535 units before
    // parsing/registry work if it is incorrectly charged to this request.
    assert!(
        charged < 7_500_000,
        "caller work reached {charged}; largest charge {largest_charge}"
    );
}

// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    json_schema_inspect,
    native_json::NativeJsonTree,
    schema::{CompiledSchema, SchemaResources},
    Context, Utf16, Value,
};

fn tree(source: &str) -> NativeJsonTree {
    NativeJsonTree::parse_json(
        &source.encode_utf16().collect::<Vec<_>>(),
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn payload(source: &str) -> umf_core::json_schema_adapter::JsonSchemaPayload {
    umf_core::json_schema_adapter::JsonSchemaPayload {
        dialect: Utf16::from(umf_core::json_schema_adapter::DIALECT_2020_12),
        base_uri: Utf16::from("https://example.test/root"),
        root: tree(source),
        resources: Vec::new(),
        representation_extras: Vec::new(),
    }
}

#[test]
fn inspection_preserves_unknown_dialect_keyword_and_numeric_diagnostics() {
    let mut ctx = Context::ordinary();
    let unknown = json_schema_inspect::inspect_payload(
        &payload(r#"{"x-opaque":true}"#),
        &Utf16::from("/schema"),
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        unknown
            .iter()
            .map(|d| d.code.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        ["JSON_SCHEMA_KEYWORD"]
    );
    assert_eq!(unknown[0].path.to_utf8().unwrap(), "/schema/x-opaque");

    let mut ctx = Context::ordinary();
    let dialect = json_schema_inspect::inspect_payload(
        &payload(r#"{"$schema":"https://example.test/other"}"#),
        &Utf16::from("/schema"),
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        dialect
            .iter()
            .map(|d| d.code.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        ["JSON_SCHEMA_DIALECT"]
    );

    let mut ctx = Context::ordinary();
    let numeric = json_schema_inspect::inspect_payload(
        &payload(r#"{"minimum":9007199254740993}"#),
        &Utf16::from("/schema"),
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        numeric
            .iter()
            .map(|d| d.code.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        ["JSON_SCHEMA_NUMERIC"]
    );

    for unsafe_token in ["0.10000000000000000001", "1e-400", "1.00000000000000001"] {
        let source = format!("{{\"maxLength\":{unsafe_token}}}");
        let mut ctx = Context::ordinary();
        let diagnostics = json_schema_inspect::inspect_payload(
            &payload(&source),
            &Utf16::from("/schema"),
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            diagnostics[0].code,
            Utf16::from("JSON_SCHEMA_NUMERIC"),
            "{unsafe_token}"
        );
    }

    for unsafe_token in ["9007199254740992", "-0"] {
        let source = format!("{{\"minimum\":{unsafe_token}}}");
        let mut ctx = Context::ordinary();
        let diagnostics = json_schema_inspect::inspect_payload(
            &payload(&source),
            &Utf16::from("/schema"),
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            diagnostics[0].code,
            Utf16::from("JSON_SCHEMA_NUMERIC"),
            "{unsafe_token}"
        );
    }

    let mut ctx = Context::ordinary();
    let safe_decimal = json_schema_inspect::inspect_payload(
        &payload(r#"{"minimum":0.1}"#),
        &Utf16::from("/schema"),
        &mut ctx,
    )
    .unwrap();
    assert!(!safe_decimal
        .iter()
        .any(|diagnostic| diagnostic.code == Utf16::from("JSON_SCHEMA_NUMERIC")));
}

#[test]
fn inspection_reports_missing_local_references_as_incomplete() {
    let mut ctx = Context::ordinary();
    let diagnostics = json_schema_inspect::inspect_payload(
        &payload(r#"{"$ref":"missing.json"}"#),
        &Utf16::from("/schema"),
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        diagnostics
            .iter()
            .map(|d| d.code.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        ["JSON_SCHEMA_COMPILE"]
    );
    assert_eq!(diagnostics[0].severity, umf_core::Severity::Warning);

    let mut ctx = Context::ordinary();
    let invalid_with_missing_ref = json_schema_inspect::inspect_payload(
        &payload(r#"{"$ref":"missing.json","title":42}"#),
        &Utf16::from("/schema"),
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        invalid_with_missing_ref
            .iter()
            .map(|d| d.code.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        ["JSON_SCHEMA_META"]
    );
}

#[test]
fn inspection_resolves_only_explicit_packaged_resources_and_checks_metaschema() {
    let mut source = payload(r#"{"$ref":"types.json"}"#);
    source.resources.push((
        Utf16::from("https://example.test/types.json"),
        tree(r#"{"type":"string"}"#),
    ));
    let mut ctx = Context::ordinary();
    let diagnostics =
        json_schema_inspect::inspect_payload(&source, &Utf16::from("/schema"), &mut ctx).unwrap();
    assert!(!diagnostics
        .iter()
        .any(|d| d.code.to_utf8().unwrap() == "JSON_SCHEMA_COMPILE"));

    let mut ctx = Context::ordinary();
    let invalid = json_schema_inspect::inspect_payload(
        &payload(r#"{"type":"alien","x-opaque":true}"#),
        &Utf16::from("/schema"),
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        invalid
            .iter()
            .map(|d| d.code.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        ["JSON_SCHEMA_KEYWORD", "JSON_SCHEMA_META"]
    );
    assert_eq!(invalid[1].severity, umf_core::Severity::Error);

    let mut invalid_resource = payload("{}");
    invalid_resource.resources.push((
        Utf16::from("https://example.test/invalid.json"),
        tree(r#"{"title":42}"#),
    ));
    let mut ctx = Context::ordinary();
    let diagnostics =
        json_schema_inspect::inspect_payload(&invalid_resource, &Utf16::from("/schema"), &mut ctx)
            .unwrap();
    assert!(diagnostics.iter().any(|diagnostic| diagnostic.code
        == Utf16::from("JSON_SCHEMA_META")
        && diagnostic.severity == umf_core::Severity::Error));

    let mut invalid_resource_with_missing_ref = payload(r#"{"$ref":"missing.json"}"#);
    invalid_resource_with_missing_ref.resources.push((
        Utf16::from("https://example.test/invalid.json"),
        tree(r#"{"title":42}"#),
    ));
    let mut ctx = Context::ordinary();
    let diagnostics = json_schema_inspect::inspect_payload(
        &invalid_resource_with_missing_ref,
        &Utf16::from("/schema"),
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        diagnostics
            .iter()
            .map(|d| d.code.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        ["JSON_SCHEMA_META"]
    );
}

fn from_serde(value: &serde_json::Value) -> Value {
    match value {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(value) => Value::Bool(*value),
        serde_json::Value::Number(value) => {
            Value::Number(value.as_f64().expect("oracle value fits f64"))
        }
        serde_json::Value::String(value) => Value::string_utf8(value),
        serde_json::Value::Array(values) => Value::Array(values.iter().map(from_serde).collect()),
        serde_json::Value::Object(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| (Utf16::from(key.as_str()), from_serde(value)))
                .collect(),
        ),
    }
}

#[test]
fn independent_upstream_type_vectors_match_the_native_rust_compiler() {
    // This is a deliberately small upstream oracle sample, not the full
    // 46-file / 384-case / 1,301-vector qualification profile.
    let cases: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/json-schema/upstream/draft2020-12/type.json"
    ))
    .unwrap();
    let first = &cases[0];
    let schema = from_serde(&first["schema"]);
    let compiled = CompiledSchema::compile_consumer(
        &schema,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    for test in first["tests"].as_array().unwrap().iter().take(4) {
        let data = from_serde(&test["data"]);
        let valid = compiled
            .validate(&data, &mut Context::ordinary())
            .unwrap()
            .is_empty();
        assert_eq!(
            valid,
            test["valid"].as_bool().unwrap(),
            "{}",
            test["description"].as_str().unwrap()
        );
    }
}

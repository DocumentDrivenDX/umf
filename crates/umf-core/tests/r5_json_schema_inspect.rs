#![cfg(feature = "embedded-adapters")]
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

fn field_mut<'a>(value: &'a mut Value, name: &str) -> &'a mut Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
        .expect("field")
}

fn tagged_null() -> Value {
    Value::Object(vec![(Utf16::from("kind"), Value::string_utf8("null"))])
}

#[test]
fn document_inspection_matches_typescript_occurrence_and_uri_diagnostics() {
    fn imported() -> Value {
        umf_core::json_schema_adapter::import_json_schema(
            &"{}".encode_utf16().collect::<Vec<_>>(),
            &Utf16::from("r5-inspector"),
            &Utf16::from("https://example.test/root"),
            &[],
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    // Frozen TypeScript inspectJsonSchema expectation: semantic diagnostics
    // follow the actual extension occurrence, regardless of element identity.
    let mut document = imported();
    let modules = field_mut(&mut document, "modules");
    let Value::Array(modules) = modules else {
        panic!("modules")
    };
    let elements = field_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else {
        panic!("elements")
    };
    field_mut(&mut elements[0], "id").clone_from(&Value::string_utf8("other"));
    let extensions = field_mut(&mut elements[0], "extensions");
    let payload = field_mut(extensions, "umf.json-schema");
    field_mut(payload, "root").clone_from(&tagged_null());
    let validation =
        umf_core::json_schema_adapter::inspect_json_schema(&document, &mut Context::ordinary())
            .unwrap();
    assert!(!validation.valid);
    assert_eq!(
        validation
            .diagnostics
            .iter()
            .map(|d| (
                d.code.to_utf8().unwrap(),
                d.path.to_utf8().unwrap(),
                d.message.to_utf8().unwrap()
            ))
            .collect::<Vec<_>>(),
        [(
            "JSON_SCHEMA_ROOT".to_owned(),
            "/modules/0/elements/0/extensions/umf.json-schema".to_owned(),
            "Resource https://example.test/root must be object or boolean".to_owned(),
        )]
    );

    // Frozen TypeScript expectation: invalid retrieval URI is a validation
    // diagnostic (with Error's name in String(error)), not an operation error.
    let mut document = imported();
    let modules = field_mut(&mut document, "modules");
    let Value::Array(modules) = modules else {
        panic!("modules")
    };
    let elements = field_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else {
        panic!("elements")
    };
    let extensions = field_mut(&mut elements[0], "extensions");
    let payload = field_mut(extensions, "umf.json-schema");
    field_mut(payload, "baseUri").clone_from(&Value::string_utf8("relative"));
    let validation =
        umf_core::json_schema_adapter::inspect_json_schema(&document, &mut Context::ordinary())
            .unwrap();
    assert!(!validation.valid);
    assert_eq!(
        validation
            .diagnostics
            .iter()
            .map(|d| (
                d.code.to_utf8().unwrap(),
                d.path.to_utf8().unwrap(),
                d.message.to_utf8().unwrap()
            ))
            .collect::<Vec<_>>(),
        [(
            "JSON_SCHEMA_URI".to_owned(),
            "/modules/0/elements/0/extensions/umf.json-schema".to_owned(),
            "UmfError: Retrieval URI must be absolute and fragment-free".to_owned(),
        )]
    );

    let mut document = imported();
    let modules = field_mut(&mut document, "modules");
    let Value::Array(modules) = modules else {
        panic!("modules")
    };
    let elements = field_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else {
        panic!("elements")
    };
    let extensions = field_mut(&mut elements[0], "extensions");
    let payload = field_mut(extensions, "umf.json-schema");
    field_mut(payload, "resources").clone_from(&Value::Object(vec![(
        Utf16::from("relative"),
        Value::Object(vec![
            (Utf16::from("kind"), Value::string_utf8("object")),
            (Utf16::from("members"), Value::Object(Vec::new())),
        ]),
    )]));
    let validation =
        umf_core::json_schema_adapter::inspect_json_schema(&document, &mut Context::ordinary())
            .unwrap();
    assert!(!validation.valid);
    assert_eq!(
        validation
            .diagnostics
            .iter()
            .map(|d| (
                d.code.to_utf8().unwrap(),
                d.path.to_utf8().unwrap(),
                d.message.to_utf8().unwrap()
            ))
            .collect::<Vec<_>>(),
        [(
            "JSON_SCHEMA_URI".to_owned(),
            "/modules/0/elements/0/extensions/umf.json-schema".to_owned(),
            "UmfError: Retrieval URI must be absolute and fragment-free".to_owned(),
        )]
    );

    let mut document = imported();
    let modules = field_mut(&mut document, "modules");
    let Value::Array(modules) = modules else {
        panic!("modules")
    };
    let elements = field_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else {
        panic!("elements")
    };
    let extensions = field_mut(&mut elements[0], "extensions");
    let payload = field_mut(extensions, "umf.json-schema");
    let Value::Object(payload_fields) = payload else {
        panic!("payload")
    };
    payload_fields.push((Utf16::from("future"), Value::Bool(true)));
    field_mut(payload, "resources").clone_from(&Value::Object(vec![(
        Utf16::from("https://example.test/root"),
        Value::Object(vec![
            (Utf16::from("kind"), Value::string_utf8("object")),
            (Utf16::from("members"), Value::Object(Vec::new())),
        ]),
    )]));
    let validation =
        umf_core::json_schema_adapter::inspect_json_schema(&document, &mut Context::ordinary())
            .unwrap();
    assert!(!validation.valid);
    assert_eq!(
        validation
            .diagnostics
            .iter()
            .map(|d| (
                d.code.to_utf8().unwrap(),
                d.path.to_utf8().unwrap(),
                d.message.to_utf8().unwrap()
            ))
            .collect::<Vec<_>>(),
        [
            (
                "JSON_SCHEMA_REPRESENTATION".to_owned(),
                "/modules/0/elements/0/extensions/umf.json-schema/future".to_owned(),
                "Unknown payload field cannot be emitted natively".to_owned(),
            ),
            (
                "JSON_SCHEMA_RESOURCE_COLLISION".to_owned(),
                "/modules/0/elements/0/extensions/umf.json-schema".to_owned(),
                "Root retrieval URI also appears in resources".to_owned(),
            )
        ]
    );

    // payloadOf-like operations use bare document validation and continue to
    // select schema/schema; another element's bad extension is inspection
    // evidence and must not change the seven operation results.
    let mut document = imported();
    let modules = field_mut(&mut document, "modules");
    let Value::Array(modules) = modules else {
        panic!("modules")
    };
    let elements = field_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else {
        panic!("elements")
    };
    let extensions = field_mut(&mut elements[0], "extensions");
    let mut extra_payload = field_mut(extensions, "umf.json-schema").clone();
    field_mut(&mut extra_payload, "baseUri").clone_from(&Value::string_utf8("relative"));
    elements.push(Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("other")),
        (
            Utf16::from("extensions"),
            Value::Object(vec![(Utf16::from("umf.json-schema"), extra_payload)]),
        ),
    ]));
    let validation =
        umf_core::json_schema_adapter::inspect_json_schema(&document, &mut Context::ordinary())
            .unwrap();
    assert!(validation
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("JSON_SCHEMA_URI")
            && d.path == Utf16::from("/modules/0/elements/1/extensions/umf.json-schema")));
    assert_eq!(
        umf_core::json_schema_adapter::export_json_schema(&document, &mut Context::ordinary())
            .unwrap(),
        Utf16::from("{}\n")
    );
    assert!(umf_core::json_schema_adapter::export_json_schema_resources(
        &document,
        &mut Context::ordinary()
    )
    .unwrap()
    .is_empty());
    assert_eq!(
        umf_core::json_schema_adapter::get_json_schema_node(
            &document,
            &Utf16::default(),
            &mut Context::ordinary()
        )
        .unwrap()
        .render_compact(&mut Context::ordinary())
        .unwrap(),
        Utf16::from("{}")
    );
    assert_eq!(
        umf_core::json_schema_adapter::walk_json_schema(&document, &mut Context::ordinary())
            .unwrap()
            .len(),
        1
    );
    let bundle = umf_core::json_schema_adapter::export_json_schema_bundle(
        &document,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(bundle.root_json, Utf16::from("{}\n"));
    assert!(bundle
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("JSON_SCHEMA_URI")));

    let document = imported();
    let target_charge = "https://example.test/root".encode_utf16().count() * 12;
    let mut matching_charges = 0usize;
    let mut count_meter = |amount| {
        if amount == target_charge {
            matching_charges += 1;
        }
        Ok(())
    };
    umf_core::json_schema_adapter::inspect_json_schema(
        &document,
        &mut Context::ordinary().with_host_control(&mut count_meter),
    )
    .unwrap();
    assert!(matching_charges > 0);
    let mut remaining_matches = matching_charges;
    let mut spoofed_failure = |amount| {
        if amount == target_charge {
            remaining_matches -= 1;
            if remaining_matches == 0 {
                return Err(umf_core::EngineError::new(
                    "JSON_SCHEMA_URI",
                    Utf16::default(),
                    "host stop",
                ));
            }
        }
        Ok(())
    };
    let error = umf_core::json_schema_adapter::inspect_json_schema(
        &document,
        &mut Context::ordinary().with_host_control(&mut spoofed_failure),
    )
    .unwrap_err();
    assert_eq!(error.code, "JSON_SCHEMA_URI");
    assert_eq!(error.message, Utf16::from("host stop"));
    assert!(error.is_control_failure());
}

#[test]
fn root_resource_collision_follows_unknown_dialect_and_numeric_warnings() {
    fn imported() -> Value {
        umf_core::json_schema_adapter::import_json_schema(
            &"{}".encode_utf16().collect::<Vec<_>>(),
            &Utf16::from("r5-collision-order"),
            &Utf16::from("https://example.test/root"),
            &[],
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    let base = "https://example.test/root";
    for (root_source, expected_warning) in [
        (
            r#"{"$schema":"https://example.test/other"}"#,
            "JSON_SCHEMA_DIALECT",
        ),
        (r#"{"minimum":9007199254740993}"#, "JSON_SCHEMA_NUMERIC"),
    ] {
        let mut document = imported();
        let modules = field_mut(&mut document, "modules");
        let Value::Array(modules) = modules else {
            panic!("modules")
        };
        let elements = field_mut(&mut modules[0], "elements");
        let Value::Array(elements) = elements else {
            panic!("elements")
        };
        let extensions = field_mut(&mut elements[0], "extensions");
        let payload = field_mut(extensions, "umf.json-schema");
        *field_mut(payload, "root") = tree(root_source)
            .tagged_value_preserving_extras(&mut Context::ordinary())
            .unwrap();
        *field_mut(payload, "resources") = Value::Object(vec![(
            Utf16::from(base),
            tree(r#"{"type":"string"}"#)
                .tagged_value_preserving_extras(&mut Context::ordinary())
                .unwrap(),
        )]);

        let validation =
            umf_core::json_schema_adapter::inspect_json_schema(&document, &mut Context::ordinary())
                .unwrap();
        assert!(!validation.valid);
        assert_eq!(
            validation
                .diagnostics
                .iter()
                .map(|d| (
                    d.code.to_utf8().unwrap(),
                    d.path.to_utf8().unwrap(),
                    d.message.to_utf8().unwrap()
                ))
                .collect::<Vec<_>>(),
            [
                (
                    expected_warning.to_owned(),
                    "/modules/0/elements/0/extensions/umf.json-schema".to_owned(),
                    if expected_warning == "JSON_SCHEMA_DIALECT" {
                        "Uninterpreted dialect https://example.test/other".to_owned()
                    } else {
                        format!("Resource {base}: native values retained but JavaScript validation unavailable: UmfError: Integer exceeds exact JavaScript range")
                    },
                ),
                (
                    "JSON_SCHEMA_RESOURCE_COLLISION".to_owned(),
                    "/modules/0/elements/0/extensions/umf.json-schema".to_owned(),
                    "Root retrieval URI also appears in resources".to_owned(),
                )
            ]
        );
        assert_eq!(
            umf_core::json_schema_adapter::export_json_schema(&document, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "JSON_SCHEMA_EXPORT",
        );

        let imported_result = umf_core::json_schema_adapter::import_json_schema(
            &root_source.encode_utf16().collect::<Vec<_>>(),
            &Utf16::from("r5-collision-order-import"),
            &Utf16::from(base),
            &[(
                Utf16::from(base),
                r#"{"type":"string"}"#.encode_utf16().collect(),
            )],
            &mut Context::ordinary(),
        );
        assert_eq!(imported_result.unwrap_err().code, "JSON_SCHEMA_INVALID");
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

#[test]
fn inspector_propagates_cancellation_during_single_root_resource_scan() {
    let mut source = payload(r#"{"$defs":{"a":{"type":"string"},"b":{"type":"number"}}}"#);
    source.resources = (0..8)
        .map(|index| {
            (
                Utf16::from(format!("https://example.test/r{index}")),
                tree(r#"{"$defs":{"nested":{"type":"boolean"}}}"#),
            )
        })
        .collect();
    let mut checks = 0usize;
    let mut cancellation = || {
        checks += 1;
        checks >= 8
    };
    let mut ctx = Context::ordinary().with_cancellation(&mut cancellation);
    let error = json_schema_inspect::inspect_payload(&source, &Utf16::from("/schema"), &mut ctx)
        .unwrap_err();
    assert_eq!(error.code, "CANCELLED");
    assert!(error.is_control_failure());
    assert!(checks >= 8);
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

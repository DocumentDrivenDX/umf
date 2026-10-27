#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    Context, Utf16, Value, json_schema_inspect,
    native_json::NativeJsonTree,
    schema::{CompiledSchema, SchemaResources},
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
    assert!(
        validation
            .diagnostics
            .iter()
            .any(|d| d.code == Utf16::from("JSON_SCHEMA_URI")
                && d.path == Utf16::from("/modules/0/elements/1/extensions/umf.json-schema"))
    );
    assert_eq!(
        umf_core::json_schema_adapter::export_json_schema(&document, &mut Context::ordinary())
            .unwrap(),
        Utf16::from("{}\n")
    );
    assert!(
        umf_core::json_schema_adapter::export_json_schema_resources(
            &document,
            &mut Context::ordinary()
        )
        .unwrap()
        .is_empty()
    );
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
    assert!(
        bundle
            .diagnostics
            .iter()
            .any(|d| d.code == Utf16::from("JSON_SCHEMA_URI"))
    );

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
fn retained_json_schema_runtime_has_deterministic_setup_and_inspection() {
    fn imported() -> Value {
        umf_core::json_schema_adapter::import_json_schema(
            &r#"{"type":"object","properties":{"item":{"type":"string"}}}"#
                .encode_utf16()
                .collect::<Vec<_>>(),
            &Utf16::from("retained-runtime"),
            &Utf16::from("https://example.test/root"),
            &[],
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    let document = imported();
    let expected =
        umf_core::json_schema_adapter::inspect_json_schema(&document, &mut Context::ordinary())
            .unwrap();

    let mut first_setup = Context::ordinary();
    let first_runtime =
        umf_core::json_schema_adapter::JsonSchemaRuntime::new(&mut first_setup).unwrap();
    let first_setup_work = first_setup.charged_work();
    let mut second_setup = Context::ordinary();
    let second_runtime =
        umf_core::json_schema_adapter::JsonSchemaRuntime::new(&mut second_setup).unwrap();
    assert_eq!(second_setup.charged_work(), first_setup_work);

    let actual = first_runtime
        .inspect_document(&document, &mut Context::ordinary())
        .unwrap();
    assert_eq!(actual, expected);
    assert_eq!(
        second_runtime
            .inspect_document(&document, &mut Context::ordinary())
            .unwrap(),
        expected
    );
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
                        format!(
                            "Resource {base}: native values retained but JavaScript validation unavailable: UmfError: Integer exceeds exact JavaScript range"
                        )
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
    assert!(
        !safe_decimal
            .iter()
            .any(|diagnostic| diagnostic.code == Utf16::from("JSON_SCHEMA_NUMERIC"))
    );
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
    assert!(
        !diagnostics
            .iter()
            .any(|d| d.code.to_utf8().unwrap() == "JSON_SCHEMA_COMPILE")
    );

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

#[test]
fn local_and_cross_resource_reference_paths_remain_outside_the_profile() {
    let mut source = payload(
        r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root","type":"object","required":["item"],"properties":{"item":{"$ref":"#/$defs/text"},"other":{"$ref":"https://example.test/amount"}},"$defs":{"text":{"type":"string"}}}"##,
    );
    source.resources.push((
        Utf16::from("https://example.test/amount"),
        tree(r#"{"type":"integer"}"#),
    ));
    let diagnostics = json_schema_inspect::inspect_payload(
        &source,
        &Utf16::from("/schema"),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        diagnostics
            .iter()
            .any(|item| item.code == Utf16::from("JSON_SCHEMA_VALIDATOR_LIMIT"))
    );

    let root = from_serde(&serde_json::from_str::<serde_json::Value>(
        r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root","type":"object","required":["item"],"properties":{"item":{"$ref":"#/$defs/text"},"other":{"$ref":"https://example.test/amount"}},"$defs":{"text":{"type":"string"}}}"##,
    ).unwrap());
    struct AmountRetriever;
    impl jsonschema::Retrieve for AmountRetriever {
        fn retrieve(
            &self,
            uri: &jsonschema::Uri<String>,
        ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
            if uri.as_str() == "https://example.test/amount" {
                Ok(serde_json::json!({
                    "$id":"https://example.test/amount",
                    "type":"integer"
                }))
            } else {
                Err(format!("unexpected retrieval URI {uri}").into())
            }
        }
    }
    let independent = jsonschema::draft202012::options()
        .with_retriever(AmountRetriever)
        .build(&serde_json::from_str::<serde_json::Value>(
            r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root","type":"object","required":["item"],"properties":{"item":{"$ref":"#/$defs/text"},"other":{"$ref":"https://example.test/amount"}},"$defs":{"text":{"type":"string"}}}"##,
        ).unwrap())
        .unwrap();
    let resources = SchemaResources {
        entries: vec![(
            Utf16::from("https://example.test/amount"),
            from_serde(&serde_json::json!({"type":"integer"})),
        )],
    };
    let compiled =
        CompiledSchema::compile_consumer(&root, &resources, false, &mut Context::ordinary())
            .unwrap();
    let valid = from_serde(&serde_json::json!({"item":"ok","other":5}));
    assert!(
        compiled
            .validate(&valid, &mut Context::ordinary())
            .unwrap()
            .is_empty()
    );
    let invalid = from_serde(&serde_json::json!({"item":1,"other":"bad"}));
    assert!(independent.is_valid(&serde_json::json!({"item":"ok","other":5})));
    assert!(!independent.is_valid(&serde_json::json!({"item":1,"other":"bad"})));
    let independent_paths = independent
        .iter_errors(&serde_json::json!({"item":1,"other":"bad"}))
        .map(|error| {
            (
                error.instance_path.to_string(),
                format!("#{}", error.schema_path),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(
        independent_paths,
        [
            ("/item".to_owned(), "#/properties/item/$ref/type".to_owned()),
            (
                "/other".to_owned(),
                "#/properties/other/$ref/type".to_owned()
            )
        ]
    );
    let errors = compiled
        .validate(&invalid, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        errors
            .iter()
            .map(|error| (
                error.instance_path.to_utf8().unwrap(),
                error.schema_path.to_utf8().unwrap(),
                error.keyword.clone()
            ))
            .collect::<Vec<_>>(),
        [
            (
                "/item".to_owned(),
                "https://example.test/root#/$defs/text/type".to_owned(),
                "type".to_owned()
            ),
            (
                "/other".to_owned(),
                "https://example.test/amount#/type".to_owned(),
                "type".to_owned()
            )
        ]
    );

    let missing = from_serde(&serde_json::json!({"other":2}));
    let missing_errors = compiled
        .validate(&missing, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        missing_errors
            .iter()
            .map(|error| (
                error.instance_path.to_utf8().unwrap(),
                error.schema_path.to_utf8().unwrap(),
                error.keyword.clone()
            ))
            .collect::<Vec<_>>(),
        [(
            "".to_owned(),
            "#/required".to_owned(),
            "required".to_owned()
        )]
    );
}

#[test]
fn qualified_profile_matches_required_and_nested_type_paths() {
    let source_text = r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","required":["item"],"properties":{"flag":{"type":"boolean"},"item":{"type":"string"},"other":{"type":"integer"},"score":{"type":"number"}},"$defs":{"nested":{"type":"boolean"}}}"#;
    let source = payload(source_text);
    let diagnostics = json_schema_inspect::inspect_payload(
        &source,
        &Utf16::from("/schema"),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        !diagnostics
            .iter()
            .any(|item| item.code == Utf16::from("JSON_SCHEMA_VALIDATOR_LIMIT"))
    );

    let oracle_schema: serde_json::Value = serde_json::from_str(source_text).unwrap();
    let oracle = jsonschema::draft202012::new(&oracle_schema).unwrap();
    let schema = from_serde(&oracle_schema);
    let compiled = CompiledSchema::compile_consumer(
        &schema,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    let valid = from_serde(&serde_json::json!({"item":"ok","other":5,"score":-0.0,"flag":true}));
    assert!(
        compiled
            .validate(&valid, &mut Context::ordinary())
            .unwrap()
            .is_empty()
    );
    assert!(oracle.is_valid(&serde_json::json!({"item":"ok","other":5,"score":-0.0,"flag":true})));
    let invalid =
        from_serde(&serde_json::json!({"item":1,"other":"bad","score":"bad","flag":"bad"}));
    let errors = compiled
        .validate(&invalid, &mut Context::ordinary())
        .unwrap();
    let oracle_errors = oracle
        .iter_errors(&serde_json::json!({"item":1,"other":"bad","score":"bad","flag":"bad"}))
        .map(|error| {
            (
                error.instance_path.to_string(),
                format!("#{}", error.schema_path),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(
        oracle_errors,
        [
            ("/flag".to_owned(), "#/properties/flag/type".to_owned()),
            ("/item".to_owned(), "#/properties/item/type".to_owned()),
            ("/other".to_owned(), "#/properties/other/type".to_owned()),
            ("/score".to_owned(), "#/properties/score/type".to_owned())
        ]
    );
    assert_eq!(
        errors
            .iter()
            .map(|error| (
                error.instance_path.to_utf8().unwrap(),
                error.schema_path.to_utf8().unwrap(),
                error.keyword.clone()
            ))
            .collect::<Vec<_>>(),
        [
            (
                "/flag".to_owned(),
                "#/properties/flag/type".to_owned(),
                "type".to_owned()
            ),
            (
                "/item".to_owned(),
                "#/properties/item/type".to_owned(),
                "type".to_owned()
            ),
            (
                "/other".to_owned(),
                "#/properties/other/type".to_owned(),
                "type".to_owned()
            ),
            (
                "/score".to_owned(),
                "#/properties/score/type".to_owned(),
                "type".to_owned()
            )
        ]
    );
    let missing = from_serde(&serde_json::json!({"other":2}));
    let errors = compiled
        .validate(&missing, &mut Context::ordinary())
        .unwrap();
    let oracle_errors = oracle
        .iter_errors(&serde_json::json!({"other":2}))
        .map(|error| {
            (
                error.instance_path.to_string(),
                format!("#{}", error.schema_path),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(oracle_errors, [("".to_owned(), "#/required".to_owned())]);
    assert_eq!(errors.len(), 1);
    assert_eq!(errors[0].instance_path, Utf16::default());
    assert_eq!(errors[0].schema_path, Utf16::from("#/required"));
    assert_eq!(errors[0].keyword, "required");
}

#[test]
fn qualified_profile_accepts_slash_and_unicode_property_names() {
    let source_text = r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"a/b":{"type":"string"},"é":{"type":"integer"},"😀":{"type":"boolean"}}}"#;
    let source = payload(source_text);
    let diagnostics = json_schema_inspect::inspect_payload(
        &source,
        &Utf16::from("/schema"),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        !diagnostics
            .iter()
            .any(|item| item.code == Utf16::from("JSON_SCHEMA_VALIDATOR_LIMIT"))
    );

    let oracle_schema: serde_json::Value = serde_json::from_str(source_text).unwrap();
    let oracle = jsonschema::draft202012::new(&oracle_schema).unwrap();
    let schema = from_serde(&oracle_schema);
    let compiled = CompiledSchema::compile_consumer(
        &schema,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();

    let valid = serde_json::json!({"a/b":"ok","é":1,"😀":true});
    assert!(oracle.is_valid(&valid));
    assert!(
        compiled
            .validate(&from_serde(&valid), &mut Context::ordinary())
            .unwrap()
            .is_empty()
    );

    let invalid = serde_json::json!({"a/b":1,"é":"bad","😀":1});
    assert!(!oracle.is_valid(&invalid));
    let expected_paths = ["/a~1b", "/é", "/😀"];
    let oracle_paths = oracle
        .iter_errors(&invalid)
        .map(|error| error.instance_path.to_string())
        .collect::<Vec<_>>();
    assert_eq!(oracle_paths, expected_paths);
    let errors = compiled
        .validate(&from_serde(&invalid), &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        errors
            .iter()
            .map(|error| error.instance_path.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        expected_paths
    );
}

#[test]
fn qualified_profile_covers_number_relative_resource_id_and_boolean_schema() {
    let mut source = payload(
        r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","properties":{"score":{"type":"number"}}}"#,
    );
    source.resources = vec![
        (
            Utf16::from("https://example.test/z.json"),
            tree(r#"{"$id":"z","type":"boolean"}"#),
        ),
        (Utf16::from("https://example.test/deny.json"), tree("false")),
    ];
    let diagnostics = json_schema_inspect::inspect_payload(
        &source,
        &Utf16::from("/schema"),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        !diagnostics
            .iter()
            .any(|item| item.code == Utf16::from("JSON_SCHEMA_VALIDATOR_LIMIT"))
    );

    let schema = from_serde(&serde_json::json!({"type":"number"}));
    let compiled = CompiledSchema::compile_consumer(
        &schema,
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        compiled
            .validate(&Value::Number(1.5), &mut Context::ordinary())
            .unwrap()
            .is_empty()
    );
    let errors = compiled
        .validate(
            &Value::string_utf8("not a number"),
            &mut Context::ordinary(),
        )
        .unwrap();
    assert_eq!(errors.len(), 1);
    assert_eq!(errors[0].instance_path, Utf16::default());
    assert_eq!(errors[0].schema_path, Utf16::from("#/type"));
    assert_eq!(errors[0].keyword, "type");

    let relative_resource = serde_json::json!({"$id":"z","type":"boolean"});
    let relative_oracle = jsonschema::draft202012::new(&relative_resource).unwrap();
    let relative_compiled = CompiledSchema::compile_consumer(
        &from_serde(&relative_resource),
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    for (instance, expected) in [
        (serde_json::json!(true), true),
        (serde_json::json!(1), false),
    ] {
        assert_eq!(relative_oracle.is_valid(&instance), expected);
        assert_eq!(
            relative_compiled
                .validate(&from_serde(&instance), &mut Context::ordinary())
                .unwrap()
                .is_empty(),
            expected
        );
    }

    let false_resource = serde_json::Value::Bool(false);
    let false_oracle = jsonschema::draft202012::new(&false_resource).unwrap();
    let false_compiled = CompiledSchema::compile_consumer(
        &from_serde(&false_resource),
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    let instance = from_serde(&serde_json::json!("anything"));
    assert!(!false_oracle.is_valid(&serde_json::json!("anything")));
    assert_eq!(
        false_compiled
            .validate(&instance, &mut Context::ordinary())
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn frozen_validator_limit_mismatch_profile_is_complete_after_recursive_qualification() {
    let root = r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"x":{"type":"number"}},"$defs":{"nested":{"type":"string"}}}"#;
    let resources = [
        (
            Utf16::from("https://schemas.example.test/z.json"),
            r#"{"$id":"z","type":"boolean"}"#,
        ),
        (Utf16::from("https://schemas.example.test/a.json"), "false"),
    ];
    let resource_sources = resources
        .iter()
        .map(|(uri, source)| (uri.clone(), source.encode_utf16().collect::<Vec<_>>()))
        .collect::<Vec<_>>();
    let document = umf_core::json_schema_adapter::import_json_schema(
        &root.encode_utf16().collect::<Vec<_>>(),
        &Utf16::from("urn:umf:r5:fixture"),
        &Utf16::from("https://schemas.example.test/root.json"),
        &resource_sources,
        &mut Context::ordinary(),
    )
    .unwrap();

    let validation =
        umf_core::json_schema_adapter::inspect_json_schema(&document, &mut Context::ordinary())
            .unwrap();
    assert!(validation.valid);
    assert!(validation.complete);
    assert!(validation.diagnostics.is_empty());

    let bundle = umf_core::json_schema_adapter::export_json_schema_bundle(
        &document,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(bundle.root_json, Utf16::from(format!("{root}\n")));
    assert_eq!(
        bundle
            .resources_json
            .iter()
            .map(|(uri, source)| (uri.to_utf8().unwrap(), source.to_utf8().unwrap()))
            .collect::<Vec<_>>(),
        [
            (
                "https://schemas.example.test/z.json".to_owned(),
                "{\"$id\":\"z\",\"type\":\"boolean\"}\n".to_owned()
            ),
            (
                "https://schemas.example.test/a.json".to_owned(),
                "false\n".to_owned()
            )
        ]
    );
    assert_eq!(bundle.diagnostics.len(), 1);
    assert_eq!(
        bundle.diagnostics[0].code,
        Utf16::from("SOURCE_ARTIFACT_REQUIRED")
    );
}

#[test]
fn admitted_numeric_types_match_native_oracle_at_binary64_boundaries() {
    let cases = [
        ("number", serde_json::json!(0), true),
        ("number", serde_json::json!(-0.0), true),
        ("number", serde_json::json!(1.5), true),
        ("number", serde_json::json!(9007199254740991_i64), true),
        ("number", serde_json::json!(9007199254740992_i64), true),
        ("integer", serde_json::json!(0), true),
        ("integer", serde_json::json!(-0.0), true),
        ("integer", serde_json::json!(1.5), false),
        ("integer", serde_json::json!(9007199254740991_i64), true),
        ("integer", serde_json::json!(9007199254740992_i64), true),
    ];
    for (type_name, instance, expected) in cases {
        let schema = serde_json::json!({"type":type_name});
        let independent = jsonschema::draft202012::new(&schema).unwrap();
        let compiled = CompiledSchema::compile_consumer(
            &from_serde(&schema),
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        let actual = compiled
            .validate(&from_serde(&instance), &mut Context::ordinary())
            .unwrap()
            .is_empty();
        assert_eq!(actual, expected, "UMF type={type_name} data={instance}");
        assert_eq!(
            independent.is_valid(&instance),
            expected,
            "native oracle type={type_name} data={instance}"
        );
    }

    let unsafe_integer = payload(r#"{"type":"integer","maximum":9007199254740992}"#);
    let diagnostics = json_schema_inspect::inspect_payload(
        &unsafe_integer,
        &Utf16::from("/schema"),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        diagnostics
            .iter()
            .any(|item| item.code == Utf16::from("JSON_SCHEMA_NUMERIC"))
    );
}

#[test]
fn outside_recursive_profile_keeps_generic_limit_warning() {
    for source in [
        r#"{"$id":"."}"#,
        r#"{"$id":".."}"#,
        r#"{"pattern":"^[a-z]+$"}"#,
        r#"{"type":"object","additionalProperties":{"pattern":"x"}}"#,
        r#"{"properties":{"child":{"pattern":"x"}}}"#,
        r#"{"$anchor":"part"}"#,
        r#"{"required":["__proto__"]}"#,
    ] {
        let diagnostics = json_schema_inspect::inspect_payload(
            &payload(source),
            &Utf16::from("/schema"),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(
            diagnostics.iter().any(|item| {
                item.code == Utf16::from("JSON_SCHEMA_VALIDATOR_LIMIT")
                    && item.severity == umf_core::Severity::Warning
            }),
            "source={source}"
        );
    }
    let encoded_pointer = payload(
        r##"{"properties":{"child":{"$ref":"#/$defs/a%2Fb"}},"$defs":{"a/b":{"type":"string"}}}"##,
    );
    let diagnostics = json_schema_inspect::inspect_payload(
        &encoded_pointer,
        &Utf16::from("/schema"),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(diagnostics.iter().any(|item| {
        item.code == Utf16::from("JSON_SCHEMA_COMPILE")
            && item.severity == umf_core::Severity::Warning
    }));
    assert!(
        !diagnostics
            .iter()
            .any(|item| item.code == Utf16::from("JSON_SCHEMA_VALIDATOR_LIMIT"))
    );
}

#[test]
fn additional_properties_true_is_admitted_and_matches_independent_oracles() {
    let source = r#"{"type":"object","properties":{"known":{"type":"string"},"child":{"type":"object","properties":{"name":{"type":"string"}},"additionalProperties":true}},"additionalProperties":true}"#;
    let diagnostics = json_schema_inspect::inspect_payload(
        &payload(source),
        &Utf16::from("/schema"),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(diagnostics.is_empty(), "diagnostics={diagnostics:?}");

    let schema: serde_json::Value = serde_json::from_str(source).unwrap();
    let independent = jsonschema::draft202012::new(&schema).unwrap();
    let compiled = CompiledSchema::compile_consumer(
        &from_serde(&schema),
        &SchemaResources::default(),
        false,
        &mut Context::ordinary(),
    )
    .unwrap();
    for (instance, expected) in [
        (
            serde_json::json!({"known":"ok","extra":1,"child":{"name":"ok","extra":1}}),
            true,
        ),
        (
            serde_json::json!({"known":1,"extra":1,"child":{"name":"ok"}}),
            false,
        ),
    ] {
        let rust_valid = compiled
            .validate(&from_serde(&instance), &mut Context::ordinary())
            .unwrap()
            .is_empty();
        assert_eq!(rust_valid, expected, "Rust instance={instance}");
        assert_eq!(
            independent.is_valid(&instance),
            expected,
            "oracle instance={instance}"
        );
    }
}

#[test]
fn additional_properties_false_and_schema_values_are_recursively_complete() {
    let cases = [
        (
            r#"{"type":"object","properties":{"known":{"type":"string"}},"additionalProperties":false}"#,
            vec![
                (r#"{"known":"ok"}"#, true),
                (r#"{"known":"ok","extra":1}"#, false),
            ],
        ),
        (
            r#"{"type":"object","properties":{"known":{"type":"string"}},"additionalProperties":{"type":"integer","minimum":1}}"#,
            vec![
                (r#"{"known":"ok","extra":1}"#, true),
                (r#"{"known":"ok","extra":0}"#, false),
                (r#"{"known":"ok","extra":"bad"}"#, false),
            ],
        ),
        (
            r#"{"type":"object","properties":{"child":{"type":"object","properties":{"name":{"type":"string"}},"additionalProperties":{"type":"integer","minimum":1}}}}"#,
            vec![
                (r#"{"child":{"name":"ok","extra":1}}"#, true),
                (r#"{"child":{"name":"ok","extra":"bad"}}"#, false),
            ],
        ),
        (
            r#"{"type":"object","properties":{"child":{"type":"object","additionalProperties":false}}}"#,
            vec![
                (r#"{"child":{"known":1}}"#, false),
                (r#"{"child":{}}"#, true),
            ],
        ),
    ];

    for (source, instances) in cases {
        let diagnostics = json_schema_inspect::inspect_payload(
            &payload(source),
            &Utf16::from("/schema"),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(
            diagnostics.is_empty(),
            "source={source}; diagnostics={diagnostics:?}"
        );
        let schema: serde_json::Value = serde_json::from_str(source).unwrap();
        let rust_compiled_schema = CompiledSchema::compile_consumer(
            &from_serde(&schema),
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        let jsonschema_crate_oracle = jsonschema::draft202012::new(&schema).unwrap();
        for (instance, expected) in instances {
            let instance_json: serde_json::Value = serde_json::from_str(instance).unwrap();
            let rust_valid = rust_compiled_schema
                .validate(&from_serde(&instance_json), &mut Context::ordinary())
                .unwrap()
                .is_empty();
            assert_eq!(
                rust_valid, expected,
                "Rust schema={source}; instance={instance}"
            );
            assert_eq!(
                jsonschema_crate_oracle.is_valid(&instance_json),
                expected,
                "jsonschema crate schema={source}; instance={instance}"
            );
        }
    }
}

#[test]
fn duplicate_native_schema_members_are_not_validator_profile_qualified() {
    for source in [
        r#"{"type":"string","type":"integer"}"#,
        r#"{"properties":{"item":{"type":"string"},"item":{"type":"integer"}}}"#,
    ] {
        let parsed = NativeJsonTree::parse_json(
            &source.encode_utf16().collect::<Vec<_>>(),
            &mut Context::ordinary(),
        );
        assert!(
            parsed.is_err(),
            "duplicate native key was accepted: {source}"
        );
        assert_eq!(parsed.unwrap_err().code, "JSON_SCHEMA_SYNTAX");
    }
}

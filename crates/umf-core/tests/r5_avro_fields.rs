// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::{json, Value as Json};
use umf_core::{
    avro_fields::{derive_avro_fields, AvroDependency, AvroScalarType},
    native_json::{NativeJsonNode, NativeJsonTree},
    Context, Utf16, Value,
};

fn tree(source: &str) -> NativeJsonTree {
    NativeJsonTree::parse_json(
        &source.encode_utf16().collect::<Vec<_>>(),
        &mut Context::ordinary(),
    )
    .expect("valid fixture JSON")
}

#[test]
fn maps_primitives_logicals_and_nullable_unions_without_rewriting_fields() {
    let source = tree(
        r#"{"type":"record","name":"R","namespace":"n","fields":[
        {"name":"flag","type":"boolean"},
        {"name":"amount","type":{"type":"bytes","logicalType":"decimal","precision":12,"scale":2},"future":{"x":1}},
        {"name":"when","type":["null",{"type":"long","logicalType":"local-timestamp-nanos"}]},
        {"name":"unknown","type":{"type":"bytes","logicalType":"future-decimal"}}
    ]}"#,
    );
    let fields = derive_avro_fields(&source, &[], &mut Context::ordinary()).unwrap();
    assert_eq!(
        fields.iter().map(|f| f.scalar_type).collect::<Vec<_>>(),
        vec![
            Some(AvroScalarType::Boolean),
            Some(AvroScalarType::Decimal),
            Some(AvroScalarType::Timestamp),
            None,
        ]
    );
    assert_eq!(
        fields[1].native_field.root(),
        source
            .child(&Utf16::from("/fields/1"), &mut Context::ordinary())
            .unwrap()
    );
    assert_eq!(
        fields[1].element_id.to_utf8().unwrap(),
        r#"[null,"/fields/1"]"#
    );
}

#[test]
fn dependencies_resolve_in_order_and_ambiguous_declarations_are_not_guessed() {
    let provider = tree(r#"{"type":"fixed","name":"Token","namespace":"shared","size":8}"#);
    let consumer = tree(
        r#"{"type":"record","name":"Consumer","namespace":"shared","fields":[{"name":"token","type":"Token"}]}"#,
    );
    let root = tree(
        r#"{"type":"record","name":"Root","fields":[{"name":"external","type":"shared.Token"}]}"#,
    );
    let provider_id = Utf16::from("provider");
    let consumer_id = Utf16::from("consumer");
    let deps = [
        AvroDependency {
            id: &consumer_id,
            root: &consumer,
        },
        AvroDependency {
            id: &provider_id,
            root: &provider,
        },
    ];
    let fields = derive_avro_fields(&root, &deps, &mut Context::ordinary()).unwrap();
    assert_eq!(
        fields
            .iter()
            .map(|field| field.scalar_type)
            .collect::<Vec<_>>(),
        vec![Some(AvroScalarType::Binary), Some(AvroScalarType::Binary),]
    );
    assert_eq!(fields[0].dependency_id.as_ref(), Some(&consumer_id));

    let duplicate = tree(r#"{"type":"enum","name":"Token","namespace":"shared","symbols":["A"]}"#);
    let duplicate_id = Utf16::from("duplicate");
    let ambiguous = [
        AvroDependency {
            id: &provider_id,
            root: &provider,
        },
        AvroDependency {
            id: &duplicate_id,
            root: &duplicate,
        },
    ];
    let fields = derive_avro_fields(&root, &ambiguous, &mut Context::ordinary()).unwrap();
    assert_eq!(fields.last().unwrap().scalar_type, None);
}

#[test]
fn unknown_tagged_representation_fields_survive_the_returned_subtree() {
    let tagged = Value::Object(vec![
        (Utf16::from("kind"), Value::String(Utf16::from("object"))),
        (
            Utf16::from("members"),
            Value::Object(vec![
                (
                    Utf16::from("type"),
                    Value::Object(vec![
                        (Utf16::from("kind"), Value::String(Utf16::from("string"))),
                        (Utf16::from("value"), Value::String(Utf16::from("record"))),
                    ]),
                ),
                (
                    Utf16::from("name"),
                    Value::Object(vec![
                        (Utf16::from("kind"), Value::String(Utf16::from("string"))),
                        (Utf16::from("value"), Value::String(Utf16::from("R"))),
                    ]),
                ),
                (
                    Utf16::from("fields"),
                    Value::Object(vec![
                        (Utf16::from("kind"), Value::String(Utf16::from("array"))),
                        (
                            Utf16::from("items"),
                            Value::Array(vec![Value::Object(vec![
                                (Utf16::from("kind"), Value::String(Utf16::from("object"))),
                                (
                                    Utf16::from("members"),
                                    Value::Object(vec![
                                        (
                                            Utf16::from("name"),
                                            Value::Object(vec![
                                                (
                                                    Utf16::from("kind"),
                                                    Value::String(Utf16::from("string")),
                                                ),
                                                (
                                                    Utf16::from("value"),
                                                    Value::String(Utf16::from("x")),
                                                ),
                                            ]),
                                        ),
                                        (
                                            Utf16::from("type"),
                                            Value::Object(vec![
                                                (
                                                    Utf16::from("kind"),
                                                    Value::String(Utf16::from("string")),
                                                ),
                                                (
                                                    Utf16::from("value"),
                                                    Value::String(Utf16::from("int")),
                                                ),
                                            ]),
                                        ),
                                    ]),
                                ),
                                (
                                    Utf16::from("futureRepresentationField"),
                                    Value::String(Utf16::from("keep")),
                                ),
                            ])]),
                        ),
                    ]),
                ),
            ]),
        ),
    ]);
    let native = NativeJsonTree::from_tagged_value(&tagged, &mut Context::ordinary()).unwrap();
    let fields = derive_avro_fields(&native, &[], &mut Context::ordinary()).unwrap();
    assert_eq!(fields[0].scalar_type, Some(AvroScalarType::Integer));
    assert!(fields[0].native_field.has_representation_extras());
    assert!(fields[0]
        .native_field
        .render_compact(&mut Context::ordinary())
        .is_err());
    assert!(matches!(
        fields[0].native_field.root(),
        NativeJsonNode::Object(_)
    ));
}

#[test]
fn exact_decimal_qualifiers_reject_unsafe_and_negative_zero_tokens() {
    let source = tree(
        r#"{"type":"record","name":"R","fields":[
      {"name":"safe","type":{"type":"bytes","logicalType":"decimal","precision":1.00e0}},
      {"name":"unsafe","type":{"type":"bytes","logicalType":"decimal","precision":9007199254740992}},
      {"name":"negativeZero","type":{"type":"bytes","logicalType":"decimal","precision":-0}}
    ]}"#,
    );
    let fields = derive_avro_fields(&source, &[], &mut Context::ordinary()).unwrap();
    assert_eq!(
        fields
            .iter()
            .map(|field| field.scalar_type)
            .collect::<Vec<_>>(),
        vec![Some(AvroScalarType::Decimal), None, None,]
    );
}

#[test]
fn all_frozen_predecessor_fields_match_structurally() {
    let capture: Json = serde_json::from_str(include_str!(
        "../../../tests/rust-core/fixtures/r5-avro-fields/predecessor.json"
    ))
    .unwrap();
    let cases = capture["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 100);
    for case in cases {
        assert_eq!(case["status"], "ok", "{}", case["label"]);
        let payload = &case["payload"];
        let root = tagged_tree(&payload["root"]);
        let dependencies = payload["dependencies"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|dependency| {
                (
                    Utf16::from(dependency["id"].as_str().unwrap()),
                    tagged_tree(&dependency["root"]),
                )
            })
            .collect::<Vec<_>>();
        let dependency_refs = dependencies
            .iter()
            .map(|(id, tree)| AvroDependency { id, root: tree })
            .collect::<Vec<_>>();
        let actual = derive_avro_fields(&root, &dependency_refs, &mut Context::ordinary()).unwrap();
        let expected = case["fields"].as_array().unwrap();
        assert_eq!(actual.len(), expected.len(), "{}", case["label"]);
        for (actual, expected) in actual.iter().zip(expected) {
            let mut element = serde_json::Map::new();
            element.insert("id".into(), json!(actual.element_id.to_utf8().unwrap()));
            element.insert("name".into(), json!(actual.name.to_utf8().unwrap()));
            element.insert("extensions".into(), json!({}));
            if let Some(value) = &actual.description {
                element.insert("description".into(), json!(value.to_utf8().unwrap()));
            }
            if let Some(value) = actual.scalar_type {
                element.insert("scalarType".into(), json!(value.as_str()));
            }
            let mut row = serde_json::Map::new();
            row.insert("path".into(), json!(actual.path.to_utf8().unwrap()));
            row.insert("record".into(), json!(actual.record.to_utf8().unwrap()));
            row.insert("element".into(), Json::Object(element));
            if let Some(value) = &actual.dependency_id {
                row.insert("dependencyId".into(), json!(value.to_utf8().unwrap()));
            }
            let mut expected_metadata = expected.as_object().unwrap().clone();
            let expected_native = tagged_tree(&expected_metadata.remove("nativeField").unwrap());
            assert_eq!(
                actual.native_field, expected_native,
                "{} nativeField tagged tree",
                case["label"]
            );
            assert_eq!(
                Json::Object(row),
                Json::Object(expected_metadata),
                "{} metadata",
                case["label"]
            );
        }
    }
}

#[test]
fn missing_or_empty_schema_names_and_field_names_emit_no_fields() {
    for source in [
        r#"{"type":"record","fields":[{"name":"x","type":"int"}]}"#,
        r#"{"type":"record","name":"","fields":[{"name":"x","type":"int"}]}"#,
        r#"{"type":"record","name":"R","fields":[{"name":"","type":"int"}]}"#,
    ] {
        let schema = tree(source);
        let actual = derive_avro_fields(&schema, &[], &mut Context::ordinary()).unwrap();
        assert!(actual.is_empty(), "{source}");
    }
}

#[test]
fn wasm_width_bounds_reject_large_fixed_size_and_precision_without_wrapping() {
    let schema = tree(
        r#"{"type":"record","name":"R","fields":[
      {"name":"largeSize","type":{"type":"fixed","name":"F","size":4294967297,"logicalType":"decimal","precision":1}},
      {"name":"largePrecision","type":{"type":"fixed","name":"G","size":1,"logicalType":"decimal","precision":4294967297}}
    ]}"#,
    );
    let actual = derive_avro_fields(&schema, &[], &mut Context::ordinary()).unwrap();
    assert_eq!(
        actual
            .iter()
            .map(|field| field.scalar_type)
            .collect::<Vec<_>>(),
        vec![None, None]
    );
}

#[test]
fn additive_bun_controls_match_the_supplemental_frozen_observations() {
    let capture: Json = serde_json::from_str(include_str!(
        "../../../tests/rust-core/fixtures/r5-avro-fields/supplemental.json"
    ))
    .unwrap();
    assert_eq!(capture["observations"].as_array().unwrap().len(), 5);
    for observation in capture["observations"].as_array().unwrap() {
        let schema = tree(observation["source"].as_str().unwrap());
        let actual = derive_avro_fields(&schema, &[], &mut Context::ordinary()).unwrap();
        let expected = observation["fields"].as_array().unwrap();
        assert_eq!(actual.len(), expected.len(), "{}", observation["label"]);
        for (actual, expected) in actual.iter().zip(expected) {
            assert_eq!(actual.path.to_utf8().unwrap(), expected["path"]);
            assert_eq!(actual.record.to_utf8().unwrap(), expected["record"]);
            assert_eq!(actual.name.to_utf8().unwrap(), expected["element"]["name"]);
            assert_eq!(
                actual.scalar_type.map(AvroScalarType::as_str),
                expected["element"]["scalarType"].as_str(),
                "{}",
                observation["label"]
            );
        }
    }
}

#[test]
fn traversal_honors_cancellation_and_depth_budget() {
    let schema = tree(r#"{"type":"record","name":"R","fields":[{"name":"x","type":"int"}]}"#);
    let mut cancelled = || true;
    let mut context = Context::ordinary().with_cancellation(&mut cancelled);
    let error = derive_avro_fields(&schema, &[], &mut context).unwrap_err();
    assert_eq!(error.code.as_str(), "CANCELLED");

    let mut limits = umf_core::context::Limits::ordinary();
    limits.max_depth = 0;
    let mut context =
        Context::with_limits(umf_core::context::ResourceProfile::Cooperative, limits).unwrap();
    let error = derive_avro_fields(&schema, &[], &mut context).unwrap_err();
    assert_eq!(error.code.as_str(), "LIMIT");
}

#[test]
fn computed_dependency_element_ids_do_not_inherit_the_text_unit_ceiling() {
    let provider =
        tree(r#"{"type":"record","name":"Provider","fields":[{"name":"x","type":"int"}]}"#);
    let root = tree(r#"{"type":"record","name":"Root","fields":[]}"#);
    let dependency_id = Utf16::from("dependency-id-longer-than-the-text-limit");
    let dependencies = [AvroDependency {
        id: &dependency_id,
        root: &provider,
    }];
    let mut limits = umf_core::context::Limits::ordinary();
    limits.max_text_units = 16;
    let mut context =
        Context::with_limits(umf_core::context::ResourceProfile::Cooperative, limits).unwrap();
    let fields = derive_avro_fields(&root, &dependencies, &mut context).unwrap();
    assert_eq!(fields.len(), 1);
    assert_eq!(
        fields[0].element_id.to_utf8().unwrap(),
        "[\"dependency-id-longer-than-the-text-limit\",\"/fields/0\"]"
    );
}

#[test]
fn computed_dependency_ids_escape_json_strings_as_utf16() {
    let provider =
        tree(r#"{"type":"record","name":"Provider","fields":[{"name":"x","type":"int"}]}"#);
    let root = tree(r#"{"type":"record","name":"Root","fields":[]}"#);
    let dependency_id = Utf16::new(vec![b'a' as u16, 0x22, 0x5c, 0x0a, 0xd800]);
    let dependencies = [AvroDependency {
        id: &dependency_id,
        root: &provider,
    }];
    let fields = derive_avro_fields(&root, &dependencies, &mut Context::ordinary()).unwrap();
    assert_eq!(
        fields[0].element_id.to_utf8().unwrap(),
        r#"["a\"\\\n\ud800","/fields/0"]"#
    );
}

#[test]
fn repeated_large_named_declaration_lookups_are_metered() {
    let mut declaration = String::from(r#"{"type":"fixed","name":"F","namespace":"n","size":4"#);
    for index in 0..16 {
        declaration.push_str(&format!(",\"x{index}\":{index}"));
    }
    declaration.push('}');
    let provider = tree(&declaration);
    let root = tree(
        r#"{"type":"record","name":"Root","namespace":"n","fields":[{"name":"f","type":"F"}]}"#,
    );
    let dependency_id = Utf16::from("provider");
    let dependencies = [AvroDependency {
        id: &dependency_id,
        root: &provider,
    }];
    let mut meter = |amount: usize| {
        if amount == 240 {
            Err(umf_core::EngineError::new(
                "AVRO_MEMBER_SCAN_STOP",
                Utf16::default(),
                "stop on the logicalType member scan",
            ))
        } else {
            Ok(())
        }
    };
    let mut context = Context::ordinary().with_meter(&mut meter);
    let error = derive_avro_fields(&root, &dependencies, &mut context).unwrap_err();
    assert_eq!(error.code, "AVRO_MEMBER_SCAN_STOP");
}

fn tagged_tree(value: &Json) -> NativeJsonTree {
    NativeJsonTree::from_tagged_value(&to_umf(value), &mut Context::ordinary()).unwrap()
}

fn to_umf(value: &Json) -> Value {
    match value {
        Json::Null => Value::Null,
        Json::Bool(value) => Value::Bool(*value),
        Json::Number(value) => Value::Number(value.as_f64().expect("fixture number fits f64")),
        Json::String(value) => Value::String(Utf16::from(value.as_str())),
        Json::Array(items) => Value::Array(items.iter().map(to_umf).collect()),
        Json::Object(members) => Value::Object(
            members
                .iter()
                .map(|(key, value)| (Utf16::from(key.as_str()), to_umf(value)))
                .collect(),
        ),
    }
}

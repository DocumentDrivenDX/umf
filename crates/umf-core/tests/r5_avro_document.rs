// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    Context, Utf16, Value,
    avro_document::{AvroDependencySource, export_bundle, export_schema, get_node, import_schema},
    context::{Limits, ResourceProfile},
    native_json::NativeJsonNode,
};

const ROOT: &str = r#"{"type":"record","name":"Invoice","namespace":"billing","doc":"source-doc","aliases":["OldInvoice"],"x/y~z":{"retained":true},"fields":[{"name":"amount","type":{"type":"bytes","logicalType":"decimal","precision":8,"scale":2,"customFieldTag":{"x":1}}},{"name":"memo","type":["null","string"],"default":null},{"name":"count","type":"long","default":7}],"customTopTag":{"preserve":[1,"x"]}}"#;
const DEPENDENCY: &str = r#"{"type":"record","name":"Currency","namespace":"billing","fields":[{"name":"code","type":"string"}],"customDepTag":true}"#;

fn import() -> Value {
    let id = Utf16::from("invoice");
    let dependency_id = Utf16::from("currency.avsc");
    let root = u16s(ROOT);
    let dependency = u16s(DEPENDENCY);
    import_schema(
        &id,
        &root,
        &[AvroDependencySource {
            id: &dependency_id,
            schema_json: &dependency,
        }],
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn u16s(value: &str) -> Vec<u16> {
    value.encode_utf16().collect()
}
fn fields(value: &Value) -> &[(Utf16, Value)] {
    if let Value::Object(v) = value {
        v
    } else {
        panic!("expected object")
    }
}
fn field_mut<'a>(value: &'a mut Value, key: &str) -> &'a mut Value {
    let Value::Object(members) = value else {
        panic!("expected object")
    };
    members
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
        .unwrap()
}

#[test]
fn predecessor_fixture_roundtrips_ordered_dependencies_metadata_and_detached_source() {
    let mut document = import();
    let Value::Object(document_fields) = &mut document else {
        panic!("document object")
    };
    let vocabularies = document_fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("vocabularies"))
        .unwrap();
    let Value::Object(vocabularies) = &mut vocabularies.1 else {
        panic!("vocabularies object")
    };
    vocabularies.push((
        Utf16::from("example.future"),
        Value::Object(vec![(Utf16::from("version"), Value::string_utf8("7.0.0"))]),
    ));
    document_fields.push((
        Utf16::from("extensions"),
        Value::Object(vec![(
            Utf16::from("example.future"),
            Value::Object(vec![(
                Utf16::from("opaque"),
                Value::Array(vec![Value::string_utf8("keep-me"), Value::Number(7.0)]),
            )]),
        )]),
    ));
    let modules = document_fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("modules"))
        .unwrap();
    let Value::Array(modules) = &mut modules.1 else {
        panic!("modules array")
    };
    let field_module = modules
        .iter_mut()
        .find(|module| {
            fields(module).iter().any(|(key, value)| {
                key == &Utf16::from("id") && value == &Value::string_utf8("avro.fields")
            })
        })
        .unwrap();
    let Value::Array(field_elements) = field_mut(field_module, "elements") else {
        panic!("field elements")
    };
    let extension_map = field_mut(&mut field_elements[0], "extensions");
    let Value::Object(extension_map) = extension_map else {
        panic!("element extension map")
    };
    extension_map.push((
        Utf16::from("example.future"),
        Value::Object(vec![(
            Utf16::from("opaque"),
            Value::Array(vec![Value::string_utf8("keep-me"), Value::Number(7.0)]),
        )]),
    ));
    assert_eq!(
        export_schema(&document, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "AVRO_DEPENDENCIES_REQUIRED"
    );
    let mut bundle = export_bundle(&document, &mut Context::ordinary()).unwrap();
    assert_eq!(bundle.schema_json.to_utf8().unwrap(), format!("{ROOT}\n"));
    assert_eq!(bundle.dependencies.len(), 1);
    assert_eq!(bundle.dependencies[0].0, Utf16::from("currency.avsc"));
    assert_eq!(
        bundle.dependencies[0].1.to_utf8().unwrap(),
        format!("{DEPENDENCY}\n")
    );
    let frozen: serde_json::Value = serde_json::from_str(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-avro-full-predecessor/outcomes.json")).unwrap();
    let root = get_node(&document, &Utf16::default(), None, &mut Context::ordinary()).unwrap();
    let actual: serde_json::Value = serde_json::from_str(
        &root
            .render_tagged(&mut Context::ordinary())
            .unwrap()
            .to_utf8()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(actual, frozen["operations"]["import"]["extension"]["root"]);
    let dependency = get_node(
        &document,
        &Utf16::default(),
        Some(&Utf16::from("currency.avsc")),
        &mut Context::ordinary(),
    )
    .unwrap();
    let actual_dependency: serde_json::Value = serde_json::from_str(
        &dependency
            .render_tagged(&mut Context::ordinary())
            .unwrap()
            .to_utf8()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        actual_dependency,
        frozen["operations"]["import"]["extension"]["dependencies"][0]["root"]
    );
    let source_extensions = fields(&bundle.source)
        .iter()
        .find(|(key, _)| key == &Utf16::from("extensions"))
        .unwrap()
        .1
        .clone();
    assert!(matches!(source_extensions, Value::Object(_)));
    // The returned bundle source is independent of both its input and other
    // returned bundle fields.
    *field_mut(&mut bundle.source, "id") = Value::string_utf8("changed");
    assert_eq!(
        fields(&document)
            .iter()
            .find(|(key, _)| key == &Utf16::from("id"))
            .unwrap()
            .1,
        Value::string_utf8("invoice")
    );
    assert_eq!(bundle.schema_json.to_utf8().unwrap(), format!("{ROOT}\n"));
}

#[test]
fn recursive_dependency_inspection_and_exact_bundle_export_match_native_oracle_inputs() {
    let dependency_json = r#"{"type":"record","name":"Node","namespace":"n","fields":[{"name":"next","type":["null","Node"]}]}"#;
    let root_json = r#"{"type":"record","name":"Root","fields":[{"name":"node","type":"n.Node"}]}"#;
    let id = Utf16::from("root");
    let dependency_id = Utf16::from("node.avsc");
    let document = import_schema(
        &id,
        &u16s(root_json),
        &[AvroDependencySource { id: &dependency_id, schema_json: &u16s(dependency_json) }],
        &mut Context::ordinary(),
    ).unwrap();
    let bundle=export_bundle(&document,&mut Context::ordinary()).unwrap();
    assert_eq!(bundle.schema_json.to_utf8().unwrap(),format!("{root_json}\n"));
    assert_eq!(bundle.dependencies[0].1.to_utf8().unwrap(),format!("{dependency_json}\n"));
    let trees=import_schema(&id,&u16s(root_json),&[AvroDependencySource{id:&dependency_id,schema_json:&u16s(dependency_json)}],&mut Context::ordinary()).unwrap();
    let root_tree=get_node(&trees,&Utf16::default(),None,&mut Context::ordinary()).unwrap();
    let dependency_tree=get_node(&trees,&Utf16::default(),Some(&dependency_id),&mut Context::ordinary()).unwrap();
    let inspection=umf_core::avro_semantics::inspect_schema(&root_tree,&[umf_core::avro_semantics::Dependency{id:&dependency_id,tree:&dependency_tree}],&mut Context::ordinary()).unwrap();
    assert!(inspection.valid,"{:?}",inspection.diagnostics);
    assert!(!inspection.complete);
}

#[test]
fn copied_get_node_handles_escaped_members_and_dependency_roots() {
    let document = import();
    let escaped = get_node(
        &document,
        &Utf16::from("/x~1y~0z"),
        None,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(matches!(escaped.root(), NativeJsonNode::Object(_)));
    let dep_field = get_node(
        &document,
        &Utf16::from("/fields/0/type"),
        Some(&Utf16::from("currency.avsc")),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        matches!(dep_field.root(), NativeJsonNode::String(ref s) if s == &Utf16::from("string"))
    );
    assert_eq!(
        get_node(
            &document,
            &Utf16::from("/nope"),
            None,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "JSON_SCHEMA_POINTER"
    );
    assert_eq!(
        get_node(
            &document,
            &Utf16::default(),
            Some(&Utf16::from("missing")),
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "AVRO_DEPENDENCY_ID"
    );
    assert_eq!(
        get_node(
            &document,
            &Utf16::from("fields/0"),
            None,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "JSON_SCHEMA_POINTER"
    );
}

#[test]
fn unknown_tagged_representation_is_copied_but_refuses_native_export() {
    let mut document = import();
    let Value::Array(modules) = field_mut(&mut document, "modules") else {
        panic!("modules array")
    };
    let schema = modules
        .iter_mut()
        .find(|module| {
            fields(module)
                .iter()
                .any(|(k, v)| k == &Utf16::from("id") && v == &Value::string_utf8("schema"))
        })
        .unwrap();
    let Value::Array(elements) = field_mut(schema, "elements") else {
        panic!("elements array")
    };
    let extensions = field_mut(&mut elements[0], "extensions");
    let payload = field_mut(extensions, "umf.avro");
    let root = field_mut(payload, "root");
    let Value::Object(root_tagged) = root else {
        panic!("tagged root object")
    };
    root_tagged.push((
        Utf16::from("futureRepresentationField"),
        Value::string_utf8("retain"),
    ));

    assert!(
        get_node(&document, &Utf16::default(), None, &mut Context::ordinary())
            .unwrap()
            .has_representation_extras()
    );
    let error = export_bundle(&document, &mut Context::ordinary()).unwrap_err();
    assert_eq!(error.code, "AVRO_REPRESENTATION");

    let mut root_only = import_schema(
        &Utf16::from("root-only"),
        &u16s(ROOT),
        &[],
        &mut Context::ordinary(),
    )
    .unwrap();
    let Value::Array(modules) = field_mut(&mut root_only, "modules") else {
        panic!("modules array")
    };
    let schema = modules
        .iter_mut()
        .find(|module| {
            fields(module)
                .iter()
                .any(|(k, v)| k == &Utf16::from("id") && v == &Value::string_utf8("schema"))
        })
        .unwrap();
    let Value::Array(elements) = field_mut(schema, "elements") else {
        panic!("elements array")
    };
    let payload = field_mut(field_mut(&mut elements[0], "extensions"), "umf.avro");
    let Value::Object(root_tagged) = field_mut(payload, "root") else {
        panic!("tagged root object")
    };
    root_tagged.push((Utf16::from("unmapped"), Value::Bool(true)));
    assert_eq!(
        export_schema(&root_only, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "AVRO_REPRESENTATION"
    );
}

#[test]
fn exact_int64_source_token_survives_import_and_export() {
    let source = r#"{"type":"record","name":"ExactInvoice","fields":[{"name":"count","type":"long","default":9223372036854775807}]}"#;
    let document = import_schema(
        &Utf16::from("exact"),
        &u16s(source),
        &[],
        &mut Context::ordinary(),
    )
    .unwrap();
    let exported = export_schema(&document, &mut Context::ordinary())
        .unwrap()
        .to_utf8()
        .unwrap();
    assert!(exported.contains("9223372036854775807"));
    let default = get_node(
        &document,
        &Utf16::from("/fields/0/default"),
        None,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        matches!(default.root(), NativeJsonNode::Number(token) if token == "9223372036854775807")
    );
}

#[test]
fn duplicate_dependency_ids_are_rejected_without_reordering_sources() {
    let id = Utf16::from("duplicate");
    let dependency_id = Utf16::from("same".repeat(512));
    let schema = u16s(r#""string""#);
    let dependencies = [
        AvroDependencySource {
            id: &dependency_id,
            schema_json: &schema,
        },
        AvroDependencySource {
            id: &dependency_id,
            schema_json: &schema,
        },
    ];
    let root = u16s(r#""long""#);
    let mut meter_calls = Vec::new();
    let mut meter = |amount| {
        meter_calls.push(amount);
        Ok(())
    };
    let mut context = Context::ordinary().with_meter(&mut meter);
    let error = import_schema(&id, &root, &dependencies, &mut context).unwrap_err();
    assert_eq!(error.code, "AVRO_DEPENDENCY_ID");
    drop(context);
    assert!(meter_calls.contains(&(dependency_id.len() * 2 + 1)));
}

#[test]
fn duplicate_dependency_ids_in_document_are_metered() {
    let root_id = Utf16::from("root");
    let first_id = Utf16::from("first".repeat(256));
    let second_id = Utf16::from("second".repeat(256));
    let schema = u16s(r#""string""#);
    let root = u16s(r#""long""#);
    let mut document = import_schema(
        &root_id,
        &root,
        &[
            AvroDependencySource {
                id: &first_id,
                schema_json: &schema,
            },
            AvroDependencySource {
                id: &second_id,
                schema_json: &schema,
            },
        ],
        &mut Context::ordinary(),
    )
    .unwrap();
    let Value::Array(modules) = field_mut(&mut document, "modules") else {
        panic!("modules array")
    };
    let schema_module = modules
        .iter_mut()
        .find(|module| {
            fields(module).iter().any(|(key, value)| {
                key == &Utf16::from("id") && value == &Value::string_utf8("schema")
            })
        })
        .unwrap();
    let Value::Array(elements) = field_mut(schema_module, "elements") else {
        panic!("elements array")
    };
    let payload = field_mut(field_mut(&mut elements[0], "extensions"), "umf.avro");
    let Value::Array(dependencies) = field_mut(payload, "dependencies") else {
        panic!("dependencies array")
    };
    *field_mut(&mut dependencies[1], "id") = Value::String(first_id.clone());

    let mut meter_calls = Vec::new();
    let mut meter = |amount| {
        meter_calls.push(amount);
        Ok(())
    };
    let mut context = Context::ordinary().with_meter(&mut meter);
    let error = export_bundle(&document, &mut context).unwrap_err();
    assert_eq!(error.code, "AVRO_DEPENDENCY_ID");
    drop(context);
    assert!(meter_calls.contains(&(first_id.len() * 2 + 1)));
}

#[test]
fn core_envelope_errors_and_stale_materialized_fields_are_rejected() {
    let mut empty_id = import_schema(
        &Utf16::from("invoice"),
        &u16s(ROOT),
        &[],
        &mut Context::ordinary(),
    )
    .unwrap();
    *field_mut(&mut empty_id, "id") = Value::string_utf8("");
    assert_eq!(
        export_schema(&empty_id, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "AVRO_DOCUMENT"
    );

    let mut missing_umf = import_schema(
        &Utf16::from("invoice"),
        &u16s(ROOT),
        &[],
        &mut Context::ordinary(),
    )
    .unwrap();
    let Value::Object(document_members) = &mut missing_umf else {
        panic!("document object")
    };
    document_members.retain(|(key, _)| key != &Utf16::from("umf"));
    assert_eq!(
        export_schema(&missing_umf, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "AVRO_DOCUMENT"
    );

    let mut stale = import_schema(
        &Utf16::from("invoice"),
        &u16s(ROOT),
        &[],
        &mut Context::ordinary(),
    )
    .unwrap();
    let Value::Array(modules) = field_mut(&mut stale, "modules") else {
        panic!("modules array")
    };
    let field_module = modules
        .iter_mut()
        .find(|module| {
            fields(module).iter().any(|(key, value)| {
                key == &Utf16::from("id") && value == &Value::string_utf8("avro.fields")
            })
        })
        .unwrap();
    let Value::Array(elements) = field_mut(field_module, "elements") else {
        panic!("field elements")
    };
    *field_mut(&mut elements[0], "name") = Value::string_utf8("stale");
    assert_eq!(
        export_schema(&stale, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "AVRO_FIELD_METADATA"
    );
}

#[test]
fn controls_and_limits_are_observed_during_import_and_export() {
    let mut cancelled = || true;
    let error = import_schema(
        &Utf16::from("invoice"),
        &u16s(ROOT),
        &[],
        &mut Context::ordinary().with_cancellation(&mut cancelled),
    )
    .unwrap_err();
    assert_eq!(error.code, "CANCELLED");
    assert!(error.is_control_failure());

    let mut ticks = 0usize;
    let mut clock = || {
        ticks += 1;
        Some(100)
    };
    let error = import_schema(
        &Utf16::from("invoice"),
        &u16s(ROOT),
        &[],
        &mut Context::ordinary().with_clock(&mut clock, 0),
    )
    .unwrap_err();
    assert_eq!(error.code, "DEADLINE");
    assert!(error.is_control_failure());

    let tiny = Limits {
        max_text_units: 3,
        ..Limits::ordinary()
    };
    let mut context = Context::with_limits(ResourceProfile::Cooperative, tiny).unwrap();
    let error = import_schema(&Utf16::from("invoice"), &u16s(ROOT), &[], &mut context).unwrap_err();
    assert_eq!(error.code, "LIMIT");
}

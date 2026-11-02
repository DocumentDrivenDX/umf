// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    avro_document::{self, AvroDependencySource},
    native_json::NativeJsonTree,
    value::{Utf16, Value},
    Context,
};

fn imported(root: &str) -> Value {
    avro_document::import_schema(
        &Utf16::from("candidate-test"),
        &root.encode_utf16().collect::<Vec<_>>(),
        &[],
        &mut Context::ordinary(),
    )
    .expect("schema imports as an admitted UMF document")
}

fn field<'a>(value: &'a Value, name: &str) -> &'a Value {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value)
            .expect("required field"),
        _ => panic!("expected object"),
    }
}

fn field_mut<'a>(value: &'a mut Value, name: &str) -> &'a mut Value {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value)
            .expect("required field"),
        _ => panic!("expected object"),
    }
}

fn text(value: &Value) -> &Utf16 {
    match value {
        Value::String(value) => value,
        _ => panic!("expected string"),
    }
}

fn units(value: &str) -> Vec<u16> {
    value.encode_utf16().collect()
}

fn report(document: &Value, path: &str, replacement: &str, dependency: Option<&str>) -> Value {
    avro_document::propose_avro_node_edit(
        document,
        &Utf16::from(path),
        &replacement.encode_utf16().collect::<Vec<_>>(),
        dependency.map(Utf16::from).as_ref(),
        &mut Context::ordinary(),
    )
    .expect("candidate edit should complete")
}

fn avro_payload(document: &Value) -> &Value {
    let modules = match field(document, "modules") {
        Value::Array(items) => items,
        _ => panic!("modules"),
    };
    let elements = match field(&modules[0], "elements") {
        Value::Array(items) => items,
        _ => panic!("elements"),
    };
    field(field(&elements[0], "extensions"), "umf.avro")
}

fn avro_payload_mut(document: &mut Value) -> &mut Value {
    let modules = match field_mut(document, "modules") {
        Value::Array(items) => items,
        _ => panic!("modules"),
    };
    let elements = match field_mut(&mut modules[0], "elements") {
        Value::Array(items) => items,
        _ => panic!("elements"),
    };
    field_mut(field_mut(&mut elements[0], "extensions"), "umf.avro")
}

fn field_metadata_element_mut(document: &mut Value) -> &mut Value {
    let modules = match field_mut(document, "modules") {
        Value::Array(items) => items,
        _ => panic!("modules"),
    };
    let elements = match field_mut(&mut modules[1], "elements") {
        Value::Array(items) => items,
        _ => panic!("metadata module"),
    };
    &mut elements[0]
}

fn avro_root_tagged_mut(document: &mut Value) -> &mut Value {
    let modules = match field_mut(document, "modules") {
        Value::Array(items) => items,
        _ => panic!("modules"),
    };
    let elements = match field_mut(&mut modules[0], "elements") {
        Value::Array(items) => items,
        _ => panic!("elements"),
    };
    field_mut(
        field_mut(field_mut(&mut elements[0], "extensions"), "umf.avro"),
        "root",
    )
}

fn native_json(tagged: &Value) -> String {
    NativeJsonTree::from_tagged_value(tagged, &mut Context::ordinary())
        .unwrap()
        .render_compact(&mut Context::ordinary())
        .unwrap()
        .to_utf8()
        .unwrap()
}

#[test]
fn report_separates_admission_from_native_inspection_and_preserves_exact_tokens() {
    let source = imported(
        r#"{"type":"record","name":"R","fields":[{"name":"count","type":"long","default":0}]}"#,
    );
    let result = report(&source, "/fields/0/default", "9223372036854775807", None);
    assert_eq!(
        text(field(&result, "profile")),
        &Utf16::from("umf-r5-avro-candidate/0.1.0")
    );
    assert_eq!(text(field(&result, "status")), &Utf16::from("candidate"));
    let members = match &result {
        Value::Object(members) => members
            .iter()
            .map(|(key, _)| key.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        _ => panic!("report must be an object"),
    };
    assert_eq!(
        members,
        [
            "profile",
            "status",
            "source",
            "document",
            "edit",
            "admission",
            "nativeInspection"
        ]
    );

    let replacement = field(field(&result, "edit"), "replacement");
    assert_eq!(text(field(replacement, "kind")), &Utf16::from("number"));
    assert_eq!(
        text(field(replacement, "value")),
        &Utf16::from("9223372036854775807")
    );
    let admission = field(&result, "admission");
    for side in ["source", "candidate"] {
        assert!(matches!(
            field(field(admission, side), "valid"),
            Value::Bool(true)
        ));
        assert!(matches!(
            field(field(admission, side), "complete"),
            Value::Bool(true)
        ));
    }
    let inspection = field(&result, "nativeInspection");
    assert!(matches!(
        field(field(inspection, "source"), "complete"),
        Value::Bool(false)
    ));
    assert!(matches!(
        field(field(inspection, "candidate"), "complete"),
        Value::Bool(false)
    ));

    let mut isolated = result.clone();
    *field_mut(field_mut(&mut isolated, "document"), "id") = Value::string_utf8("changed");
    assert_eq!(
        text(field(field(&isolated, "source"), "id")),
        &Utf16::from("candidate-test")
    );
    assert_eq!(text(field(&source, "id")), &Utf16::from("candidate-test"));
    assert_eq!(
        text(field(field(&result, "document"), "id")),
        &Utf16::from("candidate-test")
    );
    assert_ne!(field(&result, "source"), field(&result, "document"));
}

#[test]
fn root_edit_preserves_explicit_empty_dependencies_member_and_order() {
    let mut source = imported(
        r#"{"type":"record","name":"R","doc":"before","fields":[{"name":"value","type":"string"}]}"#,
    );
    let payload = avro_payload_mut(&mut source);
    let payload_fields = match payload {
        Value::Object(fields) => fields,
        _ => panic!("payload"),
    };
    payload_fields.push((Utf16::from("dependencies"), Value::Array(Vec::new())));
    let source_member_order = payload_fields
        .iter()
        .map(|(key, _)| key.clone())
        .collect::<Vec<_>>();

    let result = report(&source, "/doc", r#""after""#, None);
    let candidate_payload = avro_payload(field(&result, "document"));
    assert!(
        matches!(field(candidate_payload, "dependencies"), Value::Array(items) if items.is_empty())
    );
    let candidate_member_order = match candidate_payload {
        Value::Object(fields) => fields
            .iter()
            .map(|(key, _)| key.clone())
            .collect::<Vec<_>>(),
        _ => panic!("payload"),
    };
    assert_eq!(candidate_member_order, source_member_order);
    assert!(matches!(
        field(avro_payload(field(&result, "source")), "dependencies"),
        Value::Array(items) if items.is_empty()
    ));
}

#[test]
fn root_and_dependency_edits_preserve_dependency_object_member_order() {
    let dependency_id = Utf16::from("money.avsc");
    let root_json = units(
        r#"{"type":"record","name":"R","doc":"before","fields":[{"name":"amount","type":"money.Amount"}]}"#,
    );
    let dependency_json = units(
        r#"{"type":"fixed","name":"money.Amount","size":4,"logicalType":"decimal","precision":8,"scale":2}"#,
    );
    let mut source = avro_document::import_schema(
        &Utf16::from("dependency-order"),
        &root_json,
        &[AvroDependencySource {
            id: &dependency_id,
            schema_json: &dependency_json,
        }],
        &mut Context::ordinary(),
    )
    .unwrap();
    let dependencies = field_mut(avro_payload_mut(&mut source), "dependencies");
    let dependencies = match dependencies {
        Value::Array(items) => items,
        _ => panic!("dependencies"),
    };
    let dependency = match &mut dependencies[0] {
        Value::Object(fields) => fields,
        _ => panic!("dependency"),
    };
    dependency.swap(0, 1);
    let source_order = dependency
        .iter()
        .map(|(key, _)| key.clone())
        .collect::<Vec<_>>();
    assert_eq!(source_order, [Utf16::from("root"), Utf16::from("id")]);

    let root_edit = report(&source, "/doc", r#""after""#, None);
    let root_dependencies = match field(avro_payload(field(&root_edit, "document")), "dependencies")
    {
        Value::Array(items) => items,
        _ => panic!("dependencies"),
    };
    let root_order = match &root_dependencies[0] {
        Value::Object(fields) => fields
            .iter()
            .map(|(key, _)| key.clone())
            .collect::<Vec<_>>(),
        _ => panic!("dependency"),
    };
    assert_eq!(root_order, source_order);

    let dependency_edit = report(&source, "/scale", "3", Some("money.avsc"));
    let edited_dependencies = match field(
        avro_payload(field(&dependency_edit, "document")),
        "dependencies",
    ) {
        Value::Array(items) => items,
        _ => panic!("dependencies"),
    };
    let dependency_order = match &edited_dependencies[0] {
        Value::Object(fields) => fields
            .iter()
            .map(|(key, _)| key.clone())
            .collect::<Vec<_>>(),
        _ => panic!("dependency"),
    };
    assert_eq!(dependency_order, source_order);
}

#[test]
fn admitted_candidate_is_returned_with_native_inspector_errors_separate() {
    let source =
        imported(r#"{"type":"record","name":"R","fields":[{"name":"value","type":"string"}]}"#);
    let result = report(&source, "/fields/0/type", r#""MissingName""#, None);
    assert!(matches!(
        field(field(&result, "admission"), "candidate"),
        Value::Object(_)
    ));
    assert!(matches!(
        field(
            field(field(&result, "nativeInspection"), "candidate"),
            "valid"
        ),
        Value::Bool(false)
    ));
}

#[test]
fn five_authored_candidate_shapes_retain_native_json_and_dependency_identity() {
    let source = imported(
        r#"{"type":"record","name":"Invoice","fields":[{"name":"amount","type":{"type":"bytes","logicalType":"decimal","precision":8,"scale":2}},{"name":"created","type":{"type":"long","logicalType":"timestamp-micros"}},{"name":"count","type":"long","default":0}]}"#,
    );
    let cases = [
        ("/fields/0/type/scale", "3", "\"scale\":3"),
        (
            "/fields/1/type/logicalType",
            "\"local-timestamp-micros\"",
            "local-timestamp-micros",
        ),
        (
            "/fields/1/type/logicalType",
            "\"timestamp-micros\\n\"",
            "timestamp-micros\\n",
        ),
        (
            "/fields/2/default",
            "9223372036854775807",
            "9223372036854775807",
        ),
    ];
    for (path, replacement, expected) in cases {
        let result = report(&source, path, replacement, None);
        let source_tree = NativeJsonTree::from_tagged_value(
            field(avro_payload(&source), "root"),
            &mut Context::ordinary(),
        )
        .unwrap();
        let replacement_tree = NativeJsonTree::parse_json(
            &replacement.encode_utf16().collect::<Vec<_>>(),
            &mut Context::ordinary(),
        )
        .unwrap();
        let expected_tree = source_tree
            .replace_node(
                &Utf16::from(path),
                &replacement_tree,
                &mut Context::ordinary(),
            )
            .unwrap();
        let actual_tree = NativeJsonTree::from_tagged_value(
            field(avro_payload(field(&result, "document")), "root"),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(actual_tree, expected_tree, "tagged tree mismatch at {path}");
        assert!(
            native_json(field(avro_payload(field(&result, "document")), "root")).contains(expected)
        );
        assert!(
            !native_json(field(avro_payload(&source), "root")).contains(expected)
                || path == "/fields/1/type/logicalType"
        );
    }

    let dependency_id = Utf16::from("money.avsc");
    let root_json =
        units(r#"{"type":"record","name":"R","fields":[{"name":"amount","type":"money.Amount"}]}"#);
    let dependency_json = units(
        r#"{"type":"fixed","name":"money.Amount","size":4,"logicalType":"decimal","precision":8,"scale":2}"#,
    );
    let dependent = avro_document::import_schema(
        &Utf16::from("dependent"),
        &root_json,
        &[AvroDependencySource {
            id: &dependency_id,
            schema_json: &dependency_json,
        }],
        &mut Context::ordinary(),
    )
    .unwrap();
    let result = report(&dependent, "/scale", "3", Some("money.avsc"));
    let deps = match field(avro_payload(field(&result, "document")), "dependencies") {
        Value::Array(items) => items,
        _ => panic!("dependencies"),
    };
    let root = field(&deps[0], "root");
    assert!(native_json(root).contains("\"scale\":3"));
    let original_deps = match field(avro_payload(&dependent), "dependencies") {
        Value::Array(items) => items,
        _ => panic!("dependencies"),
    };
    assert!(native_json(field(&original_deps[0], "root")).contains("\"scale\":2"));
}

#[test]
fn unknown_representation_in_any_dependency_refuses_before_pointer_or_replacement() {
    let dependency_id = Utf16::from("provider.json");
    let root_json = units(r#"{"type":"record","name":"R","fields":[]}"#);
    let dependency_json = units(r#"{"type":"fixed","name":"F","size":4}"#);
    let mut document = avro_document::import_schema(
        &Utf16::from("dependency-test"),
        &root_json,
        &[AvroDependencySource {
            id: &dependency_id,
            schema_json: &dependency_json,
        }],
        &mut Context::ordinary(),
    )
    .unwrap();
    let modules = field_mut(&mut document, "modules");
    let modules = match modules {
        Value::Array(items) => items,
        _ => panic!("modules"),
    };
    let schema_element = match field_mut(&mut modules[0], "elements") {
        Value::Array(elements) => &mut elements[0],
        _ => panic!("schema module"),
    };
    let payload = field_mut(field_mut(schema_element, "extensions"), "umf.avro");
    let dependencies = field_mut(payload, "dependencies");
    let dependency = match dependencies {
        Value::Array(items) => &mut items[0],
        _ => panic!("dependencies"),
    };
    let dep_root = field_mut(dependency, "root");
    match dep_root {
        Value::Object(fields) => fields.push((
            Utf16::from("futureRepresentation"),
            Value::string_utf8("opaque"),
        )),
        _ => panic!("tagged object root"),
    }

    let error = avro_document::propose_avro_node_edit(
        &document,
        &Utf16::from("not-a-pointer"),
        &[b'{' as u16],
        None,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(
        error.code,
        "AVRO_REPRESENTATION",
        "path={}, message={}",
        error.path.to_utf8().unwrap(),
        error.message.to_utf8().unwrap()
    );
}

#[test]
fn refusal_order_checks_pointer_then_replacement_then_dependency_and_target() {
    let source =
        imported(r#"{"type":"record","name":"R","fields":[{"name":"value","type":"string"}]}"#);
    let pointer_first = avro_document::propose_avro_node_edit(
        &source,
        &Utf16::from("bad-pointer"),
        &[b'{' as u16],
        None,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(pointer_first.code, "JSON_SCHEMA_POINTER");

    let replacement_first = avro_document::propose_avro_node_edit(
        &source,
        &Utf16::from("/missing"),
        &[b'{' as u16],
        Some(&Utf16::from("absent")),
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_ne!(replacement_first.code, "AVRO_DEPENDENCY_ID");

    let unknown_dependency = avro_document::propose_avro_node_edit(
        &source,
        &Utf16::from("/missing"),
        &units("null"),
        Some(&Utf16::from("absent")),
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(unknown_dependency.code, "AVRO_DEPENDENCY_ID");

    let missing_target = avro_document::propose_avro_node_edit(
        &source,
        &Utf16::from("/missing"),
        &units("null"),
        None,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_ne!(missing_target.code, "AVRO_DEPENDENCY_ID");
}

#[test]
fn stale_projection_precedes_representation_and_invalid_pointer() {
    let mut source =
        imported(r#"{"type":"record","name":"R","fields":[{"name":"value","type":"string"}]}"#);
    let metadata = field_metadata_element_mut(&mut source);
    let metadata = match metadata {
        Value::Object(items) => items,
        _ => panic!("field metadata"),
    };
    if let Some((_, scalar)) = metadata
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("scalarType"))
    {
        *scalar = Value::string_utf8("decimal");
    } else {
        metadata.push((Utf16::from("scalarType"), Value::string_utf8("decimal")));
    }
    let root = avro_root_tagged_mut(&mut source);
    match root {
        Value::Object(fields) => fields.push((
            Utf16::from("futureRepresentation"),
            Value::string_utf8("preserve"),
        )),
        _ => panic!("tagged object root"),
    }
    let error = avro_document::propose_avro_node_edit(
        &source,
        &Utf16::from("not-a-pointer"),
        &[b'{' as u16],
        None,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(
        error.code,
        "AVRO_FIELD_METADATA",
        "path={}, message={}",
        error.path.to_utf8().unwrap(),
        error.message.to_utf8().unwrap()
    );
}

#[test]
fn field_rename_and_removal_refuse_to_detach_attached_core_metadata() {
    let mut source =
        imported(r#"{"type":"record","name":"R","fields":[{"name":"value","type":"string"}]}"#);
    let metadata = field_metadata_element_mut(&mut source);
    let metadata = match metadata {
        Value::Object(items) => items,
        _ => panic!("field metadata"),
    };
    let extensions = match &mut metadata
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("extensions"))
        .unwrap()
        .1
    {
        Value::Object(items) => items,
        _ => panic!("extensions"),
    };
    extensions.push((
        Utf16::from("umf.avro"),
        Value::Object(vec![
            (Utf16::from("version"), Value::string_utf8("1.12.0")),
            (
                Utf16::from("root"),
                Value::Object(vec![
                    (Utf16::from("kind"), Value::string_utf8("string")),
                    (Utf16::from("value"), Value::string_utf8("attached")),
                ]),
            ),
        ]),
    ));

    let renamed = avro_document::propose_avro_node_edit(
        &source,
        &Utf16::from("/fields/0/name"),
        &units(r#""renamed""#),
        None,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(renamed.code, "AVRO_FIELD_METADATA");

    let removed = avro_document::propose_avro_node_edit(
        &source,
        &Utf16::from("/fields"),
        &units("[]"),
        None,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(removed.code, "AVRO_FIELD_METADATA");
}

// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::graphql_binding::{execute_wire, PROFILE};

fn object(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}

fn call(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    let mut request = vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    request.extend(fields.into_iter().map(|(k, v)| (Utf16::from(k), v)));
    let wire = umf_core_wire::encode(&Value::Object(request), &mut Context::ordinary()).unwrap();
    let envelope: Json = serde_json::from_str(&execute_wire(&wire)).unwrap();
    assert_eq!(envelope["status"], "ok", "{op}: {envelope}");
    umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}

fn request_wire(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> String {
    let mut request = vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    request.extend(fields.into_iter().map(|(k, v)| (Utf16::from(k), v)));
    umf_core_wire::encode(&Value::Object(request), &mut Context::ordinary()).unwrap()
}

fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(name))
        .map(|(_, v)| v)
        .unwrap()
}

#[test]
fn graphql_wire_import_inspect_export_ast_and_atomic_edit_preserve_metadata() {
    let source = "type Query { old: String }\n";
    let document = call(
        "graphql.import",
        [
            ("source", Value::string_utf8(source)),
            ("id", Value::string_utf8("wire-schema")),
        ],
    );
    let document = add_title(document, Value::String(Utf16::new(vec![0xd800])));
    let report = call("graphql.validate", [("document", document.clone())]);
    assert_eq!(member(&report, "valid"), &Value::Bool(true));
    assert_eq!(
        call("graphql.export", [("document", document.clone())]),
        Value::string_utf8(source)
    );
    let ast = call("graphql.getAst", [("document", document.clone())]);
    let edited_ast = umf_core::copy_json(&ast, &mut Context::ordinary()).unwrap();
    let edited_ast = replace_query_field_name(edited_ast, "new");
    let edited = call(
        "graphql.editAst",
        [("document", document.clone()), ("candidateAst", edited_ast)],
    );
    assert_eq!(member(&edited, "id"), member(&document, "id"));
    assert_eq!(member(&edited, "umf"), member(&document, "umf"));
    assert_eq!(
        member(&edited, "vocabularies"),
        member(&document, "vocabularies")
    );
    assert_eq!(member(&edited, "title"), member(&document, "title"));
    let Value::Array(modules) = member(&edited, "modules") else {
        panic!("modules")
    };
    assert_eq!(modules.len(), 1);
    assert_eq!(member(&modules[0], "id"), &Value::string_utf8("schema"));
    assert_eq!(
        call("graphql.export", [("document", edited)]),
        Value::string_utf8("type Query {\n  new: String\n}\n")
    );
    let bundle = call("graphql.exportBundle", [("document", document)]);
    assert_eq!(member(&bundle, "schema"), &Value::string_utf8(source));
    assert!(matches!(member(&bundle, "source"), Value::Object(_)));
}

#[test]
fn graphql_payload_inspector_uses_the_native_extension_semantics() {
    let document = call(
        "graphql.import",
        [
            ("source", Value::string_utf8("type Query { hello: String }")),
            ("id", Value::string_utf8("payload-inspection")),
        ],
    );
    let Value::Array(modules) = member(&document, "modules") else {
        panic!("modules array")
    };
    let Value::Array(elements) = member(&modules[0], "elements") else {
        panic!("elements array")
    };
    let element = &elements[0];
    let payload = member(member(element, "extensions"), "umf.graphql").clone();
    let diagnostics = call("graphql.inspectPayload", [("payload", payload)]);
    assert_eq!(diagnostics, Value::Array(Vec::new()));
}

fn add_title(mut document: Value, title: Value) -> Value {
    let Value::Object(fields) = &mut document else {
        panic!("document object")
    };
    fields.push((Utf16::from("title"), title));
    document
}

fn replace_query_field_name(mut ast: Value, replacement: &str) -> Value {
    fn set_member(value: &mut Value, key: &str, new_value: Value) {
        let Value::Object(fields) = value else {
            panic!("object")
        };
        fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from(key))
            .unwrap()
            .1 = new_value;
    }
    let Value::Object(root) = &mut ast else {
        panic!("AST object")
    };
    let definitions = root
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("definitions"))
        .unwrap();
    let Value::Array(definitions) = &mut definitions.1 else {
        panic!("definitions")
    };
    let Value::Object(definition) = &mut definitions[0] else {
        panic!("definition")
    };
    let fields = definition
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("fields"))
        .unwrap();
    let Value::Array(fields) = &mut fields.1 else {
        panic!("fields")
    };
    let Value::Object(field) = &mut fields[0] else {
        panic!("field")
    };
    let name = field
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("name"))
        .unwrap();
    set_member(&mut name.1, "value", Value::string_utf8(replacement));
    ast
}

#[test]
fn graphql_wire_rejects_unknown_duplicate_and_malformed_utf16_fields() {
    let source = Value::String(Utf16::new(vec![0xD800]));
    let mut request = vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("op"), Value::string_utf8("graphql.import")),
        (Utf16::from("source"), source),
        (Utf16::from("id"), Value::string_utf8("bad")),
    ];
    let wire =
        umf_core_wire::encode(&Value::Object(request.clone()), &mut Context::ordinary()).unwrap();
    let envelope: Json = serde_json::from_str(&execute_wire(&wire)).unwrap();
    assert_eq!(envelope["status"], "error");
    request.push((Utf16::from("extra"), Value::Null));
    let wire = umf_core_wire::encode(&Value::Object(request), &mut Context::ordinary()).unwrap();
    let envelope: Json = serde_json::from_str(&execute_wire(&wire)).unwrap();
    assert_eq!(envelope["code"], "REQUEST");
    let unknown = request_wire(
        "graphql.import",
        [
            ("source", Value::string_utf8("type Query { x: String }")),
            ("id", Value::string_utf8("valid")),
            ("future", Value::Null),
        ],
    );
    let envelope: Json = serde_json::from_str(&execute_wire(&unknown)).unwrap();
    assert_eq!(envelope["code"], "REQUEST");
    let wire = request_wire(
        "graphql.import",
        [
            ("source", Value::string_utf8("type Query { x: String }")),
            ("id", Value::string_utf8("valid")),
        ],
    );
    let mut tagged: Json = serde_json::from_str(&wire).unwrap();
    let members = tagged["members"].as_array_mut().unwrap();
    let id = members
        .iter()
        .find(|entry| entry["key"] == serde_json::json!([105, 100]))
        .unwrap()
        .clone();
    members.push(id);
    let wire = serde_json::to_string(&tagged).unwrap();
    let envelope: Json = serde_json::from_str(&execute_wire(&wire)).unwrap();
    assert_eq!(envelope["code"], "DUPLICATE_KEY");
}

#[test]
fn graphql_wire_charges_controls_and_rejects_invalid_candidates_atomically() {
    let document = call(
        "graphql.import",
        [
            ("source", Value::string_utf8("type Query { x: String }")),
            ("id", Value::string_utf8("atomic")),
        ],
    );
    let original = call("graphql.export", [("document", document.clone())]);
    let invalid = request_wire(
        "graphql.editAst",
        [("document", document.clone()), ("candidateAst", object([]))],
    );
    let envelope: Json = serde_json::from_str(&execute_wire(&invalid)).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(
        call("graphql.export", [("document", document.clone())]),
        original
    );

    let wire = request_wire(
        "graphql.import",
        [
            ("source", Value::string_utf8("type Query { x: String }")),
            ("id", Value::string_utf8("control")),
        ],
    );
    let mut control = |_| {
        Err(umf_core::EngineError::new(
            "TEST_CONTROL",
            Utf16::default(),
            "denied",
        ))
    };
    let envelope: Json = serde_json::from_str(
        &umf_core_wire::graphql_binding::execute_wire_with_control(&wire, &mut control),
    )
    .unwrap();
    assert_eq!(envelope["code"], "TEST_CONTROL");
}

#[test]
fn graphql_host_callback_edits_inside_validation_and_refuses_before_calling() {
    let document = call(
        "graphql.import",
        [
            ("source", Value::string_utf8("type Query { old: String }")),
            ("id", Value::string_utf8("host-edit")),
        ],
    );
    let request = request_wire("graphql.editAstHost", [("document", document.clone())]);
    let mut invoked = false;
    let mut editor = |ast: &mut Value, _ctx: &mut Context<'_>| {
        invoked = true;
        *ast = replace_query_field_name(ast.clone(), "hostEdited");
        Ok(())
    };
    let mut control = |_| Ok(());
    let envelope: Json = serde_json::from_str(
        &umf_core_wire::graphql_binding::execute_wire_with_editor(
            &request,
            &mut editor,
            &mut control,
        ),
    )
    .unwrap();
    assert!(invoked);
    assert_eq!(envelope["status"], "ok");
    let edited = umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        call("graphql.export", [("document", edited)]),
        Value::string_utf8("type Query {\n  hostEdited: String\n}\n")
    );

    let fragment = call(
        "graphql.import",
        [
            (
                "source",
                Value::string_utf8("extend type Query { next: Product }"),
            ),
            ("id", Value::string_utf8("host-fragment")),
            ("mode", Value::string_utf8("fragment")),
        ],
    );
    let request = request_wire("graphql.editAstHost", [("document", fragment)]);
    let mut invoked = false;
    let mut editor = |_: &mut Value, _: &mut Context<'_>| {
        invoked = true;
        Ok(())
    };
    let mut control = |_| Ok(());
    let envelope: Json = serde_json::from_str(
        &umf_core_wire::graphql_binding::execute_wire_with_editor(
            &request,
            &mut editor,
            &mut control,
        ),
    )
    .unwrap();
    assert_eq!(envelope["status"], "error");
    assert!(!invoked, "prevalidation must refuse before the host callback");
}

#[test]
fn graphql_host_callback_error_returns_without_mutating_original_document() {
    let document = call(
        "graphql.import",
        [
            ("source", Value::string_utf8("type Query { old: String }")),
            ("id", Value::string_utf8("host-throw")),
        ],
    );
    let original = call("graphql.export", [("document", document.clone())]);
    let request = request_wire("graphql.editAstHost", [("document", document.clone())]);
    let mut editor = |_: &mut Value, _: &mut Context<'_>| {
        Err(umf_core::EngineError::new(
            "HOST_CALLBACK",
            Utf16::default(),
            "host exception",
        ))
    };
    let mut control = |_| Ok(());
    let envelope: Json = serde_json::from_str(
        &umf_core_wire::graphql_binding::execute_wire_with_editor(
            &request,
            &mut editor,
            &mut control,
        ),
    )
    .unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "HOST_CALLBACK");
    assert_eq!(
        call("graphql.export", [("document", document)]),
        original
    );
}

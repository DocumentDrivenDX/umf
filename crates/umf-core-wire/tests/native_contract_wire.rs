// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::native_contract_binding::{
    execute_linkml_wire, execute_odcs_wire, PROFILE,
};

fn request_wire(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> String {
    let mut request = vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    request.extend(fields.into_iter().map(|(key, value)| (Utf16::from(key), value)));
    umf_core_wire::encode(&Value::Object(request), &mut Context::ordinary()).unwrap()
}

fn call(execute: fn(&str) -> String, op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    let wire = request_wire(op, fields);
    let envelope: Json = serde_json::from_str(&execute(&wire)).unwrap();
    assert_eq!(envelope["status"], "ok", "{op}: {envelope}");
    umf_core_wire::decode(
        envelope["wire"].as_str().unwrap(),
        &mut Context::ordinary(),
    )
    .unwrap()
}

#[test]
fn linkml_yaml_import_and_export_preserve_the_exact_source_archive() {
    let source = "id: schema\nname: schema\nmetamodel_version: 1.11.0\nfuture: 123456789012345678901234567890\n";
    let document = call(
        execute_linkml_wire,
        "linkml.import",
        [
            ("source", Value::string_utf8(source)),
            ("id", Value::string_utf8("linkml-wire")),
            ("format", Value::string_utf8("yaml")),
        ],
    );
    let exported = call(
        execute_linkml_wire,
        "linkml.export",
        [("document", document)],
    );
    assert_eq!(exported, Value::string_utf8(source));
}

#[test]
fn odcs_json_import_and_export_preserve_unknown_exact_values() {
    let source = r#"{"apiVersion":"v3.2.0","kind":"DataContract","id":"dc","name":"Customer","version":"1.0.0","schema":[{"id":"customers","name":"customers","properties":[{"id":"customer_id","name":"customer_id","logicalType":"string"}],"relationships":[]}],"future":{"n":123456789012345678901234567890}}"#;
    let document = call(
        execute_odcs_wire,
        "odcs.import",
        [
            ("source", Value::string_utf8(source)),
            ("id", Value::string_utf8("odcs-wire")),
            ("format", Value::string_utf8("json")),
        ],
    );
    let exported = call(
        execute_odcs_wire,
        "odcs.export",
        [("document", document)],
    );
    assert_eq!(exported, Value::string_utf8(source));
}

#[test]
fn wrong_family_operation_is_rejected_before_dispatch() {
    let wire = request_wire(
        "odcs.inspect",
        [("document", Value::Null)],
    );
    let envelope: Json = serde_json::from_str(&execute_linkml_wire(&wire)).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "REQUEST");
}

#[test]
fn linkml_registry_payload_inspector_accepts_a_valid_import_payload() {
    let document = call(
        execute_linkml_wire,
        "linkml.import",
        [
            ("source", Value::string_utf8("id: schema\nname: schema\n")),
            ("id", Value::string_utf8("linkml-registry")),
            ("format", Value::string_utf8("yaml")),
        ],
    );
    let payload = first_payload(&document, "umf.linkml");
    let diagnostics = call(
        execute_linkml_wire,
        "linkml.inspectPayload",
        [("payload", payload)],
    );
    let Value::Array(diagnostics) = diagnostics else {
        panic!("LinkML payload diagnostics")
    };
    assert!(diagnostics
        .iter()
        .any(|item| { member(item, "code") == &Value::string_utf8("LINKML_CONTEXT") }));
}

#[test]
fn odcs_registry_payload_inspector_accepts_a_valid_import_payload() {
    let document = call(
        execute_odcs_wire,
        "odcs.import",
        [
            (
                "source",
                Value::string_utf8(
                    r#"{"apiVersion":"v3.2.0","kind":"DataContract","id":"dc","name":"Customer","version":"1.0.0","schema":[]}"#,
                ),
            ),
            ("id", Value::string_utf8("odcs-registry")),
            ("format", Value::string_utf8("json")),
        ],
    );
    let payload = first_payload(&document, "umf.odcs");
    let diagnostics = call(
        execute_odcs_wire,
        "odcs.inspectPayload",
        [("payload", payload)],
    );
    let Value::Array(diagnostics) = diagnostics else {
        panic!("ODCS payload diagnostics")
    };
    assert!(diagnostics
        .iter()
        .any(|item| { member(item, "code") == &Value::string_utf8("ODCS_CONTEXT") }));
}


fn first_payload(document: &Value, extension: &str) -> Value {
    let Value::Array(modules) = member(document, "modules") else {
        panic!("expected modules")
    };
    let Value::Array(elements) = member(modules.first().expect("first module"), "elements") else {
        panic!("expected elements")
    };
    member(member(elements.first().expect("first element"), "extensions"), extension).clone()
}

fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
        .unwrap()
}

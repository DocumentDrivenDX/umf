#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{protobuf_document, Context, Utf16, Value};

fn get<'a>(v: &'a Value, k: &str) -> &'a Value {
    let Value::Object(fields) = v else {
        panic!("expected object")
    };
    fields
        .iter()
        .find(|(key, _)| key.to_utf8().is_ok_and(|name| name == k))
        .map(|(_, value)| value)
        .unwrap()
}
fn node() -> Value {
    Value::Object(vec![
        (
            Utf16::from("type"),
            Value::string_utf8("google.protobuf.FileDescriptorSet"),
        ),
        (Utf16::from("fields"), Value::Object(vec![])),
        (Utf16::from("unknown"), Value::Array(vec![])),
    ])
}
fn document() -> Value {
    let element = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("schema")),
        (
            Utf16::from("extensions"),
            Value::Object(vec![(
                Utf16::from("umf.protobuf"),
                Value::Object(vec![
                    (
                        Utf16::from("descriptorProfile"),
                        Value::string_utf8("protobuf-es-2.15.0"),
                    ),
                    (Utf16::from("descriptorSet"), node()),
                ]),
            )]),
        ),
    ]);
    let module = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("schema")),
        (Utf16::from("namespace"), Value::string_utf8("")),
        (Utf16::from("elements"), Value::Array(vec![element])),
    ]);
    Value::Object(vec![
        (Utf16::from("umf"), Value::string_utf8("0.10.0")),
        (Utf16::from("id"), Value::string_utf8("proto")),
        (
            Utf16::from("vocabularies"),
            Value::Object(vec![(
                Utf16::from("umf.protobuf"),
                Value::Object(vec![(Utf16::from("version"), Value::string_utf8("0.1.0"))]),
            )]),
        ),
        (Utf16::from("modules"), Value::Array(vec![module])),
    ])
}

#[test]
fn imports_and_exports_empty_descriptor_set_with_current_document_shape() {
    let imported =
        protobuf_document::import_descriptor_set(&[], "proto", &mut Context::ordinary()).unwrap();
    assert_eq!(get(&imported, "id"), &Value::string_utf8("proto"));
    assert_eq!(
        protobuf_document::export_descriptor_set(&imported, &mut Context::ordinary()).unwrap(),
        Vec::<u8>::new()
    );
    assert!(
        protobuf_document::inspect(&imported, &mut Context::ordinary())
            .unwrap()
            .valid
    );
}

#[test]
fn import_rejects_empty_id_through_core_document_validation() {
    let result = protobuf_document::import_descriptor_set(&[], "", &mut Context::ordinary());
    assert_eq!(result.unwrap_err().code, "PROTOBUF_DOCUMENT");
}

#[test]
fn get_and_export_reject_invalid_root_fields_and_malformed_modules() {
    let mut missing_umf = document();
    let Value::Object(ref mut fields) = missing_umf else {
        unreachable!()
    };
    fields.retain(|(key, _)| key.to_utf8().unwrap() != "umf");
    assert_eq!(
        protobuf_document::get_descriptor_set(&missing_umf, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "PROTOBUF_DOCUMENT"
    );

    let mut missing_id = document();
    let Value::Object(ref mut fields) = missing_id else {
        unreachable!()
    };
    fields.retain(|(key, _)| key.to_utf8().unwrap() != "id");
    assert_eq!(
        protobuf_document::export_descriptor_set(&missing_id, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "PROTOBUF_DOCUMENT"
    );

    let mut malformed_modules = document();
    let Value::Object(ref mut fields) = malformed_modules else {
        unreachable!()
    };
    fields
        .iter_mut()
        .find(|(key, _)| key.to_utf8().unwrap() == "modules")
        .unwrap()
        .1 = Value::String(Utf16::from("not-an-array"));
    assert_eq!(
        protobuf_document::get_descriptor_set(&malformed_modules, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "PROTOBUF_DOCUMENT"
    );
}

#[test]
fn descriptor_get_and_bundle_return_independent_source_copies() {
    let input = document();
    let mut descriptor =
        protobuf_document::get_descriptor_set(&input, &mut Context::ordinary()).unwrap();
    let Value::Object(ref mut members) = descriptor else {
        panic!("descriptor object expected")
    };
    members.push((Utf16::from("future"), Value::Bool(true)));
    assert!(protobuf_document::export_descriptor_set(&input, &mut Context::ordinary()).is_ok());

    let bundle = protobuf_document::export_bundle(&input, &mut Context::ordinary()).unwrap();
    assert!(bundle.descriptor_set.is_empty());
    assert_eq!(bundle.source, input);
    assert_eq!(
        bundle.diagnostics.last().unwrap().code,
        Utf16::from("SOURCE_ARTIFACT_REQUIRED")
    );
}

#[test]
fn export_refuses_unknown_payload_content_and_malformed_descriptors() {
    let mut input = document();
    if let Value::Object(root) = &mut input {
        let Value::Array(modules) = &mut root
            .iter_mut()
            .find(|(k, _)| k.to_utf8().unwrap() == "modules")
            .unwrap()
            .1
        else {
            unreachable!()
        };
        let Value::Object(elements) = &mut modules[0] else {
            unreachable!()
        };
        let Value::Array(items) = &mut elements
            .iter_mut()
            .find(|(k, _)| k.to_utf8().unwrap() == "elements")
            .unwrap()
            .1
        else {
            unreachable!()
        };
        let Value::Object(element) = &mut items[0] else {
            unreachable!()
        };
        let Value::Object(extensions) = &mut element
            .iter_mut()
            .find(|(k, _)| k.to_utf8().unwrap() == "extensions")
            .unwrap()
            .1
        else {
            unreachable!()
        };
        let (_, Value::Object(payload)) = extensions
            .iter_mut()
            .find(|(k, _)| k.to_utf8().unwrap() == "umf.protobuf")
            .unwrap()
        else {
            unreachable!()
        };
        payload.push((Utf16::from("future"), Value::Bool(true)));
    }
    let result = protobuf_document::export_descriptor_set(&input, &mut Context::ordinary());
    assert_eq!(result.unwrap_err().code, "PROTOBUF_REPRESENTATION");
}

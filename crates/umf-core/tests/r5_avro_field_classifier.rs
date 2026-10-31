#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    avro_document::{export_bundle, import_schema, AvroDependencySource},
    avro_field_classifier::classify_field,
    Context, Utf16, Value,
};

const ROOT: &str = r#"{"type":"record","name":"Invoice","namespace":"billing","fields":[{"name":"amount","type":"bytes","customFieldTag":{"x":1}}]}"#;
const DEP: &str = r#"{"type":"record","name":"Currency","namespace":"billing","fields":[{"name":"code","type":"string"}]}"#;

fn get<'a>(v: &'a Value, k: &str) -> &'a Value {
    let Value::Object(m) = v else {
        panic!("object")
    };
    m.iter()
        .find(|(key, _)| key == &Utf16::from(k))
        .map(|(_, v)| v)
        .unwrap()
}
fn request(document: &Value) -> Value {
    request_mode(document, "strict")
}
fn request_mode(document: &Value, mode: &str) -> Value {
    let bundle = export_bundle(document, &mut Context::ordinary()).unwrap();
    let mut deps = Vec::new();
    for (id, schema) in bundle.dependencies {
        deps.push(Value::Object(vec![
            (Utf16::from("id"), Value::String(id)),
            (Utf16::from("schema"), Value::String(schema)),
        ]));
    }
    Value::Object(vec![
        (
            Utf16::from("column"),
            Value::string_utf8(r#"[null,"/fields/0"]"#),
        ),
        (
            Utf16::from("nativeSource"),
            Value::String(bundle.schema_json),
        ),
        (Utf16::from("dependencies"), Value::Array(deps)),
        (Utf16::from("mode"), Value::string_utf8(mode)),
    ])
}
fn document() -> Value {
    let id = Utf16::from("invoice");
    let dep_id = Utf16::from("currency.avsc");
    import_schema(
        &id,
        &ROOT.encode_utf16().collect::<Vec<_>>(),
        &[AvroDependencySource {
            id: &dep_id,
            schema_json: &DEP.encode_utf16().collect::<Vec<_>>(),
        }],
        &mut Context::ordinary(),
    )
    .unwrap()
}

#[test]
fn classifies_declared_field_and_preserves_archive_and_native_fragment() {
    let document = document();
    let report = classify_field(&document, &request(&document), &mut Context::ordinary()).unwrap();
    assert_eq!(get(&report, "status"), &Value::string_utf8("classified"));
    let mapping = get(&report, "mapping");
    assert_eq!(
        get(mapping, "basis"),
        &Value::string_utf8("checked-record-field-membership")
    );
    assert_eq!(get(mapping, "nativePath"), &Value::string_utf8("/fields/0"));
    assert!(matches!(get(&report, "target"), Value::Object(_)));
}

#[test]
fn existing_unproven_kind_is_blocked_and_source_is_retained() {
    let mut document = document();
    let native_request = request(&document);
    let Value::Object(fields) = &mut document else {
        panic!("document object")
    };
    let modules = fields
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("modules"))
        .unwrap();
    let Value::Array(modules) = &mut modules.1 else {
        panic!("modules")
    };
    let module = modules
        .iter_mut()
        .find(|m| get(m, "id") == &Value::string_utf8("avro.fields"))
        .unwrap();
    let Value::Object(module) = module else {
        panic!("module")
    };
    let elements = module
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("elements"))
        .unwrap();
    let Value::Array(elements) = &mut elements.1 else {
        panic!("elements")
    };
    let element_index = elements
        .iter()
        .position(|element| get(element, "id") == get(&native_request, "column"))
        .unwrap();
    let Value::Object(element) = &mut elements[element_index] else {
        panic!("element")
    };
    element.push((Utf16::from("kind"), Value::string_utf8("field")));
    assert_eq!(
        get(&elements[element_index], "kind"),
        &Value::string_utf8("field")
    );
    let report = classify_field(&document, &native_request, &mut Context::ordinary()).unwrap();
    assert_eq!(get(&report, "status"), &Value::string_utf8("blocked"));
    let Value::Object(report_fields) = &report else {
        panic!("report object")
    };
    assert!(!report_fields
        .iter()
        .any(|(k, _)| k == &Utf16::from("target")));
    assert_eq!(get(&report, "source"), &document);
}

#[test]
fn archived_native_bundle_must_match_exact_root_and_dependency_order() {
    let document = document();
    let mut bad_root = request(&document);
    if let Value::Object(members) = &mut bad_root {
        members
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("nativeSource"))
            .unwrap()
            .1 = Value::string_utf8("{}");
    }
    assert_eq!(
        classify_field(&document, &bad_root, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "AVRO_FIELD_ARCHIVE"
    );

    let mut bad_dependency = request(&document);
    if let Value::Object(members) = &mut bad_dependency {
        let deps = members
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("dependencies"))
            .unwrap();
        let Value::Array(deps) = &mut deps.1 else {
            panic!("dependencies")
        };
        let Value::Object(first) = &mut deps[0] else {
            panic!("dependency")
        };
        first
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("schema"))
            .unwrap()
            .1 = Value::string_utf8("{}");
    }
    assert_eq!(
        classify_field(&document, &bad_dependency, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "AVRO_FIELD_ARCHIVE"
    );
}

// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    avro_document::{import_schema, inspect_avro_document},
    Context, Utf16, Value,
};

fn imported(source: &str) -> Value {
    import_schema(
        &Utf16::from("inspection"),
        &source.encode_utf16().collect::<Vec<_>>(),
        &[],
        &mut Context::ordinary(),
    )
    .unwrap()
}

#[test]
fn admission_and_native_structure_are_separate_reports() {
    let document = imported(r#""missing.Type""#);
    let before = document.clone();
    let report = inspect_avro_document(&document, &mut Context::ordinary()).unwrap();
    assert!(report.admission.valid);
    let native = report.native_inspection.unwrap();
    assert!(!native.valid);
    assert!(!native.complete);
    assert_eq!(
        native.diagnostics[0].code.to_utf8().unwrap(),
        "AVRO_UNRESOLVED_NAME"
    );
    assert_eq!(document, before, "inspection must not mutate its source");
    assert_eq!(
        report.payload_path.unwrap().to_utf8().unwrap(),
        "/modules/0/elements/0/extensions/umf.avro"
    );
}

#[test]
fn invalid_generic_admission_skips_native_inspection() {
    let mut document = imported(r#"{"type":"string"}"#);
    let Value::Object(fields) = &mut document else {
        unreachable!()
    };
    let (_, core_version) = fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("umf"))
        .unwrap();
    *core_version = Value::string_utf8("0.0.0");
    let report = inspect_avro_document(&document, &mut Context::ordinary()).unwrap();
    assert!(!report.admission.valid);
    assert!(report.native_inspection.is_none());
    assert!(report.payload_path.is_none());
}

#[test]
fn admitted_non_avro_document_has_no_native_report_or_payload_path() {
    let document = Value::Object(vec![
        (Utf16::from("umf"), Value::string_utf8("0.10.0")),
        (Utf16::from("id"), Value::string_utf8("plain")),
        (Utf16::from("vocabularies"), Value::Object(vec![])),
        (Utf16::from("modules"), Value::Array(vec![])),
    ]);
    let report = inspect_avro_document(&document, &mut Context::ordinary()).unwrap();
    assert!(report.admission.valid, "{:?}", report.admission.diagnostics);
    assert!(report.native_inspection.is_none());
    assert!(report.payload_path.is_none());
}

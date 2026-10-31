use super::*;
use crate::{Context, Utf16};
fn context() -> Context<'static> {
    Context::ordinary()
}
fn fixture() -> Utf16 {
    Utf16::from(include_str!(
        "../../../fixtures/postgresql/catalog-capture.json"
    ))
}

#[test]
fn captures_columns_and_exports_exact_native_source_tree() {
    let mut ctx = context();
    let source = fixture();
    let capture = PostgresqlCatalogCapture::import(&source, &mut ctx).unwrap();
    let columns = capture.columns(&mut ctx).unwrap();
    assert!(!columns.is_empty());
    let scalar = columns
        .iter()
        .find(|c| {
            c.schema == Utf16::from("sales")
                && c.relation == Utf16::from("scalar_types")
                && value_field(&c.element, "scalarType").is_some()
        })
        .unwrap();
    assert_eq!(
        value_field(&scalar.element, "scalarType"),
        Some(&Value::String(Utf16::from("boolean")))
    );
    assert!(scalar.path.to_utf8().unwrap().ends_with("/columns/0"));
    let exported = capture.export(&mut ctx).unwrap();
    let roundtrip = NativeJsonTree::parse_json(exported.units(), &mut ctx).unwrap();
    assert_eq!(roundtrip, capture.root);
}

#[test]
fn refuses_malformed_relation_list_before_materializing_metadata() {
    let source = fixture().to_utf8().unwrap();
    let malformed = source.replacen("\"relations\": [", "\"relations\": {}", 1);
    assert_ne!(malformed, source);
    let mut ctx = context();
    let error = PostgresqlCatalogCapture::import(&Utf16::from(malformed), &mut ctx).unwrap_err();
    assert_eq!(error.code, "POSTGRESQL_CATALOG_CAPTURE");
}

fn value_field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(name))
        .map(|(_, v)| v)
}

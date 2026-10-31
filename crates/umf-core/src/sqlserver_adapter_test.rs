//! Move beside crates/umf-core/src/sqlserver_adapter.rs when integrating.
use super::SqlServerCatalog;
use crate::{Context, Utf16, Value};

#[test]
fn current_catalog_roundtrips_metadata_and_copied_edit() {
    let source = Utf16::from(include_str!("../../../fixtures/sqlserver/catalog.json"));
    let mut ctx = Context::ordinary();
    let captured = SqlServerCatalog::import(&source, &mut ctx).unwrap();
    let before = captured.column_metadata(&mut ctx).unwrap();
    assert_eq!(before[0].path.to_utf8().unwrap(), "/tables/0/columns/0");
    let Value::Object(fields) = &before[0].element else {
        panic!("element object")
    };
    assert!(fields.iter().any(|(name, value)| {
        name == &Utf16::from("name") && value == &Value::string_utf8("id")
    }));

    let path = Utf16::from("/tables/0/columns/0/description");
    let replacement = Utf16::from("\"Edited description\"");
    let edited = captured
        .propose_edit(&path, &replacement, &mut ctx)
        .unwrap();
    assert_ne!(
        captured.export(&mut ctx).unwrap(),
        edited.export(&mut ctx).unwrap()
    );
    assert!(
        edited
            .export(&mut ctx)
            .unwrap()
            .to_utf8()
            .unwrap()
            .contains("Edited description")
    );

    let invalid = Utf16::from("{\"profile\":\"unrecognized\",\"tables\":[]}");
    assert!(SqlServerCatalog::import(&invalid, &mut ctx).is_err());
}

#[test]
fn preserves_unknown_exact_extension_numbers_and_rejects_rounded_ids() {
    let source_text = include_str!("../../../fixtures/sqlserver/catalog.json").replacen(
        "\"column_id\": 1,",
        "\"column_id\": 1,\n          \"futureExact\": 9007199254740993,",
        1,
    );
    let source = Utf16::from(source_text);
    let mut ctx = Context::ordinary();
    let captured = SqlServerCatalog::import(&source, &mut ctx).unwrap();
    assert!(
        captured
            .export(&mut ctx)
            .unwrap()
            .to_utf8()
            .unwrap()
            .contains("9007199254740993")
    );
    for token in ["-0", "1e-400", "9007199254740993", "1.0000000000000001"] {
        assert!(
            captured
                .propose_edit(
                    &Utf16::from("/tables/0/columns/0/column_id"),
                    &Utf16::from(token),
                    &mut ctx,
                )
                .is_err(),
            "accepted declared integer token {token}"
        );
    }
}

#[test]
fn document_edit_refreshes_derived_fields_and_keeps_unrelated_metadata() {
    let source = Utf16::from(include_str!("../../../fixtures/sqlserver/catalog.json"));
    let mut ctx = Context::ordinary();
    let catalog = SqlServerCatalog::import(&source, &mut ctx).unwrap();
    let id = Utf16::from("urn:test:catalog");
    let mut document = super::document_value(&id, &catalog, &mut ctx).unwrap();
    if let Value::Object(fields) = &mut document {
        fields.push((
            Utf16::from("futureDocumentMetadata"),
            Value::string_utf8("preserved"),
        ));
    }
    let edited = super::propose_document_edit(
        &document,
        &Utf16::from("/tables/0/columns/0/description"),
        &Utf16::from("\"Edited description\""),
        &mut ctx,
    )
    .unwrap();
    assert!(
        super::export_document(&edited, &mut ctx)
            .unwrap()
            .to_utf8()
            .unwrap()
            .contains("Edited description")
    );
    assert_eq!(
        super::value_field(&edited, "futureDocumentMetadata"),
        Some(&Value::string_utf8("preserved"))
    );
    assert_eq!(super::value_field(&edited, "id"), Some(&Value::String(id)));
    let columns = super::value_field(&edited, "modules")
        .and_then(|v| match v {
            Value::Array(items) => items.first(),
            _ => None,
        })
        .and_then(|v| super::value_field(v, "elements"))
        .and_then(|v| match v {
            Value::Array(items) => items.first(),
            _ => None,
        })
        .unwrap();
    assert_eq!(
        super::value_string(super::value_field(columns, "description")),
        Some(&Utf16::from("Edited description"))
    );

    let renamed = super::propose_document_edit(
        &document,
        &Utf16::from("/tables/0/columns/0/name"),
        &Utf16::from("\"renamed_id\""),
        &mut ctx,
    )
    .unwrap();
    let renamed_element = super::value_field(&renamed, "modules")
        .and_then(|v| match v {
            Value::Array(items) => items.first(),
            _ => None,
        })
        .and_then(|v| super::value_field(v, "elements"))
        .and_then(|v| match v {
            Value::Array(items) => items.first(),
            _ => None,
        })
        .unwrap();
    assert_eq!(
        super::value_string(super::value_field(renamed_element, "name")),
        Some(&Utf16::from("renamed_id"))
    );

    let mut attached = crate::copy_json(&document, &mut ctx).unwrap();
    let element = super::value_field_mut(&mut attached, "modules")
        .and_then(|v| match v {
            Value::Array(items) => items.first_mut(),
            _ => None,
        })
        .and_then(|v| super::value_field_mut(v, "elements"))
        .and_then(|v| match v {
            Value::Array(items) => items.first_mut(),
            _ => None,
        })
        .unwrap();
    let extensions = super::value_field_mut(element, "extensions").unwrap();
    if let Value::Object(fields) = extensions {
        fields.push((Utf16::from("reviewer.note"), Value::string_utf8("keep me")));
    }
    assert!(
        super::propose_document_edit(
            &attached,
            &Utf16::from("/tables/0/columns/0/name"),
            &Utf16::from("\"renamed_id\""),
            &mut ctx,
        )
        .is_err()
    );
}

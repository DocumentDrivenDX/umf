// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{decode, encode, iceberg_table_binding};

fn call(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> Result<Value, Json> {
    let mut pairs = vec![
        (
            Utf16::from("profile"),
            Value::string_utf8(iceberg_table_binding::PROFILE),
        ),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    pairs.extend(fields.into_iter().map(|(k, v)| (Utf16::from(k), v)));
    let wire = encode(&Value::Object(pairs), &mut Context::ordinary()).unwrap();
    let response: Json = serde_json::from_str(&iceberg_table_binding::execute_wire(&wire)).unwrap();
    if response["status"] != "ok" {
        return Err(response);
    }
    Ok(decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap())
}
fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(m) => m
            .iter()
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
#[test]
fn table_import_get_edit_export_and_invalid_source_are_callable() {
    let source =
        include_str!("../../../fixtures/iceberg/table/TableMetadataV2ValidMinimal.json.json");
    let imported = call(
        "iceberg.table.import",
        [
            ("id", Value::string_utf8("table-wire")),
            ("source", Value::string_utf8(source)),
        ],
    )
    .unwrap();
    let inspected = call("iceberg.table.inspect", [("document", imported.clone())]).unwrap();
    assert!(matches!(
        field(&inspected, "valid"),
        Some(Value::Bool(true))
    ));
    let context = call(
        "iceberg.table.inspectContext",
        [("document", imported.clone())],
    )
    .unwrap();
    assert!(
        matches!(field(&context, "status"), Some(Value::String(status)) if status == &Utf16::from("checked"))
    );
    let transforms = call(
        "iceberg.table.inspectTransforms",
        [("document", imported.clone())],
    )
    .unwrap();
    assert!(
        matches!(field(&transforms, "status"), Some(Value::String(status)) if status == &Utf16::from("checked"))
    );
    let assessment = call(
        "iceberg.table.inspectTransformType",
        [
            ("sourceType", Value::string_utf8("long")),
            ("transform", Value::string_utf8("bucket[4]")),
        ],
    )
    .unwrap();
    assert!(
        matches!(field(&assessment, "status"), Some(Value::String(status)) if status == &Utf16::from("compatible"))
    );
    let node = call(
        "iceberg.table.getNode",
        [
            ("document", imported.clone()),
            ("path", Value::string_utf8("/current-schema-id")),
        ],
    )
    .unwrap();
    assert!(matches!(field(&node,"kind"),Some(Value::String(k)) if k==&Utf16::from("number")));
    let edited = call(
        "iceberg.table.editNode",
        [
            ("document", imported.clone()),
            ("path", Value::string_utf8("/location")),
            (
                "replacementJson",
                Value::string_utf8("\"s3://bucket/edited\""),
            ),
        ],
    )
    .unwrap();
    let doc = field(&edited, "document").unwrap();
    let exported = call("iceberg.table.export", [("document", doc.clone())]).unwrap();
    assert!(
        matches!(exported,Value::String(ref s) if s.to_utf8().unwrap().contains("s3://bucket/edited"))
    );
    assert_ne!(field(&edited, "document"), Some(&imported));
    let invalid = call(
        "iceberg.table.import",
        [
            ("id", Value::string_utf8("invalid")),
            ("source", Value::string_utf8("{}")),
        ],
    )
    .unwrap_err();
    assert_eq!(invalid["code"], "ICEBERG_TABLE_DOCUMENT");
}

#[test]
fn unknown_native_numeric_fields_are_preserved_without_schema_reinterpretation() {
    let fixture =
        include_str!("../../../fixtures/iceberg/table/TableMetadataV2ValidMinimal.json.json");
    let source = format!(
        "{},\"future-property\":{{\"id\":9007199254740993}}}}",
        fixture.trim_end_matches('}')
    );
    let imported = call(
        "iceberg.table.import",
        [
            ("id", Value::string_utf8("future-table")),
            ("source", Value::string_utf8(&source)),
        ],
    )
    .unwrap();
    let validation = call("iceberg.table.inspect", [("document", imported.clone())]).unwrap();
    assert!(matches!(
        field(&validation, "valid"),
        Some(Value::Bool(true))
    ));
    let exported = call("iceberg.table.export", [("document", imported)]).unwrap();
    assert!(
        matches!(exported, Value::String(text) if text.to_utf8().unwrap().contains("9007199254740993"))
    );
}

#[test]
fn known_int64_fields_reject_values_outside_signed_range() {
    let fixture =
        include_str!("../../../fixtures/iceberg/table/TableMetadataV2ValidMinimal.json.json");
    let source = fixture.replace(
        "\"last-sequence-number\":34",
        "\"last-sequence-number\":9223372036854775808",
    );
    let error = call(
        "iceberg.table.import",
        [
            ("id", Value::string_utf8("wide-sequence")),
            ("source", Value::string_utf8(&source)),
        ],
    )
    .unwrap_err();
    assert_eq!(error["code"], "ICEBERG_TABLE_DOCUMENT");
}

#[test]
fn rename_proposal_appends_schema_without_rewriting_history() {
    let source =
        include_str!("../../../fixtures/iceberg/table/TableMetadataV2ValidMinimal.json.json");
    let imported = call(
        "iceberg.table.import",
        [
            ("id", Value::string_utf8("rename-table")),
            ("source", Value::string_utf8(source)),
        ],
    )
    .unwrap();
    let proposal = call(
        "iceberg.table.proposeRename",
        [
            ("document", imported.clone()),
            ("fieldId", Value::Number(1.0)),
            ("newName", Value::string_utf8("renamed_x")),
            ("nextSchemaId", Value::Number(1.0)),
        ],
    )
    .unwrap();
    let document = field(&proposal, "document").unwrap();
    let exported = call("iceberg.table.export", [("document", document.clone())]).unwrap();
    assert!(matches!(exported, Value::String(ref s) if s.to_utf8().unwrap().contains("renamed_x")));
    assert!(matches!(field(&proposal, "report"), Some(Value::Object(_))));
    let original_export = call("iceberg.table.export", [("document", imported)]).unwrap();
    assert!(
        matches!(original_export, Value::String(ref s) if !s.to_utf8().unwrap().contains("renamed_x"))
    );
}

#[test]
fn rename_refuses_same_name_without_mutating_source() {
    let source =
        include_str!("../../../fixtures/iceberg/table/TableMetadataV2ValidMinimal.json.json");
    let imported = call(
        "iceberg.table.import",
        [
            ("id", Value::string_utf8("rename-refusal")),
            ("source", Value::string_utf8(source)),
        ],
    )
    .unwrap();
    let before = call("iceberg.table.export", [("document", imported.clone())]).unwrap();
    let error = call(
        "iceberg.table.proposeRename",
        [
            ("document", imported.clone()),
            ("fieldId", Value::Number(1.0)),
            ("newName", Value::string_utf8("x")),
            ("nextSchemaId", Value::Number(1.0)),
        ],
    )
    .unwrap_err();
    assert_eq!(error["code"], "ICEBERG_TABLE_RENAME");
    assert_eq!(
        call("iceberg.table.export", [("document", imported)]).unwrap(),
        before
    );
}

#[test]
fn promotion_proposal_appends_schema_and_checks_dependent_partition_transform() {
    let fixture =
        include_str!("../../../fixtures/iceberg/table/TableMetadataV2ValidMinimal.json.json");
    let source = fixture.replace(
        "\"id\":1,\"name\":\"x\",\"required\":true,\"type\":\"long\"",
        "\"id\":1,\"name\":\"x\",\"required\":true,\"type\":\"int\"",
    );
    let imported = call(
        "iceberg.table.import",
        [
            ("id", Value::string_utf8("promotion-table")),
            ("source", Value::string_utf8(&source)),
        ],
    )
    .unwrap();
    let proposal = call(
        "iceberg.table.proposePromotion",
        [
            ("document", imported.clone()),
            ("fieldId", Value::Number(1.0)),
            ("targetType", Value::string_utf8("long")),
            ("nextSchemaId", Value::Number(1.0)),
        ],
    )
    .unwrap();
    let exported = call(
        "iceberg.table.export",
        [("document", field(&proposal, "document").unwrap().clone())],
    )
    .unwrap();
    assert!(
        matches!(exported, Value::String(ref s) if s.to_utf8().unwrap().contains("\"type\":\"long\""))
    );
    assert!(matches!(field(&proposal, "report"), Some(Value::Object(_))));
}

#[test]
fn promotion_refuses_unverified_type_changes() {
    let source =
        include_str!("../../../fixtures/iceberg/table/TableMetadataV2ValidMinimal.json.json");
    let imported = call(
        "iceberg.table.import",
        [
            ("id", Value::string_utf8("promotion-refusal")),
            ("source", Value::string_utf8(source)),
        ],
    )
    .unwrap();
    let error = call(
        "iceberg.table.proposePromotion",
        [
            ("document", imported),
            ("fieldId", Value::Number(1.0)),
            ("targetType", Value::string_utf8("string")),
            ("nextSchemaId", Value::Number(1.0)),
        ],
    )
    .unwrap_err();
    assert_eq!(error["code"], "ICEBERG_TABLE_PROMOTION");
}

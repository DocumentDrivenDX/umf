// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    delta_table::{
        export_delta_table, get_delta_table_node, import_delta_table, inspect_delta_table,
        propose_delta_table_node_edit, DeltaTableResources,
    },
    Context, Utf16,
};

fn setup() -> (DeltaTableResources, Context<'static>) {
    let mut ctx = Context::ordinary();
    (DeltaTableResources::new(&mut ctx).unwrap(), ctx)
}

#[test]
fn table_semantic_warnings_match_frozen_typescript_order_code_path_and_message() {
    let receipt: serde_json::Value = serde_json::from_str(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r8-delta-spark-hash/delta-table-warning-predecessor.json"
    )).unwrap();
    let cases = receipt["cases"].as_array().unwrap();
    let (resources, mut ctx) = setup();
    for case in cases {
        let id = case["id"].as_str().unwrap();
        let source = case["source"].as_str().unwrap();
        let document = import_delta_table(
            &source.encode_utf16().collect::<Vec<_>>(),
            &Utf16::from(id),
            &resources,
            &mut ctx,
        )
        .unwrap_or_else(|error| {
            panic!("{id}: {} {}", error.code, error.message.to_utf8().unwrap())
        });
        let validation = inspect_delta_table(&document, &resources, &mut ctx).unwrap();
        assert!(validation.valid, "{id}");
        let actual: Vec<_> = validation.diagnostics.iter().map(|d| {
            serde_json::json!({
                "code": d.code.to_utf8().unwrap(),
                "path": d.path.to_utf8().unwrap(),
                "message": d.message.to_utf8().unwrap(),
                "severity": if d.severity == umf_core::Severity::Warning { "warning" } else { "error" },
            })
        }).collect();
        assert_eq!(
            actual.as_slice(),
            case["diagnostics"].as_array().unwrap().as_slice(),
            "{id}"
        );
    }
}

#[test]
fn table_context_roundtrip_access_and_edit_preserve_source() {
    let (resources, mut ctx) = setup();
    let source = r#"{"protocol":{"minReaderVersion":3,"minWriterVersion":7,"readerFeatures":["timestampNtz"],"writerFeatures":["timestampNtz"]},"metaData":{"id":"t","format":{"provider":"parquet","options":{}},"schemaString":"{\"type\":\"struct\",\"fields\":[]}","partitionColumns":[],"configuration":{}}}"#;
    let document = import_delta_table(
        &source.encode_utf16().collect::<Vec<_>>(),
        &Utf16::from("table"),
        &resources,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        export_delta_table(&document, &resources, &mut ctx)
            .unwrap()
            .to_utf8()
            .unwrap(),
        source
    );
    let before = export_delta_table(&document, &resources, &mut ctx).unwrap();
    let selected = get_delta_table_node(
        &document,
        &Utf16::from("/metaData/id"),
        &resources,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        selected
            .render_compact(&mut ctx)
            .unwrap()
            .to_utf8()
            .unwrap(),
        "\"t\""
    );
    let (candidate, _) = propose_delta_table_node_edit(
        &document,
        &Utf16::from("/metaData/id"),
        &"\"other\"".encode_utf16().collect::<Vec<_>>(),
        &resources,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        export_delta_table(&document, &resources, &mut ctx).unwrap(),
        before
    );
    assert!(export_delta_table(&candidate, &resources, &mut ctx)
        .unwrap()
        .to_utf8()
        .unwrap()
        .contains("\"id\":\"other\""));
}

#[test]
fn table_edit_validates_pointer_before_replacement_and_fails_closed_on_numeric_projection() {
    let (resources, mut ctx) = setup();
    let source = r#"{"protocol":{"minReaderVersion":3,"minWriterVersion":7},"metaData":{"id":"t","format":{"provider":"parquet"},"schemaString":"{}","partitionColumns":[],"configuration":{}}}"#;
    let document = import_delta_table(
        &source.encode_utf16().collect::<Vec<_>>(),
        &Utf16::from("table"),
        &resources,
        &mut ctx,
    )
    .unwrap();
    let error = propose_delta_table_node_edit(
        &document,
        &Utf16::from("not-a-pointer"),
        &"{".encode_utf16().collect::<Vec<_>>(),
        &resources,
        &mut ctx,
    )
    .unwrap_err();
    assert_eq!(error.code, "JSON_SCHEMA_POINTER");
    let error = propose_delta_table_node_edit(
        &document,
        &Utf16::from("/protocol/minReaderVersion"),
        &"0".encode_utf16().collect::<Vec<_>>(),
        &resources,
        &mut ctx,
    )
    .unwrap_err();
    assert_eq!(error.code, "DELTA_TABLE_DOCUMENT");
}

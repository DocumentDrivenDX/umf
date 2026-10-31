// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{fs, path::PathBuf};

use umf_core::{
    delta_schema::{
        export_delta_schema, get_delta_node, import_delta_schema, propose_delta_node_edit,
        DeltaSchemaResources,
    },
    native_json::{NativeJsonNode, NativeJsonTree},
    Context, Utf16,
};

fn resources() -> (DeltaSchemaResources, Context<'static>) {
    let mut ctx = Context::ordinary();
    let resources = DeltaSchemaResources::new(&mut ctx).unwrap();
    (resources, ctx)
}

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/delta")
}

#[test]
fn schema_corpus_preserves_native_source_exactly() {
    let (resources, mut ctx) = resources();
    let cases_path = root().join("cases.json");
    let cases_text = fs::read_to_string(&cases_path).unwrap();
    let cases_tree =
        NativeJsonTree::parse_json(&cases_text.encode_utf16().collect::<Vec<_>>(), &mut ctx)
            .unwrap();
    let NativeJsonNode::Array(cases) = cases_tree.root() else {
        panic!("cases corpus must be an array")
    };
    let dir = root();
    let mut passed = 0;
    let mut rejected = 0;
    for case in cases {
        let NativeJsonNode::Object(fields) = case else {
            panic!("case must be an object")
        };
        let id = fields
            .iter()
            .find(|(key, _)| key == &Utf16::from("id"))
            .and_then(|(_, value)| match value {
                NativeJsonNode::String(value) => value.to_utf8().ok(),
                _ => None,
            })
            .unwrap();
        let path = dir.join(format!("{id}.json"));
        let source = fs::read(&path).unwrap();
        let units = String::from_utf8(source.clone())
            .unwrap()
            .encode_utf16()
            .collect::<Vec<_>>();
        let result = import_delta_schema(&units, &Utf16::from(id.clone()), &resources, &mut ctx);
        if ["missing-field-defaults", "array-missing-nullability"].contains(&id.as_str()) {
            assert_eq!(result.unwrap_err().code, "DELTA_DOCUMENT", "{id}");
            rejected += 1;
        } else {
            let document =
                result.unwrap_or_else(|error| panic!("{id}: {} {:?}", error.code, error.message));
            let rendered = export_delta_schema(&document, &resources, &mut ctx).unwrap();
            assert_eq!(rendered.to_utf8().unwrap().as_bytes(), source, "{id}");
            passed += 1;
        }
    }
    assert_eq!((passed, rejected), (37, 2));
}

#[test]
fn schema_edit_and_pointer_errors_keep_predecessor_order() {
    let (resources, mut ctx) = resources();
    let source = fs::read_to_string(root().join("nested.json")).unwrap();
    let document = import_delta_schema(
        &source.encode_utf16().collect::<Vec<_>>(),
        &Utf16::from("edit"),
        &resources,
        &mut ctx,
    )
    .unwrap();
    let before = export_delta_schema(&document, &resources, &mut ctx)
        .unwrap()
        .to_utf8()
        .unwrap();

    let pointer_error = propose_delta_node_edit(
        &document,
        &Utf16::from("not-a-pointer"),
        &"{".encode_utf16().collect::<Vec<_>>(),
        &resources,
        &mut ctx,
    )
    .unwrap_err();
    assert_eq!(pointer_error.code, "JSON_SCHEMA_POINTER");
    let replacement_error = propose_delta_node_edit(
        &document,
        &Utf16::from("/fields"),
        &"{".encode_utf16().collect::<Vec<_>>(),
        &resources,
        &mut ctx,
    )
    .unwrap_err();
    assert_eq!(replacement_error.code, "JSON_SCHEMA_SYNTAX");

    let (candidate, _) = propose_delta_node_edit(
        &document,
        &Utf16::from("/fields/0/type/fields/0/type"),
        &"\"long\"".encode_utf16().collect::<Vec<_>>(),
        &resources,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        export_delta_schema(&document, &resources, &mut ctx)
            .unwrap()
            .to_utf8()
            .unwrap(),
        before
    );
    assert!(export_delta_schema(&candidate, &resources, &mut ctx)
        .unwrap()
        .to_utf8()
        .unwrap()
        .contains("\"type\":\"long\""));
    let selected = get_delta_node(
        &candidate,
        &Utf16::from("/fields/0/type/fields/0/type"),
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
        "\"long\""
    );
}

#[test]
fn schema_semantic_warnings_follow_predecessor_rules_and_order() {
    let (resources, mut ctx) = resources();
    let source = r#"{"type":"struct","fields":[{"name":"A","type":"decimal(0,0)","nullable":true,"metadata":{"note":1}},{"name":"a","type":"timestamp_ntz","nullable":true,"metadata":{}}],"future":true}"#;
    let document = import_delta_schema(
        &source.encode_utf16().collect::<Vec<_>>(),
        &Utf16::from("warnings"),
        &resources,
        &mut ctx,
    )
    .unwrap();
    let (_, validation) = propose_delta_node_edit(
        &document,
        &Utf16::default(),
        &source.encode_utf16().collect::<Vec<_>>(),
        &resources,
        &mut ctx,
    )
    .unwrap();
    let warnings: Vec<(String, String)> = validation
        .diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.severity == umf_core::Severity::Warning)
        .map(|diagnostic| {
            (
                diagnostic.code.to_utf8().unwrap(),
                diagnostic.path.to_utf8().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        warnings,
        vec![
            ("DELTA_CONTEXT_UNVERIFIED".into(), "".into()),
            ("DELTA_UNKNOWN".into(), "/future".into()),
            ("DELTA_DECIMAL_RANGE".into(), "/fields/0/type".into()),
            (
                "DELTA_METADATA_UNVERIFIED".into(),
                "/fields/0/metadata/note".into()
            ),
            ("DELTA_DUPLICATE_NAME".into(), "/fields/1/name".into()),
            ("DELTA_FEATURE_REQUIRED".into(), "/fields/1/type".into()),
        ]
    );
}

#[test]
fn schema_warning_families_match_frozen_typescript_code_path_and_message() {
    let (resources, mut ctx) = resources();
    let cases: &[(&str, &[(&str, &str)])] = &[
        (
            r#"{"type":"struct","future":1,"fields":[{"name":"a","type":"mystery","nullable":true,"metadata":{},"future":true}]}"#,
            &[
                ("DELTA_CONTEXT_UNVERIFIED", ""),
                ("DELTA_UNKNOWN", "/future"),
                ("DELTA_UNKNOWN", "/fields/0/future"),
                ("DELTA_UNKNOWN_TYPE", "/fields/0/type"),
            ],
        ),
        (
            r#"{"type":"struct","fields":[{"name":"Å","type":"string","nullable":true,"metadata":{}},{"name":"å","type":"string","nullable":true,"metadata":{}}]}"#,
            &[
                ("DELTA_CONTEXT_UNVERIFIED", ""),
                ("DELTA_DUPLICATE_NAME", "/fields/1/name"),
            ],
        ),
        (
            r#"{"type":"struct","fields":[{"name":"a","type":"decimal(0,0)","nullable":true,"metadata":{}},{"name":"b","type":"decimal(-1,2)","nullable":true,"metadata":{}},{"name":"c","type":"decimal(39,39)","nullable":true,"metadata":{}}]}"#,
            &[
                ("DELTA_CONTEXT_UNVERIFIED", ""),
                ("DELTA_DECIMAL_RANGE", "/fields/0/type"),
                ("DELTA_UNKNOWN_TYPE", "/fields/1/type"),
                ("DELTA_DECIMAL_RANGE", "/fields/2/type"),
            ],
        ),
        (
            r#"{"type":"struct","fields":[{"name":"a","type":"timestamp_ntz","nullable":true,"metadata":{}},{"name":"b","type":"variant","nullable":true,"metadata":{}},{"name":"c","type":"void","nullable":true,"metadata":{}}]}"#,
            &[
                ("DELTA_CONTEXT_UNVERIFIED", ""),
                ("DELTA_FEATURE_REQUIRED", "/fields/0/type"),
                ("DELTA_FEATURE_REQUIRED", "/fields/1/type"),
                ("DELTA_VOID_WRITE_CONTEXT", "/fields/2/type"),
            ],
        ),
        (
            r#"{"type":"struct","fields":[{"name":"a","type":{"type":"map","keyType":"string","valueType":"long"},"nullable":true,"metadata":{"comment":"x","delta":"y"}}]}"#,
            &[
                ("DELTA_CONTEXT_UNVERIFIED", ""),
                ("DELTA_DEFAULT_NULLABILITY", "/fields/0/type"),
                ("DELTA_METADATA_UNVERIFIED", "/fields/0/metadata/comment"),
                ("DELTA_METADATA_UNVERIFIED", "/fields/0/metadata/delta"),
            ],
        ),
    ];
    let messages = [
        "Schema alone cannot establish Delta protocol/features, table configuration or read/write validity",
        "Unknown native property preserved; native normalization may discard it",
        "Unknown native property preserved; native normalization may discard it",
        "Type spelling is outside the declared protocol vocabulary; native parser acceptance is insufficient",
        "Case-insensitive duplicate name; preserved source is not a valid Delta table schema",
        "Decimal parameters require native and protocol validation",
        "Type requires matching table protocol/features; schema-only import cannot verify them",
        "Void storage omission and write restrictions require the surrounding table schema",
        "Native parser may insert valueContainsNull=true; source absence is retained",
        "Column metadata retained exactly; constraints, identity, mapping and defaults are not executed or validated against table context",
    ];
    for (case_index, (source, expected)) in cases.iter().enumerate() {
        let doc = import_delta_schema(
            &source.encode_utf16().collect::<Vec<_>>(),
            &Utf16::from(format!("warnings-{case_index}")),
            &resources,
            &mut ctx,
        )
        .unwrap();
        let (_, validation) = propose_delta_node_edit(
            &doc,
            &Utf16::default(),
            &source.encode_utf16().collect::<Vec<_>>(),
            &resources,
            &mut ctx,
        )
        .unwrap();
        let actual: Vec<(String, String, String)> = validation
            .diagnostics
            .iter()
            .filter(|d| d.severity == umf_core::Severity::Warning)
            .map(|d| {
                (
                    d.code.to_utf8().unwrap(),
                    d.path.to_utf8().unwrap(),
                    d.message.to_utf8().unwrap(),
                )
            })
            .collect();
        let expected: Vec<(String, String, String)> = expected
            .iter()
            .map(|(code, path)| {
                let message = match *code {
                    "DELTA_CONTEXT_UNVERIFIED" => messages[0],
                    "DELTA_UNKNOWN" => messages[1],
                    "DELTA_UNKNOWN_TYPE" => messages[3],
                    "DELTA_DUPLICATE_NAME" => messages[4],
                    "DELTA_DECIMAL_RANGE" => messages[5],
                    "DELTA_FEATURE_REQUIRED" => messages[6],
                    "DELTA_VOID_WRITE_CONTEXT" => messages[7],
                    "DELTA_DEFAULT_NULLABILITY" => messages[8],
                    "DELTA_METADATA_UNVERIFIED" => messages[9],
                    _ => unreachable!(),
                };
                ((*code).to_owned(), (*path).to_owned(), message.to_owned())
            })
            .collect();
        assert_eq!(actual, expected, "warning case {case_index}");
    }
}

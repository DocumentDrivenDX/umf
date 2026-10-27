#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    arrow_schema as arrow,
    native_json::{NativeJsonNode, NativeJsonTree},
    Context, Utf16,
};

#[test]
fn authored_52_case_arrow_schema_corpus_round_trips_exact_native_json() {
    let mut ctx = Context::ordinary();
    let resources = arrow::ArrowSchemaResources::new(&mut ctx).unwrap();
    let corpus = NativeJsonTree::parse_json(
        &include_str!("../../../fixtures/arrow/schema-cases.json")
            .encode_utf16()
            .collect::<Vec<_>>(),
        &mut ctx,
    )
    .unwrap();
    for index in 0..52 {
        let input = corpus
            .subtree_clone(&Utf16::from(format!("/{index}/input")), &mut ctx)
            .unwrap();
        let text = input.render_compact(&mut ctx).unwrap();
        let document = arrow::import_arrow_schema(
            text.units(),
            &Utf16::from(format!("arrow-{index}")),
            &resources,
            &mut ctx,
        )
        .unwrap();
        let output = arrow::export_arrow_schema(&document, &resources, &mut ctx).unwrap();
        assert_eq!(output, text, "case {index}");
        let check = arrow::inspect_arrow(&document, &resources, &mut ctx).unwrap();
        assert!(check.valid, "case {index}: {:?}", check.diagnostics);
    }
}

#[test]
fn existing_arrow_oracle_records_remain_pinned_to_their_native_scope() {
    let mut ctx = Context::ordinary();
    let oracle = NativeJsonTree::parse_json(
        &include_str!("../../../fixtures/arrow/capability-results.json")
            .encode_utf16()
            .collect::<Vec<_>>(),
        &mut ctx,
    )
    .unwrap();
    let number =
        |path: &str, ctx: &mut Context<'_>| match oracle.child(&Utf16::from(path), ctx).unwrap() {
            NativeJsonNode::Number(value) => value.parse::<u64>().unwrap(),
            other => panic!("expected number at {path}, got {other:?}"),
        };
    assert_eq!(number("/cases", &mut ctx), 52);
    assert_eq!(number("/preserved", &mut ctx), 47);
    assert_eq!(number("/changed", &mut ctx), 2);
    assert_eq!(number("/unsupported", &mut ctx), 3);
    assert_eq!(
        oracle.child(&Utf16::from("/package"), &mut ctx).unwrap(),
        &NativeJsonNode::String(Utf16::from("apache-arrow"))
    );
    assert_eq!(
        oracle.child(&Utf16::from("/version"), &mut ctx).unwrap(),
        &NativeJsonNode::String(Utf16::from("21.2.0"))
    );

    let pyarrow = NativeJsonTree::parse_json(
        &include_str!("../../../fixtures/arrow/public-ipc-oracle-results.json")
            .encode_utf16()
            .collect::<Vec<_>>(),
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        pyarrow.child(&Utf16::from("/oracle"), &mut ctx).unwrap(),
        &NativeJsonNode::String(Utf16::from("pyarrow 21.0.0"))
    );
    assert_eq!(
        pyarrow.child(&Utf16::from("/schemas"), &mut ctx).unwrap(),
        &NativeJsonNode::Number("48".to_owned())
    );
}

#[test]
fn rejects_arrow_semantic_and_exact_integer_failures() {
    let mut ctx = Context::ordinary();
    let resources = arrow::ArrowSchemaResources::new(&mut ctx).unwrap();
    let invalid = [
        r#"{"fields":[{"name":"x","nullable":true,"type":{"name":"int","bitWidth":7,"isSigned":true}}]}"#,
        r#"{"fields":[{"name":"x","nullable":true,"type":{"name":"time","unit":"NANOSECOND","bitWidth":32}}]}"#,
        r#"{"fields":[{"name":"x","nullable":true,"type":{"name":"decimal","bitWidth":32,"precision":20,"scale":0}}]}"#,
        r#"{"fields":[{"name":"x","nullable":true,"type":{"name":"list"}}]}"#,
        r#"{"fields":[{"name":"m","nullable":true,"type":{"name":"map","keysSorted":false},"children":[{"name":"entries","nullable":false,"type":{"name":"struct"},"children":[{"name":"key","nullable":true,"type":{"name":"utf8"}},{"name":"value","nullable":true,"type":{"name":"utf8"}}]}]}]}"#,
        r#"{"fields":[{"name":"runs","nullable":true,"type":{"name":"runendencoded"},"children":[{"name":"run_ends","nullable":true,"type":{"name":"int","bitWidth":16,"isSigned":true}},{"name":"values","nullable":true,"type":{"name":"utf8"}}]}]}"#,
        r#"{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":9223372036854775807.5}}]}"#,
        r#"{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":9223372036854775808}}]}"#,
        r#"{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":1e10000}}]}"#,
    ];
    for (i, source) in invalid.iter().enumerate() {
        let mut operation = Context::ordinary();
        assert!(
            arrow::import_arrow_schema(
                source.encode_utf16().collect::<Vec<_>>().as_slice(),
                &Utf16::from(format!("invalid-{i}")),
                &resources,
                &mut operation
            )
            .is_err(),
            "case {i}"
        );
    }
    let valid_scientific = r#"{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":1e3}}]}"#;
    let mut operation = Context::ordinary();
    let document = arrow::import_arrow_schema(
        valid_scientific
            .encode_utf16()
            .collect::<Vec<_>>()
            .as_slice(),
        &Utf16::from("scientific"),
        &resources,
        &mut operation,
    )
    .unwrap();
    let mut operation = Context::ordinary();
    assert!(
        arrow::export_arrow_schema(&document, &resources, &mut operation)
            .unwrap()
            .to_utf8()
            .unwrap()
            .contains("1e3")
    );
}

#[test]
fn reports_unknown_arrow_content_without_discarding_it() {
    let mut ctx = Context::ordinary();
    let resources = arrow::ArrowSchemaResources::new(&mut ctx).unwrap();
    let source = r#"{"fields":[{"name":"x","nullable":true,"futureField":true,"type":{"name":"future_type","parameter":9},"metadata":[{"key":"same","value":"a"},{"key":"same","value":"b"}]}],"futureRoot":true}"#;
    let mut operation = Context::ordinary();
    let document = arrow::import_arrow_schema(
        source.encode_utf16().collect::<Vec<_>>().as_slice(),
        &Utf16::from("unknowns"),
        &resources,
        &mut operation,
    )
    .unwrap();
    let mut operation = Context::ordinary();
    let result = arrow::inspect_arrow(&document, &resources, &mut operation).unwrap();
    let codes = result
        .diagnostics
        .iter()
        .map(|d| d.code.to_utf8().unwrap())
        .collect::<Vec<_>>();
    assert!(codes.iter().any(|c| c == "ARROW_UNKNOWN"));
    assert!(result
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("ARROW_UNKNOWN")
            && d.path == Utf16::from("/fields/0/futureField")));
    assert!(codes.iter().any(|c| c == "ARROW_UNKNOWN_TYPE"));
    assert!(codes.iter().any(|c| c == "ARROW_DUPLICATE_METADATA"));
    let mut operation = Context::ordinary();
    let output = arrow::export_arrow_schema(&document, &resources, &mut operation)
        .unwrap()
        .to_utf8()
        .unwrap();
    assert!(output.contains("futureRoot"));
    assert!(output.contains("futureField"));
    assert!(output.contains("parameter"));

    let future_parameter =
        r#"{"fields":[{"name":"x","nullable":true,"type":{"name":"utf8","futureParam":1.5}}]}"#;
    let mut operation = Context::ordinary();
    let document = arrow::import_arrow_schema(
        future_parameter
            .encode_utf16()
            .collect::<Vec<_>>()
            .as_slice(),
        &Utf16::from("future-parameter"),
        &resources,
        &mut operation,
    )
    .unwrap();
    let mut operation = Context::ordinary();
    let result = arrow::inspect_arrow(&document, &resources, &mut operation).unwrap();
    assert!(result.valid);
    assert!(result
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("ARROW_UNKNOWN")));
    assert!(!result
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("ARROW_INTEGER")));
    let mut operation = Context::ordinary();
    assert!(
        arrow::export_arrow_schema(&document, &resources, &mut operation)
            .unwrap()
            .to_utf8()
            .unwrap()
            .contains("futureParam\":1.5")
    );
}

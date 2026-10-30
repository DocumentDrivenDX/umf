// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::Diagnostic,
    serialization::{read_json_value, Format},
    value::{Utf16, Value},
    Registry,
};

struct NoCaps;
impl Capabilities for NoCaps {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn parse(s: &str) -> Value {
    read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(k, _)| k == &Utf16::from(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn text(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.to_utf8().unwrap(),
        _ => panic!("expected string"),
    }
}
fn object_keys(v: &Value) -> Vec<String> {
    let Value::Object(fields) = v else {
        panic!("expected object");
    };
    fields
        .iter()
        .map(|(key, _)| key.to_utf8().unwrap())
        .collect()
}
fn diff(a: &Value, b: &Value, path: &str) -> Option<String> {
    match (a, b) {
        (Value::Object(left), Value::Object(right)) => {
            if left.len() != right.len() {
                return Some(format!(
                    "{path} object size {} != {}",
                    left.len(),
                    right.len()
                ));
            }
            for (key, value) in left {
                let Some((_, other)) = right.iter().find(|(other_key, _)| other_key == key) else {
                    return Some(format!(
                        "{path}/{} missing",
                        key.to_utf8().unwrap_or_default()
                    ));
                };
                if let Some(found) = diff(
                    value,
                    other,
                    &format!("{path}/{}", key.to_utf8().unwrap_or_default()),
                ) {
                    return Some(found);
                }
            }
            None
        }
        (Value::Array(left), Value::Array(right)) => {
            if left.len() != right.len() {
                return Some(format!(
                    "{path} array size {} != {}",
                    left.len(),
                    right.len()
                ));
            }
            left.iter()
                .zip(right)
                .enumerate()
                .find_map(|(i, (l, r))| diff(l, r, &format!("{path}/{i}")))
        }
        _ if a == b => None,
        _ => Some(format!("{path} values differ: {a:?} != {b:?}")),
    }
}
fn engine() -> Engine {
    Engine::new(
        ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json")),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn run(frozen: &str, engine: &Engine) -> (Value, Value, Value) {
    let case = parse(frozen);
    let source = get(&case, "source").unwrap();
    let source_copy = source.clone();
    let input = get(&case, "input").unwrap();
    let outcome = umf_core::dataset_values::validate_core_dataset_values_compact(
        source,
        input,
        engine,
        &Registry::default(),
        &mut NoCaps,
        &mut Context::ordinary(),
    );
    if let Some(expected) = get(&case, "thrown") {
        let error = outcome.unwrap_err();
        assert_eq!(
            error.code,
            text(get(expected, "code")),
            "{}",
            text(get(&case, "id"))
        );
        assert_eq!(
            error.message.to_utf8().unwrap(),
            text(get(expected, "message")),
            "{}",
            text(get(&case, "id"))
        );
        if let Some(path) = get(expected, "path") {
            assert_eq!(
                error.path,
                *match path {
                    Value::String(s) => s,
                    _ => panic!("path"),
                }
            );
        }
        return (case, Value::Null, source_copy);
    }
    let expected = get(&case, "result").unwrap();
    let actual = outcome.unwrap();
    assert_eq!(
        diff(&actual, expected, ""),
        None,
        "{}",
        text(get(&case, "id"))
    );
    (case, actual, source_copy)
}

fn verify_frozen_compact_case(frozen: &str, engine: &Engine) {
    let case = parse(frozen);
    let receipt = get(&case, "receipt").unwrap();
    let current = get(&case, "current").unwrap();
    let expected_input = get(&case, "expectedInput").unwrap();
    let actual = umf_core::dataset_values::verify_core_dataset_values_compact(
        receipt,
        current,
        expected_input,
        engine,
        &Registry::default(),
        &mut NoCaps,
        &mut Context::ordinary(),
    );
    if let Some(expected_error) = get(&case, "thrown") {
        let error = actual.expect_err("frozen verify refusal must remain a refusal");
        assert_eq!(error.code, text(get(expected_error, "code")));
        assert_eq!(
            error.message,
            *match get(expected_error, "message") {
                Some(Value::String(message)) => message,
                _ => panic!("frozen verify error message must be a string"),
            }
        );
        if let Some(Value::String(path)) = get(expected_error, "path") {
            assert_eq!(error.path, *path);
        }
        return;
    }
    let expected = get(&case, "result").unwrap();
    let actual = actual.expect("frozen verify result must be accepted");
    assert_eq!(
        diff(&actual, expected, ""),
        None,
        "{}",
        text(get(&case, "id"))
    );
}

#[test]
fn frozen_compact_verify_near_limit_pair_matches_cumulative_value_work() {
    let engine = engine();
    verify_frozen_compact_case(
        include_str!("../../../tests/rust-core/fixtures/r5-dataset-values-compact-verify/frozen-near-limit-accepted.json"),
        &engine,
    );
    verify_frozen_compact_case(
        include_str!("../../../tests/rust-core/fixtures/r5-dataset-values-compact-verify/frozen-near-limit-first-refused.json"),
        &engine,
    );
}

#[test]
fn frozen_compact_dataset_envelopes_match_live_typescript() {
    let engine = engine();
    let (commerce_case, commerce, commerce_source) = run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-commerce.json"
        ),
        &engine,
    );
    let receipt = get(&commerce_case, "result").unwrap();
    let input = get(&commerce_case, "input").unwrap();
    let verified = umf_core::dataset_values::verify_core_dataset_values_compact(
        receipt,
        &commerce_source,
        input,
        &engine,
        &Registry::default(),
        &mut NoCaps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(diff(&verified, &commerce, ""), None);
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-supply-chain.json"
        ),
        &engine,
    );
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-archaeology.json"
        ),
        &engine,
    );
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-ecology.json"
        ),
        &engine,
    );
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-unknown-and-residual.json"
        ),
        &engine,
    );
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-absent-state.json"
        ),
        &engine,
    );
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-parallel-links.json"
        ),
        &engine,
    );
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-duplicate-key.json"
        ),
        &engine,
    );
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-missing-links.json"
        ),
        &engine,
    );
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-duplicate-locator.json"
        ),
        &engine,
    );
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-structural-limit.json"
        ),
        &engine,
    );
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-work-limit.json"
        ),
        &engine,
    );
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-present-null.json"
        ),
        &engine,
    );
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-exact-decimal-token.json"
        ),
        &engine,
    );

    let receipt = get(&commerce_case, "result").unwrap();
    let input = get(&commerce_case, "input").unwrap();
    let verified = umf_core::dataset_values::verify_core_dataset_values_compact(
        receipt,
        &commerce_source,
        input,
        &engine,
        &Registry::default(),
        &mut NoCaps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(diff(&verified, &commerce, ""), None);

    let forged = parse(include_str!(
        "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-forged-receipt.json"
    ));
    let error = umf_core::dataset_values::verify_core_dataset_values_compact(
        get(&forged, "receipt").unwrap(),
        get(&forged, "source").unwrap(),
        get(&forged, "input").unwrap(),
        &engine,
        &Registry::default(),
        &mut NoCaps,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    let expected_error = get(&forged, "thrown").unwrap();
    assert_eq!(error.code, text(get(expected_error, "code")));
    assert_eq!(
        error.message.to_utf8().unwrap(),
        text(get(expected_error, "message"))
    );
    if let Some(path) = get(expected_error, "path") {
        assert_eq!(
            error.path,
            *match path {
                Value::String(s) => s,
                _ => panic!("path"),
            }
        );
    }
}

#[test]
fn compact_record_fragment_member_order_matches_public_typescript() {
    let engine = engine();
    let (case, actual, _) = run(
        include_str!("../../../tests/rust-core/fixtures/r5-dataset-values-compact-default-cutover/frozen-commerce.json"),
        &engine,
    );
    let expected = get(&case, "result").unwrap();
    let Value::Array(actual_records) = get(&actual, "records").unwrap() else {
        panic!("expected compact Record array");
    };
    let Value::Array(expected_records) = get(expected, "records").unwrap() else {
        panic!("expected frozen compact Record array");
    };
    assert_eq!(actual_records.len(), expected_records.len());
    for (index, (actual_record, expected_record)) in
        actual_records.iter().zip(expected_records).enumerate()
    {
        let actual_fragment = get(actual_record, "result").unwrap();
        let expected_fragment = get(expected_record, "result").unwrap();
        assert_eq!(
            object_keys(actual_fragment),
            object_keys(expected_fragment),
            "compact Record result member order at record {index}"
        );
    }
}

#[test]
fn frozen_source_input_refusal_precedence_matches_typescript() {
    let engine = engine();
    for (name, expected_code, expected_message) in [
        (
            "frozen-invalid-source-only.json",
            "CORE_DATASET_SOURCE",
            "Valid current core 0.10.0 source required",
        ),
        (
            "frozen-invalid-input-only.json",
            "CORE_DATASET_INPUT",
            "Dataset request violates its versioned operation schema",
        ),
        (
            "frozen-crossed-invalid-source-input.json",
            "CORE_DATASET_SOURCE",
            "Valid current core 0.10.0 source required",
        ),
    ] {
        let source = match name {
            "frozen-invalid-source-only.json" => include_str!("../../../tests/rust-core/fixtures/r5-dataset-values-compact-default-cutover/frozen-invalid-source-only.json"),
            "frozen-invalid-input-only.json" => include_str!("../../../tests/rust-core/fixtures/r5-dataset-values-compact-default-cutover/frozen-invalid-input-only.json"),
            _ => include_str!("../../../tests/rust-core/fixtures/r5-dataset-values-compact-default-cutover/frozen-crossed-invalid-source-input.json"),
        };
        let case = parse(source);
        let error = umf_core::dataset_values::validate_core_dataset_values_compact(
            get(&case, "source").unwrap(),
            get(&case, "input").unwrap(),
            &engine,
            &Registry::default(),
            &mut NoCaps,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        let expected = get(&case, "thrown").unwrap();
        assert_eq!(text(get(expected, "code")), expected_code, "{name}");
        assert_eq!(error.code, expected_code, "{name}");
        assert_eq!(error.message.to_utf8().unwrap(), expected_message, "{name}");
        assert_eq!(
            error.message,
            *get(expected, "message")
                .and_then(|v| match v {
                    Value::String(s) => Some(s),
                    _ => None,
                })
                .unwrap()
        );
    }
}

#[test]
fn staged_compact_verification_receipt_prefix_matches_full_verifier() {
    let engine = engine();
    let case = parse(include_str!("../../../tests/rust-core/fixtures/r5-dataset-values-compact-default-cutover/frozen-commerce.json"));
    let receipt = get(&case, "result").unwrap();
    let current = get(&case, "source").unwrap();
    let expected_input = get(&case, "input").unwrap();
    let prepared = umf_core::dataset_values::prepare_core_dataset_values_compact_verification(
        receipt,
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap();
    let staged = umf_core::dataset_values::verify_core_dataset_values_compact(
        &prepared,
        current,
        expected_input,
        &engine,
        &Registry::default(),
        &mut NoCaps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(diff(&staged, receipt, ""), None);

    let malformed = Value::Object(vec![(Utf16::from("valid"), Value::Bool(false))]);
    let error = umf_core::dataset_values::prepare_core_dataset_values_compact_verification(
        &malformed,
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(error.code, "CORE_DATASET_COMPACT_RECEIPT");
}

#[test]
fn compact_verify_copies_expected_input_before_stale_current_refusal() {
    let engine = engine();
    let case = parse(include_str!("../../../tests/rust-core/fixtures/r5-dataset-values-compact-default-cutover/frozen-commerce.json"));
    let receipt = get(&case, "result").unwrap();
    let stale_current = Value::Object(Vec::new());
    let expected_input = Value::Object(vec![(
        Utf16::from("invalid-but-copyable"),
        Value::String(Utf16::from("x".repeat(64_000))),
    )]);
    let mut charged = 0usize;
    let mut meter = |amount: usize| {
        charged = charged.saturating_add(amount);
        Ok(())
    };
    let error = umf_core::dataset_values::verify_core_dataset_values_compact(
        receipt,
        &stale_current,
        &expected_input,
        &engine,
        &Registry::default(),
        &mut NoCaps,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "CORE_DATASET_COMPACT_RECEIPT");
    assert!(
        charged >= 64_000,
        "expectedInput copy work was not charged: {charged}"
    );
}

#[test]
fn compact_verify_recomputes_from_canonically_equal_host_order() {
    let engine = engine();
    let case = parse(include_str!("../../../tests/rust-core/fixtures/r5-dataset-values-compact-default-cutover/frozen-commerce.json"));
    let receipt = get(&case, "result").unwrap();
    let mut current = get(&case, "source").unwrap().clone();
    let mut expected_input = get(&case, "input").unwrap().clone();
    if let Value::Object(fields) = &mut current {
        fields.reverse();
    }
    if let Value::Object(fields) = &mut expected_input {
        fields.reverse();
    }
    let verified = umf_core::dataset_values::verify_core_dataset_values_compact(
        receipt,
        &current,
        &expected_input,
        &engine,
        &Registry::default(),
        &mut NoCaps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        object_keys(get(&verified, "source").unwrap()),
        object_keys(&current)
    );
    assert_eq!(
        object_keys(get(&verified, "input").unwrap()),
        object_keys(&expected_input)
    );
}

#[test]
fn frozen_typescript_near_threshold_controls_are_adjacent_and_source_bound() {
    let accepted = parse(include_str!(
        "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-near-threshold-accepted.json"
    ));
    let refused = parse(include_str!(
        "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-near-threshold-first-refused.json"
    ));
    let accepted_count = match get(get(&accepted, "input").unwrap(), "records").unwrap() {
        Value::Array(records) => records.len(),
        _ => panic!("accepted records"),
    };
    let refused_count = match get(get(&refused, "input").unwrap(), "records").unwrap() {
        Value::Array(records) => records.len(),
        _ => panic!("refused records"),
    };
    assert_eq!(accepted_count + 1, refused_count);
    assert_eq!(accepted_count, 349);
    assert_eq!(refused_count, 350);
    assert_eq!(
        get(get(&accepted, "work").unwrap(), "used"),
        Some(&Value::Number(998_489.0))
    );
    let thrown = get(&refused, "thrown").unwrap();
    assert_eq!(text(get(thrown, "code")), "LIMIT");
    assert_eq!(
        text(get(thrown, "message")),
        "Compact dataset JSON traversal/copy/semantic budget exceeded"
    );
}

#[test]
fn production_compact_work_ledger_matches_near_threshold_admission() {
    let engine = engine();
    run(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-near-threshold-accepted.json"
        ),
        &engine,
    );
    let refused = parse(include_str!(
        "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-near-threshold-first-refused.json"
    ));
    let outcome = umf_core::dataset_values::validate_core_dataset_values_compact(
        get(&refused, "source").unwrap(),
        get(&refused, "input").unwrap(),
        &engine,
        &Registry::default(),
        &mut NoCaps,
        &mut Context::ordinary(),
    );
    let error =
        outcome.expect_err("the first TS-refused input must hit the production ledger limit");
    assert_eq!(error.code, "LIMIT");
    assert_eq!(
        error.message.to_utf8().unwrap(),
        "Compact dataset JSON traversal/copy/semantic budget exceeded"
    );
    assert!(error.path.is_empty());
}

#[test]
fn direct_compact_api_bounds_caller_owned_tree_depth_without_recursing() {
    fn replace_title(source: &mut Value, value: Value) {
        let Value::Object(members) = source else {
            panic!("commerce source is an object")
        };
        let (_, title) = members
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("title"))
            .expect("commerce source has a title");
        *title = value;
    }
    fn nested_arrays(depth: usize) -> Value {
        let mut value = Value::Null;
        for _ in 0..depth {
            value = Value::Array(vec![value]);
        }
        value
    }
    fn validate(
        source: &Value,
        input: &Value,
        engine: &Engine,
    ) -> Result<Value, umf_core::error::EngineError> {
        umf_core::dataset_values::validate_core_dataset_values_compact(
            source,
            input,
            engine,
            &Registry::default(),
            &mut NoCaps,
            &mut Context::ordinary(),
        )
    }

    let case = parse(include_str!(
        "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-commerce.json"
    ));
    let source = get(&case, "source").unwrap();
    let input = get(&case, "input").unwrap();
    let engine = engine();

    // `title` is one level below the source root, so 127 nested arrays put the
    // leaf exactly at the ordinary Context max_depth of 128.
    let mut at_limit = source.clone();
    replace_title(&mut at_limit, nested_arrays(127));
    let error = validate(&at_limit, input, &engine)
        .expect_err("the malformed title must fail source validation");
    assert_ne!(
        error.message.to_utf8().unwrap(),
        "JSON structural limit exceeded"
    );

    let mut over_limit = source.clone();
    replace_title(&mut over_limit, nested_arrays(128));
    let error = validate(&over_limit, input, &engine)
        .expect_err("a direct caller tree beyond max_depth must be refused");
    assert_eq!(error.code, "LIMIT");
    assert_eq!(
        error.message.to_utf8().unwrap(),
        "JSON structural limit exceeded"
    );
    assert_eq!(
        error.path.to_utf8().unwrap(),
        format!("/title{}", "/0".repeat(128))
    );
}

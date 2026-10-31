// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value,
    serialization::{Format, read_json_value},
};
use umf_core_wire::{
    decode, encode, execute_request, execute_request_with_control, transport_context,
};

struct NoCaps;
impl Capabilities for NoCaps {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn parse(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}

fn text(source: &str) -> Value {
    Value::String(Utf16::from(source))
}

fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(candidate, _)| candidate == &Utf16::from(key))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn first_diff(left: &Value, right: &Value, path: &str) -> Option<String> {
    match (left, right) {
        (Value::Object(left), Value::Object(right)) => {
            if left.len() != right.len() {
                return Some(format!("{path} object member count differs"));
            }
            for (index, (key, value)) in left.iter().enumerate() {
                // Compare each duplicate key occurrence with the same ordinal
                // on the other side; member order is ignored, multiplicity
                // and UTF-16 key/value contents are not.
                let occurrence = left[..index]
                    .iter()
                    .filter(|(candidate, _)| candidate == key)
                    .count();
                let Some((_, other)) = right
                    .iter()
                    .filter(|(candidate, _)| candidate == key)
                    .nth(occurrence)
                else {
                    return Some(format!(
                        "{path}/u16:{:?} missing occurrence {occurrence}",
                        key.units()
                    ));
                };
                if let Some(diff) =
                    first_diff(value, other, &format!("{path}/u16:{:?}", key.units()))
                {
                    return Some(diff);
                }
            }
            None
        }
        (Value::Array(left), Value::Array(right)) => {
            if left.len() != right.len() {
                return Some(format!("{path} array length differs"));
            }
            left.iter()
                .zip(right)
                .enumerate()
                .find_map(|(index, (a, b))| first_diff(a, b, &format!("{path}/{index}")))
        }
        _ if left == right => None,
        _ => Some(format!("{path} scalar value differs")),
    }
}

fn resources() -> Value {
    Value::Object(
        [
            (
                Utf16::from("coreSchema"),
                parse(include_str!("../../../spec/core/schema.json")),
            ),
            (
                Utf16::from("referenceSchema"),
                parse(include_str!(
                    "../../../spec/core/semantic-type-reference.schema.json"
                )),
            ),
            (
                Utf16::from("packageSchema"),
                parse(include_str!(
                    "../../../spec/core/extension-package.schema.json"
                )),
            ),
            (
                Utf16::from("constraints"),
                parse(include_str!(
                    "../../../spec/metamodel/generated/core-constraints.json"
                )),
            ),
            (
                Utf16::from("domainPolicy"),
                parse(include_str!(
                    "../../../spec/metamodel/generated/domain-policy.json"
                )),
            ),
        ]
        .into_iter()
        .collect(),
    )
}

fn request(op: &str, fields: Vec<(Utf16, Value)>) -> String {
    let mut members = vec![
        (Utf16::from("op"), text(op)),
        (Utf16::from("resources"), resources()),
    ];
    members.extend(fields);
    let wire = encode(
        &Value::Object(members.into_iter().collect()),
        &mut transport_context(),
    )
    .unwrap();
    wire
}

fn assert_refusal(response: &Value, expected: &Value, case: &str) {
    assert_eq!(get(response, "status"), Some(&text("error")), "{case}");
    assert_eq!(get(response, "code"), get(expected, "code"), "{case}");
    let path = match get(expected, "path").unwrap() {
        Value::String(value) => value,
        _ => panic!("expected refusal path string"),
    };
    let message = match get(expected, "message").unwrap() {
        Value::String(value) => value,
        _ => panic!("expected refusal message string"),
    };
    assert_eq!(
        get(response, "pathUnits"),
        Some(&Value::Array(
            path.units()
                .iter()
                .map(|unit| Value::Number(*unit as f64))
                .collect()
        )),
        "{case} path",
    );
    assert_eq!(
        get(response, "messageUnits"),
        Some(&Value::Array(
            message
                .units()
                .iter()
                .map(|unit| Value::Number(*unit as f64))
                .collect()
        )),
        "{case} message",
    );
}

fn assert_success(response: &Value, expected: &Value, case: &str) {
    assert_eq!(get(response, "status"), Some(&text("ok")), "{case}");
    let wire = match get(response, "wire").unwrap() {
        Value::String(value) => value.to_utf8().unwrap(),
        _ => panic!("expected result wire"),
    };
    let actual = decode(&wire, &mut transport_context()).unwrap();
    assert_eq!(
        first_diff(&actual, expected, ""),
        None,
        "{case} complete result envelope"
    );
}

fn validate_case(case_json: &str, name: &str) -> (Value, Value, Value) {
    let case = parse(case_json);
    let source = get(&case, "source").unwrap().clone();
    let input = get(&case, "input").unwrap().clone();
    let encoded = request(
        "model/validateCoreDatasetValuesCompact",
        vec![
            (Utf16::from("source"), source.clone()),
            (Utf16::from("input"), input.clone()),
        ],
    );
    let response = parse(&execute_request(
        &encoded,
        ResourceProfile::Cooperative,
        &mut NoCaps,
    ));
    if let Some(expected_error) = get(&case, "thrown") {
        assert_refusal(&response, expected_error, name);
        (case, source, Value::Null)
    } else {
        let expected = get(&case, "result").unwrap();
        assert_success(&response, expected, name);
        (case, source, input)
    }
}

#[test]
fn compact_dataset_wire_structural_limit_case_reaches_predecessor_refusal() {
    let (_, _, _) = validate_case(
        include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-structural-limit.json"
        ),
        "structural-limit",
    );
}

#[test]
fn compact_dataset_wire_matches_all_frozen_envelopes_and_refusals() {
    let cases = [
        (
            "commerce",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-commerce.json"
            ),
        ),
        (
            "supply-chain",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-supply-chain.json"
            ),
        ),
        (
            "archaeology",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-archaeology.json"
            ),
        ),
        (
            "ecology",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-ecology.json"
            ),
        ),
        (
            "unknown-and-residual",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-unknown-and-residual.json"
            ),
        ),
        (
            "absent-state",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-absent-state.json"
            ),
        ),
        (
            "present-null",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-present-null.json"
            ),
        ),
        (
            "exact-decimal-token",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-exact-decimal-token.json"
            ),
        ),
        (
            "duplicate-key",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-duplicate-key.json"
            ),
        ),
        (
            "duplicate-locator",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-duplicate-locator.json"
            ),
        ),
        (
            "missing-links",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-missing-links.json"
            ),
        ),
        (
            "parallel-links",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-parallel-links.json"
            ),
        ),
        (
            "structural-limit",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-structural-limit.json"
            ),
        ),
        (
            "work-limit",
            include_str!(
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-work-limit.json"
            ),
        ),
    ];
    for (name, case_json) in cases {
        let (case, source, input) = validate_case(case_json, name);
        if let Some(expected) = get(&case, "verify") {
            let receipt = expected.clone();
            let prepare_request = request(
                "model/prepareCoreDatasetValuesCompactVerification",
                vec![(Utf16::from("receipt"), receipt.clone())],
            );
            let prepare_response = parse(&execute_request(
                &prepare_request,
                ResourceProfile::Cooperative,
                &mut NoCaps,
            ));
            assert_eq!(
                get(&prepare_response, "status"),
                Some(&text("ok")),
                "{name} receipt-only prepare"
            );
            let prepared_wire = match get(&prepare_response, "wire").unwrap() {
                Value::String(value) => value.to_utf8().unwrap(),
                _ => panic!("expected prepared receipt wire"),
            };
            let prepared_receipt = decode(&prepared_wire, &mut transport_context()).unwrap();
            assert_eq!(
                first_diff(&prepared_receipt, &receipt, ""),
                None,
                "{name} prepared receipt"
            );
            let encoded = request(
                "model/verifyCoreDatasetValuesCompact",
                vec![
                    (Utf16::from("receipt"), prepared_receipt),
                    (Utf16::from("current"), source),
                    (Utf16::from("expectedInput"), input),
                ],
            );
            let response = parse(&execute_request(
                &encoded,
                ResourceProfile::Cooperative,
                &mut NoCaps,
            ));
            assert_success(&response, expected, &format!("{name} verifier"));
        }
    }

    let forged = parse(include_str!(
        "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-forged-receipt.json"
    ));
    let encoded = request(
        "model/verifyCoreDatasetValuesCompact",
        vec![
            (
                Utf16::from("receipt"),
                get(&forged, "receipt").unwrap().clone(),
            ),
            (
                Utf16::from("current"),
                get(&forged, "source").unwrap().clone(),
            ),
            (
                Utf16::from("expectedInput"),
                get(&forged, "input").unwrap().clone(),
            ),
        ],
    );
    let response = parse(&execute_request(
        &encoded,
        ResourceProfile::Cooperative,
        &mut NoCaps,
    ));
    assert_refusal(
        &response,
        get(&forged, "thrown").unwrap(),
        "forged receipt verifier",
    );
}

#[test]
fn compact_dataset_wire_preserves_349_350_limit_and_host_cancellation() {
    let accepted = parse(include_str!(
        "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-near-threshold-accepted.json"
    ));
    let accepted_request = request(
        "model/validateCoreDatasetValuesCompact",
        vec![
            (
                Utf16::from("source"),
                get(&accepted, "source").unwrap().clone(),
            ),
            (
                Utf16::from("input"),
                get(&accepted, "input").unwrap().clone(),
            ),
        ],
    );
    let accepted_response = parse(&execute_request(
        &accepted_request,
        ResourceProfile::Cooperative,
        &mut NoCaps,
    ));
    assert_success(
        &accepted_response,
        get(&accepted, "result").unwrap(),
        "349 accepted",
    );

    let refused = parse(include_str!(
        "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-near-threshold-first-refused.json"
    ));
    let refused_request = request(
        "model/validateCoreDatasetValuesCompact",
        vec![
            (
                Utf16::from("source"),
                get(&refused, "source").unwrap().clone(),
            ),
            (
                Utf16::from("input"),
                get(&refused, "input").unwrap().clone(),
            ),
        ],
    );
    let refused_response = parse(&execute_request(
        &refused_request,
        ResourceProfile::Cooperative,
        &mut NoCaps,
    ));
    assert_refusal(
        &refused_response,
        get(&refused, "thrown").unwrap(),
        "350 refused",
    );

    let commerce = parse(include_str!(
        "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-commerce.json"
    ));
    let cancelled_request = request(
        "model/validateCoreDatasetValuesCompact",
        vec![
            (
                Utf16::from("source"),
                get(&commerce, "source").unwrap().clone(),
            ),
            (
                Utf16::from("input"),
                get(&commerce, "input").unwrap().clone(),
            ),
        ],
    );
    let mut cancel = |_amount: usize| {
        Err(umf_core::error::EngineError::new(
            "CANCELLED",
            Utf16::default(),
            "Operation cancelled by host",
        ))
    };
    let response = parse(&execute_request_with_control(
        &cancelled_request,
        ResourceProfile::Cooperative,
        &mut NoCaps,
        &mut cancel,
    ));
    assert_eq!(get(&response, "status"), Some(&text("error")));
    assert_eq!(get(&response, "code"), Some(&text("CANCELLED")));
}

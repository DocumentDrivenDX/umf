// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
    Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value,
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
            let left_keys = left.iter().map(|(key, _)| key.units()).collect::<Vec<_>>();
            let right_keys = right.iter().map(|(key, _)| key.units()).collect::<Vec<_>>();
            if left_keys != right_keys {
                return Some(format!(
                    "{path} object member order differs: {left_keys:?} != {right_keys:?}"
                ));
            }
            for (index, (key, value)) in left.iter().enumerate() {
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
    encode(
        &Value::Object(members.into_iter().collect()),
        &mut transport_context(),
    )
    .unwrap()
}

fn assert_success(response: &Value, expected: &Value, case: &str) {
    assert_eq!(
        get(response, "status"),
        Some(&text("ok")),
        "{case} response: {response:?}"
    );
    let wire = match get(response, "wire").unwrap() {
        Value::String(value) => value.to_utf8().unwrap(),
        _ => panic!("expected result wire"),
    };
    let actual = decode(&wire, &mut transport_context()).unwrap();
    assert_eq!(
        first_diff(&actual, expected, ""),
        None,
        "{case} complete receipt"
    );
}

fn assert_refusal(response: &Value, expected: &Value, case: &str) {
    assert_eq!(get(response, "status"), Some(&text("error")), "{case}");
    assert_eq!(get(response, "code"), get(expected, "code"), "{case}");
    let expected_code = get(expected, "code");
    let expected_path = match get(expected, "path") {
        Some(Value::String(path)) => path.clone(),
        _ if expected_code == Some(&text("CORE_DATASET_INPUT")) => Utf16::from("/input"),
        _ if expected_code == Some(&text("CORE_DATASET_SOURCE")) => Utf16::from("/source"),
        _ => Utf16::default(),
    };
    let expected_message = match get(expected, "message") {
        Some(Value::String(message)) => message,
        _ => panic!("expected frozen error message"),
    };
    assert_eq!(
        get(response, "pathUnits"),
        Some(&Value::Array(
            expected_path
                .units()
                .iter()
                .map(|unit| Value::Number(*unit as f64))
                .collect()
        )),
        "{case} path"
    );
    assert_eq!(
        get(response, "messageUnits"),
        Some(&Value::Array(
            expected_message
                .units()
                .iter()
                .map(|unit| Value::Number(*unit as f64))
                .collect()
        )),
        "{case} message"
    );
}

fn validate_case(frozen: &str, name: &str) {
    let case = parse(frozen);
    let request = request(
        "model/validateCoreDatasetValues",
        vec![
            (Utf16::from("source"), get(&case, "source").unwrap().clone()),
            (Utf16::from("input"), get(&case, "input").unwrap().clone()),
        ],
    );
    let response = parse(&execute_request(
        &request,
        ResourceProfile::Cooperative,
        &mut NoCaps,
    ));
    let outcome = get(&case, "outcome").unwrap();
    if get(outcome, "ok") == Some(&Value::Bool(true)) {
        assert_success(&response, get(outcome, "value").unwrap(), name);
    } else {
        assert_refusal(&response, get(outcome, "error").unwrap(), name);
    }
}

fn verify_case(frozen: &str, name: &str) {
    let case = parse(frozen);
    let request = request(
        "model/verifyCoreDatasetValues",
        vec![
            (
                Utf16::from("receipt"),
                get(&case, "receipt").unwrap().clone(),
            ),
            (
                Utf16::from("current"),
                get(&case, "current").unwrap().clone(),
            ),
            (
                Utf16::from("expectedInput"),
                get(&case, "expectedInput").unwrap().clone(),
            ),
        ],
    );
    let response = parse(&execute_request(
        &request,
        ResourceProfile::Cooperative,
        &mut NoCaps,
    ));
    let outcome = get(&case, "outcome").unwrap();
    if get(outcome, "ok") == Some(&Value::Bool(true)) {
        assert_success(&response, get(outcome, "value").unwrap(), name);
    } else {
        assert_refusal(&response, get(outcome, "error").unwrap(), name);
    }
}

macro_rules! frozen_validate_test {
    ($test_name:ident, $case_name:literal, $frozen:literal) => {
        #[test]
        fn $test_name() {
            validate_case(
                include_str!(concat!(
                    "../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/",
                    $frozen
                )),
                $case_name,
            );
        }
    };
}

frozen_validate_test!(
    full_dataset_validate_commerce_matches_typescript,
    "commerce",
    "frozen-commerce.json"
);
frozen_validate_test!(
    full_dataset_validate_closed_scope_matches_typescript,
    "closed_scope",
    "frozen-closed_scope.json"
);
frozen_validate_test!(
    full_dataset_validate_duplicate_instance_matches_typescript,
    "duplicate_instance",
    "frozen-duplicate_instance.json"
);
frozen_validate_test!(
    full_dataset_validate_unknown_source_meaning_matches_typescript,
    "unknown_source_meaning",
    "frozen-unknown_source_meaning.json"
);
frozen_validate_test!(
    full_dataset_validate_supplementary_and_surrogate_matches_typescript,
    "supplementary_and_surrogate",
    "frozen-supplementary_and_surrogate.json"
);
frozen_validate_test!(
    full_dataset_validate_unsupported_lifecycle_matches_typescript,
    "unsupported_lifecycle",
    "frozen-unsupported_lifecycle.json"
);
frozen_validate_test!(
    full_dataset_validate_oversized_matches_typescript,
    "oversized",
    "frozen-oversized.json"
);

#[test]
fn frozen_full_dataset_verify_results_and_refusals_match_typescript() {
    for (name, frozen) in [
        (
            "valid_commerce",
            include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-verify-valid_commerce.json"),
        ),
        (
            "stale_source",
            include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-verify-stale_source.json"),
        ),
        (
            "stale_input",
            include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-verify-stale_input.json"),
        ),
        (
            "forged_result",
            include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-verify-forged_result.json"),
        ),
    ] {
        verify_case(frozen, name);
    }
}

#[test]
fn full_dataset_operation_preserves_host_cancellation() {
    let case = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-commerce.json"
    ));
    let wire = request(
        "model/validateCoreDatasetValues",
        vec![
            (Utf16::from("source"), get(&case, "source").unwrap().clone()),
            (Utf16::from("input"), get(&case, "input").unwrap().clone()),
        ],
    );
    let mut control = |_| {
        Err(umf_core::error::EngineError::new(
            "CANCELLED",
            Utf16::default(),
            "cancelled by host",
        ))
    };
    let response = parse(&execute_request_with_control(
        &wire,
        ResourceProfile::Cooperative,
        &mut NoCaps,
        &mut control,
    ));
    assert_eq!(get(&response, "status"), Some(&text("error")));
    assert_eq!(get(&response, "code"), Some(&text("CANCELLED")));
}

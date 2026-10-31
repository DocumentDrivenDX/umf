// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value,
    serialization::{Format, read_json_value, write_json_value},
};
use umf_core_wire::{
    decode, encode, execute_request, execute_request_with_control, transport_context,
};

struct NoCapabilities;
impl Capabilities for NoCapabilities {
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
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn set(value: &mut Value, name: &str, next: Value) {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    let key = Utf16::from(name);
    if let Some((_, value)) = fields.iter_mut().find(|(existing, _)| existing == &key) {
        *value = next;
    } else {
        fields.push((key, next));
    }
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (key.into(), value))
            .collect(),
    )
}
fn semantic_equal(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Array(left), Value::Array(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .zip(right)
                    .all(|(left, right)| semantic_equal(left, right))
        }
        (Value::Object(left), Value::Object(right)) => {
            if left.len() != right.len() {
                return false;
            }
            let mut matched = vec![false; right.len()];
            for (key, value) in left {
                let Some(index) =
                    right
                        .iter()
                        .enumerate()
                        .position(|(index, (other_key, other_value))| {
                            !matched[index]
                                && key == other_key
                                && semantic_equal(value, other_value)
                        })
                else {
                    return false;
                };
                matched[index] = true;
            }
            true
        }
        _ => left == right,
    }
}
fn resources() -> Value {
    Value::Object(vec![
        (
            "coreSchema".into(),
            parse(include_str!("../../../spec/core/schema.json")),
        ),
        (
            "referenceSchema".into(),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
        ),
        (
            "packageSchema".into(),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
        ),
        (
            "constraints".into(),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
        ),
        (
            "domainPolicy".into(),
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
    ])
}
fn request(op: &str, args: &[(&str, &Value)]) -> String {
    let mut fields = vec![
        ("op".into(), Value::String(op.into())),
        ("resources".into(), resources()),
    ];
    fields.extend(
        args.iter()
            .map(|(name, value)| (Utf16::from(*name), (*value).clone())),
    );
    encode(&Value::Object(fields), &mut transport_context()).unwrap()
}
fn run(op: &str, args: &[(&str, &Value)]) -> (serde_json::Value, Option<Value>) {
    let mut caps = NoCapabilities;
    decode_response(execute_request(
        &request(op, args),
        ResourceProfile::Cooperative,
        &mut caps,
    ))
}
fn run_control(op: &str, args: &[(&str, &Value)], code: &'static str) -> serde_json::Value {
    let mut caps = NoCapabilities;
    let mut calls = 0usize;
    let mut control = |_: usize| {
        calls += 1;
        if calls >= 2 {
            Err(umf_core::EngineError::new(
                code,
                Utf16::default(),
                "host stopped relationship operation",
            ))
        } else {
            Ok(())
        }
    };
    let text = execute_request_with_control(
        &request(op, args),
        ResourceProfile::Cooperative,
        &mut caps,
        &mut control,
    );
    serde_json::from_str(&text).unwrap()
}
fn decode_response(text: String) -> (serde_json::Value, Option<Value>) {
    let response: serde_json::Value = serde_json::from_str(&text).unwrap();
    let result = if response["status"] == "ok" {
        Some(
            decode(
                response["wire"].as_str().expect("success wire"),
                &mut transport_context(),
            )
            .unwrap(),
        )
    } else {
        None
    };
    (response, result)
}
fn assert_expected(
    response: &serde_json::Value,
    actual: Option<Value>,
    expected: &Value,
    label: &str,
) {
    if let Some(value) = get(expected, "value") {
        assert_eq!(response["status"], "ok", "{label}: {response}");
        assert!(
            actual
                .as_ref()
                .is_some_and(|actual| semantic_equal(actual, value)),
            "{label}: semantic value differs"
        );
    } else {
        let error = get(expected, "error").expect("expected error envelope");
        let string = |name: &str| {
            get(error, name)
                .and_then(|value| match value {
                    Value::String(text) => Some(text.units().to_vec()),
                    _ => None,
                })
                .unwrap()
        };
        assert_eq!(response["status"], "error", "{label}: {response}");
        assert_eq!(
            response["code"],
            String::from_utf16_lossy(&string("code")),
            "{label}"
        );
        assert_eq!(
            response["messageUnits"],
            serde_json::json!(string("message")),
            "{label}"
        );
        assert_eq!(
            response["pathUnits"],
            serde_json::json!(string("path")),
            "{label}"
        );
    }
}

#[test]
fn tagged_relationship_operations_match_all_frozen_predecessor_cases() {
    let frozen = parse(include_str!(
        "../../../tests/rust-core/fixtures/r5-core-relationships/frozen-typescript.json"
    ));
    let cases = get(&frozen, "cases").unwrap();
    let outcomes = get(&frozen, "outcomes").unwrap();
    let Value::Object(rows) = cases else {
        panic!("frozen cases")
    };
    for (name, case) in rows {
        let id = name.to_utf8().unwrap();
        let source = get(case, "source").unwrap();
        let identity = get(case, "identity").unwrap();
        let request_value = get(case, "request");
        let (op, mut args) = match id.as_str() {
            "inspect_known"
            | "inspect_missing"
            | "inspect_unknown_meaning"
            | "invalid_identity_before_invalid_source"
            | "old_core_version_refused" => (
                "model/inspectCoreRelationships",
                vec![("source", source), ("identity", identity)],
            ),
            "lookup_stable_id"
            | "lookup_unknown_meaning"
            | "lookup_absent_id"
            | "invalid_lookup_identity_before_invalid_source"
            | "unknown_path_utf16_and_pointer_escape" => (
                "model/lookupCoreRelationship",
                vec![("source", source), ("identity", identity)],
            ),
            _ => (
                "model/declareCoreRelationship",
                vec![
                    ("source", source),
                    ("identity", identity),
                    ("request", request_value.expect("request case")),
                ],
            ),
        };
        let expected = get(outcomes, &id).unwrap();
        if id == "unknown_path_utf16_and_pointer_escape" {
            let (response, actual) = run(op, &args);
            assert_eq!(response["status"], "ok", "{id}: {response}");
            let view = actual.unwrap();
            let expected_view = get(get(expected, "value").unwrap(), "view").unwrap();
            assert!(
                semantic_equal(&view, expected_view),
                "{id}: semantic view differs"
            );
            let path = get(get(expected, "value").unwrap(), "expectedPath").unwrap();
            let uninterpreted = get(&view, "uninterpretedPaths").unwrap();
            assert!(
                matches!(uninterpreted, Value::Array(paths) if paths.iter().any(|candidate| candidate == path)),
                "{id} UTF-16 pointer path"
            );
        } else {
            let (response, actual) = run(op, &args);
            assert_expected(&response, actual, expected, &id);
        }
        args.clear();
    }
}

#[test]
fn tagged_relationship_receipts_limits_copy_and_controls_are_preserved() {
    let frozen = parse(include_str!(
        "../../../tests/rust-core/fixtures/r5-core-relationships/frozen-typescript.json"
    ));
    let cases = get(&frozen, "cases").unwrap();
    let outcomes = get(&frozen, "outcomes").unwrap();
    let author = get(cases, "author_new_relationship").unwrap();
    let (_, receipt) = run(
        "model/declareCoreRelationship",
        &[
            ("source", get(author, "source").unwrap()),
            ("identity", get(author, "identity").unwrap()),
            ("request", get(author, "request").unwrap()),
        ],
    );
    let receipt = receipt.unwrap();
    let current = get(&receipt, "target").unwrap();

    let inspect = get(cases, "inspect_known").unwrap();
    let inspect_source = get(inspect, "source").unwrap().clone();
    let inspect_before = inspect_source.clone();
    let (_, mut inspected) = run(
        "model/inspectCoreRelationships",
        &[
            ("source", &inspect_source),
            ("identity", get(inspect, "identity").unwrap()),
        ],
    );
    let inspected = inspected.as_mut().unwrap();
    let unknown = get_mut(
        get_mut(
            get_mut(get_mut(inspected, "source").unwrap(), "extensions").unwrap(),
            "future",
        )
        .unwrap(),
        "unknown",
    )
    .unwrap();
    let Value::Array(values) = unknown else {
        panic!("unknown extension array")
    };
    values[0] = Value::String("mutated-result".into());
    assert!(
        semantic_equal(&inspect_source, &inspect_before),
        "wire inspection result aliases caller source"
    );

    for format in [Format::Json, Format::Yaml] {
        let text = write_json_value(&receipt, format, &mut Context::ordinary()).unwrap();
        let decoded = read_json_value(text.units(), format, &mut Context::ordinary()).unwrap();
        let (response, actual) = run(
            "model/verifyCoreRelationshipOperation",
            &[("receipt", &decoded), ("current", current)],
        );
        assert_expected(
            &response,
            actual,
            get(
                outcomes,
                if format == Format::Json {
                    "verify_roundtrip_json"
                } else {
                    "verify_roundtrip_yaml"
                },
            )
            .unwrap(),
            "receipt roundtrip",
        );
    }
    let mut forged = receipt.clone();
    let provenance = get(&forged, "provenance").unwrap().clone();
    let mut wrong = provenance;
    set(&mut wrong, "idealPath", Value::String("/wrong".into()));
    set(&mut forged, "provenance", wrong);
    let (response, actual) = run(
        "model/verifyCoreRelationshipOperation",
        &[("receipt", &forged), ("current", current)],
    );
    assert_expected(
        &response,
        actual,
        get(outcomes, "verify_forged_receipt").unwrap(),
        "forged receipt",
    );

    let mut oversized = get(get(cases, "inspect_missing").unwrap(), "source")
        .unwrap()
        .clone();
    set(
        &mut oversized,
        "unknownPayload",
        Value::Array((0..100_001).map(|_| Value::Null).collect()),
    );
    let identity = get(get(cases, "inspect_missing").unwrap(), "identity").unwrap();
    let aggregate_case = get(cases, "aggregate_output_limit_refusal").unwrap();
    let aggregate_source = get(aggregate_case, "source").unwrap().clone();
    let (response, actual) = run(
        "model/declareCoreRelationship",
        &[
            ("source", &aggregate_source),
            ("identity", get(aggregate_case, "identity").unwrap()),
            ("request", get(aggregate_case, "request").unwrap()),
        ],
    );
    assert_expected(
        &response,
        actual,
        get(outcomes, "aggregate_output_limit_refusal").unwrap(),
        "aggregate output limit",
    );
    assert!(
        semantic_equal(&aggregate_source, get(aggregate_case, "source").unwrap()),
        "aggregate refusal mutated source"
    );
    let (response, actual) = run(
        "model/inspectCoreRelationships",
        &[("source", &oversized), ("identity", identity)],
    );
    assert_expected(
        &response,
        actual,
        get(outcomes, "value_limit_refusal").unwrap(),
        "value limit",
    );

    let mut deep = get(get(cases, "inspect_missing").unwrap(), "source")
        .unwrap()
        .clone();
    let mut chain = Value::Null;
    for _ in 0..129 {
        chain = object(vec![("n", chain)]);
    }
    set(&mut deep, "n", chain);
    let (response, actual) = run(
        "model/inspectCoreRelationships",
        &[("source", &deep), ("identity", identity)],
    );
    assert_expected(
        &response,
        actual,
        get(outcomes, "depth_limit_refusal").unwrap(),
        "depth limit",
    );

    let control = run_control(
        "model/verifyCoreRelationshipOperation",
        &[("receipt", &receipt), ("current", current)],
        "CANCELLED",
    );
    assert_eq!(control["status"], "error");
    assert_eq!(control["code"], "CANCELLED");
}

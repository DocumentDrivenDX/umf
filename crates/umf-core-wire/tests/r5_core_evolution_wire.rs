// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
    Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value,
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
fn semantic_equal(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(x, y)| semantic_equal(x, y))
        }
        (Value::Object(a), Value::Object(b)) => {
            if a.len() != b.len() {
                return false;
            }
            let mut matched = vec![false; b.len()];
            for (key, value) in a {
                let Some(index) = b.iter().enumerate().position(|(i, (other, candidate))| {
                    !matched[i] && key == other && semantic_equal(value, candidate)
                }) else {
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
    let response: serde_json::Value = serde_json::from_str(&execute_request(
        &request(op, args),
        ResourceProfile::Cooperative,
        &mut caps,
    ))
    .unwrap();
    let result = if response["status"] == "ok" {
        Some(decode(response["wire"].as_str().unwrap(), &mut transport_context()).unwrap())
    } else {
        None
    };
    (response, result)
}

#[test]
fn tagged_inspection_matches_all_current_010_frozen_outcomes() {
    let packet = parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-core-evolution/frozen-typescript-0.10.json"));
    let cases = get(&packet, "cases").unwrap();
    let outcomes = get(&packet, "outcomes").unwrap();
    let Value::Object(cases) = cases else {
        panic!("frozen cases")
    };
    for (name, case) in cases {
        let (response, actual) = run(
            "model/inspectCoreEvolution",
            &[
                ("before", get(case, "before").unwrap()),
                ("after", get(case, "after").unwrap()),
                ("policy", get(case, "policy").unwrap()),
            ],
        );
        let expected = get(outcomes, &name.to_utf8().unwrap()).unwrap();
        if let Some(expected_value) = get(expected, "value") {
            assert_eq!(response["status"], "ok", "{name:?}: {response}");
            assert!(
                actual
                    .as_ref()
                    .is_some_and(|value| semantic_equal(value, expected_value)),
                "{name:?}: result mismatch"
            );
        } else {
            let error = get(expected, "error").unwrap();
            let as_units = |key| match get(error, key).unwrap() {
                Value::String(s) => s.units().to_vec(),
                _ => panic!("expected string"),
            };
            assert_eq!(response["status"], "error", "{name:?}: {response}");
            assert_eq!(
                response["code"],
                String::from_utf16_lossy(&as_units("code"))
            );
            assert_eq!(
                response["messageUnits"],
                serde_json::json!(as_units("message"))
            );
            assert_eq!(response["pathUnits"], serde_json::json!(as_units("path")));
        }
    }
}

#[test]
fn tagged_verifier_checks_closed_receipt_and_independent_inputs() {
    let packet = parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-core-evolution/frozen-typescript-0.10.json"));
    let case = get(
        get(&packet, "cases").unwrap(),
        "accepted_absent_string_addition",
    )
    .unwrap();
    let (inspect, receipt) = run(
        "model/inspectCoreEvolution",
        &[
            ("before", get(case, "before").unwrap()),
            ("after", get(case, "after").unwrap()),
            ("policy", get(case, "policy").unwrap()),
        ],
    );
    assert_eq!(inspect["status"], "ok");
    let receipt = receipt.unwrap();
    let (verified, actual) = run(
        "model/verifyCoreEvolution",
        &[
            ("receipt", &receipt),
            ("before", get(case, "before").unwrap()),
            ("after", get(case, "after").unwrap()),
            ("policy", get(case, "policy").unwrap()),
        ],
    );
    assert_eq!(verified["status"], "ok", "{verified}");
    assert!(actual
        .as_ref()
        .is_some_and(|value| semantic_equal(value, &receipt)));
    let changed = parse("{\"unsupported\":true}");
    let (refusal, _) = run(
        "model/verifyCoreEvolution",
        &[
            ("receipt", &changed),
            ("before", get(case, "before").unwrap()),
            ("after", get(case, "after").unwrap()),
            ("policy", get(case, "policy").unwrap()),
        ],
    );
    assert_eq!(refusal["status"], "error");
    assert_eq!(refusal["code"], "CORE_EVOLUTION_RECEIPT");
}

#[test]
fn tagged_operation_observes_host_meter_refusal() {
    let packet = parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-core-evolution/frozen-typescript-0.10.json"));
    let case = get(get(&packet, "cases").unwrap(), "unchanged").unwrap();
    let wire = request(
        "model/inspectCoreEvolution",
        &[
            ("before", get(case, "before").unwrap()),
            ("after", get(case, "after").unwrap()),
            ("policy", get(case, "policy").unwrap()),
        ],
    );
    let mut caps = NoCapabilities;
    let mut calls = 0;
    let mut control = |_: usize| {
        calls += 1;
        if calls > 2 {
            Err(umf_core::EngineError::new(
                "EVOLUTION_METER_STOP",
                Utf16::default(),
                "host stopped evolution",
            ))
        } else {
            Ok(())
        }
    };
    let response: serde_json::Value = serde_json::from_str(&execute_request_with_control(
        &wire,
        ResourceProfile::Cooperative,
        &mut caps,
        &mut control,
    ))
    .unwrap();
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "EVOLUTION_METER_STOP");
}

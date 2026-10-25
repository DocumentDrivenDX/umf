// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
    Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value,
};
use umf_core_wire::{decode, encode, execute_request, transport_context};

const PACKET: &str = include_str!(
    "../../../docs/helix/04-build/evidence/rust-migration/r5-core-relationship-selection/frozen-typescript.json"
);

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
        &mut Context::catalog(),
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

fn request(source: &Value, query: &Value) -> String {
    encode(
        &Value::Object(vec![
            (
                "op".into(),
                Value::String("model/selectCoreRelationships".into()),
            ),
            ("resources".into(), resources()),
            ("source".into(), source.clone()),
            ("query".into(), query.clone()),
        ]),
        &mut transport_context(),
    )
    .unwrap()
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
            left.len() == right.len()
                && left.iter().all(|(key, value)| {
                    right
                        .iter()
                        .find(|(other, _)| other == key)
                        .is_some_and(|(_, other)| semantic_equal(value, other))
                })
        }
        _ => left == right,
    }
}

fn response_text(response: &serde_json::Value, field: &str) -> String {
    let units = response[field]
        .as_array()
        .expect("UTF-16 response units")
        .iter()
        .map(|unit| unit.as_u64().expect("UTF-16 unit") as u16)
        .collect::<Vec<_>>();
    String::from_utf16(&units).unwrap()
}

#[test]
fn tagged_relationship_selection_replays_frozen_predecessor_cases() {
    let packet = parse(PACKET);
    let cases = get(&packet, "cases").and_then(as_object).unwrap();
    let outcomes = get(&packet, "outcomes").unwrap();
    let mut capabilities = NoCapabilities;

    for (name, case) in cases {
        let source = get(case, "source").unwrap();
        let query = get(case, "query").unwrap();
        let response: serde_json::Value = serde_json::from_str(&execute_request(
            &request(source, query),
            ResourceProfile::Cooperative,
            &mut capabilities,
        ))
        .unwrap();
        let expected = get(outcomes, &name.to_utf8().unwrap()).unwrap();
        let expected_ok = matches!(get(expected, "ok"), Some(Value::Bool(true)));

        if expected_ok {
            assert_eq!(response["status"], "ok", "{name:?}: {response}");
            let actual = decode(
                response["wire"].as_str().expect("success wire"),
                &mut transport_context(),
            )
            .unwrap();
            assert!(
                semantic_equal(get(expected, "value").unwrap(), &actual),
                "selection output differs: {name:?}"
            );
        } else {
            let error = get(expected, "error").unwrap();
            let expected_text = |field| match get(error, field).unwrap() {
                Value::String(value) => value.to_utf8().unwrap(),
                _ => panic!("expected frozen text field {field}"),
            };
            assert_eq!(response["status"], "error", "{name:?}: {response}");
            assert_eq!(response["code"], expected_text("code"), "{name:?}");
            assert_eq!(
                response_text(&response, "messageUnits"),
                expected_text("message"),
                "{name:?}"
            );
            assert_eq!(
                response_text(&response, "pathUnits"),
                expected_text("path"),
                "{name:?}"
            );
        }
    }
}

fn as_object(value: &Value) -> Option<&[(Utf16, Value)]> {
    match value {
        Value::Object(fields) => Some(fields),
        _ => None,
    }
}

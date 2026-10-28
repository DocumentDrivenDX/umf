// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
    Capabilities, Context, Diagnostic, ResourceProfile, SemanticContext, Utf16, Value,
};
use umf_core_wire::{
    decode, encode, execute_core_bit128_field_request_with_control, transport_context,
};

const FROZEN: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r8-bit128-field-candidate-20261028/frozen-typescript.json");

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
fn equal(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(x, y)| equal(x, y))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter().all(|(k, v)| {
                    b.iter()
                        .find(|(q, _)| q == k)
                        .is_some_and(|(_, w)| equal(v, w))
                })
        }
        _ => left == right,
    }
}
fn text(value: &Value) -> String {
    let Value::String(s) = value else {
        panic!("string")
    };
    s.to_utf8().unwrap()
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

#[test]
fn opt_in_wire_candidate_matches_frozen_success_and_refusal_envelopes() {
    let packet = parse(FROZEN);
    let Value::Array(cases) = get(&packet, "cases").unwrap() else {
        panic!("cases")
    };
    for case in cases {
        let name = get(case, "name").unwrap();
        if !matches!(
            text(name).as_str(),
            "success_preserves_unknown_content" | "malformed_identity_extra_member"
        ) {
            continue;
        }
        let input = get(case, "input").unwrap();
        let mut request = vec![
            (
                "op".into(),
                Value::string_utf8("model/declareCoreBit128Field"),
            ),
            ("resources".into(), resources()),
            ("registry".into(), Value::Array(Vec::new())),
        ];
        for key in ["source", "identity", "scalarType"] {
            request.push((key.into(), get(input, key).unwrap().clone()));
        }
        let wire = encode(&Value::Object(request), &mut transport_context()).unwrap();
        let mut capabilities = NoCapabilities;
        let mut control = |_: usize| Ok(());
        let response: serde_json::Value =
            serde_json::from_str(&execute_core_bit128_field_request_with_control(
                &wire,
                ResourceProfile::Cooperative,
                &mut capabilities,
                &mut control,
            ))
            .unwrap();
        let expected = get(case, "expected").unwrap();
        if get(expected, "ok") == Some(&Value::Bool(true)) {
            assert_eq!(response["status"], "ok", "success status in {name:?}");
            let result =
                decode(response["wire"].as_str().unwrap(), &mut transport_context()).unwrap();
            assert!(
                equal(&result, get(expected, "value").unwrap()),
                "success payload in {name:?}"
            );
        } else {
            assert_eq!(response["status"], "error", "error status in {name:?}");
            let error = get(expected, "error").unwrap();
            assert_eq!(
                response["code"],
                text(get(error, "code").unwrap()),
                "error code in {name:?}"
            );
            let message_units: Vec<u16> = text(get(error, "message").unwrap())
                .encode_utf16()
                .collect();
            assert_eq!(
                response["messageUnits"],
                serde_json::json!(message_units),
                "error message in {name:?}"
            );
        }
    }
}

#[test]
fn tagged_entry_point_rejects_other_operations() {
    let request = Value::Object(vec![(
        "op".into(),
        Value::string_utf8("model/inspectCoreKeys"),
    )]);
    let wire = encode(&request, &mut transport_context()).unwrap();
    let mut capabilities = NoCapabilities;
    let mut control = |_: usize| Ok(());
    let response: serde_json::Value =
        serde_json::from_str(&execute_core_bit128_field_request_with_control(
            &wire,
            ResourceProfile::Cooperative,
            &mut capabilities,
            &mut control,
        ))
        .unwrap();
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "REQUEST");
}

#[test]
fn closed_request_rejects_extra_members_and_nonempty_registry() {
    let packet = parse(FROZEN);
    let Value::Array(cases) = get(&packet, "cases").unwrap() else {
        panic!("cases")
    };
    let case = cases
        .iter()
        .find(|case| {
            get(case, "name").is_some_and(|name| text(name) == "success_preserves_unknown_content")
        })
        .unwrap();
    let input = get(case, "input").unwrap();
    for control in [
        "extra-request-member",
        "extra-resource-member",
        "nonempty-registry",
    ] {
        let mut request = vec![
            (
                "op".into(),
                Value::string_utf8("model/declareCoreBit128Field"),
            ),
            ("resources".into(), resources()),
            ("registry".into(), Value::Array(Vec::new())),
        ];
        for key in ["source", "identity", "scalarType"] {
            request.push((key.into(), get(input, key).unwrap().clone()));
        }
        match control {
            "extra-request-member" => request.push(("unexpected".into(), Value::Bool(true))),
            "extra-resource-member" => {
                let Value::Object(fields) = &mut request[1].1 else {
                    panic!("resources")
                };
                fields.push(("futureResource".into(), Value::Null));
            }
            _ => request[2].1 = Value::Array(vec![Value::Null]),
        }
        let wire = encode(&Value::Object(request), &mut transport_context()).unwrap();
        let mut capabilities = NoCapabilities;
        let mut no_control = |_: usize| Ok(());
        let response: serde_json::Value =
            serde_json::from_str(&execute_core_bit128_field_request_with_control(
                &wire,
                ResourceProfile::Cooperative,
                &mut capabilities,
                &mut no_control,
            ))
            .unwrap();
        assert_eq!(response["status"], "error", "{control}");
        assert_eq!(response["code"], "REQUEST", "{control}");
    }
}

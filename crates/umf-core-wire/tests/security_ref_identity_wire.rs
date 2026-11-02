// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    error::EngineError,
    security_logic::security_ref_identity,
    serialization::{read_json_value, Format},
    Context, Utf16, Value,
};
use umf_core_wire::{
    decode, encode, security_logic_binding::execute_security_logic_wire, transport_context,
};

fn parse(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn string(value: &str) -> Value {
    Value::string_utf8(value)
}

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value))
            .collect(),
    )
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

fn invoke(reference: Value) -> (serde_json::Value, Option<Value>) {
    let request = object(vec![
        ("profile", string("umf.security-logic/1.0.0")),
        ("op", string("securityRefIdentity")),
        ("args", object(vec![("ref", reference)])),
    ]);
    let wire = encode(&request, &mut transport_context()).unwrap();
    let envelope: serde_json::Value =
        serde_json::from_str(&execute_security_logic_wire(&wire)).unwrap();
    let value = if envelope["status"] == "ok" {
        Some(decode(envelope["wire"].as_str().unwrap(), &mut transport_context()).unwrap())
    } else {
        None
    };
    (envelope, value)
}

fn text(value: &Value) -> String {
    match value {
        Value::String(value) => value.to_utf8().unwrap(),
        _ => panic!("expected identity string"),
    }
}

#[test]
fn tagged_reference_identity_matches_frozen_bun_predecessor() {
    let packet = parse(include_str!("../../../tests/rust-core/fixtures/r8-security-truth-logic/ref-identity-cases.json"));
    let Value::Array(cases) = get(&packet, "cases").unwrap() else {
        panic!("identity cases")
    };
    for case in cases {
        let name = text(get(case, "name").unwrap());
        let (envelope, result) = invoke(get(case, "ref").unwrap().clone());
        assert_eq!(envelope["status"], "ok", "{name}: {envelope}");
        assert_eq!(
            result.as_ref().map(text),
            Some(text(get(case, "expected").unwrap())),
            "{name}"
        );
    }
}

#[test]
fn tagged_reference_identity_requires_the_argument() {
    let request = object(vec![
        ("profile", string("umf.security-logic/1.0.0")),
        ("op", string("securityRefIdentity")),
        ("args", object(vec![])),
    ]);
    let wire = encode(&request, &mut transport_context()).unwrap();
    let envelope: serde_json::Value =
        serde_json::from_str(&execute_security_logic_wire(&wire)).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "REQUEST");
}

#[test]
fn oversized_component_is_metered_before_copying() {
    let large = Value::String(Utf16::new(vec![b'x' as u16; 1_000_000]));
    let reference = object(vec![("documentId", large)]);
    let mut rejected_amount = 0usize;
    let mut control = |amount: usize| {
        if amount > 128 {
            rejected_amount = amount;
            return Err(EngineError::new(
                "TEST_BUDGET",
                Utf16::default(),
                "Host work budget exceeded",
            ));
        }
        Ok(())
    };
    let mut context = Context::ordinary().with_host_control(&mut control);
    let error = security_ref_identity(&reference, &mut context).unwrap_err();
    assert_eq!(error.code, "TEST_BUDGET");
    assert_eq!(rejected_amount, 1_000_000);
}

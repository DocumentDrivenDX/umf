// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
    Context, Utf16, Value,
};
use umf_core_wire::{
    access_temporal_binding::execute_access_temporal_wire, decode, encode, transport_context,
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
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(k, _)| k == &Utf16::from(key))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn text(value: &Value) -> String {
    match value {
        Value::String(value) => value.to_utf8().unwrap(),
        _ => panic!("expected string"),
    }
}
fn invoke(kind: Value, token: Value) -> (serde_json::Value, Option<Value>) {
    let request = object(vec![
        ("op", string("parseAccessTemporal")),
        ("args", object(vec![("kind", kind), ("token", token)])),
    ]);
    let wire = encode(&request, &mut transport_context()).unwrap();
    let envelope: serde_json::Value =
        serde_json::from_str(&execute_access_temporal_wire(&wire)).unwrap();
    let result = if envelope["status"] == "ok" {
        Some(decode(envelope["wire"].as_str().unwrap(), &mut transport_context()).unwrap())
    } else {
        None
    };
    (envelope, result)
}

#[test]
fn tagged_parse_matches_every_frozen_non_host_vector() {
    let packet = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-access-temporal/predecessor.json"
    ));
    let Value::Array(cases) = field(&packet, "cases").unwrap() else {
        panic!("cases")
    };
    for case in cases {
        if matches!(field(case, "hostOnly"), Some(Value::Bool(true))) {
            continue;
        }
        let input = field(case, "input").unwrap();
        let kind = field(input, "kind").unwrap();
        let token = field(input, "token").unwrap();
        let outcome = field(case, "outcome").unwrap();
        let id = text(field(case, "id").unwrap());
        let (envelope, result) = invoke(kind.clone(), token.clone());
        if text(field(outcome, "status").unwrap()) == "ok" {
            assert_eq!(envelope["status"], "ok", "{id}");
            let expected = field(outcome, "value").unwrap();
            let actual = result.unwrap();
            for name in [
                "profile",
                "kind",
                "originalText",
                "canonicalText",
                "microsecond",
                "utcSeconds",
                "originalOffset",
            ] {
                if let Some(expected_value) = field(expected, name) {
                    assert_eq!(field(&actual, name), Some(expected_value), "{id}: {name}");
                } else {
                    assert!(field(&actual, name).is_none(), "{id}: unexpected {name}");
                }
            }
        } else {
            let expected_name = text(field(outcome, "name").unwrap());
            let expected_code = if expected_name == "TypeError" {
                "TYPE_ERROR"
            } else {
                "RANGE_ERROR"
            };
            assert_eq!(envelope["code"], expected_code, "{id}");
            assert_eq!(
                envelope["messageUnits"],
                serde_json::json!(text(field(outcome, "message").unwrap())
                    .encode_utf16()
                    .collect::<Vec<_>>()),
                "{id}"
            );
        }
    }
}

#[test]
fn tagged_raw_json_type_refusals_match_public_error_precedence() {
    for token in [
        Value::Null,
        Value::Number(42.0),
        object(vec![]),
        Value::Array(vec![]),
    ] {
        let (envelope, _) = invoke(string("other"), token);
        assert_eq!(envelope["code"], "TYPE_ERROR");
    }
    let (kind_before_length, _) = invoke(string("other"), string(&"x".repeat(33)));
    assert_eq!(
        kind_before_length["messageUnits"],
        serde_json::json!("Access temporal kind".encode_utf16().collect::<Vec<_>>())
    );
    let (kind_after_token_type, _) = invoke(string("other"), Value::Null);
    assert_eq!(kind_after_token_type["code"], "TYPE_ERROR");
}

#[test]
fn host_control_can_refuse_tagged_parse_before_result_encoding() {
    let request = object(vec![
        ("op", string("parseAccessTemporal")),
        (
            "args",
            object(vec![
                ("kind", string("instant")),
                ("token", string("2024-01-01T00:00:00Z")),
            ]),
        ),
    ]);
    let wire = encode(&request, &mut transport_context()).unwrap();
    let mut control = |amount: usize| {
        Err(umf_core::error::EngineError::new(
            "TEST_CONTROL",
            Utf16::default(),
            format!("blocked {amount}"),
        ))
    };
    let envelope: serde_json::Value = serde_json::from_str(
        &umf_core_wire::access_temporal_binding::execute_access_temporal_wire_with_control(
            &wire,
            &mut control,
        ),
    )
    .unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "TEST_CONTROL");
}

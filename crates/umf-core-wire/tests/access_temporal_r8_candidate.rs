use umf_core::{
    access_temporal::{self, ACCESS_TEMPORAL_PROFILE},
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
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value),
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
fn opt_in_rust_operation_matches_the_frozen_r8_typescript_reference() {
    let packet = parse(include_str!(
        "../../../tests/rust-core/fixtures/r8-access-temporal/reference-packet.json"
    ));
    assert_eq!(
        text(field(&packet, "profile").unwrap()),
        ACCESS_TEMPORAL_PROFILE
    );
    assert_eq!(
        text(field(&packet, "operation").unwrap()),
        "parseAccessTemporal"
    );
    let Value::Array(cases) = field(&packet, "cases").unwrap() else {
        panic!("cases")
    };
    assert_eq!(cases.len(), 48);
    for case in cases {
        let input = field(case, "input").unwrap();
        let outcome = field(case, "outcome").unwrap();
        let id = text(field(case, "id").unwrap());
        let (envelope, result) = invoke(
            field(input, "kind").unwrap().clone(),
            field(input, "token").unwrap().clone(),
        );
        if text(field(outcome, "status").unwrap()) == "ok" {
            assert_eq!(envelope["status"], "ok", "{id}");
            let expected = field(outcome, "value").unwrap();
            let actual = result.unwrap();
            assert_eq!(actual, *expected, "{id}: complete result");
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
fn core_parser_is_pure_and_reports_the_selected_profile() {
    let parsed = access_temporal::parse_access_temporal(
        &string("instant"),
        &string("1969-12-31T23:59:59.5Z"),
    )
    .unwrap();
    assert_eq!(parsed.profile, ACCESS_TEMPORAL_PROFILE);
    assert_eq!(parsed.utc_seconds.as_deref(), Some("-1"));
    assert_eq!(parsed.canonical_text, "1969-12-31T23:59:59.500000Z");
}

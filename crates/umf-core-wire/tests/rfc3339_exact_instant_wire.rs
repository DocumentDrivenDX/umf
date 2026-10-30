// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
    Context, Utf16, Value,
};
use umf_core_wire::{
    decode, encode, rfc3339_exact_instant_binding::execute_rfc3339_exact_instant_wire,
    transport_context,
};

fn text(value: &str) -> Value {
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
fn invoke(op: &str, args: Value) -> (serde_json::Value, Option<Value>) {
    let request = object(vec![("op", text(op)), ("args", args)]);
    let wire = encode(&request, &mut transport_context()).unwrap();
    let envelope: serde_json::Value =
        serde_json::from_str(&execute_rfc3339_exact_instant_wire(&wire)).unwrap();
    let result = if envelope["status"] == "ok" {
        Some(decode(envelope["wire"].as_str().unwrap(), &mut transport_context()).unwrap())
    } else {
        None
    };
    (envelope, result)
}
fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(members) => members
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn parsed(token: Value) -> (serde_json::Value, Option<Value>) {
    invoke("parseRfc3339ExactInstant", object(vec![("token", token)]))
}

fn read_value(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}

#[test]
fn all_frozen_bun_predecessor_vectors_replay_at_tagged_boundary() {
    let packet = read_value(include_str!("../../../tests/rust-core/fixtures/r5-rfc3339-exact-instant-wire/predecessor.json"));
    let Value::Array(cases) = field(&packet, "cases").unwrap() else {
        panic!("cases")
    };
    for case in cases {
        if matches!(field(case, "hostOnly"), Some(Value::Bool(true))) {
            continue;
        }
        let id = match field(case, "id").unwrap() {
            Value::String(id) => id.to_utf8().unwrap(),
            _ => panic!("id"),
        };
        let input = field(case, "input").unwrap();
        let kind = match field(case, "kind").unwrap() {
            Value::String(kind) => kind.to_utf8().unwrap(),
            _ => panic!("kind"),
        };
        let args = if kind == "parse" {
            object(vec![("token", field(input, "token").unwrap().clone())])
        } else {
            object(vec![
                ("left", field(input, "left").unwrap().clone()),
                ("right", field(input, "right").unwrap().clone()),
            ])
        };
        let operation = if kind == "parse" {
            "parseRfc3339ExactInstant"
        } else {
            "sameRfc3339ExactInstant"
        };
        let (envelope, actual) = invoke(operation, args);
        let outcome = field(case, "outcome").unwrap();
        if matches!(field(outcome, "status"), Some(Value::String(status)) if status == &Utf16::from("ok"))
        {
            assert_eq!(envelope["status"], "ok", "{id}");
            let expected = field(outcome, "value").unwrap();
            if kind == "parse" {
                let actual = actual.unwrap();
                for key in [
                    "profile",
                    "originalText",
                    "utcSeconds",
                    "fractionalDigits",
                    "originalOffset",
                    "localOffsetKnown",
                ] {
                    assert_eq!(field(&actual, key), field(expected, key), "{id}: {key}");
                }
            } else {
                assert_eq!(actual, Some(expected.clone()), "{id}");
            }
        } else {
            let expected_name = match field(outcome, "name").unwrap() {
                Value::String(name) => name.to_utf8().unwrap(),
                _ => panic!("name"),
            };
            assert_eq!(
                envelope["code"],
                if expected_name == "TypeError" {
                    "TYPE_ERROR"
                } else {
                    "RANGE_ERROR"
                },
                "{id}"
            );
            if let Some(Value::String(expected_message)) = field(outcome, "message") {
                assert_eq!(
                    envelope["messageUnits"],
                    serde_json::json!(expected_message
                        .to_utf8()
                        .unwrap()
                        .encode_utf16()
                        .collect::<Vec<_>>()),
                    "{id}: message"
                );
            }
        }
    }
}

#[test]
fn token_limit_uses_the_predecessor_diagnostic() {
    let valid = format!("1970-01-01T00:00:00.{}Z", "1".repeat(1_048_576 - 21));
    let (accepted, result) = parsed(text(&valid));
    assert_eq!(accepted["status"], "ok");
    let value = result.unwrap();
    assert_eq!(field(&value, "utcSeconds"), Some(&text("0")));
    assert_eq!(
        match field(&value, "fractionalDigits") {
            Some(Value::String(s)) => s.units().len(),
            _ => 0,
        },
        1_048_576 - 21
    );

    let oversized = format!("{valid}1");
    let (envelope, result) = parsed(text(&oversized));
    assert!(result.is_none());
    assert_eq!(envelope["code"], "RANGE_ERROR");
    assert_eq!(
        envelope["messageUnits"],
        serde_json::json!("RFC3339 exact instant token limit"
            .encode_utf16()
            .collect::<Vec<_>>())
    );
}

#[test]
fn tagged_parse_preserves_exact_parts_and_unknown_offset() {
    let (envelope, value) = parsed(text("1969-12-31T18:59:59.500000-05:00"));
    assert_eq!(envelope["status"], "ok");
    let value = value.unwrap();
    assert_eq!(field(&value, "utcSeconds"), Some(&text("-1")));
    assert_eq!(field(&value, "fractionalDigits"), Some(&text("5")));
    assert_eq!(field(&value, "originalOffset"), Some(&text("-05:00")));
    assert_eq!(field(&value, "localOffsetKnown"), Some(&Value::Bool(true)));
    let (unknown, value) = parsed(text("2024-01-01T00:00:00.000-00:00"));
    assert_eq!(unknown["status"], "ok");
    let value = value.unwrap();
    assert_eq!(field(&value, "fractionalDigits"), Some(&text("")));
    assert_eq!(field(&value, "localOffsetKnown"), Some(&Value::Bool(false)));
}

#[test]
fn tagged_equality_parses_left_first_and_compares_fraction_exactly() {
    let (equal, _) = invoke(
        "sameRfc3339ExactInstant",
        object(vec![
            ("left", text("2024-01-01T00:00:00.120Z")),
            ("right", text("2023-12-31T19:00:00.12-05:00")),
        ]),
    );
    assert_eq!(equal["status"], "ok");
    let bool_wire = equal["wire"].as_str().unwrap();
    let value = decode(bool_wire, &mut transport_context()).unwrap();
    assert_eq!(value, Value::Bool(true));
    let (left_error, _) = invoke(
        "sameRfc3339ExactInstant",
        object(vec![("left", Value::Null), ("right", text("bad"))]),
    );
    assert_eq!(left_error["code"], "TYPE_ERROR");
}

#[test]
fn tagged_raw_json_refusal_classes_match_contract() {
    for value in [
        Value::Null,
        Value::Bool(false),
        Value::Number(1.0),
        Value::Array(vec![]),
        object(vec![]),
    ] {
        let (envelope, result) = parsed(value);
        assert!(result.is_none());
        assert_eq!(envelope["code"], "TYPE_ERROR");
    }
    for token in [
        "0000-01-01T00:00:00Z",
        "2024-02-30T00:00:00Z",
        "2024-01-01T00:00:00+24:00",
        "2024-01-01T00:00:00Z\n",
    ] {
        let (envelope, result) = parsed(text(token));
        assert!(result.is_none(), "{token:?}");
        assert_eq!(envelope["code"], "RANGE_ERROR", "{token:?}");
    }
}

// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
    Context, Utf16, Value,
};
use umf_core_wire::{
    decode, encode, gregorian_date_binding::execute_gregorian_date_wire, transport_context,
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
fn invoke(op: &str, token: Value, unit: Option<Value>) -> (serde_json::Value, Option<Value>) {
    let mut fields = vec![("token", token)];
    if let Some(unit) = unit {
        fields.push(("unit", unit));
    }
    let request = object(vec![("op", string(op)), ("args", object(fields))]);
    let wire = encode(&request, &mut transport_context()).unwrap();
    let envelope: serde_json::Value =
        serde_json::from_str(&execute_gregorian_date_wire(&wire)).unwrap();
    let result = if envelope["status"] == "ok" {
        Some(decode(envelope["wire"].as_str().unwrap(), &mut transport_context()).unwrap())
    } else {
        None
    };
    (envelope, result)
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
        Value::String(s) => s.to_utf8().unwrap(),
        _ => panic!("expected string"),
    }
}

#[test]
fn tagged_parse_matches_profile_components_and_original_text() {
    let packet = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-gregorian-date-wire/cases.json"
    ));
    let cases = field(&packet, "cases").unwrap();
    let Value::Array(cases) = cases else {
        panic!("cases")
    };
    for case in cases {
        if text(field(case, "op").unwrap()) != "parseGregorianDate" {
            continue;
        }
        let outcome = field(case, "outcome").unwrap();
        if text(field(outcome, "status").unwrap()) != "ok" {
            continue;
        }
        let args = field(case, "args").unwrap();
        let Value::Array(args) = args else {
            panic!("args")
        };
        let (envelope, result) = invoke("parseGregorianDate", args[0].clone(), None);
        assert_eq!(envelope["status"], "ok");
        let result = result.unwrap();
        let expected = field(outcome, "value").unwrap();
        for name in ["profile", "originalText", "year", "month", "day"] {
            assert_eq!(
                field(&result, name),
                field(expected, name),
                "{}",
                text(field(case, "name").unwrap())
            );
        }
    }
}

#[test]
fn tagged_truncation_matches_all_frozen_cases() {
    let packet = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-gregorian-date-wire/cases.json"
    ));
    let Value::Array(cases) = field(&packet, "cases").unwrap() else {
        panic!("cases")
    };
    for case in cases {
        if text(field(case, "op").unwrap()) != "truncateGregorianDate" {
            continue;
        }
        let outcome = field(case, "outcome").unwrap();
        let args = field(case, "args").unwrap();
        let Value::Array(args) = args else {
            panic!("args")
        };
        let (envelope, result) = invoke(
            "truncateGregorianDate",
            args[0].clone(),
            Some(args[1].clone()),
        );
        let name = text(field(case, "name").unwrap());
        if text(field(outcome, "status").unwrap()) == "ok" {
            assert_eq!(envelope["status"], "ok", "{name}");
            assert_eq!(
                result.as_ref().map(text),
                Some(text(field(outcome, "value").unwrap())),
                "{name}"
            );
        } else {
            let error_name = text(field(outcome, "name").unwrap());
            let expected = if error_name == "TypeError" {
                "TYPE_ERROR"
            } else {
                "RANGE_ERROR"
            };
            assert_eq!(envelope["code"], expected, "{name}");
            assert_eq!(
                envelope["messageUnits"],
                serde_json::json!(text(field(outcome, "message").unwrap())
                    .encode_utf16()
                    .collect::<Vec<_>>()),
                "{name}: message"
            );
        }
    }
}

#[test]
fn tagged_refusal_taxonomy_and_date_before_unit_order() {
    for token in [
        Value::Null,
        Value::Bool(true),
        Value::Number(1.0),
        Value::Array(vec![]),
        object(vec![]),
    ] {
        let (envelope, _) = invoke("parseGregorianDate", token, None);
        assert_eq!(envelope["code"], "TYPE_ERROR");
    }
    let (date_error, _) = invoke(
        "truncateGregorianDate",
        string("2026-02-30"),
        Some(string("week")),
    );
    assert_eq!(date_error["code"], "RANGE_ERROR");
    assert_eq!(
        date_error["messageUnits"],
        serde_json::json!("Gregorian date calendar"
            .encode_utf16()
            .collect::<Vec<_>>())
    );
    let (unit_error, _) = invoke(
        "truncateGregorianDate",
        string("2026-02-28"),
        Some(string("week")),
    );
    assert_eq!(unit_error["code"], "RANGE_ERROR");
    assert_eq!(
        unit_error["messageUnits"],
        serde_json::json!("Gregorian date truncation unit"
            .encode_utf16()
            .collect::<Vec<_>>())
    );
}

#[test]
fn all_frozen_invalid_tokens_preserve_type_vs_range_class() {
    let packet = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-gregorian-date-wire/cases.json"
    ));
    let Value::Array(cases) = field(&packet, "cases").unwrap() else {
        panic!("cases")
    };
    for case in cases {
        if text(field(case, "op").unwrap()) != "parseGregorianDate" {
            continue;
        }
        let outcome = field(case, "outcome").unwrap();
        if text(field(outcome, "status").unwrap()) != "error" {
            continue;
        }
        let args = field(case, "args").unwrap();
        let Value::Array(args) = args else {
            panic!("args")
        };
        let (envelope, _) = invoke("parseGregorianDate", args[0].clone(), None);
        let expected = if text(field(outcome, "name").unwrap()) == "TypeError" {
            "TYPE_ERROR"
        } else {
            "RANGE_ERROR"
        };
        assert_eq!(
            envelope["code"],
            expected,
            "{}",
            text(field(case, "name").unwrap())
        );
        assert_eq!(
            envelope["messageUnits"],
            serde_json::json!(text(field(outcome, "message").unwrap())
                .encode_utf16()
                .collect::<Vec<_>>()),
            "{}: message",
            text(field(case, "name").unwrap())
        );
    }
}

#[test]
fn host_work_refusal_precedes_date_result() {
    let request = object(vec![
        ("op", string("parseGregorianDate")),
        ("args", object(vec![("token", string("2026-10-15"))])),
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
        &umf_core_wire::gregorian_date_binding::execute_gregorian_date_wire_with_control(
            &wire,
            &mut control,
        ),
    )
    .unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "TEST_CONTROL");
}

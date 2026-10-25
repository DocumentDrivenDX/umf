// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    Context, Utf16, Value,
    serialization::{Format, read_json_value},
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
fn array(values: impl IntoIterator<Item = Value>) -> Value {
    Value::Array(values.into_iter().collect())
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value))
            .collect(),
    )
}

fn invoke(operation: &str, args: Value) -> (serde_json::Value, Option<Value>) {
    let request = object(vec![
        ("profile", string("umf.security-logic/1.0.0")),
        ("op", string(operation)),
        ("args", args),
    ]);
    let wire = encode(&request, &mut transport_context()).unwrap();
    let envelope: serde_json::Value =
        serde_json::from_str(&execute_security_logic_wire(&wire)).unwrap();
    let result = if envelope["status"] == "ok" {
        Some(decode(envelope["wire"].as_str().unwrap(), &mut transport_context()).unwrap())
    } else {
        None
    };
    (envelope, result)
}

fn text(value: &Value) -> String {
    match value {
        Value::String(value) => value.to_utf8().unwrap(),
        _ => panic!("expected string"),
    }
}

fn truth_rank(value: &str) -> u8 {
    match value {
        "F" => 0,
        "U" => 1,
        "T" => 2,
        _ => unreachable!(),
    }
}

#[test]
fn wire_truth_operators_match_frozen_predecessor_and_hand_enumerated_oracle() {
    let packet = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/frozen-typescript.json"
    ));
    let truths = match get(&packet, "truths").unwrap() {
        Value::Array(values) => values,
        _ => panic!("truths"),
    };
    let predecessor_and = get(&packet, "and").unwrap();
    let predecessor_or = get(&packet, "or").unwrap();
    let oracle = get(&packet, "independentOracle").unwrap();
    assert_eq!(predecessor_and, get(oracle, "and").unwrap());
    assert_eq!(predecessor_or, get(oracle, "or").unwrap());
    assert_eq!(get(&packet, "not").unwrap(), get(oracle, "not").unwrap());

    let not = match get(&packet, "not").unwrap() {
        Value::Array(values) => values,
        _ => panic!("not"),
    };
    for (input, expected) in truths.iter().zip(not) {
        let (envelope, result) = invoke("securityNot", object(vec![("value", input.clone())]));
        assert_eq!(envelope["status"], "ok");
        assert_eq!(result.as_ref().map(text), Some(text(expected)));
        let oracle = match text(input).as_str() {
            "T" => "F",
            "F" => "T",
            "U" => "U",
            _ => unreachable!(),
        };
        assert_eq!(result.as_ref().map(text).as_deref(), Some(oracle));
    }
    for (operation, table) in [
        ("securityAnd", predecessor_and),
        ("securityOr", predecessor_or),
    ] {
        let Value::Array(rows) = table else {
            panic!("truth table")
        };
        for (i, row) in rows.iter().enumerate() {
            let Value::Array(cells) = row else {
                panic!("truth row")
            };
            for (j, expected) in cells.iter().enumerate() {
                let args = object(vec![(
                    "values",
                    array([truths[i].clone(), truths[j].clone()]),
                )]);
                let (envelope, result) = invoke(operation, args);
                assert_eq!(envelope["status"], "ok", "{operation}({i},{j}): {envelope}");
                assert_eq!(
                    result.as_ref().map(text),
                    Some(text(expected)),
                    "{operation}({i},{j})"
                );
                let a = truth_rank(&text(&truths[i]));
                let b = truth_rank(&text(&truths[j]));
                let rank = if operation == "securityAnd" {
                    a.min(b)
                } else {
                    a.max(b)
                };
                let oracle = match rank {
                    0 => "F",
                    1 => "U",
                    2 => "T",
                    _ => unreachable!(),
                };
                assert_eq!(
                    result.as_ref().map(text).as_deref(),
                    Some(oracle),
                    "independent {operation}({i},{j})"
                );
            }
        }
    }
}

#[test]
fn wire_truth_operators_preserve_predecessor_boundary_refusals() {
    let packet = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/frozen-typescript.json"
    ));
    let Value::Array(cases) = get(&packet, "refusals").unwrap() else {
        panic!("refusal packet")
    };
    for case in cases {
        let operation = text(get(case, "operation").unwrap());
        let mut values = match get(case, "values") {
            Some(Value::Array(values)) => values.clone(),
            _ => vec![],
        };
        if let Some(Value::Number(count)) = get(case, "operandCount") {
            values = vec![string("T"); *count as usize];
        }
        let (envelope, result) = invoke(&operation, object(vec![("values", Value::Array(values))]));
        assert!(
            result.is_none(),
            "{} unexpectedly succeeded",
            text(get(case, "name").unwrap())
        );
        assert_eq!(envelope["status"], "error");
        assert_eq!(envelope["code"], text(get(case, "code").unwrap()));
        let message_units = text(get(case, "message").unwrap())
            .encode_utf16()
            .map(serde_json::Value::from)
            .collect::<Vec<_>>();
        let path_units = text(get(case, "path").unwrap())
            .encode_utf16()
            .map(serde_json::Value::from)
            .collect::<Vec<_>>();
        assert_eq!(
            envelope["messageUnits"],
            serde_json::Value::Array(message_units)
        );
        assert_eq!(envelope["pathUnits"], serde_json::Value::Array(path_units));
    }
    let Value::Array(not_cases) = get(&packet, "notRefusals").unwrap() else {
        panic!("not refusal packet")
    };
    for case in not_cases {
        let (envelope, result) = invoke(
            &text(get(case, "operation").unwrap()),
            object(vec![("value", object(vec![]))]),
        );
        assert!(result.is_none());
        assert_eq!(envelope["status"], "error");
        assert_eq!(envelope["code"], text(get(case, "code").unwrap()));
        assert_eq!(
            envelope["messageUnits"],
            serde_json::Value::Array(
                text(get(case, "message").unwrap())
                    .encode_utf16()
                    .map(serde_json::Value::from)
                    .collect()
            )
        );
        assert_eq!(
            envelope["pathUnits"],
            serde_json::Value::Array(
                text(get(case, "path").unwrap())
                    .encode_utf16()
                    .map(serde_json::Value::from)
                    .collect()
            )
        );
    }
    let (envelope, value) = invoke(
        "securityAnd",
        object(vec![(
            "values",
            array(std::iter::repeat_n(string("T"), 64)),
        )]),
    );
    assert_eq!(envelope["status"], "ok");
    assert_eq!(value.as_ref().map(text).as_deref(), Some("T"));
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

#[test]
fn wire_truth_operations_reject_missing_arguments_and_unknown_ops() {
    let (missing, _) = invoke("securityAnd", object(vec![]));
    assert_eq!(missing["status"], "error");
    assert_eq!(missing["code"], "REQUEST");
    let (unknown, _) = invoke("securityPermit", object(vec![]));
    assert_eq!(unknown["status"], "error");
    assert_eq!(unknown["code"], "REQUEST");
}

#[test]
fn wire_security_logic_admission_rejects_unknown_or_missing_members() {
    for request in [
        object(vec![
            ("profile", string("umf.security-logic/1.0.0")),
            ("op", string("securityNot")),
            ("args", object(vec![("value", string("T"))])),
            ("future", string("ignored")),
        ]),
        object(vec![
            ("op", string("securityNot")),
            ("args", object(vec![("value", string("T"))])),
        ]),
        object(vec![
            ("profile", string("umf.security-logic/2.0.0")),
            ("op", string("securityNot")),
            ("args", object(vec![("value", string("T"))])),
        ]),
        object(vec![
            ("profile", string("umf.security-logic/1.0.0")),
            ("op", string("securityNot")),
            (
                "args",
                object(vec![("value", string("T")), ("future", string("ignored"))]),
            ),
        ]),
    ] {
        let wire = encode(&request, &mut transport_context()).unwrap();
        let envelope: serde_json::Value =
            serde_json::from_str(&execute_security_logic_wire(&wire)).unwrap();
        assert_eq!(envelope["status"], "error");
        assert_eq!(envelope["code"], "REQUEST");
    }
}

#[test]
fn wire_composition_matches_frozen_predecessor_and_hand_oracle() {
    let packet = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/compose-cases.json"
    ));
    let Value::Array(cases) = get(&packet, "cases").unwrap() else {
        panic!("composition cases")
    };
    for case in cases {
        let name = text(get(case, "name").unwrap());
        let input = get(case, "input").unwrap();
        let mut rules = get(input, "rules").unwrap().clone();
        if let Some(Value::Number(count)) = get(input, "manyRules") {
            let mut values = match rules {
                Value::Array(values) => values,
                _ => panic!("frozen manyRules cases require rules array"),
            };
            let missing = (*count as usize).saturating_sub(values.len());
            values.extend(std::iter::repeat_n(
                object(vec![("effect", string("permit")), ("truth", string("T"))]),
                missing,
            ));
            rules = Value::Array(values);
        }
        let mut args = vec![("rules", rules)];
        if let Some(protected_fields) = get(input, "protectedFields") {
            args.push(("protectedFields", protected_fields.clone()));
        }
        let (envelope, result) = invoke("composeSecurityRules", object(args));
        if let Some(expected) = get(case, "oracle") {
            assert_eq!(envelope["status"], "ok", "{name}: {envelope}");
            let expected_json: serde_json::Value = serde_json::from_str(
                &umf_core::serialization::write_json_value(
                    expected,
                    Format::Json,
                    &mut Context::ordinary(),
                )
                .unwrap()
                .to_utf8()
                .unwrap()
                .as_str(),
            )
            .unwrap();
            let actual_json: serde_json::Value = serde_json::from_str(
                &umf_core::serialization::write_json_value(
                    &result.unwrap(),
                    Format::Json,
                    &mut Context::ordinary(),
                )
                .unwrap()
                .to_utf8()
                .unwrap()
                .as_str(),
            )
            .unwrap();
            assert_eq!(actual_json, expected_json, "{name}");
        } else {
            let expected = get(case, "error").unwrap();
            assert!(result.is_none(), "{name} unexpectedly succeeded");
            assert_eq!(envelope["status"], "error", "{name}");
            assert_eq!(
                envelope["code"],
                text(get(expected, "code").unwrap()),
                "{name}"
            );
            assert_eq!(
                envelope["messageUnits"],
                serde_json::Value::Array(
                    text(get(expected, "message").unwrap())
                        .encode_utf16()
                        .map(serde_json::Value::from)
                        .collect()
                ),
                "{name}"
            );
            assert_eq!(
                envelope["pathUnits"],
                serde_json::Value::Array(
                    text(get(expected, "path").unwrap())
                        .encode_utf16()
                        .map(serde_json::Value::from)
                        .collect()
                ),
                "{name}"
            );
        }
    }
}

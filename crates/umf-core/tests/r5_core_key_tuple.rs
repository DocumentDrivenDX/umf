// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    core_key_tuple::{
        encode_core_key_tuple, prepare_core_key_tuples, read_core_key_tuple_bytes,
        verify_core_key_tuple,
    },
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::Diagnostic,
    registry::Registry,
    serialization::{read_json_value, write_json_value, Format},
    Context, Utf16, Value,
};
struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(vec![])
    }
}
fn parse(text: &str) -> Value {
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(k, _)| k == &Utf16::from(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn canonical(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(a, b)| canonical(a, b))
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len()
                && x.iter().all(|(k, v)| {
                    y.iter()
                        .find(|(q, _)| q == k)
                        .is_some_and(|(_, w)| canonical(v, w))
                })
        }
        _ => a == b,
    }
}
fn engine() -> Engine {
    Engine::new(
        ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json")),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn outcome(result: Result<Value, umf_core::error::EngineError>) -> Value {
    match result {
        Ok(value) => Value::Object(vec![
            (Utf16::from("ok"), Value::Bool(true)),
            (Utf16::from("value"), value),
        ]),
        Err(e) => Value::Object(vec![
            (Utf16::from("ok"), Value::Bool(false)),
            (
                Utf16::from("error"),
                Value::Object(vec![
                    (Utf16::from("code"), Value::string_utf8(e.code)),
                    (Utf16::from("message"), Value::String(e.message)),
                    (Utf16::from("path"), Value::String(e.path)),
                ]),
            ),
        ]),
    }
}
#[test]
fn frozen_type_script_tuple_cases_match_complete_receipts_and_refusals() {
    let packet=parse(include_str!("../../../tests/rust-core/fixtures/r5-core-key-tuple/frozen-typescript.json"));
    let e = engine();
    let r = Registry::new();
    let mut c = NoCapabilities;
    let cases = get(&packet, "cases").unwrap();
    let outcomes = get(&packet, "outcomes").unwrap();
    let Value::Object(rows) = cases else {
        panic!("cases")
    };
    for (id, input) in rows {
        let expected = get(outcomes, &id.to_utf8().unwrap()).unwrap();
        if get(input, "rustBoundary").is_some() {
            assert_eq!(
                get(get(expected, "error").unwrap(), "code"),
                Some(&Value::string_utf8("NUMBER"))
            );
            continue;
        }
        let source = get(input, "source").unwrap();
        let identity = get(input, "identity").unwrap();
        let values = get(input, "values").unwrap();
        let profile = get(input, "profile").and_then(|v| {
            if let Value::String(t) = v {
                t.to_utf8().ok()
            } else {
                None
            }
        });
        let actual = outcome(encode_core_key_tuple(
            source,
            identity,
            values,
            profile.as_deref(),
            &e,
            &r,
            &mut c,
            &mut Context::ordinary(),
        ));
        assert!(
            canonical(&actual, expected),
            "case {}: actual {:?} expected {:?}",
            id.to_utf8().unwrap(),
            actual,
            expected
        );
    }
    assert!(!rows.is_empty());
}
#[test]
fn verification_bytes_round_trips_and_prepared_scope_keep_explicit_profile() {
    let packet=parse(include_str!("../../../tests/rust-core/fixtures/r5-core-key-tuple/frozen-typescript.json"));
    let cases = get(&packet, "cases").unwrap();
    let input = get(cases, "profile-v2-uuid").unwrap();
    let e = engine();
    let r = Registry::new();
    let mut c = NoCapabilities;
    let original = get(input, "source").unwrap().clone();
    let receipt = encode_core_key_tuple(
        get(input, "source").unwrap(),
        get(input, "identity").unwrap(),
        get(input, "values").unwrap(),
        Some("umf-key-tuple-v2"),
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(get(input, "source"), Some(&original));
    assert!(canonical(
        &receipt,
        get(get(&packet, "outcomes").unwrap(), "profile-v2-uuid")
            .and_then(|v| get(v, "value"))
            .unwrap()
    ));
    assert!(verify_core_key_tuple(
        &receipt,
        get(input, "source").unwrap(),
        &e,
        &r,
        &mut c,
        &mut Context::ordinary()
    )
    .is_ok());
    assert!(!read_core_key_tuple_bytes(
        &receipt,
        get(input, "source").unwrap(),
        &e,
        &r,
        &mut c,
        &mut Context::ordinary()
    )
    .unwrap()
    .is_empty());
    for f in [Format::Json, Format::Yaml] {
        let text = write_json_value(&receipt, f, &mut Context::ordinary()).unwrap();
        let recovered = read_json_value(text.units(), f, &mut Context::ordinary()).unwrap();
        assert!(canonical(
            &verify_core_key_tuple(
                &recovered,
                get(input, "source").unwrap(),
                &e,
                &r,
                &mut c,
                &mut Context::ordinary()
            )
            .unwrap(),
            &receipt
        ));
    }
    let prepared = prepare_core_key_tuples(
        get(input, "source").unwrap(),
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(canonical(
        &prepared
            .verify(&receipt, &e, &r, &mut c, &mut Context::ordinary())
            .unwrap(),
        &receipt
    ));
    let error = prepared
        .encode(
            get(input, "identity").unwrap(),
            get(input, "values").unwrap(),
            &e,
            &r,
            &mut c,
            &mut Context::ordinary(),
        )
        .unwrap_err();
    assert_eq!(error.code, "KEY_TUPLE_PROFILE");
}
#[test]
fn frozen_receipt_malformed_and_stale_cases_match_full_predecessor_refusals() {
    let packet=parse(include_str!("../../../tests/rust-core/fixtures/r5-core-key-tuple/frozen-typescript.json"));
    let e = engine();
    let r = Registry::new();
    let mut c = NoCapabilities;
    let cases = get(&packet, "verificationCases").unwrap();
    let outcomes = get(&packet, "verificationOutcomes").unwrap();
    let Value::Object(rows) = cases else {
        panic!("verification cases")
    };
    for (id, input) in rows {
        let receipt = get(input, "receipt").unwrap();
        let current = get(input, "current").unwrap();
        let actual = outcome(verify_core_key_tuple(
            receipt,
            current,
            &e,
            &r,
            &mut c,
            &mut Context::ordinary(),
        ));
        let expected = get(outcomes, &id.to_utf8().unwrap()).unwrap();
        assert!(
            canonical(&actual, expected),
            "verify {}: actual {:?} expected {:?}",
            id.to_utf8().unwrap(),
            actual,
            expected
        );
    }
}
#[test]
fn tuple_work_is_metered_and_cancellation_is_cooperative() {
    let packet=parse(include_str!("../../../tests/rust-core/fixtures/r5-core-key-tuple/frozen-typescript.json"));
    let input = get(get(&packet, "cases").unwrap(), "profile-v2-uuid").unwrap();
    let e = engine();
    let r = Registry::new();
    let mut c = NoCapabilities;
    let mut total = 0usize;
    let mut meter = |n| {
        total += n;
        Ok(())
    };
    {
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        assert!(encode_core_key_tuple(
            get(input, "source").unwrap(),
            get(input, "identity").unwrap(),
            get(input, "values").unwrap(),
            Some("umf-key-tuple-v2"),
            &e,
            &r,
            &mut c,
            &mut ctx
        )
        .is_ok());
    }
    assert!(total > 0);
    let mut stop = || true;
    let mut ctx = Context::ordinary().with_cancellation(&mut stop);
    let error = encode_core_key_tuple(
        get(input, "source").unwrap(),
        get(input, "identity").unwrap(),
        get(input, "values").unwrap(),
        Some("umf-key-tuple-v2"),
        &e,
        &r,
        &mut c,
        &mut ctx,
    )
    .unwrap_err();
    assert_eq!(error.code, "CANCELLED");
    assert!(error.is_control_failure());
}

#[test]
fn prepared_integer_control_failure_is_not_rewritten_as_a_token_error() {
    let packet=parse(include_str!("../../../tests/rust-core/fixtures/r5-core-key-tuple/frozen-typescript.json"));
    let input = get(get(&packet, "cases").unwrap(), "integer-exponent").unwrap();
    let e = engine();
    let r = Registry::new();
    let mut c = NoCapabilities;
    let prepared = prepare_core_key_tuples(
        get(input, "source").unwrap(),
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut calls = 0usize;
    let mut meter = |_: usize| {
        calls += 1;
        if calls == 70 {
            Err(umf_core::error::EngineError::new(
                "METER_REJECTED",
                Utf16::default(),
                "meter refused work",
            ))
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error = prepared
        .encode(
            get(input, "identity").unwrap(),
            get(input, "values").unwrap(),
            &e,
            &r,
            &mut c,
            &mut ctx,
        )
        .unwrap_err();
    assert_eq!(calls, 70);
    assert_eq!(error.code, "METER_REJECTED");
    assert!(error.is_control_failure());
}

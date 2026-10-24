// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-089-AC20, US-089-AC24
use umf_core::{
    context::Context,
    literal::{exact_coefficient, literal_errors, literal_identity, numeric_interval},
    literal_policy::prepare_policy,
    serialization::{read_json_value, Format},
    Utf16, Value,
};

fn parse(source: &str, ctx: &mut Context<'_>) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
    .unwrap()
}
fn obj(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn generated_policy(ctx: &mut Context<'_>) -> umf_core::literal_policy::PreparedPolicy {
    let value = parse(
        include_str!("../../../spec/metamodel/generated/domain-policy.json"),
        ctx,
    );
    let literal = match value {
        Value::Object(m) => {
            m.into_iter()
                .find(|(k, _)| k == &Utf16::from("literal"))
                .unwrap()
                .1
        }
        _ => panic!("generated policy must be an object"),
    };
    prepare_policy(&literal, ctx).unwrap()
}
fn integer_field() -> Value {
    obj(vec![
        ("kind", Value::string_utf8("field")),
        ("references", Value::Array(vec![])),
        ("facets", obj(vec![])),
        ("scalarType", Value::string_utf8("integer")),
        ("cardinality", Value::string_utf8("one")),
        ("nullability", Value::string_utf8("required")),
    ])
}
fn integer(token: &str) -> Value {
    obj(vec![("integerToken", Value::string_utf8(token))])
}

fn nested_array(depth: usize) -> Value {
    (0..depth).fold(Value::Null, |value, _| Value::Array(vec![value]))
}

fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(members) => members
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn literal_policy_source(ctx: &mut Context<'_>) -> Value {
    let value = parse(
        include_str!("../../../spec/metamodel/generated/domain-policy.json"),
        ctx,
    );
    match value {
        Value::Object(members) => {
            members
                .into_iter()
                .find(|(key, _)| key == &Utf16::from("literal"))
                .unwrap()
                .1
        }
        _ => panic!("generated policy must be an object"),
    }
}

#[test]
fn exact_coefficients_preserve_tokens_and_reject_rounding() {
    let mut ctx = Context::ordinary();
    for (token, scale, expected) in [("1.20", 2, "120"), ("1200e-2", 0, "12"), ("-0", 9, "0")] {
        assert_eq!(
            exact_coefficient(&Utf16::from(token), scale, None, &mut ctx)
                .unwrap()
                .to_string(),
            expected
        );
    }
    assert_eq!(
        exact_coefficient(&Utf16::from("1.201"), 2, None, &mut ctx)
            .unwrap_err()
            .code,
        "numeric-rounding"
    );
}

#[test]
fn exact_coefficient_limit_rejects_before_materializing_the_expanded_digits() {
    let mut ctx = Context::ordinary();
    let error = exact_coefficient(&Utf16::from("1e4000000"), 0, None, &mut ctx).unwrap_err();
    assert_eq!(error.code, "numeric-resource");
}

#[test]
fn exact_coefficient_matches_the_frozen_long_token_and_exponent_oracle() {
    const RECEIPT: &str = include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r2/sol-exact-coefficient-predecessor.json"
    );
    let receipt: serde_json::Value = serde_json::from_str(RECEIPT).unwrap();
    assert_eq!(
        receipt["generatorSha256"].as_str(),
        Some("c4f0b6495c990f8b7be24f2a5f3cb2dc3289d48b4cf6069e5e4180b25c6a784e")
    );
    let cases = receipt["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 22);
    for case in cases {
        let token = if let Some(token) = case["token"].as_str() {
            token.to_owned()
        } else {
            let count = case["count"].as_u64().unwrap() as usize;
            format!(
                "{}{}{}",
                case["prefix"].as_str().unwrap(),
                case["repeat"].as_str().unwrap().repeat(count),
                case["suffix"].as_str().unwrap()
            )
        };
        assert_eq!(
            token.encode_utf16().count(),
            case["inputUtf16Units"].as_u64().unwrap() as usize,
            "receipt length for {}",
            case["id"].as_str().unwrap()
        );
        let mut ctx = Context::ordinary();
        let actual = exact_coefficient(
            &Utf16::from(token),
            case["scale"].as_i64().unwrap(),
            None,
            &mut ctx,
        );
        match case["predecessor"]["status"].as_str().unwrap() {
            "coefficient" => assert_eq!(
                actual.unwrap().to_string(),
                case["predecessor"]["decimal"].as_str().unwrap(),
                "{}",
                case["id"].as_str().unwrap()
            ),
            "error" => assert_eq!(
                actual.unwrap_err().code,
                case["predecessor"]["reason"].as_str().unwrap(),
                "{}",
                case["id"].as_str().unwrap()
            ),
            status => panic!("unknown receipt status {status}"),
        }
    }
}

#[test]
fn exact_coefficient_work_meter_denial_precedes_token_materialization() {
    let mut meter = |_amount: usize| {
        Err(umf_core::EngineError::new(
            "METER_STOP",
            Utf16::default(),
            "stopped",
        ))
    };
    let token = Utf16::new(vec![b'1' as u16; 1_000_000]);
    let error = exact_coefficient(
        &token,
        0,
        None,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "METER_STOP");
}

#[test]
fn exact_coefficient_meter_charges_decimal_limb_work_before_bigint_parse() {
    let mut meter = |amount: usize| {
        if amount > 1_000 {
            Err(umf_core::EngineError::new(
                "METER_STOP",
                Utf16::default(),
                "decimal limb budget stopped",
            ))
        } else {
            Ok(())
        }
    };
    let token = Utf16::new(vec![b'9' as u16; 1_000]);
    let error = exact_coefficient(
        &token,
        0,
        None,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "METER_STOP");
}

#[test]
fn exact_coefficient_wide_work_is_metered_in_portable_chunks() {
    // This source is modest to construct, while num-bigint's pinned decimal
    // chunk-by-growing-limb upper bound exceeds u32::MAX. The meter rejects
    // the first wide-work chunk before BigInt parsing starts.
    let token = Utf16::new(vec![b'9' as u16; 1_300_000]);
    let mut saw_wide_chunk = false;
    let mut meter = |amount: usize| {
        if amount == u32::MAX as usize {
            saw_wide_chunk = true;
            Err(umf_core::EngineError::new(
                "METER_STOP",
                Utf16::default(),
                "wide decimal work stopped",
            ))
        } else {
            Ok(())
        }
    };
    let error = exact_coefficient(
        &token,
        0,
        None,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "METER_STOP");
    assert!(saw_wide_chunk);
}

#[test]
fn generated_policy_admits_and_integer_identity_is_exact() {
    let mut ctx = Context::ordinary();
    let policy = generated_policy(&mut ctx);
    let field = integer_field();
    let large = integer("9007199254740993");
    assert_eq!(
        literal_identity(&field, &large, &policy, &mut ctx)
            .unwrap()
            .unwrap()
            .to_utf8()
            .unwrap(),
        "integer:9007199254740993"
    );
    let rounded = integer("9007199254740993.0");
    assert_eq!(
        literal_identity(&field, &rounded, &policy, &mut ctx)
            .unwrap()
            .unwrap(),
        literal_identity(&field, &large, &policy, &mut ctx)
            .unwrap()
            .unwrap()
    );
    assert!(
        literal_errors(&Value::Null, &field, &large, true, &policy, &mut ctx)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn interval_checks_exclusive_empty_ranges() {
    let mut ctx = Context::ordinary();
    let policy = generated_policy(&mut ctx);
    let range = obj(vec![
        ("min", integer("5")),
        ("minInclusive", Value::Bool(false)),
        ("max", integer("5")),
        ("maxInclusive", Value::Bool(true)),
    ]);
    let diagnostics = numeric_interval(&integer_field(), &range, &policy, &mut ctx).unwrap();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(
        diagnostics[0].code.to_utf8().unwrap(),
        "CORE_SCHEMA_PROPERTIES"
    );
}

#[test]
fn literal_refinement_order_and_interval_paths_come_from_policy() {
    let mut ctx = Context::ordinary();
    let mut policy_value = parse(
        include_str!("../../../spec/metamodel/generated/domain-policy.json"),
        &mut ctx,
    );
    let Value::Object(root) = &mut policy_value else {
        panic!("generated policy must be an object");
    };
    let literal = root
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("literal"))
        .map(|(_, value)| value)
        .unwrap();
    let Value::Object(literal_fields) = literal else {
        panic!("literal policy must be an object");
    };
    let refinements = literal_fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("refinements"))
        .map(|(_, value)| value)
        .unwrap();
    let Value::Array(rules) = refinements else {
        panic!("refinements must be an array");
    };
    let index = rules
        .iter()
        .position(|rule| {
            matches!(rule, Value::Object(fields) if fields.iter().any(|(key, value)| key == &Utf16::from("mechanic") && value == &Value::string_utf8("allowed-membership")))
        })
        .unwrap();
    let allowed = rules.remove(index);
    rules.insert(0, allowed);
    let policy = prepare_policy(literal, &mut ctx).unwrap();

    let mut field = integer_field();
    let Value::Object(fields) = &mut field else {
        unreachable!()
    };
    fields.push((
        Utf16::from("allowedValues"),
        Value::Array(vec![integer("3")]),
    ));
    let errors = literal_errors(
        &Value::Null,
        &field,
        &integer("9223372036854775808"),
        true,
        &policy,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        errors[0].message.to_utf8().unwrap(),
        "Literal is not an allowed value"
    );

    let range = obj(vec![("min", Value::Null)]);
    let errors = numeric_interval(&field, &range, &policy, &mut ctx).unwrap();
    assert_eq!(errors[0].path.to_utf8().unwrap(), "/min");

    let mut field_with_null_bound = integer_field();
    let Value::Object(fields) = &mut field_with_null_bound else {
        unreachable!()
    };
    let facets = fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("facets"))
        .map(|(_, value)| value)
        .unwrap();
    let Value::Object(facets) = facets else {
        unreachable!()
    };
    facets.push((Utf16::from("range"), obj(vec![("min", Value::Null)])));
    let errors = literal_errors(
        &Value::Null,
        &field_with_null_bound,
        &integer("3"),
        true,
        &policy,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(errors[0].path.to_utf8().unwrap(), "/facets/range/min");
}

#[test]
fn prepared_policy_is_an_owned_snapshot_and_mutated_source_is_readmitted() {
    let mut setup = Context::ordinary();
    let mut source = literal_policy_source(&mut setup);
    let prepared = prepare_policy(&source, &mut Context::ordinary()).unwrap();

    let errors = get_mut(&mut source, "errors").unwrap();
    let allowed = get_mut(errors, "allowed").unwrap();
    *get_mut(allowed, "message").unwrap() = Value::string_utf8("mutated policy message");

    let mut field = integer_field();
    let Value::Object(fields) = &mut field else {
        unreachable!()
    };
    fields.push((
        Utf16::from("allowedValues"),
        Value::Array(vec![integer("3")]),
    ));
    let get_message = |policy: &umf_core::literal_policy::PreparedPolicy| {
        literal_errors(
            &Value::Null,
            &field,
            &integer("4"),
            true,
            policy,
            &mut Context::ordinary(),
        )
        .unwrap()[0]
            .message
            .to_utf8()
            .unwrap()
    };

    assert_eq!(get_message(&prepared), "Literal is not an allowed value");
    let freshly_prepared = prepare_policy(&source, &mut Context::ordinary()).unwrap();
    assert_eq!(get_message(&freshly_prepared), "mutated policy message");
}

#[test]
fn public_literal_operations_admit_each_value_tree_at_the_boundary() {
    let mut setup = Context::ordinary();
    let policy = generated_policy(&mut setup);
    let field = integer_field();
    let value = integer("7");

    let mut exact_depth = Context::ordinary();
    assert!(literal_errors(
        &nested_array(128),
        &field,
        &value,
        true,
        &policy,
        &mut exact_depth
    )
    .unwrap()
    .is_empty());

    let mut over_depth = Context::ordinary();
    assert_eq!(
        literal_errors(
            &nested_array(129),
            &field,
            &value,
            true,
            &policy,
            &mut over_depth
        )
        .unwrap_err()
        .code,
        "LIMIT"
    );

    let mut over_depth_identity = Context::ordinary();
    assert_eq!(
        literal_identity(
            &field,
            &nested_array(129),
            &policy,
            &mut over_depth_identity
        )
        .unwrap_err()
        .code,
        "LIMIT"
    );

    let mut over_depth_range = Context::ordinary();
    assert_eq!(
        numeric_interval(&field, &nested_array(129), &policy, &mut over_depth_range)
            .unwrap_err()
            .code,
        "LIMIT"
    );
}

#[test]
fn public_literal_operations_reject_unsafe_numbers_and_value_count_overflow() {
    let mut setup = Context::ordinary();
    let policy = generated_policy(&mut setup);
    let field = integer_field();

    let mut bad_literal = Context::ordinary();
    assert_eq!(
        literal_errors(
            &Value::Null,
            &field,
            &Value::Number(f64::NAN),
            true,
            &policy,
            &mut bad_literal
        )
        .unwrap_err()
        .code,
        "NUMBER"
    );

    let mut bad_identity = Context::ordinary();
    assert_eq!(
        literal_identity(&field, &Value::Number(-0.0), &policy, &mut bad_identity)
            .unwrap_err()
            .code,
        "NUMBER"
    );

    let mut bad_interval = Context::ordinary();
    assert_eq!(
        numeric_interval(
            &field,
            &obj(vec![("min", Value::Number(9_007_199_254_740_992.0))]),
            &policy,
            &mut bad_interval
        )
        .unwrap_err()
        .code,
        "NUMBER"
    );

    let mut too_many_values = Context::ordinary();
    assert_eq!(
        literal_errors(
            &Value::Array(vec![Value::Null; 100_000]),
            &field,
            &integer("7"),
            true,
            &policy,
            &mut too_many_values
        )
        .unwrap_err()
        .code,
        "LIMIT"
    );
}

#[test]
fn literal_input_copy_does_not_apply_the_source_text_ceiling() {
    let mut setup = Context::ordinary();
    let policy = generated_policy(&mut setup);
    let document = Value::String(Utf16::new(vec![b'x' as u16; 4_000_001]));
    let mut ctx = Context::ordinary();
    assert!(literal_errors(
        &document,
        &integer_field(),
        &integer("7"),
        true,
        &policy,
        &mut ctx
    )
    .unwrap()
    .is_empty());
}

#[test]
fn literal_policy_diagnostic_strings_are_metered_before_materialization() {
    let mut setup = Context::ordinary();
    let mut policy_value = literal_policy_source(&mut setup);
    let errors = get_mut(&mut policy_value, "errors").unwrap();
    let token_error = get_mut(errors, "numeric-token").unwrap();
    *get_mut(token_error, "message").unwrap() =
        Value::String(Utf16::new(vec![b'x' as u16; 4_000_001]));
    let policy = prepare_policy(&policy_value, &mut setup).unwrap();

    let mut meter = |amount: usize| {
        if amount > 1_000_000 {
            Err(umf_core::EngineError::new(
                "METER_STOP",
                Utf16::default(),
                "diagnostic materialization stopped",
            ))
        } else {
            Ok(())
        }
    };
    let error = literal_errors(
        &Value::Null,
        &integer_field(),
        &integer("01"),
        true,
        &policy,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "METER_STOP");
}

#[test]
fn numeric_interval_nested_field_copies_are_metered_before_allocation() {
    let mut setup = Context::ordinary();
    let policy = generated_policy(&mut setup);
    let mut field = integer_field();
    if let Value::Object(members) = &mut field {
        members.push((
            Utf16::from("opaque"),
            Value::String(Utf16::new(vec![b'x' as u16; 3_000_001])),
        ));
    }
    let range = Value::Object(Vec::new());
    let mut seen_large_copy = 0;
    let mut meter = |amount: usize| {
        if amount == 3_000_001 {
            seen_large_copy += 1;
            if seen_large_copy == 2 {
                return Err(umf_core::EngineError::new(
                    "METER_STOP",
                    Utf16::default(),
                    "nested interval copy stopped",
                ));
            }
        }
        Ok(())
    };
    let error = numeric_interval(
        &field,
        &range,
        &policy,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "METER_STOP");
    assert_eq!(seen_large_copy, 2);
}

#[test]
fn numeric_interval_late_meter_failures_remain_operation_errors() {
    let mut setup = Context::ordinary();
    let policy = generated_policy(&mut setup);
    let field = integer_field();
    let range = obj(vec![("min", integer("1")), ("max", integer("9"))]);
    let mut total_calls = 0usize;
    let mut count_meter = |_amount: usize| {
        total_calls += 1;
        Ok(())
    };
    numeric_interval(
        &field,
        &range,
        &policy,
        &mut Context::ordinary().with_meter(&mut count_meter),
    )
    .unwrap();
    assert!(total_calls > 10);

    // Exercise late exact-bound parsing and interval arithmetic charges. Any
    // caller-meter failure remains an operation error rather than a policy
    // diagnostic, even after ordinary validation has already succeeded.
    for stop_at in total_calls.saturating_sub(8)..total_calls {
        let mut calls = 0usize;
        let mut meter = |_amount: usize| {
            calls += 1;
            if calls == stop_at {
                Err(umf_core::EngineError::new(
                    "METER_STOP",
                    Utf16::default(),
                    "interval work stopped",
                ))
            } else {
                Ok(())
            }
        };
        let error = numeric_interval(
            &field,
            &range,
            &policy,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert_eq!(error.code, "METER_STOP", "meter callback {stop_at}");
    }
}

// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    core_evolution::{inspect_core_evolution, verify_core_evolution},
    engine::{Engine, ResourceSet},
    error::EngineError,
    serialization::{read_json_value, Format},
    Context, Limits, Utf16, Value,
};

const FROZEN: &str = include_str!(
    "../../../docs/helix/04-build/evidence/rust-migration/r5-core-evolution/frozen-typescript-0.10.json"
);

fn parse(input: &str) -> Value {
    read_json_value(
        &input.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m
            .iter()
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
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
fn cases() -> (Value, Engine) {
    let packet = parse(FROZEN);
    (packet, engine())
}

#[test]
fn current_source_frozen_typescript_outcomes_match_exactly() {
    let (packet, engine) = cases();
    let cases = get(&packet, "cases").unwrap();
    let outcomes = get(&packet, "outcomes").unwrap();
    let Value::Object(rows) = cases else {
        panic!("frozen cases must be an object")
    };
    for (name, input) in rows {
        let id = name.to_utf8().unwrap();
        let before = get(input, "before").unwrap();
        let after = get(input, "after").unwrap();
        let policy = get(input, "policy").unwrap();
        let expected = get(outcomes, &id).unwrap();
        let mut ctx = Context::ordinary();
        let actual = inspect_core_evolution(&engine, before, after, policy, &mut ctx);
        if get(expected, "ok") == Some(&Value::Bool(true)) {
            let result = actual.unwrap_or_else(|e| panic!("{id} refused: {e}"));
            let expected_value = get(expected, "value").unwrap();
            if !canonical(expected_value, &result) {
                if let (Value::Object(expected_fields), Value::Object(actual_fields)) =
                    (expected_value, &result)
                {
                    for (key, expected_field) in expected_fields {
                        let observed = actual_fields
                            .iter()
                            .find(|(other, _)| other == key)
                            .map(|(_, v)| v);
                        if !observed.is_some_and(|v| canonical(expected_field, v)) {
                            panic!(
                                "frozen receipt field {} differs for {id}; expected={expected_field:?}; actual={observed:?}",
                                key.to_utf8().unwrap_or_default()
                            );
                        }
                    }
                }
                panic!("frozen receipt differs for {id}");
            }
        } else {
            let expected_error = get(expected, "error").unwrap();
            let error = actual.unwrap_err();
            let actual_error = Value::Object(vec![
                (Utf16::from("code"), Value::string_utf8(error.code)),
                (Utf16::from("message"), Value::String(error.message)),
                (Utf16::from("path"), Value::String(error.path)),
            ]);
            assert!(
                canonical(expected_error, &actual_error),
                "frozen refusal differs for {id}: expected={expected_error:?}, actual={actual_error:?}"
            );
        }
    }
}

#[test]
fn policy_and_old_source_preconditions_refuse_closed() {
    let (packet, engine) = cases();
    let input = get(get(&packet, "cases").unwrap(), "unchanged").unwrap();
    let before = get(input, "before").unwrap();
    let policy = get(input, "policy").unwrap();
    let mut ctx = Context::ordinary();
    let extra = Value::Object(vec![
        (
            Utf16::from("profile"),
            Value::string_utf8("core-0.8-absent-string-additions/0.1"),
        ),
        (Utf16::from("extra"), Value::Bool(true)),
    ]);
    assert_eq!(
        inspect_core_evolution(&engine, before, before, &extra, &mut ctx)
            .unwrap_err()
            .code,
        "CORE_EVOLUTION_POLICY"
    );
    let mut old = before.clone();
    if let Value::Object(fields) = &mut old {
        if let Some((_, Value::String(v))) =
            fields.iter_mut().find(|(k, _)| k == &Utf16::from("umf"))
        {
            *v = Utf16::from("0.7.0");
        }
    }
    assert_eq!(
        inspect_core_evolution(&engine, &old, before, policy, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "CORE_DATASET_SOURCE"
    );
}

#[test]
fn context_work_meter_and_value_limit_refuse_before_receipt() {
    let (packet, engine) = cases();
    let input = get(
        get(&packet, "cases").unwrap(),
        "accepted_absent_string_addition",
    )
    .unwrap();
    let mut stopped = 0usize;
    let mut meter = |_: usize| {
        stopped += 1;
        Err(EngineError::new(
            "EVOLUTION_METER_STOP",
            Utf16::default(),
            "stopped",
        ))
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error = inspect_core_evolution(
        &engine,
        get(input, "before").unwrap(),
        get(input, "after").unwrap(),
        get(input, "policy").unwrap(),
        &mut ctx,
    )
    .unwrap_err();
    assert_eq!(error.code, "EVOLUTION_METER_STOP");
    assert!(stopped > 0);

    let limits = Limits {
        max_values: 8,
        ..Limits::ordinary()
    };
    let mut limited =
        Context::with_limits(umf_core::context::ResourceProfile::Cooperative, limits).unwrap();
    let error = inspect_core_evolution(
        &engine,
        get(input, "before").unwrap(),
        get(input, "after").unwrap(),
        get(input, "policy").unwrap(),
        &mut limited,
    )
    .unwrap_err();
    assert_eq!(error.code, "LIMIT");
}

#[test]
fn aggregate_value_and_serialized_byte_limits_preflight_before_validation() {
    let (_packet, engine) = cases();
    let policy = Value::Object(vec![(
        Utf16::from("profile"),
        Value::string_utf8("core-0.8-absent-string-additions/0.1"),
    )]);
    let many = Value::Array(vec![Value::Null; 50_001]);
    let error = inspect_core_evolution(&engine, &many, &many, &policy, &mut Context::ordinary())
        .unwrap_err();
    assert_eq!(error.code, "LIMIT");
    let large = Value::String(Utf16::from_utf8(&"x".repeat(2_000_001)));
    let error = inspect_core_evolution(&engine, &large, &large, &policy, &mut Context::ordinary())
        .unwrap_err();
    assert_eq!(error.code, "LIMIT");
}

#[test]
fn duplicate_keys_fail_closed_and_large_unknown_objects_are_metered() {
    let (packet, engine) = cases();
    let policy = Value::Object(vec![(
        Utf16::from("profile"),
        Value::string_utf8("core-0.8-absent-string-additions/0.1"),
    )]);
    let duplicate = Value::Object(vec![
        (Utf16::from("umf"), Value::string_utf8("0.10.0")),
        (Utf16::from("umf"), Value::string_utf8("0.10.0")),
    ]);
    assert_eq!(
        inspect_core_evolution(
            &engine,
            &duplicate,
            &duplicate,
            &policy,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "DUPLICATE_KEY"
    );
    let mut fields = (0..1_000)
        .map(|i| {
            (
                Utf16::from(format!("extension-{i:04}")),
                Value::string_utf8("kept"),
            )
        })
        .collect::<Vec<_>>();
    let unknown = Value::Object(fields.drain(..).collect());
    let frozen = get(get(&packet, "cases").unwrap(), "unchanged").unwrap();
    let mut before = get(frozen, "before").unwrap().clone();
    if let Value::Object(fields) = &mut before {
        fields.push((Utf16::from("opaque"), unknown));
    }
    let after = before.clone();
    let mut metered = 0usize;
    let mut meter = |amount: usize| {
        metered = metered.saturating_add(amount);
        Ok(())
    };
    let receipt = inspect_core_evolution(
        &engine,
        &before,
        &after,
        &policy,
        &mut Context::ordinary().with_meter(&mut meter),
    );
    assert!(receipt.is_ok());
    assert!(
        metered > 2_000,
        "expected bounded traversal/comparison work to reach the Context meter: {metered}"
    );
}

#[test]
fn wide_object_member_scan_is_charged_before_linear_traversal() {
    let (packet, engine) = cases();
    let policy = Value::Object(vec![(
        Utf16::from("profile"),
        Value::string_utf8("core-0.8-absent-string-additions/0.1"),
    )]);
    let frozen = get(get(&packet, "cases").unwrap(), "unchanged").unwrap();
    let mut before = get(frozen, "before").unwrap().clone();
    if let Value::Object(fields) = &mut before {
        fields.extend((0..4_096).map(|i| {
            (
                Utf16::from(format!("wide-extension-{i:04}")),
                Value::Null,
            )
        }));
    } else {
        panic!("frozen source must be an object");
    }
    let after = before.clone();
    let mut observed_scan_charge = None;
    let mut meter = |amount: usize| {
        if amount >= 4_000 {
            observed_scan_charge = Some(amount);
            return Err(EngineError::new(
                "EVOLUTION_WIDE_SCAN_STOP",
                Utf16::default(),
                "wide member scan stopped before traversal",
            ));
        }
        Ok(())
    };
    let error = inspect_core_evolution(
        &engine,
        &before,
        &after,
        &policy,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "EVOLUTION_WIDE_SCAN_STOP");
    assert!(observed_scan_charge.is_some_and(|amount| amount >= 4_000));
}

#[test]
fn unknown_meaning_remains_in_result_and_mutation_changes_classification() {
    let (packet, engine) = cases();
    let input = get(get(&packet, "cases").unwrap(), "unknown_retained").unwrap();
    let receipt = inspect_core_evolution(
        &engine,
        get(input, "before").unwrap(),
        get(input, "after").unwrap(),
        get(input, "policy").unwrap(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        get(&receipt, "classification"),
        Some(&Value::string_utf8("unsupported"))
    );
    assert!(get(get(&receipt, "after").unwrap(), "opaque").is_some());
    let mut mutation = get(&receipt, "after").unwrap().clone();
    if let Some(Value::Array(modules)) = get_mut(&mut mutation, "modules") {
        let field = modules
            .iter_mut()
            .find(|m| get(m, "id") == Some(&Value::string_utf8("domain")))
            .and_then(|m| get_mut(m, "elements"))
            .and_then(|v| match v {
                Value::Array(a) => a
                    .iter_mut()
                    .find(|e| get(e, "id") == Some(&Value::string_utf8("order_lines.quantity"))),
                _ => None,
            })
            .unwrap();
        if let Value::Object(fields) = field {
            if let Some((_, v)) = fields
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("scalarType"))
            {
                *v = Value::string_utf8("string");
            }
        }
    }
    let receipt2 = inspect_core_evolution(
        &engine,
        get(input, "before").unwrap(),
        &mutation,
        get(input, "policy").unwrap(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        get(&receipt2, "classification"),
        Some(&Value::string_utf8("breaking"))
    );
}

#[test]
fn verification_recomputes_against_independent_inputs_and_refuses_forgery() {
    let (packet, engine) = cases();
    let input = get(
        get(&packet, "cases").unwrap(),
        "accepted_absent_string_addition",
    )
    .unwrap();
    let before = get(input, "before").unwrap();
    let after = get(input, "after").unwrap();
    let policy = get(input, "policy").unwrap();
    let receipt =
        inspect_core_evolution(&engine, before, after, policy, &mut Context::ordinary()).unwrap();
    let verified = verify_core_evolution(
        &receipt,
        before,
        after,
        policy,
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(canonical(&receipt, &verified));
    assert_eq!(
        verify_core_evolution(
            &receipt,
            after,
            after,
            policy,
            &engine,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "CORE_EVOLUTION_RECEIPT"
    );
    let mut forged = receipt.clone();
    if let Some(Value::Bool(complete)) = get_mut(&mut forged, "complete") {
        *complete = false;
    }
    assert_eq!(
        verify_core_evolution(
            &forged,
            before,
            after,
            policy,
            &engine,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "CORE_EVOLUTION_RECEIPT"
    );
    let mut unknown = receipt.clone();
    if let Value::Object(fields) = &mut unknown {
        fields.push((Utf16::from("unknownReceiptMember"), Value::Bool(true)));
    }
    assert_eq!(
        verify_core_evolution(
            &unknown,
            before,
            after,
            policy,
            &engine,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "CORE_EVOLUTION_RECEIPT"
    );
}

fn get_mut<'a>(v: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match v {
        Value::Object(m) => m
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}

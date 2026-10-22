// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-089-AC20 @covers US-089-AC24
use umf_core::{copy_json, Context, Utf16, Value};

fn nested(depth: usize) -> Value {
    let mut value = Value::Null;
    for _ in 0..depth {
        value = Value::Array(vec![value]);
    }
    value
}

#[test]
fn actual_depth_and_ordinary_catalog_value_boundaries() {
    assert!(copy_json(&nested(128), &mut Context::ordinary()).is_ok());
    assert_eq!(
        copy_json(&nested(129), &mut Context::ordinary())
            .unwrap_err()
            .code,
        "LIMIT"
    );
    assert!(copy_json(
        &Value::Array(vec![Value::Null; 99_999]),
        &mut Context::ordinary()
    )
    .is_ok());
    assert_eq!(
        copy_json(
            &Value::Array(vec![Value::Null; 100_000]),
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "LIMIT"
    );
    assert!(copy_json(
        &Value::Array(vec![Value::Null; 999_999]),
        &mut Context::catalog()
    )
    .is_ok());
    assert_eq!(
        copy_json(
            &Value::Array(vec![Value::Null; 1_000_000]),
            &mut Context::catalog()
        )
        .unwrap_err()
        .code,
        "LIMIT"
    );
}

#[test]
fn direct_value_text_retains_prior_profile_and_charges_before_copy() {
    // Existing copyJson has no source/output-text ceiling on direct values.
    let input = Value::String(Utf16::new(vec![65; 4_000_001]));
    assert_eq!(copy_json(&input, &mut Context::ordinary()).unwrap(), input);
    let mut observed = Vec::new();
    let mut meter = |units| {
        observed.push(units);
        if units > 4_000_000 {
            Err(umf_core::EngineError::new(
                "COPY_BUDGET",
                Utf16::default(),
                "copy refused",
            ))
        } else {
            Ok(())
        }
    };
    assert_eq!(
        copy_json(&input, &mut Context::ordinary().with_meter(&mut meter))
            .unwrap_err()
            .code,
        "COPY_BUDGET"
    );
    assert!(observed.contains(&4_000_001));
}

#[test]
fn actual_mid_work_cancellation_and_injected_deadline_refuse_atomically() {
    let input = Value::Array(vec![Value::Null; 20]);
    let mut polls = 0;
    let mut cancellation = || {
        polls += 1;
        polls >= 4
    };
    assert_eq!(
        copy_json(
            &input,
            &mut Context::ordinary().with_cancellation(&mut cancellation)
        )
        .unwrap_err()
        .code,
        "CANCELLED"
    );
    assert_eq!(polls, 4);
    let mut time = 0;
    let mut clock = || {
        time += 1;
        Some(time)
    };
    assert_eq!(
        copy_json(&input, &mut Context::ordinary().with_clock(&mut clock, 3))
            .unwrap_err()
            .code,
        "DEADLINE"
    );
    assert!(copy_json(&input, &mut Context::ordinary()).is_ok());
}

#[test]
fn reentrant_copies_have_independent_counters_and_propagate_host_failure() {
    let nested_input = Value::Array(vec![Value::Bool(true); 3]);
    let mut calls = 0;
    let mut meter = |_amount| {
        calls += 1;
        let mut nested_context = Context::ordinary();
        assert_eq!(copy_json(&nested_input, &mut nested_context)?, nested_input);
        Ok(())
    };
    assert!(copy_json(
        &Value::Array(vec![Value::Null; 10]),
        &mut Context::ordinary().with_meter(&mut meter)
    )
    .is_ok());
    assert!(calls > 2);
    let mut failing_meter = |_| {
        Err(umf_core::EngineError::new(
            "HOST_FAILURE",
            Utf16::default(),
            "host failed",
        ))
    };
    assert_eq!(
        copy_json(
            &Value::Null,
            &mut Context::ordinary().with_meter(&mut failing_meter)
        )
        .unwrap_err()
        .code,
        "HOST_FAILURE"
    );
    assert!(copy_json(&Value::Null, &mut Context::ordinary()).is_ok());
}

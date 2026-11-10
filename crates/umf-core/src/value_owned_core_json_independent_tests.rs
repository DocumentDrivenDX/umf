// SPDX-License-Identifier: MIT OR Apache-2.0
//! Independent custody-carrier SOURCE controls. NATIVE UNEXECUTED.
//! Child of value.rs. No proof fields or unchecked constructors are used.
use super::*;
use std::cell::{Cell, RefCell};

type Charges = RefCell<Vec<usize>>;
fn fixture() -> Value {
    Value::Object(vec![
        (
            Utf16::from("a/b~"),
            Value::Array(vec![Value::Number(1.0), Value::Bool(true), Value::Null]),
        ),
        (
            Utf16::from("unknown"),
            Value::Object(vec![(
                Utf16::new(vec![0xd800]),
                Value::String(Utf16::new(vec![0xdc00, 0xd83d, 0xde00])),
            )]),
        ),
    ])
}
fn package() -> Value {
    Value::Object(vec![
        (Utf16::from("metadata"), Value::string_utf8("opaque parent")),
        (Utf16::from("schema"), fixture()),
        (Utf16::from("retained"), Value::Bool(false)),
    ])
}
fn context<'a>(limits: crate::context::Limits) -> Context<'a> {
    Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap()
}
fn span(trace: &Charges, start: usize) -> Vec<usize> {
    trace.borrow()[start..].to_vec()
}
fn original(
    value: Value,
    root: &str,
    limits: crate::context::Limits,
) -> Result<Value, EngineError> {
    admit_owned_json_at(value, Utf16::from(root), &mut context(limits))
}
fn validator_work(value: &Value, root: &str, limits: crate::context::Limits) -> Vec<usize> {
    let work = RefCell::new(Vec::new());
    let mut meter = |n| {
        work.borrow_mut().push(n);
        Ok(())
    };
    admit_owned_json_at(
        value.clone(),
        Utf16::from(root),
        &mut context(limits).with_meter(&mut meter),
    )
    .unwrap();
    work.into_inner()
}
fn paid(actual: &[usize], value: &Value, limits: crate::context::Limits) {
    let full = validator_work(value, "", limits);
    assert!(full.len() > 1);
    assert!(actual.len() > full.len());
    assert!(
        actual.ends_with(&full),
        "mismatch must execute original complete default-root validator"
    );
}
fn hit(actual: &[usize], value: &Value, limits: crate::context::Limits) {
    let full = validator_work(value, "", limits);
    assert!(full.len() > 1);
    assert!(
        !actual.is_empty(),
        "compatible custody still pays its checks"
    );
    assert!(
        actual.len() < full.len(),
        "actual compatible consumer must not repeat the complete tree walk"
    );
}
fn host_error() -> EngineError {
    let mut e = EngineError::new(
        "CANCELLED",
        Utf16::new(vec![47, 0xd800, 126]),
        "original custody host refusal",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("carrier-origin-δ"));
    e.with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference)
}
fn host_fields(actual: &EngineError, expected: &EngineError) {
    assert_eq!(actual.code, expected.code);
    assert_eq!(actual.path, expected.path);
    assert_eq!(actual.message, expected.message);
    assert_eq!(actual.python_message_origin, expected.python_message_origin);
    assert!(actual.is_control_failure());
    assert!(!actual.is_python_schema_terminal());
}

#[test]
fn real_complete_admission_then_actual_consumer_differs_from_bare_paid_validation() {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    let before = ctx.charged_work();
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let start = trace.borrow().len();
        let carrier = OwnedCoreJson::admit_native_resource(fixture(), op, ctx)?;
        let native = validator_work(&fixture(), "#", ctx.limits());
        assert!(span(&trace, start).starts_with(&native));
        assert_eq!(carrier.value(), &fixture());
        let start = trace.borrow().len();
        let value = carrier.into_resource(op, ctx)?;
        assert_eq!(value, fixture());
        hit(&span(&trace, start), &value, ctx.limits());
        let start = trace.borrow().len();
        let bare = admit_owned_json(value.clone(), ctx)?;
        assert_eq!(bare, value);
        assert_eq!(
            span(&trace, start),
            validator_work(&value, "", ctx.limits())
        );
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.charged_work() > before);
    assert!(ctx.owned_core_operation.is_none());
}

#[test]
fn malformed_numbers_duplicates_depth_nodes_and_raw_utf16_precede_carrier_publication() {
    let limits = Context::catalog().limits();
    let bad = Value::Object(vec![(
        Utf16::from("a/b~"),
        Value::Array(vec![Value::Number(-0.0)]),
    )]);
    let mut cases = vec![(bad, limits, "NUMBER", "#/a~1b~0/0")];
    for number in [f64::NAN, f64::INFINITY, 9_007_199_254_740_992.0] {
        cases.push((Value::Number(number), limits, "NUMBER", "#"));
    }
    cases.push((
        Value::Object(vec![
            (Utf16::new(vec![0xd800]), Value::Null),
            (Utf16::new(vec![0xd800]), Value::Number(f64::NAN)),
        ]),
        limits,
        "DUPLICATE_KEY",
        "#",
    ));
    let mut depth = limits;
    depth.max_depth = 1;
    cases.push((
        Value::Array(vec![Value::Array(vec![Value::Null])]),
        depth,
        "LIMIT",
        "#/0/0",
    ));
    let mut nodes = limits;
    nodes.max_values = 2;
    cases.push((
        Value::Array(vec![Value::Null, Value::Null]),
        nodes,
        "LIMIT",
        "#",
    ));
    for (value, limits, code, path) in cases {
        let expected = original(value.clone(), "#", limits).unwrap_err();
        assert_eq!(expected.code, code);
        assert_eq!(expected.path, Utf16::from(path));
        let events = RefCell::new(Vec::new());
        let mut event = |name| events.borrow_mut().push(name);
        let actual = OwnedCoreOperation::with_context(&mut context(limits), |ctx, op| {
            OwnedCoreJson::admit_native_resource_with_events(value, op, ctx, &mut event)
        })
        .unwrap_err();
        assert_eq!(actual, expected);
        assert!(
            events.borrow().is_empty(),
            "validation failure cannot publish header/token/carrier"
        );
    }
    OwnedCoreOperation::with_context(&mut Context::catalog(), |ctx, op| {
        let raw = Value::String(Utf16::new(vec![0xd800, 0xdc00, 0xdc00]));
        let carrier = OwnedCoreJson::admit_native_resource(raw.clone(), op, ctx)?;
        assert_eq!(carrier.value(), &raw);
        assert_eq!(carrier.into_resource(op, ctx)?, raw);
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn sequential_core_inputs_keep_earliest_error_and_never_publish_the_bad_or_later_input() {
    for first_bad in 0..4 {
        let events = RefCell::new(Vec::new());
        let current = Cell::new(0usize);
        let mut event = |_| events.borrow_mut().push(current.get());
        let error = OwnedCoreOperation::with_context(&mut Context::catalog(), |ctx, op| {
            for i in 0..4 {
                current.set(i);
                let value = if i < first_bad {
                    fixture()
                } else {
                    Value::Object(vec![(Utf16::from(format!("bad-{i}")), Value::Number(-0.0))])
                };
                let _ =
                    OwnedCoreJson::admit_native_resource_with_events(value, op, ctx, &mut event)?;
            }
            Ok(())
        })
        .unwrap_err();
        assert_eq!(error.code, "NUMBER");
        assert_eq!(error.path, Utf16::from(format!("#/bad-{first_bad}")));
        assert_eq!(*events.borrow(), (0..first_bad).collect::<Vec<_>>());
        // This is sequential admitter coverage, not the unfrozen nine-name factory.
    }
}

#[test]
fn foreign_context_operation_and_expired_lifetime_cannot_reuse_custody() {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        for active_other_op in [false, true] {
            let mut foreign = Context::catalog();
            let counterfeit = if active_other_op {
                OwnedCoreOperation::with_context(&mut foreign, |foreign, _| {
                    OwnedCoreJson::admit_native_resource(fixture(), op, foreign)
                })?
            } else {
                foreign.with_codegen_construction(|foreign| {
                    OwnedCoreJson::admit_native_resource(fixture(), op, foreign)
                })?
            };
            let start = trace.borrow().len();
            let value = counterfeit.into_resource(op, ctx)?;
            assert_eq!(value, fixture());
            paid(&span(&trace, start), &value, ctx.limits());
        }
        for use_parent_reference in [false, true] {
            let carrier = OwnedCoreJson::admit_native_resource(fixture(), op, ctx)?;
            let start = trace.borrow().len();
            let value = OwnedCoreOperation::with_context(ctx, |inner, other| {
                carrier.into_resource(if use_parent_reference { op } else { other }, inner)
            })?;
            assert_eq!(value, fixture());
            paid(&span(&trace, start), &value, ctx.limits());
        }
        let carrier = OwnedCoreJson::admit_native_resource(fixture(), op, ctx)?;
        let start = trace.borrow().len();
        let value = carrier.into_resource(op, ctx)?;
        hit(&span(&trace, start), &value, ctx.limits());
        Ok::<(), EngineError>(())
    })
    .unwrap();
    let escaped = OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        OwnedCoreJson::admit_native_resource(fixture(), op, ctx)
    })
    .unwrap();
    OwnedCoreOperation::with_context(&mut ctx, |ctx, new_op| {
        let start = trace.borrow().len();
        let value = escaped.into_resource(new_op, ctx)?;
        paid(&span(&trace, start), &value, ctx.limits());
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.owned_core_operation.is_none());
}

#[test]
fn exact_limits_and_existing_profile_boundaries_select_paid_fallback() {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let carrier = OwnedCoreJson::admit_native_resource(fixture(), op, ctx)?;
        let smaller = ctx.limits().max_text_units - 1;
        ctx.with_aggregate_text_limit(smaller, |changed| {
            let start = trace.borrow().len();
            let value = carrier.into_resource(op, changed)?;
            paid(&span(&trace, start), &value, changed.limits());
            Ok::<(), EngineError>(())
        })?;
        let carrier = ctx.with_catalog_value_limit(|catalog| {
            OwnedCoreJson::admit_native_resource(fixture(), op, catalog)
        })?;
        let start = trace.borrow().len();
        let value = carrier.into_resource(op, ctx)?;
        paid(&span(&trace, start), &value, ctx.limits());
        let carrier = OwnedCoreJson::admit_native_resource(fixture(), op, ctx)?;
        let start = trace.borrow().len();
        let value = carrier.into_resource(op, ctx)?;
        hit(&span(&trace, start), &value, ctx.limits());
        Ok::<(), EngineError>(())
    })
    .unwrap();
    let error = Context::with_limits(
        crate::context::ResourceProfile::HardIsolated,
        Context::ordinary().limits(),
    )
    .err()
    .unwrap();
    assert_eq!(error.code, "RESOURCE_PROFILE_UNAVAILABLE");
    // No supported alternate ResourceProfile can be forged to probe private fields.
}

#[test]
fn native_and_checked_schema_origins_have_distinct_consumers_and_paid_mismatch() {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let native = OwnedCoreJson::admit_native_resource(fixture(), op, ctx)?;
        let start = trace.borrow().len();
        let value = native.into_schema_copy(op, ctx)?;
        paid(&span(&trace, start), &value, ctx.limits());
        let parent = OwnedCoreJson::admit_native_resource(package(), op, ctx)?;
        let child = parent.copy_schema_member(op, ctx, "schema missing")?;
        assert_eq!(child.value(), &fixture());
        let start = trace.borrow().len();
        let value = child.into_schema_copy(op, ctx)?;
        assert_eq!(value, fixture());
        hit(&span(&trace, start), &value, ctx.limits());
        let child = parent.copy_schema_member(op, ctx, "schema missing")?;
        let start = trace.borrow().len();
        let value = child.into_resource(op, ctx)?;
        paid(&span(&trace, start), &value, ctx.limits());
        assert_eq!(parent.value(), &package());
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn checked_projection_is_a_real_paid_copy_with_isolated_unknown_content_and_root_limits() {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let parent = OwnedCoreJson::admit_native_resource(package(), op, ctx)?;
        let effects = RefCell::new(Vec::new());
        let mut event = |name| effects.borrow_mut().push((name, trace.borrow().len()));
        let start = trace.borrow().len();
        let child = parent.copy_schema_member_with_events(
            op,
            ctx,
            "exact old missing message",
            &mut event,
        )?;
        let charged = span(&trace, start);
        let oracle = RefCell::new(Vec::new());
        let mut meter = |n| {
            oracle.borrow_mut().push(n);
            Ok(())
        };
        copy_json(&fixture(), &mut Context::catalog().with_meter(&mut meter))?;
        let effects = effects.into_inner();
        let complete = effects
            .iter()
            .find(|(name, _)| *name == "schema-copy-completed")
            .unwrap()
            .1;
        assert!(complete >= oracle.borrow().len());
        assert!(trace.borrow()[start..complete].ends_with(&oracle.borrow()));
        assert!(!charged.is_empty());
        assert_eq!(child.value(), &fixture());
        let mut exposed = child.into_raw();
        let Value::Object(fields) = &mut exposed else {
            panic!("copied schema")
        };
        fields[0].0 = Utf16::from("mutated");
        fields[0].1 = Value::Number(-0.0);
        assert_eq!(parent.value(), &package());
        assert_eq!(
            parent
                .copy_schema_member(op, ctx, "missing")?
                .into_schema_copy(op, ctx)?,
            fixture()
        );
        let empty = OwnedCoreJson::admit_native_resource(Value::Null, op, ctx)?;
        let error = empty
            .copy_schema_member(op, ctx, "exact old missing message")
            .unwrap_err();
        assert_eq!(error.code, "REQUEST");
        assert!(error.path.units().is_empty());
        assert_eq!(error.message, Utf16::from("exact old missing message"));
        Ok::<(), EngineError>(())
    })
    .unwrap();
    let mut limits = Context::ordinary().limits();
    limits.max_depth = 0;
    OwnedCoreOperation::with_context(&mut context(limits), |ctx, op| {
        let value = Value::Object(vec![(
            Utf16::from("schema"),
            Value::Object(vec![(Utf16::from("outer"), Value::Bool(true))]),
        )]);
        let parent = ctx.with_schema_depth_allowance(4, |ctx| {
            OwnedCoreJson::admit_native_resource(value, op, ctx)
        })?;
        let expected = copy_json(
            &Value::Object(vec![(Utf16::from("outer"), Value::Bool(true))]),
            ctx,
        )
        .unwrap_err();
        let error = parent.copy_schema_member(op, ctx, "missing").unwrap_err();
        assert_eq!(error, expected);
        assert_eq!(error.code, "LIMIT");
        assert_eq!(error.path, Utf16::from("/outer"));
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn raw_extraction_and_borrowed_value_clone_destroy_reuse_and_require_new_admission() {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let carrier = OwnedCoreJson::admit_native_resource(fixture(), op, ctx)?;
        let borrowed = carrier.value().clone();
        let start = trace.borrow().len();
        let second = OwnedCoreJson::admit_native_resource(borrowed, op, ctx)?;
        assert!(span(&trace, start).starts_with(&validator_work(&fixture(), "#", ctx.limits())));
        drop(second);
        let mut raw = carrier.into_raw();
        let start = trace.borrow().len();
        assert_eq!(admit_owned_json(raw.clone(), ctx)?, fixture());
        assert_eq!(span(&trace, start), validator_work(&raw, "", ctx.limits()));
        let Value::Object(fields) = &mut raw else {
            panic!("raw object")
        };
        fields.push((Utf16::from("changed"), Value::Number(-0.0)));
        let expected = original(raw.clone(), "#", ctx.limits()).unwrap_err();
        let error = OwnedCoreJson::admit_native_resource(raw, op, ctx).unwrap_err();
        assert_eq!(error, expected);
        assert_eq!(error.path, Utf16::from("#/changed"));
        let fresh = OwnedCoreJson::admit_native_resource(fixture(), op, ctx)?;
        assert_eq!(fresh.into_resource(op, ctx)?, fixture());
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

// Observer bridges do not call Context or alter the admission sequence.
fn custody_stage(
    ctx: &mut Context<'_>,
    projection: bool,
    observer: &mut dyn FnMut(&'static str),
) -> Result<(), EngineError> {
    let observer = RefCell::new(observer);
    let mut operation_event = |name| (observer.borrow_mut())(name);
    let mut value_event = |name| (observer.borrow_mut())(name);
    OwnedCoreOperation::with_context_with_events(
        ctx,
        |ctx, op| {
            if projection {
                let parent = OwnedCoreJson::admit_native_resource(package(), op, ctx)?;
                let child =
                    parent.copy_schema_member_with_events(op, ctx, "missing", &mut value_event)?;
                assert_eq!(child.value(), &fixture());
            } else {
                let child = OwnedCoreJson::admit_native_resource_with_events(
                    fixture(),
                    op,
                    ctx,
                    &mut value_event,
                )?;
                assert_eq!(child.value(), &fixture());
            }
            Ok(())
        },
        &mut operation_event,
    )
}
fn custody_stage_plain(ctx: &mut Context<'_>, projection: bool) -> Result<(), EngineError> {
    OwnedCoreOperation::with_context(ctx, |ctx, op| {
        if projection {
            let parent = OwnedCoreJson::admit_native_resource(package(), op, ctx)?;
            assert_eq!(
                parent.copy_schema_member(op, ctx, "missing")?.value(),
                &fixture()
            );
        } else {
            assert_eq!(
                OwnedCoreJson::admit_native_resource(fixture(), op, ctx)?.value(),
                &fixture()
            );
        }
        Ok(())
    })
}

#[test]
fn actual_header_copy_and_publication_admissions_preserve_terminal_denial_and_stop_effects() {
    for projection in [false, true] {
        let charges = RefCell::new(Vec::new());
        let mut meter = |n| {
            charges.borrow_mut().push(n);
            Ok(())
        };
        let effects = RefCell::new(Vec::new());
        let mut event = |name| effects.borrow_mut().push((name, charges.borrow().len()));
        let mut ctx = Context::catalog().with_meter(&mut meter);
        custody_stage(&mut ctx, projection, &mut event).unwrap();
        assert!(ctx.owned_core_operation.is_none());
        let effects = effects.into_inner();
        let charges = charges.into_inner();
        let plain = RefCell::new(Vec::new());
        let mut meter = |n| {
            plain.borrow_mut().push(n);
            Ok(())
        };
        custody_stage_plain(&mut Context::catalog().with_meter(&mut meter), projection).unwrap();
        assert_eq!(*plain.borrow(), charges);
        assert_eq!(effects.first().unwrap().0, "operation-publication");
        assert_eq!(effects.last().unwrap().0, "carrier-publication");
        if projection {
            assert!(
                effects
                    .iter()
                    .any(|(name, _)| *name == "schema-member-read")
            );
            assert!(
                effects
                    .iter()
                    .any(|(name, _)| *name == "schema-copy-completed")
            );
        }
        // Every real callback is denied independently. Shared callback groups
        // remove every later effect; completed-copy is a post-operation marker.
        for denied in 1..=charges.len() {
            let calls = Cell::new(0);
            let after = Cell::new(0);
            let terminal = Cell::new(false);
            let wanted = host_error();
            let mut meter = |_| {
                if terminal.get() {
                    after.set(after.get() + 1);
                }
                calls.set(calls.get() + 1);
                if calls.get() == denied {
                    terminal.set(true);
                    Err(wanted.clone())
                } else {
                    Ok(())
                }
            };
            let seen = RefCell::new(Vec::new());
            let mut event = |name| seen.borrow_mut().push((name, calls.get()));
            let mut ctx = Context::catalog().with_meter(&mut meter);
            let error = custody_stage(&mut ctx, projection, &mut event).unwrap_err();
            host_fields(&error, &wanted);
            assert_eq!(calls.get(), denied);
            assert_eq!(after.get(), 0);
            assert!(ctx.owned_core_operation.is_none());
            let prior: Vec<_> = effects
                .iter()
                .copied()
                .filter(|(_, at)| *at < denied)
                .collect();
            assert_eq!(*seen.borrow(), prior);
        }
    }
}

#[test]
fn actual_operation_reentry_errors_and_unwind_restore_parent_without_resetting_work() {
    let unwinding = Cell::new(false);
    let after_unwind = Cell::new(0usize);
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        if unwinding.get() {
            after_unwind.set(after_unwind.get() + 1);
        }
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, parent| {
        let before = ctx.charged_work();
        let error = OwnedCoreOperation::with_context(ctx, |ctx, child| {
            let value = OwnedCoreJson::admit_native_resource(fixture(), child, ctx)?
                .into_resource(child, ctx)?;
            assert_eq!(value, fixture());
            Err::<(), _>(host_error())
        })
        .unwrap_err();
        assert_eq!(error, host_error());
        assert!(ctx.charged_work() > before);
        for marker in ["operation-publication", "carrier-publication"] {
            let before = ctx.charged_work();
            let unwind = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let mut op_event = |name| {
                    if name == marker {
                        unwinding.set(true);
                        panic!("independent operation observer unwind")
                    }
                };
                let mut value_event = |name| {
                    if name == marker {
                        unwinding.set(true);
                        panic!("independent carrier observer unwind")
                    }
                };
                OwnedCoreOperation::with_context_with_events(
                    ctx,
                    |ctx, child| {
                        OwnedCoreJson::admit_native_resource_with_events(
                            fixture(),
                            child,
                            ctx,
                            &mut value_event,
                        )?;
                        Ok::<(), EngineError>(())
                    },
                    &mut op_event,
                )
                .unwrap();
            }));
            assert!(unwind.is_err());
            assert_eq!(after_unwind.get(), 0);
            unwinding.set(false);
            assert!(ctx.charged_work() > before);
            let carrier = OwnedCoreJson::admit_native_resource(fixture(), parent, ctx)?;
            let start = trace.borrow().len();
            let value = carrier.into_resource(parent, ctx)?;
            hit(&span(&trace, start), &value, ctx.limits());
        }
        // Reenter a genuine independent Context from a host work callback.
        let entered = Cell::new(false);
        let mut inner_meter = |_| {
            if !entered.replace(true) {
                let mut independent = Context::catalog();
                OwnedCoreOperation::with_context(&mut independent, |ctx, op| {
                    assert_eq!(
                        OwnedCoreJson::admit_native_resource(fixture(), op, ctx)?
                            .into_resource(op, ctx)?,
                        fixture()
                    );
                    Ok::<(), EngineError>(())
                })?;
                assert!(independent.owned_core_operation.is_none());
            }
            Ok(())
        };
        let mut independent = Context::catalog().with_meter(&mut inner_meter);
        OwnedCoreOperation::with_context(&mut independent, |ctx, op| {
            assert_eq!(
                OwnedCoreJson::admit_native_resource(fixture(), op, ctx)?.into_resource(op, ctx)?,
                fixture()
            );
            Ok::<(), EngineError>(())
        })?;
        assert!(entered.get());
        assert!(independent.owned_core_operation.is_none());
        let carrier = OwnedCoreJson::admit_native_resource(fixture(), parent, ctx)?;
        let start = trace.borrow().len();
        let value = carrier.into_resource(parent, ctx)?;
        hit(&span(&trace, start), &value, ctx.limits());
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.owned_core_operation.is_none());
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        assert_eq!(
            OwnedCoreJson::admit_native_resource(fixture(), op, ctx)?.into_resource(op, ctx)?,
            fixture()
        );
        Ok::<(), EngineError>(())
    })
    .unwrap();
}


// Legacy Shared/storage successor controls: SOURCE ONLY, UNCOMPILED/UNEXECUTED.
#[test]
fn storage_text_copy_preserves_all_storage_kinds_without_new_input_admission() {
    let values=[Utf16::new(vec![0xd800,0,0xdc00]),
        Utf16::shared(vec![0xd800,0,0xdc00]),Utf16::from_static_units(&[0xd800,0,0xdc00])];
    for value in values {
        let limits=crate::context::Limits{max_text_units:0,max_values:0,max_depth:0,..crate::context::Limits::ordinary()};
        let calls=Cell::new(0);let mut meter=|_|{calls.set(calls.get()+1);Ok(())};
        let copied=value.copy_storage_with_context(&mut context(limits).with_meter(&mut meter)).unwrap();
        assert_eq!(copied.units(),value.units());
        match (&value.0,&copied.0) {
            (TextStorage::Owned(a),TextStorage::Owned(b))=>assert_ne!(a.as_ptr(),b.as_ptr()),
            (TextStorage::Shared(a),TextStorage::Shared(b))=>assert!(std::sync::Arc::ptr_eq(a,b)),
            (TextStorage::Static(a),TextStorage::Static(b))=>assert_eq!(a.as_ptr(),b.as_ptr()),
            _=>panic!("storage provenance changed"),
        }
        for deny in 0..calls.get(){
            let at=Cell::new(0);let mut stop=|_|{let n=at.replace(at.get()+1);if n==deny{Err(host_error())}else{Ok(())}};
            host_fields(&value.copy_storage_with_context(&mut context(limits).with_meter(&mut stop)).unwrap_err(),&host_error());
            assert_eq!(value.units(),&[0xd800,0,0xdc00]);
            assert_eq!(at.get(),deny+1,"no terminal cleanup callback");
        }
    }
}

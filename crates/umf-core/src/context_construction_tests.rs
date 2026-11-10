// SPDX-License-Identifier: MIT OR Apache-2.0
//! Independent actual Context scope/admission controls; source-only until review.
use super::*;
use std::cell::Cell;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::rc::Rc;

fn tiny_compile(ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let schema = crate::value::Value::Object(vec![(
        Utf16::from("type"),
        crate::value::Value::string_utf8("object"),
    )]);
    crate::schema::CompiledSchema::compile(&schema, &crate::schema::SchemaResources::default(), ctx)
        .map(|_| ())
}

fn nested_value(depth: usize) -> crate::value::Value {
    let mut value = crate::value::Value::Null;
    for _ in 0..depth {
        value = crate::value::Value::Array(vec![value]);
    }
    value
}

#[test]
fn denied_entry_never_calls_operation_or_replaces_live_prior_state() {
    let denied = Cell::new(false);
    let operation_called = Cell::new(false);
    let observed = Cell::new(0u64);
    let events = Cell::new(0usize);
    let mut control = |amount| {
        observed.set(observed.get() + amount as u64);
        events.set(events.get() + 1);
        if denied.get() {
            Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::from("/entry"),
                "first entry denial",
            ))
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::catalog().with_host_control(&mut control);
    denied.set(true);
    let before = ctx.charged_work();
    let error = ctx
        .with_codegen_construction::<()>(|_| {
            operation_called.set(true);
            Ok(())
        })
        .unwrap_err();
    assert_eq!(error.code, "RESOURCE_LIMIT");
    assert_eq!(error.path, Utf16::from("/entry"));
    assert!(!operation_called.get());
    assert!(ctx.schema_construction.is_none());
    assert!(ctx.charged_work() > before);
    assert_eq!(ctx.charged_work(), observed.get());
    denied.set(false);
    ctx.with_codegen_construction(|ctx| {
        tiny_compile(ctx)?; // Successful proofs exist only through actual compile.
        let prior = Rc::clone(ctx.schema_construction.as_ref().unwrap());
        let before_events = events.get();
        let before_work = ctx.charged_work();
        denied.set(true);
        let error = ctx
            .with_codegen_construction::<()>(|_| {
                operation_called.set(true);
                Ok(())
            })
            .unwrap_err();
        assert_eq!(error.code, "RESOURCE_LIMIT");
        assert_eq!(error.message, Utf16::from("first entry denial"));
        assert!(!operation_called.get());
        assert!(Rc::ptr_eq(
            &prior,
            ctx.schema_construction.as_ref().unwrap()
        ));
        assert!(ctx.charged_work() > before_work);
        assert_eq!(ctx.charged_work(), observed.get());
        assert_eq!(events.get() - before_events, 1); // Exactly the denied entry, no operation.
        denied.set(false);
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.schema_construction.is_none());
}

#[test]
fn nested_success_error_and_unwind_restore_actual_parent_without_reset() {
    let observed = Cell::new(0u64);
    let mut control = |amount| {
        observed.set(observed.get() + amount as u64);
        Ok(())
    };
    let mut ctx = Context::catalog().with_host_control(&mut control);
    ctx.with_codegen_construction(|ctx| {
        tiny_compile(ctx)?;
        let parent = Rc::clone(ctx.schema_construction.as_ref().unwrap());
        for outcome in ["ok", "error", "unwind"] {
            let before = ctx.charged_work();
            let steps = ctx.constraint_steps;
            if outcome == "unwind" {
                let result = catch_unwind(AssertUnwindSafe(|| {
                    let _ = ctx.with_codegen_construction::<()>(|ctx| {
                        assert!(!Rc::ptr_eq(
                            &parent,
                            ctx.schema_construction.as_ref().unwrap()
                        ));
                        tiny_compile(ctx)?;
                        ctx.charge_constraint_step(Utf16::from("/nested"))?;
                        panic!("independent nested unwind");
                    });
                }));
                assert!(result.is_err());
            } else {
                let result = ctx.with_codegen_construction(|ctx| {
                    assert!(!Rc::ptr_eq(
                        &parent,
                        ctx.schema_construction.as_ref().unwrap()
                    ));
                    tiny_compile(ctx)?;
                    ctx.charge_constraint_step(Utf16::from("/nested"))?;
                    if outcome == "error" {
                        Err(EngineError::new(
                            "INDEPENDENT",
                            Utf16::from("/nested"),
                            "nested error",
                        ))
                    } else {
                        Ok(())
                    }
                });
                if outcome == "error" {
                    assert_eq!(result.unwrap_err().code, "INDEPENDENT");
                } else {
                    result.unwrap();
                }
            }
            assert!(Rc::ptr_eq(
                &parent,
                ctx.schema_construction.as_ref().unwrap()
            ));
            assert!(ctx.charged_work() > before);
            assert!(ctx.constraint_steps > steps);
            assert_eq!(ctx.charged_work(), observed.get());
        }
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.schema_construction.is_none());
    assert_eq!(ctx.charged_work(), observed.get());
}

#[test]
fn top_level_success_error_and_unwind_drop_scoped_state() {
    let mut ctx = Context::catalog();
    for outcome in ["ok", "error", "unwind"] {
        let mut weak = None;
        let before = ctx.charged_work();
        let result = catch_unwind(AssertUnwindSafe(|| {
            ctx.with_codegen_construction(|ctx| {
                weak = Some(Rc::downgrade(ctx.schema_construction.as_ref().unwrap()));
                tiny_compile(ctx)?;
                if outcome == "unwind" {
                    panic!("independent outer unwind");
                }
                if outcome == "error" {
                    Err(EngineError::new(
                        "INDEPENDENT",
                        Utf16::default(),
                        "outer error",
                    ))
                } else {
                    Ok(())
                }
            })
        }));
        match outcome {
            "unwind" => assert!(result.is_err()),
            "error" => assert_eq!(result.unwrap().unwrap_err().code, "INDEPENDENT"),
            _ => result.unwrap().unwrap(),
        }
        assert!(ctx.schema_construction.is_none());
        assert!(weak.unwrap().upgrade().is_none());
        assert!(ctx.charged_work() > before);
    }
}

#[test]
fn effective_nondefault_depth_and_node_limits_survive_scopes_and_refusal() {
    let limits = Limits {
        max_depth: 192,
        max_values: 2048,
        ..Limits::ordinary()
    };
    let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
    ctx.with_codegen_construction(|ctx| {
        assert_eq!(ctx.limits(), limits);
        // A real admission above128 must honor the configured192 ceiling.
        crate::value::copy_json(&nested_value(limits.max_depth), ctx)?;
        let error = crate::value::copy_json(&nested_value(limits.max_depth + 1), ctx).unwrap_err();
        assert_eq!(error.code, "LIMIT");
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert_eq!(ctx.limits(), limits);
    let limits = Limits {
        max_depth: 16,
        max_values: 8,
        ..Limits::ordinary()
    };
    let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
    let at_limit =
        crate::value::Value::Array(vec![crate::value::Value::Null; limits.max_values - 1]);
    let too_many = crate::value::Value::Array(vec![crate::value::Value::Null; limits.max_values]);
    ctx.with_codegen_construction(|ctx| {
        crate::value::copy_json(&at_limit, ctx)?;
        assert_eq!(
            crate::value::copy_json(&too_many, ctx).unwrap_err().code,
            "LIMIT"
        );
        let before = ctx.charged_work();
        let refused: Result<(), EngineError> = ctx.with_catalog_value_limit(|ctx| {
            assert_eq!(ctx.limits().max_values, Limits::catalog().max_values);
            assert_eq!(ctx.limits().max_depth, limits.max_depth);
            crate::value::copy_json(&too_many, ctx)?;
            Err(EngineError::new(
                "INDEPENDENT",
                Utf16::default(),
                "catalog exit",
            ))
        });
        assert_eq!(refused.unwrap_err().code, "INDEPENDENT");
        assert_eq!(ctx.limits(), limits);
        assert!(ctx.charged_work() > before);
        let unwind = catch_unwind(AssertUnwindSafe(|| {
            ctx.with_catalog_value_limit(|ctx| {
                crate::value::copy_json(&too_many, ctx).unwrap();
                panic!("catalog limit unwind");
            });
        }));
        assert!(unwind.is_err());
        assert_eq!(ctx.limits(), limits);
        assert_eq!(
            crate::value::copy_json(&too_many, ctx).unwrap_err().code,
            "LIMIT"
        );
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert_eq!(ctx.limits(), limits);
}

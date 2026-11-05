// SPDX-License-Identifier: MIT OR Apache-2.0
//! Original-validator collection SOURCE controls; native uncompiled/unexecuted.
//! Child of value.rs. H owns include. No protected sidecar adapters.
use super::*;
use crate::engine::{OwnedResourceSet, ResourceSet};
use crate::schema::admitted_bank::{BankRoot, SchemaBank};
use std::cell::{Cell, RefCell};

const OTHER: [&str; 6] = [
    "constraints",
    "domainPolicy",
    "tablesPackage",
    "actionsPackage",
    "bindingPackage",
    "stableBindingPackage",
];
fn small() -> Value {
    Value::Object(vec![
        (Utf16::from("a"), Value::Number(1.0)),
        (Utf16::from("b"), Value::Array(vec![Value::Bool(true)])),
    ])
}
fn fixture() -> Value {
    Value::Object(vec![
        (
            Utf16::from("$id"),
            Value::string_utf8("urn:original-visit:core"),
        ),
        (
            Utf16::from("unknown"),
            Value::Array(vec![
                Value::Null,
                Value::Bool(true),
                Value::Object(vec![(
                    Utf16::new(vec![0xd800]),
                    Value::String(Utf16::new(vec![0xdc00, 0xd83d, 0xde00])),
                )]),
            ]),
        ),
        (
            Utf16::from("schema"),
            Value::Object(vec![
                (Utf16::from("$id"), Value::string_utf8("child")),
                (Utf16::from("$dynamicAnchor"), Value::string_utf8("a")),
                (Utf16::from("x"), Value::Number(1.0)),
            ]),
        ),
    ])
}
fn context(limits: crate::context::Limits) -> Context<'static> {
    Context::with_limits(crate::ResourceProfile::Cooperative, limits).unwrap()
}
fn original(
    value: Value,
    root: &str,
    limits: crate::context::Limits,
) -> Result<Value, EngineError> {
    admit_owned_json_at(value, Utf16::from(root), &mut context(limits))
}
fn work(value: &Value, root: &str, limits: crate::context::Limits) -> Vec<usize> {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    admit_owned_json_at(
        value.clone(),
        Utf16::from(root),
        &mut context(limits).with_meter(&mut meter),
    )
    .unwrap();
    trace.into_inner()
}
fn paid(trace: &[usize], value: &Value, limits: crate::context::Limits) {
    let oracle = work(value, "", limits);
    assert!(trace.len() > oracle.len());
    assert!(trace.ends_with(&oracle));
}
fn host() -> EngineError {
    let mut e = EngineError::new(
        "DUPLICATE_KEY",
        Utf16::new(vec![47, 0xd800, 126]),
        "original visitor host provenance",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8(
        "original-visit-host-δ",
    ));
    e.with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference)
}
fn same_host(actual: &EngineError, wanted: &EngineError) {
    assert_eq!(actual.code, wanted.code);
    assert_eq!(actual.path, wanted.path);
    assert_eq!(actual.message, wanted.message);
    assert_eq!(actual.python_message_origin, wanted.python_message_origin);
    assert!(actual.is_control_failure());
    assert!(!actual.is_python_schema_terminal());
}
fn typed_trace(value: Value, name: Option<&str>) -> Vec<usize> {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let start = trace.borrow().len();
        let carrier = match name {
            Some(name) => {
                OwnedCoreJson::admit_factory_resource(value, &Utf16::from(name), op, ctx)?
            }
            None => OwnedCoreJson::admit_native_resource(value, op, ctx)?,
        };
        drop(carrier);
        let tail = trace.borrow()[start..].to_vec();
        Ok(tail)
    })
    .unwrap()
}
fn is_subsequence(needle: &[usize], hay: &[usize]) -> bool {
    let mut at = 0;
    for n in hay {
        if needle.get(at) == Some(n) {
            at += 1;
        }
    }
    at == needle.len()
}

#[test]
fn ordinary_and_no_collector_keep_literal_original_callbacks_and_member_observer_order() {
    let value = small();
    let limits = Context::catalog().limits();
    let expected = vec![1, 2, 1, 1, 1, 1, 1, 1];
    assert_eq!(work(&value, "#", limits), expected);
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let members = RefCell::new(Vec::new());
    let mut observe = |ordinal, key: &Utf16, _: &Value, depth, _: &mut Context<'_>| {
        members
            .borrow_mut()
            .push((ordinal, key.clone(), depth, trace.borrow().len()));
        Ok(())
    };
    validate_json_at_observed(
        &value,
        &Utf16::from("#"),
        &mut Context::catalog().with_meter(&mut meter),
        &mut observe,
    )
    .unwrap();
    assert_eq!(*trace.borrow(), expected);
    assert_eq!(
        *members.borrow(),
        vec![(0, Utf16::from("a"), 0, 3), (1, Utf16::from("b"), 0, 5)]
    );
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut count = 0;
    visit_json_with_collector(
        &value,
        &mut Context::catalog().with_meter(&mut meter),
        JsonAdmissionPath::Owned(Utf16::from("#")),
        0,
        &mut count,
        &mut |_, _, _, _, _| Ok(()),
        &mut NoJsonAdmissionCollector,
        None,
    )
    .unwrap();
    assert_eq!(*trace.borrow(), expected);
    assert_eq!(count, 4);
}

#[test]
fn all_six_no_metadata_names_keep_entire_original_validation_and_probed_mint_trace() {
    let ordinary_null = typed_trace(Value::Null, None);
    for name in OTHER {
        let typed_null = typed_trace(Value::Null, Some(name));
        assert!(typed_null.ends_with(&ordinary_null));
        let prefix = typed_null[..typed_null.len() - ordinary_null.len()].to_vec();
        for value in [
            small(),
            fixture(),
            Value::String(Utf16::new(vec![0xd800])),
            Value::Number(9_007_199_254_740_991.0),
        ] {
            let ordinary = typed_trace(value.clone(), None);
            let mut expected = prefix.clone();
            expected.extend(ordinary);
            assert_eq!(typed_trace(value.clone(), Some(name)), expected);
            OwnedCoreOperation::with_context(&mut Context::catalog(), |ctx, op| {
                let events = RefCell::new(Vec::new());
                let mut event = |name| events.borrow_mut().push(name);
                let carrier = OwnedCoreJson::admit_factory_resource_with_events(
                    value,
                    &Utf16::from(name),
                    op,
                    ctx,
                    &mut event,
                )?;
                assert_eq!(*events.borrow(), vec!["carrier-publication"]);
                assert!(carrier.into_core_metadata(op, ctx)?.1.is_none());
                Ok::<(), EngineError>(())
            })
            .unwrap();
        }
    }
}

#[test]
fn literal_full_errors_and_precollector_scalar_frontier_failures_match_original() {
    let limits = Context::catalog().limits();
    let mut cases = Vec::new();
    for n in [
        -0.0,
        f64::NAN,
        f64::INFINITY,
        f64::NEG_INFINITY,
        9_007_199_254_740_992.0,
    ] {
        cases.push((
            Value::Number(n),
            limits,
            "NUMBER",
            "#",
            "Number outside the core interoperable numeric profile",
            true,
        ));
    }
    cases.push((
        Value::Object(vec![(
            Utf16::from("a/b~"),
            Value::Array(vec![Value::Number(-0.0)]),
        )]),
        limits,
        "NUMBER",
        "#/a~1b~0/0",
        "Number outside the core interoperable numeric profile",
        false,
    ));
    let mut nodes = limits;
    nodes.max_values = 2;
    cases.push((
        Value::Array(vec![Value::Number(f64::NAN), Value::Null]),
        nodes,
        "LIMIT",
        "#",
        "JSON structural value limit exceeded",
        true,
    ));
    let mut depth = limits;
    depth.max_depth = 1;
    cases.push((
        Value::Array(vec![Value::Array(vec![Value::Number(f64::NAN)])]),
        depth,
        "LIMIT",
        "#/0/0",
        "JSON nesting depth exceeded",
        false,
    ));
    for (value, limits, code, path, message, no_enter) in cases {
        let expected = original(value.clone(), "#", limits).unwrap_err();
        assert_eq!(expected.code, code);
        assert_eq!(expected.path, Utf16::from(path));
        assert_eq!(expected.message, Utf16::from(message));
        for name in [
            "coreSchema",
            "referenceSchema",
            "packageSchema",
            "constraints",
        ] {
            let seen = RefCell::new(Vec::new());
            let mut event = |name| seen.borrow_mut().push(name);
            let error = OwnedCoreOperation::with_context(&mut context(limits), |ctx, op| {
                OwnedCoreJson::admit_factory_resource_with_events(
                    value.clone(),
                    &Utf16::from(name),
                    op,
                    ctx,
                    &mut event,
                )
            })
            .unwrap_err();
            assert_eq!(error, expected);
            assert!(!seen.borrow().contains(&"closed-structure-publication"));
            assert!(!seen.borrow().contains(&"carrier-publication"));
            if no_enter {
                assert!(
                    seen.borrow().is_empty(),
                    "failed original scalar/frontier admission precedes every collector effect"
                );
            }
        }
    }
    for (a, b) in [
        (Utf16::new(vec![0xd800]), Utf16::new(vec![0xd800])),
        (Utf16::from("😀"), Utf16::new(vec![0xd83d, 0xde00])),
    ] {
        let value = Value::Object(vec![(
            Utf16::from("a/b~"),
            Value::Object(vec![(a, Value::Null), (b, Value::Number(f64::NAN))]),
        )]);
        let expected = original(value.clone(), "#", limits).unwrap_err();
        assert_eq!(expected.code, "DUPLICATE_KEY");
        assert_eq!(expected.path, Utf16::from("#/a~1b~0"));
        assert_eq!(expected.message, Utf16::from("Duplicate object key"));
        let mut members = 0;
        let error = validate_json_at_observed(
            &value,
            &Utf16::from("#"),
            &mut Context::catalog(),
            &mut |_, _, _, _, _| {
                members += 1;
                Ok(())
            },
        )
        .unwrap_err();
        assert_eq!(error, expected);
        assert_eq!(members, 2);
        let error = OwnedCoreOperation::with_context(&mut Context::catalog(), |ctx, op| {
            OwnedCoreJson::admit_factory_resource(value, &Utf16::from("coreSchema"), op, ctx)
        })
        .unwrap_err();
        assert_eq!(error, expected);
    }
}

#[test]
fn real_paid_collector_keeps_original_member_observer_and_validation_charge_subsequence() {
    let value = fixture();
    let oracle = work(&value, "#", Context::catalog().limits());
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let events = RefCell::new(Vec::new());
    let mut event = |name| events.borrow_mut().push(name);
    let members = RefCell::new(Vec::new());
    crate::schema::admitted_structure::closed::with_root(|root| {
    let mut collector=PaidJsonAdmissionCollector{root,event:&mut event};
    let mut ctx=Context::catalog().with_meter(&mut meter);
    let mut count = 0;
    visit_json_with_collector(
        &value,
        &mut ctx,
        JsonAdmissionPath::Owned(Utf16::from("#")),
        0,
        &mut count,
        &mut |ordinal, key, _, depth, _| {
            members.borrow_mut().push((ordinal, key.clone(), depth));
            Ok(())
        },
        &mut collector,
        None,
    )
    .unwrap();
    assert_eq!(count, 11);
    assert!(is_subsequence(&oracle, &trace.borrow()));
    assert_eq!(
        *members.borrow(),
        vec![
            (0, Utf16::from("$id"), 0),
            (1, Utf16::from("unknown"), 0),
            (0, Utf16::new(vec![0xd800]), 2),
            (2, Utf16::from("schema"), 0),
            (0, Utf16::from("$id"), 1),
            (1, Utf16::from("$dynamicAnchor"), 1),
            (2, Utf16::from("x"), 1)
        ]
    );
    assert!(!events.borrow().contains(&"closed-structure-publication"));
    let structure=collector.root.complete(count,&mut ctx,collector.event)
        .unwrap()
        .unwrap();
    assert_eq!(structure.extent(), 11);
    assert!(events.borrow().contains(&"closed-structure-publication"));
    Ok::<(),EngineError>(())
    }).unwrap();
    // Subsequence alone is not an exact no-extra-fee proof: literal/error/source
    // checks and all-six exact traces independently constrain the shared body.
}

fn stage(ctx: &mut Context<'_>, event: &mut dyn FnMut(&'static str)) -> Result<(), EngineError> {
    let bridge = RefCell::new(event);
    let mut op_event = |n| bridge.borrow_mut()(n);
    let mut data_event = |n| bridge.borrow_mut()(n);
    OwnedCoreOperation::with_context_with_events(
        ctx,
        |ctx, op| {
            let carrier = OwnedCoreJson::admit_factory_resource_with_events(
                fixture(),
                &Utf16::from("coreSchema"),
                op,
                ctx,
                &mut data_event,
            )?;
            let (value, facts) =
                carrier.into_core_metadata_with_events(op, ctx, &mut data_event)?;
            assert_eq!(value, fixture());
            assert_eq!(facts.unwrap().extent(), 11);
            Ok(())
        },
        &mut op_event,
    )
}

#[test]
fn collector_control_refusal_moves_actual_escaped_surrogate_node_path_without_later_work() {
    let calls = Cell::new(0usize);
    let mut meter = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    let events = RefCell::new(Vec::new());
    let mut event = |name| events.borrow_mut().push((name, calls.get()));
    stage(&mut Context::catalog().with_meter(&mut meter), &mut event).unwrap();
    let target = events
        .borrow()
        .iter()
        .filter(|(name, _)| matches!(*name,"closed-container-local"|"closed-scalar-record"))
        .nth(6)
        .unwrap()
        .1;
    let mut expected = "#/unknown/2/".encode_utf16().collect::<Vec<_>>();
    expected.push(0xd800);
    let expected = Utf16::new(expected);
    for deadline in [false, true] {
        let calls = Cell::new(0usize);
        let after = Cell::new(0usize);
        let stopped = Cell::new(false);
        let mut meter = |_| {
            if stopped.get() {
                after.set(after.get() + 1);
            }
            calls.set(calls.get() + 1);
            Ok(())
        };
        let mut cancelled = || {
            let deny = calls.get() == target;
            if deny {
                stopped.set(true);
            }
            deny
        };
        let mut clock = || {
            let deny = calls.get() == target;
            if deny {
                stopped.set(true);
            }
            Some(if deny { 2 } else { 0 })
        };
        let mut ctx = Context::catalog().with_meter(&mut meter);
        if deadline {
            ctx = ctx.with_clock(&mut clock, 1);
        } else {
            ctx = ctx.with_cancellation(&mut cancelled);
        }
        let seen = RefCell::new(Vec::new());
        let mut event = |name| seen.borrow_mut().push((name, calls.get()));
        let error = stage(&mut ctx, &mut event).unwrap_err();
        assert_eq!(error.code, if deadline { "DEADLINE" } else { "CANCELLED" });
        assert_eq!(error.path, expected);
        assert_eq!(
            error.message,
            Utf16::from(if deadline {
                "Deadline elapsed"
            } else {
                "Operation cancelled"
            })
        );
        assert!(error.is_control_failure());
        assert_eq!(calls.get(), target);
        assert_eq!(after.get(), 0);
        assert!(ctx.owned_core_operation.is_none());
        let prior: Vec<_> = events
            .borrow()
            .iter()
            .copied()
            .filter(|(_, at)| *at < target)
            .collect();
        assert_eq!(*seen.borrow(), prior);
    }
    // This tests exact moved error data. No pointer/copy-count inference is made;
    // the one append_path child and borrowed mutable forwarding are source-audited.
}

#[test]
fn real_metadata_effect_groups_keep_first_host_fields_and_forbid_postdenial_publication() {
    let calls = Cell::new(0usize);
    let mut meter = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    let events = RefCell::new(Vec::new());
    let mut event = |name| events.borrow_mut().push((name, calls.get()));
    stage(&mut Context::catalog().with_meter(&mut meter), &mut event).unwrap();
    let events = events.into_inner();
    for name in [
        "closed-compact-guard",
        "closed-row-growth",
        "closed-container-local",
        "closed-scalar-record",
        "closed-member-facts",
        "closed-child-summary",
        "closed-container-record",
        "closed-structure-publication",
        "carrier-publication",
        "carrier-metadata-transfer",
    ] {
        assert!(events.iter().any(|(n, _)| *n == name));
    }
    let mut targets: Vec<_> = events.iter().map(|(_, at)| *at).collect();
    targets.sort_unstable();
    targets.dedup();
    for denied in targets {
        let calls = Cell::new(0usize);
        let terminal = Cell::new(false);
        let after = Cell::new(0usize);
        let wanted = host();
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
        let error = stage(&mut ctx, &mut event).unwrap_err();
        same_host(&error, &wanted);
        assert_eq!(calls.get(), denied);
        assert_eq!(after.get(), 0);
        assert!(ctx.owned_core_operation.is_none());
        let prior: Vec<_> = events
            .iter()
            .copied()
            .filter(|(_, at)| *at < denied)
            .collect();
        assert_eq!(*seen.borrow(), prior);
    }
    // Exhaust only effect groups of this fixed eleven-node fixture, never every
    // work callback or a full pinned-text resource at each callback.
}

#[test]
fn three_completed_roots_feed_real_fresh_bank_without_repeating_original_admission() {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    let roots = [
        "urn:original-visit:core",
        "urn:original-visit:reference",
        "urn:original-visit:package",
    ]
    .map(|id| {
        Value::Object(vec![
            (Utf16::from("$id"), Value::string_utf8(id)),
            (Utf16::from("opaque"), fixture()),
        ])
    });
    let raw = ResourceSet::new(
        roots[0].clone(),
        roots[1].clone(),
        roots[2].clone(),
        Value::Null,
        Value::Bool(true),
    );
    let raw_trace = RefCell::new(Vec::new());
    let mut raw_meter = |n| {
        raw_trace.borrow_mut().push(n);
        Ok(())
    };
    let mut raw_ctx = Context::catalog().with_meter(&mut raw_meter);
    raw_ctx
        .with_codegen_construction(|ctx| {
            let start = raw_trace.borrow().len();
            let admitted = SchemaBank::admit_core(raw.clone(), ctx)?;
            assert_eq!(admitted.bank.len(), 3);
            Ok::<_, EngineError>(raw_trace.borrow()[start..].to_vec())
        })
        .map(|raw_work| {
            ctx.with_codegen_construction(|ctx| {
                OwnedCoreOperation::with_context(ctx, |ctx, op| {
                    let core = OwnedCoreJson::admit_factory_resource(
                        roots[0].clone(),
                        &Utf16::from("coreSchema"),
                        op,
                        ctx,
                    )?;
                    let reference = OwnedCoreJson::admit_factory_resource(
                        roots[1].clone(),
                        &Utf16::from("referenceSchema"),
                        op,
                        ctx,
                    )?;
                    let package = OwnedCoreJson::admit_factory_resource(
                        roots[2].clone(),
                        &Utf16::from("packageSchema"),
                        op,
                        ctx,
                    )?;
                    let constraints = OwnedCoreJson::admit_factory_resource(
                        Value::Null,
                        &Utf16::from("constraints"),
                        op,
                        ctx,
                    )?;
                    let policy = OwnedCoreJson::admit_factory_resource(
                        Value::Bool(true),
                        &Utf16::from("domainPolicy"),
                        op,
                        ctx,
                    )?;
                    let start = trace.borrow().len();
                    let admitted = SchemaBank::admit_core_owned(
                        OwnedResourceSet {
                            core_schema: core,
                            reference_schema: reference,
                            package_schema: package,
                            constraints,
                            domain_policy: policy,
                        },
                        op,
                        ctx,
                    )?;
                    let consumed = trace.borrow()[start..].to_vec();
                    assert!(
                        consumed.len() < raw_work.len(),
                        "genuine metadata bank route must avoid repeated complete walks"
                    );
                    assert_eq!(admitted.bank.len(), 3);
                    for i in 0..3 {
                        assert_eq!(admitted.bank.get(i).unwrap().1, &roots[i]);
                        let view = admitted
                            .bank
                            .structure_role(BankRoot::Core(i), ctx)?
                            .unwrap();
                        assert_eq!(view.structure.node(view.root).unwrap().depth, 0);
                    }
                    assert_eq!(&admitted.resources.core_schema, &roots[0]);
                    assert_eq!(&admitted.resources.constraints, &Value::Null);
                    assert_eq!(&admitted.resources.domain_policy, &Value::Bool(true));
                    Ok::<(), EngineError>(())
                })
            })
            .unwrap();
        })
        .unwrap();
    // Real private bank consumer, not whole factory/Engine compiler integration.
}

#[test]
fn mismatched_expired_raw_and_checked_copy_custody_keep_original_paid_fallback() {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let mut foreign = Context::catalog();
        let carrier = OwnedCoreJson::admit_factory_resource(
            fixture(),
            &Utf16::from("coreSchema"),
            op,
            &mut foreign,
        )?;
        let start = trace.borrow().len();
        let (value, facts) = carrier.into_core_metadata(op, ctx)?;
        assert!(facts.is_none());
        paid(&trace.borrow()[start..], &value, ctx.limits());
        let carrier =
            OwnedCoreJson::admit_factory_resource(fixture(), &Utf16::from("coreSchema"), op, ctx)?;
        let start = trace.borrow().len();
        let (value, facts) = OwnedCoreOperation::with_context(ctx, |inner, other| {
            carrier.into_core_metadata(other, inner)
        })?;
        assert!(facts.is_none());
        paid(&trace.borrow()[start..], &value, ctx.limits());
        let carrier =
            OwnedCoreJson::admit_factory_resource(fixture(), &Utf16::from("coreSchema"), op, ctx)?;
        let smaller = ctx.limits().max_text_units - 1;
        ctx.with_aggregate_text_limit(smaller, |ctx| {
            let start = trace.borrow().len();
            let (value, facts) = carrier.into_core_metadata(op, ctx)?;
            assert!(facts.is_none());
            paid(&trace.borrow()[start..], &value, ctx.limits());
            Ok::<(), EngineError>(())
        })?;
        let parent =
            OwnedCoreJson::admit_factory_resource(fixture(), &Utf16::from("coreSchema"), op, ctx)?;
        let child = parent.copy_schema_member(op, ctx, "missing")?;
        let start = trace.borrow().len();
        let (value, facts) = child.into_core_metadata(op, ctx)?;
        assert!(facts.is_none());
        paid(&trace.borrow()[start..], &value, ctx.limits());
        let mut raw = parent.into_raw();
        let start = trace.borrow().len();
        admit_owned_json(raw.clone(), ctx)?;
        assert_eq!(
            &trace.borrow()[start..],
            work(&raw, "", ctx.limits()).as_slice()
        );
        let Value::Object(fields) = &mut raw else {
            panic!("raw")
        };
        fields.push((Utf16::from("changed"), Value::Number(-0.0)));
        let expected = original(raw.clone(), "#", ctx.limits()).unwrap_err();
        let error = OwnedCoreJson::admit_factory_resource(raw, &Utf16::from("coreSchema"), op, ctx)
            .unwrap_err();
        assert_eq!(error, expected);
        assert_eq!(error.path, Utf16::from("#/changed"));
        Ok::<(), EngineError>(())
    })
    .unwrap();
    let expired = OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        OwnedCoreJson::admit_factory_resource(fixture(), &Utf16::from("coreSchema"), op, ctx)
    })
    .unwrap();
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let start = trace.borrow().len();
        let (value, facts) = expired.into_core_metadata(op, ctx)?;
        assert!(facts.is_none());
        paid(&trace.borrow()[start..], &value, ctx.limits());
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn ordered_invalid_resources_and_original_member_refusal_never_reach_later_collection() {
    let names = [
        "coreSchema",
        "referenceSchema",
        "packageSchema",
        "constraints",
        "domainPolicy",
        "tablesPackage",
        "actionsPackage",
        "bindingPackage",
        "stableBindingPackage",
    ];
    for bad in [0, 2, 5, 8] {
        let current = Cell::new(0usize);
        let published = RefCell::new(Vec::new());
        let mut event = |name| {
            if name == "carrier-publication" {
                published.borrow_mut().push(current.get());
            }
        };
        let error = OwnedCoreOperation::with_context(&mut Context::catalog(), |ctx, op| {
            for (i, name) in names.iter().enumerate() {
                current.set(i);
                let value = if i < bad {
                    fixture()
                } else {
                    Value::Object(vec![(Utf16::from(format!("bad-{i}")), Value::Number(-0.0))])
                };
                OwnedCoreJson::admit_factory_resource_with_events(
                    value,
                    &Utf16::from(*name),
                    op,
                    ctx,
                    &mut event,
                )?;
            }
            Ok::<(), EngineError>(())
        })
        .unwrap_err();
        assert_eq!(error.code, "NUMBER");
        assert_eq!(error.path, Utf16::from(format!("#/bad-{bad}")));
        assert_eq!(*published.borrow(), (0..bad).collect::<Vec<_>>());
    }
    let calls = Cell::new(0usize);
    let stop = Cell::new(false);
    let after = Cell::new(0usize);
    let mut meter = |_| {
        if stop.get() {
            after.set(after.get() + 1);
        }
        calls.set(calls.get() + 1);
        Ok(())
    };
    let wanted = host();
    let events = RefCell::new(Vec::new());
    let mut event = |n| events.borrow_mut().push(n);
    let mut members=0;
    let error=crate::schema::admitted_structure::closed::with_root(|root|{
    let mut collector=PaidJsonAdmissionCollector{root,event:&mut event};
    visit_json_with_collector(
        &fixture(),
        &mut Context::catalog().with_meter(&mut meter),
        JsonAdmissionPath::Owned(Utf16::from("#")),
        0,
        &mut 0,
        &mut |_, _, _, _, _| {
            members += 1;
            stop.set(true);
            Err(wanted.clone())
        },
        &mut collector,
        None,
    ).map(|_|())
    }).unwrap_err();
    assert_eq!(error, wanted);
    assert_eq!(members, 1);
    assert_eq!(after.get(), 0);
    assert_eq!(
        events
            .borrow()
            .iter()
            .filter(|n| **n == "closed-container-local")
            .count(),
        1
    );
    assert!(!events.borrow().contains(&"closed-member-facts"));
    assert!(!events.borrow().contains(&"closed-container-record"));
    assert!(!events.borrow().contains(&"closed-scalar-record"));
    assert!(!events.borrow().contains(&"closed-structure-publication"));
}

#[test]
fn observer_unwind_nested_reentry_and_host_error_recovery_restore_real_parent_operation() {
    let panicking = Cell::new(false);
    let after = Cell::new(0usize);
    let mut meter = |_| {
        if panicking.get() {
            after.set(after.get() + 1);
        }
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, parent| {
        for marker in [
            "closed-container-local",
            "closed-scalar-record",
            "closed-container-record",
            "closed-structure-publication",
            "carrier-publication",
            "carrier-metadata-transfer",
        ] {
            let before = ctx.charged_work();
            let returned = Cell::new(false);
            let mut event = |n| {
                if n == marker {
                    panicking.set(true);
                    panic!("independent original visitor unwind")
                }
            };
            let caught = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                stage(ctx, &mut event).unwrap();
                returned.set(true);
            }));
            assert!(caught.is_err());
            assert!(!returned.get());
            assert_eq!(after.get(), 0);
            panicking.set(false);
            assert!(ctx.charged_work() > before);
            let carrier = OwnedCoreJson::admit_factory_resource(
                fixture(),
                &Utf16::from("coreSchema"),
                parent,
                ctx,
            )?;
            assert!(carrier.into_core_metadata(parent, ctx)?.1.is_some());
        }
        let entered = Cell::new(false);
        let mut event = |n| {
            if n == "closed-container-local" && !entered.replace(true) {
                let mut foreign = Context::catalog();
                stage(&mut foreign, &mut |_| {}).unwrap();
                assert!(foreign.owned_core_operation.is_none());
            }
        };
        stage(ctx, &mut event)?;
        assert!(entered.get());
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.owned_core_operation.is_none());
    let arm = Cell::new(false);
    let wanted = host();
    let mut meter = |_| {
        if arm.replace(false) {
            Err(wanted.clone())
        } else {
            Ok(())
        }
    };
    let mut recovered = Context::catalog().with_meter(&mut meter);
    let mut event = |name| {
        if name == "operation-publication" {
            arm.set(true);
        }
    };
    let error = stage(&mut recovered, &mut event).unwrap_err();
    same_host(&error, &wanted);
    assert!(recovered.owned_core_operation.is_none());
    let before = recovered.charged_work();
    stage(&mut recovered, &mut |_| {}).unwrap();
    assert!(recovered.charged_work() > before);
}

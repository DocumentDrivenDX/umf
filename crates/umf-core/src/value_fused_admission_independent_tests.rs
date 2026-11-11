// SPDX-License-Identifier: MIT OR Apache-2.0
//! Fused typed-admission SOURCE controls. Native UNCOMPILED/UNEXECUTED.
//! Child of value.rs. Factory/bank integration is not covered by this seam.
use super::*;
use crate::schema::admitted_structure::Structure;
use std::cell::{Cell, RefCell};

fn fixture() -> Value {
    Value::Object(vec![
        (
            Utf16::from("$id"),
            Value::string_utf8("urn:independent:fused"),
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
fn context<'a>(limits: crate::context::Limits) -> Context<'a> {
    Context::with_limits(crate::ResourceProfile::Cooperative, limits).unwrap()
}
fn oracle(value: Value, root: &str, limits: crate::context::Limits) -> Result<Value, EngineError> {
    admit_owned_json_at(value, Utf16::from(root), &mut context(limits))
}
fn fused(value: Value, name: &str, limits: crate::context::Limits) -> Result<Value, EngineError> {
    OwnedCoreOperation::with_context(&mut context(limits), |ctx, op| {
        OwnedCoreJson::admit_factory_resource(value, &Utf16::from(name), op, ctx)
            .map(OwnedCoreJson::into_raw)
    })
}
fn original_work(value: &Value, limits: crate::context::Limits) -> Vec<usize> {
    let work = RefCell::new(Vec::new());
    let mut meter = |n| {
        work.borrow_mut().push(n);
        Ok(())
    };
    admit_owned_json_at(
        value.clone(),
        Utf16::default(),
        &mut context(limits).with_meter(&mut meter),
    )
    .unwrap();
    work.into_inner()
}
fn paid(work: &[usize], value: &Value, limits: crate::context::Limits) {
    let original = original_work(value, limits);
    assert!(work.len() > original.len());
    assert!(work.ends_with(&original));
}
fn host() -> EngineError {
    let mut e = EngineError::new(
        "CANCELLED",
        Utf16::new(vec![47, 0xd800, 126]),
        "original fused host refusal",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("fused-host-δ"));
    e.with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference)
}
fn same_host(a: &EngineError, b: &EngineError) {
    assert_eq!(a.code, b.code);
    assert_eq!(a.path, b.path);
    assert_eq!(a.message, b.message);
    assert_eq!(a.python_message_origin, b.python_message_origin);
    assert!(a.is_control_failure());
    assert!(!a.is_python_schema_terminal());
}

#[test]
fn genuine_fused_admission_preserves_safe_numbers_unknown_utf16_and_member_order() {
    let limits = Context::catalog().limits();
    for value in [
        Value::Null,
        Value::Bool(false),
        Value::Number(0.0),
        Value::Number(-1.0),
        Value::Number(0.5),
        Value::Number(9_007_199_254_740_991.0),
        Value::String(Utf16::new(vec![0xd800, 0xdc00, 0xdc00])),
        fixture(),
    ] {
        let expected = oracle(value.clone(), "#", limits).unwrap();
        assert_eq!(expected, value);
        for name in [
            "coreSchema",
            "referenceSchema",
            "packageSchema",
            "constraints",
        ] {
            assert_eq!(fused(value.clone(), name, limits).unwrap(), expected);
        }
    }
}

#[test]
fn invalid_number_depth_node_and_parent_frontier_errors_equal_original_literals() {
    let limits = Context::catalog().limits();
    let mut cases = Vec::new();
    for number in [
        -0.0,
        f64::NAN,
        f64::INFINITY,
        f64::NEG_INFINITY,
        9_007_199_254_740_992.0,
    ] {
        cases.push((Value::Number(number), limits, "NUMBER", "#"));
    }
    cases.push((
        Value::Object(vec![(
            Utf16::from("a/b~"),
            Value::Array(vec![Value::Number(-0.0)]),
        )]),
        limits,
        "NUMBER",
        "#/a~1b~0/0",
    ));
    let mut depth = limits;
    depth.max_depth = 1;
    cases.push((
        Value::Array(vec![Value::Array(vec![Value::Number(f64::NAN)])]),
        depth,
        "LIMIT",
        "#/0/0",
    ));
    let mut nodes = limits;
    nodes.max_values = 2;
    cases.push((
        Value::Array(vec![Value::Number(f64::NAN), Value::Number(-0.0)]),
        nodes,
        "LIMIT",
        "#",
    ));
    cases.push((
        Value::Object(vec![
            (Utf16::from("bad"), Value::Number(f64::NAN)),
            (Utf16::from("later"), Value::Number(-0.0)),
        ]),
        nodes,
        "LIMIT",
        "#",
    ));
    for (value, limits, code, path) in cases {
        let expected = oracle(value.clone(), "#", limits).unwrap_err();
        assert_eq!(expected.code, code);
        assert_eq!(expected.path, Utf16::from(path));
        let message = if code == "NUMBER" {
            "Number outside the core interoperable numeric profile"
        } else if path == "#/0/0" {
            "JSON nesting depth exceeded"
        } else {
            "JSON structural value limit exceeded"
        };
        assert_eq!(expected.message, Utf16::from(message));
        for name in ["coreSchema", "constraints"] {
            let events = RefCell::new(Vec::new());
            let mut event = |name| events.borrow_mut().push(name);
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
            assert!(!events.borrow().contains(&"closed-structure-publication"));
            assert!(!events.borrow().contains(&"carrier-publication"));
        }
    }
}

#[test]
fn exact_raw_utf16_duplicate_keys_precede_hostile_children_without_normalizing_distinct_keys() {
    let limits = Context::catalog().limits();
    for (a, b) in [
        (Utf16::new(vec![0xd800]), Utf16::new(vec![0xd800])),
        (Utf16::from("😀"), Utf16::new(vec![0xd83d, 0xde00])),
    ] {
        let value = Value::Object(vec![(
            Utf16::from("a/b~"),
            Value::Object(vec![(a, Value::Null), (b, Value::Number(f64::NAN))]),
        )]);
        let expected = oracle(value.clone(), "#", limits).unwrap_err();
        assert_eq!(expected.code, "DUPLICATE_KEY");
        assert_eq!(expected.path, Utf16::from("#/a~1b~0"));
        assert_eq!(expected.message, Utf16::from("Duplicate object key"));
        assert_eq!(fused(value, "coreSchema", limits).unwrap_err(), expected);
    }
    let distinct = Value::Object(vec![
        (Utf16::new(vec![0xd800]), Value::Bool(true)),
        (Utf16::new(vec![0xdc00]), Value::Bool(false)),
        (Utf16::from("é"), Value::Null),
        (Utf16::new(vec![0x65, 0x301]), Value::Null),
    ]);
    assert_eq!(
        fused(distinct.clone(), "coreSchema", limits).unwrap(),
        distinct
    );
}

#[test]
fn only_exact_three_closed_resource_names_request_metadata_but_every_name_validates() {
    for name in [
        "coreSchema",
        "referenceSchema",
        "packageSchema",
        "constraints",
        "domainPolicy",
        "tableActions",
        "actionVocabulary",
        "companion",
        "CoreSchema",
        "coreSchema ",
        "coreSchema\0",
        "",
    ] {
        let collect = matches!(name, "coreSchema" | "referenceSchema" | "packageSchema");
        OwnedCoreOperation::with_context(&mut Context::catalog(), |ctx, op| {
            let carrier =
                OwnedCoreJson::admit_factory_resource(fixture(), &Utf16::from(name), op, ctx)?;
            let (value, metadata) = carrier.into_core_metadata(op, ctx)?;
            assert_eq!(value, fixture());
            assert_eq!(metadata.is_some(), collect);
            Ok::<(), EngineError>(())
        })
        .unwrap();
        let invalid = Value::Number(-0.0);
        let expected = oracle(invalid.clone(), "#", Context::catalog().limits()).unwrap_err();
        assert_eq!(
            fused(invalid, name, Context::catalog().limits()).unwrap_err(),
            expected
        );
    }
    // The name API is a trusted factory hint, never a caller-supplied profile proof.
}

#[test]
fn consuming_value_and_completed_facts_transfer_without_a_second_walk_and_keep_coordinates() {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let original = fixture();
        let mut detached = original.clone();
        let carrier = OwnedCoreJson::admit_factory_resource(
            original.clone(),
            &Utf16::from("coreSchema"),
            op,
            ctx,
        )?;
        let Value::Object(fields) = &mut detached else {
            panic!("object")
        };
        fields.reverse();
        fields[0].1 = Value::Number(-0.0);
        assert_eq!(carrier.value(), &original);
        let events = RefCell::new(Vec::new());
        let mut event = |name| events.borrow_mut().push(name);
        let start = trace.borrow().len();
        let (value, metadata) = carrier.into_core_metadata_with_events(op, ctx, &mut event)?;
        assert_eq!(value, original);
        assert_eq!(*events.borrow(), vec!["carrier-metadata-transfer"]);
        assert!(!trace.borrow()[start..].is_empty());
        assert!(
            trace.borrow()[start..].len() < original_work(&value, ctx.limits()).len(),
            "actual transfer must not repeat complete validator"
        );
        let metadata = metadata.expect("real completed collector");
        assert!(metadata.compatible(ctx));
        assert_eq!(metadata.extent(), 11);
        let facts = metadata.core_role_facts().unwrap();
        assert_eq!(facts.root_id, Some(0));
        assert!(facts.nested_id);
        assert!(facts.anchors);
        let root = metadata.node(0).unwrap();
        assert_eq!(
            (
                root.parent,
                root.edge,
                root.first,
                root.count,
                root.depth,
                root.end,
                root.max_depth
            ),
            (u32::MAX, 0, 1, 3, 0, 11, 3)
        );
        let child = metadata.node(7).unwrap();
        assert_eq!(
            (
                child.parent,
                child.edge,
                child.count,
                child.depth,
                child.end
            ),
            (0, 2, 3, 1, 11)
        );
        let leaf = metadata.node(6).unwrap();
        assert_eq!(
            (leaf.parent, leaf.edge, leaf.count, leaf.depth, leaf.end),
            (5, 0, 0, 3, 7)
        );
        assert!(metadata.node(11).is_none());
        let root = metadata.root().unwrap();
        let schema = Structure::child(&root, 2, ctx)?.unwrap();
        assert_eq!(schema.root, 7);
        let x = Structure::child(&schema, 2, ctx)?.unwrap();
        assert_eq!(x.root, 10);
        assert!(Structure::child(&schema, 3, ctx)?.is_none());
        let Value::Object(fields) = &value else {
            panic!("whole root")
        };
        assert_eq!(
            fields.iter().map(|(k, _)| k.clone()).collect::<Vec<_>>(),
            vec![
                Utf16::from("$id"),
                Utf16::from("unknown"),
                Utf16::from("schema")
            ]
        );
        let Value::Object(schema) = &fields[2].1 else {
            panic!("schema")
        };
        assert_eq!(schema[2], (Utf16::from("x"), Value::Number(1.0)));
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn foreign_context_operation_expiry_and_changed_limits_pay_original_fallback_without_facts() {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        for foreign_operation in [false, true] {
            let mut foreign = Context::catalog();
            let carrier = if foreign_operation {
                OwnedCoreOperation::with_context(&mut foreign, |foreign, _| {
                    OwnedCoreJson::admit_factory_resource(
                        fixture(),
                        &Utf16::from("coreSchema"),
                        op,
                        foreign,
                    )
                })?
            } else {
                OwnedCoreJson::admit_factory_resource(
                    fixture(),
                    &Utf16::from("coreSchema"),
                    op,
                    &mut foreign,
                )?
            };
            let start = trace.borrow().len();
            let (value, facts) = carrier.into_core_metadata(op, ctx)?;
            assert_eq!(value, fixture());
            assert!(facts.is_none());
            paid(&trace.borrow()[start..], &value, ctx.limits());
        }
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
        ctx.with_aggregate_text_limit(smaller, |changed| {
            let start = trace.borrow().len();
            let (value, facts) = carrier.into_core_metadata(op, changed)?;
            assert!(facts.is_none());
            paid(&trace.borrow()[start..], &value, changed.limits());
            Ok::<(), EngineError>(())
        })?;
        Ok::<(), EngineError>(())
    })
    .unwrap();
    let old = OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        OwnedCoreJson::admit_factory_resource(fixture(), &Utf16::from("coreSchema"), op, ctx)
    })
    .unwrap();
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let start = trace.borrow().len();
        let (value, facts) = old.into_core_metadata(op, ctx)?;
        assert!(facts.is_none());
        paid(&trace.borrow()[start..], &value, ctx.limits());
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(
        Context::with_limits(
            crate::ResourceProfile::HardIsolated,
            Context::catalog().limits()
        )
        .is_err()
    );
}

#[test]
fn raw_ordinary_consumption_and_checked_child_copy_do_not_retain_parent_structure_custody() {
    let trace = RefCell::new(Vec::new());
    let mut meter = |n| {
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let parent =
            OwnedCoreJson::admit_factory_resource(fixture(), &Utf16::from("coreSchema"), op, ctx)?;
        let child = parent.copy_schema_member(op, ctx, "missing")?;
        let start = trace.borrow().len();
        let (value, facts) = child.into_core_metadata(op, ctx)?;
        assert!(facts.is_none());
        paid(&trace.borrow()[start..], &value, ctx.limits());
        let raw = parent.into_resource(op, ctx)?;
        let ordinary = OwnedCoreJson::admit_native_resource(raw.clone(), op, ctx)?;
        let (value, facts) = ordinary.into_core_metadata(op, ctx)?;
        assert_eq!(value, raw);
        assert!(facts.is_none());
        let carrier =
            OwnedCoreJson::admit_factory_resource(fixture(), &Utf16::from("coreSchema"), op, ctx)?;
        let mut raw = carrier.into_raw();
        let start = trace.borrow().len();
        admit_owned_json(raw.clone(), ctx)?;
        assert_eq!(
            &trace.borrow()[start..],
            original_work(&raw, ctx.limits()).as_slice()
        );
        let Value::Object(fields) = &mut raw else {
            panic!("raw")
        };
        fields.push((Utf16::from("tampered"), Value::Number(-0.0)));
        let expected = oracle(raw.clone(), "#", ctx.limits()).unwrap_err();
        let error = OwnedCoreJson::admit_factory_resource(raw, &Utf16::from("coreSchema"), op, ctx)
            .unwrap_err();
        assert_eq!(error, expected);
        assert_eq!(error.path, Utf16::from("#/tampered"));
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn sequential_resource_admission_retains_first_invalid_order_without_partial_receipt() {
    // Actual sequence of safe admitters, not yet the pending whole native factory.
    let names = [
        "coreSchema",
        "referenceSchema",
        "packageSchema",
        "constraints",
        "domainPolicy",
        "companionA",
        "companionB",
        "companionC",
        "companionD",
    ];
    for first_bad in 0..names.len() {
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
                let value = if i < first_bad {
                    fixture()
                } else {
                    Value::Object(vec![(
                        Utf16::from(format!("bad-{i}")),
                        Value::Number(f64::NAN),
                    )])
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
        assert_eq!(error.path, Utf16::from(format!("#/bad-{first_bad}")));
        assert_eq!(*published.borrow(), (0..first_bad).collect::<Vec<_>>());
    }
}

fn stage(ctx: &mut Context<'_>, event: &mut dyn FnMut(&'static str)) -> Result<(), EngineError> {
    let bridge = RefCell::new(event);
    let mut op_event = |name| bridge.borrow_mut()(name);
    let mut data_event = |name| bridge.borrow_mut()(name);
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
            assert!(facts.is_some());
            Ok(())
        },
        &mut op_event,
    )
}

#[test]
fn meaningful_real_metadata_growth_completion_and_transfer_sites_refuse_before_effect() {
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
        "operation-publication",
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
        assert!(
            events.iter().any(|(n, _)| *n == name),
            "fixture must actually reach {name}"
        );
    }
    // Tiny eleven-node fixture: deduplicate only OBSERVED effect callback sites.
    // Never reparse the large pinned metaschema at every work callback.
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
}

#[test]
fn terminal_reentry_and_observer_unwind_restore_operation_without_publishing_partial_facts() {
    let trace = RefCell::new(Vec::new());
    let panicking = Cell::new(false);
    let after = Cell::new(0usize);
    let mut meter = |n| {
        if panicking.get() {
            after.set(after.get() + 1);
        }
        trace.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, parent| {
        for marker in [
            "closed-scalar-record",
            "closed-container-record",
            "closed-structure-publication",
            "carrier-publication",
            "carrier-metadata-transfer",
        ] {
            let before = ctx.charged_work();
            let returned = Cell::new(false);
            let mut event = |name| {
                if name == marker {
                    panicking.set(true);
                    panic!("independent fused unwind")
                }
            };
            let unwind = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                stage(ctx, &mut event).unwrap();
                returned.set(true);
            }));
            assert!(unwind.is_err());
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
        let mut event = |name| {
            if name == "closed-container-local" && !entered.replace(true) {
                let mut foreign = Context::catalog();
                OwnedCoreOperation::with_context(&mut foreign, |ctx, op| {
                    let carrier = OwnedCoreJson::admit_factory_resource(
                        Value::Null,
                        &Utf16::from("coreSchema"),
                        op,
                        ctx,
                    )?;
                    let (value, facts) = carrier.into_core_metadata(op, ctx)?;
                    assert_eq!(value, Value::Null);
                    assert_eq!(facts.unwrap().extent(), 1);
                    Ok::<(), EngineError>(())
                })
                .unwrap();
                assert!(foreign.owned_core_operation.is_none());
            }
        };
        stage(ctx, &mut event)?;
        assert!(entered.get());
        let carrier = OwnedCoreJson::admit_factory_resource(
            fixture(),
            &Utf16::from("coreSchema"),
            parent,
            ctx,
        )?;
        assert!(carrier.into_core_metadata(parent, ctx)?.1.is_some());
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.owned_core_operation.is_none());
    // A real host refusal in the nested admission also leaves this Context reusable.
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
    assert!(recovered.owned_core_operation.is_none());
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed scalar metadata SOURCE controls: native UNCOMPILED/UNEXECUTED.
//! Actual safe validator only. Parser connection and whole factory are outside
//! this seam. H owns include; no raw kernel invocation or manufactured counter.
use super::*;
use crate::schema::admitted_structure::Structure;
use std::cell::{Cell, RefCell};
use std::sync::Arc;

const OTHER: [&str; 6] = [
    "constraints",
    "domainPolicy",
    "tablesPackage",
    "actionsPackage",
    "bindingPackage",
    "stableBindingPackage",
];
type Row = (u32, u32, u32, u32, u32, u32, u8, u32);
fn row(s: &Structure, i: usize) -> Row {
    let n = s.node(i).expect("completed row");
    (
        n.parent,
        n.edge,
        n.first,
        n.count,
        n.depth,
        n.end,
        n.flags,
        n.max_depth,
    )
}
fn rows(s: &Structure) -> Vec<Row> {
    (0..s.extent()).map(|i| row(s, i)).collect()
}
fn fixture() -> Value {
    Value::Object(vec![
        (
            Utf16::from("$id"),
            Value::string_utf8("urn:closed-metadata:core"),
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
fn original(
    value: Value,
    root: &str,
    limits: crate::context::Limits,
) -> Result<Value, EngineError> {
    admit_owned_json_at(value, Utf16::from(root), &mut context(limits))
}
fn generic(value: Value, limits: crate::context::Limits) -> Arc<Structure> {
    admit_owned_json_with_structure(value, &mut context(limits), &mut |_, _, _, _, _| Ok(()))
        .unwrap()
        .1
        .unwrap()
}
fn original_work(value: &Value, limits: crate::context::Limits) -> Vec<usize> {
    let work = RefCell::new(Vec::new());
    let mut meter = |n| {
        work.borrow_mut().push(n);
        Ok(())
    };
    admit_owned_json(value.clone(), &mut context(limits).with_meter(&mut meter)).unwrap();
    work.into_inner()
}
fn paid(trace: &[usize], v: &Value, limits: crate::context::Limits) {
    let full = original_work(v, limits);
    assert!(trace.len() > full.len());
    assert!(trace.ends_with(&full));
}
fn host() -> EngineError {
    let mut e = EngineError::new(
        "CANCELLED",
        Utf16::new(vec![47, 0xd800, 126]),
        "original closed metadata host refusal",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("closed-host-δ"));
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
fn admit(
    value: Value,
    name: &str,
    ctx: &mut Context<'_>,
    event: &mut dyn FnMut(&'static str),
) -> Result<(Value, Option<Arc<Structure>>), EngineError> {
    OwnedCoreOperation::with_context(ctx, |ctx, op| {
        let carrier = OwnedCoreJson::admit_factory_resource_with_events(
            value,
            &Utf16::from(name),
            op,
            ctx,
            event,
        )?;
        carrier.into_core_metadata_with_events(op, ctx, event)
    })
}
fn trace(value: Value, name: Option<&str>) -> Vec<usize> {
    let work = RefCell::new(Vec::new());
    let mut meter = |n| {
        work.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let start = work.borrow().len();
        let carrier = match name {
            Some(name) => {
                OwnedCoreJson::admit_factory_resource(value, &Utf16::from(name), op, ctx)?
            }
            None => OwnedCoreJson::admit_native_resource(value, op, ctx)?,
        };
        drop(carrier);
        Ok::<_, EngineError>(work.borrow()[start..].to_vec())
    })
    .unwrap()
}

#[test]
fn scalar_roots_have_direct_final_literal_rows_and_no_child_frame_or_container() {
    let limits = Context::catalog().limits();
    for v in [
        Value::Null,
        Value::Bool(false),
        Value::Bool(true),
        Value::Number(0.0),
        Value::Number(-1.0),
        Value::Number(0.5),
        Value::Number(9_007_199_254_740_991.0),
        Value::string_utf8("urn:scalar:uri"),
        Value::String(Utf16::new(vec![0xd800, 0xdc00, 0xdc00])),
    ] {
        let original = original(v.clone(), "#", limits).unwrap();
        let old = generic(v.clone(), limits);
        for name in ["coreSchema", "referenceSchema", "packageSchema"] {
            let events = RefCell::new(Vec::new());
            let mut event = |name| events.borrow_mut().push(name);
            let (value, s) = admit(v.clone(), name, &mut Context::catalog(), &mut event).unwrap();
            assert_eq!(value, original);
            let s = s.unwrap();
            assert_eq!(s.extent(), 1);
            assert_eq!(row(&s, 0), (u32::MAX, 0, 0, 0, 0, 1, 0, 0));
            assert_eq!(rows(&s), rows(&old));
            assert!(s.node(1).is_none());
            let facts = s.core_role_facts().unwrap();
            assert_eq!(facts.root_id, None);
            assert!(!facts.nested_id && !facts.anchors);
            for label in [
                "closed-compact-guard",
                "closed-scalar-record",
                "closed-structure-publication",
                "carrier-metadata-transfer",
            ] {
                assert_eq!(events.borrow().iter().filter(|n| **n == label).count(), 1);
            }
            for label in [
                "closed-container-local",
                "closed-container-record",
                "closed-child-summary",
                "dfs-frame-growth",
                "closed-checked-fallback",
            ] {
                assert!(!events.borrow().contains(&label));
            }
        }
    }
}

#[test]
fn nested_scalar_rows_and_metadata_keys_match_literal_coordinates_and_original_builder() {
    let value = fixture();
    let old = generic(value.clone(), Context::catalog().limits());
    let events = RefCell::new(Vec::new());
    let mut event = |name| events.borrow_mut().push(name);
    let (actual, s) = admit(
        value.clone(),
        "coreSchema",
        &mut Context::catalog(),
        &mut event,
    )
    .unwrap();
    assert_eq!(actual, value);
    let s = s.unwrap();
    assert_eq!(s.extent(), 11);
    assert_eq!(rows(&s), rows(&old));
    assert_eq!(row(&s, 0), (u32::MAX, 0, 1, 3, 0, 11, 13, 3));
    for (i, parent, edge, depth) in [
        (1, 0, 0, 1),
        (3, 2, 0, 2),
        (4, 2, 1, 2),
        (6, 5, 0, 3),
        (8, 7, 0, 2),
        (9, 7, 1, 2),
        (10, 7, 2, 2),
    ] {
        assert_eq!(
            row(&s, i),
            (parent, edge, 0, 0, depth, i as u32 + 1, 0, depth)
        );
    }
    assert_eq!(
        events
            .borrow()
            .iter()
            .filter(|n| **n == "closed-scalar-record")
            .count(),
        7
    );
    assert_eq!(
        events
            .borrow()
            .iter()
            .filter(|n| **n == "closed-container-record")
            .count(),
        4
    );
    let facts = s.core_role_facts().unwrap();
    assert_eq!(facts.root_id, Some(0));
    assert!(facts.nested_id && facts.anchors);
    let mut ctx = Context::catalog();
    let root = s.root().unwrap();
    let object = Structure::child(&root, 1, &mut ctx).unwrap().unwrap();
    let array_child = Structure::child(&object, 2, &mut ctx).unwrap().unwrap();
    let raw = Structure::child(&array_child, 0, &mut ctx)
        .unwrap()
        .unwrap();
    assert_eq!(raw.root, 6);
    for empty in [Value::Array(Vec::new()), Value::Object(Vec::new())] {
        let (_, s) = admit(empty.clone(), "coreSchema", &mut ctx, &mut |_| {}).unwrap();
        assert_eq!(rows(&s.unwrap()), rows(&generic(empty, ctx.limits())));
    }
}

#[test]
fn actual_effective_value_limit_selects_compact_or_checked_route_without_clamping() {
    for max_values in [1, 11, u32::MAX as usize - 1, u32::MAX as usize, usize::MAX] {
        let mut limits = Context::catalog().limits();
        limits.max_values = max_values;
        let value = if max_values == 1 {
            Value::Null
        } else {
            fixture()
        };
        let expected = generic(value.clone(), limits);
        let seen = RefCell::new(Vec::new());
        let mut event = |name| seen.borrow_mut().push(name);
        let mut ctx = context(limits);
        let (actual, s) = admit(value.clone(), "coreSchema", &mut ctx, &mut event).unwrap();
        assert_eq!(actual, value);
        assert_eq!(ctx.limits(), limits);
        let s = s.unwrap();
        assert!(s.compatible(&ctx));
        assert_eq!(rows(&s), rows(&expected));
        assert_eq!(
            seen.borrow()
                .iter()
                .filter(|n| **n == "closed-compact-guard")
                .count(),
            1
        );
        let checked = max_values >= u32::MAX as usize;
        assert_eq!(seen.borrow().contains(&"closed-checked-fallback"), checked);
        assert_eq!(seen.borrow().contains(&"closed-scalar-record"), !checked);
        assert_eq!(
            seen.borrow().contains(&"dfs-structure-publication"),
            checked
        );
        assert!(s.core_role_facts().is_some());
    }
    let mut limits = Context::catalog().limits();
    limits.max_values = 0;
    let seen = RefCell::new(Vec::new());
    let mut event = |n| seen.borrow_mut().push(n);
    let expected = original(Value::Null, "#", limits).unwrap_err();
    let error = admit(Value::Null, "coreSchema", &mut context(limits), &mut event).unwrap_err();
    assert_eq!(error, expected);
    assert!(seen.borrow().is_empty());
    let mut limits = Context::catalog().limits();
    limits.max_values = 1;
    limits.max_depth = 0;
    let (_, s) = admit(
        Value::Bool(true),
        "coreSchema",
        &mut context(limits),
        &mut |_| {},
    )
    .unwrap();
    assert_eq!(row(&s.unwrap(), 0), (u32::MAX, 0, 0, 0, 0, 1, 0, 0));
}

#[test]
fn no_metadata_and_ordinary_routes_preserve_original_callbacks_and_full_admission() {
    let simple = Value::Object(vec![
        (Utf16::from("a"), Value::Number(1.0)),
        (Utf16::from("b"), Value::Array(vec![Value::Bool(true)])),
    ]);
    assert_eq!(
        original_work(&simple, Context::catalog().limits()),
        vec![1, 2, 1, 1, 1, 1, 1, 1]
    );
    let native_null = trace(Value::Null, None);
    for name in OTHER {
        let named_null = trace(Value::Null, Some(name));
        assert!(named_null.ends_with(&native_null));
        let prefix = named_null[..named_null.len() - native_null.len()].to_vec();
        for v in [
            simple.clone(),
            fixture(),
            Value::String(Utf16::new(vec![0xd800])),
        ] {
            let mut expected = prefix.clone();
            expected.extend(trace(v.clone(), None));
            assert_eq!(trace(v.clone(), Some(name)), expected);
            let seen = RefCell::new(Vec::new());
            let mut event = |n| seen.borrow_mut().push(n);
            let (actual, metadata) =
                admit(v.clone(), name, &mut Context::catalog(), &mut event).unwrap();
            assert_eq!(actual, v);
            assert!(metadata.is_none());
            assert_eq!(
                *seen.borrow(),
                vec!["carrier-publication", "carrier-metadata-transfer"]
            );
        }
        for invalid in [
            Value::Number(-0.0),
            Value::Object(vec![
                (Utf16::new(vec![0xd800]), Value::Null),
                (Utf16::new(vec![0xd800]), Value::Number(f64::NAN)),
            ]),
        ] {
            let expected = original(invalid.clone(), "#", Context::catalog().limits()).unwrap_err();
            let seen = RefCell::new(Vec::new());
            let mut event = |n| seen.borrow_mut().push(n);
            assert_eq!(
                admit(invalid, name, &mut Context::catalog(), &mut event).unwrap_err(),
                expected
            );
            assert!(seen.borrow().is_empty());
        }
    }
}

#[test]
fn original_numeric_duplicate_depth_node_frontier_refusals_precede_closed_publication() {
    let limits = Context::catalog().limits();
    let mut cases = Vec::new();
    for n in [
        -0.0,
        f64::NAN,
        f64::INFINITY,
        f64::NEG_INFINITY,
        9_007_199_254_740_992.0,
    ] {
        cases.push((Value::Number(n), limits, "NUMBER", "#", true));
    }
    cases.push((
        Value::Object(vec![(
            Utf16::from("a/b~"),
            Value::Array(vec![Value::Number(-0.0)]),
        )]),
        limits,
        "NUMBER",
        "#/a~1b~0/0",
        false,
    ));
    let mut depth = limits;
    depth.max_depth = 1;
    cases.push((
        Value::Array(vec![Value::Array(vec![Value::Number(f64::NAN)])]),
        depth,
        "LIMIT",
        "#/0/0",
        false,
    ));
    let mut count = limits;
    count.max_values = 2;
    cases.push((
        Value::Array(vec![Value::Number(f64::NAN), Value::Null]),
        count,
        "LIMIT",
        "#",
        true,
    ));
    for (value, limits, code, path, no_start) in cases {
        let expected = original(value.clone(), "#", limits).unwrap_err();
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
        for name in [
            "coreSchema",
            "referenceSchema",
            "packageSchema",
            "constraints",
        ] {
            let seen = RefCell::new(Vec::new());
            let mut event = |n| seen.borrow_mut().push(n);
            let error = admit(value.clone(), name, &mut context(limits), &mut event).unwrap_err();
            assert_eq!(error, expected);
            assert!(!seen.borrow().contains(&"closed-structure-publication"));
            assert!(!seen.borrow().contains(&"carrier-publication"));
            if no_start {
                assert!(seen.borrow().is_empty());
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
        assert_eq!(
            admit(value, "coreSchema", &mut Context::catalog(), &mut |_| {}).unwrap_err(),
            expected
        );
    }
}

#[test]
fn closed_growth_scalar_record_and_publication_refuse_before_actual_effect_groups() {
    for value in [Value::String(Utf16::new(vec![0xd800])), fixture()] {
        let calls = Cell::new(0usize);
        let mut meter = |_| {
            calls.set(calls.get() + 1);
            Ok(())
        };
        let events = RefCell::new(Vec::new());
        let mut event = |n| events.borrow_mut().push((n, calls.get()));
        admit(
            value.clone(),
            "coreSchema",
            &mut Context::catalog().with_meter(&mut meter),
            &mut event,
        )
        .unwrap();
        let events = events.into_inner();
        for label in [
            "closed-compact-guard",
            "closed-row-growth",
            "closed-scalar-record",
            "closed-structure-publication",
            "carrier-publication",
            "carrier-metadata-transfer",
        ] {
            assert!(events.iter().any(|(n, _)| *n == label));
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
            let mut event = |n| seen.borrow_mut().push((n, calls.get()));
            let mut ctx = Context::catalog().with_meter(&mut meter);
            let error = admit(value.clone(), "coreSchema", &mut ctx, &mut event).unwrap_err();
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
    // Only observed effect groups on fixed scalar/11-node fixtures, no large
    // pinned-source or every-work-callback denial/reparse campaign.
}

#[test]
fn direct_scalar_record_control_refusal_keeps_actual_owned_surrogate_path_and_stops_returns() {
    let calls = Cell::new(0usize);
    let mut meter = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    let events = RefCell::new(Vec::new());
    let mut event = |n| events.borrow_mut().push((n, calls.get()));
    admit(
        fixture(),
        "coreSchema",
        &mut Context::catalog().with_meter(&mut meter),
        &mut event,
    )
    .unwrap();
    let target = events
        .borrow()
        .iter()
        .filter(|(n, _)| *n == "closed-scalar-record")
        .nth(3)
        .unwrap()
        .1;
    let mut expected = "#/unknown/2/".encode_utf16().collect::<Vec<_>>();
    expected.push(0xd800);
    let expected = Utf16::new(expected);
    for deadline in [false, true] {
        let calls = Cell::new(0usize);
        let stopped = Cell::new(false);
        let after = Cell::new(0usize);
        let mut meter = |_| {
            if stopped.get() {
                after.set(after.get() + 1);
            }
            calls.set(calls.get() + 1);
            Ok(())
        };
        let mut cancel = || {
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
            ctx = ctx.with_cancellation(&mut cancel);
        }
        let seen = RefCell::new(Vec::new());
        let mut event = |n| seen.borrow_mut().push((n, calls.get()));
        let error = admit(fixture(), "coreSchema", &mut ctx, &mut event).unwrap_err();
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
}

#[test]
fn immutable_consumption_foreign_operation_limits_and_raw_copy_custody_remain_conservative() {
    let work = RefCell::new(Vec::new());
    let mut meter = |n| {
        work.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let owned = fixture();
        let mut changed = owned.clone();
        let carrier = OwnedCoreJson::admit_factory_resource(
            owned.clone(),
            &Utf16::from("coreSchema"),
            op,
            ctx,
        )?;
        let Value::Object(fields) = &mut changed else {
            panic!("raw")
        };
        fields.reverse();
        fields[0].1 = Value::Number(-0.0);
        assert_eq!(carrier.value(), &owned);
        let (value, metadata) = carrier.into_core_metadata(op, ctx)?;
        assert_eq!(value, owned);
        let metadata = metadata.unwrap();
        assert!(metadata.compatible(ctx));
        let retained = rows(&metadata);
        let mut foreign = Context::catalog();
        let carrier = OwnedCoreJson::admit_factory_resource(
            fixture(),
            &Utf16::from("coreSchema"),
            op,
            &mut foreign,
        )?;
        let start = work.borrow().len();
        let (value, facts) = carrier.into_core_metadata(op, ctx)?;
        assert!(facts.is_none());
        paid(&work.borrow()[start..], &value, ctx.limits());
        let carrier =
            OwnedCoreJson::admit_factory_resource(fixture(), &Utf16::from("coreSchema"), op, ctx)?;
        let start = work.borrow().len();
        let (value, facts) = OwnedCoreOperation::with_context(ctx, |inner, other| {
            carrier.into_core_metadata(other, inner)
        })?;
        assert!(facts.is_none());
        paid(&work.borrow()[start..], &value, ctx.limits());
        let carrier =
            OwnedCoreJson::admit_factory_resource(fixture(), &Utf16::from("coreSchema"), op, ctx)?;
        let bound = ctx.limits().max_text_units - 1;
        ctx.with_aggregate_text_limit(bound, |ctx| {
            let start = work.borrow().len();
            let (value, facts) = carrier.into_core_metadata(op, ctx)?;
            assert!(facts.is_none());
            paid(&work.borrow()[start..], &value, ctx.limits());
            Ok::<(), EngineError>(())
        })?;
        let parent =
            OwnedCoreJson::admit_factory_resource(fixture(), &Utf16::from("coreSchema"), op, ctx)?;
        let child = parent.copy_schema_member(op, ctx, "missing")?;
        let start = work.borrow().len();
        let (value, facts) = child.into_core_metadata(op, ctx)?;
        assert!(facts.is_none());
        paid(&work.borrow()[start..], &value, ctx.limits());
        let mut raw = parent.into_raw();
        let start = work.borrow().len();
        admit_owned_json(raw.clone(), ctx)?;
        assert_eq!(
            &work.borrow()[start..],
            original_work(&raw, ctx.limits()).as_slice()
        );
        let Value::Object(fields) = &mut raw else {
            panic!("raw")
        };
        fields.push((Utf16::from("tamper"), Value::Number(-0.0)));
        let expected = original(raw.clone(), "#", ctx.limits()).unwrap_err();
        assert_eq!(
            OwnedCoreJson::admit_factory_resource(raw, &Utf16::from("coreSchema"), op, ctx)
                .unwrap_err(),
            expected
        );
        assert_eq!(rows(&metadata), retained);
        Ok::<(), EngineError>(())
    })
    .unwrap();
    let expired = OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        OwnedCoreJson::admit_factory_resource(fixture(), &Utf16::from("coreSchema"), op, ctx)
    })
    .unwrap();
    OwnedCoreOperation::with_context(&mut ctx, |ctx, op| {
        let start = work.borrow().len();
        let (value, facts) = expired.into_core_metadata(op, ctx)?;
        assert!(facts.is_none());
        paid(&work.borrow()[start..], &value, ctx.limits());
        Ok::<(), EngineError>(())
    })
    .unwrap();
    // Invariant root/child brands and private fields cannot be manufactured via
    // this API. No direct kernel calls or pretend wrong-brand successful proofs.
}

#[test]
fn nested_reentry_unwind_and_host_recovery_never_return_partial_metadata() {
    let panic_active = Cell::new(false);
    let after = Cell::new(0usize);
    let mut meter = |_| {
        if panic_active.get() {
            after.set(after.get() + 1);
        }
        Ok(())
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    OwnedCoreOperation::with_context(&mut ctx, |ctx, parent| {
        for marker in [
            "closed-scalar-record",
            "closed-structure-publication",
            "carrier-publication",
            "carrier-metadata-transfer",
        ] {
            let returned = Cell::new(false);
            let before = ctx.charged_work();
            let mut event = |n| {
                if n == marker {
                    panic_active.set(true);
                    panic!("independent closed metadata unwind")
                }
            };
            let caught = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                admit(fixture(), "coreSchema", ctx, &mut event).unwrap();
                returned.set(true);
            }));
            assert!(caught.is_err());
            assert!(!returned.get());
            assert_eq!(after.get(), 0);
            panic_active.set(false);
            assert!(ctx.charged_work() > before);
            let carrier = OwnedCoreJson::admit_factory_resource(
                fixture(),
                &Utf16::from("coreSchema"),
                parent,
                ctx,
            )?;
            assert_eq!(
                carrier.into_core_metadata(parent, ctx)?.1.unwrap().extent(),
                11
            );
        }
        let entered = Cell::new(false);
        let mut event = |n| {
            if n == "closed-scalar-record" && !entered.replace(true) {
                let mut foreign = Context::catalog();
                let (value, s) =
                    admit(Value::Bool(false), "coreSchema", &mut foreign, &mut |_| {}).unwrap();
                assert_eq!(value, Value::Bool(false));
                assert_eq!(row(&s.unwrap(), 0), (u32::MAX, 0, 0, 0, 0, 1, 0, 0));
                assert!(foreign.owned_core_operation.is_none());
            }
        };
        admit(fixture(), "coreSchema", ctx, &mut event)?;
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
    let mut event = |n| {
        if n == "closed-compact-guard" {
            arm.set(true);
        }
    };
    let error = admit(fixture(), "coreSchema", &mut recovered, &mut event).unwrap_err();
    same_host(&error, &wanted);
    assert!(recovered.owned_core_operation.is_none());
    let before = recovered.charged_work();
    admit(fixture(), "coreSchema", &mut recovered, &mut |_| {}).unwrap();
    assert!(recovered.charged_work() > before);
}

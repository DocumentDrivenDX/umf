// SPDX-License-Identifier: MIT OR Apache-2.0
//! FT1 independent SOURCE controls. UNCOMPILED / NATIVE UNEXECUTED.
//! Genuine admission only; original oracle observations are outside fused traces.
//! No producer-dependent epoch, fabricated proof, or Python transport claim.
use super::*;
use crate::engine::ResourceSet;
use std::cell::{Cell, RefCell};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::rc::Rc;

const CORE: &str = r#"{"$id":"https://ft.test/core","type":"object","default":{"left":[null,{"q/~\u2603":true},[],7],"right":{"a":false,"b":[1,2]},"empty":{}},"properties":{"x":{"type":"integer"}}}"#;
fn json(s: &str) -> Value {
    crate::serialization::read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn input(core: &str) -> ResourceSet {
    ResourceSet::new(
        json(core),
        json(r#"{"$id":"https://ft.test/reference","type":"string","default":[]}"#),
        json(r#"{"$id":"https://ft.test/package","type":"boolean","default":null}"#),
        json("{}"),
        json("{}"),
    )
}
fn construct(core: &str) -> Result<CompiledSchema, EngineError> {
    Context::catalog().with_codegen_construction(|ctx| {
        let admitted = admitted_bank::SchemaBank::admit_core(input(core), ctx)?;
        CompiledSchema::compile_input_bank(admitted.bank, 0, ctx)
    })
}
fn owner() -> CompiledSchema {
    construct(CORE).unwrap()
}
fn table(o: &CompiledSchema) -> &OwnerLocations {
    o.owner_locations.as_ref().expect("genuine owner table")
}
fn locate(o: &CompiledSchema, keys: &[&str], ctx: &mut Context<'_>) -> OwnerCursor {
    let t = table(o);
    let mut cursor = t.root(o, 0, ctx).unwrap().unwrap();
    for key in keys {
        let Value::Object(m) = t.read(o, &cursor, ctx).unwrap().unwrap() else {
            panic!("literal object parent")
        };
        let edge = m.iter().position(|(k, _)| k == &Utf16::from(*key)).unwrap();
        cursor = t.child(o, &cursor, edge, ctx).unwrap().unwrap();
    }
    cursor
}
fn binding<'o>(
    o: &'o CompiledSchema,
    cursor: &OwnerCursor,
    ctx: &mut Context<'_>,
) -> FusedBinding<'o> {
    let seed = table(o).checked(o, cursor, ctx).unwrap().unwrap();
    match FusedBinding::try_new(seed, ctx).unwrap() {
        OwnerRoute::Fused(binding) => binding,
        OwnerRoute::Legacy(_) => panic!("fixture requires actual Views binding"),
    }
}
type Events = Vec<(&'static str, usize, usize)>;
fn observed<T>(operation: impl FnOnce() -> T) -> (T, Events) {
    let rows = Rc::new(RefCell::new(Vec::new()));
    let sink = rows.clone();
    let result = observe_owner_walk(
        Box::new(move |e, r, n| sink.borrow_mut().push((e, r, n))),
        operation,
    );
    let copy = rows.borrow().clone();
    (result, copy)
}
fn fused<'b, 'o: 'b>(
    walk: &mut FusedChildren<'b, 'o>,
    edge: usize,
    ctx: &mut Context<'_>,
) -> BorrowedChild<'b, 'o> {
    match walk.select(edge, ctx).unwrap().unwrap() {
        CheckedOwnerLocation::Fused(child) => child,
        CheckedOwnerLocation::Owned(_) => panic!("eligible ordered fixture unexpectedly fell back"),
    }
}
fn compare(
    o: &CompiledSchema,
    child: &BorrowedChild<'_, '_>,
    cursor: &OwnerCursor,
    ctx: &mut Context<'_>,
) {
    let original = table(o).read(o, cursor, ctx).unwrap().unwrap();
    assert!(child.same_location(cursor));
    assert_eq!(
        child.logical_position(),
        cursor.logical_position(o, ctx).unwrap().unwrap()
    );
    assert!(std::ptr::eq(child.value(), original));
    assert_eq!(child.read(ctx).unwrap(), Some(original));
}
fn children(v: &Value) -> Vec<&Value> {
    match v {
        Value::Object(m) => m.iter().map(|(_, v)| v).collect(),
        Value::Array(a) => a.iter().collect(),
        _ => Vec::new(),
    }
}
fn walk_literals<'b, 'o: 'b>(
    o: &'o CompiledSchema,
    node: BorrowedChild<'b, 'o>,
    original: &OwnerCursor,
    ctx: &mut Context<'_>,
) -> usize {
    compare(o, &node, original, ctx);
    let expected = children(node.value());
    let mut walk = node.children(ctx).unwrap().unwrap();
    let mut total = 1;
    for (edge, value) in expected.iter().enumerate() {
        let (child, events) = observed(|| fused(&mut walk, edge, ctx));
        assert_eq!(
            events
                .iter()
                .filter(|e| e.0 == "ft1-borrowed-child-published")
                .count(),
            1
        );
        assert!(!events
            .iter()
            .any(|e| e.0 == "ft1-owning-cursor-materialized"));
        let cursor = table(o).child(o, original, edge, ctx).unwrap().unwrap();
        assert!(std::ptr::eq(child.value(), *value));
        // Read-only actual fields: never construct a coordinate/binding/proof.
        assert_eq!(child.coordinate.parent, Some(node.node));
        assert_eq!(child.coordinate.edge, edge);
        assert_eq!(child.coordinate.depth, node.coordinate.depth + 1);
        total += walk_literals(o, child, &cursor, ctx);
    }
    assert!(walk.select(expected.len(), ctx).unwrap().is_none());
    total
}
fn host_error() -> EngineError {
    EngineError::new(
        "FT_FIRST_HOST",
        Utf16::new(vec![47, 0xd800]),
        "exact original host",
    )
}

#[test]
fn ft01_literal_ordered_sparse_borrowed_readbacks_match_original() {
    let o = owner();
    let mut ctx = Context::catalog();
    let parent = locate(&o, &["default"], &mut ctx);
    let b = binding(&o, &parent, &mut ctx);
    let root = b.root(&mut ctx).unwrap();
    assert_eq!(
        walk_literals(&o, root, &parent, &mut ctx),
        13,
        "authored mixed default tree census"
    );
    let root = b.root(&mut ctx).unwrap();
    let mut sparse = root.children(&mut ctx).unwrap().unwrap();
    let (a, first) = observed(|| fused(&mut sparse, 0, &mut ctx));
    assert!(matches!(a.value(),Value::Array(v) if v.len()==4));
    let (z, later) = observed(|| fused(&mut sparse, 2, &mut ctx));
    assert_eq!(z.value(), &json("{}"));
    assert!(!first.iter().any(|e| e.0 == "ft1-intervening-row-read"));
    assert_eq!(
        later
            .iter()
            .filter(|e| e.0 == "ft1-intervening-row-read")
            .count(),
        1,
        "only the unvisited right sibling extent crossed"
    );
    let original = table(&o).child(&o, &parent, 2, &mut ctx).unwrap().unwrap();
    compare(&o, &z, &original, &mut ctx);
    let scalar_cursor = locate(&o, &["default", "right", "a"], &mut ctx);
    let sb = binding(&o, &scalar_cursor, &mut ctx);
    let scalar = sb.root(&mut ctx).unwrap();
    assert_eq!(scalar.value(), &Value::Bool(false));
    assert!(scalar
        .children(&mut ctx)
        .unwrap()
        .unwrap()
        .select(0, &mut ctx)
        .unwrap()
        .is_none());
}

#[test]
fn ft02_shared_physical_aliases_preserve_logical_custody() {
    let o = owner();
    let mut ctx = Context::catalog();
    let t = table(&o);
    let c0 = t.root(&o, 0, &mut ctx).unwrap().unwrap();
    let c1 = t.root(&o, 1, &mut ctx).unwrap().unwrap();
    {
        let a = binding(&o, &c0, &mut ctx);
        let b = binding(&o, &c1, &mut ctx);
        let r0 = a.root(&mut ctx).unwrap();
        let r1 = b.root(&mut ctx).unwrap();
        assert_eq!(r0.logical_position().0, 0);
        assert_eq!(r1.logical_position().0, 1);
        assert_ne!(r0.logical_position().1, r1.logical_position().1);
        assert!(std::ptr::eq(r0.value(), r1.value()));
        assert!(!r0.same_location(&c1));
        let mut w0 = r0.children(&mut ctx).unwrap().unwrap();
        let mut w1 = r1.children(&mut ctx).unwrap().unwrap();
        let x = fused(&mut w0, 0, &mut ctx);
        let y = fused(&mut w1, 0, &mut ctx);
        assert!(std::ptr::eq(x.value(), y.value()));
        assert_ne!(x.logical_position(), y.logical_position());
        let foreign = owner();
        let fc = locate(&foreign, &[], &mut ctx);
        assert!(
            !x.same_location(&fc),
            "equal contents never substitute lineage"
        );
    }
    // All binding borrows ended before move; no stale borrowed handle escaped.
    let moved = o;
    assert!(table(&moved).read(&moved, &c0, &mut ctx).unwrap().is_some());
}

#[test]
fn ft03_immediate_borrow_does_not_materialize_retaining_cursor() {
    let o = owner();
    let mut ctx = Context::catalog();
    let parent = locate(&o, &["default"], &mut ctx);
    let b = binding(&o, &parent, &mut ctx);
    let root = b.root(&mut ctx).unwrap();
    let mut w = root.children(&mut ctx).unwrap().unwrap();
    let (child, events) = observed(|| fused(&mut w, 0, &mut ctx));
    assert!(!events
        .iter()
        .any(|e| e.0 == "ft1-owning-cursor-materialized" || e.0 == "ow1-checked-publication"));
    let mut nested = child.children(&mut ctx).unwrap().unwrap();
    let (_, events) = observed(|| fused(&mut nested, 0, &mut ctx));
    assert!(!events
        .iter()
        .any(|e| e.0 == "ft1-owning-cursor-materialized"));
    let (retained, events) = observed(|| child.materialize_cursor(&mut ctx).unwrap());
    assert_eq!(
        events
            .iter()
            .filter(|e| e.0 == "ft1-owning-cursor-materialized")
            .count(),
        1
    );
    assert!(child.same_location(&retained));
    compare(&o, &child, &retained, &mut ctx);
    // Actual production preflight must likewise consume borrowed descendants.
    let (_, events) = observed(owner);
    assert!(events
        .iter()
        .any(|e| e.0 == "ft1-preflight-borrowed-consume"));
    assert!(events.iter().any(|e| e.0 == "ft1-borrowed-child-published"));
}

#[test]
fn ft04_real_preflight_and_nodeplan_consumption_keep_eligibility() {
    let o = owner();
    let mut ctx = Context::catalog();
    let cursor = locate(&o, &["properties", "x"], &mut ctx);
    let node = table(&o).read(&o, &cursor, &mut ctx).unwrap().unwrap();
    let plans = o.owner_plans.as_ref().unwrap();
    let (first, miss) = observed(|| {
        plans
            .node_at(
                &o,
                node,
                &Utf16::from("#/properties/x"),
                false,
                Some(&cursor),
                &mut ctx,
            )
            .unwrap()
            .unwrap()
    });
    assert_eq!(
        miss.iter()
            .filter(|e| e.0 == "ft1-node-plan-retaining-materialization")
            .count(),
        1
    );
    assert!(!miss
        .iter()
        .any(|e| e.0 == "ft1-node-plan-hit-after-readback"));
    let (second, hit) = observed(|| {
        plans
            .node_at(
                &o,
                node,
                &Utf16::from("#/properties/x"),
                false,
                Some(&cursor),
                &mut ctx,
            )
            .unwrap()
            .unwrap()
    });
    assert!(Arc::ptr_eq(&first, &second));
    assert_eq!(
        hit.iter()
            .filter(|e| e.0 == "ft1-node-plan-hit-after-readback")
            .count(),
        1
    );
    assert!(!hit.iter().any(|e| e.0 == "ft1-owning-cursor-materialized"));
    let original = CompiledSchema::compile(
        &json(CORE),
        &SchemaResources::default(),
        &mut Context::catalog(),
    )
    .unwrap();
    let sample = json(r#"{"x":false}"#);
    let (errors, evaluation) = observed(|| o.validate(&sample, &mut ctx).unwrap());
    assert_eq!(
        errors,
        original.validate(&sample, &mut Context::catalog()).unwrap()
    );
    assert!(
        evaluation
            .iter()
            .any(|e| e.0 == "ft1-node-plan-hit-after-readback"
                && e.2
                    == cursor
                        .logical_position(&o, &mut Context::catalog())
                        .unwrap()
                        .unwrap()
                        .1),
        "real evaluator matching consumer hit"
    );
    for (fixture, code, path, message) in [
        (
            r#"{"$id":"https://ft.test/core","x-ft-unknown":true,"type":7,"pattern":"["}"#,
            "SCHEMA_UNKNOWN_KEYWORD",
            "https://ft.test/core#",
            "Unknown schema keyword 'x-ft-unknown'",
        ),
        (
            r#"{"$id":"https://ft.test/core","type":7,"x-ft-unknown":true,"pattern":"["}"#,
            "SCHEMA_INVALID",
            "https://ft.test/core#/type",
            "type must be a string or array",
        ),
    ] {
        let actual = construct(fixture).err().unwrap();
        let expected = CompiledSchema::compile(
            &json(fixture),
            &SchemaResources::default(),
            &mut Context::catalog(),
        )
        .err()
        .unwrap();
        assert_eq!(actual, expected);
        assert_eq!(actual.code, code);
        assert_eq!(actual.path, Utf16::from(path));
        assert_eq!(actual.message, Utf16::from(message));
    }
}

#[test]
fn ft05_effective_limits_and_profiles_rechecked_after_scopes() {
    let o = owner();
    let mut ctx = Context::catalog();
    let parent = locate(&o, &["default"], &mut ctx);
    let b = binding(&o, &parent, &mut ctx);
    let root = b.root(&mut ctx).unwrap();
    let baseline = ctx.limits();
    assert!(root.read(&mut ctx).unwrap().is_some());
    ctx.with_schema_depth_allowance(baseline.max_depth + 1, |changed| {
        assert!(root.read(changed).unwrap().is_none());
        assert!(root.children(changed).unwrap().is_none());
    });
    assert_eq!(ctx.limits(), baseline);
    assert!(root.read(&mut ctx).unwrap().is_some());
    ctx.with_aggregate_text_limit(baseline.max_text_units - 1, |changed| {
        assert!(root.read(changed).unwrap().is_none())
    });
    ctx.with_tagged_transport_limit(|changed| assert!(root.read(changed).unwrap().is_none()));
    assert_eq!(ctx.limits(), baseline);
    let mut ordinary = Context::ordinary();
    assert!(root.read(&mut ordinary).unwrap().is_none());
    // This scope actually changes the values tuple back to the binding's tuple.
    ordinary.with_catalog_value_limit(|changed| assert!(root.read(changed).unwrap().is_some()));
    assert_eq!(
        ordinary.limits().max_values,
        crate::context::Limits::ordinary().max_values
    );
    assert!(Context::with_limits(crate::context::ResourceProfile::HardIsolated, baseline).is_err());
    let mut narrowed = baseline;
    narrowed.max_depth -= 1;
    let mut changed = Context::with_limits(ctx.profile(), narrowed).unwrap();
    let original = table(&o).child(&o, &parent, 0, &mut changed).unwrap();
    let mut walk = root.children(&mut ctx).unwrap().unwrap();
    let actual = walk.select(0, &mut changed).unwrap();
    assert_eq!(
        actual.as_ref().map(|x| x.read(&o, &mut changed).unwrap()),
        original
            .as_ref()
            .map(|x| table(&o).read(&o, x, &mut changed).unwrap())
    );
}

#[test]
fn ft06_nonmonotone_materialized_foreign_and_mode_fallback_parity() {
    let o = owner();
    let foreign = owner();
    let mut ctx = Context::catalog();
    let parent = locate(&o, &["default"], &mut ctx);
    let b = binding(&o, &parent, &mut ctx);
    let root = b.root(&mut ctx).unwrap();
    let mut w = root.children(&mut ctx).unwrap().unwrap();
    fused(&mut w, 2, &mut ctx);
    let (back, events) = observed(|| w.select(0, &mut ctx).unwrap().unwrap());
    assert!(matches!(&back, CheckedOwnerLocation::Owned(_)));
    assert!(events.iter().any(|e| e.0 == "ft1-original-fallback"));
    let original = table(&o).child(&o, &parent, 0, &mut ctx).unwrap().unwrap();
    assert_eq!(
        back.read(&o, &mut ctx).unwrap(),
        table(&o).read(&o, &original, &mut ctx).unwrap()
    );
    let mut fresh = root.children(&mut ctx).unwrap().unwrap();
    let selected = fresh.select(0, &mut ctx).unwrap().unwrap();
    assert!(
        selected.read(&foreign, &mut ctx).unwrap().is_none(),
        "Fused and Owned arms both reject foreign explicit owner"
    );
    let legacy = Context::catalog()
        .with_codegen_construction(|ctx| {
            CompiledSchema::compile(&json(CORE), &SchemaResources::default(), ctx)
        })
        .unwrap();
    let c = locate(&legacy, &[], &mut ctx);
    let checked = table(&legacy)
        .checked(&legacy, &c, &mut ctx)
        .unwrap()
        .unwrap();
    assert!(
        matches!(
            FusedBinding::try_new(checked, &mut ctx).unwrap(),
            OwnerRoute::Legacy(_)
        ),
        "materialized carrier keeps paid original route"
    );
    let plans = o.owner_plans.as_ref().unwrap();
    let c = locate(&o, &["properties", "x"], &mut ctx);
    let v = table(&o).read(&o, &c, &mut ctx).unwrap().unwrap();
    let a = plans
        .node_at(
            &o,
            v,
            &Utf16::from("#/properties/x"),
            false,
            Some(&c),
            &mut ctx,
        )
        .unwrap()
        .unwrap();
    let b = plans
        .node_at(
            &o,
            v,
            &Utf16::from("#/properties/x"),
            true,
            Some(&c),
            &mut ctx,
        )
        .unwrap()
        .unwrap();
    assert!(!Arc::ptr_eq(&a, &b));
    assert!(plans
        .node_at(
            &foreign,
            foreign.schema_value(),
            &Utf16::from("#"),
            false,
            Some(&c),
            &mut ctx
        )
        .unwrap()
        .is_none());
}

// Calibration runs ONLY this genuine fused path. Original oracle reads use a
// separate Context and are never compared by numeric callback ordinal.
fn producer(
    o: &CompiledSchema,
    parent: &OwnerCursor,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let seed = table(o).checked(o, parent, ctx)?.unwrap();
    let b = match FusedBinding::try_new(seed, ctx)? {
        OwnerRoute::Fused(b) => b,
        _ => panic!("Views producer"),
    };
    let root = b.root(ctx)?;
    let mut w = root.children(ctx)?.unwrap();
    let child = w.select(2, ctx)?.unwrap();
    assert!(child.read(o, ctx)?.is_some());
    Ok(())
}
#[test]
fn ft07_group_denial_preserves_first_fields_and_no_partial_publish() {
    let o = owner();
    let parent = locate(&o, &["default"], &mut Context::catalog());
    let calls = Rc::new(Cell::new(0));
    let ordinals = Rc::new(RefCell::new(Vec::new()));
    let c = calls.clone();
    let groups = ordinals.clone();
    let mut count = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    observe_owner_walk(
        Box::new(move |e, _, _| {
            if [
                "ft1-binding-publication",
                "ft1-frontier-publication",
                "ft1-intervening-row-read",
                "ft1-selected-row-read",
                "ft1-child-value-read",
                "ft1-borrowed-child-published",
            ]
            .contains(&e)
            {
                groups.borrow_mut().push((e, c.get()));
            }
        }),
        || {
            producer(
                &o,
                &parent,
                &mut Context::catalog().with_host_control(&mut count),
            )
        },
    )
    .unwrap();
    for required in [
        "ft1-binding-publication",
        "ft1-frontier-publication",
        "ft1-intervening-row-read",
        "ft1-selected-row-read",
        "ft1-child-value-read",
        "ft1-borrowed-child-published",
    ] {
        assert!(
            ordinals
                .borrow()
                .iter()
                .any(|(event, n)| *event == required && *n > 0),
            "every required actual effect group must be reached"
        );
    }
    let mut points = ordinals
        .borrow()
        .iter()
        .map(|(_, n)| *n)
        .collect::<Vec<_>>();
    points.sort_unstable();
    points.dedup();
    assert!(!points.is_empty());
    for denied in points {
        let calls = Cell::new(0);
        let at = Cell::new(usize::MAX);
        let rows = Rc::new(RefCell::new(Vec::new()));
        let sink = rows.clone();
        let host = host_error();
        let mut stop = |_| {
            calls.set(calls.get() + 1);
            if calls.get() == denied {
                at.set(rows.borrow().len());
                Err(host.clone())
            } else {
                Ok(())
            }
        };
        let error = observe_owner_walk(
            Box::new(move |e, r, n| sink.borrow_mut().push((e, r, n))),
            || {
                producer(
                    &o,
                    &parent,
                    &mut Context::catalog().with_host_control(&mut stop),
                )
            },
        )
        .unwrap_err();
        assert_eq!(error, host.from_host());
        assert_eq!(calls.get(), denied);
        assert_eq!(
            rows.borrow().len(),
            at.get(),
            "no effect/read/publication after denied group"
        );
    }
    for deadline in [false, true] {
        let mut ctx = Context::catalog();
        let b = binding(&o, &parent, &mut ctx);
        let root = b.root(&mut ctx).unwrap();
        let mut w = root.children(&mut ctx).unwrap().unwrap();
        let mut cancel = || true;
        let mut clock = || Some(2);
        let actual = if deadline {
            w.select(0, &mut Context::catalog().with_clock(&mut clock, 1))
        } else {
            w.select(0, &mut Context::catalog().with_cancellation(&mut cancel))
        }
        .err()
        .unwrap();
        let mut cancel = || true;
        let mut clock = || Some(2);
        let expected = if deadline {
            table(&o).child(
                &o,
                &parent,
                0,
                &mut Context::catalog().with_clock(&mut clock, 1),
            )
        } else {
            table(&o).child(
                &o,
                &parent,
                0,
                &mut Context::catalog().with_cancellation(&mut cancel),
            )
        }
        .err()
        .unwrap();
        assert_eq!(actual, expected);
    }
}

#[test]
fn ft08_reentry_unwind_poison_and_stale_frontier_custody() {
    let o = owner();
    let mut ctx = Context::catalog();
    let parent = locate(&o, &["default"], &mut ctx);
    let b = binding(&o, &parent, &mut ctx);
    let root = b.root(&mut ctx).unwrap();
    let mut outer = root.children(&mut ctx).unwrap().unwrap();
    let mut setup = root.children(&mut ctx).unwrap().unwrap();
    let left = fused(&mut setup, 0, &mut ctx);
    let mut independent = left.children(&mut ctx).unwrap().unwrap();
    let armed = Rc::new(Cell::new(false));
    let latch = armed.clone();
    let entered = Cell::new(false);
    let inner = RefCell::new(None);
    let mut control = |_| {
        if armed.get() && !entered.replace(true) {
            let v = fused(&mut independent, 0, &mut Context::catalog());
            *inner.borrow_mut() = Some(v.value().clone());
        }
        Ok(())
    };
    observe_owner_walk(
        Box::new(move |e, _, _| {
            if e == "ft1-selected-row-read" {
                latch.set(true)
            }
        }),
        || outer.select(2, &mut Context::catalog().with_host_control(&mut control)),
    )
    .unwrap()
    .unwrap();
    assert!(entered.get());
    assert_eq!(*inner.borrow(), Some(Value::Null));
    assert!(
        matches!(
            fused(&mut independent, 1, &mut ctx).value(),
            Value::Object(_)
        ),
        "inner frontier advanced exactly once, independent of outer publication"
    );
    for unwind in [false, true] {
        let root = b.root(&mut ctx).unwrap();
        let mut w = root.children(&mut ctx).unwrap().unwrap();
        let armed = Rc::new(Cell::new(false));
        let latch = armed.clone();
        let host = host_error();
        let mut control = |_| {
            if armed.get() {
                if unwind {
                    std::panic::panic_any(71_u32)
                } else {
                    return Err(host.clone());
                }
            }
            Ok(())
        };
        let result = catch_unwind(AssertUnwindSafe(|| {
            observe_owner_walk(
                Box::new(move |e, _, _| {
                    if e == "ft1-selected-row-read" {
                        latch.set(true)
                    }
                }),
                || w.select(2, &mut Context::catalog().with_host_control(&mut control)),
            )
        }));
        if unwind {
            assert_eq!(
                result.err().expect("original panic").downcast_ref::<u32>(),
                Some(&71)
            );
        } else {
            assert_eq!(result.unwrap().err().unwrap(), host.from_host());
        }
        let calls = Cell::new(0);
        let mut later = |_| {
            calls.set(calls.get() + 1);
            Ok(())
        };
        assert!(w
            .select(0, &mut Context::catalog().with_host_control(&mut later))
            .unwrap()
            .is_none());
        assert_eq!(
            calls.get(),
            0,
            "caught failure cannot resume with callbacks"
        );
    }
    // Source-bound: select requires an exclusive &mut FusedChildren. Child
    // return lifetimes borrow only binding/owner, not that mutable frontier.
    // No shared epoch exists in this producer; no unsafe same-walk alias test.
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! OW1 independent SOURCE ONLY. UNCOMPILED / NATIVE UNEXECUTED.
//! Actual written v2 helpers, physical events and caller consumption.
//! Routing observations alone never establish admission or measured savings.
use super::*;
use crate::engine::ResourceSet;
use std::cell::{Cell, RefCell};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::rc::Rc;

fn json(s: &str) -> Value {
    crate::serialization::read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn input() -> ResourceSet {
    ResourceSet::new(
        json(
            r#"{"$id":"https://ow.test/core","type":"object","default":{"left":[null,{"q/~☃":true},[],7],"right":{"a":false,"b":[1,2]},"empty":{}},"properties":{"x":{"type":"integer"}}}"#,
        ),
        json(r#"{"$id":"https://ow.test/reference","type":"string","default":[]}"#),
        json(r#"{"$id":"https://ow.test/package","type":"boolean","default":null}"#),
        json(r#"{}"#),
        json(r#"{}"#),
    )
}
fn owner() -> CompiledSchema {
    Context::catalog()
        .with_codegen_construction(|ctx| {
            let admitted = admitted_bank::SchemaBank::admit_core(input(), ctx)?;
            CompiledSchema::compile_input_bank(admitted.bank, 0, ctx)
        })
        .unwrap()
}
fn table(o: &CompiledSchema) -> &OwnerLocations {
    o.owner_locations.as_ref().unwrap()
}
fn kids(v: &Value) -> Vec<&Value> {
    match v {
        Value::Object(m) => m.iter().map(|(_, v)| v).collect(),
        Value::Array(v) => v.iter().collect(),
        _ => Vec::new(),
    }
}
fn locate<'a>(
    o: &'a CompiledSchema,
    keys: &[&str],
    ctx: &mut Context<'_>,
) -> (OwnerCursor, &'a Value) {
    let t = table(o);
    let mut cursor = t.root(o, 0, ctx).unwrap().unwrap();
    for key in keys {
        let Value::Object(m) = t.read(o, &cursor, ctx).unwrap().unwrap() else {
            panic!("authored object parent");
        };
        let edge = m.iter().position(|(k, _)| k == &Utf16::from(*key)).unwrap();
        cursor = t.child(o, &cursor, edge, ctx).unwrap().unwrap();
    }
    let value = t.read(o, &cursor, ctx).unwrap().unwrap();
    (cursor, value)
}
fn observed<T>(op: impl FnOnce() -> T) -> (T, Vec<(&'static str, usize, usize)>) {
    let events = Rc::new(RefCell::new(Vec::new()));
    let sink = events.clone();
    let value = observe_owner_walk(
        Box::new(move |e, r, n| sink.borrow_mut().push((e, r, n))),
        op,
    );
    let copy = events.borrow().clone();
    (value, copy)
}
fn observed_structure<T>(op: impl FnOnce() -> T) -> (T, Vec<(&'static str, usize, usize, usize)>) {
    let rows = Rc::new(RefCell::new(Vec::new()));
    let sink = rows.clone();
    let result = admitted_structure::observe_ordered_structure(
        Box::new(move |e, p, i, r| sink.borrow_mut().push((e, p, i, r))),
        op,
    );
    let copy = rows.borrow().clone();
    (result, copy)
}

fn compare_child<'a>(
    o: &'a CompiledSchema,
    parent: &OwnerCursor,
    edge: usize,
    actual: Option<CheckedLocation<'a>>,
    ctx: &mut Context<'_>,
) {
    let t = table(o);
    let original = t.child(o, parent, edge, ctx).unwrap();
    match (actual, original) {
        (Some(a), Some(b)) => {
            assert!(a.cursor().same_location(&b));
            let expected = t.read(o, &b, ctx).unwrap().unwrap();
            assert_eq!(a.read(o, ctx).unwrap(), Some(expected));
            assert!(std::ptr::eq(a.snapshot_for_test().2, expected));
            assert_eq!(
                a.logical_position(o, ctx).unwrap(),
                b.logical_position(o, ctx).unwrap()
            );
        }
        (None, None) => {}
        _ => panic!("ordered/original child disagreement"),
    }
}
fn walk<'a>(
    o: &'a CompiledSchema,
    cursor: &OwnerCursor,
    expected: &'a Value,
    ctx: &mut Context<'_>,
) {
    let checked = table(o).checked(o, cursor, ctx).unwrap().unwrap();
    assert_eq!(checked.read(o, ctx).unwrap(), Some(expected));
    assert!(std::ptr::eq(checked.snapshot_for_test().2, expected));
    let mut ordered = checked.children(ctx).unwrap();
    for (edge, value) in kids(expected).into_iter().enumerate() {
        let child = ordered.child(edge, ctx).unwrap().unwrap();
        assert_eq!(child.read(o, ctx).unwrap(), Some(value));
        let child_cursor = child.cursor().clone();
        compare_child(o, cursor, edge, Some(child), ctx);
        walk(o, &child_cursor, value, ctx);
    }
    assert!(ordered.child(kids(expected).len(), ctx).unwrap().is_none());
}

#[test]
fn ow01_ordered_objects_arrays_scalars_match_original_owner_readback() {
    let o = owner();
    let mut ctx = Context::catalog();
    let root = table(&o).root(&o, 0, &mut ctx).unwrap().unwrap();
    walk(&o, &root, o.schema_value(), &mut ctx);
    for keys in [
        &["default", "left"][..],
        &["default", "right"],
        &["default", "empty"],
    ] {
        let (cursor, value) = locate(&o, keys, &mut ctx);
        walk(&o, &cursor, value, &mut ctx);
    }
    let (left, _) = locate(&o, &["default", "left"], &mut ctx);
    let scalar = table(&o).child(&o, &left, 0, &mut ctx).unwrap().unwrap();
    let mut leaves = table(&o)
        .checked(&o, &scalar, &mut ctx)
        .unwrap()
        .unwrap()
        .children(&mut ctx)
        .unwrap();
    assert!(leaves.child(0, &mut ctx).unwrap().is_none());
}

#[test]
fn ow02_skipped_siblings_and_nested_extents_preserve_requested_order() {
    let o = owner();
    let mut ctx = Context::catalog();
    let (parent, value) = locate(&o, &["default", "left"], &mut ctx);
    assert_eq!(value, &json(r#"[null,{"q/~☃":true},[],7]"#));
    let mut ordered = table(&o)
        .checked(&o, &parent, &mut ctx)
        .unwrap()
        .unwrap()
        .children(&mut ctx)
        .unwrap();
    // Keep arbitrary/original oracle outside optimized observation capture.
    let (selected, events) = observed(|| {
        [0, 2, 3]
            .into_iter()
            .map(|edge| {
                let child = ordered.child(edge, &mut ctx).unwrap().unwrap();
                assert_eq!(child.snapshot_for_test().2, kids(value)[edge]);
                (edge, child)
            })
            .collect::<Vec<_>>()
    });
    assert_eq!(selected.len(), 3);
    for (edge, child) in selected {
        compare_child(&o, &parent, edge, Some(child), &mut ctx);
    }
    assert_eq!(
        events
            .iter()
            .filter(|(e, _, _)| *e == "ow1-child-publication")
            .count(),
        3
    );

    // Separate original and optimized captures; the literal shape above fixes
    // physical preorder: array,parent+1(null),+2(object),+3(bool),+4([]),+5(7).
    let (_, oracle) = observed_structure(|| {
        for edge in [0, 2, 3] {
            table(&o)
                .child(&o, &parent, edge, &mut ctx)
                .unwrap()
                .unwrap();
        }
    });
    let originals: Vec<_> = oracle
        .iter()
        .filter(|(e, _, _, _)| *e == "ow1-original-selected-read")
        .copied()
        .collect();
    assert_eq!(originals.len(), 3);
    let physical_parent = originals[0].1;
    let expected_rows = [
        physical_parent + 1,
        physical_parent + 4,
        physical_parent + 5,
    ];
    assert_eq!(
        originals
            .iter()
            .map(|r| (r.1, r.2, r.3))
            .collect::<Vec<_>>(),
        vec![
            (physical_parent, 0, expected_rows[0]),
            (physical_parent, 2, expected_rows[1]),
            (physical_parent, 3, expected_rows[2])
        ]
    );
    assert_eq!(
        oracle
            .iter()
            .filter(|(e, _, _, _)| *e == "ow1-original-extent-advance")
            .map(|r| r.2)
            .collect::<Vec<_>>(),
        vec![0, 1, 0, 1, 2]
    );
    let mut fresh = table(&o)
        .checked(&o, &parent, &mut ctx)
        .unwrap()
        .unwrap()
        .children(&mut ctx)
        .unwrap();
    let (_, optimized) = observed_structure(|| {
        for edge in [0, 2, 3] {
            fresh.child(edge, &mut ctx).unwrap().unwrap();
        }
    });
    assert!(!optimized
        .iter()
        .any(|(e, _, _, _)| e.starts_with("ow1-original-")));
    assert_eq!(
        optimized
            .iter()
            .filter(|(e, _, _, _)| *e == "ow1-ordered-selected-read")
            .map(|r| (r.1, r.2, r.3))
            .collect::<Vec<_>>(),
        vec![
            (physical_parent, 0, expected_rows[0]),
            (physical_parent, 2, expected_rows[1]),
            (physical_parent, 3, expected_rows[2])
        ]
    );
    for event in ["ow1-ordered-extent-read", "ow1-ordered-extent-advance"] {
        assert_eq!(
            optimized
                .iter()
                .filter(|r| r.0 == event)
                .map(|r| (r.1, r.2, r.3))
                .collect::<Vec<_>>(),
            vec![(physical_parent, 1, physical_parent + 2)],
            "only unvisited sibling1 crossed; no prefix rescan"
        );
    }
    let mut independent = table(&o)
        .checked(&o, &parent, &mut ctx)
        .unwrap()
        .unwrap()
        .children(&mut ctx)
        .unwrap();
    let (child, independent_events) =
        observed_structure(|| independent.child(0, &mut ctx).unwrap());
    compare_child(&o, &parent, 0, child, &mut ctx);
    assert!(!independent_events
        .iter()
        .any(|r| r.0 == "ow1-ordered-extent-advance"));
    assert!(independent_events
        .iter()
        .any(|r| r.0 == "ow1-ordered-selected-read"
            && (r.1, r.2, r.3) == (physical_parent, 0, physical_parent + 1)));
}

#[test]
fn ow03_root_catalogue_aliases_keep_distinct_logical_identity() {
    let o = owner();
    let mut ctx = Context::catalog();
    let t = table(&o);
    let root = t.root(&o, 0, &mut ctx).unwrap().unwrap();
    let alias = t.root(&o, 1, &mut ctx).unwrap().unwrap();
    let a = t.checked(&o, &root, &mut ctx).unwrap().unwrap();
    let b = t.checked(&o, &alias, &mut ctx).unwrap().unwrap();
    let (ra, na, va) = a.snapshot_for_test();
    let (rb, nb, vb) = b.snapshot_for_test();
    assert_eq!((ra, rb), (0, 1));
    assert_ne!(na, nb);
    assert!(!root.same_location(&alias));
    assert!(
        std::ptr::eq(va, vb),
        "actual bank aliases same physical Core root"
    );
    assert_eq!(a.logical_position(&o, &mut ctx).unwrap(), Some((0, na)));
    assert_eq!(b.logical_position(&o, &mut ctx).unwrap(), Some((1, nb)));
    let mut aw = a.children(&mut ctx).unwrap();
    let mut bw = b.children(&mut ctx).unwrap();
    let aa = aw.child(0, &mut ctx).unwrap().unwrap();
    let bb = bw.child(0, &mut ctx).unwrap().unwrap();
    assert_eq!(aa.snapshot_for_test().0, 0);
    assert_eq!(bb.snapshot_for_test().0, 1);
    assert!(!aa.cursor().same_location(bb.cursor()));
    assert!(std::ptr::eq(
        aa.snapshot_for_test().2,
        bb.snapshot_for_test().2
    ));
    let expected = std::iter::once(o.schema_value())
        .chain(o.catalogue_entries().iter().map(|(_, v)| v))
        .map(|v| {
            fn count(v: &Value) -> usize {
                1 + kids(v).into_iter().map(count).sum::<usize>()
            }
            count(v)
        })
        .sum::<usize>();
    assert_eq!(
        t.logical_node_count(),
        expected,
        "logical aliases count repeatedly, not unique storage"
    );
}

#[test]
fn ow04_nonmonotone_arbitrary_and_invalid_access_use_original_fallback() {
    let o = owner();
    let mut ctx = Context::catalog();
    let (p, _) = locate(&o, &["default", "left"], &mut ctx);
    let mut a = table(&o)
        .checked(&o, &p, &mut ctx)
        .unwrap()
        .unwrap()
        .children(&mut ctx)
        .unwrap();
    for edge in [2, 0, 2, 1, 3, 4, usize::MAX] {
        let (actual, events) = observed(|| a.child(edge, &mut ctx).unwrap());
        compare_child(&o, &p, edge, actual, &mut ctx);
        if edge == 0 {
            assert!(events.iter().any(|(e, _, _)| *e == "ow1-original-fallback"));
        }
    }
    // New same-parent walker and same-owner DIFFERENT parent have independent
    // frontiers; neither inherits the first walker's consumed edge/extent.
    let mut fork = table(&o)
        .checked(&o, &p, &mut ctx)
        .unwrap()
        .unwrap()
        .children(&mut ctx)
        .unwrap();
    compare_child(&o, &p, 0, fork.child(0, &mut ctx).unwrap(), &mut ctx);
    let (q, _) = locate(&o, &["default", "right"], &mut ctx);
    let mut other = table(&o)
        .checked(&o, &q, &mut ctx)
        .unwrap()
        .unwrap()
        .children(&mut ctx)
        .unwrap();
    compare_child(&o, &q, 0, other.child(0, &mut ctx).unwrap(), &mut ctx);
    compare_child(&o, &p, 1, fork.child(1, &mut ctx).unwrap(), &mut ctx);
    compare_child(&o, &q, 1, other.child(1, &mut ctx).unwrap(), &mut ctx);
}

#[test]
fn ow05_foreign_owner_moves_and_effective_limits_preserve_eligibility() {
    let o = owner();
    let foreign = owner();
    let mut ctx = Context::catalog();
    let (p, _) = locate(&o, &["default", "left"], &mut ctx);
    let a = table(&o).checked(&o, &p, &mut ctx).unwrap().unwrap();
    assert!(a.read(&foreign, &mut ctx).unwrap().is_none());
    assert!(table(&foreign)
        .checked(&foreign, &p, &mut ctx)
        .unwrap()
        .is_none());
    match Context::with_limits(crate::context::ResourceProfile::HardIsolated, ctx.limits()) {
        Err(error) => assert_eq!(
            error,
            EngineError::new(
                "RESOURCE_PROFILE_UNAVAILABLE",
                Utf16::default(),
                "HardIsolated resource profile is unavailable"
            )
        ),
        Ok(_) => panic!("original HardIsolated constructor must refuse"),
    }
    let limits = crate::context::Limits {
        max_depth: ctx.limits().max_depth - 1,
        ..ctx.limits()
    };
    let mut changed =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    assert!(a.read(&o, &mut changed).unwrap().is_none());
    let fresh = table(&o).checked(&o, &p, &mut ctx).unwrap().unwrap();
    let mut walker = fresh.children(&mut ctx).unwrap();
    let actual = walker.child(0, &mut changed).unwrap();
    compare_child(&o, &p, 0, actual, &mut changed);
    drop(a); // Genuine borrow ends before move; no unsafe lifetime escape.
    let moved = o;
    let (p, value) = locate(&moved, &["default", "right"], &mut ctx);
    assert_eq!(
        table(&moved)
            .checked(&moved, &p, &mut ctx)
            .unwrap()
            .unwrap()
            .read(&moved, &mut ctx)
            .unwrap(),
        Some(value)
    );
}

#[test]
fn ow06_policy_dialect_reference_and_nested_id_keep_original_first_error() {
    for text in [
        r##"{"$id":"https://ow.test/root","$dynamicAnchor":"tree","type":"object","properties":{"x":{"$dynamicRef":"#tree"}}}"##,
        r#"{"$id":"https://ow.test/root","properties":{"x":{"$schema":7,"type":7}}}"#,
        r#"{"$id":"https://ow.test/root","properties":{"x":{"$schema":"https://ow.test/unknown","type":7}}}"#,
        r##"{"$id":"https://ow.test/root","$defs":{"inner":{"$id":"nested","type":"integer"}},"$ref":"#/$defs/inner"}"##,
        r#"{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"x":{"type":"string"}}}"#,
    ] {
        let schema = json(text);
        let original = CompiledSchema::compile(
            &schema,
            &SchemaResources::default(),
            &mut Context::catalog(),
        );
        let actual = Context::catalog().with_codegen_construction(|ctx| {
            CompiledSchema::compile(&schema, &SchemaResources::default(), ctx)
        });
        match (actual, original) {
            (Err(a), Err(b)) => assert_eq!(a, b),
            (Ok(a), Ok(b)) => {
                for sample in [Value::Null, json(r#"{"x":false}"#)] {
                    assert_eq!(
                        a.validate(&sample, &mut Context::catalog()),
                        b.validate(&sample, &mut Context::catalog())
                    );
                }
            }
            _ => panic!("actual compiler policy/ref/dialect parity"),
        }
    }
}

#[test]
fn ow07_actual_preflight_and_evaluator_consume_checked_children() {
    let o = owner();
    let raw = CompiledSchema::compile(
        o.schema_value(),
        &SchemaResources::default(),
        &mut Context::catalog(),
    )
    .unwrap();
    for sample in [json(r#"{"x":1}"#), json(r#"{"x":false}"#)] {
        assert_eq!(
            o.validate(&sample, &mut Context::catalog()),
            raw.validate(&sample, &mut Context::catalog())
        );
    }
    let source = json(r#"{"properties":{"a/~":{"type":"integer"}}}"#);
    let mut ctx = Context::catalog();
    let py = crate::python_value::python_from_core_value(&source, &mut ctx).unwrap();
    let compiled = CompiledSchema::compile_python_source(
        &py,
        &crate::python_value::PythonSchemaResources::default(),
        false,
        PythonReVersion::V3_14,
        &mut ctx,
    )
    .unwrap();
    let value =
        crate::python_value::python_from_core_value(&json(r#"{"a/~":false}"#), &mut ctx).unwrap();
    value.admit(&mut ctx).unwrap();
    let outcome = compiled
        .compiled
        .evaluate_instance_with_mode(&value, EvaluationMode::AllErrors, &mut ctx)
        .unwrap();
    assert!(outcome.terminal_error.is_none());
    assert_eq!(outcome.errors.len(), 1);
    assert_eq!(
        outcome.errors[0].instance_path,
        Utf16::from("/~p00006100002f00007e")
    );
    assert!(ctx.evaluation_paths.is_none());
    let fresh = owner();
    let (target_cursor, _) = locate(&fresh, &["properties", "x"], &mut Context::catalog());
    let target = target_cursor
        .logical_position(&fresh, &mut Context::catalog())
        .unwrap()
        .unwrap();
    let path = schema_origin_path(fresh.schema_value());
    let scope = schema_id(fresh.schema_value()).unwrap();
    let mut preflight_ctx = Context::catalog();
    let root = table(&fresh).root(&fresh, 0, &mut preflight_ctx).unwrap();
    // Observe ONLY this known owner's preflight invocation: compiling an owner
    // in the same capture would mix its meta-validator's logical coordinates.
    let (result, events) = observed(|| {
        fresh.preflight_located(
            fresh.schema_value(),
            &path,
            &scope,
            0,
            fresh.root_keyword_policy,
            &mut preflight_ctx,
            &mut BTreeSet::new(),
            root,
        )
    });
    result.unwrap();
    // Views-backed owners route through FT1 and report the borrowed consumer.
    assert!(events.iter().any(|r| {
        (r.0 == "ow1-preflight-consume" || r.0 == "ft1-preflight-borrowed-consume")
            && (r.1, r.2) == target
    }));
    let sample = json(r#"{"x":false}"#);
    let (actual, events) = observed(|| fresh.validate(&sample, &mut Context::catalog()));
    assert_eq!(actual, raw.validate(&sample, &mut Context::catalog()));
    assert!(events
        .iter()
        .any(|r| r.0 == "ow1-node-plan-consume" && (r.1, r.2) == target));
}

#[test]
fn ow08_new_state_denials_preserve_first_host_error_and_no_publication() {
    let o = owner();
    let mut ctx = Context::catalog();
    let (parent, _) = locate(&o, &["default", "left"], &mut ctx);
    for operation in 0..3 {
        let run = |ctx: &mut Context<'_>| -> Result<(), EngineError> {
            let checked = table(&o).checked(&o, &parent, ctx)?;
            let Some(checked) = checked else {
                panic!("genuine child parent");
            };
            if operation > 0 {
                let mut w = checked.children(ctx)?;
                if operation > 1 {
                    w.child(2, ctx)?;
                }
            }
            Ok(())
        };
        let calls = Cell::new(0);
        let mut meter = |_| {
            calls.set(calls.get() + 1);
            Ok(())
        };
        run(&mut Context::catalog().with_host_control(&mut meter)).unwrap();
        let total = calls.get();
        assert!(total > 0);
        for denial in 1..=total {
            let count = Cell::new(0);
            let at = Cell::new(usize::MAX);
            let events = Rc::new(RefCell::new(Vec::new()));
            let sink = events.clone();
            let first = EngineError::new(
                "OW_FIRST",
                Utf16::new(vec![47, 0xd800]),
                "distinct host refusal",
            );
            let mut stop = |_| {
                count.set(count.get() + 1);
                if count.get() == denial {
                    at.set(events.borrow().len());
                    Err(first.clone())
                } else {
                    Ok(())
                }
            };
            let actual = observe_owner_walk(
                Box::new(move |e, r, n| sink.borrow_mut().push((e, r, n))),
                || run(&mut Context::catalog().with_host_control(&mut stop)),
            );
            assert_eq!(actual.unwrap_err(), first.from_host());
            assert_eq!(count.get(), denial);
            assert_eq!(
                events.borrow().len(),
                at.get(),
                "effect/observation after terminal denial"
            );
        }
    }
    // Caller retains walker to inspect post-error poisoning, with a NEW Context
    // for the subsequent explicit request (not work after denial in one call).
    let checked = table(&o).checked(&o, &parent, &mut ctx).unwrap().unwrap();
    let mut w = checked.children(&mut ctx).unwrap();
    let mut stop = |_| Err(EngineError::new("STOP", Utf16::default(), "stop"));
    assert!(w
        .child(0, &mut Context::catalog().with_host_control(&mut stop))
        .is_err());
    assert!(w.child(0, &mut Context::catalog()).unwrap().is_none());
    let mut postselect = table(&o)
        .checked(&o, &parent, &mut ctx)
        .unwrap()
        .unwrap()
        .children(&mut ctx)
        .unwrap();
    let committed = Rc::new(Cell::new(false));
    let latch = committed.clone();
    let first = EngineError::new("POST_SELECT", Utf16::from("/first"), "outer wrapper denied");
    let calls = Cell::new(0);
    let mut control = |_| {
        calls.set(calls.get() + 1);
        if committed.get() {
            Err(first.clone())
        } else {
            Ok(())
        }
    };
    let (result, events) = observed(|| {
        admitted_structure::observe_ordered_structure(
            Box::new(move |e, _, _, _| {
                if e == "ow1-ordered-frontier-commit" {
                    latch.set(true);
                }
            }),
            || postselect.child(2, &mut Context::catalog().with_host_control(&mut control)),
        )
    });
    assert!(committed.get(), "must reach real inner frontier commit");
    assert_eq!(result.err().unwrap(), first.from_host());
    assert!(!events
        .iter()
        .any(|r| r.0 == "ow1-child-value-read" || r.0 == "ow1-child-publication"));
    let before = calls.get();
    let mut next = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    assert!(postselect
        .child(0, &mut Context::catalog().with_host_control(&mut next))
        .unwrap()
        .is_none());
    assert_eq!(
        calls.get(),
        before,
        "poisoned outer walker returns before control"
    );
    let (_, bound, raw) = table(&o)
        .bound_role(parent.node, &mut ctx)
        .unwrap()
        .unwrap();
    let mut physical = bound
        .view
        .structure
        .ordered_children(raw, &mut ctx)
        .unwrap()
        .unwrap();
    let mut stop = |_| {
        Err(EngineError::new(
            "PHYSICAL",
            Utf16::default(),
            "physical denial",
        ))
    };
    assert!(physical
        .select(0, &mut Context::catalog().with_host_control(&mut stop))
        .is_err());
    let count = Cell::new(0);
    let mut after = |_| {
        count.set(count.get() + 1);
        Ok(())
    };
    assert!(physical
        .select(0, &mut Context::catalog().with_host_control(&mut after))
        .unwrap()
        .is_none());
    assert_eq!(count.get(), 0);
}

#[test]
fn ow09_reentry_error_unwind_and_sibling_restore_custody() {
    let o = Rc::new(owner());
    let mut ctx = Context::catalog();
    let (p, _) = locate(&o, &["default", "left"], &mut ctx);
    let mut outer = table(&o)
        .checked(&o, &p, &mut ctx)
        .unwrap()
        .unwrap()
        .children(&mut ctx)
        .unwrap();
    let inner_owner = o.clone();
    let once = Rc::new(Cell::new(false));
    let entered = once.clone();
    let result = observe_owner_walk(
        Box::new(move |event, _, _| {
            if event == "ow1-child-value-read" && !entered.replace(true) {
                let mut ctx = Context::catalog();
                let (p, value) = locate(&inner_owner, &["default", "right"], &mut ctx);
                let mut inner = table(&inner_owner)
                    .checked(&inner_owner, &p, &mut ctx)
                    .unwrap()
                    .unwrap()
                    .children(&mut ctx)
                    .unwrap();
                let actual = inner.child(0, &mut ctx).unwrap().unwrap();
                assert_eq!(actual.snapshot_for_test().2, kids(value)[0]);
            }
        }),
        || outer.child(0, &mut ctx).unwrap(),
    );
    assert!(once.get());
    compare_child(&o, &p, 0, result, &mut ctx);
    compare_child(&o, &p, 1, outer.child(1, &mut ctx).unwrap(), &mut ctx);
    let mut independent = table(&o)
        .checked(&o, &p, &mut ctx)
        .unwrap()
        .unwrap()
        .children(&mut ctx)
        .unwrap();
    compare_child(&o, &p, 0, independent.child(0, &mut ctx).unwrap(), &mut ctx);
    let mut unwinding = table(&o)
        .checked(&o, &p, &mut ctx)
        .unwrap()
        .unwrap()
        .children(&mut ctx)
        .unwrap();
    let (_, events) = observed(|| {
        let panic = catch_unwind(AssertUnwindSafe(|| {
            observe_owner_walk(
                Box::new(|e, _, _| {
                    if e == "ow1-child-value-read" {
                        panic!("after physical select before checked child publication");
                    }
                }),
                || unwinding.child(0, &mut ctx),
            )
        }));
        assert!(panic.is_err());
        // Observer nesting restored: a fresh sibling walk remains genuine.
        let mut fresh = table(&o)
            .checked(&o, &p, &mut ctx)
            .unwrap()
            .unwrap()
            .children(&mut ctx)
            .unwrap();
        compare_child(&o, &p, 0, fresh.child(0, &mut ctx).unwrap(), &mut ctx);
    });
    assert!(events.iter().any(|(e, _, _)| *e == "ow1-child-publication"));

    let calls = Cell::new(0);
    let mut after = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    assert!(unwinding
        .child(0, &mut Context::catalog().with_host_control(&mut after))
        .unwrap()
        .is_none());
    assert_eq!(calls.get(), 0, "unwind must poison retained outer walker");
    let mut postselect = table(&o)
        .checked(&o, &p, &mut ctx)
        .unwrap()
        .unwrap()
        .children(&mut ctx)
        .unwrap();
    let committed = Rc::new(Cell::new(false));
    let latch = committed.clone();
    let mut panic_control = |_| {
        if committed.get() {
            panic!("outer debit after physical commit");
        }
        Ok(())
    };
    let result = catch_unwind(AssertUnwindSafe(|| {
        admitted_structure::observe_ordered_structure(
            Box::new(move |e, _, _, _| {
                if e == "ow1-ordered-frontier-commit" {
                    latch.set(true);
                }
            }),
            || {
                postselect.child(
                    2,
                    &mut Context::catalog().with_host_control(&mut panic_control),
                )
            },
        )
    }));
    assert!(result.is_err());
    assert!(committed.get());
    let calls = Cell::new(0);
    let mut after = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    assert!(postselect
        .child(0, &mut Context::catalog().with_host_control(&mut after))
        .unwrap()
        .is_none());
    assert_eq!(calls.get(), 0);
    let (_, bound, raw) = table(&o).bound_role(p.node, &mut ctx).unwrap().unwrap();
    let mut physical = bound
        .view
        .structure
        .ordered_children(raw, &mut ctx)
        .unwrap()
        .unwrap();
    let result = catch_unwind(AssertUnwindSafe(|| {
        admitted_structure::observe_ordered_structure(
            Box::new(|e, _, _, _| {
                if e == "ow1-ordered-frontier-commit" {
                    panic!("physical commit observer unwind");
                }
            }),
            || physical.select(0, &mut ctx),
        )
    }));
    assert!(result.is_err());
    assert!(physical
        .select(0, &mut Context::catalog().with_host_control(&mut after))
        .unwrap()
        .is_none());
    assert_eq!(calls.get(), 0);
}

#[test]
fn ow10_genuine_nodeplan_hits_keep_readback_without_ancestor_authority() {
    let o = owner();
    let mut ctx = Context::catalog();
    let (p, node) = locate(&o, &["properties", "x"], &mut ctx);
    let checked = table(&o).checked(&o, &p, &mut ctx).unwrap().unwrap();
    assert!(std::ptr::eq(
        checked.read(&o, &mut ctx).unwrap().unwrap(),
        node
    ));
    let plans = o.owner_plans.as_ref().unwrap();
    let a = plans
        .node_at(
            &o,
            node,
            &Utf16::from("#/properties/x"),
            true,
            Some(checked.cursor()),
            &mut ctx,
        )
        .unwrap()
        .unwrap();
    let (b, events) = observed(|| {
        plans
            .node_at(
                &o,
                node,
                &Utf16::from("#/properties/x"),
                true,
                Some(checked.cursor()),
                &mut ctx,
            )
            .unwrap()
            .unwrap()
    });
    assert!(Arc::ptr_eq(&a, &b));
    let consume = events
        .iter()
        .position(|r| r.0 == "ow1-node-plan-consume")
        .expect("actual checked NodePlan consumer");
    assert!(
        events[..consume]
            .iter()
            .any(|r| r.0 == "ow1-original-ancestor-hop"),
        "initial checked custody still admits original read"
    );
    assert!(
        !events[consume + 1..]
            .iter()
            .any(|r| r.0 == "ow1-original-ancestor-hop"),
        "no repeated ancestor walk after actual checked consumption"
    );
    // Fused (FT1) routing replaces the legacy checked-read probe with the
    // node-plan hit-after-readback probe; either proves owner readback.
    assert!(events[consume + 1..]
        .iter()
        .any(|r| r.0 == "ow1-checked-read" || r.0 == "ft1-node-plan-hit-after-readback"));
    let position = p.logical_position_for_test(&o, &mut ctx).unwrap();
    assert_eq!(position.map(|(root, _)| root), Some(0));
    assert_eq!(checked.read(&o, &mut ctx).unwrap(), Some(node));
    assert_eq!(
        checked.logical_position(&o, &mut ctx).unwrap(),
        position
    );
    let other = plans
        .node_at(
            &o,
            node,
            &Utf16::from("#/properties/x"),
            false,
            Some(checked.cursor()),
            &mut ctx,
        )
        .unwrap()
        .unwrap();
    assert!(!Arc::ptr_eq(&a, &other));
    let foreign = owner();
    assert!(plans
        .node_at(
            &foreign,
            foreign.schema_value(),
            &Utf16::from("#"),
            true,
            Some(checked.cursor()),
            &mut ctx
        )
        .unwrap()
        .is_none());
    // A bank-compiled owner publishes its root both as the schema and as
    // catalogue role 0, so a bare root *value* is ambiguous: the original
    // value-addressed path must refuse (None) rather than guess a role, and it
    // must do so without any unguarded ancestor walk.
    let (resolved, original) = observed(|| {
        plans
            .node(&o, o.schema_value(), &Utf16::from("#"), true, &mut ctx)
            .unwrap()
    });
    assert!(resolved.is_none());
    assert!(!original.iter().any(|r| r.0 == "ow1-original-ancestor-hop"));

    // Preserve the actual legacy ancestry/readback obligation through the
    // explicit cursor. A nested node value is not an owner root lookup.
    let (legacy, ancestry) = observed(|| table(&o).read(&o, &p, &mut ctx).unwrap().unwrap());
    assert!(std::ptr::eq(legacy, node));
    assert!(ancestry.iter().any(|r| r.0 == "ow1-original-ancestor-hop"));
}

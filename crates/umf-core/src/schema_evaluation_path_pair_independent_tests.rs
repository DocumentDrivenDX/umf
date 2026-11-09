// SPDX-License-Identifier: MIT OR Apache-2.0
//! PH1 arena API ONLY. SOURCE ONLY / UNCOMPILED / NATIVE UNEXECUTED.
//! H Context/evaluator/reference/branch bridges are deliberately not claimed here.
use super::*;
use std::cell::{Cell, RefCell};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::rc::Rc;
type Arena = Rc<RefCell<EvaluationPaths>>;
static STATIC_ROOT: &[u16] = &[35, 111, 116, 104, 101, 114];
fn arena(ctx: &mut Context<'_>) -> Arena {
    EvaluationPaths::new_tracked(ctx).unwrap()
}
fn root(a: &Arena, text: &str, ctx: &mut Context<'_>) -> EvaluationPathPair {
    EvaluationPaths::root_pair(a, Utf16::from(text), ctx).unwrap()
}
fn entry(p: &EvaluationPathPair) -> usize {
    p.handle
        .as_ref()
        .expect("actual API minted tracked pair")
        .entry
}
fn verify(a: &Arena, p: &EvaluationPathPair) {
    let b = a.borrow();
    let t = b.tracked.as_ref().unwrap();
    let (i, depth) = t.parent(p).expect("actual minted pair in original arena");
    let e = &t.entries[i];
    assert_eq!(*e.text.text(), *p.text());
    assert_eq!(e.depth, depth);
}
fn state(a: &Arena) -> (usize, usize, usize, usize) {
    let b = a.borrow();
    if let Some(t) = &b.tracked {
        (
            t.entries.len(),
            t.children.len(),
            t.units,
            t.entries.iter().filter(|e| e.parent.is_none()).count(),
        )
    } else {
        (0, 0, 0, 0)
    }
}
fn contents(a: &Arena) -> Vec<(Utf16, Option<usize>, u8, usize)> {
    let b = a.borrow();
    b.tracked
        .as_ref()
        .map(|t| {
            t.entries
                .iter()
                .map(|e| (e.text.clone(), e.parent, e.kind, e.depth))
                .collect()
        })
        .unwrap_or_default()
}
fn original(p: &Utf16, s: &Utf16, kind: PathKind) -> Utf16 {
    match kind {
        PathKind::InstancePointer => append_instance_path(p, s),
        PathKind::SchemaPointer => append_schema_pointer(p, s),
        PathKind::RawSchemaStep => {
            append_schema_path(p, &s.to_utf8().expect("actual UTF8 RawSchemaStep domain"))
        }
    }
}
fn append(
    a: &Arena,
    p: &EvaluationPathPair,
    s: &str,
    kind: PathKind,
    ctx: &mut Context<'_>,
) -> EvaluationPathPair {
    EvaluationPaths::append_pair(a, p, &Utf16::from(s), kind, ctx).unwrap()
}
fn host_error() -> EngineError {
    let mut e = EngineError::new(
        "PH1_HOST",
        Utf16::new(vec![35, 47, 0xd800]),
        "first carried-pair refusal",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("pair-host-δ"));
    e.with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference)
}
fn check_host(e: &EngineError) {
    let h = host_error();
    assert_eq!(e.code, h.code);
    assert_eq!(e.path, h.path);
    assert_eq!(e.message, h.message);
    assert_eq!(e.python_message_origin, h.python_message_origin);
    assert!(e.is_control_failure());
    assert!(!e.is_python_schema_terminal());
}
fn setup(operation: usize) -> (Arena, EvaluationPathPair) {
    let mut ctx = Context::ordinary();
    let a = arena(&mut ctx);
    let p = root(&a, "#base", &mut ctx);
    if operation == 3 {
        append(&a, &p, "x", PathKind::InstancePointer, &mut ctx);
    }
    (a, p)
}
fn perform(
    operation: usize,
    a: &Arena,
    p: &EvaluationPathPair,
    ctx: &mut Context<'_>,
    event: &mut dyn FnMut(&'static str),
) -> Result<(), EngineError> {
    match operation {
        0 => EvaluationPaths::new_tracked_inner(ctx, event).map(|_| ()),
        1 => EvaluationPaths::root_pair_inner(a, Utf16::from_static_units(STATIC_ROOT), ctx, event)
            .map(|_| ()),
        2 | 3 => EvaluationPaths::append_pair_inner(
            a,
            p,
            &Utf16::from("x"),
            PathKind::InstancePointer,
            ctx,
            event,
        )
        .map(|_| ()),
        4 => p.clone_with_events(ctx, event).map(|_| ()),
        _ => unreachable!(),
    }
}
fn probe(operation: usize) -> (Vec<usize>, Vec<(usize, &'static str)>) {
    let (a, p) = setup(operation);
    let calls = Cell::new(0usize);
    let amounts = RefCell::new(Vec::new());
    let events = RefCell::new(Vec::new());
    let mut control = |amount| {
        assert!(
            a.try_borrow_mut().is_ok(),
            "arena borrow across host control"
        );
        calls.set(calls.get() + 1);
        amounts.borrow_mut().push(amount);
        Ok(())
    };
    perform(
        operation,
        &a,
        &p,
        &mut Context::ordinary().with_host_control(&mut control),
        &mut |e| events.borrow_mut().push((calls.get(), e)),
    )
    .unwrap();
    (amounts.into_inner(), events.into_inner())
}

#[test]
fn ph01_admitted_root_controlled_clone_and_default_do_not_mint_caller_authority() {
    let mut ctx = Context::ordinary();
    let mut events = Vec::new();
    let a = EvaluationPaths::new_tracked_inner(&mut ctx, &mut |e| events.push(e)).unwrap();
    assert_eq!(events, vec!["path-arena-construction"]);
    assert_eq!(state(&a), (0, 0, 0, 0));
    events.clear();
    let p =
        EvaluationPaths::root_pair_inner(&a, Utf16::from("#"), &mut ctx, &mut |e| events.push(e))
            .unwrap();
    assert_eq!(p.text(), &Utf16::from("#"));
    verify(&a, &p);
    assert_eq!(state(&a), (1, 0, 1, 1));
    assert_eq!(events, vec!["path-root-read", "path-root-publication"]);
    let before = ctx.charged_work();
    events.clear();
    let q = p
        .clone_with_events(&mut ctx, &mut |e| events.push(e))
        .unwrap();
    assert_eq!(events, vec!["path-pair-clone"]);
    assert!(ctx.charged_work() > before);
    assert_eq!(q.text(), p.text());
    assert_eq!(entry(&p), entry(&q));
    verify(&a, &q);
    assert_eq!(state(&a), (1, 0, 1, 1));
    let before = ctx.charged_work();
    let clone = p.clone_with_context(&mut ctx).unwrap();
    assert_eq!(clone.text(), p.text());
    assert!(ctx.charged_work() > before);
    let plain = Rc::new(RefCell::new(EvaluationPaths::default()));
    let untracked = EvaluationPaths::root_pair(&plain, Utf16::from("#"), &mut ctx).unwrap();
    assert!(untracked.handle.is_none());
    assert!(plain.borrow().tracked.is_none());
    let child = append(&plain, &untracked, "x", PathKind::SchemaPointer, &mut ctx);
    assert_eq!(child.text(), &Utf16::from("#/x"));
    assert!(child.handle.is_none());
    assert!(plain.borrow().tracked.is_none());
    let bare = EvaluationPathPair::untracked(Utf16::from("#"), &mut ctx).unwrap();
    let paid = ctx.charged_work();
    let bare_clone = bare.clone_with_context(&mut ctx).unwrap();
    assert!(bare_clone.handle.is_none());
    assert_eq!(bare_clone.text(), bare.text());
    assert!(ctx.charged_work() > paid);
    let before = state(&a);
    let from_bare = append(&a, &bare, "x", PathKind::SchemaPointer, &mut ctx);
    assert!(from_bare.handle.is_none());
    assert_eq!(from_bare.text(), &Utf16::from("#/x"));
    assert_eq!(state(&a), before);
}

#[test]
fn ph02_carried_parent_chain_and_repeat_hit_do_not_readmit_root_or_key_parent_text() {
    let mut ctx = Context::ordinary();
    let a = arena(&mut ctx);
    let p = root(&a, "#", &mut ctx);
    let mut events = Vec::new();
    let child = EvaluationPaths::append_pair_inner(
        &a,
        &p,
        &Utf16::from("a/~"),
        PathKind::SchemaPointer,
        &mut ctx,
        &mut |e| events.push(e),
    )
    .unwrap();
    assert_eq!(child.text(), &Utf16::from("#/a~1~0"));
    verify(&a, &child);
    assert_eq!(
        events
            .iter()
            .filter(|e| **e == "path-output-allocation-and-write")
            .count(),
        1
    );
    assert_eq!(
        events
            .iter()
            .filter(|e| **e == "path-output-move-to-shared")
            .count(),
        1
    );
    let grandchild = append(&a, &child, "0", PathKind::InstancePointer, &mut ctx);
    assert_eq!(grandchild.text(), &Utf16::from("#/a~1~0/0"));
    verify(&a, &grandchild);
    let before = state(&a);
    assert_eq!((before.0, before.1, before.3), (3, 2, 1));
    events.clear();
    let paid = ctx.charged_work();
    let repeated = EvaluationPaths::append_pair_inner(
        &a,
        &p,
        &Utf16::from("a/~"),
        PathKind::SchemaPointer,
        &mut ctx,
        &mut |e| events.push(e),
    )
    .unwrap();
    assert_eq!(entry(&repeated), entry(&child));
    assert_eq!(repeated.text(), child.text());
    assert_eq!(state(&a), before);
    assert!(ctx.charged_work() > paid);
    assert_eq!(
        events,
        vec![
            "path-parent-read",
            "path-transition-lookup",
            "path-transition-hit"
        ]
    );
    let b = a.borrow();
    let t = b.tracked.as_ref().unwrap();
    assert_eq!(t.entries[entry(&child)].parent, Some(entry(&p)));
    assert_eq!(t.entries[entry(&grandchild)].parent, Some(entry(&child)));
    assert_eq!(t.entries[entry(&p)].depth, 0);
    assert_eq!(t.entries[entry(&child)].depth, 1);
    assert_eq!(t.entries[entry(&grandchild)].depth, 2);
    // Readback of actual published keys, not a test eligibility implementation.
    assert!(
        t.children
            .keys()
            .any(|(parent, segment, kind)| *parent == entry(&p)
                && *segment == Utf16::from("a/~")
                && *kind == 1)
    );
}

#[test]
fn ph03_equal_text_different_origins_foreign_and_stale_pairs_cannot_replay_tracking() {
    let mut ctx = Context::ordinary();
    let a = arena(&mut ctx);
    let b = arena(&mut ctx);
    let p = root(&a, "same", &mut ctx);
    let q = root(&b, "same", &mut ctx);
    assert_eq!(p.text(), q.text());
    assert_eq!(entry(&p), entry(&q));
    let before = state(&b);
    let mut events = Vec::new();
    let foreign = EvaluationPaths::append_pair_inner(
        &b,
        &p,
        &Utf16::from("x"),
        PathKind::InstancePointer,
        &mut ctx,
        &mut |e| events.push(e),
    )
    .unwrap();
    assert!(foreign.handle.is_none());
    assert_eq!(foreign.text(), &Utf16::from("same/x"));
    assert_eq!(state(&b), before);
    assert!(!events.contains(&"path-transition-lookup"));
    assert!(!events.contains(&"path-transition-publication"));
    let another = root(&a, "same", &mut ctx);
    assert_ne!(entry(&p), entry(&another));
    let first = append(&a, &p, "x", PathKind::InstancePointer, &mut ctx);
    let second = append(&a, &another, "x", PathKind::InstancePointer, &mut ctx);
    assert_eq!(first.text(), second.text());
    assert_ne!(entry(&first), entry(&second));
    verify(&a, &first);
    verify(&a, &second);
    let dropped_arena_pair = {
        let old = arena(&mut ctx);
        root(&old, "same", &mut ctx)
    };
    let fresh = arena(&mut ctx);
    let fresh_root = root(&fresh, "same", &mut ctx);
    let before = state(&fresh);
    assert_eq!(entry(&fresh_root), entry(&dropped_arena_pair));
    let stale = append(
        &fresh,
        &dropped_arena_pair,
        "x",
        PathKind::InstancePointer,
        &mut ctx,
    );
    assert!(stale.handle.is_none());
    assert_eq!(stale.text(), &Utf16::from("same/x"));
    assert_eq!(state(&fresh), before);
}

#[test]
fn ph04_three_kinds_exact_escaped_units_empty_slashes_and_index_spellings() {
    let cases: &[(&[u16], PathKind, &[u16])] = &[
        (
            &[97, 47, 126, 0xd800, 0xd83d, 0xde00],
            PathKind::InstancePointer,
            &[35, 47, 47, 97, 126, 49, 126, 48, 0xd800, 0xd83d, 0xde00],
        ),
        (
            &[97, 47, 126, 0xd800, 0xd83d, 0xde00],
            PathKind::SchemaPointer,
            &[35, 47, 97, 126, 49, 126, 48, 0xd800, 0xd83d, 0xde00],
        ),
        (
            &[97, 47, 126, 0x2603],
            PathKind::RawSchemaStep,
            &[35, 47, 97, 47, 126, 0x2603],
        ),
        (&[], PathKind::InstancePointer, &[35, 47, 47]),
        (&[], PathKind::SchemaPointer, &[35, 47]),
        (&[], PathKind::RawSchemaStep, &[35, 47]),
    ];
    for (units, kind, expected) in cases {
        let mut ctx = Context::ordinary();
        let a = arena(&mut ctx);
        let p = root(&a, "#/", &mut ctx);
        let s = Utf16::new(units.to_vec());
        let result = EvaluationPaths::append_pair(&a, &p, &s, *kind, &mut ctx).unwrap();
        assert_eq!(result.text().units(), *expected);
        assert_eq!(result.text(), &original(p.text(), &s, *kind));
        verify(&a, &result);
    }
    for kind in [
        PathKind::InstancePointer,
        PathKind::SchemaPointer,
        PathKind::RawSchemaStep,
    ] {
        let mut ctx = Context::ordinary();
        let a = arena(&mut ctx);
        let p = root(&a, "", &mut ctx);
        let out = append(&a, &p, "", kind, &mut ctx);
        assert_eq!(out.text().units(), &[47]);
    }
    let mut ctx = Context::ordinary();
    let a = arena(&mut ctx);
    let p = root(&a, "#", &mut ctx);
    let s = append(&a, &p, "a", PathKind::SchemaPointer, &mut ctx);
    let raw = append(&a, &p, "a", PathKind::RawSchemaStep, &mut ctx);
    assert_eq!(s.text(), raw.text());
    assert_ne!(entry(&s), entry(&raw)); // kind is part of actual transition identity
    for index in [0usize, 9, 10, 120, usize::MAX] {
        let text = index.to_string();
        let result = append(&a, &p, &text, PathKind::SchemaPointer, &mut ctx);
        assert_eq!(result.text(), &Utf16::from(format!("#/{index}")));
        assert_eq!(
            result.text(),
            &append_schema_pointer(p.text(), &Utf16::from(text))
        );
    }
}

#[test]
fn ph05_tracking_bounds_and_changed_limits_preserve_valid_plain_text_fallback() {
    for mode in 0..4 {
        let mut limits = crate::context::Limits::ordinary();
        match mode {
            0 => limits.max_values = 0,
            1 => limits.max_values = 1,
            2 => limits.max_depth = 0,
            _ => limits.max_text_units = 1,
        }
        let mut ctx =
            Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
        let a = arena(&mut ctx);
        let p = root(&a, "#", &mut ctx);
        if mode == 0 {
            assert!(p.handle.is_none());
        } else {
            verify(&a, &p);
        }
        let before = state(&a);
        let mut events = Vec::new();
        let result = EvaluationPaths::append_pair_inner(
            &a,
            &p,
            &Utf16::from("x"),
            PathKind::SchemaPointer,
            &mut ctx,
            &mut |e| events.push(e),
        )
        .unwrap();
        assert!(result.handle.is_none());
        assert_eq!(result.text(), &Utf16::from("#/x"));
        assert_eq!(state(&a), before);
        assert!(!events.contains(&"path-transition-publication"));
        assert_eq!(
            events
                .iter()
                .filter(|e| **e == "path-output-allocation-and-write")
                .count(),
            1
        );
    }
    let mut ctx = Context::ordinary();
    let a = arena(&mut ctx);
    let p = root(&a, "#", &mut ctx);
    let before = state(&a);
    let mut limits = crate::context::Limits::ordinary();
    limits.max_values -= 1;
    let mut changed =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let result = append(&a, &p, "x", PathKind::InstancePointer, &mut changed);
    assert!(result.handle.is_none());
    assert_eq!(result.text(), &Utf16::from("#/x"));
    assert_eq!(state(&a), before);
    verify(&a, &p);
}

#[test]
fn ph06_real_output_cost_grows_with_prefix_and_returned_text_owns_its_lifetime() {
    let mut fees = Vec::new();
    for length in [1usize, 256] {
        let mut setup = Context::ordinary();
        let a = arena(&mut setup);
        let p = EvaluationPaths::root_pair(&a, Utf16::new(vec![65; length]), &mut setup).unwrap();
        let calls = Cell::new(0usize);
        let amounts = RefCell::new(Vec::new());
        let seen = RefCell::new(Vec::new());
        let mut control = |amount| {
            assert!(a.try_borrow_mut().is_ok());
            calls.set(calls.get() + 1);
            amounts.borrow_mut().push(amount);
            Ok(())
        };
        let out = EvaluationPaths::append_pair_inner(
            &a,
            &p,
            &Utf16::from("x"),
            PathKind::InstancePointer,
            &mut Context::ordinary().with_host_control(&mut control),
            &mut |e| seen.borrow_mut().push((calls.get(), e)),
        )
        .unwrap();
        assert_eq!(out.text().len(), length + 2);
        assert_eq!(&out.text().units()[length..], &[47, 120]);
        let index = seen
            .borrow()
            .iter()
            .find(|(_, e)| *e == "path-output-allocation-and-write")
            .unwrap()
            .0;
        let fee = amounts.borrow()[index - 1];
        assert!(fee > 0);
        fees.push(fee);
        assert_eq!(
            seen.borrow()
                .iter()
                .filter(|(_, e)| *e == "path-output-move-to-shared")
                .count(),
            1
        );
        verify(&a, &out);
    }
    assert!(fees[1] > fees[0]); // actual prefix/output work, not a fixed/free view
    let mut ctx = Context::ordinary();
    let a = arena(&mut ctx);
    let p = root(&a, "#", &mut ctx);
    let out = append(&a, &p, "x", PathKind::InstancePointer, &mut ctx);
    let before = ctx.charged_work();
    let copy = out.clone_with_context(&mut ctx).unwrap();
    assert!(ctx.charged_work() > before);
    assert_eq!(copy.text(), out.text());
    let weak = Rc::downgrade(&a);
    drop(p);
    drop(a);
    assert!(weak.upgrade().is_none());
    assert_eq!(out.text(), &Utf16::from("#/x"));
    let mut owned = copy.text().clone().into_units();
    owned[0] = 90;
    assert_eq!(copy.text(), &Utf16::from("#/x"));
    assert_eq!(out.text(), copy.text());
}

#[test]
fn ph07_all_actual_small_operation_groups_deny_before_effect_without_partial_authority() {
    let mut reached = Vec::new();
    for operation in 0..5 {
        let (amounts, baseline) = probe(operation);
        for (_, event) in &baseline {
            if !reached.contains(event) {
                reached.push(*event);
            }
        }
        for deny in 1..=amounts.len() {
            let (a, p) = setup(operation);
            let before = state(&a);
            let original_entries = contents(&a);
            let calls = Cell::new(0usize);
            let mut control = |amount| {
                assert!(a.try_borrow_mut().is_ok());
                calls.set(calls.get() + 1);
                assert!(calls.get() <= deny, "callback after first error");
                assert_eq!(amount, amounts[calls.get() - 1]);
                if calls.get() == deny {
                    Err(host_error())
                } else {
                    Ok(())
                }
            };
            let mut ctx = Context::ordinary().with_host_control(&mut control);
            let mut events = Vec::new();
            let error = perform(operation, &a, &p, &mut ctx, &mut |e| {
                events.push((calls.get(), e))
            })
            .unwrap_err();
            check_host(&error);
            assert_eq!(calls.get(), deny);
            assert_eq!(
                ctx.charged_work(),
                amounts[..deny].iter().map(|v| *v as u64).sum::<u64>()
            );
            assert_eq!(
                events,
                baseline
                    .iter()
                    .copied()
                    .filter(|(at, _)| *at < deny)
                    .collect::<Vec<_>>()
            );
            assert_eq!(state(&a), before);
            assert_eq!(contents(&a), original_entries);
            verify(&a, &p);
        }
    }
    for required in [
        "path-arena-construction",
        "path-root-read",
        "path-root-publication",
        "path-parent-read",
        "path-transition-lookup",
        "path-transition-hit",
        "path-suffix-scan",
        "path-output-allocation-and-write",
        "path-output-move-to-shared",
        "path-transition-publication",
        "path-pair-clone",
    ] {
        assert!(reached.contains(&required));
    }
}

#[test]
fn ph08_same_arena_reentry_declines_stale_publication_without_second_output_or_late_work() {
    let (_, baseline) = probe(2);
    for target in [
        "path-transition-lookup",
        "path-output-allocation-and-write",
        "path-transition-publication",
    ] {
        let at = baseline.iter().find(|(_, e)| *e == target).unwrap().0;
        let (a, p) = setup(2);
        let before = state(&a);
        let calls = Cell::new(0usize);
        let nested = Cell::new(false);
        let retained = RefCell::new(None);
        let mut control = |_| {
            assert!(a.try_borrow_mut().is_ok());
            calls.set(calls.get() + 1);
            if calls.get() == at && !nested.replace(true) {
                retained.replace(Some(root(&a, "nested", &mut Context::ordinary())));
            }
            Ok(())
        };
        let mut seen = Vec::new();
        let result = EvaluationPaths::append_pair_inner(
            &a,
            &p,
            &Utf16::from("x"),
            PathKind::InstancePointer,
            &mut Context::ordinary().with_host_control(&mut control),
            &mut |e| seen.push((calls.get(), e)),
        )
        .unwrap();
        assert!(nested.get());
        assert!(result.handle.is_none());
        assert_eq!(result.text(), &Utf16::from("#base/x"));
        assert_eq!((state(&a).0, state(&a).1), (before.0 + 1, before.1));
        verify(&a, &p);
        verify(&a, retained.borrow().as_ref().unwrap());
        for event in [
            "path-suffix-scan",
            "path-output-allocation-and-write",
            "path-output-move-to-shared",
        ] {
            assert_eq!(seen.iter().filter(|(_, e)| *e == event).count(), 1);
        }
        assert_eq!(
            seen.iter()
                .filter(|(_, e)| *e == "path-transition-publication")
                .count(),
            usize::from(target == "path-transition-publication")
        );
        assert_eq!(calls.get(), seen.last().unwrap().0); // no fallback wrapper retry/callback after completed candidate
    }
    let (_, baseline) = probe(1);
    let at = baseline
        .iter()
        .find(|(_, e)| *e == "path-root-publication")
        .unwrap()
        .0;
    let (a, p) = setup(1);
    let calls = Cell::new(0usize);
    let nested = Cell::new(false);
    let mut control = |_| {
        assert!(a.try_borrow_mut().is_ok());
        calls.set(calls.get() + 1);
        if calls.get() == at && !nested.replace(true) {
            root(&a, "nested", &mut Context::ordinary());
        }
        Ok(())
    };
    let mut events = Vec::new();
    let result = EvaluationPaths::root_pair_inner(
        &a,
        Utf16::from_static_units(STATIC_ROOT),
        &mut Context::ordinary().with_host_control(&mut control),
        &mut |e| events.push((calls.get(), e)),
    )
    .unwrap();
    assert!(nested.get());
    assert!(result.handle.is_none());
    assert_eq!(result.text().units(), STATIC_ROOT);
    assert_eq!(state(&a).0, 2);
    verify(&a, &p);
    assert_eq!(calls.get(), events.last().unwrap().0);
}

#[test]
fn ph09_terminal_host_controls_observer_unwind_and_nested_arenas_release_local_borrows() {
    let (amounts, baseline) = probe(2);
    let terminal = amounts.len();
    for deadline in [false, true] {
        let (a, p) = setup(2);
        let before = state(&a);
        let calls = Cell::new(0usize);
        let mut cancel = || {
            assert!(a.try_borrow_mut().is_ok());
            calls.set(calls.get() + 1);
            assert!(calls.get() <= terminal);
            calls.get() == terminal
        };
        let mut clock = || {
            assert!(a.try_borrow_mut().is_ok());
            calls.set(calls.get() + 1);
            assert!(calls.get() <= terminal);
            Some(if calls.get() == terminal { 2 } else { 0 })
        };
        let mut ctx = if deadline {
            Context::ordinary().with_clock(&mut clock, 1)
        } else {
            Context::ordinary().with_cancellation(&mut cancel)
        };
        let mut events = Vec::new();
        let error = EvaluationPaths::append_pair_inner(
            &a,
            &p,
            &Utf16::from("x"),
            PathKind::InstancePointer,
            &mut ctx,
            &mut |e| events.push((calls.get(), e)),
        )
        .err()
        .expect("terminal control denial");
        assert_eq!(error.code, if deadline { "DEADLINE" } else { "CANCELLED" });
        assert_eq!(error.path, Utf16::default());
        assert_eq!(
            error.message,
            Utf16::from(if deadline {
                "Deadline elapsed"
            } else {
                "Operation cancelled"
            })
        );
        assert!(error.python_message_origin.is_none());
        assert!(error.is_control_failure());
        assert!(!error.is_python_schema_terminal());
        assert_eq!(calls.get(), terminal);
        assert_eq!(state(&a), before);
        assert_eq!(
            events,
            baseline
                .iter()
                .copied()
                .filter(|(at, _)| *at < terminal)
                .collect::<Vec<_>>()
        );
    }
    for (operation, target) in [
        (0, "path-arena-construction"),
        (1, "path-root-read"),
        (1, "path-root-publication"),
        (2, "path-parent-read"),
        (2, "path-transition-lookup"),
        (3, "path-transition-hit"),
        (2, "path-suffix-scan"),
        (2, "path-output-allocation-and-write"),
        (2, "path-output-move-to-shared"),
        (2, "path-transition-publication"),
        (4, "path-pair-clone"),
    ] {
        let (a, p) = setup(operation);
        let before = state(&a);
        let original_entries = contents(&a);
        let mut ctx = Context::ordinary();
        let mut events = Vec::new();
        let result = catch_unwind(AssertUnwindSafe(|| {
            perform(operation, &a, &p, &mut ctx, &mut |e| {
                assert!(a.try_borrow_mut().is_ok());
                events.push(e);
                if e == target {
                    panic!("pair observer unwind");
                }
            })
        }));
        assert!(result.is_err());
        assert_eq!(events.last(), Some(&target));
        assert_eq!(state(&a), before);
        assert_eq!(contents(&a), original_entries);
        verify(&a, &p);
        let paid = ctx.charged_work();
        let next = append(&a, &p, "after", PathKind::InstancePointer, &mut ctx);
        assert_eq!(next.text(), &Utf16::from("#base/after"));
        verify(&a, &next);
        assert!(ctx.charged_work() > paid);
    }
    // Private arena lifetime nesting ONLY, not H's still-unpinned Context bridge.
    let mut ctx = Context::ordinary();
    let outer = arena(&mut ctx);
    let p = root(&outer, "#outer", &mut ctx);
    let before = state(&outer);
    {
        let inner = arena(&mut ctx);
        let q = root(&inner, "#inner", &mut ctx);
        let child = append(&inner, &q, "x", PathKind::SchemaPointer, &mut ctx);
        assert_eq!(child.text(), &Utf16::from("#inner/x"));
    }
    assert_eq!(state(&outer), before);
    verify(&outer, &p);
    assert_eq!(
        append(&outer, &p, "sibling", PathKind::SchemaPointer, &mut ctx).text(),
        &Utf16::from("#outer/sibling")
    );
}

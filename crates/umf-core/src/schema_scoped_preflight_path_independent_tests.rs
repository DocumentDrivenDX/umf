// SPDX-License-Identifier: MIT OR Apache-2.0
//! SP1 staged independent SOURCE controls; UNCOMPILED / NATIVE UNEXECUTED.
//! Written producer v4 / actual caller effect v6. No Python transport proof.
//! Routing, pre-effect admission, completed effects and original oracles are separate.
use super::*;
use construction_index::{CarriedPath, PathSelector, ScopedPreflightPath};
use std::cell::{Cell, RefCell};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::rc::Rc;

fn sp_json(s: &str) -> Value {
    crate::serialization::read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn sp_owner() -> CompiledSchema {
    Context::catalog()
        .with_codegen_construction(|ctx| {
            CompiledSchema::compile(
                &sp_json(r#"{"$id":"https://sp.test/root","type":"integer"}"#),
                &SchemaResources::default(),
                ctx,
            )
        })
        .unwrap()
}
fn sp_generic(
    owner: &CompiledSchema,
    path: &Utf16,
    selector: PathSelector,
    ctx: &mut Context<'_>,
) -> Option<usize> {
    let index = owner
        .cold_resource_index
        .as_ref()
        .expect("genuine indexed fixture");
    match selector {
        PathSelector::Policy => index.policy_path(path, ctx),
        PathSelector::Common => index.for_path(path, ctx),
        PathSelector::Dynamic => index.dynamic_path(path, ctx),
    }
    .unwrap()
}
fn sp_host_error() -> EngineError {
    EngineError::new(
        "SP_FIRST_HOST",
        Utf16::new(vec![47, 0xd800, 35]),
        "original host fields",
    )
}

#[test]
fn sp01_literal_raw_pointer_and_index_spelling() {
    // Literal expectations are independent of both producers. These are real
    // exposed PathKind operations; decimal segments are helper scope, not arrays.
    let vectors: Vec<(Vec<u16>, Vec<u16>, PathKind, Vec<u16>)> = vec![
        (vec![], vec![], PathKind::RawSchemaStep, vec![47]),
        (
            vec![35],
            vec![97],
            PathKind::RawSchemaStep,
            vec![35, 47, 97],
        ),
        (
            vec![47, 47],
            vec![47, 126],
            PathKind::RawSchemaStep,
            vec![47, 47, 47, 126],
        ),
        (
            vec![35, 47],
            vec![47, 126],
            PathKind::SchemaPointer,
            vec![35, 47, 126, 49, 126, 48],
        ),
        (
            vec![35, 47],
            vec![47, 126],
            PathKind::InstancePointer,
            vec![35, 47, 47, 126, 49, 126, 48],
        ),
        (
            vec![35],
            vec![0xd800, 47, 0xdc00],
            PathKind::SchemaPointer,
            vec![35, 47, 0xd800, 126, 49, 0xdc00],
        ),
        (
            vec![0xd83d, 0xde00],
            vec![35, 35],
            PathKind::RawSchemaStep,
            vec![0xd83d, 0xde00, 47, 35, 35],
        ),
    ];
    for (root, segment, kind, expected) in vectors {
        let root = Utf16::new(root);
        let segment = Utf16::new(segment);
        let mut ctx = Context::catalog();
        let original = CarriedPath::seed(root.clone(), &mut ctx)
            .unwrap()
            .append(&segment, kind, &mut ctx)
            .unwrap();
        let mut actual = ScopedPreflightPath::new(&root, &mut ctx).unwrap();
        actual.append(&segment, kind, &mut ctx).unwrap();
        assert_eq!(actual.text().units(), expected.as_slice());
        assert_eq!(actual.text(), original.text());
        let state = actual.observe();
        assert_eq!(state.first_hash, expected.iter().position(|u| *u == 35));
        assert_eq!(
            state.surrogate,
            expected.iter().any(|u| (0xd800..=0xdfff).contains(u))
        );
    }
    // Helper literals only. Actual preflight-array routing belongs to sp10.
    for literal in ["0", "9", "10", "99", "100"] {
        let mut ctx = Context::catalog();
        let mut path = ScopedPreflightPath::new(&Utf16::from("#/allOf"), &mut ctx).unwrap();
        path.append(&Utf16::from(literal), PathKind::RawSchemaStep, &mut ctx)
            .unwrap();
        assert_eq!(path.text(), &Utf16::from(format!("#/allOf/{literal}")));
    }
    // Genuine small indexed applicator array, distinct from helper literals.
    let source = Value::Object(vec![(
        Utf16::from("allOf"),
        Value::Array((0..101).map(|_| Value::Object(Vec::new())).collect()),
    )]);
    let expected_owner = source.clone();
    let rows = Rc::new(RefCell::new(Vec::new()));
    let sink = rows.clone();
    construction_index::observe_scoped_path_calls(
        Box::new(move |_, owner, path| {
            if owner.schema_value() == &expected_owner {
                sink.borrow_mut().push(path.text().clone());
            }
        }),
        || sp_compile(&source, &SchemaResources::default()),
    )
    .unwrap();
    for literal in ["0", "9", "10", "99", "100"] {
        assert!(
            rows.borrow()
                .contains(&Utf16::from(format!("#/allOf/{literal}"))),
            "actual array index preflight path required"
        );
    }
}

#[test]
fn sp04_nested_restore_first_hash_surrogate_and_origin_custody() {
    let owner = sp_owner();
    let index = owner.cold_resource_index.as_ref().unwrap();
    let mut ctx = Context::catalog();
    let mut path =
        ScopedPreflightPath::new(&Utf16::from("https://sp.test/root#"), &mut ctx).unwrap();
    let compact_origin = path.origin_identity();
    let mark = path.mark(&mut ctx).unwrap();
    assert!(ScopedPreflightPath::mark_is_compact(&mark));
    assert_eq!(path.origin_identity(), compact_origin);
    assert!(path.mark_shares_origin(&mark), "known fragment uses the compact shared-origin mark");
    assert!(!path.observe().has_origin_binding);
    path.append(
        &Utf16::from("properties"),
        PathKind::RawSchemaStep,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(path.origin_identity(), compact_origin, "compact append keeps the actual origin allocation");
    let expected = sp_generic(&owner, path.text(), PathSelector::Policy, &mut ctx);
    assert_eq!(
        index
            .select_scoped(&owner, &mut path, PathSelector::Policy, &mut ctx)
            .unwrap(),
        expected
    );
    let published = path.observe();
    assert!(published.origin_epoch > 0);
    assert_eq!(published.selections[0], Some(expected));
    path.restore(mark, &mut ctx).unwrap();
    assert_eq!(path.origin_identity(), compact_origin, "compact rollback keeps the actual origin allocation");
    let restored = path.observe();
    assert_eq!(restored.text, Utf16::from("https://sp.test/root#").units());
    assert_eq!(restored.origin_epoch, published.origin_epoch);
    assert_eq!(
        restored.selections, published.selections,
        "shared semantic update survives restoration"
    );
    assert_eq!(
        index
            .select_scoped(&owner, &mut path, PathSelector::Policy, &mut ctx)
            .unwrap(),
        expected
    );
    assert_eq!(
        path.observe().origin_epoch,
        restored.origin_epoch,
        "actual known selection reuse"
    );

    let mut path = ScopedPreflightPath::new(&Utf16::default(), &mut ctx).unwrap();
    let parent_origin = path.origin_identity();
    let parent = path.mark(&mut ctx).unwrap();
    assert!(!ScopedPreflightPath::mark_is_compact(&parent));
    assert!(path.mark_shares_origin(&parent), "full pre-fragment mark initially shares the origin");
    path.append(&Utf16::from("#"), PathKind::RawSchemaStep, &mut ctx)
        .unwrap();
    let child_origin = path.origin_identity();
    assert_ne!(child_origin, parent_origin, "first # creates a new origin allocation");
    assert!(!path.mark_shares_origin(&parent), "introducing # installs a distinct origin");
    assert_eq!(
        index
            .select_scoped(&owner, &mut path, PathSelector::Common, &mut ctx)
            .unwrap(),
        sp_generic(&owner, path.text(), PathSelector::Common, &mut ctx)
    );
    assert!(path.observe().origin_epoch > 0);
    assert!(path.observe().has_origin_binding);
    let first_hash = path.observe().first_hash;
    let child = path.mark(&mut ctx).unwrap();
    path.append(
        &Utf16::new(vec![35, 0xd800]),
        PathKind::SchemaPointer,
        &mut ctx,
    )
    .unwrap();
    assert!(path.mark_shares_origin(&child));
    assert_eq!(path.observe().first_hash, first_hash);
    assert!(path.observe().surrogate);
    path.restore(child, &mut ctx).unwrap();
    assert!(!path.observe().surrogate);
    path.restore(parent, &mut ctx).unwrap();
    assert_eq!(path.origin_identity(), parent_origin, "full rollback restores the actual retained origin");
    assert_ne!(path.origin_identity(), child_origin);
    assert_eq!(path.text(), &Utf16::default());
    assert_eq!(path.observe().first_hash, None);
    assert_eq!(path.observe().origin_epoch, 0, "full rollback returns to the retained parent origin");
    assert!(!path.observe().has_origin_binding, "child-origin selection does not leak to parent");
    assert!(
        !path.observe().has_origin_binding,
        "child-created selector updates cannot leak to sibling"
    );
}

#[test]
fn sp05_capacity_reuse_growth_detach_and_snapshot_isolation() {
    static LITERAL: &[u16] = &[35, 47, 97];
    for seed in [
        Utf16::from("#/a"),
        Utf16::shared(vec![35, 47, 97]),
        Utf16::from_static_units(LITERAL),
    ] {
        let retained = seed.clone();
        let mut ctx = Context::catalog();
        let mut path = ScopedPreflightPath::new(&seed, &mut ctx).unwrap();
        let mark = path.mark(&mut ctx).unwrap();
        let mut events = Vec::new();
        path.append_with_events(
            &Utf16::from("longer-first-child"),
            PathKind::SchemaPointer,
            &mut ctx,
            &mut |e| events.push(e),
        )
        .unwrap();
        assert!(events.contains(&"sp1-pre-effect-growth-admitted"));
        assert!(
            events
                .iter()
                .position(|e| *e == "sp1-effect-capacity-reserved-before-prefix-relocation")
                .unwrap()
                < events
                    .iter()
                    .position(|e| *e == "sp1-effect-suffix-written")
                    .unwrap()
        );
        assert!(path.observe().owned);
        let capacity = path.observe().capacity;
        path.restore(mark, &mut ctx).unwrap();
        let mark = path.mark(&mut ctx).unwrap();
        events.clear();
        path.append_with_events(
            &Utf16::from("b"),
            PathKind::SchemaPointer,
            &mut ctx,
            &mut |e| events.push(e),
        )
        .unwrap();
        assert_eq!(path.observe().capacity, capacity);
        assert!(!events.contains(&"sp1-pre-effect-growth-admitted"));
        assert!(!events.contains(&"sp1-effect-capacity-reserved-before-prefix-relocation"));
        assert!(events.contains(&"sp1-effect-suffix-written"));
        assert_eq!(
            retained, seed,
            "real shared/static seed alias unaffected by detach and sibling writes"
        );
        path.restore(mark, &mut ctx).unwrap();
        assert_eq!(path.text(), &seed);
    }
    // Actual public-to-this-module production append versus instrumented entry.
    // Trace every callback amount, including zero; final state/effects are read
    // independently. No assumption that an event corresponds to one callback.
    for seed in [Utf16::from("nonempty#"), Utf16::shared(vec![35])] {
        let mut production = ScopedPreflightPath::new(&seed, &mut Context::catalog()).unwrap();
        let mut instrumented = ScopedPreflightPath::new(&seed, &mut Context::catalog()).unwrap();
        let direct_work = RefCell::new(Vec::new());
        let observed_work = RefCell::new(Vec::new());
        let mut direct = |n| {
            direct_work.borrow_mut().push(n);
            Ok(())
        };
        let mut observed = |n| {
            observed_work.borrow_mut().push(n);
            Ok(())
        };
        let events = RefCell::new(Vec::new());
        let direct_events = Rc::new(RefCell::new(Vec::new()));
        let sink = direct_events.clone();
        construction_index::observe_paths(Box::new(move |e| sink.borrow_mut().push(e)), || {
            production.append(
                &Utf16::from("child"),
                PathKind::RawSchemaStep,
                &mut Context::catalog().with_host_control(&mut direct),
            )
        })
        .unwrap();
        instrumented
            .append_with_events(
                &Utf16::from("child"),
                PathKind::RawSchemaStep,
                &mut Context::catalog().with_host_control(&mut observed),
                &mut |e| events.borrow_mut().push(e),
            )
            .unwrap();
        assert_eq!(
            *direct_work.borrow(),
            *observed_work.borrow(),
            "observer entry cannot add a mark/control charge"
        );
        assert_eq!(
            *direct_events.borrow(),
            *events.borrow(),
            "actual production and instrumented effect streams agree"
        );
        assert_eq!(
            production.observe(),
            instrumented.observe(),
            "observer entry cannot change actual state/effects"
        );
        assert_eq!(
            events
                .borrow()
                .iter()
                .filter(|e| **e == "sp1-effect-suffix-written")
                .count(),
            1
        );
    }
    // The snapshot API really copies under admission; it does not make the
    // scoped Owned buffer share storage or force a fictitious later detach.
    let mut ctx = Context::catalog();
    let mut path = ScopedPreflightPath::new(&Utf16::from("nonempty#"), &mut ctx).unwrap();
    let snapshot = path.diagnostic_snapshot(&mut ctx).unwrap();
    path.append(&Utf16::from("later"), PathKind::RawSchemaStep, &mut ctx)
        .unwrap();
    assert_eq!(snapshot, Utf16::from("nonempty#"));
    assert_eq!(path.text(), &Utf16::from("nonempty#/later"));
}

#[test]
fn sp06_append_denial_empty_diagnostic_and_first_host_error() {
    // Capture actual callback ordinals, not an assumed callback/effect ratio.
    let segment = Utf16::from("new-long-child");
    let calls = Cell::new(0);
    let mut path =
        ScopedPreflightPath::new(&Utf16::shared(vec![35]), &mut Context::catalog()).unwrap();
    let mut meter = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    path.append_with_events(
        &segment,
        PathKind::RawSchemaStep,
        &mut Context::catalog().with_host_control(&mut meter),
        &mut |_| {},
    )
    .unwrap();
    let total = calls.get();
    assert!(total > 0);
    for denied in 1..=total {
        let mut path =
            ScopedPreflightPath::new(&Utf16::shared(vec![35]), &mut Context::catalog()).unwrap();
        let mark = path.mark(&mut Context::catalog()).unwrap();
        let calls = Cell::new(0);
        let at_denial = Cell::new(usize::MAX);
        let events = RefCell::new(Vec::new());
        let original = sp_host_error();
        let mut stop = |_| {
            calls.set(calls.get() + 1);
            if calls.get() == denied {
                at_denial.set(events.borrow().len());
                Err(original.clone())
            } else {
                Ok(())
            }
        };
        let error = path
            .append_with_events(
                &segment,
                PathKind::RawSchemaStep,
                &mut Context::catalog().with_host_control(&mut stop),
                &mut |e| events.borrow_mut().push(e),
            )
            .unwrap_err();
        assert_eq!(error, original.from_host());
        assert_eq!(calls.get(), denied);
        assert_eq!(events.borrow().len(), at_denial.get());
        // Genuine early failure BEFORE detach leaves Shared seed intact. Cleanup
        // must not invoke an Owned-only unreachable panic and mask the host error.
        let cleanup = catch_unwind(AssertUnwindSafe(|| path.restore_after_failure(mark)));
        assert!(
            cleanup.is_ok(),
            "cleanup must handle refusal before real detach"
        );
        assert_eq!(path.text(), &Utf16::from("#"));
        assert_eq!(calls.get(), denied);
    }
    static STATIC_PARENT: &[u16] = &[35, 47, 97];
    let mut static_path = ScopedPreflightPath::new(
        &Utf16::from_static_units(STATIC_PARENT),
        &mut Context::catalog(),
    )
    .unwrap();
    let static_mark = static_path.mark(&mut Context::catalog()).unwrap();
    let host = sp_host_error();
    let calls = Cell::new(0);
    let mut deny = |_| {
        calls.set(calls.get() + 1);
        Err(host.clone())
    };
    let error = static_path
        .append(
            &segment,
            PathKind::RawSchemaStep,
            &mut Context::catalog().with_host_control(&mut deny),
        )
        .unwrap_err();
    assert_eq!(error, host.from_host());
    assert!(catch_unwind(AssertUnwindSafe(
        || static_path.restore_after_failure(static_mark)
    ))
    .is_ok());
    assert_eq!(static_path.text().units(), STATIC_PARENT);
    assert_eq!(calls.get(), 1);
    let mut path =
        ScopedPreflightPath::new(&Utf16::from("nonempty"), &mut Context::catalog()).unwrap();
    let mut cancel = || true;
    let error = path
        .append(
            &segment,
            PathKind::RawSchemaStep,
            &mut Context::catalog().with_cancellation(&mut cancel),
        )
        .unwrap_err();
    let mut cancel = || true;
    let original = CarriedPath::seed(Utf16::from("nonempty"), &mut Context::catalog())
        .unwrap()
        .append(
            &segment,
            PathKind::RawSchemaStep,
            &mut Context::catalog().with_cancellation(&mut cancel),
        )
        .unwrap_err();
    assert_eq!(error, original);
    assert!(error.path.is_empty());
    // A prior cancelled operation poisons its scope: use a fresh independent
    // fixture to test the deadline's original first error, never resume it.
    let mut path =
        ScopedPreflightPath::new(&Utf16::from("nonempty"), &mut Context::catalog()).unwrap();
    let mut clock = || Some(2);
    let error = path
        .append(
            &segment,
            PathKind::RawSchemaStep,
            &mut Context::catalog().with_clock(&mut clock, 1),
        )
        .unwrap_err();
    let mut clock = || Some(2);
    let original = CarriedPath::seed(Utf16::from("nonempty"), &mut Context::catalog())
        .unwrap()
        .append(
            &segment,
            PathKind::RawSchemaStep,
            &mut Context::catalog().with_clock(&mut clock, 1),
        )
        .unwrap_err();
    assert_eq!(error, original);
    assert!(error.path.is_empty());
}

#[test]
fn sp08_owner_policy_limits_and_genuine_original_fallback() {
    let owner = sp_owner();
    let foreign = sp_owner();
    let index = owner.cold_resource_index.as_ref().unwrap();
    let mut ctx = Context::catalog();
    let mut path =
        ScopedPreflightPath::new(&Utf16::from("https://sp.test/root#"), &mut ctx).unwrap();
    assert_eq!(
        index
            .select_scoped(&owner, &mut path, PathSelector::Policy, &mut ctx)
            .unwrap(),
        sp_generic(&owner, path.text(), PathSelector::Policy, &mut ctx)
    );
    let before = path.observe();
    let mut limits = ctx.limits();
    limits.max_depth -= 1;
    let mut changed = Context::with_limits(ctx.profile(), limits).unwrap();
    assert_eq!(
        index
            .select_scoped(&owner, &mut path, PathSelector::Dynamic, &mut changed)
            .unwrap(),
        sp_generic(&owner, path.text(), PathSelector::Dynamic, &mut changed)
    );
    assert_eq!(
        path.observe(),
        before,
        "changed limits must not update bound origin"
    );
    assert_eq!(
        index
            .select_scoped(&foreign, &mut path, PathSelector::Common, &mut ctx)
            .unwrap(),
        sp_generic(&owner, path.text(), PathSelector::Common, &mut ctx)
    );
    assert_eq!(
        path.observe(),
        before,
        "foreign actual owner cannot change existing binding"
    );
    let mark = path.mark(&mut ctx).unwrap();
    path.append(&Utf16::new(vec![0xd800]), PathKind::SchemaPointer, &mut ctx)
        .unwrap();
    assert_eq!(
        index
            .select_scoped(&owner, &mut path, PathSelector::Common, &mut ctx)
            .unwrap(),
        None
    );
    path.restore(mark, &mut ctx).unwrap();
    assert_eq!(path.observe().selections, before.selections);
}

#[test]
fn sp09_nonempty_parent_reentry_error_unwind_and_poison() {
    // Actual shared-origin reentry during publication admission. Calibrate the
    // last callback of first selection; no guessed one-callback-one-event rule.
    let owner = sp_owner();
    let index = owner.cold_resource_index.as_ref().unwrap();
    let calls = Cell::new(0);
    let mut path = ScopedPreflightPath::new(
        &Utf16::from("https://sp.test/root#"),
        &mut Context::catalog(),
    )
    .unwrap();
    let mut count = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    index
        .select_scoped(
            &owner,
            &mut path,
            PathSelector::Policy,
            &mut Context::catalog().with_host_control(&mut count),
        )
        .unwrap();
    let publication = calls.get();
    assert!(publication > 1);
    // Reentrant selection on the same path while publication is in flight is
    // statically impossible now that `select_scoped` takes `&mut ScopedPreflightPath`;
    // the borrow checker enforces what the former shared-borrow test exercised.

    // Real mutation has completed before restoration admission refuses.
    let mut ctx = Context::catalog();
    let mut path = ScopedPreflightPath::new(&Utf16::from("nonempty#"), &mut ctx).unwrap();
    let mark = path.mark(&mut ctx).unwrap();
    path.append(&Utf16::from("child"), PathKind::RawSchemaStep, &mut ctx)
        .unwrap();
    assert_eq!(path.text(), &Utf16::from("nonempty#/child"));
    let calls = Cell::new(0);
    let events = RefCell::new(Vec::new());
    let at_denial = Cell::new(usize::MAX);
    let host = sp_host_error();
    let mut stop = |_| {
        calls.set(calls.get() + 1);
        at_denial.set(events.borrow().len());
        Err(host.clone())
    };
    let error = path
        .restore_with_events(
            mark,
            &mut Context::catalog().with_host_control(&mut stop),
            &mut |e| events.borrow_mut().push(e),
        )
        .unwrap_err();
    assert_eq!(error, host.from_host());
    assert_eq!(calls.get(), 1);
    assert_eq!(
        events.borrow().len(),
        at_denial.get(),
        "no observer after restoration denial"
    );
    assert_eq!(path.text(), &Utf16::from("nonempty#"));

    assert!(path.observe().poisoned);

    // A restoration host panic is a different terminal path than a returned
    // error. Both marks are genuine, created before any failure or mutation.
    let mut panicked = ScopedPreflightPath::new(&Utf16::from("nonempty#"), &mut ctx).unwrap();
    let outer_mark = panicked.mark(&mut ctx).unwrap();
    let restore_mark = panicked.mark(&mut ctx).unwrap();
    panicked
        .append(&Utf16::from("changed"), PathKind::RawSchemaStep, &mut ctx)
        .unwrap();
    assert_eq!(panicked.text(), &Utf16::from("nonempty#/changed"));
    let calls = Cell::new(0);
    let mut panic_control = |_| -> Result<(), EngineError> {
        calls.set(calls.get() + 1);
        std::panic::panic_any(37_u32);
    };
    let unwind = catch_unwind(AssertUnwindSafe(|| {
        panicked.restore(
            restore_mark,
            &mut Context::catalog().with_host_control(&mut panic_control),
        )
    }));
    let payload = unwind.expect_err("original host panic must propagate");
    assert_eq!(payload.downcast_ref::<u32>(), Some(&37));
    assert_eq!(calls.get(), 1);
    assert_eq!(
        panicked.text(),
        &Utf16::from("nonempty#"),
        "panic during restoration admission still cleans mutation"
    );
    assert!(panicked.observe().poisoned);
    let after = Cell::new(0);
    let mut forbidden = |_| {
        after.set(after.get() + 1);
        Ok(())
    };
    let restored = panicked.restore(
        outer_mark,
        &mut Context::catalog().with_host_control(&mut forbidden),
    );
    assert!(
        restored.is_err(),
        "already poisoned restoration refuses without control"
    );
    assert_eq!(after.get(), 0);
    assert_eq!(panicked.text(), &Utf16::from("nonempty#"));

    let mut path = ScopedPreflightPath::new(&Utf16::from("nonempty#"), &mut ctx).unwrap();
    // Child processing's actual host refusal AFTER a successful mutation, with
    // no second Context operation during the explicit pre-admitted cleanup.
    let mark = path.mark(&mut ctx).unwrap();
    path.append(&Utf16::from("mutated"), PathKind::RawSchemaStep, &mut ctx)
        .unwrap();
    assert_eq!(path.text(), &Utf16::from("nonempty#/mutated"));
    let calls = Cell::new(0);
    let host = sp_host_error();
    let mut deny = |_| {
        calls.set(calls.get() + 1);
        Err(host.clone())
    };
    let error = Context::catalog()
        .with_host_control(&mut deny)
        .charge_work(1, Utf16::default())
        .unwrap_err();
    path.restore_after_failure(mark);
    assert_eq!(error, host.from_host());
    assert_eq!(calls.get(), 1);
    assert_eq!(path.text(), &Utf16::from("nonempty#"));

    // Explicit caller cleanup after Err/unwind, not a claim of an unwritten
    // automatic closure guard or poison API. Neither performs another callback.
    for unwind in [false, true] {
        let mut path = ScopedPreflightPath::new(&Utf16::from("nonempty#"), &mut ctx).unwrap();
        let mark = path.mark(&mut ctx).unwrap();
        let before = path.observe();
        let result = catch_unwind(AssertUnwindSafe(|| -> Result<(), EngineError> {
            path.append(&Utf16::from("nested"), PathKind::RawSchemaStep, &mut ctx)?;
            if unwind {
                panic!("intentional after mutation");
            }
            Err(sp_host_error())
        }));
        path.restore_after_failure(mark);
        assert_eq!(path.text().units(), before.text);
        assert_eq!(path.observe().first_hash, before.first_hash);
        if unwind {
            assert!(result.is_err());
        } else {
            assert_eq!(result.unwrap().unwrap_err(), sp_host_error());
        }
    }
    // Actual production child wrapper: operation return/Err/unwind after append.
    // Its event seam forwards append markers, NOT direct restoration markers.
    for terminal in 0..3 {
        let mut path = ScopedPreflightPath::new(&Utf16::from("nonempty#"), &mut ctx).unwrap();
        let events = RefCell::new(Vec::new());
        let completed = Cell::new(false);
        let outcome = catch_unwind(AssertUnwindSafe(|| {
            owner.with_scoped_preflight_child_with_events(
                &mut path,
                &Utf16::from("scoped"),
                PathKind::RawSchemaStep,
                &mut ctx,
                &mut |e| events.borrow_mut().push(e),
                |child, _| {
                    assert_eq!(child.text(), &Utf16::from("nonempty#/scoped"));
                    completed.set(true);
                    match terminal {
                        0 => Ok(()),
                        1 => Err(sp_host_error()),
                        _ => std::panic::panic_any(91_u32),
                    }
                },
            )
        }));
        assert!(completed.get());
        assert_eq!(path.text(), &Utf16::from("nonempty#"));
        assert!(events.borrow().contains(&"sp1-effect-suffix-written"));
        assert!(!events
            .borrow()
            .contains(&"sp1-effect-restoration-after-admission"));
        match terminal {
            0 => {
                outcome.unwrap().unwrap();
                assert!(!path.observe().poisoned);
            }
            1 => {
                assert_eq!(outcome.unwrap().unwrap_err(), sp_host_error());
                assert!(path.observe().poisoned);
            }
            _ => {
                assert_eq!(outcome.unwrap_err().downcast_ref::<u32>(), Some(&91));
                assert!(path.observe().poisoned);
            }
        }
    }
}

fn sp_compile(schema: &Value, resources: &SchemaResources) -> Result<CompiledSchema, EngineError> {
    Context::catalog()
        .with_codegen_construction(|ctx| CompiledSchema::compile(schema, resources, ctx))
}
fn sp_original_compile(
    schema: &Value,
    resources: &SchemaResources,
) -> Result<CompiledSchema, EngineError> {
    CompiledSchema::compile(schema, resources, &mut Context::catalog())
}
fn sp_root_preflight(
    owner: &CompiledSchema,
    original: bool,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let (path, scope) = construction_index::origin(owner.schema_value(), owner.dialect, ctx)?;
    let cursor = owner.location_root(0, true, ctx)?;
    if original {
        owner.preflight_original_located(
            owner.schema_value(),
            &path,
            &scope,
            0,
            owner.root_keyword_policy,
            ctx,
            &mut BTreeSet::new(),
            cursor,
        )
    } else {
        owner.preflight_located(
            owner.schema_value(),
            &path,
            &scope,
            0,
            owner.root_keyword_policy,
            ctx,
            &mut BTreeSet::new(),
            cursor,
        )
    }
}

#[test]
fn sp02_pattern_path_reuse_and_regex_error_order() {
    let source = sp_json(
        r##"{"$id":"https://sp.test/root","patternProperties":{"a#":{"type":"integer"}},"type":"object"}"##,
    );
    let resources = SchemaResources::default();
    let owner = sp_compile(&source, &resources).unwrap();
    let plain = sp_original_compile(&source, &resources).unwrap();
    let rows = Rc::new(RefCell::new(Vec::new()));
    let sink = rows.clone();
    construction_index::observe_scoped_path_calls(
        Box::new(move |site, _, path| sink.borrow_mut().push((site, path.text().clone()))),
        || sp_root_preflight(&owner, false, &mut Context::catalog()),
    )
    .unwrap();
    sp_root_preflight(&owner, true, &mut Context::catalog()).unwrap();
    assert!(rows
        .borrow()
        .iter()
        .any(|(s, p)| *s == "sp1-preflight-policy-route"
            && *p == Utf16::from("https://sp.test/root#/patternProperties/a#")));
    let instance = sp_json(r##"{"a#":"wrong"}"##);
    assert_eq!(
        owner.validate(&instance, &mut Context::catalog()).unwrap(),
        plain.validate(&instance, &mut Context::catalog()).unwrap()
    );
    // Invalid regex precedes the independently-invalid descendant schema in
    // both real constructors. Observe that descendant preflight is not entered.
    let bad = sp_json(r#"{"patternProperties":{"[":{"type":7}}}"#);
    let rows = Rc::new(RefCell::new(Vec::new()));
    let sink = rows.clone();
    let actual = construction_index::observe_scoped_path_calls(
        Box::new(move |_, _, path| sink.borrow_mut().push(path.text().clone())),
        || sp_compile(&bad, &resources),
    )
    .err()
    .unwrap();
    let expected = sp_original_compile(&bad, &resources).err().unwrap();
    assert_eq!(actual, expected);
    assert!(
        !rows.borrow().iter().any(|p| p
            .units()
            .ends_with(Utf16::from("/patternProperties/[").units())),
        "invalid regex stops descendant semantic preflight"
    );
    let work = RefCell::new(Vec::new());
    let mut meter = |n| {
        work.borrow_mut().push(n);
        Ok(())
    };
    let (result, effects) = sp_effects(|| {
        sp_root_preflight(
            &owner,
            false,
            &mut Context::catalog().with_host_control(&mut meter),
        )
    });
    result.unwrap();
    assert!(!work.borrow().is_empty());
    // Authored operations: patternProperties keyword, its name, nested type,
    // root type. A second name append would cause a fifth completed write.
    assert_eq!(
        effects
            .iter()
            .filter(|e| **e == "sp1-effect-suffix-written")
            .count(),
        4
    );
    assert_eq!(
        effects
            .iter()
            .filter(|e| **e == "sp1-child-operation-completed")
            .count(),
        1
    );
    assert!(
        !effects
            .iter()
            .any(|e| *e == "sp1-before-restoration-admission"),
        "caller stream deliberately does not forward restoration observations"
    );
}

#[test]
fn sp03_demand_only_preparation_and_displaced_ordered_skips() {
    let source = sp_json(
        r#"{"$id":"https://sp.test/root","$comment":"skip","default":{"opaque":[1,2,3]},"description":"skip","properties":{"x":{"type":"integer"}},"title":"skip","allOf":[{"type":"object"}]}"#,
    );
    let owner = sp_compile(&source, &SchemaResources::default()).unwrap();
    let rows = Rc::new(RefCell::new(Vec::new()));
    let sink = rows.clone();
    sp_root_preflight(&owner, false, &mut Context::catalog()).unwrap();
    sp_root_preflight(&owner, true, &mut Context::catalog()).unwrap();
    // Physical ordered extents exist only for bank-compiled (Views) owners, so
    // the displaced-skip traversal is observed on a genuine bank owner that
    // carries the same displaced default/description/title/comment members.
    let bank_owner = Context::catalog()
        .with_codegen_construction(|ctx| {
            let set = crate::engine::ResourceSet::new(
                source.clone(),
                sp_json(r#"{"$id":"https://sp.test/reference","type":"string"}"#),
                sp_json(r#"{"$id":"https://sp.test/package","type":"boolean"}"#),
                sp_json(r#"{}"#),
                sp_json(r#"{}"#),
            );
            let admitted = admitted_bank::SchemaBank::admit_core(set, ctx)?;
            CompiledSchema::compile_input_bank(admitted.bank, 0, ctx)
        })
        .unwrap();
    let walk: Rc<RefCell<Vec<&'static str>>> = Rc::new(RefCell::new(Vec::new()));
    let walk_sink = walk.clone();
    admitted_structure::observe_ordered_structure(
        Box::new(move |event, parent, edge, row| {
            sink.borrow_mut().push((event, parent, edge, row))
        }),
        || {
            owner_locations::observe_owner_walk(
                Box::new(move |event, _, _| walk_sink.borrow_mut().push(event)),
                || sp_root_preflight(&bank_owner, false, &mut Context::catalog()),
            )
        },
    )
    .unwrap();
    // Legacy OW1 walks advance physical extents; fused (FT1) walks read the
    // displaced intervening rows. Either is a genuine physical traversal.
    assert!(
        rows.borrow()
            .iter()
            .any(|r| r.0 == "ow1-ordered-extent-advance")
            || walk.borrow().iter().any(|e| *e == "ft1-intervening-row-read"),
        "genuine later ordered access traverses physical extents"
    );
    let invalid = sp_json(r#"{"x-unknown-strict":true}"#);
    assert_eq!(
        sp_compile(&invalid, &SchemaResources::default())
            .err()
            .unwrap(),
        sp_original_compile(&invalid, &SchemaResources::default())
            .err()
            .unwrap()
    );
    let (result, effects) =
        sp_effects(|| sp_root_preflight(&owner, false, &mut Context::catalog()));
    result.unwrap();
    // Only properties/name/type and allOf/index/type construct text. Merely
    // known default/title/description/comment/id do not prepare child paths.
    assert_eq!(
        effects
            .iter()
            .filter(|e| **e == "sp1-effect-suffix-written")
            .count(),
        6
    );
    // Two real keyword selections plus one property and one applicator child.
    assert_eq!(
        effects
            .iter()
            .filter(|e| **e == "sp1-ordered-selection-performed")
            .count(),
        4
    );
    // Original dialect-specific opaque continue: Draft3 definitions must not
    // turn its boolean annotation into a schema preflight failure.
    let legacy = sp_json(
        r#"{"$schema":"http://json-schema.org/draft-03/schema#","definitions":{"opaque":false}}"#,
    );
    let actual = sp_compile(&legacy, &SchemaResources::default()).map(|_| ());
    let original = sp_original_compile(&legacy, &SchemaResources::default()).map(|_| ());
    assert_eq!(actual, original);
}

#[test]
fn sp07_node_current_path_and_retaining_ref_uri_consumers() {
    let expected = Utf16::from("nonempty#/child");
    let mut path =
        ScopedPreflightPath::new(&Utf16::from("nonempty#"), &mut Context::catalog()).unwrap();
    path.append(
        &Utf16::from("child"),
        PathKind::RawSchemaStep,
        &mut Context::catalog(),
    )
    .unwrap();
    let mut cancel = || true;
    let error = path
        .charge_current_path(1, &mut Context::catalog().with_cancellation(&mut cancel))
        .unwrap_err();
    let mut cancel = || true;
    let original = Context::catalog()
        .with_cancellation(&mut cancel)
        .charge_work(1, expected.clone())
        .unwrap_err();
    assert_eq!(error, original);
    assert_eq!(error.path, expected);
    assert!(path.observe().poisoned);
    let mut path =
        ScopedPreflightPath::new(&Utf16::from("nonempty#"), &mut Context::catalog()).unwrap();
    let mut clock = || Some(2);
    let error = path
        .charge_current_path(1, &mut Context::catalog().with_clock(&mut clock, 1))
        .unwrap_err();
    let mut clock = || Some(2);
    assert_eq!(
        error,
        Context::catalog()
            .with_clock(&mut clock, 1)
            .charge_work(1, Utf16::from("nonempty#"))
            .unwrap_err()
    );
    let owner = sp_owner();
    let mut ctx = Context::catalog();
    let mut path =
        ScopedPreflightPath::new(&Utf16::from("https://sp.test/root#"), &mut ctx).unwrap();
    path.append(
        &Utf16::new(vec![47, 126, 0xd800]),
        PathKind::SchemaPointer,
        &mut ctx,
    )
    .unwrap();
    let exact = path.text().clone();
    let semantic = owner
        .scoped_preflight_schema_error(&mut path, "literal failure", &mut ctx)
        .unwrap();
    assert_eq!(semantic, schema_error(&exact, "literal failure"));
    let snapshot = path.diagnostic_snapshot(&mut ctx).unwrap();
    path.append(&Utf16::from("later"), PathKind::RawSchemaStep, &mut ctx)
        .unwrap();
    assert_eq!(
        snapshot, exact,
        "actual paid immutable snapshot survives later mutation"
    );
    let refs = sp_json(
        r##"{"$id":"https://sp.test/root","$defs":{"a/b~":{"type":"integer"}},"$ref":"#/$defs/a~1b~0"}"##,
    );
    let a = sp_compile(&refs, &SchemaResources::default()).unwrap();
    let b = sp_original_compile(&refs, &SchemaResources::default()).unwrap();
    assert_eq!(
        a.validate(&Value::Bool(true), &mut Context::catalog())
            .unwrap(),
        b.validate(&Value::Bool(true), &mut Context::catalog())
            .unwrap()
    );
}

#[test]
fn sp10_real_root_catalogue_preflight_and_unchanged_evaluator() {
    let root = sp_json(
        r#"{"$id":"https://sp.test/root","type":"object","properties":{"a/~":{"type":"string"}},"allOf":[{"required":["a/~"]}]}"#,
    );
    let resources = SchemaResources {
        entries: vec![(
            Utf16::from("https://sp.test/catalogue"),
            sp_json(r#"{"$id":"https://sp.test/catalogue","type":"integer"}"#),
        )],
    };
    let rows = Rc::new(RefCell::new(Vec::new()));
    let sink = rows.clone();
    let owner = construction_index::observe_scoped_path_calls(
        Box::new(move |site, _, path| sink.borrow_mut().push((site, path.text().clone()))),
        || sp_compile(&root, &resources),
    )
    .unwrap();
    for literal in ["https://sp.test/root#", "https://sp.test/catalogue#"] {
        assert!(
            rows.borrow()
                .iter()
                .any(|(s, p)| *s == "sp1-preflight-policy-route" && *p == Utf16::from(literal)),
            "genuine compile reaches root and catalogue preflight"
        );
    }
    let plain = sp_original_compile(&root, &resources).unwrap();
    for data in [sp_json(r#"{"a/~":true}"#), sp_json(r#"{}"#)] {
        assert_eq!(
            owner.validate(&data, &mut Context::catalog()).unwrap(),
            plain.validate(&data, &mut Context::catalog()).unwrap()
        );
    }
    // This is Core's genuine Python-profile route, NOT binding transport.
    let schema = sp_json(r#"{"properties":{"a/~":{"type":"string"}}}"#);
    let mut ctx = Context::catalog();
    let python = crate::python_value::python_from_core_value(&schema, &mut ctx).unwrap();
    let source = CompiledSchema::compile_python_source(
        &python,
        &crate::python_value::PythonSchemaResources::default(),
        false,
        PythonReVersion::V3_14,
        &mut ctx,
    )
    .unwrap();
    assert!(source.compiled.cold_resource_index.is_none());
    let data =
        crate::python_value::python_from_core_value(&sp_json(r#"{"a/~":true}"#), &mut ctx).unwrap();
    data.admit(&mut ctx).unwrap();
    let result = source
        .compiled
        .evaluate_instance_with_mode(&data, EvaluationMode::AllErrors, &mut ctx)
        .unwrap();
    assert!(result.terminal_error.is_none());
    assert_eq!(result.errors.len(), 1);
    assert!(result.errors[0].python_source_path);
    assert_eq!(
        result.errors[0].instance_path,
        Utf16::from("/~p00006100002f00007e")
    );
    assert_eq!(result.errors[0].schema_path,Utf16::from("#/~p00007000007200006f000070000065000072000074000069000065000073/~p00006100002f00007e/~p000074000079000070000065"));
}

fn sp_effects<T>(operation: impl FnOnce() -> T) -> (T, Vec<&'static str>) {
    let events = Rc::new(RefCell::new(Vec::new()));
    let sink = events.clone();
    let result =
        construction_index::observe_paths(Box::new(move |e| sink.borrow_mut().push(e)), operation);
    let rows = events.borrow().clone();
    (result, rows)
}

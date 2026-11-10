// SPDX-License-Identifier: MIT OR Apache-2.0
//! Owner controls for the actual plan/path/delta operations. Native execution
//! awaits the separately reviewed hosted producer; this is source only.
use super::*;
fn json(source: &str) -> Value {
    crate::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn compiled(source: &str) -> CompiledSchema {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        CompiledSchema::compile(&json(source), &SchemaResources::default(), ctx)
    })
    .unwrap()
}
#[test]
fn planned_pointer_and_unplanned_resolver_have_identical_targets_paths_and_id_flags() {
    let owner = compiled(
        r##"{"$id":"https://plans.test/root","$defs":{"t":{"type":"integer"}},"$ref":"#/$defs/t"}"##,
    );
    let reference = Value::string_utf8("#/$defs/t");
    let path = Utf16::from("https://plans.test/root#/$ref");
    let plain = owner
        .resolve_eval_ref_unplanned(&reference, &path, &mut Context::catalog())
        .unwrap();
    let first = owner
        .resolve_eval_ref(&reference, &path, &mut Context::catalog())
        .unwrap();
    let second = owner
        .resolve_eval_ref(&reference, &path, &mut Context::catalog())
        .unwrap();
    assert!(std::ptr::eq(first.0, plain.0));
    assert!(std::ptr::eq(second.0, plain.0));
    assert_eq!((first.1, first.2), (plain.1.clone(), plain.2));
    assert_eq!((second.1, second.2), (plain.1, plain.2));
}
#[test]
fn owner_move_keeps_locator_valid_and_changed_owner_cannot_reuse_it() {
    let first = compiled(r##"{"$defs":{"t":{"type":"integer"}},"$ref":"#/$defs/t"}"##);
    let rule = Value::string_utf8("#/$defs/t");
    let p = Utf16::from("#/$ref");
    first
        .resolve_eval_ref(&rule, &p, &mut Context::catalog())
        .unwrap();
    let moved = Box::new(first);
    assert_eq!(
        moved
            .resolve_eval_ref(&rule, &p, &mut Context::catalog())
            .unwrap()
            .0,
        &json(r#"{"type":"integer"}"#)
    );
    let changed = compiled(r##"{"$defs":{"t":{"type":"string"}},"$ref":"#/$defs/t"}"##);
    assert_eq!(
        changed
            .resolve_eval_ref(&rule, &p, &mut Context::catalog())
            .unwrap()
            .0,
        &json(r#"{"type":"string"}"#)
    );
}
#[test]
fn missing_target_refuses_without_publishing_a_successful_plan() {
    let owner = compiled("{}");
    let plans = owner.owner_plans.as_ref().unwrap();
    let rule = Value::string_utf8("#/$defs/missing");
    let p = Utf16::from("#/$ref");
    let error = plans
        .resolve_eval(&owner, &rule, &p, &mut Context::catalog())
        .unwrap_err();
    assert_eq!(error.code, "SCHEMA_REF_UNRESOLVED");
    assert_eq!(error.path, p);
    assert!(plans.evaluations.lock().unwrap().is_empty());
}
#[test]
fn changed_effective_limits_do_not_accept_a_completed_reference_plan() {
    let owner = compiled(r##"{"$defs":{"t":true},"$ref":"#/$defs/t"}"##);
    let p = Utf16::from("#/$ref");
    let rule = Value::string_utf8("#/$defs/t");
    owner
        .resolve_eval_ref(&rule, &p, &mut Context::catalog())
        .unwrap();
    let mut limits = crate::context::Limits::catalog();
    limits.max_depth -= 1;
    let mut ctx =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    owner.resolve_eval_ref(&rule, &p, &mut ctx).unwrap();
    assert_eq!(
        owner
            .owner_plans
            .as_ref()
            .unwrap()
            .evaluations
            .lock()
            .unwrap()
            .values()
            .next()
            .unwrap()
            .limits,
        limits
    );
}
#[test]
fn resolver_first_denial_cannot_publish_reference_or_node_metadata() {
    let owner = compiled("{}");
    let plans = owner.owner_plans.as_ref().unwrap();
    let mut called = 0;
    let mut meter = |_: usize| {
        called += 1;
        Err(EngineError::new(
            "OWNER_STOP",
            Utf16::from("/original"),
            "stop",
        ))
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    let error = plans
        .resolve_eval(
            &owner,
            &Value::string_utf8("#"),
            &Utf16::from("#/$ref"),
            &mut ctx,
        )
        .unwrap_err();
    assert_eq!(error.code, "OWNER_STOP");
    assert_eq!(error.path, Utf16::from("/original"));
    drop(ctx);
    assert_eq!(called, 1);
    assert!(plans.evaluations.lock().unwrap().is_empty());
    assert!(plans.nodes.lock().unwrap().is_empty());
}
#[test]
fn escaped_path_arena_matches_legacy_spelling_and_reuses_backing() {
    let mut paths = EvaluationPaths::default();
    let mut ctx = Context::catalog();
    for schema in [false, true] {
        for prefix in [Utf16::from("#"), Utf16::from("#/"), Utf16::from("/x")] {
            let key = Utf16::new(vec![47, 126, 0xd800, 0xd83d, 0xde00]);
            let expected = if schema {
                append_schema_pointer(&prefix, &key)
            } else {
                append_instance_path(&prefix, &key)
            };
            let first = paths.append(&prefix, &key, schema, &mut ctx).unwrap();
            let second = paths.append(&prefix, &key, schema, &mut ctx).unwrap();
            assert_eq!(first, expected);
            assert_eq!(second, expected);
            assert!(std::ptr::eq(
                first.units().as_ptr(),
                second.units().as_ptr()
            ));
        }
    }
}
#[test]
fn growth_denial_leaves_arena_unmodified_and_has_no_later_callback() {
    let mut paths = EvaluationPaths::default();
    let mut calls = 0;
    let mut meter = |_: usize| {
        calls += 1;
        if calls == 2 {
            Err(EngineError::new("STOP", Utf16::default(), "growth"))
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    assert!(paths
        .append(&Utf16::default(), &Utf16::from("long~key"), false, &mut ctx)
        .is_err());
    drop(ctx);
    assert_eq!(calls, 2);
    assert_eq!(paths.scratch.capacity(), 0);
    assert!(paths.values.is_empty());
}
#[test]
fn nested_path_scope_restores_outer_arena_on_error_and_unwind() {
    let mut ctx = Context::catalog();
    assert!(ctx.evaluation_paths.is_none());
    ctx.with_evaluation_paths(|ctx| {
        let outer = ctx.evaluation_paths.clone().unwrap();
        let error = ctx
            .with_evaluation_paths::<()>(|_| {
                Err(EngineError::new("STOP", Utf16::default(), "nested"))
            })
            .unwrap_err();
        assert_eq!(error.code, "STOP");
        assert!(std::rc::Rc::ptr_eq(
            &outer,
            ctx.evaluation_paths.as_ref().unwrap()
        ));
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = ctx.with_evaluation_paths::<()>(|_| panic!("nested"));
        }));
        assert!(std::rc::Rc::ptr_eq(
            &outer,
            ctx.evaluation_paths.as_ref().unwrap()
        ));
        Ok(())
    })
    .unwrap();
    assert!(ctx.evaluation_paths.is_none());
}
#[test]
fn exact_name_symbols_commit_only_selected_branch_and_keep_separate_owners() {
    let mut ctx = Context::catalog();
    let mut parent = PropertyDelta::new(&mut ctx).unwrap();
    let mut success = parent.child(&mut ctx).unwrap();
    let mut rejected = parent.child(&mut ctx).unwrap();
    success.insert(&Utf16::from("kept"), &mut ctx).unwrap();
    rejected.insert(&Utf16::from("dropped"), &mut ctx).unwrap();
    drop(rejected);
    parent.merge(success, &mut ctx).unwrap();
    assert!(parent.contains(&Utf16::from("kept"), &mut ctx).unwrap());
    assert!(!parent.contains(&Utf16::from("dropped"), &mut ctx).unwrap());
    let mut foreign = PropertyDelta::new(&mut ctx).unwrap();
    foreign
        .insert(&Utf16::from("different slot zero"), &mut ctx)
        .unwrap();
    parent.merge(foreign, &mut ctx).unwrap();
    assert!(parent
        .contains(&Utf16::from("different slot zero"), &mut ctx)
        .unwrap());
}
#[test]
fn planned_and_unplanned_annotations_and_ordered_errors_match() {
    // Borrowed and copying root admission share ONE validator. Ordered invalid
    // root refusal must precede catalogue conflicts in both compiler routes.
    let invalid = Value::Object(vec![(Utf16::from("default"), Value::Number(f64::NAN))]);
    for value in [
        invalid.clone(),
        Value::Object(vec![
            (Utf16::from("x"), Value::Bool(true)),
            (Utf16::from("x"), Value::Null),
        ]),
    ] {
        let a = schema_json_with_mode(&value, &mut Context::catalog(), false, false).unwrap_err();
        let b = copy_schema_json(&value, &mut Context::catalog(), false).unwrap_err();
        assert_eq!(a, b);
    }
    let bad_catalogue = SchemaResources {
        entries: vec![
            (Utf16::from("https://conflict"), Value::Bool(true)),
            (Utf16::from("https://conflict"), Value::Bool(false)),
        ],
    };
    let ordinary =
        CompiledSchema::compile(&invalid, &bad_catalogue, &mut Context::catalog()).unwrap_err();
    let mut ctx = Context::catalog();
    let owned = ctx
        .with_codegen_construction(|ctx| CompiledSchema::compile(&invalid, &bad_catalogue, ctx))
        .unwrap_err();
    assert_eq!(ordinary, owned);
    assert_eq!(owned.code, "NUMBER");
    assert_eq!(owned.path, Utf16::from("#/default"));

    let source = r#"{"type":"object","anyOf":[{"properties":{"a":{"type":"integer"}}},{"properties":{"b":{"type":"string"}}}],"unevaluatedProperties":false}"#;
    let mut owner = compiled(source);
    let value = json(r#"{"a":"bad","b":3,"x":true}"#);
    let planned = owner
        .validate_codegen_errors(&value, &mut Context::catalog())
        .unwrap();
    owner.owner_plans = None;
    owner.cold_resource_index = None;
    let unplanned = owner
        .validate_codegen_errors(&value, &mut Context::catalog())
        .unwrap();
    assert_eq!(planned, unplanned);
}
#[test]
fn shared_text_keeps_exact_equality_order_hash_and_lone_surrogates() {
    use std::hash::{Hash, Hasher};
    let owned = Utf16::new(vec![0xd800, 47, 126]);
    let shared = Utf16::shared(owned.units().to_vec());
    assert_eq!(owned.clone_work(), owned.len());
    assert_eq!(shared.clone_work(), 1);
    assert_eq!(owned, shared);
    assert_eq!(owned.cmp(&shared), std::cmp::Ordering::Equal);
    let mut a = std::collections::hash_map::DefaultHasher::new();
    let mut b = std::collections::hash_map::DefaultHasher::new();
    owned.hash(&mut a);
    shared.hash(&mut b);
    assert_eq!(a.finish(), b.finish());
    let mut detached = shared.clone().into_units();
    detached[0] = 65;
    assert_eq!(shared.units(), owned.units());
    assert_ne!(detached.as_slice(), shared.units());
    assert_eq!(shared.into_units(), owned.into_units());
}
#[test]
fn a_foreign_owner_cannot_reuse_reference_ordinals_from_another_plan_store() {
    let first = compiled(
        r##"{"$defs":{"a":{"type":"integer"},"b":{"type":"string"}},"$ref":"#/$defs/a"}"##,
    );
    let second =
        compiled(r##"{"$defs":{"b":{"type":"null"},"a":{"type":"boolean"}},"$ref":"#/$defs/a"}"##);
    let rule = Value::string_utf8("#/$defs/a");
    let path = Utf16::from("#/$ref");
    let store = first.owner_plans.as_ref().unwrap();
    store
        .resolve(&first, &rule, &path, None, &mut Context::catalog())
        .unwrap();
    let actual = store
        .resolve(&second, &rule, &path, None, &mut Context::catalog())
        .unwrap();
    let oracle = second
        .resolve_ref_unplanned(&rule, &path, None, &mut Context::catalog())
        .unwrap();
    assert_eq!(actual, oracle);
    assert_eq!(actual.0, &json(r#"{"type":"boolean"}"#));
}
#[test]
fn reentrant_cache_growth_uses_original_resolver_without_an_underadmitted_search() {
    let owner = compiled(r##"{"$defs":{"a":{"type":"integer"},"b":{"type":"string"}}}"##);
    let store = owner.owner_plans.as_ref().unwrap();
    let path = Utf16::from("#/$ref");
    let a = Value::string_utf8("#/$defs/a");
    let b = Value::string_utf8("#/$defs/b");
    store
        .resolve(&owner, &a, &path, None, &mut Context::catalog())
        .unwrap();
    let phase = std::cell::Cell::new("outside");
    let role = std::cell::Cell::new("core");
    let mut calls = 0;
    let mut reentered = false;
    let mut original_entered = false;
    let mut meter = |_: usize| {
        calls += 1;
        if calls == 2 {
            reentered = true;
            store
                .resolve(&owner, &b, &path, None, &mut Context::catalog())
                .unwrap();
        }
        if phase.get() == "ctor.reference" {
            original_entered = true;
        }
        Ok(())
    };
    let mut ctx = Context::catalog()
        .with_meter(&mut meter)
        .with_work_phase_observer(&phase)
        .with_constructor_root_observer(&role);
    let actual = store.resolve(&owner, &a, &path, None, &mut ctx).unwrap();
    drop(ctx);
    let oracle = owner
        .resolve_ref_unplanned(&a, &path, None, &mut Context::catalog())
        .unwrap();
    assert_eq!(actual, oracle);
    assert!(reentered);
    assert!(original_entered);
    assert_eq!(store.references.lock().unwrap().len(), 2);
}
#[test]
fn dynamic_root_and_catalogue_roles_keep_original_separate_backing() {
    let source = json(
        r##"{"$id":"https://plans.test/dynamic","$dynamicAnchor":"node","type":"object","properties":{"child":{"$dynamicRef":"#node"}}}"##,
    );
    let resources = SchemaResources {
        entries: vec![(Utf16::from("https://plans.test/dynamic"), source.clone())],
    };
    let mut ctx = Context::catalog();
    let owner = ctx
        .with_codegen_construction(|ctx| CompiledSchema::compile(&source, &resources, ctx))
        .unwrap();
    assert!(!std::ptr::eq(&*owner.schema, &owner.resources.entries[0].1));
    let oracle = owner.clone();
    let data = json(r#"{"child":{"child":7}}"#);
    assert_eq!(
        owner.validate(&data, &mut Context::catalog()).unwrap(),
        oracle.validate(&data, &mut Context::catalog()).unwrap()
    );
}

#[test]
fn first_duplicate_key_storage_is_admitted_before_materializer_or_child() {
    use std::cell::Cell;
    let key = Utf16::from("k".repeat(4096));
    let expected = (key.len() as u64 + 1) * tree_compare_bound(0) + key.len() as u64 + 1;
    let mut keys = BTreeSet::new();
    let mut path = Utf16::from("#/default/owned-path");
    let pointer = path.units().as_ptr();
    let materialized = Cell::new(false);
    let mut calls = Vec::new();
    let mut meter = |amount: usize| {
        calls.push(amount);
        Err(EngineError::new(
            "KEY_STOP",
            Utf16::from("/host"),
            "first key",
        ))
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    let error = schema_admission_key_with_copy(&key, &mut keys, &mut path, &mut ctx, |key| {
        materialized.set(true);
        key.units().to_vec()
    })
    .unwrap_err();
    drop(ctx);
    assert_eq!(calls, vec![expected as usize]);
    assert!(!materialized.get());
    assert!(keys.is_empty());
    assert_eq!(error.code, "KEY_STOP");
    assert_eq!(error.path, Utf16::from("/host"));
    assert_eq!(path.units().as_ptr(), pointer); // Host refusal never consumes/replaces its caller's path.

    // Reach this same first-key site through the real visitor. The root node
    // is admitted first; the second charge must include independent key storage.
    let value = Value::Object(vec![(key, Value::Null)]);
    let mut calls = Vec::new();
    let mut meter = |amount: usize| {
        calls.push(amount);
        if calls.len() == 2 {
            Err(EngineError::new(
                "KEY_STOP",
                Utf16::from("/host"),
                "first key",
            ))
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    let error = schema_json_with_mode(&value, &mut ctx, false, false).unwrap_err();
    drop(ctx);
    assert_eq!(calls, vec![1, expected as usize]);
    assert_eq!(error.code, "KEY_STOP");
}

#[test]
fn owned_node_control_denial_moves_original_path_without_a_clone_or_later_callback() {
    let mut path = Utf16::new("#/default/long-owned-node".encode_utf16().collect());
    assert!(path.len() > 1);
    assert_eq!(path.clone_work(), path.len()); // Genuine Owned, not Shared.
    let pointer = path.units().as_ptr();
    let mut count = 0;
    let mut calls = Vec::new();
    let mut cancelled = 0;
    let mut meter = |amount: usize| {
        calls.push(amount);
        Ok(())
    };
    let mut cancellation = || {
        cancelled += 1;
        true
    };
    let mut ctx = Context::catalog()
        .with_meter(&mut meter)
        .with_cancellation(&mut cancellation);
    let error = schema_admission_node(&mut path, 0, &mut count, &mut ctx).unwrap_err();
    drop(ctx);
    assert_eq!(calls, vec![1]);
    assert_eq!(cancelled, 1);
    assert_eq!(count, 0);
    assert_eq!(error.code, "CANCELLED");
    assert_eq!(error.message, Utf16::from("Operation cancelled"));
    assert_eq!(error.path.units().as_ptr(), pointer);
    assert!(path.is_empty());
    assert_eq!(error.path, Utf16::from("#/default/long-owned-node"));
}

#[test]
fn owned_count_denial_after_admitted_node_moves_path_and_preserves_first_error_order() {
    for (initial, message) in [
        (1, "JSON structural value limit exceeded"),
        (usize::MAX, "Schema value count overflow"),
    ] {
        let mut limits = crate::context::Limits::catalog();
        limits.max_values = 1;
        let mut path = Utf16::new("#/default/owned-count-path".encode_utf16().collect());
        assert_eq!(path.clone_work(), path.len());
        assert!(path.len() > 1);
        let pointer = path.units().as_ptr();
        let mut count = initial;
        let mut calls = Vec::new();
        let mut meter = |amount: usize| {
            calls.push(amount);
            Ok(())
        };
        let mut ctx = Context::with_limits(crate::context::ResourceProfile::Cooperative, limits)
            .unwrap()
            .with_meter(&mut meter);
        // Node control succeeds. Count refusal must precede this simultaneous
        // depth failure, with no later callback or path materialization.
        let error = schema_admission_node(&mut path, limits.max_depth + 1, &mut count, &mut ctx)
            .unwrap_err();
        drop(ctx);
        assert_eq!(calls, vec![1]);
        assert_eq!(error.code, "LIMIT");
        assert_eq!(error.message, Utf16::from(message));
        assert_eq!(error.path.units().as_ptr(), pointer);
        assert!(path.is_empty());
        assert_eq!(error.path, Utf16::from("#/default/owned-count-path"));
    }
}

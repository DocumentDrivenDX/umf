// SPDX-License-Identifier: MIT OR Apache-2.0
//! NK1 source-only controls; UNCOMPILED / NATIVE UNEXECUTED. Child owned_plans.
//! All cursors/owners come from real compilation. Empty Default caches carry no proof.
use super::*;
use std::cell::{Cell, RefCell};
use std::panic::{AssertUnwindSafe, catch_unwind};
const SOURCE: &str =
    r#"{"type":"object","properties":{"left":{"type":"string"},"right":{"minimum":7}}}"#;
fn json(source: &str) -> Value {
    crate::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn resources() -> SchemaResources {
    SchemaResources {
        entries: vec![(
            Utf16::from("https://nk.test/target"),
            json(r#"{"$id":"https://nk.test/target","type":"boolean"}"#),
        )],
    }
}
fn admitted(source: &str) -> CompiledSchema {
    let mut ctx = Context::catalog();
    let owner = ctx
        .with_codegen_construction(|ctx| CompiledSchema::compile(&json(source), &resources(), ctx))
        .unwrap();
    assert!(owner.owner_plans.is_some());
    assert!(owner.owner_locations.is_some());
    assert!(!ctx.in_codegen_construction());
    owner
}
fn plans(owner: &CompiledSchema) -> &OwnerPlans {
    owner.owner_plans.as_ref().unwrap()
}
fn root(owner: &CompiledSchema) -> OwnerCursor {
    owner
        .owner_locations
        .as_ref()
        .unwrap()
        .root(owner, 0, &mut Context::catalog())
        .unwrap()
        .unwrap()
}
fn children(owner: &CompiledSchema) -> (OwnerCursor, OwnerCursor) {
    let table = owner.owner_locations.as_ref().unwrap();
    let top = root(owner);
    let props = table
        .child(owner, &top, 1, &mut Context::catalog())
        .unwrap()
        .unwrap();
    assert_eq!(
        table.read(owner, &props, &mut Context::catalog()).unwrap(),
        get(&*owner.schema, "properties")
    );
    let left = table
        .child(owner, &props, 0, &mut Context::catalog())
        .unwrap()
        .unwrap();
    let right = table
        .child(owner, &props, 1, &mut Context::catalog())
        .unwrap()
        .unwrap();
    assert_eq!(
        left.get(owner, &mut Context::catalog()).unwrap(),
        &json(r#"{"type":"string"}"#)
    );
    assert_eq!(
        right.get(owner, &mut Context::catalog()).unwrap(),
        &json(r#"{"minimum":7}"#)
    );
    (left, right)
}
fn key(owner: &CompiledSchema, cursor: &OwnerCursor, compiler: bool) -> NodePlanKey {
    let real = cursor
        .logical_position(owner, &mut Context::catalog())
        .unwrap()
        .unwrap();
    assert_eq!(
        Some(real),
        cursor
            .logical_position_for_test(owner, &mut Context::catalog())
            .unwrap()
    );
    (real.1, compiler) // output readback only; never supplied as eligibility
}
fn stored(
    cache: &OwnerPlans,
    owner: &CompiledSchema,
    cursor: &OwnerCursor,
    compiler: bool,
) -> Option<Arc<NodePlan>> {
    let actual_key = key(owner, cursor, compiler);
    cache.nodes.lock().unwrap().get(&actual_key).cloned()
}
fn node(
    cache: &OwnerPlans,
    owner: &CompiledSchema,
    cursor: &OwnerCursor,
    path: &str,
    compiler: bool,
) -> Arc<NodePlan> {
    let value = cursor.get(owner, &mut Context::catalog()).unwrap();
    cache
        .node_at(
            owner,
            value,
            &Utf16::from(path),
            compiler,
            Some(cursor),
            &mut Context::catalog(),
        )
        .unwrap()
        .unwrap()
}
fn expected(plan: &NodePlan, names: &[&str], has_ref: bool) {
    assert_eq!(
        plan.keywords,
        names
            .iter()
            .map(|s| Some((*s).to_owned()))
            .collect::<Vec<_>>()
    );
    assert_eq!(plan.has_ref, has_ref);
}
fn host_error() -> EngineError {
    let mut e = EngineError::new(
        "NK1_HOST",
        Utf16::new(vec![35, 47, 0xd800]),
        "first logical-key denial",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("nk1-host-δ"));
    e.with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference)
}
fn check_host(e: &EngineError) {
    let original = host_error();
    assert_eq!(e.code, original.code);
    assert_eq!(e.path, original.path);
    assert_eq!(e.message, original.message);
    assert_eq!(e.python_message_origin, original.python_message_origin);
    assert!(e.is_control_failure());
    assert!(!e.is_python_schema_terminal());
}
fn trace(
    owner: &CompiledSchema,
    cursor: &OwnerCursor,
    warm: bool,
) -> (Vec<usize>, Vec<(usize, &'static str)>) {
    let cache = OwnerPlans::default();
    if warm {
        node(&cache, owner, cursor, "#/warm", false);
    }
    let calls = Cell::new(0usize);
    let amounts = RefCell::new(Vec::new());
    let events = RefCell::new(Vec::new());
    let mut control = |amount| {
        calls.set(calls.get() + 1);
        amounts.borrow_mut().push(amount);
        Ok(())
    };
    let value = cursor.get(owner, &mut Context::catalog()).unwrap();
    cache
        .node_at_with_events(
            owner,
            value,
            &Utf16::from("#/observed"),
            false,
            Some(cursor),
            &mut Context::catalog().with_host_control(&mut control),
            &mut |e| events.borrow_mut().push((calls.get(), e)),
        )
        .unwrap()
        .unwrap();
    (amounts.into_inner(), events.into_inner())
}

#[test]
fn nk01_same_validated_node_mode_different_diagnostic_paths_reuse_original_arc() {
    let owner = admitted(SOURCE);
    let cursor = root(&owner);
    let cache = plans(&owner);
    let first = node(cache, &owner, &cursor, "#/first", false);
    expected(&first, &["type", "properties"], false);
    let second = node(cache, &owner, &cursor, "#/other~1☃", false);
    assert!(Arc::ptr_eq(&first, &second));
    assert!(first.locator.same_location(&cursor));
    assert_eq!(
        first.locator.get(&owner, &mut Context::catalog()).unwrap(),
        &json(SOURCE)
    );
    let actual = stored(cache, &owner, &cursor, false).unwrap();
    assert!(Arc::ptr_eq(&first, &actual));
}

#[test]
fn nk02_same_diagnostic_path_distinct_genuine_nodes_preserve_both_plans() {
    let owner = admitted(SOURCE);
    let (left, right) = children(&owner);
    let cache = plans(&owner);
    assert_ne!(key(&owner, &left, false), key(&owner, &right, false));
    let first = node(cache, &owner, &left, "#/same", false);
    expected(&first, &["type"], false);
    let second = node(cache, &owner, &right, "#/same", false);
    expected(&second, &["minimum"], false);
    assert!(!Arc::ptr_eq(&first, &second));
    assert!(Arc::ptr_eq(
        &first,
        &node(cache, &owner, &left, "#/same", false)
    ));
    assert!(Arc::ptr_eq(
        &second,
        &node(cache, &owner, &right, "#/same", false)
    ));
    assert_eq!(
        first.locator.get(&owner, &mut Context::catalog()).unwrap(),
        &json(r#"{"type":"string"}"#)
    );
    assert_eq!(
        second.locator.get(&owner, &mut Context::catalog()).unwrap(),
        &json(r#"{"minimum":7}"#)
    );
    assert!(stored(cache, &owner, &left, false).is_some());
    assert!(stored(cache, &owner, &right, false).is_some());
}

#[test]
fn nk03_actual_shared_bank_storage_has_distinct_logical_roles_and_global_keys() {
    let mut ctx = Context::catalog();
    let owner = ctx
        .with_codegen_construction(|ctx| {
            let input = crate::engine::ResourceSet::new(
                json(r#"{"$id":"https://nk.test/core","type":"object"}"#),
                json(r#"{"$id":"https://nk.test/ref","type":"string"}"#),
                json(r#"{"$id":"https://nk.test/package","type":"boolean"}"#),
                json(r#"{"opaque":true}"#),
                json(r#"{"opaque-policy":null}"#),
            );
            let admitted = admitted_bank::SchemaBank::admit_core(input, ctx)?;
            CompiledSchema::compile_input_bank(admitted.bank, 0, ctx)
        })
        .unwrap();
    let table = owner
        .owner_locations
        .as_ref()
        .expect("real admitted-bank table");
    let a = table.root(&owner, 0, &mut ctx).unwrap().unwrap();
    let b = table.root(&owner, 1, &mut ctx).unwrap().unwrap();
    let position_a = a.logical_position(&owner, &mut ctx).unwrap().unwrap();
    let position_b = b.logical_position(&owner, &mut ctx).unwrap().unwrap();
    assert_eq!((position_a.0, position_b.0), (0, 1));
    assert_ne!(position_a.1, position_b.1);
    let actual_a = table.read(&owner, &a, &mut ctx).unwrap().unwrap();
    let actual_b = table.read(&owner, &b, &mut ctx).unwrap().unwrap();
    assert_eq!(
        actual_a,
        &json(r#"{"$id":"https://nk.test/core","type":"object"}"#)
    );
    assert_eq!(actual_a, actual_b);
    assert!(
        std::ptr::eq(actual_a, actual_b),
        "genuine shared backing precondition, not eligibility authority"
    );
    let first = node(plans(&owner), &owner, &a, "#/same", false);
    let second = node(plans(&owner), &owner, &b, "#/same", false);
    assert!(!Arc::ptr_eq(&first, &second));
    expected(&first, &["$id", "type"], false);
    expected(&second, &["$id", "type"], false);
    assert!(first.locator.same_location(&a));
    assert!(second.locator.same_location(&b));
    assert!(Arc::ptr_eq(
        &first,
        &node(plans(&owner), &owner, &a, "#/alias", false)
    ));
    assert!(Arc::ptr_eq(
        &second,
        &node(plans(&owner), &owner, &b, "#/alias", false)
    ));
    assert!(
        plans(&owner)
            .nodes
            .lock()
            .unwrap()
            .contains_key(&(position_a.1, false))
    );
    assert!(
        plans(&owner)
            .nodes
            .lock()
            .unwrap()
            .contains_key(&(position_b.1, false))
    );
}

#[test]
fn nk04_compiler_mode_and_exact_limits_never_reuse_incompatible_metadata() {
    let owner = admitted(r#"{"minimum":7,"type":"number"}"#);
    let cursor = root(&owner);
    let cache = plans(&owner);
    let eval = node(cache, &owner, &cursor, "#/one", false);
    let compiler = node(cache, &owner, &cursor, "#/two", true);
    expected(&eval, &["minimum", "type"], false);
    expected(&compiler, &["minimum", "type"], false);
    assert!(!Arc::ptr_eq(&eval, &compiler));
    assert!(eval.compiler_order.is_none());
    assert_eq!(compiler.compiler_order, Some(vec![(0, 1), (14, 0)])); // literal type/minimum ranks
    assert!(Arc::ptr_eq(
        &eval,
        &node(cache, &owner, &cursor, "#/three", false)
    ));
    assert!(Arc::ptr_eq(
        &compiler,
        &node(cache, &owner, &cursor, "#/four", true)
    ));
    let mut limits = crate::context::Limits::catalog();
    limits.max_text_units -= 1;
    let mut changed =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let rebuilt = cache
        .node_at(
            &owner,
            &*owner.schema,
            &Utf16::from("#/changed"),
            false,
            Some(&cursor),
            &mut changed,
        )
        .unwrap()
        .unwrap();
    assert!(!Arc::ptr_eq(&eval, &rebuilt));
    assert_eq!(rebuilt.limits, limits);
    expected(&rebuilt, &["minimum", "type"], false);
    let mut limits = crate::context::Limits::catalog();
    limits.max_values = 0;
    let mut narrow =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    assert!(
        cache
            .node_at(
                &owner,
                &*owner.schema,
                &Utf16::from("#/zero"),
                false,
                Some(&cursor),
                &mut narrow
            )
            .unwrap()
            .is_none()
    );
    assert_eq!(eval.limits, crate::context::Limits::catalog()); // original Arc payload never rewritten
}

#[test]
fn nk05_owner_move_foreign_equal_owner_untracked_and_wrong_readback_fallback() {
    let owner = admitted(SOURCE);
    let foreign = admitted(SOURCE);
    let cursor = root(&owner);
    let other = root(&foreign);
    let first = node(plans(&owner), &owner, &cursor, "#/original", false);
    assert_eq!(&*owner.schema, &*foreign.schema);
    assert!(
        plans(&owner)
            .node_at(
                &foreign,
                &*foreign.schema,
                &Utf16::from("#/same"),
                false,
                Some(&other),
                &mut Context::catalog()
            )
            .unwrap()
            .is_none()
    );
    assert!(
        plans(&owner)
            .node_at(
                &owner,
                &*owner.schema,
                &Utf16::from("#/same"),
                false,
                Some(&other),
                &mut Context::catalog()
            )
            .unwrap()
            .is_none()
    );
    assert!(
        plans(&owner)
            .node_at(
                &owner,
                &*foreign.schema,
                &Utf16::from("#/same"),
                false,
                Some(&cursor),
                &mut Context::catalog()
            )
            .unwrap()
            .is_none()
    );
    assert!(
        plans(&owner)
            .node_at(
                &owner,
                &*owner.schema,
                &Utf16::from("#/same"),
                false,
                None,
                &mut Context::catalog()
            )
            .unwrap()
            .is_none()
    );
    let (left, right) = children(&owner);
    let right_value = right.get(&owner, &mut Context::catalog()).unwrap();
    assert!(
        plans(&owner)
            .node_at(
                &owner,
                right_value,
                &Utf16::from("#/same"),
                false,
                Some(&left),
                &mut Context::catalog()
            )
            .unwrap()
            .is_none()
    );
    let table = owner.owner_locations.as_ref().unwrap();
    let scalar = table
        .child(&owner, &cursor, 0, &mut Context::catalog())
        .unwrap()
        .unwrap();
    let scalar_value = scalar.get(&owner, &mut Context::catalog()).unwrap();
    assert_eq!(scalar_value, &Value::string_utf8("object"));
    assert!(
        plans(&owner)
            .node_at(
                &owner,
                scalar_value,
                &Utf16::from("#/same"),
                false,
                Some(&scalar),
                &mut Context::catalog()
            )
            .unwrap()
            .is_none()
    );
    let mut limits = crate::context::Limits::catalog();
    limits.max_depth = 0;
    let mut shallow =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let left_value = left.get(&owner, &mut Context::catalog()).unwrap();
    assert!(
        plans(&owner)
            .node_at(
                &owner,
                left_value,
                &Utf16::from("#/shallow"),
                false,
                Some(&left),
                &mut shallow
            )
            .unwrap()
            .is_none()
    );
    let moved = Box::new(owner);
    assert!(Arc::ptr_eq(
        &first,
        &node(plans(&moved), &moved, &cursor, "#/moved", false)
    ));
    let cloned = (*moved).clone();
    assert!(cloned.owner_plans.is_none());
    assert!(cloned.owner_locations.is_none());
    assert!(
        plans(&moved)
            .node_at(
                &cloned,
                &*cloned.schema,
                &Utf16::from("#/clone"),
                false,
                Some(&cursor),
                &mut Context::catalog()
            )
            .unwrap()
            .is_none()
    );
    for value in [
        json(r#"{"left":"ok","right":8}"#),
        json(r#"{"left":7,"right":6}"#),
    ] {
        assert_eq!(
            moved.validate(&value, &mut Context::catalog()),
            cloned.validate(&value, &mut Context::catalog())
        );
    }
}

#[test]
fn nk06_real_constructor_policy_modes_remain_original_optional_fallback() {
    let owner = admitted(SOURCE);
    let cursor = root(&owner);
    node(plans(&owner), &owner, &cursor, "#/bind", false);
    for mode in 0..5 {
        let mut ctx = Context::catalog();
        let alternative = ctx
            .with_codegen_construction(|ctx| {
                let policy = if mode == 4 {
                    KeywordPolicy {
                        validation: false,
                        ..KeywordPolicy::DRAFT2020
                    }
                } else {
                    KeywordPolicy::DRAFT2020
                };
                CompiledSchema::compile_inner(
                    &json(SOURCE),
                    &resources(),
                    if mode == 0 {
                        SchemaDialect::Draft7
                    } else {
                        SchemaDialect::Draft2020_12
                    },
                    mode != 1,
                    if mode == 2 {
                        RegexProfile::Python(PythonReVersion::V3_11)
                    } else {
                        RegexProfile::Ecma262Unicode
                    },
                    mode != 3,
                    false,
                    false,
                    true,
                    policy,
                    ctx,
                )
            })
            .unwrap();
        // Actual constructor eligibility is observed; no lineage/policy mutation.
        if mode == 0 {
            assert!(alternative.owner_plans.is_some());
            let actual_cursor = root(&alternative);
            let own = node(
                plans(&alternative),
                &alternative,
                &actual_cursor,
                "#/draft7",
                false,
            );
            expected(&own, &["type", "properties"], false);
            assert!(
                plans(&owner)
                    .node_at(
                        &alternative,
                        &*alternative.schema,
                        &Utf16::from("#/mode"),
                        false,
                        Some(&actual_cursor),
                        &mut Context::catalog()
                    )
                    .unwrap()
                    .is_none()
            );
        } else {
            assert!(alternative.owner_plans.is_none());
            assert!(alternative.owner_locations.is_none());
            let empty = OwnerPlans::default();
            assert!(
                empty
                    .node_at(
                        &alternative,
                        &*alternative.schema,
                        &Utf16::from("#/mode"),
                        false,
                        None,
                        &mut Context::catalog()
                    )
                    .unwrap()
                    .is_none()
            );
        }
        let raw = alternative.clone();
        for value in [json(r#"{"left":"ok"}"#), json(r#"{"left":7}"#)] {
            assert_eq!(
                alternative.validate(&value, &mut Context::catalog()),
                raw.validate(&value, &mut Context::catalog())
            );
        }
    }
}

#[test]
fn nk07_frame_static_and_evaluation_reference_keys_keep_original_target_path_rules() {
    let owner = admitted(r#"{"$ref":"https://nk.test/target","title":"kept"}"#);
    let cursor = root(&owner);
    let cache = plans(&owner);
    let ref_plan = node(cache, &owner, &cursor, "#/ref", false);
    expected(&ref_plan, &["$ref", "title"], true);
    let reference = Value::string_utf8("https://nk.test/target");
    for path in [
        Utf16::from("https://nk.test/a#"),
        Utf16::from("https://nk.test/b#"),
    ] {
        for applied in [false, true] {
            let expected = owner
                .effective_frame_unplanned(&*owner.schema, &path, applied, &mut Context::catalog())
                .unwrap();
            let actual = cache
                .frame_at(
                    &owner,
                    &*owner.schema,
                    &path,
                    applied,
                    Some(&cursor),
                    &mut Context::catalog(),
                )
                .unwrap();
            assert_eq!(actual, expected);
        }
        let expected = owner
            .resolve_ref_unplanned(&reference, &path, None, &mut Context::catalog())
            .unwrap();
        let actual = cache
            .resolve_located(&owner, &reference, &path, None, &mut Context::catalog())
            .unwrap();
        assert_eq!((actual.0, &actual.1), (expected.0, &expected.1));
        assert_eq!(get(actual.0, "type"), Some(&Value::string_utf8("boolean")));
        let expected = owner
            .resolve_eval_ref_unplanned(&reference, &path, &mut Context::catalog())
            .unwrap();
        let actual = cache
            .resolve_eval_located(&owner, &reference, &path, &mut Context::catalog())
            .unwrap();
        assert_eq!((actual.0, actual.1, actual.2), expected);
    }
    let frames = cache
        .frames
        .lock()
        .unwrap()
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    let references = cache
        .references
        .lock()
        .unwrap()
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    let evaluations = cache
        .evaluations
        .lock()
        .unwrap()
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    assert!(frames.iter().any(|(_, applied)| *applied));
    assert!(frames.iter().any(|(_, applied)| !*applied));
    assert!(!references.is_empty());
    assert!(!evaluations.is_empty());
    let retained = node(cache, &owner, &cursor, "#/different-diagnostic", false);
    assert!(Arc::ptr_eq(&ref_plan, &retained));
    assert_eq!(
        frames,
        cache
            .frames
            .lock()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>()
    );
    assert_eq!(
        references,
        cache
            .references
            .lock()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>()
    );
    assert_eq!(
        evaluations,
        cache
            .evaluations
            .lock()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>()
    );
}

#[test]
fn nk08_real_cold_and_warm_callback_denial_cannot_publish_or_damage_existing_plan() {
    let owner = admitted(SOURCE);
    let cursor = root(&owner);
    let value = cursor.get(&owner, &mut Context::catalog()).unwrap();
    for warm in [false, true] {
        let (amounts, baseline) = trace(&owner, &cursor, warm);
        if warm {
            assert_eq!(
                baseline.iter().map(|(_, e)| *e).collect::<Vec<_>>(),
                vec!["node-key-and-lookup"]
            );
        } else {
            for required in [
                "node-key-and-lookup",
                "node-metadata-reserve",
                "node-keyword-decode",
                "node-plan-header",
                "node-publication-attempt",
            ] {
                assert!(baseline.iter().any(|(_, e)| *e == required));
            }
        }
        for deny in 1..=amounts.len() {
            let cache = OwnerPlans::default();
            let retained = if warm {
                Some(node(&cache, &owner, &cursor, "#/warm", false))
            } else {
                None
            };
            let calls = Cell::new(0usize);
            let mut control = |amount| {
                calls.set(calls.get() + 1);
                assert!(calls.get() <= deny);
                assert_eq!(amount, amounts[calls.get() - 1]);
                if calls.get() == deny {
                    Err(host_error())
                } else {
                    Ok(())
                }
            };
            let mut ctx = Context::catalog().with_host_control(&mut control);
            let mut events = Vec::new();
            let error = cache
                .node_at_with_events(
                    &owner,
                    value,
                    &Utf16::from("#/observed"),
                    false,
                    Some(&cursor),
                    &mut ctx,
                    &mut |e| events.push((calls.get(), e)),
                )
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
            if let Some(retained) = retained {
                let current = stored(&cache, &owner, &cursor, false).unwrap();
                assert!(Arc::ptr_eq(&retained, &current));
            } else {
                assert!(cache.nodes.lock().unwrap().is_empty());
            }
        }
    }
}

#[test]
fn nk09_reentry_size_guards_and_observer_unwind_preserve_complete_metadata_only() {
    let owner = admitted(SOURCE);
    let top = root(&owner);
    let (left, _) = children(&owner);
    let value = top.get(&owner, &mut Context::catalog()).unwrap();
    let (_, baseline) = trace(&owner, &top, false);
    for target in ["node-key-and-lookup", "node-publication-attempt"] {
        let at = baseline.iter().find(|(_, e)| *e == target).unwrap().0;
        let cache = OwnerPlans::default();
        let calls = Cell::new(0usize);
        let entered = Cell::new(false);
        let inner = RefCell::new(None);
        let mut control = |_| {
            calls.set(calls.get() + 1);
            if calls.get() == at && !entered.replace(true) {
                inner.replace(Some(node(&cache, &owner, &left, "#/reentrant", false)));
            }
            Ok(())
        };
        let mut events = Vec::new();
        let mut ctx = Context::catalog().with_host_control(&mut control);
        let result = cache
            .node_at_with_events(
                &owner,
                value,
                &Utf16::from("#/observed"),
                false,
                Some(&top),
                &mut ctx,
                &mut |e| events.push(e),
            )
            .unwrap();
        assert!(entered.get());
        let published = stored(&cache, &owner, &left, false).unwrap();
        assert!(Arc::ptr_eq(inner.borrow().as_ref().unwrap(), &published));
        assert!(!stored(&cache, &owner, &top, false).is_some());
        if target == "node-key-and-lookup" {
            assert!(result.is_none());
            assert!(!events.contains(&"node-metadata-reserve"));
        } else {
            let candidate = result.unwrap();
            expected(&candidate, &["type", "properties"], false);
            assert!(events.contains(&"node-publication-attempt"));
        }
        let before = ctx.charged_work();
        drop(ctx);
        drop(control);
        let retry = node(&cache, &owner, &top, "#/retry", false);
        expected(&retry, &["type", "properties"], false);
        assert!(before > 0);
    }
    for target in [
        "node-key-and-lookup",
        "node-metadata-reserve",
        "node-keyword-decode",
        "node-plan-header",
        "node-publication-attempt",
    ] {
        let cache = OwnerPlans::default();
        let mut ctx = Context::catalog();
        let mut events = Vec::new();
        let result = catch_unwind(AssertUnwindSafe(|| {
            ctx.with_codegen_construction(|ctx| {
                cache.node_at_with_events(
                    &owner,
                    value,
                    &Utf16::from("#/panic"),
                    false,
                    Some(&top),
                    ctx,
                    &mut |e| {
                        events.push(e);
                        if e == target {
                            panic!("logical node observer unwind");
                        }
                    },
                )
            })
        }));
        assert!(result.is_err());
        assert_eq!(events.last(), Some(&target));
        assert!(!ctx.in_codegen_construction());
        assert!(cache.nodes.lock().unwrap().is_empty());
        let before = ctx.charged_work();
        let plan = cache
            .node_at(
                &owner,
                value,
                &Utf16::from("#/after"),
                false,
                Some(&top),
                &mut ctx,
            )
            .unwrap()
            .unwrap();
        expected(&plan, &["type", "properties"], false);
        assert!(ctx.charged_work() > before);
    }
}

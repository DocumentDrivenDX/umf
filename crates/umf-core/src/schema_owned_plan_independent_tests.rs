// SPDX-License-Identifier: MIT OR Apache-2.0
//! Independent ER1–ER3 controls. SOURCE ONLY / NATIVE CASES UNEXECUTED.
//! Integrate as a separate cfg(test) child of schema_owned_plans.rs.
//! Every plan below comes from real compilation/resolution; no fabricated proof,
//! eligibility implementation, new debug API, or hard-coded work-count oracle.
use super::*;
use std::cell::Cell;
use std::rc::Rc;

fn json(source: &str) -> Value {
    crate::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}

fn admitted(source: &Value, resources: &SchemaResources) -> CompiledSchema {
    let mut ctx = Context::catalog();
    let compiled = ctx
        .with_codegen_construction(|ctx| CompiledSchema::compile(source, resources, ctx))
        .unwrap();
    assert!(
        compiled.owner_plans.is_some(),
        "must reach the owned-plan path"
    );
    assert!(ctx.schema_construction.is_none());
    compiled
}

fn plans(owner: &CompiledSchema) -> &OwnerPlans {
    owner.owner_plans.as_ref().expect("genuine admitted plans")
}

fn published(
    owner: &CompiledSchema,
    reference: &Value,
    path: &Utf16,
    scope: Option<&str>,
) -> Arc<ReferencePlan> {
    let Value::String(text) = reference else {
        panic!("string test reference")
    };
    plans(owner)
        .references
        .lock()
        .unwrap()
        .get(&(path.clone(), text.clone(), scope.map(str::to_owned)))
        .cloned()
        .expect("the actual resolver must have published a complete plan")
}

fn resolver_parity(owner: &CompiledSchema, text: &str, path: &Utf16, scope: Option<&str>) {
    // The existing public Clone deliberately drops index/plan caches. This is
    // the original resolver oracle, not a second test-written resolver.
    let fallback = (*owner).clone();
    assert!(fallback.owner_plans.is_none());
    assert!(fallback.cold_resource_index.is_none());
    let reference = Value::string_utf8(text);
    let expected = fallback.resolve_ref_unplanned(&reference, path, scope, &mut Context::catalog());
    let actual = owner.resolve_ref_scoped(&reference, path, scope, &mut Context::catalog());
    assert!(
        expected.is_ok(),
        "authored positive fixture must resolve in the original resolver: {text}"
    );
    assert!(
        actual.is_ok(),
        "optimized resolver must reach the target: {text}"
    );
    assert_eq!(actual, expected, "complete target/path/error for {text}");
}

fn catalogue(first_type: &str) -> SchemaResources {
    SchemaResources {
        entries: vec![
            (
                Utf16::from("https://sidecar.test/retrieval"),
                json(&format!(
                    r##"{{"$id":"https://sidecar.test/authored","type":"{first_type}","$defs":{{"a/b~☃":{{"type":"string"}},"nested":{{"$id":"child","$anchor":"leaf","type":"boolean"}}}}}}"##
                )),
            ),
            (
                Utf16::from("https://sidecar.test/other"),
                json(r#"{"$id":"https://sidecar.test/authored","type":"null"}"#),
            ),
        ],
    }
}

#[test]
fn pinned_twenty_first_admission_and_real_warm_reference_plans_match_original() {
    let source =
        json(r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object"}"#);
    let pinned = json(include_str!("schema_metas.json"));
    let Value::Array(entries) = get(&pinned, "resources").unwrap() else {
        panic!("pinned resources")
    };
    assert_eq!(entries.len(), 20);
    let expected_ids: Vec<_> = entries
        .iter()
        .map(|v| get(v, "id").unwrap().clone())
        .collect();
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        assert!(
            ctx.schema_construction
                .as_ref()
                .unwrap()
                .borrow()
                .meta_validators
                .is_empty()
        );
        assert!(
            ctx.schema_construction
                .as_ref()
                .unwrap()
                .borrow()
                .metas
                .is_none()
        );
        let _compiled = CompiledSchema::compile(&source, &SchemaResources::default(), ctx)?;
        // Observe the validator actually built/published by the production
        // metaschema admission. Do not manually construct a CompiledSchema.
        let meta = {
            let state = ctx.schema_construction.as_ref().unwrap().borrow();
            Arc::clone(
                &state
                    .meta_validators
                    .iter()
                    .find(|(_, dialect, _)| *dialect == SchemaDialect::Draft2020_12)
                    .unwrap()
                    .2,
            )
        };
        assert_eq!(meta.resources.entries.len(), 20);
        assert_eq!(
            meta.resources
                .entries
                .iter()
                .map(|(id, _)| Value::String(id.clone()))
                .collect::<Vec<_>>(),
            expected_ids
        );
        assert!(meta.owner_plans.is_some());
        let index = meta
            .cold_resource_index
            .as_ref()
            .expect("the complete pinned catalogue must publish its index");
        let path = Utf16::from("https://json-schema.org/draft/2020-12/schema#");
        for (id, resource) in &meta.resources.entries {
            let ordinal = index
                .lookup(id.units(), ctx)?
                .expect("pinned retrieval lookup");
            assert_eq!(index.root(&meta, ordinal), resource);
            let text = id.to_utf8().unwrap();
            resolver_parity(&meta, &text, &path, None);
            let reference = Value::String(id.clone());
            let (original_target, _) = meta.resolve_ref_unplanned(&reference, &path, None, ctx)?;
            assert!(std::ptr::eq(index.root(&meta, ordinal), original_target));
            let before = published(&meta, &reference, &path, None);
            let (target, target_path) =
                plans(&meta).resolve(&meta, &reference, &path, None, ctx)?;
            assert!(std::ptr::eq(before.target.get(&meta, ctx)?, target));
            assert_eq!(target_path, before.path);
            assert!(Arc::ptr_eq(
                &before,
                &published(&meta, &reference, &path, None)
            ));
            let oracle = (*meta).clone();
            let expected_eval =
                oracle.resolve_eval_ref_unplanned(&reference, &path, &mut Context::catalog())?;
            assert_eq!(
                plans(&meta).resolve_eval(&meta, &reference, &path, ctx)?,
                expected_eval
            );
            let key = (path.clone(), id.clone());
            let evaluated_plan = plans(&meta)
                .evaluations
                .lock()
                .unwrap()
                .get(&key)
                .cloned()
                .unwrap();
            assert_eq!(
                plans(&meta).resolve_eval(&meta, &reference, &path, ctx)?,
                expected_eval
            );
            assert!(Arc::ptr_eq(
                &evaluated_plan,
                &plans(&meta)
                    .evaluations
                    .lock()
                    .unwrap()
                    .get(&key)
                    .cloned()
                    .unwrap()
            ));
        }
        let fallback = (*meta).clone();
        for (instance, valid) in [
            (source.clone(), true),
            (json(r#"{"type":"not-a-json-schema-type"}"#), false),
        ] {
            let expected = fallback.validate(&instance, &mut Context::catalog())?;
            let actual = meta.validate(&instance, ctx)?;
            assert_eq!(actual, expected);
            assert_eq!(actual.is_empty(), valid);
        }
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.schema_construction.is_none());
}

#[test]
fn aliases_percent_fragments_nested_ids_and_moves_keep_owner_relative_targets() {
    let root = json(r#"{"$id":"https://sidecar.test/root","type":"object"}"#);
    let owner = admitted(&root, &catalogue("integer"));
    assert!(owner.cold_resource_index.is_none());
    let path = Utf16::from("https://sidecar.test/root#");
    for text in [
        "https://sidecar.test/retrieval",
        "https://sidecar.test/authored",
        "https://sidecar.test/retrieval#/$defs/a~1b~0%E2%98%83",
        "child#leaf",
    ] {
        resolver_parity(&owner, text, &path, None);
    }
    let reference = Value::string_utf8("https://sidecar.test/retrieval#/$defs/a~1b~0%E2%98%83");
    let retained = published(&owner, &reference, &path, None);
    let moved = Box::new(owner);
    let fallback = moved.clone();
    let expected = fallback
        .resolve_ref_unplanned(&reference, &path, None, &mut Context::catalog())
        .unwrap();
    let actual = plans(&moved)
        .resolve(&moved, &reference, &path, None, &mut Context::catalog())
        .unwrap();
    assert_eq!(actual, expected);
    assert!(Arc::ptr_eq(
        &retained,
        &published(&moved, &reference, &path, None)
    ));
    assert!(std::ptr::eq(
        retained
            .target
            .get(&moved, &mut Context::catalog())
            .unwrap(),
        actual.0
    ));
    // Two real nodes with identical diagnostic spelling are not the same
    // compiled node/frame. Exercise the current private alias fallback seam.
    let alias = Utf16::from("https://sidecar.test/alias#");
    let root_node = &*moved.schema;
    let other_node = &moved.resources.entries[0].1;
    let node_plan = plans(&moved)
        .node(&moved, root_node, &alias, false, &mut Context::catalog())
        .unwrap()
        .unwrap();
    let other_plan = plans(&moved)
        .node(&moved, other_node, &alias, false, &mut Context::catalog())
        .unwrap()
        .expect("distinct genuine owner coordinates require distinct node metadata");
    assert!(!Arc::ptr_eq(&node_plan, &other_plan));
    assert_eq!(
        node_plan.keywords,
        vec![Some("$id".to_owned()), Some("type".to_owned())]
    );
    assert_eq!(
        other_plan.keywords,
        vec![
            Some("$id".to_owned()),
            Some("type".to_owned()),
            Some("$defs".to_owned()),
        ]
    );
    assert!(std::ptr::eq(
        node_plan
            .locator
            .get(&moved, &mut Context::catalog())
            .unwrap(),
        root_node
    ));
    assert!(std::ptr::eq(
        other_plan
            .locator
            .get(&moved, &mut Context::catalog())
            .unwrap(),
        other_node
    ));
    assert!(Arc::ptr_eq(
        &node_plan,
        &plans(&moved)
            .node(&moved, root_node, &alias, false, &mut Context::catalog())
            .unwrap()
            .unwrap()
    ));
    let mut normalized = Vec::new();
    for node in [root_node, other_node] {
        let expected = moved
            .effective_frame_unplanned(node, &alias, false, &mut Context::catalog())
            .unwrap();
        let actual = plans(&moved)
            .frame(&moved, node, &alias, false, &mut Context::catalog())
            .unwrap();
        assert_eq!(actual, expected);
        normalized.push(actual);
    }
    assert_ne!(normalized[0], normalized[1]);

    // Retrieval identity takes precedence, while a colliding authored identity
    // follows catalogue order. Both are compared with the original resolver.
    let mut reversed = catalogue("integer");
    reversed.entries.reverse();
    let other = admitted(&root, &reversed);
    assert!(other.cold_resource_index.is_none());
    resolver_parity(&other, "https://sidecar.test/authored", &path, None);
    resolver_parity(&other, "https://sidecar.test/retrieval", &path, None);
    let first = plans(&moved)
        .resolve(
            &moved,
            &Value::string_utf8("https://sidecar.test/authored"),
            &path,
            None,
            &mut Context::catalog(),
        )
        .unwrap()
        .0;
    let second = plans(&other)
        .resolve(
            &other,
            &Value::string_utf8("https://sidecar.test/authored"),
            &path,
            None,
            &mut Context::catalog(),
        )
        .unwrap()
        .0;
    assert_ne!(first, second);
    let mut scoped_catalogue = catalogue("integer");
    scoped_catalogue.entries.push((
        Utf16::from("https://sidecar.test/a/child"),
        json(r#"{"type":"integer"}"#),
    ));
    scoped_catalogue.entries.push((
        Utf16::from("https://sidecar.test/b/child"),
        json(r#"{"type":"boolean"}"#),
    ));
    let scoped = admitted(&root, &scoped_catalogue);
    assert!(scoped.cold_resource_index.is_none());
    let relative = Value::string_utf8("child");
    let mut targets = Vec::new();
    for scope in ["https://sidecar.test/a/", "https://sidecar.test/b/"] {
        resolver_parity(&scoped, "child", &path, Some(scope));
        targets.push(
            plans(&scoped)
                .resolve(
                    &scoped,
                    &relative,
                    &path,
                    Some(scope),
                    &mut Context::catalog(),
                )
                .unwrap()
                .0,
        );
    }
    assert_ne!(
        targets[0], targets[1],
        "scope override must remain part of resolution identity"
    );
}

#[test]
fn limits_catalogue_policy_and_python_origins_do_not_borrow_stale_proofs() {
    let root = json(r#"{"type":"object"}"#);
    let owner = admitted(&root, &catalogue("integer"));
    assert!(owner.cold_resource_index.is_none());
    let reference = Value::string_utf8("https://sidecar.test/retrieval");
    let path = Utf16::from("#");
    plans(&owner)
        .resolve(&owner, &reference, &path, None, &mut Context::catalog())
        .unwrap();
    let prior = published(&owner, &reference, &path, None);
    let mut limits = Context::catalog().limits();
    limits.max_depth -= 1;
    let mut changed =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let fallback = owner.clone();
    let expected = fallback
        .resolve_ref_unplanned(&reference, &path, None, &mut changed)
        .unwrap();
    let actual = plans(&owner)
        .resolve(&owner, &reference, &path, None, &mut changed)
        .unwrap();
    assert_eq!(actual, expected);
    assert!(!Arc::ptr_eq(
        &prior,
        &published(&owner, &reference, &path, None)
    ));
    let changed_owner = admitted(&root, &catalogue("string"));
    assert!(changed_owner.cold_resource_index.is_none());
    let changed_target = plans(&changed_owner)
        .resolve(
            &changed_owner,
            &reference,
            &path,
            None,
            &mut Context::catalog(),
        )
        .unwrap()
        .0;
    assert_ne!(actual.0, changed_target);
    assert!(!Arc::ptr_eq(
        owner.owner_plans.as_ref().unwrap(),
        changed_owner.owner_plans.as_ref().unwrap()
    ));

    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let ordinary = CompiledSchema::compile(&root, &SchemaResources::default(), ctx)?;
        let policy = KeywordPolicy {
            validation: false,
            ..KeywordPolicy::DRAFT2020
        };
        let inactive = CompiledSchema::compile_inner(
            &root,
            &SchemaResources::default(),
            SchemaDialect::Draft2020_12,
            true,
            RegexProfile::Ecma262Unicode,
            true,
            false,
            false,
            true,
            policy,
            ctx,
        )?;
        assert!(inactive.owner_plans.is_none());
        assert!(inactive.validate(&Value::Bool(true), ctx)?.is_empty());
        assert!(!ordinary.validate(&Value::Bool(true), ctx)?.is_empty());
        let python_source = crate::python_value::python_from_core_value(&root, ctx)?;
        let python = CompiledSchema::compile_python_source(
            &python_source,
            &crate::python_value::PythonSchemaResources::default(),
            false,
            PythonReVersion::V3_11,
            ctx,
        )?;
        assert!(python.compiled.owner_plans.is_none());
        assert!(!python.compiled.python_text_origins.is_empty());
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn zero_nonstring_and_missing_reference_targets_keep_original_refusals() {
    let owner = admitted(&Value::Bool(true), &SchemaResources::default());
    assert!(plans(&owner).references.lock().unwrap().is_empty());
    let fallback = owner.clone();
    let path = Utf16::new(vec![35, 47, 0xd800, 126, 47]);
    for reference in [
        Value::Bool(false),
        Value::string_utf8("https://sidecar.test/missing#anchor"),
    ] {
        let expected = fallback
            .resolve_ref_unplanned(&reference, &path, None, &mut Context::catalog())
            .unwrap_err();
        let actual = plans(&owner)
            .resolve(&owner, &reference, &path, None, &mut Context::catalog())
            .unwrap_err();
        assert_eq!(actual, expected);
        assert!(plans(&owner).references.lock().unwrap().is_empty());
    }
    resolver_parity(&owner, "#", &path, None);
    let reference = Value::string_utf8("#");
    let actual = plans(&owner)
        .resolve(&owner, &reference, &path, None, &mut Context::catalog())
        .unwrap();
    assert_eq!(actual.0, &Value::Bool(true));
    assert_eq!(plans(&owner).references.lock().unwrap().len(), 1);
}

#[test]
fn first_denial_preserves_error_origin_and_cannot_publish_an_unfinished_plan() {
    let source = json(r#"{"type":"object"}"#);
    let reference = Value::string_utf8("https://sidecar.test/retrieval#/$defs/a~1b~0%E2%98%83");
    let path = Utf16::from("#");
    let measured = admitted(&source, &catalogue("integer"));
    assert!(measured.cold_resource_index.is_none());
    let unpublished = std::cell::RefCell::new(Vec::new());
    let mut observe = |_| {
        unpublished.borrow_mut().push(
            plans(&measured)
                .references
                .try_lock()
                .expect("no callback under plan lock")
                .is_empty(),
        );
        Ok(())
    };
    plans(&measured)
        .resolve(
            &measured,
            &reference,
            &path,
            None,
            &mut Context::catalog().with_host_control(&mut observe),
        )
        .unwrap();
    let before_publication: Vec<_> = unpublished
        .borrow()
        .iter()
        .enumerate()
        .filter_map(|(i, empty)| empty.then_some(i))
        .collect();
    assert!(!before_publication.is_empty());
    // Select real cold-operation transitions, not literal work counts.
    let points = [
        before_publication[0],
        before_publication[before_publication.len() / 2],
        *before_publication.last().unwrap(),
    ];
    for deny_at in points {
        let owner = admitted(&source, &catalogue("integer"));
        assert!(owner.cold_resource_index.is_none());
        let calls = Cell::new(0usize);
        let mut sentinel = EngineError::new(
            "HOST_FIRST_DENIAL",
            Utf16::new(vec![47, 0xd800]),
            "original host failure",
        );
        sentinel.python_message_origin = Some(crate::python_value::PyText::from_utf8("host-δ"));
        let mut control = |_| {
            assert!(plans(&owner).references.try_lock().is_ok());
            let n = calls.get();
            calls.set(n + 1);
            if n == deny_at {
                Err(sentinel.clone())
            } else {
                Ok(())
            }
        };
        let error = plans(&owner)
            .resolve(
                &owner,
                &reference,
                &path,
                None,
                &mut Context::catalog().with_host_control(&mut control),
            )
            .unwrap_err();
        assert_eq!(error.code, sentinel.code);
        assert_eq!(error.path, sentinel.path);
        assert_eq!(error.message, sentinel.message);
        assert_eq!(error.python_message_origin, sentinel.python_message_origin);
        assert!(error.is_control_failure());
        assert_eq!(
            calls.get(),
            deny_at + 1,
            "no controls after the first denial"
        );
        assert!(plans(&owner).references.lock().unwrap().is_empty());
    }
}

#[test]
fn path_arena_preserves_unicode_escaping_collision_keys_and_nested_restoration() {
    let mut ctx = Context::catalog();
    assert!(ctx.evaluation_paths.is_none());
    ctx.with_evaluation_paths(|ctx| {
        let outer = Rc::clone(ctx.evaluation_paths.as_ref().unwrap());
        for (path, segment) in [
            (Utf16::from("#"), Utf16::from("a/b~☃")),
            (Utf16::from("#/"), Utf16::from("/")),
            (Utf16::from("/a"), Utf16::from("b/c")),
            (Utf16::from("/a/b"), Utf16::from("c")),
            (Utf16::default(), Utf16::new(vec![0xd800, 47, 126, 0xdc00])),
        ] {
            for schema in [false, true] {
                let expected = if schema {
                    append_schema_pointer(&path, &segment)
                } else {
                    append_instance_path(&path, &segment)
                };
                let first = outer.borrow_mut().append(&path, &segment, schema, ctx)?;
                let count = outer.borrow().values.len();
                let again = outer.borrow_mut().append(&path, &segment, schema, ctx)?;
                assert_eq!(first, expected);
                assert_eq!(again, expected);
                assert_eq!(outer.borrow().values.len(), count);
            }
        }
        for fail in [false, true] {
            let outcome = ctx.with_evaluation_paths(|nested| {
                assert!(!Rc::ptr_eq(
                    &outer,
                    nested.evaluation_paths.as_ref().unwrap()
                ));
                if fail {
                    Err(EngineError::new(
                        "NESTED",
                        Utf16::from("/nested"),
                        "nested refusal",
                    ))
                } else {
                    Ok(())
                }
            });
            assert_eq!(outcome.is_err(), fail);
            assert!(Rc::ptr_eq(&outer, ctx.evaluation_paths.as_ref().unwrap()));
        }
        let unwind = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            ctx.with_evaluation_paths(|_| -> Result<(), EngineError> {
                panic!("independent scope unwind")
            })
        }));
        assert!(unwind.is_err());
        assert!(Rc::ptr_eq(&outer, ctx.evaluation_paths.as_ref().unwrap()));
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.evaluation_paths.is_none());
    // Exhaust actual cache admission capacity; the shared original path builders
    // remain the semantic oracle, without allocating a larger cache.
    for text_limit in [false, true] {
        let mut limits = Context::catalog().limits();
        if text_limit {
            limits.max_text_units = 1;
        } else {
            limits.max_values = 1;
        }
        let mut limited =
            Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
        let mut arena = EvaluationPaths::default();
        for segment in [Utf16::from("a/~"), Utf16::from("b/~")] {
            let path = Utf16::from("#");
            assert_eq!(
                arena.append(&path, &segment, true, &mut limited).unwrap(),
                append_schema_pointer(&path, &segment)
            );
        }
        assert_eq!(arena.values.len(), if text_limit { 0 } else { 1 });
    }
    let calls = Cell::new(0);
    let sentinel = EngineError::new("PATH_DENIAL", Utf16::from("/original"), "stop");
    let mut control = |_| {
        let n = calls.get();
        calls.set(n + 1);
        if n == 0 {
            Ok(())
        } else {
            Err(sentinel.clone())
        }
    };
    let mut denied = Context::catalog().with_host_control(&mut control);
    let error = denied
        .with_evaluation_paths(|ctx| {
            let arena = Rc::clone(ctx.evaluation_paths.as_ref().unwrap());
            let result = arena
                .borrow_mut()
                .append(&Utf16::from("#"), &Utf16::from("x"), true, ctx);
            result
        })
        .unwrap_err();
    assert_eq!(error.code, sentinel.code);
    assert_eq!(error.path, sentinel.path);
    assert!(error.is_control_failure());
    assert!(denied.evaluation_paths.is_none());
    assert_eq!(calls.get(), 2);
}

#[test]
fn dynamic_scope_uses_current_branch_and_nested_invocations_not_cached_active_target() {
    let base = json(
        r##"{"$id":"https://sidecar.test/base","$dynamicAnchor":"node","type":"object","properties":{"next":{"$dynamicRef":"#node"}}}"##,
    );
    let resources = SchemaResources {
        entries: vec![(Utf16::from("https://sidecar.test/base"), base)],
    };
    let source = json(
        r#"{"$id":"https://sidecar.test/root","$dynamicAnchor":"node","$ref":"https://sidecar.test/base","required":["tag"],"properties":{"tag":{"type":"string"}}}"#,
    );
    let owner = admitted(&source, &resources);
    let fallback = owner.clone();
    let valid = json(r#"{"tag":"outer","next":{"tag":"inner"}}"#);
    let invalid = json(r#"{"tag":"outer","next":{}}"#);
    for (sample, valid_expected) in [(&valid, true), (&invalid, false), (&valid, true)] {
        let expected = fallback.validate(sample, &mut Context::catalog()).unwrap();
        let actual = owner.validate(sample, &mut Context::catalog()).unwrap();
        assert_eq!(actual, expected);
        assert_eq!(actual.is_empty(), valid_expected);
    }
    assert!(!plans(&owner).evaluations.lock().unwrap().is_empty());
    let alternate = admitted(
        &json(
            r#"{"$id":"https://sidecar.test/alternate","$dynamicAnchor":"node","$ref":"https://sidecar.test/base","required":["other"]}"#,
        ),
        &resources,
    );
    let nested_value = json(r#"{"other":1,"next":{"other":2}}"#);
    let reentrant_owner = admitted(&source, &resources);
    assert!(
        plans(&reentrant_owner)
            .evaluations
            .lock()
            .unwrap()
            .is_empty()
    );
    let entered = Cell::new(false);
    let mut reenter = |_| {
        // Publication of the first evaluation plan is an actual evaluator
        // frontier, not a guessed callback count during the earlier input copy.
        let in_evaluation = !plans(&reentrant_owner)
            .evaluations
            .try_lock()
            .expect("no host callback under evaluation-plan lock")
            .is_empty();
        if in_evaluation && !entered.replace(true) {
            assert!(
                reentrant_owner
                    .validate(&valid, &mut Context::catalog())?
                    .is_empty()
            );
            assert!(
                alternate
                    .validate(&nested_value, &mut Context::catalog())?
                    .is_empty()
            );
        }
        Ok(())
    };
    let mut ctx = Context::catalog().with_host_control(&mut reenter);
    assert_eq!(
        reentrant_owner.validate(&invalid, &mut ctx).unwrap(),
        fallback
            .validate(&invalid, &mut Context::catalog())
            .unwrap()
    );
    assert!(entered.get());
    assert!(ctx.evaluation_paths.is_none());

    let interrupted = admitted(&source, &resources);
    let denied = Cell::new(false);
    let sentinel = EngineError::new(
        "ACTIVE_EVALUATION_DENIAL",
        Utf16::from("/host-origin"),
        "first evaluator denial",
    );
    let mut deny = |_| {
        assert!(
            !denied.get(),
            "no callbacks during restoration after denial"
        );
        let in_evaluation = !plans(&interrupted)
            .evaluations
            .try_lock()
            .expect("plan lock released before callback")
            .is_empty();
        if in_evaluation {
            denied.set(true);
            Err(sentinel.clone())
        } else {
            Ok(())
        }
    };
    let mut failed_ctx = Context::catalog().with_host_control(&mut deny);
    let error = interrupted.validate(&invalid, &mut failed_ctx).unwrap_err();
    assert!(denied.get());
    assert!(error.is_control_failure());
    assert_eq!(error.code, sentinel.code);
    assert_eq!(error.path, sentinel.path);
    assert_eq!(error.message, sentinel.message);
    assert!(failed_ctx.evaluation_paths.is_none());
    assert_eq!(
        interrupted
            .validate(&valid, &mut Context::catalog())
            .unwrap(),
        fallback.validate(&valid, &mut Context::catalog()).unwrap()
    );
}

#[test]
fn interpreter_annotation_commit_rollback_and_ordered_errors_match_original() {
    let cases = [
        (
            r#"{"anyOf":[{"required":["a"],"properties":{"a":{"type":"integer"}}},{"required":["b"],"properties":{"b":{"type":"string"}}}],"unevaluatedProperties":false}"#,
            vec![
                (r#"{"a":1}"#, true),
                (r#"{"b":"ok"}"#, true),
                (r#"{"a":"bad","b":"ok"}"#, false),
            ],
        ),
        (
            r#"{"oneOf":[{"required":["a"],"properties":{"a":{"type":"integer"}}},{"required":["b"],"properties":{"b":{"type":"string"}}}],"unevaluatedProperties":false}"#,
            vec![(r#"{"a":1}"#, true), (r#"{"a":1,"b":"ok"}"#, false)],
        ),
        (
            r#"{"if":{"required":["a"]},"then":{"properties":{"a":{"type":"integer"}}},"else":{"properties":{"b":{"type":"string"}}},"unevaluatedProperties":false}"#,
            vec![
                (r#"{"a":1}"#, true),
                (r#"{"b":"ok"}"#, true),
                (r#"{"a":"bad"}"#, false),
            ],
        ),
        (
            r#"{"not":{"properties":{"a":true}},"unevaluatedProperties":false}"#,
            vec![(r#"{"a":1}"#, false)],
        ),
        (
            r#"{"contains":{"type":"integer"},"unevaluatedItems":false}"#,
            vec![("[1,2]", true), (r#"[1,"x"]"#, false)],
        ),
        (
            r#"{"anyOf":[{"prefixItems":[{"type":"integer"}]},{"prefixItems":[{"type":"string"}]}],"unevaluatedItems":false}"#,
            vec![("[1]", true), (r#"["x"]"#, true), ("[1,2]", false)],
        ),
    ];
    for (source, samples) in cases {
        let schema = json(source);
        let owner = admitted(&schema, &SchemaResources::default());
        let fallback = owner.clone();
        for (instance, valid) in samples {
            let value = json(instance);
            let expected = fallback
                .validate_codegen_errors(&value, &mut Context::catalog())
                .unwrap();
            let actual = owner
                .validate_codegen_errors(&value, &mut Context::catalog())
                .unwrap();
            assert_eq!(
                actual, expected,
                "full ordered errors: {source} / {instance}"
            );
            assert_eq!(actual.is_empty(), valid);
        }
    }
    let source = json(
        r#"{"type":"object","properties":{"a/b~☃":{"type":"integer"},"z":{"type":"string"}}}"#,
    );
    let owner = admitted(&source, &SchemaResources::default());
    let errors = owner
        .validate_codegen_errors(&json(r#"{"a/b~☃":"bad","z":1}"#), &mut Context::catalog())
        .unwrap();
    assert_eq!(
        errors,
        owner
            .clone()
            .validate_codegen_errors(&json(r#"{"a/b~☃":"bad","z":1}"#), &mut Context::catalog())
            .unwrap()
    );
    assert_eq!(
        errors
            .iter()
            .map(|e| e.instance_path.clone())
            .collect::<Vec<_>>(),
        vec![Utf16::from("/a~1b~0☃"), Utf16::from("/z")]
    );
}

#[test]
fn property_deltas_commit_only_selected_branches_and_re_admit_other_root_names() {
    let mut ctx = Context::catalog();
    let mut parent = PropertyDelta::new(&mut ctx).unwrap();
    let a = Utf16::from("a/b~☃");
    let b = Utf16::new(vec![0xd800]);
    let c = Utf16::new(vec![0xdc00]);
    parent.insert(&a, &mut ctx).unwrap();
    let mut failed = parent.child(&mut ctx).unwrap();
    assert!(
        !failed.contains(&a, &mut ctx).unwrap(),
        "children start EMPTY"
    );
    failed.insert(&b, &mut ctx).unwrap();
    drop(failed);
    assert!(!parent.contains(&b, &mut ctx).unwrap());
    let mut selected = parent.child(&mut ctx).unwrap();
    selected.insert(&b, &mut ctx).unwrap();
    parent.merge(selected, &mut ctx).unwrap();
    assert!(parent.contains(&a, &mut ctx).unwrap());
    assert!(parent.contains(&b, &mut ctx).unwrap());
    let mut separate = PropertyDelta::new(&mut ctx).unwrap();
    separate.insert(&c, &mut ctx).unwrap();
    assert!(!separate.contains(&a, &mut ctx).unwrap());
    parent.merge(separate, &mut ctx).unwrap();
    assert!(parent.contains(&a, &mut ctx).unwrap());
    assert!(parent.contains(&b, &mut ctx).unwrap());
    assert!(parent.contains(&c, &mut ctx).unwrap());
    let mut interrupted = parent.child(&mut ctx).unwrap();
    let denied_name = Utf16::from("must-not-commit");
    let calls = Cell::new(0);
    let sentinel = EngineError::new("DELTA_DENIAL", Utf16::from("/branch"), "stop");
    let mut deny = |_| {
        calls.set(calls.get() + 1);
        Err(sentinel.clone())
    };
    let error = interrupted
        .insert(
            &denied_name,
            &mut Context::catalog().with_host_control(&mut deny),
        )
        .unwrap_err();
    assert_eq!(error.code, sentinel.code);
    assert_eq!(error.path, sentinel.path);
    assert!(error.is_control_failure());
    assert_eq!(calls.get(), 1);
    drop(interrupted);
    assert!(!parent.contains(&denied_name, &mut ctx).unwrap());
}

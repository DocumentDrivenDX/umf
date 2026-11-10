// SPDX-License-Identifier: MIT OR Apache-2.0
//! PH1 bridge controls. SOURCE ONLY: UNCOMPILED / NATIVE UNEXECUTED.
//! Child of schema.rs, not arena unit tests. Every owner is genuinely compiled;
//! test snapshots are readback only, never admission/handle constructors.
use super::*;
use std::cell::{Cell, RefCell};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::rc::Rc;

type Arena = Rc<RefCell<EvaluationPaths>>;
fn json(source: &str) -> Value {
    crate::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn admitted(source: &str, resources: &SchemaResources) -> CompiledSchema {
    let mut ctx = Context::catalog();
    let owner = ctx
        .with_codegen_construction(|ctx| CompiledSchema::compile(&json(source), resources, ctx))
        .unwrap();
    assert!(
        owner.owner_plans.is_some(),
        "must genuinely select owned plans"
    );
    assert!(
        owner.cold_resource_index.is_some(),
        "authored indexed fixture"
    );
    owner
}
fn snapshot(ctx: &Context<'_>) -> owned_plans::EvaluationPathsSnapshot {
    ctx.evaluation_paths
        .as_ref()
        .expect("real installed arena")
        .borrow()
        .snapshot_for_test()
        .expect("real admitted tracked arena")
}
fn entry<'a>(
    s: &'a owned_plans::EvaluationPathsSnapshot,
    path: &Utf16,
) -> &'a owned_plans::EvaluationPathEntryView {
    let found: Vec<_> = s.entries().iter().filter(|e| e.text() == path).collect();
    assert_eq!(
        found.len(),
        1,
        "authored nonalias fixture must have one entry for {path:?}"
    );
    found[0]
}
fn simple_roots_and_links(s: &owned_plans::EvaluationPathsSnapshot) {
    let roots: Vec<_> = s
        .entries()
        .iter()
        .filter(|e| e.parent().is_none())
        .collect();
    assert_eq!(
        roots.len(),
        2,
        "no root re-admission in this no-ref/no-id fixture"
    );
    assert_eq!(roots[0].text(), &Utf16::default());
    assert_eq!(roots[1].text(), &Utf16::from("#"));
    for (ordinal, e) in s.entries().iter().enumerate() {
        assert_eq!(e.ordinal(), ordinal);
        if let Some(parent) = e.parent() {
            assert!(parent < ordinal);
            assert_eq!(e.depth(), s.entries()[parent].depth() + 1);
            assert!(e.kind() <= 2);
        } else {
            assert_eq!(e.depth(), 0);
            assert_eq!(e.kind(), 3);
        }
    }
    for (parent, _, kind, child) in s.transitions() {
        let e = &s.entries()[*child];
        assert_eq!(e.parent(), Some(*parent));
        assert_eq!(e.kind(), *kind);
    }
}
fn original(owner: &CompiledSchema, value: &Value) -> Vec<StructuralError> {
    let plain = owner.clone();
    assert!(plain.owner_plans.is_none());
    assert!(plain.cold_resource_index.is_none());
    let result = plain
        .evaluate_instance_with_mode(value, EvaluationMode::AllErrors, &mut Context::catalog())
        .unwrap();
    assert!(result.terminal_error.is_none());
    result.errors
}
fn paths(errors: &[StructuralError]) -> Vec<(Utf16, Utf16)> {
    errors
        .iter()
        .map(|e| {
            assert_eq!(e.keyword, "type");
            (e.instance_path.clone(), e.schema_path.clone())
        })
        .collect()
}
fn real_inner(
    owner: &CompiledSchema,
    value: &Value,
    codegen: bool,
    ctx: &mut Context<'_>,
) -> Result<Vec<StructuralError>, EngineError> {
    if codegen {
        owner.evaluate_admitted_codegen_value_inner(value, false, ctx)
    } else {
        let result =
            owner.evaluate_instance_with_mode_inner(value, EvaluationMode::AllErrors, ctx)?;
        assert!(result.terminal_error.is_none());
        Ok(result.errors)
    }
}

#[test]
fn phb01_both_actual_root_bodies_carry_recursive_pairs_and_literal_array_indices() {
    let owner = admitted(
        r#"{"type":"object","properties":{"rows":{"type":"array","items":{"type":"integer"}}}}"#,
        &SchemaResources::default(),
    );
    let value = json(r#"{"rows":[false,1,2,3,4,5,6,7,8,false,false]}"#);
    let expected = original(&owner, &value);
    assert_eq!(
        paths(&expected),
        [0, 9, 10]
            .iter()
            .map(|i| (
                Utf16::from(format!("/rows/{i}").as_str()),
                Utf16::from("#/properties/rows/items/type")
            ))
            .collect::<Vec<_>>()
    );
    for codegen in [false, true] {
        let mut ctx = Context::catalog();
        ctx.with_evaluation_paths(|ctx| {
            // EXACT production inner body called by its own scoped public root.
            let errors = real_inner(&owner, &value, codegen, ctx)?;
            assert_eq!(errors, expected);
            let s = snapshot(ctx);
            simple_roots_and_links(&s);
            let rows = entry(&s, &Utf16::from("/rows"));
            for i in [0, 9, 10] {
                let child = entry(&s, &Utf16::from(format!("/rows/{i}").as_str()));
                assert_eq!(child.parent(), Some(rows.ordinal()));
                assert_eq!(child.kind(), 0);
            }
            let items = entry(&s, &Utf16::from("#/properties/rows/items"));
            assert_eq!(
                entry(&s, &Utf16::from("#/properties/rows/items/type")).parent(),
                Some(items.ordinal())
            );
            Ok(())
        })
        .unwrap();
        assert!(ctx.evaluation_paths.is_none());
    }
}

#[test]
fn phb02_real_evaluator_preserves_exact_utf16_escaped_and_lone_surrogate_paths() {
    let owner = admitted(
        r#"{"type":"object","properties":{"a/~\ud800😀":{"type":"string"}}}"#,
        &SchemaResources::default(),
    );
    let value = json(r#"{"a/~\ud800😀":7}"#);
    let expected = original(&owner, &value);
    let units = vec![47, 97, 126, 49, 126, 48, 0xd800, 0xd83d, 0xde00];
    let ip = Utf16::new(units.clone());
    let mut sp = "#/properties".encode_utf16().collect::<Vec<_>>();
    sp.extend(units);
    sp.extend("/type".encode_utf16());
    assert_eq!(paths(&expected), vec![(ip.clone(), Utf16::new(sp))]);
    let mut ctx = Context::catalog();
    ctx.with_evaluation_paths(|ctx| {
        assert_eq!(real_inner(&owner, &value, false, ctx)?, expected);
        let s = snapshot(ctx);
        simple_roots_and_links(&s);
        assert_eq!(
            entry(&s, &ip).parent(),
            Some(entry(&s, &Utf16::default()).ordinal())
        );
        Ok(())
    })
    .unwrap();
}

#[test]
fn phb03_deferred_unevaluated_annotations_retain_original_pair_ancestry() {
    for (source, data, expected_ip, expected_sp) in [
        (
            r#"{"properties":{"known":true},"unevaluatedProperties":{"type":"array","items":{"type":"integer"}}}"#,
            r#"{"known":0,"late":[false]}"#,
            "/late/0",
            "#/unevaluatedProperties/items/type",
        ),
        (
            r#"{"prefixItems":[true],"unevaluatedItems":{"type":"string"}}"#,
            "[0,false]",
            "/1",
            "#/unevaluatedItems/type",
        ),
    ] {
        let owner = admitted(source, &SchemaResources::default());
        let value = json(data);
        let expected = original(&owner, &value);
        assert_eq!(
            paths(&expected),
            vec![(Utf16::from(expected_ip), Utf16::from(expected_sp))]
        );
        let mut ctx = Context::catalog();
        ctx.with_evaluation_paths(|ctx| {
            assert_eq!(real_inner(&owner, &value, false, ctx)?, expected);
            let s = snapshot(ctx);
            simple_roots_and_links(&s);
            let keyword = if expected_ip == "/1" {
                "#/unevaluatedItems"
            } else {
                "#/unevaluatedProperties"
            };
            let deferred = entry(&s, &Utf16::from(keyword));
            assert_eq!(
                deferred.parent(),
                Some(entry(&s, &Utf16::from("#")).ordinal())
            );
            assert_eq!(deferred.kind(), 1);
            // A deferred clone must not mint another root with identical text.
            assert!(entry(&s, &Utf16::from(expected_sp)).depth() > deferred.depth());
            Ok(())
        })
        .unwrap();
    }
}

#[test]
fn phb04_actual_reference_resolution_establishes_distinct_resource_origin_root() {
    let resources = SchemaResources {
        entries: vec![(
            Utf16::from("https://phb.test/target"),
            json(r#"{"$id":"https://phb.test/target","type":"string"}"#),
        )],
    };
    let owner = admitted(
        r#"{"properties":{"left":{"$ref":"https://phb.test/target"},"right":{"type":"boolean"}}}"#,
        &resources,
    );
    let value = json(r#"{"left":7,"right":7}"#);
    let expected = original(&owner, &value);
    assert_eq!(
        paths(&expected),
        vec![
            (
                Utf16::from("/left"),
                Utf16::from("https://phb.test/target#/type")
            ),
            (
                Utf16::from("/right"),
                Utf16::from("#/properties/right/type")
            )
        ]
    );
    let mut ctx = Context::catalog();
    ctx.with_evaluation_paths(|ctx| {
        assert_eq!(real_inner(&owner, &value, false, ctx)?, expected);
        let s = snapshot(ctx);
        let origins: Vec<_> = s
            .entries()
            .iter()
            .filter(|e| {
                e.parent().is_none() && e.text() == &Utf16::from("https://phb.test/target#")
            })
            .collect();
        assert_eq!(
            origins.len(),
            1,
            "actual resolved reference origin, not diagnostic alias reinterning"
        );
        assert_eq!(
            entry(&s, &Utf16::from("https://phb.test/target#/type")).parent(),
            Some(origins[0].ordinal())
        );
        assert_eq!(
            entry(&s, &Utf16::from("/right")).parent(),
            Some(entry(&s, &Utf16::default()).ordinal())
        );
        assert!(entry(&s, &Utf16::from("#/properties/right/type"))
            .parent()
            .is_some());
        Ok(())
    })
    .unwrap();
}

#[test]
fn phb05_original_plain_owner_and_python_text_fallbacks_never_mint_pair_authority() {
    let owner = admitted(
        r#"{"properties":{"x":{"type":"string"}}}"#,
        &SchemaResources::default(),
    );
    let plain = owner.clone();
    let value = json(r#"{"x":7}"#);
    let expected = original(&owner, &value);
    let mut ctx = Context::catalog();
    ctx.with_evaluation_paths(|ctx| {
        assert_eq!(real_inner(&plain, &value, false, ctx)?, expected);
        assert!(
            snapshot(ctx).entries().is_empty(),
            "plain evaluator cannot bootstrap tracking"
        );
        let (ip, sp) = plain.evaluator_root_paths(ctx)?;
        let arena = ctx.evaluation_paths.as_ref().unwrap().clone();
        assert!(ip.tracked_entry_for_test(&arena.borrow()).is_none());
        assert!(sp.tracked_entry_for_test(&arena.borrow()).is_none());
        // This separate helper-boundary control is NOT real Python interpreter routing proof.
        let py = crate::python_value::PyText::from_utf8("a/~😀");
        let pair = owner.pair_instance_pointer(&ip, InstanceText::Python(&py), ctx)?;
        let old = owner.instance_pointer(
            ip.text(),
            InstanceText::Python(&py),
            &mut Context::catalog(),
        )?;
        assert_eq!(pair.text(), &old);
        assert_eq!(pair.text(), &Utf16::from("/a~1~0😀"));
        assert!(pair.tracked_entry_for_test(&arena.borrow()).is_none());
        assert!(snapshot(ctx).entries().is_empty());
        Ok(())
    })
    .unwrap();
}

#[test]
fn phb06_actual_recursive_and_deferred_callbacks_allow_arena_borrow_and_nested_evaluator() {
    let owner = admitted(
        r#"{"properties":{"x":{"type":"array","items":{"type":"integer"}}},"unevaluatedProperties":{"type":"boolean"}}"#,
        &SchemaResources::default(),
    );
    let value = json(r#"{"x":[false],"late":7}"#);
    let expected = original(&owner, &value);
    let active: Rc<RefCell<Option<Arena>>> = Rc::new(RefCell::new(None));
    let checks = Cell::new(0usize);
    let reentered = Cell::new(false);
    let mut control = |_: usize| {
        let current = active.borrow().clone();
        if let Some(arena) = current {
            {
                let guard = arena
                    .try_borrow_mut()
                    .expect("no arena borrow across actual evaluator controls");
                drop(guard);
            }
            checks.set(checks.get() + 1);
            if !reentered.replace(true) {
                let mut nested = Context::catalog();
                nested.evaluation_paths = Some(arena.clone());
                let result = owner.evaluate_instance_with_mode(
                    &value,
                    EvaluationMode::AllErrors,
                    &mut nested,
                )?;
                assert_eq!(result.errors, expected);
                assert!(result.terminal_error.is_none());
                assert!(Rc::ptr_eq(
                    nested.evaluation_paths.as_ref().unwrap(),
                    &arena
                ));
            }
        }
        Ok(())
    };
    let mut ctx = Context::catalog().with_host_control(&mut control);
    ctx.with_evaluation_paths(|ctx| {
        *active.borrow_mut() = ctx.evaluation_paths.clone();
        assert_eq!(real_inner(&owner, &value, false, ctx)?, expected);
        simple_roots_and_links(&snapshot(ctx));
        *active.borrow_mut() = None;
        Ok(())
    })
    .unwrap();
    assert!(checks.get() > 0 && reentered.get());
    assert!(ctx.evaluation_paths.is_none());
}

#[test]
fn phb07_both_actual_public_roots_restore_prior_arena_on_valid_and_error_results() {
    let owner = admitted(
        r#"{"properties":{"x":{"type":"string"}}}"#,
        &SchemaResources::default(),
    );
    let mut ctx = Context::catalog();
    let prior = EvaluationPaths::new_tracked(&mut ctx).unwrap();
    ctx.evaluation_paths = Some(prior.clone());
    for data in [r#"{"x":"ok"}"#, r#"{"x":7}"#] {
        let value = json(data);
        let expected = original(&owner, &value);
        let before = ctx.charged_work();
        let actual = owner
            .evaluate_instance_with_mode(&value, EvaluationMode::AllErrors, &mut ctx)
            .unwrap();
        assert_eq!(actual.errors, expected);
        assert!(actual.terminal_error.is_none());
        assert!(Rc::ptr_eq(ctx.evaluation_paths.as_ref().unwrap(), &prior));
        assert_eq!(
            owner
                .evaluate_admitted_codegen_value(&value, false, &mut ctx)
                .unwrap(),
            expected
        );
        assert!(Rc::ptr_eq(ctx.evaluation_paths.as_ref().unwrap(), &prior));
        assert!(
            ctx.charged_work() > before,
            "scopes do not reset cumulative work"
        );
        assert!(prior
            .borrow()
            .snapshot_for_test()
            .unwrap()
            .entries()
            .is_empty());
    }
}

fn host_error() -> EngineError {
    let mut e = EngineError::new(
        "PHB_HOST",
        Utf16::new(vec![35, 47, 0xd800]),
        "original bridge denial",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("bridge-origin-δ"));
    e.with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference)
}
#[test]
fn phb08_installed_scope_restores_on_first_host_refusal_and_observer_unwind() {
    let owner = admitted(
        r#"{"properties":{"x":{"type":"string"}}}"#,
        &SchemaResources::default(),
    );
    let value = json(r#"{"x":7}"#);
    for panic_mode in [false, true] {
        let installed = Cell::new(false);
        let denied = Cell::new(false);
        let after_denial = Cell::new(0usize);
        let mut control = |_: usize| {
            if denied.get() {
                after_denial.set(after_denial.get() + 1);
            }
            if installed.get() && !denied.replace(installed.get()) {
                if panic_mode {
                    panic!("independent actual bridge unwind");
                }
                return Err(host_error());
            }
            Ok(())
        };
        let mut ctx = Context::catalog().with_host_control(&mut control);
        let prior = EvaluationPaths::new_tracked(&mut ctx).unwrap();
        ctx.evaluation_paths = Some(prior.clone());
        let before = ctx.charged_work();
        let result = catch_unwind(AssertUnwindSafe(|| {
            ctx.with_evaluation_paths(|ctx| {
                installed.set(true);
                real_inner(&owner, &value, false, ctx).map(|_| ())
            })
        }));
        if panic_mode {
            assert!(result.is_err());
        } else {
            let e = result.unwrap().unwrap_err();
            let original = host_error();
            assert_eq!(e.code, original.code);
            assert_eq!(e.path, original.path);
            assert_eq!(e.message, original.message);
            assert_eq!(e.python_message_origin, original.python_message_origin);
            assert!(e.is_control_failure());
            assert!(e.python_schema_terminal.is_none());
        }
        assert!(denied.get());
        assert_eq!(after_denial.get(), 0);
        assert!(Rc::ptr_eq(ctx.evaluation_paths.as_ref().unwrap(), &prior));
        assert!(ctx.charged_work() > before);
        installed.set(false);
        assert!(prior
            .borrow()
            .snapshot_for_test()
            .unwrap()
            .entries()
            .is_empty());
        // A separate fresh Context recovery is not a reset of the denied budget.
        let retry = owner
            .evaluate_instance_with_mode(&value, EvaluationMode::AllErrors, &mut Context::catalog())
            .unwrap();
        assert_eq!(retry.errors, original(&owner, &value));
    }
}

#[test]
fn phb09_real_branch_recursion_restores_sibling_pairs_and_original_ordered_errors() {
    let owner = admitted(
        r#"{"allOf":[{"properties":{"left":{"type":"integer"}}},{"properties":{"right":{"type":"boolean"}}}],"properties":{"late":{"type":"string"}}}"#,
        &SchemaResources::default(),
    );
    let value = json(r#"{"left":false,"right":7,"late":7}"#);
    let expected = original(&owner, &value);
    let mut golden = vec![
        (
            Utf16::from("/left"),
            Utf16::from("#/allOf/0/properties/left/type"),
        ),
        (
            Utf16::from("/right"),
            Utf16::from("#/allOf/1/properties/right/type"),
        ),
        (Utf16::from("/late"), Utf16::from("#/properties/late/type")),
    ];
    let mut observed = paths(&expected);
    observed.sort();
    golden.sort();
    assert_eq!(observed, golden);
    let mut ctx = Context::catalog();
    ctx.with_evaluation_paths(|ctx| {
        // Complete vector equality retains original evaluator error ordering.
        assert_eq!(real_inner(&owner, &value, false, ctx)?, expected);
        let s = snapshot(ctx);
        simple_roots_and_links(&s);
        let ip = entry(&s, &Utf16::default()).ordinal();
        for name in ["/left", "/right", "/late"] {
            assert_eq!(entry(&s, &Utf16::from(name)).parent(), Some(ip));
        }
        let branch0 = entry(&s, &Utf16::from("#/allOf/0"));
        let branch1 = entry(&s, &Utf16::from("#/allOf/1"));
        assert_ne!(branch0.ordinal(), branch1.ordinal());
        assert_eq!(branch0.parent(), branch1.parent());
        assert_eq!(branch0.kind(), 2);
        assert_eq!(branch1.kind(), 2);
        Ok(())
    })
    .unwrap();
}

// Additional regression only; original nine cases remain byte-identical.
// SOURCE ONLY / UNEXECUTED. Final source pin waits H repaired bridge seam.
#[test]
fn phb10_python_bound_dependency_plain_segments_stay_distinct_from_source_aware_properties() {
    for (source, data, keyword, trigger, expected_schema_path, expected_instance_path) in [
        (r##"{"$schema":"http://json-schema.org/draft-07/schema#","dependencies":{"a/~":{"type":"string"}}}"##, r##"{"a/~":true}"##, "dependencies", "a/~", "#/~p00006400006500007000006500006e00006400006500006e000063000069000065000073/a~1~0/~p000074000079000070000065", ""),
        (r##"{"$schema":"http://json-schema.org/draft-07/schema#","dependencies":{"10":{"type":"string"}}}"##, r##"{"10":true}"##, "dependencies", "10", "#/~p00006400006500007000006500006e00006400006500006e000063000069000065000073/10/~p000074000079000070000065", ""),
        (r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","dependentSchemas":{"a/~":{"type":"string"}}}"##, r##"{"a/~":true}"##, "dependentSchemas", "a/~", "#/~p00006400006500007000006500006e00006400006500006e00007400005300006300006800006500006d000061000073/a~1~0/~p000074000079000070000065", ""),
        (r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","dependentSchemas":{"10":{"type":"string"}}}"##, r##"{"10":true}"##, "dependentSchemas", "10", "#/~p00006400006500007000006500006e00006400006500006e00007400005300006300006800006500006d000061000073/10/~p000074000079000070000065", ""),
        (r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","properties":{"a/~":{"type":"string"}}}"##, r##"{"a/~":true}"##, "properties", "a/~", "#/~p00007000007200006f000070000065000072000074000069000065000073/~p00006100002f00007e/~p000074000079000070000065", "/~p00006100002f00007e"),
        (r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","properties":{"10":{"type":"string"}}}"##, r##"{"10":true}"##, "properties", "10", "#/~p00007000007200006f000070000065000072000074000069000065000073/~p000031000030/~p000074000079000070000065", "/~p000031000030"),
    ] {
        let mut admission = Context::catalog();
        let python_schema = crate::python_value::python_from_core_value(&json(source), &mut admission).unwrap();
        let python_instance = crate::python_value::python_from_core_value(&json(data), &mut admission).unwrap();
        let owner = CompiledSchema::compile_python_source(
            &python_schema,
            &crate::python_value::PythonSchemaResources::default(),
            false,
            PythonReVersion::V3_11,
            &mut admission,
        ).unwrap();
        let compiled = &*owner.compiled;
        assert!(compiled.owner_plans.is_none(), "this is Python fallback, not native arena qualification");
        assert!(!compiled.python_source_keys.is_empty());
        // Demonstrate genuine source binding of the exact key consumed by the
        // evaluator; never populate maps or fabricate a source-key pointer.
        let Value::Object(rules) = get(&*compiled.schema, keyword).expect("authored keyword") else {
            panic!("authored schema-valued dependency/properties object");
        };
        let (key, _) = rules.iter().find(|(key, _)| key == &Utf16::from(trigger)).expect("authored trigger");
        let bound = compiled.python_source_keys.get(&(key as *const Utf16 as usize)).expect("actual Python-bound trigger");
        let expected_points: Vec<_> = trigger.chars().map(u32::from).collect();
        assert_eq!(bound.codepoints(), expected_points.as_slice());
        let mut ctx = Context::catalog();
        let outcome = compiled.evaluate_instance_with_mode(&python_instance, EvaluationMode::AllErrors, &mut ctx).unwrap();
        assert!(outcome.terminal_error.is_none());
        assert_eq!(outcome.errors.len(), 1, "{keyword}/{trigger}");
        let error = &outcome.errors[0];
        assert_eq!(error.keyword, "type");
        assert!(error.python_source_path);
        // Inspect RAW StructuralError paths BEFORE PythonCompiledSchema's
        // output decoder can make marked/plain representations look alike.
        // The complete literal oracle preserves source-aware keyword/type
        // segments, while dependencies' trigger alone stays a plain pointer.
        assert_eq!(error.schema_path, Utf16::from(expected_schema_path), "{keyword}/{trigger}");
        assert_eq!(error.instance_path, Utf16::from(expected_instance_path), "{keyword}/{trigger}");
        assert!(ctx.evaluation_paths.is_none(), "fallback cannot bootstrap a tracked arena");
    }
}

// Genuine required ARRAY-index boundary; source-only, no native execution.
#[test]
fn phb11_python_required_array_indices_are_plain_and_property_numeric_keys_stay_marked() {
    use crate::python_value::{
        PyText, PythonConsumerValue as Py, PythonSchemaPathSegment as Segment,
    };
    let mut names: Vec<_> = (0..9)
        .map(|i| PyText::from_utf8(&format!("r{i}")))
        .collect();
    names.push(PyText::from_codepoints(vec![0x1f600]).unwrap());
    names.push(PyText::from_codepoints(vec![0xd83d, 0xde00]).unwrap());
    assert_ne!(names[9], names[10]);
    let source = Py::Object(vec![
        (
            PyText::from_utf8("required"),
            Py::Array(names.iter().cloned().map(Py::String).collect()),
        ),
        (
            PyText::from_utf8("properties"),
            Py::Object(vec![(
                PyText::from_utf8("10"),
                Py::Object(vec![(
                    PyText::from_utf8("type"),
                    Py::String(PyText::from_utf8("string")),
                )]),
            )]),
        ),
    ]);
    let mut admission = Context::catalog();
    let owner = CompiledSchema::compile_python_source(
        &source,
        &crate::python_value::PythonSchemaResources::default(),
        false,
        PythonReVersion::V3_11,
        &mut admission,
    )
    .unwrap();
    let compiled = &*owner.compiled;
    assert!(compiled.owner_plans.is_none());
    let Value::Object(members) = &*compiled.schema else {
        panic!("genuine projected schema");
    };
    let (required_key, required_rule) = members
        .iter()
        .find(|(key, _)| key == &Utf16::from("required"))
        .unwrap();
    let Value::Array(required) = required_rule else {
        panic!("actual required array");
    };
    assert_eq!(required.len(), 11);
    assert_eq!(
        compiled
            .python_source_keys
            .get(&(required_key as *const Utf16 as usize))
            .unwrap()
            .codepoints(),
        &[114, 101, 113, 117, 105, 114, 101, 100]
    );
    let mut ctx = Context::catalog();
    let (_, sp) = compiled.evaluator_root_paths(&mut ctx).unwrap();
    // Genuine source-bound keyword key supplies the original marked parent.
    let kp = compiled
        .pair_schema_pointer(&sp, required_key, &mut ctx)
        .unwrap();
    assert_eq!(
        kp.text(),
        &Utf16::from("#/~p000072000065000071000075000069000072000065000064")
    );
    for index in [0usize, 9, 10] {
        let Value::String(name) = &required[index] else {
            panic!("genuine required string");
        };
        let registered = compiled
            .python_source_strings
            .get(&(name as *const Utf16 as usize))
            .unwrap();
        assert_eq!(
            registered, &names[index],
            "actual source binding of array element"
        );
        // Exact real helper/input boundary used by required's enumerated path.
        // The later public diagnostic exposes kp, not this temporary req_path;
        // this helper readback alone is not a callsite-routing trace claim.
        let req_path = compiled
            .pair_plain_schema_pointer(&kp, &Utf16::from(index.to_string()), &mut ctx)
            .unwrap();
        let literal = match index {
            0 => "#/~p000072000065000071000075000069000072000065000064/0",
            9 => "#/~p000072000065000071000075000069000072000065000064/9",
            10 => "#/~p000072000065000071000075000069000072000065000064/10",
            _ => unreachable!(),
        };
        assert_eq!(req_path.text(), &Utf16::from(literal));
        assert_eq!(
            crate::python_value::python_schema_path_segments_from_internal(
                req_path.text(),
                &mut ctx
            )
            .unwrap(),
            vec![
                Segment::Key(PyText::from_utf8("required")),
                Segment::Index(index)
            ]
        );
        match compiled
            .source_text_value(req_path.text(), name, &mut ctx)
            .unwrap()
        {
            InstanceText::Python(text) => assert_eq!(text, &names[index]),
            InstanceText::Utf16(_) => {
                panic!("must recover actual required Python codepoint source")
            }
        }
    }
    // CONTRAST: a genuine source-bound numeric PROPERTY KEY is still a key,
    // not required's numeric array index. Never substitute it for the array case.
    let (properties_key, properties_rule) = members
        .iter()
        .find(|(key, _)| key == &Utf16::from("properties"))
        .unwrap();
    let Value::Object(properties) = properties_rule else {
        panic!("actual properties");
    };
    let (numeric_key, _) = &properties[0];
    assert_eq!(
        compiled
            .python_source_keys
            .get(&(numeric_key as *const Utf16 as usize))
            .unwrap(),
        &PyText::from_utf8("10")
    );
    let property_parent = compiled
        .pair_schema_pointer(&sp, properties_key, &mut ctx)
        .unwrap();
    let property_path = compiled
        .pair_schema_pointer(&property_parent, numeric_key, &mut ctx)
        .unwrap();
    assert_eq!(
        property_path.text(),
        &Utf16::from(
            "#/~p00007000007200006f000070000065000072000074000069000065000073/~p000031000030"
        )
    );
    assert_eq!(
        crate::python_value::python_schema_path_segments_from_internal(
            property_path.text(),
            &mut ctx
        )
        .unwrap(),
        vec![
            Segment::Key(PyText::from_utf8("properties")),
            Segment::Key(PyText::from_utf8("10"))
        ]
    );
    // Real evaluator: scalar is present; the distinct explicit-surrogate-pair
    // name at ARRAY index10 is missing despite the identical UTF16 projection.
    let mut data: Vec<_> = names[..10]
        .iter()
        .cloned()
        .map(|name| (name, Py::Bool(true)))
        .collect();
    data.push((PyText::from_utf8("10"), Py::Bool(true)));
    let first = compiled
        .evaluate_instance_with_mode(
            &Py::Object(data.clone()),
            EvaluationMode::AllErrors,
            &mut ctx,
        )
        .unwrap();
    assert!(first.terminal_error.is_none());
    assert_eq!(first.errors.len(), 2);
    let missing: Vec<_> = first
        .errors
        .iter()
        .filter(|e| e.keyword == "required")
        .collect();
    assert_eq!(missing.len(), 1);
    assert_eq!(missing[0].instance_path, Utf16::default());
    assert_eq!(missing[0].schema_path, kp.text().clone());
    assert_eq!(
        missing[0].message,
        Utf16::from("must have required property '😀'")
    );
    let property_errors: Vec<_> = first
        .errors
        .iter()
        .filter(|e| e.keyword == "type")
        .collect();
    assert_eq!(property_errors.len(), 1);
    assert_eq!(
        property_errors[0].instance_path,
        Utf16::from("/~p000031000030")
    );
    assert_eq!(property_errors[0].schema_path,Utf16::from("#/~p00007000007200006f000070000065000072000074000069000065000073/~p000031000030/~p000074000079000070000065"));
    data.push((names[10].clone(), Py::Bool(true)));
    let complete = compiled
        .evaluate_instance_with_mode(&Py::Object(data), EvaluationMode::AllErrors, &mut ctx)
        .unwrap();
    assert!(complete.terminal_error.is_none());
    assert_eq!(complete.errors, vec![(*property_errors[0]).clone()]);
    assert!(
        ctx.evaluation_paths.is_none(),
        "genuine Python fallback, not arena qualification"
    );
}

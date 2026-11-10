// SPDX-License-Identifier: MIT OR Apache-2.0
//! OC1 independent source controls. UNCOMPILED / NATIVE UNEXECUTED.
//! Actual safe mint only; no synthetic Engine/bank/profile records.
use super::*;
use crate::engine::{Engine, ResourceSet};
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
fn inputs() -> ResourceSet {
    ResourceSet::new(
        json(include_str!("../../../spec/core/schema.json")),
        json(include_str!(
            "../../../spec/core/semantic-type-reference.schema.json"
        )),
        json(include_str!(
            "../../../spec/core/extension-package.schema.json"
        )),
        json(include_str!(
            "../../../spec/metamodel/generated/core-constraints.json"
        )),
        json(include_str!(
            "../../../spec/metamodel/generated/domain-policy.json"
        )),
    )
}
fn in_engine<T>(
    ctx: &mut Context<'_>,
    f: impl FnOnce(&Engine, &mut Context<'_>) -> Result<T, EngineError>,
) -> Result<T, EngineError> {
    ctx.with_codegen_construction(|ctx| {
        let e = Engine::new(inputs(), ctx)?;
        f(&e, ctx)
    })
}
fn with_catalogue<T>(
    f: impl FnOnce(
        &Engine,
        CodegenCatalogue,
        &SchemaResources,
        &mut Context<'_>,
    ) -> Result<T, EngineError>,
) -> T {
    in_engine(&mut Context::catalog(), |e, ctx| {
        let export = e.schema_resources_with_context(ctx)?;
        let catalogue = e
            .codegen_catalogue_with_context(ctx)?
            .expect("actual completed admitted Engine");
        f(e, catalogue, &export, ctx)
    })
    .unwrap()
}
fn observed<T>(f: impl FnOnce() -> T) -> (T, Vec<(&'static str, usize)>) {
    let rows = Rc::new(RefCell::new(Vec::new()));
    let sink = rows.clone();
    let result = observe_codegen_catalogue(Box::new(move |e, n| sink.borrow_mut().push((e, n))), f);
    let copy = rows.borrow().clone();
    (result, copy)
}
fn rows(c: &CodegenCatalogue) -> Vec<(Utf16, Value)> {
    (0..c.len())
        .map(|i| {
            let (k, v) = c.get(i).unwrap();
            (k.clone(), v.clone())
        })
        .collect()
}
fn parity(
    root: &Value,
    c: &CodegenCatalogue,
    export: &SchemaResources,
    ctx: &mut Context<'_>,
) -> Option<CompiledSchema> {
    let a = CompiledSchema::compile_with_codegen_catalogue(root, c, ctx);
    let b = CompiledSchema::compile(root, export, ctx);
    match (a, b) {
        (Err(a), Err(b)) => {
            assert_eq!(a, b);
            None
        }
        (Ok(a), Ok(b)) => {
            assert_eq!(a.schema_value(), b.schema_value());
            assert_eq!(
                a.catalogue_entries()
                    .iter()
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect::<Vec<_>>(),
                b.catalogue_entries()
                    .iter()
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect::<Vec<_>>()
            );
            for value in [Value::Null, Value::Bool(true), json(r#"{"x":false}"#)] {
                assert_eq!(a.validate(&value, ctx), b.validate(&value, ctx));
            }
            Some(a)
        }
        _ => panic!("handoff/original compiler result differs"),
    }
}
fn table_value() -> Value {
    json(r#"{"$id":"https://oc1.test/table","type":"integer","default":{"unknown":[null,"☃😀"]}}"#)
}

#[test]
fn oc01_original_borrowed_root_first_mode_and_error_order() {
    with_catalogue(|_, c, export, ctx| {
        for root in [
            Value::Object(vec![
                (Utf16::from("type"), Value::string_utf8("integer")),
                (Utf16::from("type"), Value::Bool(false)),
            ]),
            Value::Object(vec![(Utf16::from("default"), Value::Number(f64::NAN))]),
            json(r#"{"$schema":7,"type":7}"#),
        ] {
            let before = c.profile_snapshot_for_test();
            let (result, events) = observed(|| parity(&root, &c, export, ctx));
            assert!(result.is_none());
            assert_eq!(c.profile_snapshot_for_test(), before);
            assert!(!events
                .iter()
                .any(|r| r.0 == "oc1-root-profile-complete"
                    || r.0 == "oc1-profile-publication-attempt"));
        }
        // Root-versus-hostile-catalogue ordering is reachable ONLY on the
        // original raw boundary, not by forging completed Engine custody.
        let hostile = SchemaResources {
            entries: vec![(Utf16::from("https://oc1.test/bad"), Value::Number(f64::NAN))],
        };
        let duplicate = Value::Object(vec![
            (Utf16::from("type"), Value::string_utf8("boolean")),
            (Utf16::from("type"), Value::Bool(false)),
        ]);
        let first = CompiledSchema::compile(&duplicate, &hostile, ctx)
            .err()
            .unwrap();
        assert_eq!(first.code, "DUPLICATE_KEY");
        assert_eq!(first.path, Utf16::from("#"));
        let later = CompiledSchema::compile(&Value::Bool(true), &hostile, ctx)
            .err()
            .unwrap();
        assert_eq!(later.code, "NUMBER");
        assert_eq!(later.path, Utf16::from("#"));
        // Original borrowed SchemaJSON accepts finite bit patterns at THIS
        // first boundary. This is not a claim that all later compiler stages do.
        for number in [-0.0, 1e300, 9_007_199_254_740_992.0] {
            let root = Value::Object(vec![(Utf16::from("default"), Value::Number(number))]);
            let copy = schema_json_with_mode(&root, ctx, false, true)?.unwrap();
            let Value::Number(actual) = get(&copy, "default").unwrap() else {
                panic!("numeric annotation");
            };
            assert_eq!(actual.to_bits(), number.to_bits());
            let _ = parity(&root, &c, export, ctx);
        }
        Ok(())
    });
}

#[test]
fn oc02_ordered_catalogue_duplicates_and_table_extension() {
    with_catalogue(|_, c, export, ctx| {
        assert_eq!(rows(&c), export.entries);
        let existing = export.entries[0].0.clone();
        let different = Value::Object(vec![
            (Utf16::from("$id"), Value::String(existing)),
            (Utf16::from("type"), Value::string_utf8("boolean")),
        ]);
        let retained = c
            .with_tables_schema(&different, ctx)?
            .expect("no new storage for present ID");
        assert_eq!(
            rows(&retained),
            export.entries,
            "present ID retains original row, not a new conflict rule"
        );
        let mut mutable = table_value();
        let extended = retained
            .with_tables_schema(&mutable, ctx)?
            .expect("tiny genuine extension");
        let mut expected = export.entries.clone();
        expected.push((Utf16::from("https://oc1.test/table"), mutable.clone()));
        assert_eq!(rows(&extended), expected);
        mutable = Value::Bool(false);
        assert_eq!(mutable, Value::Bool(false));
        assert_eq!(
            rows(&extended),
            expected,
            "caller mutation cannot alter immutable extension"
        );
        let mut material = SchemaResources { entries: expected };
        assert!(parity(&json(r#"{"type":"boolean"}"#), &extended, &material, ctx).is_some());
        // Malformed duplicate catalogues are RAW fallback fixtures, not forged
        // into the successfully completed Engine's immutable handoff.
        material.entries.push(material.entries[0].clone());
        let root = json(r#"{"type":"boolean"}"#);
        assert!(CompiledSchema::compile(&root, &material, ctx).is_ok());
        let id = material.entries[0].0.clone();
        material
            .entries
            .push((id.clone(), json(r#"{"type":"boolean"}"#)));
        let error = CompiledSchema::compile(&root, &material, ctx)
            .err()
            .unwrap();
        assert_eq!(error.code, "SCHEMA_ID_CONFLICT");
        assert_eq!(error.path, id);
        Ok(())
    });
    with_catalogue(|_, c, _, ctx| {
        let error = c.with_tables_schema(&Value::Bool(true), ctx).err().unwrap();
        assert_eq!(
            error,
            EngineError::new(
                "CODEGEN_RESOURCE_INVALID",
                Utf16::default(),
                "Tables schema requires an $id"
            )
        );
        Ok(())
    });
}

#[test]
fn oc03_genuine_ownership_immutability_context_limits_and_raw_fallback() {
    let (c, export) = with_catalogue(|_, c, export, ctx| {
        assert!(parity(&json(r#"{"type":"integer"}"#), &c, export, ctx).is_some());
        Ok((c, export.clone()))
    });
    let before = c.profile_snapshot_for_test();
    assert!(before.1.is_some());
    // The original construction Context is gone; a new Context may not mint a
    // matching lifetime just because it receives the retained wrapper.
    let (_, events) = observed(|| {
        parity(
            &json(r#"{"type":"boolean"}"#),
            &c,
            &export,
            &mut Context::catalog(),
        )
    });
    assert!(!events
        .iter()
        .any(|r| r.0 == "oc1-completed-profile-hit" || r.0 == "oc1-profile-publication-attempt"));
    assert_eq!(c.profile_snapshot_for_test(), before);
    let limits = crate::context::Limits {
        max_depth: 127,
        ..crate::context::Limits::catalog()
    };
    let mut changed =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    changed
        .with_codegen_construction(|ctx| {
            let _ = parity(&Value::Bool(true), &c, &export, ctx);
            Ok(())
        })
        .unwrap();
    assert_eq!(c.profile_snapshot_for_test(), before);
    match Context::with_limits(crate::context::ResourceProfile::HardIsolated, limits) {
        Err(e) => assert_eq!(e.code, "RESOURCE_PROFILE_UNAVAILABLE"),
        Ok(_) => panic!("original unavailable profile"),
    }
    let mut ordinary = Context::catalog();
    let raw = Engine::new(inputs(), &mut ordinary).unwrap();
    assert!(raw
        .codegen_catalogue_with_context(&mut ordinary)
        .unwrap()
        .is_none());
}

#[test]
fn oc04_first_complete_schemajson_profile_not_semantic_success() {
    with_catalogue(|_, c, export, ctx| {
        assert_eq!(c.profile_snapshot_for_test(), (0, None, 0));
        let root = json(r#"{"type":"integer","default":{"unknown":["☃😀",{"a/~":true}]}}"#);
        let (result, events) = observed(|| parity(&root, &c, export, ctx));
        assert!(result.is_some());
        let root_done = events
            .iter()
            .position(|r| r.0 == "oc1-root-profile-complete")
            .unwrap();
        let publication = events
            .iter()
            .position(|r| r.0 == "oc1-profile-publication-attempt")
            .unwrap();
        assert!(root_done < publication);
        assert_eq!(c.profile_snapshot_for_test().2, export.entries.len());
        let (bad, events) = observed(|| parity(&json(r#"{"type":7}"#), &c, export, ctx));
        assert!(
            bad.is_none(),
            "existing catalogue profile is not schema success"
        );
        assert!(events.iter().any(|r| r.0 == "oc1-completed-profile-hit"));
        assert!(!events
            .iter()
            .any(|r| r.0 == "oc1-profile-publication-attempt"));
        // A genuine CoreJSON-valid table can still fail later Schema semantics.
        let invalid = json(r#"{"$id":"https://oc1.test/invalid","type":7}"#);
        let extended = c
            .with_tables_schema(&invalid, ctx)?
            .expect("tiny extension");
        assert_eq!(extended.profile_snapshot_for_test().1, None);
        let mut material = export.clone();
        material
            .entries
            .push((Utf16::from("https://oc1.test/invalid"), invalid));
        assert!(parity(&Value::Bool(true), &extended, &material, ctx).is_none());
        assert_eq!(extended.profile_snapshot_for_test().1, None);
        Ok(())
    });
}

#[test]
fn oc06_completed_compile_cache_displacement_and_late_activation() {
    with_catalogue(|_, c, export, ctx| {
        let root = json(r#"{"type":"integer"}"#);
        let first = CompiledSchema::compile_with_codegen_catalogue(&root, &c, ctx)?;
        let (second, events) =
            observed(|| CompiledSchema::compile_with_codegen_catalogue(&root, &c, ctx));
        let second = second?;
        assert!(events.iter().any(|r| r.0 == "oc1-completed-profile-hit"));
        let (SchemaBacking::Shared(a), SchemaBacking::Shared(b)) =
            (&first.resources, &second.resources)
        else {
            panic!("actual completed shared catalogue");
        };
        assert!(Arc::ptr_eq(a, b));
        let (new_schema, events) =
            observed(|| parity(&json(r#"{"type":"boolean"}"#), &c, export, ctx));
        let new_schema = new_schema.unwrap();
        assert!(!new_schema.validate(&Value::Number(1.0), ctx)?.is_empty());
        assert!(events.iter().any(|r| r.0 == "oc1-completed-profile-hit"));
        let mut material = export.clone();
        let extra = table_value();
        material
            .entries
            .push((Utf16::from("https://oc1.test/table"), extra.clone()));
        let extended = c.with_tables_schema(&extra, ctx)?.expect("tiny extension");
        assert_eq!(extended.profile_snapshot_for_test().1, None);
        let (_, events) = observed(|| parity(&root, &extended, &material, ctx));
        assert!(
            !events.iter().any(|r| r.0 == "oc1-completed-profile-hit"),
            "self-consuming extension invalidates profile"
        );
        Ok(())
    });
}

#[test]
fn oc07_actual_debit_groups_preserve_first_denial_and_no_partial_profile() {
    // Calibration observes actual callback ordinals at source-bound event
    // groups. It never resets Context work, changes tariffs or prices a ctor.
    let recorded = Rc::new(RefCell::new(Vec::new()));
    let count_log = recorded.clone();
    let active = Rc::new(Cell::new(false));
    let count = Rc::new(Cell::new(0usize));
    let ac = active.clone();
    let ct = count.clone();
    let mut meter = move |_| {
        if ac.get() {
            ct.set(ct.get() + 1);
        }
        Ok(())
    };
    let observed_count = count.clone();
    in_engine(
        &mut Context::catalog().with_host_control(&mut meter),
        |e, ctx| {
            active.set(true);
            observe_codegen_catalogue(
                Box::new(move |event, _| {
                    if [
                        "oc1-engine-mint",
                        "oc1-extension-reserve",
                        "oc1-extension-publication",
                        "oc1-root-profile-complete",
                        "oc1-profile-publication-attempt",
                    ]
                    .contains(&event)
                    {
                        count_log.borrow_mut().push((event, observed_count.get()));
                    }
                }),
                || {
                    let c = e.codegen_catalogue_with_context(ctx)?.unwrap();
                    let c = c.with_tables_schema(&table_value(), ctx)?.unwrap();
                    CompiledSchema::compile_with_codegen_catalogue(&Value::Bool(true), &c, ctx)?;
                    Ok(())
                },
            )
        },
    )
    .unwrap();
    let targets = recorded.borrow().clone();
    assert!(!targets.is_empty());
    for (_group, target) in targets {
        assert!(target > 0);
        let active = Cell::new(false);
        let count = Cell::new(0usize);
        let terminal = Cell::new(false);
        let before_error = Cell::new(usize::MAX);
        let events = Rc::new(RefCell::new(Vec::new()));
        let sink = events.clone();
        let first = EngineError::new(
            "OC_FIRST",
            Utf16::new(vec![47, 0xd800]),
            "first host denial",
        );
        let mut stop = |_| {
            if active.get() {
                assert!(!terminal.get(), "callback after first denial");
                count.set(count.get() + 1);
                if count.get() == target {
                    terminal.set(true);
                    before_error.set(events.borrow().len());
                    return Err(first.clone());
                }
            }
            Ok(())
        };
        let retained: RefCell<Option<Rc<CodegenCatalogue>>> = RefCell::new(None);
        let result = in_engine(
            &mut Context::catalog().with_host_control(&mut stop),
            |e, ctx| {
                active.set(true);
                observe_codegen_catalogue(
                    Box::new(move |event, n| sink.borrow_mut().push((event, n))),
                    || {
                        let c = e.codegen_catalogue_with_context(ctx)?.unwrap();
                        let c = c.with_tables_schema(&table_value(), ctx)?.unwrap();
                        let c = Rc::new(c);
                        *retained.borrow_mut() = Some(c.clone());
                        CompiledSchema::compile_with_codegen_catalogue(
                            &Value::Bool(true),
                            &c,
                            ctx,
                        )?;
                        Ok(())
                    },
                )
            },
        );
        assert_eq!(result.err().unwrap(), first.from_host());
        assert_eq!(count.get(), target);
        assert_eq!(events.borrow().len(), before_error.get());
        if let Some(c) = retained.borrow().as_ref() {
            assert_eq!(c.profile_snapshot_for_test().1, None);
        };
    }
}

#[test]
fn oc08_reentry_unwind_and_independent_catalogue_isolation() {
    with_catalogue(|e, c, export, ctx| {
        let independent = e.codegen_catalogue_with_context(ctx)?.unwrap();
        assert_eq!(independent.profile_snapshot_for_test(), (0, None, 0));
        let c = Rc::new(c);
        let observer_c = c.clone();
        let once = Rc::new(Cell::new(false));
        let entered = once.clone();
        let result = catch_unwind(AssertUnwindSafe(|| {
            observe_codegen_catalogue(
                Box::new(move |event, _| {
                    if event == "oc1-profile-publication-attempt" && !entered.replace(true) {
                        assert_eq!(
                            observer_c.profile_snapshot_for_test().1,
                            None,
                            "observer may read memo: no held mutex"
                        );
                        // Safe independent construction, no forged same-context token.
                        with_catalogue(|_, inner, export, ctx| {
                            assert!(parity(&Value::Bool(true), &inner, export, ctx).is_some());
                            Ok(())
                        });
                        panic!("before outer epoch checked profile store");
                    }
                }),
                || CompiledSchema::compile_with_codegen_catalogue(&Value::Bool(true), &c, ctx),
            )
        }));
        assert!(result.is_err());
        assert!(once.get());
        assert_eq!(c.profile_snapshot_for_test().1, None);
        assert_eq!(independent.profile_snapshot_for_test(), (0, None, 0));
        assert!(parity(&Value::Bool(true), &c, export, ctx).is_some());
        assert_eq!(independent.profile_snapshot_for_test().1, None);
        // Same-memo mutation under the same borrowed Context is not forged;
        // epoch guard/revalidation is additionally bound by exact owner source.
        Ok(())
    });
    // Component-level split-protocol guard, NOT public same-Context callback
    // interleaving. Every input below comes from real completed API results.
    with_catalogue(|_, catalogue, _, ctx| {
        let (saved_epoch, pending) = catalogue.completed(SchemaDialect::Draft2020_12, ctx)?;
        assert_ne!(
            saved_epoch,
            u64::MAX,
            "genuine original construction lifetime"
        );
        assert!(pending.is_none(), "fresh opaque catalogue");
        let first =
            CompiledSchema::compile_with_codegen_catalogue(&Value::Bool(true), &catalogue, ctx)?;
        assert_eq!(first.dialect, SchemaDialect::Draft2020_12);
        assert!(
            matches!(&first.resources, SchemaBacking::Shared(_)),
            "genuine first completed backing"
        );
        let second = CompiledSchema::compile_with_codegen_catalogue(
            &json(r#"{"$schema":"https://json-schema.org/draft/2019-09/schema","type":"integer"}"#),
            &catalogue,
            ctx,
        )?;
        assert_eq!(second.dialect, SchemaDialect::Draft2019_09);
        assert_ne!(
            first.dialect, second.dialect,
            "stale publication has an observably different dialect"
        );
        let before = catalogue.profile_snapshot_for_test();
        assert!(
            before.0 > saved_epoch,
            "two genuine successful calls advanced the actual epoch"
        );
        assert_eq!(before.1, Some(second.dialect));
        let (current_epoch, current_backing) = catalogue.completed(second.dialect, ctx)?;
        assert_eq!(current_epoch, before.0);
        let current_backing = current_backing.expect("genuine later completed profile");
        // Saved old epoch and unchanged first result fields: no synthetic
        // resources/profile, memo assignment, or manufactured Context token.
        catalogue.publish_completed(saved_epoch, first.dialect, &first.resources, ctx)?;
        assert_eq!(catalogue.profile_snapshot_for_test(), before);
        let (after_epoch, after_backing) = catalogue.completed(second.dialect, ctx)?;
        assert_eq!(after_epoch, current_epoch);
        let after_backing = after_backing.expect("later real dialect survives stale publication");
        assert!(Arc::ptr_eq(&current_backing, &after_backing));
        Ok(())
    });
}

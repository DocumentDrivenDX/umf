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
fn oc00_registry_scope_slot_is_priced_even_when_scope_never_opens() {
    let charges = Rc::new(RefCell::new(Vec::new()));
    let sink = charges.clone();
    let mut meter = move |amount| {
        sink.borrow_mut().push(amount);
        Ok(())
    };
    let mut ctx = Context::catalog().with_host_control(&mut meter);
    let before = ctx.charged_work();
    ctx.with_codegen_construction(|_| Ok(())).unwrap();
    let initialization_work = 1 + registry_catalogue_scope_slot_work();
    assert_eq!(ctx.charged_work() - before, initialization_work as u64);
    assert_eq!(*charges.borrow(), vec![initialization_work]);
    assert_eq!(REGISTRY_CATALOGUE_SCOPE_PROBES, 4);
    assert_eq!(REGISTRY_CATALOGUE_SCOPE_TOTAL_WORK, (REGISTRY_CATALOGUE_SCOPE_ENTRY_WORK
        + REGISTRY_CATALOGUE_SCOPE_OPEN_WORK
        + 4 * (REGISTRY_CATALOGUE_SCOPE_LOOKUP_WORK + REGISTRY_CATALOGUE_SCOPE_ATTEMPT_WORK
            + REGISTRY_CATALOGUE_SCOPE_GUARD_WORK)
        + REGISTRY_CATALOGUE_SCOPE_PUBLISH_WORK) as u64);
}

#[test]
fn oc09_registry_tail_reuses_only_after_full_same_owner_comparison() {
    with_catalogue(|_, catalogue, export, ctx| {
        // Seed the genuine construction-owned catalogue through the existing
        // Codegen handoff, then exercise the ordinary Registry compile path.
        let root = Value::Bool(true);
        CompiledSchema::compile_with_codegen_catalogue(&root, &catalogue, ctx)?;
        let (results, events) = observed(|| {
            with_registry_catalogue_reuse(export, ctx, |ctx| {
                (0..4)
                    .map(|_| CompiledSchema::compile(&root, export, ctx))
                    .collect::<Result<Vec<_>, _>>()
            })
        });
        let results = results?;
        assert_eq!(results.len(), 4);
        let first = events.iter().filter(|r| r.0 == "registry-tail-first-equality").collect::<Vec<_>>();
        let reuses = events.iter().filter(|r| r.0 == "registry-tail-reuse").collect::<Vec<_>>();
        assert_eq!(first.len(), 1, "the original ordered equality runs once before reuse");
        assert!(first[0].1 > 20, "comparison includes the full admitted catalogue traversal");
        assert_eq!(reuses.len(), 3, "only later same-owner Registry compiles may retire work");
        assert!(reuses.iter().all(|r| r.1 == first[0].1));
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-proof-published").count(), 1);
        Ok(())
    });
}

#[test]
fn oc10_registry_tail_declines_foreign_owner_and_scope_cleans_up_on_refusal() {
    with_catalogue(|_, catalogue, export, ctx| {
        let root = Value::Bool(true);
        CompiledSchema::compile_with_codegen_catalogue(&root, &catalogue, ctx)?;
        let foreign_owner = export.clone();
        let (_, foreign_events) = observed(|| {
            with_registry_catalogue_reuse(export, ctx, |ctx| {
                CompiledSchema::compile(&root, &foreign_owner, ctx)?;
                Ok(())
            })
        });
        assert!(foreign_events.iter().any(|r| r.0 == "registry-tail-decline-owner"));
        assert!(!foreign_events.iter().any(|r| r.0 == "registry-tail-reuse"));

        let refusal: Result<(), EngineError> = with_registry_catalogue_reuse(export, ctx, |_ctx| {
            Err(EngineError::new("OC_REFUSAL", Utf16::default(), "scope refusal"))
        });
        assert_eq!(refusal.unwrap_err().code, "OC_REFUSAL");
        let (_, after_refusal) = observed(|| CompiledSchema::compile(&root, export, ctx));
        assert!(!after_refusal.iter().any(|r| r.0.starts_with("registry-tail-")));
        Ok(())
    });
}

#[test]
fn oc11_registry_tail_counts_every_declined_probe_and_stops_at_four() {
    with_catalogue(|_, catalogue, export, ctx| {
        let root = Value::Bool(true);
        CompiledSchema::compile_with_codegen_catalogue(&root, &catalogue, ctx)?;
        let foreign_owner = export.clone();
        let (_, events) = observed(|| {
            with_registry_catalogue_reuse(export, ctx, |ctx| {
                for _ in 0..5 {
                    CompiledSchema::compile(&root, &foreign_owner, ctx)?;
                }
                Ok(())
            })
        });
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-decline-owner").count(), 4);
        assert!(!events.iter().any(|r| r.0 == "registry-tail-reuse"));
        assert!(!events.iter().any(|r| r.0 == "registry-tail-decline-exhausted"));
        Ok(())
    });
}

#[test]
fn oc12_registry_tail_invalidates_proof_after_caught_compile_error() {
    with_catalogue(|_, catalogue, export, ctx| {
        let root = Value::Bool(true);
        let invalid = json(r#"{"type":7}"#);
        CompiledSchema::compile_with_codegen_catalogue(&root, &catalogue, ctx)?;
        let (_, events) = observed(|| {
            with_registry_catalogue_reuse(export, ctx, |ctx| {
                CompiledSchema::compile(&root, export, ctx)?;
                assert!(CompiledSchema::compile(&invalid, export, ctx).is_err());
                // The caller catches the error and proceeds. This must use
                // the original full comparison because the proof was cleared.
                CompiledSchema::compile(&root, export, ctx)?;
                Ok(())
            })
        });
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-reuse").count(), 1);
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-decline-first-attempt-used").count(), 1);
        Ok(())
    });
}

#[test]
fn oc13_registry_tail_invalidates_proof_after_caught_unwind() {
    with_catalogue(|_, catalogue, export, ctx| {
        let root = Value::Bool(true);
        CompiledSchema::compile_with_codegen_catalogue(&root, &catalogue, ctx)?;
        let events = Rc::new(RefCell::new(Vec::new()));
        let sink = events.clone();
        let panic_once = Rc::new(Cell::new(false));
        let panic_flag = panic_once.clone();
        observe_codegen_catalogue(
            Box::new(move |event, amount| {
                sink.borrow_mut().push((event, amount));
                if event == "registry-tail-reuse" && !panic_flag.replace(true) {
                    panic!("test unwind after same-owner Arc reuse");
                }
            }),
            || {
                with_registry_catalogue_reuse(export, ctx, |ctx| {
                    CompiledSchema::compile(&root, export, ctx)?;
                    let failed = catch_unwind(AssertUnwindSafe(|| {
                        CompiledSchema::compile(&root, export, ctx)
                    }));
                    assert!(failed.is_err());
                    CompiledSchema::compile(&root, export, ctx)?;
                    Ok(())
                })
            },
        )?;
        assert!(panic_once.get());
        assert_eq!(events.borrow().iter().filter(|r| r.0 == "registry-tail-reuse").count(), 1);
        assert_eq!(events.borrow().iter().filter(|r| r.0 == "registry-tail-decline-first-attempt-used").count(), 1);
        Ok(())
    });
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


#[test]
fn oc14_live_proof_is_cleared_by_caught_early_host_refusal() {
    let refuse_guard = Rc::new(Cell::new(false));
    let meter_flag = refuse_guard.clone();
    let mut meter = move |amount| {
        if meter_flag.get() && amount == REGISTRY_CATALOGUE_SCOPE_GUARD_WORK {
            Err(EngineError::new("OC_GUARD_REFUSAL", Utf16::default(), "early proof guard refusal"))
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::catalog().with_host_control(&mut meter);
    let root = Value::Bool(true);
    let (result, events) = observed(|| {
        in_engine(&mut ctx, |engine, ctx| {
            let export = engine.schema_resources_with_context(ctx)?;
            let catalogue = engine.codegen_catalogue_with_context(ctx)?
                .expect("actual completed admitted Engine");
            CompiledSchema::compile_with_codegen_catalogue(&root, &catalogue, ctx)?;
            with_registry_catalogue_reuse(&export, ctx, |ctx| {
                CompiledSchema::compile(&root, &export, ctx)?;
                refuse_guard.set(true);
                let refused = CompiledSchema::compile(&root, &export, ctx).unwrap_err();
                assert_eq!(refused.code, "OC_GUARD_REFUSAL");
                refuse_guard.set(false);
                CompiledSchema::compile(&root, &export, ctx)?;
                Ok(())
            })
        })
    });
    result.unwrap();
    assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-proof-published").count(), 1);
    assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-first-attempt-used").count(), 1);
    assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-reuse").count(), 0);
    assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-fallback-equality").count(), 1,
        "after the caught early refusal the valid call must traverse the full catalogue again");
}

#[test]
fn oc15_prior_decline_then_match_cannot_publish_without_three_remaining_slots() {
    with_catalogue(|_, catalogue, export, ctx| {
        let root = Value::Bool(true);
        CompiledSchema::compile_with_codegen_catalogue(&root, &catalogue, ctx)?;
        let foreign_owner = export.clone();
        let (_, events) = observed(|| {
            with_registry_catalogue_reuse(export, ctx, |ctx| {
                CompiledSchema::compile(&root, &foreign_owner, ctx)?;
                CompiledSchema::compile(&root, export, ctx)?;
                CompiledSchema::compile(&root, export, ctx)?;
                CompiledSchema::compile(&root, export, ctx)?;
                Ok(())
            })
        });
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-decline-owner").count(), 1);
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-first-equality").count(), 1,
            "the post-decline match still performs and reports a full ordered comparison");
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-proof-published").count(), 0,
            "two remaining hit slots cannot repay publication");
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-reuse").count(), 0);
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-decline-first-attempt-used").count(), 2);
        Ok(())
    });
}


#[test]
fn oc16_live_proof_is_cleared_by_caught_early_guard_unwind() {
    let panic_guard = Rc::new(Cell::new(false));
    let meter_flag = panic_guard.clone();
    let mut meter = move |amount| {
        if meter_flag.get() && amount == REGISTRY_CATALOGUE_SCOPE_GUARD_WORK {
            panic!("early guard host-control unwind");
        }
        Ok(())
    };
    let mut ctx = Context::catalog().with_host_control(&mut meter);
    let root = Value::Bool(true);
    let (result, events) = observed(|| {
        in_engine(&mut ctx, |engine, ctx| {
            let export = engine.schema_resources_with_context(ctx)?;
            let catalogue = engine.codegen_catalogue_with_context(ctx)?
                .expect("actual completed admitted Engine");
            CompiledSchema::compile_with_codegen_catalogue(&root, &catalogue, ctx)?;
            with_registry_catalogue_reuse(&export, ctx, |ctx| {
                CompiledSchema::compile(&root, &export, ctx)?;
                panic_guard.set(true);
                let unwind = catch_unwind(AssertUnwindSafe(|| {
                    CompiledSchema::compile(&root, &export, ctx)
                }));
                assert!(unwind.is_err());
                panic_guard.set(false);
                CompiledSchema::compile(&root, &export, ctx)?;
                Ok(())
            })
        })
    });
    result.unwrap();
    assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-proof-published").count(), 1);
    assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-first-attempt-used").count(), 1);
    assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-reuse").count(), 0);
    assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-fallback-equality").count(), 1);
}


#[test]
fn oc17_bad_registry_entry_dialect_clears_proof_and_preserves_error() {
    with_catalogue(|_, catalogue, export, ctx| {
        let root = Value::Bool(true);
        let bad_dialect = Value::Object(vec![(
            Utf16::from("$schema"),
            Value::string_utf8("https://schemas.example.invalid/unknown"),
        )]);
        CompiledSchema::compile_with_codegen_catalogue(&root, &catalogue, ctx)?;
        let (result, events) = observed(|| {
            with_registry_catalogue_reuse(export, ctx, |ctx| {
                CompiledSchema::compile(&root, export, ctx)?;
                let error = CompiledSchema::compile(&bad_dialect, export, ctx).unwrap_err();
                assert_eq!(error, EngineError::new(
                    "SCHEMA_DIALECT",
                    Utf16::default(),
                    "Unsupported JSON Schema dialect",
                ));
                CompiledSchema::compile(&root, export, ctx)?;
                Ok(())
            })
        });
        result?;
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-proof-published").count(), 1);
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-reuse").count(), 0);
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-decline-first-attempt-used").count(), 1);
        assert_eq!(events.iter().filter(|r| r.0 == "registry-tail-fallback-equality").count(), 1,
            "after dialect refusal, the next eligible Registry call must perform ordered comparison");
        Ok(())
    });
}

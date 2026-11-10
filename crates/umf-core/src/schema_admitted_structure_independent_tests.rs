// SPDX-License-Identifier: MIT OR Apache-2.0
//! SOURCE ONLY; child of schema::owner_locations. H owns include/production.
//! No receipt, bank, lineage or schema-success proof is fabricated here.
use super::*;
use crate::engine::ResourceSet;
use admitted_bank::{BankRoot, SchemaBank};
use admitted_structure::{Builder, Structure, View};
use std::cell::{Cell, RefCell};
use std::rc::Rc;

fn units(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}
fn json(s: &str) -> Value {
    crate::serialization::read_json_value(
        &units(s),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn field<'a>(v: &'a Value, key: &str) -> &'a Value {
    get(v, key).unwrap()
}
fn small() -> ResourceSet {
    ResourceSet::new(
        json(
            r#"{"$id":"https://first.test/core","type":"integer","default":{"a/~☃":[null,{"😀":true}]}}"#,
        ),
        json(r#"{"$id":"https://first.test/reference","type":"string"}"#),
        json(r#"{"$id":"https://first.test/package","type":"boolean"}"#),
        json(r#"{"unknown-constraints":[true,null]}"#),
        json(r#"{"unknown-policy":"keep"}"#),
    )
}
fn canonical() -> ResourceSet {
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
fn five(r: &ResourceSet) -> [&Value; 5] {
    [
        &r.core_schema,
        &r.reference_schema,
        &r.package_schema,
        &r.constraints,
        &r.domain_policy,
    ]
}
fn owner(ctx: &mut Context<'_>) -> Result<CompiledSchema, EngineError> {
    let a = SchemaBank::admit_core(small(), ctx)?;
    CompiledSchema::compile_input_bank(a.bank, 0, ctx)
}
fn error() -> EngineError {
    let mut e = EngineError::new(
        "FIRST_TRAVERSAL_DENIED",
        Utf16::new(vec![47, 0xd800]),
        "original host failure",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("host-origin-δ"));
    e
}
fn host(actual: &EngineError, expected: &EngineError) {
    assert_eq!(actual.code, expected.code);
    assert_eq!(actual.path, expected.path);
    assert_eq!(actual.message, expected.message);
    assert_eq!(actual.python_message_origin, expected.python_message_origin);
    assert!(actual.is_control_failure());
}
fn children(v: &Value) -> Vec<&Value> {
    match v {
        Value::Object(v) => v.iter().map(|(_, v)| v).collect(),
        Value::Array(v) => v.iter().collect(),
        _ => vec![],
    }
}
fn structure_tree(view: &View, value: &Value, ctx: &mut Context<'_>) -> usize {
    let row = view.structure.node(view.root).unwrap();
    let kids = children(value);
    assert_eq!(row.count as usize, kids.len());
    let mut n = 1;
    for (i, v) in kids.iter().enumerate() {
        let child = Structure::child(view, i, ctx).unwrap().unwrap();
        let r = child.structure.node(child.root).unwrap();
        assert_eq!(r.parent as usize, view.root);
        assert_eq!(r.edge as usize, i);
        assert_eq!(r.depth, row.depth + 1);
        n += structure_tree(&child, v, ctx);
    }
    assert_eq!(row.end as usize - view.root, n);
    assert!(Structure::child(view, kids.len(), ctx).unwrap().is_none());
    n
}
fn table_tree(
    table: &OwnerLocations,
    owner: &CompiledSchema,
    cursor: &OwnerCursor,
    value: &Value,
    ctx: &mut Context<'_>,
) -> usize {
    let read = table.read(owner, cursor, ctx).unwrap().unwrap();
    assert_eq!(read, value);
    assert!(std::ptr::eq(read, value));
    let kids = children(value);
    let mut count = 1;
    for (i, v) in kids.iter().enumerate() {
        let child = table.child(owner, cursor, i, ctx).unwrap().unwrap();
        count += table_tree(table, owner, &child, v, ctx);
    }
    assert!(table
        .child(owner, cursor, kids.len(), ctx)
        .unwrap()
        .is_none());
    count
}
fn compare_tables(owner: &CompiledSchema, bound: &OwnerLocations, ctx: &mut Context<'_>) {
    let raw = OwnerLocations::build_with_events(owner, ctx, |_| {})
        .unwrap()
        .unwrap();
    let mut count = 0;
    for role in 0..=owner.catalogue_entries().len() {
        let value = if role == 0 {
            &*owner.schema
        } else {
            owner.catalogue_entries().get(role - 1).unwrap().1
        };
        let a = bound.root(owner, role, ctx).unwrap().unwrap();
        let b = raw.root(owner, role, ctx).unwrap().unwrap();
        let n = table_tree(bound, owner, &a, value, ctx);
        assert_eq!(n, table_tree(&raw, owner, &b, value, ctx));
        assert_eq!(bound.facts[role].nodes, raw.facts[role].nodes);
        assert_eq!(bound.facts[role].nested_ids, raw.facts[role].nested_ids);
        assert_eq!(
            bound.facts[role].nested_anchors,
            raw.facts[role].nested_anchors
        );
        count += n;
    }
    assert_eq!(count, bound.logical_node_count());
    assert_eq!(count, raw.materialized_node_count().unwrap());
}

#[test]
fn first_actual_owned_admission_collects_complete_subtree_coordinates() {
    let value = json(r#"{"a/~☃":[null,{"😀":true}],"opaque":{"future":[1,"keep"]}}"#);
    let expected = value.clone();
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let observations = Cell::new(0usize);
        let (value, structure) =
            crate::value::admit_owned_json_with_structure(value, ctx, &mut |_, _, _, _, _| {
                observations.set(observations.get() + 1);
                Ok(())
            })?;
        assert_eq!(value, expected);
        assert!(observations.get() > 0);
        let structure = structure.expect("completed real admission must collect small tree");
        let root = structure.root().unwrap();
        assert_eq!(root.root, 0);
        assert_eq!(structure.node(0).unwrap().parent, u32::MAX);
        let count = structure_tree(&root, &value, ctx);
        assert!(structure.node(count).is_none());
        assert!(structure.node(usize::MAX).is_none());
        assert!(Structure::child(&root, usize::MAX, ctx)?.is_none());
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn first_canonical_five_real_banks_bind_and_original_tables_read_every_role() {
    let input = canonical();
    let expected = input.clone();
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let a = SchemaBank::admit_core(input, ctx)?;
        for (actual, wanted) in five(&a.resources).into_iter().zip(five(&expected)) {
            assert_eq!(actual, wanted);
        }
        assert_eq!(a.bank.len(), 3);
        for role in 0..3 {
            let view = a.bank.structure_role(BankRoot::Core(role), ctx)?.unwrap();
            structure_tree(&view, five(&a.resources)[role], ctx);
            let compiled = CompiledSchema::compile_input_bank(Arc::clone(&a.bank), role, ctx)?;
            let bound = OwnerLocations::bind_admitted(&compiled, ctx)?
                .expect("must CONSUME completed coordinates, not just hold a field");
            compare_tables(&compiled, &bound, ctx);
            let root = bound.root(&compiled, 0, ctx)?.unwrap();
            let alias = bound.root(&compiled, role + 1, ctx)?.unwrap();
            assert!(!root.same_location(&alias));
            assert!(std::ptr::eq(
                bound.read(&compiled, &root, ctx)?.unwrap(),
                bound.read(&compiled, &alias, ctx)?.unwrap()
            ));
        }
        // constraints/policy are genuinely admitted/copied above but have no schema
        // Structure role API: do not invent Core(3/4) projections.
        assert!(a.bank.root_checked(BankRoot::Core(3)).is_none());
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn first_completed_parser_and_real_compiler_meta_preserve_all_twenty_projections() {
    let raw = include_str!("schema_metas.json");
    let raw_tree = json(raw);
    let rows = match field(&raw_tree, "resources") {
        Value::Array(v) => v,
        _ => panic!("metatree resource array"),
    };
    assert_eq!(rows.len(), 20);
    let extended = format!(
        "{{\"firstTraversalUnknown\":{{\"opaque\":[true,null]}},{}",
        raw.trim_start().strip_prefix('{').unwrap()
    );
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let completed = Arc::new(crate::serialization::read_construction_json_completed(
            &units(&extended),
            ctx,
        )?);
        assert_eq!(
            field(completed.value(), "firstTraversalUnknown"),
            &json(r#"{"opaque":[true,null]}"#)
        );
        let bank = SchemaBank::from_completed_reader(
            Arc::clone(&completed),
            SchemaDialect::Draft2020_12,
            ctx,
        )?;
        let whole = bank.whole_metatree().unwrap();
        assert!(std::ptr::eq(whole, &**completed.value()));
        assert_eq!(
            field(whole, "firstTraversalUnknown"),
            &json(r#"{"opaque":[true,null]}"#)
        );
        let root = bank.structure_role(BankRoot::Meta, ctx)?.unwrap();
        assert!(
            root.root > 0,
            "selected root is a subtree of physical metatree"
        );
        structure_tree(&root, bank.root(BankRoot::Meta), ctx);
        let draft7 =
            SchemaBank::from_completed_reader(Arc::clone(&completed), SchemaDialect::Draft7, ctx)?;
        let root7 = draft7.structure_role(BankRoot::Meta, ctx)?.unwrap();
        assert!(Arc::ptr_eq(&root7.structure, &root.structure));
        assert_ne!(
            root7.root, root.root,
            "dialect selects its own actual physical subtree"
        );
        assert_eq!(
            draft7.root(BankRoot::Meta),
            field(field(completed.value(), "metaschemas"), "Draft7Validator")
        );
        structure_tree(&root7, draft7.root(BankRoot::Meta), ctx);
        for (i, row) in rows.iter().enumerate() {
            let (id, value) = bank.get(i).unwrap();
            assert_eq!(&Value::String(id.clone()), field(row, "id"));
            assert_eq!(value, field(row, "schema"));
            let view = bank.structure_catalogue(i, ctx)?.unwrap();
            assert!(Arc::ptr_eq(&view.structure, &root.structure));
            structure_tree(&view, value, ctx);
        }
        let a = SchemaBank::admit_core(small(), ctx)?;
        let _ = CompiledSchema::compile_input_bank(a.bank, 0, ctx)?;
        let meta = {
            let state = ctx.schema_construction.as_ref().unwrap().borrow();
            Arc::clone(
                &state
                    .meta_validators
                    .iter()
                    .find(|(_, d, _)| *d == SchemaDialect::Draft2020_12)
                    .unwrap()
                    .2,
            )
        };
        assert_eq!(meta.catalogue_entries().len(), 20);
        let bound = OwnerLocations::bind_admitted(&meta, ctx)?
            .expect("actual compiler parsed-owner facts must be consumed");
        compare_tables(&meta, &bound, ctx);
        let root = bound.root(&meta, 0, ctx)?.unwrap();
        let mut aliases = 0;
        for (i, row) in rows.iter().enumerate() {
            let (id, value) = meta.catalogue_entries().get(i).unwrap();
            assert_eq!(&Value::String(id.clone()), field(row, "id"));
            assert_eq!(value, field(row, "schema"));
            if value == &*meta.schema {
                let alias = bound.root(&meta, i + 1, ctx)?.unwrap();
                assert!(!root.same_location(&alias));
                aliases += 1;
            }
        }
        assert!(aliases > 0);
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn first_failed_parse_admission_and_raw_arc_never_mint_completed_custody() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        for source in ["true false", "[1,]"] {
            let original = crate::serialization::read_json_value(
                &units(source),
                crate::serialization::Format::Json,
                &mut Context::catalog(),
            )
            .unwrap_err();
            let mut escaped = None;
            let failure = (|| {
                escaped = Some(crate::serialization::read_construction_json_completed(
                    &units(source),
                    ctx,
                )?);
                Ok::<(), EngineError>(())
            })()
            .unwrap_err();
            assert!(escaped.is_none());
            let state = ctx.schema_construction.as_ref().unwrap().borrow();
            assert!(state.parsed_metas.is_none());
            assert!(state.metas.is_none());
            drop(state);
            assert_eq!(
                (failure.code, failure.path, failure.message),
                (original.code, original.path, original.message)
            );
        }
        let bad = Value::Object(vec![(Utf16::from("x"), Value::Number(f64::NAN))]);
        let old = crate::copy_json(&bad, &mut Context::catalog()).unwrap_err();
        let mut escaped = None;
        let failure = (|| {
            escaped = Some(crate::value::admit_owned_json_with_structure(
                bad,
                ctx,
                &mut |_, _, _, _, _| Ok(()),
            )?);
            Ok::<(), EngineError>(())
        })()
        .unwrap_err();
        assert!(escaped.is_none());
        assert_eq!((failure.code, failure.path), (old.code, old.path));
        let tree = Arc::new(json(include_str!("schema_metas.json")));
        let raw = SchemaBank::from_meta(tree, SchemaDialect::Draft2020_12, ctx)?;
        assert!(raw.structure_role(BankRoot::Meta, ctx)?.is_none());
        assert!(raw.structure_catalogue(0, ctx)?.is_none());
        let selected_bad = Value::Number(f64::NAN);
        let original = schema_json_with_mode(&selected_bad, ctx, false, false).unwrap_err();
        let tree = Value::Object(vec![
            (
                Utf16::from("metaschemas"),
                Value::Object(vec![(Utf16::from("Draft202012Validator"), selected_bad)]),
            ),
            (
                Utf16::from("resources"),
                json(r#"[{"id":false,"schema":true}]"#),
            ),
        ]);
        let refused =
            SchemaBank::from_meta(Arc::new(tree), SchemaDialect::Draft2020_12, ctx).unwrap_err();
        assert_eq!((refused.code, refused.path), (original.code, original.path));
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn first_order_retrieval_alias_nested_id_and_anchor_preserve_paid_fallback() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx|{
 for swap in [false,true]{let mut input=small();if swap{std::mem::swap(&mut input.core_schema,&mut input.reference_schema);}let a=SchemaBank::admit_core(input,ctx)?;let compiled=CompiledSchema::compile_input_bank(Arc::clone(&a.bank),0,ctx)?;let bound=OwnerLocations::bind_admitted(&compiled,ctx)?.unwrap();compare_tables(&compiled,&bound,ctx);let sample=if swap{Value::string_utf8("ok")}else{Value::Number(3.0)};assert!(compiled.validate(&sample,ctx)?.is_empty());}
 let mut input=small();input.core_schema=json(r#"{"$id":"https://first.test/core","type":"integer","$defs":{"nested":{"$id":"child","$dynamicAnchor":"n","type":"boolean"}}}"#);let expected=input.core_schema.clone();let a=SchemaBank::admit_core(input,ctx)?;assert!(!a.bank.anchor_free_core_role(0,ctx)?);let compiled=CompiledSchema::compile_input_bank(Arc::clone(&a.bank),0,ctx)?;assert!(compiled.resource_bank.is_none());assert!(OwnerLocations::bind_admitted(&compiled,ctx)?.is_none());let raw=OwnerLocations::build_with_events(&compiled,ctx,|_|{})?.unwrap();compare_tables(&compiled,&raw,ctx);let original=CompiledSchema::compile(&expected,&a.bank.snapshot(ctx)?,ctx)?;for value in [Value::Number(3.0),Value::Bool(false)]{assert_eq!(compiled.validate(&value,ctx)?,original.validate(&value,ctx)?);}
 let mut input=small();input.reference_schema=json(r#"{"$id":"https://first.test/core","type":"string"}"#);let expected=input.core_schema.clone();let a=SchemaBank::admit_core(input,ctx)?;assert!(!a.bank.unique_retrievals(ctx)?);let snapshot=a.bank.snapshot(ctx)?;let old=CompiledSchema::compile(&expected,&snapshot,ctx).unwrap_err();let new=CompiledSchema::compile_input_bank(a.bank,0,ctx).unwrap_err();assert_eq!((new.code,new.path),(old.code,old.path));Ok::<(),EngineError>(())}).unwrap();
}

#[test]
fn first_changed_limits_mode_lifetime_and_owner_move_never_transfer_reuse() {
    let mut ctx = Context::catalog();
    let compiled = ctx
        .with_codegen_construction(|ctx| {
            let compiled = owner(ctx)?;
            let moved = Box::new(compiled);
            let moved = vec![moved];
            let compiled = &*moved[0];
            let bound = OwnerLocations::bind_admitted(compiled, ctx)?.unwrap();
            compare_tables(compiled, &bound, ctx);
            let text_limit = ctx.limits().max_text_units - 1;
            ctx.with_aggregate_text_limit(text_limit, |changed| {
                assert!(OwnerLocations::bind_admitted(compiled, changed)?.is_none());
                let raw = OwnerLocations::build_with_events(compiled, changed, |_| {})?.unwrap();
                compare_tables(compiled, &raw, changed);
                Ok::<(), EngineError>(())
            })?;
            ctx.with_codegen_construction(|foreign| {
                assert!(OwnerLocations::bind_admitted(compiled, foreign)?.is_none());
                let raw = OwnerLocations::build_with_events(compiled, foreign, |_| {})?.unwrap();
                compare_tables(compiled, &raw, foreign);
                Ok::<(), EngineError>(())
            })?;
            let generic = CompiledSchema::compile_consumer(
                &small().core_schema,
                &SchemaResources::default(),
                false,
                ctx,
            )?;
            assert!(OwnerLocations::bind_admitted(&generic, ctx)?.is_none());
            assert!(generic.validate(&Value::Number(1.0), ctx)?.is_empty());
            Ok::<CompiledSchema, EngineError>(*moved.into_iter().next().unwrap())
        })
        .unwrap();
    assert!(OwnerLocations::bind_admitted(&compiled, &mut ctx)
        .unwrap()
        .is_none());
    let raw = OwnerLocations::build_with_events(&compiled, &mut ctx, |_| {})
        .unwrap()
        .unwrap();
    compare_tables(&compiled, &raw, &mut ctx);
}

#[test]
fn first_real_subtree_bounds_and_scalar_overflow_decline_without_large_fixtures() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let a = SchemaBank::admit_core(small(), ctx)?;
        let view = a.bank.structure_role(BankRoot::Core(0), ctx)?.unwrap();
        let node = view.structure.node(view.root).unwrap();
        assert_eq!(node.parent, u32::MAX);
        assert!(view.structure.node(usize::MAX).is_none());
        assert!(Structure::child(&view, usize::MAX, ctx)?.is_none());
        assert!(a.bank.structure_catalogue(usize::MAX, ctx)?.is_none());
        assert!(a
            .bank
            .structure_role(BankRoot::Core(usize::MAX), ctx)?
            .is_none());
        Ok::<(), EngineError>(())
    })
    .unwrap();
    // Metadata-only protocol test; NOT an admitted Value/reader/bank capability.
    if let Some(depth) = (u32::MAX as usize).checked_add(1) {
        let mut b = Builder::default();
        let mut path = Utf16::default();
        let events = RefCell::new(Vec::new());
        b.enter_with_events(depth, &mut Context::catalog(), &mut path, &mut |e| {
            events.borrow_mut().push(e)
        })
        .unwrap();
        assert!(b
            .complete_with_events(&mut Context::catalog(), &mut |e| events
                .borrow_mut()
                .push(e))
            .unwrap()
            .is_none());
        assert!(events.borrow().is_empty());
    }
}

fn builder_protocol(
    ctx: &mut Context<'_>,
    event: &mut dyn FnMut(&'static str),
) -> Result<Option<Arc<Structure>>, EngineError> {
    // Existing actual Builder wrappers are tested only as metadata protocol. Their
    // output is NEVER supplied to a Value/CompletedOwnedJson/bank/compiled owner.
    let mut b = Builder::default();
    let mut path = Utf16::default();
    b.enter_with_events(0, ctx, &mut path, event)?;
    b.enter_with_events(1, ctx, &mut path, event)?;
    b.leave_with_events(ctx, &mut path, event)?;
    b.leave_with_events(ctx, &mut path, event)?;
    b.complete_with_events(ctx, event)
}

#[test]
fn first_builder_real_shared_charge_groups_refuse_before_events_and_publication() {
    let calls = Cell::new(0usize);
    let trace = RefCell::new(Vec::new());
    let mut observe = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    builder_protocol(
        &mut Context::catalog().with_host_control(&mut observe),
        &mut |e| trace.borrow_mut().push((e, calls.get())),
    )
    .unwrap()
    .unwrap();
    let trace = trace.into_inner();
    for site in [
        "node-growth",
        "stack-growth",
        "node-store",
        "subtree-complete",
        "structure-publication",
    ] {
        let at = trace.iter().find(|(e, _)| *e == site).unwrap().1;
        let count = Cell::new(0usize);
        let work = Cell::new(0u64);
        let expected = error();
        let pending = RefCell::new(Some(expected.clone()));
        let mut control = |n| {
            count.set(count.get() + 1);
            work.set(work.get() + n as u64);
            if count.get() == at {
                Err(pending.borrow_mut().take().unwrap())
            } else {
                assert!(count.get() < at);
                Ok(())
            }
        };
        let events = RefCell::new(Vec::new());
        let mut ctx = Context::catalog().with_host_control(&mut control);
        let failure = builder_protocol(&mut ctx, &mut |e| {
            events.borrow_mut().push((e, count.get()))
        })
        .unwrap_err();
        host(&failure, &expected);
        assert_eq!(count.get(), at);
        assert_eq!(ctx.charged_work(), work.get());
        let prefix: Vec<_> = trace.iter().copied().filter(|(_, n)| *n < at).collect();
        assert_eq!(*events.borrow(), prefix);
    }
}

#[test]
fn first_bind_actual_view_shared_reserve_mapping_and_publication_denials_are_terminal() {
    let active = Cell::new(false);
    let calls = Cell::new(0usize);
    let trace = RefCell::new(Vec::new());
    let mut observe = |_| {
        if active.get() {
            calls.set(calls.get() + 1);
        }
        Ok(())
    };
    let mut ctx = Context::catalog().with_host_control(&mut observe);
    ctx.with_codegen_construction(|ctx| {
        let owner = owner(ctx)?;
        active.set(true);
        let bound = OwnerLocations::bind_admitted_with_events(&owner, ctx, &mut |e| {
            trace.borrow_mut().push((e, calls.get()))
        })?
        .unwrap();
        active.set(false);
        compare_tables(&owner, &bound, ctx);
        Ok::<(), EngineError>(())
    })
    .unwrap();
    let trace = trace.into_inner();
    for site in [
        "binding-role-reserve",
        "binding-role-map",
        "binding-role-store",
        "binding-publication",
    ] {
        let at = trace.iter().find(|(e, _)| *e == site).unwrap().1;
        let active = Cell::new(false);
        let count = Cell::new(0usize);
        let work = Cell::new(0u64);
        let expected = error();
        let pending = RefCell::new(Some(expected.clone()));
        let mut control = |n| {
            if !active.get() {
                return Ok(());
            }
            count.set(count.get() + 1);
            work.set(work.get() + n as u64);
            if count.get() == at {
                Err(pending.borrow_mut().take().unwrap())
            } else {
                assert!(count.get() < at, "postdenial control");
                Ok(())
            }
        };
        let mut ctx = Context::catalog().with_host_control(&mut control);
        ctx.with_codegen_construction(|ctx| {
            let owner = owner(ctx)?;
            let installed = Arc::clone(owner.owner_locations.as_ref().unwrap());
            let before = ctx.charged_work();
            let events = RefCell::new(Vec::new());
            active.set(true);
            let mut escaped = None;
            let failure = (|| {
                escaped = OwnerLocations::bind_admitted_with_events(&owner, ctx, &mut |e| {
                    events.borrow_mut().push((e, count.get()))
                })?;
                Ok::<(), EngineError>(())
            })()
            .unwrap_err();
            host(&failure, &expected);
            assert!(escaped.is_none());
            assert_eq!(count.get(), at);
            assert_eq!(ctx.charged_work(), before + work.get());
            let prefix: Vec<_> = trace.iter().copied().filter(|(_, n)| *n < at).collect();
            assert_eq!(*events.borrow(), prefix);
            assert!(Arc::ptr_eq(
                owner.owner_locations.as_ref().unwrap(),
                &installed
            ));
            Ok::<(), EngineError>(())
        })
        .unwrap();
    }
    // binding-role-reserve is ONE shared storage debit for roles/roots/facts, not one per vector.
    assert_eq!(
        trace
            .iter()
            .filter(|(e, _)| *e == "binding-role-reserve")
            .count(),
        1
    );
}

#[test]
fn first_binding_reentry_and_unwind_keep_outer_custody_without_partial_tables() {
    let active = Cell::new(false);
    let entered = Cell::new(false);
    let expected = error();
    let pending = RefCell::new(Some(expected.clone()));
    let mut control = |_| {
        if !active.get() {
            return Ok(());
        }
        assert!(!entered.replace(true), "postdenial callback");
        let mut nested = Context::catalog();
        nested
            .with_codegen_construction(|ctx| {
                let inner = owner(ctx)?;
                let bound = OwnerLocations::bind_admitted(&inner, ctx)?.unwrap();
                compare_tables(&inner, &bound, ctx);
                Ok::<(), EngineError>(())
            })
            .unwrap();
        Err(pending.borrow_mut().take().unwrap())
    };
    let site = Cell::new("caller-site");
    let mut ctx = Context::catalog()
        .with_host_control(&mut control)
        .with_constructor_root_observer(&site);
    ctx.with_codegen_construction(|ctx| {
        let owner = owner(ctx)?;
        let installed = Arc::clone(owner.owner_locations.as_ref().unwrap());
        let prior = Rc::clone(ctx.schema_construction.as_ref().unwrap());
        let unwind = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            OwnerLocations::bind_admitted_with_events(&owner, ctx, &mut |e| {
                if e == "binding-role-store" {
                    panic!("test unwind after real admission");
                }
            })
        }));
        assert!(unwind.is_err());
        assert_eq!(site.get(), "caller-site");
        assert!(Rc::ptr_eq(
            ctx.schema_construction.as_ref().unwrap(),
            &prior
        ));
        assert!(Arc::ptr_eq(
            owner.owner_locations.as_ref().unwrap(),
            &installed
        ));
        active.set(true);
        let events = RefCell::new(Vec::new());
        let failure = OwnerLocations::bind_admitted_with_events(&owner, ctx, &mut |e| {
            events.borrow_mut().push(e)
        })
        .unwrap_err();
        host(&failure, &expected);
        assert_eq!(site.get(), "caller-site");
        assert!(entered.get());
        assert!(events.borrow().is_empty());
        assert!(Arc::ptr_eq(
            owner.owner_locations.as_ref().unwrap(),
            &installed
        ));
        assert!(Rc::ptr_eq(
            ctx.schema_construction.as_ref().unwrap(),
            &prior
        ));
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

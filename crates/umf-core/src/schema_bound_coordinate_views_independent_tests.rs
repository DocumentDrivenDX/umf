// SPDX-License-Identifier: MIT OR Apache-2.0
//! SOURCE ONLY / NATIVE UNEXECUTED. H owns include and production.
//! Real admitted structures; logical counts are never empty-backing lengths.
use super::*;
use crate::engine::ResourceSet;
use admitted_structure::Builder;
use std::cell::{Cell, RefCell};
use std::rc::Rc;

fn json(s: &str) -> Value {
    crate::serialization::read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn field<'a>(v: &'a Value, k: &str) -> &'a Value {
    get(v, k).unwrap()
}
fn input() -> ResourceSet {
    ResourceSet::new(
        json(
            r#"{"$id":"https://views.test/core","type":"object","default":{"a/~😀":[null,{"x":true}],"":false}}"#,
        ),
        json(r#"{"$id":"https://views.test/reference","type":"string","default":[]}"#),
        json(r#"{"$id":"https://views.test/package","type":"boolean","default":{"kept":null}}"#),
        json(r#"{"opaque-constraints":true}"#),
        json(r#"{"opaque-policy":null}"#),
    )
}
fn admitted(input: ResourceSet, ctx: &mut Context<'_>) -> Result<CompiledSchema, EngineError> {
    let a = admitted_bank::SchemaBank::admit_core(input, ctx)?;
    CompiledSchema::compile_input_bank(a.bank, 0, ctx)
}
fn kids(v: &Value) -> Vec<&Value> {
    match v {
        Value::Object(v) => v.iter().map(|(_, v)| v).collect(),
        Value::Array(v) => v.iter().collect(),
        _ => vec![],
    }
}
fn shape(v: &Value) -> (usize, usize) {
    let children = kids(v);
    let mut n = 1;
    let mut depth = 0;
    for c in children {
        let (a, b) = shape(c);
        n += a;
        depth = depth.max(b + 1);
    }
    (n, depth)
}
fn views(table: &OwnerLocations) -> &Vec<BoundRole> {
    assert!(table.materialized_node_count().is_none());
    assert!(table.materialized_descriptor(0).is_none());
    assert!(table.materialized_edge(0).is_none());
    match &table.storage {
        CoordinateStorage::Views { roles, .. } => roles,
        _ => panic!("actual view backend required"),
    }
}
fn walk(
    table: &OwnerLocations,
    owner: &CompiledSchema,
    cursor: &OwnerCursor,
    value: &Value,
    role: usize,
    parent: Option<usize>,
    edge: usize,
    depth: usize,
    ctx: &mut Context<'_>,
) -> usize {
    let c = table.coordinate(cursor.node, ctx).unwrap().unwrap();
    assert_eq!(
        (c.root, c.parent, c.edge, c.count, c.depth),
        (role, parent, edge, kids(value).len(), depth)
    );
    let actual = table.read(owner, cursor, ctx).unwrap().unwrap();
    assert_eq!(actual, value);
    assert!(std::ptr::eq(actual, value));
    let mut n = 1;
    for (i, v) in kids(value).iter().enumerate() {
        let child = table.child(owner, cursor, i, ctx).unwrap().unwrap();
        n += walk(
            table,
            owner,
            &child,
            v,
            role,
            Some(cursor.node),
            i,
            depth + 1,
            ctx,
        );
    }
    assert!(table
        .child(owner, cursor, kids(value).len(), ctx)
        .unwrap()
        .is_none());
    n
}
fn compare_original(table: &OwnerLocations, owner: &CompiledSchema, ctx: &mut Context<'_>) {
    let roles = views(table);
    let original = OwnerLocations::build_with_events(owner, ctx, |_| {})
        .unwrap()
        .unwrap();
    assert!(matches!(
        &original.storage,
        CoordinateStorage::Materialized { .. }
    ));
    let mut total = 0;
    for role in 0..=owner.catalogue_entries().len() {
        let expected = if role == 0 {
            &*owner.schema
        } else {
            owner.catalogue_entries().get(role - 1).unwrap().1
        };
        let (n, depth) = shape(expected);
        let bound = &roles[role];
        assert_eq!(bound.base, total);
        assert_eq!(bound.end, total + n);
        assert_eq!(bound.max_relative_depth, depth);
        let top = bound.view.structure.node(bound.view.root).unwrap();
        assert_eq!(bound.base_depth, top.depth);
        assert_eq!(bound.physical_end, top.end as usize);
        assert_eq!(bound.physical_end - bound.view.root, n);
        assert_eq!((top.max_depth - top.depth) as usize, depth);
        assert!(bound.physical_end <= bound.view.structure.extent());
        let a = table.root(owner, role, ctx).unwrap().unwrap();
        let b = original.root(owner, role, ctx).unwrap().unwrap();
        assert_eq!(walk(table, owner, &a, expected, role, None, 0, 0, ctx), n);
        assert_eq!(
            walk(&original, owner, &b, expected, role, None, 0, 0, ctx),
            n
        );
        assert_eq!(
            (
                table.facts[role].nodes,
                table.facts[role].nested_ids,
                table.facts[role].nested_anchors
            ),
            (
                original.facts[role].nodes,
                original.facts[role].nested_ids,
                original.facts[role].nested_anchors
            )
        );
        total += n;
    }
    assert_eq!(table.logical_node_count(), total);
    assert_eq!(original.logical_node_count(), total);
    assert_eq!(original.materialized_node_count(), Some(total));
}
fn failure() -> EngineError {
    let mut e = EngineError::new(
        "VIEW_FIRST_DENIAL",
        Utf16::new(vec![47, 0xd800]),
        "original view host error",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("view-origin-δ"));
    e
}
fn host(a: &EngineError, b: &EngineError) {
    assert_eq!(a.code, b.code);
    assert_eq!(a.path, b.path);
    assert_eq!(a.message, b.message);
    assert_eq!(a.python_message_origin, b.python_message_origin);
    assert!(a.is_control_failure());
}
fn replace_default(v: &mut Value, value: Value) {
    let Value::Object(m) = v else {
        panic!("schema object")
    };
    m.iter_mut()
        .find(|(k, _)| k == &Utf16::from("default"))
        .unwrap()
        .1 = value;
}

#[test]
fn view_literal_locations_and_same_physical_alias_have_distinct_logical_ordinals() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let owner = admitted(input(), ctx)?;
        let table = OwnerLocations::bind_admitted(&owner, ctx)?.unwrap();
        compare_original(&table, &owner, ctx);
        assert_eq!(table.logical_node_count(), 27);
        let r = views(&table);
        assert_eq!(
            r.iter().map(|r| r.base).collect::<Vec<_>>(),
            vec![0, 9, 18, 22]
        );
        assert!(Arc::ptr_eq(&r[0].view.structure, &r[1].view.structure));
        assert_eq!(r[0].view.root, r[1].view.root);
        let root = table.root(&owner, 0, ctx)?.unwrap();
        let alias = table.root(&owner, 1, ctx)?.unwrap();
        assert!(!root.same_location(&alias));
        assert_eq!((root.node, alias.node), (0, 9));
        let d = table.child(&owner, &root, 2, ctx)?.unwrap();
        assert_eq!(d.node, 3);
        let array = table.child(&owner, &d, 0, ctx)?.unwrap();
        assert_eq!(array.node, 4);
        let object = table.child(&owner, &array, 1, ctx)?.unwrap();
        let leaf = table.child(&owner, &object, 0, ctx)?.unwrap();
        assert_eq!(leaf.node, 7);
        assert_eq!(table.read(&owner, &leaf, ctx)?, Some(&Value::Bool(true)));
        let alias_d = table.child(&owner, &alias, 2, ctx)?.unwrap();
        let c = table.coordinate(alias_d.node, ctx)?.unwrap();
        assert_eq!((c.root, c.parent, c.depth), (1, Some(alias.node), 1));
        assert_eq!(
            table.read(&owner, &d, ctx)?,
            table.read(&owner, &alias_d, ctx)?
        );
        let reference = Value::string_utf8("#/default/a~1~0%F0%9F%98%80/1/x");
        let path = Utf16::from("https://views.test/core#");
        let raw = owner.resolve_ref_unplanned(&reference, &path, None, ctx)?;
        assert_eq!(raw.0, &Value::Bool(true));
        assert_eq!(
            raw.1,
            Utf16::from("https://views.test/core#/default/a~1~0😀/1/x")
        );
        let located = owner.resolve_ref_unplanned_located(&reference, &path, None, ctx)?;
        assert_eq!((located.0, &located.1), (raw.0, &raw.1));
        let located = located.2.unwrap();
        assert_eq!(table.read(&owner, &located, ctx)?, Some(raw.0));
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn view_all_twenty_meta_roles_use_genuine_summaries_and_relative_depth() {
    let pinned = json(include_str!("schema_metas.json"));
    let Value::Array(rows) = field(&pinned, "resources") else {
        panic!("resources")
    };
    assert_eq!(rows.len(), 20);
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let _owner = admitted(input(), ctx)?;
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
        assert_eq!(
            &*meta.schema,
            field(field(&pinned, "metaschemas"), "Draft202012Validator")
        );
        let table = OwnerLocations::bind_admitted(&meta, ctx)?.unwrap();
        compare_original(&table, &meta, ctx);
        assert_eq!(views(&table).len(), 21);
        assert!(views(&table)[0].base_depth > 0);
        let root = table.root(&meta, 0, ctx)?.unwrap();
        assert_eq!(table.coordinate(root.node, ctx)?.unwrap().depth, 0);
        let mut aliases = 0;
        for (i, row) in rows.iter().enumerate() {
            let (id, value) = meta.catalogue_entries().get(i).unwrap();
            assert_eq!(&Value::String(id.clone()), field(row, "id"));
            assert_eq!(value, field(row, "schema"));
            if value == &*meta.schema {
                let alias = table.root(&meta, i + 1, ctx)?.unwrap();
                assert!(!root.same_location(&alias));
                aliases += 1;
            }
        }
        assert!(aliases > 0);
        let Value::Object(m) = &*meta.schema else {
            panic!("meta root")
        };
        let edge = m
            .iter()
            .position(|(k, _)| k == &Utf16::from("$id"))
            .unwrap();
        let id = table.child(&meta, &root, edge, ctx)?.unwrap();
        assert_eq!(table.coordinate(id.node, ctx)?.unwrap().depth, 1);
        assert_eq!(
            table.read(&meta, &id, ctx)?,
            Some(&Value::string_utf8(
                "https://json-schema.org/draft/2020-12/schema"
            ))
        );
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn view_repeated_roles_count_toward_aggregate_limits_even_when_physical_data_fits() {
    let mut limits = Context::catalog().limits();
    limits.max_values = 4096;
    let mut ctx =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    ctx.with_codegen_construction(|ctx| {
        let mut data = input();
        replace_default(&mut data.core_schema, Value::Array(vec![Value::Null; 1500]));
        replace_default(
            &mut data.reference_schema,
            Value::Array(vec![Value::Null; 1500]),
        );
        let a = admitted_bank::SchemaBank::admit_core(data, ctx)?;
        assert!(a.bank.input_compatible(ctx)?);
        let mut physical = 0;
        let mut selected = 0;
        for role in 0..3 {
            let view = a
                .bank
                .structure_role(admitted_bank::BankRoot::Core(role), ctx)?
                .unwrap();
            let top = view.structure.node(view.root).unwrap();
            let count = top.end as usize - view.root;
            physical += count;
            if role == 0 {
                selected = count;
            }
        }
        assert!(physical <= ctx.limits().max_values);
        assert!(physical + selected > ctx.limits().max_values);
        let owner = CompiledSchema::compile_input_bank(a.bank, 0, ctx)?;
        assert!(OwnerLocations::bind_admitted(&owner, ctx)?.is_none());
        assert!(OwnerLocations::build_with_events(&owner, ctx, |_| {})?.is_none());
        assert!(owner.validate(&json("{}"), ctx)?.is_empty());
        assert!(!owner.validate(&Value::Bool(false), ctx)?.is_empty());
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn view_moves_and_equal_content_foreign_owners_preserve_identity_without_address_authority() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let owner = admitted(input(), ctx)?;
        let table = OwnerLocations::bind_admitted(&owner, ctx)?.unwrap();
        let root = table.root(&owner, 0, ctx)?.unwrap();
        let moved = Box::new(owner);
        let moved = vec![moved];
        let owner = &*moved[0];
        assert_eq!(table.read(owner, &root, ctx)?, Some(&*owner.schema));
        let foreign = admitted(input(), ctx)?;
        let other = OwnerLocations::bind_admitted(&foreign, ctx)?.unwrap();
        let cursor = other.root(&foreign, 0, ctx)?.unwrap();
        assert!(!root.same_location(&cursor));
        assert_eq!(&*owner.schema, &*foreign.schema);
        assert!(table.root(&foreign, 0, ctx)?.is_none());
        assert!(table.read(owner, &cursor, ctx)?.is_none());
        assert!(table.read(&foreign, &root, ctx)?.is_none());
        assert!(table.child(owner, &cursor, 0, ctx)?.is_none());
        assert!(!Arc::ptr_eq(
            &views(&table)[0].view.structure,
            &views(&other)[0].view.structure
        ));
        compare_original(&table, owner, ctx);
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn view_changed_context_limits_profile_and_expired_binding_use_original_fallback() {
    let mut ctx = Context::catalog();
    let owner = ctx
        .with_codegen_construction(|ctx| {
            let owner = admitted(input(), ctx)?;
            let table = OwnerLocations::bind_admitted(&owner, ctx)?.unwrap();
            let root = table.root(&owner, 0, ctx)?.unwrap();
            let first = table.child(&owner, &root, 2, ctx)?.unwrap();
            let deep = table.child(&owner, &first, 0, ctx)?.unwrap();
            let mut limits = ctx.limits();
            limits.max_depth = 1;
            let mut bounded =
                Context::with_limits(crate::context::ResourceProfile::Cooperative, limits)?;
            assert!(table.read(&owner, &deep, &mut bounded)?.is_none());
            assert!(table.child(&owner, &first, 0, &mut bounded)?.is_none());
            let mut limits = ctx.limits();
            limits.max_values = 1;
            let mut bounded =
                Context::with_limits(crate::context::ResourceProfile::Cooperative, limits)?;
            assert!(table.read(&owner, &deep, &mut bounded)?.is_none());
            ctx.with_aggregate_text_limit(ctx.limits().max_text_units - 1, |changed| {
                assert!(OwnerLocations::bind_admitted(&owner, changed)?.is_none());
                let original = OwnerLocations::build_with_events(&owner, changed, |_| {})?.unwrap();
                assert!(original.materialized_node_count().is_some());
                assert!(owner.validate(&json("{}"), changed)?.is_empty());
                Ok::<(), EngineError>(())
            })?;
            ctx.with_codegen_construction(|foreign| {
                assert!(OwnerLocations::bind_admitted(&owner, foreign)?.is_none());
                let raw = OwnerLocations::build_with_events(&owner, foreign, |_| {})?.unwrap();
                assert_eq!(
                    raw.read(&owner, &raw.root(&owner, 0, foreign)?.unwrap(), foreign)?,
                    Some(&*owner.schema)
                );
                Ok::<(), EngineError>(())
            })?;
            let generic = CompiledSchema::compile_consumer(
                &input().core_schema,
                &SchemaResources::default(),
                false,
                ctx,
            )?;
            assert!(OwnerLocations::bind_admitted(&generic, ctx)?.is_none());
            assert!(generic.validate(&json("{}"), ctx)?.is_empty());
            let source = crate::python_value::python_from_core_value(&input().core_schema, ctx)?;
            let python = CompiledSchema::compile_python_source(
                &source,
                &crate::python_value::PythonSchemaResources::default(),
                false,
                PythonReVersion::V3_11,
                ctx,
            )?;
            assert!(OwnerLocations::bind_admitted(&python.compiled, ctx)?.is_none());
            assert!(!python.compiled.python_text_origins.is_empty());
            Ok::<CompiledSchema, EngineError>(owner)
        })
        .unwrap();
    assert!(OwnerLocations::bind_admitted(&owner, &mut ctx)
        .unwrap()
        .is_none());
    let fallback = OwnerLocations::build(&owner, &mut ctx).unwrap().unwrap();
    assert!(fallback.materialized_node_count().is_some());
    assert_eq!(fallback.logical_node_count(), 27);
}

#[test]
fn view_relative_retargeting_and_nested_anchor_fallback_keep_original_resolver_policy() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx|{let mut data=input();data.reference_schema=json(r#"{"$id":"https://views.test/a/child","type":"integer"}"#);data.package_schema=json(r#"{"$id":"https://views.test/b/child","type":"boolean"}"#);let owner=admitted(data,ctx)?;let table=OwnerLocations::bind_admitted(&owner,ctx)?.unwrap();let reference=Value::string_utf8("child");let path=Utf16::from("https://views.test/core#");for(scope,role,kind)in[("https://views.test/a/base",1,"integer"),("https://views.test/b/base",2,"boolean")]{let target=owner.catalogue_entries().get(role).unwrap().1;assert_eq!(field(target,"type"),&Value::string_utf8(kind));let expected=owner.resolve_ref_unplanned(&reference,&path,Some(scope),ctx)?;assert!(std::ptr::eq(expected.0,target));let located=owner.resolve_ref_unplanned_located(&reference,&path,Some(scope),ctx)?;assert_eq!((located.0,&located.1),(expected.0,&expected.1));let cursor=located.2.unwrap();assert_eq!(table.coordinate(cursor.node,ctx)?.unwrap().root,role+1);assert!(std::ptr::eq(table.read(&owner,&cursor,ctx)?.unwrap(),target));}
 let mut data=input();data.core_schema=json(r#"{"$id":"https://views.test/core","type":"object","properties":{"x":{"$dynamicRef":"child#node"}},"$defs":{"child":{"$id":"child","$dynamicAnchor":"node","type":"integer"}}}"#);let source=data.core_schema.clone();let a=admitted_bank::SchemaBank::admit_core(data,ctx)?;assert!(!a.bank.anchor_free_core_role(0,ctx)?);let owner=CompiledSchema::compile_input_bank(Arc::clone(&a.bank),0,ctx)?;assert!(OwnerLocations::bind_admitted(&owner,ctx)?.is_none());let original=OwnerLocations::build_with_events(&owner,ctx,|_|{})?.unwrap();assert!(original.materialized_node_count().is_some());let old=CompiledSchema::compile(&source,&a.bank.snapshot(ctx)?,ctx)?;for (value,valid) in [(json(r#"{"x":3}"#),true),(json(r#"{"x":"bad"}"#),false)]{let actual=owner.validate(&value,ctx)?;assert_eq!(actual,old.validate(&value,ctx)?);assert_eq!(actual.is_empty(),valid);}Ok::<(),EngineError>(())}).unwrap();
}

#[test]
fn view_child_skip_cost_does_not_scan_a_preceding_sibling_subtree() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let mut targets = Vec::new();
        for prior in [Value::Null, Value::Array(vec![Value::Null; 128])] {
            let mut data = input();
            replace_default(
                &mut data.core_schema,
                Value::Array(vec![prior, json(r#"{"marker":true}"#)]),
            );
            let owner = admitted(data, ctx)?;
            let table = OwnerLocations::bind_admitted(&owner, ctx)?.unwrap();
            let root = table.root(&owner, 0, ctx)?.unwrap();
            let array = table.child(&owner, &root, 2, ctx)?.unwrap();
            targets.push((owner, table, array));
        }
        let mut traces = Vec::new();
        for (owner, table, array) in &targets {
            let trace = RefCell::new(Vec::new());
            let mut meter = |n| {
                trace.borrow_mut().push(n);
                Ok(())
            };
            let child = table
                .child(
                    owner,
                    array,
                    1,
                    &mut Context::catalog().with_host_control(&mut meter),
                )?
                .unwrap();
            assert_eq!(
                table.read(owner, &child, ctx)?,
                Some(&json(r#"{"marker":true}"#))
            );
            traces.push(trace.into_inner());
        }
        assert!(!traces[0].is_empty());
        assert_eq!(
            traces[0], traces[1],
            "same ordinal lookup must skip extent, not walk prior subtree"
        );
        let (owner, table, array) = &targets[0];
        assert!(table.coordinate(usize::MAX, ctx)?.is_none());
        assert!(table.coordinate(table.logical_node_count(), ctx)?.is_none());
        assert!(table.child(owner, array, usize::MAX, ctx)?.is_none());
        assert!(table.root(owner, usize::MAX, ctx)?.is_none());
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn view_role_header_mapping_and_publication_denials_match_actual_callback_groups() {
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
        let owner = admitted(input(), ctx)?;
        active.set(true);
        let table = OwnerLocations::bind_admitted_with_events(&owner, ctx, &mut |e| {
            trace.borrow_mut().push((e, calls.get()))
        })?
        .unwrap();
        active.set(false);
        compare_original(&table, &owner, ctx);
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
        for at in trace.iter().filter(|(e, _)| *e == site).map(|(_, n)| *n) {
            let active = Cell::new(false);
            let count = Cell::new(0usize);
            let work = Cell::new(0u64);
            let expected = failure();
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
                    assert!(count.get() < at);
                    Ok(())
                }
            };
            let mut ctx = Context::catalog().with_host_control(&mut control);
            ctx.with_codegen_construction(|ctx| {
                let owner = admitted(input(), ctx)?;
                let installed = Arc::clone(owner.owner_locations.as_ref().unwrap());
                let before = ctx.charged_work();
                let events = RefCell::new(Vec::new());
                active.set(true);
                let mut escaped = None;
                let e = (|| {
                    escaped = OwnerLocations::bind_admitted_with_events(&owner, ctx, &mut |e| {
                        events.borrow_mut().push((e, count.get()))
                    })?;
                    Ok::<(), EngineError>(())
                })()
                .unwrap_err();
                host(&e, &expected);
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
    }
    assert_eq!(
        trace
            .iter()
            .filter(|(e, _)| *e == "binding-role-reserve")
            .count(),
        1
    );
    assert!(!trace
        .iter()
        .any(|(e, _)| matches!(*e, "binding-node-store" | "binding-edge-store")));
}

fn summary_walk(
    b: &mut Builder,
    ctx: &mut Context<'_>,
    event: &mut dyn FnMut(&'static str),
) -> Result<(), EngineError> {
    let mut path = Utf16::default();
    b.enter_with_events(0, ctx, &mut path, event)?;
    b.enter_with_events(1, ctx, &mut path, event)?;
    b.enter_with_events(2, ctx, &mut path, event)?;
    b.leave_with_events(ctx, &mut path, event)?;
    b.leave_with_events(ctx, &mut path, event)?;
    b.leave_with_events(ctx, &mut path, event)
}
fn summary_protocol(
    ctx: &mut Context<'_>,
    event: &mut dyn FnMut(&'static str),
) -> Result<Option<Arc<admitted_structure::Structure>>, EngineError> {
    let mut b = Builder::default();
    summary_walk(&mut b, ctx, event)?;
    b.complete_with_events(ctx, event)
}

#[test]
fn view_actual_summary_merge_refusal_and_binding_unwind_restore_outer_custody() {
    // Metadata protocol only; this result is NEVER used as Value/bank proof.
    let calls = Cell::new(0usize);
    let trace = RefCell::new(Vec::new());
    let mut observe = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    summary_protocol(
        &mut Context::catalog().with_host_control(&mut observe),
        &mut |e| trace.borrow_mut().push((e, calls.get())),
    )
    .unwrap()
    .unwrap();
    let trace = trace.into_inner();
    let at = trace.iter().find(|(e, _)| *e == "summary-merge").unwrap().1;
    let count = Cell::new(0usize);
    let expected = failure();
    let pending = RefCell::new(Some(expected.clone()));
    let mut deny = |_| {
        count.set(count.get() + 1);
        if count.get() == at {
            Err(pending.borrow_mut().take().unwrap())
        } else {
            assert!(count.get() < at);
            Ok(())
        }
    };
    let events = RefCell::new(Vec::new());
    let mut failed_builder = Builder::default();
    let mut denied_ctx = Context::catalog().with_host_control(&mut deny);
    let e = summary_walk(&mut failed_builder, &mut denied_ctx, &mut |e| {
        events.borrow_mut().push((e, count.get()))
    })
    .unwrap_err();
    host(&e, &expected);
    assert_eq!(count.get(), at);
    // The frozen poison contract permits only an inert failed completion:
    // it must not publish or invoke any additional control/event.
    assert!(failed_builder
        .complete_with_events(&mut denied_ctx, &mut |e| events
            .borrow_mut()
            .push((e, count.get())))
        .unwrap()
        .is_none());
    assert_eq!(count.get(), at);
    assert_eq!(
        *events.borrow(),
        trace
            .iter()
            .copied()
            .filter(|(_, n)| *n < at)
            .collect::<Vec<_>>()
    );
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let owner = admitted(input(), ctx)?;
        let installed = Arc::clone(owner.owner_locations.as_ref().unwrap());
        let prior = Rc::clone(ctx.schema_construction.as_ref().unwrap());
        let unwind = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            OwnerLocations::bind_admitted_with_events(&owner, ctx, &mut |e| {
                if e == "binding-role-store" {
                    panic!("source control unwind")
                }
            })
        }));
        assert!(unwind.is_err());
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

#[test]
fn view_scalar_translation_denies_each_actual_charge_and_reentry_keeps_first_error() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let owner = admitted(input(), ctx)?;
        let table = OwnerLocations::bind_admitted(&owner, ctx)?.unwrap();
        let root = table.root(&owner, 3, ctx)?.unwrap();
        let scalar = table.child(&owner, &root, 0, ctx)?.unwrap();
        let trace = RefCell::new(Vec::new());
        let events = RefCell::new(Vec::new());
        let mut observe = |n| {
            trace.borrow_mut().push(n);
            Ok(())
        };
        let coordinate = table
            .coordinate_with_events(
                scalar.node,
                &mut Context::catalog().with_host_control(&mut observe),
                &mut |event| events.borrow_mut().push((event, trace.borrow().len())),
            )?
            .unwrap();
        assert_eq!(
            (coordinate.root, coordinate.parent, coordinate.depth),
            (3, Some(root.node), 1)
        );
        let trace = trace.into_inner();
        assert!(!trace.is_empty());
        let event_trace = events.into_inner();
        assert_eq!(
            event_trace.iter().map(|(e, _)| *e).collect::<Vec<_>>(),
            vec!["coordinate-record-read", "coordinate-scalar-return"]
        );
        assert_eq!(
            event_trace[0].1, event_trace[1].1,
            "read and scalar return share one admission"
        );
        for at in 1..=trace.len() {
            let count = Cell::new(0usize);
            let expected = failure();
            let pending = RefCell::new(Some(expected.clone()));
            let mut control = |_| {
                count.set(count.get() + 1);
                if count.get() == at {
                    Err(pending.borrow_mut().take().unwrap())
                } else {
                    assert!(count.get() < at);
                    Ok(())
                }
            };
            let mut escaped = None;
            let observed_events = RefCell::new(Vec::new());
            let e = (|| {
                escaped = table.coordinate_with_events(
                    scalar.node,
                    &mut Context::catalog().with_host_control(&mut control),
                    &mut |event| observed_events.borrow_mut().push((event, count.get())),
                )?;
                Ok::<(), EngineError>(())
            })()
            .unwrap_err();
            host(&e, &expected);
            assert!(escaped.is_none());
            assert_eq!(count.get(), at);
            let prefix: Vec<_> = event_trace
                .iter()
                .copied()
                .filter(|(_, n)| *n < at)
                .collect();
            assert_eq!(*observed_events.borrow(), prefix);
        }
        let original = OwnerLocations::build_with_events(&owner, ctx, |_| {})?.unwrap();
        let original_root = original.root(&owner, 3, ctx)?.unwrap();
        let original_scalar = original.child(&owner, &original_root, 0, ctx)?.unwrap();
        let original_events = RefCell::new(Vec::new());
        assert!(original
            .coordinate_with_events(original_scalar.node, ctx, &mut |event| original_events
                .borrow_mut()
                .push(event))?
            .is_some());
        assert!(original_events.borrow().is_empty());
        let entered = Cell::new(false);
        let expected = failure();
        let pending = RefCell::new(Some(expected.clone()));
        let mut reenter = |_| {
            assert!(!entered.replace(true));
            let mut inner = Context::catalog();
            inner
                .with_codegen_construction(|inner| {
                    let foreign = admitted(input(), inner)?;
                    let bound = OwnerLocations::bind_admitted(&foreign, inner)?.unwrap();
                    compare_original(&bound, &foreign, inner);
                    Ok::<(), EngineError>(())
                })
                .unwrap();
            Err(pending.borrow_mut().take().unwrap())
        };
        let reentry_events = RefCell::new(Vec::new());
        let e = table
            .coordinate_with_events(
                scalar.node,
                &mut Context::catalog().with_host_control(&mut reenter),
                &mut |event| reentry_events.borrow_mut().push(event),
            )
            .unwrap_err();
        assert!(reentry_events.borrow().is_empty());
        host(&e, &expected);
        assert!(entered.get());
        assert_eq!(table.coordinate(scalar.node, ctx)?.unwrap().root, 3);
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

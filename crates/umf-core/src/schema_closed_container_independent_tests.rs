// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private child of schema::admitted_structure::closed; H owns include.
//! SOURCE ONLY / NATIVE UNEXECUTED. Closed metadata is obtained ONLY from
//! real validator/parser completion. Generic collectors below are oracles only.
use super::*;
use crate::context::{Limits, ResourceProfile};
use crate::engine::{OwnedResourceSet, ResourceSet};
use crate::schema::{
    admitted_bank::{BankRoot, SchemaBank},
    CompiledSchema, OwnerCursor, OwnerLocations, SchemaDialect,
};
use crate::value::{OwnedCoreJson, OwnedCoreOperation};
use std::cell::{Cell, RefCell};
use std::panic::{catch_unwind, AssertUnwindSafe};

fn json(text: &str) -> Value {
    crate::serialization::read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn fixture() -> Value {
    json(r#"{"$id":"root","a":[null,{"$dynamicAnchor":"A"}],"id":"legacy"}"#)
}
fn walk_fused(
    value: &Value,
    state: &mut Traversal,
    ctx: &mut Context<'_>,
    event: &mut dyn FnMut(&'static str),
) -> Result<(), EngineError> {
    let mut path = Utf16::from("/metadata-protocol");
    state.enter_with_events(ctx, &mut path, event)?;
    match value {
        Value::Object(members) => {
            for (ordinal, (key, child)) in members.iter().enumerate() {
                state.member_with_events(
                    ordinal,
                    key,
                    matches!(child, Value::String(_)),
                    ctx,
                    &mut path,
                    event,
                )?;
                walk_fused(child, state, ctx, event)?;
            }
        }
        Value::Array(items) => {
            for child in items {
                walk_fused(child, state, ctx, event)?;
            }
        }
        _ => {}
    }
    state.leave_with_events(ctx, &mut path, event)
}
fn walk_original(value: &Value, depth: usize, builder: &mut Builder, ctx: &mut Context<'_>) {
    let mut path = Utf16::default();
    builder.enter(depth, ctx, &mut path).unwrap();
    match value {
        Value::Object(members) => {
            for (key, child) in members {
                builder
                    .member(key, matches!(child, Value::String(_)), ctx, &mut path)
                    .unwrap();
                walk_original(child, depth + 1, builder, ctx);
            }
        }
        Value::Array(items) => {
            for child in items {
                walk_original(child, depth + 1, builder, ctx);
            }
        }
        _ => {}
    }
    builder.leave(ctx, &mut path).unwrap();
}
fn original(value: &Value) -> Arc<Structure> {
    let mut builder = Builder::default();
    let mut ctx = Context::catalog();
    walk_original(value, 0, &mut builder, &mut ctx);
    builder.complete(&mut ctx).unwrap().unwrap()
}
fn fused(value: &Value) -> Arc<Structure> {
    let mut state = Traversal::default();
    let mut ctx = Context::catalog();
    walk_fused(value, &mut state, &mut ctx, &mut |_| {}).unwrap();
    state
        .complete_with_events(&mut ctx, &mut |_| {})
        .unwrap()
        .unwrap()
}
fn row(n: &Node) -> [u32; 8] {
    [
        n.parent,
        n.edge,
        n.first,
        n.count,
        n.depth,
        n.end,
        u32::from(n.flags),
        n.max_depth,
    ]
}
fn parity(actual: &Structure, expected: &Structure) {
    assert_eq!(actual.extent(), expected.extent());
    for i in 0..actual.extent() {
        assert_eq!(
            row(actual.node(i).unwrap()),
            row(expected.node(i).unwrap()),
            "row {i}"
        );
    }
    assert!(actual.node(actual.extent()).is_none());
    assert!(actual.node(usize::MAX).is_none());
}
fn children(value: &Value) -> Vec<&Value> {
    match value {
        Value::Array(v) => v.iter().collect(),
        Value::Object(v) => v.iter().map(|(_, child)| child).collect(),
        _ => vec![],
    }
}
fn readback(view: &View, value: &Value, ctx: &mut Context<'_>) -> usize {
    let node = view.structure.node(view.root).unwrap();
    let kids = children(value);
    assert_eq!(node.count as usize, kids.len());
    let mut total = 1;
    for (i, child) in kids.iter().enumerate() {
        let next = Structure::child(view, i, ctx).unwrap().unwrap();
        let record = next.structure.node(next.root).unwrap();
        assert_eq!(record.parent as usize, view.root);
        assert_eq!(record.edge as usize, i);
        assert_eq!(record.depth, node.depth + 1);
        total += readback(&next, child, ctx);
    }
    assert!(Structure::child(view, kids.len(), ctx).unwrap().is_none());
    assert!(Structure::child(view, usize::MAX, ctx).unwrap().is_none());
    assert_eq!(node.end as usize - view.root, total);
    total
}
fn host_error() -> EngineError {
    let mut error = EngineError::new(
        "DFS_HOST_DENIED",
        Utf16::new(vec![47, 0xd800]),
        "first host denial",
    );
    error.python_message_origin = Some(crate::python_value::PyText::from_utf8("origin-δ"));
    error.with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference)
}
fn exact_host(actual: &EngineError) {
    let expected = host_error();
    assert_eq!(actual.code, expected.code);
    assert_eq!(actual.path, expected.path);
    assert_eq!(actual.message, expected.message);
    assert_eq!(actual.python_message_origin, expected.python_message_origin);
    assert!(actual.is_control_failure());
    assert!(!actual.is_python_schema_terminal());
}

fn context<'a>(limits: Limits) -> Context<'a> {
    Context::with_limits(ResourceProfile::Cooperative, limits).unwrap()
}
fn admitted(
    value: Value,
    ctx: &mut Context<'_>,
    event: &mut dyn FnMut(&'static str),
) -> Result<(Value, Option<Arc<Structure>>), EngineError> {
    OwnedCoreOperation::with_context(ctx, |ctx, operation| {
        OwnedCoreJson::admit_factory_resource_with_events(
            value,
            &Utf16::from("coreSchema"),
            operation,
            ctx,
            event,
        )?
        .into_core_metadata(operation, ctx)
    })
}
fn field<'a>(value: &'a Value, key: &str) -> &'a Value {
    let Value::Object(members) = value else {
        panic!("object")
    };
    &members
        .iter()
        .find(|(k, _)| k == &Utf16::from(key))
        .unwrap()
        .1
}
fn data() -> ResourceSet {
    ResourceSet::new(
        json(
            r#"{"$id":"https://closed.test/core","type":"object","default":{"a/~😀":[null,{"x":true}],"":false}}"#,
        ),
        json(r#"{"$id":"https://closed.test/reference","type":"string","default":[]}"#),
        json(r#"{"$id":"https://closed.test/package","type":"boolean","default":{"keep":null}}"#),
        json(r#"{"opaque-constraints":true}"#),
        json(r#"{"opaque-policy":null}"#),
    )
}
fn bank(
    resources: ResourceSet,
    ctx: &mut Context<'_>,
) -> Result<crate::schema::admitted_bank::AdmittedCore, EngineError> {
    OwnedCoreOperation::with_context(ctx, |ctx, operation| {
        let mut mint =
            |v, name| OwnedCoreJson::admit_factory_resource(v, &Utf16::from(name), operation, ctx);
        let owned = OwnedResourceSet {
            core_schema: mint(resources.core_schema, "coreSchema")?,
            reference_schema: mint(resources.reference_schema, "referenceSchema")?,
            package_schema: mint(resources.package_schema, "packageSchema")?,
            constraints: mint(resources.constraints, "constraints")?,
            domain_policy: mint(resources.domain_policy, "domainPolicy")?,
        };
        SchemaBank::admit_core_owned(owned, operation, ctx)
    })
}
fn compile_owner(ctx: &mut Context<'_>) -> Result<CompiledSchema, EngineError> {
    let admitted = bank(data(), ctx)?;
    CompiledSchema::compile_input_bank(admitted.bank, 0, ctx)
}
fn size(value: &Value) -> usize {
    1 + children(value).into_iter().map(size).sum::<usize>()
}
fn table_readback(
    table: &OwnerLocations,
    owner: &CompiledSchema,
    cursor: &OwnerCursor,
    value: &Value,
    role: usize,
    ordinal: usize,
    ctx: &mut Context<'_>,
) -> usize {
    let actual = table.read(owner, cursor, ctx).unwrap().unwrap();
    assert!(std::ptr::eq(actual, value));
    assert_eq!(
        cursor.logical_position_for_test(owner, ctx).unwrap(),
        Some((role, ordinal))
    );
    let mut count = 1;
    for (edge, child) in children(value).into_iter().enumerate() {
        let next = table.child(owner, cursor, edge, ctx).unwrap().unwrap();
        count += table_readback(table, owner, &next, child, role, ordinal + count, ctx);
    }
    assert!(table
        .child(owner, cursor, children(value).len(), ctx)
        .unwrap()
        .is_none());
    count
}

#[test]
fn closed01_actual_validator_literal_container_summaries_match_both_original_collectors() {
    let value = fixture();
    let (actual, structure) =
        admitted(value.clone(), &mut Context::catalog(), &mut |_| {}).unwrap();
    assert_eq!(actual, value);
    let structure = structure.unwrap();
    parity(&structure, &original(&value));
    parity(&structure, &fused(&value));
    let expected = [
        [NONE, 0, 1, 3, 0, 7, 9, 3],
        [0, 0, 0, 0, 1, 2, 0, 1],
        [0, 1, 3, 2, 1, 6, 8, 3],
        [2, 0, 0, 0, 2, 4, 0, 2],
        [2, 1, 5, 1, 2, 6, 2, 3],
        [4, 0, 0, 0, 3, 6, 0, 3],
        [0, 2, 0, 0, 1, 7, 0, 1],
    ];
    for (index, expected) in expected.iter().enumerate() {
        assert_eq!(&row(structure.node(index).unwrap()), expected);
    }
    assert_eq!(structure.extent(), expected.len());
    let roles = structure.core_role_facts().unwrap();
    assert_eq!(roles.root_id, Some(0));
    assert!(!roles.nested_id);
    assert!(roles.anchors);
    assert_eq!(
        readback(&structure.root().unwrap(), &value, &mut Context::catalog()),
        7
    );
}

#[test]
fn closed02_real_custom_narrow_and_high_limit_routes_retain_guarded_fallback() {
    let value = fixture();
    for bound in [7, u32::MAX as usize - 1, u32::MAX as usize, usize::MAX] {
        let high = bound >= u32::MAX as usize;
        let mut limits = Limits::ordinary();
        limits.max_values = bound;
        limits.max_depth = 3;
        let mut events = vec![];
        let (_, structure) =
            admitted(value.clone(), &mut context(limits), &mut |e| events.push(e)).unwrap();
        let structure = structure.unwrap();
        parity(&structure, &original(&value));
        assert_eq!(events.contains(&"closed-checked-fallback"), high);
        assert_eq!(events.contains(&"dfs-frame-growth"), high);
        assert_eq!(events.contains(&"closed-container-local"), !high);
        assert_eq!(events.contains(&"closed-structure-publication"), !high);
    }
    for (max_values, max_depth) in [(6, 3), (7, 2)] {
        let mut limits = Limits::ordinary();
        limits.max_values = max_values;
        limits.max_depth = max_depth;
        let expected = crate::value::admit_owned_json_at(
            value.clone(),
            Utf16::from("#"),
            &mut context(limits),
        )
        .unwrap_err();
        let mut events = vec![];
        let actual =
            admitted(value.clone(), &mut context(limits), &mut |e| events.push(e)).unwrap_err();
        assert_eq!(actual, expected);
        assert_eq!(actual.code, "LIMIT");
        assert!(!events.contains(&"closed-structure-publication"));
    }
    // Original generic guards remain independent of closed producer custody.
    let mut builder = Builder::default();
    let mut ctx = Context::catalog();
    builder.enter(1, &mut ctx, &mut Utf16::default()).unwrap();
    assert!(builder.complete(&mut ctx).unwrap().is_none());
    let mut traversal = Traversal::default();
    traversal
        .enter_with_events(&mut ctx, &mut Utf16::default(), &mut |_| {})
        .unwrap();
    assert!(traversal
        .complete_with_events(&mut ctx, &mut |_| {})
        .unwrap()
        .is_none());
}

#[test]
fn closed03_genuine_root_core_bank_aliases_and_subtrees_have_distinct_logical_positions() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let admitted = bank(data(), ctx)?;
        let physical = admitted
            .bank
            .structure_role(BankRoot::Core(0), ctx)?
            .unwrap();
        let alias = admitted.bank.structure_catalogue(0, ctx)?.unwrap();
        assert!(Arc::ptr_eq(&physical.structure, &alias.structure));
        assert_eq!(physical.root, alias.root);
        let owner = CompiledSchema::compile_input_bank(admitted.bank, 0, ctx)?;
        let table = OwnerLocations::build(&owner, ctx)?.unwrap();
        let root = table.root(&owner, 0, ctx)?.unwrap();
        let alias = table.root(&owner, 1, ctx)?.unwrap();
        assert!(!root.same_location(&alias));
        assert_eq!(root.logical_position_for_test(&owner, ctx)?, Some((0, 0)));
        assert_eq!(
            alias.logical_position_for_test(&owner, ctx)?,
            Some((1, size(&owner.schema)))
        );
        let mut total = 0;
        for role in 0..=owner.catalogue_entries().len() {
            let value = if role == 0 {
                &*owner.schema
            } else {
                owner.catalogue_entries().get(role - 1).unwrap().1
            };
            let cursor = table.root(&owner, role, ctx)?.unwrap();
            total += table_readback(&table, &owner, &cursor, value, role, total, ctx);
        }
        assert_eq!(table.facts.iter().map(|f| f.nodes).sum::<usize>(), total);
        let moved = owner;
        assert_eq!(root.logical_position_for_test(&moved, ctx)?, Some((0, 0)));
        let foreign = compile_owner(ctx)?;
        assert!(root.logical_position_for_test(&foreign, ctx)?.is_none());
        assert!(table.read(&foreign, &root, ctx)?.is_none());
        Ok(())
    })
    .unwrap();
}

// New controls extend existing case04; no additional named Rust test case.
fn parent_capture<T>(run:impl FnOnce()->T)->(T,Vec<(&'static str,usize,usize,usize)>) {
    let events=std::rc::Rc::new(RefCell::new(Vec::new()));let sink=events.clone();
    let result=crate::schema::admitted_structure::observe_ordered_structure(Box::new(move |e,p,o,r|sink.borrow_mut().push((e,p,o,r))),run);
    let rows=events.borrow().clone();(result,rows)
}
fn parent_bank(text:&str,ctx:&mut Context<'_>)->Arc<SchemaBank> {
    let encoded:Vec<u16>=text.encode_utf16().collect();
    let parsed=crate::serialization::read_construction_json_completed(&encoded,ctx).unwrap();
    SchemaBank::from_completed_reader(Arc::new(parsed),SchemaDialect::Draft2020_12,ctx).unwrap()
}
fn parent_wide_text(n:usize)->String {
    let rows=(0..n).map(|i|match i%3 {
        0=>format!(r#"{{"schema":{{"properties":{{"nested":{{"enum":[null,{{"wide":[1,2,3]}}]}}}}}},"id":"urn:parent:{i}"}}"#),
        1=>format!(r#"{{"id":"urn:parent:{i}","schema":{{"allOf":[{{}},{{"properties":{{"wide":{{}}}}}}]}}}}"#),
        _=>format!(r#"{{"pad":[{{"extent":[1,2,3]}}],"id":"urn:parent:{i}","schema":{{"type":"object"}}}}"#),
    }).collect::<Vec<_>>().join(",");
    format!(r#"{{"pad0":null,"metaschemas":{{"Draft202012Validator":{{}}}},"pad2":[null,{{"extent":[]}}],"resources":[{rows}]}}"#)
}
fn parent_parity(bank:&SchemaBank,ctx:&mut Context<'_>)->(usize,usize) {
    let (expected,old_events)=parent_capture(||(0..bank.len()).map(|i|bank.structure_catalogue(i,ctx).unwrap().unwrap()).collect::<Vec<_>>());
    let (_,new_events)=parent_capture(||{
        let parent=bank.resources_parent(ctx).unwrap().unwrap();
        // Random/repeated and out-of-range requests remain stateless. Their
        // ordinal is always the genuine row, never a fabricated frontier.
        for i in (0..bank.len()).chain((0..bank.len()).rev()) {
            let actual=parent.select(i,ctx).unwrap().unwrap();
            assert_eq!(actual.root,expected[i].root);
            assert!(Arc::ptr_eq(&actual.structure,&expected[i].structure));
            assert_eq!(row(actual.structure.node(actual.root).unwrap()),row(expected[i].structure.node(expected[i].root).unwrap()));
        }
        assert!(parent.select(usize::MAX,ctx).unwrap().is_none());
    });
    let old=old_events.iter().filter(|e|e.0=="ow1-original-extent-advance").count();
    // Two identical per-row passes share exactly one root->resources prefix.
    let new=new_events.iter().filter(|e|e.0=="ow1-original-extent-advance").count();
    assert!(new_events.iter().all(|e|!e.0.starts_with("catalogue-")));
    (old,new)
}
fn parent_guard_controls(ctx:&mut Context<'_>) {
    for n in [0usize,1,2,7,33,97] {
        let text=parent_wide_text(n);let bank=parent_bank(&text,ctx);
        let (old,new)=parent_parity(&bank,ctx);
        let nested=(0..n).map(|i|i%3).sum::<usize>();
        assert_eq!(old,3*n+n.saturating_sub(1)*n/2+nested);
        assert_eq!(new,3+2*(n.saturating_sub(1)*n/2+nested));
        let parent=bank.resources_parent(ctx).unwrap().unwrap();
        let other=parent_bank(&text,ctx);let other_parent=other.resources_parent(ctx).unwrap().unwrap();
        if n>0 {
            let a=parent.select(0,ctx).unwrap().unwrap();let b=other_parent.select(0,ctx).unwrap().unwrap();
            assert!(!Arc::ptr_eq(&a.structure,&b.structure));
        }
        let mut ordinary_limits=Context::ordinary();
        assert!(parent.select(0,&mut ordinary_limits).unwrap().is_none());
        let mut wrong_lifetime=Context::catalog();
        wrong_lifetime.with_codegen_construction(|foreign|{
            assert!(parent.select(0,foreign)?.is_none());Ok(())
        }).unwrap();
        let mut limits=Limits::catalog();limits.max_depth-=1;
        assert!(parent.select(0,&mut context(limits)).unwrap().is_none());
        let raw=SchemaBank::from_meta(Arc::new(json(&text)),SchemaDialect::Draft2020_12,ctx).unwrap();
        assert!(raw.resources_parent(ctx).unwrap().is_none());
        // The old fallback remains independently callable and unchanged.
        assert!(raw.structure_catalogue(0,ctx).unwrap().is_none());
    }
}
fn parent_callback_lifetime_controls() {
    // Invalidate the actual shared cold-operation lifetime inside each of the
    // first three original per-row callbacks. The retained immutable parent
    // does not replace the dynamic bank/parser checks or mint a new token.
    for trip in 1..=3 {
        type State=std::rc::Rc<RefCell<crate::schema::ConstructionState>>;
        let shared=std::rc::Rc::new(RefCell::new(None::<State>));let captured=shared.clone();
        let armed=std::rc::Rc::new(Cell::new(false));let flag=armed.clone();
        let calls=std::rc::Rc::new(Cell::new(0));let count=calls.clone();
        let mut control=move |_|{
            if flag.get(){let n=count.get()+1;count.set(n);if n==trip{
                captured.borrow().as_ref().unwrap().borrow_mut().lifetime=None;
            }}Ok(())
        };
        let mut ctx=Context::catalog().with_host_control(&mut control);
        ctx.with_codegen_construction(|ctx|{
            let bank=parent_bank(&parent_wide_text(4),ctx);
            let parent=bank.resources_parent(ctx)?.unwrap();
            let state=std::rc::Rc::clone(ctx.schema_construction.as_ref().unwrap());
            let original=state.borrow().lifetime.clone();*shared.borrow_mut()=Some(state.clone());
            armed.set(true);
            let (actual,events)=parent_capture(||parent.select(0,ctx));
            armed.set(false);assert!(actual?.is_none());assert!(events.is_empty());
            assert!(bank.structure_catalogue(0,ctx)?.is_none());
            state.borrow_mut().lifetime=original;
            assert!(parent.select(0,ctx)?.is_some());Ok(())
        }).unwrap();
    }
}
fn parent_denial_controls() {
    // Deny every actual predebit in setup+first lookup. A denied operation
    // returns the original host error; it never emits a later physical read.
    let text=parent_wide_text(4);
    let enabled=std::rc::Rc::new(Cell::new(false));let flag=enabled.clone();
    let calls=std::rc::Rc::new(Cell::new(0));let count=calls.clone();
    let mut control=move |_|{if flag.get(){count.set(count.get()+1);}Ok(())};
    let mut ctx=Context::catalog().with_host_control(&mut control);
    let mut trace=Vec::new();
    ctx.with_codegen_construction(|ctx|{
        let bank=parent_bank(&text,ctx);enabled.set(true);
        let (result,events)=parent_capture(||{
            let parent=bank.resources_parent(ctx)?.unwrap();parent.select(0,ctx)
        });
        result?;trace=events;enabled.set(false);Ok(())
    }).unwrap();
    let charges=calls.get();assert!(charges>0);assert!(!trace.is_empty());
    for deny in 1..=charges {
        let enabled=std::rc::Rc::new(Cell::new(false));let flag=enabled.clone();
        let calls=std::rc::Rc::new(Cell::new(0));let count=calls.clone();
        let mut control=move |_|{if flag.get(){let n=count.get()+1;count.set(n);assert!(n<=deny);if n==deny{return Err(host_error());}}Ok(())};
        let mut ctx=Context::catalog().with_host_control(&mut control);
        ctx.with_codegen_construction(|ctx|{
            let bank=parent_bank(&text,ctx);enabled.set(true);
            let (result,events)=parent_capture(||{
                let parent=bank.resources_parent(ctx)?.unwrap();parent.select(0,ctx)
            });
            exact_host(&result.unwrap_err());enabled.set(false);
            assert_eq!(calls.get(),deny);
            assert!(trace.starts_with(&events));
            // No mutable traversal state survives: a fresh invocation repeats
            // genuine lookups, rather than resuming a half-advanced cursor.
            let parent=bank.resources_parent(ctx)?.unwrap();
            let actual=parent.select(0,ctx)?.unwrap();let old=bank.structure_catalogue(0,ctx)?.unwrap();
            assert_eq!(actual.root,old.root);assert!(Arc::ptr_eq(&actual.structure,&old.structure));Ok(())
        }).unwrap();
    }
    let armed=std::rc::Rc::new(Cell::new(false));let flag=armed.clone();
    let mut control=move |_|{if flag.replace(false){panic!("original parent host panic");}Ok(())};
    let mut ctx=Context::catalog().with_host_control(&mut control);
    ctx.with_codegen_construction(|ctx|{
        let bank=parent_bank(&text,ctx);let parent=bank.resources_parent(ctx)?.unwrap();armed.set(true);
        assert!(catch_unwind(AssertUnwindSafe(||parent.select(0,ctx))).is_err());
        let actual=parent.select(0,ctx)?.unwrap();let old=bank.structure_catalogue(0,ctx)?.unwrap();
        assert_eq!(actual.root,old.root);assert!(Arc::ptr_eq(&actual.structure,&old.structure));Ok(())
    }).unwrap();
}

#[test]
fn closed04_all_twenty_real_meta_roles_have_relative_subtree_readback_and_alias_identity() {
    parent_denial_controls();
    parent_callback_lifetime_controls();
    let pinned = json(include_str!("schema_metas.json"));
    let Value::Array(rows) = field(&pinned, "resources") else {
        panic!("resources")
    };
    assert_eq!(rows.len(), 20);
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let _core = compile_owner(ctx)?;
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
        let bank=meta.resource_bank.as_ref().unwrap();
        let before=ctx.charged_work();
        for i in 0..bank.len(){assert!(bank.structure_catalogue(i,ctx)?.is_some());}
        let old_fee=ctx.charged_work()-before;
        let before=ctx.charged_work();
        ctx.charge_work(3,Utf16::default())?;
        let retained=bank.resources_parent(ctx)?.unwrap();
        for i in 0..bank.len(){ctx.charge_work(2,Utf16::default())?;assert!(retained.select(i,ctx)?.is_some());}
        let new_fee=ctx.charged_work()-before;
        assert_eq!(old_fee,1000);
        assert!(new_fee<old_fee,"actual target debit comparison, not a layout guess");
        let (old,new)=parent_parity(bank,ctx);
        assert_eq!(old,270);
        assert_eq!(new,423); // 3 once + two passes of (190+20).
        parent_guard_controls(ctx);
        let table = OwnerLocations::build(&meta, ctx)?.unwrap();
        let root = table.root(&meta, 0, ctx)?.unwrap();
        assert_eq!(
            &*meta.schema,
            field(field(&pinned, "metaschemas"), "Draft202012Validator")
        );
        let mut total = table_readback(&table, &meta, &root, &meta.schema, 0, 0, ctx);
        let mut aliases = 0;
        for (i, row) in rows.iter().enumerate() {
            let (id, value) = meta.catalogue_entries().get(i).unwrap();
            assert_eq!(&Value::String(id.clone()), field(row, "id"));
            assert_eq!(value, field(row, "schema"));
            let cursor = table.root(&meta, i + 1, ctx)?.unwrap();
            if value == &*meta.schema {
                assert!(!root.same_location(&cursor));
                aliases += 1;
            }
            total += table_readback(&table, &meta, &cursor, value, i + 1, total, ctx);
        }
        assert!(aliases > 0);
        assert_eq!(table.facts.len(), 21);
        assert_eq!(table.facts.iter().map(|f| f.nodes).sum::<usize>(), total);
        Ok(())
    })
    .unwrap();
}

#[test]
fn closed05_aggregate_bound_counts_repeated_roles_not_just_physical_closed_records() {
    let mut limits = Limits::catalog();
    limits.max_values = 4096;
    let mut ctx = context(limits);
    ctx.with_codegen_construction(|ctx| {
        let mut input = data();
        for schema in [&mut input.core_schema, &mut input.reference_schema] {
            let Value::Object(members) = schema else {
                panic!("object")
            };
            members
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("default"))
                .unwrap()
                .1 = Value::Array(vec![Value::Null; 1500]);
        }
        let admitted = bank(input, ctx)?;
        let mut physical = 0;
        let mut selected = 0;
        for role in 0..3 {
            let view = admitted
                .bank
                .structure_role(BankRoot::Core(role), ctx)?
                .unwrap();
            let n = view.structure.node(view.root).unwrap().end as usize - view.root;
            physical += n;
            if role == 0 {
                selected = n;
            }
        }
        assert!(physical <= limits.max_values);
        assert!(physical + selected > limits.max_values);
        let owner = CompiledSchema::compile_input_bank(admitted.bank, 0, ctx)?;
        assert!(OwnerLocations::build(&owner, ctx)?.is_none());
        assert!(owner.validate(&json("{}"), ctx)?.is_empty());
        assert!(!owner.validate(&Value::Bool(false), ctx)?.is_empty());
        Ok(())
    })
    .unwrap();
}

#[test]
fn closed06_invalid_children_and_foreign_operation_custody_cannot_publish_partial_metadata() {
    for value in [
        Value::Array(vec![Value::Number(f64::NAN)]),
        Value::Object(vec![
            (Utf16::from("x"), Value::Null),
            (Utf16::from("x"), Value::Number(f64::NAN)),
        ]),
    ] {
        let expected = crate::value::admit_owned_json_at(
            value.clone(),
            Utf16::from("#"),
            &mut Context::catalog(),
        )
        .unwrap_err();
        let mut events = vec![];
        let error = admitted(value, &mut Context::catalog(), &mut |e| events.push(e)).unwrap_err();
        assert_eq!(error, expected);
        assert!(!events.contains(&"closed-structure-publication"));
        assert!(!events.contains(&"carrier-publication"));
    }
    let mut ctx = Context::catalog();
    OwnedCoreOperation::with_context(&mut ctx, |ctx, outer| {
        let carrier = OwnedCoreJson::admit_factory_resource(
            fixture(),
            &Utf16::from("coreSchema"),
            outer,
            ctx,
        )?;
        let (value, metadata) = OwnedCoreOperation::with_context(ctx, |ctx, foreign| {
            carrier.into_core_metadata(foreign, ctx)
        })?;
        assert_eq!(value, fixture());
        assert!(metadata.is_none());
        Ok(())
    })
    .unwrap();
    assert!(ctx.owned_core_operation.is_none());
}

#[test]
fn closed07_actual_callback_groups_deny_header_records_merges_and_publication_without_later_effects(
) {
    for bound in [Limits::catalog().max_values, u32::MAX as usize] {
        let mut limits = Limits::catalog();
        limits.max_values = bound;
        let high = bound >= u32::MAX as usize;
        let calls = Cell::new(0usize);
        let trace = RefCell::new(vec![]);
        let mut meter = |_: usize| {
            calls.set(calls.get() + 1);
            Ok(())
        };
        admitted(
            fixture(),
            &mut context(limits).with_host_control(&mut meter),
            &mut |e| trace.borrow_mut().push((calls.get(), e)),
        )
        .unwrap();
        let trace = trace.into_inner();
        let required: &[&str] = if high {
            &[
                "closed-compact-guard",
                "closed-checked-fallback",
                "closed-checked-token",
                "dfs-slot-growth",
                "dfs-frame-growth",
                "dfs-frame-enter",
                "dfs-member-facts",
                "dfs-record-complete",
                "dfs-child-return",
                "dfs-structure-publication",
            ]
        } else {
            &[
                "closed-compact-guard",
                "closed-row-growth",
                "closed-container-local",
                "closed-member-facts",
                "closed-scalar-record",
                "closed-child-summary",
                "closed-container-record",
                "closed-structure-publication",
            ]
        };
        for label in required {
            assert!(
                trace.iter().any(|(_, e)| e == label),
                "missing actual event {label}"
            );
        }
        assert_eq!(trace.iter().any(|(_, e)| e.starts_with("dfs-frame")), high);
        for deny in 1..=calls.get() {
            let seen_calls = Cell::new(0usize);
            let mut seen = vec![];
            let mut control = |_: usize| {
                seen_calls.set(seen_calls.get() + 1);
                assert!(seen_calls.get() <= deny, "callback after denial");
                if seen_calls.get() == deny {
                    Err(host_error())
                } else {
                    Ok(())
                }
            };
            let mut ctx = context(limits).with_host_control(&mut control);
            let error = admitted(fixture(), &mut ctx, &mut |e| {
                seen.push((seen_calls.get(), e))
            })
            .unwrap_err();
            exact_host(&error);
            assert_eq!(seen_calls.get(), deny);
            assert!(ctx.owned_core_operation.is_none());
            assert_eq!(
                seen,
                trace
                    .iter()
                    .copied()
                    .filter(|(n, _)| *n < deny)
                    .collect::<Vec<_>>()
            );
        }
    }
}

#[test]
fn closed08_observer_unwind_restores_actual_caller_state_and_cannot_return_a_partial_carrier() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        OwnedCoreOperation::with_context(ctx, |ctx, _outer| {
            let prior = Arc::clone(ctx.owned_core_operation.as_ref().unwrap());
            let scope = std::rc::Rc::clone(ctx.schema_construction.as_ref().unwrap());
            for target in [
                "closed-container-local",
                "closed-child-summary",
                "closed-container-record",
                "closed-structure-publication",
            ] {
                let mut events = vec![];
                let before = ctx.charged_work();
                let result = catch_unwind(AssertUnwindSafe(|| {
                    admitted(fixture(), ctx, &mut |e| {
                        events.push(e);
                        if e == target {
                            panic!("closed observer unwind");
                        }
                    })
                }));
                assert!(result.is_err());
                assert_eq!(events.last(), Some(&target));
                assert!(Arc::ptr_eq(
                    ctx.owned_core_operation.as_ref().unwrap(),
                    &prior
                ));
                assert!(std::rc::Rc::ptr_eq(
                    ctx.schema_construction.as_ref().unwrap(),
                    &scope
                ));
                assert!(ctx.charged_work() > before);
                let (_, structure) = admitted(fixture(), ctx, &mut |_| {})?;
                parity(&structure.unwrap(), &original(&fixture()));
            }
            Ok(())
        })
    })
    .unwrap();
    assert!(ctx.owned_core_operation.is_none());
    assert!(!ctx.in_codegen_construction());
}

#[test]
fn closed09_host_reentry_at_real_container_debit_keeps_nested_root_and_first_error_isolated() {
    let calls = Cell::new(0usize);
    let target = Cell::new(None);
    let mut count = |_: usize| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    admitted(
        fixture(),
        &mut Context::catalog().with_host_control(&mut count),
        &mut |e| {
            if e == "closed-container-local" && target.get().is_none() {
                target.set(Some(calls.get()));
            }
        },
    )
    .unwrap();
    let deny = target.get().unwrap();
    let current = Cell::new(0usize);
    let nested = RefCell::new(None);
    let mut control = |_: usize| {
        current.set(current.get() + 1);
        assert!(current.get() <= deny);
        if current.get() == deny {
            let value = json(r#"{"different":[true,null]}"#);
            let result = admitted(value.clone(), &mut Context::catalog(), &mut |_| {})?;
            parity(result.1.as_ref().unwrap(), &original(&value));
            *nested.borrow_mut() = Some(result);
            Err(host_error())
        } else {
            Ok(())
        }
    };
    let mut events = vec![];
    let mut ctx = Context::catalog().with_host_control(&mut control);
    let error = admitted(fixture(), &mut ctx, &mut |e| events.push(e)).unwrap_err();
    exact_host(&error);
    assert!(!events.contains(&"closed-container-local"));
    assert!(!events.contains(&"closed-structure-publication"));
    assert_eq!(current.get(), deny);
    assert!(ctx.owned_core_operation.is_none());
    let nested = nested.borrow();
    let (value, structure) = nested.as_ref().unwrap();
    assert_eq!(
        readback(
            &structure.as_ref().unwrap().root().unwrap(),
            value,
            &mut Context::catalog()
        ),
        4
    );
}

#[test]
fn closed10_completed_parser_requires_closed_records_only_after_actual_delimiter_acceptance() {
    // The supplied seam said parser wiring was PENDING; this control requires
    // the actual reader connection, never a standalone kernel substitute.
    let source: Vec<_> = r#"{"a/~\uD83D\uDE00":[null,{"$id":"inner"}],"empty":[]}"#
        .encode_utf16()
        .collect();
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let mut events = vec![];
        let receipt = crate::serialization::read_construction_json_completed_with_events(
            &source,
            ctx,
            &mut |e| events.push(e),
        )?;
        let structure = receipt.structure().unwrap();
        parity(structure, &original(receipt.value()));
        parity(structure, &fused(receipt.value()));
        assert!(
            events.contains(&"closed-container-local"),
            "parser closed route must be genuinely wired"
        );
        assert!(events.contains(&"closed-structure-publication"));
        assert!(!events.contains(&"dfs-frame-growth"));
        let expected = [
            [NONE, 0, 1, 2, 0, 6, 4, 3],
            [0, 0, 2, 2, 1, 5, 4, 3],
            [1, 0, 0, 0, 2, 3, 0, 2],
            [1, 1, 4, 1, 2, 5, 1, 3],
            [3, 0, 0, 0, 3, 5, 0, 3],
            [0, 1, 0, 0, 1, 6, 0, 1],
        ];
        assert_eq!(structure.extent(), expected.len());
        for (index, expected) in expected.iter().enumerate() {
            assert_eq!(&row(structure.node(index).unwrap()), expected);
        }
        assert_eq!(
            readback(&structure.root().unwrap(), receipt.value(), ctx),
            structure.extent()
        );
        for bad in [
            r#"{"a":[0,]}"#,
            r#"{"a":0"#,
            r#"{"a":0} false"#,
            r#"{"a":1e}"#,
        ] {
            let source: Vec<_> = bad.encode_utf16().collect();
            let mut events = vec![];
            assert!(
                crate::serialization::read_construction_json_completed_with_events(
                    &source,
                    ctx,
                    &mut |e| events.push(e)
                )
                .is_err()
            );
            assert!(!events.contains(&"closed-structure-publication"));
            assert!(!events.contains(&"owned-publication"));
        }
        Ok(())
    })
    .unwrap();
    assert!(!ctx.in_codegen_construction());
    for bound in [6, u32::MAX as usize - 1, u32::MAX as usize, usize::MAX] {
        let mut limits = Limits::catalog();
        limits.max_values = bound;
        limits.max_depth = 3;
        let mut ctx = context(limits);
        ctx.with_codegen_construction(|ctx| {
            let mut events = vec![];
            let receipt = crate::serialization::read_construction_json_completed_with_events(
                &source,
                ctx,
                &mut |e| events.push(e),
            )?;
            parity(receipt.structure().unwrap(), &original(receipt.value()));
            let high = bound >= u32::MAX as usize;
            assert_eq!(events.contains(&"closed-checked-fallback"), high);
            assert_eq!(events.contains(&"closed-checked-token"), high);
            assert_eq!(events.contains(&"dfs-frame-growth"), high);
            assert_eq!(events.contains(&"closed-container-local"), !high);
            Ok(())
        })
        .unwrap();
    }
    // Authenticate real parser event groups independently of typed admission.
    fn parse(
        source: &[u16],
        ctx: &mut Context<'_>,
        event: &mut dyn FnMut(&'static str),
    ) -> Result<(), EngineError> {
        ctx.with_codegen_construction(|ctx| {
            crate::serialization::read_construction_json_completed_with_events(source, ctx, event)
                .map(|_| ())
        })
    }
    let calls = Cell::new(0usize);
    let trace = RefCell::new(vec![]);
    let mut control = |_: usize| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    parse(
        &source,
        &mut Context::catalog().with_host_control(&mut control),
        &mut |e| trace.borrow_mut().push((calls.get(), e)),
    )
    .unwrap();
    let trace = trace.into_inner();
    for deny in 1..=calls.get() {
        let seen_calls = Cell::new(0usize);
        let mut control = |_: usize| {
            seen_calls.set(seen_calls.get() + 1);
            assert!(
                seen_calls.get() <= deny,
                "parser callback after first denial"
            );
            if seen_calls.get() == deny {
                Err(host_error())
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::catalog().with_host_control(&mut control);
        let mut seen = vec![];
        let error =
            parse(&source, &mut ctx, &mut |e| seen.push((seen_calls.get(), e))).unwrap_err();
        exact_host(&error);
        assert!(!ctx.in_codegen_construction());
        assert_eq!(seen_calls.get(), deny);
        assert_eq!(
            seen,
            trace
                .iter()
                .copied()
                .filter(|(at, _)| *at < deny)
                .collect::<Vec<_>>()
        );
    }
}

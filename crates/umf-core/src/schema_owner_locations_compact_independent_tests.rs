// SPDX-License-Identifier: MIT OR Apache-2.0
//! Independent compact-coordinate controls. SOURCE ONLY / NATIVE UNEXECUTED.
//! Child of schema::owner_locations; H owns the production include and seams.
use super::*;
use std::cell::{Cell, RefCell};

fn parsed(text: &str) -> Value {
    crate::serialization::read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn genuine_owner(reversed: bool) -> CompiledSchema {
    // Unknown keys occur ONLY in annotation DATA; strict root schema stays valid.
    let source =
        parsed(r#"{"type":"object","default":{"a/~☃":[null,{"😀":true}],"opaque":{"future":7}}}"#);
    let mut entries = vec![
        (
            Utf16::from("https://compact.test/first"),
            parsed(r#"{"type":"string","default":[false,{"kept":"one"}]}"#),
        ),
        (
            Utf16::from("https://compact.test/second"),
            parsed(r#"{"type":"boolean","default":{"kept":"two"}}"#),
        ),
    ];
    if reversed {
        entries.reverse();
    }
    let mut ctx = Context::catalog();
    let owner = ctx
        .with_codegen_construction(|ctx| {
            CompiledSchema::compile(&source, &SchemaResources { entries }, ctx)
        })
        .unwrap();
    assert!(
        owner.owner_lineage.is_some(),
        "must use actual successful admission"
    );
    assert!(
        owner.owner_locations.is_some(),
        "small real owner must have actual coordinates"
    );
    assert!(ctx.schema_construction.is_none());
    owner
}
fn host_failure() -> EngineError {
    let mut error = EngineError::new(
        "COMPACT_FIRST_DENIAL",
        Utf16::new(vec![47, 0xd800, 126]),
        "compact host failure",
    );
    error.python_message_origin = Some(crate::python_value::PyText::from_utf8("origin-δ"));
    error
}
fn same_host_failure(actual: &EngineError, expected: &EngineError) {
    assert_eq!(actual.code, expected.code);
    assert_eq!(actual.path, expected.path);
    assert_eq!(actual.message, expected.message);
    assert_eq!(actual.python_message_origin, expected.python_message_origin);
    assert!(actual.is_control_failure());
}
fn read_tree(
    table: &OwnerLocations,
    owner: &CompiledSchema,
    cursor: &OwnerCursor,
    expected: &Value,
    role: usize,
    parent: Option<usize>,
    edge: usize,
    depth: usize,
    ctx: &mut Context<'_>,
) -> usize {
    let d = table.materialized_descriptor(cursor.node).unwrap();
    assert_eq!(d.root as usize, role);
    assert_eq!(
        d.parent,
        match parent {
            Some(p) => u32::try_from(p).unwrap(),
            None => Descriptor::NO_PARENT,
        }
    );
    assert_eq!(d.edge as usize, edge);
    assert_eq!(d.depth as usize, depth);
    let actual = table.read(owner, cursor, ctx).unwrap().unwrap();
    assert_eq!(actual, expected);
    assert!(
        std::ptr::eq(actual, expected),
        "read actual immutable owner storage"
    );
    let children: Vec<&Value> = match expected {
        Value::Object(v) => v.iter().map(|(_, v)| v).collect(),
        Value::Array(v) => v.iter().collect(),
        _ => Vec::new(),
    };
    assert_eq!(d.count as usize, children.len());
    let mut visited = 1;
    for (i, child) in children.iter().enumerate() {
        let next = table.child(owner, cursor, i, ctx).unwrap().unwrap();
        let position = (d.first as usize).checked_add(i).unwrap();
        assert_eq!(table.materialized_edge(position).unwrap(), next.node);
        visited += read_tree(
            table,
            owner,
            &next,
            child,
            role,
            Some(cursor.node),
            i,
            depth + 1,
            ctx,
        );
    }
    assert!(table
        .child(owner, cursor, children.len(), ctx)
        .unwrap()
        .is_none());
    visited
}

#[test]
fn compact_actual_storage_is_six_u32s_with_normal_alignment() {
    assert_eq!(
        std::mem::size_of::<Descriptor>(),
        6 * std::mem::size_of::<u32>()
    );
    assert_eq!(std::mem::size_of::<Descriptor>(), 24);
    assert_eq!(
        std::mem::align_of::<Descriptor>(),
        std::mem::align_of::<u32>()
    );
    assert_eq!(
        DESCRIPTOR_WORDS,
        std::mem::size_of::<Descriptor>().div_ceil(std::mem::size_of::<usize>())
    );
    let values = vec![
        Descriptor::checked(0, None, 0, 0, 0, 0).unwrap(),
        Descriptor::checked(1, Some(0), 2, 3, 4, 5).unwrap(),
    ];
    assert_eq!(
        (
            values[1].root,
            values[1].parent,
            values[1].edge,
            values[1].first,
            values[1].count,
            values[1].depth
        ),
        (1, 0, 2, 3, 4, 5)
    );
    assert_eq!(
        (values.as_ptr() as usize) % std::mem::align_of::<Descriptor>(),
        0
    );
}

#[test]
fn compact_each_field_exact_u32_bound_and_reserved_parent_are_checked() {
    let max = u32::MAX as usize;
    let d = Descriptor::checked(max, None, max, max, max, max).unwrap();
    assert_eq!(
        (d.root, d.parent, d.edge, d.first, d.count, d.depth),
        (u32::MAX, u32::MAX, u32::MAX, u32::MAX, u32::MAX, u32::MAX)
    );
    let parent = Descriptor::checked(0, Some(max - 1), 0, 0, 0, 0).unwrap();
    assert_eq!(parent.parent, u32::MAX - 1);
    assert!(Descriptor::checked(0, Some(max), 0, 0, 0, 0).is_none());
    let zero = Descriptor::checked(0, Some(0), 0, 0, 0, 0).unwrap();
    assert_eq!(zero.parent, 0);
    // first/count are independent representable fields, not an assertion that
    // a fictitious enormous edge table has been admitted.
}

#[test]
fn compact_unrepresentable_fields_decline_without_wrap_or_large_allocation() {
    let Some(over) = (u32::MAX as usize).checked_add(1) else {
        // On32-bit usize, no value aboveu32 can be supplied. Sentinel and exact
        // boundary are still exercised by the separate universal test.
        assert_eq!(usize::BITS, 32);
        return;
    };
    for field in 0..6 {
        let mut values = [0usize; 6];
        values[field] = over;
        let parent = if field == 1 { Some(values[1]) } else { None };
        assert!(
            Descriptor::checked(values[0], parent, values[2], values[3], values[4], values[5])
                .is_none(),
            "overflow field{field}"
        );
    }
    assert!(Descriptor::checked(
        usize::MAX,
        Some(usize::MAX),
        usize::MAX,
        usize::MAX,
        usize::MAX,
        usize::MAX
    )
    .is_none());
}

#[test]
fn compact_metadata_denial_precedes_checked_fallback_and_preserves_first_host_error() {
    for parent in [None, Some(u32::MAX as usize)] {
        let expected = host_failure();
        let pending = RefCell::new(Some(expected.clone()));
        let calls = Cell::new(0usize);
        let attempted = Cell::new(0u64);
        let mut deny = |amount| {
            calls.set(calls.get() + 1);
            attempted.set(attempted.get() + amount as u64);
            Err(pending
                .borrow_mut()
                .take()
                .expect("no callback after first metadata denial"))
        };
        let mut ctx = Context::catalog().with_host_control(&mut deny);
        let error = Descriptor::admit(0, parent, 0, 0, 0, 0, &mut ctx).unwrap_err();
        same_host_failure(&error, &expected);
        assert_eq!(calls.get(), 1);
        assert_eq!(ctx.charged_work(), attempted.get());
        assert!(attempted.get() > 0);
        assert_eq!(
            Descriptor::checked(0, parent, 0, 0, 0, 0).is_some(),
            parent.is_none()
        );
        // The unrepresentable input must propagate the charge refusal, not
        // return an early None that silently skips metadata/control admission.
    }
    let observed = Cell::new(0u64);
    let mut meter = |amount| {
        observed.set(observed.get() + amount as u64);
        Ok(())
    };
    let mut ctx = Context::catalog().with_host_control(&mut meter);
    assert!(
        Descriptor::admit(0, Some(u32::MAX as usize), 0, 0, 0, 0, &mut ctx)
            .unwrap()
            .is_none()
    );
    assert!(observed.get() > 0);
    assert_eq!(ctx.charged_work(), observed.get());
}

#[test]
fn compact_real_roles_parent_edges_and_nested_data_read_back_in_order() {
    for reversed in [false, true] {
        let owner = genuine_owner(reversed);
        let table = owner.owner_locations.as_ref().unwrap();
        let mut ctx = Context::catalog();
        let mut visited = 0;
        let root = table.root(&owner, 0, &mut ctx).unwrap().unwrap();
        visited += read_tree(table, &owner, &root, &owner.schema, 0, None, 0, 0, &mut ctx);
        assert_eq!(owner.resources.entries.len(), 2);
        let expected_first = if reversed {
            "https://compact.test/second"
        } else {
            "https://compact.test/first"
        };
        assert_eq!(owner.resources.entries[0].0, Utf16::from(expected_first));
        for (i, (_, value)) in owner.resources.entries.iter().enumerate() {
            let cursor = table.root(&owner, i + 1, &mut ctx).unwrap().unwrap();
            visited += read_tree(table, &owner, &cursor, value, i + 1, None, 0, 0, &mut ctx);
        }
        assert_eq!(visited, table.materialized_node_count().unwrap());
        assert!(table.root(&owner, 3, &mut ctx).unwrap().is_none());
    }
}

#[test]
fn compact_owner_moves_preserve_coordinates_and_foreign_lineages_refuse() {
    let owner = genuine_owner(false);
    let table = Arc::clone(owner.owner_locations.as_ref().unwrap());
    let mut ctx = Context::catalog();
    let cursor = table.root(&owner, 0, &mut ctx).unwrap().unwrap();
    let moved = Box::new(owner);
    let moved = vec![moved];
    let owner = &*moved[0];
    assert_eq!(
        table.read(owner, &cursor, &mut ctx).unwrap(),
        Some(&*owner.schema)
    );
    let foreign = genuine_owner(false);
    let foreign_table = foreign.owner_locations.as_ref().unwrap();
    let other = foreign_table.root(&foreign, 0, &mut ctx).unwrap().unwrap();
    assert!(!cursor.same_location(&other));
    assert!(table.root(&foreign, 0, &mut ctx).unwrap().is_none());
    assert!(table.read(&foreign, &cursor, &mut ctx).unwrap().is_none());
    assert!(table.read(owner, &other, &mut ctx).unwrap().is_none());
    assert!(table.child(owner, &other, 0, &mut ctx).unwrap().is_none());
    assert_eq!(
        table.read(owner, &cursor, &mut ctx).unwrap(),
        Some(&*owner.schema)
    );
}

#[test]
fn compact_optional_bound_fallback_never_replaces_original_semantics_or_table() {
    let owner = genuine_owner(false);
    let installed = Arc::clone(owner.owner_locations.as_ref().unwrap());
    let yes = parsed("{}");
    let no = Value::Bool(false);
    let before_yes = owner.validate(&yes, &mut Context::catalog()).unwrap();
    let before_no = owner.validate(&no, &mut Context::catalog()).unwrap();
    assert!(before_yes.is_empty());
    assert!(!before_no.is_empty());
    let mut limits = Context::catalog().limits();
    limits.max_values = owner.resources.entries.len();
    let mut ctx =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let events = RefCell::new(Vec::new());
    assert!(
        OwnerLocations::build_with_events(&owner, &mut ctx, |event| events
            .borrow_mut()
            .push(event))
        .unwrap()
        .is_none()
    );
    assert!(
        events.borrow().is_empty(),
        "root capacity declined before reserve"
    );
    let mut limits = Context::catalog().limits();
    limits.max_depth = 0;
    let mut ctx =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let events = RefCell::new(Vec::new());
    assert!(
        OwnerLocations::build_with_events(&owner, &mut ctx, |event| events
            .borrow_mut()
            .push(event))
        .unwrap()
        .is_none()
    );
    assert!(!events.borrow().contains(&"publish"));
    assert!(Arc::ptr_eq(
        owner.owner_locations.as_ref().unwrap(),
        &installed
    ));
    assert_eq!(
        owner.validate(&yes, &mut Context::catalog()).unwrap(),
        before_yes
    );
    assert_eq!(
        owner.validate(&no, &mut Context::catalog()).unwrap(),
        before_no
    );
}

#[test]
fn compact_actual_descriptor_capacity_charge_precedes_first_reservation_event() {
    let owner = genuine_owner(false);
    let last = Cell::new(0usize);
    let calls = Cell::new(0usize);
    let mut observe = |amount| {
        last.set(amount);
        calls.set(calls.get() + 1);
        Ok(())
    };
    let events = RefCell::new(Vec::new());
    let table = OwnerLocations::build_with_events(
        &owner,
        &mut Context::catalog().with_host_control(&mut observe),
        |name| events.borrow_mut().push((name, last.get(), calls.get())),
    )
    .unwrap()
    .unwrap();
    let events = events.borrow();
    let (_, amount, charge) = events
        .iter()
        .find(|(name, _, _)| *name == "nodes-reserve")
        .copied()
        .unwrap();
    assert!(charge > 0);
    // First reserve is one genuine Descriptor, zero prior elements to relocate.
    assert_eq!(
        amount,
        std::mem::size_of::<Descriptor>().div_ceil(std::mem::size_of::<usize>())
    );
    assert_eq!(events.last().unwrap().0, "publish");
    assert!(table.materialized_node_count().unwrap() > 1);
}

#[test]
fn compact_each_reservation_and_publication_denies_before_effect_event_without_partial_result() {
    let owner = genuine_owner(false);
    let installed = Arc::clone(owner.owner_locations.as_ref().unwrap());
    let calls = Cell::new(0usize);
    let trace = RefCell::new(Vec::new());
    let mut observe = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    let reference = OwnerLocations::build_with_events(
        &owner,
        &mut Context::catalog().with_host_control(&mut observe),
        |event| trace.borrow_mut().push((event, calls.get())),
    )
    .unwrap()
    .unwrap();
    assert!(reference.materialized_node_count().unwrap()>0);
    let trace = trace.into_inner();
    for site in ["roots-reserve", "nodes-reserve", "edges-reserve", "publish"] {
        let at = trace.iter().find(|(name, _)| *name == site).unwrap().1;
        let count = Cell::new(0usize);
        let work = Cell::new(0u64);
        let expected = host_failure();
        let pending = RefCell::new(Some(expected.clone()));
        let mut control = |amount| {
            count.set(count.get() + 1);
            work.set(work.get() + amount as u64);
            if count.get() == at {
                Err(pending.borrow_mut().take().unwrap())
            } else {
                assert!(count.get() < at, "callback after first denial");
                Ok(())
            }
        };
        let events = RefCell::new(Vec::new());
        let mut published = None;
        let mut ctx = Context::catalog().with_host_control(&mut control);
        let failed = (|| {
            published = OwnerLocations::build_with_events(&owner, &mut ctx, |event| {
                events.borrow_mut().push((event, count.get()))
            })?;
            Ok::<(), EngineError>(())
        })()
        .unwrap_err();
        same_host_failure(&failed, &expected);
        assert!(published.is_none());
        assert_eq!(count.get(), at);
        assert_eq!(ctx.charged_work(), work.get());
        let expected_events: Vec<_> = trace
            .iter()
            .copied()
            .filter(|(_, callback)| *callback < at)
            .collect();
        assert_eq!(*events.borrow(), expected_events);
        assert!(!events.borrow().iter().any(|(event, _)| *event == "publish"));
        assert!(Arc::ptr_eq(
            owner.owner_locations.as_ref().unwrap(),
            &installed
        ));
    }
}

#[test]
fn compact_out_of_range_roles_edges_and_scalar_children_decline_without_wrapping() {
    let owner = genuine_owner(false);
    let table = owner.owner_locations.as_ref().unwrap();
    let mut ctx = Context::catalog();
    assert!(table.root(&owner, usize::MAX, &mut ctx).unwrap().is_none());
    let root = table.root(&owner, 0, &mut ctx).unwrap().unwrap();
    assert!(table
        .child(&owner, &root, usize::MAX, &mut ctx)
        .unwrap()
        .is_none());
    let Value::Object(members) = &*owner.schema else {
        panic!("real fixture object")
    };
    let edge = members
        .iter()
        .position(|(k, _)| k == &Utf16::from("type"))
        .unwrap();
    let scalar = table.child(&owner, &root, edge, &mut ctx).unwrap().unwrap();
    assert_eq!(
        table.read(&owner, &scalar, &mut ctx).unwrap(),
        Some(&Value::string_utf8("object"))
    );
    assert!(table.child(&owner, &scalar, 0, &mut ctx).unwrap().is_none());
}

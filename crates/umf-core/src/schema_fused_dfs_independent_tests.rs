// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private child of schema::admitted_structure; H owns include.
//! SOURCE ONLY / NATIVE UNEXECUTED. Direct Traversal calls test its trusted
//! metadata protocol, NOT arbitrary JSON admission or schema validity.
use super::*;
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

#[test]
fn dfs01_authored_preorder_parent_extent_depth_flags_and_generic_oracle() {
    let value = fixture();
    let actual = fused(&value);
    parity(&actual, &original(&value));
    let expected = [
        [NONE, 0, 1, 3, 0, 7, 9, 3],
        [0, 0, 0, 0, 1, 2, 0, 1],
        [0, 1, 3, 2, 1, 6, 8, 3],
        [2, 0, 0, 0, 2, 4, 0, 2],
        [2, 1, 5, 1, 2, 6, 2, 3],
        [4, 0, 0, 0, 3, 6, 0, 3],
        [0, 2, 0, 0, 1, 7, 0, 1],
    ];
    assert_eq!(actual.extent(), expected.len());
    for (i, expected) in expected.iter().enumerate() {
        assert_eq!(&row(actual.node(i).unwrap()), expected);
    }
    let roles = actual.core_role_facts().unwrap();
    assert_eq!(roles.root_id, Some(0));
    assert!(!roles.nested_id);
    assert!(roles.anchors);
    assert_eq!(
        readback(&actual.root().unwrap(), &value, &mut Context::catalog()),
        7
    );
}

#[test]
fn dfs02_scalar_empty_order_and_utf16_key_fixtures_preserve_child_ranges() {
    for value in [
        Value::Null,
        Value::Array(vec![]),
        Value::Object(vec![]),
        Value::Object(vec![
            (Utf16::new(vec![0xd800]), Value::Bool(true)),
            (
                Utf16::from("a/~😀"),
                Value::Array(vec![Value::Number(1.0), Value::string_utf8("x")]),
            ),
            (Utf16::default(), Value::Object(vec![])),
        ]),
    ] {
        let actual = fused(&value);
        parity(&actual, &original(&value));
        assert_eq!(
            readback(&actual.root().unwrap(), &value, &mut Context::catalog()),
            actual.extent()
        );
        assert!(matches!(&actual.records, Records::Framed(_)));
    }
}

#[test]
fn dfs03_member_roles_are_ordered_and_anchor_classification_is_conservative() {
    for (text, root_id, nested, anchor) in [
        (
            r#"{"x":0,"$id":"root","child":{"id":"nested","$dynamicAnchor":"a"}}"#,
            Some(1),
            true,
            true,
        ),
        (
            r#"{"id":"legacy","$id":false,"child":{"$recursiveAnchor":false}}"#,
            None,
            false,
            true,
        ),
        (
            r#"{"$ID":"case-sensitive","$dynamicAnchorX":"not-a-key"}"#,
            None,
            false,
            false,
        ),
    ] {
        let value = json(text);
        let structure = fused(&value);
        parity(&structure, &original(&value));
        let facts = structure.core_role_facts().unwrap();
        assert_eq!(facts.root_id, root_id);
        assert_eq!(facts.nested_id, nested);
        assert_eq!(facts.anchors, anchor);
    }
}

#[test]
fn dfs04_actual_typed_admission_moves_completed_frames_and_immutable_readback() {
    let mut ctx = Context::catalog();
    let input = fixture();
    let (owned, structure) = OwnedCoreOperation::with_context(&mut ctx, |ctx, operation| {
        OwnedCoreJson::admit_factory_resource(
            input.clone(),
            &Utf16::from("coreSchema"),
            operation,
            ctx,
        )?
        .into_core_metadata(operation, ctx)
    })
    .unwrap();
    let structure = structure.unwrap();
    assert_eq!(owned, input);
    assert!(matches!(&structure.records, Records::Framed(_)));
    parity(&structure, &original(&owned));
    let rows: Vec<_> = (0..structure.extent())
        .map(|i| row(structure.node(i).unwrap()))
        .collect();
    let moved = (owned, structure);
    let alias = Arc::clone(&moved.1);
    assert!(Arc::ptr_eq(&alias, &moved.1));
    assert_eq!(
        readback(&alias.root().unwrap(), &moved.0, &mut ctx),
        rows.len()
    );
    assert_eq!(
        rows,
        (0..alias.extent())
            .map(|i| row(alias.node(i).unwrap()))
            .collect::<Vec<_>>()
    );
    assert!(ctx.owned_core_operation.is_none());
}

#[test]
fn dfs05_actual_completed_parser_produces_frames_and_malformed_input_has_no_receipt() {
    let source: Vec<_> = r#"{"a/~\uD83D\uDE00":[null,{"$id":"inner"}],"z":true}"#
        .encode_utf16()
        .collect();
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let receipt = crate::serialization::read_construction_json_completed(&source, ctx)?;
        assert!(receipt.compatible(ctx)?);
        let structure = receipt.structure().unwrap();
        assert!(matches!(&structure.records, Records::Framed(_)));
        parity(structure, &original(receipt.value()));
        assert_eq!(
            readback(&structure.root().unwrap(), receipt.value(), ctx),
            structure.extent()
        );
        assert!(structure.core_role_facts().unwrap().nested_id);
        Ok(())
    })
    .unwrap();
    for bad in [r#"{"a":[0,]}"#, r#"{"a":0,"a":1}"#, r#"{"a":0} false"#] {
        let source: Vec<_> = bad.encode_utf16().collect();
        assert!(ctx
            .with_codegen_construction(
                |ctx| crate::serialization::read_construction_json_completed(&source, ctx)
            )
            .is_err());
        assert!(!ctx.in_codegen_construction());
    }
}

#[test]
fn dfs06_unclosed_frames_never_publish_and_empty_protocol_matches_original() {
    let mut ctx = Context::catalog();
    let mut state = Traversal::default();
    state
        .enter_with_events(&mut ctx, &mut Utf16::default(), &mut |_| {})
        .unwrap();
    let mut events = vec![];
    assert!(state
        .complete_with_events(&mut ctx, &mut |e| events.push(e))
        .unwrap()
        .is_none());
    assert!(!events.contains(&"dfs-structure-publication"));
    // Empty protocol is not a JSON value, but both collectors intentionally
    // produce an empty coordinate object with no root. Do not call it admission.
    let a = Traversal::default()
        .complete_with_events(&mut ctx, &mut |_| {})
        .unwrap()
        .unwrap();
    let b = Builder::default().complete(&mut ctx).unwrap().unwrap();
    parity(&a, &b);
    assert_eq!(a.extent(), 0);
    assert!(a.root().is_none());
}

#[test]
fn dfs07_unbalanced_trusted_calls_poison_without_inventing_input_error_codes() {
    // Original arbitrary-input Builder retains its independent root/parent
    // depth validation. Traversal is not an alternate arbitrary-input validator.
    for (root_depth, child_depth) in [(1, None), (0, Some(2))] {
        let mut ctx = Context::catalog();
        let mut builder = Builder::default();
        let mut path = Utf16::default();
        builder.enter(root_depth, &mut ctx, &mut path).unwrap();
        if let Some(depth) = child_depth {
            builder.enter(depth, &mut ctx, &mut path).unwrap();
        }
        assert!(builder.complete(&mut ctx).unwrap().is_none());
    }
    for member in [false, true] {
        let mut state = Traversal::default();
        let mut ctx = Context::catalog();
        let mut path = Utf16::default();
        let outcome = catch_unwind(AssertUnwindSafe(|| {
            if member {
                state
                    .member_with_events(
                        0,
                        &Utf16::from("$id"),
                        true,
                        &mut ctx,
                        &mut path,
                        &mut |_| {},
                    )
                    .unwrap();
            } else {
                state
                    .leave_with_events(&mut ctx, &mut path, &mut |_| {})
                    .unwrap();
            }
        }));
        assert!(outcome.is_err());
        let before = ctx.charged_work();
        assert!(state
            .complete_with_events(&mut ctx, &mut |_| panic!("poison published"))
            .unwrap()
            .is_none());
        assert_eq!(ctx.charged_work(), before);
    }
}

#[test]
fn dfs08_every_actual_callback_group_denies_before_effect_and_cannot_resume() {
    let value = fixture();
    let calls = Cell::new(0usize);
    let events = RefCell::new(vec![]);
    let mut control = |_: usize| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    let mut ctx = Context::catalog().with_host_control(&mut control);
    let mut state = Traversal::default();
    let mut event = |label| events.borrow_mut().push((calls.get(), label));
    walk_fused(&value, &mut state, &mut ctx, &mut event).unwrap();
    state
        .complete_with_events(&mut ctx, &mut event)
        .unwrap()
        .unwrap();
    let trace = events.into_inner();
    for label in [
        "dfs-slot-growth",
        "dfs-frame-growth",
        "dfs-frame-enter",
        "dfs-member-facts",
        "dfs-record-complete",
        "dfs-child-return",
        "dfs-structure-publication",
    ] {
        assert!(trace.iter().any(|(_, e)| *e == label), "unreached {label}");
    }
    // The baseline records the actual callback group for each effect. Multiple
    // effects may share a debit; no one-callback-per-event assumption is made.
    for deny in 1..=calls.get() {
        let seen_calls = Cell::new(0usize);
        let mut control = |_: usize| {
            let n = seen_calls.get() + 1;
            seen_calls.set(n);
            assert!(n <= deny, "callback after first denial");
            if n == deny {
                Err(host_error())
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::catalog().with_host_control(&mut control);
        let mut state = Traversal::default();
        let mut seen = vec![];
        let mut event = |label| seen.push((seen_calls.get(), label));
        let result = walk_fused(&value, &mut state, &mut ctx, &mut event);
        let error = match result {
            Err(error) => {
                assert!(state
                    .complete_with_events(&mut ctx, &mut event)
                    .unwrap()
                    .is_none());
                error
            }
            Ok(()) => state
                .complete_with_events(&mut ctx, &mut event)
                .unwrap_err(),
        };
        exact_host(&error);
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

#[test]
fn dfs09_observer_unwind_at_final_row_or_merge_never_publishes_partial_records() {
    for target in [
        "dfs-slot-growth",
        "dfs-frame-enter",
        "dfs-record-complete",
        "dfs-child-return",
    ] {
        let mut state = Traversal::default();
        let mut ctx = Context::catalog();
        let mut seen = vec![];
        let outcome = catch_unwind(AssertUnwindSafe(|| {
            ctx.with_codegen_construction(|ctx| {
                walk_fused(&fixture(), &mut state, ctx, &mut |label| {
                    seen.push(label);
                    if label == target {
                        panic!("observer unwind");
                    }
                })
            })
            .unwrap();
        }));
        assert!(outcome.is_err());
        assert!(!ctx.in_codegen_construction());
        assert_eq!(seen.last(), Some(&target));
        let before = ctx.charged_work();
        assert!(before > 0, "unwind must not reset cumulative work");
        assert!(state
            .complete_with_events(&mut ctx, &mut |_| panic!("post-unwind effect"))
            .unwrap()
            .is_none());
        assert_eq!(ctx.charged_work(), before);
        parity(&fused(&Value::Null), &original(&Value::Null));
    }
}

#[test]
fn dfs10_reentrant_real_typed_admission_is_isolated_and_first_host_error_survives() {
    let calls = Cell::new(0usize);
    let nested_rows = RefCell::new(None);
    let mut control = |_: usize| {
        calls.set(calls.get() + 1);
        assert!(calls.get() <= 2, "callback after denial");
        if calls.get() == 1 {
            let mut nested = Context::catalog();
            let (value, structure) =
                OwnedCoreOperation::with_context(&mut nested, |ctx, operation| {
                    OwnedCoreJson::admit_factory_resource(
                        json(r#"{"child":[1,true]}"#),
                        &Utf16::from("coreSchema"),
                        operation,
                        ctx,
                    )?
                    .into_core_metadata(operation, ctx)
                })?;
            let structure = structure.unwrap();
            parity(&structure, &original(&value));
            *nested_rows.borrow_mut() = Some((value, structure));
            assert!(nested.owned_core_operation.is_none());
            Ok(())
        } else {
            Err(host_error())
        }
    };
    let mut ctx = Context::catalog().with_host_control(&mut control);
    let mut state = Traversal::default();
    let error = walk_fused(&fixture(), &mut state, &mut ctx, &mut |_| {}).unwrap_err();
    exact_host(&error);
    assert!(state
        .complete_with_events(&mut ctx, &mut |_| panic!("partial publication"))
        .unwrap()
        .is_none());
    assert_eq!(calls.get(), 2);
    let nested = nested_rows.borrow();
    let (value, structure) = nested.as_ref().unwrap();
    assert_eq!(
        readback(&structure.root().unwrap(), value, &mut Context::catalog()),
        4
    );
}

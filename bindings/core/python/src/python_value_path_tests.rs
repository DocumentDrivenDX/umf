// SPDX-License-Identifier: MIT OR Apache-2.0
//! SOURCE ONLY; separate cfg(test) child of binding python_value module.
//! Actual conversion path helpers + actual Context, no model resolver/codec.
use super::*;
use std::cell::{Cell, RefCell};

#[test]
fn unicode_suffixes_restore_one_buffer_without_changing_parent_or_sibling_paths() {
    let mut path = Utf16::from("/root");
    let mut ctx = Context::ordinary();
    let before = path.clone();
    let parent = resource_path_push(&mut path, &Utf16::from("a/~😀"), &mut ctx).unwrap();
    assert_eq!(path, Utf16::from("/root/a~1~0😀"));
    let child_parent = resource_path_push(&mut path, &Utf16::new(vec![0xd800]), &mut ctx).unwrap();
    assert_eq!(
        path.units(),
        &[47, 114, 111, 111, 116, 47, 97, 126, 49, 126, 48, 0xd83d, 0xde00, 47, 0xd800]
    );
    resource_path_truncate(&mut path, child_parent);
    assert_eq!(path, Utf16::from("/root/a~1~0😀"));
    resource_path_truncate(&mut path, parent);
    assert_eq!(path, before);
    let second_parent = resource_path_push(&mut path, &Utf16::from("z"), &mut ctx).unwrap();
    assert_eq!(path, Utf16::from("/root/z"));
    resource_path_truncate(&mut path, second_parent);
    assert_eq!(path, before);
}

#[test]
fn adequate_capacity_reuses_the_same_allocation_and_restores_prefix() {
    let mut units = Vec::with_capacity(64);
    units.extend_from_slice(&[47, 112]);
    let pointer = units.as_ptr();
    let mut path = Utf16::new(units);
    let mut ctx = Context::ordinary();
    let parent = resource_path_push(&mut path, &Utf16::from("a/~"), &mut ctx).unwrap();
    assert_eq!(path, Utf16::from("/p/a~1~0"));
    assert_eq!(path.units().as_ptr(), pointer);
    resource_path_truncate(&mut path, parent);
    assert_eq!(path, Utf16::from("/p"));
    assert_eq!(path.units().as_ptr(), pointer);
}

#[test]
fn growth_refusal_precedes_append_and_preserves_exact_host_failure_without_later_callbacks() {
    let mut units = Vec::with_capacity(2);
    units.extend_from_slice(&[47, 112]);
    assert_eq!(units.capacity(), 2);
    let pointer = units.as_ptr();
    let mut path = Utf16::new(units);
    let original = path.clone();
    let expected = Utf16::from("/p/a~1~0");
    // Allocation request plus relocation of the CURRENT prefix, derived from
    // this fixture's exact material, not a historical total/cost constant.
    let growth_charge = expected.len() + original.len();
    let denied = Cell::new(false);
    let after = Cell::new(0usize);
    let trace = RefCell::new(Vec::new());
    let mut control = |n| {
        trace.borrow_mut().push(n);
        if denied.get() {
            after.set(after.get() + 1);
        }
        if n == growth_charge {
            denied.set(true);
            return Err(EngineError::new(
                "CANCELLED",
                Utf16::from("/host/exact"),
                "first growth denial",
            ));
        }
        Ok(())
    };
    let mut ctx = Context::ordinary().with_host_control(&mut control);
    let error = resource_path_push(&mut path, &Utf16::from("a/~"), &mut ctx).unwrap_err();
    assert!(
        denied.get(),
        "Actual capacity-growth admission was not reached"
    );
    assert_eq!(error.code, "CANCELLED");
    assert_eq!(error.path, Utf16::from("/host/exact"));
    assert_eq!(error.message, Utf16::from("first growth denial"));
    assert!(error.is_control_failure());
    assert_eq!(after.get(), 0);
    assert_eq!(trace.borrow().last(), Some(&growth_charge));
    assert_eq!(
        ctx.charged_work(),
        trace.borrow().iter().map(|n| *n as u64).sum::<u64>()
    );
    assert_eq!(path, original); // Host error must NOT consume/replace this buffer.
    assert_eq!(path.units().as_ptr(), pointer); // No reserve/relocation occurred.
}

#[test]
fn local_cancellation_takes_existing_prefix_before_any_suffix_is_written() {
    let mut path = Utf16::from("/root");
    let original = path.clone();
    let pointer = path.units().as_ptr();
    let calls = Cell::new(0usize);
    let mut cancel = || {
        calls.set(calls.get() + 1);
        true
    };
    let mut ctx = Context::ordinary().with_cancellation(&mut cancel);
    let error = resource_path_push(&mut path, &Utf16::from("child"), &mut ctx).unwrap_err();
    assert_eq!(error.code, "CANCELLED");
    assert_eq!(error.path, original);
    assert_eq!(error.path.units().as_ptr(), pointer);
    assert!(path.is_empty());
    assert_eq!(calls.get(), 1);
    assert!(error.is_control_failure());
}

#[test]
fn reentrant_other_conversion_path_cannot_replace_outer_buffer_or_outer_first_error() {
    let mut outer = Utf16::from("/outer");
    let original = outer.clone();
    let entered = Cell::new(false);
    let after = Cell::new(0usize);
    let mut control = |_| {
        if entered.replace(true) {
            after.set(after.get() + 1);
        }
        let mut nested = Utf16::from("/nested");
        let mut ctx = Context::ordinary();
        let parent = resource_path_push(&mut nested, &Utf16::from("/~"), &mut ctx)?;
        assert_eq!(nested, Utf16::from("/nested/~1~0"));
        resource_path_truncate(&mut nested, parent);
        assert_eq!(nested, Utf16::from("/nested"));
        Err(EngineError::new(
            "DEADLINE",
            Utf16::from("/first/outer"),
            "outer host denial",
        ))
    };
    let mut ctx = Context::ordinary().with_host_control(&mut control);
    let error = resource_path_push(&mut outer, &Utf16::from("child"), &mut ctx).unwrap_err();
    assert!(entered.get());
    assert_eq!(after.get(), 0);
    assert_eq!(error.code, "DEADLINE");
    assert_eq!(error.path, Utf16::from("/first/outer"));
    assert_eq!(error.message, Utf16::from("outer host denial"));
    assert_eq!(outer, original);
}

#[test]
fn local_deadline_takes_existing_prefix_and_stops_before_append() {
    let mut path = Utf16::from("/deadline");
    let original = path.clone();
    let pointer = path.units().as_ptr();
    let calls = Cell::new(0usize);
    let mut clock = || {
        calls.set(calls.get() + 1);
        Some(11u64)
    };
    let mut ctx = Context::ordinary().with_clock(&mut clock, 10);
    let error = resource_path_push(&mut path, &Utf16::from("child"), &mut ctx).unwrap_err();
    assert_eq!(error.code, "DEADLINE");
    assert_eq!(error.path, original);
    assert_eq!(error.path.units().as_ptr(), pointer);
    assert!(path.is_empty());
    assert_eq!(calls.get(), 1);
    assert!(error.is_control_failure());
}

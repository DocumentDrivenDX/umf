// SPDX-License-Identifier: MIT OR Apache-2.0
//! Owner controls for the exact borrowed-scratch charge contract.
use super::*;
use std::cell::RefCell;

fn path() -> Utf16 {
    Utf16::new(vec![47, 126, 47, 0xd800])
}
#[test]
fn success_and_zero_leave_admitted_buffer_unchanged() {
    let mut p = path();
    let before = p.clone();
    let address = p.units().as_ptr();
    let seen = RefCell::new(Vec::new());
    let mut meter = |n| {
        seen.borrow_mut().push(n);
        Ok(())
    };
    let mut ctx = Context::ordinary().with_host_control(&mut meter);
    ctx.charge_work_with_path(3, &mut p).unwrap();
    ctx.charge_work_with_path(0, &mut p).unwrap();
    assert_eq!(p, before);
    assert_eq!(p.units().as_ptr(), address);
    assert_eq!(ctx.charged_work(), 3);
    drop(ctx);
    assert_eq!(*seen.borrow(), vec![3, 0]);
}
#[test]
fn overflow_moves_exact_storage_and_matches_owned_error() {
    let mut a = Context::ordinary();
    a.charge_work_u64(u64::MAX, Utf16::default()).unwrap();
    let old = a.charge_work(1, path()).unwrap_err();
    let mut b = Context::ordinary();
    b.charge_work_u64(u64::MAX, Utf16::default()).unwrap();
    let mut p = path();
    let address = p.units().as_ptr();
    let actual = b.charge_work_with_path(1, &mut p).unwrap_err();
    assert_eq!(actual, old);
    assert_eq!(actual.code, "LIMIT");
    assert_eq!(actual.message, Utf16::from("Work counter overflow"));
    assert!(p.is_empty());
    assert_eq!(actual.path.units().as_ptr(), address);
    assert_eq!(b.charged_work(), u64::MAX);
}
#[test]
fn local_cancel_and_deadline_move_paths_with_exact_diagnostics() {
    for mode in 0..5 {
        fn execute(mode: usize, scratch: bool) -> (EngineError, Utf16, bool) {
            let mut cancel = || true;
            let mut yes = || Some(2);
            let mut none = || None;
            let mut fallible = || Ok(None);
            let mut ctx = Context::ordinary();
            match mode {
                0 => ctx = ctx.with_cancellation(&mut cancel),
                1 => ctx = ctx.with_clock(&mut yes, 1),
                2 => ctx.deadline_ms = Some(1),
                3 => ctx = ctx.with_clock(&mut none, 1),
                _ => ctx = ctx.with_fallible_clock(&mut fallible, 1),
            }
            let mut p = path();
            let address = p.units().as_ptr();
            let error = if scratch {
                ctx.charge_work_with_path(1, &mut p)
            } else {
                ctx.charge_work(1, p.clone())
            }
            .unwrap_err();
            let moved = error.path.units().as_ptr() == address;
            (error, p, moved)
        }
        let (old, _, _) = execute(mode, false);
        let (actual, p, moved) = execute(mode, true);
        assert_eq!(actual, old);
        assert!(actual.is_control_failure());
        assert!(p.is_empty());
        assert!(moved);
        let (code, message) = match mode {
            0 => ("CANCELLED", "Operation cancelled"),
            1 => ("DEADLINE", "Deadline elapsed"),
            2 => (
                "CLOCK_CAPABILITY_REQUIRED",
                "Host clock capability is required for deadline requests",
            ),
            _ => (
                "CLOCK_CAPABILITY_REQUIRED",
                "Host clock capability did not return a time",
            ),
        };
        assert_eq!(actual.code, code);
        assert_eq!(actual.message, Utf16::from(message));
    }
}
#[test]
fn host_error_preserves_fields_and_from_host_origin_without_consuming_scratch() {
    let mut template = EngineError::new("SCHEMA_REF_UNRESOLVED", Utf16::from("/host"), "host text")
        .with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference);
    template.python_message_origin = Some(crate::PyText::from_codepoints(vec![0xd800]).unwrap());
    let expected = EngineError::from_host(template.clone());
    let calls = RefCell::new(Vec::new());
    let mut host = |_| {
        calls.borrow_mut().push("host");
        Err(template.clone())
    };
    let mut cancel = || {
        calls.borrow_mut().push("cancel");
        false
    };
    let mut clock = || {
        calls.borrow_mut().push("clock");
        Some(0)
    };
    let mut ctx = Context::ordinary()
        .with_host_control(&mut host)
        .with_cancellation(&mut cancel)
        .with_clock(&mut clock, 1);
    let mut p = path();
    let address = p.units().as_ptr();
    let before = p.clone();
    let error = ctx.charge_work_with_path(1, &mut p).unwrap_err();
    assert_eq!(error, expected);
    assert!(error.is_control_failure());
    assert!(!error.is_python_schema_terminal());
    assert_eq!(p, before);
    assert_eq!(p.units().as_ptr(), address);
    drop(ctx);
    assert_eq!(*calls.borrow(), vec!["host"]);
}
#[test]
#[cfg(target_pointer_width = "64")]
fn wide_and_zero_order_match_owned_state_machine() {
    fn run(scratch: bool) -> (Vec<(&'static str, usize)>, u64) {
        let events = RefCell::new(Vec::new());
        let mut meter = |n| {
            events.borrow_mut().push(("meter", n));
            Ok(())
        };
        let mut host = |n| {
            events.borrow_mut().push(("host", n));
            Ok(())
        };
        let mut cancel = || {
            events.borrow_mut().push(("cancel", 0));
            false
        };
        let mut clock = || {
            events.borrow_mut().push(("clock", 0));
            Some(0)
        };
        let mut ctx = Context::ordinary()
            .with_meter(&mut meter)
            .with_host_control(&mut host)
            .with_cancellation(&mut cancel)
            .with_clock(&mut clock, 1);
        let mut p = path();
        for n in [0, u32::MAX as usize + 1] {
            if scratch {
                ctx.charge_work_with_path(n, &mut p).unwrap();
            } else {
                ctx.charge_work_u64(n as u64, p.clone()).unwrap();
            }
        }
        let total = ctx.charged_work();
        drop(ctx);
        (events.into_inner(), total)
    }
    let (a, total) = run(true);
    assert_eq!((a.clone(), total), run(false));
    assert_eq!(
        a,
        vec![
            ("meter", 0),
            ("host", 0),
            ("cancel", 0),
            ("clock", 0),
            ("meter", u32::MAX as usize),
            ("host", u32::MAX as usize),
            ("cancel", 0),
            ("clock", 0),
            ("meter", 1),
            ("host", 1),
            ("cancel", 0),
            ("clock", 0)
        ]
    );
}
#[test]
fn nested_context_and_scratch_failure_are_isolated() {
    let calls = RefCell::new(0usize);
    let mut host = |_| {
        *calls.borrow_mut() += 1;
        let mut stop = || true;
        let mut nested = Context::ordinary().with_cancellation(&mut stop);
        let mut p = Utf16::from("/nested");
        let error = nested.charge_work_with_path(1, &mut p).unwrap_err();
        assert_eq!(error.path, Utf16::from("/nested"));
        assert!(p.is_empty());
        Ok(())
    };
    let mut ctx = Context::ordinary().with_host_control(&mut host);
    let mut p = path();
    let before = p.clone();
    ctx.charge_work_with_path(1, &mut p).unwrap();
    assert_eq!(p, before);
    drop(ctx);
    assert_eq!(*calls.borrow(), 1);
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! AP1 decoded ownership/path-stack SOURCE controls. Native UNEXECUTED.
//! Private child of serialization.rs; H owns production and include wiring.
use super::*;
use std::cell::{Cell, RefCell};
use std::rc::Rc;

type Trace = Vec<(&'static str, usize)>;
fn units(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}
fn original(source: &[u16]) -> Result<Value, EngineError> {
    read_json_value(source, Format::Json, &mut Context::catalog())
}
fn run(
    source: &[u16],
    ctx: &mut Context<'_>,
    event: &mut dyn FnMut(&'static str),
) -> Result<Value, EngineError> {
    ctx.with_codegen_construction(|ctx| {
        read_construction_json_owned_with_events(source, ctx, event)
    })
}
fn plain(source: &[u16], ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.with_codegen_construction(|ctx| read_construction_json_owned(source, ctx))
}
fn measured(source: &[u16]) -> (Value, Trace, Vec<usize>) {
    let calls = Cell::new(0usize);
    let effects = RefCell::new(Vec::new());
    let work = RefCell::new(Vec::new());
    let mut meter = |n| {
        calls.set(calls.get() + 1);
        work.borrow_mut().push(n);
        Ok(())
    };
    let mut event = |name| effects.borrow_mut().push((name, calls.get()));
    let value = run(
        source,
        &mut Context::catalog().with_meter(&mut meter),
        &mut event,
    )
    .unwrap();
    (value, effects.into_inner(), work.into_inner())
}
fn host_error() -> EngineError {
    let mut e = EngineError::new(
        "CANCELLED",
        Utf16::new(vec![47, 0xd800, 126]),
        "original host-owned decode/stack refusal",
    );
    e.python_message_origin = Some(PyText::from_utf8("decode-stack-δ"));
    e.with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference)
}
fn host_fields(a: &EngineError, b: &EngineError) {
    assert_eq!(a.code, b.code);
    assert_eq!(a.path, b.path);
    assert_eq!(a.message, b.message);
    assert_eq!(a.python_message_origin, b.python_message_origin);
    assert!(a.is_control_failure());
    assert!(!a.is_python_schema_terminal());
}
fn long_fixture() -> Vec<u16> {
    units(
        r#"{"parent":{"long-child-with-slash/tilde~and-many-units-to-force-relocation":{"leaf":["abcdefghijklmnopqrstuvwxyz0123456789"]}},"sibling":[null,true]}"#,
    )
}
fn assert_event_denials(source: &[u16], sites: &[&str]) {
    let (_, trace, _) = measured(source);
    for site in sites {
        let positions: Vec<_> = trace
            .iter()
            .filter(|(name, _)| name == site)
            .map(|(_, n)| *n)
            .collect();
        assert!(!positions.is_empty(), "actual site must be reached: {site}");
        for target in [positions[0], *positions.last().unwrap()] {
            let calls = Cell::new(0usize);
            let effects = RefCell::new(Vec::new());
            let error = host_error();
            let mut meter = |_| {
                calls.set(calls.get() + 1);
                if calls.get() == target {
                    Err(error.clone())
                } else {
                    Ok(())
                }
            };
            let mut event = |name| effects.borrow_mut().push((name, calls.get()));
            let mut ctx = Context::catalog().with_meter(&mut meter);
            let actual = run(source, &mut ctx, &mut event).unwrap_err();
            host_fields(&actual, &error);
            assert_eq!(calls.get(), target, "no callback after first denial");
            let prefix: Vec<_> = trace
                .iter()
                .copied()
                .filter(|(_, at)| *at < target)
                .collect();
            assert_eq!(
                *effects.borrow(),
                prefix,
                "all same-admission markers must disappear together"
            );
            assert!(ctx.schema_construction.is_none());
            // Appended/restored are completed-operation markers, not preeffects.
            // No claim of reversing earlier effects is made on terminal refusal.
            assert!(
                !effects
                    .borrow()
                    .iter()
                    .any(|(name, _)| *name == "owned-publication")
            );
        }
    }
}

#[test]
fn exact_literal_decoded_units_reach_owned_route_while_generic_fallback_emits_none() {
    let cases = [
        (r#""""#, vec![]),
        (
            r#""\u0000\u00ff\u0100\u1234\uffff""#,
            vec![0, 0xff, 0x100, 0x1234, 0xffff],
        ),
        (r#""\"\\\/\b\f\n\r\t""#, vec![34, 92, 47, 8, 12, 10, 13, 9]),
        (r#""\ud800""#, vec![0xd800]),
        (r#""\udc00""#, vec![0xdc00]),
        (r#""\ud83d\ude00""#, vec![0xd83d, 0xde00]),
        (r#""\udc00\ud800""#, vec![0xdc00, 0xd800]),
        (r#""☃😀""#, vec![0x2603, 0xd83d, 0xde00]),
    ];
    for (text, expected) in cases {
        let source = units(text);
        let (value, trace, work) = measured(&source);
        assert_eq!(value, Value::String(Utf16::new(expected.clone())));
        assert_eq!(value, original(&source).unwrap());
        assert_eq!(
            trace
                .iter()
                .filter(|(name, _)| *name == "decoded-store")
                .count(),
            expected.len()
        );
        assert_eq!(
            trace
                .iter()
                .filter(|(name, _)| *name == "decoded-publication")
                .count(),
            1
        );
        let generic = RefCell::new(Vec::new());
        let mut event = |name| generic.borrow_mut().push(name);
        let fallback =
            read_construction_json_owned_with_events(&source, &mut Context::catalog(), &mut event)
                .unwrap();
        assert_eq!(fallback, value);
        assert!(generic.borrow().is_empty());
        let charges = RefCell::new(Vec::new());
        let mut meter = |n| {
            charges.borrow_mut().push(n);
            Ok(())
        };
        assert_eq!(
            plain(&source, &mut Context::catalog().with_meter(&mut meter)).unwrap(),
            value
        );
        assert_eq!(work, *charges.borrow());
    }
    for raw in [
        vec![0xd800],
        vec![0xdc00],
        vec![0xd83d, 0xde00],
        vec![0xdc00, 0xd800],
        vec![0x100, 0x1234],
    ] {
        let mut source = vec![34];
        source.extend_from_slice(&raw);
        source.push(34);
        let (value, _, _) = measured(&source);
        assert_eq!(value, Value::String(Utf16::new(raw)));
        assert_eq!(value, original(&source).unwrap());
    }
}

#[test]
fn newly_decoded_raw_escaped_duplicate_keys_refuse_before_hostile_children() {
    for (raw, escaped) in [
        (vec![0xd800], r#"\ud800"#),
        (vec![0xd83d, 0xde00], r#"\ud83d\ude00"#),
        (vec![0xdc00, 0xd800], r#"\udc00\ud800"#),
    ] {
        let mut source = units("{\"");
        source.extend_from_slice(&raw);
        source.extend(units("\":0,\""));
        source.extend(units(escaped));
        source.extend(units("\":[{}"));
        let effects = RefCell::new(Vec::new());
        let mut event = |name| effects.borrow_mut().push(name);
        let error = run(&source, &mut Context::catalog(), &mut event).unwrap_err();
        let expected = original(&source).unwrap_err();
        assert_eq!(error, expected);
        assert_eq!(error.code, "DUPLICATE_KEY");
        assert!(error.path.units().is_empty());
        assert_eq!(error.message, Utf16::from("Duplicate object key"));
        assert_eq!(
            effects
                .borrow()
                .iter()
                .filter(|name| **name == "path-appended")
                .count(),
            1,
            "only first value entered"
        );
        assert_eq!(
            effects
                .borrow()
                .iter()
                .filter(|name| **name == "decoded-publication")
                .count(),
            2,
            "both keys fully decoded"
        );
        assert!(!effects.borrow().contains(&"owned-publication"));
    }
    let source = units(r#"{"x":-0,"\u0078":null}"#);
    let error = plain(&source, &mut Context::catalog()).unwrap_err();
    assert_eq!(error, original(&source).unwrap_err());
    assert_eq!(error.code, "NUMBER");
    assert_eq!(error.path, Utf16::from("/x"));
}

#[test]
fn sibling_parent_stack_restoration_preserves_literal_values_and_original_error_paths() {
    let source = units(r#"{"a/b~":[{"":true},[]],"tail":{"~x":"z"}}"#);
    let expected = Value::Object(vec![
        (
            Utf16::from("a/b~"),
            Value::Array(vec![
                Value::Object(vec![(Utf16::default(), Value::Bool(true))]),
                Value::Array(vec![]),
            ]),
        ),
        (
            Utf16::from("tail"),
            Value::Object(vec![(Utf16::from("~x"), Value::string_utf8("z"))]),
        ),
    ]);
    let (value, trace, _) = measured(&source);
    assert_eq!(value, expected);
    assert_eq!(value, original(&source).unwrap());
    assert_eq!(
        trace
            .iter()
            .filter(|(name, _)| *name == "path-appended")
            .count(),
        trace
            .iter()
            .filter(|(name, _)| *name == "path-restored")
            .count()
    );
    for (text, code, path, message) in [
        (
            r#"{"a":[{"b":0}],"later":[0,-0]}"#,
            "NUMBER",
            "/later/1",
            "Number outside the core interoperable numeric profile",
        ),
        (
            r#"{"a":{"b":0}!}"#,
            "SYNTAX",
            "",
            "Expected comma or closing brace",
        ),
        (
            r#"[{"a":0}! ]"#,
            "SYNTAX",
            "",
            "Expected comma or closing bracket",
        ),
        (
            r#"{"first":{"x":0},"a/b~":[{"z":01}]}"#,
            "SYNTAX",
            "/a~1b~0/0/z",
            "Leading zero in JSON number",
        ),
    ] {
        let source = units(text);
        let error = plain(&source, &mut Context::catalog()).unwrap_err();
        assert_eq!(error, original(&source).unwrap_err());
        assert_eq!(error.code, code);
        assert_eq!(error.path, Utf16::from(path));
        assert_eq!(error.message, Utf16::from(message));
    }
    let source = units(r#"{"\ud800":{"a/b~":-0}}"#);
    let error = plain(&source, &mut Context::catalog()).unwrap_err();
    assert_eq!(error, original(&source).unwrap_err());
    assert_eq!(
        error.path.units(),
        &[47, 0xd800, 47, 97, 126, 49, 98, 126, 48]
    );
}

#[test]
fn decimal_array_indices_cross_ten_and_restore_after_completed_siblings() {
    let source = units(
        r#"{"a/b~":[null,null,null,null,null,null,null,null,null,null,null,null],"after":true}"#,
    );
    let (value, trace, _) = measured(&source);
    assert_eq!(value, original(&source).unwrap());
    assert_eq!(
        trace
            .iter()
            .filter(|(name, _)| *name == "array-index-format")
            .count(),
        12
    );
    let bad = units(r#"{"a/b~":[null,null,null,null,null,null,null,null,null,null,null,-0]}"#);
    let error = plain(&bad, &mut Context::catalog()).unwrap_err();
    assert_eq!(error, original(&bad).unwrap_err());
    assert_eq!(error.code, "NUMBER");
    assert_eq!(error.path, Utf16::from("/a~1b~0/11"));
    assert_event_denials(&source, &["array-index-format"]);
}

#[test]
fn decoded_growth_store_and_publication_precharges_are_terminal_in_shared_groups() {
    assert_event_denials(
        &long_fixture(),
        &["decoded-growth", "decoded-store", "decoded-publication"],
    );
    let mut source = units(r#""abcdefghijklmnopqrstuvwxyz0123456789""#);
    let output = plain(&source, &mut Context::catalog()).unwrap();
    source.fill(0);
    drop(source);
    let Value::String(text) = &output else {
        panic!("owned decoded string")
    };
    let mut exposed = text.clone().into_units();
    exposed[0] = 0x58;
    assert_eq!(text.units(), units("abcdefghijklmnopqrstuvwxyz0123456789"));
    assert_ne!(exposed.as_slice(), text.units());
    // This is mutation isolation, NOT a pointer-lifetime/buffer-move observation.
}

#[test]
fn suffix_growth_relocation_write_and_completed_restore_denials_use_actual_helper() {
    let source = long_fixture();
    let (_, trace, _) = measured(&source);
    let growth: Vec<_> = trace
        .iter()
        .filter(|(name, _)| *name == "path-growth")
        .map(|(_, at)| *at)
        .collect();
    let relocation: Vec<_> = trace
        .iter()
        .filter(|(name, _)| *name == "path-relocation")
        .map(|(_, at)| *at)
        .collect();
    assert!(!growth.is_empty());
    assert_eq!(
        growth, relocation,
        "reserve and relocation share their existing precharge"
    );
    let mut depth = 0usize;
    let mut relocated_parent = false;
    for (name, _) in &trace {
        match *name {
            "path-appended" => depth += 1,
            "path-restored" => depth -= 1,
            "path-relocation" if depth > 0 => relocated_parent = true,
            _ => {}
        }
    }
    assert!(
        relocated_parent,
        "fixture must relocate a nonempty active parent"
    );
    assert_event_denials(
        &source,
        &[
            "path-growth",
            "path-relocation",
            "path-write",
            "path-appended",
            "path-restored",
        ],
    );
}

#[test]
fn shared_path_detach_is_paid_and_preserves_the_retained_alias_on_refusal() {
    let shared = Utf16::from("/root").into_shared();
    let retained = shared.clone();
    let segment = Utf16::new(vec![97, 47, 98, 126, 0xd800]);
    let calls = Cell::new(0usize);
    let trace = RefCell::new(Vec::new());
    let work = RefCell::new(Vec::new());
    let mut meter = |n| {
        calls.set(calls.get() + 1);
        work.borrow_mut().push(n);
        Ok(())
    };
    let mut event = |name| trace.borrow_mut().push((name, calls.get()));
    let mut value = shared.clone();
    let original = value
        .push_owned_path_segment_with_events(
            &segment,
            &mut Context::catalog().with_meter(&mut meter),
            &mut event,
        )
        .unwrap();
    assert_eq!(original, retained.len());
    assert_eq!(
        value.units(),
        &[47, 114, 111, 111, 116, 47, 97, 126, 49, 98, 126, 48, 0xd800]
    );
    assert_eq!(retained, Utf16::from("/root"));
    assert_ne!(
        value.units().as_ptr(),
        retained.units().as_ptr(),
        "both live owners demonstrate shared detach, not decoded move"
    );
    value
        .restore_owned_path(original, &mut Context::catalog())
        .unwrap();
    assert_eq!(value, retained);
    let trace = trace.into_inner();
    let growth = trace
        .iter()
        .find(|(name, _)| *name == "path-growth")
        .unwrap()
        .1;
    let relocation = trace
        .iter()
        .find(|(name, _)| *name == "path-relocation")
        .unwrap()
        .1;
    assert_eq!(growth, relocation);
    let charges = RefCell::new(Vec::new());
    let mut meter = |n| {
        charges.borrow_mut().push(n);
        Ok(())
    };
    let mut other = shared.clone();
    other
        .push_owned_path_segment(&segment, &mut Context::catalog().with_meter(&mut meter))
        .unwrap();
    assert_eq!(*charges.borrow(), *work.borrow());
    for target in [
        growth,
        trace
            .iter()
            .find(|(name, _)| *name == "path-write")
            .unwrap()
            .1,
    ] {
        let calls = Cell::new(0usize);
        let effects = RefCell::new(Vec::new());
        let wanted = host_error();
        let mut deny = |_| {
            calls.set(calls.get() + 1);
            if calls.get() == target {
                Err(wanted.clone())
            } else {
                Ok(())
            }
        };
        let mut event = |name| effects.borrow_mut().push((name, calls.get()));
        let mut candidate = shared.clone();
        let error = candidate
            .push_owned_path_segment_with_events(
                &segment,
                &mut Context::catalog().with_meter(&mut deny),
                &mut event,
            )
            .unwrap_err();
        host_fields(&error, &wanted);
        assert_eq!(calls.get(), target);
        assert_eq!(candidate, retained);
        assert_eq!(shared, retained);
        assert_eq!(
            *effects.borrow(),
            trace
                .iter()
                .copied()
                .filter(|(_, at)| *at < target)
                .collect::<Vec<_>>()
        );
    }
}

#[test]
fn cancellation_deadline_and_host_fields_keep_the_current_complete_path_without_afterwork() {
    let source = units(r#"{"a/b~":["long decoded value"]}"#);
    let (_, trace, _) = measured(&source);
    let target = trace
        .iter()
        .rev()
        .find(|(name, _)| *name == "decoded-store")
        .unwrap()
        .1;
    for mode in 0..5 {
        let calls = Cell::new(0usize);
        let controls = Cell::new(0usize);
        let effects = RefCell::new(Vec::new());
        let wanted = host_error();
        let mut meter = |_| {
            calls.set(calls.get() + 1);
            Ok(())
        };
        let mut event = |name| effects.borrow_mut().push((name, calls.get()));
        let mut cancel = || {
            controls.set(controls.get() + 1);
            calls.get() == target
        };
        let mut deadline = || {
            controls.set(controls.get() + 1);
            Some(if calls.get() == target { 11 } else { 0 })
        };
        let mut host = |_| {
            controls.set(controls.get() + 1);
            if calls.get() == target {
                Err(wanted.clone())
            } else {
                Ok(())
            }
        };
        let mut fallible_cancel = || {
            controls.set(controls.get() + 1);
            if calls.get() == target {
                Err(wanted.clone())
            } else {
                Ok(false)
            }
        };
        let mut fallible_clock = || {
            controls.set(controls.get() + 1);
            if calls.get() == target {
                Err(wanted.clone())
            } else {
                Ok(Some(0))
            }
        };
        let base = Context::catalog().with_meter(&mut meter);
        let mut ctx = match mode {
            0 => base.with_cancellation(&mut cancel),
            1 => base.with_clock(&mut deadline, 10),
            2 => base.with_host_control(&mut host),
            3 => base.with_fallible_cancellation(&mut fallible_cancel),
            4 => base.with_fallible_clock(&mut fallible_clock, 10),
            _ => unreachable!(),
        };
        let error = run(&source, &mut ctx, &mut event).unwrap_err();
        assert_eq!(calls.get(), target);
        assert_eq!(controls.get(), target);
        if mode < 2 {
            assert_eq!(error.code, if mode == 0 { "CANCELLED" } else { "DEADLINE" });
            assert!(error.is_control_failure());
            assert_eq!(error.path, Utf16::from("/a~1b~0/0"));
            assert_eq!(
                error.message,
                Utf16::from(if mode == 0 {
                    "Operation cancelled"
                } else {
                    "Deadline elapsed"
                })
            );
        } else {
            host_fields(&error, &wanted);
        }
        assert_eq!(
            *effects.borrow(),
            trace
                .iter()
                .copied()
                .filter(|(_, at)| *at < target)
                .collect::<Vec<_>>()
        );
        assert!(ctx.schema_construction.is_none());
    }
}

#[test]
fn reentry_unwind_and_error_then_success_use_fresh_stack_and_restore_context() {
    let source = long_fixture();
    let (_, trace, _) = measured(&source);
    let mut depth = 0usize;
    let trigger = trace
        .iter()
        .find_map(|(name, at)| {
            match *name {
                "path-write" if depth > 0 => return Some(*at),
                "path-appended" => depth += 1,
                "path-restored" => depth -= 1,
                _ => {}
            }
            None
        })
        .expect("reentry must occur while a real nonempty parent is active");
    let calls = Cell::new(0usize);
    let entered = Cell::new(false);
    let mut meter = |_| {
        calls.set(calls.get() + 1);
        if calls.get() == trigger {
            entered.set(true);
            let nested = units(r#"{"nested":{"a/b~":1}}"#);
            let mut inner = Context::catalog();
            assert_eq!(
                plain(&nested, &mut inner).unwrap(),
                original(&nested).unwrap()
            );
            assert!(inner.schema_construction.is_none());
        }
        Ok(())
    };
    let phase = Cell::new("caller-phase");
    let root = Cell::new("caller-root");
    let mut ctx = Context::catalog()
        .with_meter(&mut meter)
        .with_work_phase_observer(&phase)
        .with_constructor_root_observer(&root);
    assert_eq!(
        plain(&source, &mut ctx).unwrap(),
        original(&source).unwrap()
    );
    assert!(entered.get());
    assert!(ctx.schema_construction.is_none());
    assert_eq!(phase.get(), "caller-phase");
    drop(ctx);
    // A separate invocation repeats the same prefix before the trigger and
    // then fails under its original nested parent after reentry.
    calls.set(0);
    entered.set(false);
    let bad_parent = units(
        r#"{"parent":{"long-child-with-slash/tilde~and-many-units-to-force-relocation":{"leaf":[-0]}},"sibling":[null,true]}"#,
    );
    let mut ctx = Context::catalog().with_meter(&mut meter);
    let error = plain(&bad_parent, &mut ctx).unwrap_err();
    assert!(entered.get());
    assert_eq!(error, original(&bad_parent).unwrap_err());
    assert_eq!(
        error.path,
        Utf16::from(
            "/parent/long-child-with-slash~1tilde~0and-many-units-to-force-relocation/leaf/0"
        )
    );
    assert!(ctx.schema_construction.is_none());
    drop(ctx);
    let mut ctx = Context::catalog()
        .with_work_phase_observer(&phase)
        .with_constructor_root_observer(&root);
    ctx.with_codegen_construction(|outer| {
        let prior = Rc::clone(outer.schema_construction.as_ref().unwrap());
        for site in ["decoded-store", "path-appended"] {
            let published = Cell::new(false);
            let stopped = Cell::new(false);
            let calls = Cell::new(0usize);
            let mut count = |_| {
                assert!(!stopped.get(), "no callback after observer unwind");
                calls.set(calls.get() + 1);
                Ok(())
            };
            let unwind = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let mut nested_ctx = Context::catalog().with_meter(&mut count);
                let mut event = |name| {
                    if name == "owned-publication" {
                        published.set(true);
                    }
                    if name == site {
                        stopped.set(true);
                        panic!("independent decode/stack unwind");
                    }
                };
                run(&source, &mut nested_ctx, &mut event)
            }));
            assert!(unwind.is_err());
            assert!(!published.get());
            assert!(stopped.get());
            assert!(Rc::ptr_eq(
                outer.schema_construction.as_ref().unwrap(),
                &prior
            ));
            // Also unwind the actual nested scope on the original Context.
            let unwind = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let mut event = |name| {
                    if name == site {
                        panic!("original-context unwind");
                    }
                };
                run(&source, outer, &mut event)
            }));
            assert!(unwind.is_err());
            assert!(Rc::ptr_eq(
                outer.schema_construction.as_ref().unwrap(),
                &prior
            ));
        }
        let bad = units(r#"{"x":[{"a/b~":-0}]}"#);
        let error = plain(&bad, outer).unwrap_err();
        assert_eq!(error, original(&bad).unwrap_err());
        assert_eq!(error.path, Utf16::from("/x/0/a~1b~0"));
        assert_eq!(
            plain(&units(r#"{"sibling":true}"#), outer)?,
            Value::Object(vec![(Utf16::from("sibling"), Value::Bool(true))])
        );
        assert_eq!(phase.get(), "caller-phase");
        assert_eq!(root.get(), "caller-root");
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(ctx.schema_construction.is_none());
}

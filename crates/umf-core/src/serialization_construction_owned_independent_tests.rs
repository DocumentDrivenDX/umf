// SPDX-License-Identifier: MIT OR Apache-2.0
//! AP1 owned-reader independent controls. SOURCE ONLY / NATIVE UNEXECUTED.
//! Private child of serialization.rs; no bank/schema-validity proof is minted.
use super::*;
use std::cell::{Cell, RefCell};
use std::rc::Rc;

fn units(text: &str) -> Vec<u16> {
    text.encode_utf16().collect()
}
fn original(source: &[u16], ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    read_json_value(source, Format::Json, ctx)
}
fn owned(source: &[u16], ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.with_codegen_construction(|ctx| read_construction_json_owned(source, ctx))
}
fn observed(
    source: &[u16],
    ctx: &mut Context<'_>,
    observer: &mut dyn FnMut(&'static str),
) -> Result<Value, EngineError> {
    ctx.with_codegen_construction(|ctx| {
        read_construction_json_owned_with_events(source, ctx, observer)
    })
}
fn limits_context(limits: crate::context::Limits) -> Context<'static> {
    Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap()
}
fn refused(
    source: &[u16],
    limits: crate::context::Limits,
    code: &str,
    path: &[u16],
    message: &str,
) {
    let oracle = original(source, &mut limits_context(limits)).unwrap_err();
    let actual = owned(source, &mut limits_context(limits)).unwrap_err();
    // Literal expectations discriminate two routes sharing a parser body.
    assert_eq!(oracle.code, code);
    assert_eq!(oracle.path.units(), path);
    assert_eq!(oracle.message, Utf16::from(message));
    assert_eq!(actual, oracle);
    assert!(!actual.is_control_failure());
}
fn host_error() -> EngineError {
    let mut error = EngineError::new(
        "DUPLICATE_KEY",
        Utf16::new(vec![47, 0xd800, 126]),
        "host-origin refusal must not become a parser result",
    );
    error.python_message_origin = Some(PyText::from_utf8("reader-host-δ"));
    error.with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference)
}
fn exact_host_error(actual: &EngineError, expected: &EngineError) {
    assert_eq!(actual.code, expected.code);
    assert_eq!(actual.path, expected.path);
    assert_eq!(actual.message, expected.message);
    assert_eq!(actual.python_message_origin, expected.python_message_origin);
    assert!(actual.is_control_failure());
    assert!(!actual.is_python_schema_terminal());
}
fn fixture() -> Vec<u16> {
    units(r#"{"aa":0,"ab":[true],"b":null,"longer":false,"ac":"x","z":{}}"#)
}
fn duplicate(first: &[u16], second: &[u16], child: &[u16]) -> Vec<u16> {
    let mut source = units("{\"");
    source.extend_from_slice(first);
    source.extend(units("\":0,\""));
    source.extend_from_slice(second);
    source.extend(units("\":"));
    source.extend_from_slice(child);
    source.extend(units("}"));
    source
}

#[test]
fn literal_values_authored_member_order_and_unknown_metatree_content_are_retained() {
    let source = units(r#"{"2":2,"1":1,"unknown":{"x":[null,true,"s"]},"":false}"#);
    let expected = Value::Object(vec![
        (Utf16::from("2"), Value::Number(2.0)),
        (Utf16::from("1"), Value::Number(1.0)),
        (
            Utf16::from("unknown"),
            Value::Object(vec![(
                Utf16::from("x"),
                Value::Array(vec![
                    Value::Null,
                    Value::Bool(true),
                    Value::string_utf8("s"),
                ]),
            )]),
        ),
        (Utf16::default(), Value::Bool(false)),
    ]);
    assert_eq!(owned(&source, &mut Context::catalog()).unwrap(), expected);
    assert_eq!(
        original(&source, &mut Context::catalog()).unwrap(),
        expected
    );
    // The actual complete pinned source is DATA here, not schema admission.
    let pinned = units(include_str!("schema_metas.json"));
    let actual = owned(&pinned, &mut Context::catalog()).unwrap();
    let oracle = original(&pinned, &mut Context::catalog()).unwrap();
    assert_eq!(actual, oracle);
    let Value::Object(fields) = &actual else {
        panic!("complete metatree object")
    };
    assert_eq!(
        fields
            .iter()
            .map(|(k, _)| k.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        vec!["profile", "sources", "metaschemas", "resources"]
    );
    assert_eq!(
        fields[0].1,
        Value::string_utf8("umf.r2.schema-metaschemas/1")
    );
    let Value::Array(resources) = &fields[3].1 else {
        panic!("pinned resources")
    };
    assert_eq!(resources.len(), 20);
    let source = units(
        r#"{"unknown-extension":{"future":[{"opaque":"keep","extra":null}]},"profile":"unrecognized"}"#,
    );
    let expected = original(&source, &mut Context::catalog()).unwrap();
    let value = owned(&source, &mut Context::catalog()).unwrap();
    assert_eq!(value, expected);
    let Value::Object(fields) = value else {
        panic!("object")
    };
    assert_eq!(fields[0].0, Utf16::from("unknown-extension"));
    assert_eq!(
        fields[1],
        (Utf16::from("profile"), Value::string_utf8("unrecognized"))
    );
}

#[test]
fn literal_malformed_trailing_and_escaped_error_paths_match_original() {
    for (source, code, path, message) in [
        ("", "SYNTAX", "", "Expected JSON value"),
        ("[", "SYNTAX", "/0", "Expected JSON value"),
        (
            r#"{"x" 1}"#,
            "SYNTAX",
            "",
            "Expected colon after object key",
        ),
        (r#"{"x":}"#, "SYNTAX", "/x", "Expected JSON value"),
        ("[1,]", "SYNTAX", "/1", "Expected JSON value"),
        ("NaN", "SYNTAX", "", "Expected JSON value"),
        ("Infinity", "SYNTAX", "", "Expected JSON value"),
        ("null true", "SYNTAX", "", "Trailing JSON source"),
        (
            r#"{"x":"unterminated}"#,
            "SYNTAX",
            "",
            "Unterminated JSON string",
        ),
        (r#""\q""#, "SYNTAX", "", "Invalid JSON escape"),
        (
            r#"{"a/b~☃":[01]}"#,
            "SYNTAX",
            "/a~1b~0☃/0",
            "Leading zero in JSON number",
        ),
        ("1.", "SYNTAX", "", "Malformed JSON fraction"),
        ("1e+", "SYNTAX", "", "Malformed JSON exponent"),
    ] {
        refused(
            &units(source),
            Context::catalog().limits(),
            code,
            &units(path),
            message,
        );
    }
}

#[test]
fn numeric_decimal_negative_zero_safe_boundaries_and_rounding_refusals_are_original() {
    for (source, expected) in [
        ("0", 0.0),
        ("0.1", 0.1),
        ("1e-7", 1e-7),
        ("9007199254740991", 9007199254740991.0),
        ("-9007199254740991", -9007199254740991.0),
    ] {
        let actual = owned(&units(source), &mut Context::catalog()).unwrap();
        assert_eq!(actual, Value::Number(expected));
        assert_eq!(
            actual,
            original(&units(source), &mut Context::catalog()).unwrap()
        );
    }
    for (source, path, message) in [
        (
            "-0",
            "",
            "Number outside the core interoperable numeric profile",
        ),
        (
            "-0.0",
            "",
            "Number outside the core interoperable numeric profile",
        ),
        (
            "-0e2",
            "",
            "Number outside the core interoperable numeric profile",
        ),
        (
            "9007199254740992",
            "",
            "Number outside the core interoperable numeric profile",
        ),
        (
            "9007199254740993",
            "",
            "Parsing would change the decimal value",
        ),
        (
            "0.10000000000000001",
            "",
            "Parsing would change the decimal value",
        ),
        ("1e-400", "", "Parsing would change the decimal value"),
        (
            r#"{"a/b~":[-0]}"#,
            "/a~1b~0/0",
            "Number outside the core interoperable numeric profile",
        ),
    ] {
        refused(
            &units(source),
            Context::catalog().limits(),
            "NUMBER",
            &units(path),
            message,
        );
    }
    for source in ["1e309", "-1e309"] {
        let raw = units(source);
        let oracle = original(&raw, &mut Context::catalog()).unwrap_err();
        let actual = owned(&raw, &mut Context::catalog()).unwrap_err();
        assert_eq!(oracle.code, "NUMBER");
        assert!(oracle.path.units().is_empty());
        assert_eq!(actual, oracle);
    }
}

#[test]
fn source_depth_and_node_limits_preserve_literal_paths_precedence_and_boundaries() {
    let source = units(r#"{"ok":1}"#);
    let mut limits = Context::catalog().limits();
    limits.max_text_units = source.len() - 1;
    refused(&source, limits, "LIMIT", &[], "Source text limit exceeded");
    limits.max_text_units = source.len();
    assert_eq!(
        owned(&source, &mut limits_context(limits)).unwrap(),
        original(&source, &mut limits_context(limits)).unwrap()
    );
    let source = units(r#"[{"a/b~":0}]"#);
    let mut limits = Context::catalog().limits();
    limits.max_depth = 1;
    refused(
        &source,
        limits,
        "LIMIT",
        &units("/0/a~1b~0"),
        "Nesting depth exceeded",
    );
    limits.max_depth = 2;
    assert_eq!(
        owned(&source, &mut limits_context(limits)).unwrap(),
        original(&source, &mut limits_context(limits)).unwrap()
    );
    let mut limits = Context::catalog().limits();
    limits.max_values = 2;
    refused(
        &units("[0,1]"),
        limits,
        "LIMIT",
        &units("/1"),
        "JSON structural value limit exceeded",
    );
    limits.max_values = 3;
    assert_eq!(
        owned(&units("[0,1]"), &mut limits_context(limits)).unwrap(),
        Value::Array(vec![Value::Number(0.0), Value::Number(1.0)])
    );
}

#[test]
fn raw_utf16_decoded_duplicates_precede_colon_or_hostile_child_without_repair() {
    for (raw, escaped) in [
        (vec![0xd800], r#""\ud800""#),
        (vec![0xdc00], r#""\udc00""#),
        (vec![0xd83d, 0xde00], r#""\ud83d\ude00""#),
        (vec![0xdc00, 0xd800], r#""\udc00\ud800""#),
    ] {
        let mut source = vec![34];
        source.extend_from_slice(&raw);
        source.push(34);
        let expected = Value::String(Utf16::new(raw));
        assert_eq!(owned(&source, &mut Context::catalog()).unwrap(), expected);
        assert_eq!(
            original(&source, &mut Context::catalog()).unwrap(),
            expected
        );
        assert_eq!(
            owned(&units(escaped), &mut Context::catalog()).unwrap(),
            expected
        );
    }
    for (raw, escaped) in [
        (units("x"), units(r#"\u0078"#)),
        (vec![0xd800], units(r#"\ud800"#)),
        (vec![0xd83d, 0xde00], units(r#"\ud83d\ude00"#)),
        (vec![0xdc00, 0xd800], units(r#"\udc00\ud800"#)),
    ] {
        for hostile in ["[{", "-0", "9007199254740993"] {
            refused(
                &duplicate(&raw, &escaped, &units(hostile)),
                Context::catalog().limits(),
                "DUPLICATE_KEY",
                &[],
                "Duplicate object key",
            );
        }
    }
    refused(
        &units(r#"{"x":0,"\u0078"false}"#),
        Context::catalog().limits(),
        "DUPLICATE_KEY",
        &[],
        "Duplicate object key",
    );
    refused(
        &units(r#"{"a/b~☃":{"x":0,"\u0078":[{}}}"#),
        Context::catalog().limits(),
        "DUPLICATE_KEY",
        &units("/a~1b~0☃"),
        "Duplicate object key",
    );
    // A bad FIRST value remains earlier than a duplicate appearing later.
    refused(
        &units(r#"{"x":-0,"x":1}"#),
        Context::catalog().limits(),
        "NUMBER",
        &units("/x"),
        "Number outside the core interoperable numeric profile",
    );
    let source = duplicate(&[0xd800], &[0xfffd], &units("1"));
    let value = owned(&source, &mut Context::catalog()).unwrap();
    assert_eq!(
        value,
        Value::Object(vec![
            (Utf16::new(vec![0xd800]), Value::Number(0.0)),
            (Utf16::new(vec![0xfffd]), Value::Number(1.0))
        ])
    );
    assert_eq!(value, original(&source, &mut Context::catalog()).unwrap());
}

#[test]
fn owned_output_survives_source_mutation_and_exposed_clone_mutation_is_isolated() {
    let mut source = units(r#"{"k":[{"opaque":"original"}],"unknown":null}"#);
    let expected = Value::Object(vec![
        (
            Utf16::from("k"),
            Value::Array(vec![Value::Object(vec![(
                Utf16::from("opaque"),
                Value::string_utf8("original"),
            )])]),
        ),
        (Utf16::from("unknown"), Value::Null),
    ]);
    let output = owned(&source, &mut Context::catalog()).unwrap();
    let second = owned(&source, &mut Context::catalog()).unwrap();
    source.fill(0);
    source.clear();
    assert_eq!(output, expected);
    let mut exposed = output.clone();
    let Value::Object(fields) = &mut exposed else {
        panic!("owned object")
    };
    fields[0].0 = Utf16::from("changed-key");
    let Value::Array(items) = &mut fields[0].1 else {
        panic!("owned array")
    };
    let Value::Object(inner) = &mut items[0] else {
        panic!("owned nested object")
    };
    let Value::String(text) = &inner[0].1 else {
        panic!("owned text")
    };
    let mut extracted = text.clone().into_units();
    extracted[0] = 0x58;
    inner[0].1 = Value::String(Utf16::new(extracted));
    items.push(Value::Bool(false));
    assert_ne!(exposed, expected);
    assert_eq!(output, expected);
    assert_eq!(second, expected);
    drop(exposed);
    drop(source);
    assert_eq!(output, expected);
}

#[test]
fn every_observed_comparison_growth_handoff_and_publication_denies_before_its_effect() {
    let source = fixture();
    // Different decoded lengths cannot reach a unit comparison, even when
    // one key is the textual prefix of the other.
    let length_effects = RefCell::new(Vec::new());
    let mut length_observer = |event| length_effects.borrow_mut().push(event);
    observed(
        &units(r#"{"a":0,"aa":1}"#),
        &mut Context::catalog(),
        &mut length_observer,
    )
    .unwrap();
    assert!(length_effects.borrow().contains(&"key-metadata"));
    assert!(!length_effects.borrow().contains(&"key-unit"));

    let calls = Cell::new(0usize);
    let trace = RefCell::new(Vec::new());
    let mut control = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    let mut observer = |event| trace.borrow_mut().push((event, calls.get()));
    let output = observed(
        &source,
        &mut Context::catalog().with_host_control(&mut control),
        &mut observer,
    )
    .unwrap();
    assert_eq!(output, original(&source, &mut Context::catalog()).unwrap());
    let trace = trace.into_inner();
    assert_eq!(trace.last().map(|v| v.0), Some("owned-publication"));
    assert_eq!(
        trace.last().unwrap().1,
        calls.get(),
        "no control after publication event"
    );
    for site in [
        "key-metadata",
        "key-unit",
        "member-growth",
        "owned-handoff",
        "owned-publication",
    ] {
        let target = trace
            .iter()
            .find(|(name, _)| *name == site)
            .expect("fixture must reach actual effect site")
            .1;
        let calls = Cell::new(0usize);
        let effects = RefCell::new(Vec::new());
        let error = host_error();
        let mut deny = |_| {
            calls.set(calls.get() + 1);
            if calls.get() == target {
                Err(error.clone())
            } else {
                Ok(())
            }
        };
        let mut observer = |event| effects.borrow_mut().push((event, calls.get()));
        let actual = observed(
            &source,
            &mut Context::catalog().with_host_control(&mut deny),
            &mut observer,
        )
        .unwrap_err();
        exact_host_error(&actual, &error);
        assert_eq!(calls.get(), target, "no callback after first denial");
        let expected: Vec<_> = trace
            .iter()
            .copied()
            .filter(|(_, at)| *at < target)
            .collect();
        assert_eq!(
            *effects.borrow(),
            expected,
            "denied precharge cannot reach its effect"
        );
        assert!(
            !effects
                .borrow()
                .iter()
                .any(|(name, _)| *name == "owned-publication")
        );
    }
}

#[test]
fn reentry_and_handoff_unwind_restore_outer_context_without_partial_publication() {
    let source = fixture();
    let measured_calls = Cell::new(0usize);
    let growth_call = Cell::new(None);
    let mut measure = |_| {
        measured_calls.set(measured_calls.get() + 1);
        Ok(())
    };
    let mut effect = |event| {
        if event == "member-growth" && growth_call.get().is_none() {
            growth_call.set(Some(measured_calls.get()));
        }
    };
    observed(
        &source,
        &mut Context::catalog().with_host_control(&mut measure),
        &mut effect,
    )
    .unwrap();
    let target = growth_call.get().expect("actual member growth");
    let reached = Cell::new(false);
    let active = Cell::new(false);
    let calls = Cell::new(0usize);
    let deny_now = Cell::new(false);
    let denied_calls = Cell::new(0usize);
    let mut reenter = |_| {
        if deny_now.get() {
            denied_calls.set(denied_calls.get() + 1);
            return Err(host_error());
        }
        if active.get() {
            calls.set(calls.get() + 1);
        }
        if active.get() && calls.get() == target && !reached.replace(true) {
            let nested = units(r#"{"inner":[false,"private"]}"#);
            let expected = Value::Object(vec![(
                Utf16::from("inner"),
                Value::Array(vec![Value::Bool(false), Value::string_utf8("private")]),
            )]);
            assert_eq!(owned(&nested, &mut Context::catalog()).unwrap(), expected);
            assert_eq!(
                original(&nested, &mut Context::catalog()).unwrap(),
                expected
            );
        }
        Ok(())
    };
    let phase = Cell::new("outer-phase");
    let role = Cell::new("outer-role");
    let mut ctx = Context::catalog()
        .with_host_control(&mut reenter)
        .with_work_phase_observer(&phase)
        .with_constructor_root_observer(&role);
    ctx.with_codegen_construction(|outer| {
        let prior = Rc::clone(outer.schema_construction.as_ref().unwrap());
        active.set(true);
        let value = owned(&source, outer)?;
        active.set(false);
        assert_eq!(value, original(&source, &mut Context::catalog()).unwrap());
        assert!(Rc::ptr_eq(
            outer.schema_construction.as_ref().unwrap(),
            &prior
        ));
        let failure = outer
            .with_codegen_construction(|inner| {
                deny_now.set(true);
                read_construction_json_owned(&source, inner)
            })
            .unwrap_err();
        deny_now.set(false);
        exact_host_error(&failure, &host_error());
        assert_eq!(
            denied_calls.get(),
            1,
            "no callback after actual nested reader denial"
        );
        assert!(Rc::ptr_eq(
            outer.schema_construction.as_ref().unwrap(),
            &prior
        ));
        let published = Cell::new(false);
        let unwind = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            outer.with_codegen_construction(|inner| {
                let mut observer = |event| {
                    if event == "owned-publication" {
                        published.set(true);
                    }
                    if event == "owned-handoff" {
                        panic!("independent handoff unwind");
                    }
                };
                observed(&source, inner, &mut observer)
            })
        }));
        assert!(unwind.is_err());
        assert!(!published.get());
        assert!(Rc::ptr_eq(
            outer.schema_construction.as_ref().unwrap(),
            &prior
        ));
        assert_eq!(phase.get(), "outer-phase");
        assert_eq!(role.get(), "outer-role");
        assert_eq!(owned(&source, outer)?, value);
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(reached.get());
    assert!(ctx.schema_construction.is_none());
    assert_eq!(phase.get(), "outer-phase");
    assert_eq!(role.get(), "outer-role");
}

#[test]
fn observer_adds_no_work_and_nohook_denial_at_each_real_callback_is_terminal() {
    let source = fixture();
    let generic_work = RefCell::new(Vec::new());
    let fallback_work = RefCell::new(Vec::new());
    let generic_events = RefCell::new(Vec::new());
    let mut generic_control = |n| {
        generic_work.borrow_mut().push(n);
        Ok(())
    };
    let mut fallback_control = |n| {
        fallback_work.borrow_mut().push(n);
        Ok(())
    };
    let mut generic_observer = |event| generic_events.borrow_mut().push(event);
    let generic = original(
        &source,
        &mut Context::catalog().with_host_control(&mut generic_control),
    )
    .unwrap();
    let fallback = read_construction_json_owned_with_events(
        &source,
        &mut Context::catalog().with_host_control(&mut fallback_control),
        &mut generic_observer,
    )
    .unwrap();
    assert_eq!(fallback, generic);
    assert_eq!(*fallback_work.borrow(), *generic_work.borrow());
    assert!(
        generic_events.borrow().is_empty(),
        "generic route cannot emit owned construction events"
    );
    let plain = RefCell::new(Vec::new());
    let observed_work = RefCell::new(Vec::new());
    let mut plain_control = |amount| {
        plain.borrow_mut().push(amount);
        Ok(())
    };
    let mut hook_control = |amount| {
        observed_work.borrow_mut().push(amount);
        Ok(())
    };
    let mut event = |_| {};
    let actual = owned(
        &source,
        &mut Context::catalog().with_host_control(&mut plain_control),
    )
    .unwrap();
    let hooked = observed(
        &source,
        &mut Context::catalog().with_host_control(&mut hook_control),
        &mut event,
    )
    .unwrap();
    assert_eq!(actual, hooked);
    assert_eq!(*plain.borrow(), *observed_work.borrow());
    let total = plain.borrow().len();
    assert!(total > 0);
    for target in 1..=total {
        let calls = Cell::new(0usize);
        let error = host_error();
        let mut deny = |_| {
            calls.set(calls.get() + 1);
            if calls.get() == target {
                Err(error.clone())
            } else {
                Ok(())
            }
        };
        let actual = owned(
            &source,
            &mut Context::catalog().with_host_control(&mut deny),
        )
        .unwrap_err();
        exact_host_error(&actual, &error);
        assert_eq!(calls.get(), target);
    }
}

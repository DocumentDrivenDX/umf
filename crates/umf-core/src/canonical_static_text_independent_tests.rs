// SPDX-License-Identifier: MIT OR Apache-2.0
//! SOURCE ONLY; UNCOMPILED / NATIVE UNEXECUTED. Child canonical_codegen_resources.
//! Static DATA is never JSON/schema admission proof. Cache fixtures are separate.
use super::*;
use std::cell::{Cell, RefCell};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::panic::{AssertUnwindSafe, catch_unwind};

static RAW_UNITS: &[u16] = &[0, 13, 10, 0xd800, 0xd83d, 0xde00];
static DICT: &[&[u16]] = &[
    &[117, 110, 107, 110, 111, 119, 110],
    &[107, 47, 126],
    RAW_UNITS,
    &[],
];
static A: &[&[u16]] = &[&[65]];
static B: &[&[u16]] = &[&[66]];
static ROOT: &[u16] = &[35];
static SEGMENT: &[u16] = &[97, 47, 126, 0xd800];
const RICH: Literal = Literal::Object(&[
    Member {
        key: 0,
        value: Literal::Array(&[
            Literal::Null,
            Literal::Bool(true),
            Literal::Integer {
                negative: true,
                magnitude: 7,
            },
            Literal::Binary64 {
                bits: 0x3ff4000000000000,
            },
            Literal::Text(2),
            Literal::Text(0),
        ]),
    },
    Member {
        key: 1,
        value: Literal::Text(3),
    },
]);
fn materialize_static(
    literal: &Literal,
    dictionary: &'static [&'static [u16]],
    ctx: &mut Context<'_>,
) -> Value {
    materialize_static_fixture_with_events(literal, dictionary, ctx, &mut |_| {}).unwrap()
}
fn digest(text: &Utf16) -> u64 {
    let mut h = DefaultHasher::new();
    text.hash(&mut h);
    h.finish()
}
fn host_error() -> EngineError {
    let mut e = EngineError::new(
        "STATIC_CONTROL",
        Utf16::new(vec![35, 47, 0xd800]),
        "first static host refusal",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("static-host-δ"));
    e.with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference)
}
fn check_host(e: &EngineError) {
    let expected = host_error();
    assert_eq!(e.code, expected.code);
    assert_eq!(e.path, expected.path);
    assert_eq!(e.message, expected.message);
    assert_eq!(e.python_message_origin, expected.python_message_origin);
    assert!(e.is_control_failure());
    assert!(!e.is_python_schema_terminal());
}
fn data_error(e: &EngineError, code: &str, message: &str) {
    assert_eq!(e.code, code);
    assert_eq!(e.path, Utf16::from("#"));
    assert_eq!(e.message, Utf16::from(message));
}
fn rich_trace() -> (Vec<usize>, Vec<(usize, MaterializeEvent)>) {
    let calls = Cell::new(0usize);
    let amounts = RefCell::new(Vec::new());
    let events = RefCell::new(Vec::new());
    let mut control = |amount| {
        calls.set(calls.get() + 1);
        amounts.borrow_mut().push(amount);
        Ok(())
    };
    materialize_static_fixture_with_events(
        &RICH,
        DICT,
        &mut Context::ordinary().with_host_control(&mut control),
        &mut |e| events.borrow_mut().push((calls.get(), e)),
    )
    .unwrap();
    (amounts.into_inner(), events.into_inner())
}
fn string_trace(operation: usize) -> (Vec<usize>, Vec<(usize, &'static str)>) {
    let calls = Cell::new(0usize);
    let amounts = RefCell::new(Vec::new());
    let events = RefCell::new(Vec::new());
    let mut control = |amount| {
        calls.set(calls.get() + 1);
        amounts.borrow_mut().push(amount);
        Ok(())
    };
    let mut ctx = Context::ordinary().with_host_control(&mut control);
    let mut event = |e| events.borrow_mut().push((calls.get(), e));
    match operation {
        0 => {
            Utf16::from_static_units(RAW_UNITS)
                .into_shared_with_events(&mut ctx, &mut event)
                .unwrap();
        }
        1 => {
            let mut path = Utf16::from_static_units(ROOT);
            path.push_owned_path_segment_with_events(
                &Utf16::from_static_units(SEGMENT),
                &mut ctx,
                &mut event,
            )
            .unwrap();
        }
        2 => {
            let mut path = Utf16::from_static_units(ROOT);
            crate::value::decimal_path::append_decimal_index_with_events(
                &mut path, 120, &mut ctx, &mut event,
            )
            .unwrap();
        }
        _ => unreachable!(),
    }
    drop(event);
    drop(ctx);
    drop(control);
    (amounts.into_inner(), events.into_inner())
}

#[test]
fn static01_genuine_static_units_clone_eq_ord_hash_and_owned_copy_isolation() {
    let text = Utf16::from_static_units(RAW_UNITS);
    let cloned = text.clone();
    let owned = Utf16::new(RAW_UNITS.to_vec());
    let shared = Utf16::shared(RAW_UNITS.to_vec());
    assert!(std::ptr::eq(text.units(), RAW_UNITS));
    assert!(std::ptr::eq(cloned.units(), RAW_UNITS));
    assert_eq!(text, owned);
    assert_eq!(text, shared);
    assert_eq!(digest(&text), digest(&owned));
    assert_eq!(digest(&text), digest(&shared));
    assert_eq!(text.cmp(&owned), std::cmp::Ordering::Equal);
    let low = Utf16::from_static_units(&[0xd800]);
    let high = Utf16::new(vec![0xd801]);
    assert!(low < high);
    assert!(high > low);
    assert!(text.clone_work() > 0);
    assert_eq!(
        text.clone_work(),
        Utf16::from_static_units(&[]).clone_work()
    );
    let mut extracted = cloned.into_units();
    assert_eq!(extracted, RAW_UNITS);
    assert_ne!(extracted.as_ptr(), RAW_UNITS.as_ptr()); // simultaneous nonempty owned buffer
    extracted[0] = 90;
    extracted.push(91);
    assert_eq!(text.units(), &[0, 13, 10, 0xd800, 0xd83d, 0xde00]);
    assert_eq!(RAW_UNITS, &[0, 13, 10, 0xd800, 0xd83d, 0xde00]);
}

#[test]
fn static02_static_fixture_full_value_matches_raw_reader_and_no_cache_events() {
    let raw =
        r#"{"unknown":[null,true,-7,1.25,"\u0000\r\n\ud800\ud83d\ude00","unknown"],"k/~":""}"#;
    let expected = Value::Object(vec![
        (
            Utf16::from("unknown"),
            Value::Array(vec![
                Value::Null,
                Value::Bool(true),
                Value::Number(-7.0),
                Value::Number(1.25),
                Value::String(Utf16::new(RAW_UNITS.to_vec())),
                Value::string_utf8("unknown"),
            ]),
        ),
        (Utf16::from("k/~"), Value::string_utf8("")),
    ]);
    let parsed = crate::serialization::read_json_value(
        &raw.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(parsed, expected);
    for _ in 0..2 {
        let mut events = Vec::new();
        let value = materialize_static_fixture_with_events(
            &RICH,
            DICT,
            &mut Context::ordinary(),
            &mut |e| events.push(e),
        )
        .unwrap();
        assert_eq!(value, expected);
        assert_eq!(
            events
                .iter()
                .filter(|e| **e == MaterializeEvent::StaticSourceReady)
                .count(),
            1
        );
        assert_eq!(
            events
                .iter()
                .filter(|e| **e == MaterializeEvent::StaticDictionaryRead)
                .count(),
            5
        );
        assert_eq!(
            events
                .iter()
                .filter(|e| **e == MaterializeEvent::StaticWrapperReturn)
                .count(),
            5
        );
        for forbidden in [
            MaterializeEvent::TextCopy,
            MaterializeEvent::CacheSlotsInit,
            MaterializeEvent::DictionaryRead,
            MaterializeEvent::CacheLookup,
            MaterializeEvent::ArcOwnerCreate,
            MaterializeEvent::CachePublish,
            MaterializeEvent::ArcReturnClone,
            MaterializeEvent::SharedWrapperReturn,
        ] {
            assert!(!events.contains(&forbidden));
        }
        let admitted =
            crate::value::admit_owned_json_at(value, Utf16::from("#"), &mut Context::ordinary())
                .unwrap();
        assert_eq!(admitted, expected);
    }
}

#[test]
fn static03_dictionary_bounds_each_occurrence_limit_and_fresh_source_binding() {
    for id in [1, usize::MAX] {
        let mut events = Vec::new();
        let error = materialize_static_fixture_with_events(
            &Literal::Text(id),
            A,
            &mut Context::ordinary(),
            &mut |e| events.push(e),
        )
        .unwrap_err();
        data_error(
            &error,
            "REQUEST",
            "Installed text ID is outside its dictionary",
        );
        assert!(!events.contains(&MaterializeEvent::StaticWrapperReturn));
        assert!(!events.contains(&MaterializeEvent::RootComplete));
    }
    const BAD_KEY: Literal = Literal::Object(&[Member {
        key: 0,
        value: Literal::Null,
    }]);
    let error = materialize_static_fixture_with_events(
        &BAD_KEY,
        &[],
        &mut Context::ordinary(),
        &mut |_| {},
    )
    .unwrap_err();
    data_error(
        &error,
        "REQUEST",
        "Installed text ID is outside its dictionary",
    );
    let mut path = Utf16::from("#");
    let mut ctx = Context::ordinary();
    let mut source = StaticTextSource::new(A, &mut ctx, &mut path, &mut |_| {}).unwrap();
    assert_eq!(
        source.get(0, &mut ctx, &mut path, &mut |_| {}).unwrap(),
        Utf16::from("A")
    );
    let mut events = Vec::new();
    let error = ctx
        .with_aggregate_text_limit(0, |ctx| {
            source.get(0, ctx, &mut path, &mut |e| events.push(e))
        })
        .unwrap_err();
    data_error(&error, "LIMIT", "Installed DATA text limit exceeded");
    assert_eq!(events, vec![MaterializeEvent::StaticDictionaryRead]);
    for (dictionary, expected) in [(A, "A"), (B, "B"), (A, "A")] {
        assert_eq!(
            materialize_static(&Literal::Text(0), dictionary, &mut Context::ordinary()),
            Value::string_utf8(expected)
        );
    }
}

#[test]
fn static04_data_is_not_full_admission_numeric_duplicate_and_node_depth_proof() {
    const DUP: Literal = Literal::Object(&[
        Member {
            key: 0,
            value: Literal::Null,
        },
        Member {
            key: 0,
            value: Literal::Bool(true),
        },
    ]);
    let raw = materialize_static(&DUP, A, &mut Context::ordinary());
    assert_eq!(
        crate::value::admit_owned_json_at(raw, Utf16::from("#"), &mut Context::ordinary())
            .unwrap_err()
            .code,
        "DUPLICATE_KEY"
    );
    for bits in [0x8000000000000000, 0x7ff0000000000000, 0x7ff8000000000042] {
        let raw = materialize_static(&Literal::Binary64 { bits }, &[], &mut Context::ordinary());
        let Value::Number(n) = &raw else {
            panic!("raw numeric DATA")
        };
        assert_eq!(n.to_bits(), bits);
        let error =
            crate::value::admit_owned_json_at(raw, Utf16::from("#"), &mut Context::ordinary())
                .unwrap_err();
        data_error(
            &error,
            "NUMBER",
            "Number outside the core interoperable numeric profile",
        );
    }
    // Real root-count limit, NOT max_text_units: the full validator charges
    // strings but does not enforce a per-string text limit in this API.
    let raw = materialize_static(&Literal::Text(0), A, &mut Context::ordinary());
    let mut limits = crate::context::Limits::ordinary();
    limits.max_values = 0;
    let mut narrow =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let error = crate::value::admit_owned_json_at(raw, Utf16::from("#"), &mut narrow).unwrap_err();
    data_error(&error, "LIMIT", "JSON structural value limit exceeded");
    const TREE: Literal = Literal::Array(&[Literal::Text(0)]);
    let raw = materialize_static(&TREE, A, &mut Context::ordinary());
    let mut limits = crate::context::Limits::ordinary();
    limits.max_depth = 0;
    let mut narrow =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    assert_eq!(
        crate::value::admit_owned_json_at(raw, Utf16::from("#"), &mut narrow)
            .unwrap_err()
            .code,
        "LIMIT"
    );
    let mut limits = crate::context::Limits::ordinary();
    limits.max_values = 1;
    let mut narrow =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let error =
        materialize_static_fixture_with_events(&TREE, A, &mut narrow, &mut |_| {}).unwrap_err();
    data_error(
        &error,
        "LIMIT",
        "Installed DATA container frontier exceeded",
    );
    let mut limits = crate::context::Limits::ordinary();
    limits.max_depth = 0;
    let mut narrow =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let error =
        materialize_static_fixture_with_events(&TREE, A, &mut narrow, &mut |_| {}).unwrap_err();
    data_error(&error, "LIMIT", "Installed DATA structural limit exceeded");
}

#[test]
fn static05_actual_materializer_groups_deny_with_first_error_before_any_later_effect() {
    let (amounts, trace) = rich_trace();
    for event in [
        MaterializeEvent::StaticSourceReady,
        MaterializeEvent::StaticDictionaryRead,
        MaterializeEvent::StaticWrapperReturn,
        MaterializeEvent::LiteralRead,
        MaterializeEvent::StorageReserve,
        MaterializeEvent::ScalarStore,
        MaterializeEvent::MemberStore,
        MaterializeEvent::RootComplete,
    ] {
        assert!(trace.iter().any(|(_, e)| *e == event));
    }
    assert_eq!(amounts.last(), Some(&0));
    for deny in 1..=amounts.len() {
        let calls = Cell::new(0usize);
        let mut control = |amount| {
            calls.set(calls.get() + 1);
            assert!(calls.get() <= deny);
            assert_eq!(amount, amounts[calls.get() - 1]);
            if calls.get() == deny {
                Err(host_error())
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_host_control(&mut control);
        let mut events = Vec::new();
        let error = materialize_static_fixture_with_events(&RICH, DICT, &mut ctx, &mut |e| {
            events.push((calls.get(), e))
        })
        .unwrap_err();
        check_host(&error);
        assert_eq!(calls.get(), deny);
        assert_eq!(
            ctx.charged_work(),
            amounts[..deny].iter().map(|v| *v as u64).sum::<u64>()
        );
        assert_eq!(
            events,
            trace
                .iter()
                .copied()
                .filter(|(at, _)| *at < deny)
                .collect::<Vec<_>>()
        );
        assert!(
            !events
                .iter()
                .any(|(_, e)| *e == MaterializeEvent::RootComplete)
        );
    }
}

#[test]
fn static06_paid_static_to_shared_real_copy_and_existing_owned_shared_branches() {
    let mut events = Vec::new();
    let mut ctx = Context::ordinary();
    let converted = Utf16::from_static_units(RAW_UNITS)
        .into_shared_with_events(&mut ctx, &mut |e| events.push(e))
        .unwrap();
    assert_eq!(
        events,
        vec![
            "static-shared-size",
            "static-shared-copy-and-arc",
            "static-shared-return"
        ]
    );
    assert!(ctx.charged_work() > 0);
    assert_eq!(converted.units(), RAW_UNITS);
    assert_ne!(converted.units().as_ptr(), RAW_UNITS.as_ptr());
    let clone = converted.clone();
    assert!(std::ptr::eq(converted.units(), clone.units()));
    assert_eq!(converted.clone_work(), 1); // existing Shared branch, no unit copy on clone
    let mut extracted = converted.into_units();
    extracted[0] = 90;
    assert_eq!(clone.units(), RAW_UNITS);
    assert_eq!(RAW_UNITS, &[0, 13, 10, 0xd800, 0xd83d, 0xde00]);
    for value in [Utf16::new(vec![65]), Utf16::shared(vec![65])] {
        let before = ctx.charged_work();
        let mut seen = Vec::new();
        let shared = value
            .into_shared_with_events(&mut ctx, &mut |e| seen.push(e))
            .unwrap();
        assert_eq!(shared, Utf16::from("A"));
        assert_eq!(shared.clone_work(), 1);
        assert!(seen.is_empty());
        assert_eq!(ctx.charged_work(), before);
    }
    let direct = Utf16::from_static_units(RAW_UNITS)
        .into_shared_with_context(&mut ctx)
        .unwrap();
    assert_eq!(direct.units(), RAW_UNITS);
    assert_ne!(direct.units().as_ptr(), RAW_UNITS.as_ptr());
}

#[test]
fn static07_static_path_append_escapes_detaches_then_owned_restore_and_decimal() {
    let mut path = Utf16::from_static_units(ROOT);
    let original = path.clone();
    let mut events = Vec::new();
    let mut ctx = Context::ordinary();
    let old = path
        .push_owned_path_segment_with_events(
            &Utf16::from_static_units(SEGMENT),
            &mut ctx,
            &mut |e| events.push(e),
        )
        .unwrap();
    assert_eq!(old, 1);
    assert_eq!(events, vec!["path-growth", "path-relocation", "path-write"]);
    assert_eq!(path.units(), &[35, 47, 97, 126, 49, 126, 48, 0xd800]);
    assert_eq!(original.units(), ROOT);
    assert_eq!(ROOT, &[35]);
    assert_eq!(SEGMENT, &[97, 47, 126, 0xd800]);
    assert_ne!(path.units().as_ptr(), ROOT.as_ptr());
    path.restore_owned_path(old, &mut ctx).unwrap();
    assert_eq!(path.units(), ROOT);
    let owned_after_restore = path.units().as_ptr();
    path.restore_owned_path(old, &mut ctx).unwrap();
    assert_eq!(path.units().as_ptr(), owned_after_restore);
    for index in [0, 9, 10, 120, usize::MAX] {
        let mut decimal = Utf16::from_static_units(ROOT);
        let mut seen = Vec::new();
        let old = crate::value::decimal_path::append_decimal_index_with_events(
            &mut decimal,
            index,
            &mut ctx,
            &mut |e| seen.push(e),
        )
        .unwrap();
        let expected = format!("#/{index}");
        assert_eq!(decimal.units(), expected.encode_utf16().collect::<Vec<_>>());
        for event in ["decimal-growth", "decimal-relocation", "decimal-append"] {
            assert!(seen.contains(&event));
        }
        assert_ne!(decimal.units().as_ptr(), ROOT.as_ptr());
        assert_eq!(ROOT, &[35]);
        decimal.restore_owned_path(old, &mut ctx).unwrap();
        assert_eq!(decimal.units(), ROOT);
    }
}

#[test]
fn static08_shared_and_path_effect_groups_deny_before_copy_reserve_or_mutation() {
    for operation in 0..3 {
        let (amounts, trace) = string_trace(operation);
        if operation == 0 {
            assert_eq!(
                trace.iter().map(|(_, e)| *e).collect::<Vec<_>>(),
                vec![
                    "static-shared-size",
                    "static-shared-copy-and-arc",
                    "static-shared-return"
                ]
            );
        }
        if operation == 1 {
            assert_eq!(
                trace.iter().map(|(_, e)| *e).collect::<Vec<_>>(),
                vec!["path-growth", "path-relocation", "path-write"]
            );
        }
        if operation == 2 {
            for required in [
                "decimal-state",
                "decimal-digit-credit",
                "decimal-count-compare",
                "decimal-count-step",
                "decimal-extent",
                "decimal-capacity-check",
                "decimal-growth-plan",
                "decimal-growth",
                "decimal-relocation",
                "decimal-append",
            ] {
                assert!(trace.iter().any(|(_, e)| *e == required));
            }
        }
        for deny in 1..=amounts.len() {
            let calls = Cell::new(0usize);
            let mut control = |amount| {
                calls.set(calls.get() + 1);
                assert!(calls.get() <= deny);
                assert_eq!(amount, amounts[calls.get() - 1]);
                if calls.get() == deny {
                    Err(host_error())
                } else {
                    Ok(())
                }
            };
            let mut ctx = Context::ordinary().with_host_control(&mut control);
            let mut seen = Vec::new();
            let mut event = |e| seen.push((calls.get(), e));
            let error = match operation {
                0 => Utf16::from_static_units(RAW_UNITS)
                    .into_shared_with_events(&mut ctx, &mut event)
                    .unwrap_err(),
                1 => {
                    let mut path = Utf16::from_static_units(ROOT);
                    path.push_owned_path_segment_with_events(
                        &Utf16::from_static_units(SEGMENT),
                        &mut ctx,
                        &mut event,
                    )
                    .unwrap_err()
                }
                2 => {
                    let mut path = Utf16::from_static_units(ROOT);
                    crate::value::decimal_path::append_decimal_index_with_events(
                        &mut path, 120, &mut ctx, &mut event,
                    )
                    .unwrap_err()
                }
                _ => unreachable!(),
            };
            check_host(&error);
            assert_eq!(calls.get(), deny);
            assert_eq!(
                ctx.charged_work(),
                amounts[..deny].iter().map(|v| *v as u64).sum::<u64>()
            );
            assert_eq!(
                seen,
                trace
                    .iter()
                    .copied()
                    .filter(|(at, _)| *at < deny)
                    .collect::<Vec<_>>()
            );
            assert_eq!(RAW_UNITS, &[0, 13, 10, 0xd800, 0xd83d, 0xde00]);
            assert_eq!(ROOT, &[35]);
        }
    }
    // Restore is also controlled: denial cannot truncate a successful Owned path.
    let mut path = Utf16::from_static_units(ROOT);
    let old = path
        .push_owned_path_segment(&Utf16::from_static_units(SEGMENT), &mut Context::ordinary())
        .unwrap();
    let before = path.units().to_vec();
    let calls = Cell::new(0usize);
    let mut control = |_| {
        calls.set(calls.get() + 1);
        Err(host_error())
    };
    let error = path
        .restore_owned_path(
            old,
            &mut Context::ordinary().with_host_control(&mut control),
        )
        .unwrap_err();
    check_host(&error);
    assert_eq!(calls.get(), 1);
    assert_eq!(path.units(), before);
    path.restore_owned_path(old, &mut Context::ordinary())
        .unwrap();
    assert_eq!(path.units(), ROOT);
}

#[test]
fn static09_terminal_cancel_deadline_and_observer_unwind_restore_scope() {
    let (amounts, trace) = rich_trace();
    let terminal = amounts.len();
    for deadline in [false, true] {
        let calls = Cell::new(0usize);
        let mut cancel = || {
            calls.set(calls.get() + 1);
            assert!(calls.get() <= terminal);
            calls.get() == terminal
        };
        let mut clock = || {
            calls.set(calls.get() + 1);
            assert!(calls.get() <= terminal);
            Some(if calls.get() == terminal { 2 } else { 0 })
        };
        let mut ctx = if deadline {
            Context::ordinary().with_clock(&mut clock, 1)
        } else {
            Context::ordinary().with_cancellation(&mut cancel)
        };
        let mut events = Vec::new();
        let error = materialize_static_fixture_with_events(&RICH, DICT, &mut ctx, &mut |e| {
            events.push((calls.get(), e))
        })
        .unwrap_err();
        assert_eq!(error.code, if deadline { "DEADLINE" } else { "CANCELLED" });
        assert_eq!(error.path, Utf16::from("#"));
        assert!(error.is_control_failure());
        assert_eq!(calls.get(), terminal);
        assert_eq!(
            events,
            trace
                .iter()
                .copied()
                .filter(|(at, _)| *at < terminal)
                .collect::<Vec<_>>()
        );
    }
    for target in [
        MaterializeEvent::StaticSourceReady,
        MaterializeEvent::StaticDictionaryRead,
        MaterializeEvent::StaticWrapperReturn,
    ] {
        let mut ctx = Context::ordinary();
        let mut events = Vec::new();
        let result = catch_unwind(AssertUnwindSafe(|| {
            ctx.with_codegen_construction(|ctx| {
                materialize_static_fixture_with_events(&RICH, DICT, ctx, &mut |e| {
                    events.push(e);
                    if e == target {
                        panic!("static observer unwind");
                    }
                })
            })
        }));
        assert!(result.is_err());
        assert_eq!(events.last(), Some(&target));
        assert!(!ctx.in_codegen_construction());
        let before = ctx.charged_work();
        assert_eq!(
            materialize_static(&Literal::Text(0), A, &mut ctx),
            Value::string_utf8("A")
        );
        assert!(ctx.charged_work() > before);
    }
    for target in [
        "static-shared-size",
        "static-shared-copy-and-arc",
        "static-shared-return",
    ] {
        let mut ctx = Context::ordinary();
        let mut events = Vec::new();
        let result = catch_unwind(AssertUnwindSafe(|| {
            ctx.with_codegen_construction(|ctx| {
                Utf16::from_static_units(RAW_UNITS).into_shared_with_events(ctx, &mut |e| {
                    events.push(e);
                    if e == target {
                        panic!("static transition unwind");
                    }
                })
            })
        }));
        assert!(result.is_err());
        assert_eq!(events.last(), Some(&target));
        assert!(!ctx.in_codegen_construction());
        assert_eq!(RAW_UNITS, &[0, 13, 10, 0xd800, 0xd83d, 0xde00]);
    }
    for (decimal, target) in [
        (false, "path-growth"),
        (false, "path-relocation"),
        (false, "path-write"),
        (true, "decimal-growth"),
        (true, "decimal-append"),
    ] {
        let mut ctx = Context::ordinary();
        let mut events = Vec::new();
        let result = catch_unwind(AssertUnwindSafe(|| {
            ctx.with_codegen_construction(|ctx| {
                let mut path = Utf16::from_static_units(ROOT);
                let mut observer = |e| {
                    events.push(e);
                    if e == target {
                        panic!("static path observer unwind");
                    }
                };
                if decimal {
                    crate::value::decimal_path::append_decimal_index_with_events(
                        &mut path,
                        120,
                        ctx,
                        &mut observer,
                    )
                } else {
                    path.push_owned_path_segment_with_events(
                        &Utf16::from_static_units(SEGMENT),
                        ctx,
                        &mut observer,
                    )
                }
            })
        }));
        assert!(result.is_err());
        assert_eq!(events.last(), Some(&target));
        assert!(!ctx.in_codegen_construction());
        assert_eq!(ROOT, &[35]);
    }
}

#[test]
fn static10_nested_host_reentry_fresh_dictionary_and_production_raw_sources() {
    let reads = Cell::new(0usize);
    let nested = Cell::new(false);
    let mut nested_events = Vec::new();
    let mut control = |_| {
        if reads.get() == 1 && !nested.replace(true) {
            let value = materialize_static_fixture_with_events(
                &Literal::Text(0),
                B,
                &mut Context::ordinary(),
                &mut |e| nested_events.push(e),
            )
            .unwrap();
            assert_eq!(value, Value::string_utf8("B"));
        }
        Ok(())
    };
    let mut ctx = Context::ordinary().with_host_control(&mut control);
    let value = materialize_static_fixture_with_events(&Literal::Text(0), A, &mut ctx, &mut |e| {
        if e == MaterializeEvent::StaticDictionaryRead {
            reads.set(reads.get() + 1);
        }
    })
    .unwrap();
    drop(ctx);
    drop(control);
    assert!(nested.get());
    assert_eq!(value, Value::string_utf8("A"));
    assert!(nested_events.contains(&MaterializeEvent::StaticSourceReady));
    assert!(!nested_events.contains(&MaterializeEvent::CacheSlotsInit));
    assert_eq!(data::TEXTS.len(), 888);
    assert_eq!(data::TEXTS.iter().map(|s| s.len()).sum::<usize>(), 16114);
    // One whole DATA materialization, not a repeated denial campaign or native factory.
    let mut ctx = Context::catalog();
    let roots = materialize_installed_codegen_resources(&mut ctx).unwrap();
    let Value::Object(fields) = roots else {
        panic!("canonical raw bundle")
    };
    assert_eq!(fields.len(), 9);
    const RAW: [&str; 9] = [
        include_str!("../../../spec/core/schema.json"),
        include_str!("../../../spec/core/semantic-type-reference.schema.json"),
        include_str!("../../../spec/core/extension-package.schema.json"),
        include_str!("../../../spec/metamodel/generated/core-constraints.json"),
        include_str!("../../../spec/metamodel/generated/domain-policy.json"),
        include_str!("../../../spec/extensions/tables/package.json"),
        include_str!("../../../spec/extensions/actions/package.json"),
        include_str!("../../../spec/extensions/binding/package.json"),
        include_str!("../../../spec/extensions/binding-stable/package.json"),
    ];
    for (i, (name, value)) in fields.into_iter().enumerate() {
        assert_eq!(name, Utf16::from(NAMES[i]));
        let expected = crate::serialization::read_json_value(
            &RAW[i].encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(value, expected);
        let before = ctx.charged_work();
        let admitted =
            crate::value::admit_owned_json_at(value, Utf16::from("#"), &mut ctx).unwrap();
        assert_eq!(admitted, expected);
        assert!(ctx.charged_work() > before);
    }
}

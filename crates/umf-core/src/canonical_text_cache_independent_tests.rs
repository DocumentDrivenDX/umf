// SPDX-License-Identifier: MIT OR Apache-2.0
//! SOURCE ONLY / NATIVE UNEXECUTED. Child of canonical_codegen_resources.
//! Cache returns unadmitted Value; events are not successful JSON/factory proof.
use super::*;
use std::cell::{Cell, RefCell};
use std::panic::{AssertUnwindSafe, catch_unwind};

const DICTIONARY: &[&[u16]] = &[
    &[117, 110, 107, 110, 111, 119, 110], // unknown
    &[107, 47, 126],                      // k/~
    &[0, 13, 10, 0xd800, 0xd83d, 0xde00],
    &[],
];
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
            Literal::Text(0), // actual key/value cache reuse
        ]),
    },
    Member {
        key: 1,
        value: Literal::Text(3),
    },
]);
fn fixture(literal: &Literal, dictionary: &[&[u16]], ctx: &mut Context<'_>) -> Value {
    materialize_fixture_with_events(literal, dictionary, ctx, &mut |_| {}).unwrap()
}
fn host_error() -> EngineError {
    let mut e = EngineError::new(
        "CACHE_CONTROL",
        Utf16::new(vec![35, 47, 0xd800]),
        "first cache host refusal",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("cache-host-δ"));
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
fn trace() -> (Vec<usize>, Vec<(usize, MaterializeEvent)>) {
    let calls = Cell::new(0usize);
    let amounts = RefCell::new(Vec::new());
    let events = RefCell::new(Vec::new());
    let mut control = |amount| {
        calls.set(calls.get() + 1);
        amounts.borrow_mut().push(amount);
        Ok(())
    };
    fixture_with_trace(
        &mut Context::ordinary().with_host_control(&mut control),
        &mut |event| {
            events.borrow_mut().push((calls.get(), event));
        },
    )
    .unwrap();
    (amounts.into_inner(), events.into_inner())
}
fn fixture_with_trace(
    ctx: &mut Context<'_>,
    event: &mut dyn FnMut(MaterializeEvent),
) -> Result<Value, EngineError> {
    materialize_fixture_with_events(&RICH, DICTIONARY, ctx, event)
}
fn count(events: &[MaterializeEvent], target: MaterializeEvent) -> usize {
    events.iter().filter(|e| **e == target).count()
}
fn data_error(error: &EngineError, code: &str, message: &str) {
    assert_eq!(error.code, code);
    assert_eq!(error.message, Utf16::from(message));
    assert_eq!(error.path, Utf16::from("#"));
}

#[test]
fn cache01_real_first_copy_repeated_arc_return_and_last_owner_cleanup() {
    let dictionary: &[&[u16]] = &[&[65, 0xd800, 0xd83d, 0xde00]];
    let mut ctx = Context::ordinary();
    let mut path = Utf16::from("#");
    let mut events = Vec::new();
    let mut cache =
        CanonicalTextCache::new(dictionary, &mut ctx, &mut path, &mut |e| events.push(e)).unwrap();
    let first = cache
        .get(0, &mut ctx, &mut path, &mut |e| events.push(e))
        .unwrap();
    let weak = Arc::downgrade(cache.slots[0].as_ref().unwrap());
    assert_eq!(Arc::strong_count(cache.slots[0].as_ref().unwrap()), 2);
    let at = events.len();
    let second = cache
        .get(0, &mut ctx, &mut path, &mut |e| events.push(e))
        .unwrap();
    assert_eq!(first.units(), dictionary[0]);
    assert_eq!(second.units(), dictionary[0]);
    assert_eq!(count(&events, MaterializeEvent::TextCopy), 1);
    assert_eq!(count(&events, MaterializeEvent::ArcOwnerCreate), 1);
    assert_eq!(count(&events, MaterializeEvent::CachePublish), 1);
    assert_eq!(
        &events[at..],
        &[
            MaterializeEvent::DictionaryRead,
            MaterializeEvent::CacheLookup,
            MaterializeEvent::ArcReturnClone,
            MaterializeEvent::SharedWrapperReturn,
        ]
    );
    assert_eq!(Arc::strong_count(cache.slots[0].as_ref().unwrap()), 3);
    let mut detached = first.clone().into_units();
    detached[0] = 90;
    assert_eq!(first.units(), dictionary[0]);
    assert_eq!(second.units(), dictionary[0]);
    assert_eq!(Arc::strong_count(cache.slots[0].as_ref().unwrap()), 3);
    drop(first);
    drop(cache);
    assert_eq!(weak.strong_count(), 1);
    assert_eq!(second.units(), dictionary[0]); // returned owner outlives local cache
    drop(second);
    assert!(weak.upgrade().is_none());
}

#[test]
fn cache02_fresh_constructors_and_dictionary_binding_never_inherit_global_warmth() {
    assert_eq!(data::TEXTS.len(), 888);
    assert_eq!(
        data::TEXTS.iter().map(|units| units.len()).sum::<usize>(),
        16114
    );
    const A: &[&[u16]] = &[&[65]];
    const B: &[&[u16]] = &[&[66]];
    let mut traces = Vec::new();
    for dictionary in [A, B, A] {
        let mut events = Vec::new();
        let actual = materialize_fixture_with_events(
            &Literal::Text(0),
            dictionary,
            &mut Context::ordinary(),
            &mut |e| events.push(e),
        )
        .unwrap();
        assert_eq!(actual, Value::String(Utf16::new(dictionary[0].to_vec())));
        assert_eq!(count(&events, MaterializeEvent::CacheSlotsInit), 1);
        assert_eq!(count(&events, MaterializeEvent::TextCopy), 1);
        assert_eq!(count(&events, MaterializeEvent::CachePublish), 1);
        traces.push(events);
    }
    assert_eq!(traces[0], traces[1]);
    assert_eq!(traces[0], traces[2]);
    // Same private production cache/get/materialize body across separate roots.
    let dictionary: &[&[u16]] = &[&[65]];
    let mut ctx = Context::ordinary();
    let mut path = Utf16::from("#");
    let mut events = Vec::new();
    let mut cache =
        CanonicalTextCache::new(dictionary, &mut ctx, &mut path, &mut |e| events.push(e)).unwrap();
    for _ in 0..2 {
        let value = materialize(&Literal::Text(0), &mut cache, &mut ctx, &mut |e| {
            events.push(e)
        })
        .unwrap();
        assert_eq!(value, Value::string_utf8("A"));
    }
    assert_eq!(count(&events, MaterializeEvent::TextCopy), 1);
    assert_eq!(count(&events, MaterializeEvent::ArcReturnClone), 2);
    assert_eq!(count(&events, MaterializeEvent::RootComplete), 2);
}

#[test]
fn cache03_hit_rechecks_current_text_limit_and_full_json_admission_stays_paid() {
    let dictionary: &[&[u16]] = &[&[65, 66]];
    let mut path = Utf16::from("#");
    let mut ctx = Context::ordinary();
    let mut cache = CanonicalTextCache::new(dictionary, &mut ctx, &mut path, &mut |_| {}).unwrap();
    let first = cache.get(0, &mut ctx, &mut path, &mut |_| {}).unwrap();
    let mut events = Vec::new();
    let second = ctx
        .with_aggregate_text_limit(2, |ctx| {
            cache.get(0, ctx, &mut path, &mut |e| events.push(e))
        })
        .unwrap();
    assert_eq!(first.units(), second.units());
    assert_eq!(count(&events, MaterializeEvent::TextCopy), 0);
    events.clear();
    let error = ctx
        .with_aggregate_text_limit(1, |ctx| {
            cache.get(0, ctx, &mut path, &mut |e| events.push(e))
        })
        .unwrap_err();
    data_error(&error, "LIMIT", "Installed DATA text limit exceeded");
    assert_eq!(events, vec![MaterializeEvent::DictionaryRead]);
    assert_eq!(
        ctx.limits().max_text_units,
        crate::context::Limits::ordinary().max_text_units
    );
    assert!(cache.slots[0].is_some());
    let mut limits = crate::context::Limits::ordinary();
    limits.max_values = 0;
    let mut narrow =
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
    let error =
        crate::value::admit_owned_json_at(Value::String(second), Utf16::from("#"), &mut narrow)
            .unwrap_err();
    assert_eq!(error.code, "LIMIT");
    assert_eq!(error.path, Utf16::from("#"));
    assert_eq!(error.message, Utf16::from("JSON structural value limit exceeded"));
    let before = ctx.charged_work();
    let admitted =
        crate::value::admit_owned_json_at(Value::String(first), Utf16::from("#"), &mut ctx)
            .unwrap();
    assert_eq!(admitted, Value::string_utf8("AB"));
    assert!(ctx.charged_work() > before);
}

#[test]
fn cache04_checked_ids_structural_bounds_and_storage_overflow_refuse_without_root() {
    for (literal, dictionary) in [
        (Literal::Text(0), &[][..]),
        (Literal::Text(1), &[&[65u16][..]][..]),
        (Literal::Text(usize::MAX), &[&[65u16][..]][..]),
    ] {
        let mut events = Vec::new();
        let error = materialize_fixture_with_events(
            &literal,
            dictionary,
            &mut Context::ordinary(),
            &mut |e| events.push(e),
        )
        .unwrap_err();
        data_error(
            &error,
            "REQUEST",
            "Installed text ID is outside its dictionary",
        );
        assert!(!events.contains(&MaterializeEvent::CacheLookup));
        assert!(!events.contains(&MaterializeEvent::RootComplete));
    }
    const BAD_KEY: Literal = Literal::Object(&[Member {
        key: usize::MAX,
        value: Literal::Null,
    }]);
    let mut events = Vec::new();
    let error =
        materialize_fixture_with_events(&BAD_KEY, &[], &mut Context::ordinary(), &mut |e| {
            events.push(e)
        })
        .unwrap_err();
    data_error(
        &error,
        "REQUEST",
        "Installed text ID is outside its dictionary",
    );
    assert!(!events.contains(&MaterializeEvent::ScalarStore));
    const TREE: Literal = Literal::Array(&[Literal::Text(0), Literal::Text(0)]);
    for depth_case in [false, true] {
        let mut limits = crate::context::Limits::ordinary();
        if depth_case {
            limits.max_depth = 0;
        } else {
            limits.max_values = 2;
        }
        let mut ctx =
            Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap();
        let mut events = Vec::new();
        let error =
            materialize_fixture_with_events(&TREE, &[&[65]], &mut ctx, &mut |e| events.push(e))
                .unwrap_err();
        data_error(
            &error,
            "LIMIT",
            if depth_case {
                "Installed DATA structural limit exceeded"
            } else {
                "Installed DATA container frontier exceeded"
            },
        );
        assert!(!events.contains(&MaterializeEvent::RootComplete));
    }
    let mut events = Vec::new();
    let error = reserve::<u64>(
        usize::MAX,
        &mut Context::ordinary(),
        &mut Utf16::from("#"),
        &mut |e| events.push(e),
    )
    .unwrap_err();
    data_error(&error, "LIMIT", "Installed DATA storage size overflow");
    assert!(events.is_empty());
}

#[test]
fn cache05_unknown_order_units_and_full_value_match_original_raw_reader() {
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
                Value::String(Utf16::new(vec![0, 13, 10, 0xd800, 0xd83d, 0xde00])),
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
    let mut events = Vec::new();
    let value =
        materialize_fixture_with_events(&RICH, DICTIONARY, &mut Context::ordinary(), &mut |e| {
            events.push(e)
        })
        .unwrap();
    assert_eq!(value, expected);
    assert_eq!(count(&events, MaterializeEvent::TextCopy), 4);
    assert_eq!(count(&events, MaterializeEvent::ArcReturnClone), 5);
    let admitted =
        crate::value::admit_owned_json_at(value, Utf16::from("#"), &mut Context::ordinary())
            .unwrap();
    assert_eq!(admitted, expected);
    assert!(events.contains(&MaterializeEvent::RootComplete)); // DATA only
}

#[test]
fn cache06_cached_duplicate_keys_and_invalid_binary64_are_not_semantic_receipts() {
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
    let mut events = Vec::new();
    let value =
        materialize_fixture_with_events(&DUP, &[&[120]], &mut Context::ordinary(), &mut |e| {
            events.push(e)
        })
        .unwrap();
    assert_eq!(count(&events, MaterializeEvent::TextCopy), 1);
    assert_eq!(count(&events, MaterializeEvent::ArcReturnClone), 2);
    assert!(events.contains(&MaterializeEvent::RootComplete));
    let error =
        crate::value::admit_owned_json_at(value, Utf16::from("#"), &mut Context::ordinary())
            .unwrap_err();
    assert_eq!(error.code, "DUPLICATE_KEY");
    // Distinct private IDs can carry equal units too; never compare IDs as JSON keys.
    const EQUAL: Literal = Literal::Object(&[
        Member {
            key: 0,
            value: Literal::Null,
        },
        Member {
            key: 1,
            value: Literal::Null,
        },
    ]);
    let value = fixture(&EQUAL, &[&[120], &[120]], &mut Context::ordinary());
    assert_eq!(
        crate::value::admit_owned_json_at(value, Utf16::from("#"), &mut Context::ordinary())
            .unwrap_err()
            .code,
        "DUPLICATE_KEY"
    );
    for bits in [0x8000000000000000, 0x7ff0000000000000, 0x7ff8000000000042] {
        let value = fixture(&Literal::Binary64 { bits }, &[], &mut Context::ordinary());
        let Value::Number(n) = &value else {
            panic!("binary64 DATA")
        };
        assert_eq!(n.to_bits(), bits);
        let error =
            crate::value::admit_owned_json_at(value, Utf16::from("#"), &mut Context::ordinary())
                .unwrap_err();
        assert_eq!(error.code, "NUMBER");
        assert_eq!(error.path, Utf16::from("#"));
    }
    for literal in [
        Literal::Integer {
            negative: true,
            magnitude: 0,
        },
        Literal::Integer {
            negative: false,
            magnitude: 9_007_199_254_740_992,
        },
    ] {
        let error =
            materialize_fixture_with_events(&literal, &[], &mut Context::ordinary(), &mut |_| {})
                .unwrap_err();
        data_error(
            &error,
            "NUMBER",
            "Installed integer is outside the safe binary64 envelope",
        );
    }
}

#[test]
fn cache07_every_actual_small_fixture_admission_group_denies_before_effects() {
    let (amounts, baseline) = trace();
    for event in [
        MaterializeEvent::LiteralRead,
        MaterializeEvent::StorageReserve,
        MaterializeEvent::TextCopy,
        MaterializeEvent::MemberStore,
        MaterializeEvent::ScalarStore,
        MaterializeEvent::RootComplete,
        MaterializeEvent::CacheSlotsInit,
        MaterializeEvent::DictionaryRead,
        MaterializeEvent::CacheLookup,
        MaterializeEvent::ArcOwnerCreate,
        MaterializeEvent::CachePublish,
        MaterializeEvent::ArcReturnClone,
        MaterializeEvent::SharedWrapperReturn,
    ] {
        assert!(baseline.iter().any(|(_, e)| *e == event));
    }
    assert_eq!(amounts.last(), Some(&0));
    // Tiny authored fixture only: do not reparse canonical9 once per callback.
    // Group by actual callback ordinal; several effects may share one charge.
    for deny in 1..=amounts.len() {
        let calls = Cell::new(0usize);
        let mut control = |amount| {
            calls.set(calls.get() + 1);
            assert!(calls.get() <= deny, "callback after first cache refusal");
            assert_eq!(amount, amounts[calls.get() - 1]);
            if calls.get() == deny {
                Err(host_error())
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_host_control(&mut control);
        let mut events = Vec::new();
        let error =
            fixture_with_trace(&mut ctx, &mut |e| events.push((calls.get(), e))).unwrap_err();
        check_host(&error);
        assert_eq!(calls.get(), deny);
        assert_eq!(
            ctx.charged_work(),
            amounts[..deny].iter().map(|n| *n as u64).sum::<u64>()
        );
        assert_eq!(
            events,
            baseline
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
fn cache08_terminal_host_checks_and_observer_unwind_never_publish_complete_data() {
    let (amounts, baseline) = trace();
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
        let error =
            fixture_with_trace(&mut ctx, &mut |e| events.push((calls.get(), e))).unwrap_err();
        assert_eq!(error.code, if deadline { "DEADLINE" } else { "CANCELLED" });
        assert_eq!(error.path, Utf16::from("#"));
        assert!(error.is_control_failure());
        assert_eq!(calls.get(), terminal);
        assert_eq!(
            events,
            baseline
                .iter()
                .copied()
                .filter(|(at, _)| *at < terminal)
                .collect::<Vec<_>>()
        );
    }
    for target in [
        MaterializeEvent::CacheSlotsInit,
        MaterializeEvent::TextCopy,
        MaterializeEvent::CachePublish,
        MaterializeEvent::ArcReturnClone,
        MaterializeEvent::SharedWrapperReturn,
    ] {
        let mut ctx = Context::ordinary();
        let mut events = Vec::new();
        let result = catch_unwind(AssertUnwindSafe(|| {
            ctx.with_codegen_construction(|ctx| {
                fixture_with_trace(ctx, &mut |e| {
                    events.push(e);
                    if e == target {
                        panic!("cache observer unwind");
                    }
                })
            })
        }));
        assert!(result.is_err());
        assert_eq!(events.last(), Some(&target));
        assert!(!ctx.in_codegen_construction());
        let before = ctx.charged_work();
        let value = ctx
            .with_codegen_construction(|ctx| {
                materialize_fixture_with_events(&Literal::Text(0), &[&[65]], ctx, &mut |_| {})
            })
            .unwrap();
        assert_eq!(value, Value::string_utf8("A"));
        assert!(!ctx.in_codegen_construction());
        assert!(ctx.charged_work() > before);
    }
}

#[test]
fn cache09_nested_callback_constructor_and_denied_hit_release_only_local_owners() {
    let nested = Cell::new(false);
    let lookups = Cell::new(0usize);
    let outer_calls = Cell::new(0usize);
    let mut nested_events = Vec::new();
    let mut control = |_| {
        outer_calls.set(outer_calls.get() + 1);
        // Reenter specifically in the return admission after the second (warm)
        // lookup, not merely the first construction callback before cache init.
        if lookups.get() == 2 && !nested.replace(true) {
            let mut inner = Context::ordinary();
            let value = inner
                .with_codegen_construction(|ctx| {
                    materialize_fixture_with_events(&Literal::Text(0), &[&[66]], ctx, &mut |e| {
                        nested_events.push(e)
                    })
                })
                .unwrap();
            assert_eq!(value, Value::string_utf8("B"));
            assert!(!inner.in_codegen_construction());
        }
        Ok(())
    };
    const REPEATED: Literal = Literal::Array(&[Literal::Text(0), Literal::Text(0)]);
    let mut outer = Context::ordinary().with_host_control(&mut control);
    let value = outer
        .with_codegen_construction(|ctx| {
            materialize_fixture_with_events(&REPEATED, &[&[65]], ctx, &mut |e| {
                if e == MaterializeEvent::CacheLookup {
                    lookups.set(lookups.get() + 1);
                }
            })
        })
        .unwrap();
    assert!(!outer.in_codegen_construction());
    drop(outer);
    drop(control);
    assert!(nested.get());
    assert_eq!(
        value,
        Value::Array(vec![Value::string_utf8("A"), Value::string_utf8("A")])
    );
    assert_eq!(count(&nested_events, MaterializeEvent::TextCopy), 1);
    assert_eq!(count(&nested_events, MaterializeEvent::CachePublish), 1);
    assert!(outer_calls.get() > 0);
    let mut ctx = Context::ordinary();
    let mut path = Utf16::from("#");
    let mut cache = CanonicalTextCache::new(&[&[65]], &mut ctx, &mut path, &mut |_| {}).unwrap();
    drop(cache.get(0, &mut ctx, &mut path, &mut |_| {}).unwrap());
    let weak = Arc::downgrade(cache.slots[0].as_ref().unwrap());
    // Probe actual hit callback shape, without hardcoding fee or callback count.
    let hit_calls = Cell::new(0usize);
    let mut probe = |_| {
        hit_calls.set(hit_calls.get() + 1);
        Ok(())
    };
    drop(
        cache
            .get(
                0,
                &mut Context::ordinary().with_host_control(&mut probe),
                &mut path,
                &mut |_| {},
            )
            .unwrap(),
    );
    let deny = hit_calls.get();
    let calls = Cell::new(0usize);
    let mut control = |_| {
        calls.set(calls.get() + 1);
        assert!(calls.get() <= deny);
        if calls.get() == deny {
            Err(host_error())
        } else {
            Ok(())
        }
    };
    let mut events = Vec::new();
    let error = cache
        .get(
            0,
            &mut Context::ordinary().with_host_control(&mut control),
            &mut path,
            &mut |e| events.push(e),
        )
        .unwrap_err();
    check_host(&error);
    assert_eq!(calls.get(), deny);
    assert!(!events.contains(&MaterializeEvent::ArcReturnClone));
    assert!(!events.contains(&MaterializeEvent::SharedWrapperReturn));
    assert_eq!(weak.strong_count(), 1);
    drop(cache);
    assert!(weak.upgrade().is_none());
    assert_eq!(calls.get(), deny); // cleanup causes no after-denial callback
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! SOURCE ONLY / NATIVE UNEXECUTED. Child of canonical_codegen_resources.
//! Literal/manifest DATA and RootComplete are never semantic acceptance proof.
//! Static fixture routing only; the archived V2 Cached comparator stays distinct.
use super::*;
use std::cell::{Cell, RefCell};
use std::panic::{catch_unwind, AssertUnwindSafe};

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
// V2 fixture transport only: IDs resolve to the EXACT V1 UTF16 payloads.
const SMALL_TEXTS: &'static [&'static [u16]] = &[
    &[122],
    &[117, 110, 107, 110, 111, 119, 110],
    &[0, 13, 10, 0xd800, 0xd83d, 0xde00],
];
const SMALL: Literal = Literal::Object(&[
    Member {
        key: 0,
        value: Literal::Null,
    },
    Member {
        key: 1,
        value: Literal::Array(&[
            Literal::Bool(true),
            Literal::Integer {
                negative: true,
                magnitude: 7,
            },
            Literal::Binary64 {
                bits: 0x3ff4000000000000,
            },
            Literal::Text(2),
        ]),
    },
]);
fn raw_value(source: &str, ctx: &mut Context<'_>) -> Value {
    crate::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )
    .unwrap()
}
fn exact_value(actual: &Value, expected: &Value) {
    match (actual, expected) {
        (Value::Null, Value::Null) => {}
        (Value::Bool(a), Value::Bool(b)) => assert_eq!(a, b),
        (Value::Number(a), Value::Number(b)) => assert_eq!(a.to_bits(), b.to_bits()),
        (Value::String(a), Value::String(b)) => assert_eq!(a.units(), b.units()),
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len());
            for (a, b) in a.iter().zip(b) {
                exact_value(a, b);
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len());
            for ((ka, va), (kb, vb)) in a.iter().zip(b) {
                assert_eq!(ka.units(), kb.units());
                exact_value(va, vb);
            }
        }
        _ => panic!("DATA kind drift: {actual:?} versus {expected:?}"),
    }
}
fn host_error() -> EngineError {
    let mut e = EngineError::new(
        "MATERIALIZER_DENIED",
        Utf16::new(vec![47, 0xd800]),
        "original host refusal",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("literal-host-δ"));
    e.with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference)
}
fn host(actual: &EngineError) {
    let expected = host_error();
    assert_eq!(actual.code, expected.code);
    assert_eq!(actual.path, expected.path);
    assert_eq!(actual.message, expected.message);
    assert_eq!(actual.python_message_origin, expected.python_message_origin);
    assert!(actual.is_control_failure());
    assert!(!actual.is_python_schema_terminal());
}
fn trace(
    literal: &Literal,
    dictionary: &'static [&'static [u16]],
) -> (Vec<usize>, Vec<(usize, MaterializeEvent)>) {
    let calls = Cell::new(0usize);
    let amounts = RefCell::new(vec![]);
    let events = RefCell::new(vec![]);
    let mut control = |amount| {
        calls.set(calls.get() + 1);
        amounts.borrow_mut().push(amount);
        Ok(())
    };
    materialize_static_fixture_with_events(
        literal,
        dictionary,
        &mut Context::ordinary().with_host_control(&mut control),
        &mut |e| events.borrow_mut().push((calls.get(), e)),
    )
    .unwrap();
    (amounts.into_inner(), events.into_inner())
}

fn counted_nodes(value:&Value)->usize{1+match value{Value::Array(a)=>a.iter().map(counted_nodes).sum(),Value::Object(o)=>o.iter().map(|(_,v)|counted_nodes(v)).sum(),_=>0}}
fn counted_transport_controls(){
    crate::value::OwnedCoreOperation::with_context(&mut Context::catalog(),|ctx,op|{
        let bundle=materialize_counted_installed_codegen_resources(ctx,op)?;
        let Value::Object(raw)=&bundle.raw else{panic!("raw Object")};
        assert_eq!(raw.len(),9);
        for (i,(_,v)) in raw.iter().enumerate(){assert_eq!(bundle.counts[i],counted_nodes(v));}
        assert_eq!(&bundle.counts[..3],&[1318,1317,1317]); // oracle only, no production count
        let mut fields=bundle.into_fields(ctx)?;
        for i in 0..9 {
            let field=fields.next(ctx)?.unwrap();assert_eq!(field.name(),&Utf16::from(NAMES[i]));
            assert_eq!(field.hint.is_some(),i<3);
            let(key,carrier)=field.admit(op,ctx)?;assert_eq!(key,Utf16::from(NAMES[i]));
            let actual=carrier.into_resource(op,ctx)?;let expected=raw_value(RAW[i],ctx);
            exact_value(&actual,&expected);
        }
        assert!(fields.next(ctx)?.is_none());
        // Deliberate private-test corruption swaps payloads without counts.
        // Public callers cannot do this; mismatch cannot publish metadata.
        let mut corrupt=materialize_counted_installed_codegen_resources(ctx,op)?;
        let Value::Object(raw)=&mut corrupt.raw else{panic!("raw Object")};
        let (a,b)=raw.split_at_mut(1);std::mem::swap(&mut a[0].1,&mut b[0].1);
        let mut fields=corrupt.into_fields(ctx)?;
        for _ in 0..2 {
            let(_,carrier)=fields.next(ctx)?.unwrap().admit(op,ctx)?;
            assert!(carrier.into_core_metadata(op,ctx)?.1.is_none());
        }
        Ok(())
    }).unwrap();
}
fn counted_return_denials(){
    let calls=Cell::new(0usize);let mut control=|_|{calls.set(calls.get()+1);Ok(())};
    let mut ctx=Context::ordinary().with_host_control(&mut control);
    let mut source=StaticTextSource::new(SMALL_TEXTS,&mut ctx,&mut Utf16::default(),&mut |_|{}).unwrap();
    let before=calls.get();let(value,n)=materialize_counted(&SMALL,&mut source,&mut ctx,&mut |_|{}).unwrap();
    assert_eq!(n,counted_nodes(&value));let steps=calls.get()-before;
    for deny in 1..=steps {
        let enabled=Cell::new(false);let seen=Cell::new(0usize);let late=Cell::new(0usize);let failed=Cell::new(false);
        let mut control=|_|{if failed.get(){late.set(late.get()+1);return Err(host_error());}if enabled.get(){let n=seen.get()+1;seen.set(n);if n==deny{failed.set(true);return Err(host_error());}}Ok(())};
        let mut ctx=Context::ordinary().with_host_control(&mut control);
        let mut source=StaticTextSource::new(SMALL_TEXTS,&mut ctx,&mut Utf16::default(),&mut |_|{}).unwrap();
        enabled.set(true);let error=materialize_counted(&SMALL,&mut source,&mut ctx,&mut |_|{}).unwrap_err();
        host(&error);assert_eq!(seen.get(),deny);assert_eq!(late.get(),0);
    }
}
#[test]
fn literal01_all_nine_actual_owned_roots_match_raw_core_reader_bits_units_and_order() {
    counted_transport_controls();
    counted_return_denials();
    let mut ctx = Context::catalog();
    let actual = materialize_installed_codegen_resources(&mut ctx).unwrap();
    let after_materialization = ctx.charged_work();
    assert!(after_materialization > 0);
    let Value::Object(fields) = actual else {
        panic!("installed roots")
    };
    assert_eq!(fields.len(), 9);
    assert_eq!(data::SOURCES.len(), 9);
    assert_eq!(RAW.iter().map(|s| s.len()).sum::<usize>(), 394103);
    for (i, ((name, value), source)) in fields.into_iter().zip(data::SOURCES.iter()).enumerate() {
        assert_eq!(name, Utf16::from(NAMES[i]));
        assert_eq!(source.name, NAMES[i]);
        assert_eq!(source.path, PATHS[i]);
        assert_eq!(source.bytes, RAW[i].len());
        let expected = raw_value(RAW[i], &mut ctx);
        exact_value(&value, &expected);
        // Explicitly run the actual COMPLETE shared profile admission. Materialized
        // DATA alone is not an admitted input or schema/Registry success.
        let admitted =
            crate::value::admit_owned_json_at(value, Utf16::from("#"), &mut ctx).unwrap();
        exact_value(&admitted, &expected);
    }
    assert!(ctx.charged_work() > after_materialization);
}

#[test]
fn literal02_authored_unknown_text_numeric_data_is_raw_until_full_admission() {
    let value = materialize_static_fixture_with_events(
        &SMALL,
        SMALL_TEXTS,
        &mut Context::ordinary(),
        &mut |_| {},
    )
    .unwrap();
    let expected = Value::Object(vec![
        (Utf16::from("z"), Value::Null),
        (
            Utf16::from("unknown"),
            Value::Array(vec![
                Value::Bool(true),
                Value::Number(-7.0),
                Value::Number(1.25),
                Value::String(Utf16::new(vec![0, 13, 10, 0xd800, 0xd83d, 0xde00])),
            ]),
        ),
    ]);
    exact_value(&value, &expected);
    for bits in [0x8000000000000000, 0x7ff0000000000000, 0x7ff8000000000042] {
        let raw = materialize_static_fixture_with_events(
            &Literal::Binary64 { bits },
            &[],
            &mut Context::ordinary(),
            &mut |_| {},
        )
        .unwrap();
        let Value::Number(number) = &raw else {
            panic!("raw binary64")
        };
        assert_eq!(number.to_bits(), bits);
        let error =
            crate::value::admit_owned_json_at(raw, Utf16::from("#"), &mut Context::ordinary())
                .unwrap_err();
        assert_eq!(error.code, "NUMBER");
        assert_eq!(error.path, Utf16::from("#"));
    }
    const DUP_TEXTS: &'static [&'static [u16]] = &[&[120]];
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
    let raw = materialize_static_fixture_with_events(
        &DUP,
        DUP_TEXTS,
        &mut Context::ordinary(),
        &mut |_| {},
    )
    .unwrap();
    let Value::Object(members) = &raw else {
        panic!("raw duplicate DATA")
    };
    assert_eq!(members.len(), 2);
    assert_eq!(
        crate::value::admit_owned_json_at(raw, Utf16::from("#"), &mut Context::ordinary())
            .unwrap_err()
            .code,
        "DUPLICATE_KEY"
    );
    for literal in [
        Literal::Integer {
            negative: true,
            magnitude: 0,
        },
        Literal::Integer {
            negative: false,
            magnitude: 9007199254740992,
        },
    ] {
        let mut events = vec![];
        let error = materialize_static_fixture_with_events(
            &literal,
            &[],
            &mut Context::ordinary(),
            &mut |e| events.push(e),
        )
        .unwrap_err();
        assert_eq!(error.code, "NUMBER");
        assert_eq!(error.path, Utf16::from("#"));
        assert!(!events.contains(&MaterializeEvent::RootComplete));
    }
}

#[test]
fn literal03_actual_depth_node_frontier_and_text_limits_refuse_before_completion() {
    const TREE: Literal = Literal::Array(&[Literal::Null, Literal::Bool(true)]);
    const TOO_LONG_TEXTS: &'static [&'static [u16]] = &[&[0, 0xd800, 65]];
    const TOO_LONG: Literal = Literal::Text(0);
    let mut limits = crate::context::Limits::ordinary();
    limits.max_values = 3;
    limits.max_depth = 1;
    let make = |limits| {
        Context::with_limits(crate::context::ResourceProfile::Cooperative, limits).unwrap()
    };
    assert_eq!(
        materialize_static_fixture_with_events(&TREE, &[], &mut make(limits), &mut |_| {}).unwrap(),
        Value::Array(vec![Value::Null, Value::Bool(true)])
    );
    for mode in 0..3 {
        let mut limits = limits;
        let literal = if mode == 2 {
            limits.max_text_units = 2;
            &TOO_LONG
        } else {
            if mode == 0 {
                limits.max_values = 2;
            } else {
                limits.max_depth = 0;
            }
            &TREE
        };
        let dictionary: &'static [&'static [u16]] = if mode == 2 { TOO_LONG_TEXTS } else { &[] };
        let mut events = vec![];
        let error = materialize_static_fixture_with_events(
            literal,
            dictionary,
            &mut make(limits),
            &mut |e| events.push(e),
        )
        .unwrap_err();
        assert_eq!(error.code, "LIMIT");
        assert_eq!(error.path, Utf16::from("#"));
        assert!(!events.contains(&MaterializeEvent::RootComplete));
        assert_eq!(
            error.message,
            Utf16::from(match mode {
                0 => "Installed DATA container frontier exceeded",
                1 => "Installed DATA structural limit exceeded",
                _ => "Installed DATA text limit exceeded",
            })
        );
    }
}

#[test]
fn literal04_every_actual_callback_group_refuses_without_returned_data_or_later_events() {
    let (amounts, trace) = trace(&SMALL, SMALL_TEXTS);
    for event in [
        MaterializeEvent::LiteralRead,
        MaterializeEvent::StorageReserve,
        MaterializeEvent::StaticSourceReady,
        MaterializeEvent::StaticDictionaryRead,
        MaterializeEvent::StaticWrapperReturn,
        MaterializeEvent::MemberStore,
        MaterializeEvent::ScalarStore,
        MaterializeEvent::RootComplete,
    ] {
        assert!(trace.iter().any(|(_, e)| *e == event));
    }
    assert_eq!(amounts.last(), Some(&0));
    // Static fixture route must not be disguised Cached V2 materialization.
    for obsolete in [
        MaterializeEvent::TextCopy,
        MaterializeEvent::CacheSlotsInit,
        MaterializeEvent::DictionaryRead,
        MaterializeEvent::CacheLookup,
        MaterializeEvent::ArcOwnerCreate,
        MaterializeEvent::CachePublish,
        MaterializeEvent::ArcReturnClone,
        MaterializeEvent::SharedWrapperReturn,
    ] {
        assert!(!trace.iter().any(|(_, event)| *event == obsolete));
    }
    for deny in 1..=amounts.len() {
        let calls = Cell::new(0usize);
        let mut seen = vec![];
        let mut control = |amount| {
            calls.set(calls.get() + 1);
            assert!(calls.get() <= deny, "callback after first error");
            assert_eq!(amount, amounts[calls.get() - 1]);
            if calls.get() == deny {
                Err(host_error())
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_host_control(&mut control);
        let error =
            materialize_static_fixture_with_events(&SMALL, SMALL_TEXTS, &mut ctx, &mut |e| {
                seen.push((calls.get(), e))
            })
            .unwrap_err();
        host(&error);
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
        assert!(!seen
            .iter()
            .any(|(_, e)| *e == MaterializeEvent::RootComplete));
    }
}

#[test]
fn literal05_terminal_zero_check_and_observer_unwind_cannot_return_a_complete_value() {
    let (amounts, trace) = trace(&SMALL, SMALL_TEXTS);
    let final_call = amounts.len();
    assert_eq!(amounts.last(), Some(&0));
    for deadline in [false, true] {
        let checks = Cell::new(0usize);
        let mut events = vec![];
        let mut cancel = || {
            checks.set(checks.get() + 1);
            assert!(checks.get() <= final_call);
            checks.get() == final_call
        };
        let mut clock = || {
            checks.set(checks.get() + 1);
            assert!(checks.get() <= final_call);
            Some(if checks.get() == final_call { 2 } else { 0 })
        };
        let mut ctx = if deadline {
            Context::ordinary().with_clock(&mut clock, 1)
        } else {
            Context::ordinary().with_cancellation(&mut cancel)
        };
        let error =
            materialize_static_fixture_with_events(&SMALL, SMALL_TEXTS, &mut ctx, &mut |e| {
                events.push((checks.get(), e))
            })
            .unwrap_err();
        assert_eq!(error.code, if deadline { "DEADLINE" } else { "CANCELLED" });
        assert_eq!(error.path, Utf16::from("#"));
        assert!(error.is_control_failure());
        assert_eq!(checks.get(), final_call);
        assert_eq!(
            events,
            trace
                .iter()
                .copied()
                .filter(|(at, _)| *at < final_call)
                .collect::<Vec<_>>()
        );
    }
    for target in [
        MaterializeEvent::LiteralRead,
        MaterializeEvent::StorageReserve,
        MaterializeEvent::StaticSourceReady,
        MaterializeEvent::StaticDictionaryRead,
        MaterializeEvent::StaticWrapperReturn,
        MaterializeEvent::MemberStore,
        MaterializeEvent::ScalarStore,
        MaterializeEvent::RootComplete,
    ] {
        let mut events = vec![];
        let mut ctx = Context::ordinary();
        let result = catch_unwind(AssertUnwindSafe(|| {
            ctx.with_codegen_construction(|ctx| {
                materialize_static_fixture_with_events(&SMALL, SMALL_TEXTS, ctx, &mut |e| {
                    events.push(e);
                    if e == target {
                        panic!("materializer observer unwind");
                    }
                })
            })
        }));
        assert!(result.is_err());
        assert_eq!(events.last(), Some(&target));
        assert!(!ctx.in_codegen_construction());
        assert!(ctx.charged_work() > 0);
    }
}

#[test]
fn literal06_actual_manifest_is_exact_nine_source_provenance_not_an_acceptance_report() {
    let mut ctx = Context::ordinary();
    let before = ctx.charged_work();
    let manifest = installed_resource_source_manifest(&mut ctx).unwrap();
    assert!(ctx.charged_work() > before);
    let Value::Object(fields) = manifest else {
        panic!("manifest")
    };
    assert_eq!(
        fields
            .iter()
            .map(|(k, _)| k.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        vec!["profile", "inputProfile", "resources"]
    );
    assert_eq!(
        fields[0].1,
        Value::string_utf8("umf.codegen.installed-source-manifest/1")
    );
    assert_eq!(fields[1].1, Value::string_utf8("installed-canonical/1"));
    let Value::Array(rows) = &fields[2].1 else {
        panic!("resources")
    };
    assert_eq!(rows.len(), 9);
    for (row, source) in rows.iter().zip(data::SOURCES) {
        let Value::Object(fields) = row else {
            panic!("source row")
        };
        assert_eq!(
            fields
                .iter()
                .map(|(k, _)| k.to_utf8().unwrap())
                .collect::<Vec<_>>(),
            vec!["name", "path", "bytes", "sha256"]
        );
        assert_eq!(fields[0].1, Value::string_utf8(source.name));
        assert_eq!(fields[1].1, Value::string_utf8(source.path));
        assert_eq!(fields[2].1, Value::Number(source.bytes as f64));
        assert_eq!(fields[3].1, Value::string_utf8(source.sha256));
    }
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Independent encoded-loader SOURCE controls. Native UNCOMPILED/UNEXECUTED.
//! Child of schema.rs; H owns include. Encoding establishes no schema validity.
use super::*;
use crate::schema::admitted_bank::{BankRoot, SchemaBank};
use crate::serialization::{
    CompletedOwnedJson, Format, read_construction_json_completed,
    read_construction_json_completed_with_events, read_json_value,
};
use std::cell::{Cell, RefCell};

const TEXT: &str = include_str!("schema_metas.json");
const IDS: [&str; 20] = [
    "https://json-schema.org/draft/2020-12/meta/core",
    "https://json-schema.org/draft/2020-12/meta/validation",
    "https://json-schema.org/draft/2020-12/meta/content",
    "https://json-schema.org/draft/2020-12/meta/format-annotation",
    "https://json-schema.org/draft/2019-09/meta/content",
    "https://json-schema.org/draft/2020-12/meta/meta-data",
    "https://json-schema.org/draft/2019-09/meta/core",
    "https://json-schema.org/draft/2019-09/meta/applicator",
    "https://json-schema.org/draft/2020-12/meta/applicator",
    "http://json-schema.org/draft-04/schema",
    "http://json-schema.org/draft-03/schema",
    "https://json-schema.org/draft/2019-09/meta/meta-data",
    "https://json-schema.org/draft/2020-12/schema",
    "https://json-schema.org/draft/2019-09/meta/validation",
    "https://json-schema.org/draft/2019-09/meta/format",
    "https://json-schema.org/draft/2020-12/meta/format-assertion",
    "https://json-schema.org/draft/2020-12/meta/unevaluated",
    "https://json-schema.org/draft/2019-09/schema",
    "http://json-schema.org/draft-06/schema",
    "http://json-schema.org/draft-07/schema",
];
fn units(text: &str) -> Vec<u16> {
    text.encode_utf16().collect()
}
fn field<'a>(v: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = v else {
        panic!("literal object")
    };
    &fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(name))
        .unwrap()
        .1
}
fn limited<'a>(limits: crate::context::Limits) -> Context<'a> {
    Context::with_limits(crate::ResourceProfile::Cooperative, limits).unwrap()
}
fn raw(source: &[u16], limits: crate::context::Limits) -> Result<Value, EngineError> {
    read_json_value(source, Format::Json, &mut limited(limits))
}
fn host() -> EngineError {
    let mut e = EngineError::new(
        "CANCELLED",
        Utf16::new(vec![47, 0xd800]),
        "original encoded host terminal",
    );
    e.python_message_origin = Some(crate::python_value::PyText::from_utf8("encoding-host-δ"));
    e.with_python_schema_terminal(crate::error::PythonSchemaTerminal::LocalReference)
}
fn same_host(a: &EngineError, b: &EngineError) {
    assert_eq!(a.code, b.code);
    assert_eq!(a.message, b.message);
    assert_eq!(a.path, b.path);
    assert_eq!(a.python_message_origin, b.python_message_origin);
    assert!(a.is_control_failure());
    assert!(!a.is_python_schema_terminal());
}

#[test]
fn actual_loader_completed_receipt_preserves_all_twenty_roles_selected_roots_and_opaque_text() {
    let source = units(TEXT);
    assert_eq!(source.len(), 38349);
    let original = raw(&source, Context::catalog().limits()).unwrap();
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let encoded = read_encoded_retained_metaschema(ctx)?;
        let materialized = read_retained_metaschema_with(
            TEXT,
            ctx,
            |s| s.encode_utf16().collect(),
            |s, c| read_construction_json_completed(s, c),
        )?;
        assert_eq!(encoded.value().as_ref(), &original);
        assert_eq!(encoded.value(), materialized.value());
        assert!(encoded.compatible(ctx)?);
        assert!(encoded.structure().is_some());
        let bank =
            SchemaBank::from_completed_reader(Arc::new(encoded), SchemaDialect::Draft2020_12, ctx)?;
        let oracle =
            SchemaBank::from_meta(Arc::new(original.clone()), SchemaDialect::Draft2020_12, ctx)?;
        assert_eq!(bank.len(), 20);
        assert_eq!(oracle.len(), 20);
        let Value::Array(rows) = field(&original, "resources") else {
            panic!("canonical catalogue")
        };
        assert_eq!(rows.len(), 20);
        for (i, id) in IDS.iter().enumerate() {
            assert_eq!(field(&rows[i], "id"), &Value::String(Utf16::from(*id)));
            let (actual, schema) = bank.get(i).unwrap();
            assert_eq!(actual, &Utf16::from(*id));
            assert_eq!(schema, field(&rows[i], "schema"));
            assert_eq!(bank.get(i), oracle.get(i));
        }
        assert!(bank.get(20).is_none());
        let selected = field(field(&original, "metaschemas"), "Draft202012Validator");
        assert_eq!(bank.root_checked(BankRoot::Meta), Some(selected));
        assert_eq!(oracle.root_checked(BankRoot::Meta), Some(selected));
        assert_eq!(
            field(selected, "$id"),
            &Value::string_utf8("https://json-schema.org/draft/2020-12/schema")
        );
        assert_eq!(
            field(&original, "profile"),
            &Value::string_utf8("umf.r2.schema-metaschemas/1")
        );
        assert_eq!(
            field(field(&original, "sources"), "python"),
            &Value::string_utf8("3.11")
        );
        assert_eq!(
            field(field(&rows[0], "schema"), "$dynamicAnchor"),
            &Value::string_utf8("meta")
        );
        // Opaque prose must survive exactly; not only the recognised schema keys.
        assert_eq!(
            field(selected, "$comment"),
            field(
                field(
                    field(materialized.value(), "metaschemas"),
                    "Draft202012Validator"
                ),
                "$comment"
            )
        );
        assert_eq!(
            field(selected, "allOf"),
            field(
                field(
                    field(materialized.value(), "metaschemas"),
                    "Draft202012Validator"
                ),
                "allOf"
            )
        );
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(!ctx.in_codegen_construction());
}

#[test]
fn pinned_text_limit_precedes_parse_and_full_text_debit_precedes_admitted_marker() {
    let mut limits = Context::catalog().limits();
    limits.max_text_units = 38348;
    let events = RefCell::new(Vec::new());
    let mut event = |name| events.borrow_mut().push(name);
    let mut ctx = limited(limits);
    let error = ctx
        .with_codegen_construction(|ctx| {
            read_encoded_retained_metaschema_with_events(ctx, &mut event)
        })
        .unwrap_err();
    assert_eq!(error.code, "LIMIT");
    assert!(error.path.units().is_empty());
    assert_eq!(error.message, Utf16::from("Source text limit exceeded"));
    assert_eq!(*events.borrow(), vec!["encoded-source-borrow"]);
    let sum = Cell::new(0usize);
    let mut meter = |n| {
        sum.set(sum.get() + n);
        Ok(())
    };
    let start = Cell::new(0usize);
    let seen = Cell::new(false);
    let mut event = |name| {
        if name == "source-text-admitted" {
            assert_eq!(sum.get() - start.get(), 38349);
            seen.set(true);
        }
    };
    let mut exact = Context::catalog().limits();
    exact.max_text_units = 38349;
    let mut ctx = limited(exact).with_meter(&mut meter);
    ctx.with_codegen_construction(|ctx| {
        start.set(sum.get());
        read_encoded_retained_metaschema_with_events(ctx, &mut event).map(|_| ())
    })
    .unwrap();
    assert!(seen.get());
}

#[test]
fn pinned_depth_and_node_limits_still_run_original_parser_and_never_complete_receipt() {
    for mode in [0, 1] {
        let mut limits = Context::catalog().limits();
        if mode == 0 {
            limits.max_depth = 0;
        } else {
            limits.max_values = 1;
        }
        let expected = raw(&units(TEXT), limits).unwrap_err();
        assert_eq!(expected.code, "LIMIT");
        let seen = RefCell::new(Vec::new());
        let mut event = |name| seen.borrow_mut().push(name);
        let mut ctx = limited(limits);
        let actual = ctx
            .with_codegen_construction(|ctx| {
                read_encoded_retained_metaschema_with_events(ctx, &mut event)
            })
            .unwrap_err();
        assert_eq!(actual, expected);
        assert!(seen.borrow().contains(&"source-text-admitted"));
        assert!(!seen.borrow().contains(&"encoded-source-completed"));
        assert!(!seen.borrow().contains(&"owned-publication"));
        assert!(!ctx.in_codegen_construction());
    }
}

#[test]
fn shared_completed_reader_fixture_errors_and_utf16_remain_real_parser_checks() {
    // Pinned source has no replacement flag. Mutations use its SAME completed
    // reader API, and make no claim of injected errors in the pinned loader.
    for text in [
        "{",
        "{} trailing",
        "\u{feff}{}",
        "-0 trailing",
        r#"{"a/b~":[-0]}"#,
        r#"{"x":0,"x":1e999}"#,
    ] {
        let source = units(text);
        let expected = raw(&source, Context::catalog().limits()).unwrap_err();
        let seen = RefCell::new(Vec::new());
        let mut event = |name| seen.borrow_mut().push(name);
        let actual = Context::catalog()
            .with_codegen_construction(|ctx| {
                read_construction_json_completed_with_events(&source, ctx, &mut event)
            })
            .unwrap_err();
        assert_eq!(actual, expected);
        assert!(!seen.borrow().contains(&"owned-publication"));
        if text == "-0 trailing" {
            assert_eq!(actual.code, "NUMBER");
            assert!(actual.path.units().is_empty());
        }
        if text == r#"{"a/b~":[-0]}"# {
            assert_eq!(actual.code, "NUMBER");
            assert_eq!(actual.path, Utf16::from("/a~1b~0/0"));
        }
        if text == r#"{"x":0,"x":1e999}"# {
            assert_eq!(actual.code, "DUPLICATE_KEY");
            assert!(actual.path.units().is_empty());
        }
    }
    let source = vec![123, 34, 0xd800, 34, 58, 34, 0xdc00, 0xd83d, 0xde00, 34, 125];
    let expected = Value::Object(vec![(
        Utf16::new(vec![0xd800]),
        Value::String(Utf16::new(vec![0xdc00, 0xd83d, 0xde00])),
    )]);
    let original = raw(&source, Context::catalog().limits()).unwrap();
    assert_eq!(original, expected);
    Context::catalog()
        .with_codegen_construction(|ctx| {
            let completed = read_construction_json_completed(&source, ctx)?;
            assert_eq!(completed.value().as_ref(), &expected);
            Ok::<(), EngineError>(())
        })
        .unwrap();
    let extended = format!(
        r#"{{"x-encoded-unknown":{{"a/b~":[null,"\ud800"]}},{}"#,
        &TEXT[1..]
    );
    Context::catalog()
        .with_codegen_construction(|ctx| {
            let parsed = read_construction_json_completed(&units(&extended), ctx)?;
            assert_eq!(
                field(field(parsed.value(), "x-encoded-unknown"), "a/b~"),
                &Value::Array(vec![Value::Null, Value::String(Utf16::new(vec![0xd800]))])
            );
            Ok::<(), EngineError>(())
        })
        .unwrap();
}

#[test]
fn fresh_loads_parse_again_and_actual_lifetime_cannot_be_replaced_by_arc_value() {
    let mut ctx = Context::catalog();
    let count = Cell::new(0usize);
    let mut event = |name| {
        if name == "encoded-source-completed" {
            count.set(count.get() + 1);
        }
    };
    let old = ctx
        .with_codegen_construction(|ctx| {
            let parsed = read_encoded_retained_metaschema_with_events(ctx, &mut event)?;
            assert!(parsed.compatible(ctx)?);
            Ok(parsed)
        })
        .unwrap();
    assert!(!old.compatible(&mut ctx).unwrap());
    ctx.with_codegen_construction(|ctx| {
        assert!(!old.compatible(ctx)?);
        let current = read_encoded_retained_metaschema_with_events(ctx, &mut event)?;
        assert_eq!(old.value(), current.value());
        assert!(current.compatible(ctx)?);
        let repeated = read_encoded_retained_metaschema_with_events(ctx, &mut event)?;
        assert_eq!(repeated.value(), current.value());
        assert!(repeated.compatible(ctx)?);
        ctx.with_codegen_construction(|inner| {
            assert!(!current.compatible(inner)?);
            Ok::<(), EngineError>(())
        })?;
        assert!(current.compatible(ctx)?);
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert_eq!(count.get(), 3);
    let absent = read_encoded_retained_metaschema(&mut Context::catalog()).unwrap_err();
    assert_eq!(absent.code, "RESOURCE_PROFILE_UNAVAILABLE");
    // An arbitrary Arc is admitted through the original bank route, not a parser
    // receipt. Bad selected root must precede a simultaneously malformed catalogue.
    let tree = Value::Object(vec![
        (
            Utf16::from("metaschemas"),
            Value::Object(vec![(
                Utf16::from("Draft202012Validator"),
                Value::Object(vec![(Utf16::from("minimum"), Value::Number(f64::NAN))]),
            )]),
        ),
        (Utf16::from("resources"), Value::Null),
    ]);
    let expected = schema_json_with_mode(
        field(field(&tree, "metaschemas"), "Draft202012Validator"),
        &mut Context::catalog(),
        false,
        false,
    )
    .unwrap_err();
    assert_eq!(expected.code, "NUMBER");
    assert_eq!(expected.path, Utf16::from("#/minimum"));
    ctx.with_codegen_construction(|ctx| {
        let error =
            SchemaBank::from_meta(Arc::new(tree), SchemaDialect::Draft2020_12, ctx).unwrap_err();
        assert_eq!(error, expected);
        Ok::<(), EngineError>(())
    })
    .unwrap();
}

#[test]
fn terminal_denials_at_real_loader_boundaries_never_publish_or_continue_callbacks() {
    let calls = Cell::new(0usize);
    let mut meter = |_| {
        calls.set(calls.get() + 1);
        Ok(())
    };
    let effects = RefCell::new(Vec::new());
    let mut event = |name| effects.borrow_mut().push((name, calls.get()));
    let mut ctx = Context::catalog().with_meter(&mut meter);
    ctx.with_codegen_construction(|ctx| {
        read_encoded_retained_metaschema_with_events(ctx, &mut event)
    })
    .unwrap();
    let effects = effects.into_inner();
    let targets: Vec<_> = [
        "source-text-admitted",
        "owned-publication",
        "encoded-source-completed",
    ]
    .iter()
    .map(|name| effects.iter().find(|(n, _)| n == name).unwrap().1)
    .collect();
    for denied in targets {
        let wanted = host();
        let calls = Cell::new(0usize);
        let stopped = Cell::new(false);
        let after = Cell::new(0usize);
        let mut meter = |_| {
            if stopped.get() {
                after.set(after.get() + 1);
            }
            calls.set(calls.get() + 1);
            if calls.get() == denied {
                stopped.set(true);
                Err(wanted.clone())
            } else {
                Ok(())
            }
        };
        let seen = RefCell::new(Vec::new());
        let mut event = |name| seen.borrow_mut().push((name, calls.get()));
        let mut ctx = Context::catalog().with_meter(&mut meter);
        let error = ctx
            .with_codegen_construction(|ctx| {
                read_encoded_retained_metaschema_with_events(ctx, &mut event)
            })
            .unwrap_err();
        same_host(&error, &wanted);
        assert_eq!(calls.get(), denied);
        assert_eq!(after.get(), 0);
        assert!(!ctx.in_codegen_construction());
        let prior: Vec<_> = effects
            .iter()
            .copied()
            .filter(|(_, at)| *at < denied)
            .collect();
        assert_eq!(*seen.borrow(), prior);
        assert!(
            !seen
                .borrow()
                .iter()
                .any(|(name, _)| *name == "encoded-source-completed")
        );
    }
    // Actual deadline control, before the source's first parser event.
    let reads = Cell::new(0usize);
    let mut clock = || {
        reads.set(reads.get() + 1);
        Ok(Some(if reads.get() == 1 { 0 } else { 2 }))
    };
    let events = RefCell::new(Vec::new());
    let mut event = |name| events.borrow_mut().push(name);
    let mut ctx = Context::catalog().with_fallible_clock(&mut clock, 1);
    let error = ctx
        .with_codegen_construction(|ctx| {
            read_encoded_retained_metaschema_with_events(ctx, &mut event)
        })
        .unwrap_err();
    assert_eq!(error.code, "DEADLINE");
    assert!(error.is_control_failure());
    assert_eq!(reads.get(), 2);
    assert_eq!(*events.borrow(), vec!["encoded-source-borrow"]);
}

#[test]
fn nested_reentry_and_unwind_leave_no_partial_receipt_and_restore_parent_lifetime() {
    let mut ctx = Context::catalog();
    ctx.with_codegen_construction(|ctx| {
        let parent = read_encoded_retained_metaschema(ctx)?;
        for marker in [
            "source-text-admitted",
            "owned-publication",
            "encoded-source-completed",
        ] {
            let partial = RefCell::new(None::<CompletedOwnedJson>);
            let panicking = Cell::new(false);
            let after = Cell::new(0usize);
            let mut meter = |_| {
                if panicking.get() {
                    after.set(after.get() + 1);
                }
                Ok(())
            };
            let mut child = Context::catalog().with_meter(&mut meter);
            let mut event = |name| {
                if name == marker {
                    panicking.set(true);
                    panic!("independent encoded unwind")
                }
            };
            let unwind = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let result = child
                    .with_codegen_construction(|ctx| {
                        read_encoded_retained_metaschema_with_events(ctx, &mut event)
                    })
                    .unwrap();
                *partial.borrow_mut() = Some(result);
            }));
            assert!(unwind.is_err());
            assert!(partial.borrow().is_none());
            assert_eq!(after.get(), 0);
            assert!(!child.in_codegen_construction());
            assert!(parent.compatible(ctx)?);
        }
        let entered = Cell::new(false);
        let mut event = |name| {
            if name == "source-text-admitted" && !entered.replace(true) {
                let mut foreign = Context::catalog();
                foreign
                    .with_codegen_construction(|inner| {
                        let tiny =
                            read_construction_json_completed(&units(r#"{"nested":true}"#), inner)?;
                        assert_eq!(field(tiny.value(), "nested"), &Value::Bool(true));
                        assert!(!parent.compatible(inner)?);
                        Ok::<(), EngineError>(())
                    })
                    .unwrap();
                assert!(!foreign.in_codegen_construction());
            }
        };
        let nested = ctx.with_codegen_construction(|inner| {
            assert!(!parent.compatible(inner)?);
            read_encoded_retained_metaschema_with_events(inner, &mut event)
        })?;
        assert!(entered.get());
        assert!(!nested.compatible(ctx)?);
        assert!(parent.compatible(ctx)?);
        Ok::<(), EngineError>(())
    })
    .unwrap();
    assert!(!ctx.in_codegen_construction());
}

#[test]
fn original_generic_utf8_materialization_keeps_its_paid_guard_and_full_parser() {
    let sum = Cell::new(0usize);
    let mut meter = |n| {
        sum.set(sum.get() + n);
        Ok(())
    };
    let start = Cell::new(0usize);
    let material = Cell::new(false);
    let mut ctx = Context::catalog().with_meter(&mut meter);
    let parsed = ctx
        .with_codegen_construction(|ctx| {
            start.set(sum.get());
            read_retained_metaschema_with(
                TEXT,
                ctx,
                |text| {
                    assert_eq!(sum.get() - start.get(), TEXT.len());
                    material.set(true);
                    text.encode_utf16().collect()
                },
                |s, c| read_json_value(s, Format::Json, c),
            )
        })
        .unwrap();
    assert!(material.get());
    assert_eq!(
        parsed,
        raw(&units(TEXT), Context::catalog().limits()).unwrap()
    );
    let armed = Cell::new(false);
    let material = Cell::new(false);
    let parser = Cell::new(false);
    let wanted = host();
    let mut meter = |_| {
        if armed.get() {
            Err(wanted.clone())
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::catalog().with_meter(&mut meter);
    let error = ctx
        .with_codegen_construction(|ctx| {
            armed.set(true);
            read_retained_metaschema_with(
                TEXT,
                ctx,
                |text| {
                    material.set(true);
                    text.encode_utf16().collect()
                },
                |s, c| {
                    parser.set(true);
                    read_json_value(s, Format::Json, c)
                },
            )
        })
        .unwrap_err();
    same_host(&error, &wanted);
    assert!(!material.get());
    assert!(!parser.get());
    assert!(!ctx.in_codegen_construction());
}

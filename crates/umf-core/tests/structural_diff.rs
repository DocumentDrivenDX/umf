use umf_core::{
    structural_diff::compare_documents, Context, Limits, ResourceProfile, Utf16, Value,
};

fn s(value: &str) -> Value {
    Value::string_utf8(value)
}
fn o(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn a(items: Vec<Value>) -> Value {
    Value::Array(items)
}
fn change(path: &str, status: &str, before: Option<Value>, after: Option<Value>) -> Value {
    let mut fields = vec![
        (Utf16::from("path"), s(path)),
        (Utf16::from("status"), s(status)),
    ];
    if let Some(value) = before {
        fields.push((Utf16::from("before"), value));
    }
    if let Some(value) = after {
        fields.push((Utf16::from("after"), value));
    }
    Value::Object(fields)
}

fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find_map(|(key, value)| (key == &Utf16::from(name)).then_some(value))
}

#[test]
fn every_frozen_predecessor_case_matches_complete_ordered_output() {
    let source = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r7-schema-comparison/predecessor-cases.json");
    let utf16 = source.encode_utf16().collect::<Vec<_>>();
    let fixture = umf_core::serialization::read_json_value(
        &utf16,
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap();
    let Value::Array(cases) = member(&fixture, "cases").expect("cases member") else {
        panic!("cases array")
    };
    for case in cases {
        let id = member(case, "id")
            .and_then(|value| {
                if let Value::String(text) = value {
                    text.to_utf8().ok()
                } else {
                    None
                }
            })
            .expect("case id");
        let before = member(case, "before").expect("before");
        let after = member(case, "after").expect("after");
        let expected = member(case, "expected").expect("expected");
        let actual = compare_documents(before, after, &mut Context::ordinary()).unwrap();
        assert_eq!(&actual, expected, "frozen predecessor case {id}");
    }
}

#[test]
fn atomic_array_snapshots_use_ecmascript_numeric_property_order() {
    let before = a(vec![o(vec![
        ("tail", Value::Number(0.)),
        ("2", s("two")),
        ("1", s("one")),
    ])]);
    let after = a(vec![o(vec![
        ("tail", Value::Number(1.)),
        ("2", s("two")),
        ("1", s("one")),
    ])]);
    let expected_before = a(vec![o(vec![
        ("1", s("one")),
        ("2", s("two")),
        ("tail", Value::Number(0.)),
    ])]);
    let expected_after = a(vec![o(vec![
        ("1", s("one")),
        ("2", s("two")),
        ("tail", Value::Number(1.)),
    ])]);
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        a(vec![change(
            "",
            "changed",
            Some(expected_before),
            Some(expected_after)
        )])
    );
}

#[test]
fn keyed_order_uses_the_predecessors_nul_join_collision_behavior() {
    let id_with_separator = s("a\u{0000}a");
    let before = a(vec![
        o(vec![("id", s("a")), ("v", s("first"))]),
        o(vec![("id", id_with_separator.clone()), ("v", s("second"))]),
    ]);
    let after = a(vec![
        o(vec![("id", id_with_separator), ("v", s("second"))]),
        o(vec![("id", s("a")), ("v", s("first"))]),
    ]);
    // Both joined shared-ID sequences are `a\0a\0a`, so the frozen
    // predecessor suppresses an otherwise apparent /order record.
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        a(vec![])
    );
}

#[test]
fn ordered_object_paths_and_unknown_values_match_gate0() {
    let before = o(vec![
        ("z", Value::Number(1.)),
        ("a/b~c", s("old")),
        ("tail", Value::Bool(true)),
    ]);
    let after = o(vec![
        ("z", Value::Number(2.)),
        ("a/b~c", s("new")),
        ("added", Value::Bool(false)),
    ]);
    let expected = a(vec![
        change(
            "/z",
            "changed",
            Some(Value::Number(1.)),
            Some(Value::Number(2.)),
        ),
        change("/a~1b~0c", "changed", Some(s("old")), Some(s("new"))),
        change("/tail", "removed", Some(Value::Bool(true)), None),
        change("/added", "created", None, Some(Value::Bool(false))),
    ]);
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        expected
    );
}

#[test]
fn keyed_arrays_emit_complete_order_then_changes_and_preserve_special_keys() {
    let before = a(vec![
        o(vec![
            ("id", s("a/b~c")),
            ("value", s("old")),
            ("__proto__", s("kept")),
        ]),
        o(vec![("id", s("gone")), ("value", Value::Number(0.))]),
        o(vec![("id", s("stay")), ("value", Value::Number(1.))]),
    ]);
    let after = a(vec![
        o(vec![("id", s("stay")), ("value", Value::Number(1.))]),
        o(vec![
            ("id", s("a/b~c")),
            ("value", s("new")),
            ("__proto__", s("kept")),
        ]),
        o(vec![("id", s("new")), ("value", Value::Number(2.))]),
    ]);
    let expected = a(vec![
        change(
            "/order",
            "changed",
            Some(a(vec![s("a/b~c"), s("gone"), s("stay")])),
            Some(a(vec![s("stay"), s("a/b~c"), s("new")])),
        ),
        change(
            "/id:a~1b~0c/value",
            "changed",
            Some(s("old")),
            Some(s("new")),
        ),
        change(
            "/id:gone",
            "removed",
            Some(o(vec![("id", s("gone")), ("value", Value::Number(0.))])),
            None,
        ),
        change(
            "/id:new",
            "created",
            None,
            Some(o(vec![("id", s("new")), ("value", Value::Number(2.))])),
        ),
    ]);
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        expected
    );
}

#[test]
fn duplicate_or_non_string_ids_use_atomic_array_fallback() {
    let before = a(vec![
        o(vec![("id", s("dup")), ("v", Value::Number(1.))]),
        o(vec![("id", s("dup")), ("v", Value::Number(2.))]),
    ]);
    let after = a(vec![o(vec![("id", s("dup")), ("v", Value::Number(3.))])]);
    let expected = a(vec![change(
        "",
        "changed",
        Some(before.clone()),
        Some(after.clone()),
    )]);
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        expected
    );

    // A duplicate on only the after side also disables keyed comparison for
    // the complete array pair.
    let before = a(vec![o(vec![("id", s("dup")), ("v", Value::Number(1.))])]);
    let after = a(vec![
        o(vec![("id", s("dup")), ("v", Value::Number(2.))]),
        o(vec![("id", s("dup")), ("v", Value::Number(3.))]),
    ]);
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        a(vec![change(
            "",
            "changed",
            Some(before.clone()),
            Some(after.clone())
        )])
    );

    let before = a(vec![o(vec![
        ("id", Value::Number(1.)),
        ("v", Value::Number(1.)),
    ])]);
    let after = a(vec![o(vec![
        ("id", Value::Number(1.)),
        ("v", Value::Number(2.)),
    ])]);
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        a(vec![change(
            "",
            "changed",
            Some(before.clone()),
            Some(after.clone())
        )])
    );

    let before = a(vec![
        o(vec![("id", s("dup")), ("v", Value::Number(1.))]),
        o(vec![("id", s("dup")), ("v", Value::Number(2.))]),
    ]);
    let after = a(vec![o(vec![("id", s("dup")), ("v", Value::Number(3.))])]);
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        a(vec![change(
            "",
            "changed",
            Some(before.clone()),
            Some(after.clone())
        )])
    );
}

#[test]
fn empty_arrays_compare_equal_and_nonstring_ids_fall_back() {
    assert_eq!(
        compare_documents(&a(vec![]), &a(vec![]), &mut Context::ordinary()).unwrap(),
        a(vec![])
    );
    let before = a(vec![o(vec![("id", Value::Number(1.)), ("v", s("old"))])]);
    let after = a(vec![o(vec![("id", Value::Number(1.)), ("v", s("new"))])]);
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        a(vec![change(
            "",
            "changed",
            Some(before.clone()),
            Some(after.clone())
        )])
    );
}

#[test]
fn key_order_only_is_equal_and_numeric_key_order_is_preserved() {
    let before = o(vec![
        ("first", Value::Number(1.)),
        ("second", Value::Number(2.)),
    ]);
    let after = o(vec![
        ("second", Value::Number(2.)),
        ("first", Value::Number(1.)),
    ]);
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        a(vec![])
    );

    let before = o(vec![
        ("1", s("one-before")),
        ("2", s("two-before")),
        ("tail", Value::Number(0.)),
    ]);
    let after = o(vec![
        ("1", s("one-after")),
        ("2", s("two-after")),
        ("tail", Value::Number(1.)),
    ]);
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        a(vec![
            change("/1", "changed", Some(s("one-before")), Some(s("one-after"))),
            change("/2", "changed", Some(s("two-before")), Some(s("two-after"))),
            change(
                "/tail",
                "changed",
                Some(Value::Number(0.)),
                Some(Value::Number(1.))
            ),
        ])
    );
}

#[test]
fn work_and_output_are_metered_and_cancellable() {
    let before = o(vec![("a", Value::Number(1.))]);
    let after = o(vec![("a", Value::Number(2.))]);
    let mut work = 0;
    let mut meter = |amount| {
        work += amount;
        Ok(())
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    compare_documents(&before, &after, &mut ctx).unwrap();
    assert!(work > 0);

    let mut cancelled = || true;
    let mut ctx = Context::ordinary().with_cancellation(&mut cancelled);
    assert_eq!(
        compare_documents(&before, &after, &mut ctx)
            .unwrap_err()
            .code,
        "CANCELLED"
    );
}

#[test]
fn keyed_eligibility_requires_unique_string_ids_for_every_member() {
    let before = a(vec![
        o(vec![("id", s("a")), ("v", Value::Number(1.))]),
        o(vec![("v", Value::Number(2.))]),
    ]);
    let after = a(vec![
        o(vec![("id", s("a")), ("v", Value::Number(3.))]),
        o(vec![("id", s("b")), ("v", Value::Number(4.))]),
    ]);
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        a(vec![change(
            "",
            "changed",
            Some(before.clone()),
            Some(after.clone())
        )])
    );

    let before = a(vec![o(vec![("id", s("a")), ("v", Value::Number(1.))])]);
    let after = a(vec![
        o(vec![("id", s("a")), ("v", Value::Number(2.))]),
        Value::Null,
    ]);
    assert_eq!(
        compare_documents(&before, &after, &mut Context::ordinary()).unwrap(),
        a(vec![change(
            "",
            "changed",
            Some(before.clone()),
            Some(after.clone())
        )])
    );
}

#[test]
fn all_special_keys_and_utf16_ids_survive_paths_and_values() {
    let before = o(vec![
        ("__proto__", s("old")),
        ("constructor", s("old")),
        ("prototype", s("old")),
        ("token", s("9007199254740993")),
    ]);
    let after = o(vec![
        ("__proto__", s("new")),
        ("constructor", s("new")),
        ("prototype", s("new")),
        ("token", s("9007199254740994")),
    ]);
    let got = compare_documents(&before, &after, &mut Context::ordinary()).unwrap();
    assert_eq!(
        got,
        a(vec![
            change("/__proto__", "changed", Some(s("old")), Some(s("new"))),
            change("/constructor", "changed", Some(s("old")), Some(s("new"))),
            change("/prototype", "changed", Some(s("old")), Some(s("new"))),
            change(
                "/token",
                "changed",
                Some(s("9007199254740993")),
                Some(s("9007199254740994"))
            ),
        ])
    );

    let id = Utf16::new(vec![0xd800, b'/' as u16, b'~' as u16]);
    let before = a(vec![Value::Object(vec![
        (Utf16::from("id"), Value::String(id.clone())),
        (Utf16::from("v"), s("a")),
    ])]);
    let after = a(vec![Value::Object(vec![
        (Utf16::from("id"), Value::String(id)),
        (Utf16::from("v"), s("b")),
    ])]);
    let got = compare_documents(&before, &after, &mut Context::ordinary()).unwrap();
    let Value::Array(records) = got else {
        panic!("expected array")
    };
    let Value::Object(fields) = &records[0] else {
        panic!("expected record")
    };
    assert_eq!(
        fields[0].1,
        Value::String(Utf16::new(vec![
            b'/' as u16,
            b'i' as u16,
            b'd' as u16,
            b':' as u16,
            0xd800,
            b'~' as u16,
            b'1' as u16,
            b'~' as u16,
            b'0' as u16,
            b'/' as u16,
            b'v' as u16
        ]))
    );
}

#[test]
fn max_work_refuses_before_comparison_and_values_are_bounded() {
    let before = o(vec![("a", Value::Number(1.))]);
    let after = o(vec![("a", Value::Number(2.))]);
    let mut calls = 0;
    let mut meter = |amount| {
        calls += amount;
        if calls > 8 {
            Err(umf_core::EngineError::new(
                "TEST_BUDGET",
                Utf16::default(),
                "work refused",
            ))
        } else {
            Ok(())
        }
    };
    let error = compare_documents(
        &before,
        &after,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "TEST_BUDGET");

    let limits = Limits {
        max_values: 2,
        ..Limits::ordinary()
    };
    let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
    let error = compare_documents(&before, &after, &mut ctx).unwrap_err();
    assert_eq!(error.code, "LIMIT");
}

#[test]
fn deep_input_is_refused_before_recursive_comparison() {
    let nested = Value::Array(vec![Value::Array(vec![Value::Array(vec![Value::Null])])]);
    let limits = Limits {
        max_depth: 1,
        ..Limits::ordinary()
    };
    let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
    let error = compare_documents(&nested, &nested, &mut ctx).unwrap_err();
    assert_eq!(error.code, "LIMIT");
}

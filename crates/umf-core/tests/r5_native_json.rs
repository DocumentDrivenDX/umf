// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{native_json::NativeJsonTree, Context, Utf16};

fn parse(source: &str) -> Result<NativeJsonTree, umf_core::EngineError> {
    NativeJsonTree::parse_json(
        &source.encode_utf16().collect::<Vec<_>>(),
        &mut Context::ordinary(),
    )
}

fn render(tree: &NativeJsonTree) -> String {
    tree.render_compact(&mut Context::ordinary())
        .unwrap()
        .to_utf8()
        .unwrap()
}

#[test]
fn exact_numbers_utf16_and_javascript_member_enumeration_round_trip() {
    let source = r#"{"z":1.2300,"10":-0,"2":"\ud800","01":9e+003,"x":[true,null]}"#;
    let tree = parse(source).unwrap();
    assert_eq!(
        render(&tree),
        r#"{"2":"\ud800","10":-0,"z":1.2300,"01":9e+003,"x":[true,null]}"#
    );
    let cloned = tree.clone_tree(&mut Context::ordinary()).unwrap();
    assert_eq!(cloned, tree);
    let tagged = tree
        .render_tagged(&mut Context::ordinary())
        .unwrap()
        .to_utf8()
        .unwrap();
    assert_eq!(
        tagged,
        r#"{"kind":"object","members":{"2":{"kind":"string","value":"\ud800"},"10":{"kind":"number","value":"-0"},"z":{"kind":"number","value":"1.2300"},"01":{"kind":"number","value":"9e+003"},"x":{"kind":"array","items":[{"kind":"boolean","value":true},{"kind":"null"}]}}}"#
    );
}

#[test]
fn syntax_precedes_duplicate_detection_and_duplicate_precedes_tree_limits() {
    let syntax_after_duplicate = parse(r#"{"x":1,"x":2,}"#).unwrap_err();
    assert_eq!(syntax_after_duplicate.code, "JSON_SCHEMA_SYNTAX");
    let duplicate = parse(r#"{"x":1,"\u0078":2}"#).unwrap_err();
    assert_eq!(duplicate.code, "JSON_SCHEMA_SYNTAX");

    let mut source = String::from("[");
    for index in 0..100_000 {
        if index != 0 {
            source.push(',');
        }
        source.push_str("null");
    }
    source.push_str(r#",{"x":1,"x":2}]"#);
    let error = parse(&source).unwrap_err();
    assert_eq!(error.code, "JSON_SCHEMA_SYNTAX");
}

#[test]
fn structural_limits_match_the_native_json_predecessor() {
    let deep = format!("{}null{}", "[".repeat(129), "]".repeat(129));
    assert_eq!(parse(&deep).unwrap_err().code, "LIMIT");

    let mut source = String::from("[");
    for index in 0..100_000 {
        if index != 0 {
            source.push(',');
        }
        source.push_str("null");
    }
    source.push(']');
    assert_eq!(parse(&source).unwrap_err().code, "LIMIT");
}

#[test]
fn deep_native_json_preflight_is_iterative_and_preserves_error_precedence() {
    let nested = format!("{}null{}", "[".repeat(10_000), "]".repeat(10_000));
    assert_eq!(parse(&nested).unwrap_err().code, "LIMIT");

    let duplicate_then_deep = format!(
        r#"{{"x":1,"x":2,"deep":{}}}"#,
        format!("{}null{}", "[".repeat(10_000), "]".repeat(10_000))
    );
    assert_eq!(parse(&duplicate_then_deep).unwrap_err().code, "JSON_SCHEMA_SYNTAX");

    let malformed_after_duplicate = format!(
        r#"{{"x":1,"x":2,"deep":{}]}}"#,
        format!("{}null{}", "[".repeat(10_000), "]".repeat(10_000))
    );
    assert_eq!(parse(&malformed_after_duplicate).unwrap_err().code, "JSON_SCHEMA_SYNTAX");
}

#[test]
fn parse_and_tagged_clone_apply_distinct_value_and_depth_budgets() {
    let source = format!("[{}]", vec!["true"; 33_333].join(","));
    let tree = parse(&source).expect("native parse counts native JSON values");
    let value_error = tree.clone_tree(&mut Context::ordinary()).unwrap_err();
    assert_eq!(value_error.code, "LIMIT");
    assert_eq!(value_error.path.to_utf8().unwrap(), "/items/33332/kind");

    let deep = format!("{}null{}", "[".repeat(65), "]".repeat(65));
    let tree = parse(&deep).expect("native parse depth is below 128");
    let depth_error = tree.clone_tree(&mut Context::ordinary()).unwrap_err();
    assert_eq!(depth_error.code, "LIMIT");
    assert_eq!(
        depth_error.path.to_utf8().unwrap(),
        format!("{}{}", "/items/0".repeat(64), "/kind")
    );
}

#[test]
fn tagged_unknown_representation_fields_survive_copy_and_block_render() {
    let tagged = umf_core::Value::Object(vec![
        (
            Utf16::from("kind"),
            umf_core::Value::String(Utf16::from("string")),
        ),
        (
            Utf16::from("value"),
            umf_core::Value::String(Utf16::from("native")),
        ),
        (Utf16::from("futureFlag"), umf_core::Value::Bool(true)),
    ]);
    let tree = NativeJsonTree::from_tagged_value(&tagged, &mut Context::ordinary()).unwrap();
    assert_eq!(
        tree.root(),
        &umf_core::native_json::NativeJsonNode::String(Utf16::from("native"))
    );
    let copy = tree.clone_tree(&mut Context::ordinary()).unwrap();
    assert_eq!(copy, tree);
    assert_eq!(
        tree.render_compact(&mut Context::ordinary())
            .unwrap_err()
            .code,
        "NATIVE_JSON_REPRESENTATION"
    );
    assert_eq!(
        tree.render_tagged(&mut Context::ordinary())
            .unwrap_err()
            .code,
        "NATIVE_JSON_REPRESENTATION"
    );
}

#[test]
fn subtree_copy_rebases_and_retains_unknown_representation_fields() {
    let tagged = umf_core::Value::Object(vec![
        (
            Utf16::from("kind"),
            umf_core::Value::String(Utf16::from("object")),
        ),
        (
            Utf16::from("members"),
            umf_core::Value::Object(vec![(
                Utf16::from("kid"),
                umf_core::Value::Object(vec![
                    (
                        Utf16::from("kind"),
                        umf_core::Value::String(Utf16::from("string")),
                    ),
                    (
                        Utf16::from("value"),
                        umf_core::Value::String(Utf16::from("kept")),
                    ),
                    (
                        Utf16::from("futureFlag"),
                        umf_core::Value::Bool(true),
                    ),
                ]),
            )]),
        ),
    ]);
    let tree = NativeJsonTree::from_tagged_value(&tagged, &mut Context::ordinary()).unwrap();
    let subtree = tree
        .subtree_clone(&Utf16::from("/kid"), &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        subtree.root(),
        &umf_core::native_json::NativeJsonNode::String(Utf16::from("kept"))
    );
    assert_eq!(
        subtree
            .render_compact(&mut Context::ordinary())
            .unwrap_err()
            .code,
        "NATIVE_JSON_REPRESENTATION"
    );
    assert_eq!(
        subtree
            .clone_tree(&mut Context::ordinary())
            .unwrap()
            .render_tagged(&mut Context::ordinary())
            .unwrap_err()
            .code,
        "NATIVE_JSON_REPRESENTATION"
    );
}

#[test]
fn subtree_copy_admits_many_extras_before_copy_allocation() {
    let mut fields = vec![
        (
            Utf16::from("kind"),
            umf_core::Value::String(Utf16::from("string")),
        ),
        (
            Utf16::from("value"),
            umf_core::Value::String(Utf16::from("x")),
        ),
    ];
    for index in 0..100 {
        fields.push((
            Utf16::from(format!("future{index}")),
            umf_core::Value::Array(vec![umf_core::Value::Bool(true)]),
        ));
    }
    let tree = NativeJsonTree::from_tagged_value(
        &umf_core::Value::Object(fields),
        &mut Context::ordinary(),
    )
    .unwrap();
    let limits = umf_core::context::Limits {
        max_values: 1,
        ..umf_core::context::Limits::ordinary()
    };
    let mut low_budget = Context::with_limits(umf_core::context::ResourceProfile::Cooperative, limits)
        .unwrap();
    assert_eq!(
        tree.subtree_clone(&Utf16::default(), &mut low_budget)
            .unwrap_err()
            .code,
        "LIMIT"
    );
}

#[test]
fn pointer_is_strict_and_child_lookup_does_not_coerce() {
    let tree = parse(r#"{"a/b":{"~key":[10,20]}}"#).unwrap();
    let found = tree
        .child(&Utf16::from("/a~1b/~0key/1"), &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        found,
        &umf_core::native_json::NativeJsonNode::Number("20".into())
    );
    for bad in ["a", "/a~", "/a~2", "/a~01x/00", "/a~1b/~0key/01"] {
        assert_eq!(
            tree.child(&Utf16::from(bad), &mut Context::ordinary())
                .unwrap_err()
                .code,
            "JSON_SCHEMA_POINTER",
            "{bad}"
        );
    }
    assert!(tree
        .child(&Utf16::default(), &mut Context::ordinary())
        .is_ok());
}

#[test]
fn meter_failure_propagates_without_a_partial_result() {
    let mut meter = |_: usize| {
        Err(umf_core::EngineError::new(
            "HOST_STOP",
            Utf16::default(),
            "stop",
        ))
    };
    let mut context = Context::ordinary().with_meter(&mut meter);
    let error =
        NativeJsonTree::parse_json(&Utf16::from("[1]").into_units(), &mut context).unwrap_err();
    assert_eq!(error.code, "HOST_STOP");
}

#[test]
fn large_malformed_tag_kind_is_metered_before_ascii_conversion() {
    let tagged = umf_core::Value::Object(vec![
        (
            Utf16::from("kind"),
            umf_core::Value::String(Utf16::new(vec![b'x' as u16; 1_000_000])),
        ),
    ]);
    let mut meter = |amount: usize| {
        if amount > 1_000 {
            Err(umf_core::EngineError::new(
                "HOST_STOP",
                Utf16::default(),
                "stop before large conversion",
            ))
        } else {
            Ok(())
        }
    };
    let mut context = Context::ordinary().with_meter(&mut meter);
    let error = NativeJsonTree::from_tagged_value(&tagged, &mut context).unwrap_err();
    assert_eq!(error.code, "HOST_STOP");
}

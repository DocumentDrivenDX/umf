// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::schema::{CompiledSchema, SchemaResources};
use umf_core::{Context, EngineError, Utf16, Value};
fn parse(source: &str) -> Value {
    umf_core::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn compile(source: &str) -> CompiledSchema {
    CompiledSchema::compile(
        &parse(source),
        &SchemaResources::default(),
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn member<'a>(value: &'a Value, key: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("object")
    };
    &fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(key))
        .unwrap()
        .1
}
#[test]
fn compiler_one_of_keeps_failed_branches_and_first_two_passing_indices() {
    for (schema, input, keywords, passing) in [
        (
            r#"{"oneOf":[{"type":"string"},{"type":"boolean"}]}"#,
            "1",
            vec!["type", "type", "oneOf"],
            Value::Null,
        ),
        (
            r#"{"oneOf":[{},{},{}]}"#,
            "1",
            vec!["oneOf"],
            Value::Array(vec![Value::Number(0.0), Value::Number(1.0)]),
        ),
        (
            r#"{"oneOf":[{"type":"string"},{},{}]}"#,
            "1",
            vec!["type", "oneOf"],
            Value::Array(vec![Value::Number(1.0), Value::Number(2.0)]),
        ),
        (
            r#"{"oneOf":[{"type":"number"},{"type":"string"},{}]}"#,
            "1",
            vec!["type", "oneOf"],
            Value::Array(vec![Value::Number(0.0), Value::Number(2.0)]),
        ),
    ] {
        let schema = compile(schema);
        let value = parse(input);
        let original = schema.validate(&value, &mut Context::ordinary()).unwrap();
        let errors = schema
            .validate_codegen_errors(&value, &mut Context::ordinary())
            .unwrap();
        assert_eq!(
            errors
                .iter()
                .map(|e| e.keyword.as_str())
                .collect::<Vec<_>>(),
            keywords
        );
        assert_eq!(
            member(&errors.last().unwrap().params, "passingSchemas"),
            &passing
        );
        assert_eq!(
            schema.validate(&value, &mut Context::ordinary()).unwrap(),
            original
        );
        assert!(
            matches!(&original.last().unwrap().params,Value::Object(fields)if fields.is_empty())
        );
    }
}
#[test]
fn compiler_one_of_still_collects_all_later_branch_errors_after_a_match() {
    let schema = compile(
        r#"{"oneOf":[{},{"type":"object","properties":{"a":{"type":"string"},"b":{"type":"string"}}},{}]}"#,
    );
    let value = parse(r#"{"a":1,"b":2}"#);
    let errors = schema
        .validate_codegen_errors(&value, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        errors
            .iter()
            .map(|e| e.instance_path.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        ["/a", "/b", ""]
    );
    assert_eq!(
        member(&errors[2].params, "passingSchemas"),
        &Value::Array(vec![Value::Number(0.0), Value::Number(2.0)])
    );
    let sole = compile(r#"{"oneOf":[{"type":"number"},{"type":"string"}]}"#);
    assert!(sole
        .validate_codegen_errors(&parse("1"), &mut Context::ordinary())
        .unwrap()
        .is_empty());
}
#[test]
fn compiler_presentation_is_inherited_by_nested_schema_evaluation() {
    let schema =
        compile(r#"{"properties":{"nested":{"oneOf":[{"type":"string"},{"type":"boolean"}]}}}"#);
    let errors = schema
        .validate_codegen_errors(&parse(r#"{"nested":1}"#), &mut Context::ordinary())
        .unwrap();
    assert_eq!(errors.len(), 3);
    assert!(errors
        .iter()
        .all(|e| e.instance_path == Utf16::from("/nested")));
    assert_eq!(
        errors[2].schema_path,
        Utf16::from("#/properties/nested/oneOf")
    );
}
#[test]
fn compiler_diagnostic_evaluation_preserves_late_host_failure_provenance() {
    let branches = vec![parse(r#"{"type":"string"}"#); 128];
    let schema = CompiledSchema::compile(
        &Value::Object(vec![(Utf16::from("oneOf"), Value::Array(branches))]),
        &SchemaResources::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut total = 0;
    let mut observe = |amount| {
        total += amount;
        Ok(())
    };
    schema
        .validate_codegen_errors(
            &Value::Bool(true),
            &mut Context::ordinary().with_meter(&mut observe),
        )
        .unwrap();
    let limit = total * 3 / 4;
    let mut spent = 0;
    let mut stop = |amount| {
        spent += amount;
        if spent >= limit {
            Err(EngineError::new(
                "VALUE_INVALID",
                Utf16::from("/host"),
                "late compiler schema stop",
            ))
        } else {
            Ok(())
        }
    };
    let error = schema
        .validate_codegen_errors(
            &Value::Bool(true),
            &mut Context::ordinary().with_meter(&mut stop),
        )
        .unwrap_err();
    assert!(error.is_control_failure());
    assert!(spent >= limit && spent < total);
}
#[test]
fn compiler_keyword_groups_keep_guards_then_required_before_property_errors() {
    let schema = compile(
        r#"{"type":"object","properties":{"a":{"type":"string"}},"required":["missing"],"not":{}}"#,
    );
    let value = parse(r#"{"a":1}"#);
    let ordinary = schema.validate(&value, &mut Context::ordinary()).unwrap();
    assert_eq!(
        ordinary
            .iter()
            .map(|e| e.keyword.as_str())
            .collect::<Vec<_>>(),
        ["type", "required", "not"]
    );
    let compiler = schema
        .validate_codegen_errors(&value, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        compiler
            .iter()
            .map(|e| e.keyword.as_str())
            .collect::<Vec<_>>(),
        ["not", "required", "type"]
    );
}
#[test]
fn compiler_additional_property_errors_keep_js_order_and_raw_utf16_names() {
    let schema = compile(r#"{"additionalProperties":false}"#);
    let lone = Utf16::new(vec![0xd800]);
    let value = Value::Object(vec![
        (Utf16::from("2"), Value::Null),
        (Utf16::from("1"), Value::Null),
        (lone.clone(), Value::Null),
    ]);
    let default = schema.validate(&value, &mut Context::ordinary()).unwrap();
    assert_eq!(default.len(), 1);
    assert_eq!(default[0].params, Value::Object(vec![]));
    let errors = schema
        .validate_codegen_errors(&value, &mut Context::ordinary())
        .unwrap();
    assert_eq!(errors.len(), 3);
    assert_eq!(
        errors
            .iter()
            .map(|e| member(&e.params, "additionalProperty").clone())
            .collect::<Vec<_>>(),
        vec![
            Value::String(Utf16::from("1")),
            Value::String(Utf16::from("2")),
            Value::String(lone)
        ]
    );
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Independent bounded Ajv predecessor control for the additive compiler mode.
use umf_core::schema::{CompiledSchema, SchemaResources};
use umf_core::{Context, Utf16};
fn parse(text: &str) -> umf_core::Value {
    umf_core::serialization::read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
#[test]
fn compiler_oneof_keeps_first_success_annotations_when_later_branch_also_passes() {
    let schema=CompiledSchema::compile(&parse(r#"{"type":"object","oneOf":[{"properties":{"a":{"type":"string"}}},{"properties":{"b":{"type":"string"}}}],"unevaluatedProperties":false}"#),&SchemaResources::default(),&mut Context::ordinary()).unwrap();
    let errors = schema
        .validate_codegen_errors(&parse(r#"{"a":"x","b":"y"}"#), &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        errors
            .iter()
            .map(|e| e.keyword.as_str())
            .collect::<Vec<_>>(),
        ["oneOf", "unevaluatedProperties"]
    );
    let umf_core::Value::Object(params) = &errors[1].params else {
        panic!("params")
    };
    assert_eq!(
        params
            .iter()
            .find(|(k, _)| k == &Utf16::from("unevaluatedProperty"))
            .unwrap()
            .1,
        umf_core::Value::String(Utf16::from("b"))
    );
}

#[test]
fn compiler_keyword_groups_follow_custom_equality_reregistration() {
    let schema = CompiledSchema::compile(
        &parse(r#"{"enum":[1],"not":{},"const":1}"#),
        &SchemaResources::default(),
        &mut Context::ordinary(),
    )
    .unwrap();
    let errors = schema
        .validate_codegen_errors(&parse("2"), &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        errors
            .iter()
            .map(|e| e.keyword.as_str())
            .collect::<Vec<_>>(),
        ["not", "const", "enum"]
    );
    let schema=CompiledSchema::compile(&parse(r#"{"uniqueItems":true,"contains":{"const":9},"minContains":2,"unevaluatedItems":false}"#),&SchemaResources::default(),&mut Context::ordinary()).unwrap();
    let errors = schema
        .validate_codegen_errors(&parse("[1,1]"), &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        errors
            .iter()
            .map(|e| e.keyword.as_str())
            .collect::<Vec<_>>(),
        ["const", "const", "contains", "uniqueItems"]
    );
}

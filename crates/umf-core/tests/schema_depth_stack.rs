// SPDX-License-Identifier: MIT OR Apache-2.0

use std::thread;
use umf_core::schema::{CompiledSchema, SchemaResources};
use umf_core::{
    Context, PyText, PythonConsumerValue, PythonReVersion, PythonSchemaResources, Utf16, Value,
};

const NORMAL_THREAD_STACK: usize = 2 * 1024 * 1024;

fn run_on_normal_stack<T: Send + 'static>(run: impl FnOnce() -> T + Send + 'static) -> T {
    thread::Builder::new()
        .name("schema-depth-2m-stack".into())
        .stack_size(NORMAL_THREAD_STACK)
        .spawn(run)
        .expect("spawn 2 MiB test thread")
        .join()
        .expect("schema evaluation must not overflow a normal 2 MiB stack")
}

fn value_object(members: Vec<(&str, Value)>) -> Value {
    Value::Object(
        members
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn value_chain(object_count: usize) -> Value {
    let mut value = Value::Object(Vec::new());
    for _ in 1..object_count {
        value = value_object(vec![("child", value)]);
    }
    value
}

fn python_text(value: &str) -> PythonConsumerValue {
    PythonConsumerValue::String(PyText::from_utf8(value))
}

fn python_object(members: Vec<(&str, PythonConsumerValue)>) -> PythonConsumerValue {
    PythonConsumerValue::Object(
        members
            .into_iter()
            .map(|(key, value)| (PyText::from_utf8(key), value))
            .collect(),
    )
}

fn python_chain(object_count: usize) -> PythonConsumerValue {
    let mut value = PythonConsumerValue::Object(Vec::new());
    for _ in 1..object_count {
        value = python_object(vec![("child", value)]);
    }
    value
}

fn python_node_schema() -> PythonConsumerValue {
    let recursive_ref = || python_object(vec![("$ref", python_text("#/$defs/node"))]);
    let node = python_object(vec![
        ("type", python_text("object")),
        (
            "properties",
            python_object(vec![("child", recursive_ref())]),
        ),
    ]);
    python_object(vec![
        (
            "$schema",
            python_text("https://json-schema.org/draft/2020-12/schema"),
        ),
        ("type", python_text("object")),
        (
            "properties",
            python_object(vec![("child", recursive_ref())]),
        ),
        ("$defs", python_object(vec![("node", node)])),
    ])
}

#[test]
fn recursive_schema_evaluation_accepts_depth_128_and_refuses_129_on_2m_stack() {
    let core_result = run_on_normal_stack(|| {
        let source = r##"{
            "type":"object",
            "properties":{"child":{"$ref":"#/$defs/node"}},
            "$defs":{"node":{"type":"object","properties":{"child":{"$ref":"#/$defs/node"}}}}
        }"##;
        let units: Vec<u16> = source.encode_utf16().collect();
        let schema = umf_core::serialization::read_json_value(
            &units,
            umf_core::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .expect("parse recursive schema");
        let compiled = CompiledSchema::compile(
            &schema,
            &SchemaResources::default(),
            &mut Context::ordinary(),
        )
        .expect("compile recursive schema");

        // Each recursive edge evaluates the property $ref and then its target.
        // With the root at depth zero, 65 object nodes reach evaluator depth 128;
        // a 66th node attempts depth 129 and must be refused by the ordinary limit.
        let accepted = compiled.validate(&value_chain(65), &mut Context::ordinary());
        let refused = compiled.validate(&value_chain(66), &mut Context::ordinary());
        (accepted, refused)
    });
    assert_eq!(
        core_result.0.expect("evaluator depth 128 is supported"),
        Vec::new()
    );
    assert_eq!(
        core_result
            .1
            .expect_err("evaluator depth 129 is refused")
            .code,
        "LIMIT"
    );

    let python_result = run_on_normal_stack(|| {
        let compiled = CompiledSchema::compile_python_source(
            &python_node_schema(),
            &PythonSchemaResources::default(),
            false,
            PythonReVersion::V3_11,
            &mut Context::ordinary(),
        )
        .expect("compile source-preserving recursive schema");
        let accepted = compiled.evaluate(
            &python_chain(65),
            umf_core::PythonSchemaEvaluationMode::FirstError,
            &mut Context::ordinary(),
        );
        let refused = compiled.evaluate(
            &python_chain(66),
            umf_core::PythonSchemaEvaluationMode::FirstError,
            &mut Context::ordinary(),
        );
        (accepted, refused)
    });
    let accepted = python_result
        .0
        .expect("typed evaluator depth 128 is supported");
    assert!(accepted.errors.is_empty());
    assert_eq!(
        python_result
            .1
            .expect_err("typed evaluator depth 129 is refused")
            .code,
        "LIMIT"
    );
}

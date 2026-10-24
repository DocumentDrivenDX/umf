// SPDX-License-Identifier: MIT OR Apache-2.0

use std::thread;

use umf_core::python_regex::PythonReVersion;
use umf_core::schema::CompiledSchema;
use umf_core::{
    Context, PyText, PythonConsumerValue as P, PythonSchemaEvaluationMode, PythonSchemaResources,
};

fn text(value: &str) -> P {
    P::String(PyText::from_utf8(value))
}

fn object(members: Vec<(&str, P)>) -> P {
    P::Object(
        members
            .into_iter()
            .map(|(key, value)| (PyText::from_utf8(key), value))
            .collect(),
    )
}

fn recursive_schema(with_annotations: bool) -> P {
    let recursive_ref = || object(vec![("$ref", text("#/$defs/node"))]);
    let mut node_members = vec![
        ("type", text("object")),
        ("properties", object(vec![("child", recursive_ref())])),
    ];
    let mut root_members = vec![
        (
            "$schema",
            text("https://json-schema.org/draft/2020-12/schema"),
        ),
        ("type", text("object")),
        ("properties", object(vec![("child", recursive_ref())])),
    ];
    if with_annotations {
        node_members.push(("unevaluatedProperties", P::Bool(false)));
        root_members.push(("unevaluatedProperties", P::Bool(false)));
    }
    let node = object(node_members);
    root_members.push(("$defs", object(vec![("node", node)])));
    object(root_members)
}

fn recursive_instance(object_count: usize) -> P {
    let mut value = object(Vec::new());
    for _ in 1..object_count {
        value = object(vec![("child", value)]);
    }
    value
}

#[test]
fn annotation_scan_marks_properties_without_running_their_child_schemas() {
    let schema = object(vec![
        (
            "$schema",
            text("https://json-schema.org/draft/2020-12/schema"),
        ),
        ("unevaluatedProperties", P::Bool(false)),
        ("type", text("string")),
        (
            "properties",
            object(vec![("x", object(vec![("multipleOf", P::float(0.5))]))]),
        ),
    ]);
    let compiled = CompiledSchema::compile_python_source(
        &schema,
        &PythonSchemaResources::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .expect("compile schema");
    let instance = object(vec![("x", P::float(f64::NAN))]);
    let result = compiled
        .evaluate(
            &instance,
            PythonSchemaEvaluationMode::FirstError,
            &mut Context::ordinary(),
        )
        .expect("first-error evaluation");
    assert!(result.terminal_error.is_none());
    assert_eq!(result.errors.len(), 1);
    assert_eq!(result.errors[0].keyword, Some(PyText::from_utf8("type")));
}

#[test]
fn recursive_annotation_scans_stay_within_a_two_mib_stack_at_depth_128() {
    let stack = thread::Builder::new()
        .name("schema-annotation-depth-2m".into())
        .stack_size(2 * 1024 * 1024)
        .spawn(|| {
            let compiled = CompiledSchema::compile_python_source(
                &recursive_schema(true),
                &PythonSchemaResources::default(),
                false,
                PythonReVersion::V3_11,
                &mut Context::ordinary(),
            )
            .expect("compile recursive annotated schema");
            let accepted = compiled.evaluate(
                &recursive_instance(65),
                PythonSchemaEvaluationMode::FirstError,
                &mut Context::ordinary(),
            );
            let refused = compiled.evaluate(
                &recursive_instance(66),
                PythonSchemaEvaluationMode::FirstError,
                &mut Context::ordinary(),
            );
            (accepted, refused)
        })
        .expect("spawn normal-stack thread")
        .join()
        .expect("annotation evaluator must not overflow a normal stack");
    assert!(stack.0.expect("depth 128 accepted").errors.is_empty());
    assert_eq!(stack.1.expect_err("depth 129 refused").code, "LIMIT");
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Controls must remain live after public admission and inside migration work.
use std::{fs, path::Path};
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::serialization::{read_json_value, Format};
use umf_core::{Context, EngineError, ResourceSet, Utf16, Value};
fn root() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn load(path: &str) -> Value {
    let text = fs::read_to_string(root().join(path)).unwrap();
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
fn resources() -> CodegenResources {
    let t = load("spec/extensions/tables/package.json");
    let a = load("spec/extensions/actions/package.json");
    let ts = umf_codegen::value::member(&t, "schema").unwrap().clone();
    let as_ = umf_codegen::value::member(&a, "schema").unwrap().clone();
    CodegenResources::new(
        ResourceSet::new(
            load("spec/core/schema.json"),
            load("spec/core/semantic-type-reference.schema.json"),
            load("spec/core/extension-package.schema.json"),
            load("spec/metamodel/generated/core-constraints.json"),
            load("spec/metamodel/generated/domain-policy.json"),
        ),
        t,
        ts,
        a,
        as_,
        load("spec/extensions/binding/package.json"),
        load("spec/extensions/binding-stable/package.json"),
        &mut Context::catalog(),
    )
    .unwrap()
}
#[test]
fn reviewer_generated_row_policy_refusal_drops_without_stack_overflow() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let group = obj(vec![
        ("name", Value::string_utf8("g")),
        ("commands", Value::Array(vec![Value::string_utf8("select")])),
    ]);
    let input = obj(vec![
        (
            "input",
            obj(vec![
                ("commands", Value::Array(vec![Value::string_utf8("select")])),
                ("groups", Value::Array(vec![group; 8000])),
            ]),
        ),
        (
            "context",
            obj(vec![("groups", obj(vec![("g", Value::string_utf8("g"))]))]),
        ),
    ]);
    // Stop while the source is still shallow but the generated any/rules tree
    // has grown to hundreds of levels; ordinary test threads have a 2MiB stack.
    let mut stop = |amount: usize| {
        if amount > 32000 {
            Err(EngineError::new(
                "REVIEW_STOP",
                Utf16::default(),
                "stop generated suffix growth",
            ))
        } else {
            Ok(())
        }
    };
    let result = engine.normalize_row_scope(&input, &mut Context::ordinary().with_meter(&mut stop));
    assert!(result.is_err());
}

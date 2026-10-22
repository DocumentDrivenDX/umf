// SPDX-License-Identifier: MIT OR Apache-2.0
//! Public raw entry points must never convert host-origin failures into data.
use std::{fs, path::Path};
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::serialization::{read_json_value, Format};
use umf_core::{Context, EngineError, ResourceSet, Utf16, Value};
fn load(path: &str) -> Value {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let source = fs::read_to_string(root.join(path)).unwrap();
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
fn resources() -> CodegenResources {
    let tables = load("spec/extensions/tables/package.json");
    let actions = load("spec/extensions/actions/package.json");
    let field = |value: &Value| umf_codegen::value::member(value, "schema").unwrap().clone();
    let ts = field(&tables);
    let ac = field(&actions);
    CodegenResources::new(
        ResourceSet::new(
            load("spec/core/schema.json"),
            load("spec/core/semantic-type-reference.schema.json"),
            load("spec/core/extension-package.schema.json"),
            load("spec/metamodel/generated/core-constraints.json"),
            load("spec/metamodel/generated/domain-policy.json"),
        ),
        tables,
        ts,
        actions,
        ac,
        load("spec/extensions/binding/package.json"),
        load("spec/extensions/binding-stable/package.json"),
        &mut Context::catalog(),
    )
    .unwrap()
}
fn call(
    engine: CodegenEngine<'_>,
    operation: usize,
    input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    match operation {
        0 => engine.generate_python_client(input, ctx),
        1 => engine.compile_table_deployment(input, ctx),
        2 => engine.verify_table_deployment(input, ctx),
        3 => engine.compile_table_migration(input, ctx),
        4 => engine.verify_table_migration(input, ctx),
        5 => engine.discover_table_migration_changes(input, input, ctx),
        6 => engine.normalize_row_scope(input, ctx),
        7 => engine.generate_access_package(input, input, ctx),
        8 => engine.diff_access_packages(input, input, ctx),
        _ => unreachable!(),
    }
}
#[test]
fn all_nine_raw_apis_propagate_host_errors_even_with_semantic_codes() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let input = object(vec![
        ("text", Value::string_utf8("{}")),
        ("input", Value::Array(vec![])),
        ("context", object(vec![])),
        ("outcome", Value::string_utf8("candidate")),
        (
            "symbols",
            Value::Array(vec![object(vec![
                ("role", Value::string_utf8("record")),
                ("symbol", Value::string_utf8("Record")),
            ])]),
        ),
    ]);
    let mut failures = Vec::new();
    for operation in 0..9 {
        for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
            let mut meter =
                |_: usize| Err(EngineError::new(code, Utf16::from("/host"), "host failure"));
            let result = call(
                engine,
                operation,
                &input,
                &mut Context::ordinary().with_meter(&mut meter),
            );
            match result {
                Err(error)
                    if error.is_control_failure()
                        && error.code == code
                        && error.path == Utf16::from("/host") => {}
                result => failures.push(format!(
                    "operation={operation}, code={code}, result={result:?}"
                )),
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

fn contains_code(value: &Value, expected: &str) -> bool {
    match value {
        Value::Array(values) => values.iter().any(|value| contains_code(value, expected)),
        Value::Object(fields) => fields.iter().any(|(key, value)| {
            (key == &Utf16::from("code") && value == &Value::string_utf8(expected))
                || contains_code(value, expected)
        }),
        _ => false,
    }
}
#[test]
fn all_nine_raw_apis_reject_duplicate_and_nonfinite_unselected_data() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    for (invalid, code) in [
        (
            object(vec![("extra", Value::Null), ("extra", Value::Null)]),
            "DUPLICATE_KEY",
        ),
        (object(vec![("extra", Value::Number(f64::NAN))]), "NUMBER"),
        (
            object(vec![(
                "extra",
                Value::Array(vec![Value::Number(f64::INFINITY)]),
            )]),
            "NUMBER",
        ),
    ] {
        for operation in 0..9 {
            let result = call(engine, operation, &invalid, &mut Context::ordinary());
            let rejected = match &result {
                Err(error) => error.code == code,
                Ok(value) => contains_code(value, code),
            };
            assert!(
                rejected,
                "operation={operation} code={code} result={result:?}"
            );
        }
    }
}

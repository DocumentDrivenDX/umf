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
fn sol_row_normalization_polls_after_admission_before_diagnostic_work() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let input = obj(vec![
        (
            "input",
            Value::Object(
                (0..2000)
                    .map(|i| (Utf16::from(format!("future{i}")), Value::Bool(true)))
                    .collect(),
            ),
        ),
        ("context", obj(vec![])),
    ]);
    let mut admissions = 0;
    {
        let mut count = |_| {
            admissions += 1;
            Ok(())
        };
        umf_codegen::value::admit_json(&input, &mut Context::ordinary().with_meter(&mut count))
            .unwrap();
    }
    let mut calls = 0;
    let mut cancel = |_| {
        calls += 1;
        if calls > admissions {
            Err(EngineError::new(
                "NUMBER",
                Utf16::from("/host"),
                "mid-work cancellation",
            ))
        } else {
            Ok(())
        }
    };
    let error = engine
        .normalize_row_scope(&input, &mut Context::ordinary().with_meter(&mut cancel))
        .unwrap_err();
    assert!(error.is_control_failure());
    assert_eq!(error.code, "NUMBER");
    assert_eq!(error.path, Utf16::from("/host"));
    assert!(calls > admissions);
}
#[test]
fn sol_migration_and_discovery_preserve_late_semantic_looking_host_failures() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let fixture = load(
        "docs/helix/04-build/evidence/rust-migration/r3/sol-implementation-closure/frozen.json",
    );
    let cases =
        umf_codegen::value::array_items(umf_codegen::value::member(&fixture, "cases").unwrap())
            .unwrap();
    let request = umf_codegen::value::member(&cases[0], "request").unwrap();
    let previous = umf_codegen::value::member(request, "previous").unwrap();
    let next = umf_codegen::value::member(request, "next").unwrap();
    for operation in 0..2 {
        let mut total = 0;
        {
            let mut count = |_| {
                total += 1;
                Ok(())
            };
            let mut ctx = Context::ordinary().with_meter(&mut count);
            if operation == 0 {
                engine.compile_table_migration(request, &mut ctx).unwrap();
            } else {
                engine
                    .discover_table_migration_changes(previous, next, &mut ctx)
                    .unwrap();
            }
        }
        assert!(total > 100);
        let threshold = total * 3 / 4;
        let mut calls = 0;
        let mut stop = |_| {
            calls += 1;
            if calls > threshold {
                Err(EngineError::new(
                    "LIMIT",
                    Utf16::from("/host"),
                    "late resource refusal",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut stop);
        let result = if operation == 0 {
            engine.compile_table_migration(request, &mut ctx)
        } else {
            engine.discover_table_migration_changes(previous, next, &mut ctx)
        };
        let error = result.unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "LIMIT");
        assert_eq!(error.path, Utf16::from("/host"));
    }
}

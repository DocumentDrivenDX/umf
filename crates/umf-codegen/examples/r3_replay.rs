// SPDX-License-Identifier: MIT OR Apache-2.0
//! Host-side incremental conformance driver. This is not the production CLI.
use std::{
    fs,
    io::{self, BufRead},
    path::Path,
};
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::serialization::{read_json_value, stringify_compact, Format};
use umf_core::{Context, EngineError, Limits, ResourceProfile, ResourceSet, Utf16, Value};

fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(members) => members
            .iter()
            .find(|(k, _)| k.units().iter().copied().eq(key.encode_utf16()))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => value.to_utf8().ok(),
        _ => None,
    }
}
fn object(members: Vec<(&str, Value)>) -> Value {
    Value::Object(members.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
fn parse(source: &str) -> Result<Value, EngineError> {
    let mut ctx = Context::with_limits(
        ResourceProfile::Cooperative,
        Limits {
            max_text_units: 64 * 1024 * 1024,
            max_values: 2_000_000,
            max_depth: 256,
            ..Limits::ordinary()
        },
    )?;
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut ctx,
    )
}
fn load(root: &Path, path: &str) -> Value {
    parse(&fs::read_to_string(root.join(path)).expect("read explicit resource file"))
        .expect("parse explicit resource file")
}
fn resources(root: &Path) -> CodegenResources {
    let tables = load(root, "spec/extensions/tables/package.json");
    let actions = load(root, "spec/extensions/actions/package.json");
    let tables_schema = field(&tables, "schema").expect("table schema").clone();
    let actions_schema = field(&actions, "schema").expect("action schema").clone();
    CodegenResources::new(
        ResourceSet::new(
            load(root, "spec/core/schema.json"),
            load(root, "spec/core/semantic-type-reference.schema.json"),
            load(root, "spec/core/extension-package.schema.json"),
            load(root, "spec/metamodel/generated/core-constraints.json"),
            load(root, "spec/metamodel/generated/domain-policy.json"),
        ),
        tables,
        tables_schema,
        actions,
        actions_schema,
        load(root, "spec/extensions/binding/package.json"),
        load(root, "spec/extensions/binding-stable/package.json"),
        &mut Context::catalog(),
    )
    .expect("prepare codegen resources")
}
fn execute(engine: &CodegenEngine<'_>, input: &Value) -> Result<Value, EngineError> {
    let op = field(input, "operation")
        .and_then(text)
        .ok_or_else(|| EngineError::new("REQUEST", Utf16::default(), "operation required"))?;
    let request = field(input, "request")
        .ok_or_else(|| EngineError::new("REQUEST", Utf16::default(), "request required"))?;
    let mut ctx = Context::ordinary();
    match op.as_str() {
        "generatePythonClient" => engine.generate_python_client(request, &mut ctx),
        "generateAccessPackage" => engine.generate_access_package(
            field(request, "request").ok_or_else(|| {
                EngineError::new(
                    "INPUT",
                    Utf16::default(),
                    "Typed access admission refused: INPUT",
                )
            })?,
            field(request, "profile").ok_or_else(|| {
                EngineError::new(
                    "INPUT",
                    Utf16::default(),
                    "Typed access admission refused: INPUT",
                )
            })?,
            &mut ctx,
        ),
        "diffAccessPackages" => engine.diff_access_packages(
            field(request, "before").ok_or_else(|| {
                EngineError::new("INPUT", Utf16::default(), "Package input required")
            })?,
            field(request, "after").ok_or_else(|| {
                EngineError::new("INPUT", Utf16::default(), "Package input required")
            })?,
            &mut ctx,
        ),
        "inspectTableLifecycle" => engine.inspect_table_lifecycle(request, &mut ctx),
        "normalizeRowScope" => engine.normalize_row_scope(request, &mut ctx),
        "discoverTableMigrationChanges" => {
            let Value::Object(fields) = request else {
                return Err(EngineError::new(
                    "MIGRATION_CHANGES_FAILED",
                    Utf16::default(),
                    "Expected exact previous and next deployment bundle members",
                ));
            };
            if fields.len() != 2
                || field(request, "previous").is_none()
                || field(request, "next").is_none()
            {
                return Err(EngineError::new(
                    "MIGRATION_CHANGES_FAILED",
                    Utf16::default(),
                    "Expected exact previous and next deployment bundle members",
                ));
            }
            let changes = engine.discover_table_migration_changes(
                field(request, "previous").unwrap(),
                field(request, "next").unwrap(),
                &mut ctx,
            )?;
            Ok(object(vec![("changes", changes)]))
        }
        "compileTableDeployment" => engine.compile_table_deployment(request, &mut ctx),
        "verifyTableDeployment" => engine.verify_table_deployment(
            field(request, "bundle").ok_or_else(|| {
                EngineError::new("NON_JSON", Utf16::default(), "Value is not JSON-compatible")
            })?,
            &mut ctx,
        ),
        "compileTableMigration" => engine.compile_table_migration(request, &mut ctx),
        "verifyTableMigration" => engine.verify_table_migration(
            field(request, "plan").ok_or_else(|| {
                EngineError::new("NON_JSON", Utf16::default(), "Value is not JSON-compatible")
            })?,
            &mut ctx,
        ),
        _ => Err(EngineError::new(
            "UNIMPLEMENTED_DRIVER_OPERATION",
            Utf16::default(),
            "Operation not yet connected to this incremental driver",
        )),
    }
}
fn main() {
    let root = std::env::args()
        .nth(1)
        .expect("usage: r3_replay REPOSITORY_ROOT");
    let resources = resources(Path::new(&root));
    let engine = CodegenEngine::new(&resources);
    for line in io::stdin().lock().lines() {
        let mut operation = None;
        let result = line
            .map_err(|error| EngineError::new("HOST_IO", Utf16::default(), error.to_string()))
            .and_then(|source| parse(&source))
            .and_then(|input| {
                operation = field(&input, "operation").and_then(text);
                execute(&engine, &input)
            });
        let result = match result {
            Ok(result) => object(vec![("ok", Value::Bool(true)), ("result", result)]),
            Err(error) => {
                let omit_path = !error.is_control_failure()
                    && matches!(
                        error.code.as_str(),
                        "GENERATION_FAILED"
                            | "DEPLOYMENT_FAILED"
                            | "DEPLOYMENT_INVALID"
                            | "MIGRATION_FAILED"
                            | "MIGRATION_INVALID"
                            | "MIGRATION_CHANGES_FAILED"
                            | "ROW_SCOPE_FAILED"
                    );
                let mut fields = vec![
                    ("code", Value::string_utf8(error.code)),
                    ("message", Value::String(error.message)),
                ];
                if !omit_path {
                    fields.push((
                        if operation.as_deref() == Some("generateAccessPackage") {
                            "pointer"
                        } else {
                            "path"
                        },
                        Value::String(error.path),
                    ));
                }
                object(vec![("ok", Value::Bool(false)), ("error", object(fields))])
            }
        };
        println!(
            "{}",
            stringify_compact(&result)
                .expect("serialize result")
                .to_utf8()
                .expect("JSON output encoding")
        );
    }
}

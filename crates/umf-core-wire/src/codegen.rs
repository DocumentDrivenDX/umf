// SPDX-License-Identifier: MIT OR Apache-2.0
//! Additive R3 qualification transport. Artifact values cannot supply code.
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::{Context, EngineError, ResourceSet, Utf16, Value};

use super::{encode, field, take_field, transport_context};

fn required(value: &mut Value, name: &str) -> Result<Value, EngineError> {
    take_field(value, name).ok_or_else(|| {
        EngineError::new(
            "REQUEST",
            name.into(),
            "Explicit codegen resource is required",
        )
    })
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (name.into(), value))
            .collect(),
    )
}
fn missing_argument() -> EngineError {
    EngineError::new("NON_JSON", Utf16::default(), "Value is not JSON-compatible")
}
fn invoke(
    engine: &CodegenEngine<'_>,
    operation: &str,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    match operation {
        "generatePythonClient" => engine.generate_python_client(request, ctx),
        "compileTableDeployment" => engine.compile_table_deployment(request, ctx),
        "verifyTableDeployment" => engine
            .verify_table_deployment(field(request, "bundle").ok_or_else(missing_argument)?, ctx),
        "compileTableMigration" => engine.compile_table_migration(request, ctx),
        "verifyTableMigration" => {
            engine.verify_table_migration(field(request, "plan").ok_or_else(missing_argument)?, ctx)
        }
        "normalizeRowScope" => engine.normalize_row_scope(request, ctx),
        "singleSetCapabilities" => engine.single_set_capabilities(request, ctx),
        "prepareSingleSetAction" => engine.prepare_single_set_action(request, ctx),
        "admitGeneratedActionInvocation" => engine.admit_generated_action_invocation(request, ctx),
        "admitGeneratedRecordValues" => engine.admit_generated_record_values(request, ctx),
        "discoverTableMigrationChanges" => {
            let fields = match request {
                Value::Object(fields) => fields,
                _ => {
                    return Err(EngineError::new(
                        "MIGRATION_CHANGES_FAILED",
                        Utf16::default(),
                        "Expected exact previous and next deployment bundle members",
                    ))
                }
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
            Ok(object(vec![(
                "changes",
                engine.discover_table_migration_changes(
                    field(request, "previous").unwrap(),
                    field(request, "next").unwrap(),
                    ctx,
                )?,
            )]))
        }
        "generateAccessPackage" => engine.generate_access_package(
            field(request, "request").ok_or_else(missing_argument)?,
            field(request, "profile").ok_or_else(missing_argument)?,
            ctx,
        ),
        "diffAccessPackages" => engine.diff_access_packages(
            field(request, "before").ok_or_else(missing_argument)?,
            field(request, "after").ok_or_else(missing_argument)?,
            ctx,
        ),
        _ => Err(EngineError::new(
            "REQUEST",
            Utf16::default(),
            "Unknown codegen operation",
        )),
    }
}
fn semantic_error(
    error: EngineError,
    operation: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    // Host/control failures never become ordinary compilation outcomes, even
    // when the host deliberately returns a semantic-looking code or message.
    if error.is_control_failure() {
        return Err(error);
    }
    ctx.charge_work(
        error
            .code
            .len()
            .saturating_add(error.message.len())
            .saturating_add(error.path.len()),
        Utf16::default(),
    )?;
    let omit_path = matches!(
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
            if operation == "generateAccessPackage" {
                "pointer"
            } else {
                "path"
            },
            Value::String(error.path),
        ));
    }
    Ok(object(vec![
        ("ok", Value::Bool(false)),
        ("error", object(fields)),
    ]))
}

pub(super) fn execute(
    operation: &str,
    request: &mut Value,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> Result<String, EngineError> {
    let mut raw = take_field(request, "resources").ok_or_else(|| {
        EngineError::new(
            "REQUEST",
            Utf16::default(),
            "Explicit resources are required",
        )
    })?;
    let resources = {
        let mut catalog = Context::catalog().with_host_control(control);
        let core = ResourceSet::new(
            required(&mut raw, "coreSchema")?,
            required(&mut raw, "referenceSchema")?,
            required(&mut raw, "packageSchema")?,
            required(&mut raw, "constraints")?,
            required(&mut raw, "domainPolicy")?,
        );
        let tables = required(&mut raw, "tablesPackage")?;
        let actions = required(&mut raw, "actionsPackage")?;
        let binding = required(&mut raw, "bindingPackage")?;
        let stable_binding = required(&mut raw, "stableBindingPackage")?;
        let tables_schema = umf_core::copy_json(
            field(&tables, "schema").ok_or_else(|| {
                EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Table package schema is required",
                )
            })?,
            &mut catalog,
        )?;
        let actions_schema = umf_core::copy_json(
            field(&actions, "schema").ok_or_else(|| {
                EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Action package schema is required",
                )
            })?,
            &mut catalog,
        )?;
        CodegenResources::new(
            core,
            tables,
            tables_schema,
            actions,
            actions_schema,
            binding,
            stable_binding,
            &mut catalog,
        )?
    };
    let payload = field(request, "request").ok_or_else(|| {
        EngineError::new("REQUEST", Utf16::default(), "Codegen request is required")
    })?;
    let result = {
        let mut ctx = Context::ordinary().with_host_control(control);
        match invoke(
            &CodegenEngine::new(&resources),
            operation,
            payload,
            &mut ctx,
        ) {
            Ok(result) => object(vec![("ok", Value::Bool(true)), ("result", result)]),
            Err(error) => semantic_error(error, operation, &mut ctx)?,
        }
    };
    encode(&result, &mut transport_context().with_host_control(control))
}

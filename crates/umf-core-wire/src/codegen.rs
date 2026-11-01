// SPDX-License-Identifier: MIT OR Apache-2.0
//! Additive R3 qualification transport. Artifact values cannot supply code.
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::{Context, EngineError, ResourceSet, Utf16, Value};

use super::{encode, field, take_field};

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
fn exact_fields(value: &Value, names: &[&str]) -> bool {
    let Value::Object(fields) = value else {
        return false;
    };
    fields.len() == names.len()
        && names.iter().all(|name| {
            fields
                .iter()
                .filter(|(key, _)| key == &Utf16::from(*name))
                .count()
                == 1
        })
}
fn invoke(
    engine: &CodegenEngine<'_>,
    operation: &str,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    match operation {
        "inspectActions" => {
            engine.inspect_actions(field(request, "source").ok_or_else(missing_argument)?, ctx)
        }
        "declareAction" => engine.declare_action(
            field(request, "source").ok_or_else(missing_argument)?,
            match field(request, "module") {
                Some(Value::String(value)) => value,
                _ => return Err(missing_argument()),
            },
            field(request, "action").ok_or_else(missing_argument)?,
            ctx,
        ),
        "editAction" => engine.edit_action(
            field(request, "source").ok_or_else(missing_argument)?,
            field(request, "identity").ok_or_else(missing_argument)?,
            field(request, "replacement").ok_or_else(missing_argument)?,
            ctx,
        ),
        "assessAction" => engine.assess_action(
            field(request, "source").ok_or_else(missing_argument)?,
            field(request, "identity").ok_or_else(missing_argument)?,
            field(request, "profile").ok_or_else(missing_argument)?,
            ctx,
        ),
        "admitActionDeclaration" => umf_codegen::actions::selectors::admit_action_declaration(
            engine,
            field(request, "document").ok_or_else(missing_argument)?,
            field(request, "action").ok_or_else(missing_argument)?,
            ctx,
        ),
        "admitActionInputs" => umf_codegen::actions::selectors::admit_action_inputs(
            engine,
            field(request, "document").ok_or_else(missing_argument)?,
            field(request, "action").ok_or_else(missing_argument)?,
            field(request, "inputs").ok_or_else(missing_argument)?,
            matches!(field(request, "outputs"), Some(Value::Bool(true))),
            ctx,
        ),
        "selectActionIdentity" => umf_codegen::actions::selectors::select_action_identity(
            engine,
            field(request, "document").ok_or_else(missing_argument)?,
            field(request, "action").ok_or_else(missing_argument)?,
            field(request, "frame").ok_or_else(missing_argument)?,
            field(request, "inputs").ok_or_else(missing_argument)?,
            ctx,
        ),
        "actionFieldValueKey" => {
            let reference = field(request, "reference").ok_or_else(missing_argument)?;
            if !exact_fields(reference, &["module", "element"]) {
                return Err(EngineError::new(
                    "ACTION_REFERENCE",
                    Utf16::default(),
                    "Expected exact module/element reference",
                ));
            }
            let module = match field(reference, "module") {
                Some(Value::String(value)) => value.to_utf8().map_err(|_| missing_argument())?,
                _ => return Err(missing_argument()),
            };
            let element = match field(reference, "element") {
                Some(Value::String(value)) => value.to_utf8().map_err(|_| missing_argument())?,
                _ => return Err(missing_argument()),
            };
            Ok(Value::string_utf8(
                serde_json::to_string(&[module, element]).map_err(|_| missing_argument())?,
            ))
        }
        "compileActionSelector" => umf_codegen::actions::selectors::compile_action_selector(
            engine,
            field(request, "document").ok_or_else(missing_argument)?,
            field(request, "action").ok_or_else(missing_argument)?,
            field(request, "frame").ok_or_else(missing_argument)?,
            ctx,
        ),
        "validateBulkOutcome" => umf_codegen::actions::bulk::validate_bulk_outcome(
            engine,
            field(request, "artifact").ok_or_else(missing_argument)?,
            ctx,
        ),
        "compileActionRule" => {
            let phase = match field(request, "phase") {
                Some(Value::String(value)) => value.to_utf8().map_err(|_| missing_argument())?,
                _ => return Err(missing_argument()),
            };
            umf_codegen::actions::selectors::compile_action_rule(
                engine,
                field(request, "document").ok_or_else(missing_argument)?,
                field(request, "action").ok_or_else(missing_argument)?,
                field(request, "rule").ok_or_else(missing_argument)?,
                &phase,
                ctx,
            )
        }
        "evaluateActionRule" => {
            let Value::Object(fields) = request else {
                return Err(missing_argument());
            };
            let names = ["document", "action", "rule", "phase", "state"];
            if fields.len() != names.len()
                || fields
                    .iter()
                    .any(|(key, _)| !names.iter().any(|name| key == &Utf16::from(*name)))
            {
                return Err(EngineError::new(
                    "ACTION_RULE_SOURCE",
                    Utf16::default(),
                    "Expected exact document/action/rule/phase/state request",
                ));
            }
            let phase = match field(request, "phase") {
                Some(Value::String(value)) => value.to_utf8().map_err(|_| missing_argument())?,
                _ => return Err(missing_argument()),
            };
            umf_codegen::actions::evaluation::evaluate_action_rule(
                engine.resources(),
                field(request, "document").ok_or_else(missing_argument)?,
                field(request, "action").ok_or_else(missing_argument)?,
                field(request, "rule").ok_or_else(missing_argument)?,
                &phase,
                field(request, "state").ok_or_else(missing_argument)?,
                ctx,
            )
            .map(Value::Bool)
        }

        "inspectSagas" => {
            engine.inspect_sagas(field(request, "source").ok_or_else(missing_argument)?, ctx)
        }
        "declareSaga" => engine.declare_saga(
            field(request, "source").ok_or_else(missing_argument)?,
            match field(request, "module") {
                Some(Value::String(value)) => value,
                _ => return Err(missing_argument()),
            },
            field(request, "definition").ok_or_else(missing_argument)?,
            ctx,
        ),
        "editSaga" => engine.edit_saga(
            field(request, "source").ok_or_else(missing_argument)?,
            field(request, "identity").ok_or_else(missing_argument)?,
            field(request, "replacement").ok_or_else(missing_argument)?,
            ctx,
        ),
        "assessSaga" => engine.assess_saga(
            field(request, "source").ok_or_else(missing_argument)?,
            field(request, "identity").ok_or_else(missing_argument)?,
            field(request, "capabilities").ok_or_else(missing_argument)?,
            ctx,
        ),
        "generatePythonClient" => engine.generate_python_client(request, ctx),
        "reviewedValueDigest" => {
            if !exact_fields(request, &["value"]) {
                return Err(EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Expected exact value member",
                ));
            }
            engine.reviewed_value_digest(field(request, "value").ok_or_else(missing_argument)?, ctx)
        }
        "compileTableDeployment" => engine.compile_table_deployment(request, ctx),
        "verifyTableDeployment" => engine
            .verify_table_deployment(field(request, "bundle").ok_or_else(missing_argument)?, ctx),
        "compileTableMigration" => engine.compile_table_migration(request, ctx),
        "verifyTableMigration" => {
            engine.verify_table_migration(field(request, "plan").ok_or_else(missing_argument)?, ctx)
        }
        "compileTableInventoryMigration" => engine.compile_table_inventory_migration(request, ctx),
        "discoverTableInventoryMigrationChanges" => {
            if !exact_fields(request, &["previous", "next", "selector", "history"]) {
                return Err(EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Expected exact inventory discovery members",
                ));
            }
            engine.discover_table_inventory_migration_changes(
                field(request, "previous").ok_or_else(missing_argument)?,
                field(request, "next").ok_or_else(missing_argument)?,
                field(request, "selector").ok_or_else(missing_argument)?,
                field(request, "history").ok_or_else(missing_argument)?,
                ctx,
            )
        }
        "verifyTableInventoryMigration" => {
            if !exact_fields(request, &["plan", "history"]) {
                return Err(EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Expected exact inventory verification members",
                ));
            }
            engine.verify_table_inventory_migration(
                field(request, "plan").ok_or_else(missing_argument)?,
                field(request, "history").ok_or_else(missing_argument)?,
                ctx,
            )
        }
        "serializeTableInventoryMigration" => {
            if !exact_fields(request, &["plan", "history"]) {
                return Err(EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Expected exact inventory serialization members",
                ));
            }
            engine.serialize_table_inventory_migration(
                field(request, "plan").ok_or_else(missing_argument)?,
                field(request, "history").ok_or_else(missing_argument)?,
                ctx,
            )
        }
        "irreversiblePurgeDisclosure" => {
            if !exact_fields(request, &["candidate"]) {
                return Err(EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Expected exact purge candidate member",
                ));
            }
            engine.irreversible_table_purge_disclosure(
                field(request, "candidate").ok_or_else(missing_argument)?,
                ctx,
            )
        }
        "normalizeRowScope" => engine.normalize_row_scope(request, ctx),
        "prepareRowScope" => {
            if !exact_fields(request, &["input", "context"]) {
                return Err(EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Expected exact input/context members",
                ));
            }
            engine.prepare_row_scope(request, ctx)
        }
        "completeRowScope" => {
            let source_request = field(request, "request").ok_or_else(missing_argument)?;
            if !exact_fields(request, &["request", "prepared", "admitPolicyDiagnostics"])
                || !exact_fields(source_request, &["input", "context"])
            {
                return Err(EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Expected exact row-scope callback members",
                ));
            }
            engine.complete_row_scope(
                source_request,
                field(request, "prepared").ok_or_else(missing_argument)?,
                field(request, "admitPolicyDiagnostics").ok_or_else(missing_argument)?,
                ctx,
            )
        }
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
                    ));
                }
            };
            let has_selector = field(request, "selector").is_some();
            let allowed = if has_selector {
                ["previous", "next", "selector"].as_slice()
            } else {
                ["previous", "next"].as_slice()
            };
            if fields.len() != allowed.len()
                || fields
                    .iter()
                    .any(|(key, _)| !allowed.iter().any(|name| key == &Utf16::from(*name)))
                || allowed.iter().any(|name| {
                    fields
                        .iter()
                        .filter(|(key, _)| key == &Utf16::from(*name))
                        .count()
                        != 1
                })
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
                engine.discover_table_migration_changes_selected(
                    field(request, "previous").unwrap(),
                    field(request, "next").unwrap(),
                    field(request, "selector"),
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
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let mut raw = take_field(request, "resources").ok_or_else(|| {
        EngineError::new(
            "REQUEST",
            Utf16::default(),
            "Explicit resources are required",
        )
    })?;
    let resources = build_resources(&mut raw, ctx)?;
    execute_with_resources(operation, request, &resources, ctx)
}

pub(super) fn build_resources(
    raw: &mut Value,
    ctx: &mut Context<'_>,
) -> Result<CodegenResources, EngineError> {
    ctx.with_catalog_value_limit(|catalog| {
        let core = ResourceSet::new(
            required(raw, "coreSchema")?,
            required(raw, "referenceSchema")?,
            required(raw, "packageSchema")?,
            required(raw, "constraints")?,
            required(raw, "domainPolicy")?,
        );
        let tables = required(raw, "tablesPackage")?;
        let actions = required(raw, "actionsPackage")?;
        let binding = required(raw, "bindingPackage")?;
        let stable_binding = required(raw, "stableBindingPackage")?;
        let tables_schema = umf_core::copy_json(
            field(&tables, "schema").ok_or_else(|| {
                EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Table package schema is required",
                )
            })?,
            catalog,
        )?;
        let actions_schema = umf_core::copy_json(
            field(&actions, "schema").ok_or_else(|| {
                EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Action package schema is required",
                )
            })?,
            catalog,
        )?;
        let base = CodegenResources::new(
            core,
            tables,
            tables_schema,
            actions,
            actions_schema,
            binding,
            stable_binding,
            catalog,
        )?;
        if let Some(saga) = take_field(raw, "sagaPackage") {
            let schema = umf_core::copy_json(
                field(&saga, "schema").ok_or_else(missing_argument)?,
                catalog,
            )?;
            base.with_sagas(saga, schema, catalog)
        } else {
            Ok(base)
        }
    })
}

pub(super) fn execute_with_resources(
    operation: &str,
    request: &mut Value,
    resources: &CodegenResources,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let payload = field(request, "request").ok_or_else(|| {
        EngineError::new("REQUEST", Utf16::default(), "Codegen request is required")
    })?;
    let result = match invoke(&CodegenEngine::new(resources), operation, payload, ctx) {
        Ok(result) => object(vec![("ok", Value::Bool(true)), ("result", result)]),
        Err(error) => semantic_error(error, operation, ctx)?,
    };
    ctx.with_tagged_transport_limit(|ctx| encode(&result, ctx))
}

pub(super) fn execute_host_read_v3(
    request: &mut Value,
    host_read: &mut dyn umf_codegen::generation::PythonClientHostReadV3,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let mut raw = take_field(request, "resources").ok_or_else(|| {
        EngineError::new(
            "REQUEST",
            Utf16::default(),
            "Explicit resources are required",
        )
    })?;
    let resources = build_resources(&mut raw, ctx)?;
    execute_host_read_with_resources(request, host_read, &resources, ctx)
}

pub(super) fn execute_host_read_with_resources(
    request: &mut Value,
    host_read: &mut dyn umf_codegen::generation::PythonClientHostReadV3,
    resources: &CodegenResources,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let result = {
        let v4 = field(request, "hostReadProfile")
            == Some(&Value::string_utf8("umf.python-client-host-read/4"));
        let generated = if v4 {
            CodegenEngine::new(resources).generate_python_client_host_v4(host_read, ctx)
        } else {
            CodegenEngine::new(resources).generate_python_client_host_v3(host_read, ctx)
        };
        match generated {
            Ok(result) => object(vec![("ok", Value::Bool(true)), ("result", result)]),
            Err(error) => semantic_error(error, "generatePythonClient", ctx)?,
        }
    };
    ctx.with_tagged_transport_limit(|ctx| encode(&result, ctx))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(source: &str) -> Value {
        umf_core::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            umf_core::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap()
    }

    fn request() -> Value {
        let tables = parse(include_str!(
            "../../../python/umf_codegen/src/umf_codegen/_resources/tables.package.json"
        ));
        let actions = parse(include_str!(
            "../../../python/umf_codegen/src/umf_codegen/_resources/actions.package.json"
        ));
        let resources = object(vec![
            (
                "coreSchema",
                parse(include_str!("../../../spec/core/schema.json")),
            ),
            (
                "referenceSchema",
                parse(include_str!(
                    "../../../spec/core/semantic-type-reference.schema.json"
                )),
            ),
            (
                "packageSchema",
                parse(include_str!(
                    "../../../spec/core/extension-package.schema.json"
                )),
            ),
            (
                "constraints",
                parse(include_str!(
                    "../../../spec/metamodel/generated/core-constraints.json"
                )),
            ),
            (
                "domainPolicy",
                parse(include_str!(
                    "../../../spec/metamodel/generated/domain-policy.json"
                )),
            ),
            ("tablesPackage", tables),
            ("actionsPackage", actions),
            (
                "bindingPackage",
                parse(include_str!(
                    "../../../python/umf_codegen/src/umf_codegen/_resources/binding.package.json"
                )),
            ),
            (
                "stableBindingPackage",
                parse(include_str!(
                    "../../../python/umf_codegen/src/umf_codegen/_resources/stable-binding.package.json"
                )),
            ),
        ]);
        object(vec![
            ("resources", resources),
            ("request", Value::Object(Vec::new())),
        ])
    }

    #[test]
    fn codegen_resource_admission_uses_the_context_carried_from_decode() {
        let mut request = request();
        let mut context = Context::ordinary();
        // Simulate tagged decode leaving only ten units in the wide counter.
        // Catalog copying in this real codegen entry must continue the same
        // counter and overflow; the former fresh catalog Context would pass.
        context.carry_transport_usage(u64::MAX - 10, 0);
        let error = execute("singleSetCapabilities", &mut request, &mut context).unwrap_err();
        assert_eq!(error.code, "LIMIT");
        assert_eq!(error.message, Utf16::from("Work counter overflow"));
        assert_eq!(context.charged_work(), u64::MAX - 2);
        assert_eq!(
            context.limits().max_values,
            umf_core::Limits::ordinary().max_values
        );
    }

    #[test]
    fn retained_resources_reuse_compilation_but_keep_each_call_control_fresh() {
        let mut envelope = request();
        let mut raw = take_field(&mut envelope, "resources").unwrap();
        let mut setup = Context::ordinary();
        let resources = build_resources(&mut raw, &mut setup).unwrap();

        let request_value = object(vec![("request", Value::Object(Vec::new()))]);
        let mut first = request_value.clone();
        let mut allow = |_amount| Ok(());
        let mut call_context = Context::ordinary().with_host_control(&mut allow);
        let first_output = execute_with_resources(
            "singleSetCapabilities",
            &mut first,
            &resources,
            &mut call_context,
        )
        .unwrap();

        let mut second = request_value.clone();
        let mut calls = 0usize;
        let mut fail_second = |_amount| {
            calls += 1;
            if calls > 1 {
                Err(EngineError::new(
                    "CANCELLED",
                    Utf16::default(),
                    "call two stopped",
                ))
            } else {
                Ok(())
            }
        };
        let mut second_context = Context::ordinary().with_host_control(&mut fail_second);
        let second_output = execute_with_resources(
            "singleSetCapabilities",
            &mut second,
            &resources,
            &mut second_context,
        )
        .unwrap_err();
        assert_eq!(second_output.code, "CANCELLED");

        let mut third = request_value;
        let mut allow_again = |_amount| Ok(());
        let mut third_context = Context::ordinary().with_host_control(&mut allow_again);
        let third_output = execute_with_resources(
            "singleSetCapabilities",
            &mut third,
            &resources,
            &mut third_context,
        )
        .unwrap();
        assert_eq!(first_output, third_output);
    }
}

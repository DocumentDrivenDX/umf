// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native owner for the explicit two-stage source→Avro→TableSpec projection.
use crate::{
    avro_tablespec_projection,
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_avro_projection, postgresql_avro_projection,
    registry::Registry,
    sqlserver_avro_projection,
    value::{copy_json, Utf16, Value},
};

fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (key(name), value))
            .collect(),
    )
}
fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(candidate, _)| candidate == &key(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(value)) => Some(value),
        _ => None,
    }
}
fn error(message: &str) -> EngineError {
    EngineError::new("TABLESPEC_CHAIN_POLICY", Utf16::default(), message)
}
fn js_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => *value != 0.0 && !value.is_nan(),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}
fn stage_issues(stage: &str, issues: &[Value]) -> Vec<Value> {
    issues
        .iter()
        .map(|issue| {
            object(vec![
                ("stage", Value::String(key(stage))),
                (
                    "sourceDocumentPath",
                    Value::String(key(if stage == "sourceToAvro" {
                        "/stages/sourceToAvro/source"
                    } else {
                        "/stages/avroToTableSpec/source"
                    })),
                ),
                ("issue", issue.clone()),
            ])
        })
        .collect()
}
fn set(value: &mut Value, name: &str, item: Value) {
    if let Value::Object(fields) = value {
        if let Some((_, existing)) = fields
            .iter_mut()
            .find(|(candidate, _)| candidate == &key(name))
        {
            *existing = item;
        } else {
            fields.push((key(name), item));
        }
    }
}
fn status_is(value: &Value, expected: &str) -> bool {
    text(member(value, "status")) == Some(&key(expected))
}

/// Retain both stage reports and the original source while running the current
/// PostgreSQL, SQL Server, or Parquet binding through Avro into TableSpec.
pub fn project_to_tablespec_via_avro(
    input: &Value,
    options: &Value,
    parquet_runtime: Option<(&Engine, &Registry, &mut dyn Capabilities)>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(input, ctx)?;
    let policy = copy_json(options, ctx)?;
    let Value::Object(policy_members) = &policy else {
        return Err(error(
            "Explicit source kind and both stage policies required",
        ));
    };
    if policy_members.iter().any(|(name, _)| {
        !["sourceKind", "toAvro", "toTableSpec"]
            .iter()
            .any(|allowed| name == &key(allowed))
    }) {
        return Err(error(
            "Explicit source kind and both stage policies required",
        ));
    }
    let source_kind = text(member(&policy, "sourceKind"))
        .ok_or_else(|| error("Explicit source kind and both stage policies required"))?;
    let to_avro = member(&policy, "toAvro")
        .filter(|value| js_truthy(value))
        .ok_or_else(|| error("Explicit source kind and both stage policies required"))?;
    let to_tablespec = member(&policy, "toTableSpec")
        .filter(|value| js_truthy(value))
        .ok_or_else(|| error("Explicit source kind and both stage policies required"))?;
    if !["postgresql", "sqlserver", "parquet"]
        .iter()
        .any(|kind| source_kind == &key(kind))
    {
        return Err(error(
            "Explicit source kind and both stage policies required",
        ));
    }
    avro_tablespec_projection::validate_avro_to_tablespec_policy(to_tablespec, ctx).map_err(
        |failure| {
            if failure.code == "AVRO_TABLESPEC_POLICY" {
                error("Invalid or duplicate second-stage column bindings")
            } else {
                failure
            }
        },
    )?;

    let first = if source_kind == &key("postgresql") {
        postgresql_avro_projection::project_postgresql_to_avro(&source, to_avro, ctx)?
    } else if source_kind == &key("sqlserver") {
        sqlserver_avro_projection::project_sqlserver_to_avro(&source, to_avro, ctx)?
    } else {
        let (engine, registry, capabilities) =
            parquet_runtime.ok_or_else(|| error("Parquet projection runtime is unavailable"))?;
        parquet_avro_projection::project_parquet_to_avro(
            &source,
            to_avro,
            engine,
            registry,
            capabilities,
            ctx,
        )?
    };
    let first_issues = match member(&first, "issues") {
        Some(Value::Array(issues)) => issues.as_slice(),
        _ => &[],
    };
    let mut result = object(vec![
        ("status", Value::String(key("blocked"))),
        ("source", source),
        ("policy", policy.clone()),
        ("stages", object(vec![("sourceToAvro", first.clone())])),
        (
            "issues",
            Value::Array(stage_issues("sourceToAvro", first_issues)),
        ),
    ]);
    if !status_is(&first, "projected") {
        return copy_json(&result, ctx);
    }
    let Some(avro_target) = member(&first, "target") else {
        return copy_json(&result, ctx);
    };
    let tablespec = crate::tablespec_adapter::TableSpecRuntime::new(ctx)?;
    let second = avro_tablespec_projection::project_avro_to_tablespec(
        avro_target,
        to_tablespec,
        &tablespec,
        ctx,
    )?;
    if let Value::Object(stages) = member(&result, "stages").cloned().unwrap_or(Value::Null) {
        let mut updated = Value::Object(stages);
        set(&mut updated, "avroToTableSpec", second.clone());
        set(&mut result, "stages", updated);
    }
    let second_issues = match member(&second, "issues") {
        Some(Value::Array(issues)) => issues.as_slice(),
        _ => &[],
    };
    let mut issues = match member(&result, "issues") {
        Some(Value::Array(issues)) => issues.clone(),
        _ => Vec::new(),
    };
    issues.extend(stage_issues("avroToTableSpec", second_issues));
    set(&mut result, "issues", Value::Array(issues));
    if status_is(&second, "projected")
        && member(&second, "target").is_some()
        && member(&second, "nativeSchema").is_some()
    {
        set(&mut result, "status", Value::String(key("projected")));
        set(
            &mut result,
            "target",
            member(&second, "target").unwrap().clone(),
        );
        set(
            &mut result,
            "nativeSchema",
            member(&second, "nativeSchema").unwrap().clone(),
        );
    }
    // Match the TypeScript composite's completed-result copy.
    copy_json(&result, ctx)
}

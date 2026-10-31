// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed tagged-wire profile for exact Iceberg table metadata source operations.
use crate::{decode, encode, field, result_envelope};
use std::collections::BTreeSet;
use umf_core::{
    iceberg_table::{self, IcebergTableResources},
    Context, Diagnostic, EngineError, Severity, Utf16, Validation, Value,
};

pub const PROFILE: &str = "umf.iceberg-table-wire/1";
pub const OPERATIONS: &[&str] = &[
    "iceberg.table.import",
    "iceberg.table.inspect",
    "iceberg.table.inspectPayload",
    "iceberg.table.export",
    "iceberg.table.getNode",
    "iceberg.table.editNode",
    "iceberg.table.inspectContext",
    "iceberg.table.inspectTransforms",
    "iceberg.table.inspectTransformType",
    "iceberg.table.proposeRename",
    "iceberg.table.proposePromotion",
];
fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(v: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match v {
        Some(Value::String(s)) => Ok(s),
        _ => Err(request(&format!("{name} must be a string"))),
    }
}
fn required<'a>(v: &'a Value, name: &str) -> Result<&'a Value, EngineError> {
    field(v, name).ok_or_else(|| request(&format!("{name} is required")))
}
fn op_fields(op: &str) -> Option<&'static [&'static str]> {
    Some(match op {
        "iceberg.table.import" => &["profile", "op", "id", "source"],
        "iceberg.table.inspect"
        | "iceberg.table.export"
        | "iceberg.table.inspectContext"
        | "iceberg.table.inspectTransforms" => &["profile", "op", "document"],
        "iceberg.table.inspectTransformType" => &["profile", "op", "sourceType", "transform"],
        "iceberg.table.inspectPayload" => &["profile", "op", "payload"],
        "iceberg.table.getNode" => &["profile", "op", "document", "path"],
        "iceberg.table.editNode" => &["profile", "op", "document", "path", "replacementJson"],
        "iceberg.table.proposeRename" => &[
            "profile",
            "op",
            "document",
            "fieldId",
            "newName",
            "nextSchemaId",
        ],
        "iceberg.table.proposePromotion" => &[
            "profile",
            "op",
            "document",
            "fieldId",
            "targetType",
            "nextSchemaId",
        ],
        _ => return None,
    })
}
fn validate_members(v: &Value, allowed: &[&str], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Object(fields) = v else {
        return Err(request("Iceberg table request must be an object"));
    };
    let mut seen = BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_text(key.len(), Utf16::default())?;
        ctx.charge_work(1, Utf16::default())?;
        if !allowed.iter().any(|x| key == &Utf16::from(*x)) || !seen.insert(key) {
            return Err(request(
                "Iceberg table request has an unknown or duplicate member",
            ));
        }
    }
    Ok(())
}
fn severity(s: Severity) -> Value {
    Value::string_utf8(if s == Severity::Error {
        "error"
    } else {
        "warning"
    })
}
fn validation_value(v: Validation, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(v.diagnostics.len(), Utf16::default())?;
    let mut ds = Vec::with_capacity(v.diagnostics.len());
    for d in v.diagnostics {
        ctx.charge_text(
            d.code
                .len()
                .saturating_add(d.path.len())
                .saturating_add(d.message.len()),
            Utf16::default(),
        )?;
        ds.push(diagnostic_value(d));
    }
    Ok(Value::Object(vec![
        (u("valid"), Value::Bool(v.valid)),
        (u("complete"), Value::Bool(v.complete)),
        (u("diagnostics"), Value::Array(ds)),
    ]))
}
fn diagnostic_value(d: Diagnostic) -> Value {
    Value::Object(vec![
        (u("code"), Value::String(d.code)),
        (u("path"), Value::String(d.path)),
        (u("severity"), severity(d.severity)),
        (u("message"), Value::String(d.message)),
    ])
}
fn diagnostics_value(
    diagnostics: Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(diagnostics.len(), Utf16::default())?;
    let mut values = Vec::with_capacity(diagnostics.len());
    for d in diagnostics {
        ctx.charge_text(
            d.code
                .len()
                .saturating_add(d.path.len())
                .saturating_add(d.message.len()),
            Utf16::default(),
        )?;
        values.push(diagnostic_value(d));
    }
    Ok(Value::Array(values))
}
fn number_i32(v: Option<&Value>, name: &str) -> Result<i64, EngineError> {
    let Some(Value::Number(number)) = v else {
        return Err(request(&format!("{name} must be an integer")));
    };
    if !number.is_finite() || number.fract() != 0.0 || *number < 0.0 || *number > i32::MAX as f64 {
        return Err(request(&format!(
            "{name} must be a nonnegative signed int32"
        )));
    }
    Ok(*number as i64)
}
fn transform_type_value(
    value: iceberg_table::IcebergTransformType,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_text(
        value
            .source_type
            .len()
            .saturating_add(value.transform.len())
            .saturating_add(value.status.len())
            .saturating_add(value.reason.len()),
        Utf16::default(),
    )?;
    let mut fields = vec![
        (u("sourceType"), Value::String(value.source_type)),
        (u("transform"), Value::String(value.transform)),
        (u("status"), Value::String(value.status)),
        (u("complete"), Value::Bool(value.complete)),
        (u("reason"), Value::String(value.reason)),
    ];
    if let Some(ty) = value.result_type {
        ctx.charge_text(ty.len(), Utf16::default())?;
        fields.push((u("resultType"), Value::String(ty)));
    }
    Ok(Value::Object(fields))
}
fn transforms_value(
    value: iceberg_table::IcebergTableTransforms,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(value.bindings.len(), Utf16::default())?;
    let mut bindings = Vec::with_capacity(value.bindings.len());
    for b in value.bindings {
        ctx.charge_text(
            b.field_path.len().saturating_add(b.source_path.len()),
            Utf16::default(),
        )?;
        bindings.push(Value::Object(vec![
            (u("fieldPath"), Value::String(b.field_path)),
            (u("sourcePath"), Value::String(b.source_path)),
            (u("assessment"), transform_type_value(b.assessment, ctx)?),
        ]));
    }
    Ok(Value::Object(vec![
        (u("status"), Value::String(value.status)),
        (u("complete"), Value::Bool(value.complete)),
        (u("bindings"), Value::Array(bindings)),
        (u("diagnostics"), diagnostics_value(value.diagnostics, ctx)?),
    ]))
}
fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn validate_operation_input(
    req: &Value,
    op: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let allowed = op_fields(op).ok_or_else(|| request("Unknown Iceberg table operation"))?;
    validate_members(req, allowed, ctx)?;
    if field(req, "profile") != Some(&Value::string_utf8(PROFILE)) {
        return Err(request("Unsupported Iceberg table wire profile"));
    }
    match op {
        "iceberg.table.import" => {
            let id = text(field(req, "id"), "id")?;
            let source = text(field(req, "source"), "source")?;
            ctx.charge_text(id.len(), Utf16::default())?;
            ctx.charge_text(source.len(), Utf16::default())?;
        }
        "iceberg.table.inspect"
        | "iceberg.table.export"
        | "iceberg.table.inspectContext"
        | "iceberg.table.inspectTransforms" => {
            required(req, "document")?;
        }
        "iceberg.table.inspectTransformType" => {
            let source = text(field(req, "sourceType"), "sourceType")?;
            let transform = text(field(req, "transform"), "transform")?;
            ctx.charge_text(source.len(), Utf16::default())?;
            ctx.charge_text(transform.len(), Utf16::default())?;
        }
        "iceberg.table.proposeRename" | "iceberg.table.proposePromotion" => {
            required(req, "document")?;
            let text_field = if op == "iceberg.table.proposeRename" {
                "newName"
            } else {
                "targetType"
            };
            let name = text(field(req, text_field), text_field)?;
            ctx.charge_text(name.len(), Utf16::default())?;
            for key in ["fieldId", "nextSchemaId"] {
                let Some(Value::Number(number)) = field(req, key) else {
                    return Err(request(&format!("{key} must be an integer")));
                };
                if !number.is_finite()
                    || number.fract() != 0.0
                    || *number < 0.0
                    || *number > i32::MAX as f64
                {
                    return Err(request(&format!(
                        "{key} must be a nonnegative signed int32"
                    )));
                }
            }
        }
        "iceberg.table.inspectPayload" => {
            required(req, "payload")?;
        }
        "iceberg.table.getNode" => {
            required(req, "document")?;
            let p = text(field(req, "path"), "path")?;
            ctx.charge_text(p.len(), Utf16::default())?;
        }
        "iceberg.table.editNode" => {
            required(req, "document")?;
            let p = text(field(req, "path"), "path")?;
            let s = text(field(req, "replacementJson"), "replacementJson")?;
            ctx.charge_text(p.len(), Utf16::default())?;
            ctx.charge_text(s.len(), Utf16::default())?;
        }
        _ => unreachable!(),
    }
    Ok(())
}
pub fn execute_wire(wire: &str) -> String {
    let mut control = |_: usize| Ok(());
    execute_wire_with_control(wire, &mut control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let req = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
        let op = text(field(&req, "op"), "op")?;
        let op_str = op
            .to_utf8()
            .map_err(|_| request("op must be well-formed UTF-16"))?;
        validate_operation_input(&req, &op_str, &mut ctx)?;
        let resources = IcebergTableResources::new(&mut ctx)?;
        let output = match op_str.as_str() {
            "iceberg.table.import" => {
                let id = text(field(&req, "id"), "id")?;
                let source = text(field(&req, "source"), "source")?;
                iceberg_table::import_iceberg_table(source.units(), id, &resources, &mut ctx)?
            }
            "iceberg.table.inspect" => {
                let doc = required(&req, "document")?;
                let v = iceberg_table::inspect_iceberg_table(doc, &resources, &mut ctx)?;
                validation_value(v, &mut ctx)?
            }
            "iceberg.table.inspectContext" => {
                let doc = required(&req, "document")?;
                let context =
                    iceberg_table::inspect_iceberg_table_context(doc, &resources, &mut ctx)?;
                let diagnostics = diagnostics_value(context.diagnostics, &mut ctx)?;
                ctx.charge_work(context.resolved.len().saturating_add(5), Utf16::default())?;
                ctx.charge_text(
                    "statuscompletescoperesolveddiagnostics"
                        .encode_utf16()
                        .count(),
                    Utf16::default(),
                )?;
                let resolved_units = context.resolved.iter().fold(0usize, |total, (key, path)| {
                    total.saturating_add(key.len()).saturating_add(path.len())
                });
                ctx.charge_text(resolved_units, Utf16::default())?;
                let mut resolved = Vec::with_capacity(context.resolved.len());
                for (key, path) in context.resolved {
                    resolved.push((key, Value::String(path)));
                }
                Value::Object(vec![
                    (u("status"), Value::String(context.status)),
                    (u("complete"), Value::Bool(context.complete)),
                    (u("scope"), Value::String(context.scope)),
                    (u("resolved"), Value::Object(resolved)),
                    (u("diagnostics"), diagnostics),
                ])
            }
            "iceberg.table.inspectTransforms" => {
                let doc = required(&req, "document")?;
                transforms_value(
                    iceberg_table::inspect_iceberg_table_transforms(doc, &resources, &mut ctx)?,
                    &mut ctx,
                )?
            }
            "iceberg.table.inspectTransformType" => {
                let source = text(field(&req, "sourceType"), "sourceType")?;
                let transform = text(field(&req, "transform"), "transform")?;
                transform_type_value(
                    iceberg_table::inspect_iceberg_transform_type(source, transform, &mut ctx)?,
                    &mut ctx,
                )?
            }
            "iceberg.table.inspectPayload" => {
                let payload = required(&req, "payload")?;
                diagnostics_value(
                    iceberg_table::inspect_iceberg_table_payload(payload, &resources, &mut ctx)?,
                    &mut ctx,
                )?
            }
            "iceberg.table.proposeRename" => {
                let document = required(&req, "document")?;
                let name = text(field(&req, "newName"), "newName")?;
                let field_id = number_i32(field(&req, "fieldId"), "fieldId")?;
                let next_schema_id = number_i32(field(&req, "nextSchemaId"), "nextSchemaId")?;
                let (candidate, report) = iceberg_table::propose_iceberg_table_rename(
                    document,
                    field_id,
                    name,
                    next_schema_id,
                    &resources,
                    &mut ctx,
                )?;
                let bindings = transforms_value(report.bindings, &mut ctx)?;
                ctx.charge_work(report.limitations.len().saturating_add(8), Utf16::default())?;
                ctx.charge_text(
                    report
                        .old_name
                        .len()
                        .saturating_add(report.new_name.len())
                        .saturating_add(report.appended_schema_path.len())
                        .saturating_add(report.limitations.iter().map(Utf16::len).sum::<usize>()),
                    Utf16::default(),
                )?;
                Value::Object(vec![
                    (u("document"), candidate),
                    (
                        u("report"),
                        Value::Object(vec![
                            (u("complete"), Value::Bool(report.complete)),
                            (
                                u("previousSchemaId"),
                                Value::Number(report.previous_schema_id as f64),
                            ),
                            (
                                u("nextSchemaId"),
                                Value::Number(report.next_schema_id as f64),
                            ),
                            (u("fieldId"), Value::Number(report.field_id as f64)),
                            (u("oldName"), Value::String(report.old_name)),
                            (u("newName"), Value::String(report.new_name)),
                            (
                                u("appendedSchemaPath"),
                                Value::String(report.appended_schema_path),
                            ),
                            (u("bindings"), bindings),
                            (
                                u("limitations"),
                                Value::Array(
                                    report.limitations.into_iter().map(Value::String).collect(),
                                ),
                            ),
                        ]),
                    ),
                ])
            }
            "iceberg.table.proposePromotion" => {
                let document = required(&req, "document")?;
                let target = text(field(&req, "targetType"), "targetType")?;
                let field_id = number_i32(field(&req, "fieldId"), "fieldId")?;
                let next_schema_id = number_i32(field(&req, "nextSchemaId"), "nextSchemaId")?;
                let (candidate, report) = iceberg_table::propose_iceberg_table_promotion(
                    document,
                    field_id,
                    target,
                    next_schema_id,
                    &resources,
                    &mut ctx,
                )?;
                let bindings = transforms_value(report.bindings, &mut ctx)?;
                ctx.charge_work(
                    report
                        .limitations
                        .len()
                        .saturating_add(report.checked_partition_fields.len())
                        .saturating_add(10),
                    Utf16::default(),
                )?;
                ctx.charge_text(
                    report
                        .source_type
                        .len()
                        .saturating_add(report.target_type.len())
                        .saturating_add(report.appended_schema_path.len())
                        .saturating_add(
                            report
                                .checked_partition_fields
                                .iter()
                                .map(Utf16::len)
                                .sum::<usize>(),
                        )
                        .saturating_add(report.limitations.iter().map(Utf16::len).sum::<usize>()),
                    Utf16::default(),
                )?;
                Value::Object(vec![
                    (u("document"), candidate),
                    (
                        u("report"),
                        Value::Object(vec![
                            (u("complete"), Value::Bool(report.complete)),
                            (
                                u("previousSchemaId"),
                                Value::Number(report.previous_schema_id as f64),
                            ),
                            (
                                u("nextSchemaId"),
                                Value::Number(report.next_schema_id as f64),
                            ),
                            (u("fieldId"), Value::Number(report.field_id as f64)),
                            (u("sourceType"), Value::String(report.source_type)),
                            (u("targetType"), Value::String(report.target_type)),
                            (
                                u("appendedSchemaPath"),
                                Value::String(report.appended_schema_path),
                            ),
                            (
                                u("checkedPartitionFields"),
                                Value::Array(
                                    report
                                        .checked_partition_fields
                                        .into_iter()
                                        .map(Value::String)
                                        .collect(),
                                ),
                            ),
                            (u("bindings"), bindings),
                            (
                                u("limitations"),
                                Value::Array(
                                    report.limitations.into_iter().map(Value::String).collect(),
                                ),
                            ),
                        ]),
                    ),
                ])
            }
            "iceberg.table.export" => {
                let doc = required(&req, "document")?;
                Value::String(iceberg_table::export_iceberg_table(
                    doc, &resources, &mut ctx,
                )?)
            }
            "iceberg.table.getNode" => {
                let doc = required(&req, "document")?;
                let path = text(field(&req, "path"), "path")?;
                iceberg_table::get_iceberg_table_node(doc, path, &resources, &mut ctx)?
                    .tagged_value_preserving_extras(&mut ctx)?
            }
            "iceberg.table.editNode" => {
                let doc = required(&req, "document")?;
                let path = text(field(&req, "path"), "path")?;
                let source = text(field(&req, "replacementJson"), "replacementJson")?;
                let (candidate, v) = iceberg_table::propose_iceberg_table_node_edit(
                    doc,
                    path,
                    source.units(),
                    &resources,
                    &mut ctx,
                )?;
                Value::Object(vec![
                    (u("document"), candidate),
                    (u("validation"), validation_value(v, &mut ctx)?),
                ])
            }
            _ => return Err(request("Unknown Iceberg table operation")),
        };
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Dedicated tagged transport for native SQL Server catalog observations.
use crate::{decode, encode, field, result_envelope};
use umf_core::{Context, EngineError, Utf16, Value, sqlserver_adapter as sqlserver};

pub const PROFILE: &str = "umf.sqlserver-wire/1";

fn request_error(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn required_string<'a>(value: &'a Value, name: &str) -> Result<&'a Utf16, EngineError> {
    match field(value, name) {
        Some(Value::String(text)) => Ok(text),
        _ => Err(request_error(&format!("{name} must be a string"))),
    }
}
fn required<'a>(value: &'a Value, name: &str) -> Result<&'a Value, EngineError> {
    field(value, name).ok_or_else(|| request_error(&format!("{name} is required")))
}
fn allowed(op: &str) -> Option<&'static [&'static str]> {
    Some(match op {
        "sqlserver.import" => &["profile", "op", "source", "id"],
        "sqlserver.inspect"
        | "sqlserver.export"
        | "sqlserver.columns"
        | "sqlserver.constraints"
        | "sqlserver.indexes" => &["profile", "op", "document"],
        "sqlserver.inspectPayload" => &["profile", "op", "payload"],
        "sqlserver.edit" => &["profile", "op", "document", "path", "text"],
        "sqlserver.facetType" => &["profile", "op", "native"],
        "sqlserver.facetPredicate" => &["profile", "op", "source", "columnName"],
        "sqlserver.facetConstraints" => &["profile", "op", "document", "columnPath"],
        _ => return None,
    })
}
fn validate_request(request: &Value, ctx: &mut Context<'_>) -> Result<&'static str, EngineError> {
    let Value::Object(fields) = request else {
        return Err(request_error("SQL Server request must be an object"));
    };
    let profile = required_string(request, "profile")?;
    if profile != &Utf16::from(PROFILE) {
        return Err(request_error("SQL Server wire profile is required"));
    }
    let op_text = required_string(request, "op")?;
    if op_text.len() > 64 {
        return Err(request_error("invalid SQL Server operation"));
    }
    let op = [
        "sqlserver.import",
        "sqlserver.inspect",
        "sqlserver.export",
        "sqlserver.columns",
        "sqlserver.constraints",
        "sqlserver.indexes",
        "sqlserver.inspectPayload",
        "sqlserver.edit",
        "sqlserver.facetType",
        "sqlserver.facetPredicate",
        "sqlserver.facetConstraints",
    ]
    .into_iter()
    .find(|op| op.encode_utf16().eq(op_text.units().iter().copied()))
    .ok_or_else(|| request_error("unknown SQL Server operation"))?;
    let allowed = allowed(op).unwrap();
    let mut seen = std::collections::BTreeSet::new();
    for (name, _) in fields {
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        if !seen.insert(name)
            || !allowed
                .iter()
                .any(|candidate| name == &Utf16::from(*candidate))
        {
            return Err(request_error(
                "SQL Server request contains an unknown or duplicate member",
            ));
        }
    }
    match op {
        "sqlserver.import" => {
            let source = required_string(request, "source")?;
            if source.len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "SQL Server source exceeds the text limit",
                ));
            }
            required_string(request, "id")?;
        }
        "sqlserver.inspect"
        | "sqlserver.export"
        | "sqlserver.columns"
        | "sqlserver.constraints"
        | "sqlserver.indexes" => {
            required(request, "document")?;
        }
        "sqlserver.inspectPayload" => {
            required(request, "payload")?;
        }
        "sqlserver.edit" => {
            required(request, "document")?;
            required_string(request, "path")?;
            let text = required_string(request, "text")?;
            if text.len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "SQL Server replacement exceeds the text limit",
                ));
            }
        }
        "sqlserver.facetType" => {
            required(request, "native")?;
        }
        "sqlserver.facetPredicate" => {
            let source = required(request, "source")?;
            let column_name = required_string(request, "columnName")?;
            let source_too_long =
                matches!(source, Value::String(value) if value.len() > ctx.limits().max_text_units);
            if source_too_long || column_name.len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "SQL Server facet input exceeds the text limit",
                ));
            }
        }
        "sqlserver.facetConstraints" => {
            required(request, "document")?;
            let path = required_string(request, "columnPath")?;
            if path.len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "SQL Server column path exceeds the text limit",
                ));
            }
        }
        _ => unreachable!(),
    }
    Ok(op)
}
fn execute(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let op = validate_request(request, ctx)?;
    match op {
        "sqlserver.import" => {
            let catalog =
                sqlserver::SqlServerCatalog::import(required_string(request, "source")?, ctx)?;
            sqlserver::document_value(required_string(request, "id")?, &catalog, ctx)
        }
        "sqlserver.inspect" => sqlserver::inspect_document(required(request, "document")?, ctx),
        "sqlserver.inspectPayload" => sqlserver::inspect_payload(required(request, "payload")?, ctx),
        "sqlserver.export" => Ok(Value::String(sqlserver::export_document(
            required(request, "document")?,
            ctx,
        )?)),
        "sqlserver.columns" => {
            let catalog = sqlserver::catalog_from_document(required(request, "document")?, ctx)?;
            sqlserver::column_metadata_value(&catalog, ctx)
        }
        "sqlserver.constraints" => {
            let catalog = sqlserver::catalog_from_document(required(request, "document")?, ctx)?;
            sqlserver::constraint_metadata_value(&catalog, ctx)
        }
        "sqlserver.indexes" => {
            let catalog = sqlserver::catalog_from_document(required(request, "document")?, ctx)?;
            sqlserver::index_metadata_value(&catalog, ctx)
        }
        "sqlserver.edit" => sqlserver::propose_document_edit(
            required(request, "document")?,
            required_string(request, "path")?,
            required_string(request, "text")?,
            ctx,
        ),
        "sqlserver.facetType" => {
            sqlserver::inspect_sqlserver_facet_type(required(request, "native")?, ctx)
        }
        "sqlserver.facetPredicate" => sqlserver::inspect_sqlserver_facet_predicate(
            required(request, "source")?,
            required_string(request, "columnName")?,
            ctx,
        ),
        "sqlserver.facetConstraints" => sqlserver::inspect_sqlserver_facet_constraints(
            required(request, "document")?,
            required_string(request, "columnPath")?,
            ctx,
        ),
        _ => Err(request_error("unknown SQL Server operation")),
    }
}
pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
        let value = execute(&request, &mut ctx)?;
        encode(&value, &mut ctx)
    })();
    result_envelope(result)
}

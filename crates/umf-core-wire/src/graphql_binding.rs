// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged-wire dispatcher for native GraphQL SDL operations.
use umf_core::{Context, EngineError, Utf16, Value};
use umf_graphql::engine_registry::{self, GraphqlResources};

use crate::{decode, encode, field, result_envelope};

pub const PROFILE: &str = "umf.graphql-wire/1";

fn request_error(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}

fn valid_utf16(text: &Utf16) -> bool {
    let mut units = text.units().iter().copied();
    while let Some(unit) = units.next() {
        match unit {
            0xD800..=0xDBFF => {
                if !matches!(units.next(), Some(0xDC00..=0xDFFF)) {
                    return false;
                }
            }
            0xDC00..=0xDFFF => return false,
            _ => {}
        }
    }
    true
}

fn is_ascii(text: &Utf16, expected: &str) -> bool {
    text.units().len() == expected.len() && text.units().iter().copied().eq(expected.encode_utf16())
}

fn required_string<'a>(value: &'a Value, name: &str) -> Result<&'a Utf16, EngineError> {
    match field(value, name) {
        Some(Value::String(text)) => Ok(text),
        _ => Err(request_error(&format!("{name} must be a string"))),
    }
}

fn validate_members(
    value: &Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(request_error("GraphQL request must be an object"));
    };
    let mut seen = std::collections::BTreeSet::new();
    for (name, _) in fields {
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        if !allowed
            .iter()
            .any(|candidate| name == &Utf16::from(*candidate))
            || !seen.insert(name)
        {
            return Err(request_error(
                "GraphQL request has an unknown or duplicate member",
            ));
        }
    }
    Ok(())
}

fn allowed(op: &str) -> Option<&'static [&'static str]> {
    Some(match op {
        "graphql.import" => &["profile", "op", "source", "id", "mode"],
        "graphql.validate" | "graphql.export" | "graphql.getAst" | "graphql.exportBundle" => {
            &["profile", "op", "document"]
        }
        "graphql.editAst" => &["profile", "op", "document", "candidateAst"],
        _ => return None,
    })
}

fn diagnostic_value(d: umf_core::Diagnostic) -> Value {
    Value::Object(vec![
        (Utf16::from("code"), Value::String(d.code)),
        (Utf16::from("path"), Value::String(d.path)),
        (Utf16::from("message"), Value::String(d.message)),
        (
            Utf16::from("severity"),
            Value::String(Utf16::from(match d.severity {
                umf_core::Severity::Error => "error",
                umf_core::Severity::Warning => "warning",
            })),
        ),
    ])
}

fn validate_operation_input(
    op: &str,
    request: &Value,
    ctx: &Context<'_>,
) -> Result<(), EngineError> {
    match op {
        "graphql.import" => {
            let source = required_string(request, "source")?;
            if source.units().len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "GraphQL SDL exceeds the text limit",
                ));
            }
            if !valid_utf16(source) {
                return Err(request_error("source must contain well-formed UTF-16"));
            }
            let id = required_string(request, "id")?;
            if id.units().len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "GraphQL id exceeds the text limit",
                ));
            }
            if !valid_utf16(id) {
                return Err(request_error("id must contain well-formed UTF-16"));
            }
            match field(request, "mode") {
                None | Some(Value::Null | Value::String(_)) => {}
                _ => return Err(request_error("mode must be a string or null")),
            }
            if let Some(Value::String(mode)) = field(request, "mode") {
                if !valid_utf16(mode) {
                    return Err(request_error("mode must be valid UTF-16"));
                }
                if !is_ascii(mode, "schema") && !is_ascii(mode, "fragment") {
                    return Err(request_error("mode must be schema or fragment"));
                }
            }
        }
        "graphql.validate" | "graphql.export" | "graphql.getAst" | "graphql.exportBundle" => {
            field(request, "document").ok_or_else(|| request_error("document is required"))?;
        }
        "graphql.editAst" => {
            field(request, "document").ok_or_else(|| request_error("document is required"))?;
            field(request, "candidateAst")
                .ok_or_else(|| request_error("candidateAst is required"))?;
        }
        _ => return Err(request_error("Unknown GraphQL operation")),
    }
    Ok(())
}

fn execute(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let op = required_string(request, "op")?;
    if op.units().len() > 32 || !valid_utf16(op) {
        return Err(request_error("op is not a valid GraphQL wire operation"));
    }
    if !is_ascii(required_string(request, "profile")?, PROFILE) {
        return Err(request_error("GraphQL wire profile is required"));
    }
    let op = [
        "graphql.import",
        "graphql.validate",
        "graphql.export",
        "graphql.getAst",
        "graphql.exportBundle",
        "graphql.editAst",
    ]
    .into_iter()
    .find(|candidate| is_ascii(op, candidate))
    .ok_or_else(|| request_error("Unknown GraphQL operation"))?;
    validate_members(request, allowed(op).unwrap(), ctx)?;
    validate_operation_input(op, request, ctx)?;
    let mut resources = GraphqlResources::new(ctx)?;
    let result = match op {
        "graphql.import" => {
            let source = required_string(request, "source")?
                .to_utf8()
                .map_err(|_| request_error("source must be valid UTF-16"))?;
            let id = required_string(request, "id")?
                .to_utf8()
                .map_err(|_| request_error("id must be valid UTF-16"))?;
            let mode = match field(request, "mode") {
                None | Some(Value::Null) => None,
                Some(Value::String(s)) => Some(
                    s.to_utf8()
                        .map_err(|_| request_error("mode must be valid UTF-16"))?,
                ),
                _ => return Err(request_error("mode must be a string or null")),
            };
            engine_registry::import_sdl(&mut resources, &source, &id, mode.as_deref(), ctx)?
        }
        "graphql.validate" => {
            let document =
                field(request, "document").ok_or_else(|| request_error("document is required"))?;
            let report = engine_registry::validate_document(&mut resources, document, ctx)?;
            ctx.charge_work(report.diagnostics.len(), Utf16::default())?;
            Value::Object(vec![
                (Utf16::from("valid"), Value::Bool(report.valid)),
                (Utf16::from("complete"), Value::Bool(report.complete)),
                (
                    Utf16::from("diagnostics"),
                    Value::Array(
                        report
                            .diagnostics
                            .into_iter()
                            .map(diagnostic_value)
                            .collect(),
                    ),
                ),
            ])
        }
        "graphql.export" => Value::String(engine_registry::export_sdl(
            &mut resources,
            field(request, "document").ok_or_else(|| request_error("document is required"))?,
            ctx,
        )?),
        "graphql.getAst" => engine_registry::get_graphql_ast(
            &mut resources,
            field(request, "document").ok_or_else(|| request_error("document is required"))?,
            ctx,
        )?,
        "graphql.exportBundle" => {
            let bundle = engine_registry::export_graphql_bundle(
                &mut resources,
                field(request, "document").ok_or_else(|| request_error("document is required"))?,
                ctx,
            )?;
            ctx.charge_work(bundle.diagnostics.len(), Utf16::default())?;
            Value::Object(vec![
                (Utf16::from("schema"), Value::String(bundle.schema)),
                (Utf16::from("source"), bundle.source),
                (
                    Utf16::from("diagnostics"),
                    Value::Array(
                        bundle
                            .diagnostics
                            .into_iter()
                            .map(diagnostic_value)
                            .collect(),
                    ),
                ),
            ])
        }
        "graphql.editAst" => {
            let document =
                field(request, "document").ok_or_else(|| request_error("document is required"))?;
            let candidate = umf_core::copy_json(
                field(request, "candidateAst")
                    .ok_or_else(|| request_error("candidateAst is required"))?,
                ctx,
            )?;
            engine_registry::edit_ast(
                &mut resources,
                document,
                |ast| {
                    *ast = candidate;
                    Ok(())
                },
                ctx,
            )?
        }
        _ => return Err(request_error("Unknown GraphQL operation")),
    };
    Ok(result)
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

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Dedicated tagged-wire API for the current monolithic TableSpec adapter.
use umf_core::{Context, EngineError, Severity, Utf16, Value, tablespec_adapter as tablespec};

use crate::{decode, encode, field, result_envelope};

pub const PROFILE: &str = "umf.tablespec-wire/1";

fn request_error(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn required_string<'a>(value: &'a Value, name: &str) -> Result<&'a Utf16, EngineError> {
    match field(value, name) {
        Some(Value::String(text)) => Ok(text),
        _ => Err(request_error(&format!("{name} must be a string"))),
    }
}
fn required_value<'a>(value: &'a Value, name: &str) -> Result<&'a Value, EngineError> {
    field(value, name).ok_or_else(|| request_error(&format!("{name} is required")))
}
fn index_value(value: &Value) -> Result<usize, EngineError> {
    match value {
        Value::Number(number)
            if number.is_finite()
                && number.fract() == 0.0
                && *number >= 0.0
                && *number <= 9_007_199_254_740_991.0 =>
        {
            Ok(*number as usize)
        }
        _ => Err(request_error("index must be a nonnegative safe integer")),
    }
}
fn operation(value: &Value) -> Result<&'static str, EngineError> {
    let op = required_string(value, "op")?;
    [
        "importTableSpec",
        "inspectTableSpec",
        "exportTableSpec",
        "getTableSpecTable",
        "getTableSpecColumn",
        "editTableSpecTable",
        "editTableSpecColumn",
        "importTableSpecBundle",
        "exportTableSpecBundle",
    ]
    .into_iter()
    .find(|candidate| op == &Utf16::from(*candidate))
    .ok_or_else(|| request_error("unknown TableSpec operation"))
}
fn allowed(op: &str) -> &'static [&'static str] {
    match op {
        "importTableSpec" => &["profile", "op", "source", "id", "format"],
        "inspectTableSpec" | "exportTableSpec" | "getTableSpecTable" => {
            &["profile", "op", "document"]
        }
        "getTableSpecColumn" => &["profile", "op", "document", "index"],
        "editTableSpecTable" => &["profile", "op", "document", "changes"],
        "editTableSpecColumn" => &["profile", "op", "document", "index", "changes"],
        "importTableSpecBundle" => &["profile", "op", "files", "id"],
        "exportTableSpecBundle" => &["profile", "op", "document"],
        _ => &[],
    }
}
fn validate_request(request: &Value, ctx: &mut Context<'_>) -> Result<&'static str, EngineError> {
    let Value::Object(fields) = request else {
        return Err(request_error("request must be an object"));
    };
    let mut seen = std::collections::BTreeSet::new();
    let profile = required_string(request, "profile")?;
    if profile != &Utf16::from(PROFILE) {
        return Err(request_error("TableSpec wire profile is required"));
    }
    let op = operation(request)?;
    for (key, _) in fields {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        if !seen.insert(key)
            || !allowed(op)
                .iter()
                .any(|member| key == &Utf16::from(*member))
        {
            return Err(request_error("request has an unknown member"));
        }
    }
    match op {
        "importTableSpec" => {
            let source = required_string(request, "source")?;
            if source.len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "LIMIT",
                    Utf16::default(),
                    "Text limit exceeded",
                ));
            }
            required_string(request, "id")?;
            match required_string(request, "format")? {
                format if format == &Utf16::from("json") || format == &Utf16::from("yaml") => {}
                _ => return Err(request_error("format must be json or yaml")),
            }
        }
        "inspectTableSpec" | "exportTableSpec" | "getTableSpecTable" => {
            required_value(request, "document")?;
        }
        "getTableSpecColumn" => {
            required_value(request, "document")?;
            index_value(required_value(request, "index")?)?;
        }
        "editTableSpecTable" => {
            required_value(request, "document")?;
            if !matches!(required_value(request, "changes")?, Value::Object(_)) {
                return Err(request_error("changes must be an object"));
            }
        }
        "editTableSpecColumn" => {
            required_value(request, "document")?;
            index_value(required_value(request, "index")?)?;
            if !matches!(required_value(request, "changes")?, Value::Object(_)) {
                return Err(request_error("changes must be an object"));
            }
        }
        "importTableSpecBundle" => {
            required_string(request, "id")?;
            let Value::Object(files) = required_value(request, "files")? else {
                return Err(request_error("files must be an object"));
            };
            if !(2..=1000).contains(&files.len()) {
                return Err(request_error("files must contain between 2 and 1000 paths"));
            }
            let mut table = false;
            let mut column = false;
            for (path, source) in files {
                let units = path.units();
                if units.is_empty()
                    || units.first() == Some(&(b'/' as u16))
                    || units.contains(&(b'\\' as u16))
                    || units.split(|unit| *unit == b'/' as u16).any(|segment| {
                        segment.is_empty()
                            || segment == [b'.' as u16]
                            || segment == [b'.' as u16, b'.' as u16]
                    })
                {
                    return Err(EngineError::new(
                        "TABLESPEC_PATH",
                        Utf16::default(),
                        "Expected normalized relative bundle paths",
                    ));
                }
                if path == &Utf16::from("table.yaml") {
                    table = true;
                }
                if units.starts_with(&[
                    b'c' as u16,
                    b'o' as u16,
                    b'l' as u16,
                    b'u' as u16,
                    b'm' as u16,
                    b'n' as u16,
                    b's' as u16,
                    b'/' as u16,
                ]) && units.len() > 13
                    && !units[8..].contains(&(b'/' as u16))
                    && units.ends_with(&[
                        b'.' as u16,
                        b'y' as u16,
                        b'a' as u16,
                        b'm' as u16,
                        b'l' as u16,
                    ])
                {
                    column = true;
                }
                let Value::String(source) = source else {
                    return Err(EngineError::new(
                        "TABLESPEC_PATH",
                        Utf16::default(),
                        "Expected every bundle path to map to source text",
                    ));
                };
                if source.len() > ctx.limits().max_text_units {
                    return Err(EngineError::new(
                        "LIMIT",
                        Utf16::default(),
                        "Text limit exceeded",
                    ));
                }
            }
            if !table {
                return Err(EngineError::new(
                    "TABLESPEC_SPLIT",
                    Utf16::default(),
                    "Missing table.yaml",
                ));
            }
            if !column {
                return Err(EngineError::new(
                    "TABLESPEC_SPLIT",
                    Utf16::default(),
                    "Expected at least one columns/*.yaml file",
                ));
            }
        }
        "exportTableSpecBundle" => {
            required_value(request, "document")?;
        }
        _ => return Err(request_error("unknown TableSpec operation")),
    }
    Ok(op)
}
fn validation_value(
    validation: umf_core::Validation,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(
        validation.diagnostics.len().saturating_mul(4),
        Utf16::default(),
    )?;
    Ok(Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(validation.valid)),
        (Utf16::from("complete"), Value::Bool(validation.complete)),
        (
            Utf16::from("diagnostics"),
            Value::Array(
                validation
                    .diagnostics
                    .into_iter()
                    .map(|diagnostic| {
                        Value::Object(vec![
                            (Utf16::from("code"), Value::String(diagnostic.code)),
                            (Utf16::from("path"), Value::String(diagnostic.path)),
                            (Utf16::from("message"), Value::String(diagnostic.message)),
                            (
                                Utf16::from("severity"),
                                Value::string_utf8(if diagnostic.severity == Severity::Error {
                                    "error"
                                } else {
                                    "warning"
                                }),
                            ),
                        ])
                    })
                    .collect(),
            ),
        ),
    ]))
}
fn execute(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let op = validate_request(request, ctx)?;
    let runtime = tablespec::TableSpecRuntime::new(ctx)?;
    match op {
        "importTableSpec" => {
            let format = match required_string(request, "format")? {
                value if value == &Utf16::from("json") => tablespec::TableSpecFormat::Json,
                _ => tablespec::TableSpecFormat::Yaml,
            };
            runtime.import(
                required_string(request, "source")?,
                required_string(request, "id")?,
                format,
                ctx,
            )
        }
        "inspectTableSpec" => validation_value(
            runtime.inspect(required_value(request, "document")?, ctx)?,
            ctx,
        ),
        "exportTableSpec" => Ok(Value::String(
            runtime.export(required_value(request, "document")?, ctx)?,
        )),
        "getTableSpecTable" => runtime.get_table(required_value(request, "document")?, ctx),
        "getTableSpecColumn" => runtime.get_column(
            required_value(request, "document")?,
            index_value(required_value(request, "index")?)?,
            ctx,
        ),
        "editTableSpecTable" => runtime.edit_table(
            required_value(request, "document")?,
            required_value(request, "changes")?,
            ctx,
        ),
        "editTableSpecColumn" => runtime.edit_column(
            required_value(request, "document")?,
            index_value(required_value(request, "index")?)?,
            required_value(request, "changes")?,
            ctx,
        ),
        "importTableSpecBundle" => runtime.import_bundle(
            required_value(request, "files")?,
            required_string(request, "id")?,
            ctx,
        ),
        "exportTableSpecBundle" => runtime.export_bundle(required_value(request, "document")?, ctx),
        _ => Err(request_error("unknown TableSpec operation")),
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
        let output = execute(&request, &mut ctx)?;
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

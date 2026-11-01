// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned bounded inspection of captured Arrow IPC framing and footer agreement.
use crate::serialization::{self, Format};
use crate::{
    arrow_flatbuffer_binary, arrow_flatbuffer_model,
    arrow_ipc_capture::{self, ArrowIpcResources},
    context::Context,
    error::EngineError,
    value::{copy_json, Utf16, Value},
};
use base64::{engine::general_purpose::STANDARD, Engine as _};

const INVENTORY: &str = include_str!("../../../spec/extensions/arrow/flatbuffer-inventory.json");

fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn string(s: &str) -> Value {
    Value::string_utf8(s)
}
fn number(n: usize) -> Value {
    Value::Number(n as f64)
}
fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn array(value: &Value) -> Option<&[Value]> {
    match value {
        Value::Array(items) => Some(items),
        _ => None,
    }
}
fn text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(s) => s.to_utf8().ok(),
        _ => None,
    }
}
fn diagnostic(code: &str, path: &str, message: &str, severity: &str) -> Value {
    object(vec![
        ("code", string(code)),
        ("path", string(path)),
        ("severity", string(severity)),
        ("message", string(message)),
    ])
}
fn error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn magic(bytes: &[u8], offset: usize) -> bool {
    bytes.get(offset..offset.saturating_add(6)) == Some(b"ARROW1")
}
fn i32_at(bytes: &[u8], offset: usize, limit: usize) -> Result<i32, &'static str> {
    let end = offset
        .checked_add(4)
        .ok_or("Truncated or out-of-bounds IPC segment")?;
    if end > limit {
        return Err("Truncated or out-of-bounds IPC segment");
    }
    Ok(i32::from_le_bytes(
        bytes[offset..end]
            .try_into()
            .map_err(|_| "Truncated or out-of-bounds IPC segment")?,
    ))
}
fn bounded(offset: usize, length: usize, limit: usize) -> Result<(), &'static str> {
    if offset
        .checked_add(length)
        .filter(|end| *end <= limit)
        .is_none()
    {
        return Err("Truncated or out-of-bounds IPC segment");
    }
    Ok(())
}
fn capture_model<'a>(document: &'a Value) -> Result<&'a Value, EngineError> {
    let modules = array(
        field(document, "modules").ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing modules"))?,
    )
    .ok_or_else(|| error("ARROW_IPC_CAPTURE", "modules must be array"))?;
    let module = modules
        .iter()
        .find(|m| field(m, "id") == Some(&string("ipc")))
        .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing IPC module"))?;
    let elements = array(
        field(module, "elements").ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing elements"))?,
    )
    .ok_or_else(|| error("ARROW_IPC_CAPTURE", "elements must be array"))?;
    let element = elements
        .iter()
        .find(|e| field(e, "id") == Some(&string("source")))
        .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing IPC source"))?;
    field(
        field(element, "extensions")
            .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing extensions"))?,
        "umf.arrow.ipc",
    )
    .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing Arrow IPC payload"))
}
fn metadata_value<'a>(document: &'a Value) -> Option<&'a Value> {
    let modules = array(field(document, "modules")?)?;
    let module = modules.first()?;
    let elements = array(field(module, "elements")?)?;
    let element = elements.first()?;
    let extension = field(field(element, "extensions")?, "umf.arrow.flatbuffer")?;
    field(field(extension, "model")?, "value")
}

/// Interpret the optional `ARROW:schema` entry from a Rust-inspected Parquet
/// footer. The footer inspector remains the sole source of physical metadata;
/// this function only decodes the independent Arrow declaration.
pub fn get_parquet_arrow_schema(
    source: &Value,
    parquet_inspection: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let retained_source = copy_json(source, ctx)?;
    let mut diagnostics = Vec::new();
    if let Some(items) = field(parquet_inspection, "diagnostics").and_then(array) {
        for (index, item) in items.iter().enumerate() {
            ctx.charge_work(1, Utf16::from(format!("/diagnostics/{index}")))?;
            diagnostics.push(copy_json(item, ctx)?);
        }
    }
    let mut status = "blocked";
    let mut metadata_index = None;
    let mut ipc_hex = None;
    let mut message = None;
    let mut schema = None;
    let fail = |diagnostics: &mut Vec<Value>, detail: &str| {
        diagnostics.push(diagnostic(
            "PARQUET_ARROW_SCHEMA_BLOCKED",
            "/key_value_metadata",
            detail,
            "error",
        ));
    };
    if text(field(parquet_inspection, "status")).as_deref() != Some("mapped") {
        status = "blocked";
    } else {
        let empty_metadata = Value::Null;
        let entries = field(
            field(parquet_inspection, "metadata").unwrap_or(&empty_metadata),
            "key_value_metadata",
        )
        .and_then(array)
        .unwrap_or(&[]);
        let mut matches = Vec::new();
        for (index, entry) in entries.iter().enumerate() {
            ctx.charge_work(1, Utf16::from(format!("/key_value_metadata/{index}/key")))?;
            if field(entry, "key") == Some(&string("ARROW:schema")) {
                matches.push((index, entry));
            }
        }
        if matches.is_empty() {
            status = "absent";
        } else if matches.len() != 1 {
            fail(
                &mut diagnostics,
                "Duplicate ARROW:schema entries are ambiguous",
            );
        } else {
            let (index, entry) = matches[0];
            metadata_index = Some(index);
            let decoded = (|| -> Result<(Value, Value), EngineError> {
                let encoded = match field(entry, "value") {
                    Some(Value::String(value)) if !value.is_empty() => value,
                    _ => {
                        return Err(error(
                            "PARQUET_ARROW_SCHEMA_BLOCKED",
                            "ARROW:schema requires a nonempty base64 value",
                        ))
                    }
                };
                ctx.charge_text(encoded.len(), Utf16::from("/key_value_metadata"))?;
                ctx.charge_work(encoded.len(), Utf16::from("/key_value_metadata"))?;
                let encoded_utf8 = encoded.to_utf8().map_err(|_| {
                    error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "ARROW:schema must use canonical padded base64",
                    )
                })?;
                let bytes = STANDARD.decode(encoded_utf8.as_bytes()).map_err(|_| {
                    error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "ARROW:schema must use canonical padded base64",
                    )
                })?;
                if STANDARD.encode(&bytes) != encoded_utf8 {
                    return Err(error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "ARROW:schema must use canonical padded base64",
                    ));
                }
                ctx.charge_text(
                    bytes.len().saturating_mul(2),
                    Utf16::from("/key_value_metadata"),
                )?;
                ctx.charge_work(
                    bytes.len().saturating_mul(3),
                    Utf16::from("/key_value_metadata"),
                )?;
                let hex = bytes
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>();
                ipc_hex = Some(string(&hex));
                if bytes.len() < 4 {
                    return Err(error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Truncated IPC message prefix",
                    ));
                }
                let first = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
                let prefix = if first == u32::MAX { 8 } else { 4 };
                if bytes.len() < prefix {
                    return Err(error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Truncated IPC continuation prefix",
                    ));
                }
                let length = i32::from_le_bytes(bytes[prefix - 4..prefix].try_into().unwrap());
                if length <= 0 || length as usize != bytes.len() - prefix {
                    return Err(error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Expected exactly one encapsulated IPC schema message",
                    ));
                }
                let decoded = decoded_model(
                    &bytes[prefix..],
                    &Utf16::from(format!(
                        "{}/parquet-arrow-message",
                        text(field(source, "id")).unwrap_or_default()
                    )),
                    "Message",
                    ctx,
                )?;
                let decode_diagnostics = field(&decoded, "diagnostics")
                    .and_then(array)
                    .unwrap_or(&[]);
                for item in decode_diagnostics {
                    ctx.charge_work(1, Utf16::from("/key_value_metadata"))?;
                    let code = text(field(item, "code")).unwrap_or_default();
                    diagnostics.push(copy_json(item, ctx)?);
                    if code != "ARROW_FLATBUFFER_INCOMPLETE" {
                        return Err(error(
                            "PARQUET_ARROW_SCHEMA_BLOCKED",
                            "Embedded Arrow metadata contains unsupported or invalid wire content",
                        ));
                    }
                }
                let model = field(&decoded, "model").ok_or_else(|| {
                    error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Cannot decode embedded Arrow metadata",
                    )
                })?;
                let model_text = arrow_flatbuffer_model::export_arrow_flatbuffer_model(model, ctx)?;
                let model_json =
                    serialization::read_json_value(model_text.units(), Format::Json, ctx)?;
                let value = field(&model_json, "value").ok_or_else(|| {
                    error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Cannot decode embedded Arrow metadata",
                    )
                })?;
                let header = field(value, "header").ok_or_else(|| {
                    error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Embedded message header is missing",
                    )
                })?;
                if text(field(header, "type")).as_deref() != Some("Schema")
                    || unsigned(field(value, "bodyLength")).unwrap_or(0) != 0
                {
                    return Err(error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Embedded message must be a body-free Arrow Schema",
                    ));
                }
                let schema_value = field(header, "value").ok_or_else(|| {
                    error("PARQUET_ARROW_SCHEMA_BLOCKED", "Embedded schema is missing")
                })?;
                let schema_text = serialization::write_json_value(
                    &object(vec![
                        ("rootType", string("Schema")),
                        ("value", copy_json(schema_value, ctx)?),
                    ]),
                    Format::Json,
                    ctx,
                )?;
                let imported = arrow_flatbuffer_model::import_arrow_flatbuffer_model(
                    &schema_text,
                    &Utf16::from(format!(
                        "{}/parquet-arrow-schema",
                        text(field(source, "id")).unwrap_or_default()
                    )),
                    ctx,
                )?;
                Ok((copy_json(model, ctx)?, imported))
            })();
            match decoded {
                Ok((native_message, imported_schema)) => {
                    message = Some(native_message);
                    schema = Some(imported_schema);
                    status = "decoded";
                    diagnostics.push(diagnostic(
                        "PARQUET_ARROW_CORRESPONDENCE_UNVERIFIED",
                        &format!("/key_value_metadata/{index}"),
                        "Embedded Arrow schema decoded independently; agreement with Parquet fields, rows and external metadata is not established. Both declarations remain authoritative source observations.",
                        "warning",
                    ));
                }
                Err(failure)
                    if failure.is_control_failure()
                        || matches!(
                            failure.code.as_str(),
                            "LIMIT" | "RESOURCE_LIMIT" | "CAPACITY"
                        ) =>
                {
                    return Err(failure)
                }
                Err(failure) => {
                    let detail = failure
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Embedded Arrow metadata could not be decoded".into());
                    fail(&mut diagnostics, &detail);
                }
            }
        }
    }
    let mut result = vec![
        ("source", retained_source),
        ("status", string(status)),
        ("complete", Value::Bool(false)),
    ];
    if let Some(value) = metadata_index {
        result.push(("metadataIndex", number(value)));
    }
    if let Some(value) = ipc_hex {
        result.push(("ipcHex", value));
    }
    if let Some(value) = message {
        result.push(("message", value));
    }
    if let Some(value) = schema {
        result.push(("schema", value));
    }
    result.push(("diagnostics", Value::Array(diagnostics)));
    Ok(object(result))
}
fn body_length(document: &Value) -> Result<usize, &'static str> {
    let value = field(
        metadata_value(document).ok_or("Cannot read decoded message metadata")?,
        "bodyLength",
    );
    match value {
        None | Some(Value::Null) => Ok(0),
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= usize::MAX as f64 =>
        {
            Ok(*n as usize)
        }
        Some(Value::String(s)) => s
            .to_utf8()
            .ok()
            .and_then(|s| s.parse::<usize>().ok())
            .ok_or("Invalid or oversized message body length"),
        _ => Err("Invalid or oversized message body length"),
    }
}
fn decoded_model(
    bytes: &[u8],
    id: &Utf16,
    root: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    arrow_flatbuffer_binary::decode_arrow_flatbuffer(bytes, id, root, ctx)
}

fn short_name(value: &str) -> &str {
    value
        .strip_prefix("org.apache.arrow.flatbuf.")
        .unwrap_or(value)
}
fn normalized(
    value: &Value,
    ty: &str,
    declarations: &[Value],
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if depth > ctx.limits().max_depth {
        return Err(error(
            "RESOURCE_LIMIT",
            "Arrow metadata nesting exceeds inspection limit",
        ));
    }
    let ty = short_name(ty);
    if ty.starts_with('[') && ty.ends_with(']') {
        let values = array(value)
            .ok_or_else(|| error("ARROW_IPC_FOOTER_SCHEMA", "Expected Arrow metadata vector"))?;
        let mut out = Vec::with_capacity(values.len());
        for item in values {
            out.push(normalized(
                item,
                ty[1..ty.len() - 1].trim(),
                declarations,
                ctx,
                depth + 1,
            )?);
        }
        return Ok(Value::Array(out));
    }
    let declaration = declarations
        .iter()
        .find(|d| text(field(d, "name")).as_deref() == Some(ty));
    let Some(declaration) = declaration else {
        return copy_json(value, ctx);
    };
    let kind = text(field(declaration, "kind")).unwrap_or_default();
    if kind == "enum" {
        return copy_json(value, ctx);
    }
    if kind == "union" {
        let variant = text(field(value, "type")).unwrap_or_else(|| "NONE".into());
        if variant == "NONE" {
            return copy_json(value, ctx);
        }
        return normalized(
            field(value, "value")
                .ok_or_else(|| error("ARROW_IPC_FOOTER_SCHEMA", "Union value is missing"))?,
            &variant,
            declarations,
            ctx,
            depth + 1,
        );
    }
    let declared_fields = field(declaration, "fields").and_then(array).unwrap_or(&[]);
    let supplied = match value {
        Value::Object(fields) => fields,
        _ => {
            return Err(error(
                "ARROW_IPC_FOOTER_SCHEMA",
                "Expected Arrow metadata object",
            ))
        }
    };
    let mut out = Vec::new();
    for declared in declared_fields {
        ctx.charge_work(1, Utf16::default())?;
        let name = text(field(declared, "name"))
            .ok_or_else(|| error("ARROW_IPC_FOOTER_SCHEMA", "Invalid Arrow metadata field"))?;
        let field_type = text(field(declared, "type")).ok_or_else(|| {
            error(
                "ARROW_IPC_FOOTER_SCHEMA",
                "Invalid Arrow metadata field type",
            )
        })?;
        let actual = supplied
            .iter()
            .find(|(k, _)| k == &key(&name))
            .map(|(_, v)| v);
        let mut default = None;
        if actual.is_none() {
            if let Some(explicit) = text(field(declared, "default")) {
                default = Some(match field_type.as_str() {
                    "bool" => Value::Bool(explicit == "true"),
                    "int" => Value::Number(explicit.parse::<f64>().unwrap_or(0.0)),
                    "long" => string(&explicit),
                    _ => string(&explicit),
                });
            } else if field_type.starts_with('[') {
                default = Some(Value::Array(Vec::new()));
            } else if field_type == "bool" {
                default = Some(Value::Bool(false));
            } else if field_type == "int" {
                default = Some(Value::Number(0.0));
            } else if field_type == "long" {
                default = Some(string("0"));
            } else {
                let child = declarations
                    .iter()
                    .find(|d| text(field(d, "name")).as_deref() == Some(short_name(&field_type)));
                if text(child.and_then(|d| field(d, "kind"))).as_deref() == Some("enum") {
                    let first_zero = child
                        .and_then(|d| field(d, "members"))
                        .and_then(array)
                        .and_then(|items| {
                            items
                                .iter()
                                .find(|item| field(item, "value") == Some(&Value::Number(0.0)))
                        });
                    if let Some(name) = first_zero.and_then(|item| text(field(item, "name"))) {
                        default = Some(string(&name));
                    }
                }
            }
        }
        let value = actual.or(default.as_ref());
        if let Some(value) = value {
            out.push((
                key(&name),
                normalized(value, &field_type, declarations, ctx, depth + 1)?,
            ));
        }
    }
    Ok(Value::Object(out))
}

fn equivalent(
    left: &Value,
    right: &Value,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<bool, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if depth > ctx.limits().max_depth {
        return Err(error(
            "RESOURCE_LIMIT",
            "Arrow metadata comparison exceeds inspection limit",
        ));
    }
    Ok(match (left, right) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(a), Value::Bool(b)) => a == b,
        (Value::Number(a), Value::Number(b)) => a == b,
        (Value::String(a), Value::String(b)) => a == b,
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                false
            } else {
                let mut same = true;
                for (x, y) in a.iter().zip(b) {
                    if !equivalent(x, y, ctx, depth + 1)? {
                        same = false;
                        break;
                    }
                }
                same
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            if a.len() != b.len() {
                false
            } else {
                let mut same = true;
                for (k, v) in a {
                    ctx.charge_work(k.units().len().saturating_add(1), k.clone())?;
                    let Some((_, other)) = b.iter().find(|(candidate, _)| candidate == k) else {
                        same = false;
                        break;
                    };
                    if !equivalent(v, other, ctx, depth + 1)? {
                        same = false;
                        break;
                    }
                }
                same
            }
        }
        _ => false,
    })
}
fn report_decode_diagnostics(
    out: &mut Vec<Value>,
    report: &Value,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(items) = field(report, "diagnostics").and_then(array) {
        for item in items {
            ctx.charge_work(1, Utf16::from(path))?;
            let mut copied = copy_json(item, ctx)?;
            if let Value::Object(fields) = &mut copied {
                let old = fields
                    .iter()
                    .find(|(k, _)| k == &key("path"))
                    .and_then(|(_, v)| text(Some(v)))
                    .unwrap_or_default();
                let combined = format!("{path}{old}");
                if let Some((_, v)) = fields.iter_mut().find(|(k, _)| k == &key("path")) {
                    *v = string(&combined);
                }
            }
            out.push(copied);
        }
    }
    Ok(())
}

/// Inspect IPC message extents without claiming array, dictionary, or footer semantics.
pub fn inspect_arrow_ipc_layout(
    document: &Value,
    resources: &ArrowIpcResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let bytes = arrow_ipc_capture::export_arrow_ipc_capture(document, resources, ctx)?;
    let source = copy_json(document, ctx)?;
    let format = if magic(&bytes, 0) { "file" } else { "stream" };
    let mut frames = Vec::new();
    let mut diagnostics = Vec::new();
    let mut position = 0usize;
    let mut end = bytes.len();
    let mut footer = None;
    let mut eos = None;
    let mut accounted = false;
    if format == "file" {
        let footer_bounds = (|| -> Result<(usize, usize), &'static str> {
            if bytes.len() < 18 || !magic(&bytes, bytes.len().saturating_sub(6)) {
                return Err("Missing IPC file footer magic");
            }
            let length = i32_at(&bytes, bytes.len() - 10, bytes.len())?;
            if length <= 0 {
                return Err("Invalid footer length");
            }
            let length = length as usize;
            let offset = bytes
                .len()
                .checked_sub(10)
                .and_then(|n| n.checked_sub(length))
                .ok_or("Footer overlaps file header")?;
            if offset < 8 {
                return Err("Footer overlaps file header");
            }
            Ok((offset, length))
        })();
        match footer_bounds {
            Err(message) => diagnostics.push(diagnostic("ARROW_IPC_FRAMING", "", message, "error")),
            Ok((offset, length)) => {
                let decoded = decoded_model(
                    &bytes[offset..offset + length],
                    &Utf16::from("arrow-ipc/footer"),
                    "Footer",
                    ctx,
                );
                match decoded {
                    Ok(report) if field(&report, "model").is_some() => {
                        report_decode_diagnostics(&mut diagnostics, &report, "/footer", ctx)?;
                        footer = field(&report, "model")
                            .map(|model| copy_json(model, ctx))
                            .transpose()?;
                        end = offset;
                        position = 8;
                    }
                    Err(failure)
                        if failure.is_control_failure()
                            || matches!(
                                failure.code.as_str(),
                                "LIMIT" | "RESOURCE_LIMIT" | "CAPACITY"
                            ) =>
                    {
                        return Err(failure)
                    }
                    _ => {
                        diagnostics.push(diagnostic(
                            "ARROW_IPC_FRAMING",
                            "",
                            "Cannot decode file footer",
                            "error",
                        ));
                    }
                }
            }
        }
    }
    if !diagnostics
        .iter()
        .any(|d| text(field(d, "severity")).as_deref() == Some("error"))
    {
        loop {
            ctx.charge_work(1, Utf16::default())?;
            if position >= end {
                break;
            }
            if frames.len() >= 1024 {
                diagnostics.push(diagnostic(
                    "ARROW_IPC_FRAMING",
                    "",
                    "IPC frame-count limit exceeded",
                    "error",
                ));
                break;
            }
            let start = position;
            let mut length = match i32_at(&bytes, position, end) {
                Ok(v) => v,
                Err(e) => {
                    diagnostics.push(diagnostic("ARROW_IPC_FRAMING", "", e, "error"));
                    break;
                }
            };
            let mut prefix = 4usize;
            if length == -1 {
                length = match i32_at(&bytes, position.saturating_add(4), end) {
                    Ok(v) => v,
                    Err(e) => {
                        diagnostics.push(diagnostic("ARROW_IPC_FRAMING", "", e, "error"));
                        break;
                    }
                };
                prefix = 8;
            }
            if length < 0 {
                diagnostics.push(diagnostic(
                    "ARROW_IPC_FRAMING",
                    "",
                    "Negative metadata length",
                    "error",
                ));
                break;
            }
            if length == 0 {
                eos = Some(start);
                position = match position.checked_add(prefix) {
                    Some(v) => v,
                    None => end,
                };
                break;
            }
            let length = length as usize;
            if bounded(position.saturating_add(prefix), length, end).is_err() {
                diagnostics.push(diagnostic(
                    "ARROW_IPC_FRAMING",
                    "",
                    "Truncated or out-of-bounds IPC segment",
                    "error",
                ));
                break;
            }
            if (prefix + length) % 8 != 0 {
                diagnostics.push(diagnostic(
                    "ARROW_IPC_FRAMING",
                    "",
                    "IPC metadata framing is not aligned to eight bytes",
                    "error",
                ));
                break;
            }
            let metadata_offset = position + prefix;
            let body_offset = metadata_offset + length;
            let report = match decoded_model(
                &bytes[metadata_offset..body_offset],
                &Utf16::from(format!("arrow-ipc/message/{}", frames.len())),
                "Message",
                ctx,
            ) {
                Ok(v) => v,
                Err(e)
                    if e.is_control_failure()
                        || matches!(e.code.as_str(), "LIMIT" | "RESOURCE_LIMIT" | "CAPACITY") =>
                {
                    return Err(e)
                }
                Err(e) => {
                    diagnostics.push(diagnostic(
                        "ARROW_IPC_FRAMING",
                        "",
                        &e.message
                            .to_utf8()
                            .unwrap_or_else(|_| "Cannot decode message metadata".into()),
                        "error",
                    ));
                    break;
                }
            };
            let Some(model) = field(&report, "model") else {
                let message = field(&report, "diagnostics")
                    .and_then(array)
                    .and_then(|d| d.last())
                    .and_then(|d| text(field(d, "message")))
                    .unwrap_or_else(|| "Cannot decode message metadata".into());
                diagnostics.push(diagnostic(
                    "ARROW_IPC_FRAMING",
                    "",
                    &format!("Cannot decode message metadata: {message}"),
                    "error",
                ));
                break;
            };
            let body = match body_length(model) {
                Ok(v) => v,
                Err(e) => {
                    diagnostics.push(diagnostic("ARROW_IPC_FRAMING", "", e, "error"));
                    break;
                }
            };
            if body % 8 != 0 || bounded(body_offset, body, end).is_err() {
                diagnostics.push(diagnostic(
                    "ARROW_IPC_FRAMING",
                    "",
                    if body % 8 != 0 {
                        "IPC body length is not aligned to eight bytes"
                    } else {
                        "Truncated or out-of-bounds IPC segment"
                    },
                    "error",
                ));
                break;
            }
            let kind = metadata_value(model)
                .and_then(|v| field(field(v, "header")?, "type"))
                .and_then(|v| text(Some(v)))
                .unwrap_or_else(|| "NONE".into());
            let frame = object(vec![
                ("offset", number(start)),
                ("prefixLength", number(prefix)),
                ("metadataOffset", number(metadata_offset)),
                ("metadataLength", number(length)),
                ("bodyOffset", number(body_offset)),
                ("bodyLength", number(body)),
                ("kind", string(&kind)),
                ("metadata", copy_json(model, ctx)?),
            ]);
            report_decode_diagnostics(
                &mut diagnostics,
                &report,
                &format!("/frames/{}", frames.len()),
                ctx,
            )?;
            frames.push(frame);
            position = body_offset + body;
        }
    }
    if frames.is_empty()
        || field(&frames[0], "kind")
            .and_then(|v| text(Some(v)))
            .as_deref()
            != Some("Schema")
    {
        if !diagnostics
            .iter()
            .any(|d| text(field(d, "severity")).as_deref() == Some("error"))
        {
            diagnostics.push(diagnostic(
                "ARROW_IPC_FRAMING",
                "",
                "IPC stream must begin with a schema message",
                "error",
            ));
        }
    }
    if format == "file"
        && eos.is_none()
        && !diagnostics
            .iter()
            .any(|d| text(field(d, "severity")).as_deref() == Some("error"))
    {
        diagnostics.push(diagnostic(
            "ARROW_IPC_FRAMING",
            "",
            "File embedded stream lacks EOS",
            "error",
        ));
    }
    if position != end {
        if position < end {
            diagnostics.push(diagnostic(
                "ARROW_IPC_TRAILING",
                "",
                &format!("{} bytes after EOS remain uninterpreted", end - position),
                "warning",
            ));
        }
    } else {
        accounted = true;
        if format == "file" {
            position = bytes.len();
        }
    }
    diagnostics.push(diagnostic("ARROW_IPC_SEMANTICS_UNVERIFIED", "", "Byte boundaries are separate from footer/block agreement, schema consistency, dictionary state, buffer layouts and data validity", "warning"));
    let mut result = vec![
        ("source", source),
        ("format", string(format)),
        ("complete", Value::Bool(false)),
        ("bytesAccountedFor", Value::Bool(accounted)),
        ("frames", Value::Array(frames)),
    ];
    if let Some(footer) = footer {
        result.push((
            "footer",
            object(vec![
                ("offset", number(end)),
                ("length", number(bytes.len() - 10 - end)),
                ("metadata", footer),
            ]),
        ));
    }
    if let Some(eos) = eos {
        result.push(("eosOffset", number(eos)));
    }
    result.extend([
        ("consumed", number(position)),
        (
            "trailingBytes",
            number(if accounted {
                0
            } else {
                end.saturating_sub(position)
            }),
        ),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    Ok(object(result))
}

fn unsigned(value: Option<&Value>) -> Option<u128> {
    match value? {
        Value::Number(n) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 => Some(*n as u128),
        Value::String(s) => s.to_utf8().ok()?.parse::<u128>().ok(),
        _ => None,
    }
}

/// Compare file footer declarations with the observed stream while preserving both source views.
pub fn inspect_arrow_ipc_consistency(
    document: &Value,
    resources: &ArrowIpcResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let layout = inspect_arrow_ipc_layout(document, resources, ctx)?;
    let mut diagnostics = Vec::new();
    let mut footer_checks = "unverified";
    let add =
        |diagnostics: &mut Vec<Value>, code: &str, path: &str, message: &str, severity: &str| {
            diagnostics.push(diagnostic(code, path, message, severity));
        };
    if text(field(&layout, "format")).as_deref() == Some("stream") {
        footer_checks = "not-applicable";
    } else {
        let layout_diags = field(&layout, "diagnostics").and_then(array).unwrap_or(&[]);
        let has_error = layout_diags
            .iter()
            .any(|d| text(field(d, "severity")).as_deref() == Some("error"));
        let accounted = field(&layout, "bytesAccountedFor") == Some(&Value::Bool(true));
        let footer = field(&layout, "footer").and_then(|f| field(f, "metadata"));
        if !accounted || footer.is_none() || has_error {
            add(
                &mut diagnostics,
                "ARROW_IPC_FOOTER_UNVERIFIED",
                "/footer",
                "Complete file boundaries are required for footer comparison",
                "warning",
            );
        } else if layout_diags
            .iter()
            .any(|d| text(field(d, "code")).as_deref() == Some("ARROW_FLATBUFFER_UNKNOWN_SLOT"))
        {
            add(
                &mut diagnostics,
                "ARROW_IPC_FOOTER_UNVERIFIED",
                "/footer",
                "Unknown metadata wire slots prevent complete footer comparison",
                "warning",
            );
        } else {
            let frames = field(&layout, "frames").and_then(array).unwrap_or(&[]);
            let Some(first) = frames.first().and_then(|frame| field(frame, "metadata")) else {
                add(
                    &mut diagnostics,
                    "ARROW_IPC_FOOTER_UNVERIFIED",
                    "/footer",
                    "Schema message is unavailable",
                    "warning",
                );
                let mut fields = vec![
                    ("layout", layout),
                    ("complete", Value::Bool(false)),
                    ("footerChecks", string("unverified")),
                    ("diagnostics", Value::Array(diagnostics)),
                ];
                return Ok(object(fields));
            };
            let footer_value = footer.and_then(metadata_value);
            let first_value = metadata_value(first);
            let footer_value = footer_value
                .ok_or_else(|| error("ARROW_IPC_FOOTER", "Footer metadata is unavailable"))?;
            let first_value = first_value.ok_or_else(|| {
                error("ARROW_IPC_FOOTER", "Schema message metadata is unavailable")
            })?;
            let version =
                |value: &Value| text(field(value, "version")).unwrap_or_else(|| "V1".into());
            if version(footer_value) != version(first_value) {
                add(
                    &mut diagnostics,
                    "ARROW_IPC_FOOTER_VERSION",
                    "/footer/version",
                    "Footer and schema-message metadata versions differ",
                    "error",
                );
            }
            let footer_schema = field(footer_value, "schema");
            let first_schema = field(
                field(first_value, "header").unwrap_or(&Value::Null),
                "value",
            );
            if let (Some(a), Some(b)) = (footer_schema, first_schema) {
                let inventory = serialization::read_json_value(
                    &INVENTORY.encode_utf16().collect::<Vec<_>>(),
                    Format::Json,
                    ctx,
                )?;
                let definitions = field(&inventory, "definitions")
                    .and_then(array)
                    .unwrap_or(&[]);
                let normalized_footer = normalized(a, "Schema", definitions, ctx, 0)?;
                let normalized_first = normalized(b, "Schema", definitions, ctx, 0)?;
                if !equivalent(&normalized_footer, &normalized_first, ctx, 0)? {
                    add(
                        &mut diagnostics,
                        "ARROW_IPC_FOOTER_SCHEMA",
                        "/footer/schema",
                        "Footer schema differs from the embedded-stream schema",
                        "error",
                    );
                }
            } else {
                add(
                    &mut diagnostics,
                    "ARROW_IPC_FOOTER_SCHEMA",
                    "/footer/schema",
                    "Footer schema is missing",
                    "error",
                );
            }
            let empty = Value::Array(Vec::new());
            let footer_metadata = field(footer_value, "custom_metadata").unwrap_or(&empty);
            let first_metadata = field(first_value, "custom_metadata").unwrap_or(&empty);
            if !equivalent(footer_metadata, first_metadata, ctx, 0)? {
                add(
                    &mut diagnostics,
                    "ARROW_IPC_FOOTER_METADATA",
                    "/footer/custom_metadata",
                    "Footer and initial message custom metadata differ",
                    "error",
                );
            }
            let frame_groups = [
                ("dictionaries", "DictionaryBatch"),
                ("recordBatches", "RecordBatch"),
            ];
            for (key_name, kind) in frame_groups {
                let mut frames_of_kind: Vec<&Value> = Vec::new();
                for (frame_index, frame) in frames.iter().enumerate() {
                    ctx.charge_work(1, Utf16::from(format!("/frames/{frame_index}/kind")))?;
                    if text(field(frame, "kind")).as_deref() == Some(kind) {
                        frames_of_kind.push(frame);
                    }
                }
                let blocks = field(footer_value, key_name).and_then(array).unwrap_or(&[]);
                if blocks.len() != frames_of_kind.len() {
                    add(
                        &mut diagnostics,
                        "ARROW_IPC_FOOTER_BLOCK_COUNT",
                        &format!("/footer/{key_name}"),
                        &format!("Footer block count differs from observed {kind} messages"),
                        "error",
                    );
                }
                let mut seen = Vec::new();
                for (index, block) in blocks.iter().enumerate() {
                    ctx.charge_work(1, Utf16::from(format!("/footer/{key_name}/{index}")))?;
                    let path = format!("/footer/{key_name}/{index}");
                    let Some(offset) = unsigned(field(block, "offset")) else {
                        add(
                            &mut diagnostics,
                            "ARROW_IPC_FOOTER_BLOCK_OFFSET",
                            &path,
                            "Block offset does not identify a message",
                            "error",
                        );
                        continue;
                    };
                    let mut found = None;
                    for frame in &frames_of_kind {
                        ctx.charge_work(
                            1,
                            Utf16::from(format!("/footer/{key_name}/{index}/offset")),
                        )?;
                        if unsigned(field(frame, "offset")) == Some(offset) {
                            found = Some(*frame);
                            break;
                        }
                    }
                    let Some(frame) = found else {
                        add(
                            &mut diagnostics,
                            "ARROW_IPC_FOOTER_BLOCK_OFFSET",
                            &path,
                            &format!("Block offset does not identify a {kind} message"),
                            "error",
                        );
                        continue;
                    };
                    let mut duplicate = false;
                    for prior in &seen {
                        ctx.charge_work(1, Utf16::from(format!("/footer/{key_name}/{index}")))?;
                        if *prior == offset {
                            duplicate = true;
                            break;
                        }
                    }
                    if duplicate {
                        add(
                            &mut diagnostics,
                            "ARROW_IPC_FOOTER_BLOCK_DUPLICATE",
                            &path,
                            "Footer repeats the same message offset",
                            "error",
                        );
                    }
                    seen.push(offset);
                    let metadata_length = unsigned(field(frame, "metadataLength"));
                    let prefix_length = unsigned(field(frame, "prefixLength"));
                    let expected_metadata_length =
                        metadata_length.zip(prefix_length).map(|(a, b)| a + b);
                    if unsigned(field(block, "metaDataLength")) != expected_metadata_length
                        || unsigned(field(block, "bodyLength"))
                            != unsigned(field(frame, "bodyLength"))
                    {
                        add(
                            &mut diagnostics,
                            "ARROW_IPC_FOOTER_BLOCK_LENGTH",
                            &path,
                            "Footer metadata/body lengths differ from observed message extents",
                            "error",
                        );
                    }
                    if frames_of_kind.get(index).copied() != Some(frame) {
                        add(&mut diagnostics, "ARROW_IPC_FOOTER_BLOCK_ORDER", &path, "Footer order differs from stream order; ordering agreement is a writer recommendation", "warning");
                    }
                }
            }
            footer_checks = if diagnostics.is_empty() {
                "matched"
            } else {
                "mismatch"
            };
        }
    }
    let fields = vec![
        ("layout", layout),
        ("complete", Value::Bool(false)),
        ("footerChecks", string(footer_checks)),
        ("diagnostics", Value::Array(diagnostics)),
    ];
    Ok(object(fields))
}

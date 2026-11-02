// SPDX-License-Identifier: MIT OR Apache-2.0
//! Tagged-wire API for the native OpenAPI core adapter.
use crate::{decode, encode, field, result_envelope};
use std::collections::BTreeSet;
use umf_core::{
    openapi_adapter::{self as openapi, OpenapiFormat, OpenapiResourceInput, OpenapiRuntime},
    Context, Diagnostic, EngineError, Severity, Utf16, Validation, Value,
};

pub const PROFILE: &str = "umf.openapi-wire/1";

fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn as_text<'a>(v: Option<&'a Value>, what: &str) -> Result<&'a Utf16, EngineError> {
    match v {
        Some(Value::String(s)) => Ok(s),
        _ => Err(request(what)),
    }
}
fn utf8(s: &Utf16, what: &str) -> Result<String, EngineError> {
    s.to_utf8().map_err(|_| request(what))
}
fn valid_utf16(s: &Utf16) -> bool {
    let mut units = s.units().iter().copied();
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
fn ascii_eq(s: &Utf16, expected: &str) -> bool {
    s.units().len() == expected.len() && s.units().iter().copied().eq(expected.encode_utf16())
}
fn allowed(op: &str) -> Option<&'static [&'static str]> {
    Some(match op {
        "openapi.import" => &[
            "profile",
            "op",
            "id",
            "source",
            "format",
            "baseUri",
            "resources",
        ],
        "openapi.validate" | "openapi.exportBundle" => &["profile", "op", "document"],
        "openapi.inspectPayload" => &["profile", "op", "payload"],
        "openapi.export" => &["profile", "op", "document", "format"],
        "openapi.getNode" => &["profile", "op", "document", "pointer", "resourceUri"],
        "openapi.lookupResource" => &["profile", "op", "document", "reference", "fromUri"],
        "openapi.extractSchema" => &["profile", "op", "document", "pointer", "resourceUri"],
        "openapi.indexSchemas" => &["profile", "op", "document", "schemaResources"],
        "openapi.resolveSchemaReference" => &[
            "profile",
            "op",
            "document",
            "pointer",
            "reference",
            "resourceUri",
            "schemaResources",
        ],
        "openapi.resolveDynamicReference" => &[
            "profile",
            "op",
            "document",
            "pointer",
            "resourceUri",
            "schemaResources",
            "evaluationScope",
        ],
        "openapi.resolveObjectReference" => &[
            "profile",
            "op",
            "document",
            "pointer",
            "kind",
            "resourceUri",
        ],
        "openapi.edit" => &[
            "profile",
            "op",
            "document",
            "pointer",
            "replacementJson",
            "resourceUri",
        ],
        _ => return None,
    })
}
fn members(value: &Value, allowed: &[&str], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(request("OpenAPI request must be an object"));
    };
    let mut seen = BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        let name = key
            .to_utf8()
            .map_err(|_| request("Request key must be valid UTF-16"))?;
        if !allowed.contains(&name.as_str()) || !seen.insert(name) {
            return Err(request(
                "OpenAPI request contains an unknown or duplicate member",
            ));
        }
    }
    Ok(())
}
fn format(
    value: Option<&Value>,
    default: Option<OpenapiFormat>,
) -> Result<OpenapiFormat, EngineError> {
    match value {
        None => default.ok_or_else(|| request("format must be json or yaml")),
        Some(Value::String(s)) if ascii_eq(s, "json") => Ok(OpenapiFormat::Json),
        Some(Value::String(s)) if ascii_eq(s, "yaml") => Ok(OpenapiFormat::Yaml),
        _ => Err(request("format must be json or yaml")),
    }
}
fn optional_text<'a>(v: Option<&'a Value>, what: &str) -> Result<Option<&'a Utf16>, EngineError> {
    match v {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s)),
        _ => Err(request(what)),
    }
}
fn text_array(
    v: Option<&Value>,
    what: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<Utf16>, EngineError> {
    let Some(v) = v else {
        return Ok(Vec::new());
    };
    let Value::Array(items) = v else {
        return Err(request(what));
    };
    ctx.charge_work(items.len(), Utf16::default())?;
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        let text = as_text(Some(item), what)?;
        if !valid_utf16(text) {
            return Err(request("OpenAPI URI inputs must be well-formed UTF-16"));
        }
        ctx.charge_text(text.len(), Utf16::default())?;
        out.push(text.clone());
    }
    Ok(out)
}
fn validation_value(v: Validation, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(v.diagnostics.len(), Utf16::default())?;
    let diagnostics = v.diagnostics.into_iter().map(diagnostic_value).collect();
    Ok(obj(vec![
        ("valid", Value::Bool(v.valid)),
        ("complete", Value::Bool(v.complete)),
        ("diagnostics", Value::Array(diagnostics)),
    ]))
}
fn diagnostic_value(d: Diagnostic) -> Value {
    obj(vec![
        ("code", Value::String(d.code)),
        ("path", Value::String(d.path)),
        ("message", Value::String(d.message)),
        (
            "severity",
            Value::string_utf8(if d.severity == Severity::Error {
                "error"
            } else {
                "warning"
            }),
        ),
    ])
}
fn obj(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn value_string_list(items: Vec<String>, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units = items.iter().fold(0usize, |total, item| {
        total.saturating_add(item.encode_utf16().count())
    });
    ctx.charge_work(items.len().saturating_add(units), Utf16::default())?;
    Ok(Value::Array(
        items.into_iter().map(Value::string_utf8).collect(),
    ))
}
fn location_value(v: openapi::OpenapiSchemaLocation) -> Value {
    obj(vec![
        ("retrievalUri", Value::String(v.retrieval_uri)),
        ("pointer", Value::String(v.pointer)),
        ("baseUri", Value::String(v.base_uri)),
        ("dialect", Value::String(v.dialect)),
    ])
}
fn execute(request_value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let op_text = as_text(field(request_value, "op"), "op must be a string")?;
    if !valid_utf16(op_text) || op_text.len() > 64 {
        return Err(request("Invalid OpenAPI operation"));
    }
    let op = [
        "openapi.import",
        "openapi.validate",
        "openapi.inspectPayload",
        "openapi.export",
        "openapi.exportBundle",
        "openapi.getNode",
        "openapi.lookupResource",
        "openapi.extractSchema",
        "openapi.indexSchemas",
        "openapi.resolveSchemaReference",
        "openapi.resolveDynamicReference",
        "openapi.resolveObjectReference",
        "openapi.edit",
    ]
    .into_iter()
    .find(|name| ascii_eq(op_text, name))
    .ok_or_else(|| request("Unknown OpenAPI operation"))?;
    let profile = as_text(field(request_value, "profile"), "profile must be a string")?;
    if !ascii_eq(profile, PROFILE) {
        return Err(request("umf.openapi-wire/1 profile is required"));
    }
    members(request_value, allowed(op).unwrap(), ctx)?;
    // Type-check and UTF-16 admission of all caller text before compiling the
    // large pinned schema registry. Decode/tagged transport is already bounded.
    let prepared = validate_operation_input(op, request_value, ctx)?;
    let runtime = OpenapiRuntime::new(ctx)?;
    let document =
        || field(request_value, "document").ok_or_else(|| request("document is required"));
    match op {
        "openapi.inspectPayload" => {
            let payload = field(request_value, "payload")
                .ok_or_else(|| request("payload is required"))?;
            let diagnostics = runtime.inspect_payload_with_context(payload, ctx)?;
            ctx.charge_work(diagnostics.len(), Utf16::default())?;
            let mut output = Vec::with_capacity(diagnostics.len());
            for diagnostic in diagnostics {
                ctx.charge_text(diagnostic.code.len(), Utf16::default())?;
                ctx.charge_text(diagnostic.path.len(), Utf16::default())?;
                ctx.charge_text(diagnostic.message.len(), Utf16::default())?;
                output.push(diagnostic_value(diagnostic));
            }
            Ok(Value::Array(output))
        }
        "openapi.import" => {
            let id = as_text(field(request_value, "id"), "id must be a string")?;
            let source = as_text(field(request_value, "source"), "source must be a string")?;
            let fmt = format(field(request_value, "format"), None)?;
            let base = optional_text(
                field(request_value, "baseUri"),
                "baseUri must be a string or null",
            )?;
            openapi::import_openapi_document(
                source,
                id,
                fmt,
                base,
                &prepared.resources,
                &runtime,
                ctx,
            )
        }
        "openapi.validate" => validation_value(
            openapi::inspect_openapi_document(document()?, &runtime, ctx)?,
            ctx,
        ),
        "openapi.export" => {
            let fmt = match field(request_value, "format") {
                None | Some(Value::Null) => None,
                value => Some(format(value, None)?),
            };
            Ok(Value::String(openapi::export_openapi_document(
                document()?,
                fmt,
                &runtime,
                ctx,
            )?))
        }
        "openapi.exportBundle" => {
            let bundle = openapi::export_openapi_bundle(document()?, &runtime, ctx)?;
            ctx.charge_work(bundle.resources.len(), Utf16::default())?;
            let resources = bundle
                .resources
                .into_iter()
                .map(|(uri, text, fmt)| {
                    obj(vec![
                        ("uri", Value::String(uri)),
                        ("text", Value::String(text)),
                        ("format", Value::string_utf8(format_text(fmt))),
                    ])
                })
                .collect();
            ctx.charge_work(bundle.diagnostics.len(), Utf16::default())?;
            let mut fields = vec![
                ("schema", Value::String(bundle.schema)),
                ("format", Value::string_utf8(format_text(bundle.format))),
            ];
            if let Some(base_uri) = bundle.base_uri {
                fields.push(("baseUri", Value::String(base_uri)));
            }
            fields.push(("resources", Value::Array(resources)));
            fields.push(("source", bundle.source));
            fields.push((
                "diagnostics",
                Value::Array(
                    bundle
                        .diagnostics
                        .into_iter()
                        .map(diagnostic_value)
                        .collect(),
                ),
            ));
            Ok(obj(fields))
        }
        "openapi.getNode" => {
            let pointer = as_text(field(request_value, "pointer"), "pointer must be a string")?;
            let uri = optional_text(
                field(request_value, "resourceUri"),
                "resourceUri must be a string or null",
            )?;
            Ok(
                openapi::get_openapi_node(document()?, pointer, uri, &runtime, ctx)?
                    .tagged_value_preserving_extras(ctx)?,
            )
        }
        "openapi.lookupResource" => {
            let reference = as_text(
                field(request_value, "reference"),
                "reference must be a string",
            )?;
            let from = optional_text(
                field(request_value, "fromUri"),
                "fromUri must be a string or null",
            )?;
            let found =
                openapi::lookup_openapi_resource(document()?, reference, from, &runtime, ctx)?;
            Ok(obj(vec![
                ("uri", Value::String(found.uri)),
                ("pointer", Value::String(found.pointer)),
                ("node", found.node.tagged_value_preserving_extras(ctx)?),
                ("interpretation", Value::string_utf8(found.interpretation)),
            ]))
        }
        "openapi.extractSchema" => {
            let pointer = as_text(field(request_value, "pointer"), "pointer must be a string")?;
            let uri = optional_text(
                field(request_value, "resourceUri"),
                "resourceUri must be a string or null",
            )?;
            let extracted =
                openapi::extract_openapi_schema(document()?, pointer, uri, &runtime, ctx)?;
            Ok(obj(vec![
                ("source", extracted.source),
                ("pointer", Value::String(extracted.pointer)),
                (
                    "retrievalUri",
                    extracted
                        .retrieval_uri
                        .map(Value::String)
                        .unwrap_or(Value::Null),
                ),
                ("openapiVersion", Value::String(extracted.openapi_version)),
                ("dialect", Value::String(extracted.dialect)),
                (
                    "dialectOrigin",
                    Value::string_utf8(extracted.dialect_origin),
                ),
                ("nativeSchema", Value::String(extracted.native_schema)),
                (
                    "schema",
                    extracted.schema.tagged_value_preserving_extras(ctx)?,
                ),
                ("complete", Value::Bool(extracted.complete)),
                (
                    "limitations",
                    value_string_list(extracted.limitations, ctx)?,
                ),
            ]))
        }
        "openapi.indexSchemas" => {
            let index = openapi::index_openapi_schemas(
                document()?,
                &prepared.schema_resources,
                &runtime,
                ctx,
            )?;
            let identifier_units = index.identifiers.keys().fold(0usize, |total, key| {
                total.saturating_add(key.encode_utf16().count())
            });
            ctx.charge_work(
                index
                    .locations
                    .len()
                    .saturating_add(index.identifiers.len())
                    .saturating_add(identifier_units),
                Utf16::default(),
            )?;
            let locations = index.locations.into_iter().map(location_value).collect();
            let identifiers = index
                .identifiers
                .into_iter()
                .map(|(key, identity)| {
                    (
                        Utf16::from(key),
                        obj(vec![
                            ("retrievalUri", Value::String(identity.retrieval_uri)),
                            ("pointer", Value::String(identity.pointer)),
                        ]),
                    )
                })
                .collect();
            Ok(obj(vec![
                ("locations", Value::Array(locations)),
                ("identifiers", Value::Object(identifiers)),
                ("complete", Value::Bool(index.complete)),
                ("limitations", value_string_list(index.limitations, ctx)?),
            ]))
        }
        "openapi.resolveSchemaReference" => {
            let pointer = as_text(field(request_value, "pointer"), "pointer must be a string")?;
            let reference = as_text(
                field(request_value, "reference"),
                "reference must be a string",
            )?;
            let uri = optional_text(
                field(request_value, "resourceUri"),
                "resourceUri must be a string or null",
            )?;
            let found = openapi::resolve_openapi_schema_reference(
                document()?,
                pointer,
                reference,
                uri,
                &prepared.schema_resources,
                &runtime,
                ctx,
            )?;
            Ok(obj(vec![
                ("source", location_value(found.source)),
                ("target", location_value(found.target)),
                ("node", found.node.tagged_value_preserving_extras(ctx)?),
                ("complete", Value::Bool(found.complete)),
                ("limitations", value_string_list(found.limitations, ctx)?),
            ]))
        }
        "openapi.resolveDynamicReference" => {
            let pointer = as_text(field(request_value, "pointer"), "pointer must be a string")?;
            let uri = optional_text(
                field(request_value, "resourceUri"),
                "resourceUri must be a string or null",
            )?;
            let found = openapi::resolve_openapi_dynamic_reference(
                document()?,
                pointer,
                uri,
                &prepared.schema_resources,
                &prepared.evaluation_scope,
                &runtime,
                ctx,
            )?;
            ctx.charge_work(found.evaluation_scope.len(), Utf16::default())?;
            Ok(obj(vec![
                ("source", location_value(found.source)),
                ("initialTarget", location_value(found.initial_target)),
                ("target", location_value(found.target)),
                ("node", found.node.tagged_value_preserving_extras(ctx)?),
                (
                    "evaluationScope",
                    Value::Array(
                        found
                            .evaluation_scope
                            .into_iter()
                            .map(Value::String)
                            .collect(),
                    ),
                ),
                ("resolution", Value::string_utf8(found.resolution)),
                ("complete", Value::Bool(found.complete)),
                ("limitations", value_string_list(found.limitations, ctx)?),
            ]))
        }
        "openapi.resolveObjectReference" => {
            let pointer = as_text(field(request_value, "pointer"), "pointer must be a string")?;
            let kind = as_text(field(request_value, "kind"), "kind must be a string")?;
            let uri = optional_text(
                field(request_value, "resourceUri"),
                "resourceUri must be a string or null",
            )?;
            openapi::resolve_openapi_object_reference(
                document()?,
                pointer,
                kind,
                uri,
                &runtime,
                ctx,
            )?
            .to_value(ctx)
        }
        "openapi.edit" => {
            let pointer = as_text(field(request_value, "pointer"), "pointer must be a string")?;
            let replacement = as_text(
                field(request_value, "replacementJson"),
                "replacementJson must be a string",
            )?;
            let uri = optional_text(
                field(request_value, "resourceUri"),
                "resourceUri must be a string or null",
            )?;
            let (candidate, validation) = openapi::propose_openapi_edit(
                document()?,
                pointer,
                replacement,
                uri,
                &runtime,
                ctx,
            )?;
            Ok(obj(vec![
                ("document", candidate),
                ("validation", validation_value(validation, ctx)?),
            ]))
        }
        _ => Err(request("Unknown OpenAPI operation")),
    }
}
fn format_text(f: OpenapiFormat) -> &'static str {
    match f {
        OpenapiFormat::Json => "json",
        OpenapiFormat::Yaml => "yaml",
    }
}
#[derive(Default)]
struct PreparedInputs {
    resources: Vec<OpenapiResourceInput>,
    schema_resources: Vec<Utf16>,
    evaluation_scope: Vec<Utf16>,
}
fn validate_operation_input(
    op: &str,
    req: &Value,
    ctx: &mut Context<'_>,
) -> Result<PreparedInputs, EngineError> {
    let mut prepared = PreparedInputs::default();
    const TEXT: &[&str] = &[
        "id",
        "source",
        "format",
        "baseUri",
        "pointer",
        "resourceUri",
        "reference",
        "fromUri",
        "kind",
        "replacementJson",
    ];
    for &name in TEXT {
        if let Some(value) = field(req, name) {
            let is_optional = matches!(name, "baseUri" | "resourceUri" | "fromUri")
                || (name == "format" && op == "openapi.export");
            match value {
                Value::String(s) => {
                    if matches!(
                        name,
                        "format" | "baseUri" | "resourceUri" | "reference" | "fromUri" | "kind"
                    ) && !valid_utf16(s)
                    {
                        return Err(request(
                            "OpenAPI identifiers and URIs must be well-formed UTF-16",
                        ));
                    }
                    ctx.charge_text(s.len(), Utf16::default())?;
                }
                Value::Null if is_optional => {}
                _ => return Err(request("OpenAPI text input has the wrong type")),
            }
        }
    }
    for name in ["document"] {
        if !matches!(op, "openapi.import" | "openapi.inspectPayload")
            && field(req, name).is_none()
        {
            return Err(request("document is required"));
        }
    }
    match op {
        "openapi.validate" | "openapi.exportBundle" => Ok(prepared),
        "openapi.inspectPayload" => {
            match field(req, "payload") {
                Some(Value::Object(_)) => {}
                Some(_) => return Err(request("payload must be an object")),
                None => return Err(request("payload is required")),
            }
            Ok(prepared)
        }
        "openapi.import" => {
            let _ = as_text(field(req, "id"), "id must be a string")?;
            let _ = as_text(field(req, "source"), "source must be a string")?;
            let _ = format(field(req, "format"), None)?;
            let _ = optional_text(field(req, "baseUri"), "baseUri must be a string or null")?;
            prepared.resources = parse_resources(field(req, "resources"), ctx)?;
            Ok(prepared)
        }
        "openapi.export" => {
            if let Some(value) = field(req, "format") {
                if !matches!(value, Value::Null) {
                    let _ = format(Some(value), None)?;
                }
            }
            Ok(prepared)
        }
        "openapi.getNode" | "openapi.extractSchema" => {
            let _ = as_text(field(req, "pointer"), "pointer must be a string")?;
            let _ = optional_text(
                field(req, "resourceUri"),
                "resourceUri must be a string or null",
            )?;
            Ok(prepared)
        }
        "openapi.lookupResource" => {
            let _ = as_text(field(req, "reference"), "reference must be a string")?;
            let _ = optional_text(field(req, "fromUri"), "fromUri must be a string or null")?;
            Ok(prepared)
        }
        "openapi.indexSchemas" => {
            prepared.schema_resources = text_array(
                field(req, "schemaResources"),
                "schemaResources must be a string array",
                ctx,
            )?;
            Ok(prepared)
        }
        "openapi.resolveSchemaReference" => {
            let _ = as_text(field(req, "pointer"), "pointer must be a string")?;
            let _ = as_text(field(req, "reference"), "reference must be a string")?;
            let _ = optional_text(
                field(req, "resourceUri"),
                "resourceUri must be a string or null",
            )?;
            prepared.schema_resources = text_array(
                field(req, "schemaResources"),
                "schemaResources must be a string array",
                ctx,
            )?;
            Ok(prepared)
        }
        "openapi.resolveDynamicReference" => {
            let _ = as_text(field(req, "pointer"), "pointer must be a string")?;
            let _ = optional_text(
                field(req, "resourceUri"),
                "resourceUri must be a string or null",
            )?;
            prepared.schema_resources = text_array(
                field(req, "schemaResources"),
                "schemaResources must be a string array",
                ctx,
            )?;
            prepared.evaluation_scope = text_array(
                field(req, "evaluationScope"),
                "evaluationScope must be a string array",
                ctx,
            )?;
            Ok(prepared)
        }
        "openapi.resolveObjectReference" => {
            let _ = as_text(field(req, "pointer"), "pointer must be a string")?;
            let _ = as_text(field(req, "kind"), "kind must be a string")?;
            let _ = optional_text(
                field(req, "resourceUri"),
                "resourceUri must be a string or null",
            )?;
            Ok(prepared)
        }
        "openapi.edit" => {
            let _ = as_text(field(req, "pointer"), "pointer must be a string")?;
            let _ = as_text(
                field(req, "replacementJson"),
                "replacementJson must be a string",
            )?;
            let _ = optional_text(
                field(req, "resourceUri"),
                "resourceUri must be a string or null",
            )?;
            Ok(prepared)
        }
        _ => Err(request("Unknown OpenAPI operation")),
    }
}
fn parse_resources(
    value: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Vec<OpenapiResourceInput>, EngineError> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    let Value::Array(items) = value else {
        return Err(request("resources must be an ordered array"));
    };
    ctx.charge_work(items.len(), Utf16::default())?;
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        let Value::Object(fields) = item else {
            return Err(request("resource entry must be an object"));
        };
        let mut seen = BTreeSet::new();
        for (key, _) in fields {
            ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
            let name = utf8(key, "resource keys must be valid UTF-16")?;
            if !["uri", "text", "format"].contains(&name.as_str()) || !seen.insert(name) {
                return Err(request("resource entry has unknown or duplicate members"));
            }
        }
        let uri = as_text(field(item, "uri"), "resource uri must be a string")?;
        let source = as_text(field(item, "text"), "resource text must be a string")?;
        let format_value = field(item, "format");
        let format = format(format_value, None)?;
        let format_text = as_text(format_value, "resource format must be a string")?;
        if !valid_utf16(uri) {
            return Err(request("resource URI must be well-formed UTF-16"));
        }
        ctx.charge_text(
            uri.len()
                .saturating_add(source.len())
                .saturating_add(format_text.len()),
            Utf16::default(),
        )?;
        out.push(OpenapiResourceInput {
            uri: uri.clone(),
            source: source.clone(),
            format,
        });
    }
    Ok(out)
}

pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request_value = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
        let result = execute(&request_value, &mut ctx)?;
        encode(&result, &mut ctx)
    })();
    result_envelope(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn value_text(value: &Value) -> Option<String> {
        match value {
            Value::String(text) => text.to_utf8().ok(),
            _ => None,
        }
    }
    fn wire_request(op: &str, extra: Vec<(&str, Value)>) -> Value {
        let mut fields = vec![
            (Utf16::from("profile"), Value::string_utf8(PROFILE)),
            (Utf16::from("op"), Value::string_utf8(op)),
        ];
        fields.extend(
            extra
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value)),
        );
        Value::Object(fields)
    }
    fn call(request: Value) -> Result<Value, String> {
        let mut ctx = Context::ordinary();
        let wire = encode(&request, &mut ctx).map_err(|e| format!("encode {}", e.code))?;
        let envelope = execute_wire(&wire);
        let outer: serde_json::Value =
            serde_json::from_str(&envelope).map_err(|e| e.to_string())?;
        if outer["status"] != "ok" {
            return Err(format!("{}: {}", outer["code"], outer["message"]));
        }
        let response = outer["wire"].as_str().ok_or("missing wire")?;
        let mut ctx = Context::ordinary();
        ctx.with_tagged_transport_limit(|ctx| decode(response, ctx))
            .map_err(|e| format!("decode {}", e.code))
    }
    fn field_value<'a>(value: &'a Value, key: &str) -> &'a Value {
        field(value, key).unwrap_or_else(|| panic!("missing {key}"))
    }
    fn extension_payload(document: &Value) -> Value {
        let module = match field_value(document, "modules") {
            Value::Array(items) => items.first().expect("module"),
            _ => panic!("modules"),
        };
        let element = match field_value(module, "elements") {
            Value::Array(items) => items.first().expect("element"),
            _ => panic!("elements"),
        };
        field_value(field_value(element, "extensions"), "umf.openapi").clone()
    }
    fn sample_document() -> String {
        r##"{"openapi":"3.1.0","info":{"title":"Wire","version":"1"},"paths":{},"components":{"schemas":{"Pet":{"$id":"https://example.test/pet","$defs":{"Name":{"type":"string"}},"type":"object","properties":{"name":{"$ref":"#/$defs/Name"}}},"DynamicRoot":{"$id":"https://example.test/dynamic","$dynamicAnchor":"node","type":"object","properties":{"child":{"$dynamicRef":"#node"}}}},"parameters":{"Target":{"name":"limit","in":"query","schema":{"type":"string"}},"Alias":{"$ref":"#/components/parameters/Target"}}}}"##.to_owned()
    }

    #[test]
    fn openapi_wire_roundtrip_bundle_get_extract_index_reference_and_edit() {
        let resource = r#"{"description":"supplied only; no fetch"}"#;
        let imported = call(wire_request(
            "openapi.import",
            vec![
                ("id", Value::string_utf8("orders")),
                ("source", Value::string_utf8(sample_document())),
                ("format", Value::string_utf8("json")),
                (
                    "baseUri",
                    Value::string_utf8("https://example.test/openapi.json"),
                ),
                (
                    "resources",
                    Value::Array(vec![obj(vec![
                        ("uri", Value::string_utf8("https://example.test/extra.json")),
                        ("text", Value::string_utf8(resource)),
                        ("format", Value::string_utf8("json")),
                    ])]),
                ),
            ],
        ))
        .unwrap();
        let validated = call(wire_request(
            "openapi.validate",
            vec![("document", imported.clone())],
        ))
        .unwrap();
        assert_eq!(field_value(&validated, "valid"), &Value::Bool(true));
        assert_eq!(field_value(&validated, "complete"), &Value::Bool(false));

        let plain_import = call(wire_request(
            "openapi.import",
            vec![
                ("id", Value::string_utf8("plain")),
                ("source", Value::string_utf8(sample_document())),
                ("format", Value::string_utf8("json")),
            ],
        ))
        .unwrap();
        let exported = call(wire_request(
            "openapi.export",
            vec![
                ("document", plain_import),
                ("format", Value::string_utf8("json")),
            ],
        ))
        .unwrap();
        assert_eq!(
            value_text(&exported).as_deref(),
            Some(sample_document().as_str())
        );

        let node = call(wire_request(
            "openapi.getNode",
            vec![
                ("document", imported.clone()),
                ("pointer", Value::string_utf8("/components/schemas/Pet")),
            ],
        ))
        .unwrap();
        assert!(matches!(node, Value::Object(_)));

        let bundle = call(wire_request(
            "openapi.exportBundle",
            vec![("document", imported.clone())],
        ))
        .unwrap();
        assert_eq!(
            value_text(field_value(&bundle, "baseUri")).as_deref(),
            Some("https://example.test/openapi.json")
        );
        let Value::Array(resources) = field_value(&bundle, "resources") else {
            panic!("resources array")
        };
        assert_eq!(
            value_text(field_value(&resources[0], "text")).as_deref(),
            Some(resource)
        );
        assert!(matches!(field_value(&bundle, "source"), Value::Object(_)));

        let looked_up = call(wire_request(
            "openapi.lookupResource",
            vec![
                ("document", imported.clone()),
                (
                    "reference",
                    Value::string_utf8("https://example.test/extra.json"),
                ),
                (
                    "fromUri",
                    Value::string_utf8("https://example.test/openapi.json"),
                ),
            ],
        ))
        .unwrap();
        assert_eq!(
            value_text(field_value(&looked_up, "interpretation")).as_deref(),
            Some("literal-document-pointer-only")
        );

        let extraction = call(wire_request(
            "openapi.extractSchema",
            vec![
                ("document", imported.clone()),
                ("pointer", Value::string_utf8("/components/schemas/Pet")),
            ],
        ))
        .unwrap();
        assert_eq!(
            value_text(field_value(&extraction, "dialectOrigin")).as_deref(),
            Some("openapi-default")
        );
        assert_eq!(field_value(&extraction, "complete"), &Value::Bool(false));

        let index = call(wire_request(
            "openapi.indexSchemas",
            vec![
                ("document", imported.clone()),
                ("schemaResources", Value::Array(vec![])),
            ],
        ))
        .unwrap();
        assert!(matches!(field_value(&index, "locations"), Value::Array(_)));
        let dynamic = call(wire_request(
            "openapi.resolveDynamicReference",
            vec![
                ("document", imported.clone()),
                (
                    "pointer",
                    Value::string_utf8("/components/schemas/DynamicRoot/properties/child"),
                ),
                ("schemaResources", Value::Array(vec![])),
                (
                    "evaluationScope",
                    Value::Array(vec![Value::string_utf8("https://example.test/dynamic")]),
                ),
            ],
        ))
        .unwrap();
        assert_eq!(
            value_text(field_value(&dynamic, "resolution")).as_deref(),
            Some("dynamic")
        );
        let resolved = call(wire_request(
            "openapi.resolveSchemaReference",
            vec![
                ("document", imported.clone()),
                (
                    "pointer",
                    Value::string_utf8("/components/schemas/Pet/properties/name"),
                ),
                ("reference", Value::string_utf8("#/$defs/Name")),
                ("schemaResources", Value::Array(vec![])),
            ],
        ))
        .unwrap();
        assert_eq!(field_value(&resolved, "complete"), &Value::Bool(false));
        let object_reference = call(wire_request(
            "openapi.resolveObjectReference",
            vec![
                ("document", imported.clone()),
                (
                    "pointer",
                    Value::string_utf8("/components/parameters/Alias"),
                ),
                ("kind", Value::string_utf8("parameter")),
            ],
        ))
        .unwrap();
        assert_eq!(
            value_text(field_value(&object_reference, "kind")).as_deref(),
            Some("parameter")
        );

        let edited = call(wire_request(
            "openapi.edit",
            vec![
                ("document", imported.clone()),
                ("pointer", Value::string_utf8("/info/title")),
                ("replacementJson", Value::string_utf8("\"Edited\"")),
            ],
        ))
        .unwrap();
        let candidate = field_value(&edited, "document");
        assert_eq!(
            value_text(field_value(candidate, "id")).as_deref(),
            Some("orders")
        );
        assert_eq!(field_value(&edited, "validation"), &validated);
        // Rejected candidates never replace or mutate the caller's document.
        assert!(call(wire_request(
            "openapi.edit",
            vec![
                ("document", imported.clone()),
                ("pointer", Value::string_utf8("/info/title")),
                ("replacementJson", Value::string_utf8("[]")),
            ],
        ))
        .is_err());
        let original_again = call(wire_request(
            "openapi.exportBundle",
            vec![("document", imported)],
        ))
        .unwrap();
        assert!(value_text(field_value(&original_again, "schema"))
            .unwrap()
            .contains("\"title\":\"Wire\""));
    }

    #[test]
    fn openapi_payload_inspector_accepts_a_current_imported_payload() {
        let document = call(wire_request(
            "openapi.import",
            vec![
                ("id", Value::string_utf8("inspect-payload")),
                ("source", Value::string_utf8(r#"{"openapi":"3.2.1","info":{"title":"API","version":"1"},"paths":{}}"#)),
                ("format", Value::string_utf8("json")),
            ],
        )).expect("valid document import");
        let diagnostics = call(wire_request(
            "openapi.inspectPayload",
            vec![("payload", extension_payload(&document))],
        )).expect("payload inspection");
        let Value::Array(diagnostics) = diagnostics else { panic!("diagnostic array") };
        assert!(diagnostics.iter().all(|diagnostic| {
            field_value(diagnostic, "severity") != &Value::string_utf8("error")
        }));
    }

    #[test]
    fn openapi_wire_rejects_unknown_members_and_preserves_control_errors() {
        let mut request = wire_request(
            "openapi.import",
            vec![
                ("id", Value::string_utf8("orders")),
                ("source", Value::string_utf8(sample_document())),
                ("format", Value::string_utf8("json")),
            ],
        );
        let Value::Object(fields) = &mut request else {
            unreachable!()
        };
        fields.push((Utf16::from("unexpected"), Value::Bool(true)));
        assert!(call(request).is_err());

        let mut ctx = Context::ordinary();
        let wire = encode(
            &wire_request(
                "openapi.import",
                vec![
                    ("id", Value::string_utf8("orders")),
                    ("source", Value::string_utf8(sample_document())),
                    ("format", Value::string_utf8("json")),
                ],
            ),
            &mut ctx,
        )
        .unwrap();
        let mut control = |_| {
            Err(EngineError::new(
                "TEST_CONTROL",
                Utf16::default(),
                "work denied by host",
            ))
        };
        let envelope = execute_wire_with_control(&wire, &mut control);
        let outer: serde_json::Value = serde_json::from_str(&envelope).unwrap();
        assert_eq!(outer["status"], "error");
        assert_eq!(outer["code"], "TEST_CONTROL");
    }
}

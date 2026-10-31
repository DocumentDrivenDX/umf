// SPDX-License-Identifier: MIT OR Apache-2.0
//! Tagged-wire adapter for LinkML source interchange (CONTRACT-024)
//! and ODCS source contracts (CONTRACT-023). No URI or network resolution.
use umf_core::{
    native_contract_adapters as contracts, Context, Diagnostic, EngineError, Severity, Utf16, Value,
};
use crate::{decode, encode, field, result_envelope};

pub const PROFILE: &str = "umf.native-contract-wire/1";

fn request_error(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn is_ascii(value: &Utf16, expected: &str) -> bool {
    value.units().len() == expected.len() && value.units().iter().copied().eq(expected.encode_utf16())
}
fn required_string<'a>(value: &'a Value, name: &str) -> Result<&'a Utf16, EngineError> {
    match field(value, name) {
        Some(Value::String(s)) => Ok(s),
        _ => Err(request_error(&format!("{name} must be a string"))),
    }
}
fn required_value<'a>(value: &'a Value, name: &str) -> Result<&'a Value, EngineError> {
    field(value, name).ok_or_else(|| request_error(&format!("{name} is required")))
}
fn optional_format(value: &Value) -> Result<Option<contracts::ContractFormat>, EngineError> {
    match field(value, "format") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) if is_ascii(s, "json") => Ok(Some(contracts::ContractFormat::Json)),
        Some(Value::String(s)) if is_ascii(s, "yaml") => Ok(Some(contracts::ContractFormat::Yaml)),
        Some(_) => Err(request_error("format must be json, yaml, or null")),
    }
}
fn required_format(value: &Value) -> Result<contracts::ContractFormat, EngineError> {
    optional_format(value)?.ok_or_else(|| request_error("format is required"))
}
fn allowed(op: &str) -> Option<&'static [&'static str]> {
    Some(match op {
        "linkml.import" => &["profile", "op", "source", "id", "format", "metamodelVersion"],
        "odcs.import" => &["profile", "op", "source", "id", "format"],
        "linkml.inspect" | "odcs.inspect" => &["profile", "op", "document"],
        "linkml.inspectPayload" | "odcs.inspectPayload" => &["profile", "op", "payload"],
        "linkml.export" | "odcs.export" => &["profile", "op", "document", "format"],
        "linkml.getNode" | "odcs.getNode" => &["profile", "op", "document", "pointer"],
        "linkml.editNode" | "odcs.editNode" => {
            &["profile", "op", "document", "pointer", "jsonText"]
        }
        "linkml.classSlots" => &["profile", "op", "document", "className"],
        "linkml.slotValues" => &["profile", "op", "document", "className", "slotName"],
        "odcs.relationships" => &["profile", "op", "document", "maxRelationships"],
        "linkml.importContext" => &["profile", "op", "input"],
        "linkml.importMerge" => &["profile", "op", "input", "mode"],
        "odcs.resolveReference" => &["profile", "op", "document", "reference", "usage"],
        "odcs.renameElement" => &["profile", "op", "document", "reference", "name"],
        _ => return None,
    })
}
fn validate_members(value: &Value, allowed: &[&str], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Object(fields) = value else { return Err(request_error("request must be an object")); };
    let mut seen = std::collections::BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        if !allowed.iter().any(|candidate| key == &Utf16::from(*candidate)) || !seen.insert(key) {
            return Err(request_error("request has an unknown or duplicate member"));
        }
    }
    Ok(())
}
fn validation_value(v: umf_core::Validation, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(v.diagnostics.len(), Utf16::default())?;
    ctx.charge_work(v.diagnostics.len().saturating_mul(4), Utf16::default())?;
    Ok(Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(v.valid)),
        (Utf16::from("complete"), Value::Bool(v.complete)),
        (Utf16::from("diagnostics"), Value::Array(v.diagnostics.into_iter().map(|d| Value::Object(vec![
            (Utf16::from("code"), Value::String(d.code)),
            (Utf16::from("path"), Value::String(d.path)),
            (Utf16::from("message"), Value::String(d.message)),
            (Utf16::from("severity"), Value::string_utf8(if d.severity == Severity::Error { "error" } else { "warning" })),
        ])).collect())),
    ]))
}
fn diagnostic_array(diagnostics: Vec<Diagnostic>, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(diagnostics.len(), Utf16::default())?;
    ctx.charge_work(diagnostics.len().saturating_mul(4), Utf16::default())?;
    Ok(Value::Array(diagnostics.into_iter().map(|d| Value::Object(vec![
        (Utf16::from("code"), Value::String(d.code)),
        (Utf16::from("path"), Value::String(d.path)),
        (Utf16::from("message"), Value::String(d.message)),
        (Utf16::from("severity"), Value::string_utf8(if d.severity == Severity::Error { "error" } else { "warning" })),
    ])).collect()))
}
fn validate_inputs(op: &str, request: &Value) -> Result<(), EngineError> {
    match op {
        "linkml.import" | "odcs.import" => {
            required_string(request, "source")?;
            required_string(request, "id")?;
            required_format(request)?;
            if op == "linkml.import" {
                if !matches!(field(request, "metamodelVersion"), None | Some(Value::Null | Value::String(_))) {
                    return Err(request_error("metamodelVersion must be a string or null"));
                }
            }
        }
        "linkml.inspect" | "odcs.inspect" => { required_value(request, "document")?; }
        "linkml.inspectPayload" | "odcs.inspectPayload" => { required_value(request, "payload")?; }
        "linkml.export" | "odcs.export" => { required_value(request, "document")?; optional_format(request)?; }
        "linkml.getNode" | "odcs.getNode" => { required_value(request, "document")?; required_string(request, "pointer")?; }
        "linkml.editNode" | "odcs.editNode" => {
            required_value(request, "document")?;
            required_string(request, "pointer")?;
            required_string(request, "jsonText")?;
        }
        "linkml.classSlots" => { required_value(request, "document")?; required_string(request, "className")?; }
        "linkml.slotValues" => {
            required_value(request, "document")?;
            required_string(request, "className")?;
            required_string(request, "slotName")?;
        }
        "linkml.importContext" => { required_value(request, "input")?; }
        "linkml.importMerge" => { required_value(request, "input")?; required_string(request, "mode")?; }
        "odcs.resolveReference" => {
            required_value(request, "document")?;
            required_string(request, "reference")?;
            required_string(request, "usage")?;
        }
        "odcs.relationships" => {
            required_value(request, "document")?;
            match field(request, "maxRelationships") {
                None | Some(Value::Null) => {}
                Some(Value::Number(n)) if n.is_finite() && n.fract() == 0.0 && *n >= 1.0 && *n <= 2048.0 => {}
                _ => return Err(request_error("maxRelationships must be an integer from 1 to 2048")),
            }
        }
        "odcs.renameElement" => {
            required_value(request, "document")?;
            required_string(request, "reference")?;
            required_string(request, "name")?;
        }
        _ => return Err(request_error("unknown operation")),
    }
    Ok(())
}

fn execute(request: &Value, ctx: &mut Context<'_>, family: Option<&str>) -> Result<Value, EngineError> {
    let profile = required_string(request, "profile")?;
    if !is_ascii(profile, PROFILE) { return Err(request_error("native-contract wire profile is required")); }
    let op = required_string(request, "op")?;
    let op_name = [
        "linkml.import", "odcs.import", "linkml.inspect", "odcs.inspect", "linkml.inspectPayload", "odcs.inspectPayload", "linkml.export", "odcs.export",
        "linkml.getNode", "odcs.getNode", "linkml.editNode", "odcs.editNode", "linkml.classSlots",
        "linkml.slotValues", "linkml.importContext", "linkml.importMerge", "odcs.resolveReference",
        "odcs.relationships", "odcs.renameElement",
    ].into_iter().find(|name| is_ascii(op, name)).ok_or_else(|| request_error("unknown operation"))?;
    if family.is_some_and(|expected| !op_name.starts_with(expected)) {
        return Err(request_error("operation is not available on this CLI route"));
    }
    validate_members(request, allowed(op_name).unwrap(), ctx)?;
    validate_inputs(op_name, request)?;

    // ContractRuntime constructs the pinned LinkML 1.11 / ODCS 3.0–3.2 schema
    // registries and the shared core Engine from embedded repository resources.
    // Caller-controlled LinkML import resources are passed only to importContext/importMerge.
    // No operation follows a URI or fetches a resource.
    let runtime = contracts::ContractRuntime::new(ctx)?;
    let result = match op_name {
        "linkml.import" => {
            let source = required_string(request, "source")?;
            let id = required_string(request, "id")?;
            let format = required_format(request)?;
            let mm = match field(request, "metamodelVersion") {
                None | Some(Value::Null) => None,
                Some(Value::String(s)) => Some(s),
                _ => return Err(request_error("metamodelVersion must be a string or null")),
            };
            contracts::import_linkml_document(source, id, format, mm, &runtime, ctx)?
        }
        "odcs.import" => contracts::import_odcs_document(
            required_string(request, "source")?, required_string(request, "id")?, required_format(request)?, &runtime, ctx,
        )?,
        "linkml.inspect" => validation_value(contracts::inspect_linkml_document(required_value(request, "document")?, &runtime, ctx)?, ctx)?,
        "odcs.inspect" => validation_value(contracts::inspect_odcs_document(required_value(request, "document")?, &runtime, ctx)?, ctx)?,
        "linkml.inspectPayload" => diagnostic_array(contracts::inspect_linkml_payload(required_value(request, "payload")?, &runtime, ctx)?, ctx)?,
        "odcs.inspectPayload" => diagnostic_array(contracts::inspect_odcs_payload(required_value(request, "payload")?, &runtime, ctx)?, ctx)?,
        "linkml.export" => Value::String(contracts::export_linkml_document(required_value(request, "document")?, optional_format(request)?, &runtime, ctx)?),
        "odcs.export" => Value::String(contracts::export_odcs_document(required_value(request, "document")?, optional_format(request)?, &runtime, ctx)?),
        "linkml.getNode" | "odcs.getNode" => {
            let document = required_value(request, "document")?;
            let pointer = required_string(request, "pointer")?;
            let tree = if op_name == "linkml.getNode" { contracts::get_linkml_document_node(document, pointer, &runtime, ctx)? } else { contracts::get_odcs_document_node(document, pointer, &runtime, ctx)? };
            tree.tagged_value_preserving_extras(ctx)?
        }
        "linkml.editNode" | "odcs.editNode" => {
            let document = required_value(request, "document")?;
            let pointer = required_string(request, "pointer")?;
            let json_text = required_string(request, "jsonText")?;
            let (candidate, validation) = if op_name == "linkml.editNode" { contracts::propose_linkml_document_node_edit(document, pointer, json_text, &runtime, ctx)? } else { contracts::propose_odcs_document_node_edit(document, pointer, json_text, &runtime, ctx)? };
            Value::Object(vec![(Utf16::from("document"), candidate), (Utf16::from("validation"), validation_value(validation, ctx)?)])
        }
        "linkml.classSlots" => contracts::inspect_linkml_class_slots(required_value(request, "document")?, required_string(request, "className")?, &runtime, ctx)?,
        "linkml.slotValues" => contracts::inspect_linkml_slot_values(required_value(request, "document")?, required_string(request, "className")?, required_string(request, "slotName")?, &runtime, ctx)?,
        "linkml.importContext" => contracts::inspect_linkml_import_context(required_value(request, "input")?, &runtime, ctx)?,
        "linkml.importMerge" => contracts::propose_linkml_import_merge(required_value(request, "input")?, required_string(request, "mode")?, &runtime, ctx)?,
        "odcs.resolveReference" => contracts::resolve_odcs_reference(required_value(request, "document")?, required_string(request, "reference")?, required_string(request, "usage")?, &runtime, ctx)?,
        "odcs.relationships" => {
            let max = match field(request, "maxRelationships") {
                None | Some(Value::Null) => None,
                Some(Value::Number(n)) if n.is_finite() && n.fract() == 0.0 && *n >= 1.0 && *n <= 2048.0 => Some(*n as usize),
                _ => return Err(request_error("maxRelationships must be an integer from 1 to 2048")),
            };
            contracts::inspect_odcs_relationships(required_value(request, "document")?, max, &runtime, ctx)?
        }
        "odcs.renameElement" => contracts::propose_odcs_element_rename(required_value(request, "document")?, required_string(request, "reference")?, required_string(request, "name")?, &runtime, ctx)?,
        _ => return Err(request_error("unknown operation")),
    };
    Ok(result)
}
pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}
pub fn execute_wire_with_control(wire: &str, control: &mut dyn FnMut(usize) -> Result<(), EngineError>) -> String {
    execute_family_wire_with_control(wire, None, control)
}
pub fn execute_linkml_wire(wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_linkml_wire_with_control(wire, &mut no_control)
}
pub fn execute_linkml_wire_with_control(wire: &str, control: &mut dyn FnMut(usize) -> Result<(), EngineError>) -> String {
    execute_family_wire_with_control(wire, Some("linkml."), control)
}
pub fn execute_odcs_wire(wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_odcs_wire_with_control(wire, &mut no_control)
}
pub fn execute_odcs_wire_with_control(wire: &str, control: &mut dyn FnMut(usize) -> Result<(), EngineError>) -> String {
    execute_family_wire_with_control(wire, Some("odcs."), control)
}
fn execute_family_wire_with_control(wire: &str, family: Option<&str>, control: &mut dyn FnMut(usize) -> Result<(), EngineError>) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
        let value = execute(&request, &mut ctx, family)?;
        encode(&value, &mut ctx)
    })();
    result_envelope(result)
}

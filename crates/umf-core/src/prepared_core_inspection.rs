// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned preparation for the callable Core inspection facade.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::{Diagnostic, EngineError, Severity, Validation},
    registry::Registry,
    value::{copy_json, Utf16, Value},
};

fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}

fn validation_value(validation: &Validation, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(validation.diagnostics.len(), Utf16::default())?;
    let mut diagnostics = Vec::with_capacity(validation.diagnostics.len());
    for Diagnostic {
        code,
        path,
        message,
        severity,
        ..
    } in &validation.diagnostics
    {
        ctx.charge_work(
            code.len()
                .saturating_add(path.len())
                .saturating_add(message.len())
                .saturating_add(32),
            Utf16::default(),
        )?;
        diagnostics.push(Value::Object(vec![
            (key("code"), Value::String(code.clone())),
            (key("path"), Value::String(path.clone())),
            (key("message"), Value::String(message.clone())),
            (
                key("severity"),
                Value::string_utf8(match severity {
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                }),
            ),
        ]));
    }
    Ok(Value::Object(vec![
        (key("valid"), Value::Bool(validation.valid)),
        (key("complete"), Value::Bool(validation.complete)),
        (key("diagnostics"), Value::Array(diagnostics)),
    ]))
}

fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(field, _)| field == &key(name))
        .map(|(_, value)| value)
}

fn text<'a>(value: &'a Value, name: &str) -> Option<&'a Utf16> {
    match get(value, name) {
        Some(Value::String(value)) => Some(value),
        _ => None,
    }
}

fn member_count(value: &Value) -> Option<usize> {
    match value {
        Value::Object(fields) => Some(fields.len()),
        _ => None,
    }
}

/// Return one prepared-inspection view. Identity admission and element lookup
/// remain Rust-owned; the existing inspectors own meaning and unknown paths.
pub fn view(
    source: &Value,
    identity: &Value,
    view: &Utf16,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let Some(count) = member_count(identity) else {
        return Err(EngineError::new(
            "CORE_INSPECTION_IDENTITY",
            Utf16::default(),
            "Expected exact module and element identity",
        ));
    };
    ctx.charge_work(count.saturating_add(2), Utf16::default())?;
    let Value::Object(fields) = identity else {
        unreachable!()
    };
    if count != 2
        || fields
            .iter()
            .any(|(name, _)| name != &key("module") && name != &key("element"))
    {
        return Err(EngineError::new(
            "CORE_INSPECTION_IDENTITY",
            Utf16::default(),
            "Expected exact module and element identity",
        ));
    }
    let (Some(module), Some(element)) = (text(identity, "module"), text(identity, "element"))
    else {
        return Err(EngineError::new(
            "CORE_INSPECTION_IDENTITY",
            Utf16::default(),
            "Expected exact module and element identity",
        ));
    };
    if module.is_empty() || element.is_empty() {
        return Err(EngineError::new(
            "CORE_INSPECTION_IDENTITY",
            Utf16::default(),
            "Expected exact module and element identity",
        ));
    }
    ctx.charge_work(module.len().saturating_add(element.len()), Utf16::default())?;
    // Prove the exact identity resolves before selecting a view, retaining the
    // public missing-identity error boundary independently of view semantics.
    let mut found = false;
    if let Some(Value::Array(modules)) = get(source, "modules") {
        for current_module in modules {
            ctx.charge_work(module.len().saturating_add(1), Utf16::default())?;
            if text(current_module, "id") != Some(module) {
                continue;
            }
            if let Some(Value::Array(elements)) = get(current_module, "elements") {
                for current_element in elements {
                    ctx.charge_work(element.len().saturating_add(1), Utf16::default())?;
                    if text(current_element, "id") == Some(element) {
                        found = true;
                        break;
                    }
                }
            }
            break;
        }
    }
    if !found {
        return Err(EngineError::new(
            "CORE_INSPECTION_MISSING",
            Utf16::default(),
            "Element identity does not resolve",
        ));
    }
    let inspected = if view == &key("keys") {
        crate::core_keys::inspect_core_keys(source, identity, engine, registry, capabilities, ctx)?
    } else if view == &key("facets") {
        crate::facets::inspect_core_facets(source, identity, engine, registry, capabilities, ctx)?
    } else if view == &key("schemaProperties") {
        let scoped_identity = Value::Object(vec![
            (key("scope"), Value::string_utf8("element")),
            (key("module"), Value::String(module.clone())),
            (key("element"), Value::String(element.clone())),
        ]);
        crate::schema_properties::inspect_core_schema_properties(
            source,
            &scoped_identity,
            engine,
            ctx,
        )?
    } else {
        return Err(EngineError::new(
            "REQUEST",
            Utf16::default(),
            "Unknown Core inspection view",
        ));
    };
    let field_name = if view == &key("schemaProperties") {
        "properties"
    } else {
        "meaning"
    };
    get(&inspected, field_name)
        .map(|value| copy_json(value, ctx))
        .unwrap_or_else(|| {
            Err(EngineError::new(
                "CORE_INSPECTION_RESULT",
                Utf16::default(),
                "Inspector omitted its selected view",
            ))
        })
}

/// Match `prepareCoreInspection`: snapshot the source, validate with an empty
/// Registry, then require the current core envelope before publishing it.
pub fn prepare(
    input: &Value,
    engine: &Engine,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(input, ctx)?;
    let validation = engine.validate_document(&source, &Registry::default(), capabilities, ctx)?;
    let current = get(&source, "umf") == Some(&Value::string_utf8("0.10.0"));
    if !current || !validation.valid {
        return Err(EngineError::new(
            "CORE_INSPECTION_SOURCE",
            Utf16::default(),
            "Expected valid current core 0.10.0 source",
        ));
    }
    Ok(Value::Object(vec![
        (key("source"), source),
        (key("validation"), validation_value(&validation, ctx)?),
    ]))
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded atomic extension editing over a validated document snapshot.
use crate::{
    context::{Context, ResourceProfile},
    engine::{Capabilities, Engine},
    error::{EngineError, Severity, Validation},
    registry::Registry,
    serialization::stringify_compact_metered,
    value::{copy_json, Utf16, Value},
};

fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn get_metered<'a>(
    value: &'a Value,
    name: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let wanted = key(name);
    let Value::Object(fields) = value else {
        return Ok(None);
    };
    for (field, child) in fields {
        ctx.charge_work(
            field.len().saturating_add(wanted.len()).max(1),
            Utf16::default(),
        )?;
        if field == &wanted {
            return Ok(Some(child));
        }
    }
    Ok(None)
}
fn get_mut_metered<'a>(
    value: &'a mut Value,
    name: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a mut Value>, EngineError> {
    let wanted = key(name);
    let Value::Object(fields) = value else {
        return Ok(None);
    };
    for (field, child) in fields {
        ctx.charge_work(
            field.len().saturating_add(wanted.len()).max(1),
            Utf16::default(),
        )?;
        if field == &wanted {
            return Ok(Some(child));
        }
    }
    Ok(None)
}
fn validation_value(validation: &Validation, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    // Admit count-proportional slot allocation before reserving the vector.
    ctx.charge_work(validation.diagnostics.len(), Utf16::default())?;
    let mut diagnostic_values = Vec::with_capacity(validation.diagnostics.len());
    for d in &validation.diagnostics {
        // Admit the three arbitrary UTF-16 strings plus diagnostic field names,
        // severity text and container slots before making any owned copies.
        let copy_cost = d
            .code
            .len()
            .saturating_add(d.path.len())
            .saturating_add(d.message.len())
            .saturating_add(64);
        ctx.charge_work(copy_cost.max(1), Utf16::default())?;
        diagnostic_values.push(Value::Object(vec![
            (key("code"), Value::String(d.code.clone())),
            (key("path"), Value::String(d.path.clone())),
            (key("message"), Value::String(d.message.clone())),
            (
                key("severity"),
                Value::string_utf8(match d.severity {
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                }),
            ),
        ]));
    }
    Ok(Value::Object(vec![
        (key("valid"), Value::Bool(validation.valid)),
        (key("complete"), Value::Bool(validation.complete)),
        (key("diagnostics"), Value::Array(diagnostic_values)),
    ]))
}
fn validation_error(
    code: &str,
    validation: &Validation,
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    if code == "UNSAFE_EDIT" {
        return Ok(EngineError::new(
            code,
            Utf16::default(),
            "All present semantics must be validated before editing",
        ));
    }
    let result = validation_value(validation, ctx)?;
    let diagnostics = get(&result, "diagnostics").expect("constructed diagnostics");
    Ok(EngineError::new(
        code,
        Utf16::default(),
        stringify_compact_metered(diagnostics, ctx)?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::Diagnostic;

    #[test]
    fn long_validation_diagnostic_precharges_before_projection() {
        let validation = Validation {
            valid: false,
            complete: false,
            diagnostics: vec![Diagnostic {
                code: Utf16::from("CALLBACK"),
                path: Utf16::default(),
                message: Utf16::from("m".repeat(65_537)),
                severity: Severity::Error,
                python_source_path: false,
                python_text_origin: None,
            }],
        };
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            if observed.len() == 1 {
                Ok(())
            } else {
                Err(EngineError::new(
                    "METER_REFUSED",
                    Utf16::default(),
                    "stop before diagnostic projection",
                ))
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = validation_value(&validation, &mut ctx).unwrap_err();
        assert_eq!(error.code, "METER_REFUSED");
        drop(ctx);
        assert_eq!(observed, vec![1, 65_537 + "CALLBACK".len() + 64]);
    }

    #[test]
    fn many_diagnostic_slots_are_precharged_before_reserve() {
        let diagnostic = Diagnostic {
            code: Utf16::from("CALLBACK"),
            path: Utf16::default(),
            message: Utf16::from("denied"),
            severity: Severity::Error,
            python_source_path: false,
            python_text_origin: None,
        };
        let count = 50_000;
        let validation = Validation {
            valid: false,
            complete: false,
            diagnostics: vec![diagnostic; count],
        };
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            Err(EngineError::new(
                "METER_REFUSED",
                Utf16::default(),
                "stop before diagnostic reserve",
            ))
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = validation_value(&validation, &mut ctx).unwrap_err();
        assert_eq!(error.code, "METER_REFUSED");
        drop(ctx);
        assert_eq!(observed, vec![count]);
    }
}

/// Validate the full input, copy it, invoke the trusted updater on an isolated
/// payload snapshot, then validate the full candidate against the same engine
/// and immutable registry. The input and registry are never mutated.
pub fn edit_extension<F>(
    input: &Value,
    registry: &Registry,
    module_id: &Utf16,
    element_id: &Utf16,
    extension_id: &Utf16,
    engine: &Engine,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    update: F,
) -> Result<Value, EngineError>
where
    F: FnOnce(Value) -> Result<Value, EngineError>,
{
    if ctx.profile() == ResourceProfile::HardIsolated {
        return Err(EngineError::new(
            "RESOURCE_PROFILE_UNAVAILABLE",
            Utf16::default(),
            "HardIsolated resource profile is unavailable",
        ));
    }
    let initial = engine.validate_document(input, registry, capabilities, ctx)?;
    if !initial.valid || !initial.complete {
        return Err(validation_error("UNSAFE_EDIT", &initial, ctx)?);
    }
    let mut candidate = copy_json(input, ctx)?;
    let modules = match get_metered(&candidate, "modules", ctx)? {
        Some(Value::Array(modules)) => modules,
        _ => {
            return Err(EngineError::new(
                "MISSING_ELEMENT",
                Utf16::default(),
                "Extension instance not found",
            ))
        }
    };
    let mut target_index = None;
    for (module_index, module) in modules.iter().enumerate() {
        ctx.charge_work(module_id.len().saturating_add(1), Utf16::default())?;
        if get_metered(module, "id", ctx)? != Some(&Value::String(module_id.clone())) {
            continue;
        }
        let Some(Value::Array(elements)) = get_metered(module, "elements", ctx)? else {
            continue;
        };
        for (element_index, element) in elements.iter().enumerate() {
            ctx.charge_work(element_id.len().saturating_add(1), Utf16::default())?;
            if get_metered(element, "id", ctx)? == Some(&Value::String(element_id.clone())) {
                target_index = Some((module_index, element_index));
                break;
            }
        }
        break;
    }
    let Some((module_index, element_index)) = target_index else {
        return Err(EngineError::new(
            "MISSING_ELEMENT",
            Utf16::default(),
            "Extension instance not found",
        ));
    };
    let element = match get_metered(&modules[module_index], "elements", ctx)? {
        Some(Value::Array(elements)) => &elements[element_index],
        _ => unreachable!("validated elements"),
    };
    let extensions = get_metered(element, "extensions", ctx)?.expect("validated extensions");
    let mut payload = None;
    if let Value::Object(fields) = extensions {
        for (field, value) in fields {
            ctx.charge_work(
                field.len().saturating_add(extension_id.len()).max(1),
                Utf16::default(),
            )?;
            if field == extension_id {
                payload = Some(value);
                break;
            }
        }
    }
    let payload = payload.ok_or_else(|| {
        EngineError::new(
            "MISSING_ELEMENT",
            Utf16::default(),
            "Extension instance not found",
        )
    })?;
    let isolated_payload = copy_json(payload, ctx)?;
    let updated_payload = update(isolated_payload)?;
    let Some((module_index, element_index)) = target_index else {
        return Err(EngineError::new(
            "MISSING_ELEMENT",
            Utf16::default(),
            "Extension instance not found",
        ));
    };
    let modules = match get_mut_metered(&mut candidate, "modules", ctx)?.expect("validated modules")
    {
        Value::Array(values) => values,
        _ => unreachable!("validated modules array"),
    };
    let elements = match &mut modules[module_index] {
        module => match get_mut_metered(module, "elements", ctx)?.expect("validated elements") {
            Value::Array(values) => values,
            _ => unreachable!("validated elements array"),
        },
    };
    let extensions = match get_mut_metered(&mut elements[element_index], "extensions", ctx)?
        .expect("validated extensions")
    {
        Value::Object(fields) => fields,
        _ => unreachable!("validated extensions object"),
    };
    let mut found = false;
    for (field, value) in extensions {
        ctx.charge_work(
            field.len().saturating_add(extension_id.len()).max(1),
            Utf16::default(),
        )?;
        if field == extension_id {
            *value = copy_json(&updated_payload, ctx)?;
            found = true;
            break;
        }
    }
    if !found {
        unreachable!("extension key validated in source")
    }
    let checked = engine.validate_document(&candidate, registry, capabilities, ctx)?;
    if !checked.valid || !checked.complete {
        return Err(validation_error("INVALID_EDIT", &checked, ctx)?);
    }
    Ok(candidate)
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Explicit current-core authoring for one singular 128-bit Field domain.
//!
//! The result is the copied Document itself. This operation neither converts
//! stored values nor creates an authoring receipt.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::{EngineError, Severity},
    registry::Registry,
    value::{copy_json, Utf16, Value},
};

fn k(value: &str) -> Utf16 {
    Utf16::from(value)
}

fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn field_error(message: impl Into<String>) -> EngineError {
    EngineError::new("BIT128_FIELD", Utf16::default(), message.into())
}

fn text(value: Option<&Value>) -> Option<Utf16> {
    match value {
        Some(Value::String(value)) => Some(value.clone()),
        _ => None,
    }
}

fn diagnostics_value(diagnostics: Vec<crate::error::Diagnostic>) -> Value {
    Value::Array(
        diagnostics
            .into_iter()
            .map(|diagnostic| {
                Value::Object(vec![
                    (k("code"), Value::String(diagnostic.code)),
                    (k("path"), Value::String(diagnostic.path)),
                    (k("message"), Value::String(diagnostic.message)),
                    (
                        k("severity"),
                        Value::string_utf8(match diagnostic.severity {
                            Severity::Error => "error",
                            Severity::Warning => "warning",
                        }),
                    ),
                ])
            })
            .collect(),
    )
}

fn exact_identity(identity: &Value) -> Option<(Utf16, Utf16)> {
    let Value::Object(fields) = identity else {
        return None;
    };
    if fields.len() != 2
        || fields
            .iter()
            .any(|(key, _)| key != &k("module") && key != &k("element"))
    {
        return None;
    }
    Some((
        text(get(identity, "module"))?,
        text(get(identity, "element"))?,
    ))
}

fn locate_field(source: &Value, module: &Utf16, element: &Utf16) -> Option<(usize, usize)> {
    let Value::Array(modules) = get(source, "modules")? else {
        return None;
    };
    for (module_index, item) in modules.iter().enumerate() {
        if text(get(item, "id")).as_ref() != Some(module) {
            continue;
        }
        let Value::Array(elements) = get(item, "elements")? else {
            return None;
        };
        if let Some((element_index, _)) = elements
            .iter()
            .enumerate()
            .find(|(_, item)| text(get(item, "id")).as_ref() == Some(element))
        {
            return Some((module_index, element_index));
        }
        return None;
    }
    None
}

fn set_scalar_type(
    document: &mut Value,
    module_index: usize,
    element_index: usize,
    scalar_type: &Utf16,
) -> bool {
    let Value::Object(document_fields) = document else {
        return false;
    };
    let Some((_, Value::Array(modules))) = document_fields
        .iter_mut()
        .find(|(key, _)| key == &k("modules"))
    else {
        return false;
    };
    let Some(elements) = modules
        .get_mut(module_index)
        .and_then(|module| match module {
            Value::Object(fields) => fields
                .iter_mut()
                .find(|(key, _)| key == &k("elements"))
                .and_then(|(_, value)| match value {
                    Value::Array(elements) => Some(elements),
                    _ => None,
                }),
            _ => None,
        })
    else {
        return false;
    };
    let Some(Value::Object(fields)) = elements.get_mut(element_index) else {
        return false;
    };
    if let Some((_, value)) = fields.iter_mut().find(|(key, _)| key == &k("scalarType")) {
        *value = Value::String(scalar_type.clone());
    } else {
        fields.push((k("scalarType"), Value::String(scalar_type.clone())));
    }
    true
}

/// Declare a bits128 or UUID domain on an existing singular Field in a valid
/// current core 0.10.0 document. The input and identity are copied before
/// semantic checks, and only the copied Field's `scalarType` is changed.
pub fn declare_core_bit128_field(
    input: &Value,
    identity_input: &Value,
    scalar_type_input: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut source = copy_json(input, ctx)?;
    let identity = copy_json(identity_input, ctx)?;

    if text(get(&source, "umf")).as_ref() != Some(&k("0.10.0"))
        || !engine
            .validate_document(&source, registry, capabilities, ctx)?
            .valid
    {
        return Err(field_error("Valid current core 0.10.0 source required"));
    }

    let (module, element) =
        exact_identity(&identity).ok_or_else(|| field_error("Exact Field identity required"))?;
    let scalar_type = match scalar_type_input {
        Value::String(value) if value == &k("bits128") || value == &k("uuid") => value.clone(),
        _ => return Err(field_error("Explicit128-bit domain required")),
    };

    let Some((module_index, element_index)) = locate_field(&source, &module, &element) else {
        return Err(field_error(
            "Singular Field required; container values use itemType",
        ));
    };
    let selected = get(&source, "modules")
        .and_then(|value| match value {
            Value::Array(modules) => modules.get(module_index),
            _ => None,
        })
        .and_then(|value| get(value, "elements"))
        .and_then(|value| match value {
            Value::Array(elements) => elements.get(element_index),
            _ => None,
        })
        .expect("located element is present");
    if text(get(selected, "kind")).as_ref() != Some(&k("field"))
        || text(get(selected, "cardinality")).as_ref() != Some(&k("one"))
    {
        return Err(field_error(
            "Singular Field required; container values use itemType",
        ));
    }
    if let Some(existing) = get(selected, "scalarType") {
        let source_version = text(get(&source, "umf")).unwrap_or_default();
        let known = crate::scalar_type_inspection::scalar_types_for_version(&source_version);
        if !matches!(existing, Value::String(value) if known.contains(value)) {
            return Err(field_error("Unknown scalar meaning cannot be overwritten"));
        }
    }

    if !set_scalar_type(&mut source, module_index, element_index, &scalar_type) {
        return Err(field_error("Selected Field is absent"));
    }
    let checked = engine.validate_document(&source, registry, capabilities, ctx)?;
    let selected_path = format!("/modules/{module_index}/elements/{element_index}");
    let warning_prefix = format!("{selected_path}/")
        .encode_utf16()
        .collect::<Vec<_>>();
    let extension_prefix = format!("{selected_path}/extensions/")
        .encode_utf16()
        .collect::<Vec<_>>();
    if checked.diagnostics.iter().any(|diagnostic| {
        diagnostic.severity == Severity::Warning
            && diagnostic.path.units().starts_with(&warning_prefix)
            && !diagnostic.path.units().starts_with(&extension_prefix)
    }) {
        return Err(field_error(
            "Unknown selected Field meaning blocks authoring",
        ));
    }
    if !checked.valid {
        let diagnostics = diagnostics_value(checked.diagnostics);
        let message = crate::serialization::stringify_compact_metered(&diagnostics, ctx)?;
        return Err(field_error(message.to_utf8().unwrap_or_default()));
    }
    Ok(source)
}

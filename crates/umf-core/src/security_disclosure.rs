// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned shape, ontology, and Field-domain checks for Security disclosure 0.1.
//! Transport dispositions describe data only; they do not authorize the rows.
use crate::{
    context::Context,
    engine::Engine,
    error::EngineError,
    serialization::Format,
    value::{copy_json, Utf16, Value},
};

#[derive(Clone, Eq, PartialEq, Ord, PartialOrd)]
struct RefKey(Utf16, Utf16, Utf16);

fn member<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}
fn array(value: Option<&Value>) -> &[Value] {
    match value {
        Some(Value::Array(values)) => values,
        _ => &[],
    }
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(value)) => Some(value),
        _ => None,
    }
}
fn exact_members(value: &Value, names: &[&str]) -> bool {
    let Value::Object(fields) = value else {
        return false;
    };
    fields.len() == names.len()
        && names
            .iter()
            .all(|name| fields.iter().any(|(key, _)| key == &Utf16::from(*name)))
}
fn ref_key(value: &Value) -> Option<RefKey> {
    if !exact_members(value, &["documentId", "moduleId", "elementId"]) {
        return None;
    }
    let fields =
        ["documentId", "moduleId", "elementId"].map(|name| text(member(value, name)).cloned());
    let [Some(document), Some(module), Some(element)] = fields else {
        return None;
    };
    if [&document, &module, &element]
        .iter()
        .any(|part| part.is_empty() || part.len() > 4096)
    {
        return None;
    }
    Some(RefKey(document, module, element))
}
fn same_ref(a: &Value, b: &Value) -> bool {
    ref_key(a).is_some() && ref_key(a) == ref_key(b)
}
fn ref_units(value: &RefKey) -> usize {
    value
        .0
        .len()
        .saturating_add(value.1.len())
        .saturating_add(value.2.len())
}
fn invalid() -> EngineError {
    EngineError::new(
        "SECURITY_DISCLOSURE",
        Utf16::default(),
        "Invalid or unsupported disclosure transport",
    )
}
fn generic<T>(result: Result<T, EngineError>) -> Result<T, EngineError> {
    result.map_err(|error| {
        if error.is_control_failure() {
            error
        } else {
            invalid()
        }
    })
}
fn field<'a>(reference: &Value, resolution: &'a Value) -> Option<(&'a Value, &'a Value)> {
    let RefKey(document_id, module_id, element_id) = ref_key(reference)?;
    for entry in array(member(resolution, "documents")) {
        let document = member(entry, "document")?;
        if text(member(document, "id")) != Some(&document_id) {
            continue;
        }
        for module in array(member(document, "modules")) {
            if text(member(module, "id")) != Some(&module_id) {
                continue;
            }
            for element in array(member(module, "elements")) {
                if text(member(element, "id")) == Some(&element_id)
                    && text(member(element, "kind")).is_some_and(|v| v == &Utf16::from("field"))
                {
                    return Some((document, element));
                }
            }
        }
    }
    None
}
fn is_disclosure_target(reference: &Value, resolution: &Value) -> bool {
    let ontology = member(resolution, "ontology").unwrap_or(&Value::Null);
    array(member(ontology, "entities"))
        .iter()
        .chain(array(member(ontology, "associations")))
        .any(|target| member(target, "type").is_some_and(|ty| same_ref(ty, reference)))
}

pub fn validate_security_disclosure(
    input: &Value,
    policy: &Value,
    resolution: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let interpreted = generic(crate::security_policy::require_security_interpretation(
        policy, resolution, ctx,
    ))?;
    let resolution = member(&interpreted, "resolution").ok_or_else(invalid)?;
    let batch = generic(copy_json(input, ctx))?;
    if !exact_members(&batch, &["version", "target", "fields", "rows"])
        || text(member(&batch, "version")) != Some(&Utf16::from("umf.security.disclosure/0.1.0"))
    {
        return Err(invalid());
    }
    let target = member(&batch, "target").ok_or_else(invalid)?;
    if ref_key(target).is_none() || !is_disclosure_target(target, resolution) {
        return Err(invalid());
    }
    let selected = array(member(&batch, "fields"));
    let rows = array(member(&batch, "rows"));
    if selected.len() > 256
        || rows.len() > 4096
        || selected.len().saturating_mul(rows.len()) > 16384
        || member(&batch, "fields").is_none_or(|v| !matches!(v, Value::Array(_)))
        || member(&batch, "rows").is_none_or(|v| !matches!(v, Value::Array(_)))
    {
        return Err(invalid());
    }
    // The selected target may be an entity or association; resolve its exact declaration.
    let ontology = member(resolution, "ontology").unwrap_or(&Value::Null);
    let target_definition = array(member(ontology, "entities"))
        .iter()
        .chain(array(member(ontology, "associations")))
        .find(|entry| member(entry, "type").is_some_and(|ty| same_ref(ty, target)))
        .ok_or_else(invalid)?;
    let target_fields = array(member(target_definition, "fields"));
    let mut selected_keys = Vec::with_capacity(selected.len());
    for reference in selected {
        let key = ref_key(reference).ok_or_else(invalid)?;
        let mut belongs_to_target = false;
        for entry in target_fields {
            ctx.charge_work(1, Utf16::default())?;
            if let Some(field_ref) = member(entry, "ref") {
                if let Some(candidate) = ref_key(field_ref) {
                    ctx.charge_work(
                        ref_units(&key).saturating_add(ref_units(&candidate)),
                        Utf16::default(),
                    )?;
                    if candidate == key {
                        belongs_to_target = true;
                        break;
                    }
                }
            }
        }
        let mut duplicate = false;
        for prior in &selected_keys {
            ctx.charge_work(
                ref_units(&key).saturating_add(ref_units(prior)),
                Utf16::default(),
            )?;
            if prior == &key {
                duplicate = true;
                break;
            }
        }
        if !belongs_to_target || duplicate {
            return Err(invalid());
        }
        selected_keys.push(key);
    }
    let engine: Engine = generic(crate::security_parameters::core_engine())?;
    for row in rows {
        let Value::Array(cells) = row else {
            return Err(invalid());
        };
        if cells.len() != selected.len() {
            return Err(invalid());
        }
        for (index, cell) in cells.iter().enumerate() {
            let disposition = text(member(cell, "disposition")).ok_or_else(invalid)?;
            let cell_field = member(cell, "field").ok_or_else(invalid)?;
            let cell_key = ref_key(cell_field);
            let expected_key = selected_keys.get(index);
            if let (Some(actual), Some(expected)) = (&cell_key, expected_key) {
                ctx.charge_work(
                    ref_units(actual).saturating_add(ref_units(expected)),
                    Utf16::default(),
                )?;
            }
            if cell_key.as_ref() != expected_key {
                return Err(invalid());
            }
            match disposition.to_utf8().ok().as_deref() {
                Some("withheld") => {
                    if !exact_members(cell, &["field", "disposition"]) {
                        return Err(invalid());
                    }
                }
                Some("absent") => {
                    if !exact_members(cell, &["field", "disposition"])
                        || field(cell_field, resolution).is_none_or(|(_, f)| {
                            text(member(f, "nullability"))
                                .is_none_or(|n| n != &Utf16::from("absent-allowed"))
                        })
                    {
                        return Err(invalid());
                    }
                }
                Some("original") | Some("transformed") => {
                    let transformed = disposition == &Utf16::from("transformed");
                    let expected = if transformed {
                        &["field", "disposition", "outputType", "value"][..]
                    } else {
                        &["field", "disposition", "value"][..]
                    };
                    if !exact_members(cell, expected) {
                        return Err(invalid());
                    }
                    let literal_field = if transformed {
                        member(cell, "outputType").ok_or_else(invalid)?
                    } else {
                        cell_field
                    };
                    let (document, definition) =
                        field(literal_field, resolution).ok_or_else(invalid)?;
                    generic(engine.check_schema_literal_public(
                        document,
                        definition,
                        member(cell, "value").ok_or_else(invalid)?,
                        ctx,
                    ))?;
                }
                _ => return Err(invalid()),
            }
        }
    }
    Ok(batch)
}

pub fn encode_security_disclosure(
    input: &Value,
    policy: &Value,
    resolution: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let batch = validate_security_disclosure(input, policy, resolution, ctx)?;
    let text = generic(crate::security_policy_source::write_security_source(
        &batch,
        Format::Json,
        ctx,
    ))?;
    Ok(Value::String(text))
}
pub fn decode_security_disclosure(
    source: &Utf16,
    policy: &Value,
    resolution: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let batch = generic(crate::security_policy_source::read_security_source(
        source.units(),
        Format::Json,
        ctx,
    ))?;
    validate_security_disclosure(&batch, policy, resolution, ctx)
}

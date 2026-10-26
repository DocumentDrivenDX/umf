// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded, inert admission for one generated graph-write/1 string SET.
//!
//! This module does not authorize a caller or perform an effect. It adapts the
//! existing action and core literal semantics to generated scalar carriers.

use crate::value::{array_items, member, object_members, string_member};
use std::collections::BTreeSet;
use umf_core::{Context, EngineError, Utf16, Value};

pub(super) const MAX_ARTIFACT_BYTES: usize = 1_048_576;
pub(super) const MAX_REQUEST_BYTES: usize = 4_194_304;
pub(super) const INPUT_DOMAIN: &[u8] = b"umf.actions.generated-invocation/1\n";

fn check_request_bytes(bytes: usize) -> Result<(), EngineError> {
    if bytes > MAX_REQUEST_BYTES {
        Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Bridge JSON byte limit exceeded",
        ))
    } else {
        Ok(())
    }
}

pub(super) fn invalid(path: &str) -> EngineError {
    EngineError::new(
        "ACTION_RUNTIME_INVALID",
        Utf16::from(path),
        "Malformed single-SET bridge request",
    )
}

pub(super) fn integrity(path: &str) -> EngineError {
    EngineError::new(
        "ACTION_RUNTIME_INTEGRITY",
        Utf16::from(path),
        "Source, model, action, or invocation pins do not match",
    )
}

pub(super) fn unsupported(path: &str) -> EngineError {
    EngineError::new(
        "ACTION_RUNTIME_UNSUPPORTED",
        Utf16::from(path),
        "Declaration is outside the single-SET string profile",
    )
}

pub(super) fn hash_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

pub(super) fn strval(value: impl AsRef<str>) -> Value {
    Value::string_utf8(value)
}

pub(super) fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

pub(super) fn array(values: impl IntoIterator<Item = Value>) -> Value {
    Value::Array(values.into_iter().collect())
}

pub(super) fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    member(value, name)
}

pub(super) fn owned_text(value: &Value, path: &str) -> Result<String, EngineError> {
    match value {
        Value::String(value) => value.to_utf8().map_err(|_| invalid(path)),
        _ => Err(invalid(path)),
    }
}

pub(super) fn bounded_identifier(value: &Value, path: &str) -> Result<String, EngineError> {
    let Value::String(text) = value else {
        return Err(invalid(path));
    };
    if text.is_empty() || text.len() > 256 {
        return Err(invalid(path));
    }
    text.to_utf8().map_err(|_| invalid(path))
}

pub(super) fn string_value(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => value.to_utf8().ok(),
        _ => None,
    }
}

pub(super) fn exact_object(value: &Value, members: &[&str], path: &str) -> Result<(), EngineError> {
    let actual = object_members(value).ok_or_else(|| invalid(path))?;
    let mut seen = BTreeSet::new();
    if actual.len() != members.len()
        || actual.iter().any(|(name, _)| {
            name.to_utf8()
                .ok()
                .is_none_or(|name| !members.contains(&name.as_str()) || !seen.insert(name))
        })
        || members.iter().any(|name| !seen.contains(*name))
    {
        return Err(invalid(path));
    }
    Ok(())
}

pub(super) fn array_text(
    value: &Value,
    path: &str,
    nonempty: bool,
) -> Result<Vec<String>, EngineError> {
    array_text_with_limit(value, path, nonempty, 256)
}

pub(super) fn array_text_with_limit(
    value: &Value,
    path: &str,
    nonempty: bool,
    max_units: usize,
) -> Result<Vec<String>, EngineError> {
    let values = array_items(value).ok_or_else(|| invalid(path))?;
    if (nonempty && values.is_empty()) || values.len() > 64 {
        return Err(invalid(path));
    }
    values
        .iter()
        .enumerate()
        .map(|(index, value)| {
            let item_path = format!("{path}/{index}");
            let Value::String(text) = value else {
                return Err(invalid(path));
            };
            if text.is_empty() || text.len() > max_units {
                return Err(invalid(&item_path));
            }
            text.to_utf8().map_err(|_| invalid(&item_path))
        })
        .collect()
}

pub(super) fn check_tree(
    value: &Value,
    depth: usize,
    count: &mut usize,
    bytes: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if depth > 64 {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Bridge JSON depth exceeded",
        ));
    }
    *count = count.checked_add(1).ok_or_else(|| invalid(""))?;
    if *count > 100_000 {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Bridge JSON value limit exceeded",
        ));
    }
    match value {
        Value::Null | Value::Bool(_) | Value::Number(_) => *bytes = bytes.saturating_add(16),
        Value::String(value) => {
            *bytes = bytes.saturating_add(value.len().saturating_mul(3).saturating_add(2));
            check_request_bytes(*bytes)?;
            ctx.charge_work(value.len().saturating_mul(3), Utf16::default())?;
            if value.to_utf8().is_err() {
                return Err(invalid(""));
            }
        }
        Value::Array(values) => {
            *bytes = bytes.saturating_add(values.len());
            check_request_bytes(*bytes)?;
            for item in values {
                check_tree(item, depth + 1, count, bytes, ctx)?;
            }
        }
        Value::Object(values) => {
            *bytes = bytes.saturating_add(values.len().saturating_mul(2));
            check_request_bytes(*bytes)?;
            for (key, item) in values {
                *bytes = bytes.saturating_add(key.len().saturating_mul(3).saturating_add(2));
                check_request_bytes(*bytes)?;
                ctx.charge_work(key.len().saturating_mul(3), Utf16::default())?;
                if key.to_utf8().is_err() {
                    return Err(invalid(""));
                }
                check_tree(item, depth + 1, count, bytes, ctx)?;
            }
        }
    }
    check_request_bytes(*bytes)
}

#[derive(Clone)]
pub(super) struct Pins {
    pub(super) source: Value,
    pub(super) model: Value,
    pub(super) action: Value,
    pub(super) authorization: Value,
    pub(super) document: Value,
    pub(super) obligations: Vec<Value>,
    pub(super) entity_parameter: String,
    pub(super) target: Value,
    pub(super) key_fields: Vec<Value>,
    pub(super) assignment_input: String,
    pub(super) assignment_field: Value,
    pub(super) frame_id: String,
    pub(super) frame_record: Value,
    pub(super) frame_fields: Vec<Value>,
    pub(super) wire_action: String,
}

pub(super) fn field_identity(field: &Value) -> Result<(String, String), EngineError> {
    exact_object(field, &["module", "element"], "/field")?;
    Ok((
        bounded_identifier(
            get(field, "module").ok_or_else(|| invalid("/field/module"))?,
            "/field/module",
        )?,
        bounded_identifier(
            get(field, "element").ok_or_else(|| invalid("/field/element"))?,
            "/field/element",
        )?,
    ))
}

pub(super) fn same_ref(left: &Value, right: &Value) -> bool {
    field_identity(left).ok() == field_identity(right).ok()
}

pub(super) fn key_ref_matches(
    value: &Value,
    module: &str,
    element: &str,
    key: &str,
    path: &str,
) -> Result<bool, EngineError> {
    exact_object(value, &["module", "element", "key"], path)?;
    Ok(
        bounded_identifier(get(value, "module").ok_or_else(|| invalid(path))?, path)? == module
            && bounded_identifier(get(value, "element").ok_or_else(|| invalid(path))?, path)?
                == element
            && bounded_identifier(get(value, "key").ok_or_else(|| invalid(path))?, path)? == key,
    )
}

pub(super) fn find_element<'a>(
    document: &'a Value,
    module_id: &str,
    element_id: &str,
) -> Option<&'a Value> {
    array_items(get(document, "modules")?)?
        .iter()
        .find(|module| {
            string_member(module, "id")
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                == Some(module_id)
        })
        .and_then(|module| {
            array_items(get(module, "elements")?)?
                .iter()
                .find(|element| {
                    string_member(element, "id")
                        .and_then(|v| v.to_utf8().ok())
                        .as_deref()
                        == Some(element_id)
                })
        })
}

pub(super) fn module_for<'a>(document: &'a Value, module_id: &str) -> Option<&'a Value> {
    array_items(get(document, "modules")?)?
        .iter()
        .find(|module| {
            string_member(module, "id")
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                == Some(module_id)
        })
}

pub(super) fn require_string_field(
    document: &Value,
    reference: &Value,
    path: &str,
) -> Result<Value, EngineError> {
    let (module, element) = field_identity(reference).map_err(|_| unsupported(path))?;
    let field = find_element(document, &module, &element).ok_or_else(|| unsupported(path))?;
    if string_member(field, "kind")
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some("field")
        || string_member(field, "scalarType")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("string")
        || string_member(field, "cardinality")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("one")
        || string_member(field, "nullability")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("required")
    {
        return Err(unsupported(path));
    }
    Ok(field.clone())
}

pub(super) fn require_supported_string_field(
    document: &Value,
    reference: &Value,
    path: &str,
) -> Result<Value, EngineError> {
    let field = require_string_field(document, reference, path)?;
    let members = object_members(&field).ok_or_else(|| unsupported(path))?;
    for (name, _) in members {
        let name = name.to_utf8().map_err(|_| unsupported(path))?;
        if ![
            "id",
            "name",
            "kind",
            "scalarType",
            "cardinality",
            "nullability",
            "allowedValues",
            "facets",
            "extensions",
        ]
        .contains(&name.as_str())
        {
            return Err(unsupported(path));
        }
    }
    if get(&field, "extensions")
        .and_then(object_members)
        .is_some_and(|members| !members.is_empty())
    {
        return Err(unsupported(path));
    }
    if let Some(values) = get(&field, "allowedValues") {
        let values = array_items(values).ok_or_else(|| unsupported(path))?;
        if values.is_empty() || values.len() > 256 {
            return Err(unsupported(path));
        }
        let mut seen = BTreeSet::new();
        for value in values {
            exact_object(value, &["string"], path)?;
            let text = owned_text(get(value, "string").ok_or_else(|| unsupported(path))?, path)?;
            if !seen.insert(text) {
                return Err(unsupported(path));
            }
        }
    }
    if let Some(facets) = get(&field, "facets") {
        exact_object(facets, &["length"], path)?;
        let length = get(facets, "length").ok_or_else(|| unsupported(path))?;
        let members = object_members(length).ok_or_else(|| unsupported(path))?;
        if members.iter().any(|(name, _)| {
            name.to_utf8()
                .ok()
                .is_none_or(|name| !["min", "max", "unit"].contains(&name.as_str()))
        }) {
            return Err(unsupported(path));
        }
        let min = get(length, "min");
        let max = get(length, "max");
        let valid_bound = |bound: Option<&Value>| {
            bound.is_none_or(|bound| matches!(bound, Value::Number(value) if value.is_finite() && value.fract() == 0.0 && *value >= 0.0))
        };
        if min.is_none()
            && max.is_none()
            || !valid_bound(min)
            || !valid_bound(max)
            || min.zip(max).is_some_and(|(min, max)| {
                matches!((min, max), (Value::Number(min), Value::Number(max)) if min > max)
            })
            || string_value(get(length, "unit").unwrap_or(&Value::Null)).as_deref()
                != Some("unicode-scalar")
        {
            return Err(unsupported(path));
        }
    }
    Ok(field)
}

#[cfg(test)]
mod tests {
    use super::{check_tree, MAX_REQUEST_BYTES};
    use umf_core::{Context, Utf16, Value};

    #[test]
    fn request_byte_limit_precedes_utf8_conversion() {
        let oversized_invalid_utf16 = Value::String(Utf16::new(vec![0xd800; MAX_REQUEST_BYTES]));
        let mut nodes = 0;
        let mut bytes = 0;
        let error = check_tree(
            &oversized_invalid_utf16,
            0,
            &mut nodes,
            &mut bytes,
            &mut Context::ordinary(),
        )
        .expect_err("the byte cap must reject before decoding invalid UTF-16");
        assert_eq!(error.code, "LIMIT");
    }
}

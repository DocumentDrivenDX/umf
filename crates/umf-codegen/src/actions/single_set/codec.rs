use super::common::*;
use crate::canonical::canonical_json;
use crate::resources::CodegenEngine;
use crate::value::object_members;
use std::collections::BTreeSet;
use umf_core::literal::{literal_errors, literal_identity};
use umf_core::{Context, EngineError, Utf16, Value};

pub(super) fn value_for_field(value: &str) -> Value {
    obj(vec![("string", strval(value))])
}

pub(super) fn admit_string(
    engine: &CodegenEngine<'_>,
    document: &Value,
    field_ref: &Value,
    value: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (module, element) = field_identity(field_ref)?;
    let field = find_element(document, &module, &element).ok_or_else(|| unsupported("/field"))?;
    let literal = value_for_field(value);
    let errors = literal_errors(
        document,
        field,
        &literal,
        true,
        engine.resources().engine().policy(),
        ctx,
    )?;
    if let Some(error) = errors.first() {
        return Err(EngineError::new(
            error
                .code
                .to_utf8()
                .unwrap_or_else(|_| "ACTION_VALUE".into()),
            error.path.clone(),
            error.message.clone(),
        ));
    }
    Ok(literal)
}

pub(super) fn uleb(mut value: usize, output: &mut Vec<u8>) {
    loop {
        let next = value & 0x7f;
        value >>= 7;
        output.push((next | if value == 0 { 0 } else { 0x80 }) as u8);
        if value == 0 {
            break;
        }
    }
}

pub(super) fn tuple_hex(value: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let bytes = value.as_bytes();
    ctx.charge_work(
        bytes.len().saturating_mul(3).saturating_add(16),
        Utf16::default(),
    )?;
    let mut output = Vec::with_capacity(5 + 1 + 1 + 10 + bytes.len());
    output.extend_from_slice(b"UMFK1");
    uleb(1, &mut output);
    output.push(4);
    uleb(bytes.len(), &mut output);
    output.extend_from_slice(bytes);
    Ok(hash_hex(&output))
}

pub(super) fn key_components(
    engine: &CodegenEngine<'_>,
    pins: &Pins,
    key_value: &str,
    ctx: &mut Context<'_>,
) -> Result<(Value, String), EngineError> {
    let literal = admit_string(engine, &pins.document, &pins.key_fields[0], key_value, ctx)?;
    let (module, element) = field_identity(&pins.key_fields[0])?;
    let field =
        find_element(&pins.document, &module, &element).ok_or_else(|| unsupported("/target"))?;
    if literal_identity(field, &literal, engine.resources().engine().policy(), ctx)?.is_none() {
        return Err(unsupported("/target"));
    }
    let hex = tuple_hex(key_value, ctx)?;
    Ok((array([literal]), hex))
}

pub(super) fn create_result_entity(pins: &Pins, components: Value, tuple_hex: String) -> Value {
    obj(vec![
        ("parameter", strval(&pins.entity_parameter)),
        ("key", pins.target.clone()),
        ("fields", array(pins.key_fields.clone())),
        ("components", components),
        ("profile", strval("umf-key-tuple-v1")),
        ("tupleHex", strval(tuple_hex)),
    ])
}

pub(super) fn invocation_digest(
    model: &Value,
    action: &Value,
    inputs: &Value,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let bytes = canonical_json(
        &obj(vec![
            ("model", model.clone()),
            ("action", action.clone()),
            ("inputs", inputs.clone()),
        ]),
        ctx,
    )?;
    let mut hash = sha2::Sha256::new();
    use sha2::Digest;
    hash.update(INPUT_DOMAIN);
    hash.update(&bytes);
    Ok(hash_hex(&hash.finalize()))
}

pub(super) fn string_map(
    value: &Value,
    expected: &[String],
    path: &str,
) -> Result<Vec<(String, String)>, EngineError> {
    let members = object_members(value).ok_or_else(|| invalid(path))?;
    if members.len() != expected.len() {
        return Err(unsupported(path));
    }
    let mut pairs = Vec::with_capacity(members.len());
    let mut seen = BTreeSet::new();
    for (key, val) in members {
        if key.is_empty() || key.len() > 256 {
            return Err(invalid(path));
        }
        let key = key.to_utf8().map_err(|_| invalid(path))?;
        if !expected.iter().any(|expected| expected == &key) || !seen.insert(key.clone()) {
            return Err(unsupported(path));
        }
        pairs.push((key, owned_text(val, path)?));
    }
    Ok(pairs)
}

pub(super) fn typed_input_map(pins: &Pins, key_value: &str, assignment: &str) -> Value {
    obj(vec![
        (
            &pins.entity_parameter,
            obj(vec![
                ("key", pins.target.clone()),
                ("components", array([value_for_field(key_value)])),
            ]),
        ),
        (&pins.assignment_input, value_for_field(assignment)),
    ])
}

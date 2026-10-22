// SPDX-License-Identifier: MIT OR Apache-2.0
//! Lossless ordered-value helpers used by generator admission and emission.

use umf_core::{Context, EngineError, Utf16, Value};

pub(crate) fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    crate::value::member(value, key)
}

pub(crate) fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => value.to_utf8().ok(),
        _ => None,
    }
}

pub(crate) fn text_at(value: &Value, key: &str) -> Option<String> {
    text(get(value, key)?)
}

pub(crate) fn array(value: &Value) -> Option<&[Value]> {
    crate::value::array_items(value)
}

pub(crate) fn object(value: &Value) -> Option<&[(Utf16, Value)]> {
    crate::value::object_members(value)
}

pub(crate) fn boolean(value: &Value) -> Option<bool> {
    match value {
        Value::Bool(v) => Some(*v),
        _ => None,
    }
}

pub(crate) fn number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(v) => Some(*v),
        _ => None,
    }
}

pub(crate) fn string(value: impl AsRef<str>) -> Value {
    Value::String(Utf16::from_utf8(value.as_ref()))
}

pub(crate) fn bool(value: bool) -> Value {
    Value::Bool(value)
}

pub(crate) fn num(value: usize) -> Value {
    Value::Number(value as f64)
}

pub(crate) fn arr(values: impl IntoIterator<Item = Value>) -> Value {
    Value::Array(values.into_iter().collect())
}

pub(crate) fn obj(values: impl IntoIterator<Item = (impl AsRef<str>, Value)>) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(key, value)| (Utf16::from_utf8(key.as_ref()), value))
            .collect(),
    )
}

pub(crate) fn member_path(index: usize, member: &str) -> Utf16 {
    Utf16::from(format!("/{index}/{member}"))
}

pub(crate) fn err(code: &str, path: impl Into<Utf16>, message: &str) -> EngineError {
    EngineError::new(code, path.into(), message)
}

/// Charge before an input-derived copy or loop. Callers also check cancellation
/// at loop boundaries; the charge is deliberately operation-local.
pub(crate) fn precharge(
    ctx: &mut Context<'_>,
    units: usize,
    path: Utf16,
) -> Result<(), EngineError> {
    ctx.charge_work(units, path)
}

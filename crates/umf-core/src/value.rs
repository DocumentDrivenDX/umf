// SPDX-License-Identifier: MIT OR Apache-2.0
use std::collections::BTreeSet;

use crate::{context::Context, error::EngineError};

/// A string represented as UTF-16 code units so isolated surrogate values are
/// retained at the Rust boundary.
#[derive(Clone, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct Utf16(Vec<u16>);

impl Utf16 {
    pub fn new(units: Vec<u16>) -> Self {
        Self(units)
    }

    pub fn units(&self) -> &[u16] {
        &self.0
    }

    pub fn into_units(self) -> Vec<u16> {
        self.0
    }

    /// Convert only well-formed UTF-16. Isolated units are never replaced.
    pub fn to_utf8(&self) -> Result<String, std::string::FromUtf16Error> {
        String::from_utf16(&self.0)
    }

    pub fn from_utf8(value: &str) -> Self {
        Self(value.encode_utf16().collect())
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl std::fmt::Debug for Utf16 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.to_utf8() {
            Ok(value) => f.debug_tuple("Utf16").field(&value).finish(),
            Err(_) => f.debug_tuple("Utf16").field(&self.0).finish(),
        }
    }
}

impl From<&str> for Utf16 {
    fn from(value: &str) -> Self {
        Self::from_utf8(value)
    }
}

impl From<String> for Utf16 {
    fn from(value: String) -> Self {
        Self::from_utf8(&value)
    }
}

/// JSON-compatible values owned by UMF. Object pairs retain storage order and
/// are checked for duplicate UTF-16 keys at every public admission boundary.
#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Number(f64),
    String(Utf16),
    Array(Vec<Value>),
    Object(Vec<(Utf16, Value)>),
}

impl Value {
    pub fn number(value: f64, path: Utf16) -> Result<Self, EngineError> {
        validate_number(value, path)?;
        Ok(Self::Number(value))
    }

    pub fn string_utf8(value: impl AsRef<str>) -> Self {
        Self::String(Utf16::from_utf8(value.as_ref()))
    }

    /// Construct an ordered object while rejecting duplicate decoded keys.
    /// Full resource accounting is applied when the value crosses an operation
    /// admission boundary such as `copy_json`.
    pub fn object(members: Vec<(Utf16, Value)>, path: Utf16) -> Result<Self, EngineError> {
        let mut seen = BTreeSet::new();
        for (key, _) in &members {
            if !seen.insert(key.units().to_vec()) {
                return Err(EngineError::new(
                    "DUPLICATE_KEY",
                    path.clone(),
                    "Duplicate object key",
                ));
            }
        }
        Ok(Self::Object(members))
    }
}

const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

/// ECMAScript Number::toString formatting for the interoperable binary64
/// profile. Shared by serialization and exact source-token admission.
pub fn ecma_number_to_string(value: f64) -> String {
    let mut buffer = ryu_js::Buffer::new();
    buffer.format_finite(value).to_owned()
}

fn validate_number(value: f64, path: Utf16) -> Result<(), EngineError> {
    if !value.is_finite()
        || (value == 0.0 && value.is_sign_negative())
        || (value.fract() == 0.0 && value.abs() > MAX_SAFE_INTEGER)
    {
        return Err(EngineError::new(
            "NUMBER",
            path,
            "Number outside the core interoperable numeric profile",
        ));
    }
    Ok(())
}

/// Validate and copy one JSON tree without collapsing ordered members or UTF-16
/// strings. Value-count limits apply to this tree; caller meters remain cumulative.
pub fn copy_json(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    fn visit(
        value: &Value,
        ctx: &mut Context<'_>,
        path: &Utf16,
        depth: usize,
        tree_values: &mut usize,
    ) -> Result<Value, EngineError> {
        ctx.charge_work(1, path.clone())?;
        *tree_values = tree_values
            .checked_add(1)
            .ok_or_else(|| EngineError::new("LIMIT", path.clone(), "JSON value count overflow"))?;
        ctx.check_tree_value_count(*tree_values, path.clone())?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "JSON nesting depth exceeded",
            ));
        }
        match value {
            Value::Null => Ok(Value::Null),
            Value::Bool(value) => Ok(Value::Bool(*value)),
            Value::Number(value) => {
                validate_number(*value, path.clone())?;
                Ok(Value::Number(*value))
            }
            Value::String(value) => {
                ctx.charge_work(value.len(), path.clone())?;
                Ok(Value::String(value.clone()))
            }
            Value::Array(items) => {
                if items.len() > ctx.limits().max_values.saturating_sub(*tree_values) {
                    return Err(EngineError::new(
                        "LIMIT",
                        path.clone(),
                        "JSON structural value limit exceeded",
                    ));
                }
                ctx.charge_work(items.len(), path.clone())?;
                let mut copy = Vec::with_capacity(items.len());
                for (index, item) in items.iter().enumerate() {
                    copy.push(visit(
                        item,
                        ctx,
                        &append_path(path, &Utf16::from(index.to_string())),
                        depth + 1,
                        tree_values,
                    )?);
                }
                Ok(Value::Array(copy))
            }
            Value::Object(members) => {
                if members.len() > ctx.limits().max_values.saturating_sub(*tree_values) {
                    return Err(EngineError::new(
                        "LIMIT",
                        path.clone(),
                        "JSON structural value limit exceeded",
                    ));
                }
                ctx.charge_work(members.len(), path.clone())?;
                let mut seen = BTreeSet::new();
                let mut copy = Vec::with_capacity(members.len());
                for (key, item) in members {
                    ctx.charge_work(key.len(), path.clone())?;
                    if !seen.insert(key.units().to_vec()) {
                        return Err(EngineError::new(
                            "DUPLICATE_KEY",
                            path.clone(),
                            "Duplicate object key",
                        ));
                    }
                    copy.push((
                        key.clone(),
                        visit(item, ctx, &append_path(path, key), depth + 1, tree_values)?,
                    ));
                }
                Ok(Value::Object(copy))
            }
        }
    }

    let mut tree_values = 0;
    visit(value, ctx, &Utf16::default(), 0, &mut tree_values)
}

/// Validate an already-owned JSON tree using the same accounting and
/// precedence as [`copy_json`], without allocating a duplicate tree.
pub(crate) fn validate_json(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    fn visit(
        value: &Value,
        ctx: &mut Context<'_>,
        path: &Utf16,
        depth: usize,
        tree_values: &mut usize,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, path.clone())?;
        *tree_values = tree_values
            .checked_add(1)
            .ok_or_else(|| EngineError::new("LIMIT", path.clone(), "JSON value count overflow"))?;
        ctx.check_tree_value_count(*tree_values, path.clone())?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "JSON nesting depth exceeded",
            ));
        }
        match value {
            Value::Null | Value::Bool(_) => Ok(()),
            Value::Number(number) => validate_number(*number, path.clone()),
            Value::String(text) => ctx.charge_work(text.len(), path.clone()),
            Value::Array(items) => {
                if items.len() > ctx.limits().max_values.saturating_sub(*tree_values) {
                    return Err(EngineError::new(
                        "LIMIT",
                        path.clone(),
                        "JSON structural value limit exceeded",
                    ));
                }
                ctx.charge_work(items.len(), path.clone())?;
                for (index, item) in items.iter().enumerate() {
                    visit(
                        item,
                        ctx,
                        &append_path(path, &Utf16::from(index.to_string())),
                        depth + 1,
                        tree_values,
                    )?;
                }
                Ok(())
            }
            Value::Object(members) => {
                if members.len() > ctx.limits().max_values.saturating_sub(*tree_values) {
                    return Err(EngineError::new(
                        "LIMIT",
                        path.clone(),
                        "JSON structural value limit exceeded",
                    ));
                }
                ctx.charge_work(members.len(), path.clone())?;
                let mut seen = BTreeSet::new();
                for (key, item) in members {
                    ctx.charge_work(key.len(), path.clone())?;
                    if !seen.insert(key.units().to_vec()) {
                        return Err(EngineError::new(
                            "DUPLICATE_KEY",
                            path.clone(),
                            "Duplicate object key",
                        ));
                    }
                    visit(item, ctx, &append_path(path, key), depth + 1, tree_values)?;
                }
                Ok(())
            }
        }
    }

    let mut tree_values = 0;
    visit(value, ctx, &Utf16::default(), 0, &mut tree_values)
}

fn append_path(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for unit in key.units() {
        match unit {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            other => units.push(*other),
        }
    }
    Utf16::new(units)
}

#[cfg(test)]
mod borrowed_validation_tests {
    use super::{copy_json, validate_json, Utf16, Value};
    use crate::context::{Context, Limits, ResourceProfile};

    fn context_with_limits(limits: Limits) -> Context<'static> {
        Context::with_limits(ResourceProfile::Cooperative, limits).unwrap()
    }

    fn assert_copy_validation_parity(value: &Value, limits: Limits) {
        let mut copy_context = context_with_limits(limits);
        let mut validate_context = context_with_limits(limits);
        let copied = copy_json(value, &mut copy_context).map(|_| ());
        let validated = validate_json(value, &mut validate_context);
        assert_eq!(validated, copied);
        assert_eq!(validate_context.charged_work(), copy_context.charged_work());
    }

    #[test]
    fn borrowed_validation_matches_copy_errors_and_metering() {
        let nested = Value::Object(vec![(
            Utf16::from("a/~"),
            Value::Array(vec![Value::String(Utf16::from("text")), Value::Bool(true)]),
        )]);
        assert_copy_validation_parity(&nested, Limits::ordinary());

        let mut value_limit = Limits::ordinary();
        value_limit.max_values = 2;
        assert_copy_validation_parity(&nested, value_limit);

        let mut depth_limit = Limits::ordinary();
        depth_limit.max_depth = 1;
        assert_copy_validation_parity(&nested, depth_limit);

        let duplicate = Value::Object(vec![
            (Utf16::from("same"), Value::Null),
            (Utf16::from("same"), Value::Bool(false)),
        ]);
        assert_copy_validation_parity(&duplicate, Limits::ordinary());

        let invalid_number = Value::Array(vec![Value::Number(f64::NAN)]);
        assert_copy_validation_parity(&invalid_number, Limits::ordinary());
    }
}

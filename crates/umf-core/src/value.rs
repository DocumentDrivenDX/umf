// SPDX-License-Identifier: MIT OR Apache-2.0
use std::collections::{BTreeSet, HashSet};

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

#[cfg(test)]
mod completed_result_copy_tests {
    use super::{copy_completed_json_result, Utf16, Value};
    use crate::{
        context::{Context, Limits, ResourceProfile},
        error::EngineError,
    };

    #[test]
    fn follows_typescript_nodewise_limit_path_and_charges_copy_work() {
        let value = Value::Object(vec![(
            Utf16::from("a"),
            Value::Array(vec![Value::Bool(true); 4]),
        )]);
        let mut limits = Limits::ordinary();
        limits.max_values = 4;
        let mut observed = 0usize;
        let mut meter = |amount: usize| {
            observed += amount;
            Ok(())
        };
        let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits)
            .unwrap()
            .with_meter(&mut meter);
        let error = copy_completed_json_result(&value, &mut ctx).unwrap_err();
        drop(ctx);
        assert_eq!(error.code, "LIMIT");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "JSON structural limit exceeded"
        );
        assert_eq!(error.path.to_utf8().unwrap(), "/a/2");
        assert_eq!(observed, 25);
    }

    #[test]
    fn meter_failure_stops_copy_and_text_is_not_clamped_by_text_limit() {
        let value = Value::Array(vec![Value::Bool(true); 20]);
        let mut observed = 0usize;
        let mut meter = |amount: usize| {
            observed += amount;
            if observed >= 4 {
                Err(EngineError::new(
                    "METER_FAILURE",
                    Utf16::default(),
                    "stop copy",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = copy_completed_json_result(&value, &mut ctx).unwrap_err();
        drop(ctx);
        assert_eq!(error.code, "METER_FAILURE");
        assert_eq!(observed, 4);

        let mut limits = Limits::ordinary();
        limits.max_text_units = 8;
        let long = Value::String(Utf16::from("x".repeat(32)));
        let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
        assert_eq!(copy_completed_json_result(&long, &mut ctx).unwrap(), long);

        let long = Value::String(Utf16::from("x".repeat(32)));
        let mut observed_units = 0usize;
        let mut text_meter = |amount: usize| {
            observed_units += amount;
            if amount > 8 {
                Err(EngineError::new(
                    "METER_FAILURE",
                    Utf16::default(),
                    "stop before long clone",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut text_meter);
        let error = copy_completed_json_result(&long, &mut ctx).unwrap_err();
        drop(ctx);
        assert_eq!(error.code, "METER_FAILURE");
        assert_eq!(observed_units, 33);
    }

    #[test]
    fn rejects_duplicate_keys_and_invalid_numbers_preserving_raw_utf16_paths() {
        let duplicate = Value::Object(vec![
            (Utf16::from("x/~"), Value::Null),
            (Utf16::from("x/~"), Value::Bool(true)),
        ]);
        let error = copy_completed_json_result(&duplicate, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "DUPLICATE_KEY");
        assert_eq!(error.path.to_utf8().unwrap(), "/x~1~0");

        let value = Value::Object(vec![(Utf16::new(vec![0xd800]), Value::Null)]);
        let mut limits = Limits::ordinary();
        limits.max_values = 1;
        let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
        let error = copy_completed_json_result(&value, &mut ctx).unwrap_err();
        assert_eq!(error.code, "LIMIT");
        assert_eq!(error.path, Utf16::new(vec![b'/' as u16, 0xd800]));

        let error = copy_completed_json_result(&Value::Number(f64::NAN), &mut Context::ordinary())
            .unwrap_err();
        assert_eq!(error.code, "NUMBER");
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

/// Copy an already-admitted completed public result with TypeScript's
/// nodewise structural-limit order. Generic input copies intentionally retain
/// `copy_json`'s existing error and preflight behavior.
pub(crate) fn copy_completed_json_result(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    fn child_path(
        path: &Utf16,
        segment: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        let escaped_capacity = segment
            .len()
            .checked_mul(2)
            .and_then(|size| path.len().checked_add(size))
            .and_then(|size| size.checked_add(1))
            .ok_or_else(|| {
                EngineError::new("LIMIT", path.clone(), "JSON pointer length overflow")
            })?;
        ctx.charge_work(escaped_capacity, Utf16::default())?;
        let mut units = Vec::new();
        units.try_reserve_exact(escaped_capacity).map_err(|_| {
            EngineError::new("LIMIT", path.clone(), "JSON pointer allocation failed")
        })?;
        units.extend_from_slice(path.units());
        units.push(b'/' as u16);
        for unit in segment.units() {
            match unit {
                0x7e => units.extend([0x7e, 0x30]),
                0x2f => units.extend([0x7e, 0x31]),
                unit => units.push(*unit),
            }
        }
        Ok(Utf16::new(units))
    }

    fn visit(
        value: &Value,
        ctx: &mut Context<'_>,
        path: &Utf16,
        depth: usize,
        count: &mut usize,
    ) -> Result<Value, EngineError> {
        ctx.charge_work(1, path.clone())?;
        *count = count.checked_add(1).ok_or_else(|| {
            EngineError::new("LIMIT", path.clone(), "JSON structural limit exceeded")
        })?;
        if *count > ctx.limits().max_values || depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "JSON structural limit exceeded",
            ));
        }
        match value {
            Value::Null => Ok(Value::Null),
            Value::Bool(value) => Ok(Value::Bool(*value)),
            Value::Number(value) => Value::number(*value, path.clone()),
            Value::String(value) => {
                ctx.charge_work(value.len(), path.clone())?;
                Ok(Value::String(value.clone()))
            }
            Value::Array(items) => {
                let mut copied = Vec::new();
                for (index, item) in items.iter().enumerate() {
                    let child = child_path(path, &Utf16::from(index.to_string()), ctx)?;
                    copied.try_reserve(1).map_err(|_| {
                        EngineError::new("LIMIT", child.clone(), "JSON structural limit exceeded")
                    })?;
                    copied.push(visit(item, ctx, &child, depth + 1, count)?);
                }
                Ok(Value::Array(copied))
            }
            Value::Object(members) => {
                let mut seen: HashSet<&Utf16> = HashSet::new();
                let mut copied = Vec::new();
                for (key, item) in members {
                    ctx.charge_work(key.len(), path.clone())?;
                    let child = child_path(path, key, ctx)?;
                    ctx.charge_work(1, path.clone())?;
                    seen.try_reserve(1).map_err(|_| {
                        EngineError::new("LIMIT", child.clone(), "JSON structural limit exceeded")
                    })?;
                    if !seen.insert(key) {
                        return Err(EngineError::new(
                            "DUPLICATE_KEY",
                            child,
                            "Duplicate object key",
                        ));
                    }
                    copied.try_reserve(1).map_err(|_| {
                        EngineError::new("LIMIT", child.clone(), "JSON structural limit exceeded")
                    })?;
                    copied.push((key.clone(), visit(item, ctx, &child, depth + 1, count)?));
                }
                Ok(Value::Object(copied))
            }
        }
    }

    visit(value, ctx, &Utf16::default(), 0, &mut 0)
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

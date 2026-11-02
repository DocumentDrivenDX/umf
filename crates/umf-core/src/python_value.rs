// SPDX-License-Identifier: MIT OR Apache-2.0
//! Source-preserving values for Python's JSON Schema consumer profile.
//!
//! These values deliberately keep Python code points (including isolated
//! surrogate code points), arbitrary-precision integers, and IEEE-754 float
//! bits separate from UMF's interoperable `Value` representation.

use crate::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value},
};
use num_bigint::BigInt;
use num_traits::ToPrimitive;
use std::collections::BTreeSet;

#[derive(Clone, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct PyText(Vec<u32>);

impl PyText {
    pub fn from_codepoints(codepoints: Vec<u32>) -> Result<Self, EngineError> {
        if codepoints.iter().any(|value| *value > 0x10ffff) {
            return Err(EngineError::new(
                "PYTHON_VALUE_INVALID",
                Utf16::default(),
                "Python text contains an out-of-range code point",
            ));
        }
        Ok(Self(codepoints))
    }

    pub fn from_utf8(value: &str) -> Self {
        Self(value.chars().map(u32::from).collect())
    }

    pub fn codepoints(&self) -> &[u32] {
        &self.0
    }

    pub fn into_codepoints(self) -> Vec<u32> {
        self.0
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Return the code-unit count used by the operation text budget.
    pub fn utf16_unit_len(&self) -> usize {
        self.0
            .iter()
            .map(|point| if *point > 0xffff { 2 } else { 1 })
            .sum()
    }

    /// Project Python code points to core UTF-16 units. The projection does
    /// not preserve the distinction between an astral scalar and an explicit
    /// surrogate pair; callers must retain this `PyText` as the source value.
    pub fn to_utf16(&self, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        ctx.charge_work(self.utf16_unit_len(), Utf16::default())?;
        let mut units = Vec::with_capacity(self.utf16_unit_len());
        for point in &self.0 {
            if *point <= 0xffff {
                units.push(*point as u16);
            } else {
                let scalar = *point - 0x10000;
                units.push(0xd800 | ((scalar >> 10) as u16));
                units.push(0xdc00 | ((scalar & 0x3ff) as u16));
            }
        }
        Ok(Utf16::new(units))
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum PythonConsumerValue {
    Null,
    Bool(bool),
    Integer(BigInt),
    /// Exact IEEE-754 payload, including signed zero, infinities, and NaNs.
    Float(u64),
    String(PyText),
    Array(Vec<PythonConsumerValue>),
    Object(Vec<(PyText, PythonConsumerValue)>),
}

impl PythonConsumerValue {
    /// Project a Python schema value into the admitted UMF schema carrier.
    /// Arbitrary precision schema numbers outside the interoperable profile
    /// are refused. Use `project_schema_source` when source text identity must
    /// remain available to the Python-profile compiler.
    pub fn project_schema_to_core(&self, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        self.project_schema_source(ctx).map(|(value, _)| value)
    }

    /// Project a schema into the ordinary core numeric/structural profile,
    /// retaining source code-point origins for schema evaluation. This lets
    /// Python regex and key behavior distinguish explicit surrogate code
    /// points from astral scalars while the core snapshot remains validated.
    pub fn project_schema_source(
        &self,
        ctx: &mut Context<'_>,
    ) -> Result<(Value, PythonSchemaOrigins), EngineError> {
        fn visit(
            value: &PythonConsumerValue,
            path: &Utf16,
            depth: usize,
            values: &mut usize,
            origins: &mut PythonSchemaOrigins,
            ctx: &mut Context<'_>,
        ) -> Result<Value, EngineError> {
            ctx.charge_work(1, path.clone())?;
            *values = values.saturating_add(1);
            ctx.check_tree_value_count(*values, path.clone())?;
            if depth > ctx.limits().max_depth {
                return Err(EngineError::new(
                    "LIMIT",
                    path.clone(),
                    "JSON nesting depth exceeded",
                ));
            }
            match value {
                PythonConsumerValue::Null => Ok(Value::Null),
                PythonConsumerValue::Bool(value) => Ok(Value::Bool(*value)),
                PythonConsumerValue::Integer(value) => {
                    let Some(number) = value.to_f64() else {
                        return Err(source_projection_error(
                            path,
                            "Integer schema value is outside the interoperable numeric profile",
                        ));
                    };
                    if compare_bigint_f64(value, number, ctx)? != Some(std::cmp::Ordering::Equal) {
                        return Err(source_projection_error(
                            path,
                            "Integer schema value cannot be represented exactly",
                        ));
                    }
                    crate::value::Value::number(number, path.clone())
                }
                PythonConsumerValue::Float(bits) => {
                    crate::value::Value::number(f64::from_bits(*bits), path.clone())
                }
                PythonConsumerValue::String(text) => {
                    origins.values.insert(path.units().to_vec(), text.clone());
                    Ok(Value::String(text.to_utf16(ctx)?))
                }
                PythonConsumerValue::Array(items) => {
                    let mut output = Vec::with_capacity(items.len());
                    let required_array = path
                        .units()
                        .ends_with(&"/required".encode_utf16().collect::<Vec<_>>());
                    let mut projected_required = BTreeSet::new();
                    let mut required_sources = Vec::<PyText>::new();
                    for (index, item) in items.iter().enumerate() {
                        let item_path = projection_path(path, &Utf16::from(index.to_string()));
                        let mut converted =
                            visit(item, &item_path, depth + 1, values, origins, ctx)?;
                        // The Python metaschema sees Python code-point string
                        // identity for `required`'s uniqueItems assertion.
                        // Give a colliding UTF-16 projection a private unique
                        // validation spelling; evaluation reads the retained
                        // source text at the same item pointer.
                        if required_array {
                            if let PythonConsumerValue::String(source) = item {
                                let Value::String(projected) = &mut converted else {
                                    unreachable!()
                                };
                                let mut units = projected.units().to_vec();
                                let duplicate_source =
                                    required_sources.iter().any(|prior| prior == source);
                                if !duplicate_source && !projected_required.insert(units.clone()) {
                                    while !projected_required.insert(units.clone()) {
                                        units.push(0xf8ff);
                                    }
                                    *projected = Utf16::new(units);
                                } else if duplicate_source {
                                    projected_required.insert(units);
                                }
                                required_sources.push(source.clone());
                            }
                        }
                        output.push(converted);
                    }
                    Ok(Value::Array(output))
                }
                PythonConsumerValue::Object(members) => {
                    let mut output = Vec::with_capacity(members.len());
                    for (member_index, (key, item)) in members.iter().enumerate() {
                        let projected_key = key.to_utf16(ctx)?;
                        let child_path = projection_path(path, &projected_key);
                        origins
                            .members
                            .insert((path.units().to_vec(), member_index), key.clone());
                        output.push((
                            projected_key.clone(),
                            visit(item, &child_path, depth + 1, values, origins, ctx)?,
                        ));
                    }
                    Ok(Value::Object(output))
                }
            }
        }
        let mut count = 0;
        let mut origins = PythonSchemaOrigins::default();
        let value = visit(self, &Utf16::from("#"), 0, &mut count, &mut origins, ctx)?;
        Ok((value, origins))
    }

    /// Admit an owned Python value through the ordinary UMF profile while
    /// keeping the exact source tree available for callbacks and diagnostics.
    /// Distinct source keys that collapse to the same UTF-16 key are refused.
    pub fn admit_core_snapshot(&self, ctx: &mut Context<'_>) -> Result<(Value, Self), EngineError> {
        self.admit(ctx)?;
        fn project(
            value: &PythonConsumerValue,
            path: &Utf16,
            ctx: &mut Context<'_>,
        ) -> Result<Value, EngineError> {
            match value {
                PythonConsumerValue::Null => Ok(Value::Null),
                PythonConsumerValue::Bool(value) => Ok(Value::Bool(*value)),
                PythonConsumerValue::Integer(value) => {
                    let Some(number) = value.to_f64() else {
                        return Err(source_projection_error(
                            path,
                            "Integer is outside the interoperable numeric profile",
                        ));
                    };
                    if compare_bigint_f64(value, number, ctx)? != Some(std::cmp::Ordering::Equal) {
                        return Err(source_projection_error(
                            path,
                            "Integer cannot be represented exactly",
                        ));
                    }
                    Value::number(number, path.clone())
                }
                PythonConsumerValue::Float(bits) => {
                    Value::number(f64::from_bits(*bits), path.clone())
                }
                PythonConsumerValue::String(text) => Ok(Value::String(text.to_utf16(ctx)?)),
                PythonConsumerValue::Array(items) => Ok(Value::Array(
                    items
                        .iter()
                        .enumerate()
                        .map(|(index, item)| {
                            project(
                                item,
                                &projection_path(path, &Utf16::from(index.to_string())),
                                ctx,
                            )
                        })
                        .collect::<Result<_, _>>()?,
                )),
                PythonConsumerValue::Object(members) => {
                    let mut seen = BTreeSet::new();
                    let mut output = Vec::with_capacity(members.len());
                    for (key, child) in members {
                        let projected = key.to_utf16(ctx)?;
                        if !seen.insert(projected.units().to_vec()) {
                            return Err(source_projection_error(
                                path,
                                "Python object keys collide after the core UTF-16 projection",
                            ));
                        }
                        let child_path = projection_path(path, &projected);
                        output.push((projected, project(child, &child_path, ctx)?));
                    }
                    Ok(Value::Object(output))
                }
            }
        }
        let projected = project(self, &Utf16::default(), ctx)?;
        Ok((projected, self.snapshot_with_context(ctx)?))
    }

    pub fn snapshot_with_context(&self, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn cost(value: &PythonConsumerValue) -> usize {
            match value {
                PythonConsumerValue::String(text) => 1usize.saturating_add(text.len()),
                PythonConsumerValue::Array(items) => {
                    1usize.saturating_add(items.iter().map(cost).sum::<usize>())
                }
                PythonConsumerValue::Object(members) => 1usize.saturating_add(
                    members
                        .iter()
                        .map(|(key, value)| {
                            1usize.saturating_add(key.len()).saturating_add(cost(value))
                        })
                        .sum::<usize>(),
                ),
                _ => 1,
            }
        }
        ctx.charge_work(cost(self), Utf16::default())?;
        Ok(self.clone())
    }

    /// Resolve a JSON Pointer against the Python source tree. Object-key
    /// comparison uses the checked core UTF-16 projection, while the returned
    /// value preserves Python's original code points and numeric kind.
    pub fn pointer_get<'a>(
        &'a self,
        pointer: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Option<&'a PythonConsumerValue>, EngineError> {
        let units = pointer.units();
        let mut current = self;
        let mut start = usize::from(units.first() == Some(&0x23));
        if start == units.len() {
            return Ok(Some(current));
        }
        if units.get(start) != Some(&0x2f) {
            return Ok(None);
        }
        start += 1;
        while start <= units.len() {
            let end = units[start..]
                .iter()
                .position(|unit| *unit == 0x2f)
                .map(|offset| start + offset)
                .unwrap_or(units.len());
            let encoded = &units[start..end];
            ctx.charge_work(encoded.len(), pointer.clone())?;
            let mut segment = Vec::with_capacity(encoded.len());
            let mut index = 0;
            while index < encoded.len() {
                if encoded[index] == 0x7e {
                    match encoded.get(index + 1) {
                        Some(0x30) => segment.push(0x7e),
                        Some(0x31) => segment.push(0x2f),
                        _ => return Ok(None),
                    }
                    index += 2;
                } else {
                    segment.push(encoded[index]);
                    index += 1;
                }
            }
            current = match current {
                PythonConsumerValue::Object(members) => {
                    let mut found = None;
                    for (key, value) in members {
                        if key.to_utf16(ctx)?.units() == segment.as_slice() {
                            found = Some(value);
                            break;
                        }
                    }
                    let Some(value) = found else { return Ok(None) };
                    value
                }
                PythonConsumerValue::Array(items) => {
                    if segment.is_empty() || (segment.len() > 1 && segment[0] == b'0' as u16) {
                        return Ok(None);
                    }
                    let Some(index) = segment.iter().try_fold(0usize, |value, unit| {
                        if !(0x30..=0x39).contains(unit) {
                            return None;
                        }
                        value.checked_mul(10)?.checked_add((unit - 0x30) as usize)
                    }) else {
                        return Ok(None);
                    };
                    let Some(value) = items.get(index) else {
                        return Ok(None);
                    };
                    value
                }
                _ => return Ok(None),
            };
            if end == units.len() {
                break;
            }
            start = end + 1;
        }
        Ok(Some(current))
    }
}

fn source_projection_error(path: &Utf16, message: &str) -> EngineError {
    EngineError::new(
        "PYTHON_SCHEMA_SOURCE_UNREPRESENTABLE",
        path.clone(),
        message,
    )
}

fn projection_path(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for unit in key.units() {
        match *unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            value => units.push(value),
        }
    }
    Utf16::new(units)
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct PythonSchemaResources {
    pub entries: Vec<(PyText, PythonConsumerValue)>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct PythonSchemaOrigins {
    pub values: std::collections::BTreeMap<Vec<u16>, PyText>,
    pub members: std::collections::BTreeMap<(Vec<u16>, usize), PyText>,
}
impl PythonSchemaResources {
    pub fn from_core(
        resources: &crate::schema::SchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        fn text(value: &Utf16, ctx: &mut Context<'_>) -> Result<PyText, EngineError> {
            ctx.charge_work(value.len(), Utf16::default())?;
            let mut points = Vec::with_capacity(value.len());
            let units = value.units();
            let mut index = 0;
            while index < units.len() {
                let first = units[index];
                if (0xd800..=0xdbff).contains(&first)
                    && units
                        .get(index + 1)
                        .is_some_and(|next| (0xdc00..=0xdfff).contains(next))
                {
                    let second = units[index + 1];
                    points.push(
                        0x10000 + (((first as u32 - 0xd800) << 10) | (second as u32 - 0xdc00)),
                    );
                    index += 2;
                } else {
                    points.push(first as u32);
                    index += 1;
                }
            }
            PyText::from_codepoints(points)
        }
        fn convert_value(
            value: &Value,
            ctx: &mut Context<'_>,
        ) -> Result<PythonConsumerValue, EngineError> {
            ctx.charge_work(1, Utf16::default())?;
            Ok(match value {
                Value::Null => PythonConsumerValue::Null,
                Value::Bool(value) => PythonConsumerValue::Bool(*value),
                Value::Number(value) => PythonConsumerValue::Float(value.to_bits()),
                Value::String(value) => PythonConsumerValue::String(text(value, ctx)?),
                Value::Array(values) => PythonConsumerValue::Array(
                    values
                        .iter()
                        .map(|v| convert_value(v, ctx))
                        .collect::<Result<_, _>>()?,
                ),
                Value::Object(members) => PythonConsumerValue::Object(
                    members
                        .iter()
                        .map(|(key, child)| Ok((text(key, ctx)?, convert_value(child, ctx)?)))
                        .collect::<Result<_, EngineError>>()?,
                ),
            })
        }
        let mut entries = Vec::with_capacity(resources.entries.len());
        for (id, schema) in &resources.entries {
            entries.push((text(id, ctx)?, convert_value(schema, ctx)?));
        }
        Ok(Self { entries })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct PythonStructuralError {
    pub instance_path: PyText,
    pub physical_instance_path: PyText,
    pub instance_override: Option<PythonConsumerValue>,
    pub schema_path: PyText,
    /// Typed schema pointer segments from the evaluated rule location.
    /// Object keys remain strings even when they contain only decimal digits;
    /// array positions remain integers. This is host-local metadata.
    pub schema_path_segments: Vec<PythonSchemaPathSegment>,
    pub keyword: Option<PyText>,
    pub validator_value: PythonConsumerValue,
    pub params: PythonConsumerValue,
    pub message: PyText,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PythonSchemaPathSegment {
    Key(PyText),
    Index(usize),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PythonSchemaEvaluationMode {
    FirstError,
    AllErrors,
}

#[derive(Clone, Debug)]
pub struct PythonSchemaEvaluation {
    pub errors: Vec<PythonStructuralError>,
    /// Only Python consumer arithmetic failures are deferred by the iterator
    /// compatibility API. Operational failures remain the outer `Err`.
    pub terminal_error: Option<EngineError>,
}

/// Compiled consumer profile backed by source-preserving Python values.
/// Construction is private so an unfinished evaluator cannot be mistaken for
/// a successful schema compilation.
#[derive(Debug)]
pub struct PythonCompiledSchema {
    pub(crate) compiled: Box<crate::schema::CompiledSchema>,
}

impl PythonCompiledSchema {
    pub fn evaluate(
        &self,
        instance: &PythonConsumerValue,
        mode: PythonSchemaEvaluationMode,
        ctx: &mut Context<'_>,
    ) -> Result<PythonSchemaEvaluation, EngineError> {
        if ctx.profile() == crate::context::ResourceProfile::HardIsolated {
            return Err(EngineError::new(
                "RESOURCE_PROFILE_UNAVAILABLE",
                Utf16::default(),
                "The hard-isolated resource profile is not available",
            ));
        }
        instance.admit(ctx)?;
        let mode = match mode {
            PythonSchemaEvaluationMode::FirstError => crate::schema::EvaluationMode::FirstError,
            PythonSchemaEvaluationMode::AllErrors => crate::schema::EvaluationMode::AllErrors,
        };
        let outcome = self
            .compiled
            .evaluate_instance_with_mode(instance, mode, ctx)?;
        let errors = outcome
            .errors
            .into_iter()
            .map(|error| {
                // These are private typed-result copies, not a serialized text
                // boundary. Meter paths and source text before decoding them
                // into Python codepoint buffers.
                let metadata = error.python_error.as_ref();
                let physical_path = error
                    .python_physical_instance_path
                    .as_ref()
                    .unwrap_or(&error.instance_path);
                let validator_len = metadata
                    .and_then(|metadata| metadata.validator.as_ref())
                    .map_or(error.keyword.len(), PyText::len);
                let output_work = (error.instance_path.len() as u64)
                    .saturating_mul(3)
                    .saturating_add((error.schema_path.len() as u64).saturating_mul(3))
                    .saturating_add((physical_path.len() as u64).saturating_mul(3))
                    .saturating_add(validator_len as u64)
                    .saturating_add(error.message.len() as u64)
                    .saturating_add(1);
                ctx.charge_work_u64(output_work, Utf16::default())?;
                let keyword = match metadata {
                    Some(metadata) => metadata.validator.clone(),
                    None => Some(PyText(error.keyword.chars().map(u32::from).collect())),
                };
                let schema_path = python_path_from_internal(&error.schema_path);
                let schema_path_segments =
                    python_schema_path_segments_from_internal(&error.schema_path, ctx)?;
                let validator_value = if let Some(metadata) = metadata {
                    metadata.validator_value.snapshot_with_context(ctx)?
                } else {
                    PythonConsumerValue::Null
                };
                Ok(PythonStructuralError {
                    instance_path: python_path_from_internal(&error.instance_path),
                    physical_instance_path: python_path_from_internal(physical_path),
                    instance_override: if let Some(instance) = error.python_instance_override {
                        Some(instance.snapshot_with_context(ctx)?)
                    } else {
                        None
                    },
                    schema_path,
                    schema_path_segments,
                    keyword,
                    validator_value,
                    params: if let Some(params) = error.python_params {
                        params.as_ref().snapshot_with_context(ctx)?
                    } else {
                        python_from_core_value(&error.params, ctx)?
                    },
                    message: py_text_from_utf16(&error.message),
                })
            })
            .collect::<Result<Vec<_>, EngineError>>()?;
        Ok(PythonSchemaEvaluation {
            errors,
            terminal_error: outcome.terminal_error,
        })
    }

    pub fn validate(
        &self,
        instance: &PythonConsumerValue,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<PythonStructuralError>, EngineError> {
        let outcome = self.evaluate(instance, PythonSchemaEvaluationMode::AllErrors, ctx)?;
        if let Some(error) = outcome.terminal_error {
            return Err(error);
        }
        Ok(outcome.errors)
    }
}

/// Recover typed path tokens from the internal schema pointer. Python object
/// keys are source-marked (`~p`); an unmarked numeric token is an array index.
pub(crate) fn python_schema_path_segments_from_internal(
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Vec<PythonSchemaPathSegment>, EngineError> {
    let units = path.units();
    let pointer_start = if units.first() == Some(&(b'#' as u16)) {
        0
    } else {
        units
            .iter()
            .position(|unit| *unit == b'#' as u16)
            .unwrap_or(units.len())
    };
    if pointer_start == units.len() {
        return Ok(Vec::new());
    }
    let mut at = pointer_start;
    if units.get(at) == Some(&(b'#' as u16)) {
        at += 1;
    }
    if units.get(at) != Some(&(b'/' as u16)) {
        return Ok(Vec::new());
    }
    ctx.charge_work_u64(units.len() as u64 + 1, Utf16::default())?;
    let mut result = Vec::new();
    while at < units.len() {
        if units[at] == b'/' as u16 {
            at += 1;
        }
        let end = units[at..]
            .iter()
            .position(|unit| *unit == b'/' as u16)
            .map_or(units.len(), |offset| at + offset);
        let segment = &units[at..end];
        if segment.starts_with(&[b'~' as u16, b'p' as u16]) && (segment.len() - 2) % 6 == 0 {
            let mut points = Vec::with_capacity((segment.len() - 2) / 6);
            let mut valid = true;
            for chunk in segment[2..].chunks_exact(6) {
                let mut point = 0u32;
                for unit in chunk {
                    let Some(digit) = (match unit {
                        0x30..=0x39 => Some((unit - 0x30) as u32),
                        0x61..=0x66 => Some((unit - 0x61 + 10) as u32),
                        _ => None,
                    }) else {
                        valid = false;
                        break;
                    };
                    point = point * 16 + digit;
                }
                if !valid || point > 0x10ffff {
                    valid = false;
                    break;
                }
                // The fixed-width marker encodes source code points directly;
                // pointer escaping applies only to the display pointer, not a
                // typed Python object-key segment.
                points.push(point);
            }
            if valid {
                result.push(PythonSchemaPathSegment::Key(PyText(points)));
            } else {
                let text = Utf16::new(segment.to_vec());
                result.push(PythonSchemaPathSegment::Key(py_text_from_utf16(&text)));
            }
        } else {
            let mut decoded = Vec::with_capacity(segment.len());
            let mut index = 0;
            while index < segment.len() {
                if segment[index] == b'~' as u16 {
                    match segment.get(index + 1) {
                        Some(0x30) => decoded.push(b'~' as u16),
                        Some(0x31) => decoded.push(b'/' as u16),
                        _ => decoded.push(segment[index]),
                    }
                    index += if matches!(segment.get(index + 1), Some(0x30 | 0x31)) {
                        2
                    } else {
                        1
                    };
                } else {
                    decoded.push(segment[index]);
                    index += 1;
                }
            }
            if !decoded.is_empty() && decoded.iter().all(|unit| (0x30..=0x39).contains(unit)) {
                let mut value = 0usize;
                let mut index = 0;
                while index < decoded.len() {
                    value = value
                        .checked_mul(10)
                        .and_then(|value| value.checked_add((decoded[index] - 0x30) as usize))
                        .ok_or_else(|| {
                            EngineError::new(
                                "LIMIT",
                                Utf16::default(),
                                "Schema path index is too large",
                            )
                        })?;
                    index += 1;
                }
                result.push(PythonSchemaPathSegment::Index(value));
            } else {
                let text = Utf16::new(decoded);
                result.push(PythonSchemaPathSegment::Key(py_text_from_utf16(&text)));
            }
        }
        at = end;
    }
    Ok(result)
}

pub(crate) fn py_text_from_utf16(text: &Utf16) -> PyText {
    PyText(Codepoints::new(InstanceText::Utf16(text)).collect())
}

/// Decode the source-preserving path representation emitted by Python-profile
/// schema evaluation into a JSON Pointer string retaining Python codepoints.
pub fn python_path_from_internal(path: &Utf16) -> PyText {
    fn hex(unit: u16) -> Option<u32> {
        match unit {
            0x30..=0x39 => Some((unit - 0x30) as u32),
            0x61..=0x66 => Some((unit - 0x61 + 10) as u32),
            _ => None,
        }
    }
    let units = path.units();
    let mut output = Vec::new();
    // A schema location may start with an absolute resource URI. Only the
    // fragment (or a root instance pointer) uses our internal pointer marker
    // encoding; resource identifiers are source data and must remain literal.
    let pointer_start =
        if units.first() == Some(&(b'#' as u16)) || units.first() == Some(&(b'/' as u16)) {
            0
        } else {
            units
                .iter()
                .position(|unit| *unit == b'#' as u16)
                .unwrap_or(units.len())
        };
    let prefix = Utf16::new(units[..pointer_start].to_vec());
    output.extend(Codepoints::new(InstanceText::Utf16(&prefix)));
    let mut at = pointer_start;
    if units.get(at) == Some(&(b'#' as u16)) {
        output.push(b'#' as u32);
        at += 1;
    }
    while at < units.len() {
        if units[at] == b'/' as u16 {
            output.push(b'/' as u32);
            at += 1;
        }
        let end = units[at..]
            .iter()
            .position(|unit| *unit == b'/' as u16)
            .map(|offset| at + offset)
            .unwrap_or(units.len());
        let segment = &units[at..end];
        if segment.starts_with(&[b'~' as u16, b'p' as u16]) {
            let encoded = &segment[2..];
            if encoded.len() % 6 == 0 {
                let mut decoded = Vec::new();
                let mut valid = true;
                for encoded_point in encoded.chunks_exact(6) {
                    let parsed = encoded_point.iter().try_fold(0u32, |value, unit| {
                        value.checked_mul(16)?.checked_add(hex(*unit)?)
                    });
                    let Some(point) = parsed else {
                        valid = false;
                        break;
                    };
                    match point {
                        0x7e => decoded.extend([b'~' as u32, b'0' as u32]),
                        0x2f => decoded.extend([b'~' as u32, b'1' as u32]),
                        _ => decoded.push(point),
                    }
                }
                if valid {
                    output.extend(decoded);
                } else {
                    let segment = Utf16::new(segment.to_vec());
                    output.extend(Codepoints::new(InstanceText::Utf16(&segment)));
                }
            } else {
                let segment = Utf16::new(segment.to_vec());
                output.extend(Codepoints::new(InstanceText::Utf16(&segment)));
            }
        } else {
            let segment = Utf16::new(segment.to_vec());
            output.extend(Codepoints::new(InstanceText::Utf16(&segment)));
        }
        at = end;
    }
    PyText(output)
}

pub(crate) fn python_from_core_value(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<PythonConsumerValue, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    Ok(match value {
        Value::Null => PythonConsumerValue::Null,
        Value::Bool(value) => PythonConsumerValue::Bool(*value),
        Value::Number(value) => PythonConsumerValue::Float(value.to_bits()),
        Value::String(value) => PythonConsumerValue::String(py_text_from_utf16(value)),
        Value::Array(values) => PythonConsumerValue::Array(
            values
                .iter()
                .map(|value| python_from_core_value(value, ctx))
                .collect::<Result<_, _>>()?,
        ),
        Value::Object(members) => PythonConsumerValue::Object(
            members
                .iter()
                .map(|(key, value)| {
                    Ok((py_text_from_utf16(key), python_from_core_value(value, ctx)?))
                })
                .collect::<Result<_, EngineError>>()?,
        ),
    })
}

impl PythonConsumerValue {
    pub fn float(value: f64) -> Self {
        Self::Float(value.to_bits())
    }

    pub fn float_value(bits: u64) -> f64 {
        f64::from_bits(bits)
    }

    /// Meter an already-owned source tree and enforce the shared structural
    /// limits. Typed bindings should use the same Context while decoding so a
    /// denied allocation can be rejected before constructing the value.
    pub fn admit(&self, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        fn walk(
            value: &PythonConsumerValue,
            depth: usize,
            count: &mut usize,
            ctx: &mut Context<'_>,
        ) -> Result<(), EngineError> {
            if depth > ctx.limits().max_depth {
                return Err(EngineError::new(
                    "LIMIT",
                    Utf16::default(),
                    "JSON nesting depth exceeded",
                ));
            }
            *count = count.saturating_add(1);
            ctx.charge_work(1, Utf16::default())?;
            match value {
                PythonConsumerValue::String(text) => {
                    ctx.charge_work(text.codepoints().len(), Utf16::default())?;
                }
                PythonConsumerValue::Array(items) => {
                    for item in items {
                        walk(item, depth + 1, count, ctx)?;
                    }
                }
                PythonConsumerValue::Object(members) => {
                    for (key, child) in members {
                        ctx.charge_work(key.codepoints().len(), Utf16::default())?;
                        walk(child, depth + 1, count, ctx)?;
                    }
                }
                _ => {}
            }
            Ok(())
        }
        let mut count = 0usize;
        walk(self, 0, &mut count, ctx)?;
        ctx.check_tree_value_count(count, Utf16::default())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InstanceKind {
    Null,
    Bool,
    Number,
    String,
    Array,
    Object,
}

#[derive(Clone, Copy, Debug)]
pub enum InstanceText<'a> {
    Utf16(&'a Utf16),
    Python(&'a PyText),
}

impl InstanceText<'_> {
    pub fn codepoints(self) -> Vec<u32> {
        Codepoints::new(self).collect()
    }

    pub fn codepoint_len(self) -> usize {
        match self {
            Self::Utf16(text) => {
                let units = text.units();
                let mut index = 0;
                let mut count = 0;
                while index < units.len() {
                    if (0xd800..=0xdbff).contains(&units[index])
                        && index + 1 < units.len()
                        && (0xdc00..=0xdfff).contains(&units[index + 1])
                    {
                        index += 2;
                    } else {
                        index += 1;
                    }
                    count += 1;
                }
                count
            }
            Self::Python(text) => text.len(),
        }
    }

    pub fn equals(self, other: Self) -> bool {
        match (self, other) {
            (Self::Utf16(left), Self::Utf16(right)) => left == right,
            (Self::Python(left), Self::Python(right)) => left == right,
            _ => {
                let mut left = Codepoints::new(self);
                let mut right = Codepoints::new(other);
                loop {
                    match (left.next(), right.next()) {
                        (Some(a), Some(b)) if a == b => continue,
                        (None, None) => return true,
                        _ => return false,
                    }
                }
            }
        }
    }

    pub fn equals_with_context(
        self,
        other: Self,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        ctx.charge_work(
            text_storage_len(self).max(text_storage_len(other)),
            Utf16::default(),
        )?;
        Ok(self.equals(other))
    }

    pub fn to_utf16(self, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        match self {
            Self::Utf16(text) => {
                ctx.charge_work(text.len(), Utf16::default())?;
                Ok(text.clone())
            }
            Self::Python(text) => text.to_utf16(ctx),
        }
    }
}

struct Codepoints<'a> {
    text: InstanceText<'a>,
    offset: usize,
}

impl<'a> Codepoints<'a> {
    fn new(text: InstanceText<'a>) -> Self {
        Self { text, offset: 0 }
    }
}

impl Iterator for Codepoints<'_> {
    type Item = u32;

    fn next(&mut self) -> Option<Self::Item> {
        match self.text {
            InstanceText::Python(text) => {
                let value = *text.codepoints().get(self.offset)?;
                self.offset += 1;
                Some(value)
            }
            InstanceText::Utf16(text) => {
                let units = text.units();
                let first = *units.get(self.offset)? as u32;
                self.offset += 1;
                if (0xd800..=0xdbff).contains(&(first as u16)) {
                    if let Some(second) = units.get(self.offset).copied() {
                        if (0xdc00..=0xdfff).contains(&second) {
                            self.offset += 1;
                            return Some(
                                0x10000 + (((first - 0xd800) << 10) | (second as u32 - 0xdc00)),
                            );
                        }
                    }
                }
                Some(first)
            }
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum InstanceNumber<'a> {
    Core(f64),
    PythonInteger(&'a BigInt),
    PythonFloat(u64),
}

impl InstanceNumber<'_> {
    /// Compare this number to an interoperable binary64 value without
    /// rounding Python integers through `f64`. `None` is the unordered result
    /// for NaN, as required by Python numeric equality and ordering.
    pub fn partial_cmp_f64(
        self,
        other: f64,
        ctx: &mut Context<'_>,
    ) -> Result<Option<std::cmp::Ordering>, EngineError> {
        match self {
            Self::Core(value) => Ok(value.partial_cmp(&other)),
            Self::PythonFloat(bits) => Ok(f64::from_bits(bits).partial_cmp(&other)),
            Self::PythonInteger(value) => compare_bigint_f64(value, other, ctx),
        }
    }

    pub fn equals(self, other: Self, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
        use std::cmp::Ordering::Equal;
        Ok(match (self, other) {
            (Self::Core(left), Self::Core(right)) => left == right,
            (Self::Core(left), Self::PythonInteger(right))
            | (Self::PythonInteger(right), Self::Core(left)) => {
                compare_bigint_f64(right, left, ctx)? == Some(Equal)
            }
            (Self::Core(left), Self::PythonFloat(right))
            | (Self::PythonFloat(right), Self::Core(left)) => left == f64::from_bits(right),
            (Self::PythonInteger(left), Self::PythonInteger(right)) => {
                let left_bytes = left.bits().div_ceil(8).saturating_add(1);
                let right_bytes = right.bits().div_ceil(8).saturating_add(1);
                ctx.charge_work_u64(left_bytes.max(right_bytes), Utf16::default())?;
                left == right
            }
            (Self::PythonFloat(left), Self::PythonFloat(right)) => {
                f64::from_bits(left) == f64::from_bits(right)
            }
            (Self::PythonInteger(integer), Self::PythonFloat(bits))
            | (Self::PythonFloat(bits), Self::PythonInteger(integer)) => {
                compare_bigint_f64(integer, f64::from_bits(bits), ctx)? == Some(Equal)
            }
        })
    }

    pub fn is_integer(self) -> bool {
        match self {
            Self::Core(value) => value.is_finite() && value.fract() == 0.0,
            Self::PythonInteger(_) => true,
            Self::PythonFloat(bits) => {
                let value = f64::from_bits(bits);
                value.is_finite() && value.fract() == 0.0
            }
        }
    }
}

fn compare_bigint_f64(
    integer: &BigInt,
    value: f64,
    ctx: &mut Context<'_>,
) -> Result<Option<std::cmp::Ordering>, EngineError> {
    use std::cmp::Ordering;

    if value.is_nan() {
        return Ok(None);
    }
    if value == f64::INFINITY {
        return Ok(Some(Ordering::Less));
    }
    if value == f64::NEG_INFINITY {
        return Ok(Some(Ordering::Greater));
    }

    let bits = value.to_bits();
    let exponent = ((bits >> 52) & 0x7ff) as i32;
    let exponent2 = if exponent == 0 {
        -1074
    } else {
        exponent - 1023 - 52
    };
    let integer_bytes = integer.bits().div_ceil(8).saturating_add(1);
    let shifted_integer_bytes = if exponent2 < 0 {
        integer_bytes.saturating_add(((-exponent2) as u64).div_ceil(8))
    } else {
        integer_bytes
    };
    // Charge storage for the arbitrary-precision operand and at most 1074
    // shifted bits plus the bounded binary64 significand before constructing
    // either BigInt intermediate.
    ctx.charge_work_u64(
        integer_bytes
            .saturating_add(shifted_integer_bytes)
            .saturating_add(140),
        Utf16::default(),
    )?;

    let negative = bits >> 63 != 0;
    let fraction = bits & ((1u64 << 52) - 1);
    let (significand, exponent2) = if exponent == 0 {
        (fraction, -1074)
    } else {
        ((1u64 << 52) | fraction, exponent - 1023 - 52)
    };
    let mut signed_significand = BigInt::from(significand);
    if negative {
        signed_significand = -signed_significand;
    }

    Ok(if exponent2 >= 0 {
        Some(integer.cmp(&(signed_significand << exponent2 as usize)))
    } else {
        Some((integer << (-exponent2) as usize).cmp(&signed_significand))
    })
}

/// Read-only generic view consumed by the shared schema evaluator. Implementors
/// expose storage directly; the evaluator owns profile-specific text/number
/// comparison and never requires a conversion to `Value`.
pub trait InstanceView: Sized {
    fn kind(&self) -> InstanceKind;
    fn bool_value(&self) -> Option<bool>;
    fn number_value(&self) -> Option<InstanceNumber<'_>>;
    fn text_value(&self) -> Option<InstanceText<'_>>;
    fn array_len(&self) -> Option<usize>;
    fn array_get(&self, index: usize) -> Option<&Self>;
    fn object_len(&self) -> Option<usize>;
    fn object_entry(&self, index: usize) -> Option<(InstanceText<'_>, &Self)>;

    fn python_snapshot(&self, ctx: &mut Context<'_>) -> Result<PythonConsumerValue, EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        Ok(match self.kind() {
            InstanceKind::Null => PythonConsumerValue::Null,
            InstanceKind::Bool => PythonConsumerValue::Bool(self.bool_value().unwrap_or(false)),
            InstanceKind::Number => match self.number_value().expect("number kind") {
                InstanceNumber::Core(value) => PythonConsumerValue::Float(value.to_bits()),
                InstanceNumber::PythonFloat(bits) => PythonConsumerValue::Float(bits),
                InstanceNumber::PythonInteger(value) => {
                    ctx.charge_work_u64(value.bits().saturating_add(7) / 8 + 1, Utf16::default())?;
                    PythonConsumerValue::Integer(value.clone())
                }
            },
            InstanceKind::String => {
                let text = self.text_value().expect("string kind");
                ctx.charge_work(text_storage_len(text), Utf16::default())?;
                PythonConsumerValue::String(PyText::from_codepoints(
                    Codepoints::new(text).collect(),
                )?)
            }
            InstanceKind::Array => {
                let count = self.array_len().unwrap_or(0);
                ctx.charge_work(count, Utf16::default())?;
                let mut values = Vec::with_capacity(count);
                for index in 0..count {
                    if let Some(value) = self.array_get(index) {
                        values.push(value.python_snapshot(ctx)?);
                    }
                }
                PythonConsumerValue::Array(values)
            }
            InstanceKind::Object => {
                let count = self.object_len().unwrap_or(0);
                ctx.charge_work(count, Utf16::default())?;
                let mut values = Vec::with_capacity(count);
                for index in 0..count {
                    if let Some((key, value)) = self.object_entry(index) {
                        ctx.charge_work(text_storage_len(key), Utf16::default())?;
                        let key = PyText::from_codepoints(Codepoints::new(key).collect())?;
                        values.push((key, value.python_snapshot(ctx)?));
                    }
                }
                PythonConsumerValue::Object(values)
            }
        })
    }

    fn object_find(
        &self,
        key: InstanceText<'_>,
        ctx: &mut Context<'_>,
    ) -> Result<Option<&Self>, EngineError> {
        let Some(count) = self.object_len() else {
            return Ok(None);
        };
        for index in 0..count {
            let Some((candidate, value)) = self.object_entry(index) else {
                continue;
            };
            ctx.charge_work(
                text_storage_len(candidate).max(text_storage_len(key)),
                Utf16::default(),
            )?;
            if candidate.equals(key) {
                return Ok(Some(value));
            }
        }
        Ok(None)
    }

    fn text_instance(text: InstanceText<'_>, ctx: &mut Context<'_>) -> Result<Self, EngineError>;
}

pub fn instances_equal<L: InstanceView, R: InstanceView>(
    left: &L,
    right: &R,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match (left.kind(), right.kind()) {
        (InstanceKind::Null, InstanceKind::Null) => Ok(true),
        (InstanceKind::Bool, InstanceKind::Bool) => Ok(left.bool_value() == right.bool_value()),
        (InstanceKind::Number, InstanceKind::Number) => {
            Ok(match (left.number_value(), right.number_value()) {
                (Some(a), Some(b)) => a.equals(b, ctx)?,
                _ => false,
            })
        }
        (InstanceKind::String, InstanceKind::String) => {
            let a = left.text_value().expect("string kind has text");
            let b = right.text_value().expect("string kind has text");
            a.equals_with_context(b, ctx)
        }
        (InstanceKind::Array, InstanceKind::Array) => {
            let Some(count) = left.array_len() else {
                return Ok(false);
            };
            if right.array_len() != Some(count) {
                return Ok(false);
            }
            for index in 0..count {
                let (Some(a), Some(b)) = (left.array_get(index), right.array_get(index)) else {
                    return Ok(false);
                };
                if !instances_equal(a, b, ctx)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        (InstanceKind::Object, InstanceKind::Object) => {
            let Some(count) = left.object_len() else {
                return Ok(false);
            };
            if right.object_len() != Some(count) {
                return Ok(false);
            }
            for index in 0..count {
                let Some((key, a)) = left.object_entry(index) else {
                    return Ok(false);
                };
                let Some(b) = right.object_find(key, ctx)? else {
                    return Ok(false);
                };
                if !instances_equal(a, b, ctx)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        _ => Ok(false),
    }
}

fn text_storage_len(text: InstanceText<'_>) -> usize {
    match text {
        InstanceText::Utf16(value) => value.len(),
        InstanceText::Python(value) => value.len(),
    }
}

/// JSON equality between a schema const/enum member and an instance in either
/// the interoperable UMF representation or source-preserving Python form.
pub fn value_equals_instance<T: InstanceView>(
    expected: &Value,
    actual: &T,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match (expected, actual.kind()) {
        (Value::Null, InstanceKind::Null) => Ok(true),
        (Value::Bool(left), InstanceKind::Bool) => Ok(actual.bool_value() == Some(*left)),
        (Value::Number(left), InstanceKind::Number) => match actual.number_value() {
            Some(InstanceNumber::Core(value)) => Ok(*left == value),
            Some(InstanceNumber::PythonInteger(value)) => {
                Ok(compare_bigint_f64(value, *left, ctx)? == Some(std::cmp::Ordering::Equal))
            }
            Some(InstanceNumber::PythonFloat(bits)) => Ok(*left == f64::from_bits(bits)),
            None => Ok(false),
        },
        (Value::String(left), InstanceKind::String) => {
            let right = actual.text_value().expect("kind and text accessor agree");
            InstanceText::Utf16(left).equals_with_context(right, ctx)
        }
        (Value::Array(left), InstanceKind::Array) => {
            if actual.array_len() != Some(left.len()) {
                return Ok(false);
            }
            for (index, expected) in left.iter().enumerate() {
                let Some(actual) = actual.array_get(index) else {
                    return Ok(false);
                };
                if !value_equals_instance(expected, actual, ctx)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        (Value::Object(left), InstanceKind::Object) => {
            if actual.object_len() != Some(left.len()) {
                return Ok(false);
            }
            for (key, expected) in left {
                let Some(value) = actual.object_find(InstanceText::Utf16(key), ctx)? else {
                    return Ok(false);
                };
                if !value_equals_instance(expected, value, ctx)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        _ => Ok(false),
    }
}

impl InstanceView for Value {
    fn kind(&self) -> InstanceKind {
        match self {
            Value::Null => InstanceKind::Null,
            Value::Bool(_) => InstanceKind::Bool,
            Value::Number(_) => InstanceKind::Number,
            Value::String(_) => InstanceKind::String,
            Value::Array(_) => InstanceKind::Array,
            Value::Object(_) => InstanceKind::Object,
        }
    }
    fn bool_value(&self) -> Option<bool> {
        if let Value::Bool(value) = self {
            Some(*value)
        } else {
            None
        }
    }
    fn number_value(&self) -> Option<InstanceNumber<'_>> {
        if let Value::Number(value) = self {
            Some(InstanceNumber::Core(*value))
        } else {
            None
        }
    }
    fn text_value(&self) -> Option<InstanceText<'_>> {
        if let Value::String(value) = self {
            Some(InstanceText::Utf16(value))
        } else {
            None
        }
    }
    fn array_len(&self) -> Option<usize> {
        if let Value::Array(value) = self {
            Some(value.len())
        } else {
            None
        }
    }
    fn array_get(&self, index: usize) -> Option<&Self> {
        if let Value::Array(value) = self {
            value.get(index)
        } else {
            None
        }
    }
    fn object_len(&self) -> Option<usize> {
        if let Value::Object(value) = self {
            Some(value.len())
        } else {
            None
        }
    }
    fn object_entry(&self, index: usize) -> Option<(InstanceText<'_>, &Self)> {
        if let Value::Object(value) = self {
            value
                .get(index)
                .map(|(key, value)| (InstanceText::Utf16(key), value))
        } else {
            None
        }
    }
    fn text_instance(text: InstanceText<'_>, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        Ok(Value::String(text.to_utf16(ctx)?))
    }
}

impl InstanceView for PythonConsumerValue {
    fn kind(&self) -> InstanceKind {
        match self {
            Self::Null => InstanceKind::Null,
            Self::Bool(_) => InstanceKind::Bool,
            Self::Integer(_) | Self::Float(_) => InstanceKind::Number,
            Self::String(_) => InstanceKind::String,
            Self::Array(_) => InstanceKind::Array,
            Self::Object(_) => InstanceKind::Object,
        }
    }
    fn bool_value(&self) -> Option<bool> {
        if let Self::Bool(value) = self {
            Some(*value)
        } else {
            None
        }
    }
    fn number_value(&self) -> Option<InstanceNumber<'_>> {
        match self {
            Self::Integer(value) => Some(InstanceNumber::PythonInteger(value)),
            Self::Float(bits) => Some(InstanceNumber::PythonFloat(*bits)),
            _ => None,
        }
    }
    fn text_value(&self) -> Option<InstanceText<'_>> {
        if let Self::String(value) = self {
            Some(InstanceText::Python(value))
        } else {
            None
        }
    }
    fn array_len(&self) -> Option<usize> {
        if let Self::Array(value) = self {
            Some(value.len())
        } else {
            None
        }
    }
    fn array_get(&self, index: usize) -> Option<&Self> {
        if let Self::Array(value) = self {
            value.get(index)
        } else {
            None
        }
    }
    fn object_len(&self) -> Option<usize> {
        if let Self::Object(value) = self {
            Some(value.len())
        } else {
            None
        }
    }
    fn object_entry(&self, index: usize) -> Option<(InstanceText<'_>, &Self)> {
        if let Self::Object(value) = self {
            value
                .get(index)
                .map(|(key, value)| (InstanceText::Python(key), value))
        } else {
            None
        }
    }
    fn text_instance(text: InstanceText<'_>, _ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        let points = Codepoints::new(text).collect();
        Ok(Self::String(PyText::from_codepoints(points)?))
    }
    fn python_snapshot(&self, ctx: &mut Context<'_>) -> Result<PythonConsumerValue, EngineError> {
        self.snapshot_with_context(ctx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_path_decoder_only_decodes_pointer_fragment_not_resource_uri() {
        let path = Utf16::from("https://example.test/~p000061/resource#/$defs/~p00d83d00de00");
        let decoded = python_path_from_internal(&path);
        assert_eq!(
            decoded.codepoints(),
            "https://example.test/~p000061/resource#/$defs/😀"
                .encode_utf16()
                .map(u32::from)
                .collect::<Vec<_>>()
        );
        assert_eq!(decoded.codepoints().last(), Some(&0xde00));
        assert!(decoded.codepoints().ends_with(&[0xd83d, 0xde00]));
    }

    #[test]
    fn typed_schema_key_segments_keep_raw_pointer_metacharacters() {
        let path = Utf16::from("#/properties/~p00006100002f00007e000063/type");
        let mut ctx = Context::ordinary();
        let segments = python_schema_path_segments_from_internal(&path, &mut ctx).unwrap();
        assert_eq!(
            segments,
            vec![
                PythonSchemaPathSegment::Key(PyText::from_utf8("properties")),
                PythonSchemaPathSegment::Key(
                    PyText::from_codepoints(vec![
                        b'a' as u32,
                        b'/' as u32,
                        b'~' as u32,
                        b'c' as u32,
                    ])
                    .unwrap()
                ),
                PythonSchemaPathSegment::Key(PyText::from_utf8("type")),
            ],
        );
    }

    #[test]
    fn python_codepoints_preserve_surrogate_pair_distinction_from_astral_scalar() {
        let scalar = PyText::from_codepoints(vec![0x1f600]).unwrap();
        let pair = PyText::from_codepoints(vec![0xd83d, 0xde00]).unwrap();
        let core_astral = Utf16::from("😀");
        let core_pair = Utf16::new(vec![0xd83d, 0xde00]);

        let mut ctx = Context::ordinary();
        assert!(
            InstanceText::Python(&scalar)
                .equals_with_context(InstanceText::Utf16(&core_astral), &mut ctx)
                .unwrap()
        );
        assert!(
            !InstanceText::Python(&pair)
                .equals_with_context(InstanceText::Utf16(&core_pair), &mut ctx)
                .unwrap()
        );
        assert_eq!(InstanceText::Python(&pair).codepoint_len(), 2);
        assert_eq!(InstanceText::Utf16(&core_pair).codepoint_len(), 1);
    }

    #[test]
    fn python_numbers_keep_integer_and_float_kinds() {
        let integer = PythonConsumerValue::Integer(BigInt::from(1));
        let float = PythonConsumerValue::float(1.0);
        assert!(matches!(
            integer.number_value(),
            Some(InstanceNumber::PythonInteger(_))
        ));
        assert!(
            matches!(float.number_value(), Some(InstanceNumber::PythonFloat(bits)) if f64::from_bits(bits) == 1.0)
        );
    }

    #[test]
    fn exact_python_integer_float_comparison_does_not_round_large_integers() {
        use std::cmp::Ordering;

        let exact = BigInt::from(1u8) << 53usize;
        let next = &exact + 1u8;
        let mut ctx = Context::ordinary();
        assert_eq!(
            compare_bigint_f64(&exact, 9_007_199_254_740_992.0, &mut ctx).unwrap(),
            Some(Ordering::Equal)
        );
        assert_eq!(
            compare_bigint_f64(&next, 9_007_199_254_740_992.0, &mut ctx).unwrap(),
            Some(Ordering::Greater)
        );
        assert_eq!(
            compare_bigint_f64(&BigInt::from(-1), -0.5, &mut ctx).unwrap(),
            Some(Ordering::Less)
        );
        assert_eq!(
            compare_bigint_f64(&BigInt::from(0), f64::NAN, &mut ctx).unwrap(),
            None
        );
    }

    #[test]
    fn arbitrary_numeric_and_object_comparisons_propagate_meter_refusal() {
        let huge = PythonConsumerValue::Integer(BigInt::from(1u8) << 4096usize);
        let mut deny_large = |units: usize| {
            if units > 64 {
                Err(EngineError::new(
                    "METER_FAILURE",
                    Utf16::default(),
                    "denied",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut deny_large);
        let number_error = value_equals_instance(&Value::Number(0.5), &huge, &mut ctx).unwrap_err();
        assert_eq!(number_error.code, "METER_FAILURE");

        let key = PyText::from_codepoints(vec![b'a' as u32; 256]).unwrap();
        let object = PythonConsumerValue::Object(vec![(key, PythonConsumerValue::Null)]);
        let search = PyText::from_codepoints(vec![b'a' as u32; 256]).unwrap();
        let object_error = object
            .object_find(InstanceText::Python(&search), &mut ctx)
            .unwrap_err();
        assert_eq!(object_error.code, "METER_FAILURE");
    }

    #[test]
    fn schema_constant_equality_keeps_python_text_and_number_semantics() {
        let mut context = Context::ordinary();
        let one = PythonConsumerValue::Integer(BigInt::from(1));
        let astral = PythonConsumerValue::String(PyText::from_codepoints(vec![0x1f600]).unwrap());
        let explicit_pair =
            PythonConsumerValue::String(PyText::from_codepoints(vec![0xd83d, 0xde00]).unwrap());
        assert!(value_equals_instance(&Value::Number(1.0), &one, &mut context,).unwrap());
        assert!(
            value_equals_instance(&Value::String(Utf16::from("😀")), &astral, &mut context,)
                .unwrap()
        );
        assert!(
            !value_equals_instance(
                &Value::String(Utf16::from("😀")),
                &explicit_pair,
                &mut context,
            )
            .unwrap()
        );
    }
}

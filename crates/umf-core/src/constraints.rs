// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{
    context::Context,
    ecma_coercion::{abstract_relational_compare, Primitive},
    error::{Diagnostic, EngineError, Severity},
    literal::{literal_errors_admitted, literal_identity_admitted, numeric_interval_admitted},
    literal_policy::{prepare_policy, PreparedPolicy},
    value::{copy_json, Utf16, Value},
};
use std::{cell::RefCell, cmp::Ordering, rc::Rc};

#[derive(Clone, Debug)]
pub struct PreparedProgram(Value);
impl PreparedProgram {
    pub fn value(&self) -> &Value {
        &self.0
    }
}
#[derive(Clone, Debug)]
enum Runtime {
    Json(Value),
    Array(Vec<Runtime>),
    Object(Vec<(Utf16, Runtime)>),
    CopiedObject(Vec<(Utf16, Runtime)>),
    Text {
        value: Utf16,
        python_origin: Option<crate::python_value::PyText>,
        python_source_path: bool,
    },
    Missing,
    Map(Rc<RefCell<Vec<(Vec<u16>, Runtime)>>>),
}
type Env = Vec<(Utf16, Rc<Runtime>)>;
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn get_key<'a>(v: &'a Value, name: &Utf16) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(x, _)| x == name).map(|(_, v)| v),
        _ => None,
    }
}
fn utf16(v: &Value) -> Option<Utf16> {
    match v {
        Value::String(s) => Some(s.clone()),
        _ => None,
    }
}
fn txt(v: &Value) -> Option<String> {
    utf16(v)?.to_utf8().ok()
}
fn arr(v: &Value) -> Option<&[Value]> {
    match v {
        Value::Array(a) => Some(a),
        _ => None,
    }
}
fn obj(v: &Value) -> Option<&[(Utf16, Value)]> {
    match v {
        Value::Object(m) => Some(m),
        _ => None,
    }
}
fn err(code: &str, msg: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), msg)
}
fn compare_utf16_metered(
    left: &Utf16,
    right: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Ordering, EngineError> {
    // Admit the largest possible shared-prefix scan before `cmp` examines it.
    ctx.charge_work(
        left.len().min(right.len()).saturating_add(1),
        Utf16::default(),
    )?;
    Ok(left.cmp(right))
}
fn contains_utf16_metered(
    values: &[Utf16],
    target: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    for value in values {
        if compare_utf16_metered(value, target, ctx)? == Ordering::Equal {
            return Ok(true);
        }
    }
    Ok(false)
}
fn find_map_value_metered<'a>(
    entries: &'a [(Vec<u16>, Runtime)],
    target: &[u16],
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Runtime>, EngineError> {
    for (key, value) in entries {
        ctx.charge_work(1, Utf16::default())?;
        ctx.charge_work(
            key.len().min(target.len()).saturating_add(1),
            Utf16::default(),
        )?;
        if key == target {
            return Ok(Some(value));
        }
    }
    Ok(None)
}
fn contains_map_key_metered(
    entries: &[(Vec<u16>, Runtime)],
    target: &[u16],
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    Ok(find_map_value_metered(entries, target, ctx)?.is_some())
}
fn find_map_value_index_metered(
    entries: &[(Vec<u16>, Runtime)],
    target: &[u16],
    ctx: &mut Context<'_>,
) -> Result<Option<usize>, EngineError> {
    for (index, (key, _)) in entries.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        ctx.charge_work(
            key.len().min(target.len()).saturating_add(1),
            Utf16::default(),
        )?;
        if key == target {
            return Ok(Some(index));
        }
    }
    Ok(None)
}
fn find_runtime_key_metered(
    entries: &[(Utf16, Runtime)],
    target: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<usize>, EngineError> {
    for (index, (key, _)) in entries.iter().enumerate() {
        if compare_utf16_metered(key, target, ctx)? == Ordering::Equal {
            return Ok(Some(index));
        }
    }
    Ok(None)
}
fn find_env_key_metered(
    entries: &[(Utf16, Rc<Runtime>)],
    target: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<usize>, EngineError> {
    for index in (0..entries.len()).rev() {
        if compare_utf16_metered(&entries[index].0, target, ctx)? == Ordering::Equal {
            return Ok(Some(index));
        }
    }
    Ok(None)
}
pub fn prepare_program(
    input: &Value,
    ctx: &mut Context<'_>,
) -> Result<PreparedProgram, EngineError> {
    let value = copy_json(input, ctx)?;
    crate::constraint_language::check_program(&value, ctx)?;
    Ok(PreparedProgram(value))
}
pub fn check_program(input: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    crate::constraint_language::check_program(input, ctx)
}
fn canonical_cost(v: &Value) -> usize {
    match v {
        Value::Null => 4,
        Value::Bool(false) => 5,
        Value::Bool(true) => 4,
        Value::Number(n) => crate::ecma_number_to_string(*n).encode_utf16().count(),
        Value::String(s) => s.len().saturating_mul(6).saturating_add(2),
        Value::Array(items) => 2usize
            .saturating_add(items.len().saturating_sub(1))
            .saturating_add(
                items
                    .iter()
                    .map(canonical_cost)
                    .fold(0usize, usize::saturating_add),
            ),
        Value::Object(items) => 3usize
            .saturating_add(items.len().saturating_sub(1))
            .saturating_add(items.iter().fold(0usize, |total, (key, value)| {
                total
                    .saturating_add(key.len().saturating_mul(6).saturating_add(2))
                    .saturating_add(1)
                    .saturating_add(canonical_cost(value))
            })),
    }
}
fn escaped_into(s: &Utf16, out: &mut Vec<u16>) {
    out.push(34);
    let u = s.units();
    let mut i = 0;
    while i < u.len() {
        let c = u[i];
        match c {
            34 => out.extend([92, 34]),
            92 => out.extend([92, 92]),
            8 => out.extend([92, 98]),
            9 => out.extend([92, 116]),
            10 => out.extend([92, 110]),
            12 => out.extend([92, 102]),
            13 => out.extend([92, 114]),
            0..=31 => {
                out.extend([92, 117]);
                out.extend(format!("{c:04x}").encode_utf16());
            }
            0xd800..=0xdbff if i + 1 < u.len() && (0xdc00..=0xdfff).contains(&u[i + 1]) => {
                out.extend([c, u[i + 1]]);
                i += 1;
            }
            0xd800..=0xdfff => {
                out.extend([92, 117]);
                out.extend(format!("{c:04x}").encode_utf16());
            }
            _ => out.push(c),
        }
        i += 1;
    }
    out.push(34);
}
fn canonical_into(v: &Value, out: &mut Vec<u16>, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    match v {
        Value::Null => out.extend("null".encode_utf16()),
        Value::Bool(b) => out.extend(if *b { "true" } else { "false" }.encode_utf16()),
        Value::Number(n) => out.extend(crate::ecma_number_to_string(*n).encode_utf16()),
        Value::String(s) => escaped_into(s, out),
        Value::Array(items) => {
            out.extend("a[".encode_utf16());
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(44);
                }
                canonical_into(item, out, ctx)?;
            }
            out.push(93);
        }
        Value::Object(items) => {
            out.extend("o{".encode_utf16());
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut sorted = items.iter().collect::<Vec<_>>();
            let mut comparison_error = None;
            sorted.sort_by(|(left, _), (right, _)| {
                if comparison_error.is_some() {
                    return Ordering::Equal;
                }
                match compare_utf16_metered(left, right, ctx) {
                    Ok(order) => order,
                    Err(error) => {
                        comparison_error = Some(error);
                        Ordering::Equal
                    }
                }
            });
            if let Some(error) = comparison_error {
                return Err(error);
            }
            for (i, (key, value)) in sorted.into_iter().enumerate() {
                if i > 0 {
                    out.push(44);
                }
                escaped_into(key, out);
                out.push(58);
                canonical_into(value, out, ctx)?;
            }
            out.push(125);
        }
    }
    Ok(())
}
fn canonical(v: &Value, ctx: &mut Context<'_>) -> Result<Vec<u16>, EngineError> {
    charge_tree(v, ctx)?;
    let cost = canonical_cost(v);
    // Canonical serialization is an interpreter-private working buffer. Its
    // conservative capacity estimate may exceed its actual UTF-16 length.
    ctx.charge_work(cost, Utf16::default())?;
    let mut out = Vec::with_capacity(cost);
    canonical_into(v, &mut out, ctx)?;
    Ok(out)
}
fn canonical_text(value: &Utf16, ctx: &mut Context<'_>) -> Result<Vec<u16>, EngineError> {
    let cost = value.len().saturating_mul(6).saturating_add(2);
    // The UTF-16 and Python-origin sinks are both materialized by callers.
    ctx.charge_work(cost.saturating_mul(2), Utf16::default())?;
    let mut out = Vec::with_capacity(cost);
    escaped_into(value, &mut out);
    Ok(out)
}

/// JavaScript JSON canonicalization over interpreter values. Undefined is
/// omitted by Array#join, interpolates as "undefined" in object fields, and
/// remains undefined at the top level. Maps have no enumerable own keys.
fn canonical_runtime(
    value: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<Option<(Vec<u16>, crate::python_value::PyText)>, EngineError> {
    fn append_units(units: &[u16], out: &mut Vec<u16>, points: &mut Vec<u32>) {
        out.extend_from_slice(units);
        points.extend(char::decode_utf16(units.iter().copied()).map(|item| {
            item.map(|character| character as u32)
                .unwrap_or_else(|error| error.unpaired_surrogate() as u32)
        }));
    }
    fn push_ascii(value: &str, out: &mut Vec<u16>, points: &mut Vec<u32>) {
        out.extend(value.encode_utf16());
        points.extend(value.bytes().map(u32::from));
    }
    fn append_python_text(
        value: &crate::python_value::PyText,
        out: &mut Vec<u16>,
        points: &mut Vec<u32>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let units_len = value.utf16_unit_len();
        ctx.charge_work(
            units_len.saturating_mul(12).saturating_add(4),
            Utf16::default(),
        )?;
        out.push(34);
        points.push(34);
        let source = value.codepoints();
        let mut index = 0;
        while index < source.len() {
            let point = source[index];
            match point {
                34 => {
                    out.extend([92, 34]);
                    points.extend([92, 34]);
                }
                92 => {
                    out.extend([92, 92]);
                    points.extend([92, 92]);
                }
                8 => {
                    out.extend([92, 98]);
                    points.extend([92, 98]);
                }
                9 => {
                    out.extend([92, 116]);
                    points.extend([92, 116]);
                }
                10 => {
                    out.extend([92, 110]);
                    points.extend([92, 110]);
                }
                12 => {
                    out.extend([92, 102]);
                    points.extend([92, 102]);
                }
                13 => {
                    out.extend([92, 114]);
                    points.extend([92, 114]);
                }
                0..=31 => {
                    let escaped = format!("\\u{point:04x}");
                    out.extend(escaped.encode_utf16());
                    points.extend(escaped.bytes().map(u32::from));
                }
                0xd800..=0xdbff
                    if source
                        .get(index + 1)
                        .is_some_and(|next| (0xdc00..=0xdfff).contains(next)) =>
                {
                    out.extend([point as u16, source[index + 1] as u16]);
                    points.extend([point, source[index + 1]]);
                    index += 1;
                }
                0xd800..=0xdfff => {
                    let escaped = format!("\\u{point:04x}");
                    out.extend(escaped.encode_utf16());
                    points.extend(escaped.bytes().map(u32::from));
                }
                0x10000..=0x10ffff => {
                    let scalar = point - 0x10000;
                    out.extend([
                        ((scalar >> 10) + 0xd800) as u16,
                        ((scalar & 0x3ff) + 0xdc00) as u16,
                    ]);
                    points.push(point);
                }
                _ => {
                    out.push(point as u16);
                    points.push(point);
                }
            }
            index += 1;
        }
        out.push(34);
        points.push(34);
        Ok(())
    }
    fn append(
        value: &Runtime,
        out: &mut Vec<u16>,
        points: &mut Vec<u32>,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        match value {
            Runtime::Missing => Ok(false),
            Runtime::Json(value) => {
                let encoded = canonical(value, ctx)?;
                ctx.charge_work(encoded.len(), Utf16::default())?;
                append_units(&encoded, out, points);
                Ok(true)
            }
            Runtime::Text {
                value: units,
                python_source_path: true,
                python_origin,
            } => {
                if let Some(origin) = python_origin {
                    append_python_text(origin, out, points, ctx)?;
                } else {
                    ctx.charge_work(units.len(), Utf16::default())?;
                    let origin = crate::python_value::python_path_from_internal(units);
                    append_python_text(&origin, out, points, ctx)?;
                }
                Ok(true)
            }
            Runtime::Text {
                value: _,
                python_origin: Some(origin),
                ..
            } => {
                append_python_text(origin, out, points, ctx)?;
                Ok(true)
            }
            Runtime::Text { value, .. } => {
                let encoded = canonical_text(value, ctx)?;
                append_units(&encoded, out, points);
                Ok(true)
            }
            Runtime::Map(_) => {
                ctx.charge_work(3, Utf16::default())?;
                push_ascii("o{}", out, points);
                Ok(true)
            }
            Runtime::Array(items) => {
                ctx.charge_work(3usize.saturating_add(items.len()), Utf16::default())?;
                push_ascii("a[", out, points);
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        out.push(',' as u16);
                        points.push(',' as u32);
                    }
                    // canonicalJson(undefined) is undefined, and joining an
                    // array turns that element into the empty string.
                    if !matches!(item, Runtime::Missing) {
                        let _ = append(item, out, points, ctx)?;
                    }
                }
                out.push(']' as u16);
                points.push(']' as u32);
                Ok(true)
            }
            Runtime::Object(items) | Runtime::CopiedObject(items) => {
                ctx.charge_work(3usize.saturating_add(items.len()), Utf16::default())?;
                push_ascii("o{", out, points);
                ctx.charge_work(items.len(), Utf16::default())?;
                let mut members = items.iter().collect::<Vec<_>>();
                let mut comparison_error = None;
                members.sort_by(|(left, _), (right, _)| {
                    if comparison_error.is_some() {
                        return Ordering::Equal;
                    }
                    // Pre-admit a safe upper bound before `cmp` scans any
                    // units. The actual shared-prefix length is not known
                    // until after that work has already happened.
                    let cost = left.len().min(right.len()).saturating_add(1);
                    if let Err(error) = ctx.charge_work(cost, Utf16::default()) {
                        comparison_error = Some(error);
                        Ordering::Equal
                    } else {
                        left.cmp(right)
                    }
                });
                if let Some(error) = comparison_error {
                    return Err(error);
                }
                for (index, (key, item)) in members.into_iter().enumerate() {
                    if index > 0 {
                        out.push(',' as u16);
                        points.push(',' as u32);
                    }
                    let encoded_key = canonical_text(key, ctx)?;
                    append_units(&encoded_key, out, points);
                    out.push(':' as u16);
                    points.push(':' as u32);
                    if !append(item, out, points, ctx)? {
                        // The source canonicalizer concatenates this result
                        // into a string, coercing undefined to this spelling.
                        ctx.charge_work(9, Utf16::default())?;
                        push_ascii("undefined", out, points);
                    }
                }
                out.push('}' as u16);
                points.push('}' as u32);
                Ok(true)
            }
        }
    }

    let mut out = Vec::new();
    let mut points = Vec::new();
    if append(value, &mut out, &mut points, ctx)? {
        Ok(Some((
            out,
            crate::python_value::PyText::from_codepoints(points).map_err(|_| {
                EngineError::new(
                    "PYTHON_VALUE_INVALID",
                    Utf16::default(),
                    "Invalid canonical text",
                )
            })?,
        )))
    } else {
        Ok(None)
    }
}

fn runtime_object(diagnostic: &Diagnostic, ctx: &mut Context<'_>) -> Result<Runtime, EngineError> {
    ctx.charge_work(diagnostic_cost(diagnostic), diagnostic.path.clone())?;
    Ok(Runtime::Object(vec![
        (
            k("code"),
            Runtime::Text {
                value: diagnostic.code.clone(),
                python_origin: diagnostic_text_origin(diagnostic, "code").cloned(),
                python_source_path: false,
            },
        ),
        (
            k("path"),
            Runtime::Text {
                value: diagnostic.path.clone(),
                python_origin: diagnostic_text_origin(diagnostic, "path").cloned(),
                python_source_path: diagnostic.python_source_path,
            },
        ),
        (
            k("message"),
            Runtime::Text {
                value: diagnostic.message.clone(),
                python_origin: diagnostic_text_origin(diagnostic, "message").cloned(),
                python_source_path: false,
            },
        ),
        (
            k("severity"),
            Runtime::Text {
                value: Utf16::from(if diagnostic.severity == Severity::Error {
                    "error"
                } else {
                    "warning"
                }),
                python_origin: None,
                python_source_path: false,
            },
        ),
    ]))
}
fn runtime_diagnostics(
    diagnostics: &[Diagnostic],
    ctx: &mut Context<'_>,
) -> Result<Runtime, EngineError> {
    ctx.charge_work(diagnostics.len(), Utf16::default())?;
    let mut values = Vec::with_capacity(diagnostics.len());
    for diagnostic in diagnostics {
        values.push(runtime_object(diagnostic, ctx)?);
    }
    Ok(Runtime::Array(values))
}
fn diagnostic_text_origin<'a>(
    diagnostic: &'a Diagnostic,
    field: &str,
) -> Option<&'a crate::python_value::PyText> {
    diagnostic
        .python_text_origin
        .as_ref()
        .and_then(|origin| match field {
            "code" => origin.code.as_ref(),
            "path" => origin.path.as_ref(),
            "message" => origin.message.as_ref(),
            _ => None,
        })
}
fn diagnostic_cost(diagnostic: &Diagnostic) -> usize {
    let base = 4usize
        .saturating_add(diagnostic.code.len())
        .saturating_add(diagnostic.path.len())
        .saturating_add(diagnostic.message.len())
        .saturating_add(4 + 1 + 4 + 1 + 7 + 1 + 8);
    diagnostic
        .python_text_origin
        .as_ref()
        .map(|origin| {
            base.saturating_add(
                [&origin.code, &origin.path, &origin.message]
                    .into_iter()
                    .flatten()
                    .map(crate::python_value::PyText::utf16_unit_len)
                    .sum::<usize>(),
            )
        })
        .unwrap_or(base)
}
fn runtime_copy(v: &Runtime, ctx: &mut Context<'_>) -> Result<Runtime, EngineError> {
    Ok(match v {
        Runtime::Json(value) => Runtime::Json(clone_private(value, ctx)?),
        Runtime::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            Runtime::Array(
                items
                    .iter()
                    .map(|item| runtime_copy(item, ctx))
                    .collect::<Result<_, _>>()?,
            )
        }
        Runtime::Object(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut result = Vec::with_capacity(items.len());
            for (key, item) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                result.push((key.clone(), runtime_copy(item, ctx)?));
            }
            Runtime::Object(result)
        }
        Runtime::CopiedObject(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut result = Vec::with_capacity(items.len());
            for (key, item) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                result.push((key.clone(), runtime_copy(item, ctx)?));
            }
            Runtime::CopiedObject(result)
        }
        Runtime::Text {
            value,
            python_origin,
            python_source_path,
        } => {
            let cost = value.len().saturating_add(
                python_origin
                    .as_ref()
                    .map(crate::python_value::PyText::utf16_unit_len)
                    .unwrap_or(0),
            );
            ctx.charge_work(cost, Utf16::default())?;
            Runtime::Text {
                value: value.clone(),
                python_origin: python_origin.clone(),
                python_source_path: *python_source_path,
            }
        }
        Runtime::Missing => Runtime::Missing,
        Runtime::Map(map) => Runtime::Map(map.clone()),
    })
}
fn clone_env(env: &Env, ctx: &mut Context<'_>) -> Result<Env, EngineError> {
    // Admit all slot, name-unit, and Rc-handle copies before growing the new
    // environment. Runtime trees remain immutable and shared between scopes.
    ctx.charge_work(env.len(), Utf16::default())?;
    let work = env.iter().fold(env.len(), |total, (name, _)| {
        total.saturating_add(name.len())
    });
    ctx.charge_work(work, Utf16::default())?;
    let mut copy = Vec::with_capacity(env.len());
    for (name, value) in env {
        // Keep cooperative host checks responsive even after the upfront charge.
        ctx.charge_work(0, Utf16::default())?;
        copy.push((name.clone(), Rc::clone(value)));
    }
    Ok(copy)
}
fn runtime_json_copy(v: &Runtime, ctx: &mut Context<'_>) -> Result<Option<Value>, EngineError> {
    match v {
        Runtime::Json(value) => Ok(Some(clone_private(value, ctx)?)),
        Runtime::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            Ok(Some(Value::Array(
                items
                    .iter()
                    .map(|item| as_json(item, ctx))
                    .collect::<Result<_, _>>()?,
            )))
        }
        Runtime::Object(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut values = Vec::with_capacity(items.len());
            for (key, item) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                values.push((key.clone(), as_json(item, ctx)?));
            }
            Ok(Some(Value::Object(values)))
        }
        Runtime::CopiedObject(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut values = Vec::with_capacity(items.len());
            for (key, item) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                values.push((key.clone(), as_json(item, ctx)?));
            }
            Ok(Some(Value::Object(values)))
        }
        Runtime::Text { value, .. } => {
            let origin_cost = match v {
                Runtime::Text { python_origin, .. } => python_origin
                    .as_ref()
                    .map(crate::python_value::PyText::utf16_unit_len)
                    .unwrap_or(0),
                _ => 0,
            };
            ctx.charge_work(value.len().saturating_add(origin_cost), Utf16::default())?;
            Ok(Some(Value::String(value.clone())))
        }
        _ => Ok(None),
    }
}
fn truth(v: &Runtime) -> bool {
    match v {
        Runtime::Missing => false,
        Runtime::Map(_) => true,
        Runtime::Text { value, .. } => !value.is_empty(),
        Runtime::Array(_) | Runtime::Object(_) | Runtime::CopiedObject(_) => true,
        Runtime::Json(Value::Null) => false,
        Runtime::Json(Value::Bool(b)) => *b,
        Runtime::Json(Value::Number(n)) => *n != 0.0 && !n.is_nan(),
        Runtime::Json(Value::String(s)) => !s.is_empty(),
        Runtime::Json(Value::Array(_) | Value::Object(_)) => true,
    }
}
fn runtime_text_codepoint_origin(
    value: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<Vec<u32>, EngineError> {
    fn append_units(
        units: &[u16],
        out: &mut Vec<u32>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(units.len(), Utf16::default())?;
        out.extend(char::decode_utf16(units.iter().copied()).map(|item| {
            item.map(|character| character as u32)
                .unwrap_or_else(|error| error.unpaired_surrogate() as u32)
        }));
        Ok(())
    }
    fn append_value(
        value: &Value,
        out: &mut Vec<u32>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        match value {
            Value::Null => out.extend("null".chars().map(|character| character as u32)),
            Value::Bool(value) => out.extend(value.to_string().chars().map(|c| c as u32)),
            Value::Number(value) => out.extend(
                crate::ecma_number_to_string(*value)
                    .chars()
                    .map(|character| character as u32),
            ),
            Value::String(value) => append_units(value.units(), out, ctx)?,
            Value::Array(items) => {
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        out.push(',' as u32);
                    }
                    if !matches!(item, Value::Null) {
                        append_value(item, out, ctx)?;
                    }
                }
            }
            Value::Object(_) => out.extend("[object Object]".chars().map(|c| c as u32)),
        }
        Ok(())
    }
    fn append_runtime(
        value: &Runtime,
        out: &mut Vec<u32>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        match value {
            Runtime::Missing => out.extend("undefined".chars().map(|c| c as u32)),
            Runtime::Map(_) => out.extend("[object Map]".chars().map(|c| c as u32)),
            Runtime::Text {
                python_origin: Some(origin),
                ..
            } => {
                ctx.charge_work(origin.len(), Utf16::default())?;
                out.extend_from_slice(origin.codepoints());
            }
            Runtime::Text {
                value,
                python_source_path: true,
                ..
            } => {
                ctx.charge_work(value.len(), Utf16::default())?;
                let origin = crate::python_value::python_path_from_internal(value);
                ctx.charge_work(origin.len(), Utf16::default())?;
                out.extend_from_slice(origin.codepoints());
            }
            Runtime::Text { value, .. } => append_units(value.units(), out, ctx)?,
            Runtime::Json(value) => append_value(value, out, ctx)?,
            Runtime::Array(items) => {
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        out.push(',' as u32);
                    }
                    if !matches!(item, Runtime::Missing | Runtime::Json(Value::Null)) {
                        append_runtime(item, out, ctx)?;
                    }
                }
            }
            Runtime::Object(_) | Runtime::CopiedObject(_) => {
                out.extend("[object Object]".chars().map(|c| c as u32))
            }
        }
        Ok(())
    }
    let mut result = Vec::new();
    append_runtime(value, &mut result, ctx)?;
    Ok(result)
}
fn own<'a>(v: &'a Value, name: &Utf16) -> Option<&'a Value> {
    obj(v)?.iter().find(|(k, _)| k == name).map(|(_, v)| v)
}
fn array_index(key: &Utf16) -> Option<usize> {
    let units = key.units();
    if units.is_empty()
        || units.len() > 10
        || (units.len() > 1 && units[0] == b'0' as u16)
        || !units
            .iter()
            .all(|unit| (b'0' as u16..=b'9' as u16).contains(unit))
    {
        return None;
    }
    let value = units.iter().try_fold(0u64, |value, unit| {
        value
            .checked_mul(10)?
            .checked_add(u64::from(*unit - b'0' as u16))
    })?;
    (value < 4_294_967_295).then_some(value as usize)
}
fn ordered_members(
    members: Vec<(Utf16, Value)>,
    ctx: &mut Context<'_>,
) -> Result<Vec<(Utf16, Value)>, EngineError> {
    let count = members.len();
    let sort_work = count.saturating_mul((usize::BITS - count.max(1).leading_zeros()) as usize);
    // The two destination vectors and their members are allocated only after
    // admitting both classification and worst-case index-sort comparisons.
    ctx.charge_work(
        count.saturating_mul(3).saturating_add(sort_work),
        Utf16::default(),
    )?;
    let mut indexed = Vec::new();
    let mut other = Vec::new();
    for (position, item) in members.into_iter().enumerate() {
        ctx.charge_work(item.0.len(), Utf16::default())?;
        if let Some(index) = array_index(&item.0) {
            indexed.push((index, position, item));
        } else {
            other.push((position, item));
        }
    }
    indexed.sort_by_key(|(index, _, _)| *index);
    // Non-index members were appended in source order, so no sort is needed.
    Ok(indexed
        .into_iter()
        .map(|(_, _, item)| item)
        .chain(other.into_iter().map(|(_, item)| item))
        .collect())
}
fn property(v: &Value, key: &Utf16, ctx: &mut Context<'_>) -> Result<Option<Value>, EngineError> {
    match v {
        Value::Object(_) => own(v, key)
            .map(|value| clone_private(value, ctx))
            .transpose(),
        Value::Array(items) => {
            if key == &k("length") {
                Ok(Some(Value::Number(items.len() as f64)))
            } else {
                array_index(key)
                    .and_then(|i| items.get(i))
                    .map(|value| clone_private(value, ctx))
                    .transpose()
            }
        }
        // The constraint language's get/has operators guard property access
        // with `typeof value === "object"`; strings therefore do not expose
        // boxed String properties here (unlike length's direct `.length`).
        Value::String(_) => Ok(None),
        _ => Ok(None),
    }
}
fn value_string_cost(value: &Value) -> usize {
    match value {
        Value::Null => 4,
        Value::Bool(false) => 5,
        Value::Bool(true) => 4,
        Value::Number(number) => crate::ecma_number_to_string(*number).encode_utf16().count(),
        Value::String(text) => text.len(),
        Value::Object(_) => 15,
        Value::Array(values) => values
            .iter()
            .fold(values.len().saturating_sub(1), |sum, value| {
                sum.saturating_add(if matches!(value, Value::Null) {
                    0
                } else {
                    value_string_cost(value)
                })
            }),
    }
}
fn value_string_units(value: &Value) -> Utf16 {
    let mut out = Vec::with_capacity(value_string_cost(value));
    value_string_into(value, &mut out);
    Utf16::new(out)
}
fn value_string_into(value: &Value, out: &mut Vec<u16>) {
    match value {
        Value::Null => out.extend("null".encode_utf16()),
        Value::Bool(b) => out.extend(b.to_string().encode_utf16()),
        Value::Number(n) => out.extend(crate::ecma_number_to_string(*n).encode_utf16()),
        Value::String(s) => out.extend(s.units()),
        Value::Object(_) => out.extend("[object Object]".encode_utf16()),
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(44);
                }
                if !matches!(item, Value::Null) {
                    value_string_into(item, out);
                }
            }
        }
    }
}
fn runtime_string_into(value: &Runtime, out: &mut Vec<u16>) {
    fn append_codepoints(codepoints: &[u32], out: &mut Vec<u16>) {
        for point in codepoints {
            if *point <= 0xffff {
                out.push(*point as u16);
            } else if let Some(character) = char::from_u32(*point) {
                let mut buffer = [0u16; 2];
                out.extend(character.encode_utf16(&mut buffer).iter().copied());
            }
        }
    }
    match value {
        Runtime::Missing => out.extend("undefined".encode_utf16()),
        Runtime::Map(_) => out.extend("[object Map]".encode_utf16()),
        Runtime::Text {
            value,
            python_source_path: true,
            ..
        } => append_codepoints(
            crate::python_value::python_path_from_internal(value).codepoints(),
            out,
        ),
        Runtime::Text { value, .. } => out.extend(value.units()),
        Runtime::Json(value) => value_string_into(value, out),
        Runtime::Object(_) => out.extend("[object Object]".encode_utf16()),
        Runtime::CopiedObject(_) => out.extend("[object Object]".encode_utf16()),
        Runtime::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',' as u16);
                }
                if !matches!(item, Runtime::Missing | Runtime::Json(Value::Null)) {
                    runtime_string_into(item, out);
                }
            }
        }
    }
}
fn runtime_primitive<'a>(
    value: &'a Runtime,
    scratch: &'a mut Option<Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Primitive<'a>, EngineError> {
    fn object_shadow_error(value: &[(Utf16, Runtime)]) -> bool {
        value.iter().any(|(key, _)| key == &k("toString"))
    }
    let primitive = match value {
        Runtime::Missing => Primitive::Undefined,
        Runtime::Map(_) => {
            *scratch = Some(Utf16::from("[object Map]"));
            Primitive::String(scratch.as_ref().unwrap())
        }
        Runtime::Text {
            value,
            python_source_path: true,
            ..
        } => {
            ctx.charge_work(value.len(), Utf16::default())?;
            *scratch = Some(crate::python_value::python_path_from_internal(value).to_utf16(ctx)?);
            Primitive::String(scratch.as_ref().unwrap())
        }
        Runtime::Text { value, .. } | Runtime::Json(Value::String(value)) => {
            Primitive::String(value)
        }
        Runtime::Json(Value::Null) => Primitive::Null,
        Runtime::Json(Value::Bool(value)) => Primitive::Bool(*value),
        Runtime::Json(Value::Number(value)) => Primitive::Number(*value),
        Runtime::Json(Value::Array(_)) | Runtime::Array(_) => {
            *scratch = Some(string_units_metered(value, ctx)?);
            Primitive::String(scratch.as_ref().unwrap())
        }
        Runtime::Json(Value::Object(fields)) => {
            if fields.iter().any(|(key, _)| key == &k("toString")) {
                return Err(EngineError::new(
                    "CONSTRAINT_COERCION",
                    Utf16::default(),
                    "Object cannot be converted to a primitive",
                ));
            }
            *scratch = Some(Utf16::from("[object Object]"));
            Primitive::String(scratch.as_ref().unwrap())
        }
        Runtime::Object(fields) => {
            if object_shadow_error(fields) {
                return Err(EngineError::new(
                    "CONSTRAINT_COERCION",
                    Utf16::default(),
                    "Object cannot be converted to a primitive",
                ));
            }
            *scratch = Some(Utf16::from("[object Object]"));
            Primitive::String(scratch.as_ref().unwrap())
        }
        Runtime::CopiedObject(_) => {
            return Err(EngineError::new(
                "CONSTRAINT_COERCION",
                Utf16::default(),
                "Object cannot be converted to a primitive",
            ));
        }
    };
    Ok(primitive)
}
fn string_units_output_cost(v: &Runtime, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    runtime_string_cost(v, ctx)
}
fn string_units_metered(v: &Runtime, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    if let Runtime::Json(value) = v {
        charge_tree(value, ctx)?;
    }
    let cost = runtime_string_cost(v, ctx)?;
    ctx.charge_work(cost, Utf16::default())?;
    let mut output = Vec::with_capacity(cost);
    runtime_string_into(v, &mut output);
    Ok(Utf16::new(output))
}

fn runtime_string_cost(value: &Runtime, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    fn json_cost(value: &Value, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
        match value {
            Value::Object(fields) => {
                ctx.charge_work(fields.len(), Utf16::default())?;
                if fields.iter().any(|(key, _)| key == &k("toString")) {
                    return Err(EngineError::new(
                        "CONSTRAINT_COERCION",
                        Utf16::default(),
                        "Object cannot be converted to a primitive",
                    ));
                }
                Ok(15)
            }
            Value::Array(items) => {
                ctx.charge_work(items.len(), Utf16::default())?;
                let mut size = items.len().saturating_sub(1);
                for item in items {
                    if !matches!(item, Value::Null) {
                        size = size.saturating_add(json_cost(item, ctx)?);
                    }
                }
                Ok(size)
            }
            _ => Ok(value_string_cost(value)),
        }
    }

    match value {
        Runtime::Missing => Ok(9),
        Runtime::Map(_) => Ok(12),
        Runtime::Text {
            value,
            python_source_path: true,
            ..
        } => {
            ctx.charge_work(value.len(), Utf16::default())?;
            Ok(crate::python_value::python_path_from_internal(value).utf16_unit_len())
        }
        Runtime::Text { value, .. } => Ok(value.len()),
        Runtime::Json(value) => json_cost(value, ctx),
        Runtime::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut size = items.len().saturating_sub(1);
            for item in items {
                if !matches!(item, Runtime::Missing | Runtime::Json(Value::Null)) {
                    size = size.saturating_add(runtime_string_cost(item, ctx)?);
                }
            }
            Ok(size)
        }
        Runtime::Object(fields) => {
            ctx.charge_work(fields.len(), Utf16::default())?;
            if fields.iter().any(|(key, _)| key == &k("toString")) {
                return Err(EngineError::new(
                    "CONSTRAINT_COERCION",
                    Utf16::default(),
                    "Object cannot be converted to a primitive",
                ));
            }
            Ok(15)
        }
        Runtime::CopiedObject(_) => Err(EngineError::new(
            "CONSTRAINT_COERCION",
            Utf16::default(),
            "Object cannot be converted to a primitive",
        )),
    }
}

fn path_get(
    value: &Runtime,
    path: &[Runtime],
    ctx: &mut Context<'_>,
) -> Result<Runtime, EngineError> {
    let mut current = runtime_copy(value, ctx)?;
    for segment in path {
        let key = string_units_metered(segment, ctx)?;
        current = match current {
            Runtime::Json(v) => property(&v, &key, ctx)?
                .map(Runtime::Json)
                .unwrap_or(Runtime::Missing),
            Runtime::Array(items) => array_index(&key)
                .filter(|_| key != k("length"))
                .and_then(|index| items.get(index))
                .map(|value| runtime_copy(value, ctx))
                .transpose()?
                .unwrap_or_else(|| {
                    if key == k("length") {
                        Runtime::Json(Value::Number(items.len() as f64))
                    } else {
                        Runtime::Missing
                    }
                }),
            Runtime::Object(items) | Runtime::CopiedObject(items) => {
                match find_runtime_key_metered(&items, &key, ctx)? {
                    Some(index) => runtime_copy(&items[index].1, ctx)?,
                    None => Runtime::Missing,
                }
            }
            Runtime::Text { value, .. } => property(&Value::String(value), &key, ctx)?
                .map(Runtime::Json)
                .unwrap_or(Runtime::Missing),
            _ => Runtime::Missing,
        };
    }
    Ok(current)
}
fn runtime_property(
    value: &Runtime,
    key: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<Runtime>, EngineError> {
    match value {
        Runtime::Json(value) => property(value, key, ctx).map(|v| v.map(Runtime::Json)),
        Runtime::Array(items) => {
            if key == &k("length") {
                Ok(Some(Runtime::Json(Value::Number(items.len() as f64))))
            } else {
                array_index(key)
                    .and_then(|index| items.get(index))
                    .map(|value| runtime_copy(value, ctx))
                    .transpose()
            }
        }
        Runtime::Object(items) | Runtime::CopiedObject(items) => {
            find_runtime_key_metered(items, key, ctx)?
                .map(|index| runtime_copy(&items[index].1, ctx))
                .transpose()
        }
        Runtime::Text { value, .. } => {
            let _ = (value, key, ctx);
            Ok(None)
        }
        _ => Ok(None),
    }
}

fn as_values(v: Runtime, ctx: &mut Context<'_>) -> Result<Vec<Runtime>, EngineError> {
    match v {
        Runtime::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            Ok(items)
        }
        Runtime::Json(Value::Array(items)) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            Ok(items.into_iter().map(Runtime::Json).collect())
        }
        Runtime::Json(Value::Null) | Runtime::Missing => Ok(Vec::new()),
        _ => Err(EngineError::new(
            "CONSTRAINT_TARGET",
            Utf16::default(),
            "Constraint iteration requires an array",
        )),
    }
}
fn charge_tree(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            for item in items {
                charge_tree(item, ctx)?;
            }
        }
        Value::Object(members) => {
            ctx.charge_work(members.len(), Utf16::default())?;
            for (key, item) in members {
                ctx.charge_work(key.len(), Utf16::default())?;
                charge_tree(item, ctx)?;
            }
        }
        Value::String(text) => ctx.charge_work(text.len(), Utf16::default())?,
        _ => (),
    }
    Ok(())
}

/// Clone an already-admitted value used as an interpreter-private temporary.
/// Semantic depth/value limits apply at input admission, not to wrappers or
/// copies created while evaluating an admitted program. Charge the complete
/// copied tree before allocating the clone.
fn clone_private(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    charge_tree(value, ctx)?;
    Ok(value.clone())
}

fn as_json(v: &Runtime, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    match v {
        Runtime::Json(v) => clone_private(v, ctx),
        Runtime::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            Ok(Value::Array(
                items
                    .iter()
                    .map(|item| as_json(item, ctx))
                    .collect::<Result<_, _>>()?,
            ))
        }
        Runtime::Object(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut result = Vec::with_capacity(items.len());
            for (key, value) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                result.push((key.clone(), as_json(value, ctx)?));
            }
            Ok(Value::Object(result))
        }
        Runtime::CopiedObject(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut result = Vec::with_capacity(items.len());
            for (key, value) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                result.push((key.clone(), as_json(value, ctx)?));
            }
            Ok(Value::Object(result))
        }
        Runtime::Text {
            value,
            python_origin,
            ..
        } => {
            ctx.charge_work(
                value.len().saturating_add(
                    python_origin
                        .as_ref()
                        .map(crate::python_value::PyText::utf16_unit_len)
                        .unwrap_or(0),
                ),
                Utf16::default(),
            )?;
            Ok(Value::String(value.clone()))
        }
        Runtime::Missing => Ok(Value::Null),
        Runtime::Map(_) => Ok(Value::Array(vec![])),
    }
}
fn literal_policy(value: &Value, ctx: &mut Context<'_>) -> Result<PreparedPolicy, EngineError> {
    prepare_policy(value, ctx)
}
fn eval(
    e: &Value,
    env: &Env,
    doc: &Value,
    policy: &Value,
    reg: &crate::registry::Registry,
    caps: &mut dyn crate::engine::Capabilities,
    ctx: &mut Context<'_>,
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<Runtime, EngineError> {
    ctx.charge_constraint_step(Utf16::default())?;
    match e {
        Value::Object(_) => {
            if let Some(v) = get(e, "var") {
                let name = utf16(v).unwrap_or_default();
                return Ok(match find_env_key_metered(env, &name, ctx)? {
                    Some(index) => runtime_copy(&env[index].1, ctx)?,
                    None => Runtime::Missing,
                });
            }
            if let Some(op) = get(e, "op") {
                let name = txt(op).unwrap_or_default();
                let args = arr(get(e, "args").unwrap_or(&Value::Null)).unwrap_or(&[]);
                if matches!(name.as_str(), "and" | "or") {
                    if name == "and" {
                        for a in args {
                            let v = eval(a, env, doc, policy, reg, caps, ctx, diagnostics)?;
                            if !truth(&v) {
                                return Ok(Runtime::Json(Value::Bool(false)));
                            }
                        }
                        return Ok(Runtime::Json(Value::Bool(true)));
                    }
                    for a in args {
                        let v = eval(a, env, doc, policy, reg, caps, ctx, diagnostics)?;
                        if truth(&v) {
                            return Ok(Runtime::Json(Value::Bool(true)));
                        }
                    }
                    return Ok(Runtime::Json(Value::Bool(false)));
                }
                let mut av = Vec::with_capacity(args.len());
                for a in args {
                    av.push(eval(a, env, doc, policy, reg, caps, ctx, diagnostics)?)
                }
                let x = av
                    .first()
                    .map(|v| runtime_copy(v, ctx))
                    .transpose()?
                    .unwrap_or(Runtime::Missing);
                let y = av
                    .get(1)
                    .map(|v| runtime_copy(v, ctx))
                    .transpose()?
                    .unwrap_or(Runtime::Missing);
                return match name.as_str() {
                    "get" => {
                        let yj = runtime_json_copy(&y, ctx)?;
                        let path = match yj {
                            Some(Value::Array(a)) => {
                                a.into_iter().map(Runtime::Json).collect::<Vec<_>>()
                            }
                            _ => vec![],
                        };
                        path_get(&x, &path, ctx)
                    }
                    "has" => {
                        let yj = runtime_json_copy(&y, ctx)?;
                        let path = match yj {
                            Some(Value::Array(a)) => {
                                a.into_iter().map(Runtime::Json).collect::<Vec<_>>()
                            }
                            _ => vec![],
                        };
                        if path.is_empty() {
                            return Ok(Runtime::Json(Value::Bool(false)));
                        }
                        let parent = path_get(&x, &path[..path.len() - 1], ctx)?;
                        let key = string_units_metered(path.last().unwrap(), ctx)?;
                        let present = runtime_property(&parent, &key, ctx)?.is_some();
                        Ok(Runtime::Json(Value::Bool(present)))
                    }
                    "keys" | "values" | "entries" => {
                        if let Runtime::Object(members) | Runtime::CopiedObject(members) = &x {
                            ctx.charge_work(members.len(), Utf16::default())?;
                            let mut out = Vec::with_capacity(members.len());
                            for (key, value) in members {
                                match name.as_str() {
                                    "keys" => {
                                        ctx.charge_work(key.len(), Utf16::default())?;
                                        out.push(Runtime::Json(Value::String(key.clone())));
                                    }
                                    "values" => out.push(runtime_copy(value, ctx)?),
                                    _ => {
                                        ctx.charge_work(
                                            key.len().saturating_add(2),
                                            Utf16::default(),
                                        )?;
                                        out.push(Runtime::Array(vec![
                                            Runtime::Json(Value::String(key.clone())),
                                            runtime_copy(value, ctx)?,
                                        ]));
                                    }
                                }
                            }
                            return Ok(Runtime::Array(out));
                        }
                        if let Runtime::Array(items) = &x {
                            ctx.charge_work(items.len(), Utf16::default())?;
                            let mut out = Vec::with_capacity(items.len());
                            for (index, value) in items.iter().enumerate() {
                                let key =
                                    Runtime::Json(Value::String(Utf16::from(index.to_string())));
                                match name.as_str() {
                                    "keys" => out.push(key),
                                    "values" => out.push(runtime_copy(value, ctx)?),
                                    _ => out
                                        .push(Runtime::Array(vec![key, runtime_copy(value, ctx)?])),
                                }
                            }
                            return Ok(Runtime::Array(out));
                        }
                        let xj = runtime_json_copy(&x, ctx)?;
                        let count = match &xj {
                            Some(Value::Object(m)) => m.len(),
                            Some(Value::Array(a)) => a.len(),
                            _ => 0,
                        };
                        ctx.charge_work(count, Utf16::default())?;
                        let mut out = Vec::new();
                        if let Some(v) = xj {
                            match v {
                                Value::Object(m) => {
                                    for (k, v) in ordered_members(m, ctx)? {
                                        if name == "keys" {
                                            out.push(Value::String(k))
                                        } else if name == "values" {
                                            out.push(v)
                                        } else {
                                            out.push(Value::Array(vec![Value::String(k), v]))
                                        }
                                    }
                                }
                                Value::String(_) => (),
                                Value::Array(a) => {
                                    for (i, v) in a.into_iter().enumerate() {
                                        if name == "keys" {
                                            out.push(Value::String(Utf16::from(i.to_string())))
                                        } else if name == "values" {
                                            out.push(v)
                                        } else {
                                            out.push(Value::Array(vec![
                                                Value::String(Utf16::from(i.to_string())),
                                                v,
                                            ]))
                                        }
                                    }
                                }
                                _ => (),
                            }
                        }
                        Ok(Runtime::Json(Value::Array(out)))
                    }
                    "without" => {
                        let yj = runtime_json_copy(&y, ctx)?;
                        if let Runtime::Object(members) = &x {
                            let remove_values =
                                arr(yj.as_ref().unwrap_or(&Value::Null)).unwrap_or(&[]);
                            ctx.charge_work(remove_values.len(), Utf16::default())?;
                            let mut remove = Vec::with_capacity(remove_values.len());
                            for value in remove_values {
                                if let Value::String(key) = value {
                                    ctx.charge_work(key.len(), Utf16::default())?;
                                    remove.push(key.clone());
                                }
                            }
                            ctx.charge_work(members.len(), Utf16::default())?;
                            let mut out = Vec::with_capacity(members.len());
                            for (key, value) in members {
                                if !contains_utf16_metered(&remove, key, ctx)? {
                                    ctx.charge_work(key.len(), Utf16::default())?;
                                    out.push((key.clone(), runtime_copy(value, ctx)?));
                                }
                            }
                            return Ok(Runtime::Object(out));
                        }
                        let xj = runtime_json_copy(&x, ctx)?;
                        let Some(Value::Object(m)) = xj else {
                            return Ok(Runtime::Json(Value::Object(vec![])));
                        };
                        let remove_values = arr(yj.as_ref().unwrap_or(&Value::Null)).unwrap_or(&[]);
                        ctx.charge_work(remove_values.len(), Utf16::default())?;
                        let mut remove = Vec::with_capacity(remove_values.len());
                        for value in remove_values {
                            if let Value::String(key) = value {
                                ctx.charge_work(key.len(), Utf16::default())?;
                                remove.push(key.clone());
                            }
                        }
                        let members = ordered_members(m, ctx)?;
                        ctx.charge_work(members.len(), Utf16::default())?;
                        let mut out = Vec::with_capacity(members.len());
                        for (key, value) in members {
                            if !contains_utf16_metered(&remove, &key, ctx)? {
                                out.push((key, value));
                            }
                        }
                        Ok(Runtime::Json(Value::Object(out)))
                    }
                    "flatten" => {
                        if let Runtime::Array(items) = x {
                            let cost = items
                                .iter()
                                .map(|item| match item {
                                    Runtime::Array(inner) => 1 + inner.len(),
                                    Runtime::Json(Value::Array(inner)) => 1 + inner.len(),
                                    _ => 1,
                                })
                                .sum();
                            ctx.charge_work(cost, Utf16::default())?;
                            let mut flattened = Vec::with_capacity(cost);
                            for item in items {
                                match item {
                                    Runtime::Array(inner) => flattened.extend(inner),
                                    Runtime::Json(Value::Array(inner)) => {
                                        flattened.extend(inner.into_iter().map(Runtime::Json))
                                    }
                                    item => flattened.push(item),
                                }
                            }
                            return Ok(Runtime::Array(flattened));
                        }
                        let xj = runtime_json_copy(&x, ctx)?;
                        let Some(Value::Array(a)) = xj else {
                            return Ok(Runtime::Json(Value::Array(vec![])));
                        };
                        let cost = a
                            .iter()
                            .map(|v| {
                                if let Value::Array(inner) = v {
                                    1 + inner.len()
                                } else {
                                    1
                                }
                            })
                            .sum();
                        ctx.charge_work(cost, Utf16::default())?;
                        let mut out = Vec::new();
                        for v in a {
                            if let Value::Array(inner) = v {
                                out.extend(inner)
                            } else {
                                out.push(v)
                            }
                        }
                        Ok(Runtime::Json(Value::Array(out)))
                    }
                    "length" => {
                        let length = match &x {
                            Runtime::Map(map) => {
                                Runtime::Json(Value::Number(map.borrow().len() as f64))
                            }
                            Runtime::Array(items) => {
                                Runtime::Json(Value::Number(items.len() as f64))
                            }
                            Runtime::Json(Value::Array(items)) => {
                                Runtime::Json(Value::Number(items.len() as f64))
                            }
                            Runtime::Json(Value::String(text)) => {
                                Runtime::Json(Value::Number(text.len() as f64))
                            }
                            Runtime::Text {
                                value,
                                python_source_path: true,
                                ..
                            } => {
                                ctx.charge_work(value.len(), Utf16::default())?;
                                Runtime::Json(Value::Number(
                                    crate::python_value::python_path_from_internal(value)
                                        .utf16_unit_len()
                                        as f64,
                                ))
                            }
                            Runtime::Text { value, .. } => {
                                Runtime::Json(Value::Number(value.len() as f64))
                            }
                            Runtime::Object(fields) | Runtime::CopiedObject(fields) => fields
                                .iter()
                                .find(|(name, _)| name == &k("length"))
                                .map(|(_, value)| runtime_copy(value, ctx))
                                .transpose()?
                                .filter(|value| !matches!(value, Runtime::Json(Value::Null)))
                                .unwrap_or_else(|| Runtime::Json(Value::Number(0.0))),
                            Runtime::Json(Value::Object(fields)) => fields
                                .iter()
                                .find(|(name, _)| name == &k("length"))
                                .map(|(_, value)| clone_private(value, ctx).map(Runtime::Json))
                                .transpose()?
                                .filter(|value| !matches!(value, Runtime::Json(Value::Null)))
                                .unwrap_or_else(|| Runtime::Json(Value::Number(0.0))),
                            _ => Runtime::Json(Value::Number(0.0)),
                        };
                        Ok(length)
                    }
                    "eq" | "ne" => {
                        let same = runtime_equal(&x, &y, ctx)?;
                        Ok(Runtime::Json(Value::Bool(if name == "eq" {
                            same
                        } else {
                            !same
                        })))
                    }
                    "lt" | "lte" | "gt" | "gte" => {
                        let mut left_scratch = None;
                        let mut right_scratch = None;
                        let left = runtime_primitive(&x, &mut left_scratch, ctx)?;
                        let right = runtime_primitive(&y, &mut right_scratch, ctx)?;
                        let ord = abstract_relational_compare(left, right, ctx)?;
                        let b = ord.is_some_and(|o| match name.as_str() {
                            "lt" => o == Ordering::Less,
                            "lte" => o != Ordering::Greater,
                            "gt" => o == Ordering::Greater,
                            _ => o != Ordering::Less,
                        });
                        Ok(Runtime::Json(Value::Bool(b)))
                    }
                    "in" => {
                        let yes = match (&y, &x) {
                            (Runtime::Map(m), _) => {
                                let key = canonical_runtime(&x, ctx)?
                                    .map(|(units, _)| units)
                                    .unwrap_or_else(|| Utf16::from("undefined").into_units());
                                let entries = m.borrow();
                                contains_map_key_metered(&entries, &key, ctx)?
                            }
                            (Runtime::Json(Value::Array(a)), _) => {
                                let mut found = false;
                                for value in a {
                                    let candidate = Runtime::Json(clone_private(value, ctx)?);
                                    if runtime_equal(&candidate, &x, ctx)? {
                                        found = true;
                                        break;
                                    }
                                }
                                found
                            }
                            (Runtime::Array(items), _) => {
                                let mut found = false;
                                for value in items {
                                    if runtime_equal(value, &x, ctx)? {
                                        found = true;
                                        break;
                                    }
                                }
                                found
                            }
                            _ => false,
                        };
                        Ok(Runtime::Json(Value::Bool(yes)))
                    }
                    "not" => Ok(Runtime::Json(Value::Bool(!truth(&x)))),
                    "concat" => {
                        let mut total = 0usize;
                        let mut origin_count = 0usize;
                        for value in &av {
                            if !matches!(value, Runtime::Json(Value::Null) | Runtime::Missing) {
                                if let Runtime::Json(json) = value {
                                    charge_tree(json, ctx)?;
                                }
                                let cost = string_units_output_cost(value, ctx)?;
                                total = total.saturating_add(cost);
                                origin_count = origin_count.saturating_add(cost);
                            }
                        }
                        ctx.charge_work(
                            total.saturating_add(origin_count.saturating_mul(2)),
                            Utf16::default(),
                        )?;
                        let mut joined = Vec::with_capacity(total);
                        let mut codepoints = Vec::with_capacity(origin_count);
                        for value in &av {
                            if !matches!(value, Runtime::Json(Value::Null) | Runtime::Missing) {
                                joined.extend(string_units_metered(value, ctx)?.units());
                                codepoints.extend(runtime_text_codepoint_origin(value, ctx)?);
                            }
                        }
                        let value = Utf16::new(joined);
                        Ok(Runtime::Text {
                            value,
                            python_origin: crate::python_value::PyText::from_codepoints(codepoints)
                                .ok(),
                            python_source_path: false,
                        })
                    }
                    "pointer" => {
                        let source = string_units_metered(&x, ctx)?;
                        let source_points = runtime_text_codepoint_origin(&x, ctx)?;
                        let extra = source
                            .units()
                            .iter()
                            .filter(|unit| matches!(unit, 0x7e | 0x2f))
                            .count();
                        ctx.charge_work(source.len().saturating_add(extra), Utf16::default())?;
                        let mut output_points =
                            Vec::with_capacity(source_points.len().saturating_add(extra));
                        for point in source_points {
                            match point {
                                0x7e => output_points.extend(['~' as u32, '0' as u32]),
                                0x2f => output_points.extend(['~' as u32, '1' as u32]),
                                other => output_points.push(other),
                            }
                        }
                        let encoded = crate::python_value::PyText::from_codepoints(output_points)
                            .map_err(|_| {
                            EngineError::new(
                                "PYTHON_VALUE_INVALID",
                                Utf16::default(),
                                "Invalid pointer text",
                            )
                        })?;
                        Ok(Runtime::Text {
                            value: pointer_units(&source),
                            python_origin: Some(encoded),
                            python_source_path: false,
                        })
                    }
                    "tuple" => {
                        ctx.charge_work(av.len(), Utf16::default())?;
                        Ok(Runtime::Array(av))
                    }
                    "sort" => {
                        if let Runtime::Array(mut values) = x {
                            let n = values.len();
                            let cost =
                                n.saturating_mul((usize::BITS - n.max(1).leading_zeros()) as usize);
                            ctx.charge_work(cost, Utf16::default())?;
                            let mut keyed = values
                                .iter()
                                .enumerate()
                                .map(|(index, value)| {
                                    let is_undefined = matches!(value, Runtime::Missing);
                                    Ok((is_undefined, string_units_metered(value, ctx)?, index))
                                })
                                .collect::<Result<Vec<_>, EngineError>>()?;
                            let mut comparison_error = None;
                            keyed.sort_by(|a, b| {
                                let undefined_order = a.0.cmp(&b.0);
                                if undefined_order != Ordering::Equal {
                                    return undefined_order;
                                }
                                if comparison_error.is_some() {
                                    return Ordering::Equal;
                                }
                                match compare_utf16_metered(&a.1, &b.1, ctx) {
                                    Ok(order) => order,
                                    Err(error) => {
                                        comparison_error = Some(error);
                                        Ordering::Equal
                                    }
                                }
                            });
                            if let Some(error) = comparison_error {
                                return Err(error);
                            }
                            let mut sorted = Vec::with_capacity(values.len());
                            for (_, _, index) in keyed {
                                sorted
                                    .push(std::mem::replace(&mut values[index], Runtime::Missing));
                            }
                            return Ok(Runtime::Array(sorted));
                        }
                        let mut values = match x {
                            Runtime::Json(Value::Array(v)) => v,
                            Runtime::Json(Value::Null) | Runtime::Missing => Vec::new(),
                            _ => Vec::new(),
                        };
                        let n = values.len();
                        let cost =
                            n.saturating_mul((usize::BITS - n.max(1).leading_zeros()) as usize);
                        ctx.charge_work(cost, Utf16::default())?;
                        let mut keyed = values
                            .iter()
                            .enumerate()
                            .map(|(index, value)| {
                                charge_tree(value, ctx)?;
                                ctx.charge_work(value_string_cost(value), Utf16::default())?;
                                Ok((value_string_units(value), index))
                            })
                            .collect::<Result<Vec<_>, EngineError>>()?;
                        let mut comparison_error = None;
                        keyed.sort_by(|a, b| {
                            if comparison_error.is_some() {
                                return Ordering::Equal;
                            }
                            match compare_utf16_metered(&a.0, &b.0, ctx) {
                                Ok(order) => order,
                                Err(error) => {
                                    comparison_error = Some(error);
                                    Ordering::Equal
                                }
                            }
                        });
                        if let Some(error) = comparison_error {
                            return Err(error);
                        }
                        let mut sorted = Vec::with_capacity(values.len());
                        for (_, index) in keyed {
                            sorted.push(std::mem::replace(&mut values[index], Value::Null));
                        }
                        Ok(Runtime::Json(Value::Array(sorted)))
                    }
                    "canonical" => Ok(canonical_runtime(&x, ctx)?
                        .map(|(units, origin)| Runtime::Text {
                            value: Utf16::new(units),
                            python_origin: Some(origin),
                            python_source_path: false,
                        })
                        .unwrap_or(Runtime::Missing)),
                    "set" => Ok(Runtime::Map(Rc::new(RefCell::new(Vec::new())))),
                    "lookup" => {
                        let key = canonical_runtime(&y, ctx)?
                            .map(|(units, _)| units)
                            .unwrap_or_else(|| Utf16::from("undefined").into_units());
                        Ok(match x {
                            Runtime::Map(m) => {
                                let entries = m.borrow();
                                find_map_value_metered(&entries, &key, ctx)?
                                    .map(|value| runtime_copy(value, ctx))
                                    .transpose()?
                                    .unwrap_or(Runtime::Missing)
                            }
                            _ => Runtime::Missing,
                        })
                    }
                    "registered" => {
                        let xj = runtime_json_copy(&x, ctx)?;
                        let yj = runtime_json_copy(&y, ctx)?;
                        let found = match (xj.as_ref(), yj.as_ref()) {
                            (Some(Value::String(id)), Some(Value::String(version))) => {
                                reg.get(id, version).is_some()
                            }
                            _ => false,
                        };
                        Ok(Runtime::Json(Value::Bool(found)))
                    }
                    "literal-errors" => {
                        let xj = runtime_json_copy(&x, ctx)?;
                        let yj = runtime_json_copy(&y, ctx)?;
                        let policy_value = av
                            .get(4)
                            .map(|value| runtime_json_copy(value, ctx))
                            .transpose()?
                            .flatten()
                            .unwrap_or(Value::Null);
                        let p = literal_policy(&policy_value, ctx)?;
                        let v = av
                            .get(2)
                            .map(|value| as_json(value, ctx))
                            .transpose()?
                            .unwrap_or(Value::Null);
                        let enabled = av.get(3).is_some_and(truth);
                        let errors = literal_errors_admitted(
                            xj.as_ref().unwrap_or(&Value::Null),
                            yj.as_ref().unwrap_or(&Value::Null),
                            &v,
                            enabled,
                            &p,
                            ctx,
                        )?;
                        runtime_diagnostics(&errors, ctx)
                    }
                    "literal-identity" => {
                        let xj = runtime_json_copy(&x, ctx)?;
                        let yj = runtime_json_copy(&y, ctx)?;
                        let policy_value = av
                            .get(2)
                            .map(|value| runtime_json_copy(value, ctx))
                            .transpose()?
                            .flatten()
                            .unwrap_or(Value::Null);
                        let p = literal_policy(&policy_value, ctx)?;
                        Ok(literal_identity_admitted(
                            xj.as_ref().unwrap_or(&Value::Null),
                            yj.as_ref().unwrap_or(&Value::Null),
                            &p,
                            ctx,
                        )?
                        .map(Value::String)
                        .map(Runtime::Json)
                        .unwrap_or(Runtime::Missing))
                    }
                    "numeric-interval" => {
                        let xj = runtime_json_copy(&x, ctx)?;
                        let yj = runtime_json_copy(&y, ctx)?;
                        let policy_value = av
                            .get(2)
                            .map(|value| runtime_json_copy(value, ctx))
                            .transpose()?
                            .flatten()
                            .unwrap_or(Value::Null);
                        let p = literal_policy(&policy_value, ctx)?;
                        let errors = numeric_interval_admitted(
                            xj.as_ref().unwrap_or(&Value::Null),
                            yj.as_ref().unwrap_or(&Value::Null),
                            &p,
                            ctx,
                        )?;
                        runtime_diagnostics(&errors, ctx)
                    }
                    "extension-errors" => {
                        let xj = runtime_json_copy(&x, ctx)?;
                        let yj = runtime_json_copy(&y, ctx)?;
                        let supplied_doc = xj.as_ref().unwrap_or(&Value::Null);
                        let payloads = yj.as_ref().unwrap_or(&Value::Null);
                        let scope = av
                            .get(2)
                            .map(|value| string_units_metered(value, ctx))
                            .transpose()?
                            .unwrap_or_default();
                        let path = av
                            .get(3)
                            .map(|value| string_units_metered(value, ctx))
                            .transpose()?
                            .unwrap_or_default();
                        let p = av
                            .get(4)
                            .map(|value| as_json(value, ctx))
                            .transpose()?
                            .unwrap_or(Value::Null);
                        let errors = extension_errors(
                            supplied_doc,
                            payloads,
                            &scope,
                            &path,
                            &p,
                            reg,
                            caps,
                            ctx,
                        )?;
                        runtime_diagnostics(&errors, ctx)
                    }
                    "filter" | "map" | "find" | "some" | "every" | "index" => {
                        let list = as_values(x, ctx)?;
                        let as_name = utf16(get(e, "as").unwrap()).unwrap_or_default();
                        let idx_name = get(e, "index").and_then(utf16);
                        let body = get(e, "value").unwrap();
                        let mut out = Vec::new();
                        let mut map = Vec::new();
                        let mut found = Runtime::Missing;
                        let mut truth_value = name == "every";
                        for (i, item) in list.iter().enumerate() {
                            let mut local = clone_env(env, ctx)?;
                            ctx.charge_work(as_name.len(), Utf16::default())?;
                            local.push((as_name.clone(), Rc::new(runtime_copy(item, ctx)?)));
                            if let Some(ref n) = idx_name {
                                ctx.charge_work(n.len(), Utf16::default())?;
                                local.push((
                                    n.clone(),
                                    Rc::new(Runtime::Json(Value::Number(i as f64))),
                                ))
                            }
                            let v = eval(body, &local, doc, policy, reg, caps, ctx, diagnostics)?;
                            match name.as_str() {
                                "filter" => {
                                    if truth(&v) {
                                        out.push(runtime_copy(item, ctx)?)
                                    }
                                }
                                "map" => out.push(v),
                                "find" => {
                                    if truth(&v) {
                                        found = runtime_copy(item, ctx)?;
                                        break;
                                    }
                                }
                                "some" => {
                                    if truth(&v) {
                                        truth_value = true;
                                        break;
                                    }
                                }
                                "every" => {
                                    if !truth(&v) {
                                        truth_value = false;
                                        break;
                                    }
                                }
                                "index" => {
                                    let key = canonical_runtime(&v, ctx)?
                                        .map(|(units, _)| units)
                                        .unwrap_or_else(|| Utf16::from("undefined").into_units());
                                    if let Some(index) =
                                        find_map_value_index_metered(&map, &key, ctx)?
                                    {
                                        map[index].1 = runtime_copy(item, ctx)?;
                                    } else {
                                        map.push((key, runtime_copy(item, ctx)?));
                                    }
                                }
                                _ => (),
                            }
                        }
                        Ok(match name.as_str() {
                            "filter" | "map" => Runtime::Array(out),
                            "find" => found,
                            "some" | "every" => Runtime::Json(Value::Bool(truth_value)),
                            _ => Runtime::Map(Rc::new(RefCell::new(map))),
                        })
                    }
                    _ => Err(EngineError::new(
                        "CONSTRAINT_OPCODE",
                        Utf16::default(),
                        format!("Unknown expression: {name}"),
                    )),
                };
            } else {
                let member_count = obj(e).unwrap().len();
                ctx.charge_work(member_count, Utf16::default())?;
                let mut members = Vec::with_capacity(member_count);
                let mut preserve_origin = false;
                for (key, value) in obj(e).unwrap() {
                    let evaluated = eval(value, env, doc, policy, reg, caps, ctx, diagnostics)?;
                    ctx.charge_work(key.len(), Utf16::default())?;
                    preserve_origin |= matches!(
                        evaluated,
                        Runtime::Text { .. }
                            | Runtime::Array(_)
                            | Runtime::Object(_)
                            | Runtime::CopiedObject(_)
                    );
                    members.push((key.clone(), evaluated));
                }
                if preserve_origin {
                    Ok(Runtime::Object(members))
                } else {
                    Ok(Runtime::Json(Value::Object(
                        members
                            .into_iter()
                            .map(|(key, value)| Ok((key, runtime_to_value(value, ctx)?)))
                            .collect::<Result<_, EngineError>>()?,
                    )))
                }
            }
        }
        Value::Array(a) => {
            ctx.charge_work(a.len(), Utf16::default())?;
            let mut out = Vec::with_capacity(a.len());
            let mut preserve_origin = false;
            for v in a {
                let evaluated = eval(v, env, doc, policy, reg, caps, ctx, diagnostics)?;
                preserve_origin |= matches!(
                    evaluated,
                    Runtime::Text { .. }
                        | Runtime::Array(_)
                        | Runtime::Object(_)
                        | Runtime::CopiedObject(_)
                );
                out.push(evaluated);
            }
            if preserve_origin {
                Ok(Runtime::Array(out))
            } else {
                Ok(Runtime::Json(Value::Array(
                    out.into_iter()
                        .map(|value| runtime_to_value(value, ctx))
                        .collect::<Result<_, _>>()?,
                )))
            }
        }
        _ => Ok(Runtime::Json(clone_private(e, ctx)?)),
    }
}
fn runtime_to_value(v: Runtime, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    match v {
        Runtime::Json(v) => Ok(v),
        Runtime::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            Ok(Value::Array(
                items
                    .into_iter()
                    .map(|item| runtime_to_value(item, ctx))
                    .collect::<Result<_, _>>()?,
            ))
        }
        Runtime::Object(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut result = Vec::with_capacity(items.len());
            for (key, item) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                result.push((key, runtime_to_value(item, ctx)?));
            }
            Ok(Value::Object(result))
        }
        Runtime::CopiedObject(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut result = Vec::with_capacity(items.len());
            for (key, item) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                result.push((key, runtime_to_value(item, ctx)?));
            }
            Ok(Value::Object(result))
        }
        Runtime::Text {
            value,
            python_origin,
            ..
        } => {
            ctx.charge_work(
                value.len().saturating_add(
                    python_origin
                        .as_ref()
                        .map(crate::python_value::PyText::utf16_unit_len)
                        .unwrap_or(0),
                ),
                Utf16::default(),
            )?;
            Ok(Value::String(value))
        }
        Runtime::Missing => Ok(Value::Null),
        Runtime::Map(_) => Ok(Value::Array(vec![])),
    }
}
fn runtime_equal(a: &Runtime, b: &Runtime, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    // The retained TypeScript equality is canonical JSON equality. Maps have
    // no enumerable own properties, so each one canonicalizes as an empty
    // object regardless of its internal entries.
    let left = canonical_runtime(a, ctx)?;
    let right = canonical_runtime(b, ctx)?;
    Ok(match (left, right) {
        (None, None) => true,
        (Some((left, _)), Some((right, _))) => left == right,
        _ => false,
    })
}
fn pointer_units(source: &Utf16) -> Utf16 {
    let mut out = Vec::new();
    for unit in source.units() {
        match unit {
            0x7e => out.extend([0x7e, 0x30]),
            0x2f => out.extend([0x7e, 0x31]),
            x => out.push(*x),
        }
    }
    Utf16::new(out)
}

/// Join an ordinary extension-instance prefix with a schema path that may
/// contain Python-source pointer markers. Decode markers only in the
/// schema-generated suffix; literal marker-shaped prefix text is host data.
fn python_path_with_source_suffix(
    prefix: &Utf16,
    suffix: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<crate::python_value::PyText, EngineError> {
    ctx.charge_work(
        prefix.units().len().saturating_add(suffix.units().len()),
        prefix.clone(),
    )?;
    let suffix = crate::python_value::python_path_from_internal(suffix);
    let prefix_points: Vec<u32> = char::decode_utf16(prefix.units().iter().copied())
        .map(|item| {
            item.map(|character| character as u32)
                .unwrap_or_else(|error| error.unpaired_surrogate() as u32)
        })
        .collect();
    let total = prefix_points.len().saturating_add(suffix.len());
    let mut points = Vec::with_capacity(total);
    points.extend(prefix_points);
    points.extend_from_slice(suffix.codepoints());
    crate::python_value::PyText::from_codepoints(points)
}

fn extension_errors(
    doc: &Value,
    payloads: &Value,
    scope: &Utf16,
    path: &Utf16,
    policy: &Value,
    registry: &crate::registry::Registry,
    caps: &mut dyn crate::engine::Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    fn child(base: &Utf16, segment: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        let escaped = segment
            .units()
            .iter()
            .filter(|unit| matches!(unit, 0x7e | 0x2f))
            .count();
        ctx.charge_work(
            base.len()
                .saturating_add(segment.len())
                .saturating_add(1)
                .saturating_add(escaped),
            Utf16::default(),
        )?;
        let mut units = base.units().to_vec();
        units.push(47);
        for unit in segment.units() {
            match unit {
                0x7e => units.extend([0x7e, 0x30]),
                0x2f => units.extend([0x7e, 0x31]),
                other => units.push(*other),
            }
        }
        Ok(Utf16::new(units))
    }
    let mut out = Vec::new();
    let Some(entries) = obj(payloads) else {
        return Ok(out);
    };
    let vocab = get(doc, "vocabularies").unwrap_or(&Value::Null);
    for (id, payload) in entries {
        let mut at = child(path, &Utf16::from("extensions"), ctx)?;
        at = child(&at, id, ctx)?;
        let Some(decl) = get_key(vocab, id) else {
            out.push(model_diag(policy, "undeclared", &at, None, ctx)?);
            continue;
        };
        let Some(version) = get(decl, "version").and_then(|v| {
            if let Value::String(s) = v {
                Some(s.clone())
            } else {
                None
            }
        }) else {
            out.push(model_diag(policy, "undeclared", &at, None, ctx)?);
            continue;
        };
        let Some(entry) = registry.get(id, &version) else {
            continue;
        };
        let (kind_invalid, mut kind_diagnostics) =
            crate::kinds::occurrence(entry, payload, scope, &at, policy, ctx)?;
        out.append(&mut kind_diagnostics);
        if !entry
            .scopes()
            .iter()
            .any(|s| Utf16::from(s.as_str()) == *scope)
        {
            out.push(model_diag(policy, "scope", &at, None, ctx)?);
            continue;
        }
        let errors = if let Some(source_document) = caps.python_source_document() {
            match source_document.pointer_get(&at, ctx)? {
                Some(source_payload) => entry.schema().validate_instance(source_payload, ctx)?,
                None => entry.schema().validate(payload, ctx)?,
            }
        } else {
            entry.schema().validate(payload, ctx)?
        };
        if !errors.is_empty() {
            for error in errors {
                let mut p;
                let mut python_path_origin = None;
                if error.python_source_path {
                    let origin = python_path_with_source_suffix(&at, &error.instance_path, ctx)?;
                    p = origin.to_utf16(ctx)?.into_units();
                    python_path_origin = Some(origin);
                } else {
                    ctx.charge_work(
                        at.len().saturating_add(error.instance_path.len()),
                        Utf16::default(),
                    )?;
                    p = at.units().to_vec();
                    p.extend(error.instance_path.units());
                }
                let mut diagnostic = model_diag(
                    policy,
                    "structure",
                    &Utf16::new(p),
                    Some(error.message),
                    ctx,
                )?;
                if let Some(path) = python_path_origin {
                    diagnostic.python_text_origin = Some(crate::error::PythonDiagnosticText {
                        code: None,
                        path: Some(path),
                        message: None,
                    });
                }
                out.push(diagnostic);
            }
            continue;
        }
        if kind_invalid {
            continue;
        }
        if !entry.semantic() {
            out.push(model_diag(policy, "unchecked", &at, None, ctx)?);
            continue;
        }
        let Some(token) = entry.token() else {
            out.push(model_diag(policy, "unchecked", &at, None, ctx)?);
            continue;
        };
        let context = crate::engine::SemanticContext {
            document: clone_private(doc, ctx)?,
            source_document: None,
            source_payload: None,
            path: at.clone(),
            scope: scope.to_utf8().unwrap_or_default(),
        };
        let payload_copy = clone_private(payload, ctx)?;
        match caps.validate_extension_with_context(token, &payload_copy, &context, ctx) {
            Ok(mut diagnostics) => out.append(&mut diagnostics),
            Err(crate::engine::CapabilityError::Host(message)) => {
                out.push(model_diag(policy, "failure", &at, Some(message), ctx)?)
            }
            Err(crate::engine::CapabilityError::HostPython { message, source }) => {
                let mut diagnostic = model_diag(policy, "failure", &at, Some(message), ctx)?;
                diagnostic.python_text_origin = Some(crate::error::PythonDiagnosticText {
                    code: None,
                    path: None,
                    message: Some(source),
                });
                out.push(diagnostic);
            }
            Err(crate::engine::CapabilityError::Engine(error)) => return Err(error),
        }
    }
    Ok(out)
}

pub(crate) fn model_diag(
    policy: &Value,
    name: &str,
    path: &Utf16,
    detail: Option<Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Diagnostic, EngineError> {
    let rule = get(policy, name).ok_or_else(|| {
        EngineError::new(
            "CONSTRAINT_PROGRAM",
            Utf16::default(),
            "Missing model diagnostic",
        )
    })?;
    let code = match get(rule, "code") {
        Some(Value::String(code)) => code,
        _ => return Err(err("CONSTRAINT_DIAGNOSTIC", "Malformed diagnostic")),
    };
    let detail = detail.as_ref();
    let configured_message = get(rule, "message").and_then(|v| match v {
        Value::String(s) => Some(s),
        _ => None,
    });
    let message = detail.or(configured_message);
    let cost = code
        .len()
        .saturating_add(path.len())
        .saturating_add(message.map(Utf16::len).unwrap_or_default());
    ctx.charge_work(cost, Utf16::default())?;
    let code = code.clone();
    let message = message.cloned().unwrap_or_default();
    let severity = if get(rule, "severity").and_then(txt).as_deref() == Some("warning") {
        Severity::Warning
    } else {
        Severity::Error
    };
    Ok(Diagnostic {
        code,
        path: path.clone(),
        python_source_path: false,
        message,
        severity,
        python_text_origin: None,
    })
}
fn runtime_from_value(v: Value, ctx: &mut Context<'_>) -> Result<Runtime, EngineError> {
    match v {
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut copied = Vec::with_capacity(items.len());
            for item in items {
                copied.push(runtime_from_value(item, ctx)?);
            }
            Ok(Runtime::Array(copied))
        }
        Value::Object(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut copied = Vec::with_capacity(items.len());
            for (key, item) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                copied.push((key, runtime_from_value(item, ctx)?));
            }
            Ok(Runtime::CopiedObject(copied))
        }
        scalar => Ok(Runtime::Json(scalar)),
    }
}
fn eval_bool(
    e: &Value,
    env: &Env,
    doc: &Value,
    p: &Value,
    reg: &crate::registry::Registry,
    caps: &mut dyn crate::engine::Capabilities,
    ctx: &mut Context<'_>,
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<bool, EngineError> {
    Ok(truth(&eval(e, env, doc, p, reg, caps, ctx, diagnostics)?))
}
fn exec(
    body: &Value,
    env: &mut Env,
    doc: &Value,
    p: &Value,
    reg: &crate::registry::Registry,
    caps: &mut dyn crate::engine::Capabilities,
    ctx: &mut Context<'_>,
    diags: &mut Vec<Diagnostic>,
) -> Result<(), EngineError> {
    for step in arr(body).unwrap_or(&[]) {
        ctx.charge_constraint_step(Utf16::default())?;
        let op = txt(get(step, "op").unwrap_or(&Value::Null)).unwrap_or_default();
        match op.as_str() {
            "let" => {
                let n = utf16(get(step, "name").unwrap()).unwrap_or_default();
                let v = eval(
                    get(step, "value").unwrap(),
                    env,
                    doc,
                    p,
                    reg,
                    caps,
                    ctx,
                    diags,
                )?;
                if let Some(index) = find_env_key_metered(env, &n, ctx)? {
                    env[index].1 = Rc::new(v)
                } else {
                    env.push((n, Rc::new(v)))
                }
            }
            "for" => {
                let values = eval(
                    get(step, "each").unwrap(),
                    env,
                    doc,
                    p,
                    reg,
                    caps,
                    ctx,
                    diags,
                )?;
                for (i, v) in as_values(values, ctx)?.into_iter().enumerate() {
                    let mut local = clone_env(env, ctx)?;
                    local.push((
                        utf16(get(step, "as").unwrap()).unwrap_or_default(),
                        Rc::new(v),
                    ));
                    if let Some(ix) = get(step, "index") {
                        local.push((
                            utf16(ix).unwrap_or_default(),
                            Rc::new(Runtime::Json(Value::Number(i as f64))),
                        ))
                    }
                    exec(
                        get(step, "body").unwrap(),
                        &mut local,
                        doc,
                        p,
                        reg,
                        caps,
                        ctx,
                        diags,
                    )?
                }
            }
            "if" => {
                let test = eval_bool(
                    get(step, "test").unwrap(),
                    env,
                    doc,
                    p,
                    reg,
                    caps,
                    ctx,
                    diags,
                )?;
                if test {
                    let mut local = clone_env(env, ctx)?;
                    exec(
                        get(step, "then").unwrap(),
                        &mut local,
                        doc,
                        p,
                        reg,
                        caps,
                        ctx,
                        diags,
                    )?
                } else if let Some(other) = get(step, "else") {
                    let mut local = clone_env(env, ctx)?;
                    exec(other, &mut local, doc, p, reg, caps, ctx, diags)?
                }
            }
            "emit" => {
                let should_emit = match get(step, "when") {
                    Some(w) => eval_bool(w, env, doc, p, reg, caps, ctx, diags)?,
                    None => true,
                };
                if should_emit {
                    let v = eval(
                        get(step, "diagnostic").unwrap(),
                        env,
                        doc,
                        p,
                        reg,
                        caps,
                        ctx,
                        diags,
                    )?;
                    diags.push(diagnostic_from_runtime(v, ctx)?)
                }
            }
            "remember" => {
                let set = eval(
                    get(step, "set").unwrap(),
                    env,
                    doc,
                    p,
                    reg,
                    caps,
                    ctx,
                    diags,
                )?;
                let key_runtime = eval(
                    get(step, "key").unwrap(),
                    env,
                    doc,
                    p,
                    reg,
                    caps,
                    ctx,
                    diags,
                )?;
                let key = canonical_runtime(&key_runtime, ctx)?
                    .map(|(units, _)| units)
                    .unwrap_or_else(|| Utf16::from("undefined").into_units());
                if let Runtime::Map(m) = set {
                    let entries = m.borrow();
                    let duplicate = contains_map_key_metered(&entries, &key, ctx)?;
                    drop(entries);
                    if duplicate {
                        if let Some(d) = get(step, "diagnostic") {
                            let diagnostic = eval(d, env, doc, p, reg, caps, ctx, diags)?;
                            diags.push(diagnostic_from_runtime(diagnostic, ctx)?)
                        }
                    } else {
                        let stored = if let Some(value) = get(step, "value") {
                            eval(value, env, doc, p, reg, caps, ctx, diags)?
                        } else {
                            Runtime::Json(Value::Bool(true))
                        };
                        m.borrow_mut().push((key, stored));
                    }
                }
            }
            _ => {
                return Err(EngineError::new(
                    "CONSTRAINT_OPCODE",
                    Utf16::default(),
                    format!("Unknown step: {op}"),
                ));
            }
        }
    }
    Ok(())
}
fn diagnostic_from_runtime(v: Runtime, ctx: &mut Context<'_>) -> Result<Diagnostic, EngineError> {
    let fields = match v {
        Runtime::Json(Value::Object(fields)) => {
            ctx.charge_work(fields.len(), Utf16::default())?;
            fields
                .into_iter()
                .map(|(key, value)| (key, Runtime::Json(value)))
                .collect()
        }
        Runtime::Object(fields) | Runtime::CopiedObject(fields) => fields,
        _ => return Err(err("CONSTRAINT_DIAGNOSTIC", "Malformed diagnostic")),
    };
    let copied_text_cost = fields
        .iter()
        .filter(|(key, _)| {
            ["code", "path", "message", "severity"]
                .iter()
                .any(|name| key == &k(name))
        })
        .fold(0usize, |total, (_, value)| {
            total.saturating_add(match value {
                Runtime::Text {
                    value,
                    python_origin,
                    ..
                } => value.len().saturating_add(
                    python_origin
                        .as_ref()
                        .map(crate::python_value::PyText::utf16_unit_len)
                        .unwrap_or(0),
                ),
                Runtime::Json(Value::String(value)) => value.len(),
                _ => 0,
            })
        });
    ctx.charge_work(copied_text_cost, Utf16::default())?;
    let field = |name: &str| {
        fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value)
    };
    let text = |name: &str| -> Option<(Utf16, Option<crate::python_value::PyText>, bool)> {
        match field(name)? {
            Runtime::Text {
                value,
                python_origin,
                python_source_path,
            } => Some((value.clone(), python_origin.clone(), *python_source_path)),
            Runtime::Json(Value::String(value)) => Some((value.clone(), None, false)),
            _ => None,
        }
    };
    let (code, code_origin, _) =
        text("code").ok_or_else(|| err("CONSTRAINT_DIAGNOSTIC", "Malformed diagnostic"))?;
    let (path, path_origin, python_source_path) =
        text("path").ok_or_else(|| err("CONSTRAINT_DIAGNOSTIC", "Malformed diagnostic"))?;
    let (message, message_origin, _) =
        text("message").ok_or_else(|| err("CONSTRAINT_DIAGNOSTIC", "Malformed diagnostic"))?;
    let severity = match text("severity").and_then(|(text, _, _)| text.to_utf8().ok()) {
        Some(severity) if severity == "error" => Severity::Error,
        Some(severity) if severity == "warning" => Severity::Warning,
        _ => return Err(err("CONSTRAINT_DIAGNOSTIC", "Malformed diagnostic")),
    };
    Ok(Diagnostic {
        code,
        path,
        python_source_path,
        message,
        severity,
        python_text_origin: if code_origin.is_some()
            || path_origin.is_some()
            || message_origin.is_some()
        {
            Some(crate::error::PythonDiagnosticText {
                code: code_origin,
                path: path_origin,
                message: message_origin,
            })
        } else {
            None
        },
    })
}
pub fn execute_constraints(
    document: &Value,
    program: &PreparedProgram,
    policy: &Value,
    registry: &crate::registry::Registry,
    caps: &mut dyn crate::engine::Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let document = copy_json(document, ctx)?;
    let policy = copy_json(policy, ctx)?;
    if let Some(literal) = get(&policy, "literal") {
        prepare_policy(literal, ctx)?;
    }
    execute_constraints_admitted(&document, program, &policy, registry, caps, ctx)
}

/// Execute an interpreter operation whose document and policy have already
/// passed ordinary Value admission in this invocation.
pub(crate) fn execute_constraints_admitted(
    document: &Value,
    program: &PreparedProgram,
    policy: &Value,
    registry: &crate::registry::Registry,
    caps: &mut dyn crate::engine::Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut diags = Vec::new();
    let mut env = vec![
        (
            "doc".into(),
            Rc::new(runtime_from_value(clone_private(document, ctx)?, ctx)?),
        ),
        (
            "policy".into(),
            Rc::new(runtime_from_value(clone_private(policy, ctx)?, ctx)?),
        ),
    ];
    exec(
        get(program.value(), "steps").unwrap_or(&Value::Null),
        &mut env,
        document,
        policy,
        registry,
        caps,
        ctx,
        &mut diags,
    )?;
    Ok(diags)
}

/// Execute an explicitly supplied, already-owned core constraint program.
/// Generated resources remain distribution-owned and are never loaded implicitly.
pub fn run_core_constraints(
    document: &Value,
    program: &PreparedProgram,
    policy: &Value,
    registry: &crate::registry::Registry,
    capabilities: &mut dyn crate::engine::Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    execute_constraints(document, program, policy, registry, capabilities, ctx)
}

#[cfg(test)]
mod runtime_diagnostic_tests {
    use super::*;

    struct NoCapabilities;
    impl crate::engine::Capabilities for NoCapabilities {
        fn validate_extension(
            &mut self,
            _token: u64,
            _payload: &Value,
            _context: &crate::engine::SemanticContext,
        ) -> Result<Vec<Diagnostic>, Utf16> {
            Ok(Vec::new())
        }
    }

    fn object(fields: Vec<(&str, Value)>) -> Value {
        Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        )
    }
    fn variable(name: &str) -> Value {
        object(vec![("var", Value::string_utf8(name))])
    }
    fn operation(name: &str, args: Vec<Value>) -> Value {
        object(vec![
            ("op", Value::string_utf8(name)),
            ("args", Value::Array(args)),
        ])
    }
    fn diagnostic() -> Diagnostic {
        let paired_origin =
            crate::python_value::PyText::from_codepoints(vec![0xd83d, 0xde00]).unwrap();
        let code = Utf16::new(vec![0xd83d, 0xde00]);
        Diagnostic {
            code: code.clone(),
            path: Utf16::from("/x"),
            python_source_path: false,
            message: code,
            severity: Severity::Error,
            python_text_origin: Some(crate::error::PythonDiagnosticText {
                code: Some(paired_origin.clone()),
                path: None,
                message: Some(paired_origin),
            }),
        }
    }
    fn run_expr<T>(expression: &Value, env: &[(Utf16, T)], ctx: &mut Context<'_>) -> Runtime
    where
        T: Clone + Into<Rc<Runtime>>,
    {
        let env = env
            .iter()
            .map(|(name, value)| (name.clone(), value.clone().into()))
            .collect::<Env>();
        eval(
            expression,
            &env,
            &Value::Null,
            &Value::Null,
            &crate::registry::Registry::new(),
            &mut NoCapabilities,
            ctx,
            &mut Vec::new(),
        )
        .unwrap()
    }

    #[test]
    fn diagnostics_use_object_and_array_semantics_through_closed_operators() {
        let diagnostic = diagnostic();
        let mut ctx = Context::ordinary();
        let diagnostic_object = runtime_object(&diagnostic, &mut ctx).unwrap();
        let array = runtime_diagnostics(std::slice::from_ref(&diagnostic), &mut ctx).unwrap();
        let empty_array = runtime_diagnostics(&[], &mut ctx).unwrap();
        let env = vec![
            (Utf16::from("diag"), diagnostic_object.clone()),
            (Utf16::from("diags"), array),
            (Utf16::from("same"), diagnostic_object.clone()),
            (Utf16::from("empty-diags"), empty_array),
            (
                Utf16::from("empty-map"),
                Runtime::Map(Rc::new(RefCell::new(Vec::new()))),
            ),
        ];

        let projected = as_json(&diagnostic_object, &mut ctx).unwrap();
        let Value::Object(fields) = projected else {
            panic!("a diagnostic projects as its four-field object")
        };
        assert_eq!(fields.len(), 4);
        assert_eq!(
            txt(own(&Value::Object(fields.clone()), &k("severity")).unwrap()).as_deref(),
            Some("error")
        );

        let length = run_expr(&operation("length", vec![variable("diag")]), &env, &mut ctx);
        assert!(matches!(length, Runtime::Json(Value::Number(0.0))));
        let diagnostic_array_length = run_expr(
            &operation(
                "get",
                vec![
                    variable("diags"),
                    Value::Array(vec![Value::string_utf8("length")]),
                ],
            ),
            &env,
            &mut ctx,
        );
        assert!(matches!(
            diagnostic_array_length,
            Runtime::Json(Value::Number(1.0))
        ));
        let not_empty_diagnostics = run_expr(
            &operation("not", vec![variable("empty-diags")]),
            &env,
            &mut ctx,
        );
        assert!(matches!(
            not_empty_diagnostics,
            Runtime::Json(Value::Bool(false))
        ));
        let not_empty_map = run_expr(
            &operation("not", vec![variable("empty-map")]),
            &env,
            &mut ctx,
        );
        assert!(matches!(not_empty_map, Runtime::Json(Value::Bool(false))));
        let equality = run_expr(
            &operation("eq", vec![variable("diag"), variable("same")]),
            &env,
            &mut ctx,
        );
        assert!(matches!(equality, Runtime::Json(Value::Bool(true))));
        assert!(runtime_equal(&diagnostic_object, &diagnostic_object, &mut ctx).unwrap());

        for operator in ["keys", "values", "entries"] {
            let result = run_expr(&operation(operator, vec![variable("diag")]), &env, &mut ctx);
            let values = as_values(result, &mut ctx).unwrap();
            assert_eq!(values.len(), 4, "{operator}");
            if operator == "values" {
                assert!(matches!(
                    values.first(),
                    Some(Runtime::Text {
                        python_origin: Some(_),
                        ..
                    })
                ));
            }
            if operator == "entries" {
                let Runtime::Array(entry) = &values[0] else {
                    panic!("entries produces key/value pairs")
                };
                assert!(matches!(
                    entry.get(1),
                    Some(Runtime::Text {
                        python_origin: Some(_),
                        ..
                    })
                ));
            }
        }
        let keys = run_expr(&operation("keys", vec![variable("diag")]), &env, &mut ctx);
        let keys = as_json(&keys, &mut ctx).unwrap();
        let Value::Array(keys) = keys else {
            panic!("keys returns an array")
        };
        assert_eq!(keys[0], Value::String(Utf16::from("code")));

        let path = Value::Array(vec![Value::string_utf8("code")]);
        let field = run_expr(
            &operation("get", vec![variable("diag"), path]),
            &env,
            &mut ctx,
        );
        let Runtime::Text { python_origin, .. } = field else {
            panic!("get preserves host text origin")
        };
        assert_eq!(python_origin.unwrap().codepoints(), &[0xd83d, 0xde00]);
        let tuple = run_expr(
            &operation(
                "tuple",
                vec![operation(
                    "get",
                    vec![
                        variable("diags"),
                        Value::Array(vec![Value::Number(0.0), Value::string_utf8("code")]),
                    ],
                )],
            ),
            &env,
            &mut ctx,
        );
        let Runtime::Array(tuple_items) = tuple else {
            panic!("tuple keeps its runtime values")
        };
        assert!(
            matches!(
                tuple_items.first(),
                Some(Runtime::Text {
                    python_origin: Some(_),
                    ..
                })
            ),
            "{tuple_items:?}"
        );
        let concatenated = run_expr(
            &operation(
                "concat",
                vec![
                    Value::string_utf8(""),
                    operation(
                        "get",
                        vec![
                            variable("diags"),
                            Value::Array(vec![Value::Number(0.0), Value::string_utf8("code")]),
                        ],
                    ),
                ],
            ),
            &env,
            &mut ctx,
        );
        assert!(matches!(
            concatenated,
            Runtime::Text {
                python_origin: Some(_),
                ..
            }
        ));

        let mut map = operation("map", vec![variable("diags")]);
        if let Value::Object(fields) = &mut map {
            fields.push((k("as"), Value::string_utf8("item")));
            fields.push((k("value"), variable("item")));
        }
        let mapped = run_expr(&map, &env, &mut ctx);
        let mapped = as_values(mapped, &mut ctx).unwrap();
        let Runtime::Object(mapped) = &mapped[0] else {
            panic!("identity map retains ordinary objects")
        };
        let Runtime::Text { python_origin, .. } = &mapped[0].1 else {
            panic!("mapping preserves text origin")
        };
        assert_eq!(
            python_origin.as_ref().unwrap().codepoints(),
            &[0xd83d, 0xde00]
        );

        let mut filter = operation("filter", vec![variable("diags")]);
        if let Value::Object(fields) = &mut filter {
            fields.push((k("as"), Value::string_utf8("item")));
            fields.push((k("value"), Value::Bool(true)));
        }
        let filtered = as_values(run_expr(&filter, &env, &mut ctx), &mut ctx).unwrap();
        assert!(matches!(filtered.first(), Some(Runtime::Object(_))));

        let without = operation(
            "without",
            vec![
                variable("diag"),
                Value::Array(vec![Value::string_utf8("message")]),
            ],
        );
        let without = run_expr(&without, &env, &mut ctx);
        let code = runtime_property(&without, &k("code"), &mut ctx)
            .unwrap()
            .unwrap();
        assert!(matches!(
            code,
            Runtime::Text {
                python_origin: Some(_),
                ..
            }
        ));
        assert!(runtime_property(&without, &k("message"), &mut ctx)
            .unwrap()
            .is_none());

        let mut marker_path = diagnostic.clone();
        marker_path.path = Utf16::from("/~p000061");
        marker_path.python_source_path = false;
        let host_marker = runtime_object(&marker_path, &mut ctx).unwrap();
        let path = runtime_property(&host_marker, &k("path"), &mut ctx)
            .unwrap()
            .unwrap();
        assert!(matches!(
            path,
            Runtime::Text {
                python_source_path: false,
                ..
            }
        ));
        assert!(
            !diagnostic_from_runtime(host_marker, &mut ctx)
                .unwrap()
                .python_source_path
        );
        marker_path.python_source_path = true;
        let source_marker = runtime_object(&marker_path, &mut ctx).unwrap();
        let path = runtime_property(&source_marker, &k("path"), &mut ctx)
            .unwrap()
            .unwrap();
        assert!(matches!(
            path,
            Runtime::Text {
                python_source_path: true,
                ..
            }
        ));
        assert!(
            diagnostic_from_runtime(source_marker, &mut ctx)
                .unwrap()
                .python_source_path
        );

        let reconstructed = object(vec![
            (
                "code",
                operation(
                    "get",
                    vec![
                        variable("diag"),
                        Value::Array(vec![Value::string_utf8("code")]),
                    ],
                ),
            ),
            ("path", Value::string_utf8("/new")),
            ("message", Value::string_utf8("rebuilt")),
            ("severity", Value::string_utf8("warning")),
        ]);
        let result = run_expr(&reconstructed, &env, &mut ctx);
        let diagnostic = diagnostic_from_runtime(result, &mut ctx).unwrap();
        assert_eq!(
            diagnostic
                .python_text_origin
                .unwrap()
                .code
                .unwrap()
                .codepoints(),
            &[0xd83d, 0xde00]
        );
    }

    #[test]
    fn array_sort_flatten_and_length_keep_ecmascript_runtime_values() {
        let mut ctx = Context::ordinary();
        let env = vec![
            (
                Utf16::from("items"),
                Runtime::Array(vec![
                    Runtime::Missing,
                    Runtime::Json(Value::string_utf8("z")),
                    Runtime::Json(Value::Array(vec![Value::Number(1.0)])),
                    Runtime::Array(vec![Runtime::Json(Value::Number(2.0))]),
                    Runtime::Json(Value::string_utf8("a")),
                ]),
            ),
            (
                Utf16::from("object"),
                Runtime::Object(vec![(
                    k("length"),
                    Runtime::Json(Value::string_utf8("seven")),
                )]),
            ),
        ];

        let sorted = run_expr(&operation("sort", vec![variable("items")]), &env, &mut ctx);
        let Runtime::Array(sorted) = sorted else {
            panic!("sort returns an array")
        };
        assert!(matches!(sorted[0], Runtime::Json(Value::Array(_))));
        assert!(matches!(sorted[1], Runtime::Array(_)));
        assert!(matches!(sorted[2], Runtime::Json(Value::String(ref value)) if value == &k("a")));
        assert!(
            matches!(sorted[3], Runtime::Json(Value::String(ref value)) if value == &k("z")),
            "{sorted:?}"
        );
        assert!(matches!(sorted[4], Runtime::Missing));

        let flattened = run_expr(
            &operation("flatten", vec![variable("items")]),
            &env,
            &mut ctx,
        );
        let Runtime::Array(flattened) = flattened else {
            panic!("flatten returns an array")
        };
        assert_eq!(flattened.len(), 5);
        assert!(matches!(flattened[0], Runtime::Missing));
        assert!(
            matches!(flattened[1], Runtime::Json(Value::String(ref value)) if value == &k("z"))
        );
        assert!(matches!(flattened[2], Runtime::Json(Value::Number(1.0))));
        assert!(matches!(flattened[3], Runtime::Json(Value::Number(2.0))));
        assert!(
            matches!(flattened[4], Runtime::Json(Value::String(ref value)) if value == &k("a"))
        );

        let length = run_expr(
            &operation("length", vec![variable("object")]),
            &env,
            &mut ctx,
        );
        assert!(matches!(length, Runtime::Json(Value::String(ref value)) if value == &k("seven")));
    }

    #[test]
    fn diagnostic_arrays_keep_host_text_origin_through_generic_operators() {
        let diagnostic = diagnostic();
        let plain_diagnostic = Diagnostic {
            code: Utf16::from("U"),
            path: Utf16::from("/plain"),
            python_source_path: false,
            message: Utf16::from("ordinary"),
            severity: Severity::Error,
            python_text_origin: None,
        };
        let mut ctx = Context::ordinary();
        let diagnostics = runtime_diagnostics(std::slice::from_ref(&diagnostic), &mut ctx).unwrap();
        let plain_diagnostics =
            runtime_diagnostics(std::slice::from_ref(&plain_diagnostic), &mut ctx).unwrap();
        let empty = runtime_diagnostics(&[], &mut ctx).unwrap();
        let env = vec![
            (Utf16::from("ds"), diagnostics.clone()),
            (Utf16::from("plain"), plain_diagnostics.clone()),
            (Utf16::from("empty"), empty.clone()),
        ];

        let code_path = vec![
            Runtime::Json(Value::Number(0.0)),
            Runtime::Json(Value::string_utf8("code")),
        ];
        let code = path_get(&diagnostics, &code_path, &mut ctx).unwrap();
        let Runtime::Text {
            python_origin: Some(origin),
            ..
        } = code
        else {
            panic!("path lookup preserves Python text origin")
        };
        assert_eq!(origin.codepoints(), &[0xd83d, 0xde00]);
        let get_code = operation(
            "get",
            vec![
                variable("ds"),
                Value::Array(vec![Value::Number(0.0), Value::string_utf8("code")]),
            ],
        );
        assert!(matches!(
            run_expr(
                &operation(
                    "lt",
                    vec![get_code.clone(), Value::String(Utf16::from("😀"))]
                ),
                &env,
                &mut ctx,
            ),
            Runtime::Json(Value::Bool(false))
        ));
        assert!(matches!(
            run_expr(
                &operation(
                    "in",
                    vec![
                        get_code,
                        Value::Array(vec![Value::String(Utf16::from("😀"))])
                    ],
                ),
                &env,
                &mut ctx,
            ),
            Runtime::Json(Value::Bool(true))
        ));
        assert!(matches!(
            run_expr(
                &operation(
                    "eq",
                    vec![
                        operation(
                            "get",
                            vec![
                                variable("ds"),
                                Value::Array(vec![Value::Number(0.0), Value::string_utf8("code"),]),
                            ],
                        ),
                        Value::String(Utf16::from("😀")),
                    ],
                ),
                &env,
                &mut ctx,
            ),
            Runtime::Json(Value::Bool(true))
        ));
        assert!(matches!(
            run_expr(
                &operation(
                    "lt",
                    vec![
                        Value::String(Utf16::new(vec![0xe000])),
                        Value::String(Utf16::new(vec![0xd800, 0xdc00])),
                    ],
                ),
                &env,
                &mut ctx,
            ),
            Runtime::Json(Value::Bool(false))
        ));
        let plain_code = operation(
            "get",
            vec![
                variable("plain"),
                Value::Array(vec![Value::Number(0.0), Value::string_utf8("code")]),
            ],
        );
        assert!(matches!(
            run_expr(
                &operation("lt", vec![plain_code.clone(), Value::string_utf8("Z")]),
                &env,
                &mut ctx,
            ),
            Runtime::Json(Value::Bool(true))
        ));
        assert!(matches!(
            run_expr(
                &operation(
                    "in",
                    vec![plain_code, Value::Array(vec![Value::string_utf8("U")])],
                ),
                &env,
                &mut ctx,
            ),
            Runtime::Json(Value::Bool(true))
        ));

        let mut map_expr = operation("map", vec![variable("ds")]);
        if let Value::Object(fields) = &mut map_expr {
            fields.push((k("as"), Value::string_utf8("d")));
            fields.push((k("value"), variable("d")));
        }
        let mapped = run_expr(&map_expr, &env, &mut ctx);
        let mapped_length = path_get(
            &mapped,
            &[Runtime::Json(Value::string_utf8("length"))],
            &mut ctx,
        )
        .unwrap();
        assert!(matches!(mapped_length, Runtime::Json(Value::Number(1.0))));
        let mut mapped_env = env.clone();
        mapped_env.push((Utf16::from("mapped"), mapped.clone()));
        let mapped_length = run_expr(
            &operation(
                "get",
                vec![
                    variable("mapped"),
                    Value::Array(vec![Value::string_utf8("length")]),
                ],
            ),
            &mapped_env,
            &mut ctx,
        );
        assert!(matches!(mapped_length, Runtime::Json(Value::Number(1.0))));

        let sorted = run_expr(&operation("sort", vec![variable("ds")]), &env, &mut ctx);
        let Runtime::Array(sorted) = sorted else {
            panic!("sort preserves generic array shape")
        };
        let reconstructed = diagnostic_from_runtime(sorted[0].clone(), &mut ctx).unwrap();
        assert_eq!(
            reconstructed
                .python_text_origin
                .unwrap()
                .code
                .unwrap()
                .codepoints(),
            &[0xd83d, 0xde00]
        );

        let flattened = run_expr(
            &operation("flatten", vec![Value::Array(vec![variable("ds")])]),
            &env,
            &mut ctx,
        );
        let flattened = as_values(flattened, &mut ctx).unwrap();
        assert!(diagnostic_from_runtime(flattened[0].clone(), &mut ctx).is_ok());

        let empty_concat = run_expr(
            &operation("concat", vec![Value::string_utf8(""), variable("empty")]),
            &env,
            &mut ctx,
        );
        assert!(matches!(
            empty_concat,
            Runtime::Text {
                value,
                python_origin: Some(_),
                ..
            } if value.is_empty()
        ));
    }

    #[test]
    fn concat_materializes_only_trusted_python_source_paths_before_composition() {
        let source_path = Runtime::Text {
            value: Utf16::from("https://example.test/~p000061/resource#/$defs/~p00d83d00de00"),
            python_origin: None,
            python_source_path: true,
        };
        let host_path = Runtime::Text {
            value: Utf16::from("/~p00d83d00de00"),
            python_origin: None,
            python_source_path: false,
        };
        let env = vec![
            (
                Utf16::from("source-array"),
                Runtime::Array(vec![source_path.clone()]),
            ),
            (Utf16::from("source-path"), source_path),
            (Utf16::from("host-path"), host_path),
        ];
        let mut ctx = Context::ordinary();
        let composed = run_expr(
            &operation(
                "concat",
                vec![
                    Value::string_utf8("/~p000061:"),
                    variable("source-path"),
                    Value::string_utf8(":"),
                    variable("host-path"),
                ],
            ),
            &env,
            &mut ctx,
        );
        let Runtime::Text {
            value,
            python_origin: Some(origin),
            python_source_path: false,
        } = composed
        else {
            panic!("concat returns a composed, ordinary text value")
        };
        let mut expected_units: Vec<u16> =
            "/~p000061:https://example.test/~p000061/resource#/$defs/"
                .encode_utf16()
                .collect();
        expected_units.extend([0xd83d, 0xde00]);
        expected_units.extend(":/~p00d83d00de00".encode_utf16());
        assert_eq!(value.units(), expected_units);

        let mut expected_points: Vec<u32> =
            "/~p000061:https://example.test/~p000061/resource#/$defs/"
                .chars()
                .map(u32::from)
                .collect();
        expected_points.extend([0xd83d, 0xde00]);
        expected_points.extend(":/~p00d83d00de00".chars().map(u32::from));
        assert_eq!(origin.codepoints(), expected_points);

        let nested = run_expr(
            &operation("concat", vec![variable("source-array")]),
            &env,
            &mut ctx,
        );
        let Runtime::Text {
            value,
            python_origin: Some(origin),
            ..
        } = nested
        else {
            panic!("nested trusted path coercion keeps source text")
        };
        let mut nested_units: Vec<u16> = "https://example.test/~p000061/resource#/$defs/"
            .encode_utf16()
            .collect();
        nested_units.extend([0xd83d, 0xde00]);
        let mut nested_points: Vec<u32> = "https://example.test/~p000061/resource#/$defs/"
            .chars()
            .map(u32::from)
            .collect();
        nested_points.extend([0xd83d, 0xde00]);
        assert_eq!(value.units(), nested_units.as_slice());
        assert_eq!(origin.codepoints(), nested_points.as_slice());
    }

    #[test]
    fn source_path_suffix_decoding_does_not_rewrite_literal_prefix_markers() {
        let mut ctx = Context::ordinary();
        let prefix = Utf16::from("/~p000061");
        let suffix = Utf16::from("/$defs/~p00d83d00de00");
        let joined = python_path_with_source_suffix(&prefix, &suffix, &mut ctx).unwrap();
        let mut expected: Vec<u32> = "/~p000061/$defs/".chars().map(u32::from).collect();
        expected.extend([0xd83d, 0xde00]);
        assert_eq!(joined.codepoints(), expected);

        let host = Runtime::Text {
            value: Utf16::from("/~p000061/$defs/~p00d83d00de00"),
            python_origin: None,
            python_source_path: false,
        };
        assert_eq!(
            runtime_text_codepoint_origin(&host, &mut ctx).unwrap(),
            "/~p000061/$defs/~p00d83d00de00"
                .chars()
                .map(u32::from)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn pointer_and_canonical_keep_python_text_codepoint_origin() {
        let mut ctx = Context::ordinary();
        let diagnostic = diagnostic();
        let diags = runtime_diagnostics(std::slice::from_ref(&diagnostic), &mut ctx).unwrap();
        let env = vec![(Utf16::from("diags"), diags)];
        let message = operation(
            "get",
            vec![
                variable("diags"),
                Value::Array(vec![Value::Number(0.0), Value::string_utf8("message")]),
            ],
        );
        let pointer = run_expr(&operation("pointer", vec![message.clone()]), &env, &mut ctx);
        let Runtime::Text {
            value,
            python_origin: Some(origin),
            ..
        } = pointer
        else {
            panic!("pointer should retain the source text sidecar")
        };
        assert_eq!(value.units(), &[0xd83d, 0xde00]);
        assert_eq!(origin.codepoints(), &[0xd83d, 0xde00]);

        let canonical = run_expr(&operation("canonical", vec![message]), &env, &mut ctx);
        let Runtime::Text {
            value,
            python_origin: Some(origin),
            ..
        } = canonical
        else {
            panic!("canonical should retain the source text sidecar")
        };
        assert_eq!(value.units(), &[34, 0xd83d, 0xde00, 34]);
        assert_eq!(origin.codepoints(), &[34, 0xd83d, 0xde00, 34]);
    }

    #[test]
    fn computed_vm_text_has_no_source_ceiling_but_remains_metered() {
        const LENGTH: usize = 6_000_001;
        let units = Utf16::new(vec![b'x' as u16; LENGTH]);
        let origin =
            crate::python_value::PyText::from_codepoints(vec![b'x' as u32; LENGTH]).unwrap();
        let env = vec![(
            Utf16::from("message"),
            Runtime::Text {
                value: units,
                python_origin: Some(origin),
                python_source_path: false,
            },
        )];

        let concat = run_expr(
            &operation("concat", vec![Value::string_utf8(""), variable("message")]),
            &env,
            &mut Context::ordinary(),
        );
        assert!(matches!(
            concat,
            Runtime::Text { value, python_origin: Some(origin), .. }
                if value.len() == LENGTH && origin.len() == LENGTH
        ));

        let pointer = run_expr(
            &operation("pointer", vec![variable("message")]),
            &env,
            &mut Context::ordinary(),
        );
        assert!(matches!(
            pointer,
            Runtime::Text { value, python_origin: Some(origin), .. }
                if value.len() == LENGTH && origin.len() == LENGTH
        ));

        let canonical = run_expr(
            &operation("canonical", vec![variable("message")]),
            &env,
            &mut Context::ordinary(),
        );
        assert!(matches!(
            canonical,
            Runtime::Text { value, python_origin: Some(origin), .. }
                if value.len() == LENGTH + 2 && origin.len() == LENGTH + 2
        ));

        let mut meter = |amount| {
            if amount > 1000 {
                Err(EngineError::new(
                    "METER_FAILURE",
                    Utf16::default(),
                    "denied before allocating computed text",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let env = env
            .into_iter()
            .map(|(name, value)| (name, Rc::new(value)))
            .collect::<Env>();
        let error = eval(
            &operation("concat", vec![variable("message")]),
            &env,
            &Value::Null,
            &Value::Null,
            &crate::registry::Registry::new(),
            &mut NoCapabilities,
            &mut ctx,
            &mut Vec::new(),
        )
        .unwrap_err();
        assert_eq!(error.code, "METER_FAILURE");
    }

    #[test]
    fn public_constraint_execution_admits_document_and_policy_once() {
        let program = prepare_program(
            &object(vec![
                ("profile", Value::string_utf8("umf.constraints/1")),
                ("steps", Value::Array(vec![])),
            ]),
            &mut Context::ordinary(),
        )
        .unwrap();
        let registry = crate::registry::Registry::new();
        let mut caps = NoCapabilities;
        let empty_policy = object(vec![]);

        let mut depth_128 = Value::Null;
        for _ in 0..128 {
            depth_128 = Value::Array(vec![depth_128]);
        }
        assert!(execute_constraints(
            &depth_128,
            &program,
            &empty_policy,
            &registry,
            &mut caps,
            &mut Context::ordinary(),
        )
        .is_ok());
        let depth_129 = Value::Array(vec![depth_128]);
        assert_eq!(
            execute_constraints(
                &depth_129,
                &program,
                &empty_policy,
                &registry,
                &mut caps,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "LIMIT"
        );

        assert_eq!(
            execute_constraints(
                &Value::Number(f64::NAN),
                &program,
                &empty_policy,
                &registry,
                &mut caps,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "NUMBER"
        );
        assert_eq!(
            execute_constraints(
                &Value::Null,
                &program,
                &object(vec![("unsafe", Value::Number(-0.0))]),
                &registry,
                &mut caps,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "NUMBER"
        );
        let literal_policy = object(vec![("literal", object(vec![]))]);
        assert_eq!(
            execute_constraints(
                &Value::Null,
                &program,
                &literal_policy,
                &registry,
                &mut caps,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "CONSTRAINT_POLICY"
        );
        assert!(execute_constraints(
            &Value::Null,
            &program,
            &object(vec![]),
            &registry,
            &mut caps,
            &mut Context::ordinary(),
        )
        .is_ok());

        let text = Value::String(Utf16::new(vec![b'x' as u16; 4_000_001]));
        assert!(execute_constraints(
            &text,
            &program,
            &empty_policy,
            &registry,
            &mut caps,
            &mut Context::ordinary(),
        )
        .is_ok());

        let admitted_count = Value::Array(vec![Value::Null; 99_999]);
        assert!(execute_constraints(
            &admitted_count,
            &program,
            &empty_policy,
            &registry,
            &mut caps,
            &mut Context::ordinary(),
        )
        .is_ok());
        let excessive_count = Value::Array(vec![Value::Null; 100_000]);
        assert_eq!(
            execute_constraints(
                &excessive_count,
                &program,
                &empty_policy,
                &registry,
                &mut caps,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "LIMIT"
        );
    }

    #[test]
    fn diagnostic_projection_and_copy_charge_the_invocation_meter() {
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            if amount > 0 {
                Err(EngineError::new(
                    "METER_FAILURE",
                    Utf16::default(),
                    "denied",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let diagnostic_value = runtime_object(&diagnostic(), &mut Context::ordinary()).unwrap();
        let error = as_json(&diagnostic_value, &mut ctx).unwrap_err();
        assert_eq!(error.code, "METER_FAILURE");
        assert_eq!(observed.first(), Some(&4));

        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            Err(EngineError::new(
                "METER_FAILURE",
                Utf16::default(),
                "denied",
            ))
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = runtime_property(&diagnostic_value, &k("message"), &mut ctx).unwrap_err();
        assert_eq!(error.code, "METER_FAILURE");
        // The property lookup's first UTF-16 key comparison is admitted before
        // the diagnostic text copy (the meter refuses at that earlier step).
        assert_eq!(observed, vec![5]);

        let projected = runtime_object(&diagnostic(), &mut Context::ordinary()).unwrap();
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            Err(EngineError::new(
                "METER_FAILURE",
                Utf16::default(),
                "denied",
            ))
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = diagnostic_from_runtime(projected, &mut ctx).unwrap_err();
        assert_eq!(error.code, "METER_FAILURE");
        assert_eq!(observed.len(), 1, "charge output text before copying it");
        assert!(observed[0] > 0);
    }

    #[test]
    fn sort_comparison_admits_long_common_prefix_before_utf16_scan() {
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            Err(EngineError::new(
                "SORT_METER_DENIED",
                Utf16::default(),
                "comparison scan denied",
            ))
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let prefix = vec![b'a' as u16; 1024];
        let mut left = prefix.clone();
        left.push(b'b' as u16);
        let mut right = prefix;
        right.push(b'c' as u16);
        let error =
            compare_utf16_metered(&Utf16::new(left), &Utf16::new(right), &mut ctx).unwrap_err();
        assert_eq!(error.code, "SORT_METER_DENIED");
        assert_eq!(observed, vec![1026]);
    }

    #[test]
    fn canonical_map_key_lookup_admits_shared_prefix_comparison() {
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            if amount > 1000 {
                Err(EngineError::new(
                    "MAP_METER_DENIED",
                    Utf16::default(),
                    "canonical key comparison denied",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let key = vec![b'a' as u16; 1536];
        let entries = vec![(key.clone(), Runtime::Json(Value::Null))];
        let error = find_map_value_metered(&entries, &key, &mut ctx).unwrap_err();
        assert_eq!(error.code, "MAP_METER_DENIED");
        assert_eq!(observed, vec![1, 1537]);
    }
}

#[cfg(test)]
mod shared_env_tests {
    use super::*;

    struct NoCapabilities;
    impl crate::engine::Capabilities for NoCapabilities {
        fn validate_extension(
            &mut self,
            _token: u64,
            _payload: &Value,
            _context: &crate::engine::SemanticContext,
        ) -> Result<Vec<Diagnostic>, Utf16> {
            Ok(Vec::new())
        }
    }

    fn object(fields: Vec<(&str, Value)>) -> Value {
        Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        )
    }

    fn variable(name: &str) -> Value {
        object(vec![("var", Value::string_utf8(name))])
    }

    fn step(op: &str, fields: Vec<(&str, Value)>) -> Value {
        let mut fields = vec![("op", Value::string_utf8(op))]
            .into_iter()
            .chain(fields)
            .collect::<Vec<_>>();
        Value::Object(
            fields
                .drain(..)
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        )
    }

    fn run(expression: &Value, env: &Env, ctx: &mut Context<'_>) -> Runtime {
        eval(
            expression,
            env,
            &Value::Null,
            &Value::Null,
            &crate::registry::Registry::new(),
            &mut NoCapabilities,
            ctx,
            &mut Vec::new(),
        )
        .unwrap()
    }

    fn run_steps(body: &Value, env: &mut Env, ctx: &mut Context<'_>) {
        exec(
            body,
            env,
            &Value::Null,
            &Value::Null,
            &crate::registry::Registry::new(),
            &mut NoCapabilities,
            ctx,
            &mut Vec::new(),
        )
        .unwrap();
    }

    fn json_number(value: &Runtime) -> f64 {
        match value {
            Runtime::Json(Value::Number(number)) => *number,
            other => panic!("expected number, got {other:?}"),
        }
    }

    #[test]
    fn cloned_env_shares_immutable_roots_but_variable_reads_are_owned_copies() {
        let root = Rc::new(Runtime::Json(Value::Object(vec![(
            Utf16::from("nested"),
            Value::Array(vec![Value::Number(1.0)]),
        )])));
        let env = vec![(Utf16::from("root"), Rc::clone(&root))];
        let mut ctx = Context::ordinary();
        let local = clone_env(&env, &mut ctx).unwrap();
        assert!(Rc::ptr_eq(&env[0].1, &local[0].1));

        let mut evaluated = run(&variable("root"), &local, &mut ctx);
        let Runtime::Json(Value::Object(fields)) = &mut evaluated else {
            panic!("variable evaluation returns an owned JSON runtime copy")
        };
        let Value::Array(items) = &mut fields[0].1 else {
            panic!("nested array expected")
        };
        items[0] = Value::Number(99.0);
        let Runtime::Json(Value::Object(fields)) = &*root else {
            unreachable!()
        };
        let Value::Array(items) = &fields[0].1 else {
            unreachable!()
        };
        assert_eq!(items, &[Value::Number(1.0)]);
    }

    #[test]
    fn scoped_if_for_map_and_filter_shadowing_never_rebinds_parent_slots() {
        let original = Rc::new(Runtime::Json(Value::Number(7.0)));
        let mut env = vec![(Utf16::from("x"), Rc::clone(&original))];
        let let_x = || {
            step(
                "let",
                vec![
                    ("name", Value::string_utf8("x")),
                    ("value", Value::Number(9.0)),
                ],
            )
        };
        let mut ctx = Context::ordinary();
        run_steps(
            &Value::Array(vec![step(
                "if",
                vec![
                    ("test", Value::Bool(true)),
                    ("then", Value::Array(vec![let_x()])),
                ],
            )]),
            &mut env,
            &mut ctx,
        );
        assert_eq!(json_number(&env[0].1), 7.0);
        assert!(Rc::ptr_eq(&env[0].1, &original));

        run_steps(
            &Value::Array(vec![step(
                "for",
                vec![
                    (
                        "each",
                        Value::Array(vec![Value::Number(1.0), Value::Number(2.0)]),
                    ),
                    ("as", Value::string_utf8("x")),
                    ("body", Value::Array(vec![let_x()])),
                ],
            )]),
            &mut env,
            &mut ctx,
        );
        assert_eq!(json_number(&env[0].1), 7.0);
        assert!(Rc::ptr_eq(&env[0].1, &original));

        let values = Value::Array(vec![Value::Number(1.0), Value::Number(2.0)]);
        for op in ["map", "filter"] {
            let expression = object(vec![
                ("op", Value::string_utf8(op)),
                ("args", Value::Array(vec![values.clone()])),
                ("as", Value::string_utf8("x")),
                ("value", variable("x")),
            ]);
            let _ = run(&expression, &env, &mut ctx);
            assert_eq!(json_number(&env[0].1), 7.0);
            assert!(Rc::ptr_eq(&env[0].1, &original));
        }
    }

    #[test]
    fn map_mutations_remain_shared_across_scopes_and_nested_maps() {
        let inner = Rc::new(Runtime::Map(Rc::new(RefCell::new(Vec::new()))));
        let outer = Rc::new(Runtime::Map(Rc::new(RefCell::new(Vec::new()))));
        let mut env = vec![
            (Utf16::from("outer"), Rc::clone(&outer)),
            (Utf16::from("inner"), Rc::clone(&inner)),
        ];
        let remember_inner = step(
            "remember",
            vec![
                ("set", variable("inner")),
                ("key", Value::string_utf8("nested")),
            ],
        );
        let remember_outer = step(
            "remember",
            vec![
                ("set", variable("outer")),
                ("key", Value::string_utf8("child")),
                ("value", variable("inner")),
            ],
        );
        let mut ctx = Context::ordinary();
        run_steps(
            &Value::Array(vec![step(
                "if",
                vec![
                    ("test", Value::Bool(true)),
                    ("then", Value::Array(vec![remember_inner, remember_outer])),
                ],
            )]),
            &mut env,
            &mut ctx,
        );

        assert_eq!(inner_map_len(&inner), 1);
        let Runtime::Map(map) = &*outer else {
            unreachable!()
        };
        let entries = map.borrow();
        assert_eq!(entries.len(), 1);
        assert!(
            matches!(&entries[0].1, Runtime::Map(found) if Rc::ptr_eq(found, match &*inner { Runtime::Map(map) => map, _ => unreachable!() }))
        );
    }

    fn inner_map_len(value: &Runtime) -> usize {
        let Runtime::Map(map) = value else {
            unreachable!()
        };
        map.borrow().len()
    }

    #[test]
    fn cloned_env_preserves_raw_utf16_and_python_text_origin() {
        let raw = Utf16::new(vec![0xd800, b'x' as u16]);
        let origin =
            crate::python_value::PyText::from_codepoints(vec![0xd800, b'x' as u32]).unwrap();
        let value = Rc::new(Runtime::Text {
            value: raw.clone(),
            python_origin: Some(origin.clone()),
            python_source_path: true,
        });
        let env = vec![(Utf16::new(vec![0xdfff]), Rc::clone(&value))];
        let mut ctx = Context::ordinary();
        let local = clone_env(&env, &mut ctx).unwrap();
        assert!(Rc::ptr_eq(&env[0].1, &local[0].1));
        assert_eq!(local[0].0, Utf16::new(vec![0xdfff]));
        let Runtime::Text {
            value,
            python_origin,
            python_source_path,
        } = &*local[0].1
        else {
            unreachable!()
        };
        assert_eq!(value, &raw);
        assert_eq!(python_origin.as_ref(), Some(&origin));
        assert!(*python_source_path);
    }

    #[test]
    fn clone_env_polls_late_host_failures_during_name_scan() {
        for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
            let env = (0..64)
                .map(|index| {
                    (
                        Utf16::new(vec![b'n' as u16; 256 + index]),
                        Rc::new(Runtime::Missing),
                    )
                })
                .collect::<Env>();
            let original = env
                .iter()
                .map(|(name, value)| (name.clone(), Rc::clone(value)))
                .collect::<Env>();
            // Two precharges, then stop before copying entry49:48/64 done.
            let stop_call = 2 + env.len() * 3 / 4 + 1;
            let mut calls = 0usize;
            let mut meter = |_amount| {
                calls += 1;
                if calls == stop_call {
                    Err(EngineError::new(code, Utf16::default(), "host stop"))
                } else {
                    Ok(())
                }
            };
            let mut ctx = Context::ordinary().with_meter(&mut meter);
            let error = clone_env(&env, &mut ctx).unwrap_err();
            assert_eq!(error.code, code);
            assert!(error.is_control_failure());
            assert_eq!(calls, stop_call);
            assert!(env
                .iter()
                .zip(&original)
                .all(|((name, value), (old_name, old_value))| name == old_name
                    && Rc::ptr_eq(value, old_value)));
        }
    }
}

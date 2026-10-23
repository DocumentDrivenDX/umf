// SPDX-License-Identifier: MIT OR Apache-2.0
use num_bigint::BigInt;
use num_traits::Signed;
use saphyr_parser::{Event, Parser, ScalarStyle, ScanProfile};

use crate::{
    context::Context,
    error::EngineError,
    python_value::{PyText, PythonConsumerValue},
    value::{Utf16, Value},
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Format {
    Json,
    Yaml,
}

pub fn stringify_compact(value: &Value) -> Result<Utf16, EngineError> {
    let mut out = String::new();
    write_json(value, &mut out)?;
    Ok(Utf16::from(out))
}

/// Compact ECMAScript-compatible JSON serialization with cooperative work
/// metering before the output buffer is allocated.
pub fn stringify_compact_metered(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let units = measure_json(value, ctx)?;
    ctx.charge_work(units, Utf16::default())?;
    let mut out = String::with_capacity(units);
    write_json(value, &mut out)?;
    Ok(Utf16::from(out))
}

fn measure_json(value: &Value, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let add = |a: usize, b: usize| {
        a.checked_add(b)
            .ok_or_else(|| fail("LIMIT", "Serialized length overflow"))
    };
    match value {
        Value::Null => Ok(4),
        Value::Bool(true) => Ok(4),
        Value::Bool(false) => Ok(5),
        Value::Number(n) => Ok(crate::ecma_number_to_string(*n).encode_utf16().count()),
        Value::String(s) => measure_string(s, ctx),
        Value::Array(items) => {
            let mut n = 2usize;
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    n = add(n, 1)?;
                }
                n = add(n, measure_json(item, ctx)?)?;
            }
            Ok(n)
        }
        Value::Object(items) => {
            ctx.charge_work_u64(order_work(items.len()), Utf16::default())?;
            let mut n = 2usize;
            for (i, (key, item)) in items.iter().enumerate() {
                if i > 0 {
                    n = add(n, 1)?;
                }
                n = add(n, measure_string(key, ctx)?)?;
                n = add(n, 1)?;
                n = add(n, measure_json(item, ctx)?)?;
            }
            Ok(n)
        }
    }
}
fn measure_string(value: &Utf16, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    let u = value.units();
    let mut n = 2usize;
    let mut i = 0;
    while i < u.len() {
        if i % 1024 == 0 {
            poll_output(ctx)?;
        }
        let unit = u[i];
        let add = match unit {
            0x22 | 0x5c | 0x08 | 0x0c | 0x0a | 0x0d | 0x09 => 2,
            0..=0x1f => 6,
            0xd800..=0xdbff if i + 1 < u.len() && (0xdc00..=0xdfff).contains(&u[i + 1]) => {
                i += 1;
                2
            }
            0xd800..=0xdfff => 6,
            _ => 1,
        };
        n = n
            .checked_add(add)
            .ok_or_else(|| fail("LIMIT", "Serialized length overflow"))?;
        i += 1;
    }
    Ok(n)
}

/// Parse the YAML 1.2 event stream into the UMF value model. Aliases, tags,
/// duplicate keys and non-string mapping keys are rejected before admission.
pub fn read_json_value(
    source: &[u16],
    format: Format,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if ctx.profile() == crate::ResourceProfile::HardIsolated {
        return Err(EngineError::new(
            "RESOURCE_PROFILE_UNAVAILABLE",
            Utf16::default(),
            "HardIsolated resource profile is unavailable",
        ));
    }
    if source.len() > ctx.limits().max_text_units {
        return Err(fail("LIMIT", "Source text limit exceeded"));
    }
    ctx.charge_text(source.len(), Utf16::default())?;
    let value = match format {
        Format::Yaml => parse_yaml_utf16(source, ctx)?,
        Format::Json => JsonParser::<_, CoreJsonBuilder>::new(source, ctx).parse()?,
    };
    crate::copy_json(&value, ctx)
}

/// Parse native JSON while retaining exact number tokens and arbitrary UTF-16
/// code units. A syntax-only pass establishes predecessor JSON.parse precedence;
/// a second pass rejects duplicate decoded keys; bounded tree admission runs
/// only after both whole-source checks have completed.
pub(crate) fn read_native_json_tree(
    source: &[u16],
    ctx: &mut Context<'_>,
) -> Result<crate::native_json::NativeJsonTree, EngineError> {
    if ctx.profile() == crate::ResourceProfile::HardIsolated {
        return Err(EngineError::new(
            "RESOURCE_PROFILE_UNAVAILABLE",
            Utf16::default(),
            "HardIsolated resource profile is unavailable",
        ));
    }
    if source.len() > ctx.limits().max_text_units {
        return Err(fail("LIMIT", "Native JSON exceeds text limit"));
    }
    ctx.charge_text(source.len(), Utf16::default())?;
    // Precharge the complete syntax scan. The grammar walk below also charges
    // token and structural work as it proceeds, allowing host controls to stop
    // long scans before any caller-visible result is produced.
    ctx.charge_work(source.len(), Utf16::default())?;
    let duplicate = preflight_native_json(source, ctx).map_err(native_json_parse_error)?;
    if duplicate {
        return Err(EngineError::new(
            "JSON_SCHEMA_SYNTAX",
            Utf16::default(),
            "Invalid native JSON",
        ));
    }
    let raw = JsonParser::<_, NativeJsonBuilder>::native(source, ctx)
        .parse()
        .map_err(native_json_parse_error)?;
    crate::native_json::finish_parsed_tree(raw, ctx)
}

#[derive(Clone, Copy)]
enum NativeArrayState {
    ValueOrEnd,
    Value,
    Separator,
}

#[derive(Clone, Copy)]
enum NativeObjectState {
    KeyOrEnd,
    Key,
    Colon,
    Value,
    Separator,
}

enum NativeFrame {
    Array(NativeArrayState),
    Object(NativeObjectState, std::collections::BTreeSet<Vec<u16>>),
}

#[derive(Clone, Copy)]
enum NativeAction {
    TopValue,
    TopEnd,
    ArrayValue(bool),
    ArraySeparator,
    ObjectKey(bool),
    ObjectColon,
    ObjectValue,
    ObjectSeparator,
}

/// Validate the complete JSON source without using the Rust call stack. A
/// duplicate is remembered while syntax scanning continues, preserving
/// syntax-before-duplicate-before-structural-limit precedence.
fn preflight_native_json(
    source: &[u16],
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let mut at = 0usize;
    let mut stack = Vec::<NativeFrame>::new();
    let mut root_done = false;
    let mut duplicate = false;
    loop {
        while source
            .get(at)
            .is_some_and(|unit| matches!(*unit, 0x20 | 0x09 | 0x0a | 0x0d))
        {
            at += 1;
            ctx.charge_work(1, Utf16::default())?;
        }
        let action = match stack.last() {
            None if root_done => NativeAction::TopEnd,
            None => NativeAction::TopValue,
            Some(NativeFrame::Array(NativeArrayState::ValueOrEnd)) => {
                NativeAction::ArrayValue(true)
            }
            Some(NativeFrame::Array(NativeArrayState::Value)) => {
                NativeAction::ArrayValue(false)
            }
            Some(NativeFrame::Array(NativeArrayState::Separator)) => {
                NativeAction::ArraySeparator
            }
            Some(NativeFrame::Object(NativeObjectState::KeyOrEnd, _)) => {
                NativeAction::ObjectKey(true)
            }
            Some(NativeFrame::Object(NativeObjectState::Key, _)) => {
                NativeAction::ObjectKey(false)
            }
            Some(NativeFrame::Object(NativeObjectState::Colon, _)) => NativeAction::ObjectColon,
            Some(NativeFrame::Object(NativeObjectState::Value, _)) => NativeAction::ObjectValue,
            Some(NativeFrame::Object(NativeObjectState::Separator, _)) => {
                NativeAction::ObjectSeparator
            }
        };
        match action {
            NativeAction::TopEnd => {
                if at != source.len() {
                    return Err(fail("SYNTAX", "Trailing JSON source"));
                }
                return Ok(duplicate);
            }
            NativeAction::TopValue | NativeAction::ArrayValue(_) | NativeAction::ObjectValue => {
                let allow_end = matches!(action, NativeAction::ArrayValue(true));
                if allow_end && source.get(at) == Some(&(b']' as u16)) {
                    at += 1;
                    stack.pop();
                    complete_native_value(&mut stack, &mut root_done);
                    continue;
                }
                let Some(unit) = source.get(at).copied() else {
                    return Err(fail("SYNTAX", "Expected JSON value"));
                };
                ctx.charge_work(1, Utf16::default())?;
                match unit {
                    0x7b => {
                        at += 1;
                        stack.push(NativeFrame::Object(
                            NativeObjectState::KeyOrEnd,
                            std::collections::BTreeSet::new(),
                        ));
                    }
                    0x5b => {
                        at += 1;
                        stack.push(NativeFrame::Array(NativeArrayState::ValueOrEnd));
                    }
                    0x22 => {
                        scan_native_string(source, &mut at, ctx, false)?;
                        complete_native_value(&mut stack, &mut root_done);
                    }
                    0x6e => {
                        scan_native_literal(source, &mut at, b"null", ctx)?;
                        complete_native_value(&mut stack, &mut root_done);
                    }
                    0x74 => {
                        scan_native_literal(source, &mut at, b"true", ctx)?;
                        complete_native_value(&mut stack, &mut root_done);
                    }
                    0x66 => {
                        scan_native_literal(source, &mut at, b"false", ctx)?;
                        complete_native_value(&mut stack, &mut root_done);
                    }
                    0x2d | 0x30..=0x39 => {
                        scan_native_number(source, &mut at, ctx)?;
                        complete_native_value(&mut stack, &mut root_done);
                    }
                    _ => return Err(fail("SYNTAX", "Expected JSON value")),
                }
            }
            NativeAction::ArraySeparator => match source.get(at).copied() {
                Some(0x5d) => {
                    at += 1;
                    stack.pop();
                    complete_native_value(&mut stack, &mut root_done);
                }
                Some(0x2c) => {
                    at += 1;
                    if let Some(NativeFrame::Array(state)) = stack.last_mut() {
                        *state = NativeArrayState::Value;
                    }
                }
                _ => return Err(fail("SYNTAX", "Expected comma or closing bracket")),
            },
            NativeAction::ObjectKey(allow_end) => {
                if allow_end && source.get(at) == Some(&(b'}' as u16)) {
                    at += 1;
                    stack.pop();
                    complete_native_value(&mut stack, &mut root_done);
                    continue;
                }
                if source.get(at) != Some(&(b'"' as u16)) {
                    return Err(fail("SYNTAX", "JSON object keys must be strings"));
                }
                let key = scan_native_string(source, &mut at, ctx, true)?
                    .expect("decoded native key");
                if let Some(NativeFrame::Object(state, seen)) = stack.last_mut() {
                    let comparisons = btree_search_comparisons(seen.len());
                    ctx.charge_work_u64(
                        (key.len() as u64).saturating_mul(comparisons),
                        Utf16::default(),
                    )?;
                    if !seen.insert(key) {
                        duplicate = true;
                    }
                    *state = NativeObjectState::Colon;
                }
            }
            NativeAction::ObjectColon => {
                if source.get(at) != Some(&(b':' as u16)) {
                    return Err(fail("SYNTAX", "Expected colon after JSON object key"));
                }
                at += 1;
                if let Some(NativeFrame::Object(state, _)) = stack.last_mut() {
                    *state = NativeObjectState::Value;
                }
            }
            NativeAction::ObjectSeparator => match source.get(at).copied() {
                Some(0x7d) => {
                    at += 1;
                    stack.pop();
                    complete_native_value(&mut stack, &mut root_done);
                }
                Some(0x2c) => {
                    at += 1;
                    if let Some(NativeFrame::Object(state, _)) = stack.last_mut() {
                        *state = NativeObjectState::Key;
                    }
                }
                _ => return Err(fail("SYNTAX", "Expected comma or closing brace")),
            },
        }
    }
}

fn complete_native_value(stack: &mut [NativeFrame], root_done: &mut bool) {
    match stack.last_mut() {
        Some(NativeFrame::Array(state)) => *state = NativeArrayState::Separator,
        Some(NativeFrame::Object(state, _)) => *state = NativeObjectState::Separator,
        None => *root_done = true,
    }
}

fn scan_native_string(
    source: &[u16],
    at: &mut usize,
    ctx: &mut Context<'_>,
    decode: bool,
) -> Result<Option<Vec<u16>>, EngineError> {
    if source.get(*at) != Some(&(b'"' as u16)) {
        return Err(fail("SYNTAX", "Expected JSON string"));
    }
    *at += 1;
    let mut decoded = decode.then(Vec::new);
    loop {
        let Some(unit) = source.get(*at).copied() else {
            return Err(fail("SYNTAX", "Unterminated JSON string"));
        };
        *at += 1;
        ctx.charge_work(1, Utf16::default())?;
        match unit {
            0x22 => return Ok(decoded),
            0x5c => {
                let Some(escape) = source.get(*at).copied() else {
                    return Err(fail("SYNTAX", "Incomplete JSON escape"));
                };
                *at += 1;
                let value = match escape {
                    0x22 | 0x5c | 0x2f => escape,
                    0x62 => 8,
                    0x66 => 12,
                    0x6e => 10,
                    0x72 => 13,
                    0x74 => 9,
                    0x75 => scan_native_hex_escape(source, at, ctx)?,
                    _ => return Err(fail("SYNTAX", "Invalid JSON escape")),
                };
                if let Some(output) = decoded.as_mut() {
                    output.push(value);
                }
            }
            0x00..=0x1f => {
                return Err(fail("SYNTAX", "Unescaped control character in JSON string"))
            }
            other => {
                if let Some(output) = decoded.as_mut() {
                    output.push(other);
                }
            }
        }
    }
}

fn scan_native_hex_escape(
    source: &[u16],
    at: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<u16, EngineError> {
    let mut value = 0u16;
    for _ in 0..4 {
        let Some(unit) = source.get(*at).copied() else {
            return Err(fail("SYNTAX", "Incomplete Unicode escape"));
        };
        *at += 1;
        ctx.charge_work(1, Utf16::default())?;
        let digit = match unit {
            0x30..=0x39 => unit - 0x30,
            0x41..=0x46 => unit - 0x41 + 10,
            0x61..=0x66 => unit - 0x61 + 10,
            _ => return Err(fail("SYNTAX", "Invalid Unicode escape")),
        };
        value = value * 16 + digit;
    }
    Ok(value)
}

fn scan_native_literal(
    source: &[u16],
    at: &mut usize,
    literal: &[u8],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for expected in literal {
        if source.get(*at).copied() != Some(u16::from(*expected)) {
            return Err(fail("SYNTAX", "Malformed JSON literal"));
        }
        *at += 1;
        ctx.charge_work(1, Utf16::default())?;
    }
    Ok(())
}

fn scan_native_number(
    source: &[u16],
    at: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let start = *at;
    if source.get(*at) == Some(&(b'-' as u16)) {
        *at += 1;
    }
    match source.get(*at).copied() {
        Some(0x30) => {
            *at += 1;
            if source.get(*at).is_some_and(|unit| (0x30..=0x39).contains(unit)) {
                return Err(fail("SYNTAX", "Leading zero in JSON number"));
            }
        }
        Some(0x31..=0x39) => {
            while source.get(*at).is_some_and(|unit| (0x30..=0x39).contains(unit)) {
                *at += 1;
            }
        }
        _ => return Err(fail("SYNTAX", "Malformed JSON number")),
    }
    if source.get(*at) == Some(&(b'.' as u16)) {
        *at += 1;
        let fraction = *at;
        while source.get(*at).is_some_and(|unit| (0x30..=0x39).contains(unit)) {
            *at += 1;
        }
        if fraction == *at {
            return Err(fail("SYNTAX", "Malformed JSON fraction"));
        }
    }
    if source.get(*at).is_some_and(|unit| matches!(*unit, 0x65 | 0x45)) {
        *at += 1;
        if source.get(*at).is_some_and(|unit| matches!(*unit, 0x2b | 0x2d)) {
            *at += 1;
        }
        let exponent = *at;
        while source.get(*at).is_some_and(|unit| (0x30..=0x39).contains(unit)) {
            *at += 1;
        }
        if exponent == *at {
            return Err(fail("SYNTAX", "Malformed JSON exponent"));
        }
    }
    ctx.charge_work(*at - start, Utf16::default())
}

fn native_json_parse_error(error: EngineError) -> EngineError {
    if error.code == "SYNTAX" || error.code == "DUPLICATE_KEY" {
        EngineError::new("JSON_SCHEMA_SYNTAX", error.path, "Invalid native JSON")
    } else {
        error
    }
}

/// Read JSON or YAML into Python's source-preserving value profile. Unlike
/// [`read_json_value`], this path retains Python code-point identity and the
/// distinction between integers and floats. It shares this module's JSON/YAML
/// grammar and event scanner while selecting a Python value builder.
pub fn read_python_value(
    source: &PyText,
    format: Format,
    ctx: &mut Context<'_>,
) -> Result<PythonConsumerValue, EngineError> {
    if ctx.profile() == crate::ResourceProfile::HardIsolated {
        return Err(EngineError::new(
            "RESOURCE_PROFILE_UNAVAILABLE",
            Utf16::default(),
            "HardIsolated resource profile is unavailable",
        ));
    }
    let source_units = source.utf16_unit_len();
    if source_units > ctx.limits().max_text_units {
        return Err(fail("LIMIT", "Source text limit exceeded"));
    }
    ctx.charge_text(source_units, Utf16::default())?;
    match format {
        Format::Json => JsonParser::<_, PythonJsonBuilder>::new(source.codepoints(), ctx).parse(),
        Format::Yaml => parse_python_yaml(source, ctx),
    }
}

/// Write a Python-profile value through the common JSON/YAML emitter grammar.
/// JSON flow syntax is also a valid YAML 1.2 document and keeps quoted Python
/// strings, integer/float identity, and source code points unambiguous.
pub fn write_python_value(
    value: &PythonConsumerValue,
    format: Format,
    ctx: &mut Context<'_>,
) -> Result<PyText, EngineError> {
    if ctx.profile() == crate::ResourceProfile::HardIsolated {
        return Err(EngineError::new(
            "RESOURCE_PROFILE_UNAVAILABLE",
            Utf16::default(),
            "HardIsolated resource profile is unavailable",
        ));
    }
    validate_python_value(value, 0, &mut 0usize, ctx)?;
    let mut measured = CountSink::default();
    write_json_pretty(OutputValue::Python(value), format, &mut measured, 0, ctx)?;
    measured.push_char('\n');
    if measured.units > ctx.limits().max_text_units {
        return Err(fail("LIMIT", "Serialized text limit exceeded"));
    }
    ctx.charge_text(measured.units, Utf16::default())?;
    let mut output = Vec::<u32>::with_capacity(measured.units);
    write_json_pretty(OutputValue::Python(value), format, &mut output, 0, ctx)?;
    output.push(0x0a);
    PyText::from_codepoints(output)
}

fn ascii_points(points: &[u32]) -> Option<String> {
    points
        .iter()
        .map(|p| u8::try_from(*p).ok().filter(u8::is_ascii).map(char::from))
        .collect()
}
fn parse_safe_integer(
    token: &str,
    ctx: &mut Context<'_>,
) -> Result<num_bigint::BigInt, EngineError> {
    let negative = token.starts_with('-');
    let digits = token.strip_prefix(['-', '+']).unwrap_or(token);
    ctx.charge_work(digits.len(), Utf16::default())?;
    let magnitude = parse_safe_magnitude(digits, 10).ok_or_else(|| {
        fail(
            "NUMBER",
            "Integer is outside the interoperable numeric profile",
        )
    })?;
    let value = num_bigint::BigInt::from(magnitude);
    Ok(if negative { -value } else { value })
}

fn parse_safe_magnitude(digits: &str, radix: u32) -> Option<u64> {
    const MAX: u64 = 9_007_199_254_740_991;
    let mut magnitude = 0u64;
    let mut too_large = false;
    for byte in digits.bytes() {
        let digit = (byte as char).to_digit(radix)? as u64;
        if !too_large {
            match magnitude
                .checked_mul(radix as u64)
                .and_then(|value| value.checked_add(digit))
            {
                Some(next) if next <= MAX => magnitude = next,
                _ => too_large = true,
            }
        }
    }
    (!too_large).then_some(magnitude)
}

trait JsonSource {
    fn len(&self) -> usize;
    fn point(&self, index: usize) -> Option<u32>;
}
impl JsonSource for [u16] {
    fn len(&self) -> usize {
        <[u16]>::len(self)
    }
    fn point(&self, index: usize) -> Option<u32> {
        self.get(index).map(|unit| *unit as u32)
    }
}
impl JsonSource for [u32] {
    fn len(&self) -> usize {
        <[u32]>::len(self)
    }
    fn point(&self, index: usize) -> Option<u32> {
        self.get(index).copied()
    }
}
trait JsonBuilder {
    type Text: Clone + Ord;
    type Value;
    fn null(&self) -> Self::Value;
    fn boolean(&self, value: bool) -> Self::Value;
    fn string(&self, points: Vec<(u32, bool)>) -> Result<Self::Text, EngineError>;
    fn string_value(&self, text: Self::Text) -> Self::Value;
    fn number(
        &self,
        token: &str,
        float: bool,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Self::Value, EngineError>;
    fn array(&self, items: Vec<Self::Value>) -> Self::Value;
    fn object(&self, members: Vec<(Self::Text, Self::Value)>) -> Self::Value;
    fn path_text(&self, text: &Self::Text, ctx: &mut Context<'_>) -> Result<Utf16, EngineError>;
}
#[derive(Default)]
struct CoreJsonBuilder;
#[derive(Default)]
struct PythonJsonBuilder;
#[derive(Default)]
struct NativeJsonBuilder;
impl JsonBuilder for CoreJsonBuilder {
    type Text = Utf16;
    type Value = Value;
    fn null(&self) -> Value {
        Value::Null
    }
    fn boolean(&self, value: bool) -> Value {
        Value::Bool(value)
    }
    fn string(&self, points: Vec<(u32, bool)>) -> Result<Utf16, EngineError> {
        Ok(Utf16::new(
            points
                .into_iter()
                .map(|(p, _)| {
                    u16::try_from(p).map_err(|_| fail("SOURCE_ENCODING", "Invalid UTF-16 source"))
                })
                .collect::<Result<_, _>>()?,
        ))
    }
    fn string_value(&self, text: Utf16) -> Value {
        Value::String(text)
    }
    fn number(
        &self,
        token: &str,
        _float: bool,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        ctx.charge_work(token.len().saturating_mul(3), Utf16::default())?;
        let number = token
            .parse::<f64>()
            .map_err(|_| EngineError::new("NUMBER", path.clone(), "Invalid JSON number"))?;
        let source = decimal_canonical(token)
            .ok_or_else(|| EngineError::new("NUMBER", path.clone(), "Invalid decimal number"))?;
        let converted = decimal_canonical(&crate::ecma_number_to_string(number))
            .ok_or_else(|| EngineError::new("NUMBER", path.clone(), "Invalid converted number"))?;
        if source != converted {
            return Err(EngineError::new(
                "NUMBER",
                path.clone(),
                "Parsing would change the decimal value",
            ));
        }
        Value::number(number, path.clone())
    }
    fn array(&self, items: Vec<Value>) -> Value {
        Value::Array(items)
    }
    fn object(&self, members: Vec<(Utf16, Value)>) -> Value {
        Value::Object(members)
    }
    fn path_text(&self, text: &Utf16, _: &mut Context<'_>) -> Result<Utf16, EngineError> {
        Ok(text.clone())
    }
}
impl JsonBuilder for PythonJsonBuilder {
    type Text = PyText;
    type Value = PythonConsumerValue;
    fn null(&self) -> Self::Value {
        PythonConsumerValue::Null
    }
    fn boolean(&self, value: bool) -> Self::Value {
        PythonConsumerValue::Bool(value)
    }
    fn string(&self, points: Vec<(u32, bool)>) -> Result<PyText, EngineError> {
        let mut decoded = Vec::with_capacity(points.len());
        let mut i = 0;
        while i < points.len() {
            let (point, escaped) = points[i];
            if escaped
                && (0xd800..=0xdbff).contains(&point)
                && points.get(i + 1).is_some_and(|(next, from_escape)| {
                    *from_escape && (0xdc00..=0xdfff).contains(next)
                })
            {
                let low = points[i + 1].0;
                decoded.push(0x10000 + (((point - 0xd800) << 10) | (low - 0xdc00)));
                i += 2;
            } else {
                decoded.push(point);
                i += 1;
            }
        }
        PyText::from_codepoints(decoded)
    }
    fn string_value(&self, text: PyText) -> Self::Value {
        PythonConsumerValue::String(text)
    }
    fn number(
        &self,
        token: &str,
        float: bool,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Self::Value, EngineError> {
        let _ = path;
        if !float {
            if token == "-0" {
                return Err(fail("NUMBER", "Negative zero is outside the profile"));
            }
            return Ok(PythonConsumerValue::Integer(parse_safe_integer(
                token, ctx,
            )?));
        }
        ctx.charge_work(token.len().saturating_mul(3), Utf16::default())?;
        let number = token
            .parse::<f64>()
            .map_err(|_| fail("NUMBER", "Invalid JSON number"))?;
        if !number.is_finite()
            || (number == 0.0 && number.is_sign_negative())
            || (number.fract() == 0.0 && number.abs() > 9_007_199_254_740_991.0)
        {
            return Err(fail("NUMBER", "Outside the interoperable numeric profile"));
        }
        let source =
            decimal_canonical(token).ok_or_else(|| fail("NUMBER", "Invalid decimal number"))?;
        let converted = decimal_canonical(&crate::ecma_number_to_string(number))
            .ok_or_else(|| fail("NUMBER", "Invalid converted number"))?;
        if source != converted {
            return Err(fail("NUMBER", "Parsing would change the decimal value"));
        }
        Ok(PythonConsumerValue::Float(number.to_bits()))
    }
    fn array(&self, items: Vec<Self::Value>) -> Self::Value {
        PythonConsumerValue::Array(items)
    }
    fn object(&self, members: Vec<(PyText, Self::Value)>) -> Self::Value {
        PythonConsumerValue::Object(members)
    }
    fn path_text(&self, text: &PyText, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        text.to_utf16(ctx)
    }
}
impl JsonBuilder for NativeJsonBuilder {
    type Text = Utf16;
    type Value = crate::native_json::NativeJsonNode;
    fn null(&self) -> Self::Value {
        crate::native_json::NativeJsonNode::Null
    }
    fn boolean(&self, value: bool) -> Self::Value {
        crate::native_json::NativeJsonNode::Boolean(value)
    }
    fn string(&self, points: Vec<(u32, bool)>) -> Result<Utf16, EngineError> {
        Ok(Utf16::new(
            points
                .into_iter()
                .map(|(point, _)| {
                    u16::try_from(point)
                        .map_err(|_| fail("SOURCE_ENCODING", "Invalid UTF-16 source"))
                })
                .collect::<Result<_, _>>()?,
        ))
    }
    fn string_value(&self, text: Utf16) -> Self::Value {
        crate::native_json::NativeJsonNode::String(text)
    }
    fn number(
        &self,
        token: &str,
        _: bool,
        _: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Self::Value, EngineError> {
        ctx.charge_work(token.len(), Utf16::default())?;
        Ok(crate::native_json::NativeJsonNode::Number(token.to_owned()))
    }
    fn array(&self, items: Vec<Self::Value>) -> Self::Value {
        crate::native_json::NativeJsonNode::Array(items)
    }
    fn object(&self, members: Vec<(Utf16, Self::Value)>) -> Self::Value {
        crate::native_json::NativeJsonNode::Object(members)
    }
    fn path_text(&self, text: &Utf16, _: &mut Context<'_>) -> Result<Utf16, EngineError> {
        Ok(text.clone())
    }
}
struct JsonParser<'a, 'b, 'c, S: ?Sized, B> {
    units: &'a S,
    at: usize,
    ctx: &'b mut Context<'c>,
    values: usize,
    builder: B,
    enforce_tree_limits: bool,
    detect_duplicates: bool,
    create_paths: bool,
}
impl<'a, 'b, 'c, S: JsonSource + ?Sized, B: JsonBuilder + Default> JsonParser<'a, 'b, 'c, S, B> {
    fn new(units: &'a S, ctx: &'b mut Context<'c>) -> Self {
        Self {
            units,
            at: 0,
            ctx,
            values: 0,
            builder: B::default(),
            enforce_tree_limits: true,
            detect_duplicates: true,
            create_paths: true,
        }
    }
    fn native(units: &'a S, ctx: &'b mut Context<'c>) -> Self {
        Self {
            enforce_tree_limits: true,
            detect_duplicates: false,
            create_paths: false,
            ..Self::new(units, ctx)
        }
    }
    fn parse(&mut self) -> Result<B::Value, EngineError> {
        self.ws();
        let root = self.value(0, &Utf16::default())?;
        self.ws();
        if self.at != self.units.len() {
            return Err(fail("SYNTAX", "Trailing JSON source"));
        }
        Ok(root)
    }
    fn ws(&mut self) {
        while self
            .units
            .point(self.at)
            .is_some_and(|p| matches!(p, 0x20 | 0x09 | 0x0a | 0x0d))
        {
            self.at += 1;
        }
    }
    fn take(&mut self, point: u32) -> bool {
        if self.units.point(self.at) == Some(point) {
            self.at += 1;
            true
        } else {
            false
        }
    }
    fn value(&mut self, depth: usize, path: &Utf16) -> Result<B::Value, EngineError> {
        if self.enforce_tree_limits && depth > self.ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "Nesting depth exceeded",
            ));
        }
        if self.enforce_tree_limits {
            self.values = self
                .values
                .checked_add(1)
                .ok_or_else(|| EngineError::new("LIMIT", path.clone(), "Value counter overflow"))?;
            self.ctx.check_tree_value_count(self.values, path.clone())?;
        }
        self.ctx.charge_work(
            1,
            if self.create_paths {
                path.clone()
            } else {
                Utf16::default()
            },
        )?;
        self.ws();
        match self.units.point(self.at) {
            Some(0x6e) => {
                self.keyword("null")?;
                Ok(self.builder.null())
            }
            Some(0x74) => {
                self.keyword("true")?;
                Ok(self.builder.boolean(true))
            }
            Some(0x66) => {
                self.keyword("false")?;
                Ok(self.builder.boolean(false))
            }
            Some(0x22) => {
                let text = self.string()?;
                Ok(self.builder.string_value(text))
            }
            Some(0x5b) => self.array(depth, path),
            Some(0x7b) => self.object(depth, path),
            Some(0x2d | 0x30..=0x39) => self.number(path),
            _ => Err(EngineError::new(
                "SYNTAX",
                path.clone(),
                "Expected JSON value",
            )),
        }
    }
    fn keyword(&mut self, word: &str) -> Result<(), EngineError> {
        for point in word.bytes().map(u32::from) {
            if !self.take(point) {
                return Err(fail("SYNTAX", "Malformed JSON literal"));
            }
        }
        Ok(())
    }
    fn string(&mut self) -> Result<B::Text, EngineError> {
        if !self.take(0x22) {
            return Err(fail("SYNTAX", "Expected JSON string"));
        }
        let mut output = Vec::<(u32, bool)>::new();
        loop {
            let Some(point) = self.units.point(self.at) else {
                return Err(fail("SYNTAX", "Unterminated JSON string"));
            };
            self.at += 1;
            match point {
                0x22 => return self.builder.string(output),
                0x5c => {
                    let Some(escape) = self.units.point(self.at) else {
                        return Err(fail("SYNTAX", "Incomplete JSON escape"));
                    };
                    self.at += 1;
                    match escape {
                        0x22 | 0x5c | 0x2f => output.push((escape, true)),
                        0x62 => output.push((8, true)),
                        0x66 => output.push((12, true)),
                        0x6e => output.push((10, true)),
                        0x72 => output.push((13, true)),
                        0x74 => output.push((9, true)),
                        0x75 => output.push((self.hex_escape()?, true)),
                        _ => return Err(fail("SYNTAX", "Invalid JSON escape")),
                    }
                }
                0x00..=0x1f => {
                    return Err(fail("SYNTAX", "Unescaped control character in JSON string"))
                }
                other => output.push((other, false)),
            }
            self.ctx.charge_work(1, Utf16::default())?;
        }
    }
    fn hex_escape(&mut self) -> Result<u32, EngineError> {
        let mut value = 0u32;
        for _ in 0..4 {
            let Some(point) = self.units.point(self.at) else {
                return Err(fail("SYNTAX", "Incomplete Unicode escape"));
            };
            self.at += 1;
            let digit = match point {
                0x30..=0x39 => point - 0x30,
                0x41..=0x46 => point - 0x41 + 10,
                0x61..=0x66 => point - 0x61 + 10,
                _ => return Err(fail("SYNTAX", "Invalid Unicode escape")),
            };
            value = value * 16 + digit;
        }
        Ok(value)
    }
    fn number(&mut self, path: &Utf16) -> Result<B::Value, EngineError> {
        let start = self.at;
        if self.take(0x2d) && self.at >= self.units.len() {
            return Err(EngineError::new(
                "SYNTAX",
                path.clone(),
                "Incomplete JSON number",
            ));
        }
        if self.take(0x30) {
            if self
                .units
                .point(self.at)
                .is_some_and(|p| (0x30..=0x39).contains(&p))
            {
                return Err(EngineError::new(
                    "SYNTAX",
                    path.clone(),
                    "Leading zero in JSON number",
                ));
            }
        } else {
            let first = self.at;
            while self
                .units
                .point(self.at)
                .is_some_and(|p| (0x30..=0x39).contains(&p))
            {
                self.at += 1;
            }
            if first == self.at {
                return Err(EngineError::new(
                    "SYNTAX",
                    path.clone(),
                    "Malformed JSON number",
                ));
            }
        }
        let mut is_float = false;
        if self.take(0x2e) {
            is_float = true;
            let first = self.at;
            while self
                .units
                .point(self.at)
                .is_some_and(|p| (0x30..=0x39).contains(&p))
            {
                self.at += 1;
            }
            if first == self.at {
                return Err(EngineError::new(
                    "SYNTAX",
                    path.clone(),
                    "Malformed JSON fraction",
                ));
            }
        }
        if self.take(0x65) || self.take(0x45) {
            is_float = true;
            if self
                .units
                .point(self.at)
                .is_some_and(|p| matches!(p, 0x2b | 0x2d))
            {
                self.at += 1;
            }
            let first = self.at;
            while self
                .units
                .point(self.at)
                .is_some_and(|p| (0x30..=0x39).contains(&p))
            {
                self.at += 1;
            }
            if first == self.at {
                return Err(EngineError::new(
                    "SYNTAX",
                    path.clone(),
                    "Malformed JSON exponent",
                ));
            }
        }
        let token_len = self.at - start;
        self.ctx.charge_work(token_len, Utf16::default())?;
        let token = ascii_points(
            &(start..self.at)
                .map(|index| self.units.point(index).unwrap())
                .collect::<Vec<_>>(),
        )
        .ok_or_else(|| fail("SYNTAX", "Malformed JSON number"))?;
        self.builder.number(&token, is_float, path, self.ctx)
    }
    fn array(&mut self, depth: usize, path: &Utf16) -> Result<B::Value, EngineError> {
        self.at += 1;
        self.ws();
        let mut items = Vec::new();
        if self.take(0x5d) {
            return Ok(self.builder.array(items));
        }
        loop {
            let item_path = if self.create_paths {
                append_path(path, &Utf16::from(items.len().to_string()))
            } else {
                Utf16::default()
            };
            items.push(self.value(depth + 1, &item_path)?);
            self.ws();
            if self.take(0x5d) {
                break;
            }
            if !self.take(0x2c) {
                return Err(EngineError::new(
                    "SYNTAX",
                    path.clone(),
                    "Expected comma or closing bracket",
                ));
            }
            self.ws();
        }
        Ok(self.builder.array(items))
    }
    fn object(&mut self, depth: usize, path: &Utf16) -> Result<B::Value, EngineError> {
        self.at += 1;
        self.ws();
        let mut members = Vec::new();
        let mut seen = std::collections::BTreeSet::<B::Text>::new();
        if self.take(0x7d) {
            return Ok(self.builder.object(members));
        }
        loop {
            if self.units.point(self.at) != Some(0x22) {
                return Err(EngineError::new(
                    "SYNTAX",
                    path.clone(),
                    "JSON object keys must be strings",
                ));
            }
            let key = self.string()?;
            let key_path = self.builder.path_text(&key, self.ctx)?;
            if self.detect_duplicates {
                self.ctx.charge_work_u64(
                    (key_path.len() as u64).saturating_mul(btree_search_comparisons(seen.len())),
                    if self.create_paths {
                        path.clone()
                    } else {
                        Utf16::default()
                    },
                )?;
            }
            if self.detect_duplicates && !seen.insert(key.clone()) {
                return Err(EngineError::new(
                    "DUPLICATE_KEY",
                    path.clone(),
                    "Duplicate object key",
                ));
            }
            self.ws();
            if !self.take(0x3a) {
                return Err(EngineError::new(
                    "SYNTAX",
                    path.clone(),
                    "Expected colon after object key",
                ));
            }
            self.ws();
            let child_path = if self.create_paths {
                append_path(path, &key_path)
            } else {
                Utf16::default()
            };
            let value = self.value(depth + 1, &child_path)?;
            members.push((key, value));
            self.ws();
            if self.take(0x7d) {
                break;
            }
            if !self.take(0x2c) {
                return Err(EngineError::new(
                    "SYNTAX",
                    path.clone(),
                    "Expected comma or closing brace",
                ));
            }
            self.ws();
        }
        Ok(self.builder.object(members))
    }
}
fn hex(unit: u16) -> Option<u32> {
    match unit {
        0x30..=0x39 => Some((unit - 0x30) as u32),
        0x41..=0x46 => Some((unit - 0x41 + 10) as u32),
        0x61..=0x66 => Some((unit - 0x61 + 10) as u32),
        _ => None,
    }
}
fn append_path(path: &Utf16, segment: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(0x2f);
    for u in segment.units() {
        match u {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            other => units.push(*other),
        }
    }
    Utf16::new(units)
}

trait OutputSink {
    fn push_point(&mut self, point: u32);
    fn push_char(&mut self, c: char) {
        self.push_point(c as u32)
    }
    fn push_str(&mut self, s: &str);
}
impl OutputSink for String {
    fn push_point(&mut self, point: u32) {
        self.push(char::from_u32(point).expect("writer emits Unicode scalar values"))
    }
    fn push_str(&mut self, s: &str) {
        String::push_str(self, s)
    }
}
#[derive(Default)]
struct CountSink {
    units: usize,
    bytes: usize,
}
impl OutputSink for CountSink {
    fn push_point(&mut self, point: u32) {
        self.units += if point > 0xffff { 2 } else { 1 };
        self.bytes += char::from_u32(point).map(char::len_utf8).unwrap_or(3)
    }
    fn push_str(&mut self, s: &str) {
        self.units += s.encode_utf16().count();
        self.bytes += s.len()
    }
}
impl OutputSink for Vec<u32> {
    fn push_point(&mut self, point: u32) {
        self.push(point)
    }
    fn push_str(&mut self, s: &str) {
        self.extend(s.chars().map(u32::from))
    }
}

pub fn write_json_value(
    value: &Value,
    format: Format,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let value = crate::copy_json(value, ctx)?;
    let mut count = CountSink::default();
    match format {
        Format::Json => {
            write_json_pretty(OutputValue::Core(&value), Format::Json, &mut count, 0, ctx)?
        }
        Format::Yaml => write_yaml(&value, &mut count, 0, ctx)?,
    }
    count.push_char('\n');
    if count.units > ctx.limits().max_text_units {
        return Err(fail("LIMIT", "Serialized text limit exceeded"));
    }
    // Charge the exact public output before allocating its UTF-8 backing
    // buffer. Capacity is exact in bytes, so the render pass cannot grow it.
    ctx.charge_text(count.units, Utf16::default())?;
    let mut out = String::with_capacity(count.bytes);
    match format {
        Format::Json => {
            write_json_pretty(OutputValue::Core(&value), Format::Json, &mut out, 0, ctx)?
        }
        Format::Yaml => write_yaml(&value, &mut out, 0, ctx)?,
    }
    out.push('\n');
    debug_assert_eq!(out.len(), count.bytes);
    Ok(Utf16::from(out))
}

fn poll_output(ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.check_cancelled(Utf16::default())?;
    ctx.check_deadline(Utf16::default())
}
fn pad<S: OutputSink>(out: &mut S, n: usize, c: char) {
    for _ in 0..n {
        out.push_char(c)
    }
}
fn write_hex_escape<S: OutputSink>(out: &mut S, unit: u16, upper: bool) {
    const LOWER: &[u8; 16] = b"0123456789abcdef";
    const UPPER: &[u8; 16] = b"0123456789ABCDEF";
    let digits = if upper { UPPER } else { LOWER };
    out.push_str("\\u");
    for shift in [12, 8, 4, 0] {
        out.push_char(digits[((unit >> shift) & 0xf) as usize] as char);
    }
}
enum OutputValue<'a> {
    Core(&'a Value),
    Python(&'a PythonConsumerValue),
}
enum OutputText<'a> {
    Core(&'a Utf16),
    Python(&'a PyText),
}
fn write_output_text<S: OutputSink>(
    text: OutputText<'_>,
    format: Format,
    out: &mut S,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    out.push_char('"');
    match text {
        OutputText::Core(value) => {
            let units = value.units();
            let mut i = 0;
            while i < units.len() {
                if i % 1024 == 0 {
                    poll_output(ctx)?;
                }
                let u = units[i];
                match u {
                    0x22 => out.push_str("\\\""),
                    0x5c => out.push_str("\\\\"),
                    0x08 => out.push_str("\\b"),
                    0x0c => out.push_str("\\f"),
                    0x0a => out.push_str("\\n"),
                    0x0d => out.push_str("\\r"),
                    0x09 => out.push_str("\\t"),
                    0..=0x1f => write_hex_escape(out, u, false),
                    0xd800..=0xdbff
                        if i + 1 < units.len() && (0xdc00..=0xdfff).contains(&units[i + 1]) =>
                    {
                        let cp = 0x10000
                            + (((u as u32 - 0xd800) << 10) + (units[i + 1] as u32 - 0xdc00));
                        out.push_point(cp);
                        i += 1;
                    }
                    0xd800..=0xdfff => write_hex_escape(out, u, false),
                    _ => out.push_point(u as u32),
                }
                i += 1;
            }
        }
        OutputText::Python(value) => {
            for (index, point) in value.codepoints().iter().copied().enumerate() {
                if index % 1024 == 0 {
                    poll_output(ctx)?;
                }
                match point {
                    0x22 => out.push_str("\\\""),
                    0x5c => out.push_str("\\\\"),
                    0x08 => out.push_str("\\b"),
                    0x0c => out.push_str("\\f"),
                    0x0a => out.push_str("\\n"),
                    0x0d => out.push_str("\\r"),
                    0x09 => out.push_str("\\t"),
                    0..=0x1f => write_hex_escape(out, point as u16, false),
                    0x7f..=0x84 | 0x85..=0x9f | 0xfffe | 0xffff if format == Format::Yaml => {
                        write_hex_escape(out, point as u16, true)
                    }
                    0xd800..=0xdfff if format == Format::Yaml => {
                        write_hex_escape(out, point as u16, true)
                    }
                    _ => out.push_point(point),
                }
            }
        }
    }
    out.push_char('"');
    Ok(())
}
fn write_json_pretty<S: OutputSink>(
    value: OutputValue<'_>,
    format: Format,
    out: &mut S,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    poll_output(ctx)?;
    match value {
        OutputValue::Core(Value::Null) => out.push_str("null"),
        OutputValue::Core(Value::Bool(v)) => out.push_str(if *v { "true" } else { "false" }),
        OutputValue::Core(Value::Number(v)) => out.push_str(&crate::ecma_number_to_string(*v)),
        OutputValue::Core(Value::String(v)) => {
            write_output_text(OutputText::Core(v), format, out, ctx)?
        }
        OutputValue::Python(PythonConsumerValue::Null) => out.push_str("null"),
        OutputValue::Python(PythonConsumerValue::Bool(v)) => {
            out.push_str(if *v { "true" } else { "false" })
        }
        OutputValue::Python(PythonConsumerValue::Integer(v)) => out.push_str(&v.to_string()),
        OutputValue::Python(PythonConsumerValue::Float(bits)) => {
            out.push_str(&python_float_token(f64::from_bits(*bits)))
        }
        OutputValue::Python(PythonConsumerValue::String(v)) => {
            write_output_text(OutputText::Python(v), format, out, ctx)?
        }
        OutputValue::Core(Value::Array(items)) => {
            if items.is_empty() {
                out.push_str("[]")
            } else {
                out.push_str("[\n");
                for (i, item) in items.iter().enumerate() {
                    pad(out, (depth + 1) * 2, ' ');
                    write_json_pretty(OutputValue::Core(item), format, out, depth + 1, ctx)?;
                    if i + 1 < items.len() {
                        out.push_char(',')
                    }
                    out.push_char('\n');
                }
                pad(out, depth * 2, ' ');
                out.push_char(']')
            }
        }
        OutputValue::Python(PythonConsumerValue::Array(items)) => {
            if items.is_empty() {
                out.push_str("[]")
            } else {
                out.push_str("[\n");
                for (i, item) in items.iter().enumerate() {
                    pad(out, (depth + 1) * 2, ' ');
                    write_json_pretty(OutputValue::Python(item), format, out, depth + 1, ctx)?;
                    if i + 1 < items.len() {
                        out.push_char(',')
                    }
                    out.push_char('\n');
                }
                pad(out, depth * 2, ' ');
                out.push_char(']')
            }
        }
        OutputValue::Core(Value::Object(items)) => {
            if items.is_empty() {
                out.push_str("{}")
            } else {
                out.push_str("{\n");
                for (i, index) in enumerable_order_metered(items, ctx)?
                    .into_iter()
                    .enumerate()
                {
                    let (key, item) = &items[index];
                    pad(out, (depth + 1) * 2, ' ');
                    write_output_text(OutputText::Core(key), format, out, ctx)?;
                    out.push_str(": ");
                    write_json_pretty(OutputValue::Core(item), format, out, depth + 1, ctx)?;
                    if i + 1 < items.len() {
                        out.push_char(',')
                    }
                    out.push_char('\n');
                }
                pad(out, depth * 2, ' ');
                out.push_char('}')
            }
        }
        OutputValue::Python(PythonConsumerValue::Object(items)) => {
            if items.is_empty() {
                out.push_str("{}")
            } else {
                out.push_str("{\n");
                // Charge the index buffer before allocation for both formats.
                // YAML additionally sorts by Python's Unicode-code-point order;
                // a conservative comparison bound accounts for long shared
                // prefixes before the comparator can scan them.
                let mut sort_work = items.len() as u64;
                if format == Format::Yaml {
                    let mut total_key_units = 0u64;
                    for (key, _) in items {
                        let len = key.codepoints().len();
                        ctx.charge_work(len, Utf16::default())?;
                        total_key_units = total_key_units.saturating_add(len as u64);
                    }
                    let levels = log2_work_levels(items.len() as u64).max(1);
                    sort_work = sort_work.saturating_add(
                        total_key_units.saturating_mul(levels.saturating_mul(2).max(1)),
                    );
                }
                ctx.charge_work_u64(sort_work, Utf16::default())?;
                let mut order = (0..items.len()).collect::<Vec<_>>();
                if format == Format::Yaml {
                    order.sort_by(|a, b| items[*a].0.codepoints().cmp(items[*b].0.codepoints()));
                }
                for (i, index) in order.into_iter().enumerate() {
                    let (key, item) = &items[index];
                    pad(out, (depth + 1) * 2, ' ');
                    write_output_text(OutputText::Python(key), format, out, ctx)?;
                    out.push_str(": ");
                    write_json_pretty(OutputValue::Python(item), format, out, depth + 1, ctx)?;
                    if i + 1 < items.len() {
                        out.push_char(',')
                    }
                    out.push_char('\n');
                }
                pad(out, depth * 2, ' ');
                out.push_char('}')
            }
        }
    }
    Ok(())
}

fn write_yaml_string<S: OutputSink>(
    value: &Utf16,
    out: &mut S,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    // JSON quoted strings are valid YAML 1.2 double-quoted scalars.
    out.push_char('"');
    let units = value.units();
    let mut i = 0;
    while i < units.len() {
        if i % 1024 == 0 {
            poll_output(ctx)?;
        }
        let u = units[i];
        match u {
            0x22 => out.push_str("\\\""),
            0x5c => out.push_str("\\\\"),
            0x08 => out.push_str("\\b"),
            0x0c => out.push_str("\\f"),
            0x0a => out.push_str("\\n"),
            0x0d => out.push_str("\\r"),
            0x09 => out.push_str("\\t"),
            0xd800..=0xdbff if i + 1 < units.len() && (0xdc00..=0xdfff).contains(&units[i + 1]) => {
                let cp = 0x10000 + (((u as u32 - 0xd800) << 10) + (units[i + 1] as u32 - 0xdc00));
                out.push_char(char::from_u32(cp).unwrap());
                i += 1;
            }
            0xd800..=0xdfff => write_hex_escape(out, u, false),
            0..=0x1f => write_hex_escape(out, u, true),
            _ => out.push_char(
                char::from_u32(u as u32)
                    .ok_or_else(|| fail("SOURCE_ENCODING", "Invalid UTF-16"))?,
            ),
        }
        i += 1;
    }
    out.push_char('"');
    Ok(())
}
fn write_yaml_scalar<S: OutputSink>(
    value: &Value,
    out: &mut S,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(v) => out.push_str(if *v { "true" } else { "false" }),
        Value::Number(v) => out.push_str(&crate::ecma_number_to_string(*v)),
        Value::String(s) => write_yaml_string(s, out, ctx)?,
        Value::Array(_) | Value::Object(_) => write_yaml(value, out, 0, ctx)?,
    }
    Ok(())
}
fn write_yaml<S: OutputSink>(
    value: &Value,
    out: &mut S,
    indent: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    poll_output(ctx)?;
    match value {
        Value::Object(items) if items.is_empty() => out.push_str("{}"),
        Value::Array(items) if items.is_empty() => out.push_str("[]"),
        Value::Object(items) => {
            for (index, member) in enumerable_order_metered(items, ctx)?
                .into_iter()
                .enumerate()
            {
                let (key, value) = &items[member];
                if index > 0 {
                    out.push_char('\n');
                }
                pad(out, indent, ' ');
                write_yaml_string(key, out, ctx)?;
                match value {
                    Value::Array(children) if !children.is_empty() => {
                        out.push_str(":\n");
                        write_yaml(value, out, indent + 2, ctx)?
                    }
                    Value::Object(children) if !children.is_empty() => {
                        out.push_str(":\n");
                        write_yaml(value, out, indent + 2, ctx)?
                    }
                    _ => {
                        out.push_str(": ");
                        write_yaml_scalar(value, out, ctx)?
                    }
                }
            }
        }
        Value::Array(items) => {
            for (index, value) in items.iter().enumerate() {
                if index > 0 {
                    out.push_char('\n');
                }
                pad(out, indent, ' ');
                out.push_char('-');
                match value {
                    Value::Array(children) if !children.is_empty() => {
                        out.push_char('\n');
                        write_yaml(value, out, indent + 2, ctx)?
                    }
                    Value::Object(children) if !children.is_empty() => {
                        out.push_char('\n');
                        write_yaml(value, out, indent + 2, ctx)?
                    }
                    _ => {
                        out.push_char(' ');
                        write_yaml_scalar(value, out, ctx)?
                    }
                }
            }
        }
        _ => write_yaml_scalar(value, out, ctx)?,
    }
    Ok(())
}

fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

#[derive(Debug)]
enum YamlFrame<T, V> {
    Seq(Vec<V>),
    Map { values: Vec<(T, V)>, key: Option<T> },
}

#[derive(Clone)]
struct LocatedEvent {
    event: Event<'static>,
    start: usize,
    end: usize,
}

fn yaml_events_with_profile(
    text: &str,
    profile: ScanProfile,
) -> Result<Vec<LocatedEvent>, EngineError> {
    struct Events(Vec<LocatedEvent>);
    impl<'a> saphyr_parser::SpannedEventReceiver<'a> for Events {
        fn on_event(&mut self, event: Event<'a>, span: saphyr_parser::Span) {
            let event = match event {
                Event::Scalar(s, style, anchor, tag) => Event::Scalar(
                    std::borrow::Cow::Owned(s.into_owned()),
                    style,
                    anchor,
                    tag.map(|x| std::borrow::Cow::Owned(x.into_owned())),
                ),
                Event::SequenceStart(a, t) => {
                    Event::SequenceStart(a, t.map(|x| std::borrow::Cow::Owned(x.into_owned())))
                }
                Event::MappingStart(a, t) => {
                    Event::MappingStart(a, t.map(|x| std::borrow::Cow::Owned(x.into_owned())))
                }
                Event::Alias(a) => Event::Alias(a),
                Event::SequenceEnd => Event::SequenceEnd,
                Event::MappingEnd => Event::MappingEnd,
                Event::StreamStart => Event::StreamStart,
                Event::StreamEnd => Event::StreamEnd,
                Event::DocumentStart(x) => Event::DocumentStart(x),
                Event::DocumentEnd => Event::DocumentEnd,
                Event::Nothing => Event::Nothing,
            };
            self.0.push(LocatedEvent {
                event,
                start: span.start.index(),
                end: span.end.index(),
            });
        }
    }
    let mut events = Events(Vec::new());
    Parser::new_from_str_with_profile(text, profile)
        .keep_tags(true)
        .load(&mut events, true)
        .map_err(|e| fail("YAML_SYNTAX", &e.to_string()))?;
    Ok(events.0)
}

fn parse_yaml_utf16(source: &[u16], ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let (events, prefix) = prepare_yaml_events(source, ScanProfile::Yaml12, ctx)?;
    let mut value = parse_yaml_events::<CoreYamlBuilder>(events, ctx, CoreYamlBuilder)?;
    decode_private_value(&mut value, prefix)?;
    Ok(value)
}

fn prepare_yaml_events(
    source: &[u16],
    profile: ScanProfile,
    ctx: &mut Context<'_>,
) -> Result<(Vec<LocatedEvent>, (char, char)), EngineError> {
    // YAML permits one stream BOM; keeping it out of both private views
    // leaves their spans aligned with the corresponding original source slice.
    let source = source.strip_prefix(&[0xfeff]).unwrap_or(source);
    // Budget both private source views before allocating either one. The final
    // adapter can expand each isolated unit to a seven-character token.
    let private_work = source
        .len()
        .checked_mul(8)
        .ok_or_else(|| fail("LIMIT", "YAML private-view size overflow"))?;
    ctx.charge_work(private_work, Utf16::default())?;
    let mut first_chars = Vec::with_capacity(source.len());
    let mut i = 0;
    let mut next_poll = 0;
    while i < source.len() {
        if i >= next_poll {
            ctx.charge_work(0, Utf16::default())?;
            next_poll = i + 1024;
        }
        let u = source[i];
        if (0xd800..=0xdbff).contains(&u)
            && source
                .get(i + 1)
                .is_some_and(|v| (0xdc00..=0xdfff).contains(v))
        {
            let cp = 0x10000 + (((u as u32 - 0xd800) << 10) + (source[i + 1] as u32 - 0xdc00));
            first_chars.push(char::from_u32(cp).unwrap());
            i += 2;
        } else if (0xd800..=0xdfff).contains(&u) {
            first_chars.push('\u{e000}');
            i += 1;
        } else {
            first_chars.push(char::from_u32(u as u32).unwrap());
            i += 1;
        }
    }
    rewrite_surrogate_escape_slashes(&mut first_chars, None, ctx)?;
    let first_text: String = first_chars.iter().collect();
    reject_yaml_11_directive(&first_text, profile)?;
    let first = yaml_events_with_profile(&first_text, profile)?;
    let quoted_ranges: Vec<(usize, usize)> = first
        .iter()
        .filter_map(|located| match &located.event {
            Event::Scalar(_, ScalarStyle::DoubleQuoted, _, _) => Some((located.start, located.end)),
            _ => None,
        })
        .collect();
    let mut decoded = Vec::<Vec<char>>::new();
    for located in &first {
        if let Event::Scalar(text, _, _, _) = &located.event {
            decoded.push(text.chars().collect());
        }
    }
    let prefix = choose_private_prefix(&decoded, ctx)?;
    let mut final_chars = Vec::with_capacity(first_chars.len());
    let mut source_index = 0usize;
    let mut char_index = 0usize;
    let mut next_poll = 0;
    while source_index < source.len() {
        if source_index >= next_poll {
            ctx.charge_work(0, Utf16::default())?;
            next_poll = source_index + 1024;
        }
        let u = source[source_index];
        if (0xd800..=0xdbff).contains(&u)
            && source
                .get(source_index + 1)
                .is_some_and(|v| (0xdc00..=0xdfff).contains(v))
        {
            let cp = 0x10000
                + (((u as u32 - 0xd800) << 10) + (source[source_index + 1] as u32 - 0xdc00));
            final_chars.push(char::from_u32(cp).unwrap());
            source_index += 2;
            char_index += 1;
        } else if (0xd800..=0xdfff).contains(&u) {
            push_private_token(&mut final_chars, prefix, u);
            source_index += 1;
            char_index += 1;
        } else {
            let c = char::from_u32(u as u32).unwrap();
            if c == '\\' && is_double_quoted_index_metered(char_index, &quoted_ranges, ctx)? {
                if let Some((length, unit)) = surrogate_escape_at(source, source_index) {
                    let preceding = source_index
                        .checked_sub(1)
                        .map(|prev| {
                            let mut n = 0;
                            let mut at = prev;
                            while source[at] == 0x5c {
                                n += 1;
                                if at == 0 {
                                    break;
                                }
                                at -= 1;
                            }
                            n
                        })
                        .unwrap_or(0);
                    if preceding % 2 == 0 {
                        push_private_token(&mut final_chars, prefix, unit);
                        source_index += length;
                        char_index += length;
                        continue;
                    }
                }
            }
            final_chars.push(c);
            source_index += 1;
            char_index += 1;
        }
    }
    let final_text: String = final_chars.iter().collect();
    let final_events = yaml_events_with_profile(&final_text, profile)?;
    if !same_yaml_structure(&first, &final_events) {
        return Err(fail(
            "YAML_PROFILE",
            "YAML surrogate adaptation changed the parse structure",
        ));
    }
    Ok((final_events, prefix))
}

fn rewrite_surrogate_escape_slashes(
    chars: &mut [char],
    ranges: Option<&[(usize, usize)]>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut i = 0;
    let mut next_poll = 0;
    while i < chars.len() {
        if i >= next_poll {
            ctx.charge_work(0, Utf16::default())?;
            next_poll = i + 1024;
        }
        if chars[i] == '\\'
            && match ranges {
                Some(ranges) => is_double_quoted_index_metered(i, ranges, ctx)?,
                None => true,
            }
        {
            if let Some((length, _)) = surrogate_escape_chars(chars, i) {
                let mut preceding = 0;
                let mut j = i;
                while j > 0 && chars[j - 1] == '\\' {
                    preceding += 1;
                    j -= 1;
                }
                if preceding % 2 == 0 {
                    chars[i] = '\u{e000}';
                    i += length;
                    continue;
                }
            }
        }
        i += 1;
    }
    Ok(())
}
fn surrogate_escape_chars(chars: &[char], i: usize) -> Option<(usize, u16)> {
    let (length, digit_start) = if chars.get(i + 1) == Some(&'u') {
        (6, 2)
    } else if chars.get(i + 1) == Some(&'U') {
        (10, 2)
    } else {
        return None;
    };
    if i + length > chars.len() {
        return None;
    }
    let mut n = 0u32;
    for c in &chars[i + digit_start..i + length] {
        n = n.checked_mul(16)?.checked_add(c.to_digit(16)?)?;
    }
    if (length == 6 && (0xd800..=0xdfff).contains(&n))
        || (length == 10 && (0xd800..=0xdfff).contains(&n))
    {
        Some((length, n as u16))
    } else {
        None
    }
}
fn surrogate_escape_at(source: &[u16], i: usize) -> Option<(usize, u16)> {
    let (length, digit_count) = match source.get(i + 1).copied()? {
        0x75 => (6, 4),
        0x55 => (10, 8),
        _ => return None,
    };
    let end = i.checked_add(length)?;
    if end > source.len() {
        return None;
    }
    let mut value = 0u32;
    for unit in &source[i + 2..end] {
        value = value.checked_mul(16)?.checked_add(hex(*unit)?)?;
    }
    if (digit_count == 4 && (0xd800..=0xdfff).contains(&value))
        || (digit_count == 8 && (0xd800..=0xdfff).contains(&value))
    {
        Some((length, value as u16))
    } else {
        None
    }
}
fn push_private_token(out: &mut Vec<char>, prefix: (char, char), unit: u16) {
    out.push(prefix.0);
    out.push(prefix.1);
    for c in format!("{unit:04X}").chars() {
        out.push(c);
    }
    out.push(';');
}
fn is_double_quoted_index_metered(
    index: usize,
    ranges: &[(usize, usize)],
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    // Charge the maximum partition-point comparisons before the binary search.
    let comparisons = (usize::BITS - ranges.len().max(1).leading_zeros()) as usize + 1;
    ctx.charge_work(comparisons, Utf16::default())?;
    let at = ranges.partition_point(|(_, end)| *end <= index);
    Ok(ranges
        .get(at)
        .is_some_and(|(start, end)| *start <= index && index < *end))
}
fn choose_private_prefix(
    scalars: &[Vec<char>],
    ctx: &mut Context<'_>,
) -> Result<(char, char), EngineError> {
    let pairs = scalars
        .iter()
        .map(|s| {
            s.windows(2)
                .filter(|w| is_private_use(w[0]) && is_private_use(w[1]))
                .count()
        })
        .sum::<usize>();
    let sort_work = (pairs as u64).saturating_mul(log2_work_levels(pairs as u64).saturating_add(2));
    ctx.charge_work_u64(sort_work, Utf16::default())?;
    let mut used = Vec::<u32>::with_capacity(pairs);
    for scalar in scalars {
        for pair in scalar.windows(2) {
            if is_private_use(pair[0]) && is_private_use(pair[1]) {
                let a = pair[0] as u32 - 0xe000;
                let b = pair[1] as u32 - 0xe000;
                used.push(a * 6399 + b - u32::from(b > a));
            }
        }
    }
    used.sort_unstable();
    used.dedup();
    let mut candidate = 0u32;
    for pair in used {
        if pair == candidate {
            candidate += 1;
        } else if pair > candidate {
            break;
        }
    }
    if candidate >= 6400 * 6399 {
        return Err(fail(
            "YAML_PROFILE",
            "No collision-free private token prefix found",
        ));
    }
    let a = 0xe000 + candidate / 6399;
    let b_index = candidate % 6399;
    let a_index = candidate / 6399;
    let b = 0xe000 + b_index + u32::from(b_index >= a_index);
    Ok((char::from_u32(a).unwrap(), char::from_u32(b).unwrap()))
}
fn is_private_use(c: char) -> bool {
    (0xe000..=0xf8ff).contains(&(c as u32))
}
fn same_yaml_structure(a: &[LocatedEvent], b: &[LocatedEvent]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).all(|(a, b)| match (&a.event, &b.event) {
        (Event::Scalar(_, sa, aa, ta), Event::Scalar(_, sb, ab, tb)) => {
            sa == sb && aa == ab && ta == tb
        }
        (Event::SequenceStart(aa, ta), Event::SequenceStart(ab, tb)) => aa == ab && ta == tb,
        (Event::MappingStart(aa, ta), Event::MappingStart(ab, tb)) => aa == ab && ta == tb,
        (Event::Alias(a), Event::Alias(b)) => a == b,
        (Event::DocumentStart(a), Event::DocumentStart(b)) => a == b,
        (Event::SequenceEnd, Event::SequenceEnd)
        | (Event::MappingEnd, Event::MappingEnd)
        | (Event::DocumentEnd, Event::DocumentEnd)
        | (Event::StreamStart, Event::StreamStart)
        | (Event::StreamEnd, Event::StreamEnd)
        | (Event::Nothing, Event::Nothing) => true,
        _ => false,
    })
}
fn decode_private_value(value: &mut Value, prefix: (char, char)) -> Result<(), EngineError> {
    match value {
        Value::String(text) => decode_private_utf16(text, prefix)?,
        Value::Array(items) => {
            for v in items {
                decode_private_value(v, prefix)?
            }
        }
        Value::Object(items) => {
            for (k, v) in items {
                decode_private_utf16(k, prefix)?;
                decode_private_value(v, prefix)?
            }
        }
        _ => {}
    }
    Ok(())
}
fn decode_private_utf16(text: &mut Utf16, prefix: (char, char)) -> Result<(), EngineError> {
    let utf8 = text.to_utf8().map_err(|_| {
        fail(
            "YAML_PROFILE",
            "Parser produced invalid UTF-16 before private-token decoding",
        )
    })?;
    let chars: Vec<char> = utf8.chars().collect();
    let mut units = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if i + 7 <= chars.len()
            && chars[i] == prefix.0
            && chars[i + 1] == prefix.1
            && chars[i + 2..i + 6].iter().all(|c| c.is_ascii_hexdigit())
            && chars[i + 6] == ';'
        {
            let hex: String = chars[i + 2..i + 6].iter().collect();
            units.push(
                u16::from_str_radix(&hex, 16)
                    .map_err(|_| fail("YAML_PROFILE", "Malformed private token"))?,
            );
            i += 7;
        } else {
            let mut buf = [0u16; 2];
            let encoded = chars[i].encode_utf16(&mut buf);
            units.extend_from_slice(encoded);
            i += 1;
        }
    }
    *text = Utf16::new(units);
    Ok(())
}
fn reject_yaml_11_directive(text: &str, profile: ScanProfile) -> Result<(), EngineError> {
    // YAML directive separation is space or tab, and an initial BOM is legal.
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut start = 0usize;
    while start <= text.len() {
        let rest = &text[start..];
        let mut end = text.len();
        let mut separator = None;
        for (offset, c) in rest.char_indices() {
            if matches!(c, '\n' | '\r')
                || (profile == ScanProfile::PythonRuamel12
                    && matches!(c, '\u{0085}' | '\u{2028}' | '\u{2029}'))
            {
                end = start + offset;
                separator = Some(c);
                break;
            }
        }
        let line = &text[start..end];
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            // Continue below to advance across this physical scanner line.
        } else if line.starts_with("---") {
            break;
        } else if let Some(directive) = line.strip_prefix('%') {
            let mut tokens = directive
                .split([' ', '\t'])
                .filter(|token| !token.is_empty());
            match tokens.next() {
                Some("YAML") => match tokens.next() {
                    Some("1.1") => return Err(fail("YAML_VERSION", "YAML 1.1 is not supported")),
                    Some("1.2") => {}
                    _ => return Err(fail("YAML_DIRECTIVE", "Unsupported YAML version")),
                },
                Some("TAG") => {}
                // The selected scanner profile has already validated and
                // consumed unknown directives using its reserved-directive
                // grammar. They are intentionally ignored here, as ruamel
                // does; this preflight owns only the version policy.
                _ if profile == ScanProfile::PythonRuamel12 => {}
                _ => {
                    return Err(fail(
                        "YAML_DIRECTIVE",
                        "Unknown or unsupported YAML directive",
                    ))
                }
            }
        } else {
            break;
        }
        let Some(separator) = separator else { break };
        start = end + separator.len_utf8();
        if separator == '\r' && text[start..].starts_with('\n') {
            start += 1;
        }
    }
    Ok(())
}

trait YamlBuilder {
    type Text: Clone + Ord;
    type Value;
    fn scalar(
        &self,
        raw: &str,
        style: ScalarStyle,
        tagged: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Self::Value, EngineError>;
    fn validate_key_scalar(
        &self,
        _raw: &str,
        _style: ScalarStyle,
        _tagged: bool,
        _ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        Ok(())
    }
    fn into_key(&self, value: Self::Value) -> Result<Self::Text, EngineError>;
    fn key_len(&self, text: &Self::Text) -> usize;
    fn array(&self, items: Vec<Self::Value>) -> Self::Value;
    fn object(&self, items: Vec<(Self::Text, Self::Value)>) -> Self::Value;
    fn null(&self) -> Self::Value;
}
#[derive(Default)]
struct CoreYamlBuilder;
#[derive(Default)]
struct PythonYamlBuilder;
impl YamlBuilder for CoreYamlBuilder {
    type Text = Utf16;
    type Value = Value;
    fn scalar(
        &self,
        raw: &str,
        style: ScalarStyle,
        tagged: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        resolve_scalar(raw, style, tagged, ctx)
    }
    fn into_key(&self, value: Value) -> Result<Utf16, EngineError> {
        let Value::String(key) = value else {
            return Err(fail("YAML_KEY", "Mapping keys must be strings"));
        };
        Ok(key)
    }
    fn key_len(&self, text: &Utf16) -> usize {
        text.len()
    }
    fn array(&self, items: Vec<Value>) -> Value {
        Value::Array(items)
    }
    fn object(&self, items: Vec<(Utf16, Value)>) -> Value {
        Value::Object(items)
    }
    fn null(&self) -> Value {
        Value::Null
    }
}
impl YamlBuilder for PythonYamlBuilder {
    type Text = PyText;
    type Value = PythonConsumerValue;
    fn scalar(
        &self,
        raw: &str,
        style: ScalarStyle,
        tagged: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Self::Value, EngineError> {
        resolve_python_scalar(raw, style, tagged, ctx)
    }
    fn validate_key_scalar(
        &self,
        raw: &str,
        style: ScalarStyle,
        tagged: bool,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(raw.encode_utf16().count(), Utf16::default())?;
        if !tagged && style == ScalarStyle::Plain && python_yaml_timestamp_resolves(raw) {
            return Err(fail("YAML_KEY", "Mappings require string keys"));
        }
        Ok(())
    }
    fn into_key(&self, value: Self::Value) -> Result<Self::Text, EngineError> {
        let PythonConsumerValue::String(key) = value else {
            return Err(fail("YAML_KEY", "Mappings require string keys"));
        };
        Ok(key)
    }
    fn key_len(&self, text: &PyText) -> usize {
        text.len()
    }
    fn array(&self, items: Vec<Self::Value>) -> Self::Value {
        PythonConsumerValue::Array(items)
    }
    fn object(&self, items: Vec<(PyText, Self::Value)>) -> Self::Value {
        PythonConsumerValue::Object(items)
    }
    fn null(&self) -> Self::Value {
        PythonConsumerValue::Null
    }
}
fn parse_yaml_events<B: YamlBuilder>(
    events: Vec<LocatedEvent>,
    ctx: &mut Context<'_>,
    builder: B,
) -> Result<B::Value, EngineError> {
    let mut stack: Vec<YamlFrame<B::Text, B::Value>> = Vec::new();
    let mut root = None;
    let mut documents = 0usize;
    let mut values = 0usize;
    for located in events {
        let event = located.event;
        ctx.charge_work(1, Utf16::default())?;
        match event {
            Event::DocumentStart(_) => {
                documents += 1;
                if documents > 1 {
                    return Err(fail(
                        "YAML_DOCUMENTS",
                        "Exactly one YAML document is required",
                    ));
                }
            }
            Event::Alias(_) => return Err(fail("YAML_ALIAS", "YAML aliases are not allowed")),
            Event::Scalar(raw, style, anchor, tag) => {
                let _ = anchor;
                let is_key = matches!(stack.last(), Some(YamlFrame::Map { key: None, .. }));
                if is_key {
                    builder.validate_key_scalar(&raw, style, tag.is_some(), ctx)?;
                }
                if !is_key {
                    if stack.len() > ctx.limits().max_depth {
                        return Err(fail("LIMIT", "Nesting depth exceeded"));
                    }
                    values += 1;
                    ctx.check_tree_value_count(values, Utf16::default())?;
                }
                let scalar = builder.scalar(&raw, style, tag.is_some(), ctx)?;
                add_yaml_value(scalar, &mut stack, &mut root, &builder)?;
            }
            Event::SequenceStart(anchor, tag) => {
                let _ = anchor;
                if tag.is_some() {
                    return Err(fail("YAML_TAG", "Explicit YAML tags are not allowed"));
                }
                if stack.len() > ctx.limits().max_depth {
                    return Err(fail("LIMIT", "Nesting depth exceeded"));
                }
                stack.push(YamlFrame::Seq(Vec::new()));
            }
            Event::MappingStart(anchor, tag) => {
                let _ = anchor;
                if tag.is_some() {
                    return Err(fail("YAML_TAG", "Explicit YAML tags are not allowed"));
                }
                if stack.len() > ctx.limits().max_depth {
                    return Err(fail("LIMIT", "Nesting depth exceeded"));
                }
                stack.push(YamlFrame::Map {
                    values: Vec::new(),
                    key: None,
                });
            }
            Event::SequenceEnd => {
                let Some(YamlFrame::Seq(items)) = stack.pop() else {
                    return Err(fail("YAML_SYNTAX", "Unexpected sequence end"));
                };
                add_yaml_value(builder.array(items), &mut stack, &mut root, &builder)?;
                values += 1;
                ctx.check_tree_value_count(values, Utf16::default())?;
            }
            Event::MappingEnd => {
                let Some(YamlFrame::Map {
                    values: members,
                    key: None,
                }) = stack.pop()
                else {
                    return Err(fail("YAML_SYNTAX", "Unexpected or incomplete mapping"));
                };
                ctx.charge_work_u64(order_work(members.len()), Utf16::default())?;
                let mut seen = std::collections::BTreeSet::new();
                for (index, (name, _)) in members.iter().enumerate() {
                    ctx.charge_work_u64(
                        (builder.key_len(name) as u64)
                            .saturating_mul(btree_search_comparisons(index)),
                        Utf16::default(),
                    )?;
                    if !seen.insert(name) {
                        return Err(fail("DUPLICATE_KEY", "Duplicate mapping key"));
                    }
                }
                add_yaml_value(builder.object(members), &mut stack, &mut root, &builder)?;
                values += 1;
                ctx.check_tree_value_count(values, Utf16::default())?;
            }
            Event::StreamStart | Event::StreamEnd | Event::DocumentEnd | Event::Nothing => {}
        }
    }
    if !stack.is_empty() {
        return Err(fail("YAML_SYNTAX", "Unclosed YAML collection"));
    }
    Ok(root.unwrap_or_else(|| builder.null()))
}
fn add_yaml_value<B: YamlBuilder>(
    value: B::Value,
    stack: &mut [YamlFrame<B::Text, B::Value>],
    root: &mut Option<B::Value>,
    builder: &B,
) -> Result<(), EngineError> {
    match stack.last_mut() {
        None => {
            if root.replace(value).is_some() {
                return Err(fail("YAML_DOCUMENTS", "Multiple root values"));
            }
        }
        Some(YamlFrame::Seq(items)) => items.push(value),
        Some(YamlFrame::Map { values, key }) => {
            if let Some(name) = key.take() {
                values.push((name, value));
            } else {
                *key = Some(builder.into_key(value)?);
            }
        }
    }
    Ok(())
}

fn parse_python_yaml(
    source: &PyText,
    ctx: &mut Context<'_>,
) -> Result<PythonConsumerValue, EngineError> {
    if source.codepoints().iter().any(|point| {
        matches!(point, 0x00..=0x08 | 0x0b..=0x0c | 0x0e..=0x1f | 0x7f..=0x84 | 0x86..=0x9f | 0xfffe | 0xffff)
    }) {
        return Err(fail(
            "YAML_SYNTAX",
            "Source contains a character forbidden by the Python YAML reader",
        ));
    }
    // ruamel's Python reader rejects raw surrogate source code points. Escaped
    // surrogates are handled by the collision-free private-token adapter below.
    if source
        .codepoints()
        .iter()
        .any(|point| (0xd800..=0xdfff).contains(point))
    {
        return Err(fail(
            "YAML_SYNTAX",
            "Raw surrogate code points are not valid YAML source",
        ));
    }
    let units = source.to_utf16(ctx)?;
    let (events, prefix) = prepare_yaml_events(units.units(), ScanProfile::PythonRuamel12, ctx)?;
    let mut value = parse_yaml_events::<PythonYamlBuilder>(events, ctx, PythonYamlBuilder)?;
    decode_private_python_value(&mut value, prefix, ctx)?;
    check_python_duplicate_keys(&value, ctx)?;
    Ok(value)
}

fn resolve_python_scalar(
    raw: &str,
    style: ScalarStyle,
    tagged: bool,
    ctx: &mut Context<'_>,
) -> Result<PythonConsumerValue, EngineError> {
    if tagged {
        return Err(fail("YAML_TAG", "Explicit YAML tags are not allowed"));
    }
    if style != ScalarStyle::Plain {
        return Ok(PythonConsumerValue::String(PyText::from_utf8(raw)));
    }
    ctx.charge_work(raw.encode_utf16().count(), Utf16::default())?;
    // ruamel's YAML 1.2 resolver gives these two plain spellings semantic
    // tags which this value profile deliberately cannot represent.
    if raw == "<<" || raw == "=" {
        return Err(fail("YAML_TAG", "Unsupported implicit YAML scalar tag"));
    }
    match raw {
        "" | "~" | "null" | "Null" | "NULL" => return Ok(PythonConsumerValue::Null),
        "true" | "True" | "TRUE" => return Ok(PythonConsumerValue::Bool(true)),
        "false" | "False" | "FALSE" => return Ok(PythonConsumerValue::Bool(false)),
        ".inf" | ".Inf" | ".INF" | "-.inf" | "-.Inf" | "-.INF" | "+.inf" | "+.Inf" | "+.INF"
        | ".nan" | ".NaN" | ".NAN" => {
            return Err(fail("NUMBER", "Non-finite numbers are not supported"))
        }
        _ => {}
    }
    let Some(token) = yaml_python_number(raw) else {
        return Ok(PythonConsumerValue::String(PyText::from_utf8(raw)));
    };
    ctx.charge_work(raw.len().saturating_mul(3), Utf16::default())?;
    match token {
        PythonYamlNumber::Integer {
            digits,
            radix,
            negative,
        } => {
            if radix == 2 {
                return Err(fail("NUMBER", "Invalid literal for decimal integer parser"));
            }
            ctx.charge_work(digits.len(), Utf16::default())?;
            if digits.is_empty() {
                return Err(fail("NUMBER", "Invalid integer scalar"));
            }
            let magnitude = parse_safe_magnitude(&digits, radix).ok_or_else(|| {
                fail(
                    "NUMBER",
                    "Integer is outside the interoperable numeric profile",
                )
            })?;
            if negative && magnitude == 0 {
                return Err(fail("NUMBER", "Negative zero is outside the profile"));
            }
            let value = BigInt::from(magnitude);
            Ok(PythonConsumerValue::Integer(if negative {
                -value
            } else {
                value
            }))
        }
        PythonYamlNumber::Float { spelling } => {
            let normalized = spelling.replace('_', "");
            let number = normalized
                .parse::<f64>()
                .map_err(|_| fail("NUMBER", "Invalid numeric scalar"))?;
            if !number.is_finite()
                || (number == 0.0 && number.is_sign_negative())
                || (number.fract() == 0.0 && number.abs() > 9_007_199_254_740_991.0)
            {
                return Err(fail("NUMBER", "Outside the interoperable numeric profile"));
            }
            let source = decimal_canonical(&normalized)
                .ok_or_else(|| fail("NUMBER", "Malformed decimal source token"))?;
            let rendered = crate::ecma_number_to_string(number);
            let converted = decimal_canonical(&rendered)
                .ok_or_else(|| fail("NUMBER", "Malformed converted number"))?;
            if source != converted {
                return Err(fail("NUMBER", "Parsing would change the decimal value"));
            }
            Ok(PythonConsumerValue::Float(number.to_bits()))
        }
    }
}
enum PythonYamlNumber {
    Integer {
        digits: String,
        radix: u32,
        negative: bool,
    },
    Float {
        spelling: String,
    },
}
fn yaml_python_number(raw: &str) -> Option<PythonYamlNumber> {
    // Match ruamel.yaml's YAML 1.2 implicit resolver, including its first
    // character dispatch. The tag resolver runs before conversion: some
    // lexically tagged integers (notably binary and 0x_) then fail in the
    // predecessor's decimal/hex/octal conversion step.
    let first = raw.chars().next()?;
    if !matches!(first, '-' | '+' | '.' | '0'..='9') {
        return None;
    }
    if yaml_python_float_resolves(raw) {
        return Some(PythonYamlNumber::Float {
            spelling: raw.replace('_', ""),
        });
    }
    if yaml_python_integer_resolves(raw) {
        let (negative, body) = if let Some(rest) = raw.strip_prefix('-') {
            (true, rest)
        } else if let Some(rest) = raw.strip_prefix('+') {
            (false, rest)
        } else {
            (false, raw)
        };
        if let Some(digits) = body.strip_prefix("0b") {
            return Some(PythonYamlNumber::Integer {
                digits: digits.replace('_', ""),
                radix: 2,
                negative,
            });
        }
        for (prefix, radix) in [("0x", 16), ("0o", 8)] {
            if let Some(digits) = body.strip_prefix(prefix) {
                return Some(PythonYamlNumber::Integer {
                    digits: digits.replace('_', ""),
                    radix,
                    negative,
                });
            }
        }
        let digits = body.replace('_', "");
        return Some(PythonYamlNumber::Integer {
            digits,
            radix: 10,
            negative,
        });
    }
    None
}

fn yaml_python_float_resolves(raw: &str) -> bool {
    let body = raw
        .strip_prefix('+')
        .or_else(|| raw.strip_prefix('-'))
        .unwrap_or(raw);
    let (mantissa, exponent) = match body.find(['e', 'E']) {
        Some(index) => (&body[..index], Some(&body[index + 1..])),
        None => (body, None),
    };
    let exponent_signed_digits = |value: &str, sign_required: bool| {
        let digits = if let Some(rest) = value.strip_prefix('+').or_else(|| value.strip_prefix('-'))
        {
            rest
        } else if sign_required {
            return false;
        } else {
            value
        };
        !digits.is_empty() && digits.bytes().all(|byte| byte.is_ascii_digit())
    };
    let exponent_general = exponent.is_none_or(|value| exponent_signed_digits(value, false));
    let digits_underscores = |value: &str| {
        value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || byte == b'_')
    };
    if let Some((whole, fraction)) = mantissa.split_once('.') {
        if mantissa.matches('.').count() != 1 || !exponent_general {
            return false;
        }
        let whole_ok = whole.is_empty()
            || (whole.as_bytes()[0].is_ascii_digit()
                && whole
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || byte == b'_'));
        let fraction_ok = digits_underscores(fraction);
        if whole_ok && fraction_ok && (!whole.is_empty() || !fraction.is_empty()) {
            // The leading-dot alternative in ruamel's resolver requires an
            // explicit exponent sign; the whole-number alternative does not.
            return exponent.is_none()
                || !whole.is_empty()
                || exponent.is_some_and(|value| exponent_signed_digits(value, true));
        }
        return false;
    }
    if let Some(exponent) = exponent {
        return !mantissa.is_empty()
            && mantissa.as_bytes()[0].is_ascii_digit()
            && mantissa
                .bytes()
                .all(|byte| byte.is_ascii_digit() || byte == b'_')
            && exponent_signed_digits(exponent, false);
    }
    false
}

fn yaml_python_integer_resolves(raw: &str) -> bool {
    let body = raw
        .strip_prefix('+')
        .or_else(|| raw.strip_prefix('-'))
        .unwrap_or(raw);
    if let Some(digits) = body.strip_prefix("0b") {
        return !digits.is_empty()
            && digits
                .bytes()
                .all(|byte| matches!(byte, b'0' | b'1' | b'_'));
    }
    if let Some(digits) = body.strip_prefix("0x") {
        return !digits.is_empty()
            && digits
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() || byte == b'_');
    }
    if let Some(digits) = body.strip_prefix("0o") {
        return !digits.is_empty()
            && digits
                .bytes()
                .all(|byte| matches!(byte, b'0'..=b'7' | b'_'));
    }
    if let Some(digits) = body.strip_prefix('0') {
        return digits
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'7' | b'_'))
            || body
                .bytes()
                .all(|byte| byte.is_ascii_digit() || byte == b'_');
    }
    !body.is_empty()
        && body
            .bytes()
            .all(|byte| byte.is_ascii_digit() || byte == b'_')
}

fn python_yaml_timestamp_resolves(raw: &str) -> bool {
    let bytes = raw.as_bytes();
    let mut index = 0;
    if !consume_exact_digits(bytes, &mut index, 4) || !consume_byte(bytes, &mut index, b'-') {
        return false;
    }
    if !consume_digits(bytes, &mut index, 1, 2) || !consume_byte(bytes, &mut index, b'-') {
        return false;
    }
    if !consume_digits(bytes, &mut index, 1, 2) {
        return false;
    }
    if index == bytes.len() {
        // The date-only arm in ruamel's resolver requires fixed-width month/day.
        return bytes.get(5).is_some_and(u8::is_ascii_digit)
            && bytes.get(6).is_some_and(u8::is_ascii_digit)
            && bytes.get(8).is_some_and(u8::is_ascii_digit)
            && bytes.get(9).is_some_and(u8::is_ascii_digit);
    }
    if bytes
        .get(index)
        .is_some_and(|byte| matches!(*byte, b'T' | b't'))
    {
        index += 1;
    } else {
        let start = index;
        while index < bytes.len() && matches!(bytes[index], b' ' | b'\t') {
            index += 1;
        }
        if index == start {
            return false;
        }
    }
    if !consume_digits(bytes, &mut index, 1, 2)
        || !consume_byte(bytes, &mut index, b':')
        || !consume_exact_digits(bytes, &mut index, 2)
        || !consume_byte(bytes, &mut index, b':')
        || !consume_exact_digits(bytes, &mut index, 2)
    {
        return false;
    }
    if index < bytes.len() && bytes[index] == b'.' {
        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
    }
    if index == bytes.len() {
        return true;
    }
    let zone_start = index;
    while index < bytes.len() && matches!(bytes[index], b' ' | b'\t') {
        index += 1;
    }
    let had_space = index > zone_start;
    if index < bytes.len() && bytes[index] == b'Z' {
        index += 1;
    } else if index < bytes.len() && matches!(bytes[index], b'+' | b'-') {
        index += 1;
        if !consume_digits(bytes, &mut index, 1, 2) {
            return false;
        }
        if index < bytes.len() && bytes[index] == b':' {
            index += 1;
            if !consume_exact_digits(bytes, &mut index, 2) {
                return false;
            }
        }
    } else if had_space {
        return false;
    }
    index == bytes.len()
}

fn consume_exact_digits(bytes: &[u8], index: &mut usize, count: usize) -> bool {
    let end = match index.checked_add(count) {
        Some(end) => end,
        None => return false,
    };
    if end > bytes.len() || !bytes[*index..end].iter().all(u8::is_ascii_digit) {
        return false;
    }
    *index = end;
    true
}

fn consume_digits(bytes: &[u8], index: &mut usize, min: usize, max: usize) -> bool {
    let start = *index;
    while *index < bytes.len() && *index - start < max && bytes[*index].is_ascii_digit() {
        *index += 1;
    }
    *index - start >= min
}

fn consume_byte(bytes: &[u8], index: &mut usize, expected: u8) -> bool {
    if bytes.get(*index) == Some(&expected) {
        *index += 1;
        true
    } else {
        false
    }
}

fn decode_private_python_value(
    value: &mut PythonConsumerValue,
    prefix: (char, char),
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    match value {
        PythonConsumerValue::String(text) => *text = decode_private_pytext(text, prefix, ctx)?,
        PythonConsumerValue::Array(items) => {
            for item in items {
                decode_private_python_value(item, prefix, ctx)?
            }
        }
        PythonConsumerValue::Object(members) => {
            for (key, value) in members {
                *key = decode_private_pytext(key, prefix, ctx)?;
                decode_private_python_value(value, prefix, ctx)?
            }
        }
        _ => {}
    }
    Ok(())
}
fn check_python_duplicate_keys(
    value: &PythonConsumerValue,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    match value {
        PythonConsumerValue::Array(items) => {
            for item in items {
                check_python_duplicate_keys(item, ctx)?
            }
        }
        PythonConsumerValue::Object(members) => {
            let mut seen: std::collections::BTreeSet<&[u32]> = std::collections::BTreeSet::new();
            for (key, item) in members {
                let points = key.codepoints();
                // A balanced B-tree compares against logarithmically many keys.
                // Each comparison may inspect the full shared key prefix.
                ctx.charge_work_u64(
                    (points.len() as u64).saturating_mul(btree_search_comparisons(seen.len())),
                    Utf16::default(),
                )?;
                if !seen.insert(points) {
                    return Err(fail("DUPLICATE_KEY", "Duplicate mapping key"));
                }
                check_python_duplicate_keys(item, ctx)?;
            }
        }
        _ => {}
    }
    Ok(())
}
fn decode_private_pytext(
    text: &PyText,
    prefix: (char, char),
    ctx: &mut Context<'_>,
) -> Result<PyText, EngineError> {
    let points = text.codepoints();
    // The decoded result cannot be longer than the private text. Meter the
    // full scan and reserve before allocating the replacement buffer.
    ctx.charge_work(points.len(), Utf16::default())?;
    let mut out = Vec::with_capacity(points.len());
    let mut i = 0;
    while i < points.len() {
        if i + 7 <= points.len()
            && points[i] == prefix.0 as u32
            && points[i + 1] == prefix.1 as u32
            && points[i + 2..i + 6]
                .iter()
                .all(|p| (*p as u8 as char).is_ascii_hexdigit() && *p <= 0x7f)
            && points[i + 6] == b';' as u32
        {
            let mut unit = 0u16;
            for point in &points[i + 2..i + 6] {
                let ch = *point as u8 as char;
                unit = unit * 16
                    + ch.to_digit(16)
                        .ok_or_else(|| fail("YAML_PROFILE", "Malformed private token"))?
                        as u16;
            }
            out.push(unit as u32);
            i += 7;
        } else {
            out.push(points[i]);
            i += 1;
        }
    }
    PyText::from_codepoints(out)
}

fn validate_python_value(
    value: &PythonConsumerValue,
    depth: usize,
    values: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    *values = values
        .checked_add(1)
        .ok_or_else(|| fail("LIMIT", "Value counter overflow"))?;
    ctx.check_tree_value_count(*values, Utf16::default())?;
    ctx.charge_work(1, Utf16::default())?;
    if depth > ctx.limits().max_depth {
        return Err(fail("LIMIT", "JSON nesting depth exceeded"));
    }
    match value {
        PythonConsumerValue::Null | PythonConsumerValue::Bool(_) => Ok(()),
        PythonConsumerValue::Integer(integer) => {
            let max = num_bigint::BigInt::from(9_007_199_254_740_991u64);
            if integer.abs() > max {
                Err(fail(
                    "NUMBER",
                    "Integer is outside the interoperable numeric profile",
                ))
            } else {
                Ok(())
            }
        }
        PythonConsumerValue::Float(bits) => {
            let number = f64::from_bits(*bits);
            if !number.is_finite()
                || (number == 0.0 && number.is_sign_negative())
                || (number.fract() == 0.0 && number.abs() > 9_007_199_254_740_991.0)
            {
                Err(fail("NUMBER", "Outside the interoperable numeric profile"))
            } else {
                Ok(())
            }
        }
        PythonConsumerValue::String(text) => ctx.charge_work(text.len(), Utf16::default()),
        PythonConsumerValue::Array(items) => {
            for item in items {
                validate_python_value(item, depth + 1, values, ctx)?;
            }
            Ok(())
        }
        PythonConsumerValue::Object(members) => {
            let mut seen = std::collections::BTreeSet::<&[u32]>::new();
            for (index, (key, item)) in members.iter().enumerate() {
                ctx.charge_work_u64(
                    (key.len() as u64).saturating_mul(btree_search_comparisons(index)),
                    Utf16::default(),
                )?;
                if !seen.insert(key.codepoints()) {
                    return Err(fail("DUPLICATE_KEY", "Duplicate mapping key"));
                }
                validate_python_value(item, depth + 1, values, ctx)?;
            }
            Ok(())
        }
    }
}
fn python_float_token(value: f64) -> String {
    let mut token = crate::ecma_number_to_string(value);
    if !token.contains('.') && !token.contains('e') && !token.contains('E') {
        token.push_str(".0");
    }
    token
}

fn resolve_scalar(
    value: &str,
    style: ScalarStyle,
    tagged: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if tagged {
        return Err(fail("YAML_TAG", "Explicit YAML tags are not allowed"));
    }
    if style != ScalarStyle::Plain {
        return Ok(Value::string_utf8(value));
    }
    ctx.charge_work(value.encode_utf16().count(), Utf16::default())?;
    match value {
        "" | "~" | "null" | "Null" | "NULL" => return Ok(Value::Null),
        "true" | "True" | "TRUE" => return Ok(Value::Bool(true)),
        "false" | "False" | "FALSE" => return Ok(Value::Bool(false)),
        ".inf" | ".Inf" | ".INF" | "-.inf" | "-.Inf" | "-.INF" | "+.inf" | "+.Inf" | "+.INF"
        | ".nan" | ".NaN" | ".NAN" => {
            return Err(fail("NUMBER", "Non-finite numbers are not supported"))
        }
        _ => {}
    }
    let Some(numeric) = yaml_number_token(value) else {
        return Ok(Value::string_utf8(value));
    };
    ctx.charge_work(value.len().saturating_mul(3), Utf16::default())?;
    let number = match &numeric {
        YamlNumber::Decimal => value.parse::<f64>().ok(),
        YamlNumber::Radix { digits, radix } => {
            ctx.charge_work(digits.len(), Utf16::default())?;
            let magnitude = parse_safe_magnitude(digits, *radix).ok_or_else(|| {
                fail(
                    "NUMBER",
                    "Radix number is outside the supported numeric range",
                )
            })?;
            Some(magnitude as f64)
        }
    };
    let number = number.ok_or_else(|| fail("NUMBER", "Invalid numeric scalar"))?;
    if matches!(&numeric, YamlNumber::Decimal) {
        let source = decimal_canonical(value)
            .ok_or_else(|| fail("NUMBER", "Malformed decimal source token"))?;
        let rendered = crate::ecma_number_to_string(number);
        let converted = decimal_canonical(&rendered)
            .ok_or_else(|| fail("NUMBER", "Malformed converted number"))?;
        if source != converted {
            return Err(fail("NUMBER", "Parsing would change the decimal value"));
        }
    }
    Value::number(number, Utf16::default())
}

#[derive(Clone)]
enum YamlNumber {
    Decimal,
    Radix { digits: String, radix: u32 },
}
fn yaml_number_token(raw: &str) -> Option<YamlNumber> {
    // Match the predecessor yaml package's core-schema profile: radix
    // integers are unsigned hexadecimal/octal only; signed radix, binary and
    // underscore forms remain strings.
    for (prefix, radix) in [("0x", 16), ("0o", 8)] {
        if let Some(digits) = raw.strip_prefix(prefix) {
            if !digits.is_empty()
                && digits
                    .bytes()
                    .all(|b| (b as char).to_digit(radix).is_some())
            {
                return Some(YamlNumber::Radix {
                    digits: digits.to_owned(),
                    radix,
                });
            }
            return None;
        }
    }
    let body = raw
        .strip_prefix('-')
        .or_else(|| raw.strip_prefix('+'))
        .unwrap_or(raw);
    if body.is_empty() {
        return None;
    }
    let (mantissa, exponent) = if let Some(index) = body.find(['e', 'E']) {
        let exp = &body[index + 1..];
        let exp = exp
            .strip_prefix('+')
            .or_else(|| exp.strip_prefix('-'))
            .unwrap_or(exp);
        if exp.is_empty() || !exp.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        (&body[..index], true)
    } else {
        (body, false)
    };
    if let Some((whole, fraction)) = mantissa.split_once('.') {
        if mantissa.matches('.').count() != 1 {
            return None;
        }
        let left = whole.is_empty() || whole.bytes().all(|b| b.is_ascii_digit());
        let right = fraction.is_empty() || fraction.bytes().all(|b| b.is_ascii_digit());
        if left && right && (!whole.is_empty() || !fraction.is_empty()) {
            return Some(YamlNumber::Decimal);
        }
        return None;
    }
    if exponent {
        if !mantissa.is_empty() && mantissa.bytes().all(|b| b.is_ascii_digit()) {
            return Some(YamlNumber::Decimal);
        }
        return None;
    }
    if body.bytes().all(|b| b.is_ascii_digit()) {
        return Some(YamlNumber::Decimal);
    }
    None
}
fn decimal_canonical(source: &str) -> Option<(bool, String, i64)> {
    let (negative, body) = if let Some(body) = source.strip_prefix('-') {
        (true, body)
    } else if let Some(body) = source.strip_prefix('+') {
        (false, body)
    } else {
        (false, source)
    };
    let (mantissa, exponent) = if let Some((m, e)) = body.split_once(['e', 'E']) {
        (m, e.parse::<i64>().ok()?)
    } else {
        (body, 0)
    };
    let mut parts = mantissa.split('.');
    let integer = parts.next()?;
    let fraction = parts.next().unwrap_or("");
    if parts.next().is_some() {
        return None;
    }
    if integer.is_empty() && fraction.is_empty() {
        return None;
    }
    if !integer.bytes().all(|b| b.is_ascii_digit()) || !fraction.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    let mut digits = format!("{integer}{fraction}");
    let first = digits.find(|c| c != '0');
    let Some(first) = first else {
        return Some((false, "0".into(), 0));
    };
    digits.drain(..first);
    let mut power = exponent.checked_sub(fraction.len() as i64)?;
    while digits.ends_with('0') {
        digits.pop();
        power = power.checked_add(1)?;
    }
    Some((negative, digits, power))
}

fn write_json(value: &Value, out: &mut String) -> Result<(), EngineError> {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(v) => out.push_str(if *v { "true" } else { "false" }),
        Value::Number(v) => {
            if !v.is_finite() {
                return Err(fail("NUMBER", "Non-finite number"));
            }
            out.push_str(&crate::ecma_number_to_string(*v));
        }
        Value::String(s) => write_string(s, out)?,
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',')
                }
                write_json(item, out)?;
            }
            out.push(']');
        }
        Value::Object(items) => {
            out.push('{');
            for (i, index) in enumerable_order(items).into_iter().enumerate() {
                let (key, value) = &items[index];
                if i > 0 {
                    out.push(',')
                }
                write_string(key, out)?;
                out.push(':');
                write_json(value, out)?;
            }
            out.push('}');
        }
    }
    Ok(())
}
fn btree_search_comparisons(prior_entries: usize) -> u64 {
    // std::collections::BTreeSet linearly scans each node (up to 11 keys for
    // B=6), then descends logarithmically. This bounds per-insert key
    // comparisons without assuming one comparison per tree level.
    let entries = prior_entries as u64;
    let log_bound = log2_work_levels(prior_entries as u64).saturating_add(1);
    entries.min(11u64.saturating_mul(log_bound))
}

fn log2_work_levels(entries: u64) -> u64 {
    (u64::BITS - entries.max(1).leading_zeros()) as u64
}

fn order_work(len: usize) -> u64 {
    let len = len as u64;
    len.saturating_mul(log2_work_levels(len).saturating_add(1))
}
fn enumerable_order(items: &[(Utf16, Value)]) -> Vec<usize> {
    let mut order = (0..items.len()).collect::<Vec<_>>();
    order.sort_by_key(|index| match array_index(&items[*index].0) {
        Some(n) => (0u8, n, *index),
        None => (1u8, 0, *index),
    });
    order
}
fn enumerable_order_metered(
    items: &[(Utf16, Value)],
    ctx: &mut Context<'_>,
) -> Result<Vec<usize>, EngineError> {
    ctx.charge_work_u64(order_work(items.len()), Utf16::default())?;
    Ok(enumerable_order(items))
}
fn array_index(key: &Utf16) -> Option<u32> {
    let units = key.units();
    if units.is_empty() || units.len() > 10 {
        return None;
    }
    if units.len() > 1 && units[0] == b'0' as u16 {
        return None;
    }
    let mut n = 0u64;
    for unit in units {
        if !(b'0' as u16..=b'9' as u16).contains(unit) {
            return None;
        }
        n = n * 10 + (*unit - b'0' as u16) as u64;
    }
    if n <= u32::MAX as u64 - 1 {
        Some(n as u32)
    } else {
        None
    }
}
fn write_string(value: &Utf16, out: &mut String) -> Result<(), EngineError> {
    out.push('"');
    let units = value.units();
    let mut i = 0;
    while i < units.len() {
        let u = units[i];
        match u {
            0x22 => out.push_str("\\\""),
            0x5c => out.push_str("\\\\"),
            0x08 => out.push_str("\\b"),
            0x0c => out.push_str("\\f"),
            0x0a => out.push_str("\\n"),
            0x0d => out.push_str("\\r"),
            0x09 => out.push_str("\\t"),
            0..=0x1f => out.push_str(&format!("\\u{u:04x}")),
            0xd800..=0xdbff if i + 1 < units.len() && (0xdc00..=0xdfff).contains(&units[i + 1]) => {
                let cp = 0x10000 + (((u as u32 - 0xd800) << 10) + (units[i + 1] as u32 - 0xdc00));
                out.push(char::from_u32(cp).unwrap());
                i += 1;
            }
            0xd800..=0xdfff => out.push_str(&format!("\\u{u:04x}")),
            _ => out.push(
                char::from_u32(u as u32)
                    .ok_or_else(|| fail("SOURCE_ENCODING", "Invalid UTF-16"))?,
            ),
        }
        i += 1;
    }
    out.push('"');
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use saphyr_parser::EventReceiver;

    #[derive(Default)]
    struct DebugEventSink(Vec<String>);

    impl<'input> EventReceiver<'input> for DebugEventSink {
        fn on_event(&mut self, event: Event<'input>) {
            self.0.push(format!("{event:?}"));
        }
    }

    fn scanner_outcome_from_str(source: &str) -> Result<Vec<String>, String> {
        let mut parser =
            Parser::new_from_str_with_profile(source, ScanProfile::PythonRuamel12).keep_tags(true);
        let mut events = DebugEventSink::default();
        parser
            .load(&mut events, true)
            .map(|()| events.0)
            .map_err(|error| error.to_string())
    }

    fn scanner_outcome_from_buffered(source: &str) -> Result<Vec<String>, String> {
        let mut parser =
            Parser::new_from_iter_with_profile(source.chars(), ScanProfile::PythonRuamel12)
                .keep_tags(true);
        let mut events = DebugEventSink::default();
        parser
            .load(&mut events, true)
            .map(|()| events.0)
            .map_err(|error| error.to_string())
    }

    fn receipt_source(case: &serde_json::Value) -> (PyText, String) {
        let codepoints = case["sourceCodepoints"]
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_u64().unwrap() as u32)
            .collect::<Vec<_>>();
        let text = codepoints
            .iter()
            .map(|point| char::from_u32(*point).unwrap())
            .collect::<String>();
        (PyText::from_codepoints(codepoints).unwrap(), text)
    }

    fn parse(source: &str, format: Format) -> Result<Value, EngineError> {
        read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            format,
            &mut Context::ordinary(),
        )
    }

    fn parse_units(source: &[u16], format: Format) -> Result<Value, EngineError> {
        read_json_value(source, format, &mut Context::ordinary())
    }

    #[test]
    fn yaml_empty_stream_and_directive_whitespace_match_predecessor() {
        for source in ["", " \n\t", "# comment\n", "...\n", "---\n", "\u{feff}"] {
            assert_eq!(
                parse(source, Format::Yaml).unwrap(),
                Value::Null,
                "{source:?}"
            );
        }
        for directive in [
            "%YAML\t1.2",
            "%YAML  1.2",
            "%YAML 1.2\t#comment",
            "%TAG\t!e!\ttag:example.com,2020:",
        ] {
            assert!(
                parse(&format!("{directive}\n---\nx: value"), Format::Yaml).is_ok(),
                "{directive:?}"
            );
        }
        assert_eq!(
            parse("\u{feff}x: \"value\"", Format::Yaml).unwrap(),
            parse("x: \"value\"", Format::Yaml).unwrap()
        );
        assert_eq!(
            parse("\u{feff}%YAML 1.1\n---\nx: yes", Format::Yaml)
                .unwrap_err()
                .code,
            "YAML_VERSION"
        );
    }

    #[test]
    fn python_unknown_directives_match_the_frozen_174_case_oracle() {
        const RECEIPT: &str = include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-directive-predecessor.json"
        );
        let receipt: serde_json::Value = serde_json::from_str(RECEIPT).unwrap();
        assert_eq!(
            receipt["generatorSha256"].as_str(),
            Some("afcc0c246d84e984f53ec6d3db2a5c8669bcc6c84b8f7d81192c8bad202e6032")
        );
        let oracles = receipt["oracles"].as_object().unwrap();
        let mut cases_seen = 0;
        for (profile, oracle) in oracles {
            let cases = oracle["cases"].as_array().unwrap();
            assert_eq!(cases.len(), 29, "oracle profile {profile}");
            for case in cases {
                let source = case["sourceCodepoints"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|value| value.as_u64().unwrap() as u32)
                    .collect::<Vec<_>>();
                let source = PyText::from_codepoints(source).unwrap();
                let expected_value = case["predecessor"]["status"] == "value";
                let actual_value =
                    read_python_value(&source, Format::Yaml, &mut Context::ordinary()).is_ok();
                assert_eq!(
                    actual_value,
                    expected_value,
                    "{} from {profile}",
                    case["id"].as_str().unwrap()
                );
                let (_, text) = receipt_source(case);
                assert_eq!(
                    scanner_outcome_from_str(&text),
                    scanner_outcome_from_buffered(&text),
                    "scanner input backends differ for {} from {profile}",
                    case["id"].as_str().unwrap()
                );
                cases_seen += 1;
            }
        }
        assert_eq!(cases_seen, 174);
    }

    #[test]
    fn python_unknown_directive_tails_match_the_frozen_48_observations() {
        const RECEIPT: &str = include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-directive-tail-predecessor.json"
        );
        let receipt: serde_json::Value = serde_json::from_str(RECEIPT).unwrap();
        assert_eq!(
            receipt["generatorSha256"].as_str(),
            Some("1a03fcf6cf80c99509b8115945a564b316fe32146541aadaa9024ca0881df52b")
        );
        let mut cases_seen = 0;
        for (profile, oracle) in receipt["oracles"].as_object().unwrap() {
            let cases = oracle["cases"].as_array().unwrap();
            assert_eq!(cases.len(), 8, "oracle profile {profile}");
            for case in cases {
                let (source, text) = receipt_source(case);
                let expected_value = case["predecessor"]["status"] == "value";
                let actual_value =
                    read_python_value(&source, Format::Yaml, &mut Context::ordinary()).is_ok();
                assert_eq!(
                    actual_value,
                    expected_value,
                    "{} from {profile}",
                    case["id"].as_str().unwrap()
                );
                assert_eq!(
                    scanner_outcome_from_str(&text),
                    scanner_outcome_from_buffered(&text),
                    "scanner input backends differ for {} from {profile}",
                    case["id"].as_str().unwrap()
                );
                cases_seen += 1;
            }
        }
        assert_eq!(cases_seen, 48);
    }

    #[test]
    fn json_mapping_budget_excludes_keys_at_actual_large_boundary() {
        let source = format!(
            "{{{}}}",
            (0..99_999)
                .map(|i| format!("\"key{i}\":null"))
                .collect::<Vec<_>>()
                .join(",")
        );
        assert!(parse(&source, Format::Json).is_ok());
        let over = source.trim_end_matches('}').to_owned() + ",\"extra\":null}";
        assert_eq!(parse(&over, Format::Json).unwrap_err().code, "LIMIT");
    }

    #[test]
    fn yaml_value_budget_excludes_keys_and_accepts_exact_depth() {
        let source = (0..99_999)
            .map(|i| format!("\"key{i}\": null\n"))
            .collect::<String>();
        assert!(parse(&source, Format::Yaml).is_ok());
        assert_eq!(
            parse(&(source + "extra: null\n"), Format::Yaml)
                .unwrap_err()
                .code,
            "LIMIT"
        );
        for leaf in ["null", "[]", "{}"] {
            let at_limit = format!("{}{}{}", "[".repeat(128), leaf, "]".repeat(128));
            assert!(parse(&at_limit, Format::Yaml).is_ok(), "{leaf}");
            let over = format!("[{at_limit}]");
            assert_eq!(
                parse(&over, Format::Yaml).unwrap_err().code,
                "LIMIT",
                "{leaf}"
            );
        }
    }

    #[test]
    fn every_writer_uses_ecmascript_integer_key_enumeration() {
        let value = parse(r#"{"2":2,"1":1,"01":3,"4294967295":4,"0":0}"#, Format::Json).unwrap();
        assert_eq!(
            stringify_compact(&value).unwrap().to_utf8().unwrap(),
            r#"{"0":0,"1":1,"2":2,"01":3,"4294967295":4}"#
        );
        let json = write_json_value(&value, Format::Json, &mut Context::ordinary())
            .unwrap()
            .to_utf8()
            .unwrap();
        assert_eq!(
            json,
            "{\n  \"0\": 0,\n  \"1\": 1,\n  \"2\": 2,\n  \"01\": 3,\n  \"4294967295\": 4\n}\n"
        );
        let yaml = write_json_value(&value, Format::Yaml, &mut Context::ordinary())
            .unwrap()
            .to_utf8()
            .unwrap();
        assert_eq!(
            yaml,
            "\"0\": 0\n\"1\": 1\n\"2\": 2\n\"01\": 3\n\"4294967295\": 4\n"
        );
    }

    #[test]
    fn json_parser_preserves_surrogates_and_rejects_decoded_duplicate_keys() {
        let value = parse(r#"{"x":"\ud800"}"#, Format::Json).unwrap();
        let Value::Object(fields) = value else {
            panic!("object expected")
        };
        let Value::String(text) = &fields[0].1 else {
            panic!("string expected")
        };
        assert_eq!(text.units(), &[0xd800]);
        assert_eq!(
            parse(r#"{"x":1,"\u0078":2}"#, Format::Json)
                .unwrap_err()
                .code,
            "DUPLICATE_KEY"
        );
    }

    #[test]
    fn json_number_admission_rejects_rounding_and_uses_ecmascript_format() {
        assert_eq!(
            parse("0.10000000000000001", Format::Json).unwrap_err().code,
            "NUMBER"
        );
        assert!(parse("0.1", Format::Json).is_ok());
        let value = Value::Array(vec![Value::Number(1e-7)]);
        let text = write_json_value(&value, Format::Json, &mut Context::ordinary()).unwrap();
        assert_eq!(text.to_utf8().unwrap(), "[\n  1e-7\n]\n");
        assert_eq!(crate::ecma_number_to_string(1e21), "1e+21");
    }

    #[test]
    fn yaml_numeric_profile_matches_predecessor_sign_radix_and_decimal_rules() {
        for source in ["0b10", "1_000", "-0x1", "+0o1", "+0x1", "-0o1"] {
            assert_eq!(
                parse(source, Format::Yaml).unwrap(),
                Value::string_utf8(source),
                "{source}"
            );
        }
        for (source, expected) in [
            ("01", 1.0),
            ("010", 10.0),
            ("-01", -1.0),
            ("+01", 1.0),
            ("+0", 0.0),
            ("0o10", 8.0),
            ("0x1", 1.0),
            ("+.5", 0.5),
            (".5", 0.5),
            ("1.", 1.0),
            ("1e+2", 100.0),
        ] {
            assert_eq!(
                parse(source, Format::Yaml).unwrap(),
                Value::Number(expected),
                "{source}"
            );
        }
        for source in ["-0", "-0.0", "-0e2"] {
            assert_eq!(
                parse(source, Format::Yaml).unwrap_err().code,
                "NUMBER",
                "{source}"
            );
        }
        for source in [
            ".inf", "+.inf", "-.inf", ".Inf", "+.Inf", "-.Inf", ".nan", ".NaN",
        ] {
            assert_eq!(
                parse(source, Format::Yaml).unwrap_err().code,
                "NUMBER",
                "{source}"
            );
        }
        for source in ["+.nan", "-.nan", "+.NaN", "-.NaN"] {
            assert_eq!(
                parse(source, Format::Yaml).unwrap(),
                Value::string_utf8(source),
                "{source}"
            );
        }
        for source in [
            "0x10000000000000000",
            "0o777777777777777777777777",
            "0x20000000000001",
        ] {
            assert_eq!(
                parse(source, Format::Yaml).unwrap_err().code,
                "NUMBER",
                "{source}"
            );
        }
        for source in ["9007199254740992", "9007199254740993"] {
            assert_eq!(
                parse(source, Format::Yaml).unwrap_err().code,
                "NUMBER",
                "{source}"
            );
        }
    }

    #[test]
    fn yaml_writer_roundtrips_nested_values() {
        let value = parse("id: \"a:b\"\nitems:\n  - 1\n  - true\n", Format::Yaml).unwrap();
        let encoded = write_json_value(&value, Format::Yaml, &mut Context::ordinary()).unwrap();
        let decoded =
            read_json_value(encoded.units(), Format::Yaml, &mut Context::ordinary()).unwrap();
        assert_eq!(decoded, value);
        let lone = Value::String(Utf16::new(vec![0xd800]));
        let yaml = write_json_value(&lone, Format::Yaml, &mut Context::ordinary()).unwrap();
        assert_eq!(yaml.to_utf8().unwrap(), "\"\\ud800\"\n");
        assert_eq!(
            read_json_value(yaml.units(), Format::Yaml, &mut Context::ordinary()).unwrap(),
            lone
        );
    }

    #[test]
    fn yaml_adapter_preserves_raw_and_escaped_surrogates_without_private_use_collisions() {
        for source in [
            vec![
                b'x' as u16,
                b':' as u16,
                b' ' as u16,
                b'"' as u16,
                0xd800,
                b'"' as u16,
            ],
            vec![b'x' as u16, b':' as u16, b' ' as u16, 0xd800],
            r#"x: "\uD800""#.encode_utf16().collect(),
        ] {
            let parsed = parse_units(&source, Format::Yaml).unwrap();
            let Value::Object(members) = parsed else {
                panic!("mapping expected")
            };
            let Value::String(value) = &members[0].1 else {
                panic!("string expected")
            };
            assert_eq!(value.units(), &[0xd800]);
        }
        let pua = parse(r#"x: "\U000FD800""#, Format::Yaml).unwrap();
        let Value::Object(members) = pua else {
            panic!("mapping expected")
        };
        let Value::String(value) = &members[0].1 else {
            panic!("string expected")
        };
        assert_ne!(value.units(), &[0xd800]);
        assert_eq!(value.units().len(), 2);
    }

    #[test]
    fn yaml_adapter_decodes_surrogate_keys_before_duplicate_admission() {
        let mut source = r#""#.encode_utf16().collect::<Vec<_>>();
        source.extend([0x22, 0xd800, 0x22, 0x3a, 0x20, 0x31, 0x0a]);
        source.extend(r#""\uD800": 2"#.encode_utf16());
        assert_eq!(
            parse_units(&source, Format::Yaml).unwrap_err().code,
            "DUPLICATE_KEY"
        );
        let mut astral = r#""#.encode_utf16().collect::<Vec<_>>();
        astral.extend([
            0x22, 0xd800, 0x5c, 0x75, 0x44, 0x43, 0x30, 0x30, 0x22, 0x3a, 0x20, 0x31, 0x0a,
        ]);
        astral.extend([0x22, 0xd800, 0xdc00, 0x22, 0x3a, 0x20, 0x32]);
        assert_eq!(
            parse_units(&astral, Format::Yaml).unwrap_err().code,
            "DUPLICATE_KEY"
        );
    }

    #[test]
    fn yaml_source_profile_rejects_11_aliases_and_unknown_directives_but_keeps_unused_anchors() {
        assert_eq!(
            parse("%YAML 1.1\n---\nx: yes", Format::Yaml)
                .unwrap_err()
                .code,
            "YAML_VERSION"
        );
        assert!(parse("%YAML 1.2\n---\nx: yes", Format::Yaml).is_ok());
        assert!(parse(
            "%TAG !e! tag:example.com,2020:\n---\nx: value",
            Format::Yaml
        )
        .is_ok());
        assert!(parse("x: &unused value", Format::Yaml).is_ok());
        assert!(parse("x: &unused {y: 1}", Format::Yaml).is_ok());
        assert!(parse("x: &unused [1, 2]", Format::Yaml).is_ok());
        assert_eq!(
            parse("x: &a value\ny: *a", Format::Yaml).unwrap_err().code,
            "YAML_ALIAS"
        );
        assert!(parse("%FOO bar\n---\nx: 1", Format::Yaml).is_err());
        let block = parse("x: |\n  %YAML 1.1\n", Format::Yaml).unwrap();
        let Value::Object(items) = block else {
            panic!("mapping expected")
        };
        assert_eq!(items[0].1, Value::string_utf8("%YAML 1.1\n"));
    }

    #[test]
    fn yaml_tokens_do_not_collide_with_literal_private_use_or_escaped_backslashes() {
        let source = r#"x: "\uE000\uE001 \uD800 \\uD801""#;
        let value = parse(source, Format::Yaml).unwrap();
        let Value::Object(items) = value else {
            panic!("mapping expected")
        };
        let Value::String(text) = &items[0].1 else {
            panic!("string expected")
        };
        let expected: Vec<u16> = "\u{e000}\u{e001} "
            .encode_utf16()
            .chain([0xd800])
            .chain(" \\uD801".encode_utf16())
            .collect();
        assert_eq!(text.units(), expected.as_slice());
    }

    #[test]
    fn yaml_escape_lookahead_never_decodes_unrelated_surrogate_or_astral_units() {
        let mut newline = vec![
            b'x' as u16,
            b':' as u16,
            b' ' as u16,
            b'"' as u16,
            b'\\' as u16,
            b'n' as u16,
            0xd800,
            b'"' as u16,
        ];
        let parsed = parse_units(&newline, Format::Yaml).unwrap();
        let Value::Object(items) = parsed else {
            panic!("mapping expected")
        };
        let Value::String(value) = &items[0].1 else {
            panic!("string expected")
        };
        assert_eq!(value.units(), &[0x0a, 0xd800]);

        newline = vec![
            b'x' as u16,
            b':' as u16,
            b' ' as u16,
            b'"' as u16,
            b'\\' as u16,
            b't' as u16,
            0xd83d,
            0xde00,
            b'"' as u16,
        ];
        let parsed = parse_units(&newline, Format::Yaml).unwrap();
        let Value::Object(items) = parsed else {
            panic!("mapping expected")
        };
        let Value::String(value) = &items[0].1 else {
            panic!("string expected")
        };
        assert_eq!(value.units(), &[0x09, 0xd83d, 0xde00]);
    }

    #[test]
    fn source_and_output_limits_are_checked_at_four_million_utf16_units() {
        let mut source = Vec::with_capacity(4_000_001);
        source.push(b'"' as u16);
        source.extend(std::iter::repeat_n(b'a' as u16, 3_999_998));
        source.push(b'"' as u16);
        assert_eq!(source.len(), 4_000_000);
        assert!(read_json_value(&source, Format::Json, &mut Context::ordinary()).is_ok());
        source.push(b' ' as u16);
        assert_eq!(
            read_json_value(&source, Format::Json, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "LIMIT"
        );

        for format in [Format::Json, Format::Yaml] {
            let mut just_under = vec![0; 666_666];
            just_under.push(b'a' as u16);
            let value = Value::String(Utf16::new(just_under));
            let output = write_json_value(&value, format, &mut Context::ordinary()).unwrap();
            assert_eq!(output.len(), 4_000_000);
            let too_large = Value::String(Utf16::new(vec![0; 666_667]));
            assert_eq!(
                write_json_value(&too_large, format, &mut Context::ordinary())
                    .unwrap_err()
                    .code,
                "LIMIT"
            );
        }
    }

    #[test]
    fn output_charge_denial_and_mid_render_cancel_or_deadline_propagate() {
        let value = Value::String(Utf16::new(vec![0; 1000]));
        let mut meter = |amount| {
            if amount == 6003 {
                Err(EngineError::new(
                    "OUTPUT_METER",
                    Utf16::default(),
                    "denied output",
                ))
            } else {
                Ok(())
            }
        };
        assert_eq!(
            write_json_value(
                &value,
                Format::Json,
                &mut Context::ordinary().with_meter(&mut meter)
            )
            .unwrap_err()
            .code,
            "OUTPUT_METER"
        );

        let value = Value::String(Utf16::new(vec![b'a' as u16; 4096]));
        let mut baseline_cancel_calls = 0usize;
        {
            let mut never = || {
                baseline_cancel_calls += 1;
                false
            };
            write_json_value(
                &value,
                Format::Json,
                &mut Context::ordinary().with_cancellation(&mut never),
            )
            .unwrap();
        }
        let cancel_at = baseline_cancel_calls - 1;
        let mut cancel_calls = 0usize;
        let mut cancel = || {
            cancel_calls += 1;
            cancel_calls >= cancel_at
        };
        assert_eq!(
            write_json_value(
                &value,
                Format::Json,
                &mut Context::ordinary().with_cancellation(&mut cancel)
            )
            .unwrap_err()
            .code,
            "CANCELLED"
        );

        let mut baseline_clock_calls = 0u64;
        {
            let mut clock = || {
                baseline_clock_calls += 1;
                Some(baseline_clock_calls)
            };
            let context = Context::ordinary().with_clock(&mut clock, u64::MAX);
            write_json_value(&value, Format::Json, &mut {
                let mut context = context;
                context
            })
            .unwrap();
        }
        let mut clock_calls = 0u64;
        let mut clock = || {
            clock_calls += 1;
            Some(clock_calls)
        };
        let deadline = baseline_clock_calls - 2;
        let context = Context::ordinary().with_clock(&mut clock, deadline);
        assert_eq!(
            write_json_value(&value, Format::Json, &mut {
                let mut context = context;
                context
            })
            .unwrap_err()
            .code,
            "DEADLINE"
        );
    }
}

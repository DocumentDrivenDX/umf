// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private `umf.core-wire/1` transport shared by native language bindings.
#[cfg(feature = "codegen")]
mod codegen;

use std::collections::BTreeSet;

use umf_core::serialization::Format;
use umf_core::{
    copy_json, Capabilities, Context, Diagnostic, Engine, EngineError, Limits, Registry,
    ResourceProfile, ResourceSet, Severity, Utf16, Value,
};

#[derive(Debug)]
enum Json {
    Null,
    Bool(bool),
    Number(serde_json::Number),
    String(String),
    Array(Vec<Json>),
    Object(Vec<(String, Json)>),
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ParseState {
    FirstOrEnd,
    NeedValue,
    FirstKeyOrEnd,
    NeedKey,
    Colon,
    ObjectValue,
    CommaOrEnd,
}

enum ParseFrame {
    Array {
        items: Vec<Json>,
        state: ParseState,
    },
    Object {
        fields: Vec<(String, Json)>,
        seen: BTreeSet<String>,
        pending: Option<String>,
        state: ParseState,
    },
}

impl ParseFrame {
    fn close(self) -> Json {
        match self {
            Self::Array { items, .. } => Json::Array(items),
            Self::Object { fields, .. } => Json::Object(fields),
        }
    }
}

struct JsonParser<'a> {
    source: &'a [u8],
    offset: usize,
    nodes: usize,
    max_nodes: usize,
    max_depth: usize,
}

impl JsonParser<'_> {
    fn whitespace(&mut self) {
        while self
            .source
            .get(self.offset)
            .is_some_and(|byte| matches!(*byte, b' ' | b'\n' | b'\r' | b'\t'))
        {
            self.offset += 1;
        }
    }
    fn node(&mut self) -> Result<(), EngineError> {
        self.nodes = self.nodes.saturating_add(1);
        if self.nodes > self.max_nodes {
            return Err(fail(
                "LIMIT",
                "Tagged transport contains too many JSON values",
            ));
        }
        Ok(())
    }
    fn string(&mut self) -> Result<String, EngineError> {
        let start = self.offset;
        if self.source.get(self.offset) != Some(&b'"') {
            return Err(fail("WIRE_FORMAT", "Expected JSON string"));
        }
        self.offset += 1;
        while let Some(byte) = self.source.get(self.offset).copied() {
            match byte {
                b'"' => {
                    self.offset += 1;
                    return serde_json::from_slice(&self.source[start..self.offset])
                        .map_err(|error| fail("WIRE_FORMAT", error.to_string()));
                }
                b'\\' => self.offset = (self.offset + 2).min(self.source.len()),
                0..=0x1f => {
                    return Err(fail(
                        "WIRE_FORMAT",
                        "Unescaped control character in JSON string",
                    ))
                }
                _ => self.offset += 1,
            }
        }
        Err(fail("WIRE_FORMAT", "Unterminated JSON string"))
    }
    fn scalar_or_open(
        &mut self,
        stack: &mut Vec<ParseFrame>,
        root: &mut Option<Json>,
    ) -> Result<bool, EngineError> {
        self.whitespace();
        self.node()?;
        let Some(byte) = self.source.get(self.offset).copied() else {
            return Err(fail("WIRE_FORMAT", "Expected JSON value"));
        };
        match byte {
            b'{' => {
                self.offset += 1;
                if stack.len() >= self.max_depth {
                    return Err(fail(
                        "LIMIT",
                        "Tagged transport nesting exceeds the bounded depth",
                    ));
                }
                stack.push(ParseFrame::Object {
                    fields: Vec::new(),
                    seen: BTreeSet::new(),
                    pending: None,
                    state: ParseState::FirstKeyOrEnd,
                });
                Ok(true)
            }
            b'[' => {
                self.offset += 1;
                if stack.len() >= self.max_depth {
                    return Err(fail(
                        "LIMIT",
                        "Tagged transport nesting exceeds the bounded depth",
                    ));
                }
                stack.push(ParseFrame::Array {
                    items: Vec::new(),
                    state: ParseState::FirstOrEnd,
                });
                Ok(true)
            }
            b'"' => {
                let value = Json::String(self.string()?);
                attach(value, stack, root)?;
                Ok(false)
            }
            b't' if self.source.get(self.offset..self.offset + 4) == Some(b"true") => {
                self.offset += 4;
                attach(Json::Bool(true), stack, root)?;
                Ok(false)
            }
            b'f' if self.source.get(self.offset..self.offset + 5) == Some(b"false") => {
                self.offset += 5;
                attach(Json::Bool(false), stack, root)?;
                Ok(false)
            }
            b'n' if self.source.get(self.offset..self.offset + 4) == Some(b"null") => {
                self.offset += 4;
                attach(Json::Null, stack, root)?;
                Ok(false)
            }
            b'-' | b'0'..=b'9' => {
                let start = self.offset;
                while self.source.get(self.offset).is_some_and(|byte| {
                    !matches!(*byte, b' ' | b'\n' | b'\r' | b'\t' | b',' | b']' | b'}')
                }) {
                    self.offset += 1;
                }
                let number =
                    serde_json::from_slice::<serde_json::Number>(&self.source[start..self.offset])
                        .map_err(|error| fail("WIRE_FORMAT", error.to_string()))?;
                attach(Json::Number(number), stack, root)?;
                Ok(false)
            }
            _ => Err(fail("WIRE_FORMAT", "Malformed JSON value")),
        }
    }
}

fn attach(
    value: Json,
    stack: &mut [ParseFrame],
    root: &mut Option<Json>,
) -> Result<(), EngineError> {
    match stack.last_mut() {
        Some(ParseFrame::Array { items, .. }) => items.push(value),
        Some(ParseFrame::Object {
            fields, pending, ..
        }) => {
            let key = pending
                .take()
                .ok_or_else(|| fail("WIRE_FORMAT", "Object value has no key"))?;
            fields.push((key, value));
        }
        None if root.is_none() => *root = Some(value),
        None => return Err(fail("WIRE_FORMAT", "Multiple top-level JSON values")),
    }
    Ok(())
}

/// Parse JSON with explicit heap frames after preflight has bounded the full
/// input byte, nesting, and token counts. This keeps tagged wire's structural
/// expansion from relying on serde_json's smaller recursive parser limit.
fn parse_json_bounded(source: &[u8], ctx: &Context<'_>) -> Result<Json, EngineError> {
    let limits = ctx.limits();
    let mut parser = JsonParser {
        source,
        offset: 0,
        nodes: 0,
        // Every parsed token consumes at least one byte in the already-owned
        // input. This bounds parser/tree expansion by that input without
        // inventing a second aggregate copied-text limit.
        max_nodes: source.len(),
        max_depth: limits.max_depth.saturating_mul(3).saturating_add(8),
    };
    let mut stack = Vec::new();
    let mut root = None;
    loop {
        parser.whitespace();
        if stack.is_empty() {
            if root.is_some() {
                if parser.offset == source.len() {
                    return Ok(root.expect("root exists"));
                }
                return Err(fail("WIRE_FORMAT", "Trailing data after JSON value"));
            }
            parser.scalar_or_open(&mut stack, &mut root)?;
            continue;
        }
        let state = match stack.last().expect("nonempty parser stack") {
            ParseFrame::Array { state, .. } | ParseFrame::Object { state, .. } => *state,
        };
        match state {
            ParseState::FirstOrEnd | ParseState::NeedValue => {
                if state == ParseState::FirstOrEnd && source.get(parser.offset) == Some(&b']') {
                    parser.offset += 1;
                    attach(
                        stack.pop().expect("array frame").close(),
                        &mut stack,
                        &mut root,
                    )?;
                    continue;
                }
                if let Some(ParseFrame::Array { state, .. }) = stack.last_mut() {
                    *state = ParseState::CommaOrEnd;
                }
                parser.scalar_or_open(&mut stack, &mut root)?;
            }
            ParseState::FirstKeyOrEnd | ParseState::NeedKey => {
                if state == ParseState::FirstKeyOrEnd && source.get(parser.offset) == Some(&b'}') {
                    parser.offset += 1;
                    attach(
                        stack.pop().expect("object frame").close(),
                        &mut stack,
                        &mut root,
                    )?;
                    continue;
                }
                let key = parser.string()?;
                let Some(ParseFrame::Object {
                    seen,
                    pending,
                    state,
                    ..
                }) = stack.last_mut()
                else {
                    unreachable!()
                };
                if !seen.insert(key.clone()) {
                    return Err(fail(
                        "WIRE_FORMAT",
                        format!("duplicate transport member {key:?}"),
                    ));
                }
                *pending = Some(key);
                *state = ParseState::Colon;
            }
            ParseState::Colon => {
                if source.get(parser.offset) != Some(&b':') {
                    return Err(fail("WIRE_FORMAT", "Expected colon after object key"));
                }
                parser.offset += 1;
                if let Some(ParseFrame::Object { state, .. }) = stack.last_mut() {
                    *state = ParseState::ObjectValue;
                }
            }
            ParseState::ObjectValue => {
                if let Some(ParseFrame::Object { state, .. }) = stack.last_mut() {
                    *state = ParseState::CommaOrEnd;
                }
                parser.scalar_or_open(&mut stack, &mut root)?;
            }
            ParseState::CommaOrEnd => match stack.last() {
                Some(ParseFrame::Array { .. }) => match source.get(parser.offset) {
                    Some(b',') => {
                        parser.offset += 1;
                        if let Some(ParseFrame::Array { state, .. }) = stack.last_mut() {
                            *state = ParseState::NeedValue;
                        }
                    }
                    Some(b']') => {
                        parser.offset += 1;
                        attach(
                            stack.pop().expect("array frame").close(),
                            &mut stack,
                            &mut root,
                        )?;
                    }
                    _ => {
                        return Err(fail(
                            "WIRE_FORMAT",
                            "Expected comma or closing array bracket",
                        ))
                    }
                },
                Some(ParseFrame::Object { .. }) => match source.get(parser.offset) {
                    Some(b',') => {
                        parser.offset += 1;
                        if let Some(ParseFrame::Object { state, .. }) = stack.last_mut() {
                            *state = ParseState::NeedKey;
                        }
                    }
                    Some(b'}') => {
                        parser.offset += 1;
                        attach(
                            stack.pop().expect("object frame").close(),
                            &mut stack,
                            &mut root,
                        )?;
                    }
                    _ => {
                        return Err(fail(
                            "WIRE_FORMAT",
                            "Expected comma or closing object brace",
                        ))
                    }
                },
                None => unreachable!(),
            },
        }
    }
}

/// Decode strict tagged transport, then re-admit through the shared Rust value limits.
pub fn decode(wire_json: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    preflight(wire_json.as_bytes(), ctx)?;
    let json = parse_json_bounded(wire_json.as_bytes(), ctx)?;
    let value = decode_node(json, "")?;
    copy_json(&value, ctx)
}

pub fn encode(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    // Admit and meter the whole tree before constructing the tagged transport
    // tree or serialized output. The copy also rejects duplicate keys and
    // invalid binary64 values in caller-created core Values.
    let value = copy_json(value, ctx)?;
    encode_owned(&value, ctx)
}

fn encode_owned(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let size = wire_size(value, ctx)?;
    // Charge the entire serialized output before reserving it. The encoder
    // writes the closed tagged grammar directly and never builds a second
    // recursive serde tree.
    ctx.charge_work(size, Utf16::default())?;
    let mut output = String::with_capacity(size);
    write_wire(value, &mut output);
    debug_assert_eq!(output.len(), size, "wire output: {output}");
    Ok(output)
}

fn wire_add(total: usize, amount: usize) -> Result<usize, EngineError> {
    total
        .checked_add(amount)
        .ok_or_else(|| fail("LIMIT", "Tagged wire size overflow"))
}

fn unit_digits(mut unit: u16) -> usize {
    let mut digits = 1;
    while unit >= 10 {
        unit /= 10;
        digits += 1;
    }
    digits
}

fn units_wire_size(units: &[u16], ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    let mut size = 2usize; // []
    if !units.is_empty() {
        size = wire_add(size, units.len() - 1)?;
    }
    for unit in units {
        ctx.charge_work(1, Utf16::default())?;
        size = wire_add(size, unit_digits(*unit))?;
    }
    Ok(size)
}

fn wire_size(value: &Value, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Null => Ok(r#"{"kind":"null"}"#.len()),
        Value::Bool(value) => wire_add(
            r#"{"kind":"boolean","value":}"#.len(),
            if *value { 4 } else { 5 },
        ),
        Value::Number(_) => Ok(r#"{"kind":"number","bits":"0000000000000000"}"#.len()),
        Value::String(value) => wire_add(
            wire_add(
                r#"{"kind":"string","units":"#.len(),
                units_wire_size(value.units(), ctx)?,
            )?,
            1,
        ),
        Value::Array(items) => {
            let mut size = r#"{"kind":"array","items":["#.len();
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    size = wire_add(size, 1)?;
                }
                size = wire_add(size, wire_size(item, ctx)?)?;
            }
            wire_add(size, 2) // ]}
        }
        Value::Object(members) => {
            let mut size = r#"{"kind":"object","members":["#.len();
            for (index, (key, item)) in members.iter().enumerate() {
                if index > 0 {
                    size = wire_add(size, 1)?;
                }
                size = wire_add(size, r#"{"key":"#.len())?;
                size = wire_add(size, units_wire_size(key.units(), ctx)?)?;
                size = wire_add(size, r#","value":"#.len())?;
                size = wire_add(size, wire_size(item, ctx)?)?;
                size = wire_add(size, 1)?; // member }
            }
            wire_add(size, 2) // ]}
        }
    }
}

fn write_units(units: &[u16], output: &mut String) {
    output.push('[');
    for (index, unit) in units.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        use std::fmt::Write as _;
        write!(output, "{unit}").expect("writing to String cannot fail");
    }
    output.push(']');
}

fn write_wire(value: &Value, output: &mut String) {
    match value {
        Value::Null => output.push_str(r#"{"kind":"null"}"#),
        Value::Bool(value) => {
            output.push_str(r#"{"kind":"boolean","value":"#);
            output.push_str(if *value { "true" } else { "false" });
            output.push('}');
        }
        Value::Number(value) => {
            output.push_str("{\"kind\":\"number\",\"bits\":\"");
            const HEX: &[u8; 16] = b"0123456789abcdef";
            for shift in (0..16).rev() {
                output.push(HEX[((value.to_bits() >> (shift * 4)) & 0xf) as usize] as char);
            }
            output.push_str("\"}");
        }
        Value::String(value) => {
            output.push_str(r#"{"kind":"string","units":"#);
            write_units(value.units(), output);
            output.push_str("}");
        }
        Value::Array(items) => {
            output.push_str(r#"{"kind":"array","items":["#);
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                write_wire(item, output);
            }
            output.push_str("]}");
        }
        Value::Object(members) => {
            output.push_str(r#"{"kind":"object","members":["#);
            for (index, (key, item)) in members.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                output.push_str(r#"{"key":"#);
                write_units(key.units(), output);
                output.push_str(r#","value":"#);
                write_wire(item, output);
                output.push('}');
            }
            output.push_str("]}");
        }
    }
}

/// Build and encode the host callback view while charging each owned snapshot
/// before it is allocated. The callback envelope is a transport convenience;
/// all semantic admission stays in the engine invocation Context.
pub fn encode_callback_request(
    payload: &Value,
    document: &Value,
    path: &Utf16,
    scope: &str,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let payload = copy_json(payload, ctx)?;
    let document = copy_json(document, ctx)?;
    ctx.charge_work(path.len(), Utf16::default())?;
    ctx.charge_work(scope.encode_utf16().count(), Utf16::default())?;
    ctx.charge_work(4, Utf16::default())?;
    let request = Value::Object(vec![
        (Utf16::from("payload"), payload),
        (Utf16::from("document"), document),
        (Utf16::from("path"), Value::String(path.clone())),
        (Utf16::from("scope"), Value::string_utf8(scope.to_owned())),
    ]);
    // Payload and document were each admitted before their source snapshots;
    // this private request wrapper must not reapply semantic depth/count limits.
    encode_owned(&request, ctx)
}

pub fn copy_wire(wire_json: &str) -> Result<String, EngineError> {
    // Tagged UTF-16 unit arrays inflate the token count, but copy_json's
    // ordinary contract has no aggregate copied-text ceiling. Decode and
    // transport under the separate envelope limits, then let Rust re-admit
    // the semantic tree under ordinary structural limits.
    let mut transport = transport_context();
    let value = decode(wire_json, &mut transport)?;
    let value = copy_json(&value, &mut Context::ordinary())?;
    encode(&value, &mut transport)
}

/// Serialize a closed host-independent result envelope. Error path/message are
/// UTF-16 code units so lone surrogates survive every binding boundary.
pub fn result_envelope(result: Result<String, EngineError>) -> String {
    match result {
        Ok(wire) => serde_json::json!({
            "profile": "umf.core-wire/1",
            "status": "ok",
            "wire": wire,
        })
        .to_string(),
        Err(error) => serde_json::json!({
            "profile": "umf.core-wire/1",
            "status": "error",
            "code": error.code,
            "pathUnits": error.path.units(),
            "messageUnits": error.message.units(),
        })
        .to_string(),
    }
}

pub fn copy_wire_envelope(wire_json: &str) -> String {
    result_envelope(copy_wire(wire_json))
}

/// Read an arbitrary JSON/YAML value through the core serializer, preserving
/// its ordinary per-value structural and source-text limits.
pub fn read_value_wire(wire_json: &str, format: &str) -> String {
    run_value_wire(wire_json, format, false, None)
}

pub fn read_value_wire_with_control(
    wire_json: &str,
    format: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    run_value_wire(wire_json, format, false, Some(control))
}

/// Write an arbitrary admitted core value as JSON/YAML using Rust's writer.
pub fn write_value_wire(wire_json: &str, format: &str) -> String {
    run_value_wire(wire_json, format, true, None)
}

pub fn write_value_wire_with_control(
    wire_json: &str,
    format: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    run_value_wire(wire_json, format, true, Some(control))
}

/// Execute one `umf-128/1` codec operation. Tagged admission, the codec, and
/// tagged result encoding share this invocation context and host controls.
pub fn execute_bit128_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_bit128_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_bit128_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "profile").as_deref() != Some("umf-128/1") {
            return Err(fail("REQUEST", "umf-128/1 profile is required"));
        }
        let op = text_field(&request, "op").ok_or_else(|| fail("REQUEST", "Codec operation is required"))?;
        let args = field(&request, "args").ok_or_else(|| fail("REQUEST", "Codec arguments are required"))?;
        let value = |name: &str| field(args, name).ok_or_else(|| fail("REQUEST", &format!("{name} is required")));
        let result = match op.as_str() {
            "parseBits128" => umf_core::bit128::parse_bits128(value("text")?, &mut ctx)?,
            "parseUuid" => umf_core::bit128::parse_uuid(value("text")?, &mut ctx)?,
            "bits128FromBytes" => umf_core::bit128::bits128_from_bytes(value("bytes")?, &mut ctx)?,
            "bits128ToBytes" => umf_core::bit128::bits128_to_bytes(value("value")?, &mut ctx)?,
            "uuidFromBits128" => umf_core::bit128::uuid_from_bits128(value("value")?, &mut ctx)?,
            "uuidToBits128" => umf_core::bit128::uuid_to_bits128(value("value")?, &mut ctx)?,
            "compareBits128" => umf_core::bit128::compare_bits128(value("left")?, value("right")?, &mut ctx)?,
            "bits128ToWords" => umf_core::bit128::bits128_to_words(value("value")?, value("signed")?, &mut ctx)?,
            "bits128FromWords" => umf_core::bit128::bits128_from_words(value("words")?, value("signed")?, &mut ctx)?,
            "bits128ToInteger" => umf_core::bit128::bits128_to_integer(value("value")?, value("signed")?, &mut ctx)?,
            "bits128FromInteger" => umf_core::bit128::bits128_from_integer(value("literal")?, value("signed")?, &mut ctx)?,
            _ => return Err(fail("REQUEST", "Unknown umf-128/1 operation")),
        };
        encode(&result, &mut ctx)
    })();
    result_envelope(result)
}

fn run_value_wire(
    wire_json: &str,
    format: &str,
    write: bool,
    control: Option<&mut dyn FnMut(usize) -> Result<(), EngineError>>,
) -> String {
    let result = (|| {
        let format = match format {
            "json" => Format::Json,
            "yaml" => Format::Yaml,
            _ => return Err(fail("FORMAT", "Format must be json or yaml")),
        };
        let ctx = Context::ordinary();
        let mut ctx = if let Some(control) = control {
            ctx.with_host_control(control)
        } else {
            ctx
        };
        let value = decode(wire_json, &mut ctx)?;
        let result = if write {
            Value::String(umf_core::serialization::write_json_value(
                &value, format, &mut ctx,
            )?)
        } else {
            let Value::String(source) = value else {
                return Err(fail("SOURCE", "Source text must be a string"));
            };
            umf_core::serialization::read_json_value(source.units(), format, &mut ctx)?
        };
        encode(&result, &mut ctx)
    })();
    result_envelope(result)
}

pub fn error_envelope(error: EngineError) -> String {
    result_envelope(Err(error))
}

/// Versioned opt-in dispatcher for the seven preservation and inspection
/// operations in CONTRACT-002. `resources` is an ordered array of `{uri,
/// source}` entries; it performs no I/O and is charged by the same invocation
/// Context as request decoding, the operation, and result encoding.
pub const JSON_SCHEMA_PROFILE: &str = "umf-r5-json-schema/0.1.0";

pub fn execute_json_schema_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_json_schema_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_json_schema_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    use umf_core::json_schema_adapter as schema;
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "profile").as_deref() != Some(JSON_SCHEMA_PROFILE) {
            return Err(fail("REQUEST", "umf-r5-json-schema/0.1.0 profile is required"));
        }
        let op = text_field(&request, "op").ok_or_else(|| fail("REQUEST", "JSON Schema operation is required"))?;
        let document = || field(&request, "document").ok_or_else(|| fail("REQUEST", "JSON Schema document is required"));
        let value = match op.as_str() {
            "importJsonSchema" => {
                let items = match field(&request, "resources") {
                    Some(Value::Array(items)) => items,
                    _ => return Err(fail("REQUEST", "JSON Schema resources must be an explicit ordered array")),
                };
                ctx.charge_work(items.len(), Utf16::default())?;
                let mut resources = Vec::with_capacity(items.len());
                for item in items {
                    let uri = field(item, "uri").and_then(as_utf16)
                        .ok_or_else(|| fail("REQUEST", "JSON Schema resource URI is required"))?;
                    let resource_source = field(item, "source").and_then(as_utf16)
                        .ok_or_else(|| fail("REQUEST", "JSON Schema resource source is required"))?;
                    ctx.charge_work(uri.len().saturating_add(resource_source.len()).saturating_add(1), Utf16::default())?;
                    resources.push((uri.clone(), resource_source.units().to_vec()));
                }
                let source = field(&request, "source").and_then(as_utf16).ok_or_else(|| fail("REQUEST", "JSON Schema source is required"))?;
                let id = field(&request, "id").and_then(as_utf16).ok_or_else(|| fail("REQUEST", "JSON Schema id is required"))?;
                let base = field(&request, "baseUri").and_then(as_utf16).ok_or_else(|| fail("REQUEST", "JSON Schema base URI is required"))?;
                schema::import_json_schema(source.units(), id, base, &resources, &mut ctx)?
            }
            "inspectJsonSchema" => validation_value(schema::inspect_json_schema(document()?, &mut ctx)?),
            "exportJsonSchema" => Value::String(schema::export_json_schema(document()?, &mut ctx)?),
            "exportJsonSchemaResources" => Value::Array(schema::export_json_schema_resources(document()?, &mut ctx)?.into_iter().map(|(uri, source)| object(vec![("uri", Value::String(uri)), ("source", Value::String(source))])).collect()),
            "exportJsonSchemaBundle" => {
                let bundle = schema::export_json_schema_bundle(document()?, &mut ctx)?;
                object(vec![("root", Value::String(bundle.root_json)), ("resources", Value::Array(bundle.resources_json.into_iter().map(|(uri, source)| object(vec![("uri", Value::String(uri)), ("source", Value::String(source))])).collect())), ("source", bundle.source), ("diagnostics", Value::Array(bundle.diagnostics.into_iter().map(diagnostic_value).collect()))])
            }
            "getJsonSchemaNode" => {
                let pointer = field(&request, "pointer").and_then(as_utf16).ok_or_else(|| fail("REQUEST", "JSON Schema pointer is required"))?;
                schema::get_json_schema_node(document()?, pointer, &mut ctx)?.tagged_value_preserving_extras(&mut ctx)?
            }
            "walkJsonSchema" => {
                let positions = schema::walk_json_schema(document()?, &mut ctx)?;
                let mut output = Vec::with_capacity(positions.len());
                for position in positions {
                    output.push(object(vec![("pointer", Value::String(position.pointer)), ("node", position.node.tagged_value_preserving_extras(&mut ctx)?)]));
                }
                Value::Array(output)
            }
            _ => return Err(fail("REQUEST", "Unknown JSON Schema operation")),
        };
        encode(&value, &mut ctx)
    })();
    result_envelope(result)
}

/// Exact opt-in capability identity shared by CLI, Node/Bun, WASM and Python.
pub const ICEBERG_SCHEMA_PROFILE: &str = "umf-r5-iceberg-schema/0.1.0";

/// Execute the standalone Iceberg 1.11 schema subset through pinned Rust
/// resources. The tagged wire carries UTF-16 strings and lossless document
/// values; host bindings never parse the native schema or replacement JSON.
pub fn execute_iceberg_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_iceberg_wire_with_control(wire_json, &mut no_control)
}

/// The caller's work hook covers wire admission, resource construction, the
/// selected operation, and result encoding under one fresh ordinary Context.
pub fn execute_iceberg_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        use umf_core::iceberg_schema::{
            export_iceberg_schema, get_iceberg_node, import_iceberg_schema,
            inspect_iceberg, propose_iceberg_node_edit, IcebergSchemaResources,
        };

        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        let op = field(&request, "op")
            .and_then(as_utf16)
            .and_then(|value| value.to_utf8().ok())
            .ok_or_else(|| fail("REQUEST", "Iceberg operation is required"))?;
        if !matches!(
            op.as_str(),
            "iceberg.schema.import"
                | "iceberg.schema.export"
                | "iceberg.schema.inspect"
                | "iceberg.schema.getNode"
                | "iceberg.schema.proposeNodeEdit"
        ) {
            return Err(fail("REQUEST", "Unknown Iceberg schema operation"));
        }
        let resources = IcebergSchemaResources::new(&mut ctx)?;
        let text = |name: &str| {
            field(&request, name)
                .and_then(as_utf16)
                .ok_or_else(|| fail("REQUEST", &format!("Iceberg {name} string is required")))
        };
        let document = || {
            field(&request, "document")
                .ok_or_else(|| fail("REQUEST", "Iceberg document is required"))
        };
        let value = match op.as_str() {
            "iceberg.schema.import" => import_iceberg_schema(
                text("source")?.units(),
                text("id")?,
                &resources,
                &mut ctx,
            )?,
            "iceberg.schema.export" => Value::String(export_iceberg_schema(
                document()?,
                &resources,
                &mut ctx,
            )?),
            "iceberg.schema.inspect" => {
                validation_value(inspect_iceberg(document()?, &resources, &mut ctx)?)
            }
            "iceberg.schema.getNode" => get_iceberg_node(
                document()?,
                text("pointer")?,
                &resources,
                &mut ctx,
            )?
            .tagged_value_preserving_extras(&mut ctx)?,
            "iceberg.schema.proposeNodeEdit" => {
                let (candidate, validation) = propose_iceberg_node_edit(
                    document()?,
                    text("pointer")?,
                    text("replacement")?.units(),
                    &resources,
                    &mut ctx,
                )?;
                object(vec![
                    ("document", candidate),
                    ("validation", validation_value(validation)),
                ])
            }
            _ => unreachable!("Iceberg operation was checked above"),
        };
        encode(&value, &mut ctx)
    })();
    result_envelope(result)
}

/// Exact opt-in identity for the bounded Protobuf descriptor inspector.
pub const PROTOBUF_INSPECT_PROFILE: &str = "umf-r5-protobuf-inspect/0.1.0";

/// Versioned opt-in Avro field metadata projection. This operation does not
/// parse Avro source text or activate the default Avro adapter.
pub const AVRO_FIELDS_PROFILE: &str = "umf-r5-avro-fields/0.1.0";

/// Versioned opt-in structural Avro schema inspection. This profile reports
/// only its explicit structural subset and never certifies Avro validity.
pub const AVRO_INSPECT_PROFILE: &str = "umf-r5-avro-inspect/0.1.0";

pub fn execute_avro_fields_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_avro_fields_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_avro_fields_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        use umf_core::{avro_fields::{derive_avro_fields, AvroDependency}, native_json::NativeJsonTree};
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "op").as_deref() != Some("avro.fields.derive") {
            return Err(fail("REQUEST", "Unknown Avro fields operation"));
        }
        let root = NativeJsonTree::from_tagged_value(
            field(&request, "root").ok_or_else(|| fail("REQUEST", "Avro root is required"))?,
            &mut ctx,
        )?;
        let items = match field(&request, "dependencies") {
            None => &[][..],
            Some(Value::Array(items)) => items.as_slice(),
            _ => return Err(fail("REQUEST", "Avro dependencies must be an array")),
        };
        let mut owned = Vec::with_capacity(items.len());
        for item in items {
            let id = field(item, "id").and_then(as_utf16).cloned()
                .ok_or_else(|| fail("REQUEST", "Dependency id is required"))?;
            let tree = NativeJsonTree::from_tagged_value(
                field(item, "root").ok_or_else(|| fail("REQUEST", "Dependency root is required"))?,
                &mut ctx,
            )?;
            owned.push((id, tree));
        }
        let dependencies = owned.iter().map(|(id, tree)| AvroDependency { id, root: tree }).collect::<Vec<_>>();
        let fields = derive_avro_fields(&root, &dependencies, &mut ctx)?;
        let mut output = Vec::with_capacity(fields.len());
        for field in fields {
            let native_field = field.native_field.tagged_value_preserving_extras(&mut ctx)?;
            let mut element = vec![
                ("id", Value::String(field.element_id)),
                ("name", Value::String(field.name)),
            ];
            if let Some(description) = field.description { element.push(("description", Value::String(description))); }
            if let Some(scalar) = field.scalar_type { element.push(("scalarType", Value::string_utf8(scalar.as_str()))); }
            element.push(("extensions", Value::Object(Vec::new())));
            let mut item = vec![
                ("path", Value::String(field.path)),
                ("record", Value::String(field.record)),
                ("nativeField", native_field),
                ("element", Value::Object(element.into_iter().map(|(key, value)| (Utf16::from(key), value)).collect())),
            ];
            if let Some(id) = field.dependency_id { item.push(("dependencyId", Value::String(id))); }
            output.push(Value::Object(item.into_iter().map(|(key, value)| (Utf16::from(key), value)).collect()));
        }
        encode(&Value::Array(output), &mut ctx)
    })();
    result_envelope(result)
}

/// Inspect tagged Avro schema trees through the bounded structural profile.
/// Dependencies are caller-supplied and ordered; no I/O or parser is invoked.
pub fn execute_avro_inspect_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_avro_inspect_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_avro_inspect_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        use umf_core::{avro_semantics::{inspect_schema, Dependency}, native_json::NativeJsonTree};
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "op").as_deref() != Some("avro.schema.inspect") {
            return Err(fail("REQUEST", "Unknown Avro inspection operation"));
        }
        let root = NativeJsonTree::from_tagged_value(
            field(&request, "root").ok_or_else(|| fail("REQUEST", "Avro root is required"))?,
            &mut ctx,
        )?;
        let items = match field(&request, "dependencies") {
            None => &[][..],
            Some(Value::Array(items)) => items.as_slice(),
            _ => return Err(fail("REQUEST", "Avro dependencies must be an array")),
        };
        ctx.charge_work(items.len().saturating_add(1), Utf16::default())?;
        let mut owned = Vec::with_capacity(items.len());
        let mut seen_ids = std::collections::HashSet::<Vec<u16>>::new();
        for item in items {
            let id_ref = field(item, "id").and_then(as_utf16)
                .ok_or_else(|| fail("REQUEST", "Dependency id is required"))?;
            ctx.charge_work(id_ref.len().saturating_mul(2).saturating_add(1), Utf16::default())?;
            if !seen_ids.insert(id_ref.units().to_vec()) {
                return Err(fail("AVRO_DEPENDENCY_ID", "Dependency IDs must be unique"));
            }
            let id = id_ref.clone();
            let tree = NativeJsonTree::from_tagged_value(
                field(item, "root").ok_or_else(|| fail("REQUEST", "Dependency root is required"))?,
                &mut ctx,
            )?;
            owned.push((id, tree));
        }
        let dependencies = owned.iter().map(|(id, tree)| Dependency { id, tree }).collect::<Vec<_>>();
        let validation = inspect_schema(&root, &dependencies, &mut ctx)?;
        encode(&validation_value(validation), &mut ctx)
    })();
    result_envelope(result)
}

/// Inspect a UMF document through the Rust core and return its diagnostics in
/// the ordinary `umf.core-wire/1` result envelope. Admission, inspection, and
/// result encoding share one fresh cooperative context and caller control.
pub fn execute_protobuf_inspect_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_protobuf_inspect_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_protobuf_inspect_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        let op = text_field(&request, "op")
            .ok_or_else(|| fail("REQUEST", "Protobuf inspect operation is required"))?;
        if op != "protobuf.descriptor.inspect" {
            return Err(fail("REQUEST", "Unknown Protobuf inspect operation"));
        }
        let document = field(&request, "document")
            .ok_or_else(|| fail("REQUEST", "Protobuf document is required"))?;
        let validation = umf_core::protobuf_inspect::inspect_protobuf_document(document, &mut ctx)?;
        encode(&validation_value(validation), &mut ctx)
    })();
    result_envelope(result)
}

/// Execute one opt-in CONTRACT-049 numeric operation through the Rust core.
/// This separate profile does not change the R3 codegen protocol or ordinary
/// JSON number admission. A supplied context requires explicit core resources
/// and is validated against the current document and selected Field.
pub fn execute_javascript_numeric_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_javascript_numeric_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_javascript_numeric_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let request = {
            let mut transport = transport_context().with_host_control(control);
            decode(wire_json, &mut transport)?
        };
        if text_field(&request, "profile").as_deref() != Some("umf.javascript-numeric/1.0.0") {
            return Err(fail("REQUEST", "JavaScript numeric profile is required"));
        }
        let operation = text_field(&request, "op")
            .ok_or_else(|| fail("REQUEST", "JavaScript numeric operation is required"))?;
        let (literal, output) = {
            let mut operation_context = Context::ordinary().with_host_control(control);
            match operation.as_str() {
                "exactDecimal" => {
                    let token = string_field(&request, "token")?;
                    let token = umf_core::javascript_numeric::exact_decimal(&token, &mut operation_context)?;
                    let literal = numeric_carrier("decimalToken", &token);
                    (literal.clone(), literal)
                }
                "integerFromBigInt" => {
                    let token = string_field(&request, "token")?;
                    let token = umf_core::javascript_numeric::integer_from_bigint(&token, &mut operation_context)?;
                    let literal = numeric_carrier("integerToken", &token);
                    (literal.clone(), literal)
                }
                "integerToBigInt" => {
                    let token = carrier_field(&request, "integerToken")?;
                    let integer = umf_core::javascript_numeric::integer_to_bigint(&token, &mut operation_context)?;
                    (numeric_carrier("integerToken", &token), Value::String(Utf16::from(integer)))
                }
                "admitJavascriptNumber" => {
                    let bits = string_field(&request, "numberBits")?;
                    if bits.len() != 16 || !bits.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                        return Err(fail("JAVASCRIPT_NUMERIC", "Expected binary64 bit pattern"));
                    }
                    let bits = u64::from_str_radix(&bits, 16)
                        .map_err(|_| fail("JAVASCRIPT_NUMERIC", "Expected binary64 bit pattern"))?;
                    let number = f64::from_bits(bits);
                    let scalar_type = string_field(&request, "scalarType")?;
                    let token = umf_core::javascript_numeric::admit_javascript_number(
                        number,
                        &scalar_type,
                        &mut operation_context,
                    )?;
                    let carrier = if scalar_type == "integer" { "integerToken" } else { "decimalToken" };
                    let literal = numeric_carrier(carrier, &token);
                    (literal.clone(), literal)
                }
                "numericToNumberLossless" => {
                    let (carrier, token) = numeric_literal_field(&request)?;
                    let number = umf_core::javascript_numeric::numeric_to_number_lossless(
                        &token,
                        carrier == "integerToken",
                        &mut operation_context,
                    )?;
                    (numeric_carrier(carrier, &token), Value::Number(number))
                }
                _ => return Err(fail("REQUEST", "Unknown JavaScript numeric operation")),
            }
        };

        if let Some(context) = field(&request, "context") {
            let resources = field(&request, "resources")
                .ok_or_else(|| fail("REQUEST", "Explicit resources are required for Field context"))?;
            let engine = {
                let mut catalog = Context::catalog().with_host_control(control);
                Engine::new(
                    ResourceSet::new(
                        required_field(resources, "coreSchema")?,
                        required_field(resources, "referenceSchema")?,
                        required_field(resources, "packageSchema")?,
                        required_field(resources, "constraints")?,
                        required_field(resources, "domainPolicy")?,
                    ),
                    &mut catalog,
                )?
            };
            let document = required_field(context, "document")?;
            let field_context = required_field(context, "field")?;
            let module_id = string_field(&field_context, "module")?;
            let element_id = string_field(&field_context, "element")?;
            let registry = Registry::new();
            let mut capabilities = NumericNoCapabilities;
            let validation = {
                let mut operation_context = Context::ordinary().with_host_control(control);
                engine.validate_core_field_value(
                    &document,
                    &module_id,
                    &element_id,
                    &literal,
                    &registry,
                    &mut capabilities,
                    &mut operation_context,
                )?
            };
            let validation = validation_value(validation);
            let mut operation_context = Context::ordinary().with_host_control(control);
            return encode(&object(vec![("result", output), ("validation", validation)]), &mut operation_context);
        }
        let mut operation_context = Context::ordinary().with_host_control(control);
        encode(&output, &mut operation_context)
    })();
    result_envelope(result)
}

struct NumericNoCapabilities;
impl Capabilities for NumericNoCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &umf_core::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Err(Utf16::from("No extension callback is installed for numeric context validation"))
    }
}

fn text_field(value: &Value, name: &str) -> Option<String> {
    field(value, name)
        .and_then(as_utf16)
        .and_then(|value| value.to_utf8().ok())
}

fn string_field(value: &Value, name: &str) -> Result<String, EngineError> {
    let value = field(value, name)
        .and_then(as_utf16)
        .ok_or_else(|| fail("REQUEST", "Required text value is missing"))?;
    value
        .to_utf8()
        .map_err(|_| fail("REQUEST", "Text must contain well-formed UTF-16"))
}

fn required_field(value: &Value, name: &str) -> Result<Value, EngineError> {
    field(value, name)
        .cloned()
        .ok_or_else(|| fail("REQUEST", "Explicit resource or context member is required"))
}

fn numeric_carrier(name: &str, token: &str) -> Value {
    object(vec![(name, Value::String(Utf16::from(token)))])
}

fn carrier_field(request: &Value, carrier: &str) -> Result<String, EngineError> {
    let literal = field(request, "literal").ok_or_else(|| fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"))?;
    let Value::Object(members) = literal else {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"));
    };
    if members.len() != 1 || members[0].0 != Utf16::from(carrier) {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"));
    }
    let Value::String(token) = &members[0].1 else {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected numeric token text"));
    };
    token
        .to_utf8()
        .map_err(|_| fail("JAVASCRIPT_NUMERIC", "Expected numeric token text"))
}

fn numeric_literal_field(request: &Value) -> Result<(&'static str, String), EngineError> {
    let literal = field(request, "literal").ok_or_else(|| fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"))?;
    let Value::Object(members) = literal else {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"));
    };
    if members.len() != 1 {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"));
    }
    let carrier = match members[0].0.to_utf8().ok().as_deref() {
        Some("integerToken") => "integerToken",
        Some("decimalToken") => "decimalToken",
        _ => return Err(fail("JAVASCRIPT_NUMERIC", "Expected integerToken or decimalToken")),
    };
    let Value::String(token) = &members[0].1 else {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected numeric token text"));
    };
    let token = token
        .to_utf8()
        .map_err(|_| fail("JAVASCRIPT_NUMERIC", "Expected numeric token text"))?;
    Ok((carrier, token))
}

/// Execute the shared production engine request protocol. Each request uses a
/// catalog context for explicit resource/registry admission and a fresh
/// ordinary context for the document operation. Host callbacks remain supplied
/// by the trusted binding caller; document data never selects executable code.
pub fn execute_request(
    wire_json: &str,
    profile: ResourceProfile,
    capabilities: &mut dyn Capabilities,
) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_request_with_control(wire_json, profile, capabilities, &mut no_control)
}

/// Execute using an explicit binding-owned cooperative work hook. The hook is
/// polled for each charged work unit during decode, resource admission,
/// document work, callbacks, and result encoding. It is never read from wire.
pub fn execute_request_with_control(
    wire_json: &str,
    profile: ResourceProfile,
    capabilities: &mut dyn Capabilities,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    if profile == ResourceProfile::HardIsolated {
        return error_envelope(EngineError::new(
            "RESOURCE_PROFILE_UNAVAILABLE",
            Utf16::default(),
            "HardIsolated resource profile is unavailable",
        ));
    }
    let result = execute_request_inner(wire_json, capabilities, control);
    result_envelope(result)
}

fn execute_request_inner(
    wire_json: &str,
    capabilities: &mut dyn Capabilities,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> Result<String, EngineError> {
    // The outer request/result envelope adds transport tags and wrapper
    // members around independently bounded catalog resources and an ordinary
    // document. Its limits must not narrow either semantic admission profile.
    let mut request = {
        let mut transport = transport_context().with_host_control(control);
        decode(wire_json, &mut transport)?
    };
    let op = field(&request, "op")
        .and_then(as_utf16)
        .and_then(|v| v.to_utf8().ok())
        .ok_or_else(|| fail("REQUEST", "Request op is required"))?;
    #[cfg(feature = "codegen")]
    if let Some(operation) = op.strip_prefix("codegen/") {
        return codegen::execute(operation, &mut request, control);
    }
    let mut resources = take_field(&mut request, "resources")
        .ok_or_else(|| fail("REQUEST", "Explicit resources are required"))?;
    let registry_value = take_field(&mut request, "registry");
    let mut operation = Context::ordinary().with_host_control(control);
    let (engine, registry) = operation.with_catalog_value_limit(|catalog| {
        let resource = |resources: &mut Value, name: &str| {
            take_field(resources, name).ok_or_else(|| {
                EngineError::new(
                    "REQUEST",
                    Utf16::from(name),
                    "Explicit resource is required",
                )
            })
        };
        let engine = Engine::new(
            ResourceSet::new(
                resource(&mut resources, "coreSchema")?,
                resource(&mut resources, "referenceSchema")?,
                resource(&mut resources, "packageSchema")?,
                resource(&mut resources, "constraints")?,
                resource(&mut resources, "domainPolicy")?,
            ),
            catalog,
        )?;
        let mut registry = Registry::new();
        if let Some(Value::Array(extensions)) = registry_value {
            let schema_resources = engine.schema_resources_with_context(catalog)?;
            for (index, mut extension) in extensions.into_iter().enumerate() {
                let id = take_field(&mut extension, "id")
                    .and_then(|v| match v {
                        Value::String(text) => Some(text),
                        _ => None,
                    })
                    .ok_or_else(|| fail("REQUEST", "Registry id must be a string"))?;
                let version = take_field(&mut extension, "version")
                    .and_then(|v| match v {
                        Value::String(text) => Some(text),
                        _ => None,
                    })
                    .ok_or_else(|| fail("REQUEST", "Registry version must be a string"))?;
                let scopes =
                    if let Some(Value::Array(scopes)) = take_field(&mut extension, "scopes") {
                        scopes
                            .into_iter()
                            .map(|scope| match scope {
                                Value::String(value) => Ok(value),
                                _ => Err(fail("REQUEST", "Registry scopes must be strings")),
                            })
                            .collect::<Result<Vec<_>, _>>()?
                    } else if let Some(Value::String(scope)) = take_field(&mut extension, "scope") {
                        vec![scope]
                    } else {
                        return Err(fail("REQUEST", "Registry scopes are required"));
                    };
                let schema = take_field(&mut extension, "schema").unwrap_or(Value::Bool(true));
                let semantic = matches!(
                    take_field(&mut extension, "semantic"),
                    Some(Value::Bool(true))
                );
                let token = semantic.then_some((index as u64) + 1);
                registry.register_extension_owned(
                    id,
                    version,
                    scopes,
                    schema,
                    semantic,
                    token,
                    engine.package_schema(),
                    &schema_resources,
                    catalog,
                )?;
            }
        }
        Ok::<_, EngineError>((engine, registry))
    })?;
    let value = {
        match op.as_str() {
            "model/inspectCoreCardinality" | "model/declareCoreCardinality" | "model/verifyCoreCardinalityDeclaration"
            | "model/inspectCoreKind" | "model/declareCoreKind" | "model/verifyCoreKindDeclaration"
            | "model/inspectCoreNullability" | "model/declareCoreNullability" | "model/verifyCoreNullabilityDeclaration"
            | "model/selectCoreElements" | "model/validateCoreFieldValue" | "model/resolveCoreDefault" => {
                model_operation(&op, &request, &engine, &registry, capabilities, &mut operation)?
            }
            "validate" => {
                let document = field(&request, "document")
                    .ok_or_else(|| fail("REQUEST", "Document is required"))?;
                validation_value(engine.validate_document(
                    document,
                    &registry,
                    capabilities,
                    &mut operation,
                )?)
            }
            "read" => {
                let source = field(&request, "source")
                    .and_then(as_utf16)
                    .ok_or_else(|| fail("REQUEST", "Source must be a string"))?;
                let document = umf_core::document::read_document(
                    source.units(),
                    format_field(&request)?,
                    &engine,
                    &registry,
                    capabilities,
                    &mut operation,
                )?;
                object(vec![("document", document)])
            }
            "write" => {
                let document = field(&request, "document")
                    .ok_or_else(|| fail("REQUEST", "Document is required"))?;
                let source = umf_core::document::write_document(
                    document,
                    format_field(&request)?,
                    &engine,
                    &registry,
                    capabilities,
                    &mut operation,
                )?;
                object(vec![("source", Value::String(source))])
            }
            _ => return Err(fail("REQUEST", "Unknown core operation")),
        }
    };
    let mut transport = transport_context().with_host_control(control);
    encode(&value, &mut transport)
}

fn model_operation(
    op: &str,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let value = |name: &str| field(request, name).ok_or_else(|| fail("REQUEST", &format!("{name} is required")));
    let identity = || -> Result<(Utf16, Utf16), EngineError> {
        let id = value("identity")?;
        let module = field(id, "module").and_then(as_utf16).cloned().filter(|s| !s.is_empty())
            .ok_or_else(|| fail("REQUEST", "identity.module must be a nonempty string"))?;
        let element = field(id, "element").and_then(as_utf16).cloned().filter(|s| !s.is_empty())
            .ok_or_else(|| fail("REQUEST", "identity.element must be a nonempty string"))?;
        Ok((module, element))
    };
    let result = match op {
        "model/validateCoreFieldValue" => validation_value(
            engine.validate_core_field_value_public(
                value("source")?,
                value("field")?,
                value("value")?,
                ctx,
            )?,
        ),
        "model/resolveCoreDefault" => engine.resolve_core_default_public(
            value("source")?,
            value("field")?,
            value("state")?,
            ctx,
        )?,
        "model/selectCoreElements" => umf_core::selection::select_core_elements(
            value("source")?, value("query")?, engine, registry, capabilities, ctx,
        )?,
        "model/inspectCoreCardinality" => {
            let (module, element) = identity()?;
            umf_core::cardinality::inspect_core_cardinality(value("source")?, &umf_core::cardinality::Identity { module, element }, engine, registry, capabilities, ctx)?
        }
        "model/declareCoreCardinality" => {
            let (module, element) = identity()?;
            umf_core::cardinality::declare_core_cardinality(value("source")?, &umf_core::cardinality::Identity { module, element }, value("request")?, engine, registry, capabilities, ctx)?
        }
        "model/verifyCoreCardinalityDeclaration" => umf_core::cardinality::verify_core_cardinality_declaration(value("receipt")?, value("current")?, engine, registry, capabilities, ctx)?,
        "model/inspectCoreKind" => {
            let (module, element) = identity()?;
            umf_core::core_kind::inspect_core_kind(value("source")?, &umf_core::core_kind::Identity { module, element }, engine, registry, capabilities, ctx)?
        }
        "model/declareCoreKind" => {
            let (module, element) = identity()?;
            let kind = as_utf16(value("kind")?).and_then(|x| x.to_utf8().ok()).ok_or_else(|| fail("REQUEST", "kind must be a string"))?;
            umf_core::core_kind::declare_core_kind(value("source")?, &umf_core::core_kind::Identity { module, element }, &kind, engine, registry, capabilities, ctx)?
        }
        "model/verifyCoreKindDeclaration" => umf_core::core_kind::verify_core_kind_declaration(value("receipt")?, value("current")?, engine, registry, capabilities, ctx)?,
        "model/inspectCoreNullability" => {
            let (module, element) = identity()?;
            umf_core::nullability::inspect_core_nullability(value("source")?, &umf_core::nullability::Identity { module, element }, engine, registry, capabilities, ctx)?
        }
        "model/declareCoreNullability" => {
            let (module, element) = identity()?;
            let nullability = as_utf16(value("nullability")?).and_then(|x| x.to_utf8().ok()).ok_or_else(|| fail("REQUEST", "nullability must be a string"))?;
            umf_core::nullability::declare_core_nullability(value("source")?, &umf_core::nullability::Identity { module, element }, &nullability, engine, registry, capabilities, ctx)?
        }
        "model/verifyCoreNullabilityDeclaration" => umf_core::nullability::verify_core_nullability_declaration(value("receipt")?, value("current")?, engine, registry, capabilities, ctx)?,
        _ => return Err(fail("REQUEST", "Unknown core model operation")),
    };
    Ok(result)
}

/// A separately bounded envelope context. The larger ceilings pay for tagged
/// wire expansion and allow catalog plus ordinary operation payloads to share
/// one request without changing the limits each core API applies to its own
/// admitted tree.
pub fn transport_context<'a>() -> Context<'a> {
    Context::with_limits(
        ResourceProfile::Cooperative,
        Limits {
            max_text_units: usize::MAX,
            max_depth: 256,
            // The envelope may combine several individually admitted catalog
            // values plus an ordinary document. Semantic limits are applied to
            // each payload after transport decode, so this context must not impose
            // a smaller aggregate count.
            max_values: usize::MAX,
            ..Limits::catalog()
        },
    )
    .expect("cooperative transport context is available")
}

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let key = Utf16::from(name);
    match value {
        Value::Object(members) => members
            .iter()
            .find(|(k, _)| *k == key)
            .map(|(_, value)| value),
        _ => None,
    }
}
fn as_utf16(value: &Value) -> Option<&Utf16> {
    match value {
        Value::String(s) => Some(s),
        _ => None,
    }
}
fn take_field(value: &mut Value, name: &str) -> Option<Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    let key = Utf16::from(name);
    fields
        .iter()
        .position(|(candidate, _)| candidate == &key)
        .map(|index| fields.remove(index).1)
}
fn format_field(value: &Value) -> Result<Format, EngineError> {
    match field(value, "format")
        .and_then(as_utf16)
        .and_then(|s| s.to_utf8().ok())
        .as_deref()
    {
        Some("json") => Ok(Format::Json),
        Some("yaml") => Ok(Format::Yaml),
        _ => Err(fail("REQUEST", "Format must be json or yaml")),
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
fn validation_value(validation: umf_core::Validation) -> Value {
    Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(validation.valid)),
        (Utf16::from("complete"), Value::Bool(validation.complete)),
        (
            Utf16::from("diagnostics"),
            Value::Array(
                validation
                    .diagnostics
                    .into_iter()
                    .map(|item| diagnostic_value(item))
                    .collect(),
            ),
        ),
    ])
}
fn diagnostic_value(item: Diagnostic) -> Value {
    Value::Object(vec![
        (Utf16::from("code"), Value::String(item.code)),
        (Utf16::from("path"), Value::String(item.path)),
        (Utf16::from("message"), Value::String(item.message)),
        (
            Utf16::from("severity"),
            Value::string_utf8(if item.severity == Severity::Warning {
                "warning"
            } else {
                "error"
            }),
        ),
    ])
}

fn decode_node(node: Json, path: &str) -> Result<Value, EngineError> {
    enum Task {
        Visit(Json, String),
        BuildArray(usize),
        BuildObject(Vec<Vec<u16>>, String),
    }
    let mut tasks = vec![Task::Visit(node, path.to_owned())];
    let mut values = Vec::<Value>::new();
    while let Some(task) = tasks.pop() {
        match task {
            Task::BuildArray(length) => {
                if values.len() < length {
                    return Err(fail("WIRE_FORMAT", "Malformed array child count"));
                }
                let children = values.split_off(values.len() - length);
                values.push(Value::Array(children));
            }
            Task::BuildObject(keys, path) => {
                if values.len() < keys.len() {
                    return Err(fail("WIRE_FORMAT", "Malformed object child count"));
                }
                let children = values.split_off(values.len() - keys.len());
                let members = keys
                    .into_iter()
                    .zip(children)
                    .map(|(key, value)| (Utf16::new(key), value))
                    .collect();
                values.push(Value::object(members, Utf16::from(path))?);
            }
            Task::Visit(node, path) => {
                let mut fields = as_object(node)?;
                let kind = match remove_field(&mut fields, "kind")? {
                    Json::String(kind) => kind,
                    _ => return Err(fail("WIRE_FORMAT", "Missing string tag")),
                };
                match kind.as_str() {
                    "null" => {
                        ensure_empty(fields)?;
                        values.push(Value::Null);
                    }
                    "boolean" => {
                        let value = match remove_field(&mut fields, "value")? {
                            Json::Bool(value) => value,
                            _ => return Err(fail("WIRE_FORMAT", "Expected boolean value")),
                        };
                        ensure_empty(fields)?;
                        values.push(Value::Bool(value));
                    }
                    "number" => {
                        let bits = match remove_field(&mut fields, "bits")? {
                            Json::String(value)
                                if value.len() == 16
                                    && value.bytes().all(|b| {
                                        b.is_ascii_digit() || (b'a'..=b'f').contains(&b)
                                    }) =>
                            {
                                value
                            }
                            _ => {
                                return Err(fail(
                                    "WIRE_FORMAT",
                                    "Expected 16 lowercase hexadecimal binary64 bits",
                                ))
                            }
                        };
                        ensure_empty(fields)?;
                        let bits = u64::from_str_radix(&bits, 16)
                            .map_err(|_| fail("WIRE_FORMAT", "Malformed binary64 bits"))?;
                        values.push(Value::number(f64::from_bits(bits), Utf16::from(path))?);
                    }
                    "string" => {
                        let units = read_units(remove_field(&mut fields, "units")?)?;
                        ensure_empty(fields)?;
                        values.push(Value::String(Utf16::new(units)));
                    }
                    "array" => {
                        let items = match remove_field(&mut fields, "items")? {
                            Json::Array(items) => items,
                            _ => return Err(fail("WIRE_FORMAT", "Expected array items")),
                        };
                        ensure_empty(fields)?;
                        let length = items.len();
                        tasks.push(Task::BuildArray(length));
                        for (index, item) in items.into_iter().enumerate().rev() {
                            tasks.push(Task::Visit(item, format!("{path}/{index}")));
                        }
                    }
                    "object" => {
                        let members = match remove_field(&mut fields, "members")? {
                            Json::Array(members) => members,
                            _ => return Err(fail("WIRE_FORMAT", "Expected object members")),
                        };
                        ensure_empty(fields)?;
                        let mut keys = Vec::with_capacity(members.len());
                        let mut children = Vec::with_capacity(members.len());
                        for member in members {
                            let mut fields = as_object(member)?;
                            if fields.len() != 2
                                || fields.iter().any(|(key, _)| key != "key" && key != "value")
                            {
                                return Err(fail(
                                    "WIRE_FORMAT",
                                    "Object member requires exactly key and value fields",
                                ));
                            }
                            let key = read_units(remove_field(&mut fields, "key")?)?;
                            let value = remove_field(&mut fields, "value")?;
                            ensure_empty(fields)?;
                            keys.push(key);
                            children.push(value);
                        }
                        tasks.push(Task::BuildObject(keys, path.clone()));
                        for child in children.into_iter().rev() {
                            tasks.push(Task::Visit(child, path.clone()));
                        }
                    }
                    _ => return Err(fail("WIRE_FORMAT", format!("Unknown wire tag {kind:?}"))),
                }
            }
        }
    }
    if values.len() != 1 {
        return Err(fail("WIRE_FORMAT", "Malformed tagged value tree"));
    }
    Ok(values.pop().expect("one decoded value"))
}

fn as_object(value: Json) -> Result<Vec<(String, Json)>, EngineError> {
    match value {
        Json::Object(fields) => Ok(fields),
        _ => Err(fail("WIRE_FORMAT", "Expected member object")),
    }
}
fn remove_field(fields: &mut Vec<(String, Json)>, name: &str) -> Result<Json, EngineError> {
    let index = fields
        .iter()
        .position(|(key, _)| key == name)
        .ok_or_else(|| fail("WIRE_FORMAT", format!("Missing required field {name}")))?;
    Ok(fields.remove(index).1)
}
fn ensure_empty(fields: Vec<(String, Json)>) -> Result<(), EngineError> {
    if fields.is_empty() {
        Ok(())
    } else {
        Err(fail(
            "WIRE_FORMAT",
            format!("Unknown transport field {}", fields[0].0),
        ))
    }
}
fn read_units(value: Json) -> Result<Vec<u16>, EngineError> {
    match value {
        Json::Array(values) => values
            .into_iter()
            .map(|value| match value {
                Json::Number(number) => number
                    .as_u64()
                    .filter(|unit| *unit <= u16::MAX as u64)
                    .map(|unit| unit as u16)
                    .ok_or_else(|| {
                        fail(
                            "WIRE_FORMAT",
                            "UTF-16 code unit must be an integer from 0 through 65535",
                        )
                    }),
                _ => Err(fail("WIRE_FORMAT", "UTF-16 code unit must be an integer")),
            })
            .collect(),
        _ => Err(fail("WIRE_FORMAT", "Expected UTF-16 code-unit array")),
    }
}
fn fail(code: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, Utf16::default(), message.into())
}

/// Bound transport allocation and charge its token work before serde builds the tree.
/// The scanner deliberately accepts no syntax; serde remains the parser authority.
fn preflight(source: &[u8], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let limits = ctx.limits();
    let max_depth = limits.max_depth.saturating_mul(3).saturating_add(8);
    // Token expansion is bounded by the already-owned encoded request itself;
    // max_values/depth are enforced again when the tagged value is decoded.
    let max_tokens = source.len();
    let mut depth = 0usize;
    let mut tokens = 0usize;
    let mut index = 0usize;
    while index < source.len() {
        match source[index] {
            b' ' | b'\n' | b'\r' | b'\t' | b':' | b',' => index += 1,
            b'{' | b'[' => {
                depth = depth.saturating_add(1);
                if depth > max_depth {
                    return Err(fail(
                        "LIMIT",
                        "Tagged transport nesting exceeds the bounded depth",
                    ));
                }
                tokens += 1;
                index += 1;
            }
            b'}' | b']' => {
                depth = depth.saturating_sub(1);
                tokens += 1;
                index += 1;
            }
            b'"' => {
                tokens += 1;
                index += 1;
                while index < source.len() {
                    match source[index] {
                        b'\\' => index = (index + 2).min(source.len()),
                        b'"' => {
                            index += 1;
                            break;
                        }
                        _ => index += 1,
                    }
                }
            }
            _ => {
                tokens += 1;
                while index < source.len()
                    && !matches!(
                        source[index],
                        b' ' | b'\n' | b'\r' | b'\t' | b',' | b']' | b'}'
                    )
                {
                    index += 1;
                }
            }
        }
        if tokens > max_tokens {
            return Err(fail("LIMIT", "Tagged transport contains too many values"));
        }
    }
    ctx.charge_work(tokens, Utf16::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct BaselineCapabilities {
        enabled: bool,
    }

    impl umf_core::Capabilities for BaselineCapabilities {
        fn validate_extension(
            &mut self,
            token: u64,
            payload: &Value,
            context: &umf_core::SemanticContext,
        ) -> Result<Vec<umf_core::Diagnostic>, Utf16> {
            if !self.enabled || token == 0 {
                return Err(Utf16::from(
                    "No native callback capability is registered for this token",
                ));
            }
            let id = field(&context.document, "id")
                .and_then(as_utf16)
                .and_then(|value| value.to_utf8().ok())
                .unwrap_or_default();
            let kind = field(payload, "kind")
                .and_then(as_utf16)
                .and_then(|value| value.to_utf8().ok())
                .unwrap_or_default();
            let mut message = id.encode_utf16().collect::<Vec<_>>();
            message.push(b':' as u16);
            message.extend(context.scope.encode_utf16());
            message.push(b':' as u16);
            message.extend(kind.encode_utf16());
            Ok(vec![umf_core::Diagnostic {
                code: Utf16::from("BASELINE_CALLBACK"),
                path: context.path.clone(),
                python_source_path: false,
                message: Utf16::new(message),
                severity: umf_core::Severity::Warning,
                python_text_origin: None,
            }])
        }
    }

    fn parse_wire_source(source: &str, ctx: &mut Context<'_>) -> Value {
        umf_core::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            umf_core::serialization::Format::Json,
            ctx,
        )
        .unwrap()
    }

    fn sorted_object_members(value: &Value) -> Value {
        match value {
            Value::Array(items) => Value::Array(items.iter().map(sorted_object_members).collect()),
            Value::Object(members) => {
                let mut members = members
                    .iter()
                    .map(|(key, value)| (key.clone(), sorted_object_members(value)))
                    .collect::<Vec<_>>();
                members.sort_by(|(left, _), (right, _)| left.cmp(right));
                Value::Object(members)
            }
            other => other.clone(),
        }
    }

    #[test]
    fn production_request_dispatcher_matches_all_frozen_139_vectors() {
        let mut catalog = Context::catalog();
        let fixture = parse_wire_source(
            include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/baseline-current-conformance.json"),
            &mut catalog,
        );
        let resources = Value::Object(vec![
            (
                Utf16::from("coreSchema"),
                parse_wire_source(include_str!("../../../spec/core/schema.json"), &mut catalog),
            ),
            (
                Utf16::from("referenceSchema"),
                parse_wire_source(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    &mut catalog,
                ),
            ),
            (
                Utf16::from("packageSchema"),
                parse_wire_source(
                    include_str!("../../../spec/core/extension-package.schema.json"),
                    &mut catalog,
                ),
            ),
            (
                Utf16::from("constraints"),
                parse_wire_source(
                    include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                    &mut catalog,
                ),
            ),
            (
                Utf16::from("domainPolicy"),
                parse_wire_source(
                    include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                    &mut catalog,
                ),
            ),
        ]);
        let Value::Array(cases) = field(&fixture, "cases").expect("case array") else {
            panic!("frozen case array expected")
        };
        assert_eq!(cases.len(), 139);

        let mut capabilities = BaselineCapabilities { enabled: true };
        for case in cases {
            let mut members = vec![
                (Utf16::from("op"), Value::string_utf8("validate")),
                (Utf16::from("resources"), resources.clone()),
                (
                    Utf16::from("document"),
                    field(case, "document").expect("case document").clone(),
                ),
            ];
            if let Some(registry) = field(case, "registry") {
                let extension = Value::Object(vec![
                    (Utf16::from("id"), field(registry, "id").unwrap().clone()),
                    (
                        Utf16::from("version"),
                        field(registry, "version").unwrap().clone(),
                    ),
                    (
                        Utf16::from("scopes"),
                        Value::Array(vec![field(registry, "scope").unwrap().clone()]),
                    ),
                    (Utf16::from("schema"), Value::Bool(true)),
                    (Utf16::from("semantic"), Value::Bool(true)),
                ]);
                members.push((Utf16::from("registry"), Value::Array(vec![extension])));
            }
            let request = Value::Object(members);
            let wire = encode(&request, &mut transport_context()).unwrap();
            let envelope: serde_json::Value = serde_json::from_str(&execute_request(
                &wire,
                ResourceProfile::Cooperative,
                &mut capabilities,
            ))
            .unwrap();
            assert_eq!(
                envelope["status"],
                "ok",
                "case {}",
                as_utf16(field(case, "id").unwrap())
                    .unwrap()
                    .to_utf8()
                    .unwrap()
            );
            let result_wire = envelope["wire"].as_str().expect("result wire");
            let actual = decode(result_wire, &mut transport_context()).unwrap();
            let expected = Value::Object(vec![
                (Utf16::from("valid"), field(case, "valid").unwrap().clone()),
                (
                    Utf16::from("complete"),
                    field(case, "complete").unwrap().clone(),
                ),
                (
                    Utf16::from("diagnostics"),
                    field(case, "diagnostics").unwrap().clone(),
                ),
            ]);
            assert_eq!(
                sorted_object_members(&actual),
                sorted_object_members(&expected),
                "case {}",
                as_utf16(field(case, "id").unwrap())
                    .unwrap()
                    .to_utf8()
                    .unwrap()
            );
        }
    }

    #[test]
    fn preserves_member_order_and_accepts_member_field_order_independently() {
        let source = r#"{"kind":"object","members":[{"value":{"kind":"number","bits":"3ff0000000000000"},"key":[98]},{"key":[97],"value":{"kind":"string","units":[55296]}}]}"#;
        let mut ctx = Context::ordinary();
        let value = decode(source, &mut ctx).unwrap();
        let roundtrip = decode(
            &encode(&value, &mut Context::ordinary()).unwrap(),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(roundtrip, value);
        let Value::Object(members) = value else {
            panic!("object expected")
        };
        assert_eq!(
            members
                .iter()
                .map(|(key, _)| key.units()[0])
                .collect::<Vec<_>>(),
            [98, 97]
        );
        assert_eq!(members[1].1, Value::String(Utf16::new(vec![0xd800])));
    }

    #[test]
    fn bounded_iterative_transport_preserves_semantic_depth_128_and_rejects_129() {
        fn nested_array(depth: usize) -> String {
            format!(
                "{}{{\"kind\":\"null\"}}{}",
                "{\"kind\":\"array\",\"items\":[".repeat(depth),
                "]}".repeat(depth)
            )
        }
        let at_limit = nested_array(128);
        let mut ctx = Context::ordinary();
        let decoded = decode(&at_limit, &mut ctx).expect("semantic depth 128 is supported");
        let encoded =
            encode(&decoded, &mut Context::ordinary()).expect("semantic depth 128 can be encoded");
        assert_eq!(decode(&encoded, &mut Context::ordinary()).unwrap(), decoded);
        let Value::Array(mut child) = decoded else {
            panic!("nested array expected")
        };
        for _ in 0..127 {
            let Some(Value::Array(items)) = child.into_iter().next() else {
                panic!("nested array expected")
            };
            child = items;
        }
        assert_eq!(child, [Value::Null]);

        let above_limit = nested_array(129);
        let error = decode(&above_limit, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "LIMIT");
    }

    #[test]
    fn encoding_charges_exact_transport_before_reserving_output() {
        let value = Value::String(Utf16::new(vec![b'a' as u16; 10_000]));
        let expected_size = encode(&value, &mut Context::ordinary()).unwrap().len();
        let mut denied_output_charge = false;
        let mut meter = |amount| {
            if amount == expected_size {
                denied_output_charge = true;
                Err(EngineError::new(
                    "OUTPUT_PREALLOCATION",
                    Utf16::default(),
                    "denied before wire output allocation",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = encode(&value, &mut ctx).unwrap_err();
        assert_eq!(error.code, "OUTPUT_PREALLOCATION");
        assert!(
            denied_output_charge,
            "the exact tagged output size must be charged before the writer reserves it"
        );
    }

    #[test]
    fn rejects_duplicate_unknown_and_malformed_transport_fields() {
        for source in [
            r#"{"kind":"null","kind":"null"}"#,
            r#"{"kind":"null","extra":1}"#,
            r#"{"kind":"number","bits":"8000000000000000"}"#,
            r#"{"kind":"object","members":[{"key":[97],"value":{"kind":"null"}},{"key":[97],"value":{"kind":"null"}}]}"#,
        ] {
            assert!(
                decode(source, &mut Context::ordinary()).is_err(),
                "accepted {source}"
            );
        }
    }

    #[test]
    fn closed_error_envelope_preserves_utf16_path_and_message_units() {
        let error = EngineError::new(
            "HOST_ERROR",
            Utf16::new(vec![b'/' as u16, 0xd800]),
            Utf16::new(vec![b'c' as u16, 0xdc00]),
        );
        let envelope: serde_json::Value = serde_json::from_str(&error_envelope(error)).unwrap();
        assert_eq!(envelope["profile"], "umf.core-wire/1");
        assert_eq!(envelope["status"], "error");
        assert_eq!(envelope["pathUnits"], serde_json::json!([47, 55296]));
        assert_eq!(envelope["messageUnits"], serde_json::json!([99, 56320]));
    }

    #[test]
    fn callback_snapshot_charges_operation_context_before_encoding() {
        let payload = Value::Object(vec![(
            Utf16::from("large"),
            Value::String(Utf16::from("payload")),
        )]);
        let document = Value::Object(vec![(
            Utf16::from("large"),
            Value::String(Utf16::from("document")),
        )]);
        let mut charges = 0usize;
        let mut control = |amount| {
            charges += amount;
            if charges > 1 {
                Err(EngineError::new(
                    "TEST_BUDGET",
                    Utf16::default(),
                    "callback copy charged",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_host_control(&mut control);
        let error = encode_callback_request(
            &payload,
            &document,
            &Utf16::from("/ext"),
            "document",
            &mut ctx,
        )
        .unwrap_err();
        assert_eq!(error.code, "TEST_BUDGET");
        assert!(charges > 0);
    }

    #[test]
    fn callback_paths_and_scopes_are_metered_work_not_source_text() {
        const LENGTH: usize = 4_000_001;
        let payload = Value::Null;
        let document = Value::Null;
        let path = Utf16::new(vec![b'p' as u16; LENGTH]);
        let mut ctx = Context::ordinary();
        let encoded = encode_callback_request(&payload, &document, &path, "x", &mut ctx).unwrap();
        assert!(encoded.len() > LENGTH);
        drop(encoded);

        let scope = "s".repeat(LENGTH);
        let mut ctx = Context::ordinary();
        let encoded =
            encode_callback_request(&payload, &document, &Utf16::from("/"), &scope, &mut ctx)
                .unwrap();
        assert!(encoded.len() > LENGTH);
        drop(encoded);

        let mut control = |amount| {
            if amount >= LENGTH {
                Err(EngineError::new(
                    "TEST_BUDGET",
                    Utf16::default(),
                    "callback path work denied",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_host_control(&mut control);
        let error = encode_callback_request(&payload, &document, &path, "x", &mut ctx).unwrap_err();
        assert_eq!(error.code, "TEST_BUDGET");
    }
}

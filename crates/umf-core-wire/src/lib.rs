// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private `umf.core-wire/1` transport shared by native language bindings.
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
    if let Some(operation) = op.strip_prefix("codegen/") {
        return codegen::execute(operation, &mut request, control);
    }
    let mut resources = take_field(&mut request, "resources")
        .ok_or_else(|| fail("REQUEST", "Explicit resources are required"))?;
    let registry_value = take_field(&mut request, "registry");
    let (engine, registry) = {
        let mut catalog = Context::catalog().with_host_control(control);
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
            &mut catalog,
        )?;
        let mut registry = Registry::new();
        if let Some(Value::Array(extensions)) = registry_value {
            let schema_resources = engine.schema_resources_with_context(&mut catalog)?;
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
                    &mut catalog,
                )?;
            }
        }
        (engine, registry)
    };
    let value = {
        let mut operation = Context::ordinary().with_host_control(control);
        match op.as_str() {
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

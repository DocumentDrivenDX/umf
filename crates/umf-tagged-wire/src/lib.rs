// SPDX-License-Identifier: MIT OR Apache-2.0
//! Shared strict tagged UTF-16/binary64 transport codec.
use std::collections::BTreeSet;
use std::sync::Arc;

use umf_core::{copy_json, Context, EngineError, Limits, ResourceProfile, Utf16, Value};

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
                    ));
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
                        ));
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
                        ));
                    }
                },
                None => unreachable!(),
            },
        }
    }
}

pub fn decode(wire_json: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    preflight(wire_json.as_bytes(), ctx)?;
    let json = parse_json_bounded(wire_json.as_bytes(), ctx)?;
    let value = decode_node(json)?;
    copy_json(&value, ctx)
}

pub fn encode(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    // Admit and meter the whole tree before constructing the tagged transport
    // tree or serialized output. The copy also rejects duplicate keys and
    // invalid binary64 values in caller-created core Values.
    let value = copy_json(value, ctx)?;
    encode_owned(&value, ctx)
}

#[doc(hidden)]
pub fn encode_owned(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
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

#[doc(hidden)]
pub fn units_wire_size(units: &[u16], ctx: &mut Context<'_>) -> Result<usize, EngineError> {
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

#[doc(hidden)]
pub fn wire_size(value: &Value, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
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

#[doc(hidden)]
pub fn write_units(units: &[u16], output: &mut String) {
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

#[doc(hidden)]
pub fn write_wire(value: &Value, output: &mut String) {
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

/// Create the shared context used for tagged-wire admission and encoding.
/// Callers may attach a meter when wire work should be charged to a request.

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

#[derive(Clone, Default)]
struct JsonPointerPath(Vec<Arc<[u16]>>);

impl JsonPointerPath {
    fn child(&self, segment: Arc<[u16]>) -> Self {
        let mut segments = self.0.clone();
        segments.push(segment);
        Self(segments)
    }

    fn to_utf16(&self) -> Utf16 {
        let capacity = self.0.iter().fold(self.0.len(), |length, segment| {
            length.saturating_add(segment.len()).saturating_add(
                segment
                    .iter()
                    .filter(|unit| **unit == b'~' as u16 || **unit == b'/' as u16)
                    .count(),
            )
        });
        let mut units = Vec::with_capacity(capacity);
        for segment in &self.0 {
            units.push(b'/' as u16);
            for unit in segment.iter() {
                match *unit {
                    0x7e => units.extend_from_slice(&[b'~' as u16, b'0' as u16]),
                    0x2f => units.extend_from_slice(&[b'~' as u16, b'1' as u16]),
                    unit => units.push(unit),
                }
            }
        }
        Utf16::new(units)
    }
}

fn decode_node(node: Json) -> Result<Value, EngineError> {
    enum Task {
        Visit(Json, JsonPointerPath),
        BuildArray(usize),
        BuildObject(Vec<Arc<[u16]>>, JsonPointerPath),
    }
    let mut tasks = vec![Task::Visit(node, JsonPointerPath::default())];
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
                    .map(|(key, value)| (Utf16::new(key.as_ref().to_vec()), value))
                    .collect();
                values.push(Value::object(members, path.to_utf16())?);
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
                                ));
                            }
                        };
                        ensure_empty(fields)?;
                        let bits = u64::from_str_radix(&bits, 16)
                            .map_err(|_| fail("WIRE_FORMAT", "Malformed binary64 bits"))?;
                        values.push(Value::number(f64::from_bits(bits), path.to_utf16())?);
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
                            let segment = index.to_string().encode_utf16().collect::<Vec<_>>();
                            let child_path = path.child(Arc::from(segment));
                            tasks.push(Task::Visit(item, child_path));
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
                        let mut child_paths = Vec::with_capacity(members.len());
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
                            let key =
                                Arc::<[u16]>::from(read_units(remove_field(&mut fields, "key")?)?);
                            let value = remove_field(&mut fields, "value")?;
                            ensure_empty(fields)?;
                            child_paths.push(path.child(Arc::clone(&key)));
                            keys.push(key);
                            children.push(value);
                        }
                        tasks.push(Task::BuildObject(keys, path));
                        for (child, child_path) in children.into_iter().zip(child_paths).rev() {
                            tasks.push(Task::Visit(child, child_path));
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
mod pointer_path_tests {
    use super::*;

    fn unsafe_number_error(wire: &str) -> EngineError {
        let mut context = Context::ordinary();
        decode(wire, &mut context).unwrap_err()
    }

    #[test]
    fn unsafe_number_in_nested_tuple_value_keeps_object_member_path() {
        let wire = r#"{"kind":"array","items":[{"kind":"object","members":[{"key":[105,110,116,101,103,101,114,84,111,107,101,110],"value":{"kind":"number","bits":"4340000000000000"}}]}]}"#;
        let error = unsafe_number_error(wire);
        assert_eq!(error.code, "NUMBER");
        assert_eq!(error.path, Utf16::from("/0/integerToken"));
    }

    #[test]
    fn object_and_array_path_segments_use_json_pointer_escaping() {
        let wire = r#"{"kind":"object","members":[{"key":[97,47,126],"value":{"kind":"array","items":[{"kind":"null"},{"kind":"object","members":[{"key":[120],"value":{"kind":"number","bits":"4340000000000000"}}]}]}}]}"#;
        let error = unsafe_number_error(wire);
        assert_eq!(error.path, Utf16::from("/a~1~0/1/x"));
    }

    #[test]
    fn object_path_segments_preserve_lone_surrogate_units() {
        let wire = r#"{"kind":"object","members":[{"key":[55296],"value":{"kind":"number","bits":"4340000000000000"}}]}"#;
        let error = unsafe_number_error(wire);
        assert_eq!(error.path, Utf16::new(vec![b'/' as u16, 0xd800]));
    }
}

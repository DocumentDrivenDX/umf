//! Schema-driven bridge between libpg_query's JSON node representation and
//! the protobuf wire message accepted by `pg_query_deparse_protobuf`.
//!
//! The descriptor table is generated from the pinned `pg_query.proto`. This
//! deliberately does not deserialize the AST into `pg_query` Rust serde types:
//! the C JSON serializer's oneof keys (`SelectStmt`) differ from standard
//! protobuf JSON field names (`selectStmt`).

use crate::{Context, EngineError, Utf16};
use serde_json::{Map, Number, Value};
use std::collections::BTreeMap;
use std::sync::OnceLock;

const DESCRIPTOR_JSON: &str = include_str!("pg_query_proto_descriptor.json");

#[derive(Debug)]
pub struct CodecError(pub String);

#[derive(Debug)]
pub enum BoundedCodecError {
    Codec(CodecError),
    Engine(EngineError),
}

#[derive(Clone, Debug)]
struct Field {
    name: String,
    ty: String,
    number: u32,
    repeated: bool,
    oneof: Option<String>,
}

#[derive(Debug)]
struct Descriptor {
    messages: BTreeMap<String, Vec<Field>>,
    enums: BTreeMap<String, BTreeMap<String, i32>>,
}

fn descriptor() -> &'static Descriptor {
    static DESCRIPTOR: OnceLock<Descriptor> = OnceLock::new();
    DESCRIPTOR.get_or_init(|| {
        let root: Value = serde_json::from_str(DESCRIPTOR_JSON)
            .expect("generated PostgreSQL protobuf descriptor JSON is valid");
        let mut messages = BTreeMap::new();
        for (name, fields) in root["messages"].as_object().expect("messages map") {
            let fields = fields
                .as_array()
                .expect("message field array")
                .iter()
                .map(|field| Field {
                    name: field["name"].as_str().expect("field name").to_owned(),
                    ty: field["type"].as_str().expect("field type").to_owned(),
                    number: field["number"].as_u64().expect("field number") as u32,
                    repeated: field["repeated"].as_bool().expect("repeated flag"),
                    oneof: field["oneof"].as_str().map(str::to_owned),
                })
                .collect();
            messages.insert(name.clone(), fields);
        }
        let mut enums = BTreeMap::new();
        for (name, values) in root["enums"].as_object().expect("enums map") {
            let values = values
                .as_object()
                .expect("enum value map")
                .iter()
                .map(|(name, value)| (name.clone(), value.as_i64().expect("enum number") as i32))
                .collect();
            enums.insert(name.clone(), values);
        }
        Descriptor { messages, enums }
    })
}

/// Encode a C/libpg_query JSON ParseResult into protobuf bytes.
fn ast_to_protobuf(ast: &Value) -> Result<Vec<u8>, CodecError> {
    let mut nodes = 0;
    encode_message("ParseResult", ast, 0, &mut nodes)
}

/// Bounded entry point for production callers. The raw helper remains useful
/// for small unit vectors, while this one meters the admitted tree and a
/// conservative protobuf size bound against the operation's shared Context.
pub fn ast_to_protobuf_bounded(
    ast: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, BoundedCodecError> {
    let mut nodes = 0;
    let json_size = admitted_json_size(ast, 0, &mut nodes, ctx)?;
    if json_size > MAX_PROTO_AST_BYTES {
        return Err(BoundedCodecError::Codec(CodecError(
            "PostgreSQL AST exceeds the protobuf transport limit".into(),
        )));
    }
    ctx.charge_text(json_size, Utf16::default())
        .map_err(BoundedCodecError::Engine)?;
    ctx.charge_work(json_size, Utf16::default())
        .map_err(BoundedCodecError::Engine)?;
    let output_bound = json_size
        .checked_mul(16)
        .and_then(|size| size.checked_add(16))
        .ok_or_else(|| {
            BoundedCodecError::Codec(CodecError(
                "PostgreSQL protobuf size estimate overflow".into(),
            ))
        })?;
    if output_bound > MAX_PROTO_AST_BYTES {
        return Err(BoundedCodecError::Codec(CodecError(
            "encoded PostgreSQL protobuf exceeds the transport limit".into(),
        )));
    }
    // Charge a conservative upper bound before recursive Vec allocations.
    // All protobuf tags, scalar varints, nested-message lengths and string
    // lengths are bounded by this factor relative to the JSON AST spelling.
    ctx.charge_work(output_bound, Utf16::default())
        .map_err(BoundedCodecError::Engine)?;
    let bytes = ast_to_protobuf(ast).map_err(BoundedCodecError::Codec)?;
    if bytes.len() > MAX_PROTO_AST_BYTES {
        return Err(BoundedCodecError::Codec(CodecError(
            "encoded PostgreSQL protobuf exceeds the transport limit".into(),
        )));
    }
    Ok(bytes)
}

const MAX_PROTO_AST_BYTES: usize = 32 * 1024 * 1024;

fn quoted_string_size(text: &str) -> usize {
    text.chars()
        .map(|ch| match ch {
            '"' | '\\' | '\n' | '\r' | '\t' => 2,
            ch if ch <= '\u{1f}' => 6,
            ch => ch.len_utf8(),
        })
        .sum::<usize>()
        .saturating_add(2)
}

/// Decode C/libpg_query protobuf bytes back to the same JSON shape emitted by
/// `pg_query_parse`, including PascalCase Node oneof discriminants.
fn protobuf_to_ast(bytes: &[u8]) -> Result<Value, CodecError> {
    let mut nodes = 0;
    decode_message("ParseResult", bytes, 0, &mut nodes)
}

pub fn protobuf_to_ast_bounded(
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<Value, BoundedCodecError> {
    if bytes.len() > MAX_PROTO_AST_BYTES {
        return Err(BoundedCodecError::Codec(CodecError(
            "PostgreSQL protobuf exceeds the transport limit".into(),
        )));
    }
    ctx.charge_work(bytes.len(), Utf16::default())
        .map_err(BoundedCodecError::Engine)?;
    let output_bound = bytes
        .len()
        .checked_mul(16)
        .and_then(|size| size.checked_add(16))
        .ok_or_else(|| {
            BoundedCodecError::Codec(CodecError("PostgreSQL AST size estimate overflow".into()))
        })?;
    if output_bound > MAX_PROTO_AST_BYTES {
        return Err(BoundedCodecError::Codec(CodecError(
            "decoded PostgreSQL AST exceeds the transport limit".into(),
        )));
    }
    ctx.charge_work(output_bound, Utf16::default())
        .map_err(BoundedCodecError::Engine)?;
    let mut nodes = 0;
    decode_message("ParseResult", bytes, 0, &mut nodes).map_err(BoundedCodecError::Codec)
}

fn admitted_json_size(
    value: &Value,
    depth: usize,
    nodes: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<usize, BoundedCodecError> {
    if depth > MAX_AST_DEPTH {
        return Err(BoundedCodecError::Codec(CodecError(
            "PostgreSQL AST nesting exceeds the limit".into(),
        )));
    }
    *nodes = nodes.saturating_add(1);
    if *nodes > MAX_AST_NODES {
        return Err(BoundedCodecError::Codec(CodecError(
            "PostgreSQL AST node count exceeds the limit".into(),
        )));
    }
    ctx.charge_work(1, Utf16::default())
        .map_err(BoundedCodecError::Engine)?;
    let size = match value {
        Value::Null => 4,
        Value::Bool(true) => 4,
        Value::Bool(false) => 5,
        Value::Number(_) => 32,
        Value::String(text) => quoted_string_size(text),
        Value::Array(items) => {
            let mut size = 2usize;
            for item in items {
                size = size.saturating_add(1).saturating_add(admitted_json_size(
                    item,
                    depth + 1,
                    nodes,
                    ctx,
                )?);
            }
            size
        }
        Value::Object(fields) => {
            let mut size = 2usize;
            for (key, item) in fields {
                size = size
                    .saturating_add(1)
                    .saturating_add(quoted_string_size(key))
                    .saturating_add(1)
                    .saturating_add(admitted_json_size(item, depth + 1, nodes, ctx)?);
            }
            size
        }
    };
    if size > MAX_PROTO_AST_BYTES {
        return Err(BoundedCodecError::Codec(CodecError(
            "PostgreSQL AST exceeds the protobuf transport limit".into(),
        )));
    }
    Ok(size)
}

const MAX_AST_DEPTH: usize = 128;
const MAX_AST_NODES: usize = 1_000_000;

fn encode_message(
    message_name: &str,
    value: &Value,
    depth: usize,
    nodes: &mut usize,
) -> Result<Vec<u8>, CodecError> {
    if depth > MAX_AST_DEPTH {
        return Err(CodecError(
            "PostgreSQL AST nesting exceeds the limit".into(),
        ));
    }
    *nodes = nodes.saturating_add(1);
    if *nodes > MAX_AST_NODES {
        return Err(CodecError(
            "PostgreSQL AST node count exceeds the limit".into(),
        ));
    }
    let fields = descriptor()
        .messages
        .get(message_name)
        .ok_or_else(|| CodecError(format!("unknown protobuf message {message_name}")))?;
    let object = value
        .as_object()
        .ok_or_else(|| CodecError(format!("expected object for {message_name}")))?;
    let mut output = Vec::new();
    let mut known = BTreeMap::new();
    let mut oneofs = BTreeMap::new();
    for field in fields {
        known.insert(field.name.as_str(), field);
        if let Some(value) = object.get(&field.name).filter(|value| !value.is_null()) {
            if let Some(group) = &field.oneof {
                if oneofs.insert(group, &field.name).is_some() {
                    return Err(CodecError(format!(
                        "multiple members of oneof {message_name}.{group}"
                    )));
                }
            }
            if field.repeated {
                let values = value.as_array().ok_or_else(|| {
                    CodecError(format!("expected array for {message_name}.{}", field.name))
                })?;
                if is_packable(&field.ty)? {
                    if !values.is_empty() {
                        let mut packed = Vec::new();
                        for value in values {
                            encode_packed_scalar(&mut packed, field, value)?;
                        }
                        put_varint(&mut output, ((field.number as u64) << 3) | 2);
                        put_varint(&mut output, packed.len() as u64);
                        output.extend_from_slice(&packed);
                    }
                } else {
                    for value in values {
                        encode_field(&mut output, field, value, depth, nodes)?;
                    }
                }
            } else {
                encode_field(&mut output, field, value, depth, nodes)?;
            }
        }
    }
    if let Some(unknown) = object.keys().find(|key| !known.contains_key(key.as_str())) {
        return Err(CodecError(format!(
            "unknown field {message_name}.{unknown}"
        )));
    }
    Ok(output)
}

fn is_packable(ty: &str) -> Result<bool, CodecError> {
    Ok(wire_type(ty)? != 2)
}

fn encode_packed_scalar(
    output: &mut Vec<u8>,
    field: &Field,
    value: &Value,
) -> Result<(), CodecError> {
    match wire_type(&field.ty)? {
        0 => put_varint(output, scalar_varint(&field.ty, value)?),
        1 => output.extend_from_slice(&scalar_fixed64(&field.ty, value)?.to_le_bytes()),
        5 => output.extend_from_slice(&scalar_fixed32(&field.ty, value)?.to_le_bytes()),
        _ => return Err(CodecError(format!("{} is not packable", field.ty))),
    }
    Ok(())
}

fn encode_field(
    output: &mut Vec<u8>,
    field: &Field,
    value: &Value,
    depth: usize,
    nodes: &mut usize,
) -> Result<(), CodecError> {
    let wire = wire_type(&field.ty)?;
    put_varint(output, ((field.number as u64) << 3) | wire as u64);
    match wire {
        0 => put_varint(output, scalar_varint(&field.ty, value)?),
        1 => output.extend_from_slice(&scalar_fixed64(&field.ty, value)?.to_le_bytes()),
        2 => {
            let data = if descriptor().messages.contains_key(&field.ty) {
                encode_message(&field.ty, value, depth + 1, nodes)?
            } else if field.ty == "string" {
                value
                    .as_str()
                    .ok_or_else(|| CodecError(format!("expected string for {}", field.name)))?
                    .as_bytes()
                    .to_vec()
            } else if field.ty == "bytes" {
                return Err(CodecError("bytes protobuf fields are unsupported".into()));
            } else {
                return Err(CodecError(format!("unsupported length field {}", field.ty)));
            };
            put_varint(output, data.len() as u64);
            output.extend_from_slice(&data);
        }
        5 => output.extend_from_slice(&scalar_fixed32(&field.ty, value)?.to_le_bytes()),
        _ => return Err(CodecError("invalid protobuf wire type".into())),
    }
    Ok(())
}

fn decode_message(
    message_name: &str,
    bytes: &[u8],
    depth: usize,
    nodes: &mut usize,
) -> Result<Value, CodecError> {
    if depth > MAX_AST_DEPTH {
        return Err(CodecError(
            "PostgreSQL protobuf nesting exceeds the limit".into(),
        ));
    }
    *nodes = nodes.saturating_add(1);
    if *nodes > MAX_AST_NODES {
        return Err(CodecError(
            "PostgreSQL protobuf node count exceeds the limit".into(),
        ));
    }
    let fields = descriptor()
        .messages
        .get(message_name)
        .ok_or_else(|| CodecError(format!("unknown protobuf message {message_name}")))?;
    let by_number = fields
        .iter()
        .map(|field| (field.number, field))
        .collect::<BTreeMap<_, _>>();
    let mut object = Map::new();
    let mut oneofs = BTreeMap::<&str, &str>::new();
    let mut pos = 0;
    while pos < bytes.len() {
        let tag = take_varint(bytes, &mut pos)?;
        let number = (tag >> 3) as u32;
        let wire = (tag & 7) as u8;
        let field = by_number
            .get(&number)
            .copied()
            .ok_or_else(|| CodecError(format!("unknown protobuf tag {message_name}.{number}")))?;
        let scalar_wire = wire_type(&field.ty)?;
        let packed_repeated = field.repeated && is_packable(&field.ty)? && wire == 2;
        if wire != scalar_wire && !packed_repeated {
            return Err(CodecError(format!(
                "wrong wire type for {message_name}.{}",
                field.name
            )));
        }
        if let Some(group) = field.oneof.as_deref() {
            if let Some(previous) = oneofs.insert(group, &field.name) {
                if previous != field.name {
                    return Err(CodecError(format!(
                        "multiple encoded members of oneof {message_name}.{group}"
                    )));
                }
            }
        }
        if packed_repeated {
            let len = usize::try_from(take_varint(bytes, &mut pos)?)
                .map_err(|_| CodecError("packed field length overflow".into()))?;
            let end = pos
                .checked_add(len)
                .ok_or_else(|| CodecError("packed field offset overflow".into()))?;
            let packed = bytes
                .get(pos..end)
                .ok_or_else(|| CodecError("truncated packed field".into()))?;
            pos = end;
            let mut packed_pos = 0;
            while packed_pos < packed.len() {
                *nodes = nodes.saturating_add(1);
                if *nodes > MAX_AST_NODES {
                    return Err(CodecError(
                        "PostgreSQL protobuf node count exceeds the limit".into(),
                    ));
                }
                let decoded =
                    decode_field(field, scalar_wire, packed, &mut packed_pos, depth, nodes)?;
                object
                    .entry(field.name.clone())
                    .or_insert_with(|| Value::Array(Vec::new()))
                    .as_array_mut()
                    .expect("repeated field initialized as array")
                    .push(decoded);
            }
        } else {
            let decoded = decode_field(field, wire, bytes, &mut pos, depth, nodes)?;
            if field.repeated {
                object
                    .entry(field.name.clone())
                    .or_insert_with(|| Value::Array(Vec::new()))
                    .as_array_mut()
                    .expect("repeated field initialized as array")
                    .push(decoded);
            } else {
                object.insert(field.name.clone(), decoded);
            }
        }
    }
    Ok(Value::Object(object))
}

fn decode_field(
    field: &Field,
    wire: u8,
    bytes: &[u8],
    pos: &mut usize,
    depth: usize,
    nodes: &mut usize,
) -> Result<Value, CodecError> {
    Ok(match wire {
        0 => decode_varint_value(&field.ty, take_varint(bytes, pos)?)?,
        1 => {
            let raw = take_fixed64(bytes, pos)?;
            if field.ty == "double" {
                Number::from_f64(f64::from_bits(raw))
                    .map(Value::Number)
                    .ok_or_else(|| CodecError("non-finite protobuf double".into()))?
            } else {
                Value::Number(Number::from(raw))
            }
        }
        2 => {
            let len = take_varint(bytes, pos)? as usize;
            let end = pos
                .checked_add(len)
                .ok_or_else(|| CodecError("length overflow".into()))?;
            let data = bytes
                .get(*pos..end)
                .ok_or_else(|| CodecError("truncated length field".into()))?;
            *pos = end;
            if descriptor().messages.contains_key(&field.ty) {
                decode_message(&field.ty, data, depth + 1, nodes)?
            } else if field.ty == "string" {
                Value::String(
                    std::str::from_utf8(data)
                        .map_err(|_| CodecError("invalid UTF-8 protobuf string".into()))?
                        .to_owned(),
                )
            } else {
                return Err(CodecError(format!("unsupported length field {}", field.ty)));
            }
        }
        5 => {
            let raw = take_fixed32(bytes, pos)?;
            if field.ty == "float" {
                Number::from_f64(f32::from_bits(raw) as f64)
                    .map(Value::Number)
                    .ok_or_else(|| CodecError("non-finite protobuf float".into()))?
            } else {
                Value::Number(Number::from(raw))
            }
        }
        _ => return Err(CodecError("invalid protobuf wire type".into())),
    })
}

fn wire_type(ty: &str) -> Result<u8, CodecError> {
    if ty == "double" || ty == "fixed64" || ty == "sfixed64" {
        Ok(1)
    } else if ty == "string" || ty == "bytes" || descriptor().messages.contains_key(ty) {
        Ok(2)
    } else if ty == "float" || ty == "fixed32" || ty == "sfixed32" {
        Ok(5)
    } else if ty == "bool"
        || ty == "int32"
        || ty == "int64"
        || ty == "uint32"
        || ty == "uint64"
        || ty == "sint32"
        || ty == "sint64"
        || descriptor().enums.contains_key(ty)
    {
        Ok(0)
    } else {
        Err(CodecError(format!("unsupported protobuf field type {ty}")))
    }
}

fn scalar_varint(ty: &str, value: &Value) -> Result<u64, CodecError> {
    if let Some(values) = descriptor().enums.get(ty) {
        let name = value
            .as_str()
            .ok_or_else(|| CodecError(format!("expected enum string for {ty}")))?;
        return values
            .get(name)
            .map(|n| *n as i64 as u64)
            .ok_or_else(|| CodecError(format!("unknown {ty} value {name}")));
    }
    match ty {
        "bool" => value.as_bool().map(u64::from),
        "int32" => value
            .as_i64()
            .and_then(|n| i32::try_from(n).ok())
            .map(|n| n as i64 as u64),
        "int64" => value.as_i64().map(|n| n as u64),
        "uint32" => value
            .as_u64()
            .and_then(|n| u32::try_from(n).ok())
            .map(u64::from),
        "uint64" => value.as_u64(),
        "sint32" => value
            .as_i64()
            .and_then(|n| i32::try_from(n).ok())
            .map(|n| (((n as u32) << 1) ^ ((n >> 31) as u32)) as u64),
        "sint64" => value
            .as_i64()
            .map(|n| ((n as u64) << 1) ^ ((n >> 63) as u64)),
        _ => None,
    }
    .ok_or_else(|| CodecError(format!("invalid protobuf scalar for {ty}")))
}

fn scalar_fixed64(ty: &str, value: &Value) -> Result<u64, CodecError> {
    match ty {
        "double" => value.as_f64().map(f64::to_bits),
        "fixed64" => value.as_u64(),
        "sfixed64" => value.as_i64().map(|n| n as u64),
        _ => None,
    }
    .ok_or_else(|| CodecError(format!("invalid fixed64 value for {ty}")))
}

fn scalar_fixed32(ty: &str, value: &Value) -> Result<u32, CodecError> {
    match ty {
        "float" => value
            .as_f64()
            .filter(|v| v.is_finite() && (*v as f32).is_finite())
            .map(|v| (v as f32).to_bits()),
        "fixed32" => value.as_u64().and_then(|v| u32::try_from(v).ok()),
        "sfixed32" => value
            .as_i64()
            .and_then(|v| i32::try_from(v).ok())
            .map(|v| v as u32),
        _ => None,
    }
    .ok_or_else(|| CodecError(format!("invalid fixed32 value for {ty}")))
}

fn decode_varint_value(ty: &str, raw: u64) -> Result<Value, CodecError> {
    if let Some(values) = descriptor().enums.get(ty) {
        return values
            .iter()
            .find(|(_, value)| **value as i64 as u64 == raw)
            .map(|(name, _)| Value::String(name.clone()))
            .ok_or_else(|| CodecError(format!("unknown numeric {ty} value {raw}")));
    }
    match ty {
        "bool" => Ok(Value::Bool(raw != 0)),
        "int32" => Ok(Value::Number(Number::from(raw as i32))),
        "int64" => Ok(Value::Number(Number::from(raw as i64))),
        "uint32" => Ok(Value::Number(Number::from(raw as u32))),
        "uint64" => Ok(Value::Number(Number::from(raw))),
        "sint32" => Ok(Value::Number(Number::from(
            ((raw >> 1) as i32) ^ (-((raw & 1) as i32)),
        ))),
        "sint64" => Ok(Value::Number(Number::from(
            ((raw >> 1) as i64) ^ (-((raw & 1) as i64)),
        ))),
        _ => Err(CodecError(format!("invalid varint type {ty}"))),
    }
}

fn put_varint(output: &mut Vec<u8>, mut value: u64) {
    while value >= 0x80 {
        output.push((value as u8) | 0x80);
        value >>= 7;
    }
    output.push(value as u8);
}

fn take_varint(bytes: &[u8], pos: &mut usize) -> Result<u64, CodecError> {
    let mut out = 0u64;
    for shift in (0..70).step_by(7) {
        let byte = *bytes
            .get(*pos)
            .ok_or_else(|| CodecError("truncated varint".into()))?;
        *pos += 1;
        if shift == 63 && byte > 1 {
            return Err(CodecError("varint overflow".into()));
        }
        out |= ((byte & 0x7f) as u64) << shift;
        if byte & 0x80 == 0 {
            return Ok(out);
        }
    }
    Err(CodecError("varint overflow".into()))
}

fn take_fixed32(bytes: &[u8], pos: &mut usize) -> Result<u32, CodecError> {
    let end = pos
        .checked_add(4)
        .ok_or_else(|| CodecError("offset overflow".into()))?;
    let value = u32::from_le_bytes(
        bytes
            .get(*pos..end)
            .ok_or_else(|| CodecError("truncated fixed32".into()))?
            .try_into()
            .unwrap(),
    );
    *pos = end;
    Ok(value)
}

fn take_fixed64(bytes: &[u8], pos: &mut usize) -> Result<u64, CodecError> {
    let end = pos
        .checked_add(8)
        .ok_or_else(|| CodecError("offset overflow".into()))?;
    let value = u64::from_le_bytes(
        bytes
            .get(*pos..end)
            .ok_or_else(|| CodecError("truncated fixed64".into()))?
            .try_into()
            .unwrap(),
    );
    *pos = end;
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::{ast_to_protobuf, protobuf_to_ast};
    use serde_json::Value;

    const SELECT_ONE_JS_PROTOBUF_HEX: &str =
        "0894b00a12230a21c2081e1a17ea04140a0576616c75651a09e210060a020801580720077001880101";

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    fn decode_hex(source: &str) -> Vec<u8> {
        source
            .as_bytes()
            .chunks_exact(2)
            .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
            .collect()
    }

    #[test]
    fn matches_pinned_js_protobuf_for_select_one_and_roundtrips() {
        let ast: Value = serde_json::from_str(include_str!(
            "../../../fixtures/postgresql/select-one-ast.json"
        ))
        .unwrap();
        let bytes = ast_to_protobuf(&ast).unwrap();
        assert_eq!(hex(&bytes), SELECT_ONE_JS_PROTOBUF_HEX);
        assert_eq!(protobuf_to_ast(&bytes).unwrap(), ast);
    }

    #[test]
    fn edited_select_two_matches_pinned_js_protobuf_for_same_shape() {
        let mut ast: Value = serde_json::from_str(include_str!(
            "../../../fixtures/postgresql/select-one-ast.json"
        ))
        .unwrap();
        ast["stmts"][0]["stmt"]["SelectStmt"]["targetList"][0]["ResTarget"]["val"]["A_Const"]
            ["ival"]["ival"] = Value::from(2);
        let bytes = ast_to_protobuf(&ast).unwrap();
        assert_eq!(
            hex(&bytes),
            "0894b00a12230a21c2081e1a17ea04140a0576616c75651a09e210060a020802580720077001880101"
        );
        assert_eq!(protobuf_to_ast(&bytes).unwrap(), ast);
    }

    #[test]
    fn accepts_proto3_packed_uint64_fields_from_the_pinned_js_codec() {
        let ast = serde_json::json!({
            "version": 170004,
            "stmts": [{"stmt": {"Var": {"varnullingrels": [1, 300]}}}]
        });
        let expected = "0894b00a12090a072a053a0301ac02";
        let encoded = ast_to_protobuf(&ast).unwrap();
        assert_eq!(hex(&encoded), expected);
        assert_eq!(protobuf_to_ast(&encoded).unwrap(), ast);
        assert_eq!(protobuf_to_ast(&decode_hex(expected)).unwrap(), ast);
    }

    #[test]
    fn refuses_out_of_range_int32_without_truncation() {
        let ast = serde_json::json!({"version": 2147483648i64, "stmts": []});
        assert!(ast_to_protobuf(&ast).is_err());
    }
}

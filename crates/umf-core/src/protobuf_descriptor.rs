// SPDX-License-Identifier: MIT OR Apache-2.0
//! Portable wire codec for the pinned `google.protobuf.FileDescriptorSet` graph.
//! The schema table is generated from the vendored protobuf-es descriptor metadata.

use crate::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value, copy_json},
};
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum WireKind {
    Double,
    Float,
    Int64,
    UInt64,
    Int32,
    Fixed64,
    Fixed32,
    Bool,
    String,
    Group,
    Message(&'static str),
    Bytes,
    UInt32,
    Enum(&'static str),
    SFixed32,
    SFixed64,
    SInt32,
    SInt64,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum FieldKind {
    Singular(WireKind),
    Repeated(WireKind),
}
#[derive(Clone, Copy, Debug)]
struct FieldSpec {
    name: &'static str,
    number: u32,
    kind: FieldKind,
    presence: u8,
    default_value: Option<&'static str>,
    packed: bool,
    oneof: Option<usize>,
}
#[derive(Clone, Copy, Debug)]
struct MessageSpec {
    name: &'static str,
    fields: &'static [FieldSpec],
}
#[derive(Clone, Copy, Debug)]
struct EnumSpec {
    name: &'static str,
    open: bool,
    values: &'static [i32],
}
mod schema {
    use super::{EnumSpec, FieldKind, FieldSpec, MessageSpec, WireKind};
    include!("protobuf_descriptor_schema.rs");
}
const MAX_BINARY_BYTES: usize = 4_000_000;
const MAX_DESCRIPTOR_TREE_TEXT: usize = 12_000_000; // up to 8M unknown hex plus bounded non-hex text
const MAX_DECODE_DEPTH: usize = 100;
const ROOT: &str = "google.protobuf.FileDescriptorSet";
const WORK_CHUNK: usize = 64 * 1024;
pub const PROFILE_VERSION: &str = "umf-protobuf-descriptor/0.1.0";

fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn schema_error(message: &str) -> EngineError {
    err("PROTOBUF_DESCRIPTOR", message)
}
fn binary_error(message: &str) -> EngineError {
    err("PROTOBUF_BINARY", message)
}
fn spec(name: &str) -> Option<&'static MessageSpec> {
    schema::MESSAGES.iter().find(|item| item.name == name)
}
fn enum_spec(name: &str) -> Option<&'static EnumSpec> {
    schema::ENUMS.iter().find(|item| item.name == name)
}
fn known_enum(name: &str, value: i32) -> bool {
    enum_spec(name).is_some_and(|item| item.open || item.values.contains(&value))
}

/// Decode a descriptor set while retaining the exact unknown wire value bytes.
pub fn read_descriptor_set(bytes: &[u8], context: &mut Context<'_>) -> Result<Value, EngineError> {
    if bytes.len() > MAX_BINARY_BYTES {
        return Err(err("LIMIT", "Descriptor input exceeds limit"));
    }
    charge_descriptor_work(context, bytes.len())?;
    let mut repeated_or_unknown_values = 0usize;
    let (value, used) = decode_message(bytes, ROOT, context, 0, &mut repeated_or_unknown_values)?;
    if used != bytes.len() {
        return Err(binary_error("Trailing descriptor bytes"));
    }
    precharge_tree_copy(&value, context)?;
    copy_json(&value, context)
}

fn decode_message(
    bytes: &[u8],
    name: &str,
    context: &mut Context<'_>,
    depth: usize,
    repeated_or_unknown_values: &mut usize,
) -> Result<(Value, usize), EngineError> {
    if depth > MAX_DECODE_DEPTH {
        return Err(err("LIMIT", "Descriptor recursion limit exceeded"));
    }
    let desc = spec(name).ok_or_else(|| binary_error("Unknown descriptor message type"))?;
    let mut values: Vec<Option<Value>> = vec![None; desc.fields.len()];
    let mut oneof_members = HashMap::<usize, usize>::new();
    let mut unknown = Vec::<Value>::new();
    let mut at = 0usize;
    while at < bytes.len() {
        context.charge_work(1, Utf16::default())?;
        let tag_start = at;
        let (tag, tag_len) = read_varint(bytes, at)?;
        at += tag_len;
        let raw_number = tag >> 3;
        let number =
            u32::try_from(raw_number).map_err(|_| binary_error("Invalid Protobuf field number"))?;
        let wire = (tag & 7) as u8;
        if number == 0 || number > 536_870_911 {
            return Err(binary_error("Invalid Protobuf field number"));
        }
        if wire == 4 {
            return Err(binary_error("Unexpected end-group tag"));
        }
        let field_index = desc.fields.iter().position(|field| field.number == number);
        let Some(index) = field_index else {
            let raw_start = at;
            at = skip_value(bytes, at, number, wire, context, depth)?;
            let raw = &bytes[raw_start..at];
            charge_decoded_value(context, repeated_or_unknown_values)?;
            unknown.push(unknown_value(number, wire, raw, context)?);
            continue;
        };
        let field = desc.fields[index];
        if matches!(field.kind, FieldKind::Repeated(_)) && wire == 2 && packed_scalar(field) {
            let (payload_start, payload_end, next) = length_payload(bytes, at)?;
            let packed_bytes = &bytes[payload_start..payload_end];
            let mut packed_at = 0usize;
            let mut packed_values = Vec::new();
            while packed_at < packed_bytes.len() {
                let before = packed_at;
                let (item, invalid_enum) = decode_scalar(
                    packed_bytes,
                    &mut packed_at,
                    field_wire(field),
                    context,
                    depth,
                    repeated_or_unknown_values,
                )?;
                if let Some(raw) = invalid_enum {
                    charge_decoded_value(context, repeated_or_unknown_values)?;
                    unknown.push(unknown_value(field.number, 0, &raw, context)?);
                    continue;
                }
                if packed_at <= before {
                    return Err(binary_error("Invalid packed field"));
                }
                charge_decoded_value(context, repeated_or_unknown_values)?;
                packed_values.push(item);
            }
            for item in packed_values {
                push_repeated(&mut values[index], item)?;
            }
            at = next;
            continue;
        }
        let expected = wire_type(field_wire(field));
        if wire != expected {
            let raw_start = at;
            at = skip_value(bytes, at, number, wire, context, depth)?;
            charge_decoded_value(context, repeated_or_unknown_values)?;
            unknown.push(unknown_value(number, wire, &bytes[raw_start..at], context)?);
            continue;
        }
        let value_start = at;
        let (item, invalid_enum) = decode_scalar(
            bytes,
            &mut at,
            field_wire(field),
            context,
            depth,
            repeated_or_unknown_values,
        )?;
        if let Some(_raw) = invalid_enum {
            charge_decoded_value(context, repeated_or_unknown_values)?;
            unknown.push(unknown_value(
                field.number,
                wire,
                &bytes[value_start..at],
                context,
            )?);
            continue;
        }
        if implicit_zero(field, &item) {
            continue;
        }
        if let Some(oneof) = field.oneof {
            if let Some(previous) = oneof_members.insert(oneof, index) {
                values[previous] = None;
            }
        }
        if let FieldKind::Repeated(_) = field.kind {
            charge_decoded_value(context, repeated_or_unknown_values)?;
            push_repeated(&mut values[index], item)?;
        } else if let (Some(Value::Object(existing)), Value::Object(incoming)) =
            (&mut values[index], item.clone())
        {
            merge_object(existing, incoming);
        } else {
            values[index] = Some(item);
        }
        let _ = tag_start;
    }
    let mut fields = Vec::new();
    for (field, value) in desc.fields.iter().zip(values) {
        if let Some(value) = value {
            fields.push((Utf16::from(field.name), value));
        }
    }
    let value = Value::object(
        vec![
            (Utf16::from("type"), Value::string_utf8(name)),
            (
                Utf16::from("fields"),
                Value::object(fields, Utf16::default())?,
            ),
            (Utf16::from("unknown"), Value::Array(unknown)),
        ],
        Utf16::default(),
    )?;
    Ok((value, at))
}

fn merge_object(target: &mut Vec<(Utf16, Value)>, incoming: Vec<(Utf16, Value)>) {
    for (key, value) in incoming {
        if let Some((_, old)) = target
            .iter_mut()
            .find(|(candidate, _)| candidate.units() == key.units())
        {
            match (old, value) {
                (Value::Object(old_members), Value::Object(new_members)) => {
                    merge_object(old_members, new_members)
                }
                (Value::Array(old_items), Value::Array(new_items)) => old_items.extend(new_items),
                (old, new) => *old = new,
            }
        } else {
            target.push((key, value));
        }
    }
}
fn push_repeated(slot: &mut Option<Value>, value: Value) -> Result<(), EngineError> {
    if slot.is_none() {
        *slot = Some(Value::Array(Vec::new()));
    }
    match slot.as_mut() {
        Some(Value::Array(items)) => {
            items.push(value);
            Ok(())
        }
        _ => Err(binary_error("Invalid repeated field state")),
    }
}
fn field_wire(field: FieldSpec) -> WireKind {
    match field.kind {
        FieldKind::Singular(kind) | FieldKind::Repeated(kind) => kind,
    }
}
fn implicit_zero(field: FieldSpec, value: &Value) -> bool {
    if field.presence != 2 || matches!(field.kind, FieldKind::Repeated(_)) {
        return false;
    }
    match (field_wire(field), value) {
        (WireKind::String, Value::String(s)) => s.is_empty(),
        (WireKind::Bytes, Value::String(s)) => s.is_empty(),
        (WireKind::Bool, Value::Bool(v)) => !v,
        (
            WireKind::Int64
            | WireKind::UInt64
            | WireKind::SInt64
            | WireKind::Fixed64
            | WireKind::SFixed64,
            Value::String(s),
        ) => s.units() == [b'0' as u16],
        (WireKind::Double | WireKind::Float, Value::Number(n)) => {
            *n == 0.0 && !n.is_sign_negative()
        }
        (WireKind::Enum(_), Value::Number(n))
        | (
            WireKind::Int32
            | WireKind::UInt32
            | WireKind::SInt32
            | WireKind::Fixed32
            | WireKind::SFixed32,
            Value::Number(n),
        ) => *n == 0.0,
        _ => false,
    }
}
fn packed_scalar(field: FieldSpec) -> bool {
    matches!(
        field.kind,
        FieldKind::Repeated(
            WireKind::Int32
                | WireKind::UInt32
                | WireKind::SInt32
                | WireKind::Int64
                | WireKind::UInt64
                | WireKind::SInt64
                | WireKind::Fixed32
                | WireKind::SFixed32
                | WireKind::Fixed64
                | WireKind::SFixed64
                | WireKind::Float
                | WireKind::Double
                | WireKind::Bool
                | WireKind::Enum(_)
        )
    )
}
fn wire_type(kind: WireKind) -> u8 {
    match kind {
        WireKind::Double | WireKind::Fixed64 | WireKind::SFixed64 => 1,
        WireKind::String | WireKind::Message(_) | WireKind::Bytes => 2,
        WireKind::Group => 3,
        WireKind::Float | WireKind::Fixed32 | WireKind::SFixed32 => 5,
        _ => 0,
    }
}

fn decode_scalar(
    bytes: &[u8],
    at: &mut usize,
    kind: WireKind,
    context: &mut Context<'_>,
    depth: usize,
    repeated_or_unknown_values: &mut usize,
) -> Result<(Value, Option<Vec<u8>>), EngineError> {
    match kind {
        WireKind::Message(name) => {
            let (start, end, next) = length_payload(bytes, *at)?;
            let value = decode_message(
                &bytes[start..end],
                name,
                context,
                depth + 1,
                repeated_or_unknown_values,
            )?
            .0;
            *at = next;
            Ok((value, None))
        }
        WireKind::String => {
            let (start, end, next) = length_payload(bytes, *at)?;
            *at = next;
            let value = std::str::from_utf8(&bytes[start..end])
                .map_err(|_| binary_error("Invalid UTF-8 in descriptor string"))?;
            context.charge_work(value.len(), Utf16::default())?;
            Ok((Value::string_utf8(value), None))
        }
        WireKind::Bytes => {
            let (start, end, next) = length_payload(bytes, *at)?;
            *at = next;
            context.charge_work(end - start, Utf16::default())?;
            Ok((Value::string_utf8(hex(&bytes[start..end])), None))
        }
        WireKind::Double | WireKind::SFixed64 | WireKind::Fixed64 => {
            let value = read_fixed64(bytes, at)?;
            if kind == WireKind::Double {
                let f = f64::from_bits(value);
                Ok((float_value(f), None))
            } else if kind == WireKind::SFixed64 {
                Ok((Value::string_utf8((value as i64).to_string()), None))
            } else {
                Ok((Value::string_utf8(value.to_string()), None))
            }
        }
        WireKind::Float | WireKind::SFixed32 | WireKind::Fixed32 => {
            let value = read_fixed32(bytes, at)?;
            if kind == WireKind::Float {
                Ok((float_value(f32::from_bits(value) as f64), None))
            } else if kind == WireKind::SFixed32 {
                Ok((Value::Number((value as i32) as f64), None))
            } else {
                Ok((Value::Number(value as f64), None))
            }
        }
        WireKind::Enum(name) => {
            let (value, raw) = read_varint_raw(bytes, at)?;
            let signed = value as u32 as i32;
            if known_enum(name, signed) {
                Ok((Value::Number(signed as f64), None))
            } else {
                Ok((Value::Null, Some(raw)))
            }
        }
        WireKind::Int32 => {
            let (v, _) = read_varint_raw(bytes, at)?;
            Ok((Value::Number(v as u32 as i32 as f64), None))
        }
        WireKind::UInt32 => {
            let (v, _) = read_varint_raw(bytes, at)?;
            if v > u32::MAX as u64 {
                return Err(binary_error("uint32 field overflow"));
            }
            Ok((Value::Number(v as f64), None))
        }
        WireKind::Int64 => {
            let (v, _) = read_varint_raw(bytes, at)?;
            Ok((Value::string_utf8((v as i64).to_string()), None))
        }
        WireKind::UInt64 => {
            let (v, _) = read_varint_raw(bytes, at)?;
            Ok((Value::string_utf8(v.to_string()), None))
        }
        WireKind::SInt32 => {
            let (v, _) = read_varint_raw(bytes, at)?;
            let n = ((v >> 1) as i32) ^ (-((v & 1) as i32));
            Ok((Value::Number(n as f64), None))
        }
        WireKind::SInt64 => {
            let (v, _) = read_varint_raw(bytes, at)?;
            let n = ((v >> 1) as i64) ^ (-((v & 1) as i64));
            Ok((Value::string_utf8(n.to_string()), None))
        }
        WireKind::Bool => {
            let (v, _) = read_varint_raw(bytes, at)?;
            Ok((Value::Bool(v != 0), None))
        }
        WireKind::Group => Err(binary_error(
            "Groups are not descriptor fields in this profile",
        )),
    }
}
fn charge_decoded_value(context: &mut Context<'_>, count: &mut usize) -> Result<(), EngineError> {
    *count = count
        .checked_add(1)
        .ok_or_else(|| err("LIMIT", "Descriptor repeated value count overflow"))?;
    context.check_tree_value_count(*count, Utf16::default())?;
    context.charge_work(1, Utf16::default())
}

fn float_value(value: f64) -> Value {
    if value.is_nan() {
        Value::string_utf8("NaN")
    } else if value == f64::INFINITY {
        Value::string_utf8("Infinity")
    } else if value == f64::NEG_INFINITY {
        Value::string_utf8("-Infinity")
    } else if value == 0.0 && value.is_sign_negative() {
        Value::string_utf8("-0")
    } else {
        Value::Number(value)
    }
}

fn read_varint(bytes: &[u8], at: usize) -> Result<(u64, usize), EngineError> {
    let mut cursor = at;
    let (value, raw) = read_varint_raw(bytes, &mut cursor)?;
    Ok((value, raw.len()))
}
fn read_varint_raw(bytes: &[u8], at: &mut usize) -> Result<(u64, Vec<u8>), EngineError> {
    let start = *at;
    let mut value = 0u64;
    for i in 0..10 {
        let byte = *bytes
            .get(*at)
            .ok_or_else(|| binary_error("Truncated varint"))?;
        *at += 1;
        if i == 9 && (byte & 0xfe) != 0 {
            return Err(binary_error("Malformed varint"));
        }
        value |= ((byte & 0x7f) as u64) << (i * 7);
        if byte & 0x80 == 0 {
            return Ok((value, bytes[start..*at].to_vec()));
        }
    }
    Err(binary_error("Malformed varint"))
}
fn read_fixed32(bytes: &[u8], at: &mut usize) -> Result<u32, EngineError> {
    let end = at
        .checked_add(4)
        .ok_or_else(|| binary_error("Length overflow"))?;
    let chunk = bytes
        .get(*at..end)
        .ok_or_else(|| binary_error("Truncated fixed32"))?;
    *at = end;
    Ok(u32::from_le_bytes(chunk.try_into().unwrap()))
}
fn read_fixed64(bytes: &[u8], at: &mut usize) -> Result<u64, EngineError> {
    let end = at
        .checked_add(8)
        .ok_or_else(|| binary_error("Length overflow"))?;
    let chunk = bytes
        .get(*at..end)
        .ok_or_else(|| binary_error("Truncated fixed64"))?;
    *at = end;
    Ok(u64::from_le_bytes(chunk.try_into().unwrap()))
}
fn length_payload(bytes: &[u8], at: usize) -> Result<(usize, usize, usize), EngineError> {
    let (size, used) = read_varint(bytes, at)?;
    let start = at
        .checked_add(used)
        .ok_or_else(|| binary_error("Length overflow"))?;
    let end = start
        .checked_add(usize::try_from(size).map_err(|_| binary_error("Length overflow"))?)
        .ok_or_else(|| binary_error("Length overflow"))?;
    if end > bytes.len() {
        return Err(binary_error("Truncated length-delimited field"));
    }
    Ok((start, end, end))
}

fn skip_value(
    bytes: &[u8],
    mut at: usize,
    number: u32,
    wire: u8,
    context: &mut Context<'_>,
    depth: usize,
) -> Result<usize, EngineError> {
    match wire {
        0 => {
            let _ = read_varint_raw(bytes, &mut at)?;
            Ok(at)
        }
        1 => at
            .checked_add(8)
            .filter(|end| *end <= bytes.len())
            .ok_or_else(|| binary_error("Truncated fixed64")),
        2 => {
            let (_, _, end) = length_payload(bytes, at)?;
            Ok(end)
        }
        3 => {
            if depth >= MAX_DECODE_DEPTH {
                return Err(err("LIMIT", "Descriptor group recursion limit exceeded"));
            }
            loop {
                context.charge_work(1, Utf16::default())?;
                let (tag, used) = read_varint(bytes, at)?;
                at += used;
                let raw_number = tag >> 3;
                let inner_number = u32::try_from(raw_number)
                    .map_err(|_| binary_error("Invalid group field number"))?;
                let inner_wire = (tag & 7) as u8;
                if inner_number == 0 || inner_number > 536_870_911 {
                    return Err(binary_error("Invalid group tag"));
                }
                if inner_wire == 4 {
                    if inner_number != number {
                        return Err(binary_error("Mismatched group end tag"));
                    }
                    return Ok(at);
                }
                at = skip_value(bytes, at, inner_number, inner_wire, context, depth + 1)?;
            }
        }
        5 => at
            .checked_add(4)
            .filter(|end| *end <= bytes.len())
            .ok_or_else(|| binary_error("Truncated fixed32")),
        _ => Err(binary_error("Invalid wire type")),
    }
}

fn hex(bytes: &[u8]) -> String {
    const H: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len().saturating_mul(2));
    for b in bytes {
        out.push(H[(b >> 4) as usize] as char);
        out.push(H[(b & 15) as usize] as char);
    }
    out
}

/// Encode a validated descriptor tree. Raw unknown field value bytes are kept
/// byte-for-byte, including length prefixes and group end tags.
pub fn write_descriptor_set(
    node: &Value,
    context: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    precharge_tree_copy(node, context)?;
    let admitted = copy_json(node, context)?;
    validate_message(&admitted, ROOT, context, 0)?;
    let bytes = encode_message(&admitted, ROOT, context, 0)?;
    if bytes.len() > MAX_BINARY_BYTES {
        return Err(err("LIMIT", "Descriptor output exceeds limit"));
    }
    // Re-decode validates all raw unknown wire values before returning bytes.
    let _ = read_descriptor_set(&bytes, context)?;
    Ok(bytes)
}

fn encode_message(
    node: &Value,
    name: &str,
    context: &mut Context<'_>,
    depth: usize,
) -> Result<Vec<u8>, EngineError> {
    if depth > 128 {
        return Err(err("LIMIT", "Descriptor nesting exceeds limit"));
    }
    let desc = spec(name).ok_or_else(|| schema_error("Unknown descriptor message type"))?;
    let object = as_object(node)?;
    let fields = as_object(
        get(object, "fields").ok_or_else(|| schema_error("Descriptor fields are required"))?,
    )?;
    let mut selected = Vec::<(usize, &Value)>::new();
    let mut oneof_members = HashMap::<usize, usize>::new();
    for (key, value) in fields {
        context.charge_work(1, Utf16::default())?;
        let field_name = key
            .to_utf8()
            .map_err(|_| schema_error("Invalid descriptor field name"))?;
        let index = desc
            .fields
            .iter()
            .position(|field| field.name == field_name)
            .ok_or_else(|| schema_error("Unknown named descriptor field"))?;
        let field = desc.fields[index];
        if let Some(oneof) = field.oneof {
            if let Some(previous) = oneof_members.insert(oneof, index) {
                selected.retain(|(candidate, _)| *candidate != previous);
            }
        }
        selected.push((index, value));
    }
    let unknown = as_array(
        get(object, "unknown")
            .ok_or_else(|| schema_error("Descriptor unknown array is required"))?,
    )?;
    let mut output = Vec::new();
    // Buf compiles writers in ascending field-number order regardless of
    // descriptor declaration order or input object order.
    let mut writer_order: Vec<usize> = (0..desc.fields.len()).collect();
    writer_order.sort_by_key(|index| desc.fields[*index].number);
    for index in writer_order {
        let field = desc.fields[index];
        if let Some((_, value)) = selected.iter().find(|(candidate, _)| *candidate == index) {
            encode_field(
                &mut output,
                field.number,
                field.kind,
                field.packed,
                value,
                context,
                depth,
            )?;
        }
        if output.len() > MAX_BINARY_BYTES {
            return Err(err("LIMIT", "Descriptor output exceeds limit"));
        }
    }
    for item in unknown {
        context.charge_work(1, Utf16::default())?;
        encode_unknown(&mut output, item, context)?;
        if output.len() > MAX_BINARY_BYTES {
            return Err(err("LIMIT", "Descriptor output exceeds limit"));
        }
    }
    if output.len() > MAX_BINARY_BYTES {
        return Err(err("LIMIT", "Descriptor output exceeds limit"));
    }
    Ok(output)
}

fn validate_field_value(
    value: &Value,
    field: FieldSpec,
    context: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    match field.kind {
        FieldKind::Repeated(kind) => {
            let items = as_array(value)?;
            for item in items {
                context.charge_work(1, Utf16::default())?;
                validate_scalar(item, kind, context, depth)?;
            }
            Ok(())
        }
        FieldKind::Singular(kind) => validate_scalar(value, kind, context, depth),
    }
}
fn validate_scalar(
    value: &Value,
    kind: WireKind,
    context: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    match kind {
        WireKind::Message(name) => validate_message(value, name, context, depth + 1),
        WireKind::String => match value {
            Value::String(s) if s.to_utf8().is_ok() => Ok(()),
            _ => Err(schema_error("Expected descriptor string")),
        },
        WireKind::Bytes => validate_hex(value, context),
        WireKind::Double | WireKind::Float => match value {
            Value::Number(_) => Ok(()),
            Value::String(s)
                if matches!(
                    s.to_utf8().as_deref(),
                    Ok("NaN" | "Infinity" | "-Infinity" | "-0")
                ) =>
            {
                Ok(())
            }
            _ => Err(schema_error("Expected descriptor float")),
        },
        WireKind::Enum(name) => {
            let n = as_i32(value)?;
            if !known_enum(name, n) {
                return Err(schema_error("Unknown value for closed descriptor enum"));
            }
            Ok(())
        }
        WireKind::Int32 | WireKind::SInt32 | WireKind::SFixed32 => {
            let _ = as_i32(value)?;
            Ok(())
        }
        WireKind::UInt32 | WireKind::Fixed32 => {
            let _ = as_u32(value)?;
            Ok(())
        }
        WireKind::Int64 | WireKind::SInt64 | WireKind::SFixed64 => {
            let _ = as_i64_string(value)?;
            Ok(())
        }
        WireKind::UInt64 | WireKind::Fixed64 => {
            let _ = as_u64_string(value)?;
            Ok(())
        }
        WireKind::Bool => match value {
            Value::Bool(_) => Ok(()),
            _ => Err(schema_error("Expected descriptor boolean")),
        },
        WireKind::Group => Err(schema_error(
            "Groups are not descriptor fields in this profile",
        )),
    }
}

fn validate_message(
    node: &Value,
    name: &str,
    context: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    if depth > 128 {
        return Err(err("LIMIT", "Descriptor nesting exceeds limit"));
    }
    let desc = spec(name).ok_or_else(|| schema_error("Unknown descriptor message type"))?;
    let object = as_object(node)?;
    reject_extra(object, &["type", "fields", "unknown"])?;
    if get(object, "type") != Some(&Value::string_utf8(name)) {
        return Err(schema_error("Descriptor message type mismatch"));
    }
    let fields = as_object(
        get(object, "fields").ok_or_else(|| schema_error("Descriptor fields are required"))?,
    )?;
    let mut seen = vec![false; desc.fields.len()];
    for (key, value) in fields {
        context.charge_work(1, Utf16::default())?;
        let field_name = key
            .to_utf8()
            .map_err(|_| schema_error("Invalid descriptor field name"))?;
        let index = desc
            .fields
            .iter()
            .position(|field| field.name == field_name)
            .ok_or_else(|| schema_error("Unknown named descriptor field"))?;
        seen[index] = true;
        let field = desc.fields[index];
        let _ = validate_field_value(value, field, context, depth)?;
    }
    if desc
        .fields
        .iter()
        .enumerate()
        .any(|(index, field)| field.presence == 3 && !seen[index])
    {
        return Err(schema_error("Required descriptor field is missing"));
    }
    let unknown = as_array(
        get(object, "unknown")
            .ok_or_else(|| schema_error("Descriptor unknown array is required"))?,
    )?;
    for item in unknown {
        context.charge_work(1, Utf16::default())?;
        let unknown_object = as_object(item)?;
        reject_extra(unknown_object, &["number", "wireType", "data"])?;
        let number = as_u32(
            get(unknown_object, "number")
                .ok_or_else(|| schema_error("Unknown field number is required"))?,
        )?;
        let wire_value = as_u32(
            get(unknown_object, "wireType")
                .ok_or_else(|| schema_error("Unknown wire type is required"))?,
        )?;
        let wire = u8::try_from(wire_value)
            .map_err(|_| err("PROTOBUF_UNKNOWN", "Invalid unknown wire type"))?;
        if number == 0 || number > 536_870_911 || !matches!(wire, 0 | 1 | 2 | 3 | 5) {
            return Err(err("PROTOBUF_UNKNOWN", "Invalid unknown wire field"));
        }
        let raw = parse_hex(
            get(unknown_object, "data")
                .ok_or_else(|| schema_error("Unknown field data is required"))?,
            context,
        )?;
        validate_unknown_payload(&raw, number, wire, context).map_err(remap_unknown_wire_error)?;
    }
    Ok(())
}

fn encode_field(
    out: &mut Vec<u8>,
    number: u32,
    kind: FieldKind,
    packed: bool,
    value: &Value,
    context: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    match kind {
        FieldKind::Repeated(wire) => {
            let values = as_array(value)?;
            if packed
                && packed_scalar(FieldSpec {
                    name: "",
                    number,
                    kind,
                    presence: 2,
                    default_value: None,
                    packed,
                    oneof: None,
                })
                && !values.is_empty()
            {
                let mut payload = Vec::new();
                for item in values {
                    context.charge_work(1, Utf16::default())?;
                    encode_scalar(&mut payload, wire, item, context, depth)?;
                    if payload.len() > MAX_BINARY_BYTES {
                        return Err(err("LIMIT", "Descriptor packed field exceeds output bound"));
                    }
                }
                write_key(out, number, 2);
                write_varint(out, payload.len() as u64);
                out.extend(payload);
            } else {
                for item in values {
                    context.charge_work(1, Utf16::default())?;
                    write_key(out, number, wire_type(wire));
                    encode_scalar(out, wire, item, context, depth)?;
                    if out.len() > MAX_BINARY_BYTES {
                        return Err(err("LIMIT", "Descriptor output exceeds limit"));
                    }
                }
            }
        }
        FieldKind::Singular(wire) => {
            write_key(out, number, wire_type(wire));
            encode_scalar(out, wire, value, context, depth)?;
        }
    }
    Ok(())
}
fn encode_scalar(
    out: &mut Vec<u8>,
    kind: WireKind,
    value: &Value,
    context: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    match kind {
        WireKind::Message(name) => {
            let nested = encode_message(value, name, context, depth + 1)?;
            write_varint(out, nested.len() as u64);
            out.extend(nested);
        }
        WireKind::String => {
            let Value::String(source) = value else {
                return Err(schema_error("Expected descriptor string"));
            };
            if source.len() > MAX_BINARY_BYTES {
                return Err(err(
                    "LIMIT",
                    "Descriptor string exceeds binary output bound",
                ));
            }
            let text = source
                .to_utf8()
                .map_err(|_| schema_error("Invalid descriptor string"))?;
            if text.len() > MAX_BINARY_BYTES {
                return Err(err(
                    "LIMIT",
                    "Descriptor string exceeds binary output bound",
                ));
            }
            write_varint(out, text.len() as u64);
            out.extend(text.as_bytes());
        }
        WireKind::Bytes => {
            let bytes = parse_hex(value, context)?;
            write_varint(out, bytes.len() as u64);
            out.extend(bytes);
        }
        WireKind::Double => {
            let f = as_float(value)?;
            out.extend(f.to_bits().to_le_bytes());
        }
        WireKind::Float => {
            let f = as_float(value)? as f32;
            out.extend(f.to_bits().to_le_bytes());
        }
        WireKind::Fixed64 => out.extend(as_u64_string(value)?.to_le_bytes()),
        WireKind::SFixed64 => out.extend(as_i64_string(value)?.to_le_bytes()),
        WireKind::Fixed32 => out.extend(as_u32(value)?.to_le_bytes()),
        WireKind::SFixed32 => out.extend(as_i32(value)?.to_le_bytes()),
        WireKind::Int32 | WireKind::Enum(_) => write_varint(out, (as_i32(value)? as i64) as u64),
        WireKind::UInt32 => write_varint(out, as_u32(value)? as u64),
        WireKind::Int64 => write_varint(out, as_i64_string(value)? as u64),
        WireKind::UInt64 => write_varint(out, as_u64_string(value)?),
        WireKind::SInt32 => {
            let n = as_i32(value)?;
            write_varint(out, ((n << 1) ^ (n >> 31)) as u32 as u64);
        }
        WireKind::SInt64 => {
            let n = as_i64_string(value)?;
            write_varint(out, ((n << 1) ^ (n >> 63)) as u64);
        }
        WireKind::Bool => match value {
            Value::Bool(b) => write_varint(out, u64::from(*b)),
            _ => return Err(schema_error("Expected descriptor boolean")),
        },
        WireKind::Group => {
            return Err(schema_error(
                "Groups are not descriptor fields in this profile",
            ));
        }
    }
    Ok(())
}
fn encode_unknown(
    out: &mut Vec<u8>,
    value: &Value,
    context: &mut Context<'_>,
) -> Result<(), EngineError> {
    let object = as_object(value)?;
    reject_extra(object, &["number", "wireType", "data"])?;
    let number = as_u32(
        get(object, "number").ok_or_else(|| schema_error("Unknown field number is required"))?,
    )?;
    let wire_value = as_u32(
        get(object, "wireType").ok_or_else(|| schema_error("Unknown wire type is required"))?,
    )?;
    let wire = u8::try_from(wire_value)
        .map_err(|_| err("PROTOBUF_UNKNOWN", "Invalid unknown wire field"))?;
    if number == 0 || number > 536_870_911 || !matches!(wire, 0 | 1 | 2 | 3 | 5) {
        return Err(err("PROTOBUF_UNKNOWN", "Invalid unknown wire field"));
    }
    let raw = parse_hex(
        get(object, "data").ok_or_else(|| schema_error("Unknown field data is required"))?,
        context,
    )?;
    context.charge_work(raw.len(), Utf16::default())?;
    validate_unknown_payload(&raw, number, wire, context).map_err(remap_unknown_wire_error)?;
    write_key(out, number, wire);
    out.extend(raw);
    Ok(())
}
fn unknown_value(
    number: u32,
    wire: u8,
    raw: &[u8],
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    charge_descriptor_work(context, raw.len().saturating_mul(2))?;
    Value::object(
        vec![
            (Utf16::from("number"), Value::Number(number as f64)),
            (Utf16::from("wireType"), Value::Number(wire as f64)),
            (Utf16::from("data"), Value::string_utf8(hex(raw))),
        ],
        Utf16::default(),
    )
}
fn validate_unknown_payload(
    raw: &[u8],
    number: u32,
    wire: u8,
    context: &mut Context<'_>,
) -> Result<(), EngineError> {
    let consumed = match wire {
        0 => read_varint(raw, 0)?.1,
        1 if raw.len() == 8 => 8,
        2 => {
            let (_, _, end) = length_payload(raw, 0)?;
            end
        }
        3 => skip_value(raw, 0, number, 3, context, 0)?,
        5 if raw.len() == 4 => 4,
        _ => return Err(schema_error("Invalid unknown wire payload")),
    };
    if consumed != raw.len() {
        return Err(schema_error("Unknown wire payload has trailing bytes"));
    }
    Ok(())
}
fn remap_unknown_wire_error(error: EngineError) -> EngineError {
    if error.is_control_failure() || error.code == "LIMIT" {
        error
    } else {
        // protobufjs reports an incomplete length-delimited unknown field as
        // a RangeError during writeDescriptorSet's validating round trip.
        // Preserve that externally visible diagnostic while keeping other
        // malformed unknown-wire failures in the descriptor profile.
        if matches!(
            error.message.to_utf8().ok().as_deref(),
            Some("Truncated varint" | "Truncated length-delimited field")
        ) {
            schema_error("RangeError: premature EOF")
        } else {
            schema_error("Malformed unknown wire payload")
        }
    }
}
fn write_key(out: &mut Vec<u8>, number: u32, wire: u8) {
    write_varint(out, ((number as u64) << 3) | wire as u64);
}
fn write_varint(out: &mut Vec<u8>, mut value: u64) {
    while value >= 0x80 {
        out.push((value as u8) | 0x80);
        value >>= 7;
    }
    out.push(value as u8);
}
fn as_object(value: &Value) -> Result<&[(Utf16, Value)], EngineError> {
    if let Value::Object(items) = value {
        Ok(items)
    } else {
        Err(schema_error("Expected descriptor object"))
    }
}
fn as_array(value: &Value) -> Result<&[Value], EngineError> {
    if let Value::Array(items) = value {
        Ok(items)
    } else {
        Err(schema_error("Expected descriptor list"))
    }
}
fn get<'a>(object: &'a [(Utf16, Value)], key: &str) -> Option<&'a Value> {
    object
        .iter()
        .find(|(k, _)| k.to_utf8().is_ok_and(|s| s == key))
        .map(|(_, v)| v)
}
fn reject_extra(object: &[(Utf16, Value)], allowed: &[&str]) -> Result<(), EngineError> {
    if object.iter().any(|(key, _)| {
        key.to_utf8()
            .map_or(true, |s| !allowed.contains(&s.as_str()))
    }) {
        Err(err(
            "PROTOBUF_REPRESENTATION",
            "Unknown representation field cannot be discarded",
        ))
    } else {
        Ok(())
    }
}
fn as_string(value: &Value) -> Result<String, EngineError> {
    match value {
        Value::String(s) => s
            .to_utf8()
            .map_err(|_| schema_error("Invalid descriptor string")),
        _ => Err(schema_error("Expected descriptor string")),
    }
}
fn as_i32(value: &Value) -> Result<i32, EngineError> {
    match value {
        Value::Number(n)
            if n.is_finite()
                && n.fract() == 0.0
                && *n >= i32::MIN as f64
                && *n <= i32::MAX as f64 =>
        {
            Ok(*n as i32)
        }
        _ => Err(schema_error("Expected int32 descriptor value")),
    }
}
fn as_u32(value: &Value) -> Result<u32, EngineError> {
    match value {
        Value::Number(n)
            if n.is_finite() && n.fract() == 0.0 && *n >= 0.0 && *n <= u32::MAX as f64 =>
        {
            Ok(*n as u32)
        }
        _ => Err(schema_error("Expected uint32 descriptor value")),
    }
}
fn as_i64_string(value: &Value) -> Result<i64, EngineError> {
    let s = as_string(value)?;
    if !canonical_integer(&s) {
        return Err(schema_error("Expected canonical decimal int64"));
    }
    s.parse()
        .map_err(|_| schema_error("int64 descriptor value out of range"))
}
fn as_u64_string(value: &Value) -> Result<u64, EngineError> {
    let s = as_string(value)?;
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) || (s.len() > 1 && s.starts_with('0'))
    {
        return Err(schema_error("Expected canonical decimal uint64"));
    }
    s.parse()
        .map_err(|_| schema_error("uint64 descriptor value out of range"))
}
fn canonical_integer(s: &str) -> bool {
    if s == "-0" {
        return false;
    }
    let digits = s.strip_prefix('-').unwrap_or(s);
    !digits.is_empty()
        && digits.bytes().all(|b| b.is_ascii_digit())
        && (digits == "0" || !digits.starts_with('0'))
}
fn as_float(value: &Value) -> Result<f64, EngineError> {
    match value {
        Value::Number(n) => Ok(*n),
        Value::String(s) => match s.to_utf8().as_deref() {
            Ok("NaN") => Ok(f64::NAN),
            Ok("Infinity") => Ok(f64::INFINITY),
            Ok("-Infinity") => Ok(f64::NEG_INFINITY),
            Ok("-0") => Ok(-0.0),
            _ => Err(schema_error("Invalid special floating value")),
        },
        _ => Err(schema_error("Expected descriptor float")),
    }
}
fn validate_hex(value: &Value, context: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::String(text) = value else {
        return Err(err(
            "PROTOBUF_BYTES",
            "Expected lowercase hexadecimal bytes",
        ));
    };
    if text.len() > MAX_BINARY_BYTES.saturating_mul(2)
        || text.len() % 2 != 0
        || text.units().iter().any(|unit| {
            *unit > 0x7f
                || !((*unit >= b'0' as u16 && *unit <= b'9' as u16)
                    || (*unit >= b'a' as u16 && *unit <= b'f' as u16))
        })
    {
        return Err(err(
            "PROTOBUF_BYTES",
            "Expected bounded lowercase hexadecimal bytes",
        ));
    }
    charge_descriptor_work(context, text.len())
}
fn parse_hex(value: &Value, context: &mut Context<'_>) -> Result<Vec<u8>, EngineError> {
    validate_hex(value, context)?;
    let Value::String(utf16) = value else {
        unreachable!()
    };
    let text = utf16
        .to_utf8()
        .map_err(|_| err("PROTOBUF_BYTES", "Expected lowercase hexadecimal bytes"))?;
    let mut out = Vec::with_capacity(text.len() / 2);
    for chunk in text.as_bytes().chunks_exact(2) {
        out.push((nibble(chunk[0]) << 4) | nibble(chunk[1]));
    }
    Ok(out)
}
fn nibble(b: u8) -> u8 {
    if b <= b'9' { b - b'0' } else { b - b'a' + 10 }
}
fn charge_descriptor_work(context: &mut Context<'_>, mut amount: usize) -> Result<(), EngineError> {
    while amount > 0 {
        let chunk = amount.min(WORK_CHUNK);
        context.charge_work(chunk, Utf16::default())?;
        amount -= chunk;
    }
    Ok(())
}
fn precharge_tree_copy(root: &Value, context: &mut Context<'_>) -> Result<(), EngineError> {
    fn visit(
        value: &Value,
        context: &mut Context<'_>,
        depth: usize,
        values: &mut usize,
        text: &mut usize,
    ) -> Result<(), EngineError> {
        *values = values
            .checked_add(1)
            .ok_or_else(|| err("LIMIT", "Descriptor value count overflow"))?;
        context.check_tree_value_count(*values, Utf16::default())?;
        if depth > context.limits().max_depth {
            return Err(err("LIMIT", "Descriptor nesting exceeds limit"));
        }
        charge_descriptor_work(context, 1)?;
        match value {
            Value::String(s) => {
                *text = text.saturating_add(s.len());
                if *text > MAX_DESCRIPTOR_TREE_TEXT {
                    return Err(err("LIMIT", "Descriptor text expansion exceeds limit"));
                }
                charge_descriptor_work(context, s.len())?;
            }
            Value::Array(items) => {
                for item in items {
                    visit(item, context, depth + 1, values, text)?;
                }
            }
            Value::Object(items) => {
                for (key, item) in items {
                    *text = text.saturating_add(key.len());
                    if *text > MAX_DESCRIPTOR_TREE_TEXT {
                        return Err(err("LIMIT", "Descriptor text expansion exceeds limit"));
                    }
                    charge_descriptor_work(context, key.len())?;
                    visit(item, context, depth + 1, values, text)?;
                }
            }
            Value::Null | Value::Bool(_) | Value::Number(_) => (),
        }
        Ok(())
    }
    let mut values = 0usize;
    let mut text = 0usize;
    visit(root, context, 0, &mut values, &mut text)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn value(kind: &str, fields: Vec<(Utf16, Value)>, unknown: Vec<Value>) -> Value {
        Value::object(
            vec![
                (Utf16::from("type"), Value::string_utf8(kind)),
                (Utf16::from("fields"), Value::Object(fields)),
                (Utf16::from("unknown"), Value::Array(unknown)),
            ],
            Utf16::default(),
        )
        .unwrap()
    }
    fn unknown(number: u32, wire: u32, data: &str) -> Value {
        Value::object(
            vec![
                (Utf16::from("number"), Value::Number(number as f64)),
                (Utf16::from("wireType"), Value::Number(wire as f64)),
                (Utf16::from("data"), Value::string_utf8(data)),
            ],
            Utf16::default(),
        )
        .unwrap()
    }
    #[test]
    fn empty_set_round_trips() {
        let mut context = Context::ordinary();
        let node = read_descriptor_set(&[], &mut context).unwrap();
        assert_eq!(
            write_descriptor_set(&node, &mut context).unwrap(),
            Vec::<u8>::new()
        );
    }
    #[test]
    fn closed_enum_unknown_preserves_nonminimal_varint_bytes() {
        let input = [0x0a, 0x05, 0x42, 0x03, 0x48, 0xe3, 0x00];
        let mut context = Context::ordinary();
        let node = read_descriptor_set(&input, &mut context).unwrap();
        let Value::Object(root) = &node else {
            panic!("root object")
        };
        let Value::Object(root_fields) = get(&root, "fields").unwrap() else {
            panic!("root fields")
        };
        let Value::Array(files) = get(root_fields, "file").unwrap() else {
            panic!("files")
        };
        let Value::Object(file) = &files[0] else {
            panic!("file")
        };
        let Value::Object(file_fields) = get(file, "fields").unwrap() else {
            panic!("file fields")
        };
        let Value::Object(options) = get(file_fields, "options").unwrap() else {
            panic!("options")
        };
        let Value::Array(unknowns) = get(options, "unknown").unwrap() else {
            panic!("unknowns")
        };
        assert_eq!(
            get(as_object(&unknowns[0]).unwrap(), "data"),
            Some(&Value::string_utf8("e300"))
        );
        assert_eq!(write_descriptor_set(&node, &mut context).unwrap(), input);
    }
    #[test]
    fn packed_closed_enum_controls_preserve_valid_and_unknown_values() {
        // FieldOptions.targets: valid [1,2], invalid [99], and mixed [1,99,2].
        let cases = [
            ("0a0b2209120742059a01020102", "0a0c220a12084206980101980102"),
            ("0a0a2208120642049a010163", "0a09220712054203980163"),
            (
                "0a0c220a120842069a0103016302",
                "0a0f220d120b4209980101980102980163",
            ),
            (
                "0a0e220c120a42089a010501e3006402",
                "0a132211120f420d9801019801029801e300980164",
            ),
        ];
        for (input_hex, expected_hex) in cases {
            let input =
                parse_hex(&Value::string_utf8(input_hex), &mut Context::ordinary()).unwrap();
            let expected =
                parse_hex(&Value::string_utf8(expected_hex), &mut Context::ordinary()).unwrap();
            let mut context = Context::ordinary();
            let node = read_descriptor_set(&input, &mut context).unwrap();
            assert_eq!(write_descriptor_set(&node, &mut context).unwrap(), expected);
        }
    }
    #[test]
    fn malformed_packed_enum_tail_is_rejected_even_after_invalid_member() {
        let input = parse_hex(
            &Value::string_utf8("0a0b2209120742059a01026380"),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            read_descriptor_set(&input, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "PROTOBUF_BINARY"
        );
    }
    #[test]
    fn signed_fixed_decoding_uses_twos_complement() {
        let mut cursor = 0;
        let mut count = 0;
        assert_eq!(
            decode_scalar(
                &i32::MIN.to_le_bytes(),
                &mut cursor,
                WireKind::SFixed32,
                &mut Context::ordinary(),
                0,
                &mut count
            )
            .unwrap()
            .0,
            Value::Number(i32::MIN as f64)
        );
        cursor = 0;
        assert_eq!(
            decode_scalar(
                &i32::MAX.to_le_bytes(),
                &mut cursor,
                WireKind::SFixed32,
                &mut Context::ordinary(),
                0,
                &mut count
            )
            .unwrap()
            .0,
            Value::Number(i32::MAX as f64)
        );
        cursor = 0;
        assert_eq!(
            decode_scalar(
                &i64::MIN.to_le_bytes(),
                &mut cursor,
                WireKind::SFixed64,
                &mut Context::ordinary(),
                0,
                &mut count
            )
            .unwrap()
            .0,
            Value::string_utf8(i64::MIN.to_string())
        );
        cursor = 0;
        assert_eq!(
            decode_scalar(
                &i64::MAX.to_le_bytes(),
                &mut cursor,
                WireKind::SFixed64,
                &mut Context::ordinary(),
                0,
                &mut count
            )
            .unwrap()
            .0,
            Value::string_utf8(i64::MAX.to_string())
        );
    }
    #[test]
    fn canonical_int64_rejects_signed_zero() {
        assert!(!canonical_integer("-0"));
        assert!(canonical_integer("0"));
    }
    #[test]
    fn malformed_eleven_byte_unknown_varint_is_rejected() {
        let input = [
            0x80, 0xb5, 0x18, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x00,
        ];
        let error = read_descriptor_set(&input, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "PROTOBUF_BINARY");
    }
    #[test]
    fn full_width_tag_number_is_checked_before_narrowing() {
        let mut input = Vec::new();
        write_varint(&mut input, (1u64 << 35));
        input.push(0);
        assert_eq!(
            read_descriptor_set(&input, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "PROTOBUF_BINARY"
        );
    }
    #[test]
    fn unknown_groups_keep_end_tag_and_order() {
        let input = [0x83, 0xb5, 0x18, 0x08, 0x07, 0x84, 0xb5, 0x18];
        let mut context = Context::ordinary();
        let node = read_descriptor_set(&input, &mut context).unwrap();
        let Value::Object(root) = node else {
            panic!("root object")
        };
        let Value::Array(items) = get(&root, "unknown").unwrap() else {
            panic!("unknowns")
        };
        assert_eq!(
            get(as_object(&items[0]).unwrap(), "data"),
            Some(&Value::string_utf8("080784b518"))
        );
        assert_eq!(
            write_descriptor_set(&Value::Object(root), &mut context).unwrap(),
            input
        );
    }
    #[test]
    fn unknown_writer_validates_payload_and_lower_hex() {
        let node = value(
            ROOT,
            vec![],
            vec![unknown(50_000, 0, "8080808080808080808000")],
        );
        assert_eq!(
            write_descriptor_set(&node, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "PROTOBUF_DESCRIPTOR"
        );
        let upper = value(ROOT, vec![], vec![unknown(50_000, 0, "AF")]);
        assert_eq!(
            write_descriptor_set(&upper, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "PROTOBUF_BYTES"
        );
    }
    #[test]
    fn unknown_group_validation_preserves_meter_control_failure() {
        let host_error = EngineError::new("METER_STOP", Utf16::default(), "meter stopped");
        let mut meter = |_| Err(host_error.clone());
        let mut context = Context::ordinary().with_meter(&mut meter);
        // The payload is only group wire data; validation's first charge is
        // inside skip_value's group traversal, after top-level admission.
        let payload = [0x08, 0x07, 0x84, 0xb5, 0x18];
        let error = validate_unknown_payload(&payload, 50_000, 3, &mut context).unwrap_err();
        let observed = remap_unknown_wire_error(error);
        assert_eq!(observed.code, "METER_STOP");
        assert!(observed.is_control_failure());
    }
}

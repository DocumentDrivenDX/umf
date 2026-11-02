// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded Rust decoding and validation for the pinned Arrow FlatBuffer model.
use crate::{
    arrow_flatbuffer_model, arrow_ipc_capture,
    context::Context,
    error::EngineError,
    serialization::{self, Format},
    value::{Utf16, Value},
};

const INVENTORY: &str = include_str!("../../../spec/extensions/arrow/flatbuffer-inventory.json");

#[derive(Clone)]
struct FieldDecl {
    name: String,
    ty: String,
}

#[derive(Clone)]
struct Member {
    name: String,
    value: i64,
}

#[derive(Clone)]
struct Decl {
    name: String,
    kind: String,
    base: Option<String>,
    fields: Vec<FieldDecl>,
    members: Vec<Member>,
}

fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}

fn obj(values: Vec<(&str, Value)>) -> Value {
    Value::Object(values.into_iter().map(|(k, v)| (key(k), v)).collect())
}

fn text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(s) => s.to_utf8().ok(),
        _ => None,
    }
}

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v),
        _ => None,
    }
}

fn array(value: &Value) -> Option<&[Value]> {
    match value {
        Value::Array(items) => Some(items),
        _ => None,
    }
}

fn error(path: &str, message: &str) -> EngineError {
    EngineError::new("ARROW_FLATBUFFER_DECODE", key(path), message)
}

fn inventory(ctx: &mut Context<'_>) -> Result<Vec<Decl>, EngineError> {
    let parsed = serialization::read_json_value(
        &INVENTORY.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )?;
    let definitions = array(
        field(&parsed, "definitions")
            .ok_or_else(|| error("", "Arrow FlatBuffer inventory has no definitions"))?,
    )
    .ok_or_else(|| error("", "Arrow FlatBuffer definitions must be an array"))?;
    let mut output = Vec::with_capacity(definitions.len());
    for item in definitions {
        ctx.charge_work(1, Utf16::default())?;
        let name = text(field(item, "name"))
            .ok_or_else(|| error("", "Arrow declaration name is missing"))?;
        let kind = text(field(item, "kind"))
            .ok_or_else(|| error("", "Arrow declaration kind is missing"))?;
        let base = text(field(item, "base"));
        let mut fields = Vec::new();
        if let Some(values) = field(item, "fields").and_then(array) {
            for f in values {
                fields.push(FieldDecl {
                    name: text(field(f, "name"))
                        .ok_or_else(|| error("", "Arrow field name is missing"))?,
                    ty: text(field(f, "type"))
                        .ok_or_else(|| error("", "Arrow field type is missing"))?,
                });
            }
        }
        let mut members = Vec::new();
        if let Some(values) = field(item, "members").and_then(array) {
            for m in values {
                let value = match field(m, "value") {
                    Some(Value::Number(n)) if n.is_finite() && n.fract() == 0.0 => *n as i64,
                    _ => return Err(error("", "Arrow enum member value is invalid")),
                };
                members.push(Member {
                    name: text(field(m, "name"))
                        .ok_or_else(|| error("", "Arrow enum member name is missing"))?,
                    value,
                });
            }
        }
        output.push(Decl {
            name,
            kind,
            base,
            fields,
            members,
        });
    }
    Ok(output)
}

fn short_name(name: &str) -> &str {
    name.strip_prefix("org.apache.arrow.flatbuf.")
        .unwrap_or(name)
}

fn declaration<'a>(decls: &'a [Decl], name: &str) -> Option<&'a Decl> {
    let short = short_name(name);
    decls.iter().find(|d| d.name == short)
}

fn align(value: usize, alignment: usize) -> Option<usize> {
    value
        .checked_add(alignment.checked_sub(1)?)
        .map(|v| v / alignment * alignment)
}

fn layout(
    decls: &[Decl],
    name: &str,
    depth: usize,
) -> Result<(usize, usize, Vec<(String, usize)>), EngineError> {
    if depth > 128 {
        return Err(error(
            "",
            "Metadata declaration layout exceeded depth limit",
        ));
    }
    let name = short_name(name);
    if name == "string" || (name.starts_with('[') && name.ends_with(']')) {
        return Ok((4, 4, Vec::new()));
    }
    let primitive = match name {
        "bool" | "byte" => Some(1),
        "short" => Some(2),
        "int" => Some(4),
        "long" => Some(8),
        _ => None,
    };
    if let Some(size) = primitive {
        return Ok((size, size, Vec::new()));
    }
    let decl = declaration(decls, name)
        .ok_or_else(|| error("", &format!("Unknown metadata declaration {name}")))?;
    match decl.kind.as_str() {
        "enum" => layout(
            decls,
            decl.base
                .as_deref()
                .ok_or_else(|| error("", "Enum base type is missing"))?,
            depth + 1,
        ),
        "struct" => {
            let mut offset = 0;
            let mut max_alignment = 1;
            let mut offsets = Vec::with_capacity(decl.fields.len());
            for field in &decl.fields {
                let (size, alignment, _) = layout(decls, &field.ty, depth + 1)?;
                max_alignment = max_alignment.max(alignment);
                offset =
                    align(offset, alignment).ok_or_else(|| error("", "Struct layout overflow"))?;
                offsets.push((field.name.clone(), offset));
                offset = offset
                    .checked_add(size)
                    .ok_or_else(|| error("", "Struct layout overflow"))?;
            }
            let size =
                align(offset, max_alignment).ok_or_else(|| error("", "Struct layout overflow"))?;
            Ok((size, max_alignment, offsets))
        }
        "table" | "union" => Ok((4, 4, Vec::new())),
        _ => Err(error("", "Unknown metadata declaration kind")),
    }
}

struct Decoder<'a> {
    bytes: &'a [u8],
    declarations: Vec<Decl>,
    visited: usize,
    diagnostics: Vec<Value>,
}

impl Decoder<'_> {
    fn bounds(&self, pos: usize, size: usize, path: &str) -> Result<(), EngineError> {
        if pos
            .checked_add(size)
            .is_none_or(|end| end > self.bytes.len())
        {
            return Err(error(path, "Metadata offset outside captured bytes"));
        }
        Ok(())
    }

    fn u8(&self, pos: usize, path: &str) -> Result<u8, EngineError> {
        self.bounds(pos, 1, path)?;
        Ok(self.bytes[pos])
    }

    fn u16(&self, pos: usize, path: &str) -> Result<u16, EngineError> {
        self.bounds(pos, 2, path)?;
        Ok(u16::from_le_bytes([self.bytes[pos], self.bytes[pos + 1]]))
    }

    fn u32(&self, pos: usize, path: &str) -> Result<u32, EngineError> {
        self.bounds(pos, 4, path)?;
        Ok(u32::from_le_bytes([
            self.bytes[pos],
            self.bytes[pos + 1],
            self.bytes[pos + 2],
            self.bytes[pos + 3],
        ]))
    }

    fn slot(
        &self,
        table: usize,
        vt: usize,
        length: usize,
        object_size: usize,
        index: usize,
        size: usize,
        path: &str,
    ) -> Result<Option<usize>, EngineError> {
        let entry = 4usize
            .checked_add(
                index
                    .checked_mul(2)
                    .ok_or_else(|| error(path, "Vtable index overflow"))?,
            )
            .ok_or_else(|| error(path, "Vtable index overflow"))?;
        if entry >= length {
            return Ok(None);
        }
        let offset = self.u16(vt + entry, path)? as usize;
        if offset == 0 {
            return Ok(None);
        }
        if offset < 4 || offset.checked_add(size).is_none_or(|end| end > object_size) {
            return Err(error(path, "Field lies outside its table"));
        }
        Ok(Some(table + offset))
    }

    fn indirect(&self, pos: usize, path: &str) -> Result<usize, EngineError> {
        let offset = self.u32(pos, path)? as usize;
        if offset < 4 {
            return Err(error(path, "Null/backward object offset"));
        }
        let target = pos
            .checked_add(offset)
            .ok_or_else(|| error(path, "Metadata offset overflow"))?;
        self.bounds(target, 4, path)?;
        Ok(target)
    }

    fn read(
        &mut self,
        name: &str,
        pos: usize,
        depth: usize,
        path: &str,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        self.visited += 1;
        if self.visited > ctx.limits().max_values || depth > ctx.limits().max_depth {
            return Err(error(path, "Metadata traversal limit exceeded"));
        }
        ctx.charge_work(1, Utf16::from(path))?;
        let name = short_name(name).to_string();
        let (size, alignment, offsets) = layout(&self.declarations, &name, 0)?;
        self.bounds(pos, size, path)?;
        if pos % alignment != 0 {
            return Err(error(path, "Misaligned metadata field"));
        }
        match name.as_str() {
            "bool" => match self.u8(pos, path)? {
                0 => return Ok(Value::Bool(false)),
                1 => return Ok(Value::Bool(true)),
                _ => return Err(error(path, "Invalid boolean")),
            },
            "byte" => return Ok(Value::Number((self.bytes[pos] as i8) as f64)),
            "short" => {
                return Ok(Value::Number(
                    i16::from_le_bytes([self.bytes[pos], self.bytes[pos + 1]]) as f64,
                ))
            }
            "int" => {
                return Ok(Value::Number(i32::from_le_bytes(
                    self.bytes[pos..pos + 4].try_into().unwrap(),
                ) as f64))
            }
            "long" => {
                return Ok(Value::string_utf8(
                    i64::from_le_bytes(self.bytes[pos..pos + 8].try_into().unwrap()).to_string(),
                ))
            }
            "string" => {
                let start = self.indirect(pos, path)?;
                let length = self.u32(start, path)? as usize;
                let bytes_at = start
                    .checked_add(4)
                    .ok_or_else(|| error(path, "String offset overflow"))?;
                self.bounds(
                    bytes_at,
                    length
                        .checked_add(1)
                        .ok_or_else(|| error(path, "String length overflow"))?,
                    path,
                )?;
                if self.bytes[bytes_at + length] != 0 {
                    return Err(error(path, "String lacks terminator"));
                }
                let value = std::str::from_utf8(&self.bytes[bytes_at..bytes_at + length])
                    .map_err(|_| error(path, "String is not valid UTF-8"))?;
                return Ok(Value::string_utf8(value));
            }
            _ => {}
        }
        if name.starts_with('[') && name.ends_with(']') {
            let item_type = name[1..name.len() - 1].trim();
            let start = self.indirect(pos, path)?;
            let length = self.u32(start, path)? as usize;
            if length > ctx.limits().max_values.saturating_sub(self.visited) {
                return Err(error(path, "Metadata vector exceeds traversal limit"));
            }
            let (item_size, _, _) = layout(&self.declarations, item_type, 0)?;
            let data_at = start
                .checked_add(4)
                .ok_or_else(|| error(path, "Vector offset overflow"))?;
            self.bounds(
                data_at,
                length
                    .checked_mul(item_size)
                    .ok_or_else(|| error(path, "Vector length overflow"))?,
                path,
            )?;
            let mut values = Vec::with_capacity(length);
            for i in 0..length {
                let at = data_at + i * item_size;
                values.push(self.read(item_type, at, depth + 1, &format!("{path}/{i}"), ctx)?);
            }
            return Ok(Value::Array(values));
        }
        let decl = declaration(&self.declarations, &name)
            .cloned()
            .ok_or_else(|| error(path, &format!("Unknown metadata declaration {name}")))?;
        match decl.kind.as_str() {
            "enum" => {
                let base = decl
                    .base
                    .as_deref()
                    .ok_or_else(|| error(path, "Enum base type is missing"))?;
                let value = self.read(base, pos, depth + 1, path, ctx)?;
                let integer = match value {
                    Value::Number(n) => n as i64,
                    Value::String(s) => s
                        .to_utf8()
                        .ok()
                        .and_then(|s| s.parse::<i64>().ok())
                        .ok_or_else(|| error(path, "Enum value is invalid"))?,
                    _ => return Err(error(path, "Enum base value is invalid")),
                };
                let member = decl
                    .members
                    .iter()
                    .find(|m| m.value == integer)
                    .ok_or_else(|| {
                        error(
                            path,
                            &format!("Unknown {name} enum value {integer} at {path}"),
                        )
                    })?;
                Ok(Value::string_utf8(&member.name))
            }
            "struct" => {
                let mut fields = Vec::with_capacity(decl.fields.len());
                for (field, (_, offset)) in decl.fields.iter().zip(offsets) {
                    let field_path = format!("{path}/{}", field.name);
                    fields.push((
                        key(&field.name),
                        self.read(&field.ty, pos + offset, depth + 1, &field_path, ctx)?,
                    ));
                }
                Ok(Value::Object(fields))
            }
            "table" => {
                let table = self.indirect(pos, path)?;
                self.table_at(&decl, table, depth, path, ctx)
            }
            _ => Err(error(path, "Unexpected standalone union")),
        }
    }

    fn table_at(
        &mut self,
        decl: &Decl,
        table: usize,
        depth: usize,
        path: &str,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        if depth > ctx.limits().max_depth {
            return Err(error(path, "Metadata depth exceeded"));
        }
        self.bounds(table, 4, path)?;
        if table % 4 != 0 {
            return Err(error(path, "Misaligned table"));
        }
        let distance =
            i32::from_le_bytes(self.bytes[table..table + 4].try_into().unwrap()) as isize;
        let vt_signed = (table as isize)
            .checked_sub(distance)
            .ok_or_else(|| error(path, "Vtable offset overflow"))?;
        if vt_signed < 0 {
            return Err(error(path, "Vtable offset outside captured bytes"));
        }
        let vt = vt_signed as usize;
        let length = self.u16(vt, path)? as usize;
        let object_size = self.u16(vt + 2, path)? as usize;
        if vt % 2 != 0 || length < 4 || length % 2 != 0 || object_size < 4 {
            return Err(error(path, "Invalid vtable"));
        }
        self.bounds(vt, length, path)?;
        self.bounds(table, object_size, path)?;
        let mut result = Vec::new();
        let mut index = 0;
        for field in &decl.fields {
            let short = short_name(&field.ty);
            if declaration(&self.declarations, short).is_some_and(|d| d.kind == "union") {
                let union = declaration(&self.declarations, short).unwrap().clone();
                let tag_pos = self.slot(table, vt, length, object_size, index, 1, path)?;
                index += 1;
                let value_pos = self.slot(table, vt, length, object_size, index, 4, path)?;
                index += 1;
                let tag = tag_pos.map(|p| self.u8(p, path)).transpose()?.unwrap_or(0);
                if tag == 0 {
                    if value_pos.is_some() {
                        return Err(error(path, "NONE union has a value"));
                    }
                    if tag_pos.is_some() {
                        result.push((
                            key(&field.name),
                            obj(vec![("type", Value::string_utf8("NONE"))]),
                        ));
                    }
                    continue;
                }
                let variant = union
                    .members
                    .iter()
                    .find(|m| m.value == tag as i64)
                    .ok_or_else(|| {
                        error(
                            path,
                            &format!("Unknown {short} union tag {tag} at {path}/{}", field.name),
                        )
                    })?;
                let value_pos = value_pos.ok_or_else(|| error(path, "Union tag lacks value"))?;
                let value = self.read(
                    &variant.name,
                    value_pos,
                    depth + 1,
                    &format!("{path}/{}/value", field.name),
                    ctx,
                )?;
                result.push((
                    key(&field.name),
                    obj(vec![
                        ("type", Value::string_utf8(&variant.name)),
                        ("value", value),
                    ]),
                ));
            } else {
                let (size, _, _) = layout(&self.declarations, short, 0)?;
                if let Some(at) = self.slot(table, vt, length, object_size, index, size, path)? {
                    let field_value =
                        self.read(short, at, depth + 1, &format!("{path}/{}", field.name), ctx)?;
                    result.push((key(&field.name), field_value));
                }
                index += 1;
            }
        }
        while 4 + index * 2 < length {
            if self.u16(vt + 4 + index * 2, path)? != 0 {
                self.diagnostics.push(obj(vec![
                    ("code", Value::string_utf8("ARROW_FLATBUFFER_UNKNOWN_SLOT")),
                    ("path", Value::string_utf8(path)),
                    ("severity", Value::string_utf8("warning")),
                    (
                        "message",
                        Value::string_utf8(&format!(
                            "Unknown table slot {index} retained in source bytes at vtable {vt}"
                        )),
                    ),
                ]));
            }
            index += 1;
        }
        Ok(Value::Object(result))
    }
}

fn payload_mut(doc: &mut Value) -> Option<&mut Value> {
    let modules = field_mut(doc, "modules")?;
    let Value::Array(modules) = modules else {
        return None;
    };
    let module = modules
        .iter_mut()
        .find(|m| field(m, "id") == Some(&Value::string_utf8("metadata")))?;
    let elements = field_mut(module, "elements")?;
    let Value::Array(elements) = elements else {
        return None;
    };
    let element = elements
        .iter_mut()
        .find(|e| field(e, "id") == Some(&Value::string_utf8("root")))?;
    field_mut(field_mut(element, "extensions")?, "umf.arrow.flatbuffer")
}

fn field_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(k, _)| k == &key(name))
            .map(|(_, v)| v),
        _ => None,
    }
}

pub fn decode_arrow_flatbuffer(
    bytes: &[u8],
    id: &Utf16,
    root_type: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let ipc = arrow_ipc_capture::ArrowIpcResources::new(ctx)?;
    let mut source_id_units = id.units().to_vec();
    source_id_units.extend("/source".encode_utf16());
    let source_id = Utf16::new(source_id_units);
    let source = arrow_ipc_capture::capture_arrow_ipc(bytes, &source_id, &ipc, ctx)?;
    let mut diagnostics = Vec::new();
    let parsed = (|| -> Result<(Value, Vec<Value>), EngineError> {
        if !["Schema", "Message", "Footer", "Tensor", "SparseTensor"].contains(&root_type) {
            return Err(error("", "Unsupported metadata root"));
        }
        let mut decoder = Decoder {
            bytes,
            declarations: inventory(ctx)?,
            visited: 0,
            diagnostics: Vec::new(),
        };
        let value = decoder.read(root_type, 0, 0, "", ctx)?;
        Ok((value, decoder.diagnostics))
    })();
    match parsed {
        Ok((value, unknown_slots)) => {
            diagnostics.extend(unknown_slots);
            let model_value = obj(vec![
                ("rootType", Value::string_utf8(root_type)),
                ("value", value),
            ]);
            let json = serialization::write_json_value(&model_value, Format::Json, ctx)?;
            let mut model = arrow_flatbuffer_model::import_arrow_flatbuffer_model(&json, id, ctx)?;
            if !diagnostics.is_empty() {
                if let Some(p) = payload_mut(&mut model) {
                    if let Value::Object(fields) = p {
                        fields.push((
                            key("wireOmissions"),
                            Value::Array(
                                diagnostics
                                    .iter()
                                    .map(|d| {
                                        obj(vec![
                                            (
                                                "path",
                                                field(d, "path")
                                                    .cloned()
                                                    .unwrap_or(Value::string_utf8("")),
                                            ),
                                            (
                                                "message",
                                                field(d, "message").cloned().unwrap_or(
                                                    Value::string_utf8("Unknown wire content"),
                                                ),
                                            ),
                                        ])
                                    })
                                    .collect(),
                            ),
                        ));
                    }
                }
            }
            diagnostics.push(obj(vec![
                ("code", Value::string_utf8("ARROW_FLATBUFFER_INCOMPLETE")),
                ("path", Value::string_utf8("")),
                ("severity", Value::string_utf8("warning")),
                ("message", Value::string_utf8("Known metadata decoded with physical field presence; full wire verification, IPC framing, data and Arrow semantics remain unverified")),
            ]));
            Ok(obj(vec![
                ("source", source),
                ("model", model),
                ("complete", Value::Bool(false)),
                ("status", Value::string_utf8("decoded")),
                ("diagnostics", Value::Array(diagnostics)),
            ]))
        }
        Err(failure) => {
            if failure.is_control_failure() {
                return Err(failure);
            }
            let message = failure
                .message
                .to_utf8()
                .unwrap_or_else(|_| "Metadata decode failed".to_string());
            diagnostics.push(obj(vec![
                ("code", Value::string_utf8("ARROW_FLATBUFFER_DECODE")),
                ("path", Value::string_utf8("")),
                ("severity", Value::string_utf8("error")),
                ("message", Value::string_utf8(&message)),
            ]));
            Ok(obj(vec![
                ("source", source),
                ("complete", Value::Bool(false)),
                ("status", Value::string_utf8("uninterpreted")),
                ("diagnostics", Value::Array(diagnostics)),
            ]))
        }
    }
}

pub fn validate_encoding_model(model: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let root_type = text(field(model, "rootType"))
        .ok_or_else(|| error("", "Expected supported metadata root"))?;
    let value = field(model, "value").ok_or_else(|| error("", "Expected metadata value"))?;
    let declarations = inventory(ctx)?;
    fn visit(
        value: &Value,
        ty: &str,
        declarations: &[Decl],
        path: &str,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, Utf16::from(path))?;
        let ty = short_name(ty);
        if ty.starts_with('[') && ty.ends_with(']') {
            let items = array(value).ok_or_else(|| error(path, "Expected metadata vector"))?;
            for (index, item) in items.iter().enumerate() {
                visit(
                    item,
                    ty[1..ty.len() - 1].trim(),
                    declarations,
                    &format!("{path}/{index}"),
                    ctx,
                )?;
            }
            return Ok(());
        }
        let Some(decl) = declaration(declarations, ty) else {
            return Ok(());
        };
        if decl.kind == "enum" {
            return Ok(());
        }
        if decl.kind == "union" {
            if text(field(value, "type")).as_deref() != Some("NONE") {
                let variant = text(field(value, "type"))
                    .ok_or_else(|| error(path, "Union tag is missing"))?;
                if !decl.members.iter().any(|m| m.name == variant) {
                    return Err(EngineError::new(
                        "ARROW_FLATBUFFER_UNKNOWN",
                        Utf16::from(path),
                        "Unknown metadata union member cannot be dropped",
                    ));
                }
                visit(
                    field(value, "value").ok_or_else(|| error(path, "Union value is missing"))?,
                    &variant,
                    declarations,
                    &format!("{path}/value"),
                    ctx,
                )?;
            }
            return Ok(());
        }
        for (name, item) in match value {
            Value::Object(m) => m,
            _ => return Err(error(path, "Expected metadata object")),
        } {
            let name = name
                .to_utf8()
                .map_err(|_| error(path, "Metadata property name is not valid UTF-16"))?;
            let field = decl.fields.iter().find(|f| f.name == name).ok_or_else(|| {
                EngineError::new(
                    "ARROW_FLATBUFFER_UNKNOWN",
                    Utf16::from(path),
                    format!("Unknown metadata property cannot be dropped: {ty}.{name}"),
                )
            })?;
            visit(
                item,
                &field.ty,
                declarations,
                &format!("{path}/{}", field.name),
                ctx,
            )?;
        }
        Ok(())
    }
    visit(value, &root_type, &declarations, "", ctx)
}

pub fn prepare_arrow_flatbuffer_encoding(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let json = arrow_flatbuffer_model::export_arrow_flatbuffer_model(document, ctx)?;
    let model = serialization::read_json_value(json.units(), Format::Json, ctx)?;
    validate_encoding_model(&model, ctx)?;
    Ok(model)
}

pub fn verify_encoded_bytes(
    expected: &Value,
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    validate_encoding_model(expected, ctx)?;
    let root_type =
        text(field(expected, "rootType")).ok_or_else(|| error("", "Expected metadata root"))?;
    if bytes.is_empty() || bytes.len() > arrow_ipc_capture::MAX_BYTES {
        return Err(EngineError::new(
            "ARROW_FLATBUFFER_BYTES",
            Utf16::default(),
            "Expected bounded metadata bytes",
        ));
    }
    let id = Utf16::from("arrow-flatbuffer-verify");
    let decoded = decode_arrow_flatbuffer(bytes, &id, &root_type, ctx)?;
    if text(field(&decoded, "status")).as_deref() != Some("decoded") {
        return Err(EngineError::new(
            "ARROW_FLATBUFFER_LOSS",
            Utf16::default(),
            "Encoded metadata could not be decoded",
        ));
    }
    let diagnostics = field(&decoded, "diagnostics")
        .and_then(array)
        .unwrap_or(&[]);
    if diagnostics
        .iter()
        .any(|d| text(field(d, "code")).as_deref() != Some("ARROW_FLATBUFFER_INCOMPLETE"))
    {
        return Err(EngineError::new(
            "ARROW_FLATBUFFER_LOSS",
            Utf16::default(),
            "Encoded metadata contains unsupported wire content",
        ));
    }
    let model_doc = field(&decoded, "model").ok_or_else(|| {
        EngineError::new(
            "ARROW_FLATBUFFER_LOSS",
            Utf16::default(),
            "Encoded metadata did not produce a model",
        )
    })?;
    let serialized = arrow_flatbuffer_model::export_arrow_flatbuffer_model(model_doc, ctx)?;
    let actual = serialization::read_json_value(serialized.units(), Format::Json, ctx)?;
    if !equivalent_metered(expected, &actual, ctx, 0)? {
        return Err(EngineError::new(
            "ARROW_FLATBUFFER_LOSS",
            Utf16::default(),
            "Encoded metadata changed values or physical field presence",
        ));
    }
    Ok(())
}

pub(crate) fn equivalent_metered(
    left: &Value,
    right: &Value,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<bool, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if depth > ctx.limits().max_depth {
        return Err(EngineError::new(
            "RESOURCE_LIMIT",
            Utf16::default(),
            "Arrow metadata comparison exceeds inspection limit",
        )
        .with_control_failure());
    }
    Ok(match (left, right) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(a), Value::Bool(b)) => a == b,
        (Value::Number(a), Value::Number(b)) => a == b,
        (Value::String(a), Value::String(b)) => {
            ctx.charge_work(a.len().saturating_add(b.len()), Utf16::default())?;
            a == b
        }
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                false
            } else {
                let mut same = true;
                for (x, y) in a.iter().zip(b) {
                    if !equivalent_metered(x, y, ctx, depth + 1)? {
                        same = false;
                        break;
                    }
                }
                same
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            if a.len() != b.len() {
                false
            } else {
                let mut same = true;
                for (k, v) in a {
                    ctx.charge_work(k.units().len().saturating_add(1), k.clone())?;
                    let mut found = None;
                    for (candidate, other) in b {
                        ctx.charge_work(
                            candidate.len().saturating_add(k.len()).saturating_add(1),
                            Utf16::default(),
                        )?;
                        if candidate == k {
                            found = Some(other);
                            break;
                        }
                    }
                    let Some(other) = found else {
                        same = false;
                        break;
                    };
                    if !equivalent_metered(v, other, ctx, depth + 1)? {
                        same = false;
                        break;
                    }
                }
                same
            }
        }
        _ => false,
    })
}

/// Encode the validated pinned Arrow FlatBuffer model without delegating the
/// layout or omission decisions to a JavaScript FlatBuffers package.
pub fn encode_arrow_flatbuffer_native(
    model: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    validate_encoding_model(model, ctx)?;
    let root_type =
        text(field(model, "rootType")).ok_or_else(|| error("", "Expected metadata root"))?;
    let value = field(model, "value").ok_or_else(|| error("", "Expected metadata value"))?;
    let declarations = inventory(ctx)?;
    let mut writer = Writer {
        bytes: vec![0; 4],
        declarations,
        visited: 0,
    };
    let root = writer.table(&root_type, value, 0, "", ctx)?;
    writer.patch_u32(
        0,
        u32::try_from(root).map_err(|_| error("", "Root offset overflow"))?,
    );
    if writer.bytes.len() > arrow_ipc_capture::MAX_BYTES {
        return Err(EngineError::new(
            "ARROW_FLATBUFFER_BYTES",
            Utf16::default(),
            "Expected bounded metadata bytes",
        ));
    }
    verify_encoded_bytes(model, &writer.bytes, ctx)?;
    Ok(writer.bytes)
}

struct WriteSlot {
    ty: String,
    offset: usize,
    present: bool,
    field_index: usize,
    pointer: bool,
    union_tag: Option<i64>,
    union_value: Option<(String, Value)>,
}

struct Writer {
    bytes: Vec<u8>,
    declarations: Vec<Decl>,
    visited: usize,
}

impl Writer {
    fn charge(
        &mut self,
        depth: usize,
        path: &str,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        self.visited = self.visited.saturating_add(1);
        if self.visited > ctx.limits().max_values || depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::from(path),
                "Metadata encoding traversal limit exceeded",
            )
            .with_control_failure());
        }
        ctx.charge_work(1, Utf16::from(path))
    }

    fn resize(&mut self, length: usize, path: &str) -> Result<(), EngineError> {
        if length > arrow_ipc_capture::MAX_BYTES {
            return Err(error(path, "FlatBuffer metadata exceeds the byte limit"));
        }
        self.bytes
            .try_reserve(length.saturating_sub(self.bytes.len()))
            .map_err(|_| error(path, "FlatBuffer metadata allocation failed"))?;
        self.bytes.resize(length, 0);
        Ok(())
    }

    fn pad(&mut self, alignment: usize) -> Result<(), EngineError> {
        let end =
            align(self.bytes.len(), alignment).ok_or_else(|| error("", "Alignment overflow"))?;
        self.resize(end, "")
    }

    fn patch_u16(&mut self, at: usize, value: u16) {
        self.bytes[at..at + 2].copy_from_slice(&value.to_le_bytes());
    }

    fn patch_u32(&mut self, at: usize, value: u32) {
        self.bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
    }

    fn patch_i32(&mut self, at: usize, value: i32) {
        self.bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
    }

    fn put_scalar(
        &mut self,
        ty: &str,
        value: &Value,
        at: usize,
        path: &str,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let name = short_name(ty);
        let (base, enum_value) = if let Some(decl) =
            declaration(&self.declarations, name).filter(|d| d.kind == "enum")
        {
            let member_name =
                text(Some(value)).ok_or_else(|| error(path, "Expected enum member name"))?;
            let member = decl
                .members
                .iter()
                .find(|m| m.name == member_name)
                .ok_or_else(|| error(path, "Unknown enum member"))?;
            (
                decl.base
                    .as_deref()
                    .ok_or_else(|| error(path, "Enum base type is missing"))?,
                Some(member.value),
            )
        } else {
            (name, None)
        };
        let integer = if let Some(n) = enum_value {
            n
        } else {
            match value {
                Value::Bool(b) if base == "bool" => {
                    if *b {
                        1
                    } else {
                        0
                    }
                }
                Value::Number(n)
                    if base != "bool"
                        && n.is_finite()
                        && n.fract() == 0.0
                        && n.abs() <= 9_007_199_254_740_991.0 =>
                {
                    *n as i64
                }
                Value::String(s) if base == "long" => {
                    ctx.charge_work(s.len().saturating_add(1), Utf16::from(path))?;
                    s.to_utf8()
                        .ok()
                        .and_then(|s| s.parse::<i64>().ok())
                        .ok_or_else(|| error(path, "Expected signed 64-bit integer"))?
                }
                _ => return Err(error(path, "Expected FlatBuffer scalar")),
            }
        };
        let (minimum, maximum) = match base {
            "bool" => (0, 1),
            "byte" => (i8::MIN as i64, i8::MAX as i64),
            "short" => (i16::MIN as i64, i16::MAX as i64),
            "int" => (i32::MIN as i64, i32::MAX as i64),
            "long" => (i64::MIN, i64::MAX),
            _ => return Err(error(path, "Unsupported FlatBuffer scalar base")),
        };
        if integer < minimum || integer > maximum {
            return Err(error(path, "Scalar value is outside its FlatBuffer range"));
        }
        let target = &mut self.bytes[at..];
        match base {
            "bool" | "byte" => {
                target[0] = integer as i8 as u8;
            }
            "short" => target[..2].copy_from_slice(&(integer as i16).to_le_bytes()),
            "int" => target[..4].copy_from_slice(&(integer as i32).to_le_bytes()),
            "long" => target[..8].copy_from_slice(&integer.to_le_bytes()),
            _ => return Err(error(path, "Unsupported FlatBuffer scalar base")),
        }
        Ok(())
    }

    fn table(
        &mut self,
        name: &str,
        value: &Value,
        depth: usize,
        path: &str,
        ctx: &mut Context<'_>,
    ) -> Result<usize, EngineError> {
        self.charge(depth, path, ctx)?;
        let decl = declaration(&self.declarations, name)
            .cloned()
            .ok_or_else(|| error(path, "Unknown metadata table"))?;
        if decl.kind != "table" {
            return Err(error(path, "Expected metadata table"));
        }
        let Value::Object(members) = value else {
            return Err(error(path, "Expected metadata object"));
        };
        let mut slots = Vec::new();
        let mut object_size = 4usize;
        let mut table_align = 4usize;
        for (field_index, field_decl) in decl.fields.iter().enumerate() {
            ctx.charge_work(1, Utf16::from(path))?;
            let field_value = members
                .iter()
                .find(|(k, _)| k == &key(&field_decl.name))
                .map(|(_, v)| v);
            let field_type = short_name(&field_decl.ty);
            if let Some(union) =
                declaration(&self.declarations, field_type).filter(|d| d.kind == "union")
            {
                let union_value = field_value.filter(|v| !matches!(v, Value::Null));
                let mut tag_value = None;
                let selected = if let Some(v) = union_value {
                    let variant = text(field(v, "type"))
                        .ok_or_else(|| error(path, "Union type is missing"))?;
                    if variant == "NONE" {
                        tag_value = Some(0);
                        None
                    } else {
                        let member = union
                            .members
                            .iter()
                            .find(|m| m.name == variant)
                            .ok_or_else(|| error(path, "Unknown union variant"))?;
                        tag_value = Some(member.value);
                        let child = field(v, "value")
                            .ok_or_else(|| error(path, "Union value is missing"))?
                            .clone();
                        Some((variant, member.value, child))
                    }
                } else {
                    None
                };
                let tag_ty = "byte";
                let (size, alignment, _) = layout(&self.declarations, tag_ty, depth + 1)?;
                object_size = align(object_size, alignment)
                    .ok_or_else(|| error(path, "Table layout overflow"))?;
                let tag_offset = object_size;
                if tag_value.is_some() {
                    object_size += size;
                }
                table_align = table_align.max(alignment);
                slots.push(WriteSlot {
                    ty: tag_ty.to_string(),
                    offset: tag_offset,
                    present: tag_value.is_some(),
                    field_index,
                    pointer: false,
                    union_tag: tag_value,
                    union_value: None,
                });
                let ptr_ty = "union";
                object_size =
                    align(object_size, 4).ok_or_else(|| error(path, "Table layout overflow"))?;
                let ptr_offset = object_size;
                if selected.is_some() {
                    object_size += 4;
                }
                table_align = table_align.max(4);
                slots.push(WriteSlot {
                    ty: ptr_ty.to_string(),
                    offset: ptr_offset,
                    present: selected.is_some(),
                    field_index,
                    pointer: true,
                    union_tag: None,
                    union_value: selected.map(|(n, _, child)| (n.to_string(), child)),
                });
                continue;
            }
            let (size, alignment, _) = layout(&self.declarations, field_type, depth + 1)?;
            let is_pointer = field_type == "string"
                || (field_type.starts_with('[') && field_type.ends_with(']'))
                || declaration(&self.declarations, field_type).is_some_and(|d| d.kind == "table");
            let present = field_value.is_some_and(|v| !matches!(v, Value::Null));
            object_size = align(object_size, alignment)
                .ok_or_else(|| error(path, "Table layout overflow"))?;
            let offset = object_size;
            if present {
                object_size = object_size
                    .checked_add(size)
                    .ok_or_else(|| error(path, "Table layout overflow"))?;
            }
            table_align = table_align.max(alignment);
            slots.push(WriteSlot {
                ty: field_type.to_string(),
                offset,
                present,
                field_index,
                pointer: is_pointer,
                union_tag: None,
                union_value: None,
            });
        }
        object_size =
            align(object_size, table_align).ok_or_else(|| error(path, "Table layout overflow"))?;
        let vtable_len = 4usize
            .checked_add(
                slots
                    .len()
                    .checked_mul(2)
                    .ok_or_else(|| error(path, "Vtable overflow"))?,
            )
            .ok_or_else(|| error(path, "Vtable overflow"))?;
        self.pad(2)?;
        let vt = self.bytes.len();
        self.resize(
            vt.checked_add(vtable_len)
                .ok_or_else(|| error(path, "Vtable overflow"))?,
            path,
        )?;
        self.pad(table_align)?;
        let table = self.bytes.len();
        self.resize(
            table
                .checked_add(object_size)
                .ok_or_else(|| error(path, "Table too large"))?,
            path,
        )?;
        self.patch_u16(
            vt,
            u16::try_from(vtable_len).map_err(|_| error(path, "Vtable too large"))?,
        );
        self.patch_u16(
            vt + 2,
            u16::try_from(object_size).map_err(|_| error(path, "Table too large"))?,
        );
        self.patch_i32(
            table,
            i32::try_from(table - vt).map_err(|_| error(path, "Vtable offset overflow"))?,
        );
        for (i, slot) in slots.iter().enumerate() {
            if slot.present {
                self.patch_u16(
                    vt + 4 + i * 2,
                    u16::try_from(slot.offset).map_err(|_| error(path, "Field offset overflow"))?,
                );
            }
        }
        for (i, slot) in slots.iter().enumerate() {
            if !slot.present {
                continue;
            }
            let at = table + slot.offset;
            if let Some(tag) = slot.union_tag {
                self.put_scalar("byte", &Value::Number(tag as f64), at, path, ctx)?;
                continue;
            }
            if let Some((variant, child)) = &slot.union_value {
                let variant_type = variant;
                let target = self.value(
                    variant_type,
                    child,
                    depth + 1,
                    &format!("{path}/{}", variant),
                    ctx,
                )?;
                self.patch_offset(at, target, path)?;
                continue;
            }
            let field_decl = &decl.fields[slot.field_index];
            let child_value = members
                .iter()
                .find(|(k, _)| k == &key(&field_decl.name))
                .map(|(_, v)| v)
                .ok_or_else(|| error(path, "Field value is missing"))?;
            let field_type = short_name(&field_decl.ty);
            if slot.pointer {
                let target = self.value(
                    field_type,
                    child_value,
                    depth + 1,
                    &format!("{path}/{}", field_decl.name),
                    ctx,
                )?;
                self.patch_offset(at, target, path)?;
            } else {
                self.inline(
                    field_type,
                    child_value,
                    at,
                    depth + 1,
                    &format!("{path}/{}", field_decl.name),
                    ctx,
                )?;
            }
        }
        Ok(table)
    }

    fn patch_offset(&mut self, at: usize, target: usize, path: &str) -> Result<(), EngineError> {
        let offset = target
            .checked_sub(at)
            .and_then(|n| u32::try_from(n).ok())
            .filter(|n| *n >= 4)
            .ok_or_else(|| error(path, "FlatBuffer forward offset overflow"))?;
        self.patch_u32(at, offset);
        Ok(())
    }

    fn value(
        &mut self,
        ty: &str,
        value: &Value,
        depth: usize,
        path: &str,
        ctx: &mut Context<'_>,
    ) -> Result<usize, EngineError> {
        let name = short_name(ty);
        if name == "string" {
            self.charge(depth, path, ctx)?;
            let Value::String(text) = value else {
                return Err(error(path, "Expected UTF-8 string"));
            };
            let text = text
                .to_utf8()
                .map_err(|_| error(path, "String is not valid UTF-16"))?;
            ctx.charge_work(
                text.encode_utf16().count().saturating_add(1),
                Utf16::from(path),
            )?;
            let bytes = text.into_bytes();
            self.pad(4)?;
            let length = bytes
                .len()
                .checked_add(5)
                .and_then(|n| self.bytes.len().checked_add(n))
                .ok_or_else(|| error(path, "String too large"))?;
            self.resize(length, path)?;
            let start = self.bytes.len() - bytes.len() - 5;
            self.bytes[start..start + 4].copy_from_slice(
                &u32::try_from(bytes.len())
                    .map_err(|_| error(path, "String too large"))?
                    .to_le_bytes(),
            );
            self.bytes[start + 4..start + 4 + bytes.len()].copy_from_slice(&bytes);
            Ok(start)
        } else if name.starts_with('[') && name.ends_with(']') {
            self.vector(name, value, depth, path, ctx)
        } else if declaration(&self.declarations, name).is_some_and(|d| d.kind == "table") {
            self.table(name, value, depth, path, ctx)
        } else {
            Err(error(path, "Value is not an indirect FlatBuffer field"))
        }
    }

    fn inline(
        &mut self,
        ty: &str,
        value: &Value,
        at: usize,
        depth: usize,
        path: &str,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        self.charge(depth, path, ctx)?;
        let name = short_name(ty);
        if declaration(&self.declarations, name).is_some_and(|d| d.kind == "struct") {
            let decl = declaration(&self.declarations, name).unwrap().clone();
            let Value::Object(fields) = value else {
                return Err(error(path, "Expected FlatBuffer struct"));
            };
            let (_, _, offsets) = layout(&self.declarations, name, 0)?;
            for field_decl in &decl.fields {
                let child = fields
                    .iter()
                    .find(|(k, _)| k == &key(&field_decl.name))
                    .map(|(_, v)| v)
                    .ok_or_else(|| error(path, "Struct field is missing"))?;
                let offset = offsets
                    .iter()
                    .find(|(n, _)| n == &field_decl.name)
                    .map(|(_, o)| *o)
                    .ok_or_else(|| error(path, "Struct layout is incomplete"))?;
                self.inline(
                    &field_decl.ty,
                    child,
                    at + offset,
                    depth + 1,
                    &format!("{path}/{}", field_decl.name),
                    ctx,
                )?;
            }
            Ok(())
        } else {
            self.put_scalar(name, value, at, path, ctx)
        }
    }

    fn vector(
        &mut self,
        ty: &str,
        value: &Value,
        depth: usize,
        path: &str,
        ctx: &mut Context<'_>,
    ) -> Result<usize, EngineError> {
        self.charge(depth, path, ctx)?;
        let item_type = ty[1..ty.len() - 1].trim();
        let Value::Array(items) = value else {
            return Err(error(path, "Expected FlatBuffer vector"));
        };
        let (item_size, item_align, _) = layout(&self.declarations, item_type, 0)?;
        let data_align = item_align.max(4);
        let start = align(
            self.bytes
                .len()
                .checked_add(4)
                .ok_or_else(|| error(path, "Vector overflow"))?,
            data_align,
        )
        .and_then(|n| n.checked_sub(4))
        .ok_or_else(|| error(path, "Vector alignment overflow"))?;
        let vector_length = item_size
            .checked_mul(items.len())
            .and_then(|n| n.checked_add(4))
            .and_then(|n| start.checked_add(n))
            .ok_or_else(|| error(path, "Vector too large"))?;
        self.resize(vector_length, path)?;
        self.patch_u32(
            start,
            u32::try_from(items.len()).map_err(|_| error(path, "Vector too large"))?,
        );
        let is_pointer = item_type == "string"
            || declaration(&self.declarations, item_type).is_some_and(|d| d.kind == "table")
            || (item_type.starts_with('[') && item_type.ends_with(']'));
        for (i, item) in items.iter().enumerate() {
            let at = start + 4 + i * item_size;
            let item_path = format!("{path}/{i}");
            if is_pointer {
                let target = self.value(item_type, item, depth + 1, &item_path, ctx)?;
                self.patch_offset(at, target, path)?;
            } else {
                self.inline(item_type, item, at, depth + 1, &item_path, ctx)?;
            }
        }
        Ok(start)
    }
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned bounded inspection of captured Arrow IPC framing and footer agreement.
use crate::serialization::{self, Format};
use crate::{
    arrow_flatbuffer_binary, arrow_flatbuffer_model,
    arrow_ipc_capture::{self, ArrowIpcResources},
    context::Context,
    error::EngineError,
    value::{copy_json, Utf16, Value},
};
use base64::{engine::general_purpose::STANDARD, Engine as _};

const INVENTORY: &str = include_str!("../../../spec/extensions/arrow/flatbuffer-inventory.json");

fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn string(s: &str) -> Value {
    Value::string_utf8(s)
}
fn number(n: usize) -> Value {
    Value::Number(n as f64)
}
fn align(value: usize, alignment: usize) -> Option<usize> {
    value
        .checked_add(alignment.checked_sub(1)?)
        .map(|v| v / alignment * alignment)
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
fn text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(s) => s.to_utf8().ok(),
        _ => None,
    }
}
fn diagnostic(code: &str, path: &str, message: &str, severity: &str) -> Value {
    object(vec![
        ("code", string(code)),
        ("path", string(path)),
        ("severity", string(severity)),
        ("message", string(message)),
    ])
}
fn error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn set_field(value: &mut Value, name: &str, replacement: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(error("ARROW_IPC_SCHEMA", "Expected Arrow schema object"));
    };
    if let Some((_, child)) = fields
        .iter_mut()
        .find(|(field_key, _)| field_key == &key(name))
    {
        *child = replacement;
    } else {
        fields.push((key(name), replacement));
    }
    Ok(())
}
fn nullish(value: Option<&Value>) -> bool {
    matches!(value, None | Some(Value::Null))
}
fn normalized_arrow_schema(
    input: &Value,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if depth > ctx.limits().max_depth {
        return Err(error(
            "RESOURCE_LIMIT",
            "Arrow schema normalization depth exceeded",
        ));
    }
    let mut schema = copy_json(input, ctx)?;
    if nullish(field(&schema, "metadata")) {
        set_field(&mut schema, "metadata", Value::Array(Vec::new()))?;
    }
    let fields = array(
        field(&schema, "fields")
            .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Arrow fields are required"))?,
    )
    .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Arrow fields must be an array"))?;
    let mut normalized_fields = Vec::with_capacity(fields.len());
    for field_value in fields {
        normalized_fields.push(normalized_arrow_field(field_value, ctx, depth + 1)?);
    }
    set_field(&mut schema, "fields", Value::Array(normalized_fields))?;
    Ok(schema)
}
fn normalized_arrow_field(
    input: &Value,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if depth > ctx.limits().max_depth {
        return Err(error(
            "RESOURCE_LIMIT",
            "Arrow field normalization depth exceeded",
        ));
    }
    let mut field_value = copy_json(input, ctx)?;
    if nullish(field(&field_value, "metadata")) {
        set_field(&mut field_value, "metadata", Value::Array(Vec::new()))?;
    }
    if nullish(field(&field_value, "children")) {
        set_field(&mut field_value, "children", Value::Array(Vec::new()))?;
    }
    let children = array(
        field(&field_value, "children")
            .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Arrow children are required"))?,
    )
    .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Arrow children must be an array"))?;
    let mut normalized_children = Vec::with_capacity(children.len());
    for child in children {
        normalized_children.push(normalized_arrow_field(child, ctx, depth + 1)?);
    }
    set_field(
        &mut field_value,
        "children",
        Value::Array(normalized_children),
    )?;
    let mut type_value = copy_json(
        field(&field_value, "type")
            .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Arrow field type is required"))?,
        ctx,
    )?;
    let type_name = text(field(&type_value, "name"))
        .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Arrow field type name is required"))?;
    if matches!(type_name.as_str(), "struct" | "NONE") {
        set_field(
            &mut type_value,
            "name",
            string(if type_name == "struct" {
                "struct_"
            } else {
                "null"
            }),
        )?;
    }
    match type_name.as_str() {
        "decimal" if nullish(field(&type_value, "bitWidth")) => {
            set_field(&mut type_value, "bitWidth", number(128))?
        }
        "timestamp" if nullish(field(&type_value, "timezone")) => {
            set_field(&mut type_value, "timezone", string(""))?
        }
        "map" if nullish(field(&type_value, "keysSorted")) => {
            set_field(&mut type_value, "keysSorted", Value::Bool(false))?
        }
        _ => {}
    }
    set_field(&mut field_value, "type", type_value)?;
    if let Some(Value::Object(_)) = field(&field_value, "dictionary") {
        let mut dictionary = copy_json(field(&field_value, "dictionary").unwrap(), ctx)?;
        if nullish(field(&dictionary, "indexType")) {
            set_field(
                &mut dictionary,
                "indexType",
                object(vec![
                    ("name", string("int")),
                    ("bitWidth", number(32)),
                    ("isSigned", Value::Bool(true)),
                ]),
            )?;
        }
        if nullish(field(&dictionary, "isOrdered")) {
            set_field(&mut dictionary, "isOrdered", Value::Bool(false))?;
        }
        set_field(&mut field_value, "dictionary", dictionary)?;
    }
    Ok(field_value)
}
fn sorted_json(value: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if depth > ctx.limits().max_depth {
        return Err(error(
            "RESOURCE_LIMIT",
            "Arrow schema comparison depth exceeded",
        ));
    }
    match value {
        Value::Array(values) => {
            let mut out = Vec::with_capacity(values.len());
            for child in values {
                out.push(sorted_json(child, ctx, depth + 1)?);
            }
            Ok(Value::Array(out))
        }
        Value::Object(fields) => {
            let mut sorted = fields.iter().collect::<Vec<_>>();
            sorted.sort_by(|a, b| a.0.cmp(&b.0));
            let mut out = Vec::with_capacity(sorted.len());
            for (name, child) in sorted {
                out.push((name.clone(), sorted_json(child, ctx, depth + 1)?));
            }
            Ok(Value::Object(out))
        }
        _ => copy_json(value, ctx),
    }
}
pub fn prepare_arrow_schema_ipc(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let resources = crate::arrow_schema::ArrowSchemaResources::new(ctx)?;
    let checked = crate::arrow_schema::inspect_arrow(document, &resources, ctx)?;
    if !checked.valid {
        return Err(error("ARROW_DOCUMENT", "Invalid Arrow schema"));
    }
    if checked.diagnostics.iter().any(|d| {
        matches!(
            d.code.to_utf8().ok().as_deref(),
            Some(
                "ARROW_UNKNOWN"
                    | "ARROW_UNKNOWN_TYPE"
                    | "ARROW_DUPLICATE_METADATA"
                    | "ARROW_REPRESENTATION"
            )
        )
    }) {
        return Err(error(
            "ARROW_IPC_LOSS",
            "Unknown content or duplicate metadata cannot be silently discarded by native IPC conversion",
        ));
    }
    let schema = crate::arrow_schema::export_arrow_schema(document, &resources, ctx)?;
    let schema_value = serialization::read_json_value(schema.units(), Format::Json, ctx)?;
    let normalized = normalized_arrow_schema(&schema_value, ctx, 0)?;
    let flatbuffer = flatbuffer_schema_value(&normalized, ctx)?;
    let message = object(vec![
        ("rootType", string("Message")),
        (
            "value",
            object(vec![
                ("version", string("V5")),
                (
                    "header",
                    object(vec![("type", string("Schema")), ("value", flatbuffer)]),
                ),
                ("bodyLength", string("0")),
            ]),
        ),
    ]);
    let flatbuffer_json = serialization::write_json_value(&message, Format::Json, ctx)?;
    Ok(object(vec![
        ("schema", Value::String(schema)),
        ("flatbufferModel", Value::String(flatbuffer_json)),
    ]))
}

fn flatbuffer_schema_value(schema: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let fields = array(
        field(schema, "fields")
            .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Arrow fields are required"))?,
    )
    .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Arrow fields must be an array"))?;
    let mut encoded_fields = Vec::with_capacity(fields.len());
    for (i, field) in fields.iter().enumerate() {
        encoded_fields.push(flatbuffer_field_value(
            field,
            ctx,
            &format!("/fields/{i}"),
            1,
        )?);
    }
    let mut result = vec![
        (key("endianness"), string("Little")),
        (key("fields"), Value::Array(encoded_fields)),
    ];
    if let Some(metadata) = field(schema, "metadata") {
        result.push((
            key("custom_metadata"),
            flatbuffer_metadata(metadata, ctx, "/metadata")?,
        ));
    }
    if let Some(features) = field(schema, "features") {
        result.push((key("features"), copy_json(features, ctx)?));
    }
    Ok(Value::Object(result))
}

fn flatbuffer_metadata(
    value: &Value,
    ctx: &mut Context<'_>,
    path: &str,
) -> Result<Value, EngineError> {
    let entries =
        array(value).ok_or_else(|| error("ARROW_IPC_SCHEMA", "Metadata must be an array"))?;
    let mut out = Vec::with_capacity(entries.len());
    for (i, entry) in entries.iter().enumerate() {
        ctx.charge_work(1, Utf16::from(format!("{path}/{i}")))?;
        out.push(object(vec![
            (
                "key",
                copy_json(
                    field(entry, "key")
                        .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Metadata key is required"))?,
                    ctx,
                )?,
            ),
            (
                "value",
                copy_json(
                    field(entry, "value")
                        .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Metadata value is required"))?,
                    ctx,
                )?,
            ),
        ]));
    }
    Ok(Value::Array(out))
}

fn flatbuffer_field_value(
    value: &Value,
    ctx: &mut Context<'_>,
    path: &str,
    depth: usize,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::from(path))?;
    if depth > ctx.limits().max_depth {
        return Err(error(
            "RESOURCE_LIMIT",
            "Arrow field mapping depth exceeded",
        ));
    }
    let name = copy_json(
        field(value, "name").ok_or_else(|| error("ARROW_IPC_SCHEMA", "Field name is required"))?,
        ctx,
    )?;
    let nullable = copy_json(
        field(value, "nullable")
            .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Field nullability is required"))?,
        ctx,
    )?;
    let native_type =
        field(value, "type").ok_or_else(|| error("ARROW_IPC_SCHEMA", "Field type is required"))?;
    let type_name = text(field(native_type, "name"))
        .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Field type name is required"))?;
    let (variant, payload) =
        flatbuffer_type_value(&type_name, native_type, ctx, &format!("{path}/type"))?;
    let children = array(
        field(value, "children")
            .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Field children are required"))?,
    )
    .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Field children must be an array"))?;
    let mut mapped_children = Vec::with_capacity(children.len());
    for (i, child) in children.iter().enumerate() {
        mapped_children.push(flatbuffer_field_value(
            child,
            ctx,
            &format!("{path}/children/{i}"),
            depth + 1,
        )?);
    }
    let mut out = vec![
        ("name", name),
        ("nullable", nullable),
        (
            "type",
            object(vec![("type", string(&variant)), ("value", payload)]),
        ),
        ("children", Value::Array(mapped_children)),
    ];
    if let Some(metadata) = field(value, "metadata") {
        out.push((
            "custom_metadata",
            flatbuffer_metadata(metadata, ctx, &format!("{path}/metadata"))?,
        ));
    }
    if let Some(dictionary) = field(value, "dictionary") {
        let id = copy_json(
            field(dictionary, "id")
                .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Dictionary ID is required"))?,
            ctx,
        )?;
        let index = field(dictionary, "indexType")
            .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Dictionary index type is required"))?;
        let width = copy_json(
            field(index, "bitWidth")
                .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Dictionary index width is required"))?,
            ctx,
        )?;
        let signed = copy_json(
            field(index, "isSigned")
                .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Dictionary signedness is required"))?,
            ctx,
        )?;
        let ordered = copy_json(
            field(dictionary, "isOrdered")
                .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Dictionary ordering is required"))?,
            ctx,
        )?;
        out.push((
            "dictionary",
            object(vec![
                ("id", id),
                (
                    "indexType",
                    object(vec![("bitWidth", width), ("is_signed", signed)]),
                ),
                ("isOrdered", ordered),
                ("dictionaryKind", string("DenseArray")),
            ]),
        ));
    }
    Ok(object(out))
}

fn flatbuffer_type_value(
    name: &str,
    value: &Value,
    ctx: &mut Context<'_>,
    path: &str,
) -> Result<(String, Value), EngineError> {
    let simple = match name {
        "null" => Some(("Null", vec![])),
        "bool" => Some(("Bool", vec![])),
        "binary" => Some(("Binary", vec![])),
        "largebinary" => Some(("LargeBinary", vec![])),
        "binaryview" => Some(("BinaryView", vec![])),
        "utf8" => Some(("Utf8", vec![])),
        "largeutf8" => Some(("LargeUtf8", vec![])),
        "utf8view" => Some(("Utf8View", vec![])),
        "list" => Some(("List", vec![])),
        "largelist" => Some(("LargeList", vec![])),
        "listview" => Some(("ListView", vec![])),
        "largelistview" => Some(("LargeListView", vec![])),
        "struct" | "struct_" => Some(("Struct_", vec![])),
        "runendencoded" => Some(("RunEndEncoded", vec![])),
        _ => None,
    };
    if let Some((variant, fields)) = simple {
        return Ok((variant.to_string(), object(fields)));
    }
    let mut required = |field_name: &str| -> Result<Value, EngineError> {
        copy_json(
            field(value, field_name).ok_or_else(|| {
                error(
                    "ARROW_IPC_SCHEMA",
                    &format!("{field_name} is required for {name}"),
                )
            })?,
            ctx,
        )
    };
    let result = match name {
        "int" => (
            "Int",
            object(vec![
                ("bitWidth", required("bitWidth")?),
                ("is_signed", required("isSigned")?),
            ]),
        ),
        "floatingpoint" => (
            "FloatingPoint",
            object(vec![("precision", required("precision")?)]),
        ),
        "decimal" => (
            "Decimal",
            object(vec![
                ("precision", required("precision")?),
                ("scale", required("scale")?),
                ("bitWidth", required("bitWidth")?),
            ]),
        ),
        "date" => ("Date", object(vec![("unit", required("unit")?)])),
        "time" => (
            "Time",
            object(vec![
                ("unit", required("unit")?),
                ("bitWidth", required("bitWidth")?),
            ]),
        ),
        "timestamp" => (
            "Timestamp",
            object(vec![
                ("unit", required("unit")?),
                ("timezone", required("timezone")?),
            ]),
        ),
        "duration" => ("Duration", object(vec![("unit", required("unit")?)])),
        "interval" => ("Interval", object(vec![("unit", required("unit")?)])),
        "fixedsizebinary" => (
            "FixedSizeBinary",
            object(vec![("byteWidth", required("byteWidth")?)]),
        ),
        "fixedsizelist" => (
            "FixedSizeList",
            object(vec![("listSize", required("listSize")?)]),
        ),
        "map" => ("Map", object(vec![("keysSorted", required("keysSorted")?)])),
        "union" => {
            let mode_value = required("mode")?;
            let mode = text(Some(&mode_value))
                .ok_or_else(|| error("ARROW_IPC_SCHEMA", "Union mode must be text"))?;
            let mode = match mode.as_str() {
                "SPARSE" | "Sparse" => "Sparse",
                "DENSE" | "Dense" => "Dense",
                _ => return Err(error("ARROW_IPC_SCHEMA", "Unknown Arrow union mode")),
            };
            (
                "Union",
                object(vec![
                    ("mode", string(mode)),
                    ("typeIds", required("typeIds")?),
                ]),
            )
        }
        _ => {
            return Err(EngineError::new(
                "ARROW_IPC_SCHEMA",
                Utf16::from(path),
                "Arrow type has no pinned FlatBuffer mapping",
            ))
        }
    };
    Ok((result.0.to_string(), result.1))
}

/// Emit the schema-only IPC stream using the pinned Rust FlatBuffer writer.
pub fn encode_arrow_schema_ipc_native(
    document: &Value,
    resources: &ArrowIpcResources,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let prepared = prepare_arrow_schema_ipc(document, ctx)?;
    let model_text = text(field(&prepared, "flatbufferModel"))
        .ok_or_else(|| error("ARROW_IPC_SCHEMA", "FlatBuffer model is unavailable"))?;
    let units = model_text.encode_utf16().collect::<Vec<_>>();
    let model = serialization::read_json_value(&units, Format::Json, ctx)?;
    let metadata = arrow_flatbuffer_binary::encode_arrow_flatbuffer_native(&model, ctx)?;
    let padded_length = align(metadata.len(), 8)
        .ok_or_else(|| error("ARROW_IPC_BYTES", "Metadata length overflow"))?;
    let output_length = padded_length
        .checked_add(16)
        .filter(|length| *length <= arrow_ipc_capture::MAX_BYTES)
        .ok_or_else(|| error("ARROW_IPC_LIMIT", "Expected bounded Arrow IPC bytes"))?;
    ctx.charge_work(output_length, Utf16::default())?;
    let mut output = Vec::with_capacity(output_length);
    output.extend_from_slice(&u32::MAX.to_le_bytes());
    output.extend_from_slice(
        &u32::try_from(padded_length)
            .map_err(|_| error("ARROW_IPC_BYTES", "Metadata exceeds IPC framing limit"))?
            .to_le_bytes(),
    );
    output.extend_from_slice(&metadata);
    output.resize(8 + padded_length, 0);
    output.extend_from_slice(&u32::MAX.to_le_bytes());
    output.extend_from_slice(&0u32.to_le_bytes());
    if output.len() > arrow_ipc_capture::MAX_BYTES {
        return Err(error("ARROW_IPC_LIMIT", "Expected bounded Arrow IPC bytes"));
    }
    let id = Utf16::from("arrow-schema-ipc-native");
    let candidate = arrow_ipc_capture::capture_arrow_ipc(&output, &id, resources, ctx)?;
    let layout = inspect_arrow_ipc_layout(&candidate, resources, ctx)?;
    verify_first_schema_message(&model, &layout, &output, ctx)?;
    Ok(output)
}

fn verify_first_schema_message(
    expected: &Value,
    layout: &Value,
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if field(&layout, "format")
        .and_then(|v| text(Some(v)))
        .as_deref()
        != Some("stream")
        || field(&layout, "bytesAccountedFor") != Some(&Value::Bool(true))
    {
        return Err(error(
            "ARROW_IPC_DECODE_LOSS",
            "Native schema IPC framing is incomplete",
        ));
    }
    if field(&layout, "diagnostics")
        .and_then(array)
        .unwrap_or(&[])
        .iter()
        .any(|d| text(field(d, "severity")).as_deref() == Some("error"))
    {
        return Err(error(
            "ARROW_IPC_DECODE_LOSS",
            "Native schema IPC framing contains errors",
        ));
    }
    let first = field(&layout, "frames")
        .and_then(array)
        .and_then(|frames| frames.first())
        .ok_or_else(|| error("ARROW_IPC_DECODE_LOSS", "Schema message is unavailable"))?;
    let start = field(first, "metadataOffset")
        .and_then(|v| match v {
            Value::Number(n) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 => Some(*n as usize),
            _ => None,
        })
        .ok_or_else(|| {
            error(
                "ARROW_IPC_DECODE_LOSS",
                "Schema metadata offset is unavailable",
            )
        })?;
    let length = field(first, "metadataLength")
        .and_then(|v| match v {
            Value::Number(n) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 => Some(*n as usize),
            _ => None,
        })
        .ok_or_else(|| {
            error(
                "ARROW_IPC_DECODE_LOSS",
                "Schema metadata length is unavailable",
            )
        })?;
    let end = start
        .checked_add(length)
        .filter(|end| *end <= bytes.len())
        .ok_or_else(|| error("ARROW_IPC_DECODE_LOSS", "Schema metadata is out of bounds"))?;
    arrow_flatbuffer_binary::verify_encoded_bytes(expected, &bytes[start..end], ctx)
}

pub fn complete_arrow_schema_ipc(
    document: &Value,
    before_json: &Utf16,
    after_json: &Utf16,
    bytes_hex: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let bytes_text = bytes_hex.to_utf8().map_err(|_| {
        error(
            "ARROW_IPC_BYTES",
            "Expected bounded native schema IPC bytes",
        )
    })?;
    if bytes_text.is_empty()
        || bytes_text.len() > 2_000_000
        || bytes_text.len() % 2 != 0
        || !bytes_text
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(error(
            "ARROW_IPC_BYTES",
            "Expected bounded native schema IPC bytes",
        ));
    }
    ctx.charge_work(bytes_text.len(), Utf16::default())?;
    let resources = crate::arrow_schema::ArrowSchemaResources::new(ctx)?;
    let expected_text = crate::arrow_schema::export_arrow_schema(document, &resources, ctx)?;
    let expected_schema = serialization::read_json_value(expected_text.units(), Format::Json, ctx)?;
    let before = serialization::read_json_value(before_json.units(), Format::Json, ctx)?;
    let after = serialization::read_json_value(after_json.units(), Format::Json, ctx)?;
    let normalized_expected = normalized_arrow_schema(&expected_schema, ctx, 0)?;
    let expected = sorted_json(&normalized_expected, ctx, 0)?;
    let before = sorted_json(&normalized_arrow_schema(&before, ctx, 0)?, ctx, 0)?;
    let after = sorted_json(&normalized_arrow_schema(&after, ctx, 0)?, ctx, 0)?;
    if before != expected {
        return Err(error(
            "ARROW_IPC_DECODE_LOSS",
            "Native schema decoding changed captured semantics",
        ));
    }
    if after != expected {
        return Err(error(
            "ARROW_IPC_ROUND_TRIP",
            "Native IPC re-read changed captured semantics",
        ));
    }
    let schema = flatbuffer_schema_value(&normalized_expected, ctx)?;
    let expected_message = object(vec![
        ("rootType", string("Message")),
        (
            "value",
            object(vec![
                ("version", string("V5")),
                (
                    "header",
                    object(vec![("type", string("Schema")), ("value", schema)]),
                ),
                ("bodyLength", string("0")),
            ]),
        ),
    ]);
    let text = bytes_text;
    let bytes = text
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let nibble = |b: u8| if b <= b'9' { b - b'0' } else { b - b'a' + 10 };
            (nibble(pair[0]) << 4) | nibble(pair[1])
        })
        .collect::<Vec<_>>();
    let ipc_resources = ArrowIpcResources::new(ctx)?;
    let candidate = arrow_ipc_capture::capture_arrow_ipc(
        &bytes,
        &Utf16::from("arrow-schema-ipc-complete"),
        &ipc_resources,
        ctx,
    )?;
    let layout = inspect_arrow_ipc_layout(&candidate, &ipc_resources, ctx)?;
    verify_first_schema_message_logical(&expected_message, &layout, &bytes, ctx)?;
    Ok(Value::String(bytes_hex.clone()))
}

/// Verify explicit backend bytes against the logical FlatBuffer message. Unlike the
/// native writer path, an external Arrow encoder is not required to preserve the
/// same physical presence of default-valued vtable fields.
fn verify_first_schema_message_logical(
    expected: &Value,
    layout: &Value,
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if field(layout, "format")
        .and_then(|v| text(Some(v)))
        .as_deref()
        != Some("stream")
        || field(layout, "bytesAccountedFor") != Some(&Value::Bool(true))
    {
        return Err(error(
            "ARROW_IPC_DECODE_LOSS",
            "Native schema IPC framing is incomplete",
        ));
    }
    for diagnostic in field(layout, "diagnostics").and_then(array).unwrap_or(&[]) {
        ctx.charge_work(1, Utf16::default())?;
        let code = text(field(diagnostic, "code"));
        let severity = text(field(diagnostic, "severity"));
        let scope_warning = severity.as_deref() == Some("warning")
            && matches!(
                code.as_deref(),
                Some("ARROW_FLATBUFFER_INCOMPLETE" | "ARROW_IPC_SEMANTICS_UNVERIFIED")
            );
        if !scope_warning {
            return Err(error(
                "ARROW_IPC_DECODE_LOSS",
                "Native schema IPC framing contains unsupported metadata",
            ));
        }
    }
    let first = field(layout, "frames")
        .and_then(array)
        .and_then(|frames| frames.first())
        .ok_or_else(|| error("ARROW_IPC_DECODE_LOSS", "Schema message is unavailable"))?;
    if text(field(first, "kind")).as_deref() != Some("Schema") {
        return Err(error(
            "ARROW_IPC_DECODE_LOSS",
            "Expected an Arrow schema message",
        ));
    }
    let start = field(first, "metadataOffset")
        .and_then(|value| match value {
            Value::Number(number)
                if number.is_finite() && *number >= 0.0 && number.fract() == 0.0 =>
            {
                Some(*number as usize)
            }
            _ => None,
        })
        .ok_or_else(|| {
            error(
                "ARROW_IPC_DECODE_LOSS",
                "Schema metadata offset is unavailable",
            )
        })?;
    let length = field(first, "metadataLength")
        .and_then(|value| match value {
            Value::Number(number)
                if number.is_finite() && *number >= 0.0 && number.fract() == 0.0 =>
            {
                Some(*number as usize)
            }
            _ => None,
        })
        .ok_or_else(|| {
            error(
                "ARROW_IPC_DECODE_LOSS",
                "Schema metadata length is unavailable",
            )
        })?;
    if start
        .checked_add(length)
        .map_or(true, |end| end > bytes.len())
    {
        return Err(error(
            "ARROW_IPC_DECODE_LOSS",
            "Schema metadata is out of bounds",
        ));
    }
    let decoded_document = field(first, "metadata").ok_or_else(|| {
        error(
            "ARROW_IPC_DECODE_LOSS",
            "Decoded schema metadata is unavailable",
        )
    })?;
    let decoded = metadata_value(decoded_document).ok_or_else(|| {
        error(
            "ARROW_IPC_DECODE_LOSS",
            "Decoded schema model is unavailable",
        )
    })?;
    let expected_value = field(expected, "value").ok_or_else(|| {
        error(
            "ARROW_IPC_DECODE_LOSS",
            "Expected schema model is unavailable",
        )
    })?;
    let inventory = serialization::read_json_value(
        &INVENTORY.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )?;
    let declarations = field(&inventory, "definitions")
        .and_then(array)
        .unwrap_or(&[]);
    let expected_logical = normalized(expected_value, "Message", declarations, ctx, 0)?;
    let decoded_logical = normalized(decoded, "Message", declarations, ctx, 0)?;
    if !arrow_flatbuffer_binary::equivalent_metered(&expected_logical, &decoded_logical, ctx, 0)? {
        return Err(error(
            "ARROW_IPC_DECODE_LOSS",
            "Native schema decoding changed captured logical metadata",
        ));
    }
    Ok(())
}

fn set_path_name(
    root: &mut Value,
    path: &[usize],
    name: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut current = root;
    for (depth, index) in path.iter().enumerate() {
        let path_context = Utf16::from(format!("/fieldPath/{depth}"));
        ctx.charge_work(1, path_context.clone())?;
        let fields = match current {
            Value::Array(fields) => fields,
            Value::Object(_) => {
                let Some(fields) = field(current, "fields") else {
                    return Err(error("ARROW_IPC_RENAME_PATH", "Field path does not exist"));
                };
                let Value::Array(fields) = fields else {
                    return Err(error("ARROW_IPC_RENAME_PATH", "Field path does not exist"));
                };
                fields
            }
            _ => return Err(error("ARROW_IPC_RENAME_PATH", "Field path does not exist")),
        };
        ctx.charge_work(fields.len(), path_context.clone())?;
        let selected = fields
            .get(*index)
            .ok_or_else(|| error("ARROW_IPC_RENAME_PATH", "Field path does not exist"))?;
        if depth + 1 == path.len() {
            for (sibling_index, sibling) in fields.iter().enumerate() {
                ctx.charge_work(
                    1,
                    Utf16::from(format!("/fieldPath/{depth}/siblings/{sibling_index}")),
                )?;
                if let Some(Value::String(existing)) = field(sibling, "name") {
                    ctx.charge_work(existing.units().len(), path_context.clone())?;
                    ctx.charge_work(name.units().len(), path_context.clone())?;
                    if sibling_index != *index && existing == name {
                        return Err(error(
                            "ARROW_IPC_RENAME_PATH",
                            "Arrow sibling name collision",
                        ));
                    }
                }
            }
            let fields = match current {
                Value::Array(fields) => fields,
                Value::Object(_) => {
                    let fields = field_mut(current, "fields").ok_or_else(|| {
                        error("ARROW_IPC_RENAME_PATH", "Field path does not exist")
                    })?;
                    let Value::Array(fields) = fields else {
                        return Err(error("ARROW_IPC_RENAME_PATH", "Field path does not exist"));
                    };
                    fields
                }
                _ => return Err(error("ARROW_IPC_RENAME_PATH", "Field path does not exist")),
            };
            let selected = fields
                .get_mut(*index)
                .ok_or_else(|| error("ARROW_IPC_RENAME_PATH", "Field path does not exist"))?;
            if let Some(value) = field_mut(selected, "name") {
                *value = Value::String(name.clone());
            } else if let Value::Object(properties) = selected {
                properties.push((key("name"), Value::String(name.clone())));
            } else {
                return Err(error("ARROW_IPC_RENAME_PATH", "Field path does not exist"));
            }
        } else {
            let _ = selected;
            let fields = match current {
                Value::Array(fields) => fields,
                Value::Object(_) => {
                    let fields = field_mut(current, "fields").ok_or_else(|| {
                        error("ARROW_IPC_RENAME_PATH", "Field path does not exist")
                    })?;
                    let Value::Array(fields) = fields else {
                        return Err(error("ARROW_IPC_RENAME_PATH", "Field path does not exist"));
                    };
                    fields
                }
                _ => return Err(error("ARROW_IPC_RENAME_PATH", "Field path does not exist")),
            };
            let selected = fields
                .get_mut(*index)
                .ok_or_else(|| error("ARROW_IPC_RENAME_PATH", "Field path does not exist"))?;
            current = field_mut(selected, "children")
                .ok_or_else(|| error("ARROW_IPC_RENAME_PATH", "Field path does not exist"))?;
            if !matches!(current, Value::Array(_)) {
                return Err(error("ARROW_IPC_RENAME_PATH", "Field path does not exist"));
            }
        }
    }
    Ok(())
}
fn rename_flatbuffer_model(
    model: &mut Value,
    path: &[usize],
    name: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(properties) = model else {
        return Err(error(
            "ARROW_IPC_RENAME_SCHEMA",
            "Expected FlatBuffer model",
        ));
    };
    let payload = properties
        .iter_mut()
        .find(|(k, _)| k == &key("value"))
        .map(|(_, v)| v)
        .ok_or_else(|| error("ARROW_IPC_RENAME_SCHEMA", "Expected FlatBuffer root value"))?;
    let root = match payload {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(k, _)| k == &key("header"))
            .map(|(_, v)| v)
            .ok_or_else(|| error("ARROW_IPC_RENAME_SCHEMA", "Expected schema header"))?,
        _ => return Err(error("ARROW_IPC_RENAME_SCHEMA", "Expected schema header")),
    };
    let root_value = match root {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(k, _)| k == &key("value"))
            .map(|(_, v)| v)
            .ok_or_else(|| error("ARROW_IPC_RENAME_SCHEMA", "Expected schema value"))?,
        _ => return Err(error("ARROW_IPC_RENAME_SCHEMA", "Expected schema value")),
    };
    set_path_name(root_value, path, name, ctx)
}
fn rename_footer_model(
    model: &mut Value,
    path: &[usize],
    name: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(properties) = model else {
        return Err(error(
            "ARROW_IPC_RENAME_SCHEMA",
            "Expected FlatBuffer footer",
        ));
    };
    let payload = properties
        .iter_mut()
        .find(|(k, _)| k == &key("value"))
        .map(|(_, v)| v)
        .ok_or_else(|| error("ARROW_IPC_RENAME_SCHEMA", "Expected footer value"))?;
    let schema = match payload {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(k, _)| k == &key("schema"))
            .map(|(_, v)| v)
            .ok_or_else(|| error("ARROW_IPC_RENAME_SCHEMA", "Expected footer schema"))?,
        _ => return Err(error("ARROW_IPC_RENAME_SCHEMA", "Expected footer schema")),
    };
    set_path_name(schema, path, name, ctx)
}
fn parse_rename_request(
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Vec<usize>, Utf16), EngineError> {
    let path = array(field(request, "fieldPath").ok_or_else(|| {
        error(
            "ARROW_IPC_RENAME_PATH",
            "Expected bounded positional field path",
        )
    })?)
    .ok_or_else(|| {
        error(
            "ARROW_IPC_RENAME_PATH",
            "Expected bounded positional field path",
        )
    })?;
    if path.is_empty() || path.len() > 128 {
        return Err(error(
            "ARROW_IPC_RENAME_PATH",
            "Expected bounded positional field path",
        ));
    }
    let mut indexes = Vec::with_capacity(path.len());
    for (i, part) in path.iter().enumerate() {
        ctx.charge_work(1, Utf16::from(format!("/fieldPath/{i}")))?;
        match part {
            Value::Number(n)
                if n.is_finite()
                    && *n >= 0.0
                    && n.fract() == 0.0
                    && *n <= 9_007_199_254_740_991.0 =>
            {
                indexes.push(*n as usize)
            }
            _ => {
                return Err(error(
                    "ARROW_IPC_RENAME_PATH",
                    "Expected bounded positional field path",
                ))
            }
        }
    }
    let name = match field(request, "name") {
        Some(Value::String(name)) => name.clone(),
        _ => return Err(error("ARROW_IPC_RENAME_PATH", "Expected string field name")),
    };
    if text(field(request, "uninterpretedMetadata")).as_deref() != Some("preserve-and-report") {
        return Err(error(
            "ARROW_IPC_RENAME_POLICY",
            "Explicit preserve-and-report metadata policy is required",
        ));
    }
    Ok((indexes, name))
}
fn schema_model_from_report(
    report: &Value,
    root: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    // Layout frame/footer metadata already contains the decoded model document;
    // decoder reports wrap the same document in `model`.
    let model = field(report, "model").unwrap_or(report);
    let json = crate::arrow_flatbuffer_model::export_arrow_flatbuffer_model(model, ctx)?;
    let parsed = serialization::read_json_value(json.units(), Format::Json, ctx)?;
    if text(field(&parsed, "rootType")).as_deref() != Some(root) {
        return Err(error(
            "ARROW_IPC_RENAME_SCHEMA",
            "Unexpected Arrow IPC metadata root",
        ));
    }
    Ok(parsed)
}
pub fn prepare_arrow_ipc_rename(
    document: &Value,
    request: &Value,
    resources: &ArrowIpcResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (path, name) = parse_rename_request(request, ctx)?;
    let consistency = inspect_arrow_ipc_consistency(document, resources, ctx)?;
    let layout = field(&consistency, "layout").ok_or_else(|| {
        error(
            "ARROW_IPC_RENAME_SOURCE",
            "Complete known framing and matching footer declarations are required",
        )
    })?;
    let frames = field(layout, "frames").and_then(array).ok_or_else(|| {
        error(
            "ARROW_IPC_RENAME_SOURCE",
            "Complete known framing and matching footer declarations are required",
        )
    })?;
    if field(layout, "bytesAccountedFor") != Some(&Value::Bool(true))
        || !["matched", "not-applicable"].contains(
            &text(field(&consistency, "footerChecks"))
                .as_deref()
                .unwrap_or(""),
        )
        || field(layout, "diagnostics")
            .and_then(array)
            .unwrap_or(&[])
            .iter()
            .any(|d| {
                text(field(d, "severity")).as_deref() == Some("error")
                    || text(field(d, "code")).as_deref() == Some("ARROW_FLATBUFFER_UNKNOWN_SLOT")
            })
    {
        return Err(error(
            "ARROW_IPC_RENAME_SOURCE",
            "Complete known framing and matching footer declarations are required",
        ));
    }
    if frames.is_empty() {
        return Err(error(
            "ARROW_IPC_RENAME_SOURCE",
            "Schema message is unavailable",
        ));
    }
    for frame in frames.iter().skip(1) {
        ctx.charge_work(1, Utf16::default())?;
        if !["RecordBatch", "DictionaryBatch"]
            .contains(&text(field(frame, "kind")).as_deref().unwrap_or(""))
        {
            return Err(error(
                "ARROW_IPC_RENAME_SOURCE",
                "Expected one body-free schema followed by record/dictionary batches",
            ));
        }
    }
    if field(&frames[0], "bodyLength") != Some(&Value::Number(0.0)) {
        return Err(error(
            "ARROW_IPC_RENAME_SOURCE",
            "Expected one body-free schema followed by record/dictionary batches",
        ));
    }
    let metadata = field(&frames[0], "metadata").ok_or_else(|| {
        error(
            "ARROW_IPC_RENAME_SCHEMA",
            "Schema message metadata is unavailable",
        )
    })?;
    let mut schema = schema_model_from_report(metadata, "Message", ctx)?;
    if text(field(
        field(field(&schema, "value").unwrap_or(&Value::Null), "header").unwrap_or(&Value::Null),
        "type",
    ))
    .as_deref()
        != Some("Schema")
    {
        return Err(error(
            "ARROW_IPC_RENAME_SOURCE",
            "Expected one body-free schema followed by record/dictionary batches",
        ));
    }
    rename_flatbuffer_model(&mut schema, &path, &name, ctx)?;
    let schema_text = serialization::write_json_value(&schema, Format::Json, ctx)?;
    let footer_text =
        if let Some(footer) = field(layout, "footer").and_then(|f| field(f, "metadata")) {
            let mut model = schema_model_from_report(footer, "Footer", ctx)?;
            rename_footer_model(&mut model, &path, &name, ctx)?;
            Some(serialization::write_json_value(&model, Format::Json, ctx)?)
        } else {
            None
        };
    Ok(object(vec![
        ("schemaModel", Value::String(schema_text)),
        (
            "footerModel",
            footer_text.map(Value::String).unwrap_or(Value::Null),
        ),
    ]))
}
pub fn prepare_arrow_ipc_rename_footer(
    document: &Value,
    request: &Value,
    schema_hex: &Utf16,
    resources: &ArrowIpcResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (path, name) = parse_rename_request(request, ctx)?;
    let layout = inspect_arrow_ipc_layout(document, resources, ctx)?;
    let footer = field(&layout, "footer").and_then(|f| field(f, "metadata"));
    let Some(footer) = footer else {
        return Ok(Value::Null);
    };
    let mut model = schema_model_from_report(footer, "Footer", ctx)?;
    rename_footer_model(&mut model, &path, &name, ctx)?;
    let schema_bytes = decode_hex(schema_hex)?;
    let frames = field(&layout, "frames").and_then(array).unwrap_or(&[]);
    let first = frames
        .first()
        .ok_or_else(|| error("ARROW_IPC_RENAME_SOURCE", "Schema message is unavailable"))?;
    let prefix = usize_field(first, "prefixLength")?;
    let padded = (schema_bytes.len() + prefix + 7) & !7;
    let new_frame_len = padded;
    let first_start = usize_field(first, "offset")?;
    let old_first_end =
        usize_field(first, "bodyOffset")?.saturating_add(usize_field(first, "bodyLength")?);
    let old_first_length = old_first_end.saturating_sub(first_start);
    let delta = new_frame_len as i128 - old_first_length as i128;
    for block_name in ["dictionaries", "recordBatches"] {
        if let Some(Value::Array(blocks)) =
            field_mut(&mut model, "value").and_then(|v| field_mut(v, block_name))
        {
            for (i, block) in blocks.iter_mut().enumerate() {
                ctx.charge_work(1, Utf16::from(format!("/footer/{block_name}/{i}/offset")))?;
                let value = field(block, "offset")
                    .ok_or_else(|| error("ARROW_IPC_RENAME_FOOTER", "Unknown block offset"))?;
                let old = match value {
                    Value::String(s) => s.to_utf8().ok().and_then(|s| s.parse::<i128>().ok()),
                    Value::Number(n) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 => {
                        Some(*n as i128)
                    }
                    _ => None,
                }
                .ok_or_else(|| error("ARROW_IPC_RENAME_FOOTER", "Unknown block offset"))?;
                let next = if old >= old_first_end as i128 {
                    old.checked_add(delta)
                } else {
                    Some(old)
                }
                .filter(|v| *v >= 0)
                .ok_or_else(|| error("ARROW_IPC_RENAME_FOOTER", "Unknown block offset"))?;
                set_field(
                    block,
                    "offset",
                    Value::String(Utf16::from(next.to_string())),
                )?;
            }
        }
    }
    Ok(Value::String(serialization::write_json_value(
        &model,
        Format::Json,
        ctx,
    )?))
}
fn decode_hex(value: &Utf16) -> Result<Vec<u8>, EngineError> {
    let text = value.to_utf8().map_err(|_| {
        error(
            "ARROW_IPC_BYTES",
            "Expected bounded lowercase hexadecimal bytes",
        )
    })?;
    if text.len() > 2_000_000
        || text.len() % 2 != 0
        || !text
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(error(
            "ARROW_IPC_BYTES",
            "Expected bounded lowercase hexadecimal bytes",
        ));
    }
    text.as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let n = |b: u8| if b <= b'9' { b - b'0' } else { b - b'a' + 10 };
            Ok((n(pair[0]) << 4) | n(pair[1]))
        })
        .collect()
}
fn usize_field(value: &Value, name: &str) -> Result<usize, EngineError> {
    match field(value, name) {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= usize::MAX as f64 =>
        {
            Ok(*n as usize)
        }
        _ => Err(error(
            "ARROW_IPC_RENAME_SOURCE",
            "Invalid IPC frame boundary",
        )),
    }
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

fn set_capture_extension(
    document: &mut Value,
    capture: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let modules = array(
        field(capture, "modules")
            .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing capture modules"))?,
    )
    .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Invalid capture modules"))?;
    let module = modules
        .first()
        .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing capture module"))?;
    let elements = array(
        field(module, "elements")
            .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing capture elements"))?,
    )
    .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Invalid capture elements"))?;
    let element = elements
        .first()
        .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing capture element"))?;
    let extension = field(
        field(element, "extensions")
            .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing capture extensions"))?,
        "umf.arrow.ipc",
    )
    .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing capture payload"))?;
    let replacement = copy_json(extension, ctx)?;
    let modules = match field_mut(document, "modules") {
        Some(Value::Array(values)) => values,
        _ => {
            return Err(error(
                "ARROW_IPC_RENAME_SOURCE",
                "Missing IPC source module",
            ))
        }
    };
    for module in modules {
        ctx.charge_work(1, Utf16::default())?;
        if text(field(module, "id")).as_deref() != Some("ipc") {
            continue;
        }
        let elements = match field_mut(module, "elements") {
            Some(Value::Array(values)) => values,
            _ => {
                return Err(error(
                    "ARROW_IPC_RENAME_SOURCE",
                    "Missing IPC source element",
                ))
            }
        };
        for element in elements {
            ctx.charge_work(1, Utf16::default())?;
            if text(field(element, "id")).as_deref() != Some("source") {
                continue;
            }
            let extensions = field_mut(element, "extensions")
                .ok_or_else(|| error("ARROW_IPC_RENAME_SOURCE", "Missing IPC source extensions"))?;
            let Value::Object(fields) = extensions else {
                return Err(error(
                    "ARROW_IPC_RENAME_SOURCE",
                    "Invalid IPC source extensions",
                ));
            };
            if let Some((_, value)) = fields.iter_mut().find(|(k, _)| k == &key("umf.arrow.ipc")) {
                *value = replacement;
            } else {
                fields.push((key("umf.arrow.ipc"), replacement));
            }
            return Ok(());
        }
    }
    Err(error(
        "ARROW_IPC_RENAME_SOURCE",
        "Missing IPC source element",
    ))
}

fn frame_metadata_bytes(encoded: &[u8], prefix: usize) -> Result<Vec<u8>, EngineError> {
    let padded = encoded
        .len()
        .checked_add(prefix)
        .and_then(|n| n.checked_add(7))
        .map(|n| n & !7)
        .and_then(|n| n.checked_sub(prefix))
        .ok_or_else(|| error("ARROW_IPC_LIMIT", "Renamed IPC exceeds capture limit"))?;
    let mut frame = vec![0u8; prefix + padded];
    if prefix == 8 {
        frame[..4].copy_from_slice(&(-1i32).to_le_bytes());
    }
    let length = i32::try_from(padded)
        .map_err(|_| error("ARROW_IPC_LIMIT", "Renamed IPC exceeds capture limit"))?;
    frame[prefix - 4..prefix].copy_from_slice(&length.to_le_bytes());
    frame[prefix..prefix + encoded.len()].copy_from_slice(encoded);
    Ok(frame)
}
fn hex_bytes(bytes: &[u8]) -> Utf16 {
    let mut text = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        text.push_str(&format!("{byte:02x}"));
    }
    Utf16::from(text)
}
pub fn complete_arrow_ipc_rename(
    document: &Value,
    request: &Value,
    schema_hex: &Utf16,
    footer_hex: &Value,
    resources: &ArrowIpcResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let _ = parse_rename_request(request, ctx)?;
    let schema_bytes = decode_hex(schema_hex)?;
    let prepared = prepare_arrow_ipc_rename(document, request, resources, ctx)?;
    let schema_text = text(field(&prepared, "schemaModel"))
        .ok_or_else(|| error("ARROW_IPC_RENAME_SCHEMA", "Schema model is unavailable"))?;
    let schema_model = serialization::read_json_value(
        &schema_text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )?;
    arrow_flatbuffer_binary::verify_encoded_bytes(&schema_model, &schema_bytes, ctx)?;
    let footer_model_text =
        prepare_arrow_ipc_rename_footer(document, request, schema_hex, resources, ctx)?;
    let footer_bytes = match (footer_model_text, footer_hex) {
        (Value::Null, Value::Null) => None,
        (Value::String(expected), Value::String(encoded)) => {
            let expected = serialization::read_json_value(expected.units(), Format::Json, ctx)?;
            let bytes = decode_hex(encoded)?;
            arrow_flatbuffer_binary::verify_encoded_bytes(&expected, &bytes, ctx)?;
            Some(bytes)
        }
        _ => {
            return Err(error(
                "ARROW_IPC_RENAME_FOOTER",
                "Encoded footer is required when renaming a file",
            ))
        }
    };
    let original = arrow_ipc_capture::export_arrow_ipc_capture(document, resources, ctx)?;
    let layout = inspect_arrow_ipc_layout(document, resources, ctx)?;
    let frames = field(&layout, "frames")
        .and_then(array)
        .ok_or_else(|| error("ARROW_IPC_RENAME_SOURCE", "IPC frame layout is unavailable"))?;
    let first = frames
        .first()
        .ok_or_else(|| error("ARROW_IPC_RENAME_SOURCE", "Schema message is unavailable"))?;
    let prefix = usize_field(first, "prefixLength")?;
    let schema_frame = frame_metadata_bytes(&schema_bytes, prefix)?;
    let mut output = Vec::new();
    let format = text(field(&layout, "format")).unwrap_or_default();
    if format == "file" {
        if original.len() < 8 {
            return Err(error(
                "ARROW_IPC_RENAME_SOURCE",
                "IPC file header is truncated",
            ));
        }
        output.extend_from_slice(&original[..8]);
    }
    for (index, frame) in frames.iter().enumerate() {
        ctx.charge_work(1, Utf16::from(format!("/frames/{index}")))?;
        let start = usize_field(frame, "offset")?;
        if index == 0 {
            output.extend_from_slice(&schema_frame);
        } else {
            let end = usize_field(frame, "bodyOffset")?
                .checked_add(usize_field(frame, "bodyLength")?)
                .ok_or_else(|| error("ARROW_IPC_RENAME_SOURCE", "Invalid IPC frame boundary"))?;
            if start > end || end > original.len() {
                return Err(error(
                    "ARROW_IPC_RENAME_SOURCE",
                    "Invalid IPC frame boundary",
                ));
            }
            output.extend_from_slice(&original[start..end]);
        }
    }
    let eos = field(&layout, "eosOffset").and_then(|v| match v {
        Value::Number(n) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 => Some(*n as usize),
        _ => None,
    });
    if let Some(eos) = eos {
        let end = if format == "file" {
            field(field(&layout, "footer").unwrap_or(&Value::Null), "offset")
                .and_then(|v| match v {
                    Value::Number(n) if *n >= 0.0 && n.fract() == 0.0 => Some(*n as usize),
                    _ => None,
                })
                .unwrap_or(original.len())
        } else {
            original.len()
        };
        if eos > end || end > original.len() {
            return Err(error("ARROW_IPC_RENAME_SOURCE", "Invalid IPC end marker"));
        }
        output.extend_from_slice(&original[eos..end]);
    }
    if let Some(footer_bytes) = footer_bytes {
        let length = i32::try_from(footer_bytes.len())
            .map_err(|_| error("ARROW_IPC_LIMIT", "Renamed IPC footer exceeds limit"))?;
        output.extend_from_slice(&footer_bytes);
        output.extend_from_slice(&length.to_le_bytes());
        output.extend_from_slice(b"ARROW1");
    }
    if output.len() > arrow_ipc_capture::MAX_BYTES {
        return Err(error(
            "ARROW_IPC_LIMIT",
            "Renamed IPC exceeds capture limit",
        ));
    }
    let source = copy_json(document, ctx)?;
    let id = match field(document, "id") {
        Some(Value::String(id)) => id.clone(),
        _ => {
            return Err(error(
                "ARROW_IPC_RENAME_SOURCE",
                "Source document id is unavailable",
            ))
        }
    };
    let captured = arrow_ipc_capture::capture_arrow_ipc(&output, &id, resources, ctx)?;
    let mut candidate = copy_json(document, ctx)?;
    set_capture_extension(&mut candidate, &captured, ctx)?;
    let validation = inspect_arrow_ipc_consistency(&candidate, resources, ctx)?;
    let out_layout = field(&validation, "layout").ok_or_else(|| {
        error(
            "ARROW_IPC_RENAME_RESULT",
            "Renamed IPC failed structural consistency checks",
        )
    })?;
    if field(out_layout, "bytesAccountedFor") != Some(&Value::Bool(true))
        || field(out_layout, "diagnostics")
            .and_then(array)
            .unwrap_or(&[])
            .iter()
            .any(|d| text(field(d, "severity")).as_deref() == Some("error"))
        || !["matched", "not-applicable"].contains(
            &text(field(&validation, "footerChecks"))
                .as_deref()
                .unwrap_or(""),
        )
    {
        return Err(error(
            "ARROW_IPC_RENAME_RESULT",
            "Renamed IPC failed structural consistency checks",
        ));
    }
    let output_frames = field(out_layout, "frames").and_then(array).unwrap_or(&[]);
    if output_frames.len() != frames.len() {
        return Err(error("ARROW_IPC_RENAME_RESULT", "Frame count changed"));
    }
    for i in 1..frames.len() {
        let a = &frames[i];
        let b = &output_frames[i];
        let start = usize_field(a, "offset")?;
        let end = usize_field(a, "bodyOffset")?
            .checked_add(usize_field(a, "bodyLength")?)
            .ok_or_else(|| error("ARROW_IPC_RENAME_RESULT", "Invalid IPC frame boundary"))?;
        let new_start = usize_field(b, "offset")?;
        let new_end = usize_field(b, "bodyOffset")?
            .checked_add(usize_field(b, "bodyLength")?)
            .ok_or_else(|| error("ARROW_IPC_RENAME_RESULT", "Invalid IPC frame boundary"))?;
        if original.get(start..end) != output.get(new_start..new_end) {
            return Err(error(
                "ARROW_IPC_RENAME_RESULT",
                "Record/dictionary message changed",
            ));
        }
    }
    Ok(object(vec![("source",source),("document",candidate),("complete",Value::Bool(false)),("bodyBytesPreserved",Value::Bool(true)),("validation",validation),("diagnostics",Value::Array(vec![diagnostic("ARROW_IPC_NAME_REFERENCES_UNVERIFIED","","Metadata and external references may still use the old field name; uninterpreted metadata was preserved without rewriting references","warning"),diagnostic("ARROW_IPC_DATA_UNVERIFIED","","Record/dictionary messages remain byte-identical; this does not establish their original semantic validity","warning")]))]))
}

fn magic(bytes: &[u8], offset: usize) -> bool {
    bytes.get(offset..offset.saturating_add(6)) == Some(b"ARROW1")
}
fn i32_at(bytes: &[u8], offset: usize, limit: usize) -> Result<i32, &'static str> {
    let end = offset
        .checked_add(4)
        .ok_or("Truncated or out-of-bounds IPC segment")?;
    if end > limit {
        return Err("Truncated or out-of-bounds IPC segment");
    }
    Ok(i32::from_le_bytes(
        bytes[offset..end]
            .try_into()
            .map_err(|_| "Truncated or out-of-bounds IPC segment")?,
    ))
}
fn bounded(offset: usize, length: usize, limit: usize) -> Result<(), &'static str> {
    if offset
        .checked_add(length)
        .filter(|end| *end <= limit)
        .is_none()
    {
        return Err("Truncated or out-of-bounds IPC segment");
    }
    Ok(())
}
fn capture_model<'a>(document: &'a Value) -> Result<&'a Value, EngineError> {
    let modules = array(
        field(document, "modules").ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing modules"))?,
    )
    .ok_or_else(|| error("ARROW_IPC_CAPTURE", "modules must be array"))?;
    let module = modules
        .iter()
        .find(|m| field(m, "id") == Some(&string("ipc")))
        .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing IPC module"))?;
    let elements = array(
        field(module, "elements").ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing elements"))?,
    )
    .ok_or_else(|| error("ARROW_IPC_CAPTURE", "elements must be array"))?;
    let element = elements
        .iter()
        .find(|e| field(e, "id") == Some(&string("source")))
        .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing IPC source"))?;
    field(
        field(element, "extensions")
            .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing extensions"))?,
        "umf.arrow.ipc",
    )
    .ok_or_else(|| error("ARROW_IPC_CAPTURE", "Missing Arrow IPC payload"))
}
fn metadata_value<'a>(document: &'a Value) -> Option<&'a Value> {
    let modules = array(field(document, "modules")?)?;
    let module = modules.first()?;
    let elements = array(field(module, "elements")?)?;
    let element = elements.first()?;
    let extension = field(field(element, "extensions")?, "umf.arrow.flatbuffer")?;
    field(field(extension, "model")?, "value")
}

/// Interpret the optional `ARROW:schema` entry from a Rust-inspected Parquet
/// footer. The footer inspector remains the sole source of physical metadata;
/// this function only decodes the independent Arrow declaration.
pub fn get_parquet_arrow_schema(
    source: &Value,
    parquet_inspection: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let retained_source = copy_json(source, ctx)?;
    let mut diagnostics = Vec::new();
    if let Some(items) = field(parquet_inspection, "diagnostics").and_then(array) {
        for (index, item) in items.iter().enumerate() {
            ctx.charge_work(1, Utf16::from(format!("/diagnostics/{index}")))?;
            diagnostics.push(copy_json(item, ctx)?);
        }
    }
    let mut status = "blocked";
    let mut metadata_index = None;
    let mut ipc_hex = None;
    let mut message = None;
    let mut schema = None;
    let fail = |diagnostics: &mut Vec<Value>, detail: &str| {
        diagnostics.push(diagnostic(
            "PARQUET_ARROW_SCHEMA_BLOCKED",
            "/key_value_metadata",
            detail,
            "error",
        ));
    };
    if text(field(parquet_inspection, "status")).as_deref() != Some("mapped") {
        status = "blocked";
    } else {
        let empty_metadata = Value::Null;
        let entries = field(
            field(parquet_inspection, "metadata").unwrap_or(&empty_metadata),
            "key_value_metadata",
        )
        .and_then(array)
        .unwrap_or(&[]);
        let mut matches = Vec::new();
        for (index, entry) in entries.iter().enumerate() {
            ctx.charge_work(1, Utf16::from(format!("/key_value_metadata/{index}/key")))?;
            if field(entry, "key") == Some(&string("ARROW:schema")) {
                matches.push((index, entry));
            }
        }
        if matches.is_empty() {
            status = "absent";
        } else if matches.len() != 1 {
            fail(
                &mut diagnostics,
                "Duplicate ARROW:schema entries are ambiguous",
            );
        } else {
            let (index, entry) = matches[0];
            metadata_index = Some(index);
            let decoded = (|| -> Result<(Value, Value), EngineError> {
                let encoded = match field(entry, "value") {
                    Some(Value::String(value)) if !value.is_empty() => value,
                    _ => {
                        return Err(error(
                            "PARQUET_ARROW_SCHEMA_BLOCKED",
                            "ARROW:schema requires a nonempty base64 value",
                        ))
                    }
                };
                ctx.charge_text(encoded.len(), Utf16::from("/key_value_metadata"))?;
                ctx.charge_work(encoded.len(), Utf16::from("/key_value_metadata"))?;
                let encoded_utf8 = encoded.to_utf8().map_err(|_| {
                    error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "ARROW:schema must use canonical padded base64",
                    )
                })?;
                let bytes = STANDARD.decode(encoded_utf8.as_bytes()).map_err(|_| {
                    error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "ARROW:schema must use canonical padded base64",
                    )
                })?;
                if STANDARD.encode(&bytes) != encoded_utf8 {
                    return Err(error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "ARROW:schema must use canonical padded base64",
                    ));
                }
                ctx.charge_text(
                    bytes.len().saturating_mul(2),
                    Utf16::from("/key_value_metadata"),
                )?;
                ctx.charge_work(
                    bytes.len().saturating_mul(3),
                    Utf16::from("/key_value_metadata"),
                )?;
                let hex = bytes
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>();
                ipc_hex = Some(string(&hex));
                if bytes.len() < 4 {
                    return Err(error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Truncated IPC message prefix",
                    ));
                }
                let first = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
                let prefix = if first == u32::MAX { 8 } else { 4 };
                if bytes.len() < prefix {
                    return Err(error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Truncated IPC continuation prefix",
                    ));
                }
                let length = i32::from_le_bytes(bytes[prefix - 4..prefix].try_into().unwrap());
                if length <= 0 || length as usize != bytes.len() - prefix {
                    return Err(error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Expected exactly one encapsulated IPC schema message",
                    ));
                }
                let decoded = decoded_model(
                    &bytes[prefix..],
                    &Utf16::from(format!(
                        "{}/parquet-arrow-message",
                        text(field(source, "id")).unwrap_or_default()
                    )),
                    "Message",
                    ctx,
                )?;
                let decode_diagnostics = field(&decoded, "diagnostics")
                    .and_then(array)
                    .unwrap_or(&[]);
                for item in decode_diagnostics {
                    ctx.charge_work(1, Utf16::from("/key_value_metadata"))?;
                    let code = text(field(item, "code")).unwrap_or_default();
                    diagnostics.push(copy_json(item, ctx)?);
                    if code != "ARROW_FLATBUFFER_INCOMPLETE" {
                        return Err(error(
                            "PARQUET_ARROW_SCHEMA_BLOCKED",
                            "Embedded Arrow metadata contains unsupported or invalid wire content",
                        ));
                    }
                }
                let model = field(&decoded, "model").ok_or_else(|| {
                    error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Cannot decode embedded Arrow metadata",
                    )
                })?;
                let model_text = arrow_flatbuffer_model::export_arrow_flatbuffer_model(model, ctx)?;
                let model_json =
                    serialization::read_json_value(model_text.units(), Format::Json, ctx)?;
                let value = field(&model_json, "value").ok_or_else(|| {
                    error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Cannot decode embedded Arrow metadata",
                    )
                })?;
                let header = field(value, "header").ok_or_else(|| {
                    error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Embedded message header is missing",
                    )
                })?;
                if text(field(header, "type")).as_deref() != Some("Schema")
                    || unsigned(field(value, "bodyLength")).unwrap_or(0) != 0
                {
                    return Err(error(
                        "PARQUET_ARROW_SCHEMA_BLOCKED",
                        "Embedded message must be a body-free Arrow Schema",
                    ));
                }
                let schema_value = field(header, "value").ok_or_else(|| {
                    error("PARQUET_ARROW_SCHEMA_BLOCKED", "Embedded schema is missing")
                })?;
                let schema_text = serialization::write_json_value(
                    &object(vec![
                        ("rootType", string("Schema")),
                        ("value", copy_json(schema_value, ctx)?),
                    ]),
                    Format::Json,
                    ctx,
                )?;
                let imported = arrow_flatbuffer_model::import_arrow_flatbuffer_model(
                    &schema_text,
                    &Utf16::from(format!(
                        "{}/parquet-arrow-schema",
                        text(field(source, "id")).unwrap_or_default()
                    )),
                    ctx,
                )?;
                Ok((copy_json(model, ctx)?, imported))
            })();
            match decoded {
                Ok((native_message, imported_schema)) => {
                    message = Some(native_message);
                    schema = Some(imported_schema);
                    status = "decoded";
                    diagnostics.push(diagnostic(
                        "PARQUET_ARROW_CORRESPONDENCE_UNVERIFIED",
                        &format!("/key_value_metadata/{index}"),
                        "Embedded Arrow schema decoded independently; agreement with Parquet fields, rows and external metadata is not established. Both declarations remain authoritative source observations.",
                        "warning",
                    ));
                }
                Err(failure)
                    if failure.is_control_failure()
                        || matches!(
                            failure.code.as_str(),
                            "LIMIT" | "RESOURCE_LIMIT" | "CAPACITY"
                        ) =>
                {
                    return Err(failure)
                }
                Err(failure) => {
                    let detail = failure
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Embedded Arrow metadata could not be decoded".into());
                    fail(&mut diagnostics, &detail);
                }
            }
        }
    }
    let mut result = vec![
        ("source", retained_source),
        ("status", string(status)),
        ("complete", Value::Bool(false)),
    ];
    if let Some(value) = metadata_index {
        result.push(("metadataIndex", number(value)));
    }
    if let Some(value) = ipc_hex {
        result.push(("ipcHex", value));
    }
    if let Some(value) = message {
        result.push(("message", value));
    }
    if let Some(value) = schema {
        result.push(("schema", value));
    }
    result.push(("diagnostics", Value::Array(diagnostics)));
    Ok(object(result))
}
fn body_length(document: &Value) -> Result<usize, &'static str> {
    let value = field(
        metadata_value(document).ok_or("Cannot read decoded message metadata")?,
        "bodyLength",
    );
    match value {
        None | Some(Value::Null) => Ok(0),
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= usize::MAX as f64 =>
        {
            Ok(*n as usize)
        }
        Some(Value::String(s)) => s
            .to_utf8()
            .ok()
            .and_then(|s| s.parse::<usize>().ok())
            .ok_or("Invalid or oversized message body length"),
        _ => Err("Invalid or oversized message body length"),
    }
}
fn decoded_model(
    bytes: &[u8],
    id: &Utf16,
    root: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    arrow_flatbuffer_binary::decode_arrow_flatbuffer(bytes, id, root, ctx)
}

fn short_name(value: &str) -> &str {
    value
        .strip_prefix("org.apache.arrow.flatbuf.")
        .unwrap_or(value)
}
fn normalized(
    value: &Value,
    ty: &str,
    declarations: &[Value],
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if depth > ctx.limits().max_depth {
        return Err(error(
            "RESOURCE_LIMIT",
            "Arrow metadata nesting exceeds inspection limit",
        )
        .with_control_failure());
    }
    let ty = short_name(ty);
    if ty.starts_with('[') && ty.ends_with(']') {
        let values = array(value)
            .ok_or_else(|| error("ARROW_IPC_FOOTER_SCHEMA", "Expected Arrow metadata vector"))?;
        let mut out = Vec::with_capacity(values.len());
        for item in values {
            out.push(normalized(
                item,
                ty[1..ty.len() - 1].trim(),
                declarations,
                ctx,
                depth + 1,
            )?);
        }
        return Ok(Value::Array(out));
    }
    let declaration = declarations
        .iter()
        .find(|d| text(field(d, "name")).as_deref() == Some(ty));
    let Some(declaration) = declaration else {
        return copy_json(value, ctx);
    };
    let kind = text(field(declaration, "kind")).unwrap_or_default();
    if kind == "enum" {
        return copy_json(value, ctx);
    }
    if kind == "union" {
        let variant = text(field(value, "type")).unwrap_or_else(|| "NONE".into());
        if variant == "NONE" {
            return copy_json(value, ctx);
        }
        let payload = normalized(
            field(value, "value")
                .ok_or_else(|| error("ARROW_IPC_FOOTER_SCHEMA", "Union value is missing"))?,
            &variant,
            declarations,
            ctx,
            depth + 1,
        )?;
        // The union tag is part of the logical type even when two variants
        // have the same (for example, empty) payload shape.
        return Ok(Value::Object(vec![
            (
                key("type"),
                copy_json(
                    field(value, "type")
                        .ok_or_else(|| error("ARROW_IPC_FOOTER_SCHEMA", "Union type is missing"))?,
                    ctx,
                )?,
            ),
            (key("value"), payload),
        ]));
    }
    let declared_fields = field(declaration, "fields").and_then(array).unwrap_or(&[]);
    let supplied = match value {
        Value::Object(fields) => fields,
        _ => {
            return Err(error(
                "ARROW_IPC_FOOTER_SCHEMA",
                "Expected Arrow metadata object",
            ))
        }
    };
    let mut out = Vec::new();
    for declared in declared_fields {
        ctx.charge_work(1, Utf16::default())?;
        let name = text(field(declared, "name"))
            .ok_or_else(|| error("ARROW_IPC_FOOTER_SCHEMA", "Invalid Arrow metadata field"))?;
        let field_type = text(field(declared, "type")).ok_or_else(|| {
            error(
                "ARROW_IPC_FOOTER_SCHEMA",
                "Invalid Arrow metadata field type",
            )
        })?;
        let actual = supplied
            .iter()
            .find(|(k, _)| k == &key(&name))
            .map(|(_, v)| v);
        let mut default = None;
        if actual.is_none() {
            if let Some(explicit) = text(field(declared, "default")) {
                default = Some(match field_type.as_str() {
                    "bool" => Value::Bool(explicit == "true"),
                    "int" => Value::Number(explicit.parse::<f64>().unwrap_or(0.0)),
                    "long" => string(&explicit),
                    _ => string(&explicit),
                });
            } else if field_type.starts_with('[') {
                default = Some(Value::Array(Vec::new()));
            } else if field_type == "bool" {
                default = Some(Value::Bool(false));
            } else if field_type == "int" {
                default = Some(Value::Number(0.0));
            } else if field_type == "long" {
                default = Some(string("0"));
            } else {
                let child = declarations
                    .iter()
                    .find(|d| text(field(d, "name")).as_deref() == Some(short_name(&field_type)));
                if text(child.and_then(|d| field(d, "kind"))).as_deref() == Some("enum") {
                    let first_zero = child
                        .and_then(|d| field(d, "members"))
                        .and_then(array)
                        .and_then(|items| {
                            items
                                .iter()
                                .find(|item| field(item, "value") == Some(&Value::Number(0.0)))
                        });
                    if let Some(name) = first_zero.and_then(|item| text(field(item, "name"))) {
                        default = Some(string(&name));
                    }
                }
            }
        }
        let value = actual.or(default.as_ref());
        if let Some(value) = value {
            out.push((
                key(&name),
                normalized(value, &field_type, declarations, ctx, depth + 1)?,
            ));
        }
    }
    Ok(Value::Object(out))
}

fn equivalent(
    left: &Value,
    right: &Value,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<bool, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if depth > ctx.limits().max_depth {
        return Err(error(
            "RESOURCE_LIMIT",
            "Arrow metadata comparison exceeds inspection limit",
        ));
    }
    Ok(match (left, right) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(a), Value::Bool(b)) => a == b,
        (Value::Number(a), Value::Number(b)) => a == b,
        (Value::String(a), Value::String(b)) => a == b,
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                false
            } else {
                let mut same = true;
                for (x, y) in a.iter().zip(b) {
                    if !equivalent(x, y, ctx, depth + 1)? {
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
                    let Some((_, other)) = b.iter().find(|(candidate, _)| candidate == k) else {
                        same = false;
                        break;
                    };
                    if !equivalent(v, other, ctx, depth + 1)? {
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
pub(crate) fn exported_flatbuffer_models_equivalent(
    left: &Value,
    right: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let left_text = arrow_flatbuffer_model::export_arrow_flatbuffer_model(left, ctx)?;
    let right_text = arrow_flatbuffer_model::export_arrow_flatbuffer_model(right, ctx)?;
    let left_value = serialization::read_json_value(left_text.units(), Format::Json, ctx)?;
    let right_value = serialization::read_json_value(right_text.units(), Format::Json, ctx)?;
    arrow_flatbuffer_binary::equivalent_metered(&left_value, &right_value, ctx, 0)
}

fn report_decode_diagnostics(
    out: &mut Vec<Value>,
    report: &Value,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(items) = field(report, "diagnostics").and_then(array) {
        for item in items {
            ctx.charge_work(1, Utf16::from(path))?;
            let mut copied = copy_json(item, ctx)?;
            if let Value::Object(fields) = &mut copied {
                let old = fields
                    .iter()
                    .find(|(k, _)| k == &key("path"))
                    .and_then(|(_, v)| text(Some(v)))
                    .unwrap_or_default();
                let combined = format!("{path}{old}");
                if let Some((_, v)) = fields.iter_mut().find(|(k, _)| k == &key("path")) {
                    *v = string(&combined);
                }
            }
            out.push(copied);
        }
    }
    Ok(())
}

/// Inspect IPC message extents without claiming array, dictionary, or footer semantics.
pub fn inspect_arrow_ipc_layout(
    document: &Value,
    resources: &ArrowIpcResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let bytes = arrow_ipc_capture::export_arrow_ipc_capture(document, resources, ctx)?;
    let source = copy_json(document, ctx)?;
    let format = if magic(&bytes, 0) { "file" } else { "stream" };
    let mut frames = Vec::new();
    let mut diagnostics = Vec::new();
    let mut position = 0usize;
    let mut end = bytes.len();
    let mut footer = None;
    let mut eos = None;
    let mut accounted = false;
    if format == "file" {
        let footer_bounds = (|| -> Result<(usize, usize), &'static str> {
            if bytes.len() < 18 || !magic(&bytes, bytes.len().saturating_sub(6)) {
                return Err("Missing IPC file footer magic");
            }
            let length = i32_at(&bytes, bytes.len() - 10, bytes.len())?;
            if length <= 0 {
                return Err("Invalid footer length");
            }
            let length = length as usize;
            let offset = bytes
                .len()
                .checked_sub(10)
                .and_then(|n| n.checked_sub(length))
                .ok_or("Footer overlaps file header")?;
            if offset < 8 {
                return Err("Footer overlaps file header");
            }
            Ok((offset, length))
        })();
        match footer_bounds {
            Err(message) => diagnostics.push(diagnostic("ARROW_IPC_FRAMING", "", message, "error")),
            Ok((offset, length)) => {
                let decoded = decoded_model(
                    &bytes[offset..offset + length],
                    &Utf16::from("arrow-ipc/footer"),
                    "Footer",
                    ctx,
                );
                match decoded {
                    Ok(report) if field(&report, "model").is_some() => {
                        report_decode_diagnostics(&mut diagnostics, &report, "/footer", ctx)?;
                        footer = field(&report, "model")
                            .map(|model| copy_json(model, ctx))
                            .transpose()?;
                        end = offset;
                        position = 8;
                    }
                    Err(failure)
                        if failure.is_control_failure()
                            || matches!(
                                failure.code.as_str(),
                                "LIMIT" | "RESOURCE_LIMIT" | "CAPACITY"
                            ) =>
                    {
                        return Err(failure)
                    }
                    _ => {
                        diagnostics.push(diagnostic(
                            "ARROW_IPC_FRAMING",
                            "",
                            "Cannot decode file footer",
                            "error",
                        ));
                    }
                }
            }
        }
    }
    if !diagnostics
        .iter()
        .any(|d| text(field(d, "severity")).as_deref() == Some("error"))
    {
        loop {
            ctx.charge_work(1, Utf16::default())?;
            if position >= end {
                break;
            }
            if frames.len() >= 1024 {
                diagnostics.push(diagnostic(
                    "ARROW_IPC_FRAMING",
                    "",
                    "IPC frame-count limit exceeded",
                    "error",
                ));
                break;
            }
            let start = position;
            let mut length = match i32_at(&bytes, position, end) {
                Ok(v) => v,
                Err(e) => {
                    diagnostics.push(diagnostic("ARROW_IPC_FRAMING", "", e, "error"));
                    break;
                }
            };
            let mut prefix = 4usize;
            if length == -1 {
                length = match i32_at(&bytes, position.saturating_add(4), end) {
                    Ok(v) => v,
                    Err(e) => {
                        diagnostics.push(diagnostic("ARROW_IPC_FRAMING", "", e, "error"));
                        break;
                    }
                };
                prefix = 8;
            }
            if length < 0 {
                diagnostics.push(diagnostic(
                    "ARROW_IPC_FRAMING",
                    "",
                    "Negative metadata length",
                    "error",
                ));
                break;
            }
            if length == 0 {
                eos = Some(start);
                position = match position.checked_add(prefix) {
                    Some(v) => v,
                    None => end,
                };
                break;
            }
            let length = length as usize;
            if bounded(position.saturating_add(prefix), length, end).is_err() {
                diagnostics.push(diagnostic(
                    "ARROW_IPC_FRAMING",
                    "",
                    "Truncated or out-of-bounds IPC segment",
                    "error",
                ));
                break;
            }
            if (prefix + length) % 8 != 0 {
                diagnostics.push(diagnostic(
                    "ARROW_IPC_FRAMING",
                    "",
                    "IPC metadata framing is not aligned to eight bytes",
                    "error",
                ));
                break;
            }
            let metadata_offset = position + prefix;
            let body_offset = metadata_offset + length;
            let report = match decoded_model(
                &bytes[metadata_offset..body_offset],
                &Utf16::from(format!("arrow-ipc/message/{}", frames.len())),
                "Message",
                ctx,
            ) {
                Ok(v) => v,
                Err(e)
                    if e.is_control_failure()
                        || matches!(e.code.as_str(), "LIMIT" | "RESOURCE_LIMIT" | "CAPACITY") =>
                {
                    return Err(e)
                }
                Err(e) => {
                    diagnostics.push(diagnostic(
                        "ARROW_IPC_FRAMING",
                        "",
                        &e.message
                            .to_utf8()
                            .unwrap_or_else(|_| "Cannot decode message metadata".into()),
                        "error",
                    ));
                    break;
                }
            };
            let Some(model) = field(&report, "model") else {
                let message = field(&report, "diagnostics")
                    .and_then(array)
                    .and_then(|d| d.last())
                    .and_then(|d| text(field(d, "message")))
                    .unwrap_or_else(|| "Cannot decode message metadata".into());
                diagnostics.push(diagnostic(
                    "ARROW_IPC_FRAMING",
                    "",
                    &format!("Cannot decode message metadata: {message}"),
                    "error",
                ));
                break;
            };
            let body = match body_length(model) {
                Ok(v) => v,
                Err(e) => {
                    diagnostics.push(diagnostic("ARROW_IPC_FRAMING", "", e, "error"));
                    break;
                }
            };
            if body % 8 != 0 || bounded(body_offset, body, end).is_err() {
                diagnostics.push(diagnostic(
                    "ARROW_IPC_FRAMING",
                    "",
                    if body % 8 != 0 {
                        "IPC body length is not aligned to eight bytes"
                    } else {
                        "Truncated or out-of-bounds IPC segment"
                    },
                    "error",
                ));
                break;
            }
            let kind = metadata_value(model)
                .and_then(|v| field(field(v, "header")?, "type"))
                .and_then(|v| text(Some(v)))
                .unwrap_or_else(|| "NONE".into());
            let frame = object(vec![
                ("offset", number(start)),
                ("prefixLength", number(prefix)),
                ("metadataOffset", number(metadata_offset)),
                ("metadataLength", number(length)),
                ("bodyOffset", number(body_offset)),
                ("bodyLength", number(body)),
                ("kind", string(&kind)),
                ("metadata", copy_json(model, ctx)?),
            ]);
            report_decode_diagnostics(
                &mut diagnostics,
                &report,
                &format!("/frames/{}", frames.len()),
                ctx,
            )?;
            frames.push(frame);
            position = body_offset + body;
        }
    }
    if frames.is_empty()
        || field(&frames[0], "kind")
            .and_then(|v| text(Some(v)))
            .as_deref()
            != Some("Schema")
    {
        if !diagnostics
            .iter()
            .any(|d| text(field(d, "severity")).as_deref() == Some("error"))
        {
            diagnostics.push(diagnostic(
                "ARROW_IPC_FRAMING",
                "",
                "IPC stream must begin with a schema message",
                "error",
            ));
        }
    }
    if format == "file"
        && eos.is_none()
        && !diagnostics
            .iter()
            .any(|d| text(field(d, "severity")).as_deref() == Some("error"))
    {
        diagnostics.push(diagnostic(
            "ARROW_IPC_FRAMING",
            "",
            "File embedded stream lacks EOS",
            "error",
        ));
    }
    if position != end {
        if position < end {
            diagnostics.push(diagnostic(
                "ARROW_IPC_TRAILING",
                "",
                &format!("{} bytes after EOS remain uninterpreted", end - position),
                "warning",
            ));
        }
    } else {
        accounted = true;
        if format == "file" {
            position = bytes.len();
        }
    }
    diagnostics.push(diagnostic("ARROW_IPC_SEMANTICS_UNVERIFIED", "", "Byte boundaries are separate from footer/block agreement, schema consistency, dictionary state, buffer layouts and data validity", "warning"));
    let mut result = vec![
        ("source", source),
        ("format", string(format)),
        ("complete", Value::Bool(false)),
        ("bytesAccountedFor", Value::Bool(accounted)),
        ("frames", Value::Array(frames)),
    ];
    if let Some(footer) = footer {
        result.push((
            "footer",
            object(vec![
                ("offset", number(end)),
                ("length", number(bytes.len() - 10 - end)),
                ("metadata", footer),
            ]),
        ));
    }
    if let Some(eos) = eos {
        result.push(("eosOffset", number(eos)));
    }
    result.extend([
        ("consumed", number(position)),
        (
            "trailingBytes",
            number(if accounted {
                0
            } else {
                end.saturating_sub(position)
            }),
        ),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    Ok(object(result))
}

fn unsigned(value: Option<&Value>) -> Option<u128> {
    match value? {
        Value::Number(n) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 => Some(*n as u128),
        Value::String(s) => s.to_utf8().ok()?.parse::<u128>().ok(),
        _ => None,
    }
}

/// Compare file footer declarations with the observed stream while preserving both source views.
pub fn inspect_arrow_ipc_consistency(
    document: &Value,
    resources: &ArrowIpcResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let layout = inspect_arrow_ipc_layout(document, resources, ctx)?;
    let mut diagnostics = Vec::new();
    let mut footer_checks = "unverified";
    let add =
        |diagnostics: &mut Vec<Value>, code: &str, path: &str, message: &str, severity: &str| {
            diagnostics.push(diagnostic(code, path, message, severity));
        };
    if text(field(&layout, "format")).as_deref() == Some("stream") {
        footer_checks = "not-applicable";
    } else {
        let layout_diags = field(&layout, "diagnostics").and_then(array).unwrap_or(&[]);
        let has_error = layout_diags
            .iter()
            .any(|d| text(field(d, "severity")).as_deref() == Some("error"));
        let accounted = field(&layout, "bytesAccountedFor") == Some(&Value::Bool(true));
        let footer = field(&layout, "footer").and_then(|f| field(f, "metadata"));
        if !accounted || footer.is_none() || has_error {
            add(
                &mut diagnostics,
                "ARROW_IPC_FOOTER_UNVERIFIED",
                "/footer",
                "Complete file boundaries are required for footer comparison",
                "warning",
            );
        } else if layout_diags
            .iter()
            .any(|d| text(field(d, "code")).as_deref() == Some("ARROW_FLATBUFFER_UNKNOWN_SLOT"))
        {
            add(
                &mut diagnostics,
                "ARROW_IPC_FOOTER_UNVERIFIED",
                "/footer",
                "Unknown metadata wire slots prevent complete footer comparison",
                "warning",
            );
        } else {
            let frames = field(&layout, "frames").and_then(array).unwrap_or(&[]);
            let Some(first) = frames.first().and_then(|frame| field(frame, "metadata")) else {
                add(
                    &mut diagnostics,
                    "ARROW_IPC_FOOTER_UNVERIFIED",
                    "/footer",
                    "Schema message is unavailable",
                    "warning",
                );
                let mut fields = vec![
                    ("layout", layout),
                    ("complete", Value::Bool(false)),
                    ("footerChecks", string("unverified")),
                    ("diagnostics", Value::Array(diagnostics)),
                ];
                return Ok(object(fields));
            };
            let footer_value = footer.and_then(metadata_value);
            let first_value = metadata_value(first);
            let footer_value = footer_value
                .ok_or_else(|| error("ARROW_IPC_FOOTER", "Footer metadata is unavailable"))?;
            let first_value = first_value.ok_or_else(|| {
                error("ARROW_IPC_FOOTER", "Schema message metadata is unavailable")
            })?;
            let version =
                |value: &Value| text(field(value, "version")).unwrap_or_else(|| "V1".into());
            if version(footer_value) != version(first_value) {
                add(
                    &mut diagnostics,
                    "ARROW_IPC_FOOTER_VERSION",
                    "/footer/version",
                    "Footer and schema-message metadata versions differ",
                    "error",
                );
            }
            let footer_schema = field(footer_value, "schema");
            let first_schema = field(
                field(first_value, "header").unwrap_or(&Value::Null),
                "value",
            );
            if let (Some(a), Some(b)) = (footer_schema, first_schema) {
                let inventory = serialization::read_json_value(
                    &INVENTORY.encode_utf16().collect::<Vec<_>>(),
                    Format::Json,
                    ctx,
                )?;
                let definitions = field(&inventory, "definitions")
                    .and_then(array)
                    .unwrap_or(&[]);
                let normalized_footer = normalized(a, "Schema", definitions, ctx, 0)?;
                let normalized_first = normalized(b, "Schema", definitions, ctx, 0)?;
                if !equivalent(&normalized_footer, &normalized_first, ctx, 0)? {
                    add(
                        &mut diagnostics,
                        "ARROW_IPC_FOOTER_SCHEMA",
                        "/footer/schema",
                        "Footer schema differs from the embedded-stream schema",
                        "error",
                    );
                }
            } else {
                add(
                    &mut diagnostics,
                    "ARROW_IPC_FOOTER_SCHEMA",
                    "/footer/schema",
                    "Footer schema is missing",
                    "error",
                );
            }
            let empty = Value::Array(Vec::new());
            let footer_metadata = field(footer_value, "custom_metadata").unwrap_or(&empty);
            let first_metadata = field(first_value, "custom_metadata").unwrap_or(&empty);
            if !equivalent(footer_metadata, first_metadata, ctx, 0)? {
                add(
                    &mut diagnostics,
                    "ARROW_IPC_FOOTER_METADATA",
                    "/footer/custom_metadata",
                    "Footer and initial message custom metadata differ",
                    "error",
                );
            }
            let frame_groups = [
                ("dictionaries", "DictionaryBatch"),
                ("recordBatches", "RecordBatch"),
            ];
            for (key_name, kind) in frame_groups {
                let mut frames_of_kind: Vec<&Value> = Vec::new();
                for (frame_index, frame) in frames.iter().enumerate() {
                    ctx.charge_work(1, Utf16::from(format!("/frames/{frame_index}/kind")))?;
                    if text(field(frame, "kind")).as_deref() == Some(kind) {
                        frames_of_kind.push(frame);
                    }
                }
                let blocks = field(footer_value, key_name).and_then(array).unwrap_or(&[]);
                if blocks.len() != frames_of_kind.len() {
                    add(
                        &mut diagnostics,
                        "ARROW_IPC_FOOTER_BLOCK_COUNT",
                        &format!("/footer/{key_name}"),
                        &format!("Footer block count differs from observed {kind} messages"),
                        "error",
                    );
                }
                let mut seen = Vec::new();
                for (index, block) in blocks.iter().enumerate() {
                    ctx.charge_work(1, Utf16::from(format!("/footer/{key_name}/{index}")))?;
                    let path = format!("/footer/{key_name}/{index}");
                    let Some(offset) = unsigned(field(block, "offset")) else {
                        add(
                            &mut diagnostics,
                            "ARROW_IPC_FOOTER_BLOCK_OFFSET",
                            &path,
                            "Block offset does not identify a message",
                            "error",
                        );
                        continue;
                    };
                    let mut found = None;
                    for frame in &frames_of_kind {
                        ctx.charge_work(
                            1,
                            Utf16::from(format!("/footer/{key_name}/{index}/offset")),
                        )?;
                        if unsigned(field(frame, "offset")) == Some(offset) {
                            found = Some(*frame);
                            break;
                        }
                    }
                    let Some(frame) = found else {
                        add(
                            &mut diagnostics,
                            "ARROW_IPC_FOOTER_BLOCK_OFFSET",
                            &path,
                            &format!("Block offset does not identify a {kind} message"),
                            "error",
                        );
                        continue;
                    };
                    let mut duplicate = false;
                    for prior in &seen {
                        ctx.charge_work(1, Utf16::from(format!("/footer/{key_name}/{index}")))?;
                        if *prior == offset {
                            duplicate = true;
                            break;
                        }
                    }
                    if duplicate {
                        add(
                            &mut diagnostics,
                            "ARROW_IPC_FOOTER_BLOCK_DUPLICATE",
                            &path,
                            "Footer repeats the same message offset",
                            "error",
                        );
                    }
                    seen.push(offset);
                    let metadata_length = unsigned(field(frame, "metadataLength"));
                    let prefix_length = unsigned(field(frame, "prefixLength"));
                    let expected_metadata_length =
                        metadata_length.zip(prefix_length).map(|(a, b)| a + b);
                    if unsigned(field(block, "metaDataLength")) != expected_metadata_length
                        || unsigned(field(block, "bodyLength"))
                            != unsigned(field(frame, "bodyLength"))
                    {
                        add(
                            &mut diagnostics,
                            "ARROW_IPC_FOOTER_BLOCK_LENGTH",
                            &path,
                            "Footer metadata/body lengths differ from observed message extents",
                            "error",
                        );
                    }
                    if frames_of_kind.get(index).copied() != Some(frame) {
                        add(&mut diagnostics, "ARROW_IPC_FOOTER_BLOCK_ORDER", &path, "Footer order differs from stream order; ordering agreement is a writer recommendation", "warning");
                    }
                }
            }
            footer_checks = if diagnostics.is_empty() {
                "matched"
            } else {
                "mismatch"
            };
        }
    }
    let fields = vec![
        ("layout", layout),
        ("complete", Value::Bool(false)),
        ("footerChecks", string(footer_checks)),
        ("diagnostics", Value::Array(diagnostics)),
    ];
    Ok(object(fields))
}

/// Complete the staged rename wholly in Rust using the pinned native
/// FlatBuffer writer. This preserves the explicit callback API while making
/// the default library path independent of JavaScript codecs.
pub fn rename_arrow_ipc_field_native(
    document: &Value,
    request: &Value,
    resources: &ArrowIpcResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let prepared = prepare_arrow_ipc_rename(document, request, resources, ctx)?;
    let schema_text = text(field(&prepared, "schemaModel"))
        .ok_or_else(|| error("ARROW_IPC_RENAME_SCHEMA", "Schema model is unavailable"))?;
    let schema_model = serialization::read_json_value(
        &schema_text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )?;
    let schema_bytes = arrow_flatbuffer_binary::encode_arrow_flatbuffer_native(&schema_model, ctx)?;
    let schema_hex = hex_bytes(&schema_bytes);
    let footer_model =
        prepare_arrow_ipc_rename_footer(document, request, &schema_hex, resources, ctx)?;
    let footer_hex = match footer_model {
        Value::Null => Value::Null,
        Value::String(text) => {
            let model = serialization::read_json_value(text.units(), Format::Json, ctx)?;
            Value::String(hex_bytes(
                &arrow_flatbuffer_binary::encode_arrow_flatbuffer_native(&model, ctx)?,
            ))
        }
        _ => return Err(error("ARROW_IPC_RENAME_FOOTER", "Invalid footer model")),
    };
    complete_arrow_ipc_rename(document, request, &schema_hex, &footer_hex, resources, ctx)
}

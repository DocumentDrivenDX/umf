// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded Parquet source capture, footer decoding and physical metadata views.
//!
//! All results remain incomplete. The original UMF document and bytes are the
//! authority; these operations expose only the pinned wire and physical-schema
//! observations described by CONTRACT-019.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_document_capture::source_bytes,
    parquet_schema_decode::{self, DecodedFooter, NativeWireValue},
    registry::Registry,
    value::{copy_json, Utf16, Value},
};
use num_bigint::BigUint;
use serde_json::{Map, Value as Json};
use serde_json::Number;

const MAX_BYTES: usize = 1_000_000;
const IDL: &str = include_str!("../../../spec/extensions/parquet/idl.json");

fn error(code: &'static str, message: impl AsRef<str>) -> EngineError {
    EngineError::new(code, Utf16::default(), message.as_ref())
}

fn object(fields: impl IntoIterator<Item = (impl AsRef<str>, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key.as_ref()), value))
            .collect(),
    )
}
fn string(value: impl AsRef<str>) -> Value {
    Value::string_utf8(value)
}
fn int(value: usize) -> Value {
    Value::Number(value as f64)
}
fn array(values: impl IntoIterator<Item = Value>) -> Value {
    Value::Array(values.into_iter().collect())
}

/// Construct the pinned UMF capture envelope, retaining malformed and empty
/// native inputs byte-for-byte. The supplied ID is a core document identity.
pub fn capture_parquet(
    bytes: &[u8],
    id: &Utf16,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if bytes.len() > MAX_BYTES {
        return Err(error(
            "PARQUET_LIMIT",
            "Expected at most 1000000 source bytes",
        ));
    }
    let mut hex = String::with_capacity(bytes.len() * 2);
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for byte in bytes {
        ctx.charge_work(2, Utf16::default())?;
        hex.push(HEX[(byte >> 4) as usize] as char);
        hex.push(HEX[(byte & 15) as usize] as char);
    }
    let payload = object([
        ("profile", string("parquet-file-source")),
        ("encoding", string("hex")),
        ("bytes", string(hex)),
    ]);
    let extension = object([("umf.parquet", payload)]);
    let source = object([("id", string("source")), ("extensions", extension)]);
    let parquet = object([
        ("id", string("parquet")),
        ("namespace", string("")),
        ("elements", array([source])),
    ]);
    let document = object([
        ("umf", string("0.10.0")),
        ("id", Value::String(id.clone())),
        (
            "vocabularies",
            object([("umf.parquet", object([("version", string("0.1.0"))]))]),
        ),
        ("modules", array([parquet])),
    ]);
    // Match the TypeScript constructor's final export admission. This checks
    // the generated extension package and the caller's core identity.
    export_parquet_capture(&document, engine, registry, capabilities, ctx)?;
    Ok(document)
}

/// Export only the authoritative capture payload after core document
/// validation. Unknown payload properties are rejected by the shared source
/// extractor, preserving forward data in UMF while preventing native loss.
pub fn export_parquet_capture(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let copied = copy_json(document, ctx)?;
    let validation = engine.validate_document(&copied, registry, capabilities, ctx)?;
    if !validation.valid {
        return Err(error("PARQUET_CAPTURE", "Invalid Parquet capture envelope"));
    }
    if find_module(document, "parquet.fields").is_some() {
        check_parquet_field_metadata(document, engine, registry, capabilities, ctx)?;
    }
    source_bytes(&copied, ctx).map_err(|e| {
        if e.code == "PARQUET_UNKNOWN_CONTENT" {
            error(
                "PARQUET_REPRESENTATION",
                "Unknown capture fields cannot be discarded by native export",
            )
        } else {
            e
        }
    })
}

fn find_module<'a>(document: &'a Value, id: &str) -> Option<&'a Value> {
    let Value::Array(modules) = value_member(document, "modules")? else {
        return None;
    };
    modules
        .iter()
        .find(|module| text_member(module, "id").as_deref() == Some(id))
}

fn check_parquet_field_metadata(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(module) = find_module(document, "parquet.fields") else {
        return Ok(());
    };
    let mismatch = || {
        error(
            "PARQUET_FIELD_METADATA",
            "Native schema and core field metadata disagree",
        )
    };
    let view = get_parquet_field_metadata(document, engine, registry, capabilities, ctx)?;
    let fields = value_member(&view, "fields").and_then(|value| match value {
        Value::Array(values) => Some(values),
        _ => None,
    }).ok_or_else(mismatch)?;
    let elements = value_member(module, "elements").and_then(|value| match value {
        Value::Array(values) => Some(values),
        _ => None,
    }).ok_or_else(mismatch)?;
    if text_member(&view, "status").as_deref() != Some("checked")
        || text_member(module, "namespace").as_deref() != Some("")
        || fields.len() != elements.len()
    {
        return Err(mismatch());
    }
    for (field, element) in fields.iter().zip(elements) {
        let expected = value_member(field, "element").ok_or_else(mismatch)?;
        for name in ["id", "name", "scalarType"] {
            if value_member(element, name) != value_member(expected, name) {
                return Err(mismatch());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
fn field_scalar_type(element: &Json) -> Option<&'static str> {
    if has_unknown_json(element) { return None; }
    let physical = element.get("type")?.as_str()?;
    let logical = element.get("logicalType").and_then(Json::as_object).and_then(|v| v.keys().find(|k| k.as_str() != "$unknown")).map(String::as_str);
    let legacy = element.get("converted_type").and_then(Json::as_str).and_then(|v| v.parse::<usize>().ok()).and_then(|v| ["STRING","MAP","MAP_KEY_VALUE","LIST","ENUM","DECIMAL","DATE","TIME_MILLIS","TIME_MICROS","TIMESTAMP_MILLIS","TIMESTAMP_MICROS","UINT_8","UINT_16","UINT_32","UINT_64","INT_8","INT_16","INT_32","INT_64","JSON","BSON","INTERVAL"].get(v).copied());
    let name = logical.or(legacy);
    match name {
        Some("STRING" | "ENUM") if physical == "6" => Some("string"),
        Some("DECIMAL") if ["1","2","6","7"].contains(&physical) => Some("decimal"),
        Some("DATE") if physical == "1" => Some("date"),
        Some("TIME" | "TIME_MILLIS" | "TIME_MICROS") if ["1","2"].contains(&physical) => Some("time"),
        Some("TIMESTAMP" | "TIMESTAMP_MILLIS" | "TIMESTAMP_MICROS") if physical == "2" => Some("timestamp"),
        Some("INTEGER" | "UINT_8" | "UINT_16" | "UINT_32" | "UINT_64" | "INT_8" | "INT_16" | "INT_32" | "INT_64") if ["1","2"].contains(&physical) => Some("integer"),
        Some("FLOAT16") if physical == "7" => Some("float"),
        Some(_) => None,
        None => match physical { "0" => Some("boolean"), "1"|"2" => Some("integer"), "4"|"5" => Some("float"), "6"|"7" => Some("binary"), _ => None },
    }
}

fn diagnostic(code: &str, path: &str, severity: &str, message: &str) -> Value {
    object([
        ("code", string(code)),
        ("path", string(path)),
        ("severity", string(severity)),
        ("message", string(message)),
    ])
}
fn diagnostics(values: impl IntoIterator<Item = Value>) -> Value {
    array(values)
}
fn value_member<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn text_member(value: &Value, key: &str) -> Option<String> {
    match value_member(value, key)? {
        Value::String(value) => value.to_utf8().ok(),
        _ => None,
    }
}

fn to_json(value: &Value) -> Result<Json, EngineError> {
    Ok(match value {
        Value::Null => Json::Null,
        Value::Bool(value) => Json::Bool(*value),
        Value::Number(value) => Json::Number(if value.fract() == 0.0
            && *value >= i64::MIN as f64
            && *value <= i64::MAX as f64
        {
            Number::from(*value as i64)
        } else {
            Number::from_f64(*value)
                .ok_or_else(|| error("PARQUET_METADATA_SHAPE", "Non-finite value in metadata"))?
        }),
        Value::String(value) => Json::String(
            value
                .to_utf8()
                .map_err(|_| error("PARQUET_METADATA_SHAPE", "Metadata contains non-UTF-8 text"))?,
        ),
        Value::Array(values) => Json::Array(values.iter().map(to_json).collect::<Result<_, _>>()?),
        Value::Object(values) => {
            let mut out = Map::new();
            for (key, value) in values {
                out.insert(
                    key.to_utf8().map_err(|_| {
                        error("PARQUET_METADATA_SHAPE", "Metadata contains non-UTF-8 keys")
                    })?,
                    to_json(value)?,
                );
            }
            Json::Object(out)
        }
    })
}
fn to_json_selected(value: &Value, keys: &[&str]) -> Result<Json, EngineError> {
    let mut selected = Vec::new();
    for key in keys {
        if let Some(member) = value_member(value, key) {
            selected.push((Utf16::from(*key), member.clone()));
        }
    }
    to_json(&Value::Object(selected))
}

/// Reattach raw envelope values after processing only the native metadata
/// projection. Source and wire trees can contain arbitrary UTF-16 that JSON
/// strings cannot represent, so they must never pass through serde_json.
fn preserve_raw_fields(result: Value, original: &Value, keys: &[&str]) -> Value {
    let Value::Object(mut fields) = result else {
        return result;
    };
    for key in keys {
        if let Some(raw) = value_member(original, key) {
            let name = Utf16::from(*key);
            if let Some((_, value)) = fields.iter_mut().find(|(existing, _)| existing == &name) {
                *value = raw.clone();
            } else {
                fields.push((name, raw.clone()));
            }
        }
    }
    Value::Object(fields)
}

fn from_json(value: Json) -> Value {
    match value {
        Json::Null => Value::Null,
        Json::Bool(value) => Value::Bool(value),
        Json::Number(value) => Value::Number(value.as_f64().unwrap_or_default()),
        Json::String(value) => string(value),
        Json::Array(values) => array(values.into_iter().map(from_json)),
        Json::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(k, v)| (Utf16::from(k), from_json(v)))
                .collect(),
        ),
    }
}

fn wire_kind_name(kind: u8) -> Option<&'static str> {
    match kind {
        1 | 2 => Some("bool"),
        3 => Some("i8"),
        4 => Some("i16"),
        5 => Some("i32"),
        6 => Some("i64"),
        7 => Some("double"),
        8 => Some("binary"),
        9 => Some("list"),
        10 => Some("set"),
        11 => Some("map"),
        12 => Some("struct"),
        13 => Some("uuid"),
        _ => None,
    }
}
fn descriptor_wire_kind(ty: &Json, defs: &Map<String, Json>) -> Option<String> {
    if let Some(name) = ty.get("ref").and_then(Json::as_str) {
        let def = defs.get(name)?;
        return Some(
            if def.get("kind")?.as_str()? == "enum" {
                "i32"
            } else {
                "struct"
            }
            .into(),
        );
    }
    if ty.get("kind").and_then(Json::as_str) == Some("string") {
        return Some("binary".into());
    }
    ty.get("kind").and_then(Json::as_str).map(str::to_owned)
}
fn compact_as_json(value: &NativeWireValue) -> Result<Json, String> {
    let kind =
        |k| wire_kind_name(k).ok_or_else(|| format!("Unknown Compact Protocol wire type {k}"));
    Ok(match value {
        NativeWireValue::Bool(value) => serde_json::json!({"kind":"bool","value":value}),
        NativeWireValue::Byte(value) => serde_json::json!({"kind":"i8","value":value.to_string()}),
        NativeWireValue::I16(value) => serde_json::json!({"kind":"i16","value":value.to_string()}),
        NativeWireValue::I32(value) => serde_json::json!({"kind":"i32","value":value.to_string()}),
        NativeWireValue::I64(value) => serde_json::json!({"kind":"i64","value":value.to_string()}),
        NativeWireValue::Double(bits) => {
            serde_json::json!({"kind":"double","bits":hex(&bits.to_le_bytes())})
        }
        NativeWireValue::Binary(bytes) => serde_json::json!({"kind":"binary","hex":hex(bytes)}),
        NativeWireValue::Uuid(bytes) => serde_json::json!({"kind":"uuid","hex":hex(bytes)}),
        NativeWireValue::List(element, items) | NativeWireValue::Set(element, items) => {
            let is_list = matches!(value, NativeWireValue::List(..));
            serde_json::json!({"kind":if is_list {"list"} else {"set"},"elementType":kind(*element)?,"items":items.iter().map(compact_as_json).collect::<Result<Vec<_>,_>>()?})
        }
        NativeWireValue::Map(key_type, value_type, entries) => {
            let mut map = serde_json::Map::new();
            map.insert("kind".into(), Json::String("map".into()));
            if !entries.is_empty() {
                map.insert("keyType".into(), Json::String(kind(*key_type)?.into()));
                map.insert("valueType".into(), Json::String(kind(*value_type)?.into()));
            }
            map.insert("entries".into(), Json::Array(entries.iter().map(|(k,v)| Ok(serde_json::json!({"key":compact_as_json(k)?,"value":compact_as_json(v)?}))).collect::<Result<_,String>>()?));
            Json::Object(map)
        }
        NativeWireValue::Struct(fields) => {
            serde_json::json!({"kind":"struct","fields":fields.iter().map(|(id,value)| Ok(serde_json::json!({"id":id,"value":compact_as_json(value)?}))).collect::<Result<Vec<_>,String>>()?})
        }
    })
}

fn map_idl_value(
    value: &NativeWireValue,
    ty: &Json,
    defs: &Map<String, Json>,
    diagnostics: &mut Vec<Value>,
    path: &str,
) -> Result<Json, String> {
    if let Some(reference) = ty.get("ref").and_then(Json::as_str) {
        let definition = defs
            .get(reference)
            .ok_or_else(|| "Unknown IDL reference".to_owned())?;
        if definition.get("kind").and_then(Json::as_str) == Some("enum") {
            let NativeWireValue::I32(number) = value else {
                return Err("Expected i32 enumeration".into());
            };
            let known = definition
                .get("values")
                .and_then(Json::as_object)
                .is_some_and(|values| {
                    values
                        .values()
                        .any(|v| v.as_i64() == Some(i64::from(*number)))
                });
            if !known {
                diagnostics.push(diagnostic(
                    "PARQUET_ENUM_UNKNOWN",
                    path,
                    "warning",
                    &format!("Unknown {reference} code retained: {number}"),
                ));
            }
            return Ok(Json::String(number.to_string()));
        }
        let NativeWireValue::Struct(fields) = value else {
            return Err(format!("Expected struct {reference}"));
        };
        let descriptors = definition
            .get("fields")
            .and_then(Json::as_array)
            .ok_or_else(|| "IDL struct fields are unavailable".to_owned())?;
        if definition.get("kind").and_then(Json::as_str) == Some("union") && fields.len() > 1 {
            return Err("Union has more than one active field".into());
        }
        let mut out = Map::new();
        let mut seen = std::collections::BTreeSet::new();
        let mut unknown = Vec::new();
        for (id, child) in fields {
            let Some(desc) = descriptors
                .iter()
                .find(|f| f.get("id").and_then(Json::as_i64) == Some(i64::from(*id)))
            else {
                unknown.push(serde_json::json!({"id":id,"value":compact_as_json(child)?}));
                diagnostics.push(diagnostic(
                    "PARQUET_FIELD_UNKNOWN",
                    path,
                    "warning",
                    &format!("Unknown field {id} retained in $unknown"),
                ));
                continue;
            };
            if !seen.insert(*id) {
                return Err(format!(
                    "Repeated field ID cannot be collapsed into named metadata: {id}"
                ));
            }
            let name = desc
                .get("name")
                .and_then(Json::as_str)
                .ok_or_else(|| "IDL field name is unavailable".to_owned())?;
            let next = format!("{path}/{name}");
            let field_ty = desc
                .get("type")
                .ok_or_else(|| "IDL field type is unavailable".to_owned())?;
            out.insert(
                name.to_owned(),
                map_idl_value(child, field_ty, defs, diagnostics, &next)?,
            );
        }
        for desc in descriptors {
            let id = desc.get("id").and_then(Json::as_i64).unwrap_or_default() as i16;
            if desc.get("required").and_then(Json::as_bool) == Some(true) && !seen.contains(&id) {
                let name = desc.get("name").and_then(Json::as_str).unwrap_or("");
                return Err(format!("Missing required IDL field {name}"));
            }
        }
        if !unknown.is_empty() {
            out.insert("$unknown".into(), Json::Array(unknown));
        }
        return Ok(Json::Object(out));
    }
    let kind = ty
        .get("kind")
        .and_then(Json::as_str)
        .ok_or_else(|| "Unsupported IDL descriptor".to_owned())?;
    match (kind, value) {
        ("string", NativeWireValue::Binary(bytes)) => String::from_utf8(bytes.clone())
            .map(Json::String)
            .map_err(|_| "IDL string is not valid UTF-8".into()),
        ("binary", NativeWireValue::Binary(bytes)) => Ok(serde_json::json!({"hex":hex(bytes)})),
        ("bool", NativeWireValue::Bool(value)) => Ok(Json::Bool(*value)),
        ("i8", NativeWireValue::Byte(value)) => Ok(Json::String(value.to_string())),
        ("i16", NativeWireValue::I16(value)) => Ok(Json::String(value.to_string())),
        ("i32", NativeWireValue::I32(value)) => Ok(Json::String(value.to_string())),
        ("i64", NativeWireValue::I64(value)) => Ok(Json::String(value.to_string())),
        ("double", NativeWireValue::Double(bits)) => {
            Ok(serde_json::json!({"bits":hex(&bits.to_le_bytes())}))
        }
        ("list", NativeWireValue::List(item_kind, items))
        | ("set", NativeWireValue::Set(item_kind, items)) => {
            if descriptor_wire_kind(
                ty.get("item")
                    .ok_or_else(|| "IDL item type is unavailable".to_owned())?,
                defs,
            )
            .as_deref()
                != wire_kind_name(*item_kind)
            {
                return Err("Collection element type does not match IDL".into());
            }
            let item_ty = ty.get("item").unwrap();
            items
                .iter()
                .enumerate()
                .map(|(i, item)| {
                    map_idl_value(item, item_ty, defs, diagnostics, &format!("{path}/{i}"))
                })
                .collect::<Result<Vec<_>, _>>()
                .map(Json::Array)
        }
        ("map", NativeWireValue::Map(key_kind, value_kind, entries)) => {
            let key_ty = ty
                .get("key")
                .ok_or_else(|| "IDL map key type is unavailable".to_owned())?;
            let value_ty = ty
                .get("value")
                .ok_or_else(|| "IDL map value type is unavailable".to_owned())?;
            if !entries.is_empty()
                && (descriptor_wire_kind(key_ty, defs).as_deref() != wire_kind_name(*key_kind)
                    || descriptor_wire_kind(value_ty, defs).as_deref()
                        != wire_kind_name(*value_kind))
            {
                return Err("Map element types do not match IDL".into());
            }
            entries.iter().enumerate().map(|(i,(key,value))| Ok(serde_json::json!({"key":map_idl_value(key,key_ty,defs,diagnostics,&format!("{path}/{i}/key"))?,"value":map_idl_value(value,value_ty,defs,diagnostics,&format!("{path}/{i}/value"))?}))).collect::<Result<Vec<_>,String>>().map(Json::Array)
        }
        _ => Err(format!("Expected {kind} wire value")),
    }
}

fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 15) as usize] as char);
    }
    out
}

fn wire_kind(kind: u8) -> Result<&'static str, EngineError> {
    match kind {
        1 | 2 => Ok("bool"),
        3 => Ok("i8"),
        4 => Ok("i16"),
        5 => Ok("i32"),
        6 => Ok("i64"),
        7 => Ok("double"),
        8 => Ok("binary"),
        9 => Ok("list"),
        10 => Ok("set"),
        11 => Ok("map"),
        12 => Ok("struct"),
        13 => Ok("uuid"),
        _ => Err(error(
            "PARQUET_FOOTER_DECODE",
            format!("Unknown Compact Protocol wire type {kind}"),
        )),
    }
}

fn wire_value(value: &NativeWireValue) -> Result<Value, EngineError> {
    let text_integer =
        |kind: &str, n: i64| object([("kind", string(kind)), ("value", string(n.to_string()))]);
    Ok(match value {
        NativeWireValue::Bool(value) => {
            object([("kind", string("bool")), ("value", Value::Bool(*value))])
        }
        NativeWireValue::Byte(value) => text_integer("i8", i64::from(*value)),
        NativeWireValue::I16(value) => text_integer("i16", i64::from(*value)),
        NativeWireValue::I32(value) => text_integer("i32", i64::from(*value)),
        NativeWireValue::I64(value) => text_integer("i64", *value),
        NativeWireValue::Double(bits) => object([
            ("kind", string("double")),
            ("bits", string(hex(&bits.to_le_bytes()))),
        ]),
        NativeWireValue::Binary(bytes) => {
            object([("kind", string("binary")), ("hex", string(hex(bytes)))])
        }
        NativeWireValue::Uuid(bytes) => {
            object([("kind", string("uuid")), ("hex", string(hex(bytes)))])
        }
        NativeWireValue::List(kind, items) | NativeWireValue::Set(kind, items) => {
            let name = if matches!(value, NativeWireValue::List(..)) {
                "list"
            } else {
                "set"
            };
            object([
                ("kind", string(name)),
                ("elementType", string(wire_kind(*kind)?)),
                (
                    "items",
                    array(
                        items
                            .iter()
                            .map(wire_value)
                            .collect::<Result<Vec<_>, _>>()?,
                    ),
                ),
            ])
        }
        NativeWireValue::Map(key_kind, value_kind, entries) => {
            let mut fields = vec![("kind", string("map"))];
            if !entries.is_empty() {
                fields.push(("keyType", string(wire_kind(*key_kind)?)));
                fields.push(("valueType", string(wire_kind(*value_kind)?)));
            }
            fields.push((
                "entries",
                array(
                    entries
                        .iter()
                        .map(|(key, value)| {
                            Ok(object([
                                ("key", wire_value(key)?),
                                ("value", wire_value(value)?),
                            ]))
                        })
                        .collect::<Result<Vec<_>, EngineError>>()?,
                ),
            ));
            object(fields)
        }
        NativeWireValue::Struct(fields) => object([
            ("kind", string("struct")),
            (
                "fields",
                array(
                    fields
                        .iter()
                        .map(|(id, value)| {
                            Ok(object([
                                ("id", Value::Number(f64::from(*id))),
                                ("value", wire_value(value)?),
                            ]))
                        })
                        .collect::<Result<Vec<_>, EngineError>>()?,
                ),
            ),
        ]),
    })
}

/// Return the recursive Compact Protocol wire view without interpreting the
/// Parquet IDL. Unknown field IDs, duplicate IDs, order, and exact numeric bits
/// stay visible in the value tree and the authoritative source.
pub fn decode_parquet_footer(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let framing = inspect_parquet_framing(document, engine, registry, capabilities, ctx)?;
    let source = value_member(&framing, "source")
        .ok_or_else(|| error("PARQUET_CAPTURE", "Framing result omitted its source"))?
        .clone();
    let mut out = vec![
        ("source", source),
        ("status", string("blocked")),
        ("complete", Value::Bool(false)),
    ];
    let mut ds = value_member(&framing, "diagnostics")
        .and_then(|value| match value {
            Value::Array(values) => Some(values.clone()),
            _ => None,
        })
        .unwrap_or_default();
    let Some(region) = value_member(&framing, "footerRegion") else {
        out.push(("diagnostics", diagnostics(ds)));
        return Ok(Value::Object(
            out.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect(),
        ));
    };
    if text_member(region, "mode").as_deref() == Some("encrypted") {
        ds.push(diagnostic(
            "PARQUET_FOOTER_ENCRYPTED",
            "",
            "error",
            "Encrypted footer requires a separate decryption implementation",
        ));
        out.push(("diagnostics", diagnostics(ds)));
        return Ok(Value::Object(
            out.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect(),
        ));
    }
    let bytes = export_parquet_capture(document, engine, registry, capabilities, ctx)?;
    match parquet_schema_decode::decode_compact_footer(&bytes, ctx) {
        Ok(DecodedFooter {
            value,
            consumed_bytes,
            trailing_bytes,
            ..
        }) => {
            out[1].1 = string("decoded");
            out.push(("value", wire_value(&value)?));
            out.push(("consumedBytes", int(consumed_bytes)));
            out.push(("trailingBytes", int(trailing_bytes)));
            if trailing_bytes != 0 {
                ds.push(diagnostic("PARQUET_FOOTER_TRAILING", "", "warning", "Bytes remain after the first struct; source retains them without interpreting signatures or other content"));
            }
            ds.push(diagnostic("PARQUET_FOOTER_SEMANTICS_UNVERIFIED", "", "warning", "Unknown IDs, duplicates, ordering and exact values are retained; the Parquet IDL and logical schema are not validated"));
        }
        Err(e) if e.is_control_failure() => return Err(e),
        Err(e) => ds.push(diagnostic(
            "PARQUET_FOOTER_DECODE",
            "",
            "error",
            &e.message.to_utf8().unwrap_or_default(),
        )),
    }
    out.push(("diagnostics", diagnostics(ds)));
    Ok(Value::Object(
        out.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect(),
    ))
}

/// Locate only the trailer-indicated byte range. A successful result never
/// certifies a valid Thrift footer, plaintext columns, or native semantics.
pub fn inspect_parquet_framing(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(document, ctx)?;
    let bytes = export_parquet_capture(&source, engine, registry, capabilities, ctx)?;
    let mut out = vec![
        ("source", source),
        ("status", string("invalid")),
        ("complete", Value::Bool(false)),
        ("byteLength", int(bytes.len())),
    ];
    let mut ds = Vec::new();
    match parquet_schema_decode::locate_footer(&bytes) {
        Ok(region) => {
            out[1].1 = string("located");
            out.push((
                "footerRegion",
                object([
                    ("offset", int(region.offset)),
                    ("length", int(region.length)),
                    (
                        "mode",
                        string(if region.encrypted {
                            "encrypted"
                        } else {
                            "plaintext-or-signed"
                        }),
                    ),
                ]),
            ));
            ds.push(diagnostic(
                "PARQUET_UNINTERPRETED",
                "",
                "warning",
                "Footer location alone does not validate Thrift metadata, schemas, pages, encryption, signatures or native values",
            ));
        }
        Err(e) => ds.push(diagnostic(
            &e.code,
            "",
            "error",
            &e.message.to_utf8().unwrap_or_default(),
        )),
    }
    out.push(("diagnostics", diagnostics(ds)));
    Ok(Value::Object(
        out.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect(),
    ))
}

fn metadata_parts(
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<(Option<DecodedFooter>, Option<Json>, Vec<Value>, String), EngineError> {
    let region = match parquet_schema_decode::locate_footer(bytes) {
        Ok(region) => region,
        Err(e) => {
            return Ok((
                None,
                None,
                vec![diagnostic(
                    &e.code,
                    "",
                    "error",
                    &e.message.to_utf8().unwrap_or_default(),
                )],
                "blocked".into(),
            ));
        }
    };
    let mut ds = vec![diagnostic(
        "PARQUET_UNINTERPRETED",
        "",
        "warning",
        "Footer location alone does not validate Thrift metadata, schemas, pages, encryption, signatures or native values",
    )];
    if region.encrypted {
        ds.push(diagnostic(
            "PARQUET_FOOTER_ENCRYPTED",
            "",
            "error",
            "Encrypted footer requires a separate decryption implementation",
        ));
        return Ok((None, None, ds, "blocked".into()));
    }
    let decoded = match parquet_schema_decode::decode_compact_footer(bytes, ctx) {
        Ok(value) => value,
        Err(e) if e.is_control_failure() => return Err(e),
        Err(e) => {
            ds.push(diagnostic(
                "PARQUET_FOOTER_DECODE",
                "",
                "error",
                &e.message.to_utf8().unwrap_or_default(),
            ));
            return Ok((
                None,
                None,
                ds,
                "blocked".into(),
            ));
        }
    };
    if decoded.trailing_bytes != 0 {
        ds.push(diagnostic("PARQUET_FOOTER_TRAILING", "", "warning", "Bytes remain after the first struct; source retains them without interpreting signatures or other content"));
    }
    ds.push(diagnostic("PARQUET_FOOTER_SEMANTICS_UNVERIFIED", "", "warning", "Unknown IDs, duplicates, ordering and exact values are retained; the Parquet IDL and logical schema are not validated"));
    let tree = match compact_as_json(&decoded.value) {
        Ok(value) => value,
        Err(message) => {
            return Ok((
                Some(decoded),
                None,
                {
                    ds.push(diagnostic("PARQUET_FOOTER_DECODE", "", "error", &message));
                    ds
                },
                "blocked".into(),
            ));
        }
    };
    let idl: Json = match serde_json::from_str(IDL) {
        Ok(value) => value,
        Err(_) => {
            return Ok((
                Some(decoded),
                None,
                {
                    ds.push(diagnostic(
                        "PARQUET_METADATA_SHAPE",
                        "",
                        "error",
                        "Pinned Parquet IDL resource is invalid",
                    ));
                    ds
                },
                "blocked".into(),
            ));
        }
    };
    let defs = match idl.get("definitions").and_then(Json::as_object) {
        Some(value) => value,
        None => {
            return Ok((
                Some(decoded),
                None,
                {
                    ds.push(diagnostic(
                        "PARQUET_METADATA_SHAPE",
                        "",
                        "error",
                        "Pinned Parquet IDL has no definitions",
                    ));
                    ds
                },
                "blocked".into(),
            ));
        }
    };
    let mapped = map_idl_value(
        &decoded.value,
        &serde_json::json!({"ref":"FileMetaData"}),
        defs,
        &mut ds,
        "",
    );
    match mapped {
        Ok(metadata) => {
            ds.push(diagnostic("PARQUET_METADATA_SEMANTICS_UNVERIFIED", "", "warning", "Known IDL shapes mapped; schema-tree consistency, logical constraints, native reading and safe edits remain unverified"));
            Ok((
                Some(decoded),
                Some(serde_json::json!({"wire":tree,"metadata":metadata})),
                ds,
                "mapped".into(),
            ))
        }
        Err(message) => {
            ds.push(diagnostic("PARQUET_METADATA_SHAPE", "", "error", &message));
            Ok((
                Some(decoded),
                Some(serde_json::json!({"wire":tree})),
                ds,
                "blocked".into(),
            ))
        }
    }
}

/// Map the pinned FileMetaData IDL while retaining the full wire tree and
/// exact capture. Unknown field IDs/codes stay visible and all results remain
/// incomplete, even when the known fields map successfully.
pub fn inspect_parquet_metadata(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(document, ctx)?;
    let bytes = export_parquet_capture(&source, engine, registry, capabilities, ctx)?;
    let (_, mapped, ds, status) = metadata_parts(&bytes, ctx)?;
    let mut out = vec![
        ("source", source),
        ("status", string(status)),
        ("complete", Value::Bool(false)),
    ];
    if let Some(mapped) = mapped {
        let wire = mapped.get("wire").cloned().unwrap_or(Json::Null);
        out.push(("wire", from_json(wire)));
        if status_is_mapped(&out[1].1) {
            if let Some(metadata) = mapped.get("metadata").cloned() {
                out.push(("metadata", from_json(metadata)));
            }
        }
    }
    out.push(("diagnostics", diagnostics(ds)));
    Ok(Value::Object(
        out.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect(),
    ))
}

fn status_is_mapped(value: &Value) -> bool {
    matches!(value, Value::String(v) if v.to_utf8().ok().as_deref() == Some("mapped"))
}

fn field<'a>(value: &'a Json, name: &str) -> Option<&'a Json> {
    value.as_object()?.get(name)
}
fn parse_i128(value: &Json) -> Option<i128> {
    value.as_str()?.parse().ok()
}
fn physical_type(value: &Json) -> Option<&'static str> {
    match value.as_str()?.parse::<i32>().ok()? {
        0 => Some("BOOLEAN"),
        1 => Some("INT32"),
        2 => Some("INT64"),
        3 => Some("INT96"),
        4 => Some("FLOAT"),
        5 => Some("DOUBLE"),
        6 => Some("BYTE_ARRAY"),
        7 => Some("FIXED_LEN_BYTE_ARRAY"),
        _ => None,
    }
}
fn text_path(path: &[String]) -> Json {
    Json::Array(path.iter().cloned().map(Json::String).collect())
}

fn schema_node(
    schema: &[Json],
    next: &mut usize,
    parent_path: &[String],
    mut definition_level: usize,
    mut repetition_level: usize,
    depth: usize,
    leaves: &mut Vec<Json>,
    warnings: &mut Vec<Value>,
) -> Result<Json, (String, String)> {
    if depth > 64 {
        return Err(("/schema".into(), "Schema nesting exceeds 64".into()));
    }
    if *next >= schema.len() {
        return Err((
            "/schema".into(),
            "Child count exceeds remaining schema elements".into(),
        ));
    }
    let index = *next;
    *next += 1;
    let element = &schema[index];
    let at = format!("/schema/{index}");
    let root = index == 0;
    let name = field(element, "name")
        .and_then(Json::as_str)
        .ok_or_else(|| (at.clone(), "SchemaElement name is unavailable".into()))?;
    let is_leaf = field(element, "type").is_some();
    if root {
        if is_leaf {
            return Err((at.clone(), "Root must be a group".into()));
        }
        if let Some(repetition) = field(element, "repetition_type") {
            if repetition.as_str() != Some("0") {
                return Err((
                    format!("{at}/repetition_type"),
                    "Only absent or legacy REQUIRED root repetition is understood".into(),
                ));
            }
            warnings.push(diagnostic("PARQUET_ROOT_REPETITION",&format!("{at}/repetition_type"),"warning","REQUIRED root repetition retained; root contributes no definition/repetition level"));
        }
    } else {
        let repetition = field(element, "repetition_type")
            .and_then(Json::as_str)
            .ok_or_else(|| {
                (
                    format!("{at}/repetition_type"),
                    "Non-root node requires known repetition".into(),
                )
            })?;
        if !matches!(repetition, "0" | "1" | "2") {
            return Err((
                format!("{at}/repetition_type"),
                "Non-root node requires known repetition".into(),
            ));
        }
        if repetition != "0" {
            definition_level += 1;
        }
        if repetition == "2" {
            repetition_level += 1;
        }
    }
    let mut path = parent_path.to_vec();
    if !root {
        path.push(name.to_owned());
    }
    let mut children = Vec::new();
    if is_leaf {
        if field(element, "num_children").is_some() {
            return Err((at.clone(), "Primitive cannot also declare children".into()));
        }
        let physical = physical_type(field(element, "type").unwrap()).ok_or_else(|| {
            (
                format!("{at}/type"),
                "Unknown physical type cannot supply a physical schema view".into(),
            )
        })?;
        if physical == "FIXED_LEN_BYTE_ARRAY"
            && parse_i128(field(element, "type_length").unwrap_or(&Json::Null)).unwrap_or(0) <= 0
        {
            return Err((
                format!("{at}/type_length"),
                "Fixed byte arrays require a positive length".into(),
            ));
        }
        leaves.push(serde_json::json!({"index":index,"ordinal":leaves.len(),"path":text_path(&path),"physicalType":physical,"definitionLevel":definition_level,"repetitionLevel":repetition_level}));
    } else {
        let count =
            parse_i128(field(element, "num_children").unwrap_or(&Json::Null)).ok_or_else(|| {
                (
                    format!("{at}/num_children"),
                    "Group requires a feasible nonnegative child count".into(),
                )
            })?;
        if count < 0 || count > schema.len().saturating_sub(*next) as i128 {
            return Err((
                format!("{at}/num_children"),
                "Group requires a feasible nonnegative child count".into(),
            ));
        }
        let mut names = std::collections::BTreeSet::new();
        for _ in 0..count {
            let child = schema_node(
                schema,
                next,
                &path,
                definition_level,
                repetition_level,
                depth + 1,
                leaves,
                warnings,
            )?;
            let child_name = child.get("name").and_then(Json::as_str).unwrap_or("");
            if !names.insert(child_name.to_owned()) {
                warnings.push(diagnostic(
                    "PARQUET_DUPLICATE_FIELD_NAME",
                    &at,
                    "warning",
                    "Sibling names repeat; use schema indexes/column ordinals as identity",
                ));
            }
            children.push(child);
        }
    }
    Ok(
        serde_json::json!({"index":index,"name":name,"path":text_path(&path),"definitionLevel":definition_level,"repetitionLevel":repetition_level,"children":children}),
    )
}

/// Check the pinned physical schema tree and row-group column links. This
/// verifies neither logical annotations nor page contents and never emits a
/// partial tree for a structurally blocked schema.
pub fn inspect_parquet_schema(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(document, ctx)?;
    let bytes = export_parquet_capture(&source, engine, registry, capabilities, ctx)?;
    let (_, mapped, mut ds, status) = metadata_parts(&bytes, ctx)?;
    let mut out = vec![
        ("source", source),
        ("status", string("blocked")),
        ("complete", Value::Bool(false)),
    ];
    let Some(mapped) = mapped else {
        out.push(("diagnostics", diagnostics(ds)));
        return Ok(Value::Object(
            out.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect(),
        ));
    };
    if let Some(wire) = mapped.get("wire").cloned() {
        out.push(("wire", from_json(wire)));
    }
    if let Some(metadata) = mapped.get("metadata").cloned() {
        out.push(("metadata", from_json(metadata.clone())));
    } else {
        out.push(("diagnostics", diagnostics(ds)));
        return Ok(Value::Object(
            out.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect(),
        ));
    }
    if status != "mapped" {
        out.push(("diagnostics", diagnostics(ds)));
        return Ok(Value::Object(
            out.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect(),
        ));
    }
    let metadata = mapped.get("metadata").unwrap();
    let schema = field(metadata, "schema")
        .and_then(Json::as_array)
        .ok_or_else(|| {
            error(
                "PARQUET_METADATA_SHAPE",
                "FileMetaData.schema is unavailable",
            )
        })?;
    let mut leaves = Vec::new();
    let mut next = 0;
    let mut warnings = Vec::new();
    let checked = (|| -> Result<Json, (String, String)> {
        if schema.is_empty() {
            return Err(("/schema".into(), "Schema must contain a root".into()));
        }
        let tree = schema_node(schema, &mut next, &[], 0, 0, 0, &mut leaves, &mut warnings)?;
        if next != schema.len() {
            return Err((
                format!("/schema/{next}"),
                "Unattached schema elements remain after the root tree".into(),
            ));
        }
        if let Some(orders) = field(metadata, "column_orders") {
            if orders.as_array().map(Vec::len) != Some(leaves.len()) {
                return Err((
                    "/column_orders".into(),
                    "Column order count must match physical leaf count".into(),
                ));
            }
        }
        let row_groups = field(metadata, "row_groups")
            .and_then(Json::as_array)
            .ok_or_else(|| ("/row_groups".into(), "Row groups are unavailable".into()))?;
        let mut row_count = 0i128;
        for (g, group) in row_groups.iter().enumerate() {
            let at = format!("/row_groups/{g}");
            let rows = parse_i128(field(group, "num_rows").unwrap_or(&Json::Null))
                .ok_or_else(|| (format!("{at}/num_rows"), "Row count is unavailable".into()))?;
            if rows < 0 {
                return Err((
                    format!("{at}/num_rows"),
                    "Row count cannot be negative".into(),
                ));
            }
            row_count = row_count.checked_add(rows).ok_or_else(|| {
                (
                    "/num_rows".into(),
                    "Row count total exceeds supported integer range".into(),
                )
            })?;
            let columns = field(group, "columns")
                .and_then(Json::as_array)
                .ok_or_else(|| {
                    (
                        format!("{at}/columns"),
                        "Row-group columns are unavailable".into(),
                    )
                })?;
            if columns.len() != leaves.len() {
                return Err((
                    format!("{at}/columns"),
                    "Column count must match physical schema leaves".into(),
                ));
            }
            for (i, column) in columns.iter().enumerate() {
                let where_path = format!("{at}/columns/{i}");
                let Some(chunk) = field(column, "meta_data").filter(|value| !value.is_null())
                else {
                    warnings.push(diagnostic(
                        "PARQUET_COLUMN_METADATA_UNAVAILABLE",
                        &where_path,
                        "warning",
                        "Missing/encrypted column metadata prevents physical link verification",
                    ));
                    continue;
                };
                let leaf = &leaves[i];
                if field(chunk, "path_in_schema") != leaf.get("path") {
                    return Err((
                        format!("{where_path}/meta_data/path_in_schema"),
                        "Column path does not match its schema leaf ordinal".into(),
                    ));
                }
                let column_type = field(chunk, "type").and_then(physical_type);
                if column_type != leaf.get("physicalType").and_then(Json::as_str) {
                    return Err((
                        format!("{where_path}/meta_data/type"),
                        "Column physical type differs from schema leaf".into(),
                    ));
                }
                if field(column, "file_path").is_some() {
                    warnings.push(diagnostic(
                        "PARQUET_EXTERNAL_COLUMN",
                        &format!("{where_path}/file_path"),
                        "warning",
                        "External column source is retained without fetching or checking its bytes",
                    ));
                }
            }
        }
        let declared = parse_i128(field(metadata, "num_rows").unwrap_or(&Json::Null))
            .ok_or_else(|| ("/num_rows".into(), "File row count is unavailable".into()))?;
        if row_count != declared {
            return Err((
                "/num_rows".into(),
                "File row count differs from row-group total".into(),
            ));
        }
        Ok(tree)
    })();
    ds.extend(warnings);
    match checked {
        Ok(tree) => {
            out[1].1 = string("checked");
            out.push(("tree", from_json(tree)));
            out.push(("leaves", from_json(Json::Array(leaves))));
            ds.push(diagnostic("PARQUET_LOGICAL_SEMANTICS_UNVERIFIED","","warning","Physical topology and available column links checked; logical annotations, page values, offsets and safe transforms remain unverified"));
        }
        Err((path, message)) => ds.push(diagnostic(
            "PARQUET_SCHEMA_STRUCTURE",
            &path,
            "error",
            &message,
        )),
    }
    out.push(("diagnostics", diagnostics(ds)));
    Ok(Value::Object(
        out.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect(),
    ))
}

fn has_unknown_json(value: &Json) -> bool {
    match value {
        Json::Array(values) => values.iter().any(has_unknown_json),
        Json::Object(fields) => fields.iter().any(|(key, value)| {
            (key == "$unknown" && value.as_array().is_some_and(|items| !items.is_empty()))
                || has_unknown_json(value)
        }),
        _ => false,
    }
}

fn push_diagnostic_json(
    diagnostics: &mut Vec<Json>,
    code: &str,
    path: &str,
    severity: &str,
    message: &str,
) {
    diagnostics.push(serde_json::json!({
        "code": code,
        "path": path,
        "severity": severity,
        "message": message
    }));
}

/// Inspect the IDL logical annotations without decoding pages or changing the
/// authoritative capture. Unknown annotations and parameters remain visible.
pub fn inspect_parquet_logical_types(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let schema_result = inspect_parquet_schema(
        document,
        engine,
        registry,
        capabilities,
        ctx,
    )?;
    let mut result = to_json_selected(
        &schema_result,
        &[
            "status",
            "complete",
            "metadata",
            "diagnostics",
            "tree",
            "leaves",
        ],
    )?;
    if result.get("status").and_then(Json::as_str) != Some("checked") {
        return Ok(preserve_raw_fields(
            from_json(result),
            &schema_result,
            &["source", "wire", "metadata", "tree", "leaves"],
        ));
    }
    let schema = result
        .get("metadata")
        .and_then(|value| value.get("schema"))
        .and_then(Json::as_array)
        .cloned()
        .unwrap_or_default();
    ctx.charge_work(schema.len(), Utf16::default())?;
    let legacy = [
        "STRING", "MAP", "MAP_KEY_VALUE", "LIST", "ENUM", "DECIMAL", "DATE",
        "TIME_MILLIS", "TIME_MICROS", "TIMESTAMP_MILLIS", "TIMESTAMP_MICROS",
        "UINT_8", "UINT_16", "UINT_32", "UINT_64", "INT_8", "INT_16", "INT_32",
        "INT_64", "JSON", "BSON", "INTERVAL",
    ];
    let mut annotations = Vec::new();
    let mut diagnostics = result
        .get("diagnostics")
        .and_then(Json::as_array)
        .cloned()
        .unwrap_or_default();
    let mut blocked = false;
    for (index, element) in schema.iter().enumerate() {
        let logical = element.get("logicalType").filter(|v| !v.is_null());
        let converted = element.get("converted_type").and_then(Json::as_str);
        if logical.is_none() && converted.is_none() {
            continue;
        }
        let path = format!("/schema/{index}");
        let origin = if logical.is_some() { "logical" } else { "converted" };
        let modern = logical
            .and_then(Json::as_object)
            .and_then(|fields| fields.iter().find(|(key, _)| key.as_str() != "$unknown"));
        let mut name = modern
            .map(|(key, _)| key.clone())
            .or_else(|| {
                if origin == "converted" {
                    converted
                        .and_then(|code| code.parse::<usize>().ok())
                        .and_then(|code| legacy.get(code))
                        .map(|value| (*value).to_owned())
                } else {
                    None
                }
            });
        let mut parameters = modern
            .map(|(_, value)| value.clone())
            .unwrap_or_else(|| serde_json::json!({}));
        let mut validation = "checked";
        let mut converted_annotation: Option<String> = None;
        let type_code = element.get("type").and_then(Json::as_str);
        let type_length = element.get("type_length").and_then(Json::as_str);
        let mut issue = |code: &str, at: &str, message: &str, is_error: bool| {
            push_diagnostic_json(
                &mut diagnostics,
                code,
                at,
                if is_error { "error" } else { "warning" },
                message,
            );
            if is_error {
                blocked = true;
            }
        };
        let Some(mut logical_name) = name.take() else {
            annotations.push(serde_json::json!({
                "index": index, "origin": origin, "name": "unknown",
                "parameters": logical.cloned().unwrap_or_else(|| serde_json::json!({"code": converted})),
                "validation": "uninterpreted"
            }));
            issue(
                "PARQUET_LOGICAL_UNKNOWN",
                &path,
                "Unknown logical/converted annotation retained without fallback interpretation",
                false,
            );
            continue;
        };
        if origin == "converted" {
            if logical_name.starts_with("UINT_") || logical_name.starts_with("INT_") {
                let signed = logical_name.starts_with("INT_");
                let width = logical_name.rsplit('_').next().unwrap_or_default().to_owned();
                logical_name = "INTEGER".to_owned();
                parameters = serde_json::json!({"bitWidth": width, "isSigned": signed});
            } else if logical_name == "DECIMAL" {
                let mut value = serde_json::Map::new();
                if let Some(precision) = element.get("precision") {
                    value.insert("precision".into(), precision.clone());
                }
                value.insert(
                    "scale".into(),
                    element
                        .get("scale")
                        .cloned()
                        .unwrap_or_else(|| Json::String("0".into())),
                );
                parameters = Json::Object(value);
            } else if logical_name.starts_with("TIME_")
                || logical_name.starts_with("TIMESTAMP_")
            {
                let is_time = logical_name.starts_with("TIME_");
                let unit = logical_name.rsplit('_').next().unwrap_or_default().to_owned();
                logical_name = if is_time { "TIME" } else { "TIMESTAMP" }.into();
                parameters = serde_json::json!({
                    "isAdjustedToUTC": true,
                    "unit": { unit: {} }
                });
            }
        }
        let annotation_name = logical_name.clone();
        let invalid = |message: &str,
                       validation: &mut &str,
                       issue: &mut dyn FnMut(&str, &str, &str, bool)| {
            *validation = "invalid";
            issue("PARQUET_LOGICAL_CONFLICT", &path, message, true);
        };
        let uninterpreted = |message: &str,
                             validation: &mut &str,
                             issue: &mut dyn FnMut(&str, &str, &str, bool)| {
            if *validation != "invalid" {
                *validation = "uninterpreted";
            }
            issue("PARQUET_LOGICAL_UNVERIFIED", &path, message, false);
        };
        let incompatible = |types: &[&str]| !type_code.is_some_and(|code| types.contains(&code));
        match logical_name.as_str() {
            "STRING" | "ENUM" | "JSON" | "BSON" | "GEOMETRY" | "GEOGRAPHY" => {
                if incompatible(&["6"]) {
                    invalid(&format!("{logical_name} is incompatible with this physical type"), &mut validation, &mut issue);
                }
                converted_annotation = match logical_name.as_str() {
                    "STRING" => Some("0".into()), "ENUM" => Some("4".into()),
                    "JSON" => Some("19".into()), "BSON" => Some("20".into()), _ => None,
                };
                if logical_name == "GEOMETRY" || logical_name == "GEOGRAPHY" {
                    uninterpreted("Physical carrier checked; CRS, interpolation and WKB semantics remain unverified", &mut validation, &mut issue);
                }
            }
            "UUID" | "FLOAT16" | "INTERVAL" => {
                let length = match logical_name.as_str() { "UUID" => "16", "FLOAT16" => "2", _ => "12" };
                if incompatible(&["7"]) { invalid(&format!("{logical_name} is incompatible with this physical type"), &mut validation, &mut issue); }
                if type_length != Some(length) { invalid(&format!("{logical_name} requires byte length {length}"), &mut validation, &mut issue); }
                if logical_name == "INTERVAL" { converted_annotation = Some("21".into()); }
            }
            "DATE" => {
                if incompatible(&["1"]) { invalid("DATE is incompatible with this physical type", &mut validation, &mut issue); }
                converted_annotation = Some("6".into());
            }
            "INTEGER" => {
                let width = parameters.get("bitWidth").and_then(Json::as_str).unwrap_or("");
                let signed = parameters.get("isSigned").and_then(Json::as_bool);
                if !["8", "16", "32", "64"].contains(&width) { invalid("Integer bitWidth must be 8, 16, 32 or 64", &mut validation, &mut issue); }
                else {
                    if incompatible(&[if width == "64" { "2" } else { "1" }]) { invalid("INTEGER is incompatible with this physical type", &mut validation, &mut issue); }
                    if let Some(signed) = signed { let offset = if signed { 15 } else { 11 }; let index = ["8", "16", "32", "64"].iter().position(|v| *v == width).unwrap_or(0); converted_annotation = Some((offset + index).to_string()); }
                }
            }
            "DECIMAL" => {
                if incompatible(&["1", "2", "6", "7"]) { invalid("DECIMAL is incompatible with this physical type", &mut validation, &mut issue); }
                let precision = parameters.get("precision").and_then(Json::as_str).unwrap_or("0").parse::<i128>().unwrap_or(0);
                let scale = parameters.get("scale").and_then(Json::as_str).unwrap_or("0").parse::<i128>().unwrap_or(0);
                if precision <= 0 || scale < 0 || scale > precision { invalid("Decimal precision must be positive and scale between zero and precision", &mut validation, &mut issue); }
                if type_code == Some("1") && precision > 9 || type_code == Some("2") && precision > 18 { invalid("Decimal precision exceeds integer physical capacity", &mut validation, &mut issue); }
                if type_code == Some("2") && precision > 0 && precision < 10 { issue("PARQUET_DECIMAL_SMALL_INT64", &path, "Decimal precision below 10 uses an int64 carrier", false); }
                if type_code == Some("7") {
                    let length = type_length.and_then(|v| v.parse::<u32>().ok()).unwrap_or(0);
                    if length > 4096 { uninterpreted("Fixed-decimal capacity check exceeds the 4096-byte exact-arithmetic limit", &mut validation, &mut issue); }
                    else if length > 0 { let maximum = ((BigUint::from(1u8) << (length as usize * 8 - 1)) - 1u8).to_string().len().saturating_sub(1); if precision > maximum as i128 { invalid("Decimal precision exceeds fixed-byte physical capacity", &mut validation, &mut issue); } }
                }
                converted_annotation = Some("5".into());
                if origin == "logical" { for key in ["precision", "scale"] { if let (Some(native), Some(authoritative)) = (element.get(key), parameters.get(key)) { if native != authoritative { issue("PARQUET_LEGACY_ANNOTATION_CONFLICT", &format!("{path}/{key}"), "Legacy decimal parameter differs from authoritative logical annotation", false); } } } }
            }
            "TIME" | "TIMESTAMP" => {
                let unit_object = parameters.get("unit").and_then(Json::as_object);
                let unit = unit_object.and_then(|v| v.keys().find(|key| key.as_str() != "$unknown")).map(String::as_str);
                if unit.is_none() {
                    if unit_object.and_then(|v| v.get("$unknown")).is_some() { uninterpreted("Future temporal unit remains uninterpreted", &mut validation, &mut issue); }
                    else { invalid("Temporal unit must select one alternative", &mut validation, &mut issue); }
                } else if let Some(unit) = unit {
                    if !["MILLIS", "MICROS", "NANOS"].contains(&unit) { uninterpreted("Future temporal unit remains uninterpreted", &mut validation, &mut issue); }
                    else { let required = if logical_name == "TIME" && unit == "MILLIS" { "1" } else { "2" }; if incompatible(&[required]) { invalid(&format!("{logical_name} is incompatible with this physical type"), &mut validation, &mut issue); }
                        converted_annotation = if unit == "NANOS" { None } else { Some(((if logical_name == "TIME" { 7 } else { 9 }) + usize::from(unit == "MICROS")).to_string()) };
                    }
                }
            }
            "LIST" | "MAP" | "MAP_KEY_VALUE" | "VARIANT" | "FILE" => {
                if type_code.is_some() { invalid(&format!("{logical_name} requires a group"), &mut validation, &mut issue); }
                uninterpreted("Nested layout and value rules remain unverified", &mut validation, &mut issue);
                converted_annotation = match logical_name.as_str() { "LIST" => Some("3".into()), "MAP" => Some("1".into()), "MAP_KEY_VALUE" => Some("2".into()), _ => None };
            }
            "UNKNOWN" => uninterpreted("Always-null annotation retained; stored nullness has not been verified", &mut validation, &mut issue),
            _ => uninterpreted("Logical annotation has no implemented rule set", &mut validation, &mut issue),
        }
        if has_unknown_json(&parameters) { uninterpreted("Additional logical parameters remain uninterpreted", &mut validation, &mut issue); }
        if origin == "logical" {
            if let Some(expected) = converted_annotation {
                match element.get("converted_type") {
                    None => issue("PARQUET_LEGACY_ANNOTATION_ABSENT", &path, "Corresponding legacy annotation is absent; source remains unchanged", false),
                    Some(actual) if actual.as_str() != Some(expected.as_str()) => issue("PARQUET_LEGACY_ANNOTATION_CONFLICT", &path, "Legacy annotation conflicts with authoritative logical annotation", false),
                    _ => {}
                }
            }
        }
        annotations.push(serde_json::json!({"index": index, "origin": origin, "name": annotation_name, "parameters": parameters, "validation": validation}));
    }
    push_diagnostic_json(&mut diagnostics, "PARQUET_LOGICAL_VALUES_UNVERIFIED", "", "warning", "Annotation checks do not verify values, statistics, sort order or safe cross-system lowering");
    if let Json::Object(fields) = &mut result {
        fields.insert("annotations".into(), Json::Array(annotations));
        fields.insert("diagnostics".into(), Json::Array(diagnostics));
        if blocked { fields.insert("status".into(), Json::String("blocked".into())); }
    }
    Ok(preserve_raw_fields(
        from_json(result),
        &schema_result,
        &["source", "wire", "metadata", "tree", "leaves"],
    ))
}

/// Interpret Parquet LIST/MAP layout metadata while retaining source names,
/// annotations and bytes. Partial container observations accompany blocked
/// structure only where the TypeScript profile does so.
pub fn inspect_parquet_containers(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let logical_result = inspect_parquet_logical_types(
        document,
        engine,
        registry,
        capabilities,
        ctx,
    )?;
    let mut result = to_json_selected(
        &logical_result,
        &[
            "status",
            "complete",
            "metadata",
            "diagnostics",
            "tree",
            "leaves",
            "annotations",
        ],
    )?;
    let Some(tree) = result.get("tree").cloned() else {
        return Ok(preserve_raw_fields(
            from_json(result),
            &logical_result,
            &["source", "wire", "metadata"],
        ));
    };
    let schema = result
        .get("metadata")
        .and_then(|value| value.get("schema"))
        .and_then(Json::as_array)
        .cloned()
        .unwrap_or_default();
    ctx.charge_work(schema.len(), Utf16::default())?;
    let annotations: std::collections::BTreeMap<usize, String> = result
        .get("annotations")
        .and_then(Json::as_array)
        .into_iter()
        .flatten()
        .filter_map(|value| {
            Some((value.get("index")?.as_u64()? as usize, value.get("name")?.as_str()?.into()))
        })
        .collect();
    let mut containers = Vec::<Json>::new();
    let mut diagnostics = result
        .get("diagnostics")
        .and_then(Json::as_array)
        .cloned()
        .unwrap_or_default();
    fn walk(
        node: &Json,
        parent: Option<usize>,
        schema: &[Json],
        annotations: &std::collections::BTreeMap<usize, String>,
        containers: &mut Vec<Json>,
        diagnostics: &mut Vec<Json>,
        blocked: &mut bool,
        invalid_annotations: &mut std::collections::BTreeSet<usize>,
    ) {
        let Some(index) = node.get("index").and_then(Json::as_u64).map(|v| v as usize) else { return };
        let Some(element) = schema.get(index) else { return };
        let name = annotations.get(&index).map(String::as_str);
        if matches!(name, Some("LIST" | "MAP" | "MAP_KEY_VALUE")) {
            let parent_name = parent.and_then(|value| annotations.get(&value)).map(String::as_str);
            let entry_marker = name == Some("MAP_KEY_VALUE") && matches!(parent_name, Some("MAP" | "MAP_KEY_VALUE"));
            if !entry_marker {
                let children = node.get("children").and_then(Json::as_array).cloned().unwrap_or_default();
                let mut valid = true;
                macro_rules! fail {
                    ($message:expr) => {{
                        valid = false;
                        *blocked = true;
                        invalid_annotations.insert(index);
                        push_diagnostic_json(diagnostics, "PARQUET_CONTAINER_STRUCTURE", &format!("/schema/{index}"), "error", $message);
                    }};
                }
                let node_type = element.get("type");
                if index == 0 || node_type.is_some() { fail!("Container must annotate a non-root group"); }
                let repeated = children.first();
                let repeated_index = repeated.and_then(|v| v.get("index")).and_then(Json::as_u64).map(|v| v as usize);
                if children.len() != 1 || repeated_index.and_then(|i| schema.get(i)).and_then(|v| v.get("repetition_type")).and_then(Json::as_str) != Some("2") { fail!("Container requires exactly one repeated child"); }
                if valid {
                    if let (Some(repeated), Some(repeated_index)) = (repeated, repeated_index) {
                        let repeated_element = schema.get(repeated_index).unwrap_or(&Json::Null);
                        let repeated_children = repeated.get("children").and_then(Json::as_array).cloned().unwrap_or_default();
                        if name == Some("LIST") {
                            let single = repeated_children.first();
                            let single_index = single.and_then(|v| v.get("index")).and_then(Json::as_u64).map(|v| v as usize);
                            let single_repetition = single_index.and_then(|i| schema.get(i)).and_then(|v| v.get("repetition_type")).and_then(Json::as_str);
                            let repeated_name = repeated_element.get("name").and_then(Json::as_str).unwrap_or("");
                            let outer_name = element.get("name").and_then(Json::as_str).unwrap_or("");
                            let two_level = repeated_element.get("type").is_some() || repeated_children.len() > 1 || single_repetition == Some("2") || repeated_name == "array" || repeated_name == format!("{outer_name}_tuple");
                            if repeated_element.get("type").is_none() && repeated_children.is_empty() { fail!("Repeated list group must have an element"); }
                            if element.get("repetition_type").and_then(Json::as_str) == Some("2") {
                                let outer = containers.iter().any(|container| container.get("kind").and_then(Json::as_str) == Some("list") && container.get("elementIndex").and_then(Json::as_u64) == Some(index as u64) && container.get("layout").and_then(Json::as_str) == Some("two-level"));
                                if !outer { fail!("Repeated LIST must be an element of another two-level LIST"); }
                            }
                            if valid {
                                let element_index = if two_level { repeated_index } else { single_index.unwrap_or(repeated_index) };
                                let element_nullable = !two_level && single_index.and_then(|i| schema.get(i)).and_then(|v| v.get("repetition_type")).and_then(Json::as_str) == Some("1");
                                containers.push(serde_json::json!({"index":index,"kind":"list","nullable":element.get("repetition_type").and_then(Json::as_str)==Some("1"),"repeatedIndex":repeated_index,"elementIndex":element_index,"elementNullable":element_nullable,"layout":if two_level {"two-level"} else {"three-level"}}));
                            }
                        } else {
                            if element.get("repetition_type").and_then(Json::as_str) == Some("2") { fail!("MAP cannot have repeated outer repetition"); }
                            let key = repeated_children.first().and_then(|v| v.get("index")).and_then(Json::as_u64).map(|v| v as usize);
                            let value = repeated_children.get(1).and_then(|v| v.get("index")).and_then(Json::as_u64).map(|v| v as usize);
                            if repeated_element.get("type").is_some() || repeated_children.is_empty() || repeated_children.len() > 2 { fail!("Map entry must be a group with a key and optional value"); }
                            if key.and_then(|i| schema.get(i)).and_then(|v| v.get("repetition_type")).and_then(Json::as_str).is_some_and(|v| v != "0") { fail!("Map key must be required"); }
                            if value.and_then(|i| schema.get(i)).and_then(|v| v.get("repetition_type")).and_then(Json::as_str) == Some("2") { fail!("Map value cannot be repeated"); }
                            if valid {
                                let mut container = serde_json::json!({"index":index,"kind":"map","nullable":element.get("repetition_type").and_then(Json::as_str)==Some("1"),"repeatedIndex":repeated_index,"keyIndex":key.unwrap_or(repeated_index),"valueNullable":value.and_then(|i| schema.get(i)).and_then(|v| v.get("repetition_type")).and_then(Json::as_str).is_none_or(|v| v=="1"),"duplicateKeys":"last-value"});
                                if let Some(value) = value { container["valueIndex"] = serde_json::json!(value); }
                                containers.push(container);
                            }
                        }
                    }
                }
            }
        }
        if let Some(children) = node.get("children").and_then(Json::as_array) {
            for child in children { walk(child, Some(index), schema, annotations, containers, diagnostics, blocked, invalid_annotations); }
        }
    }
    let mut blocked = false;
    let mut invalid_annotations = std::collections::BTreeSet::new();
    walk(&tree, None, &schema, &annotations, &mut containers, &mut diagnostics, &mut blocked, &mut invalid_annotations);
    if let Some(items) = result.get_mut("annotations").and_then(Json::as_array_mut) {
        for annotation in items {
            if annotation.get("index").and_then(Json::as_u64).is_some_and(|index| invalid_annotations.contains(&(index as usize))) {
                annotation["validation"] = Json::String("invalid".into());
            }
        }
    }
    push_diagnostic_json(&mut diagnostics, "PARQUET_CONTAINER_VALUES_UNVERIFIED", "", "warning", "LIST/MAP schema interpretation does not decode values or verify key duplicates; partial views may accompany blocked sources");
    if let Json::Object(fields) = &mut result {
        fields.insert("containers".into(), Json::Array(containers));
        fields.insert("diagnostics".into(), Json::Array(diagnostics));
        if blocked { fields.insert("status".into(), Json::String("blocked".into())); }
    }
    Ok(preserve_raw_fields(
        from_json(result),
        &logical_result,
        &["source", "wire", "metadata"],
    ))
}

fn parquet_source_document(document: &Value) -> Result<Value, EngineError> {
    let parquet_module = find_module(document, "parquet")
        .ok_or_else(|| error("PARQUET_CAPTURE", "Missing Parquet source"))?;
    let source_element = value_member(parquet_module, "elements")
        .and_then(|v| match v { Value::Array(items) => items.iter().find(|item| text_member(item, "id").as_deref() == Some("source")), _ => None })
        .ok_or_else(|| error("PARQUET_CAPTURE", "Missing Parquet source"))?;
    let payload = value_member(value_member(source_element, "extensions").unwrap_or(&Value::Null), "umf.parquet")
        .cloned().ok_or_else(|| error("PARQUET_CAPTURE", "Missing Parquet source"))?;
    let vocab = value_member(value_member(document, "vocabularies").unwrap_or(&Value::Null), "umf.parquet")
        .cloned().ok_or_else(|| error("PARQUET_CAPTURE", "Missing Parquet source"))?;
    Ok(object([
        ("umf", value_member(document, "umf").cloned().unwrap_or(Value::Null)),
        ("id", value_member(document, "id").cloned().unwrap_or(Value::Null)),
        ("vocabularies", object([("umf.parquet", vocab)])),
        ("modules", array([object([("id", string("parquet")), ("namespace", string("")), ("elements", array([object([("id", string("source")), ("extensions", object([("umf.parquet", payload)]))])]))])])),
    ]))
}

/// Return the ordered core field projection, leaving nested layout and native
/// semantics in each `nativeField` observation.
pub fn get_parquet_field_metadata(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let raw = parquet_source_document(document)?;
    let logical_result =
        inspect_parquet_logical_types(&raw, engine, registry, capabilities, ctx)?;
    let inspected = to_json_selected(
        &logical_result,
        &[
            "status",
            "metadata",
            "diagnostics",
            "tree",
            "leaves",
            "annotations",
        ],
    )?;
    let diagnostics = inspected.get("diagnostics").and_then(Json::as_array).cloned().unwrap_or_default();
    let mut fields = Vec::new();
    if inspected.get("status").and_then(Json::as_str) == Some("checked") {
        let schema = inspected.get("metadata").and_then(|v| v.get("schema")).and_then(Json::as_array).cloned().unwrap_or_default();
        let annotations: std::collections::BTreeMap<usize, (String, String)> = inspected.get("annotations").and_then(Json::as_array).into_iter().flatten().filter_map(|v| Some((v.get("index")?.as_u64()? as usize, (v.get("name")?.as_str()?.into(), v.get("validation")?.as_str()?.into())))).collect();
        ctx.charge_work(schema.len(), Utf16::default())?;
        let tree = inspected.get("tree").cloned().unwrap_or(Json::Null);
        fn walk(node: &Json, schema: &[Json], annotations: &std::collections::BTreeMap<usize, (String, String)>, fields: &mut Vec<Json>) {
            let index = node.get("index").and_then(Json::as_u64).unwrap_or(0) as usize;
            if index != 0 {
                if let Some(native) = schema.get(index) {
                    let mut scalar = None;
                    if native.get("type").is_some() {
                        if let Some((name, validation)) = annotations.get(&index) {
                            if validation == "checked" {
                                scalar = match name.as_str() { "STRING" | "ENUM" => Some("string"), "DECIMAL" => Some("decimal"), "DATE" => Some("date"), "TIME" => Some("time"), "TIMESTAMP" => Some("timestamp"), "INTEGER" => Some("integer"), "FLOAT16" => Some("float"), _ => None };
                            }
                        } else {
                            scalar = match native.get("type").and_then(Json::as_str) { Some("0") => Some("boolean"), Some("1"|"2") => Some("integer"), Some("4"|"5") => Some("float"), Some("6"|"7") => Some("binary"), _ => None };
                        }
                        if has_unknown_json(native) { scalar = None; }
                    }
                    let mut element = serde_json::json!({"id":format!("schema:{index}"),"name":native.get("name"),"extensions":{}});
                    if let Some(scalar) = scalar { element["scalarType"] = Json::String(scalar.into()); }
                    fields.push(serde_json::json!({"index":index,"path":node.get("path"),"definitionLevel":node.get("definitionLevel"),"repetitionLevel":node.get("repetitionLevel"),"element":element,"nativeField":native}));
                }
            }
            if let Some(children) = node.get("children").and_then(Json::as_array) { for child in children { walk(child, schema, annotations, fields); } }
        }
        walk(&tree, &schema, &annotations, &mut fields);
    }
    let result = serde_json::json!({"status":inspected.get("status").cloned().unwrap_or(Json::String("blocked".into())),"complete":false,"fields":fields,"diagnostics":diagnostics});
    Ok(from_json(result))
}

/// Capture bytes and add materialized core fields only after logical metadata
/// inspection succeeds. `capture_parquet` remains the preservation path.
pub fn import_parquet_schema(
    bytes: &[u8],
    id: &Utf16,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut document = capture_parquet(bytes, id, engine, registry, capabilities, ctx)?;
    let captured = document.clone();
    let view = to_json(&get_parquet_field_metadata(&captured, engine, registry, capabilities, ctx)?)?;
    if view.get("status").and_then(Json::as_str) != Some("checked") {
        return Err(error("PARQUET_FIELD_METADATA", "Schema cannot be interpreted; captureParquet can preserve the source"));
    }
    let elements = view.get("fields").and_then(Json::as_array).into_iter().flatten().filter_map(|field| field.get("element").cloned()).collect::<Vec<_>>();
    let module = object([
        ("id", string("parquet.fields")),
        ("namespace", string("")),
        (
            "elements",
            array(elements.into_iter().map(from_json)),
        ),
    ]);
    if let Value::Array(modules) = value_member(&document, "modules").cloned().unwrap_or(Value::Null) {
        let mut updated = modules;
        updated.push(module);
        if let Value::Object(fields) = &mut document {
            if let Some((_, value)) = fields.iter_mut().find(|(key, _)| key == &Utf16::from("modules")) {
                *value = Value::Array(updated);
            }
        }
    }
    Ok(document)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        engine::{ResourceSet, SemanticContext},
        error::Diagnostic,
        serialization::{read_json_value, Format},
    };
    use std::{fs, path::PathBuf};

    struct NoCapabilities;
    impl Capabilities for NoCapabilities {
        fn validate_extension(
            &mut self,
            _: u64,
            _: &Value,
            _: &SemanticContext,
        ) -> Result<Vec<Diagnostic>, Utf16> {
            Ok(Vec::new())
        }
    }
    fn parse(source: &str) -> Value {
        read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn engine() -> Engine {
        Engine::new(
            ResourceSet::new(
                parse(include_str!("../../../spec/core/schema.json")),
                parse(include_str!(
                    "../../../spec/core/semantic-type-reference.schema.json"
                )),
                parse(include_str!(
                    "../../../spec/core/extension-package.schema.json"
                )),
                parse(include_str!(
                    "../../../spec/metamodel/generated/core-constraints.json"
                )),
                parse(include_str!(
                    "../../../spec/metamodel/generated/domain-policy.json"
                )),
            ),
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn fixture(path: &str) -> Vec<u8> {
        fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../")
                .join(path),
        )
        .unwrap()
    }
    fn document(
        bytes: &[u8],
        id: &str,
        engine: &Engine,
        registry: &Registry,
        capabilities: &mut dyn Capabilities,
    ) -> Value {
        capture_parquet(
            bytes,
            &Utf16::from(id),
            engine,
            registry,
            capabilities,
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn string_member<'a>(value: &'a Value, key: &str) -> Option<&'a Utf16> {
        if let Value::Object(fields) = value {
            fields
                .iter()
                .find(|(k, _)| k == &Utf16::from(key))
                .and_then(|(_, v)| {
                    if let Value::String(s) = v {
                        Some(s)
                    } else {
                        None
                    }
                })
        } else {
            None
        }
    }
    fn member<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
        if let Value::Object(fields) = value {
            fields
                .iter()
                .find(|(k, _)| k == &Utf16::from(key))
                .map(|(_, v)| v)
        } else {
            None
        }
    }
    fn bool_member(value: &Value, key: &str) -> Option<bool> {
        if let Value::Object(fields) = value {
            fields
                .iter()
                .find(|(k, _)| k == &Utf16::from(key))
                .and_then(|(_, v)| {
                    if let Value::Bool(b) = v {
                        Some(*b)
                    } else {
                        None
                    }
                })
        } else {
            None
        }
    }

    #[test]
    fn metadata_inspection_matches_frozen_typescript_public_envelopes() {
        let vectors: Json = serde_json::from_str(include_str!(
            "../../../tests/rust-core/fixtures/parquet-metadata-ts-freeze.json"
        ))
        .unwrap();
        let engine = engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        for case in vectors["cases"].as_array().unwrap() {
            let id = case["id"].as_str().unwrap();
            let hex = case["bytes"].as_str().unwrap();
            let bytes = hex
                .as_bytes()
                .chunks_exact(2)
                .map(|pair| {
                    let digit = |v: u8| match v {
                        b'0'..=b'9' => v - b'0',
                        b'a'..=b'f' => v - b'a' + 10,
                        _ => panic!("bad frozen fixture hex"),
                    };
                    (digit(pair[0]) << 4) | digit(pair[1])
                })
                .collect::<Vec<_>>();
            let source = document(&bytes, id, &engine, &registry, &mut capabilities);
            let run = |actual: Result<Value, EngineError>, key: &str| {
                let expected = &case["outputs"][key];
                if let Some(error) = expected.get("error") {
                    let actual = actual.expect_err("TypeScript vector expects an error");
                    assert_eq!(actual.code, error["code"].as_str().unwrap(), "{id}: {key}");
                    assert_eq!(actual.message.to_utf8().unwrap(), error["message"].as_str().unwrap(), "{id}: {key}");
                } else {
                    let actual = to_json(&actual.expect("TypeScript vector expects a result")).unwrap();
                    assert_eq!(actual, *expected, "{id}: {key}");
                }
            };
            run(
                inspect_parquet_logical_types(
                    &source,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                ),
                "inspectParquetLogicalTypes",
            );
            run(
                inspect_parquet_containers(
                    &source,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                ),
                "inspectParquetContainers",
            );
            run(
                get_parquet_field_metadata(
                    &source,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                ),
                "getParquetFieldMetadata",
            );
            run(
                import_parquet_schema(
                    &bytes,
                    &Utf16::from(id),
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                ),
                "importParquetSchema",
            );
        }
    }

    #[test]
    fn capture_export_and_framing_preserve_empty_malformed_and_pinned_sources() {
        let engine = engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        for bytes in [
            vec![],
            b"not a parquet file".to_vec(),
            fixture("fixtures/parquet/containers/list-tuple.parquet"),
        ] {
            let doc = document(&bytes, "capture", &engine, &registry, &mut capabilities);
            assert_eq!(
                export_parquet_capture(
                    &doc,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary()
                )
                .unwrap(),
                bytes
            );
            let framed = inspect_parquet_framing(
                &doc,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let status = string_member(&framed, "status").unwrap().to_utf8().unwrap();
            assert_eq!(
                status,
                if bytes.len() >= 12 && (bytes.starts_with(b"PAR1") || bytes.starts_with(b"PARE")) {
                    "located"
                } else {
                    "invalid"
                }
            );
            assert_eq!(bool_member(&framed, "complete"), Some(false));
        }
        let source = fixture("fixtures/parquet/containers/list-tuple.parquet");
        let mut offset_storage = vec![0xff];
        offset_storage.extend_from_slice(&source);
        offset_storage.push(0xee);
        let view = &offset_storage[1..offset_storage.len() - 1];
        let doc = document(view, "offset-view", &engine, &registry, &mut capabilities);
        assert_eq!(
            export_parquet_capture(
                &doc,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary()
            )
            .unwrap(),
            source
        );

        let doc = document(&[], "future", &engine, &registry, &mut capabilities);
        let empty_framing = inspect_parquet_framing(
            &doc,
            &engine,
            &registry,
            &mut capabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            string_member(&empty_framing, "status")
                .unwrap()
                .to_utf8()
                .unwrap(),
            "invalid"
        );
        let empty_footer = decode_parquet_footer(
            &doc,
            &engine,
            &registry,
            &mut capabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            string_member(&empty_footer, "status")
                .unwrap()
                .to_utf8()
                .unwrap(),
            "blocked"
        );
        let Value::Array(footer_diagnostics) = member(&empty_footer, "diagnostics").unwrap() else {
            panic!("diagnostics must be an array");
        };
        assert_eq!(
            string_member(footer_diagnostics.first().unwrap(), "code")
                .unwrap()
                .to_utf8()
                .unwrap(),
            "PARQUET_TRUNCATED"
        );
        assert!(member(&empty_footer, "value").is_none());
        let mut json = to_json(&doc).unwrap();
        json["modules"][0]["elements"][0]["extensions"]["umf.parquet"]["future"] = Json::Bool(true);
        let unknown = from_json(json);
        assert_eq!(
            export_parquet_capture(
                &unknown,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary()
            )
            .unwrap_err()
            .code,
            "PARQUET_REPRESENTATION"
        );
        let bad_id = capture_parquet(
            &[],
            &Utf16::from(""),
            &engine,
            &registry,
            &mut capabilities,
            &mut Context::ordinary(),
        );
        assert!(bad_id.is_err());
        let too_large = vec![0; MAX_BYTES + 1];
        assert_eq!(
            capture_parquet(
                &too_large,
                &Utf16::from("large"),
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary()
            )
            .unwrap_err()
            .code,
            "PARQUET_LIMIT"
        );
    }

    #[test]
    fn compact_footer_wire_tree_matches_frozen_thrift_values() {
        let manifest: Json = serde_json::from_str(include_str!(
            "../../../fixtures/parquet/footer/manifest.json"
        ))
        .unwrap();
        for row in manifest["results"].as_array().unwrap() {
            let id = row["id"].as_str().unwrap();
            let bytes = fixture(row["path"].as_str().unwrap());
            let decoded =
                parquet_schema_decode::decode_compact_footer(&bytes, &mut Context::ordinary())
                    .unwrap();
            let actual = serde_json::json!({"value":compact_as_json(&decoded.value).unwrap(),"consumedBytes":decoded.consumed_bytes,"trailingBytes":decoded.trailing_bytes});
            let expected: Json = serde_json::from_str(
                &String::from_utf8(fixture(&format!(
                    "fixtures/parquet/footer/{id}.expected.json"
                )))
                .unwrap(),
            )
            .unwrap();
            assert_eq!(actual, expected, "{id}");
        }
    }

    #[test]
    fn named_metadata_matches_frozen_oracle_and_schema_inspection_is_bounded() {
        let manifest: Json = serde_json::from_str(include_str!(
            "../../../fixtures/parquet/metadata/manifest.json"
        ))
        .unwrap();
        let engine = engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        for row in manifest["results"].as_array().unwrap() {
            let id = row["id"].as_str().unwrap();
            let bytes = fixture(row["path"].as_str().unwrap());
            let doc = document(&bytes, id, &engine, &registry, &mut capabilities);
            let metadata = inspect_parquet_metadata(
                &doc,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let status = string_member(&metadata, "status")
                .unwrap()
                .to_utf8()
                .unwrap();
            assert_eq!(status, "mapped", "{id}");
            let actual = to_json(&metadata).unwrap();
            let expected: Json = serde_json::from_str(
                &String::from_utf8(fixture(&format!(
                    "fixtures/parquet/metadata/{id}.expected.json"
                )))
                .unwrap(),
            )
            .unwrap();
            assert_eq!(actual["metadata"], expected, "{id}");
            let inspected = inspect_parquet_schema(
                &doc,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let status = string_member(&inspected, "status")
                .unwrap()
                .to_utf8()
                .unwrap();
            assert_eq!(status, "checked", "{id}");
            assert!(
                matches!(inspected,Value::Object(ref fields) if fields.iter().any(|(k,_)|k==&Utf16::from("tree")))
            );
            let actual = to_json(&inspected).unwrap();
            let expected: Json = serde_json::from_str(
                &String::from_utf8(fixture(&format!(
                    "fixtures/parquet/schema/{id}.expected.json"
                )))
                .unwrap(),
            )
            .unwrap();
            let actual_leaves = actual["leaves"].as_array().unwrap();
            let expected_leaves = expected["leaves"].as_array().unwrap();
            assert_eq!(actual_leaves.len(), expected_leaves.len(), "{id}");
            for (leaf, expected_leaf) in actual_leaves.iter().zip(expected_leaves) {
                let path = leaf["path"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(Json::as_str)
                    .collect::<Option<Vec<_>>>()
                    .unwrap()
                    .join(".");
                assert_eq!(path, expected_leaf["pathString"].as_str().unwrap(), "{id}");
                assert_eq!(leaf["physicalType"], expected_leaf["physicalType"], "{id}");
                for field in ["ordinal", "definitionLevel", "repetitionLevel"] {
                    assert_eq!(
                        leaf[field].as_f64().unwrap() as u64,
                        expected_leaf[field].as_u64().unwrap(),
                        "{id} {field}"
                    );
                }
            }
            assert_eq!(
                actual["metadata"]["row_groups"].as_array().unwrap().len(),
                expected["rowGroups"].as_u64().unwrap() as usize,
                "{id}"
            );
            assert_eq!(actual["metadata"]["num_rows"], expected["rows"], "{id}");
        }
    }

    #[test]
    fn unknown_idl_content_is_retained_and_duplicate_known_fields_block_mapping() {
        let idl: Json = serde_json::from_str(IDL).unwrap();
        let defs = idl["definitions"].as_object().unwrap();
        let mut ds = Vec::new();
        let unknown = NativeWireValue::Struct(vec![
            (1, NativeWireValue::I32(1)),
            (2, NativeWireValue::List(12, vec![])),
            (3, NativeWireValue::I64(0)),
            (4, NativeWireValue::List(12, vec![])),
            (20, NativeWireValue::Binary(vec![0xff, 0x00])),
        ]);
        let mapped = map_idl_value(
            &unknown,
            &serde_json::json!({"ref":"FileMetaData"}),
            defs,
            &mut ds,
            "",
        )
        .unwrap();
        assert_eq!(mapped["$unknown"][0]["id"], 20);
        assert_eq!(mapped["$unknown"][0]["value"]["hex"], "ff00");
        assert!(ds.iter().any(|d| {
            string_member(d, "code")
                .is_some_and(|code| code.to_utf8().ok().as_deref() == Some("PARQUET_FIELD_UNKNOWN"))
        }));
        let mut ds = Vec::new();
        let unknown_enum = map_idl_value(
            &NativeWireValue::I32(99),
            &serde_json::json!({"ref":"Type"}),
            defs,
            &mut ds,
            "/schema/0/type",
        )
        .unwrap();
        assert_eq!(unknown_enum, "99");
        assert!(ds.iter().any(|d| {
            string_member(d, "code")
                .is_some_and(|code| code.to_utf8().ok().as_deref() == Some("PARQUET_ENUM_UNKNOWN"))
        }));
        let duplicate = NativeWireValue::Struct(vec![
            (1, NativeWireValue::I32(1)),
            (1, NativeWireValue::I32(2)),
        ]);
        assert!(map_idl_value(
            &duplicate,
            &serde_json::json!({"ref":"FileMetaData"}),
            defs,
            &mut Vec::new(),
            "",
        )
        .unwrap_err()
        .contains("Repeated field ID"));
    }

    #[test]
    fn metadata_operations_preserve_lone_utf16_ids_and_unknown_envelope_members() {
        let engine = engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        let bytes = fixture("fixtures/parquet/logical/decimal32.parquet");
        let lone_id = Utf16::new(vec![0xd800, 0x006b]);
        let imported = import_parquet_schema(
            &bytes,
            &lone_id,
            &engine,
            &registry,
            &mut capabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(member(&imported, "id"), Some(&Value::String(lone_id.clone())));

        // An unknown vocabulary member is legal extension content. Its key
        // and value deliberately contain isolated UTF-16 code units.
        let unknown_key = Utf16::new(vec![0x0066, 0xdfff, 0x006e]);
        let unknown_value = Utf16::new(vec![0x0076, 0xd800, 0x0078]);
        let mut document = imported.clone();
        let vocabularies = Value::Object(vec![
            (
                Utf16::from("umf.parquet"),
                object([("version", string("0.1.0"))]),
            ),
            (
                Utf16::from("future.vendor"),
                Value::Object(vec![
                    (Utf16::from("version"), string("0.1.0")),
                    (unknown_key.clone(), Value::String(unknown_value.clone())),
                ]),
            ),
        ]);
        if let Value::Object(fields) = &mut document {
            fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("vocabularies"))
                .unwrap()
                .1 = vocabularies;
        }

        for view in [
            inspect_parquet_logical_types(
                &document,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap(),
            inspect_parquet_containers(
                &document,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap(),
        ] {
            assert_eq!(member(&view, "source"), Some(&document));
            assert_eq!(member(&view, "status"), Some(&string("checked")));
        }
        let fields = get_parquet_field_metadata(
            &document,
            &engine,
            &registry,
            &mut capabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(member(&fields, "status"), Some(&string("checked")));
        assert_eq!(member(&document, "id"), Some(&Value::String(lone_id.clone())));
        let Value::Object(vocab_fields) = member(&document, "vocabularies").unwrap() else {
            unreachable!()
        };
        let unknown_package = vocab_fields
            .iter()
            .find(|(key, _)| key == &Utf16::from("future.vendor"))
            .map(|(_, value)| value)
            .unwrap();
        assert_eq!(
            unknown_package,
            &Value::Object(vec![
                (Utf16::from("version"), string("0.1.0")),
                (unknown_key, Value::String(unknown_value)),
            ])
        );
        let exported = export_parquet_capture(
            &document,
            &engine,
            &registry,
            &mut capabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(exported, bytes);
    }

    #[test]
    fn six_public_capture_inspection_results_match_typescript_golden_envelope() {
        let expected: Json = serde_json::from_str(include_str!(
            "../../../fixtures/parquet/rust-migration/list-tuple-capture-inspection.expected.json"
        ))
        .unwrap();
        let bytes = fixture("fixtures/parquet/containers/list-tuple.parquet");
        let engine = engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        let capture = document(&bytes, "golden", &engine, &registry, &mut capabilities);
        let export = export_parquet_capture(
            &capture,
            &engine,
            &registry,
            &mut capabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        let mut hex = String::with_capacity(export.len() * 2);
        const HEX: &[u8; 16] = b"0123456789abcdef";
        for byte in export {
            hex.push(HEX[(byte >> 4) as usize] as char);
            hex.push(HEX[(byte & 15) as usize] as char);
        }
        let actual = object([
            ("capture", capture.clone()),
            ("exportHex", string(hex)),
            (
                "framing",
                inspect_parquet_framing(
                    &capture,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                )
                .unwrap(),
            ),
            (
                "footer",
                decode_parquet_footer(
                    &capture,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                )
                .unwrap(),
            ),
            (
                "metadata",
                inspect_parquet_metadata(
                    &capture,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                )
                .unwrap(),
            ),
            (
                "schema",
                inspect_parquet_schema(
                    &capture,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                )
                .unwrap(),
            ),
        ]);
        fn normalize_numbers(value: Json) -> Json {
            match value {
                Json::Number(number) => Number::from_f64(number.as_f64().unwrap()).map_or(Json::Null, Json::Number),
                Json::Array(values) => Json::Array(values.into_iter().map(normalize_numbers).collect()),
                Json::Object(values) => Json::Object(
                    values
                        .into_iter()
                        .map(|(key, value)| (key, normalize_numbers(value)))
                        .collect(),
                ),
                other => other,
            }
        }
        assert_eq!(
            normalize_numbers(to_json(&actual).unwrap()),
            normalize_numbers(expected)
        );
    }

    #[test]
    fn unknown_footer_public_results_match_typescript_diagnostic_golden() {
        let expected: Json = serde_json::from_str(include_str!(
            "../../../fixtures/parquet/rust-migration/unknown-footer-inspection.expected.json"
        ))
        .unwrap();
        let body = [
            0x15, 2, 0x19, 0x1c, 0x15, 0xa4, 0x13, 0x38, 1, b'a', 0, 0x16, 0, 0x19, 0x0c,
        ];
        let mut footer = body.to_vec();
        footer.extend_from_slice(&[0x08, 0xc6, 1, 1, 255, 0x08, 0xc6, 1, 1, 128, 0]);
        let mut bytes = b"PAR1".to_vec();
        bytes.extend_from_slice(&footer);
        bytes.extend_from_slice(&(footer.len() as u32).to_le_bytes());
        bytes.extend_from_slice(b"PAR1");

        let engine = engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        let capture = document(&bytes, "unknown", &engine, &registry, &mut capabilities);
        let actual = object([
            ("capture", capture.clone()),
            (
                "framing",
                inspect_parquet_framing(
                    &capture,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                )
                .unwrap(),
            ),
            (
                "footer",
                decode_parquet_footer(
                    &capture,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                )
                .unwrap(),
            ),
            (
                "metadata",
                inspect_parquet_metadata(
                    &capture,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                )
                .unwrap(),
            ),
            (
                "schema",
                inspect_parquet_schema(
                    &capture,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                )
                .unwrap(),
            ),
        ]);
        fn normalize_numbers(value: Json) -> Json {
            match value {
                Json::Number(number) => Number::from_f64(number.as_f64().unwrap())
                    .map_or(Json::Null, Json::Number),
                Json::Array(values) => {
                    Json::Array(values.into_iter().map(normalize_numbers).collect())
                }
                Json::Object(values) => Json::Object(
                    values
                        .into_iter()
                        .map(|(key, value)| (key, normalize_numbers(value)))
                        .collect(),
                ),
                other => other,
            }
        }
        assert_eq!(
            normalize_numbers(to_json(&actual).unwrap()),
            normalize_numbers(expected)
        );
    }

    #[test]
    fn native_field_metadata_must_match_before_export_or_derived_inspection() {
        let engine = engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        let bytes = fixture("fixtures/parquet/rename/none.parquet");
        let mut doc = document(&bytes, "field-metadata", &engine, &registry, &mut capabilities);
        let inspected = inspect_parquet_schema(
            &doc,
            &engine,
            &registry,
            &mut capabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
        let schema = match value_member(value_member(&inspected, "metadata").unwrap(), "schema")
            .unwrap()
        {
            Value::Array(schema) => schema,
            _ => panic!("schema metadata must be an array"),
        };
        let elements = schema
            .iter()
            .enumerate()
            .skip(1)
            .map(|(index, native)| {
                let mut fields = vec![
                    (Utf16::from("id"), string(format!("schema:{index}"))),
                    (
                        Utf16::from("name"),
                        value_member(native, "name").unwrap().clone(),
                    ),
                ];
                if let Some(scalar_type) = field_scalar_type(&to_json(native).unwrap()) {
                    fields.push((Utf16::from("scalarType"), string(scalar_type)));
                }
                fields.push((
                    Utf16::from("extensions"),
                    object(std::iter::empty::<(&str, Value)>()),
                ));
                Value::Object(fields)
            })
            .collect::<Vec<_>>();
        let fields_module = object([
            ("id", string("parquet.fields")),
            ("namespace", string("")),
            ("elements", array(elements)),
        ]);
        {
            let Value::Object(document_fields) = &mut doc else {
                panic!("captured document must be an object");
            };
            let (_, modules) = document_fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("modules"))
                .unwrap();
            let Value::Array(modules) = modules else {
                panic!("modules must be an array");
            };
            modules.push(fields_module);
        }
        assert_eq!(
            export_parquet_capture(
                &doc,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap(),
            bytes
        );
        let baseline = to_json(&doc).unwrap();
        for mutation in ["name", "scalarType", "id", "count", "namespace"] {
            let mut json = baseline.clone();
            let fields_module = json["modules"]
                .as_array_mut()
                .unwrap()
                .last_mut()
                .unwrap();
            match mutation {
                "name" => fields_module["elements"][0]["name"] = serde_json::json!("contradictory-name"),
                "scalarType" => {
                    let expected = fields_module["elements"][0]["scalarType"].as_str();
                    fields_module["elements"][0]["scalarType"] =
                        serde_json::json!(if expected == Some("string") { "integer" } else { "string" });
                }
                "id" => fields_module["elements"][0]["id"] = serde_json::json!("schema:999"),
                "count" => {
                    fields_module["elements"].as_array_mut().unwrap().pop();
                }
                "namespace" => fields_module["namespace"] = serde_json::json!("other"),
                _ => unreachable!(),
            }
            let contradictory = from_json(json);
            let error = export_parquet_capture(
                &contradictory,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap_err();
            assert_eq!(error.code, "PARQUET_FIELD_METADATA", "mutation: {mutation}");
            for inspect in [
                inspect_parquet_framing(
                    &contradictory,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                ),
                decode_parquet_footer(
                    &contradictory,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                ),
                inspect_parquet_metadata(
                    &contradictory,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                ),
                inspect_parquet_schema(
                    &contradictory,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                ),
            ] {
                assert_eq!(inspect.unwrap_err().code, "PARQUET_FIELD_METADATA", "mutation: {mutation}");
            }
        }
    }

    #[test]
    fn accepted_field_metadata_matches_typescript_projection_for_logical_fixtures() {
        let expected: Json = serde_json::from_str(include_str!(
            "../../../fixtures/parquet/field-metadata.json"
        ))
        .unwrap();
        let engine = engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        for result in expected["results"].as_array().unwrap() {
            let id = result["id"].as_str().unwrap();
            let path = result["path"].as_str().unwrap();
            let bytes = fixture(path);
            let doc = document(&bytes, id, &engine, &registry, &mut capabilities);
            let elements = result["view"]["fields"]
                .as_array()
                .unwrap()
                .iter()
                .map(|field| field["element"].clone())
                .collect::<Vec<_>>();
            let mut json = to_json(&doc).unwrap();
            json["modules"]
                .as_array_mut()
                .unwrap()
                .push(serde_json::json!({
                    "id":"parquet.fields",
                    "namespace":"",
                    "elements":elements,
                }));
            let with_fields = from_json(json);
            assert_eq!(
                export_parquet_capture(
                    &with_fields,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                )
                .unwrap_or_else(|error| panic!("{id}: {}", error.code)),
                bytes,
                "{id}"
            );
        }
    }

    #[test]
    fn invalid_logical_annotations_refuse_field_metadata_exports_and_inspections() {
        let engine = engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        let logical_golden: Json = serde_json::from_str(include_str!(
            "../../../fixtures/parquet/logical/results.json"
        ))
        .unwrap();
        for path in [
            "fixtures/parquet/logical/decimal32-over.parquet",
            "fixtures/parquet/logical/date-wrong.parquet",
        ] {
            let fixture_id = path.rsplit('/').next().unwrap().trim_end_matches(".parquet");
            let source_expected = logical_golden["results"]
                .as_array()
                .unwrap()
                .iter()
                .find(|result| result["id"] == fixture_id)
                .unwrap();
            assert_eq!(source_expected["status"], "blocked", "fixture: {fixture_id}");
            assert_eq!(
                source_expected["annotations"][0]["validation"],
                "invalid",
                "fixture: {fixture_id}"
            );
            let bytes = fixture(path);
            let doc = document(&bytes, path, &engine, &registry, &mut capabilities);
            let inspected = inspect_parquet_schema(
                &doc,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let schema = match value_member(value_member(&inspected, "metadata").unwrap(), "schema").unwrap() {
                Value::Array(schema) => schema,
                _ => panic!("schema metadata must be an array"),
            };
            let elements = schema
                .iter()
                .enumerate()
                .skip(1)
                .map(|(index, native)| {
                    let mut fields = vec![
                        (Utf16::from("id"), string(format!("schema:{index}"))),
                        (Utf16::from("name"), value_member(native, "name").unwrap().clone()),
                    ];
                    if let Some(scalar_type) = field_scalar_type(&to_json(native).unwrap()) {
                        fields.push((Utf16::from("scalarType"), string(scalar_type)));
                    }
                    fields.push((
                        Utf16::from("extensions"),
                        object(std::iter::empty::<(&str, Value)>()),
                    ));
                    Value::Object(fields)
                })
                .collect::<Vec<_>>();
            let mut json = to_json(&doc).unwrap();
            json["modules"].as_array_mut().unwrap().push(serde_json::json!({
                "id":"parquet.fields",
                "namespace":"",
                "elements":to_json(&Value::Array(elements)).unwrap(),
            }));
            let doc = from_json(json);
            let error = export_parquet_capture(
                &doc,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap_err();
            assert_eq!(error.code, "PARQUET_FIELD_METADATA", "fixture: {path}");
            for result in [
                inspect_parquet_framing(
                    &doc,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                ),
                decode_parquet_footer(
                    &doc,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                ),
                inspect_parquet_metadata(
                    &doc,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                ),
                inspect_parquet_schema(
                    &doc,
                    &engine,
                    &registry,
                    &mut capabilities,
                    &mut Context::ordinary(),
                ),
            ] {
                assert_eq!(result.unwrap_err().code, "PARQUET_FIELD_METADATA", "fixture: {path}");
            }
        }
    }

    #[test]
    fn footer_decoder_refuses_encryption_and_never_returns_a_partial_tree() {
        let mut encrypted = b"PARE".to_vec();
        encrypted.extend_from_slice(&[0, 0, 0, 0]);
        encrypted.extend_from_slice(&1u32.to_le_bytes());
        encrypted.extend_from_slice(b"PARE");
        let error =
            parquet_schema_decode::decode_compact_footer(&encrypted, &mut Context::ordinary())
                .unwrap_err();
        assert_eq!(error.code, "PARQUET_FOOTER_ENCRYPTED");
        for bytes in [vec![1, 2, 3], b"NOPE0000NOPE".to_vec()] {
            assert!(
                parquet_schema_decode::decode_compact_footer(&bytes, &mut Context::ordinary())
                    .is_err()
            );
        }
    }

    #[test]
    fn mid_parse_meter_cancellation_propagates_through_public_and_metadata_paths() {
        let engine = engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        let bytes = fixture("fixtures/parquet/containers/list-tuple.parquet");
        let doc = document(&bytes, "cancel-footer", &engine, &registry, &mut capabilities);
        let footer_length = parquet_schema_decode::locate_footer(&bytes).unwrap().length;

        let mut calls = Vec::new();
        let mut meter = |amount: usize| {
            calls.push(amount);
            Ok(())
        };
        {
            let mut ctx = Context::ordinary().with_host_control(&mut meter);
            decode_parquet_footer(&doc, &engine, &registry, &mut capabilities, &mut ctx).unwrap();
        }
        let parse_admission = calls
            .iter()
            .rposition(|amount| *amount == footer_length)
            .expect("footer parser charges the bounded region");
        assert_eq!(calls.get(parse_admission + 1), Some(&1));

        let mut call = 0usize;
        let mut meter = |_: usize| {
            let at = call;
            call += 1;
            if at == parse_admission + 1 {
                Err(EngineError::new(
                    "CANCELLED",
                    Utf16::default(),
                    "meter stopped during footer parse",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_host_control(&mut meter);
        let error = decode_parquet_footer(&doc, &engine, &registry, &mut capabilities, &mut ctx)
            .unwrap_err();
        assert!(error.is_control_failure());

        let mut armed = false;
        let mut meter = |amount: usize| {
            if armed {
                return Err(EngineError::new(
                    "CANCELLED",
                    Utf16::default(),
                    "meter stopped during metadata footer parse",
                ));
            }
            if amount == footer_length {
                armed = true;
            }
            Ok(())
        };
        let mut ctx = Context::ordinary().with_host_control(&mut meter);
        let error = metadata_parts(&bytes, &mut ctx).unwrap_err();
        assert!(error.is_control_failure());
    }
}

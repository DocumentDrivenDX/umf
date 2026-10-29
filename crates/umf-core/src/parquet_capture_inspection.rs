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
use serde_json::{Map, Value as Json};
#[cfg(test)]
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

fn unknown_content(value: &Value) -> bool {
    match value {
        Value::Array(values) => values.iter().any(unknown_content),
        Value::Object(fields) => fields.iter().any(|(name, value)| {
            (name == &Utf16::from("$unknown")
                && matches!(value, Value::Array(values) if !values.is_empty()))
                || unknown_content(value)
        }),
        _ => false,
    }
}

fn field_scalar_type(element: &Value) -> Option<&'static str> {
    if unknown_content(element) {
        return None;
    }
    let physical = text_member(element, "type")?;
    let physical_scalar = match physical.as_str() {
        "0" => "boolean",
        "1" | "2" => "integer",
        "4" | "5" => "float",
        "6" | "7" => "binary",
        _ => return None,
    };
    let converted = text_member(element, "converted_type");
    let logical = value_member(element, "logicalType");
    if logical.is_none() && converted.is_none() {
        return Some(physical_scalar);
    }

    let mut name = None;
    let mut parameters = None;
    if let Some(logical) = logical {
        if let Value::Object(fields) = logical {
            if let Some((key, value)) = fields.iter().find(|(key, _)| key != &Utf16::from("$unknown")) {
                name = key.to_utf8().ok();
                parameters = Some(value);
            }
        }
    } else if let Some(code) = converted.as_deref().and_then(|s| s.parse::<usize>().ok()) {
        const LEGACY: &[&str] = &[
            "STRING", "MAP", "MAP_KEY_VALUE", "LIST", "ENUM", "DECIMAL", "DATE",
            "TIME_MILLIS", "TIME_MICROS", "TIMESTAMP_MILLIS", "TIMESTAMP_MICROS",
            "UINT_8", "UINT_16", "UINT_32", "UINT_64", "INT_8", "INT_16", "INT_32",
            "INT_64", "JSON", "BSON", "INTERVAL",
        ];
        name = LEGACY.get(code).map(|s| (*s).to_owned());
    }
    let mut name = name?;
    let params = parameters;
    let mut unit = None;
    if name == "TIME_MILLIS" || name == "TIME_MICROS" || name == "TIMESTAMP_MILLIS" || name == "TIMESTAMP_MICROS" {
        let is_time = name.starts_with("TIME_");
        let micros = name.ends_with("MICROS");
        name = if is_time { "TIME".into() } else { "TIMESTAMP".into() };
        unit = Some(if micros { "MICROS" } else { "MILLIS" }.to_owned());
    }
    if name.starts_with("UINT_") || name.starts_with("INT_") {
        let width = name.rsplit('_').next()?;
        if !matches!(width, "8" | "16" | "32" | "64")
            || (width == "64" && physical != "2")
            || (width != "64" && physical != "1")
        {
            return None;
        }
        return Some("integer");
    }
    match name.as_str() {
        "STRING" | "ENUM" if physical == "6" => Some("string"),
        "DATE" if physical == "1" => Some("date"),
        "INTEGER" => {
            let params = params?;
            let width = text_member(params, "bitWidth")?;
            let signed = value_member(params, "isSigned")?;
            if !matches!(signed, Value::Bool(_))
                || !matches!(width.as_str(), "8" | "16" | "32" | "64")
                || (width == "64" && physical != "2")
                || (width != "64" && physical != "1")
            {
                None
            } else {
                Some("integer")
            }
        }
        "FLOAT16" if physical == "7" && text_member(element, "type_length").as_deref() == Some("2") => Some("float"),
        "DECIMAL" => {
            if !matches!(physical.as_str(), "1" | "2" | "6" | "7") {
                return None;
            }
            let precision = if let Some(params) = params {
                text_member(params, "precision")
            } else {
                text_member(element, "precision")
            }?.parse::<i128>().ok()?;
            let scale = if let Some(params) = params {
                text_member(params, "scale")
            } else {
                text_member(element, "scale").or_else(|| Some("0".into()))
            }?.parse::<i128>().ok()?;
            if precision <= 0 || scale < 0 || scale > precision {
                return None;
            }
            if physical == "1" && precision > 9 || physical == "2" && precision > 18 {
                return None;
            }
            if physical == "7" {
                let length = text_member(element, "type_length")?.parse::<u128>().ok()?;
                if length > 4096 {
                    return None;
                }
                let max_precision = (length * 8 - 1) * 30_103 / 100_000;
                if precision as u128 > max_precision {
                    return None;
                }
            }
            Some("decimal")
        }
        "TIME" | "TIMESTAMP" => {
            let unit = unit.or_else(|| {
                let unit = value_member(params?, "unit")?;
                let Value::Object(fields) = unit else {
                    return None;
                };
                fields
                    .iter()
                    .find(|(key, _)| key != &Utf16::from("$unknown"))
                    .and_then(|(key, _)| key.to_utf8().ok())
                    .filter(|v| matches!(v.as_str(), "MILLIS" | "MICROS" | "NANOS"))
            });
            let unit = unit.as_deref()?;
            if (name == "TIME" && unit == "MILLIS" && physical == "1")
                || (physical == "2" && !(name == "TIME" && unit == "MILLIS"))
            {
                Some(if name == "TIME" { "time" } else { "timestamp" })
            } else {
                None
            }
        }
        _ => None,
    }
}

fn check_parquet_field_metadata(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let field_module = find_module(document, "parquet.fields").expect("module checked by caller");
    let mismatch = || {
        error(
            "PARQUET_FIELD_METADATA",
            "Native schema and core field metadata disagree",
        )
    };
    let mut raw = object([
        ("umf", value_member(document, "umf").cloned().unwrap_or(Value::Null)),
        ("id", value_member(document, "id").cloned().unwrap_or(Value::Null)),
        (
            "vocabularies",
            object([(
                "umf.parquet",
                value_member(value_member(document, "vocabularies").unwrap_or(&Value::Null), "umf.parquet")
                    .cloned()
                    .unwrap_or(Value::Null),
            )]),
        ),
        ("modules", array([])),
    ]);
    let parquet_module = find_module(document, "parquet").ok_or_else(mismatch)?;
    let source_element = match value_member(parquet_module, "elements") {
        Some(Value::Array(elements)) => elements
            .iter()
            .find(|element| text_member(element, "id").as_deref() == Some("source")),
        _ => None,
    }
    .ok_or_else(mismatch)?;
    let payload = value_member(
        value_member(source_element, "extensions").unwrap_or(&Value::Null),
        "umf.parquet",
    )
    .cloned()
    .ok_or_else(mismatch)?;
    let source = object([("id", string("source")), ("extensions", object([("umf.parquet", payload)]))]);
    let parquet = object([
        ("id", string("parquet")),
        ("namespace", string("")),
        ("elements", array([source])),
    ]);
    if let Value::Object(fields) = &mut raw {
        if let Some((_, modules)) = fields.iter_mut().find(|(key, _)| key == &Utf16::from("modules")) {
            *modules = array([parquet]);
        }
    }
    let inspection = inspect_parquet_schema(&raw, engine, registry, capabilities, ctx)?;
    if text_member(&inspection, "status").as_deref() != Some("checked") {
        return Err(mismatch());
    }
    let schema = value_member(value_member(&inspection, "metadata").ok_or_else(mismatch)?, "schema")
        .and_then(|v| match v {
            Value::Array(values) => Some(values),
            _ => None,
        })
        .ok_or_else(mismatch)?;
    let Some(Value::Array(elements)) = value_member(field_module, "elements") else {
        return Err(mismatch());
    };
    if text_member(field_module, "namespace").as_deref() != Some("") || elements.len() != schema.len().saturating_sub(1) {
        return Err(mismatch());
    }
    for (offset, (element, native)) in elements.iter().zip(schema.iter().skip(1)).enumerate() {
        let expected_id = format!("schema:{}", offset + 1);
        let expected_id = string(expected_id);
        let expected_scalar = field_scalar_type(native).map(string);
        if value_member(element, "id") != Some(&expected_id)
            || value_member(element, "name") != value_member(native, "name")
            || value_member(element, "scalarType") != expected_scalar.as_ref()
        {
            return Err(mismatch());
        }
    }
    Ok(())
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

#[cfg(test)]
fn to_json(value: &Value) -> Result<Json, EngineError> {
    Ok(match value {
        Value::Null => Json::Null,
        Value::Bool(value) => Json::Bool(*value),
        Value::Number(value) => Json::Number(
            Number::from_f64(*value)
                .ok_or_else(|| error("PARQUET_METADATA_SHAPE", "Non-finite value in metadata"))?,
        ),
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
                if let Some(scalar_type) = field_scalar_type(native) {
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

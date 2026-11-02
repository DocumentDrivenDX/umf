// SPDX-License-Identifier: MIT OR Apache-2.0
//! Explicit, bounded correction for the pinned legacy dictionary-offset layout.
//!
//! This operation never changes ordinary decoding. It edits only the two
//! ColumnMetaData offsets in the Compact Protocol footer, retains the source
//! envelope and payload prefix, and publishes a candidate only after the
//! normal page and typed-value operations accept it.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_capture_inspection::{
        decode_parquet_footer, diagnostic, export_parquet_capture, inspect_parquet_framing,
        inspect_parquet_schema, map_idl_value, to_json, IDL,
    },
    parquet_pages::inspect_parquet_pages,
    parquet_schema_decode::decode_compact_struct_prefix,
    parquet_values::decode_parquet_values,
    parquet_wire_encode::encode_parquet_wire,
    registry::Registry,
    value::{copy_json, Utf16, Value},
};
use serde_json::{Map, Value as Json};

const MAX_BYTES: usize = 1_000_000;
const HEADER_BYTES: usize = 65_536;
const PAGE_BYTES: usize = 8 * 1024 * 1024;

fn block(message: impl AsRef<str>) -> EngineError {
    EngineError::new(
        "PARQUET_OFFSET_REPAIR_BLOCKED",
        Utf16::default(),
        message.as_ref(),
    )
}

fn member<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}

fn member_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}

fn array(value: &Value) -> Option<&[Value]> {
    match value {
        Value::Array(values) => Some(values),
        _ => None,
    }
}

fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => value.to_utf8().ok(),
        _ => None,
    }
}

fn integer(value: &Json, label: &str, limit: usize) -> Result<usize, EngineError> {
    let parsed = value
        .as_str()
        .and_then(|value| value.parse::<i128>().ok())
        .ok_or_else(|| block(format!("{label} exceeds supported nonnegative bound")))?;
    if parsed < 0 || parsed > limit as i128 {
        return Err(block(format!(
            "{label} exceeds supported nonnegative bound"
        )));
    }
    Ok(parsed as usize)
}

fn wire_field(value: &mut Value, id: i64) -> Result<&mut Value, EngineError> {
    if text(member(value, "kind").ok_or_else(|| block("Expected metadata struct"))?).as_deref()
        != Some("struct")
    {
        return Err(block("Expected metadata struct"));
    }
    let fields = member_mut(value, "fields")
        .and_then(|fields| match fields {
            Value::Array(fields) => Some(fields),
            _ => None,
        })
        .ok_or_else(|| block("Expected metadata struct"))?;
    fields
        .iter_mut()
        .find(|field| {
            member(field, "id").and_then(|value| match value {
                Value::Number(number) => Some(*number as i64),
                _ => None,
            }) == Some(id)
        })
        .and_then(|field| member_mut(field, "value"))
        .ok_or_else(|| block("Required wire metadata missing"))
}

fn unsafe_json(value: &Json) -> bool {
    match value {
        Json::Array(values) => values.iter().any(unsafe_json),
        Json::Object(fields) => {
            fields.keys().any(|key| {
                matches!(
                    key.as_str(),
                    "$unknown"
                        | "encryption_algorithm"
                        | "footer_signing_key_metadata"
                        | "crypto_metadata"
                        | "encrypted_column_metadata"
                )
            }) || fields.values().any(unsafe_json)
        }
        _ => false,
    }
}

fn map_page_header(
    bytes: &[u8],
    offset: usize,
    limit: usize,
    definitions: &Map<String, Json>,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(Json, usize), EngineError> {
    if offset >= limit || limit > bytes.len() {
        return Err(block("Invalid page header bounds"));
    }
    let window_end = limit.min(offset.saturating_add(HEADER_BYTES));
    let (wire, consumed) =
        decode_compact_struct_prefix(&bytes[offset..window_end], ctx).map_err(|error| {
            if error.is_control_failure() {
                error
            } else {
                block(
                    error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Invalid Compact Protocol value".into()),
                )
            }
        })?;
    let mapped = map_idl_value(
        &wire,
        &serde_json::json!({"ref":"PageHeader"}),
        definitions,
        diagnostics,
        "",
    )
    .map_err(block)?;
    if unsafe_json(&mapped)
        || diagnostics.iter().any(|diagnostic| {
            text(member(diagnostic, "code").unwrap_or(&Value::Null)).as_deref()
                == Some("PARQUET_ENUM_UNKNOWN")
        })
    {
        return Err(block("Unknown page semantics prevents repair"));
    }
    Ok((mapped, consumed))
}

fn hex(bytes: &[u8], ctx: &mut Context<'_>) -> Result<String, EngineError> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let capacity = bytes
        .len()
        .checked_mul(2)
        .ok_or_else(|| block("Edited file exceeds capture limit"))?;
    let mut output = String::new();
    output.try_reserve_exact(capacity).map_err(|_| {
        EngineError::new(
            "RESOURCE_LIMIT",
            Utf16::default(),
            "Parquet repair allocation failed",
        )
        .with_control_failure()
    })?;
    for byte in bytes {
        ctx.charge_work(2, Utf16::default())?;
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 15) as usize] as char);
    }
    Ok(output)
}

fn replace_source_bytes(
    document: &mut Value,
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let modules = member_mut(document, "modules")
        .and_then(|value| match value {
            Value::Array(values) => Some(values),
            _ => None,
        })
        .ok_or_else(|| block("Missing Parquet source"))?;
    let parquet = modules
        .iter_mut()
        .find(|module| {
            text(member(module, "id").unwrap_or(&Value::Null)).as_deref() == Some("parquet")
        })
        .ok_or_else(|| block("Missing Parquet source"))?;
    let elements = member_mut(parquet, "elements")
        .and_then(|value| match value {
            Value::Array(values) => Some(values),
            _ => None,
        })
        .ok_or_else(|| block("Missing Parquet source"))?;
    let source = elements
        .iter_mut()
        .find(|element| {
            text(member(element, "id").unwrap_or(&Value::Null)).as_deref() == Some("source")
        })
        .ok_or_else(|| block("Missing Parquet source"))?;
    let extension =
        member_mut(source, "extensions").ok_or_else(|| block("Missing Parquet source"))?;
    let payload =
        member_mut(extension, "umf.parquet").ok_or_else(|| block("Missing Parquet source"))?;
    let bytes_value =
        member_mut(payload, "bytes").ok_or_else(|| block("Missing Parquet source"))?;
    *bytes_value = Value::string_utf8(hex(bytes, ctx)?);
    Ok(())
}

fn error_message(diagnostics: &[Value], prefix: &str) -> String {
    let messages = diagnostics
        .iter()
        .filter(|diagnostic| {
            text(member(diagnostic, "severity").unwrap_or(&Value::Null)).as_deref() == Some("error")
        })
        .filter_map(|diagnostic| text(member(diagnostic, "message").unwrap_or(&Value::Null)))
        .collect::<Vec<_>>();
    format!("{prefix}{}", messages.join("; "))
}

/// Explicit correction of the pinned legacy dictionary-at-data-offset layout.
/// The result always retains the original source and remains incomplete.
pub fn repair_parquet_dictionary_offsets(
    source: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let inspected = inspect_parquet_schema(source, engine, registry, capabilities, ctx)?;
    let inspected_source = member(&inspected, "source")
        .ok_or_else(|| {
            EngineError::new(
                "PARQUET_CAPTURE",
                Utf16::default(),
                "Schema result omitted source",
            )
        })?
        .clone();
    let mut diagnostics = array(member(&inspected, "diagnostics").ok_or_else(|| {
        EngineError::new(
            "PARQUET_CAPTURE",
            Utf16::default(),
            "Schema diagnostics unavailable",
        )
    })?)
    .unwrap_or(&[])
    .to_vec();
    let mut result = vec![
        ("source", inspected_source),
        ("status", Value::string_utf8("blocked")),
        ("complete", Value::Bool(false)),
        ("diagnostics", Value::Array(Vec::new())),
    ];
    if text(member(&inspected, "status").unwrap_or(&Value::Null)).as_deref() != Some("checked") {
        result[3].1 = Value::Array(diagnostics);
        return Ok(Value::Object(
            result
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        ));
    }

    let repaired = (|| -> Result<(Value, usize, Vec<Value>), EngineError> {
        let metadata = to_json(
            member(&inspected, "metadata").ok_or_else(|| block("Schema metadata unavailable"))?,
        )
        .map_err(|error| {
            if error.is_control_failure() {
                error
            } else {
                block(
                    error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Invalid metadata".into()),
                )
            }
        })?;
        let footer_result = decode_parquet_footer(source, engine, registry, capabilities, ctx)
            .map_err(|error| {
                if error.is_control_failure() {
                    error
                } else {
                    block(
                        error
                            .message
                            .to_utf8()
                            .unwrap_or_else(|_| "Invalid footer".into()),
                    )
                }
            })?;
        if text(member(&footer_result, "status").unwrap_or(&Value::Null)).as_deref()
            != Some("decoded")
        {
            return Err(block("Footer cannot be decoded"));
        }
        if unsafe_json(&metadata)
            || diagnostics.iter().any(|diagnostic| {
                text(member(diagnostic, "code").unwrap_or(&Value::Null)).as_deref()
                    == Some("PARQUET_ENUM_UNKNOWN")
            })
        {
            return Err(block(
                "Unknown, crypto or trailing footer content prevents repair",
            ));
        }
        if member(&footer_result, "trailingBytes")
            .and_then(|value| match value {
                Value::Number(number) => Some(*number as usize),
                _ => None,
            })
            .unwrap_or(0)
            != 0
        {
            return Err(block(
                "Unknown, crypto or trailing footer content prevents repair",
            ));
        }
        let mut wire_tree = copy_json(
            member(&footer_result, "value")
                .ok_or_else(|| block("Footer wire value unavailable"))?,
            ctx,
        )
        .map_err(|error| {
            if error.is_control_failure() {
                error
            } else {
                block(
                    error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Footer copy failed".into()),
                )
            }
        })?;
        let bytes = export_parquet_capture(source, engine, registry, capabilities, ctx).map_err(
            |error| {
                if error.is_control_failure() {
                    error
                } else {
                    block(
                        error
                            .message
                            .to_utf8()
                            .unwrap_or_else(|_| "Parquet capture export failed".into()),
                    )
                }
            },
        )?;
        let framing = inspect_parquet_framing(source, engine, registry, capabilities, ctx)
            .map_err(|error| {
                if error.is_control_failure() {
                    error
                } else {
                    block(
                        error
                            .message
                            .to_utf8()
                            .unwrap_or_else(|_| "Framing inspection failed".into()),
                    )
                }
            })?;
        let footer_offset = member(&framing, "footerRegion")
            .and_then(|region| member(region, "offset"))
            .and_then(|value| match value {
                Value::Number(number) => Some(*number as usize),
                _ => None,
            })
            .ok_or_else(|| block("Footer region unavailable"))?;
        let definitions = serde_json::from_str::<Json>(IDL)
            .map_err(|_| block("Pinned Parquet IDL unavailable"))?["definitions"]
            .as_object()
            .cloned()
            .ok_or_else(|| block("Pinned Parquet IDL unavailable"))?;
        let groups = wire_field(&mut wire_tree, 4)?;
        let group_items = member_mut(groups, "items")
            .and_then(|value| match value {
                Value::Array(items) => Some(items),
                _ => None,
            })
            .ok_or_else(|| block("Expected row groups"))?;
        let mut repairs = Vec::new();
        for (group_index, group) in metadata["row_groups"]
            .as_array()
            .ok_or_else(|| block("Row groups unavailable"))?
            .iter()
            .enumerate()
        {
            for (column_index, column) in group["columns"]
                .as_array()
                .ok_or_else(|| block("Columns unavailable"))?
                .iter()
                .enumerate()
            {
                if column.get("file_path").is_some()
                    || column.get("meta_data").is_none_or(Json::is_null)
                {
                    return Err(block("External or missing columns cannot be repaired"));
                }
                let native = &column["meta_data"];
                if native.get("dictionary_page_offset").is_some() {
                    continue;
                }
                let start = integer(&native["data_page_offset"], "Chunk offset", footer_offset)?;
                let size = integer(
                    &native["total_compressed_size"],
                    "Chunk size",
                    footer_offset,
                )?;
                let end = start
                    .checked_add(size)
                    .ok_or_else(|| block("Column chunk outside data region"))?;
                if start < 4 || end > footer_offset {
                    return Err(block("Column chunk outside data region"));
                }
                let (header, header_len) =
                    map_page_header(&bytes, start, end, &definitions, &mut diagnostics, ctx)?;
                if header.get("type").and_then(Json::as_str) != Some("2") {
                    continue;
                }
                let body = integer(
                    &header["compressed_page_size"],
                    "Dictionary body",
                    PAGE_BYTES,
                )?;
                let next = start
                    .checked_add(header_len)
                    .and_then(|value| value.checked_add(body))
                    .ok_or_else(|| block("Dictionary is not followed by data in this chunk"))?;
                if next >= end {
                    return Err(block("Dictionary is not followed by data in this chunk"));
                }
                let (following, _) =
                    map_page_header(&bytes, next, end, &definitions, &mut diagnostics, ctx)?;
                if !matches!(
                    following.get("type").and_then(Json::as_str),
                    Some("0" | "3")
                ) {
                    return Err(block("Dictionary must be followed by a data page"));
                }
                let columns = wire_field(&mut group_items[group_index], 1)?;
                let column_items = member_mut(columns, "items")
                    .and_then(|value| match value {
                        Value::Array(items) => Some(items),
                        _ => None,
                    })
                    .ok_or_else(|| block("Expected columns"))?;
                let wire = wire_field(&mut column_items[column_index], 3)?;
                let data = wire_field(wire, 9)?;
                if text(member(data, "kind").ok_or_else(|| block("Expected data offset integer"))?)
                    .as_deref()
                    != Some("i64")
                {
                    return Err(block("Expected data offset integer"));
                }
                *member_mut(data, "value")
                    .ok_or_else(|| block("Expected data offset integer"))? =
                    Value::string_utf8(next.to_string());
                let fields = member_mut(wire, "fields")
                    .and_then(|value| match value {
                        Value::Array(fields) => Some(fields),
                        _ => None,
                    })
                    .ok_or_else(|| block("Expected metadata struct"))?;
                fields.push(serde_wire_field(11, "i64", start));
                repairs.push(serde_json::json!({"rowGroup":group_index,"column":column_index,"oldDataOffset":start,"dataOffset":next,"dictionaryOffset":start}));
            }
        }
        if repairs.is_empty() {
            return Err(block("No matching legacy dictionary-offset layout found"));
        }
        let footer = encode_parquet_wire(&wire_tree, ctx).map_err(|error| {
            if error.is_control_failure() {
                error
            } else {
                block(
                    error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Footer encoding failed".into()),
                )
            }
        })?;
        let size = footer_offset
            .checked_add(footer.len())
            .and_then(|size| size.checked_add(8))
            .ok_or_else(|| block("Edited file exceeds capture limit"))?;
        if size > MAX_BYTES {
            return Err(block("Edited file exceeds capture limit"));
        }
        let mut output_bytes = Vec::new();
        output_bytes.try_reserve_exact(size).map_err(|_| {
            EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Parquet repair allocation failed",
            )
            .with_control_failure()
        })?;
        output_bytes.extend_from_slice(&bytes[..footer_offset]);
        output_bytes.extend_from_slice(&footer);
        output_bytes.extend_from_slice(&(footer.len() as u32).to_le_bytes());
        output_bytes.extend_from_slice(b"PAR1");
        let mut output = copy_json(source, ctx).map_err(|error| {
            if error.is_control_failure() {
                error
            } else {
                block(
                    error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Source copy failed".into()),
                )
            }
        })?;
        replace_source_bytes(&mut output, &output_bytes, ctx)?;
        let pages = inspect_parquet_pages(&output, engine, registry, capabilities, ctx).map_err(
            |error| {
                if error.is_control_failure() {
                    error
                } else {
                    block(
                        error
                            .message
                            .to_utf8()
                            .unwrap_or_else(|_| "Candidate page validation failed".into()),
                    )
                }
            },
        )?;
        if text(member(&pages, "status").unwrap_or(&Value::Null)).as_deref() != Some("checked") {
            return Err(block(error_message(
                array(member(&pages, "diagnostics").unwrap_or(&Value::Null)).unwrap_or(&[]),
                "Candidate page validation failed: ",
            )));
        }
        let values = decode_parquet_values(&output, engine, registry, capabilities, ctx).map_err(
            |error| {
                if error.is_control_failure() {
                    error
                } else {
                    block(
                        error
                            .message
                            .to_utf8()
                            .unwrap_or_else(|_| "Candidate value validation failed".into()),
                    )
                }
            },
        )?;
        if text(member(&values, "status").unwrap_or(&Value::Null)).as_deref() != Some("projected") {
            return Err(block(error_message(
                array(member(&values, "diagnostics").unwrap_or(&Value::Null)).unwrap_or(&[]),
                "Candidate value validation failed: ",
            )));
        }
        Ok((
            output,
            footer_offset,
            repairs
                .into_iter()
                .map(|repair| {
                    Value::Object(
                        [
                            "rowGroup",
                            "column",
                            "oldDataOffset",
                            "dataOffset",
                            "dictionaryOffset",
                        ]
                        .into_iter()
                        .map(|key| (Utf16::from(key), from_json_value(repair[key].clone())))
                        .collect(),
                    )
                })
                .collect(),
        ))
    })();

    match repaired {
        Ok((output, unchanged_prefix, repairs)) => {
            result[1].1 = Value::string_utf8("transformed");
            result.push(("output", output));
            result.push((
                "unchangedPrefixBytes",
                Value::Number(unchanged_prefix as f64),
            ));
            result.push(("repairs", Value::Array(repairs)));
            diagnostics.push(diagnostic(
                "PARQUET_OFFSET_REPAIR_SCOPE",
                "",
                "warning",
                "Explicit offset correction; all bytes before the footer are unchanged. Original source remains authoritative; footer spelling may normalize. Candidate passes bounded page/value decoding, not general Parquet conformance",
            ));
        }
        Err(error) if error.is_control_failure() => return Err(error),
        Err(error) => diagnostics.push(diagnostic(
            "PARQUET_OFFSET_REPAIR_BLOCKED",
            "",
            "error",
            &error
                .message
                .to_utf8()
                .unwrap_or_else(|_| "Repair failed".into()),
        )),
    }
    result[3].1 = Value::Array(diagnostics);
    Ok(Value::Object(
        result
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    ))
}

fn serde_wire_field(id: i64, kind: &str, value: usize) -> Value {
    Value::Object(vec![
        (Utf16::from("id"), Value::Number(id as f64)),
        (
            Utf16::from("value"),
            Value::Object(vec![
                (Utf16::from("kind"), Value::string_utf8(kind)),
                (Utf16::from("value"), Value::string_utf8(value.to_string())),
            ]),
        ),
    ])
}

fn from_json_value(value: Json) -> Value {
    match value {
        Json::Null => Value::Null,
        Json::Bool(value) => Value::Bool(value),
        Json::Number(value) => Value::Number(value.as_f64().unwrap_or_default()),
        Json::String(value) => Value::string_utf8(value),
        Json::Array(values) => Value::Array(values.into_iter().map(from_json_value).collect()),
        Json::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), from_json_value(value)))
                .collect(),
        ),
    }
}

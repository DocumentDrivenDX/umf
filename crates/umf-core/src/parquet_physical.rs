// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded Parquet physical value decoding over verified page bodies and levels.
//!
//! This layer preserves exact physical carriers. It does not validate logical
//! annotations, assemble rows, or convert values to host scalars.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_capture_inspection::{diagnostic, from_json, inspect_parquet_schema, to_json},
    parquet_levels::decode_parquet_hybrid,
    parquet_levels::decode_parquet_levels,
    parquet_pages::decode_parquet_page_bodies,
    registry::Registry,
    value::{Utf16, Value},
};
use serde_json::{json, Value as Json};
use std::collections::HashMap;

const PAGE_BYTES: usize = 8 * 1024 * 1024;
const PAGE_VALUES: usize = 100_000;
const PAGE_COUNT: usize = 10_000;
const MATERIALIZED_BYTES: usize = 64 * 1024 * 1024;

fn error(message: impl AsRef<str>) -> EngineError {
    EngineError::new(
        "PARQUET_PHYSICAL_DECODE",
        Utf16::default(),
        message.as_ref(),
    )
}

fn allocation_error() -> EngineError {
    EngineError::new(
        "RESOURCE_LIMIT",
        Utf16::default(),
        "Parquet physical allocation failed",
    )
    .with_control_failure()
}

fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}

fn array(value: &Value) -> Option<&[Value]> {
    if let Value::Array(values) = value {
        Some(values)
    } else {
        None
    }
}

fn text(value: &Value) -> Option<String> {
    if let Value::String(value) = value {
        value.to_utf8().ok()
    } else {
        None
    }
}

fn public_result(source: Value, status: &str, diagnostics: Vec<Value>) -> Value {
    Value::Object(
        [
            (Utf16::from("source"), source),
            (Utf16::from("status"), Value::string_utf8(status)),
            (Utf16::from("complete"), Value::Bool(false)),
            (Utf16::from("diagnostics"), Value::Array(diagnostics)),
        ]
        .into_iter()
        .collect(),
    )
}

fn public_error(
    mut diagnostics: Vec<Value>,
    failure: EngineError,
) -> Result<Vec<Value>, EngineError> {
    if failure.is_control_failure() {
        return Err(failure);
    }
    diagnostics.push(diagnostic(
        "PARQUET_PHYSICAL_DECODE",
        "",
        "error",
        &failure
            .message
            .to_utf8()
            .unwrap_or_else(|_| "Invalid physical values".to_owned()),
    ));
    Ok(diagnostics)
}

fn bounded_count(value: &Json, max: usize, label: &str) -> Result<usize, EngineError> {
    let number = value
        .as_u64()
        .or_else(|| value.as_str().and_then(|text| text.parse::<u64>().ok()))
        .ok_or_else(|| error(format!("{label} exceeds supported bound")))?;
    if number > max as u64 {
        return Err(error(format!("{label} exceeds supported bound")));
    }
    Ok(number as usize)
}

fn hex_bytes(hex: &str, ctx: &mut Context<'_>) -> Result<Vec<u8>, EngineError> {
    if hex.len() % 2 != 0 || hex.len() / 2 > PAGE_BYTES {
        return Err(error("Physical decoder bound exceeded"));
    }
    let mut bytes = Vec::new();
    bytes
        .try_reserve_exact(hex.len() / 2)
        .map_err(|_| allocation_error())?;
    for (i, pair) in hex.as_bytes().chunks_exact(2).enumerate() {
        if i % 1024 == 0 {
            ctx.charge_work((hex.len() / 2 - i).min(1024), Utf16::default())?;
        }
        let digit = |byte: u8| match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            _ => None,
        };
        let high = digit(pair[0]).ok_or_else(|| error("Invalid physical body hex"))?;
        let low = digit(pair[1]).ok_or_else(|| error("Invalid physical body hex"))?;
        bytes.push((high << 4) | low);
    }
    Ok(bytes)
}

fn hex(bytes: &[u8], ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let capacity = bytes.len().checked_mul(2).ok_or_else(allocation_error)?;
    let mut output = String::new();
    output
        .try_reserve_exact(capacity)
        .map_err(|_| allocation_error())?;
    for (i, byte) in bytes.iter().enumerate() {
        if i % 1024 == 0 {
            ctx.charge_work((bytes.len() - i).min(1024), Utf16::default())?;
        }
        use std::fmt::Write;
        write!(&mut output, "{byte:02x}").map_err(|_| allocation_error())?;
    }
    Ok(output)
}

fn physical_value_bytes(value: &Value) -> usize {
    let kind = member(value, "type").and_then(text);
    if kind.as_deref() == Some("BOOLEAN") {
        return 1;
    }
    if kind.as_deref() == Some("INT32") {
        return 4;
    }
    if kind.as_deref() == Some("INT64") {
        return 8;
    }
    let byte_length = member(value, "hex")
        .and_then(text)
        .map(|hex| hex.len() / 2)
        .unwrap_or_default();
    byte_length + usize::from(kind.as_deref() == Some("BYTE_ARRAY")) * 4
}

/// Decode exactly one bounded PLAIN stream to physical carriers.
pub fn decode_parquet_plain(
    input: &[u8],
    physical_type: &str,
    count: usize,
    fixed_length: Option<usize>,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    if input.len() > PAGE_BYTES || count > PAGE_VALUES {
        return Err(error("PLAIN decoder bound exceeded"));
    }
    if !matches!(
        physical_type,
        "BOOLEAN"
            | "INT32"
            | "INT64"
            | "INT96"
            | "FLOAT"
            | "DOUBLE"
            | "BYTE_ARRAY"
            | "FIXED_LEN_BYTE_ARRAY"
    ) {
        return Err(error("Unknown PLAIN physical type"));
    }
    if physical_type == "FIXED_LEN_BYTE_ARRAY" && !matches!(fixed_length, Some(1..=PAGE_BYTES)) {
        return Err(error("Invalid fixed byte width"));
    }
    ctx.charge_work(count, Utf16::default())?;
    let mut values = Vec::new();
    values
        .try_reserve_exact(count)
        .map_err(|_| allocation_error())?;
    let mut at = 0usize;
    let take = |at: &mut usize, length: usize| -> Result<usize, EngineError> {
        let end = at
            .checked_add(length)
            .filter(|end| *end <= input.len())
            .ok_or_else(|| error("PLAIN value exceeds input"))?;
        let start = *at;
        *at = end;
        Ok(start)
    };
    if physical_type == "BOOLEAN" {
        if input.len() != count.div_ceil(8) {
            return Err(error("PLAIN boolean length mismatch"));
        }
        for index in 0..count {
            if index % 1024 == 0 {
                ctx.charge_work((count - index).min(1024), Utf16::default())?;
            }
            values.push(Value::Object(vec![
                (Utf16::from("type"), Value::string_utf8("BOOLEAN")),
                (
                    Utf16::from("value"),
                    Value::Bool(input[index / 8] & (1 << (index % 8)) != 0),
                ),
            ]));
        }
        return Ok(values);
    }
    for index in 0..count {
        if index % 1024 == 0 {
            ctx.charge_work((count - index).min(1024), Utf16::default())?;
        }
        match physical_type {
            "INT32" => {
                let start = take(&mut at, 4)?;
                let number = i32::from_le_bytes(input[start..start + 4].try_into().unwrap());
                values.push(Value::Object(vec![
                    (Utf16::from("type"), Value::string_utf8("INT32")),
                    (Utf16::from("value"), Value::string_utf8(number.to_string())),
                ]));
            }
            "INT64" => {
                let start = take(&mut at, 8)?;
                let number = i64::from_le_bytes(input[start..start + 8].try_into().unwrap());
                values.push(Value::Object(vec![
                    (Utf16::from("type"), Value::string_utf8("INT64")),
                    (Utf16::from("value"), Value::string_utf8(number.to_string())),
                ]));
            }
            _ => {
                let length = match physical_type {
                    "FLOAT" => 4,
                    "DOUBLE" => 8,
                    "INT96" => 12,
                    "FIXED_LEN_BYTE_ARRAY" => fixed_length.unwrap(),
                    "BYTE_ARRAY" => {
                        let prefix = take(&mut at, 4)?;
                        u32::from_le_bytes(input[prefix..prefix + 4].try_into().unwrap()) as usize
                    }
                    _ => unreachable!(),
                };
                let start = take(&mut at, length)?;
                let kind = if physical_type == "FIXED_LEN_BYTE_ARRAY" {
                    "FIXED_LEN_BYTE_ARRAY"
                } else {
                    physical_type
                };
                values.push(Value::Object(vec![
                    (Utf16::from("type"), Value::string_utf8(kind)),
                    (
                        Utf16::from("hex"),
                        Value::string_utf8(hex(&input[start..start + length], ctx)?),
                    ),
                ]));
            }
        }
    }
    if at != input.len() {
        return Err(error("Trailing PLAIN bytes"));
    }
    Ok(values)
}

/// Decode bounded PLAIN and dictionary values after page-body and level checks.
pub fn decode_parquet_physical(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let levels = decode_parquet_levels(document, engine, registry, capabilities, ctx)?;
    let source = member(&levels, "source")
        .ok_or_else(|| error("Level result omitted source"))?
        .clone();
    let mut diagnostics = array(
        member(&levels, "diagnostics").ok_or_else(|| error("Level diagnostics unavailable"))?,
    )
    .unwrap_or(&[])
    .to_vec();
    if text(member(&levels, "status").unwrap_or(&Value::Null)).as_deref() != Some("decoded") {
        return Ok(public_result(source, "blocked", diagnostics));
    }

    let bodies = decode_parquet_page_bodies(document, engine, registry, capabilities, ctx)?;
    if text(member(&bodies, "status").unwrap_or(&Value::Null)).as_deref() != Some("decoded") {
        return Ok(public_result(source, "blocked", diagnostics));
    }
    let schema = inspect_parquet_schema(document, engine, registry, capabilities, ctx)?;
    let metadata =
        to_json(member(&schema, "metadata").ok_or_else(|| error("Schema metadata unavailable"))?)?;
    let leaves =
        to_json(member(&schema, "leaves").ok_or_else(|| error("Schema leaves unavailable"))?)?;
    let level_pages =
        array(member(&levels, "pages").ok_or_else(|| error("Level pages unavailable"))?)
            .ok_or_else(|| error("Level pages unavailable"))?;
    let body_pages =
        array(member(&bodies, "pages").ok_or_else(|| error("Body pages unavailable"))?)
            .ok_or_else(|| error("Body pages unavailable"))?;

    let work = (|| -> Result<(Vec<Value>, usize), EngineError> {
        if body_pages.len() > PAGE_COUNT {
            return Err(error("Page count limit exceeded"));
        }
        let leaf_list = leaves
            .as_array()
            .ok_or_else(|| error("Schema leaves unavailable"))?;
        let schema_elements = metadata["schema"]
            .as_array()
            .ok_or_else(|| error("Schema elements unavailable"))?;
        let mut level_by_page = HashMap::new();
        level_by_page
            .try_reserve(level_pages.len())
            .map_err(|_| allocation_error())?;
        for level in level_pages {
            let json = to_json(level)?;
            let key = (
                bounded_count(&json["rowGroup"], usize::MAX, "Row group")?,
                bounded_count(&json["column"], usize::MAX, "Column")?,
                bounded_count(&json["offset"], usize::MAX, "Page offset")?,
            );
            level_by_page.insert(key, level);
        }
        let mut dictionaries = HashMap::<(usize, usize), Vec<Value>>::new();
        let mut pages = Vec::new();
        pages
            .try_reserve(body_pages.len())
            .map_err(|_| allocation_error())?;
        let mut materialized_bytes = 0usize;

        for body_page in body_pages {
            ctx.charge_work(1, Utf16::default())?;
            let page = to_json(body_page)?;
            let header = &page["header"];
            let is_dictionary = header["type"] == "2";
            let row_group = bounded_count(&page["rowGroup"], usize::MAX, "Row group")?;
            let column =
                bounded_count(&page["column"], leaf_list.len().saturating_sub(1), "Column")?;
            let offset = bounded_count(&page["offset"], usize::MAX, "Page offset")?;
            let leaf = leaf_list
                .get(column)
                .ok_or_else(|| error("Page column is outside the physical schema"))?;
            let element_index = bounded_count(
                &leaf["index"],
                schema_elements.len().saturating_sub(1),
                "Schema index",
            )?;
            let element = schema_elements
                .get(element_index)
                .ok_or_else(|| error("Physical schema element unavailable"))?;
            let physical_type = leaf["physicalType"]
                .as_str()
                .ok_or_else(|| error("Physical type unavailable"))?;
            let level_key = (row_group, column, offset);
            let level_view = level_by_page.get(&level_key).copied();
            let page_header = if is_dictionary {
                &header["dictionary_page_header"]
            } else if !header["data_page_header_v2"].is_null() {
                &header["data_page_header_v2"]
            } else {
                &header["data_page_header"]
            };
            let count = if is_dictionary {
                bounded_count(
                    &page_header["num_values"],
                    PAGE_VALUES,
                    "Physical value count",
                )?
            } else {
                let level_json = to_json(
                    level_view.ok_or_else(|| error("Physical page has no decoded levels"))?,
                )?;
                bounded_count(
                    &level_json["nonNullValues"],
                    PAGE_VALUES,
                    "Physical value count",
                )?
            };
            let encoding = page_header["encoding"]
                .as_str()
                .ok_or_else(|| error("Physical encoding unavailable"))?;
            let body_hex = page["bodyHex"]
                .as_str()
                .ok_or_else(|| error("Physical page body unavailable"))?;
            let body = hex_bytes(body_hex, ctx)?;
            let values_offset = if is_dictionary {
                0
            } else {
                bounded_count(
                    &to_json(
                        level_view.ok_or_else(|| error("Physical page has no decoded levels"))?,
                    )?["valuesOffset"],
                    body.len(),
                    "Value offset",
                )?
            };
            let input = body
                .get(values_offset..)
                .ok_or_else(|| error("Value region exceeds page body"))?;
            let fixed_length = element
                .get("type_length")
                .filter(|value| !value.is_null())
                .map(|value| bounded_count(value, PAGE_BYTES, "Fixed byte width"))
                .transpose()?;
            let key = (row_group, column);
            let mut dictionary_indexes = None;
            let mut dictionary_padding = None;
            let values = if encoding == "0" || is_dictionary && encoding == "2" {
                decode_parquet_plain(input, physical_type, count, fixed_length, ctx)?
            } else if !is_dictionary && matches!(encoding, "2" | "8") {
                let dictionary = dictionaries
                    .get(&key)
                    .ok_or_else(|| error("Dictionary page unavailable"))?;
                if input.is_empty() {
                    if count != 0 {
                        return Err(error("Missing dictionary bit width"));
                    }
                    dictionary_indexes = Some(Vec::new());
                    dictionary_padding = Some(Vec::new());
                    Vec::new()
                } else {
                    let width = u32::from(input[0]);
                    if count > 0 && dictionary.is_empty() {
                        return Err(error("Empty dictionary referenced"));
                    }
                    if width > 32 {
                        return Err(error("Hybrid decoder bounds exceeded"));
                    }
                    let maximum = if width == 32 {
                        u32::MAX as u64
                    } else if width == 0 {
                        0
                    } else {
                        (1u64 << width) - 1
                    }
                    .min(dictionary.len().saturating_sub(1) as u64);
                    let (indices, _, padding) =
                        decode_parquet_hybrid(&input[1..], width, count, maximum, ctx)?;
                    let mut expanded = Vec::new();
                    expanded
                        .try_reserve_exact(indices.len())
                        .map_err(|_| allocation_error())?;
                    for index in &indices {
                        expanded.push(
                            dictionary
                                .get(*index as usize)
                                .ok_or_else(|| error("Dictionary index exceeds allowed range"))?
                                .clone(),
                        );
                    }
                    dictionary_indexes = Some(indices.into_iter().map(|v| json!(v)).collect());
                    dictionary_padding = Some(padding.into_iter().map(|v| json!(v)).collect());
                    expanded
                }
            } else {
                return Err(error(format!(
                    "Physical value encoding {encoding} is not supported"
                )));
            };

            for value in &values {
                materialized_bytes = materialized_bytes
                    .checked_add(physical_value_bytes(value))
                    .filter(|total| *total <= MATERIALIZED_BYTES)
                    .ok_or_else(|| error("Expanded physical values exceed 64 MiB budget"))?;
            }
            if is_dictionary {
                dictionaries.insert(key, values.clone());
            }
            let mut fields = vec![
                (Utf16::from("rowGroup"), from_json(json!(row_group))),
                (Utf16::from("column"), from_json(json!(column))),
                (Utf16::from("offset"), from_json(json!(offset))),
                (
                    Utf16::from("kind"),
                    Value::string_utf8(if is_dictionary { "dictionary" } else { "data" }),
                ),
                (Utf16::from("values"), Value::Array(values)),
            ];
            if let Some(level_view) = level_view {
                fields.push((Utf16::from("levels"), level_view.clone()));
            }
            if let (Some(indexes), Some(padding)) = (dictionary_indexes, dictionary_padding) {
                fields.push((
                    Utf16::from("dictionaryIndexes"),
                    from_json(Json::Array(indexes)),
                ));
                fields.push((
                    Utf16::from("dictionaryPadding"),
                    from_json(Json::Array(padding)),
                ));
            }
            pages.push(Value::Object(fields));
        }
        Ok((pages, materialized_bytes))
    })();

    match work {
        Ok((pages, materialized_bytes)) => {
            diagnostics.push(diagnostic(
                "PARQUET_PHYSICAL_SEMANTICS_UNVERIFIED",
                "",
                "warning",
                "Exact physical carriers decoded; logical validation, cross-column consistency and complete row assembly remain unverified",
            ));
            let mut result = public_result(source, "decoded", diagnostics);
            if let Value::Object(fields) = &mut result {
                fields.push((Utf16::from("pages"), Value::Array(pages)));
                fields.push((
                    Utf16::from("materializedBytes"),
                    Value::Number(materialized_bytes as f64),
                ));
            }
            Ok(result)
        }
        Err(failure) => {
            let diagnostics = public_error(diagnostics, failure)?;
            Ok(public_result(source, "blocked", diagnostics))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        engine::{ResourceSet, SemanticContext},
        error::Diagnostic,
        parquet_capture_inspection::capture_parquet,
        registry::Registry,
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

    fn parse_value(source: &str) -> Value {
        read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn test_engine() -> Engine {
        Engine::new(
            ResourceSet::new(
                parse_value(include_str!("../../../spec/core/schema.json")),
                parse_value(include_str!(
                    "../../../spec/core/semantic-type-reference.schema.json"
                )),
                parse_value(include_str!(
                    "../../../spec/core/extension-package.schema.json"
                )),
                parse_value(include_str!(
                    "../../../spec/metamodel/generated/core-constraints.json"
                )),
                parse_value(include_str!(
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

    fn json(value: &Value) -> Json {
        to_json(value).unwrap()
    }

    #[test]
    fn plain_physical_carriers_preserve_widths_bits_and_binary() {
        let mut ctx = Context::ordinary();
        let values = decode_parquet_plain(
            &[
                0x00, 0x00, 0x00, 0x80, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff,
                0xff, 0x7f,
            ],
            "INT32",
            4,
            None,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            json(&Value::Array(values)),
            json!([
                {"type":"INT32","value":"-2147483648"},
                {"type":"INT32","value":"-1"},
                {"type":"INT32","value":"0"},
                {"type":"INT32","value":"2147483647"}
            ])
        );
        let mut ctx = Context::ordinary();
        let values =
            decode_parquet_plain(&[0x00, 0x00, 0xc0, 0x7f], "FLOAT", 1, None, &mut ctx).unwrap();
        assert_eq!(
            json(&Value::Array(values)),
            json!([{"type":"FLOAT","hex":"0000c07f"}])
        );
        let mut ctx = Context::ordinary();
        let values = decode_parquet_plain(
            &[0x02, 0x00, 0x00, 0x00, 0x00, 0xff],
            "BYTE_ARRAY",
            1,
            None,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            json(&Value::Array(values)),
            json!([{"type":"BYTE_ARRAY","hex":"00ff"}])
        );
    }

    #[test]
    fn plain_physical_decoder_rejects_partial_or_unbounded_streams() {
        let mut ctx = Context::ordinary();
        assert_eq!(
            decode_parquet_plain(&[0], "INT32", 1, None, &mut ctx)
                .unwrap_err()
                .message
                .to_utf8()
                .unwrap(),
            "PLAIN value exceeds input"
        );
        let mut ctx = Context::ordinary();
        assert_eq!(
            decode_parquet_plain(&[0, 0, 0, 0, 1], "INT32", 1, None, &mut ctx)
                .unwrap_err()
                .message
                .to_utf8()
                .unwrap(),
            "Trailing PLAIN bytes"
        );
        let mut ctx = Context::ordinary();
        assert_eq!(
            decode_parquet_plain(&[], "INT64", PAGE_VALUES + 1, None, &mut ctx)
                .unwrap_err()
                .message
                .to_utf8()
                .unwrap(),
            "PLAIN decoder bound exceeded"
        );
    }

    #[test]
    fn physical_operation_matches_authored_carriers_and_blocks_without_partial_pages() {
        let engine = test_engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        let manifest: Json = serde_json::from_str(include_str!(
            "../../../fixtures/parquet/physical/authored/manifest.json"
        ))
        .unwrap();
        for case in manifest["cases"].as_array().unwrap() {
            let id = case["id"].as_str().unwrap();
            let bytes = fixture(case["path"].as_str().unwrap());
            let document = capture_parquet(
                &bytes,
                &Utf16::from(id),
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let result = decode_parquet_physical(
                &document,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let public = json(&result);
            assert_eq!(public["status"], "decoded", "{id}");
            assert_eq!(public["complete"], false, "{id}");
            let pages = public["pages"].as_array().unwrap();
            assert_eq!(pages.last().unwrap()["values"], case["expected"], "{id}");
            if id.contains("dictionary") {
                assert_eq!(pages[0]["values"], case["expected"], "{id}");
            }
            assert!(public["materializedBytes"].as_u64().is_some(), "{id}");
        }

        let negative: Json = serde_json::from_str(include_str!(
            "../../../fixtures/parquet/physical/authored/negative.json"
        ))
        .unwrap();
        for case in negative["cases"].as_array().unwrap() {
            let id = case["id"].as_str().unwrap();
            let bytes = fixture(case["path"].as_str().unwrap());
            let document = capture_parquet(
                &bytes,
                &Utf16::from(id),
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let result = decode_parquet_physical(
                &document,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let public = json(&result);
            assert_eq!(public["status"], "blocked", "{id}");
            assert!(public.get("pages").is_none(), "{id}");
            assert!(public.get("materializedBytes").is_none(), "{id}");
            let diagnostics = public["diagnostics"].as_array().unwrap();
            assert!(
                diagnostics.last().unwrap()["message"]
                    .as_str()
                    .unwrap()
                    .contains(case["expectedMessage"].as_str().unwrap()),
                "{id}"
            );
        }
    }
}

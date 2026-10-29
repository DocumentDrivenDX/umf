// SPDX-License-Identifier: MIT OR Apache-2.0
//! Declared Parquet page inspection and bounded physical body decoding.
//! The original UTF-16 document stays in `Value`; only known native metadata
//! and PageHeader projections enter serde_json for IDL interpretation.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_capture_inspection::{
        diagnostic, export_parquet_capture, from_json, has_unknown_json, inspect_parquet_metadata,
        inspect_parquet_schema, map_idl_value, to_json, IDL,
    },
    parquet_schema_decode::{decode_compact_struct_prefix, locate_footer},
    registry::Registry,
    value::{Utf16, Value},
};
use serde_json::{json, Value as Json};

const HEADER: usize = 65_536;
const PAGE: usize = 8 * 1024 * 1024;
const TOTAL: usize = 64 * 1024 * 1024;
const PAGES: usize = 10_000;
const VALUES: usize = 1_000_000;

fn err(message: impl AsRef<str>) -> EngineError {
    EngineError::new("PARQUET_PAGE_BOUNDS", Utf16::default(), message.as_ref())
}
fn allocation_err() -> EngineError {
    EngineError::new(
        "RESOURCE_LIMIT",
        Utf16::default(),
        "Parquet page allocation failed",
    )
    .with_control_failure()
}
fn member<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = v else {
        return None;
    };
    fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(name))
        .map(|(_, v)| v)
}
fn arr(v: &Value) -> Option<&[Value]> {
    if let Value::Array(v) = v {
        Some(v)
    } else {
        None
    }
}
fn txt(v: &Value) -> Option<String> {
    if let Value::String(v) = v {
        v.to_utf8().ok()
    } else {
        None
    }
}
fn obj<'a>(fields: impl IntoIterator<Item = (&'a str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn num(v: usize) -> Value {
    Value::Number(v as f64)
}
fn j<'a>(v: &'a Json, k: &str) -> &'a Json {
    &v[k]
}
fn s(v: &Json) -> Option<&str> {
    v.as_str()
}
fn count(v: &Json, max: usize, label: &str) -> Result<usize, EngineError> {
    let n = s(v)
        .and_then(|s| s.parse::<i128>().ok())
        .ok_or_else(|| err(format!("{label} exceeds supported nonnegative bound")))?;
    if n < 0 || n > max as i128 {
        return Err(err(format!("{label} exceeds supported nonnegative bound")));
    }
    Ok(n as usize)
}
fn finish(
    source: Value,
    status: &str,
    ds: Vec<Value>,
    pages: Option<Vec<Value>>,
    total_name: &str,
    total: usize,
    other_name: &str,
    other: usize,
) -> Value {
    let mut fields = vec![
        ("source", source),
        ("status", Value::string_utf8(status)),
        ("complete", Value::Bool(false)),
        ("diagnostics", Value::Array(ds)),
    ];
    if let Some(pages) = pages {
        fields.push(("pages", Value::Array(pages)));
        fields.push((total_name, num(total)));
        if !other_name.is_empty() {
            fields.push((other_name, num(other)));
        }
    }
    obj(fields)
}
fn failure(mut ds: Vec<Value>, error: EngineError, code: &str) -> Result<Vec<Value>, EngineError> {
    if error.is_control_failure() {
        return Err(error);
    }
    ds.push(diagnostic(
        code,
        "",
        "error",
        &error
            .message
            .to_utf8()
            .unwrap_or_else(|_| "Invalid page".into()),
    ));
    Ok(ds)
}

/// Page-header and declared-budget inspection; no decompression occurs here.
pub fn inspect_parquet_pages(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let inspected = inspect_parquet_schema(document, engine, registry, capabilities, ctx)?;
    let source = member(&inspected, "source")
        .ok_or_else(|| err("Schema result omitted source"))?
        .clone();
    let mut ds = arr(member(&inspected, "diagnostics")
        .ok_or_else(|| err("Schema result omitted diagnostics"))?)
    .unwrap_or(&[])
    .to_vec();
    if member(&inspected, "status").and_then(txt).as_deref() != Some("checked") {
        return Ok(finish(source, "blocked", ds, None, "", 0, "", 0));
    }
    let metadata = to_json(
        member(&inspected, "metadata").ok_or_else(|| err("Schema result omitted metadata"))?,
    )?;
    let bytes = export_parquet_capture(document, engine, registry, capabilities, ctx)?;
    let footer = locate_footer(&bytes)?.offset;
    let idl: Json = serde_json::from_str(IDL).map_err(|_| err("Pinned Parquet IDL unavailable"))?;
    let definitions = idl["definitions"]
        .as_object()
        .ok_or_else(|| err("Pinned Parquet IDL unavailable"))?;
    let mut pages = Vec::new();
    let mut ranges: Vec<(usize, usize)> = Vec::new();
    let mut total_bytes = 0usize;
    let mut total_values = 0usize;
    let work = (|| -> Result<(), EngineError> {
        if has_unknown_json(&metadata)
            || ds
                .iter()
                .any(|d| member(d, "code").and_then(txt).as_deref() == Some("PARQUET_ENUM_UNKNOWN"))
        {
            return Err(err("Unknown/crypto metadata prevents page interpretation"));
        }
        count(j(&metadata, "num_rows"), 10_000, "Rows")?;
        for (g, group) in metadata["row_groups"]
            .as_array()
            .ok_or_else(|| err("Row groups unavailable"))?
            .iter()
            .enumerate()
        {
            for (c, column) in group["columns"]
                .as_array()
                .ok_or_else(|| err("Columns unavailable"))?
                .iter()
                .enumerate()
            {
                if column.get("file_path").is_some()
                    || column.get("meta_data").is_none_or(Json::is_null)
                {
                    return Err(err("External or unavailable columns cannot be inspected"));
                }
                let m = &column["meta_data"];
                let start = count(
                    m.get("dictionary_page_offset")
                        .unwrap_or(&m["data_page_offset"]),
                    footer,
                    "Chunk offset",
                )?;
                let size = count(&m["total_compressed_size"], footer, "Chunk size")?;
                let end = start
                    .checked_add(size)
                    .ok_or_else(|| err("Column chunk is outside the data region"))?;
                if start < 4 || end > footer {
                    return Err(err("Column chunk is outside the data region"));
                }
                if ranges.iter().any(|(a, b)| start < *b && end > *a) {
                    return Err(err("Column chunks overlap"));
                }
                ranges.try_reserve(1).map_err(|_| allocation_err())?;
                ranges.push((start, end));
                let expected_values = count(&m["num_values"], VALUES, "Column values")?;
                let expected_bytes = count(
                    &m["total_uncompressed_size"],
                    TOTAL,
                    "Column uncompressed size",
                )?;
                let mut at = start;
                let mut values = 0usize;
                let mut uncompressed = 0usize;
                let mut first_data = None;
                let mut dictionary = false;
                let mut v2_rows = 0usize;
                let mut all_v2 = true;
                while at < end {
                    if pages.len() >= PAGES {
                        return Err(err("Page count limit exceeded"));
                    }
                    let window_end = end.min(at.saturating_add(HEADER));
                    let (wire, header_bytes) =
                        decode_compact_struct_prefix(&bytes[at..window_end], ctx).map_err(|e| {
                            if e.is_control_failure() {
                                e
                            } else {
                                err(e
                                    .message
                                    .to_utf8()
                                    .unwrap_or_else(|_| "Invalid Compact Protocol value".into()))
                            }
                        })?;
                    let header = map_idl_value(
                        &wire,
                        &json!({"ref":"PageHeader"}),
                        definitions,
                        &mut ds,
                        "",
                    )
                    .map_err(err)?;
                    if has_unknown_json(&header)
                        || ds.iter().any(|d| {
                            member(d, "code").and_then(txt).as_deref()
                                == Some("PARQUET_ENUM_UNKNOWN")
                        })
                    {
                        return Err(err("Unknown page header semantics"));
                    }
                    let compressed = count(
                        &header["compressed_page_size"],
                        PAGE,
                        "Page compressed size",
                    )?;
                    let expanded = count(
                        &header["uncompressed_page_size"],
                        PAGE,
                        "Page uncompressed size",
                    )?;
                    let body_offset = at + header_bytes;
                    if body_offset.checked_add(compressed).is_none_or(|x| x > end) {
                        return Err(err("Page body exceeds column chunk"));
                    }
                    let ty = s(&header["type"]);
                    let which = match ty {
                        Some("0") => "data_page_header",
                        Some("2") => "dictionary_page_header",
                        Some("3") => "data_page_header_v2",
                        _ => return Err(err("Unsupported or missing page-type header")),
                    };
                    if header.get(which).is_none() {
                        return Err(err("Unsupported or missing page-type header"));
                    }
                    for key in [
                        "data_page_header",
                        "dictionary_page_header",
                        "data_page_header_v2",
                        "index_page_header",
                    ] {
                        if key != which && header.get(key).is_some() {
                            return Err(err("Conflicting page-type headers"));
                        }
                    }
                    let h = &header[which];
                    let n = count(&h["num_values"], 100_000, "Page values")?;
                    if ty == Some("2") {
                        if dictionary || at != start || m.get("dictionary_page_offset").is_none() {
                            return Err(err("Dictionary must occur once at declared chunk start"));
                        }
                        dictionary = true;
                    } else {
                        first_data.get_or_insert(at);
                        values += n;
                        if values > VALUES {
                            return Err(err("Column value limit exceeded"));
                        }
                        if ty == Some("0") {
                            all_v2 = false;
                        } else {
                            count(&h["num_nulls"], n, "Page nulls")?;
                            let rows = count(&h["num_rows"], 10_000, "Page rows")?;
                            let levels = count(
                                &h["definition_levels_byte_length"],
                                compressed,
                                "Definition bytes",
                            )? + count(
                                &h["repetition_levels_byte_length"],
                                compressed,
                                "Repetition bytes",
                            )?;
                            if rows > n || levels > compressed || levels > expanded {
                                return Err(err("Inconsistent V2 counts or level lengths"));
                            }
                            v2_rows += rows;
                            if h["is_compressed"] == false && compressed != expanded {
                                return Err(err("Uncompressed V2 sizes differ"));
                            }
                        }
                    }
                    if m["codec"] == "0" && compressed != expanded {
                        return Err(err("Uncompressed page sizes differ"));
                    }
                    if ty != Some("2")
                        && (h["encoding"] == "2" || h["encoding"] == "8")
                        && !dictionary
                    {
                        return Err(err("Dictionary-encoded data lacks a preceding dictionary"));
                    }
                    uncompressed += header_bytes + expanded;
                    total_bytes += header_bytes + expanded;
                    total_values += n;
                    if total_bytes > TOTAL || total_values > VALUES {
                        return Err(err("Aggregate page budget exceeded"));
                    }
                    pages.try_reserve(1).map_err(|_| allocation_err())?;
                    pages.push(json!({"rowGroup":g,"column":c,"offset":at,"headerBytes":header_bytes,"bodyOffset":body_offset,"bodyBytes":compressed,"header":header}));
                    at = body_offset + compressed;
                    ctx.charge_work(header_bytes + compressed, Utf16::default())?;
                }
                if values != expected_values || uncompressed != expected_bytes {
                    return Err(err("Page totals differ from column metadata"));
                }
                if first_data.is_some()
                    && first_data != Some(count(&m["data_page_offset"], footer, "Data offset")?)
                {
                    return Err(err("First data page differs from declared offset"));
                }
                if m.get("dictionary_page_offset").is_some() && !dictionary {
                    return Err(err("Declared dictionary page is absent"));
                }
                if all_v2 && v2_rows != count(&group["num_rows"], usize::MAX, "Rows")? {
                    return Err(err("V2 row totals differ from row group"));
                }
            }
        }
        Ok(())
    })();
    match work {
        Ok(()) => {
            ds.push(diagnostic("PARQUET_PAGE_PAYLOAD_UNVERIFIED","","warning","Page headers/boundaries and declared budgets checked; decompressed sizes, encodings, levels, values and CRCs remain unverified"));
            Ok(finish(
                source,
                "checked",
                ds,
                Some(pages.into_iter().map(from_json).collect()),
                "declaredUncompressedBytes",
                total_bytes,
                "declaredValues",
                total_values,
            ))
        }
        Err(e) => Ok(finish(
            source,
            "blocked",
            failure(ds, e, "PARQUET_PAGE_BOUNDS")?,
            None,
            "",
            0,
            "",
            0,
        )),
    }
}

fn crc32(bytes: &[u8], ctx: &mut Context<'_>) -> Result<u32, EngineError> {
    let mut crc = 0xffff_ffffu32;
    for chunk in bytes.chunks(4096) {
        ctx.charge_work(chunk.len(), Utf16::default())?;
        for &b in chunk {
            crc ^= u32::from(b);
            for _ in 0..8 {
                crc = if crc & 1 != 0 {
                    (crc >> 1) ^ 0xedb8_8320
                } else {
                    crc >> 1
                };
            }
        }
    }
    Ok(!crc)
}
fn snappy(input: &[u8], expected: usize, ctx: &mut Context<'_>) -> Result<Vec<u8>, EngineError> {
    if input.len() > PAGE || expected > PAGE {
        return Err(err("Snappy resource bound exceeded"));
    }
    let mut at = 0usize;
    fn byte(input: &[u8], at: &mut usize) -> Result<u8, EngineError> {
        let b = *input
            .get(*at)
            .ok_or_else(|| err("Truncated Snappy block"))?;
        *at += 1;
        Ok(b)
    }
    let mut declared = 0u64;
    let mut shift = 0;
    let mut ended = false;
    for _ in 0..5 {
        let b = byte(input, &mut at)?;
        declared |= u64::from(b & 127) << shift;
        if b & 128 == 0 {
            ended = true;
            break;
        }
        shift += 7;
    }
    if !ended || declared > u32::MAX as u64 || declared != expected as u64 {
        return Err(err("Snappy length does not match bounded expected size"));
    }
    let mut output = Vec::new();
    output.try_reserve_exact(expected).map_err(|_| {
        EngineError::new(
            "RESOURCE_LIMIT",
            Utf16::default(),
            "Snappy output allocation failed",
        )
        .with_control_failure()
    })?;
    while at < input.len() {
        let tag = byte(input, &mut at)?;
        let kind = tag & 3;
        let mut length = usize::from(tag >> 2);
        if kind == 0 {
            if length < 60 {
                length += 1
            } else {
                let count = length - 59;
                let mut wide_length = 0u64;
                for i in 0..count {
                    wide_length |= u64::from(byte(input, &mut at)?) << (8 * i);
                }
                let wide_length = wide_length
                    .checked_add(1)
                    .ok_or_else(|| err("Snappy literal exceeds source or destination"))?;
                length = usize::try_from(wide_length)
                    .map_err(|_| err("Snappy literal exceeds source or destination"))?;
            }
            if length > input.len() - at || length > expected - output.len() {
                return Err(err("Snappy literal exceeds source or destination"));
            }
            for chunk in input[at..at + length].chunks(4096) {
                ctx.charge_work(chunk.len(), Utf16::default())?;
                output.extend_from_slice(chunk);
            }
            at += length;
        } else {
            let offset = match kind {
                1 => {
                    let lo = usize::from(byte(input, &mut at)?);
                    length = 4 + usize::from((tag >> 2) & 7);
                    (usize::from(tag & 224) << 3) + lo
                }
                2 => {
                    let lo = usize::from(byte(input, &mut at)?);
                    let hi = usize::from(byte(input, &mut at)?);
                    length += 1;
                    lo | (hi << 8)
                }
                _ => {
                    let mut v = 0usize;
                    for i in 0..4 {
                        v |= usize::from(byte(input, &mut at)?) << (8 * i);
                    }
                    length += 1;
                    v
                }
            };
            if offset == 0 || offset > output.len() || length > expected - output.len() {
                return Err(err("Invalid Snappy backreference"));
            }
            for _ in 0..length {
                if output.len() % 4096 == 0 {
                    ctx.charge_work(1, Utf16::default())?;
                }
                let b = output[output.len() - offset];
                output.push(b);
            }
        }
        ctx.charge_work(1, Utf16::default())?;
    }
    if output.len() != expected {
        return Err(err("Snappy output length differs from declaration"));
    }
    Ok(output)
}

/// Feature-gated primitive entry used to execute raw-format boundary vectors
/// in a compiled wasm32 runtime without widening the normal binding surface.
#[cfg(feature = "parquet-test-hooks")]
pub fn decode_snappy_test_vector(input: &[u8], expected: usize) -> Result<Vec<u8>, EngineError> {
    snappy(input, expected, &mut Context::ordinary())
}
fn body_hex(bytes: &[u8], ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let mut out = String::new();
    out.try_reserve_exact(bytes.len() * 2).map_err(|_| {
        EngineError::new(
            "RESOURCE_LIMIT",
            Utf16::default(),
            "Page hexadecimal allocation failed",
        )
        .with_control_failure()
    })?;
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for chunk in bytes.chunks(2048) {
        ctx.charge_work(chunk.len() * 2, Utf16::default())?;
        for &b in chunk {
            out.push(HEX[(b >> 4) as usize] as char);
            out.push(HEX[(b & 15) as usize] as char);
        }
    }
    Ok(out)
}
fn copy_body_chunked(
    output: &mut Vec<u8>,
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for chunk in bytes.chunks(4096) {
        ctx.charge_work(chunk.len(), Utf16::default())?;
        output.extend_from_slice(chunk);
    }
    Ok(())
}

/// Decode UNCOMPRESSED and raw SNAPPY page bodies, retaining the source.
pub fn decode_parquet_page_bodies(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let inspected = inspect_parquet_pages(document, engine, registry, capabilities, ctx)?;
    let source = member(&inspected, "source")
        .ok_or_else(|| err("Page result omitted source"))?
        .clone();
    let mut ds =
        arr(member(&inspected, "diagnostics")
            .ok_or_else(|| err("Page result omitted diagnostics"))?)
        .unwrap_or(&[])
        .to_vec();
    if member(&inspected, "status").and_then(txt).as_deref() != Some("checked") {
        return Ok(finish(source, "blocked", ds, None, "", 0, "", 0));
    }
    let metadata_result = inspect_parquet_metadata(document, engine, registry, capabilities, ctx)?;
    let metadata =
        to_json(member(&metadata_result, "metadata").ok_or_else(|| err("Metadata unavailable"))?)?;
    let bytes = export_parquet_capture(document, engine, registry, capabilities, ctx)?;
    let inspected_pages =
        arr(member(&inspected, "pages").ok_or_else(|| err("Page result omitted pages"))?)
            .unwrap_or(&[]);
    let mut pages = Vec::new();
    let mut decoded_bytes = 0usize;
    let work = (|| -> Result<(), EngineError> {
        for p in inspected_pages {
            let g = member(p, "rowGroup")
                .and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n as usize)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| err("Page row group unavailable"))?;
            let c = member(p, "column")
                .and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n as usize)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| err("Page column unavailable"))?;
            let codec = &metadata["row_groups"][g]["columns"][c]["meta_data"]["codec"];
            if codec != "0" && codec != "1" {
                return Err(err(format!(
                    "Page codec {} is not implemented by the bounded decoder",
                    codec.as_str().unwrap_or("undefined")
                )));
            }
        }
        for p in inspected_pages {
            let page = to_json(p)?;
            let g = page["rowGroup"].as_u64().unwrap_or_default() as usize;
            let c = page["column"].as_u64().unwrap_or_default() as usize;
            let h = &page["header"];
            let codec = &metadata["row_groups"][g]["columns"][c]["meta_data"]["codec"];
            let start = page["bodyOffset"].as_u64().unwrap_or_default() as usize;
            let size = page["bodyBytes"].as_u64().unwrap_or_default() as usize;
            let body = &bytes[start..start + size];
            let expected = count(&h["uncompressed_page_size"], PAGE, "Page uncompressed size")?;
            let mut checksum = "absent";
            if let Some(crc) = h.get("crc") {
                let expected_crc = crc
                    .as_str()
                    .and_then(|v| v.parse::<i64>().ok())
                    .unwrap_or_default() as u32;
                if crc32(body, ctx)? != expected_crc {
                    return Err(err(format!(
                        "Page CRC32 mismatch at offset {}",
                        page["offset"]
                    )));
                }
                checksum = "verified";
            }
            let v2 = &h["data_page_header_v2"];
            let levels = if v2.is_null() {
                0
            } else {
                count(
                    &v2["definition_levels_byte_length"],
                    size,
                    "Definition bytes",
                )? + count(
                    &v2["repetition_levels_byte_length"],
                    size,
                    "Repetition bytes",
                )?
            };
            let compressed = codec != "0" && (v2.is_null() || v2["is_compressed"] != false);
            let output = if !compressed {
                if body.len() != expected {
                    return Err(err("Uncompressed body size mismatch"));
                }
                let mut output = Vec::new();
                output.try_reserve_exact(expected).map_err(|_| {
                    EngineError::new(
                        "RESOURCE_LIMIT",
                        Utf16::default(),
                        "Page output allocation failed",
                    )
                    .with_control_failure()
                })?;
                copy_body_chunked(&mut output, body, ctx)?;
                output
            } else {
                let suffix = snappy(&body[levels..], expected - levels, ctx)?;
                let mut output = Vec::new();
                output.try_reserve_exact(expected).map_err(|_| {
                    EngineError::new(
                        "RESOURCE_LIMIT",
                        Utf16::default(),
                        "Page output allocation failed",
                    )
                    .with_control_failure()
                })?;
                copy_body_chunked(&mut output, &body[..levels], ctx)?;
                copy_body_chunked(&mut output, &suffix, ctx)?;
                output
            };
            decoded_bytes += output.len();
            let mut decoded = page
                .as_object()
                .ok_or_else(|| err("Page object unavailable"))?
                .clone();
            decoded.insert("bodyHex".into(), Json::String(body_hex(&output, ctx)?));
            decoded.insert("checksum".into(), Json::String(checksum.into()));
            pages.try_reserve(1).map_err(|_| allocation_err())?;
            pages.push(from_json(Json::Object(decoded)));
        }
        Ok(())
    })();
    match work {
        Ok(()) => {
            ds.push(diagnostic("PARQUET_VALUES_UNVERIFIED","","warning","Physical bodies decoded within page budgets; present CRC32 checks passed. Value encodings, levels, dictionaries and scalar semantics remain unverified"));
            Ok(finish(
                source,
                "decoded",
                ds,
                Some(pages),
                "decodedBytes",
                decoded_bytes,
                "",
                0,
            ))
        }
        Err(e) => Ok(finish(
            source,
            "blocked",
            failure(ds, e, "PARQUET_PAGE_BODY")?,
            None,
            "",
            0,
            "",
            0,
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn allocation_failure_escapes_but_untrusted_code_is_a_page_diagnostic() {
        let trusted = allocation_err();
        assert!(trusted.is_control_failure());
        assert_eq!(
            failure(Vec::new(), trusted, "PARQUET_PAGE")
                .unwrap_err()
                .code,
            "RESOURCE_LIMIT"
        );
        let untrusted = EngineError::new("RESOURCE_LIMIT", Utf16::default(), "source failure");
        let diagnostics = failure(Vec::new(), untrusted, "PARQUET_PAGE").unwrap();
        assert_eq!(diagnostics.len(), 1);
    }
    fn bytes(hex: &str) -> Vec<u8> {
        hex.as_bytes()
            .chunks_exact(2)
            .map(|p| {
                let digit = |b: u8| if b <= b'9' { b - b'0' } else { b - b'a' + 10 };
                digit(p[0]) * 16 + digit(p[1])
            })
            .collect()
    }
    #[test]
    fn snappy_vectors_and_malformed_blocks_are_bounded() {
        let vectors: Json = serde_json::from_str(include_str!(
            "../../../fixtures/parquet/bodies/snappy-vectors.json"
        ))
        .unwrap();
        for case in vectors["cases"].as_array().unwrap() {
            let source = bytes(case["input"].as_str().unwrap());
            let output = bytes(case["output"].as_str().unwrap());
            assert_eq!(
                snappy(&source, output.len(), &mut Context::ordinary()).unwrap(),
                output
            );
        }
        for (hex, n) in [
            ("", 0),
            ("ffffffff0f", 0),
            ("808080808000", 0),
            ("010061", 0),
            ("00ff", 0),
            ("010100", 1),
            ("0500610102", 5),
            ("020061", 2),
            ("01046162", 1),
            ("01fc", 1),
            ("00fcffffffff", 0),
            ("05fcffffffff", 5),
            ("01", 1),
        ] {
            assert!(
                snappy(&bytes(hex), n, &mut Context::ordinary()).is_err(),
                "{hex}"
            );
        }
        assert!(snappy(&bytes("00"), PAGE + 1, &mut Context::ordinary()).is_err());
    }
}

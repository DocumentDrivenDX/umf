// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded Parquet definition/repetition level decoding.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_capture_inspection::{diagnostic, from_json, inspect_parquet_schema, to_json},
    parquet_pages::decode_parquet_page_bodies,
    registry::Registry,
    value::{Utf16, Value},
};
use serde_json::{json, Value as Json};

const PAGE: usize = 8 * 1024 * 1024;
const PAGES: usize = 10_000;
const VALUES: usize = 1_000_000;

fn err(message: impl AsRef<str>) -> EngineError {
    EngineError::new("PARQUET_LEVEL_DECODE", Utf16::default(), message.as_ref())
}
fn alloc_err() -> EngineError {
    EngineError::new(
        "RESOURCE_LIMIT",
        Utf16::default(),
        "Parquet level allocation failed",
    )
    .with_control_failure()
}
fn field<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Object(fields) = v else {
        return None;
    };
    fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(key))
        .map(|(_, v)| v)
}
fn text(v: &Value) -> Option<String> {
    if let Value::String(s) = v {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn array(v: &Value) -> Option<&[Value]> {
    if let Value::Array(v) = v {
        Some(v)
    } else {
        None
    }
}
fn output(
    source: Value,
    status: &str,
    diagnostics: Vec<Value>,
    pages: Option<Vec<Value>>,
) -> Value {
    let mut fields = vec![
        ("source", source),
        ("status", Value::string_utf8(status)),
        ("complete", Value::Bool(false)),
        ("diagnostics", Value::Array(diagnostics)),
    ];
    if let Some(pages) = pages {
        fields.push(("pages", Value::Array(pages)));
    }
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn number(v: &Json, max: usize, label: &str) -> Result<usize, EngineError> {
    let n = v
        .as_u64()
        .or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok()))
        .ok_or_else(|| err(format!("{label} exceeds supported nonnegative bound")))?;
    if n > max as u64 {
        return Err(err(format!("{label} exceeds supported nonnegative bound")));
    }
    Ok(n as usize)
}

/// Decode one raw Parquet RLE/bit-packed hybrid stream. Run arithmetic stays
/// wide until all count and byte bounds have been checked (including wasm32).
pub fn decode_parquet_hybrid(
    input: &[u8],
    width: u32,
    count: usize,
    max_value: u64,
    ctx: &mut Context<'_>,
) -> Result<(Vec<u32>, usize, Vec<u32>), EngineError> {
    if input.len() > PAGE
        || width > 32
        || count > 100_000
        || max_value
            > if width == 32 {
                u32::MAX as u64
            } else if width == 0 {
                0
            } else {
                (1u64 << width) - 1
            }
    {
        return Err(err("Hybrid decoder bounds exceeded"));
    }
    // Charge output capacity before reserving it, including zero-level streams.
    ctx.charge_work(count, Utf16::default())?;
    let mut values = Vec::new();
    values.try_reserve_exact(count).map_err(|_| alloc_err())?;
    let mut padding = Vec::new();
    let mut at = 0usize;
    let byte = |at: &mut usize| -> Result<u8, EngineError> {
        let b = *input
            .get(*at)
            .ok_or_else(|| err("Truncated hybrid stream"))?;
        *at += 1;
        Ok(b)
    };
    while values.len() < count {
        let mut header = 0u64;
        let mut shift = 0u32;
        let mut ended = false;
        for _ in 0..5 {
            let b = byte(&mut at)?;
            header |= u64::from(b & 127) << shift;
            if b & 128 == 0 {
                ended = true;
                break;
            }
            shift += 7;
        }
        if !ended || header > u32::MAX as u64 {
            return Err(err("Hybrid header exceeds uint32"));
        }
        let packed = header & 1 == 1;
        let run = if packed {
            (header >> 1)
                .checked_mul(8)
                .ok_or_else(|| err("Invalid hybrid run length"))?
        } else {
            header >> 1
        };
        if run == 0 || run > i32::MAX as u64 {
            return Err(err("Invalid hybrid run length"));
        }
        let remaining = count - values.len();
        if !packed {
            if run > remaining as u64 {
                return Err(err("RLE run exceeds requested count"));
            }
            let mut v = 0u64;
            for i in 0..((width + 7) / 8) {
                v |= u64::from(byte(&mut at)?) << (i * 8);
            }
            if v > max_value {
                return Err(err("RLE value exceeds allowed range"));
            }
            let mut left = run as usize;
            while left > 0 {
                let chunk = left.min(1024);
                ctx.charge_work(chunk, Utf16::default())?;
                values.resize(values.len() + chunk, v as u32);
                left -= chunk;
            }
        } else {
            if run > remaining as u64 + 7 {
                return Err(err(
                    "Bit-packed run exceeds requested count and final padding",
                ));
            }
            let byte_len_u64 = run
                .checked_mul(u64::from(width))
                .and_then(|v| v.checked_add(7))
                .ok_or_else(|| err("Bit-packed byte count overflow"))?
                / 8;
            let byte_len = usize::try_from(byte_len_u64)
                .map_err(|_| err("Bit-packed byte count exceeds supported bounds"))?;
            let end = at
                .checked_add(byte_len)
                .filter(|end| *end <= input.len())
                .ok_or_else(|| err("Truncated bit-packed run"))?;
            padding
                .try_reserve_exact((run as usize).saturating_sub(remaining))
                .map_err(|_| alloc_err())?;
            for i in 0..run as usize {
                if i % 1024 == 0 {
                    let chunk = (run as usize - i).min(1024);
                    let work = chunk
                        .checked_mul(width as usize + 1)
                        .ok_or_else(|| err("Bit-packed work count overflow"))?;
                    ctx.charge_work(work, Utf16::default())?;
                }
                let mut v = 0u32;
                for bit in 0..width as usize {
                    let pos = i
                        .checked_mul(width as usize)
                        .and_then(|x| x.checked_add(bit))
                        .ok_or_else(|| err("Bit position overflow"))?;
                    v |= (u32::from((input[at + pos / 8] >> (pos % 8)) & 1)) << bit;
                }
                if i < remaining {
                    if u64::from(v) > max_value {
                        return Err(err("Bit-packed value exceeds allowed range"));
                    }
                    values.push(v);
                } else {
                    padding.try_reserve(1).map_err(|_| alloc_err())?;
                    padding.push(v);
                }
            }
            at = end;
        }
    }
    if at != input.len() {
        return Err(err("Trailing hybrid stream bytes"));
    }
    Ok((values, at, padding))
}

/// Decode bounded page bodies into definition/repetition levels. Dictionary pages
/// remain in the body view but are omitted from the level result.
pub fn decode_parquet_levels(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let bodies = decode_parquet_page_bodies(document, engine, registry, capabilities, ctx)?;
    let source = field(&bodies, "source")
        .ok_or_else(|| err("Body result omitted source"))?
        .clone();
    let mut diagnostics =
        array(field(&bodies, "diagnostics").ok_or_else(|| err("Body result omitted diagnostics"))?)
            .unwrap_or(&[])
            .to_vec();
    if text(field(&bodies, "status").unwrap_or(&Value::Null)).as_deref() != Some("decoded") {
        return Ok(output(source, "blocked", diagnostics, None));
    }
    let schema = inspect_parquet_schema(document, engine, registry, capabilities, ctx)?;
    let metadata =
        to_json(field(&schema, "metadata").ok_or_else(|| err("Schema result omitted metadata"))?)?;
    let leaves =
        to_json(field(&schema, "leaves").ok_or_else(|| err("Schema result omitted leaves"))?)?;
    let body_pages =
        array(field(&bodies, "pages").ok_or_else(|| err("Body result omitted pages"))?)
            .ok_or_else(|| err("Body pages unavailable"))?;
    let mut pages = Vec::new();
    pages
        .try_reserve(body_pages.len().min(PAGES))
        .map_err(|_| alloc_err())?;
    let mut rows = std::collections::BTreeMap::<(usize, usize), usize>::new();
    let mut seen = std::collections::BTreeSet::new();
    let work = (|| -> Result<(), EngineError> {
        if body_pages.len() > PAGES {
            return Err(err("Page count limit exceeded"));
        }
        let leaf_list = leaves
            .as_array()
            .ok_or_else(|| err("Schema leaves unavailable"))?;
        let groups = metadata["row_groups"]
            .as_array()
            .ok_or_else(|| err("Row groups unavailable"))?;
        let mut total_values = 0usize;
        for p in body_pages {
            let pj = to_json(p)?;
            let h = &pj["header"];
            if h["type"] == "2" {
                continue;
            }
            let v2 = h.get("data_page_header_v2").filter(|v| !v.is_null());
            let data = v2.unwrap_or(&h["data_page_header"]);
            let g = number(&pj["rowGroup"], groups.len().saturating_sub(1), "Row group")?;
            let c = number(&pj["column"], leaf_list.len().saturating_sub(1), "Column")?;
            let leaf = &leaf_list[c];
            let max_rep = number(
                &leaf["repetitionLevel"],
                i32::MAX as usize,
                "Repetition level",
            )?;
            let max_def = number(
                &leaf["definitionLevel"],
                i32::MAX as usize,
                "Definition level",
            )?;
            let count = number(&data["num_values"], 100_000, "Page values")?;
            total_values = total_values
                .checked_add(count)
                .filter(|n| *n <= VALUES)
                .ok_or_else(|| err("Column value limit exceeded"))?;
            let hex = pj["bodyHex"]
                .as_str()
                .ok_or_else(|| err("Page body unavailable"))?;
            if hex.len() % 2 != 0 || hex.len() / 2 > PAGE {
                return Err(err("Page body exceeds supported bound"));
            }
            let mut body = Vec::new();
            body.try_reserve_exact(hex.len() / 2)
                .map_err(|_| alloc_err())?;
            for pair in hex.as_bytes().chunks_exact(2) {
                if body.len() % 1024 == 0 {
                    ctx.charge_work((hex.len() / 2 - body.len()).min(1024), Utf16::default())?;
                }
                let n = |b: u8| -> Option<u8> {
                    match b {
                        b'0'..=b'9' => Some(b - b'0'),
                        b'a'..=b'f' => Some(b - b'a' + 10),
                        _ => None,
                    }
                };
                body.push(
                    (n(pair[0]).ok_or_else(|| err("Invalid page body hex"))? << 4)
                        | n(pair[1]).ok_or_else(|| err("Invalid page body hex"))?,
                );
            }
            let mut at = 0usize;
            let mut decode_level =
                |kind: &str, max: usize| -> Result<(Vec<u32>, Vec<u32>), EngineError> {
                    let mut len = 0usize;
                    if let Some(v) = v2 {
                        len = number(
                            &v[format!("{kind}_levels_byte_length")],
                            body.len(),
                            "Level bytes",
                        )?;
                    }
                    if max == 0 {
                        if len != 0 {
                            return Err(err("Zero-level field has a nonempty level region"));
                        }
                        ctx.charge_work(count, Utf16::default())?;
                        let mut z = Vec::new();
                        z.try_reserve_exact(count).map_err(|_| alloc_err())?;
                        z.resize(count, 0);
                        return Ok((z, Vec::new()));
                    }
                    if v2.is_none() {
                        if data[format!("{kind}_level_encoding")] != "3" {
                            return Err(err("Only RLE/hybrid V1 levels are supported"));
                        }
                        let end = at
                            .checked_add(4)
                            .filter(|e| *e <= body.len())
                            .ok_or_else(|| err("Missing V1 level length"))?;
                        len = u32::from_le_bytes(body[at..end].try_into().unwrap()) as usize;
                        at = end;
                    }
                    let end = at
                        .checked_add(len)
                        .filter(|e| *e <= body.len())
                        .ok_or_else(|| err("Level region exceeds page body"))?;
                    let width = if max == 0 {
                        0
                    } else {
                        usize::BITS - max.leading_zeros()
                    };
                    let (values, _, padding) =
                        decode_parquet_hybrid(&body[at..end], width, count, max as u64, ctx)?;
                    at = end;
                    Ok((values, padding))
                };
            let (repetition, repetition_padding) = decode_level("repetition", max_rep)?;
            let (definition, definition_padding) = decode_level("definition", max_def)?;
            let key = (g, c);
            let mut non_null = 0usize;
            let mut row_starts = 0usize;
            ctx.charge_work(count, Utf16::default())?;
            for i in 0..count {
                if repetition[i] > definition[i] {
                    return Err(err("Repetition level exceeds definition level"));
                }
                if repetition[i] == 0 {
                    row_starts += 1;
                }
                if definition[i] as usize == max_def {
                    non_null += 1;
                }
            }
            if count > 0 && (!seen.contains(&key) || v2.is_some()) && repetition[0] != 0 {
                return Err(err("Initial/V2 page must start at a row boundary"));
            }
            seen.insert(key);
            if let Some(v) = v2 {
                if number(&v["num_nulls"], count, "Page nulls")? != count - non_null
                    || number(&v["num_rows"], count, "Page rows")? != row_starts
                {
                    return Err(err("Decoded V2 row/null counts differ from page header"));
                }
            }
            *rows.entry(key).or_default() = rows
                .get(&key)
                .copied()
                .unwrap_or(0)
                .checked_add(row_starts)
                .ok_or_else(|| err("Row count overflow"))?;
            pages.push(json!({"rowGroup":g,"column":c,"offset":pj["offset"],"repetition":repetition,"definition":definition,"repetitionPadding":repetition_padding,"definitionPadding":definition_padding,"valuesOffset":at,"nonNullValues":non_null,"rowStarts":row_starts}));
        }
        for (g, group) in groups.iter().enumerate() {
            let n = number(&group["num_rows"], usize::MAX, "Row group rows")?;
            let columns = group["columns"]
                .as_array()
                .ok_or_else(|| err("Columns unavailable"))?;
            for c in 0..columns.len() {
                if rows.get(&(g, c)).copied().unwrap_or(0) != n {
                    return Err(err("Decoded row starts differ from row-group count"));
                }
            }
        }
        Ok(())
    })();
    match work {
        Ok(()) => {
            diagnostics.push(diagnostic("PARQUET_LEVEL_VALUES_UNVERIFIED","","warning","Level domains and row/null counts checked; cross-column structural consistency, dictionary indexes, physical values and complete row assembly remain unverified"));
            Ok(output(
                source,
                "decoded",
                diagnostics,
                Some(pages.into_iter().map(from_json).collect()),
            ))
        }
        Err(e) if e.is_control_failure() => Err(e),
        Err(e) => {
            diagnostics.push(diagnostic(
                "PARQUET_LEVEL_DECODE",
                "",
                "error",
                &e.message
                    .to_utf8()
                    .unwrap_or_else(|_| "Invalid Parquet levels".into()),
            ));
            Ok(output(source, "blocked", diagnostics, None))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode(hex: &[u8], width: u32, count: usize, max: u64) -> Result<Vec<u32>, EngineError> {
        let mut ctx = Context::ordinary();
        decode_parquet_hybrid(hex, width, count, max, &mut ctx).map(|v| v.0)
    }
    #[test]
    fn hybrid_widths_runs_padding_and_limits() {
        assert_eq!(
            decode(&[0x02, 0xff, 0xff, 0xff, 0xff], 32, 1, u32::MAX as u64).unwrap(),
            vec![u32::MAX]
        );
        assert_eq!(
            decode(
                &[
                    0x03, 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                ],
                32,
                1,
                u32::MAX as u64
            )
            .unwrap(),
            vec![u32::MAX]
        );
        assert!(decode(&[], 0, 0, 0).unwrap().is_empty());
        assert!(decode(&[0x83, 0x80, 0x80, 0x80, 0x04], 0, 1, 0).is_err());
        for (bytes, width, count, max) in [
            (&[0x00][..], 1, 1, 1),
            (&[0x01][..], 1, 1, 1),
            (&[0xfe, 0xff, 0xff, 0xff, 0x0f][..], 1, 1, 1),
            (&[0x80, 0x80, 0x80, 0x80, 0][..], 1, 1, 1),
            (&[0x02][..], 1, 1, 1),
            (&[0x02, 2][..], 1, 1, 1),
            (&[0x04, 1][..], 1, 1, 1),
            (&[0x05, 0xff, 0xff][..], 1, 1, 1),
            (&[0x03, 0][..], 2, 1, 1),
            (&[0x02, 1, 0][..], 1, 1, 1),
            (&[0x02, 1][..], 1, 1, 0),
            (&[0x03, 0xff][..], 1, 1, 0),
        ] {
            assert!(decode(bytes, width, count, max).is_err(), "{bytes:?}");
        }
        assert!(decode(&[], 33, 1, 0).is_err());
        assert!(decode(&[], 1, 100_001, 1).is_err());
    }

    #[test]
    fn hybrid_rejects_packed_run_before_wasm32_narrowing() {
        // Header 0x40000003 declares 4_294_967_304 packed values. Narrowing
        // that run to wasm32 would wrap it to 8 and admit this one-byte body.
        let failure = decode(&[0x83, 0x80, 0x80, 0x80, 0x04, 0xff], 1, 1, 1).unwrap_err();
        assert_eq!(failure.code, "PARQUET_LEVEL_DECODE");
        assert_eq!(
            failure.message.to_utf8().unwrap(),
            "Invalid hybrid run length"
        );
    }

    #[test]
    fn hybrid_checks_host_budget_before_output_allocation_and_header_decoding() {
        let mut stop = |_: usize| {
            Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "host budget",
            ))
        };
        let mut ctx = Context::ordinary().with_host_control(&mut stop);
        // The malformed run would otherwise fail as a data diagnostic before
        // any work callback. Admission must precede output reservation.
        let failure = decode_parquet_hybrid(&[0], 1, 100_000, 1, &mut ctx).unwrap_err();
        assert_eq!(failure.code, "RESOURCE_LIMIT");
        assert!(failure.is_control_failure());
    }

    #[test]
    fn hybrid_charges_output_capacity_once_and_decoding_work_separately() {
        let mut charged = 0;
        {
            let mut meter = |work: usize| {
                charged += work;
                Ok(())
            };
            let mut ctx = Context::ordinary().with_host_control(&mut meter);
            let (values, consumed, padding) =
                decode_parquet_hybrid(&[0x02, 1], 1, 1, 1, &mut ctx).unwrap();
            assert_eq!(values, vec![1]);
            assert_eq!(consumed, 2);
            assert!(padding.is_empty());
        }
        assert_eq!(charged, 2, "one output slot plus one decoded value");
    }

    #[test]
    fn hybrid_host_resource_failure_keeps_control_provenance() {
        let mut stop = |_: usize| {
            Err(
                EngineError::new("RESOURCE_LIMIT", Utf16::default(), "cancelled")
                    .with_control_failure(),
            )
        };
        let mut ctx = Context::ordinary().with_host_control(&mut stop);
        let error = decode_parquet_hybrid(&[0x02, 0], 1, 1, 1, &mut ctx).unwrap_err();
        assert_eq!(error.code, "RESOURCE_LIMIT");
        assert!(error.is_control_failure());
    }
}

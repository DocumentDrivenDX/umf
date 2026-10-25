// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded Parquet footer/schema decoder for the R8 record-type subset.
//!
//! This reads the Parquet file's Compact Protocol FileMetaData schema directly
//! from retained bytes. It does not decode page bodies or rewrite the capture.

use crate::{
    context::Context, error::EngineError, parquet_record_type_candidate::SchemaElement,
    value::Utf16,
};

const MAX_DEPTH: usize = 64;
const MAX_NODES: usize = 50_000;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DecodedSchema {
    pub schema: Vec<SchemaElement>,
    /// The metadata bytes after the FileMetaData struct, retained for audit.
    pub trailing_footer_bytes: usize,
}

#[derive(Clone, Debug)]
enum WireValue {
    Int(i64),
    Binary(Vec<u8>),
    List(u8, Vec<WireValue>),
    Struct(Vec<(i16, WireValue)>),
    Other,
}

struct Decoder<'a, 'b, 'c> {
    bytes: &'a [u8],
    at: usize,
    nodes: usize,
    ctx: &'b mut Context<'c>,
}

impl Decoder<'_, '_, '_> {
    fn fail<T>(&self, message: &'static str) -> Result<T, EngineError> {
        Err(EngineError::new(
            "PARQUET_SCHEMA_DECODE",
            Utf16::default(),
            message,
        ))
    }
    fn byte(&mut self) -> Result<u8, EngineError> {
        let Some(b) = self.bytes.get(self.at).copied() else {
            return self.fail("Truncated Compact Protocol value");
        };
        self.at += 1;
        Ok(b)
    }
    fn varint(&mut self, bits: u32) -> Result<u64, EngineError> {
        let mut value = 0u64;
        let count = bits.div_ceil(7);
        for i in 0..count {
            let b = self.byte()?;
            let remaining = bits.saturating_sub(i * 7);
            if remaining < 7 && u64::from(b & 0x7f) >= (1u64 << remaining) {
                return self.fail("Compact varint exceeds declared width");
            }
            value |= u64::from(b & 0x7f).checked_shl(i * 7).ok_or_else(|| {
                EngineError::new(
                    "PARQUET_SCHEMA_DECODE",
                    Utf16::default(),
                    "Compact varint overflow",
                )
            })?;
            if b & 0x80 == 0 {
                if bits < 64 && value >= (1u64 << bits) {
                    return self.fail("Compact varint exceeds declared width");
                }
                return Ok(value);
            }
        }
        self.fail("Compact varint exceeds declared width")
    }
    fn signed(&mut self, bits: u32) -> Result<i64, EngineError> {
        let n = self.varint(bits)?;
        Ok(((n >> 1) as i64) ^ (-((n & 1) as i64)))
    }
    fn length(&mut self) -> Result<usize, EngineError> {
        let n = self.varint(32)?;
        if n > i32::MAX as u64 {
            return self.fail("Compact collection length exceeds signed int32");
        }
        Ok(n as usize)
    }
    fn parse_value(
        &mut self,
        kind: u8,
        depth: usize,
        field: bool,
    ) -> Result<WireValue, EngineError> {
        if depth > MAX_DEPTH || self.nodes >= MAX_NODES {
            return self.fail("Compact Protocol structural limit exceeded");
        }
        self.nodes += 1;
        self.ctx.charge_work(1, Utf16::default())?;
        match kind {
            1 | 2 => {
                let b = if field { kind } else { self.byte()? };
                if b != 1 && b != 2 {
                    return self.fail("Invalid Compact boolean");
                }
                let _is_true = b == 1;
                Ok(WireValue::Other)
            }
            3 => Ok(WireValue::Int({
                let b = self.byte()?;
                if b < 128 {
                    b as i64
                } else {
                    i64::from(b) - 256
                }
            })),
            4 => Ok(WireValue::Int(self.signed(16)?)),
            5 => Ok(WireValue::Int(self.signed(32)?)),
            6 => Ok(WireValue::Int(self.signed(64)?)),
            7 => {
                for _ in 0..8 {
                    self.byte()?;
                }
                Ok(WireValue::Other)
            }
            8 => {
                let n = self.length()?;
                if n > self.bytes.len().saturating_sub(self.at) {
                    return self.fail("Binary value exceeds footer region");
                }
                self.ctx.charge_work(n, Utf16::default())?;
                let b = self.bytes[self.at..self.at + n].to_vec();
                self.at += n;
                Ok(WireValue::Binary(b))
            }
            9 | 10 => {
                let h = self.byte()?;
                let elem = h & 0x0f;
                let short = usize::from(h >> 4);
                let n = if short == 15 { self.length()? } else { short };
                if n > MAX_NODES.saturating_sub(self.nodes) {
                    return self.fail("Collection exceeds value limit");
                }
                let mut items = Vec::with_capacity(n);
                for _ in 0..n {
                    items.push(self.parse_value(elem, depth + 1, false)?);
                }
                Ok(WireValue::List(elem, items))
            }
            11 => {
                let n = self.length()?;
                if n > MAX_NODES.saturating_sub(self.nodes) / 2 {
                    return self.fail("Map exceeds value limit");
                }
                if n == 0 {
                    return Ok(WireValue::Other);
                }
                let h = self.byte()?;
                for _ in 0..n {
                    self.parse_value(h >> 4, depth + 1, false)?;
                    self.parse_value(h & 15, depth + 1, false)?;
                }
                Ok(WireValue::Other)
            }
            12 => {
                let mut fields = Vec::new();
                let mut previous = 0i32;
                loop {
                    let h = self.byte()?;
                    if h == 0 {
                        break;
                    }
                    let t = h & 15;
                    let d = i32::from(h >> 4);
                    let id = if d == 0 {
                        self.signed(16)? as i32
                    } else {
                        previous + d
                    };
                    if !(-32768..=32767).contains(&id) {
                        return self.fail("Compact field id exceeds int16");
                    }
                    previous = id;
                    if fields.len() >= MAX_NODES {
                        return self.fail("Struct field limit exceeded");
                    }
                    fields.push((id as i16, self.parse_value(t, depth + 1, true)?));
                }
                Ok(WireValue::Struct(fields))
            }
            13 => {
                for _ in 0..16 {
                    self.byte()?;
                }
                Ok(WireValue::Other)
            }
            _ => self.fail("Unknown Compact Protocol type"),
        }
    }
}

fn unique<'a>(
    fields: &'a [(i16, WireValue)],
    id: i16,
) -> Result<Option<&'a WireValue>, EngineError> {
    let mut found = fields
        .iter()
        .filter(|(field, _)| *field == id)
        .map(|(_, v)| v);
    let first = found.next();
    if found.next().is_some() {
        return Err(EngineError::new(
            "PARQUET_SCHEMA_DECODE",
            Utf16::default(),
            "Duplicate schema field id",
        ));
    }
    Ok(first)
}
fn int(fields: &[(i16, WireValue)], id: i16) -> Result<Option<i64>, EngineError> {
    match unique(fields, id)? {
        None => Ok(None),
        Some(WireValue::Int(v)) => Ok(Some(*v)),
        _ => Err(EngineError::new(
            "PARQUET_SCHEMA_DECODE",
            Utf16::default(),
            "Schema field has wrong wire type",
        )),
    }
}
fn binary(fields: &[(i16, WireValue)], id: i16) -> Result<Option<String>, EngineError> {
    match unique(fields, id)? {
        None => Ok(None),
        Some(WireValue::Binary(v)) => String::from_utf8(v.clone()).map(Some).map_err(|_| {
            EngineError::new(
                "PARQUET_SCHEMA_DECODE",
                Utf16::default(),
                "Schema name is not valid UTF-8",
            )
        }),
        _ => Err(EngineError::new(
            "PARQUET_SCHEMA_DECODE",
            Utf16::default(),
            "Schema field has wrong wire type",
        )),
    }
}

/// Decode only FileMetaData.schema and the SchemaElement fields understood by
/// the LIST record-type adapter. The source slice must be a complete Parquet file.
pub fn decode_schema(bytes: &[u8], ctx: &mut Context<'_>) -> Result<DecodedSchema, EngineError> {
    if bytes.len() < 12 {
        return Err(EngineError::new(
            "PARQUET_TRUNCATED",
            Utf16::default(),
            "File is shorter than Parquet framing minimum",
        ));
    }
    if bytes.len() > 1_000_000 {
        return Err(EngineError::new(
            "PARQUET_LIMIT",
            Utf16::default(),
            "Parquet source exceeds the 1000000-byte capture limit",
        ));
    }
    if &bytes[..4] != b"PAR1" || &bytes[bytes.len() - 4..] != b"PAR1" {
        return Err(EngineError::new(
            "PARQUET_SCHEMA_DECODE",
            Utf16::default(),
            "Only plaintext PAR1 footer metadata is supported",
        ));
    }
    let footer_len =
        u32::from_le_bytes(bytes[bytes.len() - 8..bytes.len() - 4].try_into().unwrap()) as usize;
    let framed_len = footer_len.checked_add(8).ok_or_else(|| {
        EngineError::new(
            "PARQUET_FOOTER_BOUNDS",
            Utf16::default(),
            "Footer region length overflows address space",
        )
    })?;
    let start = bytes
        .len()
        .checked_sub(framed_len)
        .filter(|v| *v >= 4)
        .ok_or_else(|| {
            EngineError::new(
                "PARQUET_FOOTER_BOUNDS",
                Utf16::default(),
                "Footer region is empty or overlaps file header",
            )
        })?;
    let region = &bytes[start..bytes.len() - 8];
    ctx.charge_work(region.len(), Utf16::default())?;
    let mut decoder = Decoder {
        bytes: region,
        at: 0,
        nodes: 0,
        ctx,
    };
    let value = decoder.parse_value(12, 0, false)?;
    let WireValue::Struct(metadata) = value else {
        return decoder.fail("Footer metadata is not a struct");
    };
    let Some(WireValue::List(12, items)) = unique(&metadata, 2)? else {
        return decoder.fail("FileMetaData.schema is absent or has wrong wire type");
    };
    if items.is_empty() || items.len() > MAX_NODES {
        return decoder.fail("Schema list is empty or exceeds node limit");
    }
    let mut schema = Vec::with_capacity(items.len());
    for item in items {
        let WireValue::Struct(fields) = item else {
            return decoder.fail("Schema list contains a non-struct");
        };
        // Unknown SchemaElement fields can carry newer native meaning. Refuse
        // those instead of dropping them from the interpreted schema view.
        if fields.iter().any(|(id, _)| !matches!(*id, 1..=10)) {
            return decoder.fail("Unknown SchemaElement fields are not interpreted");
        }
        let name = binary(fields, 4)?.ok_or_else(|| {
            EngineError::new(
                "PARQUET_SCHEMA_DECODE",
                Utf16::default(),
                "SchemaElement.name is required",
            )
        })?;
        let physical = int(fields, 1)?.map(|n| {
            match n {
                0 => "BOOLEAN",
                1 => "INT32",
                2 => "INT64",
                3 => "INT96",
                4 => "FLOAT",
                5 => "DOUBLE",
                6 => "BYTE_ARRAY",
                7 => "FIXED_LEN_BYTE_ARRAY",
                _ => "UNKNOWN",
            }
            .to_owned()
        });
        let repetition = int(fields, 3)?.map(|n| {
            match n {
                0 => "REQUIRED",
                1 => "OPTIONAL",
                2 => "REPEATED",
                _ => "UNKNOWN",
            }
            .to_owned()
        });
        let children = int(fields, 5)?
            .map(|n| {
                usize::try_from(n).map_err(|_| {
                    EngineError::new(
                        "PARQUET_SCHEMA_DECODE",
                        Utf16::default(),
                        "Child count is out of range",
                    )
                })
            })
            .transpose()?;
        // These IDL fields are meaningful in a full native schema view but are
        // not represented by the candidate's narrow SchemaElement carrier.
        for id in [2, 7, 8, 9] {
            if unique(fields, id)?.is_some() {
                return decoder
                    .fail("SchemaElement parameters outside the candidate view are present");
            }
        }
        let legacy = int(fields, 6)?;
        let modern = match unique(fields, 10)? {
            None => None,
            Some(WireValue::Struct(alts)) => {
                if alts.len() != 1 {
                    return decoder.fail("LogicalType must select exactly one alternative");
                }
                let (id, payload) = &alts[0];
                if *id == 3 && !matches!(payload,WireValue::Struct(inner) if inner.is_empty()) {
                    return decoder.fail("LIST logical annotation payload is not empty");
                }
                Some(if *id == 3 { "LIST" } else { "OTHER" }.to_owned())
            }
            _ => return decoder.fail("LogicalType has wrong wire type"),
        };
        let legacy_name = legacy.map(|n| {
            match n {
                1 => "MAP",
                2 => "MAP_KEY_VALUE",
                3 => "LIST",
                _ => "OTHER",
            }
            .to_owned()
        });
        if modern.is_some() && legacy_name.is_some() && modern != legacy_name {
            return decoder.fail("Logical and converted annotations conflict");
        }
        let annotation = modern.or(legacy_name);
        schema.push(SchemaElement {
            name: Utf16::from(name),
            repetition: repetition.map(Into::into),
            num_children: children,
            physical_type: physical.map(Into::into),
            annotation: annotation.map(Into::into),
            converted_type: legacy,
        });
    }
    if schema[0].physical_type.is_some() || schema[0].num_children.is_none() {
        return decoder.fail("Root SchemaElement must be a group with a child count");
    }
    if schema[0]
        .repetition
        .as_ref()
        .and_then(|v| v.to_utf8().ok())
        .is_some_and(|v| v != "REQUIRED")
    {
        return decoder.fail("Only absent or REQUIRED root repetition is interpreted");
    }
    let trailing_footer_bytes = region.len().saturating_sub(decoder.at);
    // A trailing signature may occur in real files; it remains in the source
    // and is reported separately. The schema view does not interpret it.
    Ok(DecodedSchema {
        schema,
        trailing_footer_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};
    fn fixture(name: &str) -> Vec<u8> {
        let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.push("../../fixtures/parquet/containers");
        p.push(format!("{name}.parquet"));
        fs::read(p).unwrap()
    }
    #[test]
    fn decodes_pinned_list_schema_from_retained_file_bytes() {
        let d = decode_schema(&fixture("list-tuple"), &mut Context::ordinary()).unwrap();
        assert_eq!(
            d.schema[1].annotation.as_ref().unwrap().to_utf8().unwrap(),
            "LIST"
        );
        assert_eq!(d.schema[1].converted_type, Some(3));
        assert_eq!(
            d.schema[2].repetition.as_ref().unwrap().to_utf8().unwrap(),
            "REPEATED"
        );
        assert_eq!(d.schema[2].num_children, Some(2));
        assert_eq!(
            d.schema[3]
                .physical_type
                .as_ref()
                .unwrap()
                .to_utf8()
                .unwrap(),
            "INT32"
        );
        let capture = crate::parquet_record_type_candidate::ParquetCapture::new(
            vec![1],
            d.schema,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(matches!(
            capture
                .resolve_record_type(2, &mut Context::ordinary())
                .unwrap(),
            crate::parquet_record_type_candidate::CandidateResolution::StructMember(_)
        ));
    }
    #[test]
    fn decodes_all_three_predecessor_list_files_without_modifying_source() {
        for name in ["list-tuple", "list-array", "list-items_tuple"] {
            let bytes = fixture(name);
            let before = bytes.clone();
            let result = decode_schema(&bytes, &mut Context::ordinary()).unwrap();
            assert_eq!(bytes, before);
            assert!(result.schema.len() > 2);
            let capture = crate::parquet_record_type_candidate::ParquetCapture::new(
                bytes,
                result.schema,
                &mut Context::ordinary(),
            )
            .unwrap();
            assert!(matches!(
                capture
                    .resolve_record_type(2, &mut Context::ordinary())
                    .unwrap(),
                crate::parquet_record_type_candidate::CandidateResolution::StructMember(_)
            ));
        }
    }
    #[test]
    fn refuses_encrypted_and_malformed_framing() {
        let mut bytes = fixture("list-tuple");
        bytes[0] = b'X';
        assert!(decode_schema(&bytes, &mut Context::ordinary()).is_err());
        assert!(decode_schema(&[1, 2, 3], &mut Context::ordinary()).is_err());
    }
    #[test]
    fn rejects_varints_with_discarded_high_bits() {
        for (bytes, bits) in [
            (
                [0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x02],
                64,
            ),
            ([0xff, 0xff, 0xff, 0xff, 0x10, 0, 0, 0, 0, 0], 32),
        ] {
            let mut context = Context::ordinary();
            let mut decoder = Decoder {
                bytes: &bytes,
                at: 0,
                nodes: 0,
                ctx: &mut context,
            };
            assert!(decoder.varint(bits).is_err());
        }
    }
    #[test]
    fn rejects_footer_length_address_overflow() {
        let mut bytes = fixture("list-tuple");
        let end = bytes.len();
        bytes[end - 8..end - 4].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(decode_schema(&bytes, &mut Context::ordinary()).is_err());
    }
}

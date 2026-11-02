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
    /// Complete ordered native SchemaElement fields decoded from the footer.
    /// The narrow `schema` projection above is for the current classifier;
    /// consumers that need native parameters or competing annotations must use
    /// this retained representation.
    pub native_schema_elements: Vec<NativeSchemaElement>,
    /// Complete ordered FileMetaData fields, including key/value metadata and
    /// fields unknown to this Parquet IDL revision. Values retain their
    /// Compact Protocol types so an opt-in consumer can inspect them without
    /// flattening native semantics into the narrow schema projection.
    pub native_file_metadata_fields: Vec<(i16, NativeWireValue)>,
    /// The metadata bytes after the FileMetaData struct, retained for audit.
    pub trailing_footer_bytes: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeSchemaElement {
    pub fields: Vec<(i16, NativeWireValue)>,
}

/// Byte range selected by the file trailer. A located range may still contain
/// a signature or crypto metadata; it is not automatically FileMetaData.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FooterRegion {
    pub offset: usize,
    pub length: usize,
    pub encrypted: bool,
}

/// A bounded Compact Protocol tree for the located footer bytes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DecodedFooter {
    pub region: FooterRegion,
    pub value: NativeWireValue,
    pub consumed_bytes: usize,
    pub trailing_bytes: usize,
}

/// Ordered view of FileMetaData.key_value_metadata. The original typed fields
/// remain available in `DecodedSchema::native_file_metadata_fields`; this
/// view only makes the standard key/value pair explicit for opt-in readers.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeKeyValueMetadata {
    pub index: usize,
    pub key: Option<Vec<u8>>,
    pub value: Option<Vec<u8>>,
    pub fields: Vec<(i16, NativeWireValue)>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ArrowSchemaMetadata {
    Absent,
    Unique {
        index: usize,
        value: Option<Vec<u8>>,
    },
    Duplicate {
        indices: Vec<usize>,
    },
    Blocked {
        diagnostic: &'static str,
    },
}

/// Extract the standard key/value envelope without decoding or normalizing
/// values. Duplicate keys and malformed entries remain observable; in
/// particular, ARROW:schema is never silently selected by first/last wins.
pub fn inspect_file_key_value_metadata(
    decoded: &DecodedSchema,
) -> (Vec<NativeKeyValueMetadata>, ArrowSchemaMetadata) {
    let file_metadata = decoded
        .native_file_metadata_fields
        .iter()
        .filter(|(id, _)| *id == 5)
        .collect::<Vec<_>>();
    if file_metadata.len() > 1 {
        return (
            Vec::new(),
            ArrowSchemaMetadata::Blocked {
                diagnostic: "FileMetaData.key_value_metadata is duplicated",
            },
        );
    }
    let Some((_, NativeWireValue::List(12, entries))) = file_metadata.first().copied() else {
        return (
            Vec::new(),
            if !file_metadata.is_empty() {
                ArrowSchemaMetadata::Blocked {
                    diagnostic: "FileMetaData.key_value_metadata has the wrong wire type",
                }
            } else {
                ArrowSchemaMetadata::Absent
            },
        );
    };
    let mut metadata = Vec::with_capacity(entries.len());
    let mut arrow_indices = Vec::new();
    for (index, entry) in entries.iter().enumerate() {
        let NativeWireValue::Struct(fields) = entry else {
            return (
                metadata,
                ArrowSchemaMetadata::Blocked {
                    diagnostic: "KeyValue metadata entry is not a struct",
                },
            );
        };
        let key = match unique(fields, 1) {
            Ok(Some(NativeWireValue::Binary(value))) => Some(value.clone()),
            Ok(None) => None,
            _ => {
                return (
                    metadata,
                    ArrowSchemaMetadata::Blocked {
                        diagnostic: "KeyValue.key is absent, duplicated, or not binary",
                    },
                );
            }
        };
        let value = match unique(fields, 2) {
            Ok(Some(NativeWireValue::Binary(value))) => Some(value.clone()),
            Ok(None) => None,
            _ => {
                return (
                    metadata,
                    ArrowSchemaMetadata::Blocked {
                        diagnostic: "KeyValue.value is duplicated or not binary",
                    },
                );
            }
        };
        if key.as_deref() == Some(b"ARROW:schema") {
            arrow_indices.push(index);
        }
        metadata.push(NativeKeyValueMetadata {
            index,
            key,
            value,
            fields: fields.clone(),
        });
    }
    let arrow = match arrow_indices.as_slice() {
        [] => ArrowSchemaMetadata::Absent,
        [index] => ArrowSchemaMetadata::Unique {
            index: *index,
            value: metadata[*index].value.clone(),
        },
        _ => ArrowSchemaMetadata::Duplicate {
            indices: arrow_indices,
        },
    };
    (metadata, arrow)
}

/// Owned Compact Protocol value. Integer widths, collection kinds, booleans,
/// floating point bits and UUID bytes stay distinguishable for native readers.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NativeWireValue {
    Bool(bool),
    Byte(i8),
    I16(i16),
    I32(i32),
    I64(i64),
    Double(u64),
    Binary(Vec<u8>),
    List(u8, Vec<NativeWireValue>),
    Set(u8, Vec<NativeWireValue>),
    Map(u8, u8, Vec<(NativeWireValue, NativeWireValue)>),
    Struct(Vec<(i16, NativeWireValue)>),
    Uuid([u8; 16]),
}

type WireValue = NativeWireValue;

struct Decoder<'a, 'b, 'c> {
    bytes: &'a [u8],
    at: usize,
    nodes: usize,
    ctx: &'b mut Context<'c>,
    ts_prefix: bool,
}

/// Locate the footer byte range without interpreting it. This mirrors the
/// public framing operation's deliberately incomplete claim.
pub fn locate_footer(bytes: &[u8]) -> Result<FooterRegion, EngineError> {
    if bytes.len() < 12 {
        return Err(EngineError::new(
            "PARQUET_TRUNCATED",
            Utf16::default(),
            "File is shorter than the framing minimum",
        ));
    }
    if bytes.len() > 1_000_000 {
        return Err(EngineError::new(
            "PARQUET_LIMIT",
            Utf16::default(),
            "Parquet source exceeds the 1000000-byte capture limit",
        ));
    }
    let start = &bytes[..4];
    let end = &bytes[bytes.len() - 4..];
    if !matches!(start, b"PAR1" | b"PARE") || end != start {
        return Err(EngineError::new(
            "PARQUET_MAGIC",
            Utf16::default(),
            "Expected matching PAR1 or PARE header and trailer",
        ));
    }
    let length =
        u32::from_le_bytes(bytes[bytes.len() - 8..bytes.len() - 4].try_into().unwrap()) as usize;
    let offset = bytes
        .len()
        .checked_sub(8)
        .and_then(|v| v.checked_sub(length));
    let Some(offset) = offset.filter(|v| *v >= 4 && length > 0) else {
        return Err(EngineError::new(
            "PARQUET_FOOTER_BOUNDS",
            Utf16::default(),
            "Footer region is empty or overlaps the file header",
        ));
    };
    Ok(FooterRegion {
        offset,
        length,
        encrypted: start == b"PARE",
    })
}

/// Decode one bounded Compact Protocol struct prefix from a plaintext footer.
/// Trailing bytes are counted and retained by the caller's original source.
pub fn decode_compact_footer(
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<DecodedFooter, EngineError> {
    decode_compact_footer_mode(bytes, ctx, false)
}

/// Public wire-view decoding follows the TypeScript Compact prefix diagnostics.
/// Schema and metadata callers retain the legacy native decoder profile.
pub fn decode_compact_footer_wire_view(
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<DecodedFooter, EngineError> {
    decode_compact_footer_mode(bytes, ctx, true)
}

fn decode_compact_footer_mode(
    bytes: &[u8],
    ctx: &mut Context<'_>,
    ts_prefix: bool,
) -> Result<DecodedFooter, EngineError> {
    let region = locate_footer(bytes)?;
    if region.encrypted {
        return Err(EngineError::new(
            "PARQUET_FOOTER_ENCRYPTED",
            Utf16::default(),
            "Encrypted footer requires a separate decryption implementation",
        ));
    }
    let end = bytes.len() - 8;
    let footer = &bytes[region.offset..end];
    ctx.charge_work(footer.len(), Utf16::default())?;
    let mut decoder = Decoder {
        bytes: footer,
        at: 0,
        nodes: 0,
        ctx,
        ts_prefix,
    };
    let value = match decoder.parse_value(12, 0, false) {
        Ok(value) => value,
        Err(error) if error.is_control_failure() => return Err(error),
        Err(error) => {
            return Err(EngineError::new(
                "PARQUET_FOOTER_DECODE",
                error.path,
                error
                    .message
                    .to_utf8()
                    .unwrap_or_else(|_| "Invalid Compact Protocol value".into()),
            ));
        }
    };
    Ok(DecodedFooter {
        region,
        value,
        consumed_bytes: decoder.at,
        trailing_bytes: footer.len().saturating_sub(decoder.at),
    })
}

/// Decode one bounded Compact struct prefix, including a page header.
pub fn decode_compact_struct_prefix(
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<(NativeWireValue, usize), EngineError> {
    let mut decoder = Decoder {
        bytes,
        at: 0,
        nodes: 0,
        ctx,
        ts_prefix: true,
    };
    let value = decoder.parse_value(12, 0, false)?;
    Ok((value, decoder.at))
}

impl Decoder<'_, '_, '_> {
    fn allocation_failure() -> EngineError {
        EngineError::new("RESOURCE_LIMIT", Utf16::default(), "Allocation failed")
            .with_control_failure()
    }
    fn fail<T>(&self, message: &'static str) -> Result<T, EngineError> {
        Err(EngineError::new(
            "PARQUET_SCHEMA_DECODE",
            Utf16::default(),
            message,
        ))
    }
    fn prefix_message(&self, legacy: &'static str, prefix: &'static str) -> &'static str {
        if self.ts_prefix {
            prefix
        } else {
            legacy
        }
    }
    fn wire_kind(&self, kind: u8) -> Result<(), EngineError> {
        if (1..=13).contains(&kind) {
            return Ok(());
        }
        if self.ts_prefix {
            Err(EngineError::new(
                "PARQUET_SCHEMA_DECODE",
                Utf16::default(),
                format!("Unknown Compact Protocol wire type {kind}"),
            ))
        } else {
            self.fail("Unknown Compact Protocol type")
        }
    }
    fn take_fixed<const N: usize>(&mut self) -> Result<[u8; N], EngineError> {
        if self.bytes.len().saturating_sub(self.at) < N {
            return self.fail("Binary value exceeds footer region");
        }
        let mut out = [0; N];
        out.copy_from_slice(&self.bytes[self.at..self.at + N]);
        self.at += N;
        Ok(out)
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
                return self.fail(self.prefix_message(
                    "Compact varint exceeds declared width",
                    "Varint exceeds declared width",
                ));
            }
            value |= u64::from(b & 0x7f).checked_shl(i * 7).ok_or_else(|| {
                EngineError::new(
                    "PARQUET_SCHEMA_DECODE",
                    Utf16::default(),
                    self.prefix_message("Compact varint overflow", "Varint exceeds declared width"),
                )
            })?;
            if b & 0x80 == 0 {
                if bits < 64 && value >= (1u64 << bits) {
                    return self.fail(self.prefix_message(
                        "Compact varint exceeds declared width",
                        "Varint exceeds declared width",
                    ));
                }
                return Ok(value);
            }
        }
        self.fail(self.prefix_message(
            "Compact varint exceeds declared width",
            "Varint exceeds declared width",
        ))
    }
    fn signed(&mut self, bits: u32) -> Result<i64, EngineError> {
        let n = self.varint(bits)?;
        Ok(((n >> 1) as i64) ^ (-((n & 1) as i64)))
    }
    fn length(&mut self) -> Result<usize, EngineError> {
        let n = self.varint(32)?;
        if n > i32::MAX as u64 {
            return self.fail(self.prefix_message(
                "Compact collection length exceeds signed int32",
                "Length exceeds signed int32",
            ));
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
        if self.ts_prefix {
            self.wire_kind(kind)?;
        }
        match kind {
            1 | 2 => {
                let b = if field { kind } else { self.byte()? };
                if b != 1 && b != 2 {
                    return self.fail(
                        self.prefix_message("Invalid Compact boolean", "Invalid boolean encoding"),
                    );
                }
                Ok(WireValue::Bool(b == 1))
            }
            3 => Ok(WireValue::Byte({
                let b = self.byte()?;
                if b < 128 {
                    b as i8
                } else {
                    (i16::from(b) - 256) as i8
                }
            })),
            4 => Ok(WireValue::I16(self.signed(16)? as i16)),
            5 => Ok(WireValue::I32(self.signed(32)? as i32)),
            6 => Ok(WireValue::I64(self.signed(64)?)),
            7 => {
                if self.ts_prefix {
                    return Ok(WireValue::Double(u64::from_le_bytes(
                        self.take_fixed::<8>()?,
                    )));
                }
                let mut bytes = [0; 8];
                for byte in &mut bytes {
                    *byte = self.byte()?;
                }
                Ok(WireValue::Double(u64::from_le_bytes(bytes)))
            }
            8 => {
                let n = self.length()?;
                if n > self.bytes.len().saturating_sub(self.at) {
                    return self.fail("Binary value exceeds footer region");
                }
                self.ctx.charge_work(n, Utf16::default())?;
                let mut b = Vec::new();
                b.try_reserve_exact(n)
                    .map_err(|_| Self::allocation_failure())?;
                b.extend_from_slice(&self.bytes[self.at..self.at + n]);
                self.at += n;
                Ok(WireValue::Binary(b))
            }
            9 | 10 => {
                let h = self.byte()?;
                let elem = h & 0x0f;
                let short = usize::from(h >> 4);
                let n = if short == 15 { self.length()? } else { short };
                if self.ts_prefix {
                    self.wire_kind(elem)?;
                }
                if n > MAX_NODES.saturating_sub(self.nodes) {
                    return self.fail("Collection exceeds value limit");
                }
                let mut items = Vec::new();
                items
                    .try_reserve(n)
                    .map_err(|_| Self::allocation_failure())?;
                for _ in 0..n {
                    items.push(self.parse_value(elem, depth + 1, false)?);
                }
                Ok(if kind == 9 {
                    WireValue::List(elem, items)
                } else {
                    WireValue::Set(elem, items)
                })
            }
            11 => {
                let n = self.length()?;
                if n > MAX_NODES.saturating_sub(self.nodes) / 2 {
                    return self.fail("Map exceeds value limit");
                }
                if n == 0 {
                    return Ok(WireValue::Map(0, 0, Vec::new()));
                }
                let h = self.byte()?;
                if self.ts_prefix {
                    self.wire_kind(h >> 4)?;
                    self.wire_kind(h & 15)?;
                }
                let mut entries = Vec::new();
                entries
                    .try_reserve(n)
                    .map_err(|_| Self::allocation_failure())?;
                for _ in 0..n {
                    let key = self.parse_value(h >> 4, depth + 1, false)?;
                    let value = self.parse_value(h & 15, depth + 1, false)?;
                    entries.push((key, value));
                }
                Ok(WireValue::Map(h >> 4, h & 15, entries))
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
                        return self.fail(self.prefix_message(
                            "Compact field id exceeds int16",
                            "Field ID exceeds signed int16",
                        ));
                    }
                    previous = id;
                    if fields.len() >= MAX_NODES {
                        return self.fail("Struct field limit exceeded");
                    }
                    fields
                        .try_reserve(1)
                        .map_err(|_| Self::allocation_failure())?;
                    fields.push((id as i16, self.parse_value(t, depth + 1, true)?));
                }
                Ok(WireValue::Struct(fields))
            }
            13 => {
                if self.ts_prefix {
                    return Ok(WireValue::Uuid(self.take_fixed::<16>()?));
                }
                let mut uuid = [0; 16];
                for byte in &mut uuid {
                    *byte = self.byte()?;
                }
                Ok(WireValue::Uuid(uuid))
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
        Some(WireValue::Byte(v)) => Ok(Some(i64::from(*v))),
        Some(WireValue::I16(v)) => Ok(Some(i64::from(*v))),
        Some(WireValue::I32(v)) => Ok(Some(i64::from(*v))),
        Some(WireValue::I64(v)) => Ok(Some(*v)),
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

/// Decode FileMetaData.schema through the existing narrow LIST adapter. This
/// compatibility entry point refuses fields it cannot represent, preventing
/// callers from classifying a lossy projection.
pub fn decode_schema(bytes: &[u8], ctx: &mut Context<'_>) -> Result<DecodedSchema, EngineError> {
    decode_schema_mode(bytes, ctx, false)
}

/// Decode the full ordered SchemaElement wire values alongside the narrow
/// LIST-adapter projection. Use this route when native parameters, unknown
/// fields, or competing annotations must remain available to an explicit
/// native-aware consumer. The ordinary classifier entry point remains strict.
pub fn decode_schema_retaining(
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<DecodedSchema, EngineError> {
    decode_schema_mode(bytes, ctx, true)
}

fn decode_schema_mode(
    bytes: &[u8],
    ctx: &mut Context<'_>,
    retain_unprojected: bool,
) -> Result<DecodedSchema, EngineError> {
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
        ts_prefix: false,
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
    let mut native_schema_elements = Vec::with_capacity(items.len());
    for item in items {
        let WireValue::Struct(fields) = item else {
            return decoder.fail("Schema list contains a non-struct");
        };
        if !retain_unprojected && fields.iter().any(|(id, _)| !matches!(*id, 1..=10)) {
            return decoder.fail("Unknown SchemaElement fields are not interpreted");
        }
        // Retain the complete field sequence before making a narrow projection.
        // This includes fields unknown to this Parquet IDL revision.
        native_schema_elements.push(NativeSchemaElement {
            fields: fields.clone(),
        });
        if !retain_unprojected {
            for id in [2, 7, 8, 9] {
                if unique(fields, id)?.is_some() {
                    return decoder
                        .fail("SchemaElement parameters outside the candidate view are present");
                }
            }
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
        let legacy = int(fields, 6)?;
        let modern = match unique(fields, 10)? {
            None => None,
            Some(WireValue::Struct(alts)) => {
                if alts.len() != 1 {
                    if !retain_unprojected {
                        return decoder.fail("LogicalType must select exactly one alternative");
                    }
                    Some("OTHER".to_owned())
                } else {
                    let (id, payload) = &alts[0];
                    if *id == 3 && !matches!(payload,WireValue::Struct(inner) if inner.is_empty()) {
                        if !retain_unprojected {
                            return decoder.fail("LIST logical annotation payload is not empty");
                        }
                        Some("OTHER".to_owned())
                    } else {
                        Some(if *id == 3 { "LIST" } else { "OTHER" }.to_owned())
                    }
                }
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
        let annotation = match (&modern, &legacy_name) {
            (Some(modern), Some(legacy)) if modern != legacy => {
                if !retain_unprojected {
                    return decoder.fail("Logical and converted annotations conflict");
                }
                Some("OTHER".to_owned())
            }
            (Some(modern), _) => Some(modern.clone()),
            (None, Some(legacy)) => Some(legacy.clone()),
            (None, None) => None,
        };
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
        native_schema_elements,
        native_file_metadata_fields: metadata,
        trailing_footer_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

    fn varint(out: &mut Vec<u8>, mut n: u64) {
        while n >= 0x80 {
            out.push((n as u8) | 0x80);
            n >>= 7;
        }
        out.push(n as u8);
    }
    fn field_i32(out: &mut Vec<u8>, previous: &mut i16, id: i16, value: i32) {
        let delta = id - *previous;
        out.push(((delta as u8) << 4) | 5);
        let zigzag = ((value << 1) ^ (value >> 31)) as u32;
        varint(out, u64::from(zigzag));
        *previous = id;
    }
    fn field_binary(out: &mut Vec<u8>, previous: &mut i16, id: i16, value: &[u8]) {
        let delta = id - *previous;
        out.push(((delta as u8) << 4) | 8);
        varint(out, value.len() as u64);
        out.extend_from_slice(value);
        *previous = id;
    }
    fn minimal_file(extra: Option<&str>) -> Vec<u8> {
        let mut root = Vec::new();
        let mut prev = 0;
        field_binary(&mut root, &mut prev, 4, b"schema");
        field_i32(&mut root, &mut prev, 5, 1);
        root.push(0);

        let mut leaf = Vec::new();
        let mut prev = 0;
        field_i32(&mut leaf, &mut prev, 1, 1); // INT32
        if extra == Some("type_length") {
            field_i32(&mut leaf, &mut prev, 2, 4);
        }
        field_i32(&mut leaf, &mut prev, 3, 1); // OPTIONAL
        field_binary(&mut leaf, &mut prev, 4, b"x");
        if extra == Some("conflict") {
            field_i32(&mut leaf, &mut prev, 6, 1); // converted MAP
            leaf.push(((10 - prev) as u8) << 4 | 12);
            leaf.extend_from_slice(&[0x3c, 0, 0]); // logical LIST
            prev = 10;
        } else if extra == Some("unknown") {
            leaf.push(((11 - prev) as u8) << 4 | 1); // unknown bool=true
            prev = 11;
        }
        let _ = prev;
        leaf.push(0);

        let mut metadata = Vec::new();
        let mut prev = 0;
        field_i32(&mut metadata, &mut prev, 1, 1);
        metadata.push(((2 - prev) as u8) << 4 | 9);
        metadata.push(0x2c); // two SchemaElement structs
        metadata.extend_from_slice(&root);
        metadata.extend_from_slice(&leaf);
        metadata.push(((5 - 2) as u8) << 4 | 9); // key_value_metadata list
        metadata.push(0x1c); // one struct
        let mut pair = Vec::new();
        let mut pair_prev = 0;
        field_binary(&mut pair, &mut pair_prev, 1, b"k");
        field_binary(&mut pair, &mut pair_prev, 2, b"v");
        pair.push(0);
        metadata.extend_from_slice(&pair);
        metadata.push(0);

        let mut file = b"PAR1".to_vec();
        file.extend_from_slice(&metadata);
        file.extend_from_slice(&(metadata.len() as u32).to_le_bytes());
        file.extend_from_slice(b"PAR1");
        file
    }

    fn fixture(name: &str) -> Vec<u8> {
        let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.push("../../fixtures/parquet/containers");
        p.push(format!("{name}.parquet"));
        fs::read(p).unwrap()
    }
    #[test]
    fn decodes_pinned_list_schema_from_retained_file_bytes() {
        let d = decode_schema(&fixture("list-tuple"), &mut Context::ordinary()).unwrap();
        assert_eq!(d.schema.len(), d.native_schema_elements.len());
        assert!(d.native_schema_elements[1]
            .fields
            .iter()
            .any(|(id, value)| *id == 4 && matches!(value, WireValue::Binary(_))));
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
    fn compact_footer_parser_preserves_mid_parse_control_failure() {
        let bytes = fixture("list-tuple");
        let footer_length = locate_footer(&bytes).unwrap().length;
        let mut armed = false;
        let mut meter = |amount: usize| {
            if armed {
                return Err(EngineError::new(
                    "CANCELLED",
                    Utf16::default(),
                    "meter stopped during footer parse",
                ));
            }
            if amount == footer_length {
                armed = true;
            }
            Ok(())
        };
        let mut context = Context::ordinary().with_host_control(&mut meter);
        let error = decode_compact_footer(&bytes, &mut context).unwrap_err();
        assert!(error.is_control_failure());
        assert_ne!(error.code, "PARQUET_FOOTER_DECODE");
    }

    #[test]
    fn native_compact_values_preserve_wire_kinds_and_payloads() {
        fn decode_one(kind: u8, bytes: &[u8], field: bool) -> WireValue {
            let mut context = Context::ordinary();
            let mut decoder = Decoder {
                bytes,
                at: 0,
                nodes: 0,
                ctx: &mut context,
                ts_prefix: false,
            };
            decoder.parse_value(kind, 0, field).unwrap()
        }
        assert_eq!(decode_one(1, &[], true), WireValue::Bool(true));
        assert_eq!(
            decode_one(7, &1.25f64.to_bits().to_le_bytes(), false),
            WireValue::Double(1.25f64.to_bits())
        );
        assert_eq!(
            decode_one(
                13,
                &[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
                false
            ),
            WireValue::Uuid([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
        );
        // One map entry: i32 key 1, binary value "x".
        assert_eq!(
            decode_one(11, &[1, 0x58, 2, 1, b'x'], false),
            WireValue::Map(
                5,
                8,
                vec![(WireValue::I32(1), WireValue::Binary(vec![b'x']))]
            )
        );
    }

    #[test]
    fn strict_entry_point_refuses_unprojected_schema_meanings() {
        for (case, message) in [
            (
                "unknown",
                "Unknown SchemaElement fields are not interpreted",
            ),
            (
                "type_length",
                "SchemaElement parameters outside the candidate view are present",
            ),
            ("conflict", "Logical and converted annotations conflict"),
        ] {
            let error =
                decode_schema(&minimal_file(Some(case)), &mut Context::ordinary()).unwrap_err();
            assert_eq!(error.code, "PARQUET_SCHEMA_DECODE");
            assert_eq!(error.message.to_utf8().unwrap(), message);
        }
    }

    #[test]
    fn retaining_entry_point_preserves_unprojected_schema_meanings() {
        for (case, field_id) in [("unknown", 11), ("type_length", 2), ("conflict", 10)] {
            let decoded =
                decode_schema_retaining(&minimal_file(Some(case)), &mut Context::ordinary())
                    .unwrap();
            let fields = &decoded.native_schema_elements[1].fields;
            assert!(fields.iter().any(|(id, _)| *id == field_id), "{case}");
            if case == "conflict" {
                assert_eq!(
                    decoded.schema[1]
                        .annotation
                        .as_ref()
                        .unwrap()
                        .to_utf8()
                        .unwrap(),
                    "OTHER"
                );
                assert_eq!(decoded.schema[1].converted_type, Some(1));
            }
        }
    }

    #[test]
    fn retaining_entry_point_preserves_ordered_file_metadata_fields() {
        let decoded =
            decode_schema_retaining(&minimal_file(None), &mut Context::ordinary()).unwrap();
        let metadata = &decoded.native_file_metadata_fields;
        let key_value = metadata.iter().find(|(id, _)| *id == 5).unwrap();
        let expected = WireValue::List(
            12,
            vec![WireValue::Struct(vec![
                (1, WireValue::Binary(b"k".to_vec())),
                (2, WireValue::Binary(b"v".to_vec())),
            ])],
        );
        assert_eq!(key_value.1, expected);
        // The narrow adapter intentionally does not expose file-level metadata.
        assert_eq!(decoded.schema.len(), decoded.native_schema_elements.len());
        let (entries, arrow) = inspect_file_key_value_metadata(&decoded);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].index, 0);
        assert_eq!(entries[0].key.as_deref(), Some(b"k".as_slice()));
        assert_eq!(entries[0].value.as_deref(), Some(b"v".as_slice()));
        assert_eq!(arrow, ArrowSchemaMetadata::Absent);
    }

    #[test]
    fn arrow_schema_receipt_is_ordered_and_never_first_wins() {
        let pair = |key: &[u8], value: Option<&[u8]>| {
            let mut fields = vec![(1, WireValue::Binary(key.to_vec()))];
            if let Some(value) = value {
                fields.push((2, WireValue::Binary(value.to_vec())));
            }
            WireValue::Struct(fields)
        };
        let decoded = |entries: Vec<WireValue>| DecodedSchema {
            schema: Vec::new(),
            native_schema_elements: Vec::new(),
            native_file_metadata_fields: vec![(5, WireValue::List(12, entries))],
            trailing_footer_bytes: 0,
        };
        let (entries, arrow) = inspect_file_key_value_metadata(&decoded(vec![pair(
            b"ARROW:schema",
            Some(b"opaque-base64"),
        )]));
        assert_eq!(
            entries[0].value.as_deref(),
            Some(b"opaque-base64".as_slice())
        );
        assert_eq!(
            arrow,
            ArrowSchemaMetadata::Unique {
                index: 0,
                value: Some(b"opaque-base64".to_vec()),
            }
        );

        let (_, arrow) = inspect_file_key_value_metadata(&decoded(vec![
            pair(b"ARROW:schema", Some(b"first")),
            pair(b"ARROW:schema", Some(b"second")),
        ]));
        assert_eq!(
            arrow,
            ArrowSchemaMetadata::Duplicate {
                indices: vec![0, 1]
            }
        );

        let (_, arrow) = inspect_file_key_value_metadata(&decoded(vec![WireValue::I32(1)]));
        assert_eq!(
            arrow,
            ArrowSchemaMetadata::Blocked {
                diagnostic: "KeyValue metadata entry is not a struct",
            }
        );
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
                ts_prefix: false,
            };
            assert!(decoder.varint(bits).is_err());
        }
    }
    #[test]
    fn compact_allocation_failure_has_trusted_control_origin() {
        let error = Decoder::allocation_failure();
        assert_eq!(error.code, "RESOURCE_LIMIT");
        assert!(error.is_control_failure());
    }

    #[test]
    fn page_prefix_matches_compact_error_order_and_keeps_legacy_profile() {
        let cases: &[(&[u8], &str)] = &[
            (&[31], "Unknown Compact Protocol wire type 15"),
            (&[25, 17, 0], "Invalid boolean encoding"),
            (&[24, 127], "Binary value exceeds footer region"),
            (&[24, 255, 255, 255, 255, 15], "Length exceeds signed int32"),
            (&[25, 15], "Unknown Compact Protocol wire type 15"),
            (&[27, 1, 245], "Unknown Compact Protocol wire type 15"),
            (
                &[5, 254, 255, 3, 0, 245, 0],
                "Field ID exceeds signed int16",
            ),
            (&[23, 0], "Binary value exceeds footer region"),
            (&[29, 0], "Binary value exceeds footer region"),
            (&[27, 1, 1], "Unknown Compact Protocol wire type 0"),
            (&[27, 1, 16], "Unknown Compact Protocol wire type 0"),
            (&[25, 0], "Unknown Compact Protocol wire type 0"),
            (&[25, 0x1f], "Unknown Compact Protocol wire type 15"),
            (
                &[24, 128, 128, 128, 128, 16],
                "Varint exceeds declared width",
            ),
            (&[5, 128, 128, 4], "Varint exceeds declared width"),
            (&[25], "Truncated Compact Protocol value"),
            (&[27, 1], "Truncated Compact Protocol value"),
            (&[23], "Binary value exceeds footer region"),
        ];
        for (bytes, expected) in cases {
            let actual = decode_compact_struct_prefix(bytes, &mut Context::ordinary()).unwrap_err();
            assert_eq!(actual.message.to_utf8().unwrap(), *expected, "{bytes:?}");
        }
        let mut context = Context::ordinary();
        let mut legacy = Decoder {
            bytes: &[31],
            at: 0,
            nodes: 0,
            ctx: &mut context,
            ts_prefix: false,
        };
        assert_eq!(
            legacy
                .parse_value(12, 0, false)
                .unwrap_err()
                .message
                .to_utf8()
                .unwrap(),
            "Unknown Compact Protocol type"
        );
    }
    #[test]
    fn rejects_footer_length_address_overflow() {
        let mut bytes = fixture("list-tuple");
        let end = bytes.len();
        bytes[end - 8..end - 4].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(decode_schema(&bytes, &mut Context::ordinary()).is_err());
    }
}

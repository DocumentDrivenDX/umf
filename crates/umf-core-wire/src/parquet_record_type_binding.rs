// SPDX-License-Identifier: MIT OR Apache-2.0
//! Tagged, opt-in test transport for the bounded Parquet capture foundation.
//! It is not a production route or a classification/recovery operation.
use umf_core::{Context, EngineError, Utf16, Value};

use crate::{decode, encode, field, result_envelope, text_field};

fn error(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn required_text<'a>(value: &'a Value, name: &str) -> Result<&'a Utf16, EngineError> {
    match field(value, name) {
        Some(Value::String(value)) => Ok(value),
        _ => Err(error("Required text member is missing")),
    }
}
fn hex(bytes: &[u8]) -> String {
    const D: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(D[(b >> 4) as usize] as char);
        out.push(D[(b & 15) as usize] as char);
    }
    out
}
fn unhex(value: &str) -> Result<Vec<u8>, EngineError> {
    if value.len() % 2 != 0 {
        return Err(error(
            "bytesHex must have an even number of hexadecimal digits",
        ));
    }
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|p| {
            let n = |c: u8| match c {
                b'0'..=b'9' => Some(c - b'0'),
                b'a'..=b'f' => Some(c - b'a' + 10),
                b'A'..=b'F' => Some(c - b'A' + 10),
                _ => None,
            };
            Ok(
                (n(p[0]).ok_or_else(|| error("bytesHex is not hexadecimal"))? << 4)
                    | n(p[1]).ok_or_else(|| error("bytesHex is not hexadecimal"))?,
            )
        })
        .collect()
}
fn schema_text(row: &Value, name: &str) -> Result<Option<Utf16>, EngineError> {
    match field(row, name) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(v)) => Ok(Some(v.clone())),
        _ => Err(error("Schema members must be text or null")),
    }
}
fn safe_integer(value: f64) -> Option<usize> {
    const MAX_SAFE: f64 = 9_007_199_254_740_991.0;
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > MAX_SAFE {
        return None;
    }
    usize::try_from(value as u64).ok()
}

/// Request: `{op:"parquet.recordType.resolveCandidate",bytesHex,schema:[...]}`.
/// The response marks itself incomplete and returns the exact source byte hex.
pub fn execute_wire(wire_json: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(wire_json, &mut no_control)
}
pub fn execute_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        use umf_core::parquet_record_type_candidate::{
            CandidateResolution, ParquetCapture, SchemaElement, PROFILE,
        };
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "op").as_deref() != Some("parquet.recordType.resolveCandidate") {
            return Err(error("Unknown Parquet Record Type candidate operation"));
        }
        let bytes = unhex(
            required_text(&request, "bytesHex")?
                .to_utf8()
                .map_err(|_| error("bytesHex must be UTF-8"))?
                .as_str(),
        )?;
        let rows = match field(&request, "schema") {
            Some(Value::Array(rows)) => rows,
            _ => return Err(error("schema must be an array")),
        };
        let mut schema = Vec::with_capacity(rows.len());
        for row in rows {
            let num_children = match field(row, "numChildren") {
                None | Some(Value::Null) => None,
                Some(Value::Number(n)) => Some(safe_integer(*n).ok_or_else(|| {
                    error("numChildren must be a safe nonnegative integer or null")
                })?),
                _ => {
                    return Err(error(
                        "numChildren must be a safe nonnegative integer or null",
                    ));
                }
            };
            schema.push(SchemaElement {
                name: required_text(row, "name")?.clone(),
                repetition: schema_text(row, "repetition")?,
                num_children,
                physical_type: schema_text(row, "physicalType")?,
                annotation: schema_text(row, "annotation")?,
                converted_type: None,
            });
        }
        let capture = ParquetCapture::new(bytes, schema, &mut ctx)?;
        let index = match field(&request, "index") {
            Some(Value::Number(n)) => {
                safe_integer(*n).ok_or_else(|| error("index must be a safe nonnegative integer"))?
            }
            _ => return Err(error("index must be a safe nonnegative integer")),
        };
        let (status, details) = match capture.resolve_record_type(index, &mut ctx)? {
            CandidateResolution::StructMember(c) => (
                "candidate",
                vec![
                    ("index", Value::Number(index as f64)),
                    ("containerIndex", Value::Number(c.container_index as f64)),
                    (
                        "path",
                        Value::Array(c.path.into_iter().map(Value::String).collect()),
                    ),
                    ("layout", Value::String(c.layout)),
                ],
            ),
            CandidateResolution::Unsupported { reason } => {
                ("unsupported", vec![("reason", Value::string_utf8(reason))])
            }
        };
        let mut fields = vec![
            (Utf16::from("profile"), Value::string_utf8(PROFILE)),
            (Utf16::from("status"), Value::string_utf8(status)),
            (Utf16::from("complete"), Value::Bool(false)),
            (
                Utf16::from("sourceBytesHex"),
                Value::string_utf8(hex(capture.bytes())),
            ),
        ];
        fields.extend(details.into_iter().map(|(k, v)| (Utf16::from(k), v)));
        encode(&Value::Object(fields), &mut ctx)
    })();
    result_envelope(result)
}

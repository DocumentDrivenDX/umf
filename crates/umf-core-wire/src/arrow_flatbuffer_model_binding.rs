// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned logical Arrow FlatBuffer model host routes.
use crate::{decode, encode, field, result_envelope};
use std::{collections::BTreeSet, fmt::Write as _};
use umf_core::{
    arrow_flatbuffer_binary, arrow_flatbuffer_model, Context, EngineError, Utf16, Value,
};
pub const PROFILE: &str = "umf.arrow-flatbuffer-model-wire/1";
fn err(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(v: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    if let Some(Value::String(v)) = v {
        Ok(v)
    } else {
        Err(err(&format!("{name} must be a string")))
    }
}
fn execute(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Value::Object(fields) = request else {
        return Err(err("request must be an object"));
    };
    let mut seen = BTreeSet::new();
    for (k, _) in fields {
        ctx.charge_work(k.len().saturating_add(1), Utf16::default())?;
        if ![
            "profile",
            "op",
            "text",
            "id",
            "document",
            "path",
            "replacement",
            "rootType",
            "bytes",
        ]
        .iter()
        .any(|x| k == &Utf16::from(*x))
            || !seen.insert(k)
        {
            return Err(err("request has unknown or duplicate fields"));
        }
    }
    if text(field(request, "profile"), "profile")? != &Utf16::from(PROFILE) {
        return Err(err("wrong Arrow FlatBuffer model profile"));
    }
    let op = text(field(request, "op"), "op")?
        .to_utf8()
        .map_err(|_| err("op must be valid UTF-16"))?;
    match op.as_str() {
        "arrow-flatbuffer-model.importArrowFlatbufferModel" => {
            let source = text(field(request, "text"), "text")?;
            let id = text(field(request, "id"), "id")?;
            arrow_flatbuffer_model::import_arrow_flatbuffer_model(source, id, ctx)
        }
        "arrow-flatbuffer-model.inspectArrowFlatbufferModel" => {
            let d = field(request, "document").ok_or_else(|| err("document required"))?;
            arrow_flatbuffer_model::inspect_arrow_flatbuffer_model(d, ctx)
        }
        "arrow-flatbuffer-model.exportArrowFlatbufferModel" => {
            let d = field(request, "document").ok_or_else(|| err("document required"))?;
            Ok(Value::String(
                arrow_flatbuffer_model::export_arrow_flatbuffer_model(d, ctx)?,
            ))
        }
        "arrow-flatbuffer-model.proposeArrowFlatbufferEdit" => {
            let d = field(request, "document").ok_or_else(|| err("document required"))?;
            let path = text(field(request, "path"), "path")?;
            let replacement =
                field(request, "replacement").ok_or_else(|| err("replacement required"))?;
            arrow_flatbuffer_model::propose_arrow_flatbuffer_edit(d, path, replacement, ctx)
        }
        "arrow-flatbuffer-model.decodeArrowFlatbuffer" => {
            let id = text(field(request, "id"), "id")?;
            let root_type = text(field(request, "rootType"), "rootType")?
                .to_utf8()
                .map_err(|_| err("rootType must be valid UTF-16"))?;
            let bytes = decode_hex(text(field(request, "bytes"), "bytes")?)?;
            arrow_flatbuffer_binary::decode_arrow_flatbuffer(&bytes, id, &root_type, ctx)
        }
        "arrow-flatbuffer-model.prepareArrowFlatbufferEncoding" => {
            let d = field(request, "document").ok_or_else(|| err("document required"))?;
            arrow_flatbuffer_binary::prepare_arrow_flatbuffer_encoding(d, ctx)
        }
        "arrow-flatbuffer-model.verifyArrowFlatbufferEncoding" => {
            let d = field(request, "document").ok_or_else(|| err("document required"))?;
            let expected = arrow_flatbuffer_binary::prepare_arrow_flatbuffer_encoding(d, ctx)?;
            let bytes = decode_hex(text(field(request, "bytes"), "bytes")?)?;
            arrow_flatbuffer_binary::verify_encoded_bytes(&expected, &bytes, ctx)?;
            Ok(Value::Bool(true))
        }
        "arrow-flatbuffer-model.encodeArrowFlatbufferNative" => {
            let d = field(request, "document").ok_or_else(|| err("document required"))?;
            let model = arrow_flatbuffer_binary::prepare_arrow_flatbuffer_encoding(d, ctx)?;
            let bytes = arrow_flatbuffer_binary::encode_arrow_flatbuffer_native(&model, ctx)?;
            ctx.charge_work(bytes.len(), Utf16::default())?;
            let capacity = bytes
                .len()
                .checked_mul(2)
                .ok_or_else(|| err("encoded metadata is too large"))?;
            let mut hex = String::with_capacity(capacity);
            for byte in bytes {
                write!(&mut hex, "{byte:02x}")
                    .map_err(|_| err("encoded metadata could not be rendered"))?;
            }
            Ok(Value::String(Utf16::from(hex)))
        }
        _ => Err(err("unknown Arrow FlatBuffer model operation")),
    }
}
fn decode_hex(source: &Utf16) -> Result<Vec<u8>, EngineError> {
    let text = source
        .to_utf8()
        .map_err(|_| err("bytes must be valid lowercase hexadecimal"))?;
    if text.len() > 2_000_000 {
        return Err(EngineError::new(
            "ARROW_IPC_LIMIT",
            Utf16::default(),
            "Expected at most 1000000 source bytes",
        ));
    }
    if text.len() % 2 != 0
        || !text
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(err("bytes must be valid lowercase hexadecimal"));
    }
    text.as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let nibble = |b: u8| if b <= b'9' { b - b'0' } else { b - b'a' + 10 };
            Ok((nibble(pair[0]) << 4) | nibble(pair[1]))
        })
        .collect()
}

pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire, &mut ctx)?;
        execute(&request, &mut ctx).and_then(|out| encode(&out, &mut ctx))
    })();
    result_envelope(result)
}

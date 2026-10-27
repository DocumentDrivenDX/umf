// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in ordinary-profile `readJsonValue` entry for primitive JS strings.
use napi::JsString;
use napi_derive::napi;
use umf_core::{
    serialization::{read_typescript_json_value, stringify_compact, stringify_compact_metered},
    Context, EngineError, Utf16, Value,
};

/// Parse one already-admitted primitive string. The TS facade owns the
/// predecessor's raw-JS length/preflight/second-length sequence; Rust owns
/// UTF-16 extraction, parsing, tree admission and result framing in one Context.
#[napi(js_name = "readJsonValueOrdinaryText")]
pub fn read_json_value_ordinary_text(
    source: JsString,
    format_is_json: bool,
) -> napi::Result<String> {
    let mut context = Context::ordinary();
    let source_length = source.utf16_len()?;
    if source_length > context.limits().max_text_units {
        return encode_outcome(
            Err(EngineError::new(
                "LIMIT",
                Utf16::default(),
                "Source text exceeds limit",
            )),
            &mut context,
        );
    }

    // N-API's UTF-16 conversion allocates one extra terminator unit. Reserve
    // the payload first, then remove exactly the known terminator; embedded
    // NUL units remain source data.
    if let Err(error) = context.charge_work(source_length, Utf16::default()) {
        return encode_outcome(Err(error), &mut context);
    }
    let utf16 = source.into_utf16()?;
    let units = utf16.as_slice();
    if units.len() != source_length + 1 || units[source_length] != 0 {
        return Err(napi::Error::from_reason("Invalid N-API UTF-16 frame"));
    }
    let source_units = &units[..source_length];

    let format = if format_is_json {
        Some(umf_core::serialization::Format::Json)
    } else {
        Some(umf_core::serialization::Format::Yaml)
    };
    let result = read_typescript_json_value(source_units, format, &mut context);
    encode_outcome(result, &mut context)
}

fn encode_outcome(
    result: Result<Value, EngineError>,
    context: &mut Context<'_>,
) -> napi::Result<String> {
    let envelope = match result {
        Ok(value) => Value::Object(vec![
            (Utf16::from("ok"), Value::Bool(true)),
            (Utf16::from("value"), value),
        ]),
        Err(error) => Value::Object(vec![
            (Utf16::from("ok"), Value::Bool(false)),
            (Utf16::from("code"), Value::String(Utf16::from(error.code))),
            (Utf16::from("path"), Value::String(error.path)),
            (Utf16::from("message"), Value::String(error.message)),
        ]),
    };
    let encoded = match stringify_compact_metered(&envelope, context) {
        Ok(encoded) => encoded,
        Err(error) => stringify_compact(&error_envelope(error))
            .map_err(|_| napi::Error::from_reason("Unable to frame Rust readJsonValue result"))?,
    };
    encoded
        .to_utf8()
        .map_err(|_| napi::Error::from_reason("Result frame was not valid UTF-16"))
}

fn error_envelope(error: EngineError) -> Value {
    Value::Object(vec![
        (Utf16::from("ok"), Value::Bool(false)),
        (Utf16::from("code"), Value::String(Utf16::from(error.code))),
        (Utf16::from("path"), Value::String(error.path)),
        (Utf16::from("message"), Value::String(error.message)),
    ])
}

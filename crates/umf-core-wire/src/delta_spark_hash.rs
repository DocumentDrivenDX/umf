// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in JSON wire adapter for Delta's scalar multipart file-key hash.
//! This is not registered in the default host dispatcher.

use umf_core::{
    Context, EngineError, Utf16, Value,
    delta_spark_hash::spark_string_hash,
    serialization::{Format, read_json_value, write_json_value},
};

/// Decode one request, dispatch `delta/sparkStringHash`, and encode its result.
/// Request shape: `{"op":"delta/sparkStringHash","value":string|null,"seed":i32?}`.
/// Result shape: `{"hash":i32}`. The request and result use the ordinary UMF
/// JSON text bounds. No adapter resources or host capabilities are consulted.
pub fn execute_json(request: &str) -> Result<String, EngineError> {
    let mut ctx = Context::ordinary();
    let value = read_json_value(
        &request.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut ctx,
    )?;
    let result = dispatch(value)?;
    Ok(write_json_value(&result, Format::Json, &mut ctx)?
        .to_utf8()
        .expect("generated JSON result is valid UTF-8"))
}

fn dispatch(request: Value) -> Result<Value, EngineError> {
    let Value::Object(members) = request else {
        return Err(fail("WIRE_REQUEST", "Request must be an object"));
    };
    let mut operation = None;
    let mut value = None;
    let mut has_value = false;
    let mut seed = 42i32;
    for (key, field) in members {
        match key.to_utf8().ok().as_deref() {
            Some("op") => match field {
                Value::String(text) => operation = text.to_utf8().ok(),
                _ => return Err(fail("WIRE_REQUEST", "Operation name must be a string")),
            },
            Some("value") => {
                value = Some(field);
                has_value = true;
            }
            Some("seed") => match field {
                Value::Number(number)
                    if number.is_finite()
                        && number.fract() == 0.0
                        && number >= i32::MIN as f64
                        && number <= i32::MAX as f64 =>
                {
                    seed = number as i32
                }
                _ => return Err(fail("WIRE_REQUEST", "Seed must be a signed 32-bit integer")),
            },
            _ => return Err(fail("WIRE_REQUEST", "Unknown request field")),
        }
    }
    if operation.as_deref() != Some("delta/sparkStringHash") {
        return Err(fail("WIRE_OPERATION", "Unsupported operation"));
    }
    if !has_value {
        return Err(fail("WIRE_REQUEST", "Missing value"));
    }
    let text = match value.unwrap() {
        Value::Null => None,
        Value::String(text) => Some(
            text.to_utf8()
                .map_err(|_| fail("WIRE_REQUEST", "Hash value is not valid UTF-8"))?,
        ),
        _ => return Err(fail("WIRE_REQUEST", "Hash value must be a string or null")),
    };
    let hash = spark_string_hash(text.as_deref(), seed);
    Ok(Value::Object(vec![(
        Utf16::from("hash"),
        Value::Number(hash as f64),
    )]))
}

fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

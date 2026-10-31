// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged transport for the explicit RFC3339 exact-instant profile.
use umf_core::{Context, EngineError, Utf16, Value, rfc3339_exact_instant};

use crate::{decode, encode, fail, field, result_envelope};

pub fn execute_rfc3339_exact_instant_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_rfc3339_exact_instant_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_rfc3339_exact_instant_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut context)?;
        let op = match field(&request, "op") {
            Some(Value::String(op)) => op.to_utf8().ok(),
            _ => None,
        };
        let args = field(&request, "args")
            .ok_or_else(|| fail("REQUEST", "RFC3339 exact instant arguments are required"))?;
        match op.as_deref() {
            Some("parseRfc3339ExactInstant") => {
                let token =
                    field(args, "token").ok_or_else(|| fail("REQUEST", "token is required"))?;
                let parsed = rfc3339_exact_instant::parse_rfc3339_exact_instant(token)
                    .map_err(temporal_error)?;
                encode(
                    &Value::Object(vec![
                        (Utf16::from("profile"), Value::string_utf8(parsed.profile())),
                        (
                            Utf16::from("originalText"),
                            Value::String(parsed.original_text().clone()),
                        ),
                        (
                            Utf16::from("utcSeconds"),
                            Value::string_utf8(parsed.utc_seconds()),
                        ),
                        (
                            Utf16::from("fractionalDigits"),
                            Value::string_utf8(parsed.fractional_digits()),
                        ),
                        (
                            Utf16::from("originalOffset"),
                            Value::string_utf8(parsed.original_offset()),
                        ),
                        (
                            Utf16::from("localOffsetKnown"),
                            Value::Bool(parsed.local_offset_known()),
                        ),
                    ]),
                    &mut context,
                )
            }
            Some("sameRfc3339ExactInstant") => {
                let left =
                    field(args, "left").ok_or_else(|| fail("REQUEST", "left is required"))?;
                let right =
                    field(args, "right").ok_or_else(|| fail("REQUEST", "right is required"))?;
                let same = rfc3339_exact_instant::same_rfc3339_exact_instant(left, right)
                    .map_err(temporal_error)?;
                encode(&Value::Bool(same), &mut context)
            }
            _ => Err(fail("REQUEST", "Unknown RFC3339 exact instant operation")),
        }
    })();
    result_envelope(result)
}

fn temporal_error(error: rfc3339_exact_instant::Rfc3339ExactInstantError) -> EngineError {
    let code = if error.name() == "TypeError" {
        "TYPE_ERROR"
    } else {
        "RANGE_ERROR"
    };
    fail(code, error.message())
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged-value boundary for the explicit Gregorian civil-date profile.
//! This is not a raw JavaScript host-value adapter or default route.
use umf_core::{Context, EngineError, Utf16, Value, gregorian_date};

use crate::{decode, encode, fail, field, result_envelope};

pub fn execute_gregorian_date_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_gregorian_date_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_gregorian_date_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut context)?;
        let operation = match field(&request, "op") {
            Some(Value::String(text)) => text
                .to_utf8()
                .map_err(|_| fail("REQUEST", "Gregorian date operation must be valid UTF-16"))?,
            _ => return Err(fail("REQUEST", "Gregorian date operation is required")),
        };
        let args = field(&request, "args")
            .ok_or_else(|| fail("REQUEST", "Gregorian date arguments are required"))?;
        let token = field(args, "token").ok_or_else(|| fail("REQUEST", "token is required"))?;
        let value = match operation.as_str() {
            "parseGregorianDate" => match gregorian_date::parse_gregorian_date(token) {
                Ok(date) => Value::Object(vec![
                    ("profile".into(), Value::string_utf8(date.profile())),
                    (
                        "originalText".into(),
                        Value::String(date.original_text().clone()),
                    ),
                    ("year".into(), Value::Number(f64::from(date.year()))),
                    ("month".into(), Value::Number(f64::from(date.month()))),
                    ("day".into(), Value::Number(f64::from(date.day()))),
                ]),
                Err(error) => return Err(date_error(error)),
            },
            "truncateGregorianDate" => {
                let unit =
                    field(args, "unit").ok_or_else(|| fail("REQUEST", "unit is required"))?;
                match gregorian_date::truncate_gregorian_date(token, unit) {
                    Ok(text) => Value::String(text),
                    Err(error) => return Err(date_error(error)),
                }
            }
            _ => return Err(fail("REQUEST", "Unknown Gregorian date operation")),
        };
        encode(&value, &mut context)
    })();
    result_envelope(result)
}

fn date_error(error: gregorian_date::GregorianDateError) -> EngineError {
    let code = if error.name() == "TypeError" {
        "TYPE_ERROR"
    } else {
        "RANGE_ERROR"
    };
    EngineError::new(code, Utf16::default(), error.message())
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged boundary for CONTRACT-075 access temporal token parsing.
use umf_core::{Context, EngineError, Utf16, Value, access_temporal};

use crate::{decode, encode, fail, field, result_envelope};

pub fn execute_access_temporal_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_access_temporal_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_access_temporal_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut context)?;
        match field(&request, "op") {
            Some(Value::String(op)) if op == &Utf16::from("parseAccessTemporal") => {}
            _ => return Err(fail("REQUEST", "parseAccessTemporal operation is required")),
        }
        let args = field(&request, "args")
            .ok_or_else(|| fail("REQUEST", "Access temporal arguments are required"))?;
        let kind = field(args, "kind").ok_or_else(|| fail("REQUEST", "kind is required"))?;
        let token = field(args, "token").ok_or_else(|| fail("REQUEST", "token is required"))?;
        let parsed = access_temporal::parse_access_temporal(kind, token).map_err(|error| {
            let code = if error.name() == "TypeError" {
                "TYPE_ERROR"
            } else {
                "RANGE_ERROR"
            };
            fail(code, error.message())
        })?;
        let mut members = vec![
            ("profile".into(), Value::string_utf8(parsed.profile)),
            ("kind".into(), Value::string_utf8(parsed.kind)),
            ("originalText".into(), Value::String(parsed.original_text)),
            (
                "canonicalText".into(),
                Value::string_utf8(parsed.canonical_text),
            ),
        ];
        if let Some(microsecond) = parsed.microsecond {
            members.push(("microsecond".into(), Value::Number(f64::from(microsecond))));
        }
        if let Some(utc_seconds) = parsed.utc_seconds {
            members.push(("utcSeconds".into(), Value::string_utf8(utc_seconds)));
        }
        if let Some(original_offset) = parsed.original_offset {
            members.push(("originalOffset".into(), Value::string_utf8(original_offset)));
        }
        encode(&Value::Object(members), &mut context)
    })();
    result_envelope(result)
}

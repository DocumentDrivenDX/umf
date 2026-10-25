// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged transport for TypeScript-compatible exact JSON number checks.
use umf_core::{Context, EngineError, Value, json_number};

use crate::{decode, encode, fail, field, result_envelope};

pub const JSON_NUMBER_PROFILE: &str = "umf-json-number/0.1";

pub fn execute_json_number_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_json_number_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_json_number_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut context)?;
        let profile = field(&request, "profile").and_then(|value| match value {
            Value::String(value) => value.to_utf8().ok(),
            _ => None,
        });
        if profile.as_deref() != Some(JSON_NUMBER_PROFILE) {
            return Err(fail("REQUEST", "umf-json-number/0.1 profile is required"));
        }
        let operation = field(&request, "op").and_then(|value| match value {
            Value::String(value) => value.to_utf8().ok(),
            _ => None,
        });
        if operation.as_deref() != Some("assertExactJsonNumber") {
            return Err(fail("REQUEST", "Unknown exact JSON number operation"));
        }
        let args = field(&request, "args")
            .ok_or_else(|| fail("REQUEST", "Exact JSON number arguments are required"))?;
        let token = field(args, "token")
            .and_then(|value| match value {
                Value::String(value) => Some(value),
                _ => None,
            })
            .ok_or_else(|| fail("REQUEST", "token must be a tagged string"))?;
        json_number::assert_exact_json_number(token, &mut context)?;
        // The TypeScript operation returns void; tagged wire represents it as null.
        encode(&Value::Null, &mut context)
    })();
    result_envelope(result)
}

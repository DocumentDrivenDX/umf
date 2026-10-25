// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in wire boundary for the bounded shared security truth operators.

use umf_core::{Context, EngineError, Value, security_logic};

use crate::{decode, encode, fail, field, result_envelope};

/// Execute one security truth operation using `umf.core-wire/1` tagged values.
/// This operation performs no policy selection or host authorization.
pub fn execute_security_logic_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_security_logic_wire_with_control(wire_json, &mut no_control)
}

/// Execute a security truth operation with cumulative invocation work control.
pub fn execute_security_logic_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut context)?;
        let operation = match field(&request, "op") {
            Some(Value::String(text)) => text
                .to_utf8()
                .map_err(|_| fail("REQUEST", "Security operation must be valid UTF-16"))?,
            _ => return Err(fail("REQUEST", "Security operation is required")),
        };
        let args = field(&request, "args")
            .ok_or_else(|| fail("REQUEST", "Security arguments are required"))?;
        let result = match operation.as_str() {
            "securityNot" => security_logic::security_not(
                field(args, "value").ok_or_else(|| fail("REQUEST", "value is required"))?,
            )?,
            "securityRefIdentity" => security_logic::security_ref_identity(
                field(args, "ref").ok_or_else(|| fail("REQUEST", "ref is required"))?,
                &mut context,
            )?,
            "securityAnd" => security_logic::security_and(
                field(args, "values").ok_or_else(|| fail("REQUEST", "values are required"))?,
                &mut context,
            )?,
            "securityOr" => security_logic::security_or(
                field(args, "values").ok_or_else(|| fail("REQUEST", "values are required"))?,
                &mut context,
            )?,
            "composeSecurityRules" => {
                let rules =
                    field(args, "rules").ok_or_else(|| fail("REQUEST", "rules are required"))?;
                let protected = field(args, "protectedFields")
                    .cloned()
                    .unwrap_or_else(|| Value::Array(vec![]));
                let input = Value::Object(vec![
                    ("rules".into(), rules.clone()),
                    ("protectedFields".into(), protected),
                ]);
                security_logic::compose_security_rules(&input, &mut context)?
            }
            _ => return Err(fail("REQUEST", "Unknown security truth operation")),
        };
        encode(&result, &mut context)
    })();
    result_envelope(result)
}

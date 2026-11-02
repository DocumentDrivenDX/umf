// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in wire boundary for the bounded shared security truth operators.

use umf_core::{Context, EngineError, Utf16, Value, security_logic};

use crate::{decode, encode, fail, field, result_envelope};

pub const SECURITY_LOGIC_PROFILE: &str = "umf.security-logic/1.0.0";

/// Execute the scalar CONTRACT-062 negation without the generic JSON wire.
/// The host admits the raw value before calling this function; Rust still
/// validates the token, owns the truth decision, and charges operation work.
pub fn execute_security_not_scalar_with_control(
    value: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        context.charge_work(1, Utf16::default())?;
        let input = Value::String(Utf16::from(value));
        let output = security_logic::security_not(&input)?;
        let Value::String(output) = output else {
            return Err(fail("SECURITY_TRUTH", "Invalid security truth"));
        };
        output
            .to_utf8()
            .map_err(|_| fail("SECURITY_TRUTH", "Invalid security truth"))
    })();
    match result {
        Ok(value) => value,
        Err(error) => result_envelope(Err(error)),
    }
}

pub fn execute_security_not_scalar(value: &str) -> String {
    execute_security_not_scalar_with_control(value, &mut |_amount| Ok(()))
}

fn exact_members(value: &Value, required: &[&str], allowed: &[&str]) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail(
            "REQUEST",
            "Security request members must be an object",
        ));
    };
    for (index, (key, _)) in fields.iter().enumerate() {
        if !allowed.iter().any(|name| key == &Utf16::from(*name))
            || fields[..index].iter().any(|(prior, _)| prior == key)
        {
            return Err(fail(
                "REQUEST",
                "Unknown or duplicate security request member",
            ));
        }
    }
    if required.iter().any(|name| field(value, name).is_none()) {
        return Err(fail(
            "REQUEST",
            "Required security request member is missing",
        ));
    }
    Ok(())
}

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
        exact_members(
            &request,
            &["profile", "op", "args"],
            &["profile", "op", "args"],
        )?;
        if field(&request, "profile") != Some(&Value::string_utf8(SECURITY_LOGIC_PROFILE)) {
            return Err(fail("REQUEST", "Unsupported security logic profile"));
        }
        let operation = match field(&request, "op") {
            Some(Value::String(text)) => text
                .to_utf8()
                .map_err(|_| fail("REQUEST", "Security operation must be valid UTF-16"))?,
            _ => return Err(fail("REQUEST", "Security operation is required")),
        };
        let args = field(&request, "args")
            .ok_or_else(|| fail("REQUEST", "Security arguments are required"))?;
        let (required, allowed): (&[&str], &[&str]) = match operation.as_str() {
            "securityNot" => (&["value"], &["value"]),
            "securityRefIdentity" => (&["ref"], &["ref"]),
            "securityAnd" | "securityOr" => (&["values"], &["values"]),
            "composeSecurityRules" => (&["rules"], &["rules", "protectedFields"]),
            _ => return Err(fail("REQUEST", "Unknown security truth operation")),
        };
        exact_members(args, required, allowed)?;
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

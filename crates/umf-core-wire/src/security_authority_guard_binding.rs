// SPDX-License-Identifier: MIT OR Apache-2.0
//! Stateful wire bridge for Rust-owned authority-guard generations.
use umf_core::{
    security_authority_guard::SecurityAuthorityGuardState, Context, EngineError, Utf16, Value,
};

use crate::{decode, encode, fail, field, result_envelope};

pub const SECURITY_AUTHORITY_GUARD_PROFILE: &str = "umf.security-authority-guard/1";

pub struct Session {
    guard: Option<SecurityAuthorityGuardState>,
}
impl Session {
    pub fn new() -> Self {
        Self { guard: None }
    }
}

pub fn busy_session_envelope() -> String {
    result_envelope(Err(fail(
        "SECURITY_SESSION_BUSY",
        "Security authority guard session is busy",
    )))
}

pub fn execute_security_authority_guard_wire_with_session(
    session: &mut Session,
    wire_json: &str,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary();
        let request = decode(wire_json, &mut context)?;
        if text(field(&request, "profile"))? != SECURITY_AUTHORITY_GUARD_PROFILE {
            return Err(fail(
                "REQUEST",
                "Security authority guard profile is required",
            ));
        }
        let op = text(field(&request, "op"))?;
        let output = match op.as_str() {
            "initialize" => {
                closed(&request, &["profile", "op", "generation"])?;
                if session.guard.is_some() {
                    return Err(fail(
                        "SECURITY_GUARD_REFUSED",
                        "Authority guard unavailable",
                    ));
                }
                let Value::String(generation) = required(&request, "generation")? else {
                    return Err(fail(
                        "SECURITY_GUARD_REFUSED",
                        "Authority guard unavailable",
                    ));
                };
                session.guard = Some(SecurityAuthorityGuardState::new(generation, &mut context)?);
                Ok(object([("initialized", Value::Bool(true))]))
            }
            "beginRead" => {
                closed(&request, &["profile", "op"])?;
                let generation = session
                    .guard
                    .as_ref()
                    .ok_or_else(|| fail("SECURITY_GUARD_REFUSED", "Authority guard unavailable"))?
                    .begin_read(&mut context)?;
                Ok(object([("generation", Value::String(generation))]))
            }
            "beginChange" => {
                closed(&request, &["profile", "op", "generation"])?;
                let Value::String(generation) = required(&request, "generation")? else {
                    return Err(fail(
                        "SECURITY_GUARD_REFUSED",
                        "Authority guard unavailable",
                    ));
                };
                let token = session
                    .guard
                    .as_mut()
                    .ok_or_else(|| fail("SECURITY_GUARD_REFUSED", "Authority guard unavailable"))?
                    .begin_change(generation, &mut context)?;
                Ok(object([("token", Value::Number(token as f64))]))
            }
            "completeChange" => {
                closed(&request, &["profile", "op", "token", "committed"])?;
                let token = match required(&request, "token")? {
                    Value::Number(value)
                        if value.is_finite()
                            && value.fract() == 0.0
                            && *value >= 1.0
                            && *value <= 1024.0 =>
                    {
                        *value as u64
                    }
                    _ => {
                        return Err(fail(
                            "SECURITY_GUARD_REFUSED",
                            "Authority guard completion receipt is invalid",
                        ))
                    }
                };
                let committed = match required(&request, "committed")? {
                    Value::Bool(value) => *value,
                    _ => {
                        return Err(fail(
                            "SECURITY_GUARD_REFUSED",
                            "Authority guard completion outcome is invalid",
                        ))
                    }
                };
                session
                    .guard
                    .as_mut()
                    .ok_or_else(|| fail("SECURITY_GUARD_REFUSED", "Authority guard unavailable"))?
                    .complete_change(token, committed, &mut context)?;
                Ok(object([("completed", Value::Bool(true))]))
            }
            "close" => {
                closed(&request, &["profile", "op"])?;
                session
                    .guard
                    .as_mut()
                    .ok_or_else(|| fail("SECURITY_GUARD_REFUSED", "Authority guard unavailable"))?
                    .close();
                Ok(object([("closed", Value::Bool(true))]))
            }
            _ => Err(fail(
                "REQUEST",
                "Unknown Security authority guard operation",
            )),
        }?;
        encode(&output, &mut context)
    })();
    result_envelope(result)
}

fn text(value: Option<&Value>) -> Result<String, EngineError> {
    match value {
        Some(Value::String(value)) => value
            .to_utf8()
            .map_err(|_| fail("REQUEST", "Expected valid UTF-8 text")),
        _ => Err(fail("REQUEST", "Expected text")),
    }
}
fn required<'a>(value: &'a Value, name: &str) -> Result<&'a Value, EngineError> {
    field(value, name).ok_or_else(|| {
        fail(
            "REQUEST",
            "Required Security authority guard member is missing",
        )
    })
}
fn closed(value: &Value, expected: &[&str]) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail(
            "REQUEST",
            "Security authority guard request must be an object",
        ));
    };
    if fields.len() != expected.len()
        || expected
            .iter()
            .any(|key| !fields.iter().any(|(name, _)| name == &Utf16::from(*key)))
    {
        return Err(fail(
            "REQUEST",
            "Closed Security authority guard request required",
        ));
    }
    Ok(())
}
fn object(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

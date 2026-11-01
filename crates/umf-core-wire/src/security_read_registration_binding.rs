// SPDX-License-Identifier: MIT OR Apache-2.0
//! Stateful registration and evaluation transport for native Security reads.
use umf_core::{
    security_read_registration::SecurityReadRegistration, Context, EngineError, Utf16, Value,
};

use crate::{decode, encode, fail, field, result_envelope};

pub const SECURITY_READ_REGISTRATION_PROFILE: &str = "umf.security-read-registration/1";

pub struct Session {
    registration: SecurityReadRegistration,
}

pub fn busy_session_envelope() -> String {
    result_envelope(Err(fail(
        "SECURITY_SESSION_BUSY",
        "Security registration session is busy",
    )))
}
impl Default for Session {
    fn default() -> Self {
        Self::new()
    }
}
impl Session {
    pub fn new() -> Self {
        Self {
            registration: SecurityReadRegistration::new(),
        }
    }
}

pub fn execute_security_read_registration_wire_with_session(
    session: &mut Session,
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut context)?;
        if text(field(&request, "profile"))? != SECURITY_READ_REGISTRATION_PROFILE {
            return Err(fail(
                "REQUEST",
                "Security read registration profile is required",
            ));
        }
        let op = text(field(&request, "op"))?;
        let output = match op.as_str() {
            "register" => {
                closed(&request, &["profile", "op", "policy", "resolution"])?;
                session.registration.register(
                    required(&request, "policy")?,
                    required(&request, "resolution")?,
                    &mut context,
                )
            }
            "evaluate" => {
                closed(&request, &["profile", "op", "handle", "cut", "request"])?;
                let handle = match required(&request, "handle")? {
                    Value::Number(number)
                        if number.is_finite()
                            && number.fract() == 0.0
                            && *number >= 1.0
                            && *number <= u64::MAX as f64 =>
                    {
                        *number as u64
                    }
                    _ => return Err(fail("REQUEST", "Security registration handle is invalid")),
                };
                session.registration.evaluate(
                    handle,
                    required(&request, "cut")?,
                    required(&request, "request")?,
                    &mut context,
                )
            }
            _ => Err(fail(
                "REQUEST",
                "Unknown Security read registration operation",
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
            "Required Security registration member is missing",
        )
    })
}
fn closed(value: &Value, expected: &[&str]) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail(
            "REQUEST",
            "Security registration request must be an object",
        ));
    };
    if fields.len() != expected.len()
        || expected
            .iter()
            .any(|key| !fields.iter().any(|(name, _)| name == &Utf16::from(*key)))
    {
        return Err(fail(
            "REQUEST",
            "Closed Security registration request required",
        ));
    }
    Ok(())
}

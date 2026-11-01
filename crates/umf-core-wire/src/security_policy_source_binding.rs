// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed tagged transport for Security policy source and migration operations.

use umf_core::{serialization::Format, Context, EngineError, Utf16, Value};

use crate::{decode, encode, fail, field, result_envelope};

pub const SECURITY_POLICY_SOURCE_PROFILE: &str = "umf.security-policy-source/1";

pub fn execute_security_policy_source_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_security_policy_source_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_security_policy_source_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut context)?;
        if text(field(&request, "profile"))? != SECURITY_POLICY_SOURCE_PROFILE {
            return Err(fail(
                "REQUEST",
                "Security policy source profile is required",
            ));
        }
        let op = text(field(&request, "op"))?;
        let output = match op.as_str() {
            "inspectV2" => {
                closed(&request, &["profile", "op", "source"])?;
                let source = required(&request, "source")?;
                umf_core::security_policy_source::inspect_security_policy_v2(source, &mut context)
            }
            "upgrade" | "downgrade" => {
                closed(&request, &["profile", "op", "source", "revision"])?;
                let source = required(&request, "source")?;
                let revision = required(&request, "revision")?;
                if op == "upgrade" {
                    umf_core::security_policy_source::upgrade_security_policy_source(
                        source,
                        revision,
                        &mut context,
                    )
                } else {
                    umf_core::security_policy_source::downgrade_security_policy_source(
                        source,
                        revision,
                        &mut context,
                    )
                }
            }
            "read" => {
                closed(&request, &["profile", "op", "source", "format"])?;
                let source = match required(&request, "source")? {
                    Value::String(source) => source,
                    _ => return Err(fail("REQUEST", "Security source text is required")),
                };
                let format = format(field(&request, "format"))?;
                let result = umf_core::security_policy_source::read_security_source(
                    source.units(),
                    format,
                    &mut context,
                )?;
                Ok(object([("value", result)]))
            }
            "write" => {
                closed(&request, &["profile", "op", "value", "format"])?;
                let value = required(&request, "value")?;
                let format = format(field(&request, "format"))?;
                let result = umf_core::security_policy_source::write_security_source(
                    value,
                    format,
                    &mut context,
                )?;
                Ok(object([("text", Value::String(result))]))
            }
            _ => Err(fail("REQUEST", "Unknown security policy source operation")),
        }?;
        encode(&output, &mut context)
    })();
    result_envelope(result)
}

fn format(value: Option<&Value>) -> Result<Format, EngineError> {
    match value {
        None => Ok(Format::Json),
        Some(Value::String(value)) if value == &Utf16::from("json") => Ok(Format::Json),
        Some(Value::String(value)) if value == &Utf16::from("yaml") => Ok(Format::Yaml),
        _ => Err(fail("REQUEST", "format must be json or yaml")),
    }
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
    field(value, name).ok_or_else(|| fail("REQUEST", "Required security source member missing"))
}
fn object(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn closed(value: &Value, expected: &[&str]) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail("REQUEST", "Security source request must be an object"));
    };
    if fields.len() != expected.len()
        || expected
            .iter()
            .any(|key| !fields.iter().any(|(name, _)| name == &Utf16::from(*key)))
    {
        return Err(fail("REQUEST", "Closed security source request required"));
    }
    Ok(())
}

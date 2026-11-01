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
            "evaluateAccess" => {
                closed(
                    &request,
                    &[
                        "profile",
                        "op",
                        "policy",
                        "resolution",
                        "cut",
                        "request",
                        "resource",
                    ],
                )?;
                umf_core::security_evaluation::evaluate_security_access(
                    required(&request, "policy")?,
                    required(&request, "resolution")?,
                    required(&request, "cut")?,
                    required(&request, "request")?,
                    required(&request, "resource")?,
                    &mut context,
                )
            }
            "evaluateCollection" => {
                closed(
                    &request,
                    &["profile", "op", "policy", "resolution", "cut", "request"],
                )?;
                umf_core::security_evaluation::evaluate_security_collection(
                    required(&request, "policy")?,
                    required(&request, "resolution")?,
                    required(&request, "cut")?,
                    required(&request, "request")?,
                    &mut context,
                )
            }
            "evaluateWrite" => {
                closed(
                    &request,
                    &[
                        "profile",
                        "op",
                        "policy",
                        "resolution",
                        "writeProfile",
                        "request",
                    ],
                )?;
                umf_core::security_evaluation::evaluate_security_write(
                    required(&request, "policy")?,
                    required(&request, "resolution")?,
                    required(&request, "writeProfile")?,
                    required(&request, "request")?,
                    &mut context,
                )
            }
            "evaluateV2LegacyAccess" => {
                closed(
                    &request,
                    &[
                        "profile",
                        "op",
                        "source",
                        "resolution",
                        "cut",
                        "request",
                        "resource",
                    ],
                )?;
                umf_core::security_evaluation::evaluate_security_policy_v2_legacy_access(
                    required(&request, "source")?,
                    required(&request, "resolution")?,
                    required(&request, "cut")?,
                    required(&request, "request")?,
                    required(&request, "resource")?,
                    &mut context,
                )
            }
            "inspectV1" => {
                closed_optional(
                    &request,
                    &["profile", "op", "source", "resolution"],
                    &["profile", "op", "source"],
                )?;
                umf_core::security_policy::inspect_security_policy(
                    required(&request, "source")?,
                    field(&request, "resolution"),
                    &mut context,
                )
            }
            "inspectActionPurposes" => {
                closed(&request, &["profile", "op", "ontology", "documents"])?;
                umf_core::security_policy::inspect_security_action_purposes(
                    required(&request, "ontology")?,
                    required(&request, "documents")?,
                    &mut context,
                )
            }
            "inspectProtectionObligations" => {
                closed(
                    &request,
                    &["profile", "op", "policy", "catalog", "closure", "ontology"],
                )?;
                umf_core::security_policy::inspect_protection_obligations(
                    required(&request, "policy")?,
                    required(&request, "catalog")?,
                    required(&request, "closure")?,
                    required(&request, "ontology")?,
                    &mut context,
                )
            }
            "requireV1" => {
                closed(&request, &["profile", "op", "source", "resolution"])?;
                Ok(umf_core::security_policy::require_security_interpretation(
                    required(&request, "source")?,
                    required(&request, "resolution")?,
                    &mut context,
                )?)
            }
            "dependencies" => {
                closed(&request, &["profile", "op", "source", "resolution"])?;
                umf_core::security_policy::security_policy_dependencies(
                    required(&request, "source")?,
                    required(&request, "resolution")?,
                    &mut context,
                )
            }
            "identityTransportDependencies" => {
                closed(&request, &["profile", "op", "source", "resolution"])?;
                umf_core::security_policy::security_identity_transport_dependencies(
                    required(&request, "source")?,
                    required(&request, "resolution")?,
                    &mut context,
                )
            }
            "validateDisclosure" => {
                closed(
                    &request,
                    &["profile", "op", "batch", "policy", "resolution"],
                )?;
                umf_core::security_disclosure::validate_security_disclosure(
                    required(&request, "batch")?,
                    required(&request, "policy")?,
                    required(&request, "resolution")?,
                    &mut context,
                )
            }
            "encodeDisclosure" => {
                closed(
                    &request,
                    &["profile", "op", "batch", "policy", "resolution"],
                )?;
                let text = umf_core::security_disclosure::encode_security_disclosure(
                    required(&request, "batch")?,
                    required(&request, "policy")?,
                    required(&request, "resolution")?,
                    &mut context,
                )?;
                Ok(object([("text", text)]))
            }
            "decodeDisclosure" => {
                closed(
                    &request,
                    &["profile", "op", "source", "policy", "resolution"],
                )?;
                let source = match required(&request, "source")? {
                    Value::String(source) => source,
                    _ => {
                        return Err(fail(
                            "REQUEST",
                            "Security disclosure source text is required",
                        ))
                    }
                };
                umf_core::security_disclosure::decode_security_disclosure(
                    source,
                    required(&request, "policy")?,
                    required(&request, "resolution")?,
                    &mut context,
                )
            }
            "inspectDisclosureV2" => {
                closed(
                    &request,
                    &["profile", "op", "source", "policy", "catalog", "closure"],
                )?;
                umf_core::security_disclosure_v2::inspect_security_disclosure_v2(
                    required(&request, "source")?,
                    required(&request, "policy")?,
                    required(&request, "catalog")?,
                    required(&request, "closure")?,
                    &mut context,
                )
            }
            "encodeDisclosureV2" => {
                closed(
                    &request,
                    &[
                        "profile", "op", "source", "policy", "catalog", "closure", "format",
                    ],
                )?;
                let output = umf_core::security_disclosure_v2::encode_security_disclosure_v2(
                    required(&request, "source")?,
                    required(&request, "policy")?,
                    required(&request, "catalog")?,
                    required(&request, "closure")?,
                    format(field(&request, "format"))?,
                    &mut context,
                )?;
                Ok(object([("text", output)]))
            }
            "decodeDisclosureV2" => {
                closed(
                    &request,
                    &[
                        "profile", "op", "source", "policy", "catalog", "closure", "format",
                    ],
                )?;
                let source = match required(&request, "source")? {
                    Value::String(source) => source,
                    _ => {
                        return Err(fail(
                            "REQUEST",
                            "Security disclosure source text is required",
                        ))
                    }
                };
                umf_core::security_disclosure_v2::decode_security_disclosure_v2(
                    source,
                    required(&request, "policy")?,
                    required(&request, "catalog")?,
                    required(&request, "closure")?,
                    format(field(&request, "format"))?,
                    &mut context,
                )
            }
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

fn closed_optional(value: &Value, allowed: &[&str], required: &[&str]) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail("REQUEST", "Security source request must be an object"));
    };
    if fields.len() < required.len()
        || fields.len() > allowed.len()
        || fields.iter().enumerate().any(|(index, (name, _))| {
            !allowed.iter().any(|key| name == &Utf16::from(*key))
                || fields[..index].iter().any(|(prior, _)| prior == name)
        })
        || required.iter().any(|key| field(value, key).is_none())
    {
        return Err(fail("REQUEST", "Closed security source request required"));
    }
    Ok(())
}

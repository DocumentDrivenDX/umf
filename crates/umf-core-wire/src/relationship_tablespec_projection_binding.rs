// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed tagged-wire owner for authored core relationship projection to Avro.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Utf16};
pub const PROFILE: &str = "umf.relationship-tablespec-projection-binding/1.0.0";
fn request_error(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn closed(
    value: &umf_core::Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let umf_core::Value::Object(members) = value else {
        return Err(request_error(
            "Relationship TableSpec request must be an object",
        ));
    };
    for (i, (key, _)) in members.iter().enumerate() {
        ctx.charge_work(key.len() + 1, Utf16::default())?;
        if !allowed.iter().any(|n| key == &Utf16::from(*n)) {
            return Err(request_error(
                "Relationship TableSpec request has an unknown member",
            ));
        }
        if members[..i].iter().any(|(prior, _)| prior == key) {
            return Err(request_error(
                "Relationship TableSpec request has a duplicate member",
            ));
        }
    }
    Ok(())
}
// Fixed schemas are prepared in one admitted cold lifetime. Caller data,
// counters and limits stay on this Context; no cross-call input cache exists.
pub fn execute_wire(wire: &str) -> String {
    execute_wire_context(wire, &mut Context::ordinary(), true)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    execute_wire_context(wire, &mut Context::ordinary().with_host_control(control), false)
}

fn execute_wire_context(wire: &str, ctx: &mut Context<'_>, owned: bool) -> String {
    let run = |ctx: &mut Context<'_>| -> Result<_, EngineError> {
        let request = decode(wire, ctx)?;
        if text_field(&request, "profile").as_deref() != Some(PROFILE) {
            return Err(request_error(
                "Relationship TableSpec projection profile is required",
            ));
        }
        let op =
            text_field(&request, "op").ok_or_else(|| request_error("Operation is required"))?;
        let op = op
            .strip_prefix("relationship-tablespec-projection.")
            .unwrap_or(&op);
        let allowed = match op {
            "projectRelationshipToTableSpec" => &[
                "profile",
                "op",
                "source",
                "author",
                "nativeSource",
                "nativeTarget",
                "request",
            ][..],
            "verifyRelationshipTableSpecProjection"
            | "recoverRelationshipTableSpecIdeal"
            | "recoverRelationshipTableSpecNativeSources" => {
                &["profile", "op", "receipt", "current"][..]
            }
            _ => {
                return Err(request_error(
                    "Unknown Relationship TableSpec projection operation",
                ))
            }
        };
        closed(&request, allowed, ctx)?;
        let output = match op {
            "projectRelationshipToTableSpec" => {
                umf_core::relationship_tablespec_projection::project_relationship_to_tablespec(
                    field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                    field(&request, "author").ok_or_else(|| request_error("author is required"))?,
                    field(&request, "nativeSource").ok_or_else(|| request_error("nativeSource is required"))?,
                    field(&request, "nativeTarget").ok_or_else(|| request_error("nativeTarget is required"))?,
                    field(&request, "request").ok_or_else(|| request_error("request is required"))?,
                    ctx,
                )?
            }
            "verifyRelationshipTableSpecProjection" => {
                umf_core::relationship_tablespec_projection::verify_relationship_tablespec_projection(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            "recoverRelationshipTableSpecIdeal" => {
                umf_core::relationship_tablespec_projection::recover_relationship_tablespec_ideal(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            "recoverRelationshipTableSpecNativeSources" => {
                umf_core::relationship_tablespec_projection::recover_relationship_tablespec_native_sources(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            _ => {
                return Err(request_error(
                    "Unknown Relationship TableSpec projection operation",
                ))
            }
        };
        encode(&output, ctx)
        };
    let result = if owned { ctx.with_codegen_construction(run) } else { run(ctx) };
    result_envelope(result)
}

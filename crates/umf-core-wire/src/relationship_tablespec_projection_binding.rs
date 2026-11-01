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
pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire, &mut ctx)?;
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
        closed(&request, allowed, &mut ctx)?;
        let output = match op {
            "projectRelationshipToTableSpec" => {
                umf_core::relationship_tablespec_projection::project_relationship_to_tablespec(
                    field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                    field(&request, "author").ok_or_else(|| request_error("author is required"))?,
                    field(&request, "nativeSource").ok_or_else(|| request_error("nativeSource is required"))?,
                    field(&request, "nativeTarget").ok_or_else(|| request_error("nativeTarget is required"))?,
                    field(&request, "request").ok_or_else(|| request_error("request is required"))?,
                    &mut ctx,
                )?
            }
            "verifyRelationshipTableSpecProjection" => {
                umf_core::relationship_tablespec_projection::verify_relationship_tablespec_projection(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            "recoverRelationshipTableSpecIdeal" => {
                umf_core::relationship_tablespec_projection::recover_relationship_tablespec_ideal(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            "recoverRelationshipTableSpecNativeSources" => {
                umf_core::relationship_tablespec_projection::recover_relationship_tablespec_native_sources(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            _ => {
                return Err(request_error(
                    "Unknown Relationship TableSpec projection operation",
                ))
            }
        };
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed wire owner for authored Relationship projections to GraphQL, RDF and LinkML.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf.relationship-extra-projection-binding/1.0.0";
fn request_error(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn required<'a>(value: &'a Value, name: &str) -> Result<&'a Value, EngineError> {
    field(value, name).ok_or_else(|| request_error("Required request member is missing"))
}
fn closed(value: &Value, allowed: &[&str], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Object(members) = value else {
        return Err(request_error(
            "Relationship Extra request must be an object",
        ));
    };
    for (i, (key, _)) in members.iter().enumerate() {
        ctx.charge_work(key.len() + 1, Utf16::default())?;
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) {
            return Err(request_error(
                "Relationship Extra request has an unknown member",
            ));
        }
        if members[..i].iter().any(|(prior, _)| prior == key) {
            return Err(request_error(
                "Relationship Extra request has a duplicate member",
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
                "Relationship Extra projection profile is required",
            ));
        }
        let op =
            text_field(&request, "op").ok_or_else(|| request_error("Operation is required"))?;
        let op = op
            .strip_prefix("relationship-extra-projection.")
            .unwrap_or(&op);
        let allowed = match op {
            "prepareRelationshipToExtra" => &["profile", "op", "source", "author", "request"][..],
            "completeRelationshipToExtra" => &["profile", "op", "prepared", "target"][..],
            "classifyRelationshipExtra" => &["profile", "op", "source", "request", "fresh"][..],
            "verifyRelationshipExtra"
            | "recoverRelationshipExtraIdeal"
            | "recoverRelationshipExtraNative" => {
                &["profile", "op", "receipt", "fresh", "current"][..]
            }
            _ => {
                return Err(request_error(
                    "Unknown Relationship Extra projection operation",
                ))
            }
        };
        closed(&request, allowed, &mut ctx)?;
        let output = match op {
            "prepareRelationshipToExtra" => {
                umf_core::relationship_extra_projection::prepare_relationship_to_extra(
                    required(&request, "source")?,
                    required(&request, "author")?,
                    required(&request, "request")?,
                    &mut ctx,
                )?
            }
            "completeRelationshipToExtra" => {
                umf_core::relationship_extra_projection::complete_relationship_to_extra(
                    required(&request, "prepared")?,
                    required(&request, "target")?,
                    &mut ctx,
                )?
            }
            "classifyRelationshipExtra" => {
                umf_core::relationship_extra_projection::classify_relationship_extra(
                    required(&request, "source")?,
                    required(&request, "request")?,
                    required(&request, "fresh")?,
                    &mut ctx,
                )?
            }
            "verifyRelationshipExtra" => {
                umf_core::relationship_extra_projection::verify_relationship_extra(
                    required(&request, "receipt")?,
                    required(&request, "fresh")?,
                    field(&request, "current"),
                    &mut ctx,
                )?
            }
            "recoverRelationshipExtraIdeal" => {
                umf_core::relationship_extra_projection::recover_relationship_extra_ideal(
                    required(&request, "receipt")?,
                    required(&request, "fresh")?,
                    field(&request, "current"),
                    &mut ctx,
                )?
            }
            "recoverRelationshipExtraNative" => {
                umf_core::relationship_extra_projection::recover_relationship_extra_native(
                    required(&request, "receipt")?,
                    required(&request, "fresh")?,
                    field(&request, "current"),
                    &mut ctx,
                )?
            }
            _ => unreachable!(),
        };
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

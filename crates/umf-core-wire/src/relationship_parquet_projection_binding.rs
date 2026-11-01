// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed tagged-wire owner for authored core relationship projection to Parquet.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Utf16};
pub const PROFILE: &str = "umf.relationship-parquet-projection-binding/1.0.0";
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
            "Relationship Parquet request must be an object",
        ));
    };
    for (i, (key, _)) in members.iter().enumerate() {
        ctx.charge_work(key.len() + 1, Utf16::default())?;
        if !allowed.iter().any(|n| key == &Utf16::from(*n)) {
            return Err(request_error(
                "Relationship Parquet request has an unknown member",
            ));
        }
        if members[..i].iter().any(|(prior, _)| prior == key) {
            return Err(request_error(
                "Relationship Parquet request has a duplicate member",
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
                "Relationship Parquet projection profile is required",
            ));
        }
        let op =
            text_field(&request, "op").ok_or_else(|| request_error("Operation is required"))?;
        let op = op
            .strip_prefix("relationship-parquet-projection.")
            .unwrap_or(&op);
        let allowed = match op {
            "projectRelationshipToParquet" => &["profile", "op", "source", "author", "request"][..],
            "verifyRelationshipParquetProjection"
            | "recoverRelationshipParquetIdeal"
            | "recoverRelationshipParquetNative" => &["profile", "op", "receipt", "current"][..],
            _ => {
                return Err(request_error(
                    "Unknown Relationship Parquet projection operation",
                ))
            }
        };
        closed(&request, allowed, &mut ctx)?;
        let output = match op {
            "projectRelationshipToParquet" => {
                umf_core::relationship_parquet_projection::project_relationship_to_parquet(
                    field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                    field(&request, "author").ok_or_else(|| request_error("author is required"))?,
                    field(&request, "request")
                        .ok_or_else(|| request_error("request is required"))?,
                    &mut ctx,
                )?
            }
            "verifyRelationshipParquetProjection" => {
                umf_core::relationship_parquet_projection::verify_relationship_parquet_projection(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            "recoverRelationshipParquetIdeal" => {
                umf_core::relationship_parquet_projection::recover_relationship_parquet_ideal(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            "recoverRelationshipParquetNative" => {
                umf_core::relationship_parquet_projection::recover_relationship_parquet_native(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            _ => {
                return Err(request_error(
                    "Unknown Relationship Parquet projection operation",
                ))
            }
        };
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

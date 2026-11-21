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
        closed(&request, allowed, ctx)?;
        let output = match op {
            "projectRelationshipToParquet" => {
                umf_core::relationship_parquet_projection::project_relationship_to_parquet(
                    field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                    field(&request, "author").ok_or_else(|| request_error("author is required"))?,
                    field(&request, "request")
                        .ok_or_else(|| request_error("request is required"))?,
                    ctx,
                )?
            }
            "verifyRelationshipParquetProjection" => {
                umf_core::relationship_parquet_projection::verify_relationship_parquet_projection(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            "recoverRelationshipParquetIdeal" => {
                umf_core::relationship_parquet_projection::recover_relationship_parquet_ideal(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            "recoverRelationshipParquetNative" => {
                umf_core::relationship_parquet_projection::recover_relationship_parquet_native(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            _ => {
                return Err(request_error(
                    "Unknown Relationship Parquet projection operation",
                ))
            }
        };
        encode(&output, ctx)
        };
    let result = if owned { ctx.with_codegen_construction(run) } else { run(ctx) };
    result_envelope(result)
}

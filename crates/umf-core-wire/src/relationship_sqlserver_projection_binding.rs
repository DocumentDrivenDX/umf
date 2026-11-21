// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed host transport for authored relationship to SQL Server projection.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Utf16};

pub const PROFILE: &str = "umf.relationship-sqlserver-projection-binding/1.0.0";
fn request(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn closed(
    value: &umf_core::Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let umf_core::Value::Object(members) = value else {
        return Err(request("Relationship SQL Server request must be an object"));
    };
    for (i, (key, _)) in members.iter().enumerate() {
        ctx.charge_work(key.len() + 1, Utf16::default())?;
        if !allowed.iter().any(|n| key == &Utf16::from(*n)) {
            return Err(request(
                "Relationship SQL Server request has an unknown member",
            ));
        }
        if members[..i].iter().any(|(old, _)| old == key) {
            return Err(request(
                "Relationship SQL Server request has a duplicate member",
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
        let req = decode(wire, ctx)?;
        if text_field(&req, "profile").as_deref() != Some(PROFILE) {
            return Err(request(
                "Relationship SQL Server projection profile is required",
            ));
        }
        let op = text_field(&req, "op").ok_or_else(|| request("Operation is required"))?;
        let op = op
            .strip_prefix("relationship-sqlserver-projection.")
            .unwrap_or(&op);
        let allowed = match op {
            "projectRelationshipToSqlServer" => &[
                "profile",
                "op",
                "source",
                "author",
                "bindingSource",
                "request",
            ][..],
            "verifyRelationshipSqlServerProjection"
            | "recoverRelationshipSqlServerIdeal"
            | "recoverRelationshipSqlServerBinding"
            | "recoverRelationshipSqlServerNative" => &["profile", "op", "receipt", "current"][..],
            _ => {
                return Err(request(
                    "Unknown Relationship SQL Server projection operation",
                ))
            }
        };
        closed(&req, allowed, ctx)?;
        let out=match op{
            "projectRelationshipToSqlServer"=>umf_core::relationship_sqlserver_projection::project_relationship_to_sqlserver(field(&req,"source").ok_or_else(||request("source is required"))?,field(&req,"author").ok_or_else(||request("author is required"))?,field(&req,"bindingSource").ok_or_else(||request("bindingSource is required"))?,field(&req,"request").ok_or_else(||request("request is required"))?,ctx)?,
            "verifyRelationshipSqlServerProjection"=>umf_core::relationship_sqlserver_projection::verify_relationship_sqlserver_projection(field(&req,"receipt").ok_or_else(||request("receipt is required"))?,field(&req,"current").ok_or_else(||request("current is required"))?,ctx)?,
            "recoverRelationshipSqlServerIdeal"=>umf_core::relationship_sqlserver_projection::recover_relationship_sqlserver_ideal(field(&req,"receipt").ok_or_else(||request("receipt is required"))?,field(&req,"current").ok_or_else(||request("current is required"))?,ctx)?,
            "recoverRelationshipSqlServerBinding"=>umf_core::relationship_sqlserver_projection::recover_relationship_sqlserver_binding(field(&req,"receipt").ok_or_else(||request("receipt is required"))?,field(&req,"current").ok_or_else(||request("current is required"))?,ctx)?,
            "recoverRelationshipSqlServerNative"=>umf_core::relationship_sqlserver_projection::recover_relationship_sqlserver_native(field(&req,"receipt").ok_or_else(||request("receipt is required"))?,field(&req,"current").ok_or_else(||request("current is required"))?,ctx)?,
            _=>return Err(request("Unknown Relationship SQL Server projection operation"))};
        encode(&out, ctx)
        };
    let result = if owned { ctx.with_codegen_construction(run) } else { run(ctx) };
    result_envelope(result)
}

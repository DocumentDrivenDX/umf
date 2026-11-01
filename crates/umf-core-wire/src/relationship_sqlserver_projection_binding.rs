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
        let req = decode(wire, &mut ctx)?;
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
        closed(&req, allowed, &mut ctx)?;
        let out=match op{
            "projectRelationshipToSqlServer"=>umf_core::relationship_sqlserver_projection::project_relationship_to_sqlserver(field(&req,"source").ok_or_else(||request("source is required"))?,field(&req,"author").ok_or_else(||request("author is required"))?,field(&req,"bindingSource").ok_or_else(||request("bindingSource is required"))?,field(&req,"request").ok_or_else(||request("request is required"))?,&mut ctx)?,
            "verifyRelationshipSqlServerProjection"=>umf_core::relationship_sqlserver_projection::verify_relationship_sqlserver_projection(field(&req,"receipt").ok_or_else(||request("receipt is required"))?,field(&req,"current").ok_or_else(||request("current is required"))?,&mut ctx)?,
            "recoverRelationshipSqlServerIdeal"=>umf_core::relationship_sqlserver_projection::recover_relationship_sqlserver_ideal(field(&req,"receipt").ok_or_else(||request("receipt is required"))?,field(&req,"current").ok_or_else(||request("current is required"))?,&mut ctx)?,
            "recoverRelationshipSqlServerBinding"=>umf_core::relationship_sqlserver_projection::recover_relationship_sqlserver_binding(field(&req,"receipt").ok_or_else(||request("receipt is required"))?,field(&req,"current").ok_or_else(||request("current is required"))?,&mut ctx)?,
            "recoverRelationshipSqlServerNative"=>umf_core::relationship_sqlserver_projection::recover_relationship_sqlserver_native(field(&req,"receipt").ok_or_else(||request("receipt is required"))?,field(&req,"current").ok_or_else(||request("current is required"))?,&mut ctx)?,
            _=>return Err(request("Unknown Relationship SQL Server projection operation"))};
        encode(&out, &mut ctx)
    })();
    result_envelope(result)
}

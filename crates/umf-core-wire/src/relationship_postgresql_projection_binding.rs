// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed host transport for authored PostgreSQL relationship projection.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Utf16};

pub const PROFILE: &str = "umf.relationship-postgresql-projection-binding/1.0.0";
fn request(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn closed(
    value: &umf_core::Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let umf_core::Value::Object(members) = value else {
        return Err(request("PostgreSQL relationship request must be an object"));
    };
    for (i, (key, _)) in members.iter().enumerate() {
        ctx.charge_work(key.len() + 1, Utf16::default())?;
        if !allowed.iter().any(|n| key == &Utf16::from(*n)) {
            return Err(request(
                "PostgreSQL relationship request has an unknown member",
            ));
        }
        if members[..i].iter().any(|(old, _)| old == key) {
            return Err(request(
                "PostgreSQL relationship request has a duplicate member",
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
                "PostgreSQL relationship projection profile is required",
            ));
        }
        let op = text_field(&req, "op").ok_or_else(|| request("Operation is required"))?;
        let op = op
            .strip_prefix("relationship-postgresql-projection.")
            .unwrap_or(&op);
        let allowed = match op {
            "prepareProjectRelationshipsToPostgresql" => {
                &["profile", "op", "source", "binding", "authors", "request"][..]
            }
            "completeProjectRelationshipsToPostgresql" => &[
                "profile",
                "op",
                "source",
                "binding",
                "authors",
                "request",
                "candidateSource",
                "candidateArchive",
                "nativeSource",
                "targetArchive",
            ][..],
            "blockProjectRelationshipsToPostgresql" => &[
                "profile", "op", "source", "binding", "authors", "request", "path", "message",
            ][..],
            "verifyRelationshipsPostgresqlProjection"
            | "recoverRelationshipsPostgresqlIdeal"
            | "recoverRelationshipsPostgresqlNative" => &[
                "profile",
                "op",
                "receipt",
                "current",
                "candidateSource",
                "candidateArchive",
            ][..],
            _ => {
                return Err(request(
                    "Unknown PostgreSQL relationship projection operation",
                ))
            }
        };
        closed(&req, allowed, &mut ctx)?;
        let out=match op{
 "prepareProjectRelationshipsToPostgresql"=>umf_core::relationship_postgresql_projection::prepare_project_relationships_to_postgresql(field(&req,"source").ok_or_else(||request("source required"))?,field(&req,"binding").ok_or_else(||request("binding required"))?,field(&req,"authors").ok_or_else(||request("authors required"))?,field(&req,"request").ok_or_else(||request("request required"))?,&mut ctx)?,
 "completeProjectRelationshipsToPostgresql"=>umf_core::relationship_postgresql_projection::complete_project_relationships_to_postgresql(field(&req,"source").ok_or_else(||request("source required"))?,field(&req,"binding").ok_or_else(||request("binding required"))?,field(&req,"authors").ok_or_else(||request("authors required"))?,field(&req,"request").ok_or_else(||request("request required"))?,field(&req,"candidateSource").ok_or_else(||request("candidateSource required"))?,field(&req,"candidateArchive").ok_or_else(||request("candidateArchive required"))?,field(&req,"nativeSource").ok_or_else(||request("nativeSource required"))?,field(&req,"targetArchive").ok_or_else(||request("targetArchive required"))?,&mut ctx)?,
 "blockProjectRelationshipsToPostgresql"=>umf_core::relationship_postgresql_projection::block_project_relationships_to_postgresql(field(&req,"source").ok_or_else(||request("source required"))?,field(&req,"binding").ok_or_else(||request("binding required"))?,field(&req,"authors").ok_or_else(||request("authors required"))?,field(&req,"request").ok_or_else(||request("request required"))?,field(&req,"path").ok_or_else(||request("path required"))?,field(&req,"message").ok_or_else(||request("message required"))?,&mut ctx)?,
 "verifyRelationshipsPostgresqlProjection"=>umf_core::relationship_postgresql_projection::verify_relationships_postgresql_projection(field(&req,"receipt").ok_or_else(||request("receipt required"))?,field(&req,"current").ok_or_else(||request("current required"))?,field(&req,"candidateSource").ok_or_else(||request("candidateSource required"))?,field(&req,"candidateArchive").ok_or_else(||request("candidateArchive required"))?,&mut ctx)?,
 "recoverRelationshipsPostgresqlIdeal"=>umf_core::relationship_postgresql_projection::recover_relationships_postgresql_ideal(field(&req,"receipt").ok_or_else(||request("receipt required"))?,field(&req,"current").ok_or_else(||request("current required"))?,field(&req,"candidateSource").ok_or_else(||request("candidateSource required"))?,field(&req,"candidateArchive").ok_or_else(||request("candidateArchive required"))?,&mut ctx)?,
 _=>umf_core::relationship_postgresql_projection::recover_relationships_postgresql_native(field(&req,"receipt").ok_or_else(||request("receipt required"))?,field(&req,"current").ok_or_else(||request("current required"))?,field(&req,"candidateSource").ok_or_else(||request("candidateSource required"))?,field(&req,"candidateArchive").ok_or_else(||request("candidateArchive required"))?,&mut ctx)?};
        encode(&out, &mut ctx)
    })();
    result_envelope(result)
}

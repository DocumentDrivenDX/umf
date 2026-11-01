// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed wire owner for authored SQL Server nullability projection and recovery.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf.nullability-sqlserver-projection-binding/1.0.0";
fn request_error(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn closed(value: &Value, allowed: &[&str], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Object(members) = value else {
        return Err(request_error(
            "SQL Server nullability projection request must be an object",
        ));
    };
    for (index, (key, _)) in members.iter().enumerate() {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) {
            return Err(request_error(
                "SQL Server nullability projection request has an unknown member",
            ));
        }
        if members[..index].iter().any(|(prior, _)| prior == key) {
            return Err(request_error(
                "SQL Server nullability projection request has a duplicate member",
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
                "SQL Server nullability projection profile is required",
            ));
        }
        let op =
            text_field(&request, "op").ok_or_else(|| request_error("Operation is required"))?;
        let op = op
            .strip_prefix("nullability-sqlserver-projection.")
            .unwrap_or(&op);
        let allowed = match op {
            "projectNullabilityToSqlServer" => &["profile", "op", "author", "request"][..],
            "recoverNullabilityFromSqlServer" => &["profile", "op", "receipt", "nativeText"][..],
            _ => {
                return Err(request_error(
                    "Unknown SQL Server nullability projection operation",
                ))
            }
        };
        closed(&request, allowed, &mut ctx)?;
        let output = match op {
            "projectNullabilityToSqlServer" => {
                umf_core::nullability_sqlserver_projection::project_nullability_to_sqlserver(
                    field(&request, "author").ok_or_else(|| request_error("author is required"))?,
                    field(&request, "request")
                        .ok_or_else(|| request_error("request is required"))?,
                    &mut ctx,
                )?
            }
            "recoverNullabilityFromSqlServer" => {
                umf_core::nullability_sqlserver_projection::recover_nullability_from_sqlserver(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "nativeText")
                        .ok_or_else(|| request_error("nativeText is required"))?,
                    &mut ctx,
                )?
            }
            _ => unreachable!(),
        };
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

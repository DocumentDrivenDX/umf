// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed tagged-wire owner for authored Record Key projection to SQL Server.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Utf16, Value};
pub const PROFILE: &str = "umf.key-sqlserver-projection-binding/1.0.0";
fn request_error(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn closed(value: &Value, allowed: &[&str], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Object(members) = value else {
        return Err(request_error(
            "Key SQL Server projection request must be an object",
        ));
    };
    for (index, (key, _)) in members.iter().enumerate() {
        ctx.charge_work(key.len() + 1, Utf16::default())?;
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) {
            return Err(request_error(
                "Key SQL Server projection request has an unknown member",
            ));
        }
        if members[..index].iter().any(|(previous, _)| previous == key) {
            return Err(request_error(
                "Key SQL Server projection request has a duplicate member",
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
                "Key SQL Server projection profile is required",
            ));
        }
        let op =
            text_field(&request, "op").ok_or_else(|| request_error("Operation is required"))?;
        let op = op.strip_prefix("key-sqlserver-projection.").unwrap_or(&op);
        let allowed = match op {
            "projectKeysToSqlServer" => &["profile", "op", "source", "authors", "request"][..],
            "verifyKeysSqlServerProjection" => &["profile", "op", "receipt", "current"][..],
            "recoverKeysSqlServerIdeal" => &["profile", "op", "receipt", "current"][..],
            _ => return Err(request_error("Unknown Key SQL Server projection operation")),
        };
        closed(&request, allowed, &mut ctx)?;
        let output = match op {
            "projectKeysToSqlServer" => {
                umf_core::key_sqlserver_projection::project_keys_to_sqlserver(
                    field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                    field(&request, "authors")
                        .ok_or_else(|| request_error("authors are required"))?,
                    field(&request, "request")
                        .ok_or_else(|| request_error("request is required"))?,
                    &mut ctx,
                )?
            }
            "verifyKeysSqlServerProjection" => {
                umf_core::key_sqlserver_projection::verify_keys_sqlserver_projection(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            "recoverKeysSqlServerIdeal" => {
                umf_core::key_sqlserver_projection::recover_keys_sqlserver_ideal(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            _ => return Err(request_error("Unknown Key SQL Server projection operation")),
        };
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

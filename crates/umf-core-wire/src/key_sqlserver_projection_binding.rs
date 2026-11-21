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
        closed(&request, allowed, ctx)?;
        let output = match op {
            "projectKeysToSqlServer" => {
                umf_core::key_sqlserver_projection::project_keys_to_sqlserver(
                    field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                    field(&request, "authors")
                        .ok_or_else(|| request_error("authors are required"))?,
                    field(&request, "request")
                        .ok_or_else(|| request_error("request is required"))?,
                    ctx,
                )?
            }
            "verifyKeysSqlServerProjection" => {
                umf_core::key_sqlserver_projection::verify_keys_sqlserver_projection(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            "recoverKeysSqlServerIdeal" => {
                umf_core::key_sqlserver_projection::recover_keys_sqlserver_ideal(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            _ => return Err(request_error("Unknown Key SQL Server projection operation")),
        };
        encode(&output, ctx)
        };
    let result = if owned { ctx.with_codegen_construction(run) } else { run(ctx) };
    result_envelope(result)
}

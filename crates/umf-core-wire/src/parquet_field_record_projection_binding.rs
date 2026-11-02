// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed wire owner for authored Parquet Field/Record projection and recovery.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf.field-record-parquet-projection-binding/1.0.0";
fn request_error(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn closed(value: &Value, allowed: &[&str], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Object(members) = value else {
        return Err(request_error(
            "Parquet Field/Record request must be an object",
        ));
    };
    for (index, (key, _)) in members.iter().enumerate() {
        ctx.charge_work(key.len() + 1, Utf16::default())?;
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) {
            return Err(request_error(
                "Parquet Field/Record request has an unknown member",
            ));
        }
        if members[..index].iter().any(|(prior, _)| prior == key) {
            return Err(request_error(
                "Parquet Field/Record request has a duplicate member",
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
                "Parquet Field/Record projection profile is required",
            ));
        }
        let op =
            text_field(&request, "op").ok_or_else(|| request_error("Operation is required"))?;
        let op = op
            .strip_prefix("field-record-parquet-projection.")
            .unwrap_or(&op);
        let allowed = match op {
            "projectFieldToParquet" | "projectRecordToParquet" => {
                &["profile", "op", "author", "request"][..]
            }
            "recoverFieldFromParquet" | "recoverRecordFromParquet" => {
                &["profile", "op", "receipt", "nativeHex"][..]
            }
            _ => {
                return Err(request_error(
                    "Unknown Parquet Field/Record projection operation",
                ))
            }
        };
        closed(&request, allowed, &mut ctx)?;
        let output = match op {
            "projectFieldToParquet" => umf_core::parquet_field_record_projection::project_field(
                field(&request, "author").ok_or_else(|| request_error("author is required"))?,
                field(&request, "request").ok_or_else(|| request_error("request is required"))?,
                &mut ctx,
            )?,
            "recoverFieldFromParquet" => umf_core::parquet_field_record_projection::recover_field(
                field(&request, "receipt").ok_or_else(|| request_error("receipt is required"))?,
                field(&request, "nativeHex")
                    .ok_or_else(|| request_error("nativeHex is required"))?,
                &mut ctx,
            )?,
            "projectRecordToParquet" => umf_core::parquet_field_record_projection::project_record(
                field(&request, "author").ok_or_else(|| request_error("author is required"))?,
                field(&request, "request").ok_or_else(|| request_error("request is required"))?,
                &mut ctx,
            )?,
            "recoverRecordFromParquet" => {
                umf_core::parquet_field_record_projection::recover_record(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "nativeHex")
                        .ok_or_else(|| request_error("nativeHex is required"))?,
                    &mut ctx,
                )?
            }
            _ => {
                return Err(request_error(
                    "Unknown Parquet Field/Record projection operation",
                ))
            }
        };
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

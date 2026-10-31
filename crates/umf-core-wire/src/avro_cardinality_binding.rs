// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged transport for Avro Cardinality classification and recovery.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Utf16, Value, context::Context, error::EngineError};
pub const PROFILE: &str = "umf.avro-cardinality-binding/1.0.0";
fn request_error(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
pub fn execute_wire(wire_json: &str) -> String {
    let mut none = |_| Ok(());
    execute_wire_with_control(wire_json, &mut none)
}
pub fn execute_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "profile").as_deref() != Some(PROFILE) {
            return Err(request_error(
                "Avro Cardinality binding profile is required",
            ));
        }
        let op =
            text_field(&request, "op").ok_or_else(|| request_error("Operation is required"))?;
        let allowed = match op.as_str() {
            "classifyAvroCardinality" => ["profile", "op", "source", "request"],
            "verifyAvroCardinalityClassification" | "recoverAvroCardinalityBundle" => {
                ["profile", "op", "receipt", "current"]
            }
            _ => return Err(request_error("Unknown Avro Cardinality binding operation")),
        };
        let Value::Object(members) = &request else {
            return Err(request_error("Avro Cardinality request must be an object"));
        };
        for (i, (key, _)) in members.iter().enumerate() {
            ctx.charge_work(key.len() + 1, Utf16::default())?;
            if !allowed.iter().any(|k| key == &Utf16::from(*k))
                || members[..i].iter().any(|(k, _)| k == key)
            {
                return Err(request_error(
                    "Avro Cardinality request has an unknown or duplicate member",
                ));
            }
        }
        let output = match op.as_str() {
            "classifyAvroCardinality" => umf_core::avro_cardinality::classify_avro_cardinality(
                field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                field(&request, "request").ok_or_else(|| request_error("request is required"))?,
                &mut ctx,
            )?,
            "verifyAvroCardinalityClassification" => {
                umf_core::avro_cardinality::verify_avro_cardinality_classification(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            "recoverAvroCardinalityBundle" => {
                umf_core::avro_cardinality::recover_avro_cardinality_bundle(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            _ => unreachable!(),
        };
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

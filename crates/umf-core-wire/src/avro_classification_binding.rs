// SPDX-License-Identifier: MIT OR Apache-2.0
//! Typed wire owner for Avro Field and Record classification operations.

use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf.avro-classification-binding/1.0.0";

fn request_error(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}

fn validate_envelope(
    value: &Value,
    operation: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let allowed: &[&str] = match operation {
        "classifyAvroField"
        | "classifyAvroRecord"
        | "classifyAvroKeys"
        | "classifyAvroRelationships" => &["profile", "op", "source", "request"],
        "recoverAvroFieldBundle"
        | "recoverAvroRecordBundle"
        | "verifyAvroKeyClassification"
        | "recoverAvroKeySource"
        | "verifyAvroRelationshipClassification"
        | "recoverAvroRelationshipSource" => &["profile", "op", "receipt", "current"],
        _ => return Err(request_error("Unknown Avro classification operation")),
    };
    let Value::Object(members) = value else {
        return Err(request_error(
            "Avro classification request must be an object",
        ));
    };
    for (index, (key, _)) in members.iter().enumerate() {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        if !allowed
            .iter()
            .any(|candidate| key == &Utf16::from(*candidate))
        {
            return Err(request_error(
                "Avro classification request has an unknown member",
            ));
        }
        if members[..index].iter().any(|(previous, _)| previous == key) {
            return Err(request_error(
                "Avro classification request has a duplicate member",
            ));
        }
    }
    Ok(())
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
                "Avro classification binding profile is required",
            ));
        }
        let operation =
            text_field(&request, "op").ok_or_else(|| request_error("Operation is required"))?;
        validate_envelope(&request, &operation, &mut ctx)?;
        let output = match operation.as_str() {
            "classifyAvroField" => umf_core::avro_field_classifier::classify_field(
                field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                field(&request, "request").ok_or_else(|| request_error("request is required"))?,
                &mut ctx,
            )?,
            "recoverAvroFieldBundle" => umf_core::avro_field_recovery::recover_field_bundle(
                field(&request, "receipt").ok_or_else(|| request_error("receipt is required"))?,
                field(&request, "current").ok_or_else(|| request_error("current is required"))?,
                &mut ctx,
            )?,
            "classifyAvroRecord" => umf_core::avro_record_classifier::classify_avro_record(
                field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                field(&request, "request").ok_or_else(|| request_error("request is required"))?,
                &mut ctx,
            )?,
            "recoverAvroRecordBundle" => {
                umf_core::avro_record_recovery::recover_avro_record_bundle(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            "classifyAvroKeys" => umf_core::avro_key_classification::classify_avro_keys(
                field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                field(&request, "request").ok_or_else(|| request_error("request is required"))?,
                &mut ctx,
            )?,
            "verifyAvroKeyClassification" => {
                umf_core::avro_key_classification::verify_avro_key_classification(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            "recoverAvroKeySource" => umf_core::avro_key_classification::recover_avro_key_source(
                field(&request, "receipt").ok_or_else(|| request_error("receipt is required"))?,
                field(&request, "current").ok_or_else(|| request_error("current is required"))?,
                &mut ctx,
            )?,
            "classifyAvroRelationships" => {
                umf_core::avro_relationship_classification::classify_avro_relationships(
                    field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                    field(&request, "request")
                        .ok_or_else(|| request_error("request is required"))?,
                    &mut ctx,
                )?
            }
            "verifyAvroRelationshipClassification" => {
                umf_core::avro_relationship_classification::verify_avro_relationship_classification(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            "recoverAvroRelationshipSource" => {
                umf_core::avro_relationship_classification::recover_avro_relationship_source(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    &mut ctx,
                )?
            }
            _ => return Err(request_error("Unknown Avro classification operation")),
        };
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

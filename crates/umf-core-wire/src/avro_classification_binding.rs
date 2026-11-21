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
        | "classifyAvroRelationships"
        | "classifyAvroFacets"
        | "classifyAvroNullability" => &["profile", "op", "source", "request"],
        "recoverAvroFieldBundle"
        | "recoverAvroRecordBundle"
        | "verifyAvroKeyClassification"
        | "recoverAvroKeySource"
        | "verifyAvroRelationshipClassification"
        | "recoverAvroRelationshipSource"
        | "verifyAvroFacetClassification"
        | "recoverAvroFacetSource"
        | "verifyAvroNullabilityClassification"
        | "recoverAvroNullabilityBundle" => &["profile", "op", "receipt", "current"],
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

pub fn execute_wire(wire_json: &str) -> String {
    execute_wire_context(wire_json, &mut Context::ordinary(), true)
}

pub fn execute_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    execute_wire_context(wire_json, &mut Context::ordinary().with_host_control(control), false)
}

fn execute_wire_context(wire_json: &str, ctx: &mut Context<'_>, owned: bool) -> String {
    let run = |ctx: &mut Context<'_>| -> Result<_, EngineError> {
        let request = decode(wire_json, ctx)?;
        if text_field(&request, "profile").as_deref() != Some(PROFILE) {
            return Err(request_error(
                "Avro classification binding profile is required",
            ));
        }
        let operation =
            text_field(&request, "op").ok_or_else(|| request_error("Operation is required"))?;
        validate_envelope(&request, &operation, ctx)?;
        let output = match operation.as_str() {
            "classifyAvroNullability" => {
                umf_core::avro_nullability_classification::classify_avro_nullability(
                    field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                    field(&request, "request")
                        .ok_or_else(|| request_error("request is required"))?,
                    ctx,
                )?
            }
            "verifyAvroNullabilityClassification" => {
                umf_core::avro_nullability_classification::verify_avro_nullability_classification(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            "recoverAvroNullabilityBundle" => {
                umf_core::avro_nullability_classification::recover_avro_nullability_bundle(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            "classifyAvroFacets" => umf_core::avro_facets_classification::classify_avro_facets(
                field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                field(&request, "request").ok_or_else(|| request_error("request is required"))?,
                ctx,
            )?,
            "verifyAvroFacetClassification" => {
                umf_core::avro_facets_classification::verify_avro_facet_classification(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            "recoverAvroFacetSource" => {
                umf_core::avro_facets_classification::recover_avro_facet_source(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            "classifyAvroField" => umf_core::avro_field_classifier::classify_field(
                field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                field(&request, "request").ok_or_else(|| request_error("request is required"))?,
                ctx,
            )?,
            "recoverAvroFieldBundle" => umf_core::avro_field_recovery::recover_field_bundle(
                field(&request, "receipt").ok_or_else(|| request_error("receipt is required"))?,
                field(&request, "current").ok_or_else(|| request_error("current is required"))?,
                ctx,
            )?,
            "classifyAvroRecord" => umf_core::avro_record_classifier::classify_avro_record(
                field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                field(&request, "request").ok_or_else(|| request_error("request is required"))?,
                ctx,
            )?,
            "recoverAvroRecordBundle" => {
                umf_core::avro_record_recovery::recover_avro_record_bundle(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            "classifyAvroKeys" => umf_core::avro_key_classification::classify_avro_keys(
                field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                field(&request, "request").ok_or_else(|| request_error("request is required"))?,
                ctx,
            )?,
            "verifyAvroKeyClassification" => {
                umf_core::avro_key_classification::verify_avro_key_classification(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            "recoverAvroKeySource" => umf_core::avro_key_classification::recover_avro_key_source(
                field(&request, "receipt").ok_or_else(|| request_error("receipt is required"))?,
                field(&request, "current").ok_or_else(|| request_error("current is required"))?,
                ctx,
            )?,
            "classifyAvroRelationships" => {
                umf_core::avro_relationship_classification::classify_avro_relationships(
                    field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                    field(&request, "request")
                        .ok_or_else(|| request_error("request is required"))?,
                    ctx,
                )?
            }
            "verifyAvroRelationshipClassification" => {
                umf_core::avro_relationship_classification::verify_avro_relationship_classification(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            "recoverAvroRelationshipSource" => {
                umf_core::avro_relationship_classification::recover_avro_relationship_source(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "current")
                        .ok_or_else(|| request_error("current is required"))?,
                    ctx,
                )?
            }
            _ => return Err(request_error("Unknown Avro classification operation")),
        };
        encode(&output, ctx)
        };
    let result = if owned { ctx.with_codegen_construction(run) } else { run(ctx) };
    result_envelope(result)
}

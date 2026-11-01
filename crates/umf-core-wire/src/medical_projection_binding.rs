// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed tagged-wire owner for source-preserving medical selected views.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Utf16, Value};
pub const PROFILE: &str = "umf.medical-projection-binding/1.0.0";
fn request_error(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn closed(value: &Value, allowed: &[&str], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(request_error(
            "Medical projection request must be an object",
        ));
    };
    for (index, (key, _)) in fields.iter().enumerate() {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) {
            return Err(request_error(
                "Medical projection request has an unknown member",
            ));
        }
        if fields[..index].iter().any(|(previous, _)| previous == key) {
            return Err(request_error(
                "Medical projection request has a duplicate member",
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
            return Err(request_error("Medical projection profile is required"));
        }
        let op =
            text_field(&request, "op").ok_or_else(|| request_error("Operation is required"))?;
        let op = op.strip_prefix("medical-projection.").unwrap_or(&op);
        let allowed = match op {
            "projectMedicalFhir" => &["profile", "op", "inputs", "namespace"][..],
            "projectCdcMortality" | "projectDicomMetadata" => {
                &["profile", "op", "source", "sourceId"][..]
            }
            "lookupMedicalTerminology" => &["profile", "op", "query", "records"][..],
            _ => return Err(request_error("Unknown medical projection operation")),
        };
        closed(&request, allowed, &mut ctx)?;
        let output = match op {
            "projectMedicalFhir" => umf_core::medical_projection::project_medical_fhir(
                field(&request, "inputs").ok_or_else(|| request_error("inputs is required"))?,
                field(&request, "namespace")
                    .ok_or_else(|| request_error("namespace is required"))?,
                &mut ctx,
            )?,
            "projectCdcMortality" => umf_core::medical_projection::project_cdc_mortality(
                field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                field(&request, "sourceId").ok_or_else(|| request_error("sourceId is required"))?,
                &mut ctx,
            )?,
            "projectDicomMetadata" => umf_core::medical_projection::project_dicom_metadata(
                field(&request, "source").ok_or_else(|| request_error("source is required"))?,
                field(&request, "sourceId").ok_or_else(|| request_error("sourceId is required"))?,
                &mut ctx,
            )?,
            "lookupMedicalTerminology" => umf_core::medical_projection::lookup_medical_terminology(
                field(&request, "query").ok_or_else(|| request_error("query is required"))?,
                field(&request, "records"),
                &mut ctx,
            )?,
            _ => return Err(request_error("Unknown medical projection operation")),
        };
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

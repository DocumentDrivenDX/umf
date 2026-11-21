// SPDX-License-Identifier: MIT OR Apache-2.0
//! Wire for common Core Ideal classification reports.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf.core-ideal-reports-binding/1.0.0";
fn request_error(message: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
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
            return Err(request_error("Core Ideal reports profile is required"));
        }
        let operation =
            text_field(&request, "op").ok_or_else(|| request_error("Operation is required"))?;
        let allowed = match operation.as_str() {
            "inspectFieldClassification" => &["profile", "op", "receipt"][..],
            "verifyFieldClassificationInspection" => &["profile", "op", "report"][..],
            "inspectFieldProjection" => &["profile", "op", "receipt", "fresh"][..],
            "verifyFieldProjectionInspection" => &["profile", "op", "report", "fresh"][..],
            "inspectRecordProjection" => &["profile", "op", "receipt", "fresh"][..],
            "verifyRecordProjectionInspection" => &["profile", "op", "report", "fresh"][..],
            "inspectStructuredClassification" => &["profile", "op", "receipt", "fresh"][..],
            "verifyStructuredClassificationInspection" => &["profile", "op", "report", "fresh"][..],
            _ => return Err(request_error("Unknown Core Ideal report operation")),
        };
        let Value::Object(members) = &request else {
            return Err(request_error(
                "Core Ideal reports request must be an object",
            ));
        };
        for (i, (name, _)) in members.iter().enumerate() {
            ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
            if !allowed.iter().any(|member| name == &Utf16::from(*member))
                || members[..i].iter().any(|(prior, _)| prior == name)
            {
                return Err(request_error(
                    "Core Ideal reports request has an unknown or duplicate member",
                ));
            }
        }
        let output = match operation.as_str() {
            "inspectFieldClassification" => {
                umf_core::core_ideal_reports::inspect_field_classification(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    ctx,
                )
            }
            "inspectFieldProjection" => umf_core::core_ideal_reports::inspect_field_projection(
                field(&request, "receipt").ok_or_else(|| request_error("receipt is required"))?,
                field(&request, "fresh"),
                ctx,
            ),
            "verifyFieldProjectionInspection" => {
                umf_core::core_ideal_reports::verify_field_projection_inspection(
                    field(&request, "report").ok_or_else(|| request_error("report is required"))?,
                    field(&request, "fresh"),
                    ctx,
                )
            }
            "inspectRecordProjection" => umf_core::core_ideal_reports::inspect_record_projection(
                field(&request, "receipt").ok_or_else(|| request_error("receipt is required"))?,
                field(&request, "fresh"),
                ctx,
            ),
            "verifyRecordProjectionInspection" => {
                umf_core::core_ideal_reports::verify_record_projection_inspection(
                    field(&request, "report").ok_or_else(|| request_error("report is required"))?,
                    field(&request, "fresh"),
                    ctx,
                )
            }
            "inspectStructuredClassification" => {
                umf_core::core_ideal_reports::inspect_structured_classification(
                    field(&request, "receipt")
                        .ok_or_else(|| request_error("receipt is required"))?,
                    field(&request, "fresh"),
                    ctx,
                )
            }
            "verifyStructuredClassificationInspection" => {
                umf_core::core_ideal_reports::verify_structured_classification_inspection(
                    field(&request, "report").ok_or_else(|| request_error("report is required"))?,
                    field(&request, "fresh"),
                    ctx,
                )
            }
            "verifyFieldClassificationInspection" => {
                umf_core::core_ideal_reports::verify_field_classification_inspection(
                    field(&request, "report").ok_or_else(|| request_error("report is required"))?,
                    ctx,
                )
            }
            _ => return Err(request_error("Unknown Core Ideal report operation")),
        }?;
        encode(&output, ctx)
        };
    let result = if owned { ctx.with_codegen_construction(run) } else { run(ctx) };
    result_envelope(result)
}

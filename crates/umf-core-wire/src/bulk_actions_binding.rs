// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed wire for CONTRACT-904's pure bulk coordination helpers.
use umf_core::{Context, EngineError, Utf16, Value};
pub const PROFILE: &str = "umf.bulk-actions-wire/1";
pub fn execute_wire(wire: &str) -> String {
    let mut control = |_: usize| Ok(());
    execute_wire_with_control(wire, &mut control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let req =
            ctx.with_tagged_transport_limit(|ctx| umf_tagged_wire::decode_host_value(wire, ctx))?;
        let profile = super::field(&req, "profile")
            .and_then(super::as_utf16)
            .and_then(|v| v.to_utf8().ok());
        if profile.as_deref() != Some(PROFILE) {
            return Err(EngineError::new(
                "REQUEST",
                Utf16::default(),
                "Bulk actions profile is required",
            ));
        }
        let op = super::field(&req, "op")
            .and_then(super::as_utf16)
            .and_then(|v| v.to_utf8().ok())
            .ok_or_else(|| {
                EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Bulk actions operation is required",
                )
            })?;
        let allowed: &[&str] = match op.as_str() {
            "bulk-actions.applyBulkEvent" => &["profile", "op", "state", "event"],
            "bulk-actions.bulkDecisionOrder" => &["profile", "op", "input"],
            "bulk-actions.nextBulkFence" => &["profile", "op", "fence"],
            "bulk-actions.bulkItemToken" => &["profile", "op", "namespace", "id", "batch", "item"],
            "bulk-actions.parseBulkItemToken" | "bulk-actions.isReservedBulkKey" => {
                &["profile", "op", "key"]
            }
            "bulk-actions.checkBulkKeyUse" => &["profile", "op", "key", "viaBulk"],
            _ => {
                return Err(EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Unknown bulk action operation",
                ))
            }
        };
        let Value::Object(fields) = &req else {
            return Err(EngineError::new(
                "REQUEST",
                Utf16::default(),
                "Bulk actions request must be an object",
            ));
        };
        for (k, _) in fields {
            let name = k.to_utf8().unwrap_or_default();
            if !allowed.contains(&name.as_str()) {
                return Err(EngineError::new(
                    "REQUEST",
                    Utf16::default(),
                    "Unknown bulk actions request member",
                ));
            }
        }
        let output = umf_core::bulk_actions::execute(&op, &req, &mut ctx)?;
        umf_tagged_wire::encode_host_value(&output, &mut ctx)
    })();
    super::result_envelope(result)
}

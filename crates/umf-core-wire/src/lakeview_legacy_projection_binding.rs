// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed transport for the explicitly named Lakeview 0.1 dashboard view.
use crate::{field, result_envelope};
use umf_core::{lakeview_legacy_projection, Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf.lakeview-legacy-projection-wire/1";
pub const PROJECT: &str = "lakeview-legacy-projection.projectLakeviewToLegacyDashboard";
fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(s)) => Ok(s),
        _ => Err(request(&format!("{name} must be a string"))),
    }
}
fn execute(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    if text(field(value, "profile"), "profile")? != &Utf16::from(PROFILE) {
        return Err(request("wrong Lakeview legacy projection profile"));
    }
    if text(field(value, "op"), "op")? != &Utf16::from(PROJECT) {
        return Err(request("unknown Lakeview legacy projection operation"));
    }
    let view = field(value, "view").ok_or_else(|| request("view is required"))?;
    let ids = field(value, "ids").ok_or_else(|| request("ids are required"))?;
    let title = text(field(value, "title"), "title")?;
    lakeview_legacy_projection::project(view, ids, title, ctx)
}
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
        let request =
            ctx.with_tagged_transport_limit(|ctx| umf_tagged_wire::decode_host_value(wire, ctx))?;
        let value = execute(&request, &mut ctx)?;
        umf_tagged_wire::encode_host_value(&value, &mut ctx)
    })();
    result_envelope(result)
}

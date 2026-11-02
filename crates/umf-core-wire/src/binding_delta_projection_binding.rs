// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{decode, encode, field, result_envelope};
use umf_core::{
    binding_delta_projection, binding_index_projection::BindingIndexProjectionResources,
    delta_log::DeltaLogResources, Context, EngineError, Utf16, Value,
};

pub const PROFILE: &str = "umf.binding-delta-projection-wire/1";
fn err(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(v: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match v {
        Some(Value::String(s)) => Ok(s),
        _ => Err(err(&format!("{name} must be text"))),
    }
}
fn execute(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    if text(field(value, "profile"), "profile")? != &Utf16::from(PROFILE) {
        return Err(err("wrong projection profile"));
    }
    let op = text(field(value, "op"), "op")?
        .to_utf8()
        .map_err(|_| err("operation must be UTF-8"))?;
    if op.strip_prefix("binding-delta-projection.").unwrap_or(&op) != "projectBindingToDelta" {
        return Err(err("unknown projection operation"));
    }
    let logical = field(value, "logical").ok_or_else(|| err("logical is required"))?;
    let binding = field(value, "binding").ok_or_else(|| err("binding is required"))?;
    let native = field(value, "nativeArchive").ok_or_else(|| err("nativeArchive is required"))?;
    let loss = text(field(value, "lossPolicy"), "lossPolicy")?
        .to_utf8()
        .map_err(|_| err("lossPolicy must be UTF-8"))?;
    let binding_resources = BindingIndexProjectionResources::new(ctx)?;
    let delta_resources = DeltaLogResources::new(ctx)?;
    binding_delta_projection::project_binding_to_delta(
        &binding_resources,
        &delta_resources,
        logical,
        binding,
        native,
        &loss,
        ctx,
    )
}
pub fn execute_wire(wire: &str) -> String {
    let mut control = |_| Ok(());
    execute_wire_with_control(wire, &mut control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire, &mut ctx)?;
        execute(&request, &mut ctx).and_then(|value| encode(&value, &mut ctx))
    })();
    result_envelope(result)
}

// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{decode, encode, field, result_envelope};
use umf_core::{
    binding_iceberg_projection, binding_index_projection::BindingIndexProjectionResources,
    iceberg_table::IcebergTableResources, Context, EngineError, Utf16, Value,
};

pub const PROFILE: &str = "umf.binding-iceberg-projection-wire/1";
fn err(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(value)) => Ok(value),
        _ => Err(err(&format!("{name} must be text"))),
    }
}
fn execute(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    if text(field(value, "profile"), "profile")? != &Utf16::from(PROFILE) {
        return Err(err("wrong projection profile"));
    }
    let operation = text(field(value, "op"), "op")?
        .to_utf8()
        .map_err(|_| err("operation must be UTF-8"))?;
    if operation
        .strip_prefix("binding-iceberg-projection.")
        .unwrap_or(&operation)
        != "projectBindingToIceberg"
    {
        return Err(err("unknown projection operation"));
    }
    let logical = field(value, "logical").ok_or_else(|| err("logical is required"))?;
    let binding = field(value, "binding").ok_or_else(|| err("binding is required"))?;
    let native = field(value, "nativeArchive").ok_or_else(|| err("nativeArchive is required"))?;
    let loss = text(field(value, "lossPolicy"), "lossPolicy")?
        .to_utf8()
        .map_err(|_| err("lossPolicy must be UTF-8"))?;
    let binding_resources = BindingIndexProjectionResources::new(ctx)?;
    let iceberg_resources = IcebergTableResources::new(ctx)?;
    binding_iceberg_projection::project_binding_to_iceberg(
        &binding_resources,
        &iceberg_resources,
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

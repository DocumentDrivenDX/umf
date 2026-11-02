// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{decode, encode, field, result_envelope};
use umf_core::{
    binding_index_projection::BindingIndexProjectionResources, binding_sqlserver_planned_indexes,
    Context, EngineError, Utf16, Value,
};
pub const PROFILE: &str = "umf.binding-parquet-projection-wire/1";
fn err(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(v)) => Ok(v),
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
    let op = operation
        .strip_prefix("binding-parquet-projection.")
        .unwrap_or(&operation);
    if op != "projectBindingToParquet" {
        return Err(err("unknown projection operation"));
    }
    let binding = field(value, "binding").ok_or_else(|| err("binding is required"))?;
    let logical = field(value, "logical").ok_or_else(|| err("logical is required"))?;
    let loss = text(field(value, "lossPolicy"), "lossPolicy")?
        .to_utf8()
        .map_err(|_| err("lossPolicy must be UTF-8"))?;
    let resources = BindingIndexProjectionResources::new(ctx)?;
    let result = binding_sqlserver_planned_indexes::project_binding_to_parquet(
        &resources,
        logical,
        binding,
        &loss,
        field(value, "nativeArchive"),
        ctx,
    )?;
    if let Some(archive) = field(value, "nativeArchive") {
        let parquet = crate::parquet_capture_binding::Resources::shared(ctx)?;
        let mut capabilities = crate::parquet_capture_binding::Accept;
        let _ = umf_core::parquet_capture_inspection::export_parquet_capture(
            archive,
            &parquet.engine,
            &parquet.registry,
            &mut capabilities,
            ctx,
        )?;
    }
    Ok(result)
}
pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let value = decode(wire, &mut ctx)?;
        execute(&value, &mut ctx).and_then(|out| encode(&out, &mut ctx))
    })();
    result_envelope(result)
}

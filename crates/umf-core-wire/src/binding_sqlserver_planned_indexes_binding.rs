// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{decode, encode, field, result_envelope};
use umf_core::{
    binding_index_projection::BindingIndexProjectionResources, binding_sqlserver_planned_indexes,
    Context, EngineError, Utf16, Value,
};
pub const PROFILE: &str = "umf.binding-sqlserver-planned-index-projection-wire/1";
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
        .strip_prefix("binding-sqlserver-planned-index-projection.")
        .unwrap_or(&operation);
    if op != "projectBindingIndexesAgainstSqlServerPlan" {
        return Err(err("unknown projection operation"));
    }
    let source = field(value, "binding").ok_or_else(|| err("binding is required"))?;
    let logical = field(value, "logical").ok_or_else(|| err("logical is required"))?;
    let planned =
        field(value, "plannedColumns").ok_or_else(|| err("plannedColumns is required"))?;
    let loss = text(field(value, "lossPolicy"), "lossPolicy")?
        .to_utf8()
        .map_err(|_| err("lossPolicy must be UTF-8"))?;
    let resources = BindingIndexProjectionResources::new(ctx)?;
    binding_sqlserver_planned_indexes::project_binding_indexes_against_sqlserver_plan(
        &resources, logical, source, planned, &loss, ctx,
    )
}
// Fixed schemas are prepared in one admitted cold lifetime. Caller data,
// counters and limits stay on this Context; no cross-call input cache exists.
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
        let value = decode(wire, ctx)?;
        execute(&value, ctx).and_then(|out| encode(&out, ctx))
        };
    let result = if owned { ctx.with_codegen_construction(run) } else { run(ctx) };
    result_envelope(result)
}

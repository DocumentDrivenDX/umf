// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{decode, encode, field, result_envelope};
use umf_core::{
    binding_index_projection::BindingIndexProjectionResources,
    binding_inspection::BindingInspectionResources, binding_sqlserver_physical, Context,
    EngineError, Utf16, Value,
};
pub const PROFILE: &str = "umf.binding-sqlserver-physical-wire/1";
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
    let op = op
        .strip_prefix("binding-sqlserver-physical.")
        .unwrap_or(&op);
    let index_resources = BindingIndexProjectionResources::new(ctx)?;
    let binding_resources = BindingInspectionResources::new(ctx)?;
    match op {
        "projectBindingToSqlServer" => {
            let logical = field(value, "logical").ok_or_else(|| err("logical is required"))?;
            let binding = field(value, "binding").ok_or_else(|| err("binding is required"))?;
            let policy = field(value, "policy").ok_or_else(|| err("policy is required"))?;
            let loss = text(field(value, "lossPolicy"), "lossPolicy")?
                .to_utf8()
                .map_err(|_| err("lossPolicy must be text"))?;
            binding_sqlserver_physical::project_binding_to_sqlserver(
                &index_resources,
                &binding_resources,
                logical,
                binding,
                policy,
                &loss,
                field(value, "nativeSource"),
                ctx,
            )
        }
        "verifyBindingSqlServerProjection"
        | "recoverBindingSqlServerSources"
        | "recoverBindingSqlServerNative" => {
            let receipt = field(value, "receipt").ok_or_else(|| err("receipt is required"))?;
            let current = field(value, "current").ok_or_else(|| err("current is required"))?;
            match op {
                "verifyBindingSqlServerProjection" => {
                    binding_sqlserver_physical::verify_binding_sqlserver_projection(
                        &index_resources,
                        &binding_resources,
                        receipt,
                        current,
                        ctx,
                    )
                }
                "recoverBindingSqlServerSources" => {
                    binding_sqlserver_physical::recover_binding_sqlserver_sources(
                        &index_resources,
                        &binding_resources,
                        receipt,
                        current,
                        ctx,
                    )
                }
                _ => binding_sqlserver_physical::recover_binding_sqlserver_native(
                    &index_resources,
                    &binding_resources,
                    receipt,
                    current,
                    ctx,
                ),
            }
        }
        _ => Err(err("unknown projection operation")),
    }
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
        let request = decode(wire, ctx)?;
        execute(&request, ctx).and_then(|out| encode(&out, ctx))
        };
    let result = if owned { ctx.with_codegen_construction(run) } else { run(ctx) };
    result_envelope(result)
}

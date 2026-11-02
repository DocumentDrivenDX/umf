// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{decode, encode, field, result_envelope};
use umf_core::{
    binding_index_projection::BindingIndexProjectionResources, binding_sqlserver_tables, Context,
    EngineError, Utf16, Value,
};
pub const PROFILE: &str = "umf.binding-sqlserver-tables-wire/1";
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
    let op = op.strip_prefix("binding-sqlserver-tables.").unwrap_or(&op);
    if ![
        "projectBindingTablesToSqlServer",
        "projectBindingTablesAndIndexesFromPlanToSqlServer",
        "projectBindingTablesAndIndexesToSqlServer",
    ]
    .contains(&op)
    {
        return Err(err("unknown projection operation"));
    }
    let logical = field(value, "logical").ok_or_else(|| err("logical is required"))?;
    let binding = field(value, "binding").ok_or_else(|| err("binding is required"))?;
    let policy = field(value, "policy").ok_or_else(|| err("policy is required"))?;
    let loss = text(field(value, "lossPolicy"), "lossPolicy")?
        .to_utf8()
        .map_err(|_| err("lossPolicy must be text"))?;
    let resources = BindingIndexProjectionResources::new(ctx)?;
    match op {
        "projectBindingTablesToSqlServer" => {
            binding_sqlserver_tables::project_binding_tables_to_sqlserver(
                &resources,
                logical,
                binding,
                policy,
                &loss,
                field(value, "nativeSource"),
                ctx,
            )
        }
        "projectBindingTablesAndIndexesFromPlanToSqlServer" => {
            binding_sqlserver_tables::project_binding_tables_and_indexes_from_plan_to_sqlserver(
                &resources,
                logical,
                binding,
                policy,
                &loss,
                field(value, "nativeSource"),
                ctx,
            )
        }
        "projectBindingTablesAndIndexesToSqlServer" => {
            let native_source =
                field(value, "nativeSource").ok_or_else(|| err("nativeSource is required"))?;
            binding_sqlserver_tables::project_binding_tables_and_indexes_to_sqlserver(
                &resources,
                logical,
                binding,
                policy,
                native_source,
                &loss,
                ctx,
            )
        }
        _ => unreachable!(),
    }
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
        execute(&request, &mut ctx).and_then(|out| encode(&out, &mut ctx))
    })();
    result_envelope(result)
}

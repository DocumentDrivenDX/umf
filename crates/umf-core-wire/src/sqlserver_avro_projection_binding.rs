// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{decode, encode, field, result_envelope};
use umf_core::{sqlserver_avro_projection, Context, EngineError, Utf16, Value};
pub const PROFILE: &str = "umf.sqlserver-avro-projection-wire/1";
const OP: &str = "sqlserver-avro-projection.projectSqlServerToAvro";
fn req(m: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), m)
}
fn text<'a>(v: Option<&'a Value>, n: &str) -> Result<&'a Utf16, EngineError> {
    if let Some(Value::String(s)) = v {
        Ok(s)
    } else {
        Err(req(&format!("{n} must be a string")))
    }
}
fn execute(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Value::Object(fields) = v else {
        return Err(req("request must be an object"));
    };
    if fields.iter().any(|(k, _)| {
        !["profile", "op", "source", "policy"]
            .iter()
            .any(|n| k == &Utf16::from(*n))
    }) {
        return Err(req("unknown request member"));
    }
    if text(field(v, "profile"), "profile")? != &Utf16::from(PROFILE)
        || text(field(v, "op"), "op")? != &Utf16::from(OP)
    {
        return Err(req("wrong projection operation"));
    }
    let source = field(v, "source").ok_or_else(|| req("source is required"))?;
    let policy = field(v, "policy").ok_or_else(|| req("policy is required"))?;
    sqlserver_avro_projection::project_sqlserver_to_avro(source, policy, ctx)
}
pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let r = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let v = decode(wire, &mut ctx)?;
        execute(&v, &mut ctx).and_then(|out| encode(&out, &mut ctx))
    })();
    result_envelope(r)
}

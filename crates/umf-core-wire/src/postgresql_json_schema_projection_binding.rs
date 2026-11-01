// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{decode, encode, field, result_envelope};
use umf_core::{postgresql_json_schema_projection, Context, EngineError, Utf16, Value};
pub const PROFILE: &str = "umf.postgresql-json-schema-projection-wire/1";
const OP: &str = "postgresql-json-schema-projection.projectPostgresqlRowToJsonSchema";
fn req(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    if let Some(Value::String(value)) = value {
        Ok(value)
    } else {
        Err(req(&format!("{name} must be a string")))
    }
}
fn execute(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Value::Object(fields) = value else {
        return Err(req("request must be an object"));
    };
    if fields.iter().any(|(name, _)| {
        !["profile", "op", "source", "policy"]
            .iter()
            .any(|known| name == &Utf16::from(*known))
    }) {
        return Err(req("unknown request member"));
    }
    if text(field(value, "profile"), "profile")? != &Utf16::from(PROFILE)
        || text(field(value, "op"), "op")? != &Utf16::from(OP)
    {
        return Err(req("wrong projection operation"));
    }
    let source = field(value, "source").ok_or_else(|| req("source is required"))?;
    let policy = field(value, "policy").ok_or_else(|| req("policy is required"))?;
    postgresql_json_schema_projection::project_postgresql_row_to_json_schema(source, policy, ctx)
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
        execute(&value, &mut ctx).and_then(|output| encode(&output, &mut ctx))
    })();
    result_envelope(result)
}

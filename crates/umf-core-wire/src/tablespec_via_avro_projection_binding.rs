// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{decode, encode, field, result_envelope};
use umf_core::{tablespec_via_avro_projection, Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf.tablespec-via-avro-projection-wire/1";
const OP: &str = "tablespec-via-avro-projection.projectToTableSpecViaAvro";

fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    if let Some(Value::String(text)) = value {
        Ok(text)
    } else {
        Err(request(&format!("{name} must be a string")))
    }
}
fn execute(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Value::Object(fields) = value else {
        return Err(request("request must be an object"));
    };
    if fields.iter().any(|(name, _)| {
        !["profile", "op", "source", "policy"]
            .iter()
            .any(|known| name == &Utf16::from(*known))
    }) {
        return Err(request("unknown request member"));
    }
    if text(field(value, "profile"), "profile")? != &Utf16::from(PROFILE)
        || text(field(value, "op"), "op")? != &Utf16::from(OP)
    {
        return Err(request("wrong projection operation"));
    }
    let source = field(value, "source").ok_or_else(|| request("source is required"))?;
    let policy = field(value, "policy").ok_or_else(|| request("policy is required"))?;
    if matches!(field(policy, "sourceKind"), Some(Value::String(kind)) if kind == &Utf16::from("parquet"))
    {
        let resources = crate::parquet_capture_binding::Resources::shared(ctx)?;
        let mut capabilities = crate::parquet_capture_binding::Accept;
        tablespec_via_avro_projection::project_to_tablespec_via_avro(
            source,
            policy,
            Some((&resources.engine, &resources.registry, &mut capabilities)),
            ctx,
        )
    } else {
        tablespec_via_avro_projection::project_to_tablespec_via_avro(source, policy, None, ctx)
    }
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
        execute(&value, &mut ctx).and_then(|result| encode(&result, &mut ctx))
    })();
    result_envelope(result)
}

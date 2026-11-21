// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{decode, encode, field, result_envelope};
use umf_core::{parquet_avro_projection, Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf.parquet-avro-projection-wire/1";
const OP: &str = "parquet-avro-projection.projectParquetToAvro";

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
    let resources = crate::parquet_capture_binding::Resources::shared(ctx)?;
    let mut capabilities = crate::parquet_capture_binding::Accept;
    parquet_avro_projection::project_parquet_to_avro(
        source,
        policy,
        &resources.engine,
        &resources.registry,
        &mut capabilities,
        ctx,
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
        execute(&value, ctx).and_then(|result| encode(&result, ctx))
        };
    let result = if owned { ctx.with_codegen_construction(run) } else { run(ctx) };
    result_envelope(result)
}

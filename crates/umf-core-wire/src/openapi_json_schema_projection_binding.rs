// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed wire for Rust-owned OpenAPI → JSON Schema projection.
use crate::{decode, encode, field, result_envelope};
use std::collections::BTreeSet;
use umf_core::{Context, EngineError, Utf16, Value};
pub const PROFILE: &str = "umf.openapi-json-schema-projection-wire/1";
pub const OPERATION: &str = "openapi-json-schema-projection.projectOpenapiToJsonSchema";
fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(v: Option<&'a Value>, n: &str) -> Result<&'a Utf16, EngineError> {
    match v {
        Some(Value::String(s)) => Ok(s),
        _ => Err(request(&format!("{n} must be a string"))),
    }
}
fn execute(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Value::Object(fields) = value else {
        return Err(request("request must be an object"));
    };
    let mut seen = BTreeSet::new();
    for (k, _) in fields {
        ctx.charge_work(k.len().saturating_add(1), Utf16::default())?;
        if !["profile", "op", "source", "policy"]
            .iter()
            .any(|x| k == &Utf16::from(*x))
            || !seen.insert(k)
        {
            return Err(request("request has an unknown or duplicate member"));
        }
    }
    if text(field(value, "profile"), "profile")? != &Utf16::from(PROFILE)
        || text(field(value, "op"), "op")? != &Utf16::from(OPERATION)
    {
        return Err(request("wrong OpenAPI projection profile or operation"));
    }
    let source = field(value, "source").ok_or_else(|| request("source is required"))?;
    let policy = field(value, "policy").ok_or_else(|| request("policy is required"))?;
    umf_core::openapi_json_schema_projection::project_openapi_to_json_schema(source, policy, ctx)
}
pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(wire, &mut no_control)
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

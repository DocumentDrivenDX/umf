// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{decode, encode, field, result_envelope};
use umf_core::{typespec_smithy_jsonschema_projection, Context, EngineError, Utf16, Value};
pub const PROFILE: &str = "umf.typespec-smithy-jsonschema-projection-wire/1";
fn err(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(value)) => Ok(value),
        _ => Err(err(&format!("{name} must be text"))),
    }
}
fn only(value: &Value, known: &[&str]) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err("request must be an object"));
    };
    if fields
        .iter()
        .any(|(key, _)| !known.iter().any(|name| key == &Utf16::from(*name)))
    {
        return Err(err("unknown request member"));
    }
    Ok(())
}
fn execute(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    if text(field(value, "profile"), "profile")? != &Utf16::from(PROFILE) {
        return Err(err("wrong projection profile"));
    }
    let operation = text(field(value, "op"), "op")?
        .to_utf8()
        .map_err(|_| err("operation must be UTF-8"))?;
    let operation = operation
        .strip_prefix("typespec-smithy-jsonschema-projection.")
        .unwrap_or(&operation);
    let known: &[&str] = match operation {
        "prepareTypeSpecJsonSchema" | "prepareSmithyJsonSchema" => {
            &["profile", "op", "source", "policy"]
        }
        "completeTypeSpecJsonSchema" => &["profile", "op", "source", "policy", "emission"],
        "completeSmithyJsonSchema" => &[
            "profile",
            "op",
            "source",
            "policy",
            "assembly",
            "nativeSchema",
            "adaptedSchema",
            "hostFailure",
            "serviceCapability",
        ],
        _ => &["profile", "op"],
    };
    only(value, known)?;
    let source = field(value, "source").ok_or_else(|| err("source is required"))?;
    let policy = field(value, "policy").ok_or_else(|| err("policy is required"))?;
    match operation {
        "prepareTypeSpecJsonSchema" => {
            typespec_smithy_jsonschema_projection::prepare_typespec(source, policy, ctx)
        }
        "completeTypeSpecJsonSchema" => typespec_smithy_jsonschema_projection::complete_typespec(
            source,
            policy,
            field(value, "emission").ok_or_else(|| err("emission is required"))?,
            ctx,
        ),
        "prepareSmithyJsonSchema" => {
            typespec_smithy_jsonschema_projection::prepare_smithy(source, policy, ctx)
        }
        "completeSmithyJsonSchema" => typespec_smithy_jsonschema_projection::complete_smithy(
            source,
            policy,
            field(value, "assembly").ok_or_else(|| err("assembly is required"))?,
            field(value, "nativeSchema"),
            field(value, "adaptedSchema"),
            field(value, "hostFailure"),
            field(value, "serviceCapability"),
            ctx,
        ),
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
        let value = decode(wire, ctx)?;
        execute(&value, ctx).and_then(|output| encode(&output, ctx))
        };
    let result = if owned { ctx.with_codegen_construction(run) } else { run(ctx) };
    result_envelope(result)
}

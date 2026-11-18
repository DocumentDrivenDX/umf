// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed wire route for authored SQL Server cardinality projection and recovery.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{cardinality_sqlserver_projection, Context, EngineError, Utf16, Value};
pub const PROFILE: &str = "umf.cardinality-sqlserver-projection-binding/1.0.0";
fn req(s: &'static str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), s)
}
fn execute(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Value::Object(m) = v else {
        return Err(req("Request must be an object"));
    };
    for (i, (key, _)) in m.iter().enumerate() {
        if ![
            "profile",
            "op",
            "author",
            "request",
            "receipt",
            "nativeText",
        ]
        .iter()
        .any(|s| key == &Utf16::from(*s))
        {
            return Err(req(
                "Unknown cardinality SQL Server projection request member",
            ));
        }
        if m[..i].iter().any(|(p, _)| p == key) {
            return Err(req(
                "Duplicate cardinality SQL Server projection request member",
            ));
        }
    }
    if text_field(v, "profile").as_deref() != Some(PROFILE) {
        return Err(req("Cardinality SQL Server projection profile is required"));
    }
    let op = text_field(v, "op").ok_or_else(|| req("Operation is required"))?;
    let op = op
        .strip_prefix("cardinality-sqlserver-projection.")
        .unwrap_or(&op);
    match op {
        "projectCardinalityToSqlServer" => {
            cardinality_sqlserver_projection::project_cardinality_to_sqlserver(
                field(v, "author").ok_or_else(|| req("author is required"))?,
                field(v, "request").ok_or_else(|| req("request is required"))?,
                ctx,
            )
        }
        "recoverCardinalityFromSqlServer" => {
            cardinality_sqlserver_projection::recover_cardinality_from_sqlserver(
                field(v, "receipt").ok_or_else(|| req("receipt is required"))?,
                field(v, "nativeText").ok_or_else(|| req("nativeText is required"))?,
                ctx,
            )
        }
        _ => Err(req("Unknown cardinality SQL Server projection operation")),
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
        let v = decode(wire, ctx)?;
        execute(&v, ctx).and_then(|out| encode(&out, ctx))
        };
    let r = if owned { ctx.with_codegen_construction(run) } else { run(ctx) };
    result_envelope(r)
}

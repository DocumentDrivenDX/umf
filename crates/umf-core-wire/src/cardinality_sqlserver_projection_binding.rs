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
pub fn execute_wire(wire: &str) -> String {
    let mut no = |_| Ok(());
    execute_wire_with_control(wire, &mut no)
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

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed transport for Avro ↔ TableSpec schema projections.
use std::collections::BTreeSet;

use umf_core::{
    avro_tablespec_projection, tablespec_adapter::TableSpecRuntime, Context, EngineError, Utf16,
    Value,
};

use crate::{decode, encode, field, result_envelope};

pub const PROFILE: &str = "umf.avro-tablespec-projection-wire/1";
const AVRO_OP: &str = "avro-tablespec-projection.projectAvroToTableSpec";
const TABLESPEC_OP: &str = "avro-tablespec-projection.projectTableSpecToAvro";

fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}

fn member_text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(value)) => Ok(value),
        _ => Err(request(&format!("{name} must be a string"))),
    }
}

fn execute(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Value::Object(fields) = value else {
        return Err(request("request must be an object"));
    };
    let mut seen = BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_text(key.len(), Utf16::default())?;
        ctx.charge_work(1, Utf16::default())?;
        if !["profile", "op", "source", "policy"]
            .iter()
            .any(|name| key == &Utf16::from(*name))
            || !seen.insert(key)
        {
            return Err(request("request contains an unknown or duplicate member"));
        }
    }
    if member_text(field(value, "profile"), "profile")? != &Utf16::from(PROFILE) {
        return Err(request("wrong Avro/TableSpec projection profile"));
    }
    let operation = member_text(field(value, "op"), "op")?;
    let source = field(value, "source").ok_or_else(|| request("source is required"))?;
    let policy = field(value, "policy").ok_or_else(|| request("policy is required"))?;
    let tablespec = TableSpecRuntime::new(ctx)?;
    match operation {
        op if op == &Utf16::from(AVRO_OP) => {
            avro_tablespec_projection::project_avro_to_tablespec(source, policy, &tablespec, ctx)
        }
        op if op == &Utf16::from(TABLESPEC_OP) => {
            avro_tablespec_projection::project_tablespec_to_avro(source, policy, &tablespec, ctx)
        }
        _ => Err(request("unknown Avro/TableSpec projection operation")),
    }
}

pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}

pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire, &mut ctx)?;
        execute(&request, &mut ctx).and_then(|output| encode(&output, &mut ctx))
    })();
    result_envelope(result)
}

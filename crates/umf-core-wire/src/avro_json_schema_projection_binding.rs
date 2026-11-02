// SPDX-License-Identifier: MIT OR Apache-2.0
//! Separate, closed transport for Avro → JSON Schema projections.
use std::collections::BTreeSet;

use umf_core::{
    avro_json_schema_projection::{self, AvroDocumentBindings, LossPolicy},
    Context, EngineError, Utf16, Value,
};

use crate::{decode, encode, field, result_envelope};

pub const PROFILE: &str = "umf.avro-json-schema-projection-wire/1";
pub const OPERATION: &str = "avro-json-schema-projection.projectAvroToJsonSchema";

fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}

fn member_text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(value)) => Ok(value),
        _ => Err(request(&format!("{name} must be a string"))),
    }
}

fn binding_text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(value)) => Ok(value),
        _ => Err(EngineError::new(
            "AVRO_BINDINGS",
            Utf16::default(),
            format!("{name} must be a string"),
        )),
    }
}

fn parse_bindings(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<AvroDocumentBindings, EngineError> {
    let Value::Object(fields) = value else {
        return Err(request("bindings must be an object"));
    };
    let allowed = ["id", "schemaId", "long", "bytes", "union", "lossPolicy"];
    let mut seen = BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_text(key.len(), Utf16::default())?;
        ctx.charge_work(1, Utf16::default())?;
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) || !seen.insert(key) {
            return Err(EngineError::new(
                "AVRO_BINDINGS",
                Utf16::default(),
                "Bindings contain an unknown or duplicate member",
            ));
        }
    }
    let id_source = binding_text(field(value, "id"), "id")?;
    let schema_id_source = binding_text(field(value, "schemaId"), "schemaId")?;
    ctx.charge_text(
        id_source.len().saturating_add(schema_id_source.len()),
        Utf16::default(),
    )?;
    let id = id_source.clone();
    let schema_id = schema_id_source.clone();
    if binding_text(field(value, "long"), "long")? != &Utf16::from("decimal-string")
        || binding_text(field(value, "bytes"), "bytes")? != &Utf16::from("hex-string")
        || binding_text(field(value, "union"), "union")? != &Utf16::from("untagged")
    {
        return Err(EngineError::new(
            "AVRO_BINDINGS",
            Utf16::default(),
            "Only the documented Avro instance bindings are supported",
        ));
    }
    let loss_text = binding_text(field(value, "lossPolicy"), "lossPolicy")?
        .to_utf8()
        .map_err(|_| {
            EngineError::new(
                "AVRO_BINDINGS",
                Utf16::default(),
                "Loss policy must be valid UTF-16",
            )
        })?;
    let loss_policy = match loss_text.as_str() {
        "strict" => LossPolicy::Strict,
        "allow-reported-loss" => LossPolicy::AllowReportedLoss,
        _ => {
            return Err(EngineError::new(
                "AVRO_BINDINGS",
                Utf16::default(),
                "Unsupported loss policy",
            ));
        }
    };
    Ok(AvroDocumentBindings {
        id,
        schema_id,
        loss_policy,
    })
}

fn execute(request_value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Value::Object(fields) = request_value else {
        return Err(request("request must be an object"));
    };
    let allowed = ["profile", "op", "document", "bindings"];
    let mut seen = BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_text(key.len(), Utf16::default())?;
        ctx.charge_work(1, Utf16::default())?;
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) || !seen.insert(key) {
            return Err(request("request contains an unknown or duplicate member"));
        }
    }
    if member_text(field(request_value, "profile"), "profile")? != &Utf16::from(PROFILE)
        || member_text(field(request_value, "op"), "op")? != &Utf16::from(OPERATION)
    {
        return Err(request("wrong Avro projection profile or operation"));
    }
    let document =
        field(request_value, "document").ok_or_else(|| request("document is required"))?;
    let bindings = parse_bindings(
        field(request_value, "bindings").ok_or_else(|| request("bindings are required"))?,
        ctx,
    )?;
    avro_json_schema_projection::project_avro_to_json_schema(document, &bindings, ctx)
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

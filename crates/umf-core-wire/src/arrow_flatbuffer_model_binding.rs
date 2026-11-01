// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned logical Arrow FlatBuffer model host routes.
use crate::{decode, encode, field, result_envelope};
use std::collections::BTreeSet;
use umf_core::{arrow_flatbuffer_model, Context, EngineError, Utf16, Value};
pub const PROFILE: &str = "umf.arrow-flatbuffer-model-wire/1";
fn err(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(v: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    if let Some(Value::String(v)) = v {
        Ok(v)
    } else {
        Err(err(&format!("{name} must be a string")))
    }
}
fn execute(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Value::Object(fields) = request else {
        return Err(err("request must be an object"));
    };
    let mut seen = BTreeSet::new();
    for (k, _) in fields {
        ctx.charge_work(k.len().saturating_add(1), Utf16::default())?;
        if ![
            "profile",
            "op",
            "text",
            "id",
            "document",
            "path",
            "replacement",
        ]
        .iter()
        .any(|x| k == &Utf16::from(*x))
            || !seen.insert(k)
        {
            return Err(err("request has unknown or duplicate fields"));
        }
    }
    if text(field(request, "profile"), "profile")? != &Utf16::from(PROFILE) {
        return Err(err("wrong Arrow FlatBuffer model profile"));
    }
    let op = text(field(request, "op"), "op")?
        .to_utf8()
        .map_err(|_| err("op must be valid UTF-16"))?;
    match op.as_str() {
        "arrow-flatbuffer-model.importArrowFlatbufferModel" => {
            let source = text(field(request, "text"), "text")?;
            let id = text(field(request, "id"), "id")?;
            arrow_flatbuffer_model::import_arrow_flatbuffer_model(source, id, ctx)
        }
        "arrow-flatbuffer-model.inspectArrowFlatbufferModel" => {
            let d = field(request, "document").ok_or_else(|| err("document required"))?;
            arrow_flatbuffer_model::inspect_arrow_flatbuffer_model(d, ctx)
        }
        "arrow-flatbuffer-model.exportArrowFlatbufferModel" => {
            let d = field(request, "document").ok_or_else(|| err("document required"))?;
            Ok(Value::String(
                arrow_flatbuffer_model::export_arrow_flatbuffer_model(d, ctx)?,
            ))
        }
        "arrow-flatbuffer-model.proposeArrowFlatbufferEdit" => {
            let d = field(request, "document").ok_or_else(|| err("document required"))?;
            let path = text(field(request, "path"), "path")?;
            let replacement =
                field(request, "replacement").ok_or_else(|| err("replacement required"))?;
            arrow_flatbuffer_model::propose_arrow_flatbuffer_edit(d, path, replacement, ctx)
        }
        _ => Err(err("unknown Arrow FlatBuffer model operation")),
    }
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

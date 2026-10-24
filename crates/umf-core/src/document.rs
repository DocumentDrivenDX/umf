// SPDX-License-Identifier: MIT OR Apache-2.0
//! Document operations layered over the caller-supplied semantic authority.
//!
//! There is deliberately no hidden import of generated schemas here. Each
//! distribution supplies the Engine it constructed from its embedded resources.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::{EngineError, Validation},
    registry::Registry,
    serialization::{self, Format},
    value::{Utf16, Value},
};

pub fn read_document(
    source: &[u16],
    format: Format,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let value = serialization::read_json_value(source, format, ctx)?;
    require_valid(engine, &value, registry, capabilities, ctx)?;
    Ok(value)
}

pub fn write_document(
    document: &Value,
    format: Format,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    require_valid(engine, document, registry, capabilities, ctx)?;
    serialization::write_json_value(document, format, ctx)
}

pub fn validate_document(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    engine.validate_document(document, registry, capabilities, ctx)
}

fn require_valid(
    engine: &Engine,
    document: &Value,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let result = engine.validate_document(document, registry, capabilities, ctx)?;
    if result.valid {
        return Ok(());
    }
    let first = result.diagnostics.first();
    Err(EngineError::new(
        "INVALID_DOCUMENT",
        first.map(|d| d.path.clone()).unwrap_or_default(),
        first
            .map(|d| d.message.clone())
            .unwrap_or_else(|| Utf16::from("Document is invalid")),
    ))
}

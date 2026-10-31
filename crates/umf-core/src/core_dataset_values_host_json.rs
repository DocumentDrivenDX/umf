// SPDX-License-Identifier: MIT OR Apache-2.0
//! Staged `umf.host-json/1` admission for full Dataset value validate/verify.
//! Rust controls when each opaque caller value is copied; host reflection is
//! limited to the closed primitive interface in `host_json`.
use crate::{
    Context, Engine, EngineError,
    engine::{Capabilities, SemanticContext},
    error::Diagnostic,
    host_json::{HostHandle, HostJsonReflection, copy_host_json},
    registry::Registry,
    value::{Utf16, Value},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CoreDatasetValuesHostOperation {
    Validate,
    Verify,
}

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn missing_handle() -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), "Missing host input handle")
}

/// Execute full Dataset values operations over opaque caller roots. The
/// operation's Rust schemas should be prepared before this call; user values
/// are admitted strictly in predecessor order under `ctx`.
pub fn execute(
    operation: CoreDatasetValuesHostOperation,
    handles: &[HostHandle],
    host: &mut dyn HostJsonReflection,
    validator: &crate::dataset_values::CoreDatasetValueValidator,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let handle = |index: usize| handles.get(index).copied().ok_or_else(missing_handle);
    let registry = Registry::default();
    let mut capabilities = NoCapabilities;
    match operation {
        CoreDatasetValuesHostOperation::Validate => {
            let source = copy_host_json(handle(0)?, host, ctx)?;
            let input = copy_host_json(handle(1)?, host, ctx)?;
            validator.validate_admitted(&source, &input, engine, &registry, &mut capabilities, ctx)
        }
        CoreDatasetValuesHostOperation::Verify => {
            let receipt = copy_host_json(handle(0)?, host, ctx)?;
            validator.verify_admitted_with(
                receipt,
                |index, ctx| copy_host_json(handle(index + 1)?, host, ctx),
                engine,
                &registry,
                &mut capabilities,
                ctx,
            )
        }
    }
}

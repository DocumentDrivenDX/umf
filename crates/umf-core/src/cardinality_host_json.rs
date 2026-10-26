// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private Rust-owned host admission for the bounded Core Cardinality route.
use crate::{
    engine::{Capabilities, SemanticContext},
    error::Diagnostic,
    host_json::{copy_host_json, HostHandle, HostJsonReflection},
    registry::Registry,
    value::{Utf16, Value},
    Context, Engine, EngineError,
};

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

fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn missing_handle() -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), "Missing host input handle")
}
fn identity(value: Value) -> Result<crate::cardinality::Identity, EngineError> {
    let invalid = || {
        EngineError::new(
            "CORE_CARDINALITY_IDENTITY",
            Utf16::default(),
            "Expected explicit module and element identities",
        )
    };
    let Value::Object(fields) = value else {
        return Err(invalid());
    };
    if fields.len() != 2
        || fields
            .iter()
            .any(|(name, _)| name != &key("module") && name != &key("element"))
    {
        return Err(invalid());
    }
    let get = |name: &str| {
        fields
            .iter()
            .find(|(field, _)| field == &key(name))
            .map(|(_, value)| value)
    };
    let module = get("module").and_then(|value| {
        if let Value::String(text) = value {
            Some(text.clone())
        } else {
            None
        }
    });
    let element = get("element").and_then(|value| {
        if let Value::String(text) = value {
            Some(text.clone())
        } else {
            None
        }
    });
    match (module, element) {
        (Some(module), Some(element)) if !module.is_empty() && !element.is_empty() => {
            Ok(crate::cardinality::Identity { module, element })
        }
        _ => Err(invalid()),
    }
}

/// Execute one of the three Core Cardinality operations using opaque roots.
/// Rust controls each reflection point and all copying/semantics share `ctx`.
/// Handles are `[source, identity, request]` for inspect/declare and
/// `[receipt, current]` for verification.
pub fn execute(
    operation: &str,
    handles: &[HostHandle],
    host: &mut dyn HostJsonReflection,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let handle = |index: usize| handles.get(index).copied().ok_or_else(missing_handle);
    let registry = Registry::default();
    let mut capabilities = NoCapabilities;
    match operation {
        "inspectCoreCardinality" => {
            let source = copy_host_json(handle(0)?, host, ctx)?;
            let identity = identity(copy_host_json(handle(1)?, host, ctx)?)?;
            crate::cardinality::inspect_core_cardinality_after_admission(
                source,
                &identity,
                engine,
                &registry,
                &mut capabilities,
                ctx,
            )
        }
        "declareCoreCardinality" => {
            let request = copy_host_json(handle(2)?, host, ctx)?;
            let request =
                crate::cardinality::admit_core_cardinality_request_admitted(request, ctx)?;
            let source = copy_host_json(handle(0)?, host, ctx)?;
            let identity = identity(copy_host_json(handle(1)?, host, ctx)?)?;
            crate::cardinality::declare_core_cardinality_after_admission(
                source,
                &identity,
                request,
                engine,
                &registry,
                &mut capabilities,
                ctx,
            )
        }
        "verifyCoreCardinalityDeclaration" => {
            let receipt = copy_host_json(handle(0)?, host, ctx)?;
            let prepared =
                crate::cardinality::prepare_core_cardinality_verification_after_admission(
                    receipt,
                    engine,
                    &registry,
                    &mut capabilities,
                    ctx,
                )?;
            let current = copy_host_json(handle(1)?, host, ctx)?;
            crate::cardinality::finish_core_cardinality_verification_after_admission(
                prepared, current, ctx,
            )
        }
        _ => Err(EngineError::new(
            "REQUEST",
            Utf16::default(),
            "Unknown Core Cardinality host operation",
        )),
    }
}

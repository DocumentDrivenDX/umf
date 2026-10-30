//! Staged `umf.host-json/1` entry points for core kind/nullability operations.
//! The host only supplies opaque roots; Rust decides when each root is admitted.
use crate::{
    engine::{Capabilities, SemanticContext},
    error::Diagnostic,
    host_json::{
        copy_host_json, read_host_string_value, HostHandle, HostJsonEvent, HostJsonKind,
        HostJsonReflection, HostJsonReply,
    },
    registry::Registry,
    value::{Utf16, Value},
    Context, Engine, EngineError,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CoreKindNullabilityHostOperation {
    InspectKind,
    DeclareKind,
    VerifyKind,
    InspectNullability,
    DeclareNullability,
    VerifyNullability,
    GetSemanticTypes,
    SetSemanticTypes,
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

fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn identity(value: Value, code: &str) -> Result<(Utf16, Utf16), EngineError> {
    let Value::Object(fields) = value else {
        return Err(EngineError::new(
            code,
            Utf16::default(),
            "Expected explicit module and element identities",
        ));
    };
    if fields
        .iter()
        .any(|(name, _)| name != &key("module") && name != &key("element"))
    {
        return Err(EngineError::new(
            code,
            Utf16::default(),
            "Expected explicit module and element identities",
        ));
    }
    let get = |name: &str| {
        fields
            .iter()
            .find(|(field, _)| field == &key(name))
            .map(|(_, value)| value)
    };
    let module = get("module").and_then(|v| {
        if let Value::String(s) = v {
            Some(s.clone())
        } else {
            None
        }
    });
    let element = get("element").and_then(|v| {
        if let Value::String(s) = v {
            Some(s.clone())
        } else {
            None
        }
    });
    match (module, element) {
        (Some(module), Some(element)) if !module.is_empty() && !element.is_empty() => {
            Ok((module, element))
        }
        _ => Err(EngineError::new(
            code,
            Utf16::default(),
            "Expected explicit module and element identities",
        )),
    }
}

fn request_string(
    host: &mut dyn HostJsonReflection,
    handle: HostHandle,
) -> Result<Option<String>, EngineError> {
    let kind = host.reflect(HostJsonEvent::Classify { handle })?;
    let HostJsonReply::Kind(HostJsonKind::String(string)) = kind else {
        return Ok(None);
    };
    Ok(read_host_string_value(host, string, &Utf16::default())?
        .to_utf8()
        .ok())
}

/// Execute one model operation with predecessor-ordered host admission.
/// All phases share `ctx`; resource construction remains the binding's separate catalog phase.
pub fn execute(
    operation: CoreKindNullabilityHostOperation,
    handles: &[HostHandle],
    host: &mut dyn HostJsonReflection,
    engine: &Engine,
    kind_schemas: &crate::core_kind::OperationSchemas,
    nullability_schemas: &crate::nullability::OperationSchemas,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let registry = Registry::default();
    let mut capabilities = NoCapabilities;
    let handle = |index: usize| {
        handles.get(index).copied().ok_or_else(|| {
            EngineError::new("REQUEST", Utf16::default(), "Missing host input handle")
        })
    };
    match operation {
        CoreKindNullabilityHostOperation::GetSemanticTypes => {
            crate::semantic_type_accessors_host_json::execute(
                crate::semantic_type_accessors_host_json::SemanticTypeAccessorHostOperation::Get,
                handles,
                host,
                engine,
                ctx,
            )
        }
        CoreKindNullabilityHostOperation::SetSemanticTypes => {
            crate::semantic_type_accessors_host_json::execute(
                crate::semantic_type_accessors_host_json::SemanticTypeAccessorHostOperation::Set,
                handles,
                host,
                engine,
                ctx,
            )
        }
        CoreKindNullabilityHostOperation::InspectKind => {
            let source = copy_host_json(handle(0)?, host, ctx)?;
            let identity = identity(copy_host_json(handle(1)?, host, ctx)?, "CORE_KIND_IDENTITY")?;
            crate::core_kind::inspect_core_kind_copied_prepared(
                source,
                &crate::core_kind::Identity {
                    module: identity.0,
                    element: identity.1,
                },
                engine,
                &registry,
                &mut capabilities,
                ctx,
                kind_schemas,
            )
        }
        CoreKindNullabilityHostOperation::DeclareKind => {
            let source = copy_host_json(handle(0)?, host, ctx)?;
            let identity = identity(copy_host_json(handle(1)?, host, ctx)?, "CORE_KIND_IDENTITY")?;
            let request_handle = handle(2)?;
            crate::core_kind::declare_core_kind_copied_with_request_prepared(
                source,
                &crate::core_kind::Identity {
                    module: identity.0,
                    element: identity.1,
                },
                || request_string(host, request_handle),
                engine,
                &registry,
                &mut capabilities,
                ctx,
                kind_schemas,
            )
        }
        CoreKindNullabilityHostOperation::VerifyKind => {
            let receipt = copy_host_json(handle(0)?, host, ctx)?;
            crate::core_kind::verify_core_kind_receipt_prepared(
                &receipt,
                engine,
                &registry,
                &mut capabilities,
                ctx,
                kind_schemas,
            )?;
            let current = copy_host_json(handle(1)?, host, ctx)?;
            crate::core_kind::finish_core_kind_verification(receipt, current, ctx)
        }
        CoreKindNullabilityHostOperation::InspectNullability => {
            let source = copy_host_json(handle(0)?, host, ctx)?;
            let identity = identity(
                copy_host_json(handle(1)?, host, ctx)?,
                "CORE_NULLABILITY_IDENTITY",
            )?;
            crate::nullability::inspect_core_nullability_copied_prepared(
                source,
                &crate::nullability::Identity {
                    module: identity.0,
                    element: identity.1,
                },
                engine,
                &registry,
                &mut capabilities,
                ctx,
                nullability_schemas,
            )
        }
        CoreKindNullabilityHostOperation::DeclareNullability => {
            let source = copy_host_json(handle(0)?, host, ctx)?;
            let identity = identity(
                copy_host_json(handle(1)?, host, ctx)?,
                "CORE_NULLABILITY_IDENTITY",
            )?;
            let request_handle = handle(2)?;
            crate::nullability::declare_core_nullability_copied_with_request_prepared(
                source,
                &crate::nullability::Identity {
                    module: identity.0,
                    element: identity.1,
                },
                || request_string(host, request_handle),
                engine,
                &registry,
                &mut capabilities,
                ctx,
                nullability_schemas,
            )
        }
        CoreKindNullabilityHostOperation::VerifyNullability => {
            let receipt = copy_host_json(handle(0)?, host, ctx)?;
            crate::nullability::verify_core_nullability_receipt_prepared(
                &receipt,
                engine,
                &registry,
                &mut capabilities,
                ctx,
                nullability_schemas,
            )?;
            let current = copy_host_json(handle(1)?, host, ctx)?;
            crate::nullability::finish_core_nullability_verification(receipt, current, ctx)
        }
    }
}

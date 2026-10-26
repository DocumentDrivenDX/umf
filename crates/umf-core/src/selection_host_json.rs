// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private host-JSON Selection route. Caller-owned registrations are inspected
//! through the observed scope and structure stages; semantic execution and
//! structure-diagnostic materialization remain explicit boundaries.
use std::cell::RefCell;

use crate::{
    Context, Engine, EngineError,
    engine::{Capabilities, SemanticContext},
    error::Diagnostic,
    host_json::{
        HostHandle, HostInvokeValue, HostJsonEvent, HostJsonReflection, HostJsonReply,
        HostOpaqueKey, HostOpaqueType, HostOpaqueValue, copy_host_json,
    },
    registry::{HostRegistrationStage, RegistrationLookup, RegistrationProvider},
    value::{Utf16, Value},
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
/// Delayed Registry.get calls use the same opaque callback primitives as the
/// rest of the host protocol. A returned registration is kept as a host
/// handle until its exact extension-payload stage; no registration is
/// enumerated or cached.
struct HostProvider<'a> {
    registry: Option<HostHandle>,
    host: RefCell<&'a mut dyn HostJsonReflection>,
}

impl RegistrationProvider for HostProvider<'_> {
    fn lookup<'a>(
        &'a self,
        id: &Utf16,
        version: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Option<RegistrationLookup<'a>>, EngineError> {
        let Some(registry) = self.registry else {
            return Ok(None);
        };
        let mut host = self.host.borrow_mut();
        ctx.charge_work(1, Utf16::default())?;
        let method = match host.reflect(HostJsonEvent::GetOpaqueProperty {
            receiver: HostInvokeValue::Opaque(registry),
            key: HostOpaqueKey::String(Utf16::from("get").into_units()),
            semantic_catch: false,
        })? {
            HostJsonReply::OpaqueValue(value) => value,
            _ => return Err(protocol_error()),
        };
        let HostOpaqueValue::Opaque {
            handle: function,
            opaque_type: HostOpaqueType::Function,
        } = method
        else {
            return Err(unsupported_error("Registry.get is not a host function"));
        };
        ctx.charge_work(1, Utf16::default())?;
        let result = match host.reflect(HostJsonEvent::InvokeOpaque {
            function,
            receiver: HostInvokeValue::Opaque(registry),
            args: vec![
                HostInvokeValue::Json(Value::String(id.clone())),
                HostInvokeValue::Json(Value::String(version.clone())),
            ],
            semantic_catch: false,
        })? {
            HostJsonReply::Invocation(value) => value,
            _ => return Err(protocol_error()),
        };
        if !result.is_truthy() {
            return Ok(None);
        }
        match result {
            HostOpaqueValue::Opaque { handle, .. } => {
                Ok(Some(RegistrationLookup::HostHandle(handle)))
            }
            HostOpaqueValue::BigInt { handle, .. } => {
                Ok(Some(RegistrationLookup::HostHandle(handle)))
            }
            _ => Ok(Some(RegistrationLookup::HostHandle(0))),
        }
    }

    fn host_registration_stage(
        &self,
        handle: u64,
        payload: &Value,
        scope: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<HostRegistrationStage, EngineError> {
        if handle == 0 {
            return Err(unsupported_error(
                "Truthy primitive Registry.get results are outside the private Selection host subset",
            ));
        }
        let mut host = self.host.borrow_mut();
        let registration = HostOpaqueValue::Opaque {
            handle,
            opaque_type: HostOpaqueType::Object,
        };
        let manifest = get_property(&mut **host, ctx, &registration, "manifest")?;
        let scopes = get_property(&mut **host, ctx, &manifest, "scopes")?;
        let includes = get_property(&mut **host, ctx, &scopes, "includes")?;
        let HostOpaqueValue::Opaque {
            handle: includes,
            opaque_type: HostOpaqueType::Function,
        } = includes
        else {
            return Err(unsupported_error(
                "Caller-owned Selection manifest.scopes.includes is not a host function",
            ));
        };
        ctx.charge_work(1, Utf16::default())?;
        let scopes_receiver = opaque_value(&scopes, &mut **host)?;
        let included = match host.reflect(HostJsonEvent::InvokeOpaque {
            function: includes,
            receiver: scopes_receiver,
            args: vec![HostInvokeValue::Json(Value::String(scope.clone()))],
            semantic_catch: false,
        })? {
            HostJsonReply::Invocation(value) => value.is_truthy(),
            _ => return Err(protocol_error()),
        };
        if !included {
            return Ok(HostRegistrationStage::OutOfScope);
        }

        let structure = get_property(&mut **host, ctx, &registration, "structure")?;
        let HostOpaqueValue::Opaque {
            handle: structure,
            opaque_type: HostOpaqueType::Function,
        } = structure
        else {
            return Err(unsupported_error(
                "Caller-owned Selection registration structure is not a host function",
            ));
        };
        ctx.charge_work(1, Utf16::default())?;
        let structurally_valid = match host.reflect(HostJsonEvent::InvokeOpaque {
            function: structure,
            receiver: HostInvokeValue::Opaque(handle),
            args: vec![HostInvokeValue::Json(payload.clone())],
            semantic_catch: false,
        })? {
            HostJsonReply::Invocation(value) => value.is_truthy(),
            _ => return Err(protocol_error()),
        };
        if !structurally_valid {
            let structure_again = get_property(&mut **host, ctx, &registration, "structure")?;
            let errors = get_property(&mut **host, ctx, &structure_again, "errors")?;
            return match crate::host_json::collect_structure_errors(
                errors,
                &Utf16::default(),
                &mut **host,
                ctx,
                &Utf16::default(),
            )? {
                crate::host_json::HostStructureErrorsOutcome::Entries(entries)
                    if entries.is_empty() =>
                {
                    Ok(HostRegistrationStage::NoDiagnostics)
                }
                crate::host_json::HostStructureErrorsOutcome::Entries(_entries) => {
                    // The ordered host reads are established, but diagnostic
                    // field materialization into Selection's refusal envelope
                    // remains outside this bounded stage.
                    Err(unsupported_error(
                        "Caller-owned Selection structure diagnostics require host materialization",
                    ))
                }
                crate::host_json::HostStructureErrorsOutcome::NativeIterationFailureUnresolved => {
                    Err(unsupported_error(
                        "Caller-owned Selection structure error iteration is not supported for this iterable",
                    ))
                }
            };
        }

        let manifest_for_capability = get_property(&mut **host, ctx, &registration, "manifest")?;
        let capabilities =
            get_property(&mut **host, ctx, &manifest_for_capability, "capabilities")?;
        let validation = get_property(&mut **host, ctx, &capabilities, "validation")?;
        let semantic_capability = match &validation {
            HostOpaqueValue::String(value) => {
                read_host_string(&mut **host, value)? == Utf16::from("semantic")
            }
            _ => false,
        };
        if !semantic_capability {
            return Ok(HostRegistrationStage::Unchecked);
        }
        let semantics = get_property(&mut **host, ctx, &registration, "semantics")?;
        if semantics.is_truthy() {
            return Ok(HostRegistrationStage::Unsupported);
        }
        Ok(HostRegistrationStage::Unchecked)
    }
}

fn get_property(
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    receiver: &HostOpaqueValue,
    key: &str,
) -> Result<HostOpaqueValue, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let receiver = opaque_value(receiver, host)?;
    match host.reflect(HostJsonEvent::GetOpaqueProperty {
        receiver,
        key: HostOpaqueKey::String(key.encode_utf16().collect()),
        semantic_catch: false,
    })? {
        HostJsonReply::OpaqueValue(value) => Ok(value),
        _ => Err(protocol_error()),
    }
}

fn opaque_value(
    value: &HostOpaqueValue,
    host: &mut dyn HostJsonReflection,
) -> Result<HostInvokeValue, EngineError> {
    crate::host_json::opaque_invoke_value(value.clone(), host, &Utf16::default())
}

fn read_host_string(
    host: &mut dyn HostJsonReflection,
    value: &crate::host_json::HostStringRef,
) -> Result<Utf16, EngineError> {
    crate::host_json::read_host_string_value(host, value.clone(), &Utf16::default())
}

fn protocol_error() -> EngineError {
    EngineError::new(
        "HOST_JSON_PROTOCOL",
        Utf16::default(),
        "Malformed opaque Registry response",
    )
}

fn unsupported_error(message: &str) -> EngineError {
    EngineError::new("HOST_JSON_UNSUPPORTED", Utf16::default(), message)
}

/// Copy source then query in predecessor order, validate the exact query before
/// Registry access, and run the shared Rust selection kernel. The host provider
/// supports scope checks and structure invocation; semantic callbacks and
/// non-empty structure diagnostics remain explicit boundaries.
pub fn execute(
    source: HostHandle,
    query: HostHandle,
    registry: Option<HostHandle>,
    host: &mut dyn HostJsonReflection,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_host_json(source, host, ctx)?;
    let query = copy_host_json(query, host, ctx)?;
    let provider = HostProvider {
        registry,
        host: RefCell::new(host),
    };
    let mut capabilities = NoCapabilities;
    crate::selection::select_core_elements_admitted_with_provider(
        source,
        query,
        engine,
        &provider,
        &mut capabilities,
        ctx,
    )
}

pub(crate) fn reject_host_semantics() -> EngineError {
    unsupported_error(
        "Caller-owned Selection semantic callbacks are not implemented by the private host route",
    )
}

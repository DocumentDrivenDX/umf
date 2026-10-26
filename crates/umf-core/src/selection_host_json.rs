// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private host-JSON Selection route. Caller-owned registrations are inspected
//! through the observed scope and structure stages. Semantic execution
//! remains an explicit boundary; invalid-source diagnostics use one host
//! stringify while host-owned message strings remain opaque.
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
        document: &Value,
        payload: &Value,
        scope: &Utf16,
        path: &Utf16,
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
                path,
                &mut **host,
                ctx,
                path,
            )? {
                crate::host_json::HostStructureErrorsOutcome::Entries(entries)
                    if entries.is_empty() =>
                {
                    Ok(HostRegistrationStage::NoDiagnostics)
                }
                crate::host_json::HostStructureErrorsOutcome::Entries(entries) => {
                    Ok(HostRegistrationStage::StructureErrors(entries))
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
        if !semantics.is_truthy() {
            return Ok(HostRegistrationStage::Unchecked);
        }
        let payload_copy = crate::value::copy_json(payload, ctx)?;
        let document_copy = crate::value::copy_json(document, ctx)?;
        let context = Value::Object(vec![
            (Utf16::from("document"), document_copy),
            (Utf16::from("path"), Value::String(path.clone())),
            (Utf16::from("scope"), Value::String(scope.clone())),
        ]);
        let semantics = get_property(&mut **host, ctx, &registration, "semantics")?;
        let HostOpaqueValue::Opaque {
            handle: semantics,
            opaque_type: HostOpaqueType::Function,
        } = semantics
        else {
            return Err(unsupported_error(
                "Caller-owned Selection semantics must be a host function",
            ));
        };
        ctx.charge_work(1, path.clone())?;
        let result = match host.reflect(HostJsonEvent::InvokeOpaque {
            function: semantics,
            receiver: HostInvokeValue::Opaque(handle),
            args: vec![
                HostInvokeValue::Json(payload_copy),
                HostInvokeValue::JsonRootOrdinary(context),
            ],
            semantic_catch: true,
        })? {
            HostJsonReply::Invocation(value) => value,
            HostJsonReply::SemanticThrow(message) => {
                return Ok(HostRegistrationStage::SemanticFailure(read_host_string(
                    &mut **host,
                    &message,
                )?));
            }
            _ => return Err(protocol_error()),
        };
        match crate::host_json::collect_semantic_iterable(result, &mut **host, ctx, path)? {
            crate::host_json::HostSemanticIterableOutcome::Values(values) => {
                Ok(HostRegistrationStage::SemanticDiagnostics(values))
            }
            crate::host_json::HostSemanticIterableOutcome::SemanticThrow(message) => {
                Ok(HostRegistrationStage::SemanticFailure(message))
            }
            crate::host_json::HostSemanticIterableOutcome::NativeSpreadFailureUnresolved => {
                Err(unsupported_error(
                    "Caller-owned Selection semantic result uses an unsupported native spread protocol",
                ))
            }
        }
    }

    fn host_callback_is_error(
        &self,
        diagnostic: &HostOpaqueValue,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        let mut host = self.host.borrow_mut();
        let severity = get_property(&mut **host, ctx, diagnostic, "severity")?;
        match severity {
            HostOpaqueValue::String(value) => Ok(read_host_string(&mut **host, &value)? == Utf16::from("error")),
            _ => Ok(false),
        }
    }

    fn host_callback_validate_at_emit(
        &self,
        diagnostic: &HostOpaqueValue,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let mut host = self.host.borrow_mut();
        let severity = get_property(&mut **host, ctx, diagnostic, "severity")?;
        let HostOpaqueValue::String(severity) = severity else {
            return Err(EngineError::new("CONSTRAINT_DIAGNOSTIC", Utf16::default(), "Malformed diagnostic"));
        };
        let severity = read_host_string(&mut **host, &severity)?;
        if severity != Utf16::from("error") && severity != Utf16::from("warning") {
            return Err(EngineError::new("CONSTRAINT_DIAGNOSTIC", Utf16::default(), "Malformed diagnostic"));
        }
        for field in ["path", "code", "message"] {
            let value = get_property(&mut **host, ctx, diagnostic, field)?;
            let HostOpaqueValue::String(_) = value else {
                return Err(EngineError::new("CONSTRAINT_DIAGNOSTIC", Utf16::default(), "Malformed diagnostic"));
            };
        }
        Ok(())
    }
}

impl HostProvider<'_> {
    fn source_validation_value(
        &self,
        packet: &crate::selection_diagnostics::SelectionDiagnosticMaterialization,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        packet.into_host_source_value(&mut **self.host.borrow_mut(), ctx)
    }

    fn refusal_message(
        &self,
        packet: &crate::selection_diagnostics::SelectionDiagnosticMaterialization,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        let mut host = self.host.borrow_mut();
        let carrier = packet
            .refusal_carrier(&mut **host, ctx, &Utf16::from("/diagnostics"))?
            .ok_or_else(|| EngineError::new(
                "HOST_JSON_PROTOCOL", Utf16::default(), "Invalid Selection source produced no refusal carrier",
            ))?;
        let message = get_property(&mut **host, ctx, &carrier, "message")?;
        let HostOpaqueValue::String(message) = message else {
            return Err(EngineError::new(
                "HOST_JSON_PROTOCOL", Utf16::default(), "Native Selection refusal message is not a string",
            ));
        };
        let chunks = message.units.div_ceil(8192);
        ctx.charge_work(message.units.saturating_add(chunks), Utf16::from("/diagnostics"))?;
        read_host_string(&mut **host, &message)
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
/// Registry access, and run the shared Rust selection kernel. Semantic callbacks
/// remain an explicit boundary.
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
    let mut refusal = |packet: &crate::selection_diagnostics::SelectionDiagnosticMaterialization,
                       ctx: &mut Context<'_>| provider.refusal_message(packet, ctx);
    let mut source_validation = |packet: &crate::selection_diagnostics::SelectionDiagnosticMaterialization,
                       ctx: &mut Context<'_>| provider.source_validation_value(packet, ctx);
    crate::selection::select_core_elements_admitted_with_host_materializers(
        source,
        query,
        engine,
        &provider,
        &mut capabilities,
        ctx,
        &mut refusal,
        &mut source_validation,
    )
}

/// Private proof that a host-owned object result can cross the Rust operation
/// boundary without JSON materialization. The caller supplies an already
/// captured function and receiver; the returned invocation-local handle is
/// encoded as a reserved carrier and resolved by the JS wrapper before its
/// handle table is released.
pub fn invoke_opaque_object_return(
    function: HostHandle,
    receiver: HostHandle,
    argument: HostHandle,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let result = match host.reflect(HostJsonEvent::InvokeOpaque {
        function,
        receiver: HostInvokeValue::Opaque(receiver),
        args: vec![HostInvokeValue::Opaque(argument)],
        semantic_catch: false,
    })? {
        HostJsonReply::Invocation(HostOpaqueValue::Opaque { handle, opaque_type })
            if matches!(opaque_type, HostOpaqueType::Object | HostOpaqueType::Function) => handle,
        HostJsonReply::Invocation(_) => {
            return Err(unsupported_error(
                "Opaque return carrier currently supports object and function results",
            ));
        }
        _ => return Err(protocol_error()),
    };
    Ok(Value::Object(vec![
        (Utf16::from("__umf_host_opaque_return_v1"), Value::Bool(true)),
        (Utf16::from("handle"), Value::Number(result as f64)),
    ]))
}

pub(crate) fn reject_host_semantics() -> EngineError {
    unsupported_error(
        "Caller-owned Selection semantic callback shape is outside the private route's verified iterable and diagnostic subset",
    )
}

#[cfg(test)]
mod opaque_return_tests {
    use super::*;
    use crate::{host_json::{HostJsonReply, HostOpaqueValue}, Context};

    struct ScriptedHost {
        reply: Option<HostJsonReply>,
        events: Vec<HostJsonEvent>,
    }
    impl HostJsonReflection for ScriptedHost {
        fn reflect(&mut self, event: HostJsonEvent) -> Result<HostJsonReply, EngineError> {
            self.events.push(event);
            self.reply.take().ok_or_else(|| protocol_error())
        }
        fn release_descriptor_snapshot(&mut self, _: u64) {}
    }

    fn run(reply: HostJsonReply) -> (Result<Value, EngineError>, Vec<HostJsonEvent>) {
        let mut host = ScriptedHost { reply: Some(reply), events: Vec::new() };
        let mut ctx = Context::ordinary();
        let result = invoke_opaque_object_return(7, 11, 13, &mut host, &mut ctx);
        (result, host.events)
    }

    #[test]
    fn object_and_function_return_handles_are_carried_without_materialization() {
        for (opaque_type, handle) in [(HostOpaqueType::Object, 29), (HostOpaqueType::Function, 31)] {
            let (result, events) = run(HostJsonReply::Invocation(HostOpaqueValue::Opaque { handle, opaque_type }));
            let Value::Object(fields) = result.unwrap() else { panic!("expected carrier object") };
            assert!(fields.contains(&(Utf16::from("__umf_host_opaque_return_v1"), Value::Bool(true))));
            assert!(fields.contains(&(Utf16::from("handle"), Value::Number(handle as f64))));
            assert_eq!(events, vec![HostJsonEvent::InvokeOpaque {
                function: 7,
                receiver: HostInvokeValue::Opaque(11),
                args: vec![HostInvokeValue::Opaque(13)],
                semantic_catch: false,
            }]);
        }
    }

    #[test]
    fn primitive_return_is_refused() {
        let (result, events) = run(HostJsonReply::Invocation(HostOpaqueValue::Null));
        assert_eq!(result.unwrap_err().code, "HOST_JSON_UNSUPPORTED");
        assert_eq!(events.len(), 1);
    }

    #[test]
    fn malformed_host_reply_is_refused() {
        let (result, events) = run(HostJsonReply::Boolean(true));
        assert_eq!(result.unwrap_err().code, "HOST_JSON_PROTOCOL");
        assert_eq!(events.len(), 1);
    }
}

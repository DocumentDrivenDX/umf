// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private host-JSON Selection route. Caller-owned registrations remain opaque
//! and stop at a deliberate boundary until their staged execution is wired.
use std::cell::RefCell;

use crate::{
    engine::{Capabilities, SemanticContext},
    error::Diagnostic,
    host_json::{
        copy_host_json, HostHandle, HostInvokeValue, HostJsonEvent, HostJsonReflection,
        HostJsonReply, HostOpaqueKey, HostOpaqueType, HostOpaqueValue,
    },
    registry::{RegistrationLookup, RegistrationProvider},
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
/// Delayed Registry.get calls use the same opaque callback primitives as the
/// rest of the host protocol. A returned registration is kept as a host
/// handle; no caller object is reflected or reconstructed here.
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
/// Registry access, and run the shared Rust selection kernel. If a lazy host
/// lookup finds a caller-owned registration, the kernel stops explicitly;
/// this slice does not claim dynamic structure/semantics parity.
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

pub(crate) fn reject_host_registration(handle: HostHandle) -> EngineError {
    let _ = handle;
    unsupported_error(
        "Caller-owned Selection registrations require staged structure and semantics integration",
    )
}

// SPDX-License-Identifier: MIT OR Apache-2.0
use napi::{Env, Error, JsFunction, Result};
use napi_derive::napi;
use umf_core::{context::TransportUsage, Context, EngineError, Utf16, Value};
use umf_core_wire::core_key_verification_binding::{
    CoreKeyVerificationRuntime as CoreRuntime, PreparedCoreKeyVerification,
};

fn decode(wire: &str, context: &mut Context<'_>) -> std::result::Result<Value, EngineError> {
    context.with_tagged_transport_limit(|transport| umf_core_wire::decode(wire, transport))
}
fn result_wire(
    result: std::result::Result<Value, EngineError>,
    context: &mut Context<'_>,
) -> String {
    let result = result.and_then(|value| {
        context.with_tagged_transport_limit(|t| umf_core_wire::encode(&value, t))
    });
    umf_core_wire::result_envelope(result)
}
fn run<T>(
    env: Env,
    dispatcher: Option<JsFunction>,
    usage: &mut TransportUsage,
    f: impl FnOnce(&mut Context<'_>) -> std::result::Result<T, EngineError>,
) -> std::result::Result<T, EngineError> {
    if let Some(dispatcher) = dispatcher {
        let mut control = super::NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        let mut context = Context::ordinary().with_host_control(&mut hook);
        usage.seed(&mut context);
        let result = f(&mut context);
        usage.capture(&context);
        result
    } else {
        let mut context = Context::ordinary();
        usage.seed(&mut context);
        let result = f(&mut context);
        usage.capture(&context);
        result
    }
}
fn failure(error: EngineError) -> Error {
    Error::from_reason(umf_core_wire::error_envelope(error))
}

#[napi]
pub struct PreparedCoreKeyVerificationHandle {
    inner: Option<PreparedCoreKeyVerification>,
    usage: Option<TransportUsage>,
}
#[napi]
pub struct CoreKeyVerificationRuntime {
    inner: CoreRuntime,
}

#[napi]
impl CoreKeyVerificationRuntime {
    #[napi(constructor)]
    pub fn new(env: Env, resources_wire: String, dispatcher: Option<JsFunction>) -> Result<Self> {
        let mut usage = TransportUsage::default();
        let inner = run(env, dispatcher, &mut usage, |ctx| {
            let resources = decode(&resources_wire, ctx)?;
            CoreRuntime::new(resources, ctx)
        })
        .map_err(failure)?;
        Ok(Self { inner })
    }
    #[napi]
    pub fn prepare_verification(
        &self,
        env: Env,
        receipt_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<PreparedCoreKeyVerificationHandle> {
        let mut usage = TransportUsage::default();
        let inner = run(env, dispatcher, &mut usage, |ctx| {
            let receipt = decode(&receipt_wire, ctx)?;
            self.inner.prepare(&receipt, ctx)
        })
        .map_err(failure)?;
        Ok(PreparedCoreKeyVerificationHandle {
            inner: Some(inner),
            usage: Some(usage),
        })
    }
    #[napi]
    pub fn finish_verification(
        &self,
        env: Env,
        handle: &mut PreparedCoreKeyVerificationHandle,
        current_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<String> {
        let (Some(stage), Some(mut usage)) = (handle.inner.take(), handle.usage.take()) else {
            return Err(failure(EngineError::new(
                "CORE_KEY_STAGE",
                Utf16::default(),
                "Prepared verification stage was already consumed",
            )));
        };
        let result = run(env, dispatcher, &mut usage, |ctx| {
            let current = decode(&current_wire, ctx)?;
            let result = self.inner.finish(stage, &current, ctx);
            Ok(result_wire(result, ctx))
        })
        .map_err(failure)?;
        Ok(result)
    }
}

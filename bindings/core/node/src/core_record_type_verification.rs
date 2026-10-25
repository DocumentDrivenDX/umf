// SPDX-License-Identifier: MIT OR Apache-2.0
use napi::{Env, Error, JsFunction, Result};
use napi_derive::napi;
use umf_core::{context::TransportUsage, Context, EngineError, Utf16, Value};
use umf_core_wire::core_record_type_verification_binding::{
    CoreRecordTypeVerificationRuntime as CoreRuntime, PreparedCoreRecordTypeVerification,
};

fn decode(wire: &str, context: &mut Context<'_>) -> std::result::Result<Value, EngineError> {
    context.with_tagged_transport_limit(|transport| umf_core_wire::decode(wire, transport))
}

fn result_wire(
    result: std::result::Result<Value, EngineError>,
    context: &mut Context<'_>,
) -> String {
    let result = result.and_then(|value| {
        context.with_tagged_transport_limit(|transport| umf_core_wire::encode(&value, transport))
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
pub struct PreparedCoreRecordTypeVerificationHandle {
    inner: Option<PreparedCoreRecordTypeVerification>,
}

#[napi]
pub struct CoreRecordTypeVerificationRuntime {
    inner: CoreRuntime,
}

#[napi]
impl CoreRecordTypeVerificationRuntime {
    #[napi(constructor)]
    pub fn new(env: Env, resources_wire: String, dispatcher: Option<JsFunction>) -> Result<Self> {
        let mut usage = TransportUsage::default();
        let inner = run(env, dispatcher, &mut usage, |context| {
            let resources = decode(&resources_wire, context)?;
            CoreRuntime::new(resources, context)
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
    ) -> Result<PreparedCoreRecordTypeVerificationHandle> {
        let mut usage = TransportUsage::default();
        let inner = run(env, dispatcher, &mut usage, |context| {
            let receipt = decode(&receipt_wire, context)?;
            self.inner.prepare(&receipt, context)
        })
        .map_err(failure)?;
        Ok(PreparedCoreRecordTypeVerificationHandle { inner: Some(inner) })
    }

    #[napi]
    pub fn finish_verification(
        &self,
        env: Env,
        handle: &mut PreparedCoreRecordTypeVerificationHandle,
        current_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<String> {
        let Some(prepared) = handle.inner.take() else {
            return Err(failure(EngineError::new(
                "CORE_RECORD_TYPE_STAGE",
                Utf16::default(),
                "Prepared verification stage was already consumed",
            )));
        };
        let prepared = self.inner.begin_finish(prepared).map_err(failure)?;
        let mut usage = TransportUsage::default();
        let result = run(env, dispatcher, &mut usage, |context| {
            prepared.seed_finish_context(context);
            let current = decode(&current_wire, context)?;
            let verified = self.inner.finish(prepared, &current, context);
            Ok(result_wire(verified, context))
        })
        .map_err(failure)?;
        Ok(result)
    }
}

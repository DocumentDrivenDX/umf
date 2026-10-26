// SPDX-License-Identifier: MIT OR Apache-2.0
use js_sys::{Error, Function};
use umf_core::{context::TransportUsage, Context, EngineError, Utf16, Value};
use umf_core_wire::core_key_verification_binding::{
    CoreKeyVerificationRuntime as CoreRuntime, PreparedCoreKeyVerification,
};
use wasm_bindgen::prelude::*;

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
fn js_error(error: EngineError) -> JsValue {
    Error::new(&umf_core_wire::error_envelope(error)).into()
}
fn run<T>(
    dispatcher: Option<Function>,
    usage: &mut TransportUsage,
    f: impl FnOnce(&mut Context<'_>) -> std::result::Result<T, EngineError>,
) -> std::result::Result<T, EngineError> {
    if let Some(dispatcher) = dispatcher {
        let mut control = super::WasmControl { dispatcher };
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

#[wasm_bindgen]
pub struct PreparedCoreKeyVerificationHandle {
    inner: Option<PreparedCoreKeyVerification>,
    usage: Option<TransportUsage>,
}
#[wasm_bindgen]
pub struct CoreKeyVerificationRuntime {
    inner: CoreRuntime,
}

#[wasm_bindgen]
impl CoreKeyVerificationRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(resources_wire: &str, dispatcher: Option<Function>) -> Result<Self, JsValue> {
        let mut usage = TransportUsage::default();
        let inner = run(dispatcher, &mut usage, |ctx| {
            let resources = decode(resources_wire, ctx)?;
            CoreRuntime::new(resources, ctx)
        })
        .map_err(js_error)?;
        Ok(Self { inner })
    }
    #[wasm_bindgen(js_name = prepareVerification)]
    pub fn prepare_verification(
        &self,
        receipt_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<PreparedCoreKeyVerificationHandle, JsValue> {
        let mut usage = TransportUsage::default();
        let inner = run(dispatcher, &mut usage, |ctx| {
            let receipt = decode(receipt_wire, ctx)?;
            self.inner.prepare(&receipt, ctx)
        })
        .map_err(js_error)?;
        Ok(PreparedCoreKeyVerificationHandle {
            inner: Some(inner),
            usage: Some(usage),
        })
    }
    #[wasm_bindgen(js_name = finishVerification)]
    pub fn finish_verification(
        &self,
        handle: &mut PreparedCoreKeyVerificationHandle,
        current_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<String, JsValue> {
        let (Some(stage), Some(mut usage)) = (handle.inner.take(), handle.usage.take()) else {
            return Err(js_error(EngineError::new(
                "CORE_KEY_STAGE",
                Utf16::default(),
                "Prepared verification stage was already consumed",
            )));
        };
        run(dispatcher, &mut usage, |ctx| {
            let current = decode(current_wire, ctx)?;
            let result = self.inner.finish(stage, &current, ctx);
            Ok(result_wire(result, ctx))
        })
        .map_err(js_error)
    }
    #[wasm_bindgen(js_name = discardVerification)]
    pub fn discard_verification(
        &self,
        handle: &mut PreparedCoreKeyVerificationHandle,
    ) -> Result<(), JsValue> {
        let (Some(stage), Some(_usage)) = (handle.inner.take(), handle.usage.take()) else {
            return Err(js_error(EngineError::new(
                "CORE_KEY_STAGE",
                Utf16::default(),
                "Prepared verification stage was already consumed",
            )));
        };
        self.inner.discard(stage).map_err(js_error)
    }
}

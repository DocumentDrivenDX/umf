// SPDX-License-Identifier: MIT OR Apache-2.0
use js_sys::{Error, Function};
use umf_core::{context::TransportUsage, Context, EngineError, Utf16, Value};
use umf_core_wire::core_record_type_verification_binding::{
    CoreRecordTypeVerificationRuntime as CoreRuntime, PreparedCoreRecordTypeVerification,
};
use wasm_bindgen::prelude::*;

fn decode(wire: &str, context: &mut Context<'_>) -> Result<Value, EngineError> {
    context.with_tagged_transport_limit(|transport| umf_core_wire::decode(wire, transport))
}

fn result_wire(result: Result<Value, EngineError>, context: &mut Context<'_>) -> String {
    let result = result.and_then(|value| {
        context.with_tagged_transport_limit(|transport| umf_core_wire::encode(&value, transport))
    });
    umf_core_wire::result_envelope(result)
}

fn js_error(error: EngineError) -> JsValue {
    Error::new(&umf_core_wire::error_envelope(error)).into()
}

fn run<T>(
    dispatcher: Option<Function>,
    usage: &mut TransportUsage,
    f: impl FnOnce(&mut Context<'_>) -> Result<T, EngineError>,
) -> Result<T, EngineError> {
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
pub struct PreparedCoreRecordTypeVerificationHandle {
    inner: Option<PreparedCoreRecordTypeVerification>,
}

#[wasm_bindgen]
pub struct CoreRecordTypeVerificationRuntime {
    inner: CoreRuntime,
}

#[wasm_bindgen]
impl CoreRecordTypeVerificationRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(resources_wire: &str, dispatcher: Option<Function>) -> Result<Self, JsValue> {
        let mut usage = TransportUsage::default();
        let inner = run(dispatcher, &mut usage, |context| {
            let resources = decode(resources_wire, context)?;
            CoreRuntime::new(resources, context)
        })
        .map_err(js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = prepareVerification)]
    pub fn prepare_verification(
        &self,
        receipt_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<PreparedCoreRecordTypeVerificationHandle, JsValue> {
        let mut usage = TransportUsage::default();
        let inner = run(dispatcher, &mut usage, |context| {
            let receipt = decode(receipt_wire, context)?;
            self.inner.prepare(&receipt, context)
        })
        .map_err(js_error)?;
        Ok(PreparedCoreRecordTypeVerificationHandle { inner: Some(inner) })
    }

    #[wasm_bindgen(js_name = finishVerification)]
    pub fn finish_verification(
        &self,
        handle: &mut PreparedCoreRecordTypeVerificationHandle,
        current_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<String, JsValue> {
        let Some(prepared) = handle.inner.take() else {
            return Err(js_error(EngineError::new(
                "CORE_RECORD_TYPE_STAGE",
                Utf16::default(),
                "Prepared Record Type verification stage was already consumed",
            )));
        };
        let prepared = self.inner.begin_finish(prepared).map_err(js_error)?;
        let mut usage = TransportUsage::default();
        run(dispatcher, &mut usage, |context| {
            prepared.seed_finish_context(context);
            let current = decode(current_wire, context)?;
            let result = self.inner.finish(prepared, &current, context);
            Ok(result_wire(result, context))
        })
        .map_err(js_error)
    }
}

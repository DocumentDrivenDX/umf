// SPDX-License-Identifier: MIT OR Apache-2.0
use js_sys::{Error, Function};
use umf_core::{context::TransportUsage, Context, EngineError, Value};
use umf_core_wire::record_members_inspection_binding::CoreRecordMembersInspectionRuntime as CoreRuntime;
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
pub struct CoreRecordMembersInspectionRuntime {
    inner: CoreRuntime,
}

#[wasm_bindgen]
impl CoreRecordMembersInspectionRuntime {
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

    pub fn inspect(
        &self,
        source_wire: &str,
        identity_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<String, JsValue> {
        let mut usage = TransportUsage::default();
        run(dispatcher, &mut usage, |context| {
            let source = decode(source_wire, context)?;
            let identity = decode(identity_wire, context)?;
            let result = self.inner.inspect(&source, &identity, context);
            Ok(result_wire(result, context))
        })
        .map_err(js_error)
    }
}

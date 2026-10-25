// SPDX-License-Identifier: MIT OR Apache-2.0
use js_sys::{Error, Function};
use umf_core::{Context, EngineError, Utf16, Value, context::TransportUsage};
use umf_core_wire::core_key_tuple_binding::{
    CoreKeyTupleRuntime as CoreRuntime, PreparedCoreKeyTupleBinding, PreparedCoreKeyTupleByteRead,
    CoreKeyTupleEncodeStage, PreparedCoreKeyTupleVerification,
};
use wasm_bindgen::prelude::*;

fn decode(wire: &str, context: &mut Context<'_>) -> std::result::Result<Value, EngineError> {
    context.with_tagged_transport_limit(|transport| umf_core_wire::decode(wire, transport))
}

fn result_wire(
    result: std::result::Result<Value, EngineError>,
    context: &mut Context<'_>,
) -> String {
    let encoded = result.and_then(|value| {
        context.with_tagged_transport_limit(|transport| umf_core_wire::encode(&value, transport))
    });
    umf_core_wire::result_envelope(encoded)
}

fn js_error(error: EngineError) -> JsValue {
    Error::new(&umf_core_wire::error_envelope(error)).into()
}

fn run<T>(
    dispatcher: Option<Function>,
    f: impl FnOnce(&mut Context<'_>) -> std::result::Result<T, EngineError>,
) -> std::result::Result<T, EngineError> {
    if let Some(dispatcher) = dispatcher {
        let mut control = super::WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        f(&mut Context::ordinary().with_host_control(&mut hook))
    } else {
        f(&mut Context::ordinary())
    }
}

fn run_with_usage<T>(
    dispatcher: Option<Function>,
    mut usage: TransportUsage,
    f: impl FnOnce(&mut Context<'_>) -> std::result::Result<T, EngineError>,
) -> (std::result::Result<T, EngineError>, TransportUsage) {
    let result = if let Some(dispatcher) = dispatcher {
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
    };
    (result, usage)
}

#[wasm_bindgen]
pub struct PreparedCoreKeyTupleHandle {
    inner: PreparedCoreKeyTupleBinding,
}

#[wasm_bindgen]
impl PreparedCoreKeyTupleHandle {
    #[wasm_bindgen(constructor)]
    pub fn new(
        source_wire: &str,
        resources_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<PreparedCoreKeyTupleHandle, JsValue> {
        let inner = run(dispatcher, |context| {
            let source = decode(source_wire, context)?;
            let resources = decode(resources_wire, context)?;
            CoreRuntime::new(resources, context)?.prepare(&source, context)
        })
        .map_err(js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = encode)]
    pub fn encode_js(
        &self,
        identity_wire: &str,
        values_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<String, JsValue> {
        run(dispatcher, |context| {
            let identity = decode(identity_wire, context)?;
            let values = decode(values_wire, context)?;
            let result = self.inner.encode(&identity, &values, context);
            Ok(result_wire(result, context))
        })
        .map_err(js_error)
    }

    #[wasm_bindgen(js_name = verify)]
    pub fn verify_js(
        &self,
        receipt_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<String, JsValue> {
        run(dispatcher, |context| {
            let receipt = decode(receipt_wire, context)?;
            let result = self.inner.verify(&receipt, context);
            Ok(result_wire(result, context))
        })
        .map_err(js_error)
    }

    #[wasm_bindgen(js_name = sourceWire)]
    pub fn source_wire(&self, dispatcher: Option<Function>) -> Result<String, JsValue> {
        run(dispatcher, |context| self.inner.source_wire(context)).map_err(js_error)
    }
}

#[wasm_bindgen]
pub struct CoreKeyTupleRuntime {
    inner: CoreRuntime,
}

#[wasm_bindgen]
pub struct PreparedCoreKeyTupleByteReadHandle {
    inner: Option<PreparedCoreKeyTupleByteRead>,
    usage: Option<TransportUsage>,
}

#[wasm_bindgen]
pub struct PreparedCoreKeyTupleVerificationHandle {
    inner: Option<PreparedCoreKeyTupleVerification>,
    usage: Option<TransportUsage>,
}

#[wasm_bindgen]
pub struct PreparedCoreKeyTupleEncodeHandle {
    inner: Option<CoreKeyTupleEncodeStage>,
    usage: Option<TransportUsage>,
}

fn consumed_stage_error() -> EngineError {
    EngineError::new(
        "KEY_TUPLE_STAGE",
        Utf16::default(),
        "Prepared verification stage was already consumed",
    )
}

fn consumed_encode_stage_error() -> EngineError {
    EngineError::new(
        "KEY_TUPLE_STAGE",
        Utf16::default(),
        "Prepared encoding stage was already consumed",
    )
}

#[wasm_bindgen]
impl PreparedCoreKeyTupleEncodeHandle {
    #[wasm_bindgen(js_name = encodeWithOptions)]
    pub fn encode_with_options(
        &mut self,
        options_wire: Option<String>,
        dispatcher: Option<Function>,
    ) -> Result<String, JsValue> {
        let (Some(inner), Some(usage)) = (self.inner.take(), self.usage.take()) else {
            return Err(js_error(consumed_encode_stage_error()));
        };
        let (result, _usage) = run_with_usage(dispatcher, usage, |context| {
            let options = options_wire
                .as_deref()
                .map(|wire| decode(wire, context))
                .transpose()?;
            let result = inner.finish(options.as_ref(), context);
            Ok(result_wire(result, context))
        });
        result.map_err(js_error)
    }
}

#[wasm_bindgen]
impl PreparedCoreKeyTupleVerificationHandle {
    #[wasm_bindgen(js_name = verifyCurrent)]
    pub fn verify_current(
        &mut self,
        current_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<String, JsValue> {
        let (Some(inner), Some(usage)) = (self.inner.take(), self.usage.take()) else {
            return Err(js_error(consumed_stage_error()));
        };
        let (result, _usage) = run_with_usage(dispatcher, usage, |context| {
            let current = decode(current_wire, context)?;
            let result = inner.verify_current(&current, context);
            Ok(result_wire(result, context))
        });
        result.map_err(js_error)
    }

    #[wasm_bindgen(js_name = readBytes)]
    pub fn read_bytes(
        &mut self,
        current_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<Vec<u8>, JsValue> {
        let (Some(inner), Some(usage)) = (self.inner.take(), self.usage.take()) else {
            return Err(js_error(consumed_stage_error()));
        };
        let (result, _usage) = run_with_usage(dispatcher, usage, |context| {
            let current = decode(current_wire, context)?;
            inner.read_bytes(&current, context)
        });
        result.map_err(js_error)
    }
}

#[wasm_bindgen]
impl PreparedCoreKeyTupleByteReadHandle {
    #[wasm_bindgen(js_name = readBytes)]
    pub fn read_bytes(
        &mut self,
        current_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<Vec<u8>, JsValue> {
        let (Some(inner), Some(usage)) = (self.inner.take(), self.usage.take()) else {
            return Err(js_error(consumed_stage_error()));
        };
        run_with_usage(dispatcher, usage, |context| {
            let current = decode(current_wire, context)?;
            inner.read_bytes(&current, context)
        })
        .0
        .map_err(js_error)
    }
}

#[wasm_bindgen]
impl CoreKeyTupleRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(
        resources_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<CoreKeyTupleRuntime, JsValue> {
        let inner = run(dispatcher, |context| {
            let resources = decode(resources_wire, context)?;
            CoreRuntime::new(resources, context)
        })
        .map_err(js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = encode)]
    pub fn encode_js(
        &self,
        source_wire: &str,
        identity_wire: &str,
        values_wire: &str,
        profile: Option<String>,
        dispatcher: Option<Function>,
    ) -> Result<String, JsValue> {
        run(dispatcher, |context| {
            let source = decode(source_wire, context)?;
            let identity = decode(identity_wire, context)?;
            let values = decode(values_wire, context)?;
            let result =
                self.inner
                    .encode(&source, &identity, &values, profile.as_deref(), context);
            Ok(result_wire(result, context))
        })
        .map_err(js_error)
    }

    #[wasm_bindgen(js_name = prepareEncoding)]
    pub fn prepare_encoding_js(
        &self,
        source_wire: &str,
        identity_wire: &str,
        values_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<PreparedCoreKeyTupleEncodeHandle, JsValue> {
        let (result, usage) = run_with_usage(dispatcher, TransportUsage::default(), |context| {
            let source = decode(source_wire, context)?;
            let identity = decode(identity_wire, context)?;
            let values = decode(values_wire, context)?;
            self.inner.prepare_encode_stage(source, identity, values)
        });
        let inner = result.map_err(js_error)?;
        Ok(PreparedCoreKeyTupleEncodeHandle { inner: Some(inner), usage: Some(usage) })
    }

    #[wasm_bindgen(js_name = prepareVerification)]
    pub fn prepare_verification(
        &self,
        receipt_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<PreparedCoreKeyTupleVerificationHandle, JsValue> {
        let (result, usage) = run_with_usage(dispatcher, TransportUsage::default(), |context| {
            let receipt = decode(receipt_wire, context)?;
            self.inner.prepare_verification(&receipt, context)
        });
        let inner = result.map_err(js_error)?;
        Ok(PreparedCoreKeyTupleVerificationHandle {
            inner: Some(inner),
            usage: Some(usage),
        })
    }

    #[wasm_bindgen(js_name = prepareByteRead)]
    pub fn prepare_byte_read(
        &self,
        receipt_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<PreparedCoreKeyTupleByteReadHandle, JsValue> {
        let (result, usage) = run_with_usage(dispatcher, TransportUsage::default(), |context| {
            let receipt = decode(receipt_wire, context)?;
            self.inner.prepare_byte_read(&receipt, context)
        });
        let inner = result.map_err(js_error)?;
        Ok(PreparedCoreKeyTupleByteReadHandle {
            inner: Some(inner),
            usage: Some(usage),
        })
    }

    #[wasm_bindgen(js_name = prepare)]
    pub fn prepare_js(
        &self,
        source_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<PreparedCoreKeyTupleHandle, JsValue> {
        let inner = run(dispatcher, |context| {
            let source = decode(source_wire, context)?;
            self.inner.prepare(&source, context)
        })
        .map_err(js_error)?;
        Ok(PreparedCoreKeyTupleHandle { inner })
    }
}

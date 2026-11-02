// SPDX-License-Identifier: MIT OR Apache-2.0
use js_sys::{Error, Function};
use umf_core::EngineError;
use umf_core_wire::PreparedJsonSchemaRuntime as Runtime;
use wasm_bindgen::prelude::*;

fn js_error(error: EngineError) -> JsValue {
    Error::new(&umf_core_wire::error_envelope(error)).into()
}

fn prepare(resource_control: Option<Function>) -> std::result::Result<Runtime, EngineError> {
    if let Some(dispatcher) = resource_control {
        let mut control = super::WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::prepare_json_schema_runtime_with_control(&mut hook)
    } else {
        umf_core_wire::prepare_json_schema_runtime()
    }
}

#[wasm_bindgen]
pub struct PreparedJsonSchemaRuntimeHandle {
    inner: Runtime,
}

#[wasm_bindgen]
impl PreparedJsonSchemaRuntimeHandle {
    #[wasm_bindgen(constructor)]
    pub fn new(resource_control: Option<Function>) -> Result<PreparedJsonSchemaRuntimeHandle, JsValue> {
        let inner = prepare(resource_control).map_err(js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen]
    pub fn execute(
        &self,
        wire_json: &str,
        operation_control: Option<Function>,
    ) -> String {
        if let Some(dispatcher) = operation_control {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            umf_core_wire::execute_prepared_json_schema_wire_with_control(
                &self.inner,
                wire_json,
                &mut hook,
            )
        } else {
            umf_core_wire::execute_prepared_json_schema_wire(&self.inner, wire_json)
        }
    }
}

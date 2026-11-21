// SPDX-License-Identifier: MIT OR Apache-2.0
use wasm_bindgen::prelude::*;
use js_sys::Function;
use umf_core_wire::security_functions_binding::PreparedSecurityLiteralSource;
#[wasm_bindgen]
pub struct PreparedSecurityLiteralSourceHandle { inner: PreparedSecurityLiteralSource }
#[wasm_bindgen]
impl PreparedSecurityLiteralSourceHandle {
    #[wasm_bindgen(constructor)]
    pub fn new(source_wire: &str, dispatcher: Option<Function>) -> Result<Self, JsValue> {
        let result = if let Some(dispatcher) = dispatcher {
            let mut control = super::WasmControl { dispatcher }; let mut hook = |n| control.check(n);
            PreparedSecurityLiteralSource::new(source_wire, Some(&mut hook))
        } else { PreparedSecurityLiteralSource::new(source_wire, None) };
        result.map(|inner| Self { inner }).map_err(|error| js_sys::Error::new(&umf_core_wire::error_envelope(error)).into())
    }
    pub fn execute(&self, wire: &str, dispatcher: Option<Function>) -> String {
        if let Some(dispatcher) = dispatcher {
            let mut control = super::WasmControl { dispatcher }; let mut hook = |n| control.check(n);
            self.inner.execute(wire, Some(&mut hook))
        } else { self.inner.execute(wire, None) }
    }
}

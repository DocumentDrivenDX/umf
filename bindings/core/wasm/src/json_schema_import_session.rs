// SPDX-License-Identifier: MIT OR Apache-2.0
use wasm_bindgen::prelude::*;

/// Private per-call owner for staged JSON Schema import.
#[wasm_bindgen]
pub struct JsonSchemaImportSessionHandle {
    inner: umf_core_wire::json_schema_import_session_binding::JsonSchemaImportSessionWire,
}

#[wasm_bindgen]
impl JsonSchemaImportSessionHandle {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner:
                umf_core_wire::json_schema_import_session_binding::JsonSchemaImportSessionWire::new(
                ),
        }
    }

    #[wasm_bindgen(js_name = executeStage)]
    pub fn execute_stage(&mut self, wire_json: &str) -> String {
        self.inner.execute_stage(wire_json)
    }
}

#[wasm_bindgen(js_name = jsonSchemaImportSessionProfileVersion)]
pub fn profile_version() -> String {
    "umf-r8-json-schema-staged-wasm-private/0.1.0".to_owned()
}

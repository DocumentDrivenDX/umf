// SPDX-License-Identifier: MIT OR Apache-2.0
use napi_derive::napi;

/// Private per-call owner for staged CONTRACT-002 import.
#[napi]
pub struct JsonSchemaImportSessionHandle {
    inner: umf_core_wire::json_schema_import_session_binding::JsonSchemaImportSessionWire,
}

#[napi]
impl JsonSchemaImportSessionHandle {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner:
                umf_core_wire::json_schema_import_session_binding::JsonSchemaImportSessionWire::new(
                ),
        }
    }

    #[napi(js_name = "executeStage")]
    pub fn execute_stage(&mut self, wire_json: String) -> String {
        self.inner.execute_stage(&wire_json)
    }
}

#[napi(js_name = "jsonSchemaImportSessionProfileVersion")]
pub fn json_schema_import_session_profile_version() -> &'static str {
    "umf-r8-json-schema-staged-node-private/0.1.0"
}

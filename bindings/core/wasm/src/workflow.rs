// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core_wire::workflow_binding;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = inspectWorkflowJson)]
pub fn inspect_workflow_json(source: &[u8]) -> String {
    workflow_binding::inspect(source)
}

#[wasm_bindgen(js_name = compileWorkflowJson)]
pub fn compile_workflow_json(source: &[u8], profile: &str) -> String {
    workflow_binding::compile(source, profile)
}

#[wasm_bindgen(js_name = parseElapsedDurationJson)]
pub fn parse_elapsed_duration_json(token: &str) -> String {
    workflow_binding::elapsed_duration(token)
}

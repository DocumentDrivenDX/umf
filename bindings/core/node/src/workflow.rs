// SPDX-License-Identifier: MIT OR Apache-2.0
use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use umf_core_wire::workflow_binding;

#[napi(js_name = "inspectWorkflowJson")]
pub fn inspect_workflow_json(source: Buffer) -> String {
    workflow_binding::inspect(&source)
}

#[napi(js_name = "compileWorkflowJson")]
pub fn compile_workflow_json(source: Buffer, profile: String) -> String {
    workflow_binding::compile(&source, &profile)
}

#[napi(js_name = "parseElapsedDurationJson")]
pub fn parse_elapsed_duration_json(token: String) -> String {
    workflow_binding::elapsed_duration(&token)
}

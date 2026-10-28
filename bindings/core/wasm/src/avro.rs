use js_sys::Function;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = executeAvroDocumentInspectWire)]
pub fn execute_avro_document_inspect_wire(
    wire_json: &str,
    control_dispatcher: Option<Function>,
) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = super::WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_avro_document_inspect_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::execute_avro_document_inspect_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = avroDocumentInspectProfileVersion)]
pub fn avro_document_inspect_profile_version() -> String {
    umf_core_wire::AVRO_DOCUMENT_INSPECT_PROFILE.to_owned()
}

/// Execute the bounded Avro schema inspector over Rust-owned wire input.
#[wasm_bindgen(js_name = executeAvroInspectWire)]
pub fn execute_avro_inspect_wire(wire_json: &str, control_dispatcher: Option<Function>) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = super::WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_avro_inspect_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::execute_avro_inspect_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = avroInspectProfileVersion)]
pub fn avro_inspect_profile_version() -> String {
    umf_core_wire::AVRO_INSPECT_PROFILE.to_owned()
}

/// Execute the bounded Avro candidate proposal over Rust-owned wire input.
#[wasm_bindgen(js_name = executeAvroCandidateWire)]
pub fn execute_avro_candidate_wire(
    wire_json: &str,
    control_dispatcher: Option<Function>,
) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = super::WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_avro_candidate_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::execute_avro_candidate_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = avroCandidateProfileVersion)]
pub fn avro_candidate_profile_version() -> String {
    umf_core_wire::AVRO_CANDIDATE_PROFILE.to_owned()
}

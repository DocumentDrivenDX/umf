// SPDX-License-Identifier: MIT OR Apache-2.0
//! Browser WASM host export for the opt-in Protobuf descriptor/document packet.

use js_sys::{Function, Uint8Array};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ProtobufDocumentResponse {
    wire_envelope: String,
    binary: Vec<u8>,
}

#[wasm_bindgen]
impl ProtobufDocumentResponse {
    #[wasm_bindgen(getter, js_name = wireEnvelope)]
    pub fn wire_envelope(&self) -> String {
        self.wire_envelope.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn binary(&self) -> Uint8Array {
        Uint8Array::from(self.binary.as_slice())
    }
}

#[wasm_bindgen(js_name = executeProtobufDocumentWire)]
pub fn execute_protobuf_document_wire(
    wire_json: &str,
    input_binary: Vec<u8>,
    control_dispatcher: Option<Function>,
) -> ProtobufDocumentResponse {
    let response = if let Some(dispatcher) = control_dispatcher {
        let mut control = super::WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::protobuf_document::execute(wire_json, &input_binary, &mut hook)
    } else {
        let mut no_control = |_amount| Ok(());
        umf_core_wire::protobuf_document::execute(wire_json, &input_binary, &mut no_control)
    };
    ProtobufDocumentResponse {
        wire_envelope: response.wire_envelope,
        binary: response.binary,
    }
}

#[wasm_bindgen(js_name = protobufDocumentProfileVersion)]
pub fn protobuf_document_profile_version() -> String {
    umf_core_wire::protobuf_document::PROFILE.to_owned()
}

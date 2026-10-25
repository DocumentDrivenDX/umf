// SPDX-License-Identifier: MIT OR Apache-2.0
//! Node host export for the opt-in Protobuf descriptor/document packet.

use napi::{bindgen_prelude::Buffer, Env, JsFunction};
use napi_derive::napi;

#[napi(object)]
pub struct ProtobufDocumentResponse {
    pub wire_envelope: String,
    pub binary: Buffer,
}

#[napi(js_name = "executeProtobufDocumentWire")]
pub fn execute_protobuf_document_wire(
    env: Env,
    wire_json: String,
    input_binary: Buffer,
    control_dispatcher: Option<JsFunction>,
) -> ProtobufDocumentResponse {
    let mut response = if let Some(dispatcher) = control_dispatcher {
        let mut control = super::NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::protobuf_document::execute(&wire_json, input_binary.as_ref(), &mut hook)
    } else {
        let mut no_control = |_amount| Ok(());
        umf_core_wire::protobuf_document::execute(&wire_json, input_binary.as_ref(), &mut no_control)
    };
    ProtobufDocumentResponse {
        wire_envelope: response.wire_envelope,
        binary: Buffer::from(std::mem::take(&mut response.binary)),
    }
}

#[napi(js_name = "protobufDocumentProfileVersion")]
pub fn protobuf_document_profile_version() -> &'static str {
    umf_core_wire::protobuf_document::PROFILE
}

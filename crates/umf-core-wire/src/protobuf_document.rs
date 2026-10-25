// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in Protobuf descriptor/document host packet.
//!
//! Binary descriptors cross the binding as an owned byte buffer, not as hex
//! text or a JSON number array. All tree/document values use core-wire/1.

use super::{
    as_utf16, decode, encode, fail, field, object, result_envelope, text_field, validation_value,
};
use umf_core::{Context, EngineError, Utf16, Value, protobuf_descriptor, protobuf_document};

pub const PROFILE: &str = "umf-r8-protobuf-descriptor-document/0.1.0";

/// Result of one packet operation. `wire_envelope` contains the normal
/// `umf.core-wire/1` envelope; `binary` is populated only by write/export and
/// bundle operations, avoiding a lossy or over-limit text encoding.
pub struct Response {
    pub wire_envelope: String,
    pub binary: Vec<u8>,
}

pub fn execute(
    wire_json: &str,
    input_binary: &[u8],
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> Response {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        // Tagged transport can expand the contract's four-megabyte binary
        // ceiling into eight megabytes of descriptor hex. Keep that transport
        // allowance scoped to the envelope; descriptor/core operations apply
        // their own ordinary and profile-specific limits below.
        let request =
            context.with_tagged_transport_limit(|transport| decode(wire_json, transport))?;
        let operation = text_field(&request, "op")
            .ok_or_else(|| fail("REQUEST", "Protobuf document operation is required"))?;
        let mut binary = Vec::new();
        let output = match operation.as_str() {
            "protobuf.descriptor.read" => {
                charge_binary(input_binary, &mut context)?;
                protobuf_descriptor::read_descriptor_set(input_binary, &mut context)?
            }
            "protobuf.descriptor.write" => {
                let descriptor = required(&request, "descriptorSet", "Descriptor set is required")?;
                binary = protobuf_descriptor::write_descriptor_set(descriptor, &mut context)?;
                Value::Null
            }
            "protobuf.document.import" => {
                let id = field(&request, "id")
                    .and_then(as_utf16)
                    .ok_or_else(|| fail("REQUEST", "Protobuf document id is required"))?
                    .to_utf8()
                    .map_err(|_| fail("REQUEST", "Protobuf document id must be valid UTF-16"))?;
                charge_binary(input_binary, &mut context)?;
                protobuf_document::import_descriptor_set(input_binary, &id, &mut context)?
            }
            "protobuf.document.get" => {
                let document = required(&request, "document", "Protobuf document is required")?;
                protobuf_document::get_descriptor_set(document, &mut context)?
            }
            "protobuf.document.export" => {
                let document = required(&request, "document", "Protobuf document is required")?;
                binary = protobuf_document::export_descriptor_set(document, &mut context)?;
                Value::Null
            }
            "protobuf.document.bundle" => {
                let document = required(&request, "document", "Protobuf document is required")?;
                let bundle = protobuf_document::export_bundle(document, &mut context)?;
                binary = bundle.descriptor_set;
                object(vec![
                    ("source", bundle.source),
                    ("diagnostics", diagnostics_value(bundle.diagnostics)),
                ])
            }
            "protobuf.document.inspect" => {
                let document = required(&request, "document", "Protobuf document is required")?;
                validation_value(protobuf_document::inspect(document, &mut context)?)
            }
            _ => {
                return Err(fail(
                    "REQUEST",
                    "Unknown Protobuf descriptor/document operation",
                ));
            }
        };
        let wire = context.with_tagged_transport_limit(|transport| encode(&output, transport))?;
        Ok((wire, binary))
    })();
    match result {
        Ok((wire, binary)) => Response {
            wire_envelope: result_envelope(Ok(wire)),
            binary,
        },
        Err(error) => Response {
            wire_envelope: result_envelope(Err(error)),
            binary: Vec::new(),
        },
    }
}

fn charge_binary(binary: &[u8], context: &mut Context<'_>) -> Result<(), EngineError> {
    context.charge_work(binary.len(), Utf16::from("/binary"))
}

fn required<'a>(request: &'a Value, name: &str, message: &str) -> Result<&'a Value, EngineError> {
    field(request, name).ok_or_else(|| fail("REQUEST", message))
}

fn diagnostics_value(diagnostics: Vec<umf_core::Diagnostic>) -> Value {
    Value::Array(
        diagnostics
            .into_iter()
            .map(|item| {
                object(vec![
                    ("code", Value::String(item.code)),
                    ("path", Value::String(item.path)),
                    ("message", Value::String(item.message)),
                    (
                        "severity",
                        Value::string_utf8(if item.severity == umf_core::Severity::Warning {
                            "warning"
                        } else {
                            "error"
                        }),
                    ),
                ])
            })
            .collect(),
    )
}

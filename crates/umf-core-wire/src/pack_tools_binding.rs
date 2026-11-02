// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed wire for source-bound browser pack generation.
use crate::{decode, encode, field, result_envelope, text_field};
use umf_core::{Context, EngineError, Utf16, Value};
pub const PROFILE: &str = "umf.pack-tools-wire/1";
const OPERATION: &str = "pack-tools.generatePackTools";
fn request_error(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire, &mut ctx)?;
        let Value::Object(members) = &request else {
            return Err(request_error("Pack-tools envelope must be an object"));
        };
        for (i, (name, _)) in members.iter().enumerate() {
            ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
            if !["profile", "op", "request"]
                .iter()
                .any(|key| name == &Utf16::from(*key))
                || members[..i].iter().any(|(prior, _)| prior == name)
            {
                return Err(request_error(
                    "Pack-tools envelope has an unknown or duplicate member",
                ));
            }
        }
        if text_field(&request, "profile").as_deref() != Some(PROFILE)
            || text_field(&request, "op").as_deref() != Some(OPERATION)
        {
            return Err(request_error("Wrong pack-tools profile or operation"));
        }
        let input = field(&request, "request")
            .ok_or_else(|| request_error("Pack-tools request is required"))?;
        let output = umf_codegen::pack_tools::generate_pack_tools(input, &mut ctx)?;
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

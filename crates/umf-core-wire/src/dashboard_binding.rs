// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed host transport for the public Dashboard operations.
use crate::{decode, encode, result_envelope};
use umf_core::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value},
};

pub const PROFILE: &str = "umf.dashboard-public/1.0.0";
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn err(code: &'static str, message: &'static str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn execute(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    if get(request, "profile") != Some(&Value::string_utf8(PROFILE)) {
        return Err(err("REQUEST", "Wrong Dashboard profile"));
    }
    umf_core::dashboard::execute(request, ctx)
}
pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire, &mut ctx)?;
        let response = execute(&request, &mut ctx)?;
        encode(&response, &mut ctx)
    })();
    result_envelope(result)
}

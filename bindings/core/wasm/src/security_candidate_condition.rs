// SPDX-License-Identifier: MIT OR Apache-2.0
use js_sys::{Function, JsString};
use umf_core::{Context, EngineError, Utf16, Value};
use wasm_bindgen::{JsCast, JsValue};

fn callback_error() -> EngineError {
    EngineError::new(
        "SECURITY_CANDIDATE_CONDITION_CALLBACK",
        Utf16::default(),
        "Condition callback bridge failed",
    )
}

pub fn execute(wire: &str, dispatcher: Function, control_dispatcher: Option<Function>) -> String {
    let mut callback = |request: &Value, ctx: &mut Context<'_>| {
        let input = umf_core_wire::encode_host_callback_value(request, ctx)?;
        let output = dispatcher
            .call1(&JsValue::NULL, &JsValue::from_str(&input))
            .map_err(|_| callback_error())?;
        if !output.is_string() {
            return Err(EngineError::new(
                "SECURITY_CANDIDATE_CONDITION_CALLBACK",
                Utf16::default(),
                "Condition callback must return tagged wire text",
            ));
        }
        let output: JsString = output.unchecked_into();
        let units = output.length() as usize;
        let mut bytes = 0usize;
        let mut index = 0usize;
        while index < units {
            let unit = output.char_code_at(index as u32) as u16;
            let (width, step) = match unit {
                0x0000..=0x007f => (1, 1),
                0x0080..=0x07ff => (2, 1),
                0xd800..=0xdbff
                    if index + 1 < units
                        && (0xdc00..=0xdfff)
                            .contains(&(output.char_code_at((index + 1) as u32) as u16)) =>
                {
                    (4, 2)
                }
                _ => (3, 1),
            };
            bytes = bytes.saturating_add(width);
            index += step;
            if bytes > 32 * 1024 * 1024 {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "Condition callback response exceeds the transport limit",
                ));
            }
        }
        if units > 32 * 1024 * 1024 {
            return Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Condition callback response exceeds the transport limit",
            ));
        }
        ctx.charge_work(units, Utf16::default())?;
        let output = JsValue::from(output)
            .as_string()
            .ok_or_else(callback_error)?;
        ctx.with_tagged_transport_limit(|ctx| {
            umf_core_wire::decode_host_callback_value(&output, ctx)
        })
    };
    let mut control = control_dispatcher.map(|dispatcher| super::WasmControl { dispatcher });
    let mut hook = |amount| match control.as_mut() {
        Some(c) => c.check(amount),
        None => Ok(()),
    };
    umf_core_wire::security_candidate_condition_binding::execute_wire_with_callback(
        wire,
        &mut callback,
        &mut hook,
    )
}

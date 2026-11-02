// SPDX-License-Identifier: MIT OR Apache-2.0
//! Focused WASM host for the Pack Tools native-family wire operation.
use js_sys::Function;
use umf_core::{EngineError, Utf16, Value};
use wasm_bindgen::prelude::*;

const NATIVE_FAMILY_PROFILE: &str = "umf.native-family-dispatch/1";

#[wasm_bindgen(js_name = nativeFamilyDispatcherProfileVersion)]
pub fn native_family_dispatcher_profile_version() -> String {
    NATIVE_FAMILY_PROFILE.to_owned()
}

/// Preserve the established native-family WASM ABI while dispatching only the
/// focused browser compiler family. Other families return the standard closed
/// core-wire error envelope.
#[wasm_bindgen(js_name = executeNativeFamilyWire)]
pub fn execute_native_family_wire(
    family: &str,
    wire_json: &str,
    control_dispatcher: Option<Function>,
) -> String {
    if family != "pack-tools" {
        return umf_core_wire::result_envelope(Err(EngineError::new(
            "REQUEST",
            Utf16::default(),
            "Unknown native adapter family",
        )));
    }

    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::pack_tools_binding::execute_wire_with_control(wire_json, &mut hook)
    } else {
        let mut no_control = |_amount| Ok(());
        umf_core_wire::pack_tools_binding::execute_wire_with_control(wire_json, &mut no_control)
    }
}

struct WasmControl {
    dispatcher: Function,
}

impl WasmControl {
    fn check(&mut self, amount: usize) -> Result<(), EngineError> {
        let output = self
            .dispatcher
            .call1(&JsValue::NULL, &JsValue::from_f64(amount as f64))
            .map_err(|_| {
                EngineError::new(
                    "HOST_CONTROL",
                    Utf16::default(),
                    "WASM host control bridge failed",
                )
            })?;
        let output = output.as_string().ok_or_else(|| {
            EngineError::new(
                "HOST_CONTROL",
                Utf16::default(),
                "WASM host control returned non-text data",
            )
        })?;
        if output.is_empty() {
            return Ok(());
        }
        let result = umf_core_wire::decode(&output, &mut umf_core_wire::transport_context())
            .map_err(|_| {
                EngineError::new(
                    "HOST_CONTROL",
                    Utf16::default(),
                    "Malformed WASM host control result",
                )
            })?;
        if matches!(value_field(&result, "ok"), Some(Value::Bool(true))) {
            return Ok(());
        }
        let code = value_field(&result, "code")
            .and_then(value_text)
            .and_then(|text| text.to_utf8().ok())
            .unwrap_or_else(|| "HOST_CONTROL".to_owned());
        let message = value_field(&result, "message")
            .and_then(value_text)
            .cloned()
            .unwrap_or_else(|| Utf16::from("Host control rejected the operation"));
        let path = value_field(&result, "path")
            .and_then(value_text)
            .cloned()
            .unwrap_or_default();
        Err(EngineError::new(code, path, message))
    }
}

fn value_field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(name, _)| name.units().iter().copied().eq(key.encode_utf16()))
        .map(|(_, value)| value)
}

fn value_text(value: &Value) -> Option<&Utf16> {
    match value {
        Value::String(text) => Some(text),
        _ => None,
    }
}

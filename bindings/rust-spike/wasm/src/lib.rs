use wasm_bindgen::prelude::*;
use js_sys::{Array, Function, JsString, Reflect};

#[wasm_bindgen]
pub fn run(request_json: &str) -> String {
    if requires_schema(request_json) && !browser_crypto_available() {
        return crypto_refusal();
    }
    umf_rust_spike_core::run_with_clock(request_json, || Some(js_sys::Date::now() as u64), None)
}

#[wasm_bindgen]
pub fn engine_version() -> String {
    "r1-structural-schema-spike/0.1.0".to_owned()
}

#[wasm_bindgen]
pub fn run_with_validator(request_json: &str, validator_callback: &Function) -> Result<String, JsValue> {
    run_with_control(request_json, None, Some(validator_callback.clone()))
}

#[wasm_bindgen]
pub fn run_with_control(
    request_json: &str,
    should_cancel: Option<Function>,
    validator_callback: Option<Function>,
) -> Result<String, JsValue> {
    if requires_schema(request_json) && !browser_crypto_available() {
        return Ok(crypto_refusal());
    }
    let mut cancellation_error = None;
    let mut cancellation = || match should_cancel.as_ref() {
        None => false,
        Some(callback) => match callback.call0(&JsValue::UNDEFINED) {
            Ok(value) => value.as_bool().unwrap_or(false),
            Err(error) => { cancellation_error = Some(error); true }
        }
    };
    let mut validator_error = None;
    let mut validator = |units: &[u16]| {
        let Some(callback) = validator_callback.as_ref() else { return Err("validator callback is missing".to_owned()) };
        let pieces = Array::new();
        for chunk in units.chunks(8192) {
            let piece = JsString::from_char_code(chunk);
            pieces.push(&JsValue::from(piece));
        }
        let source = pieces.join("");
        match callback.call1(&JsValue::UNDEFINED, &JsValue::from(source)) {
            Ok(_) => Ok(()),
            Err(error) => { validator_error = Some(error); Err("trusted validator callback failed".to_owned()) }
        }
    };
    let validator_arg = if validator_callback.is_some() { Some(&mut validator as &mut umf_rust_spike_core::Validator<'_>) } else { None };
    let result = umf_rust_spike_core::run_with_control(
        request_json,
        || Some(js_sys::Date::now() as u64),
        &mut cancellation,
        validator_arg,
    );
    drop(validator);
    drop(cancellation);
    if let Some(error) = cancellation_error { return Err(error); }
    if let Some(error) = validator_error { return Err(error); }
    result.map_err(|message| JsValue::from_str(&message))
}

fn requires_schema(request_json: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(request_json).ok()
        .and_then(|request| request.get("op").and_then(serde_json::Value::as_str).map(str::to_owned))
        .is_some_and(|op| op == "validate-record" || op == "generate-keyed-record")
}

fn browser_crypto_available() -> bool {
    let global = js_sys::global();
    let crypto = Reflect::get(&global, &JsValue::from_str("crypto")).unwrap_or(JsValue::UNDEFINED);
    Reflect::get(&crypto, &JsValue::from_str("getRandomValues"))
        .ok().is_some_and(|function| function.is_function())
}

fn crypto_refusal() -> String {
    r#"{"ok":false,"code":"CAPABILITY_REQUIRED","complete":false,"message":"This WASM schema operation requires browser Crypto.getRandomValues for the validator's randomized hash-map seeds","diagnostics":[{"code":"CAPABILITY_REQUIRED","path":"","severity":"error","message":"Use a secure browser context that provides globalThis.crypto.getRandomValues"}]}"#.to_owned()
}

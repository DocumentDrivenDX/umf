use napi::{Env, Error, JsFunction, Result, Status};
use napi_derive::napi;
use std::cell::RefCell;
use std::time::{SystemTime, UNIX_EPOCH};

#[napi]
pub fn run(request_json: String) -> String {
    umf_rust_spike_core::run_with_clock(&request_json, now_ms, None)
}

#[napi]
pub fn engine_version() -> &'static str {
    "r1-structural-schema-spike/0.1.0"
}

#[napi]
pub fn run_with_validator(env: Env, request_json: String, validator_callback: JsFunction) -> Result<String> {
    run_with_control(env, request_json, None, Some(validator_callback))
}

#[napi]
pub fn run_with_control(
    env: Env,
    request_json: String,
    should_cancel: Option<JsFunction>,
    validator_callback: Option<JsFunction>,
) -> Result<String> {
    let callback_error = RefCell::new(None);
    let result = {
    let mut cancellation = || match should_cancel.as_ref() {
        None => false,
        Some(callback) => match callback.call_without_args(None) {
            Ok(value) => value.coerce_to_bool().and_then(|boolean| boolean.get_value()).unwrap_or(false),
            Err(error) => { *callback_error.borrow_mut() = Some(error); true }
        }
    };
    let mut validator = |units: &[u16]| {
        let Some(callback) = validator_callback.as_ref() else { return Err("validator callback is missing".to_owned()) };
        let source = match env.create_string_utf16(units) {
            Ok(value) => value,
            Err(error) => { *callback_error.borrow_mut() = Some(error); return Err("could not create original UTF-16 source string".to_owned()); }
        };
        match callback.call(None, &[source]) {
            Ok(_) => Ok(()),
            Err(error) => { *callback_error.borrow_mut() = Some(error); Err("trusted validator callback failed".to_owned()) }
        }
    };
    umf_rust_spike_core::run_with_control(&request_json, now_ms, &mut cancellation, Some(&mut validator))
    };
    if let Some(error) = callback_error.into_inner() { return Err(error); }
    result.map_err(|message| Error::new(Status::GenericFailure, message))
}

fn now_ms() -> Option<u64> {
    SystemTime::now().duration_since(UNIX_EPOCH).ok().map(|duration| duration.as_millis() as u64)
}

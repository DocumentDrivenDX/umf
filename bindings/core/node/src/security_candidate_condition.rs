// SPDX-License-Identifier: MIT OR Apache-2.0
use napi::{Env, JsFunction, JsString, Result, ValueType};
use std::rc::Rc;
use umf_core::{Context, EngineError, Utf16, Value};

fn callback_error() -> EngineError {
    EngineError::new(
        "SECURITY_CANDIDATE_CONDITION_CALLBACK",
        Utf16::default(),
        "Condition callback bridge failed",
    )
}

pub fn execute(
    env: Env,
    wire: &str,
    dispatcher: JsFunction,
    control_dispatcher: Option<JsFunction>,
) -> Result<String> {
    let env = Rc::new(env);
    let callback_env = Rc::clone(&env);
    let mut callback = |request: &Value, ctx: &mut Context<'_>| {
        let input = umf_core_wire::encode_host_callback_value(request, ctx)?;
        let argument = callback_env
            .create_string(&input)
            .map_err(|_| callback_error())?;
        let output = dispatcher
            .call(None, &[argument.into_unknown()])
            .map_err(|_| callback_error())?;
        if output.get_type().map_err(|_| callback_error())? != ValueType::String {
            return Err(EngineError::new(
                "SECURITY_CANDIDATE_CONDITION_CALLBACK",
                Utf16::default(),
                "Condition callback must return tagged wire text",
            ));
        }
        let output: JsString = unsafe { output.cast() };
        let units = output.utf16_len().map_err(|_| callback_error())?;
        let bytes = output.utf8_len().map_err(|_| callback_error())?;
        if units > 32 * 1024 * 1024 || bytes > 32 * 1024 * 1024 {
            return Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Condition callback response exceeds the transport limit",
            ));
        }
        ctx.charge_work(units, Utf16::default())?;
        let output = output.into_utf8().map_err(|_| callback_error())?;
        let output = output.as_str().map_err(|_| callback_error())?;
        ctx.with_tagged_transport_limit(|ctx| {
            umf_core_wire::decode_host_callback_value(output, ctx)
        })
    };
    let mut control =
        control_dispatcher.map(|dispatcher| super::GraphqlNodeControl { env, dispatcher });
    let mut hook = |amount| match control.as_mut() {
        Some(c) => c.check(amount),
        None => Ok(()),
    };
    Ok(
        umf_core_wire::security_candidate_condition_binding::execute_wire_with_callback(
            wire,
            &mut callback,
            &mut hook,
        ),
    )
}

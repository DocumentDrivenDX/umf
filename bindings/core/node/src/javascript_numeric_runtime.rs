// SPDX-License-Identifier: MIT OR Apache-2.0
use napi::{Env, Error, JsFunction, Result};
use napi_derive::napi;
use umf_core::{context::TransportUsage, Context, EngineError, Utf16, Value};
use umf_core_wire::javascript_numeric_runtime::{
    JavascriptNumericRuntime as CoreRuntime, PreparedJavascriptNumericStage as CoreStage,
};

fn with_control<T>(
    env: Env,
    dispatcher: Option<JsFunction>,
    usage: TransportUsage,
    f: impl FnOnce(&mut Context<'_>) -> std::result::Result<T, EngineError>,
) -> (std::result::Result<T, EngineError>, TransportUsage) {
    if let Some(dispatcher) = dispatcher {
        let mut control = super::NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        let mut context = Context::ordinary().with_host_control(&mut hook);
        usage.seed(&mut context);
        let result = f(&mut context);
        let mut updated = usage;
        updated.capture(&context);
        return (result, updated);
    } else {
        let mut context = Context::ordinary();
        usage.seed(&mut context);
        let result = f(&mut context);
        let mut updated = usage;
        updated.capture(&context);
        return (result, updated);
    }
}

fn decode(wire: &str, ctx: &mut Context<'_>) -> std::result::Result<Value, EngineError> {
    ctx.with_tagged_transport_limit(|transport| umf_core_wire::decode(wire, transport))
}
fn encode_result(value: Value, ctx: &mut Context<'_>) -> std::result::Result<String, EngineError> {
    ctx.with_tagged_transport_limit(|transport| umf_core_wire::encode(&value, transport))
}
fn failure(error: EngineError) -> Error {
    Error::from_reason(umf_core_wire::error_envelope(error))
}

#[napi]
pub struct JavascriptNumericRuntime { inner: CoreRuntime }

#[napi]
pub struct PreparedJavascriptNumericStage {
    inner: Option<CoreStage>,
    usage: Option<TransportUsage>,
}

#[napi]
impl JavascriptNumericRuntime {
    #[napi(constructor)]
    pub fn new(env: Env, resources_wire: String, dispatcher: Option<JsFunction>) -> Result<Self> {
        let result = if let Some(dispatcher) = dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut context = Context::catalog().with_host_control(&mut hook);
            let resources = decode(&resources_wire, &mut context).map_err(failure)?;
            CoreRuntime::new(resources, &mut context).map_err(failure)?
        } else {
            let mut context = Context::catalog();
            let resources = decode(&resources_wire, &mut context).map_err(failure)?;
            CoreRuntime::new(resources, &mut context).map_err(failure)?
        };
        Ok(Self { inner: result })
    }

    #[napi]
    pub fn prepare(
        &self,
        env: Env,
        operation: String,
        args_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<PreparedJavascriptNumericStage> {
        let (result, usage) = with_control(env, dispatcher, TransportUsage::default(), |ctx| {
            let args = decode(&args_wire, ctx)?;
            self.inner.prepare(&operation, &args, ctx)
        });
        Ok(PreparedJavascriptNumericStage {
            inner: Some(result.map_err(failure)?),
            usage: Some(usage),
        })
    }
}

#[napi]
impl PreparedJavascriptNumericStage {
    #[napi]
    pub fn take_output(&mut self, env: Env, dispatcher: Option<JsFunction>) -> Result<String> {
        let (Some(mut stage), Some(usage)) = (self.inner.take(), self.usage.take()) else {
            return Err(failure(EngineError::new("JAVASCRIPT_NUMERIC_STAGE", Utf16::default(), "Prepared numeric stage was already consumed")));
        };
        let (result, _usage) = with_control(env, dispatcher, usage, |ctx| {
            let output = stage.take_output(ctx)?;
            encode_result(output, ctx)
        });
        result.map_err(failure)
    }

    #[napi]
    pub fn validate_context(
        &mut self,
        env: Env,
        context_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<String> {
        let (Some(mut stage), Some(usage)) = (self.inner.take(), self.usage.take()) else {
            return Err(failure(EngineError::new(
                "JAVASCRIPT_NUMERIC_STAGE",
                Utf16::default(),
                "Prepared numeric stage was already consumed",
            )));
        };
        let (result, updated_usage) = with_control(env, dispatcher, usage, |ctx| {
            let context = decode(&context_wire, ctx)?;
            let validation = stage.validate_context(&context, ctx)?;
            let valid = validation.valid && validation.complete;
            encode_result(validation_value(validation), ctx).map(|wire| (wire, valid))
        });
        match result {
            Ok((wire, true)) => {
                self.inner = Some(stage);
                self.usage = Some(updated_usage);
                Ok(wire)
            }
            Ok((wire, false)) => Ok(wire),
            Err(error) => Err(failure(error)),
        }
    }
}

fn validation_value(validation: umf_core::Validation) -> Value {
    Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(validation.valid)),
        (Utf16::from("complete"), Value::Bool(validation.complete)),
        (Utf16::from("diagnostics"), Value::Array(validation.diagnostics.into_iter().map(|d| Value::Object(vec![
            (Utf16::from("code"), Value::String(d.code)),
            (Utf16::from("path"), Value::String(d.path)),
            (Utf16::from("message"), Value::String(d.message)),
            (Utf16::from("severity"), Value::String(Utf16::from(match d.severity { umf_core::Severity::Error => "error", umf_core::Severity::Warning => "warning" }))),
        ])).collect())),
    ])
}

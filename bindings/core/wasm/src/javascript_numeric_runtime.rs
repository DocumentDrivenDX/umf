// SPDX-License-Identifier: MIT OR Apache-2.0
use wasm_bindgen::prelude::*;
use umf_core::{context::TransportUsage, Context, EngineError, Utf16, Value};
use umf_core_wire::javascript_numeric_runtime::{
    JavascriptNumericRuntime as CoreRuntime, PreparedJavascriptNumericStage as CoreStage,
};

fn failure(error: EngineError) -> JsValue {
    JsValue::from_str(&umf_core_wire::error_envelope(error))
}
fn decode(wire: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.with_tagged_transport_limit(|transport| umf_core_wire::decode(wire, transport))
}
fn encode(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.with_tagged_transport_limit(|transport| umf_core_wire::encode(value, transport))
}
fn with_control<T>(
    dispatcher: Option<js_sys::Function>,
    usage: TransportUsage,
    f: impl FnOnce(&mut Context<'_>) -> Result<T, EngineError>,
) -> (Result<T, EngineError>, TransportUsage) {
    if let Some(dispatcher) = dispatcher {
        let mut control = super::WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        let mut ctx = Context::ordinary().with_host_control(&mut hook);
        usage.seed(&mut ctx);
        let result = f(&mut ctx);
        let mut next = usage;
        next.capture(&ctx);
        (result, next)
    } else {
        let mut ctx = Context::ordinary();
        usage.seed(&mut ctx);
        let result = f(&mut ctx);
        let mut next = usage;
        next.capture(&ctx);
        (result, next)
    }
}

#[wasm_bindgen]
pub struct JavascriptNumericRuntime { inner: CoreRuntime }

#[wasm_bindgen]
pub struct PreparedJavascriptNumericStage {
    inner: Option<CoreStage>,
    usage: Option<TransportUsage>,
}

#[wasm_bindgen]
impl JavascriptNumericRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(resources_wire: &str, dispatcher: Option<js_sys::Function>) -> Result<JavascriptNumericRuntime, JsValue> {
        let inner = if let Some(dispatcher) = dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut context = Context::catalog().with_host_control(&mut hook);
            let resources = decode(resources_wire, &mut context).map_err(failure)?;
            CoreRuntime::new(resources, &mut context).map_err(failure)?
        } else {
            let mut context = Context::catalog();
            let resources = decode(resources_wire, &mut context).map_err(failure)?;
            CoreRuntime::new(resources, &mut context).map_err(failure)?
        };
        Ok(Self { inner })
    }

    #[wasm_bindgen]
    pub fn prepare(&self, operation: String, args_wire: String, dispatcher: Option<js_sys::Function>) -> Result<PreparedJavascriptNumericStage, JsValue> {
        let (result, usage) = if let Some(dispatcher) = dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            let args = decode(&args_wire, &mut ctx).map_err(failure)?;
            let result = self.inner.prepare(&operation, &args, &mut ctx).map_err(failure)?;
            let mut usage = TransportUsage::default();
            usage.capture(&ctx);
            (result, usage)
        } else {
            let mut ctx = Context::ordinary();
            let args = decode(&args_wire, &mut ctx).map_err(failure)?;
            let result = self.inner.prepare(&operation, &args, &mut ctx).map_err(failure)?;
            let mut usage = TransportUsage::default();
            usage.capture(&ctx);
            (result, usage)
        };
        Ok(PreparedJavascriptNumericStage { inner: Some(result), usage: Some(usage) })
    }
}

#[wasm_bindgen]
impl PreparedJavascriptNumericStage {
    #[wasm_bindgen]
    pub fn take_output(&mut self, dispatcher: Option<js_sys::Function>) -> Result<String, JsValue> {
        let (Some(mut stage), Some(usage)) = (self.inner.take(), self.usage.take()) else {
            return Err(failure(EngineError::new("JAVASCRIPT_NUMERIC_STAGE", Utf16::default(), "Prepared numeric stage was already consumed")));
        };
        if let Some(dispatcher) = dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            usage.seed(&mut ctx);
            let output = stage.take_output(&mut ctx).map_err(failure)?;
            encode(&output, &mut ctx).map_err(failure)
        } else {
            let mut ctx = Context::ordinary();
            usage.seed(&mut ctx);
            let output = stage.take_output(&mut ctx).map_err(failure)?;
            encode(&output, &mut ctx).map_err(failure)
        }
    }

    #[wasm_bindgen]
    pub fn validate_context(&mut self, context_wire: String, dispatcher: Option<js_sys::Function>) -> Result<String, JsValue> {
        let (Some(mut stage), Some(usage)) = (self.inner.take(), self.usage.take()) else {
            return Err(failure(EngineError::new("JAVASCRIPT_NUMERIC_STAGE", Utf16::default(), "Prepared numeric stage was already consumed")));
        };
        let (result, updated_usage) = with_control(dispatcher, usage, |ctx| {
            let context = decode(&context_wire, ctx)?;
            let validation = stage.validate_context(&context, ctx)?;
            let valid = validation.valid && validation.complete;
            encode(&validation_value(validation), ctx).map(|wire| (wire, valid))
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

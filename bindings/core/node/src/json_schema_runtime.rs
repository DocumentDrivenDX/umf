// SPDX-License-Identifier: MIT OR Apache-2.0
use napi::{Env, Error, JsFunction, Result};
use napi_derive::napi;
use umf_core::EngineError;
use umf_core_wire::PreparedJsonSchemaRuntime as Runtime;

fn prepare(
    env: Env,
    dispatcher: Option<JsFunction>,
) -> std::result::Result<Runtime, EngineError> {
    if let Some(dispatcher) = dispatcher {
        let mut control = super::NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::prepare_json_schema_runtime_with_control(&mut hook)
    } else {
        umf_core_wire::prepare_json_schema_runtime()
    }
}

#[napi]
pub struct PreparedJsonSchemaRuntimeHandle {
    inner: Runtime,
}

#[napi]
impl PreparedJsonSchemaRuntimeHandle {
    #[napi(constructor)]
    pub fn new(env: Env, resource_control: Option<JsFunction>) -> Result<Self> {
        let inner = prepare(env, resource_control)
            .map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))?;
        Ok(Self { inner })
    }

    #[napi]
    pub fn execute(
        &self,
        env: Env,
        wire_json: String,
        operation_control: Option<JsFunction>,
    ) -> String {
        if let Some(dispatcher) = operation_control {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            umf_core_wire::execute_prepared_json_schema_wire_with_control(
                &self.inner,
                &wire_json,
                &mut hook,
            )
        } else {
            umf_core_wire::execute_prepared_json_schema_wire(&self.inner, &wire_json)
        }
    }
}

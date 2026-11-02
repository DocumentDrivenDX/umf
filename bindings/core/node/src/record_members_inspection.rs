// SPDX-License-Identifier: MIT OR Apache-2.0
use napi::{Env, Error, JsFunction, Result};
use napi_derive::napi;
use umf_core::{context::TransportUsage, Context, EngineError, Value};
use umf_core_wire::record_members_inspection_binding::CoreRecordMembersInspectionRuntime as CoreRuntime;

fn decode(wire: &str, context: &mut Context<'_>) -> std::result::Result<Value, EngineError> {
    context.with_tagged_transport_limit(|transport| umf_core_wire::decode(wire, transport))
}

fn result_wire(
    result: std::result::Result<Value, EngineError>,
    context: &mut Context<'_>,
) -> String {
    let result = result.and_then(|value| {
        context.with_tagged_transport_limit(|transport| umf_core_wire::encode(&value, transport))
    });
    umf_core_wire::result_envelope(result)
}

fn run<T>(
    env: Env,
    dispatcher: Option<JsFunction>,
    usage: &mut TransportUsage,
    f: impl FnOnce(&mut Context<'_>) -> std::result::Result<T, EngineError>,
) -> std::result::Result<T, EngineError> {
    if let Some(dispatcher) = dispatcher {
        let mut control = super::NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        let mut context = Context::ordinary().with_host_control(&mut hook);
        usage.seed(&mut context);
        let result = f(&mut context);
        usage.capture(&context);
        result
    } else {
        let mut context = Context::ordinary();
        usage.seed(&mut context);
        let result = f(&mut context);
        usage.capture(&context);
        result
    }
}

fn failure(error: EngineError) -> Error {
    Error::from_reason(umf_core_wire::error_envelope(error))
}

#[napi]
pub struct CoreRecordMembersInspectionRuntime {
    inner: CoreRuntime,
}

#[napi]
impl CoreRecordMembersInspectionRuntime {
    #[napi(constructor)]
    pub fn new(env: Env, resources_wire: String, dispatcher: Option<JsFunction>) -> Result<Self> {
        let mut usage = TransportUsage::default();
        let inner = run(env, dispatcher, &mut usage, |context| {
            let resources = decode(&resources_wire, context)?;
            CoreRuntime::new(resources, context)
        })
        .map_err(failure)?;
        Ok(Self { inner })
    }

    #[napi]
    pub fn inspect(
        &self,
        env: Env,
        source_wire: String,
        identity_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<String> {
        let mut usage = TransportUsage::default();
        let result = run(env, dispatcher, &mut usage, |context| {
            let source = decode(&source_wire, context)?;
            let identity = decode(&identity_wire, context)?;
            let inspected = self.inner.inspect(&source, &identity, context);
            Ok(result_wire(inspected, context))
        })
        .map_err(failure)?;
        Ok(result)
    }
}

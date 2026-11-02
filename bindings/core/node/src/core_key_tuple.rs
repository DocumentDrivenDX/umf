// SPDX-License-Identifier: MIT OR Apache-2.0
use napi::{Env, Error, JsFunction, Result, bindgen_prelude::Buffer};
use napi_derive::napi;
use umf_core::{Context, EngineError, Utf16, Value, context::TransportUsage};
use umf_core_wire::core_key_tuple_binding::{
    CoreKeyTupleRuntime as CoreRuntime, PreparedCoreKeyTupleBinding, PreparedCoreKeyTupleByteRead,
    CoreKeyTupleEncodeStage, PreparedCoreKeyTupleVerification,
};

fn decode(wire: &str, context: &mut Context<'_>) -> std::result::Result<Value, EngineError> {
    context.with_tagged_transport_limit(|transport| umf_core_wire::decode(wire, transport))
}

fn result_wire(
    result: std::result::Result<Value, EngineError>,
    context: &mut Context<'_>,
) -> String {
    let encoded = result.and_then(|value| {
        context.with_tagged_transport_limit(|transport| umf_core_wire::encode(&value, transport))
    });
    umf_core_wire::result_envelope(encoded)
}

fn run<T>(
    env: Env,
    dispatcher: Option<JsFunction>,
    f: impl FnOnce(&mut Context<'_>) -> std::result::Result<T, EngineError>,
) -> std::result::Result<T, EngineError> {
    if let Some(dispatcher) = dispatcher {
        let mut control = super::NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        f(&mut Context::ordinary().with_host_control(&mut hook))
    } else {
        f(&mut Context::ordinary())
    }
}

fn run_with_usage<T>(
    env: Env,
    dispatcher: Option<JsFunction>,
    mut usage: TransportUsage,
    f: impl FnOnce(&mut Context<'_>) -> std::result::Result<T, EngineError>,
) -> (std::result::Result<T, EngineError>, TransportUsage) {
    let result = if let Some(dispatcher) = dispatcher {
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
    };
    (result, usage)
}

#[napi]
pub struct PreparedCoreKeyTupleHandle {
    inner: PreparedCoreKeyTupleBinding,
}

#[napi]
impl PreparedCoreKeyTupleHandle {
    #[napi(constructor)]
    pub fn new(
        env: Env,
        source_wire: String,
        resources_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<Self> {
        let inner = run(env, dispatcher, |context| {
            let source = decode(&source_wire, context)?;
            let resources = decode(&resources_wire, context)?;
            CoreRuntime::new(resources, context)?.prepare(&source, context)
        })
        .map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))?;
        Ok(Self { inner })
    }

    #[napi]
    pub fn encode(
        &self,
        env: Env,
        identity_wire: String,
        values_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<String> {
        run(env, dispatcher, |context| {
            let identity = decode(&identity_wire, context)?;
            let values = decode(&values_wire, context)?;
            let result = self.inner.encode(&identity, &values, context);
            Ok(result_wire(result, context))
        })
        .map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))
    }

    #[napi]
    pub fn verify(
        &self,
        env: Env,
        receipt_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<String> {
        run(env, dispatcher, |context| {
            let receipt = decode(&receipt_wire, context)?;
            let result = self.inner.verify(&receipt, context);
            Ok(result_wire(result, context))
        })
        .map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))
    }

    #[napi]
    pub fn source_wire(&self, env: Env, dispatcher: Option<JsFunction>) -> Result<String> {
        run(env, dispatcher, |context| self.inner.source_wire(context))
            .map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))
    }
}

#[napi]
pub struct CoreKeyTupleRuntime {
    inner: CoreRuntime,
}

#[napi]
pub struct PreparedCoreKeyTupleByteReadHandle {
    inner: Option<PreparedCoreKeyTupleByteRead>,
    usage: Option<TransportUsage>,
}

#[napi]
pub struct PreparedCoreKeyTupleVerificationHandle {
    inner: Option<PreparedCoreKeyTupleVerification>,
    usage: Option<TransportUsage>,
}

#[napi]
pub struct PreparedCoreKeyTupleEncodeHandle {
    inner: Option<CoreKeyTupleEncodeStage>,
    usage: Option<TransportUsage>,
}

fn consumed_stage_error() -> EngineError {
    EngineError::new(
        "KEY_TUPLE_STAGE",
        Utf16::default(),
        "Prepared verification stage was already consumed",
    )
}

fn consumed_encode_stage_error() -> EngineError {
    EngineError::new(
        "KEY_TUPLE_STAGE",
        Utf16::default(),
        "Prepared encoding stage was already consumed",
    )
}

#[napi]
impl PreparedCoreKeyTupleEncodeHandle {
    #[napi]
    pub fn encode_with_options(
        &mut self,
        env: Env,
        options_wire: Option<String>,
        dispatcher: Option<JsFunction>,
    ) -> Result<String> {
        let (Some(inner), Some(usage)) = (self.inner.take(), self.usage.take()) else {
            return Err(Error::from_reason(umf_core_wire::error_envelope(
                consumed_encode_stage_error(),
            )));
        };
        let (result, _usage) = run_with_usage(env, dispatcher, usage, |context| {
            let options = options_wire
                .as_deref()
                .map(|wire| decode(wire, context))
                .transpose()?;
            let result = inner.finish(options.as_ref(), context);
            Ok(result_wire(result, context))
        });
        result.map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))
    }
}

#[napi]
impl PreparedCoreKeyTupleVerificationHandle {
    #[napi]
    pub fn verify_current(
        &mut self,
        env: Env,
        current_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<String> {
        let (Some(inner), Some(usage)) = (self.inner.take(), self.usage.take()) else {
            return Err(Error::from_reason(umf_core_wire::error_envelope(
                consumed_stage_error(),
            )));
        };
        let (result, _usage) = run_with_usage(env, dispatcher, usage, |context| {
            let current = decode(&current_wire, context)?;
            let result = inner.verify_current(&current, context);
            Ok(result_wire(result, context))
        });
        result.map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))
    }

    #[napi]
    pub fn read_bytes(
        &mut self,
        env: Env,
        current_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<Buffer> {
        let (Some(inner), Some(usage)) = (self.inner.take(), self.usage.take()) else {
            return Err(Error::from_reason(umf_core_wire::error_envelope(
                consumed_stage_error(),
            )));
        };
        let (result, _usage) = run_with_usage(env, dispatcher, usage, |context| {
            let current = decode(&current_wire, context)?;
            inner.read_bytes(&current, context)
        });
        result
            .map(Buffer::from)
            .map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))
    }
}

#[napi]
impl PreparedCoreKeyTupleByteReadHandle {
    #[napi]
    pub fn read_bytes(
        &mut self,
        env: Env,
        current_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<Buffer> {
        let (Some(inner), Some(usage)) = (self.inner.take(), self.usage.take()) else {
            return Err(Error::from_reason(umf_core_wire::error_envelope(
                consumed_stage_error(),
            )));
        };
        let (bytes, _usage) = run_with_usage(env, dispatcher, usage, |context| {
            let current = decode(&current_wire, context)?;
            inner.read_bytes(&current, context)
        });
        let bytes =
            bytes.map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))?;
        Ok(Buffer::from(bytes))
    }
}

#[napi]
impl CoreKeyTupleRuntime {
    #[napi(constructor)]
    pub fn new(env: Env, resources_wire: String, dispatcher: Option<JsFunction>) -> Result<Self> {
        let inner = run(env, dispatcher, |context| {
            let resources = decode(&resources_wire, context)?;
            CoreRuntime::new(resources, context)
        })
        .map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))?;
        Ok(Self { inner })
    }

    #[napi]
    pub fn encode(
        &self,
        env: Env,
        source_wire: String,
        identity_wire: String,
        values_wire: String,
        profile: Option<String>,
        dispatcher: Option<JsFunction>,
    ) -> Result<String> {
        run(env, dispatcher, |context| {
            let source = decode(&source_wire, context)?;
            let identity = decode(&identity_wire, context)?;
            let values = decode(&values_wire, context)?;
            let result =
                self.inner
                    .encode(&source, &identity, &values, profile.as_deref(), context);
            Ok(result_wire(result, context))
        })
        .map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))
    }

    #[napi]
    pub fn prepare_encoding(
        &self,
        env: Env,
        source_wire: String,
        identity_wire: String,
        values_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<PreparedCoreKeyTupleEncodeHandle> {
        let (result, usage) = run_with_usage(env, dispatcher, TransportUsage::default(), |context| {
            let source = decode(&source_wire, context)?;
            let identity = decode(&identity_wire, context)?;
            let values = decode(&values_wire, context)?;
            self.inner.prepare_encode_stage(source, identity, values)
        });
        let inner = result.map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))?;
        Ok(PreparedCoreKeyTupleEncodeHandle { inner: Some(inner), usage: Some(usage) })
    }

    #[napi]
    pub fn prepare_verification(
        &self,
        env: Env,
        receipt_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<PreparedCoreKeyTupleVerificationHandle> {
        let (result, usage) =
            run_with_usage(env, dispatcher, TransportUsage::default(), |context| {
                let receipt = decode(&receipt_wire, context)?;
                self.inner.prepare_verification(&receipt, context)
            });
        let inner =
            result.map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))?;
        Ok(PreparedCoreKeyTupleVerificationHandle {
            inner: Some(inner),
            usage: Some(usage),
        })
    }

    #[napi]
    pub fn prepare_byte_read(
        &self,
        env: Env,
        receipt_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<PreparedCoreKeyTupleByteReadHandle> {
        let (result, usage) =
            run_with_usage(env, dispatcher, TransportUsage::default(), |context| {
                let receipt = decode(&receipt_wire, context)?;
                self.inner.prepare_byte_read(&receipt, context)
            });
        let inner =
            result.map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))?;
        Ok(PreparedCoreKeyTupleByteReadHandle {
            inner: Some(inner),
            usage: Some(usage),
        })
    }

    #[napi]
    pub fn prepare(
        &self,
        env: Env,
        source_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> Result<PreparedCoreKeyTupleHandle> {
        let inner = run(env, dispatcher, |context| {
            let source = decode(&source_wire, context)?;
            self.inner.prepare(&source, context)
        })
        .map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))?;
        Ok(PreparedCoreKeyTupleHandle { inner })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use umf_core::Utf16;

    #[test]
    fn tagged_admission_is_charged_to_host_control() {
        let wire = umf_core_wire::encode(
            &Value::Array(vec![Value::Number(1.0), Value::Number(2.0)]),
            &mut umf_core_wire::transport_context(),
        )
        .unwrap();
        let mut calls = 0;
        let mut hook = |_amount| {
            calls += 1;
            Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "admission stopped",
            ))
        };
        let mut context = Context::ordinary().with_host_control(&mut hook);
        let result = decode(&wire, &mut context);
        assert_eq!(result.unwrap_err().code, "RESOURCE_LIMIT");
        assert!(calls > 0);
    }

    #[test]
    fn result_tagged_encoding_is_charged_to_host_control() {
        let mut calls = 0;
        let mut hook = |_amount| {
            calls += 1;
            Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "output stopped",
            ))
        };
        let mut context = Context::ordinary().with_host_control(&mut hook);
        let result = result_wire(Ok(Value::Array(vec![Value::Number(1.0)])), &mut context);
        assert!(result.contains("RESOURCE_LIMIT"));
        assert!(calls > 0);
    }
}

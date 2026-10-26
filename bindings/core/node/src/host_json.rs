// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private synchronous `umf.host-json/1` Node adapter.
use napi::{Env, JsFunction, JsString, ValueType};
use napi_derive::napi;
use std::collections::BTreeMap;
use std::sync::Arc;
use std::fmt::Write as _;
use umf_core::{
    host_json::{
        HostDescriptorSnapshot, HostDescriptorValue, HostDiagnosticArrayItem, HostHandle, HostInvokeValue, HostJsonEvent,
        HostJsonKind, HostJsonReflection, HostJsonReply, HostOpaqueKey, HostOpaqueValue,
        HostPropertyDescriptor, HostPrototype, HostSpreadFailureTarget, HostStringRef,
    },
    cardinality_host_json, record_values, schema_properties, Context, Engine, EngineError, ResourceSet, Utf16, Value,
};
use umf_core_wire::core_key_verification_binding::CoreKeyVerificationRuntime;
use crate::core_key_verification::PreparedCoreKeyVerificationHandle;

fn kind_nullability_operation(
    name: &str,
) -> Result<umf_core::core_kind_nullability_host_json::CoreKindNullabilityHostOperation, EngineError>
{
    use umf_core::core_kind_nullability_host_json::CoreKindNullabilityHostOperation as Op;
    match name {
        "inspectCoreKind" => Ok(Op::InspectKind),
        "declareCoreKind" => Ok(Op::DeclareKind),
        "verifyCoreKindDeclaration" => Ok(Op::VerifyKind),
        "inspectCoreNullability" => Ok(Op::InspectNullability),
        "declareCoreNullability" => Ok(Op::DeclareNullability),
        "verifyCoreNullabilityDeclaration" => Ok(Op::VerifyNullability),
        _ => Err(EngineError::new(
            "REQUEST",
            Utf16::default(),
            "Unknown kind/nullability host operation",
        )),
    }
}

/// Retained immutable resources/engine for one Core kind/nullability factory.
/// Construction admits resources once; each method gets a fresh operation Context.
#[napi]
pub struct CoreKindNullabilityRuntime {
    engine: Arc<Engine>,
    key_verification: CoreKeyVerificationRuntime,
    kind_schemas: umf_core::core_kind::OperationSchemas,
    nullability_schemas: umf_core::nullability::OperationSchemas,
}

#[napi]
impl CoreKindNullabilityRuntime {
    #[napi(constructor)]
    pub fn new(
        env: Env,
        resources_wire: String,
        control_dispatcher: Option<JsFunction>,
    ) -> napi::Result<Self> {
        let result = if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            let resources =
                ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(&resources_wire, ctx));
            resources.and_then(|mut resources| {
                let engine = ctx.with_catalog_value_limit(|catalog| {
                    Engine::new(
                        ResourceSet::new(
                            take_core_resource(&mut resources, "coreSchema")?,
                            take_core_resource(&mut resources, "referenceSchema")?,
                            take_core_resource(&mut resources, "packageSchema")?,
                            take_core_resource(&mut resources, "constraints")?,
                            take_core_resource(&mut resources, "domainPolicy")?,
                        ),
                        catalog,
                    )
                })?;
                let kind_schemas = umf_core::core_kind::prepare_operation_schemas(&mut ctx)?;
                let nullability_schemas = umf_core::nullability::prepare_operation_schemas(&mut ctx)?;
                let registry = ctx.with_catalog_value_limit(|catalog| engine.registry(catalog))?;
                Ok((Arc::new(engine), registry, kind_schemas, nullability_schemas))
            })
        } else {
            let mut ctx = Context::ordinary();
            let resources =
                ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(&resources_wire, ctx));
            resources.and_then(|mut resources| {
                let engine = ctx.with_catalog_value_limit(|catalog| {
                    Engine::new(
                        ResourceSet::new(
                            take_core_resource(&mut resources, "coreSchema")?,
                            take_core_resource(&mut resources, "referenceSchema")?,
                            take_core_resource(&mut resources, "packageSchema")?,
                            take_core_resource(&mut resources, "constraints")?,
                            take_core_resource(&mut resources, "domainPolicy")?,
                        ),
                        catalog,
                    )
                })?;
                let kind_schemas = umf_core::core_kind::prepare_operation_schemas(&mut ctx)?;
                let nullability_schemas = umf_core::nullability::prepare_operation_schemas(&mut ctx)?;
                let registry = ctx.with_catalog_value_limit(|catalog| engine.registry(catalog))?;
                Ok((Arc::new(engine), registry, kind_schemas, nullability_schemas))
            })
        };
        result
            .map(|(engine, registry, kind_schemas, nullability_schemas)| Self {
                key_verification: CoreKeyVerificationRuntime::from_shared(engine.clone(), Arc::new(registry)),
                engine,
                kind_schemas,
                nullability_schemas,
            })
            .map_err(|error| napi::Error::from_reason(umf_core_wire::error_envelope(error)))
    }

    /// Stage receipt-first Core Key verification on this runtime's retained Engine.
    #[napi]
    pub fn prepare_verification(
        &self,
        env: Env,
        receipt_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> napi::Result<PreparedCoreKeyVerificationHandle> {
        let mut usage = umf_core::context::TransportUsage::default();
        let result = if let Some(dispatcher) = dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            usage.seed(&mut ctx);
            let result = (|| {
                let receipt = ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(&receipt_wire, ctx))?;
                self.key_verification.prepare(&receipt, &mut ctx)
            })();
            usage.capture(&ctx);
            result
        } else {
            let mut ctx = Context::ordinary();
            usage.seed(&mut ctx);
            let result = (|| {
                let receipt = ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(&receipt_wire, ctx))?;
                self.key_verification.prepare(&receipt, &mut ctx)
            })();
            usage.capture(&ctx);
            result
        };
        result.map(|inner| PreparedCoreKeyVerificationHandle { inner: Some(inner), usage: Some(usage) })
            .map_err(|error| napi::Error::from_reason(umf_core_wire::error_envelope(error)))
    }

    /// Finish the one-use stage; consuming it before decoding current preserves refusal semantics.
    #[napi]
    pub fn finish_verification(
        &self,
        env: Env,
        handle: &mut PreparedCoreKeyVerificationHandle,
        current_wire: String,
        dispatcher: Option<JsFunction>,
    ) -> napi::Result<String> {
        let (Some(stage), Some(mut usage)) = (handle.inner.take(), handle.usage.take()) else {
            return Err(napi::Error::from_reason(umf_core_wire::error_envelope(EngineError::new(
                "CORE_KEY_STAGE", Utf16::default(), "Prepared verification stage was already consumed",
            ))));
        };
        let result = if let Some(dispatcher) = dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            usage.seed(&mut ctx);
            let result = (|| {
                let current = ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(&current_wire, ctx))?;
                let verified = self.key_verification.finish(stage, &current, &mut ctx);
                let encoded = verified.and_then(|value| ctx.with_tagged_transport_limit(|ctx| umf_core_wire::encode(&value, ctx)));
                Ok::<_, EngineError>(umf_core_wire::result_envelope(encoded))
            })();
            usage.capture(&ctx);
            result
        } else {
            let mut ctx = Context::ordinary();
            usage.seed(&mut ctx);
            let result = (|| {
                let current = ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(&current_wire, ctx))?;
                let verified = self.key_verification.finish(stage, &current, &mut ctx);
                let encoded = verified.and_then(|value| ctx.with_tagged_transport_limit(|ctx| umf_core_wire::encode(&value, ctx)));
                Ok::<_, EngineError>(umf_core_wire::result_envelope(encoded))
            })();
            usage.capture(&ctx);
            result
        };
        result.map_err(|error| napi::Error::from_reason(umf_core_wire::error_envelope(error)))
    }

    #[napi]
    pub fn discard_verification(
        &self,
        handle: &mut PreparedCoreKeyVerificationHandle,
    ) -> napi::Result<()> {
        let (Some(stage), Some(_usage)) = (handle.inner.take(), handle.usage.take()) else {
            return Err(napi::Error::from_reason(umf_core_wire::error_envelope(EngineError::new(
                "CORE_KEY_STAGE", Utf16::default(), "Prepared verification stage was already consumed",
            ))));
        };
        self.key_verification.discard(stage).map_err(|error| napi::Error::from_reason(umf_core_wire::error_envelope(error)))
    }

    #[napi]
    pub fn execute(
        &self,
        env: Env,
        operation: String,
        first: u32,
        second: u32,
        third: u32,
        dispatcher: JsFunction,
        control_dispatcher: Option<JsFunction>,
    ) -> String {
        let operation = match kind_nullability_operation(&operation) {
            Ok(operation) => operation,
            Err(error) => return umf_core_wire::result_envelope(Err(error)),
        };
        let handles: Vec<_> = [first, second, third]
            .into_iter()
            .filter(|handle| *handle != 0)
            .map(|handle| handle as HostHandle)
            .collect();
        let mut host = NodeHostJson {
            env: env.clone(),
            dispatcher,
            string_lengths: BTreeMap::new(),
        };
        let result = if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            let value = umf_core::core_kind_nullability_host_json::execute(
                operation,
                &handles,
                &mut host,
                &self.engine,
                &self.kind_schemas,
                &self.nullability_schemas,
                &mut ctx,
            );
            let encoded = value.and_then(|value| umf_core_wire::encode(&value, &mut ctx));
            encoded
        } else {
            let mut ctx = Context::ordinary();
            let value = umf_core::core_kind_nullability_host_json::execute(
                operation,
                &handles,
                &mut host,
                &self.engine,
                &self.kind_schemas,
                &self.nullability_schemas,
                &mut ctx,
            );
            let encoded = value.and_then(|value| umf_core_wire::encode(&value, &mut ctx));
            encoded
        };
        umf_core_wire::result_envelope(result)
    }

    #[napi(js_name = "executeModelRequestWire")]
    pub fn execute_model_request_wire(
        &self,
        env: Env,
        wire_json: String,
        profile: String,
        dispatcher: JsFunction,
        control_dispatcher: Option<JsFunction>,
    ) -> String {
        let profile = match profile.as_str() {
            "cooperative" => umf_core::ResourceProfile::Cooperative,
            "hard-isolated" => umf_core::ResourceProfile::HardIsolated,
            _ => return umf_core_wire::error_envelope(EngineError::new("RESOURCE_PROFILE", Utf16::default(), "Unknown resource profile")),
        };
        let mut capabilities = super::NodeCapabilities { env: env.clone(), dispatcher };
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            umf_core_wire::execute_request_with_engine_and_control(
                &wire_json, profile, &mut capabilities, &mut hook, Some(&self.engine),
            )
        } else {
            let mut hook = |_amount| Ok(());
            umf_core_wire::execute_request_with_engine_and_control(
                &wire_json, profile, &mut capabilities, &mut hook, Some(&self.engine),
            )
        }
    }
}

#[napi(js_name = "executeCoreKindNullabilityHostJson")]
pub fn execute_core_kind_nullability_host_json(
    env: Env,
    resources_wire: String,
    operation: String,
    first: u32,
    second: u32,
    third: u32,
    dispatcher: JsFunction,
    control_dispatcher: Option<JsFunction>,
) -> String {
    let mut host = NodeHostJson {
        env: env.clone(),
        dispatcher,
        string_lengths: BTreeMap::new(),
    };
    let result = (|| -> Result<String, EngineError> {
        let operation = kind_nullability_operation(&operation)?;
        let handles: Vec<_> = [first, second, third]
            .into_iter()
            .filter(|handle| *handle != 0)
            .map(|handle| handle as HostHandle)
            .collect();
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            let resources =
                ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(&resources_wire, ctx))?;
            let resource = |name: &str| {
                object_field(&resources, name).cloned().ok_or_else(|| {
                    EngineError::new(
                        "REQUEST",
                        Utf16::from(name),
                        "Explicit resource is required",
                    )
                })
            };
            let engine = ctx.with_catalog_value_limit(|catalog| {
                Engine::new(
                    ResourceSet::new(
                        resource("coreSchema")?,
                        resource("referenceSchema")?,
                        resource("packageSchema")?,
                        resource("constraints")?,
                        resource("domainPolicy")?,
                    ),
                    catalog,
                )
            })?;
            let kind_schemas = umf_core::core_kind::prepare_operation_schemas(&mut ctx)?;
            let nullability_schemas = umf_core::nullability::prepare_operation_schemas(&mut ctx)?;
            let value = umf_core::core_kind_nullability_host_json::execute(
                operation,
                &handles,
                &mut host,
                &engine,
                &kind_schemas,
                &nullability_schemas,
                &mut ctx,
            )?;
            umf_core_wire::encode(&value, &mut ctx)
        } else {
            let mut ctx = Context::ordinary();
            let resources =
                ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(&resources_wire, ctx))?;
            let resource = |name: &str| {
                object_field(&resources, name).cloned().ok_or_else(|| {
                    EngineError::new(
                        "REQUEST",
                        Utf16::from(name),
                        "Explicit resource is required",
                    )
                })
            };
            let engine = ctx.with_catalog_value_limit(|catalog| {
                Engine::new(
                    ResourceSet::new(
                        resource("coreSchema")?,
                        resource("referenceSchema")?,
                        resource("packageSchema")?,
                        resource("constraints")?,
                        resource("domainPolicy")?,
                    ),
                    catalog,
                )
            })?;
            let kind_schemas = umf_core::core_kind::prepare_operation_schemas(&mut ctx)?;
            let nullability_schemas = umf_core::nullability::prepare_operation_schemas(&mut ctx)?;
            let value = umf_core::core_kind_nullability_host_json::execute(
                operation,
                &handles,
                &mut host,
                &engine,
                &kind_schemas,
                &nullability_schemas,
                &mut ctx,
            )?;
            umf_core_wire::encode(&value, &mut ctx)
        }
    })();
    umf_core_wire::result_envelope(result)
}

struct NodeHostJson {
    env: Env,
    dispatcher: JsFunction,
    string_lengths: BTreeMap<u64, usize>,
}

/// Reuse the invocation-local opaque reflection adapter for source import.
pub(super) fn protobuf_source_host(env: Env, dispatcher: JsFunction) -> impl HostJsonReflection {
    NodeHostJson {
        env,
        dispatcher,
        string_lengths: BTreeMap::new(),
    }
}

impl HostJsonReflection for NodeHostJson {
    fn reflect(&mut self, event: HostJsonEvent) -> Result<HostJsonReply, EngineError> {
        let request = event_json(&event);
        let event_string = self
            .env
            .create_string(&request)
            .map_err(|_| bridge_error())?;
        let args = [event_string.into_unknown()];
        let output = self
            .dispatcher
            .call(None, &args)
            .map_err(|_| bridge_error())?;
        if output.get_type().map_err(|_| bridge_error())? != ValueType::String {
            return Err(bridge_error());
        }
        let output: JsString = unsafe { output.cast() };
        // Query the N-API byte length before `into_utf8` allocates its Vec.
        // One chunk reply is at most 8,192 decimal code units plus framing.
        if output.utf8_len().map_err(|_| bridge_error())? > 600 * 1024 {
            return Err(protocol_error());
        }
        let output = output.into_utf8().map_err(|_| bridge_error())?;
        let output = output
            .as_str()
            .map(str::to_owned)
            .map_err(|_| bridge_error())?;
        // The only large reply is a UTF-16 chunk: at most 8,192 decimal
        // code units plus JSON punctuation. Reject oversized framing before
        // JSON decode can allocate its tagged tree.
        if output.len() > 600 * 1024 {
            return Err(protocol_error());
        }
        let reply = umf_core_wire::decode(&output, &mut umf_core_wire::transport_context())
            .map_err(|_| protocol_error())?;
        decode_reply(&event, reply, &mut self.string_lengths)
    }

    fn release_descriptor_snapshot(&mut self, token: u64) {
        // JS owns the token table and clears the whole invocation in `finally`.
        // No callback or per-snapshot Rust allocation occurs during cleanup.
        let _ = token;
    }
}

#[napi(js_name = "executeDeclareCoreSchemaPropertiesHostJson")]
pub fn execute_declare_core_schema_properties_host_json(
    env: Env,
    resources_wire: String,
    source_handle: u32,
    identity_handle: u32,
    patch_handle: u32,
    dispatcher: JsFunction,
) -> String {
    let mut host = NodeHostJson {
        env,
        dispatcher,
        string_lengths: BTreeMap::new(),
    };
    let result = (|| -> Result<String, EngineError> {
        let resources =
            umf_core_wire::decode(&resources_wire, &mut umf_core_wire::transport_context())?;
        let resource = |name: &str| {
            object_field(&resources, name).cloned().ok_or_else(|| {
                EngineError::new(
                    "REQUEST",
                    Utf16::from(name),
                    "Explicit resource is required",
                )
            })
        };
        let engine = {
            let mut catalog = Context::catalog();
            Engine::new(
                ResourceSet::new(
                    resource("coreSchema")?,
                    resource("referenceSchema")?,
                    resource("packageSchema")?,
                    resource("constraints")?,
                    resource("domainPolicy")?,
                ),
                &mut catalog,
            )?
        };
        let mut ctx = Context::ordinary();
        let declared = schema_properties::declare_core_schema_properties_host_json(
            source_handle as HostHandle,
            identity_handle as HostHandle,
            patch_handle as HostHandle,
            &mut host,
            &engine,
            &mut ctx,
        )?;
        umf_core_wire::encode(&declared, &mut ctx)
    })();
    umf_core_wire::result_envelope(result)
}

#[napi(js_name = "executeCoreSchemaPropertiesHostJson")]
pub fn execute_core_schema_properties_host_json(
    env: Env,
    resources_wire: String,
    operation: String,
    source_handle: u32,
    identity_handle: u32,
    third_handle: u32,
    dispatcher: JsFunction,
) -> String {
    let mut host = NodeHostJson { env, dispatcher, string_lengths: BTreeMap::new() };
    let result = (|| -> Result<String, EngineError> {
        let resources = umf_core_wire::decode(&resources_wire, &mut umf_core_wire::transport_context())?;
        let resource = |name: &str| object_field(&resources, name).cloned().ok_or_else(|| {
            EngineError::new("REQUEST", Utf16::from(name), "Explicit resource is required")
        });
        let engine = {
            let mut catalog = Context::catalog();
            Engine::new(ResourceSet::new(
                resource("coreSchema")?, resource("referenceSchema")?,
                resource("packageSchema")?, resource("constraints")?,
                resource("domainPolicy")?,
            ), &mut catalog)?
        };
        let mut ctx = Context::ordinary();
        let value = umf_core::schema_properties_host_json::execute(
            &operation, source_handle as HostHandle, identity_handle as HostHandle,
            third_handle as HostHandle, &mut host, &engine, &mut ctx,
        )?;
        umf_core_wire::encode(&value, &mut ctx)
    })();
    umf_core_wire::result_envelope(result)
}

/// Private opt-in Core Cardinality route. Caller roots stay opaque until Rust
/// requests them; one operation Context owns reflection and semantic work.
#[napi(js_name = "executeCoreCardinalityHostJson")]
pub fn execute_core_cardinality_host_json(
    env: Env,
    resources_wire: String,
    operation: String,
    source_handle: u32,
    identity_handle: u32,
    third_handle: u32,
    dispatcher: JsFunction,
) -> String {
    let mut host = NodeHostJson { env, dispatcher, string_lengths: BTreeMap::new() };
    let result = (|| -> Result<String, EngineError> {
        let resources = umf_core_wire::decode(&resources_wire, &mut umf_core_wire::transport_context())?;
        let resource = |name: &str| object_field(&resources, name).cloned().ok_or_else(|| {
            EngineError::new("REQUEST", Utf16::from(name), "Explicit resource is required")
        });
        let engine = {
            let mut catalog = Context::catalog();
            Engine::new(ResourceSet::new(
                resource("coreSchema")?, resource("referenceSchema")?,
                resource("packageSchema")?, resource("constraints")?,
                resource("domainPolicy")?,
            ), &mut catalog)?
        };
        let mut ctx = Context::ordinary();
        let value = cardinality_host_json::execute(
            &operation,
            &[source_handle as HostHandle, identity_handle as HostHandle, third_handle as HostHandle],
            &mut host,
            &engine,
            &mut ctx,
        )?;
        umf_core_wire::encode(&value, &mut ctx)
    })();
    umf_core_wire::result_envelope(result)
}

/// Private opt-in host route for R8 Selection. Kept outside the package roots.
#[napi(js_name = "executeCoreElementSelectionHostJson")]
pub fn execute_core_element_selection_host_json(
    env: Env,
    resources_wire: String,
    has_registry: bool,
    source_handle: u32,
    query_handle: u32,
    registry_handle: u32,
    dispatcher: JsFunction,
) -> String {
    let mut host = NodeHostJson { env, dispatcher, string_lengths: BTreeMap::new() };
    let result = (|| -> Result<String, EngineError> {
        let resources = umf_core_wire::decode(&resources_wire, &mut umf_core_wire::transport_context())?;
        let resource = |name: &str| object_field(&resources, name).cloned().ok_or_else(|| {
            EngineError::new("REQUEST", Utf16::from(name), "Explicit resource is required")
        });
        let engine = {
            let mut catalog = Context::catalog();
            Engine::new(ResourceSet::new(
                resource("coreSchema")?, resource("referenceSchema")?,
                resource("packageSchema")?, resource("constraints")?,
                resource("domainPolicy")?,
            ), &mut catalog)?
        };
        let mut ctx = Context::ordinary();
        let value = umf_core::selection_host_json::execute(
            source_handle as HostHandle, query_handle as HostHandle,
            has_registry.then_some(registry_handle as HostHandle),
            &mut host, &engine, &mut ctx,
        )?;
        umf_core_wire::encode(&value, &mut ctx)
    })();
    umf_core_wire::result_envelope(result)
}

/// Private R8 carrier probe: return a host-owned invocation result by identity.
#[napi(js_name = "executeCoreOpaqueReturnHostJson")]
pub fn execute_core_opaque_return_host_json(
    env: Env,
    function_handle: u32,
    receiver_handle: u32,
    argument_handle: u32,
    dispatcher: JsFunction,
) -> String {
    let mut host = NodeHostJson { env, dispatcher, string_lengths: BTreeMap::new() };
    let result = (|| -> Result<String, EngineError> {
        let mut ctx = Context::ordinary();
        let value = umf_core::selection_host_json::invoke_opaque_object_return(
            function_handle as HostHandle,
            receiver_handle as HostHandle,
            argument_handle as HostHandle,
            &mut host,
            &mut ctx,
        )?;
        umf_core_wire::encode(&value, &mut ctx)
    })();
    umf_core_wire::result_envelope(result)
}

/// Private staged caller-owned Registry.kindRuntime validation delegation.
#[napi(js_name = "executeCoreKindRuntimeValidationHostJson")]
pub fn execute_core_kind_runtime_validation_host_json(
    env: Env,
    has_registry: bool,
    source_handle: u32,
    registry_handle: u32,
    dispatcher: JsFunction,
) -> String {
    let mut host = NodeHostJson { env, dispatcher, string_lengths: BTreeMap::new() };
    let result = (|| -> Result<String, EngineError> {
        if !has_registry {
            return Err(EngineError::new("HOST_JSON_UNSUPPORTED", Utf16::default(),
                "Caller Registry is required for kindRuntime validation delegation"));
        }
        let mut ctx = Context::ordinary();
        let value = umf_core::selection_host_json::execute_kind_runtime_validate_document(
            source_handle as HostHandle,
            registry_handle as HostHandle,
            &mut host,
            &mut ctx,
        )?;
        umf_core_wire::encode(&value, &mut ctx)
    })();
    umf_core_wire::result_envelope(result)
}

#[napi(js_name = "executeValidateCoreRecordValuesHostJson")]
pub fn execute_validate_core_record_values_host_json(
    env: Env,
    resources_wire: String,
    source_handle: u32,
    identity_handle: u32,
    values_handle: u32,
    dispatcher: JsFunction,
    control_dispatcher: Option<JsFunction>,
) -> String {
    let mut host = NodeHostJson {
        env: env.clone(),
        dispatcher,
        string_lengths: BTreeMap::new(),
    };
    let result = (|| -> Result<String, EngineError> {
        let resources =
            umf_core_wire::decode(&resources_wire, &mut umf_core_wire::transport_context())?;
        let resource = |name: &str| {
            object_field(&resources, name).cloned().ok_or_else(|| {
                EngineError::new(
                    "REQUEST",
                    Utf16::from(name),
                    "Explicit resource is required",
                )
            })
        };
        let engine = {
            let mut catalog = Context::catalog();
            Engine::new(
                ResourceSet::new(
                    resource("coreSchema")?,
                    resource("referenceSchema")?,
                    resource("packageSchema")?,
                    resource("constraints")?,
                    resource("domainPolicy")?,
                ),
                &mut catalog,
            )?
        };
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            let result = record_values::validate_core_record_values_host_json(
                source_handle as HostHandle,
                identity_handle as HostHandle,
                values_handle as HostHandle,
                &mut host,
                &engine,
                &mut ctx,
            )?;
            umf_core_wire::encode(&result, &mut ctx)
        } else {
            let mut ctx = Context::ordinary();
            let result = record_values::validate_core_record_values_host_json(
                source_handle as HostHandle,
                identity_handle as HostHandle,
                values_handle as HostHandle,
                &mut host,
                &engine,
                &mut ctx,
            )?;
            umf_core_wire::encode(&result, &mut ctx)
        }
    })();
    umf_core_wire::result_envelope(result)
}

fn event_json(event: &HostJsonEvent) -> String {
    match event {
        HostJsonEvent::UnicodeCount { value } => format!(
            r#"{{"event":"unicode-count","carrier":{}}}"#,
            rust_value_wire_json(value)
        ),
        HostJsonEvent::GetOpaqueProperty { receiver, key, semantic_catch } => {
            let key = match key {
                HostOpaqueKey::String(units) => format!(
                    r#"{{"kind":"string","units":[{}]}}"#,
                    units.iter().map(u16::to_string).collect::<Vec<_>>().join(",")
                ),
                HostOpaqueKey::IteratorSymbol => r#"{"kind":"iterator-symbol"}"#.to_owned(),
            };
            format!(r#"{{"event":"get-opaque-property","receiver":{},"key":{key},"semanticCatch":{semantic_catch}}}"#, host_invoke_value_wire_json(receiver))
        }
        HostJsonEvent::InvokeOpaque { function, receiver, args, semantic_catch } => {
            let args = args.iter().map(host_invoke_value_wire_json).collect::<Vec<_>>().join(",");
            format!(
                r#"{{"event":"invoke-opaque","function":{function},"receiver":{},"args":[{args}],"semanticCatch":{semantic_catch}}}"#,
                host_invoke_value_wire_json(receiver)
            )
        }
        HostJsonEvent::StringConcat { prefix, value } => format!(
            r#"{{"event":"string-concat","prefix":[{}],"value":{}}}"#,
            prefix.iter().map(u16::to_string).collect::<Vec<_>>().join(","),
            host_invoke_value_wire_json(value),
        ),
        HostJsonEvent::StringifyDiagnosticArray { items } => {
            let items = items.iter().map(|item| match item {
                HostDiagnosticArrayItem::Static(value) => format!(
                    r#"{{"kind":"static","value":{}}}"#,
                    rust_value_wire_json(value),
                ),
                HostDiagnosticArrayItem::Opaque(handle) => {
                    format!(r#"{{"kind":"opaque","handle":{handle}}}"#)
                }
                HostDiagnosticArrayItem::Structure { code, path, message, severity } => format!(
                    r#"{{"kind":"structure","code":{},"path":{},"messageToken":{},"severity":{}}}"#,
                    rust_value_wire_json(&Value::String(code.clone())),
                    rust_value_wire_json(&Value::String(path.clone())),
                    message.token,
                    rust_value_wire_json(&Value::String(severity.clone())),
                ),
            }).collect::<Vec<_>>().join(",");
            format!(r#"{{"event":"stringify-diagnostic-array","items":[{items}]}}"#)
        }
        HostJsonEvent::ConstructErrorCarrier { value } => format!(
            r#"{{"event":"construct-error-carrier","value":{}}}"#,
            host_invoke_value_wire_json(value),
        ),
        HostJsonEvent::CloseOpaqueIterator { iterator } => format!(
            r#"{{"event":"close-opaque-iterator","iterator":{iterator}}}"#,
        ),
        HostJsonEvent::MaterializeSpreadFailure { target } => {
            let target = match target {
                HostSpreadFailureTarget::Nullish(value) => format!(r#"{{"kind":"nullish","value":{}}}"#, host_invoke_value_wire_json(value)),
                HostSpreadFailureTarget::IteratorMethod(value) => format!(r#"{{"kind":"iterator-method","value":{}}}"#, host_invoke_value_wire_json(value)),
            };
            format!(r#"{{"event":"materialize-spread-failure","target":{target}}}"#)
        },
        HostJsonEvent::ReadProperty { handle, key } => {
            let units = key.iter().map(u16::to_string).collect::<Vec<_>>().join(",");
            format!(r#"{{"event":"read-property","handle":{handle},"keyUnits":[{units}]}}"#)
        }
        HostJsonEvent::Classify { handle } => {
            format!(r#"{{"event":"classify","handle":{handle}}}"#)
        }
        HostJsonEvent::GetPrototype { handle } => {
            format!(r#"{{"event":"get-prototype","handle":{handle}}}"#)
        }
        HostJsonEvent::IsArray { handle } => format!(r#"{{"event":"is-array","handle":{handle}}}"#),
        HostJsonEvent::OwnSymbolCount { handle } => {
            format!(r#"{{"event":"own-symbol-count","handle":{handle}}}"#)
        }
        HostJsonEvent::DescriptorSnapshot { handle } => {
            format!(r#"{{"event":"descriptor-snapshot","handle":{handle}}}"#)
        }
        HostJsonEvent::DescriptorAt { token, index } => {
            format!(r#"{{"event":"descriptor-at","token":{token},"index":{index}}}"#)
        }
        HostJsonEvent::ArrayIndexAtOrPastLength { handle, key } => format!(
            r#"{{"event":"array-index-at-or-past-length","handle":{handle},"keyToken":{}}}"#,
            key.token
        ),
        HostJsonEvent::ArrayIsSparseOrExtended { handle } => {
            format!(r#"{{"event":"array-is-sparse-or-extended","handle":{handle}}}"#)
        }
        HostJsonEvent::ReadUtf16Chunk {
            token,
            offset,
            max_units,
        } => format!(
            r#"{{"event":"read-utf16-chunk","token":{token},"offset":{offset},"maxUnits":{max_units}}}"#
        ),
    }
}

fn rust_value_wire_json(value: &Value) -> String {
    let mut output = String::new();
    write_rust_value_wire_json(value, &mut output);
    output
}

fn host_invoke_value_wire_json(value: &HostInvokeValue) -> String {
    match value {
        HostInvokeValue::Undefined => r#"{"kind":"undefined"}"#.to_owned(),
        HostInvokeValue::Opaque(handle) => format!(r#"{{"kind":"opaque","handle":{handle}}}"#),
        HostInvokeValue::Json(value) => format!(
            r#"{{"kind":"json","value":{}}}"#,
            rust_value_wire_json(value)
        ),
        HostInvokeValue::JsonRootOrdinary(value) => format!(
            r#"{{"kind":"json-root-ordinary","value":{}}}"#,
            rust_value_wire_json(value)
        ),
    }
}

fn write_rust_value_wire_json(value: &Value, output: &mut String) {
    match value {
        Value::Null => output.push_str(r#"{"kind":"null"}"#),
        Value::Bool(value) => {
            let _ = write!(output, r#"{{"kind":"boolean","value":{value}}}"#);
        }
        Value::Number(value) => {
            let _ = write!(output, r#"{{"kind":"number","bits":"{:016x}"}}"#, value.to_bits());
        }
        Value::String(value) => {
            output.push_str(r#"{"kind":"string","units":["#);
            write_utf16_units(value.units(), output);
            output.push_str("]}");
        }
        Value::Array(values) => {
            output.push_str(r#"{"kind":"array","items":["#);
            for (index, item) in values.iter().enumerate() {
                if index != 0 { output.push(','); }
                write_rust_value_wire_json(item, output);
            }
            output.push_str("]}");
        }
        Value::Object(members) => {
            output.push_str(r#"{"kind":"object","members":["#);
            for (index, (key, value)) in members.iter().enumerate() {
                if index != 0 { output.push(','); }
                output.push_str(r#"{"key":["#);
                write_utf16_units(key.units(), output);
                output.push_str("],\"value\":");
                write_rust_value_wire_json(value, output);
                output.push('}');
            }
            output.push_str("]}");
        }
    }
}

fn write_utf16_units(units: &[u16], output: &mut String) {
    for (index, unit) in units.iter().enumerate() {
        if index != 0 { output.push(','); }
        let _ = write!(output, "{unit}");
    }
}

fn decode_reply(
    event: &HostJsonEvent,
    value: Value,
    string_lengths: &mut BTreeMap<u64, usize>,
) -> Result<HostJsonReply, EngineError> {
    let kind = text_field(&value, "kind").ok_or_else(protocol_error)?;
    let kind_is_valid_for_event = match event {
        HostJsonEvent::Classify { .. } | HostJsonEvent::ReadProperty { .. } => matches!(
            kind.as_str(),
            "null" | "boolean" | "number" | "string" | "object" | "unsupported" | "host-exception"
        ),
        HostJsonEvent::GetPrototype { .. } => {
            matches!(kind.as_str(), "prototype" | "host-exception")
        }
        HostJsonEvent::IsArray { .. }
        | HostJsonEvent::ArrayIndexAtOrPastLength { .. }
        | HostJsonEvent::ArrayIsSparseOrExtended { .. } => {
            matches!(kind.as_str(), "boolean" | "host-exception")
        }
        HostJsonEvent::OwnSymbolCount { .. } => matches!(kind.as_str(), "count" | "host-exception"),
        HostJsonEvent::DescriptorSnapshot { .. } => {
            matches!(kind.as_str(), "snapshot" | "host-exception")
        }
        HostJsonEvent::DescriptorAt { .. } => {
            matches!(kind.as_str(), "descriptor" | "host-exception")
        }
        HostJsonEvent::ReadUtf16Chunk { .. } => {
            matches!(kind.as_str(), "utf16-chunk" | "host-exception")
        }
        HostJsonEvent::UnicodeCount { .. } => matches!(kind.as_str(), "count" | "host-exception"),
        HostJsonEvent::GetOpaqueProperty { semantic_catch, .. } => {
            matches!(kind.as_str(), "opaque-value" | "host-exception")
                || (*semantic_catch && kind == "semantic-throw")
        }
        HostJsonEvent::InvokeOpaque { semantic_catch, .. } => {
            matches!(kind.as_str(), "invocation" | "host-exception")
                || (*semantic_catch && kind == "semantic-throw")
        }
        HostJsonEvent::StringConcat { .. }
        | HostJsonEvent::StringifyDiagnosticArray { .. }
        | HostJsonEvent::ConstructErrorCarrier { .. } => matches!(kind.as_str(), "opaque-value" | "host-exception"),
        HostJsonEvent::CloseOpaqueIterator { .. } => kind == "iterator-closed",
        HostJsonEvent::MaterializeSpreadFailure { .. } => kind == "spread-failure",
    };
    if !kind_is_valid_for_event {
        return Err(protocol_error());
    }
    Ok(match kind.as_str() {
        "host-exception" => {
            return Err(EngineError::new(
                "HOST_JSON_CALLBACK",
                Utf16::default(),
                "Host reflection threw",
            ))
        }
        "iterator-closed" => HostJsonReply::IteratorClosed,
        "spread-failure" => HostJsonReply::SpreadFailure(string_ref(object_field(&value, "message").ok_or_else(protocol_error)?, string_lengths)?),
        "opaque-value" => HostJsonReply::OpaqueValue(decode_opaque_value(
            object_field(&value, "value").ok_or_else(protocol_error)?,
            string_lengths,
        )?),
        "invocation" => HostJsonReply::Invocation(decode_opaque_value(
            object_field(&value, "value").ok_or_else(protocol_error)?,
            string_lengths,
        )?),
        "semantic-throw" => HostJsonReply::SemanticThrow(string_ref(
            object_field(&value, "message").ok_or_else(protocol_error)?,
            string_lengths,
        )?),
        "null" => HostJsonReply::Kind(HostJsonKind::Null),
        "boolean" => {
            let boolean = bool_field(&value, "value").ok_or_else(protocol_error)?;
            if matches!(
                event,
                HostJsonEvent::Classify { .. } | HostJsonEvent::ReadProperty { .. }
            ) {
                HostJsonReply::Kind(HostJsonKind::Boolean(boolean))
            } else {
                HostJsonReply::Boolean(boolean)
            }
        }
        "number" => HostJsonReply::Kind(HostJsonKind::Number(
            number_field(&value, "bits").ok_or_else(protocol_error)?,
        )),
        "string" => HostJsonReply::Kind(HostJsonKind::String(string_ref(&value, string_lengths)?)),
        "object" => HostJsonReply::Kind(HostJsonKind::Object(
            unsigned_field(&value, "handle").ok_or_else(protocol_error)?,
        )),
        "unsupported" => HostJsonReply::Kind(HostJsonKind::Unsupported(unsupported_type(&value)?)),
        "prototype" => HostJsonReply::Prototype(match text_field(&value, "value").as_deref() {
            Some("ordinary") => HostPrototype::OrdinaryObject,
            Some("null") => HostPrototype::Null,
            Some("array") => HostPrototype::Array,
            Some("other") => HostPrototype::Other,
            _ => return Err(protocol_error()),
        }),
        "count" => HostJsonReply::Count(
            unsigned_field(&value, "value").ok_or_else(protocol_error)? as usize,
        ),
        "snapshot" => HostJsonReply::Snapshot(HostDescriptorSnapshot {
            token: unsigned_field(&value, "token").ok_or_else(protocol_error)?,
            count: unsigned_field(&value, "count").ok_or_else(protocol_error)? as usize,
        }),
        "descriptor" => {
            let key = string_ref(
                object_field(&value, "key").ok_or_else(protocol_error)?,
                string_lengths,
            )?;
            let enumerable = bool_field(&value, "enumerable").ok_or_else(protocol_error)?;
            let is_data = bool_field(&value, "isData").ok_or_else(protocol_error)?;
            let has_value = bool_field(&value, "hasValue").ok_or_else(protocol_error)?;
            let child = if has_value {
                Some(descriptor_value(
                    object_field(&value, "value").ok_or_else(protocol_error)?,
                    string_lengths,
                )?)
            } else {
                None
            };
            HostJsonReply::Descriptor(HostPropertyDescriptor {
                key,
                enumerable,
                is_data,
                value: child,
            })
        }
        "utf16-chunk" => {
            let offset = unsigned_field(&value, "offset").ok_or_else(protocol_error)? as usize;
            let Value::Array(items) = object_field(&value, "units").ok_or_else(protocol_error)?
            else {
                return Err(protocol_error());
            };
            let HostJsonEvent::ReadUtf16Chunk {
                token,
                offset: requested_offset,
                max_units,
            } = event
            else {
                unreachable!()
            };
            if *max_units != 8192 || offset != *requested_offset {
                return Err(protocol_error());
            }
            let length = *string_lengths.get(token).ok_or_else(protocol_error)?;
            if *requested_offset > length {
                return Err(protocol_error());
            }
            let expected = (length - requested_offset).min(*max_units);
            if items.len() != expected {
                return Err(protocol_error());
            }
            let mut units = Vec::with_capacity(expected);
            for item in items {
                let Value::Number(number) = item else {
                    return Err(protocol_error());
                };
                if !number.is_finite() || number.fract() != 0.0 || !(0.0..=65535.0).contains(number)
                {
                    return Err(protocol_error());
                }
                units.push(*number as u16);
            }
            HostJsonReply::Utf16Chunk { offset, units }
        }
        _ => return Err(protocol_error()),
    })
}

fn decode_opaque_value(
    value: &Value,
    string_lengths: &mut BTreeMap<u64, usize>,
) -> Result<HostOpaqueValue, EngineError> {
    match text_field(value, "kind").as_deref() {
        Some("undefined") => Ok(HostOpaqueValue::Undefined),
        Some("null") => Ok(HostOpaqueValue::Null),
        Some("boolean") => Ok(HostOpaqueValue::Boolean(
            bool_field(value, "value").ok_or_else(protocol_error)?,
        )),
        Some("number") => Ok(HostOpaqueValue::Number(
            number_field(value, "bits").ok_or_else(protocol_error)?,
        )),
        Some("string") => Ok(HostOpaqueValue::String(string_ref(value, string_lengths)?)),
        Some("opaque") => Ok(HostOpaqueValue::Opaque {
            handle: unsigned_field(value, "handle").ok_or_else(protocol_error)?,
            opaque_type: match text_field(value, "opaqueType").as_deref() {
                Some("object") => umf_core::host_json::HostOpaqueType::Object,
                Some("function") => umf_core::host_json::HostOpaqueType::Function,
                Some("symbol") => umf_core::host_json::HostOpaqueType::Symbol,
                _ => return Err(protocol_error()),
            },
        }),
        Some("bigint") => Ok(HostOpaqueValue::BigInt {
            handle: unsigned_field(value, "handle").ok_or_else(protocol_error)?,
            is_zero: bool_field(value, "isZero").ok_or_else(protocol_error)?,
        }),
        _ => Err(protocol_error()),
    }
}

fn descriptor_value(
    value: &Value,
    string_lengths: &mut BTreeMap<u64, usize>,
) -> Result<HostDescriptorValue, EngineError> {
    let kind = text_field(value, "kind").ok_or_else(protocol_error)?;
    Ok(match kind.as_str() {
        "null" => HostDescriptorValue::Null,
        "boolean" => {
            HostDescriptorValue::Boolean(bool_field(value, "value").ok_or_else(protocol_error)?)
        }
        "number" => {
            HostDescriptorValue::Number(number_field(value, "bits").ok_or_else(protocol_error)?)
        }
        "string" => HostDescriptorValue::String(string_ref(value, string_lengths)?),
        "object" => {
            HostDescriptorValue::Object(unsigned_field(value, "handle").ok_or_else(protocol_error)?)
        }
        "unsupported" => HostDescriptorValue::Unsupported(unsupported_type(value)?),
        _ => return Err(protocol_error()),
    })
}

fn string_ref(
    value: &Value,
    string_lengths: &mut BTreeMap<u64, usize>,
) -> Result<HostStringRef, EngineError> {
    let token = unsigned_field(value, "token").ok_or_else(protocol_error)?;
    let units = unsigned_field(value, "units").ok_or_else(protocol_error)? as usize;
    if string_lengths
        .insert(token, units)
        .is_some_and(|previous| previous != units)
    {
        return Err(protocol_error());
    }
    Ok(HostStringRef { token, units })
}
fn unsupported_type(value: &Value) -> Result<&'static str, EngineError> {
    match text_field(value, "value").as_deref() {
        Some("undefined") => Ok("undefined"),
        Some("function") => Ok("function"),
        Some("symbol") => Ok("symbol"),
        Some("bigint") => Ok("bigint"),
        _ => Err(protocol_error()),
    }
}
fn number_field(value: &Value, key: &str) -> Option<f64> {
    let bits = text_field(value, key)?;
    if bits.len() != 16 {
        return None;
    }
    u64::from_str_radix(&bits, 16).ok().map(f64::from_bits)
}
fn unsigned_field(value: &Value, key: &str) -> Option<u64> {
    let Value::Number(number) = object_field(value, key)? else {
        return None;
    };
    if !number.is_finite()
        || *number < 0.0
        || number.fract() != 0.0
        || *number > 9_007_199_254_740_991.0
    {
        return None;
    }
    Some(*number as u64)
}
fn bool_field(value: &Value, key: &str) -> Option<bool> {
    match object_field(value, key)? {
        Value::Bool(value) => Some(*value),
        _ => None,
    }
}
fn text_field(value: &Value, key: &str) -> Option<String> {
    match object_field(value, key)? {
        Value::String(value) => value.to_utf8().ok(),
        _ => None,
    }
}
fn object_field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn take_core_resource(value: &mut Value, key: &str) -> Result<Value, EngineError> {
    let Value::Object(fields) = value else {
        return Err(EngineError::new(
            "REQUEST",
            Utf16::from(key),
            "Explicit resource is required",
        ));
    };
    let index = fields
        .iter()
        .position(|(name, _)| name == &Utf16::from(key))
        .ok_or_else(|| {
            EngineError::new("REQUEST", Utf16::from(key), "Explicit resource is required")
        })?;
    Ok(fields.swap_remove(index).1)
}
fn protocol_error() -> EngineError {
    EngineError::new(
        "HOST_JSON_PROTOCOL",
        Utf16::default(),
        "Malformed umf.host-json/1 response",
    )
}
fn bridge_error() -> EngineError {
    EngineError::new(
        "HOST_JSON_BRIDGE",
        Utf16::default(),
        "Node host-json dispatcher bridge failed",
    )
}

/// Retained immutable engine and Dataset schemas for the host-admission facade.
#[napi]
pub struct CoreDatasetValuesRuntime {
    engine: Engine,
    validator: umf_core::dataset_values::CoreDatasetValueValidator,
}

#[napi]
impl CoreDatasetValuesRuntime {
    #[napi(constructor)]
    pub fn new(
        env: Env,
        resources_wire: String,
        control_dispatcher: Option<JsFunction>,
    ) -> napi::Result<Self> {
        let build = |ctx: &mut Context<'_>| -> Result<
            (Engine, umf_core::dataset_values::CoreDatasetValueValidator),
            EngineError,
        > {
            let mut resources =
                ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(&resources_wire, ctx))?;
            let engine = ctx.with_catalog_value_limit(|catalog| {
                Engine::new(
                    ResourceSet::new(
                        take_dataset_resource(&mut resources, "coreSchema")?,
                        take_dataset_resource(&mut resources, "referenceSchema")?,
                        take_dataset_resource(&mut resources, "packageSchema")?,
                        take_dataset_resource(&mut resources, "constraints")?,
                        take_dataset_resource(&mut resources, "domainPolicy")?,
                    ),
                    catalog,
                )
            })?;
            let validator = ctx.with_catalog_value_limit(|catalog| {
                umf_core::dataset_values::CoreDatasetValueValidator::new(&engine, catalog)
            })?;
            Ok((engine, validator))
        };
        let result = if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            build(&mut ctx)
        } else {
            build(&mut Context::ordinary())
        };
        result
            .map(|(engine, validator)| Self { engine, validator })
            .map_err(|error| napi::Error::from_reason(umf_core_wire::error_envelope(error)))
    }

    #[napi]
    pub fn execute(
        &self,
        env: Env,
        operation_name: String,
        source_handle: u32,
        input_handle: u32,
        expected_handle: u32,
        dispatcher: JsFunction,
        control_dispatcher: Option<JsFunction>,
    ) -> String {
        use umf_core::core_dataset_values_host_json::CoreDatasetValuesHostOperation as Op;
        let operation = match operation_name.as_str() {
            "validateCoreDatasetValues" => Ok(Op::Validate),
            "verifyCoreDatasetValues" => Ok(Op::Verify),
            _ => Err(EngineError::new(
                "REQUEST",
                Utf16::default(),
                "Unknown Dataset values host operation",
            )),
        };
        let handles = [source_handle, input_handle, expected_handle].map(HostHandle::from);
        let mut host = NodeHostJson {
            env: env.clone(),
            dispatcher,
            string_lengths: BTreeMap::new(),
        };
        let execute =
            |ctx: &mut Context<'_>, host: &mut NodeHostJson| -> Result<String, EngineError> {
                let value = umf_core::core_dataset_values_host_json::execute(
                    operation?,
                    &handles,
                    host,
                    &self.validator,
                    &self.engine,
                    ctx,
                )?;
                umf_core_wire::encode(&value, ctx)
            };
        let result = if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            execute(&mut ctx, &mut host)
        } else {
            execute(&mut Context::ordinary(), &mut host)
        };
        umf_core_wire::result_envelope(result)
    }
}

fn take_dataset_resource(resources: &mut Value, name: &str) -> Result<Value, EngineError> {
    let Value::Object(members) = resources else {
        return Err(EngineError::new(
            "REQUEST",
            Utf16::from(name),
            "Explicit resource is required",
        ));
    };
    let Some(index) = members
        .iter()
        .position(|(key, _)| key == &Utf16::from(name))
    else {
        return Err(EngineError::new(
            "REQUEST",
            Utf16::from(name),
            "Explicit resource is required",
        ));
    };
    Ok(members.remove(index).1)
}

#[cfg(test)]
mod opaque_reply_tests {
    use super::*;

    fn opaque_reply(opaque_type: Option<&str>) -> Value {
        let mut members = vec![
            (Utf16::from("kind"), Value::String(Utf16::from("opaque"))),
            (Utf16::from("handle"), Value::Number(1.0)),
        ];
        if let Some(opaque_type) = opaque_type {
            members.push((Utf16::from("opaqueType"), Value::String(Utf16::from(opaque_type))));
        }
        Value::Object(members)
    }

    #[test]
    fn opaque_reply_type_is_required_and_closed() {
        for (tag, expected) in [
            ("object", umf_core::host_json::HostOpaqueType::Object),
            ("function", umf_core::host_json::HostOpaqueType::Function),
            ("symbol", umf_core::host_json::HostOpaqueType::Symbol),
        ] {
            assert_eq!(
                decode_opaque_value(&opaque_reply(Some(tag)), &mut BTreeMap::new()).unwrap(),
                HostOpaqueValue::Opaque { handle: 1, opaque_type: expected },
            );
        }
        assert!(decode_opaque_value(&opaque_reply(None), &mut BTreeMap::new()).is_err());
        assert!(decode_opaque_value(&opaque_reply(Some("unknown")), &mut BTreeMap::new()).is_err());
    }

    #[test]
    fn string_concat_event_codec_is_closed_and_utf16_tagged() {
        assert_eq!(
            event_json(&HostJsonEvent::StringConcat {
                prefix: "/💾".encode_utf16().collect(),
                value: HostInvokeValue::Opaque(9),
            }),
            r#"{"event":"string-concat","prefix":[47,55357,56510],"value":{"kind":"opaque","handle":9}}"#,
        );
    }

    #[test]
    fn stringify_diagnostic_array_event_preserves_mixed_item_order() {
        let event = HostJsonEvent::StringifyDiagnosticArray {
            items: vec![
                HostDiagnosticArrayItem::Static(Value::Object(vec![
                    (Utf16::from("code"), Value::String(Utf16::from("STATIC"))),
                    (Utf16::from("severity"), Value::String(Utf16::from("warning"))),
                ])),
                HostDiagnosticArrayItem::Opaque(77),
            ],
        };
        assert_eq!(
            event_json(&event),
            r#"{"event":"stringify-diagnostic-array","items":[{"kind":"static","value":{"kind":"object","members":[{"key":[99,111,100,101],"value":{"kind":"string","units":[83,84,65,84,73,67]}},{"key":[115,101,118,101,114,105,116,121],"value":{"kind":"string","units":[119,97,114,110,105,110,103]}}]}},{"kind":"opaque","handle":77}]}"#,
        );
        assert_eq!(
            event_json(&HostJsonEvent::StringifyDiagnosticArray {
                items: vec![HostDiagnosticArrayItem::Structure {
                    code: Utf16::from("CODE"),
                    path: Utf16::from("/x"),
                    message: HostStringRef { token: 19, units: 5 },
                    severity: Utf16::from("error"),
                }],
            }),
            r#"{"event":"stringify-diagnostic-array","items":[{"kind":"structure","code":{"kind":"string","units":[67,79,68,69]},"path":{"kind":"string","units":[47,120]},"messageToken":19,"severity":{"kind":"string","units":[101,114,114,111,114]}}]}"#,
        );
        assert_eq!(
            event_json(&HostJsonEvent::ConstructErrorCarrier {
                value: HostInvokeValue::Opaque(91),
            }),
            r#"{"event":"construct-error-carrier","value":{"kind":"opaque","handle":91}}"#,
        );
    }

    #[test]
    fn native_spread_failure_codec_preserves_target_kind() {
        let nullish = HostJsonEvent::MaterializeSpreadFailure { target: HostSpreadFailureTarget::Nullish(HostInvokeValue::Undefined) };
        assert_eq!(event_json(&nullish), r#"{"event":"materialize-spread-failure","target":{"kind":"nullish","value":{"kind":"undefined"}}}"#);
        let method = HostJsonEvent::MaterializeSpreadFailure { target: HostSpreadFailureTarget::IteratorMethod(HostInvokeValue::Json(Value::Bool(false))) };
        assert_eq!(event_json(&method), r#"{"event":"materialize-spread-failure","target":{"kind":"iterator-method","value":{"kind":"json","value":{"kind":"boolean","value":false}}}}"#);
        let reply = Value::Object(vec![(Utf16::from("kind"), Value::String(Utf16::from("spread-failure"))), (Utf16::from("message"), Value::Object(vec![(Utf16::from("token"), Value::Number(1.0)), (Utf16::from("units"), Value::Number(4.0))]))]);
        assert!(decode_reply(&nullish, reply, &mut BTreeMap::new()).is_ok());
        let malformed = Value::Object(vec![(Utf16::from("kind"), Value::String(Utf16::from("iterator-closed")))]);
        assert!(decode_reply(&nullish, malformed, &mut BTreeMap::new()).is_err());
    }

    #[test]
    fn iterator_close_event_codec_is_closed() {
        let event = HostJsonEvent::CloseOpaqueIterator { iterator: 23 };
        assert_eq!(event_json(&event), r#"{"event":"close-opaque-iterator","iterator":23}"#);
        let reply = Value::Object(vec![(Utf16::from("kind"), Value::String(Utf16::from("iterator-closed")))]);
        assert_eq!(decode_reply(&event, reply, &mut BTreeMap::new()).unwrap(), HostJsonReply::IteratorClosed);
        let malformed = Value::Object(vec![(Utf16::from("kind"), Value::String(Utf16::from("opaque-value")))]);
        assert!(decode_reply(&event, malformed, &mut BTreeMap::new()).is_err());
    }

    #[test]
    fn semantic_throw_reply_is_rejected_when_catch_is_disabled() {
        let reply = Value::Object(vec![(Utf16::from("kind"), Value::String(Utf16::from("semantic-throw")))]);
        let get_event = HostJsonEvent::GetOpaqueProperty {
            receiver: HostInvokeValue::Undefined,
            key: HostOpaqueKey::IteratorSymbol,
            semantic_catch: false,
        };
        assert!(decode_reply(&get_event, reply.clone(), &mut BTreeMap::new()).is_err());
        let invoke_event = HostJsonEvent::InvokeOpaque {
            function: 1,
            receiver: HostInvokeValue::Undefined,
            args: Vec::new(),
            semantic_catch: false,
        };
        assert!(decode_reply(&invoke_event, reply, &mut BTreeMap::new()).is_err());
    }
}

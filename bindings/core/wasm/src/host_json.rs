// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private `umf.host-json/1` WASM adapter for logical record values.
use crate::core_key_verification::PreparedCoreKeyVerificationHandle;
use js_sys::{Error, Function};
use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::sync::Arc;
use umf_core::{
    cardinality_host_json,
    context::Context,
    host_json::{
        HostDescriptorSnapshot, HostDescriptorValue, HostDiagnosticArrayItem, HostHandle,
        HostInvokeValue, HostJsonEvent, HostJsonKind, HostJsonReflection, HostJsonReply,
        HostOpaqueKey, HostOpaqueValue, HostPropertyDescriptor, HostPrototype,
        HostSpreadFailureTarget, HostStringRef,
    },
    record_values, Engine, EngineError, ResourceSet, Utf16, Value,
};
use umf_core_wire::core_key_verification_binding::CoreKeyVerificationRuntime;
use wasm_bindgen::prelude::*;

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
        "getSemanticTypes" => Ok(Op::GetSemanticTypes),
        "setSemanticTypes" => Ok(Op::SetSemanticTypes),
        _ => Err(EngineError::new(
            "REQUEST",
            Utf16::default(),
            "Unknown kind/nullability host operation",
        )),
    }
}

/// Retained immutable resources/engine for one Core kind/nullability factory.
/// Construction admits resources once; each method gets a fresh operation Context.
#[wasm_bindgen]
pub struct CoreKindNullabilityRuntime {
    engine: Arc<Engine>,
    key_verification: CoreKeyVerificationRuntime,
    kind_schemas: umf_core::core_kind::OperationSchemas,
    nullability_schemas: umf_core::nullability::OperationSchemas,
}

#[wasm_bindgen]
impl CoreKindNullabilityRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(
        resources_wire: &str,
        control_dispatcher: Option<Function>,
    ) -> Result<CoreKindNullabilityRuntime, JsValue> {
        let result = if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            let resources =
                ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(resources_wire, ctx));
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
                let nullability_schemas =
                    umf_core::nullability::prepare_operation_schemas(&mut ctx)?;
                let registry = ctx.with_catalog_value_limit(|catalog| engine.registry(catalog))?;
                Ok((
                    Arc::new(engine),
                    registry,
                    kind_schemas,
                    nullability_schemas,
                ))
            })
        } else {
            let mut ctx = Context::ordinary();
            let resources =
                ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(resources_wire, ctx));
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
                let nullability_schemas =
                    umf_core::nullability::prepare_operation_schemas(&mut ctx)?;
                let registry = ctx.with_catalog_value_limit(|catalog| engine.registry(catalog))?;
                Ok((
                    Arc::new(engine),
                    registry,
                    kind_schemas,
                    nullability_schemas,
                ))
            })
        };
        result
            .map(
                |(engine, registry, kind_schemas, nullability_schemas)| Self {
                    key_verification: CoreKeyVerificationRuntime::from_shared(
                        engine.clone(),
                        Arc::new(registry),
                    ),
                    engine,
                    kind_schemas,
                    nullability_schemas,
                },
            )
            .map_err(|error| Error::new(&umf_core_wire::error_envelope(error)).into())
    }

    /// Stage receipt-first Core Key verification on this runtime's retained Engine.
    #[wasm_bindgen(js_name = prepareVerification)]
    pub fn prepare_verification(
        &self,
        receipt_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<PreparedCoreKeyVerificationHandle, JsValue> {
        let mut usage = umf_core::context::TransportUsage::default();
        let result = if let Some(dispatcher) = dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            usage.seed(&mut ctx);
            let result = (|| {
                let receipt = ctx
                    .with_tagged_transport_limit(|ctx| umf_core_wire::decode(receipt_wire, ctx))?;
                self.key_verification.prepare(&receipt, &mut ctx)
            })();
            usage.capture(&ctx);
            result
        } else {
            let mut ctx = Context::ordinary();
            usage.seed(&mut ctx);
            let result = (|| {
                let receipt = ctx
                    .with_tagged_transport_limit(|ctx| umf_core_wire::decode(receipt_wire, ctx))?;
                self.key_verification.prepare(&receipt, &mut ctx)
            })();
            usage.capture(&ctx);
            result
        };
        result
            .map(|inner| PreparedCoreKeyVerificationHandle {
                inner: Some(inner),
                usage: Some(usage),
            })
            .map_err(|error| Error::new(&umf_core_wire::error_envelope(error)).into())
    }

    /// Finish the one-use stage; consume it before decoding current as before.
    #[wasm_bindgen(js_name = finishVerification)]
    pub fn finish_verification(
        &self,
        handle: &mut PreparedCoreKeyVerificationHandle,
        current_wire: &str,
        dispatcher: Option<Function>,
    ) -> Result<String, JsValue> {
        let (Some(stage), Some(mut usage)) = (handle.inner.take(), handle.usage.take()) else {
            return Err(Error::new(&umf_core_wire::error_envelope(EngineError::new(
                "CORE_KEY_STAGE",
                Utf16::default(),
                "Prepared verification stage was already consumed",
            )))
            .into());
        };
        let result = if let Some(dispatcher) = dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            usage.seed(&mut ctx);
            let result = (|| {
                let current = ctx
                    .with_tagged_transport_limit(|ctx| umf_core_wire::decode(current_wire, ctx))?;
                let verified = self.key_verification.finish(stage, &current, &mut ctx);
                let encoded = verified.and_then(|value| {
                    ctx.with_tagged_transport_limit(|ctx| umf_core_wire::encode(&value, ctx))
                });
                Ok::<_, EngineError>(umf_core_wire::result_envelope(encoded))
            })();
            usage.capture(&ctx);
            result
        } else {
            let mut ctx = Context::ordinary();
            usage.seed(&mut ctx);
            let result = (|| {
                let current = ctx
                    .with_tagged_transport_limit(|ctx| umf_core_wire::decode(current_wire, ctx))?;
                let verified = self.key_verification.finish(stage, &current, &mut ctx);
                let encoded = verified.and_then(|value| {
                    ctx.with_tagged_transport_limit(|ctx| umf_core_wire::encode(&value, ctx))
                });
                Ok::<_, EngineError>(umf_core_wire::result_envelope(encoded))
            })();
            usage.capture(&ctx);
            result
        };
        result.map_err(|error| Error::new(&umf_core_wire::error_envelope(error)).into())
    }

    #[wasm_bindgen(js_name = discardVerification)]
    pub fn discard_verification(
        &self,
        handle: &mut PreparedCoreKeyVerificationHandle,
    ) -> Result<(), JsValue> {
        let (Some(stage), Some(_usage)) = (handle.inner.take(), handle.usage.take()) else {
            return Err(Error::new(&umf_core_wire::error_envelope(EngineError::new(
                "CORE_KEY_STAGE",
                Utf16::default(),
                "Prepared verification stage was already consumed",
            )))
            .into());
        };
        self.key_verification
            .discard(stage)
            .map_err(|error| Error::new(&umf_core_wire::error_envelope(error)).into())
    }

    #[wasm_bindgen(js_name = executeModelRequestWire)]
    pub fn execute_model_request_wire(
        &self,
        wire_json: &str,
        profile: &str,
        dispatcher: Function,
        control_dispatcher: Option<Function>,
    ) -> String {
        let profile = match profile {
            "cooperative" => umf_core::ResourceProfile::Cooperative,
            "hard-isolated" => umf_core::ResourceProfile::HardIsolated,
            _ => {
                return umf_core_wire::error_envelope(EngineError::new(
                    "RESOURCE_PROFILE",
                    Utf16::default(),
                    "Unknown resource profile",
                ))
            }
        };
        let mut capabilities = super::WasmCapabilities { dispatcher };
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            umf_core_wire::execute_request_with_engine_and_control(
                wire_json,
                profile,
                &mut capabilities,
                &mut hook,
                Some(&self.engine),
            )
        } else {
            let mut hook = |_amount| Ok(());
            umf_core_wire::execute_request_with_engine_and_control(
                wire_json,
                profile,
                &mut capabilities,
                &mut hook,
                Some(&self.engine),
            )
        }
    }

    #[wasm_bindgen(js_name = execute)]
    pub fn execute_js(
        &self,
        operation: &str,
        first: u32,
        second: u32,
        third: u32,
        fourth: u32,
        dispatcher: &Function,
        control_dispatcher: Option<Function>,
    ) -> String {
        let operation = match kind_nullability_operation(operation) {
            Ok(operation) => operation,
            Err(error) => return umf_core_wire::result_envelope(Err(error)),
        };
        let handles: Vec<_> = [first, second, third, fourth]
            .into_iter()
            .filter(|handle| *handle != 0)
            .map(|handle| handle as HostHandle)
            .collect();
        let mut host = WasmHostJson {
            dispatcher: dispatcher.clone(),
            string_lengths: BTreeMap::new(),
        };
        let result = if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            umf_core::core_kind_nullability_host_json::execute(
                operation,
                &handles,
                &mut host,
                &self.engine,
                &self.kind_schemas,
                &self.nullability_schemas,
                &mut ctx,
            )
            .and_then(|value| umf_core_wire::encode(&value, &mut ctx))
        } else {
            let mut ctx = Context::ordinary();
            umf_core::core_kind_nullability_host_json::execute(
                operation,
                &handles,
                &mut host,
                &self.engine,
                &self.kind_schemas,
                &self.nullability_schemas,
                &mut ctx,
            )
            .and_then(|value| umf_core_wire::encode(&value, &mut ctx))
        };
        umf_core_wire::result_envelope(result)
    }
}

#[wasm_bindgen(js_name = executeCoreKindNullabilityHostJson)]
pub fn execute_core_kind_nullability_host_json(
    resources_wire: &str,
    operation: &str,
    first: u32,
    second: u32,
    third: u32,
    fourth: u32,
    dispatcher: &Function,
    control_dispatcher: Option<Function>,
) -> String {
    let result = (|| -> Result<String, EngineError> {
        let operation = kind_nullability_operation(operation)?;
        let handles: Vec<_> = [first, second, third, fourth]
            .into_iter()
            .filter(|handle| *handle != 0)
            .map(|handle| handle as HostHandle)
            .collect();
        let mut host = WasmHostJson {
            dispatcher: dispatcher.clone(),
            string_lengths: BTreeMap::new(),
        };
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            let resources =
                ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(resources_wire, ctx))?;
            let resource = |name: &str| {
                field(&resources, name).cloned().ok_or_else(|| {
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
                ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(resources_wire, ctx))?;
            let resource = |name: &str| {
                field(&resources, name).cloned().ok_or_else(|| {
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

struct WasmHostJson {
    dispatcher: Function,
    string_lengths: BTreeMap<u64, usize>,
}

/// Reuse the invocation-local opaque reflection adapter for source import.
pub(super) fn protobuf_source_host(dispatcher: &Function) -> impl HostJsonReflection {
    WasmHostJson {
        dispatcher: dispatcher.clone(),
        string_lengths: BTreeMap::new(),
    }
}

impl HostJsonReflection for WasmHostJson {
    fn reflect(&mut self, event: HostJsonEvent) -> Result<HostJsonReply, EngineError> {
        let wire = self
            .dispatcher
            .call1(&JsValue::NULL, &JsValue::from_str(&event_json(&event)))
            .map_err(|_| bridge_error())?
            .as_string()
            .ok_or_else(bridge_error)?;
        if matches!(event, HostJsonEvent::ReadUtf16Chunk { .. }) && wire.len() > 600 * 1024 {
            return Err(protocol_error());
        }
        let is_text_chunk = matches!(event, HostJsonEvent::ReadUtf16Chunk { .. })
            && wire.starts_with(r#"{"kind":"utf16-text-chunk""#);
        if is_text_chunk && wire.len() > 52 * 1024 {
            return Err(protocol_error());
        }
        let value = if is_text_chunk {
            umf_core::serialization::read_json_value(
                &wire.encode_utf16().collect::<Vec<_>>(),
                umf_core::serialization::Format::Json,
                &mut Context::ordinary(),
            )
            .map_err(|_| protocol_error())?
        } else {
            umf_core_wire::decode(&wire, &mut umf_core_wire::transport_context())
                .map_err(|_| protocol_error())?
        };
        decode_reply(&event, value, &mut self.string_lengths)
    }
    fn release_descriptor_snapshot(&mut self, _token: u64) {}
}

/// Opt-in general JSON admission over opaque host handles. Reflection order,
/// cycles, limits and the copied value are owned by the shared Rust core.
#[wasm_bindgen(js_name = executeCopyJsonHostJson)]
pub fn execute_copy_json_host_json(
    value_handle: u32,
    dispatcher: &Function,
    control_dispatcher: Option<Function>,
) -> String {
    let mut perform = |ctx: &mut Context<'_>| -> Result<String, EngineError> {
        let mut host = WasmHostJson {
            dispatcher: dispatcher.clone(),
            string_lengths: BTreeMap::new(),
        };
        let copied = umf_core::host_json::copy_host_json_with_sparse_holes(
            value_handle as HostHandle,
            &mut host,
            ctx,
        )?;
        let holes = copied
            .sparse_arrays
            .into_iter()
            .map(|sparse| {
                umf_core::Value::Object(vec![
                    (
                        umf_core::Utf16::from("path"),
                        umf_core::Value::String(sparse.path),
                    ),
                    (
                        umf_core::Utf16::from("holes"),
                        umf_core::Value::Array(
                            sparse
                                .holes
                                .into_iter()
                                .map(|index| umf_core::Value::Number(index as f64))
                                .collect(),
                        ),
                    ),
                ])
            })
            .collect();
        let value_wire = umf_core_wire::encode(&copied.value, ctx)?;
        let holes_wire =
            umf_core_wire::encode(&umf_core::Value::Array(holes), ctx)?;
        Ok(format!(
            r#"{{"kind":"object","members":[{{"key":[95,95,117,109,102,95,99,111,112,121,95,106,115,111,110,95,104,111,115,116,95,105,110,112,117,116,95,118,49],"value":{{"kind":"boolean","value":true}}}},{{"key":[118,97,108,117,101],"value":{value_wire}}},{{"key":[115,112,97,114,115,101,65,114,114,97,121,115],"value":{holes_wire}}}]}}"#
        ))
    };
    let result = if let Some(dispatcher) = control_dispatcher {
        let mut control = super::WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        let mut ctx = Context::ordinary().with_host_control(&mut hook);
        perform(&mut ctx)
    } else {
        perform(&mut Context::ordinary())
    };
    umf_core_wire::result_envelope(result)
}

#[wasm_bindgen(js_name = executeValidateCoreRecordValuesHostJson)]
pub fn execute_validate_core_record_values_host_json(
    resources_wire: &str,
    source: u32,
    identity: u32,
    values: u32,
    dispatcher: &Function,
    control_dispatcher: Option<Function>,
) -> String {
    let result = (|| -> Result<String, EngineError> {
        let resources =
            umf_core_wire::decode(resources_wire, &mut umf_core_wire::transport_context())?;
        let resource = |name: &str| {
            field(&resources, name).cloned().ok_or_else(|| {
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
        let mut host = WasmHostJson {
            dispatcher: dispatcher.clone(),
            string_lengths: BTreeMap::new(),
        };
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            let result = record_values::validate_core_record_values_host_json(
                source as HostHandle,
                identity as HostHandle,
                values as HostHandle,
                &mut host,
                &engine,
                &mut ctx,
            )?;
            umf_core_wire::encode(&result, &mut ctx)
        } else {
            let mut ctx = Context::ordinary();
            let result = record_values::validate_core_record_values_host_json(
                source as HostHandle,
                identity as HostHandle,
                values as HostHandle,
                &mut host,
                &engine,
                &mut ctx,
            )?;
            umf_core_wire::encode(&result, &mut ctx)
        }
    })();
    umf_core_wire::result_envelope(result)
}

#[wasm_bindgen(js_name = executeCoreSchemaPropertiesHostJson)]
pub fn execute_core_schema_properties_host_json(
    resources_wire: &str,
    operation: &str,
    source_handle: u32,
    identity_handle: u32,
    third_handle: u32,
    dispatcher: &Function,
) -> String {
    let result = (|| -> Result<String, EngineError> {
        let resources =
            umf_core_wire::decode(resources_wire, &mut umf_core_wire::transport_context())?;
        let resource = |name: &str| {
            field(&resources, name).cloned().ok_or_else(|| {
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
        let mut host = WasmHostJson {
            dispatcher: dispatcher.clone(),
            string_lengths: BTreeMap::new(),
        };
        let mut ctx = Context::ordinary();
        let value = umf_core::schema_properties_host_json::execute(
            operation,
            source_handle as HostHandle,
            identity_handle as HostHandle,
            third_handle as HostHandle,
            &mut host,
            &engine,
            &mut ctx,
        )?;
        umf_core_wire::encode(&value, &mut ctx)
    })();
    umf_core_wire::result_envelope(result)
}

/// Private opt-in Core Cardinality route with one Rust-owned operation Context.
#[wasm_bindgen(js_name = executeCoreCardinalityHostJson)]
pub fn execute_core_cardinality_host_json(
    resources_wire: &str,
    operation: &str,
    source_handle: u32,
    identity_handle: u32,
    third_handle: u32,
    dispatcher: &Function,
) -> String {
    let result = (|| -> Result<String, EngineError> {
        let resources =
            umf_core_wire::decode(resources_wire, &mut umf_core_wire::transport_context())?;
        let resource = |name: &str| {
            field(&resources, name).cloned().ok_or_else(|| {
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
        let mut host = WasmHostJson {
            dispatcher: dispatcher.clone(),
            string_lengths: BTreeMap::new(),
        };
        let mut ctx = Context::ordinary();
        let value = cardinality_host_json::execute(
            operation,
            &[
                source_handle as HostHandle,
                identity_handle as HostHandle,
                third_handle as HostHandle,
            ],
            &mut host,
            &engine,
            &mut ctx,
        )?;
        umf_core_wire::encode(&value, &mut ctx)
    })();
    umf_core_wire::result_envelope(result)
}

/// Private opt-in host route for R8 Selection. Kept outside the package roots.
#[wasm_bindgen(js_name = executeCoreElementSelectionHostJson)]
pub fn execute_core_element_selection_host_json(
    resources_wire: &str,
    has_registry: bool,
    source_handle: u32,
    query_handle: u32,
    registry_handle: u32,
    dispatcher: &Function,
) -> String {
    let result = (|| -> Result<String, EngineError> {
        let resources =
            umf_core_wire::decode(resources_wire, &mut umf_core_wire::transport_context())?;
        let resource = |name: &str| {
            field(&resources, name).cloned().ok_or_else(|| {
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
        let mut host = WasmHostJson {
            dispatcher: dispatcher.clone(),
            string_lengths: BTreeMap::new(),
        };
        let mut ctx = Context::ordinary();
        let value = umf_core::selection_host_json::execute(
            source_handle as HostHandle,
            query_handle as HostHandle,
            has_registry.then_some(registry_handle as HostHandle),
            &mut host,
            &engine,
            &mut ctx,
        )?;
        umf_core_wire::encode(&value, &mut ctx)
    })();
    umf_core_wire::result_envelope(result)
}

/// Private R8 carrier probe: return a host-owned invocation result by identity.
#[wasm_bindgen(js_name = executeCoreOpaqueReturnHostJson)]
pub fn execute_core_opaque_return_host_json(
    function_handle: u32,
    receiver_handle: u32,
    argument_handle: u32,
    dispatcher: &Function,
) -> String {
    let result = (|| -> Result<String, EngineError> {
        let mut host = WasmHostJson {
            dispatcher: dispatcher.clone(),
            string_lengths: BTreeMap::new(),
        };
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
#[wasm_bindgen(js_name = executeCoreKindRuntimeValidationHostJson)]
pub fn execute_core_kind_runtime_validation_host_json(
    has_registry: bool,
    source_handle: u32,
    registry_handle: u32,
    dispatcher: &Function,
) -> String {
    let result = (|| -> Result<String, EngineError> {
        if !has_registry {
            return Err(EngineError::new(
                "HOST_JSON_UNSUPPORTED",
                Utf16::default(),
                "Caller Registry is required for kindRuntime validation delegation",
            ));
        }
        let mut host = WasmHostJson {
            dispatcher: dispatcher.clone(),
            string_lengths: BTreeMap::new(),
        };
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

fn event_json(event: &HostJsonEvent) -> String {
    match event {
        HostJsonEvent::UnicodeCount { value } => format!(
            r#"{{"event":"unicode-count","carrier":{}}}"#,
            rust_value_wire_json(value)
        ),
        HostJsonEvent::GetOpaqueProperty {
            receiver,
            key,
            semantic_catch,
        } => {
            let key = match key {
                HostOpaqueKey::String(units) => format!(
                    r#"{{"kind":"string","units":[{}]}}"#,
                    units
                        .iter()
                        .map(u16::to_string)
                        .collect::<Vec<_>>()
                        .join(",")
                ),
                HostOpaqueKey::IteratorSymbol => r#"{"kind":"iterator-symbol"}"#.to_owned(),
            };
            format!(
                r#"{{"event":"get-opaque-property","receiver":{},"key":{key},"semanticCatch":{semantic_catch}}}"#,
                host_invoke_value_wire_json(receiver)
            )
        }
        HostJsonEvent::InvokeOpaque {
            function,
            receiver,
            args,
            semantic_catch,
        } => {
            let args = args
                .iter()
                .map(host_invoke_value_wire_json)
                .collect::<Vec<_>>()
                .join(",");
            format!(
                r#"{{"event":"invoke-opaque","function":{function},"receiver":{},"args":[{args}],"semanticCatch":{semantic_catch}}}"#,
                host_invoke_value_wire_json(receiver)
            )
        }
        HostJsonEvent::StringConcat { prefix, value } => format!(
            r#"{{"event":"string-concat","prefix":[{}],"value":{}}}"#,
            prefix
                .iter()
                .map(u16::to_string)
                .collect::<Vec<_>>()
                .join(","),
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
        HostJsonEvent::StringifyOpaqueValue { value } => format!(
            r#"{{"event":"stringify-opaque-value","value":{}}}"#,
            host_invoke_value_wire_json(value),
        ),
        HostJsonEvent::ConstructErrorCarrier { value } => format!(
            r#"{{"event":"construct-error-carrier","value":{}}}"#,
            host_invoke_value_wire_json(value),
        ),
        HostJsonEvent::CloseOpaqueIterator { iterator } => {
            format!(r#"{{"event":"close-opaque-iterator","iterator":{iterator}}}"#,)
        }
        HostJsonEvent::MaterializeSpreadFailure { target } => {
            let target = match target {
                HostSpreadFailureTarget::Nullish(value) => format!(
                    r#"{{"kind":"nullish","value":{}}}"#,
                    host_invoke_value_wire_json(value)
                ),
                HostSpreadFailureTarget::IteratorMethod(value) => format!(
                    r#"{{"kind":"iterator-method","value":{}}}"#,
                    host_invoke_value_wire_json(value)
                ),
                HostSpreadFailureTarget::IteratorResultPrimitive(value) => format!(
                    r#"{{"kind":"iterator-result-primitive","value":{}}}"#,
                    host_invoke_value_wire_json(value)
                ),
                HostSpreadFailureTarget::IteratorNextMethod(value) => format!(
                    r#"{{"kind":"iterator-next-method","value":{}}}"#,
                    host_invoke_value_wire_json(value)
                ),
                HostSpreadFailureTarget::IteratorStepPrimitive(value) => format!(
                    r#"{{"kind":"iterator-step-primitive","value":{}}}"#,
                    host_invoke_value_wire_json(value)
                ),
            };
            format!(r#"{{"event":"materialize-spread-failure","target":{target}}}"#)
        }
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
            let _ = write!(
                output,
                r#"{{"kind":"number","bits":"{:016x}"}}"#,
                value.to_bits()
            );
        }
        Value::String(value) => {
            output.push_str(r#"{"kind":"string","units":["#);
            write_utf16_units(value.units(), output);
            output.push_str("]}");
        }
        Value::Array(values) => {
            output.push_str(r#"{"kind":"array","items":["#);
            for (index, item) in values.iter().enumerate() {
                if index != 0 {
                    output.push(',');
                }
                write_rust_value_wire_json(item, output);
            }
            output.push_str("]}");
        }
        Value::Object(members) => {
            output.push_str(r#"{"kind":"object","members":["#);
            for (index, (key, value)) in members.iter().enumerate() {
                if index != 0 {
                    output.push(',');
                }
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
        if index != 0 {
            output.push(',');
        }
        let _ = write!(output, "{unit}");
    }
}

fn decode_reply(
    event: &HostJsonEvent,
    value: Value,
    lengths: &mut BTreeMap<u64, usize>,
) -> Result<HostJsonReply, EngineError> {
    let kind = text(&value, "kind").ok_or_else(protocol_error)?;
    let kind = kind.to_utf8().map_err(|_| protocol_error())?;
    let valid = match event {
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
            matches!(
                kind.as_str(),
                "utf16-chunk" | "utf16-text-chunk" | "host-exception"
            )
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
        | HostJsonEvent::StringifyOpaqueValue { .. }
        | HostJsonEvent::ConstructErrorCarrier { .. } => {
            matches!(kind.as_str(), "opaque-value" | "host-exception")
        }
        HostJsonEvent::CloseOpaqueIterator { .. } => kind == "iterator-closed",
        HostJsonEvent::MaterializeSpreadFailure { .. } => kind == "spread-failure",
    };
    if !valid {
        return Err(protocol_error());
    }
    if kind == "host-exception" {
        return Err(EngineError::new(
            "HOST_JSON_CALLBACK",
            Utf16::default(),
            "Host reflection threw",
        ));
    }
    if kind == "opaque-value" {
        return Ok(HostJsonReply::OpaqueValue(decode_opaque_value(
            field(&value, "value").ok_or_else(protocol_error)?,
            lengths,
        )?));
    }
    if kind == "invocation" {
        return Ok(HostJsonReply::Invocation(decode_opaque_value(
            field(&value, "value").ok_or_else(protocol_error)?,
            lengths,
        )?));
    }
    if kind == "semantic-throw" {
        return Ok(HostJsonReply::SemanticThrow(string_ref(
            field(&value, "message").ok_or_else(protocol_error)?,
            lengths,
        )?));
    }
    Ok(match kind.as_str() {
        "iterator-closed" => HostJsonReply::IteratorClosed,
        "spread-failure" => HostJsonReply::SpreadFailure(string_ref(
            field(&value, "message").ok_or_else(protocol_error)?,
            lengths,
        )?),
        "null" => HostJsonReply::Kind(HostJsonKind::Null),
        "boolean" => {
            let value = boolean(&value, "value").ok_or_else(protocol_error)?;
            if matches!(
                event,
                HostJsonEvent::Classify { .. } | HostJsonEvent::ReadProperty { .. }
            ) {
                HostJsonReply::Kind(HostJsonKind::Boolean(value))
            } else {
                HostJsonReply::Boolean(value)
            }
        }
        "number" => HostJsonReply::Kind(HostJsonKind::Number(
            number(&value, "bits").ok_or_else(protocol_error)?,
        )),
        "string" => HostJsonReply::Kind(HostJsonKind::String(string_ref(&value, lengths)?)),
        "object" => HostJsonReply::Kind(HostJsonKind::Object(
            unsigned(&value, "handle").ok_or_else(protocol_error)?,
        )),
        "unsupported" => HostJsonReply::Kind(HostJsonKind::Unsupported(
            match text(&value, "value")
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
            {
                Some("undefined") => "undefined",
                Some("function") => "function",
                Some("symbol") => "symbol",
                Some("bigint") => "bigint",
                _ => return Err(protocol_error()),
            },
        )),
        "prototype" => HostJsonReply::Prototype(
            match text(&value, "value")
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
            {
                Some("ordinary") => HostPrototype::OrdinaryObject,
                Some("null") => HostPrototype::Null,
                Some("array") => HostPrototype::Array,
                Some("other") => HostPrototype::Other,
                _ => return Err(protocol_error()),
            },
        ),
        "count" => {
            HostJsonReply::Count(unsigned(&value, "value").ok_or_else(protocol_error)? as usize)
        }
        "snapshot" => HostJsonReply::Snapshot(HostDescriptorSnapshot {
            token: unsigned(&value, "token").ok_or_else(protocol_error)?,
            count: unsigned(&value, "count").ok_or_else(protocol_error)? as usize,
        }),
        "descriptor" => {
            let key = string_ref(field(&value, "key").ok_or_else(protocol_error)?, lengths)?;
            let enumerable = boolean(&value, "enumerable").ok_or_else(protocol_error)?;
            let is_data = boolean(&value, "isData").ok_or_else(protocol_error)?;
            let has_value = boolean(&value, "hasValue").ok_or_else(protocol_error)?;
            let value = if has_value {
                Some(descriptor_value(
                    field(&value, "value").ok_or_else(protocol_error)?,
                    lengths,
                )?)
            } else {
                None
            };
            HostJsonReply::Descriptor(HostPropertyDescriptor {
                key,
                enumerable,
                is_data,
                value,
            })
        }
        "utf16-text-chunk" => {
            let offset = unsigned(&value, "offset").ok_or_else(protocol_error)? as usize;
            let Value::String(text) = field(&value, "text").ok_or_else(protocol_error)? else {
                return Err(protocol_error());
            };
            let HostJsonEvent::ReadUtf16Chunk {
                token,
                offset: requested,
                max_units,
            } = event
            else {
                return Err(protocol_error());
            };
            let length = *lengths.get(token).ok_or_else(protocol_error)?;
            let expected = (length.saturating_sub(*requested)).min(*max_units);
            if offset != *requested || *max_units != 8192 || text.units().len() != expected {
                return Err(protocol_error());
            }
            HostJsonReply::Utf16Chunk {
                offset,
                units: text.units().to_vec(),
            }
        }
        "utf16-chunk" => {
            let offset = unsigned(&value, "offset").ok_or_else(protocol_error)? as usize;
            let Value::Array(items) = field(&value, "units").ok_or_else(protocol_error)? else {
                return Err(protocol_error());
            };
            let HostJsonEvent::ReadUtf16Chunk {
                token,
                offset: requested,
                max_units,
            } = event
            else {
                return Err(protocol_error());
            };
            let length = *lengths.get(token).ok_or_else(protocol_error)?;
            let expected = (length.saturating_sub(*requested)).min(*max_units);
            if offset != *requested || *max_units != 8192 || items.len() != expected {
                return Err(protocol_error());
            };
            let mut units = Vec::with_capacity(expected);
            for item in items {
                let Value::Number(n) = item else {
                    return Err(protocol_error());
                };
                if !n.is_finite() || n.fract() != 0.0 || !(0.0..=65535.0).contains(n) {
                    return Err(protocol_error());
                };
                units.push(*n as u16);
            }
            HostJsonReply::Utf16Chunk { offset, units }
        }
        _ => return Err(protocol_error()),
    })
}

fn decode_opaque_value(
    value: &Value,
    lengths: &mut BTreeMap<u64, usize>,
) -> Result<HostOpaqueValue, EngineError> {
    match text(value, "kind")
        .and_then(|value| value.to_utf8().ok())
        .as_deref()
    {
        Some("undefined") => Ok(HostOpaqueValue::Undefined),
        Some("null") => Ok(HostOpaqueValue::Null),
        Some("boolean") => Ok(HostOpaqueValue::Boolean(
            boolean(value, "value").ok_or_else(protocol_error)?,
        )),
        Some("number") => Ok(HostOpaqueValue::Number(
            number(value, "bits").ok_or_else(protocol_error)?,
        )),
        Some("string") => Ok(HostOpaqueValue::String(string_ref(value, lengths)?)),
        Some("opaque") => Ok(HostOpaqueValue::Opaque {
            handle: unsigned(value, "handle").ok_or_else(protocol_error)?,
            opaque_type: match text(value, "opaqueType")
                .and_then(|value| value.to_utf8().ok())
                .as_deref()
            {
                Some("object") => umf_core::host_json::HostOpaqueType::Object,
                Some("function") => umf_core::host_json::HostOpaqueType::Function,
                Some("symbol") => umf_core::host_json::HostOpaqueType::Symbol,
                _ => return Err(protocol_error()),
            },
        }),
        Some("bigint") => Ok(HostOpaqueValue::BigInt {
            handle: unsigned(value, "handle").ok_or_else(protocol_error)?,
            is_zero: boolean(value, "isZero").ok_or_else(protocol_error)?,
        }),
        _ => Err(protocol_error()),
    }
}
fn descriptor_value(
    v: &Value,
    lengths: &mut BTreeMap<u64, usize>,
) -> Result<HostDescriptorValue, EngineError> {
    Ok(
        match text(v, "kind").and_then(|v| v.to_utf8().ok()).as_deref() {
            Some("null") => HostDescriptorValue::Null,
            Some("boolean") => {
                HostDescriptorValue::Boolean(boolean(v, "value").ok_or_else(protocol_error)?)
            }
            Some("number") => {
                HostDescriptorValue::Number(number(v, "bits").ok_or_else(protocol_error)?)
            }
            Some("string") => HostDescriptorValue::String(string_ref(v, lengths)?),
            Some("object") => {
                HostDescriptorValue::Object(unsigned(v, "handle").ok_or_else(protocol_error)?)
            }
            Some("unsupported") => HostDescriptorValue::Unsupported(
                match text(v, "value").and_then(|v| v.to_utf8().ok()).as_deref() {
                    Some("undefined") => "undefined",
                    Some("function") => "function",
                    Some("symbol") => "symbol",
                    Some("bigint") => "bigint",
                    _ => return Err(protocol_error()),
                },
            ),
            _ => return Err(protocol_error()),
        },
    )
}
fn string_ref(v: &Value, lengths: &mut BTreeMap<u64, usize>) -> Result<HostStringRef, EngineError> {
    let token = unsigned(v, "token").ok_or_else(protocol_error)?;
    let units = unsigned(v, "units").ok_or_else(protocol_error)? as usize;
    if lengths.insert(token, units).is_some_and(|old| old != units) {
        return Err(protocol_error());
    }
    Ok(HostStringRef { token, units })
}
fn field<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    match v {
        Value::Object(items) => items
            .iter()
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn take_core_resource(value: &mut Value, name: &str) -> Result<Value, EngineError> {
    let Value::Object(fields) = value else {
        return Err(EngineError::new(
            "REQUEST",
            Utf16::from(name),
            "Explicit resource is required",
        ));
    };
    let index = fields
        .iter()
        .position(|(key, _)| key == &Utf16::from(name))
        .ok_or_else(|| {
            EngineError::new(
                "REQUEST",
                Utf16::from(name),
                "Explicit resource is required",
            )
        })?;
    Ok(fields.swap_remove(index).1)
}
fn text<'a>(v: &'a Value, name: &str) -> Option<&'a Utf16> {
    match field(v, name) {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn boolean(v: &Value, name: &str) -> Option<bool> {
    match field(v, name) {
        Some(Value::Bool(b)) => Some(*b),
        _ => None,
    }
}
fn unsigned(v: &Value, name: &str) -> Option<u64> {
    match field(v, name) {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            Some(*n as u64)
        }
        _ => None,
    }
}
fn number(v: &Value, name: &str) -> Option<f64> {
    let s = text(v, name)?.to_utf8().ok()?;
    if s.len() != 16 {
        return None;
    }
    u64::from_str_radix(&s, 16).ok().map(f64::from_bits)
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
        "WASM host-json dispatcher bridge failed",
    )
}

/// Retained immutable engine and Dataset schemas for the host-admission facade.
#[wasm_bindgen]
pub struct CoreDatasetValuesRuntime {
    engine: Engine,
    validator: umf_core::dataset_values::CoreDatasetValueValidator,
}

#[wasm_bindgen]
impl CoreDatasetValuesRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(
        resources_wire: &str,
        control_dispatcher: Option<Function>,
    ) -> Result<CoreDatasetValuesRuntime, JsValue> {
        let build = |ctx: &mut Context<'_>| -> Result<
            (Engine, umf_core::dataset_values::CoreDatasetValueValidator),
            EngineError,
        > {
            let mut resources =
                ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(resources_wire, ctx))?;
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
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            build(&mut ctx)
        } else {
            build(&mut Context::ordinary())
        };
        result
            .map(|(engine, validator)| Self { engine, validator })
            .map_err(|error| JsValue::from_str(&umf_core_wire::error_envelope(error)))
    }

    #[wasm_bindgen]
    pub fn execute(
        &self,
        operation_name: &str,
        source_handle: u32,
        input_handle: u32,
        expected_handle: u32,
        dispatcher: Function,
        control_dispatcher: Option<Function>,
    ) -> String {
        use umf_core::core_dataset_values_host_json::CoreDatasetValuesHostOperation as Op;
        let operation = match operation_name {
            "validateCoreDatasetValues" => Ok(Op::Validate),
            "verifyCoreDatasetValues" => Ok(Op::Verify),
            _ => Err(EngineError::new(
                "REQUEST",
                Utf16::default(),
                "Unknown Dataset values host operation",
            )),
        };
        let handles = [source_handle, input_handle, expected_handle].map(HostHandle::from);
        let mut host = WasmHostJson {
            dispatcher,
            string_lengths: BTreeMap::new(),
        };
        let execute =
            |ctx: &mut Context<'_>, host: &mut WasmHostJson| -> Result<String, EngineError> {
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
            let mut control = super::WasmControl { dispatcher };
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
            members.push((
                Utf16::from("opaqueType"),
                Value::String(Utf16::from(opaque_type)),
            ));
        }
        Value::Object(members)
    }

    #[test]
    fn utf16_text_chunk_reply_preserves_surrogates_and_checks_bounds() {
        let event = HostJsonEvent::ReadUtf16Chunk {
            token: 7,
            offset: 0,
            max_units: 8192,
        };
        let frame = Value::Object(vec![
            (
                Utf16::from("kind"),
                Value::String(Utf16::from("utf16-text-chunk")),
            ),
            (Utf16::from("offset"), Value::Number(0.0)),
            (
                Utf16::from("text"),
                Value::String(Utf16::new(vec![0xd800, 0xdc00])),
            ),
        ]);
        let lengths = BTreeMap::from([(7, 2)]);
        assert_eq!(
            decode_reply(&event, frame.clone(), &mut lengths.clone()).unwrap(),
            HostJsonReply::Utf16Chunk {
                offset: 0,
                units: vec![0xd800, 0xdc00]
            },
        );
        let mut wrong_offset = frame.clone();
        if let Value::Object(fields) = &mut wrong_offset {
            fields[1].1 = Value::Number(1.0);
        }
        assert!(decode_reply(&event, wrong_offset, &mut lengths.clone()).is_err());
        let mut short_text = frame;
        if let Value::Object(fields) = &mut short_text {
            fields[2].1 = Value::String(Utf16::new(vec![0xd800]));
        }
        assert!(decode_reply(&event, short_text, &mut lengths.clone()).is_err());
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
                HostOpaqueValue::Opaque {
                    handle: 1,
                    opaque_type: expected
                },
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
                    (
                        Utf16::from("severity"),
                        Value::String(Utf16::from("warning")),
                    ),
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
                    message: HostStringRef {
                        token: 19,
                        units: 5
                    },
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
        let nullish = HostJsonEvent::MaterializeSpreadFailure {
            target: HostSpreadFailureTarget::Nullish(HostInvokeValue::Undefined),
        };
        assert_eq!(
            event_json(&nullish),
            r#"{"event":"materialize-spread-failure","target":{"kind":"nullish","value":{"kind":"undefined"}}}"#
        );
        let method = HostJsonEvent::MaterializeSpreadFailure {
            target: HostSpreadFailureTarget::IteratorMethod(HostInvokeValue::Json(Value::Bool(
                false,
            ))),
        };
        assert_eq!(
            event_json(&method),
            r#"{"event":"materialize-spread-failure","target":{"kind":"iterator-method","value":{"kind":"json","value":{"kind":"boolean","value":false}}}}"#
        );
        let primitive_iterator = HostJsonEvent::MaterializeSpreadFailure {
            target: HostSpreadFailureTarget::IteratorResultPrimitive(HostInvokeValue::Json(
                Value::Number(17.0),
            )),
        };
        assert_eq!(
            event_json(&primitive_iterator),
            r#"{"event":"materialize-spread-failure","target":{"kind":"iterator-result-primitive","value":{"kind":"json","value":{"kind":"number","bits":"4031000000000000"}}}}"#
        );
        let next_method = HostJsonEvent::MaterializeSpreadFailure {
            target: HostSpreadFailureTarget::IteratorNextMethod(HostInvokeValue::Json(
                Value::Number(17.0),
            )),
        };
        assert_eq!(
            event_json(&next_method),
            r#"{"event":"materialize-spread-failure","target":{"kind":"iterator-next-method","value":{"kind":"json","value":{"kind":"number","bits":"4031000000000000"}}}}"#
        );
        let step_primitive = HostJsonEvent::MaterializeSpreadFailure {
            target: HostSpreadFailureTarget::IteratorStepPrimitive(HostInvokeValue::Undefined),
        };
        assert_eq!(
            event_json(&step_primitive),
            r#"{"event":"materialize-spread-failure","target":{"kind":"iterator-step-primitive","value":{"kind":"undefined"}}}"#
        );
        let reply = Value::Object(vec![
            (
                Utf16::from("kind"),
                Value::String(Utf16::from("spread-failure")),
            ),
            (
                Utf16::from("message"),
                Value::Object(vec![
                    (Utf16::from("token"), Value::Number(1.0)),
                    (Utf16::from("units"), Value::Number(4.0)),
                ]),
            ),
        ]);
        assert!(decode_reply(&nullish, reply, &mut BTreeMap::new()).is_ok());
        let malformed = Value::Object(vec![(
            Utf16::from("kind"),
            Value::String(Utf16::from("iterator-closed")),
        )]);
        assert!(decode_reply(&nullish, malformed, &mut BTreeMap::new()).is_err());
    }

    #[test]
    fn iterator_close_event_codec_is_closed() {
        let event = HostJsonEvent::CloseOpaqueIterator { iterator: 23 };
        assert_eq!(
            event_json(&event),
            r#"{"event":"close-opaque-iterator","iterator":23}"#
        );
        let reply = Value::Object(vec![(
            Utf16::from("kind"),
            Value::String(Utf16::from("iterator-closed")),
        )]);
        assert_eq!(
            decode_reply(&event, reply, &mut BTreeMap::new()).unwrap(),
            HostJsonReply::IteratorClosed
        );
        let malformed = Value::Object(vec![(
            Utf16::from("kind"),
            Value::String(Utf16::from("opaque-value")),
        )]);
        assert!(decode_reply(&event, malformed, &mut BTreeMap::new()).is_err());
    }

    #[test]
    fn semantic_throw_reply_is_rejected_when_catch_is_disabled() {
        let reply = Value::Object(vec![(
            Utf16::from("kind"),
            Value::String(Utf16::from("semantic-throw")),
        )]);
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

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private `umf.core-wire/1` transport shared by native language bindings.
pub mod access_temporal_binding;
#[cfg(feature = "codegen")]
mod codegen;
pub mod core_key_tuple_binding;
pub mod core_key_verification_binding;
pub mod core_record_type_verification_binding;
pub mod delta_log_binding;
pub mod delta_schema_table;
pub mod delta_spark_hash;
pub mod host_response_frames;
#[cfg(feature = "embedded-adapters")]
pub mod json_schema_import_session_binding;
pub mod javascript_numeric_runtime;
pub mod json_number_binding;
pub mod parquet_record_type_binding;
#[cfg(feature = "embedded-adapters")]
pub mod protobuf_document;
#[cfg(feature = "embedded-adapters")]
pub mod protobuf_source;
pub mod record_members_inspection_binding;
#[cfg(feature = "embedded-adapters")]
pub mod record_type_binding;
pub mod rfc3339_exact_instant_binding;
pub mod security_disclosure_literal_binding;
pub mod security_domains_binding;
pub mod security_functions_binding;
pub mod security_logic_binding;
pub mod security_parameters_binding;
pub mod security_protection_source_binding;
pub mod semantic_value;
#[cfg(feature = "codegen")]
pub use umf_codegen::generation::PythonClientHostReadV3;

/// Opt-in owner for compiled codegen resources. Construction and each call
/// receive separate host-control contexts; this handle contains no callbacks.
#[cfg(feature = "codegen")]
pub struct CodegenResourcesHandle {
    resources: umf_codegen::CodegenResources,
}

#[cfg(feature = "codegen")]
impl CodegenResourcesHandle {
    pub fn new_with_control(
        wire_json: &str,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Result<Self, EngineError> {
        let mut ctx = Context::ordinary().with_host_control(control);
        let mut value = decode(wire_json, &mut ctx)?;
        if text_field(&value, "op").as_deref() != Some("codegen/createResources") {
            return Err(fail(
                "REQUEST",
                "codegen/createResources operation is required",
            ));
        }
        let mut resources = take_field(&mut value, "resources")
            .ok_or_else(|| fail("REQUEST", "Explicit codegen resources are required"))?;
        let compiled = codegen::build_resources(&mut resources, &mut ctx)?;
        Ok(Self {
            resources: compiled,
        })
    }

    pub fn execute_with_control(
        &self,
        wire_json: &str,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> String {
        let result = (|| {
            let mut ctx = Context::ordinary().with_host_control(control);
            let mut request = decode(wire_json, &mut ctx)?;
            let operation = text_field(&request, "op")
                .and_then(|op| op.strip_prefix("codegen/").map(str::to_owned))
                .ok_or_else(|| fail("REQUEST", "Codegen operation is required"))?;
            if operation == "createResources" || operation == "generatePythonClientHostV3" {
                return Err(fail("REQUEST", "Operation is not available on this handle"));
            }
            codegen::execute_with_resources(&operation, &mut request, &self.resources, &mut ctx)
        })();
        result_envelope(result)
    }

    pub fn execute_host_read_v3_with_control(
        &self,
        wire_json: &str,
        host_read: &mut dyn umf_codegen::generation::PythonClientHostReadV3,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> String {
        let result = (|| {
            let mut ctx = Context::ordinary().with_host_control(control);
            let mut request = decode(wire_json, &mut ctx)?;
            if text_field(&request, "op").as_deref() != Some("codegen/generatePythonClientHostV3") {
                return Err(fail("REQUEST", "Unknown codegen host-read operation"));
            }
            codegen::execute_host_read_with_resources(
                &mut request,
                host_read,
                &self.resources,
                &mut ctx,
            )
        })();
        result_envelope(result)
    }
}

use umf_core::serialization::Format;
use umf_core::{
    Capabilities, Context, Diagnostic, Engine, EngineError, Registry, ResourceProfile, ResourceSet,
    Severity, Utf16, Value, copy_json,
};
pub use umf_tagged_wire::{decode, encode, transport_context};
use umf_tagged_wire::{encode_owned, units_wire_size, wire_size, write_units, write_wire};

pub fn encode_callback_request(
    payload: &Value,
    document: &Value,
    path: &Utf16,
    scope: &str,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let payload = copy_json(payload, ctx)?;
    let document = copy_json(document, ctx)?;
    ctx.charge_work(path.len(), Utf16::default())?;
    ctx.charge_work(scope.encode_utf16().count(), Utf16::default())?;
    ctx.charge_work(4, Utf16::default())?;
    let request = Value::Object(vec![
        (Utf16::from("payload"), payload),
        (Utf16::from("document"), document),
        (Utf16::from("path"), Value::String(path.clone())),
        (Utf16::from("scope"), Value::string_utf8(scope.to_owned())),
    ]);
    // Payload and document were each admitted before their source snapshots;
    // this private request wrapper must not reapply semantic depth/count limits.
    encode_owned(&request, ctx)
}

/// Encode the semantic validator's two borrowed, already-admitted snapshots
/// without making another deep copy in the host bridge.
pub fn encode_semantic_validator_request(
    value: &Value,
    definition: &Value,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let value_key = Utf16::from("value");
    let definition_key = Utf16::from("definition");
    let prefix = r#"{"kind":"object","members":[{"key":"#;
    let middle = r#","value":"#;
    let between = r#"},{"key":"#;
    let suffix = r#","value":"#;
    ctx.charge_work(3, Utf16::default())?;
    let value_key_size = units_wire_size(value_key.units(), ctx)?;
    let definition_key_size = units_wire_size(definition_key.units(), ctx)?;
    let value_size = wire_size(value, ctx)?;
    let definition_size = wire_size(definition, ctx)?;
    let size = prefix.len()
        + value_key_size
        + middle.len()
        + value_size
        + between.len()
        + definition_key_size
        + suffix.len()
        + definition_size
        + 3; // }]
    ctx.charge_work(size, Utf16::default())?;
    let mut output = String::with_capacity(size);
    output.push_str(prefix);
    write_units(value_key.units(), &mut output);
    output.push_str(middle);
    write_wire(value, &mut output);
    output.push_str(between);
    write_units(definition_key.units(), &mut output);
    output.push_str(suffix);
    write_wire(definition, &mut output);
    output.push('}');
    output.push_str("]}");
    debug_assert_eq!(output.len(), size);
    Ok(output)
}

pub fn copy_wire(wire_json: &str) -> Result<String, EngineError> {
    // Tagged UTF-16 unit arrays inflate the token count, but copy_json's
    // ordinary contract has no aggregate copied-text ceiling. Decode and
    // transport under the separate envelope limits, then let Rust re-admit
    // the semantic tree under ordinary structural limits.
    let mut transport = transport_context();
    let value = decode(wire_json, &mut transport)?;
    let value = copy_json(&value, &mut Context::ordinary())?;
    encode(&value, &mut transport)
}

/// Serialize a closed host-independent result envelope. Error path/message are
/// UTF-16 code units so lone surrogates survive every binding boundary.
pub fn result_envelope(result: Result<String, EngineError>) -> String {
    match result {
        Ok(wire) => serde_json::json!({
            "profile": "umf.core-wire/1",
            "status": "ok",
            "wire": wire,
        })
        .to_string(),
        Err(error) => serde_json::json!({
            "profile": "umf.core-wire/1",
            "status": "error",
            "code": error.code,
            "pathUnits": error.path.units(),
            "messageUnits": error.message.units(),
        })
        .to_string(),
    }
}

pub fn copy_wire_envelope(wire_json: &str) -> String {
    result_envelope(copy_wire(wire_json))
}

/// Read an arbitrary JSON/YAML value through the core serializer, preserving
/// its ordinary per-value structural and source-text limits.
pub fn read_value_wire(wire_json: &str, format: &str) -> String {
    run_value_wire(wire_json, format, false, None)
}

pub fn read_value_wire_with_control(
    wire_json: &str,
    format: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    run_value_wire(wire_json, format, false, Some(control))
}

/// Read the TypeScript `readJsonValue` profile through an explicit opt-in
/// operation. Generic `readValueWire` keeps its Rust YAML/JSON semantics.
pub fn read_typescript_json_value_wire(wire_json: &str, format: &str) -> String {
    run_typescript_json_value_wire(wire_json, format, None)
}

pub fn read_typescript_json_value_wire_with_control(
    wire_json: &str,
    format: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    run_typescript_json_value_wire(wire_json, format, Some(control))
}

pub fn write_typescript_json_value_wire(wire_json: &str, format: &str) -> String {
    run_typescript_json_value_writer_wire(wire_json, format, None)
}

pub fn write_typescript_json_value_wire_with_control(
    wire_json: &str,
    format: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    run_typescript_json_value_writer_wire(wire_json, format, Some(control))
}

fn run_typescript_json_value_wire(
    wire_json: &str,
    format: &str,
    control: Option<&mut dyn FnMut(usize) -> Result<(), EngineError>>,
) -> String {
    let result = (|| {
        let format = match format {
            "json" => Some(Format::Json),
            "yaml" => Some(Format::Yaml),
            _ => return Err(fail("FORMAT", "Format must be json or yaml")),
        };
        let ctx = Context::ordinary();
        let mut ctx = if let Some(control) = control {
            ctx.with_host_control(control)
        } else {
            ctx
        };
        let value = decode(wire_json, &mut ctx)?;
        let Value::String(source) = value else {
            return Err(fail("SOURCE", "Source text must be a string"));
        };
        let result =
            umf_core::serialization::read_typescript_json_value(source.units(), format, &mut ctx)?;
        encode(&result, &mut ctx)
    })();
    result_envelope(result)
}

fn run_typescript_json_value_writer_wire(
    wire_json: &str,
    format: &str,
    control: Option<&mut dyn FnMut(usize) -> Result<(), EngineError>>,
) -> String {
    let result = (|| {
        let format = match format {
            "json" => Some(Format::Json),
            "yaml" => Some(Format::Yaml),
            _ => return Err(fail("FORMAT", "Format must be json or yaml")),
        };
        let ctx = Context::ordinary();
        let mut ctx = if let Some(control) = control {
            ctx.with_host_control(control)
        } else {
            ctx
        };
        let value = decode(wire_json, &mut ctx)?;
        let source =
            umf_core::serialization::write_typescript_json_value(&value, format, &mut ctx)?;
        encode(&Value::String(source), &mut ctx)
    })();
    result_envelope(result)
}

/// Write an arbitrary admitted core value as JSON/YAML using Rust's writer.
pub fn write_value_wire(wire_json: &str, format: &str) -> String {
    run_value_wire(wire_json, format, true, None)
}

pub fn write_value_wire_with_control(
    wire_json: &str,
    format: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    run_value_wire(wire_json, format, true, Some(control))
}

/// Execute one `umf-128/1` codec operation. Tagged admission, the codec, and
/// tagged result encoding share this invocation context and host controls.
pub fn execute_bit128_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_bit128_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_bit128_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "profile").as_deref() != Some("umf-128/1") {
            return Err(fail("REQUEST", "umf-128/1 profile is required"));
        }
        let op = text_field(&request, "op")
            .ok_or_else(|| fail("REQUEST", "Codec operation is required"))?;
        let args = field(&request, "args")
            .ok_or_else(|| fail("REQUEST", "Codec arguments are required"))?;
        let value = |name: &str| {
            field(args, name).ok_or_else(|| fail("REQUEST", &format!("{name} is required")))
        };
        let result = match op.as_str() {
            "parseBits128" => umf_core::bit128::parse_bits128(value("text")?, &mut ctx)?,
            "parseUuid" => umf_core::bit128::parse_uuid(value("text")?, &mut ctx)?,
            "bits128FromBytes" => umf_core::bit128::bits128_from_bytes(value("bytes")?, &mut ctx)?,
            "bits128ToBytes" => umf_core::bit128::bits128_to_bytes(value("value")?, &mut ctx)?,
            "uuidFromBits128" => umf_core::bit128::uuid_from_bits128(value("value")?, &mut ctx)?,
            "uuidToBits128" => umf_core::bit128::uuid_to_bits128(value("value")?, &mut ctx)?,
            "compareBits128" => {
                umf_core::bit128::compare_bits128(value("left")?, value("right")?, &mut ctx)?
            }
            "bits128ToWords" => {
                umf_core::bit128::bits128_to_words(value("value")?, value("signed")?, &mut ctx)?
            }
            "bits128FromWords" => {
                umf_core::bit128::bits128_from_words(value("words")?, value("signed")?, &mut ctx)?
            }
            "bits128ToInteger" => {
                umf_core::bit128::bits128_to_integer(value("value")?, value("signed")?, &mut ctx)?
            }
            "bits128FromInteger" => umf_core::bit128::bits128_from_integer(
                value("literal")?,
                value("signed")?,
                &mut ctx,
            )?,
            _ => return Err(fail("REQUEST", "Unknown umf-128/1 operation")),
        };
        encode(&result, &mut ctx)
    })();
    result_envelope(result)
}

fn run_value_wire(
    wire_json: &str,
    format: &str,
    write: bool,
    control: Option<&mut dyn FnMut(usize) -> Result<(), EngineError>>,
) -> String {
    let result = (|| {
        let format = match format {
            "json" => Format::Json,
            "yaml" => Format::Yaml,
            _ => return Err(fail("FORMAT", "Format must be json or yaml")),
        };
        let ctx = Context::ordinary();
        let mut ctx = if let Some(control) = control {
            ctx.with_host_control(control)
        } else {
            ctx
        };
        let value = decode(wire_json, &mut ctx)?;
        let result = if write {
            Value::String(umf_core::serialization::write_json_value(
                &value, format, &mut ctx,
            )?)
        } else {
            let Value::String(source) = value else {
                return Err(fail("SOURCE", "Source text must be a string"));
            };
            umf_core::serialization::read_json_value(source.units(), format, &mut ctx)?
        };
        encode(&result, &mut ctx)
    })();
    result_envelope(result)
}

pub fn error_envelope(error: EngineError) -> String {
    result_envelope(Err(error))
}

/// Versioned resource-free profile for the generated-reference structural diff.
pub const DOCUMENT_COMPARISON_PROFILE: &str = "umf.schema-comparison/1";

pub fn execute_document_comparison_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_document_comparison_wire_with_control(wire_json, &mut no_control)
}

/// Decode ordered core values, compare them in one controlled invocation, and
/// encode the exact change list without constructing an Engine or resources.
pub fn execute_document_comparison_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "profile").as_deref() != Some(DOCUMENT_COMPARISON_PROFILE) {
            return Err(fail(
                "REQUEST",
                "umf.schema-comparison/1 profile is required",
            ));
        }
        let before =
            field(&request, "before").ok_or_else(|| fail("REQUEST", "Before value is required"))?;
        let after =
            field(&request, "after").ok_or_else(|| fail("REQUEST", "After value is required"))?;
        let result = umf_core::structural_diff::compare_documents(before, after, &mut ctx)?;
        encode(&result, &mut ctx)
    })();
    result_envelope(result)
}

/// Versioned opt-in dispatcher for preservation, inspection, parsing, and
/// transactional node editing in CONTRACT-002. `resources` is an ordered array of `{uri,
/// source}` entries; it performs no I/O and is charged by the same invocation
/// Context as request decoding, the operation, and result encoding.
pub const JSON_SCHEMA_PROFILE: &str = "umf-r5-json-schema/0.1.0";

/// Retained immutable resources for a prepared JSON Schema binding. The inner
/// runtime is private so callers cannot replace pinned schemas or registries.
#[cfg(feature = "embedded-adapters")]
pub struct PreparedJsonSchemaRuntime {
    runtime: umf_core::json_schema_adapter::JsonSchemaRuntime,
}

#[cfg(feature = "embedded-adapters")]
pub fn prepare_json_schema_runtime() -> Result<PreparedJsonSchemaRuntime, EngineError> {
    let mut setup = Context::ordinary();
    Ok(PreparedJsonSchemaRuntime {
        runtime: umf_core::json_schema_adapter::JsonSchemaRuntime::new(&mut setup)?,
    })
}

#[cfg(feature = "embedded-adapters")]
pub fn prepare_json_schema_runtime_with_control(
    setup_control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> Result<PreparedJsonSchemaRuntime, EngineError> {
    let mut setup = Context::ordinary().with_host_control(setup_control);
    Ok(PreparedJsonSchemaRuntime {
        runtime: umf_core::json_schema_adapter::JsonSchemaRuntime::new(&mut setup)?,
    })
}

#[cfg(feature = "embedded-adapters")]
pub fn execute_json_schema_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_json_schema_wire_with_control(wire_json, &mut no_control)
}

#[cfg(feature = "embedded-adapters")]
pub fn execute_json_schema_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    execute_json_schema_wire_inner(wire_json, control, None)
}

/// Execute through a factory-prepared immutable runtime. One new Context
/// spans this call's transport, operation, and result encoding.
#[cfg(feature = "embedded-adapters")]
pub fn execute_prepared_json_schema_wire_with_control(
    runtime: &PreparedJsonSchemaRuntime,
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    execute_json_schema_wire_inner(wire_json, control, Some(&runtime.runtime))
}

#[cfg(feature = "embedded-adapters")]
pub fn execute_prepared_json_schema_wire(
    runtime: &PreparedJsonSchemaRuntime,
    wire_json: &str,
) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_prepared_json_schema_wire_with_control(runtime, wire_json, &mut no_control)
}

#[cfg(feature = "embedded-adapters")]
fn execute_json_schema_wire_inner(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    runtime: Option<&umf_core::json_schema_adapter::JsonSchemaRuntime>,
) -> String {
    use umf_core::json_schema_adapter as schema;
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "profile").as_deref() != Some(JSON_SCHEMA_PROFILE) {
            return Err(fail(
                "REQUEST",
                "umf-r5-json-schema/0.1.0 profile is required",
            ));
        }
        let op = text_field(&request, "op")
            .ok_or_else(|| fail("REQUEST", "JSON Schema operation is required"))?;
        let document = || {
            field(&request, "document")
                .ok_or_else(|| fail("REQUEST", "JSON Schema document is required"))
        };
        let value = match op.as_str() {
            "importJsonSchema" => {
                let items = match field(&request, "resources") {
                    Some(Value::Array(items)) => items,
                    _ => {
                        return Err(fail(
                            "REQUEST",
                            "JSON Schema resources must be an explicit ordered array",
                        ));
                    }
                };
                ctx.charge_work(items.len(), Utf16::default())?;
                let mut resources = Vec::with_capacity(items.len());
                for item in items {
                    let uri = field(item, "uri")
                        .and_then(as_utf16)
                        .ok_or_else(|| fail("REQUEST", "JSON Schema resource URI is required"))?;
                    let resource_source =
                        field(item, "source").and_then(as_utf16).ok_or_else(|| {
                            fail("REQUEST", "JSON Schema resource source is required")
                        })?;
                    ctx.charge_work(
                        uri.len()
                            .saturating_add(resource_source.len())
                            .saturating_add(1),
                        Utf16::default(),
                    )?;
                    resources.push((uri.clone(), resource_source.units().to_vec()));
                }
                let source = field(&request, "source")
                    .and_then(as_utf16)
                    .ok_or_else(|| fail("REQUEST", "JSON Schema source is required"))?;
                let id = field(&request, "id")
                    .and_then(as_utf16)
                    .ok_or_else(|| fail("REQUEST", "JSON Schema id is required"))?;
                let base = field(&request, "baseUri")
                    .and_then(as_utf16)
                    .ok_or_else(|| fail("REQUEST", "JSON Schema base URI is required"))?;
                match runtime {
                    Some(runtime) => schema::import_json_schema_with_runtime(
                        source.units(),
                        id,
                        base,
                        &resources,
                        runtime,
                        &mut ctx,
                    )?,
                    None => {
                        schema::import_json_schema(source.units(), id, base, &resources, &mut ctx)?
                    }
                }
            }
            "inspectJsonSchema" => {
                let validation = match runtime {
                    Some(runtime) => {
                        schema::inspect_json_schema_with_runtime(document()?, runtime, &mut ctx)?
                    }
                    None => schema::inspect_json_schema(document()?, &mut ctx)?,
                };
                validation_value(validation)
            }
            "exportJsonSchema" => {
                let exported = match runtime {
                    Some(runtime) => {
                        schema::export_json_schema_with_runtime(document()?, runtime, &mut ctx)?
                    }
                    None => schema::export_json_schema(document()?, &mut ctx)?,
                };
                Value::String(exported)
            }
            "exportJsonSchemaResources" => Value::Array(
                match runtime {
                    Some(runtime) => schema::export_json_schema_resources_with_runtime(
                        document()?,
                        runtime,
                        &mut ctx,
                    )?,
                    None => schema::export_json_schema_resources(document()?, &mut ctx)?,
                }
                .into_iter()
                .map(|(uri, source)| {
                    object(vec![
                        ("uri", Value::String(uri)),
                        ("source", Value::String(source)),
                    ])
                })
                .collect(),
            ),
            "exportJsonSchemaBundle" => {
                let bundle = match runtime {
                    Some(runtime) => schema::export_json_schema_bundle_with_runtime(
                        document()?,
                        runtime,
                        &mut ctx,
                    )?,
                    None => schema::export_json_schema_bundle(document()?, &mut ctx)?,
                };
                object(vec![
                    ("root", Value::String(bundle.root_json)),
                    (
                        "resources",
                        Value::Array(
                            bundle
                                .resources_json
                                .into_iter()
                                .map(|(uri, source)| {
                                    object(vec![
                                        ("uri", Value::String(uri)),
                                        ("source", Value::String(source)),
                                    ])
                                })
                                .collect(),
                        ),
                    ),
                    ("source", bundle.source),
                    (
                        "diagnostics",
                        Value::Array(
                            bundle
                                .diagnostics
                                .into_iter()
                                .map(diagnostic_value)
                                .collect(),
                        ),
                    ),
                ])
            }
            "getJsonSchemaNode" => {
                let pointer = field(&request, "pointer")
                    .and_then(as_utf16)
                    .ok_or_else(|| fail("REQUEST", "JSON Schema pointer is required"))?;
                let node = match runtime {
                    Some(runtime) => schema::get_json_schema_node_with_runtime(
                        document()?,
                        pointer,
                        runtime,
                        &mut ctx,
                    )?,
                    None => schema::get_json_schema_node(document()?, pointer, &mut ctx)?,
                };
                node.tagged_value_preserving_extras(&mut ctx)?
            }
            "walkJsonSchema" => {
                let positions = match runtime {
                    Some(runtime) => {
                        schema::walk_json_schema_with_runtime(document()?, runtime, &mut ctx)?
                    }
                    None => schema::walk_json_schema(document()?, &mut ctx)?,
                };
                let mut output = Vec::with_capacity(positions.len());
                for position in positions {
                    output.push(object(vec![
                        ("pointer", Value::String(position.pointer)),
                        (
                            "node",
                            position.node.tagged_value_preserving_extras(&mut ctx)?,
                        ),
                    ]));
                }
                Value::Array(output)
            }
            "parseNativeJson" => {
                let source = field(&request, "source")
                    .and_then(as_utf16)
                    .ok_or_else(|| fail("REQUEST", "Native JSON source is required"))?;
                umf_core::native_json::NativeJsonTree::parse_json(source.units(), &mut ctx)?
                    .tagged_value_preserving_extras(&mut ctx)?
            }
            "editJsonSchemaNode" => {
                let pointer = field(&request, "pointer")
                    .and_then(as_utf16)
                    .ok_or_else(|| fail("REQUEST", "JSON Schema pointer is required"))?;
                let replacement = field(&request, "replacement")
                    .and_then(as_utf16)
                    .ok_or_else(|| fail("REQUEST", "JSON Schema replacement is required"))?;
                match runtime {
                    Some(runtime) => {
                        runtime.edit_node(document()?, pointer, replacement.units(), &mut ctx)?
                    }
                    None => schema::edit_node_with_embedded_registry(
                        document()?,
                        pointer,
                        replacement.units(),
                        &mut ctx,
                    )?,
                }
            }
            _ => return Err(fail("REQUEST", "Unknown JSON Schema operation")),
        };
        encode(&value, &mut ctx)
    })();
    result_envelope(result)
}

/// Exact opt-in capability identity shared by CLI, Node/Bun, WASM and Python.
pub const ICEBERG_SCHEMA_PROFILE: &str = "umf-r5-iceberg-schema/0.1.0";

/// Execute the standalone Iceberg 1.11 schema subset through pinned Rust
/// resources. The tagged wire carries UTF-16 strings and lossless document
/// values; host bindings never parse the native schema or replacement JSON.
#[cfg(feature = "embedded-adapters")]
pub fn execute_iceberg_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_iceberg_wire_with_control(wire_json, &mut no_control)
}

/// The caller's work hook covers wire admission, resource construction, the
/// selected operation, and result encoding under one fresh ordinary Context.
#[cfg(feature = "embedded-adapters")]
pub fn execute_iceberg_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        use umf_core::iceberg_schema::{
            IcebergSchemaResources, export_iceberg_schema, get_iceberg_node, import_iceberg_schema,
            inspect_iceberg, propose_iceberg_node_edit,
        };

        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        let op = field(&request, "op")
            .and_then(as_utf16)
            .and_then(|value| value.to_utf8().ok())
            .ok_or_else(|| fail("REQUEST", "Iceberg operation is required"))?;
        if !matches!(
            op.as_str(),
            "iceberg.schema.import"
                | "iceberg.schema.export"
                | "iceberg.schema.inspect"
                | "iceberg.schema.getNode"
                | "iceberg.schema.proposeNodeEdit"
        ) {
            return Err(fail("REQUEST", "Unknown Iceberg schema operation"));
        }
        let resources = IcebergSchemaResources::new(&mut ctx)?;
        let text = |name: &str| {
            field(&request, name)
                .and_then(as_utf16)
                .ok_or_else(|| fail("REQUEST", &format!("Iceberg {name} string is required")))
        };
        let document = || {
            field(&request, "document")
                .ok_or_else(|| fail("REQUEST", "Iceberg document is required"))
        };
        let value = match op.as_str() {
            "iceberg.schema.import" => {
                import_iceberg_schema(text("source")?.units(), text("id")?, &resources, &mut ctx)?
            }
            "iceberg.schema.export" => {
                Value::String(export_iceberg_schema(document()?, &resources, &mut ctx)?)
            }
            "iceberg.schema.inspect" => {
                validation_value(inspect_iceberg(document()?, &resources, &mut ctx)?)
            }
            "iceberg.schema.getNode" => {
                get_iceberg_node(document()?, text("pointer")?, &resources, &mut ctx)?
                    .tagged_value_preserving_extras(&mut ctx)?
            }
            "iceberg.schema.proposeNodeEdit" => {
                let (candidate, validation) = propose_iceberg_node_edit(
                    document()?,
                    text("pointer")?,
                    text("replacement")?.units(),
                    &resources,
                    &mut ctx,
                )?;
                object(vec![
                    ("document", candidate),
                    ("validation", validation_value(validation)),
                ])
            }
            _ => unreachable!("Iceberg operation was checked above"),
        };
        encode(&value, &mut ctx)
    })();
    result_envelope(result)
}

/// Exact opt-in identity for the bounded Protobuf descriptor inspector.
pub const PROTOBUF_INSPECT_PROFILE: &str = "umf-r5-protobuf-inspect/0.1.0";

/// Versioned opt-in Avro field metadata projection. This operation does not
/// parse Avro source text or activate the default Avro adapter.
pub const AVRO_FIELDS_PROFILE: &str = "umf-r5-avro-fields/0.1.0";

/// Versioned opt-in structural Avro schema inspection. This profile reports
/// only its explicit structural subset and never certifies Avro validity.
pub const AVRO_INSPECT_PROFILE: &str = "umf-r5-avro-inspect/0.1.0";

/// Versioned opt-in Avro candidate-edit operation. This does not activate the
/// default Avro adapter or claim native Avro validity.
#[cfg(feature = "embedded-adapters")]
pub const AVRO_CANDIDATE_PROFILE: &str = "umf-r5-avro-candidate/0.1.0";

pub fn execute_avro_fields_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_avro_fields_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_avro_fields_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        use umf_core::{
            avro_fields::{AvroDependency, derive_avro_fields},
            native_json::NativeJsonTree,
        };
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "op").as_deref() != Some("avro.fields.derive") {
            return Err(fail("REQUEST", "Unknown Avro fields operation"));
        }
        let root = NativeJsonTree::from_tagged_value(
            field(&request, "root").ok_or_else(|| fail("REQUEST", "Avro root is required"))?,
            &mut ctx,
        )?;
        let items = match field(&request, "dependencies") {
            None => &[][..],
            Some(Value::Array(items)) => items.as_slice(),
            _ => return Err(fail("REQUEST", "Avro dependencies must be an array")),
        };
        let mut owned = Vec::with_capacity(items.len());
        for item in items {
            let id = field(item, "id")
                .and_then(as_utf16)
                .cloned()
                .ok_or_else(|| fail("REQUEST", "Dependency id is required"))?;
            let tree = NativeJsonTree::from_tagged_value(
                field(item, "root")
                    .ok_or_else(|| fail("REQUEST", "Dependency root is required"))?,
                &mut ctx,
            )?;
            owned.push((id, tree));
        }
        let dependencies = owned
            .iter()
            .map(|(id, tree)| AvroDependency { id, root: tree })
            .collect::<Vec<_>>();
        let fields = derive_avro_fields(&root, &dependencies, &mut ctx)?;
        let mut output = Vec::with_capacity(fields.len());
        for field in fields {
            let native_field = field
                .native_field
                .tagged_value_preserving_extras(&mut ctx)?;
            let mut element = vec![
                ("id", Value::String(field.element_id)),
                ("name", Value::String(field.name)),
            ];
            if let Some(description) = field.description {
                element.push(("description", Value::String(description)));
            }
            if let Some(scalar) = field.scalar_type {
                element.push(("scalarType", Value::string_utf8(scalar.as_str())));
            }
            element.push(("extensions", Value::Object(Vec::new())));
            let mut item = vec![
                ("path", Value::String(field.path)),
                ("record", Value::String(field.record)),
                ("nativeField", native_field),
                (
                    "element",
                    Value::Object(
                        element
                            .into_iter()
                            .map(|(key, value)| (Utf16::from(key), value))
                            .collect(),
                    ),
                ),
            ];
            if let Some(id) = field.dependency_id {
                item.push(("dependencyId", Value::String(id)));
            }
            output.push(Value::Object(
                item.into_iter()
                    .map(|(key, value)| (Utf16::from(key), value))
                    .collect(),
            ));
        }
        encode(&Value::Array(output), &mut ctx)
    })();
    result_envelope(result)
}

/// Test-only tagged transport candidate for R8 Avro Record Type resolution.
/// This does not implement either TypeScript classification or recovery and
/// must not be treated as raw host read-order evidence.
pub fn execute_avro_record_type_candidate_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_avro_record_type_candidate_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_avro_record_type_candidate_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        use umf_core::{
            avro_fields::AvroDependency,
            avro_record_type_candidate::{Resolution, resolve_candidate},
            native_json::NativeJsonTree,
        };
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "op").as_deref() != Some("avro.recordType.resolveCandidate") {
            return Err(fail(
                "REQUEST",
                "Unknown Avro Record Type candidate operation",
            ));
        }
        let root = NativeJsonTree::from_tagged_value(
            field(&request, "root").ok_or_else(|| fail("REQUEST", "Avro root is required"))?,
            &mut ctx,
        )?;
        let rows = match field(&request, "dependencies") {
            None => &[][..],
            Some(Value::Array(rows)) => rows.as_slice(),
            _ => return Err(fail("REQUEST", "Dependencies must be an array")),
        };
        let mut owned = Vec::with_capacity(rows.len());
        for row in rows {
            let id = field(row, "id")
                .and_then(as_utf16)
                .cloned()
                .ok_or_else(|| fail("REQUEST", "Dependency id is required"))?;
            let root = NativeJsonTree::from_tagged_value(
                field(row, "root").ok_or_else(|| fail("REQUEST", "Dependency root is required"))?,
                &mut ctx,
            )?;
            owned.push((id, root));
        }
        let dependencies = owned
            .iter()
            .map(|(id, root)| AvroDependency { id, root })
            .collect::<Vec<_>>();
        let column = field(&request, "column")
            .and_then(as_utf16)
            .cloned()
            .ok_or_else(|| fail("REQUEST", "Column identity is required"))?;
        let candidate = resolve_candidate(&root, &dependencies, &column, &mut ctx)?;
        let resolution = match candidate.resolution {
            Resolution::Direct {
                fullname,
                path,
                dependency_id,
            } => vec![
                ("kind", Value::string_utf8("direct")),
                ("fullname", Value::String(fullname)),
                ("path", Value::String(path)),
                (
                    "dependencyId",
                    dependency_id.map_or(Value::Null, Value::String),
                ),
            ],
            Resolution::Qualified {
                fullname,
                path,
                dependency_id,
            } => vec![
                ("kind", Value::string_utf8("qualified")),
                ("fullname", Value::String(fullname)),
                ("path", Value::String(path)),
                (
                    "dependencyId",
                    dependency_id.map_or(Value::Null, Value::String),
                ),
            ],
            Resolution::Unsupported { reason } => vec![
                ("kind", Value::string_utf8("unsupported")),
                ("reason", Value::string_utf8(reason)),
            ],
            Resolution::Unresolved { fullname } => vec![
                ("kind", Value::string_utf8("unresolved")),
                ("fullname", Value::String(fullname)),
            ],
            Resolution::Ambiguous { fullname } => vec![
                ("kind", Value::string_utf8("ambiguous")),
                ("fullname", Value::String(fullname)),
            ],
        };
        let output = Value::Object(vec![
            (
                Utf16::from("profile"),
                Value::string_utf8("umf-r8-avro-record-type-candidate/0.1.0"),
            ),
            (
                Utf16::from("field"),
                Value::String(candidate.field.element_id),
            ),
            (Utf16::from("record"), Value::String(candidate.field.record)),
            (
                Utf16::from("resolution"),
                Value::Object(
                    resolution
                        .into_iter()
                        .map(|(k, v)| (Utf16::from(k), v))
                        .collect(),
                ),
            ),
            (Utf16::from("complete"), Value::Bool(false)),
        ]);
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

/// Inspect tagged Avro schema trees through the bounded structural profile.
/// Dependencies are caller-supplied and ordered; no I/O or parser is invoked.
pub fn execute_avro_inspect_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_avro_inspect_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_avro_inspect_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        use umf_core::{
            avro_semantics::{Dependency, inspect_schema},
            native_json::NativeJsonTree,
        };
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "op").as_deref() != Some("avro.schema.inspect") {
            return Err(fail("REQUEST", "Unknown Avro inspection operation"));
        }
        let root = NativeJsonTree::from_tagged_value(
            field(&request, "root").ok_or_else(|| fail("REQUEST", "Avro root is required"))?,
            &mut ctx,
        )?;
        let items = match field(&request, "dependencies") {
            None => &[][..],
            Some(Value::Array(items)) => items.as_slice(),
            _ => return Err(fail("REQUEST", "Avro dependencies must be an array")),
        };
        ctx.charge_work(items.len().saturating_add(1), Utf16::default())?;
        let mut owned = Vec::with_capacity(items.len());
        let mut seen_ids = std::collections::HashSet::<Vec<u16>>::new();
        for item in items {
            let id_ref = field(item, "id")
                .and_then(as_utf16)
                .ok_or_else(|| fail("REQUEST", "Dependency id is required"))?;
            ctx.charge_work(
                id_ref.len().saturating_mul(2).saturating_add(1),
                Utf16::default(),
            )?;
            if !seen_ids.insert(id_ref.units().to_vec()) {
                return Err(fail("AVRO_DEPENDENCY_ID", "Dependency IDs must be unique"));
            }
            let id = id_ref.clone();
            let tree = NativeJsonTree::from_tagged_value(
                field(item, "root")
                    .ok_or_else(|| fail("REQUEST", "Dependency root is required"))?,
                &mut ctx,
            )?;
            owned.push((id, tree));
        }
        let dependencies = owned
            .iter()
            .map(|(id, tree)| Dependency { id, tree })
            .collect::<Vec<_>>();
        let validation = inspect_schema(&root, &dependencies, &mut ctx)?;
        encode(&validation_value(validation), &mut ctx)
    })();
    result_envelope(result)
}

/// Propose a lossless node edit to an admitted Avro document through the
/// opt-in candidate profile. `replacementJson` remains source text until the
/// core parses it, preserving integer tokens beyond binary64 precision.
#[cfg(feature = "embedded-adapters")]
pub fn execute_avro_candidate_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_avro_candidate_wire_with_control(wire_json, &mut no_control)
}

#[cfg(feature = "embedded-adapters")]
pub fn execute_avro_candidate_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        if text_field(&request, "op").as_deref() != Some("avro.schema.proposeNodeEdit") {
            return Err(fail("REQUEST", "Unknown Avro candidate operation"));
        }
        let document = field(&request, "document")
            .ok_or_else(|| fail("REQUEST", "Avro document is required"))?;
        let path = field(&request, "path")
            .and_then(as_utf16)
            .ok_or_else(|| fail("REQUEST", "Avro candidate path is required"))?;
        let replacement = field(&request, "replacementJson")
            .and_then(as_utf16)
            .ok_or_else(|| fail("REQUEST", "Avro replacement JSON text is required"))?;
        let dependency_id = match field(&request, "dependencyId") {
            None => None,
            Some(Value::String(value)) => Some(value),
            Some(_) => return Err(fail("REQUEST", "Avro dependencyId must be text")),
        };
        let report = umf_core::avro_document::propose_avro_node_edit(
            document,
            path,
            replacement.units(),
            dependency_id,
            &mut ctx,
        )?;
        encode(&report, &mut ctx)
    })();
    result_envelope(result)
}

/// Inspect a UMF document through the Rust core and return its diagnostics in
/// the ordinary `umf.core-wire/1` result envelope. Admission, inspection, and
/// result encoding share one fresh cooperative context and caller control.
#[cfg(feature = "embedded-adapters")]
pub fn execute_protobuf_inspect_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_protobuf_inspect_wire_with_control(wire_json, &mut no_control)
}

#[cfg(feature = "embedded-adapters")]
pub fn execute_protobuf_inspect_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = decode(wire_json, &mut ctx)?;
        let op = text_field(&request, "op")
            .ok_or_else(|| fail("REQUEST", "Protobuf inspect operation is required"))?;
        if op != "protobuf.descriptor.inspect" {
            return Err(fail("REQUEST", "Unknown Protobuf inspect operation"));
        }
        let document = field(&request, "document")
            .ok_or_else(|| fail("REQUEST", "Protobuf document is required"))?;
        let validation = umf_core::protobuf_inspect::inspect_protobuf_document(document, &mut ctx)?;
        encode(&validation_value(validation), &mut ctx)
    })();
    result_envelope(result)
}

/// Execute one opt-in CONTRACT-049 numeric operation through the Rust core.
/// This separate profile does not change the R3 codegen protocol or ordinary
/// JSON number admission. A supplied context requires explicit core resources
/// and is validated against the current document and selected Field.
pub fn execute_javascript_numeric_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_javascript_numeric_wire_with_control(wire_json, &mut no_control)
}

pub fn execute_javascript_numeric_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let request = {
            let mut transport = transport_context().with_host_control(control);
            decode(wire_json, &mut transport)?
        };
        if text_field(&request, "profile").as_deref() != Some("umf.javascript-numeric/1.0.0") {
            return Err(fail("REQUEST", "JavaScript numeric profile is required"));
        }
        let operation = text_field(&request, "op")
            .ok_or_else(|| fail("REQUEST", "JavaScript numeric operation is required"))?;
        let (literal, output) = {
            let mut operation_context = Context::ordinary().with_host_control(control);
            match operation.as_str() {
                "exactDecimal" => {
                    let token = string_field(&request, "token")?;
                    let token = umf_core::javascript_numeric::exact_decimal(
                        &token,
                        &mut operation_context,
                    )?;
                    let literal = numeric_carrier("decimalToken", &token);
                    (literal.clone(), literal)
                }
                "integerFromBigInt" => {
                    let token = string_field(&request, "token")?;
                    let token = umf_core::javascript_numeric::integer_from_bigint(
                        &token,
                        &mut operation_context,
                    )?;
                    let literal = numeric_carrier("integerToken", &token);
                    (literal.clone(), literal)
                }
                "integerToBigInt" => {
                    let token = carrier_field(&request, "integerToken")?;
                    let integer = umf_core::javascript_numeric::integer_to_bigint(
                        &token,
                        &mut operation_context,
                    )?;
                    (
                        numeric_carrier("integerToken", &token),
                        Value::String(Utf16::from(integer)),
                    )
                }
                "admitJavascriptNumber" => {
                    let bits = string_field(&request, "numberBits")?;
                    if bits.len() != 16 || !bits.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                        return Err(fail("JAVASCRIPT_NUMERIC", "Expected binary64 bit pattern"));
                    }
                    let bits = u64::from_str_radix(&bits, 16)
                        .map_err(|_| fail("JAVASCRIPT_NUMERIC", "Expected binary64 bit pattern"))?;
                    let number = f64::from_bits(bits);
                    let scalar_type = string_field(&request, "scalarType")?;
                    let token = umf_core::javascript_numeric::admit_javascript_number(
                        number,
                        &scalar_type,
                        &mut operation_context,
                    )?;
                    let carrier = if scalar_type == "integer" {
                        "integerToken"
                    } else {
                        "decimalToken"
                    };
                    let literal = numeric_carrier(carrier, &token);
                    (literal.clone(), literal)
                }
                "numericToNumberLossless" => {
                    let (carrier, token) = numeric_literal_field(&request)?;
                    let number = umf_core::javascript_numeric::numeric_to_number_lossless(
                        &token,
                        carrier == "integerToken",
                        &mut operation_context,
                    )?;
                    (numeric_carrier(carrier, &token), Value::Number(number))
                }
                _ => return Err(fail("REQUEST", "Unknown JavaScript numeric operation")),
            }
        };

        if let Some(context) = field(&request, "context") {
            let resources = field(&request, "resources").ok_or_else(|| {
                fail(
                    "REQUEST",
                    "Explicit resources are required for Field context",
                )
            })?;
            let engine = {
                let mut catalog = Context::catalog().with_host_control(control);
                Engine::new(
                    ResourceSet::new(
                        required_field(resources, "coreSchema")?,
                        required_field(resources, "referenceSchema")?,
                        required_field(resources, "packageSchema")?,
                        required_field(resources, "constraints")?,
                        required_field(resources, "domainPolicy")?,
                    ),
                    &mut catalog,
                )?
            };
            let document = required_field(context, "document")?;
            let field_context = required_field(context, "field")?;
            let module_id = string_field(&field_context, "module")?;
            let element_id = string_field(&field_context, "element")?;
            let registry = Registry::new();
            let mut capabilities = NumericNoCapabilities;
            let validation = {
                let mut operation_context = Context::ordinary().with_host_control(control);
                engine.validate_core_field_value(
                    &document,
                    &module_id,
                    &element_id,
                    &literal,
                    &registry,
                    &mut capabilities,
                    &mut operation_context,
                )?
            };
            let validation = validation_value(validation);
            let mut operation_context = Context::ordinary().with_host_control(control);
            return encode(
                &object(vec![("result", output), ("validation", validation)]),
                &mut operation_context,
            );
        }
        let mut operation_context = Context::ordinary().with_host_control(control);
        encode(&output, &mut operation_context)
    })();
    result_envelope(result)
}

struct NumericNoCapabilities;
impl Capabilities for NumericNoCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &umf_core::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Err(Utf16::from(
            "No extension callback is installed for numeric context validation",
        ))
    }
}

fn text_field(value: &Value, name: &str) -> Option<String> {
    field(value, name)
        .and_then(as_utf16)
        .and_then(|value| value.to_utf8().ok())
}

fn string_field(value: &Value, name: &str) -> Result<String, EngineError> {
    let value = field(value, name)
        .and_then(as_utf16)
        .ok_or_else(|| fail("REQUEST", "Required text value is missing"))?;
    value
        .to_utf8()
        .map_err(|_| fail("REQUEST", "Text must contain well-formed UTF-16"))
}

fn required_field(value: &Value, name: &str) -> Result<Value, EngineError> {
    field(value, name)
        .cloned()
        .ok_or_else(|| fail("REQUEST", "Explicit resource or context member is required"))
}

fn numeric_carrier(name: &str, token: &str) -> Value {
    object(vec![(name, Value::String(Utf16::from(token)))])
}

fn carrier_field(request: &Value, carrier: &str) -> Result<String, EngineError> {
    let literal = field(request, "literal")
        .ok_or_else(|| fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"))?;
    let Value::Object(members) = literal else {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"));
    };
    if members.len() != 1 || members[0].0 != Utf16::from(carrier) {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"));
    }
    let Value::String(token) = &members[0].1 else {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected numeric token text"));
    };
    token
        .to_utf8()
        .map_err(|_| fail("JAVASCRIPT_NUMERIC", "Expected numeric token text"))
}

fn numeric_literal_field(request: &Value) -> Result<(&'static str, String), EngineError> {
    let literal = field(request, "literal")
        .ok_or_else(|| fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"))?;
    let Value::Object(members) = literal else {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"));
    };
    if members.len() != 1 {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"));
    }
    let carrier = match members[0].0.to_utf8().ok().as_deref() {
        Some("integerToken") => "integerToken",
        Some("decimalToken") => "decimalToken",
        _ => {
            return Err(fail(
                "JAVASCRIPT_NUMERIC",
                "Expected integerToken or decimalToken",
            ));
        }
    };
    let Value::String(token) = &members[0].1 else {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected numeric token text"));
    };
    let token = token
        .to_utf8()
        .map_err(|_| fail("JAVASCRIPT_NUMERIC", "Expected numeric token text"))?;
    Ok((carrier, token))
}

/// Execute the shared production engine request protocol. Each request uses a
/// catalog context for explicit resource/registry admission and a fresh
/// ordinary context for the document operation. Host callbacks remain supplied
/// by the trusted binding caller; document data never selects executable code.
pub fn execute_request(
    wire_json: &str,
    profile: ResourceProfile,
    capabilities: &mut dyn Capabilities,
) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_request_with_control(wire_json, profile, capabilities, &mut no_control)
}

/// Execute using an explicit binding-owned cooperative work hook. The hook is
/// polled for each charged work unit during decode, resource admission,
/// document work, callbacks, and result encoding. It is never read from wire.
/// For codegen routes, the hook now observes one cumulative operation context
/// across those phases. This intentionally closes the prior split-context gap
/// (decode, compiled-resource admission, and result transport used separate
/// counters); callers should expect bounded outcomes at the cumulative budget.
pub fn execute_request_with_control(
    wire_json: &str,
    profile: ResourceProfile,
    capabilities: &mut dyn Capabilities,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    execute_request_with_engine_and_control(wire_json, profile, capabilities, control, None)
}

/// Private opt-in variant that reuses a caller-owned Engine while preserving
/// the ordinary request decoder, registry admission, callbacks, and contexts.
/// The request still carries its five resources as an exact identity witness;
/// they are validated structurally and discarded before registry admission.
pub fn execute_request_with_engine_and_control(
    wire_json: &str,
    profile: ResourceProfile,
    capabilities: &mut dyn Capabilities,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    retained_engine: Option<&Engine>,
) -> String {
    if profile == ResourceProfile::HardIsolated {
        return error_envelope(EngineError::new(
            "RESOURCE_PROFILE_UNAVAILABLE",
            Utf16::default(),
            "HardIsolated resource profile is unavailable",
        ));
    }
    let result = execute_request_inner(wire_json, capabilities, control, retained_engine);
    result_envelope(result)
}

/// Execute the closed synchronous V3 codegen host-read route. The callback is
/// supplied by the binding and is never selected or populated from the wire.
#[cfg(feature = "codegen")]
pub fn execute_codegen_host_read_v3_wire_with_control(
    wire_json: &str,
    profile: ResourceProfile,
    host_read: &mut dyn umf_codegen::generation::PythonClientHostReadV3,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    if profile == ResourceProfile::HardIsolated {
        return error_envelope(EngineError::new(
            "RESOURCE_PROFILE_UNAVAILABLE",
            Utf16::default(),
            "HardIsolated resource profile is unavailable",
        ));
    }
    let result = execute_codegen_host_read_v3_inner(wire_json, host_read, control);
    result_envelope(result)
}

#[cfg(feature = "codegen")]
fn execute_codegen_host_read_v3_inner(
    wire_json: &str,
    host_read: &mut dyn umf_codegen::generation::PythonClientHostReadV3,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> Result<String, EngineError> {
    let mut context = Context::ordinary().with_host_control(control);
    let mut request = context.with_tagged_transport_limit(|ctx| decode(wire_json, ctx))?;
    let operation = field(&request, "op")
        .and_then(as_utf16)
        .and_then(|value| value.to_utf8().ok())
        .ok_or_else(|| fail("REQUEST", "Request op is required"))?;
    if operation != "codegen/generatePythonClientHostV3" {
        return Err(fail("REQUEST", "Unknown codegen host-read operation"));
    }
    codegen::execute_host_read_v3(&mut request, host_read, &mut context)
}

fn execute_request_inner(
    wire_json: &str,
    capabilities: &mut dyn Capabilities,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    retained_engine: Option<&Engine>,
) -> Result<String, EngineError> {
    // The outer request/result envelope adds transport tags and wrapper
    // members around independently bounded catalog resources and an ordinary
    // document. Its limits must not narrow either semantic admission profile.
    let mut operation_context = Context::ordinary().with_host_control(control);
    let mut request =
        operation_context.with_tagged_transport_limit(|ctx| decode(wire_json, ctx))?;
    let op = field(&request, "op")
        .and_then(as_utf16)
        .and_then(|v| v.to_utf8().ok())
        .ok_or_else(|| fail("REQUEST", "Request op is required"))?;
    if op == "model/inspectCoreRecordMembers"
        && (!has_exact_members(
            &request,
            &["op", "resources", "registry", "source", "identity"],
        ) || !matches!(field(&request, "registry"), Some(Value::Array(items)) if items.is_empty())
            || !field(&request, "resources").is_some_and(|resources| {
                has_exact_members(
                    resources,
                    &[
                        "coreSchema",
                        "referenceSchema",
                        "packageSchema",
                        "constraints",
                        "domainPolicy",
                    ],
                )
            }))
    {
        return Err(fail(
            "REQUEST",
            "Closed record-members request and exact five-resource set required",
        ));
    }
    if (op == "model/declareCoreRecordType"
        && (!(has_exact_members(
            &request,
            &["op", "resources", "fieldAuthor", "recordAuthor"],
        ) || (has_exact_members(
            &request,
            &["op", "resources", "registry", "fieldAuthor", "recordAuthor"],
        ) && matches!(field(&request, "registry"), Some(Value::Array(items)) if items.is_empty())))
            || !field(&request, "resources").is_some_and(|resources| {
                has_exact_members(
                    resources,
                    &[
                        "coreSchema",
                        "referenceSchema",
                        "packageSchema",
                        "constraints",
                        "domainPolicy",
                    ],
                )
            })))
        || (op == "model/verifyCoreRecordTypeDeclaration"
            && (!(has_exact_members(&request, &["op", "resources", "receipt", "current"])
                || (has_exact_members(
                    &request,
                    &["op", "resources", "registry", "receipt", "current"],
                ) && matches!(field(&request, "registry"), Some(Value::Array(items)) if items.is_empty())))
                || !field(&request, "resources").is_some_and(|resources| {
                    has_exact_members(
                        resources,
                        &[
                            "coreSchema",
                            "referenceSchema",
                            "packageSchema",
                            "constraints",
                            "domainPolicy",
                        ],
                    )
                })))
    {
        return Err(fail(
            "REQUEST",
            "Closed Record Type request and exact five-resource set required",
        ));
    }
    // Codegen deliberately retains operation_context through catalog
    // admission, invocation, and output encoding so the host's per-call
    // work/deadline/cancellation controls cover the complete request.
    #[cfg(feature = "codegen")]
    if let Some(operation) = op.strip_prefix("codegen/") {
        return codegen::execute(operation, &mut request, &mut operation_context);
    }
    let mut resources = take_field(&mut request, "resources")
        .ok_or_else(|| fail("REQUEST", "Explicit resources are required"))?;
    if let Some(engine) = retained_engine {
        if !has_exact_members(
            &resources,
            &["coreSchema", "referenceSchema", "packageSchema", "constraints", "domainPolicy"],
        ) || !engine.matches_resource_values(
            field(&resources, "coreSchema").unwrap_or(&Value::Null),
            field(&resources, "referenceSchema").unwrap_or(&Value::Null),
            field(&resources, "packageSchema").unwrap_or(&Value::Null),
            field(&resources, "constraints").unwrap_or(&Value::Null),
            field(&resources, "domainPolicy").unwrap_or(&Value::Null),
        ) {
            return Err(fail("REQUEST", "Retained model resources do not match the admitted runtime"));
        }
    }
    let registry_value = take_field(&mut request, "registry");
    let mut operation = Context::ordinary().with_host_control(control);
    let mut owned_engine: Option<Engine> = None;
    let registry = operation.with_catalog_value_limit(|catalog| {
        let resource = |resources: &mut Value, name: &str| {
            take_field(resources, name).ok_or_else(|| {
                EngineError::new(
                    "REQUEST",
                    Utf16::from(name),
                    "Explicit resource is required",
                )
            })
        };
        if retained_engine.is_none() {
            owned_engine = Some(Engine::new(
                ResourceSet::new(
                    resource(&mut resources, "coreSchema")?,
                    resource(&mut resources, "referenceSchema")?,
                    resource(&mut resources, "packageSchema")?,
                    resource(&mut resources, "constraints")?,
                    resource(&mut resources, "domainPolicy")?,
                ),
                catalog,
            )?);
        }
        let engine = retained_engine.or(owned_engine.as_ref()).expect("engine selected");
        let mut registry = engine.registry(catalog)?;
        if let Some(Value::Array(extensions)) = registry_value {
            let schema_resources = engine.schema_resources_with_context(catalog)?;
            for (index, mut extension) in extensions.into_iter().enumerate() {
                if let Some(manifest) = take_field(&mut extension, "manifest") {
                    if let Value::Object(fields) = &extension {
                        if fields.iter().any(|(key, _)| {
                            key != &Utf16::from("semantic") && key != &Utf16::from("kinds")
                        }) {
                            return Err(fail(
                                "REQUEST",
                                "Full manifest and legacy registration fields cannot be mixed",
                            ));
                        }
                    }
                    let semantic = match take_field(&mut extension, "semantic") {
                        None | Some(Value::Bool(false)) => false,
                        Some(Value::Bool(true)) => true,
                        _ => return Err(fail("REQUEST", "semantic must be a boolean")),
                    };
                    let kinds = match take_field(&mut extension, "kinds") {
                        None | Some(Value::Bool(false)) => false,
                        Some(Value::Bool(true)) => true,
                        _ => return Err(fail("REQUEST", "kinds must be a boolean")),
                    };
                    if kinds {
                        registry.register_kind_package(
                            &manifest,
                            semantic.then_some(index as u64 + 1),
                            engine.package_schema(),
                            &schema_resources,
                            catalog,
                        )?;
                    } else {
                        registry.register(
                            &manifest,
                            semantic.then_some(index as u64 + 1),
                            engine.package_schema(),
                            &schema_resources,
                            catalog,
                        )?;
                    }
                    continue;
                }
                let id = take_field(&mut extension, "id")
                    .and_then(|v| match v {
                        Value::String(text) => Some(text),
                        _ => None,
                    })
                    .ok_or_else(|| fail("REQUEST", "Registry id must be a string"))?;
                let version = take_field(&mut extension, "version")
                    .and_then(|v| match v {
                        Value::String(text) => Some(text),
                        _ => None,
                    })
                    .ok_or_else(|| fail("REQUEST", "Registry version must be a string"))?;
                let scopes =
                    if let Some(Value::Array(scopes)) = take_field(&mut extension, "scopes") {
                        scopes
                            .into_iter()
                            .map(|scope| match scope {
                                Value::String(value) => Ok(value),
                                _ => Err(fail("REQUEST", "Registry scopes must be strings")),
                            })
                            .collect::<Result<Vec<_>, _>>()?
                    } else if let Some(Value::String(scope)) = take_field(&mut extension, "scope") {
                        vec![scope]
                    } else {
                        return Err(fail("REQUEST", "Registry scopes are required"));
                    };
                let schema = take_field(&mut extension, "schema").unwrap_or(Value::Bool(true));
                let semantic = matches!(
                    take_field(&mut extension, "semantic"),
                    Some(Value::Bool(true))
                );
                let token = semantic.then_some((index as u64) + 1);
                registry.register_extension_owned(
                    id,
                    version,
                    scopes,
                    schema,
                    semantic,
                    token,
                    engine.package_schema(),
                    &schema_resources,
                    catalog,
                )?;
            }
        }
        Ok::<_, EngineError>(registry)
    })?;
    let engine = retained_engine.or(owned_engine.as_ref()).expect("engine selected");
    let value = {
        match op.as_str() {
            "model/inspectCoreCardinality"
            | "model/declareCoreCardinality"
            | "model/verifyCoreCardinalityDeclaration"
            | "model/admitCoreCardinalityRequest"
            | "model/prepareCoreCardinalityVerification"
            | "model/finishCoreCardinalityVerification"
            | "model/inspectCoreKind"
            | "model/inspectCoreScalarType"
            | "model/inspectCoreRecordMembers"
            | "model/inspectCoreReferenceLinks"
            | "model/declareCoreKind"
            | "model/verifyCoreKindDeclaration"
            | "model/declareCoreRecordType"
            | "model/verifyCoreRecordTypeDeclaration"
            | "model/inspectCoreNullability"
            | "model/declareCoreNullability"
            | "model/verifyCoreNullabilityDeclaration"
            | "model/selectCoreElements"
            | "model/selectCoreRelationships"
            | "model/validateCoreFieldValue"
            | "model/validateCoreRecordValues"
            | "model/validateCoreDatasetValues"
            | "model/verifyCoreDatasetValues"
            | "model/validateCoreDatasetValuesCompact"
            | "model/verifyCoreDatasetValuesCompact"
            | "model/prepareCoreDatasetValuesCompactVerification"
            | "model/inspectCoreKeys"
            | "model/lookupCoreKey"
            | "model/admitCoreKeyIdentity"
            | "model/admitCoreKeyRequest"
            | "model/admitCoreKeyMemberRequest"
            | "model/prepareCoreKeyVerification"
            | "model/declareCoreRecordMembers"
            | "model/declareCoreKey"
            | "model/verifyCoreKeyOperation"
            | "model/encodeCoreKeyTuple"
            | "model/verifyCoreKeyTuple"
            | "model/readCoreKeyTupleBytes"
            | "model/prepareCoreKeyTuples"
            | "model/encodePreparedCoreKeyTuple"
            | "model/verifyPreparedCoreKeyTuple"
            | "model/validateCsvBooleanLexical"
            | "model/verifyCsvBooleanLexical"
            | "model/prepareCsvBooleanLexicalVerification"
            | "model/finishCsvBooleanLexicalVerification"
            | "model/resolveCoreDefault"
            | "model/inspectCoreSchemaProperties"
            | "model/declareCoreSchemaProperties"
            | "model/inspectCoreFacets"
            | "model/declareCoreFacets"
            | "model/verifyCoreFacetDeclaration"
            | "model/admitCoreFacetRequest"
            | "model/prepareCoreFacetVerification"
            | "model/finishCoreFacetVerification"
            | "model/inspectCoreRelationships"
            | "model/lookupCoreRelationship"
            | "model/declareCoreRelationship"
            | "model/verifyCoreRelationshipOperation"
            | "model/admitCoreRelationshipLookupIdentity"
            | "model/admitCoreRelationshipRequest"
            | "model/prepareCoreRelationshipVerification"
            | "model/finishCoreRelationshipVerification"
            | "model/inspectCoreSemanticTypes"
            | "model/getCoreSemanticTypes"
            | "model/declareCoreSemanticTypes"
            | "model/verifyCoreSemanticTypeDeclaration"
            | "model/inspectCoreEvolution"
            | "model/verifyCoreEvolution"
            | "extensions/getSemanticTypes"
            | "extensions/setSemanticTypes"
            | "model/historicalCoreFacetPatch" => model_operation(
                &op,
                &request,
                &engine,
                &registry,
                capabilities,
                &mut operation,
            )?,
            "list-kinds" => registry.list_kinds(&mut operation)?,
            "get-kind" => registry
                .get_kind(
                    field(&request, "reference").unwrap_or(&Value::Null),
                    &mut operation,
                )?
                .unwrap_or(Value::Null),
            "inspect-kinds" => engine.inspect_extension_kinds(
                field(&request, "document")
                    .ok_or_else(|| fail("REQUEST", "Document is required"))?,
                &registry,
                capabilities,
                &mut operation,
            )?,
            "validate" => {
                let document = field(&request, "document")
                    .ok_or_else(|| fail("REQUEST", "Document is required"))?;
                validation_value(engine.validate_document(
                    document,
                    &registry,
                    capabilities,
                    &mut operation,
                )?)
            }
            "read" => {
                let source = field(&request, "source")
                    .and_then(as_utf16)
                    .ok_or_else(|| fail("REQUEST", "Source must be a string"))?;
                let document = umf_core::document::read_document(
                    source.units(),
                    format_field(&request)?,
                    &engine,
                    &registry,
                    capabilities,
                    &mut operation,
                )?;
                object(vec![("document", document)])
            }
            "write" => {
                let document = field(&request, "document")
                    .ok_or_else(|| fail("REQUEST", "Document is required"))?;
                let source = umf_core::document::write_document(
                    document,
                    format_field(&request)?,
                    &engine,
                    &registry,
                    capabilities,
                    &mut operation,
                )?;
                object(vec![("source", Value::String(source))])
            }
            _ => return Err(fail("REQUEST", "Unknown core operation")),
        }
    };
    let mut transport = transport_context().with_host_control(control);
    encode(&value, &mut transport)
}

fn model_operation(
    op: &str,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let value = |name: &str| {
        field(request, name).ok_or_else(|| fail("REQUEST", &format!("{name} is required")))
    };
    let identity = || -> Result<(Utf16, Utf16), EngineError> {
        let id = value("identity")?;
        let module = field(id, "module")
            .and_then(as_utf16)
            .cloned()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| fail("REQUEST", "identity.module must be a nonempty string"))?;
        let element = field(id, "element")
            .and_then(as_utf16)
            .cloned()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| fail("REQUEST", "identity.element must be a nonempty string"))?;
        Ok((module, element))
    };
    // The TypeScript cardinality API copies the whole identity first, then
    // validates its exact two-member shape. Keep its domain error distinct
    // from generic tagged-request admission for this operation family.
    let cardinality_identity = || -> Result<(Utf16, Utf16), EngineError> {
        let invalid = || {
            fail(
                "CORE_CARDINALITY_IDENTITY",
                "Expected explicit module and element identities",
            )
        };
        let id = field(request, "identity").ok_or_else(invalid)?;
        let Value::Object(fields) = id else {
            return Err(invalid());
        };
        if fields.len() != 2
            || fields.iter().any(|(key, _)| {
                key != &Utf16::from_utf8("module") && key != &Utf16::from_utf8("element")
            })
        {
            return Err(invalid());
        }
        let module = field(id, "module")
            .and_then(as_utf16)
            .cloned()
            .filter(|s| !s.is_empty())
            .ok_or_else(invalid)?;
        let element = field(id, "element")
            .and_then(as_utf16)
            .cloned()
            .filter(|s| !s.is_empty())
            .ok_or_else(invalid)?;
        Ok((module, element))
    };
    let result = match op {
        "model/validateCoreFieldValue" => {
            validation_value(engine.validate_core_field_value_public(
                value("source")?,
                value("field")?,
                value("value")?,
                ctx,
            )?)
        }
        "model/validateCoreRecordValues" => umf_core::record_values::validate_core_record_values(
            engine,
            value("source")?,
            value("identity")?,
            value("values")?,
            ctx,
        )?,
        "model/validateCoreDatasetValues" => {
            umf_core::dataset_values::validate_core_dataset_values(
                value("source")?,
                value("input")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/verifyCoreDatasetValues" => umf_core::dataset_values::verify_core_dataset_values(
            value("receipt")?,
            value("current")?,
            value("expectedInput")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/validateCoreDatasetValuesCompact" => {
            umf_core::dataset_values::validate_core_dataset_values_compact(
                value("source")?,
                value("input")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/verifyCoreDatasetValuesCompact" => {
            umf_core::dataset_values::verify_core_dataset_values_compact(
                value("receipt")?,
                value("current")?,
                value("expectedInput")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/prepareCoreDatasetValuesCompactVerification" => {
            umf_core::dataset_values::prepare_core_dataset_values_compact_verification(
                value("receipt")?,
                engine,
                ctx,
            )?
        }
        "model/inspectCoreKeys" => umf_core::core_keys::inspect_core_keys(
            value("source")?,
            value("identity")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/lookupCoreKey" => umf_core::core_keys::lookup_core_key(
            value("source")?,
            value("identity")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/admitCoreKeyIdentity" => {
            umf_core::core_keys::admit_core_key_identity(value("identity")?, ctx)?
        }
        "model/admitCoreKeyRequest" => {
            umf_core::core_keys::admit_core_key_request(value("request")?, ctx)?
        }
        "model/admitCoreKeyMemberRequest" => {
            umf_core::core_keys::admit_core_key_member_request(value("request")?, ctx)?
        }
        "model/prepareCoreKeyVerification" => umf_core::core_keys::prepare_core_key_verification(
            value("receipt")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/declareCoreRecordMembers" => umf_core::core_keys::declare_core_record_members(
            value("source")?,
            value("identity")?,
            value("request")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/declareCoreKey" => umf_core::core_keys::declare_core_key(
            value("source")?,
            value("identity")?,
            value("request")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/verifyCoreKeyOperation" => umf_core::core_keys::verify_core_key_operation(
            value("receipt")?,
            value("current")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/encodeCoreKeyTuple" => {
            let profile = key_tuple_profile(field(request, "options"));
            umf_core::core_key_tuple::encode_core_key_tuple(
                value("source")?,
                value("identity")?,
                value("values")?,
                profile.as_deref(),
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/verifyCoreKeyTuple" => umf_core::core_key_tuple::verify_core_key_tuple(
            value("receipt")?,
            value("current")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/readCoreKeyTupleBytes" => {
            let bytes = umf_core::core_key_tuple::read_core_key_tuple_bytes(
                value("receipt")?,
                value("current")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?;
            if bytes.len() > ctx.limits().max_values {
                return Err(EngineError::new(
                    "LIMIT",
                    Utf16::from("/bytes"),
                    "Tuple byte result exceeds the bounded wire value limit",
                ));
            }
            ctx.charge_work(bytes.len(), Utf16::from("/bytes"))?;
            let mut values = Vec::new();
            values.try_reserve_exact(bytes.len()).map_err(|_| {
                EngineError::new(
                    "LIMIT",
                    Utf16::from("/bytes"),
                    "Tuple byte result exceeds available allocation",
                )
            })?;
            values.extend(bytes.into_iter().map(|byte| Value::Number(f64::from(byte))));
            Value::Array(values)
        }
        "model/prepareCoreKeyTuples" => {
            let prepared = umf_core::core_key_tuple::prepare_core_key_tuples(
                value("source")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?;
            prepared.into_source()
        }
        "model/encodePreparedCoreKeyTuple" => {
            let prepared = umf_core::core_key_tuple::prepare_core_key_tuples(
                value("source")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?;
            prepared.encode(
                value("identity")?,
                value("values")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/verifyPreparedCoreKeyTuple" => {
            let prepared = umf_core::core_key_tuple::prepare_core_key_tuples(
                value("source")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?;
            prepared.verify(value("receipt")?, engine, registry, capabilities, ctx)?
        }
        "model/validateCsvBooleanLexical" => {
            umf_core::csv_boolean_lexical::validate_csv_boolean_lexical(
                value("source")?,
                value("csvRequest")?,
                engine,
                ctx,
            )?
        }
        "model/verifyCsvBooleanLexical" => {
            umf_core::csv_boolean_lexical::verify_csv_boolean_lexical(
                value("receipt")?,
                value("source")?,
                value("csvRequest")?,
                engine,
                ctx,
            )?
        }
        "model/prepareCsvBooleanLexicalVerification" => {
            umf_core::csv_boolean_lexical::prepare_csv_boolean_lexical_verification(
                value("receipt")?,
                engine,
                ctx,
            )?
        }
        "model/finishCsvBooleanLexicalVerification" => {
            umf_core::csv_boolean_lexical::finish_csv_boolean_lexical_verification(
                value("preparedReceipt")?,
                value("source")?,
                value("csvRequest")?,
                engine,
                ctx,
            )?
        }
        "model/resolveCoreDefault" => engine.resolve_core_default_public(
            value("source")?,
            value("field")?,
            value("state")?,
            ctx,
        )?,
        "model/inspectCoreSchemaProperties" => {
            umf_core::schema_properties::inspect_core_schema_properties(
                value("source")?,
                value("identity")?,
                engine,
                ctx,
            )?
        }
        "model/declareCoreSchemaProperties" => {
            umf_core::schema_properties::declare_core_schema_properties(
                value("source")?,
                value("identity")?,
                value("patch")?,
                engine,
                ctx,
            )?
        }
        "model/inspectCoreFacets" => umf_core::facets::inspect_core_facets(
            value("source")?,
            value("identity")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/declareCoreFacets" => umf_core::facets::declare_core_facets(
            value("source")?,
            value("identity")?,
            value("request")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/verifyCoreFacetDeclaration" => umf_core::facets::verify_core_facet_declaration(
            value("receipt")?,
            value("current")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/admitCoreFacetRequest" => {
            umf_core::facets::admit_core_facet_request(value("request")?, engine, ctx)?
        }
        "model/prepareCoreFacetVerification" => umf_core::facets::prepare_core_facet_verification(
            value("receipt")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/finishCoreFacetVerification" => umf_core::facets::finish_core_facet_verification(
            value("prepared")?,
            value("current")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/inspectCoreRelationships" => {
            umf_core::core_relationships::inspect_core_relationships(
                value("source")?,
                value("identity")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/lookupCoreRelationship" => umf_core::core_relationships::lookup_core_relationship(
            value("source")?,
            value("identity")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/declareCoreRelationship" => umf_core::core_relationships::declare_core_relationship(
            value("source")?,
            value("identity")?,
            value("request")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/verifyCoreRelationshipOperation" => {
            umf_core::core_relationships::verify_core_relationship_operation(
                value("receipt")?,
                value("current")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/admitCoreRelationshipLookupIdentity" => {
            umf_core::core_relationships::admit_core_relationship_lookup_identity(
                value("identity")?,
                engine,
                ctx,
            )?
        }
        "model/admitCoreRelationshipRequest" => {
            umf_core::core_relationships::admit_core_relationship_request(
                value("request")?,
                engine,
                ctx,
            )?
        }
        "model/prepareCoreRelationshipVerification" => {
            umf_core::core_relationships::prepare_core_relationship_verification(
                value("receipt")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/finishCoreRelationshipVerification" => {
            umf_core::core_relationships::finish_core_relationship_verification(
                value("prepared")?,
                value("current")?,
                ctx,
            )?
        }
        "model/historicalCoreFacetPatch" => {
            umf_core::facets::historical_core_facet_patch(value("input")?, engine, ctx)?
        }
        "model/inspectCoreSemanticTypes" => {
            umf_core::core_semantic_types::inspect_core_semantic_types(
                value("source")?,
                value("identity")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/getCoreSemanticTypes" => umf_core::core_semantic_types::get_core_semantic_types(
            value("source")?,
            value("identity")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?
        .unwrap_or_else(|| object(vec![("$umf", Value::string_utf8("undefined"))])),
        "model/declareCoreSemanticTypes" => {
            let types = field(request, "types")
                .ok_or_else(|| fail("NON_JSON", "Value is not JSON-compatible"))?;
            umf_core::core_semantic_types::declare_core_semantic_types(
                value("source")?,
                value("identity")?,
                types,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/verifyCoreSemanticTypeDeclaration" => {
            umf_core::core_semantic_types::verify_core_semantic_type_declaration(
                value("receipt")?,
                value("current")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/inspectCoreEvolution" => umf_core::core_evolution::inspect_core_evolution(
            engine,
            value("before")?,
            value("after")?,
            value("policy")?,
            ctx,
        )?,
        "model/verifyCoreEvolution" => umf_core::core_evolution::verify_core_evolution(
            value("receipt")?,
            value("before")?,
            value("after")?,
            value("policy")?,
            engine,
            ctx,
        )?,
        "extensions/getSemanticTypes" => {
            // The TS extension accessor does no runtime type guard on these
            // identity arguments: non-strings simply fail strict ID matching
            // after profile/document validation. Valid documents cannot have
            // an empty module/element id, so empty units preserve that result.
            let module = field(request, "module")
                .and_then(as_utf16)
                .cloned()
                .unwrap_or_default();
            let element = field(request, "element")
                .and_then(as_utf16)
                .cloned()
                .unwrap_or_default();
            umf_core::semantic_type_accessors::get_semantic_types_units(
                value("document")?,
                &module,
                &element,
                engine,
                ctx,
            )?
        }
        "extensions/setSemanticTypes" => {
            let module = field(request, "module")
                .and_then(as_utf16)
                .cloned()
                .unwrap_or_default();
            let element = field(request, "element")
                .and_then(as_utf16)
                .cloned()
                .unwrap_or_default();
            umf_core::semantic_type_accessors::set_semantic_types_units_optional(
                value("document")?,
                &module,
                &element,
                field(request, "annotation"),
                engine,
                ctx,
            )?
        }
        "model/selectCoreElements" => umf_core::selection::select_core_elements(
            value("source")?,
            value("query")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/selectCoreRelationships" => {
            umf_core::core_relationship_selection::select_core_relationships(
                value("source")?,
                value("query")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/inspectCoreCardinality" => {
            let (module, element) = cardinality_identity()?;
            umf_core::cardinality::inspect_core_cardinality(
                value("source")?,
                &umf_core::cardinality::Identity { module, element },
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/declareCoreCardinality" => {
            let (module, element) = cardinality_identity()?;
            umf_core::cardinality::declare_core_cardinality(
                value("source")?,
                &umf_core::cardinality::Identity { module, element },
                value("request")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/verifyCoreCardinalityDeclaration" => {
            umf_core::cardinality::verify_core_cardinality_declaration(
                value("receipt")?,
                value("current")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/admitCoreCardinalityRequest" => {
            umf_core::cardinality::admit_core_cardinality_request(value("request")?, ctx)?
        }
        "model/prepareCoreCardinalityVerification" => {
            umf_core::cardinality::prepare_core_cardinality_verification(
                value("receipt")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/finishCoreCardinalityVerification" => {
            umf_core::cardinality::finish_core_cardinality_verification(
                value("prepared")?,
                value("current")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/inspectCoreKind" => {
            let (module, element) = identity()?;
            umf_core::core_kind::inspect_core_kind(
                value("source")?,
                &umf_core::core_kind::Identity { module, element },
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/inspectCoreScalarType" => {
            umf_core::scalar_type_inspection::inspect_core_scalar_type(
                value("source")?,
                value("identity")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/inspectCoreRecordMembers" => {
            umf_core::record_members_inspection::inspect_core_record_members(
                value("source")?,
                value("identity")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/inspectCoreReferenceLinks" => {
            umf_core::reference_links_inspection::inspect_core_reference_links(
                value("source")?,
                value("identity")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/declareCoreKind" => {
            let (module, element) = identity()?;
            let kind = as_utf16(value("kind")?)
                .and_then(|x| x.to_utf8().ok())
                .ok_or_else(|| fail("REQUEST", "kind must be a string"))?;
            umf_core::core_kind::declare_core_kind(
                value("source")?,
                &umf_core::core_kind::Identity { module, element },
                &kind,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/verifyCoreKindDeclaration" => umf_core::core_kind::verify_core_kind_declaration(
            value("receipt")?,
            value("current")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/declareCoreRecordType" => umf_core::core_record_type::declare_core_record_type(
            value("fieldAuthor")?,
            value("recordAuthor")?,
            engine,
            registry,
            capabilities,
            ctx,
        )?,
        "model/verifyCoreRecordTypeDeclaration" => {
            umf_core::core_record_type::verify_core_record_type_declaration(
                value("receipt")?,
                value("current")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/inspectCoreNullability" => {
            let (module, element) = identity()?;
            umf_core::nullability::inspect_core_nullability(
                value("source")?,
                &umf_core::nullability::Identity { module, element },
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/declareCoreNullability" => {
            let (module, element) = identity()?;
            let nullability = as_utf16(value("nullability")?)
                .and_then(|x| x.to_utf8().ok())
                .ok_or_else(|| fail("REQUEST", "nullability must be a string"))?;
            umf_core::nullability::declare_core_nullability(
                value("source")?,
                &umf_core::nullability::Identity { module, element },
                &nullability,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        "model/verifyCoreNullabilityDeclaration" => {
            umf_core::nullability::verify_core_nullability_declaration(
                value("receipt")?,
                value("current")?,
                engine,
                registry,
                capabilities,
                ctx,
            )?
        }
        _ => return Err(fail("REQUEST", "Unknown core model operation")),
    };
    Ok(result)
}

fn key_tuple_profile(options: Option<&Value>) -> Option<String> {
    options.map(|options| match options {
        Value::Object(fields) if fields.len() == 1 && fields[0].0 == Utf16::from("profile") => {
            as_utf16(&fields[0].1)
                .and_then(|text| text.to_utf8().ok())
                .unwrap_or_else(|| "<invalid-profile>".to_owned())
        }
        _ => "<invalid-profile>".to_owned(),
    })
}

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let key = Utf16::from(name);
    match value {
        Value::Object(members) => members
            .iter()
            .find(|(k, _)| *k == key)
            .map(|(_, value)| value),
        _ => None,
    }
}
fn has_exact_members(value: &Value, expected: &[&str]) -> bool {
    let Value::Object(members) = value else {
        return false;
    };
    members.len() == expected.len()
        && expected
            .iter()
            .all(|name| members.iter().any(|(key, _)| key == &Utf16::from(*name)))
}
fn as_utf16(value: &Value) -> Option<&Utf16> {
    match value {
        Value::String(s) => Some(s),
        _ => None,
    }
}
fn take_field(value: &mut Value, name: &str) -> Option<Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    let key = Utf16::from(name);
    fields
        .iter()
        .position(|(candidate, _)| candidate == &key)
        .map(|index| fields.remove(index).1)
}
fn format_field(value: &Value) -> Result<Format, EngineError> {
    match field(value, "format")
        .and_then(as_utf16)
        .and_then(|s| s.to_utf8().ok())
        .as_deref()
    {
        Some("json") => Ok(Format::Json),
        Some("yaml") => Ok(Format::Yaml),
        _ => Err(fail("REQUEST", "Format must be json or yaml")),
    }
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn validation_value(validation: umf_core::Validation) -> Value {
    Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(validation.valid)),
        (Utf16::from("complete"), Value::Bool(validation.complete)),
        (
            Utf16::from("diagnostics"),
            Value::Array(
                validation
                    .diagnostics
                    .into_iter()
                    .map(|item| diagnostic_value(item))
                    .collect(),
            ),
        ),
    ])
}
fn diagnostic_value(item: Diagnostic) -> Value {
    Value::Object(vec![
        (Utf16::from("code"), Value::String(item.code)),
        (Utf16::from("path"), Value::String(item.path)),
        (Utf16::from("message"), Value::String(item.message)),
        (
            Utf16::from("severity"),
            Value::string_utf8(if item.severity == Severity::Warning {
                "warning"
            } else {
                "error"
            }),
        ),
    ])
}

fn fail(code: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, Utf16::default(), message.into())
}

/// Bound transport allocation and charge its token work before serde builds the tree.
/// The scanner deliberately accepts no syntax; serde remains the parser authority.
#[cfg(test)]
mod tests {
    use super::*;

    fn comparison_request(fields: Vec<(&str, Value)>) -> String {
        let request = Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        );
        encode(&request, &mut Context::ordinary()).unwrap()
    }

    fn numeric_request(fields: Vec<(&str, Value)>) -> String {
        let request = Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        );
        encode(&request, &mut Context::ordinary()).unwrap()
    }

    #[test]
    fn javascript_numeric_direct_wire_rejects_forged_stage_payload() {
        let request = numeric_request(vec![
            (
                "profile",
                Value::string_utf8("umf.javascript-numeric/1.0.0"),
            ),
            ("op", Value::string_utf8("validateJavascriptNumericContext")),
            ("literal", numeric_carrier("decimalToken", "1.2300e+2")),
            ("result", Value::String(Utf16::from("forged"))),
        ]);
        let envelope: serde_json::Value =
            serde_json::from_str(&execute_javascript_numeric_wire(&request)).unwrap();
        assert_eq!(envelope["status"], "error");
        assert_eq!(envelope["code"], "REQUEST");
    }

    #[test]
    fn document_comparison_is_resource_free_and_preserves_ordered_wire_values() {
        let before = Value::Object(vec![
            (Utf16::from("z"), Value::Number(1.)),
            (Utf16::from("__proto__"), Value::string_utf8("old")),
        ]);
        let after = Value::Object(vec![
            (Utf16::from("z"), Value::Number(2.)),
            (Utf16::from("__proto__"), Value::string_utf8("new")),
        ]);
        let request = comparison_request(vec![
            ("profile", Value::string_utf8(DOCUMENT_COMPARISON_PROFILE)),
            ("before", before),
            ("after", after),
        ]);
        let envelope: serde_json::Value =
            serde_json::from_str(&execute_document_comparison_wire(&request)).unwrap();
        assert_eq!(envelope["status"], "ok");
        let result: Value =
            decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
        let expected = Value::Array(vec![
            Value::Object(vec![
                (Utf16::from("path"), Value::string_utf8("/z")),
                (Utf16::from("status"), Value::string_utf8("changed")),
                (Utf16::from("before"), Value::Number(1.)),
                (Utf16::from("after"), Value::Number(2.)),
            ]),
            Value::Object(vec![
                (Utf16::from("path"), Value::string_utf8("/__proto__")),
                (Utf16::from("status"), Value::string_utf8("changed")),
                (Utf16::from("before"), Value::string_utf8("old")),
                (Utf16::from("after"), Value::string_utf8("new")),
            ]),
        ]);
        assert_eq!(result, expected);
    }

    #[test]
    fn document_comparison_freezes_profile_and_required_field_failure_order() {
        let wrong = comparison_request(vec![("profile", Value::string_utf8("wrong"))]);
        let envelope: serde_json::Value =
            serde_json::from_str(&execute_document_comparison_wire(&wrong)).unwrap();
        assert_eq!(envelope["code"], "REQUEST");
        assert_eq!(
            envelope["messageUnits"],
            serde_json::json!(
                "umf.schema-comparison/1 profile is required"
                    .encode_utf16()
                    .collect::<Vec<_>>()
            )
        );

        let profile = Value::string_utf8(DOCUMENT_COMPARISON_PROFILE);
        let missing_both = comparison_request(vec![("profile", profile.clone())]);
        let envelope: serde_json::Value =
            serde_json::from_str(&execute_document_comparison_wire(&missing_both)).unwrap();
        assert_eq!(
            envelope["messageUnits"],
            serde_json::json!(
                "Before value is required"
                    .encode_utf16()
                    .collect::<Vec<_>>()
            )
        );
        let missing_after = comparison_request(vec![("profile", profile), ("before", Value::Null)]);
        let envelope: serde_json::Value =
            serde_json::from_str(&execute_document_comparison_wire(&missing_after)).unwrap();
        assert_eq!(
            envelope["messageUnits"],
            serde_json::json!("After value is required".encode_utf16().collect::<Vec<_>>())
        );
    }

    #[test]
    fn document_comparison_obeys_host_work_control() {
        let request = comparison_request(vec![
            ("profile", Value::string_utf8(DOCUMENT_COMPARISON_PROFILE)),
            ("before", Value::Null),
            ("after", Value::Bool(true)),
        ]);
        let mut calls = 0usize;
        let mut control = |amount| {
            calls += amount;
            if calls > 2 {
                Err(EngineError::new(
                    "TEST_BUDGET",
                    Utf16::default(),
                    "work refused",
                ))
            } else {
                Ok(())
            }
        };
        let envelope: serde_json::Value = serde_json::from_str(
            &execute_document_comparison_wire_with_control(&request, &mut control),
        )
        .unwrap();
        assert_eq!(envelope["status"], "error");
        assert_eq!(envelope["code"], "TEST_BUDGET");
    }

    struct BaselineCapabilities {
        enabled: bool,
    }

    impl umf_core::Capabilities for BaselineCapabilities {
        fn validate_extension(
            &mut self,
            token: u64,
            payload: &Value,
            context: &umf_core::SemanticContext,
        ) -> Result<Vec<umf_core::Diagnostic>, Utf16> {
            if !self.enabled || token == 0 {
                return Err(Utf16::from(
                    "No native callback capability is registered for this token",
                ));
            }
            let id = field(&context.document, "id")
                .and_then(as_utf16)
                .and_then(|value| value.to_utf8().ok())
                .unwrap_or_default();
            let kind = field(payload, "kind")
                .and_then(as_utf16)
                .and_then(|value| value.to_utf8().ok())
                .unwrap_or_default();
            let mut message = id.encode_utf16().collect::<Vec<_>>();
            message.push(b':' as u16);
            message.extend(context.scope.encode_utf16());
            message.push(b':' as u16);
            message.extend(kind.encode_utf16());
            Ok(vec![umf_core::Diagnostic {
                code: Utf16::from("BASELINE_CALLBACK"),
                path: context.path.clone(),
                python_source_path: false,
                message: Utf16::new(message),
                severity: umf_core::Severity::Warning,
                python_text_origin: None,
            }])
        }
    }

    fn parse_wire_source(source: &str, ctx: &mut Context<'_>) -> Value {
        umf_core::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            umf_core::serialization::Format::Json,
            ctx,
        )
        .unwrap()
    }

    fn sorted_object_members(value: &Value) -> Value {
        match value {
            Value::Array(items) => Value::Array(items.iter().map(sorted_object_members).collect()),
            Value::Object(members) => {
                let mut members = members
                    .iter()
                    .map(|(key, value)| (key.clone(), sorted_object_members(value)))
                    .collect::<Vec<_>>();
                members.sort_by(|(left, _), (right, _)| left.cmp(right));
                Value::Object(members)
            }
            other => other.clone(),
        }
    }

    #[test]
    fn retained_engine_dispatch_rejects_resource_substitution() {
        let mut catalog = Context::catalog();
        let resources = object(vec![
            ("coreSchema", parse_wire_source(include_str!("../../../spec/core/schema.json"), &mut catalog)),
            ("referenceSchema", parse_wire_source(include_str!("../../../spec/core/semantic-type-reference.schema.json"), &mut catalog)),
            ("packageSchema", parse_wire_source(include_str!("../../../spec/core/extension-package.schema.json"), &mut catalog)),
            ("constraints", parse_wire_source(include_str!("../../../spec/metamodel/generated/core-constraints.json"), &mut catalog)),
            ("domainPolicy", parse_wire_source(include_str!("../../../spec/metamodel/generated/domain-policy.json"), &mut catalog)),
        ]);
        let mut admitted = resources.clone();
        let engine = catalog.with_catalog_value_limit(|ctx| Engine::new(ResourceSet::new(
            take_field(&mut admitted, "coreSchema").unwrap(),
            take_field(&mut admitted, "referenceSchema").unwrap(),
            take_field(&mut admitted, "packageSchema").unwrap(),
            take_field(&mut admitted, "constraints").unwrap(),
            take_field(&mut admitted, "domainPolicy").unwrap(),
        ), ctx)).unwrap();
        let mut substituted = resources;
        if let Value::Object(members) = &mut substituted {
            members.iter_mut().find(|(key, _)| key == &Utf16::from("coreSchema")).unwrap().1 = Value::Bool(false);
        }
        let request = comparison_request(vec![
            ("op", Value::String(Utf16::from("model/inspectCoreKind"))),
            ("resources", substituted),
            ("registry", Value::Array(vec![])),
            ("source", object(vec![("modules", Value::Array(vec![]))])),
            ("identity", object(vec![("module", Value::String(Utf16::from("m"))), ("element", Value::String(Utf16::from("e")))])),
        ]);
        let mut capabilities = NumericNoCapabilities;
        let response = execute_request_with_engine_and_control(
            &request, ResourceProfile::Cooperative, &mut capabilities, &mut |_| Ok(()), Some(&engine),
        );
        let envelope: serde_json::Value = serde_json::from_str(&response).unwrap();
        assert_eq!(envelope["status"], "error");
        assert_eq!(envelope["code"], "REQUEST");
    }

    #[test]
    fn production_request_dispatcher_matches_all_frozen_139_vectors() {
        let mut catalog = Context::catalog();
        let fixture = parse_wire_source(
            include_str!(
                "../../../docs/helix/04-build/evidence/rust-migration/r2/baseline-current-conformance.json"
            ),
            &mut catalog,
        );
        let resources = Value::Object(vec![
            (
                Utf16::from("coreSchema"),
                parse_wire_source(include_str!("../../../spec/core/schema.json"), &mut catalog),
            ),
            (
                Utf16::from("referenceSchema"),
                parse_wire_source(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    &mut catalog,
                ),
            ),
            (
                Utf16::from("packageSchema"),
                parse_wire_source(
                    include_str!("../../../spec/core/extension-package.schema.json"),
                    &mut catalog,
                ),
            ),
            (
                Utf16::from("constraints"),
                parse_wire_source(
                    include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                    &mut catalog,
                ),
            ),
            (
                Utf16::from("domainPolicy"),
                parse_wire_source(
                    include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                    &mut catalog,
                ),
            ),
        ]);
        let Value::Array(cases) = field(&fixture, "cases").expect("case array") else {
            panic!("frozen case array expected")
        };
        assert_eq!(cases.len(), 139);

        let mut capabilities = BaselineCapabilities { enabled: true };
        for case in cases {
            let mut members = vec![
                (Utf16::from("op"), Value::string_utf8("validate")),
                (Utf16::from("resources"), resources.clone()),
                (
                    Utf16::from("document"),
                    field(case, "document").expect("case document").clone(),
                ),
            ];
            if let Some(registry) = field(case, "registry") {
                let extension = Value::Object(vec![
                    (Utf16::from("id"), field(registry, "id").unwrap().clone()),
                    (
                        Utf16::from("version"),
                        field(registry, "version").unwrap().clone(),
                    ),
                    (
                        Utf16::from("scopes"),
                        Value::Array(vec![field(registry, "scope").unwrap().clone()]),
                    ),
                    (Utf16::from("schema"), Value::Bool(true)),
                    (Utf16::from("semantic"), Value::Bool(true)),
                ]);
                members.push((Utf16::from("registry"), Value::Array(vec![extension])));
            }
            let request = Value::Object(members);
            let wire = encode(&request, &mut transport_context()).unwrap();
            let envelope: serde_json::Value = serde_json::from_str(&execute_request(
                &wire,
                ResourceProfile::Cooperative,
                &mut capabilities,
            ))
            .unwrap();
            assert_eq!(
                envelope["status"],
                "ok",
                "case {}",
                as_utf16(field(case, "id").unwrap())
                    .unwrap()
                    .to_utf8()
                    .unwrap()
            );
            let result_wire = envelope["wire"].as_str().expect("result wire");
            let actual = decode(result_wire, &mut transport_context()).unwrap();
            let expected = Value::Object(vec![
                (Utf16::from("valid"), field(case, "valid").unwrap().clone()),
                (
                    Utf16::from("complete"),
                    field(case, "complete").unwrap().clone(),
                ),
                (
                    Utf16::from("diagnostics"),
                    field(case, "diagnostics").unwrap().clone(),
                ),
            ]);
            assert_eq!(
                sorted_object_members(&actual),
                sorted_object_members(&expected),
                "case {}",
                as_utf16(field(case, "id").unwrap())
                    .unwrap()
                    .to_utf8()
                    .unwrap()
            );
        }
    }

    #[test]
    fn preserves_member_order_and_accepts_member_field_order_independently() {
        let source = r#"{"kind":"object","members":[{"value":{"kind":"number","bits":"3ff0000000000000"},"key":[98]},{"key":[97],"value":{"kind":"string","units":[55296]}}]}"#;
        let mut ctx = Context::ordinary();
        let value = decode(source, &mut ctx).unwrap();
        let roundtrip = decode(
            &encode(&value, &mut Context::ordinary()).unwrap(),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(roundtrip, value);
        let Value::Object(members) = value else {
            panic!("object expected")
        };
        assert_eq!(
            members
                .iter()
                .map(|(key, _)| key.units()[0])
                .collect::<Vec<_>>(),
            [98, 97]
        );
        assert_eq!(members[1].1, Value::String(Utf16::new(vec![0xd800])));
    }

    #[test]
    fn bounded_iterative_transport_preserves_semantic_depth_128_and_rejects_129() {
        fn nested_array(depth: usize) -> String {
            format!(
                "{}{{\"kind\":\"null\"}}{}",
                "{\"kind\":\"array\",\"items\":[".repeat(depth),
                "]}".repeat(depth)
            )
        }
        let at_limit = nested_array(128);
        let mut ctx = Context::ordinary();
        let decoded = decode(&at_limit, &mut ctx).expect("semantic depth 128 is supported");
        let encoded =
            encode(&decoded, &mut Context::ordinary()).expect("semantic depth 128 can be encoded");
        assert_eq!(decode(&encoded, &mut Context::ordinary()).unwrap(), decoded);
        let Value::Array(mut child) = decoded else {
            panic!("nested array expected")
        };
        for _ in 0..127 {
            let Some(Value::Array(items)) = child.into_iter().next() else {
                panic!("nested array expected")
            };
            child = items;
        }
        assert_eq!(child, [Value::Null]);

        let above_limit = nested_array(129);
        let error = decode(&above_limit, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "LIMIT");
    }

    #[test]
    fn encoding_charges_exact_transport_before_reserving_output() {
        let value = Value::String(Utf16::new(vec![b'a' as u16; 10_000]));
        let expected_size = encode(&value, &mut Context::ordinary()).unwrap().len();
        let mut denied_output_charge = false;
        let mut meter = |amount| {
            if amount == expected_size {
                denied_output_charge = true;
                Err(EngineError::new(
                    "OUTPUT_PREALLOCATION",
                    Utf16::default(),
                    "denied before wire output allocation",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = encode(&value, &mut ctx).unwrap_err();
        assert_eq!(error.code, "OUTPUT_PREALLOCATION");
        assert!(
            denied_output_charge,
            "the exact tagged output size must be charged before the writer reserves it"
        );
    }

    #[test]
    fn rejects_duplicate_unknown_and_malformed_transport_fields() {
        for source in [
            r#"{"kind":"null","kind":"null"}"#,
            r#"{"kind":"null","extra":1}"#,
            r#"{"kind":"number","bits":"8000000000000000"}"#,
            r#"{"kind":"object","members":[{"key":[97],"value":{"kind":"null"}},{"key":[97],"value":{"kind":"null"}}]}"#,
        ] {
            assert!(
                decode(source, &mut Context::ordinary()).is_err(),
                "accepted {source}"
            );
        }
    }

    #[test]
    fn closed_error_envelope_preserves_utf16_path_and_message_units() {
        let error = EngineError::new(
            "HOST_ERROR",
            Utf16::new(vec![b'/' as u16, 0xd800]),
            Utf16::new(vec![b'c' as u16, 0xdc00]),
        );
        let envelope: serde_json::Value = serde_json::from_str(&error_envelope(error)).unwrap();
        assert_eq!(envelope["profile"], "umf.core-wire/1");
        assert_eq!(envelope["status"], "error");
        assert_eq!(envelope["pathUnits"], serde_json::json!([47, 55296]));
        assert_eq!(envelope["messageUnits"], serde_json::json!([99, 56320]));
    }

    #[test]
    fn callback_snapshot_charges_operation_context_before_encoding() {
        let payload = Value::Object(vec![(
            Utf16::from("large"),
            Value::String(Utf16::from("payload")),
        )]);
        let document = Value::Object(vec![(
            Utf16::from("large"),
            Value::String(Utf16::from("document")),
        )]);
        let mut charges = 0usize;
        let mut control = |amount| {
            charges += amount;
            if charges > 1 {
                Err(EngineError::new(
                    "TEST_BUDGET",
                    Utf16::default(),
                    "callback copy charged",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_host_control(&mut control);
        let error = encode_callback_request(
            &payload,
            &document,
            &Utf16::from("/ext"),
            "document",
            &mut ctx,
        )
        .unwrap_err();
        assert_eq!(error.code, "TEST_BUDGET");
        assert!(charges > 0);
    }

    #[test]
    fn callback_paths_and_scopes_are_metered_work_not_source_text() {
        const LENGTH: usize = 4_000_001;
        let payload = Value::Null;
        let document = Value::Null;
        let path = Utf16::new(vec![b'p' as u16; LENGTH]);
        let mut ctx = Context::ordinary();
        let encoded = encode_callback_request(&payload, &document, &path, "x", &mut ctx).unwrap();
        assert!(encoded.len() > LENGTH);
        drop(encoded);

        let scope = "s".repeat(LENGTH);
        let mut ctx = Context::ordinary();
        let encoded =
            encode_callback_request(&payload, &document, &Utf16::from("/"), &scope, &mut ctx)
                .unwrap();
        assert!(encoded.len() > LENGTH);
        drop(encoded);

        let mut control = |amount| {
            if amount >= LENGTH {
                Err(EngineError::new(
                    "TEST_BUDGET",
                    Utf16::default(),
                    "callback path work denied",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_host_control(&mut control);
        let error = encode_callback_request(&payload, &document, &path, "x", &mut ctx).unwrap_err();
        assert_eq!(error.code, "TEST_BUDGET");
    }
}
pub mod gregorian_date_binding;

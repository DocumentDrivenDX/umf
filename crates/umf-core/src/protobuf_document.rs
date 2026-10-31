// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in Protobuf descriptor/document operations over the portable codec.
//!
//! This slice imports and exports descriptor sets and recovers copied UMF
//! documents. It does not invoke a source compiler or edit source archives.

use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    protobuf_descriptor, protobuf_inspect,
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const EXT: &str = "umf.protobuf";
const PROFILE: &str = "protobuf-es-2.15.0";
const VERSION: &str = "0.1.0";

struct NoExtensionCapabilities;
impl Capabilities for NoExtensionCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

/// Native bundle values retain binary bytes and the independently copied source.
pub struct ProtobufBundle {
    pub descriptor_set: Vec<u8>,
    pub source: Value,
    pub diagnostics: Vec<Diagnostic>,
}

/// Construct a UMF document from a binary FileDescriptorSet.
pub fn import_descriptor_set(
    bytes: &[u8],
    id: &str,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    context.charge_text(id.encode_utf16().count(), Utf16::from("/id"))?;
    let descriptor = protobuf_descriptor::read_descriptor_set(bytes, context)?;
    let payload = obj(vec![
        ("descriptorProfile", Value::string_utf8(PROFILE)),
        ("descriptorSet", descriptor),
    ]);
    let element = obj(vec![
        ("id", Value::string_utf8("schema")),
        ("extensions", obj(vec![(EXT, payload)])),
    ]);
    let module = obj(vec![
        ("id", Value::string_utf8("schema")),
        ("namespace", Value::string_utf8("")),
        ("elements", Value::Array(vec![element])),
    ]);
    let document = obj(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::string_utf8(id)),
        (
            "vocabularies",
            obj(vec![(
                EXT,
                obj(vec![("version", Value::string_utf8(VERSION))]),
            )]),
        ),
        ("modules", Value::Array(vec![module])),
    ]);
    let core = core_validation(&document, context)?;
    if !core.valid {
        return Err(invalid_document_error(core.diagnostics)?);
    }
    let result = protobuf_inspect::inspect_protobuf_document(&document, context)?;
    if !result.valid {
        return Err(error(
            "PROTOBUF_DOCUMENT",
            "Imported descriptor document failed inspection",
        ));
    }
    copy_json(&document, context)
}

/// Export a copied and validated descriptor set from an existing document.
pub fn export_descriptor_set(
    document: &Value,
    context: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let (payload, _) = payload(document, context)?;
    export_descriptor_payload(payload, context)
}

/// Encode a selected, already-copied Protobuf extension payload without
/// re-running containing-document validation. Host source export uses this
/// after its predecessor-ordered document inspection and payload admission.
pub fn export_descriptor_payload(
    payload: &Value,
    context: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    ensure_known_representation(payload)?;
    let fields = object(payload)
        .ok_or_else(|| error("PROTOBUF_PAYLOAD", "Expected Protobuf payload object"))?;
    let descriptor = get(fields, "descriptorSet")
        .ok_or_else(|| error("PROTOBUF_PAYLOAD", "Descriptor set is missing"))?;
    protobuf_descriptor::write_descriptor_set(descriptor, context)
}

/// Return an independent descriptor tree after inspecting the containing document.
pub fn get_descriptor_set(
    document: &Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (payload, _) = payload(document, context)?;
    let fields = object(payload)
        .ok_or_else(|| error("PROTOBUF_PAYLOAD", "Expected Protobuf payload object"))?;
    let descriptor = get(fields, "descriptorSet")
        .ok_or_else(|| error("PROTOBUF_PAYLOAD", "Descriptor set is missing"))?;
    copy_json(descriptor, context)
}

/// Recover a copied source document beside its descriptor bytes and inspection findings.
pub fn export_bundle(
    document: &Value,
    context: &mut Context<'_>,
) -> Result<ProtobufBundle, EngineError> {
    let descriptor_set = export_descriptor_set(document, context)?;
    let source = copy_json(document, context)?;
    let inspection = protobuf_inspect::inspect_protobuf_document(document, context)?;
    let mut diagnostics = inspection.diagnostics;
    diagnostics.push(Diagnostic {
        code: Utf16::from("SOURCE_ARTIFACT_REQUIRED"),
        path: Utf16::default(),
        python_source_path: false,
        message: Utf16::from(
            "Retain source UMF to recover unrelated vocabularies and representation context",
        ),
        severity: Severity::Warning,
        python_text_origin: None,
    });
    Ok(ProtobufBundle {
        descriptor_set,
        source,
        diagnostics,
    })
}

pub fn inspect(document: &Value, context: &mut Context<'_>) -> Result<Validation, EngineError> {
    let core = core_validation(document, context)?;
    if !core.valid {
        return Ok(core);
    }
    protobuf_inspect::inspect_protobuf_document(document, context)
}

/// Run the same embedded core document validation used by the JSON Schema
/// adapter before interpreting the Protobuf extension envelope.
fn core_validation(document: &Value, context: &mut Context<'_>) -> Result<Validation, EngineError> {
    fn resource(text: &str, context: &mut Context<'_>) -> Result<Value, EngineError> {
        context.charge_text(text.encode_utf16().count(), Utf16::default())?;
        serialization::read_json_value(
            &text.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            context,
        )
    }
    let engine = Engine::new(
        ResourceSet::new(
            resource(include_str!("../../../spec/core/schema.json"), context)?,
            resource(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                context,
            )?,
            resource(
                include_str!("../../../spec/core/extension-package.schema.json"),
                context,
            )?,
            resource(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                context,
            )?,
            resource(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                context,
            )?,
        ),
        context,
    )?;
    engine.validate_document(
        document,
        &Registry::new(),
        &mut NoExtensionCapabilities,
        context,
    )
}

fn payload<'a>(
    document: &'a Value,
    context: &mut Context<'_>,
) -> Result<(&'a Value, Utf16), EngineError> {
    let core = core_validation(document, context)?;
    if !core.valid {
        return Err(invalid_document_error(core.diagnostics)?);
    }
    let root = object(document)
        .ok_or_else(|| error("PROTOBUF_DOCUMENT", "Expected UMF document object"))?;
    let vocabs = object(
        get(root, "vocabularies")
            .ok_or_else(|| error("PROTOBUF_DOCUMENT", "Document vocabularies are unavailable"))?,
    )
    .ok_or_else(|| {
        error(
            "PROTOBUF_DOCUMENT",
            "Document vocabularies must be an object",
        )
    })?;
    let version = object(get(vocabs, EXT).ok_or_else(|| {
        error(
            "PROTOBUF_PAYLOAD",
            "Expected umf.protobuf vocabulary version 0.1.0",
        )
    })?)
    .and_then(|v| get(v, "version"));
    if version != Some(&Value::string_utf8(VERSION)) {
        return Err(error(
            "PROTOBUF_PAYLOAD",
            "Expected umf.protobuf vocabulary version 0.1.0",
        ));
    }
    let modules = array(
        get(root, "modules")
            .ok_or_else(|| error("PROTOBUF_DOCUMENT", "Document modules are unavailable"))?,
    )
    .ok_or_else(|| error("PROTOBUF_DOCUMENT", "Document modules must be an array"))?;
    for (mi, module) in modules.iter().enumerate() {
        context.charge_work(1, Utf16::default())?;
        let Some(m) = object(module) else { continue };
        if get(m, "id") != Some(&Value::string_utf8("schema")) {
            continue;
        }
        let Some(elements) = get(m, "elements").and_then(array) else {
            continue;
        };
        for (ei, element) in elements.iter().enumerate() {
            context.charge_work(1, Utf16::default())?;
            let Some(e) = object(element) else { continue };
            if get(e, "id") != Some(&Value::string_utf8("schema")) {
                continue;
            }
            if let Some(p) = get(e, "extensions")
                .and_then(object)
                .and_then(|x| get(x, EXT))
            {
                let result = protobuf_inspect::inspect_protobuf_document(document, context)?;
                if !result.valid {
                    return Err(error("PROTOBUF_DOCUMENT", "Protobuf document is invalid"));
                }
                return Ok((
                    p,
                    Utf16::from(format!("/modules/{mi}/elements/{ei}/extensions/{EXT}")),
                ));
            }
        }
    }
    Err(error(
        "PROTOBUF_PAYLOAD",
        "Schema element has no umf.protobuf payload",
    ))
}

fn ensure_known_representation(payload: &Value) -> Result<(), EngineError> {
    let fields = object(payload)
        .ok_or_else(|| error("PROTOBUF_PAYLOAD", "Expected Protobuf payload object"))?;
    for (key, _) in fields {
        if !matches!(
            key.to_utf8().ok().as_deref(),
            Some("descriptorProfile" | "descriptorSet" | "sourceArchive")
        ) {
            return Err(error(
                "PROTOBUF_REPRESENTATION",
                "Unknown representation field cannot be discarded",
            ));
        }
    }
    if let Some(archive) = get(fields, "sourceArchive") {
        let archive = object(archive)
            .ok_or_else(|| error("PROTOBUF_SOURCE_ARCHIVE", "Malformed source archive"))?;
        for (key, _) in archive {
            if !matches!(
                key.to_utf8().ok().as_deref(),
                Some("role" | "compiler" | "files" | "roots")
            ) {
                return Err(error(
                    "PROTOBUF_REPRESENTATION",
                    "Unknown source archive field cannot be discarded",
                ));
            }
        }
    }
    Ok(())
}
fn obj(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn object(value: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(v) = value {
        Some(v)
    } else {
        None
    }
}
fn array(value: &Value) -> Option<&[Value]> {
    if let Value::Array(v) = value {
        Some(v)
    } else {
        None
    }
}
fn get<'a>(fields: &'a [(Utf16, Value)], key: &str) -> Option<&'a Value> {
    fields
        .iter()
        .find(|(k, _)| k.to_utf8().is_ok_and(|s| s == key))
        .map(|(_, v)| v)
}
fn error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn invalid_document_error(diagnostics: Vec<Diagnostic>) -> Result<EngineError, EngineError> {
    let value = Value::Array(
        diagnostics
            .into_iter()
            .map(|item| {
                obj(vec![
                    ("code", Value::String(item.code)),
                    ("path", Value::String(item.path)),
                    ("message", Value::String(item.message)),
                    (
                        "severity",
                        Value::string_utf8(if item.severity == Severity::Warning {
                            "warning"
                        } else {
                            "error"
                        }),
                    ),
                ])
            })
            .collect(),
    );
    let message = serialization::stringify_compact(&value)?
        .to_utf8()
        .map_err(|_| error("PROTOBUF_DOCUMENT", "Document diagnostics are not UTF-8"))?;
    Ok(error("PROTOBUF_DOCUMENT", &message))
}
